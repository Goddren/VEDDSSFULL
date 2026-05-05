import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction, Transaction } from '@solana/web3.js';

interface SolanaProvider {
  isPhantom?: boolean;
  isPumpFun?: boolean;
  publicKey?: { toString: () => string; toBytes: () => Uint8Array };
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>;
  disconnect: () => Promise<void>;
  signMessage?: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
  signTransaction?: (transaction: VersionedTransaction | Transaction) => Promise<VersionedTransaction | Transaction>;
  signAndSendTransaction?: (transaction: VersionedTransaction | Transaction, options?: any) => Promise<{ signature: string }>;
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
  membershipTier: string;
  hasVeddNft: boolean;
  membershipNftMint: string | null;
}

interface WalletContextType {
  connected: boolean;
  connecting: boolean;
  walletData: WalletData | null;
  walletType: WalletType;
  connect: (type?: WalletType) => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string | null>;
  signAndSendTransaction: (transaction: VersionedTransaction) => Promise<string | null>;
  refreshWalletData: () => Promise<void>;
  error: string | null;
  availableWallets: WalletType[];
  getConnection: () => Connection;
  getPublicKey: () => PublicKey | null;
}

const WalletContext = createContext<WalletContextType | null>(null);

const VEDD_TOKEN_MINT = 'Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump';
const AMBASSADOR_NFT_COLLECTION = 'VEDDAMBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const SOLANA_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana.public-rpc.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
];

const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
};

const isInsidePhantomBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Phantom in-app browser adds "Phantom" to the user agent string
  return /Phantom/i.test(ua) || !!(window as any).__phantom__;
};

