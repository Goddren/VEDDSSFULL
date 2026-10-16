// Confidence of the engine signal that opened a position, for trade-result rows
// created by the position syncs (TradeLocker / MT5 EA). Those rows used to be
// written with 0 and later stamped by the chart-data back-fill with whatever
// the NEXT chart-data AI check returned (often the 75 cap constant), so an
// engine trade taken at 90% was recorded as 75%.

import { pool } from '../db';

/** Most recent engine OPEN signal for this symbol/direction in the last 30 min, else null. */
export async function lookupSignalConfidence(userId: number, symbol: string, direction: string): Promise<number | null> {
  try {
    const sym = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!sym) return null;
    const { rows } = await pool.query(
      `SELECT confidence FROM mt5_signal_logs
        WHERE user_id = $1 AND action = 'OPEN' AND upper(direction) = $2
          AND upper(regexp_replace(symbol, '[^A-Za-z0-9]', '', 'g')) = left($3, length(upper(regexp_replace(symbol, '[^A-Za-z0-9]', '', 'g'))))
          AND source = 'vedd_live_engine' AND confidence IS NOT NULL
          AND created_at > now() - interval '30 minutes'
        ORDER BY created_at DESC LIMIT 1`,
      [userId, String(direction || '').toUpperCase(), sym],
    );
    const c = Number(rows[0]?.confidence);
    return Number.isFinite(c) && c > 0 ? c : null;
  } catch {
    return null;
  }
}
