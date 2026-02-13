import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Check, X, Coins, Award, RefreshCw, ExternalLink, Crown, Shield, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSolanaWallet } from '@/hooks/use-solana-wallet';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

interface WalletLoginButtonProps {
  onWalletLogin?: (walletData: { address: string; veddBalance: number; isAmbassador: boolean }) => void;
  className?: string;
}

const TIER_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: any; description: string }> = {
  elite: { label: 'Elite', color: 'text-amber-300', bgColor: 'bg-amber-500/20', borderColor: 'border-amber-500/30', icon: Crown, description: 'VEDD NFT Holder - Full Access' },
  pro: { label: 'Pro', color: 'text-purple-300', bgColor: 'bg-purple-500/20', borderColor: 'border-purple-500/30', icon: Shield, description: '500+ VEDD Tokens' },
  basic: { label: 'Basic', color: 'text-blue-300', bgColor: 'bg-blue-500/20', borderColor: 'border-blue-500/30', icon: Star, description: '100+ VEDD Tokens' },
  none: { label: 'No Membership', color: 'text-gray-400', bgColor: 'bg-gray-500/10', borderColor: 'border-gray-700/30', icon: Coins, description: 'Hold VEDD tokens or NFT for access' },
};

export function WalletLoginButton({ onWalletLogin, className }: WalletLoginButtonProps) {
  const { connected, connecting, walletData, connect, disconnect, signMessage, refreshWalletData, error } = useSolanaWallet();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showWalletOptions, setShowWalletOptions] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleConnect = async (type: 'phantom' | 'pumpfun') => {
    setShowWalletOptions(false);
    await connect(type);
  };

  const handleAuthenticate = async () => {
    if (!walletData) return;

    try {
      setIsAuthenticating(true);

      const message = `AI Trading Vault Wallet Authentication\nWallet: ${walletData.address}\nTimestamp: ${Date.now()}`;
      const signature = await signMessage(message);

      if (!signature) {
        toast({
          title: "Signature Required",
          description: "Please sign the message to authenticate",
          variant: "destructive",
        });
        return;
      }

      const response = await apiRequest('POST', '/api/wallet/authenticate', {
        walletAddress: walletData.address,
        signature,
        message,
        veddBalance: walletData.veddBalance,
        isAmbassador: walletData.isAmbassador,
        ambassadorNftMint: walletData.ambassadorNftMint,
      });

      const data = await response.json();

      if (data.success) {
        // Refresh user data to reflect logged in state
        await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
        await queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
        
        toast({
          title: data.isNewUser ? "Account Created!" : "Wallet Connected",
          description: walletData.veddBalance > 0 
            ? `Welcome! You have ${walletData.veddBalance.toLocaleString()} VEDD tokens`
            : data.isNewUser ? "Your account has been created using your wallet" : "Wallet authenticated successfully",
        });

        if (onWalletLogin) {
          onWalletLogin({
            address: walletData.address,
            veddBalance: walletData.veddBalance,
            isAmbassador: walletData.isAmbassador,
          });
        }

        // Redirect to dashboard after successful login
        setLocation('/dashboard');
      } else {
        throw new Error(data.error || 'Authentication failed');
      }
    } catch (err: any) {
      console.error('Authentication error:', err);
      toast({
        title: "Authentication Failed",
        description: err.message || "Failed to authenticate wallet",
        variant: "destructive",
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  if (!connected) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={className}
      >
        {!showWalletOptions ? (
          <Button
            onClick={() => setShowWalletOptions(true)}
            disabled={connecting}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-6 rounded-xl shadow-lg shadow-purple-500/30 flex items-center justify-center gap-3"
          >
            {connecting ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Wallet className="h-5 w-5" />
                Connect Wallet
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm text-center mb-2">Choose your wallet</p>
            <Button
              onClick={() => handleConnect('phantom')}
              disabled={connecting}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-4 rounded-xl shadow-lg shadow-purple-500/30 flex items-center justify-center gap-3"
            >
              <Wallet className="h-5 w-5" />
              Phantom Wallet
            </Button>
            <a 
              href="https://pump.fun/coin/Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump" 
              target="_blank" 
              rel="noopener noreferrer"
              className="block"
            >
              <Button
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold py-4 rounded-xl shadow-lg shadow-green-500/30 flex items-center justify-center gap-3"
              >
                <ExternalLink className="h-5 w-5" />
                Buy VEDD on Pump.fun
              </Button>
            </a>
            <button 
              onClick={() => setShowWalletOptions(false)}
              className="w-full text-gray-400 text-sm hover:text-white transition-colors py-2"
            >
              Cancel
            </button>
          </div>
        )}
        {error && (
          <p className="text-red-400 text-sm mt-2 text-center">{error}</p>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`space-y-4 ${className}`}
    >
      <div className="bg-gray-800/60 backdrop-blur-sm border border-purple-500/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-400 text-sm font-medium">Connected</span>
          </div>
          <button
            onClick={refreshWalletData}
            className="text-gray-400 hover:text-white transition-colors"
            title="Refresh balances"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-white font-medium">
              {walletData ? shortenAddress(walletData.address) : '...'}
            </p>
            <p className="text-gray-400 text-sm">
              {walletData?.solBalance?.toFixed(4) || '0'} SOL
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900/50 rounded-lg p-3 border border-amber-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Coins className="h-4 w-4 text-amber-400" />
              <span className="text-amber-400 text-xs font-medium">VEDD</span>
            </div>
            <p className="text-white font-bold text-lg">
              {walletData?.veddBalance?.toLocaleString() || '0'}
            </p>
          </div>

          <div className={`rounded-lg p-3 border ${walletData?.isAmbassador ? 'bg-green-900/30 border-green-500/30' : 'bg-gray-900/50 border-gray-700/30'}`}>
            <div className="flex items-center gap-2 mb-1">
              <Award className="h-4 w-4 text-green-400" />
              <span className="text-green-400 text-xs font-medium">Ambassador</span>
            </div>
            <p className="text-white font-bold text-lg flex items-center gap-1">
              {walletData?.isAmbassador ? (
                <>
                  <Check className="h-4 w-4 text-green-400" />
                  <span className="text-green-400">Verified</span>
                </>
              ) : (
                <>
                  <X className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-400">None</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Membership Tier Display */}
        {(() => {
          const tier = walletData?.membershipTier || 'none';
          const config = TIER_CONFIG[tier] || TIER_CONFIG.none;
          const TierIcon = config.icon;
          return (
            <div className={`mt-3 p-3 rounded-lg border ${config.bgColor} ${config.borderColor}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TierIcon className={`h-5 w-5 ${config.color}`} />
                  <div>
                    <p className={`font-bold text-sm ${config.color}`}>
                      {tier !== 'none' ? `${config.label} Member` : 'No Membership'}
                    </p>
                    <p className="text-xs text-gray-400">{config.description}</p>
                  </div>
                </div>
                {tier !== 'none' && (
                  <Badge className={`${config.bgColor} ${config.color} ${config.borderColor} border text-xs`}>
                    Active
                  </Badge>
                )}
              </div>
              {tier === 'none' && (
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  <div className="bg-blue-500/10 rounded p-1">
                    <p className="text-blue-300 text-xs font-bold">100+</p>
                    <p className="text-gray-500 text-[10px]">Basic</p>
                  </div>
                  <div className="bg-purple-500/10 rounded p-1">
                    <p className="text-purple-300 text-xs font-bold">500+</p>
                    <p className="text-gray-500 text-[10px]">Pro</p>
                  </div>
                  <div className="bg-amber-500/10 rounded p-1">
                    <p className="text-amber-300 text-xs font-bold">NFT</p>
                    <p className="text-gray-500 text-[10px]">Elite</p>
                  </div>
                </div>
              )}
              {tier === 'basic' && walletData?.veddBalance !== undefined && (
                <p className="text-xs text-gray-400 mt-1">Hold {500 - Math.floor(walletData.veddBalance)} more VEDD for Pro tier</p>
              )}
            </div>
          );
        })()}
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleAuthenticate}
          disabled={isAuthenticating}
          className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold py-5 rounded-xl"
        >
          {isAuthenticating ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Authenticating...
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Sign & Login
            </>
          )}
        </Button>

        <Button
          onClick={disconnect}
          variant="outline"
          className="px-4 py-5 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}
