/**
 * Strategy deployment runner — executes SAVED WIZARD STRATEGIES live on
 * the ONE account each deployment is bound to.
 *
 * How it works:
 *  - Every 30s it walks running deployments of spec-backed strategies
 *    (builder + mechanical templates). Engine-native strategies are
 *    skipped: the FX engine is their executor (per user, not per
 *    account) and their deployments are tracking/brain bindings.
 *  - For each deployment it fetches candles, evaluates the spec on the
 *    last CLOSED bar with evaluateSpecSignals — the exact evaluator the
 *    backtester replays with — and acts at most once per new bar.
 *  - One open position per deployment, matching backtest semantics.
 *    Entries carry the spec's stop/target (broker-side, like the EA);
 *    exit-rule groups close early. Every open/close is written to the
 *    strategy_trades log that feeds the strategy brain.
 *  - Dispatch is platform-specific and account-scoped:
 *      MT5        → the user's signal queue (the deploy route aims the
 *                   chosen terminal's receiveSignals flag); the EA on
 *                   that terminal executes.
 *      TradeLocker → executeMT5SignalOnTradeLocker on that connection.
 *      DXtrade    → placeOrder on that connection (spec lots converted
 *                   to instrument units), positionCode tracked.
 *  - Fail-safe: 5 consecutive errors stop the deployment (see
 *    touchDeployment); every failure is recorded on the deployment row
 *    and nothing ever throws out of the loop.
 *
 * SHADOW deployments (platform='shadow') run through the same loop,
 * bars and evaluator, but branch to runShadowDeployment BEFORE any
 * broker code: positions are virtual, resolved from bar prices by
 * services/strategy-shadow.ts, and logged as mode='shadow' rows.
 * Kill switch: STUDIO_SHADOW=off pauses shadow deployments only.
 *
 * Cadence honesty: bars are evaluated when they close, checked every
 * 30s — right for M15/H1/H4/D1 strategies. Sub-M5 strategies belong on
 * the generated MT5 EA, which ticks inside the terminal.
 */
import { getWizardStrategy } from './wizard-spec-strategies';
import {
  listRunningDeployments, touchDeployment, openStrategyTrade,
  getOpenStrategyTrade, closeStrategyTrade, markStrategyTradeBreakeven, updateStrategyTradeLevels,
  type StrategyDeployment,
} from './strategy-deployments';
import { evaluateSpecSignals, type BacktestBar } from './strategy-backtest';
import { evaluateShadowBar, type ShadowPositionState } from './strategy-shadow';
import { specWarmupBars, type StrategySpec } from './strategy-spec';
import { getPipSize } from '../utils/pipUtils';

