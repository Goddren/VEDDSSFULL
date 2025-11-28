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
