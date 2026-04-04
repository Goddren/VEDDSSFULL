// ─── VEDD Tradovate Route Handlers ────────────────────────────────────────────
// Futures trading API routes — mirrors server/routes.ts TradeLocker pattern

import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { encryptPassword, decryptPassword, TradovateService, getOrCreateTradovateService, executeFuturesSignal } from '../tradovate';
import { FUTURES_INSTRUMENTS, calculateContractSize, calculateContractRisk, getInstrument } from '../futures-instruments';
import { FUTURES_PROP_FIRM_PRESETS, evaluateFuturesDrawdown, buildPresetsTableResponse, getPreset } from '../futures-prop-firms';
import { generateNinjaScriptStrategy } from '../ninjatrader-generators';

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

export default router;
