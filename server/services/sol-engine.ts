import { scanAndAnalyzeTokens, fetchCryptoMacroContext, type DexSource, type TokenAnalysis, type CryptoMacroContext } from '../solana-scanner';
import { db } from '../db';
import { solEngineSettings, solEnginePositions } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

interface OpenPositionSummary {
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  gainPct: number;
  volumeStatus: string;
}

export interface SolEngineConfig {
  dexFilter: DexSource;
  minConfidence: number;
  maxTokens: number;
  useKelly: boolean;
  shieldEnabled: boolean;
  shieldThreshold: number;
  adaptiveScan: boolean;
  aiMode: 'full' | 'economy';
}

export interface SolActivityEntry {
  type: 'info' | 'signal' | 'shield' | 'trigger' | 'kelly' | 'goal' | 'strategy' | 'paper_buy' | 'paper_sell' | 'live_signal' | 'live_buy' | 'live_sell';
  message: string;
  timestamp: string;
}

export interface SolAutoPosition {
  id: string;
  symbol: string;
  mint: string;
  entryPrice: number;
  currentPrice: number;
  targetPct: number;
  slPct: number;
  size: number;
  tokenAmount: number;
  decimals: number;
  strategyId: string;
  mode: 'paper' | 'live';
  txHash?: string;
  openedAt: string;
  closedAt?: string;
  closePnlPct?: number;
  status: 'open' | 'closed';
  // Trailing stop — staged volume-momentum model
  peakPrice?: number;
  trailingActive?: boolean;
  breakevenActive?: boolean;
  trailActivationPct?: number;
  trailDistancePct?: number;
  closeReason?: 'tp' | 'sl' | 'trail';
  entryVolume24h?: number;
}

export interface SolPendingSignal {
  id: string;
  symbol: string;
  mint: string;
  signal: 'BUY';
  confidence: number;
  price: number;
  sizeSOL: number;
  strategyId: string;
  createdAt: string;
  expiresAt: string;
}

export interface SolPendingExit {
  positionId: string;
  symbol: string;
  mint: string;
  tokenAmount: number;
  decimals: number;
  reason: 'tp' | 'sl';
  createdAt: string;
  expiresAt: string;
}

export interface SolStrategy {
  id: string;
  name: string;
  icon: string;
  description: string;
  minConfidence: number;
  maxRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  baseFraction: number;
  minSignal: 'BUY' | 'STRONG_BUY';
  holdTarget: string;
  dexPreference?: string;
}

export interface SolWeeklyGoal {
  targetSol: number;
  targetPct: number;
  startPortfolio: number;
  currentProfitSol: number;
  phase: 'idle' | 'warming_up' | 'building' | 'accelerating' | 'cruising' | 'pushing' | 'target_reached';
  weekStart: number;
  winStreak: number;
  tradeHistory: Array<{
    timestamp: string;
    symbol: string;
    sol: number;
    gainPct: number;
    outcome: 'WIN' | 'LOSS';
    strategy: string;
  }>;
}

export interface AgentConsensusResult {
  symbol: string;
  quantVerdict: 'CONFIRM_BUY' | 'WATCH' | 'SKIP';
  quantScore: number;
  gptVerdict: string;
  consensus: 'STRONG_CONFIRM' | 'STRONG_SKIP' | 'CAUTION' | 'WATCH';
  timestamp: string;
}

interface SolEngineState {
  isRunning: boolean;
  config: SolEngineConfig;
  lastScanAt: number;
  lastTokenSnapshot: Record<string, { volume: number; price: number; signal: string; confidence: number }>;
  lastTriggerAt: Record<string, number>;
  activityFeed: SolActivityEntry[];
  signalWeights: Record<string, number>;
  kellyStats: Record<string, { wins: number; losses: number; totalGainPct: number }>;
  sessionHighWatermark: number;
  currentPortfolioValue: number;
  shieldActive: boolean;
  scanTimer: NodeJS.Timeout | null;
  lastResults: TokenAnalysis[];
  lastMacro: CryptoMacroContext | null;
  weeklyGoal: SolWeeklyGoal;
  activeStrategy: string;
  activeStrategies: string[];
  lastAgentConsensus: AgentConsensusResult[];
  autoTradeEnabled: boolean;
  liveTradeEnabled: boolean;
  paperPositions: SolAutoPosition[];
  closedPaperPositions: SolAutoPosition[];
  livePositions: SolAutoPosition[];
  closedLivePositions: SolAutoPosition[];
  pendingSignals: SolPendingSignal[];
  pendingExits: SolPendingExit[];
  signalCooldowns: Map<string, number>; // mint -> timestamp of last rejection/failure
  autoTradeTP: number;
  autoTradeSL: number;
  autoTrailActivationPct: number;
  autoTrailDistancePct: number;
  paperTradeSize: number;       // fixed SOL per paper trade (0 = use portfolio fraction)
  // Compounding system
  compoundMode: boolean;
  compoundRate: number;         // 0–100: % of profit/loss to fold back into paper capital
  paperBaseCapital: number;     // starting SOL the user allocated for paper trading
  paperPortfolioValue: number;  // current compounded paper portfolio value
  paperPortfolioHistory: Array<{ t: number; v: number }>; // sparkline (up to 50 points)
  autoTradeStats: {
    totalTrades: number;
    wins: number;
    losses: number;
    totalPnlPct: number;
    bestTradePct: number;
    worstTradePct: number;
  };
  aiReviewCache: Record<string, { ts: number; result: any[] }>;
  _adaptiveStrategy?: string; // current auto-selected strategy when in adaptive mode
}

const DEX_NAMES = ['raydium', 'orca', 'meteora', 'pumpfun', 'jupiter'];

export const SOL_STRATEGIES: SolStrategy[] = [
  {
    id: 'momentum_surfer',
    name: 'Momentum Surfer',
    icon: '🏄',
    description: 'Rides strong directional price momentum with buy pressure confirmation',
    minConfidence: 70,
    maxRisk: 'MEDIUM',
    baseFraction: 0.03,
    minSignal: 'BUY',
    holdTarget: '1–4h',
  },
  {
    id: 'breakout_hunter',
    name: 'Breakout Hunter',
    icon: '🚀',
    description: 'Targets tokens breaking out of consolidation on strong buy signals',
    minConfidence: 75,
    maxRisk: 'MEDIUM',
    baseFraction: 0.025,
    minSignal: 'STRONG_BUY',
    holdTarget: '30min–2h',
  },
  {
    id: 'dip_sniper',
    name: 'Dip Sniper',
    icon: '🎯',
    description: 'Enters on brief pullbacks in overall uptrends — low risk entries',
    minConfidence: 68,
    maxRisk: 'LOW',
    baseFraction: 0.02,
    minSignal: 'BUY',
    holdTarget: '2–8h',
  },
  {
    id: 'meme_velocity',
    name: 'Meme Velocity',
    icon: '⚡',
    description: 'Captures explosive meme token moves with quick in-out on Pump.fun',
    minConfidence: 65,
    maxRisk: 'HIGH',
    baseFraction: 0.04,
    minSignal: 'BUY',
    holdTarget: '10–15min',
    dexPreference: 'pumpfun',
  },
  {
    id: 'whale_follower',
    name: 'Whale Follower',
    icon: '🐋',
    description: 'Tracks large wallet accumulation patterns and high maker counts',
    minConfidence: 72,
    maxRisk: 'MEDIUM',
    baseFraction: 0.02,
    minSignal: 'BUY',
    holdTarget: '4–24h',
  },
  {
    id: 'volume_explosion',
    name: 'Volume Explosion',
    icon: '💥',
    description: 'Enters tokens with sudden 3x+ volume spikes on strong buy signals',
    minConfidence: 65,
    maxRisk: 'MEDIUM',
    baseFraction: 0.035,
    minSignal: 'STRONG_BUY',
    holdTarget: '20–45min',
  },
  {
    id: 'smart_money_flow',
    name: 'Smart Money Flow',
    icon: '🧠',
    description: 'Institutional-grade entries on high-confidence, low-risk accumulation',
    minConfidence: 78,
    maxRisk: 'LOW',
    baseFraction: 0.025,
    minSignal: 'STRONG_BUY',
    holdTarget: '1–3 days',
  },
  {
    id: 'liquidity_sweep',
    name: 'Liquidity Sweep',
    icon: '🌊',
    description: 'Scalps sharp moves after liquidity pool sweeps — small, frequent gains',
    minConfidence: 60,
    maxRisk: 'HIGH',
    baseFraction: 0.03,
    minSignal: 'BUY',
    holdTarget: '10–30min',
  },
  {
    id: 'adaptive',
    name: 'Adaptive (Auto)',
    icon: '🤖',
    description: 'Auto-selects the best strategy each scan based on current market conditions — whale activity, breakouts, dips, macro bias',
    minConfidence: 68,
    maxRisk: 'MEDIUM',
    baseFraction: 0.03,
    minSignal: 'BUY',
    holdTarget: 'varies',
  },
];

const DEFAULT_CONFIG: SolEngineConfig = {
  dexFilter: 'all',
  minConfidence: 65,
  maxTokens: 10,
  useKelly: false,
  shieldEnabled: true,
  shieldThreshold: 10,
  adaptiveScan: true,
  aiMode: 'full',
};

const DEFAULT_WEEKLY_GOAL: SolWeeklyGoal = {
  targetSol: 0,
  targetPct: 0,
  startPortfolio: 0,
  currentProfitSol: 0,
  phase: 'idle',
  weekStart: 0,
  winStreak: 0,
  tradeHistory: [],
};

const engineStates = new Map<number, SolEngineState>();

// ── Encryption helpers for server wallet key ──────────────────────────────────
function getEncryptionKey(): Buffer {
  const seed = (process.env.DATABASE_URL || 'vedd-sol-engine-fallback') + 'sol-v1';
  return crypto.createHash('sha256').update(seed).digest();
}

