// ─────────────────────────────────────────────────────────────────────────────
// Crypto paper trading (DeFi / Base) — 2026-10-30.
//
// The crypto engine's FX-style "shadow" learning: with paper mode on, the FULL
// engine runs (scan, score, AI consensus, brain gate, safety gates, ATR stop
// sizing) and every entry it WOULD swap on-chain is recorded here at the live
// pool price instead. Nothing touches a wallet, no gas, no swaps.
//
// Each open paper trade is marked to the pool price every scan cycle and
// closes at its stop, its target, or after PAPER_MAX_HOURS. Round-trip costs
// (DEX fee + the engine's slippage setting) come off every result so the
// record is realistic for Base. Every close feeds the crypto brain
// (crypto_brain_outcomes source='paper'), so it learns per token / strategy /
// hour before any real money is used.
//
// Settings live in runtime_state ('crypto_paper', userId): { enabled,
// startBalance, walletAddress } — no schema change, no config allow-list.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';

export interface PaperSettings { enabled: boolean; startBalance: number; walletAddress?: string | null; startedAt?: number }
const DEFAULTS: PaperSettings = { enabled: false, startBalance: 1000 };
const PAPER_MAX_HOURS = () => Math.max(1, Number(process.env.CRYPTO_PAPER_MAX_HOURS ?? 72));
const DEX_FEE_BPS = 30; // typical Base pool fee per swap

let _ensured: Promise<void> | null = null;
export function ensurePaperTable(): Promise<void> {
  if (!_ensured) {
    _ensured = pool.query(`CREATE TABLE IF NOT EXISTS crypto_paper_trades (
      id serial PRIMARY KEY, user_id int NOT NULL, symbol text NOT NULL, chain text, token_address text, pool_address text,
      strategy text, score real, direction text NOT NULL DEFAULT 'long',
      entry_price double precision NOT NULL, stop_loss double precision NOT NULL, take_profit double precision NOT NULL,
      notional_usd double precision NOT NULL, cost_bps int NOT NULL DEFAULT 0, reasoning text,
      status text NOT NULL DEFAULT 'open', exit_price double precision, exit_reason text,
      return_pct double precision, r_multiple double precision, pnl_usd double precision,
      opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz)`)
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS crypto_paper_trades_user_status ON crypto_paper_trades (user_id, status)`))
      .then(() => undefined)
      .catch((e) => { _ensured = null; throw e; });
  }
  return _ensured;
}

export async function getPaperSettings(userId: number): Promise<PaperSettings> {
  try {
    const { getRuntimeStateStrict } = await import('./runtime-state');
    const v = await getRuntimeStateStrict('crypto_paper', String(userId));
    return { ...DEFAULTS, ...(v || {}) };
  } catch {
    return { ...DEFAULTS }; // unreadable → paper off
  }
}

export async function savePaperSettings(userId: number, patch: Partial<PaperSettings>): Promise<PaperSettings> {
  const cur = await getPaperSettings(userId);
  const next: PaperSettings = {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : cur.enabled,
    startBalance: Number(patch.startBalance) > 0 ? Math.min(1_000_000, Number(patch.startBalance)) : cur.startBalance,
    walletAddress: patch.walletAddress !== undefined ? patch.walletAddress : cur.walletAddress ?? null,
    startedAt: cur.startedAt ?? (patch.enabled ? Date.now() : undefined),
  };
  const { ensureRuntimeStateTable } = await import('./runtime-state');
  await ensureRuntimeStateTable();
  await pool.query(
    `INSERT INTO runtime_state (scope, key, value, updated_at) VALUES ('crypto_paper', $1, $2::jsonb, now())
     ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [String(userId), JSON.stringify(next)],
  );
  return next;
}

