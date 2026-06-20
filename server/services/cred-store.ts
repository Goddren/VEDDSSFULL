// ─── Durable credential mirror ──────────────────────────────────────────────
// Render's filesystem is EPHEMERAL (no persistent disk) — every deploy/restart
// wipes data/*.json, taking saved API credentials with it. To survive deploys
// we mirror those JSON files to Postgres: back them up on every write, and
// restore them on boot if the local copy is missing/empty.
//
// This keeps all the existing synchronous file-based read code unchanged — the
// files remain the working store; the DB is the durable backup of record.

import * as fs from 'fs';
import * as path from 'path';
import { pool } from '../db';

const DATA_DIR = path.join(process.cwd(), 'data');

// Files that must survive deploys (credential sidecars).
const DURABLE_FILES = [
  'kalshi_credentials.json',
  'polymarket_us.json',
];

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(`CREATE TABLE IF NOT EXISTS durable_files (
        name        text PRIMARY KEY,
        content     text NOT NULL,
        updated_at  timestamptz NOT NULL DEFAULT now()
      )`)
      .then(() => undefined)
      .catch((e: any) => {
        console.error('[cred-store] ensureTable failed (non-fatal):', e?.message);
        tableReady = null; // allow retry on next call
      });
  }
  return tableReady;
}

/** Restore durable files from the DB on startup (only if local copy is missing/empty). */
export async function restoreDurableFiles(): Promise<void> {
  try {
    await ensureTable();
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const { rows } = await pool.query('SELECT name, content FROM durable_files');
    for (const r of rows as Array<{ name: string; content: string }>) {
      if (!DURABLE_FILES.includes(r.name)) continue;
      const fp = path.join(DATA_DIR, r.name);
      const existing = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8').trim() : '';
      // Don't clobber a non-empty local file (a fresher in-session write wins).
      if (!existing || existing === '{}') {
        fs.writeFileSync(fp, r.content);
        console.log(`[cred-store] restored ${r.name} from DB (${r.content.length} bytes)`);
      }
    }
  } catch (e: any) {
    console.error('[cred-store] restore failed (non-fatal):', e?.message);
  }
}

/** Persist a file's current content to the DB. Call right after writing the file. */
export function backupDurableFile(name: string, content: string): void {
  // Fire-and-forget — a backup hiccup must never break the in-session save.
  ensureTable()
    .then(() =>
      pool.query(
        `INSERT INTO durable_files (name, content, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (name) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
        [name, content],
      ),
    )
    .catch((e: any) => console.error(`[cred-store] backup ${name} failed (non-fatal):`, e?.message));
}
