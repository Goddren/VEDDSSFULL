// ─── ABBA Engine Room (Phase B) ─────────────────────────────────────────────
// A per-user, READ-ONLY snapshot of everything ABBA is asked about: this
// user's engine states (watchdog-style, but computed from THIS user's
// engines — never the platform-wide watchdog aggregates), this user's
// accounts (services/account-aggregator.ts), open positions and recent
// closes, and guard pressure from the per-user guard-events data.
//
// STRICTLY READ-ONLY: every source below is a state getter, a cache read, a
// storage SELECT, or a read-only service call. No engine start/stop, no
// config apply, no broker/exchange writes are reachable from this module —
// that boundary is why the watchdog's platform status is NOT reused here
// (only its market-hours helper is).
//
// States are classified running / stopped / gated / silent / no_data /
// unknown, always with a plain-language evidence line. A source that cannot
// be read becomes state 'unknown' with the reason — never silence, never a
// fabricated healthy state.

import { storage } from '../storage';
import { pool } from '../db';
import { buildAccountSnapshots, type AccountSnapshot } from './account-aggregator';
import { canonicalTradeSourceLabel } from './trade-source';
import { isFxMarketOpenAt, fxMarketHoursBetween } from './engine-watchdog';

export type EngineStateKind = 'running' | 'stopped' | 'gated' | 'silent' | 'no_data' | 'unknown';

export interface EngineSnapshot {
  id: string;
  name: string;
  state: EngineStateKind;
  evidence: string;
  lastActivityAt: string | null;
  openPositions: number | null;
  guardNote?: string;
}

export interface PositionSnapshot {
  engine: string;
  account: string;
  symbol: string;
  side: string;
  size: number | null;
  entry: number | null;
  current: number | null;
  unrealizedPnl: number | null;
  openedAt: string | null;
  mode?: string;
}

export interface ClosedSnapshot {
  engine: string;
  symbol: string;
  side: string;
  pnl: number | null;
  closedAt: string | null;
  strategy?: string | null;
}

export interface EngineRoom {
  generatedAt: string;
  engines: EngineSnapshot[];
  accounts: AccountSnapshot[];
  guardPressure: { summary: string[]; recent: string[] };
  openPositions: PositionSnapshot[];
  recentCloses: ClosedSnapshot[];
  unknowns: string[];
}

// ── Small helpers ────────────────────────────────────────────────────────────

