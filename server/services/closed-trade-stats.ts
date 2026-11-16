// closed-trade-stats.ts — ONE definition of a closed-trade summary, shared by
// /api/mt5/daily-summary (the canonical daily/weekly numbers) and
// /api/weekly-strategy/update-progress (which persists the weekly-strategy
// progress the dashboard and goal cards read). The two endpoints used to
// filter and count the same trades independently — different DB limits
// (500 vs 5000) and different day boundaries (UTC vs local midnight) — so the
// same day showed different P&L and trade counts on different pages.
//
// Semantics (identical to what daily-summary has always done):
//   DB rows    — win/loss by `result` ('WIN' / 'LOSS'); P&L from profitLoss.
//   Cache rows — win/loss by the sign of `profit`; P&L from profit.
//   flat       — the residual: trades − wins − losses (breakeven rows and
//                cache rows that closed at exactly $0). Naming it is what
//                makes wins + losses + flat = trades on every surface.
export interface ClosedTradeSummary {
  trades: number;
  wins: number;
  losses: number;
  flat: number;
  pnl: number;
}

export function summarizeClosed(dbRows: any[], cacheRows: any[]): ClosedTradeSummary {
  let wins = 0;
  let losses = 0;
  let pnl = 0;
  for (const t of dbRows || []) {
    pnl += t.profitLoss || 0;
    if (t.result === "WIN") wins++;
    else if (t.result === "LOSS") losses++;
  }
  for (const t of cacheRows || []) {
    const p = t.profit || 0;
    pnl += p;
    if (p > 0) wins++;
    else if (p < 0) losses++;
  }
  const trades = (dbRows?.length || 0) + (cacheRows?.length || 0);
  return { trades, wins, losses, flat: trades - wins - losses, pnl };
}