function encryptWalletKey(plain: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

function decryptWalletKey(ciphertext: string): string {
  const [ivHex, encHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}

// ── DB: persist settings + positions ─────────────────────────────────────────
async function saveEngineState(userId: number, state: SolEngineState): Promise<void> {
  try {
    await db.insert(solEngineSettings).values({
      userId,
      activeStrategy: state.activeStrategy,
      activeStrategies: state.activeStrategies as any,
      autoTradeEnabled: state.autoTradeEnabled,
      liveTradeEnabled: state.liveTradeEnabled,
      autoTradeTP: state.autoTradeTP,
      autoTradeSL: state.autoTradeSL,
      weeklyGoal: state.weeklyGoal as any,
      autoTradeStats: state.autoTradeStats as any,
      updatedAt: new Date(),
    } as any).onConflictDoUpdate({
      target: solEngineSettings.userId,
      set: {
        activeStrategy: state.activeStrategy,
        activeStrategies: state.activeStrategies as any,
        autoTradeEnabled: state.autoTradeEnabled,
        liveTradeEnabled: state.liveTradeEnabled,
        autoTradeTP: state.autoTradeTP,
        autoTradeSL: state.autoTradeSL,
        weeklyGoal: state.weeklyGoal as any,
        autoTradeStats: state.autoTradeStats as any,
        updatedAt: new Date(),
      } as any,
    });
  } catch (err) {
    console.error('[SolEngine] saveEngineState settings error:', err);
  }
}

async function upsertPosition(userId: number, pos: SolAutoPosition): Promise<void> {
  try {
    await db.insert(solEnginePositions).values({
      userId,
      positionId: pos.id,
      mode: pos.mode,
      symbol: pos.symbol,
      mint: pos.mint,
      entryPrice: pos.entryPrice,
      currentPrice: pos.currentPrice,
      targetPct: pos.targetPct,
      slPct: pos.slPct,
      size: pos.size,
      tokenAmount: pos.tokenAmount,
      decimals: pos.decimals,
      strategyId: pos.strategyId,
      txHash: pos.txHash,
      status: pos.status,
      openedAt: pos.openedAt,
      closedAt: pos.closedAt,
      closePnlPct: pos.closePnlPct,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: solEnginePositions.positionId,
      set: {
        currentPrice: pos.currentPrice,
        status: pos.status,
        closedAt: pos.closedAt,
        closePnlPct: pos.closePnlPct,
        tokenAmount: pos.tokenAmount,
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    console.error('[SolEngine] upsertPosition error:', err);
  }
}

async function loadEngineStateFromDb(userId: number, state: SolEngineState): Promise<void> {
  try {
    const [settings] = await db.select().from(solEngineSettings).where(eq(solEngineSettings.userId, userId));
    if (settings) {
      state.activeStrategy = settings.activeStrategy;
      state.activeStrategies = (settings.activeStrategies as string[]) || [settings.activeStrategy];
      state.autoTradeEnabled = settings.autoTradeEnabled;
      state.liveTradeEnabled = settings.liveTradeEnabled;
      state.autoTradeTP = settings.autoTradeTP;
      state.autoTradeSL = settings.autoTradeSL;
      state.autoTrailActivationPct = (settings as any).autoTrailActivationPct ?? 4;
      state.autoTrailDistancePct = (settings as any).autoTrailDistancePct ?? 3;
      if (settings.weeklyGoal && typeof settings.weeklyGoal === 'object') {
        state.weeklyGoal = { ...DEFAULT_WEEKLY_GOAL, ...(settings.weeklyGoal as Partial<SolWeeklyGoal>) };
      }
      if (settings.autoTradeStats && typeof settings.autoTradeStats === 'object') {
        state.autoTradeStats = { ...state.autoTradeStats, ...(settings.autoTradeStats as any) };
      }

      // ── Auto-populate portfolio value from server wallet balance ─────────
      // currentPortfolioValue = 0 silently blocks ALL trades (sizeSOL = 0).
      // If a server wallet is configured, fetch its live balance so the
      // engine can size positions correctly without manual portfolio entry.
      if (settings.serverWalletKey && state.currentPortfolioValue <= 0) {
        try {
          const privateKeyBase58 = decryptWalletKey(settings.serverWalletKey);
          const { Keypair, Connection } = await import('@solana/web3.js');
          const bs58 = (await import('bs58')).default;
          const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
          const rpcUrl = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=15319bf4-5b40-4958-ac8d-6313aa55eb92';
          const connection = new Connection(rpcUrl, { commitment: 'confirmed' });
          const lamports = await connection.getBalance(keypair.publicKey);
          const solBalance = lamports / 1e9;
          if (solBalance > 0) {
            state.currentPortfolioValue = solBalance;
            console.log(`[SolEngine] Auto-set portfolio value from server wallet: ${solBalance.toFixed(4)} SOL`);
          }
        } catch (walletErr) {
          console.warn('[SolEngine] Could not fetch server wallet balance for portfolio init:', walletErr);
        }
      }
    }

    const positions = await db.select().from(solEnginePositions).where(eq(solEnginePositions.userId, userId));
    for (const row of positions) {
      const pos: SolAutoPosition = {
        id: row.positionId,
        symbol: row.symbol,
        mint: row.mint,
        entryPrice: row.entryPrice,
        currentPrice: row.currentPrice,
        targetPct: row.targetPct,
        slPct: row.slPct,
        size: row.size,
        tokenAmount: row.tokenAmount,
        decimals: row.decimals,
        strategyId: row.strategyId,
        txHash: row.txHash || undefined,
        mode: row.mode as 'paper' | 'live',
        status: row.status as 'open' | 'closed',
        openedAt: row.openedAt,
        closedAt: row.closedAt || undefined,
        closePnlPct: row.closePnlPct || undefined,
      };
      if (pos.mode === 'paper') {
        if (pos.status === 'open') state.paperPositions.push(pos);
        else state.closedPaperPositions.push(pos);
      } else {
        if (pos.status === 'open') state.livePositions.push(pos);
        else state.closedLivePositions.push(pos);
      }
    }
    console.log(`[SolEngine] Loaded state for user ${userId}: ${positions.length} positions restored`);
  } catch (err) {
    console.error('[SolEngine] loadEngineStateFromDb error:', err);
  }
}

// ── Server-side Jupiter sell execution ───────────────────────────────────────
async function executeServerSideSell(userId: number, pos: SolAutoPosition, reason: 'tp' | 'sl', state: SolEngineState): Promise<boolean> {
  try {
    const [settings] = await db.select({ serverWalletKey: solEngineSettings.serverWalletKey })
      .from(solEngineSettings).where(eq(solEngineSettings.userId, userId));
    if (!settings?.serverWalletKey) return false;

    const privateKeyBase58 = decryptWalletKey(settings.serverWalletKey);
    const { Keypair, Connection, VersionedTransaction } = await import('@solana/web3.js');
    const bs58 = (await import('bs58')).default;
    const secretKey = bs58.decode(privateKeyBase58);
    const keypair = Keypair.fromSecretKey(secretKey);

    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const amount = Math.floor(pos.tokenAmount);
    if (amount <= 0) return false;

    const quoteResp = await fetch(
      `https://quote-api.jup.ag/v6/quote?inputMint=${pos.mint}&outputMint=${SOL_MINT}&amount=${amount}&slippageBps=300`
    );
    if (!quoteResp.ok) return false;
    const quote = await quoteResp.json();

    const swapResp = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: keypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });
    if (!swapResp.ok) return false;
    const { swapTransaction } = await swapResp.json();

    const txBuffer = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuffer);
    transaction.sign([keypair]);

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=15319bf4-5b40-4958-ac8d-6313aa55eb92';
    const connection = new Connection(rpcUrl, { commitment: 'confirmed' });
    const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true, maxRetries: 3 });

    const gainPct = pos.entryPrice > 0 ? ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100 : 0;
    const label = reason === 'tp' ? 'TP ✅' : 'SL 🛡️';

    // Close the position
    pos.status = 'closed';
    pos.closedAt = new Date().toISOString();
    pos.closePnlPct = gainPct;
    state.livePositions = state.livePositions.filter(p => p.id !== pos.id);
    state.closedLivePositions.unshift(pos);
    if (state.closedLivePositions.length > 50) state.closedLivePositions = state.closedLivePositions.slice(0, 50);

    const isWin = gainPct >= 0;
    state.autoTradeStats.totalTrades++;
    state.autoTradeStats.totalPnlPct += gainPct;
    if (isWin) {
      state.autoTradeStats.wins++;
      if (gainPct > state.autoTradeStats.bestTradePct) state.autoTradeStats.bestTradePct = gainPct;
    } else {
      state.autoTradeStats.losses++;
      if (gainPct < state.autoTradeStats.worstTradePct) state.autoTradeStats.worstTradePct = gainPct;
    }

    // Update DEX/strategy weights and Kelly stats from this live auto-close
    const dexKeyLive = (pos.strategyId || 'unknown').toLowerCase().replace(/[^a-z]/g, '') || 'unknown';
    if (!state.signalWeights[dexKeyLive]) state.signalWeights[dexKeyLive] = 1.0;
    if (!state.kellyStats[dexKeyLive]) state.kellyStats[dexKeyLive] = { wins: 0, losses: 0, totalGainPct: 0 };
    if (isWin) {
      state.signalWeights[dexKeyLive] = Math.min(2.0, state.signalWeights[dexKeyLive] + 0.05);
      state.kellyStats[dexKeyLive].wins++;
      state.kellyStats[dexKeyLive].totalGainPct += Math.abs(gainPct);
      state.weeklyGoal.winStreak = (state.weeklyGoal.winStreak || 0) + 1;
    } else {
      state.signalWeights[dexKeyLive] = Math.max(0.2, state.signalWeights[dexKeyLive] - 0.08);
      state.kellyStats[dexKeyLive].losses++;
      state.weeklyGoal.winStreak = 0;
    }
    if (state.weeklyGoal.phase !== 'idle') {
      state.weeklyGoal.currentProfitSol += pos.size * (gainPct / 100);
      state.weeklyGoal.tradeHistory.unshift({
        timestamp: new Date().toISOString(),
        symbol: pos.symbol,
        sol: pos.size,
        gainPct,
        outcome: isWin ? 'WIN' : 'LOSS',
        strategy: pos.strategyId || state.activeStrategy,
      });
      if (state.weeklyGoal.tradeHistory.length > 100) state.weeklyGoal.tradeHistory = state.weeklyGoal.tradeHistory.slice(0, 100);
    }

    addActivity(state, {
      type: 'live_sell',
      message: `🤖 Server auto-sold ${pos.symbol} [${label}] ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}% — TX: ${signature.slice(0, 16)}...`,
    });

    upsertPosition(userId, pos).catch(() => {});
    saveEngineState(userId, state).catch(() => {});
    return true;
  } catch (err) {
    console.error('[SolEngine] executeServerSideSell error:', err);
    return false;
  }
}

// ── Server-side Jupiter BUY execution (mirrors executeServerSideSell) ────────
async function executeServerSideBuy(
  userId: number,
  signal: SolPendingSignal,
  state: SolEngineState
): Promise<boolean> {
  try {
    const [settings] = await db.select({ serverWalletKey: solEngineSettings.serverWalletKey })
      .from(solEngineSettings).where(eq(solEngineSettings.userId, userId));
    if (!settings?.serverWalletKey) return false;

    const privateKeyBase58 = decryptWalletKey(settings.serverWalletKey);
    const { Keypair, Connection, VersionedTransaction } = await import('@solana/web3.js');
    const bs58 = (await import('bs58')).default;
    const secretKey = bs58.decode(privateKeyBase58);
    const keypair = Keypair.fromSecretKey(secretKey);

    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const lamports = Math.floor(signal.sizeSOL * 1e9);
    if (lamports <= 0) return false;

    const quoteResp = await fetch(
      `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${signal.mint}&amount=${lamports}&slippageBps=200`
    );
    if (!quoteResp.ok) return false;
    const quote = await quoteResp.json();
    if (quote.error) {
      console.warn('[SolEngine] Jupiter buy quote error:', quote.error);
      return false;
    }

    const swapResp = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: keypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });
    if (!swapResp.ok) return false;
    const { swapTransaction } = await swapResp.json();

    const txBuffer = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuffer);
    transaction.sign([keypair]);

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=15319bf4-5b40-4958-ac8d-6313aa55eb92';
    const connection = new Connection(rpcUrl, { commitment: 'confirmed' });
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 3,
    });

    // Parse output token amount from quote
    const rawOut = parseInt(quote.outAmount || '0');
    const decimals = 9; // default; positions track raw amount
    const tokenAmount = rawOut;

    const pos: SolAutoPosition = {
      id: `live_pos_${Date.now()}_${signal.symbol}`,
      symbol: signal.symbol,
      mint: signal.mint,
      entryPrice: signal.price,
      currentPrice: signal.price,
      targetPct: state.autoTradeTP,
      slPct: state.autoTradeSL,
      size: signal.sizeSOL,
      tokenAmount,
      decimals,
      strategyId: signal.strategyId,
      mode: 'live',
      txHash: signature,
      openedAt: new Date().toISOString(),
      status: 'open',
    };
    state.livePositions.push(pos);
    addActivity(state, {
      type: 'live_buy',
      message: `🤖 Server auto-bought ${signal.symbol} — ${signal.sizeSOL.toFixed(3)} SOL @ $${signal.price.toFixed(6)} | TX: ${signature.slice(0, 16)}... | TP: +${state.autoTradeTP}% | SL: -${state.autoTradeSL}%`,
    });
    upsertPosition(userId, pos).catch(() => {});
    saveEngineState(userId, state).catch(() => {});
    return true;
  } catch (err) {
    console.error('[SolEngine] executeServerSideBuy error:', err);
    return false;
  }
}

// ── Strategy-specific entry filters ─────────────────────────────────────────
// Each strategy has UNIQUE entry criteria beyond the shared confidence/risk gates.
// This is what actually differentiates whale accumulation from momentum, dip from bounce, etc.
function passesStrategyFilter(analysis: TokenAnalysis, strategy: SolStrategy): boolean {
  const token = analysis.token;
  const totalTxns = token.txns24h.buys + token.txns24h.sells;
  const buyRatio  = totalTxns > 0 ? token.txns24h.buys / totalTxns : 0.5;
  const avgTxSize = totalTxns > 0 ? token.volume24h / totalTxns : 0;
  const priceChg  = token.priceChange24h;

  switch (strategy.id) {
    case 'whale_follower':
      // Real whale signal = FEW wallets making BIG individual transactions
      // avgTxSize > $1000 means whale-sized positions (not retail $50 buys)
      // makers < 150 = concentrated wallets (not scattered retail)
      // whaleScore >= 65 = algorithm confirms unusual buy pressure
      return avgTxSize > 1000 && token.makers24h < 150 && buyRatio > 0.58 && analysis.whaleScore >= 65;

    case 'momentum_surfer':
      // Riding an existing price move — token already going up, volume confirming
      return priceChg >= 5 && priceChg <= 80 && buyRatio > 0.55 && token.volume24h >= 30000;

    case 'breakout_hunter':
      // Strong price move, not overextended, volume confirming the breakout
      return priceChg >= 12 && priceChg <= 70 && token.volume24h >= 80000 && buyRatio > 0.58;

    case 'dip_sniper':
      // Price dropped BUT smart money is quietly accumulating at the low
      // Negative price change + STRONG buy ratio = accumulation, not panic selling
      return priceChg >= -40 && priceChg <= -4 && buyRatio > 0.62;

    case 'meme_velocity':
      // Extreme velocity pump — move fast, exit fast
      return priceChg >= 20 && token.volume24h >= 15000;

    case 'volume_explosion':
      // Massive volume surge — institutional attention or viral event
      return token.volume24h >= 250000 && buyRatio > 0.52;

    case 'smart_money_flow':
      // Institutional grade only: LOW risk, distributed wallets, STRONG_BUY
      // High makers24h = many wallets holding = not a pump-and-dump concentration
      return analysis.riskLevel === 'LOW' && token.makers24h >= 150 && analysis.signal === 'STRONG_BUY';

    case 'liquidity_sweep':
      // Price bounced off a key level — recent dip/recovery with strong buying
      return priceChg >= -15 && priceChg <= 10 && buyRatio > 0.62 && analysis.sentimentScore >= 55;

    case 'adaptive':
      // Adaptive mode delegates to the auto-selected strategy — always passes here
      return true;

    default:
      return true;
  }
}

