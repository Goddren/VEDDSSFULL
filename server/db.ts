import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/veddai';
const isNeon = DATABASE_URL.includes('neon.tech');
// Replit's managed database uses the internal 'helium' host — no SSL needed
const needsSsl = isNeon || (!DATABASE_URL.includes('localhost') && !DATABASE_URL.includes('helium'));

// pg.Pool for session store (connect-pg-simple) and raw queries
export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: isNeon ? 10000 : 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

// postgres-js client for Drizzle ORM
export const client = postgres(DATABASE_URL, {
  ssl: needsSsl ? 'require' : false,
  connect_timeout: isNeon ? 15 : 5,
  max: 10,
  idle_timeout: 30,
  max_lifetime: 1800,
});

// Drizzle ORM instance
export const db = drizzle(client);
