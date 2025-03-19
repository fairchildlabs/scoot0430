import { 
  type Team, type InsertTeam,
  type Player, type InsertPlayer,
  type Game, type InsertGame
} from "@shared/schema";

export interface IStorage {
  // Teams
  getTeams(): Promise<Team[]>;
  getTeam(id: number): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  
  // Players
  getPlayers(teamId: number): Promise<Player[]>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  
  // Games
  getGames(): Promise<Game[]>;
  getGame(id: number): Promise<Game | undefined>;
  createGame(game: InsertGame): Promise<Game>;
  updateGameScore(id: number, homeScore: number, awayScore: number): Promise<Game>;
}

export class MemStorage implements IStorage {
  private teams: Map<number, Team>;
  private players: Map<number, Player>;
  private games: Map<number, Game>;
  private currentTeamId: number;
  private currentPlayerId: number;
  private currentGameId: number;

  constructor() {
    this.teams = new Map();
    this.players = new Map();
    this.games = new Map();
    this.currentTeamId = 1;
    this.currentPlayerId = 1;
    this.currentGameId = 1;
  }

  async getTeams(): Promise<Team[]> {
    return Array.from(this.teams.values());
  }

  async getTeam(id: number): Promise<Team | undefined> {
    return this.teams.get(id);
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const id = this.currentTeamId++;
    const newTeam = { ...team, id };
    this.teams.set(id, newTeam);
    return newTeam;
  }

  async getPlayers(teamId: number): Promise<Player[]> {
    return Array.from(this.players.values()).filter(p => p.teamId === teamId);
  }

  async createPlayer(player: InsertPlayer): Promise<Player> {
    const id = this.currentPlayerId++;
    const newPlayer = { ...player, id };
    this.players.set(id, newPlayer);
    return newPlayer;
  }

  async getGames(): Promise<Game[]> {
    return Array.from(this.games.values());
  }

  async getGame(id: number): Promise<Game | undefined> {
    return this.games.get(id);
  }

  async createGame(game: InsertGame): Promise<Game> {
    const id = this.currentGameId++;
    const newGame = { ...game, id };
    this.games.set(id, newGame);
    return newGame;
  }

  async updateGameScore(id: number, homeScore: number, awayScore: number): Promise<Game> {
    const game = this.games.get(id);
    if (!game) throw new Error("Game not found");
    
    const updatedGame = { 
      ...game, 
      homeScore, 
      awayScore,
      completed: true
    };
    this.games.set(id, updatedGame);
    return updatedGame;
  }
}

export const storage = new MemStorage();
