// ─────────────────────────────────────────────────────────────────────────────
// Tolerant lookup into the brain's per-pair knowledge.
//
// WHY: every consumer indexed it with an exact string —
//
//     brain.pairKnowledge[symbol]
//
// while brokers hand us 'XAUUSD.PRO', 'GBP/JPY' and 'EURUSD.m' for the same
// instruments the brain keys as 'XAUUSD', 'GBPJPY', 'EURUSD'. A miss is not an
// error: the expression is `undefined`, the guard above it reads
// `if (k && k.totalTrades >= 3)`, and the ENTIRE gate silently does nothing.
// That is the quietest possible failure and it is exactly how Gate 2e went its
// whole lifetime without blocking a single trade.
//
// Both fx_brain_outcomes and ai_trade_results genuinely contain suffixed
// symbols, so this is a live defect, not a defensive nicety.
// ─────────────────────────────────────────────────────────────────────────────

/** 'XAUUSD.PRO' -> 'XAUUSD', 'GBP/JPY' -> 'GBPJPY'. */
export function basePairKey(symbol: any): string {
  return String(symbol ?? '').split('.')[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Find a pair's knowledge however its symbol is spelled.
 * Exact match first (cheapest and most common), then base-key match.
 */
export function lookupPairKnowledge(pairKnowledge: any, symbol: any): any {
  if (!pairKnowledge || !symbol) return undefined;
  const direct = pairKnowledge[symbol];
  if (direct) return direct;
  const want = basePairKey(symbol);
  if (!want) return undefined;
  for (const k of Object.keys(pairKnowledge)) {
    if (basePairKey(k) === want) return pairKnowledge[k];
  }
  return undefined;
}