/** Record a paper entry. Returns false (with a reason) when one is already open on this token. */
export async function openPaperTrade(t: {
  userId: number; symbol: string; chain: string; tokenAddress?: string | null; poolAddress?: string | null;
  strategy?: string | null; score?: number | null; entry: number; slPct: number; tpPct: number;
  notionalUsd: number; slippageBps: number; reasoning?: string | null;
}): Promise<{ ok: boolean; reason?: string; id?: number }> {
  await ensurePaperTable();
  const held = await pool.query(`SELECT 1 FROM crypto_paper_trades WHERE user_id=$1 AND status='open' AND symbol=$2 LIMIT 1`, [t.userId, t.symbol]);
  if (held.rows.length) return { ok: false, reason: 'already holding a paper position in this token' };
  const stop = t.entry * (1 - t.slPct / 100), target = t.entry * (1 + t.tpPct / 100);
  const costBps = 2 * (DEX_FEE_BPS + Math.max(0, Number(t.slippageBps) || 0) / 2); // round trip: fee each way + ~half the slippage cap each way
  const { rows } = await pool.query(
    `INSERT INTO crypto_paper_trades (user_id, symbol, chain, token_address, pool_address, strategy, score, entry_price, stop_loss, take_profit, notional_usd, cost_bps, reasoning)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [t.userId, t.symbol, t.chain, t.tokenAddress ?? null, t.poolAddress ?? null, t.strategy ?? null, t.score ?? null,
     t.entry, stop, target, t.notionalUsd, Math.round(costBps), (t.reasoning || '').slice(0, 2000)],
  );
  return { ok: true, id: rows[0]?.id };
}

/** Mark every open paper trade to the pool price; close at stop / target / time limit and teach the brain. */
export async function resolvePaperTrades(userId: number): Promise<number> {
  await ensurePaperTable();
  const { rows } = await pool.query(`SELECT * FROM crypto_paper_trades WHERE user_id=$1 AND status='open'`, [userId]);
  if (!rows.length) return 0;
  const { getDefiPrice } = await import('./defi-market-data');
  let closed = 0;
  for (const t of rows) {
    const px = t.pool_address ? await getDefiPrice(t.chain || 'base', t.pool_address).catch(() => null) : null;
    const ageH = (Date.now() - new Date(t.opened_at).getTime()) / 3_600_000;
    let exit: number | null = null, why = '';
    if (px != null && px > 0) {
      if (px <= t.stop_loss) { exit = t.stop_loss; why = 'stop'; }
      else if (px >= t.take_profit) { exit = t.take_profit; why = 'target'; }
      else if (ageH >= PAPER_MAX_HOURS()) { exit = px; why = 'time limit'; }
    } else if (ageH >= PAPER_MAX_HOURS() + 24) {
      // No price for a day past the limit — close flat rather than leave it open forever.
      exit = t.entry_price; why = 'no price (closed flat)';
    }
    if (exit == null) continue;
    const gross = ((exit - t.entry_price) / t.entry_price) * 100;
    const net = gross - Number(t.cost_bps || 0) / 100;
    const riskPct = ((t.entry_price - t.stop_loss) / t.entry_price) * 100;
    const r = riskPct > 0 ? net / riskPct : 0;
    const pnl = Number(t.notional_usd) * net / 100;
    const upd = await pool.query(
      `UPDATE crypto_paper_trades SET status='closed', exit_price=$2, exit_reason=$3, return_pct=$4, r_multiple=$5, pnl_usd=$6, closed_at=now()
        WHERE id=$1 AND status='open'`,
      [t.id, exit, why, net, r, pnl],
    );
    if (!upd.rowCount) continue; // another process closed it
    closed++;
    try {
      const { recordCryptoBrainOutcome } = await import('./crypto-brain');
      await recordCryptoBrainOutcome({
        userId, symbol: t.symbol, strategy: t.strategy || 'unknown', direction: 'long', entryConfidence: t.score ?? null,
        returnPct: net, holdingMinutes: Math.round(ageH * 60), exitReason: `paper ${why}`, profitLoss: pnl, source: 'paper',
      });
    } catch { /* learning must never break the paper loop */ }
  }
  return closed;
}

/** Scorecard + readiness for the UI, using the same go-live bar as the FX shadow models. */
export async function paperSummary(userId: number): Promise<any> {
  await ensurePaperTable();
  const settings = await getPaperSettings(userId);
  const [{ rows: agg }, { rows: open }, { rows: recent }, { rows: byToken }, { rows: weeks }] = await Promise.all([
    pool.query(`SELECT count(*)::int n, count(*) FILTER (WHERE pnl_usd > 0)::int w, COALESCE(sum(pnl_usd),0)::float pnl,
                       COALESCE(avg(r_multiple),0)::float avg_r FROM crypto_paper_trades WHERE user_id=$1 AND status='closed'`, [userId]),
    pool.query(`SELECT id, symbol, strategy, entry_price, stop_loss, take_profit, notional_usd, opened_at FROM crypto_paper_trades WHERE user_id=$1 AND status='open' ORDER BY opened_at DESC`, [userId]),
    pool.query(`SELECT id, symbol, strategy, entry_price, exit_price, exit_reason, return_pct, r_multiple, pnl_usd, opened_at, closed_at FROM crypto_paper_trades WHERE user_id=$1 AND status='closed' ORDER BY closed_at DESC LIMIT 25`, [userId]),
    pool.query(`SELECT symbol, count(*)::int n, count(*) FILTER (WHERE pnl_usd > 0)::int w, COALESCE(sum(r_multiple),0)::float r
                  FROM crypto_paper_trades WHERE user_id=$1 AND status='closed' GROUP BY 1 ORDER BY 4 DESC`, [userId]),
    pool.query(`SELECT date_trunc('week', closed_at) wk, COALESCE(sum(r_multiple),0)::float r FROM crypto_paper_trades
                 WHERE user_id=$1 AND status='closed' AND closed_at >= date_trunc('week', now()) - interval '7 days' GROUP BY 1`, [userId]),
  ]);
  const a = agg[0] || { n: 0, w: 0, pnl: 0, avg_r: 0 };
  const winRate = a.n ? a.w / a.n : 0;
  const noLosingWeek = weeks.every((x: any) => Number(x.r) >= 0);
  const bar = { trades: 50, avgR: 0.2, winRate: 0.4 };
  const ready = a.n >= bar.trades && a.avg_r >= bar.avgR && winRate >= bar.winRate && noLosingWeek;
  return {
    settings,
    balance: settings.startBalance + Number(a.pnl || 0),
    stats: { trades: a.n, wins: a.w, winRate, avgR: a.avg_r, pnlUsd: a.pnl },
    readiness: { ready, bar, progressTrades: Math.min(1, a.n / bar.trades), noLosingWeek },
    open, recent,
    best: byToken.slice(0, 5), worst: byToken.slice(-5).reverse(),
  };
}
