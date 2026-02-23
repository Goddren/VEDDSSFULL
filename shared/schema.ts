import { pgTable, text, serial, integer, boolean, timestamp, jsonb, json, real, unique } from "drizzle-orm/pg-core";
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
  // Solana wallet integration
  walletAddress: text("wallet_address").unique(), // Solana wallet public key
  veddTokenBalance: real("vedd_token_balance").default(0), // VEDD token holdings
  isAmbassador: boolean("is_ambassador").default(false), // Has ambassador NFT
  ambassadorNftMint: text("ambassador_nft_mint"), // Ambassador NFT mint address
  tokenGatedSubscriptionEnd: timestamp("token_gated_subscription_end"), // 3-month free sub for token holders
  lastWalletSync: timestamp("last_wallet_sync"), // Last time wallet data was synced
  walletVerified: boolean("wallet_verified").default(false), // Has user signed message to verify wallet ownership
  isAdmin: boolean("is_admin").default(false), // Admin privileges for token pool management
  membershipTier: text("membership_tier").default('none'), // none, basic, pro, elite - token-gated membership
  membershipNftMint: text("membership_nft_mint"), // VEDD membership NFT mint address for elite tier
  hasVeddNft: boolean("has_vedd_nft").default(false), // Holds a VEDD membership NFT
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
  // Risk Management Settings
  volume: real("volume").default(0.01), // Fixed lot size
  useRiskPercent: boolean("use_risk_percent").default(true), // Use risk % instead of fixed lot
  riskPercent: real("risk_percent").default(0.25), // Risk per trade as % of balance
  maxOpenTrades: integer("max_open_trades").default(1), // Max positions open at once
  dailyLossLimit: real("daily_loss_limit").default(0), // Daily loss limit in $ (0=disabled)
  minConfidence: integer("min_confidence").default(65), // Minimum confidence % to trigger trade
  tradeCooldownMinutes: integer("trade_cooldown_minutes").default(5), // Minutes between trades on same symbol
  liveRefreshEnabled: boolean("live_refresh_enabled").default(false), // Enable live chart refresh
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
  tokenId: integer("token_id").references(() => mt5ApiTokens.id),
  userId: integer("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(), // 'OPEN', 'CLOSE', 'MODIFY'
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(), // 'BUY', 'SELL'
  volume: real("volume").notNull(),
  entryPrice: real("entry_price"),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  ticket: text("ticket"), // MT5 ticket number
  source: text("source"), // 'mt5_ea', 'vedd_live_engine', etc.
  confidence: real("confidence"),
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
  accNum: text("acc_num"), // Cached TradeLocker account number for API calls
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

// AI Trade Results - tracks accuracy of AI signals
export const aiTradeResults = pgTable("ai_trade_results", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  analysisId: integer("analysis_id").references(() => chartAnalyses.id),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe"),
  direction: text("direction").notNull(), // 'BUY' or 'SELL'
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price"),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  aiConfidence: integer("ai_confidence"), // AI confidence when signal was given
  result: text("result"), // 'WIN', 'LOSS', 'BREAKEVEN', 'PENDING'
  profitLoss: real("profit_loss"), // Actual P/L in account currency
  profitLossPips: real("profit_loss_pips"), // P/L in pips
  closedAt: timestamp("closed_at"), // When trade was closed
  source: text("source").default('manual'), // 'manual', 'auto', 'mt5_copier'
  mt5Ticket: text("mt5_ticket"), // MT5 trade ticket number for sync
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAiTradeResultSchema = createInsertSchema(aiTradeResults).omit({
  id: true,
  createdAt: true,
});

export type AiTradeResult = typeof aiTradeResults.$inferSelect;
export type InsertAiTradeResult = z.infer<typeof insertAiTradeResultSchema>;

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

// Governance Proposals - VEDD token holder voting
export const governanceProposals = pgTable("governance_proposals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  proposerUserId: integer("proposer_user_id").references(() => users.id).notNull(),
  proposerWallet: text("proposer_wallet").notNull(), // Wallet address of proposer
  category: text("category").notNull(), // 'feature', 'tokenomics', 'partnership', 'community', 'other'
  status: text("status").notNull().default('active'), // 'active', 'passed', 'rejected', 'executed', 'cancelled'
  votesFor: integer("votes_for").notNull().default(0),
  votesAgainst: integer("votes_against").notNull().default(0),
  totalVotingPower: real("total_voting_power").notNull().default(0), // Total VEDD tokens used in voting
  quorumRequired: real("quorum_required").notNull().default(1000), // Min VEDD tokens needed
  startDate: timestamp("start_date").defaultNow().notNull(),
  endDate: timestamp("end_date").notNull(),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const governanceVotes = pgTable("governance_votes", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").references(() => governanceProposals.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  walletAddress: text("wallet_address").notNull(),
  vote: text("vote").notNull(), // 'for', 'against', 'abstain'
  votingPower: real("voting_power").notNull(), // VEDD tokens held at time of vote
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    uniqueVote: unique().on(table.proposalId, table.userId),
  };
});

export const insertGovernanceProposalSchema = createInsertSchema(governanceProposals).omit({
  id: true,
  votesFor: true,
  votesAgainst: true,
  totalVotingPower: true,
  executedAt: true,
  createdAt: true,
});

export const insertGovernanceVoteSchema = createInsertSchema(governanceVotes).omit({
  id: true,
  createdAt: true,
});

export type GovernanceProposal = typeof governanceProposals.$inferSelect;
export type InsertGovernanceProposal = z.infer<typeof insertGovernanceProposalSchema>;
export type GovernanceVote = typeof governanceVotes.$inferSelect;
export type InsertGovernanceVote = z.infer<typeof insertGovernanceVoteSchema>;

// 44-Day Ambassador Content Flow
export const ambassadorDailyLessons = pgTable("ambassador_daily_lessons", {
  id: serial("id").primaryKey(),
  dayNumber: integer("day_number").notNull().unique(), // 1-44
  title: text("title").notNull(),
  tradingTopic: text("trading_topic").notNull(), // Main trading focus for the day
  tradingLesson: text("trading_lesson").notNull(), // Detailed trading lesson content
  scriptureReference: text("scripture_reference").notNull(), // e.g., "Proverbs 21:5"
  scriptureText: text("scripture_text").notNull(), // Full scripture text
  devotionalMessage: text("devotional_message").notNull(), // Trading + faith connection
  contentPrompt: text("content_prompt").notNull(), // AI prompt template for generating posts
  suggestedHashtags: text("suggested_hashtags").array(), // Array of suggested hashtags
  mediaType: text("media_type").notNull().default('image'), // 'image', 'video', 'carousel'
  tokenReward: integer("token_reward").notNull().default(15), // Tokens earned for completion
  bonusTokens: integer("bonus_tokens").notNull().default(5), // Extra for uploading media
  weekNumber: integer("week_number").notNull(), // 1-7 (44 days = ~6.3 weeks)
  category: text("category").notNull(), // 'foundation', 'strategy', 'mindset', 'execution', 'review'
});

export const ambassadorContentProgress = pgTable("ambassador_content_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  dayNumber: integer("day_number").notNull(),
  status: text("status").notNull().default('locked'), // 'locked', 'available', 'in_progress', 'completed'
  aiGeneratedContent: text("ai_generated_content"), // AI-generated post text
  userMediaUrl: text("user_media_url"), // Uploaded image/video URL
  userMediaType: text("user_media_type"), // 'image', 'video'
  customContent: text("custom_content"), // User's custom additions
  tokensEarned: integer("tokens_earned").notNull().default(0),
  completedAt: timestamp("completed_at"),
  startedAt: timestamp("started_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    uniqueUserDay: unique().on(table.userId, table.dayNumber),
  };
});

