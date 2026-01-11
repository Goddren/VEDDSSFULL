import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  price: integer("price").notNull(), // Price in cents
  interval: text("interval").notNull().default('month'), // month, year, etc.
  features: jsonb("features").notNull(),
  analysisLimit: integer("analysis_limit").notNull(),
  socialShareLimit: integer("social_share_limit").notNull(),
  stripeProductId: text("stripe_product_id"),
  stripePriceId: text("stripe_price_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  profileImage: text("profile_image"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  subscriptionPlanId: integer("subscription_plan_id").references(() => subscriptionPlans.id),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").default('none'), // none, active, trialing, past_due, canceled, unpaid
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  monthlyAnalysisCount: integer("monthly_analysis_count").default(0),
  monthlySocialShareCount: integer("monthly_social_share_count").default(0),
  lastCountReset: timestamp("last_count_reset"),
  // faithBasedContent field temporarily removed due to database issues
  // Using localStorage instead of database column for faith-based content preferences
  // referralCode field temporarily removed due to database issues
  // referralCredits field temporarily removed due to database issues
  // referredBy field temporarily removed due to database issues
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chartAnalyses = pgTable("chart_analyses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  imageUrl: text("image_url").notNull(),
  symbol: text("symbol"),
  timeframe: text("timeframe"),
  price: text("price"),
  direction: text("direction").notNull(),
  trend: text("trend").notNull(),
  confidence: text("confidence").notNull(),
  entryPoint: text("entry_point").notNull(),
  exitPoint: text("exit_point").notNull(),
  stopLoss: text("stop_loss").notNull(),
  takeProfit: text("take_profit").notNull(),
  riskRewardRatio: text("risk_reward_ratio"),
  potentialPips: text("potential_pips"),
  patterns: jsonb("patterns").notNull(),
  indicators: jsonb("indicators").notNull(),
  supportResistance: jsonb("support_resistance"),
  recommendation: text("recommendation"),
  notes: text("notes"),
  shareId: text("share_id"),
  sharedImageUrl: text("shared_image_url"),
  isPublic: boolean("is_public").default(false),
  multiTimeframeGroupId: text("multi_timeframe_group_id"), // Groups related timeframe analyses
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Multi-timeframe trading strategy code table
export const tradingStrategies = pgTable("trading_strategies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  groupId: text("group_id").notNull().unique(), // Links to multiTimeframeGroupId
  symbol: text("symbol").notNull(),
  platformType: text("platform_type").notNull(), // 'MT5' or 'TradingView'
  generatedCode: text("generated_code").notNull(),
  timeframes: jsonb("timeframes").notNull(), // Array of timeframes used
  entryConditions: text("entry_conditions"),
  exitConditions: text("exit_conditions"),
  riskManagement: jsonb("risk_management"), // Stop loss, take profit rules
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Spread trading strategies (pair trading)
export const spreadStrategies = pgTable("spread_strategies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  groupId: text("group_id").notNull(), // Links to analysis group
  baseSymbol: text("base_symbol").notNull(), // Primary instrument (e.g., EUR/USD)
  hedgeSymbol: text("hedge_symbol").notNull(), // Secondary instrument (e.g., GBP/USD)
  spreadName: text("spread_name").notNull(), // Strategy name (e.g., EUR/GBP Pair Trade)
  spreadType: text("spread_type").notNull(), // 'convergence' | 'divergence' | 'momentum' | 'correlation'
  hedgeRatio: real("hedge_ratio").notNull(), // Ratio of hedge to base (e.g., 1.0 = 1:1, 0.5 = 1:2)
  correlation: real("correlation"), // Expected correlation between symbols
  platformType: text("platform_type").notNull(), // 'MT5' or 'TradingView'
  generatedCode: text("generated_code").notNull(),
  entryStrategy: jsonb("entry_strategy"), // Entry logic for both legs
  exitStrategy: jsonb("exit_strategy"), // Exit logic for both legs
  riskManagement: jsonb("risk_management"), // SL/TP for spread
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email("Invalid email address").optional(),
  fullName: z.string().optional(),
  profileImage: z.string().optional(),
})
  .pick({
    username: true,
    password: true,
    email: true,
    fullName: true,
    profileImage: true,
  });
  
export const loginUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const updateUserProfileSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
  fullName: z.string().optional(),
  profileImage: z.string().optional(),
  avatarUrl: z.string().optional(),
  bio: z.string().max(500, "Biography must be 500 characters or less").optional(),
  faithBasedContent: z.boolean().optional(),
});

