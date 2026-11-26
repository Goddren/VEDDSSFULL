/**
 * Fan-out per-account risk — pure decisions for the chart-data route's
 * TradeLocker fan-out (POST /api/mt5/chart-data in server/routes.ts).
 *
 * Why this module exists (Nov 25, 2026): the fan-out was approved to be
 * re-enabled (CHART_DATA_AUTOTRADE_ENABLED=true, the owner's Render tap)
 * while the MT5 source account is a $500K DEMO. The signal-level gates
 * (Gate 0 family) judge the MT5 account the EA posts from — a demo balance
 * must never size, wave through, or margin a real prop account. The fan-out
 * loop already judged each connection's 5% per-trade cap, daily loss,
 * exposure and consistency against the account's OWN equity; this module
 * closes the three gaps that remained:
 *
 *   1. RESIDUAL SIZING copied the MT5 lot lot-for-lot. The sizing cascade
 *      (risk-% → proportional → TL-direct) only fires for those modes; with
 *      copyMode='multiplier' (or any non-proportional mode without risk-%),
 *      the connection silently received `tradeVolume` — the lot sized on
 *      the $500K source. Here the residual branch sizes from the
 *      connection's OWN equity at its own risk % instead, and returns
 *      lot=null (skip the account, fail closed) when no own-balance size
 *      can be derived.
 *   2. The in-loop volatile-pair ceiling was computed from the SOURCE
 *      balance. `fanoutVolatileCapLot` is the same table/formula
 *      parameterized by the DESTINATION account's balance.
 *   3. No margin judgment existed anywhere in the fan-out: an order's
 *      margin requirement was never compared with the account's own free
 *      margin. `estimateFanoutMarginUsd` + the route-side gate compare the
 *      requirement (at a conservative assumed leverage) against the free
 *      margin TradeLocker reports for THAT account.
 *
 * Kill switch: FANOUT_PER_ACCOUNT_RISK=off reverts all three behaviors to
 * the pre-existing ones (residual branch copies the MT5 lot exactly, as
 * before; the route skips the own-balance volatile cap and the margin
 * gate). The master fan-out switch is unchanged and NOT in this module:
 * with CHART_DATA_AUTOTRADE_ENABLED unset/false the fan-out block is
 * never entered at all.
 *
 * This module is pure (env passed in, no I/O) so the decisions can be
 * pinned by scripts/check-fanout-per-account-risk.ts.
 */

export interface FanoutSizingInput {
  /** Live-engine copy mode for this user: 'proportional' | 'multiplier'. */
  copyMode: string;
  /** Connection's own risk-% sizing toggle (DB column / sidecar). */
  useRiskPercent: boolean;
  /** Connection's configured risk % (used by risk-% and fallback sizing). */
  riskPercent: number;
  /** Connection's OWN equity (live TradeLocker read); null when unreadable. */
  tlEquity: number | null;
  /** MT5 source account balance (the reference for proportional mode). */
  mt5RefBalance: number;
  /** The MT5 lot for this signal (tradeVolume) — the proportional base. */
  mt5Lot: number;
  /** Stop distance in pips (0 when no usable SL distance). */
  slPips: number;
  /** True when the symbol has a known pip size (drives 20-pip defaults). */
  pipSizeKnown: boolean;
  /** $ value of 1 pip for 1 lot on this symbol. */
  pipValue: number;
  /** Kill-switch state: FANOUT_PER_ACCOUNT_RISK !== 'off'. */
  perAccountRiskEnabled: boolean;
  /** For log lines. */
  accountId: string;
}

export interface FanoutSizingLog {
  level: 'log' | 'warn';
  text: string;
}

