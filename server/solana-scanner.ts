import OpenAI from "openai";

export type DexSource = 'all' | 'raydium' | 'orca' | 'meteora' | 'pumpfun' | 'jupiter';

export interface SolanaToken {
  address: string;
  symbol: string;
  name: string;
  priceUsd: string;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  fdv: number;
  txns24h: { buys: number; sells: number };
  makers24h: number;
  pairAddress: string;
  dexId: string;
  createdAt?: string;
  dexSource?: DexSource;
  availableDexes?: string[];
  poolType?: string;
}

export interface TokenAnalysis {
  token: SolanaToken;
  signal: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  holdDuration: string;
  reasoning: string;
  sentimentScore: number;
  tokenomicsScore: number;
  whaleScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  entryPrice?: string;
  targetPrice?: string;
  stopLoss?: string;
  recommendedSolAmount?: number;
}

export interface CryptoMacroContext {
  btcChange: number;
  ethChange: number;
  solChange: number;
  riskScore: number;
  bias: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  implication: string;
}

export interface AnalyzeTokenOptions {
  signalWeights?: Record<string, number>;
  macro?: CryptoMacroContext;
  kellyStats?: Record<string, { wins: number; losses: number; totalGainPct: number }>;
  portfolioSol?: number;
  shieldActive?: boolean;
  minConfidence?: number;
  openai?: OpenAI;
}

