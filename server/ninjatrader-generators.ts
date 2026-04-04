// ─── VEDD NinjaTrader 8 NinjaScript Strategy Generator ──────────────────────
// Generates C# NinjaScript strategies for NinjaTrader 8 from VEDD AI analysis
// Mirrors the structure of server/ea-generators.ts

import { getInstrument } from './futures-instruments';

export interface NinjaScriptConfig {
  strategyName?: string;
  strategyType?: 'day_trading' | 'scalping' | 'swing_trading' | 'news_breakout';
  contracts?: number;
  useTrailingStop?: boolean;
  trailingStopTicks?: number;
  propFirmPreset?: string;
  dailyLossLimitDollars?: number;
  maxContractsPerTrade?: number;
  enableNewsFilter?: boolean;
  atrMultiplier?: number;
  rrRatio?: number;
  exitOnSessionClose?: boolean;
  bidirectional?: boolean;
  requireAiDirection?: 'BUY' | 'SELL' | null;
}

interface TimeframeAnalysis {
  timeframe: string;
  signal?: string;
  confidence?: number;
  direction?: string;
  indicators?: {
    rsi?: number;
    ema20?: number;
    ema50?: number;
    adx?: number;
    macd?: { value?: number; signal?: number; histogram?: number };
  };
  tradePlan?: {
    entry?: number;
    stopLoss?: number;
    takeProfit?: number;
  };
}

