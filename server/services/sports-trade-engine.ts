'use strict';
// ─── Sports Auto-Trading Engine ───────────────────────────────────────────────
// Scans sports predictions every 30 minutes, finds high-confidence + high-edge
// picks, and places YES/NO orders on Polymarket US (CFTC-regulated, no VPN).
// Uses the same Polymarket US API client as the crypto engine.

import { getSportsPredictions, refreshSportsPredictions, type SportsPrediction } from './sports-predictor';
import { hasPmUsCredentials, getPmUsBbo, placePmUsOrder } from './polymarket-us';

export interface SportsEngineConfig {
  minEdgePct: number;        // minimum edge % to trade (default 4)
  minConfidence: 'high' | 'medium';  // minimum confidence tier
  stakePerGame: number;      // USD stake per game (default 10)
  maxOpenTrades: number;     // max simultaneous open sport positions (default 5)
  cooldownMinutes: number;   // minutes between scans (default 30)
  paperMode: boolean;
}

export interface SportsTrade {
  id: string;
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  marketId: string;
  marketQuestion: string;
  polymarketUrl?: string;
  side: 'yes' | 'no';          // YES = home wins, NO = away wins
  predictedTeam: string;       // team we think will win
  entryEdgePct: number;
  modelProbPct: number;
  marketPricePct: number;
  kellySizePct: number;
  stake: number;               // USD
  entryPriceCents: number;
  currentPriceCents: number;
  unrealizedPnl: number;
  gameTime: string;
  openedAt: string;
  closedAt?: string;
  realizedPnl?: number;
  exitReason?: 'resolved' | 'manual';
  status: 'open' | 'closed';
  paper: boolean;
  reasons: string[];
}

export interface SportsEngineState {
  isRunning: boolean;
  lastScanAt: string | null;
  lastScanResult: string | null;
  openTrades: SportsTrade[];
  closedTrades: SportsTrade[];
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  config: SportsEngineConfig;
}

const DEFAULT_CONFIG: SportsEngineConfig = {
  minEdgePct: 4,
  minConfidence: 'high',
  stakePerGame: 10,
  maxOpenTrades: 5,
  cooldownMinutes: 30,
  paperMode: true,
};

const _states = new Map<number, SportsEngineState>();
const _timers  = new Map<number, ReturnType<typeof setInterval>>();

export function getSportsEngineState(userId: number): SportsEngineState {
  if (!_states.has(userId)) {
    _states.set(userId, {
      isRunning: false,
      lastScanAt: null,
      lastScanResult: null,
      openTrades: [],
      closedTrades: [],
      totalRealizedPnl: 0,
      totalUnrealizedPnl: 0,
      config: { ...DEFAULT_CONFIG, paperMode: !hasPmUsCredentials(userId) },
    });
  }
  return _states.get(userId)!;
}

export function updateSportsEngineConfig(userId: number, patch: Partial<SportsEngineConfig>): void {
  const s = getSportsEngineState(userId);
  if (patch.minEdgePct   != null) patch.minEdgePct   = Math.max(0, Math.min(50, patch.minEdgePct));
  if (patch.stakePerGame != null) patch.stakePerGame = Math.max(1, Math.min(500, patch.stakePerGame));
  if (patch.maxOpenTrades!= null) patch.maxOpenTrades= Math.max(1, Math.min(20, patch.maxOpenTrades));
  s.config = { ...s.config, ...patch };
}

export function startSportsEngine(userId: number): void {
  const s = getSportsEngineState(userId);
  if (s.isRunning) return;
  s.isRunning = true;
  _runScan(userId).catch(console.error);
  const intervalMs = Math.max(5, s.config.cooldownMinutes) * 60 * 1000;
  _timers.set(userId, setInterval(() => _runScan(userId).catch(console.error), intervalMs));
}

export function stopSportsEngine(userId: number): void {
  const s = getSportsEngineState(userId);
  s.isRunning = false;
  const iv = _timers.get(userId);
  if (iv) { clearInterval(iv); _timers.delete(userId); }
}

export async function manualSportsScan(userId: number) {
  return _runScan(userId, true);
}

export function closeSportsTrade(userId: number, tradeId: string): boolean {
  const s = getSportsEngineState(userId);
  const idx = s.openTrades.findIndex(t => t.id === tradeId);
  if (idx === -1) return false;
  const t = s.openTrades[idx];
  const realized = Math.round(((t.currentPriceCents / 100) * (t.stake / (t.entryPriceCents / 100)) - t.stake) * 100) / 100;
  t.status = 'closed';
  t.closedAt = new Date().toISOString();
  t.realizedPnl = realized;
  t.exitReason = 'manual';
  t.unrealizedPnl = 0;
  s.openTrades.splice(idx, 1);
  s.closedTrades.unshift(t);
  if (s.closedTrades.length > 100) s.closedTrades.length = 100;
  s.totalRealizedPnl = Math.round((s.totalRealizedPnl + realized) * 100) / 100;
  _recalc(s);
  return true;
}

function _recalc(s: SportsEngineState): void {
  s.totalUnrealizedPnl = Math.round(s.openTrades.reduce((sum, t) => sum + t.unrealizedPnl, 0) * 100) / 100;
}

async function _updateOpenTrades(s: SportsEngineState): Promise<void> {
  for (const t of s.openTrades) {
    if (!t.marketId) continue;
    try {
      const bbo = await getPmUsBbo(t.marketId);
      if (!bbo) continue;
      const liveCents = Math.round((bbo.bestBid > 0 ? bbo.bestBid : bbo.currentPx) * 100);
      if (!liveCents) continue;
      t.currentPriceCents = liveCents;
      const contracts = t.stake / (t.entryPriceCents / 100);
      t.unrealizedPnl = Math.round(((liveCents / 100) * contracts - t.stake) * 100) / 100;
    } catch { /* non-fatal */ }
  }
  _recalc(s);
}

