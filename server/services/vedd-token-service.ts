import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { db } from '../db';
import { veddPoolWallets, veddTransferJobs, users, veddRewardConfig, ambassadorActionRewards } from '@shared/schema';
import { eq, and, sql, desc, isNull } from 'drizzle-orm';

const VEDD_TOKEN_MINT = process.env.VEDD_TOKEN_MINT || '';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const POOL_WALLET_PRIVATE_KEY = process.env.POOL_WALLET_PRIVATE_KEY;

let connection: Connection | null = null;
let poolKeypair: Keypair | null = null;

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  }
  return connection;
}

function getPoolKeypair(): Keypair | null {
  if (!poolKeypair && POOL_WALLET_PRIVATE_KEY) {
    try {
      const secretKey = JSON.parse(POOL_WALLET_PRIVATE_KEY);
      poolKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    } catch (error) {
      console.error('Failed to parse pool wallet private key:', error);
    }
  }
  return poolKeypair;
}

export interface TransferResult {
  success: boolean;
  transactionSig?: string;
  error?: string;
}

export interface PoolWalletInfo {
  id: number;
  label: string;
  publicKey: string;
  walletType: string;
  status: string;
  tokenBalance: number;
  lowBalanceThreshold: number;
  isLowBalance: boolean;
}

export interface RewardHistoryItem {
  id: number;
  actionType: string;
  totalReward: number;
  status: string;
  transactionSig?: string;
  createdAt: Date;
  metadata?: any;
}

export class VeddTokenService {
  async getPoolWalletInfo(walletType: string = 'rewards'): Promise<PoolWalletInfo | null> {
    const [wallet] = await db.select()
      .from(veddPoolWallets)
      .where(and(
        eq(veddPoolWallets.walletType, walletType),
        eq(veddPoolWallets.status, 'active')
      ))
      .limit(1);

    if (!wallet) return null;

    return {
      id: wallet.id,
      label: wallet.label,
      publicKey: wallet.publicKey,
      walletType: wallet.walletType,
      status: wallet.status,
      tokenBalance: wallet.tokenBalance || 0,
      lowBalanceThreshold: wallet.lowBalanceThreshold || 1000,
      isLowBalance: (wallet.tokenBalance || 0) < (wallet.lowBalanceThreshold || 1000)
    };
  }

  async syncPoolBalance(walletId: number): Promise<number> {
    const conn = getConnection();
    const [wallet] = await db.select()
      .from(veddPoolWallets)
      .where(eq(veddPoolWallets.id, walletId))
      .limit(1);

    if (!wallet || !VEDD_TOKEN_MINT) return 0;

    try {
      const walletPubkey = new PublicKey(wallet.publicKey);
      const mintPubkey = new PublicKey(VEDD_TOKEN_MINT);
      const tokenAccount = await getAssociatedTokenAddress(mintPubkey, walletPubkey);
      
      const accountInfo = await conn.getTokenAccountBalance(tokenAccount);
      const balance = parseFloat(accountInfo.value.uiAmountString || '0');

      await db.update(veddPoolWallets)
        .set({ 
          tokenBalance: balance,
          lastSyncAt: new Date()
        })
        .where(eq(veddPoolWallets.id, walletId));

      return balance;
    } catch (error) {
      console.error('Failed to sync pool balance:', error);
      return wallet.tokenBalance || 0;
    }
  }

  async getRewardConfig(actionType: string): Promise<{ baseAmount: number; streakMultiplier: number; maxDailyRewards: number; requiresVerification: boolean } | null> {
    const [config] = await db.select()
      .from(veddRewardConfig)
      .where(and(
        eq(veddRewardConfig.actionType, actionType),
        eq(veddRewardConfig.isActive, true)
      ))
      .limit(1);

    if (!config) return null;

    return {
      baseAmount: config.baseAmount,
      streakMultiplier: config.streakMultiplier || 1.0,
      maxDailyRewards: config.maxDailyRewards || 5,
      requiresVerification: config.requiresVerification || false
    };
  }

  async calculateReward(actionType: string, userId: number): Promise<{ baseReward: number; bonusReward: number; totalReward: number } | null> {
    const config = await this.getRewardConfig(actionType);
    if (!config) return null;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todaysRewards = await db.select({ count: sql<number>`count(*)` })
      .from(ambassadorActionRewards)
      .where(and(
        eq(ambassadorActionRewards.userId, userId),
        eq(ambassadorActionRewards.actionType, actionType),
        sql`${ambassadorActionRewards.createdAt} >= ${todayStart}`
      ));

    const rewardCount = todaysRewards[0]?.count || 0;
    if (rewardCount >= config.maxDailyRewards) {
      return null;
    }

    const baseReward = config.baseAmount;
    const bonusReward = 0;
    const totalReward = baseReward + bonusReward;

    return { baseReward, bonusReward, totalReward };
  }

