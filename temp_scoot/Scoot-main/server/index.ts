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

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const tryPort = (port: number): Promise<number> => {
    return new Promise((resolve, reject) => {
      log(`Attempting to bind to port ${port}...`);

      const tryServer = server.listen({
        port,
        host: "0.0.0.0",
      });

      tryServer.on('listening', () => {
        // Add a short delay before declaring success
        setTimeout(() => {
          log(`Successfully bound to port ${port}`);
          resolve(port);
        }, 100);
      });

      tryServer.on('error', (err: any) => {
        // Ensure server is closed before trying next port
        tryServer.close(() => {
          log(`Closed server on port ${port}`);
          if (err.code === 'EADDRINUSE') {
            log(`Port ${port} is in use, attempting port ${port + 1}`);
            // Try next port after current server is fully closed
            setTimeout(() => {
              tryPort(port + 1).then(resolve).catch(reject);
            }, 100);
          } else {
            log(`Failed to bind to port ${port}: ${err.message}`);
            reject(err);
          }
        });
      });
    });
  };

  tryPort(5000).then(usedPort => {
    log(`Server successfully started and serving on port ${usedPort}`);
  }).catch(err => {
    log(`Failed to start server: ${err.message}`);
    process.exit(1);
  });
})();