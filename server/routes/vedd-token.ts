import { Router, Request, Response, NextFunction } from 'express';
import { veddTokenService, DAILY_VEDD_CAP, WEEKLY_VEDD_CAP } from '../services/vedd-token-service';
import { db } from '../db';
import { users, veddPoolWallets, veddRewardConfig, ambassadorActionRewards, veddTransferJobs, referrals, veddWalletBlacklist } from '@shared/schema';
import { eq, desc, sql, and } from 'drizzle-orm';

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

/* ─── Daily Missions ─────────────────────────────────────────────────────── */
router.get('/daily-missions', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    const userId = (req.user as any).id;

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const now = new Date();
    const day = now.getDay();
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diffToMon);
    weekStart.setHours(0, 0, 0, 0);

    // Today's rewards grouped by action type
    const rawToday = await db.execute(sql`
      SELECT action_type, COUNT(*) as count, COALESCE(SUM(total_reward),0) as earned
      FROM ambassador_action_rewards
      WHERE user_id = ${userId} AND created_at >= ${todayStart}
      GROUP BY action_type
    `);
    const todayRows: any[] = Array.isArray(rawToday) ? rawToday : (rawToday as any).rows || [];
    const todayMap: Record<string, { count: number; earned: number }> = {};
    for (const r of todayRows) todayMap[r.action_type] = { count: Number(r.count), earned: Number(r.earned) };

    // Weekly rewards grouped by action type
    const rawWeek = await db.execute(sql`
      SELECT action_type, COUNT(*) as count, COALESCE(SUM(total_reward),0) as earned
      FROM ambassador_action_rewards
      WHERE user_id = ${userId} AND created_at >= ${weekStart}
      GROUP BY action_type
    `);
    const weekRows: any[] = Array.isArray(rawWeek) ? rawWeek : (rawWeek as any).rows || [];
    const weekMap: Record<string, { count: number; earned: number }> = {};
    for (const r of weekRows) weekMap[r.action_type] = { count: Number(r.count), earned: Number(r.earned) };

    const dailyTotal  = await veddTokenService.getDailyTotalEarned(userId);
    const weeklyTotal = await veddTokenService.getWeeklyTotalEarned(userId);

    // Master task list — daily tasks use todayMap; weekly tasks use weekMap
    const tasks = [
      // ── Daily ──
      { actionType: 'devotional_solo',   label: 'Daily Devotional (Solo)',          veddReward: 75,  maxCount: 1, category: 'daily',  icon: 'heart',    description: 'Complete today\'s devotional (5+ min)' },
      { actionType: 'devotional_group',  label: 'Group Devotional w/ Ambassadors',  veddReward: 150, maxCount: 1, category: 'daily',  icon: 'users',    description: 'Join a group devotional session for 2× reward' },
      { actionType: 'strategy_review',   label: 'Review Weekly Strategy',           veddReward: 15,  maxCount: 1, category: 'daily',  icon: 'trending', description: 'Check your weekly trading strategy page' },
      { actionType: 'analysis_view',     label: 'View AI Chart Analysis',           veddReward: 10,  maxCount: 1, category: 'daily',  icon: 'chart',    description: 'Open an AI analysis on the analysis page' },
      { actionType: 'live_monitor_check',label: 'Check Live Trading Monitor',       veddReward: 5,   maxCount: 1, category: 'daily',  icon: 'radio',    description: 'Visit the live monitor to check signals' },
      { actionType: 'blog_share',        label: 'Share a Blog Article',             veddReward: 20,  maxCount: 1, category: 'daily',  icon: 'share',    description: 'Share any blog article with your affiliate link' },
      { actionType: 'daily_comment',     label: 'Community Engagement',             veddReward: 5,   maxCount: 3, category: 'daily',  icon: 'chat',     description: 'Comment or engage in the community (up to 3×)' },
      // ── Weekly ──
      { actionType: 'grant_apply',       label: 'Apply for a Grant',                veddReward: 25,  maxCount: 1, category: 'weekly', icon: 'dollar',   description: 'Start or submit a grant application' },
      { actionType: 'training_module',   label: 'Complete Training Module',         veddReward: 50,  maxCount: 3, category: 'weekly', icon: 'book',     description: 'Finish an ambassador training module (up to 3/week)' },
      { actionType: 'daily_post',        label: 'Post VEDD Content',                veddReward: 10,  maxCount: 1, category: 'daily',  icon: 'star',     description: 'Share VEDD branded content on social media' },
      { actionType: 'event_attendance',  label: 'Attend Community Event',           veddReward: 15,  maxCount: 2, category: 'weekly', icon: 'calendar', description: 'Join a community or host event (up to 2/week)' },
      { actionType: 'devotional_streak_bonus', label: '5-Day Devotional Streak Bonus', veddReward: 200, maxCount: 1, category: 'weekly', icon: 'fire', description: 'Complete 5 devotionals in a week for a bonus' },
      { actionType: 'journey_day_complete', label: 'Free Path to Pro — Daily Step', veddReward: 10, maxCount: 1, category: 'daily',  icon: 'rocket',   description: 'Complete a day in the 44-day ambassador journey' },
    ].map(t => {
      const map = t.category === 'daily' ? todayMap : weekMap;
      const done = map[t.actionType]?.count || 0;
      const earned = map[t.actionType]?.earned || 0;
      return { ...t, completedCount: done, earnedVedd: earned, completed: done >= t.maxCount };
    });

    // Weekly devotional streak check (how many unique days this week had a devotional)
    const rawDevDays = await db.execute(sql`
      SELECT COUNT(DISTINCT DATE(created_at)) as days
      FROM ambassador_action_rewards
      WHERE user_id = ${userId}
        AND action_type IN ('devotional_solo','devotional_group')
        AND created_at >= ${weekStart}
    `);
    const devDaysRows: any[] = Array.isArray(rawDevDays) ? rawDevDays : (rawDevDays as any).rows || [];
    const devotionalDaysThisWeek = Number(devDaysRows[0]?.days || 0);

    res.json({
      dailyEarned: dailyTotal,
      weeklyEarned: weeklyTotal,
      dailyCap: DAILY_VEDD_CAP,
      weeklyCap: WEEKLY_VEDD_CAP,
      devotionalDaysThisWeek,
      tasks,
    });
  } catch (err: any) {
    console.error('[daily-missions]', err);
    res.status(500).json({ error: 'Failed to load daily missions' });
  }
});

