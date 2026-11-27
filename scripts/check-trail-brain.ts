/**
 * Trail Brain verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-trail-brain.ts
 *
 * No database and no broker are touched: the real-time decision, the
 * clamps and the learning adjustment are pure and are walked across
 * their thresholds, and the wiring is pinned by source checks — the
 * safety invariants the feature is built on:
 *
 *   A. trailBrainDecide — arm / floor / lock-step / exit math.
 *   B. The stop NEVER widens: the floor is clamped at the trade's
 *      original stop for every input, including hostile ones.
 *   C. Clamps — learned parameters cannot leave their hard bounds.
 *   D. adjustTrailBrainParams — tighten / loosen / dormant / watch.
 *   E. Kill switches — master + per-engine env switches.
 *   F. Fail-open runtime pins — with no reachable database the consult
 *      resolves null (no governing), the ensures resolve, and the
 *      evidence read resolves null. (Relies on the repo's localhost DB
 *      fallback refusing connections — run with DATABASE_URL unset.)
 *   G. Source pins — Sol strategy-only keying, guards-win ordering,
 *      the FX stop-hold gate, exit-only core, attribution stamps at
 *      every adapter, panel + routes + boot wiring, sw version.
 */
import { readFileSync } from 'node:fs';
import {
  trailBrainDecide, trailBrainStopPrice, clampTrailBrainParams, defaultTrailBrainParams,
  adjustTrailBrainParams, trailBrainOn, trailBrainConsult, ensureTrailBrainColumns,
  type TrailBrainParams, type TrailBrainEvidence,
} from '../server/services/trail-brain';
import { trailBrainGroupEvidence } from '../server/services/trail-brain-learning';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

const P = (over: Partial<TrailBrainParams>): TrailBrainParams => ({
  activation: 1, trailDist: 0.75, giveBackCap: 1, lockSteps: [], ...over,
});

// ── A. Decision math ─────────────────────────────────────────────────────
{
  const d = trailBrainDecide(P({}), { peak: 0.9, current: 0.9, stopFloor: -1 });
  check('A1 below activation: not armed, floor at the original stop, no exit', !d.armed && d.floor === -1 && !d.exitNow && !d.binding);
}
{
  const d = trailBrainDecide(P({}), { peak: 2, current: 1.6, stopFloor: -1 });
  check('A2 armed: floor = peak − trailDist', d.armed && d.floor === 1.25 && !d.exitNow && d.binding);
}
{
  const d = trailBrainDecide(P({ trailDist: 1.5, giveBackCap: 0.6 }), { peak: 2, current: 1.6, stopFloor: -1 });
  check('A3 give-back cap binds when tighter than the trail distance', d.floor === 1.4 && d.exitNow === false);
}
{
  const d = trailBrainDecide(P({ lockSteps: [{ atPeak: 2, lock: 0.5 }, { atPeak: 3, lock: 1.5 }] }), { peak: 3.2, current: 2.6, stopFloor: -1 });
  check('A4 lock steps raise the floor past the trail distance', d.floor === 2.45);
}
{
  const d = trailBrainDecide(P({}), { peak: 2, current: 1.25, stopFloor: -1 });
  check('A5 exit fires at exactly the floor', d.exitNow === true);
  const d2 = trailBrainDecide(P({}), { peak: 2, current: 1.26, stopFloor: -1 });
  check('A6 no exit a hair above the floor', d2.exitNow === false);
}

