import { createJupiterApiClient, QuoteResponse } from '@jup-ag/api';
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const SOLANA_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
];
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const getWorkingConnection = async (): Promise<Connection> => {
  for (const rpc of SOLANA_RPC_ENDPOINTS) {
    try {
      const connection = new Connection(rpc, 'confirmed');
      await connection.getSlot();
      return connection;
    } catch {
      continue;
    }
  }
  return new Connection(SOLANA_RPC_ENDPOINTS[0], 'confirmed');
};

const jupiterQuoteApi = createJupiterApiClient();

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  outputAmount: number;
  priceImpactPct: number;
  slippageBps: number;
  routePlan: string[];
  quote: QuoteResponse;
}

export interface SwapResult {
  success: boolean;
  signature?: string;
  error?: string;
  inputAmount: number;
  outputAmount: number;
}

export async function getSwapQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  slippageBps: number = 100
): Promise<SwapQuote | null> {
  try {
    const quote = await jupiterQuoteApi.quoteGet({
      inputMint,
      outputMint,
      amount: amountLamports,
      slippageBps,
      swapMode: 'ExactIn',
    });

    if (!quote) {
      console.error('No quote available');
      return null;
    }

    return {
      inputMint,
      outputMint,
      inputAmount: parseInt(quote.inAmount) / 1e9,
      outputAmount: parseInt(quote.outAmount),
      priceImpactPct: parseFloat(quote.priceImpactPct || '0'),
      slippageBps,
      routePlan: quote.routePlan?.map(r => r.swapInfo?.label || 'Unknown') || [],
      quote,
    };
  } catch (error) {
    console.error('Failed to get swap quote:', error);
    return null;
  }
}

export async function executeSwap(
  quote: QuoteResponse,
  userPublicKey: string,
  signAndSendTransaction: (tx: VersionedTransaction) => Promise<string | null>
): Promise<SwapResult> {
  try {
    const swapResult = await jupiterQuoteApi.swapPost({
      swapRequest: {
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
      },
    });

    if (!swapResult || !swapResult.swapTransaction) {
      return {
        success: false,
        error: 'Failed to create swap transaction',
        inputAmount: parseInt(quote.inAmount) / 1e9,
        outputAmount: parseInt(quote.outAmount),
      };
    }

    const swapTransactionBuf = base64ToUint8Array(swapResult.swapTransaction);
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    const signature = await signAndSendTransaction(transaction);

    if (!signature) {
      return {
        success: false,
        error: 'Transaction signing was rejected',
        inputAmount: parseInt(quote.inAmount) / 1e9,
        outputAmount: parseInt(quote.outAmount),
      };
    }

    return {
      success: true,
      signature,
      inputAmount: parseInt(quote.inAmount) / 1e9,
      outputAmount: parseInt(quote.outAmount),
    };
  } catch (error: any) {
    console.error('Swap execution failed:', error);
    return {
      success: false,
      error: error.message || 'Swap failed',
      inputAmount: parseInt(quote.inAmount) / 1e9,
      outputAmount: parseInt(quote.outAmount),
    };
  }
}

export async function buyToken(
  tokenMint: string,
  solAmount: number,
  signAndSendTransaction: (tx: VersionedTransaction) => Promise<string | null>,
  userPublicKey: string,
  slippageBps: number = 100
): Promise<SwapResult> {
  const lamports = Math.floor(solAmount * 1e9);
  
  const quote = await getSwapQuote(SOL_MINT, tokenMint, lamports, slippageBps);
  if (!quote) {
    return {
      success: false,
      error: 'Could not get swap quote',
      inputAmount: solAmount,
      outputAmount: 0,
    };
  }

  return executeSwap(quote.quote, userPublicKey, signAndSendTransaction);
}

export async function sellToken(
  tokenMint: string,
  tokenAmount: number,
  tokenDecimals: number,
  signAndSendTransaction: (tx: VersionedTransaction) => Promise<string | null>,
  userPublicKey: string,
  slippageBps: number = 100
): Promise<SwapResult> {
  const amountInSmallestUnit = Math.floor(tokenAmount * Math.pow(10, tokenDecimals));
  
  const quote = await getSwapQuote(tokenMint, SOL_MINT, amountInSmallestUnit, slippageBps);
  if (!quote) {
    return {
      success: false,
      error: 'Could not get swap quote',
      inputAmount: tokenAmount,
      outputAmount: 0,
    };
  }

  return executeSwap(quote.quote, userPublicKey, signAndSendTransaction);
}

export async function getTokenPrice(tokenMint: string): Promise<number | null> {
  try {
    const quote = await getSwapQuote(tokenMint, SOL_MINT, 1e9, 100);
    if (quote) {
      return quote.outputAmount / 1e9;
    }
    return null;
  } catch {
    return null;
  }
}