export const insertChartAnalysisSchema = createInsertSchema(chartAnalyses).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect & { 
  referralCode?: string; // Temporarily defining it here since it's removed from the schema 
};

// Achievements schema
export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // 'analysis', 'consistency', 'accuracy', 'exploration'
  icon: text("icon").notNull(),
  points: integer("points").notNull().default(10),
  threshold: integer("threshold").notNull().default(1), // number required to unlock
  isSecret: boolean("is_secret").notNull().default(false),
});

export const userAchievements = pgTable("user_achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  achievementId: integer("achievement_id").references(() => achievements.id).notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow(),
  progress: integer("progress").notNull().default(0),
  isCompleted: boolean("is_completed").notNull().default(false),
});

// Insert schemas for achievements
export const insertAchievementSchema = createInsertSchema(achievements).omit({
  id: true
});

export const insertUserAchievementSchema = createInsertSchema(userAchievements).omit({
  id: true,
  unlockedAt: true
});

export type InsertChartAnalysis = z.infer<typeof insertChartAnalysisSchema>;
export type ChartAnalysis = typeof chartAnalyses.$inferSelect;
export type InsertAchievement = z.infer<typeof insertAchievementSchema>;
export type Achievement = typeof achievements.$inferSelect;
export type InsertUserAchievement = z.infer<typeof insertUserAchievementSchema>;
export type UserAchievement = typeof userAchievements.$inferSelect;

// Social Networking Schema
export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  bio: text("bio"),
  tradingExperience: text("trading_experience"), // 'beginner', 'intermediate', 'advanced', 'expert'
  tradingStyle: text("trading_style"), // 'day', 'swing', 'position', 'scalping'
  preferredMarkets: jsonb("preferred_markets"), // Array of markets: forex, stocks, crypto, etc.
  tradeGrade: real("trade_grade").default(0), // 0-100 score based on trade accuracy
  winRate: real("win_rate").default(0), // Percentage of winning trades
  followers: integer("followers").default(0),
  following: integer("following").default(0),
  socialLinks: jsonb("social_links"), // Object with social media links
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Follows (user follows another user)
export const follows = pgTable("follows", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").references(() => users.id).notNull(),
  followingId: integer("following_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    uniqueFollow: unique().on(table.followerId, table.followingId),
  };
});

// Analysis Feedback (likes, dislikes, comments)
export const analysisFeedback = pgTable("analysis_feedback", {
  id: serial("id").primaryKey(),
  analysisId: integer("analysis_id").references(() => chartAnalyses.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  feedbackType: text("feedback_type").notNull(), // 'like', 'dislike', 'save'
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    uniqueFeedback: unique().on(table.analysisId, table.userId, table.feedbackType),
  };
});

// Analysis View History (for recommendations)
export const analysisViews = pgTable("analysis_views", {
  id: serial("id").primaryKey(),
  analysisId: integer("analysis_id").references(() => chartAnalyses.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  viewedAt: timestamp("viewed_at").defaultNow().notNull(),
});

// Insert schemas for social features
export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  followers: true,
  following: true,
  tradeGrade: true,
  winRate: true,
});

export const insertFollowSchema = createInsertSchema(follows).omit({
  id: true,
  createdAt: true,
});

export const insertAnalysisFeedbackSchema = createInsertSchema(analysisFeedback).omit({
  id: true,
  createdAt: true,
});