// ─── VEDD Proven Strategies — same 8 used by the 2nd confirmation AI ──────────
// Mapped to futures instruments for NinjaScript embedding
export const FUTURES_PROVEN_STRATEGIES: Array<{
  name: string;
  symbols: string[];   // futures symbols this strategy applies to
  category: string;
  setup: string;
  winConditions: string;
  riskNote: string;
  sessionFilter: string;
  ninjaConditions: { long: string[]; short: string[] };
}> = [
  {
    name: 'ICT AMD Kill Zone',
    symbols: ['GC','MGC','NQ','MNQ','ES','MES'],
    category: 'ICT',
    setup: 'Asian Range defined 02:00–05:00 ET. London open (07:00–09:00 ET) raids Asian low/high, price reverses. Enter on M15 OB inside Asian boundary + FVG fill.',
    winConditions: 'FVG fill + bullish/bearish engulf at OB, ADX > 25',
    riskNote: 'Avoid within 1h of major economic release (NFP, FOMC, CPI)',
    sessionFilter: 'London Open (07:00–09:30 ET)',
    ninjaConditions: {
      long:  ['adx14 > 25', 'rsi14 < 55', 'Close[0] > ema20', 'Close[1] < ema20'],
      short: ['adx14 > 25', 'rsi14 > 45', 'Close[0] < ema20', 'Close[1] > ema20'],
    },
  },
  {
    name: 'SMC Order Block Raid',
    symbols: ['GC','MGC','CL','MCL'],
    category: 'SMC',
    setup: 'Daily/H4 OB identified. Price sweeps through OB, wicks back inside. Enter on M15 BOS (break of structure) above OB bottom.',
    winConditions: 'Volume spike on wick, RSI divergence on M15, BOS confirmed',
    riskNote: 'Invalid if OB broken on a close — wait for next setup',
    sessionFilter: 'London or NY Session',
    ninjaConditions: {
      long:  ['rsi14 < 50', 'Close[0] > ema50', 'adx14 > 20', 'atr14 > atr14[5]'],
      short: ['rsi14 > 50', 'Close[0] < ema50', 'adx14 > 20', 'atr14 > atr14[5]'],
    },
  },
  {
    name: 'VWAP Bounce Mean Reversion',
    symbols: ['ES','MES','NQ','MNQ','YM','MYM','RTY','M2K','CL','MCL'],
    category: 'VWAP',
    setup: 'Price deviates >1.5 SD from VWAP during NY session (13:00–17:00 UTC). Fade at VWAP SD band when RSI extreme.',
    winConditions: 'RSI divergence, VWAP reclaim candle, ADX < 20 (ranging market)',
    riskNote: 'Do NOT trade against strong trend if ADX > 35',
    sessionFilter: 'NY Session (09:30–16:00 ET)',
    ninjaConditions: {
      long:  ['rsi14 < 35', 'adx14 < 30', 'Close[0] < ema50', 'Close[0] > Close[1]'],
      short: ['rsi14 > 65', 'adx14 < 30', 'Close[0] > ema50', 'Close[0] < Close[1]'],
    },
  },
  {
    name: 'Fair Value Gap Fill',
    symbols: ['NQ','MNQ','ES','MES','GC','MGC','RTY','M2K'],
    category: 'ICT',
    setup: '3-candle imbalance (FVG) on M15/H1. Price returns to 50% gap level. Trade continuation after 50% fill holds.',
    winConditions: 'FVG from strong impulsive move, ADX > 30, volume on imbalance candles',
    riskNote: 'Full-fill FVGs (100%) are less reliable — target 50% only',
    sessionFilter: 'Any active session with volume',
    ninjaConditions: {
      long:  ['Close[0] > ema20', 'rsi14 > 45 && rsi14 < 65', 'adx14 > 25', 'ema20 > ema50'],
      short: ['Close[0] < ema20', 'rsi14 > 35 && rsi14 < 55', 'adx14 > 25', 'ema20 < ema50'],
    },
  },
  {
    name: 'London-NY Overlap Momentum',
    symbols: ['NQ','MNQ','ES','MES','YM','MYM','RTY','M2K'],
    category: 'Session',
    setup: '10:00–12:00 ET peak liquidity window. Breakout of London AM range (07:00–10:00 ET). 15m close outside range triggers entry.',
    winConditions: '15m close + retest of range, ADX > 28, volume above 20-period avg',
    riskNote: 'High false-breakout rate without NY catalyst — check economic calendar',
    sessionFilter: 'London-NY Overlap (10:00–12:00 ET)',
    ninjaConditions: {
      long:  ['Close[0] > ema20', 'ema20 > ema50', 'adx14 > 28', 'rsi14 > 50'],
      short: ['Close[0] < ema20', 'ema20 < ema50', 'adx14 > 28', 'rsi14 < 50'],
    },
  },
  {
    name: 'PDH/PDL Liquidity Sweep',
    symbols: ['GC','MGC','CL','MCL','NQ','MNQ','ES','MES','YM','MYM'],
    category: 'Liquidity',
    setup: 'Prior day high or low swept at session open. Immediate rejection pin bar/engulf on M5/M15. Enter reversal targeting 50% of prior day range.',
    winConditions: 'Wick > body on sweep candle, OB within 20 ticks, ictMacroValid = true',
    riskNote: 'Must close back below/above sweep wick for invalidation',
    sessionFilter: 'Session Open (first 30 min)',
    ninjaConditions: {
      long:  ['rsi14 < 45', 'Close[0] > Close[1]', 'adx14 > 18', 'atr14 > atr14[3]'],
      short: ['rsi14 > 55', 'Close[0] < Close[1]', 'adx14 > 18', 'atr14 > atr14[3]'],
    },
  },
  {
    name: 'ICT Macro HTF Confluence',
    symbols: ['GC','MGC','NQ','MNQ','ES','MES','CL','MCL'],
    category: 'ICT',
    setup: 'Trade only when M15 aligns with H4 and D1 trend. Active ICT macro time windows (02:00, 08:30, 10:00, 14:00 ET). OB + FVG + EQ levels visible on H4.',
    winConditions: 'All timeframes aligned, minimum 2 confluence factors, London/NY session',
    riskNote: 'Skip if only 1 confluence factor — wait for full alignment',
    sessionFilter: 'ICT Macro Windows',
    ninjaConditions: {
      long:  ['Close[0] > ema20', 'ema20 > ema50', 'adx14 > 22', 'rsi14 > 42 && rsi14 < 68'],
      short: ['Close[0] < ema20', 'ema20 < ema50', 'adx14 > 22', 'rsi14 > 32 && rsi14 < 58'],
    },
  },
];

// Get strategies relevant to a futures symbol
export function getFuturesStrategiesForSymbol(symbol: string): typeof FUTURES_PROVEN_STRATEGIES {
  const upper = symbol.toUpperCase();
  return FUTURES_PROVEN_STRATEGIES.filter(s => s.symbols.includes(upper));
}

