// ── TradeLocker live balance sync ─────────────────────────────────────────────
// MT5 balances are "live" because the EA pushes account data into an in-memory
// cache (global.mt5AccountData) that the API serves instantly. TradeLocker had no
// equivalent — balances were only pulled on-demand and the dashboard read a stale
// DB field. This service gives TradeLocker the same push-like freshness by running
// a background loop that refreshes balances for recently-active users into
// global.tlAccountData, plus on-demand sync hooks fired when trades open/close.

import { storage } from '../storage';
import { computePips } from '../utils/pipUtils';
import { getOrCreateService as tlGetOrCreateService } from '../tradelocker';
import { recordRealizedPnl } from './prop-firm-consistency';

// ── Self-learning Brain visibility for TradeLocker trades ──────────────────
// storage.resolveConfirmationOutcome only UPDATES an existing PENDING row
// (created when the VEDD bot itself opened a trade) if one exists within a
// 24h window of when it was opened. Two real classes of TradeLocker trades
// never have such a row at all: trades the user placed manually directly in
// TradeLocker (the bot never saw them open), and bot-opened trades held
// longer than 24h before closing (the PENDING row ages out of the matching
// window). Both were previously silently dropped — never touching
// ai_confirmation_outcomes — making them structurally invisible to the Brain
// Dashboard regardless of how much real trading happened. When
// resolveConfirmationOutcome reports no match, this creates a resolved row
// directly instead, using the 'ea_only' tradeSource — the same value this
// app's own getOutcomesForListing() convention already treats as
// TradeLocker-category (see server/storage.ts) — so these trades count
// toward Brain Dashboard stats without needing a new source bucket anywhere.
async function _recordOrBackfillConfirmationOutcome(
  userId: number, symbol: string, direction: string, result: string, closeTime?: string | Date,
): Promise<void> {
  try {
    // Pass closeTime: the PENDING lookup window is anchored to when the trade
    // CLOSED, not to when this reconciliation pass happens to run.
    const resolved = await storage.resolveConfirmationOutcome(userId, symbol, direction, result, null, closeTime ?? null);
    if (resolved) return;
    const closedAt = closeTime ? new Date(closeTime) : new Date();
    const hour = closedAt.getUTCHours();
    const session = hour < 7 ? 'Asian' : hour < 13 ? 'London' : hour < 20 ? 'New York' : 'Late NY';
    await storage.createConfirmationOutcome({
      userId,
      symbol: symbol.toUpperCase(),
      direction,
      session,
      aiDecision: 'EA_ONLY',
      tradeSource: 'ea_only',
      tradeOutcome: result,
      confirmedAt: closedAt,
      closedAt,
    } as any);
  } catch { /* non-critical */ }
}

/**
 * Write one durable row per closed FX trade into the brain's feature store.
 *
 * This is the half that was missing. ai_trade_results records the OUTCOME and
 * ai_confirmation_outcomes was supposed to record the SETUP, but of 1,202 closed
 * confirmations only 3 carried an ADX — so the engine could learn "GBPJPY loses"
 * and never "GBPJPY loses when ADX is under 20 in the Asian session".
 *
 * The setup is recovered from the confirmation written when the trade was
 * opened, matched on user+symbol+direction within 24h before the close. When no
 * confirmation exists the row is STILL written with the execution facts and null
 * conditions: a trade with unknown conditions is a real data point about the
 * pair, and dropping it would bias the sample toward bot-opened trades.
 *
 * Never throws and never blocks the close path — a learning write must not be
 * able to break trade reconciliation.
 */
/**
 * Every close changes today's per-pair loss count, so the daily-stop cache must
 * be dropped immediately rather than waiting out its TTL — a stale count lets
 * the next entry through on a pair that has just hit its limit.
 */
async function _invalidateDailyStop(userId: number): Promise<void> {
  try {
    const { invalidatePairDailyStop } = await import('./pair-daily-stop');
    invalidatePairDailyStop(userId);
  } catch { /* non-fatal — the TTL still expires on its own */ }
}

