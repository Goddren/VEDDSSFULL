import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

// Create a postgres client
export const client = postgres(connectionString, { ssl: 'require' });

// Create a Drizzle instance
export const db = drizzle(client);

// For backward compatibility with connect-pg-simple
import pg from 'pg';
export const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });