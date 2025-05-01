import { db, pool } from '../server/db';
import { sql } from 'drizzle-orm';

async function fixMessageBumpsTable() {
  console.log('Fixing message_bumps table...');
  
  try {
    // Alter the table to rename created_at to timestamp
    console.log('Renaming created_at column to timestamp...');
    await db.execute(sql`
      ALTER TABLE message_bumps 
      RENAME COLUMN created_at TO timestamp;
    `);
    
    console.log('Successfully updated message_bumps table!');
    
    // Verify column was renamed
    const result = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'message_bumps';
    `);
    
    console.log('Table columns after update:', result.rows);
  } catch (error) {
    console.error('Error fixing message_bumps table:', error);
  } finally {
    await pool.end();
  }
}

fixMessageBumpsTable()
  .then(() => console.log('Fix script completed.'))
  .catch(console.error);