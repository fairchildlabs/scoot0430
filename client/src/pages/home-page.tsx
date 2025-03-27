import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, HandMetal, X } from "lucide-react";
import { ScootLogo } from "@/components/logos/scoot-logo";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { apiRequest, scootdApiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface GameSetStatus {
  game_set?: {
    id: number;
    is_active: boolean;
    current_position: number;
    queue_next_up: number;
    max_consecutive_games: number;
  };
  game_set_info?: {
    id: number;
    created_by: string;
    gym: string;
    number_of_courts: number;
    max_consecutive_games: number;
    current_queue_position: number;
    queue_next_up: number;
    created_at: string;
    is_active: boolean;
  };
  active_games: {
    id: number;
    court: string;
    state?: string;
    team1_score: number | null;
    team2_score: number | null;
    start_time: string;
    end_time?: string | null;
    players: {
      user_id: number;
      username: string;
      position?: number;
      queue_position?: number;
      team: number;
      birth_year?: number;
      is_og?: boolean;
    }[];
  }[];
  next_up_players: {
    user_id: number;
    username: string;
    position: number;
    birth_year?: number;
    is_og?: boolean;
    checkin_type?: string;
    type?: string;
    team?: number | null;
  }[];
  recent_completed_games: {
    id: number;
    court: string;
    state?: string;
    team1_score: number | null;
    team2_score: number | null;
    start_time: string;
    end_time?: string | null;
    completed_at?: string;
    players: {
      user_id: number;
      username: string;
      position?: number;
      queue_position?: number;
      team: number;
      birth_year?: number;
      is_og?: boolean;
      checkin_type?: string;
    }[];
  }[];
  
  // For backward compatibility with our UI
  id: number;
  gym: string;
  playersPerTeam: number;
  numberOfCourts: number;
  currentQueuePosition: number;
  createdAt: string;
  games: {
    id: number;
    court: string;
    state: string;
    team1Score: number | null;
    team2Score: number | null;
    startTime: string;
    endTime: string | null;
    players: {
      username: string;
      queuePosition: number;
      team: number;
      birthYear?: number;
    }[];
  }[];
  nextUp: {
    username: string;
    queuePosition: number;
    type: string;
    team: number | null;
    birthYear?: number;
    user_id?: number;  // Add user_id field
  }[];
}

export default function HomePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [gameScores, setGameScores] = useState<Record<number, { showInputs: boolean; team1Score?: number; team2Score?: number }>>({});
  const { toast } = useToast();
  
  // State for scootd-based data
  const [gameSetStatus, setGameSetStatus] = useState<GameSetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch game set status using scootd
  const fetchGameSetStatus = async () => {
    try {
      setLoading(true);
      const data = await scootdApiRequest<any>("GET", "game-set-status");
      
      // Transform the data from scootd API format to our UI format
      const transformedData: GameSetStatus = {
        // Game set info
        id: data.game_set?.id || 0,
        gym: data.game_set_info?.gym || "",
        playersPerTeam: data.game_set_info?.max_consecutive_games || 4,
        numberOfCourts: data.game_set_info?.number_of_courts || 1,
        currentQueuePosition: data.game_set_info?.current_queue_position || 0,
        createdAt: data.game_set_info?.created_at || new Date().toISOString(),
        
        // Original fields from scootd
        game_set: data.game_set,
        game_set_info: data.game_set_info,
        active_games: data.active_games || [],
        next_up_players: data.next_up_players || [],
        recent_completed_games: data.recent_completed_games || [],
        
        // Transform games for UI
        games: [
          ...(data.active_games || []).map((g: any) => ({
            id: g.id,
            court: g.court,
            state: g.state || 'started', // Default active games to 'started' state
            team1Score: g.team1_score,
            team2Score: g.team2_score,
            startTime: g.start_time,
            endTime: g.end_time,
            players: (g.players || []).map((p: any) => ({
              username: p.username,
              queuePosition: p.position || p.queue_position,
              team: p.team,
              birthYear: p.birth_year
            }))
          })),
          ...(data.recent_completed_games || []).map((g: any) => ({
            id: g.id,
            court: g.court,
            state: g.state || 'final', // Default to 'final' for completed games
            team1Score: g.team1_score,
            team2Score: g.team2_score,
            startTime: g.start_time,
            endTime: g.end_time || g.completed_at, // Use end_time or completed_at
            players: (g.players || []).map((p: any) => ({
              username: p.username,
              queuePosition: p.position || p.queue_position,
              team: p.team,
              birthYear: p.birth_year,
              isOG: p.is_og,
              checkin_type: p.checkin_type
            }))
          }))
        ],
        
        // Transform next up players for UI
        nextUp: (data.next_up_players || []).map((p: any) => ({
          username: p.username,
          queuePosition: p.position || p.queue_position,  // Use position from API or fallback to queue_position
          type: p.checkin_type || p.type,
          team: p.team,
          birthYear: p.birth_year,
          isOG: p.is_og,
          user_id: p.user_id  // Include user_id for player actions
        }))
      };
      
      setGameSetStatus(transformedData);
      setError(null);
      console.log('Fetched and transformed game set status:', transformedData);
    } catch (err) {
      console.error('Error fetching game set status:', err);
      setError('Failed to load game status');
    } finally {
      setLoading(false);
    }
  };

  // Fetch data initially, but don't poll
  useEffect(() => {
    if (user) {
      fetchGameSetStatus();
      // No polling interval - we'll only refresh data when explicit actions are taken
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-border" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Calculate current year for OG status
  const currentYear = new Date().getFullYear();
  const isOG = (birthYear?: number) => {
    if (!birthYear) return false;
    return (currentYear - birthYear) >= 75;
  };

  // Get players for the NEXT_UP list from the gameSetStatus
  const nextUpPlayers = gameSetStatus?.nextUp || [];
  
  // Add debugging for nextUpPlayers
  console.log('Next up players with their types:', nextUpPlayers.map(p => ({
    username: p.username,
    type: p.type,
    team: p.team,
    pos: p.queuePosition,
    user_id: p.user_id  // Add user_id to debug output
  })));

  // Separate active and finished games from the gameSetStatus
  const activeGamesList = gameSetStatus?.games.filter(game => game.state === 'started') || [];
  const finishedGamesList = gameSetStatus?.games.filter(game => game.state === 'final') || [];

  // Log game states for debugging
  console.log('Games from scootd with their states:', gameSetStatus?.games.map(game => ({
    id: game.id,
    state: game.state,
    court: game.court,
    endTime: game.endTime
  })));
  
  // Debug the active game players for each team
  const activeGame = gameSetStatus?.games.find(game => game.state === 'started');
  if (activeGame) {
    console.log('Active Game Players:', {
      gameId: activeGame.id,
      homePlayers: activeGame.players.filter(p => p.team === 1).map(p => ({
        username: p.username,
        queuePosition: p.queuePosition,
        team: p.team
      })),
      awayPlayers: activeGame.players.filter(p => p.team === 2).map(p => ({
        username: p.username,
        queuePosition: p.queuePosition,
        team: p.team
      }))
    });
  }

  const toggleScoreInputs = (gameId: number) => {
    setGameScores(prev => ({
      ...prev,
      [gameId]: {
        showInputs: !prev[gameId]?.showInputs,
        team1Score: prev[gameId]?.team1Score,
        team2Score: prev[gameId]?.team2Score
      }
    }));
  };

  const updateScore = (gameId: number, team: 'team1Score' | 'team2Score', value: string) => {
    const numValue = parseInt(value);
    if (!isNaN(numValue)) {
      setGameScores(prev => ({
        ...prev,
        [gameId]: {
          ...prev[gameId],
          [team]: numValue
        }
      }));
    }
  };

  const handleEndGame = async (gameId: number) => {
    const scores = gameScores[gameId];
    if (scores?.team1Score === undefined || scores?.team2Score === undefined) {
      return;
    }

    try {
      console.log(`Submitting final scores for game ${gameId} using scootd:`, scores);
      
      // Use the scootd end-game command API endpoint
      const response = await scootdApiRequest("POST", "end-game", {
        gameId: gameId,
        homeScore: scores.team1Score,
        awayScore: scores.team2Score,
        autoPromote: true  // Enable automatic promotion of players
      });

      console.log('Game ended successfully with scootd:', response);
      
      // Show success toast
      toast({
        title: "Game Ended",
        description: `Game #${gameId} ended with score: ${scores.team1Score}-${scores.team2Score}`,
      });

      // Reset game scores state
      setGameScores(prev => ({
        ...prev,
        [gameId]: {
          showInputs: false,
          team1Score: undefined,
          team2Score: undefined
        }
      }));

      // If we got a full game set status response back from scootd, transform and update state directly
      if (response && typeof response === 'object') {
        if ('games' in response) {
          // Response is already in our UI format
          setGameSetStatus(response as GameSetStatus);
          console.log('Updated game set status with direct response data:', response);
        } else if ('active_games' in response || 'game_set' in response) {
          // Response is in scootd format, need to transform
          // Define the type for the scootd response
          type ScootdResponse = {
            game_set?: {
              id: number;
              is_active: boolean;
              current_position: number;
              queue_next_up: number;
              max_consecutive_games: number;
            };
            game_set_info?: {
              id: number;
              created_by: string;
              gym: string;
              number_of_courts: number;
              max_consecutive_games: number;
              current_queue_position: number;
              queue_next_up: number;
              created_at: string;
              is_active: boolean;
            };
            active_games?: any[];
            next_up_players?: any[];
            recent_completed_games?: any[];
          };
          
          // Type assertion to help TypeScript understand the structure
          const scootdData = response as ScootdResponse;
          
          const transformedData: GameSetStatus = {
            id: scootdData.game_set?.id || 0,
            gym: scootdData.game_set_info?.gym || "",
            playersPerTeam: scootdData.game_set_info?.max_consecutive_games || 4,
            numberOfCourts: scootdData.game_set_info?.number_of_courts || 1,
            currentQueuePosition: scootdData.game_set_info?.current_queue_position || 0,
            createdAt: scootdData.game_set_info?.created_at || new Date().toISOString(),
            
            // Original fields from scootd
            game_set: scootdData.game_set,
            game_set_info: scootdData.game_set_info,
            active_games: scootdData.active_games || [],
            next_up_players: scootdData.next_up_players || [],
            recent_completed_games: scootdData.recent_completed_games || [],
            
            // Transform games for UI
            games: [
              ...(scootdData.active_games || []).map((g: any) => ({
                id: g.id,
                court: g.court,
                state: g.state || 'started', // Default active games to 'started' state
                team1Score: g.team1_score,
                team2Score: g.team2_score,
                startTime: g.start_time,
                endTime: g.end_time,
                players: (g.players || []).map((p: any) => ({
                  username: p.username,
                  queuePosition: p.position || p.queue_position,
                  team: p.team,
                  birthYear: p.birth_year,
                  isOG: p.is_og,
                  checkin_type: p.checkin_type
                }))
              })),
              ...(scootdData.recent_completed_games || []).map((g: any) => ({
                id: g.id,
                court: g.court,
                state: g.state || 'final',
                team1Score: g.team1_score,
                team2Score: g.team2_score,
                startTime: g.start_time,
                endTime: g.end_time || g.completed_at, // Use end_time or completed_at
                players: (g.players || []).map((p: any) => ({
                  username: p.username,
                  queuePosition: p.position || p.queue_position,
                  team: p.team,
                  birthYear: p.birth_year,
                  isOG: p.is_og,
                  checkin_type: p.checkin_type
                }))
              }))
            ],
            
            // Transform next up players for UI
            nextUp: (scootdData.next_up_players || []).map((p: any) => ({
              username: p.username,
              queuePosition: p.position || p.queue_position,  // Use position from API or fallback to queue_position
              type: p.checkin_type || p.type,
              team: p.team,
              birthYear: p.birth_year,
              isOG: p.is_og,
              user_id: p.user_id  // Include user_id for player actions
            }))
          };
          
          setGameSetStatus(transformedData);
          console.log('Transformed and updated game set status from response:', transformedData);
        } else {
          // Response is in an unknown format, fetch fresh data
          await fetchGameSetStatus();
        }
      } else {
        // Otherwise, fetch the updated game set status
        await fetchGameSetStatus();
      }

      console.log('All queries have been refetched');
    } catch (error) {
      console.error('Error ending game:', error);
      
      // Show error toast
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to end game",
        variant: "destructive"
      });
    }
  };

  // Handle player bump action (for engineers and admin only)
  const handleBumpPlayer = async (gameSetId: number | undefined, queuePosition: number, userId: number) => {
    if (!gameSetId) return;
    
    try {
      // Call the scootd bump-player API
      const response = await scootdApiRequest("POST", "bump-player", {
        gameSetId,
        queuePosition,
        userId
      });
      
      console.log('Bump player response:', response);
      
      // Show success toast
      toast({
        title: "Player Bumped",
        description: `Player at position #${queuePosition} has been bumped`,
      });
      
      // Refresh game set status
      await fetchGameSetStatus();
    } catch (error) {
      console.error('Error bumping player:', error);
      
      // Show error toast
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to bump player",
        variant: "destructive"
      });
    }
  };
  
  // Handle player checkout action (for engineers and admin only)
  const handleCheckoutPlayer = async (gameSetId: number | undefined, queuePosition: number, userId: number) => {
    if (!gameSetId) return;
    
    try {
      // Call the scootd checkout API
      const response = await scootdApiRequest("POST", "checkout", {
        gameSetId,
        queuePosition,
        userId
      });
      
      console.log('Checkout player response:', response);
      
      // Show success toast
      toast({
        title: "Player Checked Out",
        description: `Player at position #${queuePosition} has been checked out`,
      });
      
      // Refresh game set status
      await fetchGameSetStatus();
    } catch (error) {
      console.error('Error checking out player:', error);
      
      // Show error toast
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to check out player",
        variant: "destructive"
      });
    }
  };

  // Function to handle ending the entire game set
  const handleEndSet = async (gameSetId: number) => {
    if (!window.confirm("Are you sure you want to end this game set? This will deactivate the set and all associated check-ins.")) {
      return;
    }
    
    try {
      console.log(`Ending game set ${gameSetId} using scootd`);
      
      // Use scootd API to deactivate the game set
      const response = await scootdApiRequest("POST", "deactivate-game-set", {
        gameSetId: gameSetId
      });

      console.log('Game set deactivated successfully with scootd:', response);
      
      // Show success toast
      toast({
        title: "Game Set Ended",
        description: `Game Set #${gameSetId} has been successfully deactivated`,
      });

      // Refresh the game set status
      await fetchGameSetStatus();

    } catch (error) {
      console.error('Error ending game set:', error);
      
      // Show error toast instead of alert
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to end game set",
        variant: "destructive"
      });
    }
  };

  const renderGameCard = (game: any, showScoreInputs = true) => (
    <Card key={game.id} className="bg-secondary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Game #{game.id} - Court {game.court}</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-normal text-muted-foreground">
              {format(new Date(game.startTime), 'h:mm a')}
            </span>
            {showScoreInputs && canEndGames && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleScoreInputs(game.id)}
              >
                End Game
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Home Team */}
          <Card className="bg-white text-black">
            <CardHeader className="py-2">
              <CardTitle className="text-sm font-medium">
                Home
                {game.state === 'final' && (
                  <span className="ml-2 text-primary font-bold">
                    {game.team1Score}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {game.players
                  ?.filter((p: any) => p.team === 1)
                  .map((p: any) => (
                    <div key={`home-player-${p.user_id || p.username}-${p.queuePosition}`} className="p-2 rounded-md text-sm bg-secondary/10">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-lg">#{p.queuePosition}</span>
                          <span>
                            {p.username}
                            {(p.checkin_type || p.type)?.includes('win_promoted') && (
                              <span className="ml-2 text-sm text-green-400">
                                (WP{(p.checkin_type || p.type)?.includes(':') ? `-${(p.checkin_type || p.type).split(':')[1] === '1' ? 'H' : 'A'}` : ''})
                              </span>
                            )}
                            {(p.checkin_type || p.type)?.includes('loss_promoted') && (
                              <span className="ml-2 text-sm text-yellow-400">
                                (LP{(p.checkin_type || p.type)?.includes(':') ? `-${(p.checkin_type || p.type).split(':')[1] === '1' ? 'H' : 'A'}` : ''})
                              </span>
                            )}
                            {(p.checkin_type || p.type)?.includes('autoup') && (
                              <span className="ml-2 text-sm text-blue-400">
                                (Auto{(p.checkin_type || p.type)?.includes(':') ? `-${(p.checkin_type || p.type).split(':')[1] === '1' ? 'H' : 'A'}` : ''})
                              </span>
                            )}
                          </span>
                        </div>
                        {isOG(p.birthYear) && (
                          <span className="text-primary font-bold ml-auto">OG</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
              {showScoreInputs && gameScores[game.id]?.showInputs && (
                <div className="mt-4">
                  <Input
                    type="number"
                    placeholder="Home Score"
                    value={gameScores[game.id]?.team1Score || ''}
                    onChange={(e) => updateScore(game.id, 'team1Score', e.target.value)}
                    className="w-full bg-white text-black"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Away Team */}
          <Card className="bg-black text-white border border-white">
            <CardHeader className="py-2">
              <CardTitle className="text-sm font-medium">
                Away
                {game.state === 'final' && (
                  <span className="ml-2 text-white font-bold">
                    {game.team2Score}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {game.players
                  ?.filter((p: any) => p.team === 2)
                  .map((p: any) => (
                    <div key={`away-player-${p.user_id || p.username}-${p.queuePosition}`} className="p-2 rounded-md text-sm bg-white/10">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-lg">#{p.queuePosition}</span>
                          <span>
                            {p.username}
                            {(p.checkin_type || p.type)?.includes('win_promoted') && (
                              <span className="ml-2 text-sm text-green-400">
                                (WP{(p.checkin_type || p.type)?.includes(':') ? `-${(p.checkin_type || p.type).split(':')[1] === '1' ? 'H' : 'A'}` : ''})
                              </span>
                            )}
                            {(p.checkin_type || p.type)?.includes('loss_promoted') && (
                              <span className="ml-2 text-sm text-yellow-400">
                                (LP{(p.checkin_type || p.type)?.includes(':') ? `-${(p.checkin_type || p.type).split(':')[1] === '1' ? 'H' : 'A'}` : ''})
                              </span>
                            )}
                            {(p.checkin_type || p.type)?.includes('autoup') && (
                              <span className="ml-2 text-sm text-blue-400">
                                (Auto{(p.checkin_type || p.type)?.includes(':') ? `-${(p.checkin_type || p.type).split(':')[1] === '1' ? 'H' : 'A'}` : ''})
                              </span>
                            )}
                          </span>
                        </div>
                        {isOG(p.birthYear) && (
                          <span className="text-white font-bold ml-auto">OG</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
              {showScoreInputs && gameScores[game.id]?.showInputs && (
                <div className="mt-4">
                  <Input
                    type="number"
                    placeholder="Away Score"
                    value={gameScores[game.id]?.team2Score || ''}
                    onChange={(e) => updateScore(game.id, 'team2Score', e.target.value)}
                    className="w-full bg-white text-black"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        {showScoreInputs && gameScores[game.id]?.showInputs && (
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => handleEndGame(game.id)}
              disabled={
                gameScores[game.id]?.team1Score === undefined ||
                gameScores[game.id]?.team2Score === undefined
              }
            >
              Submit Scores
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Check if user has permission to end games
  const canEndGames = user?.isRoot || user?.isEngineer;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center space-y-4">
          <ScootLogo className="h-24 w-24 text-primary" />
          <div className="w-full max-w-2xl space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>
                    {gameSetStatus ? (
                      <div className="flex flex-col space-y-1">
                        <span className="text-xl">Game Set #{gameSetStatus.id}</span>
                        <span className="text-sm text-muted-foreground">
                          Created {format(new Date(gameSetStatus.createdAt), 'PPp')}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {gameSetStatus.gym} - {gameSetStatus.playersPerTeam} players per team - {gameSetStatus.numberOfCourts} courts
                        </span>
                      </div>
                    ) : (
                      "Current Games"
                    )}
                  </CardTitle>
                  {canEndGames && (
                    <div className="flex gap-2">
                      {/* Only show New Game button when there are no active games (only finished games or no games) */}
                      {activeGamesList.length === 0 && (
                        <Button 
                          onClick={() => setLocation("/games?tab=new-game")}
                          variant="outline"
                        >
                          New Game
                        </Button>
                      )}
                      {gameSetStatus && (
                        <Button 
                          onClick={() => handleEndSet(gameSetStatus.id)}
                          variant="outline"
                          className="bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-600"
                        >
                          End Set
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Active Games */}
                  {activeGamesList.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium mb-4">Active Games</h3>
                      <div className="space-y-6">
                        {activeGamesList.map(game => renderGameCard(game))}
                      </div>
                    </div>
                  )}

                  {/* Next Up Section - Always show if there are players waiting */}
                  {nextUpPlayers.length > 0 && (
                    <div className="mt-8">
                      <h3 className="text-lg font-medium mb-4">Next Up</h3>
                      <div className="space-y-2">
                        {nextUpPlayers.map((player: any, index) => (
                          <div key={`player-${player.user_id || player.queuePosition || index}`} className="flex items-center justify-between p-2 rounded-md bg-secondary/30">
                            <div className="flex items-center gap-4">
                              <span className="font-mono text-lg">#{player.queuePosition}</span>
                              <span>
                                {player.username}
                                {player.type?.includes('win_promoted') && (
                                  <span className="ml-2 text-sm text-green-400">
                                    (WP{player.type?.includes(':') ? `-${player.type.split(':')[1] === '1' ? 'H' : 'A'}` : ''})
                                  </span>
                                )}
                                {player.type?.includes('loss_promoted') && (
                                  <span className="ml-2 text-sm text-yellow-400">
                                    (LP{player.type?.includes(':') ? `-${player.type.split(':')[1] === '1' ? 'H' : 'A'}` : ''})
                                  </span>
                                )}
                                {player.type?.includes('autoup') && (
                                  <span className="ml-2 text-sm text-blue-400">
                                    (Auto{player.type?.includes(':') ? `-${player.type.split(':')[1] === '1' ? 'H' : 'A'}` : ''})
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {isOG(player.birthYear) && (
                                <span className="text-white font-bold">OG</span>
                              )}
                              {(user?.isRoot || user?.isEngineer) && (
                                <>
                                  <Button 
                                    size="icon" 
                                    variant="outline"
                                    className="rounded-full h-7 w-7 bg-black border-gray-800"
                                    onClick={() => handleBumpPlayer(gameSetStatus?.game_set?.id, player.queuePosition, player.user_id)} 
                                    title="Bump Player"
                                  >
                                    <HandMetal className="h-4 w-4 text-white" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="outline"
                                    className="rounded-full h-7 w-7 bg-black border-gray-800 ml-1"
                                    onClick={() => handleCheckoutPlayer(gameSetStatus?.game_set?.id, player.queuePosition, player.user_id)}
                                    title="Checkout Player"
                                  >
                                    <X className="h-4 w-4 text-white" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Finished Games */}
                  {finishedGamesList.length > 0 && (
                    <div className="mt-8">
                      <h3 className="text-lg font-medium mb-4">Completed Games</h3>
                      <div className="space-y-6">
                        {finishedGamesList.map(game => renderGameCard(game, false))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}