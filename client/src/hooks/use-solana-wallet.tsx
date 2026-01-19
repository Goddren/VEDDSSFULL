import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

interface SolanaProvider {
  isPhantom?: boolean;
  isPumpFun?: boolean;
  publicKey?: { toString: () => string; toBytes: () => Uint8Array };
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>;
  disconnect: () => Promise<void>;
  signMessage?: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback: (...args: any[]) => void) => void;
}

type WalletType = 'phantom' | 'pumpfun' | null;

interface WalletData {
  address: string;
  solBalance: number;
  veddBalance: number;
  isAmbassador: boolean;
  ambassadorNftMint: string | null;
}

interface WalletContextType {
  connected: boolean;
  connecting: boolean;
  walletData: WalletData | null;
  walletType: WalletType;
  connect: (type?: WalletType) => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string | null>;
  refreshWalletData: () => Promise<void>;
  error: string | null;
  availableWallets: WalletType[];
}

const WalletContext = createContext<WalletContextType | null>(null);

const VEDD_TOKEN_MINT = 'Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump';
const AMBASSADOR_NFT_COLLECTION = 'VEDDAMBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

const getPhantomProvider = (): SolanaProvider | null => {
  if (typeof window === 'undefined') return null;
  const anyWindow = window as any;
  if (anyWindow.solana?.isPhantom) {
    return anyWindow.solana;
  }
  if (anyWindow.phantom?.solana?.isPhantom) {
    return anyWindow.phantom.solana;
  }
  return null;
};

const getPumpFunProvider = (): SolanaProvider | null => {
  if (typeof window === 'undefined') return null;
  const anyWindow = window as any;
  // pump.fun wallet injects as window.pumpPortal or similar
  if (anyWindow.pumpPortal?.solana) {
    return { ...anyWindow.pumpPortal.solana, isPumpFun: true };
  }
  // Also check standard Wallet Standard providers
  if (anyWindow.solana && !anyWindow.solana.isPhantom) {
    // Generic Solana wallet that's not Phantom
    return anyWindow.solana;
  }
  return null;
};

const getAvailableWallets = (): WalletType[] => {
  const wallets: WalletType[] = [];
  if (getPhantomProvider()) wallets.push('phantom');
  if (getPumpFunProvider()) wallets.push('pumpfun');
  return wallets;
};

