import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Redirect, useLocation } from "wouter";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, scootdApiRequest } from "@/lib/queryClient";
import { type InsertGame } from "@shared/schema";


const NewGamePage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedCourt, setSelectedCourt] = useState<string>("1");
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Only allow engineers and root users
  if (!user?.isEngineer && !user?.isRoot) {
    return <Redirect to="/" />;
  }

  // Get active game set and all checked-in players using scootd API
  const { data: gameSetStatus, isLoading: gameSetStatusLoading } = useQuery({
    queryKey: ["/api/scootd/game-set-status"],
    enabled: !!user,
  });
  
  // Extract active game set and checkins from gameSetStatus
  const activeGameSet = gameSetStatus ? {
    id: gameSetStatus.game_set?.id || 0,
    gym: gameSetStatus.game_set_info?.gym || "",
    playersPerTeam: gameSetStatus.game_set_info?.max_consecutive_games || 4,
    numberOfCourts: gameSetStatus.game_set_info?.number_of_courts || 1,
    currentQueuePosition: gameSetStatus.game_set_info?.current_queue_position || 0,
    createdAt: gameSetStatus.game_set_info?.created_at || new Date().toISOString(),
  } : null;
  
  // Transform next_up_players from gameSetStatus to checkins format
  const checkins = gameSetStatus?.next_up_players?.map((player: any) => ({
    id: player.id,
    userId: player.user_id,
    username: player.username,
    queuePosition: player.position || player.queue_position,
    birthYear: player.birth_year,
    gameId: null,
    type: player.type,
    team: player.team,
    isActive: true,
    isOG: player.is_og
  })) || [];
  
  const isDataLoading = !gameSetStatus || gameSetStatusLoading;

  // State to hold proposed game data
  const [proposedGameData, setProposedGameData] = useState<any>(null);
  const [, navigate] = useLocation();
  
  // Mutation to propose a game (doesn't create it yet)
  const proposeGameMutation = useMutation({
    mutationFn: async () => {
      if (!activeGameSet) {
        throw new Error("No active game set available");
      }
      
      console.log('Proposing game for game set:', activeGameSet.id, 'on court:', selectedCourt);
      
      // Call the scootd propose-game endpoint
      const data = await scootdApiRequest("POST", "propose-game", {
        gameSetId: activeGameSet.id,
        court: selectedCourt
      });
      
      console.log('Proposed game data:', data);
      return data;
    },
    onSuccess: (data) => {
      console.log('Game proposal successful:', data);
      setProposedGameData(data);
      toast({
        title: "Game proposal ready",
        description: "Game teams have been proposed. Review and click 'Create Game' to finalize."
      });
    },
    onError: (error: Error) => {
      console.error('Game proposal failed:', error);
      setStatusMessage(error.message);
      toast({
        title: "Failed to propose game",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  
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

  // Initialize team arrays
  let homePlayers: any[] = [];
  let awayPlayers: any[] = [];
  
  // For the Game Creation screen, use the actual database queue positions
  // This will show the real queue positions that the players have in the database
  const gameNumber = Math.floor((currentQueuePos - 1) / (playersPerTeam * 2)) + 1;
  const homeStartPos = currentQueuePos; // Use the actual currentQueuePosition from database
  const awayStartPos = currentQueuePos; // Both teams use actual queue positions from database
  
  console.log('Position calculation:', {
    gameNumber,
    homeStartPos,
    awayStartPos,
    currentQueuePos
  });

  // First, assign promoted players to their previous teams
  eligiblePlayers.forEach(player => {
    // Check if player should be on away team based on promotion type or previous team
    const isAwayTeam = player.type?.includes('WP') || player.type?.includes('LP') ?
      player.type.endsWith('-A') : player.team === 2;

    if (isAwayTeam && awayPlayers.length < playersPerTeam) {
      // For away team, adjust queue position to use a consistent range (5-8, 13-16, etc.)
      const homeBaseIndex = homePlayers.length;
      const awayBaseIndex = awayPlayers.length;
      const awayPos = awayStartPos + awayBaseIndex;
      
      // Create a copy of player with adjusted queue position
      const playerWithPos = {
        ...player,
        displayPosition: awayPos // Add displayPosition for UI purposes
      };
      awayPlayers.push(playerWithPos);
    } else if (!isAwayTeam && homePlayers.length < playersPerTeam) {
      // For home team, adjust queue position to use a consistent range (1-4, 9-12, etc.)
      const homeBaseIndex = homePlayers.length;
      const homePos = homeStartPos + homeBaseIndex;
      
      // Create a copy of player with adjusted queue position
      const playerWithPos = {
        ...player,
        displayPosition: homePos // Add displayPosition for UI purposes
      };
      homePlayers.push(playerWithPos);
    }
  });

  // Fill remaining spots with non-promoted players
  eligiblePlayers.forEach(player => {
    const isAlreadyAssigned = [...homePlayers, ...awayPlayers].some(p => p.userId === player.userId);
    if (!isAlreadyAssigned) {
      if (homePlayers.length < playersPerTeam) {
        // For home team, adjust queue position
        const homeBaseIndex = homePlayers.length;
        const homePos = homeStartPos + homeBaseIndex;
        
        // Create a copy of player with adjusted queue position
        const playerWithPos = {
          ...player,
          displayPosition: homePos // Add displayPosition for UI purposes
        };
        homePlayers.push(playerWithPos);
      } else if (awayPlayers.length < playersPerTeam) {
        // For away team, adjust queue position
        const awayBaseIndex = awayPlayers.length;
        const awayPos = awayStartPos + awayBaseIndex;
        
        // Create a copy of player with adjusted queue position
        const playerWithPos = {
          ...player,
          displayPosition: awayPos // Add displayPosition for UI purposes
        };
        awayPlayers.push(playerWithPos);
      }
    }
  });

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

  // We've removed the scootdPlayerMutation as it's not needed anymore
  // This implements the user's request to remove checkout/bump/swap buttons

  const PlayerCard = ({ player, index, isNextUp = false, isAway = false }: { player: any; index: number; isNextUp?: boolean; isAway?: boolean }) => {
    // Helper function to get promotion badge text
    const getPromotionBadge = (type: string, team: number | null) => {
      console.log('Promotion badge calculation:', { type, team });
      if (type === 'win_promoted') {
        return team === 1 ? 'WP-H' : 'WP-A';
      } else if (type === 'loss_promoted') {
        return team === 1 ? 'LP-H' : 'LP-A';
      }
      return null;
    };

    console.log('Player data in PlayerCard:', {
      username: player.username,
      type: player.type,
      team: player.team,
      pos: player.queuePosition
    });

    const promotionBadge = getPromotionBadge(player.type, player.team);

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
            {promotionBadge && (
              <span className={`ml-2 text-sm ${player.type === 'win_promoted' ? 'text-green-400' : 'text-yellow-400'}`}>
                ({promotionBadge})
              </span>
            )}
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

  const isMutationLoading = createGameMutation.isPending || proposeGameMutation.isPending;

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
                      {proposedGameData ? (
                        // Show players from scootd proposal
                        proposedGameData.team_1?.map((player: any, index: number) => (
                          <PlayerCard 
                            key={player.user_id || `home-${index}`} 
                            player={{
                              id: player.user_id,
                              username: player.username,
                              birthYear: player.birth_year,
                              type: player.type,
                              team: 1,
                              queuePosition: player.position
                            }} 
                            index={index} 
                          />
                        ))
                      ) : (
                        // Show locally calculated teams
                        homePlayers.map((player: any, index: number) => (
                          <PlayerCard key={player.id || `home-${index}`} player={player} index={index} />
                        ))
                      )}
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
                      {proposedGameData ? (
                        // Show players from scootd proposal
                        proposedGameData.team_2?.map((player: any, index: number) => (
                          <PlayerCard 
                            key={player.user_id || `away-${index}`} 
                            player={{
                              id: player.user_id,
                              username: player.username,
                              birthYear: player.birth_year,
                              type: player.type,
                              team: 2,
                              queuePosition: player.position
                            }} 
                            index={index}
                            isAway
                          />
                        ))
                      ) : (
                        // Show locally calculated teams
                        awayPlayers.map((player: any, index: number) => (
                          <PlayerCard
                            key={player.id || `away-${index}`}
                            player={player}
                            index={index}
                            isAway
                          />
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {!proposedGameData ? (
                <Button
                  className="w-full border border-white"
                  onClick={() => proposeGameMutation.mutate()}
                  disabled={proposeGameMutation.isPending}
                >
                  {proposeGameMutation.isPending ? "Proposing..." : "Propose Game Teams"}
                </Button>
              ) : (
                <Button
                  className="w-full border border-white"
                  onClick={() => createGameMutation.mutate()}
                  disabled={createGameMutation.isPending}
                >
                  {createGameMutation.isPending ? "Creating..." : "Create Game"}
                </Button>
              )}

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