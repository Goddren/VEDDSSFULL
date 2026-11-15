/**
 * Kalshi SPORTS odds-benchmark SHADOW lane — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-sports-shadow.ts
 *
 * No live network, no API keys, no database writes: de-vig math, strict
 * matching, both book payload normalizers, and the entry bar are exercised
 * on synthetic payloads; the no-key idle, shadow isolation (no order path
 * reachable), snapshot recording, and kill switch are pinned by source
 * checks plus the pure configuredOddsSource() env logic.
 *
 *   A. De-vig math: symmetric book → 50/50; vig removed (probs sum to 1);
 *      invalid prices rejected.
 *   B. Entry bar: ≥4pt divergence (the live sports guard), ask band,
 *      spread cap — boundaries on both sides.
 *   C. Strict matching: both teams + window; crossed sides OK; ambiguity,
 *      one-team, and out-of-window are all skips; truncated Kalshi labels.
 *   D. The Odds API normalizer: book preference, h2h extraction, skips.
 *   E. OddsPapi extractor: catalog-named moneyline, named outcomes,
 *      non-moneyline markets ignored.
 *   F. Activation: no key → no source (idle); key presence selects source
 *      (OddsPapi primary); report exposes booleans only.
 *   G. Kill switch: KALSHI_SPORTS_ODDS=off disables the lane.
 *   H. Source pins: no order path / credential store; keys read from env
 *      only; snapshots + observations recorded; resolver closes only from
 *      Kalshi's posted result; ledger arm; panel/route/boot wired.
 */
import { readFileSync } from 'node:fs';
import {
  sportsOddsShadowEnabled, MIN_DIVERGENCE_PTS, devigTwoWay, sportsEntryQualifies,
  sportsFeePct, sportsSettlementReturnPct, normalizeTeamName, kalshiTeamMatches,
  matchKalshiGame, bookSideIndexFor, normalizeOddsApiPayload, extractOddsPapiMoneyline,
  configuredOddsSource, type KalshiGame, type BookGame,
} from '../server/services/kalshi-sports-shadow';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// A — de-vig math
{
  const sym = devigTwoWay(1.91, 1.91);
  check('A1 symmetric book de-vigs to 50/50', !!sym && approx(sym[0], 0.5) && approx(sym[1], 0.5));
  const fav = devigTwoWay(1.5, 2.8);
  check('A2 de-vigged probabilities sum to exactly 1 (vig removed)', !!fav && approx(fav[0] + fav[1], 1));
  check('A3 favorite keeps the larger share', !!fav && fav[0] > 0.6 && fav[0] < 0.67, fav ? `p=${fav[0].toFixed(3)}` : '');
  check('A4 raw implied would overstate (vig present before de-vig)', 1 / 1.5 + 1 / 2.8 > 1.02);
  check('A5 even-money-or-worse prices are rejected', devigTwoWay(1.0, 2.0) === null && devigTwoWay(0.5, 2.0) === null);
  check('A6 NaN is rejected', devigTwoWay(NaN, 2.0) === null);
}

// B — entry bar
{
  const base = { minDivergencePts: 4, minEntryCents: 5, maxEntryCents: 96, spreadMaxCents: 10 };
  check('B1 the lane default divergence bar is 4 pts — the live engine sports guard', MIN_DIVERGENCE_PTS() === 4);
  check('B2 divergence exactly at the bar qualifies', sportsEntryQualifies({ ...base, divergencePts: 4, askCents: 50, spreadCents: 3 }));
  check('B3 divergence under the bar does not', !sportsEntryQualifies({ ...base, divergencePts: 3.99, askCents: 50, spreadCents: 3 }));
  check('B4 ask below the floor does not', !sportsEntryQualifies({ ...base, divergencePts: 9, askCents: 4, spreadCents: 3 }));
  check('B5 ask above the cap does not', !sportsEntryQualifies({ ...base, divergencePts: 9, askCents: 97, spreadCents: 3 }));
  check('B6 a wide spread does not', !sportsEntryQualifies({ ...base, divergencePts: 9, askCents: 50, spreadCents: 11 }));
  check('B7 fee + settlement math matches the binary convention',
    approx(sportsFeePct(0.5), 3.5) && approx(sportsSettlementReturnPct(50, true, sportsFeePct(0.5)), 100 - 3.5)
    && approx(sportsSettlementReturnPct(50, false, sportsFeePct(0.5)), -100 - 3.5));
}

