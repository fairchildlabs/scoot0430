import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertGameSetSchema, type InsertGameSet } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import NewGamePage from "./new-game";
import { useDatabaseRefresh } from "@/hooks/use-database-refresh";

const pointSystemOptions = ['1s only', '2s only', '2s and 3s'] as const;
const gymOptions = ['fonde'] as const;

// This will be true in Replit environment
const isReplitEnv = true; // Always show in Replit UI for development

// Update the GameSetLog component to show checkin type
function GameSetLog() {
  const { data: activeGameSet } = useQuery({
    queryKey: ["/api/game-sets/active"],
  });

  const { data: gameSetLog } = useQuery({
    queryKey: [`/api/game-sets/${activeGameSet?.id}/log`],
    enabled: !!activeGameSet?.id,
  });

  if (!activeGameSet) {
    return (
      <div className="text-center py-4">
        <p className="text-muted-foreground">No active game set available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-4 font-semibold border-b pb-2">
        <div>Position</div>
        <div className="col-span-2">Player</div>
        <div>Team</div>
        <div>Court</div>
        <div>Score</div>
        <div>Type</div>
      </div>
      <div className="space-y-2">
        {gameSetLog?.map((entry: any) => (
          <div key={entry.queuePosition} className="grid grid-cols-7 gap-4 py-2">
            <div>#{entry.queuePosition}</div>
            <div className="col-span-2">{entry.username}</div>
            <div>{entry.team || "Pending"}</div>
            <div>{entry.court || "-"}</div>
            <div>{entry.score || "Pending"}</div>
            <div>{entry.type}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GamesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { triggerRefresh } = useDatabaseRefresh();

  // Get tab from URL
  const searchParams = new URLSearchParams(window.location.search);
  const defaultTab = searchParams.get('tab') || 'new-game-set';

  if (!user?.isEngineer && !user?.isRoot) {
    setLocation("/");
    return null;
  }

  const handleClearQueue = async () => {
    try {
      const response = await fetch("/api/checkins/clear", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to clear queue");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      triggerRefresh();
      toast({
        title: "Success",
        description: "Queue cleared successfully",
      });
    } catch (error) {
      console.error("Error clearing queue:", error);
      toast({
        title: "Error",
        description: "Failed to clear queue",
        variant: "destructive",
      });
    }
  };

  const handleCheckInAll = async () => {
    try {
      const response = await fetch("/api/checkins/check-in-all", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to check in all players");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      triggerRefresh();
      toast({
        title: "Success",
        description: "All players checked in successfully",
      });
    } catch (error) {
      console.error("Error checking in all players:", error);
      toast({
        title: "Error",
        description: "Failed to check in all players",
        variant: "destructive",
      });
    }
  };

  // Add clearGameSet function
  const handleClearGameSet = async () => {
    try {
      const response = await fetch("/api/game-sets/clear", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to clear game set");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/game-sets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/game-sets/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      triggerRefresh();
      toast({
        title: "Success",
        description: "Game set cleared successfully",
      });
    } catch (error) {
      console.error("Error clearing game set:", error);
      toast({
        title: "Error",
        description: "Failed to clear game set",
        variant: "destructive",
      });
    }
  };

  // Add after other button handlers in GamesPage component
  const handleResetDatabase = async () => {
    try {
      const response = await fetch("/api/database/reset", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to reset database");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/game-sets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/game-sets/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      triggerRefresh();
      toast({
        title: "Success",
        description: "Database reset successfully (preserved users)",
      });
    } catch (error) {
      console.error("Error resetting database:", error);
      toast({
        title: "Error",
        description: "Failed to reset database",
        variant: "destructive",
      });
    }
  };

  function NewGameSetForm() {
    const form = useForm<InsertGameSet>({
      resolver: zodResolver(insertGameSetSchema),
      defaultValues: {
        playersPerTeam: 4,
        gym: 'fonde' as const,
        maxConsecutiveTeamWins: 2,
        timeLimit: 15,
        winScore: 21,
        pointSystem: '2s and 3s' as const,
        numberOfCourts: 2,
      },
    });

    const createGameSetMutation = useMutation({
      mutationFn: async (data: InsertGameSet) => {
        const res = await fetch("/api/game-sets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText);
        }
        return await res.json();
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/game-sets"] });
        toast({
          title: "Success",
          description: "Game set created successfully",
        });
        form.reset();
      },
      onError: (error: Error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => createGameSetMutation.mutate(data))} className="space-y-4">
          <FormField
            control={form.control}
            name="playersPerTeam"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Players Per Team</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="numberOfCourts"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number of Courts</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="gym"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gym</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="w-full p-2 rounded-md border border-input bg-background"
                  >
                    {gymOptions.map(gym => (
                      <option key={gym} value={gym}>{gym}</option>
                    ))}
                  </select>
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maxConsecutiveTeamWins"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Consecutive Team Wins</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="timeLimit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Time Limit (minutes)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={5}
                    max={60}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="winScore"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Win Score</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="pointSystem"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Point System</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="w-full p-2 rounded-md border border-input bg-background"
                  >
                    {pointSystemOptions.map(system => (
                      <option key={system} value={system}>{system}</option>
                    ))}
                  </select>
                </FormControl>
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={createGameSetMutation.isPending}
          >
            Create Game Set
          </Button>
        </form>
      </Form>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Games Management</h1>
          <div className="flex gap-4">
            <Button onClick={handleCheckInAll}>
              Check-In All
            </Button>
            <Button onClick={handleClearQueue} variant="destructive">
              Clear Queue
            </Button>
            <Button onClick={handleClearGameSet} variant="destructive">
              Clear Game Set
            </Button>
            {/* Always show reset button in Replit environment */}
            <Button onClick={handleResetDatabase} variant="destructive">
              Reset Database
            </Button>
          </div>
        </div>
        <Card>
          <CardContent className="p-6">
            <Tabs defaultValue={defaultTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="new-game-set">New Game Set</TabsTrigger>
                <TabsTrigger value="new-game">New Game</TabsTrigger>
                <TabsTrigger value="game-set-log">Game Set Log</TabsTrigger>
              </TabsList>
              <TabsContent value="new-game-set">
                <NewGameSetForm />
              </TabsContent>
              <TabsContent value="new-game">
                <NewGamePage />
              </TabsContent>
              <TabsContent value="game-set-log">
                <GameSetLog />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}