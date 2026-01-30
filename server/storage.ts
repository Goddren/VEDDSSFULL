import { 
  users, chartAnalyses, achievements, userAchievements,
  userProfiles, follows, analysisFeedback, analysisViews, priceAlerts,
  savedEAs, eaSubscriptions, marketDataSnapshots, marketDataRefreshJobs, eaShareAssets, userStreaks, scenarioAnalyses,
  webhookConfigs, webhookLogs, mt5ApiTokens, mt5SignalLogs, tradelockerConnections, tradelockerTradeLogs,
  ambassadorTrainingProgress, ambassadorCertifications, governanceProposals, governanceVotes,
  ambassadorContentProgress, ambassadorContentStats,
  ambassadorSocialDirections, ambassadorChallenges, ambassadorChallengeParticipants,
  ambassadorEvents, ambassadorEventRegistrations, ambassadorChallengeSessions,
  ambassadorEventSchedules, ambassadorScheduleRegistrations, ambassadorCommunityComments,
  connectedSocialAccounts, socialPosts,
  type User, type InsertUser, type ChartAnalysis, type InsertChartAnalysis,
  type Achievement, type InsertAchievement, type UserAchievement, type InsertUserAchievement,
  type UserProfile, type InsertUserProfile, type Follow, type InsertFollow,
  type AnalysisFeedback, type InsertAnalysisFeedback, type AnalysisView, type PriceAlert, type InsertPriceAlert,
  type SavedEA, type InsertSavedEA, type EASubscription, type InsertEASubscription,
  type MarketDataSnapshot, type InsertMarketDataSnapshot, type MarketDataRefreshJob, type InsertMarketDataRefreshJob,
  type EAShareAsset, type InsertEAShareAsset, type UserStreak, type InsertUserStreak, TIER_CONFIG,
  type ScenarioAnalysis, type InsertScenarioAnalysis,
  type WebhookConfig, type InsertWebhookConfig, type WebhookLog, type InsertWebhookLog,
  type Mt5ApiToken, type InsertMt5ApiToken, type Mt5SignalLog, type InsertMt5SignalLog,
  type TradelockerConnection, type InsertTradelockerConnection, type TradelockerTradeLog, type InsertTradelockerTradeLog,
  type AmbassadorTrainingProgress, type InsertAmbassadorTrainingProgress,
  type AmbassadorCertification, type InsertAmbassadorCertification,
  type GovernanceProposal, type InsertGovernanceProposal, type GovernanceVote, type InsertGovernanceVote,
  type AmbassadorContentProgress, type InsertAmbassadorContentProgress,
  type AmbassadorContentStats, type InsertAmbassadorContentStats,
  type AmbassadorSocialDirection, type InsertAmbassadorSocialDirection,
  type AmbassadorChallenge, type InsertAmbassadorChallenge,
  type AmbassadorChallengeParticipant, type InsertAmbassadorChallengeParticipant,
  type AmbassadorEvent, type InsertAmbassadorEvent,
  type AmbassadorEventRegistration, type InsertAmbassadorEventRegistration,
  type AmbassadorChallengeSession, type InsertAmbassadorChallengeSession,
  type AmbassadorEventSchedule, type InsertAmbassadorEventSchedule,
  type AmbassadorScheduleRegistration, type InsertAmbassadorScheduleRegistration,
  type AmbassadorCommunityComment, type InsertAmbassadorCommunityComment,
  type VeddPoolWallet, type InsertVeddPoolWallet,
  type VeddTransferJob, type InsertVeddTransferJob,
  type AmbassadorActionReward, type InsertAmbassadorActionReward,
  type InternalWallet, type InsertInternalWallet,
  type WithdrawalRequest, type InsertWithdrawalRequest,
  type ConnectedSocialAccount, type InsertConnectedSocialAccount,
  type SocialPost, type InsertSocialPost,
  type AiTradeResult, type InsertAiTradeResult,
  veddPoolWallets, veddTransferJobs, ambassadorActionRewards,
  internalWallets, withdrawalRequests, aiTradeResults
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import session from "express-session";
import createMemoryStore from "memorystore";
import crypto from "crypto";

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
  
  // Saved EA methods
  savEA(ea: InsertSavedEA): Promise<SavedEA>;
  getSavedEA(id: number): Promise<SavedEA | undefined>;
  getUserSavedEAs(userId: number): Promise<SavedEA[]>;
  updateSavedEA(id: number, data: Partial<SavedEA>): Promise<SavedEA | undefined>;
  deleteSavedEA(id: number): Promise<boolean>;
  shareEA(eaId: number, price: number): Promise<SavedEA | undefined>;
  unshareEA(eaId: number): Promise<SavedEA | undefined>;
  getSharedEAs(limit?: number): Promise<SavedEA[]>;
  
  // EA Subscription methods
  subscribeToEA(subscription: InsertEASubscription): Promise<EASubscription>;
  getEASubscription(id: number): Promise<EASubscription | undefined>;
  getUserSubscribedEAs(userId: number): Promise<(EASubscription & { ea: SavedEA; creator: User })[]>;
  getCreatorSubscribers(creatorId: number): Promise<EASubscription[]>;
  cancelEASubscription(subscriptionId: number): Promise<boolean>;
  getEASubscriptionByEAAndUser(eaId: number, userId: number): Promise<EASubscription | undefined>;
  
  // Market Data Snapshot methods
  createMarketDataSnapshot(snapshot: InsertMarketDataSnapshot): Promise<MarketDataSnapshot>;
  getMarketDataSnapshot(symbol: string, timeframe: string): Promise<MarketDataSnapshot | undefined>;
  getLatestSnapshot(symbol: string, timeframe: string): Promise<MarketDataSnapshot | undefined>;
  
  // Market Data Refresh Job methods
  createRefreshJob(job: InsertMarketDataRefreshJob): Promise<MarketDataRefreshJob>;
  updateRefreshJob(id: number, data: Partial<MarketDataRefreshJob>): Promise<MarketDataRefreshJob | undefined>;
  getRefreshJobsByEA(eaId: number): Promise<MarketDataRefreshJob[]>;
  
  // EA Share Asset methods
  createEAShareAsset(asset: InsertEAShareAsset): Promise<EAShareAsset>;
  getEAShareAsset(eaId: number): Promise<EAShareAsset | undefined>;
  getEAShareAssetByShareUrl(shareUrl: string): Promise<EAShareAsset | undefined>;
  updateEAShareAsset(id: number, data: Partial<EAShareAsset>): Promise<EAShareAsset | undefined>;
  incrementShareAssetViewCount(id: number): Promise<void>;
  incrementShareAssetShareCount(id: number): Promise<void>;
  
  // User Subscription methods (for VEDD token payments)
  updateUserSubscription(userId: number, subscriptionData: {
    planId: number;
    status: string;
    stripeSubscriptionId?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
  }): Promise<void>;
  
  // Session store for authentication
  sessionStore: session.Store;
  
  // User Streak methods
  getUserStreak(userId: number): Promise<UserStreak | undefined>;
  createOrUpdateStreak(userId: number, data: Partial<UserStreak>): Promise<UserStreak>;
  recordActivity(userId: number, activityType: 'chart' | 'ea' | 'trade'): Promise<{ 
    streak: UserStreak; 
    streakIncreased: boolean; 
    tierUp: boolean; 
    newTier?: string; 
  }>;
  
  // Scenario Analysis methods
  createScenarioAnalysis(analysis: InsertScenarioAnalysis): Promise<ScenarioAnalysis>;
  getScenarioAnalysis(id: number): Promise<ScenarioAnalysis | undefined>;
  getUserScenarioAnalyses(userId: number): Promise<ScenarioAnalysis[]>;
  getScenariosByChartAnalysis(chartAnalysisId: number): Promise<ScenarioAnalysis[]>;
  
  // Webhook methods
  createWebhook(webhook: InsertWebhookConfig): Promise<WebhookConfig>;
  getWebhook(id: number): Promise<WebhookConfig | undefined>;
  getUserWebhooks(userId: number): Promise<WebhookConfig[]>;
  getActiveWebhooksByTrigger(userId: number, triggerType: string): Promise<WebhookConfig[]>;
  updateWebhook(id: number, data: Partial<WebhookConfig>): Promise<WebhookConfig | undefined>;
  deleteWebhook(id: number): Promise<boolean>;
  logWebhookCall(log: InsertWebhookLog): Promise<WebhookLog>;
  getWebhookLogs(webhookId: number, limit?: number): Promise<WebhookLog[]>;
  
  // MT5 API Token methods
  createMt5ApiToken(userId: number, name: string): Promise<Mt5ApiToken>;
  getMt5ApiToken(id: number): Promise<Mt5ApiToken | undefined>;
  getMt5ApiTokenByToken(token: string): Promise<Mt5ApiToken | undefined>;
  getUserMt5ApiTokens(userId: number): Promise<Mt5ApiToken[]>;
  updateMt5ApiToken(id: number, data: Partial<Mt5ApiToken>): Promise<Mt5ApiToken | undefined>;
  deleteMt5ApiToken(id: number): Promise<boolean>;
  incrementMt5TokenSignalCount(tokenId: number): Promise<void>;
  
  // MT5 Signal Log methods
  createMt5SignalLog(log: InsertMt5SignalLog): Promise<Mt5SignalLog>;
  getMt5SignalLogs(userId: number, limit?: number): Promise<Mt5SignalLog[]>;
  
  // TradeLocker Connection methods
  createTradelockerConnection(connection: InsertTradelockerConnection): Promise<TradelockerConnection>;
  getTradelockerConnection(id: number): Promise<TradelockerConnection | undefined>;
  getUserTradelockerConnection(userId: number): Promise<TradelockerConnection | undefined>;
  updateTradelockerConnection(id: number, data: Partial<TradelockerConnection>): Promise<TradelockerConnection | undefined>;
  deleteTradelockerConnection(id: number): Promise<boolean>;
  
  // TradeLocker Trade Log methods
  createTradelockerTradeLog(log: InsertTradelockerTradeLog): Promise<TradelockerTradeLog>;
  getTradelockerTradeLogs(userId: number, limit?: number): Promise<TradelockerTradeLog[]>;
  
  // AI Trade Results methods
  createAiTradeResult(result: InsertAiTradeResult): Promise<AiTradeResult>;
  updateAiTradeResult(id: number, userId: number, data: Partial<AiTradeResult>): Promise<AiTradeResult | undefined>;
  getAiTradeResultById(id: number): Promise<AiTradeResult | undefined>;
  getAiTradeResults(userId: number, limit?: number): Promise<AiTradeResult[]>;
  getAiTradeResultsBySymbol(userId: number, symbol: string, limit?: number): Promise<AiTradeResult[]>;
  getAiTradeResultByTicket(userId: number, ticket: string): Promise<AiTradeResult | undefined>;
  getAiTradeAccuracy(userId: number): Promise<{ daily: number; weekly: number; monthly: number; yearly: number; allTime: number; totalTrades: number; wins: number; losses: number }>;
  
  // Ambassador Training Progress methods
  getAmbassadorTrainingProgress(userId: number): Promise<AmbassadorTrainingProgress | undefined>;
  createAmbassadorTrainingProgress(progress: InsertAmbassadorTrainingProgress): Promise<AmbassadorTrainingProgress>;
  updateAmbassadorTrainingProgress(userId: number, data: Partial<AmbassadorTrainingProgress>): Promise<AmbassadorTrainingProgress | undefined>;
  
  // Ambassador Certification methods
  getAmbassadorCertification(userId: number): Promise<AmbassadorCertification | undefined>;
  getAmbassadorCertificationByNumber(certNumber: string): Promise<AmbassadorCertification | undefined>;
  createAmbassadorCertification(cert: InsertAmbassadorCertification): Promise<AmbassadorCertification>;
  updateAmbassadorCertification(id: number, data: Partial<AmbassadorCertification>): Promise<AmbassadorCertification | undefined>;
  getAllAmbassadorCertifications(): Promise<AmbassadorCertification[]>;
  
  // Wallet integration methods
  getUserByWalletAddress(walletAddress: string): Promise<User | undefined>;
  
  // Governance methods
  getGovernanceProposals(): Promise<GovernanceProposal[]>;
  getGovernanceProposal(id: number): Promise<GovernanceProposal | undefined>;
  createGovernanceProposal(proposal: InsertGovernanceProposal): Promise<GovernanceProposal>;
  updateGovernanceProposal(id: number, data: Partial<GovernanceProposal>): Promise<GovernanceProposal | undefined>;
  createGovernanceVote(vote: InsertGovernanceVote): Promise<GovernanceVote>;
  getUserVote(proposalId: number, userId: number): Promise<GovernanceVote | undefined>;
  
  // 44-Day Ambassador Content Flow methods
  getAmbassadorContentStats(userId: number): Promise<AmbassadorContentStats | undefined>;
  createAmbassadorContentStats(data: InsertAmbassadorContentStats): Promise<AmbassadorContentStats>;
  updateAmbassadorContentStats(userId: number, data: Partial<AmbassadorContentStats>): Promise<AmbassadorContentStats | undefined>;
  getAmbassadorContentProgress(userId: number): Promise<AmbassadorContentProgress[]>;
  getAmbassadorDayProgress(userId: number, dayNumber: number): Promise<AmbassadorContentProgress | undefined>;
  upsertAmbassadorDayProgress(userId: number, dayNumber: number, data: Partial<AmbassadorContentProgress>): Promise<AmbassadorContentProgress>;
  updateUserStreak(userId: number, data: Partial<UserStreak>): Promise<UserStreak | undefined>;

  // Community Features methods
  getSocialDirectionsForDay(dayNumber: number): Promise<AmbassadorSocialDirection[]>;
  createSocialDirection(data: InsertAmbassadorSocialDirection): Promise<AmbassadorSocialDirection>;
  
  getChallenges(status?: string): Promise<AmbassadorChallenge[]>;
  getChallengesByWeek(weekNumber: number): Promise<AmbassadorChallenge[]>;
  getChallenge(id: number): Promise<AmbassadorChallenge | undefined>;
  createChallenge(data: InsertAmbassadorChallenge): Promise<AmbassadorChallenge>;
  updateChallenge(id: number, data: Partial<AmbassadorChallenge>): Promise<AmbassadorChallenge | undefined>;
  
  joinChallenge(userId: number, challengeId: number): Promise<AmbassadorChallengeParticipant>;
  getChallengeParticipation(userId: number, challengeId: number): Promise<AmbassadorChallengeParticipant | undefined>;
  getUserChallenges(userId: number): Promise<(AmbassadorChallengeParticipant & { challenge: AmbassadorChallenge })[]>;
  updateChallengeProgress(userId: number, challengeId: number, data: Partial<AmbassadorChallengeParticipant>): Promise<AmbassadorChallengeParticipant | undefined>;
  
  getEvents(status?: string): Promise<AmbassadorEvent[]>;
  getEventsByWeek(weekNumber: number): Promise<AmbassadorEvent[]>;
  getEvent(id: number): Promise<AmbassadorEvent | undefined>;
  createEvent(data: InsertAmbassadorEvent): Promise<AmbassadorEvent>;
  updateEvent(id: number, data: Partial<AmbassadorEvent>): Promise<AmbassadorEvent | undefined>;
  
  registerForEvent(userId: number, eventId: number, role?: string): Promise<AmbassadorEventRegistration>;
  getEventRegistration(userId: number, eventId: number): Promise<AmbassadorEventRegistration | undefined>;
  getEventRegistrations(eventId: number): Promise<AmbassadorEventRegistration[]>;
  getUserEventRegistrations(userId: number): Promise<AmbassadorEventRegistration[]>;
  getUserEvents(userId: number): Promise<(AmbassadorEventRegistration & { event: AmbassadorEvent })[]>;
  updateEventRegistration(userId: number, eventId: number, data: Partial<AmbassadorEventRegistration>): Promise<AmbassadorEventRegistration | undefined>;
  getAmbassadorEvent(id: number): Promise<AmbassadorEvent | undefined>;
  updateAmbassadorEventRecording(eventId: number, recordingUrl: string, uploadedBy: number): Promise<AmbassadorEvent | undefined>;
  updateAmbassadorEventStatus(eventId: number, status: string): Promise<AmbassadorEvent | undefined>;

  // VEDD Token System methods
  getVeddPoolWallets(): Promise<VeddPoolWallet[]>;
  getAmbassadorRewardsByUser(userId: number): Promise<AmbassadorActionReward[]>;
  getVeddTransfersByUser(userId: number): Promise<VeddTransferJob[]>;
  getVerifiedUnprocessedRewards(userId: number): Promise<AmbassadorActionReward[]>;
  createVeddTransferJob(job: InsertVeddTransferJob): Promise<VeddTransferJob>;
  updateAmbassadorReward(id: number, data: Partial<AmbassadorActionReward>): Promise<AmbassadorActionReward | undefined>;
  
  // Internal Wallet methods
  getInternalWallet(userId: number): Promise<InternalWallet | undefined>;
  createOrUpdateInternalWallet(userId: number, data: Partial<InternalWallet>): Promise<InternalWallet>;
  addToWalletBalance(userId: number, amount: number, isPending?: boolean): Promise<InternalWallet>;
  
  // Withdrawal Request methods
  createWithdrawalRequest(userId: number, amount: number, destinationWallet: string): Promise<WithdrawalRequest>;
  getWithdrawalRequests(userId: number): Promise<WithdrawalRequest[]>;
  getAllWithdrawalRequests(): Promise<WithdrawalRequest[]>;
  updateWithdrawalRequest(id: number, data: Partial<WithdrawalRequest>): Promise<WithdrawalRequest | undefined>;
  
  // Connected Social Accounts methods
  getConnectedSocialAccounts(userId: number): Promise<ConnectedSocialAccount[]>;
  getConnectedSocialAccount(userId: number, platform: string): Promise<ConnectedSocialAccount | undefined>;
  connectSocialAccount(data: InsertConnectedSocialAccount): Promise<ConnectedSocialAccount>;
  disconnectSocialAccount(userId: number, platform: string): Promise<void>;
  updateSocialAccount(userId: number, platform: string, data: Partial<ConnectedSocialAccount>): Promise<ConnectedSocialAccount | undefined>;
  
  // Social Posts methods
  createSocialPost(data: InsertSocialPost): Promise<SocialPost>;
  getSocialPosts(userId: number): Promise<SocialPost[]>;
  updateSocialPost(id: number, data: Partial<SocialPost>): Promise<SocialPost | undefined>;
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

  async savEA(ea: InsertSavedEA): Promise<SavedEA> {
    const [savedEA] = await db
      .insert(savedEAs)
      .values(ea)
      .returning();
    return savedEA;
  }

  async getSavedEA(id: number): Promise<SavedEA | undefined> {
    const [ea] = await db
      .select()
      .from(savedEAs)
      .where(eq(savedEAs.id, id));
    return ea;
  }

  async getUserSavedEAs(userId: number): Promise<SavedEA[]> {
    return await db
      .select()
      .from(savedEAs)
      .where(eq(savedEAs.userId, userId))
      .orderBy(sql`${savedEAs.createdAt} DESC`);
  }

  async updateSavedEA(id: number, data: Partial<SavedEA>): Promise<SavedEA | undefined> {
    const [updated] = await db
      .update(savedEAs)
      .set(data)
      .where(eq(savedEAs.id, id))
      .returning();
    return updated;
  }

  async deleteSavedEA(id: number): Promise<boolean> {
    await db
      .delete(savedEAs)
      .where(eq(savedEAs.id, id));
    return true;
  }

  async shareEA(eaId: number, price: number): Promise<SavedEA | undefined> {
    const [ea] = await db
      .update(savedEAs)
      .set({
        isShared: true,
        price
      })
      .where(eq(savedEAs.id, eaId))
      .returning();
    return ea;
  }

  async unshareEA(eaId: number): Promise<SavedEA | undefined> {
    const [ea] = await db
      .update(savedEAs)
      .set({
        isShared: false
      })
      .where(eq(savedEAs.id, eaId))
      .returning();
    return ea;
  }

  async getSharedEAs(limit?: number): Promise<SavedEA[]> {
    const query = db
      .select()
      .from(savedEAs)
      .where(eq(savedEAs.isShared, true))
      .orderBy(sql`${savedEAs.shareCount} DESC`);
    
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async subscribeToEA(subscription: InsertEASubscription): Promise<EASubscription> {
    const [sub] = await db
      .insert(eaSubscriptions)
      .values(subscription)
      .returning();
    return sub;
  }

  async getEASubscription(id: number): Promise<EASubscription | undefined> {
    const [sub] = await db
      .select()
      .from(eaSubscriptions)
      .where(eq(eaSubscriptions.id, id));
    return sub;
  }

  async getUserSubscribedEAs(userId: number): Promise<(EASubscription & { ea: SavedEA; creator: User })[]> {
    const subscriptions = await db
      .select()
      .from(eaSubscriptions)
      .where(eq(eaSubscriptions.subscriberId, userId));
    
    const result = [];
    for (const sub of subscriptions) {
      const ea = await this.getSavedEA(sub.eaId);
      const creator = await this.getUser(sub.creatorId);
      if (ea && creator) {
        result.push({ ...sub, ea, creator });
      }
    }
    return result;
  }

  async getCreatorSubscribers(creatorId: number): Promise<EASubscription[]> {
    return await db
      .select()
      .from(eaSubscriptions)
      .where(eq(eaSubscriptions.creatorId, creatorId));
  }

  async cancelEASubscription(subscriptionId: number): Promise<boolean> {
    await db
      .update(eaSubscriptions)
      .set({ status: 'canceled' })
      .where(eq(eaSubscriptions.id, subscriptionId));
    return true;
  }

  async getEASubscriptionByEAAndUser(eaId: number, userId: number): Promise<EASubscription | undefined> {
    const [sub] = await db
      .select()
      .from(eaSubscriptions)
      .where(and(
        eq(eaSubscriptions.eaId, eaId),
        eq(eaSubscriptions.subscriberId, userId)
      ));
    return sub;
  }

  async createMarketDataSnapshot(snapshot: InsertMarketDataSnapshot): Promise<MarketDataSnapshot> {
    const [created] = await db
      .insert(marketDataSnapshots)
      .values(snapshot)
      .returning();
    return created;
  }

  async getMarketDataSnapshot(symbol: string, timeframe: string): Promise<MarketDataSnapshot | undefined> {
    const [snapshot] = await db
      .select()
      .from(marketDataSnapshots)
      .where(and(
        eq(marketDataSnapshots.symbol, symbol),
        eq(marketDataSnapshots.timeframe, timeframe)
      ))
      .orderBy(sql`${marketDataSnapshots.capturedAt} DESC`)
      .limit(1);
    return snapshot;
  }

  async getLatestSnapshot(symbol: string, timeframe: string): Promise<MarketDataSnapshot | undefined> {
    return this.getMarketDataSnapshot(symbol, timeframe);
  }

  async createRefreshJob(job: InsertMarketDataRefreshJob): Promise<MarketDataRefreshJob> {
    const [created] = await db
      .insert(marketDataRefreshJobs)
      .values(job)
      .returning();
    return created;
  }

  async updateRefreshJob(id: number, data: Partial<MarketDataRefreshJob>): Promise<MarketDataRefreshJob | undefined> {
    const [updated] = await db
      .update(marketDataRefreshJobs)
      .set(data)
      .where(eq(marketDataRefreshJobs.id, id))
      .returning();
    return updated;
  }

  async getRefreshJobsByEA(eaId: number): Promise<MarketDataRefreshJob[]> {
    return await db
      .select()
      .from(marketDataRefreshJobs)
      .where(eq(marketDataRefreshJobs.eaId, eaId))
      .orderBy(sql`${marketDataRefreshJobs.triggeredAt} DESC`);
  }

  async createEAShareAsset(asset: InsertEAShareAsset): Promise<EAShareAsset> {
    const [created] = await db
      .insert(eaShareAssets)
      .values(asset)
      .returning();
    return created;
  }

  async getEAShareAsset(eaId: number): Promise<EAShareAsset | undefined> {
    const [asset] = await db
      .select()
      .from(eaShareAssets)
      .where(eq(eaShareAssets.eaId, eaId))
      .orderBy(sql`${eaShareAssets.createdAt} DESC`)
      .limit(1);
    return asset;
  }

  async getEAShareAssetByShareUrl(shareUrl: string): Promise<EAShareAsset | undefined> {
    const [asset] = await db
      .select()
      .from(eaShareAssets)
      .where(eq(eaShareAssets.shareUrl, shareUrl));
    return asset;
  }

  async updateEAShareAsset(id: number, data: Partial<EAShareAsset>): Promise<EAShareAsset | undefined> {
    const [updated] = await db
      .update(eaShareAssets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(eaShareAssets.id, id))
      .returning();
    return updated;
  }

  async incrementShareAssetViewCount(id: number): Promise<void> {
    await db
      .update(eaShareAssets)
      .set({ viewCount: sql`${eaShareAssets.viewCount} + 1` })
      .where(eq(eaShareAssets.id, id));
  }

  async incrementShareAssetShareCount(id: number): Promise<void> {
    await db
      .update(eaShareAssets)
      .set({ shareCount: sql`${eaShareAssets.shareCount} + 1` })
      .where(eq(eaShareAssets.id, id));
  }

  async updateUserSubscription(userId: number, subscriptionData: {
    planId: number;
    status: string;
    stripeSubscriptionId?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
  }): Promise<void> {
    await db
      .update(users)
      .set({
        subscriptionPlanId: subscriptionData.planId,
        subscriptionStatus: subscriptionData.status,
        stripeSubscriptionId: subscriptionData.stripeSubscriptionId || null,
        subscriptionCurrentPeriodEnd: subscriptionData.currentPeriodEnd || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async getUserStreak(userId: number): Promise<UserStreak | undefined> {
    const [streak] = await db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.userId, userId));
    return streak;
  }

  async createOrUpdateStreak(userId: number, data: Partial<UserStreak>): Promise<UserStreak> {
    const existing = await this.getUserStreak(userId);
    
    if (existing) {
      const [updated] = await db
        .update(userStreaks)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userStreaks.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(userStreaks)
        .values({ userId, ...data })
        .returning();
      return created;
    }
  }

  async recordActivity(userId: number, activityType: 'chart' | 'ea' | 'trade'): Promise<{ 
    streak: UserStreak; 
    streakIncreased: boolean; 
    tierUp: boolean; 
    newTier?: string; 
  }> {
    let streak = await this.getUserStreak(userId);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let streakIncreased = false;
    let tierUp = false;
    let newTier: string | undefined;
    
    if (!streak) {
      streak = await this.createOrUpdateStreak(userId, {
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: now,
        totalChartsAnalyzed: activityType === 'chart' ? 1 : 0,
        totalEAsCreated: activityType === 'ea' ? 1 : 0,
        totalTrades: activityType === 'trade' ? 1 : 0,
        weeklyChartsAnalyzed: activityType === 'chart' ? 1 : 0,
        weeklyEAsCreated: activityType === 'ea' ? 1 : 0,
        weekStartDate: now,
        xpPoints: activityType === 'chart' ? 25 : activityType === 'ea' ? 50 : 10,
        tier: 'YG',
        tierProgress: 0,
      });
      streakIncreased = true;
    } else {
      const lastActivity = streak.lastActivityDate ? new Date(streak.lastActivityDate) : null;
      const lastActivityDate = lastActivity ? new Date(lastActivity.getFullYear(), lastActivity.getMonth(), lastActivity.getDate()) : null;
      
      const diffDays = lastActivityDate ? Math.floor((today.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)) : -1;
      
      let newCurrentStreak = streak.currentStreak;
      
      if (diffDays === 1) {
        newCurrentStreak = streak.currentStreak + 1;
        streakIncreased = true;
      } else if (diffDays > 1) {
        newCurrentStreak = 1;
        streakIncreased = true;
      }
      
      const xpGain = activityType === 'chart' ? 25 : activityType === 'ea' ? 50 : 10;
      let bonusXP = 0;
      
      if (newCurrentStreak === 7) bonusXP = 250;
      else if (newCurrentStreak === 30) bonusXP = 1000;
      
      const newXP = streak.xpPoints + xpGain + bonusXP;
      const oldTier = streak.tier;
      let newTierValue = oldTier;
      
      const tiers = ['YG', 'Rising', 'Pro', 'Elite', 'OG'];
      for (const tier of tiers) {
        const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG];
        if (newXP >= config.minXP) {
          newTierValue = tier;
        }
      }
      
      if (newTierValue !== oldTier) {
        tierUp = true;
        newTier = newTierValue;
      }
      
      const weekStart = streak.weekStartDate ? new Date(streak.weekStartDate) : null;
      const shouldResetWeekly = !weekStart || (now.getTime() - weekStart.getTime() > 7 * 24 * 60 * 60 * 1000);
      
      streak = await this.createOrUpdateStreak(userId, {
        currentStreak: newCurrentStreak,
        longestStreak: Math.max(streak.longestStreak, newCurrentStreak),
        lastActivityDate: now,
        totalChartsAnalyzed: streak.totalChartsAnalyzed + (activityType === 'chart' ? 1 : 0),
        totalEAsCreated: streak.totalEAsCreated + (activityType === 'ea' ? 1 : 0),
        totalTrades: streak.totalTrades + (activityType === 'trade' ? 1 : 0),
        weeklyChartsAnalyzed: shouldResetWeekly ? (activityType === 'chart' ? 1 : 0) : streak.weeklyChartsAnalyzed + (activityType === 'chart' ? 1 : 0),
        weeklyEAsCreated: shouldResetWeekly ? (activityType === 'ea' ? 1 : 0) : streak.weeklyEAsCreated + (activityType === 'ea' ? 1 : 0),
        weekStartDate: shouldResetWeekly ? now : streak.weekStartDate,
        xpPoints: newXP,
        tier: newTierValue,
      });
    }
    
    return { streak, streakIncreased, tierUp, newTier };
  }

  // Scenario Analysis methods
  async createScenarioAnalysis(analysis: InsertScenarioAnalysis): Promise<ScenarioAnalysis> {
    const [result] = await db.insert(scenarioAnalyses).values(analysis).returning();
    return result;
  }

  async getScenarioAnalysis(id: number): Promise<ScenarioAnalysis | undefined> {
    const [result] = await db.select().from(scenarioAnalyses).where(eq(scenarioAnalyses.id, id));
    return result;
  }

  async getUserScenarioAnalyses(userId: number): Promise<ScenarioAnalysis[]> {
    return await db.select().from(scenarioAnalyses).where(eq(scenarioAnalyses.userId, userId));
  }

  async getScenariosByChartAnalysis(chartAnalysisId: number): Promise<ScenarioAnalysis[]> {
    return await db.select().from(scenarioAnalyses).where(eq(scenarioAnalyses.chartAnalysisId, chartAnalysisId));
  }

  // Webhook methods
  async createWebhook(webhook: InsertWebhookConfig): Promise<WebhookConfig> {
    const [result] = await db.insert(webhookConfigs).values(webhook).returning();
    return result;
  }

  async getWebhook(id: number): Promise<WebhookConfig | undefined> {
    const [result] = await db.select().from(webhookConfigs).where(eq(webhookConfigs.id, id));
    return result;
  }

  async getUserWebhooks(userId: number): Promise<WebhookConfig[]> {
    return await db.select().from(webhookConfigs).where(eq(webhookConfigs.userId, userId));
  }

  async getActiveWebhooksByTrigger(userId: number, triggerType: string): Promise<WebhookConfig[]> {
    const userWebhooks = await db.select().from(webhookConfigs)
      .where(and(
        eq(webhookConfigs.userId, userId),
        eq(webhookConfigs.isActive, true)
      ));
    return userWebhooks.filter(w => {
      const triggers = w.triggerOn as string[];
      return triggers && triggers.includes(triggerType);
    });
  }

  async updateWebhook(id: number, data: Partial<WebhookConfig>): Promise<WebhookConfig | undefined> {
    const [result] = await db.update(webhookConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(webhookConfigs.id, id))
      .returning();
    return result;
  }

  async deleteWebhook(id: number): Promise<boolean> {
    const result = await db.delete(webhookConfigs).where(eq(webhookConfigs.id, id));
    return true;
  }

  async logWebhookCall(log: InsertWebhookLog): Promise<WebhookLog> {
    const [result] = await db.insert(webhookLogs).values(log).returning();
    return result;
  }

  async getWebhookLogs(webhookId: number, limit: number = 50): Promise<WebhookLog[]> {
    return await db.select().from(webhookLogs)
      .where(eq(webhookLogs.webhookId, webhookId))
      .limit(limit);
  }

  // MT5 API Token methods
  async createMt5ApiToken(userId: number, name: string): Promise<Mt5ApiToken> {
    const token = crypto.randomBytes(32).toString('hex');
    const [result] = await db.insert(mt5ApiTokens).values({
      userId,
      name,
      token,
      isActive: true,
      signalCount: 0,
    }).returning();
    return result;
  }

  async getMt5ApiToken(id: number): Promise<Mt5ApiToken | undefined> {
    const [result] = await db.select().from(mt5ApiTokens).where(eq(mt5ApiTokens.id, id));
    return result;
  }

  async getMt5ApiTokenByToken(token: string): Promise<Mt5ApiToken | undefined> {
    const [result] = await db.select().from(mt5ApiTokens).where(eq(mt5ApiTokens.token, token));
    return result;
  }

  async getUserMt5ApiTokens(userId: number): Promise<Mt5ApiToken[]> {
    return await db.select().from(mt5ApiTokens).where(eq(mt5ApiTokens.userId, userId));
  }

  async updateMt5ApiToken(id: number, data: Partial<Mt5ApiToken>): Promise<Mt5ApiToken | undefined> {
    const [result] = await db.update(mt5ApiTokens)
      .set(data)
      .where(eq(mt5ApiTokens.id, id))
      .returning();
    return result;
  }

  async deleteMt5ApiToken(id: number): Promise<boolean> {
    await db.delete(mt5ApiTokens).where(eq(mt5ApiTokens.id, id));
    return true;
  }

  async incrementMt5TokenSignalCount(tokenId: number): Promise<void> {
    await db.update(mt5ApiTokens)
      .set({ 
        signalCount: sql`${mt5ApiTokens.signalCount} + 1`,
        lastUsedAt: new Date()
      })
      .where(eq(mt5ApiTokens.id, tokenId));
  }

  // MT5 Signal Log methods
  async createMt5SignalLog(log: InsertMt5SignalLog): Promise<Mt5SignalLog> {
    const [result] = await db.insert(mt5SignalLogs).values(log).returning();
    return result;
  }

  async getMt5SignalLogs(userId: number, limit: number = 100): Promise<Mt5SignalLog[]> {
    return await db.select().from(mt5SignalLogs)
      .where(eq(mt5SignalLogs.userId, userId))
      .orderBy(desc(mt5SignalLogs.createdAt))
      .limit(limit);
  }

  // TradeLocker Connection methods
  async createTradelockerConnection(connection: InsertTradelockerConnection): Promise<TradelockerConnection> {
    const [result] = await db.insert(tradelockerConnections).values(connection).returning();
    return result;
  }

  async getTradelockerConnection(id: number): Promise<TradelockerConnection | undefined> {
    const [result] = await db.select().from(tradelockerConnections).where(eq(tradelockerConnections.id, id));
    return result;
  }

  async getUserTradelockerConnection(userId: number): Promise<TradelockerConnection | undefined> {
    const [result] = await db.select().from(tradelockerConnections).where(eq(tradelockerConnections.userId, userId));
    return result;
  }

  async updateTradelockerConnection(id: number, data: Partial<TradelockerConnection>): Promise<TradelockerConnection | undefined> {
    const [result] = await db.update(tradelockerConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tradelockerConnections.id, id))
      .returning();
    return result;
  }

  async deleteTradelockerConnection(id: number): Promise<boolean> {
    // First delete all trade logs referencing this connection
    await db.delete(tradelockerTradeLogs).where(eq(tradelockerTradeLogs.connectionId, id));
    // Then delete the connection
    await db.delete(tradelockerConnections).where(eq(tradelockerConnections.id, id));
    return true;
  }

  // TradeLocker Trade Log methods
  async createTradelockerTradeLog(log: InsertTradelockerTradeLog): Promise<TradelockerTradeLog> {
    const [result] = await db.insert(tradelockerTradeLogs).values(log).returning();
    return result;
  }

  async getTradelockerTradeLogs(userId: number, limit: number = 100): Promise<TradelockerTradeLog[]> {
    return await db.select().from(tradelockerTradeLogs)
      .where(eq(tradelockerTradeLogs.userId, userId))
      .orderBy(desc(tradelockerTradeLogs.createdAt))
      .limit(limit);
  }

  // AI Trade Results methods
  async createAiTradeResult(result: InsertAiTradeResult): Promise<AiTradeResult> {
    const [created] = await db.insert(aiTradeResults).values(result).returning();
    return created;
  }

  async updateAiTradeResult(id: number, userId: number, data: Partial<AiTradeResult>): Promise<AiTradeResult | undefined> {
    const [updated] = await db.update(aiTradeResults)
      .set(data)
      .where(and(eq(aiTradeResults.id, id), eq(aiTradeResults.userId, userId)))
      .returning();
    return updated;
  }

  async getAiTradeResultById(id: number): Promise<AiTradeResult | undefined> {
    const [result] = await db.select().from(aiTradeResults)
      .where(eq(aiTradeResults.id, id))
      .limit(1);
    return result;
  }

  async getAiTradeResults(userId: number, limit: number = 100): Promise<AiTradeResult[]> {
    return await db.select().from(aiTradeResults)
      .where(eq(aiTradeResults.userId, userId))
      .orderBy(desc(aiTradeResults.createdAt))
      .limit(limit);
  }

  async getAiTradeResultsBySymbol(userId: number, symbol: string, limit: number = 500): Promise<AiTradeResult[]> {
    return await db.select().from(aiTradeResults)
      .where(and(
        eq(aiTradeResults.userId, userId),
        sql`UPPER(${aiTradeResults.symbol}) LIKE UPPER(${'%' + symbol + '%'})`
      ))
      .orderBy(desc(aiTradeResults.createdAt))
      .limit(limit);
  }

  async getAiTradeResultByTicket(userId: number, ticket: string): Promise<AiTradeResult | undefined> {
    const results = await db.select().from(aiTradeResults)
      .where(and(
        eq(aiTradeResults.userId, userId),
        eq(aiTradeResults.mt5Ticket, ticket)
      ))
      .limit(1);
    return results[0];
  }

  async getAiTradeAccuracy(userId: number): Promise<{ daily: number; weekly: number; monthly: number; yearly: number; allTime: number; totalTrades: number; wins: number; losses: number }> {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // Get all completed trades for user
    const allTrades = await db.select().from(aiTradeResults)
      .where(and(
        eq(aiTradeResults.userId, userId),
        sql`${aiTradeResults.result} IN ('WIN', 'LOSS', 'BREAKEVEN')`
      ));

    const calculateAccuracy = (trades: typeof allTrades) => {
      if (trades.length === 0) return 0;
      const wins = trades.filter(t => t.result === 'WIN').length;
      return Math.round((wins / trades.length) * 100);
    };

    const dailyTrades = allTrades.filter(t => t.closedAt && new Date(t.closedAt) >= dayStart);
    const weeklyTrades = allTrades.filter(t => t.closedAt && new Date(t.closedAt) >= weekStart);
    const monthlyTrades = allTrades.filter(t => t.closedAt && new Date(t.closedAt) >= monthStart);
    const yearlyTrades = allTrades.filter(t => t.closedAt && new Date(t.closedAt) >= yearStart);

    return {
      daily: calculateAccuracy(dailyTrades),
      weekly: calculateAccuracy(weeklyTrades),
      monthly: calculateAccuracy(monthlyTrades),
      yearly: calculateAccuracy(yearlyTrades),
      allTime: calculateAccuracy(allTrades),
      totalTrades: allTrades.length,
      wins: allTrades.filter(t => t.result === 'WIN').length,
      losses: allTrades.filter(t => t.result === 'LOSS').length
    };
  }

  // Ambassador Training Progress methods
  async getAmbassadorTrainingProgress(userId: number): Promise<AmbassadorTrainingProgress | undefined> {
    const [result] = await db.select().from(ambassadorTrainingProgress)
      .where(eq(ambassadorTrainingProgress.userId, userId));
    return result;
  }

  async createAmbassadorTrainingProgress(progress: InsertAmbassadorTrainingProgress): Promise<AmbassadorTrainingProgress> {
    const [result] = await db.insert(ambassadorTrainingProgress).values(progress).returning();
    return result;
  }

  async updateAmbassadorTrainingProgress(userId: number, data: Partial<AmbassadorTrainingProgress>): Promise<AmbassadorTrainingProgress | undefined> {
    const [result] = await db.update(ambassadorTrainingProgress)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ambassadorTrainingProgress.userId, userId))
      .returning();
    return result;
  }

  // Ambassador Certification methods
  async getAmbassadorCertification(userId: number): Promise<AmbassadorCertification | undefined> {
    const [result] = await db.select().from(ambassadorCertifications)
      .where(eq(ambassadorCertifications.userId, userId));
    return result;
  }

  async getAmbassadorCertificationByNumber(certNumber: string): Promise<AmbassadorCertification | undefined> {
    const [result] = await db.select().from(ambassadorCertifications)
      .where(eq(ambassadorCertifications.certificateNumber, certNumber));
    return result;
  }

  async createAmbassadorCertification(cert: InsertAmbassadorCertification): Promise<AmbassadorCertification> {
    const [result] = await db.insert(ambassadorCertifications).values(cert).returning();
    return result;
  }

  async updateAmbassadorCertification(id: number, data: Partial<AmbassadorCertification>): Promise<AmbassadorCertification | undefined> {
    const [result] = await db.update(ambassadorCertifications)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ambassadorCertifications.id, id))
      .returning();
    return result;
  }

  async getAllAmbassadorCertifications(): Promise<AmbassadorCertification[]> {
    return await db.select().from(ambassadorCertifications)
      .orderBy(desc(ambassadorCertifications.issueDate));
  }

  // Wallet integration methods
  async getUserByWalletAddress(walletAddress: string): Promise<User | undefined> {
    const [user] = await db.select().from(users)
      .where(eq(users.walletAddress, walletAddress));
    return user;
  }

  // Governance methods
  async getGovernanceProposals(): Promise<GovernanceProposal[]> {
    return await db.select().from(governanceProposals)
      .orderBy(desc(governanceProposals.createdAt));
  }

  async getGovernanceProposal(id: number): Promise<GovernanceProposal | undefined> {
    const [result] = await db.select().from(governanceProposals)
      .where(eq(governanceProposals.id, id));
    return result;
  }

  async createGovernanceProposal(proposal: InsertGovernanceProposal): Promise<GovernanceProposal> {
    const [result] = await db.insert(governanceProposals).values(proposal).returning();
    return result;
  }

  async updateGovernanceProposal(id: number, data: Partial<GovernanceProposal>): Promise<GovernanceProposal | undefined> {
    const [result] = await db.update(governanceProposals)
      .set(data)
      .where(eq(governanceProposals.id, id))
      .returning();
    return result;
  }

  async createGovernanceVote(vote: InsertGovernanceVote): Promise<GovernanceVote> {
    const [result] = await db.insert(governanceVotes).values(vote).returning();
    return result;
  }

  async getUserVote(proposalId: number, userId: number): Promise<GovernanceVote | undefined> {
    const [result] = await db.select().from(governanceVotes)
      .where(and(
        eq(governanceVotes.proposalId, proposalId),
        eq(governanceVotes.userId, userId)
      ));
    return result;
  }

  // 44-Day Ambassador Content Flow methods
  async getAmbassadorContentStats(userId: number): Promise<AmbassadorContentStats | undefined> {
    const [result] = await db.select().from(ambassadorContentStats)
      .where(eq(ambassadorContentStats.userId, userId));
    return result;
  }

  async createAmbassadorContentStats(data: InsertAmbassadorContentStats): Promise<AmbassadorContentStats> {
    const [result] = await db.insert(ambassadorContentStats).values(data).returning();
    return result;
  }

  async updateAmbassadorContentStats(userId: number, data: Partial<AmbassadorContentStats>): Promise<AmbassadorContentStats | undefined> {
    const [result] = await db.update(ambassadorContentStats)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ambassadorContentStats.userId, userId))
      .returning();
    return result;
  }

  async getAmbassadorContentProgress(userId: number): Promise<AmbassadorContentProgress[]> {
    return await db.select().from(ambassadorContentProgress)
      .where(eq(ambassadorContentProgress.userId, userId))
      .orderBy(ambassadorContentProgress.dayNumber);
  }

  async getAmbassadorDayProgress(userId: number, dayNumber: number): Promise<AmbassadorContentProgress | undefined> {
    const [result] = await db.select().from(ambassadorContentProgress)
      .where(and(
        eq(ambassadorContentProgress.userId, userId),
        eq(ambassadorContentProgress.dayNumber, dayNumber)
      ));
    return result;
  }

  async upsertAmbassadorDayProgress(userId: number, dayNumber: number, data: Partial<AmbassadorContentProgress>): Promise<AmbassadorContentProgress> {
    const existing = await this.getAmbassadorDayProgress(userId, dayNumber);
    
    if (existing) {
      const [result] = await db.update(ambassadorContentProgress)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(ambassadorContentProgress.userId, userId),
          eq(ambassadorContentProgress.dayNumber, dayNumber)
        ))
        .returning();
      return result;
    } else {
      const [result] = await db.insert(ambassadorContentProgress)
        .values({
          userId,
          dayNumber,
          status: data.status || 'available',
          ...data
        })
        .returning();
      return result;
    }
  }

  async updateUserStreak(userId: number, data: Partial<UserStreak>): Promise<UserStreak | undefined> {
    const [result] = await db.update(userStreaks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userStreaks.userId, userId))
      .returning();
    return result;
  }

  // Community Features implementations
  async getSocialDirectionsForDay(dayNumber: number): Promise<AmbassadorSocialDirection[]> {
    return await db.select().from(ambassadorSocialDirections)
      .where(eq(ambassadorSocialDirections.dayNumber, dayNumber));
  }

  async createSocialDirection(data: InsertAmbassadorSocialDirection): Promise<AmbassadorSocialDirection> {
    const [result] = await db.insert(ambassadorSocialDirections).values(data).returning();
    return result;
  }

  async getChallenges(status?: string): Promise<AmbassadorChallenge[]> {
    if (status) {
      return await db.select().from(ambassadorChallenges)
        .where(eq(ambassadorChallenges.status, status))
        .orderBy(desc(ambassadorChallenges.startDate));
    }
    return await db.select().from(ambassadorChallenges)
      .orderBy(desc(ambassadorChallenges.startDate));
  }

  async getChallengesByWeek(weekNumber: number): Promise<AmbassadorChallenge[]> {
    return await db.select().from(ambassadorChallenges)
      .where(eq(ambassadorChallenges.weekNumber, weekNumber));
  }

  async getChallenge(id: number): Promise<AmbassadorChallenge | undefined> {
    const [result] = await db.select().from(ambassadorChallenges)
      .where(eq(ambassadorChallenges.id, id));
    return result;
  }

  async createChallenge(data: InsertAmbassadorChallenge): Promise<AmbassadorChallenge> {
    const [result] = await db.insert(ambassadorChallenges).values(data).returning();
    return result;
  }

  async updateChallenge(id: number, data: Partial<AmbassadorChallenge>): Promise<AmbassadorChallenge | undefined> {
    const [result] = await db.update(ambassadorChallenges)
      .set(data)
      .where(eq(ambassadorChallenges.id, id))
      .returning();
    return result;
  }

  async joinChallenge(userId: number, challengeId: number): Promise<AmbassadorChallengeParticipant> {
    const [result] = await db.insert(ambassadorChallengeParticipants)
      .values({ userId, challengeId, status: 'joined' })
      .returning();
    return result;
  }

  async getChallengeParticipation(userId: number, challengeId: number): Promise<AmbassadorChallengeParticipant | undefined> {
    const [result] = await db.select().from(ambassadorChallengeParticipants)
      .where(and(
        eq(ambassadorChallengeParticipants.userId, userId),
        eq(ambassadorChallengeParticipants.challengeId, challengeId)
      ));
    return result;
  }

  async getUserChallenges(userId: number): Promise<(AmbassadorChallengeParticipant & { challenge: AmbassadorChallenge })[]> {
    const participations = await db.select().from(ambassadorChallengeParticipants)
      .where(eq(ambassadorChallengeParticipants.userId, userId));
    
    const result: (AmbassadorChallengeParticipant & { challenge: AmbassadorChallenge })[] = [];
    for (const p of participations) {
      const challenge = await this.getChallenge(p.challengeId);
      if (challenge) {
        result.push({ ...p, challenge });
      }
    }
    return result;
  }

  async updateChallengeProgress(userId: number, challengeId: number, data: Partial<AmbassadorChallengeParticipant>): Promise<AmbassadorChallengeParticipant | undefined> {
    const [result] = await db.update(ambassadorChallengeParticipants)
      .set(data)
      .where(and(
        eq(ambassadorChallengeParticipants.userId, userId),
        eq(ambassadorChallengeParticipants.challengeId, challengeId)
      ))
      .returning();
    return result;
  }

  async getEvents(status?: string): Promise<AmbassadorEvent[]> {
    if (status) {
      return await db.select().from(ambassadorEvents)
        .where(eq(ambassadorEvents.status, status))
        .orderBy(desc(ambassadorEvents.scheduledDate));
    }
    return await db.select().from(ambassadorEvents)
      .orderBy(desc(ambassadorEvents.scheduledDate));
  }

  async getEventsByWeek(weekNumber: number): Promise<AmbassadorEvent[]> {
    return await db.select().from(ambassadorEvents)
      .where(eq(ambassadorEvents.weekNumber, weekNumber));
  }

  async getEvent(id: number): Promise<AmbassadorEvent | undefined> {
    const [result] = await db.select().from(ambassadorEvents)
      .where(eq(ambassadorEvents.id, id));
    return result;
  }

  async createEvent(data: InsertAmbassadorEvent): Promise<AmbassadorEvent> {
    const [result] = await db.insert(ambassadorEvents).values(data).returning();
    return result;
  }

  async updateEvent(id: number, data: Partial<AmbassadorEvent>): Promise<AmbassadorEvent | undefined> {
    const [result] = await db.update(ambassadorEvents)
      .set(data)
      .where(eq(ambassadorEvents.id, id))
      .returning();
    return result;
  }

  async registerForEvent(userId: number, eventId: number, role: string = 'attendee'): Promise<AmbassadorEventRegistration> {
    const [result] = await db.insert(ambassadorEventRegistrations)
      .values({ userId, eventId, role, status: 'registered' })
      .returning();
    return result;
  }

  async getEventRegistration(userId: number, eventId: number): Promise<AmbassadorEventRegistration | undefined> {
    const [result] = await db.select().from(ambassadorEventRegistrations)
      .where(and(
        eq(ambassadorEventRegistrations.userId, userId),
        eq(ambassadorEventRegistrations.eventId, eventId)
      ));
    return result;
  }

  async getUserEvents(userId: number): Promise<(AmbassadorEventRegistration & { event: AmbassadorEvent })[]> {
    const registrations = await db.select().from(ambassadorEventRegistrations)
      .where(eq(ambassadorEventRegistrations.userId, userId));
    
    const result: (AmbassadorEventRegistration & { event: AmbassadorEvent })[] = [];
    for (const r of registrations) {
      const event = await this.getEvent(r.eventId);
      if (event) {
        result.push({ ...r, event });
      }
    }
    return result;
  }

  async updateEventRegistration(userId: number, eventId: number, data: Partial<AmbassadorEventRegistration>): Promise<AmbassadorEventRegistration | undefined> {
    const [result] = await db.update(ambassadorEventRegistrations)
      .set(data)
      .where(and(
        eq(ambassadorEventRegistrations.userId, userId),
        eq(ambassadorEventRegistrations.eventId, eventId)
      ))
      .returning();
    return result;
  }

  async getEventRegistrations(eventId: number): Promise<AmbassadorEventRegistration[]> {
    return await db.select().from(ambassadorEventRegistrations)
      .where(eq(ambassadorEventRegistrations.eventId, eventId));
  }

  async getUserEventRegistrations(userId: number): Promise<AmbassadorEventRegistration[]> {
    return await db.select().from(ambassadorEventRegistrations)
      .where(eq(ambassadorEventRegistrations.userId, userId));
  }

  async getAmbassadorEvent(id: number): Promise<AmbassadorEvent | undefined> {
    const [result] = await db.select().from(ambassadorEvents).where(eq(ambassadorEvents.id, id));
    return result;
  }

  async updateAmbassadorEventRecording(eventId: number, recordingUrl: string, uploadedBy: number): Promise<AmbassadorEvent | undefined> {
    const [result] = await db.update(ambassadorEvents)
      .set({
        recordingUrl,
        recordingUploadedAt: new Date(),
        recordingUploadedBy: uploadedBy,
      })
      .where(eq(ambassadorEvents.id, eventId))
      .returning();
    return result;
  }

  async updateAmbassadorEventStatus(eventId: number, status: string): Promise<AmbassadorEvent | undefined> {
    const [result] = await db.update(ambassadorEvents)
      .set({ status })
      .where(eq(ambassadorEvents.id, eventId))
      .returning();
    return result;
  }

  // Challenge Sessions - for AI-guided challenge completion
  async getChallengeSession(userId: number, challengeId: number): Promise<AmbassadorChallengeSession | undefined> {
    const [result] = await db.select().from(ambassadorChallengeSessions)
      .where(and(
        eq(ambassadorChallengeSessions.userId, userId),
        eq(ambassadorChallengeSessions.challengeId, challengeId)
      ));
    return result;
  }

  async createChallengeSession(data: InsertAmbassadorChallengeSession): Promise<AmbassadorChallengeSession> {
    const [result] = await db.insert(ambassadorChallengeSessions).values(data).returning();
    return result;
  }

  async updateChallengeSession(userId: number, challengeId: number, data: Partial<AmbassadorChallengeSession>): Promise<AmbassadorChallengeSession | undefined> {
    const [result] = await db.update(ambassadorChallengeSessions)
      .set(data)
      .where(and(
        eq(ambassadorChallengeSessions.userId, userId),
        eq(ambassadorChallengeSessions.challengeId, challengeId)
      ))
      .returning();
    return result;
  }

  async getUserChallengeSessions(userId: number): Promise<AmbassadorChallengeSession[]> {
    return await db.select().from(ambassadorChallengeSessions)
      .where(eq(ambassadorChallengeSessions.userId, userId));
  }

  // Event Schedules - for host-created sessions
  async getEventSchedules(eventId: number): Promise<AmbassadorEventSchedule[]> {
    return await db.select().from(ambassadorEventSchedules)
      .where(eq(ambassadorEventSchedules.eventId, eventId))
      .orderBy(ambassadorEventSchedules.startAt);
  }

  async getUpcomingSchedules(eventId: number): Promise<AmbassadorEventSchedule[]> {
    return await db.select().from(ambassadorEventSchedules)
      .where(and(
        eq(ambassadorEventSchedules.eventId, eventId),
        eq(ambassadorEventSchedules.status, 'scheduled')
      ))
      .orderBy(ambassadorEventSchedules.startAt);
  }

  async getSchedule(id: number): Promise<AmbassadorEventSchedule | undefined> {
    const [result] = await db.select().from(ambassadorEventSchedules)
      .where(eq(ambassadorEventSchedules.id, id));
    return result;
  }

  async getScheduleBySlug(slug: string): Promise<AmbassadorEventSchedule | undefined> {
    const [result] = await db.select().from(ambassadorEventSchedules)
      .where(eq(ambassadorEventSchedules.shareSlug, slug));
    return result;
  }

  async createEventSchedule(data: InsertAmbassadorEventSchedule): Promise<AmbassadorEventSchedule> {
    const [result] = await db.insert(ambassadorEventSchedules).values(data).returning();
    return result;
  }

  async updateEventSchedule(id: number, data: Partial<AmbassadorEventSchedule>): Promise<AmbassadorEventSchedule | undefined> {
    const [result] = await db.update(ambassadorEventSchedules)
      .set(data)
      .where(eq(ambassadorEventSchedules.id, id))
      .returning();
    return result;
  }

  async getHostSchedules(hostId: number): Promise<AmbassadorEventSchedule[]> {
    return await db.select().from(ambassadorEventSchedules)
      .where(eq(ambassadorEventSchedules.hostId, hostId))
      .orderBy(desc(ambassadorEventSchedules.createdAt));
  }

  async getAllAmbassadorSchedules(): Promise<AmbassadorEventSchedule[]> {
    return await db.select().from(ambassadorEventSchedules)
      .orderBy(desc(ambassadorEventSchedules.createdAt));
  }

  // Schedule Registrations
  async registerForSchedule(userId: number, scheduleId: number): Promise<AmbassadorScheduleRegistration> {
    const [result] = await db.insert(ambassadorScheduleRegistrations)
      .values({ userId, scheduleId })
      .returning();
    // Increment attendee count
    await db.update(ambassadorEventSchedules)
      .set({ currentAttendees: sql`${ambassadorEventSchedules.currentAttendees} + 1` })
      .where(eq(ambassadorEventSchedules.id, scheduleId));
    return result;
  }

  async getScheduleRegistration(userId: number, scheduleId: number): Promise<AmbassadorScheduleRegistration | undefined> {
    const [result] = await db.select().from(ambassadorScheduleRegistrations)
      .where(and(
        eq(ambassadorScheduleRegistrations.userId, userId),
        eq(ambassadorScheduleRegistrations.scheduleId, scheduleId)
      ));
    return result;
  }

  async getScheduleRegistrations(scheduleId: number): Promise<AmbassadorScheduleRegistration[]> {
    return await db.select().from(ambassadorScheduleRegistrations)
      .where(eq(ambassadorScheduleRegistrations.scheduleId, scheduleId));
  }

  // Community Comments
  async getComments(targetType: string, targetId: number): Promise<(AmbassadorCommunityComment & { author?: User })[]> {
    const comments = await db.select().from(ambassadorCommunityComments)
      .where(and(
        eq(ambassadorCommunityComments.targetType, targetType),
        eq(ambassadorCommunityComments.targetId, targetId)
      ))
      .orderBy(ambassadorCommunityComments.createdAt);
    
    // Fetch author info for each comment
    const commentsWithAuthors = await Promise.all(comments.map(async (comment) => {
      const [author] = await db.select().from(users).where(eq(users.id, comment.authorId));
      return { ...comment, author };
    }));
    
    return commentsWithAuthors;
  }

  async createComment(data: InsertAmbassadorCommunityComment): Promise<AmbassadorCommunityComment> {
    const [result] = await db.insert(ambassadorCommunityComments).values(data).returning();
    return result;
  }

  async updateComment(id: number, content: string): Promise<AmbassadorCommunityComment | undefined> {
    const [result] = await db.update(ambassadorCommunityComments)
      .set({ content, updatedAt: new Date() })
      .where(eq(ambassadorCommunityComments.id, id))
      .returning();
    return result;
  }

  async deleteComment(id: number): Promise<boolean> {
    const result = await db.delete(ambassadorCommunityComments)
      .where(eq(ambassadorCommunityComments.id, id));
    return true;
  }

  async likeComment(id: number): Promise<AmbassadorCommunityComment | undefined> {
    const [result] = await db.update(ambassadorCommunityComments)
      .set({ likes: sql`${ambassadorCommunityComments.likes} + 1` })
      .where(eq(ambassadorCommunityComments.id, id))
      .returning();
    return result;
  }

  // VEDD Token System implementations
  async getVeddPoolWallets(): Promise<VeddPoolWallet[]> {
    return await db.select().from(veddPoolWallets);
  }

  async getAmbassadorRewardsByUser(userId: number): Promise<AmbassadorActionReward[]> {
    return await db.select().from(ambassadorActionRewards)
      .where(eq(ambassadorActionRewards.userId, userId))
      .orderBy(desc(ambassadorActionRewards.createdAt));
  }

  async getVeddTransfersByUser(userId: number): Promise<VeddTransferJob[]> {
    return await db.select().from(veddTransferJobs)
      .where(eq(veddTransferJobs.userId, userId))
      .orderBy(desc(veddTransferJobs.createdAt));
  }

  async getVerifiedUnprocessedRewards(userId: number): Promise<AmbassadorActionReward[]> {
    return await db.select().from(ambassadorActionRewards)
      .where(and(
        eq(ambassadorActionRewards.userId, userId),
        eq(ambassadorActionRewards.verificationStatus, 'verified'),
        isNull(ambassadorActionRewards.transferJobId)
      ));
  }

  async createVeddTransferJob(job: InsertVeddTransferJob): Promise<VeddTransferJob> {
    const [result] = await db.insert(veddTransferJobs).values(job).returning();
    return result;
  }

  async updateAmbassadorReward(id: number, data: Partial<AmbassadorActionReward>): Promise<AmbassadorActionReward | undefined> {
    const [result] = await db.update(ambassadorActionRewards)
      .set(data)
      .where(eq(ambassadorActionRewards.id, id))
      .returning();
    return result;
  }

  // Internal Wallet methods
  async getInternalWallet(userId: number): Promise<InternalWallet | undefined> {
    const [result] = await db.select().from(internalWallets)
      .where(eq(internalWallets.userId, userId));
    return result;
  }

  async createOrUpdateInternalWallet(userId: number, data: Partial<InternalWallet>): Promise<InternalWallet> {
    const existing = await this.getInternalWallet(userId);
    if (existing) {
      const [result] = await db.update(internalWallets)
        .set({ ...data, lastActivityAt: new Date() })
        .where(eq(internalWallets.userId, userId))
        .returning();
      return result;
    } else {
      const [result] = await db.insert(internalWallets)
        .values({ userId, ...data })
        .returning();
      return result;
    }
  }

  async addToWalletBalance(userId: number, amount: number, isPending: boolean = false): Promise<InternalWallet> {
    const existing = await this.getInternalWallet(userId);
    if (existing) {
      const updateData = isPending 
        ? { pendingBalance: (existing.pendingBalance || 0) + amount }
        : { veddBalance: (existing.veddBalance || 0) + amount, totalEarned: (existing.totalEarned || 0) + amount };
      const [result] = await db.update(internalWallets)
        .set({ ...updateData, lastActivityAt: new Date() })
        .where(eq(internalWallets.userId, userId))
        .returning();
      return result;
    } else {
      const newWallet = isPending
        ? { userId, pendingBalance: amount }
        : { userId, veddBalance: amount, totalEarned: amount };
      const [result] = await db.insert(internalWallets)
        .values(newWallet)
        .returning();
      return result;
    }
  }

  // Withdrawal Request methods
  async createWithdrawalRequest(userId: number, amount: number, destinationWallet: string): Promise<WithdrawalRequest> {
    const [result] = await db.insert(withdrawalRequests)
      .values({ userId, amount, destinationWallet, status: 'pending' })
      .returning();
    return result;
  }

  async getWithdrawalRequests(userId: number): Promise<WithdrawalRequest[]> {
    return await db.select().from(withdrawalRequests)
      .where(eq(withdrawalRequests.userId, userId))
      .orderBy(desc(withdrawalRequests.requestedAt));
  }

  async getAllWithdrawalRequests(): Promise<WithdrawalRequest[]> {
    return await db.select().from(withdrawalRequests)
      .orderBy(desc(withdrawalRequests.requestedAt));
  }

  async updateWithdrawalRequest(id: number, data: Partial<WithdrawalRequest>): Promise<WithdrawalRequest | undefined> {
    const [result] = await db.update(withdrawalRequests)
      .set(data)
      .where(eq(withdrawalRequests.id, id))
      .returning();
    return result;
  }

  // Connected Social Accounts methods
  async getConnectedSocialAccounts(userId: number): Promise<ConnectedSocialAccount[]> {
    return await db.select().from(connectedSocialAccounts)
      .where(eq(connectedSocialAccounts.userId, userId));
  }

  async getConnectedSocialAccount(userId: number, platform: string): Promise<ConnectedSocialAccount | undefined> {
    const [result] = await db.select().from(connectedSocialAccounts)
      .where(and(
        eq(connectedSocialAccounts.userId, userId),
        eq(connectedSocialAccounts.platform, platform)
      ));
    return result;
  }

  async connectSocialAccount(data: InsertConnectedSocialAccount): Promise<ConnectedSocialAccount> {
    const [result] = await db.insert(connectedSocialAccounts)
      .values(data)
      .onConflictDoUpdate({
        target: [connectedSocialAccounts.userId, connectedSocialAccounts.platform],
        set: {
          platformUserId: data.platformUserId,
          platformUsername: data.platformUsername,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tokenExpiresAt: data.tokenExpiresAt,
          isActive: true,
          updatedAt: new Date()
        }
      })
      .returning();
    return result;
  }

  async disconnectSocialAccount(userId: number, platform: string): Promise<void> {
    await db.delete(connectedSocialAccounts)
      .where(and(
        eq(connectedSocialAccounts.userId, userId),
        eq(connectedSocialAccounts.platform, platform)
      ));
  }

  async updateSocialAccount(userId: number, platform: string, data: Partial<ConnectedSocialAccount>): Promise<ConnectedSocialAccount | undefined> {
    const [result] = await db.update(connectedSocialAccounts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(connectedSocialAccounts.userId, userId),
        eq(connectedSocialAccounts.platform, platform)
      ))
      .returning();
    return result;
  }

  // Social Posts methods
  async createSocialPost(data: InsertSocialPost): Promise<SocialPost> {
    const [result] = await db.insert(socialPosts)
      .values(data)
      .returning();
    return result;
  }

  async getSocialPosts(userId: number): Promise<SocialPost[]> {
    return await db.select().from(socialPosts)
      .where(eq(socialPosts.userId, userId))
      .orderBy(desc(socialPosts.createdAt));
  }

  async updateSocialPost(id: number, data: Partial<SocialPost>): Promise<SocialPost | undefined> {
    const [result] = await db.update(socialPosts)
      .set(data)
      .where(eq(socialPosts.id, id))
      .returning();
    return result;
  }
}

// Export a singleton instance of the database storage
export const storage = new DatabaseStorage();
