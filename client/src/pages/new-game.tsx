import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Redirect, useLocation } from "wouter";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, scootdApiRequest } from "@/lib/queryClient";
import { type InsertGame } from "@shared/schema";
import PromotionBadge from "@/components/PromotionBadge";

// Define types for better type safety
type GameSetStatus = {
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
  active_games: any[];
  next_up_players: Array<{
    user_id: number;
    username: string;
    position: number;
    birth_year: number;
    is_og: boolean;
    checkin_type: string;
  }>;
  recent_completed_games: any[];
};

type Checkin = {
  id?: number;
  userId: number;
  username: string;
  queuePosition: number;
  birthYear?: number;
  gameId: number | null;
  type?: string;
  team?: number;
  isActive: boolean;
  isOG?: boolean;
};

type ProposedGameData = {
  game_set_id: number;
  court: string;
  team1: Array<{
    user_id: number;
    username: string;
    birth_year: number;
    position: number;
    is_og: boolean;
    checkin_type?: string;
  }>;
  team2: Array<{
    user_id: number;
    username: string;
    birth_year: number;
    position: number;
    is_og: boolean;
    checkin_type?: string;
  }>;
};

const NewGamePage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedCourt, setSelectedCourt] = useState<string>("1");
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [, navigate] = useLocation();

  // Only allow engineers and root users
  if (!user?.isEngineer && !user?.isRoot) {
    return <Redirect to="/" />;
  }

  // Get active game set using scootd API
  const { data: gameSetStatus, isLoading: gameSetStatusLoading } = useQuery<GameSetStatus>({
    queryKey: ["/api/scootd/game-set-status"],
    enabled: !!user,
  });
  
  // Extract active game set info
  const activeGameSet = gameSetStatus ? {
    id: gameSetStatus.game_set?.id || 0,
    gym: gameSetStatus.game_set_info?.gym || "",
    playersPerTeam: 4, // Fixed value of 4 players per team as required
    numberOfCourts: gameSetStatus.game_set_info?.number_of_courts || 1,
    currentQueuePosition: gameSetStatus.game_set_info?.current_queue_position || 0,
    createdAt: gameSetStatus.game_set_info?.created_at || new Date().toISOString(),
  } : null;
  
  // Transform next_up_players from gameSetStatus to checkins format
  const checkins: Checkin[] = gameSetStatus?.next_up_players?.map((player) => ({
    id: player.user_id,
    userId: player.user_id,
    username: player.username,
    queuePosition: player.position,
    birthYear: player.birth_year,
    gameId: null,
    type: player.checkin_type, // Use the checkin_type from API directly
    team: undefined,
    isActive: true,
    isOG: player.is_og
  })) || [];

  const isDataLoading = !gameSetStatus || gameSetStatusLoading;
  
  // State to hold proposed game data (will be populated automatically on page load)
  const [proposedGameData, setProposedGameData] = useState<ProposedGameData | null>(null);
  const [isProposalLoading, setIsProposalLoading] = useState<boolean>(false);
  
  // Automatically propose a game when the page loads and we have active game set data
  useEffect(() => {
    async function proposeGameOnLoad() {
      if (activeGameSet && activeGameSet.id > 0 && !proposedGameData && !isProposalLoading) {
        setIsProposalLoading(true);
        try {
          console.log('Auto-proposing game for game set:', activeGameSet.id, 'on court:', selectedCourt);
          const data = await scootdApiRequest<any>("POST", "propose-game", {
            gameSetId: activeGameSet.id,
            court: selectedCourt
          });
          console.log('Auto-proposed game data:', data);
          
          // Check if we received an error response from scootd
          // Example: { "status": "GAME_IN_PROGRESS", "message": "Game already in progress on court 1 (Game ID: 4)" }
          if (data && data.status && data.status === "GAME_IN_PROGRESS") {
            setStatusMessage(data.message || "Game already in progress on this court.");
            // Don't set proposedGameData in this case to avoid errors
          } else if (data && data.team1 && data.team2) {
            // Only set the game data if it has the expected structure
            setProposedGameData(data);
          } else {
            throw new Error("Received unexpected data format from server");
          }
        } catch (error) {
          console.error('Auto game proposal failed:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          setStatusMessage(errorMessage);
          toast({
            title: "Failed to propose game",
            description: errorMessage,
            variant: "destructive"
          });
        } finally {
          setIsProposalLoading(false);
        }
      }
    }
    proposeGameOnLoad();
  }, [activeGameSet, selectedCourt, toast, proposedGameData, isProposalLoading]);
  
  // Mutation to create a game after proposal
  const createGameMutation = useMutation({
    mutationFn: async () => {
      if (!activeGameSet) {
        throw new Error("No active game set available");
      }
      
      console.log('Creating game for game set:', activeGameSet.id, 'on court:', selectedCourt);
      
      // Call the scootd new-game endpoint
      const data = await scootdApiRequest("POST", "new-game", {
        gameSetId: activeGameSet.id,
        court: selectedCourt
      });
      
      console.log('Created game data:', data);
      return data;
    },
    onSuccess: (data) => {
      console.log('Game creation successful:', data);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/scootd/game-set-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/games/active"] });
      
      toast({
        title: "Success",
        description: "Game created successfully"
      });
      
      // Navigate back to home page
      navigate("/");
    },
    onError: (error: Error) => {
      console.error('Game creation failed:', error);
      setStatusMessage(error.message);
      toast({
        title: "Failed to create game",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // We've removed the playerMoveMutation as it's not needed anymore
  // Player movements (checkout, bump, swap) will now be handled via scootd API directly

  // If no active game set or it's invalid (id = 0), return early
  if (!activeGameSet || activeGameSet.id === 0) {
    return null;  // Parent component will handle the display
  }

  if (isDataLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }


  const playersNeeded = activeGameSet?.playersPerTeam * 2 || 0;
  const playersPerTeam = activeGameSet?.playersPerTeam || 0;
  const currentQueuePos = activeGameSet?.currentQueuePosition || 0;

  // Get players eligible for the next game
  // Include both active players without a game and promoted players (even if inactive)
  // Get eligible players for the game - relying solely on database queue positions
  // We only need players without a gameId, and we take the first playersNeeded based on queuePosition
  const eligiblePlayers = checkins?.filter(p => p.gameId === null)
    .sort((a, b) => a.queuePosition - b.queuePosition)
    .slice(0, playersNeeded)
    .sort((a, b) => {
    // First, ensure promoted players go to their previous teams
    if (a.type && !b.type) return -1;  // Promoted players first
    if (!a.type && b.type) return 1;
    // Then sort by queue position
    return a.queuePosition - b.queuePosition;
  }) || [];

  // Use proposed game data for team assignments if available
  let homePlayers: any[] = [];
  let awayPlayers: any[] = [];
  
  // If we have proposed game data, use it to populate the team rosters
  if (proposedGameData) {
    // Find the promotion type for each player using the next_up_players array
    const findPromotionType = (playerId: number) => {
      const player = gameSetStatus?.next_up_players?.find(p => p.user_id === playerId);
      return player?.checkin_type || '';
    };
    
    // IMPORTANT: Swap team1 and team2 to match text output format
    // Map team2 (home) players from proposed game data
    homePlayers = proposedGameData.team2.map((player, index) => ({
      userId: player.user_id,
      username: player.username,
      birthYear: player.birth_year,
      queuePosition: player.position,
      displayPosition: index + 1, // 1-based position
      isOG: player.is_og,
      type: findPromotionType(player.user_id)
    }));
    
    // Map team1 (away) players from proposed game data
    awayPlayers = proposedGameData.team1.map((player, index) => ({
      userId: player.user_id,
      username: player.username,
      birthYear: player.birth_year,
      queuePosition: player.position,
      displayPosition: index + 1 + homePlayers.length, // continue numbering after home team
      isOG: player.is_og,
      type: findPromotionType(player.user_id)
    }));
  }

  // Get next up players (those after the first 'playersNeeded' players)
  // Take the rest of the players after we've selected the first 'playersNeeded' for teams
  // Also include win_promoted and loss_promoted players that might be marked as inactive
  // Get next up players - rely entirely on database queue positions
  // Get all players without a gameId, sorted by queue position
  // Use slice to get only the players after the ones needed for the current game
  const nextUpPlayers = checkins?.filter(p => p.gameId === null)
    .sort((a, b) => a.queuePosition - b.queuePosition)
    .slice(playersNeeded) || [];

  console.log('Player groups:', {
    activeGameSet: {
      id: activeGameSet?.id,
      currentQueuePosition: activeGameSet?.currentQueuePosition,
      playersPerTeam: activeGameSet?.playersPerTeam
    },
    checkins: checkins?.map(p => ({
      username: p.username,
      pos: p.queuePosition,
      isActive: p.isActive,
      gameId: p.gameId,
      type: p.type
    })),
    eligiblePlayers: eligiblePlayers.map(p => ({
      name: p.username,
      pos: p.queuePosition,
      team: p.team,
      type: p.type
    })),
    nextUpPlayers: nextUpPlayers.map(p => ({
      name: p.username,
      pos: p.queuePosition,
      type: p.type,
      isActive: p.isActive,
      gameId: p.gameId
    }))
  });

  // Calculate current year for OG status
  const currentYear = new Date().getFullYear();
  const isOG = (birthYear?: number) => {
    if (!birthYear) return false;
    return (currentYear - birthYear) >= 75;
  };

  // Using the imported PromotionBadge component for consistent badge display

  // We've removed the scootdPlayerMutation as it's not needed anymore
  // This implements the user's request to remove checkout/bump/swap buttons

  const PlayerCard = ({ player, index, isNextUp = false, isAway = false }: { player: any; index: number; isNextUp?: boolean; isAway?: boolean }) => {
    console.log('Player data in PlayerCard:', {
      username: player.username,
      type: player.type,
      team: player.team,
      pos: player.queuePosition
    });

    return (
      <div className={`flex items-center justify-between p-2 rounded-md ${
        isNextUp ? 'bg-secondary/30 text-white' :
          isAway ? 'bg-black text-white border border-white' :
            'bg-white text-black'
      }`}>
        <div className="flex items-center gap-4">
          <span className="font-mono text-lg">#{player.displayPosition || player.queuePosition}</span>
          <span>
            {player.username}
            <PromotionBadge checkinType={player.type} />
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isOG(player.birthYear) && (
            <span className={`font-bold ${isNextUp ? 'text-white' : 'text-primary'}`}>OG</span>
          )}
        </div>
      </div>
    );
  };

  // Generate court selection UI based on number of courts
  const CourtSelection = () => {
    const numberOfCourts = activeGameSet?.numberOfCourts || 1;

    return (
      <RadioGroup
        value={selectedCourt}
        onValueChange={setSelectedCourt}
        className="flex items-center justify-center gap-4 bg-white rounded-lg p-4"
      >
        {Array.from({ length: numberOfCourts }, (_, i) => i + 1).map((courtNumber) => (
          <div key={courtNumber} className="flex items-center space-x-2">
            <RadioGroupItem
              value={courtNumber.toString()}
              id={`court-${courtNumber}`}
              className="text-black border-2 border-black data-[state=checked]:bg-black data-[state=checked]:border-black"
            />
            <Label
              htmlFor={`court-${courtNumber}`}
              className="text-black"
            >
              Court #{courtNumber}
            </Label>
          </div>
        ))}
      </RadioGroup>
    );
  };

  const isMutationLoading = createGameMutation.isPending || isProposalLoading;

  const playersCheckedIn = checkins?.length || 0;

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Set #{activeGameSet.id} Roster</CardTitle>
          {statusMessage && (
            <div className="text-red-500 mt-2 text-sm">
              {statusMessage}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {playersCheckedIn < playersNeeded ? (
            <div className="text-center py-4">
              <p className="text-destructive font-medium">Not enough players checked in (Currently {playersCheckedIn})</p>
              <p className="text-sm text-muted-foreground mt-2">
                Need {playersNeeded} players ({activeGameSet.playersPerTeam} per team) to start a game.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Select Court</h3>
                <CourtSelection />
              </div>
              
              {/* Player check-in counter */}
              <div className="py-2">
                <div className="flex justify-end">
                  <span className="text-xs text-muted-foreground">
                    {playersCheckedIn} player{playersCheckedIn !== 1 ? 's' : ''} checked in
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Home Team */}
                <Card className="bg-black/20 border border-white">
                  <CardHeader>
                    <CardTitle className="text-white">Home</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {proposedGameData && proposedGameData.team2 ? 
                        // Show players from scootd proposal - SWAPPED to match text output
                        proposedGameData.team2.map((player, index) => {
                          // Find the player in the next_up_players array to get the checkin_type
                          const nextUpPlayer = gameSetStatus?.next_up_players?.find(p => p.user_id === player.user_id);
                          return (
                            <PlayerCard 
                              key={player.user_id || `home-${index}`} 
                              player={{
                                id: player.user_id,
                                username: player.username,
                                birthYear: player.birth_year,
                                type: nextUpPlayer?.checkin_type || "manual",
                                team: 1,
                                queuePosition: player.position
                              }} 
                              index={index} 
                            />
                          );
                        })
                        : 
                        // Show locally calculated teams
                        homePlayers.map((player: any, index: number) => (
                          <PlayerCard key={player.id || `home-${index}`} player={player} index={index} />
                        ))
                      }
                    </div>
                  </CardContent>
                </Card>

                {/* Away Team */}
                <Card className="bg-black/20 border border-white">
                  <CardHeader>
                    <CardTitle className="text-white">Away</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {proposedGameData && proposedGameData.team1 ? 
                        // Show players from scootd proposal - SWAPPED to match text output
                        proposedGameData.team1.map((player, index) => {
                          // Find the player in the next_up_players array to get the checkin_type
                          const nextUpPlayer = gameSetStatus?.next_up_players?.find(p => p.user_id === player.user_id);
                          return (
                            <PlayerCard 
                              key={player.user_id || `away-${index}`} 
                              player={{
                                id: player.user_id,
                                username: player.username,
                                birthYear: player.birth_year,
                                type: nextUpPlayer?.checkin_type || "manual",
                                team: 2,
                                queuePosition: player.position
                              }} 
                              index={index}
                              isAway
                            />
                          );
                        })
                        : 
                        // Show locally calculated teams
                        awayPlayers.map((player: any, index: number) => (
                          <PlayerCard
                            key={player.id || `away-${index}`}
                            player={player}
                            index={index}
                            isAway
                          />
                        ))
                      }
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Create and Dismiss buttons */}
              <div className="flex gap-4">
                <Button
                  className="flex-1 border border-white"
                  onClick={() => createGameMutation.mutate()}
                  disabled={createGameMutation.isPending || !proposedGameData}
                >
                  {createGameMutation.isPending ? "Creating..." : "Create Game"}
                </Button>
                
                <Button
                  className="flex-1 border border-white bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-600"
                  onClick={() => navigate("/")}
                  disabled={createGameMutation.isPending}
                >
                  Dismiss Game
                </Button>
              </div>

              {/* Next Up Section */}
              {nextUpPlayers.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-medium mb-4">Next Up</h3>
                  <Card className="bg-black/10">
                    <CardContent className="pt-6">
                      <div className="space-y-2">
                        {nextUpPlayers.map((player: any, index: number) => (
                          <PlayerCard
                            key={player.id}
                            player={player}
                            index={index}
                            isNextUp
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NewGamePage;