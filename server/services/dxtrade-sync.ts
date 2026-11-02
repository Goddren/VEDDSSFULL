/**
 * DXtrade background outcome sync — TradeLocker parity for the ledger.
 *
 * Until now DXtrade trade outcomes were resolved ONLY when a user opened
 * a dashboard/performance view (routes.ts syncDxtradeOutcomes, throttled
 * per-view). A user who never opened the page kept PENDING rows forever
 * and the brain/consistency ledger never learned from DX closes. This
 * loop runs the same resolution in the background for every user with an
 * active DXtrade connection:
 *
 *   closed trades (broker history, 30-day window)
 *     → match ai_trade_results by ticket dx_<accountCode>_<positionId>
 *     → PENDING rows resolve to WIN / LOSS / BREAKEVEN with real P&L
 *     → closes with no open row are recorded directly
 *     → realized P&L feeds the prop-firm consistency ledger
 *     → the sibling protective leg of a filled SL/TP is cancelled (poor-man's OCO)
 *
 * It stamps the same global the view-triggered sync uses
 * (global.dxOutcomeSyncAt) so the two never double-fire back to back.
 * Brokers that expose no history endpoint simply yield no rows — P&L is
 * never fabricated from a miss (see getClosedTradesWithPnl).
 */
import { pool } from '../db';
import { storage } from '../storage';

const SYNC_INTERVAL_MS = 90_000;
const LOOKBACK_MS = 30 * 24 * 3600 * 1000;

let started = false;
let running = false;

export async function syncAllDxtradeOutcomes(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const userRows = (await pool.query(
      `SELECT DISTINCT user_id FROM dxtrade_connections WHERE is_active=true`,
    )).rows;
    for (const { user_id: userId } of userRows) {
      try { await syncUserDxtradeOutcomes(Number(userId)); }
      catch { /* per-user failure is non-fatal */ }
    }
  } catch { /* table may not exist yet — non-fatal */ }
  finally { running = false; }
}

async function syncUserDxtradeOutcomes(userId: number): Promise<number> {
  const g = global as any;
  g.dxOutcomeSyncAt = g.dxOutcomeSyncAt || {};
  g.dxOutcomeSyncAt[userId] = Date.now(); // share the stamp with the view-triggered sync
  let added = 0;
  const rows = (await pool.query(
    `SELECT id, host, username, encrypted_password, domain, account_code FROM dxtrade_connections WHERE user_id=$1 AND is_active=true`,
    [userId],
  )).rows;
  if (!rows.length) return 0;
  const { getDxtradeService, decryptApiSecret, extractAccountCode } = await import('../dxtrade');
  const { recordRealizedPnl } = await import('./prop-firm-consistency');
  const fromMs = Date.now() - LOOKBACK_MS;
  for (const dc of rows) {
    try {
      const svc = getDxtradeService(dc.host, dc.username, decryptApiSecret(dc.encrypted_password), dc.domain, String(dc.id));
      await svc.ensureLoggedIn();
      const acct = dc.account_code || extractAccountCode(await svc.getAccounts());
      if (!acct) continue;
      const closed = await svc.getClosedTradesWithPnl(acct, fromMs).catch(() => [] as any[]);
      for (const o of closed) {
        const rawProfit = o.profit ?? o.pnl ?? o.realizedPnl ?? o.realizedPnL ?? o.grossProfit ?? null;
        const p = typeof rawProfit === 'number' ? rawProfit : parseFloat(rawProfit || '');
        if (!isFinite(p)) continue;
        const closedDateStr = o.closeTime ? new Date(o.closeTime).toISOString().slice(0, 10) : undefined;
        const tk = o.positionId ? `dx_${acct}_${o.positionId}` : (o.id ? `dx_${acct}_${o.id}` : '');
        if (!tk || /undefined|null|_$/.test(tk)) continue;
        const label = p > 0 ? 'WIN' : p < 0 ? 'LOSS' : 'BREAKEVEN';
        const existing = await storage.getAiTradeResultByTicket(userId, tk);
        if (existing) {
          if (existing.result === 'PENDING') {
            await storage.updateAiTradeResult(existing.id, userId, {
              result: label,
              profitLoss: p,
              connectionId: dc.id,
              exitPrice: o.closePrice || 0,
              closedAt: (() => { const t = (o.closeTime ? new Date(o.closeTime) : new Date()); const op = new Date((existing as any).createdAt ?? 0).getTime(); return op > 0 && t.getTime() <= op ? new Date() : t; })(),
            } as any);
            added++;
            await recordRealizedPnl(userId, dc.id, 'dxtrade', p, closedDateStr);
            const closedSym = (existing as any).symbol || o.symbol;
            if (closedSym) { try { await svc.cancelProtectiveOrders(acct, closedSym); } catch { /* best-effort */ } }
          } else if ((existing as any).connectionId == null) {
            await storage.updateAiTradeResult(existing.id, userId, { connectionId: dc.id } as any).catch(() => {});
          }
          continue;
        }
        await storage.createAiTradeResult({
          userId,
          symbol: String(o.symbol || o.instrument || 'UNKNOWN').toUpperCase().replace('/', ''),
          direction: /sell|short/i.test(o.side || o.direction || '') ? 'SELL' : 'BUY',
          entryPrice: o.openPrice || 0,
          exitPrice: o.closePrice || 0,
          aiConfidence: 0,
          result: label,
          profitLoss: p,
          source: 'dxtrade',
          connectionId: dc.id,
          mt5Ticket: tk,
          notes: 'DXtrade closed position (background sync)',
          closedAt: o.closeTime ? new Date(o.closeTime) : new Date(),
        } as any);
        added++;
        await recordRealizedPnl(userId, dc.id, 'dxtrade', p, closedDateStr);
      }
    } catch { /* per-connection, non-fatal */ }
  }
  if (added > 0) console.log(`[DX Sync] user ${userId}: +${added} DXtrade trades resolved`);
  return added;
}

/** Start the background DXtrade outcome sync loop. */
export function startDxtradeSync(): void {
  if (started) return;
  started = true;
  setInterval(() => { syncAllDxtradeOutcomes().catch(() => {}); }, SYNC_INTERVAL_MS);
  console.log('[DX Sync] Background DXtrade outcome sync started (90s interval).');
}