const TICK_MS = 30_000;
const TF_API: Record<string, string> = { M1: '1min', M5: '5min', M15: '15min', M30: '30min', H1: '1h', H4: '4h', D1: '1day' };
const TF_MS: Record<string, number> = { M1: 60e3, M5: 300e3, M15: 900e3, M30: 1800e3, H1: 3600e3, H4: 14400e3, D1: 86400e3 };
const CRYPTOS = new Set(['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'LTCUSD', 'DOGEUSD']);
const CONTRACT_SIZE: Record<string, number> = { XAUUSD: 100, XAGUSD: 5000, BTCUSD: 1, ETHUSD: 10, SOLUSD: 100, XRPUSD: 10000 };

let started = false;
let ticking = false;

export function startStrategyRunner(): void {
  if (started) return;
  started = true;
  setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  console.log('[Strategy Runner] Deployment runner started (30s interval).');
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const deps = await listRunningDeployments().catch(() => [] as StrategyDeployment[]);
    // Kill switch: STUDIO_SHADOW=off pauses shadow deployments only —
    // they are skipped silently (not error-touched); account deployments
    // are unaffected.
    const shadowOff = process.env.STUDIO_SHADOW === 'off';
    for (const dep of deps) {
      if (shadowOff && dep.platform === 'shadow') continue;
      try { await runDeployment(dep); }
      catch (e: any) { await touchDeployment(dep.id, { error: e?.message || 'runner error' }).catch(() => {}); }
    }
  } finally { ticking = false; }
}

async function runDeployment(dep: StrategyDeployment): Promise<void> {
  const strat = await getWizardStrategy(dep.userId, dep.strategyId);
  if (!strat) { await touchDeployment(dep.id, { error: 'strategy no longer exists' }); return; }
  const spec: StrategySpec = strat.spec;
  // Engine-native strategies have no mechanical rules — the FX engine
  // executes them; this deployment is a tracking binding only.
  if ((spec as any).source === 'engine') return;
  if (!spec.entryLong?.conditions?.length && !spec.entryShort?.conditions?.length) return;

  const { marketDataService } = await import('../market-data');
  const limit = Math.min(specWarmupBars(spec) + 60, 400);
  const result: any = await marketDataService.fetchMarketData({
    symbol: spec.symbol,
    timeframe: (TF_API[spec.timeframe] || '1h') as any,
    assetType: CRYPTOS.has(spec.symbol) ? 'crypto' : 'forex',
    limit,
  });
  let bars: BacktestBar[] = (result?.data ?? []).map((b: any) => ({
    timestamp: new Date(b.timestamp ?? b.time ?? b.date).getTime(),
    open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close),
    volume: Number(b.volume) || 0,
  })).filter((b: BacktestBar) => isFinite(b.timestamp) && isFinite(b.close) && b.close > 0)
    .sort((a: BacktestBar, b: BacktestBar) => a.timestamp - b.timestamp);
  // Drop a still-forming last bar — signals evaluate on closed bars only.
  const tfMs = TF_MS[spec.timeframe] || 3600e3;
  if (bars.length && bars[bars.length - 1].timestamp + tfMs > Date.now()) bars = bars.slice(0, -1);
  if (bars.length < 50) { await touchDeployment(dep.id, { error: `only ${bars.length} bars available for ${spec.symbol}` }); return; }

  const sig = evaluateSpecSignals(spec, bars);
  if (!sig) return;
  if (sig.barTime <= dep.lastBarTime) return; // no new closed bar since last tick
  await touchDeployment(dep.id, { lastBarTime: sig.barTime });

  // ── SHADOW deployments branch here — before ANY broker code ────────
  // A shadow deployment has no account: the same signals are traded
  // virtually and resolved from bar prices (strategy-shadow.ts). This
  // branch is the structural guarantee that a shadow deployment can
  // never reach dispatchOpen/dispatchClose/dispatchBreakeven below;
  // those functions additionally refuse shadow deployments loudly via
  // assertBrokerDispatchAllowed, so a future refactor that misroutes
  // one fails visibly instead of sending an order.
  if (dep.platform === 'shadow') {
    await runShadowDeployment(dep, spec, sig, bars);
    return;
  }

  const open = await getOpenStrategyTrade(dep.id);
  if (open) {
    // Broker-side SL/TP may have closed the position already (TL/DX are
    // readable server-side — reconcile so the deployment isn't wedged
    // waiting for an exit signal on a position that no longer exists).
    if (dep.platform !== 'mt5') {
      const vanished = await resolveVanishedPosition(dep, open, sig.close);
      if (vanished) { await touchDeployment(dep.id, { error: null, lastSignalAt: true }); return; }
    }
    const isLong = String(open.direction).toUpperCase() === 'BUY';
    // Breakeven: once the last closed bar is trigger-pips in profit, move
    // the broker stop to entry + offset (bar-close granularity — the EA
    // and backtester manage this intrabar; the runner sees closes).
    if (spec.risk.breakevenTriggerPips && !open.breakeven_applied) {
      const pip = getPipSize(spec.symbol);
      const entry = Number(open.entry_price);
      const trig = spec.risk.breakevenTriggerPips * pip;
      const hit = isLong ? sig.close >= entry + trig : sig.close <= entry - trig;
      if (hit && entry > 0) {
        const off = (spec.risk.breakevenOffsetPips ?? 0) * pip;
        const round5 = (n: number) => Math.round(n * 100000) / 100000;
        const newStop = round5(isLong ? entry + off : entry - off);
        const tpDist = spec.risk.takeProfitAtrMult && sig.atr ? spec.risk.takeProfitAtrMult * sig.atr
          : spec.risk.takeProfitPips ? spec.risk.takeProfitPips * pip : null;
        const newTp = tpDist ? round5(isLong ? entry + tpDist : entry - tpDist) : null;
        const moved = await dispatchBreakeven(dep, open, newStop, newTp);
        if (moved) await markStrategyTradeBreakeven(open.id).catch(() => {});
      }
    }
    const exitNow = isLong ? sig.exitLong : sig.exitShort;
    if (!exitNow) { await touchDeployment(dep.id, { error: null }); return; }
    const ok = await dispatchClose(dep, open);
    if (!ok) { await touchDeployment(dep.id, { error: 'exit dispatch failed — position may still be open, will retry next bar' }); return; }
    const pnl = tradePnl(spec, open, sig.close);
    await closeStrategyTrade(open.id, sig.close, pnl, 'exit_signal');
    await touchDeployment(dep.id, { error: null, lastSignalAt: true });
    return;
  }

  // Flat — entries, respecting the spec's daily cap for this deployment.
  const direction = sig.enterLong && !sig.enterShort ? 'BUY' : sig.enterShort && !sig.enterLong ? 'SELL' : null;
  if (!direction) { await touchDeployment(dep.id, { error: null }); return; }
  if (spec.risk.maxTradesPerDay && spec.risk.maxTradesPerDay > 0) {
    const { pool } = await import('../db');
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM strategy_trades WHERE deployment_id=$1 AND opened_at::date = CURRENT_DATE`,
      [dep.id],
    );
    if ((rows[0]?.n ?? 0) >= spec.risk.maxTradesPerDay) { await touchDeployment(dep.id, { error: null }); return; }
  }

  const pipSize = getPipSize(spec.symbol);
  const slDist = spec.risk.stopLossAtrMult && sig.atr ? spec.risk.stopLossAtrMult * sig.atr
    : spec.risk.stopLossPips ? spec.risk.stopLossPips * pipSize : null;
  const tpDist = spec.risk.takeProfitAtrMult && sig.atr ? spec.risk.takeProfitAtrMult * sig.atr
    : spec.risk.takeProfitPips ? spec.risk.takeProfitPips * pipSize : null;
  const stopLoss = slDist ? (direction === 'BUY' ? sig.close - slDist : sig.close + slDist) : null;
  const takeProfit = tpDist ? (direction === 'BUY' ? sig.close + tpDist : sig.close - tpDist) : null;
  const round = (n: number | null) => n == null ? null : Math.round(n * 100000) / 100000;

  const opened = await dispatchOpen(dep, spec, direction, round(stopLoss), round(takeProfit), sig.close);
  if (!opened) { await touchDeployment(dep.id, { error: 'entry dispatch failed' }); return; }
  await openStrategyTrade(dep, {
    symbol: spec.symbol, direction, volume: opened.volume, entryPrice: sig.close, platformRef: opened.ref,
  });
  await touchDeployment(dep.id, { error: null, lastSignalAt: true });
}

/**
 * HARD SAFETY — broker dispatch refuses shadow deployments loudly.
 * runDeployment branches shadow deployments to runShadowDeployment
 * before any dispatch call, so this should be unreachable; it exists so
 * that if a future change ever routes one here, the failure is a loud
 * recorded error on the deployment — never a silent order on an
 * account. Exported for scripts/check-studio-shadow.ts.
 */
export function assertBrokerDispatchAllowed(dep: StrategyDeployment, fn: string): void {
  if ((dep.platform as string) === 'shadow') {
    throw new Error(`[Strategy Runner] ${fn}: shadow deployment ${dep.id} reached broker dispatch — refused (shadow deployments are virtual-only and have no account)`);
  }
}

/**
 * One new closed bar of a SHADOW deployment. The decision logic is the
 * pure evaluateShadowBar (strategy-shadow.ts): entries fill at the bar
 * close, SL/TP and exit groups resolve from bar prices the way the
 * backtester resolves them (there is no broker to reconcile against),
 * and results land in strategy_trades as mode='shadow' rows — which is
 * also how they reach the shared shadow ledger (its
 * strategy_studio_shadow arm is a view over those rows) and the
 * strategy brain's separate Shadow (virtual) layer.
 */
async function runShadowDeployment(dep: StrategyDeployment, spec: StrategySpec, sig: NonNullable<ReturnType<typeof evaluateSpecSignals>>, bars: BacktestBar[]): Promise<void> {
  const bar = bars[bars.length - 1];
  const open = await getOpenStrategyTrade(dep.id);

  let position: ShadowPositionState | null = null;
  if (open) {
    const entry = Number(open.entry_price) || 0;
    position = {
      direction: String(open.direction).toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
      entryPrice: entry,
      stopLoss: open.stop_loss != null ? Number(open.stop_loss) : null,
      takeProfit: open.take_profit != null ? Number(open.take_profit) : null,
      extremePrice: open.extreme_price != null ? Number(open.extreme_price) : entry,
      breakevenApplied: !!open.breakeven_applied,
      riskDist: open.risk_price_dist != null ? Number(open.risk_price_dist) : null,
      volume: Number(open.volume) || spec.risk.lotSize,
    };
  }

  // Daily entry cap — same semantics as the live path, counted on this
  // deployment's own (shadow) rows only.
  let entriesAllowed = true;
  if (!open && spec.risk.maxTradesPerDay && spec.risk.maxTradesPerDay > 0) {
    const { pool } = await import('../db');
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM strategy_trades WHERE deployment_id=$1 AND mode='shadow' AND opened_at::date = CURRENT_DATE`,
      [dep.id],
    );
    entriesAllowed = (rows[0]?.n ?? 0) < spec.risk.maxTradesPerDay;
  }

  const decision = evaluateShadowBar({ spec, position, sig, bar, entriesAllowed });
  if (decision.type === 'open') {
    await openStrategyTrade(dep, {
      symbol: spec.symbol, direction: decision.direction, volume: decision.volume,
      entryPrice: decision.entryPrice, platformRef: null, mode: 'shadow',
      stopLoss: decision.stopLoss, takeProfit: decision.takeProfit,
      riskDist: decision.riskDist, extremePrice: decision.extremePrice,
    });
    await touchDeployment(dep.id, { error: null, lastSignalAt: true });
  } else if (decision.type === 'close' && open) {
    await closeStrategyTrade(open.id, decision.exitPrice, decision.pnl, decision.exitReason, decision.rMultiple);
    await touchDeployment(dep.id, { error: null, lastSignalAt: true });
  } else if (decision.type === 'update' && open) {
    await updateStrategyTradeLevels(open.id, {
      stopLoss: decision.stopLoss, extremePrice: decision.extremePrice, breakevenApplied: decision.breakevenApplied,
    });
    await touchDeployment(dep.id, { error: null });
  } else {
    await touchDeployment(dep.id, { error: null });
  }
}

