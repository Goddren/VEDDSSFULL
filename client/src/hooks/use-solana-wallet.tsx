import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: { toString: () => string; toBytes: () => Uint8Array };
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>;
  disconnect: () => Promise<void>;
  signMessage?: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback: (...args: any[]) => void) => void;
}

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
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string | null>;
  refreshWalletData: () => Promise<void>;
  error: string | null;
}

const WalletContext = createContext<WalletContextType | null>(null);

const VEDD_TOKEN_MINT = 'VEDDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const AMBASSADOR_NFT_COLLECTION = 'VEDDAMBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

const getPhantomProvider = (): PhantomProvider | null => {
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

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    const provider = getPhantomProvider();
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
  }, [fetchTokenBalances]);

  const connect = useCallback(async () => {
    const provider = getPhantomProvider();
    
    if (!provider) {
      setError('Please install Phantom wallet to connect');
      window.open('https://phantom.app/', '_blank');
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

      setConnected(true);
    } catch (err: any) {
      console.error('Wallet connection error:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setConnecting(false);
    }
  }, [fetchTokenBalances]);

  const disconnect = useCallback(async () => {
    const provider = getPhantomProvider();
    if (provider) {
      try {
        await provider.disconnect();
      } catch (err) {
        console.error('Disconnect error:', err);
      }
    }
    setConnected(false);
    setWalletData(null);
    setError(null);
  }, []);

  const signMessage = useCallback(async (message: string): Promise<string | null> => {
    const provider = getPhantomProvider();
    if (!provider || !provider.signMessage) {
      setError('Wallet does not support message signing');
      return null;
    }

    try {
      const encodedMessage = new TextEncoder().encode(message);
      const { signature } = await provider.signMessage(encodedMessage, 'utf8');
      return Buffer.from(signature).toString('base64');
    } catch (err: any) {
      console.error('Sign message error:', err);
      setError(err.message || 'Failed to sign message');
      return null;
    }
  }, []);

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
        connect,
        disconnect,
        signMessage,
        refreshWalletData,
        error,
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
