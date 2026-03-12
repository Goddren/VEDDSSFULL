import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import pg from 'pg';

// Prefer Replit's helium DB (PGHOST) over any DATABASE_URL secret
// createDatabase() sets PGHOST/PGDATABASE/PGUSER/PGPASSWORD/PGPORT for helium
const buildHeliumUrl = () => {
  const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD, PGPORT } = process.env;
  if (PGHOST && PGDATABASE && PGUSER && PGPASSWORD) {
    const port = PGPORT || '5432';
    return `postgresql://${PGUSER}:${encodeURIComponent(PGPASSWORD)}@${PGHOST}:${port}/${PGDATABASE}`;
  }
  return null;
};

const DATABASE_URL =
  buildHeliumUrl() ||
  process.env.DATABASE_URL ||
  'postgres://localhost:5432/veddai';

const isNeon = DATABASE_URL.includes('neon.tech');
const isHelium = DATABASE_URL.includes('helium') || (process.env.PGHOST && !DATABASE_URL.includes('neon.tech'));
// No SSL for helium (internal Replit network); SSL required for Neon or other external hosts
const needsSsl = isNeon || (!DATABASE_URL.includes('localhost') && !isHelium);

console.log(`[db] Connecting to: ${DATABASE_URL.replace(/:\/\/[^@]+@/, '://***@')}`);

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
