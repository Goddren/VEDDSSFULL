// ─────────────────────────────────────────────────────────────────────────────
// FX self-learning brain — per-pair CONDITION patterns.
//
// The existing per-pair knowledge answers "does GBPJPY win?". This answers the
// question that actually improves the engine: "under WHICH conditions does this
// pair win, and does that hold up repeatedly?"
//
// CONSISTENCY IS THE POINT. A 100% win rate over 3 trades in one afternoon is
// noise, and acting on it is how an engine overfits itself into a hole. A
// pattern is only reported when it clears all three of:
//
//   1. MIN_TRADES        — enough samples to mean anything
//   2. MIN_DISTINCT_DAYS — it repeated on separate days, not in one session
//   3. MIN_EDGE_PP       — it beats the pair's OWN baseline, not 50%. A 55%
//                          window on a pair that wins 53% overall is not an edge.
//
// That third rule matters: without it every condition on a good pair looks like
// a winning pattern, and every condition on a bad pair looks broken.
// ─────────────────────────────────────────────────────────────────────────────

export interface PatternStat {
  dimension: string;      // session | hour | adx_bucket | grade | direction
  value: string;
  trades: number;
  wins: number;
  winRate: number;
  distinctDays: number;
  pnl: number;
  edgeVsPair: number;     // percentage points above (or below) the pair's baseline
}

export interface PairBrain {
  symbol: string;
  trades: number;
  winRate: number;
  pnl: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;     // per-trade $ expectation — decides if a pair is worth trading
  works: PatternStat[];   // conditions that consistently BEAT the pair's baseline
  fails: PatternStat[];   // conditions that consistently UNDERPERFORM it
}

const MIN_TRADES = Number(process.env.FX_BRAIN_MIN_TRADES ?? 8);
const MIN_DISTINCT_DAYS = Number(process.env.FX_BRAIN_MIN_DAYS ?? 3);
const MIN_EDGE_PP = Number(process.env.FX_BRAIN_MIN_EDGE_PP ?? 12);
const LOOKBACK_DAYS = Number(process.env.FX_BRAIN_LOOKBACK_DAYS ?? 180);
const TTL_MS = Number(process.env.FX_BRAIN_TTL_MS ?? 30 * 60 * 1000);
const SEP = '~~';

/**
 * Canonical session label. The confirmation writer emits 'NY' while the sync
 * computes 'New York' for the same hours, which split EURUSD's New York trades
 * into a "works, 80%" bucket and a "fails, 31.6%" bucket — the same session
 * giving opposite advice. Normalise before anything is grouped.
 */
function canonSession(v: any, hourUtc: number | null): string | null {
  const raw = String(v ?? '').trim().toLowerCase();
  if (raw === 'ny' || raw === 'new york' || raw === 'newyork') return 'New York';
  if (raw === 'late ny' || raw === 'latency' || raw === 'late-ny') return 'Late NY';
  if (raw === 'asian' || raw === 'asia' || raw === 'tokyo') return 'Asian';
  if (raw === 'london' || raw === 'europe') return 'London';
  if (hourUtc == null) return null;
  return hourUtc < 7 ? 'Asian' : hourUtc < 13 ? 'London' : hourUtc < 20 ? 'New York' : 'Late NY';
}

const cache = new Map<number, { at: number; brains: Record<string, PairBrain> }>();

function adxBucket(v: number | null): string | null {
  if (v == null || !isFinite(v) || v <= 0) return null;
  if (v < 20) return 'ADX <20 (ranging)';
  if (v < 30) return 'ADX 20-29';
  if (v < 40) return 'ADX 30-39';
  return 'ADX 40+ (strong)';
}

/**
 * Learn every pair's condition patterns from the durable feature store.
 * Returns {} when there is not yet enough closed history — an empty brain is
 * honest; a brain built on four trades is worse than none.
 */
