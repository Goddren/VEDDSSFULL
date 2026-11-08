// ── Settings overview: standard (code default) vs yours (live value) ────────
// Engine report follow-up (2026-11-08): guard settings are scattered across
// per-engine config objects and one config table, so there was no single
// place to see "what did I change from standard?" This module aggregates a
// CURATED, guard-relevant subset per engine: the standard value (copied from
// each engine's defaults — sources cited per section; keep in sync if those
// defaults change) beside the user's live effective value, read through the
// engines' own getters so what is shown is what is actually running.
//
// READ-ONLY. Nothing here writes config. Engines covered: FX, Sol, Kalshi,
// Crypto. An engine whose live config cannot be read reports available:false
// instead of guessing.

import { pool } from '../db';

type Fmt = 'bool' | 'num' | 'text' | 'secs';
interface FieldSpec { key: string; from?: string; label: string; standard: unknown; fmt: Fmt }
interface EngineSpec {
  id: string; name: string; fields: FieldSpec[];
  load: (userId: number) => Promise<Record<string, any> | null>;
}

const num = (key: string, label: string, standard: number, from?: string): FieldSpec => ({ key, from, label, standard, fmt: 'num' });
const bool = (key: string, label: string, standard: boolean, from?: string): FieldSpec => ({ key, from, label, standard, fmt: 'bool' });
const text = (key: string, label: string, standard: string, from?: string): FieldSpec => ({ key, from, label, standard, fmt: 'text' });
const secs = (key: string, label: string, standard: number, from?: string): FieldSpec => ({ key, from, label, standard, fmt: 'secs' });