// ── Adaptive strategy auto-selector ─────────────────────────────────────────
// Runs at the START of each scan cycle. Reads current market conditions from
// scan results + macro bias and picks the most appropriate strategy for this moment.
function selectAdaptiveSolStrategy(
  macro: CryptoMacroContext | null,
  scanResult: TokenAnalysis[],
): { strategyId: string; reason: string } {
  if (scanResult.length === 0) {
    return { strategyId: 'momentum_surfer', reason: 'No scan data — defaulting to momentum' };
  }

  // Measure market conditions from the current scan batch
  const counts = { whale: 0, dip: 0, breakout: 0, volExplosion: 0, meme: 0, smartMoney: 0 };
  for (const t of scanResult) {
    const tt = t.token.txns24h.buys + t.token.txns24h.sells;
    const br = tt > 0 ? t.token.txns24h.buys / tt : 0.5;
    const avgTx = tt > 0 ? t.token.volume24h / tt : 0;
    const chg = t.token.priceChange24h;
    if (avgTx > 1000 && t.token.makers24h < 150 && t.whaleScore >= 65) counts.whale++;
    if (chg >= -40 && chg <= -4 && br > 0.62) counts.dip++;
    if (chg >= 12 && chg <= 70 && t.token.volume24h >= 80000) counts.breakout++;
    if (t.token.volume24h >= 250000) counts.volExplosion++;
    if (chg >= 20 && ((t.token.dexSource === 'pumpfun') || (t.token.dexId || '').toLowerCase().includes('pump'))) counts.meme++;
    if (t.riskLevel === 'LOW' && t.signal === 'STRONG_BUY' && t.token.makers24h >= 150) counts.smartMoney++;
  }

  // RISK_OFF macro = be conservative
  if (macro?.bias === 'RISK_OFF') {
    if (counts.smartMoney >= 1) return { strategyId: 'smart_money_flow', reason: `RISK_OFF macro — ${counts.smartMoney} LOW-risk STRONG_BUY token(s). Institutional-grade entries only` };
    if (counts.dip >= 1)        return { strategyId: 'dip_sniper',       reason: `RISK_OFF macro — ${counts.dip} accumulation dip(s) with strong buy pressure. Cautious entries only` };
    return { strategyId: 'smart_money_flow', reason: 'RISK_OFF macro — conservative mode, waiting for institutional quality setups' };
  }

  // Abundance-based priority (pick the setup with the most confirmations)
  if (counts.volExplosion >= 2) return { strategyId: 'volume_explosion',  reason: `${counts.volExplosion} tokens with explosive volume (>$250K) — institutional attention confirmed` };
  if (counts.whale >= 2)        return { strategyId: 'whale_follower',    reason: `${counts.whale} tokens with real whale accumulation (large avg tx + concentrated wallets)` };
  if (counts.breakout >= 2)     return { strategyId: 'breakout_hunter',   reason: `${counts.breakout} confirmed breakout setups (12–70% move + volume >$80K)` };
  if (counts.meme >= 2)         return { strategyId: 'meme_velocity',     reason: `${counts.meme} meme tokens pumping on Pump.fun — velocity play` };
  if (counts.dip >= 2)          return { strategyId: 'dip_sniper',        reason: `${counts.dip} tokens dipping with smart-money accumulation` };
  if (counts.whale >= 1)        return { strategyId: 'whale_follower',    reason: `${counts.whale} whale accumulation token detected — follow the smart money` };
  if (counts.volExplosion >= 1) return { strategyId: 'volume_explosion',  reason: `${counts.volExplosion} explosive volume token — institutional move in progress` };

  // RISK_ON = ride the wave
  if (macro?.bias === 'RISK_ON') return { strategyId: 'momentum_surfer', reason: `RISK_ON macro — BTC/ETH/SOL all positive. Ride the momentum` };

  return { strategyId: 'momentum_surfer', reason: 'Mixed market — default momentum scan' };
}

// ── Strategy entry criteria descriptions (for AI prompt context) ─────────────
// Tells the AI reviewer exactly what each strategy is hunting for so it gives
// relevant, not generic, trade analysis in the confirm/skip reasoning.
function getStrategyEntryContext(strategyId: string): string {
  switch (strategyId) {
    case 'whale_follower':
      return 'ENTRY FILTER: avg transaction size >$1K (whale-sized, not retail), <150 unique wallets (concentrated accumulation), whale score ≥65, buy/sell ratio >58%. SKIP tokens with many small retail txns or scattered wallets.';
    case 'momentum_surfer':
      return 'ENTRY FILTER: price up 5–80%, buy ratio >55%, volume >$30K. Riding an existing uptrend. Skip flat or down tokens.';
    case 'breakout_hunter':
      return 'ENTRY FILTER: price up 12–70% (not overextended), volume >$80K, buy ratio >58%. STRONG_BUY preferred. Skip micro-cap low-volume setups.';
    case 'dip_sniper':
      return 'ENTRY FILTER: price DOWN 4–40% in 24h BUT buy ratio >62% (smart accumulation against the trend). Counter-trend entry — requires clear accumulation signal in the dip.';
    case 'meme_velocity':
      return 'ENTRY FILTER: price up >20%, Pump.fun preferred, high velocity short-lived pump. Quick in-out (10–15 min). Accept HIGH risk. Prioritise momentum and exit speed.';
    case 'volume_explosion':
      return 'ENTRY FILTER: 24h volume >$250K (institutional or viral event), buy ratio >52%. Volume is the primary signal — price direction secondary.';
    case 'smart_money_flow':
      return 'ENTRY FILTER: LOW risk ONLY, STRONG_BUY only, ≥150 unique wallets (distributed, not pumped), multi-day hold target. SKIP HIGH/EXTREME risk tokens.';
    case 'liquidity_sweep':
      return 'ENTRY FILTER: recent dip then bounce (price -15% to +10%), buy ratio >62%, sentiment ≥55. Quick scalp on a liquidity sweep bounce. Small size, fast exit.';
    case 'adaptive':
      return 'ENTRY FILTER: adaptive mode — strategy selected each scan based on current conditions. Evaluate against the actual strategy in use this cycle.';
    default:
      return '';
  }
}

function createInitialState(config: SolEngineConfig): SolEngineState {
  return {
    isRunning: false,
    config,
    lastScanAt: 0,
    lastTokenSnapshot: {},
    lastTriggerAt: {},
    activityFeed: [],
    signalWeights: Object.fromEntries(DEX_NAMES.map(d => [d, 1.0])),
    kellyStats: Object.fromEntries(DEX_NAMES.map(d => [d, { wins: 0, losses: 0, totalGainPct: 0 }])),
    sessionHighWatermark: 0,
    currentPortfolioValue: 0,
    shieldActive: false,
    scanTimer: null,
    lastResults: [],
    lastMacro: null,
    weeklyGoal: { ...DEFAULT_WEEKLY_GOAL },
    activeStrategy: 'momentum_surfer',
    activeStrategies: ['momentum_surfer'],
    lastAgentConsensus: [],
    autoTradeEnabled: false,
    liveTradeEnabled: false,
    paperPositions: [],
    closedPaperPositions: [],
    livePositions: [],
    closedLivePositions: [],
    pendingSignals: [],
    pendingExits: [],
    signalCooldowns: new Map(),
    autoTradeTP: 8,
    autoTradeSL: 4,
    autoTrailActivationPct: 4,
    autoTrailDistancePct: 3,
    paperTradeSize: 0,
    compoundMode: false,
    compoundRate: 100,
    paperBaseCapital: 0,
    paperPortfolioValue: 0,
    paperPortfolioHistory: [],
    autoTradeStats: { totalTrades: 0, wins: 0, losses: 0, totalPnlPct: 0, bestTradePct: 0, worstTradePct: 0 },
    aiReviewCache: {},
  };
}

function addActivity(state: SolEngineState, entry: Omit<SolActivityEntry, 'timestamp'>) {
  state.activityFeed.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (state.activityFeed.length > 100) state.activityFeed = state.activityFeed.slice(0, 100);
}

function getAdaptiveScanInterval(config: SolEngineConfig): number {
  if (!config.adaptiveScan) return 60000;
  const hourUtc = new Date().getUTCHours();
  const dayUtc = new Date().getUTCDay();
  if (dayUtc === 0 || dayUtc === 6) return 120000;
  if (hourUtc >= 13 && hourUtc < 20) return 30000;
  if (hourUtc >= 7 && hourUtc < 13) return 60000;
  return 120000;
}

function calculateSolKellySize(wins: number, losses: number, totalGainPct: number, portfolioSol: number): number {
  const total = wins + losses;
  if (total < 3 || portfolioSol <= 0) return 0;
  const winRate = wins / total;
  const avgGain = wins > 0 ? totalGainPct / wins / 100 : 0.5;
  const kelly = winRate - (1 - winRate) / Math.max(avgGain, 0.01);
  const fractional = Math.max(0.005, Math.min(0.15, kelly * 0.25));
  return Math.round(portfolioSol * fractional * 1000) / 1000;
}

function getPhaseMultiplier(phase: SolWeeklyGoal['phase'], winStreak: number): number {
  switch (phase) {
    case 'warming_up': return 0.8;
    case 'building': return 1.0;
    case 'accelerating': return 1.25;
    case 'cruising': return 1.0;
    case 'pushing': return Math.min(2.0, 1.5 + (winStreak >= 3 ? 0.25 : 0));
    case 'target_reached': return 0.5;
    default: return 1.0;
  }
}

function computeGoalPhase(goal: SolWeeklyGoal): SolWeeklyGoal['phase'] {
  if (goal.targetSol <= 0 || goal.phase === 'idle') return 'idle';
  const pct = goal.currentProfitSol / goal.targetSol;
  if (pct >= 1.0) return 'target_reached';
  if (pct >= 0.85) return 'pushing';
  if (pct >= 0.70) return 'cruising';
  if (pct >= 0.50) return 'accelerating';
  if (pct >= 0.20) return 'building';
  return 'warming_up';
}

function computeAutoSolSize(state: SolEngineState, dex: string, overrideStrategy?: SolStrategy, mode: 'paper' | 'live' = 'live'): number {
  // Fixed paper trade size overrides all fraction math
  if (mode === 'paper' && state.paperTradeSize > 0) return state.paperTradeSize;

  const portfolio = (mode === 'paper' && state.compoundMode && state.paperPortfolioValue > 0)
    ? state.paperPortfolioValue
    : state.currentPortfolioValue;
  if (portfolio <= 0) return 0;

  const strategy = overrideStrategy || SOL_STRATEGIES.find(s => s.id === state.activeStrategy) || SOL_STRATEGIES[0];
  const phaseMultiplier = getPhaseMultiplier(state.weeklyGoal.phase, state.weeklyGoal.winStreak);

  let fraction = strategy.baseFraction * phaseMultiplier;

  if (state.config.useKelly) {
    const stats = state.kellyStats[dex] || { wins: 0, losses: 0, totalGainPct: 0 };
    const kellySize = calculateSolKellySize(stats.wins, stats.losses, stats.totalGainPct, portfolio);
    if (kellySize > 0) {
      const kellyFrac = kellySize / portfolio;
      fraction = (fraction + kellyFrac) / 2;
    }
  }

  fraction = Math.max(0.005, Math.min(0.15, fraction));
  return Math.round(portfolio * fraction * 1000) / 1000;
}

function runQuantRulesAgent(
  token: TokenAnalysis,
  macroBias: string | null
): { verdict: 'CONFIRM_BUY' | 'WATCH' | 'SKIP'; score: number } {
  let score = 0;

  // Sentiment score
  if (token.sentimentScore > 70) score += 20;
  else if (token.sentimentScore >= 50) score += 5;
  else if (token.sentimentScore < 40) score -= 15;

  // Tokenomics score
  if (token.tokenomicsScore > 70) score += 20;
  else if (token.tokenomicsScore >= 50) score += 5;
  else if (token.tokenomicsScore < 40) score -= 15;

  // Whale score
  if (token.whaleScore > 65) score += 15;
  else if (token.whaleScore >= 45) score += 5;
  else if (token.whaleScore < 35) score -= 10;

  // Volume (txns buy/sell ratio)
  const buys = token.token.txns24h?.buys ?? 0;
  const sells = token.token.txns24h?.sells ?? 0;
  const totalTxns = buys + sells;
  if (totalTxns > 0) {
    const buyRatio = buys / totalTxns;
    if (buyRatio > 0.65) score += 15;
    else if (buyRatio > 0.5) score += 5;
    else if (buyRatio < 0.35) score -= 15;
  }

  // 24h price change — avoid overextended
  const chg = token.token.priceChange24h;
  if (chg > 50) score -= 15;
  else if (chg > 20) score -= 5;
  else if (chg >= 5) score += 10;
  else if (chg >= 0) score += 5;
  else score -= 5;

  // Macro bias
  if (macroBias === 'bullish') score += 10;
  else if (macroBias === 'bearish') score -= 15;

  // Risk level penalty
  if (token.riskLevel === 'EXTREME') score -= 10;
  else if (token.riskLevel === 'LOW') score += 5;

  if (score >= 60) return { verdict: 'CONFIRM_BUY', score };
  if (score >= 30) return { verdict: 'WATCH', score };
  return { verdict: 'SKIP', score };
}