// Subscription-related schemas
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type Follow = typeof follows.$inferSelect;
export type InsertFollow = z.infer<typeof insertFollowSchema>;
// Referrals table
export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").references(() => users.id).notNull(),
  referredId: integer("referred_id").references(() => users.id).notNull(),
  status: text("status").notNull().default('pending'), // pending, completed, credited
  creditAmount: integer("credit_amount").notNull().default(500), // 500 credits as default reward
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertReferralSchema = createInsertSchema(referrals).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type AnalysisFeedback = typeof analysisFeedback.$inferSelect;
export type InsertAnalysisFeedback = z.infer<typeof insertAnalysisFeedbackSchema>;
export type AnalysisView = typeof analysisViews.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = z.infer<typeof insertReferralSchema>;

// Trading Strategy schemas
export const insertTradingStrategySchema = createInsertSchema(tradingStrategies).omit({
  id: true,
  createdAt: true,
});

export type TradingStrategy = typeof tradingStrategies.$inferSelect;
export type InsertTradingStrategy = z.infer<typeof insertTradingStrategySchema>;

// Price Alerts schema for mobile companion app
export const priceAlerts = pgTable("price_alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  symbol: text("symbol").notNull(),
  alertType: text("alert_type").notNull(), // 'price_above', 'price_below', 'pattern_detected', 'trend_change'
  targetPrice: text("target_price"), // Target price for price alerts
  currentPrice: text("current_price"),
  message: text("message").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isTriggered: boolean("is_triggered").notNull().default(false),
  triggeredAt: timestamp("triggered_at"),
  notificationSent: boolean("notification_sent").notNull().default(false),
  metadata: jsonb("metadata"), // Additional data like pattern type, confidence, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // Optional expiration date
});

export const insertPriceAlertSchema = createInsertSchema(priceAlerts).omit({
  id: true,
  createdAt: true,
  triggeredAt: true,
});

export type PriceAlert = typeof priceAlerts.$inferSelect;
export type InsertPriceAlert = z.infer<typeof insertPriceAlertSchema>;

// Saved EAs table
export const savedEAs = pgTable("saved_eas", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  platformType: text("platform_type").notNull(), // 'MT5', 'TradingView', 'TradeLocker'
  eaCode: text("ea_code").notNull(),
  symbol: text("symbol").notNull(),
  strategyType: text("strategy_type"),
  direction: text("direction"), // BUY, SELL, or NEUTRAL - the trade direction from analysis
  confidence: text("confidence"), // Confidence percentage from analysis
  entryPoint: text("entry_point"), // Entry price from analysis
  stopLoss: text("stop_loss"), // Stop loss from analysis
  takeProfit: text("take_profit"), // Take profit from analysis
  chartAnalysisData: jsonb("chart_analysis_data"), // Full analysis summary for share card
  multiTimeframeGroupId: text("multi_timeframe_group_id"), // Links to multi-timeframe analyses
  refreshVolatilityThreshold: integer("refresh_volatility_threshold").default(30), // % volatility change to trigger refresh
  refreshAtrThreshold: integer("refresh_atr_threshold").default(20), // % ATR change to trigger refresh
  refreshPriceThreshold: integer("refresh_price_threshold").default(2), // % price change to trigger refresh
  isShared: boolean("is_shared").default(false),
  price: integer("price"), // Price in cents, null if not shared
  shareCount: integer("share_count").default(0),
  stripeProductId: text("stripe_product_id"),
  stripePriceId: text("stripe_price_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// EA Subscriptions table
export const eaSubscriptions = pgTable("ea_subscriptions", {
  id: serial("id").primaryKey(),
  eaId: integer("ea_id").references(() => savedEAs.id).notNull(),
  creatorId: integer("creator_id").references(() => users.id).notNull(),
  subscriberId: integer("subscriber_id").references(() => users.id).notNull(),
  status: text("status").notNull().default('active'), // active, canceled, expired
  stripeSubscriptionId: text("stripe_subscription_id"),
  startDate: timestamp("start_date").defaultNow().notNull(),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    uniqueSubscription: unique().on(table.eaId, table.subscriberId),
  };
});

export const insertSavedEASchema = createInsertSchema(savedEAs).omit({
  id: true,
  shareCount: true,
  createdAt: true,
  updatedAt: true,
  stripeProductId: true,
  stripePriceId: true,
});

export const insertEASubscriptionSchema = createInsertSchema(eaSubscriptions).omit({
  id: true,
  createdAt: true,
  startDate: true,
  endDate: true,
});

export type SavedEA = typeof savedEAs.$inferSelect;
export type InsertSavedEA = z.infer<typeof insertSavedEASchema>;
export type EASubscription = typeof eaSubscriptions.$inferSelect;
export type InsertEASubscription = z.infer<typeof insertEASubscriptionSchema>;

// Market Data Snapshots for Live AI Refresh
export const marketDataSnapshots = pgTable("market_data_snapshots", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  assetType: text("asset_type").notNull(), // 'forex', 'stock', 'crypto', 'index'
  timeframe: text("timeframe").notNull(), // '1m', '5m', '15m', '1h', '4h', '1d'
  provider: text("provider").notNull(),
  data: jsonb("data").notNull(), // OHLCV bars array
  hash: text("hash").notNull(), // Hash for change detection
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
});