// ── B. The stop never widens ─────────────────────────────────────────────
{
  const d = trailBrainDecide(P({ activation: 0.5, trailDist: 1.5, giveBackCap: 2 }), { peak: 0.5, current: 0.4, stopFloor: -1 });
  check('B1 raw floor below the original stop is clamped to it (not binding)', d.floor === -1 && !d.binding && !d.exitNow);
}
{
  let ok = true;
  for (const peak of [0, 0.5, 1, 2, 5, 50, 1e6]) {
    for (const dist of [0.3, 0.75, 1.5, 100]) {
      const d = trailBrainDecide(P({ activation: 0.5, trailDist: dist, giveBackCap: dist }), { peak, current: -50, stopFloor: -1 });
      if (d.floor < -1) ok = false;
    }
  }
  check('B2 floor ≥ stopFloor across a hostile input sweep', ok);
}
{
  const d = trailBrainDecide(P({}), { peak: NaN, current: 1, stopFloor: -1 });
  check('B3 NaN inputs degrade to a no-op decision', !d.armed && d.floor === -1 && !d.exitNow);
}
{
  const long = trailBrainStopPrice({ direction: 'long', entryPrice: 100, peakGainPct: 20, currentGainPct: 18, slPct: 4, params: { activation: 15, trailDist: 6, giveBackCap: 10, lockSteps: [] } });
  check('B4 long trailed stop price = entry × (1 + floor%)', long != null && Math.abs(long.stopPrice - 114) < 1e-9, long ? `stop ${long.stopPrice}` : 'null');
  const short = trailBrainStopPrice({ direction: 'short', entryPrice: 100, peakGainPct: 20, currentGainPct: 18, slPct: 4, params: { activation: 15, trailDist: 6, giveBackCap: 10, lockSteps: [] } });
  check('B5 short trailed stop price mirrors', short != null && Math.abs(short.stopPrice - 86) < 1e-9, short ? `stop ${short.stopPrice}` : 'null');
  const none = trailBrainStopPrice({ direction: 'long', entryPrice: 100, peakGainPct: 10, currentGainPct: 9, slPct: 4, params: { activation: 15, trailDist: 6, giveBackCap: 10, lockSteps: [] } });
  check('B6 below activation → no trailed stop', none === null);
}

// ── C. Clamps ────────────────────────────────────────────────────────────
for (const e of ['crypto', 'fx', 'sol', 'kalshi'] as const) {
  const wild = clampTrailBrainParams(e, { activation: 999, trailDist: -5, giveBackCap: 0, lockSteps: [{ atPeak: 9999, lock: 9999 }] });
  const c = clampTrailBrainParams(e, defaultTrailBrainParams(e));
  const d = defaultTrailBrainParams(e);
  check(`C-${e} wild parameters are forced inside the clamps`,
    wild.activation < 999 && wild.trailDist > 0 && wild.lockSteps.every(s => s.lock < s.atPeak));
  check(`C-${e} defaults survive clamping unchanged`,
    c.activation === d.activation && c.trailDist === d.trailDist && c.giveBackCap === d.giveBackCap);
}

// ── D. Learning adjustment ───────────────────────────────────────────────
const EV = (over: Partial<TrailBrainEvidence>): TrailBrainEvidence => ({
  brainTrades: 20, brainAvgFinal: 0.5, brainAvgGiveback: 0.6,
  baseTrades: 20, baseAvgFinal: 0.4, baseAvgGiveback: 1.1, ...over,
});
{
  const a = adjustTrailBrainParams('crypto', defaultTrailBrainParams('crypto'), EV({ brainTrades: 9 }));
  check('D1 below the evidence bar → watch, no change', a.action === 'none');
}
{
  const a = adjustTrailBrainParams('crypto', defaultTrailBrainParams('crypto'), EV({ brainAvgGiveback: 1.4 }));
  check('D2 give-back over the cap → tighten one step', a.action === 'tighten' && a.action !== 'none' && (a as any).params.trailDist < defaultTrailBrainParams('crypto').trailDist);
}
{
  const a = adjustTrailBrainParams('crypto', defaultTrailBrainParams('crypto'), EV({ brainAvgFinal: 0.1, brainAvgGiveback: 0.5 }));
  check('D3 brain closes worse than baseline by the harm delta → loosen', a.action === 'loosen' && (a as any).params.trailDist > defaultTrailBrainParams('crypto').trailDist);
}
{
  const loosest = clampTrailBrainParams('crypto', { activation: 3, trailDist: 1.5, giveBackCap: 2, lockSteps: [] });
  const a = adjustTrailBrainParams('crypto', loosest, EV({ brainAvgFinal: -0.5, brainAvgGiveback: 0.5 }));
  check('D4 still hurting at the loosest clamps → dormant, never looser', a.action === 'dormant');
}
{
  const a = adjustTrailBrainParams('crypto', defaultTrailBrainParams('crypto'), EV({}));
  check('D5 helping (give-back down, closes not worse) → squeeze half a step', a.action === 'tighten');
}
{
  const a = adjustTrailBrainParams('sol', defaultTrailBrainParams('sol'), EV({ brainAvgFinal: 2, brainAvgGiveback: 14, baseAvgFinal: 1, baseAvgGiveback: 9 }));
  check('D6 Sol % units: excess give-back tightens in % steps', a.action === 'tighten' && (a as any).params.trailDist === defaultTrailBrainParams('sol').trailDist - 1);
}

