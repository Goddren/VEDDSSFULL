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
  referralCode: text("referral_code").unique(),
  referralCredits: integer("referral_credits").default(0),
  referredBy: integer("referred_by").references(() => users.id),
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
  isPublic: boolean("is_public").default(false),
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
});

export const insertChartAnalysisSchema = createInsertSchema(chartAnalyses).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

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
