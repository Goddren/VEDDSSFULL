/**
 * Strategy deployments — the binding between a saved wizard strategy and
 * one live account (MT5 / TradeLocker / DXtrade), plus the runner's own
 * trade log, which is the raw material for per-strategy analytics and
 * the strategy brain.
 *
 * Three kinds of deployment:
 *  - 'shadow' deployments (platform='shadow', no account): the runner
 *    evaluates the spec on the same closed bars but trades it VIRTUALLY
 *    — fills resolve from bar prices (services/strategy-shadow.ts) into
 *    strategy_trades rows with mode='shadow', a separate evidence layer
 *    that never counts toward Marketplace eligibility.
 *  - 'spec' strategies (templates with mechanical rules + condition-
 *    builder strategies): executed live by services/strategy-runner.ts,
 *    which evaluates the spec on closed bars and dispatches orders ONLY
 *    to the bound account.
 *  - 'engine' strategies (FX-engine natives): the engine itself is the
 *    executor and it fans out per user, not per account — a deployment
 *    here is the tracking/brain binding for the chosen account, and the
 *    UI says so plainly rather than pretending to re-route the engine.
 *
 * Lazy table creation, same pattern as wizard-spec-strategies.ts.
 */
import { pool } from '../db';

let tableReady: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS strategy_deployments (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          strategy_id INTEGER NOT NULL,
          platform TEXT NOT NULL,
          connection_ref TEXT NOT NULL,
          account_label TEXT,
          status TEXT NOT NULL DEFAULT 'running',
          last_bar_time BIGINT DEFAULT 0,
          last_signal_at TIMESTAMPTZ,
          last_error TEXT,
          error_streak INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          stopped_at TIMESTAMPTZ
        )`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS strategy_trades (
          id SERIAL PRIMARY KEY,
          deployment_id INTEGER NOT NULL,
          strategy_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          platform TEXT NOT NULL,
          symbol TEXT NOT NULL,
          direction TEXT NOT NULL,
          volume DOUBLE PRECISION NOT NULL DEFAULT 0,
          entry_price DOUBLE PRECISION NOT NULL DEFAULT 0,
          exit_price DOUBLE PRECISION,
          pnl DOUBLE PRECISION,
          platform_ref TEXT,
          status TEXT NOT NULL DEFAULT 'open',
          opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          closed_at TIMESTAMPTZ,
          exit_reason TEXT
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_strategy_deployments_user ON strategy_deployments (user_id, status)`);
      await pool.query(`ALTER TABLE strategy_trades ADD COLUMN IF NOT EXISTS breakeven_applied BOOLEAN NOT NULL DEFAULT false`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_strategy_trades_strategy ON strategy_trades (strategy_id, status)`);
      // ── Shadow deployments (additive) ──────────────────────────────
      // mode separates the strategy's evidence layers: every pre-shadow
      // row is 'live' by default, so live stats, the brain's live layer
      // and Marketplace eligibility are untouched; virtual fills from
      // shadow deployments are recorded as mode='shadow' and are only
      // ever read as the Shadow (virtual) layer.
      await pool.query(`ALTER TABLE strategy_trades ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'live'`);
      // Virtual-position bookkeeping the broker normally holds for live
      // trades: the working stop/target (breakeven/trailing move the
      // stop), the entry-time stop distance (the R denominator), the
      // favourable extreme tracker, and the resolved R multiple.
      await pool.query(`ALTER TABLE strategy_trades ADD COLUMN IF NOT EXISTS stop_loss DOUBLE PRECISION`);
      await pool.query(`ALTER TABLE strategy_trades ADD COLUMN IF NOT EXISTS take_profit DOUBLE PRECISION`);
      await pool.query(`ALTER TABLE strategy_trades ADD COLUMN IF NOT EXISTS risk_price_dist DOUBLE PRECISION`);
      await pool.query(`ALTER TABLE strategy_trades ADD COLUMN IF NOT EXISTS extreme_price DOUBLE PRECISION`);
      await pool.query(`ALTER TABLE strategy_trades ADD COLUMN IF NOT EXISTS r_multiple DOUBLE PRECISION`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_strategy_trades_mode ON strategy_trades (strategy_id, mode, status)`);
      // ── Lesson pause (shadow deployments, 2026-11-12) ─────────────
      // A shadow deployment whose OWN shadow record is proven losing
      // stops opening new shadow trades (its open trade still resolves)
      // and carries the pause here — status stays 'running' so the
      // runner keeps re-checking it every tick and the pause lifts on
      // its own when the rolling record clears. Set/cleared only by
      // strategy-runner.ts via setDeploymentLessonPause; kill switch
      // STUDIO_SHADOW_LESSONS=off disables the gate.
      await pool.query(`ALTER TABLE strategy_deployments ADD COLUMN IF NOT EXISTS lesson_paused_at TIMESTAMPTZ`);
      await pool.query(`ALTER TABLE strategy_deployments ADD COLUMN IF NOT EXISTS lesson_pause_reason TEXT`);
    })().catch((e) => { tableReady = null; throw e; });
  }
  return tableReady;
}