  async enqueueReward(
    userId: number,
    actionType: string,
    actionId?: number,
    metadata?: any
  ): Promise<{ rewardId: number; transferJobId?: number; pendingWallet?: boolean } | null> {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      console.log(`User ${userId} not found - cannot enqueue reward`);
      return null;
    }

    const hasWallet = !!user.walletAddress;

    const rewardCalc = await this.calculateReward(actionType, userId);
    if (!rewardCalc) {
      console.log(`No reward available for user ${userId} action ${actionType} - daily limit reached or config missing`);
      return null;
    }

    const config = await this.getRewardConfig(actionType);
    if (!config) return null;

    const poolWallet = await this.getPoolWalletInfo('rewards');
    if (!poolWallet || poolWallet.status !== 'active') {
      console.log('No active pool wallet available');
      return null;
    }

    const idempotencyKey = `${userId}-${actionType}-${actionId || 'none'}-${Date.now()}`;

    const [reward] = await db.insert(ambassadorActionRewards)
      .values({
        userId,
        actionType,
        actionId,
        baseReward: rewardCalc.baseReward,
        bonusReward: rewardCalc.bonusReward,
        totalReward: rewardCalc.totalReward,
        verificationStatus: config.requiresVerification ? 'pending' : 'verified',
        verifiedAt: config.requiresVerification ? null : new Date(),
        notes: hasWallet ? undefined : 'Pending wallet connection - tokens will transfer when user connects Solana wallet'
      })
      .returning();

    if (!config.requiresVerification && hasWallet) {
      const [transferJob] = await db.insert(veddTransferJobs)
        .values({
          userId,
          sourceWalletId: poolWallet.id,
          destinationWallet: user.walletAddress!,
          amount: rewardCalc.totalReward,
          actionType,
          actionId,
          status: 'pending',
          idempotencyKey,
          metadata: metadata || {}
        })
        .returning();

      await db.update(ambassadorActionRewards)
        .set({ transferJobId: transferJob.id })
        .where(eq(ambassadorActionRewards.id, reward.id));

      this.processTransfer(transferJob.id).catch(err => 
        console.error('Background transfer processing error:', err)
      );

      return { rewardId: reward.id, transferJobId: transferJob.id };
    }

