import { useQuery } from "@tanstack/react-query";
import { TeamCard } from "@/components/TeamCard";
import type { Team } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Teams() {
  const { data: teams, isLoading } = useQuery<Team[]>({
    queryKey: ['/api/teams'],
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Teams</h1>
          <Link href="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </div>

        {isLoading ? (
          <div>Loading teams...</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams?.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