/**
 * If the broker already closed this deployment's position (SL/TP fill),
 * reconcile the trade log and return true. Realized P&L is read back
 * from the platform's history when it exposes it; when it can't be
 * read, the row closes with pnl NULL and the brain excludes it from
 * stats rather than inventing a number.
 */
async function resolveVanishedPosition(dep: StrategyDeployment, open: any, lastClose: number): Promise<boolean> {
  assertBrokerDispatchAllowed(dep, 'resolveVanishedPosition');
  try {
    if (dep.platform === 'dxtrade') {
      const { pool } = await import('../db');
      const { rows } = await pool.query(
        `SELECT id, host, username, encrypted_password, domain, account_code FROM dxtrade_connections WHERE id=$1 AND user_id=$2 AND is_active=true`,
        [Number(dep.connectionRef), dep.userId],
      );
      if (!rows.length) return false;
      const dc = rows[0];
      const { getDxtradeService, decryptApiSecret, extractAccountCode } = await import('../dxtrade');
      const svc = getDxtradeService(dc.host, dc.username, decryptApiSecret(dc.encrypted_password), dc.domain, String(dc.id));
      await svc.ensureLoggedIn();
      const acct = dc.account_code || extractAccountCode(await svc.getAccounts());
      if (!acct) return false;
      const positions = await svc.getPositions(acct).catch(() => null);
      if (!positions) return false; // read failed — don't guess
      const stillOpen = positions.some((p: any) =>
        (open.platform_ref && String(p.positionId) === String(open.platform_ref)) ||
        ((p.instrument || '').replace('/', '').toUpperCase() === open.symbol && String(p.side).toUpperCase() === String(open.direction).toUpperCase()));
      if (stillOpen) return false;
      const since = new Date(open.opened_at).getTime() - 60_000;
      const closed = await svc.getClosedTradesWithPnl(acct, since).catch(() => [] as any[]);
      const mine = closed.find((o: any) => open.platform_ref && String(o.positionId) === String(open.platform_ref));
      const raw = mine ? (mine.profit ?? mine.pnl ?? mine.realizedPnl ?? null) : null;
      const pnl = raw != null && isFinite(Number(raw)) ? Number(raw) : null;
      await closeStrategyTrade(open.id, Number(mine?.closePrice) || lastClose, pnl, 'broker_sl_tp');
      return true;
    }
    if (dep.platform === 'tradelocker') {
      const { storage } = await import('../storage');
      const { getOrCreateService } = await import('../tradelocker');
      const conns = (await storage.getUserTradelockerConnections(dep.userId)).filter((c: any) => c.isActive);
      const conn = conns.find((c: any) => c.id === Number(dep.connectionRef));
      if (!conn) return false;
      const svc = await getOrCreateService(conn);
      const positions = await svc.getPositionsNormalized({ fresh: true }).catch(() => null);
      if (!positions) return false;
      const stillOpen = positions.some((p: any) =>
        (open.platform_ref && String((p as any).id) === String(open.platform_ref)) ||
        ((p.symbol || '').toUpperCase() === open.symbol && String(p.direction).toUpperCase() === String(open.direction).toUpperCase()));
      if (stillOpen) return false;
      const since = new Date(open.opened_at).getTime() - 60_000;
      const closed = await svc.getClosedPositions(since).catch(() => [] as any[]);
      const mine = closed.find((o: any) =>
        String(o.symbol || '').toUpperCase().replace('/', '') === open.symbol &&
        new Date(o.closedAt ?? o.closeTime ?? o.createdAt ?? 0).getTime() >= since);
      const raw = mine ? (mine.pnl ?? mine.realizedPnl ?? mine.profit ?? null) : null;
      const pnl = raw != null && isFinite(Number(raw)) ? Number(raw) : null;
      await closeStrategyTrade(open.id, Number(mine?.closePrice ?? mine?.exitPrice) || lastClose, pnl, 'broker_sl_tp');
      return true;
    }
  } catch { return false; }
  return false;
}