export async function learnFxBrain(userId: number): Promise<Record<string, PairBrain>> {
  const { pool } = await import('../db');
  const { rows } = await pool.query(
    `SELECT symbol, direction, session, hour_utc, adx_value, confluence_grade,
            realised_rr, result, profit_loss, closed_at::date AS d
       FROM fx_brain_outcomes
      WHERE user_id = $1
        AND result IN ('WIN','LOSS')
        AND closed_at > now() - ($2 || ' days')::interval
      ORDER BY closed_at`,
    [userId, String(LOOKBACK_DAYS)]
  );
  if (!rows.length) return {};

  const bySymbol = new Map<string, any[]>();
  for (const r of rows) {
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol)!.push(r);
  }

  const out: Record<string, PairBrain> = {};
  for (const [symbol, trades] of Array.from(bySymbol.entries())) {
    const wins = trades.filter((t) => t.result === 'WIN');
    const losses = trades.filter((t) => t.result === 'LOSS');
    const baseline = (wins.length / trades.length) * 100;
    const avgWin = wins.length ? wins.reduce((s, t) => s + Number(t.profit_loss || 0), 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + Number(t.profit_loss || 0), 0) / losses.length : 0;

    const dims = new Map<string, any[]>();
    const add = (dimension: string, value: string | null, t: any) => {
      if (!value) return;
      const k = dimension + SEP + value;
      if (!dims.has(k)) dims.set(k, []);
      dims.get(k)!.push(t);
    };
    for (const t of trades) {
      add('session', canonSession(t.session, t.hour_utc == null ? null : Number(t.hour_utc)), t);
      add('hour', t.hour_utc != null ? String(t.hour_utc) + ':00 UTC' : null, t);
      add('direction', t.direction, t);
      add('adx_bucket', adxBucket(t.adx_value == null ? null : Number(t.adx_value)), t);
      add('grade', t.confluence_grade ? 'Grade ' + t.confluence_grade : null, t);
    }

    const works: PatternStat[] = [];
    const fails: PatternStat[] = [];
    for (const [k, group] of Array.from(dims.entries())) {
      const [dimension, value] = k.split(SEP);
      const w = group.filter((t) => t.result === 'WIN').length;
      const winRate = (w / group.length) * 100;
      const distinctDays = new Set(group.map((t) => String(t.d))).size;
      // All three bars, or it is not a pattern — it is a coincidence.
      if (group.length < MIN_TRADES) continue;
      if (distinctDays < MIN_DISTINCT_DAYS) continue;
      const edge = winRate - baseline;
      if (Math.abs(edge) < MIN_EDGE_PP) continue;
      const groupPnl = group.reduce((s2, t) => s2 + Number(t.profit_loss || 0), 0);
      // Win rate and money must AGREE, or the pattern is not advice — it is a
      // contradiction. GBPJPY Asian wins 64% and still loses $728, because that
      // pair's wins average $109 against losses of $268; calling that a working
      // pattern would push the engine toward a losing edge. Equally, a low win
      // rate that still makes money (EURUSD NY) is not a failure to avoid.
      if (edge > 0 && groupPnl <= 0) continue;
      if (edge < 0 && groupPnl >= 0) continue;
      const stat: PatternStat = {
        dimension, value,
        trades: group.length,
        wins: w,
        winRate: Math.round(winRate * 10) / 10,
        distinctDays,
        pnl: Math.round(groupPnl),
        edgeVsPair: Math.round(edge * 10) / 10,
      };
      (edge > 0 ? works : fails).push(stat);
    }
    works.sort((a, b) => b.edgeVsPair - a.edgeVsPair);
    fails.sort((a, b) => a.edgeVsPair - b.edgeVsPair);

    out[symbol] = {
      symbol,
      trades: trades.length,
      winRate: Math.round(baseline * 10) / 10,
      pnl: Math.round(trades.reduce((s, t) => s + Number(t.profit_loss || 0), 0)),
      avgWin: Math.round(avgWin),
      avgLoss: Math.round(avgLoss),
      // Expectancy is the honest verdict on a pair: win% x avgWin - loss% x |avgLoss|.
      expectancy: Math.round(((wins.length / trades.length) * avgWin) + ((losses.length / trades.length) * avgLoss)),
      works,
      fails,
    };
  }
  return out;
}

export async function getFxBrain(userId: number, force = false): Promise<Record<string, PairBrain>> {
  const hit = cache.get(userId);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.brains;
  const brains = await learnFxBrain(userId);
  cache.set(userId, { at: Date.now(), brains });
  const pairs = Object.keys(brains);
  if (pairs.length) {
    const patterns = pairs.reduce((n, p) => n + brains[p].works.length + brains[p].fails.length, 0);
    console.log('[FxBrain] user ' + userId + ': learned ' + pairs.length + ' pair(s), ' + patterns +
      ' consistent pattern(s) (min ' + MIN_TRADES + ' trades across ' + MIN_DISTINCT_DAYS + '+ days, ' + MIN_EDGE_PP + 'pp edge)');
  }
  return brains;
}

/** Human-readable summary for the AI prompt and the dashboard. */
export async function fxBrainInsights(userId: number, symbol?: string): Promise<string> {
  const brains = await getFxBrain(userId);
  const keys = symbol ? [symbol].filter((k) => brains[k]) : Object.keys(brains);
  if (!keys.length) return '';
  const lines: string[] = [];
  for (const k of keys) {
    const b = brains[k];
    lines.push(b.symbol + ': ' + b.winRate + '% WR over ' + b.trades + ' trades, expectancy $' + b.expectancy + '/trade');
    for (const p of b.works.slice(0, 3)) {
      lines.push('   WORKS - ' + p.value + ': ' + p.winRate + '% (' + p.wins + '/' + p.trades +
        ' over ' + p.distinctDays + ' days, +' + p.edgeVsPair + 'pp vs this pair)');
    }
    for (const p of b.fails.slice(0, 3)) {
      lines.push('   FAILS - ' + p.value + ': ' + p.winRate + '% (' + p.wins + '/' + p.trades +
        ' over ' + p.distinctDays + ' days, ' + p.edgeVsPair + 'pp vs this pair)');
    }
  }
  return lines.join('\n');
}
