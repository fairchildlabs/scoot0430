import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTeamSchema, insertPlayerSchema, insertGameSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Teams routes
  app.get("/api/teams", async (_req, res) => {
    const teams = await storage.getTeams();
    res.json(teams);
  });

  app.get("/api/teams/:id", async (req, res) => {
    const team = await storage.getTeam(parseInt(req.params.id));
    if (!team) return res.status(404).json({ message: "Team not found" });
    res.json(team);
  });

  app.post("/api/teams", async (req, res) => {
    const result = insertTeamSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: "Invalid team data" });
    }
    const team = await storage.createTeam(result.data);
    res.status(201).json(team);
  });

  // Players routes
  app.get("/api/teams/:teamId/players", async (req, res) => {
    const players = await storage.getPlayers(parseInt(req.params.teamId));
    res.json(players);
  });

  app.post("/api/players", async (req, res) => {
    const result = insertPlayerSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: "Invalid player data" });
    }
    const player = await storage.createPlayer(result.data);
    res.status(201).json(player);
  });

  // Games routes
  app.get("/api/games", async (_req, res) => {
    const games = await storage.getGames();
    res.json(games);
  });

  app.post("/api/games", async (req, res) => {
    const result = insertGameSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: "Invalid game data" });
    }
    const game = await storage.createGame(result.data);
    res.status(201).json(game);
  });

  app.patch("/api/games/:id/score", async (req, res) => {
    const { homeScore, awayScore } = req.body;
    if (typeof homeScore !== 'number' || typeof awayScore !== 'number') {
      return res.status(400).json({ message: "Invalid score data" });
    }
    
    try {
      const game = await storage.updateGameScore(
        parseInt(req.params.id),
        homeScore,
        awayScore
      );
      res.json(game);
    } catch (error) {
      res.status(404).json({ message: "Game not found" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
