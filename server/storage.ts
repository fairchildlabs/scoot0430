import { users, type User, type InsertUser, checkins, type Checkin, type Game, games, type GamePlayer, gamePlayers, type GameSet, gameSets, type InsertGameSet } from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc, inArray, not, lt, gt } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { GameState } from "./game-logic/types";

const PostgresSessionStore = connectPg(session);

function getCentralTime() {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
}

function getDateString(date: Date) {
  return date.toISOString().split('T')[0];
}

// Utility function for consistent moveType comparison
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
  handlePlayerMove(userId: number, moveType: string): Promise<void>;
  handleGamePlayerCheckout(currentCheckin: {id: number; gameId: number; team: number; queuePosition: number; username: string}, activeGameSet: GameSet): Promise<void>;
  handleQueuePlayerCheckout(currentCheckin: {id: number; queuePosition: number; username: string}, activeGameSet: GameSet): Promise<void>;
  handleHomeTeamCheckout(currentCheckin: { id: number; queuePosition: number; username: string; gameId: number; team: number }, activeGameSet: GameSet): Promise<void>;
  handleAwayTeamCheckout(currentCheckin: { id: number; gameId: number; team: number; queuePosition: number; username: string }, activeGameSet: GameSet): Promise<void>;

}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.username}) = LOWER(${username})`);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getCheckins(clubIndex: number): Promise<(Checkin & { username: string })[]> {
    const today = getDateString(getCentralTime());

    // Get active game set first to get current_queue_position
    const [activeGameSet] = await db
      .select()
      .from(gameSets)
      .where(eq(gameSets.isActive, true));

    if (!activeGameSet) {
      console.log('getCheckins - No active game set, returning empty list');
      return [];
    }

    console.log('getCheckins - Active game set:', {
      id: activeGameSet.id,
      currentQueuePosition: activeGameSet.currentQueuePosition
    });

    // Get all active checkins for today
    const results = await db
      .select({
        id: checkins.id,
        userId: checkins.userId,
        checkInTime: checkins.checkInTime,
        isActive: checkins.isActive,
        clubIndex: checkins.clubIndex,
        checkInDate: checkins.checkInDate,
        queuePosition: checkins.queuePosition,
        username: users.username,
        birthYear: users.birthYear,
        gameSetId: checkins.gameSetId,
        type: checkins.type,
        gameId: checkins.gameId,
        team: checkins.team
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(
        and(
          eq(checkins.clubIndex, clubIndex),
          eq(checkins.isActive, true),
          eq(checkins.checkInDate, today)
        )
      )
      .orderBy(checkins.queuePosition);

    console.log('getCheckins - Found checkins:',
      results.map(r => ({
        username: r.username,
        pos: r.queuePosition,
        type: r.type,
        isActive: r.isActive,
        gameId: r.gameId,
        team: r.team
      }))
    );

    return results;
  }

  async deactivateCheckin(checkinId: number): Promise<void> {
    console.log(`Deactivating checkin ${checkinId}`);
    await db
      .update(checkins)
      .set({ isActive: false })
      .where(eq(checkins.id, checkinId));
    console.log(`Successfully deactivated checkin ${checkinId}`);
  }

  async createGame(setId: number, court: string, state: string): Promise<Game> {
    // Get the game set first to access players_per_team
    const [gameSet] = await db.select().from(gameSets).where(eq(gameSets.id, setId));
    if (!gameSet) throw new Error(`Game set ${setId} not found`);

    // Increment current queue position by players_per_team * 2 (for both teams)
    const newQueuePosition = gameSet.currentQueuePosition + (gameSet.playersPerTeam * 2);
    console.log(`Updating game set ${setId} current_queue_position from ${gameSet.currentQueuePosition} to ${newQueuePosition}`);

    await db
      .update(gameSets)
      .set({
        currentQueuePosition: newQueuePosition
      })
      .where(eq(gameSets.id, setId));

    // Create the game
    const [game] = await db
      .insert(games)
      .values({
        setId,
        startTime: new Date(),
        clubIndex: 34,
        court,
        state
      })
      .returning();
    return game;
  }

  async updateGameScore(gameId: number, team1Score: number, team2Score: number): Promise<Game> {
    console.log(`updateGameScore - Processing score update for game ${gameId}:`, { team1Score, team2Score });

    // Get the game and game set
    const [game] = await db.select().from(games).where(eq(games.id, gameId));
    if (!game) throw new Error(`Game ${gameId} not found`);

    const [gameSet] = await db.select().from(gameSets).where(eq(gameSets.id, game.setId));
    if (!gameSet) throw new Error(`Game set ${game.setId} not found`);

    // Log all active checkins before update
    const activeCheckins = await db
      .select({
        id: checkins.id,
        userId: checkins.userId,
        username: users.username,
        isActive: checkins.isActive
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(eq(checkins.gameId, gameId));

    console.log(`Found ${activeCheckins.length} checkins for game ${gameId} before deactivation:`,
      activeCheckins.map(c => `${c.username} (Active: ${c.isActive})`));

    // Deactivate ALL checkins for this game directly
    await db
      .update(checkins)
      .set({ isActive: false })
      .where(eq(checkins.gameId, gameId));

    // Update game scores and status
    const [updatedGame] = await db
      .update(games)
      .set({
        team1Score,
        team2Score,
        endTime: new Date(),
        state: 'final'
      })
      .where(eq(games.id, gameId))
      .returning();

    // Determine promotion type and team
    const promotionInfo = await this.determinePromotionType(gameId);

    // Get all games for this set with player info
    const gamePlayerIds = await db
      .select({
        userId: gamePlayers.userId
      })
      .from(gamePlayers)
      .where(eq(gamePlayers.gameId, gameId));

    // Initialize promotedPlayers outside the if block
    let promotedPlayers: { userId: number; team: number }[] = [];

    if (promotionInfo) {
      // Get players from the promoted team
      promotedPlayers = await db
        .select({
          userId: gamePlayers.userId,
          team: gamePlayers.team
        })
        .from(gamePlayers)
        .where(
          and(
            eq(gamePlayers.gameId, gameId),
            eq(gamePlayers.team, promotionInfo.team)
          )
        );

      console.log('Found promoted players:', promotedPlayers.map(p => p.userId));

      // First increment queue positions for all active checkins
      await db
        .update(checkins)
        .set({
          queuePosition: sql`${checkins.queuePosition} + ${gameSet.playersPerTeam}`
        })
        .where(
          and(
            eq(checkins.checkInDate, getDateString(getCentralTime())),
            eq(checkins.isActive, true),
            sql`${checkins.queuePosition} >= ${gameSet.currentQueuePosition}`
          )
        );

      // Then create new checkins for promoted team players
      for (let i = 0; i < promotedPlayers.length; i++) {
        const player = promotedPlayers[i];
        await db
          .insert(checkins)
          .values({
            userId: player.userId,
            clubIndex: 34,
            checkInTime: getCentralTime(),
            isActive: true,
            checkInDate: getDateString(getCentralTime()),
            gameSetId: gameSet.id,
            queuePosition: gameSet.currentQueuePosition + i,
            type: promotionInfo.type,
            gameId: null,
            team: player.team
          });
      }

      // Update queue_next_up
      console.log('Updating queue_next_up:', {
        current: gameSet.queueNextUp,
        increment: gameSet.playersPerTeam,
        new: gameSet.queueNextUp + gameSet.playersPerTeam
      });

      await db
        .update(gameSets)
        .set({
          queueNextUp: sql`${gameSets.queueNextUp} + ${gameSet.playersPerTeam}`
        })
        .where(eq(gameSets.id, gameSet.id));
    }

    // Get auto-up players
    let autoUpPlayers = [];
    try {
      console.log('Finding auto-up players:', {
        gamePlayerIds: gamePlayerIds.map(p => p.userId),
        playerCount: gamePlayerIds.length,
        promotedPlayers: promotedPlayers.map(p => ({ id: p.userId, team: p.team }))
      });

      // Only query if we have game players to check
      if (gamePlayerIds.length > 0) {
        // Find all potential auto-up players
        const allAutoUpPlayers = await db
          .select({
            id: users.id,
            username: users.username
          })
          .from(users)
          .where(
            and(
              eq(users.autoup, true),
              inArray(users.id, gamePlayerIds.map(p => p.userId))
            )
          );

        console.log('Auto-up players found:', {
          count: allAutoUpPlayers.length,
          players: allAutoUpPlayers.map(p => p.username)
        });

        // Filter out promoted players in JavaScript
        autoUpPlayers = allAutoUpPlayers.filter(
          player => !promotedPlayers.map(p => p.userId).includes(player.id)
        );

        console.log('After filtering out promoted players:', {
          count: autoUpPlayers.length,
          players: autoUpPlayers.map(p => p.username)
        });
      } else {
        console.log('No game players found, skipping auto-up query');
      }
    } catch (error: any) {
      console.error('Error finding auto-up players:', {
        error,
        stack: error.stack,
        sql: error.sql,
        parameters: error.parameters
      });
      // Continue execution even if auto-up players query fails
    }

    // Create new checkins for auto-up players
    for (const player of autoUpPlayers) {
      try {
        // Check if player already has an active checkin
        const [existingCheckin] = await db
          .select()
          .from(checkins)
          .where(
            and(
              eq(checkins.userId, player.id),
              eq(checkins.isActive, true),
              eq(checkins.checkInDate, getDateString(getCentralTime()))
            )
          );

        if (!existingCheckin) {
          // Get current queue_next_up value before inserting
          const [currentGameSet] = await db
            .select()
            .from(gameSets)
            .where(eq(gameSets.id, gameSet.id));

          console.log('Creating auto-up checkin:', {
            player: player.username,
            queuePosition: currentGameSet.queueNextUp
          });

          await db
            .insert(checkins)
            .values({
              userId: player.id,
              clubIndex: 34,
              checkInTime: getCentralTime(),
              isActive: true,
              checkInDate: getDateString(getCentralTime()),
              gameSetId: gameSet.id,
              queuePosition: currentGameSet.queueNextUp,
              type: 'autoup',
              gameId: null,
              team: null
            });

          // Increment queueNextUp for each auto-up player
          await db
            .update(gameSets)
            .set({
              queueNextUp: sql`${gameSets.queueNextUp} + 1`
            })
            .where(eq(gameSets.id, gameSet.id));
        }
      } catch (error) {
        console.error('Error processing auto-up player:', {
          playerId: player.id,
          playerName: player.username,
          error
        });
        // Continue with next player even if one fails
      }
    }

    return updatedGame;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async updateUser(id: number, updateData: Partial<InsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async createGameSet(userId: number, gameSet: InsertGameSet): Promise<GameSet> {
    // First deactivate all existing game sets
    await db
      .update(gameSets)
      .set({ isActive: false })
      .where(eq(gameSets.isActive, true));


    const [newGameSet] = await db
      .insert(gameSets)
      .values({
        ...gameSet,
        createdBy: userId,
        currentQueuePosition: 1,
        queueNextUp: 1,
      })
      .returning();

    return newGameSet;
  }

  async getActiveGameSet(): Promise<GameSet | undefined> {
    const [gameSet] = await db
      .select()
      .from(gameSets)
      .where(eq(gameSets.isActive, true));
    return gameSet;
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
    console.log(`Creating game player for user ${userId} in game ${gameId} on team ${team}`);

    // Create game player entry
    const [gamePlayer] = await db
      .insert(gamePlayers)
      .values({
        gameId,
        userId,
        team
      })
      .returning();

    console.log('Created game player:', gamePlayer);

    // Update the player's current active checkin with the game ID
    const [currentCheckin] = await db
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.userId, userId),
          eq(checkins.isActive, true)
        )
      );

    if (currentCheckin) {
      console.log(`Updating checkin ${currentCheckin.id} with gameId ${gameId}`);
      await db
        .update(checkins)
        .set({
          gameId,
          team
        })
        .where(eq(checkins.id, currentCheckin.id));

      // Verify the update
      const [updatedCheckin] = await db
        .select()
        .from(checkins)
        .where(eq(checkins.id, currentCheckin.id));
      console.log('Updated checkin:', updatedCheckin);
    } else {
      console.error(`No active checkin found for user ${userId}`);
    }

    // Verify team composition after adding player
    const teamPlayers = await db
      .select({
        userId: gamePlayers.userId,
        username: users.username
      })
      .from(gamePlayers)
      .innerJoin(users, eq(gamePlayers.userId, users.id))
      .where(
        and(
          eq(gamePlayers.gameId, gameId),
          eq(gamePlayers.team, team)
        )
      );

    console.log(`Team ${team} composition after adding player:`, {
      playerCount: teamPlayers.length,
      players: teamPlayers.map(p => ({ id: p.userId, name: p.username }))
    });

    return gamePlayer;
  }

  async getGame(gameId: number): Promise<Game & { players: (GamePlayer & { username: string, birthYear?: number, queuePosition: number })[] }> {
    // Get the game
    const [game] = await db.select().from(games).where(eq(games.id, gameId));
    if (!game) throw new Error(`Game ${gameId} not found`);

    // Get all players in this game with their user information and queue positions
    const players = await db
      .select({
        id: gamePlayers.id,
        gameId: gamePlayers.gameId,
        userId: gamePlayers.userId,
        team: gamePlayers.team,
        username: users.username,
        birthYear: users.birthYear,
        queuePosition: checkins.queuePosition
      })
      .from(gamePlayers)
      .innerJoin(users, eq(gamePlayers.userId, users.id))
      .leftJoin(checkins, and(
        eq(checkins.userId, gamePlayers.userId),
        eq(checkins.gameId, gameId)
      ))
      .where(eq(gamePlayers.gameId, gameId))
      .orderBy(gamePlayers.team, gamePlayers.userId);

    return {
      ...game,
      players: players.map(player => ({
        ...player,
        queuePosition: player.queuePosition || 0
      }))
    };
  }

  async determinePromotionType(gameId: number): Promise<{ type: 'win_promoted' | 'loss_promoted', team: 1 | 2 } | null> {
    // Get the completed game with its game set info
    const [game] = await db
      .select({
        id: games.id,
        setId: games.setId,
        court: games.court,
        team1Score: games.team1Score,
        team2Score: games.team2Score,
        maxConsecutiveTeamWins: gameSets.maxConsecutiveTeamWins
      })
      .from(games)
      .innerJoin(gameSets, eq(games.setId, gameSets.id))
      .where(eq(games.id, gameId));

    if (!game) throw new Error(`Game ${gameId} not found`);

    // Get previous games on this court in this set using lt instead of < for id comparison
    const previousGames = await db
      .select()
      .from(games)
      .where(
        and(
          eq(games.setId, game.setId),
          eq(games.court, game.court),
          eq(games.state, 'final'),
          lt(games.id, gameId)
        )
      )
      .orderBy(desc(games.id));

    // Determine winning team of current game
    const winningTeam = game.team1Score! > game.team2Score! ? 1 : 2;

    // Count consecutive wins for the winning team
    let consecutiveWins = 1;
    for (const prevGame of previousGames) {
      const prevWinner = prevGame.team1Score! > prevGame.team2Score! ? 1 : 2;
      if (prevWinner === winningTeam) {
        consecutiveWins++;
      } else {
        break;
      }
    }

    console.log('Promotion check:', {
      gameId,
      court: game.court,
      winningTeam,
      consecutiveWins,
      maxAllowed: game.maxConsecutiveTeamWins
    });

    // If team hasn't exceeded max consecutive wins, they get promoted
    if (consecutiveWins < game.maxConsecutiveTeamWins) {
      return { type: 'win_promoted', team: winningTeam };
    }

    // If team has reached max consecutive wins, losing team gets promoted
    return { type: 'loss_promoted', team: winningTeam === 1 ? 2 : 1 };
  }

  async getGameSetLog(gameSetId: number): Promise<any[]> {
    // Get all checkins for this game set with user info
    const checkinsWithUsers = await db
      .select({
        queuePosition: checkins.queuePosition,
        userId: checkins.userId,
        username: users.username,
        checkInTime: checkins.checkInTime,
        gameId: checkins.gameId,
        type: checkins.type
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(eq(checkins.gameSetId, gameSetId))
      .orderBy(checkins.queuePosition);

    // Get all games for this set with player info
    const gamesWithPlayers = await db
      .select({
        id: games.id,
        court: games.court,
        state: games.state,
        team1Score: games.team1Score,
        team2Score: games.team2Score,
        startTime: games.startTime,
        endTime: games.endTime,
      })
      .from(games)
      .where(eq(games.setId, gameSetId));

    // Get player assignments for each game
    const gamePlayerAssignments = await Promise.all(
      gamesWithPlayers.map(async (game) => {
        const players = await db
          .select({
            gameId: gamePlayers.gameId,
            userId: gamePlayers.userId,
            team: gamePlayers.team,
          })
          .from(gamePlayers)
          .where(eq(gamePlayers.gameId, game.id));
        return { ...game, players };
      })
    );

    // Combine checkins with game information
    return checkinsWithUsers.map((checkin) => {
      // Find game where this user played
      const gameInfo = gamePlayerAssignments.find((game) =>
        game.players.some((p) => p.userId === checkin.userId)
      );

      if (!gameInfo) {
        return {
          ...checkin,
          gameStatus: "Pending",
          team: null,
          score: null,
          court: null,
          type: checkin.type
        };
      }

      const playerInfo = gameInfo.players.find((p) => p.userId === checkin.userId);
      const team = playerInfo?.team === 1 ? "Home" : "Away";
      const score =
        gameInfo.state === "final"
          ? `${gameInfo.team1Score}-${gameInfo.team2Score}`
          : "In Progress";

      return {
        ...checkin,
        gameStatus: gameInfo.state,
        team,
        score,
        court: gameInfo.court,
        type: checkin.type
      };
    });
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

    // Check for existing active checkin for this user
    const existingCheckins = await db
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.userId, userId),
          eq(checkins.clubIndex, clubIndex),
          eq(checkins.isActive, true),
          eq(checkins.checkInDate, today)
        )
      );

    // If user already has an active checkin, return it
    if (existingCheckins.length > 0) {
      console.log(`User ${userId} already has an active checkin for today:`, existingCheckins[0]);
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
        queuePosition: activeGameSet.queueNextUp,
        type: 'manual',
        gameId: null,
        team: null
      })
      .returning();

    // Increment the game set's queueNextUp (tail pointer)
    await db
      .update(gameSets)
      .set({
        queueNextUp: activeGameSet.queueNextUp + 1
      })
      .where(eq(gameSets.id, activeGameSet.id));

    console.log(`Created new checkin:`, checkin);
    return checkin;
  }

  async deactivatePlayerCheckin(userId: number): Promise<void> {
    console.log(`Deactivating checkin for user ${userId}`);
    const today = getDateString(getCentralTime());

    await db
      .update(checkins)
      .set({ isActive: false })
      .where(
        and(
          eq(checkins.userId, userId),
          eq(checkins.isActive, true),
          eq(checkins.checkInDate, today)
        )
      );
  }

  private async handleHomeTeamCheckout(
    currentCheckin: { id: number; queuePosition: number; username: string; gameId: number; team: number },
    activeGameSet: GameSet
  ): Promise<void> {
    // Store original position before deactivating
    const checkedOutPosition = currentCheckin.queuePosition;

    console.log('Starting HOME team checkout:', {
      username: currentCheckin.username,
      checkinId: currentCheckin.id,
      checkedOutPosition,
      gameId: currentCheckin.gameId,
      team: currentCheckin.team
    });

    // Log all active checkins before deactivation
    const beforeCheckins = await this.getCurrentCheckinsState();
    console.log('Checkins before deactivation:', beforeCheckins);

    // First deactivate current player's checkin and explicitly set queue_position to 0
    await db
      .update(checkins)
      .set({
        isActive: false,
        queuePosition: 0
      })
      .where(eq(checkins.id, currentCheckin.id));

    console.log(`Deactivated HOME player checkin ${currentCheckin.id} and set queue_position to 0`);

    // Get all active checkins after current player's position
    const availablePlayers = await db
      .select({
        id: checkins.id,
        userId: checkins.userId,
        username: users.username,
        queuePosition: checkins.queuePosition,
        isActive: checkins.isActive,
        gameId: checkins.gameId
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(
        and(
          eq(checkins.isActive, true),
          eq(checkins.checkInDate, getDateString(getCentralTime())),
          gt(checkins.queuePosition, checkedOutPosition) // Only players after the checked out position
        )
      )
      .orderBy(checkins.queuePosition);

    console.log('Available players for replacement:', availablePlayers);

    if (availablePlayers.length === 0) {
      throw new Error('No available players found after position ' + checkedOutPosition);
    }

    // Take the first available player as the next player
    const nextPlayerCheckin = availablePlayers[0];

    // Store next player's original position for decrementing logic
    const nextPlayerOriginalPosition = nextPlayerCheckin.queuePosition;

    console.log('HOME team replacement details:', {
      checkedOutPosition,
      nextPlayerUsername: nextPlayerCheckin.username,
      nextPlayerOldPosition: nextPlayerOriginalPosition,
      inheritingPosition: checkedOutPosition
    });

    // Update next player with game info and checked-out position
    await db
      .update(checkins)
      .set({
        gameId: currentCheckin.gameId,
        team: currentCheckin.team,
        queuePosition: checkedOutPosition // Inherit exact position
      })
      .where(eq(checkins.id, nextPlayerCheckin.id));

    console.log(`Updated next player ${nextPlayerCheckin.username} to inherit position ${checkedOutPosition}`);

    // Log intermediate state
    console.log('State after position inheritance:', await this.getCurrentCheckinsState());

    // Decrement positions only for Next Up players after nextPlayerCheckin's original position
    await db
      .update(checkins)
      .set({
        queuePosition: sql`${checkins.queuePosition} - 1`
      })
      .where(
        and(
          eq(checkins.isActive, true),
          eq(checkins.gameSetId, activeGameSet.id),
          eq(checkins.checkInDate, getDateString(getCentralTime())),
          gt(checkins.queuePosition, nextPlayerOriginalPosition)
        )
      );

    // Decrement queue_next_up
    await db
      .update(gameSets)
      .set({
        queueNextUp: sql`${gameSets.queueNextUp} - 1`
      })
      .where(eq(gameSets.id, activeGameSet.id));

    console.log('HOME team checkout complete - Updated Next Up positions and decremented queue_next_up');

    // Log final state
    console.log('Final checkins state:', await this.getCurrentCheckinsState());
  }

  private async handleAwayTeamCheckout(
    currentCheckin: { id: number; gameId: number; team: number; queuePosition: number; username: string },
    activeGameSet: GameSet
  ): Promise<void> {
    console.log(`AWAY team checkout - Processing checkout for ${currentCheckin.username} at position ${currentCheckin.queuePosition}`);

    // Store original position before deactivating
    const checkedOutPosition = currentCheckin.queuePosition;

    // First deactivate current player's checkin and explicitly set queue_position to 0    await db
    await db
      .update(checkins)      .set({
        isActive: false,
        queuePosition: 0
      })
      .where(eq(checkins.id, currentCheckin.id));
    console.log(`Deactivated AWAY player checkin ${currentCheckin.id} and set queue_position to 0`);

    // Get the next available player (first in Next Up)
    const [nextPlayerCheckin] = await db
      .select({
        id: checkins.id,
        userId: checkins.userId,
        username: users.username,
        queuePosition: checkins.queuePosition
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(
        and(
          eq(checkins.isActive, true),
          eq(checkins.gameId, null),
          eq(checkins.gameSetId, activeGameSet.id),
          eq(checkins.checkInDate, getDateString(getCentralTime()))
        )
      )
      .orderBy(checkins.queuePosition)
      .limit(1);

    if (!nextPlayerCheckin) {
      console.log('No available player for replacement');
      return; //Return early if no next player
    }

    // Store next player's original position for decrementing logic
    const nextPlayerOriginalPosition = nextPlayerCheckin.queuePosition;

    console.log('AWAY team replacement details:', {
      checkedOutPosition,
      nextPlayerUsername: nextPlayerCheckin.username,
      nextPlayerOriginalPosition
    });

    // Update next player with game info and checked-out position
    await db
      .update(checkins)
      .set({
        gameId: currentCheckin.gameId,
        team: currentCheckin.team,
        queuePosition: checkedOutPosition
      })
      .where(eq(checkins.id, nextPlayerCheckin.id));

    console.log(`Updated next player ${nextPlayerCheckin.username} to inherit position ${checkedOutPosition}`);

    // Update queue positions for all players after the next player
    await db
      .update(checkins)
      .set({
        queuePosition: sql`${checkins.queuePosition} - 1`
      })
      .where(
        and(
          eq(checkins.isActive, true),
          eq(checkins.gameSetId, activeGameSet.id),
          eq(checkins.checkInDate, getDateString(getCentralTime())),
          gt(checkins.queuePosition, nextPlayerCheckin.queuePosition)
        )
      );

    // Decrement game set's queue_next_up
    await db
      .update(gameSets)
      .set({
        queueNextUp: sql`${gameSets.queueNextUp} - 1`
      })
      .where(eq(gameSets.id, activeGameSet.id));
    console.log('Updated queue positions and decremented next_up for Away team checkout');
  }

  private async handleQueuePlayerCheckout(
    currentCheckin: { id: number; queuePosition: number; username: string },
    activeGameSet: GameSet
  ): Promise<void> {
    console.log(`Handling queue player checkout for ${currentCheckin.username}`);

    // Deactivate the checkin
    await db
      .update(checkins)
      .set({ isActive: false })
      .where(eq(checkins.id, currentCheckin.id));
    console.log(`Deactivated checkin ${currentCheckin.id}`);

    // Update queue positions for players after this one
    await db
      .update(checkins)
      .set({
        queuePosition: sql`${checkins.queuePosition} - 1`
      })
      .where(
        and(
          eq(checkins.isActive, true),
          eq(checkins.gameSetId, activeGameSet.id),
          eq(checkins.checkInDate, getDateString(getCentralTime())),
          gt(checkins.queuePosition, currentCheckin.queuePosition)
        )
      );
    console.log(`Updated queue positions after position ${currentCheckin.queuePosition}`);

    // Decrement game set's queue_next_up
    await db
      .update(gameSets)
      .set({
        queueNextUp: sql`${gameSets.queueNextUp} - 1`
      })
      .where(eq(gameSets.id, activeGameSet.id));
    console.log('Decremented game set queue_next_up');
  }

  async handlePlayerMove(userId: number, moveType: string): Promise<void> {
    console.log(`Handling player move:`, { userId, moveType });

    // Get active game set first
    const activeGameSet = await this.getActiveGameSet();
    if (!activeGameSet) {
      throw new Error('No active game set found');
    }

    // Get current checkin details
    const [currentCheckin] = await db
      .select({
        id: checkins.id,
        username: users.username,
        gameId: checkins.gameId,
        team: checkins.team,
        queuePosition: checkins.queuePosition,
        isActive: checkins.isActive
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(
        and(
          eq(checkins.userId, userId),
          eq(checkins.isActive, true),
          eq(checkins.checkInDate, getDateString(getCentralTime()))
        )
      );

    if (!currentCheckin) {
      throw new Error(`No active checkin found for user ${userId}`);
    }

    // Log initial state
    const initialState = await this.getCurrentCheckinsState();
    console.log('Initial checkins state:', initialState);
    console.log('Active game set:', {
      id: activeGameSet.id,
      currentQueuePosition: activeGameSet.currentQueuePosition
    });

    // Calculate relative position (1-based) from game set start
    const relativePosition = currentCheckin.queuePosition - activeGameSet.currentQueuePosition + 1;

    console.log('Position detection:', {
      username: currentCheckin.username,
      absolutePosition: currentCheckin.queuePosition,
      gameSetStart: activeGameSet.currentQueuePosition,
      relativePosition
    });

    // Determine position type based on relative position in current game set
    let playerPosition;
    if (relativePosition >= 1 && relativePosition <= 4) {
      playerPosition = 'HOME';
    } else if (relativePosition >= 5 && relativePosition <= 8) {
      playerPosition = 'AWAY';
    } else {
      playerPosition = 'NEXT_UP';
    }

    console.log(`Detected ${playerPosition} position for ${currentCheckin.username}`);

    if (isMoveType(moveType, 'CHECKOUT')) {
      if (playerPosition === 'HOME') {
        console.log(`Processing HOME team checkout for ${currentCheckin.username}:`, {
          checkinId: currentCheckin.id,
          queuePosition: currentCheckin.queuePosition,
          relativePosition
        });
        await this.handleHomeTeamCheckout(currentCheckin, activeGameSet);
      } else if (playerPosition === 'AWAY') {
        console.log(`Processing AWAY team checkout for ${currentCheckin.username}:`, {
          checkinId: currentCheckin.id,
          queuePosition: currentCheckin.queuePosition,
          relativePosition
        });
        await this.handleAwayTeamCheckout(currentCheckin, activeGameSet);
      } else {
        console.log(`Processing NEXT_UP checkout for ${currentCheckin.username}:`, {
          checkinId: currentCheckin.id,
          queuePosition: currentCheckin.queuePosition,
          relativePosition
        });
        await this.handleQueuePlayerCheckout(currentCheckin, activeGameSet);
      }

      // Log final state
      const finalState = await this.getCurrentCheckinsState();
      console.log('Final checkins state:', finalState);
    }
  }

  // Helper method to get formatted checkin state - renamed to be more specific
  private async getCurrentCheckinsState() {
    const currentCheckins = await db
      .select({
        id: checkins.id,
        username: users.username,
        queuePosition: checkins.queuePosition,
        isActive: checkins.isActive,
        gameId: checkins.gameId,
        team: checkins.team
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(eq(checkins.checkInDate, getDateString(getCentralTime())))
      .orderBy(checkins.queuePosition);

    return currentCheckins.map(c => ({
      username: c.username,
      pos: c.queuePosition,
      active: c.isActive,
      gameId: c.gameId,
      team: c.team
    }));
  }

  async determinePromotionType(gameId: number): Promise<{ type: 'win_promoted' | 'loss_promoted', team: 1 | 2 } | null> {
    // Get the completed game with its game set info
    const [game] = await db
      .select({
        id: games.id,
        setId: games.setId,
        court: games.court,
        team1Score: games.team1Score,
        team2Score: games.team2Score,
        maxConsecutiveTeamWins: gameSets.maxConsecutiveTeamWins
      })
      .from(games)
      .innerJoin(gameSets, eq(games.setId, gameSets.id))
      .where(eq(games.id, gameId));

    if (!game) throw new Error(`Game ${gameId} not found`);

    // Get previous games on this court in this set using lt instead of < for id comparison
    const previousGames = await db
      .select()
      .from(games)
      .where(
        and(
          eq(games.setId, game.setId),
          eq(games.court, game.court),
          eq(games.state, 'final'),
          lt(games.id, gameId)
        )
      )
      .orderBy(desc(games.id));

    // Determine winning team of current game
    const winningTeam = game.team1Score! > game.team2Score! ? 1 : 2;

    // Count consecutive wins for the winning team
    let consecutiveWins = 1;
    for (const prevGame of previousGames) {
      const prevWinner = prevGame.team1Score! > prevGame.team2Score! ? 1 : 2;
      if (prevWinner === winningTeam) {
        consecutiveWins++;
      } else {
        break;
      }
    }

    console.log('Promotion check:', {
      gameId,
      court: game.court,
      winningTeam,
      consecutiveWins,
      maxAllowed: game.maxConsecutiveTeamWins
    });

    // If team hasn't exceeded max consecutive wins, they get promoted
    if (consecutiveWins < game.maxConsecutiveTeamWins) {
      return { type: 'win_promoted', team: winningTeam };
    }

    // If team has reached max consecutive wins, losing team gets promoted
    return { type: 'loss_promoted', team: winningTeam === 1 ? 2 : 1 };
  }

  async getGameSetLog(gameSetId: number): Promise<any[]> {
    // Get all checkins for this game set with user info
    const checkinsWithUsers = await db
      .select({
        queuePosition: checkins.queuePosition,
        userId: checkins.userId,
        username: users.username,
        checkInTime: checkins.checkInTime,
        gameId: checkins.gameId,
        type: checkins.type
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(eq(checkins.gameSetId, gameSetId))
      .orderBy(checkins.queuePosition);

    // Get all games for this set with player info
    const gamesWithPlayers = await db
      .select({
        id: games.id,
        court: games.court,
        state: games.state,
        team1Score: games.team1Score,
        team2Score: games.team2Score,
        startTime: games.startTime,
        endTime: games.endTime,
      })
      .from(games)
      .where(eq(games.setId, gameSetId));

    // Get player assignments for each game
    const gamePlayerAssignments = await Promise.all(
      gamesWithPlayers.map(async (game) => {
        const players = await db
          .select({
            gameId: gamePlayers.gameId,
            userId: gamePlayers.userId,
            team: gamePlayers.team,
          })
          .from(gamePlayers)
          .where(eq(gamePlayers.gameId, game.id));
        return { ...game, players };
      })
    );

    // Combine checkins with game information
    return checkinsWithUsers.map((checkin) => {
      // Find game where this user played
      const gameInfo = gamePlayerAssignments.find((game) =>
        game.players.some((p) => p.userId === checkin.userId)
      );

      if (!gameInfo) {
        return {
          ...checkin,
          gameStatus: "Pending",
          team: null,
          score: null,
          court: null,
          type: checkin.type
        };
      }

      const playerInfo = gameInfo.players.find((p) => p.userId === checkin.userId);
      const team = playerInfo?.team === 1 ? "Home" : "Away";
      const score =
        gameInfo.state === "final"
          ? `${gameInfo.team1Score}-${gameInfo.team2Score}`
          : "In Progress";

      return {
        ...checkin,
        gameStatus: gameInfo.state,
        team,
        score,
        court: gameInfo.court,
        type: checkin.type
      };
    });
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

    // Check for existing active checkin for this user
    const existingCheckins = await db
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.userId, userId),
          eq(checkins.clubIndex, clubIndex),
          eq(checkins.isActive, true),
          eq(checkins.checkInDate, today)
        )
      );

    // If user already has an active checkin, return it
    if (existingCheckins.length > 0) {
      console.log(`User ${userId} already has an active checkin for today:`, existingCheckins[0]);
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
        queuePosition: activeGameSet.queueNextUp,
        type: 'manual',
        gameId: null,
        team: null
      })
      .returning();

    // Increment the game set's queueNextUp (tail pointer)
    await db
      .update(gameSets)
      .set({
        queueNextUp: activeGameSet.queueNextUp + 1
      })
      .where(eq(gameSets.id, activeGameSet.id));

    console.log(`Created new checkin:`, checkin);
    return checkin;
  }

  async deactivatePlayerCheckin(userId: number): Promise<void> {
    console.log(`Deactivating checkin for user ${userId}`);
    const today = getDateString(getCentralTime());

    await db
      .update(checkins)
      .set({ isActive: false })
      .where(
        and(
          eq(checkins.userId, userId),
          eq(checkins.isActive, true),
          eq(checkins.checkInDate, today)
        )
      );
  }

  private async handleHomeTeamCheckout(
    currentCheckin: { id: number; queuePosition: number; username: string; gameId: number; team: number },
    activeGameSet: GameSet
  ): Promise<void> {
    // Store original position before deactivating
    const checkedOutPosition = currentCheckin.queuePosition;

    // Calculate the minimum position for NEXT_UP players
    const nextUpMinPosition = activeGameSet.currentQueuePosition + (2 * activeGameSet.playersPerTeam);
    console.log(`Calculated NEXT_UP minimum position: ${nextUpMinPosition} (currentQueuePosition: ${activeGameSet.currentQueuePosition}, playersPerTeam: ${activeGameSet.playersPerTeam})`);

    console.log("Starting HOME team checkout:", {
      username: currentCheckin.username,
      checkinId: currentCheckin.id,
      checkedOutPosition,
      gameId: currentCheckin.gameId,
      team: currentCheckin.team
    });

    // Log all active checkins before deactivation
    const beforeCheckins = await this.getCurrentCheckinsState();
    console.log("Checkins before deactivation:", beforeCheckins);

    // First deactivate current player's checkin and explicitly set queue_position to 0
    await db
      .update(checkins)
      .set({
        isActive: false,
        queuePosition: 0
      })
      .where(eq(checkins.id, currentCheckin.id));

    console.log(`Deactivated HOME player checkin ${currentCheckin.id} and set queue_position to 0`);

    // Get all active NEXT_UP players (those with queue positions >= nextUpMinPosition)
    const availablePlayers = await db
      .select({
        id: checkins.id,
        userId: checkins.userId,
        username: users.username,
        queuePosition: checkins.queuePosition,
        isActive: checkins.isActive,
        gameId: checkins.gameId
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(
        and(
          eq(checkins.isActive, true),
          eq(checkins.checkInDate, getDateString(getCentralTime())),
          gte(checkins.queuePosition, nextUpMinPosition) // Only NEXT_UP players
        )
      )
      .orderBy(checkins.queuePosition);

    console.log("Available NEXT_UP players for replacement:", availablePlayers);

    if (availablePlayers.length === 0) {
      throw new Error("No available NEXT_UP players found to replace HOME team player");
    }

    // Take the first NEXT_UP player as the replacement
    const nextPlayerCheckin = availablePlayers[0];

    // Store next player's original position for decrementing logic
    const nextPlayerOriginalPosition = nextPlayerCheckin.queuePosition;

    console.log("HOME team replacement details:", {
      checkedOutPosition,
      nextPlayerUsername: nextPlayerCheckin.username,
      nextPlayerOldPosition: nextPlayerOriginalPosition,
      inheritingPosition: checkedOutPosition
    });

    // Update next player with game info and checked-out position
    await db
      .update(checkins)
      .set({
        gameId: currentCheckin.gameId,
        team: currentCheckin.team,
        queuePosition: checkedOutPosition // Inherit exact position
      })
      .where(eq(checkins.id, nextPlayerCheckin.id));

    console.log(`Updated next player ${nextPlayerCheckin.username} to inherit position ${checkedOutPosition}`);

    // Log intermediate state
    console.log("State after position inheritance:", await this.getCurrentCheckinsState());

    // Decrement positions only for Next Up players after nextPlayerCheckin's original position
    await db
      .update(checkins)
      .set({
        queuePosition: sql`${checkins.queuePosition} - 1`
      })
      .where(
        and(
          eq(checkins.isActive, true),
          eq(checkins.gameSetId, activeGameSet.id),
          eq(checkins.checkInDate, getDateString(getCentralTime())),
          gt(checkins.queuePosition, nextPlayerOriginalPosition),
          gte(checkins.queuePosition, nextUpMinPosition) // Only affect NEXT_UP players
        )
      );

    // Decrement queue_next_up
    await db
      .update(gameSets)
      .set({
        queueNextUp: sql`${gameSets.queueNextUp} - 1`
      })
      .where(eq(gameSets.id, activeGameSet.id));

    console.log("HOME team checkout complete - Updated Next Up positions and decremented queue_next_up");

    // Log final state
    console.log("Final checkins state:", await this.getCurrentCheckinsState());
  }

  private async handleAwayTeamCheckout(
    currentCheckin: { id: number; gameId: number; team: number; queuePosition: number; username: string },
    activeGameSet: GameSet
  ): Promise<void> {
    console.log(`AWAY team checkout - Processing checkout for ${currentCheckin.username} at position ${currentCheckin.queuePosition}`);

    // Store original position before deactivating
    const checkedOutPosition = currentCheckin.queuePosition;

    // First deactivate current player's checkin and explicitly set queue_position to 0    await db
    await db
      .update(checkins)
      .set({
        isActive: false,
        queuePosition: 0
      })
      .where(eq(checkins.id, currentCheckin.id));
    console.log(`Deactivated AWAY player checkin ${currentCheckin.id} and set queue_position to 0`);

    // Get the next available player (first in Next Up)
    const [nextPlayerCheckin] = await db
      .select({
        id: checkins.id,
        userId: checkins.userId,
        username: users.username,
        queuePosition: checkins.queuePosition
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(
        and(
          eq(checkins.isActive, true),
          eq(checkins.gameId, null),
          eq(checkins.gameSetId, activeGameSet.id),
          eq(checkins.checkInDate, getDateString(getCentralTime()))
        )
      )
      .orderBy(checkins.queuePosition)
      .limit(1);

    if (nextPlayerCheckin) {
      // We have a replacement player
      // Store next player's original position for decrementing logic
      const nextPlayerOriginalPosition = nextPlayerCheckin.queuePosition;

      console.log('AWAY team replacement details:', {
        checkedOutPosition,
        nextPlayerUsername: nextPlayerCheckin.username,
        nextPlayerOriginalPosition
      });

      // Update next player with game info and checked-out position
      await db
        .update(checkins)
        .set({
          gameId: currentCheckin.gameId,
          team: currentCheckin.team,
          queuePosition: checkedOutPosition
        })
        .where(eq(checkins.id, nextPlayerCheckin.id));

      console.log(`Updated next player ${nextPlayerCheckin.username} to inherit position ${checkedOutPosition}`);

      // Update queue positions for all players after the next player
      await db
        .update(checkins)
        .set({
          queuePosition: sql`${checkins.queuePosition} - 1`
        })
        .where(
          and(
            eq(checkins.isActive, true),
            eq(checkins.gameSetId, activeGameSet.id),
            eq(checkins.checkInDate, getDateString(getCentralTime())),
            gt(checkins.queuePosition, nextPlayerOriginalPosition)
          )
        );
    } else {
      console.log('No available player for replacement');
      
      // Even without a replacement, we need to decrement higher queue positions
      // Decrement queue positions for all active players with positions higher than the checked out player
      await db
        .update(checkins)
        .set({
          queuePosition: sql`${checkins.queuePosition} - 1`
        })
        .where(
          and(
            eq(checkins.isActive, true),
            eq(checkins.gameSetId, activeGameSet.id),
            eq(checkins.checkInDate, getDateString(getCentralTime())),
            gt(checkins.queuePosition, checkedOutPosition)
          )
        );
      
      console.log(`Decremented queue positions for all players after position ${checkedOutPosition}`);
    }

    // Decrement game set's queue_next_up
    await db
      .update(gameSets)
      .set({
        queueNextUp: sql`${gameSets.queueNextUp} - 1`
      })
      .where(eq(gameSets.id, activeGameSet.id));
    console.log('Updated queue positions and decremented next_up for Away team checkout');
  }

  private async handleQueuePlayerCheckout(
    currentCheckin: { id: number; queuePosition: number; username: string },
    activeGameSet: GameSet
  ): Promise<void> {
    console.log(`Handling queue player checkout for ${currentCheckin.username}`);

    // Deactivate the checkin
    await db
      .update(checkins)
      .set({ isActive: false })
      .where(eq(checkins.id, currentCheckin.id));
    console.log(`Deactivated checkin ${currentCheckin.id}`);

    // Update queue positions for players after this one
    await db
      .update(checkins)
      .set({
        queuePosition: sql`${checkins.queuePosition} - 1`
      })
      .where(
        and(
          eq(checkins.isActive, true),
          eq(checkins.gameSetId, activeGameSet.id),
          eq(checkins.checkInDate, getDateString(getCentralTime())),
          gt(checkins.queuePosition, currentCheckin.queuePosition)
        )
      );
    console.log(`Updated queue positions after position ${currentCheckin.queuePosition}`);

    // Decrement game set's queue_next_up
    await db
      .update(gameSets)
      .set({
        queueNextUp: sql`${gameSets.queueNextUp} - 1`
      })
      .where(eq(gameSets.id, activeGameSet.id));
    console.log('Decremented game set queue_next_up');
  }

  async handlePlayerMove(userId: number, moveType: string): Promise<void> {
    console.log(`Handling player move:`, { userId, moveType });

    // Get active game set first
    const activeGameSet = await this.getActiveGameSet();
    if (!activeGameSet) {
      throw new Error('No active game set found');
    }

    // Get current checkin details
    const [currentCheckin] = await db
      .select({
        id: checkins.id,
        username: users.username,
        gameId: checkins.gameId,
        team: checkins.team,
        queuePosition: checkins.queuePosition,
        isActive: checkins.isActive
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(
        and(
          eq(checkins.userId, userId),
          eq(checkins.isActive, true),
          eq(checkins.checkInDate, getDateString(getCentralTime()))
        )
      );

    if (!currentCheckin) {
      throw new Error(`No active checkin found for user ${userId}`);
    }

    // Log initial state
    const initialState = await this.getCurrentCheckinsState();
    console.log('Initial checkins state:', initialState);
    console.log('Active game set:', {
      id: activeGameSet.id,
      currentQueuePosition: activeGameSet.currentQueuePosition
    });

    // Calculate relative position (1-based) from game set start
    const relativePosition = currentCheckin.queuePosition - activeGameSet.currentQueuePosition + 1;

    console.log('Position detection:', {
      username: currentCheckin.username,
      absolutePosition: currentCheckin.queuePosition,
      gameSetStart: activeGameSet.currentQueuePosition,
      relativePosition
    });

    // Determine position type based on relative position in current game set
    let playerPosition;
    if (relativePosition >= 1 && relativePosition <= 4) {
      playerPosition = 'HOME';
    } else if (relativePosition >= 5 && relativePosition <= 8) {
      playerPosition = 'AWAY';
    } else {
      playerPosition = 'NEXT_UP';
    }

    console.log(`Detected ${playerPosition} position for ${currentCheckin.username}`);

    if (isMoveType(moveType, 'CHECKOUT')) {
      if (playerPosition === 'HOME') {
        console.log(`Processing HOME team checkout for ${currentCheckin.username}:`, {
          checkinId: currentCheckin.id,
          queuePosition: currentCheckin.queuePosition,
          relativePosition
        });
        await this.handleHomeTeamCheckout(currentCheckin, activeGameSet);
      } else if (playerPosition === 'AWAY') {
        console.log(`Processing AWAY team checkout for ${currentCheckin.username}:`, {
          checkinId: currentCheckin.id,
          queuePosition: currentCheckin.queuePosition,
          relativePosition
        });
        await this.handleAwayTeamCheckout(currentCheckin, activeGameSet);
      } else {
        console.log(`Processing NEXT_UP checkout for ${currentCheckin.username}:`, {
          checkinId: currentCheckin.id,
          queuePosition: currentCheckin.queuePosition,
          relativePosition
        });
        await this.handleQueuePlayerCheckout(currentCheckin, activeGameSet);
      }

      // Log final state
      const finalState = await this.getCurrentCheckinsState();
      console.log('Final checkins state:', finalState);
    }
  }

  // Helper method to get formatted checkin state - renamed to be more specific
  private async getCurrentCheckinsState() {
    const currentCheckins = await db
      .select({
        id: checkins.id,
        username: users.username,
        queuePosition: checkins.queuePosition,
        isActive: checkins.isActive,
        gameId: checkins.gameId,
        team: checkins.team
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .where(eq(checkins.checkInDate, getDateString(getCentralTime())))
      .orderBy(checkins.queuePosition);

    return currentCheckins.map(c => ({
      username: c.username,
      pos: c.queuePosition,
      active: c.isActive,
      gameId: c.gameId,
      team: c.team
    }));
  }

}

export const storage = new DatabaseStorage();

if (process.env.ADMIN_INITIAL_PASSWORD) {
  const scryptAsync = promisify(scrypt);

  async function hashPassword(password: string) {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  }

  hashPassword(process.env.ADMIN_INITIAL_PASSWORD).then(async hashedPassword => {
    const existingAdmin = await storage.getUserByUsername("scuzzydude");
    if (!existingAdmin) {
      await storage.createUser({
        username: "scuzzydude",
        password: hashedPassword,
        firstName: null,
        lastName: null,
        birthYear: 1900,
        birthMonth: undefined,
        birthDay: undefined,
        isPlayer: true,
        isBank: true,
        isBook: true,
        isEngineer: true,
        isRoot: true,
      });
    }
  });
}