async function _recordFxBrainOutcome(
  userId: number, conn: any, existing: any, match: any, result: string, profit: number,
): Promise<void> {
  try {
    const { pool } = await import('../db');
    const closedAt = match?.closeTime ? new Date(match.closeTime) : new Date();
    const symbol = String(existing.symbol || '').toUpperCase().replace(/[^A-Z0-9.]/g, '');
    const direction = String(existing.direction || '').toUpperCase();
    const ticket = String((existing as any).mt5Ticket || '');
    if (!symbol || !direction) return;

    // Pull the setup from the confirmation that OPENED this trade.
    //
    // Two bugs lived here. It anchored the window on the CLOSE time and took the
    // newest row, so the row it picked was usually the outcome record written at
    // close — which carries NULL adx/rsi/grade. That is why every live row landed
    // in fx_brain_outcomes with an outcome and no setup: the store knew USDJPY
    // lost $1,021 in New York and nothing about the conditions, which is the only
    // part that prevents a repeat.
    //
    // Now anchored on the OPEN time, and rows that actually carry indicator values
    // are preferred over ones that do not, so a null-filled close record can never
    // outrank the real confirmation.
    const _openedAtRaw = (existing as any).createdAt ? new Date((existing as any).createdAt) : null;
    const _anchor = (_openedAtRaw && !isNaN(_openedAtRaw.getTime())) ? _openedAtRaw : closedAt;
    const { rows: cf } = await pool.query(
      `SELECT adx_value, rsi_value, macd_direction, confluence_grade, confluence_score,
              smc_verdict, ict_macro_valid, htf_aligned, ai_confidence, proposed_confidence,
              timeframe, session, confirmed_at
         FROM ai_confirmation_outcomes
        WHERE user_id = $1 AND symbol = $2 AND direction = $3
          AND confirmed_at BETWEEN $4::timestamp - interval '2 hours' AND $4::timestamp + interval '10 minutes'
        ORDER BY (adx_value IS NOT NULL) DESC,
                 abs(extract(epoch FROM (confirmed_at - $4::timestamp))) ASC
        LIMIT 1`,
      [userId, symbol, direction, _anchor.toISOString()]
    );
    const f = cf[0] || {};
    if (!f.adx_value) {
      console.warn(`[FxBrain] ${symbol} ${direction} ticket ${ticket}: no confirmation with indicator values found near open ${_anchor.toISOString()} — recording outcome without setup.`);
    }

    const entry = Number((existing as any).entryPrice ?? match?.openPrice) || null;
    const exit = Number(match?.closePrice) || null;
    const sl = Number((existing as any).stopLoss) || null;
    const tp = Number((existing as any).takeProfit) || null;
    // Planned vs realised R — the quality of the outcome, not just its sign.
    const plannedRR = entry && sl && tp && Math.abs(entry - sl) > 0
      ? Math.abs(tp - entry) / Math.abs(entry - sl) : null;
    const realisedRR = entry && exit && sl && Math.abs(entry - sl) > 0
      ? Math.abs(exit - entry) / Math.abs(entry - sl) * (result === 'WIN' ? 1 : -1) : null;

    // Excursion tracked while the position was open (see the MAE/MFE block in
    // syncTradeLockerTrades). Converted to a PRICE distance too, so it is
    // comparable across lot sizes and accounts.
    const maePnl = Number((existing as any).maePnl);
    const mfePnl = Number((existing as any).mfePnl);
    const openedAt = (existing as any).createdAt ? new Date((existing as any).createdAt) : null;
    const holdMins = openedAt && closedAt > openedAt
      ? Math.round((closedAt.getTime() - openedAt.getTime()) / 60000) : null;

    const hour = closedAt.getUTCHours();
    // Canonicalise. ai_confirmation_outcomes holds 'NY', 'New York' AND 'Late NY'
    // for the same hours, which splits one session into contradictory buckets
    // when the learner groups by it.
    const { canonSession } = await import('../utils/session');
    const session = canonSession(f.session, hour) ?? canonSession(null, hour);

    await pool.query(
      `INSERT INTO fx_brain_outcomes
        (user_id, symbol, direction, timeframe, hour_utc, session, day_of_week,
         adx_value, rsi_value, macd_direction, confluence_grade, confluence_score,
         smc_verdict, ict_macro_valid, htf_aligned, ea_confidence, ai_confidence,
         entry_price, exit_price, stop_loss, take_profit, planned_rr, realised_rr,
         result, profit_loss, holding_minutes, connection_id, account_id, ticket, closed_at,
         mae_pnl, mfe_pnl, minutes_to_mae, minutes_to_mfe)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)
       ON CONFLICT (user_id, ticket) WHERE ticket IS NOT NULL DO NOTHING`,
      [userId, symbol, direction, f.timeframe ?? null, hour, session, closedAt.getUTCDay(),
       f.adx_value ?? null, f.rsi_value ?? null, f.macd_direction ?? null,
       f.confluence_grade ?? null, f.confluence_score ?? null, f.smc_verdict ?? null,
       f.ict_macro_valid ?? null, f.htf_aligned ?? null, f.proposed_confidence ?? null,
       f.ai_confidence ?? null, entry, exit, sl, tp, plannedRR, realisedRR,
       result, profit, holdMins, conn?.id ?? null, String(conn?.accountId ?? ''), ticket || null, closedAt,
       Number.isFinite(maePnl) ? maePnl : null,
       Number.isFinite(mfePnl) ? mfePnl : null,
       (existing as any).maeAt && openedAt ? Math.max(0, Math.round((new Date((existing as any).maeAt).getTime() - openedAt.getTime()) / 60000)) : null,
       (existing as any).mfeAt && openedAt ? Math.max(0, Math.round((new Date((existing as any).mfeAt).getTime() - openedAt.getTime()) / 60000)) : null]
    );
    console.log(`[FxBrain] recorded ${symbol} ${direction} ${result} ${profit >= 0 ? '+' : ''}${profit.toFixed(2)}` +
      (f.adx_value != null ? ` (adx ${Number(f.adx_value).toFixed(1)}, grade ${f.confluence_grade ?? 'n/a'})` : ' (setup unknown)'));
  } catch (e: any) {
    console.error('[FxBrain] outcome record failed (non-fatal):', e?.message);
  }
}

// accountId -> Set of open-position ticket ids seen on the previous sync pass.
// Used to detect closures (a ticket that was open last cycle and is gone now)
// without needing a webhook — TradeLocker has no EA-style push, so this is
// the only way to auto-detect a trade closing.
const lastOpenTickets = new Map<string, Set<string>>();

