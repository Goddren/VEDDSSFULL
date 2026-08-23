// On-chain (DeFi / self-custody) balance reader — Phase 3. Given a wallet
// address, reads native + major ERC-20 balances across the main EVM chains via
// PUBLIC RPCs (no API key), and values them in USD via the Phase-1 price layer.
// Read-only: we only ever read balances from a user-supplied address.
//
// This is intentionally key-free (public RPC + a curated major-token list). A
// full "every token you hold" view needs an indexer (Alchemy/Moralis) — that's
// a later enhancement; this covers native coins + the majors on each chain.

interface ChainDef {
  key: string; name: string; rpc: string; nativeSymbol: string; explorer: string;
  tokens: { symbol: string; address: string; decimals: number }[];
}

// USDC/USDT/DAI/WBTC addresses are chain-specific; these are the canonical ones.
const CHAINS: ChainDef[] = [
  { key: 'ethereum', name: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com', nativeSymbol: 'ETH', explorer: 'https://etherscan.io',
    tokens: [
      { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
      { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
      { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
      { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
    ] },
  { key: 'base', name: 'Base', rpc: 'https://base-rpc.publicnode.com', nativeSymbol: 'ETH', explorer: 'https://basescan.org',
    tokens: [ { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 } ] },
  { key: 'arbitrum', name: 'Arbitrum', rpc: 'https://arbitrum-one-rpc.publicnode.com', nativeSymbol: 'ETH', explorer: 'https://arbiscan.io',
    tokens: [
      { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
      { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    ] },
  { key: 'optimism', name: 'Optimism', rpc: 'https://optimism-rpc.publicnode.com', nativeSymbol: 'ETH', explorer: 'https://optimistic.etherscan.io',
    tokens: [ { symbol: 'USDC', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 } ] },
  { key: 'polygon', name: 'Polygon', rpc: 'https://polygon-bor-rpc.publicnode.com', nativeSymbol: 'POL', explorer: 'https://polygonscan.com',
    tokens: [
      { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
      { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    ] },
];

export interface OnchainHolding { chain: string; symbol: string; amount: number; usdValue?: number | null; }
export interface OnchainSummary { address: string; holdings: OnchainHolding[]; totalUsd: number; chainsScanned: string[]; }

async function rpc(url: string, method: string, params: any[]): Promise<any> {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'VEDD/1.0' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error.message || 'rpc error');
  return d.result;
}

function hexToNum(hex: string, decimals: number): number {
  if (!hex || hex === '0x') return 0;
  try { return Number(BigInt(hex)) / Math.pow(10, decimals); } catch { return 0; }
}

export function isValidEvmAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

/** Read native + major-token balances for an address across the main EVM chains. */
export async function getOnchainBalances(address: string): Promise<OnchainSummary> {
  if (!isValidEvmAddress(address)) throw new Error('Invalid EVM address');
  const holdings: OnchainHolding[] = [];
  const scanned: string[] = [];

  await Promise.all(CHAINS.map(async (chain) => {
    try {
      // Native balance
      const nativeHex = await rpc(chain.rpc, 'eth_getBalance', [address, 'latest']);
      const nativeAmt = hexToNum(nativeHex, 18);
      if (nativeAmt > 0) holdings.push({ chain: chain.name, symbol: chain.nativeSymbol, amount: nativeAmt });
      // ERC-20 balances (balanceOf selector 0x70a08231)
      for (const t of chain.tokens) {
        try {
          const data = '0x70a08231' + address.slice(2).toLowerCase().padStart(64, '0');
          const raw = await rpc(chain.rpc, 'eth_call', [{ to: t.address, data }, 'latest']);
          const amt = hexToNum(raw, t.decimals);
          if (amt > 0) holdings.push({ chain: chain.name, symbol: t.symbol, amount: amt });
        } catch { /* skip this token */ }
      }
      scanned.push(chain.name);
    } catch { /* chain RPC failed this cycle — skip */ }
  }));

  // Value in USD via the Phase-1 price layer (stables = $1).
  let totalUsd = 0;
  try {
    const { getAggregatedQuote } = await import('./crypto-market-data');
    const priceCache = new Map<string, number | null>();
    for (const h of holdings) {
      if (['USDC', 'USDT', 'DAI', 'GUSD'].includes(h.symbol)) { h.usdValue = h.amount; totalUsd += h.amount; continue; }
      const priceSym = h.symbol === 'WBTC' ? 'BTC' : h.symbol === 'POL' ? 'MATIC' : h.symbol;
      if (!priceCache.has(priceSym)) {
        const q = await getAggregatedQuote(priceSym).catch(() => null);
        priceCache.set(priceSym, q?.best?.price ?? null);
      }
      const px = priceCache.get(priceSym) ?? null;
      h.usdValue = px != null ? Math.round(h.amount * px * 100) / 100 : null;
      if (h.usdValue) totalUsd += h.usdValue;
    }
  } catch { /* pricing best-effort */ }

  holdings.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
  return { address, holdings, totalUsd: Math.round(totalUsd * 100) / 100, chainsScanned: scanned };
}