export interface FanoutSizingResult {
  /** null ONLY from the new fallback when no own-balance size is derivable
   *  — the route treats null as "skip this account" (fail closed). */
  lot: number | null;
  label: string;
  logs: FanoutSizingLog[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** lots = (equity × risk%) / (slPips × pipValue), floored at the 0.01 min. */
function riskLot(equity: number, riskPercent: number, slPips: number, pipValue: number): number {
  const riskUsd = equity * (riskPercent / 100);
  return Math.max(0.01, round2(riskUsd / (slPips * pipValue)));
}

/**
 * The fan-out sizing cascade — a faithful port of the inline cascade that
 * lived in the chart-data route, with ONE behavioral change: the residual
 * branch (copyMode not 'proportional', risk-% not in play). With the
 * per-account gate ON and a readable own equity, it sizes from the
 * account's own equity at its risk % (defaulting to 1% when the
 * connection carries no positive riskPercent — the same default the
 * TL-direct branch uses); with the gate OFF it reproduces the historical
 * exact-copy behavior byte-for-byte.
 */
export function sizeFanoutAccountLot(input: FanoutSizingInput): FanoutSizingResult {
  const {
    copyMode, useRiskPercent, riskPercent, tlEquity, mt5RefBalance,
    mt5Lot, slPips, pipValue, pipSizeKnown, perAccountRiskEnabled, accountId,
  } = input;
  const logs: FanoutSizingLog[] = [];
  let lot: number | null = mt5Lot;
  let label = 'exact MT5 copy';

  if (useRiskPercent && tlEquity) {
    if (slPips > 0 && pipValue > 0) {
      lot = riskLot(tlEquity, riskPercent, slPips, pipValue);
      label = `risk ${riskPercent}% of $${tlEquity.toLocaleString()}`;
    } else if (pipValue > 0) {
      // No SL — default 20-pip assumption so large accounts still get proper size
      lot = riskLot(tlEquity, riskPercent, 20, pipValue);
      label = `risk ${riskPercent}% of $${tlEquity.toLocaleString()} (default 20pip)`;
    }
    // pipValue unavailable: historically the lot stayed the MT5 lot here and
    // the per-trade cap below judged it against this account's equity.
  } else if (copyMode === 'proportional' && tlEquity && mt5RefBalance > 0) {
    const ratio = tlEquity / mt5RefBalance;
    lot = Math.max(0.01, round2(mt5Lot * ratio));
    label = `proportional ${ratio.toFixed(2)}× ($${tlEquity.toLocaleString()}/$${mt5RefBalance.toLocaleString()})`;
    logs.push({ level: 'log', text: `[ProportionalSizing] ${accountId}: base=${mt5Lot} × (${tlEquity}/${mt5RefBalance}) = ${lot} lots` });
  } else if (copyMode === 'proportional' && tlEquity && tlEquity > 0) {
    // No MT5 reference balance (MT5 EA not connected) — size directly from
    // TL equity using risk-% or a sensible default (1%).
    const fbRiskPct = riskPercent > 0 ? riskPercent : 1.0;
    const fbSlPips = slPips > 0 ? slPips : (pipSizeKnown ? 20 : 0);
    if (fbSlPips > 0 && pipValue > 0) {
      lot = riskLot(tlEquity, fbRiskPct, fbSlPips, pipValue);
      label = `TL-direct risk ${fbRiskPct}% of $${tlEquity.toLocaleString()} (no MT5 ref)`;
      logs.push({ level: 'log', text: `[ProportionalSizing] ${accountId}: no MT5 ref → TL risk-based ${lot} lots (${fbRiskPct}% of $${tlEquity})` });
    } else {
      logs.push({ level: 'warn', text: `[ProportionalSizing] ${accountId}: pip values unavailable — using base lot ${mt5Lot}` });
    }
  } else if (copyMode === 'proportional') {
    logs.push({ level: 'warn', text: `[ProportionalSizing] ${accountId}: could not size proportionally (TL value=${tlEquity}, MT5 ref=${mt5RefBalance}) — using exact MT5 lot ${mt5Lot}` });
  } else if (perAccountRiskEnabled && tlEquity && tlEquity > 0) {
    // RESIDUAL — the fix. copyMode is not 'proportional' (e.g. 'multiplier')
    // and risk-% sizing is off: historically connLot stayed the MT5 lot,
    // copied lot-for-lot from an order sized on the SOURCE account (now a
    // $500K demo). Size from THIS account's own equity at its own risk %
    // instead. The connection's lotMultiplier is deliberately NOT applied:
    // a multiplier of the source lot is still a copy of the source lot.
    const fbRiskPct = riskPercent > 0 ? riskPercent : 1.0;
    const fbSlPips = slPips > 0 ? slPips : (pipSizeKnown ? 20 : 0);
    if (fbSlPips > 0 && pipValue > 0) {
      lot = riskLot(tlEquity, fbRiskPct, fbSlPips, pipValue);
      label = `own-risk ${fbRiskPct}% of $${tlEquity.toLocaleString()} (fan-out fallback — MT5 lot not copied)`;
      logs.push({ level: 'log', text: `[FanoutRisk] ${accountId}: copyMode=${copyMode} does not size this account — sized from its own equity instead: ${lot} lots (${fbRiskPct}% of $${tlEquity})` });
    } else {
      lot = null;
      label = 'own-risk fallback unavailable';
      logs.push({ level: 'warn', text: `[FanoutRisk] ${accountId}: cannot derive an own-balance size (pip model unavailable) — account will be skipped rather than handed the MT5 lot ${mt5Lot}` });
    }
  }
  // Residual with the gate OFF, or with no readable own equity: lot stays
  // the MT5 lot exactly as before. (With no readable equity the route's
  // per-trade cap block below skips the account — fail closed, unchanged.)

  return { lot, label, logs };
}

/**
 * Volatile-pair lot ceiling for a given account balance — the SAME table
 * and 1.5%-risk formula the chart-data route applies pre-loop to the MT5
 * SOURCE balance (`maxLot = (balance × 1.5%) / (minSlPips × slBreath ×
 * pipValue)`), parameterized so the fan-out can ALSO apply it against
 * each destination account's own balance. Returns null for symbols the
 * table does not cover, and when no pip value is available (the route's
 * per-trade 5% cap remains the binding check in that case).
 */
export function fanoutVolatileCapLot(symbol: string, balance: number, pipValue: number): number | null {
  const s = (symbol || '').toUpperCase();
  const spec =
    (s.includes('XAU') || s.includes('GOLD')) ? { minSlPips: 500, slBreath: 1.5 } :
    (s.includes('BTC') || s.includes('XBT')) ? { minSlPips: 500, slBreath: 2.0 } :
    (s.includes('US30') || s.includes('DOW') || s.includes('WALLST')) ? { minSlPips: 300, slBreath: 1.5 } :
    (s.includes('NAS100') || s.includes('USTEC') || s.includes('US100')) ? { minSlPips: 300, slBreath: 1.5 } :
    (s.includes('US500') || s.includes('SPX')) ? { minSlPips: 300, slBreath: 1.5 } :
    null;
  if (!spec) return null;
  if (!(pipValue > 0)) return null;
  if (!(balance > 0)) return 0.10; // mirrors the route's _calcEaVolMax floor case
  const maxRisk = balance * 0.015;
  const slRiskPerLot = spec.minSlPips * spec.slBreath * pipValue;
  return Math.max(0.01, Math.floor((maxRisk / slRiskPerLot) * 100) / 100);
}

/** Kill switch: FANOUT_PER_ACCOUNT_RISK=off reverts the three behaviors. */
export function fanoutPerAccountRiskEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.FANOUT_PER_ACCOUNT_RISK !== 'off';
}

/**
 * Assumed leverage for the margin estimate. Deliberately conservative:
 * TradeLocker prop accounts commonly run 1:100, but the estimate uses 50
 * unless FANOUT_ASSUMED_LEVERAGE overrides it, so the gate errs toward
 * requiring MORE free margin than the broker will, never less. (Mirrors
 * the KALSHI_PERP_LIVE_ASSUMED_LEVERAGE precedent from PR #117.)
 */
export function fanoutAssumedLeverage(env: NodeJS.ProcessEnv): number {
  const n = Number(env.FANOUT_ASSUMED_LEVERAGE ?? 50);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

/**
 * Estimated margin the broker will require for an order:
 * notional / leverage, notional = lots × contractSize × price.
 * contractSize comes from TradeLockerService.contractSize (FX 100000,
 * XAU 100, indices 1 = per-unit notional at price). Returns null when any
 * input is unusable — the route treats null as fail-closed (skip).
 */
export function estimateFanoutMarginUsd(input: {
  lots: number;
  contractSize: number;
  price: number;
  leverage: number;
}): number | null {
  const { lots, contractSize, price, leverage } = input;
  if (!(lots > 0) || !(contractSize > 0) || !(price > 0) || !(leverage > 0)) return null;
  return (lots * contractSize * price) / leverage;
}

/** Durable tl_skip reason for the margin gate (mt5_confirm_diag.tl_skip). */
export function fanoutMarginSkipReason(accountId: string, requiredUsd: number, freeUsd: number): string {
  return `RISK SKIP: ${accountId} — per-account risk: needs $${requiredUsd.toFixed(2)} margin, account has $${freeUsd.toFixed(2)} free.`;
}
