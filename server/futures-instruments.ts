// ─── VEDD Futures Instruments ─────────────────────────────────────────────────
// Tick values, contract specs, and sizing calculators for all supported futures

export interface FuturesInstrument {
  symbol: string;
  tickSize: number;
  tickValue: number;        // USD value per tick per 1 contract
  pointValue: number;       // tickValue / tickSize — dollars per full point
  exchange: 'CME' | 'CBOT' | 'NYMEX' | 'COMEX';
  description: string;
  microContract: boolean;
  standardContract: string | null;  // root symbol of the standard version
  typicalDailyRange: number;        // approximate ATR in points
  category: 'equity' | 'energy' | 'metal' | 'rates' | 'ag';
}

export const FUTURES_INSTRUMENTS: Record<string, FuturesInstrument> = {
  // ── Equity Index ───────────────────────────────────────────────────────────
  NQ:  { symbol:'NQ',  tickSize:0.25, tickValue:5.00,  pointValue:20,   exchange:'CME',   description:'E-mini NASDAQ-100',         microContract:false, standardContract:null,  typicalDailyRange:200,  category:'equity' },
  MNQ: { symbol:'MNQ', tickSize:0.25, tickValue:0.50,  pointValue:2,    exchange:'CME',   description:'Micro E-mini NASDAQ-100',    microContract:true,  standardContract:'NQ',  typicalDailyRange:200,  category:'equity' },
  ES:  { symbol:'ES',  tickSize:0.25, tickValue:12.50, pointValue:50,   exchange:'CME',   description:'E-mini S&P 500',             microContract:false, standardContract:null,  typicalDailyRange:50,   category:'equity' },
  MES: { symbol:'MES', tickSize:0.25, tickValue:1.25,  pointValue:5,    exchange:'CME',   description:'Micro E-mini S&P 500',       microContract:true,  standardContract:'ES',  typicalDailyRange:50,   category:'equity' },
  YM:  { symbol:'YM',  tickSize:1.00, tickValue:5.00,  pointValue:5,    exchange:'CBOT',  description:'E-mini Dow Jones 30',        microContract:false, standardContract:null,  typicalDailyRange:300,  category:'equity' },
  MYM: { symbol:'MYM', tickSize:1.00, tickValue:0.50,  pointValue:0.5,  exchange:'CBOT',  description:'Micro E-mini Dow Jones 30',  microContract:true,  standardContract:'YM',  typicalDailyRange:300,  category:'equity' },
  RTY: { symbol:'RTY', tickSize:0.10, tickValue:5.00,  pointValue:50,   exchange:'CME',   description:'E-mini Russell 2000',        microContract:false, standardContract:null,  typicalDailyRange:20,   category:'equity' },
  M2K: { symbol:'M2K', tickSize:0.10, tickValue:0.50,  pointValue:5,    exchange:'CME',   description:'Micro E-mini Russell 2000',  microContract:true,  standardContract:'RTY', typicalDailyRange:20,   category:'equity' },

  // ── Metals ─────────────────────────────────────────────────────────────────
  GC:  { symbol:'GC',  tickSize:0.10, tickValue:10.00, pointValue:100,  exchange:'COMEX', description:'Gold Futures',               microContract:false, standardContract:null,  typicalDailyRange:25,   category:'metal' },
  MGC: { symbol:'MGC', tickSize:0.10, tickValue:1.00,  pointValue:10,   exchange:'COMEX', description:'Micro Gold Futures',         microContract:true,  standardContract:'GC',  typicalDailyRange:25,   category:'metal' },
  SI:  { symbol:'SI',  tickSize:0.005,tickValue:25.00, pointValue:5000, exchange:'COMEX', description:'Silver Futures',             microContract:false, standardContract:null,  typicalDailyRange:0.5,  category:'metal' },
  SIL: { symbol:'SIL', tickSize:0.005,tickValue:2.50,  pointValue:500,  exchange:'COMEX', description:'Micro Silver Futures',       microContract:true,  standardContract:'SI',  typicalDailyRange:0.5,  category:'metal' },

  // ── Energy ─────────────────────────────────────────────────────────────────
  CL:  { symbol:'CL',  tickSize:0.01, tickValue:10.00, pointValue:1000, exchange:'NYMEX', description:'Crude Oil Futures (WTI)',    microContract:false, standardContract:null,  typicalDailyRange:2,    category:'energy' },
  MCL: { symbol:'MCL', tickSize:0.01, tickValue:1.00,  pointValue:100,  exchange:'NYMEX', description:'Micro Crude Oil Futures',    microContract:true,  standardContract:'CL',  typicalDailyRange:2,    category:'energy' },
  NG:  { symbol:'NG',  tickSize:0.001,tickValue:10.00, pointValue:10000,exchange:'NYMEX', description:'Natural Gas Futures',        microContract:false, standardContract:null,  typicalDailyRange:0.1,  category:'energy' },

  // ── Treasury Rates ──────────────────────────────────────────────────────────
  ZN:  { symbol:'ZN',  tickSize:0.015625, tickValue:15.625, pointValue:1000, exchange:'CBOT', description:'10-Year T-Note Futures', microContract:false, standardContract:null, typicalDailyRange:0.5, category:'rates' },
  ZB:  { symbol:'ZB',  tickSize:0.03125,  tickValue:31.25,  pointValue:1000, exchange:'CBOT', description:'30-Year T-Bond Futures', microContract:false, standardContract:null, typicalDailyRange:1.0, category:'rates' },
};

export function getInstrument(symbol: string): FuturesInstrument | undefined {
  return FUTURES_INSTRUMENTS[symbol.toUpperCase()];
}

export function calculateContractRisk(
  symbol: string,
  entryPrice: number,
  stopLossPrice: number,
  contracts: number
): { ticks: number; dollarRisk: number; pointsRisk: number } {
  const inst = getInstrument(symbol);
  if (!inst) return { ticks: 0, dollarRisk: 0, pointsRisk: 0 };
  const priceDiff = Math.abs(entryPrice - stopLossPrice);
  const ticks = Math.round(priceDiff / inst.tickSize);
  const dollarRisk = ticks * inst.tickValue * contracts;
  return { ticks, dollarRisk, pointsRisk: priceDiff };
}

export function calculateContractSize(
  symbol: string,
  accountBalance: number,
  riskPercent: number,
  entryPrice: number,
  stopLossPrice: number
): number {
  const inst = getInstrument(symbol);
  if (!inst) return 1;
  const riskDollars = accountBalance * (riskPercent / 100);
  const priceDiff = Math.abs(entryPrice - stopLossPrice);
  if (priceDiff <= 0) return 1;
  const ticks = Math.round(priceDiff / inst.tickSize);
  const dollarRiskPerContract = ticks * inst.tickValue;
  if (dollarRiskPerContract <= 0) return 1;
  return Math.max(1, Math.floor(riskDollars / dollarRiskPerContract));
}

export function formatTicksAsDollars(symbol: string, ticks: number, contracts: number): string {
  const inst = getInstrument(symbol);
  if (!inst) return '$0';
  const dollars = ticks * inst.tickValue * contracts;
  return `$${dollars.toFixed(2)}`;
}

export function getDefaultStopLossTicks(symbol: string): number {
  const inst = getInstrument(symbol);
  if (!inst) return 20;
  // Default SL = 25% of typical daily range in ticks
  const rangeInTicks = inst.typicalDailyRange / inst.tickSize;
  return Math.round(rangeInTicks * 0.25);
}
