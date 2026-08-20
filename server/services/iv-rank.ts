// Self-building IV Rank for the options engine.
//
// There's no external historical-IV feed here, so the engine records one ATM
// implied-vol snapshot per underlying per day (whenever a chain is fetched) into
// options_iv_history, and computes IV Rank from the trailing ~1 year:
//
//   IV Rank = (currentIV − min1yr) / (max1yr − min1yr) × 100
//
// This is the standard tastytrade-style measure: where today's IV sits between
// its 1-year low and high. High IV Rank = premium is rich relative to this
// name's own history → the moment to SELL premium. Until enough days accrue the
// caller falls back to an absolute IV floor.

import { pool } from '../db';

const IV_WINDOW_DAYS = 365;
export const MIN_IV_SAMPLES = 20; // below this, IV Rank isn't trustworthy — caller falls back

// In-process guard so we upsert at most once per symbol per UTC day even if the
// chain is fetched many times a day (cheap; the DB upsert is idempotent anyway).
const _recordedToday = new Map<string, string>(); // symbol -> 'YYYY-MM-DD'

function todayUtc(): string { return new Date().toISOString().slice(0, 10); }

/** Record today's ATM IV snapshot for an underlying (idempotent per UTC day). */
export async function recordDailyIv(underlyingSymbol: string, iv: number): Promise<void> {
  if (!isFinite(iv) || iv <= 0) return;
  const day = todayUtc();
  if (_recordedToday.get(underlyingSymbol) === day) return;
  _recordedToday.set(underlyingSymbol, day);
  try {
    await pool.query(
      `INSERT INTO options_iv_history (underlying_symbol, iv, observed_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (underlying_symbol, observed_date)
       DO UPDATE SET iv = EXCLUDED.iv`,
      [underlyingSymbol, iv, day]
    );
  } catch (err: any) {
    console.error('[IV Rank] recordDailyIv failed (non-fatal):', err?.message ?? err);
  }
}

export interface IvRankResult {
  ivRank: number | null;   // 0-100, or null when insufficient history
  samples: number;
  min: number | null;
  max: number | null;
  currentIv: number;
}

/** Compute IV Rank for an underlying from the trailing ~1yr of daily snapshots. */
export async function getIvRank(underlyingSymbol: string, currentIv: number): Promise<IvRankResult> {
  let rows: Array<{ iv: string | number }> = [];
  try {
    const { rows: r } = await pool.query(
      `SELECT iv FROM options_iv_history
       WHERE underlying_symbol = $1 AND observed_date >= (CURRENT_DATE - $2::int)`,
      [underlyingSymbol, IV_WINDOW_DAYS]
    );
    rows = r;
  } catch (err: any) {
    console.error('[IV Rank] getIvRank read failed (defaulting to no-data):', err?.message ?? err);
  }

  const vals = rows.map(r => (typeof r.iv === 'number' ? r.iv : parseFloat(r.iv))).filter(v => isFinite(v) && v > 0);
  // Include the live reading so a fresh high/low is reflected immediately.
  if (isFinite(currentIv) && currentIv > 0) vals.push(currentIv);
  if (vals.length < MIN_IV_SAMPLES) {
    return { ivRank: null, samples: vals.length, min: null, max: null, currentIv };
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const ivRank = max > min ? Math.round(((currentIv - min) / (max - min)) * 100) : 50;
  return { ivRank: Math.max(0, Math.min(100, ivRank)), samples: vals.length, min, max, currentIv };
}
