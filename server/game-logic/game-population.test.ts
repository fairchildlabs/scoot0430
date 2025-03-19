import { 
  initializeGameState, 
  transitionGameState,
  populateGame 
} from './game-population';
import { 
  PopulationState, 
  PlayerStatus,
  GameConfig 
} from './types';

/**
 * Test suite for game population algorithm
 * Shows how the state machine progresses through different states
 */

describe('Game Population Algorithm', () => {
  const testConfig: GameConfig = {
    minPlayersPerTeam: 3,
    maxPlayersPerTeam: 5,
    maxConsecutiveLosses: 2,
    courtPreference: ['West', 'East']
  };

  test('initializes with correct state', () => {
    const state = initializeGameState(testConfig);
    expect(state.currentState).toBe(PopulationState.WAITING_FOR_PLAYERS);
    expect(state.availablePlayers).toHaveLength(0);
    expect(state.teamA.players).toHaveLength(0);
    expect(state.teamB.players).toHaveLength(0);
  });

  test('transitions through states with sufficient players', () => {
    let state = initializeGameState(testConfig);
    
    // Add test players
    state.availablePlayers = Array(6).fill(null).map((_, i) => ({
      id: i + 1,
      username: `player${i + 1}`,
      gamesPlayed: Math.floor(Math.random() * 10),
      consecutiveLosses: 0,
      status: PlayerStatus.AVAILABLE
    }));

    // Test state transitions
    state = transitionGameState(state);
    expect(state.currentState).toBe(PopulationState.TEAM_ASSIGNMENT);

    state = transitionGameState(state);
    expect(state.currentState).toBe(PopulationState.COURT_SELECTION);
    expect(state.teamA.players).toHaveLength(3);
    expect(state.teamB.players).toHaveLength(3);

    state = transitionGameState(state);
    expect(state.currentState).toBe(PopulationState.GAME_CREATION);
    expect(state.selectedCourt).toBe('West');

    state = transitionGameState(state);
    expect(state.currentState).toBe(PopulationState.COMPLETE);
  });

  test('stays in WAITING_FOR_PLAYERS with insufficient players', () => {
    let state = initializeGameState(testConfig);
    
    // Add insufficient number of players
    state.availablePlayers = Array(4).fill(null).map((_, i) => ({
      id: i + 1,
      username: `player${i + 1}`,
      gamesPlayed: 0,
      consecutiveLosses: 0,
      status: PlayerStatus.AVAILABLE
    }));

    state = transitionGameState(state);
    expect(state.currentState).toBe(PopulationState.WAITING_FOR_PLAYERS);
  });
});