/** Public handle so other ensure-chains (the shared shadow ledger view)
 *  can guarantee these tables + shadow columns exist first. */
export async function ensureStrategyTables(): Promise<void> {
  return ensureTables();
}

export interface StrategyDeployment {
  id: number;
  userId: number;
  strategyId: number;
  /** 'shadow' = virtual deployment: no account, no broker — the runner
   *  trades it on paper into the strategy's shadow layer. */
  platform: 'mt5' | 'tradelocker' | 'dxtrade' | 'shadow';
  connectionRef: string;
  accountLabel: string | null;
  status: 'running' | 'stopped';
  lastBarTime: number;
  lastSignalAt: string | null;
  lastError: string | null;
  createdAt: string;
  stoppedAt: string | null;
  /** Shadow deployments only: paused BY ITS OWN LESSONS — the runner
   *  opens no new shadow trades while this is set, and clears it
   *  itself when the deployment's rolling shadow record recovers. */
  lessonPaused: boolean;
  lessonPauseReason: string | null;
}

function rowToDeployment(r: any): StrategyDeployment {
  return {
    id: r.id,
    userId: r.user_id,
    strategyId: r.strategy_id,
    platform: r.platform,
    connectionRef: r.connection_ref,
    accountLabel: r.account_label ?? null,
    status: r.status,
    lastBarTime: Number(r.last_bar_time) || 0,
    lastSignalAt: r.last_signal_at ?? null,
    lastError: r.last_error ?? null,
    createdAt: r.created_at,
    stoppedAt: r.stopped_at ?? null,
    lessonPaused: r.lesson_paused_at != null,
    lessonPauseReason: r.lesson_pause_reason ?? null,
  };
}

