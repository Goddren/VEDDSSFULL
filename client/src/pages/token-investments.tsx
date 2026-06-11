import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  TrendingUp, Coins, Lock, Unlock, Clock, RefreshCw, DollarSign,
  ChevronRight, AlertTriangle, CheckCircle2, BarChart3, Zap,
  Shield, Star, Trophy, Info,
} from "lucide-react";
import { TokenomicsBanner } from '@/components/vedd-rewards/tokenomics-banner';

interface InvestmentPool {
  id: number;
  name: string;
  slug: string;
  poolType: string;
  description: string;
  apyRate: number;
  lockPeriodDays: number;
  minInvestment: number;
  maxInvestment: number | null;
  riskLevel: string;
  totalPoolSize: number;
  totalInvested: number;
  isActive: boolean;
  isPaused: boolean;
}

interface TokenInvestment {
  id: number;
  poolId: number;
  amountInvested: number;
  currentValue: number;
  yieldEarned: number;
  status: string;
  startDate: string;
  maturityDate: string | null;
  withdrawnAt: string | null;
}

interface InvestmentSummary {
  totalInvested: number;
  totalCurrentValue: number;
  totalYieldEarned: number;
  roiPercent: number;
  activeCount: number;
}

interface VeddPrice {
  priceUsd: number;
  priceChange24h?: number;
  marketCap?: number;
  volume24h?: number;
  source: string;
}

const RISK_COLORS = {
  low: "text-green-400 bg-green-500/15 border-green-500/30",
  medium: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  high: "text-red-400 bg-red-500/15 border-red-500/30",
};

const POOL_ICONS: Record<string, any> = {
  stake: Lock,
  community: Coins,
  growth: TrendingUp,
  elite: Trophy,
};

const POOL_GRADIENTS: Record<string, string> = {
  stake: "from-blue-500/10 to-cyan-500/10 border-blue-500/20",
  community: "from-green-500/10 to-emerald-500/10 border-green-500/20",
  growth: "from-amber-500/10 to-orange-500/10 border-amber-500/20",
  elite: "from-purple-500/10 to-pink-500/10 border-purple-500/20",
};

function formatVedd(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toFixed(2);
}

