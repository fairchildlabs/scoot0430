// Import dependencies
import { and, asc, desc, eq, inArray, isNull, lt, gte, ne, or, sql } from "drizzle-orm";
import session from "express-session";
import PgSession from "connect-pg-simple";
import { SessionOptions } from "express-session";
import { db } from "./db";
import {
  users,
  checkins,
  games,
  gamePlayers,
  gameSets,
  insertUserSchema,
  InsertUser,
  User,
  Checkin,
  Game,
  GamePlayer,
  GameSet,
  CheckinType,
  InsertGameSet
} from "@shared/schema";
import { Pool } from "@neondatabase/serverless";

// Helper functions
function getCentralTime() {
  // Create a date object with the current UTC time
  const now = new Date();
  
  // Convert to Central Time (UTC-6)
  now.setHours(now.getHours() - 6);
  
  return now;
}

function getDateString(date: Date) {
  return date.toISOString().split('T')[0];
}

function isMoveType(moveType: string, expected: string): boolean {
  return moveType.toUpperCase() === expected.toUpperCase();
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User>;
  getCheckins(clubIndex: number): Promise<(Checkin & { username: string })[]>;
  createCheckin(userId: number, clubIndex: number): Promise<Checkin>;
  deactivateCheckin(checkinId: number): Promise<void>;
  createGame(setId: number, court: string, state: string): Promise<Game>;
  updateGameScore(gameId: number, team1Score: number, team2Score: number): Promise<Game>;
  getAllUsers(): Promise<User[]>;
  sessionStore: session.Store;
  createGameSet(userId: number, gameSet: InsertGameSet): Promise<GameSet>;
  getActiveGameSet(): Promise<GameSet | undefined>;
  getAllGameSets(): Promise<GameSet[]>;
  deactivateGameSet(setId: number): Promise<void>;
  createGamePlayer(gameId: number, userId: number, team: number): Promise<GamePlayer>;
  getGame(gameId: number): Promise<Game & { players: (GamePlayer & { username: string, birthYear?: number, queuePosition: number })[] }>;
  getGameSetLog(gameSetId: number): Promise<any[]>;
  determinePromotionType(gameId: number): Promise<{ type: 'win_promoted' | 'loss_promoted', team: 1 | 2 } | null>;
  handlePlayerMove(userId: number, moveType: string): Promise<{message: string, details: any}>;
  handleGamePlayerCheckout(currentCheckin: {id: number; gameId: number; team: number; queuePosition: number; username: string}, activeGameSet: GameSet): Promise<void>;
  handleQueuePlayerCheckout(currentCheckin: {id: number; queuePosition: number; username: string}, activeGameSet: GameSet): Promise<void>;
  handleHomeTeamCheckout(currentCheckin: { id: number; queuePosition: number; username: string; gameId: number; team: number }, activeGameSet: GameSet): Promise<void>;
  handleAwayTeamCheckout(currentCheckin: { id: number; gameId: number; team: number; queuePosition: number; username: string }, activeGameSet: GameSet): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    // Configure session store
    const pgSession = PgSession(session);
    this.sessionStore = new pgSession({
      pool: new Pool({ connectionString: process.env.DATABASE_URL }),
      tableName: 'session',
      createTableIfMissing: true
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const results = await db.select().from(users).where(eq(users.id, id));
    return results.length > 0 ? results[0] : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const results = await db.select().from(users).where(eq(users.username, username));
    return results.length > 0 ? results[0] : undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Validate the data against the schema
    insertUserSchema.parse(insertUser);

    // Insert the new user into the database
    const [createdUser] = await db.insert(users).values(insertUser).returning();
    return createdUser;
  }

  async getCheckins(clubIndex: number): Promise<(Checkin & { username: string })[]> {
    // Get active game set first
    const activeGameSet = await this.getActiveGameSet();
    if (!activeGameSet) {
      console.log('getCheckins - No active game set found');
      return [];
    }

    console.log('getCheckins - Active game set:', { id: activeGameSet.id, currentQueuePosition: activeGameSet.currentQueuePosition });

    // Query for checkins that are:
    // 1. Associated with the current active game set
    // 2. For the specified club
    // 3. Currently active
    const result = await db
      .select({
        id: checkins.id,
        userId: checkins.userId,
        checkInTime: checkins.checkInTime,
        checkInDate: checkins.checkInDate,
        isActive: checkins.isActive,
        gameSetId: checkins.gameSetId,
        clubIndex: checkins.clubIndex,
        queuePosition: checkins.queuePosition,
        gameId: checkins.gameId,
        type: checkins.type,
        team: checkins.team,
        username: users.username,
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(
        and(
          eq(checkins.clubIndex, clubIndex),
          eq(checkins.isActive, true),
          eq(checkins.gameSetId, activeGameSet.id) // Filter by current active game set
        )
      )
      .orderBy(asc(checkins.queuePosition));
    
    console.log('getCheckins - Found checkins:', result);
    return result;
  }

  async deactivateCheckin(checkinId: number): Promise<void> {
    await db
      .update(checkins)
      .set({ isActive: false })
      .where(eq(checkins.id, checkinId));
  }

  async createGame(setId: number, court: string, state: string): Promise<Game> {
    const [game] = await db
      .insert(games)
      .values({
        gameSetId: setId,
        court,
        state,
        team1Score: 0,
        team2Score: 0,
        startTime: getCentralTime(),
      })
      .returning();
    return game;
  }

  async updateGameScore(gameId: number, team1Score: number, team2Score: number): Promise<Game> {
    const [updatedGame] = await db
      .update(games)
      .set({
        team1Score,
        team2Score
      })
      .where(eq(games.id, gameId))
      .returning();
    return updatedGame;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(asc(users.username));
  }

  async updateUser(id: number, updateData: Partial<InsertUser>): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async createGameSet(userId: number, gameSet: InsertGameSet): Promise<GameSet> {
    // First deactivate any existing active game sets
    const activeSet = await this.getActiveGameSet();
    if (activeSet) {
      await this.deactivateGameSet(activeSet.id);
    }

    // Then create the new game set
    const [createdGameSet] = await db
      .insert(gameSets)
      .values({
        ...gameSet,
        createdBy: userId, // Match the column name in the schema
        isActive: true,
        createdAt: getCentralTime(),
        currentQueuePosition: 1 // Start with queue position 1
      })
      .returning();
    return createdGameSet;
  }

  async getActiveGameSet(): Promise<GameSet | undefined> {
    const results = await db
      .select()
      .from(gameSets)
      .where(eq(gameSets.isActive, true))
      .limit(1);
    return results.length > 0 ? results[0] : undefined;
  }

  async getAllGameSets(): Promise<GameSet[]> {
    return await db
      .select()
      .from(gameSets)
      .orderBy(desc(gameSets.createdAt));
  }

  async deactivateGameSet(setId: number): Promise<void> {
    await db
      .update(gameSets)
      .set({ isActive: false })
      .where(eq(gameSets.id, setId));
  }

  async createGamePlayer(gameId: number, userId: number, team: number): Promise<GamePlayer> {
    const [player] = await db
      .insert(gamePlayers)
      .values({
        gameId,
        userId,
        team,
        insertTime: getCentralTime()
      })
      .returning();
    return player;
  }

  async getGame(gameId: number): Promise<Game & { players: (GamePlayer & { username: string, birthYear?: number, queuePosition: number })[] }> {
    // Get the game
    const gameResults = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId));
    
    if (gameResults.length === 0) {
      throw new Error(`Game with ID ${gameId} not found`);
    }
    
    const game = gameResults[0];
    
    // Get the players for this game
    const players = await db
      .select({
        id: gamePlayers.id,
        gameId: gamePlayers.gameId,
        userId: gamePlayers.userId,
        team: gamePlayers.team,
        insertTime: gamePlayers.insertTime,
        username: users.username,
        birthYear: users.birthYear,
        queuePosition: checkins.queuePosition
      })
      .from(gamePlayers)
      .innerJoin(users, eq(gamePlayers.userId, users.id))
      .leftJoin(checkins, 
        and(
          eq(gamePlayers.userId, checkins.userId),
          eq(checkins.gameId, gameId)
        )
      )
      .where(eq(gamePlayers.gameId, gameId))
      .orderBy(asc(checkins.queuePosition));
    
    return {
      ...game,
      players
    };
  }

  async determinePromotionType(gameId: number): Promise<{ type: 'win_promoted' | 'loss_promoted', team: 1 | 2 } | null> {
    const game = await this.getGame(gameId);
    
    // Check if game has players
    if (!game.players || game.players.length === 0) {
      return null;
    }
    
    // Determine winning team
    const team1Score = game.team1Score || 0;
    const team2Score = game.team2Score || 0;
    
    if (team1Score > team2Score) {
      return { type: 'loss_promoted', team: 2 };
    } else if (team2Score > team1Score) {
      return { type: 'loss_promoted', team: 1 };
    }
    
    // If tied, no promotion
    return null;
  }

  async getGameSetLog(gameSetId: number): Promise<any[]> {
    // Retrieve all games for this game set
    const gamesList = await db
      .select()
      .from(games)
      .where(eq(games.gameSetId, gameSetId))
      .orderBy(asc(games.startTime));
    
    const logEntries = [];
    
    // Process each game
    for (const game of gamesList) {
      // Get players for this game
      const players = await db
        .select({
          id: gamePlayers.id,
          gameId: gamePlayers.gameId,
          userId: gamePlayers.userId,
          team: gamePlayers.team,
          insertTime: gamePlayers.insertTime,
          username: users.username
        })
        .from(gamePlayers)
        .innerJoin(users, eq(gamePlayers.userId, users.id))
        .where(eq(gamePlayers.gameId, game.id))
        .orderBy(asc(gamePlayers.insertTime));
      
      // Group players by team
      const team1Players = players.filter(p => p.team === 1).map(p => p.username);
      const team2Players = players.filter(p => p.team === 2).map(p => p.username);
      
      // Create log entry
      logEntries.push({
        gameId: game.id,
        startTime: game.startTime,
        court: game.court,
        team1: team1Players,
        team2: team2Players,
        team1Score: game.team1Score,
        team2Score: game.team2Score,
        state: game.state
      });
    }
    
    return logEntries;
  }

  async createCheckin(userId: number, clubIndex: number): Promise<Checkin> {
    const now = getCentralTime();
    const today = getDateString(now);

    console.log(`Attempting to create checkin for user ${userId} at club ${clubIndex}`);

    // Get active game set first
    const activeGameSet = await this.getActiveGameSet();
    if (!activeGameSet) {
      throw new Error("No active game set available for check-ins");
    }

    // Check for existing active checkin for this user in the CURRENT game set
    const existingCheckins = await db
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.userId, userId),
          eq(checkins.clubIndex, clubIndex),
          eq(checkins.isActive, true),
          eq(checkins.gameSetId, activeGameSet.id) // Check by game set ID instead of date
        )
      );

    // If user already has an active checkin in this game set, return it
    if (existingCheckins.length > 0) {
      console.log(`User ${userId} already has an active checkin in this game set:`, existingCheckins[0]);
      return existingCheckins[0];
    }

    // Create new checkin with next queue position
    console.log(`Creating new checkin for user ${userId}`);
    const [checkin] = await db
      .insert(checkins)
      .values({
        userId,
        clubIndex,
        checkInTime: now,
        isActive: true,
        checkInDate: today,
        gameSetId: activeGameSet.id,
        queuePosition: activeGameSet.currentQueuePosition,
        type: 'manual',
        gameId: null,
        team: null
      })
      .returning();

    // Update the game set's current queue position
    await db
      .update(gameSets)
      .set({ currentQueuePosition: activeGameSet.currentQueuePosition + 1 })
      .where(eq(gameSets.id, activeGameSet.id));

    return checkin;
  }

  async deactivatePlayerCheckin(userId: number): Promise<void> {
    await db
      .update(checkins)
      .set({ isActive: false })
      .where(
        and(
          eq(checkins.userId, userId),
          eq(checkins.isActive, true)
        )
      );
  }

  // Implementation of handlePlayerMove method
  async handlePlayerMove(userId: number, moveType: string): Promise<{message: string, details: any}> {
    console.log(`Handling player move: ${userId} - ${moveType}`);
    
    // Get current check-ins state
    const state = await this.getCurrentCheckinsState();
    
    if (!state.activeGameSet) {
      throw new Error("No active game set available");
    }
    
    // Find the player's current check-in
    const currentCheckin = state.allCheckins.find(c => c.userId === userId);
    if (!currentCheckin) {
      throw new Error(`No active check-in found for user ${userId}`);
    }
    
    let result = { message: "Move completed", details: {} };
    
    // Handle different move types
    if (isMoveType(moveType, "CHECKOUT")) {
      // Checkout logic varies based on the player's current position
      if (currentCheckin.gameId) {
        if (currentCheckin.team === 1) {
          // HOME team checkout
          await this.handleHomeTeamCheckout(currentCheckin, state.activeGameSet);
          result.message = `${currentCheckin.username} checked out from HOME team`;
        } else if (currentCheckin.team === 2) {
          // AWAY team checkout
          await this.handleAwayTeamCheckout(currentCheckin, state.activeGameSet);
          result.message = `${currentCheckin.username} checked out from AWAY team`;
        }
      } else {
        // NEXT UP checkout
        await this.handleQueuePlayerCheckout(currentCheckin, state.activeGameSet);
        result.message = `${currentCheckin.username} checked out from NEXT UP`;
      }
    } 
    else if (isMoveType(moveType, "BUMP")) {
      // BUMP logic - Swap with first player in the waiting list
      if (currentCheckin.gameId) {
        // Player is on a team - find first waiting player
        const firstWaitingPlayer = state.nextUpPlayers[0];
        if (firstWaitingPlayer) {
          // Swap positions
          await db.transaction(async tx => {
            // Move the firstWaitingPlayer to the team
            await tx
              .update(checkins)
              .set({ 
                gameId: currentCheckin.gameId,
                team: currentCheckin.team,
                queuePosition: currentCheckin.queuePosition
              })
              .where(eq(checkins.id, firstWaitingPlayer.id));
            
            // Move currentCheckin to the waiting list
            await tx
              .update(checkins)
              .set({ 
                gameId: null,
                team: null,
                queuePosition: firstWaitingPlayer.queuePosition
              })
              .where(eq(checkins.id, currentCheckin.id));
          });
          
          result.message = `${currentCheckin.username} BUMPED with ${firstWaitingPlayer.username}`;
          result.details = { bumpedWith: firstWaitingPlayer.username };
        } else {
          throw new Error("No players in waiting list to BUMP with");
        }
      } else {
        // Player is in waiting list - bump with next player in line
        const playerIndex = state.nextUpPlayers.findIndex(p => p.id === currentCheckin.id);
        if (playerIndex >= 0 && playerIndex < state.nextUpPlayers.length - 1) {
          const nextPlayer = state.nextUpPlayers[playerIndex + 1];
          
          // Swap positions
          await db.transaction(async tx => {
            // Move the nextPlayer up
            await tx
              .update(checkins)
              .set({ queuePosition: currentCheckin.queuePosition })
              .where(eq(checkins.id, nextPlayer.id));
            
            // Move currentCheckin down
            await tx
              .update(checkins)
              .set({ queuePosition: nextPlayer.queuePosition })
              .where(eq(checkins.id, currentCheckin.id));
          });
          
          result.message = `${currentCheckin.username} BUMPED with ${nextPlayer.username}`;
          result.details = { bumpedWith: nextPlayer.username };
        } else {
          throw new Error("Cannot BUMP - no player below in the waiting list");
        }
      }
    }
    else if (isMoveType(moveType, "HORIZONTAL_SWAP")) {
      // HORIZONTAL_SWAP logic - Swap with player in equivalent position on other team
      if (!currentCheckin.gameId || !currentCheckin.team) {
        throw new Error("Cannot perform HORIZONTAL_SWAP for players not on a team");
      }
      
      const playersPerTeam = state.activeGameSet.playersPerTeam;
      const teamPlayers = currentCheckin.team === 1 ? state.homeTeamPlayers : state.awayTeamPlayers;
      const otherTeamPlayers = currentCheckin.team === 1 ? state.awayTeamPlayers : state.homeTeamPlayers;
      
      // Find player's position within team (0-based index)
      const playerPositionInTeam = teamPlayers.findIndex(p => p.id === currentCheckin.id);
      
      // Find equivalent player in other team
      if (playerPositionInTeam >= 0 && playerPositionInTeam < otherTeamPlayers.length) {
        const otherTeamPlayer = otherTeamPlayers[playerPositionInTeam];
        
        // Swap team assignments
        await db.transaction(async tx => {
          // Move the otherTeamPlayer to this player's team
          await tx
            .update(checkins)
            .set({ team: currentCheckin.team })
            .where(eq(checkins.id, otherTeamPlayer.id));
          
          // Move currentCheckin to the other team
          await tx
            .update(checkins)
            .set({ team: currentCheckin.team === 1 ? 2 : 1 })
            .where(eq(checkins.id, currentCheckin.id));
        });
        
        result.message = `${currentCheckin.username} swapped with ${otherTeamPlayer.username}`;
        result.details = { swappedWith: otherTeamPlayer.username };
      } else {
        throw new Error("No player in equivalent position on other team");
      }
    }
    else if (isMoveType(moveType, "VERTICAL_SWAP")) {
      // VERTICAL_SWAP logic - Cycle positions within AWAY team
      if (!currentCheckin.gameId || currentCheckin.team !== 2) {
        throw new Error("VERTICAL_SWAP can only be performed with players on the AWAY team");
      }
      
      // Find player's position in AWAY team
      const playerIndex = state.awayTeamPlayers.findIndex(p => p.id === currentCheckin.id);
      
      if (playerIndex >= 0) {
        // Determine next position (wrap around to beginning if at end)
        const nextPlayerIndex = (playerIndex + 1) % state.awayTeamPlayers.length;
        const nextPlayer = state.awayTeamPlayers[nextPlayerIndex];
        
        // Swap queue positions
        await db.transaction(async tx => {
          // Store current player's position
          const currentPos = currentCheckin.queuePosition;
          
          // Update all players in the rotation
          for (let i = 0; i < state.awayTeamPlayers.length; i++) {
            const thisPlayer = state.awayTeamPlayers[i];
            const nextPlayerIdx = (i + 1) % state.awayTeamPlayers.length;
            const nextAwayPlayer = state.awayTeamPlayers[nextPlayerIdx];
            
            // Skip the current player as we'll handle them separately
            if (thisPlayer.id === currentCheckin.id) continue;
            
            // Move this player to the next position
            if (i === playerIndex) {
              // Current player gets moved to nextPlayer's position
              await tx
                .update(checkins)
                .set({ queuePosition: nextPlayer.queuePosition })
                .where(eq(checkins.id, currentCheckin.id));
            } else if (nextPlayerIdx === playerIndex) {
              // This player gets the saved current position
              await tx
                .update(checkins)
                .set({ queuePosition: currentPos })
                .where(eq(checkins.id, thisPlayer.id));
            }
          }
        });
        
        result.message = `${currentCheckin.username} moved to ${nextPlayer.username}'s position`;
        result.details = { movedTo: nextPlayer.username };
      } else {
        throw new Error("Player not found in AWAY team");
      }
    }
    else {
      throw new Error(`Unsupported move type: ${moveType}`);
    }
    
    return result;
  }

  // Helper method to get current state of all check-ins
  private async getCurrentCheckinsState() {
    const activeGameSet = await this.getActiveGameSet();
    if (!activeGameSet) {
      return { activeGameSet: null, allCheckins: [], homeTeamPlayers: [], awayTeamPlayers: [], nextUpPlayers: [] };
    }
    
    // Get all active check-ins for this game set
    const allCheckins = await db
      .select({
        id: checkins.id,
        userId: checkins.userId,
        gameId: checkins.gameId,
        team: checkins.team,
        queuePosition: checkins.queuePosition,
        username: users.username
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(
        and(
          eq(checkins.isActive, true),
          eq(checkins.gameSetId, activeGameSet.id)
        )
      )
      .orderBy(asc(checkins.queuePosition));
    
    // Categorize players
    const homeTeamPlayers = allCheckins.filter(c => c.team === 1);
    const awayTeamPlayers = allCheckins.filter(c => c.team === 2);
    const nextUpPlayers = allCheckins.filter(c => c.gameId === null && c.team === null);
    
    return {
      activeGameSet,
      allCheckins,
      homeTeamPlayers,
      awayTeamPlayers,
      nextUpPlayers
    };
  }

  // Handler for HOME team player checkout
  async handleHomeTeamCheckout(
    currentCheckin: { id: number; queuePosition: number; username: string; gameId: number; team: number },
    activeGameSet: GameSet
  ): Promise<void> {
    // For HOME team checkout:
    // 1. Set the player as inactive
    // 2. Find the first player in the NEXT UP list
    // 3. Move that player to the HOME team in the same position
    
    const state = await this.getCurrentCheckinsState();
    const firstWaitingPlayer = state.nextUpPlayers[0];
    
    if (firstWaitingPlayer) {
      // Transaction to ensure atomicity
      await db.transaction(async tx => {
        // Deactivate the current player's check-in
        await tx
          .update(checkins)
          .set({ isActive: false })
          .where(eq(checkins.id, currentCheckin.id));
        
        // Move the first waiting player to the HOME team
        await tx
          .update(checkins)
          .set({ 
            gameId: currentCheckin.gameId,
            team: 1,  // HOME team
            queuePosition: currentCheckin.queuePosition  // Maintain position
          })
          .where(eq(checkins.id, firstWaitingPlayer.id));
      });
      
      console.log(`HOME team checkout: ${currentCheckin.username} checked out, ${firstWaitingPlayer.username} moved to HOME team`);
    } else {
      // If no waiting players, just deactivate this player
      await db
        .update(checkins)
        .set({ isActive: false })
        .where(eq(checkins.id, currentCheckin.id));
      
      console.log(`HOME team checkout: ${currentCheckin.username} checked out, no replacement available`);
    }
  }

  // Handler for AWAY team player checkout
  async handleAwayTeamCheckout(
    currentCheckin: { id: number; gameId: number; team: number; queuePosition: number; username: string },
    activeGameSet: GameSet
  ): Promise<void> {
    // For AWAY team checkout:
    // 1. Set the player as inactive
    // 2. Find the first player in the NEXT UP list
    // 3. Move that player to the AWAY team in the same position
    
    const state = await this.getCurrentCheckinsState();
    const firstWaitingPlayer = state.nextUpPlayers[0];
    
    if (firstWaitingPlayer) {
      // Transaction to ensure atomicity
      await db.transaction(async tx => {
        // Deactivate the current player's check-in
        await tx
          .update(checkins)
          .set({ isActive: false })
          .where(eq(checkins.id, currentCheckin.id));
        
        // Move the first waiting player to the AWAY team
        await tx
          .update(checkins)
          .set({ 
            gameId: currentCheckin.gameId,
            team: 2,  // AWAY team
            queuePosition: currentCheckin.queuePosition  // Maintain position
          })
          .where(eq(checkins.id, firstWaitingPlayer.id));
      });
      
      console.log(`AWAY team checkout: ${currentCheckin.username} checked out, ${firstWaitingPlayer.username} moved to AWAY team`);
    } else {
      // If no waiting players, just deactivate this player
      await db
        .update(checkins)
        .set({ isActive: false })
        .where(eq(checkins.id, currentCheckin.id));
      
      console.log(`AWAY team checkout: ${currentCheckin.username} checked out, no replacement available`);
    }
  }

  // Handler for NEXT UP player checkout
  async handleQueuePlayerCheckout(
    currentCheckin: { id: number; queuePosition: number; username: string },
    activeGameSet: GameSet
  ): Promise<void> {
    // For NEXT UP player checkout:
    // 1. Set the player as inactive
    // 2. Find all players after this one in the queue
    // 3. Move each player up one position
    
    const state = await this.getCurrentCheckinsState();
    const playersAfterCurrent = state.nextUpPlayers.filter(p => p.queuePosition > currentCheckin.queuePosition);
    
    // Transaction to ensure atomicity
    await db.transaction(async tx => {
      // Deactivate the current player's check-in
      await tx
        .update(checkins)
        .set({ isActive: false })
        .where(eq(checkins.id, currentCheckin.id));
      
      // Move each subsequent player up one position
      for (const player of playersAfterCurrent) {
        await tx
          .update(checkins)
          .set({ queuePosition: player.queuePosition - 1 })
          .where(eq(checkins.id, player.id));
      }
    });
    
    console.log(`NEXT UP checkout: ${currentCheckin.username} checked out, ${playersAfterCurrent.length} players moved up`);
  }

  // Method to handle game player checkout by admin
  async handleGamePlayerCheckout(
    currentCheckin: { id: number; gameId: number; team: number; queuePosition: number; username: string },
    activeGameSet: GameSet
  ): Promise<void> {
    if (currentCheckin.team === 1) {
      return this.handleHomeTeamCheckout(currentCheckin as any, activeGameSet);
    } else if (currentCheckin.team === 2) {
      return this.handleAwayTeamCheckout(currentCheckin, activeGameSet);
    } else {
      throw new Error("Invalid team assignment for game player checkout");
    }
  }
}

// Create and export the storage instance
export const storage = new DatabaseStorage();