async function _runScan(userId: number, manual = false): Promise<{ fired: number; reason: string; trades: SportsTrade[] }> {
  const s = getSportsEngineState(userId);
  s.lastScanAt = new Date().toISOString();

  await _updateOpenTrades(s);

  if (s.openTrades.length >= s.config.maxOpenTrades) {
    const r = `Max open trades (${s.config.maxOpenTrades}) reached`;
    s.lastScanResult = r;
    return { fired: 0, reason: r, trades: [] };
  }

  let predictions: SportsPrediction[];
  try {
    predictions = manual ? await refreshSportsPredictions() : await getSportsPredictions();
  } catch (err: any) {
    const r = `Prediction fetch error: ${err.message}`;
    s.lastScanResult = r;
    return { fired: 0, reason: r, trades: [] };
  }

  // Filter: must have a Polymarket market, meet edge and confidence thresholds,
  // and not already be in open trades
  const openGameIds = new Set(s.openTrades.map(t => t.gameId));
  const confOrder = { high: 2, medium: 1, low: 0 };
  const minConfOrder = confOrder[s.config.minConfidence] ?? 2;

  const eligible = predictions.filter(p =>
    p.polymarketMarketId &&
    p.polymarketHomePrice != null &&
    Math.abs(p.edgePct ?? 0) >= s.config.minEdgePct &&
    (confOrder[p.confidence] ?? 0) >= minConfOrder &&
    !openGameIds.has(p.gameId) &&
    p.status === 'scheduled'
  ).sort((a, b) => Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0));

  if (eligible.length === 0) {
    const r = `No eligible games (need edge ≥${s.config.minEdgePct}%, confidence ≥${s.config.minConfidence}, Polymarket market found)`;
    s.lastScanResult = r;
    return { fired: 0, reason: r, trades: [] };
  }

  const newTrades: SportsTrade[] = [];
  const slots = s.config.maxOpenTrades - s.openTrades.length;

  for (const game of eligible.slice(0, slots)) {
    const edge = game.edgePct ?? 0;
    // Positive edge → home team is underpriced → bet YES
    // Negative edge → away team is underpriced → bet NO on home
    const side: 'yes' | 'no' = edge >= 0 ? 'yes' : 'no';
    const predictedTeam = edge >= 0 ? game.homeTeam : game.awayTeam;
    const modelPricePct  = edge >= 0 ? game.modelProbHome : game.modelProbAway;
    const marketPricePct = game.polymarketHomePrice ?? 50;
    const entryPriceCents = Math.round((side === 'yes' ? marketPricePct : (100 - marketPricePct)) * 1);

    // Live BBO check (if credentials configured)
    let actualEntryCents = entryPriceCents;
    if (!s.config.paperMode && hasPmUsCredentials(userId)) {
      try {
        const bbo = await getPmUsBbo(game.polymarketMarketId!);
        if (bbo) {
          const ask = side === 'yes' ? bbo.bestAsk : (1 - bbo.bestBid);
          if (ask > 0) actualEntryCents = Math.round(ask * 100);
        }
      } catch { /* use estimate */ }
    }

    // Place real order or log paper trade
    if (!s.config.paperMode && hasPmUsCredentials(userId)) {
      try {
        const result = await placePmUsOrder(userId, {
          marketSlug: game.polymarketMarketId!,
          intent: side === 'yes' ? 'ORDER_INTENT_BUY_LONG' : 'ORDER_INTENT_BUY_SHORT',
          type: 'ORDER_TYPE_MARKET',
          quantity: Math.round(s.config.stakePerGame / (actualEntryCents / 100)),
        });
        if (!result.ok) {
          console.warn(`[SportsEngine] Order failed for ${game.gameId}:`, result.data);
          continue;
        }
      } catch (err: any) {
        console.warn(`[SportsEngine] Order error for ${game.gameId}:`, err.message);
        continue;
      }
    }

    const trade: SportsTrade = {
      id: `sports-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      gameId: game.gameId,
      sport: game.sport,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      marketId: game.polymarketMarketId!,
      marketQuestion: game.polymarketQuestion ?? `${game.awayTeam} @ ${game.homeTeam}`,
      polymarketUrl: game.polymarketUrl,
      side,
      predictedTeam,
      entryEdgePct: Math.abs(edge),
      modelProbPct: modelPricePct,
      marketPricePct,
      kellySizePct: game.kellySizePct ?? 0,
      stake: s.config.stakePerGame,
      entryPriceCents: actualEntryCents,
      currentPriceCents: actualEntryCents,
      unrealizedPnl: 0,
      gameTime: game.gameTime,
      openedAt: new Date().toISOString(),
      status: 'open',
      paper: s.config.paperMode,
      reasons: game.reasons ?? [],
    };

    s.openTrades.push(trade);
    newTrades.push(trade);
    openGameIds.add(game.gameId);
    console.log(`[SportsEngine] ${s.config.paperMode ? '[PAPER]' : '[LIVE]'} Opened ${side.toUpperCase()} on "${trade.marketQuestion}" edge=${edge.toFixed(1)}% kelly=${game.kellySizePct?.toFixed(1)}%`);
  }

  _recalc(s);

  const r = newTrades.length > 0
    ? `${s.config.paperMode ? '[PAPER]' : '[LIVE]'} Opened ${newTrades.length} trade(s): ${newTrades.map(t => `${t.predictedTeam} (${t.sport.toUpperCase()})`).join(', ')}`
    : 'Scan complete — no new trades opened';
  s.lastScanResult = r;
  return { fired: newTrades.length, reason: r, trades: newTrades };
}
