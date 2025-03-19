import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, X, HandMetal, ArrowLeftRight, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Redirect } from "wouter";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

  // Get active game set
  const { data: activeGameSet, isLoading: gameSetLoading } = useQuery({
    queryKey: ["/api/game-sets/active"],
    enabled: !!user,
  });

  // Get checked-in players
  const { data: checkins = [], isLoading: checkinsLoading } = useQuery({
    queryKey: ["/api/checkins"],
    enabled: !!user,
  });

  const createGameMutation = useMutation({
    mutationFn: async () => {
      if (!activeGameSet) {
        throw new Error("No active game set available");
      }

      const playersNeeded = activeGameSet.playersPerTeam * 2;

      // Get current home and away team players
      console.log('Debug - Data from queries:', {
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
        }))
      });

      // Sort players based on their previous team assignment and queue position
      const sortedPlayers = [...(checkins || [])].sort((a, b) => {
        // First, ensure promoted players go to their previous teams
        if (a.type && !b.type) return -1;
        if (!a.type && b.type) return 1;
        // Then sort by queue position
        return a.queuePosition - b.queuePosition;
      });

      console.log('Initial sorted players:', sortedPlayers.map(p => ({
        username: p.username,
        queuePosition: p.queuePosition,
        team: p.team,
        type: p.type
      })));

      // Initialize team arrays
      let homePlayers: typeof sortedPlayers = [];
      let awayPlayers: typeof sortedPlayers = [];

      // First, assign promoted players to their previous teams
      sortedPlayers.forEach(player => {
        const isAwayTeam = player.type?.includes('WP') || player.type?.includes('LP') ?
          player.type.endsWith('-A') : player.team === 2;

        console.log('Processing player for team assignment:', {
          username: player.username,
          type: player.type,
          currentTeam: player.team,
          isAwayTeam,
          promotionType: player.type?.endsWith('-A') ? 'Away' : player.type?.endsWith('-H') ? 'Home' : 'None'
        });

        if (isAwayTeam && awayPlayers.length < activeGameSet.playersPerTeam) {
          awayPlayers.push(player);
        } else if (!isAwayTeam && homePlayers.length < activeGameSet.playersPerTeam) {
          homePlayers.push(player);
        }
      });

      console.log('After assigning promoted players:', {
        home: homePlayers.map(p => ({
          username: p.username,
          team: p.team,
          type: p.type,
          position: p.queuePosition
        })),
        away: awayPlayers.map(p => ({
          username: p.username,
          team: p.team,
          type: p.type,
          position: p.queuePosition
        }))
      });

      // Fill remaining spots with non-promoted players
      sortedPlayers.forEach(player => {
        const isAlreadyAssigned = [...homePlayers, ...awayPlayers].some(p => p.userId === player.userId);
        if (!isAlreadyAssigned) {
          if (homePlayers.length < activeGameSet.playersPerTeam) {
            homePlayers.push(player);
          } else if (awayPlayers.length < activeGameSet.playersPerTeam) {
            awayPlayers.push(player);
          }
        }
      });

      // Create game data
      const gameData: InsertGame = {
        setId: Number(activeGameSet.id),
        startTime: new Date().toISOString(),
        court: selectedCourt,
        state: 'started'
      };

      const playerAssignments = [
        ...homePlayers.map(p => ({ userId: p.userId, team: 1 })),
        ...awayPlayers.map(p => ({ userId: p.userId, team: 2 }))
      ];

      console.log('Final player assignments for API request:', {
        gameData,
        players: playerAssignments,
        playerDetails: {
          home: homePlayers.map(p => ({
            username: p.username,
            team: p.team,
            type: p.type
          })),
          away: awayPlayers.map(p => ({
            username: p.username,
            team: p.team,
            type: p.type
          }))
        }
      });

      // Create the game with assigned teams
      const res = await apiRequest("POST", "/api/games", {
        ...gameData,
        players: playerAssignments
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }
      return await res.json();
    },
    onSuccess: (game) => {
      queryClient.invalidateQueries({ queryKey: ["/api/games/active"] });
      toast({
        title: "Success",
        description: `Game #${game.id} created successfully`
      });
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create game",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const playerMoveMutation = useMutation({
    mutationFn: async ({ playerId, moveType, playerNumber }: { playerId: number, moveType: string, playerNumber: number }) => {
      if (!activeGameSet) throw new Error("No active game set");

      const res = await apiRequest("POST", "/api/player-move", {
        playerId,
        moveType,
        setId: activeGameSet.id
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }
      return { ...(await res.json()), playerNumber };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      setStatusMessage(`Player #${data.playerNumber} moved successfully`);
    },
    onError: (error: Error) => {
      console.error('Player move failed:', error);
      setStatusMessage(`Error: ${error.message}`);
    }
  });

  // If no active game set or it's invalid (id = 0), return early
  if (!activeGameSet || activeGameSet.id === 0) {
    return null;  // Parent component will handle the display
  }

  if (gameSetLoading || checkinsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }


  const playersNeeded = activeGameSet?.playersPerTeam * 2 || 0;
  const playersPerTeam = activeGameSet?.playersPerTeam || 0;
  const currentQueuePos = activeGameSet?.currentQueuePosition || 0;

  // Get players eligible for the next game
  const eligiblePlayers = checkins?.filter(p =>
    p.isActive &&
    p.gameId === null &&
    p.queuePosition >= currentQueuePos &&
    p.queuePosition < currentQueuePos + playersNeeded
  ).sort((a, b) => {
    // First, ensure promoted players go to their previous teams
    if (a.type && !b.type) return -1;  // Promoted players first
    if (!a.type && b.type) return 1;
    // Then sort by queue position
    return a.queuePosition - b.queuePosition;
  }) || [];

  // Initialize team arrays
  let homePlayers: any[] = [];
  let awayPlayers: any[] = [];

  // First, assign promoted players to their previous teams
  eligiblePlayers.forEach(player => {
    // Check if player should be on away team based on promotion type or previous team
    const isAwayTeam = player.type?.includes('WP') || player.type?.includes('LP') ?
      player.type.endsWith('-A') : player.team === 2;

    if (isAwayTeam && awayPlayers.length < playersPerTeam) {
      awayPlayers.push(player);
    } else if (!isAwayTeam && homePlayers.length < playersPerTeam) {
      homePlayers.push(player);
    }
  });

  // Fill remaining spots with non-promoted players
  eligiblePlayers.forEach(player => {
    const isAlreadyAssigned = [...homePlayers, ...awayPlayers].some(p => p.userId === player.userId);
    if (!isAlreadyAssigned) {
      if (homePlayers.length < playersPerTeam) {
        homePlayers.push(player);
      } else if (awayPlayers.length < playersPerTeam) {
        awayPlayers.push(player);
      }
    }
  });

  // Get next up players (those after the current game's players)
  const nextUpPlayers = checkins?.filter(p =>
    p.isActive &&
    p.gameId === null &&
    p.queuePosition >= (currentQueuePos + playersNeeded)
  ).sort((a, b) => a.queuePosition - b.queuePosition) || [];

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
          <span className="font-mono text-lg">#{player.queuePosition}</span>
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
          <Button
            size="icon"
            variant="outline"
            className="rounded-full h-8 w-8 border-white text-white hover:text-white"
            onClick={() => {
              const playerNumber = player.queuePosition;
              playerMoveMutation.mutate({ playerId: player.userId, moveType: 'CHECKOUT', playerNumber });
            }}
            disabled={playerMoveMutation.isPending}
          >
            {playerMoveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="rounded-full h-8 w-8 border-white text-white hover:text-white"
            onClick={() => {
              const playerNumber = player.queuePosition;
              playerMoveMutation.mutate({ playerId: player.userId, moveType: 'BUMP', playerNumber });
            }}
            disabled={playerMoveMutation.isPending}
          >
            {playerMoveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandMetal className="h-4 w-4" />}
          </Button>
          {!isNextUp && (
            <Button
              size="icon"
              variant="outline"
              className="rounded-full h-8 w-8 border-white text-white hover:text-white"
              onClick={() => {
                const playerNumber = player.queuePosition;
                playerMoveMutation.mutate({
                  playerId: player.userId,
                  moveType: isAway ? 'VERTICAL_SWAP' : 'HORIZONTAL_SWAP',
                  playerNumber
                });
              }}
              disabled={playerMoveMutation.isPending}
            >
              {playerMoveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                isAway ? <ArrowDown className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />
              )}
            </Button>
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

  const isLoading = playerMoveMutation.isPending || createGameMutation.isPending;

  const playersCheckedIn = checkins?.length || 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
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

                <div className="grid grid-cols-2 gap-4">
                  {/* Home Team */}
                  <Card className="bg-black/20 border border-white">
                    <CardHeader>
                      <CardTitle className="text-white">Home</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {homePlayers.map((player: any, index: number) => (
                          <PlayerCard key={player.id} player={player} index={index} />
                        ))}
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
                        {awayPlayers.map((player: any, index: number) => (
                          <PlayerCard
                            key={player.id}
                            player={player}
                            index={index}
                            isAway
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Button
                  className="w-full border border-white"
                  onClick={() => createGameMutation.mutate()}
                  disabled={createGameMutation.isPending}
                >
                  {createGameMutation.isPending ? "Creating..." : "Create Game"}
                </Button>

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
      </main>
      <Footer />
    </div>
  );
};

export default NewGamePage;