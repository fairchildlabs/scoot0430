import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
    state: string;
    team1_score: number | null;
    team2_score: number | null;
    start_time: string;
    end_time: string | null;
    players: {
      username: string;
      queue_position: number;
      position: number;
      team: number;
      birth_year?: number;
    }[];
  }[];
  next_up_players: {
    username: string;
    queue_position: number;
    position: number;
    type: string;
    team: number | null;
    birth_year?: number;
  }[];
  recent_completed_games: {
    id: number;
    court: string;
    state: string;
    team1_score: number | null;
    team2_score: number | null;
    start_time: string;
    end_time: string | null;
    players: {
      username: string;
      queue_position: number;
      position: number;
      team: number;
      birth_year?: number;
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
    position?: number;  // Added position field to handle API response format
    type: string;
    team: number | null;
    birthYear?: number;
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
            state: g.state,
            team1Score: g.team1_score,
            team2Score: g.team2_score,
            startTime: g.start_time,
            endTime: g.end_time,
            players: (g.players || []).map((p: any) => ({
              username: p.username,
              queuePosition: p.position || p.queue_position, // Handle both position and queue_position fields
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
            endTime: g.end_time,
            players: (g.players || []).map((p: any) => ({
              username: p.username,
              queuePosition: p.position || p.queue_position, // Handle both position and queue_position fields
              team: p.team,
              birthYear: p.birth_year
            }))
          }))
        ],
        
        // Transform next up players for UI
        nextUp: (data.next_up_players || []).map((p: any) => {
          // Get the position (queue position) from the API response
          // The scootd API uses 'position' whereas our UI expects 'queuePosition'
          const position = typeof p.position === 'number' ? p.position : 
                           typeof p.queue_position === 'number' ? p.queue_position : 
                           0;
          
          return {
            username: p.username,
            queuePosition: position,
            type: p.type || "",
            team: p.team || null,
            birthYear: p.birth_year
          };
        })
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

  // Fetch data initially and set up polling interval
  useEffect(() => {
    if (user) {
      fetchGameSetStatus();
      
      // Set up polling interval to refresh data every 10 seconds (reduced frequency)
      const intervalId = setInterval(() => {
        fetchGameSetStatus();
      }, 10000);
      
      // Clean up interval on unmount
      return () => clearInterval(intervalId);
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
  
  // Map position if queue_position is not defined
  const mappedNextUpPlayers = nextUpPlayers.map(player => {
    // Get position from the API response
    // The API uses 'position' but our UI expects 'queuePosition' 
    // pos is what's shown in our debug logs
    const position = (player as any).pos || 
                    (player as any).position || 
                    (player as any).queue_position || 
                    player.queuePosition || 0;
    
    return {
      ...player,
      queuePosition: position
    };
  });
  
  // Add debugging for nextUpPlayers
  console.log('Next up players with their types:', nextUpPlayers.map(p => ({
    username: p.username,
    type: p.type,
    team: p.team,
    pos: p.queuePosition
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
          // Type cast the response to access its properties safely
          const scootdResponse = response as any;
          
          const transformedData: GameSetStatus = {
            id: scootdResponse.game_set?.id || 0,
            gym: scootdResponse.game_set_info?.gym || "",
            playersPerTeam: scootdResponse.game_set_info?.max_consecutive_games || 4,
            numberOfCourts: scootdResponse.game_set_info?.number_of_courts || 1,
            currentQueuePosition: scootdResponse.game_set_info?.current_queue_position || 0,
            createdAt: scootdResponse.game_set_info?.created_at || new Date().toISOString(),
            
            // Original fields from scootd
            game_set: scootdResponse.game_set,
            game_set_info: scootdResponse.game_set_info,
            active_games: scootdResponse.active_games || [],
            next_up_players: scootdResponse.next_up_players || [],
            recent_completed_games: scootdResponse.recent_completed_games || [],
            
            // Transform games for UI
            games: [
              ...(scootdResponse.active_games || []).map((g: any) => ({
                id: g.id,
                court: g.court,
                state: g.state,
                team1Score: g.team1_score,
                team2Score: g.team2_score,
                startTime: g.start_time,
                endTime: g.end_time,
                players: (g.players || []).map((p: any) => ({
                  username: p.username,
                  queuePosition: p.position || p.queue_position, // Handle both position and queue_position fields
                  team: p.team,
                  birthYear: p.birth_year
                }))
              })),
              ...(scootdResponse.recent_completed_games || []).map((g: any) => ({
                id: g.id,
                court: g.court,
                state: g.state || 'final',
                team1Score: g.team1_score,
                team2Score: g.team2_score,
                startTime: g.start_time,
                endTime: g.end_time,
                players: (g.players || []).map((p: any) => ({
                  username: p.username,
                  queuePosition: p.position || p.queue_position, // Handle both position and queue_position fields
                  team: p.team,
                  birthYear: p.birth_year
                }))
              }))
            ],
            
            // Transform next up players for UI
            nextUp: (scootdResponse.next_up_players || []).map((p: any) => {
              // Get the position (queue position) from the API response
              // The scootd API uses 'position' whereas our UI expects 'queuePosition'
              const position = typeof p.position === 'number' ? p.position : 
                              typeof p.queue_position === 'number' ? p.queue_position : 
                              0;
              
              return {
                username: p.username,
                queuePosition: position,
                type: p.type || "",
                team: p.team || null,
                birthYear: p.birth_year
              };
            })
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

  // Function to handle ending the entire game set
  const handleEndSet = async (gameSetId: number) => {
    if (!window.confirm("Are you sure you want to end this game set? This will deactivate the set and all associated check-ins.")) {
      return;
    }
    
    try {
      console.log(`Ending game set ${gameSetId}`);
      
      // Use the existing API endpoint for deactivating game sets
      const response = await apiRequest("POST", `/api/game-sets/${gameSetId}/deactivate`);

      console.log('Game set deactivated successfully:', response);
      
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
                {gameScores[game.id]?.showInputs && (
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="number"
                      className="w-16 h-8"
                      placeholder="Score"
                      onChange={(e) => updateScore(game.id, 'team1Score', e.target.value)}
                    />
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <ul className="space-y-1">
                {game.players
                  .filter((p: any) => p.team === 1)
                  .map((player: any) => (
                    <li
                      key={player.username}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center space-x-1">
                        <span>{player.username}</span>
                        {isOG(player.birthYear) && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-200 text-yellow-900 text-xs font-bold">
                            OG
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">#{player.queuePosition}</span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
          
          {/* Away Team */}
          <Card className="bg-gray-100 text-black">
            <CardHeader className="py-2">
              <CardTitle className="text-sm font-medium">
                Away
                {gameScores[game.id]?.showInputs && (
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="number"
                      className="w-16 h-8"
                      placeholder="Score"
                      onChange={(e) => updateScore(game.id, 'team2Score', e.target.value)}
                    />
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <ul className="space-y-1">
                {game.players
                  .filter((p: any) => p.team === 2)
                  .map((player: any) => (
                    <li
                      key={player.username}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center space-x-1">
                        <span>{player.username}</span>
                        {isOG(player.birthYear) && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-200 text-yellow-900 text-xs font-bold">
                            OG
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">#{player.queuePosition}</span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
          
          {/* Score submission button */}
          {gameScores[game.id]?.showInputs && canEndGames && (
            <div className="col-span-2 flex justify-center">
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
          
          {/* Final score display */}
          {game.state === 'final' && (
            <div className="col-span-2 flex justify-center">
              <div className="text-lg font-bold">
                Final Score: {game.team1Score} - {game.team2Score}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // Use admin status from user object, either isAdmin (custom property) or autoup flag
  // (where autoup might be used to indicate administrative privileges)
  const isUserAdmin = !!(user as any)?.isAdmin || (user?.autoup === true);
  const canEndGames = isUserAdmin;
  const canEndSet = isUserAdmin;
  const activeGameSet = gameSetStatus?.game_set_info;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {/* Error alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 text-red-800 rounded-md">
            {error}
          </div>
        )}
        
        {/* Banner section */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 bg-primary/10 p-6 rounded-lg">
          <div className="mb-4 md:mb-0">
            <h1 className="text-3xl font-bold text-foreground">Scoot</h1>
            <p className="text-muted-foreground">
              {gameSetStatus?.gym} - {activeGamesList?.length || 0} active courts
            </p>
          </div>
          <div className="flex flex-col items-center md:items-end">
            <ScootLogo className="w-24 md:w-32" />
            <div className="mt-2 text-sm">
              {gameSetStatus?.game_set?.id && canEndSet ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleEndSet(gameSetStatus.game_set!.id)}
                >
                  End Game Set
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        
        {/* Active Games Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Active Games</h2>
          {activeGamesList.length === 0 ? (
            <Card className="bg-secondary/20">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <p className="text-muted-foreground mb-4">No active games</p>
                {canEndGames && (
                  <Button
                    onClick={() => setLocation("/new-game")}
                    variant="default"
                  >
                    Create New Game
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {activeGamesList.map((game) => renderGameCard(game))}
            </div>
          )}
        </div>
        
        {/* Next Up Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Next Up</h2>
          <Card className="bg-secondary/20">
            <CardContent className="py-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {nextUpPlayers.length === 0 ? (
                  <p className="text-muted-foreground col-span-full text-center py-4">No players in queue</p>
                ) : (
                  mappedNextUpPlayers.map((player) => (
                    <Card key={player.username} className="bg-white">
                      <CardContent className="p-3">
                        <div className="flex flex-col items-center">
                          <div className="text-sm font-medium mb-1 text-center">{player.username}</div>
                          <div className="flex items-center space-x-1">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold">
                              {player.queuePosition}
                            </span>
                            {isOG(player.birthYear) && (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-200 text-yellow-900 text-xs font-bold">
                                OG
                              </span>
                            )}
                            {player.type === 'win_promoted' && player.team === 1 && (
                              <span className="inline-flex items-center justify-center w-12 h-6 rounded-full bg-green-100 text-green-800 text-xs font-bold">
                                WP-H
                              </span>
                            )}
                            {player.type === 'win_promoted' && player.team === 2 && (
                              <span className="inline-flex items-center justify-center w-12 h-6 rounded-full bg-green-100 text-green-800 text-xs font-bold">
                                WP-A
                              </span>
                            )}
                            {player.type === 'loss_promoted' && player.team === 1 && (
                              <span className="inline-flex items-center justify-center w-12 h-6 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
                                LP-H
                              </span>
                            )}
                            {player.type === 'loss_promoted' && player.team === 2 && (
                              <span className="inline-flex items-center justify-center w-12 h-6 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
                                LP-A
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Recently Finished Games Section */}
        {finishedGamesList.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Recently Finished Games</h2>
            <div className="space-y-4">
              {finishedGamesList.slice(0, 3).map((game) => renderGameCard(game, false))}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}