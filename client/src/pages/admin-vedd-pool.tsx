import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Wallet, RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock,
  ArrowLeft, Plus, TrendingUp, BookOpen, Key, Coins, Shield,
  ChevronDown, ChevronUp, Eye, Users, Gift, Ban, Bell, ExternalLink,
  Copy, Activity,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface PoolWalletInfo {
  id: number; label: string; publicKey: string; walletType: string;
  status: string; tokenBalance: number; lowBalanceThreshold: number; isLowBalance: boolean;
}
interface PoolOverview {
  pools: PoolWalletInfo[];
  pendingTransfers: number; completedTransfersToday: number; totalDistributedToday: number;
}
interface PendingReward {
  id: number; userId: number; actionType: string; totalReward: number;
  createdAt: string; notes?: string; securityFlag?: string;
}
interface Transfer {
  id: number; userId: number; amount: number; status: string; actionType: string;
  destinationWallet?: string; createdAt: string; processedAt?: string;
  errorMessage?: string; solanaTransactionSig?: string; retryCount?: number;
}
interface SecurityAlert { id: number; userId: number; actionType: string; totalReward: number; securityFlag: string; createdAt: string; }
interface BlacklistEntry { walletAddress: string; reason: string; createdAt: string; isActive: boolean; }

/* ─── Status badge helper ────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-500/20 text-green-400',
    failed:    'bg-red-500/20 text-red-400',
    pending:   'bg-yellow-500/20 text-yellow-400',
    processing:'bg-blue-500/20 text-blue-400',
    cancelled: 'bg-zinc-500/20 text-zinc-400',
  };
  return <Badge className={map[status] ?? 'bg-zinc-500/20 text-zinc-400'}>{status}</Badge>;
}

/* ─── Action type label helper ───────────────────────────────────────────── */
function actionLabel(type: string) {
  const map: Record<string, string> = {
    referral_signup:       '🔗 Referral Signup',
    referral_subscription: '💎 Referral Sub',
    challenge_completion:  '🏆 Challenge',
    event_hosting:         '📅 Event',
    content_share:         '📢 Content',
    referral:              '🔗 Referral',
    subscription_refund:   '↩ Refund',
  };
  return map[type] ?? type;
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════════ */
export default function AdminVeddPool() {
  const { toast } = useToast();
  const [newWallet, setNewWallet]           = useState({ label: '', publicKey: '', walletType: 'rewards' });
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState<Record<number, string>>({});
  const [selectedReward, setSelectedReward] = useState<number | null>(null);
  const [blacklistInput, setBlacklistInput] = useState({ walletAddress: '', reason: '' });
  const [txFilter, setTxFilter]             = useState<'all' | 'referral' | 'failed' | 'pending'>('all');

  /* Queries */
  const { data: overview, isLoading, refetch } = useQuery<PoolOverview>({ queryKey: ['/api/vedd/admin/overview'] });
  const { data: pendingRewards = [] }   = useQuery<PendingReward[]>({ queryKey: ['/api/vedd/admin/pending-rewards'] });
  const { data: transfers = [] }        = useQuery<Transfer[]>({ queryKey: ['/api/vedd/admin/transfers'] });
  const { data: securityAlerts = [] }   = useQuery<SecurityAlert[]>({ queryKey: ['/api/vedd/admin/security-alerts'] });
  const { data: blacklist = [] }        = useQuery<BlacklistEntry[]>({ queryKey: ['/api/vedd/admin/blacklist'] });

  /* Derived */
  const referralTransfers  = transfers.filter(t => t.actionType?.startsWith('referral'));
  const failedTransfers    = transfers.filter(t => t.status === 'failed');
  const pendingTransfers   = transfers.filter(t => t.status === 'pending');
  const totalReferralVedd  = referralTransfers.filter(t => t.status === 'completed').reduce((s, t) => s + t.amount, 0);

  const visibleTransfers = txFilter === 'all'     ? transfers
    : txFilter === 'referral' ? referralTransfers
    : txFilter === 'failed'   ? failedTransfers
    : pendingTransfers;

  /* Mutations */
  const initPoolMutation = useMutation({
    mutationFn: async (data: typeof newWallet) => {
      const res = await fetch('/api/vedd/admin/pool/initialize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data), credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
      return json;
    },
    onSuccess: () => {
      toast({ title: "✅ Pool wallet initialized!", description: "Click Sync to load the VEDD balance." });
      setNewWallet({ label: '', publicKey: '', walletType: 'rewards' });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd/admin/overview'] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const syncBalanceMutation = useMutation({
    mutationFn: async (walletId: number) => (await apiRequest('POST', `/api/vedd/admin/pool/${walletId}/sync`)).json(),
    onSuccess: () => { toast({ title: "Synced" }); queryClient.invalidateQueries({ queryKey: ['/api/vedd/admin/overview'] }); },
  });

  const verifyRewardMutation = useMutation({
    mutationFn: async ({ rewardId, approved, notes }: { rewardId: number; approved: boolean; notes?: string }) =>
      (await apiRequest('POST', `/api/vedd/admin/rewards/${rewardId}/verify`, { approved, notes })).json(),
    onSuccess: () => {
      toast({ title: "Done" });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd/admin/pending-rewards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd/admin/transfers'] });
    },
  });

  const retryTransferMutation = useMutation({
    mutationFn: async (jobId: number) => (await apiRequest('POST', `/api/vedd/admin/transfers/${jobId}/retry`)).json(),
    onSuccess: () => { toast({ title: "Retrying transfer…" }); queryClient.invalidateQueries({ queryKey: ['/api/vedd/admin/transfers'] }); },
  });

  const addBlacklistMutation = useMutation({
    mutationFn: async (data: typeof blacklistInput) =>
      (await apiRequest('POST', '/api/vedd/admin/blacklist', data)).json(),
    onSuccess: () => {
      toast({ title: "Wallet blacklisted" });
      setBlacklistInput({ walletAddress: '', reason: '' });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd/admin/blacklist'] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const removeBlacklistMutation = useMutation({
    mutationFn: async (address: string) =>
      (await apiRequest('DELETE', `/api/vedd/admin/blacklist/${address}`)).json(),
    onSuccess: () => {
      toast({ title: "Removed from blacklist" });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd/admin/blacklist'] });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-amber-400">VEDD Token Pool</h1>
              <p className="text-zinc-400 text-sm">Referral rewards · pool wallets · transfer management</p>
            </div>
          </div>
          <Button onClick={() => refetch()} variant="outline" className="border-zinc-700">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* ── KPI strip ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Active Pools',     value: overview?.pools.length ?? 0,                          color: 'text-amber-400' },
            { label: 'Pending',          value: overview?.pendingTransfers ?? 0,                       color: 'text-yellow-400' },
            { label: 'Completed Today',  value: overview?.completedTransfersToday ?? 0,                color: 'text-green-400' },
            { label: 'Distributed Today',value: `${(overview?.totalDistributedToday ?? 0).toFixed(0)} VEDD`, color: 'text-emerald-400' },
            { label: 'Referral VEDD Sent', value: `${totalReferralVedd.toFixed(0)} VEDD`,             color: 'text-purple-400' },
          ].map(k => (
            <Card key={k.label} className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-4 pb-3 text-center">
                <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Alerts strip ───────────────────────────────────────────────── */}
        {(securityAlerts.length > 0 || failedTransfers.length > 0 || (overview?.pools ?? []).some(p => p.isLowBalance)) && (
          <div className="flex flex-wrap gap-2">
            {securityAlerts.length > 0 && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">
                <AlertTriangle className="w-4 h-4" /> {securityAlerts.length} security alert{securityAlerts.length > 1 ? 's' : ''} — check Security tab
              </div>
            )}
            {failedTransfers.length > 0 && (
              <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2 text-sm text-orange-400">
                <XCircle className="w-4 h-4" /> {failedTransfers.length} failed transfer{failedTransfers.length > 1 ? 's' : ''} need retry
              </div>
            )}
            {(overview?.pools ?? []).filter(p => p.isLowBalance).map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-sm text-yellow-400">
                <AlertTriangle className="w-4 h-4" /> Pool "{p.label}" low: {p.tokenBalance?.toFixed(0)} VEDD
              </div>
            ))}
          </div>
        )}

        {/* ── Setup guide (collapsed by default) ─────────────────────────── */}
        <Collapsible open={showSetupGuide} onOpenChange={setShowSetupGuide}>
          <Card className="bg-zinc-900 border-zinc-800">
            <CollapsibleTrigger className="w-full">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-amber-400 text-sm">
                  <span className="flex items-center gap-2"><BookOpen className="w-4 h-4" /> Pool Setup Guide</span>
                  {showSetupGuide ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  {[
                    { step: 1, icon: <Wallet className="w-4 h-4" />, title: 'Create Pool Wallet', body: 'Create a Solana wallet (Phantom / Solflare). This wallet holds VEDD tokens for distribution.' },
                    { step: 2, icon: <Key className="w-4 h-4" />, title: 'Set Env Vars', body: 'In Render → Environment add: VEDD_TOKEN_MINT, POOL_WALLET_PRIVATE_KEY, SOLANA_RPC_URL' },
                    { step: 3, icon: <Coins className="w-4 h-4" />, title: 'Fund & Register', body: 'Transfer your referral token allocation to the pool wallet, then register it below.' },
                  ].map(({ step, icon, title, body }) => (
                    <div key={step} className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 font-medium">
                        <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs">{step}</div>
                        {icon} {title}
                      </div>
                      <p className="text-zinc-400 text-xs">{body}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300 flex items-start gap-2">
                  <Gift className="w-4 h-4 mt-0.5 shrink-0" />
                  <span><strong>Referral rewards are auto-approved</strong> — 50 VEDD on signup · 200 VEDD on subscription. They fire immediately after the event and appear in the Referrals tab below.</span>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* ── Main tabs ──────────────────────────────────────────────────── */}
        <Tabs defaultValue="pools">
          <TabsList className="bg-zinc-900 border border-zinc-800 w-full grid grid-cols-5">
            <TabsTrigger value="pools">Pools</TabsTrigger>
            <TabsTrigger value="referrals">
              Referrals {referralTransfers.length > 0 && <span className="ml-1 text-purple-400 text-[10px]">{referralTransfers.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="verify">
              Verify {pendingRewards.length > 0 && <span className="ml-1 text-yellow-400 text-[10px]">{pendingRewards.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="transfers">Transfers</TabsTrigger>
            <TabsTrigger value="security">
              Security {securityAlerts.length > 0 && <span className="ml-1 text-red-400 text-[10px]">{securityAlerts.length}</span>}
            </TabsTrigger>
          </TabsList>

          {/* ── POOLS TAB ────────────────────────────────────────────────── */}
          <TabsContent value="pools">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
              {/* Existing pools */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-amber-400 flex items-center gap-2 text-base">
                    <Wallet className="w-5 h-5" /> Active Pool Wallets
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {overview?.pools && overview.pools.length > 0 ? overview.pools.map((pool) => (
                    <div key={pool.id} className="bg-zinc-800/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium">{pool.label}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <code className="text-[10px] text-zinc-500">{pool.publicKey.slice(0, 14)}…{pool.publicKey.slice(-8)}</code>
                            <button onClick={() => navigator.clipboard.writeText(pool.publicKey)} className="text-zinc-600 hover:text-zinc-300">
                              <Copy className="w-3 h-3" />
                            </button>
                            <a href={`https://solscan.io/account/${pool.publicKey}`} target="_blank" rel="noreferrer" className="text-zinc-600 hover:text-blue-400">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-bold ${pool.isLowBalance ? 'text-red-400' : 'text-emerald-400'}`}>
                            {pool.tokenBalance?.toFixed(2)}
                          </p>
                          <p className="text-[10px] text-zinc-500">VEDD balance</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-zinc-500">
                        <span>Type: <span className="text-zinc-300">{pool.walletType}</span> · Low threshold: {pool.lowBalanceThreshold} VEDD</span>
                        <div className="flex gap-1">
                          <Badge className={pool.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-zinc-500/20 text-zinc-400'} >{pool.status}</Badge>
                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2"
                            onClick={() => syncBalanceMutation.mutate(pool.id)} disabled={syncBalanceMutation.isPending}>
                            <RefreshCw className={`w-3 h-3 mr-1 ${syncBalanceMutation.isPending ? 'animate-spin' : ''}`} /> Sync
                          </Button>
                        </div>
                      </div>
                      {pool.isLowBalance && (
                        <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Balance below threshold — top up to keep referral rewards flowing
                        </p>
                      )}
                    </div>
                  )) : (
                    <div className="text-center py-8 text-zinc-500">
                      <Wallet className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">No pool wallets configured</p>
                      <p className="text-xs mt-1">Register your referral token allocation wallet below</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Register new pool */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-amber-400 flex items-center gap-2 text-base">
                    <Plus className="w-5 h-5" /> Register Pool Wallet
                  </CardTitle>
                  <CardDescription>Add the wallet that holds your referral token allocation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-zinc-400 text-xs">Label</Label>
                    <Input value={newWallet.label} onChange={e => setNewWallet(w => ({ ...w, label: e.target.value }))}
                      placeholder="Referral Rewards Pool" className="bg-zinc-800 border-zinc-700 mt-1" />
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-xs">Solana Public Key</Label>
                    <Input value={newWallet.publicKey} onChange={e => setNewWallet(w => ({ ...w, publicKey: e.target.value }))}
                      placeholder="Base58 wallet address" className="bg-zinc-800 border-zinc-700 mt-1 font-mono text-sm" />
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-xs">Pool Type</Label>
                    <select value={newWallet.walletType} onChange={e => setNewWallet(w => ({ ...w, walletType: e.target.value }))}
                      className="w-full mt-1 bg-zinc-800 border border-zinc-700 text-white text-sm rounded-md px-3 py-2">
                      <option value="rewards">rewards (referrals + ambassador)</option>
                      <option value="subscriptions">subscriptions</option>
                      <option value="marketing">marketing</option>
                    </select>
                  </div>
                  <Button onClick={() => initPoolMutation.mutate(newWallet)}
                    disabled={!newWallet.label || !newWallet.publicKey || initPoolMutation.isPending}
                    className="w-full bg-amber-600 hover:bg-amber-500">
                    {initPoolMutation.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Initializing…</> : 'Register Pool Wallet'}
                  </Button>
                  <p className="text-[11px] text-zinc-500 text-center">
                    Make sure POOL_WALLET_PRIVATE_KEY env var matches the private key for this address
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── REFERRALS TAB ─────────────────────────────────────────────── */}
          <TabsContent value="referrals">
            <div className="mt-4 space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Referral Txns', value: referralTransfers.length, color: 'text-purple-400' },
                  { label: 'VEDD Sent (referrals)', value: `${totalReferralVedd.toFixed(0)} VEDD`, color: 'text-emerald-400' },
                  { label: 'Pending / Failed', value: `${referralTransfers.filter(t=>t.status==='pending').length} / ${referralTransfers.filter(t=>t.status==='failed').length}`, color: 'text-yellow-400' },
                ].map(k => (
                  <Card key={k.label} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="pt-4 pb-3 text-center">
                      <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{k.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-purple-400 flex items-center gap-2 text-base">
                    <Gift className="w-5 h-5" /> Referral Token Transfers
                  </CardTitle>
                  <CardDescription>Auto-approved transfers fired when someone signs up or subscribes via a referral link</CardDescription>
                </CardHeader>
                <CardContent>
                  {referralTransfers.length === 0 ? (
                    <div className="text-center py-10 text-zinc-500">
                      <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">No referral transfers yet</p>
                      <p className="text-xs mt-1">Transfers appear here as soon as someone signs up or subscribes via a referral link</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-zinc-500 border-b border-zinc-800 text-xs">
                            <th className="text-left py-2">Type</th>
                            <th className="text-left py-2">Referrer</th>
                            <th className="text-left py-2 font-mono">Wallet</th>
                            <th className="text-right py-2">VEDD</th>
                            <th className="text-center py-2">Status</th>
                            <th className="text-right py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {referralTransfers.map(t => (
                            <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                              <td className="py-2.5 text-xs">{actionLabel(t.actionType)}</td>
                              <td className="py-2.5 text-zinc-400">User #{t.userId}</td>
                              <td className="py-2.5 font-mono text-[10px] text-zinc-500">
                                {t.destinationWallet ? `${t.destinationWallet.slice(0,8)}…${t.destinationWallet.slice(-6)}` : '—'}
                              </td>
                              <td className="py-2.5 text-right text-purple-300 font-semibold">{t.amount} VEDD</td>
                              <td className="py-2.5 text-center"><StatusBadge status={t.status} /></td>
                              <td className="py-2.5 text-right">
                                <div className="flex justify-end gap-1">
                                  {t.status === 'failed' && (
                                    <Button size="sm" variant="ghost" className="h-6 text-xs px-2"
                                      onClick={() => retryTransferMutation.mutate(t.id)} disabled={retryTransferMutation.isPending}>
                                      <RefreshCw className="w-3 h-3 mr-1" /> Retry
                                    </Button>
                                  )}
                                  {t.solanaTransactionSig && (
                                    <a href={`https://solscan.io/tx/${t.solanaTransactionSig}`} target="_blank" rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs px-2 py-1">
                                      <ExternalLink className="w-3 h-3" /> TX
                                    </a>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── VERIFY TAB ────────────────────────────────────────────────── */}
          <TabsContent value="verify">
            <Card className="bg-zinc-900 border-zinc-800 mt-4">
              <CardHeader>
                <CardTitle className="text-yellow-400 flex items-center gap-2 text-base">
                  <Shield className="w-5 h-5" /> Verification Queue ({pendingRewards.length})
                </CardTitle>
                <CardDescription>Ambassador challenge / event rewards require manual approval before tokens are sent. Referral rewards are auto-approved.</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingRewards.length === 0 ? (
                  <div className="text-center py-10 text-zinc-500">
                    <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">All caught up!</p>
                    <p className="text-sm mt-1">No pending verifications</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {pendingRewards.map(reward => (
                      <div key={reward.id} className={`rounded-lg p-4 space-y-3 transition-all border ${
                        selectedReward === reward.id ? 'bg-amber-900/20 border-amber-500/30' : 'bg-zinc-800/50 border-transparent hover:border-zinc-700'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">{actionLabel(reward.actionType)}</Badge>
                              <span className="text-amber-400 font-bold">{reward.totalReward} VEDD</span>
                              {reward.securityFlag && <Badge className="bg-red-500/20 text-red-400 text-[10px]">⚠ flagged</Badge>}
                            </div>
                            <p className="text-xs text-zinc-500 mt-1">User #{reward.userId} · {formatDistanceToNow(new Date(reward.createdAt), { addSuffix: true })}</p>
                            {reward.notes && <p className="text-xs text-zinc-400 mt-1">{reward.notes}</p>}
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => setSelectedReward(selectedReward === reward.id ? null : reward.id)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>

                        {selectedReward === reward.id ? (
                          <div className="space-y-3 pt-2 border-t border-zinc-700">
                            <div>
                              <Label className="text-zinc-400 text-xs">Notes (optional)</Label>
                              <Textarea value={verificationNotes[reward.id] || ''}
                                onChange={e => setVerificationNotes(prev => ({ ...prev, [reward.id]: e.target.value }))}
                                placeholder="Verification notes…" className="bg-zinc-800 border-zinc-700 mt-1 text-sm" rows={2} />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-500"
                                onClick={() => { verifyRewardMutation.mutate({ rewardId: reward.id, approved: true, notes: verificationNotes[reward.id] }); setSelectedReward(null); }}
                                disabled={verifyRewardMutation.isPending}>
                                <CheckCircle className="w-4 h-4 mr-2" /> Approve &amp; Send
                              </Button>
                              <Button size="sm" variant="destructive" className="flex-1"
                                onClick={() => { verifyRewardMutation.mutate({ rewardId: reward.id, approved: false, notes: verificationNotes[reward.id] }); setSelectedReward(null); }}
                                disabled={verifyRewardMutation.isPending}>
                                <XCircle className="w-4 h-4 mr-2" /> Reject
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1 bg-green-600/80 hover:bg-green-600"
                              onClick={() => verifyRewardMutation.mutate({ rewardId: reward.id, approved: true })}
                              disabled={verifyRewardMutation.isPending}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Quick Approve
                            </Button>
                            <Button size="sm" variant="outline" className="border-zinc-600"
                              onClick={() => setSelectedReward(reward.id)}>Review</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TRANSFERS TAB ─────────────────────────────────────────────── */}
          <TabsContent value="transfers">
            <Card className="bg-zinc-900 border-zinc-800 mt-4">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-blue-400 flex items-center gap-2 text-base">
                    <Activity className="w-5 h-5" /> All Transfers
                  </CardTitle>
                  <div className="flex gap-1 flex-wrap">
                    {(['all', 'referral', 'failed', 'pending'] as const).map(f => (
                      <Button key={f} size="sm" variant={txFilter === f ? 'default' : 'outline'}
                        className={txFilter === f ? 'bg-blue-600 h-7 text-xs' : 'border-zinc-700 h-7 text-xs'}
                        onClick={() => setTxFilter(f)}>
                        {f === 'all' ? `All (${transfers.length})` : f === 'referral' ? `Referral (${referralTransfers.length})` : f === 'failed' ? `Failed (${failedTransfers.length})` : `Pending (${pendingTransfers.length})`}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {visibleTransfers.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No {txFilter !== 'all' ? txFilter + ' ' : ''}transfers yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-zinc-500 border-b border-zinc-800 text-xs">
                          <th className="text-left py-2">ID</th>
                          <th className="text-left py-2">User</th>
                          <th className="text-left py-2">Type</th>
                          <th className="text-right py-2">VEDD</th>
                          <th className="text-center py-2">Status</th>
                          <th className="text-right py-2">Age</th>
                          <th className="text-right py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTransfers.slice(0, 50).map(t => (
                          <tr key={t.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                            <td className="py-2 text-zinc-500">#{t.id}</td>
                            <td className="py-2 text-zinc-400">#{t.userId}</td>
                            <td className="py-2 text-xs">{actionLabel(t.actionType)}</td>
                            <td className="py-2 text-right text-amber-400 font-semibold">{t.amount}</td>
                            <td className="py-2 text-center"><StatusBadge status={t.status} /></td>
                            <td className="py-2 text-right text-xs text-zinc-500">
                              {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                            </td>
                            <td className="py-2 text-right">
                              <div className="flex justify-end gap-1">
                                {t.status === 'failed' && (
                                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2"
                                    onClick={() => retryTransferMutation.mutate(t.id)} disabled={retryTransferMutation.isPending}>
                                    <RefreshCw className="w-3 h-3" />
                                  </Button>
                                )}
                                {t.solanaTransactionSig && (
                                  <a href={`https://solscan.io/tx/${t.solanaTransactionSig}`} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center text-blue-400 hover:text-blue-300 text-xs px-2 py-1">
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {visibleTransfers.length > 50 && (
                      <p className="text-center text-xs text-zinc-500 mt-3">Showing 50 of {visibleTransfers.length}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── SECURITY TAB ──────────────────────────────────────────────── */}
          <TabsContent value="security">
            <div className="mt-4 space-y-4">
              {/* Flagged rewards */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-red-400 flex items-center gap-2 text-base">
                    <Bell className="w-5 h-5" /> Security Alerts ({securityAlerts.length})
                  </CardTitle>
                  <CardDescription>Rewards flagged by the system as potentially suspicious</CardDescription>
                </CardHeader>
                <CardContent>
                  {securityAlerts.length === 0 ? (
                    <div className="text-center py-6 text-zinc-500">
                      <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No security alerts</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {securityAlerts.map(alert => (
                        <div key={alert.id} className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center justify-between text-sm">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <AlertTriangle className="w-4 h-4 text-red-400" />
                              <span className="text-red-300 font-medium">{alert.securityFlag}</span>
                              <Badge className="bg-red-500/20 text-red-400 text-[10px]">{alert.totalReward} VEDD</Badge>
                            </div>
                            <p className="text-xs text-zinc-500">User #{alert.userId} · {actionLabel(alert.actionType)} · {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}</p>
                          </div>
                          <div className="flex gap-1 shrink-0 ml-3">
                            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-500"
                              onClick={() => verifyRewardMutation.mutate({ rewardId: alert.id, approved: true, notes: 'Security review passed' })}>
                              Approve
                            </Button>
                            <Button size="sm" variant="destructive" className="h-7 text-xs"
                              onClick={() => verifyRewardMutation.mutate({ rewardId: alert.id, approved: false, notes: 'Rejected — security flag' })}>
                              Reject
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Blacklist */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-orange-400 flex items-center gap-2 text-base">
                    <Ban className="w-5 h-5" /> Wallet Blacklist ({blacklist.filter(b => b.isActive).length} active)
                  </CardTitle>
                  <CardDescription>Blocked wallets cannot receive VEDD token transfers</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Add to blacklist */}
                  <div className="bg-zinc-800/50 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium">Block a wallet</p>
                    <div className="flex gap-2">
                      <Input value={blacklistInput.walletAddress}
                        onChange={e => setBlacklistInput(b => ({ ...b, walletAddress: e.target.value }))}
                        placeholder="Solana wallet address" className="bg-zinc-900 border-zinc-700 font-mono text-xs flex-1" />
                    </div>
                    <div className="flex gap-2">
                      <Input value={blacklistInput.reason}
                        onChange={e => setBlacklistInput(b => ({ ...b, reason: e.target.value }))}
                        placeholder="Reason (e.g. fraud, self-referral abuse)" className="bg-zinc-900 border-zinc-700 text-sm flex-1" />
                      <Button onClick={() => addBlacklistMutation.mutate(blacklistInput)}
                        disabled={!blacklistInput.walletAddress || !blacklistInput.reason || addBlacklistMutation.isPending}
                        className="bg-red-600 hover:bg-red-500 shrink-0">
                        <Ban className="w-4 h-4 mr-2" /> Block
                      </Button>
                    </div>
                  </div>

                  {/* Active blacklist */}
                  {blacklist.filter(b => b.isActive).length > 0 ? (
                    <div className="space-y-2">
                      {blacklist.filter(b => b.isActive).map(entry => (
                        <div key={entry.walletAddress} className="flex items-center justify-between bg-zinc-800/40 rounded-lg px-3 py-2 text-sm">
                          <div>
                            <code className="text-[11px] text-orange-300">{entry.walletAddress.slice(0, 16)}…{entry.walletAddress.slice(-8)}</code>
                            <p className="text-xs text-zinc-500 mt-0.5">{entry.reason}</p>
                          </div>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-400 hover:text-white"
                            onClick={() => removeBlacklistMutation.mutate(entry.walletAddress)}
                            disabled={removeBlacklistMutation.isPending}>
                            <XCircle className="w-3 h-3 mr-1" /> Unblock
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-zinc-600 py-2">No wallets blacklisted</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}