async function runSolAIReview(
  userId: number,
  state: SolEngineState,
  scanResult: TokenAnalysis[],
  openPositions: OpenPositionSummary[]
): Promise<void> {
  const buySignals = scanResult
    .filter(t => t.signal === 'STRONG_BUY' || t.signal === 'BUY')
    .slice(0, 5);
  if (buySignals.length === 0 && openPositions.length === 0) return;

  // ── Response cache ────────────────────────────────────────────────────────
  const cacheKey = [
    ...buySignals.map(t => t.token.symbol).sort(),
    ...openPositions.map(p => p.symbol).sort(),
  ].join('|');
  const cached = state.aiReviewCache[cacheKey];
  if (cached && Date.now() - cached.ts < 90_000) {
    const ageS = Math.round((Date.now() - cached.ts) / 1000);
    addActivity(state, {
      type: 'info',
      message: `💾 Sol AI cache hit — reusing recent review (${ageS}s old)`,
    });
    return;
  }

  try {
    const { getUniversalAIClientForUser } = await import('../openai');

    // ── Economy mode: route to Groq Llama 3.3-70b (free) ─────────────────
    let openai: any;
    let modelLabel = 'GPT-4o';
    if (state.config.aiMode === 'economy' && process.env.GROQ_API_KEY) {
      const OpenAI = (await import('openai')).default;
      openai = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      });
      (openai as any).defaultModel = 'llama-3.3-70b-versatile';
      modelLabel = 'Groq Llama';
      addActivity(state, {
        type: 'info',
        message: '💚 Sol Economy mode: routing to Groq Llama 3.3-70b (free)',
      });
    } else {
      openai = await getUniversalAIClientForUser(userId);
    }

    // When adaptive mode is running, use the auto-selected sub-strategy for the prompt
    const effectiveStrategyId = (state.activeStrategy === 'adaptive' || state.activeStrategies.includes('adaptive'))
      ? (state._adaptiveStrategy || 'momentum_surfer')
      : state.activeStrategy;
    const strategy = SOL_STRATEGIES.find(s => s.id === effectiveStrategyId) || SOL_STRATEGIES[0];
    const macro = state.lastMacro;
    const goal = state.weeklyGoal;

    const macroLine = macro
      ? `MACRO: BTC ${macro.btcChange >= 0 ? '+' : ''}${macro.btcChange.toFixed(1)}% | ETH ${macro.ethChange >= 0 ? '+' : ''}${macro.ethChange.toFixed(1)}% | SOL ${macro.solChange >= 0 ? '+' : ''}${macro.solChange.toFixed(1)}% — Bias: ${macro.bias}`
      : '';

    const goalLine = goal.phase !== 'idle'
      ? `WEEKLY GOAL: ${goal.currentProfitSol.toFixed(3)} / ${goal.targetSol.toFixed(3)} SOL (${((goal.currentProfitSol / Math.max(goal.targetSol, 0.001)) * 100).toFixed(1)}%) — Phase: ${goal.phase.replace(/_/g, ' ').toUpperCase()}`
      : 'WEEKLY GOAL: None set';

    const entryContext = getStrategyEntryContext(effectiveStrategyId);

    const systemPrompt = `You are VEDD Sol AI — an autonomous Solana token trading mind operating within the Supreme Mathematics framework.
ACTIVE STRATEGY: ${strategy.icon} ${strategy.name} — ${strategy.description}
Hold target: ${strategy.holdTarget} | Min confidence: ${strategy.minConfidence}% | Risk: ${strategy.maxRisk}
${entryContext ? `\n${entryContext}\n` : ''}
${goalLine}
WIN STREAK: ${goal.winStreak}
DRAWDOWN SHIELD: ${state.shieldActive ? 'ACTIVE — conservative mode only' : 'OFF'}
${macroLine}

COMMUNICATION STYLE — SUPREME MATHEMATICS (Gods and Earths framework):
When writing the "reason" field for each decision, weave in Supreme Mathematics / Gods and Earths language naturally and authentically. Map the framework to Solana trading as follows:
- Knowledge (1) = Reading the token data, chart signals, and market structure
- Wisdom (2) = Applying strategy with discipline — the correct action taken from what you know
- Understanding (3) = The clear picture — seeing the setup fully, knowing exactly what price is doing
- Culture/Freedom (4) = Your trading rhythm — freedom through mastery of the cipher
- Power/Refinement (5) = Risk management, sizing, refining the edge — power through control
- Equality (6) = Balance of R:R — what the market gives, it can take; entries must justify risk
- God (7) = Full control of the trade — mastering the setup from entry to exit
- Build/Destroy (8) = Building the account, destroying weak setups before they cost SOL
- Born (9) = A trade closed — knowledge born into profit, a lesson completed
- Cipher (0/10) = The full market cycle — complete understanding of all moving parts

Use terms like: "Peace", "The science of it is...", "Word is bond", "Build on that", "That's the mathematics", "Stay in the cipher", "Knowledge yourself", "dropping science", "righteously"
Keep it natural — not every sentence. Weave it in where it fits. ALL numbers, prices, and percentages stay precise and clean. The lingo lives in the explanatory text only.

Review the signals and open positions below. Output a JSON array of decisions.
- For signals: type="signal", action=CONFIRM_BUY|SKIP|WATCH|WAIT, reason (max 80 chars, use the lingo naturally)
  CONFIRM_BUY = token meets THIS strategy's entry criteria exactly. SKIP = does not fit. WATCH = borderline, monitor. WAIT = macro/conditions not right — no buys now.
- For positions: type="position", action=HOLD|TRAIL|PARTIAL_CLOSE|CLOSE, trailPct=integer (only for TRAIL), reason (max 80 chars, use the lingo naturally)
  HOLD = conditions still valid. TRAIL = lock in gains. PARTIAL_CLOSE = take 50% off. CLOSE = exit now.
CRITICAL: Only CONFIRM_BUY if the token genuinely fits the active strategy entry criteria above. Do NOT CONFIRM_BUY just because confidence is high — if the token doesn't match the strategy filter, SKIP it.
Return ONLY the JSON array, no markdown, no explanation.`;

    const signalsText = buySignals.length > 0
      ? buySignals.map(t =>
          `${t.token.symbol}: ${t.signal} | Conf:${t.confidence}% | Sent:${t.sentimentScore} | Tok:${t.tokenomicsScore} | Whale:${t.whaleScore} | Vol:$${(t.token.volume24h / 1000).toFixed(0)}K | Chg:${t.token.priceChange24h.toFixed(1)}%`
        ).join('\n')
      : 'None';

    const positionsText = openPositions.length > 0
      ? openPositions.map(p =>
          `${p.symbol}: entry $${p.entryPrice.toFixed(8)} → now $${p.currentPrice.toFixed(8)} | ${p.gainPct >= 0 ? '+' : ''}${p.gainPct.toFixed(1)}% | vol:${p.volumeStatus}`
        ).join('\n')
      : 'None';

    const userPrompt = `SIGNALS:\n${signalsText}\n\nOPEN POSITIONS:\n${positionsText}`;

    const response = await openai.chat.completions.create({
      model: (openai as any).defaultModel || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.25,
      max_tokens: 600,
    });

    const raw = response.choices[0]?.message?.content?.trim() || '[]';
    let decisions: Array<{ symbol: string; type: 'signal' | 'position'; action: string; trailPct?: number; reason: string }> = [];
    try {
      decisions = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch { return; }

    // ── Store result in cache ─────────────────────────────────────────────
    state.aiReviewCache[cacheKey] = { ts: Date.now(), result: decisions };

    const newConsensus: AgentConsensusResult[] = [];
    const macroBias = state.lastMacro?.bias ?? null;

    for (const d of decisions) {
      if (!d || !d.symbol) continue;
      if (d.type === 'signal') {
        const tokenData = buySignals.find(t => t.token.symbol === d.symbol);
        let gptVerdict = d.action as string;
        let consensusLabel: AgentConsensusResult['consensus'] = 'WATCH';

        if (tokenData) {
          const quant = runQuantRulesAgent(tokenData, macroBias);
          const bothConfirm = quant.verdict === 'CONFIRM_BUY' && d.action === 'CONFIRM_BUY';
          const bothSkip = quant.verdict === 'SKIP' && d.action === 'SKIP';
          const disagree = (quant.verdict === 'CONFIRM_BUY' && d.action === 'SKIP') ||
                           (quant.verdict === 'SKIP' && d.action === 'CONFIRM_BUY');
          const oneWatch = quant.verdict === 'WATCH' || d.action === 'WATCH';

          if (bothConfirm) consensusLabel = 'STRONG_CONFIRM';
          else if (bothSkip) consensusLabel = 'STRONG_SKIP';
          else if (disagree) consensusLabel = 'CAUTION';
          else if (oneWatch) consensusLabel = 'WATCH';

          newConsensus.push({
            symbol: d.symbol,
            quantVerdict: quant.verdict,
            quantScore: quant.score,
            gptVerdict,
            consensus: consensusLabel,
            timestamp: new Date().toISOString(),
          });

          const consensusMsg =
            consensusLabel === 'STRONG_CONFIRM' ? `🤝 STRONG CONFIRM: ${d.symbol} — Both agents aligned. Word is bond.` :
            consensusLabel === 'STRONG_SKIP' ? `❌ STRONG SKIP: ${d.symbol} — Both agents say pass. That's the mathematics.` :
            consensusLabel === 'CAUTION' ? `⚠️ SPLIT SIGNAL: ${d.symbol} — Agents disagree. Knowledge yourself before entry.` :
            `👁️ WATCH: ${d.symbol} — Mixed readings. Stay in the cipher.`;

          addActivity(state, { type: 'signal', message: consensusMsg });
        }

        const icon = d.action === 'CONFIRM_BUY' ? '🤖✅' : d.action === 'SKIP' ? '🤖❌' : d.action === 'WAIT' ? '🤖⏸️' : '🤖👁️';
        addActivity(state, {
          type: 'signal',
          message: `${icon} ${modelLabel} ${d.action}: ${d.symbol} — ${d.reason || ''}`,
        });
      } else if (d.type === 'position') {
        const icon = d.action === 'CLOSE' ? '📊🔴' : d.action === 'TRAIL' ? '📊🔼' : d.action === 'PARTIAL_CLOSE' ? '📊⚡' : '📊🟢';
        addActivity(state, {
          type: 'strategy',
          message: `${icon} AI ${d.action}: ${d.symbol}${d.trailPct ? ` (${d.trailPct}% trail dist)` : ''} — ${d.reason || ''}`,
        });
      }
    }

    if (newConsensus.length > 0) {
      state.lastAgentConsensus = [...newConsensus, ...state.lastAgentConsensus].slice(0, 20);
    }
  } catch {
    // Silent fallback — never crash the scan loop if AI review fails
  }
}

export async function triggerSolAIReview(userId: number, openPositions: OpenPositionSummary[] = []): Promise<void> {
  const state = engineStates.get(userId);
  if (!state) return;
  await runSolAIReview(userId, state, state.lastResults, openPositions);
}

// Staged volume-adjusted trail distance — mirrors client-side computeTrailDistance
function computeServerTrailDist(gainPct: number, volStatus: string): number {
  const isStrong = volStatus === 'surging' || volStatus === 'above_average';
  const isWeak = volStatus === 'below_average' || volStatus === 'dry';
  if (gainPct >= 80) return isStrong ? 10 : isWeak ? 6 : 8;
  if (gainPct >= 40) return isStrong ? 12 : isWeak ? 8 : 10;
  return isStrong ? 15 : isWeak ? 10 : 12; // 20–39% zone
}

function getVolStatus(entryVol: number, currentVol: number): string {
  if (entryVol <= 0) return 'average';
  const ratio = currentVol / entryVol;
  if (ratio >= 2.5) return 'surging';
  if (ratio >= 1.25) return 'above_average';
  if (ratio <= 0.5) return 'dry';
  if (ratio <= 0.75) return 'below_average';
  return 'average';
}

