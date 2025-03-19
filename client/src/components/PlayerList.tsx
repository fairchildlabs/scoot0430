import { useQuery } from "@tanstack/react-query";
import type { Player } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PlayerListProps {
  teamId: number;
}

export function PlayerList({ teamId }: PlayerListProps) {
  const { data: players, isLoading } = useQuery<Player[]>({
    queryKey: ['/api/teams', teamId, 'players'],
  });

  if (isLoading) {
    return <div className="mt-4">Loading players...</div>;
  }

  if (!players?.length) {
    return <div className="mt-4">No players found</div>;
  }

  return (
    <ScrollArea className="h-[200px] mt-4">
      <div className="space-y-2">
        {players.map((player) => (
          <div
            key={player.id}
            className="p-2 bg-accent rounded-md"
          >
            <div className="font-medium">{player.name}</div>
            <div className="text-sm text-muted-foreground">
              #{player.number} - {player.position}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
