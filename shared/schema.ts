import { pgTable, text, serial, integer, boolean, timestamp, jsonb, json, real, unique, doublePrecision, pgEnum, date, varchar } from "drizzle-orm/pg-core";
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
  lsVariantId: text("ls_variant_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Monthly cap (in cents) on platform-key AI spend for users on this plan who
  // haven't added their own AI provider key — once hit, platform-key AI calls
  // are blocked for the rest of the billing cycle until they add a personal key.
  aiMonthlyCostCapCents: integer("ai_monthly_cost_cap_cents").notNull().default(50),
});

// Per-call AI usage ledger — every AI request (any provider/model) logs a row here
// so platform-key spend can be tracked and capped per user/membership tier.
export const aiUsageLog = pgTable("ai_usage_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  costCents: real("cost_cents").notNull().default(0),
  usedPlatformKey: boolean("used_platform_key").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AiUsageLog = typeof aiUsageLog.$inferSelect;
export type InsertAiUsageLog = typeof aiUsageLog.$inferInsert;

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
  lsCustomerId: text("ls_customer_id"),
  lsSubscriptionId: text("ls_subscription_id"),
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
  aiCostMode: text("ai_cost_mode").default('full'), // 'full' = best key, 'economy' = Groq free models
  membershipTier: text("membership_tier").default('none'), // none, basic, pro, elite - token-gated membership
  membershipNftMint: text("membership_nft_mint"), // VEDD membership NFT mint address for elite tier
  hasVeddNft: boolean("has_vedd_nft").default(false), // Holds a VEDD membership NFT
  breakoutModeEnabled: boolean("breakout_mode_enabled").default(false), // Breakout Master Mode for 2nd confirmation AI
  aiVisionEnabled: boolean("ai_vision_enabled").default(true), // AI 2nd-confirmation Vision system — ON by default
  trailingStopEnabled: boolean("trailing_stop_enabled").default(true), // Remove trailing stop from AI recommendations when false
  // faithBasedContent field temporarily removed due to database issues
  // Using localStorage instead of database column for faith-based content preferences
  referralCode: text("referral_code").unique(),
  referredBy: integer("referred_by"),
  referralCredits: integer("referral_credits").default(0), // Ambassador/referral credit balance
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
  city: text("city"), // Free-text city/zip — powers the Ambassador local-outreach to-do tasks (nearby venue templates, local-event prompts)
  propFirmReferralLink: text("prop_firm_referral_link"), // Ambassador's own prop-firm affiliate link (e.g. atlasfunded.com/?afmc=...) — used in the "host a prop firm setup event" flow
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

// Referral Visits — tracks every link click (anonymous + registered)
export const referralVisits = pgTable("referral_visits", {
  id: serial("id").primaryKey(),
  referralCode: text("referral_code").notNull(),
  referrerId: integer("referrer_id").references(() => users.id),
  visitorId: integer("visitor_id").references(() => users.id), // set when they register
  visitorIp: text("visitor_ip"),
  userAgent: text("user_agent"),
  visitedAt: timestamp("visited_at").defaultNow().notNull(),
  signedUp: boolean("signed_up").default(false),
  signedUpAt: timestamp("signed_up_at"),
  subscribed: boolean("subscribed").default(false),
  subscribedAt: timestamp("subscribed_at"),
  reminderSent: boolean("reminder_sent").default(false),
  reminderSentAt: timestamp("reminder_sent_at"),
});

export const insertReferralVisitSchema = createInsertSchema(referralVisits).omit({ id: true, visitedAt: true });
export type ReferralVisit = typeof referralVisits.$inferSelect;
export type InsertReferralVisit = z.infer<typeof insertReferralVisitSchema>;

// DM Automation Keywords — ManyChat-style keyword triggers for ambassadors
export const dmKeywords = pgTable("dm_keywords", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  keyword: text("keyword").notNull(),
  responseTemplate: text("response_template").notNull(),
  platform: text("platform").default("all"), // 'instagram'|'twitter'|'facebook'|'tiktok'|'all'
  isActive: boolean("is_active").default(true),
  triggerCount: integer("trigger_count").default(0),
  lastTriggeredAt: timestamp("last_triggered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDmKeywordSchema = createInsertSchema(dmKeywords).omit({ id: true, createdAt: true, updatedAt: true });
export type DmKeyword = typeof dmKeywords.$inferSelect;
export type InsertDmKeyword = z.infer<typeof insertDmKeywordSchema>;

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
  userId: integer("user_id").references(() => users.id).notNull(),
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
  lotMultiplier: doublePrecision("lot_multiplier").notNull().default(1.0), // Per-account lot size multiplier (0.1–5.0)
  gateMode: text("gate_mode").notNull().default('basic'), // 'basic' = original EA permissive mode (70%) | 'full' = strict gates (74%+brain+HTF)
  brokerName: text("broker_name"), // Human-readable broker name derived from serverId (e.g. "Atlas", "FTUK")
  useRiskPercent: boolean("use_risk_percent").notNull().default(false), // Size by % of this account's equity instead of copying source lot
  riskPercent: doublePrecision("risk_percent").notNull().default(1.0), // % of equity to risk per trade when useRiskPercent=true
  isPropFirmAccount: boolean("is_prop_firm_account").notNull().default(false), // Mark this TL account as a prop-firm/funded account
  propFirmName: text("prop_firm_name"), // e.g. "Topstep", "FTMO", "FundedNext", "The Funded Trader"
  propFirmAccountSize: doublePrecision("prop_firm_account_size"), // Funded account size in $ (for drawdown/target math)
  weeklyProfitTarget: doublePrecision("weekly_profit_target"), // Per-account profit goal ($), null = not set — distinct from the global weeklyStrategies target which is shared across every account
  // Per-account FTMO-style consistency cap: no single day's realized profit may
  // exceed this % of the account's total realized profit. null = use the
  // platform default (20%) when isPropFirmAccount is true. Set per account
  // (not globally) because different prop firms enforce different %s.
  consistencyThresholdPct: doublePrecision("consistency_threshold_pct"),
  // Per-account toggle — some prop firms don't enforce a consistency rule at
  // all, so this must be opt-out per account, not forced on every funded
  // account. Defaults on since most firms DO enforce it.
  consistencyEnabled: boolean("consistency_enabled").notNull().default(true),
  // Last-known balance snapshot — persisted so the UI shows the real figure
  // immediately after a deploy/restart (and while a re-auth is in flight)
  // instead of $0 or an error. Refreshed by the background sync.
  lastBalance: doublePrecision("last_balance"),
  lastEquity: doublePrecision("last_equity"),
  lastBalanceAt: timestamp("last_balance_at"),
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

// ── Options AI Engine — broker connections ──────────────────────────────────
// Alpaca: authenticates via API Key ID + Secret Key (no username/password, no OAuth)
export const alpacaConnections = pgTable("alpaca_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  apiKeyId: text("api_key_id").notNull(),
  encryptedApiSecret: text("encrypted_api_secret").notNull(),
  accountType: text("account_type").notNull().default('paper'), // 'paper' or 'live'
  isActive: boolean("is_active").notNull().default(true),
  autoExecute: boolean("auto_execute").notNull().default(false),
  accountId: text("account_id"), // Alpaca account number, resolved after first successful auth
  lastConnectedAt: timestamp("last_connected_at"),
  lastError: text("last_error"),
  tradeCount: integer("trade_count").notNull().default(0),
  useRiskPercent: boolean("use_risk_percent").notNull().default(true),
  riskPercent: doublePrecision("risk_percent").notNull().default(1.0),
  isPropFirmAccount: boolean("is_prop_firm_account").notNull().default(false),
  propFirmName: text("prop_firm_name"),
  propFirmAccountSize: doublePrecision("prop_firm_account_size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAlpacaConnectionSchema = createInsertSchema(alpacaConnections).omit({
  id: true,
  lastConnectedAt: true,
  lastError: true,
  tradeCount: true,
  createdAt: true,
  updatedAt: true,
});

export type AlpacaConnection = typeof alpacaConnections.$inferSelect;
export type InsertAlpacaConnection = z.infer<typeof insertAlpacaConnectionSchema>;

// TastyTrade: session-based auth via username/password (sandbox 'cert' env or live)
export const tastytradeConnections = pgTable("tastytrade_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  username: text("username").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  accountType: text("account_type").notNull().default('sandbox'), // 'sandbox' or 'live'
  isActive: boolean("is_active").notNull().default(true),
  autoExecute: boolean("auto_execute").notNull().default(false),
  accountNumber: text("account_number"), // resolved after first successful auth
  sessionToken: text("session_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  lastConnectedAt: timestamp("last_connected_at"),
  lastError: text("last_error"),
  tradeCount: integer("trade_count").notNull().default(0),
  useRiskPercent: boolean("use_risk_percent").notNull().default(true),
  riskPercent: doublePrecision("risk_percent").notNull().default(1.0),
  isPropFirmAccount: boolean("is_prop_firm_account").notNull().default(false),
  propFirmName: text("prop_firm_name"),
  propFirmAccountSize: doublePrecision("prop_firm_account_size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTastytradeConnectionSchema = createInsertSchema(tastytradeConnections).omit({
  id: true,
  sessionToken: true,
  tokenExpiresAt: true,
  lastConnectedAt: true,
  lastError: true,
  tradeCount: true,
  createdAt: true,
  updatedAt: true,
});

export type TastytradeConnection = typeof tastytradeConnections.$inferSelect;
export type InsertTastytradeConnection = z.infer<typeof insertTastytradeConnectionSchema>;

// Crypto.com Exchange — separate crypto-derivatives bucket, NOT part of the
// equity Options Engine (crypto.com has perpetuals/futures, options only in
// some regions — deliberately kept distinct from Alpaca/TastyTrade equity options).
// Auth via API Key + Secret Key (HMAC-signed requests, no OAuth/login page).
export const cryptocomConnections = pgTable("cryptocom_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  apiKey: text("api_key").notNull(),
  encryptedApiSecret: text("encrypted_api_secret").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  autoExecute: boolean("auto_execute").notNull().default(false),
  instrumentType: text("instrument_type").notNull().default('perpetual'), // 'perpetual' | 'future' | 'option'
  useRiskPercent: boolean("use_risk_percent").notNull().default(true),
  riskPercent: doublePrecision("risk_percent").notNull().default(1.0),
  lastConnectedAt: timestamp("last_connected_at"),
  lastError: text("last_error"),
  tradeCount: integer("trade_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCryptocomConnectionSchema = createInsertSchema(cryptocomConnections).omit({
  id: true,
  lastConnectedAt: true,
  lastError: true,
  tradeCount: true,
  createdAt: true,
  updatedAt: true,
});

export type CryptocomConnection = typeof cryptocomConnections.$inferSelect;
export type InsertCryptocomConnection = z.infer<typeof insertCryptocomConnectionSchema>;

// ─── Crypto.com Perpetuals AI Engine — full FX SS AI Engine parity ──────────
// Previously "Auto-execute" on cryptocomConnections was a dead toggle — no
// scanner/strategy engine read it back. This is the persisted config for a
// genuine autonomous engine, mirroring futuresEngineConfigs (perpetuals are
// structurally closest to futures: contracts/quantity, long/short, leverage).
export const cryptocomEngineConfigs = pgTable("cryptocom_engine_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  isActive: boolean("is_active").notNull().default(false),
  symbols: jsonb("symbols").notNull().default(['BTCUSD-PERP', 'ETHUSD-PERP', 'SOLUSD-PERP']),
  scanIntervalMs: integer("scan_interval_ms").notNull().default(120000),
  strategyMode: text("strategy_mode").notNull().default('auto'), // 'auto' | 'trend_following' | 'momentum' | 'order_flow'
  directionFilter: text("direction_filter").notNull().default('both'), // 'long_only' | 'short_only' | 'both'
  maxOpenTrades: integer("max_open_trades").notNull().default(3),
  riskPerTrade: doublePrecision("risk_per_trade").notNull().default(1.0),
  minConfidence: doublePrecision("min_confidence").notNull().default(70),
  accountBalance: doublePrecision("account_balance").notNull().default(1000),
  leverage: doublePrecision("leverage").notNull().default(3),
  dailyLossLimit: doublePrecision("daily_loss_limit").notNull().default(5.0),
  dailyProfitTarget: doublePrecision("daily_profit_target").notNull().default(0),
  maxDailyTrades: integer("max_daily_trades").notNull().default(0),
  lockSettings: boolean("lock_settings").notNull().default(false),
  aiMode: text("ai_mode").notNull().default('full'), // 'full' | 'economy' | 'rule_based'
  enableAutoExecution: boolean("enable_auto_execution").notNull().default(false),

  // ── FX SS AI Engine parity ──────────────────────────────────────────────
  useKellyCriterion: boolean("use_kelly_criterion").notNull().default(false),
  brainLearningMode: boolean("brain_learning_mode").notNull().default(true),
  drawdownShieldThreshold: doublePrecision("drawdown_shield_threshold").notNull().default(3.0),
  trailMethod: text("trail_method").notNull().default('none'), // same R-multiple methods as futuresEngineConfigs
  trailActivationR: doublePrecision("trail_activation_r").notNull().default(1.0),
  trailFixedR: doublePrecision("trail_fixed_r").notNull().default(0.5),
  trailStepR: doublePrecision("trail_step_r").notNull().default(0.5),
  trailProfitLockPct: doublePrecision("trail_profit_lock_pct").notNull().default(60),
  trailSarInitialAF: doublePrecision("trail_sar_initial_af").notNull().default(0.02),
  trailSarMaxAF: doublePrecision("trail_sar_max_af").notNull().default(0.20),
  breakevenBufferR: doublePrecision("breakeven_buffer_r").notNull().default(0.1),
  consistencyEnforcementEnabled: boolean("consistency_enforcement_enabled").notNull().default(false),
  consistencyMinProfitableDays: integer("consistency_min_profitable_days").notNull().default(10),
  consistencyPeriodDays: integer("consistency_period_days").notNull().default(15),
  maxDailyProfitPctOfTotal: doublePrecision("max_daily_profit_pct_of_total").notNull().default(0),
  smartSymbolEscalation: boolean("smart_symbol_escalation").notNull().default(false),
  highConfidenceOverride: boolean("high_confidence_override").notNull().default(false),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCryptocomEngineConfigSchema = createInsertSchema(cryptocomEngineConfigs).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type CryptocomEngineConfig = typeof cryptocomEngineConfigs.$inferSelect;
export type InsertCryptocomEngineConfig = z.infer<typeof insertCryptocomEngineConfigSchema>;

export const cryptocomEngineActivity = pgTable("cryptocom_engine_activity", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  symbol: text("symbol").notNull(),
  decision: text("decision").notNull(), // 'watching' | 'signal' | 'skipped' | 'error'
  reasoning: text("reasoning").notNull(),
  score: doublePrecision("score"),
  price: doublePrecision("price"),
  dailyChangePercent: doublePrecision("daily_change_percent"),
  source: text("source").notNull().default('cryptocom'),
  strategy: text("strategy"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type CryptocomEngineActivity = typeof cryptocomEngineActivity.$inferSelect;
export type InsertCryptocomEngineActivity = typeof cryptocomEngineActivity.$inferInsert;

export const cryptocomEngineTrades = pgTable("cryptocom_engine_trades", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  connectionId: integer("connection_id").notNull(),
  symbol: text("symbol").notNull(),
  strategy: text("strategy").notNull(),
  direction: text("direction").notNull(), // 'long' | 'short'
  quantity: doublePrecision("quantity").notNull(),
  entryPrice: doublePrecision("entry_price").notNull(),
  stopLoss: doublePrecision("stop_loss"),
  takeProfit: doublePrecision("take_profit"),
  entryOrderId: text("entry_order_id"),
  entryReasoning: text("entry_reasoning"),
  status: text("status").notNull().default('open'), // 'open' | 'closed' | 'failed'
  exitPrice: doublePrecision("exit_price"),
  exitOrderId: text("exit_order_id"),
  exitReason: text("exit_reason"),
  realizedPnl: doublePrecision("realized_pnl"),
  closedAt: timestamp("closed_at"),
  peakRMultiple: doublePrecision("peak_r_multiple").notNull().default(0),
  trailArmed: boolean("trail_armed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCryptocomEngineTradeSchema = createInsertSchema(cryptocomEngineTrades).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type CryptocomEngineTrade = typeof cryptocomEngineTrades.$inferSelect;
export type InsertCryptocomEngineTrade = z.infer<typeof insertCryptocomEngineTradeSchema>;

// Per-user Options AI Engine settings — mirrors the Forex SS AI Engine's LiveEngineConfig shape
export const optionsEngineConfigs = pgTable("options_engine_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  isActive: boolean("is_active").notNull().default(false),
  symbols: jsonb("symbols").notNull().default(['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA']), // underlying tickers to scan
  scanIntervalMs: integer("scan_interval_ms").notNull().default(60000),
  strategyMode: text("strategy_mode").notNull().default('auto'), // 'auto' | 'orb' | 'volume_profile' | 'breakout' | 'momentum' | 'order_flow' | 'covered_call' | 'credit_spread' | 'long_call' | 'long_put'
  singleStrategyMode: boolean("single_strategy_mode").notNull().default(false), // when true, only strategyMode fires — no mixing
  directionFilter: text("direction_filter").notNull().default('both'), // 'calls_only' | 'puts_only' | 'both'
  maxOpenPositions: integer("max_open_positions").notNull().default(3),
  maxContractsPerTrade: integer("max_contracts_per_trade").notNull().default(1),
  riskPerTrade: doublePrecision("risk_per_trade").notNull().default(1.0), // % of account equity risked per trade
  minConfidence: doublePrecision("min_confidence").notNull().default(70), // min AI confidence score (0-100) to fire a signal
  weeklyProfitTarget: doublePrecision("weekly_profit_target").notNull().default(5.0),
  accountBalance: doublePrecision("account_balance").notNull().default(0),
  enableCompounding: boolean("enable_compounding").notNull().default(false),
  propFirmMode: boolean("prop_firm_mode").notNull().default(false),
  propFirmDailyDrawdownLimit: doublePrecision("prop_firm_daily_drawdown_limit").notNull().default(4.0),
  dailyLossLimit: doublePrecision("daily_loss_limit").notNull().default(5.0), // % of account, 0 = disabled
  dailyProfitTarget: doublePrecision("daily_profit_target").notNull().default(0), // % of account, 0 = disabled
  maxDailyTrades: integer("max_daily_trades").notNull().default(0), // 0 = unlimited
  executionSource: text("execution_source").notNull().default('auto'), // 'alpaca' | 'tastytrade' | 'auto'
  lockSettings: boolean("lock_settings").notNull().default(false),

  // ── Options-native settings (no FX/lots equivalent — these replace pip/lot ──
  // ── concepts with strike/expiry/premium concepts specific to options) ──────
  expiryPreference: text("expiry_preference").notNull().default('auto'), // '0dte' | 'weekly' | 'monthly' | 'auto'
  minDaysToExpiry: integer("min_days_to_expiry").notNull().default(1),
  maxDaysToExpiry: integer("max_days_to_expiry").notNull().default(45),
  strikeSelectionMode: text("strike_selection_mode").notNull().default('atm'), // 'atm' | 'itm' | 'otm' | 'delta_target'
  targetDelta: doublePrecision("target_delta").notNull().default(0.30), // used when strikeSelectionMode = 'delta_target'
  profitTargetPercent: doublePrecision("profit_target_percent").notNull().default(50), // close at +X% of premium paid
  stopLossPercent: doublePrecision("stop_loss_percent").notNull().default(50), // close at -X% of premium paid
  ivRankMax: doublePrecision("iv_rank_max").notNull().default(80), // skip entries when IV rank exceeds this (expensive premium)
  sessionFilterEnabled: boolean("session_filter_enabled").notNull().default(true), // avoid the volatile open/close minutes
  avoidLastMinutesBeforeClose: integer("avoid_last_minutes_before_close").notNull().default(15), // pin-risk / illiquidity guard near close
  maxSpreadPct: doublePrecision("max_spread_pct").notNull().default(8), // reject a contract if (ask-bid)/mid exceeds this % — wide spreads eat the edge on both entry and exit
  minOpenInterest: integer("min_open_interest").notNull().default(50), // reject illiquid contracts below this open interest

  // Strategy-specific parameters
  orbRangeMinutes: integer("orb_range_minutes").notNull().default(15), // opening range window length
  volumeProfileLookbackDays: integer("volume_profile_lookback_days").notNull().default(10),
  breakoutLookbackDays: integer("breakout_lookback_days").notNull().default(20),
  orderFlowLookbackBars: integer("order_flow_lookback_bars").notNull().default(30), // 5-min bars used for the CVD-proxy/market-structure read

  // Acceleration / adaptive behavior (mirrors SS Engine's acceleration features)
  adaptiveScanInterval: boolean("adaptive_scan_interval").notNull().default(false), // scan faster near market open/ORB window
  enablePyramiding: boolean("enable_pyramiding").notNull().default(false), // add contracts as a move confirms further

  // ── FX SS AI Engine parity — same features, adapted from pips/lots to ──────
  // ── premium-%/contracts since options don't have pip-based price moves ─────
  aiMode: text("ai_mode").notNull().default('full'), // 'full' | 'economy' | 'rule_based' — cost-control tier, mirrors FX
  useKellyCriterion: boolean("use_kelly_criterion").notNull().default(false), // size contracts by win-rate/R:R history instead of flat riskPerTrade
  brainLearningMode: boolean("brain_learning_mode").notNull().default(true), // lock at 1 contract until enough trade history to trust bigger size
  drawdownShieldThreshold: doublePrecision("drawdown_shield_threshold").notNull().default(3.0), // % DD from peak equity that auto-tightens to conservative-only entries
  copyMode: text("copy_mode").notNull().default('proportional'), // 'proportional' | 'multiplier' — sizing mode across multiple Alpaca/TastyTrade connections
  volatileCapMode: text("volatile_cap_mode").notNull().default('risk_scaled'), // 'risk_scaled' | 'user_only' — caps contract count on high-IV underlyings (TSLA/NVDA-style)

  // Trailing-stop system — mirrors the FX engine's 9 methods, but trails as a
  // % of premium/underlying move instead of pips (options don't have pips).
  trailMethod: text("trail_method").notNull().default('none'), // 'chandelier' | 'r_multiple' | 'swing_structure' | 'parabolic_sar' | 'fixed_pct' | 'profit_lock' | 'stepped_fixed' | 'none'
  trailActivationPct: doublePrecision("trail_activation_pct").notNull().default(20), // start trailing once position is +X% of premium
  trailFixedPct: doublePrecision("trail_fixed_pct").notNull().default(15), // trail distance as % of premium (fixed_pct/stepped_fixed)
  trailStepPct: doublePrecision("trail_step_pct").notNull().default(10), // step size % for stepped_fixed
  trailProfitLockPct: doublePrecision("trail_profit_lock_pct").notNull().default(60), // lock X% of peak profit (profit_lock method)
  trailSarInitialAF: doublePrecision("trail_sar_initial_af").notNull().default(0.02),
  trailSarMaxAF: doublePrecision("trail_sar_max_af").notNull().default(0.20),
  breakevenBufferPct: doublePrecision("breakeven_buffer_pct").notNull().default(10), // buffer above breakeven for r_multiple method

  // Prop-firm presets + consistency rule — same shape as FX's, adapted since
  // dedicated options-only prop firms are rare; presets here describe generic
  // equity/options account rules a user can still pick or customize.
  propFirmPreset: text("prop_firm_preset").notNull().default('CUSTOM'), // 'FTMO' | 'MFF' | 'THE5ERS' | 'FUNDED_NEXT' | 'CUSTOM'
  propFirmAllowOvernightHolds: boolean("prop_firm_allow_overnight_holds").notNull().default(true), // options are commonly held overnight/multi-day unlike FX scalps, defaults true
  consistencyEnforcementEnabled: boolean("consistency_enforcement_enabled").notNull().default(false),
  consistencyMinProfitableDays: integer("consistency_min_profitable_days").notNull().default(10),
  consistencyPeriodDays: integer("consistency_period_days").notNull().default(15),
  maxDailyProfitPctOfTotal: doublePrecision("max_daily_profit_pct_of_total").notNull().default(0), // 0 = disabled; caps any single day's profit at this % of total

  // Goal tracker
  weeklyProfitTargetIsPercent: boolean("weekly_profit_target_is_percent").notNull().default(true), // whether weeklyProfitTarget is a % of account or a flat $ amount

  // Scheduling / per-symbol overrides — mirrors FX's pair-day pinning and
  // per-pair direction/lot overrides
  tradingDaysOfWeek: jsonb("trading_days_of_week").notNull().default([1, 2, 3, 4, 5]), // 0=Sun..6=Sat
  symbolDaySchedule: jsonb("symbol_day_schedule").notNull().default({}), // { SPY: [1,2,3,4,5], ... } — pin a symbol to specific days
  symbolDirectionOverrides: jsonb("symbol_direction_overrides").notNull().default({}), // { TSLA: 'calls_only', ... }
  symbolContractOverrides: jsonb("symbol_contract_overrides").notNull().default({}), // { SPY: 5, ... } — per-symbol max contracts, like FX's per-pair lot override

  // AI intelligence extras
  smartSymbolEscalation: boolean("smart_symbol_escalation").notNull().default(false), // brain-ranked symbol unlocking, mirrors FX's Smart Pair Escalation
  highConfidenceOverride: boolean("high_confidence_override").notNull().default(false), // 85%+ dual-confirmation fires cross-symbol regardless of other gates

  // Composite/edge-score autonomous entries — mirrors FX's composite strategy toggle
  enableCompositeAutonomous: boolean("enable_composite_autonomous").notNull().default(false),
  compositeMinEdgeScore: doublePrecision("composite_min_edge_score").notNull().default(72),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOptionsEngineConfigSchema = createInsertSchema(optionsEngineConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type OptionsEngineConfig = typeof optionsEngineConfigs.$inferSelect;
export type InsertOptionsEngineConfig = z.infer<typeof insertOptionsEngineConfigSchema>;

// FX SS AI Engine (live-trading-engine.ts) config — that engine's LiveEngineConfig
// is otherwise held ONLY in an in-memory Record<userId, EngineState> and is lost
// on every server restart/deploy, including propFirmMode/consistency-rule
// settings meant to enforce real prop-firm compliance. This table is the
// durable mirror: written on every startLiveEngine()/updateLiveEngineConfig()
// call, and read back at boot to rehydrate defaults for each user before they
// next start the engine (never auto-resumes live trading on its own).
export const liveEngineConfigs = pgTable("live_engine_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type LiveEngineConfigRow = typeof liveEngineConfigs.$inferSelect;

// Options AI Engine — live scan/decision feed. Each row is one thing the
// engine looked at and what it concluded, so the user can see what it's
// picking up and why (or why not) it's acting.
export const optionsEngineActivity = pgTable("options_engine_activity", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  symbol: text("symbol").notNull(),
  decision: text("decision").notNull(), // 'watching' | 'signal' | 'skipped' | 'error'
  reasoning: text("reasoning").notNull(), // human-readable explanation
  score: doublePrecision("score"), // 0-100 confidence proxy, null if not computed
  price: doublePrecision("price"),
  dailyChangePercent: doublePrecision("daily_change_percent"),
  source: text("source").notNull().default('alpaca'), // which broker's data fed this read
  strategy: text("strategy"), // 'orb' | 'volume_profile' | 'breakout' | 'momentum' | null
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOptionsEngineActivitySchema = createInsertSchema(optionsEngineActivity).omit({
  id: true,
  createdAt: true,
});

export type OptionsEngineActivity = typeof optionsEngineActivity.$inferSelect;
export type InsertOptionsEngineActivity = z.infer<typeof insertOptionsEngineActivitySchema>;

// Options AI Engine — executed trades. Created the moment an order is placed;
// updated on close. This is the source of truth for daily-loss-limit and
// max-daily-trades enforcement (derived from real records, not a counter that
// resets on restart).
export const optionsEngineTrades = pgTable("options_engine_trades", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  connectionId: integer("connection_id").notNull(), // alpacaConnections.id (or tastytradeConnections.id)
  broker: text("broker").notNull().default('alpaca'), // 'alpaca' | 'tastytrade'
  underlyingSymbol: text("underlying_symbol").notNull(),
  optionSymbol: text("option_symbol").notNull(), // OCC symbol actually traded
  strategy: text("strategy").notNull(),
  optionType: text("option_type").notNull(), // 'call' | 'put'
  quantity: integer("quantity").notNull(),
  entryPrice: doublePrecision("entry_price").notNull(), // premium per contract at entry
  entryOrderId: text("entry_order_id"),
  entryReasoning: text("entry_reasoning"),
  status: text("status").notNull().default('open'), // 'open' | 'closed' | 'failed'
  exitPrice: doublePrecision("exit_price"),
  exitOrderId: text("exit_order_id"),
  exitReason: text("exit_reason"), // 'profit_target' | 'stop_loss' | 'manual' | 'expired' | 'error'
  realizedPnl: doublePrecision("realized_pnl"),
  closedAt: timestamp("closed_at"),
  // Trailing-stop state — persisted per-trade so the high-water-mark survives
  // server restarts (mirrors the FX engine's per-position trail tracking).
  peakPnlPercent: doublePrecision("peak_pnl_percent").notNull().default(0),
  trailArmed: boolean("trail_armed").notNull().default(false),
  // Trade-detail columns — without these the Options Brain can never calibrate
  // confidence or break down losses by DTE/IV/spread; previously nothing here
  // was recorded, so post-hoc "what do the losers have in common" analysis was
  // structurally impossible no matter how much trade history accumulated.
  entryConfidence: doublePrecision("entry_confidence"), // the strategy's own 0-100 score at entry
  dte: integer("dte"), // days-to-expiry of the contract actually traded
  ivAtEntry: doublePrecision("iv_at_entry"), // raw implied volatility (0-1) at entry
  underlyingPriceAtEntry: doublePrecision("underlying_price_at_entry"),
  bidAskSpreadPct: doublePrecision("bid_ask_spread_pct"), // (ask-bid)/mid at entry, as a %
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOptionsEngineTradeSchema = createInsertSchema(optionsEngineTrades).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type OptionsEngineTrade = typeof optionsEngineTrades.$inferSelect;
export type InsertOptionsEngineTrade = z.infer<typeof insertOptionsEngineTradeSchema>;

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

// ─── Tradovate Connections (Futures Prop Firm Trading) ───────────────────────
export const tradovateConnections = pgTable("tradovate_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  username: text("username").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  accountId: text("account_id"),
  accountType: text("account_type").notNull().default('demo'), // 'demo' | 'live'
  isActive: boolean("is_active").notNull().default(true),
  propFirmPreset: text("prop_firm_preset"), // 'TOPSTEP' | 'APEX' | 'BULENOX' | 'EARN2TRADE' | 'CUSTOM'
  propFirmAccountSize: real("prop_firm_account_size"),
  accessToken: text("access_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  peakEquity: real("peak_equity"),         // trailing drawdown high-water mark
  startingBalance: real("starting_balance"),
  lastConnectedAt: timestamp("last_connected_at"),
  lastError: text("last_error"),
  tradeCount: integer("trade_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTradovateConnectionSchema = createInsertSchema(tradovateConnections).omit({
  id: true, accessToken: true, tokenExpiresAt: true, peakEquity: true,
  lastConnectedAt: true, lastError: true, tradeCount: true, createdAt: true, updatedAt: true,
});

export type TradovateConnection = typeof tradovateConnections.$inferSelect;
export type InsertTradovateConnection = z.infer<typeof insertTradovateConnectionSchema>;

// ─── Tradovate Trade Logs ────────────────────────────────────────────────────
export const tradovateTradeLogs = pgTable("tradovate_trade_logs", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").references(() => tradovateConnections.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(),           // 'OPEN' | 'CLOSE' | 'MODIFY'
  symbol: text("symbol").notNull(),           // 'NQ', 'ES', 'GC', etc.
  direction: text("direction").notNull(),     // 'BUY' | 'SELL'
  contracts: integer("contracts").notNull(),
  entryPrice: real("entry_price"),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  tradovateOrderId: text("tradovate_order_id"),
  status: text("status").notNull(),           // 'pending' | 'executed' | 'failed' | 'rejected'
  errorMessage: text("error_message"),
  tickValue: real("tick_value"),
  realizedPnl: real("realized_pnl"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTradovateTradeLogSchema = createInsertSchema(tradovateTradeLogs).omit({
  id: true, createdAt: true,
});

export type TradovateTradeLog = typeof tradovateTradeLogs.$inferSelect;
export type InsertTradovateTradeLog = z.infer<typeof insertTradovateTradeLogSchema>;

// ─── Futures AI Engine — persisted config (FX SS AI Engine parity) ──────────
// Previously the scanner's config (server/services/futures-scanner.ts) lived
// ONLY in an ad-hoc object the client POSTed on every "Start Scanner" click —
// no persistence, no per-user history, and every FX-parity feature (trailing
// stops, Kelly, Brain Learning Mode, Drawdown Shield, consistency rule,
// scheduling) was simply absent. This table is the durable mirror, following
// the exact same pattern as optionsEngineConfigs.
export const futuresEngineConfigs = pgTable("futures_engine_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  isActive: boolean("is_active").notNull().default(false),
  symbols: jsonb("symbols").notNull().default(['NQ', 'ES', 'GC', 'CL']),
  scanIntervalMs: integer("scan_interval_ms").notNull().default(120000),
  strategyMode: text("strategy_mode").notNull().default('auto'), // 'auto' | 'trend_following' | 'smc' | 'volume_profile' | 'order_flow' | 'markov'
  singleStrategyMode: boolean("single_strategy_mode").notNull().default(false),
  directionFilter: text("direction_filter").notNull().default('both'), // 'long_only' | 'short_only' | 'both'
  maxOpenTrades: integer("max_open_trades").notNull().default(3),
  maxContractsPerTrade: integer("max_contracts_per_trade").notNull().default(1),
  riskPerTrade: doublePrecision("risk_per_trade").notNull().default(1.0), // % of account equity risked per trade
  minConfidence: doublePrecision("min_confidence").notNull().default(70),
  weeklyProfitTarget: doublePrecision("weekly_profit_target").notNull().default(5.0),
  accountBalance: doublePrecision("account_balance").notNull().default(50000),
  enableCompounding: boolean("enable_compounding").notNull().default(false),
  propFirmMode: boolean("prop_firm_mode").notNull().default(false),
  propFirmDailyDrawdownLimit: doublePrecision("prop_firm_daily_drawdown_limit").notNull().default(2.0),
  dailyLossLimit: doublePrecision("daily_loss_limit").notNull().default(3.0), // % of account, 0 = disabled
  dailyProfitTarget: doublePrecision("daily_profit_target").notNull().default(0), // % of account, 0 = disabled
  maxDailyTrades: integer("max_daily_trades").notNull().default(0), // 0 = unlimited
  executionSource: text("execution_source").notNull().default('auto'), // 'tradovate' | 'moomoo' | 'auto'
  lockSettings: boolean("lock_settings").notNull().default(false),
  aiMode: text("ai_mode").notNull().default('full'), // 'full' | 'economy' | 'rule_based'
  enableAutoExecution: boolean("enable_auto_execution").notNull().default(false),

  // ── FX SS AI Engine parity — same features, adapted from pips/lots to ──────
  // ── R-multiples/contracts since futures trade in ticks/points, not pips ─────
  useKellyCriterion: boolean("use_kelly_criterion").notNull().default(false),
  brainLearningMode: boolean("brain_learning_mode").notNull().default(true),
  drawdownShieldThreshold: doublePrecision("drawdown_shield_threshold").notNull().default(3.0),
  copyMode: text("copy_mode").notNull().default('proportional'), // 'proportional' | 'multiplier'
  volatileCapMode: text("volatile_cap_mode").notNull().default('risk_scaled'), // 'risk_scaled' | 'user_only' — caps contracts on high-tick-value symbols (NQ/GC-style)

  // Trailing-stop system — mirrors the FX engine's methods, but trails on
  // R-multiple (unrealized profit ÷ initial risk distance) instead of pips,
  // since that's the native way futures/day-trading risk is already measured
  // elsewhere in this file (symbolPerformance.totalR).
  trailMethod: text("trail_method").notNull().default('none'), // 'chandelier' | 'r_multiple' | 'swing_structure' | 'parabolic_sar' | 'fixed_r' | 'profit_lock' | 'stepped_fixed' | 'none'
  trailActivationR: doublePrecision("trail_activation_r").notNull().default(1.0), // start trailing once position is +X R
  trailFixedR: doublePrecision("trail_fixed_r").notNull().default(0.5), // trail distance in R (fixed_r/stepped_fixed)
  trailStepR: doublePrecision("trail_step_r").notNull().default(0.5),
  trailProfitLockPct: doublePrecision("trail_profit_lock_pct").notNull().default(60), // lock X% of peak R (profit_lock method)
  trailSarInitialAF: doublePrecision("trail_sar_initial_af").notNull().default(0.02),
  trailSarMaxAF: doublePrecision("trail_sar_max_af").notNull().default(0.20),
  breakevenBufferR: doublePrecision("breakeven_buffer_r").notNull().default(0.1),

  // Prop-firm presets + consistency rule
  propFirmPreset: text("prop_firm_preset").notNull().default('CUSTOM'), // 'TOPSTEP' | 'APEX' | 'BULENOX' | 'EARN2TRADE' | 'CUSTOM'
  propFirmAllowOvernightHolds: boolean("prop_firm_allow_overnight_holds").notNull().default(false), // most futures prop firms disallow/penalize overnight holds
  consistencyEnforcementEnabled: boolean("consistency_enforcement_enabled").notNull().default(false),
  consistencyMinProfitableDays: integer("consistency_min_profitable_days").notNull().default(10),
  consistencyPeriodDays: integer("consistency_period_days").notNull().default(15),
  maxDailyProfitPctOfTotal: doublePrecision("max_daily_profit_pct_of_total").notNull().default(0),

  // Goal tracker
  weeklyProfitTargetIsPercent: boolean("weekly_profit_target_is_percent").notNull().default(true),

  // Scheduling / per-symbol overrides
  tradingDaysOfWeek: jsonb("trading_days_of_week").notNull().default([1, 2, 3, 4, 5]),
  symbolDaySchedule: jsonb("symbol_day_schedule").notNull().default({}),
  symbolDirectionOverrides: jsonb("symbol_direction_overrides").notNull().default({}),
  symbolContractOverrides: jsonb("symbol_contract_overrides").notNull().default({}),

  // AI intelligence extras
  smartSymbolEscalation: boolean("smart_symbol_escalation").notNull().default(false),
  highConfidenceOverride: boolean("high_confidence_override").notNull().default(false),

  // Composite/edge-score autonomous entries
  enableCompositeAutonomous: boolean("enable_composite_autonomous").notNull().default(false),
  compositeMinEdgeScore: doublePrecision("composite_min_edge_score").notNull().default(72),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFuturesEngineConfigSchema = createInsertSchema(futuresEngineConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type FuturesEngineConfig = typeof futuresEngineConfigs.$inferSelect;
export type InsertFuturesEngineConfig = z.infer<typeof insertFuturesEngineConfigSchema>;

// Futures AI Engine — live scan/decision feed, same shape as optionsEngineActivity.
export const futuresEngineActivity = pgTable("futures_engine_activity", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  symbol: text("symbol").notNull(),
  decision: text("decision").notNull(), // 'watching' | 'signal' | 'skipped' | 'error'
  reasoning: text("reasoning").notNull(),
  score: doublePrecision("score"),
  price: doublePrecision("price"),
  dailyChangePercent: doublePrecision("daily_change_percent"),
  source: text("source").notNull().default('tradovate'),
  strategy: text("strategy"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFuturesEngineActivitySchema = createInsertSchema(futuresEngineActivity).omit({
  id: true,
  createdAt: true,
});

export type FuturesEngineActivity = typeof futuresEngineActivity.$inferSelect;
export type InsertFuturesEngineActivity = z.infer<typeof insertFuturesEngineActivitySchema>;

// Futures AI Engine — executed trades. Fills the gap where auto-executed
// scanner trades were never logged anywhere (only manual /api/tradovate/execute
// calls wrote to tradovateTradeLogs) — same shape/purpose as optionsEngineTrades.
export const futuresEngineTrades = pgTable("futures_engine_trades", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  connectionId: integer("connection_id").notNull(), // tradovateConnections.id (or moomoo connection id)
  broker: text("broker").notNull().default('tradovate'), // 'tradovate' | 'moomoo'
  symbol: text("symbol").notNull(),
  strategy: text("strategy").notNull(),
  direction: text("direction").notNull(), // 'long' | 'short'
  contracts: integer("contracts").notNull(),
  entryPrice: doublePrecision("entry_price").notNull(),
  stopLoss: doublePrecision("stop_loss"),
  takeProfit: doublePrecision("take_profit"),
  entryOrderId: text("entry_order_id"),
  entryReasoning: text("entry_reasoning"),
  status: text("status").notNull().default('open'), // 'open' | 'closed' | 'failed'
  exitPrice: doublePrecision("exit_price"),
  exitOrderId: text("exit_order_id"),
  exitReason: text("exit_reason"), // 'profit_target' | 'stop_loss' | 'trailing_stop' | 'manual' | 'session_close' | 'error'
  realizedPnl: doublePrecision("realized_pnl"),
  closedAt: timestamp("closed_at"),
  // Trailing-stop state — R-multiple high-water-mark, persisted per-trade.
  peakRMultiple: doublePrecision("peak_r_multiple").notNull().default(0),
  trailArmed: boolean("trail_armed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFuturesEngineTradeSchema = createInsertSchema(futuresEngineTrades).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type FuturesEngineTrade = typeof futuresEngineTrades.$inferSelect;
export type InsertFuturesEngineTrade = z.infer<typeof insertFuturesEngineTradeSchema>;

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
  connectionId: integer("connection_id"), // TradeLocker connection this trade belongs to (ties trades → specific account)
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

// Wallet Blacklist - Block known bad actors from receiving VEDD rewards
export const veddWalletBlacklist = pgTable("vedd_wallet_blacklist", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  reason: text("reason").notNull(), // 'scam'|'whale_abuse'|'multi_account'|'suspicious'|'spam'
  addedBy: integer("added_by").references(() => users.id),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVeddWalletBlacklistSchema = createInsertSchema(veddWalletBlacklist).omit({ id: true, createdAt: true });
export type VeddWalletBlacklist = typeof veddWalletBlacklist.$inferSelect;
export type InsertVeddWalletBlacklist = z.infer<typeof insertVeddWalletBlacklistSchema>;

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
  securityFlag: text("security_flag"), // null = clean, 'velocity'|'duplicate'|'suspicious'
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
// Ledger of gamified internal-wallet earnings, used to enforce the daily/weekly
// earning caps (there is no other per-earning record — internal_wallets only
// holds a running balance). One row per capped credit.
export const internalWalletEarnings = pgTable("internal_wallet_earnings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  amount: real("amount").notNull(),   // actual amount credited (post-cap)
  source: text("source").notNull(),   // 'nfc_tap' | 'nfc_activation' | 'checkin' | 'wear_to_earn'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  isValid: boolean("is_valid"),
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

export const solEngineSettings = pgTable("sol_engine_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  activeStrategy: text("active_strategy").notNull().default('momentum_surfer'),
  activeStrategies: jsonb("active_strategies").$type<string[]>().default([]),
  autoTradeEnabled: boolean("auto_trade_enabled").notNull().default(false),
  liveTradeEnabled: boolean("live_trade_enabled").notNull().default(false),
  autoTradeTP: real("auto_trade_tp").notNull().default(8),
  autoTradeSL: real("auto_trade_sl").notNull().default(4),
  autoTrailActivationPct: real("auto_trail_activation_pct").notNull().default(4),
  autoTrailDistancePct: real("auto_trail_distance_pct").notNull().default(3),
  weeklyGoal: jsonb("weekly_goal").notNull().default({}),
  autoTradeStats: jsonb("auto_trade_stats").notNull().default({}),
  serverWalletKey: text("server_wallet_key"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SolEngineSettings = typeof solEngineSettings.$inferSelect;

export const solEnginePositions = pgTable("sol_engine_positions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  positionId: text("position_id").notNull().unique(),
  mode: text("mode").notNull(),
  symbol: text("symbol").notNull(),
  mint: text("mint").notNull(),
  entryPrice: real("entry_price").notNull(),
  currentPrice: real("current_price").notNull().default(0),
  targetPct: real("target_pct").notNull(),
  slPct: real("sl_pct").notNull(),
  size: real("size").notNull(),
  tokenAmount: real("token_amount").notNull().default(0),
  decimals: integer("decimals").notNull().default(9),
  strategyId: text("strategy_id").notNull(),
  txHash: text("tx_hash"),
  status: text("status").notNull().default('open'),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
  closePnlPct: real("close_pnl_pct"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SolEnginePosition = typeof solEnginePositions.$inferSelect;

// Wear to Earn Claims — VEDD Clothing QR code verification
export const wearToEarnClaims = pgTable("wear_to_earn_claims", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  claimCode: text("claim_code").notNull(),
  productName: text("product_name").notNull(),
  rewardAmount: real("reward_amount").notNull().default(50),
  status: text("status").notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  imageUrl: text("image_url"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  processedBy: integer("processed_by"),
});

export const insertWearToEarnClaimSchema = createInsertSchema(wearToEarnClaims).omit({
  id: true,
  submittedAt: true,
  processedAt: true,
  processedBy: true,
});

export type WearToEarnClaim = typeof wearToEarnClaims.$inferSelect;
export type InsertWearToEarnClaim = z.infer<typeof insertWearToEarnClaimSchema>;

// ─── NFC Garment System — Wear Daily, Earn Daily ─────────────────────────────
// Each physical garment has an NFC chip with a unique UID.
// First tap activates the chip (links it to the user's account) and pays a
// one-time 50 VEDD activation bonus. Every subsequent tap on a new calendar
// day pays 15 VEDD directly to veddBalance (no admin approval needed — the
// chip hardware UID is the proof of ownership).

export const nfcActivations = pgTable("nfc_activations", {
  id: serial("id").primaryKey(),
  chipUid: text("chip_uid").notNull().unique(),    // NFC chip UID or VEDD-XXXXXX code
  userId: integer("user_id").notNull().references(() => users.id),
  garmentName: text("garment_name").notNull(),     // e.g. "VEDD Classic Tee"
  activatedAt: timestamp("activated_at").defaultNow().notNull(),
  totalTaps: integer("total_taps").notNull().default(0),
  totalEarned: real("total_earned").notNull().default(0),
  lastTapAt: timestamp("last_tap_at"),
  currentStreak: integer("current_streak").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
});

export const nfcDailyTaps = pgTable("nfc_daily_taps", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  chipUid: text("chip_uid").notNull(),
  rewardAmount: real("reward_amount").notNull().default(15),
  tappedAt: timestamp("tapped_at").defaultNow().notNull(),
  dayString: text("day_string").notNull(),         // 'YYYY-MM-DD' — dedup key
});

export type NfcActivation = typeof nfcActivations.$inferSelect;
export type NfcDailyTap = typeof nfcDailyTaps.$inferSelect;

// ─── Paper Trades — AI Training Journal ──────────────────────────────────────
export const paperTrades = pgTable("paper_trades", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  direction: text("direction").notNull(), // 'BUY' | 'SELL'
  entryPrice: real("entry_price").notNull(),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  aiConfidence: real("ai_confidence").notNull(),
  aiModel: text("ai_model"),
  aiProvider: text("ai_provider"),
  aiReasoning: text("ai_reasoning"),
  confluenceScore: real("confluence_score"),
  confluenceGrade: text("confluence_grade"),
  githubStrategyUsed: boolean("github_strategy_used").default(false),
  outcome: text("outcome").default('pending'), // 'pending' | 'win' | 'loss' | 'breakeven'
  priceAt1h: real("price_at_1h"),
  priceAt4h: real("price_at_4h"),
  priceAt24h: real("price_at_24h"),
  pnlPips: real("pnl_pips"),
  pnlPercent: real("pnl_percent"),
  resolvedAt: timestamp("resolved_at"),
  notes: text("notes"),
  analysisId: integer("analysis_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaperTradeSchema = createInsertSchema(paperTrades).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  priceAt1h: true,
  priceAt4h: true,
  priceAt24h: true,
  outcome: true,
  pnlPips: true,
  pnlPercent: true,
});

export type PaperTrade = typeof paperTrades.$inferSelect;
export type InsertPaperTrade = z.infer<typeof insertPaperTradeSchema>;

// ── AI Confirmation Outcomes (learning loop) ──────────────────────────────────
export const aiConfirmationOutcomes = pgTable("ai_confirmation_outcomes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe"),
  direction: text("direction").notNull(), // 'BUY' | 'SELL'
  confluenceGrade: text("confluence_grade"), // 'A+' | 'A' | 'B' | 'C' | 'D'
  confluenceScore: real("confluence_score"),
  session: text("session"), // 'London' | 'NY' | 'Asian' | etc.
  ictMacroValid: boolean("ict_macro_valid"),
  smcVerdict: text("smc_verdict"), // 'CONFIRM' | 'PASS' | 'REQUIRE_BETTER_PRICE'
  adxValue: real("adx_value"),
  rsiValue: real("rsi_value"),
  macdDirection: text("macd_direction"),
  htfAligned: boolean("htf_aligned"),
  newsConflict: boolean("news_conflict"),
  aiDecision: text("ai_decision"), // 'CONFIRMED' | 'REJECTED' | 'EA_ONLY' | 'MANUAL' | 'AI_OVERRIDE' | 'ADJUSTED'
  aiConfidence: real("ai_confidence"),
  proposedConfidence: real("proposed_confidence"),
  tradeOutcome: text("trade_outcome").default('PENDING'), // 'PENDING' | 'WIN' | 'LOSS' | 'BREAKEVEN'
  actualPips: real("actual_pips"),
  confirmedAt: timestamp("confirmed_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  tradeSource: text('trade_source').default('ai_confirmation'),
  modelUsed: text('model_used'),   // e.g. 'gpt-4o', 'claude-3-5-sonnet', 'llama-4-scout'
  providerUsed: text('provider_used'), // e.g. 'openai', 'anthropic', 'groq'
  // Deep Reasoning Mode trail — populated only when the Bull/Bear/Veteran-Judge
  // debate pipeline ran instead of the single fast-path confirmation call.
  reasoningText: text('reasoning_text'),
  bullCase: text('bull_case'),
  bearCase: text('bear_case'),
  deepReasoningUsed: boolean('deep_reasoning_used').default(false),
});

export const insertAiConfirmationOutcomeSchema = createInsertSchema(aiConfirmationOutcomes).omit({
  id: true,
  confirmedAt: true,
  closedAt: true,
  tradeOutcome: true,
  actualPips: true,
});

export type AiConfirmationOutcome = typeof aiConfirmationOutcomes.$inferSelect;
export type InsertAiConfirmationOutcome = z.infer<typeof insertAiConfirmationOutcomeSchema> & {
  tradeSource?: string;
  modelUsed?: string;
  providerUsed?: string;
};

// AI Second Opinion / Strategy Action Feed — durable log of every confirmation
// decision (APPROVED/REJECTED/ADJUSTED/AI_OVERRIDE/ERROR). Previously this was
// only kept in an in-memory Map (server/openai.ts) with no persistence, so it
// went blank on every server restart even though the underlying confirmations
// kept happening. `entry` stores the full AiConfirmationLogEntry as JSON —
// same durable-storage philosophy as the options/futures engine activity logs.
export const aiConfirmationLogs = pgTable("ai_confirmation_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  entry: jsonb("entry").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AiConfirmationLogRow = typeof aiConfirmationLogs.$inferSelect;

// Persisted prop-firm challenge phase tracking — the in-memory PropFirmContext
// (server/openai.ts) is lost on every restart, so a multi-day/multi-week
// challenge had no durable record of which phase an account is in. This lets
// Gate 0 and the reasoning pipeline get more conservative automatically as an
// account nears its drawdown limit or profit target, the way an experienced
// prop-firm trader manages a challenge.
//
// Extended for the Options Engine's per-connection prop-firm support: this
// table was previously defined but never read or written anywhere (dead
// scaffolding), so 'phase1'/'phase2' was simplified to a plain 'challenge' |
// 'funded' switch, and two full, independently-editable rule sets were added
// (challenge* / funded*) so a user can pre-configure both phases' risk limits
// once and have the engine automatically switch which set is active when
// they flip phase after a challenge is passed — rather than re-entering
// limits by hand. One row per (connection, connectionType); connectionType
// now also covers 'alpaca' | 'tastytrade' in addition to the original FX
// broker types.
export const propFirmAccountState = pgTable("prop_firm_account_state", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  connectionId: integer("connection_id").notNull(), // references the MT5/TradeLocker/Tradovate/Alpaca/TastyTrade connection this state is for
  connectionType: text("connection_type").notNull().default('tradelocker'), // 'mt5' | 'tradelocker' | 'tradovate' | 'alpaca' | 'tastytrade'
  phase: text("phase").notNull().default('challenge'), // 'challenge' | 'funded'
  phaseStartBalance: real("phase_start_balance").notNull(),
  profitTarget: real("profit_target"), // $ target to graduate this phase (null = no target, e.g. funded)

  // ── Challenge-phase risk limits (active while phase = 'challenge') ────────
  challengeDailyDrawdownPct: real("challenge_daily_drawdown_pct").notNull().default(5),
  challengeConsistencyEnabled: boolean("challenge_consistency_enabled").notNull().default(true),
  challengeConsistencyThresholdPct: real("challenge_consistency_threshold_pct").notNull().default(30),

  // ── Funded-phase risk limits (active while phase = 'funded') — deliberately
  // independent fields, not a shared "current" set, so a user can dial in
  // funded-account rules ahead of time (real capital/payouts at stake, often
  // looser drawdown, consistency rule usually dropped) without losing their
  // challenge-phase configuration when they graduate.
  fundedDailyDrawdownPct: real("funded_daily_drawdown_pct").notNull().default(3),
  fundedConsistencyEnabled: boolean("funded_consistency_enabled").notNull().default(false),
  fundedConsistencyThresholdPct: real("funded_consistency_threshold_pct").notNull().default(30),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  unq: unique().on(t.connectionId, t.connectionType),
}));

export type PropFirmAccountState = typeof propFirmAccountState.$inferSelect;

// Durable daily realized-P&L ledger per prop-firm account — the FTMO-style
// consistency rule (no single day's profit may exceed X% of total profit)
// previously lived ONLY in an in-memory map (server/services/live-trading-engine.ts
// challengeDailyPnL) that resets to zero on every deploy/restart — a real
// compliance risk for a live funded account mid-challenge. This table is the
// single source of truth: one row per (connection, date), incremented as each
// trade closes, read by the shared consistency service to compute the ratio.
export const propFirmDailyPnl = pgTable("prop_firm_daily_pnl", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  connectionId: integer("connection_id").notNull(),
  connectionType: text("connection_type").notNull().default('tradelocker'), // 'mt5' | 'tradelocker' | 'tradovate'
  tradeDate: text("trade_date").notNull(), // 'YYYY-MM-DD', UTC — matches a single trading day
  realizedPnl: doublePrecision("realized_pnl").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  unq: unique().on(t.connectionId, t.connectionType, t.tradeDate),
}));

export type PropFirmDailyPnl = typeof propFirmDailyPnl.$inferSelect;

// Durable Dual-Vote Consensus feed — the Options/Crypto.com engines' "Quant
// Agent + AI Agent" consensus panels previously lived ONLY in an in-memory
// Record<userId, ConsensusEntry[]> (global.optionsEngineConsensus /
// cryptocomEngineConsensus), wiped on every server restart/deploy. One row
// per (user, engine, symbol) — upserted on every scan cycle — so the panel
// still shows the last real decision immediately after a restart instead of
// "No signals processed yet" until the next scan happens to run.
export const engineConsensusLog = pgTable("engine_consensus_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  engine: text("engine").notNull(), // 'options' | 'cryptocom'
  symbol: text("symbol").notNull(),
  strategy: text("strategy").notNull(),
  quantVerdict: text("quant_verdict").notNull(),
  quantScore: doublePrecision("quant_score").notNull().default(0),
  aiVerdict: text("ai_verdict").notNull(),
  aiConfidence: doublePrecision("ai_confidence").notNull().default(0),
  aiReasoning: text("ai_reasoning").notNull().default(''),
  consensus: text("consensus").notNull(),
  tradeAllowed: boolean("trade_allowed").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  unq: unique().on(t.userId, t.engine, t.symbol),
}));

export type EngineConsensusLog = typeof engineConsensusLog.$inferSelect;

// Micro Growth's "doubling challenge" — a simple compounding-milestone
// tracker for small FX accounts. Deliberately NOT a martingale/anti-martingale
// sizing scheme: risk per trade stays the same (governed by the existing
// MICRO_TIERS lot-size table), this only tracks progress toward the next
// 2x balance checkpoint and counts how many doublings have been hit. One row
// per user — durable so the challenge survives restarts instead of resetting
// to an unknown state every deploy (the same in-memory-only gap the rest of
// Micro Growth's session history still has).
export const microGrowthMilestones = pgTable("micro_growth_milestones", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  startingBalance: doublePrecision("starting_balance").notNull(),
  currentMilestoneBase: doublePrecision("current_milestone_base").notNull(), // this leg's 1x checkpoint; target = base * 2
  doublingsCompleted: integer("doublings_completed").notNull().default(0),
  lastMilestoneHitAt: timestamp("last_milestone_hit_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MicroGrowthMilestone = typeof microGrowthMilestones.$inferSelect;

// Micro Growth session history — was global.microGrowthSessions (active) /
// global.microGrowthHistory (completed), both in-memory only, wiped on every
// restart/deploy. A user's today's-P&L, total P&L, and session count on the
// status page would silently reset to zero every time the server restarted,
// and an in-progress session would just vanish without ever resolving.
export const microGrowthSessions = pgTable("micro_growth_sessions", {
  id: text("id").primaryKey(), // matches the existing `${userId}_${Date.now()}` format
  userId: integer("user_id").references(() => users.id).notNull(),
  startedAt: timestamp("started_at").notNull(),
  durationMs: integer("duration_ms").notNull(),
  tier: integer("tier").notNull(),
  lotSize: doublePrecision("lot_size").notNull(),
  maxTrades: integer("max_trades").notNull(),
  pipTarget: integer("pip_target").notNull(),
  slPips: integer("sl_pips").notNull(),
  pairs: jsonb("pairs").notNull().default([]),
  weekendCryptoMode: boolean("weekend_crypto_mode").notNull().default(false),
  status: text("status").notNull().default('active'), // 'active' | 'completed'
  tradesCount: integer("trades_count").notNull().default(0),
  pipsGained: doublePrecision("pips_gained").notNull().default(0),
  pnl: doublePrecision("pnl").notNull().default(0),
  completedAt: timestamp("completed_at"),
});

export type MicroGrowthSession = typeof microGrowthSessions.$inferSelect;

// ── Brain Data Marketplace ────────────────────────────────────────────────────
// Sellers list a frozen snapshot of their ai_confirmation_outcomes history —
// priced in VEDD by age/pairs/trades/win-rate — so a buyer can merge a copy
// into their own learning brain (confirmation-learning.ts) without the
// seller losing access to their own data. See server/services/brain-marketplace.ts
// for the pricing formula and server/routes.ts's /api/brain-marketplace/* for
// the buy flow that imports the snapshot with tradeSource='purchased_brain'.
export const brainDataListings = pgTable("brain_data_listings", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").references(() => users.id).notNull(),
  // Which trade source this brain is built from — sellers can list a
  // separate brain per platform instead of one blended listing.
  // 'forex' = MT5/EA-triggered AI confirmations, 'tradelocker' = trades
  // executed/mirrored through a linked TradeLocker connection.
  sourceCategory: text("source_category").default('forex').notNull(),
  // Optional pair scope (e.g. ["EURUSD"] or ["EURUSD","USDJPY"]) — lets a
  // seller list several DISTINCT, simultaneously-active brains per category
  // (one per pair or pair group) instead of just one blended listing. Null/
  // empty = all pairs in this category, preserving the original behavior.
  symbolFilter: jsonb("symbol_filter"),
  // Opt-in only — manually-logged (discretionary) trades live in a separate
  // table (ai_trade_results) from AI-confirmed trades and are excluded from
  // the snapshot unless the seller explicitly includes them. Surfaced to
  // buyers so they know whether a listing covers AI-only or AI+manual history.
  includesManualTrades: boolean("includes_manual_trades").default(false).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  priceVedd: integer("price_vedd").notNull(),
  suggestedPriceVedd: integer("suggested_price_vedd").notNull(),
  snapshotData: jsonb("snapshot_data").notNull(), // frozen array of outcome rows at listing time — re-listing the SAME category+symbolFilter combo replaces this with a fresh, updated snapshot
  tradeCount: integer("trade_count").notNull(),
  distinctPairs: integer("distinct_pairs").notNull(),
  ageDays: integer("age_days").notNull(),
  winRate: real("win_rate"), // 0..1, null if too few closed trades
  oldestTradeAt: timestamp("oldest_trade_at").notNull(),
  newestTradeAt: timestamp("newest_trade_at").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  purchaseCount: integer("purchase_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const brainDataPurchases = pgTable("brain_data_purchases", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").references(() => brainDataListings.id).notNull(),
  sellerId: integer("seller_id").references(() => users.id).notNull(),
  buyerId: integer("buyer_id").references(() => users.id).notNull(),
  priceVeddPaid: integer("price_vedd_paid").notNull(),
  tradesImported: integer("trades_imported").notNull(),
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
}, (table) => {
  return {
    uniquePurchase: unique().on(table.listingId, table.buyerId),
  };
});

export const insertBrainDataListingSchema = createInsertSchema(brainDataListings).omit({
  id: true, purchaseCount: true, createdAt: true, updatedAt: true,
});
export const insertBrainDataPurchaseSchema = createInsertSchema(brainDataPurchases).omit({
  id: true, purchasedAt: true,
});

export type BrainDataListing = typeof brainDataListings.$inferSelect;
export type InsertBrainDataListing = z.infer<typeof insertBrainDataListingSchema>;
export type BrainDataPurchase = typeof brainDataPurchases.$inferSelect;
export type InsertBrainDataPurchase = z.infer<typeof insertBrainDataPurchaseSchema>;

// ── Grants & Funding ─────────────────────────────────────────────────────────

export const grants = pgTable("grants", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  grantType: text("grant_type").notNull(), // 'business_fintech'|'community_dev'|'ambassador_education'|'international'|'ai_focused'
  funder: text("funder").notNull(),
  fundingAmount: text("funding_amount"),
  deadline: timestamp("deadline"),
  eligibilityCriteria: jsonb("eligibility_criteria"), // string[]
  targetAudience: text("target_audience").default("both"), // 'business'|'ambassador'|'both'
  geographicScope: text("geographic_scope").default("US"),
  applicationUrl: text("application_url"),
  aiScanNotes: text("ai_scan_notes"),
  relevanceScore: integer("relevance_score").default(0),
  isActive: boolean("is_active").default(true),
  isVerified: boolean("is_verified").default(false),
  isFeatured: boolean("is_featured").default(false),
  source: text("source").default("ai_scan"), // 'ai_scan'|'manual'
  lastScannedAt: timestamp("last_scanned_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGrantSchema = createInsertSchema(grants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Grant = typeof grants.$inferSelect;
export type InsertGrant = z.infer<typeof insertGrantSchema>;

export const grantApplications = pgTable("grant_applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  grantId: integer("grant_id").references(() => grants.id).notNull(),
  status: text("status").default("draft"), // 'draft'|'applied'|'under_review'|'awarded'|'rejected'
  proposalMode: text("proposal_mode").notNull(), // 'auto'|'guided'|'template'
  proposalContent: text("proposal_content"),
  proposalSections: jsonb("proposal_sections"),
  proposalVersion: integer("proposal_version").default(1),
  submittedAt: timestamp("submitted_at"),
  awardedAt: timestamp("awarded_at"),
  awardedAmount: text("awarded_amount"),
  rejectionReason: text("rejection_reason"),
  applicationNotes: text("application_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGrantApplicationSchema = createInsertSchema(grantApplications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type GrantApplication = typeof grantApplications.$inferSelect;
export type InsertGrantApplication = z.infer<typeof insertGrantApplicationSchema>;

export const grantScanSessions = pgTable("grant_scan_sessions", {
  id: serial("id").primaryKey(),
  triggeredBy: integer("triggered_by").references(() => users.id),
  scanType: text("scan_type").notNull(), // 'full'|'targeted'
  grantTypesScanned: jsonb("grant_types_scanned"),
  grantsFound: integer("grants_found").default(0),
  grantsCreated: integer("grants_created").default(0),
  status: text("status").default("pending"), // 'pending'|'running'|'completed'|'failed'
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertGrantScanSessionSchema = createInsertSchema(grantScanSessions).omit({
  id: true,
  startedAt: true,
});

export type GrantScanSession = typeof grantScanSessions.$inferSelect;
export type InsertGrantScanSession = z.infer<typeof insertGrantScanSessionSchema>;

// ── Token-Backed Investments ──────────────────────────────────────────────────

export const investmentPools = pgTable("investment_pools", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),              // 'stake' | 'community' | 'growth' | 'elite'
  poolType: text("pool_type").notNull(),              // 'stake' | 'community' | 'growth' | 'elite'
  description: text("description").notNull(),
  apyRate: real("apy_rate").notNull(),                // 0.12 = 12% APY
  lockPeriodDays: integer("lock_period_days").notNull().default(0), // 0 = flexible
  minInvestment: real("min_investment").notNull().default(100),
  maxInvestment: real("max_investment"),              // null = unlimited
  riskLevel: text("risk_level").notNull().default("low"), // 'low' | 'medium' | 'high'
  totalPoolSize: real("total_pool_size").notNull().default(0),   // VEDD seeded by admin
  totalInvested: real("total_invested").notNull().default(0),   // sum of active positions
  totalYieldPaid: real("total_yield_paid").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  isPaused: boolean("is_paused").notNull().default(false),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInvestmentPoolSchema = createInsertSchema(investmentPools).omit({
  id: true, totalInvested: true, totalYieldPaid: true, createdAt: true, updatedAt: true,
});
export type InvestmentPool = typeof investmentPools.$inferSelect;
export type InsertInvestmentPool = z.infer<typeof insertInvestmentPoolSchema>;

export const tokenInvestments = pgTable("token_investments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  poolId: integer("pool_id").references(() => investmentPools.id).notNull(),
  amountInvested: real("amount_invested").notNull(),
  currentValue: real("current_value").notNull(),
  yieldEarned: real("yield_earned").notNull().default(0),
  status: text("status").notNull().default("active"), // 'active' | 'matured' | 'withdrawn' | 'cancelled'
  startDate: timestamp("start_date").defaultNow().notNull(),
  maturityDate: timestamp("maturity_date"),           // null for flexible pools
  lastYieldCalculatedAt: timestamp("last_yield_calculated_at").defaultNow().notNull(),
  withdrawnAt: timestamp("withdrawn_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTokenInvestmentSchema = createInsertSchema(tokenInvestments).omit({
  id: true, currentValue: true, yieldEarned: true, status: true,
  lastYieldCalculatedAt: true, withdrawnAt: true, createdAt: true, updatedAt: true,
});
export type TokenInvestment = typeof tokenInvestments.$inferSelect;

// ─── AMBASSADOR LEAD GENERATION ────────────────────────────────

export const landingPageQuizzes = pgTable("landing_page_quizzes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  title: text("title").notNull().default("My VEDD Landing Page"),
  slug: text("slug").notNull().unique(),
  headline: text("headline").default("Are You Ready for Financial Freedom?"),
  subheadline: text("subheadline").default("Answer 5 quick questions to get your FREE trading assessment"),
  questions: jsonb("questions").notNull().default([]),
  ctaText: text("cta_text").default("Get My Free Trading Assessment"),
  thankYouMessage: text("thank_you_message").default("Thanks! Your ambassador will reach out within 24 hours."),
  brandColor: text("brand_color").default("#ef4444"),
  isActive: boolean("is_active").default(true),
  leadCount: integer("lead_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const quizLeads = pgTable("quiz_leads", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").references(() => landingPageQuizzes.id),
  ambassadorId: integer("ambassador_id").references(() => users.id).notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  answers: jsonb("answers"),
  leadScore: integer("lead_score").default(0),
  leadQuality: text("lead_quality").default("cold"),
  status: text("status").default("new"),
  source: text("source").default("landing_page"),
  platform: text("platform"),
  profileUrl: text("profile_url"),
  bioSnippet: text("bio_snippet"),
  aiInsights: text("ai_insights"),
  notes: text("notes"),
  convertedAt: timestamp("converted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const socialLeadScans = pgTable("social_lead_scans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  platform: text("platform").notNull(),
  keywords: text("keywords").notNull(),
  searchUrls: jsonb("search_urls"),
  outreachKit: text("outreach_kit"),
  leadsAdded: integer("leads_added").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLandingPageQuizSchema = createInsertSchema(landingPageQuizzes).omit({ id: true, createdAt: true, updatedAt: true });
export type LandingPageQuiz = typeof landingPageQuizzes.$inferSelect;
export type InsertLandingPageQuiz = z.infer<typeof insertLandingPageQuizSchema>;

export const insertQuizLeadSchema = createInsertSchema(quizLeads).omit({ id: true, createdAt: true, updatedAt: true });
export type QuizLead = typeof quizLeads.$inferSelect;
export type InsertQuizLead = z.infer<typeof insertQuizLeadSchema>;

export const insertSocialLeadScanSchema = createInsertSchema(socialLeadScans).omit({ id: true, createdAt: true });
export type SocialLeadScan = typeof socialLeadScans.$inferSelect;
export type InsertSocialLeadScan = z.infer<typeof insertSocialLeadScanSchema>;

// ── Lead Hunter ───────────────────────────────────────────────────────────────
export const leads = pgTable("leads", {
  id: varchar("id", { length: 500 }).primaryKey(),
  date: varchar("date", { length: 20 }).notNull(),
  platform: varchar("platform", { length: 50 }).notNull(),
  username: varchar("username", { length: 255 }).notNull(),
  profileUrl: text("profile_url"),
  postContent: text("post_content"),
  postUrl: text("post_url"),
  intentScore: integer("intent_score").default(0),
  accountQuality: integer("account_quality").default(0),
  contactOpportunity: text("contact_opportunity"),
  status: varchar("status", { length: 50 }).default('New'),
  subreddit: varchar("subreddit", { length: 100 }),
  followerCount: integer("follower_count").default(0),
  headline: text("headline"),
  engagementStats: text("engagement_stats"),
  suggestedReply: text("suggested_reply"),
  autoEngaged: boolean("auto_engaged").default(false),
  engagementType: varchar("engagement_type", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const leadHunterRuns = pgTable("lead_hunter_runs", {
  id: serial("id").primaryKey(),
  date: varchar("date", { length: 20 }).notNull(),
  status: varchar("status", { length: 50 }).default('running'),
  totalScraped: integer("total_scraped").default(0),
  newLeads: integer("new_leads").default(0),
  highIntent: integer("high_intent").default(0),
  autoEngagedCount: integer("auto_engaged_count").default(0),
  platformBreakdown: text("platform_breakdown"),
  errorLog: text("error_log"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export type Lead = typeof leads.$inferSelect;
export type LeadHunterRun = typeof leadHunterRuns.$inferSelect;

// ── Ambassador Prime ──────────────────────────────────────────────────────────
export const ambassadorDailyContent = pgTable("ambassador_daily_content", {
  id: serial("id").primaryKey(),
  runDate: varchar("run_date", { length: 20 }).notNull(),
  platform: varchar("platform", { length: 50 }).notNull(),
  postType: varchar("post_type", { length: 50 }),
  contentText: text("content_text"),
  postId: varchar("post_id", { length: 255 }),
  status: varchar("status", { length: 50 }).default('generated'),
  referralLink: text("referral_link"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ambassadorRedditInsights = pgTable("ambassador_reddit_insights", {
  id: serial("id").primaryKey(),
  runDate: varchar("run_date", { length: 20 }).notNull(),
  subreddit: varchar("subreddit", { length: 100 }),
  insight: text("insight"),
  engagementOpportunity: text("engagement_opportunity"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ambassadorRunSummary = pgTable("ambassador_run_summary", {
  id: serial("id").primaryKey(),
  runDate: varchar("run_date", { length: 20 }).notNull().unique(),
  tweetsPosted: integer("tweets_posted").default(0),
  linkedinPosts: integer("linkedin_posts").default(0),
  igCaptionsGenerated: integer("ig_captions_generated").default(0),
  redditPostsScraped: integer("reddit_posts_scraped").default(0),
  emailSent: boolean("email_sent").default(false),
  imageGenerated: boolean("image_generated").default(false),
  dayTheme: varchar("day_theme", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ambassadorWeeklyCalendar = pgTable("ambassador_weekly_calendar", {
  id: serial("id").primaryKey(),
  currentWeekNumber: integer("current_week_number").default(1),
  lastRunDate: varchar("last_run_date", { length: 20 }),
  lastRunDayOfWeek: varchar("last_run_day_of_week", { length: 20 }),
  totalRuns: integer("total_runs").default(0),
});

export const ambassadorDailyKpis = pgTable("ambassador_daily_kpis", {
  id: serial("id").primaryKey(),
  runDate: varchar("run_date", { length: 20 }).notNull().unique(),
  subscriberGrowthPosts: integer("subscriber_growth_posts").default(0),
  referralLinksIncluded: integer("referral_links_included").default(0),
  totalPostsPublished: integer("total_posts_published").default(0),
  estimatedReach: integer("estimated_reach").default(0),
  redditInsightsCount: integer("reddit_insights_count").default(0),
  engagementOpportunities: integer("engagement_opportunities").default(0),
  moduleTopic: text("module_topic"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ambassadorHookVariations = pgTable("ambassador_hook_variations", {
  id: serial("id").primaryKey(),
  runDate: varchar("run_date", { length: 20 }).notNull(),
  variation: varchar("variation", { length: 5 }),
  hookText: text("hook_text"),
  ctaText: text("cta_text"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ambassadorBonusContent = pgTable("ambassador_bonus_content", {
  id: serial("id").primaryKey(),
  runDate: varchar("run_date", { length: 20 }).notNull(),
  dayOfWeek: varchar("day_of_week", { length: 20 }),
  contentType: varchar("content_type", { length: 50 }),
  contentText: text("content_text"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ambassadorCommunityContent = pgTable("ambassador_community_content", {
  id: serial("id").primaryKey(),
  runDate: varchar("run_date", { length: 20 }).notNull(),
  contentType: varchar("content_type", { length: 50 }),
  contentText: text("content_text"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ambassadorRunStepLog = pgTable("ambassador_run_step_log", {
  id: serial("id").primaryKey(),
  runDate: varchar("run_date", { length: 20 }).notNull(),
  stepName: varchar("step_name", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).default('completed'),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Content Studio / AI-generated media — durable storage ───────────────────
// DALL-E and Replicate both return TEMPORARY hosted URLs (DALL-E ~1hr,
// Replicate ~24hr) — the actual bytes are never re-hosted anywhere today, so
// generated images/videos "disappear" once the provider's URL expires, even
// though Render's disk is also ephemeral and would lose a locally-saved copy
// on the next deploy anyway. Storing the asset bytes directly in Postgres
// (same durable-storage philosophy as cred-store.ts's durable_files mirror)
// solves both problems at once with no new external service/credentials.
export const contentStudioAssets = pgTable("content_studio_assets", {
  id: serial("id").primaryKey(),
  mimeType: text("mime_type").notNull(),
  data: text("data").notNull(), // base64-encoded bytes
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ContentStudioAsset = typeof contentStudioAssets.$inferSelect;

// One row per "save" action a user takes on a piece of generated content —
// the actual library a user browses to find old content again. assetUrl
// points at /api/content-studio/asset/:id (permanent, app-hosted) rather
// than the provider's temporary URL.
export const contentStudioGenerations = pgTable("content_studio_generations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  contentType: text("content_type").notNull(), // 'image' | 'video' | 'reel' | 'carousel'
  prompt: text("prompt"),
  title: text("title"),
  caption: text("caption"),
  assetUrl: text("asset_url"), // permanent URL for single-asset types (image/video/reel)
  flattenedAssetUrl: text("flattened_asset_url"), // slide image with caption text + optional logo baked in, ready to upload as-is
  metadata: jsonb("metadata").notNull().default({}), // carousel: { slides: [{heading, body, imageUrl}] }; reel: { hook, script }
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContentStudioGenerationSchema = createInsertSchema(contentStudioGenerations).omit({
  id: true,
  createdAt: true,
});

export type ContentStudioGeneration = typeof contentStudioGenerations.$inferSelect;
export type InsertContentStudioGeneration = z.infer<typeof insertContentStudioGenerationSchema>;

// Ambassador Prime's weekly market briefing — aggregates the pairs selected
// across ALL users' weekly plans, tells the "story" of why they matter using
// the same Reddit + news research Ambassador Prime already gathers, and
// feeds back into two places: (1) the AI confirmation prompt as market-context
// text (marketNarrative), and (2) a small, bounded confidence nudge per pair
// in signal generation (never enough alone to push a NEUTRAL signal live or
// bypass Gate 0 account-safety checks — see confidenceBoost usage in openai.ts).
export const ambassadorMarketBriefing = pgTable("ambassador_market_briefing", {
  id: serial("id").primaryKey(),
  weekStartDate: varchar("week_start_date", { length: 20 }).notNull().unique(), // ISO Monday of the week
  narrativeText: text("narrative_text").notNull(),
  // JSON array: [{ symbol, direction, strategyIdea, confidenceBoost, mentionCount }]
  pairs: jsonb("pairs").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AmbassadorMarketBriefing = typeof ambassadorMarketBriefing.$inferSelect;

// ─── PERSONA CONTENT ENGINE (Don Chism / VEDD founder brand, 3x/week, 8-platform) ───
// Separate from the daily Ambassador Prime engine above — its own rotation/arc state.

export const personaPillarRotation = pgTable("persona_pillar_rotation", {
  id: serial("id").primaryKey(),
  pillar: text("pillar").notNull().unique(),
  timesUsed: integer("times_used").default(0).notNull(),
  lastUsedDate: varchar("last_used_date", { length: 20 }),
});

export const personaArcState = pgTable("persona_arc_state", {
  id: integer("id").primaryKey(), // fixed row id=1
  currentIndex: integer("current_index").default(0).notNull(),
  loopsCompleted: integer("loops_completed").default(0).notNull(),
});

export const personaContentDays = pgTable("persona_content_days", {
  id: serial("id").primaryKey(),
  contentDate: varchar("content_date", { length: 20 }).notNull(),
  pillar: text("pillar").notNull(),
  theme: text("theme").notNull(),
  arcStage: text("arc_stage").notNull(),
  arcIndex: integer("arc_index").notNull(),
  goal: text("goal"),
  platformsCount: integer("platforms_count").default(8).notNull(),
  emailSent: boolean("email_sent").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PersonaContentDay = typeof personaContentDays.$inferSelect;
export type PersonaPillarRotation = typeof personaPillarRotation.$inferSelect;
export type PersonaArcState = typeof personaArcState.$inferSelect;

// ─── BLOG POSTS ────────────────────────────────────────────────

export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(), // HTML content
  category: text("category").notNull().default("Trading Strategy"),
  tags: jsonb("tags").default([]), // string[]
  coverImage: text("cover_image"), // URL or null
  authorId: integer("author_id").references(() => users.id),
  authorName: text("author_name").default("VEDD Team"),
  isPublished: boolean("is_published").default(false),
  isFeatured: boolean("is_featured").default(false),
  aiGenerated: boolean("ai_generated").default(false),
  currentEventsContext: text("current_events_context"), // what news was used
  readTime: text("read_time").default("5 min read"),
  viewCount: integer("view_count").default(0),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({ id: true, createdAt: true, updatedAt: true });
export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;
export type InsertTokenInvestment = z.infer<typeof insertTokenInvestmentSchema>;

// Anonymous blog newsletter capture — separate from user accounts. Lets a
// visitor who isn't ready to sign up yet still leave an email, and lets us
// track which referral code (if any) brought them in.
export const blogNewsletterSubscribers = pgTable("blog_newsletter_subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  referralCode: text("referral_code"),
  sourceSlug: text("source_slug"), // which article they subscribed from
  status: text("status").notNull().default('subscribed'), // 'subscribed' | 'unsubscribed'
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"),
});

export const insertBlogNewsletterSubscriberSchema = createInsertSchema(blogNewsletterSubscribers).omit({
  id: true, subscribedAt: true, unsubscribedAt: true,
});
export type BlogNewsletterSubscriber = typeof blogNewsletterSubscribers.$inferSelect;
export type InsertBlogNewsletterSubscriber = z.infer<typeof insertBlogNewsletterSubscriberSchema>;

// ─── AMBASSADOR FREE PATH JOURNEY ─────────────────────────────

export const ambassadorJourney = pgTable("ambassador_journey", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  currentDay: integer("current_day").default(1).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
  tokensEarned: integer("tokens_earned").default(0).notNull(),
  referralsCount: integer("referrals_count").default(0).notNull(),
  subscribedReferrals: integer("subscribed_referrals").default(0).notNull(),
  postsCompleted: integer("posts_completed").default(0).notNull(),
  dmsCompleted: integer("dms_completed").default(0).notNull(),
  commentsCompleted: integer("comments_completed").default(0).notNull(),
  streakDays: integer("streak_days").default(0).notNull(),
  longestStreak: integer("longest_streak").default(0).notNull(),
  subscriptionEarned: boolean("subscription_earned").default(false).notNull(),
  monthsEarned: integer("months_earned").default(0).notNull(),
  completedDays: jsonb("completed_days").default([]).notNull(),
  savedContent: jsonb("saved_content").default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ambassadorDailyActions = pgTable("ambassador_daily_actions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  day: integer("day").notNull(),
  actionType: text("action_type").notNull(),
  platform: text("platform").notNull(),
  completed: boolean("completed").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  tokensAwarded: integer("tokens_awarded").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAmbassadorJourneySchema = createInsertSchema(ambassadorJourney).omit({ id: true, createdAt: true, updatedAt: true });
export type AmbassadorJourney = typeof ambassadorJourney.$inferSelect;
export type InsertAmbassadorJourney = z.infer<typeof insertAmbassadorJourneySchema>;

export const insertAmbassadorDailyActionSchema = createInsertSchema(ambassadorDailyActions).omit({ id: true, createdAt: true });
export type AmbassadorDailyAction = typeof ambassadorDailyActions.$inferSelect;
export type InsertAmbassadorDailyAction = z.infer<typeof insertAmbassadorDailyActionSchema>;

// ─── DEVOTIONALS ──────────────────────────────────────────────────────────────

export const devotionals = pgTable("devotionals", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(), // "2026-04-19" ISO date key
  title: text("title").notNull(),
  theme: text("theme").notNull(), // e.g. "Excellence", "Persistence"
  scripture: text("scripture").notNull(), // "Proverbs 16:3"
  scriptureText: text("scripture_text").notNull(),
  reflection: text("reflection").notNull(), // main devotional body
  prayerPoints: jsonb("prayer_points").default([]), // string[]
  affirmation: text("affirmation").notNull(),
  tradingTieIn: text("trading_tie_in"), // how mindset applies to trading
  heroImage: text("hero_image"), // on-brand generated cover image (DALL-E/FLUX)
  minimumMinutes: integer("minimum_minutes").default(5),
  aiGenerated: boolean("ai_generated").default(true),
  isPublished: boolean("is_published").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const devotionalGroups = pgTable("devotional_groups", {
  id: serial("id").primaryKey(),
  devotionalId: integer("devotional_id").references(() => devotionals.id).notNull(),
  createdBy: integer("created_by").references(() => users.id).notNull(),
  inviteCode: text("invite_code").notNull().unique(), // 6-char alphanumeric
  city: text("city"), // local city label
  isActive: boolean("is_active").default(true),
  participantCount: integer("participant_count").default(1),
  completedCount: integer("completed_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const devotionalSessions = pgTable("devotional_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  devotionalId: integer("devotional_id").references(() => devotionals.id).notNull(),
  groupId: integer("group_id").references(() => devotionalGroups.id),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  durationSeconds: integer("duration_seconds"),
  isCompleted: boolean("is_completed").default(false),
  isGroupSession: boolean("is_group_session").default(false),
  rewardEarned: boolean("reward_earned").default(false),
  rewardAmount: integer("reward_amount").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDevotionalSchema = createInsertSchema(devotionals).omit({ id: true, createdAt: true });
export type Devotional = typeof devotionals.$inferSelect;
export type InsertDevotional = z.infer<typeof insertDevotionalSchema>;

export const insertDevotionalGroupSchema = createInsertSchema(devotionalGroups).omit({ id: true, createdAt: true });
export type DevotionalGroup = typeof devotionalGroups.$inferSelect;
export type InsertDevotionalGroup = z.infer<typeof insertDevotionalGroupSchema>;

export const insertDevotionalSessionSchema = createInsertSchema(devotionalSessions).omit({ id: true, createdAt: true });
export type DevotionalSession = typeof devotionalSessions.$inferSelect;

// ─── WORKFORCE ACADEMY ENGINE ────────────────────────────────────────────────

export const workforceModules = pgTable("workforce_modules", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // 'ai_literacy'|'digital_skills'|'trading_fundamentals'|'financial_planning'|'web3_basics'|'stem'
  difficulty: text("difficulty").default("beginner"), // 'beginner'|'intermediate'|'advanced'
  estimatedMinutes: integer("estimated_minutes").default(30),
  content: jsonb("content"), // Array of { title, body, videoUrl? }
  assessmentQuestions: jsonb("assessment_questions"), // [{ question, options: string[], correct: number, explanation }]
  passingScore: integer("passing_score").default(70),
  targetAudience: text("target_audience").default("all"), // 'all'|'youth'|'community'|'ambassador'
  grantTags: jsonb("grant_tags"), // ['DOL', 'NSF', 'CDFI', 'EDA', 'SBA']
  isPublished: boolean("is_published").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workforceEnrollments = pgTable("workforce_enrollments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  moduleId: integer("module_id").references(() => workforceModules.id).notNull(),
  status: text("status").default("enrolled"), // 'enrolled'|'in_progress'|'completed'
  progressPct: integer("progress_pct").default(0),
  score: integer("score"),
  completedAt: timestamp("completed_at"),
  enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workforceCertificates = pgTable("workforce_certificates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  moduleId: integer("module_id").references(() => workforceModules.id),
  courseId: integer("course_id"), // client-side Workforce Academy COURSES[] id (1-13) — the actual course this certificate was earned for
  certificateType: text("certificate_type").default("module"), // 'module'|'program'|'ambassador'|'workforce'
  certificateId: text("certificate_id").notNull().unique(), // VEDD-CERT-XXXXX
  title: text("title").notNull(),
  recipientName: text("recipient_name"),
  score: integer("score"),
  ceuHours: doublePrecision("ceu_hours"),
  grantFrameworks: jsonb("grant_frameworks"),
  onetCode: text("onet_code"),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
});

// ─── IMPACT MEASUREMENT SYSTEM ───────────────────────────────────────────────

export const impactMetrics = pgTable("impact_metrics", {
  id: serial("id").primaryKey(),
  metricType: text("metric_type").notNull(), // 'enrollment'|'completion'|'job_placement'|'skills_gain'|'community_reach'|'partner_engagement'
  value: integer("value").default(0),
  grantTag: text("grant_tag"), // Which grant program this metric supports
  period: text("period"), // 'Q1_2025', 'Q2_2025', etc.
  demographicData: jsonb("demographic_data"), // { ageGroup, geography, incomeLevel, ethnicity }
  notes: text("notes"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const communityPartnerships = pgTable("community_partnerships", {
  id: serial("id").primaryKey(),
  organizationName: text("organization_name").notNull(),
  partnerType: text("partner_type").notNull(), // 'nonprofit'|'school'|'workforce_board'|'church'|'cdfi'|'government'
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  status: text("status").default("active"), // 'prospect'|'active'|'reporting'|'inactive'
  programsSupported: jsonb("programs_supported"), // ['workforce_academy', 'financial_literacy', 'youth_stem']
  participantsReferred: integer("participants_referred").default(0),
  mou: boolean("mou").default(false), // Memorandum of Understanding signed
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── AI ETHICS & GOVERNANCE ──────────────────────────────────────────────────

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(), // 'ai_decision'|'data_access'|'model_run'|'bias_check'|'policy_update'|'ethics_review'
  resource: text("resource"), // 'chart_analysis'|'grant_proposal'|'user_data'|'curriculum'
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  outcome: text("outcome").default("success"), // 'success'|'flagged'|'blocked'|'reviewed'
  riskLevel: text("risk_level").default("low"), // 'low'|'medium'|'high'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const biasReports = pgTable("bias_reports", {
  id: serial("id").primaryKey(),
  triggeredBy: integer("triggered_by").references(() => users.id),
  scanScope: text("scan_scope").notNull(), // 'full'|'curriculum'|'ai_outputs'|'recommendations'
  findingsCount: integer("findings_count").default(0),
  riskScore: integer("risk_score").default(0), // 0-100
  findings: jsonb("findings"), // [{ category, severity, description, recommendation }]
  status: text("status").default("pending"), // 'pending'|'running'|'completed'|'reviewed'
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// ─── RESEARCH & INNOVATION LAB ───────────────────────────────────────────────

export const innovationProjects = pgTable("innovation_projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(), // 'algorithm'|'wearable_ai'|'community_finance'|'ai_ethics'|'workforce_tech'
  hypothesis: text("hypothesis"),
  methodology: text("methodology"),
  dataPoints: jsonb("data_points"), // Experiment data collected
  status: text("status").default("active"), // 'active'|'paused'|'published'|'archived'
  tags: jsonb("tags"),
  grantAlignment: text("grant_alignment"), // Which grant type this research supports
  reportContent: text("report_content"), // Generated innovation report
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Insert schemas and types
export const insertWorkforceModuleSchema = createInsertSchema(workforceModules).omit({ id: true, createdAt: true, updatedAt: true });
export type WorkforceModule = typeof workforceModules.$inferSelect;
export type InsertWorkforceModule = z.infer<typeof insertWorkforceModuleSchema>;

export const insertWorkforceEnrollmentSchema = createInsertSchema(workforceEnrollments).omit({ id: true, enrolledAt: true, updatedAt: true });
export type WorkforceEnrollment = typeof workforceEnrollments.$inferSelect;
export type InsertWorkforceEnrollment = z.infer<typeof insertWorkforceEnrollmentSchema>;

export const insertWorkforceCertificateSchema = createInsertSchema(workforceCertificates).omit({ id: true, issuedAt: true });
export type WorkforceCertificate = typeof workforceCertificates.$inferSelect;

// Workforce Academy course progress — "where the learner left off". The
// client's enrollment/lesson-position state (COURSES[] id, current lesson,
// progress %) previously lived ONLY in React useState, so a page refresh or
// Render redeploy silently dropped every in-progress course back to
// "not enrolled." Certificates already survived (workforceCertificates
// above); this is the same fix applied to in-progress courses. One row per
// (user, courseId) — upserted on enroll, on every lesson navigation, and on
// course completion.
export const workforceCourseProgress = pgTable("workforce_course_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  courseId: integer("course_id").notNull(), // client-side Workforce Academy COURSES[] id — same numbering as workforceCertificates.courseId
  currentLesson: integer("current_lesson").notNull().default(1),
  progressPct: integer("progress_pct").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  score: integer("score"),
  enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  unq: unique().on(t.userId, t.courseId),
}));

export type WorkforceCourseProgress = typeof workforceCourseProgress.$inferSelect;
export type InsertWorkforceCertificate = z.infer<typeof insertWorkforceCertificateSchema>;

export const insertImpactMetricSchema = createInsertSchema(impactMetrics).omit({ id: true, recordedAt: true });
export type ImpactMetric = typeof impactMetrics.$inferSelect;
export type InsertImpactMetric = z.infer<typeof insertImpactMetricSchema>;

export const insertCommunityPartnershipSchema = createInsertSchema(communityPartnerships).omit({ id: true, createdAt: true, updatedAt: true });
export type CommunityPartnership = typeof communityPartnerships.$inferSelect;
export type InsertCommunityPartnership = z.infer<typeof insertCommunityPartnershipSchema>;

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export const insertBiasReportSchema = createInsertSchema(biasReports).omit({ id: true, createdAt: true });
export type BiasReport = typeof biasReports.$inferSelect;
export type InsertBiasReport = z.infer<typeof insertBiasReportSchema>;

export const insertInnovationProjectSchema = createInsertSchema(innovationProjects).omit({ id: true, createdAt: true, updatedAt: true });
export type InnovationProject = typeof innovationProjects.$inferSelect;
export type InsertInnovationProject = z.infer<typeof insertInnovationProjectSchema>;
export type InsertDevotionalSession = z.infer<typeof insertDevotionalSessionSchema>;

// ============================================================
// Stop Orders — Breakout Strategy Pending Orders
// ============================================================
export const stopOrders = pgTable("stop_orders", {
  id:            serial("id").primaryKey(),
  userId:        integer("user_id").references(() => users.id).notNull(),
  symbol:        text("symbol").notNull(),
  direction:     text("direction").notNull(),      // 'BUY_STOP' | 'SELL_STOP'
  triggerPrice:  real("trigger_price").notNull(),  // Price at which order fires
  lotSize:       real("lot_size").notNull(),
  stopLoss:      real("stop_loss"),
  takeProfit:    real("take_profit"),
  status:        text("status").notNull().default("PENDING"), // 'PENDING'|'TRIGGERED'|'CANCELLED'
  breakoutLevel: real("breakout_level"),           // Key level that prompted the order
  notes:         text("notes"),
  triggeredAt:   timestamp("triggered_at"),
  cancelledAt:   timestamp("cancelled_at"),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
  updatedAt:     timestamp("updated_at").defaultNow().notNull(),
});

export const insertStopOrderSchema = createInsertSchema(stopOrders, {
  direction:    z.enum(["BUY_STOP", "SELL_STOP"]),
  triggerPrice: z.number().positive("Trigger price must be positive"),
  lotSize:      z.number().positive("Lot size must be positive"),
  stopLoss:     z.number().positive().optional(),
  takeProfit:   z.number().positive().optional(),
  breakoutLevel:z.number().optional(),
  notes:        z.string().max(500).optional(),
}).omit({ id: true, status: true, triggeredAt: true, cancelledAt: true, createdAt: true, updatedAt: true });

export type StopOrder       = typeof stopOrders.$inferSelect;
export type InsertStopOrder = z.infer<typeof insertStopOrderSchema>;

// ─── All-Time Records ────────────────────────────────────────────────────────
// Per-user high-water marks (best_daily_pnl, etc.) — only updated when
// a new value exceeds the stored record.
export const allTimeRecords = pgTable("all_time_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  recordType: text("record_type").notNull().default("best_daily_pnl"),
  value: real("value").notNull().default(0),
  achievedAt: timestamp("achieved_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  unq: unique().on(t.userId, t.recordType),
}));

export type AllTimeRecord       = typeof allTimeRecords.$inferSelect;
export type InsertAllTimeRecord = typeof allTimeRecords.$inferInsert;

// ─── FX Paper Trading (AI SS Engine simulated trades) ────────────────────────
export const fxPaperAccounts = pgTable("fx_paper_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  balance: real("balance").notNull().default(10000),
  initialBalance: real("initial_balance").notNull().default(10000),
  isEnabled: boolean("is_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const fxPaperTrades = pgTable("fx_paper_trades", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  pair: text("pair").notNull(),
  direction: text("direction").notNull(),      // 'BUY' | 'SELL'
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price"),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  lotSize: real("lot_size").notNull().default(0.01),
  pnl: real("pnl"),
  pnlPips: real("pnl_pips"),
  status: text("status").notNull().default("open"), // 'open' | 'closed'
  confidence: real("confidence"),
  source: text("source").default("fx_paper_engine"),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
});

export const insertFxPaperTradeSchema = createInsertSchema(fxPaperTrades).omit({
  id: true,
  openedAt: true,
  closedAt: true,
  exitPrice: true,
  pnl: true,
  pnlPips: true,
  status: true,
});

export type FxPaperAccount = typeof fxPaperAccounts.$inferSelect;
export type FxPaperTrade = typeof fxPaperTrades.$inferSelect;
export type InsertFxPaperTrade = z.infer<typeof insertFxPaperTradeSchema>;

// ─── Copy Trading ─────────────────────────────────────────────────────────────
export const copyRelationships = pgTable("copy_relationships", {
  id: serial("id").primaryKey(),
  copierId: integer("copier_id").references(() => users.id).notNull(),
  sourceUserId: integer("source_user_id").references(() => users.id).notNull(),
  accountType: text("account_type").notNull().default("paper"), // 'paper' | 'real'
  maxLotSize: real("max_lot_size").notNull().default(0.01),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Added via idempotent ALTER TABLE in server/index.ts boot migration —
  // declared here too so the Drizzle-typed side matches the raw-SQL side.
  profitSharePct: real("profit_share_pct").notNull().default(20),
  veddFeePaid: real("vedd_fee_paid").notNull().default(0),
  // Which of the copier's own TradeLocker connections real-mode copying
  // executes on. Required (enforced at the route level) when accountType='real'.
  copierConnectionId: integer("copier_connection_id"),
}, (t) => ({
  unq: unique().on(t.copierId, t.sourceUserId),
}));

export const copyTradeLogs = pgTable("copy_trade_logs", {
  id: serial("id").primaryKey(),
  relationshipId: integer("relationship_id").references(() => copyRelationships.id).notNull(),
  copierId: integer("copier_id").references(() => users.id).notNull(),
  sourceUserId: integer("source_user_id").references(() => users.id).notNull(),
  originalTradeId: integer("original_trade_id"),
  pair: text("pair").notNull(),
  direction: text("direction").notNull(),
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price"),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  lotSize: real("lot_size").notNull().default(0.01),
  pnl: real("pnl"),
  pnlPips: real("pnl_pips"),
  status: text("status").notNull().default("open"),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  profitShareVedd: real("profit_share_vedd"),
  // Paper mode: links to the mirrored row in the copier's OWN fx_paper_trades
  // table so their personal paper account actually reflects the copy.
  copierFxTradeId: integer("copier_fx_trade_id"),
  // Real mode: the actual broker order placed on the copier's account.
  brokerOrderId: text("broker_order_id"),
  executionStatus: text("execution_status").default('pending'), // 'pending' | 'placed' | 'failed' | 'skipped'
  executionError: text("execution_error"),
});

export type CopyRelationship = typeof copyRelationships.$inferSelect;
export type CopyTradeLog = typeof copyTradeLogs.$inferSelect;

// Engine run-state persistence — one row per user+engine, restored on startup
export const engineRunState = pgTable("engine_run_state", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  engine: text("engine").notNull(), // 'polymarket' | 'kalshi'
  isRunning: boolean("is_running").notNull().default(false),
  isPaperMode: boolean("is_paper_mode").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniq: unique("engine_run_state_user_engine_idx").on(t.userId, t.engine),
}));

export type EngineRunState = typeof engineRunState.$inferSelect;

// Durable mirror of the Kalshi engine's KalshiEngineConfig (server/services/
// kalshi-engine.ts) — that config otherwise lives ONLY in an in-memory
// Map<userId, KalshiEngineState>, wiped on every restart/deploy. engineRunState
// above already persists isRunning/isPaperMode, but not which coins/strategy/
// risk settings were actually configured — so a redeploy silently reset
// `symbols` back to ['BTC'] and every other setting back to defaults even
// while the engine kept running. Mirrors the live_engine_configs pattern
// used for the FX SS AI Engine.
export const kalshiEngineConfigs = pgTable("kalshi_engine_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type KalshiEngineConfigRow = typeof kalshiEngineConfigs.$inferSelect;

// Per-trade feature store for the Kalshi self-learning brain. ai_trade_results
// is lossy for Kalshi (no confidence/edge/coin/strikeType columns), so this
// table captures the FULL decision context of every closed trade — the raw
// material the brain correlates with win/loss to get smarter each trade. Also
// the snapshot source when a Kalshi brain is sold on the marketplace.
export const kalshiBrainOutcomes = pgTable("kalshi_brain_outcomes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  coin: text("coin").notNull(),
  timeframe: text("timeframe").notNull(),           // 'hourly' | 'fifteen_min'
  strategy: text("strategy").notNull(),
  direction: text("direction").notNull(),           // 'BUY' | 'SELL'
  strikeType: text("strike_type"),                  // greater/less/between/…
  entryPriceCents: integer("entry_price_cents"),
  confidence: doublePrecision("confidence"),        // signal confidence 0-100
  edgePct: doublePrecision("edge_pct"),             // value-pick edge (null for single-strategy)
  valueScore: doublePrecision("value_score"),
  modelProbPct: doublePrecision("model_prob_pct"),
  agreement: doublePrecision("agreement"),
  hourUtc: integer("hour_utc"),                     // 0-23 entry hour (UTC)
  holdingMinutes: integer("holding_minutes"),
  exitReason: text("exit_reason"),                  // take_profit/stop_loss/settlement/manual
  result: text("result").notNull(),                 // WIN | LOSS | BREAKEVEN
  profitLoss: doublePrecision("profit_loss").notNull(),
  source: text("source").notNull().default('live'), // 'live' | 'backfill' | 'purchased_brain'
  closedAt: timestamp("closed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type KalshiBrainOutcome = typeof kalshiBrainOutcomes.$inferSelect;

// Durable per-close feature store for the Options AI Engine brain — same role
// kalshi_brain_outcomes plays for Kalshi. Every options trade close records one
// row here (the frozen decision context correlated with win/loss), so the brain
// can absorb PURCHASED brains without polluting the real optionsEngineTrades
// table, and so an options brain can be snapshotted and sold on the marketplace.
export const optionsBrainOutcomes = pgTable("options_brain_outcomes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  underlyingSymbol: text("underlying_symbol").notNull(),
  optionType: text("option_type").notNull(),          // 'call' | 'put'
  strategy: text("strategy").notNull(),
  direction: text("direction"),                       // 'bullish' | 'bearish'
  entryConfidence: doublePrecision("entry_confidence"),
  returnPct: doublePrecision("return_pct"),           // premium % return at close
  hourUtc: integer("hour_utc"),                       // 0-23 close hour (UTC)
  holdingMinutes: integer("holding_minutes"),
  exitReason: text("exit_reason"),                    // take_profit/stop_loss/trailing_stop/manual
  result: text("result").notNull(),                   // WIN | LOSS | BREAKEVEN
  profitLoss: doublePrecision("profit_loss").notNull(),
  contracts: integer("contracts"),
  source: text("source").notNull().default('live'),   // 'live' | 'backfill' | 'purchased_brain'
  closedAt: timestamp("closed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type OptionsBrainOutcome = typeof optionsBrainOutcomes.$inferSelect;

// ─── Business Credit Builder ──────────────────────────────────────────────────

export const bizEntityTypeEnum = pgEnum("biz_entity_type", ["llc", "s_corp", "c_corp", "sole_prop"]);
export const bizStatusEnum      = pgEnum("biz_status", ["draft", "name_check", "formation", "ein_pending", "banking", "credit_building", "funded"]);
export const nameCheckSourceEnum    = pgEnum("name_check_source", ["ai_generated", "sos_lookup"]);
export const formationProviderEnum  = pgEnum("formation_provider", ["stripe_atlas", "incfile", "zenbusiness"]);
export const bankProviderEnum       = pgEnum("bank_provider", ["mercury", "relay", "found"]);
export const creditTaskTypeEnum     = pgEnum("credit_task_type", ["net30", "credit_monitoring", "duns_registration", "trade_line"]);
export const taskStatusEnum         = pgEnum("task_status", ["pending", "in_progress", "complete"]);
export const funderTypeEnum         = pgEnum("funder_type", ["grant", "cdfi", "sponsor", "microloan", "revenue_share"]);

export const bizProfiles = pgTable("biz_profiles", {
  id:             serial("id").primaryKey(),
  userId:         integer("user_id").notNull().references(() => users.id),
  businessName:   text("business_name"),
  businessIdea:   text("business_idea").notNull(),
  entityType:     bizEntityTypeEnum("entity_type").notNull().default("llc"),
  state:          text("state").notNull(),
  status:         bizStatusEnum("status").notNull().default("draft"),
  aiDescription:  text("ai_description"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
  updatedAt:      timestamp("updated_at").defaultNow().notNull(),
});

export const bizNameChecks = pgTable("biz_name_checks", {
  id:             serial("id").primaryKey(),
  bizProfileId:   integer("biz_profile_id").notNull().references(() => bizProfiles.id),
  nameChecked:    text("name_checked").notNull(),
  available:      boolean("available").notNull().default(true),
  source:         nameCheckSourceEnum("source").notNull().default("ai_generated"),
  checkedAt:      timestamp("checked_at").defaultNow().notNull(),
});

export const bizFormationLinks = pgTable("biz_formation_links", {
  id:             serial("id").primaryKey(),
  bizProfileId:   integer("biz_profile_id").notNull().references(() => bizProfiles.id),
  provider:       formationProviderEnum("provider").notNull(),
  redirectUrl:    text("redirect_url").notNull(),
  status:         text("status").notNull().default("pending"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
});

export const bizBankLinks = pgTable("biz_bank_links", {
  id:             serial("id").primaryKey(),
  bizProfileId:   integer("biz_profile_id").notNull().references(() => bizProfiles.id),
  provider:       bankProviderEnum("provider").notNull(),
  referralUrl:    text("referral_url").notNull(),
  status:         text("status").notNull().default("not_started"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
});

export const bizCreditTasks = pgTable("biz_credit_tasks", {
  id:             serial("id").primaryKey(),
  bizProfileId:   integer("biz_profile_id").notNull().references(() => bizProfiles.id),
  taskName:       text("task_name").notNull(),
  taskType:       creditTaskTypeEnum("task_type").notNull(),
  provider:       text("provider"),
  url:            text("url"),
  status:         taskStatusEnum("status").notNull().default("pending"),
  dueDate:        date("due_date"),
  notes:          text("notes"),
  completedAt:    timestamp("completed_at"),
});

export const bizFundingMatches = pgTable("biz_funding_matches", {
  id:             serial("id").primaryKey(),
  bizProfileId:   integer("biz_profile_id").notNull().references(() => bizProfiles.id),
  funderName:     text("funder_name").notNull(),
  funderType:     funderTypeEnum("funder_type").notNull(),
  matchScore:     integer("match_score").notNull().default(0),
  amountRange:    text("amount_range"),
  applyUrl:       text("apply_url"),
  notes:          text("notes"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
});

export type BizProfile        = typeof bizProfiles.$inferSelect;
export type BizNameCheck      = typeof bizNameChecks.$inferSelect;
export type BizFormationLink  = typeof bizFormationLinks.$inferSelect;
export type BizBankLink       = typeof bizBankLinks.$inferSelect;
export type BizCreditTask     = typeof bizCreditTasks.$inferSelect;
export type BizFundingMatch   = typeof bizFundingMatches.$inferSelect;