function monitorPaperPositions(state: SolEngineState) {
  const openPositions = state.paperPositions.filter(p => p.status === 'open');
  if (openPositions.length === 0) return;

  const priceMap: Record<string, number> = {};
  const volumeMap: Record<string, number> = {};
  for (const r of state.lastResults) {
    priceMap[r.token.symbol] = parseFloat(r.token.priceUsd) || 0;
    volumeMap[r.token.symbol] = r.token.volume24h || 0;
  }

  for (const pos of openPositions) {
    const currentPrice = priceMap[pos.symbol];
    if (!currentPrice || currentPrice <= 0) continue;

    pos.currentPrice = currentPrice;
    const gainPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;

    // ── Update peak price ────────────────────────────────────────────────
    if (!pos.peakPrice || currentPrice > pos.peakPrice) {
      pos.peakPrice = currentPrice;
    }

    // ── Volume status ────────────────────────────────────────────────────
    const currentVol = volumeMap[pos.symbol] || 0;
    const volStatus = getVolStatus(pos.entryVolume24h || 0, currentVol);

    // ── Staged volume-momentum trailing stop ─────────────────────────────
    // Stage 1 (<8% gain): SL-only, no floor movement
    // Stage 2 (8–19% gain): Breakeven floor — trail floor locks at entry price
    // Stage 3 (≥trailActivationPct gain): Active trail with volume-adjusted distance
    // trailActivationPct is sourced from the position (user-configured), default 20
    const trailActivation = (pos.trailActivationPct && pos.trailActivationPct > 0) ? pos.trailActivationPct : 20;
    let isTrailHit = false;

    if (gainPct >= trailActivation) {
      // Stage 3 — activate real trail
      if (!pos.trailingActive) {
        pos.trailingActive = true;
        const dist = computeServerTrailDist(gainPct, volStatus);
        addActivity(state, {
          type: 'info',
          message: `🔒 Trail LOCKED: ${pos.symbol} hit +${gainPct.toFixed(1)}% (activation: ${trailActivation}%) — staged trail active | vol: ${volStatus} | dist: ${dist}% from peak`,
        });
      }
      const dist = computeServerTrailDist(gainPct, volStatus);
      // Floor is the higher of: (a) computed trail floor, (b) breakeven (entry price)
      const trailFloor = pos.peakPrice * (1 - dist / 100);
      const effectiveFloor = Math.max(trailFloor, pos.entryPrice);
      if (currentPrice <= effectiveFloor) {
        isTrailHit = true;
      }
    } else if (gainPct >= 8) {
      // Stage 2 — breakeven protection, no trail exit yet
      if (!pos.breakevenActive) {
        pos.breakevenActive = true;
        addActivity(state, {
          type: 'info',
          message: `🛡️ Breakeven floor set: ${pos.symbol} at +${gainPct.toFixed(1)}% — floor locked at entry price`,
        });
      }
    }

    const isWin = gainPct >= pos.targetPct;
    const isLoss = gainPct <= -pos.slPct;

    if (isWin || isLoss || isTrailHit) {
      const reason = isTrailHit ? 'trail' : isWin ? 'tp' : 'sl';
      pos.status = 'closed';
      pos.closedAt = new Date().toISOString();
      pos.closePnlPct = gainPct;
      pos.closeReason = reason;

      state.closedPaperPositions.unshift(pos);
      if (state.closedPaperPositions.length > 50) state.closedPaperPositions = state.closedPaperPositions.slice(0, 50);

      state.autoTradeStats.totalTrades++;
      state.autoTradeStats.totalPnlPct += gainPct;
      const isProfit = gainPct > 0;
      if (isProfit) {
        state.autoTradeStats.wins++;
        if (gainPct > state.autoTradeStats.bestTradePct) state.autoTradeStats.bestTradePct = gainPct;
      } else {
        state.autoTradeStats.losses++;
        if (gainPct < state.autoTradeStats.worstTradePct) state.autoTradeStats.worstTradePct = gainPct;
      }

      // Compounding: fold P&L back into the paper portfolio
      if (state.compoundMode && state.paperPortfolioValue > 0) {
        const tradeSol = pos.size;
        const rawPnlSol = tradeSol * (gainPct / 100);
        const compoundedPnl = rawPnlSol * (state.compoundRate / 100);
        const prev = state.paperPortfolioValue;
        state.paperPortfolioValue = Math.max(0.001, prev + compoundedPnl);
        state.paperPortfolioHistory.push({ t: Date.now(), v: state.paperPortfolioValue });
        if (state.paperPortfolioHistory.length > 50) state.paperPortfolioHistory = state.paperPortfolioHistory.slice(-50);
        const growthPct = ((state.paperPortfolioValue - state.paperBaseCapital) / state.paperBaseCapital) * 100;
        addActivity(state, {
          type: 'info',
          message: `💹 Compound update: ${compoundedPnl >= 0 ? '+' : ''}${compoundedPnl.toFixed(4)} SOL ${state.compoundRate < 100 ? `(${state.compoundRate}% reinvested)` : 'fully reinvested'} → pool now ${state.paperPortfolioValue.toFixed(4)} SOL (${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}% from base)`,
        });
      }

      const emoji = isTrailHit ? '🔒' : isWin ? '✅' : '❌';
      const label = isTrailHit ? `TRAIL EXIT` : isWin ? 'WIN' : 'LOSS';
      addActivity(state, {
        type: 'paper_sell',
        message: `${emoji} Paper ${label}: ${pos.symbol} closed @ $${currentPrice.toFixed(6)} — ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}% | ${pos.size.toFixed(3)} SOL ${isTrailHit ? '(trailing stop hit)' : isWin ? 'profit sealed' : 'lesson built'}`,
      });

      // Update DEX signal weights and Kelly stats from auto-closes
      const dexKeyClose = (pos.strategyId || 'unknown').toLowerCase().replace(/[^a-z]/g, '') || 'unknown';
      if (!state.signalWeights[dexKeyClose]) state.signalWeights[dexKeyClose] = 1.0;
      if (!state.kellyStats[dexKeyClose]) state.kellyStats[dexKeyClose] = { wins: 0, losses: 0, totalGainPct: 0 };
      if (isProfit) {
        state.signalWeights[dexKeyClose] = Math.min(2.0, state.signalWeights[dexKeyClose] + 0.05);
        state.kellyStats[dexKeyClose].wins++;
        state.kellyStats[dexKeyClose].totalGainPct += Math.abs(gainPct);
        state.weeklyGoal.winStreak = (state.weeklyGoal.winStreak || 0) + 1;
      } else {
        state.signalWeights[dexKeyClose] = Math.max(0.2, state.signalWeights[dexKeyClose] - 0.08);
        state.kellyStats[dexKeyClose].losses++;
        state.weeklyGoal.winStreak = 0;
      }
      // Update weekly goal P&L with actual gain
      if (state.weeklyGoal.phase !== 'idle') {
        state.weeklyGoal.currentProfitSol += pos.size * (gainPct / 100);
        state.weeklyGoal.tradeHistory.unshift({
          timestamp: new Date().toISOString(),
          symbol: pos.symbol,
          sol: pos.size,
          gainPct,
          outcome: isProfit ? 'WIN' : 'LOSS',
          strategy: pos.strategyId || state.activeStrategy,
        });
        if (state.weeklyGoal.tradeHistory.length > 100) state.weeklyGoal.tradeHistory = state.weeklyGoal.tradeHistory.slice(0, 100);
      }
    }
  }

  state.paperPositions = state.paperPositions.filter(p => p.status === 'open');
}

async function monitorLivePositions(userId: number, state: SolEngineState) {
  const openPositions = state.livePositions.filter(p => p.status === 'open' && p.entryPrice > 0 && p.tokenAmount > 0);
  if (openPositions.length === 0) return;

  const now = Date.now();

  // Prune expired pending exits
  state.pendingExits = state.pendingExits.filter(e => new Date(e.expiresAt).getTime() > now);

  const priceMap: Record<string, number> = {};
  const volumeMap: Record<string, number> = {};
  for (const r of state.lastResults) {
    priceMap[r.token.symbol] = parseFloat(r.token.priceUsd) || 0;
    volumeMap[r.token.symbol] = r.token.volume24h || 0;
  }

  for (const pos of openPositions) {
    const currentPrice = priceMap[pos.symbol];
    if (!currentPrice || currentPrice <= 0) continue;

    pos.currentPrice = currentPrice;
    const gainPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;

    // Update peak price
    if (!pos.peakPrice || currentPrice > pos.peakPrice) pos.peakPrice = currentPrice;

    // Skip if a pending exit already queued for this position
    const alreadyQueued = state.pendingExits.some(e => e.positionId === pos.id);
    if (alreadyQueued) continue;

    // Staged trail check (mirrors paper logic) — uses position's stored trailActivationPct
    const liveTrailActivation = (pos.trailActivationPct && pos.trailActivationPct > 0) ? pos.trailActivationPct : 20;
    const volStatus = getVolStatus(pos.entryVolume24h || 0, volumeMap[pos.symbol] || 0);
    let trailHit = false;
    if (gainPct >= liveTrailActivation && pos.peakPrice) {
      if (!pos.trailingActive) {
        pos.trailingActive = true;
        addActivity(state, { type: 'info', message: `🔒 Live Trail LOCKED: ${pos.symbol} hit +${gainPct.toFixed(1)}% (activation: ${liveTrailActivation}%) — staged trail active (${volStatus} vol)` });
      }
      const dist = computeServerTrailDist(gainPct, volStatus);
      const effectiveFloor = Math.max(pos.peakPrice * (1 - dist / 100), pos.entryPrice);
      if (currentPrice <= effectiveFloor) trailHit = true;
    }

    const tpHit = gainPct >= pos.targetPct;
    const slHit = gainPct <= -pos.slPct;

    if (tpHit || slHit || trailHit) {
      const reason: 'tp' | 'sl' | 'trail' = tpHit ? 'tp' : trailHit ? 'trail' : 'sl';

      // Try server-side sell first (if bot wallet is configured)
      const serverSold = await executeServerSideSell(userId, pos, reason as any, state);
      if (!serverSold) {
        // Fall back to browser-based exit queue
        const created = new Date();
        const expires = new Date(created.getTime() + 90000);
        state.pendingExits.push({
          positionId: pos.id,
          symbol: pos.symbol,
          mint: pos.mint,
          tokenAmount: pos.tokenAmount,
          decimals: pos.decimals,
          reason: reason === 'trail' ? 'sl' : reason,
          createdAt: created.toISOString(),
          expiresAt: expires.toISOString(),
        });
        addActivity(state, {
          type: 'live_sell',
          message: tpHit
            ? `🎯 TP hit: ${pos.symbol} +${gainPct.toFixed(1)}% — sell queued for wallet execution`
            : trailHit
            ? `🔒 Trail exit: ${pos.symbol} +${gainPct.toFixed(1)}% — sell queued for wallet execution`
            : `🛡️ SL hit: ${pos.symbol} ${gainPct.toFixed(1)}% — sell queued for wallet execution`,
        });
      }
    }
  }
}

