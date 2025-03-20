import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool, testDatabaseConnection } from "./db";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health check endpoint
app.get("/health", (_req, res) => {
  res.send("OK");
});

// Add detailed error logging
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api") || path === "/health") {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

let server: any = null;

// Graceful shutdown handler
const shutdownGracefully = async (signal: string) => {
  console.log(`\nReceived ${signal}, starting graceful shutdown...`);

  // Set a timeout for the entire shutdown process
  const shutdownTimeout = setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);

  try {
    if (server) {
      console.log('Closing HTTP server...');
      await new Promise((resolve) => {
        server.close(resolve);
      });
      console.log('HTTP server closed');
    }

    console.log('Closing database pool...');
    await pool.end();
    console.log('Database pool closed');

    clearTimeout(shutdownTimeout);
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
process.on('SIGINT', () => shutdownGracefully('SIGINT'));

(async () => {
  const startupTimeout = setTimeout(() => {
    console.error('Server startup timed out');
    process.exit(1);
  }, 30000);

  try {
    console.log('Starting server initialization...');

    // Test database connection with timeout
    console.log('Testing database connection...');
    const isConnected = await testDatabaseConnection();
    if (!isConnected) {
      throw new Error('Failed to establish database connection after retries');
    }
    console.log('Database connection successful');

    // Initialize Express server first
    server = app.listen({
      port: process.env.PORT || 5000,
      host: "0.0.0.0"
    }, () => {
      console.log(`Server listening on port ${process.env.PORT || 5000}`);
    });

    console.log('Registering routes...');
    await registerRoutes(app);
    console.log('Routes registered successfully');

    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Server Error:', err);
      if (err.stack) {
        console.error('Error stack:', err.stack);
      }
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    // Let the environment determine which mode to use
    if (process.env.NODE_ENV === "production") {
      console.log('Setting up static file serving...');
      serveStatic(app);
      console.log('Static file serving setup complete');
    } else {
      console.log('Setting up Vite development middleware...');
      try {
        await setupVite(app, server);
        console.log('Vite middleware setup complete');
      } catch (error) {
        console.error('Error setting up Vite middleware:', error);
        throw error;
      }
    }

    clearTimeout(startupTimeout);
    console.log('Server initialization completed successfully');
    log(`Server is ready and listening on port ${process.env.PORT || 5000}`);

  } catch (err) {
    console.error('Failed to start server:', err);
    if (err instanceof Error) {
      console.error('Error stack:', err.stack);
    }
    process.exit(1);
  }
})();