import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, HandMetal, X, ArrowDownToLine } from "lucide-react";
import { ScootLogo } from "@/components/logos/scoot-logo";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useLocation } from "wouter";
import { apiRequest, scootdApiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PromotionBadge from "@/components/PromotionBadge";

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
    players_per_team: number;
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
  maxConsecutiveGames: number;
  currentQueuePosition: number;
  createdAt: string;
  games: {
    id: number;
    court: string;
    state: string;
    homeScore: number | null;
    awayScore: number | null;
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

interface HomePageProps {
  id?: string; // For route params
  gameSetId?: number; // For directly passing a game set ID
}

export default function HomePage({ id, gameSetId }: HomePageProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  // Now using the imported PromotionBadge component
  const [gameScores, setGameScores] = useState<Record<number, { showInputs: boolean; homeScore?: number; awayScore?: number; autoPromote: boolean }>>({});
  const { toast } = useToast();
  
  // Use the route param ID if provided, otherwise use the direct prop
  const targetGameSetId = id ? parseInt(id) : gameSetId;
  const isHistoricalView = !!targetGameSetId;
  
  // State for scootd-based data
  const [gameSetStatus, setGameSetStatus] = useState<GameSetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch game set status using scootd
  const fetchGameSetStatus = async () => {
    try {
      setLoading(true);
      
      // If a specific game set ID is provided, fetch that game set instead of the active one
      const endpoint = targetGameSetId ? `game-set/${targetGameSetId}` : "game-set-status";
      const data = await scootdApiRequest<any>("GET", endpoint);
      
      // Transform the data from scootd API format to our UI format
      const transformedData: GameSetStatus = {
        // Game set info
        id: data.game_set?.id || 0,
        gym: data.game_set_info?.gym || "",
        playersPerTeam: data.game_set_info?.players_per_team || 4, // Use the correct field
        numberOfCourts: data.game_set_info?.number_of_courts || 1,
        maxConsecutiveGames: data.game_set_info?.max_consecutive_games || 2, // Add max consecutive games
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
            homeScore: g.team1_score,
            awayScore: g.team2_score,
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
            homeScore: g.team1_score,
            awayScore: g.team2_score,
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
  }, [user, targetGameSetId]); // Include targetGameSetId in dependencies to reload when it changes

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
        homeScore: prev[gameId]?.homeScore,
        awayScore: prev[gameId]?.awayScore,
        autoPromote: prev[gameId]?.autoPromote !== undefined ? prev[gameId].autoPromote : true // Default to true
      }
    }));
  };

  const updateScore = (gameId: number, team: 'homeScore' | 'awayScore', value: string) => {
    const numValue = parseInt(value);
    if (!isNaN(numValue)) {
      setGameScores(prev => ({
        ...prev,
        [gameId]: {
          ...prev[gameId],
          [team]: numValue,
          autoPromote: prev[gameId]?.autoPromote !== undefined ? prev[gameId].autoPromote : true
        }
      }));
    }
  };
  
  const toggleAutoPromote = (gameId: number) => {
    setGameScores(prev => ({
      ...prev,
      [gameId]: {
        ...prev[gameId],
        autoPromote: !(prev[gameId]?.autoPromote !== undefined ? prev[gameId].autoPromote : true)
      }
    }));
  };

  const handleEndGame = async (gameId: number) => {
    const scores = gameScores[gameId];
    if (scores?.homeScore === undefined || scores?.awayScore === undefined) {
      return;
    }

    try {
      console.log(`Submitting final scores for game ${gameId} using scootd:`, scores);
      
      // Use the scootd end-game command API endpoint
      const response = await scootdApiRequest("POST", "end-game", {
        gameId: gameId,
        homeScore: scores.homeScore,
        awayScore: scores.awayScore,
        autoPromote: scores.autoPromote  // Use the autoPromote flag from the state
      });

      console.log('Game ended successfully with scootd:', response);
      
      // Show success toast
      toast({
        title: "Game Ended",
        description: `Game #${gameId} ended with score: ${scores.homeScore}-${scores.awayScore}`,
      });

      // Reset game scores state
      setGameScores(prev => ({
        ...prev,
        [gameId]: {
          showInputs: false,
          homeScore: undefined,
          awayScore: undefined,
          autoPromote: prev[gameId]?.autoPromote !== undefined ? prev[gameId].autoPromote : true
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
              players_per_team: number;
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
            playersPerTeam: scootdData.game_set_info?.players_per_team || 4, // Correct field
            numberOfCourts: scootdData.game_set_info?.number_of_courts || 1,
            maxConsecutiveGames: scootdData.game_set_info?.max_consecutive_games || 2, // Add max consecutive games
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
                homeScore: g.team1_score,
                awayScore: g.team2_score,
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
                homeScore: g.team1_score,
                awayScore: g.team2_score,
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
  
  // Handle moving a player to the bottom of the queue (for engineers and admin only)
  const handleMoveToBottom = async (gameSetId: number | undefined, queuePosition: number, userId: number) => {
    if (!gameSetId) return;
    
    try {
      // Call the scootd bottom API
      const response = await scootdApiRequest("POST", "bottom", {
        gameSetId,
        queuePosition,
        userId
      });
      
      console.log('Move to bottom response:', response);
      
      // Show success toast
      toast({
        title: "Player Moved to Bottom",
        description: `Player at position #${queuePosition} has been moved to the bottom of the queue`,
      });
      
      // Refresh game set status
      await fetchGameSetStatus();
    } catch (error) {
      console.error('Error moving player to bottom:', error);
      
      // Show error toast
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to move player to bottom",
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
        <CardTitle className="text-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Home Team */}
          <Card className="bg-white text-black">
            <CardHeader className="py-2">
              <CardTitle className="text-sm font-medium">
                Home
                {game.state === 'final' && (
                  <span className="ml-2 text-primary font-bold">
                    {game.homeScore}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {game.players
                  ?.filter((p: any) => p.team === 1)
                  .map((p: any, index: number) => (
                    <div key={`home-player-${p.username}-${p.queuePosition}-${index}-game-${game.id}`} className="p-2 rounded-md text-sm bg-secondary/10">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-lg">#{p.queuePosition}</span>
                          <span>
                            {p.username}
                            <PromotionBadge checkinType={p.checkin_type || p.type} />
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
                    value={gameScores[game.id]?.homeScore || ''}
                    onChange={(e) => updateScore(game.id, 'homeScore', e.target.value)}
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
                    {game.awayScore}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {game.players
                  ?.filter((p: any) => p.team === 2)
                  .map((p: any, index: number) => (
                    <div key={`away-player-${p.username}-${p.queuePosition}-${index}-game-${game.id}`} className="p-2 rounded-md text-sm bg-white/10">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-lg">#{p.queuePosition}</span>
                          <span>
                            {p.username}
                            <PromotionBadge checkinType={p.checkin_type || p.type} />
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
                    value={gameScores[game.id]?.awayScore || ''}
                    onChange={(e) => updateScore(game.id, 'awayScore', e.target.value)}
                    className="w-full bg-white text-black"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        {showScoreInputs && gameScores[game.id]?.showInputs && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id={`auto-promote-${game.id}`}
                  checked={gameScores[game.id]?.autoPromote !== undefined ? gameScores[game.id].autoPromote : true}
                  onCheckedChange={() => toggleAutoPromote(game.id)}
                />
                <label
                  htmlFor={`auto-promote-${game.id}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  Automatically promote players
                </label>
              </div>
              <span className="text-xs text-muted-foreground">
                {gameScores[game.id]?.autoPromote ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => handleEndGame(game.id)}
                disabled={
                  gameScores[game.id]?.homeScore === undefined ||
                  gameScores[game.id]?.awayScore === undefined
                }
              >
                Submit Scores
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Check if user has permission to end games
  const canEndGames = (user?.isRoot || user?.isEngineer) && !isHistoricalView;
  const showControls = !isHistoricalView; // Used to hide control buttons in historical view

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center space-y-4">
          <ScootLogo className="h-24 w-24 text-primary" />
          <div className="w-full max-w-2xl space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
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
                        <span className="text-sm text-muted-foreground">
                          Max consecutive games: {gameSetStatus.maxConsecutiveGames}
                        </span>
                      </div>
                    ) : (
                      "Current Games"
                    )}
                  </CardTitle>
                  {canEndGames && (
                    <div className="flex flex-wrap gap-2">
                      {/* Display New Game button based on available courts */}
                      {(() => {
                        // Get total number of courts from game set info
                        const totalCourts = gameSetStatus?.game_set_info?.number_of_courts || 2;
                        
                        // Find active courts
                        const activeCourts = activeGamesList.map(game => game.court);
                        
                        // If all courts have active games, don't show any buttons
                        if (activeCourts.length >= totalCourts) return null;
                        
                        // Create an array of available courts
                        const availableCourts: string[] = [];
                        for (let i = 1; i <= totalCourts; i++) {
                          if (!activeCourts.includes(i.toString())) {
                            availableCourts.push(i.toString());
                          }
                        }
                        
                        // Single button with different text based on court availability
                        if (availableCourts.length === 0) {
                          // No courts available (shouldn't reach here due to earlier check)
                          return null;
                        } else if (availableCourts.length === totalCourts) {
                          // All courts available - show simple "New Game" button
                          return (
                            <Button 
                              onClick={() => setLocation(`/games?tab=new-game&courtMode=either`)}
                              variant="outline"
                            >
                              New Game
                            </Button>
                          );
                        } else {
                          // Only specific court(s) available - show court number
                          const court = availableCourts[0]; // Just use first available court
                          return (
                            <Button 
                              onClick={() => setLocation(`/games?tab=new-game&court=${court}&courtMode=only`)}
                              variant="outline"
                            >
                              New Game (ct{court})
                            </Button>
                          );
                        }
                      })()}
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
                        {nextUpPlayers.map((player: any, index: number) => (
                          <div key={`next-player-${player.username}-${player.queuePosition}-${index}`} className="flex items-center justify-between p-2 rounded-md bg-secondary/30">
                            <div className="flex items-center gap-4">
                              <span className="font-mono text-lg">#{player.queuePosition}</span>
                              <span>
                                {player.username}
                                <PromotionBadge checkinType={player.type} />
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {isOG(player.birthYear) && (
                                <span className="text-white font-bold">OG</span>
                              )}
                              {(user?.isRoot || user?.isEngineer) && showControls && (
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
                                    onClick={() => handleMoveToBottom(gameSetStatus?.game_set?.id, player.queuePosition, player.user_id)}
                                    title="Bottom (Move to End)"
                                  >
                                    <ArrowDownToLine className="h-4 w-4 text-white" />
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