async function runScan(userId: number, state: SolEngineState, triggerToken?: string) {
  if (!state.isRunning) return;
  try {
    const macro = await fetchCryptoMacroContext().catch(() => null);
    state.lastMacro = macro;

    const shieldFilter = state.config.shieldEnabled && state.shieldActive;

    const { getUniversalAIClientForUser } = await import('../openai');
    const userOpenai = await getUniversalAIClientForUser(userId).catch(() => null);

    const scanResult = await scanAndAnalyzeTokens(
      state.config.maxTokens,
      state.config.dexFilter,
      {
        signalWeights: state.signalWeights,
        macro: macro || undefined,
        kellyStats: state.config.useKelly ? state.kellyStats : undefined,
        portfolioSol: state.currentPortfolioValue,
        shieldActive: shieldFilter,
        minConfidence: state.config.minConfidence,
        openai: userOpenai || undefined,
      }
    );

    const now = Date.now();
    state.lastScanAt = now;

    for (const dex of DEX_NAMES) {
      state.signalWeights[dex] = Math.round((state.signalWeights[dex] * 0.99 + 1.0 * 0.01) * 1000) / 1000;
    }

    for (const analysis of scanResult) {
      const key = analysis.token.address;
      const prev = state.lastTokenSnapshot[key];
      if (prev && analysis.token.volume24h > 0 && prev.volume > 0) {
        const volumeMultiple = analysis.token.volume24h / prev.volume;
        const lastTrigger = state.lastTriggerAt[key] || 0;
        if (volumeMultiple >= 3 && now - lastTrigger > 60000) {
          state.lastTriggerAt[key] = now;
          addActivity(state, {
            type: 'trigger',
            message: `⚡ Power surge on ${analysis.token.symbol} (${volumeMultiple.toFixed(1)}×) — knowledge deepens in 8s`,
          });
          setTimeout(() => runScan(userId, state, analysis.token.symbol), 8000);
        }
      }
      state.lastTokenSnapshot[key] = {
        volume: analysis.token.volume24h,
        price: parseFloat(analysis.token.priceUsd) || 0,
        signal: analysis.signal,
        confidence: analysis.confidence,
      };

      if ((analysis.signal === 'STRONG_BUY' || analysis.signal === 'BUY') && state.currentPortfolioValue > 0) {

        // ── Overextension filter: skip tokens already up >80% in 24h ───────────
        // Chasing a token after an 80%+ pump dramatically increases the chance of
        // buying the top. These are almost always exits not entries.
        if (analysis.token.priceChange24h > 80) {
          addActivity(state, {
            type: 'info',
            message: `⛔ Overextended: ${analysis.token.symbol} skipped — already +${analysis.token.priceChange24h.toFixed(0)}% in 24h (>80% = likely top)`,
          });
          continue;
        }

        // ── AI/Quant consensus gate: STRONG_SKIP from prior review blocks entry ─
        // runSolAIReview fires after each scan and stores results in lastAgentConsensus.
        // If both the AI and quant rules said SKIP on this symbol, don't trade it.
        const priorConsensus = state.lastAgentConsensus?.find(c => c.symbol === analysis.token.symbol);
        if (priorConsensus && priorConsensus.consensus === 'STRONG_SKIP') {
          addActivity(state, {
            type: 'info',
            message: `🤖❌ Consensus BLOCK: ${analysis.token.symbol} — both AI and quant said SKIP (quant score: ${priorConsensus.quantScore}). That's the mathematics.`,
          });
          continue;
        }
        // Also block if quant alone gives a hard SKIP with a very low score (<10)
        if (priorConsensus && priorConsensus.quantVerdict === 'SKIP' && priorConsensus.quantScore < 10) {
          addActivity(state, {
            type: 'info',
            message: `📐❌ Quant BLOCK: ${analysis.token.symbol} — quant score ${priorConsensus.quantScore} too low. Knowledge yourself.`,
          });
          continue;
        }

        const dexKey = (analysis.token.dexId || '').toLowerCase().split('_')[0];

        // ── Adaptive mode: auto-select strategy from current scan results ──
        let activeStrats = state.activeStrategies.length > 0 ? state.activeStrategies : [state.activeStrategy];
        const isAdaptiveMode = activeStrats.includes('adaptive') || state.activeStrategy === 'adaptive';
        if (isAdaptiveMode) {
          const autoRec = selectAdaptiveSolStrategy(state.lastMacro, scanResult);
          if (!state._adaptiveStrategy || state._adaptiveStrategy !== autoRec.strategyId) {
            state._adaptiveStrategy = autoRec.strategyId;
            addActivity(state, {
              type: 'strategy',
              message: `🤖 Adaptive selected: ${SOL_STRATEGIES.find(s => s.id === autoRec.strategyId)?.icon || ''}${autoRec.strategyId.replace(/_/g, ' ').toUpperCase()} — ${autoRec.reason}`,
            });
          }
          activeStrats = [autoRec.strategyId];
        }

        // Multi-strategy: find all confirming strategies (standard gates + strategy-specific filter)
        const confirmingStrats = activeStrats
          .map(id => SOL_STRATEGIES.find(s => s.id === id))
          .filter((s): s is SolStrategy => !!s)
          .filter(s => {
            if (analysis.confidence < s.minConfidence) return false;
            if (s.minSignal === 'STRONG_BUY' && analysis.signal !== 'STRONG_BUY') return false;
            if (s.maxRisk === 'LOW' && (analysis.riskLevel === 'HIGH' || analysis.riskLevel === 'EXTREME')) return false;
            // Strategy-specific entry criteria — each strategy has unique conditions
            if (!passesStrategyFilter(analysis, s)) return false;
            return true;
          });

        if (confirmingStrats.length >= 2) {
          const names = confirmingStrats.map(s => `${s.icon}${s.name}`).join(' + ');
          addActivity(state, {
            type: 'strategy',
            message: `🎯 Multi-Strategy Confirmed: ${analysis.token.symbol} — ${names} all in agreement. Knowledge multiplied.`,
          });
        }

        // Use highest baseFraction strategy for sizing
        const bestStrat = confirmingStrats.sort((a, b) => b.baseFraction - a.baseFraction)[0];
        const paperAutoSize = computeAutoSolSize(state, dexKey, bestStrat, 'paper');
        const liveAutoSize = computeAutoSolSize(state, dexKey, bestStrat, 'live');
        if (paperAutoSize > 0) {
          analysis.recommendedSolAmount = paperAutoSize;
        }

        const paperSizeSOL = paperAutoSize > 0 ? paperAutoSize : computeAutoSolSize(state, dexKey, undefined, 'paper');
        const sizeSOL = liveAutoSize > 0 ? liveAutoSize : computeAutoSolSize(state, dexKey, undefined, 'live');
        const topStrat = confirmingStrats[0] || SOL_STRATEGIES.find(s => s.id === state.activeStrategy) || SOL_STRATEGIES[0];
        const tokenPrice = parseFloat(analysis.token.priceUsd) || 0;
        const tokenMint = analysis.token.address;
        const now2 = new Date().toISOString();

        // Warn if signal fired but auto-trade is off
        if (!state.autoTradeEnabled && !state.liveTradeEnabled) {
          addActivity(state, {
            type: 'info',
            message: `⚠️ Signal: ${analysis.token.symbol} — auto-trade is OFF. Enable Paper Trade or Live Trade to execute buys.`,
          });
        }

        // Paper auto-trade
        if (state.autoTradeEnabled && paperSizeSOL > 0 && tokenPrice > 0) {
          const alreadyOpen = state.paperPositions.some(p => p.symbol === analysis.token.symbol && p.status === 'open');
          if (!alreadyOpen) {
            const pos: SolAutoPosition = {
              id: `paper_${Date.now()}_${analysis.token.symbol}`,
              symbol: analysis.token.symbol,
              mint: tokenMint,
              entryPrice: tokenPrice,
              currentPrice: tokenPrice,
              targetPct: state.autoTradeTP,
              slPct: state.autoTradeSL,
              size: paperSizeSOL,
              tokenAmount: 0,
              decimals: 9,
              strategyId: topStrat.id,
              mode: 'paper',
              openedAt: now2,
              status: 'open',
              peakPrice: tokenPrice,
              trailingActive: false,
              breakevenActive: false,
              trailActivationPct: state.autoTrailActivationPct,
              trailDistancePct: state.autoTrailDistancePct,
              entryVolume24h: analysis.token.volume24h || 0,
            };
            state.paperPositions.push(pos);
            const compoundNote = state.compoundMode ? ` [💹 Compounding ON — ${state.paperPortfolioValue.toFixed(3)} SOL pool]` : '';
            addActivity(state, {
              type: 'paper_buy',
              message: `📄 Paper BUY: ${analysis.token.symbol} — ${paperSizeSOL.toFixed(3)} SOL @ $${tokenPrice.toFixed(6)} [${topStrat.icon}${topStrat.name}] | TP: +${state.autoTradeTP}% | SL: -${state.autoTradeSL}% | Breakeven @+8% · Trail @+20% (vol-adjusted)${compoundNote}`,
            });
          }
        }

        // Live auto-trade: try server-side execution first, then queue for Phantom
        if (state.liveTradeEnabled && sizeSOL > 0 && tokenPrice > 0) {
          const alreadyOpen = state.livePositions.some(p => p.symbol === analysis.token.symbol && p.status === 'open');
          const alreadyQueued = state.pendingSignals.some(s => s.symbol === analysis.token.symbol);
          const SIGNAL_COOLDOWN_MS = 5 * 60 * 1000;
          const lastRejected = state.signalCooldowns.get(tokenMint);
          const onCooldown = lastRejected && (Date.now() - lastRejected) < SIGNAL_COOLDOWN_MS;
          if (!alreadyOpen && !alreadyQueued && !onCooldown) {
            const created = new Date();
            const expires = new Date(created.getTime() + 90000); // extended to 90s
            const sig: SolPendingSignal = {
              id: `live_${Date.now()}_${analysis.token.symbol}`,
              symbol: analysis.token.symbol,
              mint: tokenMint,
              signal: 'BUY',
              confidence: analysis.confidence,
              price: tokenPrice,
              sizeSOL,
              strategyId: topStrat.id,
              createdAt: created.toISOString(),
              expiresAt: expires.toISOString(),
            };

            // Attempt fully-automated server-side buy (requires stored private key)
            addActivity(state, {
              type: 'live_signal',
              message: `⚡ Live signal: ${analysis.token.symbol} — ${sizeSOL.toFixed(3)} SOL @ $${tokenPrice.toFixed(6)} [${topStrat.icon}${topStrat.name}] | Attempting server-side execution...`,
            });
            executeServerSideBuy(userId, sig, state).then(executed => {
              if (!executed) {
                // No server wallet configured — queue for Phantom approval
                state.pendingSignals.push(sig);
                addActivity(state, {
                  type: 'live_signal',
                  message: `⚡ Live signal queued: ${analysis.token.symbol} — ${sizeSOL.toFixed(3)} SOL @ $${tokenPrice.toFixed(6)} [${topStrat.icon}${topStrat.name}] | ⚠️ APPROVE IN PHANTOM (90s window)`,
                });
              }
            }).catch(() => {
              // Fallback to pending signal on any error
              state.pendingSignals.push(sig);
              addActivity(state, {
                type: 'live_signal',
                message: `⚡ Live signal queued: ${analysis.token.symbol} — ${sizeSOL.toFixed(3)} SOL @ $${tokenPrice.toFixed(6)} [${topStrat.icon}${topStrat.name}] | ⚠️ APPROVE IN PHANTOM (90s window)`,
              });
            });
          }
        }
      }
    }

    // Monitor paper and live positions for SL/TP
    monitorPaperPositions(state);
    await monitorLivePositions(userId, state);

    state.lastResults = scanResult;

    const label = triggerToken ? ` (trigger: ${triggerToken})` : '';
    const intervalSec = getAdaptiveScanInterval(state.config) / 1000;
    const buys = scanResult.filter(t => t.signal === 'STRONG_BUY' || t.signal === 'BUY').length;
    const shieldNote = shieldFilter ? ' 🛡️' : '';
    const activeStrats2 = state.activeStrategies.length > 0 ? state.activeStrategies : [state.activeStrategy];
    const stratNote = activeStrats2.length > 1
      ? ` [${activeStrats2.map(id => { const s = SOL_STRATEGIES.find(x => x.id === id); return s ? s.icon + s.name : id; }).join(' + ')}]`
      : (() => { const strategy = SOL_STRATEGIES.find(s => s.id === state.activeStrategy); return strategy ? ` [${strategy.icon}${strategy.name}]` : ''; })();
    addActivity(state, {
      type: 'info',
      message: `🔍 Knowledge dropped on ${scanResult.length} tokens${label}${shieldNote}${stratNote} — ${buys} buy signal${buys !== 1 ? 's' : ''} born. Next cipher in ${intervalSec}s`,
    });

    if (macro) {
      const btcStr = `BTC ${macro.btcChange >= 0 ? '+' : ''}${macro.btcChange.toFixed(1)}%`;
      const ethStr = `ETH ${macro.ethChange >= 0 ? '+' : ''}${macro.ethChange.toFixed(1)}%`;
      const solStr = `SOL ${macro.solChange >= 0 ? '+' : ''}${macro.solChange.toFixed(1)}%`;
      addActivity(state, {
        type: 'info',
        message: `📊 The science: ${btcStr} • ${ethStr} • ${solStr} — bias: ${macro.bias}`,
      });
    }

    if (state.currentPortfolioValue > 0) {
      for (const analysis of scanResult) {
        if ((analysis.signal === 'STRONG_BUY' || analysis.signal === 'BUY') && analysis.recommendedSolAmount && analysis.recommendedSolAmount > 0) {
          const dexKey = (analysis.token.dexId || '').toLowerCase().split('_')[0];
          const phase = state.weeklyGoal.phase;
          const mult = getPhaseMultiplier(phase, state.weeklyGoal.winStreak);
          addActivity(state, {
            type: 'kelly',
            message: `📐 Mathematics: ${analysis.token.symbol} on ${dexKey} → ${analysis.recommendedSolAmount.toFixed(3)} SOL (${mult}× ${phase.replace('_', ' ')} phase)`,
          });
        }
      }
    }

    // Run GPT-4o AI review after each scan (fire-and-forget, never blocks scan loop)
    const hasBuySignals = scanResult.some(t => t.signal === 'STRONG_BUY' || t.signal === 'BUY');
    if (hasBuySignals) {
      runSolAIReview(userId, state, scanResult, []).catch(() => {});
    }

  } catch (err) {
    addActivity(state, {
      type: 'info',
      message: `⚠️ Interruption in the cipher: ${err instanceof Error ? err.message : 'unknown'}`,
    });
  }

  // Periodic DB save — persist settings + stats after every scan
  saveEngineState(userId, state).catch(() => {});

  if (state.isRunning) {
    const nextMs = getAdaptiveScanInterval(state.config);
    state.scanTimer = setTimeout(() => runScan(userId, state), nextMs);
  }
}

