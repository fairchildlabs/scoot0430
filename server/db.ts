import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Get the appropriate database URL based on environment
const getDatabaseUrl = () => {
  // For deployment
  if (process.env.DEPLOYMENT_DATABASE_URL) {
    return process.env.DEPLOYMENT_DATABASE_URL;
  }

  // For local development
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
};

export const pool = new Pool({ connectionString: getDatabaseUrl() });
export const db = drizzle({ client: pool, schema });