// FX paper-trade monitor.
//
// FX paper trades are OPENED in three places (the /api/fx-paper/trades route,
// the live engine's paper mode, and copy mirrors) but nothing ever CLOSED the
// engine-opened ones — they sat 'open' forever, so they produced no W/L outcome
// and the FX brain could never learn from them. This loop watches every open
// paper trade against live price and closes it when its SL/TP is touched (or a
// max-hold timeout elapses), writing a real result the brain then trains on.
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { marketDataService } from '../market-data/service';

const TICK_MS = 3 * 60 * 1000;          // check open paper trades every 3 min
const MAX_HOLD_MS = 3 * 24 * 60 * 60 * 1000; // force-close a paper trade after 3 days

function arr(r: any): any[] { return Array.isArray(r) ? r : ((r as any)?.rows ?? []); }

// Approximate pips + P&L for a paper fill. W/L is exact (SL/TP based); the
// dollar figure is a reasonable simulation — good enough for a paper journal and
// for the brain, which weights win-rate/direction far more than exact profit.
function computePipsAndPnl(pair: string, direction: string, entry: number, exit: number, lot: number): { pips: number; pnl: number } {
  const dir = /sell|short/i.test(direction) ? -1 : 1;
  const diff = (exit - entry) * dir;
  const isJpy = /JPY/i.test(pair);
  const isFxPair = /^[A-Za-z]{6}$/.test(pair) && !/BTC|ETH|XAU|XAG|USD30|US30|NAS|SPX|US500/i.test(pair);
  let pips: number, pnl: number;
  if (isJpy) { pips = diff / 0.01; pnl = pips * lot * 9; }            // ~$9/pip/std-lot for JPY crosses
  else if (isFxPair) { pips = diff / 0.0001; pnl = pips * lot * 10; } // ~$10/pip/std-lot for USD-quoted FX
  else { pips = diff; pnl = diff * lot; }                            // crypto/metal/index — raw diff * lot
  return { pips: Math.round(pips * 10) / 10, pnl: Math.round(pnl * 100) / 100 };
}

async function closeCascade(t: any, exit: number, pnl: number, pips: number, hit: string): Promise<void> {
  await db.execute(sql`UPDATE fx_paper_trades SET status='closed', exit_price=${exit}, pnl=${pnl}, pnl_pips=${pips}, closed_at=now() WHERE id=${t.id} AND status='open'`);
  await db.execute(sql`UPDATE fx_paper_accounts SET balance=balance+${pnl}, updated_at=now() WHERE user_id=${t.user_id}`);

  // Close any copier mirrors of this trade (same cascade as the manual close route).
  try {
    const logsRes = await db.execute(sql`
      SELECT ctl.id, ctl.copier_id, ctl.lot_size, ctl.copier_fx_trade_id, ctl.broker_order_id,
             cr.id AS relationship_id, cr.account_type, cr.copier_connection_id, cr.profit_share_pct
      FROM copy_trade_logs ctl JOIN copy_relationships cr ON cr.id = ctl.relationship_id
      WHERE ctl.original_trade_id=${t.id} AND ctl.status='open'`);
    const logs = arr(logsRes);
    if (logs.length) {
      const { executeCopyTradeClose } = await import('./copy-trade-execution');
      const srcLot = parseFloat(String(t.lot_size)) || 0.01;
      for (const log of logs) {
        const rel = {
          id: log.relationship_id, copier_id: log.copier_id, source_user_id: t.user_id,
          account_type: log.account_type, max_lot_size: log.lot_size,
          profit_share_pct: log.profit_share_pct, copier_connection_id: log.copier_connection_id,
        };
        const logForClose = {
          id: log.id,
          copierFxTradeId: log.copier_fx_trade_id ?? null,
          brokerOrderId: log.broker_order_id ?? null,
          lotSize: parseFloat(String(log.lot_size)) || 0.01,
        };
        const copierPnl = await executeCopyTradeClose(rel, logForClose, exit, pnl, srcLot).catch(() => 0);
        await db.execute(sql`UPDATE copy_trade_logs SET status='closed', exit_price=${exit}, pnl=${copierPnl}, closed_at=now() WHERE id=${log.id}`);
      }
    }
  } catch { /* non-fatal — copier close is best-effort */ }

  console.log(`[fx-paper-monitor] closed #${t.id} ${t.pair} ${t.direction} @ ${exit} (${hit}) pnl ${pnl} pips ${pips}`);
}