// ── E. Kill switches ─────────────────────────────────────────────────────
check('E1 brain on by default', trailBrainOn() === true && trailBrainOn('fx') === true);
process.env.TRAIL_BRAIN_FX = 'off';
check('E2 per-engine switch stops only that engine', trailBrainOn('fx') === false && trailBrainOn('crypto') === true);
delete process.env.TRAIL_BRAIN_FX;
process.env.TRAIL_BRAIN = 'off';
check('E3 master switch stops every engine', trailBrainOn() === false && trailBrainOn('sol') === false);
delete process.env.TRAIL_BRAIN;

// ── G. Source pins ───────────────────────────────────────────────────────
const core = src('../server/services/trail-brain.ts');
const learning = src('../server/services/trail-brain-learning.ts');
const scanner = src('../server/services/cryptocom-scanner.ts');
const fx = src('../server/services/live-trading-engine.ts');
const solEngine = src('../server/services/sol-engine.ts');
const follower = src('../server/services/sol-follower.ts');
const cryptoShadow = src('../server/services/crypto-shadow.ts');
const kalshiShadow = src('../server/services/kalshi-stock-shadow.ts');
const kalshiLive = src('../server/services/kalshi-perp-live.ts');
const tlSync = src('../server/services/tradelocker-sync.ts');
const routes = src('../server/routes.ts');
const index = src('../server/index.ts');
const panel = src('../client/src/components/engine-safeguards-panel.tsx');
const sw = src('../client/public/sw.js');

check('G1 Sol consult takes NO symbol — strategy-keyed by construction',
  /export async function trailBrainSolConsult\(userId: number, strategyId: string \| null \| undefined\)/.test(core)
  && !/trailBrainConsult\(userId, 'sol', [^)]*symbol/.test(solEngine + follower));
check('G2 follower consults as ONE lane group (never per token/wallet)',
  /trailBrainSolConsult\(Number\(pos\.user_id\), 'sol_follower'\)/.test(follower));
