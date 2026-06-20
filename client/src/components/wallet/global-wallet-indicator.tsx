/**
 * GlobalWalletIndicator — compact header chip
 * Shows connection status, truncated address, network, copy + disconnect
 */
import { useState, useCallback } from 'react';
import { useSolanaWallet } from '@/hooks/use-solana-wallet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Wallet, Copy, CheckCheck, LogOut, RefreshCw, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function truncate(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function GlobalWalletIndicator() {
  const { connected, connecting, walletData, connect, disconnect, error, availableWallets, refreshWalletData } = useSolanaWallet();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleCopy = useCallback(() => {
    if (!walletData?.address) return;
    navigator.clipboard.writeText(walletData.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [walletData?.address]);

  const handleConnect = useCallback(async () => {
    setRetrying(true);
    try {
      await connect('phantom');
    } catch (e: any) {
      toast({ title: 'Wallet connection failed', description: e?.message || 'Please unlock Phantom and try again.', variant: 'destructive' });
    } finally {
      setRetrying(false);
    }
  }, [connect, toast]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
    toast({ title: 'Wallet disconnected', description: 'Your Solana wallet has been disconnected.' });
  }, [disconnect, toast]);

  // Not connected
  if (!connected) {
    // Note: the "Open in Phantom" mobile deep-link now lives in the header hamburger menu.
    return (
      <div className="flex items-center gap-1.5">
        {error && (
          <span title={error} className="text-red-400 flex items-center gap-1 text-xs">
            <AlertCircle className="h-3.5 w-3.5" />
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={connecting || retrying}
          onClick={handleConnect}
          className="h-7 px-2.5 text-xs rounded-xl border-purple-500/40 text-purple-300 hover:bg-purple-500/10 hover:border-purple-400 gap-1"
        >
          {(connecting || retrying) ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Wallet className="h-3 w-3" />
          )}
          {connecting ? 'Connecting…' : 'Connect Wallet'}
        </Button>
      </div>
    );
  }

  const addr = walletData?.address || '';
  const sol = walletData?.solBalance?.toFixed(3) ?? '—';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 h-7 px-2.5 rounded-xl border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 transition-all text-xs text-green-300 font-mono">
          {/* Green connected dot */}
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
          <span className="hidden sm:inline">{truncate(addr)}</span>
          {/* Network badge */}
          <Badge variant="outline" className="h-4 px-1 text-[9px] border-green-600/40 text-green-400 font-normal rounded">
            Mainnet
          </Badge>
          <span className="hidden md:inline text-green-500/70">{sol} SOL</span>
          <ChevronDown className="h-3 w-3 text-green-500/50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <div className="px-3 py-2">
          <p className="text-xs text-muted-foreground mb-0.5">Connected Wallet</p>
          <p className="text-xs font-mono text-green-400 break-all">{addr}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-muted-foreground">{sol} SOL</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1 border-green-600/40 text-green-400">Mainnet</Badge>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopy} className="cursor-pointer text-xs gap-2">
          {copied ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy Address'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => refreshWalletData()} className="cursor-pointer text-xs gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Balance
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDisconnect} className="cursor-pointer text-xs gap-2 text-red-400 focus:text-red-400">
          <LogOut className="h-3.5 w-3.5" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
