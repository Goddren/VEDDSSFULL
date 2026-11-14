// ─────────────────────────────────────────────────────────────────────────────
// Earnings calendar for the Kalshi stock-perp SHADOW lane (2026-11-13,
// build #3). Replaces the lane's hardcoded `earnings_within_48h = NULL`
// stub — until now the context column existed but no source ever fed it.
//
// SOURCE: Nasdaq's public earnings-calendar API
// (https://api.nasdaq.com/api/calendar/earnings?date=YYYY-MM-DD) — the
// same unauthenticated JSON that powers nasdaq.com's calendar pages. It
// needs NO key and NO account. It is UNOFFICIAL (not a contracted data
// feed): it can change shape or go down without notice, so everything
// here treats a failed or malformed fetch as UNKNOWN, never as "no
// earnings" — see the lookup contract below.
//
// CACHE DISCIPLINE: at most ONE fetch cycle per ET calendar day. A cycle
// fetches the calendars for today..+3 days ET, keeps the earliest report
// date per lane ticker, and persists the result in runtime_state so a
// process restart the same day does not trigger a second cycle. If any
// day of the cycle fails, the whole snapshot is marked unhealthy and
// every lookup is UNKNOWN until the next day's cycle — partial coverage
// is never presented as complete.
//
// LOOKUP CONTRACT (the lane's blackout and the context stamp depend on
// these exact semantics):
//   known + date → the symbol's next earnings report date (ET) in the
//                  covered window, with Nasdaq's session hint if given.
//   known + null → the calendar was fetched successfully and this symbol
//                  has NO earnings in the covered days. This is the only
//                  "no earnings" answer, and it only ever covers the
//                  fetched days — it says nothing about day +4 onward.
//   unknown      → source down, malformed, or not yet fetched today.
//                  UNKNOWN NEVER BLOCKS an entry and stamps NULL,
//                  exactly like the old stub — the lane degrades to its
//                  pre-calendar behavior instead of trading blind on a
//                  guessed "no earnings."
//
// This module is market-data only: public GETs, no credentials, no order
// path — same isolation as kalshi-perps.ts. Kill switch for the whole
// feature (fetch + blackout + stamping): KALSHI_PERP_EARNINGS=off.
// ─────────────────────────────────────────────────────────────────────────────
import { loadRuntimeState, saveRuntimeState } from './runtime-state';

export const perpEarningsEnabled = () => process.env.KALSHI_PERP_EARNINGS !== 'off';

const num = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : d; };
/** Blackout window in hours (the context column's own 48h stamp is fixed — see earningsStampValue). */
export const earningsWindowH = () => num('KALSHI_PERP_EARNINGS_WINDOW_H', 48);
const FETCH_DAYS = 4; // today..+3 ET — comfortably covers the max sensible blackout window
const NASDAQ_URL = 'https://api.nasdaq.com/api/calendar/earnings';
const STATE_SCOPE = 'kalshi_earnings_calendar';
const STATE_KEY = 'v1';

// ── ET date helpers (pure) ──────────────────────────────────────────────────
const etPartsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function etPartsOf(tsMs: number): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const g: Record<string, number> = {};
  for (const p of etPartsFmt.formatToParts(new Date(tsMs))) {
    if (p.type !== 'literal') g[p.type] = Number(p.value);
  }
  return { y: g.year, mo: g.month, d: g.day, h: (g.hour ?? 0) % 24, mi: g.minute ?? 0, s: g.second ?? 0 };
}

