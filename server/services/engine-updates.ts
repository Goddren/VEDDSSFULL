// What's new in the FX engine, the brain and Model 1 / Model 2 — written for
// traders, not developers. ABBA reads this so it can explain recent changes.
// Add new entries at the top when an engine change ships.

export interface EngineUpdate { date: string; area: 'fx-engine' | 'brain' | 'models' | 'crypto' | 'sol'; title: string; detail: string }

export const ENGINE_UPDATES: EngineUpdate[] = [
  { date: '2026-10-30', area: 'brain', title: 'Shadow lessons feed the AI',
    detail: 'Every shadow and paper trade (FX Model 1/2, crypto paper, Sol paper) now lands in one shadow ledger. Lessons with real sample sizes ("favor London BUYs on EURUSD, 31 trades") are fed to the FX, crypto and Sol AI as advice.' },
  { date: '2026-10-30', area: 'fx-engine', title: 'Stricter entries',
    detail: 'H1 and H4 trend must both agree before an entry. Trend entries are skipped on range days. No chasing: no BUY above RSI 70, no SELL below RSI 30. Every skip is logged with the reason in "Why trades were skipped".' },
  { date: '2026-10-30', area: 'fx-engine', title: 'Trades get room to breathe',
    detail: 'Stops are no longer tightened until the trade is 1R in profit, so winners are not choked out early. Losing-side AI stops are kept as sent.' },
  { date: '2026-10-29', area: 'fx-engine', title: 'Fair value gaps fixed',
    detail: 'The FVG detector now uses the most recent unfilled gap instead of an old or filled one.' },
  { date: '2026-10-29', area: 'models', title: 'Model 1 server-side candidate',
    detail: 'Model 1 (range / mean reversion) now proposes its own candidates on the server for edges that do not fight the H4 trend. Still shadow only.' },
  { date: '2026-10-28', area: 'models', title: 'Model 2 shadow rules',
    detail: 'Model 2 (trend continuation) got stricter shadow rules and uses the real H1 ATR for stops. Its 10-17 to 10-27 shadow run was 219 trades at -47R, which is why it stays in shadow.' },
  { date: '2026-10-26', area: 'fx-engine', title: 'Late-session and weekend blocks',
    detail: 'No FX entries 21:00-24:00 UTC (thin late session and the Sunday reopen) and none from Friday 21:00 to Sunday 21:00 UTC. Crypto is not affected.' },
  { date: '2026-10-23', area: 'fx-engine', title: 'Market structure reads live bars',
    detail: 'H1/H4 break of structure, Wyckoff phase and premium/discount were reading week-old candles. Fixed, and an H4 structure filter now blocks entries against it. Each entry stores its structure context.' },
  { date: '2026-10-23', area: 'fx-engine', title: 'Pair pauses',
    detail: 'USDJPY resumed in both directions. GBPJPY stays paused: it was the biggest drain in trade history.' },
  { date: '2026-10-22', area: 'fx-engine', title: 'Breakeven at 1R',
    detail: 'Breakeven only moves at 1R (minimum 15 pips) and locks entry +2 pips, re-anchored to each account\'s own fill.' },
  { date: '2026-10-21', area: 'models', title: 'Tougher go-live bar',
    detail: 'A Model 1/2 slice (model x day type x pair x session) only goes live after 50+ shadow trades, average R of 0.2 or more, win rate of 40% or more and no losing week in the last two.' },
  { date: '2026-10-18', area: 'brain', title: 'Brain gates entries only',
    detail: 'Brain session/hour blocks stop new entries but no longer stop the analysis, so the brain keeps learning from blocked setups.' },
  { date: '2026-10-16', area: 'models', title: 'Model 1 / Model 2 launched',
    detail: 'Two strategies run side by side in shadow mode: Model 1 for range days, Model 2 for trend days. Each earns a mastery level (Learning, Developing, Proficient, Master). Proven bundles can be sold on the brain marketplace. Live trading for proven slices is off by default.' },
  { date: '2026-10-16', area: 'fx-engine', title: 'Sizing by agreement',
    detail: 'Position size scales with H1/H4 agreement and the day type, based on a 90-day replay.' },
  { date: '2026-09-23', area: 'brain', title: 'FX brain gate fixed',
    detail: 'The brain gate never fired before because of a session-name mismatch. It now blocks pair, direction and session combos that have been losing for this user.' },
];

export function engineUpdatesText(limit = 15): string {
  return ENGINE_UPDATES.slice(0, limit)
    .map((u) => `${u.date} [${u.area}] ${u.title}: ${u.detail}`).join('\n');
}
