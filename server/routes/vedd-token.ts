import { Router, Request, Response, NextFunction } from 'express';
import { veddTokenService } from '../services/vedd-token-service';
import { db } from '../db';
import { users, veddPoolWallets, veddRewardConfig, ambassadorActionRewards, veddTransferJobs, referrals } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const userId = (req.user as any).id;
  const [user] = await db.select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  if (!user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
}

router.get('/rewards/history', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const userId = (req.user as any).id;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const history = await veddTokenService.getUserRewardHistory(userId, limit);
    res.json(history);
  } catch (error: any) {
    console.error('Error fetching reward history:', error);
    res.status(500).json({ error: 'Failed to fetch reward history' });
  }
});

router.get('/rewards/summary', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const userId = (req.user as any).id;
    
    const earnings = await veddTokenService.getUserTotalEarnings(userId);
    res.json(earnings);
  } catch (error: any) {
    console.error('Error fetching reward summary:', error);
    res.status(500).json({ error: 'Failed to fetch reward summary' });
  }
});

router.get('/config', async (req: Request, res: Response) => {
  try {
    const configs = await db.select()
      .from(veddRewardConfig)
      .where(eq(veddRewardConfig.isActive, true));
    
    res.json(configs.map(c => ({
      actionType: c.actionType,
      baseAmount: c.baseAmount,
      description: c.description
    })));
  } catch (error: any) {
    console.error('Error fetching reward config:', error);
    res.status(500).json({ error: 'Failed to fetch reward configuration' });
  }
});

router.post('/wallet-connected', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const userId = (req.user as any).id;
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({ error: 'walletAddress is required' });
    }
    
    const result = await veddTokenService.processWalletConnectedRewards(userId, walletAddress);
    res.json({ 
      success: true, 
      processed: result.processed,
      message: result.processed > 0 
        ? `Processing ${result.processed} pending reward(s) for transfer`
        : 'No pending rewards to process',
      errors: result.errors.length > 0 ? result.errors : undefined
    });
  } catch (error: any) {
    console.error('Error processing wallet connected rewards:', error);
    res.status(500).json({ error: 'Failed to process pending rewards' });
  }
});

router.get('/admin/overview', requireAdmin, async (req: Request, res: Response) => {
  try {
    const overview = await veddTokenService.getPoolOverview();
    res.json(overview);
  } catch (error: any) {
    console.error('Error fetching pool overview:', error);
    res.status(500).json({ error: 'Failed to fetch pool overview' });
  }
});

router.post('/admin/pool/initialize', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { label, publicKey, walletType = 'rewards' } = req.body;
    
    if (!label || !publicKey) {
      return res.status(400).json({ error: 'Label and publicKey are required' });
    }
    
    const walletId = await veddTokenService.initializePoolWallet(label, publicKey, walletType);
    res.json({ success: true, walletId });
  } catch (error: any) {
    console.error('Error initializing pool wallet:', error);
    res.status(500).json({ error: 'Failed to initialize pool wallet' });
  }
});

router.post('/admin/pool/:walletId/sync', requireAdmin, async (req: Request, res: Response) => {
  try {
    const walletId = parseInt(req.params.walletId);
    const balance = await veddTokenService.syncPoolBalance(walletId);
    res.json({ success: true, balance });
  } catch (error: any) {
    console.error('Error syncing pool balance:', error);
    res.status(500).json({ error: 'Failed to sync pool balance' });
  }
});

router.get('/admin/pending-rewards', requireAdmin, async (req: Request, res: Response) => {
  try {
    const pendingRewards = await db.select()
      .from(ambassadorActionRewards)
      .where(eq(ambassadorActionRewards.verificationStatus, 'pending'))
      .orderBy(desc(ambassadorActionRewards.createdAt))
      .limit(100);
    
    res.json(pendingRewards);
  } catch (error: any) {
    console.error('Error fetching pending rewards:', error);
    res.status(500).json({ error: 'Failed to fetch pending rewards' });
  }
});

router.post('/admin/rewards/:rewardId/verify', requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const rewardId = parseInt(req.params.rewardId);
    const { approved, notes } = req.body;
    
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'approved (boolean) is required' });
    }
    
    const success = await veddTokenService.verifyReward(rewardId, userId, approved, notes);
    
    if (!success) {
      return res.status(400).json({ error: 'Failed to verify reward - may already be processed' });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error verifying reward:', error);
    res.status(500).json({ error: 'Failed to verify reward' });
  }
});

router.get('/admin/transfers', requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const limit = parseInt(req.query.limit as string) || 50;
    
    let query = db.select()
      .from(veddTransferJobs)
      .orderBy(desc(veddTransferJobs.createdAt))
      .limit(limit);
    
    if (status) {
      query = query.where(eq(veddTransferJobs.status, status)) as any;
    }
    
    const transfers = await query;
    res.json(transfers);
  } catch (error: any) {
    console.error('Error fetching transfers:', error);
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

router.post('/admin/transfers/:jobId/retry', requireAdmin, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId);
    
    await db.update(veddTransferJobs)
      .set({ status: 'pending', retryCount: 0 })
      .where(eq(veddTransferJobs.id, jobId));
    
    const result = await veddTokenService.processTransfer(jobId);
    res.json(result);
  } catch (error: any) {
    console.error('Error retrying transfer:', error);
    res.status(500).json({ error: 'Failed to retry transfer' });
  }
});