// Per-connection throttle for the order-history reconciliation. The poll-and-diff
// above only catches a close if we saw the position OPEN in a prior in-memory
// cycle — so closes that happen across a deploy (memory wiped) or between polls
// are missed forever. This reconciliation pulls the broker's real ordersHistory
// and backfills ANY closed trade the DB is missing, independent of what we saw
// open. Throttled to keep it gentle on the login/API rate limit.
const lastOutcomeReconcile = new Map<string, number>();
const OUTCOME_RECONCILE_MS = 5 * 60 * 1000; // every 5 min per connection

// Separate, much rarer pass with a far wider lookback (90 days vs. the 14-day
// window above) — catches historical trades the regular reconciliation never
// will (anything closed more than 14 days ago that the poll-and-diff loop
// also missed, e.g. during downtime). This is deliberately NOT folded into
// the 5-min loop: widening that loop's own window to 90 days made every
// single cycle re-walk months of order history and DB writes sequentially,
// which measured multiple minutes per connection in testing — untenable to
// repeat every 5 minutes forever. Running the wide pass once a day per
// connection is enough to eventually catch up on anything the cheap 14-day
// loop misses, without paying that cost on every cycle.
const lastDeepBackfill = new Map<string, number>();
const DEEP_BACKFILL_MS = 24 * 60 * 60 * 1000; // once per connection per day

// Throttle DB writes of the balance snapshot (don't write every 20s sync).
const lastBalancePersist = new Map<string, { at: number; balance: number }>();
const BALANCE_PERSIST_MS = 60 * 1000;

export interface TlLiveAccount {
  accountId: string;
  connectionId: number;
  accountType: string;
  broker: string;
  label: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  currency: string;
  lastUpdated: string; // ISO
  error?: string;
}

// userId -> lastSeenMs. Only users seen recently get background-synced so we
// never hammer the TradeLocker API on behalf of idle accounts.
const activeUsers = new Map<number, number>();
const ACTIVE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const SYNC_INTERVAL_MS = 20 * 1000;       // refresh every 20s
const MIN_RESYNC_GAP_MS = 8 * 1000;       // don't resync the same user faster than this

const lastSyncAt = new Map<number, number>();
const inFlight = new Set<number>();

function cache(): Record<number, Record<string, TlLiveAccount>> {
  (global as any).tlAccountData = (global as any).tlAccountData || {};
  return (global as any).tlAccountData;
}

/** Mark a user as active so the background loop keeps their balances fresh. */
export function markTlUserActive(userId: number): void {
  activeUsers.set(userId, Date.now());
}

/**
 * Auto-log every open/closed TradeLocker trade into aiTradeResults — the same
 * table MT5 trades land in — so the trade feed stays current with zero
 * manual entry. Dedup key mirrors MT5's mt5Ticket pattern: `tl_<accountId>_<positionId>`.
 */
// ── Feed the SS AI engine's adaptive brain on TradeLocker closes ─────────────
// recordTradeResult drives strategyPerformanceWeights, Kelly stats, the drawdown
// shield, pnlToday (daily-loss / profit-target halts), pairDirectionLock, the
// autonomous cool-offs and the adapted confidence floor. It was ONLY ever called
// from the MT5 EA `closedTrades` post — TradeLocker closes (where execution
// actually happens now) never reached it, so the whole adaptive loop sat frozen
// at its initial state for TL-executed users. Session names mirror the engine's
// enforcer keys ('Asian','London','New York','Late NY'). Dynamic import avoids a
// circular dependency with live-trading-engine.
async function _feedEngineBrain(userId: number, symbol: string, profit: number, direction?: string, closeTime?: string | Date): Promise<void> {
  try {
    const { recordTradeResult } = await import('./live-trading-engine');
    const h = new Date(closeTime || Date.now()).getUTCHours();
    const session = h < 7 ? 'Asian' : h < 13 ? 'London' : h < 20 ? 'New York' : 'Late NY';
    recordTradeResult(userId, {
      symbol: String(symbol || '').toUpperCase().replace('/', ''),
      profit: Number(profit) || 0,
      strategy: 'unknown',
      session,
      direction,
    });
  } catch (_) { /* non-fatal — learning must never break the sync */ }
}

