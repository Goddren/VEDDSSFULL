import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  CheckCircle, 
  XCircle,
  ExternalLink,
  Copy,
  AlertTriangle,
  Coins,
  TrendingUp,
  History,
  ArrowLeft
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const PUMP_FUN_TOKEN = "Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump";

export default function MyWallet() {
  const { toast } = useToast();
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [destinationWallet, setDestinationWallet] = useState("");
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);

  interface WalletData {
    id: number;
    userId: number;
    veddBalance: number;
    pendingBalance: number;
    totalEarned: number;
    totalWithdrawn: number;
  }

  interface WithdrawalData {
    id: number;
    amount: number;
    destinationWallet: string;
    status: string;
    requestedAt: string;
    solanaTransactionSig?: string;
  }

  const { data: wallet, isLoading: walletLoading } = useQuery<WalletData>({
    queryKey: ['/api/wallet/balance'],
  });

  const { data: withdrawals, isLoading: withdrawalsLoading } = useQuery<WithdrawalData[]>({
    queryKey: ['/api/wallet/withdrawals'],
  });

  const withdrawMutation = useMutation({
    mutationFn: async (data: { amount: number; destinationWallet: string }) => {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Withdrawal failed');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Withdrawal Requested!",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/withdrawals'] });
      setIsWithdrawOpen(false);
      setWithdrawAmount("");
      setDestinationWallet("");
    },
    onError: (error: any) => {
      toast({
        title: "Withdrawal Failed",
        description: error.message || "Failed to process withdrawal request",
        variant: "destructive",
      });
    },
  });

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    if (!destinationWallet) {
      toast({ title: "Please enter your pump.fun wallet address", variant: "destructive" });
      return;
    }
    withdrawMutation.mutate({ amount, destinationWallet });
  };

  const copyTokenAddress = () => {
    navigator.clipboard.writeText(PUMP_FUN_TOKEN);
    toast({ title: "Token address copied!" });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case 'approved':
      case 'processing':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Clock className="w-3 h-3 mr-1" /> Processing</Badge>;
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/dashboard">
            <Button variant="ghost" className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center justify-center gap-3">
            <Wallet className="w-8 h-8 text-amber-400" />
            My VEDD Wallet
          </h1>
          <p className="text-gray-400 mt-2">Your internal token balance - withdraw to your pump.fun wallet anytime</p>
        </div>

        {/* Token Info Banner */}
        <Card className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 border-amber-600/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Coins className="w-6 h-6 text-amber-400" />
                <div>
                  <p className="text-sm text-gray-300">VEDD Token (pump.fun)</p>
                  <p className="text-xs text-gray-500 font-mono">{PUMP_FUN_TOKEN.slice(0, 20)}...</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyTokenAddress} className="border-amber-600/50 text-amber-400 hover:bg-amber-900/30">
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
                <a href={`https://pump.fun/coin/${PUMP_FUN_TOKEN}`} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="border-amber-600/50 text-amber-400 hover:bg-amber-900/30">
                    <ExternalLink className="w-3 h-3 mr-1" /> View on pump.fun
                  </Button>
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-6 text-center">
              <Wallet className="w-8 h-8 mx-auto mb-2 text-green-400" />
              <p className="text-sm text-gray-400">Available Balance</p>
              <p className="text-3xl font-bold text-green-400">
                {walletLoading ? "..." : (wallet?.veddBalance || 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">VEDD tokens</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-6 text-center">
              <Clock className="w-8 h-8 mx-auto mb-2 text-amber-400" />
              <p className="text-sm text-gray-400">Pending Verification</p>
              <p className="text-3xl font-bold text-amber-400">
                {walletLoading ? "..." : (wallet?.pendingBalance || 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Awaiting admin approval</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-6 text-center">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 text-blue-400" />
              <p className="text-sm text-gray-400">Total Earned</p>
              <p className="text-3xl font-bold text-blue-400">
                {walletLoading ? "..." : (wallet?.totalEarned || 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Lifetime earnings</p>
            </CardContent>
          </Card>
        </div>

        {/* Withdraw Button */}
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Withdraw to pump.fun Wallet</h3>
                <p className="text-sm text-gray-400">Transfer your VEDD tokens to your personal Solana wallet</p>
              </div>
              <Dialog open={isWithdrawOpen} onOpenChange={setIsWithdrawOpen}>
                <DialogTrigger asChild>
                  <Button 
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-semibold"
                    disabled={(wallet?.veddBalance || 0) === 0}
                  >
                    <ArrowUpRight className="w-4 h-4 mr-2" />
                    Withdraw Tokens
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-gray-800 border-gray-700">
                  <DialogHeader>
                    <DialogTitle className="text-white">Withdraw VEDD Tokens</DialogTitle>
                    <DialogDescription className="text-gray-400">
                      Enter the amount and your pump.fun wallet address to withdraw your tokens.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Amount to Withdraw</label>
                      <Input
                        type="number"
                        placeholder="Enter amount"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="bg-gray-700 border-gray-600 text-white"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Available: {(wallet?.veddBalance || 0).toLocaleString()} VEDD
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">pump.fun Wallet Address</label>
                      <Input
                        placeholder="Enter your Solana wallet address"
                        value={destinationWallet}
                        onChange={(e) => setDestinationWallet(e.target.value)}
                        className="bg-gray-700 border-gray-600 text-white font-mono text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Use the wallet connected to your pump.fun account
                      </p>
                    </div>
                    <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
                        <div className="text-xs text-amber-300">
                          <p className="font-semibold mb-1">Important:</p>
                          <ul className="list-disc list-inside space-y-1 text-amber-200/80">
                            <li>Withdrawals require admin verification</li>
                            <li>Processing may take 24-48 hours</li>
                            <li>Double-check your wallet address</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsWithdrawOpen(false)} className="border-gray-600">
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleWithdraw}
                      disabled={withdrawMutation.isPending}
                      className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-semibold"
                    >
                      {withdrawMutation.isPending ? "Processing..." : "Request Withdrawal"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {/* Withdrawal History */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <History className="w-5 h-5 text-blue-400" />
              Withdrawal History
            </CardTitle>
            <CardDescription>Track your withdrawal requests</CardDescription>
          </CardHeader>
          <CardContent>
            {withdrawalsLoading ? (
              <p className="text-gray-400 text-center py-4">Loading...</p>
            ) : !withdrawals || withdrawals.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No withdrawal requests yet</p>
            ) : (
              <div className="space-y-3">
                {withdrawals.map((w: any) => (
                  <div key={w.id} className="bg-gray-900 rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ArrowUpRight className="w-5 h-5 text-amber-400" />
                      <div>
                        <p className="text-white font-semibold">{w.amount.toLocaleString()} VEDD</p>
                        <p className="text-xs text-gray-500 font-mono">
                          To: {w.destinationWallet.slice(0, 8)}...{w.destinationWallet.slice(-4)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(w.requestedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(w.status)}
                      {w.solanaTransactionSig && (
                        <a 
                          href={`https://solscan.io/tx/${w.solanaTransactionSig}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline block mt-1"
                        >
                          View Transaction
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* How it works */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4">
                <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <ArrowDownLeft className="w-5 h-5 text-green-400" />
                </div>
                <h4 className="font-semibold text-white mb-1">1. Earn VEDD</h4>
                <p className="text-sm text-gray-400">Complete challenges, host events, and participate in ambassador activities</p>
              </div>
              <div className="text-center p-4">
                <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-5 h-5 text-amber-400" />
                </div>
                <h4 className="font-semibold text-white mb-1">2. Admin Verification</h4>
                <p className="text-sm text-gray-400">Rewards are verified by admin before adding to your available balance</p>
              </div>
              <div className="text-center p-4">
                <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <ArrowUpRight className="w-5 h-5 text-blue-400" />
                </div>
                <h4 className="font-semibold text-white mb-1">3. Withdraw Anytime</h4>
                <p className="text-sm text-gray-400">Transfer your verified tokens to your pump.fun Solana wallet</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