const getProvider = (type: WalletType): SolanaProvider | null => {
  if (type === 'phantom') return getPhantomProvider();
  if (type === 'pumpfun') return getPumpFunProvider();
  return getPhantomProvider() || getPumpFunProvider();
};

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [walletType, setWalletType] = useState<WalletType>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableWallets, setAvailableWallets] = useState<WalletType[]>([]);

  useEffect(() => {
    const checkWallets = () => setAvailableWallets(getAvailableWallets());
    checkWallets();
    const interval = setInterval(checkWallets, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchTokenBalances = useCallback(async (address: string): Promise<Partial<WalletData>> => {
    try {
      const connection = new Connection(SOLANA_RPC, 'confirmed');
      const publicKey = new PublicKey(address);
      const solBalance = await connection.getBalance(publicKey);
      
      let veddBalance = 0;
      let isAmbassador = false;
      let ambassadorNftMint: string | null = null;

      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
        });

        for (const account of tokenAccounts.value) {
          const parsedInfo = account.account.data.parsed.info;
          const mint = parsedInfo.mint;
          const balance = parsedInfo.tokenAmount.uiAmount || 0;

          if (mint === VEDD_TOKEN_MINT) {
            veddBalance = balance;
          }
          
          if (mint.startsWith('VEDDAMB') || parsedInfo.tokenAmount.decimals === 0) {
            const nftBalance = parsedInfo.tokenAmount.amount;
            if (nftBalance === '1') {
              isAmbassador = true;
              ambassadorNftMint = mint;
            }
          }
        }
      } catch (tokenError) {
        console.log('Token fetch skipped (may be devnet or no tokens):', tokenError);
      }

      return {
        solBalance: solBalance / LAMPORTS_PER_SOL,
        veddBalance,
        isAmbassador,
        ambassadorNftMint,
      };
    } catch (err) {
      console.error('Error fetching token balances:', err);
      return { solBalance: 0, veddBalance: 0, isAmbassador: false, ambassadorNftMint: null };
    }
  }, []);

  const refreshWalletData = useCallback(async () => {
    const provider = getProvider(walletType);
    if (!provider?.publicKey) return;

    const address = provider.publicKey.toString();
    const balances = await fetchTokenBalances(address);
    
    setWalletData({
      address,
      solBalance: balances.solBalance || 0,
      veddBalance: balances.veddBalance || 0,
      isAmbassador: balances.isAmbassador || false,
      ambassadorNftMint: balances.ambassadorNftMint || null,
    });
  }, [fetchTokenBalances, walletType]);

  const connect = useCallback(async (type?: WalletType) => {
    const targetType = type || 'phantom';
    const provider = getProvider(targetType);
    
    if (!provider) {
      if (targetType === 'pumpfun') {
        setError('Please install pump.fun wallet to connect');
        window.open('https://pump.fun/', '_blank');
      } else {
        setError('Please install Phantom wallet to connect');
        window.open('https://phantom.app/', '_blank');
      }
      return;
    }

    try {
      setConnecting(true);
      setError(null);

      const response = await provider.connect();
      const address = response.publicKey.toString();

      const balances = await fetchTokenBalances(address);

      setWalletData({
        address,
        solBalance: balances.solBalance || 0,
        veddBalance: balances.veddBalance || 0,
        isAmbassador: balances.isAmbassador || false,
        ambassadorNftMint: balances.ambassadorNftMint || null,
      });

      setWalletType(targetType);
      setConnected(true);
    } catch (err: any) {
      console.error('Wallet connection error:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setConnecting(false);
    }
  }, [fetchTokenBalances]);

  const disconnect = useCallback(async () => {
    const provider = getProvider(walletType);
    if (provider) {
      try {
        await provider.disconnect();
      } catch (err) {
        console.error('Disconnect error:', err);
      }
    }
    setConnected(false);
    setWalletData(null);
    setWalletType(null);
    setError(null);
  }, [walletType]);

  const signMessage = useCallback(async (message: string): Promise<string | null> => {
    const provider = getProvider(walletType);
    if (!provider || !provider.signMessage) {
      setError('Wallet does not support message signing');
      return null;
    }

    try {
      const encodedMessage = new TextEncoder().encode(message);
      const { signature } = await provider.signMessage(encodedMessage, 'utf8');
      // Convert Uint8Array to base64 using browser-native approach
      const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)));
      return base64Signature;
    } catch (err: any) {
      console.error('Sign message error:', err);
      setError(err.message || 'Failed to sign message');
      return null;
    }
  }, [walletType]);

  useEffect(() => {
    const provider = getPhantomProvider();
    if (!provider) return;

    const handleConnect = () => {
      if (provider.publicKey) {
        refreshWalletData();
        setConnected(true);
      }
    };

    const handleDisconnect = () => {
      setConnected(false);
      setWalletData(null);
    };

    const handleAccountChange = () => {
      if (provider.publicKey) {
        refreshWalletData();
      } else {
        setConnected(false);
        setWalletData(null);
      }
    };

    provider.on('connect', handleConnect);
    provider.on('disconnect', handleDisconnect);
    provider.on('accountChanged', handleAccountChange);

    provider.connect({ onlyIfTrusted: true }).catch(() => {});

    return () => {
      provider.off('connect', handleConnect);
      provider.off('disconnect', handleDisconnect);
      provider.off('accountChanged', handleAccountChange);
    };
  }, [refreshWalletData]);

  return (
    <WalletContext.Provider
      value={{
        connected,
        connecting,
        walletData,
        walletType,
        connect,
        disconnect,
        signMessage,
        refreshWalletData,
        error,
        availableWallets,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useSolanaWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useSolanaWallet must be used within a SolanaWalletProvider');
  }
  return context;
}