export const ambassadorContentStats = pgTable("ambassador_content_stats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  currentDay: integer("current_day").notNull().default(1), // Current unlocked day
  completedDays: integer("completed_days").notNull().default(0),
  totalTokensEarned: integer("total_tokens_earned").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0), // Consecutive days completed
  longestStreak: integer("longest_streak").notNull().default(0),
  lastCompletedAt: timestamp("last_completed_at"),
  journeyStartedAt: timestamp("journey_started_at"),
  journeyCompletedAt: timestamp("journey_completed_at"), // When all 44 days done
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAmbassadorDailyLessonSchema = createInsertSchema(ambassadorDailyLessons).omit({
  id: true,
});

export const insertAmbassadorContentProgressSchema = createInsertSchema(ambassadorContentProgress).omit({
  id: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAmbassadorContentStatsSchema = createInsertSchema(ambassadorContentStats).omit({
  id: true,
  journeyCompletedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type AmbassadorDailyLesson = typeof ambassadorDailyLessons.$inferSelect;
export type InsertAmbassadorDailyLesson = z.infer<typeof insertAmbassadorDailyLessonSchema>;
export type AmbassadorContentProgress = typeof ambassadorContentProgress.$inferSelect;
export type InsertAmbassadorContentProgress = z.infer<typeof insertAmbassadorContentProgressSchema>;
export type AmbassadorContentStats = typeof ambassadorContentStats.$inferSelect;
export type InsertAmbassadorContentStats = z.infer<typeof insertAmbassadorContentStatsSchema>;

// ==========================================
// COMMUNITY FEATURES (nas.io style)
// ==========================================

// Social Content Directions - Platform-specific post suggestions per day
export const ambassadorSocialDirections = pgTable("ambassador_social_directions", {
  id: serial("id").primaryKey(),
  dayNumber: integer("day_number").notNull(),
  platform: text("platform").notNull(), // 'twitter', 'instagram', 'tiktok', 'linkedin', 'facebook', 'youtube'
  contentType: text("content_type").notNull(), // 'post', 'story', 'reel', 'thread', 'carousel', 'video'
  postIdea: text("post_idea").notNull(), // Main content idea
  captionTemplate: text("caption_template").notNull(), // Ready-to-use caption
  hookLine: text("hook_line").notNull(), // Attention-grabbing first line
  callToAction: text("call_to_action").notNull(), // CTA to include
  hashtags: text("hashtags").array(), // Platform-optimized hashtags
  bestPostingTime: text("best_posting_time"), // e.g., "9am-11am EST"
  engagementTips: text("engagement_tips").array(), // Tips to boost engagement
  aiGenerated: boolean("ai_generated").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    uniqueDayPlatform: unique().on(table.dayNumber, table.platform),
  };
});

// Community Challenges - Weekly/Monthly challenges for ambassadors
export const ambassadorChallenges = pgTable("ambassador_challenges", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  challengeType: text("challenge_type").notNull(), // 'daily', 'weekly', 'monthly', 'special'
  category: text("category").notNull(), // 'content', 'engagement', 'trading', 'community', 'learning'
  difficulty: text("difficulty").notNull().default('medium'), // 'easy', 'medium', 'hard', 'expert'
  objectives: jsonb("objectives").notNull(), // Array of tasks to complete
  successCriteria: text("success_criteria").notNull(), // How to verify completion
  tokenReward: integer("token_reward").notNull().default(50),
  bonusReward: integer("bonus_reward").default(0), // Extra for top performers
  badgeReward: text("badge_reward"), // Special badge earned
  maxParticipants: integer("max_participants"), // null = unlimited
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  weekNumber: integer("week_number"), // Links to content journey week
  status: text("status").notNull().default('upcoming'), // 'upcoming', 'active', 'completed', 'cancelled'
  aiGenerated: boolean("ai_generated").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Challenge Participants - Tracks who joined which challenges
export const ambassadorChallengeParticipants = pgTable("ambassador_challenge_participants", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").references(() => ambassadorChallenges.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  status: text("status").notNull().default('joined'), // 'joined', 'in_progress', 'completed', 'failed'
  progress: jsonb("progress"), // Track individual objective completion
  proofUrl: text("proof_url"), // Screenshot/link as proof
  tokensEarned: integer("tokens_earned").default(0),
  completedAt: timestamp("completed_at"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => {
  return {
    uniqueUserChallenge: unique().on(table.challengeId, table.userId),
  };
});

// Community Events - Hostable events for ambassadors
export const ambassadorEvents = pgTable("ambassador_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  eventType: text("event_type").notNull(), // 'live_session', 'ama', 'workshop', 'webinar', 'meetup', 'challenge_kickoff'
  format: text("format").notNull(), // 'virtual', 'in_person', 'hybrid'
  hostGuide: text("host_guide").notNull(), // Detailed guide on how to host
  talkingPoints: jsonb("talking_points"), // Key points to cover
  agenda: jsonb("agenda"), // Timed agenda items
  resourceLinks: jsonb("resource_links"), // Helpful materials
  suggestedDuration: integer("suggested_duration").notNull().default(60), // Minutes
  tokenReward: integer("token_reward").notNull().default(25), // For attendees
  hostTokenReward: integer("host_token_reward").notNull().default(100), // For hosts
  scheduledDate: timestamp("scheduled_date"),
  weekNumber: integer("week_number"), // Links to content journey week
  status: text("status").notNull().default('template'), // 'template', 'scheduled', 'live', 'completed', 'cancelled'
  aiGenerated: boolean("ai_generated").notNull().default(true),
  recordingUrl: text("recording_url"), // URL to event recording for replay
  recordingUploadedAt: timestamp("recording_uploaded_at"),
  recordingUploadedBy: integer("recording_uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Event Registrations - Tracks event attendance
export const ambassadorEventRegistrations = pgTable("ambassador_event_registrations", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => ambassadorEvents.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  role: text("role").notNull().default('attendee'), // 'attendee', 'host', 'co_host', 'speaker'
  status: text("status").notNull().default('registered'), // 'registered', 'attended', 'no_show'
  tokensEarned: integer("tokens_earned").default(0),
  feedback: text("feedback"), // Post-event feedback
  rating: integer("rating"), // 1-5 stars
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  attendedAt: timestamp("attended_at"),
}, (table) => {
  return {
    uniqueUserEvent: unique().on(table.eventId, table.userId),
  };
});

// Insert schemas for community features
export const insertAmbassadorSocialDirectionSchema = createInsertSchema(ambassadorSocialDirections).omit({
  id: true,
  createdAt: true,
});

export const insertAmbassadorChallengeSchema = createInsertSchema(ambassadorChallenges).omit({
  id: true,
  createdAt: true,
});

export const insertAmbassadorChallengeParticipantSchema = createInsertSchema(ambassadorChallengeParticipants).omit({
  id: true,
  completedAt: true,
  joinedAt: true,
});

export const insertAmbassadorEventSchema = createInsertSchema(ambassadorEvents).omit({
  id: true,
  createdAt: true,
});

export const insertAmbassadorEventRegistrationSchema = createInsertSchema(ambassadorEventRegistrations).omit({
  id: true,
  registeredAt: true,
  attendedAt: true,
});

// Challenge Sessions - tracks per-user challenge journey with AI guidance
export const ambassadorChallengeSessions = pgTable("ambassador_challenge_sessions", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").references(() => ambassadorChallenges.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  status: text("status").notNull().default('in_progress'), // 'in_progress', 'completed', 'abandoned'
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull().default(1),
  aiContext: json("ai_context").$type<{
    guidance: string;
    tips: string[];
    encouragement: string;
  }>(),
  aiSteps: json("ai_steps").$type<{
    stepNumber: number;
    title: string;
    description: string;
    tips: string[];
    completed: boolean;
  }[]>(),
  evidenceUrl: text("evidence_url"),
  evidenceNotes: text("evidence_notes"),
  tokensClaimed: boolean("tokens_claimed").default(false),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => {
  return {
    uniqueUserChallenge: unique().on(table.challengeId, table.userId),
  };
});

// Event Schedules - host-created sessions for events
export const ambassadorEventSchedules = pgTable("ambassador_event_schedules", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => ambassadorEvents.id).notNull(),
  hostId: integer("host_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at"),
  timezone: text("timezone").default('UTC'),
  capacity: integer("capacity").default(50),
  currentAttendees: integer("current_attendees").default(0),
  meetingLink: text("meeting_link"),
  shareSlug: text("share_slug").unique(), // Unique slug for public sharing
  aiAgenda: json("ai_agenda").$type<{
    overview: string;
    agenda: { time: string; topic: string; description: string }[];
    preparationTips: string[];
    hostingTips: string[];
  }>(),
  status: text("status").notNull().default('scheduled'), // 'scheduled', 'live', 'completed', 'cancelled'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Schedule Registrations - users registered for specific schedules
export const ambassadorScheduleRegistrations = pgTable("ambassador_schedule_registrations", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").references(() => ambassadorEventSchedules.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  status: text("status").notNull().default('registered'), // 'registered', 'attended', 'no_show'
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  attendedAt: timestamp("attended_at"),
}, (table) => {
  return {
    uniqueUserSchedule: unique().on(table.scheduleId, table.userId),
  };
});

// Community Comments - for challenges and events
export const ambassadorCommunityComments = pgTable("ambassador_community_comments", {
  id: serial("id").primaryKey(),
  targetType: text("target_type").notNull(), // 'challenge', 'event', 'schedule'
  targetId: integer("target_id").notNull(),
  parentId: integer("parent_id"), // For threaded replies
  authorId: integer("author_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  likes: integer("likes").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
});

// Insert schemas for new community features
export const insertAmbassadorChallengeSessionSchema = createInsertSchema(ambassadorChallengeSessions).omit({
  id: true,
  startedAt: true,
  completedAt: true,
});

export const insertAmbassadorEventScheduleSchema = createInsertSchema(ambassadorEventSchedules).omit({
  id: true,
  createdAt: true,
});

export const insertAmbassadorScheduleRegistrationSchema = createInsertSchema(ambassadorScheduleRegistrations).omit({
  id: true,
  registeredAt: true,
  attendedAt: true,
});

export const insertAmbassadorCommunityCommentSchema = createInsertSchema(ambassadorCommunityComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ============================================
// VEDD Token Pool Wallet System
// ============================================

// Pool Wallets - Central wallets holding VEDD tokens for distribution
export const veddPoolWallets = pgTable("vedd_pool_wallets", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(), // e.g., "Ambassador Rewards Pool", "Subscription Refunds Pool"
  publicKey: text("public_key").notNull().unique(), // Solana public key
  walletType: text("wallet_type").notNull().default('rewards'), // 'rewards', 'subscriptions', 'marketing'
  status: text("status").notNull().default('active'), // 'active', 'paused', 'depleted'
  tokenBalance: real("token_balance").default(0), // Cached balance (synced periodically)
  lowBalanceThreshold: real("low_balance_threshold").default(1000), // Alert when below this
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Transfer Jobs - Queue of pending/completed token transfers
export const veddTransferJobs = pgTable("vedd_transfer_jobs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  sourceWalletId: integer("source_wallet_id").references(() => veddPoolWallets.id).notNull(),
  destinationWallet: text("destination_wallet").notNull(), // User's Solana wallet address
  amount: real("amount").notNull(), // VEDD tokens to transfer
  actionType: text("action_type").notNull(), // 'challenge_completion', 'event_hosting', 'content_share', 'referral', 'subscription_refund'
  actionId: integer("action_id"), // Reference to the specific action (challenge ID, event ID, etc.)
  status: text("status").notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed', 'cancelled'
  solanaTransactionSig: text("solana_transaction_sig"), // Solana transaction signature when completed
  errorMessage: text("error_message"), // Error details if failed
  retryCount: integer("retry_count").default(0),
  idempotencyKey: text("idempotency_key").unique(), // Prevent duplicate transfers
  metadata: jsonb("metadata"), // Additional context (challenge name, event title, etc.)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

// Ambassador Action Rewards - Track rewards for verified ambassador actions
export const ambassadorActionRewards = pgTable("ambassador_action_rewards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  actionType: text("action_type").notNull(), // 'challenge_completion', 'event_hosting', 'content_share', 'referral', 'streak_bonus'
  actionId: integer("action_id"), // Reference to specific challenge/event/etc.
  baseReward: real("base_reward").notNull(), // Base VEDD tokens earned
  bonusReward: real("bonus_reward").default(0), // Bonus tokens (streak, early completion, etc.)
  totalReward: real("total_reward").notNull(), // baseReward + bonusReward
  verificationStatus: text("verification_status").notNull().default('pending'), // 'pending', 'verified', 'rejected'
  verifiedBy: integer("verified_by").references(() => users.id), // Admin who verified (null for auto-verified)
  verifiedAt: timestamp("verified_at"),
  transferJobId: integer("transfer_job_id").references(() => veddTransferJobs.id), // Link to transfer when processed
  notes: text("notes"), // Admin notes or rejection reason
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Subscription Token Payments - Token redemptions for subscription payments
export const subscriptionTokenPayments = pgTable("subscription_token_payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  subscriptionPlanId: integer("subscription_plan_id").references(() => subscriptionPlans.id).notNull(),
  tokenAmount: real("token_amount").notNull(), // VEDD tokens used
  usdEquivalent: real("usd_equivalent").notNull(), // USD value at time of redemption
  exchangeRate: real("exchange_rate").notNull(), // VEDD/USD rate used
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: text("status").notNull().default('pending'), // 'pending', 'applied', 'refunded'
  stripeInvoiceId: text("stripe_invoice_id"), // If partially paid with Stripe
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Reward Configuration - Define reward amounts for different actions
export const veddRewardConfig = pgTable("vedd_reward_config", {
  id: serial("id").primaryKey(),
  actionType: text("action_type").notNull().unique(), // 'challenge_completion', 'event_hosting', etc.
  baseAmount: real("base_amount").notNull(), // Base VEDD tokens for this action
  streakMultiplier: real("streak_multiplier").default(1.0), // Multiplier per streak level
  maxDailyRewards: integer("max_daily_rewards").default(5), // Rate limit per user per day
  requiresVerification: boolean("requires_verification").default(false), // If true, admin must verify
  isActive: boolean("is_active").default(true),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Insert schemas for VEDD token system
export const insertVeddPoolWalletSchema = createInsertSchema(veddPoolWallets).omit({
  id: true,
  tokenBalance: true,
  lastSyncAt: true,
  createdAt: true,
});

export const insertVeddTransferJobSchema = createInsertSchema(veddTransferJobs).omit({
  id: true,
  solanaTransactionSig: true,
  errorMessage: true,
  retryCount: true,
  createdAt: true,
  processedAt: true,
});

export const insertAmbassadorActionRewardSchema = createInsertSchema(ambassadorActionRewards).omit({
  id: true,
  verifiedBy: true,
  verifiedAt: true,
  transferJobId: true,
  createdAt: true,
});

export const insertSubscriptionTokenPaymentSchema = createInsertSchema(subscriptionTokenPayments).omit({
  id: true,
  createdAt: true,
});

export const insertVeddRewardConfigSchema = createInsertSchema(veddRewardConfig).omit({
  id: true,
  updatedAt: true,
});

// Types for VEDD token system
export type VeddPoolWallet = typeof veddPoolWallets.$inferSelect;
export type InsertVeddPoolWallet = z.infer<typeof insertVeddPoolWalletSchema>;
export type VeddTransferJob = typeof veddTransferJobs.$inferSelect;
export type InsertVeddTransferJob = z.infer<typeof insertVeddTransferJobSchema>;
export type AmbassadorActionReward = typeof ambassadorActionRewards.$inferSelect;
export type InsertAmbassadorActionReward = z.infer<typeof insertAmbassadorActionRewardSchema>;
export type SubscriptionTokenPayment = typeof subscriptionTokenPayments.$inferSelect;
export type InsertSubscriptionTokenPayment = z.infer<typeof insertSubscriptionTokenPaymentSchema>;
export type VeddRewardConfig = typeof veddRewardConfig.$inferSelect;
export type InsertVeddRewardConfig = z.infer<typeof insertVeddRewardConfigSchema>;

// Internal Wallet System - Holds tokens until user withdraws to pump.fun wallet
export const internalWallets = pgTable("internal_wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  veddBalance: real("vedd_balance").notNull().default(0), // Tokens held in app
  pendingBalance: real("pending_balance").notNull().default(0), // Tokens awaiting admin verification
  totalEarned: real("total_earned").notNull().default(0), // Lifetime earnings
  totalWithdrawn: real("total_withdrawn").notNull().default(0), // Lifetime withdrawals
  lastActivityAt: timestamp("last_activity_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Withdrawal Requests - User requests to transfer tokens to their pump.fun wallet
export const withdrawalRequests = pgTable("withdrawal_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  amount: real("amount").notNull(), // VEDD tokens to withdraw
  destinationWallet: text("destination_wallet").notNull(), // User's pump.fun Solana wallet
  status: text("status").notNull().default('pending'), // 'pending', 'approved', 'processing', 'completed', 'rejected'
  adminId: integer("admin_id").references(() => users.id), // Admin who processed
  adminNotes: text("admin_notes"),
  solanaTransactionSig: text("solana_transaction_sig"), // Tx signature when completed
  errorMessage: text("error_message"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

// Insert schemas for internal wallet system
export const insertInternalWalletSchema = createInsertSchema(internalWallets).omit({
  id: true,
  lastActivityAt: true,
  createdAt: true,
});

export const insertWithdrawalRequestSchema = createInsertSchema(withdrawalRequests).omit({
  id: true,
  adminId: true,
  adminNotes: true,
  solanaTransactionSig: true,
  errorMessage: true,
  requestedAt: true,
  processedAt: true,
});

// Types for internal wallet system
export type InternalWallet = typeof internalWallets.$inferSelect;
export type InsertInternalWallet = z.infer<typeof insertInternalWalletSchema>;
export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;
export type InsertWithdrawalRequest = z.infer<typeof insertWithdrawalRequestSchema>;

// ============================================
// Connected Social Accounts for Auto-Sharing
// ============================================

// User Connected Social Accounts - Store OAuth tokens for each platform
export const connectedSocialAccounts = pgTable("connected_social_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  platform: text("platform").notNull(), // 'twitter', 'facebook', 'instagram', 'linkedin', 'tiktok'
  platformUserId: text("platform_user_id"), // User ID on the platform
  platformUsername: text("platform_username"), // Username/handle on platform
  accessToken: text("access_token"), // OAuth access token (encrypted)
  refreshToken: text("refresh_token"), // OAuth refresh token (encrypted)
  tokenExpiresAt: timestamp("token_expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => {
  return {
    uniqueUserPlatform: unique().on(table.userId, table.platform),
  };
});

// Social Posts - Track posts shared to platforms
export const socialPosts = pgTable("social_posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  platform: text("platform").notNull(), // 'twitter', 'facebook', 'instagram', 'linkedin', 'tiktok'
  contentType: text("content_type").notNull(), // 'image', 'video', 'carousel', 'thread', 'story'
  caption: text("caption"),
  mediaUrls: text("media_urls").array(), // Array of media file URLs
  hashtags: text("hashtags").array(),
  sourceType: text("source_type").notNull(), // 'content_journey', 'analysis', 'ea_share', 'manual'
  sourceId: integer("source_id"), // Reference to content journey day, analysis ID, etc.
  platformPostId: text("platform_post_id"), // ID of the post on the platform
  platformPostUrl: text("platform_post_url"), // URL to view the post
  status: text("status").notNull().default('pending'), // 'pending', 'published', 'failed', 'scheduled'
  scheduledFor: timestamp("scheduled_for"),
  publishedAt: timestamp("published_at"),
  errorMessage: text("error_message"),
  engagement: jsonb("engagement").$type<{
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for social accounts
export const insertConnectedSocialAccountSchema = createInsertSchema(connectedSocialAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSocialPostSchema = createInsertSchema(socialPosts).omit({
  id: true,
  platformPostId: true,
  platformPostUrl: true,
  publishedAt: true,
  errorMessage: true,
  engagement: true,
  createdAt: true,
});

// Types for social accounts
export type ConnectedSocialAccount = typeof connectedSocialAccounts.$inferSelect;
export type InsertConnectedSocialAccount = z.infer<typeof insertConnectedSocialAccountSchema>;
export type SocialPost = typeof socialPosts.$inferSelect;
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;

// Types for community features
export type AmbassadorSocialDirection = typeof ambassadorSocialDirections.$inferSelect;
export type InsertAmbassadorSocialDirection = z.infer<typeof insertAmbassadorSocialDirectionSchema>;
export type AmbassadorChallenge = typeof ambassadorChallenges.$inferSelect;
export type InsertAmbassadorChallenge = z.infer<typeof insertAmbassadorChallengeSchema>;
export type AmbassadorChallengeParticipant = typeof ambassadorChallengeParticipants.$inferSelect;
export type InsertAmbassadorChallengeParticipant = z.infer<typeof insertAmbassadorChallengeParticipantSchema>;
export type AmbassadorEvent = typeof ambassadorEvents.$inferSelect;
export type InsertAmbassadorEvent = z.infer<typeof insertAmbassadorEventSchema>;
export type AmbassadorEventRegistration = typeof ambassadorEventRegistrations.$inferSelect;
export type InsertAmbassadorEventRegistration = z.infer<typeof insertAmbassadorEventRegistrationSchema>;
export type AmbassadorChallengeSession = typeof ambassadorChallengeSessions.$inferSelect;
export type InsertAmbassadorChallengeSession = z.infer<typeof insertAmbassadorChallengeSessionSchema>;
export type AmbassadorEventSchedule = typeof ambassadorEventSchedules.$inferSelect;
export type InsertAmbassadorEventSchedule = z.infer<typeof insertAmbassadorEventScheduleSchema>;
export type AmbassadorScheduleRegistration = typeof ambassadorScheduleRegistrations.$inferSelect;
export type InsertAmbassadorScheduleRegistration = z.infer<typeof insertAmbassadorScheduleRegistrationSchema>;
export type AmbassadorCommunityComment = typeof ambassadorCommunityComments.$inferSelect;
export type InsertAmbassadorCommunityComment = z.infer<typeof insertAmbassadorCommunityCommentSchema>;

// ============================================
// Solana Token Auto-Trading System
// ============================================

// Trading Wallet - Holds SOL for auto-trading tokens
export const tradingWallets = pgTable("trading_wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  solBalance: real("sol_balance").notNull().default(0), // Available SOL for trading
  lockedBalance: real("locked_balance").notNull().default(0), // SOL in open positions
  totalDeposited: real("total_deposited").notNull().default(0), // Lifetime deposits
  totalWithdrawn: real("total_withdrawn").notNull().default(0), // Lifetime withdrawals
  totalProfitLoss: real("total_profit_loss").notNull().default(0), // Lifetime P/L
  isAutoTradeEnabled: boolean("is_auto_trade_enabled").notNull().default(false),
  maxPositions: integer("max_positions").notNull().default(3), // Max concurrent trades
  tradeAmountSol: real("trade_amount_sol").notNull().default(0.1), // SOL per trade
  takeProfitPercent: real("take_profit_percent").notNull().default(50), // Auto sell at +X%
  stopLossPercent: real("stop_loss_percent").notNull().default(20), // Auto sell at -X%
  minSignalConfidence: integer("min_signal_confidence").notNull().default(70), // Min confidence to buy
  isAutoRebalanceEnabled: boolean("is_auto_rebalance_enabled").notNull().default(false), // Auto-sell losers and buy better tokens
  rebalanceThresholdPercent: real("rebalance_threshold_percent").notNull().default(10), // Sell when token drops X% and find replacement
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
});

// Token Positions - Active and closed trades
export const tokenPositions = pgTable("token_positions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  tokenAddress: text("token_address").notNull(), // Solana token mint address
  tokenSymbol: text("token_symbol").notNull(),
  tokenName: text("token_name"),
  entryPriceSol: real("entry_price_sol").notNull(), // Price when bought
  currentPriceSol: real("current_price_sol"), // Latest price
  amountTokens: real("amount_tokens").notNull(), // Tokens held
  amountSolInvested: real("amount_sol_invested").notNull(), // SOL spent
  unrealizedPL: real("unrealized_pl").default(0), // Current P/L
  realizedPL: real("realized_pl"), // Final P/L when closed
  status: text("status").notNull().default('open'), // 'open', 'closed', 'stopped_out', 'take_profit'
  signalConfidence: integer("signal_confidence"), // AI confidence when bought
  signalType: text("signal_type"), // 'STRONG_BUY', 'BUY', etc.
  exitReason: text("exit_reason"), // 'manual', 'take_profit', 'stop_loss', 'pump_dump_detected'
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
});

// Trading Activity Log - All trades and events
export const tradingActivityLog = pgTable("trading_activity_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  positionId: integer("position_id").references(() => tokenPositions.id),
  action: text("action").notNull(), // 'deposit', 'withdraw', 'buy', 'sell', 'stop_loss', 'take_profit'
  tokenAddress: text("token_address"),
  tokenSymbol: text("token_symbol"),
  amountSol: real("amount_sol"),
  amountTokens: real("amount_tokens"),
  priceSol: real("price_sol"),
  profitLoss: real("profit_loss"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTradingWalletSchema = createInsertSchema(tradingWallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTokenPositionSchema = createInsertSchema(tokenPositions).omit({
  id: true,
  openedAt: true,
  closedAt: true,
});

export const insertTradingActivityLogSchema = createInsertSchema(tradingActivityLog).omit({
  id: true,
  createdAt: true,
});

export type TradingWallet = typeof tradingWallets.$inferSelect;
export type InsertTradingWallet = z.infer<typeof insertTradingWalletSchema>;
export type TokenPosition = typeof tokenPositions.$inferSelect;
export type InsertTokenPosition = z.infer<typeof insertTokenPositionSchema>;
export type TradingActivityLog = typeof tradingActivityLog.$inferSelect;
export type InsertTradingActivityLog = z.infer<typeof insertTradingActivityLogSchema>;

export const userApiKeys = pgTable("user_api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  provider: text("provider").notNull(), // openai, anthropic, google, groq, mistral
  apiKey: text("api_key").notNull(), // encrypted key
  label: text("label"), // user-friendly name
  isActive: boolean("is_active").default(true).notNull(),
  isValid: boolean("is_valid").default(false).notNull(),
  lastValidated: timestamp("last_validated"),
  lastUsed: timestamp("last_used"),
  usageCount: integer("usage_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("user_provider_unique").on(table.userId, table.provider),
]);

export const insertUserApiKeySchema = createInsertSchema(userApiKeys).omit({
  id: true,
  createdAt: true,
  lastValidated: true,
  lastUsed: true,
  usageCount: true,
});

export type UserApiKey = typeof userApiKeys.$inferSelect;
export type InsertUserApiKey = z.infer<typeof insertUserApiKeySchema>;

export const weeklyStrategies = pgTable("weekly_strategies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  profitTarget: real("profit_target").notNull(),
  accountBalance: real("account_balance").notNull(),
  pairs: text("pairs").array().notNull(),
  riskLevel: text("risk_level").default('ai-controlled'),
  lotSize: text("lot_size").default('auto'),
  plan: jsonb("plan").notNull(),
  pairStats: jsonb("pair_stats"),
  generatedAt: text("generated_at").notNull(),
  weekStart: text("week_start").notNull(),
  currentProfit: real("current_profit").default(0),
  progressTrades: integer("progress_trades").default(0),
  progressWinRate: integer("progress_win_rate").default(0),
  progressPercentage: integer("progress_percentage").default(0),
  isActive: boolean("is_active").default(true),
});

export type WeeklyStrategy = typeof weeklyStrategies.$inferSelect;
export type InsertWeeklyStrategy = typeof weeklyStrategies.$inferInsert;

export const aiModelConfigs = pgTable("ai_model_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  routingMode: text("routing_mode").notNull().default('single'),
  primaryModelId: text("primary_model_id").notNull().default('openai-gpt4o'),
  ensembleModelIds: jsonb("ensemble_model_ids").$type<string[]>().default([]),
  strategyAssignments: jsonb("strategy_assignments").$type<Record<string, string>>().default({}),
  fallbackOrder: jsonb("fallback_order").$type<string[]>().default([]),
  ensembleMinAgreement: integer("ensemble_min_agreement").notNull().default(60),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAiModelConfigSchema = createInsertSchema(aiModelConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AiModelConfig = typeof aiModelConfigs.$inferSelect;
export type InsertAiModelConfig = z.infer<typeof insertAiModelConfigSchema>;
