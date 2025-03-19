import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CircleDot } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <CircleDot className="h-10 w-10 text-primary" />
          <h1 className="text-4xl font-bold">Scoot</h1>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Link href="/teams">
            <Card className="cursor-pointer hover:bg-accent transition-colors">
              <CardHeader>
                <CardTitle>Teams</CardTitle>
                <CardDescription>
                  Manage basketball teams and their players
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/games">
            <Card className="cursor-pointer hover:bg-accent transition-colors">
              <CardHeader>
                <CardTitle>Games</CardTitle>
                <CardDescription>
                  Track games and update scores
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}