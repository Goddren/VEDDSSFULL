import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { db } from '../db';
import { veddPoolWallets, veddTransferJobs, users, veddRewardConfig, ambassadorActionRewards, veddWalletBlacklist } from '@shared/schema';
import { eq, and, sql, desc, isNull, gte } from 'drizzle-orm';

const VEDD_TOKEN_MINT = process.env.VEDD_TOKEN_MINT || '';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const POOL_WALLET_PRIVATE_KEY = process.env.POOL_WALLET_PRIVATE_KEY;

/** Max VEDD a user can earn per day across ALL action types */
export const DAILY_VEDD_CAP = 500;
/** Max VEDD a user can earn per calendar week (Mon–Sun) */
export const WEEKLY_VEDD_CAP = 2000;

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

  /** Sum all VEDD earned today (midnight to now) for a user */
  async getDailyTotalEarned(userId: number): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const rows = await db.select({ total: sql<number>`coalesce(sum(total_reward), 0)` })
      .from(ambassadorActionRewards)
      .where(and(
        eq(ambassadorActionRewards.userId, userId),
        gte(ambassadorActionRewards.createdAt, todayStart)
      ));
    return Number(rows[0]?.total || 0);
  }

  /** Sum all VEDD earned this calendar week (Mon 00:00 to now) for a user */
  async getWeeklyTotalEarned(userId: number): Promise<number> {
    const now = new Date();
    const day = now.getDay(); // 0 = Sun
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diffToMon);
    weekStart.setHours(0, 0, 0, 0);
    const rows = await db.select({ total: sql<number>`coalesce(sum(total_reward), 0)` })
      .from(ambassadorActionRewards)
      .where(and(
        eq(ambassadorActionRewards.userId, userId),
        gte(ambassadorActionRewards.createdAt, weekStart)
      ));
    return Number(rows[0]?.total || 0);
  }

  async calculateReward(actionType: string, userId: number): Promise<{ baseReward: number; bonusReward: number; totalReward: number; securityFlag?: string } | null> {
    const config = await this.getRewardConfig(actionType);
    if (!config) return null;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Per-action daily limit
    const todaysRewards = await db.select({ count: sql<number>`count(*)` })
      .from(ambassadorActionRewards)
      .where(and(
        eq(ambassadorActionRewards.userId, userId),
        eq(ambassadorActionRewards.actionType, actionType),
        gte(ambassadorActionRewards.createdAt, todayStart)
      ));

    const rewardCount = todaysRewards[0]?.count || 0;
    if (rewardCount >= config.maxDailyRewards) {
      return null;
    }

    // Global daily cap check
    const dailyTotal = await this.getDailyTotalEarned(userId);
    if (dailyTotal >= DAILY_VEDD_CAP) {
      console.log(`[VEDD] User ${userId} hit daily cap (${dailyTotal}/${DAILY_VEDD_CAP})`);
      return null;
    }

    // Global weekly cap check
    const weeklyTotal = await this.getWeeklyTotalEarned(userId);
    if (weeklyTotal >= WEEKLY_VEDD_CAP) {
      console.log(`[VEDD] User ${userId} hit weekly cap (${weeklyTotal}/${WEEKLY_VEDD_CAP})`);
      return null;
    }

    // Velocity check: more than 3 of same action in last 10 minutes = flag
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentBurst = await db.select({ count: sql<number>`count(*)` })
      .from(ambassadorActionRewards)
      .where(and(
        eq(ambassadorActionRewards.userId, userId),
        eq(ambassadorActionRewards.actionType, actionType),
        gte(ambassadorActionRewards.createdAt, tenMinsAgo)
      ));
    const burstCount = recentBurst[0]?.count || 0;
    const securityFlag = burstCount >= 3 ? 'velocity' : undefined;

    // Clamp reward so we don't bust the daily cap
    const baseReward = Math.min(config.baseAmount, DAILY_VEDD_CAP - dailyTotal);
    const bonusReward = 0;
    const totalReward = baseReward + bonusReward;

    return { baseReward, bonusReward, totalReward, securityFlag };
  }

  async enqueueReward(
    userId: number,
    actionType: string,
    actionId?: number,
    metadata?: any
  ): Promise<{ rewardId: number; transferJobId?: number; pendingWallet?: boolean; pendingVerification?: boolean } | null> {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      console.log(`User ${userId} not found - cannot enqueue reward`);
      return null;
    }

    const hasWallet = !!user.walletAddress;

    // Check wallet blacklist
    const userRecord = await db.select({ walletAddress: users.walletAddress })
      .from(users).where(eq(users.id, userId)).limit(1);
    const walletAddr = (userRecord[0] as any)?.walletAddress;
    if (walletAddr) {
      const [blacklisted] = await db.select({ id: veddWalletBlacklist.id })
        .from(veddWalletBlacklist)
        .where(and(eq(veddWalletBlacklist.walletAddress, walletAddr), eq(veddWalletBlacklist.isActive, true)))
        .limit(1);
      if (blacklisted) {
        console.warn(`[VEDD Security] Blocked reward for blacklisted wallet: ${walletAddr} (userId: ${userId})`);
        return null;
      }
    }

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
        verificationStatus: 'pending',
        verifiedAt: null,
        notes: hasWallet ? 'Pending admin verification' : 'Pending admin verification and wallet connection',
        securityFlag: rewardCalc.securityFlag || null
      })
      .returning();

    return { rewardId: reward.id, pendingVerification: true, pendingWallet: !hasWallet };
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

    const MAX_SINGLE_TRANSFER = 1000; // VEDD — safety cap per transfer
    if (job.amount > MAX_SINGLE_TRANSFER) {
      console.warn(`[VEDD Security] Transfer amount ${job.amount} exceeds MAX_SINGLE_TRANSFER (${MAX_SINGLE_TRANSFER}). Requires manual review.`);
      await db.update(veddTransferJobs)
        .set({ status: 'failed', errorMessage: `Amount ${job.amount} exceeds security limit of ${MAX_SINGLE_TRANSFER} VEDD per transfer. Admin must manually approve.` })
        .where(eq(veddTransferJobs.id, jobId));
      return { success: false, error: 'Transfer blocked by security limit' };
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
    // Fetch pools — core data, must succeed
    let poolInfos: PoolWalletInfo[] = [];
    try {
      const pools = await db.select()
        .from(veddPoolWallets)
        .where(eq(veddPoolWallets.status, 'active'));

      poolInfos = pools.map((p: typeof veddPoolWallets.$inferSelect) => ({
        id: p.id,
        label: p.label,
        publicKey: p.publicKey,
        walletType: p.walletType,
        status: p.status,
        tokenBalance: p.tokenBalance || 0,
        lowBalanceThreshold: p.lowBalanceThreshold || 1000,
        isLowBalance: (p.tokenBalance || 0) < (p.lowBalanceThreshold || 1000)
      }));
    } catch (err) {
      console.error('[VEDD] getPoolOverview - pools fetch failed:', err);
    }

    // Transfer stats — non-fatal, default to 0 if table missing
    let pendingTransfers = 0;
    let completedTransfersToday = 0;
    let totalDistributedToday = 0;
    try {
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

      pendingTransfers = pendingResult?.count || 0;
      completedTransfersToday = completedResult?.count || 0;
      totalDistributedToday = completedResult?.total || 0;
    } catch (err) {
      console.warn('[VEDD] getPoolOverview - transfer stats unavailable (table may not exist yet):', (err as any)?.message);
    }

    return { pools: poolInfos, pendingTransfers, completedTransfersToday, totalDistributedToday };
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

  /**
   * Dual-track referral reward: logs the reward and, if the referrer has a
   * connected Solana wallet + a live pool wallet, immediately fires an on-chain
   * SPL token transfer in the background. In-app credit is always awarded by
   * the caller via storage.addReferralCredits() — this method handles the
   * on-chain side only.
   *
   * @param referrerId  - userId of the person who referred
   * @param actionType  - 'referral_signup' | 'referral_subscription'
   * @param amount      - VEDD tokens to transfer (e.g. 50 or 200)
   */
  async enqueueReferralReward(
    referrerId: number,
    actionType: 'referral_signup' | 'referral_subscription',
    amount: number,
  ): Promise<void> {
    try {
      const [referrer] = await db.select().from(users).where(eq(users.id, referrerId)).limit(1);
      if (!referrer) return;

      const poolWallet = await this.getPoolWalletInfo('rewards');

      // Log the reward record (auto-approved — referral tracking is internal verification)
      const [reward] = await db.insert(ambassadorActionRewards)
        .values({
          userId: referrerId,
          actionType,
          baseReward: amount,
          bonusReward: 0,
          totalReward: amount,
          verificationStatus: 'auto_approved',
          verifiedAt: new Date(),
          notes: `Auto-approved referral reward (${actionType})`,
        } as any)
        .returning();

      const walletAddr = (referrer as any).walletAddress as string | null;

      if (!walletAddr || !poolWallet) {
        // No wallet connected yet — tokens will be held and sent when user connects a wallet
        console.log(`[Referral Token] ${amount} VEDD reward logged for user ${referrerId} — wallet not connected, held pending`);
        return;
      }

      // Blacklist check
      const [blacklisted] = await db.select({ id: veddWalletBlacklist.id })
        .from(veddWalletBlacklist)
        .where(and(eq(veddWalletBlacklist.walletAddress, walletAddr), eq(veddWalletBlacklist.isActive, true)))
        .limit(1);
      if (blacklisted) {
        console.warn(`[Referral Token] Blocked — blacklisted wallet: ${walletAddr} (userId: ${referrerId})`);
        return;
      }

      // Create transfer job
      const idempotencyKey = `referral-${referrerId}-${actionType}-${reward.id}-${Date.now()}`;
      const [transferJob] = await db.insert(veddTransferJobs)
        .values({
          userId: referrerId,
          sourceWalletId: poolWallet.id,
          destinationWallet: walletAddr,
          amount,
          actionType,
          actionId: reward.id,
          status: 'pending',
          idempotencyKey,
          metadata: { referralReward: true, autoApproved: true },
        } as any)
        .returning();

      // Fire transfer in background — don't block the signup/subscription response
      this.processTransfer(transferJob.id)
        .then(result => {
          if (result.success) {
            console.log(`[Referral Token] ✓ Sent ${amount} VEDD to ${walletAddr} — tx: ${result.transactionSig}`);
          } else {
            console.error(`[Referral Token] Transfer failed for user ${referrerId}: ${result.error}`);
          }
        })
        .catch(err => console.error('[Referral Token] processTransfer error:', err));

    } catch (err) {
      // Non-critical — in-app credit already awarded by caller
      console.error('[Referral Token] enqueueReferralReward error:', err);
    }
  }
}

export const veddTokenService = new VeddTokenService();
