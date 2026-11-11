/**
 * Saved wizard strategies — the strategy entity for the whole platform.
 *
 * A row holds the StrategySpec (a template preset or condition-builder
 * output), the latest backtest summary, and the accumulating data
 * points (backtest today, live results later) that the strategy's
 * brain is built from. Table is created lazily (same pattern as
 * content presenters) so no migration step is needed. Rows are
 * strictly per-user: every read/write is scoped by user_id.
 */

import { pool } from '../db';
import type { StrategySpec } from './strategy-spec';

export type WizardStrategyStatus = 'draft' | 'backtested';

export interface WizardStrategy {
  id: number;
  userId: number;
  name: string;
  source: 'template' | 'builder';
  templateId: string | null;
  spec: StrategySpec;
  lastBacktest: Record<string, any> | null;
  hasEa: boolean;
  brainProfile: Record<string, any> | null;
  brainListingId: number | null;
  status: WizardStrategyStatus;
  createdAt: string;
  updatedAt: string;
}

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  return (tableReady ??= (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS wizard_strategies (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'builder',
      template_id TEXT,
      spec JSONB NOT NULL,
      last_backtest JSONB,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS wizard_strategies_user_idx ON wizard_strategies (user_id, id DESC)`);
    await pool.query(`ALTER TABLE wizard_strategies ADD COLUMN IF NOT EXISTS ea_code TEXT`);
    await pool.query(`ALTER TABLE wizard_strategies ADD COLUMN IF NOT EXISTS brain_profile JSONB`);
    await pool.query(`ALTER TABLE wizard_strategies ADD COLUMN IF NOT EXISTS brain_listing_id INTEGER`);
  })().catch((e) => { tableReady = null; throw e; }));
}

function rowToStrategy(r: any): WizardStrategy {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    source: r.source,
    templateId: r.template_id ?? null,
    spec: r.spec,
    lastBacktest: r.last_backtest ?? null,
    hasEa: !!r.has_ea,
    brainProfile: r.brain_profile ?? null,
    brainListingId: r.brain_listing_id ?? null,
    status: r.status,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

/** Public handle so other ensure-chains (the shared shadow ledger view,
 *  which names strategies from this table) can guarantee it exists. */
export async function ensureWizardStrategiesTable(): Promise<void> {
  return ensureTable();
}

const COLS = `id, user_id, name, source, template_id, spec, last_backtest, (ea_code IS NOT NULL) AS has_ea, status, created_at, updated_at, brain_profile, brain_listing_id`;

export async function createWizardStrategy(userId: number, spec: StrategySpec): Promise<WizardStrategy> {
  await ensureTable();
  const { rows } = await pool.query(
    `INSERT INTO wizard_strategies (user_id, name, source, template_id, spec)
     VALUES ($1,$2,$3,$4,$5) RETURNING ${COLS}`,
    [userId, spec.name, spec.source, spec.templateId ?? null, JSON.stringify(spec)]);
  return rowToStrategy(rows[0]);
}

export async function listWizardStrategies(userId: number): Promise<WizardStrategy[]> {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM wizard_strategies WHERE user_id=$1 ORDER BY id DESC LIMIT 100`, [userId]);
  return rows.map(rowToStrategy);
}

export async function getWizardStrategy(userId: number, id: number): Promise<WizardStrategy | null> {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM wizard_strategies WHERE id=$1 AND user_id=$2`, [id, userId]);
  return rows.length ? rowToStrategy(rows[0]) : null;
}

export async function updateWizardStrategySpec(userId: number, id: number, spec: StrategySpec): Promise<WizardStrategy | null> {
  await ensureTable();
  const { rows } = await pool.query(
    `UPDATE wizard_strategies SET name=$3, source=$4, template_id=$5, spec=$6, updated_at=now()
     WHERE id=$1 AND user_id=$2 RETURNING ${COLS}`,
    [id, userId, spec.name, spec.source, spec.templateId ?? null, JSON.stringify(spec)]);
  return rows.length ? rowToStrategy(rows[0]) : null;
}

export async function deleteWizardStrategy(userId: number, id: number): Promise<boolean> {
  await ensureTable();
  const { rowCount } = await pool.query(
    `DELETE FROM wizard_strategies WHERE id=$1 AND user_id=$2`, [id, userId]);
  return (rowCount ?? 0) > 0;
}

/** Persist the generated MT5 EA code on the strategy. */
/** Store (or clear) the strategy's brain profile / marketplace listing link. */
export async function recordWizardBrain(
  userId: number,
  id: number,
  patch: { profile?: any; listingId?: number | null },
): Promise<boolean> {
  await ensureTable();
  const sets: string[] = [];
  const params: any[] = [id, userId];
  if (patch.profile !== undefined) { params.push(JSON.stringify(patch.profile)); sets.push(`brain_profile = $${params.length}`); }
  if (patch.listingId !== undefined) { params.push(patch.listingId); sets.push(`brain_listing_id = $${params.length}`); }
  if (!sets.length) return false;
  sets.push('updated_at = now()');
  const r = await pool.query(
    `UPDATE wizard_strategies SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
    params,
  );
  return (r.rowCount ?? 0) > 0;
}

export async function recordWizardEa(userId: number, id: number, code: string): Promise<boolean> {
  await ensureTable();
  const { rowCount } = await pool.query(
    `UPDATE wizard_strategies SET ea_code=$3, updated_at=now() WHERE id=$1 AND user_id=$2`,
    [id, userId, code]);
  return (rowCount ?? 0) > 0;
}

/** Persist a backtest run on the strategy — stats + data points feed the strategy's brain later. */
export async function recordWizardBacktest(
  userId: number,
  id: number,
  summary: { stats: Record<string, any>; dataPoints: Record<string, any>; ranAt: string; barsUsed: number },
): Promise<WizardStrategy | null> {
  await ensureTable();
  const { rows } = await pool.query(
    `UPDATE wizard_strategies SET last_backtest=$3, status='backtested', updated_at=now()
     WHERE id=$1 AND user_id=$2 RETURNING ${COLS}`,
    [id, userId, JSON.stringify(summary)]);
  return rows.length ? rowToStrategy(rows[0]) : null;
}
