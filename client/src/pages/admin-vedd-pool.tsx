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
  Wallet, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock,
  ArrowLeft,
  Plus,
  TrendingUp,
  BookOpen,
  Key,
  Coins,
  Shield,
  ChevronDown,
  ChevronUp,
  Eye
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

interface PoolWalletInfo {
  id: number;
  label: string;
  publicKey: string;
  walletType: string;
  status: string;
  tokenBalance: number;
  lowBalanceThreshold: number;
  isLowBalance: boolean;
}

interface PoolOverview {
  pools: PoolWalletInfo[];
  pendingTransfers: number;
  completedTransfersToday: number;
  totalDistributedToday: number;
}

interface PendingReward {
  id: number;
  userId: number;
  actionType: string;
  totalReward: number;
  createdAt: string;
  notes?: string;
}

interface Transfer {
  id: number;
  userId: number;
  amount: number;
  status: string;
  actionType: string;
  createdAt: string;
  errorMessage?: string;
  solanaTransactionSig?: string;
}

export default function AdminVeddPool() {
  const { toast } = useToast();
  const [newWallet, setNewWallet] = useState({ label: '', publicKey: '', walletType: 'rewards' });
  const [showSetupGuide, setShowSetupGuide] = useState(true);
  const [verificationNotes, setVerificationNotes] = useState<Record<number, string>>({});
  const [selectedReward, setSelectedReward] = useState<number | null>(null);

  const { data: overview, isLoading, refetch } = useQuery<PoolOverview>({
    queryKey: ['/api/vedd/admin/overview']
  });

  const { data: pendingRewards = [] } = useQuery<PendingReward[]>({
    queryKey: ['/api/vedd/admin/pending-rewards']
  });

  const { data: transfers = [] } = useQuery<Transfer[]>({
    queryKey: ['/api/vedd/admin/transfers']
  });

  const initPoolMutation = useMutation({
    mutationFn: async (data: { label: string; publicKey: string; walletType: string }) => {
      const res = await apiRequest('POST', '/api/vedd/admin/pool/initialize', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Pool wallet initialized" });
      setNewWallet({ label: '', publicKey: '', walletType: 'rewards' });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd/admin/overview'] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const syncBalanceMutation = useMutation({
    mutationFn: async (walletId: number) => {
      const res = await apiRequest('POST', `/api/vedd/admin/pool/${walletId}/sync`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Synced", description: "Pool balance updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd/admin/overview'] });
    }
  });

  const verifyRewardMutation = useMutation({
    mutationFn: async ({ rewardId, approved, notes }: { rewardId: number; approved: boolean; notes?: string }) => {
      const res = await apiRequest('POST', `/api/vedd/admin/rewards/${rewardId}/verify`, { approved, notes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Done", description: "Reward processed" });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd/admin/pending-rewards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd/admin/transfers'] });
    }
  });

  const retryTransferMutation = useMutation({
    mutationFn: async (jobId: number) => {
      const res = await apiRequest('POST', `/api/vedd/admin/transfers/${jobId}/retry`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Retried", description: "Transfer retry initiated" });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd/admin/transfers'] });
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-amber-400">VEDD Token Pool Management</h1>
              <p className="text-zinc-400">Manage pool wallets and token distributions</p>
            </div>
          </div>
          <Button onClick={() => refetch()} variant="outline" className="border-zinc-700">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Collapsible open={showSetupGuide} onOpenChange={setShowSetupGuide}>
          <Card className="bg-gradient-to-br from-amber-900/20 to-zinc-900 border-amber-700/30">
            <CardHeader className="pb-2">
              <CollapsibleTrigger className="flex items-center justify-between w-full">
                <CardTitle className="flex items-center gap-2 text-amber-400">
                  <BookOpen className="w-5 h-5" />
                  Pool Setup Guide
                </CardTitle>
                {showSetupGuide ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <ChevronDown className="w-5 h-5 text-zinc-400" />}
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-medium">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-sm">1</div>
                      <Wallet className="w-4 h-4" />
                      Create Pool Wallet
                    </div>
                    <p className="text-sm text-zinc-400">
                      Create a new Solana wallet using Phantom, Solflare, or any Solana wallet. This wallet will hold your VEDD tokens for distribution.
                    </p>
                  </div>
                  
                  <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-medium">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-sm">2</div>
                      <Key className="w-4 h-4" />
                      Add Secrets to Replit
                    </div>
                    <p className="text-sm text-zinc-400">
                      Go to <span className="text-amber-300">Secrets</span> tab in Replit and add:
                    </p>
                    <ul className="text-xs text-zinc-500 space-y-1 mt-2">
                      <li><code className="bg-zinc-700 px-1 rounded">VEDD_TOKEN_MINT</code> - Your VEDD token mint address</li>
                      <li><code className="bg-zinc-700 px-1 rounded">POOL_WALLET_PRIVATE_KEY</code> - Private key as JSON array</li>
                    </ul>
                  </div>
                  
                  <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-medium">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-sm">3</div>
                      <Coins className="w-4 h-4" />
                      Fund & Register
                    </div>
                    <p className="text-sm text-zinc-400">
                      Transfer VEDD tokens to your pool wallet, then register it below with the public key. Tokens will be sent automatically after admin verification.
                    </p>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
                  <Shield className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-amber-300 font-medium">Verification Required</p>
                    <p className="text-zinc-400">All ambassador rewards require admin verification before tokens are transferred. This ensures only legitimate actions are rewarded.</p>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-zinc-400">Active Pools</p>
                <p className="text-3xl font-bold text-amber-400">{overview?.pools.length || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-zinc-400">Pending Transfers</p>
                <p className="text-3xl font-bold text-yellow-400">{overview?.pendingTransfers || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-zinc-400">Completed Today</p>
                <p className="text-3xl font-bold text-green-400">{overview?.completedTransfersToday || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-zinc-400">Distributed Today</p>
                <p className="text-3xl font-bold text-emerald-400">{overview?.totalDistributedToday?.toFixed(2) || '0'} VEDD</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-400">
                <Wallet className="w-5 h-5" />
                Pool Wallets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {overview?.pools && overview.pools.length > 0 ? (
                overview.pools.map((pool) => (
                  <div key={pool.id} className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{pool.label}</h3>
                        <code className="text-xs text-zinc-500">{pool.publicKey.slice(0, 12)}...{pool.publicKey.slice(-8)}</code>
                      </div>
                      <Badge className={pool.isLowBalance ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}>
                        {pool.isLowBalance ? <AlertTriangle className="w-3 h-3 mr-1" /> : null}
                        {pool.tokenBalance?.toFixed(2)} VEDD
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">Type: {pool.walletType}</span>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => syncBalanceMutation.mutate(pool.id)}
                        disabled={syncBalanceMutation.isPending}
                      >
                        <RefreshCw className={`w-3 h-3 mr-1 ${syncBalanceMutation.isPending ? 'animate-spin' : ''}`} />
                        Sync
                      </Button>
                    </div>
                    {pool.isLowBalance && (
                      <p className="text-xs text-red-400">Balance below threshold ({pool.lowBalanceThreshold} VEDD)</p>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-zinc-500">
                  <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No pool wallets configured</p>
                </div>
              )}

              <div className="border-t border-zinc-700 pt-4 mt-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Add Pool Wallet
                </h4>
                <div className="space-y-3">
                  <div>
                    <Label className="text-zinc-400">Label</Label>
                    <Input 
                      value={newWallet.label}
                      onChange={(e) => setNewWallet(w => ({ ...w, label: e.target.value }))}
                      placeholder="Ambassador Rewards Pool"
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-400">Public Key</Label>
                    <Input 
                      value={newWallet.publicKey}
                      onChange={(e) => setNewWallet(w => ({ ...w, publicKey: e.target.value }))}
                      placeholder="Solana wallet address"
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                  <Button 
                    onClick={() => initPoolMutation.mutate(newWallet)}
                    disabled={!newWallet.label || !newWallet.publicKey || initPoolMutation.isPending}
                    className="w-full bg-amber-600 hover:bg-amber-700"
                  >
                    Initialize Pool Wallet
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-400">
                <Shield className="w-5 h-5" />
                Verification Queue ({pendingRewards.length})
              </CardTitle>
              <CardDescription>Review and approve ambassador rewards before tokens are sent</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingRewards.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {pendingRewards.slice(0, 15).map((reward) => (
                    <div 
                      key={reward.id} 
                      className={`rounded-lg p-4 space-y-3 transition-all ${
                        selectedReward === reward.id 
                          ? 'bg-amber-900/20 border border-amber-500/30' 
                          : 'bg-zinc-800/50 border border-transparent hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-blue-500/20 text-blue-400">{reward.actionType}</Badge>
                            <span className="text-amber-400 font-bold">{reward.totalReward} VEDD</span>
                          </div>
                          <div className="text-xs text-zinc-500 mt-1">
                            User #{reward.userId} - {formatDistanceToNow(new Date(reward.createdAt), { addSuffix: true })}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedReward(selectedReward === reward.id ? null : reward.id)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      {selectedReward === reward.id && (
                        <div className="space-y-3 pt-2 border-t border-zinc-700">
                          <div>
                            <Label className="text-zinc-400 text-xs">Verification Notes (optional)</Label>
                            <Textarea
                              value={verificationNotes[reward.id] || ''}
                              onChange={(e) => setVerificationNotes(prev => ({ ...prev, [reward.id]: e.target.value }))}
                              placeholder="Add notes about this verification..."
                              className="bg-zinc-800 border-zinc-700 mt-1 text-sm"
                              rows={2}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              className="flex-1 bg-green-600 hover:bg-green-700"
                              onClick={() => {
                                verifyRewardMutation.mutate({ 
                                  rewardId: reward.id, 
                                  approved: true, 
                                  notes: verificationNotes[reward.id] 
                                });
                                setSelectedReward(null);
                              }}
                              disabled={verifyRewardMutation.isPending}
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Approve & Send Tokens
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              className="flex-1"
                              onClick={() => {
                                verifyRewardMutation.mutate({ 
                                  rewardId: reward.id, 
                                  approved: false,
                                  notes: verificationNotes[reward.id]
                                });
                                setSelectedReward(null);
                              }}
                              disabled={verifyRewardMutation.isPending}
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {selectedReward !== reward.id && (
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            className="flex-1 bg-green-600/80 hover:bg-green-600"
                            onClick={() => verifyRewardMutation.mutate({ rewardId: reward.id, approved: true })}
                            disabled={verifyRewardMutation.isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Quick Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="border-zinc-600"
                            onClick={() => setSelectedReward(reward.id)}
                          >
                            Review
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">All caught up!</p>
                  <p className="text-sm">No pending verifications</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-400">
              <TrendingUp className="w-5 h-5" />
              Recent Transfers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transfers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-800">
                      <th className="text-left py-2">ID</th>
                      <th className="text-left py-2">User</th>
                      <th className="text-left py-2">Action</th>
                      <th className="text-right py-2">Amount</th>
                      <th className="text-center py-2">Status</th>
                      <th className="text-right py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.slice(0, 20).map((transfer) => (
                      <tr key={transfer.id} className="border-b border-zinc-800/50">
                        <td className="py-2 text-zinc-400">#{transfer.id}</td>
                        <td className="py-2">User #{transfer.userId}</td>
                        <td className="py-2">{transfer.actionType}</td>
                        <td className="py-2 text-right text-amber-400">{transfer.amount} VEDD</td>
                        <td className="py-2 text-center">
                          <Badge className={
                            transfer.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                            transfer.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                            transfer.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-blue-500/20 text-blue-400'
                          }>
                            {transfer.status}
                          </Badge>
                        </td>
                        <td className="py-2 text-right">
                          {transfer.status === 'failed' && (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => retryTransferMutation.mutate(transfer.id)}
                              disabled={retryTransferMutation.isPending}
                            >
                              <RefreshCw className="w-3 h-3 mr-1" />
                              Retry
                            </Button>
                          )}
                          {transfer.solanaTransactionSig && (
                            <a 
                              href={`https://solscan.io/tx/${transfer.solanaTransactionSig}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 text-xs"
                            >
                              View TX
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-6 text-zinc-500">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No transfers yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
