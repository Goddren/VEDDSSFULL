import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import pg from 'pg';

// Use a memory store for session data instead of PostgreSQL
import createMemoryStore from "memorystore";
import session from "express-session";
export const MemoryStore = createMemoryStore(session);

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