const getPhantomProvider = (): SolanaProvider | null => {
  if (typeof window === 'undefined') return null;
  const anyWindow = window as any;

  // Check multiple injection points for Phantom (desktop, extension and in-app browser)
  const candidates = [
    anyWindow.phantom?.solana,
    anyWindow.solana,
    anyWindow.phantom,        // some Phantom browser builds expose this directly
  ];

  for (const provider of candidates) {
    if (provider?.isPhantom) {
      return provider;
    }
  }

  // Phantom in-app browser always injects window.solana — use it even without isPhantom flag
  if ((isMobile() || isInsidePhantomBrowser()) && anyWindow.solana) {
    return anyWindow.solana;
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

  // Auto-connect when running inside Phantom's in-app browser
  // The provider is pre-approved so we silently connect without a popup
  useEffect(() => {
    if (!isInsidePhantomBrowser()) return;
    const tryAutoConnect = async () => {
      // Wait for provider injection
      let provider: SolanaProvider | null = null;
      for (let i = 0; i < 6 && !provider; i++) {
        await new Promise(r => setTimeout(r, 300));
        provider = getPhantomProvider();
      }
      if (!provider) return;
      try {
        const response = await provider.connect({ onlyIfTrusted: true });
        const address = response.publicKey.toString();
        // Fetch balances and set state
        const balances = await fetchTokenBalances(address);
        setWalletData({
          address,
          solBalance: balances.solBalance || 0,
          veddBalance: balances.veddBalance || 0,
          isAmbassador: balances.isAmbassador || false,
          ambassadorNftMint: balances.ambassadorNftMint || null,
          membershipTier: balances.membershipTier || 'none',
          hasVeddNft: balances.hasVeddNft || false,
          membershipNftMint: balances.membershipNftMint || null,
        });
        setWalletType('phantom');
        setConnected(true);
      } catch {
        // Not yet trusted — user will need to tap Connect manually, that's fine
      }
    };
    tryAutoConnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTokenBalances = useCallback(async (address: string): Promise<Partial<WalletData>> => {
    let solBalance = 0;
    let veddBalance = 0;
    let isAmbassador = false;
    let ambassadorNftMint: string | null = null;
    let hasVeddNft = false;
    let membershipNftMint: string | null = null;
    let membershipTier = 'none';
    
    console.log('fetchTokenBalances: Fetching for address:', address);
    
    try {
      const balanceRes = await fetch(`/api/solana/balance/${address}`);
      const balanceData = await balanceRes.json();
      if (balanceData.success) {
        solBalance = balanceData.balance || 0;
      }
    } catch (err) {
      console.error('fetchTokenBalances: Failed to fetch SOL balance from server:', err);
    }
    
    try {
      const tokensRes = await fetch(`/api/solana/wallet-tokens/${address}`);
      const tokensData = await tokensRes.json();
      if (tokensData.success && tokensData.tokens) {
        for (const token of tokensData.tokens) {
          if (token.mint === VEDD_TOKEN_MINT) {
            veddBalance = token.uiAmount || 0;
          }
          if (token.mint.startsWith('VEDDAMB') || token.decimals === 0) {
            if (token.uiAmount === 1) {
              isAmbassador = true;
              ambassadorNftMint = token.mint;
            }
          }
          if ((token.mint.startsWith('VEDDNFT') || token.mint.startsWith('VEDDMEM')) && token.uiAmount === 1 && token.decimals === 0) {
            hasVeddNft = true;
            membershipNftMint = token.mint;
          }
        }
      }
    } catch (err) {
      console.error('fetchTokenBalances: Failed to fetch tokens from server:', err);
    }

    if (hasVeddNft) membershipTier = 'elite';
    else if (veddBalance >= 500) membershipTier = 'pro';
    else if (veddBalance >= 100) membershipTier = 'basic';
    else membershipTier = 'none';

    console.log('fetchTokenBalances: Final data -', { solBalance, veddBalance, isAmbassador, membershipTier, hasVeddNft });
    
    return {
      solBalance,
      veddBalance,
      isAmbassador,
      ambassadorNftMint,
      membershipTier,
      hasVeddNft,
      membershipNftMint,
    };
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
      membershipTier: balances.membershipTier || 'none',
      hasVeddNft: balances.hasVeddNft || false,
      membershipNftMint: balances.membershipNftMint || null,
    });
  }, [fetchTokenBalances, walletType]);

  const connect = useCallback(async (type?: WalletType) => {
    const targetType = type || 'phantom';

    // On mobile / Phantom in-app browser, give the provider time to inject (up to 1.5s)
    let provider = getProvider(targetType);
    if (!provider && (isMobile() || isInsidePhantomBrowser())) {
      for (let i = 0; i < 3 && !provider; i++) {
        await new Promise(r => setTimeout(r, 500));
        provider = getProvider(targetType);
      }
    }

    if (!provider) {
      if (targetType === 'pumpfun') {
        setError('Please install pump.fun wallet to connect');
        window.open('https://pump.fun/', '_blank');
      } else {
        setError('Phantom wallet not detected. Please open this site inside the Phantom app browser or install the Phantom extension.');
        // Only open phantom.app on desktop — on mobile the user is already on mobile
        if (!isMobile() && !isInsidePhantomBrowser()) {
          window.open('https://phantom.app/', '_blank');
        }
      }
      return;
    }

    try {
      setConnecting(true);
      setError(null);

      let response: { publicKey: { toString: () => string } };

      // Inside Phantom's in-app browser, try silent auto-connect first (no popup needed
      // if the user previously approved this site). Falls back to explicit connect.
      if (isInsidePhantomBrowser() || isMobile()) {
        try {
          response = await provider.connect({ onlyIfTrusted: true });
        } catch {
          // Site not yet trusted — ask for explicit approval
          response = await provider.connect();
        }
      } else {
        response = await provider.connect();
      }

      const address = response.publicKey.toString();

      const balances = await fetchTokenBalances(address);
      console.log('Wallet connect: Fetched balances:', balances);

      setWalletData({
        address,
        solBalance: balances.solBalance || 0,
        veddBalance: balances.veddBalance || 0,
        isAmbassador: balances.isAmbassador || false,
        ambassadorNftMint: balances.ambassadorNftMint || null,
        membershipTier: balances.membershipTier || 'none',
        hasVeddNft: balances.hasVeddNft || false,
        membershipNftMint: balances.membershipNftMint || null,
      });

      setWalletType(targetType);
      setConnected(true);
      console.log('Wallet connect: Connection complete');
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
      const base64Signature = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(signature))));
      return base64Signature;
    } catch (err: any) {
      console.error('Sign message error:', err);
      setError(err.message || 'Failed to sign message');
      return null;
    }
  }, [walletType]);

  const signAndSendTransaction = useCallback(async (transaction: VersionedTransaction): Promise<string | null> => {
    const provider = getProvider(walletType);
    if (!provider) {
      setError('No wallet connected');
      return null;
    }

    try {
      const connection = new Connection(SOLANA_RPC_ENDPOINTS[0], 'confirmed');
      
      if (provider.signAndSendTransaction) {
        const { signature } = await provider.signAndSendTransaction(transaction);
        return signature;
      } else if (provider.signTransaction) {
        const signedTx = await provider.signTransaction(transaction) as VersionedTransaction;
        const rawTransaction = signedTx.serialize();
        const signature = await connection.sendRawTransaction(rawTransaction, {
          skipPreflight: false,
          maxRetries: 2,
        });
        return signature;
      } else {
        setError('Wallet does not support transaction signing');
        return null;
      }
    } catch (err: any) {
      console.error('Transaction signing error:', err);
      setError(err.message || 'Failed to sign and send transaction');
      return null;
    }
  }, [walletType]);

  const getConnection = useCallback(() => {
    return new Connection(SOLANA_RPC_ENDPOINTS[0], 'confirmed');
  }, []);

  const getPublicKey = useCallback((): PublicKey | null => {
    const provider = getProvider(walletType);
    if (provider?.publicKey) {
      return new PublicKey(provider.publicKey.toString());
    }
    return null;
  }, [walletType]);

  // ── Auto-connect: restore wallet session on page load ──────────
  useEffect(() => {
    let cancelled = false;

    const restoreWallet = async (provider: SolanaProvider, type: WalletType) => {
      if (cancelled) return;
      const address = provider.publicKey!.toString();
      try {
        const balances = await fetchTokenBalances(address);
        if (cancelled) return;
        setWalletData({
          address,
          solBalance: balances.solBalance || 0,
          veddBalance: balances.veddBalance || 0,
          isAmbassador: balances.isAmbassador || false,
          ambassadorNftMint: balances.ambassadorNftMint || null,
          membershipTier: balances.membershipTier || 'none',
          hasVeddNft: balances.hasVeddNft || false,
          membershipNftMint: balances.membershipNftMint || null,
        });
        setWalletType(type);
        setConnected(true);
      } catch {
        // silently ignore on auto-restore
      }
    };

    const tryAutoConnect = async () => {
      // Try Phantom first, then pumpfun
      const walletCandidates: { getter: () => SolanaProvider | null; type: WalletType }[] = [
        { getter: getPhantomProvider, type: 'phantom' },
        { getter: getPumpFunProvider, type: 'pumpfun' },
      ];

      for (const { getter, type } of walletCandidates) {
        const provider = getter();
        if (!provider) continue;

        // Case 1: publicKey already available (trusted site, wallet unlocked)
        if (provider.publicKey) {
          await restoreWallet(provider, type);
          return;
        }

        // Case 2: Provider present but publicKey not yet set — try onlyIfTrusted
        // This silently connects if the user already approved this site, no popup shown.
        try {
          const resp = await provider.connect({ onlyIfTrusted: true });
          if (resp?.publicKey && !cancelled) {
            await restoreWallet(provider, type);
            return;
          }
        } catch {
          // Not trusted yet or wallet locked — that's fine, skip silently
        }
      }
    };

    // Attempt immediately, then retry a few times to handle slow injection
    const delays = [0, 300, 800, 1500, 3000];
    let attemptIdx = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    const attempt = async () => {
      if (cancelled) return;
      await tryAutoConnect();
      // If still not connected, schedule next retry
      if (!cancelled && attemptIdx < delays.length - 1) {
        attemptIdx++;
        timeoutId = setTimeout(attempt, delays[attemptIdx]);
      }
    };

    attempt();

    // ── Wallet event listeners ──────────────────────────────────
    const setupListeners = () => {
      const provider = getPhantomProvider();
      if (!provider) return;

      const handleConnect = () => {
        if (provider.publicKey && !cancelled) {
          const address = provider.publicKey.toString();
          fetchTokenBalances(address).then(balances => {
            if (cancelled) return;
            setWalletData({
              address,
              solBalance: balances.solBalance || 0,
              veddBalance: balances.veddBalance || 0,
              isAmbassador: balances.isAmbassador || false,
              ambassadorNftMint: balances.ambassadorNftMint || null,
              membershipTier: balances.membershipTier || 'none',
              hasVeddNft: balances.hasVeddNft || false,
              membershipNftMint: balances.membershipNftMint || null,
            });
            setWalletType('phantom');
            setConnected(true);
          }).catch(() => {});
        }
      };

      const handleDisconnect = () => {
        if (!cancelled) {
          setConnected(false);
          setWalletData(null);
          setWalletType(null);
        }
      };

      const handleAccountChange = () => {
        if (!cancelled) {
          if (provider.publicKey) {
            setWalletType('phantom');
            refreshWalletData();
          } else {
            setConnected(false);
            setWalletData(null);
            setWalletType(null);
          }
        }
      };

      provider.on('connect', handleConnect);
      provider.on('disconnect', handleDisconnect);
      provider.on('accountChanged', handleAccountChange);

      return () => {
        provider.off('connect', handleConnect);
        provider.off('disconnect', handleDisconnect);
        provider.off('accountChanged', handleAccountChange);
      };
    };

    const cleanup = setupListeners();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      cleanup?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        signAndSendTransaction,
        refreshWalletData,
        error,
        availableWallets,
        getConnection,
        getPublicKey,
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
