import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/veddai';
const isNeon = DATABASE_URL.includes('neon.tech');

// pg.Pool for session store (connect-pg-simple) and raw queries
export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  // Give Neon endpoints up to 10s to wake from suspension
  connectionTimeoutMillis: isNeon ? 10000 : 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

// postgres-js client for Drizzle ORM
export const client = postgres(DATABASE_URL, {
  ssl: DATABASE_URL.includes('localhost') ? false : 'require',
  // Neon endpoints can take a few seconds to wake up — give it 15s
  connect_timeout: isNeon ? 15 : 5,
  max: 10,
  idle_timeout: 30,
  max_lifetime: 1800,
});

// Drizzle ORM instance
export const db = drizzle(client);