// C — strict matching
{
  const game: KalshiGame = {
    eventTicker: 'KXNFLGAME-26NOV23CINWAS', seriesTicker: 'KXNFLGAME', league: 'NFL',
    closeTime: '2026-11-23T01:15:00Z',
    sides: [
      { ticker: 'KXNFLGAME-26NOV23CINWAS-WAS', teamLabel: 'Washington', yesBid: 35, yesAsk: 36, lastPrice: 36, volume: 100 },
      { ticker: 'KXNFLGAME-26NOV23CINWAS-CIN', teamLabel: 'Cincinnati', yesBid: 65, yesAsk: 67, lastPrice: 64, volume: 100 },
    ],
  };
  const book = (home: string, away: string, commence: string): BookGame => ({
    source: 'oddsapi', league: 'NFL', bookmaker: 'draftkings', commenceTime: commence,
    sides: [{ team: home, priceDec: 2.8 }, { team: away, priceDec: 1.5 }],
  });
  const good = book('Washington Commanders', 'Cincinnati Bengals', '2026-11-22T18:00:00Z');
  check('C1 full-name book teams match truncated Kalshi labels', matchKalshiGame(game, [good]) === good);
  check('C2 side mapping follows the teams, not the order', bookSideIndexFor(game, 0, good) === 0 && bookSideIndexFor(game, 1, good) === 1);
  const other = book('Washington Commanders', 'Cincinnati Bengals', '2026-11-29T18:00:00Z');
  check('C3 same teams a week apart are out of window — no match', matchKalshiGame(game, [other]) === null);
  check('C4 two in-window candidates are ambiguous — skip, never guess', matchKalshiGame(game, [good, { ...good, bookmaker: 'fanduel' }]) === null);
  const oneTeam = book('Washington Commanders', 'Dallas Cowboys', '2026-11-22T18:00:00Z');
  check('C5 one team matching is not a match', matchKalshiGame(game, [oneTeam]) === null);
  check('C6 a different league never matches', matchKalshiGame(game, [{ ...good, league: 'NBA' }]) === null);
  check('C7 name normalization strips punctuation and case', normalizeTeamName('  Washington  Commanders! ') === 'washington commanders');
  check('C8 too-short labels never match', !kalshiTeamMatches('LA', 'Los Angeles Rams'));
}

// D — The Odds API normalizer
{
  const payload = [{
    home_team: 'Washington Commanders', away_team: 'Cincinnati Bengals', commence_time: '2026-11-22T18:00:00Z',
    bookmakers: [
      { key: 'betrivers', markets: [{ key: 'h2h', outcomes: [{ name: 'Washington Commanders', price: 3.1 }, { name: 'Cincinnati Bengals', price: 1.4 }] }] },
      { key: 'draftkings', markets: [{ key: 'h2h', outcomes: [{ name: 'Washington Commanders', price: 2.8 }, { name: 'Cincinnati Bengals', price: 1.5 }] }] },
      { key: 'fanduel', markets: [{ key: 'spreads', outcomes: [{ name: 'Washington Commanders', price: 1.9 }] }] },
    ],
  }, {
    home_team: 'No Odds FC', away_team: 'Missing United', commence_time: '2026-11-22T18:00:00Z', bookmakers: [],
  }];
  const games = normalizeOddsApiPayload(payload, 'NFL');
  check('D1 events without an h2h book are skipped', games.length === 1);
  check('D2 the preferred book wins (draftkings over betrivers)', games[0]?.bookmaker === 'draftkings');
  check('D3 prices land on the right teams', games[0]?.sides[0].priceDec === 2.8 && games[0]?.sides[1].priceDec === 1.5);
  check('D4 non-array payload is empty, not a crash', normalizeOddsApiPayload(null, 'NFL').length === 0);
}

// E — OddsPapi extractor
{
  const fixture = { participant1Name: 'Kansas City Chiefs', participant2Name: 'Denver Broncos' };
  const names = new Map([['101', 'Moneyline'], ['102', 'Spread']]);
  const payload = {
    bookmakerOdds: {
      pinnacle: {
        markets: {
          '102': { outcomes: { '1': { players: { '0': { price: 1.91 } } }, '2': { players: { '0': { price: 1.91 } } } } },
          '101': {
            outcomes: {
              '1': { name: 'Kansas City Chiefs', players: { '0': { price: 1.8 } } },
              '2': { name: 'Denver Broncos', players: { '0': { price: 2.1 } } },
            },
          },
        },
      },
    },
  };
  const ml = extractOddsPapiMoneyline(fixture, payload, names);
  check('E1 the catalog-named moneyline market is the one extracted', !!ml && ml.bookmaker === 'pinnacle');
  check('E2 named outcomes map prices to the right participants', !!ml && ml.sides[0].priceDec === 1.8 && ml.sides[1].priceDec === 2.1);
  check('E3 no moneyline in the catalog → skip', extractOddsPapiMoneyline(fixture, payload, new Map([['101', 'Spread']])) === null);
  const unnamed = {
    bookmakerOdds: { pinnacle: { markets: { '101': { outcomes: { '1': { players: { '0': { price: 1.8 } } }, '2': { players: { '0': { price: 2.1 } } } } } } } },
  };
  const ml2 = extractOddsPapiMoneyline(fixture, unnamed, names);
  check('E4 unnamed outcomes fall back to participant order', !!ml2 && ml2.sides[0].team === 'Kansas City Chiefs' && ml2.sides[0].priceDec === 1.8);
  check('E5 a malformed payload is a skip, not a crash', extractOddsPapiMoneyline(fixture, { bookmakerOdds: null }, names) === null);
}