function veddToUsd(vedd: number, priceUsd: number): string {
  const usd = vedd * priceUsd;
  if (usd < 0.01) return `$${(usd).toFixed(6)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export default function TokenInvestmentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedPool, setSelectedPool] = useState<InvestmentPool | null>(null);
  const [investAmount, setInvestAmount] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: pools = [], isLoading: poolsLoading } = useQuery<InvestmentPool[]>({
    queryKey: ["/api/investments/pools"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/investments/pools");
      return res.json();
    },
  });

  const { data: positions = [], isLoading: posLoading } = useQuery<TokenInvestment[]>({
    queryKey: ["/api/investments/my-positions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/investments/my-positions");
      return res.json();
    },
  });

  const { data: summary } = useQuery<InvestmentSummary>({
    queryKey: ["/api/investments/my-summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/investments/my-summary");
      return res.json();
    },
  });

  const { data: walletData } = useQuery<{ veddBalance: number; pendingBalance: number }>({
    queryKey: ["/api/wallet/balance"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/wallet/balance");
      return res.json();
    },
  });

  const { data: veddPrice } = useQuery<VeddPrice>({
    queryKey: ["/api/vedd/live-price"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vedd/live-price");
      return res.json();
    },
    staleTime: 60000, // 1 minute
  });

  const investMutation = useMutation({
    mutationFn: async ({ poolId, amount }: { poolId: number; amount: number }) => {
      const res = await apiRequest("POST", "/api/investments/invest", { poolId, amount });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investments/my-positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investments/my-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investments/pools"] });
      setDialogOpen(false);
      setInvestAmount("");
      toast({ title: "Vault lock created!", description: `Your VEDD tokens are now locked and earning platform rewards.` });
    },
    onError: (err: any) => toast({ title: "Investment failed", description: err.message, variant: "destructive" }),
  });

  const withdrawMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/investments/${id}/withdraw`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/investments/my-positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investments/my-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/balance"] });
      toast({
        title: "Withdrawal successful!",
        description: `${formatVedd(data.returned)} VEDD returned to your wallet (${formatVedd(data.yieldEarned)} rewards earned).`,
      });
    },
    onError: (err: any) => toast({ title: "Withdrawal failed", description: err.message, variant: "destructive" }),
  });

  const priceUsd = veddPrice?.priceUsd || 0.0000036;
  const walletBalance = walletData?.veddBalance || 0;
  const amount = parseFloat(investAmount) || 0;
  const estimatedYield = selectedPool && amount > 0
    ? amount * selectedPool.apyRate * (selectedPool.lockPeriodDays / 365 || 1)
    : 0;

  const activePositions = positions.filter(p => p.status === 'active' || p.status === 'matured');
  const historyPositions = positions.filter(p => p.status === 'withdrawn' || p.status === 'cancelled');

  const poolMap = Object.fromEntries(pools.map(p => [p.id, p]));

  return (
    <div className="container max-w-5xl mx-auto px-4 py-6 pb-24">
      {/* ── SEC / Legal Compliance Notice ── */}
      <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-red-300 font-bold text-sm mb-1">NOT AN INVESTMENT — Platform Rewards Only</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            VEDD tokens are <strong className="text-white">platform utility reward tokens</strong>, not securities or investment products.
            Locking VEDD earns community pool reward bonuses distributed by the platform — this is <strong className="text-white">not</strong> a
            return on investment. VEDD tokens are not registered with the U.S. Securities and Exchange Commission (SEC) or
            any securities regulator. Nothing on this page constitutes investment advice. Consult a licensed financial advisor before
            making any financial decisions.
          </p>
        </div>
      </div>
      <TokenomicsBanner
        highlight="Lock VEDD tokens to earn platform reward bonuses from the community reward pool."
        rewards={[
          { label: 'Reward Rate', amount: '12–25%', color: 'text-emerald-400' },
          { label: 'Total supply', amount: '1B VEDD' },
          { label: 'Rewards pool', amount: '50M VEDD', color: 'text-purple-400' },
        ]}
      />
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Coins className="w-6 h-6 text-amber-400" />
              <h1 className="text-2xl font-bold">VEDD Reward Vaults</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Lock your VEDD tokens to earn platform reward bonuses from the community reward pool.
            </p>
          </div>
          {veddPrice && (
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted-foreground">VEDD / USD</p>
              <p className="text-lg font-bold text-amber-400">${priceUsd.toFixed(8)}</p>
              {veddPrice.priceChange24h !== undefined && (
                <p className={`text-xs ${(veddPrice.priceChange24h ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(veddPrice.priceChange24h ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(veddPrice.priceChange24h ?? 0).toFixed(2)}% (24h)
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Locked", value: formatVedd(summary?.totalInvested || 0), sub: veddToUsd(summary?.totalInvested || 0, priceUsd), icon: Coins, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Current Balance", value: formatVedd(summary?.totalCurrentValue || 0), sub: veddToUsd(summary?.totalCurrentValue || 0, priceUsd), icon: BarChart3, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "Rewards Earned", value: formatVedd(summary?.totalYieldEarned || 0), sub: veddToUsd(summary?.totalYieldEarned || 0, priceUsd), icon: TrendingUp, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "Reward Rate", value: `${(summary?.roiPercent || 0).toFixed(2)}%`, sub: `${summary?.activeCount || 0} active`, icon: Zap, color: "text-purple-400", bg: "bg-purple-500/10" },
        ].map((card) => (
          <Card key={card.label} className="border-border/50">
            <CardContent className="p-4">
              <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${card.bg} mb-2`}>
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.sub}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Wallet Balance Bar */}
      <div className="mb-6 p-3 bg-muted/40 rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-amber-400" />
          <span className="text-sm">Available to lock:</span>
          <span className="font-bold text-amber-400">{formatVedd(walletBalance)} VEDD</span>
          <span className="text-xs text-muted-foreground">≈ {veddToUsd(walletBalance, priceUsd)}</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => window.location.href = '/my-wallet'}>
          Add VEDD <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>

      <Tabs defaultValue="invest">
        <TabsList className="mb-4">
          <TabsTrigger value="invest">Reward Vaults</TabsTrigger>
          <TabsTrigger value="portfolio">My Locks {activePositions.length > 0 && `(${activePositions.length})`}</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ── REWARD VAULTS ── */}
        <TabsContent value="invest">
          {poolsLoading ? (
            <div className="grid md:grid-cols-2 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="h-64 bg-muted animate-pulse rounded-xl" />)}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {pools.map((pool) => {
                const PoolIcon = POOL_ICONS[pool.slug] || Coins;
                const gradient = POOL_GRADIENTS[pool.slug] || "from-gray-500/10 to-gray-500/10 border-gray-500/20";
                const fillPct = pool.totalPoolSize > 0 ? Math.min(100, (pool.totalInvested / pool.totalPoolSize) * 100) : 0;
                return (
                  <Card key={pool.id} className={`border bg-gradient-to-br ${gradient} transition-all hover:scale-[1.01]`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-xl bg-background/60 flex items-center justify-center">
                            <PoolIcon className="w-5 h-5 text-amber-400" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{pool.name}</CardTitle>
                            <Badge className={`text-[10px] px-1.5 py-0 border ${RISK_COLORS[pool.riskLevel as keyof typeof RISK_COLORS] || RISK_COLORS.low}`}>
                              {pool.riskLevel} risk
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-bold text-amber-400">{(pool.apyRate * 100).toFixed(0)}%</p>
                          <p className="text-xs text-muted-foreground">Reward Rate</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">{pool.description}</p>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-background/40 rounded-lg p-2">
                          <p className="text-muted-foreground mb-0.5">Lock Period</p>
                          <p className="font-semibold flex items-center gap-1">
                            {pool.lockPeriodDays === 0 ? (
                              <><Unlock className="w-3 h-3 text-green-400" /> Flexible</>
                            ) : (
                              <><Lock className="w-3 h-3 text-amber-400" /> {pool.lockPeriodDays} days</>
                            )}
                          </p>
                        </div>
                        <div className="bg-background/40 rounded-lg p-2">
                          <p className="text-muted-foreground mb-0.5">Min Lock Amount</p>
                          <p className="font-semibold">{formatVedd(pool.minInvestment)} VEDD</p>
                        </div>
                      </div>

                      {/* Pool fill progress */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Pool capacity</span>
                          <span>{formatVedd(pool.totalInvested)} / {formatVedd(pool.totalPoolSize)} VEDD</span>
                        </div>
                        <Progress value={fillPct} className="h-1.5" />
                      </div>

                      <Button
                        className="w-full gap-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                        size="sm"
                        disabled={pool.isPaused || !pool.isActive || walletBalance < pool.minInvestment}
                        onClick={() => { setSelectedPool(pool); setInvestAmount(""); setDialogOpen(true); }}
                      >
                        {pool.isPaused ? "Paused" : walletBalance < pool.minInvestment ? `Need ${formatVedd(pool.minInvestment)} VEDD` : "Lock for Rewards"}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Disclaimer */}
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-amber-400">Important Notice:</span>{" "}
              VEDD tokens are <strong>platform utility and reward tokens</strong> — they are NOT securities, NOT investment contracts, and NOT registered with the SEC or any regulatory authority. Locking VEDD earns platform-distributed reward bonuses from the community pool. Reward rates are targets set by the platform and are not guaranteed returns. Token market value is determined by open market activity and may fluctuate significantly. <strong>This is not investment advice. Do not lock more VEDD than you can afford to lose entirely.</strong> VEDD tokens have no guaranteed monetary value.
            </p>
          </div>
        </TabsContent>

        {/* ── MY PORTFOLIO ── */}
        <TabsContent value="portfolio">
          {posLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}</div>
          ) : activePositions.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="py-12 text-center">
                <Coins className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm font-semibold mb-1">No active reward locks yet</p>
                <p className="text-xs text-muted-foreground mb-4">Choose a vault and start earning platform reward bonuses on your locked VEDD</p>
                <Button size="sm" onClick={() => document.querySelector('[value="invest"]')?.dispatchEvent(new MouseEvent('click'))}>
                  Browse Pools <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activePositions.map((pos) => {
                const pool = poolMap[pos.poolId];
                const PoolIcon = pool ? (POOL_ICONS[pool.slug] || Coins) : Coins;
                const profitPct = pos.amountInvested > 0 ? ((pos.currentValue - pos.amountInvested) / pos.amountInvested) * 100 : 0;
                const isMatured = pos.status === 'matured';
                const isFlexible = pool?.lockPeriodDays === 0;
                const daysLeft = pos.maturityDate ? daysUntil(pos.maturityDate) : 0;
                const canWithdraw = isMatured || isFlexible;

                return (
                  <Card key={pos.id} className={`border-border/50 ${isMatured ? 'border-green-500/40 bg-green-500/5' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                            <PoolIcon className="w-4 h-4 text-amber-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{pool?.name || `Pool #${pos.poolId}`}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {isMatured ? (
                                <Badge className="text-[10px] px-1.5 bg-green-500/20 text-green-400 border-green-500/30">
                                  <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Ready to Withdraw
                                </Badge>
                              ) : isFlexible ? (
                                <Badge className="text-[10px] px-1.5 bg-blue-500/20 text-blue-400 border-blue-500/30">
                                  <Unlock className="w-2.5 h-2.5 mr-1" /> Flexible
                                </Badge>
                              ) : (
                                <Badge className="text-[10px] px-1.5 bg-muted text-muted-foreground">
                                  <Clock className="w-2.5 h-2.5 mr-1" /> {daysLeft}d remaining
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-amber-400">{formatVedd(pos.currentValue)}</p>
                          <p className="text-xs text-muted-foreground">{veddToUsd(pos.currentValue, priceUsd)}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                        <div className="bg-muted/40 rounded p-2 text-center">
                          <p className="text-muted-foreground">Invested</p>
                          <p className="font-semibold">{formatVedd(pos.amountInvested)}</p>
                          <p className="text-muted-foreground">{veddToUsd(pos.amountInvested, priceUsd)}</p>
                        </div>
                        <div className="bg-muted/40 rounded p-2 text-center">
                          <p className="text-muted-foreground">Rewards Earned</p>
                          <p className="font-semibold text-green-400">+{formatVedd(pos.yieldEarned)}</p>
                          <p className="text-muted-foreground">{veddToUsd(pos.yieldEarned, priceUsd)}</p>
                        </div>
                        <div className="bg-muted/40 rounded p-2 text-center">
                          <p className="text-muted-foreground">ROI</p>
                          <p className={`font-semibold ${profitPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%
                          </p>
                          <p className="text-muted-foreground">{pool ? `${(pool.apyRate * 100).toFixed(0)}% Reward Rate` : ''}</p>
                        </div>
                      </div>

                      {canWithdraw ? (
                        <Button
                          className="w-full gap-2 bg-green-600 hover:bg-green-500"
                          size="sm"
                          onClick={() => withdrawMutation.mutate(pos.id)}
                          disabled={withdrawMutation.isPending}
                        >
                          {withdrawMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                          Withdraw {formatVedd(pos.currentValue)} VEDD
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded p-2">
                          <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          Locked until {pos.maturityDate ? new Date(pos.maturityDate).toLocaleDateString() : 'N/A'} — {daysLeft} days left
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── HISTORY ── */}
        <TabsContent value="history">
          {historyPositions.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="py-10 text-center text-muted-foreground">
                <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No completed investments yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {historyPositions.map((pos) => {
                const pool = poolMap[pos.poolId];
                return (
                  <Card key={pos.id} className="border-border/40 opacity-80">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{pool?.name || `Pool #${pos.poolId}`}</p>
                        <p className="text-xs text-muted-foreground">
                          Withdrawn {pos.withdrawnAt ? new Date(pos.withdrawnAt).toLocaleDateString() : '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatVedd(pos.amountInvested)} VEDD</p>
                        <p className="text-xs text-green-400">+{formatVedd(pos.yieldEarned)} rewards</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Invest Dialog */}
      {selectedPool && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-400" />
                Lock in {selectedPool.name}
              </DialogTitle>
              <DialogDescription>
                {(selectedPool.apyRate * 100).toFixed(0)}% Reward Rate ·{" "}
                {selectedPool.lockPeriodDays === 0 ? "Flexible withdrawal" : `${selectedPool.lockPeriodDays}-day lock`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold mb-1 block">Amount (VEDD)</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder={`Min ${formatVedd(selectedPool.minInvestment)}`}
                    value={investAmount}
                    onChange={(e) => setInvestAmount(e.target.value)}
                    className="font-mono"
                  />
                  <Button size="sm" variant="outline" onClick={() => setInvestAmount(String(walletBalance))}>
                    Max
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Balance: <span className="text-amber-400 font-semibold">{formatVedd(walletBalance)} VEDD</span>
                  {" "}≈ {veddToUsd(walletBalance, priceUsd)}
                </p>
              </div>

              {amount > 0 && (
                <div className="bg-muted/40 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">You invest</span>
                    <span className="font-semibold">{formatVedd(amount)} VEDD <span className="text-xs text-muted-foreground">≈ {veddToUsd(amount, priceUsd)}</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. platform rewards{selectedPool.lockPeriodDays > 0 ? ` (${selectedPool.lockPeriodDays}d)` : ' (1yr)'}</span>
                    <span className="font-semibold text-green-400">+{formatVedd(estimatedYield)} VEDD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. total return</span>
                    <span className="font-bold text-amber-400">{formatVedd(amount + estimatedYield)} VEDD</span>
                  </div>
                  {selectedPool.lockPeriodDays > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Matures</span>
                      <span className="text-xs">{new Date(Date.now() + selectedPool.lockPeriodDays * 86400000).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                className="bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-2"
                onClick={() => investMutation.mutate({ poolId: selectedPool.id, amount })}
                disabled={
                  investMutation.isPending ||
                  amount < selectedPool.minInvestment ||
                  amount > walletBalance ||
                  (selectedPool.maxInvestment !== null && amount > selectedPool.maxInvestment)
                }
              >
                {investMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
                Confirm Lock
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
