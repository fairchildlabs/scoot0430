import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add an unprotected test route
app.get('/test', (_req, res) => {
  res.send('Hello World - Test Route');
});

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
    const server = await registerRoutes(app);

    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Server Error:', err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    // Let the environment determine which mode to use
    if (process.env.NODE_ENV === "production") {
      console.log('Setting up static file serving...');
      serveStatic(app);
    } else {
      console.log('Setting up Vite development middleware...');
      await setupVite(app, server);
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
  }
})();