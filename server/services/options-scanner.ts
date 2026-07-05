// ── Options AI Engine — scan/decision feed ──────────────────────────────────
// Rule-based (not yet full-AI) momentum read over each user's watched symbols,
// using their connected Alpaca account's market data. Every cycle produces a
// genuine, explainable log entry per symbol — "what the engine is seeing and
// why it is (or isn't) acting" — rather than a fabricated feed. Order
// placement itself is a future step; this scans and explains only.

import { storage } from '../storage';
import { AlpacaService, decryptApiSecret } from '../alpaca';

const MIN_SCAN_INTERVAL_MS = 30000; // never scan a single user faster than this
const lastScanAt = new Map<number, number>();

function momentumScore(dailyChangePercent: number): number {
  // Maps daily % move to a 0-100 "how notable is this move" proxy.
  // Not a real options-pricing model — a transparent, simple heuristic until
  // a full AI/IV-aware strategy engine replaces it.
  const magnitude = Math.min(Math.abs(dailyChangePercent) / 3, 1); // 3%+ move = max
  return Math.round(50 + magnitude * 50);
}

async function scanOneUser(userId: number): Promise<void> {
  const config = await storage.getUserOptionsEngineConfig(userId);
  if (!config || !config.isActive) return;

  const now = Date.now();
  const last = lastScanAt.get(userId) || 0;
  if (now - last < Math.max(MIN_SCAN_INTERVAL_MS, config.scanIntervalMs)) return;
  lastScanAt.set(userId, now);

  const alpacaConns = await storage.getUserAlpacaConnections(userId);
  const activeAlpaca = alpacaConns.find(c => c.isActive);
  if (!activeAlpaca) {
    // No market-data-capable broker connected — log once so the feed explains why it's idle.
    await storage.createOptionsEngineActivity({
      userId, symbol: '—', decision: 'error',
      reasoning: 'No active Alpaca connection — market data requires at least one connected Alpaca account. TastyTrade/Crypto.com orders can still execute, but symbol scanning needs Alpaca for now.',
      score: null, price: null, dailyChangePercent: null, source: 'none',
    });
    return;
  }

  let service: AlpacaService;
  try {
    const secret = decryptApiSecret(activeAlpaca.encryptedApiSecret);
    service = new AlpacaService(activeAlpaca.accountType as 'paper' | 'live', activeAlpaca.apiKeyId, secret);
  } catch (err: any) {
    await storage.createOptionsEngineActivity({
      userId, symbol: '—', decision: 'error',
      reasoning: `Could not decrypt Alpaca credentials: ${err.message}`,
      score: null, price: null, dailyChangePercent: null, source: 'alpaca',
    });
    return;
  }

  const symbols: string[] = Array.isArray(config.symbols) ? config.symbols : [];
  for (const symbol of symbols) {
    try {
      const snap = await service.getSnapshot(symbol);
      if (!snap) {
        await storage.createOptionsEngineActivity({
          userId, symbol, decision: 'error',
          reasoning: `No market data returned for ${symbol} — check the symbol is a valid US equity ticker.`,
          score: null, price: null, dailyChangePercent: null, source: 'alpaca',
        });
        continue;
      }

      const score = momentumScore(snap.dailyChangePercent);
      const direction = snap.dailyChangePercent >= 0 ? 'up' : 'down';
      const meetsConfidence = score >= config.minConfidence;
      const directionAllowed =
        config.directionFilter === 'both' ||
        (config.directionFilter === 'calls_only' && direction === 'up') ||
        (config.directionFilter === 'puts_only' && direction === 'down');

      let decision: 'watching' | 'signal' | 'skipped';
      let reasoning: string;
      if (!directionAllowed) {
        decision = 'skipped';
        reasoning = `${symbol} moved ${direction} ${Math.abs(snap.dailyChangePercent).toFixed(2)}% today, but your direction filter is "${config.directionFilter}" — this move doesn't qualify.`;
      } else if (meetsConfidence) {
        decision = 'signal';
        reasoning = `${symbol} moved ${direction} ${Math.abs(snap.dailyChangePercent).toFixed(2)}% today — momentum score ${score}/100 clears your ${config.minConfidence} minimum. Would consider a ${direction === 'up' ? 'call' : 'put'} here (strategy: ${config.strategyMode}).`;
      } else {
        decision = 'watching';
        reasoning = `${symbol} at $${snap.price.toFixed(2)} (${direction} ${Math.abs(snap.dailyChangePercent).toFixed(2)}% today) — momentum score ${score}/100 is below your ${config.minConfidence} confidence threshold. Watching, not acting.`;
      }

      await storage.createOptionsEngineActivity({
        userId, symbol, decision, reasoning,
        score, price: snap.price, dailyChangePercent: snap.dailyChangePercent, source: 'alpaca',
      });
    } catch (err: any) {
      await storage.createOptionsEngineActivity({
        userId, symbol, decision: 'error',
        reasoning: `Scan failed for ${symbol}: ${err.message}`,
        score: null, price: null, dailyChangePercent: null, source: 'alpaca',
      });
    }
  }
}

export async function runOptionsEngineScan(): Promise<void> {
  try {
    const configs = await storage.getAllActiveOptionsEngineConfigs();
    for (const config of configs) {
      await scanOneUser(config.userId).catch((e: any) =>
        console.error(`[options-scanner] user ${config.userId} scan failed:`, e.message)
      );
    }
  } catch (err: any) {
    console.error('[options-scanner] runOptionsEngineScan failed:', err.message);
  }
}

let started = false;
export function startOptionsEngineScanner(): void {
  if (started) return;
  started = true;
  const LOOP_INTERVAL_MS = 60000;
  setInterval(() => { runOptionsEngineScan().catch(() => {}); }, LOOP_INTERVAL_MS);
  console.log('[options-scanner] Background options-engine scan loop started (60s tick, per-user throttled).');
}
