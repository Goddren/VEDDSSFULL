import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Loader2, Copy, CheckCircle2, ExternalLink, Coins } from 'lucide-react';

interface VeddPaymentButtonProps {
  planId: number;
  planName: string;
  priceUsd: number;
  disabled?: boolean;
}

interface PaymentSession {
  id: string;
  planName: string;
  veddAmount: number;
  receiverWallet: string;
  expiresAt: string;
}

export default function VeddPaymentButton({ planId, planName, priceUsd, disabled }: VeddPaymentButtonProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(null);
  const [transactionSignature, setTransactionSignature] = useState('');
  const [copied, setCopied] = useState(false);

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/vedd/create-session', { planId, planName, priceUsd });
      return res.json();
    },
    onSuccess: (data) => {
      setPaymentSession(data.session);
      setDialogOpen(true);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create payment session',
        variant: 'destructive',
      });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!paymentSession) throw new Error('No payment session');
      const res = await apiRequest('POST', '/api/vedd/verify-payment', {
        sessionId: paymentSession.id,
        transactionSignature,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.verified) {
        toast({
          title: 'Payment Verified!',
          description: `Welcome to ${planName}! Your subscription is now active.`,
        });
        setDialogOpen(false);
        setPaymentSession(null);
        setTransactionSignature('');
        queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
        queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      } else {
        toast({
          title: 'Verification Failed',
          description: data.error || 'Could not verify your payment',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Verification Error',
        description: error.message || 'Failed to verify payment',
        variant: 'destructive',
      });
    },
  });

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied!', description: 'Wallet address copied to clipboard' });
  };

  return (
    <>
      <Button
        onClick={() => createSessionMutation.mutate()}
        disabled={disabled || createSessionMutation.isPending}
        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
        data-testid={`button-vedd-pay-${planName}`}
      >
        {createSessionMutation.isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Coins className="w-4 h-4 mr-2" />
        )}
        Pay with VEDD Token
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-purple-500" />
              Pay with VEDD Token
            </DialogTitle>
            <DialogDescription>
              Send VEDD tokens to upgrade to {planName}
            </DialogDescription>
          </DialogHeader>

          {paymentSession && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">Amount to Send</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {paymentSession.veddAmount.toLocaleString()} VEDD
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Send to this wallet address:</Label>
                <div className="flex gap-2">
                  <Input
                    value={paymentSession.receiverWallet}
                    readOnly
                    className="font-mono text-xs"
                    data-testid="input-receiver-wallet"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(paymentSession.receiverWallet)}
                    data-testid="button-copy-wallet"
                  >
                    {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Important:</strong> Send exactly {paymentSession.veddAmount.toLocaleString()} VEDD tokens 
                  from your Solana wallet (Phantom, Solflare, etc.)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tx-signature">After sending, paste your transaction signature:</Label>
                <Input
                  id="tx-signature"
                  placeholder="Transaction signature (starts with numbers/letters)"
                  value={transactionSignature}
                  onChange={(e) => setTransactionSignature(e.target.value)}
                  data-testid="input-transaction-signature"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open('https://solscan.io', '_blank')}
                  data-testid="button-view-solscan"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View on Solscan
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600"
                  onClick={() => verifyMutation.mutate()}
                  disabled={!transactionSignature || verifyMutation.isPending}
                  data-testid="button-verify-payment"
                >
                  {verifyMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Verify Payment
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Session expires: {new Date(paymentSession.expiresAt).toLocaleTimeString()}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
