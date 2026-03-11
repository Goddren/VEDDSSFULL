import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import pg from 'pg';

// Simple database connection
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/veddai',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Create a postgres client
export const client = postgres(process.env.DATABASE_URL || 'postgres://localhost:5432/veddai', {
  ssl: process.env.DATABASE_URL ? 'require' : false
});

// Create a Drizzle instance
export const db = drizzle(client);