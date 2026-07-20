import { 
  users, chartAnalyses, achievements, userAchievements,
  userProfiles, follows, analysisFeedback, analysisViews, priceAlerts,
  savedEAs, eaSubscriptions, marketDataSnapshots, marketDataRefreshJobs, eaShareAssets, userStreaks, scenarioAnalyses,
  webhookConfigs, webhookLogs, mt5ApiTokens, mt5SignalLogs, tradelockerConnections, tradelockerTradeLogs,
  tradovateConnections, tradovateTradeLogs,
  alpacaConnections, tastytradeConnections, optionsEngineConfigs, cryptocomConnections, optionsEngineActivity, optionsEngineTrades,
  liveEngineConfigs,
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
  type TradovateConnection, type InsertTradovateConnection, type TradovateTradeLog, type InsertTradovateTradeLog,
  type AlpacaConnection, type InsertAlpacaConnection, type TastytradeConnection, type InsertTastytradeConnection,
  type OptionsEngineConfig, type InsertOptionsEngineConfig,
  type CryptocomConnection, type InsertCryptocomConnection,
  type OptionsEngineActivity, type InsertOptionsEngineActivity,
  type OptionsEngineTrade, type InsertOptionsEngineTrade,
  type FuturesEngineConfig, type InsertFuturesEngineConfig,
  type FuturesEngineActivity, type InsertFuturesEngineActivity,
  type FuturesEngineTrade, type InsertFuturesEngineTrade,
  futuresEngineConfigs, futuresEngineActivity, futuresEngineTrades,
  type ContentStudioGeneration, type InsertContentStudioGeneration,
  contentStudioGenerations,
  type CryptocomEngineConfig, type InsertCryptocomEngineConfig,
  type CryptocomEngineActivity, type InsertCryptocomEngineActivity,
  type CryptocomEngineTrade, type InsertCryptocomEngineTrade,
  cryptocomEngineConfigs, cryptocomEngineActivity, cryptocomEngineTrades,
  type AmbassadorTrainingProgress, type InsertAmbassadorTrainingProgress,
  type AmbassadorCertification, type InsertAmbassadorCertification,
  workforceCertificates, type WorkforceCertificate, type InsertWorkforceCertificate,
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
  type UserApiKey, type InsertUserApiKey,
  type AiModelConfig, type InsertAiModelConfig,
  veddPoolWallets, veddTransferJobs, ambassadorActionRewards,
  internalWallets, withdrawalRequests, aiTradeResults, userApiKeys,
  weeklyStrategies, type WeeklyStrategy,
  aiModelConfigs,
  aiConfirmationOutcomes,
  type AiConfirmationOutcome, type InsertAiConfirmationOutcome,
  aiConfirmationLogs,
  grants, grantApplications, grantScanSessions,
  type Grant, type InsertGrant,
  type GrantApplication, type InsertGrantApplication,
  type GrantScanSession, type InsertGrantScanSession,
  referralVisits, dmKeywords,
  type ReferralVisit, type InsertReferralVisit,
  type DmKeyword, type InsertDmKeyword,
  investmentPools, tokenInvestments,
  type InvestmentPool, type InsertInvestmentPool,
  type TokenInvestment, type InsertTokenInvestment,
  landingPageQuizzes, quizLeads, socialLeadScans,
  type LandingPageQuiz, type InsertLandingPageQuiz,
  type QuizLead, type InsertQuizLead,
  type SocialLeadScan, type InsertSocialLeadScan,
  blogPosts,
  type BlogPost, type InsertBlogPost,
  blogNewsletterSubscribers, type BlogNewsletterSubscriber, type InsertBlogNewsletterSubscriber,
  brainDataListings, type BrainDataListing, type InsertBrainDataListing,
  brainDataPurchases, type BrainDataPurchase, type InsertBrainDataPurchase,
  ambassadorJourney, ambassadorDailyActions,
  type AmbassadorJourney, type InsertAmbassadorJourney,
  type AmbassadorDailyAction,
  stopOrders,
  type StopOrder,
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, and, sql, desc, isNull, gte, lte, inArray } from "drizzle-orm";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET;
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 64) {
  console.warn('API_KEY_ENCRYPTION_SECRET not set or too short. User API key encryption will use a derived key.');
}

function getEncryptionKey(): Buffer {
  if (ENCRYPTION_KEY && ENCRYPTION_KEY.length >= 64) {
    return Buffer.from(ENCRYPTION_KEY.substring(0, 64), 'hex');
  }
  return crypto.createHash('sha256').update(process.env.DATABASE_URL || 'vedd-ai-trading-vault-default').digest();
}

