// ─── VEDD Tradovate Route Handlers ────────────────────────────────────────────
// Futures trading API routes — mirrors server/routes.ts TradeLocker pattern

import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { encryptPassword, decryptPassword, TradovateService, getOrCreateTradovateService, executeFuturesSignal } from '../tradovate';
import { FUTURES_INSTRUMENTS, calculateContractSize, calculateContractRisk, getInstrument } from '../futures-instruments';
import { FUTURES_PROP_FIRM_PRESETS, evaluateFuturesDrawdown, buildPresetsTableResponse, getPreset } from '../futures-prop-firms';
import { generateNinjaScriptStrategy, getFuturesStrategiesForSymbol, FUTURES_PROVEN_STRATEGIES } from '../ninjatrader-generators';
import {
  startFuturesScanner, stopFuturesScanner,
  getFuturesScannerState, getFuturesScannerActivities, getFuturesScannerSignals,
  recordFuturesTradeOutcome, DEFAULT_FUTURES_SYMBOLS,
  type FuturesScanConfig,
} from '../services/futures-scanner';

const router = Router();

// Auth guard helper
function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
  return true;
}

function getUserId(req: Request): number {
  return (req.user as any).id;
}

// ── GET /api/tradovate/api-status ─────────────────────────────────────────────
// Tells the frontend whether VEDD's Tradovate API app credentials are configured.
// cid/sec are APP-LEVEL (set once in Render by admin) — users only need their own username/password.
router.get('/tradovate/api-status', (_req: Request, res: Response) => {
  const cid = process.env.TRADOVATE_CID;
  const sec = process.env.TRADOVATE_SEC;
  const configured = !!(cid && parseInt(cid, 10) > 0 && sec && sec.length > 0);
  res.json({ configured, message: configured ? 'Tradovate API ready' : 'Tradovate API credentials not yet configured by admin' });
});

