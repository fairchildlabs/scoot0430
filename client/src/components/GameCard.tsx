import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Game, Team } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

interface GameCardProps {
  game: Game;
  onUpdateScore?: (gameId: number) => void;
}

export function GameCard({ game, onUpdateScore }: GameCardProps) {
  const { data: homeTeam } = useQuery<Team>({
    queryKey: ['/api/teams', game.homeTeamId],
  });

  const { data: awayTeam } = useQuery<Team>({
    queryKey: ['/api/teams', game.awayTeamId],
  });

  if (!homeTeam || !awayTeam) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {homeTeam.name} vs {awayTeam.name}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {format(new Date(game.date), 'PPP')}
        </p>
      </CardHeader>
      <CardContent>
        <div className="text-center space-y-2">
          <div className="text-2xl font-bold">
            {game.homeScore} - {game.awayScore}
          </div>
          
          {!game.completed && onUpdateScore && (
            <Button
              onClick={() => onUpdateScore(game.id)}
              variant="outline"
              size="sm"
            >
              Update Score
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
