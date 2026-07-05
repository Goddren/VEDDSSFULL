// ─── VEDD Moomoo Route Handlers ────────────────────────────────────────────────
// Moomoo (Futu) broker connection routes for futures trading.
// OpenD must be running locally on the server for real execution.
// Paper mode is always available and is the default when OpenD is unreachable.

import { Router, Request, Response } from 'express';
import { getOrCreateMoomooService, removeMoomooService, getMoomooService } from '../moomoo';

const router = Router();

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

// ── GET /api/moomoo/status ────────────────────────────────────────────────────
// Returns whether a Moomoo service is active for this user and whether it is
// in paper or live mode.
router.get('/moomoo/status', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const svc = getMoomooService(getUserId(req));
  if (!svc) return res.json({ connected: false, isPaper: true, message: 'Not connected' });
  res.json({
    connected: svc.isConnected(),
    isPaper: svc.isPaperMode(),
    openDConfigured: !!(process.env.MOOMOO_OPEND_URL || process.env.MOOMOO_ACCOUNT_ID),
    message: svc.isConnected()
      ? (svc.isPaperMode() ? 'Paper trading active' : 'Live OpenD connection active')
      : 'Connecting...',
  });
});

// ── POST /api/moomoo/connect ──────────────────────────────────────────────────
// Connect to Moomoo. If OpenD is unreachable, automatically falls back to paper
// mode so the futures scanner can still generate and simulate signals.
//
// Body: { accountId?: string, paperMode?: boolean, openDUrl?: string }
router.post('/moomoo/connect', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);

  try {
    const {
      accountId = process.env.MOOMOO_ACCOUNT_ID || 'PAPER',
      paperMode = false,
      openDUrl = process.env.MOOMOO_OPEND_URL || 'http://127.0.0.1:11111',
    } = req.body;

    const svc = getOrCreateMoomooService(userId, {
      accountId,
      isPaper: paperMode === true || paperMode === 'true',
      openDUrl,
    });

    const result = await svc.connect();
    res.json({
      success: result.success,
      isPaper: result.isPaper,
      message: result.isPaper
        ? 'Moomoo connected in paper mode (OpenD not required)'
        : 'Moomoo connected to live OpenD gateway',
      note: result.error,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/moomoo/connection ─────────────────────────────────────────────
router.delete('/moomoo/connection', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  removeMoomooService(getUserId(req));
  res.json({ success: true, message: 'Moomoo disconnected' });
});

// ── GET /api/moomoo/account ───────────────────────────────────────────────────
router.get('/moomoo/account', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const svc = getMoomooService(getUserId(req));
  if (!svc || !svc.isConnected()) return res.status(400).json({ error: 'Moomoo not connected. Call POST /api/moomoo/connect first.' });

  try {
    const info = await svc.getAccountInfo();
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/moomoo/options-chain/:underlyingCode ────────────────────────────
router.get('/moomoo/options-chain/:underlyingCode', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const svc = getMoomooService(getUserId(req));
  if (!svc || !svc.isConnected()) return res.status(400).json({ error: 'Moomoo not connected. Call POST /api/moomoo/connect first.' });

  try {
    const chain = await svc.getOptionsChain(req.params.underlyingCode);
    res.json({ chain });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/moomoo/options-order ───────────────────────────────────────────
// Body: { optionCode, direction: 'BUY'|'SELL', contracts, orderType?, limitPrice? }
// Requires OpenD with option trading permissions enabled on the Futu account.
router.post('/moomoo/options-order', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const svc = getMoomooService(getUserId(req));
  if (!svc || !svc.isConnected()) return res.status(400).json({ error: 'Moomoo not connected. Call POST /api/moomoo/connect first.' });

  const { optionCode, direction, contracts, orderType, limitPrice } = req.body;
  if (!optionCode || !direction || !contracts) {
    return res.status(400).json({ error: 'Missing required fields: optionCode, direction, contracts' });
  }

  try {
    const result = await svc.placeOptionsOrder({ optionCode, direction, contracts, orderType, limitPrice });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
