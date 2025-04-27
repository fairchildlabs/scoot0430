import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import { Request, Response } from "express-serve-static-core";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  // Verify session secret exists
  if (!process.env.SESSION_SECRET) {
    console.error("SESSION_SECRET is not set in environment variables!");
    process.env.SESSION_SECRET = 'temp-secret-' + Math.random().toString(36).substring(2, 15);
    console.warn("Using a temporary session secret. Sessions will be invalidated on server restart.");
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    }
  };

  console.log("Setting up authentication with session store:", {
    storeType: storage.sessionStore.constructor.name,
    cookieSecure: sessionSettings.cookie?.secure,
    sessionSecret: process.env.SESSION_SECRET ? '***exists***' : 'MISSING'
  });

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      console.log(`Login attempt for username: ${username}`);
      try {
        const user = await storage.getUserByUsername(username);
        
        if (!user) {
          console.log(`Login failed: Username ${username} not found`);
          return done(null, false, { message: 'Incorrect username' });
        }
        
        const passwordValid = await comparePasswords(password, user.password);
        if (!passwordValid) {
          console.log(`Login failed: Incorrect password for username ${username}`);
          return done(null, false, { message: 'Incorrect password' });
        }
        
        console.log(`Login successful for username: ${username}, user ID: ${user.id}`);
        return done(null, user);
      } catch (error) {
        console.error(`Login error for username ${username}:`, error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    console.log(`Serializing user ID: ${user.id}`);
    done(null, user.id);
  });
  
  passport.deserializeUser(async (id: number, done) => {
    try {
      console.log(`Deserializing user ID: ${id}`);
      const user = await storage.getUser(id);
      
      if (!user) {
        console.error(`User with ID ${id} not found during deserialization`);
        return done(null, false);
      }
      
      console.log(`Successfully deserialized user ID: ${id}, username: ${user.username}`);
      done(null, user);
    } catch (error) {
      console.error(`Error deserializing user ID ${id}:`, error);
      done(error);
    }
  });

  app.post("/api/register", async (req: Request, res: Response, next) => {
    console.log(`Registration attempt for username: ${req.body.username}`);
    
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log(`Registration failed: Username ${req.body.username} already exists`);
        return res.status(400).send("Username already exists");
      }

      // Hash the password and create user
      const hashedPassword = await hashPassword(req.body.password);
      const userData = {
        ...req.body,
        password: hashedPassword,
      };
      
      console.log(`Creating new user: ${req.body.username}`);
      const user = await storage.createUser(userData);
      console.log(`User created successfully, ID: ${user.id}`);

      // Log in the user after successful registration
      req.login(user, (err) => {
        if (err) {
          console.error(`Error logging in after registration: ${err.message}`);
          return next(err);
        }
        
        console.log(`Auto-login successful after registration for user ${user.username}`);
        const { password, ...safeUser } = user;
        res.status(201).json(safeUser);
      });
    } catch (error) {
      console.error(`Registration error for ${req.body.username}:`, error);
      res.status(500).send(`Error creating user account: ${(error as Error).message}`);
    }
  });

  app.post("/api/login", (req: Request, res: Response, next) => {
    console.log(`Processing login request for username: ${req.body.username}`);
    
    passport.authenticate("local", (err: any, user: SelectUser | false, info: { message: string } | undefined) => {
      if (err) {
        console.error("Login error:", err);
        return next(err);
      }
      
      if (!user) {
        console.log(`Authentication failed: ${info?.message || 'Unknown reason'}`);
        return res.status(401).json({ message: info?.message || "Authentication failed" });
      }
      
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("Session creation error:", loginErr);
          return next(loginErr);
        }
        
        console.log(`Login successful, session created for user: ${user.username}`);
        const { password, ...safeUser } = user;
        return res.status(200).json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req: Request, res: Response, next) => {
    if (!req.isAuthenticated()) {
      console.log("Logout requested but user not authenticated");
      return res.sendStatus(200);
    }
    
    const username = req.user?.username || 'unknown';
    console.log(`Logout requested for user: ${username}`);
    
    req.logout((err) => {
      if (err) {
        console.error(`Logout error for ${username}:`, err);
        return next(err);
      }
      console.log(`Logout successful for ${username}`);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req: Request, res: Response) => {
    const sessionID = req.sessionID || 'no-session-id';
    console.log(`GET /api/user - Session ID: ${sessionID}, isAuthenticated: ${req.isAuthenticated()}`);
    
    if (!req.isAuthenticated()) {
      console.log(`GET /api/user - Not authenticated, returning 401`);
      return res.sendStatus(401);
    }
    
    console.log(`GET /api/user - Authenticated user: ${req.user?.username}, ID: ${req.user?.id}`);
    const { password, ...safeUser } = req.user!;
    res.json(safeUser);
  });
}
