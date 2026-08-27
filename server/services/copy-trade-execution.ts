/**
 * Copy trade execution — makes a copy_relationship actually DO something,
 * not just log a side-ledger row:
 *
 *   - accountType='paper': mirrors the trade into the copier's OWN
 *     fx_paper_trades/fx_paper_accounts, so it shows up in their personal
 *     paper journal and adjusts their own simulated balance.
 *   - accountType='real': places a live order on the copier's chosen
 *     TradeLocker connection, behind explicit safety gates. Real money moves
 *     automatically here — every gate below is a hard stop, not a warning.
 */
import { db } from '../db';
import { storage } from '../storage';
import { eq } from 'drizzle-orm';
import { copyTradeLogs } from '../../shared/schema';
import { executeMT5SignalOnTradeLocker } from '../tradelocker';

export interface CopyRelationshipRow {
  id: number;
  copier_id: number;
  source_user_id: number;
  account_type: string;
  max_lot_size: string | number;
  profit_share_pct: string | number;
  copier_connection_id: number | null;
}

export interface SourceTrade {
  tradeId: number;
  pair: string;
  direction: string;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  lotSize: number;
}

const DAILY_LOSS_BACKSTOP_PCT = 10; // fixed conservative default until made configurable
const MARGIN_LEVEL_FLOOR_PCT = 200; // matches Gate 0's floor elsewhere in the engine
const STALE_CACHE_MS = 2 * 60 * 1000;

/** Real-money safety gate — every check here is a hard block, not advisory. */
async function checkRealModeSafety(rel: CopyRelationshipRow, mirrorLot: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!rel.copier_connection_id) {
    return { ok: false, reason: 'No TradeLocker account selected for real-mode copying' };
  }

  const conn = await storage.getTradelockerConnection(rel.copier_connection_id);
  if (!conn || conn.userId !== rel.copier_id || !conn.isActive) {
    return { ok: false, reason: 'Selected TradeLocker connection is missing or inactive' };
  }

  const tlCache = (global as any).tlAccountData?.[rel.copier_id]?.[conn.accountId];
  if (!tlCache || !tlCache.lastUpdated) {
    return { ok: false, reason: 'No live account data available yet for this connection' };
  }
  const ageMs = Date.now() - new Date(tlCache.lastUpdated).getTime();
  if (ageMs > STALE_CACHE_MS || tlCache.error) {
    return { ok: false, reason: `Account data stale or errored (${tlCache.error || 'no fresh data'})` };
  }
  if (!(tlCache.balance > 0)) {
    return { ok: false, reason: 'Copier account has no balance' };
  }
  if (tlCache.freeMargin !== undefined && tlCache.freeMargin <= 0) {
    return { ok: false, reason: 'No free margin available on copier account' };
  }
  if (tlCache.margin > 0) {
    const marginLevel = (tlCache.equity / tlCache.margin) * 100;
    if (marginLevel < MARGIN_LEVEL_FLOOR_PCT) {
      return { ok: false, reason: `Margin level ${marginLevel.toFixed(0)}% below ${MARGIN_LEVEL_FLOOR_PCT}% safety floor` };
    }
  }

  const cappedLot = Math.min(mirrorLot, parseFloat(String(rel.max_lot_size)) || 0.01);
  if (cappedLot <= 0) {
    return { ok: false, reason: 'Resolved lot size is zero' };
  }

  // Daily-loss backstop — sum today's realized P&L for this relationship's
  // real-mode copy trades; block new opens once losses exceed the fixed cap.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todaysLogs = await db.select().from(copyTradeLogs).where(eq(copyTradeLogs.relationshipId, rel.id));
  const realizedToday = todaysLogs
    .filter(l => l.status === 'closed' && l.closedAt && l.closedAt >= today)
    .reduce((sum, l) => sum + (l.pnl || 0), 0);
  const lossPct = (realizedToday / tlCache.balance) * 100;
  if (lossPct <= -DAILY_LOSS_BACKSTOP_PCT) {
    return { ok: false, reason: `Daily loss backstop hit (${lossPct.toFixed(1)}% ≤ -${DAILY_LOSS_BACKSTOP_PCT}%) — real-mode copying paused for today` };
  }

  return { ok: true };
}

/**
 * Called when the leader's paper trade opens. Mirrors into the copier's own
 * account per their chosen mode. Never throws — failures are logged onto the
 * copy_trade_logs row itself so they're visible without blocking the leader's trade.
 */
