import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Wallet, RefreshCw, ExternalLink, Copy, Check, ChevronRight } from "lucide-react";

// ── Polygon constants ────────────────────────────────────────────────────────
const POLYGON_CHAIN_ID   = "0x89";
const POLYGON_RPC        = "https://polygon-rpc.com";
const USDC_NATIVE        = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // native USDC on Polygon
const USDC_BRIDGED       = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e bridged
const POLYGON_CHAIN_PARAMS = {
  chainId: POLYGON_CHAIN_ID,
  chainName: "Polygon Mainnet",
  nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  rpcUrls: ["https://polygon-rpc.com"],
  blockExplorerUrls: ["https://polygonscan.com"],
};

// ── Polygon RPC helpers (no library needed) ──────────────────────────────────
async function polygonRpc(method: string, params: any[]): Promise<any> {
  const res = await fetch(POLYGON_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function getMaticBalance(address: string): Promise<number> {
  const hex = await polygonRpc("eth_getBalance", [address, "latest"]);
  return parseInt(hex, 16) / 1e18;
}

async function getUsdcBalance(address: string, contract: string): Promise<number> {
  const paddedAddr = address.slice(2).toLowerCase().padStart(64, "0");
  const data = `0x70a08231${paddedAddr}`;
  const hex = await polygonRpc("eth_call", [{ to: contract, data }, "latest"]);
  return parseInt(hex, 16) / 1e6;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function PolymarketWalletPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Wallet state
  const [connectedAddress, setConnectedAddress] = useState<string>("");
  const [manualAddress, setManualAddress]         = useState<string>("");
  const [showManual, setShowManual]               = useState(false);
  const [onPolygon, setOnPolygon]                 = useState(false);
  const [walletType, setWalletType]               = useState<"metamask"|"coinbase"|"manual"|null>(null);
  const [balances, setBalances]                   = useState<{ matic: number; usdc: number; usdce: number } | null>(null);
  const [loadingBalances, setLoadingBalances]     = useState(false);
  const [copied, setCopied]                       = useState(false);
  const [connecting, setConnecting]               = useState(false);
  const [error, setError]                         = useState<string>("");

  // ── Server queries ───────────────────────────────────────────────────────
  const { data: savedWallet } = useQuery<{ address: string; savedAt: string } | null>({
    queryKey: ["/api/user/polymarket-wallet"],
    enabled: !!user,
  });

  const { data: polymarketData } = useQuery<any>({
    queryKey: ["/api/polymarket/btc"],
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
    enabled: !!user,
  });

  const { data: compositeEdge } = useQuery<any>({
    queryKey: ["/api/composite-edge/BTCUSD"],
    refetchInterval: 15000,
    enabled: !!user,
  });

  const { data: engineStatus } = useQuery<any>({
    queryKey: ["/api/vedd-live-engine/status"],
    refetchInterval: 10000,
    enabled: !!user,
  });

  const saveWalletMutation = useMutation({
    mutationFn: async (address: string) =>
      (await apiRequest("POST", "/api/user/polymarket-wallet", { address })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/polymarket-wallet"] });
      toast({ title: "Wallet saved", description: "Your Polygon wallet address is linked to your account." });
    },
  });

  // ── Load saved wallet on mount ───────────────────────────────────────────
  useEffect(() => {
    if (savedWallet?.address) {
      setConnectedAddress(savedWallet.address);
      setWalletType("manual");
    }
  }, [savedWallet]);

  // ── Fetch balances whenever address changes ──────────────────────────────
  const fetchBalances = useCallback(async (addr: string) => {
    if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) return;
    setLoadingBalances(true);
    try {
      const [matic, usdc, usdce] = await Promise.all([
        getMaticBalance(addr),
        getUsdcBalance(addr, USDC_NATIVE),
        getUsdcBalance(addr, USDC_BRIDGED),
      ]);
      setBalances({ matic, usdc, usdce });
    } catch (e) {
      console.error("Balance fetch error:", e);
    } finally {
      setLoadingBalances(false);
    }
  }, []);

  useEffect(() => {
    if (connectedAddress) fetchBalances(connectedAddress);
  }, [connectedAddress, fetchBalances]);

  // ── Wallet connection ────────────────────────────────────────────────────
  const connectEthWallet = async (preferCoinbase = false) => {
    setError("");
    setConnecting(true);
    try {
      const eth = (window as any).ethereum;
      if (!eth) {
        setShowManual(true);
        setError("No wallet extension detected. Enter your address manually, or install MetaMask.");
        return;
      }

      // Pick provider if multiple wallets installed
      let provider = eth;
      if (eth.providers?.length) {
        provider = eth.providers.find((p: any) =>
          preferCoinbase ? p.isCoinbaseWallet : p.isMetaMask
        ) ?? eth;
      }

      const accounts: string[] = await provider.request({ method: "eth_requestAccounts" });
      const address = accounts[0];

      // Switch / add Polygon
      const chainId: string = await provider.request({ method: "eth_chainId" });
      if (chainId !== POLYGON_CHAIN_ID) {
        try {
          await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: POLYGON_CHAIN_ID }] });
        } catch (switchErr: any) {
          if (switchErr.code === 4902) {
            await provider.request({ method: "wallet_addEthereumChain", params: [POLYGON_CHAIN_PARAMS] });
          }
        }
      }

      setOnPolygon(true);
      setWalletType(preferCoinbase ? "coinbase" : "metamask");
      setConnectedAddress(address);
      saveWalletMutation.mutate(address);
    } catch (err: any) {
      setError(err.message ?? "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const connectManual = () => {
    const addr = manualAddress.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setError("Invalid Ethereum/Polygon address format (must start with 0x)");
      return;
    }
    setConnectedAddress(addr);
    setWalletType("manual");
    setOnPolygon(true); // trust user knows their network
    saveWalletMutation.mutate(addr);
    setShowManual(false);
    setError("");
  };

  const disconnect = () => {
    setConnectedAddress("");
    setBalances(null);
    setWalletType(null);
    setOnPolygon(false);
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(connectedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const fmt = (n: number, dec = 2) => n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const shortAddr = (a: string) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "";

  const alignment = compositeEdge?.alignment ?? "neutral";
  const edgeScore = compositeEdge?.compositeEdgeScore ?? 0;
  const compositeActive = engineStatus?.config?.enableCompositeAutonomous;

  const alignColor = (a: string) =>
    a === "strong_agree"    ? "text-emerald-400" :
    a === "agree"           ? "text-green-400"   :
    a === "strong_disagree" ? "text-red-400"     :
    a === "disagree"        ? "text-orange-400"  : "text-gray-500";

  const alignLabel = (a: string) =>
    a === "strong_agree"    ? "🔥 Strongly Agree" :
    a === "agree"           ? "✅ Agree"          :
    a === "strong_disagree" ? "🚫 Strong Conflict" :
    a === "disagree"        ? "⚠️ Conflict"       : "— Neutral";

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      {/* Header */}
      <div className="bg-gray-900/80 border-b border-gray-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-10 backdrop-blur">
        <Link href="/weekly-strategy">
          <button className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </button>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-lg">🔗</span>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">Polymarket Wallet</h1>
            <p className="text-[10px] text-gray-500 mt-0.5">Polygon · EVM · Composite Auto-Trade</p>
          </div>
        </div>
        {connectedAddress && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400">{shortAddr(connectedAddress)}</span>
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">

        {/* ── Wallet Connection Card ─────────────────────────────────────── */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-bold text-white">Connect Wallet</h2>
            <Badge className="text-[9px] bg-purple-500/20 text-purple-300 border-purple-500/30">Polygon Network</Badge>
          </div>

          {!connectedAddress ? (
            <>
              <p className="text-[10px] text-gray-400 mb-3">
                Connect your EVM wallet on Polygon to view balances. Polymarket requires <span className="text-emerald-400 font-semibold">USDC on Polygon</span> — not BTC, not POLY token. MATIC is only for gas (~$0.01).{' '}
                Get USDC:{' '}
                <a href="https://polymarket.com/deposit" target="_blank" rel="noopener noreferrer" className="text-purple-300 underline underline-offset-2">Polymarket Deposit</a>
                {' '}(card/Apple Pay) or{' '}
                <a href="https://wallet.polygon.technology/polygon/bridge" target="_blank" rel="noopener noreferrer" className="text-purple-300 underline underline-offset-2">Polygon Bridge</a>
                {' '}(from Ethereum).
              </p>

              {/* Wallet buttons */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  onClick={() => connectEthWallet(false)}
                  disabled={connecting}
                  className="flex items-center gap-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg px-3 py-2.5 transition-colors disabled:opacity-50"
                >
                  <span className="text-lg">🦊</span>
                  <div className="text-left">
                    <p className="text-[11px] font-semibold text-orange-300">MetaMask</p>
                    <p className="text-[9px] text-gray-500">Browser extension</p>
                  </div>
                </button>
                <button
                  onClick={() => connectEthWallet(true)}
                  disabled={connecting}
                  className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg px-3 py-2.5 transition-colors disabled:opacity-50"
                >
                  <span className="text-lg">🔵</span>
                  <div className="text-left">
                    <p className="text-[11px] font-semibold text-blue-300">Coinbase Wallet</p>
                    <p className="text-[9px] text-gray-500">Browser extension</p>
                  </div>
                </button>
              </div>

              <button
                onClick={() => setShowManual(v => !v)}
                className="w-full text-[10px] text-gray-500 hover:text-gray-300 transition-colors py-1.5 border border-dashed border-gray-700 rounded-lg"
              >
                {showManual ? "▲ Hide" : "▼ Enter address manually"}
              </button>

              {showManual && (
                <div className="mt-2 flex gap-2">
                  <Input
                    value={manualAddress}
                    onChange={e => setManualAddress(e.target.value)}
                    placeholder="0x..."
                    className="h-8 bg-gray-800 border-gray-700 text-white text-xs font-mono"
                  />
                  <Button onClick={connectManual} size="sm" className="h-8 text-xs bg-purple-600 hover:bg-purple-700 shrink-0">
                    Link
                  </Button>
                </div>
              )}

              {error && <p className="text-[10px] text-red-400 mt-2">{error}</p>}
            </>
          ) : (
            <>
              {/* Connected state */}
              <div className="bg-black/30 rounded-lg p-3 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-xs font-mono text-white">{shortAddr(connectedAddress)}</span>
                    <button onClick={copyAddress} className="text-gray-500 hover:text-white transition-colors">
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] bg-purple-600/30 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded">
                      {walletType === "metamask" ? "🦊 MetaMask" : walletType === "coinbase" ? "🔵 Coinbase" : "📋 Manual"}
                    </span>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded">Polygon</span>
                  </div>
                </div>

                {/* Balances */}
                {loadingBalances ? (
                  <p className="text-[10px] text-gray-500 text-center py-2">Loading balances...</p>
                ) : balances ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-[9px] text-gray-500">MATIC</p>
                      <p className="text-xs font-bold text-white">{fmt(balances.matic, 3)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-gray-500">USDC</p>
                      <p className="text-xs font-bold text-emerald-300">${fmt(balances.usdc)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-gray-500">USDC.e</p>
                      <p className="text-xs font-bold text-cyan-300">${fmt(balances.usdce)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-600 text-center py-1">Fetching balances...</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => fetchBalances(connectedAddress)}
                  className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-white transition-colors px-2 py-1.5 bg-gray-800/60 rounded-lg"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
                <a
                  href={`https://polygonscan.com/address/${connectedAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-purple-300 transition-colors px-2 py-1.5 bg-gray-800/60 rounded-lg"
                >
                  <ExternalLink className="w-3 h-3" /> PolygonScan
                </a>
                <button
                  onClick={disconnect}
                  className="ml-auto text-[10px] text-red-400/70 hover:text-red-400 transition-colors px-2 py-1.5"
                >
                  Disconnect
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Polymarket Markets ─────────────────────────────────────────── */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🏦</span>
              <h2 className="text-sm font-bold text-white">Polymarket — BTC Markets</h2>
            </div>
            <span className="text-[9px] text-gray-500">
              {polymarketData?.fromCache ? "cached" : "live"} · 5 min cache
            </span>
          </div>

          {polymarketData ? (
            <>
              {/* Overall sentiment */}
              <div className={`rounded-lg px-3 py-2 mb-3 flex items-center justify-between ${
                (polymarketData.overallBullishScore ?? 50) >= 60 ? "bg-emerald-500/10 border border-emerald-500/20" :
                (polymarketData.overallBullishScore ?? 50) <= 40 ? "bg-red-500/10 border border-red-500/20" :
                "bg-gray-800/40 border border-gray-700/40"
              }`}>
                <div>
                  <p className="text-[9px] text-gray-400 uppercase">Overall Sentiment</p>
                  <p className={`text-sm font-bold ${
                    (polymarketData.overallBullishScore ?? 50) >= 60 ? "text-emerald-400" :
                    (polymarketData.overallBullishScore ?? 50) <= 40 ? "text-red-400" : "text-gray-300"
                  }`}>{polymarketData.sentimentLabel ?? "Neutral"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-gray-400">Bullish score</p>
                  <p className="text-xl font-black text-white">{polymarketData.overallBullishScore ?? 50}%</p>
                </div>
              </div>

              {/* Market list */}
              <div className="space-y-2">
                {(polymarketData.markets ?? []).slice(0, 5).map((m: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 bg-black/20 rounded-lg px-2.5 py-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      m.direction === "bullish" && m.yesProbability >= 55 ? "bg-emerald-400" :
                      m.direction === "bearish" && m.yesProbability >= 55 ? "bg-red-400" : "bg-gray-500"
                    }`} />
                    <p className="text-[10px] text-gray-300 flex-1 leading-tight">{m.question}</p>
                    <div className="text-right shrink-0">
                      <span className={`text-xs font-bold ${m.yesProbability >= 60 ? "text-emerald-400" : m.yesProbability <= 40 ? "text-red-400" : "text-gray-400"}`}>
                        {m.yesProbability}%
                      </span>
                      <p className="text-[9px] text-gray-600">YES</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-gray-500 text-sm">Loading Polymarket data...</p>
              <p className="text-gray-600 text-[10px] mt-1">Fetching BTC prediction markets</p>
            </div>
          )}
        </div>

        {/* ── Composite Edge Signal ─────────────────────────────────────── */}
        <div className={`bg-gray-900/60 border rounded-xl p-4 ${
          alignment === "strong_agree" ? "border-emerald-700/40" :
          alignment === "agree"        ? "border-green-700/30"   :
          alignment === "strong_disagree" ? "border-red-700/40"  :
          "border-gray-800"
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">⚡</span>
              <h2 className="text-sm font-bold text-white">Composite Edge Signal</h2>
              <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full">Markov × Polymarket</span>
            </div>
            {compositeEdge && (
              <span className={`text-xs font-bold ${compositeEdge.confidenceAdjustment > 0 ? "text-emerald-400" : compositeEdge.confidenceAdjustment < 0 ? "text-red-400" : "text-gray-500"}`}>
                {compositeEdge.confidenceAdjustment > 0 ? "+" : ""}{compositeEdge.confidenceAdjustment}% adj
              </span>
            )}
          </div>

          {compositeEdge ? (
            <>
              {/* Score bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400">BTC Composite Edge</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    edgeScore >= 60 ? "bg-emerald-500/20 text-emerald-400" :
                    edgeScore <= 40 ? "bg-red-500/20 text-red-400" : "bg-gray-700 text-gray-400"
                  }`}>{edgeScore}/100</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-gray-600 z-10" />
                  <div
                    className={`h-full rounded-full transition-all ${edgeScore >= 60 ? "bg-emerald-500" : edgeScore <= 40 ? "bg-red-500" : "bg-gray-500"}`}
                    style={{ width: `${edgeScore}%` }}
                  />
                </div>
              </div>

              {/* Markov + Polymarket grid */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-purple-500/8 border border-purple-500/20 rounded-lg p-2.5">
                  <p className="text-[9px] text-gray-500 mb-1">🎲 Markov Chain</p>
                  <p className="text-xs font-bold text-purple-300">
                    {(compositeEdge.markov?.currentState ?? "—").replace(/_/g, " ")}
                  </p>
                  <p className="text-[9px] text-gray-500 mt-0.5">
                    Bull {compositeEdge.markov?.bullP ?? 0}% · Bear {compositeEdge.markov?.bearP ?? 0}%
                  </p>
                </div>
                <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-lg p-2.5">
                  <p className="text-[9px] text-gray-500 mb-1">🏦 Polymarket</p>
                  {compositeEdge.polymarket?.available ? (
                    <>
                      <p className="text-xs font-bold text-yellow-300">{compositeEdge.polymarket.sentimentLabel}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">{compositeEdge.polymarket.overallBullishScore}% bullish</p>
                    </>
                  ) : (
                    <p className="text-[10px] text-gray-600">No data</p>
                  )}
                </div>
              </div>

              {/* Alignment */}
              <div className={`rounded-lg px-3 py-2 flex items-center gap-2 ${
                alignment === "strong_agree" ? "bg-emerald-500/10 border border-emerald-500/20" :
                alignment === "agree"        ? "bg-green-500/10 border border-green-500/20"    :
                alignment === "strong_disagree" ? "bg-red-500/10 border border-red-500/20"     :
                alignment === "disagree"     ? "bg-orange-500/10 border border-orange-500/20"  :
                "bg-gray-800/40 border border-gray-700/40"
              }`}>
                <span className={`text-sm font-bold ${alignColor(alignment)}`}>{alignLabel(alignment)}</span>
                <span className="ml-auto text-[10px] text-gray-400">
                  BTC {compositeEdge.direction ?? "—"}
                </span>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-sm text-center py-4">Loading composite signal...</p>
          )}
        </div>

        {/* ── Composite Auto-Trade Status ───────────────────────────────── */}
        <div className={`bg-gray-900/60 border rounded-xl p-4 ${compositeActive ? "border-purple-500/40" : "border-gray-800"}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🤖</span>
              <h2 className="text-sm font-bold text-white">Composite Auto-Trade</h2>
              {compositeActive ? (
                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded animate-pulse">● ACTIVE</span>
              ) : (
                <span className="text-[9px] bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded">INACTIVE</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-black/30 rounded-lg p-2.5 text-center">
              <p className="text-[9px] text-gray-500">Min Edge</p>
              <p className="text-sm font-bold text-purple-300">{engineStatus?.config?.compositeMinEdgeScore ?? 72}</p>
            </div>
            <div className="bg-black/30 rounded-lg p-2.5 text-center">
              <p className="text-[9px] text-gray-500">Fire Condition</p>
              <p className={`text-xs font-bold ${alignment === "strong_agree" && edgeScore >= (engineStatus?.config?.compositeMinEdgeScore ?? 72) ? "text-emerald-400" : "text-gray-500"}`}>
                {alignment === "strong_agree" && edgeScore >= (engineStatus?.config?.compositeMinEdgeScore ?? 72) ? "READY" : "WAITING"}
              </p>
            </div>
          </div>

          <p className="text-[10px] text-gray-500 mb-3">
            Fires crypto trades autonomously when Markov + Polymarket strongly agree and the composite edge score meets your threshold. Runs on a 5-min cooldown per pair.
          </p>

          <Link href="/weekly-strategy">
            <button className="w-full flex items-center justify-center gap-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg py-2.5 transition-colors">
              Configure in Weekly Strategy
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </Link>
        </div>

        {/* ── Link to Polymarket Engine ─────────────────────────────────── */}
        <a href="/polymarket-engine" className="block bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl p-4 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏦</span>
              <div>
                <p className="text-sm font-bold text-purple-300">Polymarket Engine</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Open YES/NO positions on Polymarket — separate from forex engine</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-purple-400" />
          </div>
        </a>

        {/* ── Getting Started ───────────────────────────────────────────── */}
        <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4">
          <h3 className="text-xs font-bold text-gray-300 mb-2">📋 How it works</h3>
          <div className="space-y-2">
            {[
              { n: 1, title: "Connect your Polygon wallet", desc: "MetaMask or Coinbase Wallet. You need USDC (on Polygon) to place positions — not BTC, not POLY token. MATIC is only needed for gas fees (usually <$0.01)." },
              { n: 2, title: "Polymarket data is read automatically", desc: "The engine reads BTC prediction market probabilities every 5 minutes." },
              { n: 3, title: "Markov + Polymarket are fused", desc: "When both strongly agree on direction, the composite edge score rises." },
              { n: 4, title: "Auto-Trade fires on Polymarket", desc: "When the edge score meets your threshold, the Polymarket Engine opens a YES/NO position directly on Polymarket — not on TradeLocker. Use the Polymarket Engine page to run and monitor this." },
            ].map(s => (
              <div key={s.n} className="flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
                <div>
                  <p className="text-[11px] font-semibold text-gray-300">{s.title}</p>
                  <p className="text-[10px] text-gray-500">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
