/**
 * Type definitions for the game population state machine
 */

// Game population states
export enum PopulationState {
  WAITING_FOR_PLAYERS = "WAITING_FOR_PLAYERS",
  TEAM_ASSIGNMENT = "TEAM_ASSIGNMENT",
  COURT_SELECTION = "COURT_SELECTION",
  GAME_CREATION = "GAME_CREATION",
  COMPLETE = "COMPLETE"
}

// Player status in the game
export enum PlayerStatus {
  AVAILABLE = "AVAILABLE",
  ASSIGNED = "ASSIGNED",
  ACTIVE = "ACTIVE",
  BENCHED = "BENCHED"
}

// Movement types for player repositioning
export enum MoveType {
  CHECKOUT = "CHECKOUT",
  BUMP = "BUMP",
  HORIZONTAL_SWAP = "HORIZONTAL_SWAP",
  VERTICAL_SWAP = "VERTICAL_SWAP"
}

// Game configuration parameters
export type GameConfig = {
  minPlayersPerTeam: number;
  maxPlayersPerTeam: number;
  maxConsecutiveLosses: number;
  courtPreference: string[];
};

// Player representation for game assignment
export type Player = {
  id: number;
  username: string;
  gamesPlayed: number;
  consecutiveLosses: number;
  lastGameTime?: Date;
  status: PlayerStatus;
  birthYear?: number;
  isOG?: boolean;
};

// Team composition
export type Team = {
  players: Player[];
  avgSkillRating: number;
  totalGamesPlayed: number;
  ogCount: number;
};

// Game state for the population algorithm
export type GameState = {
  currentState: PopulationState;
  availablePlayers: Player[];
  teamA: Team;
  teamB: Team;
  selectedCourt: string | null;
  config: GameConfig;
};

// Movement operation result
export type MoveResult = {
  success: boolean;
  message?: string;
  updatedState: GameState;
};