async function syncTradeLockerTrades(userId: number, conn: any, svc: any): Promise<void> {
  const cacheKey = `${userId}:${conn.accountId}`;
  const openPositions = await svc.getPositionsNormalized().catch(() => [] as any[]);
  const currentTickets = new Set<string>(openPositions.map((p: any) => `tl_${conn.accountId}_${p.id}`));

  // New/still-open positions — create if we haven't logged this ticket yet
  for (const p of openPositions) {
    const ticket = `tl_${conn.accountId}_${p.id}`;
    const existing = await storage.getAiTradeResultByTicket(userId, ticket);
    if (existing) continue;

    // TradeLocker's positions schema exposes stopLossId/takeProfitId — the IDs of
    // the protective ORDERS — and often no price columns at all. We deliberately
    // refuse to read an *Id column as a price (that bug stored 288230376151711744
    // as a stop), so p.stopLoss legitimately comes back empty and every row landed
    // with stop_loss = 0. The position IS protected at the broker; only our record
    // was blank, which misleads the monitor, R-multiples and risk sizing.
    //
    // The real levels are already stored, correctly, on the OPEN we logged when we
    // placed the order. Recover them from there rather than resolving the order id
    // over the API. Never overwrite a genuine broker-reported value.
    let _sl = p.stopLoss || 0;
    let _tp = p.takeProfit || 0;
    if (!(_sl > 0)) {
      try {
        const { pool: _slPool } = await import('../db');
        const _sym = String(p.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const { rows: _lg } = await _slPool.query(
          `SELECT stop_loss, take_profit FROM tradelocker_trade_logs
            WHERE user_id = $1 AND connection_id = $2 AND action = 'OPEN' AND status = 'executed'
              AND upper(regexp_replace(symbol, '[^A-Za-z0-9]', '', 'g')) = $3
              AND created_at > now() - interval '7 days'
            ORDER BY created_at DESC LIMIT 1`,
          [userId, conn.id, _sym]
        );
        if (_lg[0]) {
          if (!(_sl > 0) && Number(_lg[0].stop_loss) > 0) _sl = Number(_lg[0].stop_loss);
          if (!(_tp > 0) && Number(_lg[0].take_profit) > 0) _tp = Number(_lg[0].take_profit);
          if (_sl > 0) console.log(`[TL-sync] ${ticket}: broker reported no stop price; recovered SL=${_sl} TP=${_tp || 'n/a'} from the order we placed.`);
        }
      } catch (e: any) {
        // A failed recovery leaves 0 — the same as before, never a fabricated level.
        console.error(`[TL-sync] ${ticket}: could not recover SL/TP from the trade log (${e?.message}); recording 0.`);
      }
    }

    // ── Post-fill risk:reward check ─────────────────────────────────────────
    // The pre-trade gate checks the PLANNED ratio and nothing re-checks after
    // the fill. Stop and target are fixed absolute prices, so every pip of
    // adverse slippage widens the risk AND shrinks the reward at the same time.
    // Measured 2026-09-23 on USDJPY: planned entry 157.700 / SL 157.900 / TP
    // 157.300 is a clean 1:2.00, but it filled at 157.673 on a SELL — 2.7 pips
    // worse — which is 1:1.64. An 18% degradation nobody saw.
    //
    // Recorded on every position so the realised ratio is measurable rather than
    // assumed. A ratio under 1.0 means the position risks more than it can make:
    // that is never a setup this engine would have approved, so it is called out
    // loudly. Auto-closing is OFF by default and opt-in — the entry has already
    // happened, so closing costs a known spread against an unknown, and that is
    // the account owner's call rather than a silent one.
    const _pfDir = (p.side || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    const _pfEntry = Number(p.avgPrice) || 0;
    let _pfNote = '';
    if (_pfEntry > 0 && _sl > 0 && _tp > 0) {
      const _pfRisk = Math.abs(_pfEntry - _sl);
      const _pfReward = Math.abs(_tp - _pfEntry);
      // A stop on the wrong side of entry is a malformed plan, not a ratio.
      const _slCorrect = _pfDir === 'BUY' ? _sl < _pfEntry : _sl > _pfEntry;
      const _tpCorrect = _pfDir === 'BUY' ? _tp > _pfEntry : _tp < _pfEntry;
      if (!_slCorrect || !_tpCorrect) {
        console.error(`[TL-sync] ${ticket} ${p.symbol} ${_pfDir}: MALFORMED LEVELS — entry ${_pfEntry}, SL ${_sl}, TP ${_tp} (stop or target on the wrong side of entry).`);
        _pfNote = ` | POST-FILL: malformed levels (SL ${_sl} / TP ${_tp} vs entry ${_pfEntry})`;
      } else if (_pfRisk > 0) {
        const _pfRR = _pfReward / _pfRisk;
        const _softFloor = Number(process.env.POSTFILL_RR_MIN ?? 1.5);
        const _hardFloor = Number(process.env.POSTFILL_RR_HARD_FLOOR ?? 1.0);
        _pfNote = ` | POST-FILL R:R 1:${_pfRR.toFixed(2)} (risk ${_pfRisk.toFixed(5)}, reward ${_pfReward.toFixed(5)})`;
        if (_pfRR < _hardFloor) {
          console.error(`[TL-sync] ${ticket} ${p.symbol} ${_pfDir}: INVERTED R:R 1:${_pfRR.toFixed(2)} after fill — risks more than it can gain. Entry ${_pfEntry}, SL ${_sl}, TP ${_tp}.`);
          if (process.env.POSTFILL_RR_AUTOCLOSE === 'true') {
            try {
              await svc.closePosition(p.id);
              console.warn(`[TL-sync] ${ticket}: closed on inverted post-fill R:R (POSTFILL_RR_AUTOCLOSE=true).`);
              _pfNote += ' — AUTO-CLOSED';
            } catch (ce: any) {
              console.error(`[TL-sync] ${ticket}: auto-close failed (${ce?.message}) — position left open, flagged.`);
            }
          }
        } else if (_pfRR < _softFloor) {
          console.warn(`[TL-sync] ${ticket} ${p.symbol} ${_pfDir}: post-fill R:R 1:${_pfRR.toFixed(2)} is below the ${_softFloor} floor the pre-trade gate required — slippage degraded the setup.`);
        }
      }
    }

    await storage.createAiTradeResult({
      userId,
      symbol: p.symbol,
      direction: (p.side || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
      entryPrice: p.avgPrice || 0,
      // F5: persist the broker's SL/TP so the row reflects real protection state
      // (was omitted → every tradelocker_auto row showed SL=null/TP=null, masking
      // whether a live position was actually protected).
      stopLoss: _sl,
      takeProfit: _tp,
      aiConfidence: 0,
      result: 'PENDING',
      source: 'tradelocker_auto',
      connectionId: conn.id,
      mt5Ticket: ticket,
      // Realised ratio, so it is measurable rather than assumed. The planned R:R
      // is what the gate approved; this is what the fill actually produced.
      notes: `TradeLocker position${_pfNote}`,
    } as any);
  }

  // ── Running MAE / MFE on every OPEN position ────────────────────────────
  // The sync already polls unrealisedPl each cycle, so the extremes come free.
  // These are the two fields that separate a bad ENTRY from a bad EXIT, which
  // win rate alone cannot do:
  //   high MAE on WINNERS  -> the stop is too tight (it nearly got hit)
  //   high MFE on LOSERS   -> open profit was handed back; exits too late
  // Stored on the open row rather than in memory, deliberately: this codebase
  // has lost in-memory state to a deploy three times, and a half-tracked
  // excursion is worse than none because it silently understates the extreme.
  for (const p of openPositions) {
    const upl = Number(p.unrealizedPl);
    if (!Number.isFinite(upl)) continue;
    const ticket = `tl_${conn.accountId}_${p.id}`;
    try {
      const { pool: _exPool } = await import('../db');
      await _exPool.query(
        `UPDATE ai_trade_results
            SET mae_pnl = LEAST(COALESCE(mae_pnl, $2), $2),
                mfe_pnl = GREATEST(COALESCE(mfe_pnl, $2), $2),
                mae_at  = CASE WHEN $2 < COALESCE(mae_pnl, $2) OR mae_pnl IS NULL THEN now() ELSE mae_at END,
                mfe_at  = CASE WHEN $2 > COALESCE(mfe_pnl, $2) OR mfe_pnl IS NULL THEN now() ELSE mfe_at END
          WHERE user_id = $1 AND mt5_ticket = $3 AND result = 'PENDING'`,
        [userId, upl, ticket]
      );
    } catch { /* excursion tracking must never disturb the sync */ }
  }

  // Positions that were open last cycle but are gone now → closed. Look up
  // realized P&L from filled orders/closed positions to fill in the outcome.
  const previousTickets = lastOpenTickets.get(cacheKey);
  if (previousTickets) {
    const closedTicketIds = Array.from(previousTickets).filter(t => !currentTickets.has(t));
    if (closedTicketIds.length > 0) {
      const closed = await svc.getClosedPositions().catch(() => [] as any[]);
      // Keyed by positionId — matches the ticket format used when the position
      // was first logged as PENDING (`tl_<accountId>_<positionId>`).
      const closedById = new Map<string, any>(closed.map((c: any) => [`tl_${conn.accountId}_${c.positionId}`, c] as [string, any]));
      for (const ticket of closedTicketIds) {
        const existing = await storage.getAiTradeResultByTicket(userId, ticket);
        if (!existing || existing.result !== 'PENDING') continue;
        const match = closedById.get(ticket);
        // getClosedPositions() (backed by the order-history endpoint) doesn't
        // always have the just-closed position available yet on this same
        // ~20s poll tick — previously an unmatched ticket got silently marked
        // BREAKEVEN/$0 right here, and because the throttled reconciliation
        // pass below only ever "fixes" records still sitting at PENDING, that
        // wrong $0 became permanent — the reconciliation pass computes the
        // REAL profit correctly (verified live: it returns the exact real P&L,
        // e.g. $588.70), but was never allowed to overwrite what this loop had
        // already (wrongly) resolved. So: leave it PENDING here when there's no
        // match, and let the reconciliation pass — which has real data — be the
        // one that resolves it, instead of guessing breakeven.
        if (!match) continue;
        const profit = match.profit;
        const result = profit > 0 ? 'WIN' : profit < 0 ? 'LOSS' : 'BREAKEVEN';
        await storage.updateAiTradeResult(existing.id, userId, {
          result,
          profitLoss: profit,
          // Persist the exit price. Without it the reconstructed P&L on this row
          // can never be checked against the prices it came from, and no
          // R-multiple can be computed, so the brain only ever learns the SIGN
          // of an outcome and not its quality.
          ...(Number(match.closePrice) > 0 ? { exitPrice: Number(match.closePrice) } : {}),
          ...(() => {
            const pips = computePips(existing.symbol, (existing as any).entryPrice || match.openPrice, match.closePrice, existing.direction);
            return pips === null ? {} : { profitLossPips: pips };
          })(),
          // Backfill the entry too when the PENDING row was written before the
          // broker reported an average fill price.
          ...(!(Number((existing as any).entryPrice) > 0) && Number(match.openPrice) > 0 ? { entryPrice: Number(match.openPrice) } : {}),
          closedAt: match.closeTime ? new Date(match.closeTime) : new Date(),
        } as any);
        const dStr = match.closeTime ? new Date(match.closeTime).toISOString().slice(0, 10) : undefined;
        await recordRealizedPnl(userId, conn.id, 'tradelocker', profit, dStr);
        // Resolve any matching PENDING 2nd-confirmation record — or backfill a
        // fresh one — so the Brain Dashboard reflects real TradeLocker outcomes
        // instead of silently dropping trades with no bot-opened PENDING match.
        await _recordOrBackfillConfirmationOutcome(userId, existing.symbol, existing.direction, result, match.closeTime);
        await _feedEngineBrain(userId, existing.symbol, profit, existing.direction, match.closeTime);
        await _recordFxBrainOutcome(userId, conn, existing, match, result, profit);
        await _invalidateDailyStop(userId);
      }
    }
  }
  lastOpenTickets.set(cacheKey, currentTickets);

  // ── Order-history reconciliation (throttled) ────────────────────────────
  // Reliable backfill of closed trades regardless of whether we observed them
  // open. This is what keeps the closed-trades feed + realized P&L current
  // across deploys and fast open→close cycles that poll-and-diff misses.
  const lastRecon = lastOutcomeReconcile.get(cacheKey) || 0;
  if (Date.now() - lastRecon >= OUTCOME_RECONCILE_MS) {
    lastOutcomeReconcile.set(cacheKey, Date.now());
    try {
      // Normally a cheap 14-day window (fast, runs every 5 min). Once a day
      // per connection, widen to 90 days instead — matching getFilledOrders'
      // own internal lookback default — to catch trades closed further back
      // that the poll-and-diff loop also missed (server downtime, a deploy
      // mid-trade, etc.), which would otherwise never backfill into
      // ai_trade_results no matter how high the display-side limits were
      // raised. Kept OUT of the regular 5-min window on purpose: measured
      // multiple minutes per connection to walk+write 90 days of history
      // sequentially, which is fine once a day but not every 5 minutes forever.
      const lastDeep = lastDeepBackfill.get(cacheKey) || 0;
      const isDeepPass = Date.now() - lastDeep >= DEEP_BACKFILL_MS;
      if (isDeepPass) lastDeepBackfill.set(cacheKey, Date.now());
      const lookbackDays = isDeepPass ? 90 : 14;
      const fromTs = Math.floor((Date.now() - lookbackDays * 24 * 3600 * 1000) / 1000);
      const closedTrades = await svc.getClosedTradesWithPnl(fromTs).catch(() => [] as any[]);
      for (const o of closedTrades) {
        const rawProfit = o.profit ?? o.pnl ?? o.realizedPnl ?? o.realizedPnL ?? o.grossProfit ?? null;
        const p = typeof rawProfit === 'number' ? rawProfit : parseFloat(rawProfit || '');
        if (!isFinite(p) || p === 0) continue; // zero P&L = not actually closed
        const tk = o.positionId ? `tl_${conn.accountId}_${o.positionId}` : `tl_${o.id || o.orderId}`;
        if (!tk || tk === 'tl_undefined') continue;
        const reconDateStr = o.closeTime ? new Date(o.closeTime).toISOString().slice(0, 10) : undefined;
        const reconResult = p > 0 ? 'WIN' : 'LOSS';
        const existing = await storage.getAiTradeResultByTicket(userId, tk);
        if (existing) {
          // Self-heal: the poll-and-diff loop above used to (and, on a slow
          // order-history propagation, still can) mark a just-closed trade
          // BREAKEVEN/$0 when it couldn't find a match yet — and this
          // reconciliation pass previously refused to touch anything that
          // wasn't still PENDING, so that wrong $0 stuck permanently even
          // though this exact query returns the real, correct profit (`p`,
          // guaranteed non-zero by the check above). Re-resolve a stale
          // zero-profit BREAKEVEN the same as a PENDING record.
          const isStaleZeroBreakeven = existing.result === 'BREAKEVEN' && !(existing as any).profitLoss;
          const needsResolve = existing.result === 'PENDING' || isStaleZeroBreakeven;
          if (needsResolve || (existing as any).connectionId == null) {
            await storage.updateAiTradeResult(existing.id, userId, {
              result: reconResult,
              profitLoss: p,
              connectionId: conn.id,
              // Same as the poll-and-diff path: record the prices the P&L was
              // reconstructed FROM, so the number is auditable later.
              ...(Number(o.closePrice) > 0 ? { exitPrice: Number(o.closePrice) } : {}),
              ...(() => {
                const pips = computePips(existing.symbol, (existing as any).entryPrice || o.openPrice, o.closePrice, existing.direction);
                return pips === null ? {} : { profitLossPips: pips };
              })(),
              ...(!(Number((existing as any).entryPrice) > 0) && Number(o.openPrice) > 0 ? { entryPrice: Number(o.openPrice) } : {}),
              closedAt: o.closeTime ? new Date(o.closeTime) : new Date(),
            } as any).catch(() => {});
            if (needsResolve) {
              await recordRealizedPnl(userId, conn.id, 'tradelocker', p, reconDateStr);
              await _recordOrBackfillConfirmationOutcome(userId, existing.symbol, existing.direction, reconResult, o.closeTime);
              await _feedEngineBrain(userId, existing.symbol, p, existing.direction, o.closeTime);
              // The brain must learn from EVERY close, not just the ones the
              // poller happened to witness. This path handles closes that
              // happened across a deploy or between polls — with deploys as
              // frequent as they are, that is most of them.
              await _invalidateDailyStop(userId);
              await _recordFxBrainOutcome(userId, conn, existing,
                { closeTime: o.closeTime, closePrice: o.closePrice, openPrice: o.openPrice }, reconResult, p);
            }
          }
          continue;
        }
        const reconDirection = /sell|short/i.test(o.side || '') ? 'SELL' : 'BUY';
        const reconSymbol = (o.symbol || 'UNKNOWN').toUpperCase().replace('/', '');
        await storage.createAiTradeResult({
          userId,
          symbol: reconSymbol,
          direction: reconDirection,
          entryPrice: o.openPrice || 0,
          exitPrice: o.closePrice || 0,
          profitLossPips: computePips(reconSymbol, o.openPrice, o.closePrice, reconDirection),
          aiConfidence: 0,
          result: reconResult,
          profitLoss: p,
          source: 'tradelocker',
          connectionId: conn.id,
          mt5Ticket: tk,
          notes: 'TradeLocker closed position (auto-reconciled)',
          closedAt: o.closeTime ? new Date(o.closeTime) : new Date(),
        } as any).catch(() => {});
        await recordRealizedPnl(userId, conn.id, 'tradelocker', p, reconDateStr);
        await _recordOrBackfillConfirmationOutcome(userId, reconSymbol, reconDirection, reconResult, o.closeTime);
        await _feedEngineBrain(userId, reconSymbol, p, reconDirection, o.closeTime);
        // No open row ever existed for this one (the poller never saw it open),
        // so there is no stored SL/TP or excursion — but the outcome, pair,
        // direction and timing are real and the brain should not be blind to it.
        // Excluding these would bias the sample toward bot-witnessed trades.
        await _invalidateDailyStop(userId);
        await _recordFxBrainOutcome(userId, conn,
          { symbol: reconSymbol, direction: reconDirection, entryPrice: o.openPrice, mt5Ticket: tk },
          { closeTime: o.closeTime, closePrice: o.closePrice, openPrice: o.openPrice }, reconResult, p);
      }
    } catch (err: any) {
      console.error(`[TL-sync] Outcome reconciliation failed for ${conn.accountId} (non-fatal):`, err?.message);
    }
  }
}

/**
 * Fetch live balances for all active TradeLocker connections of a user and
 * store them in the in-memory cache. Safe to call frequently — self-throttled.
 */
export async function syncUserTradeLocker(userId: number, force = false): Promise<TlLiveAccount[]> {
  const now = Date.now();
  if (!force) {
    const last = lastSyncAt.get(userId) || 0;
    if (now - last < MIN_RESYNC_GAP_MS) {
      return Object.values(cache()[userId] || {});
    }
  }
  if (inFlight.has(userId)) {
    return Object.values(cache()[userId] || {});
  }
  inFlight.add(userId);
  try {
    const connections = await storage.getUserTradelockerConnections(userId);
    const active = connections.filter((c: any) => c.isActive);
    const store = cache();
    store[userId] = store[userId] || {};

    // Prune cache entries for connections that are no longer active
    const activeIds = new Set(active.map((c: any) => c.accountId));
    for (const key of Object.keys(store[userId])) {
      if (!activeIds.has(key)) delete store[userId][key];
    }

    // Cold-start hydration: seed the cache from each account's last-known DB
    // balance so the UI shows the real figure immediately (across a deploy or
    // while the first live fetch / re-auth is in flight) instead of $0.
    for (const conn of active) {
      if (store[userId][conn.accountId]) continue;
      const lb = (conn as any).lastBalance;
      if (lb != null) {
        store[userId][conn.accountId] = {
          accountId: conn.accountId,
          connectionId: conn.id,
          accountType: conn.accountType,
          broker: (conn as any).brokerName || 'TradeLocker',
          label: `TradeLocker – ${conn.email} (${conn.accountType})`,
          balance: lb || 0,
          equity: (conn as any).lastEquity ?? lb ?? 0,
          margin: 0,
          freeMargin: 0,
          currency: 'USD',
          lastUpdated: (conn as any).lastBalanceAt ? new Date((conn as any).lastBalanceAt).toISOString() : new Date(0).toISOString(),
        };
      }
    }

    // Sequential to avoid concurrent auth storms against the TL API
    for (const conn of active) {
      try {
        const svc = await tlGetOrCreateService(conn);
        const info = await svc.getAccountInfo();

        // A live successful fetch proves the connection is healthy right now —
        // clear out any stale lastError so it doesn't linger in the UI forever.
        // Previously nothing ever cleared this field on success, so an old
        // transient failure (e.g. a since-fixed code path that used to
        // propagate raw broker error pages into lastError) could sit there
        // indefinitely and keep showing as a current problem on the Weekly
        // Strategy execution-diagnostics panel long after it stopped being one.
        if ((conn as any).lastError) {
          storage.updateTradelockerConnection(conn.id, { lastError: null } as any).catch(() => {});
        }

        store[userId][conn.accountId] = {
          accountId: conn.accountId,
          connectionId: conn.id,
          accountType: conn.accountType,
          broker: (conn as any).brokerName || 'TradeLocker',
          label: `TradeLocker – ${conn.email} (${conn.accountType})`,
          balance: info.balance || 0,
          equity: info.equity || 0,
          margin: info.margin || 0,
          freeMargin: info.freeMargin || 0,
          currency: info.currency || 'USD',
          lastUpdated: new Date().toISOString(),
        };
        // Keep the legacy balance cache used for proportional lot sizing in sync.
        // Always overwrite (even with 0) — a genuinely-zeroed account should size
        // to 0, not silently keep sizing off a stale prior positive balance.
        (global as any).tlAccountBalances = (global as any).tlAccountBalances || {};
        (global as any).tlAccountBalances[userId] = (global as any).tlAccountBalances[userId] || {};
        (global as any).tlAccountBalances[userId][conn.accountId] = info.balance || 0;

        // Persist the balance snapshot to the DB (throttled) so it survives
        // restarts and is shown while a future re-auth is in flight.
        if (info.balance > 0) {
          const pk = `${userId}:${conn.accountId}`;
          const prevPersist = lastBalancePersist.get(pk);
          const changed = !prevPersist || Math.abs(prevPersist.balance - info.balance) > 0.01;
          if (changed && (!prevPersist || Date.now() - prevPersist.at > BALANCE_PERSIST_MS)) {
            lastBalancePersist.set(pk, { at: Date.now(), balance: info.balance });
            storage.updateTradelockerConnection(conn.id, {
              lastBalance: info.balance,
              lastEquity: info.equity || info.balance,
              lastBalanceAt: new Date(),
            } as any).catch(() => {});
          }
        }

        // Auto-log this account's trades — no manual entry, no EA/webhook
        // needed. TradeLocker has no push mechanism like MT5's EA, so this
        // poll-and-diff is the only way to detect a trade closing.
        await syncTradeLockerTrades(userId, conn, svc).catch(err =>
          console.error(`[TL-sync] Trade auto-log failed for ${conn.accountId} (non-fatal):`, err.message)
        );
      } catch (err: any) {
        const prev = store[userId][conn.accountId];
        const msg: string = err?.message || 'fetch failed';
        // A 429 / login-rate-limit / cooldown is TRANSIENT — the broker is just
        // throttling us for a few seconds. Surfacing it as a hard `error` flips
        // the account to "disconnected" and shows "429 Too Many Requests" on the
        // webhooks page even though we hold a perfectly good last-known balance.
        // So for rate-limit errors, keep the last successful entry untouched
        // (balance stays visible, freshness reflects real age) and just skip
        // this cycle. Only genuine failures (bad creds, etc.) set `error`.
        const isRateLimit = err?.status === 429 || /429|rate.?limit|too many requests|cooling down/i.test(msg);
        if (isRateLimit && prev && !prev.error) {
          // leave prev entry as-is; the background loop retries after cooldown
          continue;
        }
        store[userId][conn.accountId] = {
          accountId: conn.accountId,
          connectionId: conn.id,
          accountType: conn.accountType,
          broker: (conn as any).brokerName || 'TradeLocker',
          label: `TradeLocker – ${conn.email} (${conn.accountType})`,
          balance: prev?.balance || 0,
          equity: prev?.equity || 0,
          margin: prev?.margin || 0,
          freeMargin: prev?.freeMargin || 0,
          currency: prev?.currency || 'USD',
          lastUpdated: prev?.lastUpdated || new Date(0).toISOString(),
          // Don't show a scary 429 to the user — if we have any last-known
          // balance, present a soft "refreshing" note instead of a hard error.
          error: isRateLimit
            ? (prev?.balance ? undefined : 'Reconnecting to TradeLocker…')
            : msg,
        };
      }
    }
    lastSyncAt.set(userId, Date.now());
    return Object.values(store[userId]);
  } finally {
    inFlight.delete(userId);
  }
}

/**
 * Return the cached live accounts for a user, decorated with freshness info.
 * Marks the user active and triggers a background refresh if data is stale.
 */
export function getTlAccountData(userId: number): {
  connected: boolean;
  accounts: (TlLiveAccount & { secondsAgo: number; isConnected: boolean })[];
  totalBalance: number;
  totalEquity: number;
} {
  markTlUserActive(userId);
  const store = cache()[userId] || {};
  const now = Date.now();
  const accounts = Object.values(store).map(a => {
    const secondsAgo = Math.floor((now - new Date(a.lastUpdated).getTime()) / 1000);
    return { ...a, secondsAgo, isConnected: secondsAgo < 120 && !a.error };
  });
  return {
    connected: accounts.some(a => a.isConnected),
    accounts,
    totalBalance: accounts.reduce((s, a) => s + (a.balance || 0), 0),
    totalEquity: accounts.reduce((s, a) => s + (a.equity || 0), 0),
  };
}

/** Fire-and-forget resync — call right after a TradeLocker trade opens/closes. */
export function refreshTlAfterTrade(userId: number): void {
  markTlUserActive(userId);
  syncUserTradeLocker(userId, true).catch(() => {});
}

let started = false;
/** Start the background loop that keeps active users' TL balances live. */
export function startTradeLockerSync(): void {
  if (started) return;
  started = true;
  setInterval(async () => {
    const now = Date.now();
    for (const [userId, seenAt] of Array.from(activeUsers.entries())) {
      if (now - seenAt > ACTIVE_WINDOW_MS) {
        activeUsers.delete(userId);
        continue;
      }
      try {
        await syncUserTradeLocker(userId);
      } catch { /* per-user failure is non-fatal */ }
    }
  }, SYNC_INTERVAL_MS);
  console.log('[TL-sync] Background TradeLocker balance sync started (20s interval).');
}