export async function fetchTrendingSolanaTokens(): Promise<SolanaToken[]> {
  try {
    // Use boosted tokens endpoint and fetch full data for each
    const boostedResponse = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
    let tokenAddresses: string[] = [];
    
    if (boostedResponse.ok) {
      const boostedData = await boostedResponse.json();
      const solanaTokens = boostedData.filter((t: any) => t.chainId === 'solana');
      tokenAddresses = solanaTokens.slice(0, 20).map((t: any) => t.tokenAddress);
    }
    
    // If no boosted tokens, try search for popular tokens
    if (tokenAddresses.length === 0) {
      const searchResponse = await fetch('https://api.dexscreener.com/latest/dex/search?q=sol');
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        const solanaPairs = (searchData.pairs || []).filter((p: any) => p.chainId === 'solana');
        return solanaPairs.slice(0, 30).map((pair: any) => mapPairToToken(pair));
      }
      return [];
    }
    
    // Fetch full token data for boosted tokens (batch up to 30 addresses)
    const batchAddresses = tokenAddresses.slice(0, 30).join(',');
    const tokensResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${batchAddresses}`);
    
    if (!tokensResponse.ok) {
      console.error('Failed to fetch token data');
      return [];
    }
    
    const tokensData = await tokensResponse.json();
    const pairs = tokensData.pairs || [];
    
    // Filter to Solana and dedupe by base token address
    const seen = new Set<string>();
    const uniquePairs: any[] = [];
    for (const pair of pairs) {
      if (pair.chainId === 'solana' && !seen.has(pair.baseToken?.address)) {
        seen.add(pair.baseToken?.address);
        uniquePairs.push(pair);
      }
    }
    
    return uniquePairs.slice(0, 30).map((pair: any) => mapPairToToken(pair));
  } catch (error) {
    console.error('Error fetching trending tokens:', error);
    return [];
  }
}

function mapPairToToken(pair: any): SolanaToken {
  const dexId = (pair.dexId || 'unknown').toLowerCase();
  let dexSource: DexSource = 'jupiter';
  if (dexId.includes('raydium')) dexSource = 'raydium';
  else if (dexId.includes('orca') || dexId.includes('whirlpool')) dexSource = 'orca';
  else if (dexId.includes('meteora')) dexSource = 'meteora';
  else if (dexId.includes('pump') || dexId.includes('pumpfun')) dexSource = 'pumpfun';

  return {
    address: pair.baseToken?.address || '',
    symbol: pair.baseToken?.symbol || 'UNKNOWN',
    name: pair.baseToken?.name || 'Unknown Token',
    priceUsd: pair.priceUsd || '0',
    priceChange24h: pair.priceChange?.h24 || 0,
    volume24h: pair.volume?.h24 || 0,
    liquidity: pair.liquidity?.usd || 0,
    fdv: pair.fdv || 0,
    txns24h: {
      buys: pair.txns?.h24?.buys || 0,
      sells: pair.txns?.h24?.sells || 0
    },
    makers24h: pair.txns?.h24?.makers || 0,
    pairAddress: pair.pairAddress || '',
    dexId: pair.dexId || 'unknown',
    createdAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : undefined,
    dexSource,
    availableDexes: [pair.dexId || 'unknown'],
    poolType: pair.labels?.join(', ') || undefined,
  };
}

async function fetchRaydiumTokens(): Promise<SolanaToken[]> {
  try {
    const response = await fetch('https://api.dexscreener.com/latest/dex/search?q=raydium%20sol');
    if (!response.ok) return [];
    const data = await response.json();
    const pairs = (data.pairs || [])
      .filter((p: any) => p.chainId === 'solana' && p.dexId?.toLowerCase().includes('raydium'));
    return pairs.slice(0, 20).map((pair: any) => {
      const token = mapPairToToken(pair);
      token.dexSource = 'raydium';
      return token;
    });
  } catch (error) {
    console.error('Error fetching Raydium tokens:', error);
    return [];
  }
}

async function fetchOrcaTokens(): Promise<SolanaToken[]> {
  try {
    const response = await fetch('https://api.dexscreener.com/latest/dex/search?q=orca%20sol');
    if (!response.ok) return [];
    const data = await response.json();
    const pairs = (data.pairs || [])
      .filter((p: any) => p.chainId === 'solana' && p.dexId?.toLowerCase().includes('orca'));
    return pairs.slice(0, 20).map((pair: any) => {
      const token = mapPairToToken(pair);
      token.dexSource = 'orca';
      token.poolType = 'Whirlpool';
      return token;
    });
  } catch (error) {
    console.error('Error fetching Orca tokens:', error);
    return [];
  }
}

async function fetchMeteoraTokens(): Promise<SolanaToken[]> {
  try {
    const response = await fetch('https://api.dexscreener.com/latest/dex/search?q=meteora%20sol');
    if (!response.ok) return [];
    const data = await response.json();
    const pairs = (data.pairs || [])
      .filter((p: any) => p.chainId === 'solana' && p.dexId?.toLowerCase().includes('meteora'));
    return pairs.slice(0, 20).map((pair: any) => {
      const token = mapPairToToken(pair);
      token.dexSource = 'meteora';
      token.poolType = 'DLMM';
      return token;
    });
  } catch (error) {
    console.error('Error fetching Meteora tokens:', error);
    return [];
  }
}

async function fetchPumpFunTokens(): Promise<SolanaToken[]> {
  try {
    const response = await fetch('https://api.dexscreener.com/latest/dex/search?q=pump.fun');
    if (!response.ok) return [];
    const data = await response.json();
    const pairs = (data.pairs || [])
      .filter((p: any) => p.chainId === 'solana' && (
        p.dexId?.toLowerCase().includes('pump') ||
        p.url?.includes('pump.fun') ||
        p.baseToken?.name?.toLowerCase().includes('pump')
      ));
    return pairs.slice(0, 20).map((pair: any) => {
      const token = mapPairToToken(pair);
      token.dexSource = 'pumpfun';
      token.poolType = 'Bonding Curve';
      return token;
    });
  } catch (error) {
    console.error('Error fetching Pump.fun tokens:', error);
    return [];
  }
}

function mergeAndDedupeTokens(tokenArrays: SolanaToken[][]): SolanaToken[] {
  const tokenMap = new Map<string, SolanaToken>();

  for (const tokens of tokenArrays) {
    for (const token of tokens) {
      if (!token.address) continue;
      const existing = tokenMap.get(token.address);
      if (existing) {
        const existingDexes = new Set(existing.availableDexes || []);
        (token.availableDexes || []).forEach(d => existingDexes.add(d));
        existing.availableDexes = Array.from(existingDexes);
        if (token.liquidity > existing.liquidity) {
          existing.priceUsd = token.priceUsd;
          existing.liquidity = token.liquidity;
          existing.volume24h = Math.max(existing.volume24h, token.volume24h);
          existing.dexId = token.dexId;
          existing.dexSource = token.dexSource;
          existing.pairAddress = token.pairAddress;
        }
      } else {
        tokenMap.set(token.address, { ...token });
      }
    }
  }

  return Array.from(tokenMap.values());
}

export async function fetchMultiDexTokens(dexFilter: DexSource = 'all'): Promise<SolanaToken[]> {
  try {
    if (dexFilter === 'raydium') return await fetchRaydiumTokens();
    if (dexFilter === 'orca') return await fetchOrcaTokens();
    if (dexFilter === 'meteora') return await fetchMeteoraTokens();
    if (dexFilter === 'pumpfun') return await fetchPumpFunTokens();
    if (dexFilter === 'jupiter') return await fetchTrendingSolanaTokens();

    const [trending, raydium, orca, meteora, pumpfun] = await Promise.all([
      fetchTrendingSolanaTokens(),
      fetchRaydiumTokens(),
      fetchOrcaTokens(),
      fetchMeteoraTokens(),
      fetchPumpFunTokens(),
    ]);

    return mergeAndDedupeTokens([trending, raydium, orca, meteora, pumpfun]);
  } catch (error) {
    console.error('Error fetching multi-DEX tokens:', error);
    return fetchTrendingSolanaTokens();
  }
}

export async function fetchNewSolanaPairs(): Promise<SolanaToken[]> {
  try {
    // Search for new/trending tokens
    const response = await fetch('https://api.dexscreener.com/latest/dex/search?q=pump');
    if (!response.ok) return [];
    
    const data = await response.json();
    const pairs = (data.pairs || []).filter((p: any) => p.chainId === 'solana');
    
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    return pairs
      .filter((pair: any) => pair.pairCreatedAt && pair.pairCreatedAt > oneDayAgo)
      .slice(0, 20)
      .map((pair: any) => mapPairToToken(pair));
  } catch (error) {
    console.error('Error fetching new pairs:', error);
    return [];
  }
}

export async function searchSolanaToken(query: string): Promise<SolanaToken[]> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    
    const data = await response.json();
    const pairs = (data.pairs || []).filter((p: any) => p.chainId === 'solana');
    
    return pairs.slice(0, 10).map((pair: any) => mapPairToToken(pair));
  } catch (error) {
    console.error('Error searching token:', error);
    return [];
  }
}

function calculateTokenomicsScore(token: SolanaToken): number {
  let score = 50;
  
  if (token.liquidity > 100000) score += 15;
  else if (token.liquidity > 50000) score += 10;
  else if (token.liquidity > 10000) score += 5;
  else if (token.liquidity < 5000) score -= 15;
  
  if (token.fdv > 0 && token.liquidity > 0) {
    const liquidityRatio = token.liquidity / token.fdv;
    if (liquidityRatio > 0.1) score += 10;
    else if (liquidityRatio > 0.05) score += 5;
    else if (liquidityRatio < 0.01) score -= 10;
  }
  
  if (token.volume24h > 500000) score += 10;
  else if (token.volume24h > 100000) score += 5;
  else if (token.volume24h < 10000) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

function calculateWhaleScore(token: SolanaToken): number {
  let score = 50;
  
  const totalTxns = token.txns24h.buys + token.txns24h.sells;
  if (totalTxns === 0) return 30;
  
  const buyRatio = token.txns24h.buys / totalTxns;
  if (buyRatio > 0.7) score += 20;
  else if (buyRatio > 0.6) score += 10;
  else if (buyRatio < 0.4) score -= 15;
  else if (buyRatio < 0.3) score -= 25;
  
  if (token.volume24h > 0 && totalTxns > 0) {
    const avgTxSize = token.volume24h / totalTxns;
    if (avgTxSize > 5000) score += 15;
    else if (avgTxSize > 1000) score += 5;
  }
  
  if (token.makers24h > 500) score += 10;
  else if (token.makers24h > 100) score += 5;
  else if (token.makers24h < 20) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

function calculateSentimentScore(token: SolanaToken): number {
  let score = 50;
  
  if (token.priceChange24h > 50) score += 20;
  else if (token.priceChange24h > 20) score += 15;
  else if (token.priceChange24h > 10) score += 10;
  else if (token.priceChange24h > 0) score += 5;
  else if (token.priceChange24h < -30) score -= 20;
  else if (token.priceChange24h < -15) score -= 10;
  else if (token.priceChange24h < 0) score -= 5;
  
  const buyRatio = token.txns24h.buys / Math.max(1, token.txns24h.buys + token.txns24h.sells);
  if (buyRatio > 0.65) score += 15;
  else if (buyRatio > 0.55) score += 5;
  else if (buyRatio < 0.35) score -= 15;
  
  return Math.max(0, Math.min(100, score));
}

function determineSignal(sentimentScore: number, tokenomicsScore: number, whaleScore: number): { signal: TokenAnalysis['signal']; confidence: number } {
  const avgScore = (sentimentScore + tokenomicsScore + whaleScore) / 3;
  
  if (avgScore >= 75 && Math.min(sentimentScore, tokenomicsScore, whaleScore) >= 60) {
    return { signal: 'STRONG_BUY', confidence: Math.round(avgScore) };
  } else if (avgScore >= 60 && Math.min(sentimentScore, tokenomicsScore, whaleScore) >= 45) {
    return { signal: 'BUY', confidence: Math.round(avgScore) };
  } else if (avgScore >= 45) {
    return { signal: 'HOLD', confidence: Math.round(avgScore) };
  } else if (avgScore >= 30) {
    return { signal: 'SELL', confidence: Math.round(100 - avgScore) };
  } else {
    return { signal: 'STRONG_SELL', confidence: Math.round(100 - avgScore) };
  }
}

function determineRiskLevel(token: SolanaToken, tokenomicsScore: number): TokenAnalysis['riskLevel'] {
  if (token.liquidity < 10000 || tokenomicsScore < 30) return 'EXTREME';
  if (token.liquidity < 50000 || tokenomicsScore < 45) return 'HIGH';
  if (token.liquidity < 200000 || tokenomicsScore < 60) return 'MEDIUM';
  return 'LOW';
}

function estimateHoldDuration(signal: TokenAnalysis['signal'], riskLevel: TokenAnalysis['riskLevel']): string {
  if (signal === 'STRONG_SELL' || signal === 'SELL') return 'Exit immediately';
  
  if (riskLevel === 'EXTREME') return '1-4 hours (scalp only)';
  if (riskLevel === 'HIGH') return '4-24 hours';
  if (riskLevel === 'MEDIUM') return '1-3 days';
  return '3-7 days';
}

export async function fetchCryptoMacroContext(): Promise<CryptoMacroContext> {
  const queries = [
    { key: 'btc', q: 'WBTC' },
    { key: 'eth', q: 'WETH' },
    { key: 'sol', q: 'SOL' },
  ];
  const changes: Record<string, number> = { btc: 0, eth: 0, sol: 0 };

  await Promise.all(queries.map(async ({ key, q }) => {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${q}`);
      if (!res.ok) return;
      const data = await res.json();
      const pairs = (data.pairs || []).filter((p: any) => p.chainId === 'solana');
      if (pairs.length > 0) {
        changes[key] = parseFloat(pairs[0].priceChange?.h24 || '0') || 0;
      }
    } catch { /* skip */ }
  }));

  const score = (changes.btc > 1 ? 1 : changes.btc < -1 ? -1 : 0)
    + (changes.eth > 1 ? 1 : changes.eth < -1 ? -1 : 0)
    + (changes.sol > 1 ? 1 : changes.sol < -1 ? -1 : 0);

  const bias: CryptoMacroContext['bias'] = score >= 2 ? 'RISK_ON' : score <= -2 ? 'RISK_OFF' : 'NEUTRAL';
  const implication = bias === 'RISK_ON'
    ? 'Risk-on environment — favour momentum tokens with high buy pressure.'
    : bias === 'RISK_OFF'
    ? 'Risk-off environment — be selective, prefer LOW risk tokens with 80%+ confidence.'
    : 'Mixed signals — evaluate each token on its own merits.';

  return { btcChange: changes.btc, ethChange: changes.eth, solChange: changes.sol, riskScore: score, bias, implication };
}