// ── GET /api/tradovate/connection ─────────────────────────────────────────────
router.get('/tradovate/connection', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  try {
    const connection = await storage.getUserTradovateConnection(getUserId(req));
    if (!connection) return res.json({ connected: false });
    const { encryptedPassword: _, accessToken, ...safe } = connection;
    res.json({ connected: true, ...safe });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tradovate/connection ────────────────────────────────────────────
router.post('/tradovate/connection', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  try {
    const existing = await storage.getUserTradovateConnection(userId);
    if (existing) return res.status(400).json({ error: 'Tradovate connection already exists. Delete it first.' });

    const { username, password, accountType, propFirmPreset, propFirmAccountSize } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    const encryptedPw = encryptPassword(password);

    // Test credentials and get account info
    let accountId: string | null = null;
    let startingBalance: number | null = null;
    try {
      const svc = new TradovateService(accountType || 'demo');
      await svc.authenticate(username, password);
      const accounts = await svc.getAccounts();
      if (accounts.length > 0) {
        accountId = accounts[0].id.toString();
        startingBalance = accounts[0].balance;
      }
    } catch (authErr: any) {
      return res.status(400).json({ error: `Tradovate authentication failed: ${authErr.message}` });
    }

    const connection = await storage.createTradovateConnection({
      userId,
      username,
      encryptedPassword: encryptedPw,
      accountType: accountType || 'demo',
      accountId,
      isActive: true,
      propFirmPreset: propFirmPreset || null,
      propFirmAccountSize: propFirmAccountSize || null,
      startingBalance,
      peakEquity: startingBalance,
    });

    const { encryptedPassword: _pw, accessToken, ...safe } = connection;
    res.json({ connected: true, ...safe, startingBalance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/tradovate/connection ───────────────────────────────────────────
router.patch('/tradovate/connection', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  try {
    const connection = await storage.getUserTradovateConnection(userId);
    if (!connection) return res.status(404).json({ error: 'No Tradovate connection found' });

    const allowed = ['propFirmPreset', 'propFirmAccountSize', 'isActive'];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const updated = await storage.updateTradovateConnection(connection.id, updates);
    const { encryptedPassword: _, accessToken, ...safe } = updated!;
    res.json(safe);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/tradovate/connection ──────────────────────────────────────────
router.delete('/tradovate/connection', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  try {
    const connection = await storage.getUserTradovateConnection(userId);
    if (!connection) return res.status(404).json({ error: 'No Tradovate connection found' });
    await storage.deleteTradovateConnection(connection.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tradovate/test ───────────────────────────────────────────────────
router.post('/tradovate/test', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  try {
    const connection = await storage.getUserTradovateConnection(userId);
    if (!connection) return res.status(404).json({ error: 'No Tradovate connection found' });

    const svc = await getOrCreateTradovateService(
      userId, connection.username, connection.encryptedPassword,
      connection.accountType, connection.accountId,
      connection.accessToken, connection.tokenExpiresAt,
    );

    const account = await svc.getAccount();
    const positions = await svc.getPositions();

    // Update peak equity if needed
    if (connection.peakEquity === null || account.equity > (connection.peakEquity || 0)) {
      await storage.updateTradovateConnection(connection.id, { peakEquity: account.equity, lastConnectedAt: new Date() });
    }

    // Build drawdown status if prop firm preset is configured
    let drawdownStatus = null;
    if (connection.propFirmPreset && connection.propFirmAccountSize && connection.startingBalance) {
      const preset = getPreset(connection.propFirmPreset);
      if (preset) {
        const todayPnL = account.closedPnL + account.openPnL; // approximate
        drawdownStatus = evaluateFuturesDrawdown(
          preset,
          connection.propFirmAccountSize,
          account.balance,
          connection.peakEquity || account.balance,
          connection.startingBalance,
          todayPnL,
        );
      }
    }

    res.json({ success: true, account, positions, drawdownStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tradovate/account ─────────────────────────────────────────────────
router.get('/tradovate/account', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  try {
    const connection = await storage.getUserTradovateConnection(userId);
    if (!connection?.isActive) return res.status(404).json({ error: 'No active Tradovate connection' });

    const svc = await getOrCreateTradovateService(
      userId, connection.username, connection.encryptedPassword,
      connection.accountType, connection.accountId,
      connection.accessToken, connection.tokenExpiresAt,
    );

    const account = await svc.getAccount();

    // Update peak equity
    if (account.equity > (connection.peakEquity || 0)) {
      await storage.updateTradovateConnection(connection.id, { peakEquity: account.equity });
    }

    let drawdownStatus = null;
    if (connection.propFirmPreset && connection.propFirmAccountSize && connection.startingBalance) {
      const preset = getPreset(connection.propFirmPreset);
      if (preset) {
        const todayPnL = account.openPnL + account.closedPnL;
        drawdownStatus = evaluateFuturesDrawdown(
          preset, connection.propFirmAccountSize,
          account.balance, connection.peakEquity || account.balance,
          connection.startingBalance, todayPnL,
        );
      }
    }

    res.json({ account, drawdownStatus, propFirmPreset: connection.propFirmPreset });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tradovate/positions ───────────────────────────────────────────────
router.get('/tradovate/positions', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  try {
    const connection = await storage.getUserTradovateConnection(userId);
    if (!connection?.isActive) return res.json({ positions: [] });

    const svc = await getOrCreateTradovateService(
      userId, connection.username, connection.encryptedPassword,
      connection.accountType, connection.accountId,
      connection.accessToken, connection.tokenExpiresAt,
    );

    const positions = await svc.getPositions();
    res.json({ positions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tradovate/trades ──────────────────────────────────────────────────
router.get('/tradovate/trades', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  try {
    const logs = await storage.getTradovateTradeLogs(userId, 100);
    res.json({ trades: logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tradovate/execute ────────────────────────────────────────────────
router.post('/tradovate/execute', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  try {
    const connection = await storage.getUserTradovateConnection(userId);
    if (!connection?.isActive) return res.status(404).json({ error: 'No active Tradovate connection' });

    const { symbol, direction, contracts, stopLoss, takeProfit, action = 'OPEN' } = req.body;
    if (!symbol || !direction || !contracts) {
      return res.status(400).json({ error: 'symbol, direction, and contracts are required' });
    }

    // Pre-flight: check drawdown status
    if (connection.propFirmPreset && connection.propFirmAccountSize && connection.startingBalance) {
      const preset = getPreset(connection.propFirmPreset);
      if (preset) {
        // Quick safety check — pull account balance
        try {
          const svc = await getOrCreateTradovateService(
            userId, connection.username, connection.encryptedPassword,
            connection.accountType, connection.accountId,
            connection.accessToken, connection.tokenExpiresAt,
          );
          const account = await svc.getAccount();
          const ddStatus = evaluateFuturesDrawdown(
            preset, connection.propFirmAccountSize,
            account.balance, connection.peakEquity || account.balance,
            connection.startingBalance, account.openPnL + account.closedPnL,
          );
          if (ddStatus.blockedByTrailingDD || ddStatus.blockedByDailyLimit) {
            return res.status(400).json({
              error: ddStatus.verdictReason || 'Trade blocked by prop firm rules',
              drawdownStatus: ddStatus,
            });
          }
        } catch (_) { /* non-blocking — proceed if account fetch fails */ }
      }
    }

    const result = await executeFuturesSignal(
      { ...connection, userId },
      { action, symbol, direction, contracts: parseInt(contracts), stopLoss, takeProfit },
    );

    // Log the trade
    const inst = getInstrument(symbol);
    await storage.createTradovateTradeLog({
      connectionId: connection.id,
      userId,
      action,
      symbol: symbol.toUpperCase(),
      direction,
      contracts: parseInt(contracts),
      stopLoss: stopLoss || null,
      takeProfit: takeProfit || null,
      tradovateOrderId: result.orderId?.toString() || null,
      status: result.success ? 'executed' : 'failed',
      errorMessage: result.error || null,
      tickValue: inst?.tickValue || null,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, orderId: result.orderId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/futures/instruments ──────────────────────────────────────────────
router.get('/futures/instruments', (_req: Request, res: Response) => {
  res.json({ instruments: Object.values(FUTURES_INSTRUMENTS) });
});

// ── GET /api/futures/strategies/:symbol ───────────────────────────────────────
// Returns the VEDD proven strategies for a given futures symbol
router.get('/futures/strategies/:symbol', (req: Request, res: Response) => {
  const { symbol } = req.params;
  const strategies = getFuturesStrategiesForSymbol(symbol);
  res.json({ symbol: symbol.toUpperCase(), strategies, total: FUTURES_PROVEN_STRATEGIES.length });
});

// ── GET /api/futures/strategies ────────────────────────────────────────────────
// Returns all proven strategies
router.get('/futures/strategies', (_req: Request, res: Response) => {
  res.json({ strategies: FUTURES_PROVEN_STRATEGIES });
});

// ── GET /api/futures/prop-firm-presets ────────────────────────────────────────
router.get('/futures/prop-firm-presets', (_req: Request, res: Response) => {
  res.json({ presets: buildPresetsTableResponse() });
});

// ── POST /api/futures/contract-size ───────────────────────────────────────────
router.post('/futures/contract-size', (req: Request, res: Response) => {
  const { symbol, accountBalance, riskPercent, entryPrice, stopLossPrice } = req.body;
  if (!symbol || !accountBalance || !riskPercent) {
    return res.status(400).json({ error: 'symbol, accountBalance, riskPercent required' });
  }
  const inst = getInstrument(symbol);
  if (!inst) return res.status(400).json({ error: `Unknown futures symbol: ${symbol}` });

  if (entryPrice && stopLossPrice) {
    const contracts = calculateContractSize(symbol, accountBalance, riskPercent, entryPrice, stopLossPrice);
    const risk = calculateContractRisk(symbol, entryPrice, stopLossPrice, contracts);
    return res.json({ contracts, dollarRisk: risk.dollarRisk, ticks: risk.ticks, instrument: inst });
  }

  // Without SL price: show dollar risk for 1 contract at default SL distance
  const defaultSlTicks = 20;
  const dollarRiskPerContract = defaultSlTicks * inst.tickValue;
  const maxContracts = Math.floor((accountBalance * riskPercent / 100) / dollarRiskPerContract);
  res.json({ contracts: Math.max(1, maxContracts), dollarRisk: dollarRiskPerContract * Math.max(1, maxContracts), instrument: inst });
});

// ── POST /api/futures/generate-ninjatrader ────────────────────────────────────
router.post('/futures/generate-ninjatrader', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { symbol, analyses, config } = req.body;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    const code = generateNinjaScriptStrategy(symbol, analyses || [], config || {});
    const safeSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const safeName = (config?.strategyName || `VEDD_${safeSymbol}_Strategy`).replace(/[^a-zA-Z0-9_]/g, '_');
    const filename = `${safeName}.cs`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(code);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Futures AI Engine — persisted config (FX SS AI Engine parity) ──────────
router.get('/futures-engine/config', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  let config = await storage.getUserFuturesEngineConfig(userId);
  if (!config) config = await storage.upsertFuturesEngineConfig(userId, {});
  res.json(config);
});

router.patch('/futures-engine/config', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  const allowed = [
    'isActive', 'symbols', 'scanIntervalMs', 'strategyMode', 'singleStrategyMode', 'directionFilter',
    'maxOpenTrades', 'maxContractsPerTrade', 'riskPerTrade', 'minConfidence', 'weeklyProfitTarget',
    'accountBalance', 'enableCompounding', 'propFirmMode', 'propFirmDailyDrawdownLimit', 'dailyLossLimit',
    'dailyProfitTarget', 'maxDailyTrades', 'executionSource', 'lockSettings', 'aiMode', 'enableAutoExecution',
    'useKellyCriterion', 'brainLearningMode', 'drawdownShieldThreshold', 'copyMode', 'volatileCapMode',
    'trailMethod', 'trailActivationR', 'trailFixedR', 'trailStepR', 'trailProfitLockPct',
    'trailSarInitialAF', 'trailSarMaxAF', 'breakevenBufferR',
    'propFirmPreset', 'propFirmAllowOvernightHolds', 'consistencyEnforcementEnabled',
    'consistencyMinProfitableDays', 'consistencyPeriodDays', 'maxDailyProfitPctOfTotal',
    'weeklyProfitTargetIsPercent',
    'tradingDaysOfWeek', 'symbolDaySchedule', 'symbolDirectionOverrides', 'symbolContractOverrides',
    'smartSymbolEscalation', 'highConfidenceOverride', 'enableCompositeAutonomous', 'compositeMinEdgeScore',
  ];
  const updateData: Record<string, any> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updateData[key] = req.body[key];
  }
  const config = await storage.upsertFuturesEngineConfig(userId, updateData);
  res.json(config);
});

// ── Futures AI Engine — Self-Learning Brain ────────────────────────────────
router.post('/futures-brain/learn', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  const { runFuturesBrainLearning } = await import('../services/futures-brain');
  const brain = await runFuturesBrainLearning(userId);
  res.json({ learned: true, ...brain });
});

router.get('/futures-brain/status', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  const { getOrRefreshFuturesBrain } = await import('../services/futures-brain');
  const brain = await getOrRefreshFuturesBrain(userId);
  res.json({ learned: !!brain, ...(brain || {}) });
});

router.get('/futures-brain/summary', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  const trades = await storage.getUserFuturesEngineTrades(userId, 500);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const closed = trades.filter(t => t.status === 'closed' && t.closedAt && new Date(t.closedAt).getTime() >= cutoff);
  const byStrategy: Record<string, { trades: number; wins: number }> = {};
  const bySymbol: Record<string, { strategy: string; trades: number; wins: number; totalR: number }> = {};
  for (const t of closed) {
    byStrategy[t.strategy] = byStrategy[t.strategy] || { trades: 0, wins: 0 };
    byStrategy[t.strategy].trades++;
    const won = (t.realizedPnl ?? 0) > 0;
    if (won) byStrategy[t.strategy].wins++;
    const riskDist = t.stopLoss ? Math.abs(t.entryPrice - t.stopLoss) : 0;
    const rMultiple = riskDist > 0 && t.exitPrice ? Math.abs(t.exitPrice - t.entryPrice) / riskDist * (won ? 1 : -1) : 0;
    const key = `${t.symbol}|${t.strategy}`;
    bySymbol[key] = bySymbol[key] || { strategy: t.strategy, trades: 0, wins: 0, totalR: 0 };
    bySymbol[key].trades++;
    if (won) bySymbol[key].wins++;
    bySymbol[key].totalR += rMultiple;
  }
  const sourceBreakdown = Object.entries(byStrategy).map(([strategy, v]) => ({
    strategy, trades: v.trades, winRate: v.trades > 0 ? Math.round((v.wins / v.trades) * 100) : 0,
  }));
  const topSetups = Object.entries(bySymbol)
    .map(([key, v]) => ({
      symbol: key.split('|')[0], strategy: v.strategy, trades: v.trades,
      winRate: v.trades > 0 ? Math.round((v.wins / v.trades) * 100) : 0,
      avgR: v.trades > 0 ? v.totalR / v.trades : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 15);
  res.json({ sourceBreakdown, topSetups, totalClosedLast30d: closed.length });
});

// ── Futures AI Engine — Dual-Vote Consensus ────────────────────────────────
router.get('/futures-engine/consensus', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  const consensus = (global as any).futuresEngineConsensus?.[userId] || [];
  const summary = {
    strongConfirm: consensus.filter((c: any) => c.consensus === 'STRONG_CONFIRM').length,
    strongSkip: consensus.filter((c: any) => c.consensus === 'STRONG_SKIP').length,
    caution: consensus.filter((c: any) => c.consensus === 'CAUTION').length,
    watch: consensus.filter((c: any) => c.consensus === 'WATCH').length,
  };
  res.json({ consensus, summary, updatedAt: consensus[0]?.timestamp || null });
});

// ── POST /api/tradovate/scanner/start ─────────────────────────────────────────
router.post('/tradovate/scanner/start', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  try {
    const connection = await storage.getUserTradovateConnection(userId);
    const persisted = await storage.getUserFuturesEngineConfig(userId);

    // Persist any settings the client just changed before starting, then
    // build the scanner config from the durable row — never from raw,
    // un-persisted client-supplied literals (that was the old behavior).
    const allowedOverrides = [
      'symbols', 'scanIntervalMs', 'minConfidence', 'maxOpenTrades', 'riskPerTrade', 'accountBalance',
      'aiMode', 'propFirmDailyDrawdownLimit', 'enableAutoExecution', 'directionFilter', 'dailyLossLimit',
      'dailyProfitTarget', 'maxDailyTrades', 'useKellyCriterion', 'brainLearningMode', 'drawdownShieldThreshold',
      'trailMethod', 'trailActivationR', 'trailFixedR', 'trailStepR', 'trailProfitLockPct',
      'trailSarInitialAF', 'trailSarMaxAF', 'breakevenBufferR', 'propFirmMode',
      'consistencyEnforcementEnabled', 'consistencyMinProfitableDays', 'consistencyPeriodDays',
      'maxDailyProfitPctOfTotal', 'tradingDaysOfWeek', 'symbolDaySchedule', 'symbolDirectionOverrides',
      'symbolContractOverrides', 'smartSymbolEscalation', 'highConfidenceOverride',
      'enableCompositeAutonomous', 'compositeMinEdgeScore',
    ];
    const overrides: Record<string, any> = {};
    for (const key of allowedOverrides) {
      if (req.body[key] !== undefined) overrides[key] = req.body[key];
    }
    const row = await storage.upsertFuturesEngineConfig(userId, { ...overrides, isActive: true });

    const config: FuturesScanConfig = {
      userId,
      symbols: Array.isArray(row.symbols) && row.symbols.length > 0 ? row.symbols as string[] : DEFAULT_FUTURES_SYMBOLS,
      scanIntervalMs: row.scanIntervalMs,
      minConfidence: row.minConfidence,
      maxOpenTrades: row.maxOpenTrades,
      riskPerTrade: row.riskPerTrade,
      accountBalance: row.accountBalance,
      aiMode: row.aiMode as 'full' | 'economy' | 'rule_based',
      propFirmDailyDrawdownLimit: row.propFirmDailyDrawdownLimit,
      enableAutoExecution: row.enableAutoExecution === true && !!(connection?.isActive),
      directionFilter: row.directionFilter as 'long_only' | 'short_only' | 'both',
      dailyLossLimit: row.dailyLossLimit,
      dailyProfitTarget: row.dailyProfitTarget,
      maxDailyTrades: row.maxDailyTrades,
      useKellyCriterion: row.useKellyCriterion,
      brainLearningMode: row.brainLearningMode,
      drawdownShieldThreshold: row.drawdownShieldThreshold,
      trailMethod: row.trailMethod as FuturesScanConfig['trailMethod'],
      trailActivationR: row.trailActivationR,
      trailFixedR: row.trailFixedR,
      trailStepR: row.trailStepR,
      trailProfitLockPct: row.trailProfitLockPct,
      trailSarInitialAF: row.trailSarInitialAF,
      trailSarMaxAF: row.trailSarMaxAF,
      breakevenBufferR: row.breakevenBufferR,
      propFirmMode: row.propFirmMode,
      consistencyEnforcementEnabled: row.consistencyEnforcementEnabled,
      consistencyMinProfitableDays: row.consistencyMinProfitableDays,
      consistencyPeriodDays: row.consistencyPeriodDays,
      maxDailyProfitPctOfTotal: row.maxDailyProfitPctOfTotal,
      tradingDaysOfWeek: (row.tradingDaysOfWeek as number[]) || [1, 2, 3, 4, 5],
      symbolDaySchedule: (row.symbolDaySchedule as Record<string, number[]>) || {},
      symbolDirectionOverrides: (row.symbolDirectionOverrides as Record<string, string>) || {},
      symbolContractOverrides: (row.symbolContractOverrides as Record<string, number>) || {},
      smartSymbolEscalation: row.smartSymbolEscalation,
      highConfidenceOverride: row.highConfidenceOverride,
      enableCompositeAutonomous: row.enableCompositeAutonomous,
      compositeMinEdgeScore: row.compositeMinEdgeScore,
    };

    const state = startFuturesScanner(config);
    res.json({ success: true, status: state.status, config: state.config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tradovate/scanner/stop ──────────────────────────────────────────
router.post('/tradovate/scanner/stop', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  stopFuturesScanner(userId);
  await storage.upsertFuturesEngineConfig(userId, { isActive: false }).catch(() => {});
  res.json({ success: true, status: 'stopped' });
});

// ── GET /api/tradovate/scanner/status ─────────────────────────────────────────
router.get('/tradovate/scanner/status', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  const state = getFuturesScannerState(userId);
  if (!state) return res.json({ status: 'stopped', running: false });
  res.json({
    status: state.status,
    running: state.status === 'running',
    scanCount: state.scanCount,
    lastScanAt: state.lastScanAt,
    wins: state.wins,
    losses: state.losses,
    dailyLossHalted: state.dailyLossHalted,
    config: state.config,
    marketSnapshot: state.marketSnapshot,
    symbolPerformance: state.symbolPerformance,
  });
});

// ── GET /api/tradovate/scanner/activities ─────────────────────────────────────
router.get('/tradovate/scanner/activities', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  const limit = parseInt((req.query.limit as string) || '50', 10);
  res.json({ activities: getFuturesScannerActivities(userId, limit) });
});

// ── GET /api/tradovate/scanner/signals ────────────────────────────────────────
router.get('/tradovate/scanner/signals', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  const limit = parseInt((req.query.limit as string) || '20', 10);
  res.json({ signals: getFuturesScannerSignals(userId, limit) });
});

// ── POST /api/tradovate/scanner/outcome ──────────────────────────────────────
// Call this when a trade closes to feed the self-learning system
router.post('/tradovate/scanner/outcome', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  const { symbol, won, rMultiple } = req.body;
  if (!symbol || typeof won !== 'boolean') return res.status(400).json({ error: 'symbol and won required' });
  recordFuturesTradeOutcome(userId, symbol, won, rMultiple || 0);
  res.json({ success: true });
});

export default router;
