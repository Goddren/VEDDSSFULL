// Small durable key/value store for per-user runtime settings that used to live
// only in in-memory Maps (and so silently reset on every deploy). Writes are
// fire-and-forget; a failed read or write never blocks trading — callers fall
// back to their in-memory value, which is exactly the pre-existing behaviour.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "runtime_state" (
  "scope" text NOT NULL,
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("scope", "key")
);
`;

let ensured: Promise<void> | null = null;
export function ensureRuntimeStateTable(): Promise<void> {
  if (!ensured) {
    ensured = pool.query(DDL).then(() => undefined).catch((err: any) => {
      console.error('[runtime-state] ensure table failed (non-fatal):', err?.message ?? err);
      ensured = null;
    });
  }
  return ensured;
}

export function saveRuntimeState(scope: string, key: string, value: unknown): void {
  void (async () => {
    try {
      await ensureRuntimeStateTable();
      await pool.query(
        `INSERT INTO runtime_state (scope, key, value, updated_at) VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [scope, key, JSON.stringify(value)],
      );
    } catch (err: any) {
      console.error(`[runtime-state] save ${scope}/${key} failed (non-fatal):`, err?.message ?? err);
    }
  })();
}

export async function loadRuntimeState(scope: string): Promise<Array<{ key: string; value: any }>> {
  try {
    await ensureRuntimeStateTable();
    const { rows } = await pool.query(`SELECT key, value FROM runtime_state WHERE scope = $1`, [scope]);
    return rows;
  } catch (err: any) {
    console.error(`[runtime-state] load ${scope} failed (non-fatal):`, err?.message ?? err);
    return [];
  }
}

/** One key; THROWS on a read error (callers that must fail closed). */
export async function getRuntimeStateStrict(scope: string, key: string): Promise<any | null> {
  await ensureRuntimeStateTable();
  const { rows } = await pool.query(`SELECT value FROM runtime_state WHERE scope = $1 AND key = $2`, [scope, key]);
  return rows[0]?.value ?? null;
}

/** Insert only if absent; returns whichever value is stored afterwards. Throws on error. */
export async function insertRuntimeStateIfAbsent(scope: string, key: string, value: unknown): Promise<any> {
  await ensureRuntimeStateTable();
  await pool.query(
    `INSERT INTO runtime_state (scope, key, value) VALUES ($1, $2, $3::jsonb) ON CONFLICT (scope, key) DO NOTHING`,
    [scope, key, JSON.stringify(value)],
  );
  return getRuntimeStateStrict(scope, key);
}