router.post('/admin/config/:actionType', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { actionType } = req.params;
    const { baseAmount, streakMultiplier, maxDailyRewards, requiresVerification, description, isActive } = req.body;
    
    await db.update(veddRewardConfig)
      .set({
        ...(baseAmount !== undefined && { baseAmount }),
        ...(streakMultiplier !== undefined && { streakMultiplier }),
        ...(maxDailyRewards !== undefined && { maxDailyRewards }),
        ...(requiresVerification !== undefined && { requiresVerification }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date()
      })
      .where(eq(veddRewardConfig.actionType, actionType));
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating reward config:', error);
    res.status(500).json({ error: 'Failed to update reward configuration' });
  }
});

router.post('/referral/trade-profit', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const traderId = (req.user as any).id;
    const { profitAmount, tokenSymbol, tradeType } = req.body;
    
    if (typeof profitAmount !== 'number' || profitAmount <= 0) {
      return res.status(400).json({ error: 'Valid positive profitAmount required' });
    }
    
    const [referral] = await db.select()
      .from(referrals)
      .where(eq(referrals.referredId, traderId))
      .limit(1);
    
    if (!referral) {
      return res.json({ success: false, message: 'No referrer found for this user' });
    }
    
    const referrerId = referral.referrerId;
    
    if (referrerId === traderId) {
      return res.status(400).json({ error: 'Self-referral not allowed' });
    }
    
    const referralSharePercent = 0.05;
    const referralReward = profitAmount * referralSharePercent;
    
    const result = await veddTokenService.enqueueReward(
      referrerId,
      'referral_profit_share',
      undefined,
      { traderId, profitAmount, tokenSymbol, tradeType, referralReward }
    );
    
    if (result) {
      res.json({ 
        success: true, 
        message: `Referral reward of ${referralReward.toFixed(4)} VEDD queued for referrer`,
        rewardId: result.rewardId,
        referrerId
      });
    } else {
      res.json({ success: false, message: 'No referral reward available - config may be missing' });
    }
  } catch (error: any) {
    console.error('Error processing referral trade profit:', error);
    res.status(500).json({ error: 'Failed to process referral profit share' });
  }
});

router.post('/referral/signup', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const newUserId = (req.user as any).id;
    
    const [referral] = await db.select()
      .from(referrals)
      .where(eq(referrals.referredId, newUserId))
      .limit(1);
    
    if (!referral) {
      return res.json({ success: false, message: 'No referrer found for this user' });
    }
    
    const referrerId = referral.referrerId;
    
    if (referrerId === newUserId) {
      return res.status(400).json({ error: 'Self-referral not allowed' });
    }
    
    const result = await veddTokenService.enqueueReward(
      referrerId, 
      'referral_signup',
      newUserId,
      { referredUserId: newUserId, action: 'new_user_signup' }
    );
    
    if (result) {
      res.json({ 
        success: true, 
        message: 'Referral signup reward queued for referrer',
        rewardId: result.rewardId,
        referrerId
      });
    } else {
      res.json({ success: false, message: 'No referral signup reward available - config may be missing' });
    }
  } catch (error: any) {
    console.error('Error processing referral signup:', error);
    res.status(500).json({ error: 'Failed to process referral signup reward' });
  }
});

router.get('/referral/stats', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const userId = (req.user as any).id;
    
    const referralRewards = await db.select()
      .from(ambassadorActionRewards)
      .where(eq(ambassadorActionRewards.userId, userId));
    
    const referralTypes = ['referral_signup', 'referral_profit_share', 'referral_first_trade', 'referral_ambassador'];
    const referralOnlyRewards = referralRewards.filter((r: any) => referralTypes.includes(r.actionType));
    
    const totalReferrals = referralOnlyRewards.filter((r: any) => r.actionType === 'referral_signup').length;
    const totalEarnings = referralOnlyRewards.reduce((sum: number, r: any) => sum + (r.totalReward || 0), 0);
    const pendingEarnings = referralOnlyRewards.filter((r: any) => r.verificationStatus === 'pending').reduce((sum: number, r: any) => sum + (r.totalReward || 0), 0);
    const claimedEarnings = referralOnlyRewards.filter((r: any) => r.verificationStatus === 'verified').reduce((sum: number, r: any) => sum + (r.totalReward || 0), 0);
    
    res.json({
      totalReferrals,
      totalEarnings,
      pendingEarnings,
      claimedEarnings,
      recentRewards: referralOnlyRewards.slice(0, 10)
    });
  } catch (error: any) {
    console.error('Error fetching referral stats:', error);
    res.status(500).json({ error: 'Failed to fetch referral statistics' });
  }
});

export default router;