async function tick(): Promise<void> {
  let open: any[];
  try {
    open = arr(await db.execute(sql`SELECT id, user_id, pair, direction, entry_price, stop_loss, take_profit, lot_size, opened_at FROM fx_paper_trades WHERE status='open'`));
  } catch (e: any) {
    console.error('[fx-paper-monitor] load failed:', e.message); return;
  }
  if (!open.length) return;

  const barCache = new Map<string, any>(); // pair -> latest bar (or null)
  let closed = 0;
  for (const t of open) {
    const pair: string = t.pair;
    if (!pair) continue;
    const entry = Number(t.entry_price);
    const sl = t.stop_loss != null ? Number(t.stop_loss) : null;
    const tp = t.take_profit != null ? Number(t.take_profit) : null;
    const ageMs = Date.now() - new Date(t.opened_at).getTime();

    // Fetch the latest bar once per pair per tick.
    let bar = barCache.get(pair);
    if (bar === undefined) {
      try {
        const assetType = marketDataService.detectAssetType(pair);
        const r = await marketDataService.fetchMarketData({ symbol: pair, assetType, timeframe: '5m', limit: 2 });
        bar = (r.bars && r.bars.length) ? r.bars[r.bars.length - 1] : null;
      } catch { bar = null; }
      barCache.set(pair, bar);
    }
    if (!bar || !(entry > 0)) {
      // No price (or no usable entry): still force-close very old trades at entry
      // so they don't hang forever and can feed the brain.
      if (ageMs > MAX_HOLD_MS && entry > 0) {
        await closeCascade(t, entry, 0, 0, 'timeout-noprice').catch(() => {});
        closed++;
      }
      continue;
    }

    const isBuy = /buy|long/i.test(t.direction);
    let exit: number | null = null;
    let hit = '';
    if (isBuy) {
      if (sl != null && bar.low <= sl) { exit = sl; hit = 'stop_loss'; }        // SL checked first (conservative)
      else if (tp != null && bar.high >= tp) { exit = tp; hit = 'take_profit'; }
    } else {
      if (sl != null && bar.high >= sl) { exit = sl; hit = 'stop_loss'; }
      else if (tp != null && bar.low <= tp) { exit = tp; hit = 'take_profit'; }
    }
    if (exit == null && ageMs > MAX_HOLD_MS) { exit = Number(bar.close); hit = 'timeout'; } // force-close stale trade at market
    if (exit == null) continue;

    const { pips, pnl } = computePipsAndPnl(pair, t.direction, entry, exit, Number(t.lot_size) || 0.01);
    await closeCascade(t, exit, pnl, pips, hit).catch((e: any) => console.error(`[fx-paper-monitor] close #${t.id} failed:`, e.message));
    closed++;
  }
  if (closed) console.log(`[fx-paper-monitor] tick closed ${closed}/${open.length} open paper trade(s).`);
}

let started = false;
export function startFxPaperMonitor(): void {
  if (started) return;
  started = true;
  console.log(`[fx-paper-monitor] started — closing open FX paper trades on SL/TP every ${TICK_MS / 60000} min (max-hold ${MAX_HOLD_MS / 3600000}h).`);
  setInterval(() => { tick().catch(e => console.error('[fx-paper-monitor] tick error:', e?.message ?? e)); }, TICK_MS);
  setTimeout(() => { tick().catch(() => {}); }, 15000); // first pass shortly after boot
}
