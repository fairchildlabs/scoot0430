// Simple script to run database migrations
import pg from 'pg';
const { Pool } = pg;

// Get database URL from environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    // Start a transaction
    await client.query('BEGIN');
    
    console.log('Running migrations...');
    
    // Add your migrations here
    // Migration 1: Rename max_consecutive_team_wins to max_consecutive_games
    console.log('1. Renaming max_consecutive_team_wins to max_consecutive_games...');
    await client.query('ALTER TABLE game_sets RENAME COLUMN max_consecutive_team_wins TO max_consecutive_games');
    
    // Commit the transaction
    await client.query('COMMIT');
    console.log('Migrations completed successfully!');
  } catch (err) {
    // If there's an error, roll back the transaction
    await client.query('ROLLBACK');
    console.error('Error running migrations:', err);
    throw err;
  } finally {
    // Release the client back to the pool
    client.release();
  }
}

// Run the migrations
migrate()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });