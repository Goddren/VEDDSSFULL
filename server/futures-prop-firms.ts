// ─── VEDD Futures Prop Firm Rules Engine ──────────────────────────────────────
// Preset rule tables and trailing drawdown evaluator for all major futures prop firms

export interface FuturesPropFirmPreset {
  id: string;
  name: string;
  logo?: string;
  accountSizes: number[];
  dailyLossLimit: (accountSize: number) => number;
  trailingMaxDrawdown: (accountSize: number) => number;
  profitTarget: (accountSize: number) => number;
  consistencyRule: string | null;
  allowOvernightHolds: boolean;
  allowWeekendHolds: boolean;
  newsBlockMinutes: number;
  maxContractsAllowed?: (accountSize: number) => number;
  notes?: string;
}

export const FUTURES_PROP_FIRM_PRESETS: Record<string, FuturesPropFirmPreset> = {
  TOPSTEP: {
    id: 'TOPSTEP',
    name: 'Topstep',
    accountSizes: [50000, 100000, 150000],
    dailyLossLimit: (s) => ({ 50000: 2000, 100000: 3000, 150000: 4500 }[s] ?? s * 0.04),
    trailingMaxDrawdown: (s) => ({ 50000: 3000, 100000: 5000, 150000: 6000 }[s] ?? s * 0.06),
    profitTarget: (s) => ({ 50000: 3000, 100000: 6000, 150000: 9000 }[s] ?? s * 0.06),
    consistencyRule: 'No single trading day > 30% of total profit target',
    allowOvernightHolds: false,
    allowWeekendHolds: false,
    newsBlockMinutes: 2,
    maxContractsAllowed: (s) => ({ 50000: 10, 100000: 20, 150000: 30 }[s] ?? 10),
    notes: 'Trailing drawdown starts at account size, rises with peak equity. Position size limits enforced by platform.',
  },
  APEX: {
    id: 'APEX',
    name: 'Apex Trader Funding',
    accountSizes: [25000, 50000, 100000, 150000, 250000, 300000],
    dailyLossLimit: (s) => ({ 25000: 1500, 50000: 2500, 100000: 3000, 150000: 4500, 250000: 6500, 300000: 7500 }[s] ?? s * 0.025),
    trailingMaxDrawdown: (s) => ({ 25000: 1500, 50000: 2500, 100000: 3000, 150000: 4500, 250000: 6500, 300000: 7500 }[s] ?? s * 0.025),
    profitTarget: (s) => ({ 25000: 1500, 50000: 3000, 100000: 6000, 150000: 9000, 250000: 15000, 300000: 20000 }[s] ?? s * 0.06),
    consistencyRule: null,
    allowOvernightHolds: true,
    allowWeekendHolds: false,
    newsBlockMinutes: 0,
    notes: 'No consistency rule. Overnight holds allowed. One of the most flexible prop firms for active traders.',
  },
  BULENOX: {
    id: 'BULENOX',
    name: 'Bulenox',
    accountSizes: [10000, 25000, 50000, 100000],
    dailyLossLimit: (s) => ({ 10000: 800, 25000: 1200, 50000: 2000, 100000: 3000 }[s] ?? s * 0.04),
    trailingMaxDrawdown: (s) => ({ 10000: 1000, 25000: 1500, 50000: 2500, 100000: 3500 }[s] ?? s * 0.05),
    profitTarget: (s) => ({ 10000: 1000, 25000: 1500, 50000: 3000, 100000: 6000 }[s] ?? s * 0.06),
    consistencyRule: null,
    allowOvernightHolds: true,
    allowWeekendHolds: false,
    newsBlockMinutes: 0,
    notes: 'Smallest account size available at $10K. Good for micro-contract traders.',
  },
  EARN2TRADE: {
    id: 'EARN2TRADE',
    name: 'Earn2Trade',
    accountSizes: [25000, 50000, 100000, 150000],
    dailyLossLimit: (s) => ({ 25000: 1000, 50000: 1500, 100000: 2500, 150000: 3500 }[s] ?? s * 0.03),
    trailingMaxDrawdown: (s) => ({ 25000: 1500, 50000: 2500, 100000: 4000, 150000: 5000 }[s] ?? s * 0.05),
    profitTarget: (s) => ({ 25000: 2000, 50000: 4000, 100000: 8000, 150000: 12000 }[s] ?? s * 0.08),
    consistencyRule: 'Best 10 of 15 trading days must show profit to qualify for payout',
    allowOvernightHolds: true,
    allowWeekendHolds: false,
    newsBlockMinutes: 0,
    notes: 'Consistency rule requires discipline. Highest profit targets relative to account size.',
  },
  TAKEPROFITTRADER: {
    id: 'TAKEPROFITTRADER',
    name: 'Take Profit Trader',
    accountSizes: [25000, 50000, 100000, 150000, 250000],
    dailyLossLimit: (s) => s * 0.04,
    trailingMaxDrawdown: (s) => s * 0.05,
    profitTarget: (s) => s * 0.06,
    consistencyRule: null,
    allowOvernightHolds: true,
    allowWeekendHolds: true,
    newsBlockMinutes: 0,
    notes: 'Weekend holds allowed — one of the few firms permitting this. Flexible rules overall.',
  },
};

export interface FuturesDrawdownStatus {
  currentBalance: number;
  peakEquity: number;
  startingBalance: number;
  drawdownFloor: number;          // absolute floor: peakEquity - trailingMaxDD
  distanceToFloor: number;        // currentBalance - drawdownFloor
  distanceToFloorPct: number;     // as % of trailingMaxDD
  dailyLoss: number;              // today's P&L (negative = loss)
  dailyLossRemaining: number;     // dailyLossLimit - abs(dailyLoss)
  dailyLossUsedPct: number;       // % of daily limit consumed
  profitGained: number;           // currentBalance - startingBalance
  progressToTarget: number;       // 0-100%
  trailingMaxDD: number;
  dailyLossLimit: number;
  profitTarget: number;
  verdict: 'SAFE' | 'WARNING' | 'DANGER' | 'BREACHED';
  verdictReason: string | null;
  blockedByDailyLimit: boolean;
  blockedByTrailingDD: boolean;
}

export function evaluateFuturesDrawdown(
  preset: FuturesPropFirmPreset,
  accountSize: number,
  currentBalance: number,
  peakEquity: number,
  startingBalance: number,
  todayPnL: number,
): FuturesDrawdownStatus {
  const trailingMaxDD = preset.trailingMaxDrawdown(accountSize);
  const dailyLossLimit = preset.dailyLossLimit(accountSize);
  const profitTarget = preset.profitTarget(accountSize);

  const drawdownFloor = peakEquity - trailingMaxDD;
  const distanceToFloor = currentBalance - drawdownFloor;
  const distanceToFloorPct = (distanceToFloor / trailingMaxDD) * 100;

  const dailyLoss = Math.min(0, todayPnL);
  const dailyLossAbs = Math.abs(dailyLoss);
  const dailyLossRemaining = Math.max(0, dailyLossLimit - dailyLossAbs);
  const dailyLossUsedPct = (dailyLossAbs / dailyLossLimit) * 100;

  const profitGained = currentBalance - startingBalance;
  const progressToTarget = Math.max(0, Math.min(100, (profitGained / profitTarget) * 100));

  const blockedByTrailingDD = currentBalance <= drawdownFloor;
  const blockedByDailyLimit = dailyLossAbs >= dailyLossLimit;

  let verdict: FuturesDrawdownStatus['verdict'] = 'SAFE';
  let verdictReason: string | null = null;

  if (blockedByTrailingDD) {
    verdict = 'BREACHED';
    verdictReason = `Trailing max drawdown breached — account floor was $${drawdownFloor.toFixed(0)}`;
  } else if (blockedByDailyLimit) {
    verdict = 'DANGER';
    verdictReason = `Daily loss limit of $${dailyLossLimit.toFixed(0)} reached — no more trades today`;
  } else if (distanceToFloor < 200 || dailyLossRemaining < 150) {
    verdict = 'DANGER';
    verdictReason = distanceToFloor < 200
      ? `Only $${distanceToFloor.toFixed(0)} above trailing drawdown floor`
      : `Only $${dailyLossRemaining.toFixed(0)} daily loss budget remaining`;
  } else if (distanceToFloorPct < 30 || dailyLossUsedPct > 70) {
    verdict = 'WARNING';
    verdictReason = distanceToFloorPct < 30
      ? `Approaching trailing DD floor (${distanceToFloorPct.toFixed(0)}% buffer left)`
      : `${dailyLossUsedPct.toFixed(0)}% of daily loss limit consumed`;
  }

  return {
    currentBalance, peakEquity, startingBalance,
    drawdownFloor, distanceToFloor, distanceToFloorPct,
    dailyLoss, dailyLossRemaining, dailyLossUsedPct,
    profitGained, progressToTarget,
    trailingMaxDD, dailyLossLimit, profitTarget,
    verdict, verdictReason,
    blockedByDailyLimit, blockedByTrailingDD,
  };
}

export function getPreset(presetId: string): FuturesPropFirmPreset | undefined {
  return FUTURES_PROP_FIRM_PRESETS[presetId.toUpperCase()];
}

export function buildPresetsTableResponse() {
  return Object.values(FUTURES_PROP_FIRM_PRESETS).map(p => ({
    id: p.id,
    name: p.name,
    accountSizes: p.accountSizes,
    allowOvernightHolds: p.allowOvernightHolds,
    allowWeekendHolds: p.allowWeekendHolds,
    newsBlockMinutes: p.newsBlockMinutes,
    consistencyRule: p.consistencyRule,
    notes: p.notes || null,
    rulesTable: p.accountSizes.map(size => ({
      accountSize: size,
      dailyLossLimit: p.dailyLossLimit(size),
      trailingMaxDrawdown: p.trailingMaxDrawdown(size),
      profitTarget: p.profitTarget(size),
      maxContracts: p.maxContractsAllowed ? p.maxContractsAllowed(size) : null,
    })),
  }));
}
