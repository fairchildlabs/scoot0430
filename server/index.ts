import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool, testDatabaseConnection } from "./db";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add detailed error logging
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  try {
    console.log('Starting server initialization...');

    // Test database connection with more detailed logging
    console.log('Testing database connection...');
    const isConnected = await testDatabaseConnection();
    if (!isConnected) {
      throw new Error('Failed to establish database connection after retries');
    }
    console.log('Database connection successful');

    console.log('Registering routes...');
    const server = await registerRoutes(app);
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

    // Start server with detailed logging
    const port = process.env.PORT || 5000;
    server.listen({
      port,
      host: "0.0.0.0"
    }, () => {
      console.log(`Server started successfully on port ${port}`);
      log(`Server is ready and listening on port ${port}`);
    });

  } catch (err) {
    console.error('Failed to start server:', err);
    if (err instanceof Error) {
      console.error('Error stack:', err.stack);
    }
    process.exit(1);
  } finally {
    // Ensure pool is released on shutdown
    process.on('SIGTERM', async () => {
      console.log('Shutting down server...');
      try {
        await pool.end();
        console.log('Database pool has been closed');
      } catch (err) {
        console.error('Error closing database pool:', err);
      }
      process.exit(0);
    });
  }
})();