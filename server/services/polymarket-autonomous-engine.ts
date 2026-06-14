/**
 * VEDD Polymarket Autonomous Engine
 *
 * Completely separate from the forex live trading engine.
 * Monitors Polymarket BTC prediction market sentiment and opens
 * YES/NO positions DIRECTLY on Polymarket — not on TradeLocker or MT5.
 *
 * Paper mode (default): tracks real probabilities, no actual chain calls.
 * Live mode: signs CLOB limit orders via EIP-712 using the user's Polygon
 *   private key. Requires VPN for US users (Polymarket geo-blocks US IPs).
 *
 * P&L model: shares = stake / (entryProb / 100), value = shares × (currentProb / 100).
 */

import { getPolymarketBTCSentiment, type PolymarketMarket, type PolymarketBTCSentiment } from './polymarket';

// ── Live CLOB order placement ─────────────────────────────────────────────────

const CLOB_BASE   = 'https://clob.polymarket.com';
const POLY_CHAIN  = 137; // Polygon
const CTF_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

async function placeClobOrder(
  privateKey: string,
  tokenId: string,
  side: 'BUY' | 'SELL',
  priceFloat: number,  // 0.0–1.0
  sizeUsdc: number,    // USDC (6 decimals internally)
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const { ethers } = await import('ethers');
    const wallet = new ethers.Wallet(privateKey);

    // Build CLOB EIP-712 order
    const salt     = BigInt(Math.floor(Math.random() * 1e15));
    const now      = BigInt(Math.floor(Date.now() / 1000));
    const expiry   = now + BigInt(3600); // 1 h TTL
    const makerAmt = BigInt(Math.round(sizeUsdc * 1e6));         // USDC 6 dp
    const takerAmt = BigInt(Math.round(sizeUsdc / priceFloat * 1e6));

    const domain = {
      name:              'Polymarket CTF Exchange',
      version:           '1',
      chainId:           POLY_CHAIN,
      verifyingContract: CTF_ADDRESS,
    };
    const types = {
      Order: [
        { name: 'salt',          type: 'uint256' },
        { name: 'maker',         type: 'address' },
        { name: 'signer',        type: 'address' },
        { name: 'taker',         type: 'address' },
        { name: 'tokenId',       type: 'uint256' },
        { name: 'makerAmount',   type: 'uint256' },
        { name: 'takerAmount',   type: 'uint256' },
        { name: 'expiration',    type: 'uint256' },
        { name: 'nonce',         type: 'uint256' },
        { name: 'feeRateBps',    type: 'uint256' },
        { name: 'side',          type: 'uint8'   },
        { name: 'signatureType', type: 'uint8'   },
      ],
    };
    const orderValues = {
      salt,
      maker:         wallet.address,
      signer:        wallet.address,
      taker:         '0x0000000000000000000000000000000000000000',
      tokenId:       BigInt(tokenId),
      makerAmount:   makerAmt,
      takerAmount:   takerAmt,
      expiration:    expiry,
      nonce:         BigInt(0),
      feeRateBps:    BigInt(0),
      side:          side === 'BUY' ? 0 : 1,
      signatureType: 0,
    };

    const signature = await wallet.signTypedData(domain, types, orderValues);

    const body = {
      order: {
        salt:            salt.toString(),
        maker:           wallet.address,
        signer:          wallet.address,
        taker:           '0x0000000000000000000000000000000000000000',
        tokenId,
        makerAmount:     makerAmt.toString(),
        takerAmount:     takerAmt.toString(),
        expiration:      expiry.toString(),
        nonce:           '0',
        feeRateBps:      '0',
        side:            side === 'BUY' ? 0 : 1,
        signatureType:   0,
        signature,
      },
      owner:     wallet.address,
      orderType: 'GTC',
    };

    const res = await fetch(`${CLOB_BASE}/order`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(12000),
    });

    const data = await res.json() as any;
    if (!res.ok || data.error) {
      return { success: false, error: data.error ?? `CLOB ${res.status}` };
    }
    return { success: true, orderId: data.orderID ?? data.order_id ?? 'unknown' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Live-mode per-user store ──────────────────────────────────────────────────
const _liveModes   = new Map<number, boolean>();
const _privateKeys = new Map<number, string>();

export function setPolymarketLiveMode(userId: number, enabled: boolean, privateKey: string | null): void {
  _liveModes.set(userId, enabled);
  if (privateKey) _privateKeys.set(userId, privateKey);
  else            _privateKeys.delete(userId);
  // Reset paper flag on the engine state
  const s = getEngineState(userId);
  s.isPaperMode = !enabled;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PolymarketPosition {
  id: string;
  market: {
    id: string;
    question: string;
    endDate: string | null;
  };
  side: 'YES' | 'NO';
  direction: 'BUY' | 'SELL';
  entryProbability: number;
  currentProbability: number;
  stake: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  openedAt: string;
  signal: {
    bullishScore: number;
    sentimentLabel: string;
    direction: string;
  };
  status: 'open' | 'closed' | 'resolved';
  closedAt?: string;
  closedProbability?: number;
  realizedPnl?: number;
}

export interface PolymarketEngineConfig {
  /** Minimum bullish score (0-100) to open a BUY (YES) position */
  minBullishScore: number;
  /** Minimum score inversion (100 - score ≥ this) to open a SELL position */
  minBearishScore: number;
  /** USDC stake per position (paper mode: simulated) */
  stakePerTrade: number;
  /** Max concurrent open positions */
  maxOpenPositions: number;
  /** Minutes to wait before opening another position */
  cooldownMinutes: number;
}

export interface PolymarketEngineState {
  isRunning: boolean;
  isPaperMode: boolean;
  lastScanAt: string | null;
  lastTradeAt: string | null;
  lastScanResult: string | null;
  openPositions: PolymarketPosition[];
  closedPositions: PolymarketPosition[];
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  tradesOpened: number;
  config: PolymarketEngineConfig;
}

// ── In-memory state per user ──────────────────────────────────────────────────

const _states = new Map<number, PolymarketEngineState>();
const _intervals = new Map<number, ReturnType<typeof setInterval>>();

const DEFAULT_CONFIG: PolymarketEngineConfig = {
  minBullishScore: 70,
  minBearishScore: 70,
  stakePerTrade: 10,
  maxOpenPositions: 3,
  cooldownMinutes: 30,
};

export function getEngineState(userId: number): PolymarketEngineState {
  if (!_states.has(userId)) {
    _states.set(userId, {
      isRunning: false,
      isPaperMode: true,
      lastScanAt: null,
      lastTradeAt: null,
      lastScanResult: null,
      openPositions: [],
      closedPositions: [],
      totalRealizedPnl: 0,
      totalUnrealizedPnl: 0,
      tradesOpened: 0,
      config: { ...DEFAULT_CONFIG },
    });
  }
  return _states.get(userId)!;
}

export function updateEngineConfig(userId: number, config: Partial<PolymarketEngineConfig>): void {
  const s = getEngineState(userId);
  s.config = { ...s.config, ...config };
}

// ── Engine lifecycle ──────────────────────────────────────────────────────────

export function startEngine(userId: number): void {
  const s = getEngineState(userId);
  if (s.isRunning) return;
  s.isRunning = true;
  _runScan(userId).catch(console.error);
  const iv = setInterval(() => _runScan(userId).catch(console.error), 5 * 60 * 1000);
  _intervals.set(userId, iv);
}

export function stopEngine(userId: number): void {
  const s = getEngineState(userId);
  s.isRunning = false;
  const iv = _intervals.get(userId);
  if (iv) { clearInterval(iv); _intervals.delete(userId); }
}

export async function manualScan(userId: number): Promise<{ fired: boolean; reason: string }> {
  return _runScan(userId, true);
}

// ── Core scan ─────────────────────────────────────────────────────────────────

async function _runScan(userId: number, manual = false): Promise<{ fired: boolean; reason: string }> {
  const s = getEngineState(userId);
  s.lastScanAt = new Date().toISOString();

  // Refresh open position prices
  await _refreshPositionPrices(s);

  if (s.openPositions.length >= s.config.maxOpenPositions) {
    const r = `Max open positions (${s.config.maxOpenPositions}) reached`;
    s.lastScanResult = r;
    return { fired: false, reason: r };
  }

  if (!manual && s.lastTradeAt) {
    const elapsed = Date.now() - new Date(s.lastTradeAt).getTime();
    if (elapsed < s.config.cooldownMinutes * 60 * 1000) {
      const minsLeft = Math.ceil((s.config.cooldownMinutes * 60 * 1000 - elapsed) / 60000);
      const r = `Cooldown active — ${minsLeft}m remaining`;
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }
  }

  try {
    const sentiment = await getPolymarketBTCSentiment();
    const score = sentiment.overallBullishScore;

    const isBullish = score >= s.config.minBullishScore;
    const isBearish = (100 - score) >= s.config.minBearishScore;

    if (!isBullish && !isBearish) {
      const r = `Sentiment neutral — score ${score}% (need ≥${s.config.minBullishScore}% bullish or ≤${100 - s.config.minBearishScore}% bearish)`;
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }

    const direction: 'BUY' | 'SELL' = isBullish ? 'BUY' : 'SELL';
    const result = await _openPosition(s, sentiment, direction);
    s.lastScanResult = result.reason;
    return result;
  } catch (err: any) {
    const r = `Scan error: ${err?.message ?? String(err)}`;
    s.lastScanResult = r;
    return { fired: false, reason: r };
  }
}

// ── Open position ─────────────────────────────────────────────────────────────

async function _openPosition(
  s: PolymarketEngineState,
  sentiment: PolymarketBTCSentiment,
  direction: 'BUY' | 'SELL',
): Promise<{ fired: boolean; reason: string }> {
  const openIds = new Set(s.openPositions.map(p => p.market.id));
  const now = Date.now();

  const candidates = sentiment.markets.filter(m => {
    if (openIds.has(m.id)) return false;
    if (m.closed) return false;
    if (m.endDate) {
      const end = new Date(m.endDate).getTime();
      if (end - now < 2 * 60 * 60 * 1000) return false; // skip markets closing < 2 h
    }
    if (direction === 'BUY' && m.direction === 'bullish') return true;
    if (direction === 'SELL' && m.direction === 'bearish') return true;
    return false;
  });

  if (candidates.length === 0) {
    return { fired: false, reason: `No suitable open ${direction} market available on Polymarket` };
  }

  const best = candidates.sort((a, b) => b.volume - a.volume)[0];
  const entryProb = best.yesProbability;

  if (entryProb <= 5 || entryProb >= 95) {
    return { fired: false, reason: `Market probability ${entryProb}% too extreme — skipping` };
  }

  const position: PolymarketPosition = {
    id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    market: { id: best.id, question: best.question, endDate: best.endDate },
    side: 'YES',
    direction,
    entryProbability: entryProb,
    currentProbability: entryProb,
    stake: s.config.stakePerTrade,
    currentValue: s.config.stakePerTrade,
    unrealizedPnl: 0,
    unrealizedPnlPct: 0,
    openedAt: new Date().toISOString(),
    signal: {
      bullishScore: sentiment.overallBullishScore,
      sentimentLabel: sentiment.sentimentLabel,
      direction,
    },
    status: 'open',
  };

  // Attempt live CLOB order if live mode enabled and token ID available
  let liveOrderId: string | undefined;
  if (!s.isPaperMode && best.yesTokenId) {
    const userId = [..._liveModes.entries()].find(([, v]) => v)?.[0];
    const pk = userId != null ? _privateKeys.get(userId) : undefined;
    if (pk && best.yesTokenId) {
      const result = await placeClobOrder(pk, best.yesTokenId, 'BUY', entryProb / 100, s.config.stakePerTrade);
      if (!result.success) {
        return { fired: false, reason: `CLOB order failed: ${result.error}` };
      }
      liveOrderId = result.orderId;
    }
  }

  (position as any).clobOrderId = liveOrderId;
  s.openPositions.push(position);
  s.lastTradeAt = new Date().toISOString();
  s.tradesOpened++;

  const modeStr = s.isPaperMode ? '[PAPER]' : '[LIVE]';
  return {
    fired: true,
    reason: `${modeStr} Opened YES on "${best.question.slice(0, 60)}..." at ${entryProb}% — stake $${s.config.stakePerTrade}`,
  };
}

// ── Price refresh ─────────────────────────────────────────────────────────────

async function _refreshPositionPrices(s: PolymarketEngineState): Promise<void> {
  if (s.openPositions.length === 0) return;

  try {
    const sentiment = await getPolymarketBTCSentiment();

    for (const pos of s.openPositions) {
      const market = sentiment.markets.find(m => m.id === pos.market.id);
      if (!market) continue;

      const currentProb = pos.side === 'YES' ? market.yesProbability : (100 - market.yesProbability);
      pos.currentProbability = currentProb;

      // shares owned = stake / (entryProb / 100) = stake * 100 / entryProb
      const shares = (pos.stake * 100) / pos.entryProbability;
      pos.currentValue = shares * (currentProb / 100);
      pos.unrealizedPnl = pos.currentValue - pos.stake;
      pos.unrealizedPnlPct = (pos.unrealizedPnl / pos.stake) * 100;

      if (market.closed) {
        closePosition(s, pos.id, currentProb);
      }
    }

    s.totalUnrealizedPnl = s.openPositions.reduce((acc, p) => acc + p.unrealizedPnl, 0);
  } catch { /* non-fatal */ }
}

// ── Close position ────────────────────────────────────────────────────────────

export function closePosition(s: PolymarketEngineState, positionId: string, exitProb?: number): boolean {
  const idx = s.openPositions.findIndex(p => p.id === positionId);
  if (idx === -1) return false;

  const pos = s.openPositions[idx];
  const ep = exitProb ?? pos.currentProbability;

  const shares = (pos.stake * 100) / pos.entryProbability;
  const exitValue = shares * (ep / 100);
  const realizedPnl = exitValue - pos.stake;

  pos.status = ep >= 99 ? 'resolved' : 'closed';
  pos.closedAt = new Date().toISOString();
  pos.closedProbability = ep;
  pos.realizedPnl = realizedPnl;
  pos.unrealizedPnl = 0;
  pos.unrealizedPnlPct = 0;

  s.openPositions.splice(idx, 1);
  s.closedPositions.unshift(pos);
  if (s.closedPositions.length > 50) s.closedPositions.length = 50;

  s.totalRealizedPnl += realizedPnl;
  s.totalUnrealizedPnl = s.openPositions.reduce((acc, p) => acc + p.unrealizedPnl, 0);

  return true;
}

export function closeAllPositions(userId: number): number {
  const s = getEngineState(userId);
  const ids = s.openPositions.map(p => p.id);
  ids.forEach(id => closePosition(s, id));
  return ids.length;
}