export async function createDeployment(userId: number, strategyId: number, platform: string, connectionRef: string, accountLabel: string | null): Promise<StrategyDeployment> {
  await ensureTables();
  const { rows } = await pool.query(
    `INSERT INTO strategy_deployments (user_id, strategy_id, platform, connection_ref, account_label)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, strategyId, platform, connectionRef, accountLabel],
  );
  return rowToDeployment(rows[0]);
}

export async function listDeployments(userId: number, strategyId?: number): Promise<StrategyDeployment[]> {
  await ensureTables();
  const { rows } = strategyId
    ? await pool.query(`SELECT * FROM strategy_deployments WHERE user_id=$1 AND strategy_id=$2 ORDER BY created_at DESC`, [userId, strategyId])
    : await pool.query(`SELECT * FROM strategy_deployments WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
  return rows.map(rowToDeployment);
}

export async function listRunningDeployments(): Promise<StrategyDeployment[]> {
  await ensureTables();
  const { rows } = await pool.query(`SELECT * FROM strategy_deployments WHERE status='running' ORDER BY id ASC`);
  return rows.map(rowToDeployment);
}

export async function getDeployment(userId: number, id: number): Promise<StrategyDeployment | null> {
  await ensureTables();
  const { rows } = await pool.query(`SELECT * FROM strategy_deployments WHERE id=$1 AND user_id=$2`, [id, userId]);
  return rows.length ? rowToDeployment(rows[0]) : null;
}

/** Set or clear a shadow deployment's lesson pause. Deliberately NOT
 *  touchDeployment's error path: a lesson pause is the deployment
 *  working as designed, not an error — it must never feed the
 *  5-error auto-stop. */
export async function setDeploymentLessonPause(id: number, reason: string | null): Promise<void> {
  await ensureTables();
  if (reason == null) {
    await pool.query(`UPDATE strategy_deployments SET lesson_paused_at=NULL, lesson_pause_reason=NULL WHERE id=$1 AND lesson_paused_at IS NOT NULL`, [id]);
  } else {
    await pool.query(
      `UPDATE strategy_deployments SET lesson_paused_at=now(), lesson_pause_reason=$2 WHERE id=$1`,
      [id, reason.slice(0, 500)],
    );
  }
}

export async function stopDeployment(userId: number, id: number): Promise<boolean> {
  await ensureTables();
  const r = await pool.query(
    `UPDATE strategy_deployments SET status='stopped', stopped_at=now() WHERE id=$1 AND user_id=$2 AND status='running'`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function touchDeployment(id: number, patch: { lastBarTime?: number; lastSignalAt?: boolean; error?: string | null }): Promise<void> {
  await ensureTables();
  if (patch.error === null) {
    await pool.query(
      `UPDATE strategy_deployments SET last_error=NULL, error_streak=0,
         last_bar_time=COALESCE($2, last_bar_time),
         last_signal_at=CASE WHEN $3 THEN now() ELSE last_signal_at END
       WHERE id=$1`,
      [id, patch.lastBarTime ?? null, !!patch.lastSignalAt],
    );
  } else if (typeof patch.error === 'string') {
    await pool.query(
      `UPDATE strategy_deployments SET last_error=$2, error_streak=error_streak+1,
         status=CASE WHEN error_streak+1 >= 5 THEN 'stopped' ELSE status END,
         stopped_at=CASE WHEN error_streak+1 >= 5 THEN now() ELSE stopped_at END
       WHERE id=$1`,
      [id, patch.error.slice(0, 500)],
    );
  } else if (patch.lastBarTime != null || patch.lastSignalAt) {
    await pool.query(
      `UPDATE strategy_deployments SET last_bar_time=COALESCE($2, last_bar_time),
         last_signal_at=CASE WHEN $3 THEN now() ELSE last_signal_at END WHERE id=$1`,
      [id, patch.lastBarTime ?? null, !!patch.lastSignalAt],
    );
  }
}

// ── Runner trade log ────────────────────────────────────────────────

export async function openStrategyTrade(dep: StrategyDeployment, t: {
  symbol: string; direction: string; volume: number; entryPrice: number; platformRef: string | null;
  /** Evidence layer: 'live' (default — every existing caller) or
   *  'shadow' for virtual fills. Shadow rows also carry their virtual
   *  stop/target, entry-time risk distance and extreme tracker. */
  mode?: 'live' | 'shadow';
  stopLoss?: number | null;
  takeProfit?: number | null;
  riskDist?: number | null;
  extremePrice?: number | null;
}): Promise<number> {
  await ensureTables();
  const { rows } = await pool.query(
    `INSERT INTO strategy_trades (deployment_id, strategy_id, user_id, platform, symbol, direction, volume, entry_price, platform_ref, mode, stop_loss, take_profit, risk_price_dist, extreme_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [dep.id, dep.strategyId, dep.userId, dep.platform, t.symbol, t.direction, t.volume, t.entryPrice, t.platformRef,
     t.mode ?? 'live', t.stopLoss ?? null, t.takeProfit ?? null, t.riskDist ?? null, t.extremePrice ?? null],
  );
  return rows[0].id;
}

export async function getOpenStrategyTrade(deploymentId: number): Promise<any | null> {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM strategy_trades WHERE deployment_id=$1 AND status='open' ORDER BY opened_at DESC LIMIT 1`,
    [deploymentId],
  );
  return rows[0] ?? null;
}

export async function markStrategyTradeBreakeven(id: number): Promise<void> {
  await ensureTables();
  await pool.query(`UPDATE strategy_trades SET breakeven_applied=true WHERE id=$1`, [id]);
}

export async function closeStrategyTrade(id: number, exitPrice: number, pnl: number | null, exitReason: string, rMultiple?: number | null): Promise<void> {
  await ensureTables();
  await pool.query(
    `UPDATE strategy_trades SET status='closed', exit_price=$2, pnl=$3, exit_reason=$4, closed_at=now(),
       r_multiple=COALESCE($5, r_multiple) WHERE id=$1`,
    [id, exitPrice, pnl, exitReason, rMultiple ?? null],
  );
}

/** Persist a shadow position's working stop / extreme tracker /
 *  breakeven flag as bars resolve (the broker holds this state for
 *  live trades; virtual positions keep it on the trade row). */
export async function updateStrategyTradeLevels(id: number, patch: {
  stopLoss?: number | null; extremePrice?: number | null; breakevenApplied?: boolean;
}): Promise<void> {
  await ensureTables();
  await pool.query(
    `UPDATE strategy_trades SET
       stop_loss=COALESCE($2, stop_loss),
       extreme_price=COALESCE($3, extreme_price),
       breakeven_applied=CASE WHEN $4 THEN true ELSE breakeven_applied END
     WHERE id=$1`,
    [id, patch.stopLoss ?? null, patch.extremePrice ?? null, !!patch.breakevenApplied],
  );
}

export async function listStrategyTrades(userId: number, strategyId: number, limit = 500): Promise<any[]> {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM strategy_trades WHERE user_id=$1 AND strategy_id=$2 ORDER BY opened_at DESC LIMIT $3`,
    [userId, strategyId, limit],
  );
  return rows;
}