export async function startSolEngine(userId: number, config: Partial<SolEngineConfig> = {}): Promise<void> {
  const existing = engineStates.get(userId);
  if (existing?.isRunning) stopSolEngine(userId);

  const fullConfig: SolEngineConfig = { ...DEFAULT_CONFIG, ...config };
  const state = createInitialState(fullConfig);

  // Restore from in-memory first (if restarting without page refresh)
  if (existing) {
    state.weeklyGoal = existing.weeklyGoal;
    state.activeStrategy = existing.activeStrategy;
    state.activeStrategies = existing.activeStrategies;
    state.signalWeights = existing.signalWeights;
    state.kellyStats = existing.kellyStats;
    state.sessionHighWatermark = existing.sessionHighWatermark;
    state.currentPortfolioValue = existing.currentPortfolioValue;
    state.shieldActive = existing.shieldActive;
    state.autoTradeEnabled = existing.autoTradeEnabled;
    state.liveTradeEnabled = existing.liveTradeEnabled;
    state.paperPositions = existing.paperPositions;
    state.closedPaperPositions = existing.closedPaperPositions;
    state.livePositions = existing.livePositions;
    state.closedLivePositions = existing.closedLivePositions;
    state.pendingExits = existing.pendingExits || [];
    state.autoTradeStats = existing.autoTradeStats;
    state.autoTradeTP = existing.autoTradeTP;
    state.autoTradeSL = existing.autoTradeSL;
  } else {
    // Cold start — load from database (also auto-fetches wallet balance)
    await loadEngineStateFromDb(userId, state);
  }

  // ── Final safety check: if portfolio value still 0, try wallet balance now ─
  // Covers the case where the engine was previously running but portfolio
  // value was never set and the wallet balance fetch above didn't fire.
  if (state.currentPortfolioValue <= 0) {
    try {
      const [settings] = await db.select({ serverWalletKey: solEngineSettings.serverWalletKey, liveTradeEnabled: solEngineSettings.liveTradeEnabled })
        .from(solEngineSettings).where(eq(solEngineSettings.userId, userId));
      if (settings?.serverWalletKey) {
        const privateKeyBase58 = decryptWalletKey(settings.serverWalletKey);
        const { Keypair, Connection } = await import('@solana/web3.js');
        const bs58 = (await import('bs58')).default;
        const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
        const rpcUrl = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=15319bf4-5b40-4958-ac8d-6313aa55eb92';
        const connection = new Connection(rpcUrl, { commitment: 'confirmed' });
        const lamports = await connection.getBalance(keypair.publicKey);
        const solBalance = lamports / 1e9;
        if (solBalance > 0) {
          state.currentPortfolioValue = solBalance;
          state.liveTradeEnabled = true;
          console.log(`[SolEngine] Portfolio auto-set from wallet on start: ${solBalance.toFixed(4)} SOL`);
        }
      }
    } catch { /* non-fatal */ }
  }

  state.isRunning = true;
  engineStates.set(userId, state);

  const intervalSec = getAdaptiveScanInterval(fullConfig) / 1000;
  const windowLabel = intervalSec === 30 ? 'peak hours (13–20 UTC)'
    : intervalSec === 60 ? 'standard hours'
    : 'overnight / weekend';
  const activeIds = state.activeStrategies.length > 0 ? state.activeStrategies : [state.activeStrategy];
  const stratLabel = activeIds.map(id => { const s = SOL_STRATEGIES.find(x => x.id === id); return s ? `${s.icon}${s.name}` : id; }).join(' + ');
  addActivity(state, {
    type: 'info',
    message: `⚡ Peace — Sol cipher activated. ${stratLabel} in rotation, dropping knowledge every ${intervalSec}s (${windowLabel})`,
  });

  runScan(userId, state);
}

export function stopSolEngine(userId: number): void {
  const state = engineStates.get(userId);
  if (!state) return;
  state.isRunning = false;
  if (state.scanTimer) { clearTimeout(state.scanTimer); state.scanTimer = null; }
  addActivity(state, { type: 'info', message: '🛑 Engine at rest — knowledge preserved, cipher closed' });
}

export function getSolEngineStatus(userId: number) {
  const state = engineStates.get(userId);
  if (!state) {
    return {
      running: false,
      activityFeed: [],
      signalWeights: Object.fromEntries(DEX_NAMES.map(d => [d, 1.0])),
      shieldActive: false,
      lastResults: [],
      kellyStats: {},
      lastMacro: null,
      weeklyGoal: { ...DEFAULT_WEEKLY_GOAL },
      activeStrategy: 'momentum_surfer',
      activeStrategies: ['momentum_surfer'],
    };
  }
  return {
    running: state.isRunning,
    config: state.config,
    activityFeed: state.activityFeed.slice(0, 20),
    signalWeights: state.signalWeights,
    kellyStats: state.kellyStats,
    shieldActive: state.shieldActive,
    sessionHighWatermark: state.sessionHighWatermark,
    currentPortfolioValue: state.currentPortfolioValue,
    lastScanAt: state.lastScanAt,
    lastResults: state.lastResults,
    lastMacro: state.lastMacro,
    weeklyGoal: state.weeklyGoal,
    activeStrategy: state.activeStrategy,
    activeStrategies: state.activeStrategies,
    lastAgentConsensus: state.lastAgentConsensus,
    paperTradeSize: state.paperTradeSize,
    compoundMode: state.compoundMode,
    compoundRate: state.compoundRate,
    paperBaseCapital: state.paperBaseCapital,
    paperPortfolioValue: state.paperPortfolioValue,
    paperPortfolioHistory: state.paperPortfolioHistory,
    autoTradeEnabled: state.autoTradeEnabled,
    liveTradeEnabled: state.liveTradeEnabled,
    autoTradeMode: state.liveTradeEnabled ? 'live' : state.autoTradeEnabled ? 'paper' : 'off',
    pendingSignalsCount: state.pendingSignals.filter(s => new Date(s.expiresAt).getTime() > Date.now()).length,
    pendingSignalSymbols: state.pendingSignals
      .filter(s => new Date(s.expiresAt).getTime() > Date.now())
      .map(s => s.symbol),
  };
}

export function getSolStrategies(): SolStrategy[] {
  return SOL_STRATEGIES;
}

export function setSolStrategies(userId: number, strategyIds: string[]): { success: boolean; strategies?: SolStrategy[] } {
  const valid = strategyIds.filter(id => SOL_STRATEGIES.some(s => s.id === id));
  if (valid.length === 0) return { success: false };

  let state = engineStates.get(userId);
  if (!state) {
    state = createInitialState({ ...DEFAULT_CONFIG });
    engineStates.set(userId, state);
  }
  state.activeStrategies = valid;
  state.activeStrategy = valid[0];

  const strats = valid.map(id => SOL_STRATEGIES.find(s => s.id === id)!).filter(Boolean);
  const label = strats.map(s => `${s.icon}${s.name}`).join(' + ');
  const modeNote = valid.length > 1 ? ` — Multi-Strategy Mode 🎯 active` : '';
  addActivity(state, {
    type: 'strategy',
    message: `🔄 Cipher updated — ${label}${modeNote}. Word is bond.`,
  });
  return { success: true, strategies: strats };
}

export function setSolStrategy(userId: number, strategyId: string): { success: boolean; strategy?: SolStrategy } {
  const strategy = SOL_STRATEGIES.find(s => s.id === strategyId);
  if (!strategy) return { success: false };

  let state = engineStates.get(userId);
  if (!state) {
    state = createInitialState({ ...DEFAULT_CONFIG });
    engineStates.set(userId, state);
  }
  state.activeStrategy = strategyId;
  state.activeStrategies = [strategyId];
  addActivity(state, {
    type: 'strategy',
    message: `${strategy.icon} Word is bond — ${strategy.name} now in rotation. Min ${strategy.minConfidence}% confidence, ${strategy.baseFraction * 100}% base size, ${strategy.holdTarget} hold`,
  });
  return { success: true, strategy };
}

export function setSolWeeklyGoal(userId: number, params: { targetSol?: number; targetPct?: number }): { success: boolean } {
  let state = engineStates.get(userId);
  if (!state) {
    state = createInitialState({ ...DEFAULT_CONFIG });
    engineStates.set(userId, state);
  }

  const portfolio = state.currentPortfolioValue;
  let targetSol = params.targetSol || 0;
  let targetPct = params.targetPct || 0;

  if (targetPct > 0 && portfolio > 0 && targetSol <= 0) {
    targetSol = portfolio * (targetPct / 100);
  } else if (targetSol > 0 && portfolio > 0 && targetPct <= 0) {
    targetPct = (targetSol / portfolio) * 100;
  }

  if (targetSol <= 0) return { success: false };

  state.weeklyGoal = {
    targetSol,
    targetPct,
    startPortfolio: portfolio,
    currentProfitSol: 0,
    phase: 'warming_up',
    weekStart: Date.now(),
    winStreak: 0,
    tradeHistory: [],
  };

  addActivity(state, {
    type: 'goal',
    message: `🎯 Target manifested — +${targetSol.toFixed(3)} SOL (${targetPct.toFixed(1)}%) this week. Warming up the cipher (0.8× size)`,
  });

  return { success: true };
}

export function resetSolWeeklyGoal(userId: number): { success: boolean } {
  const state = engineStates.get(userId);
  if (!state) return { success: false };
  state.weeklyGoal = { ...DEFAULT_WEEKLY_GOAL };
  addActivity(state, { type: 'goal', message: '🔄 Cipher cleared — knowledge reset, back to zero point' });
  return { success: true };
}

export function recordSolSignalResult(
  userId: number,
  params: { dex: string; outcome: 'WIN' | 'LOSS'; gainPct: number; symbol?: string; sol?: number }
): { success: boolean } {
  const state = engineStates.get(userId);
  if (!state) return { success: false };

  const dex = (params.dex || 'unknown').toLowerCase().replace(/[^a-z]/g, '') || 'unknown';
  if (!state.signalWeights[dex]) state.signalWeights[dex] = 1.0;
  if (!state.kellyStats[dex]) state.kellyStats[dex] = { wins: 0, losses: 0, totalGainPct: 0 };

  if (params.outcome === 'WIN') {
    state.signalWeights[dex] = Math.min(2.0, state.signalWeights[dex] + 0.05);
    state.kellyStats[dex].wins++;
    state.kellyStats[dex].totalGainPct += Math.abs(params.gainPct);
    state.weeklyGoal.winStreak = (state.weeklyGoal.winStreak || 0) + 1;
    addActivity(state, {
      type: 'signal',
      message: `✅ Born — ${params.symbol || dex} +${params.gainPct.toFixed(1)}% sealed in profit. ${dex} weight ${state.signalWeights[dex].toFixed(2)} | Streak: ${state.weeklyGoal.winStreak}`,
    });
  } else {
    state.signalWeights[dex] = Math.max(0.2, state.signalWeights[dex] - 0.08);
    state.kellyStats[dex].losses++;
    state.weeklyGoal.winStreak = 0;
    addActivity(state, {
      type: 'signal',
      message: `❌ Lesson built — ${params.symbol || dex}. The cipher teaches. ${dex} weight ${state.signalWeights[dex].toFixed(2)} | Streak reset`,
    });
  }

  if (state.weeklyGoal.phase !== 'idle') {
    const solAmount = params.sol || 0;
    // Use the actual gain/loss percentage — not a hardcoded -5% for losses
    const actualGainPct = params.gainPct;
    const gainSol = solAmount * (actualGainPct / 100);

    state.weeklyGoal.currentProfitSol += gainSol;
    state.weeklyGoal.tradeHistory.unshift({
      timestamp: new Date().toISOString(),
      symbol: params.symbol || dex,
      sol: solAmount,
      gainPct: actualGainPct,
      outcome: params.outcome,
      strategy: state.activeStrategy,
    });
    if (state.weeklyGoal.tradeHistory.length > 100) {
      state.weeklyGoal.tradeHistory = state.weeklyGoal.tradeHistory.slice(0, 100);
    }

    const prevPhase = state.weeklyGoal.phase;
    const newPhase = computeGoalPhase(state.weeklyGoal);
    if (newPhase !== prevPhase) {
      state.weeklyGoal.phase = newPhase;
      const mult = getPhaseMultiplier(newPhase, state.weeklyGoal.winStreak);
      const phaseNames: Record<string, string> = {
        warming_up: '🔵 WARMING UP', building: '🔵 BUILDING', accelerating: '🟡 ACCELERATING',
        cruising: '🟢 CRUISING', pushing: '🟠 PUSHING', target_reached: '🏆 TARGET REACHED',
      };
      addActivity(state, {
        type: 'goal',
        message: `${phaseNames[newPhase] || newPhase} — the God builds on. Sizing ${mult}× | Progress: ${((state.weeklyGoal.currentProfitSol / state.weeklyGoal.targetSol) * 100).toFixed(1)}%`,
      });
    }
  }

  return { success: true };
}

export function setAutoTrade(userId: number, opts: { paperEnabled?: boolean; liveEnabled?: boolean; tpPct?: number; slPct?: number; trailActivationPct?: number; trailDistancePct?: number; paperTradeSize?: number }): void {
  let state = engineStates.get(userId);
  if (!state) {
    state = createInitialState({ ...DEFAULT_CONFIG });
    engineStates.set(userId, state);
  }
  if (opts.paperEnabled !== undefined) {
    state.autoTradeEnabled = opts.paperEnabled;
    addActivity(state, {
      type: 'info',
      message: opts.paperEnabled
        ? '📄 Paper Auto-Trade ENABLED — the cipher will open virtual positions on every buy signal'
        : '📄 Paper Auto-Trade DISABLED',
    });
  }
  if (opts.liveEnabled !== undefined) {
    state.liveTradeEnabled = opts.liveEnabled;
    if (!opts.liveEnabled) state.pendingSignals = [];
    addActivity(state, {
      type: 'info',
      message: opts.liveEnabled
        ? '⚡ Live Auto-Trade ENABLED — buy signals will be queued for wallet execution'
        : '⚡ Live Auto-Trade DISABLED — pending signals cleared',
    });
  }
  if (opts.tpPct !== undefined && opts.tpPct > 0 && opts.tpPct <= 200) {
    state.autoTradeTP = opts.tpPct;
    addActivity(state, {
      type: 'info',
      message: `🎯 Take-profit updated — positions will close at +${opts.tpPct}%`,
    });
  }
  if (opts.slPct !== undefined && opts.slPct > 0 && opts.slPct <= 50) {
    state.autoTradeSL = opts.slPct;
    addActivity(state, {
      type: 'info',
      message: `🛡️ Stop-loss updated — positions protected at -${opts.slPct}%`,
    });
  }
  if (opts.trailActivationPct !== undefined && opts.trailActivationPct > 0 && opts.trailActivationPct <= 100) {
    state.autoTrailActivationPct = opts.trailActivationPct;
    addActivity(state, {
      type: 'info',
      message: `🔒 Trail activation updated — trailing stop kicks in at +${opts.trailActivationPct}%`,
    });
  }
  if (opts.trailDistancePct !== undefined && opts.trailDistancePct > 0 && opts.trailDistancePct <= 50) {
    state.autoTrailDistancePct = opts.trailDistancePct;
    addActivity(state, {
      type: 'info',
      message: `📏 Trail distance updated — will exit if price drops ${opts.trailDistancePct}% from peak`,
    });
  }
  if (opts.paperTradeSize !== undefined) {
    const sz = Math.max(0, opts.paperTradeSize);
    state.paperTradeSize = sz;
    addActivity(state, {
      type: 'info',
      message: sz > 0
        ? `📐 Paper trade size fixed at ${sz} SOL per position — overrides portfolio-fraction sizing`
        : `📐 Paper trade size set to auto (portfolio-fraction mode restored)`,
    });
  }
  saveEngineState(userId, state).catch(() => {});
}

