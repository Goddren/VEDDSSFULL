import { db, pool } from './db';
import { chartAnalyses } from '@shared/schema'; 
import { sql } from 'drizzle-orm';

async function updateSchema() {
  try {
    console.log('Updating database schema...');
    
    // Add the sharedImageUrl column to chart_analyses table if it doesn't exist
    await db.execute(sql`
      ALTER TABLE chart_analyses
      ADD COLUMN IF NOT EXISTS shared_image_url TEXT;
    `);
    
    console.log('Schema updated successfully.');
  } catch (error) {
    console.error('Error updating schema:', error);
  } finally {
    await pool.end();
  }
}

updateSchema().catch(console.error);