// Format strategies as NinjaScript header comments
function buildStrategyComments(symbol: string): string {
  const strategies = getFuturesStrategiesForSymbol(symbol);
  if (strategies.length === 0) return '// No specific strategies mapped for this instrument';
  return strategies.map((s, i) =>
    `// Strategy ${i + 1}: ${s.name} [${s.category}]\n//   Setup: ${s.setup.slice(0, 80)}...\n//   Win Conditions: ${s.winConditions}\n//   Session: ${s.sessionFilter}`
  ).join('\n//\n');
}

const ASSET_CONFIGS: Record<string, { atrMult: number; rr: number; confirmations: number; category: string }> = {
  NQ:  { atrMult: 1.5, rr: 2.5, confirmations: 3, category: 'index' },
  MNQ: { atrMult: 1.5, rr: 2.5, confirmations: 3, category: 'index' },
  ES:  { atrMult: 1.2, rr: 2.0, confirmations: 2, category: 'index' },
  MES: { atrMult: 1.2, rr: 2.0, confirmations: 2, category: 'index' },
  YM:  { atrMult: 1.3, rr: 2.0, confirmations: 2, category: 'index' },
  MYM: { atrMult: 1.3, rr: 2.0, confirmations: 2, category: 'index' },
  GC:  { atrMult: 1.5, rr: 2.5, confirmations: 3, category: 'metal' },
  MGC: { atrMult: 1.5, rr: 2.5, confirmations: 3, category: 'metal' },
  CL:  { atrMult: 2.0, rr: 3.0, confirmations: 3, category: 'energy' },
  MCL: { atrMult: 2.0, rr: 3.0, confirmations: 3, category: 'energy' },
  RTY: { atrMult: 1.5, rr: 2.5, confirmations: 3, category: 'index' },
  M2K: { atrMult: 1.5, rr: 2.5, confirmations: 3, category: 'index' },
};

function getAssetConfig(symbol: string) {
  return ASSET_CONFIGS[symbol.toUpperCase()] || { atrMult: 1.5, rr: 2.0, confirmations: 2, category: 'general' };
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
}

function buildBuyConditions(analyses: TimeframeAnalysis[], symbol: string): string {
  const conditions: string[] = [];

  // Check if any timeframe analysis suggests BUY
  for (const analysis of analyses.slice(0, 2)) {
    if (analysis.indicators?.rsi !== undefined) {
      const rsi = analysis.indicators.rsi;
      if (rsi < 50) conditions.push(`rsi14 < 55`);
      if (rsi > 40) conditions.push(`rsi14 > 35`);
    }
    if (analysis.direction === 'BUY' || analysis.signal === 'BUY') {
      conditions.push('Close[0] > ema20');
      conditions.push('ema20 > ema50');
    }
  }

  if (conditions.length === 0) {
    conditions.push('Close[0] > ema20', 'ema20 > ema50', 'rsi14 > 40 && rsi14 < 70', 'adx14 > 20');
  }

  return conditions.map(c => `(${c})`).join('\n            && ');
}

function buildSellConditions(analyses: TimeframeAnalysis[], symbol: string): string {
  const conditions: string[] = [];

  for (const analysis of analyses.slice(0, 2)) {
    if (analysis.direction === 'SELL' || analysis.signal === 'SELL') {
      conditions.push('Close[0] < ema20');
      conditions.push('ema20 < ema50');
    }
  }

  if (conditions.length === 0) {
    conditions.push('Close[0] < ema20', 'ema20 < ema50', 'rsi14 < 60 && rsi14 > 30', 'adx14 > 20');
  }

  return conditions.map(c => `(${c})`).join('\n            && ');
}