const ENGINES: EngineSpec[] = [
  {
    id: 'fx', name: 'FX Engine',
    // Standards: getDefaultConfig() literal in live-trading-engine.ts.
    fields: [
      num('minConfidence', 'Minimum confidence to trade', 70),
      text('strategyMode', 'Strategy mode', 'aggressive'),
      num('maxOpenTrades', 'Max open trades at once', 5),
      num('riskPerTrade', 'Risk per trade (%)', 1),
      num('maxRiskPerTradePct', 'Hard cap: risk per trade (%)', 2),
      num('maxDailyLossPct', 'Daily loss breaker (%)', 4),
      num('dailyLossLimit', 'Daily loss limit (%)', 5),
      num('maxDrawdownPct', 'Drawdown breaker below peak (%)', 8),
      num('drawdownShieldThreshold', 'Drawdown shield (%)', 3),
      num('maxLotSize', 'Max lot size', 0.10),
      num('maxLot', 'Absolute lot ceiling (0 = none)', 0),
      num('maxDailyTrades', 'Max trades per day (0 = unlimited)', 0),
      num('maxTradesPerPairPerDay', 'Max trades per pair per day', 2),
      bool('trailingStopEnabled', 'Trailing stops', true),
      bool('profitLockEnabled', 'Profit lock from +1R', true),
      num('stopHoldUntilR', 'Stop cannot tighten before (R)', 1),
      bool('propFirmMode', 'Prop firm mode', false),
      num('propFirmDailyDrawdownLimit', 'Prop firm daily drawdown (%)', 4),
      bool('autoFlattenOnBreach', 'Close trades when a breaker trips', false),
      bool('brainLearningMode', 'Brain learning', true),
      bool('brainShadowEnabled', 'Practice results feed the brain', true),
      text('directionFilter', 'Direction filter', 'both'),
      secs('scanIntervalMs', 'Scan interval', 60000),
    ],
    load: async (userId) => {
      const { getEffectiveEngineConfig } = await import('./live-trading-engine');
      return getEffectiveEngineConfig(userId) as any;
    },
  },
  {
    id: 'sol', name: 'Sol Engine',
    // Standards: DEFAULT_CONFIG in sol-engine.ts.
    fields: [
      num('minConfidence', 'Minimum confidence to trade', 65),
      num('riskPerTradePct', 'Risk per trade (%)', 1.0),
      num('maxDailyTrades', 'Max trades per day (0 = unlimited)', 0),
      num('maxTokens', 'Max tokens tracked at once', 10),
      bool('shieldEnabled', 'Loss shield', true),
      num('shieldThreshold', 'Shield trips at drawdown (%)', 10),
      bool('useKelly', 'Kelly position sizing', false),
      text('directionFilter', 'Direction filter', 'buy_only'),
      bool('stopOrdersEnabled', 'Stop orders', false),
      bool('adaptiveScan', 'Adaptive scanning', true),
      text('aiMode', 'AI mode', 'full'),
      text('dexFilter', 'DEX filter', 'all'),
    ],
    load: async (userId) => {
      const { getSolEngineStatus } = await import('./sol-engine');
      const s: any = getSolEngineStatus(userId);
      return s?.config ?? null; // null while the engine has never run this boot
    },
  },
  {
    id: 'kalshi', name: 'Kalshi Engine',
    // Standards: DEFAULT_CONFIG in kalshi-engine.ts.
    fields: [
      num('minConfidence', 'Minimum confidence to trade', 70),
      num('maxOpenTrades', 'Max open trades at once', 3),
      num('maxTradesPerDay', 'Max trades per day', 10),
      num('contractsPerTrade', 'Contracts per trade', 5),
      num('riskPctPerTrade', 'Risk per trade (%)', 5),
      num('takeProfitCents', 'Take profit (%)', 50),
      num('stopLossCents', 'Stop loss (%)', 40),
      num('minEntryPriceCents', 'Cheapest entry allowed (cents)', 30),
      bool('requireConfluence', 'Requires confluence', true),
      bool('ruinGuardEnabled', 'Ruin guard (bad-day halt)', true),
      num('dailyLossLimitPct', 'Daily loss limit (%)', 5),
      num('maxDrawdownLimitPct', 'Max drawdown limit (%)', 10),
      bool('kalshiBrainGating', 'Brain can hard-block setups', true),
      bool('brainLearningMode', 'Brain learning', true),
      bool('weatherEnabled', 'Weather engine', false),
      num('cooldownMinutes', 'Cooldown between trades (min)', 20),
    ],
    load: async (userId) => {
      const { getKalshiEngineState } = await import('./kalshi-engine');
      return (getKalshiEngineState(userId) as any)?.config ?? null;
    },
  },
  {
    id: 'crypto', name: 'Crypto Engine',
    // Standards: column defaults in ensure-cryptocom-engine-tables.ts.
    fields: [
      num('minConfidence', 'Minimum confidence to trade', 70, 'min_confidence'),
      num('maxOpenTrades', 'Max open trades at once', 3, 'max_open_trades'),
      num('riskPerTrade', 'Risk per trade (%)', 1.0, 'risk_per_trade'),
      num('dailyLossLimit', 'Daily loss limit (%)', 5.0, 'daily_loss_limit'),
      num('maxDailyTrades', 'Max trades per day (0 = unlimited)', 0, 'max_daily_trades'),
      num('drawdownShield', 'Drawdown shield (%)', 3.0, 'drawdown_shield_threshold'),
      num('leverage', 'Leverage', 3, 'leverage'),
      text('directionFilter', 'Direction filter', 'both', 'direction_filter'),
      bool('brainLearning', 'Brain learning', true, 'brain_learning_mode'),
      bool('cryptoBrain', 'Crypto brain', true, 'crypto_brain_enabled'),
      num('compositeScore', 'Composite entry score needed', 72, 'composite_min_edge_score'),
      bool('autoExecution', 'Auto execution', false, 'enable_auto_execution'),
      bool('kelly', 'Kelly position sizing', false, 'use_kelly_criterion'),
      secs('scanInterval', 'Scan interval', 120000, 'scan_interval_ms'),
      text('strategyMode', 'Strategy mode', 'auto', 'strategy_mode'),
      text('trailMethod', 'Trailing method', 'none', 'trail_method'),
    ],
    load: async (userId) => {
      try {
        const { rows } = await pool.query(`SELECT * FROM cryptocom_engine_configs WHERE user_id = $1`, [userId]);
        return rows[0] ?? {}; // no row yet = every value is still standard
      } catch { return null; }
    },
  },
];

function differs(standard: unknown, yours: unknown): boolean {
  if (yours === undefined || yours === null) return false;
  const a = Number(standard), b = Number(yours);
  if (Number.isFinite(a) && Number.isFinite(b) && typeof standard !== 'boolean' && typeof yours !== 'boolean') return a !== b;
  return String(standard) !== String(yours);
}

export async function getSettingsOverview(userId: number): Promise<{ engines: any[] }> {
  const engines: any[] = [];
  for (const spec of ENGINES) {
    let live: Record<string, any> | null = null;
    try { live = await spec.load(userId); } catch { live = null; }
    const rows = spec.fields.map((f) => {
      const yours = live ? live[f.from ?? f.key] : undefined;
      return {
        key: f.key, label: f.label, fmt: f.fmt, standard: f.standard,
        yours: yours === undefined ? null : yours,
        differs: live ? differs(f.standard, yours) : false,
      };
    });
    engines.push({
      id: spec.id, name: spec.name, available: live !== null,
      changed: rows.filter((r) => r.differs).length, rows,
    });
  }
  return { engines };
}
