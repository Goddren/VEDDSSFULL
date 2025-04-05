import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

// Create a new connection pool
export const pool = new Pool({ connectionString });

// Create a Drizzle client with the pool
export const db = drizzle(pool);