// F — activation / no-key idle
{
  const prevP = process.env.ODDSPAPI_KEY, prevO = process.env.ODDS_API_KEY;
  delete process.env.ODDSPAPI_KEY; delete process.env.ODDS_API_KEY;
  check('F1 no key configured → no source (the lane idles)', configuredOddsSource() === null);
  process.env.ODDS_API_KEY = 'test-not-a-real-key';
  check('F2 Odds API key alone selects the fallback', configuredOddsSource() === 'oddsapi');
  process.env.ODDSPAPI_KEY = 'test-not-a-real-key';
  check('F3 OddsPapi is primary when both are set', configuredOddsSource() === 'oddspapi');
  if (prevP === undefined) delete process.env.ODDSPAPI_KEY; else process.env.ODDSPAPI_KEY = prevP;
  if (prevO === undefined) delete process.env.ODDS_API_KEY; else process.env.ODDS_API_KEY = prevO;
}

// G — kill switch
{
  const prev = process.env.KALSHI_SPORTS_ODDS;
  delete process.env.KALSHI_SPORTS_ODDS;
  check('G1 lane enabled by default', sportsOddsShadowEnabled() === true);
  process.env.KALSHI_SPORTS_ODDS = 'off';
  check('G2 KALSHI_SPORTS_ODDS=off disables the lane', sportsOddsShadowEnabled() === false);
  if (prev === undefined) delete process.env.KALSHI_SPORTS_ODDS; else process.env.KALSHI_SPORTS_ODDS = prev;
}

// H — source pins
{
  const lane = readFileSync(new URL('../server/services/kalshi-sports-shadow.ts', import.meta.url), 'utf8');
  const recorder = readFileSync(new URL('../server/services/kalshi-price-snapshots.ts', import.meta.url), 'utf8');
  const ledger = readFileSync(new URL('../server/services/shadow-ledger.ts', import.meta.url), 'utf8');
  const routes = readFileSync(new URL('../server/routes.ts', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../client/src/pages/kalshi.tsx', import.meta.url), 'utf8');

  const forbidden = ['kalshi-trading', 'createOrder', 'placeKalshi', 'kalshi-credentials', 'decryptApiSecret'];
  check('H1 lane imports no order path / credential store', forbidden.every((f) => !lane.includes(f)),
    forbidden.filter((f) => lane.includes(f)).join(','));
  check('H2 recorder imports no order path either', forbidden.every((f) => !recorder.includes(f)));
  check('H3 keys are read from env only (both names present, values never hardcoded)',
    lane.includes('process.env.ODDSPAPI_KEY') && lane.includes('process.env.ODDS_API_KEY'));
  check('H4 the report exposes key state as booleans only',
    lane.includes('oddspapiKeyConfigured: !!process.env.ODDSPAPI_KEY') && lane.includes('oddsApiKeyConfigured: !!process.env.ODDS_API_KEY'));
  check('H5 the cycle idles before any book fetch when no source is configured',
    lane.indexOf('if (!source)') > lane.indexOf('resolveSportsShadowTrades') && lane.indexOf('if (!source)') < lane.indexOf('fetchKalshiGames(league)'));
  check('H6 matched games write observations AND Kalshi snapshots',
    lane.includes('kalshi_sports_shadow_observations') && lane.includes('recordKalshiPriceSnapshots(snapRows)'));
  check('H7 resolver closes only from Kalshi\'s posted result',
    lane.includes("st.result === 'yes' || st.result === 'no'") && lane.includes('getKalshiMarketStatus'));
  check('H8 shadow ledger carries the sports arm', ledger.includes("'kalshi_sports_shadow'") && ledger.includes('kalshi_sports_shadow_trades'));
  check('H9 panel route registered', routes.includes('"/api/kalshi-sports-shadow"'));
  check('H10 lane started at boot', index.includes('startKalshiSportsShadow()'));
  check('H11 panel rendered on the Kalshi page', page.includes('KalshiSportsShadowPanel'));
  check('H12 kill switch gates the cycle', lane.includes("process.env.KALSHI_SPORTS_ODDS !== 'off'"));
  check('H13 unmatched games are skipped by construction (match returns null → continue)',
    lane.includes('if (!bg) continue'));
}

console.log(`\n${total - failures}/${total} checks passed`);
if (failures) process.exit(1);
