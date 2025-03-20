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

// Create connection pool with reasonable defaults and retry logic
export const pool = new Pool({ 
  connectionString: getDatabaseUrl(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // Increased timeout for better reliability
  maxUses: 7500
});

// Add error handler to the pool
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client:', err);
  // Don't exit process, just log the error
  console.error('Database connection error occurred, will retry on next query');
});

// Initialize Drizzle ORM with the pool
export const db = drizzle({ client: pool, schema });

// Verify database connection
export async function testDatabaseConnection() {
  let retries = 3;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      console.log('Successfully connected to database');
      client.release();
      return true;
    } catch (err) {
      console.error(`Database connection attempt failed (${retries} retries left):`, err);
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  return false;
}

// Handle process termination gracefully
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM signal, shutting down database pool...');
  try {
    await pool.end();
    console.log('Database pool has been closed');
  } catch (err) {
    console.error('Error during database pool shutdown:', err);
  }
  process.exit(0);
});

// Handle unexpected shutdowns
process.on('SIGINT', async () => {
  console.log('Received SIGINT signal, shutting down database pool...');
  try {
    await pool.end();
    console.log('Database pool has been closed');
  } catch (err) {
    console.error('Error during database pool shutdown:', err);
  }
  process.exit(0);
});