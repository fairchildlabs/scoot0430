import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import type { Team } from "@shared/schema";
import { PlayerList } from "./PlayerList";
import { useState } from "react";

interface TeamCardProps {
  team: Team;
}

export function TeamCard({ team }: TeamCardProps) {
  const [showPlayers, setShowPlayers] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{team.name}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowPlayers(!showPlayers)}
          >
            <Users className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">City: {team.city}</p>
          <p className="text-sm text-muted-foreground">Coach: {team.coach}</p>
        </div>
        
        {showPlayers && <PlayerList teamId={team.id} />}
      </CardContent>
    </Card>
  );
}
