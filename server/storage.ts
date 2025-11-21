import { 
  users, chartAnalyses, achievements, userAchievements,
  userProfiles, follows, analysisFeedback, analysisViews, priceAlerts,
  type User, type InsertUser, type ChartAnalysis, type InsertChartAnalysis,
  type Achievement, type InsertAchievement, type UserAchievement, type InsertUserAchievement,
  type UserProfile, type InsertUserProfile, type Follow, type InsertFollow,
  type AnalysisFeedback, type InsertAnalysisFeedback, type AnalysisView, type PriceAlert, type InsertPriceAlert
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import session from "express-session";
import createMemoryStore from "memorystore";

// In-memory storage will be implemented in the class

export interface IStorage {
  sessionStore: session.Store;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<User>): Promise<User | undefined>;
  updateUserPassword(id: number, hashedPassword: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  
  // Chart analysis methods
  createChartAnalysis(analysis: InsertChartAnalysis): Promise<ChartAnalysis>;
  getChartAnalysis(id: number): Promise<ChartAnalysis | undefined>;
  getChartAnalysesByUserId(userId: number): Promise<ChartAnalysis[]>;
  getAllChartAnalyses(): Promise<ChartAnalysis[]>;
  getPublicChartAnalyses(limit?: number): Promise<ChartAnalysis[]>;
  updateChartAnalysis(id: number, data: Partial<ChartAnalysis>): Promise<ChartAnalysis | undefined>;
  shareChartAnalysis(id: number, notes?: string): Promise<ChartAnalysis | undefined>;
  getAnalysisByShareId(shareId: string): Promise<ChartAnalysis | undefined>;

  // Trading Strategy methods
  createTradingStrategy(strategy: any): Promise<number>;
  
  // Achievement methods
  createAchievement(achievement: InsertAchievement): Promise<Achievement>;
  getAchievement(id: number): Promise<Achievement | undefined>;
  getAllAchievements(): Promise<Achievement[]>;
  getAchievementsByCategory(category: string): Promise<Achievement[]>;
  
  // User Achievement methods
  createUserAchievement(userAchievement: InsertUserAchievement): Promise<UserAchievement>;
  getUserAchievements(userId: number): Promise<(UserAchievement & { achievement: Achievement })[]>;
  updateUserAchievementProgress(id: number, progress: number): Promise<UserAchievement>;
  completeUserAchievement(id: number): Promise<UserAchievement>;
  
  // User Profile methods
  getUserProfile(userId: number): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: number, data: Partial<UserProfile>): Promise<UserProfile | undefined>;
  
  // Follow methods
  followUser(followerId: number, followingId: number): Promise<Follow>;
  unfollowUser(followerId: number, followingId: number): Promise<boolean>;
  getFollowers(userId: number): Promise<User[]>;
  getFollowing(userId: number): Promise<User[]>;
  isFollowing(followerId: number, followingId: number): Promise<boolean>;
  
  // Analysis Feedback methods
  addAnalysisFeedback(feedback: InsertAnalysisFeedback): Promise<AnalysisFeedback>;
  removeAnalysisFeedback(analysisId: number, userId: number, feedbackType: string): Promise<boolean>;
  getAnalysisFeedback(analysisId: number): Promise<AnalysisFeedback[]>;
  
  // Analysis Feed methods
  getAnalysisFeed(userId: number, limit?: number): Promise<ChartAnalysis[]>;
  getPopularAnalyses(limit?: number): Promise<ChartAnalysis[]>;
  
  // Referral methods
  generateReferralCode(userId: number): Promise<string>;
  saveReferralCode(userId: number, code: string): Promise<User | undefined>;
  getUserByReferralCode(code: string): Promise<User | undefined>;
  recordReferral(referrerId: number, referredId: number): Promise<Referral>;
  getReferrals(userId: number): Promise<Referral[]>;
  completeReferral(referralId: number): Promise<Referral | undefined>;
  getReferralLeaderboard(limit?: number): Promise<{ username: string; referrals: number }[]>;
  addReferralCredits(userId: number, credits: number): Promise<User | undefined>;
  
  // Price Alert methods
  createPriceAlert(alert: InsertPriceAlert): Promise<PriceAlert>;
  getPriceAlert(id: number): Promise<PriceAlert | undefined>;
  getUserPriceAlerts(userId: number): Promise<PriceAlert[]>;
  updatePriceAlert(id: number, data: Partial<PriceAlert>): Promise<PriceAlert | undefined>;
  deletePriceAlert(id: number): Promise<boolean>;
  getActivePriceAlerts(): Promise<PriceAlert[]>;
  triggerPriceAlert(id: number): Promise<PriceAlert | undefined>;
  
  // Session store for authentication
  sessionStore: session.Store;
}