/** Runner-recorded P&L (quote→USD like the backtester; broker truth also
 *  lands in ai_trade_results via each platform's own outcome sync). */
function tradePnl(spec: StrategySpec, open: any, exitPrice: number): number {
  const entry = Number(open.entry_price) || 0;
  const dirSign = String(open.direction).toUpperCase() === 'BUY' ? 1 : -1;
  const diff = (exitPrice - entry) * dirSign;
  const volume = Number(open.volume) || 0;
  let pnl: number;
  if (open.platform === 'dxtrade') {
    pnl = diff * volume; // volume is instrument units on DXtrade
  } else {
    const cs = CONTRACT_SIZE[spec.symbol.replace(/[^A-Z]/g, '')] ?? 100000;
    pnl = diff * cs * volume; // volume is lots on MT5 / TradeLocker
  }
  if (spec.symbol.length === 6 && spec.symbol.startsWith('USD') && exitPrice > 0) pnl = pnl / exitPrice;
  return Math.round(pnl * 100) / 100;
}

async function dispatchOpen(
  dep: StrategyDeployment, spec: StrategySpec, direction: 'BUY' | 'SELL',
  stopLoss: number | null, takeProfit: number | null, refPrice: number,
): Promise<{ volume: number; ref: string | null } | null> {
  assertBrokerDispatchAllowed(dep, 'dispatchOpen');
  try {
    if (dep.platform === 'mt5') {
      const { broadcastMT5Signal } = await import('./live-trading-engine');
      broadcastMT5Signal(dep.userId, {
        id: `wiz_${dep.id}_${Date.now()}`,
        timestamp: new Date().toISOString(),
        symbol: spec.symbol, direction, action: 'OPEN',
        lotSize: spec.risk.lotSize, entryPrice: null,
        stopLoss, takeProfit, confidence: 100,
        reason: `Wizard strategy "${spec.name}" entry (${dep.accountLabel || 'deployment ' + dep.id})`,
        holdTime: '', strategy: 'wizard_strategy', confluences: [],
        status: 'pending', positionId: null,
      } as any);
      return { volume: spec.risk.lotSize, ref: null };
    }
    if (dep.platform === 'tradelocker') {
      const { storage } = await import('../storage');
      const { executeMT5SignalOnTradeLocker } = await import('../tradelocker');
      const conns = (await storage.getUserTradelockerConnections(dep.userId)).filter((c: any) => c.isActive);
      const conn = conns.find((c: any) => c.id === Number(dep.connectionRef));
      if (!conn) return null;
      const r = await executeMT5SignalOnTradeLocker(conn, {
        action: 'OPEN', symbol: spec.symbol, direction, volume: spec.risk.lotSize, stopLoss, takeProfit,
      });
      return r.success ? { volume: spec.risk.lotSize, ref: r.orderId ?? null } : null;
    }
    if (dep.platform === 'dxtrade') {
      const { pool } = await import('../db');
      const { rows } = await pool.query(
        `SELECT id, host, username, encrypted_password, domain, account_code FROM dxtrade_connections WHERE id=$1 AND user_id=$2 AND is_active=true`,
        [Number(dep.connectionRef), dep.userId],
      );
      if (!rows.length) return null;
      const dc = rows[0];
      const { getDxtradeService, decryptApiSecret, extractAccountCode } = await import('../dxtrade');
      const svc = getDxtradeService(dc.host, dc.username, decryptApiSecret(dc.encrypted_password), dc.domain, String(dc.id));
      await svc.ensureLoggedIn();
      const acct = dc.account_code || extractAccountCode(await svc.getAccounts());
      if (!acct) return null;
      const wire = spec.symbol.length === 6 ? `${spec.symbol.slice(0, 3)}/${spec.symbol.slice(3)}` : spec.symbol;
      const inst: any = await svc.getInstrument(wire).catch(() => null);
      const lotSize = Number(inst?.lotSize) || 100000;
      let units = Math.round(spec.risk.lotSize * lotSize);
      const inc = Number(inst?.quantityIncrement) || 0;
      if (inc > 0) units = Math.max(inc, Math.round(units / inc) * inc);
      if (!(units > 0)) return null;
      await svc.placeOrder(acct, {
        instrument: wire, side: direction, quantity: units, type: 'MARKET',
        positionEffect: 'OPEN', stopLoss: stopLoss ?? undefined, takeProfit: takeProfit ?? undefined,
      } as any);
      // Capture the positionCode for later exit (fill-verify, brief wait).
      await new Promise((r) => setTimeout(r, 1500));
      const positions = await svc.getPositions(acct).catch(() => [] as any[]);
      const mine = positions.find((p: any) =>
        (p.instrument || '').replace('/', '').toUpperCase() === spec.symbol && String(p.side).toUpperCase() === direction);
      return { volume: units, ref: mine?.positionId ?? null };
    }
  } catch { return null; }
  return null;
}