    return { rewardId: reward.id, pendingWallet: !hasWallet };
  }

  async processTransfer(jobId: number): Promise<TransferResult> {
    const [job] = await db.select()
      .from(veddTransferJobs)
      .where(eq(veddTransferJobs.id, jobId))
      .limit(1);

    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    if (job.status === 'completed') {
      return { success: true, transactionSig: job.solanaTransactionSig || undefined };
    }

    if (!VEDD_TOKEN_MINT || !POOL_WALLET_PRIVATE_KEY) {
      console.error('CRITICAL: Missing Solana credentials - VEDD_TOKEN_MINT or POOL_WALLET_PRIVATE_KEY not configured');
      await db.update(veddTransferJobs)
        .set({ 
          status: 'failed',
          errorMessage: 'Solana credentials not configured. Please set VEDD_TOKEN_MINT and POOL_WALLET_PRIVATE_KEY environment variables.',
          processedAt: new Date()
        })
        .where(eq(veddTransferJobs.id, jobId));
      
      return { 
        success: false, 
        error: 'Token transfer system not configured. Reward is pending - tokens will be sent once configuration is complete.' 
      };
    }

    await db.update(veddTransferJobs)
      .set({ status: 'processing' })
      .where(eq(veddTransferJobs.id, jobId));

    try {
      const keypair = getPoolKeypair();
      if (!keypair) {
        throw new Error('Pool wallet keypair not available');
      }

      const conn = getConnection();
      const mintPubkey = new PublicKey(VEDD_TOKEN_MINT);
      const destPubkey = new PublicKey(job.destinationWallet);

      const sourceAta = await getAssociatedTokenAddress(mintPubkey, keypair.publicKey);
      const destAta = await getOrCreateAssociatedTokenAccount(
        conn,
        keypair,
        mintPubkey,
        destPubkey
      );

      const decimals = 9;
      const amount = Math.floor(job.amount * Math.pow(10, decimals));

      const transaction = new Transaction().add(
        createTransferInstruction(
          sourceAta,
          destAta.address,
          keypair.publicKey,
          amount,
          [],
          TOKEN_PROGRAM_ID
        )
      );

      const signature = await sendAndConfirmTransaction(conn, transaction, [keypair]);

      await db.update(veddTransferJobs)
        .set({ 
          status: 'completed',
          solanaTransactionSig: signature,
          processedAt: new Date()
        })
        .where(eq(veddTransferJobs.id, jobId));

      await db.update(users)
        .set({ 
          veddTokenBalance: sql`COALESCE(${users.veddTokenBalance}, 0) + ${job.amount}`
        })
        .where(eq(users.id, job.userId));

      return { success: true, transactionSig: signature };

    } catch (error: any) {
      const retryCount = (job.retryCount || 0) + 1;
      const maxRetries = 3;

      await db.update(veddTransferJobs)
        .set({ 
          status: retryCount >= maxRetries ? 'failed' : 'pending',
          errorMessage: error.message,
          retryCount
        })
        .where(eq(veddTransferJobs.id, jobId));

      return { success: false, error: error.message };
    }
  }

  async getUserRewardHistory(userId: number, limit: number = 50): Promise<RewardHistoryItem[]> {
    const rewards = await db.select({
      id: ambassadorActionRewards.id,
      actionType: ambassadorActionRewards.actionType,
      totalReward: ambassadorActionRewards.totalReward,
      verificationStatus: ambassadorActionRewards.verificationStatus,
      createdAt: ambassadorActionRewards.createdAt,
      transferJobId: ambassadorActionRewards.transferJobId,
    })
      .from(ambassadorActionRewards)
      .where(eq(ambassadorActionRewards.userId, userId))
      .orderBy(desc(ambassadorActionRewards.createdAt))
      .limit(limit);

    const result: RewardHistoryItem[] = [];
    for (const reward of rewards) {
      let status = reward.verificationStatus;
      let transactionSig: string | undefined;

      if (reward.transferJobId) {
        const [job] = await db.select()
          .from(veddTransferJobs)
          .where(eq(veddTransferJobs.id, reward.transferJobId))
          .limit(1);
        
        if (job) {
          status = job.status;
          transactionSig = job.solanaTransactionSig || undefined;
        }
      }

      result.push({
        id: reward.id,
        actionType: reward.actionType,
        totalReward: reward.totalReward,
        status,
        transactionSig,
        createdAt: reward.createdAt
      });
    }

    return result;
  }

  async getUserTotalEarnings(userId: number): Promise<{ total: number; pending: number; completed: number }> {
    const earnings = await db.select({
      status: ambassadorActionRewards.verificationStatus,
      total: sql<number>`SUM(${ambassadorActionRewards.totalReward})`
    })
      .from(ambassadorActionRewards)
      .where(eq(ambassadorActionRewards.userId, userId))
      .groupBy(ambassadorActionRewards.verificationStatus);

    let total = 0;
    let pending = 0;
    let completed = 0;

    for (const row of earnings) {
      const amount = row.total || 0;
      total += amount;
      if (row.status === 'pending') pending += amount;
      if (row.status === 'verified') completed += amount;
    }

    return { total, pending, completed };
  }

  async verifyReward(rewardId: number, adminId: number, approved: boolean, notes?: string): Promise<boolean> {
    const [reward] = await db.select()
      .from(ambassadorActionRewards)
      .where(eq(ambassadorActionRewards.id, rewardId))
      .limit(1);

    if (!reward || reward.verificationStatus !== 'pending') {
      return false;
    }

    if (!approved) {
      await db.update(ambassadorActionRewards)
        .set({ 
          verificationStatus: 'rejected',
          verifiedBy: adminId,
          verifiedAt: new Date(),
          notes
        })
        .where(eq(ambassadorActionRewards.id, rewardId));
      return true;
    }

    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, reward.userId))
      .limit(1);

    if (!user?.walletAddress) {
      await db.update(ambassadorActionRewards)
        .set({ 
          verificationStatus: 'verified',
          verifiedBy: adminId,
          verifiedAt: new Date(),
          notes: notes || 'Verified - pending wallet connection for transfer'
        })
        .where(eq(ambassadorActionRewards.id, rewardId));
      return true;
    }

    const poolWallet = await this.getPoolWalletInfo('rewards');
    if (!poolWallet) {
      await db.update(ambassadorActionRewards)
        .set({ 
          verificationStatus: 'verified',
          verifiedBy: adminId,
          verifiedAt: new Date(),
          notes: notes || 'Verified - pending pool wallet setup for transfer'
        })
        .where(eq(ambassadorActionRewards.id, rewardId));
      return true;
    }

    const idempotencyKey = `verified-${rewardId}-${Date.now()}`;
    
    const [transferJob] = await db.insert(veddTransferJobs)
      .values({
        userId: reward.userId,
        sourceWalletId: poolWallet.id,
        destinationWallet: user.walletAddress,
        amount: reward.totalReward,
        actionType: reward.actionType,
        actionId: reward.actionId,
        status: 'pending',
        idempotencyKey,
        metadata: { verifiedBy: adminId }
      })
      .returning();

    await db.update(ambassadorActionRewards)
      .set({ 
        verificationStatus: 'verified',
        verifiedBy: adminId,
        verifiedAt: new Date(),
        transferJobId: transferJob.id,
        notes
      })
      .where(eq(ambassadorActionRewards.id, rewardId));

    this.processTransfer(transferJob.id).catch(err => 
      console.error('Background transfer processing error:', err)
    );

    return true;
  }

  async getPoolOverview(): Promise<{
    pools: PoolWalletInfo[];
    pendingTransfers: number;
    completedTransfersToday: number;
    totalDistributedToday: number;
  }> {
    const pools = await db.select()
      .from(veddPoolWallets)
      .where(eq(veddPoolWallets.status, 'active'));

    const poolInfos: PoolWalletInfo[] = pools.map((p: typeof veddPoolWallets.$inferSelect) => ({
      id: p.id,
      label: p.label,
      publicKey: p.publicKey,
      walletType: p.walletType,
      status: p.status,
      tokenBalance: p.tokenBalance || 0,
      lowBalanceThreshold: p.lowBalanceThreshold || 1000,
      isLowBalance: (p.tokenBalance || 0) < (p.lowBalanceThreshold || 1000)
    }));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [pendingResult] = await db.select({ count: sql<number>`count(*)` })
      .from(veddTransferJobs)
      .where(eq(veddTransferJobs.status, 'pending'));

    const [completedResult] = await db.select({ 
      count: sql<number>`count(*)`,
      total: sql<number>`COALESCE(SUM(${veddTransferJobs.amount}), 0)`
    })
      .from(veddTransferJobs)
      .where(and(
        eq(veddTransferJobs.status, 'completed'),
        sql`${veddTransferJobs.processedAt} >= ${todayStart}`
      ));

    return {
      pools: poolInfos,
      pendingTransfers: pendingResult?.count || 0,
      completedTransfersToday: completedResult?.count || 0,
      totalDistributedToday: completedResult?.total || 0
    };
  }

  async initializePoolWallet(label: string, publicKey: string, walletType: string = 'rewards'): Promise<number> {
    const [wallet] = await db.insert(veddPoolWallets)
      .values({
        label,
        publicKey,
        walletType,
        status: 'active',
        tokenBalance: 0
      })
      .returning();

    return wallet.id;
  }

  async processWalletConnectedRewards(userId: number, walletAddress: string): Promise<{ processed: number; errors: string[] }> {
    const verifiedRewardsWithoutTransfer = await db.select()
      .from(ambassadorActionRewards)
      .where(and(
        eq(ambassadorActionRewards.userId, userId),
        eq(ambassadorActionRewards.verificationStatus, 'verified'),
        isNull(ambassadorActionRewards.transferJobId)
      ));

    if (verifiedRewardsWithoutTransfer.length === 0) {
      return { processed: 0, errors: [] };
    }

    const poolWallet = await this.getPoolWalletInfo('rewards');
    if (!poolWallet) {
      return { processed: 0, errors: ['Pool wallet not configured'] };
    }

    let processed = 0;
    const errors: string[] = [];

    for (const reward of verifiedRewardsWithoutTransfer) {
      try {
        const idempotencyKey = `wallet-connect-${reward.id}-${Date.now()}`;
        
        const [transferJob] = await db.insert(veddTransferJobs)
          .values({
            userId,
            sourceWalletId: poolWallet.id,
            destinationWallet: walletAddress,
            amount: reward.totalReward,
            actionType: reward.actionType,
            actionId: reward.actionId,
            status: 'pending',
            idempotencyKey,
            metadata: { triggeredBy: 'wallet_connection' }
          })
          .returning();

        await db.update(ambassadorActionRewards)
          .set({ 
            transferJobId: transferJob.id,
            notes: 'Transfer job created on wallet connection'
          })
          .where(eq(ambassadorActionRewards.id, reward.id));

        this.processTransfer(transferJob.id).catch(err => 
          console.error(`Background transfer error for job ${transferJob.id}:`, err)
        );

        processed++;
      } catch (error: any) {
        errors.push(`Reward ${reward.id}: ${error.message}`);
      }
    }

    return { processed, errors };
  }
}

export const veddTokenService = new VeddTokenService();
