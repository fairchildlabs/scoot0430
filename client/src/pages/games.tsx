import { useQuery } from "@tanstack/react-query";
import { GameCard } from "@/components/GameCard";
import type { Game } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Games() {
  const { data: games, isLoading } = useQuery<Game[]>({
    queryKey: ['/api/games'],
  });

  const handleUpdateScore = (gameId: number) => {
    // To be implemented: Show a dialog to update scores
    console.log("Update score for game", gameId);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Games</h1>
          <Link href="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </div>

        {isLoading ? (
          <div>Loading games...</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {games?.map((game) => (
              <GameCard 
                key={game.id} 
                game={game}
                onUpdateScore={handleUpdateScore}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