export async function executeCopyTradeOpen(rel: CopyRelationshipRow, source: SourceTrade, copyLogId: number): Promise<void> {
  const mirrorLot = Math.min(parseFloat(String(rel.max_lot_size)) || 0.01, source.lotSize || 0.01);

  if (rel.account_type === 'real') {
    const safety = await checkRealModeSafety(rel, mirrorLot);
    if (!safety.ok) {
      await db.update(copyTradeLogs).set({
        status: 'closed',
        executionStatus: 'skipped',
        executionError: safety.reason,
        closedAt: new Date(),
      }).where(eq(copyTradeLogs.id, copyLogId));
      return;
    }
    try {
      const conn = await storage.getTradelockerConnection(rel.copier_connection_id!);
      const result = await executeMT5SignalOnTradeLocker(conn as any, {
        action: 'OPEN',
        symbol: source.pair,
        direction: source.direction,
        volume: mirrorLot,
        stopLoss: source.stopLoss,
        takeProfit: source.takeProfit,
        orderType: 'market',
      });
      await db.update(copyTradeLogs).set({
        executionStatus: result.success ? 'placed' : 'failed',
        brokerOrderId: result.orderId,
        executionError: result.error,
      }).where(eq(copyTradeLogs.id, copyLogId));
    } catch (e: any) {
      await db.update(copyTradeLogs).set({
        executionStatus: 'failed',
        executionError: e.message,
      }).where(eq(copyTradeLogs.id, copyLogId));
    }
    return;
  }

  // Paper mode — mirror into the copier's own fx_paper_trades/account.
  try {
    const { sql } = await import('drizzle-orm');
    const acctRows = await db.execute(sql`SELECT id FROM fx_paper_accounts WHERE user_id=${rel.copier_id} LIMIT 1`);
    // db.execute returns a flat array of rows on this driver; be tolerant of the
    // {rows:[...]} shape too. (The old (x)[0]?.[0] accessor returned undefined.)
    const acct = (Array.isArray(acctRows) ? acctRows[0] : (acctRows as any).rows?.[0]);
    if (!acct) {
      await db.execute(sql`INSERT INTO fx_paper_accounts (user_id, balance, initial_balance, is_enabled, updated_at) VALUES (${rel.copier_id}, 10000, 10000, false, now())`);
    }
    const tradeRows = await db.execute(sql`
      INSERT INTO fx_paper_trades (user_id, pair, direction, entry_price, stop_loss, take_profit, lot_size, source, status, opened_at)
      VALUES (${rel.copier_id}, ${source.pair}, ${source.direction}, ${source.entryPrice}, ${source.stopLoss}, ${source.takeProfit}, ${mirrorLot}, 'copy_trade', 'open', now())
      RETURNING id
    `);
    const copierFxTradeId = (Array.isArray(tradeRows) ? tradeRows[0] : (tradeRows as any).rows?.[0])?.id;
    await db.update(copyTradeLogs).set({
      copierFxTradeId,
      executionStatus: 'placed',
    }).where(eq(copyTradeLogs.id, copyLogId));
  } catch (e: any) {
    await db.update(copyTradeLogs).set({
      executionStatus: 'failed',
      executionError: e.message,
    }).where(eq(copyTradeLogs.id, copyLogId));
  }
}

/**
 * Called when the leader's paper trade closes. Closes the mirrored position
 * on the copier's side (paper account row, or real broker position) and
 * returns the copier's own realized P&L for profit-share accounting.
 */
export async function executeCopyTradeClose(
  rel: CopyRelationshipRow,
  log: { id: number; copierFxTradeId: number | null; brokerOrderId: string | null; lotSize: number },
  sourceExitPrice: number,
  sourcePnl: number,
  sourceLotSize: number
): Promise<number> {
  // P&L scales linearly by lot ratio — no cap. A copier running a bigger lot
  // than the source trader should earn/lose proportionally more, not be
  // capped at the source's own P&L (the bug this replaces).
  const lotRatio = sourceLotSize > 0 ? log.lotSize / sourceLotSize : 1;
  const copierPnl = sourcePnl * lotRatio;

  if (rel.account_type === 'real') {
    if (log.brokerOrderId && rel.copier_connection_id) {
      try {
        const conn = await storage.getTradelockerConnection(rel.copier_connection_id);
        await executeMT5SignalOnTradeLocker(conn as any, {
          action: 'CLOSE',
          symbol: '', direction: '', volume: 0,
          positionId: log.brokerOrderId,
        });
      } catch (e: any) {
        console.error(`[copy-trade-execution] Real-mode close failed for copy log ${log.id} (non-fatal, position may need manual close):`, e.message);
      }
    }
    return copierPnl;
  }

  // Paper mode — close the copier's own mirrored fx_paper_trades row and
  // adjust their own balance.
  if (log.copierFxTradeId) {
    try {
      const { sql } = await import('drizzle-orm');
      await db.execute(sql`
        UPDATE fx_paper_trades SET status='closed', exit_price=${sourceExitPrice}, pnl=${copierPnl}, closed_at=now()
        WHERE id=${log.copierFxTradeId}
      `);
      await db.execute(sql`
        UPDATE fx_paper_accounts SET balance=balance+${copierPnl}, updated_at=now() WHERE user_id=${rel.copier_id}
      `);
    } catch (e: any) {
      console.error(`[copy-trade-execution] Paper-mode close failed for copy log ${log.id} (non-fatal):`, e.message);
    }
  }
  return copierPnl;
}