check('G3 crypto perps: the brain is consulted only when NO guard governs',
  /if \(!tgGuard\) \{\s*\n\s*brainConsult = await trailBrainConsult/.test(scanner));
check('G4 FX: the stop-hold gate runs before the brain decision',
  /if \(currentR < stopHoldUntilR\(userId\)\) continue;[\s\S]{0,600}?trailBrainDecide/.test(fx));
check('G5 FX: brain stops dispatch through the shared applyFxTrailStop path',
  /await applyFxTrailStop\(userId, pos, brainSL, 'Trail Brain'/.test(fx)
  && /await applyFxTrailStop\(userId, pos, newSL, methodLabel/.test(fx));
check('G6 Sol paper + shadow: brain consulted only when no guard governs (2 sites)',
  (solEngine.match(/if \(!tgGuard\) \{\s*\n\s*const tb = await trailBrainSolConsult/g) || []).length === 2);
check('G7 core is exit-only: it dispatches no order, close, or entry itself',
  !/executeSignal|broadcastMT5Signal|sendMarginOrderIntent|closePosition\(|placeOrder/.test(core));
check('G8 attribution stamps fire at every adapter',
  /stampTrailBrainTrade\('cryptocom_engine_trades'/.test(scanner)
  && /stampTrailBrainTrade\('crypto_shadow_trades'/.test(cryptoShadow)
  && /stampTrailBrainTrade\('kalshi_perp_shadow_trades'/.test(kalshiShadow)
  && /stampTrailBrainTrade\('kalshi_perp_live_trades'/.test(kalshiLive)
  && /stampTrailBrainTrade\('sol_follower_positions'/.test(follower)
  && /trailBrainVersion: pos\.trailBrainVersion/.test(solEngine)
  && /trail_brain_version, trail_brain_group\)/.test(tlSync));
check('G9 Kalshi live: entry gates untouched (brain lives in the exit monitor only)',
  /perpLiveEnabled\(\)/.test(kalshiLive) && /getKalshiMarginEnabled/.test(kalshiLive)
  && (kalshiLive.match(/await trailBrainConsult/g) || []).length === 1);
check('G10 learning writes adjustments through the store with a version bump + dormant state',
  /g\.version \+= 1/.test(learning) && /g\.status = 'dormant'/.test(learning) && /saveTrailBrainStore\(userId, store\)/.test(learning));
check('G11 learning evidence for Sol follower reads its own positions table',
  /FROM sol_follower_positions/.test(learning) && /g\.strategy === 'sol_follower'/.test(learning));
check('G12 routes + panel + boot wiring present',
  /app\.get\("\/api\/engine\/trail-brain"/.test(routes)
  && /app\.post\("\/api\/engine\/trail-brain\/engine"/.test(routes)
  && /app\.post\("\/api\/engine\/trail-brain\/reset"/.test(routes)
  && /TrailBrainSection/.test(panel) && /\/api\/engine\/trail-brain/.test(panel)
  && /startTrailBrainLearning\(\)/.test(index));
check('G13 sw bumped for the client change', sw.includes("CACHE_VERSION = 'vedd-v300'"));
check('G14 stamp-column ensures are non-rejecting + memoized (2026-11-13 pattern)',
  /stamp-column ensure failed for \$\{table\} \(non-fatal, will retry\)/.test(core) && /_colsEnsured\.delete\(table\)/.test(core));
check('G15 FX brain respects the engine master trailing switch',
  /if \(!state\.config\.trailingStopEnabled\) return;/.test(fx.slice(fx.indexOf('applyTrailBrainFx'))));
check('G16 DeFi brain block honors CRYPTO_TRAIL=off like the spot trail it extends',
  /process\.env\.CRYPTO_TRAIL !== 'off' && Number\(trade\.stopLoss\) > 0/.test(scanner));

// ── F. Fail-open runtime pins (no reachable database) ────────────────────
(async () => {
  const consult = await trailBrainConsult(999999, 'crypto', 'check', 'check').then(v => (v === null ? 'null' : 'consult'), () => 'rejected');
  check('F1 consult with an unreadable store resolves null — no governing', consult === 'null', consult);
  let f2 = true;
  try { await ensureTrailBrainColumns('cryptocom_engine_trades'); await ensureTrailBrainColumns('cryptocom_engine_trades'); }
  catch { f2 = false; }
  check('F2 stamp-column ensure resolves (never rejects), repeatedly', f2);
  const ev = await trailBrainGroupEvidence(999999, {
    key: 'crypto|check|check', engine: 'crypto', strategy: 'check', condition: 'check', unit: 'R',
    params: defaultTrailBrainParams('crypto'), version: 1, status: 'active', evidence: null,
    lastAdjustment: null, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  }).then(v => (v === null ? 'null' : 'value'), () => 'rejected');
  check('F3 evidence read degrades fail-open (resolves null, never rejects)', ev === 'null', ev);

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