// Create PostgreSQL session store
// Using in-memory session store instead of PostgreSQL

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    // Use memory store for session storage
    const MemoryStore = createMemoryStore(session);
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        email: insertUser.email || '',
        fullName: insertUser.fullName || null,
        profileImage: insertUser.profileImage || null,
      })
      .returning();
    return user;
  }

  async createChartAnalysis(analysis: InsertChartAnalysis): Promise<ChartAnalysis> {
    // Ensure required fields are present
    if (!analysis.imageUrl || !analysis.direction || !analysis.trend || 
        !analysis.confidence || !analysis.entryPoint || !analysis.exitPoint || 
        !analysis.stopLoss || !analysis.takeProfit || 
        !analysis.patterns || !analysis.indicators) {
      throw new Error("Missing required fields for chart analysis");
    }
    
    const [chartAnalysis] = await db
      .insert(chartAnalyses)
      .values({
        imageUrl: analysis.imageUrl,
        userId: analysis.userId,
        symbol: analysis.symbol || null,
        timeframe: analysis.timeframe || null,
        price: analysis.price || null,
        direction: analysis.direction,
        trend: analysis.trend,
        confidence: analysis.confidence,
        entryPoint: analysis.entryPoint,
        exitPoint: analysis.exitPoint,
        stopLoss: analysis.stopLoss,
        takeProfit: analysis.takeProfit,
        riskRewardRatio: analysis.riskRewardRatio || null,
        potentialPips: analysis.potentialPips || null,
        patterns: analysis.patterns,
        indicators: analysis.indicators,
        supportResistance: analysis.supportResistance || null,
        recommendation: analysis.recommendation || null,
      })
      .returning();
    
    return chartAnalysis;
  }

  async getChartAnalysis(id: number): Promise<ChartAnalysis | undefined> {
    const [analysis] = await db
      .select()
      .from(chartAnalyses)
      .where(eq(chartAnalyses.id, id));
    return analysis;
  }

  async getChartAnalysesByUserId(userId: number): Promise<ChartAnalysis[]> {
    return db
      .select()
      .from(chartAnalyses)
      .where(eq(chartAnalyses.userId, userId));
  }

  async getAllChartAnalyses(): Promise<ChartAnalysis[]> {
    return db.select().from(chartAnalyses);
  }
  
  async updateChartAnalysis(id: number, data: Partial<ChartAnalysis>): Promise<ChartAnalysis | undefined> {
    const [updatedAnalysis] = await db
      .update(chartAnalyses)
      .set(data)
      .where(eq(chartAnalyses.id, id))
      .returning();
    return updatedAnalysis;
  }
  
  async shareChartAnalysis(id: number, notes?: string): Promise<ChartAnalysis | undefined> {
    // Generate a unique share ID
    const shareId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    
    const [sharedAnalysis] = await db
      .update(chartAnalyses)
      .set({
        shareId,
        isPublic: true,
        notes: notes || null
      })
      .where(eq(chartAnalyses.id, id))
      .returning();
      
    return sharedAnalysis;
  }
  
  async getAnalysisByShareId(shareId: string): Promise<ChartAnalysis | undefined> {
    const [analysis] = await db
      .select()
      .from(chartAnalyses)
      .where(eq(chartAnalyses.shareId, shareId))
      .limit(1);
      
    return analysis;
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({
        ...userData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async updateUserPassword(id: number, hashedPassword: string): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({
        password: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }
  
  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  // Achievement methods
  async createAchievement(achievement: InsertAchievement): Promise<Achievement> {
    const [newAchievement] = await db
      .insert(achievements)
      .values(achievement)
      .returning();
    return newAchievement;
  }

  async getAchievement(id: number): Promise<Achievement | undefined> {
    const [achievement] = await db
      .select()
      .from(achievements)
      .where(eq(achievements.id, id));
    return achievement;
  }

  async getAllAchievements(): Promise<Achievement[]> {
    return db.select().from(achievements);
  }

  async getAchievementsByCategory(category: string): Promise<Achievement[]> {
    return db
      .select()
      .from(achievements)
      .where(eq(achievements.category, category));
  }

  // User Achievement methods
  async createUserAchievement(userAchievement: InsertUserAchievement): Promise<UserAchievement> {
    const [newUserAchievement] = await db
      .insert(userAchievements)
      .values(userAchievement)
      .returning();
    return newUserAchievement;
  }

  async getUserAchievements(userId: number): Promise<(UserAchievement & { achievement: Achievement })[]> {
    const result = await db
      .select({
        userAchievement: userAchievements,
        achievement: achievements
      })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(eq(userAchievements.userId, userId));
    
    return result.map(row => ({
      ...row.userAchievement,
      achievement: row.achievement
    }));
  }

  async updateUserAchievementProgress(id: number, progress: number): Promise<UserAchievement> {
    const [updatedUserAchievement] = await db
      .update(userAchievements)
      .set({
        progress
      })
      .where(eq(userAchievements.id, id))
      .returning();
    return updatedUserAchievement;
  }

  async completeUserAchievement(id: number): Promise<UserAchievement> {
    const [completedUserAchievement] = await db
      .update(userAchievements)
      .set({
        isCompleted: true,
        progress: sql`${userAchievements.progress} + 1`,
        unlockedAt: new Date()
      })
      .where(eq(userAchievements.id, id))
      .returning();
    return completedUserAchievement;
  }

  // User Profile methods
  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));
    return profile;
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const [newProfile] = await db
      .insert(userProfiles)
      .values(profile)
      .returning();
    return newProfile;
  }

  async updateUserProfile(userId: number, data: Partial<UserProfile>): Promise<UserProfile | undefined> {
    const [updatedProfile] = await db
      .update(userProfiles)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(userProfiles.userId, userId))
      .returning();
    return updatedProfile;
  }

  // Follow methods
  async followUser(followerId: number, followingId: number): Promise<Follow> {
    if (followerId === followingId) {
      throw new Error("Cannot follow yourself");
    }
    
    // Create follow relationship
    const [follow] = await db
      .insert(follows)
      .values({
        followerId,
        followingId
      })
      .returning();
    
    // Increment follower counts
    await db
      .update(userProfiles)
      .set({
        following: sql`${userProfiles.following} + 1`
      })
      .where(eq(userProfiles.userId, followerId));
    
    await db
      .update(userProfiles)
      .set({
        followers: sql`${userProfiles.followers} + 1`
      })
      .where(eq(userProfiles.userId, followingId));
    
    return follow;
  }

  async unfollowUser(followerId: number, followingId: number): Promise<boolean> {
    // Remove follow relationship
    const result = await db
      .delete(follows)
      .where(and(
        eq(follows.followerId, followerId),
        eq(follows.followingId, followingId)
      ));
    
    if (result.count > 0) {
      // Decrement follower counts
      await db
        .update(userProfiles)
        .set({
          following: sql`${userProfiles.following} - 1`
        })
        .where(eq(userProfiles.userId, followerId));
      
      await db
        .update(userProfiles)
        .set({
          followers: sql`${userProfiles.followers} - 1`
        })
        .where(eq(userProfiles.userId, followingId));
      
      return true;
    }
    
    return false;
  }

  async getFollowers(userId: number): Promise<User[]> {
    const followersResult = await db
      .select({
        user: users
      })
      .from(follows)
      .innerJoin(users, eq(follows.followerId, users.id))
      .where(eq(follows.followingId, userId));
    
    return followersResult.map(row => row.user);
  }

  async getFollowing(userId: number): Promise<User[]> {
    const followingResult = await db
      .select({
        user: users
      })
      .from(follows)
      .innerJoin(users, eq(follows.followingId, users.id))
      .where(eq(follows.followerId, userId));
    
    return followingResult.map(row => row.user);
  }

  async isFollowing(followerId: number, followingId: number): Promise<boolean> {
    const [follow] = await db
      .select()
      .from(follows)
      .where(and(
        eq(follows.followerId, followerId),
        eq(follows.followingId, followingId)
      ));
    
    return !!follow;
  }

  // Analysis Feedback methods
  async addAnalysisFeedback(feedback: InsertAnalysisFeedback): Promise<AnalysisFeedback> {
    const [newFeedback] = await db
      .insert(analysisFeedback)
      .values(feedback)
      .returning();
    return newFeedback;
  }

  async removeAnalysisFeedback(analysisId: number, userId: number, feedbackType: string): Promise<boolean> {
    const result = await db
      .delete(analysisFeedback)
      .where(and(
        eq(analysisFeedback.analysisId, analysisId),
        eq(analysisFeedback.userId, userId),
        eq(analysisFeedback.feedbackType, feedbackType)
      ));
    
    return result.count > 0;
  }

  async getAnalysisFeedback(analysisId: number): Promise<AnalysisFeedback[]> {
    return db
      .select()
      .from(analysisFeedback)
      .where(eq(analysisFeedback.analysisId, analysisId));
  }

  // Missing methods from IStorage interface
  async getPublicChartAnalyses(limit: number = 10): Promise<ChartAnalysis[]> {
    return db
      .select()
      .from(chartAnalyses)
      .where(eq(chartAnalyses.isPublic, true))
      .orderBy(sql`${chartAnalyses.createdAt} DESC`)
      .limit(limit);
  }

  async getAnalysisFeed(userId: number, limit: number = 20): Promise<ChartAnalysis[]> {
    // Get analyses from users that the current user follows
    const followingUserIds = (await this.getFollowing(userId)).map(user => user.id);
    
    if (followingUserIds.length === 0) {
      // If not following anyone, return popular analyses
      return this.getPopularAnalyses(limit);
    }
    
    return db
      .select()
      .from(chartAnalyses)
      .where(and(
        eq(chartAnalyses.isPublic, true),
        sql`${chartAnalyses.userId} IN (${followingUserIds.join(',')})`
      ))
      .orderBy(sql`${chartAnalyses.createdAt} DESC`)
      .limit(limit);
  }

  async getPopularAnalyses(limit: number = 10): Promise<ChartAnalysis[]> {
    // This is a simple implementation. For a real app, you would want to
    // use the feedback data (likes, etc.) to determine popularity
    return db
      .select()
      .from(chartAnalyses)
      .where(eq(chartAnalyses.isPublic, true))
      .orderBy(sql`${chartAnalyses.createdAt} DESC`)
      .limit(limit);
  }
  
  // Referral methods
  async generateReferralCode(userId: number): Promise<string> {
    // Generate a unique referral code using user ID and random string
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${userId.toString(36)}${randomPart}`;
  }
  
  async saveReferralCode(userId: number, code: string): Promise<User | undefined> {
    // This is a temporary implementation until the referral_code column is added to the database
    // For now, just return the user without updating the referral code
    return this.getUser(userId);
  }
  
  async getUserByReferralCode(code: string): Promise<User | undefined> {
    // This is a temporary implementation until the referral_code column is added to the database
    // For now, just return undefined since we can't look up users by referral code
    return undefined;
  }
  
  async recordReferral(referrerId: number, referredId: number): Promise<Referral> {
    const [newReferral] = await db
      .insert(referrals)
      .values({
        referrerId,
        referredId,
        status: 'pending'
      })
      .returning();
    return newReferral;
  }
  
  async getReferrals(userId: number): Promise<Referral[]> {
    return db
      .select()
      .from(referrals)
      .where(eq(referrals.referrerId, userId));
  }
  
  async completeReferral(referralId: number): Promise<Referral | undefined> {
    const [updatedReferral] = await db
      .update(referrals)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(referrals.id, referralId))
      .returning();
    
    if (updatedReferral) {
      // Add credits to the referrer
      await this.addReferralCredits(updatedReferral.referrerId, updatedReferral.creditAmount);
    }
    
    return updatedReferral;
  }
  
  async getReferralLeaderboard(limit: number = 10): Promise<{ username: string; referrals: number }[]> {
    const leaderboard = await db.execute(sql`
      SELECT u.username, COUNT(r.id) as referrals
      FROM ${referrals} r
      JOIN ${users} u ON r.referrer_id = u.id
      WHERE r.status = 'completed'
      GROUP BY u.username
      ORDER BY referrals DESC
      LIMIT ${limit}
    `);
    
    return leaderboard.rows.map((row: any) => ({
      username: row.username,
      referrals: parseInt(row.referrals, 10),
    }));
  }
  
  async addReferralCredits(userId: number, credits: number): Promise<User | undefined> {
    // Temporarily just return the user without updating credits since the column was removed
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    return user;
  }

  async createTradingStrategy(strategy: any): Promise<number> {
    // For now, return a mock ID since we don't have the table migrated yet
    // This allows the feature to work without database errors
    // TODO: Implement database insertion when tradingStrategies table is migrated
    console.log('Trading strategy would be saved:', {
      symbol: strategy.symbol,
      platformType: strategy.platformType,
      timeframes: strategy.timeframes?.length
    });
    return Date.now(); // Return timestamp as mock ID
  }

  async createPriceAlert(alert: InsertPriceAlert): Promise<PriceAlert> {
    const [createdAlert] = await db
      .insert(priceAlerts)
      .values(alert)
      .returning();
    return createdAlert;
  }

  async getPriceAlert(id: number): Promise<PriceAlert | undefined> {
    const [alert] = await db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.id, id));
    return alert;
  }

  async getUserPriceAlerts(userId: number): Promise<PriceAlert[]> {
    return await db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.userId, userId))
      .orderBy(sql`${priceAlerts.createdAt} DESC`);
  }

  async updatePriceAlert(id: number, data: Partial<PriceAlert>): Promise<PriceAlert | undefined> {
    const [updatedAlert] = await db
      .update(priceAlerts)
      .set(data)
      .where(eq(priceAlerts.id, id))
      .returning();
    return updatedAlert;
  }

  async deletePriceAlert(id: number): Promise<boolean> {
    const result = await db
      .delete(priceAlerts)
      .where(eq(priceAlerts.id, id));
    return true;
  }

  async getActivePriceAlerts(): Promise<PriceAlert[]> {
    return await db
      .select()
      .from(priceAlerts)
      .where(and(
        eq(priceAlerts.isActive, true),
        eq(priceAlerts.isTriggered, false)
      ));
  }

  async triggerPriceAlert(id: number): Promise<PriceAlert | undefined> {
    const [triggeredAlert] = await db
      .update(priceAlerts)
      .set({
        isTriggered: true,
        triggeredAt: new Date()
      })
      .where(eq(priceAlerts.id, id))
      .returning();
    return triggeredAlert;
  }
}

// Export a singleton instance of the database storage
export const storage = new DatabaseStorage();