function encryptApiKey(plainKey: string): string {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptApiKey(encryptedKey: string): string {
  try {
    const parts = encryptedKey.split(':');
    if (parts.length !== 2) return encryptedKey;
    const iv = Buffer.from(parts[0], 'hex');
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return encryptedKey;
  }
}

// In-memory storage will be implemented in the class

export interface IStorage {
  sessionStore: session.Store;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
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
  // Referral visit tracking
  trackReferralVisit(data: { referralCode: string; visitorIp?: string; userAgent?: string }): Promise<ReferralVisit>;
  getReferralStats(userId: number): Promise<{ totalClicks: number; signedUp: number; subscribed: number; notSubscribed: number; pendingReminder: number }>;
  markReferralSignup(referralCode: string, visitorId: number): Promise<void>;
  markReferralSubscribed(visitorId: number): Promise<void>;
  sendReferralReminders(referrerId: number): Promise<number>;
  // DM Keywords
  getDmKeywords(userId: number): Promise<DmKeyword[]>;
  createDmKeyword(data: InsertDmKeyword): Promise<DmKeyword>;
  updateDmKeyword(id: number, userId: number, data: Partial<DmKeyword>): Promise<DmKeyword | undefined>;
  deleteDmKeyword(id: number, userId: number): Promise<boolean>;
  incrementDmTrigger(id: number): Promise<void>;

  getOrCreateInternalWallet(userId: number): Promise<InternalWallet>;
  updateInternalWalletBalance(userId: number, delta: number): Promise<InternalWallet>;

  // Investment Pool methods
  getInvestmentPools(activeOnly?: boolean): Promise<InvestmentPool[]>;
  getInvestmentPool(id: number): Promise<InvestmentPool | undefined>;
  getInvestmentPoolBySlug(slug: string): Promise<InvestmentPool | undefined>;
  createInvestmentPool(data: InsertInvestmentPool): Promise<InvestmentPool>;
  updateInvestmentPool(id: number, data: Partial<InvestmentPool>): Promise<InvestmentPool | undefined>;
  // Token Investment (position) methods
  getUserInvestments(userId: number): Promise<TokenInvestment[]>;
  getUserActiveInvestments(userId: number): Promise<TokenInvestment[]>;
  getInvestment(id: number): Promise<TokenInvestment | undefined>;
  createInvestment(data: { userId: number; poolId: number; amountInvested: number; maturityDate: Date | null }): Promise<TokenInvestment>;
  updateInvestment(id: number, data: Partial<TokenInvestment>): Promise<TokenInvestment | undefined>;
  getInvestmentsNeedingYieldUpdate(): Promise<TokenInvestment[]>;
  getUserInvestmentSummary(userId: number): Promise<{ totalInvested: number; totalCurrentValue: number; totalYieldEarned: number; roiPercent: number; activeCount: number }>;
  getAllActiveInvestments(): Promise<TokenInvestment[]>;

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
  getUserTradelockerConnections(userId: number): Promise<TradelockerConnection[]>;
  updateTradelockerConnection(id: number, data: Partial<TradelockerConnection>): Promise<TradelockerConnection | undefined>;
  deleteTradelockerConnection(id: number): Promise<boolean>;
  
  // TradeLocker Trade Log methods
  createTradelockerTradeLog(log: InsertTradelockerTradeLog): Promise<TradelockerTradeLog>;
  getTradelockerTradeLogs(userId: number, limit?: number, connectionId?: number): Promise<TradelockerTradeLog[]>;

  // Alpaca Connection methods (Options AI Engine)
  createAlpacaConnection(connection: InsertAlpacaConnection): Promise<AlpacaConnection>;
  getAlpacaConnection(id: number): Promise<AlpacaConnection | undefined>;
  getUserAlpacaConnections(userId: number): Promise<AlpacaConnection[]>;
  updateAlpacaConnection(id: number, data: Partial<AlpacaConnection>): Promise<AlpacaConnection | undefined>;
  deleteAlpacaConnection(id: number): Promise<boolean>;

  // TastyTrade Connection methods (Options AI Engine)
  createTastytradeConnection(connection: InsertTastytradeConnection): Promise<TastytradeConnection>;
  getTastytradeConnection(id: number): Promise<TastytradeConnection | undefined>;
  getUserTastytradeConnections(userId: number): Promise<TastytradeConnection[]>;
  updateTastytradeConnection(id: number, data: Partial<TastytradeConnection>): Promise<TastytradeConnection | undefined>;
  deleteTastytradeConnection(id: number): Promise<boolean>;

  // Options AI Engine config
  getUserOptionsEngineConfig(userId: number): Promise<OptionsEngineConfig | undefined>;
  upsertOptionsEngineConfig(userId: number, data: Partial<InsertOptionsEngineConfig>): Promise<OptionsEngineConfig>;
  getAllActiveOptionsEngineConfigs(): Promise<OptionsEngineConfig[]>;

  // Live Engine (FX SS AI Engine) durable config mirror — see ensure-live-engine-config-table.ts
  getLiveEngineConfigOverrides(userId: number): Promise<Record<string, any> | null>;
  saveLiveEngineConfigOverrides(userId: number, config: Record<string, any>): Promise<void>;
  getAllLiveEngineConfigOverrides(): Promise<{ userId: number; config: Record<string, any> }[]>;

  // Options AI Engine — scan/decision activity feed
  createOptionsEngineActivity(entry: InsertOptionsEngineActivity): Promise<OptionsEngineActivity>;
  getUserOptionsEngineActivity(userId: number, limit?: number): Promise<OptionsEngineActivity[]>;

  // Options AI Engine — executed trades
  createOptionsEngineTrade(trade: InsertOptionsEngineTrade): Promise<OptionsEngineTrade>;
  getOpenOptionsEngineTrades(userId: number): Promise<OptionsEngineTrade[]>;
  getUserOptionsEngineTrades(userId: number, limit?: number): Promise<OptionsEngineTrade[]>;
  closeOptionsEngineTrade(id: number, data: { exitPrice: number; exitOrderId?: string; exitReason: string; realizedPnl: number }): Promise<OptionsEngineTrade | undefined>;
  markOptionsEngineTradeFailed(id: number, reason: string): Promise<void>;
  getTodayOptionsEngineTradeCount(userId: number): Promise<number>;
  getTodayOptionsEngineRealizedPnl(userId: number): Promise<number>;
  getOptionsEngineTradeStats(userId: number): Promise<{ totalClosed: number; wins: number; winRate: number }>;
  getOptionsEngineDailyPnlHistory(userId: number, days: number): Promise<Record<string, number>>;
  updateOptionsEngineTradeTrailState(id: number, data: { peakPnlPercent: number; trailArmed: boolean }): Promise<void>;

  // Futures AI Engine — persisted config (FX SS AI Engine parity)
  getUserFuturesEngineConfig(userId: number): Promise<FuturesEngineConfig | undefined>;
  upsertFuturesEngineConfig(userId: number, data: Partial<InsertFuturesEngineConfig>): Promise<FuturesEngineConfig>;
  getAllActiveFuturesEngineConfigs(): Promise<FuturesEngineConfig[]>;

  // Futures AI Engine — scan/decision activity feed
  createFuturesEngineActivity(entry: InsertFuturesEngineActivity): Promise<FuturesEngineActivity>;
  getUserFuturesEngineActivity(userId: number, limit?: number): Promise<FuturesEngineActivity[]>;

  // Futures AI Engine — executed trades
  createFuturesEngineTrade(trade: InsertFuturesEngineTrade): Promise<FuturesEngineTrade>;
  getOpenFuturesEngineTrades(userId: number): Promise<FuturesEngineTrade[]>;
  getUserFuturesEngineTrades(userId: number, limit?: number): Promise<FuturesEngineTrade[]>;
  closeFuturesEngineTrade(id: number, data: { exitPrice: number; exitOrderId?: string; exitReason: string; realizedPnl: number }): Promise<FuturesEngineTrade | undefined>;
  markFuturesEngineTradeFailed(id: number, reason: string): Promise<void>;
  getTodayFuturesEngineTradeCount(userId: number): Promise<number>;
  getTodayFuturesEngineRealizedPnl(userId: number): Promise<number>;
  getFuturesEngineTradeStats(userId: number): Promise<{ totalClosed: number; wins: number; winRate: number }>;
  getFuturesEngineDailyPnlHistory(userId: number, days: number): Promise<Record<string, number>>;
  updateFuturesEngineTradeTrailState(id: number, data: { peakRMultiple: number; trailArmed: boolean }): Promise<void>;

  // Content Studio — durable saved-content library
  createContentStudioGeneration(entry: InsertContentStudioGeneration): Promise<ContentStudioGeneration>;
  getUserContentStudioGenerations(userId: number, contentType?: string, limit?: number): Promise<ContentStudioGeneration[]>;
  deleteContentStudioGeneration(id: number, userId: number): Promise<boolean>;

  // Crypto.com Perpetuals AI Engine — persisted config (FX SS AI Engine parity)
  getUserCryptocomEngineConfig(userId: number): Promise<CryptocomEngineConfig | undefined>;
  upsertCryptocomEngineConfig(userId: number, data: Partial<InsertCryptocomEngineConfig>): Promise<CryptocomEngineConfig>;
  getAllActiveCryptocomEngineConfigs(): Promise<CryptocomEngineConfig[]>;
  createCryptocomEngineActivity(entry: InsertCryptocomEngineActivity): Promise<CryptocomEngineActivity>;
  getUserCryptocomEngineActivity(userId: number, limit?: number): Promise<CryptocomEngineActivity[]>;
  createCryptocomEngineTrade(trade: InsertCryptocomEngineTrade): Promise<CryptocomEngineTrade>;
  getOpenCryptocomEngineTrades(userId: number): Promise<CryptocomEngineTrade[]>;
  getUserCryptocomEngineTrades(userId: number, limit?: number): Promise<CryptocomEngineTrade[]>;
  closeCryptocomEngineTrade(id: number, data: { exitPrice: number; exitOrderId?: string; exitReason: string; realizedPnl: number }): Promise<CryptocomEngineTrade | undefined>;
  getTodayCryptocomEngineTradeCount(userId: number): Promise<number>;
  getTodayCryptocomEngineRealizedPnl(userId: number): Promise<number>;
  getCryptocomEngineTradeStats(userId: number): Promise<{ totalClosed: number; wins: number; winRate: number }>;
  getCryptocomEngineDailyPnlHistory(userId: number, days: number): Promise<Record<string, number>>;
  updateCryptocomEngineTradeTrailState(id: number, data: { peakRMultiple: number; trailArmed: boolean }): Promise<void>;

  // Crypto.com Connection methods (separate crypto-derivatives bucket)
  createCryptocomConnection(connection: InsertCryptocomConnection): Promise<CryptocomConnection>;
  getCryptocomConnection(id: number): Promise<CryptocomConnection | undefined>;
  getUserCryptocomConnections(userId: number): Promise<CryptocomConnection[]>;
  updateCryptocomConnection(id: number, data: Partial<CryptocomConnection>): Promise<CryptocomConnection | undefined>;
  deleteCryptocomConnection(id: number): Promise<boolean>;

  // Tradovate Connection methods (futures prop firm trading)
  createTradovateConnection(connection: InsertTradovateConnection): Promise<TradovateConnection>;
  getTradovateConnection(id: number): Promise<TradovateConnection | undefined>;
  getUserTradovateConnection(userId: number): Promise<TradovateConnection | undefined>;
  updateTradovateConnection(id: number, data: Partial<TradovateConnection>): Promise<TradovateConnection | undefined>;
  deleteTradovateConnection(id: number): Promise<boolean>;
  createTradovateTradeLog(log: InsertTradovateTradeLog): Promise<TradovateTradeLog>;
  getTradovateTradeLogs(userId: number, limit?: number): Promise<TradovateTradeLog[]>;

  // AI Trade Results methods
  createAiTradeResult(result: InsertAiTradeResult): Promise<AiTradeResult>;
  updateAiTradeResult(id: number, userId: number, data: Partial<AiTradeResult>): Promise<AiTradeResult | undefined>;
  deleteAiTradeResult(id: number, userId: number): Promise<boolean>;
  getAiTradeResultById(id: number): Promise<AiTradeResult | undefined>;
  getAiTradeResults(userId: number, limit?: number, connectionId?: number): Promise<AiTradeResult[]>;
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

  // Workforce Academy certificates
  createWorkforceCertificate(cert: InsertWorkforceCertificate): Promise<WorkforceCertificate>;
  getUserWorkforceCertificates(userId: number): Promise<WorkforceCertificate[]>;
  getWorkforceCertificateByCertId(certificateId: string): Promise<WorkforceCertificate | undefined>;

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

  // User API Key methods
  getUserApiKeys(userId: number): Promise<UserApiKey[]>;
  getUserApiKey(userId: number, provider: string): Promise<UserApiKey | undefined>;
  createOrUpdateUserApiKey(data: InsertUserApiKey): Promise<UserApiKey>;
  deleteUserApiKey(userId: number, provider: string): Promise<boolean>;
  updateUserApiKeyUsage(userId: number, provider: string): Promise<void>;
  getActiveUserApiKey(userId: number, provider: string): Promise<UserApiKey | undefined>;
  getAiModelConfig(userId: number): Promise<AiModelConfig | undefined>;
  upsertAiModelConfig(userId: number, data: Partial<InsertAiModelConfig>): Promise<AiModelConfig>;

  // Grants & Funding methods
  createGrant(grant: InsertGrant): Promise<Grant>;
  getGrants(filters?: { grantType?: string; targetAudience?: string; isActive?: boolean }): Promise<Grant[]>;
  getGrantById(id: number): Promise<Grant | undefined>;
  upsertGrant(grant: InsertGrant): Promise<Grant>;
  updateGrant(id: number, data: Partial<Grant>): Promise<Grant | undefined>;
  createGrantApplication(application: InsertGrantApplication): Promise<GrantApplication>;
  getGrantApplicationsByUser(userId: number): Promise<(GrantApplication & { grant: Grant })[]>;
  getAllGrantApplications(): Promise<(GrantApplication & { grant: Grant; user: { id: number; username: string; fullName: string | null } })[]>;
  getGrantApplicationById(id: number): Promise<(GrantApplication & { grant: Grant }) | undefined>;
  updateGrantApplication(id: number, data: Partial<GrantApplication>): Promise<GrantApplication | undefined>;
  deleteGrantApplication(id: number): Promise<boolean>;
  createGrantScanSession(session: InsertGrantScanSession): Promise<GrantScanSession>;
  updateGrantScanSession(id: number, data: Partial<GrantScanSession>): Promise<GrantScanSession | undefined>;
  getGrantDashboardStats(userId: number, isAdmin: boolean): Promise<{
    totalGrants: number;
    myApplications: number;
    awarded: number;
    inProgress: number;
    totalFundingAwarded: string;
  }>;

  // Landing page quiz
  getOrCreateLandingPageQuiz(userId: number, referralCode: string): Promise<LandingPageQuiz>;
  getLandingPageQuizBySlug(slug: string): Promise<LandingPageQuiz | undefined>;
  updateLandingPageQuiz(id: number, data: Partial<InsertLandingPageQuiz>): Promise<LandingPageQuiz>;

  // Quiz leads / lead list
  getLeadsByAmbassador(ambassadorId: number, filters?: { status?: string; source?: string; leadQuality?: string }): Promise<QuizLead[]>;
  createLead(lead: InsertQuizLead): Promise<QuizLead>;
  updateLead(id: number, data: Partial<InsertQuizLead>): Promise<QuizLead>;
  deleteLead(id: number): Promise<void>;
  submitQuizLead(quizSlug: string, leadData: Record<string, unknown>): Promise<QuizLead>;

  // Social scans
  createSocialLeadScan(scan: InsertSocialLeadScan): Promise<SocialLeadScan>;
  getSocialLeadScansByUser(userId: number): Promise<SocialLeadScan[]>;

  // Blog posts
  getBlogPosts(filters?: { isPublished?: boolean; category?: string; limit?: number }): Promise<BlogPost[]>;
  getBlogPostBySlug(slug: string): Promise<BlogPost | undefined>;
  getBlogPostById(id: number): Promise<BlogPost | undefined>;
  createBlogPost(post: InsertBlogPost): Promise<BlogPost>;
  updateBlogPost(id: number, data: Partial<InsertBlogPost>): Promise<BlogPost>;
  deleteBlogPost(id: number): Promise<void>;
  incrementBlogPostViews(id: number): Promise<void>;
  createBlogNewsletterSubscriber(sub: InsertBlogNewsletterSubscriber): Promise<BlogNewsletterSubscriber>;
  getBlogNewsletterSubscriberByEmail(email: string): Promise<BlogNewsletterSubscriber | undefined>;
  resubscribeBlogNewsletter(email: string): Promise<BlogNewsletterSubscriber>;
  getAllBlogNewsletterSubscribers(): Promise<BlogNewsletterSubscriber[]>;

  // Brain Data Marketplace
  getActiveBrainListings(limit?: number): Promise<BrainDataListing[]>;
  getBrainListing(id: number): Promise<BrainDataListing | undefined>;
  getUserActiveBrainListing(sellerId: number, sourceCategory?: string): Promise<BrainDataListing | undefined>;
  getUserActiveBrainListingBySymbols(sellerId: number, sourceCategory: string, symbols: string[] | null): Promise<BrainDataListing | undefined>;
  getUserBrainListings(sellerId: number): Promise<BrainDataListing[]>;
  createBrainListing(listing: InsertBrainDataListing): Promise<BrainDataListing>;
  deactivateBrainListing(id: number): Promise<void>;
  incrementBrainListingPurchaseCount(id: number): Promise<void>;
  getBrainPurchaseByListingAndBuyer(listingId: number, buyerId: number): Promise<BrainDataPurchase | undefined>;
  createBrainPurchase(purchase: InsertBrainDataPurchase): Promise<BrainDataPurchase>;
  getUserBrainPurchases(buyerId: number): Promise<(BrainDataPurchase & { listing: BrainDataListing })[]>;
  getOutcomesForListing(userId: number, sourceCategory?: 'forex' | 'tradelocker', symbols?: string[], includeManualTrades?: boolean): Promise<AiConfirmationOutcome[]>;
  importBrainDataSnapshot(buyerId: number, snapshotData: any[]): Promise<number>;

  // Ambassador Free Path Journey
  getAmbassadorJourney(userId: number): Promise<AmbassadorJourney | undefined>;
  getOrCreateAmbassadorJourney(userId: number): Promise<AmbassadorJourney>;
  updateAmbassadorJourney(userId: number, data: Partial<InsertAmbassadorJourney>): Promise<AmbassadorJourney>;
  completeAmbassadorDay(userId: number, day: number): Promise<AmbassadorJourney>;
  getDailyActions(userId: number, day: number): Promise<AmbassadorDailyAction[]>;
  completeDailyAction(userId: number, actionId: number): Promise<AmbassadorDailyAction>;
  awardJourneyTokens(userId: number, tokens: number, reason: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    const PgStore = connectPgSimple(session);
    this.sessionStore = new PgStore({
      pool,
      tableName: 'session',
      createTableIfMissing: true,
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
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
  
  // saveReferralCode and getUserByReferralCode implemented further below with real DB columns
  
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
    const current = await db.select().from(users).where(eq(users.id, userId));
    if (!current[0]) return undefined;
    const currentBalance = (current[0] as any).referralCredits ?? 0;
    const [updatedUser] = await db
      .update(users)
      .set({ referralCredits: currentBalance + credits, updatedAt: new Date() } as any)
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async saveReferralCode(userId: number, code: string): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ referralCode: code } as any).where(eq(users.id, userId)).returning();
    return updated;
  }

  async getUserByReferralCode(code: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq((users as any).referralCode, code));
    return user;
  }

  async trackReferralVisit(data: { referralCode: string; visitorIp?: string; userAgent?: string }): Promise<ReferralVisit> {
    // look up referrer
    const referrer = await this.getUserByReferralCode(data.referralCode);
    const [visit] = await db.insert(referralVisits).values({
      referralCode: data.referralCode,
      referrerId: referrer?.id ?? null,
      visitorIp: data.visitorIp ?? null,
      userAgent: data.userAgent ?? null,
    } as any).returning();
    return visit;
  }

  async getReferralStats(userId: number): Promise<{ totalClicks: number; signedUp: number; subscribed: number; notSubscribed: number; pendingReminder: number }> {
    const user = await this.getUser(userId);
    const code = (user as any)?.referralCode;
    if (!code) return { totalClicks: 0, signedUp: 0, subscribed: 0, notSubscribed: 0, pendingReminder: 0 };
    const visits = await db.select().from(referralVisits).where(eq(referralVisits.referralCode, code));
    const totalClicks = visits.length;
    const signedUpVisits = visits.filter(v => v.signedUp);
    const signedUp = signedUpVisits.length;
    const subscribed = signedUpVisits.filter(v => v.subscribed).length;
    const notSubscribed = signedUp - subscribed;
    const pendingReminder = signedUpVisits.filter(v => !v.subscribed && !v.reminderSent).length;
    return { totalClicks, signedUp, subscribed, notSubscribed, pendingReminder };
  }

  async markReferralSignup(referralCode: string, visitorId: number): Promise<void> {
    await db.update(referralVisits)
      .set({ visitorId, signedUp: true, signedUpAt: new Date() } as any)
      .where(eq(referralVisits.referralCode, referralCode));
  }

  async markReferralSubscribed(visitorId: number): Promise<void> {
    await db.update(referralVisits)
      .set({ subscribed: true, subscribedAt: new Date() } as any)
      .where(eq(referralVisits.visitorId, visitorId));
  }

  async sendReferralReminders(referrerId: number): Promise<number> {
    // Mark all non-subscribed signed-up visitors as reminder-sent (in-app notification)
    const user = await this.getUser(referrerId);
    const code = (user as any)?.referralCode;
    if (!code) return 0;
    const unreminded = await db.select().from(referralVisits)
      .where(eq(referralVisits.referralCode, code));
    const targets = unreminded.filter(v => v.signedUp && !v.subscribed && !v.reminderSent && v.visitorId);
    for (const visit of targets) {
      if (visit.visitorId) {
        await db.update(referralVisits)
          .set({ reminderSent: true, reminderSentAt: new Date() } as any)
          .where(eq(referralVisits.id, visit.id));
      }
    }
    return targets.length;
  }

  async getDmKeywords(userId: number): Promise<DmKeyword[]> {
    return db.select().from(dmKeywords).where(eq(dmKeywords.userId, userId));
  }

  async createDmKeyword(data: InsertDmKeyword): Promise<DmKeyword> {
    const [kw] = await db.insert(dmKeywords).values(data).returning();
    return kw;
  }

  async updateDmKeyword(id: number, userId: number, data: Partial<DmKeyword>): Promise<DmKeyword | undefined> {
    const [updated] = await db.update(dmKeywords).set({ ...data, updatedAt: new Date() } as any)
      .where(eq(dmKeywords.id, id)).returning();
    return updated;
  }

  async deleteDmKeyword(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(dmKeywords).where(eq(dmKeywords.id, id));
    return true;
  }

  async incrementDmTrigger(id: number): Promise<void> {
    await db.update(dmKeywords).set({ triggerCount: sql`trigger_count + 1`, lastTriggeredAt: new Date() } as any)
      .where(eq(dmKeywords.id, id));
  }

  // ── Investment Pool Implementations ──────────────────────────────────────────

  async getInvestmentPools(activeOnly = true): Promise<InvestmentPool[]> {
    if (activeOnly) {
      return db.select().from(investmentPools).where(eq(investmentPools.isActive, true));
    }
    return db.select().from(investmentPools);
  }

  async getInvestmentPool(id: number): Promise<InvestmentPool | undefined> {
    const [pool] = await db.select().from(investmentPools).where(eq(investmentPools.id, id));
    return pool;
  }

  async getInvestmentPoolBySlug(slug: string): Promise<InvestmentPool | undefined> {
    const [pool] = await db.select().from(investmentPools).where(eq(investmentPools.slug, slug));
    return pool;
  }

  async createInvestmentPool(data: InsertInvestmentPool): Promise<InvestmentPool> {
    const [pool] = await db.insert(investmentPools).values(data).returning();
    return pool;
  }

  async updateInvestmentPool(id: number, data: Partial<InvestmentPool>): Promise<InvestmentPool | undefined> {
    const [pool] = await db.update(investmentPools)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(investmentPools.id, id))
      .returning();
    return pool;
  }

  async getUserInvestments(userId: number): Promise<TokenInvestment[]> {
    return db.select().from(tokenInvestments).where(eq(tokenInvestments.userId, userId));
  }

  async getUserActiveInvestments(userId: number): Promise<TokenInvestment[]> {
    return db.select().from(tokenInvestments)
      .where(eq(tokenInvestments.userId, userId));
  }

  async getInvestment(id: number): Promise<TokenInvestment | undefined> {
    const [inv] = await db.select().from(tokenInvestments).where(eq(tokenInvestments.id, id));
    return inv;
  }

  async createInvestment(data: { userId: number; poolId: number; amountInvested: number; maturityDate: Date | null }): Promise<TokenInvestment> {
    const [inv] = await db.insert(tokenInvestments).values({
      userId: data.userId,
      poolId: data.poolId,
      amountInvested: data.amountInvested,
      currentValue: data.amountInvested, // starts equal to principal
      yieldEarned: 0,
      status: 'active',
      maturityDate: data.maturityDate,
    } as any).returning();
    // Update pool total invested
    await db.update(investmentPools)
      .set({ totalInvested: sql`total_invested + ${data.amountInvested}`, updatedAt: new Date() } as any)
      .where(eq(investmentPools.id, data.poolId));
    return inv;
  }

  async updateInvestment(id: number, data: Partial<TokenInvestment>): Promise<TokenInvestment | undefined> {
    const [inv] = await db.update(tokenInvestments)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(tokenInvestments.id, id))
      .returning();
    return inv;
  }

  async getInvestmentsNeedingYieldUpdate(): Promise<TokenInvestment[]> {
    const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000);
    return db.select().from(tokenInvestments)
      .where(eq(tokenInvestments.status, 'active'));
  }

  async getUserInvestmentSummary(userId: number): Promise<{ totalInvested: number; totalCurrentValue: number; totalYieldEarned: number; roiPercent: number; activeCount: number }> {
    const investments = await db.select().from(tokenInvestments)
      .where(eq(tokenInvestments.userId, userId));
    const nonCancelled = investments.filter(i => i.status !== 'cancelled');
    const active = investments.filter(i => i.status === 'active' || i.status === 'matured');
    const totalInvested = nonCancelled.reduce((sum, i) => sum + i.amountInvested, 0);
    const totalCurrentValue = nonCancelled.reduce((sum, i) => sum + i.currentValue, 0);
    const totalYieldEarned = nonCancelled.reduce((sum, i) => sum + i.yieldEarned, 0);
    const roiPercent = totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 : 0;
    return { totalInvested, totalCurrentValue, totalYieldEarned, roiPercent, activeCount: active.length };
  }

  async getAllActiveInvestments(): Promise<TokenInvestment[]> {
    return db.select().from(tokenInvestments).where(eq(tokenInvestments.status, 'active'));
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

  async getUserTradelockerConnections(userId: number): Promise<TradelockerConnection[]> {
    return db.select().from(tradelockerConnections).where(eq(tradelockerConnections.userId, userId));
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

  async getTradelockerTradeLogs(userId: number, limit: number = 100, connectionId?: number): Promise<TradelockerTradeLog[]> {
    const conditions = [eq(tradelockerTradeLogs.userId, userId)];
    if (connectionId != null) conditions.push(eq(tradelockerTradeLogs.connectionId, connectionId));
    return await db.select().from(tradelockerTradeLogs)
      .where(and(...conditions))
      .orderBy(desc(tradelockerTradeLogs.createdAt))
      .limit(limit);
  }

  // ── Alpaca Connection methods (Options AI Engine) ──────────────────────────
  async createAlpacaConnection(connection: InsertAlpacaConnection): Promise<AlpacaConnection> {
    const [result] = await db.insert(alpacaConnections).values(connection).returning();
    return result;
  }

  async getAlpacaConnection(id: number): Promise<AlpacaConnection | undefined> {
    const [result] = await db.select().from(alpacaConnections).where(eq(alpacaConnections.id, id));
    return result;
  }

  async getUserAlpacaConnections(userId: number): Promise<AlpacaConnection[]> {
    return db.select().from(alpacaConnections).where(eq(alpacaConnections.userId, userId));
  }

  async updateAlpacaConnection(id: number, data: Partial<AlpacaConnection>): Promise<AlpacaConnection | undefined> {
    const [result] = await db.update(alpacaConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(alpacaConnections.id, id))
      .returning();
    return result;
  }

  async deleteAlpacaConnection(id: number): Promise<boolean> {
    await db.delete(alpacaConnections).where(eq(alpacaConnections.id, id));
    return true;
  }

  // ── TastyTrade Connection methods (Options AI Engine) ───────────────────────
  async createTastytradeConnection(connection: InsertTastytradeConnection): Promise<TastytradeConnection> {
    const [result] = await db.insert(tastytradeConnections).values(connection).returning();
    return result;
  }

  async getTastytradeConnection(id: number): Promise<TastytradeConnection | undefined> {
    const [result] = await db.select().from(tastytradeConnections).where(eq(tastytradeConnections.id, id));
    return result;
  }

  async getUserTastytradeConnections(userId: number): Promise<TastytradeConnection[]> {
    return db.select().from(tastytradeConnections).where(eq(tastytradeConnections.userId, userId));
  }

  async updateTastytradeConnection(id: number, data: Partial<TastytradeConnection>): Promise<TastytradeConnection | undefined> {
    const [result] = await db.update(tastytradeConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tastytradeConnections.id, id))
      .returning();
    return result;
  }

  async deleteTastytradeConnection(id: number): Promise<boolean> {
    await db.delete(tastytradeConnections).where(eq(tastytradeConnections.id, id));
    return true;
  }

  // ── Options AI Engine config ────────────────────────────────────────────────
  async getUserOptionsEngineConfig(userId: number): Promise<OptionsEngineConfig | undefined> {
    const [result] = await db.select().from(optionsEngineConfigs).where(eq(optionsEngineConfigs.userId, userId));
    return result;
  }

  async upsertOptionsEngineConfig(userId: number, data: Partial<InsertOptionsEngineConfig>): Promise<OptionsEngineConfig> {
    const existing = await this.getUserOptionsEngineConfig(userId);
    if (existing) {
      const [result] = await db.update(optionsEngineConfigs)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(optionsEngineConfigs.userId, userId))
        .returning();
      return result;
    }
    const [result] = await db.insert(optionsEngineConfigs)
      .values({ userId, ...data } as InsertOptionsEngineConfig)
      .returning();
    return result;
  }

  async getAllActiveOptionsEngineConfigs(): Promise<OptionsEngineConfig[]> {
    return db.select().from(optionsEngineConfigs).where(eq(optionsEngineConfigs.isActive, true));
  }

  // ── Live Engine (FX SS AI Engine) durable config mirror ─────────────────────
  async getLiveEngineConfigOverrides(userId: number): Promise<Record<string, any> | null> {
    const [row] = await db.select().from(liveEngineConfigs).where(eq(liveEngineConfigs.userId, userId));
    return row ? (row.config as Record<string, any>) : null;
  }

  async saveLiveEngineConfigOverrides(userId: number, config: Record<string, any>): Promise<void> {
    const existing = await this.getLiveEngineConfigOverrides(userId);
    if (existing !== null) {
      await db.update(liveEngineConfigs).set({ config, updatedAt: new Date() }).where(eq(liveEngineConfigs.userId, userId));
    } else {
      await db.insert(liveEngineConfigs).values({ userId, config });
    }
  }

  async getAllLiveEngineConfigOverrides(): Promise<{ userId: number; config: Record<string, any> }[]> {
    const rows = await db.select().from(liveEngineConfigs);
    return rows.map(r => ({ userId: r.userId, config: r.config as Record<string, any> }));
  }

  // ── Options AI Engine — scan/decision activity feed ─────────────────────────
  async createOptionsEngineActivity(entry: InsertOptionsEngineActivity): Promise<OptionsEngineActivity> {
    const [result] = await db.insert(optionsEngineActivity).values(entry).returning();
    return result;
  }

  async getUserOptionsEngineActivity(userId: number, limit: number = 50): Promise<OptionsEngineActivity[]> {
    return db.select().from(optionsEngineActivity)
      .where(eq(optionsEngineActivity.userId, userId))
      .orderBy(desc(optionsEngineActivity.createdAt))
      .limit(limit);
  }

  // ── Options AI Engine — executed trades ─────────────────────────────────────
  async createOptionsEngineTrade(trade: InsertOptionsEngineTrade): Promise<OptionsEngineTrade> {
    const [result] = await db.insert(optionsEngineTrades).values(trade).returning();
    return result;
  }

  async getOpenOptionsEngineTrades(userId: number): Promise<OptionsEngineTrade[]> {
    return db.select().from(optionsEngineTrades)
      .where(and(eq(optionsEngineTrades.userId, userId), eq(optionsEngineTrades.status, 'open')));
  }

  async getUserOptionsEngineTrades(userId: number, limit: number = 50): Promise<OptionsEngineTrade[]> {
    return db.select().from(optionsEngineTrades)
      .where(eq(optionsEngineTrades.userId, userId))
      .orderBy(desc(optionsEngineTrades.createdAt))
      .limit(limit);
  }

  async closeOptionsEngineTrade(id: number, data: { exitPrice: number; exitOrderId?: string; exitReason: string; realizedPnl: number }): Promise<OptionsEngineTrade | undefined> {
    const [result] = await db.update(optionsEngineTrades)
      .set({ status: 'closed', exitPrice: data.exitPrice, exitOrderId: data.exitOrderId, exitReason: data.exitReason, realizedPnl: data.realizedPnl, closedAt: new Date(), updatedAt: new Date() })
      .where(eq(optionsEngineTrades.id, id))
      .returning();
    return result;
  }

  async markOptionsEngineTradeFailed(id: number, reason: string): Promise<void> {
    await db.update(optionsEngineTrades)
      .set({ status: 'failed', exitReason: reason, closedAt: new Date(), updatedAt: new Date() })
      .where(eq(optionsEngineTrades.id, id));
  }

  async getTodayOptionsEngineTradeCount(userId: number): Promise<number> {
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const rows = await db.select().from(optionsEngineTrades)
      .where(and(eq(optionsEngineTrades.userId, userId), gte(optionsEngineTrades.createdAt, startOfDay)));
    return rows.length;
  }

  async getTodayOptionsEngineRealizedPnl(userId: number): Promise<number> {
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const rows = await db.select().from(optionsEngineTrades)
      .where(and(eq(optionsEngineTrades.userId, userId), eq(optionsEngineTrades.status, 'closed'), gte(optionsEngineTrades.closedAt, startOfDay)));
    return rows.reduce((sum, r) => sum + (r.realizedPnl || 0), 0);
  }

  async getOptionsEngineTradeStats(userId: number): Promise<{ totalClosed: number; wins: number; winRate: number }> {
    const rows = await db.select().from(optionsEngineTrades)
      .where(and(eq(optionsEngineTrades.userId, userId), eq(optionsEngineTrades.status, 'closed')));
    const totalClosed = rows.length;
    const wins = rows.filter(r => (r.realizedPnl || 0) > 0).length;
    const winRate = totalClosed > 0 ? Math.round((wins / totalClosed) * 100) : 0;
    return { totalClosed, wins, winRate };
  }

  async getOptionsEngineDailyPnlHistory(userId: number, days: number): Promise<Record<string, number>> {
    const since = new Date(); since.setUTCHours(0, 0, 0, 0); since.setUTCDate(since.getUTCDate() - days);
    const rows = await db.select().from(optionsEngineTrades)
      .where(and(eq(optionsEngineTrades.userId, userId), eq(optionsEngineTrades.status, 'closed'), gte(optionsEngineTrades.closedAt, since)));
    const history: Record<string, number> = {};
    for (const r of rows) {
      if (!r.closedAt) continue;
      const day = new Date(r.closedAt).toISOString().split('T')[0];
      history[day] = (history[day] || 0) + (r.realizedPnl || 0);
    }
    return history;
  }

  async updateOptionsEngineTradeTrailState(id: number, data: { peakPnlPercent: number; trailArmed: boolean }): Promise<void> {
    await db.update(optionsEngineTrades)
      .set({ peakPnlPercent: data.peakPnlPercent, trailArmed: data.trailArmed, updatedAt: new Date() })
      .where(eq(optionsEngineTrades.id, id));
  }

  // ── Futures AI Engine config ────────────────────────────────────────────────
  async getUserFuturesEngineConfig(userId: number): Promise<FuturesEngineConfig | undefined> {
    const [result] = await db.select().from(futuresEngineConfigs).where(eq(futuresEngineConfigs.userId, userId));
    return result;
  }

  async upsertFuturesEngineConfig(userId: number, data: Partial<InsertFuturesEngineConfig>): Promise<FuturesEngineConfig> {
    const existing = await this.getUserFuturesEngineConfig(userId);
    if (existing) {
      const [result] = await db.update(futuresEngineConfigs)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(futuresEngineConfigs.userId, userId))
        .returning();
      return result;
    }
    const [result] = await db.insert(futuresEngineConfigs)
      .values({ userId, ...data } as InsertFuturesEngineConfig)
      .returning();
    return result;
  }

  async getAllActiveFuturesEngineConfigs(): Promise<FuturesEngineConfig[]> {
    return db.select().from(futuresEngineConfigs).where(eq(futuresEngineConfigs.isActive, true));
  }

  // ── Futures AI Engine — scan/decision activity feed ─────────────────────────
  async createFuturesEngineActivity(entry: InsertFuturesEngineActivity): Promise<FuturesEngineActivity> {
    const [result] = await db.insert(futuresEngineActivity).values(entry).returning();
    return result;
  }

  async getUserFuturesEngineActivity(userId: number, limit: number = 50): Promise<FuturesEngineActivity[]> {
    return db.select().from(futuresEngineActivity)
      .where(eq(futuresEngineActivity.userId, userId))
      .orderBy(desc(futuresEngineActivity.createdAt))
      .limit(limit);
  }

  // ── Futures AI Engine — executed trades ─────────────────────────────────────
  async createFuturesEngineTrade(trade: InsertFuturesEngineTrade): Promise<FuturesEngineTrade> {
    const [result] = await db.insert(futuresEngineTrades).values(trade).returning();
    return result;
  }

  async getOpenFuturesEngineTrades(userId: number): Promise<FuturesEngineTrade[]> {
    return db.select().from(futuresEngineTrades)
      .where(and(eq(futuresEngineTrades.userId, userId), eq(futuresEngineTrades.status, 'open')));
  }

  async getUserFuturesEngineTrades(userId: number, limit: number = 50): Promise<FuturesEngineTrade[]> {
    return db.select().from(futuresEngineTrades)
      .where(eq(futuresEngineTrades.userId, userId))
      .orderBy(desc(futuresEngineTrades.createdAt))
      .limit(limit);
  }

  async closeFuturesEngineTrade(id: number, data: { exitPrice: number; exitOrderId?: string; exitReason: string; realizedPnl: number }): Promise<FuturesEngineTrade | undefined> {
    const [result] = await db.update(futuresEngineTrades)
      .set({ status: 'closed', exitPrice: data.exitPrice, exitOrderId: data.exitOrderId, exitReason: data.exitReason, realizedPnl: data.realizedPnl, closedAt: new Date(), updatedAt: new Date() })
      .where(eq(futuresEngineTrades.id, id))
      .returning();
    return result;
  }

  async markFuturesEngineTradeFailed(id: number, reason: string): Promise<void> {
    await db.update(futuresEngineTrades)
      .set({ status: 'failed', exitReason: reason, closedAt: new Date(), updatedAt: new Date() })
      .where(eq(futuresEngineTrades.id, id));
  }

  async getTodayFuturesEngineTradeCount(userId: number): Promise<number> {
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const rows = await db.select().from(futuresEngineTrades)
      .where(and(eq(futuresEngineTrades.userId, userId), gte(futuresEngineTrades.createdAt, startOfDay)));
    return rows.length;
  }

  async getTodayFuturesEngineRealizedPnl(userId: number): Promise<number> {
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const rows = await db.select().from(futuresEngineTrades)
      .where(and(eq(futuresEngineTrades.userId, userId), eq(futuresEngineTrades.status, 'closed'), gte(futuresEngineTrades.closedAt, startOfDay)));
    return rows.reduce((sum, r) => sum + (r.realizedPnl || 0), 0);
  }

  async getFuturesEngineTradeStats(userId: number): Promise<{ totalClosed: number; wins: number; winRate: number }> {
    const rows = await db.select().from(futuresEngineTrades)
      .where(and(eq(futuresEngineTrades.userId, userId), eq(futuresEngineTrades.status, 'closed')));
    const totalClosed = rows.length;
    const wins = rows.filter(r => (r.realizedPnl || 0) > 0).length;
    const winRate = totalClosed > 0 ? Math.round((wins / totalClosed) * 100) : 0;
    return { totalClosed, wins, winRate };
  }

  async getFuturesEngineDailyPnlHistory(userId: number, days: number): Promise<Record<string, number>> {
    const since = new Date(); since.setUTCHours(0, 0, 0, 0); since.setUTCDate(since.getUTCDate() - days);
    const rows = await db.select().from(futuresEngineTrades)
      .where(and(eq(futuresEngineTrades.userId, userId), eq(futuresEngineTrades.status, 'closed'), gte(futuresEngineTrades.closedAt, since)));
    const history: Record<string, number> = {};
    for (const r of rows) {
      if (!r.closedAt) continue;
      const day = new Date(r.closedAt).toISOString().split('T')[0];
      history[day] = (history[day] || 0) + (r.realizedPnl || 0);
    }
    return history;
  }

  async updateFuturesEngineTradeTrailState(id: number, data: { peakRMultiple: number; trailArmed: boolean }): Promise<void> {
    await db.update(futuresEngineTrades)
      .set({ peakRMultiple: data.peakRMultiple, trailArmed: data.trailArmed, updatedAt: new Date() })
      .where(eq(futuresEngineTrades.id, id));
  }

  // ── Content Studio — durable saved-content library ──────────────────────────
  async createContentStudioGeneration(entry: InsertContentStudioGeneration): Promise<ContentStudioGeneration> {
    const [result] = await db.insert(contentStudioGenerations).values(entry).returning();
    return result;
  }

  async getUserContentStudioGenerations(userId: number, contentType?: string, limit: number = 100): Promise<ContentStudioGeneration[]> {
    const conditions = contentType
      ? and(eq(contentStudioGenerations.userId, userId), eq(contentStudioGenerations.contentType, contentType))
      : eq(contentStudioGenerations.userId, userId);
    return db.select().from(contentStudioGenerations)
      .where(conditions)
      .orderBy(desc(contentStudioGenerations.createdAt))
      .limit(limit);
  }

  async deleteContentStudioGeneration(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(contentStudioGenerations)
      .where(and(eq(contentStudioGenerations.id, id), eq(contentStudioGenerations.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // ── Crypto.com Perpetuals AI Engine ─────────────────────────────────────────
  async getUserCryptocomEngineConfig(userId: number): Promise<CryptocomEngineConfig | undefined> {
    const [result] = await db.select().from(cryptocomEngineConfigs).where(eq(cryptocomEngineConfigs.userId, userId));
    return result;
  }

  async upsertCryptocomEngineConfig(userId: number, data: Partial<InsertCryptocomEngineConfig>): Promise<CryptocomEngineConfig> {
    const existing = await this.getUserCryptocomEngineConfig(userId);
    if (existing) {
      const [result] = await db.update(cryptocomEngineConfigs)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(cryptocomEngineConfigs.userId, userId))
        .returning();
      return result;
    }
    const [result] = await db.insert(cryptocomEngineConfigs)
      .values({ userId, ...data } as InsertCryptocomEngineConfig)
      .returning();
    return result;
  }

  async getAllActiveCryptocomEngineConfigs(): Promise<CryptocomEngineConfig[]> {
    return db.select().from(cryptocomEngineConfigs).where(eq(cryptocomEngineConfigs.isActive, true));
  }

  async createCryptocomEngineActivity(entry: InsertCryptocomEngineActivity): Promise<CryptocomEngineActivity> {
    const [result] = await db.insert(cryptocomEngineActivity).values(entry).returning();
    return result;
  }

  async getUserCryptocomEngineActivity(userId: number, limit: number = 50): Promise<CryptocomEngineActivity[]> {
    return db.select().from(cryptocomEngineActivity)
      .where(eq(cryptocomEngineActivity.userId, userId))
      .orderBy(desc(cryptocomEngineActivity.createdAt))
      .limit(limit);
  }

  async createCryptocomEngineTrade(trade: InsertCryptocomEngineTrade): Promise<CryptocomEngineTrade> {
    const [result] = await db.insert(cryptocomEngineTrades).values(trade).returning();
    return result;
  }

  async getOpenCryptocomEngineTrades(userId: number): Promise<CryptocomEngineTrade[]> {
    return db.select().from(cryptocomEngineTrades)
      .where(and(eq(cryptocomEngineTrades.userId, userId), eq(cryptocomEngineTrades.status, 'open')));
  }

  async getUserCryptocomEngineTrades(userId: number, limit: number = 50): Promise<CryptocomEngineTrade[]> {
    return db.select().from(cryptocomEngineTrades)
      .where(eq(cryptocomEngineTrades.userId, userId))
      .orderBy(desc(cryptocomEngineTrades.createdAt))
      .limit(limit);
  }

  async closeCryptocomEngineTrade(id: number, data: { exitPrice: number; exitOrderId?: string; exitReason: string; realizedPnl: number }): Promise<CryptocomEngineTrade | undefined> {
    const [result] = await db.update(cryptocomEngineTrades)
      .set({ status: 'closed', exitPrice: data.exitPrice, exitOrderId: data.exitOrderId, exitReason: data.exitReason, realizedPnl: data.realizedPnl, closedAt: new Date(), updatedAt: new Date() })
      .where(eq(cryptocomEngineTrades.id, id))
      .returning();
    return result;
  }

  async getTodayCryptocomEngineTradeCount(userId: number): Promise<number> {
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const rows = await db.select().from(cryptocomEngineTrades)
      .where(and(eq(cryptocomEngineTrades.userId, userId), gte(cryptocomEngineTrades.createdAt, startOfDay)));
    return rows.length;
  }

  async getTodayCryptocomEngineRealizedPnl(userId: number): Promise<number> {
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const rows = await db.select().from(cryptocomEngineTrades)
      .where(and(eq(cryptocomEngineTrades.userId, userId), eq(cryptocomEngineTrades.status, 'closed'), gte(cryptocomEngineTrades.closedAt, startOfDay)));
    return rows.reduce((sum, r) => sum + (r.realizedPnl || 0), 0);
  }

  async getCryptocomEngineTradeStats(userId: number): Promise<{ totalClosed: number; wins: number; winRate: number }> {
    const rows = await db.select().from(cryptocomEngineTrades)
      .where(and(eq(cryptocomEngineTrades.userId, userId), eq(cryptocomEngineTrades.status, 'closed')));
    const totalClosed = rows.length;
    const wins = rows.filter(r => (r.realizedPnl || 0) > 0).length;
    const winRate = totalClosed > 0 ? Math.round((wins / totalClosed) * 100) : 0;
    return { totalClosed, wins, winRate };
  }

  async getCryptocomEngineDailyPnlHistory(userId: number, days: number): Promise<Record<string, number>> {
    const since = new Date(); since.setUTCHours(0, 0, 0, 0); since.setUTCDate(since.getUTCDate() - days);
    const rows = await db.select().from(cryptocomEngineTrades)
      .where(and(eq(cryptocomEngineTrades.userId, userId), eq(cryptocomEngineTrades.status, 'closed'), gte(cryptocomEngineTrades.closedAt, since)));
    const history: Record<string, number> = {};
    for (const r of rows) {
      if (!r.closedAt) continue;
      const day = new Date(r.closedAt).toISOString().split('T')[0];
      history[day] = (history[day] || 0) + (r.realizedPnl || 0);
    }
    return history;
  }

  async updateCryptocomEngineTradeTrailState(id: number, data: { peakRMultiple: number; trailArmed: boolean }): Promise<void> {
    await db.update(cryptocomEngineTrades)
      .set({ peakRMultiple: data.peakRMultiple, trailArmed: data.trailArmed, updatedAt: new Date() })
      .where(eq(cryptocomEngineTrades.id, id));
  }

  // ── Crypto.com Connection methods (crypto-derivatives bucket) ──────────────
  async createCryptocomConnection(connection: InsertCryptocomConnection): Promise<CryptocomConnection> {
    const [result] = await db.insert(cryptocomConnections).values(connection).returning();
    return result;
  }

  async getCryptocomConnection(id: number): Promise<CryptocomConnection | undefined> {
    const [result] = await db.select().from(cryptocomConnections).where(eq(cryptocomConnections.id, id));
    return result;
  }

  async getUserCryptocomConnections(userId: number): Promise<CryptocomConnection[]> {
    return db.select().from(cryptocomConnections).where(eq(cryptocomConnections.userId, userId));
  }

  async updateCryptocomConnection(id: number, data: Partial<CryptocomConnection>): Promise<CryptocomConnection | undefined> {
    const [result] = await db.update(cryptocomConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(cryptocomConnections.id, id))
      .returning();
    return result;
  }

  async deleteCryptocomConnection(id: number): Promise<boolean> {
    await db.delete(cryptocomConnections).where(eq(cryptocomConnections.id, id));
    return true;
  }

  // ── Tradovate Connection methods ──────────────────────────────────────────
  async createTradovateConnection(connection: InsertTradovateConnection): Promise<TradovateConnection> {
    const [result] = await db.insert(tradovateConnections).values(connection as any).returning();
    return result;
  }

  async getTradovateConnection(id: number): Promise<TradovateConnection | undefined> {
    const [result] = await db.select().from(tradovateConnections).where(eq(tradovateConnections.id, id));
    return result;
  }

  async getUserTradovateConnection(userId: number): Promise<TradovateConnection | undefined> {
    const [result] = await db.select().from(tradovateConnections).where(eq(tradovateConnections.userId, userId));
    return result;
  }

  async updateTradovateConnection(id: number, data: Partial<TradovateConnection>): Promise<TradovateConnection | undefined> {
    const [result] = await db.update(tradovateConnections)
      .set({ ...(data as any), updatedAt: new Date() })
      .where(eq(tradovateConnections.id, id))
      .returning();
    return result;
  }

  async deleteTradovateConnection(id: number): Promise<boolean> {
    await db.delete(tradovateTradeLogs).where(eq(tradovateTradeLogs.connectionId, id));
    await db.delete(tradovateConnections).where(eq(tradovateConnections.id, id));
    return true;
  }

  async createTradovateTradeLog(log: InsertTradovateTradeLog): Promise<TradovateTradeLog> {
    const [result] = await db.insert(tradovateTradeLogs).values(log as any).returning();
    return result;
  }

  async getTradovateTradeLogs(userId: number, limit: number = 100): Promise<TradovateTradeLog[]> {
    return await db.select().from(tradovateTradeLogs)
      .where(eq(tradovateTradeLogs.userId, userId))
      .orderBy(desc(tradovateTradeLogs.createdAt))
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

  async deleteAiTradeResult(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(aiTradeResults)
      .where(and(eq(aiTradeResults.id, id), eq(aiTradeResults.userId, userId)));
    return true;
  }

  async getAiTradeResultById(id: number): Promise<AiTradeResult | undefined> {
    const [result] = await db.select().from(aiTradeResults)
      .where(eq(aiTradeResults.id, id))
      .limit(1);
    return result;
  }

  async getAiTradeResults(userId: number, limit: number = 100, connectionId?: number): Promise<AiTradeResult[]> {
    const conditions = [eq(aiTradeResults.userId, userId)];
    if (connectionId != null) conditions.push(eq(aiTradeResults.connectionId, connectionId));
    return await db.select().from(aiTradeResults)
      .where(and(...conditions))
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

  // ── AI Confirmation Outcomes (learning loop) ────────────────────────────────

  async createConfirmationOutcome(data: InsertAiConfirmationOutcome): Promise<AiConfirmationOutcome> {
    const [result] = await db.insert(aiConfirmationOutcomes).values(data).returning();
    return result;
  }

  // Called when a trade closes: find the most recent PENDING confirmation for
  // this user + symbol + direction within the last 24 hours and mark its outcome.
  async resolveConfirmationOutcome(
    userId: number,
    symbol: string,
    direction: string,
    tradeOutcome: string,
    actualPips: number
  ): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(aiConfirmationOutcomes)
      .where(
        and(
          eq(aiConfirmationOutcomes.userId, userId),
          eq(aiConfirmationOutcomes.symbol, symbol.toUpperCase()),
          eq(aiConfirmationOutcomes.direction, direction),
          eq(aiConfirmationOutcomes.tradeOutcome, 'PENDING'),
          gte(aiConfirmationOutcomes.confirmedAt, since)
        )
      )
      .orderBy(desc(aiConfirmationOutcomes.confirmedAt))
      .limit(1);

    if (rows.length > 0) {
      await db
        .update(aiConfirmationOutcomes)
        .set({ tradeOutcome, actualPips, closedAt: new Date() })
        .where(eq(aiConfirmationOutcomes.id, rows[0].id));
    }
  }

  async getConfirmationOutcomes(userId: number, limit = 200): Promise<AiConfirmationOutcome[]> {
    return db
      .select()
      .from(aiConfirmationOutcomes)
      .where(eq(aiConfirmationOutcomes.userId, userId))
      .orderBy(desc(aiConfirmationOutcomes.confirmedAt))
      .limit(limit);
  }

  // AI Second Opinion / Strategy Action Feed durability — mirrors every
  // addAiConfirmationLog() call (server/openai.ts's in-memory Map) so the
  // feed survives a server restart instead of going blank.
  async createAiConfirmationLogEntry(userId: number, entry: unknown): Promise<void> {
    await db.insert(aiConfirmationLogs).values({ userId, entry: entry as any });
  }

  async getAiConfirmationLogEntries(userId: number, limit = 50): Promise<any[]> {
    const rows = await db
      .select()
      .from(aiConfirmationLogs)
      .where(eq(aiConfirmationLogs.userId, userId))
      .orderBy(desc(aiConfirmationLogs.id))
      .limit(limit);
    return rows.map(r => ({ ...(r.entry as object), id: r.id }));
  }

  async getBrainSummary(userId: number): Promise<any[]> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const rows = await db.select()
        .from(aiConfirmationOutcomes)
        .where(
          and(
            eq(aiConfirmationOutcomes.userId, userId),
            gte(aiConfirmationOutcomes.confirmedAt, thirtyDaysAgo)
          )
        )
        .orderBy(desc(aiConfirmationOutcomes.confirmedAt))
        .limit(500);

      // Group manually for compatibility
      const groups: Record<string, { symbol: string; tradeSource: string; confluenceGrade: string; tradeCount: number; wins: number; totalPips: number }> = {};
      for (const row of rows) {
        if (row.tradeOutcome === 'PENDING') continue;
        const key = `${row.symbol}|${(row as any).tradeSource ?? 'ai_confirmation'}|${row.confluenceGrade ?? 'N/A'}`;
        if (!groups[key]) groups[key] = { symbol: row.symbol, tradeSource: (row as any).tradeSource ?? 'ai_confirmation', confluenceGrade: row.confluenceGrade ?? 'N/A', tradeCount: 0, wins: 0, totalPips: 0 };
        groups[key].tradeCount++;
        if (row.tradeOutcome === 'WIN') groups[key].wins++;
        if (row.actualPips) groups[key].totalPips += row.actualPips;
      }

      return Object.values(groups).map(g => ({
        ...g,
        winRate: g.tradeCount > 0 ? Math.round((g.wins / g.tradeCount) * 100) : 0,
        avgPips: g.tradeCount > 0 ? Math.round(g.totalPips / g.tradeCount) : 0,
      })).sort((a, b) => b.winRate - a.winRate);
    } catch (err) {
      console.error('[BrainSummary]', err);
      return [];
    }
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

  // Workforce Academy certificates
  async createWorkforceCertificate(cert: InsertWorkforceCertificate): Promise<WorkforceCertificate> {
    const [result] = await db.insert(workforceCertificates).values(cert).returning();
    return result;
  }

  async getUserWorkforceCertificates(userId: number): Promise<WorkforceCertificate[]> {
    return await db.select().from(workforceCertificates)
      .where(eq(workforceCertificates.userId, userId))
      .orderBy(desc(workforceCertificates.issuedAt));
  }

  async getWorkforceCertificateByCertId(certificateId: string): Promise<WorkforceCertificate | undefined> {
    const [result] = await db.select().from(workforceCertificates)
      .where(eq(workforceCertificates.certificateId, certificateId));
    return result;
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

  async getOrCreateInternalWallet(userId: number): Promise<InternalWallet> {
    return this.createOrUpdateInternalWallet(userId, {});
  }

  async updateInternalWalletBalance(userId: number, delta: number): Promise<InternalWallet> {
    const wallet = await this.getOrCreateInternalWallet(userId);
    const newBalance = Math.max(0, (wallet.veddBalance || 0) + delta);
    const [result] = await db.update(internalWallets)
      .set({ veddBalance: newBalance, lastActivityAt: new Date() })
      .where(eq(internalWallets.userId, userId))
      .returning();
    return result;
  }

  // Brain Data Marketplace
  async getActiveBrainListings(limit?: number): Promise<BrainDataListing[]> {
    const query = db.select().from(brainDataListings)
      .where(eq(brainDataListings.isActive, true))
      .orderBy(sql`${brainDataListings.purchaseCount} DESC`);
    if (limit) return await query.limit(limit);
    return await query;
  }

  async getBrainListing(id: number): Promise<BrainDataListing | undefined> {
    const [listing] = await db.select().from(brainDataListings).where(eq(brainDataListings.id, id));
    return listing;
  }

  async getUserActiveBrainListing(sellerId: number, sourceCategory?: string): Promise<BrainDataListing | undefined> {
    const conditions = [eq(brainDataListings.sellerId, sellerId), eq(brainDataListings.isActive, true)];
    if (sourceCategory) conditions.push(eq(brainDataListings.sourceCategory, sourceCategory));
    const [listing] = await db.select().from(brainDataListings).where(and(...conditions));
    return listing;
  }

  async getUserBrainListings(sellerId: number): Promise<BrainDataListing[]> {
    return await db.select().from(brainDataListings)
      .where(eq(brainDataListings.sellerId, sellerId))
      .orderBy(desc(brainDataListings.createdAt));
  }

  async createBrainListing(listing: InsertBrainDataListing): Promise<BrainDataListing> {
    const [created] = await db.insert(brainDataListings).values(listing as any).returning();
    return created;
  }

  async deactivateBrainListing(id: number): Promise<void> {
    await db.update(brainDataListings).set({ isActive: false, updatedAt: new Date() }).where(eq(brainDataListings.id, id));
  }

  async incrementBrainListingPurchaseCount(id: number): Promise<void> {
    await db.execute(sql`UPDATE brain_data_listings SET purchase_count = COALESCE(purchase_count, 0) + 1 WHERE id = ${id}`);
  }

  async getBrainPurchaseByListingAndBuyer(listingId: number, buyerId: number): Promise<BrainDataPurchase | undefined> {
    const [purchase] = await db.select().from(brainDataPurchases)
      .where(and(eq(brainDataPurchases.listingId, listingId), eq(brainDataPurchases.buyerId, buyerId)));
    return purchase;
  }

  async createBrainPurchase(purchase: InsertBrainDataPurchase): Promise<BrainDataPurchase> {
    const [created] = await db.insert(brainDataPurchases).values(purchase as any).returning();
    return created;
  }

  async getUserBrainPurchases(buyerId: number): Promise<(BrainDataPurchase & { listing: BrainDataListing })[]> {
    const purchases = await db.select().from(brainDataPurchases)
      .where(eq(brainDataPurchases.buyerId, buyerId))
      .orderBy(desc(brainDataPurchases.purchasedAt));
    const result: (BrainDataPurchase & { listing: BrainDataListing })[] = [];
    for (const p of purchases) {
      const listing = await this.getBrainListing(p.listingId);
      if (listing) result.push({ ...p, listing });
    }
    return result;
  }

  // sourceCategory splits a seller's history into two sellable brains:
  // 'forex' = direct MT5/EA-triggered AI confirmations (tradeSource defaults
  // to 'ai_confirmation'); 'tradelocker' = trades executed/mirrored through
  // a linked TradeLocker connection ('breakout'/'ea_only'). Omit to get the
  // old unfiltered behavior (used nowhere anymore, kept for safety).
  async getOutcomesForListing(userId: number, sourceCategory?: 'forex' | 'tradelocker', symbols?: string[], includeManualTrades?: boolean): Promise<AiConfirmationOutcome[]> {
    const conditions = [
      eq(aiConfirmationOutcomes.userId, userId),
      sql`${aiConfirmationOutcomes.tradeSource} IS DISTINCT FROM 'purchased_brain'`,
    ];
    if (sourceCategory === 'tradelocker') {
      conditions.push(inArray(aiConfirmationOutcomes.tradeSource, ['breakout', 'ea_only']));
    } else if (sourceCategory === 'forex') {
      conditions.push(sql`${aiConfirmationOutcomes.tradeSource} NOT IN ('breakout', 'ea_only')`);
    }
    if (symbols && symbols.length) {
      conditions.push(inArray(aiConfirmationOutcomes.symbol, symbols));
    }
    const rows = await db.select().from(aiConfirmationOutcomes).where(and(...conditions));

    // Manually-logged (discretionary) trades live in a separate table and
    // are excluded by default — a seller must explicitly opt in. They only
    // ever come from the MT5/dashboard side, so they're merged into 'forex'
    // listings only (never 'tradelocker'). Mapped into the same shape so
    // downstream pricing/stat/import code doesn't need to know the difference.
    if (includeManualTrades && sourceCategory !== 'tradelocker') {
      const manualConditions = [
        eq(aiTradeResults.userId, userId),
        eq(aiTradeResults.source, 'manual'),
        sql`${aiTradeResults.result} IS NOT NULL`,
        sql`${aiTradeResults.result} != 'PENDING'`,
      ];
      if (symbols && symbols.length) manualConditions.push(inArray(aiTradeResults.symbol, symbols));
      const manualRows = await db.select().from(aiTradeResults).where(and(...manualConditions));
      for (const r of manualRows) {
        rows.push({
          id: -r.id,
          userId: r.userId,
          symbol: r.symbol,
          timeframe: r.timeframe,
          direction: r.direction,
          confluenceGrade: null,
          confluenceScore: null,
          session: null,
          ictMacroValid: null,
          smcVerdict: null,
          adxValue: null,
          rsiValue: null,
          macdDirection: null,
          htfAligned: null,
          newsConflict: null,
          aiDecision: 'MANUAL',
          aiConfidence: r.aiConfidence,
          proposedConfidence: null,
          tradeOutcome: r.result,
          actualPips: r.profitLossPips,
          confirmedAt: r.closedAt ?? r.createdAt,
          closedAt: r.closedAt,
          tradeSource: 'manual',
          modelUsed: null,
          providerUsed: null,
          reasoningText: null,
          bullCase: null,
          bearCase: null,
          deepReasoningUsed: false,
        } as AiConfirmationOutcome);
      }
    }
    return rows;
  }

  // Matches an active listing by (sellerId, sourceCategory, symbolFilter) —
  // relisting the SAME pair scope replaces that specific brain with a fresh
  // snapshot; a different pair scope is a distinct, coexisting listing.
  async getUserActiveBrainListingBySymbols(sellerId: number, sourceCategory: string, symbols: string[] | null): Promise<BrainDataListing | undefined> {
    const listings = await db.select().from(brainDataListings)
      .where(and(eq(brainDataListings.sellerId, sellerId), eq(brainDataListings.isActive, true), eq(brainDataListings.sourceCategory, sourceCategory)));
    const norm = (s: any): string => (Array.isArray(s) && s.length ? [...s].map((x: string) => x.toUpperCase()).sort().join(',') : '');
    const target = norm(symbols);
    return listings.find(l => norm(l.symbolFilter) === target);
  }

  async importBrainDataSnapshot(buyerId: number, snapshotData: any[]): Promise<number> {
    if (!snapshotData.length) return 0;
    const rows = snapshotData.map((r: any) => ({
      userId: buyerId,
      symbol: r.symbol,
      timeframe: r.timeframe ?? null,
      direction: r.direction,
      confluenceGrade: r.confluenceGrade ?? null,
      confluenceScore: r.confluenceScore ?? null,
      session: r.session ?? null,
      ictMacroValid: r.ictMacroValid ?? null,
      smcVerdict: r.smcVerdict ?? null,
      adxValue: r.adxValue ?? null,
      rsiValue: r.rsiValue ?? null,
      macdDirection: r.macdDirection ?? null,
      htfAligned: r.htfAligned ?? null,
      newsConflict: r.newsConflict ?? null,
      aiDecision: r.aiDecision ?? null,
      aiConfidence: r.aiConfidence ?? null,
      proposedConfidence: r.proposedConfidence ?? null,
      tradeOutcome: r.tradeOutcome ?? 'PENDING',
      actualPips: r.actualPips ?? null,
      modelUsed: r.modelUsed ?? null,
      providerUsed: r.providerUsed ?? null,
      tradeSource: 'purchased_brain',
    }));
    const inserted = await db.insert(aiConfirmationOutcomes).values(rows as any).returning();
    return inserted.length;
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

  async getUserApiKeys(userId: number): Promise<UserApiKey[]> {
    const results = await db.select().from(userApiKeys)
      .where(eq(userApiKeys.userId, userId))
      .orderBy(userApiKeys.provider);
    return results.map(r => ({ ...r, apiKey: decryptApiKey(r.apiKey) }));
  }

  async getUserApiKey(userId: number, provider: string): Promise<UserApiKey | undefined> {
    const [result] = await db.select().from(userApiKeys)
      .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
    return result;
  }

  async createOrUpdateUserApiKey(data: InsertUserApiKey): Promise<UserApiKey> {
    const encryptedKey = encryptApiKey(data.apiKey);
    const existing = await this.getUserApiKey(data.userId, data.provider);
    if (existing) {
      const [result] = await db.update(userApiKeys)
        .set({ apiKey: encryptedKey, label: data.label, isActive: data.isActive ?? true, isValid: null, lastValidated: null })
        .where(and(eq(userApiKeys.userId, data.userId), eq(userApiKeys.provider, data.provider)))
        .returning();
      return result;
    }
    const [result] = await db.insert(userApiKeys).values({ ...data, apiKey: encryptedKey }).returning();
    return result;
  }

  async deleteUserApiKey(userId: number, provider: string): Promise<boolean> {
    const result = await db.delete(userApiKeys)
      .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
    return true;
  }

  async updateUserApiKeyUsage(userId: number, provider: string): Promise<void> {
    await db.update(userApiKeys)
      .set({ lastUsed: new Date(), usageCount: sql`${userApiKeys.usageCount} + 1` })
      .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
  }

  async getActiveUserApiKey(userId: number, provider: string): Promise<UserApiKey | undefined> {
    const [result] = await db.select().from(userApiKeys)
      .where(and(
        eq(userApiKeys.userId, userId),
        eq(userApiKeys.provider, provider),
        eq(userApiKeys.isActive, true)
      ));
    if (result) {
      return { ...result, apiKey: decryptApiKey(result.apiKey) };
    }
    return result;
  }
  async getActiveWeeklyStrategy(userId: number): Promise<WeeklyStrategy | undefined> {
    const [result] = await db.select().from(weeklyStrategies)
      .where(and(eq(weeklyStrategies.userId, userId), eq(weeklyStrategies.isActive, true)))
      .limit(1);
    return result;
  }

  async saveWeeklyStrategy(userId: number, data: any): Promise<WeeklyStrategy> {
    await db.update(weeklyStrategies)
      .set({ isActive: false })
      .where(and(eq(weeklyStrategies.userId, userId), eq(weeklyStrategies.isActive, true)));

    const [result] = await db.insert(weeklyStrategies).values({
      userId,
      profitTarget: data.profitTarget,
      accountBalance: data.accountBalance,
      pairs: data.pairs,
      riskLevel: data.riskLevel || 'ai-controlled',
      lotSize: data.lotSize || 'auto',
      plan: data.plan,
      pairStats: data.pairStats || null,
      generatedAt: data.generatedAt,
      weekStart: data.weekStart,
      currentProfit: 0,
      progressTrades: 0,
      progressWinRate: 0,
      progressPercentage: 0,
      isActive: true,
    }).returning();
    return result;
  }

  async saveWeeklyStrategyField(userId: number, fields: Partial<{ plan: any; riskLevel: string; lotSize: string; pairStats: any }>): Promise<void> {
    await db.update(weeklyStrategies)
      .set(fields as any)
      .where(and(eq(weeklyStrategies.userId, userId), eq(weeklyStrategies.isActive, true)));
  }

  async updateWeeklyStrategyProgress(userId: number, progress: { currentProfit: number; progressTrades: number; progressWinRate: number; progressPercentage: number }): Promise<void> {
    await db.update(weeklyStrategies)
      .set({
        currentProfit: progress.currentProfit,
        progressTrades: progress.progressTrades,
        progressWinRate: progress.progressWinRate,
        progressPercentage: progress.progressPercentage,
      })
      .where(and(eq(weeklyStrategies.userId, userId), eq(weeklyStrategies.isActive, true)));
  }

  async deleteWeeklyStrategy(userId: number): Promise<void> {
    await db.update(weeklyStrategies)
      .set({ isActive: false })
      .where(and(eq(weeklyStrategies.userId, userId), eq(weeklyStrategies.isActive, true)));
  }

  async getAiModelConfig(userId: number): Promise<AiModelConfig | undefined> {
    const [result] = await db.select().from(aiModelConfigs)
      .where(and(eq(aiModelConfigs.userId, userId), eq(aiModelConfigs.isActive, true)))
      .limit(1);
    return result;
  }

  async upsertAiModelConfig(userId: number, data: Partial<InsertAiModelConfig>): Promise<AiModelConfig> {
    const existing = await this.getAiModelConfig(userId);
    if (existing) {
      const [updated] = await db.update(aiModelConfigs)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(aiModelConfigs.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(aiModelConfigs)
      .values({ userId, ...data } as any)
      .returning();
    return created;
  }

  // ── Grants & Funding ─────────────────────────────────────────────────────
  async createGrant(grant: InsertGrant): Promise<Grant> {
    const [result] = await db.insert(grants).values(grant as any).returning();
    return result;
  }

  async getGrants(filters?: { grantType?: string; targetAudience?: string; isActive?: boolean }): Promise<Grant[]> {
    const conditions: any[] = [];
    if (filters?.grantType) conditions.push(eq(grants.grantType, filters.grantType));
    if (filters?.isActive !== undefined) conditions.push(eq(grants.isActive, filters.isActive));
    if (filters?.targetAudience && filters.targetAudience !== 'both') {
      conditions.push(sql`(${grants.targetAudience} = ${filters.targetAudience} OR ${grants.targetAudience} = 'both')`);
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    return await db.select().from(grants)
      .where(whereClause)
      .orderBy(desc(grants.relevanceScore), desc(grants.createdAt));
  }

  async getGrantById(id: number): Promise<Grant | undefined> {
    const [result] = await db.select().from(grants).where(eq(grants.id, id));
    return result;
  }

  async upsertGrant(grant: InsertGrant): Promise<Grant> {
    // Try to find existing by title + funder
    const [existing] = await db.select().from(grants)
      .where(and(eq(grants.title, grant.title), eq(grants.funder, grant.funder)));
    if (existing) {
      const [updated] = await db.update(grants)
        .set({ ...grant, updatedAt: new Date(), lastScannedAt: new Date() } as any)
        .where(eq(grants.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(grants)
      .values({ ...grant, lastScannedAt: new Date() } as any)
      .returning();
    return created;
  }

  async updateGrant(id: number, data: Partial<Grant>): Promise<Grant | undefined> {
    const [updated] = await db.update(grants)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(grants.id, id))
      .returning();
    return updated;
  }

  async createGrantApplication(application: InsertGrantApplication): Promise<GrantApplication> {
    const [result] = await db.insert(grantApplications).values(application as any).returning();
    return result;
  }

  async getGrantApplicationsByUser(userId: number): Promise<(GrantApplication & { grant: Grant })[]> {
    const results = await db.select({
      application: grantApplications,
      grant: grants,
    }).from(grantApplications)
      .innerJoin(grants, eq(grantApplications.grantId, grants.id))
      .where(eq(grantApplications.userId, userId))
      .orderBy(desc(grantApplications.updatedAt));
    return results.map(r => ({ ...r.application, grant: r.grant }));
  }

  async getAllGrantApplications(): Promise<(GrantApplication & { grant: Grant; user: { id: number; username: string; fullName: string | null } })[]> {
    const results = await db.select({
      application: grantApplications,
      grant: grants,
      user: { id: users.id, username: users.username, fullName: users.fullName },
    }).from(grantApplications)
      .innerJoin(grants, eq(grantApplications.grantId, grants.id))
      .innerJoin(users, eq(grantApplications.userId, users.id))
      .orderBy(desc(grantApplications.updatedAt));
    return results.map(r => ({ ...r.application, grant: r.grant, user: r.user }));
  }

  async getGrantApplicationById(id: number): Promise<(GrantApplication & { grant: Grant }) | undefined> {
    const [result] = await db.select({
      application: grantApplications,
      grant: grants,
    }).from(grantApplications)
      .innerJoin(grants, eq(grantApplications.grantId, grants.id))
      .where(eq(grantApplications.id, id));
    if (!result) return undefined;
    return { ...result.application, grant: result.grant };
  }

  async updateGrantApplication(id: number, data: Partial<GrantApplication>): Promise<GrantApplication | undefined> {
    const [updated] = await db.update(grantApplications)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(grantApplications.id, id))
      .returning();
    return updated;
  }

  async deleteGrantApplication(id: number): Promise<boolean> {
    const result = await db.delete(grantApplications).where(eq(grantApplications.id, id));
    return true;
  }

  async createGrantScanSession(sess: InsertGrantScanSession): Promise<GrantScanSession> {
    const [result] = await db.insert(grantScanSessions).values(sess as any).returning();
    return result;
  }

  async updateGrantScanSession(id: number, data: Partial<GrantScanSession>): Promise<GrantScanSession | undefined> {
    const [updated] = await db.update(grantScanSessions)
      .set(data as any)
      .where(eq(grantScanSessions.id, id))
      .returning();
    return updated;
  }

  async getGrantDashboardStats(userId: number, isAdmin: boolean): Promise<{
    totalGrants: number;
    myApplications: number;
    awarded: number;
    inProgress: number;
    totalFundingAwarded: string;
  }> {
    const [{ count: totalGrants }] = await db.select({ count: sql<number>`count(*)::int` }).from(grants).where(eq(grants.isActive, true));
    const allApps = await db.select({ status: grantApplications.status, awardedAmount: grantApplications.awardedAmount })
      .from(grantApplications)
      .where(isAdmin ? undefined : eq(grantApplications.userId, userId));
    const myApplications = allApps.length;
    const awarded = allApps.filter(a => a.status === 'awarded').length;
    const inProgress = allApps.filter(a => ['applied', 'under_review'].includes(a.status || '')).length;
    return { totalGrants, myApplications, awarded, inProgress, totalFundingAwarded: `${awarded} grants` };
  }

  // ─── AMBASSADOR LEAD GENERATION ───────────────────────────────────────────────

  async getOrCreateLandingPageQuiz(userId: number, referralCode: string): Promise<LandingPageQuiz> {
    const [existing] = await db.select().from(landingPageQuizzes).where(eq(landingPageQuizzes.userId, userId));
    if (existing) return existing;

    // Build slug from user name + referral code
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const namePart = (user?.fullName || user?.username || 'ambassador')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 30);
    const slug = `${namePart}-${referralCode || userId}`.slice(0, 50);

    const [quiz] = await db.insert(landingPageQuizzes).values({
      userId,
      slug,
      title: 'My VEDD Landing Page',
      questions: [] as unknown as string,
    } as any).returning();
    return quiz;
  }

  async getLandingPageQuizBySlug(slug: string): Promise<LandingPageQuiz | undefined> {
    const [quiz] = await db.select().from(landingPageQuizzes).where(eq(landingPageQuizzes.slug, slug));
    return quiz;
  }

  async updateLandingPageQuiz(id: number, data: Partial<InsertLandingPageQuiz>): Promise<LandingPageQuiz> {
    const [updated] = await db.update(landingPageQuizzes)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(landingPageQuizzes.id, id))
      .returning();
    return updated;
  }

  async getLeadsByAmbassador(ambassadorId: number, filters?: { status?: string; source?: string; leadQuality?: string }): Promise<QuizLead[]> {
    const conditions: ReturnType<typeof eq>[] = [eq(quizLeads.ambassadorId, ambassadorId)];
    if (filters?.status) conditions.push(eq(quizLeads.status, filters.status));
    if (filters?.source) conditions.push(eq(quizLeads.source, filters.source));
    if (filters?.leadQuality) conditions.push(eq(quizLeads.leadQuality, filters.leadQuality));
    return await db.select().from(quizLeads).where(and(...conditions)).orderBy(desc(quizLeads.createdAt));
  }

  async createLead(lead: InsertQuizLead): Promise<QuizLead> {
    const [created] = await db.insert(quizLeads).values(lead as any).returning();
    return created;
  }

  async updateLead(id: number, data: Partial<InsertQuizLead>): Promise<QuizLead> {
    const [updated] = await db.update(quizLeads)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(quizLeads.id, id))
      .returning();
    return updated;
  }

  async deleteLead(id: number): Promise<void> {
    await db.delete(quizLeads).where(eq(quizLeads.id, id));
  }

  async submitQuizLead(quizSlug: string, leadData: Record<string, unknown>): Promise<QuizLead> {
    const [quiz] = await db.select().from(landingPageQuizzes).where(eq(landingPageQuizzes.slug, quizSlug));
    if (!quiz) throw new Error('Quiz not found');

    const answers = (leadData.answers as Array<{ questionId: string | number; answer: string }>) || [];
    const questions = (quiz.questions as Array<{ id: string | number; text: string; yesScore?: number }>) || [];
    const yesCount = answers.filter(a => a.answer === 'yes').length;
    const totalQ = questions.length || 1;
    const leadScore = Math.round((yesCount / totalQ) * 100);
    const leadQuality = leadScore >= 70 ? 'hot' : leadScore >= 40 ? 'warm' : 'cold';

    const [lead] = await db.insert(quizLeads).values({
      quizId: quiz.id,
      ambassadorId: quiz.userId,
      firstName: (leadData.firstName as string) || 'Unknown',
      lastName: (leadData.lastName as string) || null,
      email: (leadData.email as string) || null,
      phone: (leadData.phone as string) || null,
      answers: answers as unknown as string,
      leadScore,
      leadQuality,
      status: 'new',
      source: 'landing_page',
    } as any).returning();

    // Increment quiz lead count
    await db.update(landingPageQuizzes)
      .set({ leadCount: (quiz.leadCount || 0) + 1, updatedAt: new Date() } as any)
      .where(eq(landingPageQuizzes.id, quiz.id));

    return lead;
  }

  async createSocialLeadScan(scan: InsertSocialLeadScan): Promise<SocialLeadScan> {
    const [created] = await db.insert(socialLeadScans).values(scan as any).returning();
    return created;
  }

  async getSocialLeadScansByUser(userId: number): Promise<SocialLeadScan[]> {
    return await db.select().from(socialLeadScans)
      .where(eq(socialLeadScans.userId, userId))
      .orderBy(desc(socialLeadScans.createdAt));
  }

  // ─── BLOG POSTS ────────────────────────────────────────────────

  async getBlogPosts(filters?: { isPublished?: boolean; category?: string; limit?: number }): Promise<BlogPost[]> {
    let query = db.select().from(blogPosts).$dynamic();
    const conditions = [];
    if (filters?.isPublished !== undefined) {
      conditions.push(eq(blogPosts.isPublished, filters.isPublished));
    }
    if (filters?.category) {
      conditions.push(eq(blogPosts.category, filters.category));
    }
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    query = query.orderBy(desc(blogPosts.createdAt));
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    return await query;
  }

  async getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug));
    return post;
  }

  async getBlogPostById(id: number): Promise<BlogPost | undefined> {
    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    return post;
  }

  async createBlogPost(post: InsertBlogPost): Promise<BlogPost> {
    const [created] = await db.insert(blogPosts).values(post as any).returning();
    return created;
  }

  async updateBlogPost(id: number, data: Partial<InsertBlogPost>): Promise<BlogPost> {
    const [updated] = await db.update(blogPosts)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(blogPosts.id, id))
      .returning();
    return updated;
  }

  async deleteBlogPost(id: number): Promise<void> {
    await db.delete(blogPosts).where(eq(blogPosts.id, id));
  }

  async incrementBlogPostViews(id: number): Promise<void> {
    await db.execute(sql`UPDATE blog_posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ${id}`);
  }

  async createBlogNewsletterSubscriber(sub: InsertBlogNewsletterSubscriber): Promise<BlogNewsletterSubscriber> {
    const [created] = await db.insert(blogNewsletterSubscribers).values(sub as any).returning();
    return created;
  }

  async getBlogNewsletterSubscriberByEmail(email: string): Promise<BlogNewsletterSubscriber | undefined> {
    const [sub] = await db.select().from(blogNewsletterSubscribers).where(eq(blogNewsletterSubscribers.email, email));
    return sub;
  }

  async resubscribeBlogNewsletter(email: string): Promise<BlogNewsletterSubscriber> {
    const [updated] = await db.update(blogNewsletterSubscribers)
      .set({ status: 'subscribed', unsubscribedAt: null })
      .where(eq(blogNewsletterSubscribers.email, email))
      .returning();
    return updated;
  }

  async getAllBlogNewsletterSubscribers(): Promise<BlogNewsletterSubscriber[]> {
    return await db.select().from(blogNewsletterSubscribers).orderBy(desc(blogNewsletterSubscribers.subscribedAt));
  }

  // ─── AMBASSADOR FREE PATH JOURNEY ─────────────────────────────

  async getAmbassadorJourney(userId: number): Promise<AmbassadorJourney | undefined> {
    const [journey] = await db.select().from(ambassadorJourney).where(eq(ambassadorJourney.userId, userId));
    return journey;
  }

  async getOrCreateAmbassadorJourney(userId: number): Promise<AmbassadorJourney> {
    const existing = await this.getAmbassadorJourney(userId);
    if (existing) return existing;
    const [created] = await db.insert(ambassadorJourney).values({
      userId,
      currentDay: 1,
      tokensEarned: 0,
      referralsCount: 0,
      subscribedReferrals: 0,
      postsCompleted: 0,
      dmsCompleted: 0,
      commentsCompleted: 0,
      streakDays: 0,
      longestStreak: 0,
      subscriptionEarned: false,
      monthsEarned: 0,
      completedDays: [],
      savedContent: [],
    } as any).returning();
    return created;
  }

  async updateAmbassadorJourney(userId: number, data: Partial<InsertAmbassadorJourney>): Promise<AmbassadorJourney> {
    const [updated] = await db.update(ambassadorJourney)
      .set({ ...data, updatedAt: new Date(), lastActiveAt: new Date() } as any)
      .where(eq(ambassadorJourney.userId, userId))
      .returning();
    return updated;
  }

  async completeAmbassadorDay(userId: number, day: number): Promise<AmbassadorJourney> {
    const journey = await this.getOrCreateAmbassadorJourney(userId);
    const completedDays = (journey.completedDays as number[]) || [];
    if (completedDays.includes(day)) return journey;

    const newCompletedDays = [...completedDays, day];
    const newCurrentDay = Math.min(44, day + 1);

    // Streak calculation
    const yesterday = day - 1;
    const hasYesterday = completedDays.includes(yesterday) || day === 1;
    const newStreak = hasYesterday ? journey.streakDays + 1 : 1;
    const newLongestStreak = Math.max(journey.longestStreak, newStreak);

    // Token awards
    let tokensToAward = 10; // base per day
    if (newStreak === 7 || newStreak === 14 || newStreak === 21 || newStreak === 28 || newStreak === 35 || newStreak === 42) {
      tokensToAward += 100; // 7-day streak bonus
    }
    const allDone = newCompletedDays.length >= 44;
    if (allDone) tokensToAward += 500; // completion bonus

    const subscriptionEarned = allDone || journey.subscriptionEarned;
    const monthsEarned = allDone ? journey.monthsEarned + 1 : journey.monthsEarned;

    const [updated] = await db.update(ambassadorJourney)
      .set({
        completedDays: newCompletedDays as any,
        currentDay: newCurrentDay,
        streakDays: newStreak,
        longestStreak: newLongestStreak,
        tokensEarned: journey.tokensEarned + tokensToAward,
        postsCompleted: journey.postsCompleted + 1,
        subscriptionEarned,
        monthsEarned,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(ambassadorJourney.userId, userId))
      .returning();
    return updated;
  }

  async getDailyActions(userId: number, day: number): Promise<AmbassadorDailyAction[]> {
    return await db.select().from(ambassadorDailyActions)
      .where(and(eq(ambassadorDailyActions.userId, userId), eq(ambassadorDailyActions.day, day)));
  }

  async completeDailyAction(userId: number, actionId: number): Promise<AmbassadorDailyAction> {
    const [updated] = await db.update(ambassadorDailyActions)
      .set({ completed: true, completedAt: new Date(), tokensAwarded: 5 })
      .where(and(eq(ambassadorDailyActions.id, actionId), eq(ambassadorDailyActions.userId, userId)))
      .returning();
    if (!updated) throw new Error('Action not found');
    return updated;
  }

  async awardJourneyTokens(userId: number, tokens: number, _reason: string): Promise<void> {
    await db.update(ambassadorJourney)
      .set({ tokensEarned: sql`tokens_earned + ${tokens}`, updatedAt: new Date() } as any)
      .where(eq(ambassadorJourney.userId, userId));
  }

  // ── Stop Orders ──────────────────────────────────────────────────────────────

  async getStopOrder(id: number): Promise<StopOrder | undefined> {
    const [order] = await db.select().from(stopOrders).where(eq(stopOrders.id, id));
    return order;
  }

  async getUserStopOrders(
    userId: number,
    symbol?: string,
    status?: string,
  ): Promise<StopOrder[]> {
    const conditions: any[] = [eq(stopOrders.userId, userId)];
    if (symbol) {
      conditions.push(eq(stopOrders.symbol, symbol.toUpperCase().replace("/", "")));
    }
    if (status) {
      conditions.push(eq(stopOrders.status, status.toUpperCase()));
    }
    return db
      .select()
      .from(stopOrders)
      .where(and(...conditions))
      .orderBy(sql`${stopOrders.createdAt} DESC`);
  }

  async updateStopOrder(id: number, data: Partial<StopOrder>): Promise<StopOrder | undefined> {
    const [updated] = await db
      .update(stopOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(stopOrders.id, id))
      .returning();
    return updated;
  }
}

// Export a singleton instance of the database storage
export const storage = new DatabaseStorage();