/** The ET calendar date ('YYYY-MM-DD') containing an instant. */
export function etDateString(tsMs: number): string {
  const p = etPartsOf(tsMs);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Calendar arithmetic on a 'YYYY-MM-DD' string (no timezone involved). */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** UTC epoch ms of ET midnight (00:00 local) on a 'YYYY-MM-DD' ET date.
 *  Iterated offset resolution — correct across DST transitions. */
export function etMidnightUtcMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d, 0, 0, 0);
  let guess = target + 5 * 3_600_000; // EST offset as the first guess
  for (let i = 0; i < 3; i++) {
    const p = etPartsOf(guess);
    const wallAsUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    const next = guess + (target - wallAsUtc);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** Is an earnings report on ET date `dateStr` inside the blackout window
 *  at `nowMs`? The whole report day counts: a report later today is in,
 *  a report whose day starts within `windowH` hours is in, a report day
 *  that has fully passed is out. */
export function earningsDateWithinWindow(dateStr: string, nowMs: number, windowH: number): boolean {
  const start = etMidnightUtcMs(dateStr);
  const end = start + 24 * 3_600_000;
  return end > nowMs && start - nowMs < windowH * 3_600_000;
}

// ── snapshot + lookup types ─────────────────────────────────────────────────
export interface EarningsSnapshotEntry { date: string; time: string | null }
export interface EarningsSnapshot {
  fetchedOnEtDate: string;
  healthy: boolean;
  days: string[];
  /** The ticker universe the cycle actually checked. A symbol outside it
   *  was never looked up, so it reads UNKNOWN — not "no earnings." */
  universe: string[];
  entries: Record<string, EarningsSnapshotEntry>;
}

export type EarningsLookup =
  | { known: true; date: string | null; time: string | null }
  | { known: false };

export const UNKNOWN_LOOKUP: EarningsLookup = { known: false };

/** Pure read of a snapshot for one symbol. A symbol absent from a
 *  HEALTHY snapshot genuinely has no earnings in the covered days. */
export function lookupInSnapshot(snap: EarningsSnapshot | null, symbol: string): EarningsLookup {
  if (!snap || !snap.healthy) return UNKNOWN_LOOKUP;
  const sym = String(symbol || '').toUpperCase();
  if (!(snap.universe || []).includes(sym)) return UNKNOWN_LOOKUP;
  const hit = snap.entries[sym];
  return { known: true, date: hit?.date ?? null, time: hit?.time ?? null };
}

/** The blackout decision (pure): ONLY a known earnings date inside the
 *  window blocks. Unknown never blocks; known-none never blocks. */
export function earningsBlockApplies(lookup: EarningsLookup, nowMs: number, windowH: number): boolean {
  return lookup.known && lookup.date != null && earningsDateWithinWindow(lookup.date, nowMs, windowH);
}

/** The context stamp for `earnings_within_48h` (pure): true/false only
 *  when the calendar KNOWS; null when unknown — the column keeps its old
 *  stub semantics rather than fabricating a "false." The stamp always
 *  uses the column's own 48 hours, independent of the block window env. */
export function earningsStampValue(lookup: EarningsLookup, nowMs: number): boolean | null {
  if (!lookup.known) return null;
  if (lookup.date == null) return false;
  return earningsDateWithinWindow(lookup.date, nowMs, 48);
}

// ── Nasdaq fetch + parse ────────────────────────────────────────────────────
export type EarningsDayFetcher = (dateStr: string) => Promise<any>;

/** Default fetcher: Nasdaq's public calendar JSON for one ET date. */
export const fetchNasdaqEarningsDay: EarningsDayFetcher = async (dateStr: string) => {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${NASDAQ_URL}?date=${encodeURIComponent(dateStr)}`, {
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    });
    if (!res.ok) throw new Error(`nasdaq earnings ${dateStr} -> ${res.status}`);
    return await res.json();
  } finally { clearTimeout(to); }
};

/** Parse one day's Nasdaq payload into earliest-entries for the universe.
 *  Returns null when the payload shape is unusable (caller marks the day
 *  failed); an empty-but-valid rows array is a successful quiet day. */
export function parseNasdaqEarningsDay(
  json: any,
  dateStr: string,
  universe: ReadonlySet<string>,
): Record<string, EarningsSnapshotEntry> | null {
  const rows = json?.data?.rows;
  if (!Array.isArray(rows)) return null;
  const out: Record<string, EarningsSnapshotEntry> = {};
  for (const r of rows) {
    const sym = String(r?.symbol || '').trim().toUpperCase();
    if (!sym || !universe.has(sym)) continue;
    const time = typeof r?.time === 'string' && r.time && r.time !== 'time-not-supplied' ? r.time : null;
    if (!out[sym]) out[sym] = { date: dateStr, time };
  }
  return out;
}

// ── the daily cycle ─────────────────────────────────────────────────────────
/**
 * Run ONE fetch cycle for the given ET day: today..+3 days, earliest date
 * per symbol wins. Never throws — any failure degrades the snapshot's
 * health, which degrades every lookup to UNKNOWN.
 */
export async function runEarningsFetchCycle(
  universe: string[],
  todayEt: string,
  fetcher: EarningsDayFetcher = fetchNasdaqEarningsDay,
): Promise<EarningsSnapshot> {
  const wanted = new Set((universe || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean));
  const entries: Record<string, EarningsSnapshotEntry> = {};
  const days: string[] = [];
  let healthy = wanted.size > 0;
  for (let off = 0; off < FETCH_DAYS; off++) {
    const dateStr = addDaysToDateStr(todayEt, off);
    try {
      const parsed = parseNasdaqEarningsDay(await fetcher(dateStr), dateStr, wanted);
      if (parsed == null) { healthy = false; continue; }
      days.push(dateStr);
      for (const [sym, e] of Object.entries(parsed)) if (!entries[sym]) entries[sym] = e;
    } catch { healthy = false; }
  }
  return { fetchedOnEtDate: todayEt, healthy, days, universe: Array.from(wanted), entries };
}

// ── persisted daily cache ───────────────────────────────────────────────────
let _snap: EarningsSnapshot | null = null;
let _loaded = false;
let _refreshing: Promise<EarningsSnapshot | null> | null = null;

async function loadPersisted(): Promise<void> {
  if (_loaded) return;
  _loaded = true;
  try {
    const rows = await loadRuntimeState(STATE_SCOPE);
    const hit = rows.find((r) => r.key === STATE_KEY)?.value;
    if (hit && typeof hit === 'object' && typeof hit.fetchedOnEtDate === 'string' && hit.entries) {
      _snap = hit as EarningsSnapshot;
    }
  } catch { /* cold cache — the cycle below refetches */ }
}

/** The current snapshot, refreshing at most once per ET calendar day
 *  (the persisted snapshot counts — restarts do not refetch). Concurrent
 *  callers share the one in-flight cycle. Never throws. */
export async function ensureEarningsSnapshot(
  universe: string[],
  nowMs: number = Date.now(),
  fetcher: EarningsDayFetcher = fetchNasdaqEarningsDay,
): Promise<EarningsSnapshot | null> {
  try {
    await loadPersisted();
    const todayEt = etDateString(nowMs);
    if (_snap && _snap.fetchedOnEtDate === todayEt) return _snap;
    if (!_refreshing) {
      _refreshing = (async () => {
        try {
          const snap = await runEarningsFetchCycle(universe, todayEt, fetcher);
          _snap = snap;
          saveRuntimeState(STATE_SCOPE, STATE_KEY, snap);
          return snap;
        } catch {
          return _snap; // keep whatever stale snapshot exists; lookups judge its health
        } finally { _refreshing = null; }
      })();
    }
    return await _refreshing;
  } catch { return _snap; }
}

/** Lane-facing lookup: known date / known none / unknown, per the
 *  contract at the top of this file. Never throws. */
export async function getEarningsInfo(
  symbol: string,
  universe: string[],
  nowMs: number = Date.now(),
  fetcher: EarningsDayFetcher = fetchNasdaqEarningsDay,
): Promise<EarningsLookup> {
  if (!perpEarningsEnabled()) return UNKNOWN_LOOKUP;
  const snap = await ensureEarningsSnapshot(universe, nowMs, fetcher).catch(() => null);
  return lookupInSnapshot(snap, symbol);
}

/** Convenience form: the next earnings ET date, or null. Null means
 *  "unknown OR none in the covered days" — callers that must tell those
 *  apart (the blackout, the stamp) use getEarningsInfo instead. */
export async function nextEarningsDate(
  symbol: string,
  universe: string[],
  nowMs: number = Date.now(),
): Promise<string | null> {
  const info = await getEarningsInfo(symbol, universe, nowMs);
  return info.known ? info.date : null;
}