function buildDexWeightsBlock(signalWeights: Record<string, number>): string {
  const labels = Object.entries(signalWeights).map(([dex, w]) => {
    const label = w >= 1.5 ? '🔥HOT' : w >= 1.2 ? '✅WARM' : w <= 0.3 ? '❌COLD' : w <= 0.6 ? '⚠️COOL' : '—';
    return `${dex}=${w.toFixed(2)}${label}`;
  });
  return labels.join(', ');
}

function calculateSolKellySize(wins: number, losses: number, totalGainPct: number, portfolioSol: number): number {
  const total = wins + losses;
  if (total < 3 || portfolioSol <= 0) return 0;
  const winRate = wins / total;
  const avgGain = wins > 0 ? totalGainPct / wins / 100 : 0.5;
  const kelly = winRate - (1 - winRate) / Math.max(avgGain, 0.01);
  const fractional = Math.max(0.01, Math.min(0.10, kelly * 0.25));
  return Math.round(portfolioSol * fractional * 1000) / 1000;
}

export async function analyzeToken(token: SolanaToken, options: AnalyzeTokenOptions = {}): Promise<TokenAnalysis> {
  const { signalWeights, macro, kellyStats, portfolioSol = 0, openai: openaiOverride } = options;

  const sentimentScore = calculateSentimentScore(token);
  const tokenomicsScore = calculateTokenomicsScore(token);
  const whaleScore = calculateWhaleScore(token);
  
  let { signal, confidence } = determineSignal(sentimentScore, tokenomicsScore, whaleScore);

  // Apply DEX weight multiplier if provided
  if (signalWeights) {
    const dexKey = (token.dexId || '').toLowerCase().split('_')[0];
    const weight = signalWeights[dexKey] || 1.0;
    confidence = Math.round(Math.min(98, Math.max(10, confidence * weight)));
  }

  // Apply macro bias adjustment
  if (macro) {
    if (macro.bias === 'RISK_ON' && (signal === 'STRONG_BUY' || signal === 'BUY')) {
      confidence = Math.min(98, confidence + 5);
    } else if (macro.bias === 'RISK_OFF' && (signal === 'STRONG_BUY' || signal === 'BUY')) {
      if (confidence < 80) {
        signal = 'HOLD';
      }
    }
  }

  const riskLevel = determineRiskLevel(token, tokenomicsScore);
  const holdDuration = estimateHoldDuration(signal, riskLevel);
  
  let reasoning = '';
  try {
    const macroBlock = macro
      ? `\nCRYPTO MACRO CONTEXT: BTC=${macro.btcChange >= 0 ? '+' : ''}${macro.btcChange.toFixed(1)}%, ETH=${macro.ethChange >= 0 ? '+' : ''}${macro.ethChange.toFixed(1)}%, SOL=${macro.solChange >= 0 ? '+' : ''}${macro.solChange.toFixed(1)}% → Risk Score: ${macro.riskScore}/3 → ${macro.bias}. ${macro.implication} Tokens aligned with ${macro.bias === 'RISK_ON' ? 'bullish' : 'cautious'} macro get ${macro.bias === 'RISK_ON' ? '+5% confidence bonus' : '−5% confidence penalty'}.`
      : '';

    const weightsBlock = signalWeights
      ? `\nDEX PERFORMANCE WEIGHTS: ${buildDexWeightsBlock(signalWeights)}. Prioritise 🔥HOT DEX signals. Be extra sceptical of ❌COLD DEX signals.`
      : '';

    const prompt = `You are VEDD AI analyzing a Solana token for trading opportunities.${macroBlock}${weightsBlock}

TOKEN DATA:
Name: ${token.name} (${token.symbol})
DEX: ${token.dexId || 'unknown'}
Price: $${token.priceUsd}
24h Change: ${token.priceChange24h.toFixed(2)}%
24h Volume: $${token.volume24h.toLocaleString()}
Liquidity: $${token.liquidity.toLocaleString()}
FDV: $${token.fdv.toLocaleString()}
24h Buys: ${token.txns24h.buys} | Sells: ${token.txns24h.sells}
Unique Traders: ${token.makers24h}

SCORES: Sentiment ${sentimentScore}/100, Tokenomics ${tokenomicsScore}/100, Whale Activity ${whaleScore}/100
SIGNAL: ${signal} (${confidence}% confidence) | Risk: ${riskLevel}

Provide a sharp 2-3 sentence analysis. Reference macro context and DEX performance if relevant. Be direct and actionable.`;

    const openaiClient = openaiOverride || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 180,
      temperature: 0.7
    });
    
    reasoning = response.choices[0]?.message?.content || '';
  } catch (error) {
    reasoning = `${signal} signal: sentiment ${sentimentScore}/100, tokenomics ${tokenomicsScore}/100, whale activity ${whaleScore}/100. Risk: ${riskLevel}.`;
  }
  
  const price = parseFloat(token.priceUsd) || 0;
  let targetPrice: string | undefined;
  let stopLoss: string | undefined;
  
  if (signal === 'STRONG_BUY' || signal === 'BUY') {
    targetPrice = (price * (signal === 'STRONG_BUY' ? 1.5 : 1.25)).toFixed(8);
    stopLoss = (price * 0.85).toFixed(8);
  }

  // Kelly position sizing
  let recommendedSolAmount: number | undefined;
  if (kellyStats && portfolioSol > 0 && (signal === 'STRONG_BUY' || signal === 'BUY')) {
    const dexKey = (token.dexId || '').toLowerCase().split('_')[0];
    const stats = kellyStats[dexKey];
    if (stats) {
      const solAmt = calculateSolKellySize(stats.wins, stats.losses, stats.totalGainPct, portfolioSol);
      if (solAmt > 0) recommendedSolAmount = solAmt;
    }
  }
  
  return {
    token,
    signal,
    confidence,
    holdDuration,
    reasoning,
    sentimentScore,
    tokenomicsScore,
    whaleScore,
    riskLevel,
    entryPrice: token.priceUsd,
    targetPrice,
    stopLoss,
    recommendedSolAmount,
  };
}