function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(v as any);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function agoText(iso: string | null): string {
  if (!iso) return 'no recorded activity';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172_800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

async function safe<T>(fn: () => Promise<T> | T, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

// ── Guard pressure (per-user; same services the guard panels read) ──────────

async function buildGuardPressure(userId: number): Promise<{ summary: string[]; recent: string[]; map: Map<string, number> }> {
  const { recentGuardEvents, guardFireRates } = await import('./guard-events');
  const summary: string[] = [];
  const recent: string[] = [];
  const map = new Map<string, number>();
  const ratesRes: any = await safe(() => guardFireRates(userId, 7), null);
  const rates: any[] = Array.isArray(ratesRes?.rates) ? ratesRes.rates : [];
  if (rates.length) {
    const parts: string[] = [];
    let total = 0;
    for (const r of rates) {
      const n = typeof r.fires === 'number' ? r.fires : 0;
      if (n <= 0) continue;
      total += n;
      map.set(r.kind, (map.get(r.kind) || 0) + n);
      parts.push(`${r.engine || 'engine'} ${String(r.kind).replace(/_/g, ' ')} ×${n}${r.top_symbol ? ` (top: ${r.top_symbol})` : ''}`);
    }
    if (parts.length) summary.push(`Guard fires, last 7 days, this user (${total} total): ${parts.join('; ')}.`);
  }
  const evRes: any = await safe(() => recentGuardEvents(userId, 8), null);
  const evs: any[] = Array.isArray(evRes?.events) ? evRes.events : [];
  for (const e of evs.slice(0, 5)) {
    recent.push(`${e.engine || 'engine'}: ${e.detail || e.kind || 'guard event'} (${agoText(isoOrNull(e.created_at || e.createdAt))})`);
  }
  return { summary, recent, map };
}

// ── Engines (per-user state getters only) ────────────────────────────────────

async function buildEngines(userId: number, guardMap: Map<string, number>): Promise<EngineSnapshot[]> {
  const engines: EngineSnapshot[] = [];
  const now = new Date();

  // FX — in-memory engine state + hard-halt flag + effective config.
  try {
    const { getLiveEngineState, isEngineHardHalted, getEffectiveEngineConfig } = await import('./live-trading-engine');
    const st: any = getLiveEngineState(userId);
    const halted = isEngineHardHalted(userId);
    const cfg: any = await safe(() => getEffectiveEngineConfig(userId), null);
    const lastAct = isoOrNull(st?.lastSignalAt || st?.lastScanAt);
    let state: EngineStateKind = 'unknown';
    let evidence = 'FX engine state could not be read.';
    if (st) {
      if (halted || cfg?.emergencyStop) {
        state = 'gated'; evidence = 'Emergency stop / hard halt is active for this user.';
      } else if (st.status === 'running') {
        // Silence judgement reuses the watchdog's market-hours semantics:
        // >24 market-open hours without a scan = silent; weekends don't count.
        const lastScan = st.lastScanAt ? new Date(st.lastScanAt) : null;
        if (lastScan && isFxMarketOpenAt(now) && fxMarketHoursBetween(lastScan, now) > 24) {
          state = 'silent'; evidence = `Engine reports running but its last scan was ${agoText(lastAct)} — over 24 market-open hours ago.`;
        } else {
          state = 'running'; evidence = `Scanning; last scan ${agoText(isoOrNull(st.lastScanAt))}, last signal ${agoText(isoOrNull(st.lastSignalAt))}.`;
        }
      } else if (st.status === 'paused') {
        state = 'gated'; evidence = 'Engine is paused.';
      } else {
        state = 'stopped'; evidence = 'Engine is stopped for this user.';
      }
      if (st.drawdownShieldActive && state === 'running') evidence += ' Drawdown shield is ACTIVE.';
    }
    engines.push({ id: 'fx', name: 'FX Engine', state, evidence, lastActivityAt: lastAct, openPositions: typeof st?.openPositionCount === 'number' ? st.openPositionCount : null });
  } catch { engines.push({ id: 'fx', name: 'FX Engine', state: 'unknown', evidence: 'FX engine state could not be read.', lastActivityAt: null, openPositions: null }); }

  // Sol — in-memory engine status (null until the engine first runs).
  try {
    const { getSolEngineStatus } = await import('./sol-engine');
    const s: any = getSolEngineStatus(userId);
    if (!s) {
      engines.push({ id: 'sol', name: 'Sol Engine', state: 'no_data', evidence: 'Sol engine has not run for this user in this server session.', lastActivityAt: null, openPositions: null });
    } else {
      const lastAct = isoOrNull(s.lastScanAt);
      const stale = s.lastScanAt ? (Date.now() - new Date(s.lastScanAt).getTime()) > 48 * 3600_000 : false;
      engines.push({
        id: 'sol', name: 'Sol Engine',
        state: s.isRunning || s.running ? (stale ? 'silent' : 'running') : 'stopped',
        evidence: (s.isRunning || s.running)
          ? (stale ? `Running but last scan was ${agoText(lastAct)} (>48h, the watchdog's stale bar).` : `Running; last scan ${agoText(lastAct)}.`)
          : 'Sol engine is not running for this user.',
        lastActivityAt: lastAct,
        openPositions: typeof s.openPositions === 'number' ? s.openPositions : null,
      });
    }
  } catch { engines.push({ id: 'sol', name: 'Sol Engine', state: 'unknown', evidence: 'Sol engine status could not be read.', lastActivityAt: null, openPositions: null }); }

  // Kalshi — in-memory engine state.
  try {
    const { getKalshiEngineState } = await import('./kalshi-engine');
    const s: any = getKalshiEngineState(userId);
    engines.push({
      id: 'kalshi', name: 'Kalshi Engine',
      state: s?.isRunning ? 'running' : 'stopped',
      evidence: s?.isRunning
        ? `Running${s.isPaperMode ? ' in paper mode' : ''}; last scan ${agoText(isoOrNull(s.lastScanAt))}, last trade ${agoText(isoOrNull(s.lastTradeAt))}.`
        : 'Kalshi engine is not running for this user.',
      lastActivityAt: isoOrNull(s?.lastTradeAt || s?.lastScanAt),
      openPositions: Array.isArray(s?.openTrades) ? s.openTrades.length : null,
    });
  } catch { engines.push({ id: 'kalshi', name: 'Kalshi Engine', state: 'unknown', evidence: 'Kalshi engine state could not be read.', lastActivityAt: null, openPositions: null }); }

  // Crypto — the health service reads the scanner's own heartbeat (platform
  // process signal) and is LABELED as such; the per-user part is the config.
  try {
    const { getCryptoEngineHealth } = await import('./crypto-health');
    const h: any = await safe(() => getCryptoEngineHealth(), null);
    const cfgRow = await safe(async () => {
      const { rows } = await pool.query(`SELECT is_active FROM cryptocom_engine_configs WHERE user_id = $1`, [userId]);
      return rows[0] ?? null;
    }, null);
    const userOn = cfgRow ? !!cfgRow.is_active : null;
    const lastAct = h?.lastTickAt ? new Date(h.lastTickAt).toISOString() : null;
    engines.push({
      id: 'crypto', name: 'Crypto Engine',
      state: userOn === false ? 'stopped' : (h ? (h.status === 'ok' ? 'running' : h.status === 'stale' ? 'silent' : 'unknown') : 'unknown'),
      evidence: userOn === false
        ? 'Crypto engine is switched off in this user\'s config.'
        : h
          ? `Scanner heartbeat ${h.status}${lastAct ? `, last tick ${agoText(lastAct)}` : ''} (platform process signal — the scanner is shared, not per-user). This user's auto-trading config: ${userOn ? 'on' : 'no config row yet (defaults)'}.`
          : 'Crypto engine health could not be read.',
      lastActivityAt: lastAct,
      openPositions: null,
    });
  } catch { engines.push({ id: 'crypto', name: 'Crypto Engine', state: 'unknown', evidence: 'Crypto engine health could not be read.', lastActivityAt: null, openPositions: null }); }

  // Options / Futures / Polymarket / Sports — per-user in-memory states.
  const extra: Array<[string, string, () => Promise<any>]> = [
    ['futures', 'Futures Scanner', async () => {
      const { getFuturesScannerState } = await import('./futures-scanner');
      const s: any = getFuturesScannerState(userId);
      return {
        state: (s?.status === 'running' ? 'running' : s?.status === 'paused' ? 'gated' : 'stopped') as EngineStateKind,
        evidence: s?.dailyLossHalted ? 'Daily-loss halt is active.' : `Scanner ${s?.status || 'stopped'}; last scan ${agoText(isoOrNull(s?.lastScanAt))}.`,
        lastActivityAt: isoOrNull(s?.lastScanAt), openPositions: null,
      };
    }],
    ['polymarket', 'Polymarket Engine', async () => {
      const { getEngineState } = await import('./polymarket-autonomous-engine');
      const s: any = getEngineState(userId);
      let usRunning = false;
      try {
        const { getPmUsEngineState } = await import('./polymarket-us-engine');
        const us: any = getPmUsEngineState(userId);
        usRunning = !!us?.isRunning;
      } catch { /* US engine optional */ }
      return {
        state: (s?.isRunning || usRunning ? 'running' : 'stopped') as EngineStateKind,
        evidence: `Global engine ${s?.isRunning ? 'running' : 'stopped'}${usRunning ? '; US engine running' : ''}; last trade ${agoText(isoOrNull(s?.lastTradeAt))}.`,
        lastActivityAt: isoOrNull(s?.lastTradeAt || s?.lastScanAt),
        openPositions: Array.isArray(s?.openPositions) ? s.openPositions.length : null,
      };
    }],
    ['sports', 'Sports Engine', async () => {
      const { getSportsEngineState } = await import('./sports-trade-engine');
      const s: any = getSportsEngineState(userId);
      return {
        state: (s?.isRunning ? 'running' : 'stopped') as EngineStateKind,
        evidence: `Sports engine ${s?.isRunning ? 'running' : 'stopped'}; last scan ${agoText(isoOrNull(s?.lastScanAt))}.`,
        lastActivityAt: isoOrNull(s?.lastScanAt),
        openPositions: Array.isArray(s?.openTrades) ? s.openTrades.length : null,
      };
    }],
  ];
  for (const [id, name, load] of extra) {
    try {
      const r = await load();
      engines.push({ id, name, ...r });
    } catch { engines.push({ id, name, state: 'unknown', evidence: `${name} state could not be read.`, lastActivityAt: null, openPositions: null }); }
  }

  // Options has config + trades but no per-user running-state getter — report
  // honestly from its open trades instead of inventing a state.
  try {
    const open = await storage.getOpenOptionsEngineTrades(userId);
    engines.push({ id: 'options', name: 'Options Engine', state: open.length ? 'running' : 'no_data', evidence: open.length ? `${open.length} options position(s) currently open.` : 'No running-state signal and no open options positions for this user.', lastActivityAt: null, openPositions: open.length });
  } catch { engines.push({ id: 'options', name: 'Options Engine', state: 'unknown', evidence: 'Options engine state could not be read.', lastActivityAt: null, openPositions: null }); }

  // Guard pressure note for FX (the guard-events data is FX-first).
  const fx = engines.find(e => e.id === 'fx');
  const blocks = guardMap.get('guard_block') || 0;
  if (fx && blocks > 0) fx.guardNote = `${blocks} trade(s) blocked by guards in the last 7 days.`;

  return engines;
}

// ── Positions + closes (normalized, labeled by engine/account) ──────────────

async function buildPositions(userId: number): Promise<{ open: PositionSnapshot[]; closes: ClosedSnapshot[] }> {
  const open: PositionSnapshot[] = [];
  const closes: ClosedSnapshot[] = [];

  // MT5 EA-push cache.
  try {
    const pos = (global as any).mt5OpenPositions?.[userId];
    if (Array.isArray(pos)) for (const p of pos) open.push({
      engine: 'MT5', account: 'MT5', symbol: p.symbol || '?', side: p.type || p.direction || '?',
      size: p.volume ?? p.lots ?? null, entry: p.openPrice ?? p.priceOpen ?? null,
      current: p.currentPrice ?? null, unrealizedPnl: p.profit ?? null,
      openedAt: isoOrNull(p.openTime),
    });
  } catch { /* cache cold */ }

  // TradeLocker live cache positions (the typed cache shape carries no
  // positions field today — read defensively so this lights up if it grows one).
  try {
    const { getTlAccountData } = await import('./tradelocker-sync');
    const live: any = getTlAccountData(userId);
    for (const p of (live.positions || [])) open.push({
      engine: 'TradeLocker', account: 'TradeLocker', symbol: p.symbol || p.instrument || '?',
      side: p.side || p.direction || '?', size: p.qty ?? p.quantity ?? null,
      entry: p.avgPrice ?? p.entryPrice ?? null, current: null,
      unrealizedPnl: p.unrealizedPl ?? p.pnl ?? null, openedAt: isoOrNull(p.openedAt || p.createdAt),
    });
  } catch { /* cache cold */ }

  // Sol engine positions (paper + shadow + live in one table; mode labeled).
  try {
    const { rows } = await pool.query(
      `SELECT symbol, direction, mode, size_usd, entry_price, opened_at FROM sol_engine_positions WHERE user_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 20`,
      [userId],
    );
    for (const r of rows) open.push({
      engine: 'Sol Engine', account: 'Solana', symbol: r.symbol, side: r.direction || 'long',
      size: r.size_usd != null ? Number(r.size_usd) : null, entry: r.entry_price != null ? Number(r.entry_price) : null,
      current: null, unrealizedPnl: null, openedAt: isoOrNull(r.opened_at), mode: r.mode,
    });
  } catch { /* table shape differs — skip rather than guess */ }

  // Crypto.com / options / futures engine trades (storage getters).
  const lanes: Array<[string, () => Promise<any[]>]> = [
    ['Crypto Engine', () => storage.getOpenCryptocomEngineTrades(userId)],
    ['Options Engine', () => storage.getOpenOptionsEngineTrades(userId)],
    ['Futures Engine', () => storage.getOpenFuturesEngineTrades(userId)],
  ];
  for (const [engine, load] of lanes) {
    const rows = await safe(load, []);
    for (const t of rows.slice(0, 20)) open.push({
      engine, account: engine.replace(' Engine', ''), symbol: t.symbol || t.underlying || '?',
      side: t.direction || t.side || '?', size: t.quantity ?? t.contracts ?? t.positionSize ?? null,
      entry: t.entryPrice ?? t.entry_price ?? null, current: t.currentPrice ?? null,
      unrealizedPnl: t.unrealizedPnl ?? t.unrealized_pnl ?? null, openedAt: isoOrNull(t.openedAt || t.createdAt),
    });
  }

  // Kalshi open trades from engine state.
  try {
    const { getKalshiEngineState } = await import('./kalshi-engine');
    const s: any = getKalshiEngineState(userId);
    for (const t of (s?.openTrades || [])) open.push({
      engine: 'Kalshi', account: 'Kalshi', symbol: t.ticker || t.marketTicker || t.title || '?',
      side: t.side || (t.yes ? 'YES' : 'NO'), size: t.contracts ?? t.quantity ?? null,
      entry: t.entryPrice ?? null, current: t.currentPrice ?? null,
      unrealizedPnl: t.unrealizedPnl ?? null, openedAt: isoOrNull(t.openedAt || t.createdAt),
    });
  } catch { /* no state */ }

  // Recent closes from the unified trade record (canonical source labels).
  try {
    const all = await storage.getAiTradeResults(userId, 200);
    const closed = all
      .filter((t: any) => t.result && t.result !== 'PENDING')
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
    for (const t of closed) closes.push({
      engine: canonicalTradeSourceLabel((t as any).source),
      symbol: t.symbol, side: t.direction,
      pnl: typeof (t as any).profitLoss === 'number' ? (t as any).profitLoss : null,
      closedAt: isoOrNull(t.createdAt),
      strategy: (t as any).strategy || null,
    });
  } catch { /* trade record unreadable — closes stay empty, engines still report */ }

  return { open, closes };
}

// ── Assemble ─────────────────────────────────────────────────────────────────

const cache = new Map<number, { at: number; room: EngineRoom }>();
const CACHE_MS = 30_000;

export async function buildEngineRoom(userId: number): Promise<EngineRoom> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.room;

  const guard = await buildGuardPressure(userId);
  const [engines, acct, positions] = await Promise.all([
    buildEngines(userId, guard.map),
    buildAccountSnapshots(userId),
    buildPositions(userId),
  ]);

  const room: EngineRoom = {
    generatedAt: new Date().toISOString(),
    engines,
    accounts: acct.accounts,
    guardPressure: { summary: guard.summary, recent: guard.recent },
    openPositions: positions.open.slice(0, 25),
    recentCloses: positions.closes,
    unknowns: acct.unknowns,
  };
  cache.set(userId, { at: Date.now(), room });
  return room;
}

// ── Compact prompt text ──────────────────────────────────────────────────────
// Every number below comes from the snapshot above — ABBA states figures
// WITH their freshness instead of presenting cached numbers as live truth.

function freshnessText(a: AccountSnapshot): string {
  if (a.status === 'ok') return a.ageSeconds != null && a.ageSeconds > 75 ? `as of ${Math.round(a.ageSeconds / 60)} min ago` : 'fresh';
  if (a.status === 'stale') return `STALE — last figure ${a.ageSeconds != null ? agoText(new Date(Date.now() - a.ageSeconds * 1000).toISOString()) : 'unknown age'}`;
  if (a.status === 'error') return 'balance read failed';
  return 'balance not readable right now';
}

function money(v: number | null, currency: string | null): string {
  if (v == null) return 'unknown';
  return `${currency || 'USD'} ${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function engineRoomContextText(room: EngineRoom): string {
  const lines: string[] = [];
  lines.push(`ENGINE ROOM (this signed-in user's own live snapshot, generated ${agoText(room.generatedAt)} — quote figures WITH their freshness; a stale or unknown figure is NOT a zero):`);
  lines.push('ENGINES:');
  for (const e of room.engines) {
    lines.push(`- ${e.name}: ${e.state.toUpperCase()} — ${e.evidence}${e.guardNote ? ` ${e.guardNote}` : ''}`);
  }
  if (room.guardPressure.summary.length || room.guardPressure.recent.length) {
    lines.push('GUARD PRESSURE (this user):');
    for (const s of room.guardPressure.summary) lines.push(`- ${s}`);
    for (const r of room.guardPressure.recent.slice(0, 3)) lines.push(`- Recent: ${r}`);
  }
  lines.push('ACCOUNTS:');
  if (!room.accounts.length) lines.push('- No connected accounts found for this user.');
  for (const a of room.accounts) {
    lines.push(`- ${a.label} [${a.provider}, ${a.accountType}]: balance ${money(a.balance, a.currency)}${a.equity != null && a.equity !== a.balance ? `, equity ${money(a.equity, a.currency)}` : ''} (${freshnessText(a)}; source: ${a.source})${a.note ? ` — ${a.note}` : ''}`);
  }
  lines.push(`OPEN POSITIONS (${room.openPositions.length} shown):`);
  if (!room.openPositions.length) lines.push('- None open right now.');
  for (const p of room.openPositions.slice(0, 12)) {
    lines.push(`- ${p.symbol} ${p.side} via ${p.engine}${p.mode ? ` (${p.mode})` : ''}${p.unrealizedPnl != null ? `, floating P&L $${p.unrealizedPnl.toFixed(2)}` : ''}${p.openedAt ? `, opened ${agoText(p.openedAt)}` : ''}`);
  }
  if (room.recentCloses.length) {
    lines.push('RECENT CLOSES:');
    for (const c of room.recentCloses.slice(0, 6)) {
      lines.push(`- ${c.symbol} ${c.side} via ${c.engine}${c.strategy ? ` (${c.strategy})` : ''}: ${c.pnl != null ? `$${c.pnl.toFixed(2)}` : 'P&L unknown'} (${agoText(c.closedAt)})`);
    }
  }
  for (const u of room.unknowns) lines.push(`UNKNOWN: ${u}`);
  return lines.join('\n');
}
