# Index data Yahoo-primary fix

## Diagnosis (traced Nov 24 against main c34a3c76)

The engine-visible US30 error is `Scan failed: Twelve Data API error: 404 Not Found`
(live-trading-engine.ts scan loop, `addActivity(..., 'Scan failed: ' + err.message)`).
That string is thrown by `TwelveDataProvider.fetchOHLCV` (twelve-data.ts,
`Twelve Data API error: ${status} ${statusText}`) and reaches the scan loop through
`MarketDataService.fetchMarketData` (service.ts), whose catch tried Yahoo and then
**rethrew the raw 404** whenever Yahoo returned nothing. Yahoo returns nothing when
(a) throttled (!r.ok), or (b) by design: `fetchIndexFromYahoo` refuses intraday bars
whose newest bar is >2h old (cash index closed). The Twelve Data symbol mapping was
never the bug — US30→DJI is correct; the account's Twelve Data plan simply excludes
indices (service.ts's own 2026-10-19 comment says so).

Second failing path: `POST /api/market-data/atr` (routes.ts) built a raw
`TwelveDataProvider` and called `fetchATR` with **no Yahoo fallback anywhere**, and
its local `inferAssetType` never returned `'index'` (US30 → `'stock'`, so Twelve Data
received the unmapped symbol `US30` on /atr + /price).

## Fix

- `server/market-data/yahoo-index.ts` (new): the Yahoo fetcher + symbol map moved
  verbatim out of service.ts; adds pure `yahooIndexSymbol`, pure `computeAtrFromBars`,
  and throttled `logIndexSource` (≤1 line per symbol+source per 15 min) so production
  logs prove which source carried an index symbol.
- `service.ts`: index assetType → `fetchIndexMarketData` — Yahoo primary, Twelve Data
  fallback, source logging, both-down → one `Index data unavailable for <symbol>:
  Yahoo returned no data and Twelve Data failed (...)` error. Non-index flow untouched.
- `twelve-data.ts`: `fetchATR` dispatcher — index ATR from Yahoo candles first,
  Twelve Data fallback, same combined error; non-index unchanged.
- `routes.ts`: one-line swap so the ATR route's canonical `detectAssetType` wins when
  it says `'index'` (all other symbols keep the old local inference).
- Kill switch: `INDEX_YAHOO_PRIMARY=off` restores Twelve-Data-first order on both paths.

Checks: `scripts/check-index-data-yahoo.ts`.
