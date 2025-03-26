import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertGameSetSchema, games, checkins, users, gameSets, gamePlayers } from "@shared/schema";
import { populateGame, movePlayer } from "./game-logic/game-population";
import { MoveType } from "./game-logic/types";
import { db } from "./db";
import { eq, and, sql, asc } from "drizzle-orm";
import { cleanupDuplicateCheckins } from "./cleanup";
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Executes a scootd command and returns the result
 * @param command The scootd command to execute
 * @returns The command output (stdout)
 */
async function executeScootd(command: string): Promise<string> {
  try {
    console.log(`Executing scootd command: ${command}`);
    const { stdout, stderr } = await execAsync(`./scootd ${command}`);
    
    if (stderr) {
      console.error(`scootd stderr: ${stderr}`);
    }
    
    return stdout;
  } catch (error) {
    console.error(`Error executing scootd command: ${error}`);
    throw error;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.user!.isEngineer && !req.user!.isRoot) return res.sendStatus(403);
    const users = await storage.getAllUsers();
    res.json(users);
  });

  app.patch("/api/users/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.user!.isEngineer && !req.user!.isRoot) return res.sendStatus(403);

    const userId = parseInt(req.params.id);
    const user = await storage.updateUser(userId, req.body);
    res.json(user);
  });

  app.get("/api/checkins", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const checkinsData = await storage.getCheckins(34);

    // Get complete user data for each checkin
    const checkinsWithUserData = await Promise.all(
      checkinsData.map(async (checkin) => {
        const user = await storage.getUser(checkin.userId);
        return {
          ...checkin,
          birthYear: user?.birthYear
        };
      })
    );

    res.json(checkinsWithUserData);
  });

  app.post("/api/checkins", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Only prevent duplicate check-ins if the user is checking themselves in
    if (!req.user!.isEngineer && !req.user!.isRoot) {
      const existingCheckins = await storage.getCheckins(34);
      const userAlreadyCheckedIn = existingCheckins.some(
        checkin => checkin.userId === req.user!.id
      );

      if (userAlreadyCheckedIn) {
        return res.status(400).send("You are already checked in for today");
      }
    }

    const userId = req.user!.isEngineer || req.user!.isRoot ? req.body.userId : req.user!.id;
    const checkin = await storage.createCheckin(userId, 34);
    res.json(checkin);
  });

  app.post("/api/checkins/clear", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.user!.isEngineer && !req.user!.isRoot) return res.sendStatus(403);

    try {
      // Get all active checkins
      const checkinsData = await storage.getCheckins(34);

      console.log('POST /api/checkins/clear - Deactivating checkins:', 
        checkinsData.map(c => ({ id: c.id, userId: c.userId, username: c.username }))
      );

      // Deactivate all checkins
      for (const checkin of checkinsData) {
        await storage.deactivateCheckin(checkin.id);
      }

      console.log('POST /api/checkins/clear - Successfully deactivated all checkins');
      res.sendStatus(200);
    } catch (error) {
      console.error('POST /api/checkins/clear - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/checkins/check-in-all", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.user!.isEngineer && !req.user!.isRoot) return res.sendStatus(403);

    try {
      // Get all players (users with isPlayer flag)
      const players = await db
        .select()
        .from(users)
        .where(eq(users.isPlayer, true));

      console.log('POST /api/checkins/check-in-all - Found players:', players);

      // Get active game set
      const activeGameSet = await storage.getActiveGameSet();
      if (!activeGameSet) {
        return res.status(400).json({ error: "No active game set available for check-ins" });
      }

      // Create checkins for each player
      for (const player of players) {
        try {
          console.log(`Attempting to create checkin for player ${player.username}`);
          await storage.createCheckin(player.id, 34);
        } catch (error) {
          console.error(`Failed to check in player ${player.username}:`, error);
          // Continue with next player even if one fails
        }
      }

      console.log('Check-in all completed successfully');
      res.sendStatus(200);
    } catch (error) {
      console.error('POST /api/checkins/check-in-all - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/games", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.user!.isEngineer) return res.sendStatus(403);

    try {
      console.log('POST /api/games - Request body:', req.body);

      if (!req.body.setId) {
        console.error('POST /api/games - Missing setId in request');
        return res.status(400).send("Missing setId");
      }

      // Create the game
      const game = await storage.createGame(
        req.body.setId,
        req.body.court || 'West',
        'started'  // Set initial state
      );

      console.log('POST /api/games - Created game:', game);

      // Create player associations if provided
      if (req.body.players && Array.isArray(req.body.players)) {
        // Get active game set to get players per team
        const activeGameSet = await storage.getActiveGameSet();
        if (!activeGameSet) {
          throw new Error("No active game set available");
        }
        
        console.log('POST /api/games - Assigning players to teams with active game set:', {
          gameSetId: activeGameSet.id,
          playersPerTeam: activeGameSet.playersPerTeam,
          playerCount: req.body.players.length
        });
        
        // First update the checkins to set gameId and team
        for (const player of req.body.players) {
          // Find the active checkin for this user
          const [checkin] = await db
            .select()
            .from(checkins)
            .where(
              and(
                eq(checkins.userId, player.userId),
                eq(checkins.isActive, true),
                eq(checkins.gameSetId, activeGameSet.id)
              )
            );
            
          if (checkin) {
            console.log(`Updating checkin for player ${player.userId} to game ${game.id}, team ${player.team}`);
            await db
              .update(checkins)
              .set({
                gameId: game.id,
                team: player.team
              })
              .where(eq(checkins.id, checkin.id));
          }
          
          // Create game player record
          await storage.createGamePlayer(game.id, player.userId, player.team);
        }
      }

      // Fetch the complete game data with players
      const completeGame = await storage.getGame(game.id);
      res.json(completeGame);
    } catch (error) {
      console.error('POST /api/games - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.patch("/api/games/:id/score", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.user!.isEngineer) return res.sendStatus(403);

    try {
      const { team1Score, team2Score } = req.body;
      const gameId = parseInt(req.params.id);

      console.log(`PATCH /api/games/${gameId}/score - Processing score update:`, { team1Score, team2Score });

      // Get current active game set for logging
      const activeGameSet = await storage.getActiveGameSet();
      console.log("Active game set before score update:", activeGameSet);
      
      // Get game state before update for debugging
      const gameBeforeUpdate = await storage.getGame(gameId);
      console.log("Game state before score update:", {
        gameId,
        state: gameBeforeUpdate.state,
        players: gameBeforeUpdate.players.map(p => ({
          id: p.id,
          username: p.username,
          team: p.team,
          queuePosition: p.queuePosition
        }))
      });

      // Update game with scores and set state to 'final'
      const updatedGame = await storage.updateGameScore(gameId, team1Score, team2Score);
      
      // Get all active checkins after the update for debugging
      const activeCheckins = await db
        .select()
        .from(checkins)
        .where(eq(checkins.isActive, true))
        .orderBy(asc(checkins.queuePosition));
      
      console.log("Active checkins after game update:", activeCheckins.map(c => ({
        id: c.id,
        userId: c.userId,
        queuePosition: c.queuePosition,
        gameId: c.gameId,
        team: c.team,
        type: c.type
      })));
      
      res.json(updatedGame);
    } catch (error) {
      console.error('PATCH /api/games/:id/score - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/game-sets", async (req, res) => {
    console.log('POST /api/game-sets - Request received');
    if (!req.isAuthenticated()) {
      console.log('POST /api/game-sets - Unauthorized');
      return res.sendStatus(401);
    }
    if (!req.user!.isEngineer) {
      console.log('POST /api/game-sets - Forbidden');
      return res.sendStatus(403);
    }

    try {
      console.log('POST /api/game-sets - Request body:', req.body);
      const validatedData = insertGameSetSchema.parse(req.body);
      console.log('POST /api/game-sets - Validated data:', validatedData);
      const gameSet = await storage.createGameSet(req.user!.id, validatedData);
      console.log('POST /api/game-sets - Created game set:', gameSet);
      res.json(gameSet);
    } catch (error) {
      console.error('POST /api/game-sets - Error:', error);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/api/game-sets/active", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const gameSet = await storage.getActiveGameSet();
    res.json(gameSet || null);
  });

  app.get("/api/game-sets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const gameSets = await storage.getAllGameSets();
    res.json(gameSets);
  });

  app.post("/api/game-sets/:id/deactivate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.user!.isEngineer) return res.sendStatus(403);

    await storage.deactivateGameSet(parseInt(req.params.id));
    res.sendStatus(200);
  });

  app.get("/api/game-sets/:id/log", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const gameSetId = parseInt(req.params.id);
      const log = await storage.getGameSetLog(gameSetId);
      res.json(log);
    } catch (error) {
      console.error('GET /api/game-sets/:id/log - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/player-move", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.user!.isEngineer && !req.user!.isRoot) return res.sendStatus(403);

    const { playerId, moveType, setId } = req.body;

    try {
      console.log('POST /api/player-move - Request:', { playerId, moveType, setId });

      // Get player information before the move
      const user = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, playerId))
        .then(rows => rows[0]);

      if (!user) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Get current game state
      const gameState = await populateGame(setId);
      console.log('Current game state:', gameState);

      // Apply the move
      const result = movePlayer(gameState, playerId, moveType as MoveType);

      if (!result.success) {
        console.log('Move failed:', result.message);
        return res.status(400).json({ error: result.message });
      }

      // Handle the player move in storage - pass the moveType as is
      await storage.handlePlayerMove(playerId, moveType);
      console.log('Player move handled successfully');

      // Get information about the operation that was performed
      let operationDetails = {
        player: user.username,
        moveType: moveType,
        details: {}
      };

      // Return the new state with additional details about the operation
      res.json({
        ...result.updatedState,
        operation: operationDetails
      });
    } catch (error: any) {
      console.error('Player move failed:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/api/games/active", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Get active game set to know how many games to return
      const activeGameSet = await storage.getActiveGameSet();
      if (!activeGameSet) {
        return res.json([]);
      }

      // Get all games (both started and final) from the current game set
      const allGames = await db
        .select()
        .from(games)
        .where(
          and(
            sql`${games.state} IN ('started', 'final')`,
            eq(games.setId, activeGameSet.id)
          )
        );

      // Get complete game data with players for each game
      const gamesWithPlayers = await Promise.all(
        allGames.map(game => storage.getGame(game.id))
      );

      console.log('GET /api/games/active - Returning games:', gamesWithPlayers);
      res.json(gamesWithPlayers);
    } catch (error) {
      console.error('GET /api/games/active - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Add a new endpoint to clear the active game set
  app.post("/api/game-sets/clear", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.user!.isEngineer && !req.user!.isRoot) return res.sendStatus(403);

    try {
      // Deactivate all game sets
      await db
        .update(gameSets)
        .set({ isActive: false })
        .where(eq(gameSets.isActive, true));

      // Also clear all active checkins
      await db
        .update(checkins)
        .set({ isActive: false })
        .where(eq(checkins.isActive, true));

      res.sendStatus(200);
    } catch (error) {
      console.error('POST /api/game-sets/clear - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  // Add an endpoint to fix the currentQueuePosition for the active game set
  app.post("/api/game-sets/fix-queue-position", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.user!.isEngineer && !req.user!.isRoot) return res.sendStatus(403);
    
    try {
      // Find the active game set
      const activeGameSets = await db
        .select()
        .from(gameSets)
        .where(eq(gameSets.isActive, true))
        .limit(1);
      
      if (activeGameSets.length === 0) {
        return res.status(404).json({ error: "No active game set found" });
      }
      
      const activeGameSet = activeGameSets[0];
      
      // Reset the currentQueuePosition to 1
      await db
        .update(gameSets)
        .set({ currentQueuePosition: 1 })
        .where(eq(gameSets.id, activeGameSet.id));
      
      console.log(`Fixed queue position for game set ${activeGameSet.id}`);
      res.json({ message: "Queue position fixed", gameSetId: activeGameSet.id });
    } catch (error) {
      console.error('POST /api/game-sets/fix-queue-position - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // New endpoints using scootd
  app.get("/api/scootd/game-set-status/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const gameSetId = parseInt(req.params.id);
      const output = await executeScootd(`game-set-status ${gameSetId} json`);
      
      // Parse the output to extract just the JSON part (ignoring connection messages)
      const jsonStartIndex = output.indexOf('{');
      if (jsonStartIndex === -1) {
        throw new Error("Invalid output format from scootd");
      }
      
      const jsonStr = output.substring(jsonStartIndex);
      const data = JSON.parse(jsonStr);
      res.json(data);
    } catch (error) {
      console.error('GET /api/scootd/game-set-status/:id - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/scootd/checkin", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { gameSetId, userId } = req.body;
      
      if (!gameSetId || !userId) {
        return res.status(400).json({ error: "Missing gameSetId or userId" });
      }
      
      // Get username for logging/feedback
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Execute the scootd checkin command
      const output = await executeScootd(`checkin ${gameSetId} ${userId} json`);
      
      // Parse the output to extract just the JSON part
      const jsonStartIndex = output.indexOf('{');
      if (jsonStartIndex === -1) {
        // If there's no JSON in the response, format a success message
        return res.json({ 
          success: true, 
          message: `Player ${user.username} successfully checked in to game set ${gameSetId}`,
          raw: output
        });
      }
      
      const jsonStr = output.substring(jsonStartIndex);
      const data = JSON.parse(jsonStr);
      res.json(data);
    } catch (error) {
      console.error('POST /api/scootd/checkin - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/scootd/checkout", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { gameSetId, queuePosition, userId } = req.body;
      
      if (!gameSetId || !queuePosition || !userId) {
        return res.status(400).json({ 
          error: "Missing required parameters: gameSetId, queuePosition, userId" 
        });
      }
      
      // Execute the scootd checkout command
      const output = await executeScootd(`checkout ${gameSetId} ${queuePosition} ${userId} json`);
      
      // Parse the output to extract just the JSON part
      const jsonStartIndex = output.indexOf('{');
      if (jsonStartIndex === -1) {
        // For commands without JSON response, return the raw output
        return res.json({ success: true, raw: output });
      }
      
      const jsonStr = output.substring(jsonStartIndex);
      const data = JSON.parse(jsonStr);
      res.json(data);
    } catch (error) {
      console.error('POST /api/scootd/checkout - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/scootd/bump-player", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { gameSetId, queuePosition, userId } = req.body;
      
      if (!gameSetId || !queuePosition || !userId) {
        return res.status(400).json({ 
          error: "Missing required parameters: gameSetId, queuePosition, userId" 
        });
      }
      
      // Execute the scootd bump-player command
      const output = await executeScootd(`bump-player ${gameSetId} ${queuePosition} ${userId} json`);
      
      // Parse the output to extract just the JSON part
      const jsonStartIndex = output.indexOf('{');
      if (jsonStartIndex === -1) {
        // For commands without JSON response, return the raw output
        return res.json({ success: true, raw: output });
      }
      
      const jsonStr = output.substring(jsonStartIndex);
      const data = JSON.parse(jsonStr);
      res.json(data);
    } catch (error) {
      console.error('POST /api/scootd/bump-player - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/scootd/end-game", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      console.log('POST /api/scootd/end-game - Request body:', req.body);
      const { gameId, homeScore, awayScore, autoPromote } = req.body;
      
      if (!gameId || homeScore === undefined || awayScore === undefined) {
        console.log('POST /api/scootd/end-game - Missing required parameters:', { gameId, homeScore, awayScore });
        return res.status(400).json({ 
          error: "Missing required parameters: gameId, homeScore, awayScore" 
        });
      }
      
      // Construct the command, adding autoPromote if specified
      let command = `end-game ${gameId} ${homeScore} ${awayScore}`;
      if (autoPromote !== undefined) {
        command += ` ${autoPromote}`;
      }
      command += " json"; // Always get JSON response
      
      console.log('POST /api/scootd/end-game - Executing command:', command);
      
      // Execute the scootd end-game command
      const output = await executeScootd(command);
      console.log('POST /api/scootd/end-game - Raw output:', output);
      
      // Parse the output to extract just the JSON part
      const jsonStartIndex = output.indexOf('{');
      if (jsonStartIndex === -1) {
        // For commands without JSON response, return the raw output
        console.log('POST /api/scootd/end-game - No JSON found in output, returning raw output');
        return res.json({ success: true, raw: output });
      }
      
      const jsonStr = output.substring(jsonStartIndex);
      console.log('POST /api/scootd/end-game - JSON string:', jsonStr);
      
      try {
        const data = JSON.parse(jsonStr);
        console.log('POST /api/scootd/end-game - Parsed JSON response:', data);
        res.json(data);
      } catch (jsonError) {
        console.error('POST /api/scootd/end-game - Error parsing JSON:', jsonError);
        res.status(500).json({ error: 'Failed to parse scootd response' });
      }
    } catch (error) {
      console.error('POST /api/scootd/end-game - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/scootd/new-game", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { gameSetId, court } = req.body;
      
      if (!gameSetId || !court) {
        return res.status(400).json({ 
          error: "Missing required parameters: gameSetId, court" 
        });
      }
      
      // Execute the scootd propose-game command with create flag
      const output = await executeScootd(`propose-game ${gameSetId} ${court} json true`);
      
      // Parse the output to extract just the JSON part
      const jsonStartIndex = output.indexOf('{');
      if (jsonStartIndex === -1) {
        // For commands without JSON response, return the raw output
        return res.json({ success: true, raw: output });
      }
      
      const jsonStr = output.substring(jsonStartIndex);
      const data = JSON.parse(jsonStr);
      res.json(data);
    } catch (error) {
      console.error('POST /api/scootd/new-game - Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Add after the last endpoint
  app.post("/api/database/reset", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.user!.isEngineer && !req.user!.isRoot) return res.sendStatus(403);

    // Only allow in Replit environment
    if (!process.env.REPL_ID) {
      return res.status(403).send("This operation is only allowed in development environment");
    }

    try {
      console.log('Starting database reset...');

      // Delete all records except users
      console.log('Deleting game players...');
      const deletedGamePlayers = await db.delete(gamePlayers).returning();
      console.log(`Deleted ${deletedGamePlayers.length} game players`);

      console.log('Deleting checkins...');
      const deletedCheckins = await db.delete(checkins).returning();
      console.log(`Deleted ${deletedCheckins.length} checkins`);

      console.log('Deleting games...');
      const deletedGames = await db.delete(games).returning();
      console.log(`Deleted ${deletedGames.length} games`);

      console.log('Deleting game sets...');
      const deletedGameSets = await db.delete(gameSets).returning();
      console.log(`Deleted ${deletedGameSets.length} game sets`);

      // Reset sequences
      console.log('Resetting sequences...');
      await db.execute(sql`ALTER SEQUENCE game_players_id_seq RESTART WITH 1`);
      await db.execute(sql`ALTER SEQUENCE checkins_id_seq RESTART WITH 1`);
      await db.execute(sql`ALTER SEQUENCE games_id_seq RESTART WITH 1`);
      await db.execute(sql`ALTER SEQUENCE game_sets_id_seq RESTART WITH 1`);
      console.log('All sequences reset successfully');

      console.log('Database reset completed successfully');
      res.sendStatus(200);
    } catch (error) {
      console.error('Failed to reset database:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Add a new endpoint to clean up duplicate checkins
  app.post("/api/database/cleanup", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.user!.isEngineer && !req.user!.isRoot) return res.sendStatus(403);

    try {
      console.log('Starting database cleanup process...');
      await cleanupDuplicateCheckins();
      console.log('Database cleanup completed');
      res.sendStatus(200);
    } catch (error) {
      console.error('Failed to cleanup database:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}