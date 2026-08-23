// Full-token on-chain indexer via Alchemy. When ALCHEMY_API_KEY is set, this
// enumerates EVERY ERC-20 an address holds (not just the curated majors) across
// the main EVM chains, with token metadata + USD valuation. Read-only.
//
// Key-optional: onchain-balances.ts prefers this when the key exists and falls
// back to its public-RPC native+majors path otherwise. Free-tier Alchemy keys
// are generous; the key lives in server env so it can be set without a rebuild.

import { getAggregatedQuote } from './crypto-market-data';

// chain key -> Alchemy network subdomain
const ALCHEMY_NETS: Record<string, { net: string; name: string; nativeSymbol: string }> = {
  ethereum: { net: 'eth-mainnet', name: 'Ethereum', nativeSymbol: 'ETH' },
  base: { net: 'base-mainnet', name: 'Base', nativeSymbol: 'ETH' },
  arbitrum: { net: 'arb-mainnet', name: 'Arbitrum', nativeSymbol: 'ETH' },
  optimism: { net: 'opt-mainnet', name: 'Optimism', nativeSymbol: 'ETH' },
  polygon: { net: 'polygon-mainnet', name: 'Polygon', nativeSymbol: 'POL' },
};

export interface IndexedHolding { chain: string; symbol: string; amount: number; usdValue?: number | null; contract?: string; }
export interface IndexedSummary { address: string; holdings: IndexedHolding[]; totalUsd: number; chainsScanned: string[]; source: 'alchemy'; }

const _metaCache = new Map<string, { symbol: string; decimals: number } | null>();

async function rpc(url: string, method: string, params: any[]): Promise<any> {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Alchemy ${res.status}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error.message || 'alchemy error');
  return d.result;
}

function hexToNum(hex: string, decimals: number): number {
  if (!hex || hex === '0x') return 0;
  try { return Number(BigInt(hex)) / Math.pow(10, decimals); } catch { return 0; }
}

export function isIndexerAvailable(): boolean {
  return !!process.env.ALCHEMY_API_KEY;
}

export async function getIndexedBalances(address: string): Promise<IndexedSummary> {
  const key = process.env.ALCHEMY_API_KEY!;
  const holdings: IndexedHolding[] = [];
  const scanned: string[] = [];

  await Promise.all(Object.entries(ALCHEMY_NETS).map(async ([, cfg]) => {
    const url = `https://${cfg.net}.g.alchemy.com/v2/${key}`;
    try {
      // Native balance
      const nativeHex = await rpc(url, 'eth_getBalance', [address, 'latest']);
      const nativeAmt = hexToNum(nativeHex, 18);
      if (nativeAmt > 0) holdings.push({ chain: cfg.name, symbol: cfg.nativeSymbol, amount: nativeAmt });

      // All ERC-20 balances (non-zero)
      const balRes = await rpc(url, 'alchemy_getTokenBalances', [address, 'erc20']);
      const tokens: any[] = (balRes?.tokenBalances ?? []).filter((t: any) => t.tokenBalance && t.tokenBalance !== '0x' && !/^0x0+$/.test(t.tokenBalance));
      // Cap metadata lookups per chain to keep it responsive.
      for (const t of tokens.slice(0, 40)) {
        const contract = t.contractAddress;
        let meta = _metaCache.get(contract);
        if (meta === undefined) {
          try {
            const m = await rpc(url, 'alchemy_getTokenMetadata', [contract]);
            meta = (typeof m?.decimals === 'number' && m?.symbol) ? { symbol: m.symbol, decimals: m.decimals } : null;
          } catch { meta = null; }
          _metaCache.set(contract, meta);
        }
        if (!meta) continue;
        const amt = hexToNum(t.tokenBalance, meta.decimals);
        if (amt > 0) holdings.push({ chain: cfg.name, symbol: meta.symbol, amount: amt, contract });
      }
      scanned.push(cfg.name);
    } catch { /* chain failed this cycle — skip */ }
  }));

  // USD valuation (stables = $1; others via the public price layer, cached).
  let totalUsd = 0;
  const priceCache = new Map<string, number | null>();
  for (const h of holdings) {
    const s = h.symbol.toUpperCase();
    if (['USDC', 'USDT', 'DAI', 'GUSD', 'USDC.E', 'FRAX', 'TUSD'].includes(s)) { h.usdValue = h.amount; totalUsd += h.amount; continue; }
    const priceSym = s === 'WBTC' ? 'BTC' : s === 'WETH' ? 'ETH' : s === 'POL' ? 'MATIC' : s;
    if (!priceCache.has(priceSym)) {
      const q = await getAggregatedQuote(priceSym).catch(() => null);
      priceCache.set(priceSym, q?.best?.price ?? null);
    }
    const px = priceCache.get(priceSym) ?? null;
    h.usdValue = px != null ? Math.round(h.amount * px * 100) / 100 : null;
    if (h.usdValue) totalUsd += h.usdValue;
  }

  holdings.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
  return { address, holdings, totalUsd: Math.round(totalUsd * 100) / 100, chainsScanned: scanned, source: 'alchemy' };
}