export const insertMarketDataSnapshotSchema = createInsertSchema(marketDataSnapshots).omit({
  id: true,
  capturedAt: true,
});

export type MarketDataSnapshot = typeof marketDataSnapshots.$inferSelect;
export type InsertMarketDataSnapshot = z.infer<typeof insertMarketDataSnapshotSchema>;

// Market Data Refresh Jobs for tracking EA refresh history
export const marketDataRefreshJobs = pgTable("market_data_refresh_jobs", {
  id: serial("id").primaryKey(),
  eaId: integer("ea_id").references(() => savedEAs.id).notNull(),
  status: text("status").notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed'
  triggeredBy: text("triggered_by").notNull(), // 'manual', 'scheduled', 'pattern_change'
  changeSummary: jsonb("change_summary"), // Pattern change details
  newDirection: text("new_direction"),
  newConfidence: text("new_confidence"),
  error: text("error"),
  triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertMarketDataRefreshJobSchema = createInsertSchema(marketDataRefreshJobs).omit({
  id: true,
  triggeredAt: true,
  completedAt: true,
});

export type MarketDataRefreshJob = typeof marketDataRefreshJobs.$inferSelect;
export type InsertMarketDataRefreshJob = z.infer<typeof insertMarketDataRefreshJobSchema>;

// EA Share Assets for social sharing with branded images
export const eaShareAssets = pgTable("ea_share_assets", {
  id: serial("id").primaryKey(),
  eaId: integer("ea_id").references(() => savedEAs.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  shareCardUrl: text("share_card_url"), // URL to generated share card image
  chartAnalyses: jsonb("chart_analyses").notNull(), // Array of chart analysis summaries
  unifiedSignal: jsonb("unified_signal"), // Combined trade signal data
  devotionId: integer("devotion_id"), // Index of the scripture used
  devotionVerse: text("devotion_verse"),
  devotionReference: text("devotion_reference"),
  devotionWisdom: text("devotion_wisdom"),
  shareUrl: text("share_url"), // Public share URL
  viewCount: integer("view_count").default(0),
  shareCount: integer("share_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEAShareAssetSchema = createInsertSchema(eaShareAssets).omit({
  id: true,
  viewCount: true,
  shareCount: true,
  createdAt: true,
  updatedAt: true,
});

export type EAShareAsset = typeof eaShareAssets.$inferSelect;
export type InsertEAShareAsset = z.infer<typeof insertEAShareAssetSchema>;

// User Streaks and Tier Gamification
export const userStreaks = pgTable("user_streaks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActivityDate: timestamp("last_activity_date"),
  totalChartsAnalyzed: integer("total_charts_analyzed").notNull().default(0),
  totalEAsCreated: integer("total_eas_created").notNull().default(0),
  totalTrades: integer("total_trades").notNull().default(0),
  tier: text("tier").notNull().default('YG'), // YG, Rising, Pro, Elite, OG
  tierProgress: integer("tier_progress").notNull().default(0), // Progress to next tier (0-100)
  xpPoints: integer("xp_points").notNull().default(0),
  weeklyChartsAnalyzed: integer("weekly_charts_analyzed").notNull().default(0),
  weeklyEAsCreated: integer("weekly_eas_created").notNull().default(0),
  weekStartDate: timestamp("week_start_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserStreakSchema = createInsertSchema(userStreaks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserStreak = typeof userStreaks.$inferSelect;
export type InsertUserStreak = z.infer<typeof insertUserStreakSchema>;

// What If Scenario Analysis
export const scenarioAnalyses = pgTable("scenario_analyses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  chartAnalysisId: integer("chart_analysis_id").references(() => chartAnalyses.id),
  symbol: text("symbol").notNull(),
  currentPrice: text("current_price").notNull(),
  scenarioType: text("scenario_type").notNull(), // 'price_target', 'stop_loss', 'news_impact', 'timeframe', 'market_condition'
  scenarioParams: jsonb("scenario_params").notNull(), // Input parameters for the scenario
  outcomes: jsonb("outcomes").notNull(), // Array of possible outcomes with probabilities
  recommendation: text("recommendation"),
  riskAssessment: text("risk_assessment"),
  profitPotential: text("profit_potential"),
  bestCase: jsonb("best_case"), // Best case scenario details
  worstCase: jsonb("worst_case"), // Worst case scenario details
  mostLikely: jsonb("most_likely"), // Most likely scenario details
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScenarioAnalysisSchema = createInsertSchema(scenarioAnalyses).omit({
  id: true,
  createdAt: true,
});

export type ScenarioAnalysis = typeof scenarioAnalyses.$inferSelect;
export type InsertScenarioAnalysis = z.infer<typeof insertScenarioAnalysisSchema>;

// Webhook Configurations for Trade Signal Relay
export const webhookConfigs = pgTable("webhook_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(), // User-friendly name (e.g., "TradeLocker Signals")
  url: text("url").notNull(), // Webhook endpoint URL
  platform: text("platform").notNull(), // 'tradelocker', 'tradingview', 'custom'
  isActive: boolean("is_active").notNull().default(true),
  triggerOn: jsonb("trigger_on").notNull(), // Array: ['analysis', 'synthesis', 'ea_signal']
  signalFormat: text("signal_format").notNull().default('json'), // 'json', 'tradingview', 'custom'
  customPayloadTemplate: text("custom_payload_template"), // Custom JSON template with placeholders
  secretKey: text("secret_key"), // Optional secret for webhook verification
  headers: jsonb("headers"), // Custom headers (e.g., { "Authorization": "Bearer xxx" })
  lastTriggeredAt: timestamp("last_triggered_at"),
  lastStatus: text("last_status"), // 'success', 'failed', 'pending'
  failureCount: integer("failure_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWebhookConfigSchema = createInsertSchema(webhookConfigs).omit({
  id: true,
  lastTriggeredAt: true,
  lastStatus: true,
  failureCount: true,
  createdAt: true,
  updatedAt: true,
});

export type WebhookConfig = typeof webhookConfigs.$inferSelect;
export type InsertWebhookConfig = z.infer<typeof insertWebhookConfigSchema>;

// Webhook Logs for tracking signal delivery
export const webhookLogs = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id").references(() => webhookConfigs.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  triggerType: text("trigger_type").notNull(), // 'analysis', 'synthesis', 'ea_signal'
  payload: jsonb("payload").notNull(), // The actual payload sent
  responseStatus: integer("response_status"), // HTTP status code
  responseBody: text("response_body"), // Response from the webhook endpoint
  status: text("status").notNull(), // 'success', 'failed', 'pending'
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWebhookLogSchema = createInsertSchema(webhookLogs).omit({
  id: true,
  createdAt: true,
});

export type WebhookLog = typeof webhookLogs.$inferSelect;
export type InsertWebhookLog = z.infer<typeof insertWebhookLogSchema>;

// MT5 API Tokens for EA Trade Copier authentication
export const mt5ApiTokens = pgTable("mt5_api_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  token: text("token").notNull().unique(), // Secure random token
  name: text("name").notNull(), // User-friendly name (e.g., "My MT5 Account")
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  signalCount: integer("signal_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMt5ApiTokenSchema = createInsertSchema(mt5ApiTokens).omit({
  id: true,
  token: true,
  lastUsedAt: true,
  signalCount: true,
  createdAt: true,
});

export type Mt5ApiToken = typeof mt5ApiTokens.$inferSelect;
export type InsertMt5ApiToken = z.infer<typeof insertMt5ApiTokenSchema>;

// MT5 Signal Logs for tracking incoming signals
export const mt5SignalLogs = pgTable("mt5_signal_logs", {
  id: serial("id").primaryKey(),
  tokenId: integer("token_id").references(() => mt5ApiTokens.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(), // 'OPEN', 'CLOSE', 'MODIFY'
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(), // 'BUY', 'SELL'
  volume: real("volume").notNull(),
  entryPrice: real("entry_price").notNull(),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  ticket: text("ticket"), // MT5 ticket number
  relayedToWebhooks: boolean("relayed_to_webhooks").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMt5SignalLogSchema = createInsertSchema(mt5SignalLogs).omit({
  id: true,
  createdAt: true,
});

export type Mt5SignalLog = typeof mt5SignalLogs.$inferSelect;
export type InsertMt5SignalLog = z.infer<typeof insertMt5SignalLogSchema>;

// TradeLocker Connections for direct trade execution
export const tradelockerConnections = pgTable("tradelocker_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  email: text("email").notNull(),
  encryptedPassword: text("encrypted_password").notNull(), // Encrypted password
  serverId: text("server_id").notNull(), // e.g., "FE2024"
  accountId: text("account_id").notNull(), // e.g., "1556546"
  accountType: text("account_type").notNull().default('live'), // 'demo' or 'live'
  isActive: boolean("is_active").notNull().default(true),
  autoExecute: boolean("auto_execute").notNull().default(false), // Auto-execute MT5 signals
  accessToken: text("access_token"), // Cached JWT token
  refreshToken: text("refresh_token"), // Refresh token
  tokenExpiresAt: timestamp("token_expires_at"),
  lastConnectedAt: timestamp("last_connected_at"),
  lastError: text("last_error"),
  tradeCount: integer("trade_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTradelockerConnectionSchema = createInsertSchema(tradelockerConnections).omit({
  id: true,
  accessToken: true,
  refreshToken: true,
  tokenExpiresAt: true,
  lastConnectedAt: true,
  lastError: true,
  tradeCount: true,
  createdAt: true,
  updatedAt: true,
});

export type TradelockerConnection = typeof tradelockerConnections.$inferSelect;
export type InsertTradelockerConnection = z.infer<typeof insertTradelockerConnectionSchema>;

// TradeLocker Trade Logs for tracking executed trades
export const tradelockerTradeLogs = pgTable("tradelocker_trade_logs", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").references(() => tradelockerConnections.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  sourceSignalId: integer("source_signal_id"), // Reference to MT5 signal if from copier
  action: text("action").notNull(), // 'OPEN', 'CLOSE', 'MODIFY'
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(), // 'BUY', 'SELL'
  volume: real("volume").notNull(),
  entryPrice: real("entry_price"),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  tradelockerOrderId: text("tradelocker_order_id"), // Order ID from TradeLocker
  status: text("status").notNull(), // 'pending', 'executed', 'failed', 'rejected'
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTradelockerTradeLogSchema = createInsertSchema(tradelockerTradeLogs).omit({
  id: true,
  createdAt: true,
});

export type TradelockerTradeLog = typeof tradelockerTradeLogs.$inferSelect;
export type InsertTradelockerTradeLog = z.infer<typeof insertTradelockerTradeLogSchema>;

// Tier thresholds configuration
export const TIER_CONFIG = {
  YG: { name: 'Young Gun', minXP: 0, icon: '🔫', color: 'green', nextTier: 'Rising', xpNeeded: 500 },
  Rising: { name: 'Rising Star', minXP: 500, icon: '⭐', color: 'blue', nextTier: 'Pro', xpNeeded: 2000 },
  Pro: { name: 'Pro Trader', minXP: 2000, icon: '💎', color: 'purple', nextTier: 'Elite', xpNeeded: 5000 },
  Elite: { name: 'Elite', minXP: 5000, icon: '👑', color: 'gold', nextTier: 'OG', xpNeeded: 15000 },
  OG: { name: 'Original Gangster', minXP: 15000, icon: '🏆', color: 'red', nextTier: null, xpNeeded: null },
} as const;

// Ambassador Training Progress
export const ambassadorTrainingProgress = pgTable("ambassador_training_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  completedModules: jsonb("completed_modules").notNull().default([]), // Array of completed module IDs
  completedLessons: jsonb("completed_lessons").notNull().default([]), // Array of completed lesson IDs
  quizScores: jsonb("quiz_scores").notNull().default({}), // { lessonId: score }
  totalProgress: integer("total_progress").notNull().default(0), // 0-100 percentage
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  isCompleted: boolean("is_completed").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAmbassadorTrainingProgressSchema = createInsertSchema(ambassadorTrainingProgress).omit({
  id: true,
  startedAt: true,
  completedAt: true,
  updatedAt: true,
});

export type AmbassadorTrainingProgress = typeof ambassadorTrainingProgress.$inferSelect;
export type InsertAmbassadorTrainingProgress = z.infer<typeof insertAmbassadorTrainingProgressSchema>;

// Ambassador Certifications - Digital certificates tied to VEDD TOKEN and NFT
export const ambassadorCertifications = pgTable("ambassador_certifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  certificateNumber: text("certificate_number").notNull().unique(), // e.g., "VEDD-AMB-2026-00001"
  holderName: text("holder_name").notNull(), // Name on the certificate
  issueDate: timestamp("issue_date").defaultNow().notNull(),
  expiryDate: timestamp("expiry_date"), // Optional expiry
  status: text("status").notNull().default('active'), // 'active', 'revoked', 'expired'
  finalScore: integer("final_score").notNull(), // Average quiz score
  modulesCompleted: integer("modules_completed").notNull(),
  solanaWalletAddress: text("solana_wallet_address"), // User's Solana wallet for NFT
  nftMintAddress: text("nft_mint_address"), // Solana NFT mint address
  nftMetadataUri: text("nft_metadata_uri"), // IPFS/Arweave URI for NFT metadata
  nftTransactionId: text("nft_transaction_id"), // Solana transaction signature
  nftMintedAt: timestamp("nft_minted_at"),
  veddTokenBalance: integer("vedd_token_balance").notNull().default(100), // Initial VEDD token reward
  veddTokenClaimed: boolean("vedd_token_claimed").notNull().default(false),
  verificationHash: text("verification_hash").notNull(), // SHA256 hash for verification
  certificateImageUrl: text("certificate_image_url"), // Generated certificate image
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAmbassadorCertificationSchema = createInsertSchema(ambassadorCertifications).omit({
  id: true,
  issueDate: true,
  nftMintedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type AmbassadorCertification = typeof ambassadorCertifications.$inferSelect;
export type InsertAmbassadorCertification = z.infer<typeof insertAmbassadorCertificationSchema>;