export function generateNinjaScriptStrategy(
  symbol: string,
  analyses: TimeframeAnalysis[],
  config?: NinjaScriptConfig
): string {
  const upperSymbol = symbol.toUpperCase();
  const inst = getInstrument(upperSymbol);
  const assetConf = getAssetConfig(upperSymbol);

  const strategyName = config?.strategyName || `VEDD_${upperSymbol}_Strategy`;
  const className = sanitizeName(strategyName);
  const contracts = config?.contracts || 1;
  const atrMult = config?.atrMultiplier || assetConf.atrMult;
  const rr = config?.rrRatio || assetConf.rr;
  const useTrailing = config?.useTrailingStop ?? false;
  const trailingTicks = config?.trailingStopTicks || 20;
  const dailyLossLimit = config?.dailyLossLimitDollars || 1500;
  const exitOnClose = config?.exitOnSessionClose ?? (config?.propFirmPreset === 'TOPSTEP');
  const bidirectional = config?.bidirectional ?? true;
  const propFirmNote = config?.propFirmPreset ? `Prop Firm: ${config.propFirmPreset}` : 'No prop firm preset';

  const buyConditions = buildBuyConditions(analyses, upperSymbol);
  const sellConditions = buildSellConditions(analyses, upperSymbol);

  const trailBlock = useTrailing ? `
                SetTrailStop("VEDDLong",  CalculationMode.Ticks, ${trailingTicks}, false);
                SetTrailStop("VEDDShort", CalculationMode.Ticks, ${trailingTicks}, false);` : '';

  const sellBlock = bidirectional ? `
            else if (sellCondition && Position.MarketPosition == MarketPosition.Flat)
            {
                EnterShort(${contracts}, "VEDDShort");
                double slShort = Close[0] + (atr14 * ${atrMult});
                double tpShort = Close[0] - (atr14 * ${atrMult} * ${rr});
                SetStopLoss("VEDDShort",    CalculationMode.Price, slShort, false);
                SetProfitTarget("VEDDShort", CalculationMode.Price, tpShort);${trailBlock}
            }` : '';

  const tickNote = inst
    ? `// Tick Value: $${inst.tickValue} per tick | Tick Size: ${inst.tickSize} | Point Value: $${inst.pointValue}`
    : '// Custom futures instrument';

  const date = new Date().toISOString().slice(0, 10);
  const strategyComments = buildStrategyComments(upperSymbol);
  const matchedStrategies = getFuturesStrategiesForSymbol(upperSymbol);
  const strategyNames = matchedStrategies.length > 0
    ? matchedStrategies.map(s => s.name).join(', ')
    : 'General Momentum + Trend Following';

  return `// ============================================================
// VEDD Trading AI — NinjaTrader 8 Strategy
// Generated: ${date}
// Symbol:    ${upperSymbol}
// Strategy:  ${strategyName}
// ${propFirmNote}
// Daily Loss Limit: $${dailyLossLimit}
// ${tickNote}
// ============================================================
//
// EMBEDDED VEDD PROVEN STRATEGIES (same as 2nd confirmation AI):
// ${strategyNames}
//
${strategyComments}
//
// INSTALLATION:
// 1. Open NinjaTrader 8
// 2. Go to: Tools → Edit NinjaScript → Strategy
// 3. Create new strategy named "${className}"
// 4. Paste this code, replacing the default template
// 5. Compile (F5) and attach to chart
// ============================================================

#region Using declarations
using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using NinjaTrader.Cbi;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.Strategies;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript.Strategies
{
    public class ${className} : Strategy
    {
        // ── Daily P&L Tracking ─────────────────────────────────────────────────
        private double  dailyRealizedPnL  = 0;
        private double  dailyUnrealizedPnL = 0;
        private DateTime lastTradeDate    = DateTime.MinValue;
        private int     totalTradesDay    = 0;

        // ── VEDD AI Parameters (auto-filled from analysis) ─────────────────────
        [NinjaScriptProperty]
        [Display(Name = "Contracts Per Trade", GroupName = "VEDD Risk", Order = 1)]
        public int ContractsPerTrade { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Daily Loss Limit ($)", GroupName = "VEDD Risk", Order = 2)]
        public double DailyLossLimit { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "ATR Stop Loss Multiplier", GroupName = "VEDD Risk", Order = 3)]
        public double AtrStopMultiplier { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Risk:Reward Ratio", GroupName = "VEDD Risk", Order = 4)]
        public double RiskRewardRatio { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Max Trades Per Day", GroupName = "VEDD Risk", Order = 5)]
        public int MaxTradesPerDay { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Use Trailing Stop", GroupName = "VEDD Risk", Order = 6)]
        public bool UseTrailingStop { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Trailing Stop Ticks", GroupName = "VEDD Risk", Order = 7)]
        public int TrailingStopTicks { get; set; }

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name                  = "${strategyName}";
                Description           = "VEDD AI Generated Strategy for ${upperSymbol} — ${propFirmNote}";
                Calculate             = Calculate.OnBarClose;
                EntriesPerDirection   = 1;
                EntryHandling         = EntryHandling.AllEntries;
                IsExitOnSessionCloseStrategy = ${exitOnClose ? 'true' : 'false'};
                ExitOnSessionCloseSeconds    = 30;

                // Default values (from VEDD AI analysis)
                ContractsPerTrade  = ${contracts};
                DailyLossLimit     = ${dailyLossLimit};
                AtrStopMultiplier  = ${atrMult};
                RiskRewardRatio    = ${rr};
                MaxTradesPerDay    = 6;
                UseTrailingStop    = ${useTrailing ? 'true' : 'false'};
                TrailingStopTicks  = ${trailingTicks};
            }
            else if (State == State.Configure)
            {
                // Add data series for multi-timeframe if needed
            }
        }

        protected override void OnBarUpdate()
        {
            // Only process primary bar series
            if (BarsInProgress != 0) return;
            // Need at least 50 bars for indicators to warm up
            if (CurrentBar < 50) return;

            // ── Session / daily reset ─────────────────────────────────────────
            if (lastTradeDate.Date != DateTime.Now.Date)
            {
                dailyRealizedPnL   = 0;
                dailyUnrealizedPnL = 0;
                totalTradesDay     = 0;
                lastTradeDate      = DateTime.Now;
            }

            // ── Daily loss circuit breaker ────────────────────────────────────
            double totalDailyLoss = dailyRealizedPnL + Position.GetUnrealizedProfitLoss(PerformanceUnit.Currency, Close[0]);
            if (totalDailyLoss <= -(DailyLossLimit))
            {
                // Flatten any open position and stop trading for today
                if (Position.MarketPosition != MarketPosition.Flat)
                    ExitLong("DailyLimit");
                return;
            }

            // ── Max trades per day guard ───────────────────────────────────────
            if (totalTradesDay >= MaxTradesPerDay) return;

            // ── Indicator values ──────────────────────────────────────────────
            double rsi14  = RSI(14, 3)[0];
            double ema20  = EMA(Close, 20)[0];
            double ema50  = EMA(Close, 50)[0];
            double atr14  = ATR(14)[0];
            double adx14  = ADX(14)[0];

            // ── Signal conditions (from VEDD AI analysis) ─────────────────────
            bool buyCondition  = ${buyConditions};

            bool sellCondition = ${sellConditions};

            // ── Entry logic ───────────────────────────────────────────────────
            if (buyCondition && Position.MarketPosition == MarketPosition.Flat)
            {
                EnterLong(ContractsPerTrade, "VEDDLong");
                double slLong = Close[0] - (atr14 * AtrStopMultiplier);
                double tpLong = Close[0] + (atr14 * AtrStopMultiplier * RiskRewardRatio);
                SetStopLoss("VEDDLong",    CalculationMode.Price, slLong, false);
                SetProfitTarget("VEDDLong", CalculationMode.Price, tpLong);
                if (UseTrailingStop)
                    SetTrailStop("VEDDLong", CalculationMode.Ticks, TrailingStopTicks, false);
                totalTradesDay++;
            }${sellBlock}
        }

        protected override void OnExecutionUpdate(
            Execution execution,
            string executionId,
            double price,
            int quantity,
            MarketPosition marketPosition,
            string orderId,
            DateTime time)
        {
            // Track realized P&L for daily loss circuit breaker
            if (execution.Order != null && execution.Order.OrderState == OrderState.Filled)
            {
                if (SystemPerformance.AllTrades.Count > 0)
                {
                    var lastTrade = SystemPerformance.AllTrades[SystemPerformance.AllTrades.Count - 1];
                    if (lastTrade.Exit.Time.Date == DateTime.Now.Date)
                        dailyRealizedPnL += lastTrade.ProfitCurrency;
                }
            }
        }

        #region Properties — NinjaTrader property grid display
        // Properties already defined above with NinjaScriptProperty attributes
        #endregion
    }
}
`;
}