async function dispatchClose(dep: StrategyDeployment, open: any): Promise<boolean> {
  assertBrokerDispatchAllowed(dep, 'dispatchClose');
  try {
    if (dep.platform === 'mt5') {
      const { broadcastMT5Signal } = await import('./live-trading-engine');
      broadcastMT5Signal(dep.userId, {
        id: `wiz_close_${dep.id}_${Date.now()}`,
        timestamp: new Date().toISOString(),
        symbol: open.symbol, direction: open.direction, action: 'CLOSE',
        lotSize: 0, entryPrice: null, stopLoss: null, takeProfit: null, confidence: 100,
        reason: 'Wizard strategy exit rule fired', holdTime: '', strategy: 'wizard_strategy',
        confluences: [], status: 'pending', modifyAction: 'full_close', positionId: null,
      } as any);
      return true;
    }
    if (dep.platform === 'tradelocker') {
      const { storage } = await import('../storage');
      const { executeMT5SignalOnTradeLocker } = await import('../tradelocker');
      const conns = (await storage.getUserTradelockerConnections(dep.userId)).filter((c: any) => c.isActive);
      const conn = conns.find((c: any) => c.id === Number(dep.connectionRef));
      if (!conn) return false;
      const r = await executeMT5SignalOnTradeLocker(conn, {
        action: 'CLOSE', symbol: open.symbol, direction: open.direction, volume: 0,
        positionId: open.platform_ref || undefined, closeReason: 'wizard strategy exit rule',
      });
      return !!r.success;
    }
    if (dep.platform === 'dxtrade') {
      const { pool } = await import('../db');
      const { rows } = await pool.query(
        `SELECT id, host, username, encrypted_password, domain, account_code FROM dxtrade_connections WHERE id=$1 AND user_id=$2 AND is_active=true`,
        [Number(dep.connectionRef), dep.userId],
      );
      if (!rows.length) return false;
      const { executeSignalOnDxtrade } = await import('../dxtrade');
      const r = await executeSignalOnDxtrade(rows[0], {
        action: 'CLOSE', symbol: open.symbol, direction: open.direction,
        positionCode: open.platform_ref || undefined,
      });
      return !!r.success;
    }
  } catch { return false; }
  return false;
}

