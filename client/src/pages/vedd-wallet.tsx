import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  Wallet, Coins, ArrowUpRight, ArrowDownLeft, RefreshCw, 
  ExternalLink, CheckCircle2, Clock, AlertCircle, Shield,
  Copy, Send, History, Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSolanaWallet } from '@/hooks/use-solana-wallet';
import { WalletLoginButton } from '@/components/wallet/wallet-login-button';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

interface User {
  id: number;
  username: string;
  walletAddress: string | null;
  veddTokenBalance: number;
  isAmbassador: boolean;
}

interface AmbassadorReward {
  id: number;
  actionType: string;
  baseReward: number;
  bonusReward: number;
  totalReward: number;
  verificationStatus: string;
  createdAt: string;
  notes: string | null;
}

interface TransferJob {
  id: number;
  amount: number;
  actionType: string;
  status: string;
  solanaTransactionSig: string | null;
  createdAt: string;
  processedAt: string | null;
}

export default function VeddWalletPage() {
  const { toast } = useToast();
  const { connected, walletData, refreshWalletData, connecting } = useSolanaWallet();
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ['/api/user'],
  });

  const { data: rewards, isLoading: rewardsLoading } = useQuery<AmbassadorReward[]>({
    queryKey: ['/api/ambassador/my-rewards'],
    enabled: !!user,
  });

  const { data: transfers, isLoading: transfersLoading } = useQuery<TransferJob[]>({
    queryKey: ['/api/vedd/my-transfers'],
    enabled: !!user,
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      if (!user?.walletAddress) throw new Error('No wallet connected');
      const res = await apiRequest('POST', '/api/vedd/request-withdrawal', {});
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Withdrawal Requested',
          description: 'Your verified rewards will be transferred to your wallet.',
        });
        queryClient.invalidateQueries({ queryKey: ['/api/ambassador/my-rewards'] });
        queryClient.invalidateQueries({ queryKey: ['/api/vedd/my-transfers'] });
        setWithdrawDialogOpen(false);
      } else {
        toast({
          title: 'Withdrawal Failed',
          description: data.error || 'Could not process withdrawal request',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to request withdrawal',
        variant: 'destructive',
      });
    },
  });

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied!', description: 'Address copied to clipboard' });
  };

  const pendingRewards = rewards?.filter(r => r.verificationStatus === 'pending') || [];
  const verifiedRewards = rewards?.filter(r => r.verificationStatus === 'verified') || [];
  const rejectedRewards = rewards?.filter(r => r.verificationStatus === 'rejected') || [];

  const totalPending = pendingRewards.reduce((sum, r) => sum + r.totalReward, 0);
  const totalVerified = verifiedRewards.reduce((sum, r) => sum + r.totalReward, 0);
  const totalTransferred = transfers?.filter(t => t.status === 'completed').reduce((sum, t) => sum + t.amount, 0) || 0;

  const actionTypeLabels: Record<string, string> = {
    'challenge_completion': 'Challenge Completed',
    'event_hosting': 'Event Hosted',
    'content_share': 'Content Shared',
    'referral': 'Referral Bonus',
    'streak_bonus': 'Streak Bonus',
    'chart_analysis': 'Chart Analysis',
    'ea_creation': 'EA Created',
  };

  const statusColors: Record<string, string> = {
    'pending': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'verified': 'bg-green-500/20 text-green-400 border-green-500/30',
    'rejected': 'bg-red-500/20 text-red-400 border-red-500/30',
    'processing': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'completed': 'bg-green-500/20 text-green-400 border-green-500/30',
    'failed': 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  if (!user && !userLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="bg-gray-800/50 border-purple-500/30">
            <CardHeader className="text-center">
              <Wallet className="w-16 h-16 mx-auto mb-4 text-purple-400" />
              <CardTitle className="text-2xl text-white">VEDD Wallet</CardTitle>
              <CardDescription className="text-gray-400">
                Connect your wallet to view your VEDD tokens and earned rewards
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <WalletLoginButton className="w-full" />
              <div className="text-center">
                <p className="text-gray-500 text-sm mb-2">Or</p>
                <Link href="/auth">
                  <Button variant="outline" className="w-full border-gray-600 text-gray-300">
                    Login with Username
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Wallet className="w-8 h-8 text-purple-400" />
              VEDD Wallet
            </h1>
            <p className="text-gray-400 mt-1">Manage your VEDD tokens and earned rewards</p>
          </div>
          <a
            href="https://pump.fun/coin/Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500">
              <ExternalLink className="w-4 h-4 mr-2" />
              Buy VEDD on Pump.fun
            </Button>
          </a>
        </motion.div>

        {/* Wallet Connection Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border-purple-500/30">
            <CardContent className="p-6">
              {connected && walletData ? (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
                      <Wallet className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-green-400 text-sm font-medium">Connected</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-white font-mono text-lg">
                          {walletData.address.slice(0, 6)}...{walletData.address.slice(-6)}
                        </p>
                        <button
                          onClick={() => copyToClipboard(walletData.address)}
                          className="text-gray-400 hover:text-white transition-colors"
                        >
                          {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <div className="bg-gray-900/50 rounded-xl p-4 min-w-[140px] border border-purple-500/20">
                      <p className="text-gray-400 text-sm mb-1">VEDD Balance</p>
                      <p className="text-2xl font-bold text-purple-400">
                        {walletData.veddBalance.toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-gray-900/50 rounded-xl p-4 min-w-[140px] border border-amber-500/20">
                      <p className="text-gray-400 text-sm mb-1">SOL Balance</p>
                      <p className="text-2xl font-bold text-amber-400">
                        {walletData.solBalance.toFixed(4)}
                      </p>
                    </div>
                    {walletData.isAmbassador && (
                      <div className="bg-gradient-to-r from-green-900/50 to-emerald-900/50 rounded-xl p-4 min-w-[140px] border border-green-500/30">
                        <p className="text-gray-400 text-sm mb-1">Status</p>
                        <div className="flex items-center gap-2">
                          <Award className="w-5 h-5 text-green-400" />
                          <span className="text-green-400 font-bold">Ambassador</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={refreshWalletData}
                    variant="outline"
                    className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                    disabled={connecting}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${connecting ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center">
                      <Wallet className="w-7 h-7 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium">No Wallet Connected</p>
                      <p className="text-gray-400 text-sm">Connect your Solana wallet to see your VEDD balance</p>
                    </div>
                  </div>
                  <WalletLoginButton className="md:w-auto" />
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Earnings Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <Card className="bg-gray-800/50 border-yellow-500/30">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <Clock className="w-5 h-5 text-yellow-400" />
                <span className="text-gray-400">Pending Verification</span>
              </div>
              <p className="text-3xl font-bold text-yellow-400">{totalPending.toLocaleString()}</p>
              <p className="text-gray-500 text-sm mt-1">VEDD tokens awaiting admin approval</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-green-500/30">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span className="text-gray-400">Verified & Ready</span>
              </div>
              <p className="text-3xl font-bold text-green-400">{totalVerified.toLocaleString()}</p>
              <p className="text-gray-500 text-sm mt-1">VEDD tokens ready to withdraw</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-purple-500/30">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <ArrowUpRight className="w-5 h-5 text-purple-400" />
                <span className="text-gray-400">Total Transferred</span>
              </div>
              <p className="text-3xl font-bold text-purple-400">{totalTransferred.toLocaleString()}</p>
              <p className="text-gray-500 text-sm mt-1">VEDD tokens sent to your wallet</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Withdraw Button */}
        {totalVerified > 0 && user?.walletAddress && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border-green-500/30">
              <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Send className="w-6 h-6 text-green-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Withdraw Verified Rewards</p>
                    <p className="text-gray-400 text-sm">
                      Send {totalVerified.toLocaleString()} VEDD to your connected wallet
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => setWithdrawDialogOpen(true)}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 px-8"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Withdraw to Wallet
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Tabs for Rewards and Transfers */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Tabs defaultValue="rewards" className="w-full">
            <TabsList className="bg-gray-800/50 border border-gray-700/50">
              <TabsTrigger value="rewards" className="data-[state=active]:bg-purple-600">
                <Award className="w-4 h-4 mr-2" />
                Earned Rewards
              </TabsTrigger>
              <TabsTrigger value="transfers" className="data-[state=active]:bg-purple-600">
                <History className="w-4 h-4 mr-2" />
                Transfer History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="rewards" className="mt-4">
              <Card className="bg-gray-800/50 border-gray-700/50">
                <CardHeader>
                  <CardTitle className="text-white">Your Earned Rewards</CardTitle>
                  <CardDescription>Rewards from ambassador activities and platform engagement</CardDescription>
                </CardHeader>
                <CardContent>
                  {rewardsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
                    </div>
                  ) : rewards && rewards.length > 0 ? (
                    <div className="space-y-3">
                      {rewards.map((reward) => (
                        <div
                          key={reward.id}
                          className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-gray-700/50"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                              <Coins className="w-5 h-5 text-purple-400" />
                            </div>
                            <div>
                              <p className="text-white font-medium">
                                {actionTypeLabels[reward.actionType] || reward.actionType}
                              </p>
                              <p className="text-gray-500 text-sm">
                                {new Date(reward.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-lg font-bold text-purple-400">
                                +{reward.totalReward.toLocaleString()} VEDD
                              </p>
                              {reward.bonusReward > 0 && (
                                <p className="text-green-400 text-xs">
                                  +{reward.bonusReward.toLocaleString()} bonus
                                </p>
                              )}
                            </div>
                            <Badge className={`${statusColors[reward.verificationStatus]} border`}>
                              {reward.verificationStatus}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Award className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                      <p className="text-gray-400">No rewards earned yet</p>
                      <p className="text-gray-500 text-sm mt-2">
                        Complete challenges and activities to earn VEDD tokens
                      </p>
                      <Link href="/ambassador-training">
                        <Button className="mt-4" variant="outline">
                          Start Ambassador Training
                        </Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="transfers" className="mt-4">
              <Card className="bg-gray-800/50 border-gray-700/50">
                <CardHeader>
                  <CardTitle className="text-white">Transfer History</CardTitle>
                  <CardDescription>Your VEDD token withdrawals and transfers</CardDescription>
                </CardHeader>
                <CardContent>
                  {transfersLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
                    </div>
                  ) : transfers && transfers.length > 0 ? (
                    <div className="space-y-3">
                      {transfers.map((transfer) => (
                        <div
                          key={transfer.id}
                          className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-gray-700/50"
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              transfer.status === 'completed' ? 'bg-green-500/20' : 'bg-yellow-500/20'
                            }`}>
                              {transfer.status === 'completed' ? (
                                <ArrowUpRight className="w-5 h-5 text-green-400" />
                              ) : (
                                <Clock className="w-5 h-5 text-yellow-400" />
                              )}
                            </div>
                            <div>
                              <p className="text-white font-medium">
                                {actionTypeLabels[transfer.actionType] || 'Withdrawal'}
                              </p>
                              <p className="text-gray-500 text-sm">
                                {new Date(transfer.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-lg font-bold text-purple-400">
                                {transfer.amount.toLocaleString()} VEDD
                              </p>
                              {transfer.solanaTransactionSig && (
                                <a
                                  href={`https://solscan.io/tx/${transfer.solanaTransactionSig}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 text-xs hover:underline flex items-center gap-1"
                                >
                                  View on Solscan
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                            <Badge className={`${statusColors[transfer.status]} border`}>
                              {transfer.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <History className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                      <p className="text-gray-400">No transfers yet</p>
                      <p className="text-gray-500 text-sm mt-2">
                        Your withdrawal history will appear here
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>

        {/* Security Notice */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="bg-gray-800/30 border-gray-700/30">
            <CardContent className="p-4 flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-gray-300 text-sm font-medium">Security Notice</p>
                <p className="text-gray-500 text-sm mt-1">
                  All rewards require admin verification before transfer. This ensures the integrity of our 
                  ambassador program and protects against fraudulent claims. Verified rewards are transferred 
                  directly to your connected Solana wallet.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Withdrawal Confirmation Dialog */}
      <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <DialogContent className="bg-gray-900 border-purple-500/30">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Send className="w-5 h-5 text-green-400" />
              Confirm Withdrawal
            </DialogTitle>
            <DialogDescription>
              You are about to withdraw your verified VEDD rewards to your connected wallet.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400">Amount to withdraw:</span>
                <span className="text-2xl font-bold text-green-400">{totalVerified.toLocaleString()} VEDD</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Destination:</span>
                <span className="text-white font-mono text-sm">
                  {user?.walletAddress?.slice(0, 8)}...{user?.walletAddress?.slice(-8)}
                </span>
              </div>
            </div>

            <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
              <p className="text-yellow-400 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Transfers may take a few minutes to process. You will see the transaction on Solscan once completed.
                </span>
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => withdrawMutation.mutate()}
              disabled={withdrawMutation.isPending}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500"
            >
              {withdrawMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Confirm Withdrawal
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