/* ─── Trigger a trackable action reward ─────────────────────────────────── */
router.post('/track', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    const userId = (req.user as any).id;
    const { actionType, actionId } = req.body;
    if (!actionType) return res.status(400).json({ error: 'actionType required' });
    const result = await veddTokenService.enqueueReward(userId, actionType, actionId);
    if (!result) return res.json({ rewarded: false, message: 'Daily limit reached or already earned' });
    res.json({ rewarded: true, rewardId: result.rewardId });
  } catch (err: any) {
    console.error('[track]', err);
    res.status(500).json({ error: 'Failed to track action' });
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

    // Validate Solana address format before hitting DB
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(publicKey.trim())) {
      return res.status(400).json({ error: 'Invalid Solana wallet address format. Make sure you copied the full address from Phantom.' });
    }

    const walletId = await veddTokenService.initializePoolWallet(label, publicKey.trim(), walletType);
    res.json({ success: true, walletId });
  } catch (error: any) {
    console.error('Error initializing pool wallet:', error);
    // Return the actual error message so admin can diagnose
    const msg = error?.message || 'Unknown error';
    if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('already exists')) {
      return res.status(400).json({ error: 'This wallet address is already registered. Go to the pool list to sync it.' });
    }
    res.status(500).json({ error: `Failed to initialize pool wallet: ${msg}` });
  }
});

router.post('/admin/pool/:walletId/sync', requireAdmin, async (req: Request, res: Response) => {
  try {
    const walletId = parseInt(req.params.walletId);
    if (isNaN(walletId)) return res.status(400).json({ error: 'Invalid wallet ID' });
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

// GET /api/vedd/admin/blacklist — list blacklisted wallets
router.get('/admin/blacklist', requireAdmin, async (req: Request, res: Response) => {
  try {
    const list = await db.select().from(veddWalletBlacklist)
      .orderBy(desc(veddWalletBlacklist.createdAt)).limit(200);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch blacklist' });
  }
});

// POST /api/vedd/admin/blacklist — add wallet to blacklist
router.post('/admin/blacklist', requireAdmin, async (req: Request, res: Response) => {
  try {
    const adminId = (req.user as any).id;
    const { walletAddress, reason, notes } = req.body;
    if (!walletAddress || !reason) return res.status(400).json({ error: 'walletAddress and reason required' });
    // Validate Solana base58 address format
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid Solana wallet address format' });
    }
    await db.insert(veddWalletBlacklist).values({ walletAddress, reason, notes, addedBy: adminId }).onConflictDoUpdate({
      target: veddWalletBlacklist.walletAddress,
      set: { reason, notes, isActive: true, addedBy: adminId }
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to add to blacklist' });
  }
});

// DELETE /api/vedd/admin/blacklist/:address — remove wallet from blacklist
router.delete('/admin/blacklist/:address', requireAdmin, async (req: Request, res: Response) => {
  try {
    await db.update(veddWalletBlacklist)
      .set({ isActive: false })
      .where(eq(veddWalletBlacklist.walletAddress, req.params.address));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to remove from blacklist' });
  }
});

// GET /api/vedd/admin/security-alerts — flagged/velocity rewards needing review
router.get('/admin/security-alerts', requireAdmin, async (req: Request, res: Response) => {
  try {
    const flagged = await db.select().from(ambassadorActionRewards)
      .where(sql`${ambassadorActionRewards.securityFlag} IS NOT NULL`)
      .orderBy(desc(ambassadorActionRewards.createdAt))
      .limit(100);
    res.json(flagged);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch security alerts' });
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

// GET /api/vedd/live-price — server-side DexScreener proxy (avoids browser CORS)
const VEDD_MINT = 'Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump';
let priceCache: { data: any; ts: number } | null = null;

router.get('/live-price', async (_req: Request, res: Response) => {
  try {
    // Cache for 60 seconds to avoid hammering DexScreener
    if (priceCache && Date.now() - priceCache.ts < 60_000) {
      return res.json(priceCache.data);
    }
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${VEDD_MINT}`);
    if (!response.ok) throw new Error(`DexScreener ${response.status}`);
    const data = await response.json();
    priceCache = { data, ts: Date.now() };
    res.json(data);
  } catch (err: any) {
    // Return fallback so the page never crashes
    res.json({ pairs: null, error: err.message });
  }
});

export default router;
