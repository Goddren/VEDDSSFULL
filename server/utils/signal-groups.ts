// ─────────────────────────────────────────────────────────────────────────────
// Collapse fan-out fills into SIGNALS.
//
// One engine signal is sent to every active account, so a single setup closes
// as 3–5 rows. Learning statistics (win rates, block thresholds) must count the
// SETUP once: counting fills made one bad trade look like four, pushed pairs,
// sessions and hours under their win-rate floors several times faster, and
// blocked them on a fraction of the real evidence. Measured 2026-10-04: the FX
// brain held 297 rows for only 199 actual signals.
//
// A group = same instrument + same direction, entered within WINDOW_MS of the
// group's first fill. Its result is the majority of the fills' results (ties go
// to the sign of the summed P&L), and its P&L is the AVERAGE fill — one trade's
// worth, not the sum across accounts.
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_MS = Number(process.env.SIGNAL_GROUP_WINDOW_MS ?? 180_000);

export interface FillLike {
  symbol: string;
  direction: string;
  result: string;          // 'WIN' | 'LOSS' (others ignored by callers)
  pnl: number;
  entryMs: number;         // entry time in ms
}

export function normSymbol(v: any): string {
  return String(v ?? '').split('.')[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Groups fills into signals. Returns one representative per signal: the first
 * fill's other fields are kept (session, hour, adx … are the same setup), with
 * `result`, `pnl` and `fills` replaced by the group's values.
 */
export function collapseToSignals<T extends FillLike>(fills: T[]): (T & { fills: number })[] {
  const sorted = [...fills].sort((a, b) => a.entryMs - b.entryMs);
  const open = new Map<string, { start: number; rows: T[] }>();
  const groups: T[][] = [];
  for (const f of sorted) {
    const key = normSymbol(f.symbol) + '|' + String(f.direction || '').toUpperCase();
    const g = open.get(key);
    if (g && f.entryMs - g.start <= WINDOW_MS) { g.rows.push(f); continue; }
    const fresh = { start: f.entryMs, rows: [f] };
    open.set(key, fresh);
    groups.push(fresh.rows);
  }
  return groups.map((rows) => {
    const wins = rows.filter((r) => r.result === 'WIN').length;
    const losses = rows.filter((r) => r.result === 'LOSS').length;
    const sum = rows.reduce((s, r) => s + (Number(r.pnl) || 0), 0);
    const result = wins > losses ? 'WIN' : losses > wins ? 'LOSS' : (sum > 0 ? 'WIN' : 'LOSS');
    return { ...rows[0], result, pnl: sum / rows.length, fills: rows.length };
  });
}
