import { db, pool } from '../server/db';
import { sql } from 'drizzle-orm';

async function createMessageBumpsTable() {
  console.log('Creating message_bumps table...');
  
  try {
    // Create message_bumps table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS message_bumps (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(message_id, user_id)
      );
    `);
    
    console.log('Successfully created message_bumps table!');
    
    // Verify table exists
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_name = 'message_bumps'
      );
    `);
    
    console.log('Table verification result:', result);
  } catch (error) {
    console.error('Error creating message_bumps table:', error);
  } finally {
    await pool.end();
  }
}

createMessageBumpsTable()
  .then(() => console.log('Script completed.'))
  .catch(console.error);