export async function scanAndAnalyzeTokens(limit: number = 10, dexFilter: DexSource = 'all', options: AnalyzeTokenOptions = {}): Promise<TokenAnalysis[]> {
  const tokens = await fetchMultiDexTokens(dexFilter === 'all' ? 'all' : dexFilter);
  
  let filteredTokens = tokens.filter(t => t.liquidity > 5000 && t.volume24h > 1000);

  const analyses = await Promise.all(
    filteredTokens.slice(0, limit * 2).map(token => analyzeToken(token, options))
  );

  let results = analyses;

  // Shield filter: only LOW risk + 85%+ confidence when shield active
  if (options.shieldActive) {
    results = results.filter(a => a.riskLevel === 'LOW' && a.confidence >= 85);
  }

  // Min confidence filter
  if (options.minConfidence && options.minConfidence > 0) {
    results = results.filter(a => a.confidence >= options.minConfidence!);
  }
  
  return results.slice(0, limit).sort((a, b) => {
    const signalOrder: Record<string, number> = { 'STRONG_BUY': 0, 'BUY': 1, 'HOLD': 2, 'SELL': 3, 'STRONG_SELL': 4 };
    if (signalOrder[a.signal] !== signalOrder[b.signal]) {
      return signalOrder[a.signal] - signalOrder[b.signal];
    }
    return b.confidence - a.confidence;
  });
}