export function setCompoundSettings(
  userId: number,
  opts: { compoundMode?: boolean; compoundRate?: number; paperBaseCapital?: number }
): void {
  let state = engineStates.get(userId);
  if (!state) {
    state = createInitialState({ ...DEFAULT_CONFIG });
    engineStates.set(userId, state);
  }

  if (opts.compoundMode !== undefined) {
    state.compoundMode = opts.compoundMode;
    addActivity(state, {
      type: 'info',
      message: opts.compoundMode
        ? `💹 Compound Mode ACTIVATED — profits will grow your paper pool (${state.compoundRate}% reinvestment rate)`
        : '💹 Compound Mode OFF — fixed position sizing restored',
    });
  }

  if (opts.compoundRate !== undefined) {
    const rate = Math.max(1, Math.min(100, opts.compoundRate));
    state.compoundRate = rate;
    addActivity(state, {
      type: 'info',
      message: `💹 Compound rate set to ${rate}% — ${rate === 100 ? 'all profits' : `${rate}% of profits`} reinvested into paper pool`,
    });
  }

  if (opts.paperBaseCapital !== undefined && opts.paperBaseCapital > 0) {
    state.paperBaseCapital = opts.paperBaseCapital;
    state.paperPortfolioValue = opts.paperBaseCapital;
    state.paperPortfolioHistory = [{ t: Date.now(), v: opts.paperBaseCapital }];
    addActivity(state, {
      type: 'info',
      message: `💼 Paper capital reset to ${opts.paperBaseCapital.toFixed(3)} SOL — compound growth clock starts now`,
    });
  }
}

export function getPendingSignals(userId: number): SolPendingSignal[] {
  const state = engineStates.get(userId);
  if (!state) return [];
  const now = Date.now();
  const valid = state.pendingSignals.filter(s => new Date(s.expiresAt).getTime() > now);
  state.pendingSignals = []; // clear after pickup
  return valid;
}

export function cancelSignal(userId: number, mint: string): void {
  const state = engineStates.get(userId);
  if (!state) return;
  // Remove any queued pending signal for this mint
  state.pendingSignals = state.pendingSignals.filter(s => s.mint !== mint);
  // Put it on a 5-minute cooldown so the engine doesn't re-queue it immediately
  state.signalCooldowns.set(mint, Date.now());
}

export function confirmLiveTrade(
  userId: number,
  signalId: string,
  txHash: string,
  tradeData?: { tokenAmount: number; decimals: number; entryPrice: number; mint: string }
): boolean {
  const state = engineStates.get(userId);
  if (!state) return false;

  const parts = signalId.split('_');
  const symbol = parts.slice(2).join('_');
  if (!symbol) return false;

  const pos: SolAutoPosition = {
    id: `live_pos_${Date.now()}_${symbol}`,
    symbol,
    mint: tradeData?.mint || '',
    entryPrice: tradeData?.entryPrice || 0,
    currentPrice: tradeData?.entryPrice || 0,
    targetPct: state.autoTradeTP,
    slPct: state.autoTradeSL,
    size: 0,
    tokenAmount: tradeData?.tokenAmount || 0,
    decimals: tradeData?.decimals || 9,
    strategyId: state.activeStrategy,
    mode: 'live',
    txHash,
    openedAt: new Date().toISOString(),
    status: 'open',
  };
  state.livePositions.push(pos);
  addActivity(state, {
    type: 'live_buy',
    message: `⚡ Live EXECUTED: ${symbol} — ${tradeData?.tokenAmount ? (tradeData.tokenAmount / Math.pow(10, tradeData.decimals || 9)).toFixed(4) + ' tokens @ $' + (tradeData.entryPrice || 0).toFixed(6) : ''} tx: ${txHash.slice(0, 16)}...`,
  });
  upsertPosition(userId, pos).catch(() => {});
  return true;
}

export function getPendingExits(userId: number): SolPendingExit[] {
  const state = engineStates.get(userId);
  if (!state) return [];
  const now = Date.now();
  const valid = state.pendingExits.filter(e => new Date(e.expiresAt).getTime() > now);
  state.pendingExits = [];
  return valid;
}

export function confirmLiveExit(userId: number, positionId: string, txHash: string): boolean {
  const state = engineStates.get(userId);
  if (!state) return false;

  const pos = state.livePositions.find(p => p.id === positionId && p.status === 'open');
  if (!pos) return false;

  const gainPct = pos.entryPrice > 0
    ? ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100
    : 0;

  pos.status = 'closed';
  pos.closedAt = new Date().toISOString();
  pos.closePnlPct = gainPct;

  state.closedLivePositions.unshift(pos);
  if (state.closedLivePositions.length > 50) state.closedLivePositions = state.closedLivePositions.slice(0, 50);

  // Update stats
  const isWin = gainPct >= 0;
  state.autoTradeStats.totalTrades++;
  state.autoTradeStats.totalPnlPct += gainPct;
  if (isWin) {
    state.autoTradeStats.wins++;
    if (gainPct > state.autoTradeStats.bestTradePct) state.autoTradeStats.bestTradePct = gainPct;
  } else {
    state.autoTradeStats.losses++;
    if (gainPct < state.autoTradeStats.worstTradePct) state.autoTradeStats.worstTradePct = gainPct;
  }

  // Remove from open
  state.livePositions = state.livePositions.filter(p => p.id !== positionId);

  addActivity(state, {
    type: 'live_sell',
    message: `✅ Live SOLD: ${pos.symbol} — P&L: ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}% [TX: ${txHash.slice(0, 12)}...]`,
  });

  upsertPosition(userId, pos).catch(() => {});
  saveEngineState(userId, state).catch(() => {});
  return true;
}

export function getAutoTradePositions(userId: number) {
  const state = engineStates.get(userId);
  if (!state) {
    return {
      autoTradeEnabled: false,
      liveTradeEnabled: false,
      paperPositions: [],
      closedPaperPositions: [],
      livePositions: [],
      closedLivePositions: [],
      autoTradeStats: { totalTrades: 0, wins: 0, losses: 0, totalPnlPct: 0, bestTradePct: 0, worstTradePct: 0 },
    };
  }
  return {
    autoTradeEnabled: state.autoTradeEnabled,
    liveTradeEnabled: state.liveTradeEnabled,
    autoTradeTP: state.autoTradeTP,
    autoTradeSL: state.autoTradeSL,
    autoTrailActivationPct: state.autoTrailActivationPct,
    autoTrailDistancePct: state.autoTrailDistancePct,
    paperPositions: state.paperPositions,
    closedPaperPositions: state.closedPaperPositions.slice(0, 20),
    livePositions: state.livePositions,
    closedLivePositions: state.closedLivePositions.slice(0, 20),
    autoTradeStats: state.autoTradeStats,
  };
}

export function updateSolPortfolioValue(userId: number, solValue: number): { shieldActive: boolean } {
  const state = engineStates.get(userId);
  if (!state) return { shieldActive: false };

  state.currentPortfolioValue = solValue;
  if (solValue > state.sessionHighWatermark) state.sessionHighWatermark = solValue;

  if (!state.config.shieldEnabled) return { shieldActive: false };

  const threshold = state.config.shieldThreshold / 100;
  const triggerLevel = state.sessionHighWatermark * (1 - threshold);
  const disengageLevel = state.sessionHighWatermark * 0.97;

  if (!state.shieldActive && state.sessionHighWatermark > 0 && solValue < triggerLevel) {
    state.shieldActive = true;
    const dropPct = ((1 - solValue / state.sessionHighWatermark) * 100).toFixed(1);
    addActivity(state, {
      type: 'shield',
      message: `🛡️ Shield of protection manifested — portfolio dropped ${dropPct}% from peak (${state.sessionHighWatermark.toFixed(3)} SOL). Righteously restricting to 85%+ confidence only`,
    });
  } else if (state.shieldActive && solValue >= disengageLevel) {
    state.shieldActive = false;
    addActivity(state, { type: 'shield', message: '✅ Shield lifted — peace restored. Full cipher resumed' });
  }

  return { shieldActive: state.shieldActive };
}

// ── Server wallet management ──────────────────────────────────────────────────
export async function saveServerWallet(userId: number, privateKeyBase58: string): Promise<{ success: boolean; walletAddress?: string; error?: string }> {
  try {
    // Validate the key first
    const { Keypair } = await import('@solana/web3.js');
    const bs58 = (await import('bs58')).default;
    const secretKey = bs58.decode(privateKeyBase58);
    const keypair = Keypair.fromSecretKey(secretKey);
    const walletAddress = keypair.publicKey.toBase58();

    const encrypted = encryptWalletKey(privateKeyBase58);
    await db.insert(solEngineSettings).values({
      userId,
      serverWalletKey: encrypted,
      activeStrategy: 'momentum_surfer',
      activeStrategies: [] as any,
      autoTradeEnabled: false,
      liveTradeEnabled: true,   // auto-enable live trade when wallet is connected
      autoTradeTP: 8,
      autoTradeSL: 4,
      weeklyGoal: {} as any,
      autoTradeStats: {} as any,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: solEngineSettings.userId,
      set: { serverWalletKey: encrypted, liveTradeEnabled: true, updatedAt: new Date() },
    });

    // ── Fetch live SOL balance and update in-memory engine state ─────────────
    // This ensures currentPortfolioValue is set immediately so trades can size
    // correctly without requiring a manual "Update Portfolio" step.
    try {
      const { Connection } = await import('@solana/web3.js');
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=15319bf4-5b40-4958-ac8d-6313aa55eb92';
      const connection = new Connection(rpcUrl, { commitment: 'confirmed' });
      const lamports = await connection.getBalance(keypair.publicKey);
      const solBalance = lamports / 1e9;
      if (solBalance > 0) {
        // Update existing engine state if running
        const existing = engineStates.get(userId);
        if (existing) {
          existing.currentPortfolioValue = solBalance;
          existing.liveTradeEnabled = true;
          addActivity(existing, {
            type: 'info',
            message: `🔑 Server wallet connected: ${walletAddress.slice(0,8)}... | Balance: ${solBalance.toFixed(4)} SOL | Live trading ENABLED — ready to execute`,
          });
        }
      }
    } catch { /* non-fatal — balance fetch fails gracefully */ }

    return { success: true, walletAddress };
  } catch (err: any) {
    return { success: false, error: err.message || 'Invalid private key' };
  }
}

export async function clearServerWallet(userId: number): Promise<void> {
  await db.update(solEngineSettings)
    .set({ serverWalletKey: null, updatedAt: new Date() })
    .where(eq(solEngineSettings.userId, userId));
}

export async function getServerWalletStatus(userId: number): Promise<{
  hasServerWallet: boolean;
  walletAddress?: string;
  balanceSol?: number;
  balanceLamports?: number;
}> {
  try {
    const [settings] = await db.select({ serverWalletKey: solEngineSettings.serverWalletKey })
      .from(solEngineSettings).where(eq(solEngineSettings.userId, userId));
    if (!settings?.serverWalletKey) return { hasServerWallet: false };

    const privateKeyBase58 = decryptWalletKey(settings.serverWalletKey);
    const { Keypair, Connection } = await import('@solana/web3.js');
    const bs58 = (await import('bs58')).default;
    const secretKey = bs58.decode(privateKeyBase58);
    const keypair = Keypair.fromSecretKey(secretKey);
    const walletAddress = keypair.publicKey.toBase58();

    // Fetch live on-chain SOL balance
    let balanceLamports = 0;
    let balanceSol = 0;
    try {
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=15319bf4-5b40-4958-ac8d-6313aa55eb92';
      const connection = new Connection(rpcUrl, { commitment: 'confirmed' });
      balanceLamports = await connection.getBalance(keypair.publicKey);
      balanceSol = Math.round((balanceLamports / 1e9) * 10000) / 10000;
    } catch {
      // RPC fetch failed — return wallet info without balance
    }

    return { hasServerWallet: true, walletAddress, balanceLamports, balanceSol };
  } catch {
    return { hasServerWallet: false };
  }
}