/** Move an open position's stop (breakeven) on the deployment's account. */
async function dispatchBreakeven(dep: StrategyDeployment, open: any, newStop: number, newTp: number | null): Promise<boolean> {
  assertBrokerDispatchAllowed(dep, 'dispatchBreakeven');
  try {
    if (dep.platform === 'mt5') {
      const { broadcastMT5Signal } = await import('./live-trading-engine');
      broadcastMT5Signal(dep.userId, {
        id: `wiz_be_${dep.id}_${Date.now()}`,
        timestamp: new Date().toISOString(),
        symbol: open.symbol, direction: open.direction, action: 'MODIFY',
        lotSize: 0, entryPrice: null, stopLoss: newStop, takeProfit: newTp, confidence: 100,
        reason: 'Wizard strategy breakeven', holdTime: '', strategy: 'wizard_strategy',
        confluences: [], status: 'pending', positionId: null,
      } as any);
      return true;
    }
    if (dep.platform === 'tradelocker') {
      const { storage } = await import('../storage');
      const { executeMT5SignalOnTradeLocker } = await import('../tradelocker');
      const conns = (await storage.getUserTradelockerConnections(dep.userId)).filter((c: any) => c.isActive);
      const conn = conns.find((c: any) => c.id === Number(dep.connectionRef));
      if (!conn) return false;
      const r = await executeMT5SignalOnTradeLocker(conn, {
        action: 'MODIFY', symbol: open.symbol, direction: open.direction, volume: 0,
        positionId: open.platform_ref || undefined, stopLoss: newStop, takeProfit: newTp ?? undefined,
      });
      return !!r.success;
    }
    if (dep.platform === 'dxtrade') {
      const { pool } = await import('../db');
      const { rows } = await pool.query(
        `SELECT id, host, username, encrypted_password, domain, account_code FROM dxtrade_connections WHERE id=$1 AND user_id=$2 AND is_active=true`,
        [Number(dep.connectionRef), dep.userId],
      );
      if (!rows.length) return false;
      const { executeSignalOnDxtrade } = await import('../dxtrade');
      const r = await executeSignalOnDxtrade(rows[0], {
        action: 'MODIFY', symbol: open.symbol, direction: open.direction,
        positionCode: open.platform_ref || undefined, stopLoss: newStop, takeProfit: newTp ?? undefined,
      });
      return !!r.success;
    }
  } catch { return false; }
  return false;
}
