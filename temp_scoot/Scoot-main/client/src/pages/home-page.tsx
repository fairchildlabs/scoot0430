import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ScootLogo } from "@/components/logos/scoot-logo";
import { format } from "date-fns";
import { type GameSet, type Game } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";

export default function HomePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [gameScores, setGameScores] = useState<Record<number, { showInputs: boolean; team1Score?: number; team2Score?: number }>>({});

  const { data: activeGameSet } = useQuery<GameSet>({
    queryKey: ["/api/game-sets/active"],
    enabled: !!user,
    refetchOnWindowFocus: true,
  });

  const { data: checkins = [], isLoading: checkinsLoading } = useQuery({
    queryKey: ["/api/checkins"],
    enabled: !!user,
    refetchOnWindowFocus: true,
  });

  const { data: activeGames = [], isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: ["/api/games/active"],
    enabled: !!user,
    refetchOnWindowFocus: true,
  });

  if (gamesLoading || checkinsLoading) {
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

  // Split players into active games and next up
  const nextUpPlayers = checkins?.filter(p =>
    p.isActive &&
    p.gameId === null
  ).sort((a, b) => a.queuePosition - b.queuePosition) || [];

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
    })),
    nextUpPlayers: nextUpPlayers.map(p => ({
      name: p.username,
      pos: p.queuePosition,
      type: p.type,
      isActive: p.isActive,
      gameId: p.gameId
    }))
  });

  // Separate active and finished games
  const activeGamesList = activeGames.filter(game => game.state === 'started');
  const finishedGamesList = activeGames.filter(game => game.state === 'final');

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
      console.log(`Submitting final scores for game ${gameId}:`, scores);
      const response = await fetch(`/api/games/${gameId}/score`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          team1Score: scores.team1Score,
          team2Score: scores.team2Score,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update game score');
      }

      console.log('Score update successful, invalidating and refetching queries...');

      // First invalidate all relevant queries in parallel
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/games/active"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["/api/checkins"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["/api/game-sets/active"], exact: true }),
        // Also invalidate any potentially affected query keys
        queryClient.invalidateQueries({ queryKey: [`/api/game-sets/${activeGameSet?.id}/log`], exact: true })
      ]);

      // Reset game scores state
      setGameScores(prev => ({
        ...prev,
        [gameId]: {
          showInputs: false,
          team1Score: undefined,
          team2Score: undefined
        }
      }));

      // Force an immediate refetch of the data
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["/api/games/active"], exact: true }),
        queryClient.refetchQueries({ queryKey: ["/api/checkins"], exact: true }),
        queryClient.refetchQueries({ queryKey: ["/api/game-sets/active"], exact: true }),
        queryClient.refetchQueries({ queryKey: [`/api/game-sets/${activeGameSet?.id}/log`], exact: true })
      ]);

      console.log('All queries have been refetched');
    } catch (error) {
      console.error('Error ending game:', error);
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
                    <div key={p.id} className="p-2 rounded-md text-sm bg-secondary/10">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-lg">#{p.queuePosition}</span>
                          <span>{p.username}</span>
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
                    <div key={p.id} className="p-2 rounded-md text-sm bg-white/10">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-lg">#{p.queuePosition}</span>
                          <span>{p.username}</span>
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
                    {activeGameSet ? (
                      <div className="flex flex-col space-y-1">
                        <span className="text-xl">Game Set #{activeGameSet.id}</span>
                        <span className="text-sm text-muted-foreground">
                          Created {format(new Date(activeGameSet.createdAt), 'PPp')}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {activeGameSet.gym} - {activeGameSet.playersPerTeam} players per team - {activeGameSet.numberOfCourts} courts
                        </span>
                      </div>
                    ) : (
                      "Current Games"
                    )}
                  </CardTitle>
                  {canEndGames && (
                    <Button 
                      onClick={() => setLocation("/games?tab=new-game")}
                      variant="outline"
                    >
                      New Game
                    </Button>
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
                        {nextUpPlayers.map((player: any) => (
                          <div key={player.id} className="flex items-center justify-between p-2 rounded-md bg-secondary/30">
                            <div className="flex items-center gap-4">
                              <span className="font-mono text-lg">#{player.queuePosition}</span>
                              <span>
                                {player.username}
                                {player.type === 'win_promoted' && (
                                  <span className="ml-2 text-sm text-green-400">
                                    (WP-{player.team === 1 ? 'H' : 'A'})
                                  </span>
                                )}
                                {player.type === 'loss_promoted' && (
                                  <span className="ml-2 text-sm text-yellow-400">
                                    (LP-{player.team === 1 ? 'H' : 'A'})
                                  </span>
                                )}
                              </span>
                            </div>
                            {isOG(player.birthYear) && (
                              <span className="text-white font-bold">OG</span>
                            )}
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