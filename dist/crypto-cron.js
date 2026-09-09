var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc2) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc2 = __getOwnPropDesc(from, key)) || desc2.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/db.ts
var db_exports = {};
__export(db_exports, {
  client: () => client,
  db: () => db,
  pool: () => pool
});
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import pg from "pg";
var buildHeliumUrl, DATABASE_URL, isNeon, isSupabase, isSupabasePooler, isHelium, needsSsl, pool, client, db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    buildHeliumUrl = () => {
      const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD, PGPORT } = process.env;
      if (PGHOST && PGDATABASE && PGUSER && PGPASSWORD) {
        const port = PGPORT || "5432";
        return `postgresql://${PGUSER}:${encodeURIComponent(PGPASSWORD)}@${PGHOST}:${port}/${PGDATABASE}`;
      }
      return null;
    };
    DATABASE_URL = buildHeliumUrl() || process.env.DATABASE_URL || "postgres://localhost:5432/veddai";
    isNeon = DATABASE_URL.includes("neon.tech");
    isSupabase = DATABASE_URL.includes("supabase.co") || DATABASE_URL.includes("supabase.com");
    isSupabasePooler = DATABASE_URL.includes("pooler.supabase.com");
    isHelium = DATABASE_URL.includes("helium") || process.env.PGHOST && !DATABASE_URL.includes("neon.tech");
    needsSsl = isNeon || isSupabase || !DATABASE_URL.includes("localhost") && !isHelium;
    console.log(`[db] Connecting to: ${DATABASE_URL.replace(/:\/\/[^@]+@/, "://***@")}`);
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: needsSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 3e4,
      idleTimeoutMillis: 3e4,
      max: 10
    });
    pool.on("error", (err) => {
      console.error("[db] Pool error (non-fatal):", err.message);
    });
    client = postgres(DATABASE_URL, {
      ssl: needsSsl ? "require" : false,
      connect_timeout: 30,
      max: 10,
      idle_timeout: 30,
      max_lifetime: 1800,
      prepare: !isSupabasePooler
    });
    db = drizzle(client);
  }
});

// server/services/ensure-cryptocom-engine-tables.ts
var ensure_cryptocom_engine_tables_exports = {};
__export(ensure_cryptocom_engine_tables_exports, {
  ensureCryptocomEngineTables: () => ensureCryptocomEngineTables
});
async function ensureCryptocomEngineTables() {
  try {
    await pool.query(DDL);
    console.log("[startup] Crypto.com Engine tables ensured (cryptocom_engine_configs/activity/trades).");
  } catch (err) {
    console.error("[startup] ensureCryptocomEngineTables failed (non-fatal):", err?.message ?? err);
  }
}
var DDL;
var init_ensure_cryptocom_engine_tables = __esm({
  "server/services/ensure-cryptocom-engine-tables.ts"() {
    "use strict";
    init_db();
    DDL = `
CREATE TABLE IF NOT EXISTS "cryptocom_engine_configs" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id"),
  "is_active" boolean NOT NULL DEFAULT false,
  "symbols" jsonb NOT NULL DEFAULT '["BTCUSD-PERP","ETHUSD-PERP","SOLUSD-PERP"]',
  "scan_interval_ms" integer NOT NULL DEFAULT 120000,
  "strategy_mode" text NOT NULL DEFAULT 'auto',
  "direction_filter" text NOT NULL DEFAULT 'both',
  "max_open_trades" integer NOT NULL DEFAULT 3,
  "risk_per_trade" double precision NOT NULL DEFAULT 1.0,
  "min_confidence" double precision NOT NULL DEFAULT 70,
  "account_balance" double precision NOT NULL DEFAULT 1000,
  "leverage" double precision NOT NULL DEFAULT 3,
  "daily_loss_limit" double precision NOT NULL DEFAULT 5.0,
  "daily_profit_target" double precision NOT NULL DEFAULT 0,
  "max_daily_trades" integer NOT NULL DEFAULT 0,
  "lock_settings" boolean NOT NULL DEFAULT false,
  "ai_mode" text NOT NULL DEFAULT 'full',
  "enable_auto_execution" boolean NOT NULL DEFAULT false,
  "use_kelly_criterion" boolean NOT NULL DEFAULT false,
  "brain_learning_mode" boolean NOT NULL DEFAULT true,
  "drawdown_shield_threshold" double precision NOT NULL DEFAULT 3.0,
  "trail_method" text NOT NULL DEFAULT 'none',
  "trail_activation_r" double precision NOT NULL DEFAULT 1.0,
  "trail_fixed_r" double precision NOT NULL DEFAULT 0.5,
  "trail_step_r" double precision NOT NULL DEFAULT 0.5,
  "trail_profit_lock_pct" double precision NOT NULL DEFAULT 60,
  "trail_sar_initial_af" double precision NOT NULL DEFAULT 0.02,
  "trail_sar_max_af" double precision NOT NULL DEFAULT 0.20,
  "breakeven_buffer_r" double precision NOT NULL DEFAULT 0.1,
  "consistency_enforcement_enabled" boolean NOT NULL DEFAULT false,
  "consistency_min_profitable_days" integer NOT NULL DEFAULT 10,
  "consistency_period_days" integer NOT NULL DEFAULT 15,
  "max_daily_profit_pct_of_total" double precision NOT NULL DEFAULT 0,
  "smart_symbol_escalation" boolean NOT NULL DEFAULT false,
  "high_confidence_override" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "cryptocom_engine_activity" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "symbol" text NOT NULL,
  "decision" text NOT NULL,
  "reasoning" text NOT NULL,
  "score" double precision,
  "price" double precision,
  "daily_change_percent" double precision,
  "source" text NOT NULL DEFAULT 'cryptocom',
  "strategy" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "cryptocom_engine_trades" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "connection_id" integer NOT NULL,
  "symbol" text NOT NULL,
  "strategy" text NOT NULL,
  "direction" text NOT NULL,
  "quantity" double precision NOT NULL,
  "entry_price" double precision NOT NULL,
  "stop_loss" double precision,
  "take_profit" double precision,
  "entry_order_id" text,
  "entry_reasoning" text,
  "status" text NOT NULL DEFAULT 'open',
  "exit_price" double precision,
  "exit_order_id" text,
  "exit_reason" text,
  "realized_pnl" double precision,
  "closed_at" timestamp,
  "peak_r_multiple" double precision NOT NULL DEFAULT 0,
  "trail_armed" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Parity columns (composite entries, self-learning brain, ruin guard)
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "enable_composite_autonomous" boolean NOT NULL DEFAULT false;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "composite_min_edge_score" double precision NOT NULL DEFAULT 72;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "crypto_brain_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "crypto_brain_gating" boolean NOT NULL DEFAULT false;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "ruin_guard_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "daily_loss_limit_pct" double precision NOT NULL DEFAULT 5;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "max_drawdown_limit_pct" double precision NOT NULL DEFAULT 10;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "execution_venue" text NOT NULL DEFAULT 'cryptocom';
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "cefi_auto_trade_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "cefi_notional_usd" double precision NOT NULL DEFAULT 25;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "cefi_take_profit_pct" double precision NOT NULL DEFAULT 3;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "cefi_stop_loss_pct" double precision NOT NULL DEFAULT 2;
ALTER TABLE "cryptocom_engine_trades" ADD COLUMN IF NOT EXISTS "venue" text NOT NULL DEFAULT 'cryptocom';
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "defi_auto_trade_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "defi_chain" text NOT NULL DEFAULT 'base';
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "defi_notional_usd" double precision NOT NULL DEFAULT 25;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "defi_slippage_bps" integer NOT NULL DEFAULT 100;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "multi_venue_enabled" boolean NOT NULL DEFAULT false;
`;
  }
});

// shared/schema.ts
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, json, real, unique, doublePrecision, pgEnum, date, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var subscriptionPlans, aiUsageLog, users, chartAnalyses, tradingStrategies, spreadStrategies, insertUserSchema, loginUserSchema, updateUserProfileSchema, insertChartAnalysisSchema, achievements, userAchievements, insertAchievementSchema, insertUserAchievementSchema, userProfiles, follows, analysisFeedback, analysisViews, insertUserProfileSchema, insertFollowSchema, insertAnalysisFeedbackSchema, insertSubscriptionPlanSchema, referrals2, insertReferralSchema, referralVisits, insertReferralVisitSchema, dmKeywords, insertDmKeywordSchema, insertTradingStrategySchema, priceAlerts, insertPriceAlertSchema, savedEAs, eaSubscriptions, insertSavedEASchema, insertEASubscriptionSchema, marketDataSnapshots, insertMarketDataSnapshotSchema, marketDataRefreshJobs, insertMarketDataRefreshJobSchema, eaShareAssets, insertEAShareAssetSchema, userStreaks, insertUserStreakSchema, scenarioAnalyses, insertScenarioAnalysisSchema, webhookConfigs, insertWebhookConfigSchema, webhookLogs, insertWebhookLogSchema, mt5ApiTokens, insertMt5ApiTokenSchema, mt5SignalLogs, insertMt5SignalLogSchema, tradelockerConnections, insertTradelockerConnectionSchema, alpacaConnections, insertAlpacaConnectionSchema, tastytradeConnections, insertTastytradeConnectionSchema, cryptocomConnections, insertCryptocomConnectionSchema, cryptocomEngineConfigs, insertCryptocomEngineConfigSchema, cryptocomEngineActivity, cryptocomEngineTrades, insertCryptocomEngineTradeSchema, optionsEngineConfigs, insertOptionsEngineConfigSchema, liveEngineConfigs, optionsEngineActivity, insertOptionsEngineActivitySchema, optionsEngineTrades, insertOptionsEngineTradeSchema, tradelockerTradeLogs, insertTradelockerTradeLogSchema, tradovateConnections, insertTradovateConnectionSchema, tradovateTradeLogs, insertTradovateTradeLogSchema, futuresEngineConfigs, insertFuturesEngineConfigSchema, futuresEngineActivity, insertFuturesEngineActivitySchema, futuresEngineTrades, insertFuturesEngineTradeSchema, aiTradeResults, insertAiTradeResultSchema, TIER_CONFIG, ambassadorTrainingProgress, insertAmbassadorTrainingProgressSchema, ambassadorCertifications, insertAmbassadorCertificationSchema, governanceProposals, governanceVotes, insertGovernanceProposalSchema, insertGovernanceVoteSchema, ambassadorDailyLessons, ambassadorContentProgress, ambassadorContentStats, insertAmbassadorDailyLessonSchema, insertAmbassadorContentProgressSchema, insertAmbassadorContentStatsSchema, ambassadorSocialDirections, ambassadorChallenges, ambassadorChallengeParticipants, ambassadorEvents, ambassadorEventRegistrations, insertAmbassadorSocialDirectionSchema, insertAmbassadorChallengeSchema, insertAmbassadorChallengeParticipantSchema, insertAmbassadorEventSchema, insertAmbassadorEventRegistrationSchema, ambassadorChallengeSessions, ambassadorEventSchedules, ambassadorScheduleRegistrations, ambassadorCommunityComments, insertAmbassadorChallengeSessionSchema, insertAmbassadorEventScheduleSchema, insertAmbassadorScheduleRegistrationSchema, insertAmbassadorCommunityCommentSchema, veddPoolWallets, veddTransferJobs, veddWalletBlacklist, insertVeddWalletBlacklistSchema, ambassadorActionRewards, subscriptionTokenPayments, veddRewardConfig, insertVeddPoolWalletSchema, insertVeddTransferJobSchema, insertAmbassadorActionRewardSchema, insertSubscriptionTokenPaymentSchema, insertVeddRewardConfigSchema, internalWalletEarnings, internalWallets, withdrawalRequests, insertInternalWalletSchema, insertWithdrawalRequestSchema, connectedSocialAccounts, socialPosts, insertConnectedSocialAccountSchema, insertSocialPostSchema, tradingWallets, tokenPositions, tradingActivityLog, insertTradingWalletSchema, insertTokenPositionSchema, insertTradingActivityLogSchema, userApiKeys, insertUserApiKeySchema, weeklyStrategies, aiModelConfigs, insertAiModelConfigSchema, solEngineSettings, solEnginePositions, wearToEarnClaims, insertWearToEarnClaimSchema, nfcActivations, nfcDailyTaps, paperTrades, insertPaperTradeSchema, aiConfirmationOutcomes, insertAiConfirmationOutcomeSchema, aiConfirmationLogs, propFirmAccountState, propFirmDailyPnl, engineConsensusLog, microGrowthMilestones, microGrowthSessions, brainDataListings, brainDataPurchases, insertBrainDataListingSchema, insertBrainDataPurchaseSchema, grants, insertGrantSchema, grantApplications, insertGrantApplicationSchema, grantScanSessions, insertGrantScanSessionSchema, investmentPools, insertInvestmentPoolSchema, tokenInvestments, insertTokenInvestmentSchema, landingPageQuizzes, quizLeads, socialLeadScans, insertLandingPageQuizSchema, insertQuizLeadSchema, insertSocialLeadScanSchema, leads, leadHunterRuns, ambassadorDailyContent, ambassadorRedditInsights, ambassadorRunSummary, ambassadorWeeklyCalendar, ambassadorDailyKpis, ambassadorHookVariations, ambassadorBonusContent, ambassadorCommunityContent, ambassadorRunStepLog, contentStudioAssets, contentStudioGenerations, insertContentStudioGenerationSchema, ambassadorMarketBriefing, personaPillarRotation, personaArcState, personaContentDays, blogPosts, insertBlogPostSchema, blogNewsletterSubscribers, insertBlogNewsletterSubscriberSchema, ambassadorJourney, ambassadorDailyActions, insertAmbassadorJourneySchema, insertAmbassadorDailyActionSchema, devotionals, devotionalGroups, devotionalSessions, insertDevotionalSchema, insertDevotionalGroupSchema, insertDevotionalSessionSchema, workforceModules, workforceEnrollments, workforceCertificates, impactMetrics, communityPartnerships, auditLogs, biasReports, innovationProjects, insertWorkforceModuleSchema, insertWorkforceEnrollmentSchema, insertWorkforceCertificateSchema, workforceCourseProgress, insertImpactMetricSchema, insertCommunityPartnershipSchema, insertAuditLogSchema, insertBiasReportSchema, insertInnovationProjectSchema, stopOrders, insertStopOrderSchema, allTimeRecords, fxPaperAccounts, fxPaperTrades, insertFxPaperTradeSchema, copyRelationships, copyTradeLogs, engineRunState, kalshiEngineConfigs, kalshiBrainOutcomes, optionsBrainOutcomes, bizEntityTypeEnum, bizStatusEnum, nameCheckSourceEnum, formationProviderEnum, bankProviderEnum, creditTaskTypeEnum, taskStatusEnum, funderTypeEnum, bizProfiles, bizNameChecks, bizFormationLinks, bizBankLinks, bizCreditTasks, bizFundingMatches;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    subscriptionPlans = pgTable("subscription_plans", {
      id: serial("id").primaryKey(),
      name: text("name").notNull().unique(),
      description: text("description").notNull(),
      price: integer("price").notNull(),
      // Price in cents
      interval: text("interval").notNull().default("month"),
      // month, year, etc.
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
      aiMonthlyCostCapCents: integer("ai_monthly_cost_cap_cents").notNull().default(50)
    });
    aiUsageLog = pgTable("ai_usage_log", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").notNull(),
      provider: text("provider").notNull(),
      model: text("model").notNull(),
      promptTokens: integer("prompt_tokens").notNull().default(0),
      completionTokens: integer("completion_tokens").notNull().default(0),
      costCents: real("cost_cents").notNull().default(0),
      usedPlatformKey: boolean("used_platform_key").notNull().default(false),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    users = pgTable("users", {
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
      subscriptionStatus: text("subscription_status").default("none"),
      // none, active, trialing, past_due, canceled, unpaid
      subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
      monthlyAnalysisCount: integer("monthly_analysis_count").default(0),
      monthlySocialShareCount: integer("monthly_social_share_count").default(0),
      lastCountReset: timestamp("last_count_reset"),
      // Solana wallet integration
      walletAddress: text("wallet_address").unique(),
      // Solana wallet public key
      veddTokenBalance: real("vedd_token_balance").default(0),
      // VEDD token holdings
      isAmbassador: boolean("is_ambassador").default(false),
      // Has ambassador NFT
      ambassadorNftMint: text("ambassador_nft_mint"),
      // Ambassador NFT mint address
      tokenGatedSubscriptionEnd: timestamp("token_gated_subscription_end"),
      // 3-month free sub for token holders
      lastWalletSync: timestamp("last_wallet_sync"),
      // Last time wallet data was synced
      walletVerified: boolean("wallet_verified").default(false),
      // Has user signed message to verify wallet ownership
      isAdmin: boolean("is_admin").default(false),
      // Admin privileges for token pool management
      aiCostMode: text("ai_cost_mode").default("full"),
      // 'full' = best key, 'economy' = Groq free models
      membershipTier: text("membership_tier").default("none"),
      // none, basic, pro, elite - token-gated membership
      membershipNftMint: text("membership_nft_mint"),
      // VEDD membership NFT mint address for elite tier
      hasVeddNft: boolean("has_vedd_nft").default(false),
      // Holds a VEDD membership NFT
      breakoutModeEnabled: boolean("breakout_mode_enabled").default(false),
      // Breakout Master Mode for 2nd confirmation AI
      aiVisionEnabled: boolean("ai_vision_enabled").default(true),
      // AI 2nd-confirmation Vision system — ON by default
      trailingStopEnabled: boolean("trailing_stop_enabled").default(true),
      // Remove trailing stop from AI recommendations when false
      adaptiveRegimeEnabled: boolean("adaptive_regime_enabled").default(false),
      // Adaptive market-regime filter: sniper swaps BOS/CHOCH rules for range-reversal rules in ranging markets
      // faithBasedContent field temporarily removed due to database issues
      // Using localStorage instead of database column for faith-based content preferences
      referralCode: text("referral_code").unique(),
      referredBy: integer("referred_by"),
      referralCredits: integer("referral_credits").default(0),
      // Ambassador/referral credit balance
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    chartAnalyses = pgTable("chart_analyses", {
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
      multiTimeframeGroupId: text("multi_timeframe_group_id"),
      // Groups related timeframe analyses
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    tradingStrategies = pgTable("trading_strategies", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      groupId: text("group_id").notNull().unique(),
      // Links to multiTimeframeGroupId
      symbol: text("symbol").notNull(),
      platformType: text("platform_type").notNull(),
      // 'MT5' or 'TradingView'
      generatedCode: text("generated_code").notNull(),
      timeframes: jsonb("timeframes").notNull(),
      // Array of timeframes used
      entryConditions: text("entry_conditions"),
      exitConditions: text("exit_conditions"),
      riskManagement: jsonb("risk_management"),
      // Stop loss, take profit rules
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    spreadStrategies = pgTable("spread_strategies", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      groupId: text("group_id").notNull(),
      // Links to analysis group
      baseSymbol: text("base_symbol").notNull(),
      // Primary instrument (e.g., EUR/USD)
      hedgeSymbol: text("hedge_symbol").notNull(),
      // Secondary instrument (e.g., GBP/USD)
      spreadName: text("spread_name").notNull(),
      // Strategy name (e.g., EUR/GBP Pair Trade)
      spreadType: text("spread_type").notNull(),
      // 'convergence' | 'divergence' | 'momentum' | 'correlation'
      hedgeRatio: real("hedge_ratio").notNull(),
      // Ratio of hedge to base (e.g., 1.0 = 1:1, 0.5 = 1:2)
      correlation: real("correlation"),
      // Expected correlation between symbols
      platformType: text("platform_type").notNull(),
      // 'MT5' or 'TradingView'
      generatedCode: text("generated_code").notNull(),
      entryStrategy: jsonb("entry_strategy"),
      // Entry logic for both legs
      exitStrategy: jsonb("exit_strategy"),
      // Exit logic for both legs
      riskManagement: jsonb("risk_management"),
      // SL/TP for spread
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertUserSchema = createInsertSchema(users, {
      email: z.string().email("Invalid email address").optional(),
      fullName: z.string().optional(),
      profileImage: z.string().optional()
    }).pick({
      username: true,
      password: true,
      email: true,
      fullName: true,
      profileImage: true
    });
    loginUserSchema = z.object({
      username: z.string().min(3, "Username must be at least 3 characters"),
      password: z.string().min(6, "Password must be at least 6 characters")
    });
    updateUserProfileSchema = z.object({
      email: z.string().email("Invalid email address").optional(),
      fullName: z.string().optional(),
      profileImage: z.string().optional(),
      avatarUrl: z.string().optional(),
      bio: z.string().max(500, "Biography must be 500 characters or less").optional(),
      faithBasedContent: z.boolean().optional()
    });
    insertChartAnalysisSchema = createInsertSchema(chartAnalyses).omit({
      id: true,
      createdAt: true
    });
    achievements = pgTable("achievements", {
      id: serial("id").primaryKey(),
      name: text("name").notNull(),
      description: text("description").notNull(),
      category: text("category").notNull(),
      // 'analysis', 'consistency', 'accuracy', 'exploration'
      icon: text("icon").notNull(),
      points: integer("points").notNull().default(10),
      threshold: integer("threshold").notNull().default(1),
      // number required to unlock
      isSecret: boolean("is_secret").notNull().default(false)
    });
    userAchievements = pgTable("user_achievements", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      achievementId: integer("achievement_id").references(() => achievements.id).notNull(),
      unlockedAt: timestamp("unlocked_at").defaultNow(),
      progress: integer("progress").notNull().default(0),
      isCompleted: boolean("is_completed").notNull().default(false)
    });
    insertAchievementSchema = createInsertSchema(achievements).omit({
      id: true
    });
    insertUserAchievementSchema = createInsertSchema(userAchievements).omit({
      id: true,
      unlockedAt: true
    });
    userProfiles = pgTable("user_profiles", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      bio: text("bio"),
      city: text("city"),
      // Free-text city/zip — powers the Ambassador local-outreach to-do tasks (nearby venue templates, local-event prompts)
      propFirmReferralLink: text("prop_firm_referral_link"),
      // Ambassador's own prop-firm affiliate link (e.g. atlasfunded.com/?afmc=...) — used in the "host a prop firm setup event" flow
      tradingExperience: text("trading_experience"),
      // 'beginner', 'intermediate', 'advanced', 'expert'
      tradingStyle: text("trading_style"),
      // 'day', 'swing', 'position', 'scalping'
      preferredMarkets: jsonb("preferred_markets"),
      // Array of markets: forex, stocks, crypto, etc.
      tradeGrade: real("trade_grade").default(0),
      // 0-100 score based on trade accuracy
      winRate: real("win_rate").default(0),
      // Percentage of winning trades
      followers: integer("followers").default(0),
      following: integer("following").default(0),
      socialLinks: jsonb("social_links"),
      // Object with social media links
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    follows = pgTable("follows", {
      id: serial("id").primaryKey(),
      followerId: integer("follower_id").references(() => users.id).notNull(),
      followingId: integer("following_id").references(() => users.id).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => {
      return {
        uniqueFollow: unique().on(table.followerId, table.followingId)
      };
    });
    analysisFeedback = pgTable("analysis_feedback", {
      id: serial("id").primaryKey(),
      analysisId: integer("analysis_id").references(() => chartAnalyses.id).notNull(),
      userId: integer("user_id").references(() => users.id).notNull(),
      feedbackType: text("feedback_type").notNull(),
      // 'like', 'dislike', 'save'
      comment: text("comment"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => {
      return {
        uniqueFeedback: unique().on(table.analysisId, table.userId, table.feedbackType)
      };
    });
    analysisViews = pgTable("analysis_views", {
      id: serial("id").primaryKey(),
      analysisId: integer("analysis_id").references(() => chartAnalyses.id).notNull(),
      userId: integer("user_id").references(() => users.id).notNull(),
      viewedAt: timestamp("viewed_at").defaultNow().notNull()
    });
    insertUserProfileSchema = createInsertSchema(userProfiles).omit({
      id: true,
      createdAt: true,
      updatedAt: true,
      followers: true,
      following: true,
      tradeGrade: true,
      winRate: true
    });
    insertFollowSchema = createInsertSchema(follows).omit({
      id: true,
      createdAt: true
    });
    insertAnalysisFeedbackSchema = createInsertSchema(analysisFeedback).omit({
      id: true,
      createdAt: true
    });
    insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
      id: true,
      createdAt: true
    });
    referrals2 = pgTable("referrals", {
      id: serial("id").primaryKey(),
      referrerId: integer("referrer_id").references(() => users.id).notNull(),
      referredId: integer("referred_id").references(() => users.id).notNull(),
      status: text("status").notNull().default("pending"),
      // pending, completed, credited
      creditAmount: integer("credit_amount").notNull().default(500),
      // 500 credits as default reward
      createdAt: timestamp("created_at").defaultNow().notNull(),
      completedAt: timestamp("completed_at")
    });
    insertReferralSchema = createInsertSchema(referrals2).omit({
      id: true,
      createdAt: true,
      completedAt: true
    });
    referralVisits = pgTable("referral_visits", {
      id: serial("id").primaryKey(),
      referralCode: text("referral_code").notNull(),
      referrerId: integer("referrer_id").references(() => users.id),
      visitorId: integer("visitor_id").references(() => users.id),
      // set when they register
      visitorIp: text("visitor_ip"),
      userAgent: text("user_agent"),
      visitedAt: timestamp("visited_at").defaultNow().notNull(),
      signedUp: boolean("signed_up").default(false),
      signedUpAt: timestamp("signed_up_at"),
      subscribed: boolean("subscribed").default(false),
      subscribedAt: timestamp("subscribed_at"),
      reminderSent: boolean("reminder_sent").default(false),
      reminderSentAt: timestamp("reminder_sent_at")
    });
    insertReferralVisitSchema = createInsertSchema(referralVisits).omit({ id: true, visitedAt: true });
    dmKeywords = pgTable("dm_keywords", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      keyword: text("keyword").notNull(),
      responseTemplate: text("response_template").notNull(),
      platform: text("platform").default("all"),
      // 'instagram'|'twitter'|'facebook'|'tiktok'|'all'
      isActive: boolean("is_active").default(true),
      triggerCount: integer("trigger_count").default(0),
      lastTriggeredAt: timestamp("last_triggered_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertDmKeywordSchema = createInsertSchema(dmKeywords).omit({ id: true, createdAt: true, updatedAt: true });
    insertTradingStrategySchema = createInsertSchema(tradingStrategies).omit({
      id: true,
      createdAt: true
    });
    priceAlerts = pgTable("price_alerts", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      symbol: text("symbol").notNull(),
      alertType: text("alert_type").notNull(),
      // 'price_above', 'price_below', 'pattern_detected', 'trend_change'
      targetPrice: text("target_price"),
      // Target price for price alerts
      currentPrice: text("current_price"),
      message: text("message").notNull(),
      isActive: boolean("is_active").notNull().default(true),
      isTriggered: boolean("is_triggered").notNull().default(false),
      triggeredAt: timestamp("triggered_at"),
      notificationSent: boolean("notification_sent").notNull().default(false),
      metadata: jsonb("metadata"),
      // Additional data like pattern type, confidence, etc.
      createdAt: timestamp("created_at").defaultNow().notNull(),
      expiresAt: timestamp("expires_at")
      // Optional expiration date
    });
    insertPriceAlertSchema = createInsertSchema(priceAlerts).omit({
      id: true,
      createdAt: true,
      triggeredAt: true
    });
    savedEAs = pgTable("saved_eas", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      name: text("name").notNull(),
      description: text("description"),
      platformType: text("platform_type").notNull(),
      // 'MT5', 'TradingView', 'TradeLocker'
      eaCode: text("ea_code").notNull(),
      symbol: text("symbol").notNull(),
      strategyType: text("strategy_type"),
      direction: text("direction"),
      // BUY, SELL, or NEUTRAL - the trade direction from analysis
      confidence: text("confidence"),
      // Confidence percentage from analysis
      entryPoint: text("entry_point"),
      // Entry price from analysis
      stopLoss: text("stop_loss"),
      // Stop loss from analysis
      takeProfit: text("take_profit"),
      // Take profit from analysis
      chartAnalysisData: jsonb("chart_analysis_data"),
      // Full analysis summary for share card
      multiTimeframeGroupId: text("multi_timeframe_group_id"),
      // Links to multi-timeframe analyses
      refreshVolatilityThreshold: integer("refresh_volatility_threshold").default(30),
      // % volatility change to trigger refresh
      refreshAtrThreshold: integer("refresh_atr_threshold").default(20),
      // % ATR change to trigger refresh
      refreshPriceThreshold: integer("refresh_price_threshold").default(2),
      // % price change to trigger refresh
      // Risk Management Settings
      volume: real("volume").default(0.01),
      // Fixed lot size
      useRiskPercent: boolean("use_risk_percent").default(true),
      // Use risk % instead of fixed lot
      riskPercent: real("risk_percent").default(0.25),
      // Risk per trade as % of balance
      maxOpenTrades: integer("max_open_trades").default(1),
      // Max positions open at once
      dailyLossLimit: real("daily_loss_limit").default(0),
      // Daily loss limit in $ (0=disabled)
      minConfidence: integer("min_confidence").default(65),
      // Minimum confidence % to trigger trade
      tradeCooldownMinutes: integer("trade_cooldown_minutes").default(5),
      // Minutes between trades on same symbol
      liveRefreshEnabled: boolean("live_refresh_enabled").default(false),
      // Enable live chart refresh
      isShared: boolean("is_shared").default(false),
      price: integer("price"),
      // Price in cents, null if not shared
      shareCount: integer("share_count").default(0),
      stripeProductId: text("stripe_product_id"),
      stripePriceId: text("stripe_price_id"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    eaSubscriptions = pgTable("ea_subscriptions", {
      id: serial("id").primaryKey(),
      eaId: integer("ea_id").references(() => savedEAs.id).notNull(),
      creatorId: integer("creator_id").references(() => users.id).notNull(),
      subscriberId: integer("subscriber_id").references(() => users.id).notNull(),
      status: text("status").notNull().default("active"),
      // active, canceled, expired
      stripeSubscriptionId: text("stripe_subscription_id"),
      startDate: timestamp("start_date").defaultNow().notNull(),
      endDate: timestamp("end_date"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => {
      return {
        uniqueSubscription: unique().on(table.eaId, table.subscriberId)
      };
    });
    insertSavedEASchema = createInsertSchema(savedEAs).omit({
      id: true,
      shareCount: true,
      createdAt: true,
      updatedAt: true,
      stripeProductId: true,
      stripePriceId: true
    });
    insertEASubscriptionSchema = createInsertSchema(eaSubscriptions).omit({
      id: true,
      createdAt: true,
      startDate: true,
      endDate: true
    });
    marketDataSnapshots = pgTable("market_data_snapshots", {
      id: serial("id").primaryKey(),
      symbol: text("symbol").notNull(),
      assetType: text("asset_type").notNull(),
      // 'forex', 'stock', 'crypto', 'index'
      timeframe: text("timeframe").notNull(),
      // '1m', '5m', '15m', '1h', '4h', '1d'
      provider: text("provider").notNull(),
      data: jsonb("data").notNull(),
      // OHLCV bars array
      hash: text("hash").notNull(),
      // Hash for change detection
      capturedAt: timestamp("captured_at").defaultNow().notNull()
    });
    insertMarketDataSnapshotSchema = createInsertSchema(marketDataSnapshots).omit({
      id: true,
      capturedAt: true
    });
    marketDataRefreshJobs = pgTable("market_data_refresh_jobs", {
      id: serial("id").primaryKey(),
      eaId: integer("ea_id").references(() => savedEAs.id).notNull(),
      status: text("status").notNull().default("pending"),
      // 'pending', 'processing', 'completed', 'failed'
      triggeredBy: text("triggered_by").notNull(),
      // 'manual', 'scheduled', 'pattern_change'
      changeSummary: jsonb("change_summary"),
      // Pattern change details
      newDirection: text("new_direction"),
      newConfidence: text("new_confidence"),
      error: text("error"),
      triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
      completedAt: timestamp("completed_at")
    });
    insertMarketDataRefreshJobSchema = createInsertSchema(marketDataRefreshJobs).omit({
      id: true,
      triggeredAt: true,
      completedAt: true
    });
    eaShareAssets = pgTable("ea_share_assets", {
      id: serial("id").primaryKey(),
      eaId: integer("ea_id").references(() => savedEAs.id).notNull(),
      userId: integer("user_id").references(() => users.id).notNull(),
      shareCardUrl: text("share_card_url"),
      // URL to generated share card image
      chartAnalyses: jsonb("chart_analyses").notNull(),
      // Array of chart analysis summaries
      unifiedSignal: jsonb("unified_signal"),
      // Combined trade signal data
      devotionId: integer("devotion_id"),
      // Index of the scripture used
      devotionVerse: text("devotion_verse"),
      devotionReference: text("devotion_reference"),
      devotionWisdom: text("devotion_wisdom"),
      shareUrl: text("share_url"),
      // Public share URL
      viewCount: integer("view_count").default(0),
      shareCount: integer("share_count").default(0),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertEAShareAssetSchema = createInsertSchema(eaShareAssets).omit({
      id: true,
      viewCount: true,
      shareCount: true,
      createdAt: true,
      updatedAt: true
    });
    userStreaks = pgTable("user_streaks", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      currentStreak: integer("current_streak").notNull().default(0),
      longestStreak: integer("longest_streak").notNull().default(0),
      lastActivityDate: timestamp("last_activity_date"),
      totalChartsAnalyzed: integer("total_charts_analyzed").notNull().default(0),
      totalEAsCreated: integer("total_eas_created").notNull().default(0),
      totalTrades: integer("total_trades").notNull().default(0),
      tier: text("tier").notNull().default("YG"),
      // YG, Rising, Pro, Elite, OG
      tierProgress: integer("tier_progress").notNull().default(0),
      // Progress to next tier (0-100)
      xpPoints: integer("xp_points").notNull().default(0),
      weeklyChartsAnalyzed: integer("weekly_charts_analyzed").notNull().default(0),
      weeklyEAsCreated: integer("weekly_eas_created").notNull().default(0),
      weekStartDate: timestamp("week_start_date"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertUserStreakSchema = createInsertSchema(userStreaks).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    scenarioAnalyses = pgTable("scenario_analyses", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      chartAnalysisId: integer("chart_analysis_id").references(() => chartAnalyses.id),
      symbol: text("symbol").notNull(),
      currentPrice: text("current_price").notNull(),
      scenarioType: text("scenario_type").notNull(),
      // 'price_target', 'stop_loss', 'news_impact', 'timeframe', 'market_condition'
      scenarioParams: jsonb("scenario_params").notNull(),
      // Input parameters for the scenario
      outcomes: jsonb("outcomes").notNull(),
      // Array of possible outcomes with probabilities
      recommendation: text("recommendation"),
      riskAssessment: text("risk_assessment"),
      profitPotential: text("profit_potential"),
      bestCase: jsonb("best_case"),
      // Best case scenario details
      worstCase: jsonb("worst_case"),
      // Worst case scenario details
      mostLikely: jsonb("most_likely"),
      // Most likely scenario details
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertScenarioAnalysisSchema = createInsertSchema(scenarioAnalyses).omit({
      id: true,
      createdAt: true
    });
    webhookConfigs = pgTable("webhook_configs", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      name: text("name").notNull(),
      // User-friendly name (e.g., "TradeLocker Signals")
      url: text("url").notNull(),
      // Webhook endpoint URL
      platform: text("platform").notNull(),
      // 'tradelocker', 'tradingview', 'custom'
      isActive: boolean("is_active").notNull().default(true),
      triggerOn: jsonb("trigger_on").notNull(),
      // Array: ['analysis', 'synthesis', 'ea_signal']
      signalFormat: text("signal_format").notNull().default("json"),
      // 'json', 'tradingview', 'custom'
      customPayloadTemplate: text("custom_payload_template"),
      // Custom JSON template with placeholders
      secretKey: text("secret_key"),
      // Optional secret for webhook verification
      headers: jsonb("headers"),
      // Custom headers (e.g., { "Authorization": "Bearer xxx" })
      lastTriggeredAt: timestamp("last_triggered_at"),
      lastStatus: text("last_status"),
      // 'success', 'failed', 'pending'
      failureCount: integer("failure_count").notNull().default(0),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertWebhookConfigSchema = createInsertSchema(webhookConfigs).omit({
      id: true,
      lastTriggeredAt: true,
      lastStatus: true,
      failureCount: true,
      createdAt: true,
      updatedAt: true
    });
    webhookLogs = pgTable("webhook_logs", {
      id: serial("id").primaryKey(),
      webhookId: integer("webhook_id").references(() => webhookConfigs.id).notNull(),
      userId: integer("user_id").references(() => users.id).notNull(),
      triggerType: text("trigger_type").notNull(),
      // 'analysis', 'synthesis', 'ea_signal'
      payload: jsonb("payload").notNull(),
      // The actual payload sent
      responseStatus: integer("response_status"),
      // HTTP status code
      responseBody: text("response_body"),
      // Response from the webhook endpoint
      status: text("status").notNull(),
      // 'success', 'failed', 'pending'
      errorMessage: text("error_message"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertWebhookLogSchema = createInsertSchema(webhookLogs).omit({
      id: true,
      createdAt: true
    });
    mt5ApiTokens = pgTable("mt5_api_tokens", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      token: text("token").notNull().unique(),
      // Secure random token
      name: text("name").notNull(),
      // User-friendly name (e.g., "My MT5 Account")
      isActive: boolean("is_active").notNull().default(true),
      lastUsedAt: timestamp("last_used_at"),
      signalCount: integer("signal_count").notNull().default(0),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertMt5ApiTokenSchema = createInsertSchema(mt5ApiTokens).omit({
      id: true,
      token: true,
      lastUsedAt: true,
      signalCount: true,
      createdAt: true
    });
    mt5SignalLogs = pgTable("mt5_signal_logs", {
      id: serial("id").primaryKey(),
      tokenId: integer("token_id").references(() => mt5ApiTokens.id),
      userId: integer("user_id").references(() => users.id).notNull(),
      action: text("action").notNull(),
      // 'OPEN', 'CLOSE', 'MODIFY'
      symbol: text("symbol").notNull(),
      direction: text("direction").notNull(),
      // 'BUY', 'SELL'
      volume: real("volume").notNull(),
      entryPrice: real("entry_price"),
      stopLoss: real("stop_loss"),
      takeProfit: real("take_profit"),
      ticket: text("ticket"),
      // MT5 ticket number
      source: text("source"),
      // 'mt5_ea', 'vedd_live_engine', etc.
      confidence: real("confidence"),
      relayedToWebhooks: boolean("relayed_to_webhooks").notNull().default(false),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertMt5SignalLogSchema = createInsertSchema(mt5SignalLogs).omit({
      id: true,
      createdAt: true
    });
    tradelockerConnections = pgTable("tradelocker_connections", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      email: text("email").notNull(),
      encryptedPassword: text("encrypted_password").notNull(),
      // Encrypted password
      serverId: text("server_id").notNull(),
      // e.g., "FE2024"
      accountId: text("account_id").notNull(),
      // e.g., "1556546"
      accountType: text("account_type").notNull().default("live"),
      // 'demo' or 'live'
      isActive: boolean("is_active").notNull().default(true),
      autoExecute: boolean("auto_execute").notNull().default(false),
      // Auto-execute MT5 signals
      accNum: text("acc_num"),
      // Cached TradeLocker account number for API calls
      accessToken: text("access_token"),
      // Cached JWT token
      refreshToken: text("refresh_token"),
      // Refresh token
      tokenExpiresAt: timestamp("token_expires_at"),
      lastConnectedAt: timestamp("last_connected_at"),
      lastError: text("last_error"),
      tradeCount: integer("trade_count").notNull().default(0),
      lotMultiplier: doublePrecision("lot_multiplier").notNull().default(1),
      // Per-account lot size multiplier (0.1–5.0)
      gateMode: text("gate_mode").notNull().default("basic"),
      // 'basic' = original EA permissive mode (70%) | 'full' = strict gates (74%+brain+HTF)
      brokerName: text("broker_name"),
      // Human-readable broker name derived from serverId (e.g. "Atlas", "FTUK")
      useRiskPercent: boolean("use_risk_percent").notNull().default(false),
      // Size by % of this account's equity instead of copying source lot
      riskPercent: doublePrecision("risk_percent").notNull().default(1),
      // % of equity to risk per trade when useRiskPercent=true
      isPropFirmAccount: boolean("is_prop_firm_account").notNull().default(false),
      // Mark this TL account as a prop-firm/funded account
      propFirmName: text("prop_firm_name"),
      // e.g. "Topstep", "FTMO", "FundedNext", "The Funded Trader"
      propFirmAccountSize: doublePrecision("prop_firm_account_size"),
      // Funded account size in $ (for drawdown/target math)
      weeklyProfitTarget: doublePrecision("weekly_profit_target"),
      // Per-account profit goal ($), null = not set — distinct from the global weeklyStrategies target which is shared across every account
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertTradelockerConnectionSchema = createInsertSchema(tradelockerConnections).omit({
      id: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      lastConnectedAt: true,
      lastError: true,
      tradeCount: true,
      createdAt: true,
      updatedAt: true
    });
    alpacaConnections = pgTable("alpaca_connections", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      apiKeyId: text("api_key_id").notNull(),
      encryptedApiSecret: text("encrypted_api_secret").notNull(),
      accountType: text("account_type").notNull().default("paper"),
      // 'paper' or 'live'
      isActive: boolean("is_active").notNull().default(true),
      autoExecute: boolean("auto_execute").notNull().default(false),
      accountId: text("account_id"),
      // Alpaca account number, resolved after first successful auth
      lastConnectedAt: timestamp("last_connected_at"),
      lastError: text("last_error"),
      tradeCount: integer("trade_count").notNull().default(0),
      useRiskPercent: boolean("use_risk_percent").notNull().default(true),
      riskPercent: doublePrecision("risk_percent").notNull().default(1),
      isPropFirmAccount: boolean("is_prop_firm_account").notNull().default(false),
      propFirmName: text("prop_firm_name"),
      propFirmAccountSize: doublePrecision("prop_firm_account_size"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertAlpacaConnectionSchema = createInsertSchema(alpacaConnections).omit({
      id: true,
      lastConnectedAt: true,
      lastError: true,
      tradeCount: true,
      createdAt: true,
      updatedAt: true
    });
    tastytradeConnections = pgTable("tastytrade_connections", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      username: text("username").notNull(),
      encryptedPassword: text("encrypted_password").notNull(),
      accountType: text("account_type").notNull().default("sandbox"),
      // 'sandbox' or 'live'
      isActive: boolean("is_active").notNull().default(true),
      autoExecute: boolean("auto_execute").notNull().default(false),
      accountNumber: text("account_number"),
      // resolved after first successful auth
      sessionToken: text("session_token"),
      tokenExpiresAt: timestamp("token_expires_at"),
      lastConnectedAt: timestamp("last_connected_at"),
      lastError: text("last_error"),
      tradeCount: integer("trade_count").notNull().default(0),
      useRiskPercent: boolean("use_risk_percent").notNull().default(true),
      riskPercent: doublePrecision("risk_percent").notNull().default(1),
      isPropFirmAccount: boolean("is_prop_firm_account").notNull().default(false),
      propFirmName: text("prop_firm_name"),
      propFirmAccountSize: doublePrecision("prop_firm_account_size"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertTastytradeConnectionSchema = createInsertSchema(tastytradeConnections).omit({
      id: true,
      sessionToken: true,
      tokenExpiresAt: true,
      lastConnectedAt: true,
      lastError: true,
      tradeCount: true,
      createdAt: true,
      updatedAt: true
    });
    cryptocomConnections = pgTable("cryptocom_connections", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      apiKey: text("api_key").notNull(),
      encryptedApiSecret: text("encrypted_api_secret").notNull(),
      isActive: boolean("is_active").notNull().default(true),
      autoExecute: boolean("auto_execute").notNull().default(false),
      instrumentType: text("instrument_type").notNull().default("perpetual"),
      // 'perpetual' | 'future' | 'option'
      useRiskPercent: boolean("use_risk_percent").notNull().default(true),
      riskPercent: doublePrecision("risk_percent").notNull().default(1),
      lastConnectedAt: timestamp("last_connected_at"),
      lastError: text("last_error"),
      tradeCount: integer("trade_count").notNull().default(0),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertCryptocomConnectionSchema = createInsertSchema(cryptocomConnections).omit({
      id: true,
      lastConnectedAt: true,
      lastError: true,
      tradeCount: true,
      createdAt: true,
      updatedAt: true
    });
    cryptocomEngineConfigs = pgTable("cryptocom_engine_configs", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      isActive: boolean("is_active").notNull().default(false),
      symbols: jsonb("symbols").notNull().default(["BTCUSD-PERP", "ETHUSD-PERP", "SOLUSD-PERP"]),
      scanIntervalMs: integer("scan_interval_ms").notNull().default(12e4),
      strategyMode: text("strategy_mode").notNull().default("auto"),
      // 'auto' | 'trend_following' | 'momentum' | 'order_flow'
      directionFilter: text("direction_filter").notNull().default("both"),
      // 'long_only' | 'short_only' | 'both'
      maxOpenTrades: integer("max_open_trades").notNull().default(3),
      riskPerTrade: doublePrecision("risk_per_trade").notNull().default(1),
      minConfidence: doublePrecision("min_confidence").notNull().default(70),
      accountBalance: doublePrecision("account_balance").notNull().default(1e3),
      leverage: doublePrecision("leverage").notNull().default(3),
      dailyLossLimit: doublePrecision("daily_loss_limit").notNull().default(5),
      dailyProfitTarget: doublePrecision("daily_profit_target").notNull().default(0),
      maxDailyTrades: integer("max_daily_trades").notNull().default(0),
      lockSettings: boolean("lock_settings").notNull().default(false),
      aiMode: text("ai_mode").notNull().default("full"),
      // 'full' | 'economy' | 'rule_based'
      enableAutoExecution: boolean("enable_auto_execution").notNull().default(false),
      // ── FX SS AI Engine parity ──────────────────────────────────────────────
      useKellyCriterion: boolean("use_kelly_criterion").notNull().default(false),
      brainLearningMode: boolean("brain_learning_mode").notNull().default(true),
      drawdownShieldThreshold: doublePrecision("drawdown_shield_threshold").notNull().default(3),
      trailMethod: text("trail_method").notNull().default("none"),
      // same R-multiple methods as futuresEngineConfigs
      trailActivationR: doublePrecision("trail_activation_r").notNull().default(1),
      trailFixedR: doublePrecision("trail_fixed_r").notNull().default(0.5),
      trailStepR: doublePrecision("trail_step_r").notNull().default(0.5),
      trailProfitLockPct: doublePrecision("trail_profit_lock_pct").notNull().default(60),
      trailSarInitialAF: doublePrecision("trail_sar_initial_af").notNull().default(0.02),
      trailSarMaxAF: doublePrecision("trail_sar_max_af").notNull().default(0.2),
      breakevenBufferR: doublePrecision("breakeven_buffer_r").notNull().default(0.1),
      consistencyEnforcementEnabled: boolean("consistency_enforcement_enabled").notNull().default(false),
      consistencyMinProfitableDays: integer("consistency_min_profitable_days").notNull().default(10),
      consistencyPeriodDays: integer("consistency_period_days").notNull().default(15),
      maxDailyProfitPctOfTotal: doublePrecision("max_daily_profit_pct_of_total").notNull().default(0),
      smartSymbolEscalation: boolean("smart_symbol_escalation").notNull().default(false),
      highConfidenceOverride: boolean("high_confidence_override").notNull().default(false),
      // ── Parity with the FX/Kalshi/Options engines ─────────────────────────────
      enableCompositeAutonomous: boolean("enable_composite_autonomous").notNull().default(false),
      // trade the multi-strategy consensus when no single strategy clears its bar
      compositeMinEdgeScore: doublePrecision("composite_min_edge_score").notNull().default(72),
      cryptoBrainEnabled: boolean("crypto_brain_enabled").notNull().default(true),
      // self-learning brain reweights sizing (bounded); learning always records
      cryptoBrainGating: boolean("crypto_brain_gating").notNull().default(false),
      // opt-in: hard-block symbols/strategies/hours the brain proved lose
      ruinGuardEnabled: boolean("ruin_guard_enabled").notNull().default(false),
      // hard circuit breaker (halts new trades) vs the drawdown-shield down-size
      dailyLossLimitPct: doublePrecision("daily_loss_limit_pct").notNull().default(5),
      maxDrawdownLimitPct: doublePrecision("max_drawdown_limit_pct").notNull().default(10),
      // ── Multi-venue execution routing ─────────────────────────────────────────
      // Where the engine places its signals. 'cryptocom' = the existing perp path;
      // 'coinbase'/'kraken'/'gemini' = spot (long-only) via the CeFi router. Spot
      // routing requires cefiAutoTradeEnabled (explicit opt-in) + a connected key.
      executionVenue: text("execution_venue").notNull().default("cryptocom"),
      // 'cryptocom' | 'coinbase' | 'kraken' | 'gemini' | 'defi'
      cefiAutoTradeEnabled: boolean("cefi_auto_trade_enabled").notNull().default(false),
      cefiNotionalUsd: doublePrecision("cefi_notional_usd").notNull().default(25),
      // USD per spot entry on a CeFi venue
      cefiTakeProfitPct: doublePrecision("cefi_take_profit_pct").notNull().default(3),
      // spot exit: +% from entry
      cefiStopLossPct: doublePrecision("cefi_stop_loss_pct").notNull().default(2),
      // spot exit: -% from entry
      // ── DeFi hot-wallet auto-trade (Phase B) — unattended on-chain swaps via 0x ──
      // Long-only spot: USDC -> token on entry, token -> USDC on exit. Requires a
      // connected hot wallet (defi_hot_wallets) + ZEROX_API_KEY + explicit opt-in.
      defiAutoTradeEnabled: boolean("defi_auto_trade_enabled").notNull().default(false),
      defiChain: text("defi_chain").notNull().default("base"),
      defiNotionalUsd: doublePrecision("defi_notional_usd").notNull().default(25),
      // USD (USDC) per swap entry
      defiSlippageBps: integer("defi_slippage_bps").notNull().default(100),
      // 100 = 1%
      // ── Multi-venue fan-out ──────────────────────────────────────────────────
      // When true, a confirmed signal fires on EVERY connected+enabled rail at
      // once (Crypto.com perps + DeFi hot wallet + any connected CeFi spot
      // exchange) instead of only the single executionVenue. Perps take long+short;
      // spot/DeFi take the long side only. Off = legacy single-venue routing.
      multiVenueEnabled: boolean("multi_venue_enabled").notNull().default(false),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertCryptocomEngineConfigSchema = createInsertSchema(cryptocomEngineConfigs).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    cryptocomEngineActivity = pgTable("cryptocom_engine_activity", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      symbol: text("symbol").notNull(),
      decision: text("decision").notNull(),
      // 'watching' | 'signal' | 'skipped' | 'error'
      reasoning: text("reasoning").notNull(),
      score: doublePrecision("score"),
      price: doublePrecision("price"),
      dailyChangePercent: doublePrecision("daily_change_percent"),
      source: text("source").notNull().default("cryptocom"),
      strategy: text("strategy"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    cryptocomEngineTrades = pgTable("cryptocom_engine_trades", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      connectionId: integer("connection_id").notNull(),
      venue: text("venue").notNull().default("cryptocom"),
      // 'cryptocom' | 'coinbase' | 'kraken' | 'gemini'
      symbol: text("symbol").notNull(),
      strategy: text("strategy").notNull(),
      direction: text("direction").notNull(),
      // 'long' | 'short'
      quantity: doublePrecision("quantity").notNull(),
      entryPrice: doublePrecision("entry_price").notNull(),
      stopLoss: doublePrecision("stop_loss"),
      takeProfit: doublePrecision("take_profit"),
      entryOrderId: text("entry_order_id"),
      entryReasoning: text("entry_reasoning"),
      status: text("status").notNull().default("open"),
      // 'open' | 'closed' | 'failed'
      exitPrice: doublePrecision("exit_price"),
      exitOrderId: text("exit_order_id"),
      exitReason: text("exit_reason"),
      realizedPnl: doublePrecision("realized_pnl"),
      closedAt: timestamp("closed_at"),
      peakRMultiple: doublePrecision("peak_r_multiple").notNull().default(0),
      trailArmed: boolean("trail_armed").notNull().default(false),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertCryptocomEngineTradeSchema = createInsertSchema(cryptocomEngineTrades).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    optionsEngineConfigs = pgTable("options_engine_configs", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      isActive: boolean("is_active").notNull().default(false),
      symbols: jsonb("symbols").notNull().default(["SPY", "QQQ", "AAPL", "TSLA", "NVDA"]),
      // underlying tickers to scan
      scanIntervalMs: integer("scan_interval_ms").notNull().default(6e4),
      strategyMode: text("strategy_mode").notNull().default("auto"),
      // 'auto' | 'orb' | 'volume_profile' | 'breakout' | 'momentum' | 'order_flow' | 'covered_call' | 'credit_spread' | 'long_call' | 'long_put'
      singleStrategyMode: boolean("single_strategy_mode").notNull().default(false),
      // when true, only strategyMode fires — no mixing
      directionFilter: text("direction_filter").notNull().default("both"),
      // 'calls_only' | 'puts_only' | 'both'
      maxOpenPositions: integer("max_open_positions").notNull().default(3),
      maxContractsPerTrade: integer("max_contracts_per_trade").notNull().default(1),
      riskPerTrade: doublePrecision("risk_per_trade").notNull().default(1),
      // % of account equity risked per trade
      minConfidence: doublePrecision("min_confidence").notNull().default(70),
      // min AI confidence score (0-100) to fire a signal
      weeklyProfitTarget: doublePrecision("weekly_profit_target").notNull().default(5),
      accountBalance: doublePrecision("account_balance").notNull().default(0),
      enableCompounding: boolean("enable_compounding").notNull().default(false),
      propFirmMode: boolean("prop_firm_mode").notNull().default(false),
      propFirmDailyDrawdownLimit: doublePrecision("prop_firm_daily_drawdown_limit").notNull().default(4),
      dailyLossLimit: doublePrecision("daily_loss_limit").notNull().default(5),
      // % of account, 0 = disabled
      dailyProfitTarget: doublePrecision("daily_profit_target").notNull().default(0),
      // % of account, 0 = disabled
      maxDailyTrades: integer("max_daily_trades").notNull().default(0),
      // 0 = unlimited
      executionSource: text("execution_source").notNull().default("auto"),
      // 'alpaca' | 'tastytrade' | 'auto'
      lockSettings: boolean("lock_settings").notNull().default(false),
      // ── Options-native settings (no FX/lots equivalent — these replace pip/lot ──
      // ── concepts with strike/expiry/premium concepts specific to options) ──────
      expiryPreference: text("expiry_preference").notNull().default("auto"),
      // '0dte' | 'weekly' | 'monthly' | 'auto'
      minDaysToExpiry: integer("min_days_to_expiry").notNull().default(2),
      // was 1 — 0-1 DTE long premium bled (29% win); 2-7 DTE is the profitable band
      maxDaysToExpiry: integer("max_days_to_expiry").notNull().default(14),
      // was 45 — 30+ DTE long calls lost (21% win); keep entries in the theta sweet spot
      strikeSelectionMode: text("strike_selection_mode").notNull().default("atm"),
      // 'atm' | 'itm' | 'otm' | 'delta_target'
      targetDelta: doublePrecision("target_delta").notNull().default(0.3),
      // used when strikeSelectionMode = 'delta_target'
      profitTargetPercent: doublePrecision("profit_target_percent").notNull().default(50),
      // close at +X% of premium paid
      stopLossPercent: doublePrecision("stop_loss_percent").notNull().default(50),
      // close at -X% of premium paid
      ivRankMax: doublePrecision("iv_rank_max").notNull().default(80),
      // skip entries when IV rank exceeds this (expensive premium)
      sessionFilterEnabled: boolean("session_filter_enabled").notNull().default(true),
      // avoid the volatile open/close minutes
      avoidLastMinutesBeforeClose: integer("avoid_last_minutes_before_close").notNull().default(15),
      // pin-risk / illiquidity guard near close
      maxSpreadPct: doublePrecision("max_spread_pct").notNull().default(8),
      // reject a contract if (ask-bid)/mid exceeds this % — wide spreads eat the edge on both entry and exit
      minOpenInterest: integer("min_open_interest").notNull().default(50),
      // reject illiquid contracts below this open interest
      // ── Premium-selling mode (defined-risk credit spreads) ────────────────────
      // The proven options edge is SELLING premium (volatility risk premium), not
      // buying it. This mode sells a vertical credit spread in the signal's direction
      // (bullish→bull put spread, bearish→bear call spread): short a ~16-delta option,
      // long one strike-width further OTM for a hard max loss. Gated on elevated IV
      // (sell when premium is rich), ~30-45 DTE (theta sweet spot), sized off the
      // DEFINED max loss, and auto-closed at 50% of credit captured. OFF by default;
      // paper-first (multi-leg execution should be validated on a paper account).
      creditSpreadEnabled: boolean("credit_spread_enabled").notNull().default(false),
      creditSpreadShortDelta: doublePrecision("credit_spread_short_delta").notNull().default(0.16),
      // short-leg target delta (~84% POP)
      creditSpreadWidthDollars: doublePrecision("credit_spread_width_dollars").notNull().default(5),
      // strike distance between short and long leg
      creditSpreadDte: integer("credit_spread_dte").notNull().default(35),
      // target days-to-expiry for premium selling
      creditSpreadDteMin: integer("credit_spread_dte_min").notNull().default(25),
      creditSpreadDteMax: integer("credit_spread_dte_max").notNull().default(50),
      creditSpreadMinIv: doublePrecision("credit_spread_min_iv").notNull().default(0.25),
      // IV floor (proxy for IV-rank) — only sell when premium is rich
      creditSpreadProfitTakePct: doublePrecision("credit_spread_profit_take_pct").notNull().default(50),
      // buy back at 50% of credit captured
      creditSpreadStopMultiple: doublePrecision("credit_spread_stop_multiple").notNull().default(2),
      // stop when the spread costs Nx the credit to close (loss = credit at 2x)
      creditSpreadRiskPct: doublePrecision("credit_spread_risk_pct").notNull().default(2),
      // % of equity to risk per spread, off the DEFINED max loss
      creditSpreadMinCreditPct: doublePrecision("credit_spread_min_credit_pct").notNull().default(20),
      // require credit ≥ this % of width (else risk/reward too poor)
      creditSpreadMinIvRank: doublePrecision("credit_spread_min_iv_rank").notNull().default(30),
      // only sell when IV Rank ≥ this (premium rich vs the name's own 1yr range); falls back to creditSpreadMinIv until ≥20 days of IV history exist
      // Strategy-specific parameters
      orbRangeMinutes: integer("orb_range_minutes").notNull().default(15),
      // opening range window length
      volumeProfileLookbackDays: integer("volume_profile_lookback_days").notNull().default(10),
      breakoutLookbackDays: integer("breakout_lookback_days").notNull().default(20),
      orderFlowLookbackBars: integer("order_flow_lookback_bars").notNull().default(30),
      // 5-min bars used for the CVD-proxy/market-structure read
      // Acceleration / adaptive behavior (mirrors SS Engine's acceleration features)
      adaptiveScanInterval: boolean("adaptive_scan_interval").notNull().default(false),
      // scan faster near market open/ORB window
      enablePyramiding: boolean("enable_pyramiding").notNull().default(false),
      // add contracts as a move confirms further
      // ── FX SS AI Engine parity — same features, adapted from pips/lots to ──────
      // ── premium-%/contracts since options don't have pip-based price moves ─────
      aiMode: text("ai_mode").notNull().default("full"),
      // 'full' | 'economy' | 'rule_based' — cost-control tier, mirrors FX
      useKellyCriterion: boolean("use_kelly_criterion").notNull().default(false),
      // size contracts by win-rate/R:R history instead of flat riskPerTrade
      brainLearningMode: boolean("brain_learning_mode").notNull().default(true),
      // lock at 1 contract until enough trade history to trust bigger size
      drawdownShieldThreshold: doublePrecision("drawdown_shield_threshold").notNull().default(3),
      // % DD from peak equity that auto-tightens to conservative-only entries
      copyMode: text("copy_mode").notNull().default("proportional"),
      // 'proportional' | 'multiplier' — sizing mode across multiple Alpaca/TastyTrade connections
      volatileCapMode: text("volatile_cap_mode").notNull().default("risk_scaled"),
      // 'risk_scaled' | 'user_only' — caps contract count on high-IV underlyings (TSLA/NVDA-style)
      // Trailing-stop system — mirrors the FX engine's 9 methods, but trails as a
      // % of premium/underlying move instead of pips (options don't have pips).
      trailMethod: text("trail_method").notNull().default("none"),
      // 'chandelier' | 'r_multiple' | 'swing_structure' | 'parabolic_sar' | 'fixed_pct' | 'profit_lock' | 'stepped_fixed' | 'none'
      trailActivationPct: doublePrecision("trail_activation_pct").notNull().default(20),
      // start trailing once position is +X% of premium
      trailFixedPct: doublePrecision("trail_fixed_pct").notNull().default(15),
      // trail distance as % of premium (fixed_pct/stepped_fixed)
      trailStepPct: doublePrecision("trail_step_pct").notNull().default(10),
      // step size % for stepped_fixed
      trailProfitLockPct: doublePrecision("trail_profit_lock_pct").notNull().default(60),
      // lock X% of peak profit (profit_lock method)
      trailSarInitialAF: doublePrecision("trail_sar_initial_af").notNull().default(0.02),
      trailSarMaxAF: doublePrecision("trail_sar_max_af").notNull().default(0.2),
      breakevenBufferPct: doublePrecision("breakeven_buffer_pct").notNull().default(10),
      // buffer above breakeven for r_multiple method
      // Prop-firm presets + consistency rule — same shape as FX's, adapted since
      // dedicated options-only prop firms are rare; presets here describe generic
      // equity/options account rules a user can still pick or customize.
      propFirmPreset: text("prop_firm_preset").notNull().default("CUSTOM"),
      // 'FTMO' | 'MFF' | 'THE5ERS' | 'FUNDED_NEXT' | 'CUSTOM'
      propFirmAllowOvernightHolds: boolean("prop_firm_allow_overnight_holds").notNull().default(true),
      // options are commonly held overnight/multi-day unlike FX scalps, defaults true
      consistencyEnforcementEnabled: boolean("consistency_enforcement_enabled").notNull().default(false),
      consistencyMinProfitableDays: integer("consistency_min_profitable_days").notNull().default(10),
      consistencyPeriodDays: integer("consistency_period_days").notNull().default(15),
      maxDailyProfitPctOfTotal: doublePrecision("max_daily_profit_pct_of_total").notNull().default(0),
      // 0 = disabled; caps any single day's profit at this % of total
      // Goal tracker
      weeklyProfitTargetIsPercent: boolean("weekly_profit_target_is_percent").notNull().default(true),
      // whether weeklyProfitTarget is a % of account or a flat $ amount
      // Scheduling / per-symbol overrides — mirrors FX's pair-day pinning and
      // per-pair direction/lot overrides
      tradingDaysOfWeek: jsonb("trading_days_of_week").notNull().default([1, 2, 3, 4, 5]),
      // 0=Sun..6=Sat
      symbolDaySchedule: jsonb("symbol_day_schedule").notNull().default({}),
      // { SPY: [1,2,3,4,5], ... } — pin a symbol to specific days
      symbolDirectionOverrides: jsonb("symbol_direction_overrides").notNull().default({}),
      // { TSLA: 'calls_only', ... }
      symbolContractOverrides: jsonb("symbol_contract_overrides").notNull().default({}),
      // { SPY: 5, ... } — per-symbol max contracts, like FX's per-pair lot override
      // AI intelligence extras
      smartSymbolEscalation: boolean("smart_symbol_escalation").notNull().default(false),
      // brain-ranked symbol unlocking, mirrors FX's Smart Pair Escalation
      highConfidenceOverride: boolean("high_confidence_override").notNull().default(false),
      // 85%+ dual-confirmation fires cross-symbol regardless of other gates
      // Composite/edge-score autonomous entries — mirrors FX's composite strategy toggle
      enableCompositeAutonomous: boolean("enable_composite_autonomous").notNull().default(false),
      compositeMinEdgeScore: doublePrecision("composite_min_edge_score").notNull().default(72),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertOptionsEngineConfigSchema = createInsertSchema(optionsEngineConfigs).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    liveEngineConfigs = pgTable("live_engine_configs", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      config: jsonb("config").notNull().default({}),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    optionsEngineActivity = pgTable("options_engine_activity", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      symbol: text("symbol").notNull(),
      decision: text("decision").notNull(),
      // 'watching' | 'signal' | 'skipped' | 'error'
      reasoning: text("reasoning").notNull(),
      // human-readable explanation
      score: doublePrecision("score"),
      // 0-100 confidence proxy, null if not computed
      price: doublePrecision("price"),
      dailyChangePercent: doublePrecision("daily_change_percent"),
      source: text("source").notNull().default("alpaca"),
      // which broker's data fed this read
      strategy: text("strategy"),
      // 'orb' | 'volume_profile' | 'breakout' | 'momentum' | null
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertOptionsEngineActivitySchema = createInsertSchema(optionsEngineActivity).omit({
      id: true,
      createdAt: true
    });
    optionsEngineTrades = pgTable("options_engine_trades", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      connectionId: integer("connection_id").notNull(),
      // alpacaConnections.id (or tastytradeConnections.id)
      broker: text("broker").notNull().default("alpaca"),
      // 'alpaca' | 'tastytrade'
      underlyingSymbol: text("underlying_symbol").notNull(),
      optionSymbol: text("option_symbol").notNull(),
      // OCC symbol actually traded
      strategy: text("strategy").notNull(),
      optionType: text("option_type").notNull(),
      // 'call' | 'put'
      quantity: integer("quantity").notNull(),
      entryPrice: doublePrecision("entry_price").notNull(),
      // premium per contract at entry
      entryOrderId: text("entry_order_id"),
      entryReasoning: text("entry_reasoning"),
      status: text("status").notNull().default("open"),
      // 'open' | 'closed' | 'failed'
      exitPrice: doublePrecision("exit_price"),
      exitOrderId: text("exit_order_id"),
      exitReason: text("exit_reason"),
      // 'profit_target' | 'stop_loss' | 'manual' | 'expired' | 'error'
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
      entryConfidence: doublePrecision("entry_confidence"),
      // the strategy's own 0-100 score at entry
      dte: integer("dte"),
      // days-to-expiry of the contract actually traded
      ivAtEntry: doublePrecision("iv_at_entry"),
      // raw implied volatility (0-1) at entry
      underlyingPriceAtEntry: doublePrecision("underlying_price_at_entry"),
      bidAskSpreadPct: doublePrecision("bid_ask_spread_pct"),
      // (ask-bid)/mid at entry, as a %
      // ── Credit-spread (multi-leg) fields — null for single-leg trades. ────────
      // optionSymbol holds the SHORT leg; longLegSymbol the protective long leg.
      // entryPrice holds the net credit received per spread. P&L is measured off the
      // credit (close for less than the credit = profit).
      spreadType: text("spread_type"),
      // 'bull_put' | 'bear_call' | null (single-leg)
      longLegSymbol: text("long_leg_symbol"),
      netCredit: doublePrecision("net_credit"),
      // credit received per spread (dollars/share)
      maxLossPerSpread: doublePrecision("max_loss_per_spread"),
      // (width - credit) * 100
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertOptionsEngineTradeSchema = createInsertSchema(optionsEngineTrades).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    tradelockerTradeLogs = pgTable("tradelocker_trade_logs", {
      id: serial("id").primaryKey(),
      connectionId: integer("connection_id").references(() => tradelockerConnections.id).notNull(),
      userId: integer("user_id").references(() => users.id).notNull(),
      sourceSignalId: integer("source_signal_id"),
      // Reference to MT5 signal if from copier
      action: text("action").notNull(),
      // 'OPEN', 'CLOSE', 'MODIFY'
      symbol: text("symbol").notNull(),
      direction: text("direction").notNull(),
      // 'BUY', 'SELL'
      volume: real("volume").notNull(),
      entryPrice: real("entry_price"),
      stopLoss: real("stop_loss"),
      takeProfit: real("take_profit"),
      tradelockerOrderId: text("tradelocker_order_id"),
      // Order ID from TradeLocker
      status: text("status").notNull(),
      // 'pending', 'executed', 'failed', 'rejected'
      errorMessage: text("error_message"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertTradelockerTradeLogSchema = createInsertSchema(tradelockerTradeLogs).omit({
      id: true,
      createdAt: true
    });
    tradovateConnections = pgTable("tradovate_connections", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      username: text("username").notNull(),
      encryptedPassword: text("encrypted_password").notNull(),
      accountId: text("account_id"),
      accountType: text("account_type").notNull().default("demo"),
      // 'demo' | 'live'
      isActive: boolean("is_active").notNull().default(true),
      propFirmPreset: text("prop_firm_preset"),
      // 'TOPSTEP' | 'APEX' | 'BULENOX' | 'EARN2TRADE' | 'CUSTOM'
      propFirmAccountSize: real("prop_firm_account_size"),
      accessToken: text("access_token"),
      tokenExpiresAt: timestamp("token_expires_at"),
      peakEquity: real("peak_equity"),
      // trailing drawdown high-water mark
      startingBalance: real("starting_balance"),
      lastConnectedAt: timestamp("last_connected_at"),
      lastError: text("last_error"),
      tradeCount: integer("trade_count").notNull().default(0),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertTradovateConnectionSchema = createInsertSchema(tradovateConnections).omit({
      id: true,
      accessToken: true,
      tokenExpiresAt: true,
      peakEquity: true,
      lastConnectedAt: true,
      lastError: true,
      tradeCount: true,
      createdAt: true,
      updatedAt: true
    });
    tradovateTradeLogs = pgTable("tradovate_trade_logs", {
      id: serial("id").primaryKey(),
      connectionId: integer("connection_id").references(() => tradovateConnections.id).notNull(),
      userId: integer("user_id").references(() => users.id).notNull(),
      action: text("action").notNull(),
      // 'OPEN' | 'CLOSE' | 'MODIFY'
      symbol: text("symbol").notNull(),
      // 'NQ', 'ES', 'GC', etc.
      direction: text("direction").notNull(),
      // 'BUY' | 'SELL'
      contracts: integer("contracts").notNull(),
      entryPrice: real("entry_price"),
      stopLoss: real("stop_loss"),
      takeProfit: real("take_profit"),
      tradovateOrderId: text("tradovate_order_id"),
      status: text("status").notNull(),
      // 'pending' | 'executed' | 'failed' | 'rejected'
      errorMessage: text("error_message"),
      tickValue: real("tick_value"),
      realizedPnl: real("realized_pnl"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertTradovateTradeLogSchema = createInsertSchema(tradovateTradeLogs).omit({
      id: true,
      createdAt: true
    });
    futuresEngineConfigs = pgTable("futures_engine_configs", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      isActive: boolean("is_active").notNull().default(false),
      symbols: jsonb("symbols").notNull().default(["NQ", "ES", "GC", "CL"]),
      scanIntervalMs: integer("scan_interval_ms").notNull().default(12e4),
      strategyMode: text("strategy_mode").notNull().default("auto"),
      // 'auto' | 'trend_following' | 'smc' | 'volume_profile' | 'order_flow' | 'markov'
      singleStrategyMode: boolean("single_strategy_mode").notNull().default(false),
      directionFilter: text("direction_filter").notNull().default("both"),
      // 'long_only' | 'short_only' | 'both'
      maxOpenTrades: integer("max_open_trades").notNull().default(3),
      maxContractsPerTrade: integer("max_contracts_per_trade").notNull().default(1),
      riskPerTrade: doublePrecision("risk_per_trade").notNull().default(1),
      // % of account equity risked per trade
      minConfidence: doublePrecision("min_confidence").notNull().default(70),
      weeklyProfitTarget: doublePrecision("weekly_profit_target").notNull().default(5),
      accountBalance: doublePrecision("account_balance").notNull().default(5e4),
      enableCompounding: boolean("enable_compounding").notNull().default(false),
      propFirmMode: boolean("prop_firm_mode").notNull().default(false),
      propFirmDailyDrawdownLimit: doublePrecision("prop_firm_daily_drawdown_limit").notNull().default(2),
      dailyLossLimit: doublePrecision("daily_loss_limit").notNull().default(3),
      // % of account, 0 = disabled
      dailyProfitTarget: doublePrecision("daily_profit_target").notNull().default(0),
      // % of account, 0 = disabled
      maxDailyTrades: integer("max_daily_trades").notNull().default(0),
      // 0 = unlimited
      executionSource: text("execution_source").notNull().default("auto"),
      // 'tradovate' | 'moomoo' | 'auto'
      lockSettings: boolean("lock_settings").notNull().default(false),
      aiMode: text("ai_mode").notNull().default("full"),
      // 'full' | 'economy' | 'rule_based'
      enableAutoExecution: boolean("enable_auto_execution").notNull().default(false),
      // ── FX SS AI Engine parity — same features, adapted from pips/lots to ──────
      // ── R-multiples/contracts since futures trade in ticks/points, not pips ─────
      useKellyCriterion: boolean("use_kelly_criterion").notNull().default(false),
      brainLearningMode: boolean("brain_learning_mode").notNull().default(true),
      drawdownShieldThreshold: doublePrecision("drawdown_shield_threshold").notNull().default(3),
      copyMode: text("copy_mode").notNull().default("proportional"),
      // 'proportional' | 'multiplier'
      volatileCapMode: text("volatile_cap_mode").notNull().default("risk_scaled"),
      // 'risk_scaled' | 'user_only' — caps contracts on high-tick-value symbols (NQ/GC-style)
      // Trailing-stop system — mirrors the FX engine's methods, but trails on
      // R-multiple (unrealized profit ÷ initial risk distance) instead of pips,
      // since that's the native way futures/day-trading risk is already measured
      // elsewhere in this file (symbolPerformance.totalR).
      trailMethod: text("trail_method").notNull().default("none"),
      // 'chandelier' | 'r_multiple' | 'swing_structure' | 'parabolic_sar' | 'fixed_r' | 'profit_lock' | 'stepped_fixed' | 'none'
      trailActivationR: doublePrecision("trail_activation_r").notNull().default(1),
      // start trailing once position is +X R
      trailFixedR: doublePrecision("trail_fixed_r").notNull().default(0.5),
      // trail distance in R (fixed_r/stepped_fixed)
      trailStepR: doublePrecision("trail_step_r").notNull().default(0.5),
      trailProfitLockPct: doublePrecision("trail_profit_lock_pct").notNull().default(60),
      // lock X% of peak R (profit_lock method)
      trailSarInitialAF: doublePrecision("trail_sar_initial_af").notNull().default(0.02),
      trailSarMaxAF: doublePrecision("trail_sar_max_af").notNull().default(0.2),
      breakevenBufferR: doublePrecision("breakeven_buffer_r").notNull().default(0.1),
      // Prop-firm presets + consistency rule
      propFirmPreset: text("prop_firm_preset").notNull().default("CUSTOM"),
      // 'TOPSTEP' | 'APEX' | 'BULENOX' | 'EARN2TRADE' | 'CUSTOM'
      propFirmAllowOvernightHolds: boolean("prop_firm_allow_overnight_holds").notNull().default(false),
      // most futures prop firms disallow/penalize overnight holds
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertFuturesEngineConfigSchema = createInsertSchema(futuresEngineConfigs).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    futuresEngineActivity = pgTable("futures_engine_activity", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      symbol: text("symbol").notNull(),
      decision: text("decision").notNull(),
      // 'watching' | 'signal' | 'skipped' | 'error'
      reasoning: text("reasoning").notNull(),
      score: doublePrecision("score"),
      price: doublePrecision("price"),
      dailyChangePercent: doublePrecision("daily_change_percent"),
      source: text("source").notNull().default("tradovate"),
      strategy: text("strategy"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertFuturesEngineActivitySchema = createInsertSchema(futuresEngineActivity).omit({
      id: true,
      createdAt: true
    });
    futuresEngineTrades = pgTable("futures_engine_trades", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      connectionId: integer("connection_id").notNull(),
      // tradovateConnections.id (or moomoo connection id)
      broker: text("broker").notNull().default("tradovate"),
      // 'tradovate' | 'moomoo'
      symbol: text("symbol").notNull(),
      strategy: text("strategy").notNull(),
      direction: text("direction").notNull(),
      // 'long' | 'short'
      contracts: integer("contracts").notNull(),
      entryPrice: doublePrecision("entry_price").notNull(),
      stopLoss: doublePrecision("stop_loss"),
      takeProfit: doublePrecision("take_profit"),
      entryOrderId: text("entry_order_id"),
      entryReasoning: text("entry_reasoning"),
      status: text("status").notNull().default("open"),
      // 'open' | 'closed' | 'failed'
      exitPrice: doublePrecision("exit_price"),
      exitOrderId: text("exit_order_id"),
      exitReason: text("exit_reason"),
      // 'profit_target' | 'stop_loss' | 'trailing_stop' | 'manual' | 'session_close' | 'error'
      realizedPnl: doublePrecision("realized_pnl"),
      closedAt: timestamp("closed_at"),
      // Trailing-stop state — R-multiple high-water-mark, persisted per-trade.
      peakRMultiple: doublePrecision("peak_r_multiple").notNull().default(0),
      trailArmed: boolean("trail_armed").notNull().default(false),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertFuturesEngineTradeSchema = createInsertSchema(futuresEngineTrades).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    aiTradeResults = pgTable("ai_trade_results", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      analysisId: integer("analysis_id").references(() => chartAnalyses.id),
      symbol: text("symbol").notNull(),
      timeframe: text("timeframe"),
      direction: text("direction").notNull(),
      // 'BUY' or 'SELL'
      entryPrice: real("entry_price").notNull(),
      exitPrice: real("exit_price"),
      stopLoss: real("stop_loss"),
      takeProfit: real("take_profit"),
      aiConfidence: integer("ai_confidence"),
      // AI confidence when signal was given
      result: text("result"),
      // 'WIN', 'LOSS', 'BREAKEVEN', 'PENDING'
      profitLoss: real("profit_loss"),
      // Actual P/L in account currency
      profitLossPips: real("profit_loss_pips"),
      // P/L in pips
      closedAt: timestamp("closed_at"),
      // When trade was closed
      source: text("source").default("manual"),
      // 'manual', 'auto', 'mt5_copier'
      connectionId: integer("connection_id"),
      // TradeLocker connection this trade belongs to (ties trades → specific account)
      mt5Ticket: text("mt5_ticket"),
      // MT5 trade ticket number for sync
      notes: text("notes"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertAiTradeResultSchema = createInsertSchema(aiTradeResults).omit({
      id: true,
      createdAt: true
    });
    TIER_CONFIG = {
      YG: { name: "Young Gun", minXP: 0, icon: "\u{1F52B}", color: "green", nextTier: "Rising", xpNeeded: 500 },
      Rising: { name: "Rising Star", minXP: 500, icon: "\u2B50", color: "blue", nextTier: "Pro", xpNeeded: 2e3 },
      Pro: { name: "Pro Trader", minXP: 2e3, icon: "\u{1F48E}", color: "purple", nextTier: "Elite", xpNeeded: 5e3 },
      Elite: { name: "Elite", minXP: 5e3, icon: "\u{1F451}", color: "gold", nextTier: "OG", xpNeeded: 15e3 },
      OG: { name: "Original Gangster", minXP: 15e3, icon: "\u{1F3C6}", color: "red", nextTier: null, xpNeeded: null }
    };
    ambassadorTrainingProgress = pgTable("ambassador_training_progress", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      completedModules: jsonb("completed_modules").notNull().default([]),
      // Array of completed module IDs
      completedLessons: jsonb("completed_lessons").notNull().default([]),
      // Array of completed lesson IDs
      quizScores: jsonb("quiz_scores").notNull().default({}),
      // { lessonId: score }
      totalProgress: integer("total_progress").notNull().default(0),
      // 0-100 percentage
      startedAt: timestamp("started_at").defaultNow().notNull(),
      completedAt: timestamp("completed_at"),
      isCompleted: boolean("is_completed").notNull().default(false),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertAmbassadorTrainingProgressSchema = createInsertSchema(ambassadorTrainingProgress).omit({
      id: true,
      startedAt: true,
      completedAt: true,
      updatedAt: true
    });
    ambassadorCertifications = pgTable("ambassador_certifications", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      certificateNumber: text("certificate_number").notNull().unique(),
      // e.g., "VEDD-AMB-2026-00001"
      holderName: text("holder_name").notNull(),
      // Name on the certificate
      issueDate: timestamp("issue_date").defaultNow().notNull(),
      expiryDate: timestamp("expiry_date"),
      // Optional expiry
      status: text("status").notNull().default("active"),
      // 'active', 'revoked', 'expired'
      finalScore: integer("final_score").notNull(),
      // Average quiz score
      modulesCompleted: integer("modules_completed").notNull(),
      solanaWalletAddress: text("solana_wallet_address"),
      // User's Solana wallet for NFT
      nftMintAddress: text("nft_mint_address"),
      // Solana NFT mint address
      nftMetadataUri: text("nft_metadata_uri"),
      // IPFS/Arweave URI for NFT metadata
      nftTransactionId: text("nft_transaction_id"),
      // Solana transaction signature
      nftMintedAt: timestamp("nft_minted_at"),
      veddTokenBalance: integer("vedd_token_balance").notNull().default(100),
      // Initial VEDD token reward
      veddTokenClaimed: boolean("vedd_token_claimed").notNull().default(false),
      verificationHash: text("verification_hash").notNull(),
      // SHA256 hash for verification
      certificateImageUrl: text("certificate_image_url"),
      // Generated certificate image
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertAmbassadorCertificationSchema = createInsertSchema(ambassadorCertifications).omit({
      id: true,
      issueDate: true,
      nftMintedAt: true,
      createdAt: true,
      updatedAt: true
    });
    governanceProposals = pgTable("governance_proposals", {
      id: serial("id").primaryKey(),
      title: text("title").notNull(),
      description: text("description").notNull(),
      proposerUserId: integer("proposer_user_id").references(() => users.id).notNull(),
      proposerWallet: text("proposer_wallet").notNull(),
      // Wallet address of proposer
      category: text("category").notNull(),
      // 'feature', 'tokenomics', 'partnership', 'community', 'other'
      status: text("status").notNull().default("active"),
      // 'active', 'passed', 'rejected', 'executed', 'cancelled'
      votesFor: integer("votes_for").notNull().default(0),
      votesAgainst: integer("votes_against").notNull().default(0),
      totalVotingPower: real("total_voting_power").notNull().default(0),
      // Total VEDD tokens used in voting
      quorumRequired: real("quorum_required").notNull().default(1e3),
      // Min VEDD tokens needed
      startDate: timestamp("start_date").defaultNow().notNull(),
      endDate: timestamp("end_date").notNull(),
      executedAt: timestamp("executed_at"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    governanceVotes = pgTable("governance_votes", {
      id: serial("id").primaryKey(),
      proposalId: integer("proposal_id").references(() => governanceProposals.id).notNull(),
      userId: integer("user_id").references(() => users.id).notNull(),
      walletAddress: text("wallet_address").notNull(),
      vote: text("vote").notNull(),
      // 'for', 'against', 'abstain'
      votingPower: real("voting_power").notNull(),
      // VEDD tokens held at time of vote
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => {
      return {
        uniqueVote: unique().on(table.proposalId, table.userId)
      };
    });
    insertGovernanceProposalSchema = createInsertSchema(governanceProposals).omit({
      id: true,
      votesFor: true,
      votesAgainst: true,
      totalVotingPower: true,
      executedAt: true,
      createdAt: true
    });
    insertGovernanceVoteSchema = createInsertSchema(governanceVotes).omit({
      id: true,
      createdAt: true
    });
    ambassadorDailyLessons = pgTable("ambassador_daily_lessons", {
      id: serial("id").primaryKey(),
      dayNumber: integer("day_number").notNull().unique(),
      // 1-44
      title: text("title").notNull(),
      tradingTopic: text("trading_topic").notNull(),
      // Main trading focus for the day
      tradingLesson: text("trading_lesson").notNull(),
      // Detailed trading lesson content
      scriptureReference: text("scripture_reference").notNull(),
      // e.g., "Proverbs 21:5"
      scriptureText: text("scripture_text").notNull(),
      // Full scripture text
      devotionalMessage: text("devotional_message").notNull(),
      // Trading + faith connection
      contentPrompt: text("content_prompt").notNull(),
      // AI prompt template for generating posts
      suggestedHashtags: text("suggested_hashtags").array(),
      // Array of suggested hashtags
      mediaType: text("media_type").notNull().default("image"),
      // 'image', 'video', 'carousel'
      tokenReward: integer("token_reward").notNull().default(15),
      // Tokens earned for completion
      bonusTokens: integer("bonus_tokens").notNull().default(5),
      // Extra for uploading media
      weekNumber: integer("week_number").notNull(),
      // 1-7 (44 days = ~6.3 weeks)
      category: text("category").notNull()
      // 'foundation', 'strategy', 'mindset', 'execution', 'review'
    });
    ambassadorContentProgress = pgTable("ambassador_content_progress", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      dayNumber: integer("day_number").notNull(),
      status: text("status").notNull().default("locked"),
      // 'locked', 'available', 'in_progress', 'completed'
      aiGeneratedContent: text("ai_generated_content"),
      // AI-generated post text
      userMediaUrl: text("user_media_url"),
      // Uploaded image/video URL
      userMediaType: text("user_media_type"),
      // 'image', 'video'
      customContent: text("custom_content"),
      // User's custom additions
      tokensEarned: integer("tokens_earned").notNull().default(0),
      completedAt: timestamp("completed_at"),
      startedAt: timestamp("started_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => {
      return {
        uniqueUserDay: unique().on(table.userId, table.dayNumber)
      };
    });
    ambassadorContentStats = pgTable("ambassador_content_stats", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      currentDay: integer("current_day").notNull().default(1),
      // Current unlocked day
      completedDays: integer("completed_days").notNull().default(0),
      totalTokensEarned: integer("total_tokens_earned").notNull().default(0),
      currentStreak: integer("current_streak").notNull().default(0),
      // Consecutive days completed
      longestStreak: integer("longest_streak").notNull().default(0),
      lastCompletedAt: timestamp("last_completed_at"),
      journeyStartedAt: timestamp("journey_started_at"),
      journeyCompletedAt: timestamp("journey_completed_at"),
      // When all 44 days done
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertAmbassadorDailyLessonSchema = createInsertSchema(ambassadorDailyLessons).omit({
      id: true
    });
    insertAmbassadorContentProgressSchema = createInsertSchema(ambassadorContentProgress).omit({
      id: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true
    });
    insertAmbassadorContentStatsSchema = createInsertSchema(ambassadorContentStats).omit({
      id: true,
      journeyCompletedAt: true,
      createdAt: true,
      updatedAt: true
    });
    ambassadorSocialDirections = pgTable("ambassador_social_directions", {
      id: serial("id").primaryKey(),
      dayNumber: integer("day_number").notNull(),
      platform: text("platform").notNull(),
      // 'twitter', 'instagram', 'tiktok', 'linkedin', 'facebook', 'youtube'
      contentType: text("content_type").notNull(),
      // 'post', 'story', 'reel', 'thread', 'carousel', 'video'
      postIdea: text("post_idea").notNull(),
      // Main content idea
      captionTemplate: text("caption_template").notNull(),
      // Ready-to-use caption
      hookLine: text("hook_line").notNull(),
      // Attention-grabbing first line
      callToAction: text("call_to_action").notNull(),
      // CTA to include
      hashtags: text("hashtags").array(),
      // Platform-optimized hashtags
      bestPostingTime: text("best_posting_time"),
      // e.g., "9am-11am EST"
      engagementTips: text("engagement_tips").array(),
      // Tips to boost engagement
      aiGenerated: boolean("ai_generated").notNull().default(true),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => {
      return {
        uniqueDayPlatform: unique().on(table.dayNumber, table.platform)
      };
    });
    ambassadorChallenges = pgTable("ambassador_challenges", {
      id: serial("id").primaryKey(),
      title: text("title").notNull(),
      description: text("description").notNull(),
      challengeType: text("challenge_type").notNull(),
      // 'daily', 'weekly', 'monthly', 'special'
      category: text("category").notNull(),
      // 'content', 'engagement', 'trading', 'community', 'learning'
      difficulty: text("difficulty").notNull().default("medium"),
      // 'easy', 'medium', 'hard', 'expert'
      objectives: jsonb("objectives").notNull(),
      // Array of tasks to complete
      successCriteria: text("success_criteria").notNull(),
      // How to verify completion
      tokenReward: integer("token_reward").notNull().default(50),
      bonusReward: integer("bonus_reward").default(0),
      // Extra for top performers
      badgeReward: text("badge_reward"),
      // Special badge earned
      maxParticipants: integer("max_participants"),
      // null = unlimited
      startDate: timestamp("start_date").notNull(),
      endDate: timestamp("end_date").notNull(),
      weekNumber: integer("week_number"),
      // Links to content journey week
      status: text("status").notNull().default("upcoming"),
      // 'upcoming', 'active', 'completed', 'cancelled'
      aiGenerated: boolean("ai_generated").notNull().default(true),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    ambassadorChallengeParticipants = pgTable("ambassador_challenge_participants", {
      id: serial("id").primaryKey(),
      challengeId: integer("challenge_id").references(() => ambassadorChallenges.id).notNull(),
      userId: integer("user_id").references(() => users.id).notNull(),
      status: text("status").notNull().default("joined"),
      // 'joined', 'in_progress', 'completed', 'failed'
      progress: jsonb("progress"),
      // Track individual objective completion
      proofUrl: text("proof_url"),
      // Screenshot/link as proof
      tokensEarned: integer("tokens_earned").default(0),
      completedAt: timestamp("completed_at"),
      joinedAt: timestamp("joined_at").defaultNow().notNull()
    }, (table) => {
      return {
        uniqueUserChallenge: unique().on(table.challengeId, table.userId)
      };
    });
    ambassadorEvents = pgTable("ambassador_events", {
      id: serial("id").primaryKey(),
      title: text("title").notNull(),
      description: text("description").notNull(),
      eventType: text("event_type").notNull(),
      // 'live_session', 'ama', 'workshop', 'webinar', 'meetup', 'challenge_kickoff'
      format: text("format").notNull(),
      // 'virtual', 'in_person', 'hybrid'
      hostGuide: text("host_guide").notNull(),
      // Detailed guide on how to host
      talkingPoints: jsonb("talking_points"),
      // Key points to cover
      agenda: jsonb("agenda"),
      // Timed agenda items
      resourceLinks: jsonb("resource_links"),
      // Helpful materials
      suggestedDuration: integer("suggested_duration").notNull().default(60),
      // Minutes
      tokenReward: integer("token_reward").notNull().default(25),
      // For attendees
      hostTokenReward: integer("host_token_reward").notNull().default(100),
      // For hosts
      scheduledDate: timestamp("scheduled_date"),
      weekNumber: integer("week_number"),
      // Links to content journey week
      status: text("status").notNull().default("template"),
      // 'template', 'scheduled', 'live', 'completed', 'cancelled'
      aiGenerated: boolean("ai_generated").notNull().default(true),
      recordingUrl: text("recording_url"),
      // URL to event recording for replay
      recordingUploadedAt: timestamp("recording_uploaded_at"),
      recordingUploadedBy: integer("recording_uploaded_by").references(() => users.id),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    ambassadorEventRegistrations = pgTable("ambassador_event_registrations", {
      id: serial("id").primaryKey(),
      eventId: integer("event_id").references(() => ambassadorEvents.id).notNull(),
      userId: integer("user_id").references(() => users.id).notNull(),
      role: text("role").notNull().default("attendee"),
      // 'attendee', 'host', 'co_host', 'speaker'
      status: text("status").notNull().default("registered"),
      // 'registered', 'attended', 'no_show'
      tokensEarned: integer("tokens_earned").default(0),
      feedback: text("feedback"),
      // Post-event feedback
      rating: integer("rating"),
      // 1-5 stars
      registeredAt: timestamp("registered_at").defaultNow().notNull(),
      attendedAt: timestamp("attended_at")
    }, (table) => {
      return {
        uniqueUserEvent: unique().on(table.eventId, table.userId)
      };
    });
    insertAmbassadorSocialDirectionSchema = createInsertSchema(ambassadorSocialDirections).omit({
      id: true,
      createdAt: true
    });
    insertAmbassadorChallengeSchema = createInsertSchema(ambassadorChallenges).omit({
      id: true,
      createdAt: true
    });
    insertAmbassadorChallengeParticipantSchema = createInsertSchema(ambassadorChallengeParticipants).omit({
      id: true,
      completedAt: true,
      joinedAt: true
    });
    insertAmbassadorEventSchema = createInsertSchema(ambassadorEvents).omit({
      id: true,
      createdAt: true
    });
    insertAmbassadorEventRegistrationSchema = createInsertSchema(ambassadorEventRegistrations).omit({
      id: true,
      registeredAt: true,
      attendedAt: true
    });
    ambassadorChallengeSessions = pgTable("ambassador_challenge_sessions", {
      id: serial("id").primaryKey(),
      challengeId: integer("challenge_id").references(() => ambassadorChallenges.id).notNull(),
      userId: integer("user_id").references(() => users.id).notNull(),
      status: text("status").notNull().default("in_progress"),
      // 'in_progress', 'completed', 'abandoned'
      currentStep: integer("current_step").notNull().default(1),
      totalSteps: integer("total_steps").notNull().default(1),
      aiContext: json("ai_context").$type(),
      aiSteps: json("ai_steps").$type(),
      evidenceUrl: text("evidence_url"),
      evidenceNotes: text("evidence_notes"),
      tokensClaimed: boolean("tokens_claimed").default(false),
      startedAt: timestamp("started_at").defaultNow().notNull(),
      completedAt: timestamp("completed_at")
    }, (table) => {
      return {
        uniqueUserChallenge: unique().on(table.challengeId, table.userId)
      };
    });
    ambassadorEventSchedules = pgTable("ambassador_event_schedules", {
      id: serial("id").primaryKey(),
      eventId: integer("event_id").references(() => ambassadorEvents.id).notNull(),
      hostId: integer("host_id").references(() => users.id).notNull(),
      title: text("title").notNull(),
      description: text("description"),
      startAt: timestamp("start_at").notNull(),
      endAt: timestamp("end_at"),
      timezone: text("timezone").default("UTC"),
      capacity: integer("capacity").default(50),
      currentAttendees: integer("current_attendees").default(0),
      meetingLink: text("meeting_link"),
      shareSlug: text("share_slug").unique(),
      // Unique slug for public sharing
      aiAgenda: json("ai_agenda").$type(),
      status: text("status").notNull().default("scheduled"),
      // 'scheduled', 'live', 'completed', 'cancelled'
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    ambassadorScheduleRegistrations = pgTable("ambassador_schedule_registrations", {
      id: serial("id").primaryKey(),
      scheduleId: integer("schedule_id").references(() => ambassadorEventSchedules.id).notNull(),
      userId: integer("user_id").references(() => users.id).notNull(),
      status: text("status").notNull().default("registered"),
      // 'registered', 'attended', 'no_show'
      registeredAt: timestamp("registered_at").defaultNow().notNull(),
      attendedAt: timestamp("attended_at")
    }, (table) => {
      return {
        uniqueUserSchedule: unique().on(table.scheduleId, table.userId)
      };
    });
    ambassadorCommunityComments = pgTable("ambassador_community_comments", {
      id: serial("id").primaryKey(),
      targetType: text("target_type").notNull(),
      // 'challenge', 'event', 'schedule'
      targetId: integer("target_id").notNull(),
      parentId: integer("parent_id"),
      // For threaded replies
      authorId: integer("author_id").references(() => users.id).notNull(),
      content: text("content").notNull(),
      likes: integer("likes").default(0),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at")
    });
    insertAmbassadorChallengeSessionSchema = createInsertSchema(ambassadorChallengeSessions).omit({
      id: true,
      startedAt: true,
      completedAt: true
    });
    insertAmbassadorEventScheduleSchema = createInsertSchema(ambassadorEventSchedules).omit({
      id: true,
      createdAt: true
    });
    insertAmbassadorScheduleRegistrationSchema = createInsertSchema(ambassadorScheduleRegistrations).omit({
      id: true,
      registeredAt: true,
      attendedAt: true
    });
    insertAmbassadorCommunityCommentSchema = createInsertSchema(ambassadorCommunityComments).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    veddPoolWallets = pgTable("vedd_pool_wallets", {
      id: serial("id").primaryKey(),
      label: text("label").notNull(),
      // e.g., "Ambassador Rewards Pool", "Subscription Refunds Pool"
      publicKey: text("public_key").notNull().unique(),
      // Solana public key
      walletType: text("wallet_type").notNull().default("rewards"),
      // 'rewards', 'subscriptions', 'marketing'
      status: text("status").notNull().default("active"),
      // 'active', 'paused', 'depleted'
      tokenBalance: real("token_balance").default(0),
      // Cached balance (synced periodically)
      lowBalanceThreshold: real("low_balance_threshold").default(1e3),
      // Alert when below this
      lastSyncAt: timestamp("last_sync_at"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    veddTransferJobs = pgTable("vedd_transfer_jobs", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      sourceWalletId: integer("source_wallet_id").references(() => veddPoolWallets.id).notNull(),
      destinationWallet: text("destination_wallet").notNull(),
      // User's Solana wallet address
      amount: real("amount").notNull(),
      // VEDD tokens to transfer
      actionType: text("action_type").notNull(),
      // 'challenge_completion', 'event_hosting', 'content_share', 'referral', 'subscription_refund'
      actionId: integer("action_id"),
      // Reference to the specific action (challenge ID, event ID, etc.)
      status: text("status").notNull().default("pending"),
      // 'pending', 'processing', 'completed', 'failed', 'cancelled'
      solanaTransactionSig: text("solana_transaction_sig"),
      // Solana transaction signature when completed
      errorMessage: text("error_message"),
      // Error details if failed
      retryCount: integer("retry_count").default(0),
      idempotencyKey: text("idempotency_key").unique(),
      // Prevent duplicate transfers
      metadata: jsonb("metadata"),
      // Additional context (challenge name, event title, etc.)
      createdAt: timestamp("created_at").defaultNow().notNull(),
      processedAt: timestamp("processed_at")
    });
    veddWalletBlacklist = pgTable("vedd_wallet_blacklist", {
      id: serial("id").primaryKey(),
      walletAddress: text("wallet_address").notNull().unique(),
      reason: text("reason").notNull(),
      // 'scam'|'whale_abuse'|'multi_account'|'suspicious'|'spam'
      addedBy: integer("added_by").references(() => users.id),
      notes: text("notes"),
      isActive: boolean("is_active").default(true),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertVeddWalletBlacklistSchema = createInsertSchema(veddWalletBlacklist).omit({ id: true, createdAt: true });
    ambassadorActionRewards = pgTable("ambassador_action_rewards", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      actionType: text("action_type").notNull(),
      // 'challenge_completion', 'event_hosting', 'content_share', 'referral', 'streak_bonus'
      actionId: integer("action_id"),
      // Reference to specific challenge/event/etc.
      baseReward: real("base_reward").notNull(),
      // Base VEDD tokens earned
      bonusReward: real("bonus_reward").default(0),
      // Bonus tokens (streak, early completion, etc.)
      totalReward: real("total_reward").notNull(),
      // baseReward + bonusReward
      verificationStatus: text("verification_status").notNull().default("pending"),
      // 'pending', 'verified', 'rejected'
      verifiedBy: integer("verified_by").references(() => users.id),
      // Admin who verified (null for auto-verified)
      verifiedAt: timestamp("verified_at"),
      transferJobId: integer("transfer_job_id").references(() => veddTransferJobs.id),
      // Link to transfer when processed
      notes: text("notes"),
      // Admin notes or rejection reason
      securityFlag: text("security_flag"),
      // null = clean, 'velocity'|'duplicate'|'suspicious'
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    subscriptionTokenPayments = pgTable("subscription_token_payments", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      subscriptionPlanId: integer("subscription_plan_id").references(() => subscriptionPlans.id).notNull(),
      tokenAmount: real("token_amount").notNull(),
      // VEDD tokens used
      usdEquivalent: real("usd_equivalent").notNull(),
      // USD value at time of redemption
      exchangeRate: real("exchange_rate").notNull(),
      // VEDD/USD rate used
      periodStart: timestamp("period_start").notNull(),
      periodEnd: timestamp("period_end").notNull(),
      status: text("status").notNull().default("pending"),
      // 'pending', 'applied', 'refunded'
      stripeInvoiceId: text("stripe_invoice_id"),
      // If partially paid with Stripe
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    veddRewardConfig = pgTable("vedd_reward_config", {
      id: serial("id").primaryKey(),
      actionType: text("action_type").notNull().unique(),
      // 'challenge_completion', 'event_hosting', etc.
      baseAmount: real("base_amount").notNull(),
      // Base VEDD tokens for this action
      streakMultiplier: real("streak_multiplier").default(1),
      // Multiplier per streak level
      maxDailyRewards: integer("max_daily_rewards").default(5),
      // Rate limit per user per day
      requiresVerification: boolean("requires_verification").default(false),
      // If true, admin must verify
      isActive: boolean("is_active").default(true),
      description: text("description"),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertVeddPoolWalletSchema = createInsertSchema(veddPoolWallets).omit({
      id: true,
      tokenBalance: true,
      lastSyncAt: true,
      createdAt: true
    });
    insertVeddTransferJobSchema = createInsertSchema(veddTransferJobs).omit({
      id: true,
      solanaTransactionSig: true,
      errorMessage: true,
      retryCount: true,
      createdAt: true,
      processedAt: true
    });
    insertAmbassadorActionRewardSchema = createInsertSchema(ambassadorActionRewards).omit({
      id: true,
      verifiedBy: true,
      verifiedAt: true,
      transferJobId: true,
      createdAt: true
    });
    insertSubscriptionTokenPaymentSchema = createInsertSchema(subscriptionTokenPayments).omit({
      id: true,
      createdAt: true
    });
    insertVeddRewardConfigSchema = createInsertSchema(veddRewardConfig).omit({
      id: true,
      updatedAt: true
    });
    internalWalletEarnings = pgTable("internal_wallet_earnings", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      amount: real("amount").notNull(),
      // actual amount credited (post-cap)
      source: text("source").notNull(),
      // 'nfc_tap' | 'nfc_activation' | 'checkin' | 'wear_to_earn'
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    internalWallets = pgTable("internal_wallets", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      veddBalance: real("vedd_balance").notNull().default(0),
      // Tokens held in app
      pendingBalance: real("pending_balance").notNull().default(0),
      // Tokens awaiting admin verification
      totalEarned: real("total_earned").notNull().default(0),
      // Lifetime earnings
      totalWithdrawn: real("total_withdrawn").notNull().default(0),
      // Lifetime withdrawals
      lastActivityAt: timestamp("last_activity_at"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    withdrawalRequests = pgTable("withdrawal_requests", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      amount: real("amount").notNull(),
      // VEDD tokens to withdraw
      destinationWallet: text("destination_wallet").notNull(),
      // User's pump.fun Solana wallet
      status: text("status").notNull().default("pending"),
      // 'pending', 'approved', 'processing', 'completed', 'rejected'
      adminId: integer("admin_id").references(() => users.id),
      // Admin who processed
      adminNotes: text("admin_notes"),
      solanaTransactionSig: text("solana_transaction_sig"),
      // Tx signature when completed
      errorMessage: text("error_message"),
      requestedAt: timestamp("requested_at").defaultNow().notNull(),
      processedAt: timestamp("processed_at")
    });
    insertInternalWalletSchema = createInsertSchema(internalWallets).omit({
      id: true,
      lastActivityAt: true,
      createdAt: true
    });
    insertWithdrawalRequestSchema = createInsertSchema(withdrawalRequests).omit({
      id: true,
      adminId: true,
      adminNotes: true,
      solanaTransactionSig: true,
      errorMessage: true,
      requestedAt: true,
      processedAt: true
    });
    connectedSocialAccounts = pgTable("connected_social_accounts", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      platform: text("platform").notNull(),
      // 'twitter', 'facebook', 'instagram', 'linkedin', 'tiktok'
      platformUserId: text("platform_user_id"),
      // User ID on the platform
      platformUsername: text("platform_username"),
      // Username/handle on platform
      accessToken: text("access_token"),
      // OAuth access token (encrypted)
      refreshToken: text("refresh_token"),
      // OAuth refresh token (encrypted)
      tokenExpiresAt: timestamp("token_expires_at"),
      isActive: boolean("is_active").notNull().default(true),
      lastSyncAt: timestamp("last_sync_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at")
    }, (table) => {
      return {
        uniqueUserPlatform: unique().on(table.userId, table.platform)
      };
    });
    socialPosts = pgTable("social_posts", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      platform: text("platform").notNull(),
      // 'twitter', 'facebook', 'instagram', 'linkedin', 'tiktok'
      contentType: text("content_type").notNull(),
      // 'image', 'video', 'carousel', 'thread', 'story'
      caption: text("caption"),
      mediaUrls: text("media_urls").array(),
      // Array of media file URLs
      hashtags: text("hashtags").array(),
      sourceType: text("source_type").notNull(),
      // 'content_journey', 'analysis', 'ea_share', 'manual'
      sourceId: integer("source_id"),
      // Reference to content journey day, analysis ID, etc.
      platformPostId: text("platform_post_id"),
      // ID of the post on the platform
      platformPostUrl: text("platform_post_url"),
      // URL to view the post
      status: text("status").notNull().default("pending"),
      // 'pending', 'published', 'failed', 'scheduled'
      scheduledFor: timestamp("scheduled_for"),
      publishedAt: timestamp("published_at"),
      errorMessage: text("error_message"),
      engagement: jsonb("engagement").$type(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertConnectedSocialAccountSchema = createInsertSchema(connectedSocialAccounts).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    insertSocialPostSchema = createInsertSchema(socialPosts).omit({
      id: true,
      platformPostId: true,
      platformPostUrl: true,
      publishedAt: true,
      errorMessage: true,
      engagement: true,
      createdAt: true
    });
    tradingWallets = pgTable("trading_wallets", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      solBalance: real("sol_balance").notNull().default(0),
      // Available SOL for trading
      lockedBalance: real("locked_balance").notNull().default(0),
      // SOL in open positions
      totalDeposited: real("total_deposited").notNull().default(0),
      // Lifetime deposits
      totalWithdrawn: real("total_withdrawn").notNull().default(0),
      // Lifetime withdrawals
      totalProfitLoss: real("total_profit_loss").notNull().default(0),
      // Lifetime P/L
      isAutoTradeEnabled: boolean("is_auto_trade_enabled").notNull().default(false),
      maxPositions: integer("max_positions").notNull().default(3),
      // Max concurrent trades
      tradeAmountSol: real("trade_amount_sol").notNull().default(0.1),
      // SOL per trade
      takeProfitPercent: real("take_profit_percent").notNull().default(50),
      // Auto sell at +X%
      stopLossPercent: real("stop_loss_percent").notNull().default(20),
      // Auto sell at -X%
      minSignalConfidence: integer("min_signal_confidence").notNull().default(70),
      // Min confidence to buy
      isAutoRebalanceEnabled: boolean("is_auto_rebalance_enabled").notNull().default(false),
      // Auto-sell losers and buy better tokens
      rebalanceThresholdPercent: real("rebalance_threshold_percent").notNull().default(10),
      // Sell when token drops X% and find replacement
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at")
    });
    tokenPositions = pgTable("token_positions", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      tokenAddress: text("token_address").notNull(),
      // Solana token mint address
      tokenSymbol: text("token_symbol").notNull(),
      tokenName: text("token_name"),
      entryPriceSol: real("entry_price_sol").notNull(),
      // Price when bought
      currentPriceSol: real("current_price_sol"),
      // Latest price
      amountTokens: real("amount_tokens").notNull(),
      // Tokens held
      amountSolInvested: real("amount_sol_invested").notNull(),
      // SOL spent
      unrealizedPL: real("unrealized_pl").default(0),
      // Current P/L
      realizedPL: real("realized_pl"),
      // Final P/L when closed
      status: text("status").notNull().default("open"),
      // 'open', 'closed', 'stopped_out', 'take_profit'
      signalConfidence: integer("signal_confidence"),
      // AI confidence when bought
      signalType: text("signal_type"),
      // 'STRONG_BUY', 'BUY', etc.
      exitReason: text("exit_reason"),
      // 'manual', 'take_profit', 'stop_loss', 'pump_dump_detected'
      openedAt: timestamp("opened_at").defaultNow().notNull(),
      closedAt: timestamp("closed_at")
    });
    tradingActivityLog = pgTable("trading_activity_log", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      positionId: integer("position_id").references(() => tokenPositions.id),
      action: text("action").notNull(),
      // 'deposit', 'withdraw', 'buy', 'sell', 'stop_loss', 'take_profit'
      tokenAddress: text("token_address"),
      tokenSymbol: text("token_symbol"),
      amountSol: real("amount_sol"),
      amountTokens: real("amount_tokens"),
      priceSol: real("price_sol"),
      profitLoss: real("profit_loss"),
      notes: text("notes"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertTradingWalletSchema = createInsertSchema(tradingWallets).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    insertTokenPositionSchema = createInsertSchema(tokenPositions).omit({
      id: true,
      openedAt: true,
      closedAt: true
    });
    insertTradingActivityLogSchema = createInsertSchema(tradingActivityLog).omit({
      id: true,
      createdAt: true
    });
    userApiKeys = pgTable("user_api_keys", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      provider: text("provider").notNull(),
      // openai, anthropic, google, groq, mistral
      apiKey: text("api_key").notNull(),
      // encrypted key
      label: text("label"),
      // user-friendly name
      isActive: boolean("is_active").default(true).notNull(),
      isValid: boolean("is_valid"),
      lastValidated: timestamp("last_validated"),
      lastUsed: timestamp("last_used"),
      usageCount: integer("usage_count").default(0).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      unique("user_provider_unique").on(table.userId, table.provider)
    ]);
    insertUserApiKeySchema = createInsertSchema(userApiKeys).omit({
      id: true,
      createdAt: true,
      lastValidated: true,
      lastUsed: true,
      usageCount: true
    });
    weeklyStrategies = pgTable("weekly_strategies", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").notNull().references(() => users.id),
      profitTarget: real("profit_target").notNull(),
      accountBalance: real("account_balance").notNull(),
      pairs: text("pairs").array().notNull(),
      riskLevel: text("risk_level").default("ai-controlled"),
      lotSize: text("lot_size").default("auto"),
      plan: jsonb("plan").notNull(),
      pairStats: jsonb("pair_stats"),
      generatedAt: text("generated_at").notNull(),
      weekStart: text("week_start").notNull(),
      currentProfit: real("current_profit").default(0),
      progressTrades: integer("progress_trades").default(0),
      progressWinRate: integer("progress_win_rate").default(0),
      progressPercentage: integer("progress_percentage").default(0),
      isActive: boolean("is_active").default(true)
    });
    aiModelConfigs = pgTable("ai_model_configs", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").notNull().references(() => users.id),
      routingMode: text("routing_mode").notNull().default("single"),
      primaryModelId: text("primary_model_id").notNull().default("openai-gpt4o"),
      ensembleModelIds: jsonb("ensemble_model_ids").$type().default([]),
      strategyAssignments: jsonb("strategy_assignments").$type().default({}),
      fallbackOrder: jsonb("fallback_order").$type().default([]),
      ensembleMinAgreement: integer("ensemble_min_agreement").notNull().default(60),
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertAiModelConfigSchema = createInsertSchema(aiModelConfigs).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    solEngineSettings = pgTable("sol_engine_settings", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").notNull().references(() => users.id).unique(),
      activeStrategy: text("active_strategy").notNull().default("momentum_surfer"),
      activeStrategies: jsonb("active_strategies").$type().default([]),
      autoTradeEnabled: boolean("auto_trade_enabled").notNull().default(false),
      liveTradeEnabled: boolean("live_trade_enabled").notNull().default(false),
      autoTradeTP: real("auto_trade_tp").notNull().default(8),
      autoTradeSL: real("auto_trade_sl").notNull().default(4),
      autoTrailActivationPct: real("auto_trail_activation_pct").notNull().default(4),
      autoTrailDistancePct: real("auto_trail_distance_pct").notNull().default(3),
      weeklyGoal: jsonb("weekly_goal").notNull().default({}),
      autoTradeStats: jsonb("auto_trade_stats").notNull().default({}),
      serverWalletKey: text("server_wallet_key"),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    solEnginePositions = pgTable("sol_engine_positions", {
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
      status: text("status").notNull().default("open"),
      openedAt: text("opened_at").notNull(),
      closedAt: text("closed_at"),
      closePnlPct: real("close_pnl_pct"),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    wearToEarnClaims = pgTable("wear_to_earn_claims", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").notNull().references(() => users.id),
      claimCode: text("claim_code").notNull(),
      productName: text("product_name").notNull(),
      rewardAmount: real("reward_amount").notNull().default(50),
      status: text("status").notNull().default("pending"),
      // 'pending' | 'approved' | 'rejected'
      imageUrl: text("image_url"),
      submittedAt: timestamp("submitted_at").defaultNow().notNull(),
      processedAt: timestamp("processed_at"),
      processedBy: integer("processed_by")
    });
    insertWearToEarnClaimSchema = createInsertSchema(wearToEarnClaims).omit({
      id: true,
      submittedAt: true,
      processedAt: true,
      processedBy: true
    });
    nfcActivations = pgTable("nfc_activations", {
      id: serial("id").primaryKey(),
      chipUid: text("chip_uid").notNull().unique(),
      // NFC chip UID or VEDD-XXXXXX code
      userId: integer("user_id").notNull().references(() => users.id),
      garmentName: text("garment_name").notNull(),
      // e.g. "VEDD Classic Tee"
      activatedAt: timestamp("activated_at").defaultNow().notNull(),
      totalTaps: integer("total_taps").notNull().default(0),
      totalEarned: real("total_earned").notNull().default(0),
      lastTapAt: timestamp("last_tap_at"),
      currentStreak: integer("current_streak").notNull().default(0),
      bestStreak: integer("best_streak").notNull().default(0)
    });
    nfcDailyTaps = pgTable("nfc_daily_taps", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").notNull().references(() => users.id),
      chipUid: text("chip_uid").notNull(),
      rewardAmount: real("reward_amount").notNull().default(15),
      tappedAt: timestamp("tapped_at").defaultNow().notNull(),
      dayString: text("day_string").notNull()
      // 'YYYY-MM-DD' — dedup key
    });
    paperTrades = pgTable("paper_trades", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").notNull().references(() => users.id),
      symbol: text("symbol").notNull(),
      timeframe: text("timeframe").notNull(),
      direction: text("direction").notNull(),
      // 'BUY' | 'SELL'
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
      outcome: text("outcome").default("pending"),
      // 'pending' | 'win' | 'loss' | 'breakeven'
      priceAt1h: real("price_at_1h"),
      priceAt4h: real("price_at_4h"),
      priceAt24h: real("price_at_24h"),
      pnlPips: real("pnl_pips"),
      pnlPercent: real("pnl_percent"),
      resolvedAt: timestamp("resolved_at"),
      notes: text("notes"),
      analysisId: integer("analysis_id"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertPaperTradeSchema = createInsertSchema(paperTrades).omit({
      id: true,
      createdAt: true,
      resolvedAt: true,
      priceAt1h: true,
      priceAt4h: true,
      priceAt24h: true,
      outcome: true,
      pnlPips: true,
      pnlPercent: true
    });
    aiConfirmationOutcomes = pgTable("ai_confirmation_outcomes", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").notNull().references(() => users.id),
      symbol: text("symbol").notNull(),
      timeframe: text("timeframe"),
      direction: text("direction").notNull(),
      // 'BUY' | 'SELL'
      confluenceGrade: text("confluence_grade"),
      // 'A+' | 'A' | 'B' | 'C' | 'D'
      confluenceScore: real("confluence_score"),
      session: text("session"),
      // 'London' | 'NY' | 'Asian' | etc.
      ictMacroValid: boolean("ict_macro_valid"),
      smcVerdict: text("smc_verdict"),
      // 'CONFIRM' | 'PASS' | 'REQUIRE_BETTER_PRICE'
      adxValue: real("adx_value"),
      rsiValue: real("rsi_value"),
      macdDirection: text("macd_direction"),
      htfAligned: boolean("htf_aligned"),
      newsConflict: boolean("news_conflict"),
      aiDecision: text("ai_decision"),
      // 'CONFIRMED' | 'REJECTED' | 'EA_ONLY' | 'MANUAL' | 'AI_OVERRIDE' | 'ADJUSTED'
      aiConfidence: real("ai_confidence"),
      proposedConfidence: real("proposed_confidence"),
      tradeOutcome: text("trade_outcome").default("PENDING"),
      // 'PENDING' | 'WIN' | 'LOSS' | 'BREAKEVEN'
      actualPips: real("actual_pips"),
      confirmedAt: timestamp("confirmed_at").defaultNow().notNull(),
      closedAt: timestamp("closed_at"),
      tradeSource: text("trade_source").default("ai_confirmation"),
      modelUsed: text("model_used"),
      // e.g. 'gpt-4o', 'claude-3-5-sonnet', 'llama-4-scout'
      providerUsed: text("provider_used"),
      // e.g. 'openai', 'anthropic', 'groq'
      // Deep Reasoning Mode trail — populated only when the Bull/Bear/Veteran-Judge
      // debate pipeline ran instead of the single fast-path confirmation call.
      reasoningText: text("reasoning_text"),
      bullCase: text("bull_case"),
      bearCase: text("bear_case"),
      deepReasoningUsed: boolean("deep_reasoning_used").default(false)
    });
    insertAiConfirmationOutcomeSchema = createInsertSchema(aiConfirmationOutcomes).omit({
      id: true,
      confirmedAt: true,
      closedAt: true,
      tradeOutcome: true,
      actualPips: true
    });
    aiConfirmationLogs = pgTable("ai_confirmation_logs", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").notNull().references(() => users.id),
      entry: jsonb("entry").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    propFirmAccountState = pgTable("prop_firm_account_state", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      connectionId: integer("connection_id").notNull(),
      // references the MT5/TradeLocker/Tradovate/Alpaca/TastyTrade connection this state is for
      connectionType: text("connection_type").notNull().default("tradelocker"),
      // 'mt5' | 'tradelocker' | 'tradovate' | 'alpaca' | 'tastytrade'
      phase: text("phase").notNull().default("challenge"),
      // 'challenge' | 'funded'
      phaseStartBalance: real("phase_start_balance").notNull(),
      profitTarget: real("profit_target"),
      // $ target to graduate this phase (null = no target, e.g. funded)
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (t) => ({
      unq: unique().on(t.connectionId, t.connectionType)
    }));
    propFirmDailyPnl = pgTable("prop_firm_daily_pnl", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      connectionId: integer("connection_id").notNull(),
      connectionType: text("connection_type").notNull().default("tradelocker"),
      // 'mt5' | 'tradelocker' | 'tradovate'
      tradeDate: text("trade_date").notNull(),
      // 'YYYY-MM-DD', UTC — matches a single trading day
      realizedPnl: doublePrecision("realized_pnl").notNull().default(0),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (t) => ({
      unq: unique().on(t.connectionId, t.connectionType, t.tradeDate)
    }));
    engineConsensusLog = pgTable("engine_consensus_log", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      engine: text("engine").notNull(),
      // 'options' | 'cryptocom'
      symbol: text("symbol").notNull(),
      strategy: text("strategy").notNull(),
      quantVerdict: text("quant_verdict").notNull(),
      quantScore: doublePrecision("quant_score").notNull().default(0),
      aiVerdict: text("ai_verdict").notNull(),
      aiConfidence: doublePrecision("ai_confidence").notNull().default(0),
      aiReasoning: text("ai_reasoning").notNull().default(""),
      consensus: text("consensus").notNull(),
      tradeAllowed: boolean("trade_allowed").notNull().default(false),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (t) => ({
      unq: unique().on(t.userId, t.engine, t.symbol)
    }));
    microGrowthMilestones = pgTable("micro_growth_milestones", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      startingBalance: doublePrecision("starting_balance").notNull(),
      currentMilestoneBase: doublePrecision("current_milestone_base").notNull(),
      // this leg's 1x checkpoint; target = base * 2
      doublingsCompleted: integer("doublings_completed").notNull().default(0),
      lastMilestoneHitAt: timestamp("last_milestone_hit_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    microGrowthSessions = pgTable("micro_growth_sessions", {
      id: text("id").primaryKey(),
      // matches the existing `${userId}_${Date.now()}` format
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
      status: text("status").notNull().default("active"),
      // 'active' | 'completed'
      tradesCount: integer("trades_count").notNull().default(0),
      pipsGained: doublePrecision("pips_gained").notNull().default(0),
      pnl: doublePrecision("pnl").notNull().default(0),
      completedAt: timestamp("completed_at")
    });
    brainDataListings = pgTable("brain_data_listings", {
      id: serial("id").primaryKey(),
      sellerId: integer("seller_id").references(() => users.id).notNull(),
      // Which trade source this brain is built from — sellers can list a
      // separate brain per platform instead of one blended listing.
      // 'forex' = MT5/EA-triggered AI confirmations, 'tradelocker' = trades
      // executed/mirrored through a linked TradeLocker connection.
      sourceCategory: text("source_category").default("forex").notNull(),
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
      snapshotData: jsonb("snapshot_data").notNull(),
      // frozen array of outcome rows at listing time — re-listing the SAME category+symbolFilter combo replaces this with a fresh, updated snapshot
      tradeCount: integer("trade_count").notNull(),
      distinctPairs: integer("distinct_pairs").notNull(),
      ageDays: integer("age_days").notNull(),
      winRate: real("win_rate"),
      // 0..1, null if too few closed trades
      oldestTradeAt: timestamp("oldest_trade_at").notNull(),
      newestTradeAt: timestamp("newest_trade_at").notNull(),
      isActive: boolean("is_active").default(true).notNull(),
      purchaseCount: integer("purchase_count").default(0).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    brainDataPurchases = pgTable("brain_data_purchases", {
      id: serial("id").primaryKey(),
      listingId: integer("listing_id").references(() => brainDataListings.id).notNull(),
      sellerId: integer("seller_id").references(() => users.id).notNull(),
      buyerId: integer("buyer_id").references(() => users.id).notNull(),
      priceVeddPaid: integer("price_vedd_paid").notNull(),
      tradesImported: integer("trades_imported").notNull(),
      purchasedAt: timestamp("purchased_at").defaultNow().notNull()
    }, (table) => {
      return {
        uniquePurchase: unique().on(table.listingId, table.buyerId)
      };
    });
    insertBrainDataListingSchema = createInsertSchema(brainDataListings).omit({
      id: true,
      purchaseCount: true,
      createdAt: true,
      updatedAt: true
    });
    insertBrainDataPurchaseSchema = createInsertSchema(brainDataPurchases).omit({
      id: true,
      purchasedAt: true
    });
    grants = pgTable("grants", {
      id: serial("id").primaryKey(),
      title: text("title").notNull(),
      description: text("description").notNull(),
      grantType: text("grant_type").notNull(),
      // 'business_fintech'|'community_dev'|'ambassador_education'|'international'|'ai_focused'
      funder: text("funder").notNull(),
      fundingAmount: text("funding_amount"),
      deadline: timestamp("deadline"),
      eligibilityCriteria: jsonb("eligibility_criteria"),
      // string[]
      targetAudience: text("target_audience").default("both"),
      // 'business'|'ambassador'|'both'
      geographicScope: text("geographic_scope").default("US"),
      applicationUrl: text("application_url"),
      aiScanNotes: text("ai_scan_notes"),
      relevanceScore: integer("relevance_score").default(0),
      isActive: boolean("is_active").default(true),
      isVerified: boolean("is_verified").default(false),
      isFeatured: boolean("is_featured").default(false),
      source: text("source").default("ai_scan"),
      // 'ai_scan'|'manual'
      lastScannedAt: timestamp("last_scanned_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertGrantSchema = createInsertSchema(grants).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    grantApplications = pgTable("grant_applications", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      grantId: integer("grant_id").references(() => grants.id).notNull(),
      status: text("status").default("draft"),
      // 'draft'|'applied'|'under_review'|'awarded'|'rejected'
      proposalMode: text("proposal_mode").notNull(),
      // 'auto'|'guided'|'template'
      proposalContent: text("proposal_content"),
      proposalSections: jsonb("proposal_sections"),
      proposalVersion: integer("proposal_version").default(1),
      submittedAt: timestamp("submitted_at"),
      awardedAt: timestamp("awarded_at"),
      awardedAmount: text("awarded_amount"),
      rejectionReason: text("rejection_reason"),
      applicationNotes: text("application_notes"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertGrantApplicationSchema = createInsertSchema(grantApplications).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    grantScanSessions = pgTable("grant_scan_sessions", {
      id: serial("id").primaryKey(),
      triggeredBy: integer("triggered_by").references(() => users.id),
      scanType: text("scan_type").notNull(),
      // 'full'|'targeted'
      grantTypesScanned: jsonb("grant_types_scanned"),
      grantsFound: integer("grants_found").default(0),
      grantsCreated: integer("grants_created").default(0),
      status: text("status").default("pending"),
      // 'pending'|'running'|'completed'|'failed'
      errorMessage: text("error_message"),
      startedAt: timestamp("started_at").defaultNow().notNull(),
      completedAt: timestamp("completed_at")
    });
    insertGrantScanSessionSchema = createInsertSchema(grantScanSessions).omit({
      id: true,
      startedAt: true
    });
    investmentPools = pgTable("investment_pools", {
      id: serial("id").primaryKey(),
      name: text("name").notNull(),
      slug: text("slug").notNull().unique(),
      // 'stake' | 'community' | 'growth' | 'elite'
      poolType: text("pool_type").notNull(),
      // 'stake' | 'community' | 'growth' | 'elite'
      description: text("description").notNull(),
      apyRate: real("apy_rate").notNull(),
      // 0.12 = 12% APY
      lockPeriodDays: integer("lock_period_days").notNull().default(0),
      // 0 = flexible
      minInvestment: real("min_investment").notNull().default(100),
      maxInvestment: real("max_investment"),
      // null = unlimited
      riskLevel: text("risk_level").notNull().default("low"),
      // 'low' | 'medium' | 'high'
      totalPoolSize: real("total_pool_size").notNull().default(0),
      // VEDD seeded by admin
      totalInvested: real("total_invested").notNull().default(0),
      // sum of active positions
      totalYieldPaid: real("total_yield_paid").notNull().default(0),
      isActive: boolean("is_active").notNull().default(true),
      isPaused: boolean("is_paused").notNull().default(false),
      createdBy: integer("created_by").references(() => users.id),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertInvestmentPoolSchema = createInsertSchema(investmentPools).omit({
      id: true,
      totalInvested: true,
      totalYieldPaid: true,
      createdAt: true,
      updatedAt: true
    });
    tokenInvestments = pgTable("token_investments", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      poolId: integer("pool_id").references(() => investmentPools.id).notNull(),
      amountInvested: real("amount_invested").notNull(),
      currentValue: real("current_value").notNull(),
      yieldEarned: real("yield_earned").notNull().default(0),
      status: text("status").notNull().default("active"),
      // 'active' | 'matured' | 'withdrawn' | 'cancelled'
      startDate: timestamp("start_date").defaultNow().notNull(),
      maturityDate: timestamp("maturity_date"),
      // null for flexible pools
      lastYieldCalculatedAt: timestamp("last_yield_calculated_at").defaultNow().notNull(),
      withdrawnAt: timestamp("withdrawn_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertTokenInvestmentSchema = createInsertSchema(tokenInvestments).omit({
      id: true,
      currentValue: true,
      yieldEarned: true,
      status: true,
      lastYieldCalculatedAt: true,
      withdrawnAt: true,
      createdAt: true,
      updatedAt: true
    });
    landingPageQuizzes = pgTable("landing_page_quizzes", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    quizLeads = pgTable("quiz_leads", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    socialLeadScans = pgTable("social_lead_scans", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      platform: text("platform").notNull(),
      keywords: text("keywords").notNull(),
      searchUrls: jsonb("search_urls"),
      outreachKit: text("outreach_kit"),
      leadsAdded: integer("leads_added").default(0),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertLandingPageQuizSchema = createInsertSchema(landingPageQuizzes).omit({ id: true, createdAt: true, updatedAt: true });
    insertQuizLeadSchema = createInsertSchema(quizLeads).omit({ id: true, createdAt: true, updatedAt: true });
    insertSocialLeadScanSchema = createInsertSchema(socialLeadScans).omit({ id: true, createdAt: true });
    leads = pgTable("leads", {
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
      status: varchar("status", { length: 50 }).default("New"),
      subreddit: varchar("subreddit", { length: 100 }),
      followerCount: integer("follower_count").default(0),
      headline: text("headline"),
      engagementStats: text("engagement_stats"),
      suggestedReply: text("suggested_reply"),
      autoEngaged: boolean("auto_engaged").default(false),
      engagementType: varchar("engagement_type", { length: 100 }),
      createdAt: timestamp("created_at").defaultNow()
    });
    leadHunterRuns = pgTable("lead_hunter_runs", {
      id: serial("id").primaryKey(),
      date: varchar("date", { length: 20 }).notNull(),
      status: varchar("status", { length: 50 }).default("running"),
      totalScraped: integer("total_scraped").default(0),
      newLeads: integer("new_leads").default(0),
      highIntent: integer("high_intent").default(0),
      autoEngagedCount: integer("auto_engaged_count").default(0),
      platformBreakdown: text("platform_breakdown"),
      errorLog: text("error_log"),
      createdAt: timestamp("created_at").defaultNow(),
      completedAt: timestamp("completed_at")
    });
    ambassadorDailyContent = pgTable("ambassador_daily_content", {
      id: serial("id").primaryKey(),
      runDate: varchar("run_date", { length: 20 }).notNull(),
      platform: varchar("platform", { length: 50 }).notNull(),
      postType: varchar("post_type", { length: 50 }),
      contentText: text("content_text"),
      postId: varchar("post_id", { length: 255 }),
      status: varchar("status", { length: 50 }).default("generated"),
      referralLink: text("referral_link"),
      imageUrl: text("image_url"),
      createdAt: timestamp("created_at").defaultNow()
    });
    ambassadorRedditInsights = pgTable("ambassador_reddit_insights", {
      id: serial("id").primaryKey(),
      runDate: varchar("run_date", { length: 20 }).notNull(),
      subreddit: varchar("subreddit", { length: 100 }),
      insight: text("insight"),
      engagementOpportunity: text("engagement_opportunity"),
      createdAt: timestamp("created_at").defaultNow()
    });
    ambassadorRunSummary = pgTable("ambassador_run_summary", {
      id: serial("id").primaryKey(),
      runDate: varchar("run_date", { length: 20 }).notNull().unique(),
      tweetsPosted: integer("tweets_posted").default(0),
      linkedinPosts: integer("linkedin_posts").default(0),
      igCaptionsGenerated: integer("ig_captions_generated").default(0),
      redditPostsScraped: integer("reddit_posts_scraped").default(0),
      emailSent: boolean("email_sent").default(false),
      imageGenerated: boolean("image_generated").default(false),
      dayTheme: varchar("day_theme", { length: 100 }),
      createdAt: timestamp("created_at").defaultNow()
    });
    ambassadorWeeklyCalendar = pgTable("ambassador_weekly_calendar", {
      id: serial("id").primaryKey(),
      currentWeekNumber: integer("current_week_number").default(1),
      lastRunDate: varchar("last_run_date", { length: 20 }),
      lastRunDayOfWeek: varchar("last_run_day_of_week", { length: 20 }),
      totalRuns: integer("total_runs").default(0)
    });
    ambassadorDailyKpis = pgTable("ambassador_daily_kpis", {
      id: serial("id").primaryKey(),
      runDate: varchar("run_date", { length: 20 }).notNull().unique(),
      subscriberGrowthPosts: integer("subscriber_growth_posts").default(0),
      referralLinksIncluded: integer("referral_links_included").default(0),
      totalPostsPublished: integer("total_posts_published").default(0),
      estimatedReach: integer("estimated_reach").default(0),
      redditInsightsCount: integer("reddit_insights_count").default(0),
      engagementOpportunities: integer("engagement_opportunities").default(0),
      moduleTopic: text("module_topic"),
      createdAt: timestamp("created_at").defaultNow()
    });
    ambassadorHookVariations = pgTable("ambassador_hook_variations", {
      id: serial("id").primaryKey(),
      runDate: varchar("run_date", { length: 20 }).notNull(),
      variation: varchar("variation", { length: 5 }),
      hookText: text("hook_text"),
      ctaText: text("cta_text"),
      createdAt: timestamp("created_at").defaultNow()
    });
    ambassadorBonusContent = pgTable("ambassador_bonus_content", {
      id: serial("id").primaryKey(),
      runDate: varchar("run_date", { length: 20 }).notNull(),
      dayOfWeek: varchar("day_of_week", { length: 20 }),
      contentType: varchar("content_type", { length: 50 }),
      contentText: text("content_text"),
      imageUrl: text("image_url"),
      createdAt: timestamp("created_at").defaultNow()
    });
    ambassadorCommunityContent = pgTable("ambassador_community_content", {
      id: serial("id").primaryKey(),
      runDate: varchar("run_date", { length: 20 }).notNull(),
      contentType: varchar("content_type", { length: 50 }),
      contentText: text("content_text"),
      imageUrl: text("image_url"),
      createdAt: timestamp("created_at").defaultNow()
    });
    ambassadorRunStepLog = pgTable("ambassador_run_step_log", {
      id: serial("id").primaryKey(),
      runDate: varchar("run_date", { length: 20 }).notNull(),
      stepName: varchar("step_name", { length: 100 }).notNull(),
      status: varchar("status", { length: 20 }).default("completed"),
      errorMessage: text("error_message"),
      createdAt: timestamp("created_at").defaultNow()
    });
    contentStudioAssets = pgTable("content_studio_assets", {
      id: serial("id").primaryKey(),
      mimeType: text("mime_type").notNull(),
      data: text("data").notNull(),
      // base64-encoded bytes
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    contentStudioGenerations = pgTable("content_studio_generations", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      contentType: text("content_type").notNull(),
      // 'image' | 'video' | 'reel' | 'carousel'
      prompt: text("prompt"),
      title: text("title"),
      caption: text("caption"),
      assetUrl: text("asset_url"),
      // permanent URL for single-asset types (image/video/reel)
      flattenedAssetUrl: text("flattened_asset_url"),
      // slide image with caption text + optional logo baked in, ready to upload as-is
      metadata: jsonb("metadata").notNull().default({}),
      // carousel: { slides: [{heading, body, imageUrl}] }; reel: { hook, script }
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertContentStudioGenerationSchema = createInsertSchema(contentStudioGenerations).omit({
      id: true,
      createdAt: true
    });
    ambassadorMarketBriefing = pgTable("ambassador_market_briefing", {
      id: serial("id").primaryKey(),
      weekStartDate: varchar("week_start_date", { length: 20 }).notNull().unique(),
      // ISO Monday of the week
      narrativeText: text("narrative_text").notNull(),
      // JSON array: [{ symbol, direction, strategyIdea, confidenceBoost, mentionCount }]
      pairs: jsonb("pairs").notNull().default([]),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    personaPillarRotation = pgTable("persona_pillar_rotation", {
      id: serial("id").primaryKey(),
      pillar: text("pillar").notNull().unique(),
      timesUsed: integer("times_used").default(0).notNull(),
      lastUsedDate: varchar("last_used_date", { length: 20 })
    });
    personaArcState = pgTable("persona_arc_state", {
      id: integer("id").primaryKey(),
      // fixed row id=1
      currentIndex: integer("current_index").default(0).notNull(),
      loopsCompleted: integer("loops_completed").default(0).notNull()
    });
    personaContentDays = pgTable("persona_content_days", {
      id: serial("id").primaryKey(),
      contentDate: varchar("content_date", { length: 20 }).notNull(),
      pillar: text("pillar").notNull(),
      theme: text("theme").notNull(),
      arcStage: text("arc_stage").notNull(),
      arcIndex: integer("arc_index").notNull(),
      goal: text("goal"),
      platformsCount: integer("platforms_count").default(8).notNull(),
      emailSent: boolean("email_sent").default(false),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    blogPosts = pgTable("blog_posts", {
      id: serial("id").primaryKey(),
      title: text("title").notNull(),
      slug: text("slug").notNull().unique(),
      excerpt: text("excerpt").notNull(),
      content: text("content").notNull(),
      // HTML content
      category: text("category").notNull().default("Trading Strategy"),
      tags: jsonb("tags").default([]),
      // string[]
      coverImage: text("cover_image"),
      // URL or null
      authorId: integer("author_id").references(() => users.id),
      authorName: text("author_name").default("VEDD Team"),
      isPublished: boolean("is_published").default(false),
      isFeatured: boolean("is_featured").default(false),
      aiGenerated: boolean("ai_generated").default(false),
      currentEventsContext: text("current_events_context"),
      // what news was used
      readTime: text("read_time").default("5 min read"),
      viewCount: integer("view_count").default(0),
      publishedAt: timestamp("published_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertBlogPostSchema = createInsertSchema(blogPosts).omit({ id: true, createdAt: true, updatedAt: true });
    blogNewsletterSubscribers = pgTable("blog_newsletter_subscribers", {
      id: serial("id").primaryKey(),
      email: text("email").notNull().unique(),
      referralCode: text("referral_code"),
      sourceSlug: text("source_slug"),
      // which article they subscribed from
      status: text("status").notNull().default("subscribed"),
      // 'subscribed' | 'unsubscribed'
      subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
      unsubscribedAt: timestamp("unsubscribed_at")
    });
    insertBlogNewsletterSubscriberSchema = createInsertSchema(blogNewsletterSubscribers).omit({
      id: true,
      subscribedAt: true,
      unsubscribedAt: true
    });
    ambassadorJourney = pgTable("ambassador_journey", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    ambassadorDailyActions = pgTable("ambassador_daily_actions", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      day: integer("day").notNull(),
      actionType: text("action_type").notNull(),
      platform: text("platform").notNull(),
      completed: boolean("completed").default(false).notNull(),
      completedAt: timestamp("completed_at"),
      notes: text("notes"),
      tokensAwarded: integer("tokens_awarded").default(0).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertAmbassadorJourneySchema = createInsertSchema(ambassadorJourney).omit({ id: true, createdAt: true, updatedAt: true });
    insertAmbassadorDailyActionSchema = createInsertSchema(ambassadorDailyActions).omit({ id: true, createdAt: true });
    devotionals = pgTable("devotionals", {
      id: serial("id").primaryKey(),
      date: text("date").notNull().unique(),
      // "2026-04-19" ISO date key
      title: text("title").notNull(),
      theme: text("theme").notNull(),
      // e.g. "Excellence", "Persistence"
      scripture: text("scripture").notNull(),
      // "Proverbs 16:3"
      scriptureText: text("scripture_text").notNull(),
      reflection: text("reflection").notNull(),
      // main devotional body
      prayerPoints: jsonb("prayer_points").default([]),
      // string[]
      affirmation: text("affirmation").notNull(),
      tradingTieIn: text("trading_tie_in"),
      // how mindset applies to trading
      heroImage: text("hero_image"),
      // on-brand generated cover image (DALL-E/FLUX)
      minimumMinutes: integer("minimum_minutes").default(5),
      aiGenerated: boolean("ai_generated").default(true),
      isPublished: boolean("is_published").default(true),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    devotionalGroups = pgTable("devotional_groups", {
      id: serial("id").primaryKey(),
      devotionalId: integer("devotional_id").references(() => devotionals.id).notNull(),
      createdBy: integer("created_by").references(() => users.id).notNull(),
      inviteCode: text("invite_code").notNull().unique(),
      // 6-char alphanumeric
      city: text("city"),
      // local city label
      isActive: boolean("is_active").default(true),
      participantCount: integer("participant_count").default(1),
      completedCount: integer("completed_count").default(0),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    devotionalSessions = pgTable("devotional_sessions", {
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
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertDevotionalSchema = createInsertSchema(devotionals).omit({ id: true, createdAt: true });
    insertDevotionalGroupSchema = createInsertSchema(devotionalGroups).omit({ id: true, createdAt: true });
    insertDevotionalSessionSchema = createInsertSchema(devotionalSessions).omit({ id: true, createdAt: true });
    workforceModules = pgTable("workforce_modules", {
      id: serial("id").primaryKey(),
      title: text("title").notNull(),
      description: text("description").notNull(),
      category: text("category").notNull(),
      // 'ai_literacy'|'digital_skills'|'trading_fundamentals'|'financial_planning'|'web3_basics'|'stem'
      difficulty: text("difficulty").default("beginner"),
      // 'beginner'|'intermediate'|'advanced'
      estimatedMinutes: integer("estimated_minutes").default(30),
      content: jsonb("content"),
      // Array of { title, body, videoUrl? }
      assessmentQuestions: jsonb("assessment_questions"),
      // [{ question, options: string[], correct: number, explanation }]
      passingScore: integer("passing_score").default(70),
      targetAudience: text("target_audience").default("all"),
      // 'all'|'youth'|'community'|'ambassador'
      grantTags: jsonb("grant_tags"),
      // ['DOL', 'NSF', 'CDFI', 'EDA', 'SBA']
      isPublished: boolean("is_published").default(true),
      sortOrder: integer("sort_order").default(0),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    workforceEnrollments = pgTable("workforce_enrollments", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      moduleId: integer("module_id").references(() => workforceModules.id).notNull(),
      status: text("status").default("enrolled"),
      // 'enrolled'|'in_progress'|'completed'
      progressPct: integer("progress_pct").default(0),
      score: integer("score"),
      completedAt: timestamp("completed_at"),
      enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    workforceCertificates = pgTable("workforce_certificates", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      moduleId: integer("module_id").references(() => workforceModules.id),
      courseId: integer("course_id"),
      // client-side Workforce Academy COURSES[] id (1-13) — the actual course this certificate was earned for
      certificateType: text("certificate_type").default("module"),
      // 'module'|'program'|'ambassador'|'workforce'
      certificateId: text("certificate_id").notNull().unique(),
      // VEDD-CERT-XXXXX
      title: text("title").notNull(),
      recipientName: text("recipient_name"),
      score: integer("score"),
      ceuHours: doublePrecision("ceu_hours"),
      grantFrameworks: jsonb("grant_frameworks"),
      onetCode: text("onet_code"),
      issuedAt: timestamp("issued_at").defaultNow().notNull()
    });
    impactMetrics = pgTable("impact_metrics", {
      id: serial("id").primaryKey(),
      metricType: text("metric_type").notNull(),
      // 'enrollment'|'completion'|'job_placement'|'skills_gain'|'community_reach'|'partner_engagement'
      value: integer("value").default(0),
      grantTag: text("grant_tag"),
      // Which grant program this metric supports
      period: text("period"),
      // 'Q1_2025', 'Q2_2025', etc.
      demographicData: jsonb("demographic_data"),
      // { ageGroup, geography, incomeLevel, ethnicity }
      notes: text("notes"),
      recordedAt: timestamp("recorded_at").defaultNow().notNull()
    });
    communityPartnerships = pgTable("community_partnerships", {
      id: serial("id").primaryKey(),
      organizationName: text("organization_name").notNull(),
      partnerType: text("partner_type").notNull(),
      // 'nonprofit'|'school'|'workforce_board'|'church'|'cdfi'|'government'
      contactName: text("contact_name"),
      contactEmail: text("contact_email"),
      status: text("status").default("active"),
      // 'prospect'|'active'|'reporting'|'inactive'
      programsSupported: jsonb("programs_supported"),
      // ['workforce_academy', 'financial_literacy', 'youth_stem']
      participantsReferred: integer("participants_referred").default(0),
      mou: boolean("mou").default(false),
      // Memorandum of Understanding signed
      notes: text("notes"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    auditLogs = pgTable("audit_logs", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id),
      action: text("action").notNull(),
      // 'ai_decision'|'data_access'|'model_run'|'bias_check'|'policy_update'|'ethics_review'
      resource: text("resource"),
      // 'chart_analysis'|'grant_proposal'|'user_data'|'curriculum'
      details: jsonb("details"),
      ipAddress: text("ip_address"),
      outcome: text("outcome").default("success"),
      // 'success'|'flagged'|'blocked'|'reviewed'
      riskLevel: text("risk_level").default("low"),
      // 'low'|'medium'|'high'
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    biasReports = pgTable("bias_reports", {
      id: serial("id").primaryKey(),
      triggeredBy: integer("triggered_by").references(() => users.id),
      scanScope: text("scan_scope").notNull(),
      // 'full'|'curriculum'|'ai_outputs'|'recommendations'
      findingsCount: integer("findings_count").default(0),
      riskScore: integer("risk_score").default(0),
      // 0-100
      findings: jsonb("findings"),
      // [{ category, severity, description, recommendation }]
      status: text("status").default("pending"),
      // 'pending'|'running'|'completed'|'reviewed'
      reviewedBy: integer("reviewed_by").references(() => users.id),
      reviewNotes: text("review_notes"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      completedAt: timestamp("completed_at")
    });
    innovationProjects = pgTable("innovation_projects", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      title: text("title").notNull(),
      category: text("category").notNull(),
      // 'algorithm'|'wearable_ai'|'community_finance'|'ai_ethics'|'workforce_tech'
      hypothesis: text("hypothesis"),
      methodology: text("methodology"),
      dataPoints: jsonb("data_points"),
      // Experiment data collected
      status: text("status").default("active"),
      // 'active'|'paused'|'published'|'archived'
      tags: jsonb("tags"),
      grantAlignment: text("grant_alignment"),
      // Which grant type this research supports
      reportContent: text("report_content"),
      // Generated innovation report
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertWorkforceModuleSchema = createInsertSchema(workforceModules).omit({ id: true, createdAt: true, updatedAt: true });
    insertWorkforceEnrollmentSchema = createInsertSchema(workforceEnrollments).omit({ id: true, enrolledAt: true, updatedAt: true });
    insertWorkforceCertificateSchema = createInsertSchema(workforceCertificates).omit({ id: true, issuedAt: true });
    workforceCourseProgress = pgTable("workforce_course_progress", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      courseId: integer("course_id").notNull(),
      // client-side Workforce Academy COURSES[] id — same numbering as workforceCertificates.courseId
      currentLesson: integer("current_lesson").notNull().default(1),
      progressPct: integer("progress_pct").notNull().default(0),
      completed: boolean("completed").notNull().default(false),
      score: integer("score"),
      enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (t) => ({
      unq: unique().on(t.userId, t.courseId)
    }));
    insertImpactMetricSchema = createInsertSchema(impactMetrics).omit({ id: true, recordedAt: true });
    insertCommunityPartnershipSchema = createInsertSchema(communityPartnerships).omit({ id: true, createdAt: true, updatedAt: true });
    insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
    insertBiasReportSchema = createInsertSchema(biasReports).omit({ id: true, createdAt: true });
    insertInnovationProjectSchema = createInsertSchema(innovationProjects).omit({ id: true, createdAt: true, updatedAt: true });
    stopOrders = pgTable("stop_orders", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      symbol: text("symbol").notNull(),
      direction: text("direction").notNull(),
      // 'BUY_STOP' | 'SELL_STOP'
      triggerPrice: real("trigger_price").notNull(),
      // Price at which order fires
      lotSize: real("lot_size").notNull(),
      stopLoss: real("stop_loss"),
      takeProfit: real("take_profit"),
      status: text("status").notNull().default("PENDING"),
      // 'PENDING'|'TRIGGERED'|'CANCELLED'
      breakoutLevel: real("breakout_level"),
      // Key level that prompted the order
      notes: text("notes"),
      triggeredAt: timestamp("triggered_at"),
      cancelledAt: timestamp("cancelled_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertStopOrderSchema = createInsertSchema(stopOrders, {
      direction: z.enum(["BUY_STOP", "SELL_STOP"]),
      triggerPrice: z.number().positive("Trigger price must be positive"),
      lotSize: z.number().positive("Lot size must be positive"),
      stopLoss: z.number().positive().optional(),
      takeProfit: z.number().positive().optional(),
      breakoutLevel: z.number().optional(),
      notes: z.string().max(500).optional()
    }).omit({ id: true, status: true, triggeredAt: true, cancelledAt: true, createdAt: true, updatedAt: true });
    allTimeRecords = pgTable("all_time_records", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      recordType: text("record_type").notNull().default("best_daily_pnl"),
      value: real("value").notNull().default(0),
      achievedAt: timestamp("achieved_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (t) => ({
      unq: unique().on(t.userId, t.recordType)
    }));
    fxPaperAccounts = pgTable("fx_paper_accounts", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      balance: real("balance").notNull().default(1e4),
      initialBalance: real("initial_balance").notNull().default(1e4),
      isEnabled: boolean("is_enabled").notNull().default(false),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    fxPaperTrades = pgTable("fx_paper_trades", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      pair: text("pair").notNull(),
      direction: text("direction").notNull(),
      // 'BUY' | 'SELL'
      entryPrice: real("entry_price").notNull(),
      exitPrice: real("exit_price"),
      stopLoss: real("stop_loss"),
      takeProfit: real("take_profit"),
      lotSize: real("lot_size").notNull().default(0.01),
      pnl: real("pnl"),
      pnlPips: real("pnl_pips"),
      status: text("status").notNull().default("open"),
      // 'open' | 'closed'
      confidence: real("confidence"),
      source: text("source").default("fx_paper_engine"),
      openedAt: timestamp("opened_at").defaultNow().notNull(),
      closedAt: timestamp("closed_at")
    });
    insertFxPaperTradeSchema = createInsertSchema(fxPaperTrades).omit({
      id: true,
      openedAt: true,
      closedAt: true,
      exitPrice: true,
      pnl: true,
      pnlPips: true,
      status: true
    });
    copyRelationships = pgTable("copy_relationships", {
      id: serial("id").primaryKey(),
      copierId: integer("copier_id").references(() => users.id).notNull(),
      sourceUserId: integer("source_user_id").references(() => users.id).notNull(),
      accountType: text("account_type").notNull().default("paper"),
      // 'paper' | 'real'
      maxLotSize: real("max_lot_size").notNull().default(0.01),
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      // Added via idempotent ALTER TABLE in server/index.ts boot migration —
      // declared here too so the Drizzle-typed side matches the raw-SQL side.
      profitSharePct: real("profit_share_pct").notNull().default(20),
      veddFeePaid: real("vedd_fee_paid").notNull().default(0),
      // Which of the copier's own TradeLocker connections real-mode copying
      // executes on. Required (enforced at the route level) when accountType='real'.
      copierConnectionId: integer("copier_connection_id")
    }, (t) => ({
      unq: unique().on(t.copierId, t.sourceUserId)
    }));
    copyTradeLogs = pgTable("copy_trade_logs", {
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
      executionStatus: text("execution_status").default("pending"),
      // 'pending' | 'placed' | 'failed' | 'skipped'
      executionError: text("execution_error")
    });
    engineRunState = pgTable("engine_run_state", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").notNull().references(() => users.id),
      engine: text("engine").notNull(),
      // 'polymarket' | 'kalshi'
      isRunning: boolean("is_running").notNull().default(false),
      isPaperMode: boolean("is_paper_mode").notNull().default(true),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (t) => ({
      uniq: unique("engine_run_state_user_engine_idx").on(t.userId, t.engine)
    }));
    kalshiEngineConfigs = pgTable("kalshi_engine_configs", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull().unique(),
      config: jsonb("config").notNull().default({}),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    kalshiBrainOutcomes = pgTable("kalshi_brain_outcomes", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      coin: text("coin").notNull(),
      timeframe: text("timeframe").notNull(),
      // 'hourly' | 'fifteen_min'
      strategy: text("strategy").notNull(),
      direction: text("direction").notNull(),
      // 'BUY' | 'SELL'
      strikeType: text("strike_type"),
      // greater/less/between/…
      entryPriceCents: integer("entry_price_cents"),
      confidence: doublePrecision("confidence"),
      // signal confidence 0-100
      edgePct: doublePrecision("edge_pct"),
      // value-pick edge (null for single-strategy)
      valueScore: doublePrecision("value_score"),
      modelProbPct: doublePrecision("model_prob_pct"),
      agreement: doublePrecision("agreement"),
      hourUtc: integer("hour_utc"),
      // 0-23 entry hour (UTC)
      holdingMinutes: integer("holding_minutes"),
      exitReason: text("exit_reason"),
      // take_profit/stop_loss/settlement/manual
      result: text("result").notNull(),
      // WIN | LOSS | BREAKEVEN
      profitLoss: doublePrecision("profit_loss").notNull(),
      source: text("source").notNull().default("live"),
      // 'live' | 'backfill' | 'purchased_brain'
      closedAt: timestamp("closed_at").defaultNow().notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    optionsBrainOutcomes = pgTable("options_brain_outcomes", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").references(() => users.id).notNull(),
      underlyingSymbol: text("underlying_symbol").notNull(),
      optionType: text("option_type").notNull(),
      // 'call' | 'put'
      strategy: text("strategy").notNull(),
      direction: text("direction"),
      // 'bullish' | 'bearish'
      entryConfidence: doublePrecision("entry_confidence"),
      returnPct: doublePrecision("return_pct"),
      // premium % return at close
      hourUtc: integer("hour_utc"),
      // 0-23 close hour (UTC)
      holdingMinutes: integer("holding_minutes"),
      exitReason: text("exit_reason"),
      // take_profit/stop_loss/trailing_stop/manual
      result: text("result").notNull(),
      // WIN | LOSS | BREAKEVEN
      profitLoss: doublePrecision("profit_loss").notNull(),
      contracts: integer("contracts"),
      source: text("source").notNull().default("live"),
      // 'live' | 'backfill' | 'purchased_brain'
      closedAt: timestamp("closed_at").defaultNow().notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    bizEntityTypeEnum = pgEnum("biz_entity_type", ["llc", "s_corp", "c_corp", "sole_prop"]);
    bizStatusEnum = pgEnum("biz_status", ["draft", "name_check", "formation", "ein_pending", "banking", "credit_building", "funded"]);
    nameCheckSourceEnum = pgEnum("name_check_source", ["ai_generated", "sos_lookup"]);
    formationProviderEnum = pgEnum("formation_provider", ["stripe_atlas", "incfile", "zenbusiness"]);
    bankProviderEnum = pgEnum("bank_provider", ["mercury", "relay", "found"]);
    creditTaskTypeEnum = pgEnum("credit_task_type", ["net30", "credit_monitoring", "duns_registration", "trade_line"]);
    taskStatusEnum = pgEnum("task_status", ["pending", "in_progress", "complete"]);
    funderTypeEnum = pgEnum("funder_type", ["grant", "cdfi", "sponsor", "microloan", "revenue_share"]);
    bizProfiles = pgTable("biz_profiles", {
      id: serial("id").primaryKey(),
      userId: integer("user_id").notNull().references(() => users.id),
      businessName: text("business_name"),
      businessIdea: text("business_idea").notNull(),
      entityType: bizEntityTypeEnum("entity_type").notNull().default("llc"),
      state: text("state").notNull(),
      status: bizStatusEnum("status").notNull().default("draft"),
      aiDescription: text("ai_description"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    bizNameChecks = pgTable("biz_name_checks", {
      id: serial("id").primaryKey(),
      bizProfileId: integer("biz_profile_id").notNull().references(() => bizProfiles.id),
      nameChecked: text("name_checked").notNull(),
      available: boolean("available").notNull().default(true),
      source: nameCheckSourceEnum("source").notNull().default("ai_generated"),
      checkedAt: timestamp("checked_at").defaultNow().notNull()
    });
    bizFormationLinks = pgTable("biz_formation_links", {
      id: serial("id").primaryKey(),
      bizProfileId: integer("biz_profile_id").notNull().references(() => bizProfiles.id),
      provider: formationProviderEnum("provider").notNull(),
      redirectUrl: text("redirect_url").notNull(),
      status: text("status").notNull().default("pending"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    bizBankLinks = pgTable("biz_bank_links", {
      id: serial("id").primaryKey(),
      bizProfileId: integer("biz_profile_id").notNull().references(() => bizProfiles.id),
      provider: bankProviderEnum("provider").notNull(),
      referralUrl: text("referral_url").notNull(),
      status: text("status").notNull().default("not_started"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    bizCreditTasks = pgTable("biz_credit_tasks", {
      id: serial("id").primaryKey(),
      bizProfileId: integer("biz_profile_id").notNull().references(() => bizProfiles.id),
      taskName: text("task_name").notNull(),
      taskType: creditTaskTypeEnum("task_type").notNull(),
      provider: text("provider"),
      url: text("url"),
      status: taskStatusEnum("status").notNull().default("pending"),
      dueDate: date("due_date"),
      notes: text("notes"),
      completedAt: timestamp("completed_at")
    });
    bizFundingMatches = pgTable("biz_funding_matches", {
      id: serial("id").primaryKey(),
      bizProfileId: integer("biz_profile_id").notNull().references(() => bizProfiles.id),
      funderName: text("funder_name").notNull(),
      funderType: funderTypeEnum("funder_type").notNull(),
      matchScore: integer("match_score").notNull().default(0),
      amountRange: text("amount_range"),
      applyUrl: text("apply_url"),
      notes: text("notes"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
  }
});

// server/storage.ts
var storage_exports = {};
__export(storage_exports, {
  DatabaseStorage: () => DatabaseStorage,
  storage: () => storage
});
import { eq, and, sql, desc, isNull, gte, inArray } from "drizzle-orm";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import crypto from "crypto";
function getEncryptionKey() {
  if (ENCRYPTION_KEY && ENCRYPTION_KEY.length >= 64) {
    return Buffer.from(ENCRYPTION_KEY.substring(0, 64), "hex");
  }
  return crypto.createHash("sha256").update(process.env.DATABASE_URL || "vedd-ai-trading-vault-default").digest();
}
function encryptApiKey(plainKey) {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(plainKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}
function decryptApiKey(encryptedKey) {
  try {
    const parts = encryptedKey.split(":");
    if (parts.length !== 2) return encryptedKey;
    const iv = Buffer.from(parts[0], "hex");
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    let decrypted = decipher.update(parts[1], "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return encryptedKey;
  }
}
var ENCRYPTION_KEY, ENCRYPTION_ALGORITHM, DatabaseStorage, storage;
var init_storage = __esm({
  "server/storage.ts"() {
    "use strict";
    init_schema();
    init_db();
    ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET;
    ENCRYPTION_ALGORITHM = "aes-256-cbc";
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 64) {
      console.warn("API_KEY_ENCRYPTION_SECRET not set or too short. User API key encryption will use a derived key.");
    }
    DatabaseStorage = class {
      sessionStore;
      constructor() {
        const PgStore = connectPgSimple(session);
        this.sessionStore = new PgStore({
          pool,
          tableName: "session",
          createTableIfMissing: true
        });
      }
      async getUser(id) {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user;
      }
      async getUserByUsername(username) {
        const [user] = await db.select().from(users).where(eq(users.username, username));
        return user;
      }
      async getUserByEmail(email) {
        const [user] = await db.select().from(users).where(eq(users.email, email));
        return user;
      }
      async createUser(insertUser) {
        const [user] = await db.insert(users).values({
          ...insertUser,
          email: insertUser.email || "",
          fullName: insertUser.fullName || null,
          profileImage: insertUser.profileImage || null
        }).returning();
        return user;
      }
      async createChartAnalysis(analysis) {
        if (!analysis.imageUrl || !analysis.direction || !analysis.trend || !analysis.confidence || !analysis.entryPoint || !analysis.exitPoint || !analysis.stopLoss || !analysis.takeProfit || !analysis.patterns || !analysis.indicators) {
          throw new Error("Missing required fields for chart analysis");
        }
        const [chartAnalysis] = await db.insert(chartAnalyses).values({
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
          recommendation: analysis.recommendation || null
        }).returning();
        return chartAnalysis;
      }
      async getChartAnalysis(id) {
        const [analysis] = await db.select().from(chartAnalyses).where(eq(chartAnalyses.id, id));
        return analysis;
      }
      async getChartAnalysesByUserId(userId) {
        return db.select().from(chartAnalyses).where(eq(chartAnalyses.userId, userId));
      }
      async getAllChartAnalyses() {
        return db.select().from(chartAnalyses);
      }
      async updateChartAnalysis(id, data) {
        const [updatedAnalysis] = await db.update(chartAnalyses).set(data).where(eq(chartAnalyses.id, id)).returning();
        return updatedAnalysis;
      }
      async shareChartAnalysis(id, notes) {
        const shareId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
        const [sharedAnalysis] = await db.update(chartAnalyses).set({
          shareId,
          isPublic: true,
          notes: notes || null
        }).where(eq(chartAnalyses.id, id)).returning();
        return sharedAnalysis;
      }
      async getAnalysisByShareId(shareId) {
        const [analysis] = await db.select().from(chartAnalyses).where(eq(chartAnalyses.shareId, shareId)).limit(1);
        return analysis;
      }
      async updateUser(id, userData) {
        const [updatedUser] = await db.update(users).set({
          ...userData,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(users.id, id)).returning();
        return updatedUser;
      }
      async updateUserPassword(id, hashedPassword) {
        const [updatedUser] = await db.update(users).set({
          password: hashedPassword,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(users.id, id)).returning();
        return updatedUser;
      }
      async getAllUsers() {
        return db.select().from(users);
      }
      // Achievement methods
      async createAchievement(achievement) {
        const [newAchievement] = await db.insert(achievements).values(achievement).returning();
        return newAchievement;
      }
      async getAchievement(id) {
        const [achievement] = await db.select().from(achievements).where(eq(achievements.id, id));
        return achievement;
      }
      async getAllAchievements() {
        return db.select().from(achievements);
      }
      async getAchievementsByCategory(category) {
        return db.select().from(achievements).where(eq(achievements.category, category));
      }
      // User Achievement methods
      async createUserAchievement(userAchievement) {
        const [newUserAchievement] = await db.insert(userAchievements).values(userAchievement).returning();
        return newUserAchievement;
      }
      async getUserAchievements(userId) {
        const result = await db.select({
          userAchievement: userAchievements,
          achievement: achievements
        }).from(userAchievements).innerJoin(achievements, eq(userAchievements.achievementId, achievements.id)).where(eq(userAchievements.userId, userId));
        return result.map((row) => ({
          ...row.userAchievement,
          achievement: row.achievement
        }));
      }
      async updateUserAchievementProgress(id, progress) {
        const [updatedUserAchievement] = await db.update(userAchievements).set({
          progress
        }).where(eq(userAchievements.id, id)).returning();
        return updatedUserAchievement;
      }
      async completeUserAchievement(id) {
        const [completedUserAchievement] = await db.update(userAchievements).set({
          isCompleted: true,
          progress: sql`${userAchievements.progress} + 1`,
          unlockedAt: /* @__PURE__ */ new Date()
        }).where(eq(userAchievements.id, id)).returning();
        return completedUserAchievement;
      }
      // User Profile methods
      async getUserProfile(userId) {
        const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
        return profile;
      }
      async createUserProfile(profile) {
        const [newProfile] = await db.insert(userProfiles).values(profile).returning();
        return newProfile;
      }
      async updateUserProfile(userId, data) {
        const [updatedProfile] = await db.update(userProfiles).set({
          ...data,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(userProfiles.userId, userId)).returning();
        return updatedProfile;
      }
      // Follow methods
      async followUser(followerId, followingId) {
        if (followerId === followingId) {
          throw new Error("Cannot follow yourself");
        }
        const [follow] = await db.insert(follows).values({
          followerId,
          followingId
        }).returning();
        await db.update(userProfiles).set({
          following: sql`${userProfiles.following} + 1`
        }).where(eq(userProfiles.userId, followerId));
        await db.update(userProfiles).set({
          followers: sql`${userProfiles.followers} + 1`
        }).where(eq(userProfiles.userId, followingId));
        return follow;
      }
      async unfollowUser(followerId, followingId) {
        const result = await db.delete(follows).where(and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId)
        ));
        if (result.count > 0) {
          await db.update(userProfiles).set({
            following: sql`${userProfiles.following} - 1`
          }).where(eq(userProfiles.userId, followerId));
          await db.update(userProfiles).set({
            followers: sql`${userProfiles.followers} - 1`
          }).where(eq(userProfiles.userId, followingId));
          return true;
        }
        return false;
      }
      async getFollowers(userId) {
        const followersResult = await db.select({
          user: users
        }).from(follows).innerJoin(users, eq(follows.followerId, users.id)).where(eq(follows.followingId, userId));
        return followersResult.map((row) => row.user);
      }
      async getFollowing(userId) {
        const followingResult = await db.select({
          user: users
        }).from(follows).innerJoin(users, eq(follows.followingId, users.id)).where(eq(follows.followerId, userId));
        return followingResult.map((row) => row.user);
      }
      async isFollowing(followerId, followingId) {
        const [follow] = await db.select().from(follows).where(and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId)
        ));
        return !!follow;
      }
      // Analysis Feedback methods
      async addAnalysisFeedback(feedback) {
        const [newFeedback] = await db.insert(analysisFeedback).values(feedback).returning();
        return newFeedback;
      }
      async removeAnalysisFeedback(analysisId, userId, feedbackType) {
        const result = await db.delete(analysisFeedback).where(and(
          eq(analysisFeedback.analysisId, analysisId),
          eq(analysisFeedback.userId, userId),
          eq(analysisFeedback.feedbackType, feedbackType)
        ));
        return result.count > 0;
      }
      async getAnalysisFeedback(analysisId) {
        return db.select().from(analysisFeedback).where(eq(analysisFeedback.analysisId, analysisId));
      }
      // Missing methods from IStorage interface
      async getPublicChartAnalyses(limit = 10) {
        return db.select().from(chartAnalyses).where(eq(chartAnalyses.isPublic, true)).orderBy(sql`${chartAnalyses.createdAt} DESC`).limit(limit);
      }
      async getAnalysisFeed(userId, limit = 20) {
        const followingUserIds = (await this.getFollowing(userId)).map((user) => user.id);
        if (followingUserIds.length === 0) {
          return this.getPopularAnalyses(limit);
        }
        return db.select().from(chartAnalyses).where(and(
          eq(chartAnalyses.isPublic, true),
          sql`${chartAnalyses.userId} IN (${followingUserIds.join(",")})`
        )).orderBy(sql`${chartAnalyses.createdAt} DESC`).limit(limit);
      }
      async getPopularAnalyses(limit = 10) {
        return db.select().from(chartAnalyses).where(eq(chartAnalyses.isPublic, true)).orderBy(sql`${chartAnalyses.createdAt} DESC`).limit(limit);
      }
      // Referral methods
      async generateReferralCode(userId) {
        const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `${userId.toString(36)}${randomPart}`;
      }
      // saveReferralCode and getUserByReferralCode implemented further below with real DB columns
      async recordReferral(referrerId, referredId) {
        const [newReferral] = await db.insert(referrals).values({
          referrerId,
          referredId,
          status: "pending"
        }).returning();
        return newReferral;
      }
      async getReferrals(userId) {
        return db.select().from(referrals).where(eq(referrals.referrerId, userId));
      }
      async completeReferral(referralId) {
        const [updatedReferral] = await db.update(referrals).set({
          status: "completed",
          completedAt: /* @__PURE__ */ new Date()
        }).where(eq(referrals.id, referralId)).returning();
        if (updatedReferral) {
          await this.addReferralCredits(updatedReferral.referrerId, updatedReferral.creditAmount);
        }
        return updatedReferral;
      }
      async getReferralLeaderboard(limit = 10) {
        const leaderboard = await db.execute(sql`
      SELECT u.username, COUNT(r.id) as referrals
      FROM ${referrals} r
      JOIN ${users} u ON r.referrer_id = u.id
      WHERE r.status = 'completed'
      GROUP BY u.username
      ORDER BY referrals DESC
      LIMIT ${limit}
    `);
        return leaderboard.rows.map((row) => ({
          username: row.username,
          referrals: parseInt(row.referrals, 10)
        }));
      }
      async addReferralCredits(userId, credits) {
        const current = await db.select().from(users).where(eq(users.id, userId));
        if (!current[0]) return void 0;
        const currentBalance = current[0].referralCredits ?? 0;
        const [updatedUser] = await db.update(users).set({ referralCredits: currentBalance + credits, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, userId)).returning();
        return updatedUser;
      }
      async saveReferralCode(userId, code) {
        const [updated] = await db.update(users).set({ referralCode: code }).where(eq(users.id, userId)).returning();
        return updated;
      }
      async getUserByReferralCode(code) {
        const [user] = await db.select().from(users).where(eq(users.referralCode, code));
        return user;
      }
      async trackReferralVisit(data) {
        const referrer = await this.getUserByReferralCode(data.referralCode);
        const [visit] = await db.insert(referralVisits).values({
          referralCode: data.referralCode,
          referrerId: referrer?.id ?? null,
          visitorIp: data.visitorIp ?? null,
          userAgent: data.userAgent ?? null
        }).returning();
        return visit;
      }
      async getReferralStats(userId) {
        const user = await this.getUser(userId);
        const code = user?.referralCode;
        if (!code) return { totalClicks: 0, signedUp: 0, subscribed: 0, notSubscribed: 0, pendingReminder: 0 };
        const visits = await db.select().from(referralVisits).where(eq(referralVisits.referralCode, code));
        const totalClicks = visits.length;
        const signedUpVisits = visits.filter((v) => v.signedUp);
        const signedUp = signedUpVisits.length;
        const subscribed = signedUpVisits.filter((v) => v.subscribed).length;
        const notSubscribed = signedUp - subscribed;
        const pendingReminder = signedUpVisits.filter((v) => !v.subscribed && !v.reminderSent).length;
        return { totalClicks, signedUp, subscribed, notSubscribed, pendingReminder };
      }
      async markReferralSignup(referralCode, visitorId) {
        await db.update(referralVisits).set({ visitorId, signedUp: true, signedUpAt: /* @__PURE__ */ new Date() }).where(eq(referralVisits.referralCode, referralCode));
      }
      async markReferralSubscribed(visitorId) {
        await db.update(referralVisits).set({ subscribed: true, subscribedAt: /* @__PURE__ */ new Date() }).where(eq(referralVisits.visitorId, visitorId));
      }
      async sendReferralReminders(referrerId) {
        const user = await this.getUser(referrerId);
        const code = user?.referralCode;
        if (!code) return 0;
        const unreminded = await db.select().from(referralVisits).where(eq(referralVisits.referralCode, code));
        const targets = unreminded.filter((v) => v.signedUp && !v.subscribed && !v.reminderSent && v.visitorId);
        for (const visit of targets) {
          if (visit.visitorId) {
            await db.update(referralVisits).set({ reminderSent: true, reminderSentAt: /* @__PURE__ */ new Date() }).where(eq(referralVisits.id, visit.id));
          }
        }
        return targets.length;
      }
      async getDmKeywords(userId) {
        return db.select().from(dmKeywords).where(eq(dmKeywords.userId, userId));
      }
      async createDmKeyword(data) {
        const [kw] = await db.insert(dmKeywords).values(data).returning();
        return kw;
      }
      async updateDmKeyword(id, userId, data) {
        const [updated] = await db.update(dmKeywords).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(dmKeywords.id, id)).returning();
        return updated;
      }
      async deleteDmKeyword(id, userId) {
        const result = await db.delete(dmKeywords).where(eq(dmKeywords.id, id));
        return true;
      }
      async incrementDmTrigger(id) {
        await db.update(dmKeywords).set({ triggerCount: sql`trigger_count + 1`, lastTriggeredAt: /* @__PURE__ */ new Date() }).where(eq(dmKeywords.id, id));
      }
      // ── Investment Pool Implementations ──────────────────────────────────────────
      async getInvestmentPools(activeOnly = true) {
        if (activeOnly) {
          return db.select().from(investmentPools).where(eq(investmentPools.isActive, true));
        }
        return db.select().from(investmentPools);
      }
      async getInvestmentPool(id) {
        const [pool2] = await db.select().from(investmentPools).where(eq(investmentPools.id, id));
        return pool2;
      }
      async getInvestmentPoolBySlug(slug) {
        const [pool2] = await db.select().from(investmentPools).where(eq(investmentPools.slug, slug));
        return pool2;
      }
      async createInvestmentPool(data) {
        const [pool2] = await db.insert(investmentPools).values(data).returning();
        return pool2;
      }
      async updateInvestmentPool(id, data) {
        const [pool2] = await db.update(investmentPools).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(investmentPools.id, id)).returning();
        return pool2;
      }
      async getUserInvestments(userId) {
        return db.select().from(tokenInvestments).where(eq(tokenInvestments.userId, userId));
      }
      async getUserActiveInvestments(userId) {
        return db.select().from(tokenInvestments).where(eq(tokenInvestments.userId, userId));
      }
      async getInvestment(id) {
        const [inv] = await db.select().from(tokenInvestments).where(eq(tokenInvestments.id, id));
        return inv;
      }
      async createInvestment(data) {
        const [inv] = await db.insert(tokenInvestments).values({
          userId: data.userId,
          poolId: data.poolId,
          amountInvested: data.amountInvested,
          currentValue: data.amountInvested,
          // starts equal to principal
          yieldEarned: 0,
          status: "active",
          maturityDate: data.maturityDate
        }).returning();
        await db.update(investmentPools).set({ totalInvested: sql`total_invested + ${data.amountInvested}`, updatedAt: /* @__PURE__ */ new Date() }).where(eq(investmentPools.id, data.poolId));
        return inv;
      }
      async updateInvestment(id, data) {
        const [inv] = await db.update(tokenInvestments).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(tokenInvestments.id, id)).returning();
        return inv;
      }
      async getInvestmentsNeedingYieldUpdate() {
        const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1e3);
        return db.select().from(tokenInvestments).where(eq(tokenInvestments.status, "active"));
      }
      async getUserInvestmentSummary(userId) {
        const investments = await db.select().from(tokenInvestments).where(eq(tokenInvestments.userId, userId));
        const nonCancelled = investments.filter((i) => i.status !== "cancelled");
        const active = investments.filter((i) => i.status === "active" || i.status === "matured");
        const totalInvested = nonCancelled.reduce((sum, i) => sum + i.amountInvested, 0);
        const totalCurrentValue = nonCancelled.reduce((sum, i) => sum + i.currentValue, 0);
        const totalYieldEarned = nonCancelled.reduce((sum, i) => sum + i.yieldEarned, 0);
        const roiPercent = totalInvested > 0 ? (totalCurrentValue - totalInvested) / totalInvested * 100 : 0;
        return { totalInvested, totalCurrentValue, totalYieldEarned, roiPercent, activeCount: active.length };
      }
      async getAllActiveInvestments() {
        return db.select().from(tokenInvestments).where(eq(tokenInvestments.status, "active"));
      }
      async createTradingStrategy(strategy) {
        console.log("Trading strategy would be saved:", {
          symbol: strategy.symbol,
          platformType: strategy.platformType,
          timeframes: strategy.timeframes?.length
        });
        return Date.now();
      }
      async createPriceAlert(alert) {
        const [createdAlert] = await db.insert(priceAlerts).values(alert).returning();
        return createdAlert;
      }
      async getPriceAlert(id) {
        const [alert] = await db.select().from(priceAlerts).where(eq(priceAlerts.id, id));
        return alert;
      }
      async getUserPriceAlerts(userId) {
        return await db.select().from(priceAlerts).where(eq(priceAlerts.userId, userId)).orderBy(sql`${priceAlerts.createdAt} DESC`);
      }
      async updatePriceAlert(id, data) {
        const [updatedAlert] = await db.update(priceAlerts).set(data).where(eq(priceAlerts.id, id)).returning();
        return updatedAlert;
      }
      async deletePriceAlert(id) {
        const result = await db.delete(priceAlerts).where(eq(priceAlerts.id, id));
        return true;
      }
      async getActivePriceAlerts() {
        return await db.select().from(priceAlerts).where(and(
          eq(priceAlerts.isActive, true),
          eq(priceAlerts.isTriggered, false)
        ));
      }
      async triggerPriceAlert(id) {
        const [triggeredAlert] = await db.update(priceAlerts).set({
          isTriggered: true,
          triggeredAt: /* @__PURE__ */ new Date()
        }).where(eq(priceAlerts.id, id)).returning();
        return triggeredAlert;
      }
      async savEA(ea) {
        const [savedEA] = await db.insert(savedEAs).values(ea).returning();
        return savedEA;
      }
      async getSavedEA(id) {
        const [ea] = await db.select().from(savedEAs).where(eq(savedEAs.id, id));
        return ea;
      }
      async getUserSavedEAs(userId) {
        return await db.select().from(savedEAs).where(eq(savedEAs.userId, userId)).orderBy(sql`${savedEAs.createdAt} DESC`);
      }
      async updateSavedEA(id, data) {
        const [updated] = await db.update(savedEAs).set(data).where(eq(savedEAs.id, id)).returning();
        return updated;
      }
      async deleteSavedEA(id) {
        await db.delete(savedEAs).where(eq(savedEAs.id, id));
        return true;
      }
      async shareEA(eaId, price) {
        const [ea] = await db.update(savedEAs).set({
          isShared: true,
          price
        }).where(eq(savedEAs.id, eaId)).returning();
        return ea;
      }
      async unshareEA(eaId) {
        const [ea] = await db.update(savedEAs).set({
          isShared: false
        }).where(eq(savedEAs.id, eaId)).returning();
        return ea;
      }
      async getSharedEAs(limit) {
        const query = db.select().from(savedEAs).where(eq(savedEAs.isShared, true)).orderBy(sql`${savedEAs.shareCount} DESC`);
        if (limit) {
          return await query.limit(limit);
        }
        return await query;
      }
      async subscribeToEA(subscription) {
        const [sub] = await db.insert(eaSubscriptions).values(subscription).returning();
        return sub;
      }
      async getEASubscription(id) {
        const [sub] = await db.select().from(eaSubscriptions).where(eq(eaSubscriptions.id, id));
        return sub;
      }
      async getUserSubscribedEAs(userId) {
        const subscriptions = await db.select().from(eaSubscriptions).where(eq(eaSubscriptions.subscriberId, userId));
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
      async getCreatorSubscribers(creatorId) {
        return await db.select().from(eaSubscriptions).where(eq(eaSubscriptions.creatorId, creatorId));
      }
      async cancelEASubscription(subscriptionId) {
        await db.update(eaSubscriptions).set({ status: "canceled" }).where(eq(eaSubscriptions.id, subscriptionId));
        return true;
      }
      async getEASubscriptionByEAAndUser(eaId, userId) {
        const [sub] = await db.select().from(eaSubscriptions).where(and(
          eq(eaSubscriptions.eaId, eaId),
          eq(eaSubscriptions.subscriberId, userId)
        ));
        return sub;
      }
      async createMarketDataSnapshot(snapshot) {
        const [created] = await db.insert(marketDataSnapshots).values(snapshot).returning();
        return created;
      }
      async getMarketDataSnapshot(symbol, timeframe) {
        const [snapshot] = await db.select().from(marketDataSnapshots).where(and(
          eq(marketDataSnapshots.symbol, symbol),
          eq(marketDataSnapshots.timeframe, timeframe)
        )).orderBy(sql`${marketDataSnapshots.capturedAt} DESC`).limit(1);
        return snapshot;
      }
      async getLatestSnapshot(symbol, timeframe) {
        return this.getMarketDataSnapshot(symbol, timeframe);
      }
      async createRefreshJob(job) {
        const [created] = await db.insert(marketDataRefreshJobs).values(job).returning();
        return created;
      }
      async updateRefreshJob(id, data) {
        const [updated] = await db.update(marketDataRefreshJobs).set(data).where(eq(marketDataRefreshJobs.id, id)).returning();
        return updated;
      }
      async getRefreshJobsByEA(eaId) {
        return await db.select().from(marketDataRefreshJobs).where(eq(marketDataRefreshJobs.eaId, eaId)).orderBy(sql`${marketDataRefreshJobs.triggeredAt} DESC`);
      }
      async createEAShareAsset(asset) {
        const [created] = await db.insert(eaShareAssets).values(asset).returning();
        return created;
      }
      async getEAShareAsset(eaId) {
        const [asset] = await db.select().from(eaShareAssets).where(eq(eaShareAssets.eaId, eaId)).orderBy(sql`${eaShareAssets.createdAt} DESC`).limit(1);
        return asset;
      }
      async getEAShareAssetByShareUrl(shareUrl) {
        const [asset] = await db.select().from(eaShareAssets).where(eq(eaShareAssets.shareUrl, shareUrl));
        return asset;
      }
      async updateEAShareAsset(id, data) {
        const [updated] = await db.update(eaShareAssets).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(eaShareAssets.id, id)).returning();
        return updated;
      }
      async incrementShareAssetViewCount(id) {
        await db.update(eaShareAssets).set({ viewCount: sql`${eaShareAssets.viewCount} + 1` }).where(eq(eaShareAssets.id, id));
      }
      async incrementShareAssetShareCount(id) {
        await db.update(eaShareAssets).set({ shareCount: sql`${eaShareAssets.shareCount} + 1` }).where(eq(eaShareAssets.id, id));
      }
      async updateUserSubscription(userId, subscriptionData) {
        await db.update(users).set({
          subscriptionPlanId: subscriptionData.planId,
          subscriptionStatus: subscriptionData.status,
          stripeSubscriptionId: subscriptionData.stripeSubscriptionId || null,
          subscriptionCurrentPeriodEnd: subscriptionData.currentPeriodEnd || null,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(users.id, userId));
      }
      async getUserStreak(userId) {
        const [streak] = await db.select().from(userStreaks).where(eq(userStreaks.userId, userId));
        return streak;
      }
      async createOrUpdateStreak(userId, data) {
        const existing = await this.getUserStreak(userId);
        if (existing) {
          const [updated] = await db.update(userStreaks).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(userStreaks.userId, userId)).returning();
          return updated;
        } else {
          const [created] = await db.insert(userStreaks).values({ userId, ...data }).returning();
          return created;
        }
      }
      async recordActivity(userId, activityType) {
        let streak = await this.getUserStreak(userId);
        const now = /* @__PURE__ */ new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let streakIncreased = false;
        let tierUp = false;
        let newTier;
        if (!streak) {
          streak = await this.createOrUpdateStreak(userId, {
            currentStreak: 1,
            longestStreak: 1,
            lastActivityDate: now,
            totalChartsAnalyzed: activityType === "chart" ? 1 : 0,
            totalEAsCreated: activityType === "ea" ? 1 : 0,
            totalTrades: activityType === "trade" ? 1 : 0,
            weeklyChartsAnalyzed: activityType === "chart" ? 1 : 0,
            weeklyEAsCreated: activityType === "ea" ? 1 : 0,
            weekStartDate: now,
            xpPoints: activityType === "chart" ? 25 : activityType === "ea" ? 50 : 10,
            tier: "YG",
            tierProgress: 0
          });
          streakIncreased = true;
        } else {
          const lastActivity = streak.lastActivityDate ? new Date(streak.lastActivityDate) : null;
          const lastActivityDate = lastActivity ? new Date(lastActivity.getFullYear(), lastActivity.getMonth(), lastActivity.getDate()) : null;
          const diffDays = lastActivityDate ? Math.floor((today.getTime() - lastActivityDate.getTime()) / (1e3 * 60 * 60 * 24)) : -1;
          let newCurrentStreak = streak.currentStreak;
          if (diffDays === 1) {
            newCurrentStreak = streak.currentStreak + 1;
            streakIncreased = true;
          } else if (diffDays > 1) {
            newCurrentStreak = 1;
            streakIncreased = true;
          }
          const xpGain = activityType === "chart" ? 25 : activityType === "ea" ? 50 : 10;
          let bonusXP = 0;
          if (newCurrentStreak === 7) bonusXP = 250;
          else if (newCurrentStreak === 30) bonusXP = 1e3;
          const newXP = streak.xpPoints + xpGain + bonusXP;
          const oldTier = streak.tier;
          let newTierValue = oldTier;
          const tiers = ["YG", "Rising", "Pro", "Elite", "OG"];
          for (const tier of tiers) {
            const config = TIER_CONFIG[tier];
            if (newXP >= config.minXP) {
              newTierValue = tier;
            }
          }
          if (newTierValue !== oldTier) {
            tierUp = true;
            newTier = newTierValue;
          }
          const weekStart = streak.weekStartDate ? new Date(streak.weekStartDate) : null;
          const shouldResetWeekly = !weekStart || now.getTime() - weekStart.getTime() > 7 * 24 * 60 * 60 * 1e3;
          streak = await this.createOrUpdateStreak(userId, {
            currentStreak: newCurrentStreak,
            longestStreak: Math.max(streak.longestStreak, newCurrentStreak),
            lastActivityDate: now,
            totalChartsAnalyzed: streak.totalChartsAnalyzed + (activityType === "chart" ? 1 : 0),
            totalEAsCreated: streak.totalEAsCreated + (activityType === "ea" ? 1 : 0),
            totalTrades: streak.totalTrades + (activityType === "trade" ? 1 : 0),
            weeklyChartsAnalyzed: shouldResetWeekly ? activityType === "chart" ? 1 : 0 : streak.weeklyChartsAnalyzed + (activityType === "chart" ? 1 : 0),
            weeklyEAsCreated: shouldResetWeekly ? activityType === "ea" ? 1 : 0 : streak.weeklyEAsCreated + (activityType === "ea" ? 1 : 0),
            weekStartDate: shouldResetWeekly ? now : streak.weekStartDate,
            xpPoints: newXP,
            tier: newTierValue
          });
        }
        return { streak, streakIncreased, tierUp, newTier };
      }
      // Scenario Analysis methods
      async createScenarioAnalysis(analysis) {
        const [result] = await db.insert(scenarioAnalyses).values(analysis).returning();
        return result;
      }
      async getScenarioAnalysis(id) {
        const [result] = await db.select().from(scenarioAnalyses).where(eq(scenarioAnalyses.id, id));
        return result;
      }
      async getUserScenarioAnalyses(userId) {
        return await db.select().from(scenarioAnalyses).where(eq(scenarioAnalyses.userId, userId));
      }
      async getScenariosByChartAnalysis(chartAnalysisId) {
        return await db.select().from(scenarioAnalyses).where(eq(scenarioAnalyses.chartAnalysisId, chartAnalysisId));
      }
      // Webhook methods
      async createWebhook(webhook) {
        const [result] = await db.insert(webhookConfigs).values(webhook).returning();
        return result;
      }
      async getWebhook(id) {
        const [result] = await db.select().from(webhookConfigs).where(eq(webhookConfigs.id, id));
        return result;
      }
      async getUserWebhooks(userId) {
        return await db.select().from(webhookConfigs).where(eq(webhookConfigs.userId, userId));
      }
      async getActiveWebhooksByTrigger(userId, triggerType) {
        const userWebhooks = await db.select().from(webhookConfigs).where(and(
          eq(webhookConfigs.userId, userId),
          eq(webhookConfigs.isActive, true)
        ));
        return userWebhooks.filter((w) => {
          const triggers = w.triggerOn;
          return triggers && triggers.includes(triggerType);
        });
      }
      async updateWebhook(id, data) {
        const [result] = await db.update(webhookConfigs).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(webhookConfigs.id, id)).returning();
        return result;
      }
      async deleteWebhook(id) {
        const result = await db.delete(webhookConfigs).where(eq(webhookConfigs.id, id));
        return true;
      }
      async logWebhookCall(log) {
        const [result] = await db.insert(webhookLogs).values(log).returning();
        return result;
      }
      async getWebhookLogs(webhookId, limit = 50) {
        return await db.select().from(webhookLogs).where(eq(webhookLogs.webhookId, webhookId)).limit(limit);
      }
      // MT5 API Token methods
      async createMt5ApiToken(userId, name) {
        const token = crypto.randomBytes(32).toString("hex");
        const [result] = await db.insert(mt5ApiTokens).values({
          userId,
          name,
          token,
          isActive: true,
          signalCount: 0
        }).returning();
        return result;
      }
      async getMt5ApiToken(id) {
        const [result] = await db.select().from(mt5ApiTokens).where(eq(mt5ApiTokens.id, id));
        return result;
      }
      async getMt5ApiTokenByToken(token) {
        const [result] = await db.select().from(mt5ApiTokens).where(eq(mt5ApiTokens.token, token));
        return result;
      }
      async getUserMt5ApiTokens(userId) {
        return await db.select().from(mt5ApiTokens).where(eq(mt5ApiTokens.userId, userId));
      }
      async updateMt5ApiToken(id, data) {
        const [result] = await db.update(mt5ApiTokens).set(data).where(eq(mt5ApiTokens.id, id)).returning();
        return result;
      }
      async deleteMt5ApiToken(id) {
        await db.delete(mt5ApiTokens).where(eq(mt5ApiTokens.id, id));
        return true;
      }
      async incrementMt5TokenSignalCount(tokenId) {
        await db.update(mt5ApiTokens).set({
          signalCount: sql`${mt5ApiTokens.signalCount} + 1`,
          lastUsedAt: /* @__PURE__ */ new Date()
        }).where(eq(mt5ApiTokens.id, tokenId));
      }
      // MT5 Signal Log methods
      async createMt5SignalLog(log) {
        const [result] = await db.insert(mt5SignalLogs).values(log).returning();
        return result;
      }
      async getMt5SignalLogs(userId, limit = 100) {
        return await db.select().from(mt5SignalLogs).where(eq(mt5SignalLogs.userId, userId)).orderBy(desc(mt5SignalLogs.createdAt)).limit(limit);
      }
      // TradeLocker Connection methods
      async createTradelockerConnection(connection) {
        const [result] = await db.insert(tradelockerConnections).values(connection).returning();
        return result;
      }
      // Finds an existing connection for the same broker account (not just same
      // row id) — there's no DB unique constraint on (userId, accountId, serverId),
      // so without this lookup, reconnecting the same TradeLocker account (e.g.
      // after a credential change or full re-auth) creates a brand-new row with a
      // new id and silently orphans every ai_trade_results row tagged with the old
      // connectionId — the account's trade history, chart, and weekly goal all
      // read by connectionId, so they'd all appear to reset to empty.
      async getTradelockerConnectionByAccount(userId, accountId, serverId) {
        const [result] = await db.select().from(tradelockerConnections).where(
          and(
            eq(tradelockerConnections.userId, userId),
            eq(tradelockerConnections.accountId, accountId),
            eq(tradelockerConnections.serverId, serverId)
          )
        );
        return result;
      }
      async getTradelockerConnection(id) {
        const [result] = await db.select().from(tradelockerConnections).where(eq(tradelockerConnections.id, id));
        return result;
      }
      async getUserTradelockerConnection(userId) {
        const [result] = await db.select().from(tradelockerConnections).where(eq(tradelockerConnections.userId, userId));
        return result;
      }
      async getUserTradelockerConnections(userId) {
        return db.select().from(tradelockerConnections).where(eq(tradelockerConnections.userId, userId));
      }
      // Every active prop-firm-tagged connection across all users — used by the
      // background consistency audit loop, which sweeps globally rather than
      // per-user (it has no request context to scope to a single user).
      async getAllPropFirmTradelockerConnections() {
        return db.select().from(tradelockerConnections).where(and(eq(tradelockerConnections.isPropFirmAccount, true), eq(tradelockerConnections.isActive, true)));
      }
      async updateTradelockerConnection(id, data) {
        const [result] = await db.update(tradelockerConnections).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(tradelockerConnections.id, id)).returning();
        return result;
      }
      async deleteTradelockerConnection(id) {
        await db.delete(tradelockerTradeLogs).where(eq(tradelockerTradeLogs.connectionId, id));
        await db.delete(tradelockerConnections).where(eq(tradelockerConnections.id, id));
        return true;
      }
      // TradeLocker Trade Log methods
      async createTradelockerTradeLog(log) {
        const [result] = await db.insert(tradelockerTradeLogs).values(log).returning();
        return result;
      }
      async getTradelockerTradeLogs(userId, limit = 100, connectionId) {
        const conditions = [eq(tradelockerTradeLogs.userId, userId)];
        if (connectionId != null) conditions.push(eq(tradelockerTradeLogs.connectionId, connectionId));
        return await db.select().from(tradelockerTradeLogs).where(and(...conditions)).orderBy(desc(tradelockerTradeLogs.createdAt)).limit(limit);
      }
      // ── Alpaca Connection methods (Options AI Engine) ──────────────────────────
      async createAlpacaConnection(connection) {
        const [result] = await db.insert(alpacaConnections).values(connection).returning();
        return result;
      }
      async getAlpacaConnection(id) {
        const [result] = await db.select().from(alpacaConnections).where(eq(alpacaConnections.id, id));
        return result;
      }
      async getUserAlpacaConnections(userId) {
        return db.select().from(alpacaConnections).where(eq(alpacaConnections.userId, userId));
      }
      async updateAlpacaConnection(id, data) {
        const [result] = await db.update(alpacaConnections).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(alpacaConnections.id, id)).returning();
        return result;
      }
      async deleteAlpacaConnection(id) {
        await db.delete(alpacaConnections).where(eq(alpacaConnections.id, id));
        return true;
      }
      // ── TastyTrade Connection methods (Options AI Engine) ───────────────────────
      async createTastytradeConnection(connection) {
        const [result] = await db.insert(tastytradeConnections).values(connection).returning();
        return result;
      }
      async getTastytradeConnection(id) {
        const [result] = await db.select().from(tastytradeConnections).where(eq(tastytradeConnections.id, id));
        return result;
      }
      async getUserTastytradeConnections(userId) {
        return db.select().from(tastytradeConnections).where(eq(tastytradeConnections.userId, userId));
      }
      async updateTastytradeConnection(id, data) {
        const [result] = await db.update(tastytradeConnections).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(tastytradeConnections.id, id)).returning();
        return result;
      }
      async deleteTastytradeConnection(id) {
        await db.delete(tastytradeConnections).where(eq(tastytradeConnections.id, id));
        return true;
      }
      // ── Options AI Engine config ────────────────────────────────────────────────
      async getUserOptionsEngineConfig(userId) {
        const [result] = await db.select().from(optionsEngineConfigs).where(eq(optionsEngineConfigs.userId, userId));
        return result;
      }
      async upsertOptionsEngineConfig(userId, data) {
        const existing = await this.getUserOptionsEngineConfig(userId);
        if (existing) {
          const [result2] = await db.update(optionsEngineConfigs).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(optionsEngineConfigs.userId, userId)).returning();
          return result2;
        }
        const [result] = await db.insert(optionsEngineConfigs).values({ userId, ...data }).returning();
        return result;
      }
      async getAllActiveOptionsEngineConfigs() {
        return db.select().from(optionsEngineConfigs).where(eq(optionsEngineConfigs.isActive, true));
      }
      // ── Live Engine (FX SS AI Engine) durable config mirror ─────────────────────
      async getLiveEngineConfigOverrides(userId) {
        const [row] = await db.select().from(liveEngineConfigs).where(eq(liveEngineConfigs.userId, userId));
        return row ? row.config : null;
      }
      async saveLiveEngineConfigOverrides(userId, config) {
        const existing = await this.getLiveEngineConfigOverrides(userId);
        if (existing !== null) {
          await db.update(liveEngineConfigs).set({ config, updatedAt: /* @__PURE__ */ new Date() }).where(eq(liveEngineConfigs.userId, userId));
        } else {
          await db.insert(liveEngineConfigs).values({ userId, config });
        }
      }
      async getAllLiveEngineConfigOverrides() {
        const rows = await db.select().from(liveEngineConfigs);
        return rows.map((r) => ({ userId: r.userId, config: r.config }));
      }
      // ── Options AI Engine — scan/decision activity feed ─────────────────────────
      async createOptionsEngineActivity(entry) {
        const [result] = await db.insert(optionsEngineActivity).values(entry).returning();
        return result;
      }
      async getUserOptionsEngineActivity(userId, limit = 50) {
        return db.select().from(optionsEngineActivity).where(eq(optionsEngineActivity.userId, userId)).orderBy(desc(optionsEngineActivity.createdAt)).limit(limit);
      }
      // ── Options AI Engine — executed trades ─────────────────────────────────────
      async createOptionsEngineTrade(trade) {
        const [result] = await db.insert(optionsEngineTrades).values(trade).returning();
        return result;
      }
      async getOpenOptionsEngineTrades(userId, connectionId) {
        const conditions = [eq(optionsEngineTrades.userId, userId), eq(optionsEngineTrades.status, "open")];
        if (connectionId != null) conditions.push(eq(optionsEngineTrades.connectionId, connectionId));
        return db.select().from(optionsEngineTrades).where(and(...conditions));
      }
      async getUserOptionsEngineTrades(userId, limit = 50) {
        return db.select().from(optionsEngineTrades).where(eq(optionsEngineTrades.userId, userId)).orderBy(desc(optionsEngineTrades.createdAt)).limit(limit);
      }
      async closeOptionsEngineTrade(id, data) {
        const [result] = await db.update(optionsEngineTrades).set({ status: "closed", exitPrice: data.exitPrice, exitOrderId: data.exitOrderId, exitReason: data.exitReason, realizedPnl: data.realizedPnl, closedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq(optionsEngineTrades.id, id)).returning();
        return result;
      }
      async markOptionsEngineTradeFailed(id, reason) {
        await db.update(optionsEngineTrades).set({ status: "failed", exitReason: reason, closedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq(optionsEngineTrades.id, id));
      }
      async getTodayOptionsEngineTradeCount(userId, connectionId) {
        const startOfDay = /* @__PURE__ */ new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const conditions = [eq(optionsEngineTrades.userId, userId), gte(optionsEngineTrades.createdAt, startOfDay)];
        if (connectionId != null) conditions.push(eq(optionsEngineTrades.connectionId, connectionId));
        const rows = await db.select().from(optionsEngineTrades).where(and(...conditions));
        return rows.length;
      }
      async getTodayOptionsEngineRealizedPnl(userId, connectionId) {
        const startOfDay = /* @__PURE__ */ new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const conditions = [eq(optionsEngineTrades.userId, userId), eq(optionsEngineTrades.status, "closed"), gte(optionsEngineTrades.closedAt, startOfDay)];
        if (connectionId != null) conditions.push(eq(optionsEngineTrades.connectionId, connectionId));
        const rows = await db.select().from(optionsEngineTrades).where(and(...conditions));
        return rows.reduce((sum, r) => sum + (r.realizedPnl || 0), 0);
      }
      // Per-underlying concentration + cooldown inputs for the options safety gate.
      // openCount counts positions still open on this underlying (any age),
      // todayEntryCount counts entries opened today, lastEntryAt is the most recent
      // entry timestamp — together they cap single-name stacking and enforce a
      // re-entry cooldown so one imbalance can't fire 20+ contracts on one ticker.
      async getOptionsEngineSymbolActivity(userId, symbol, connectionId) {
        const startOfDay = /* @__PURE__ */ new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const conditions = [eq(optionsEngineTrades.userId, userId), eq(optionsEngineTrades.underlyingSymbol, symbol)];
        if (connectionId != null) conditions.push(eq(optionsEngineTrades.connectionId, connectionId));
        const rows = await db.select().from(optionsEngineTrades).where(and(...conditions));
        let openCount = 0, todayEntryCount = 0, lastEntryAt = null;
        for (const r of rows) {
          if (r.status === "open") openCount++;
          const created = r.createdAt ? new Date(r.createdAt) : null;
          if (created && created >= startOfDay) todayEntryCount++;
          if (created && (!lastEntryAt || created > lastEntryAt)) lastEntryAt = created;
        }
        return { openCount, todayEntryCount, lastEntryAt };
      }
      async getOptionsEngineTradeStats(userId) {
        const rows = await db.select().from(optionsEngineTrades).where(and(eq(optionsEngineTrades.userId, userId), eq(optionsEngineTrades.status, "closed")));
        const totalClosed = rows.length;
        const wins = rows.filter((r) => (r.realizedPnl || 0) > 0).length;
        const winRate = totalClosed > 0 ? Math.round(wins / totalClosed * 100) : 0;
        const chrono = [...rows].sort((a, b) => new Date(b.closedAt ?? b.createdAt).getTime() - new Date(a.closedAt ?? a.createdAt).getTime());
        let lossStreak = 0;
        for (const r of chrono) {
          if ((r.realizedPnl ?? 0) <= 0) lossStreak++;
          else break;
        }
        return { totalClosed, wins, winRate, lossStreak };
      }
      async getOptionsEngineDailyPnlHistory(userId, days, connectionId) {
        const since = /* @__PURE__ */ new Date();
        since.setUTCHours(0, 0, 0, 0);
        since.setUTCDate(since.getUTCDate() - days);
        const conditions = [eq(optionsEngineTrades.userId, userId), eq(optionsEngineTrades.status, "closed"), gte(optionsEngineTrades.closedAt, since)];
        if (connectionId != null) conditions.push(eq(optionsEngineTrades.connectionId, connectionId));
        const rows = await db.select().from(optionsEngineTrades).where(and(...conditions));
        const history = {};
        for (const r of rows) {
          if (!r.closedAt) continue;
          const day = new Date(r.closedAt).toISOString().split("T")[0];
          history[day] = (history[day] || 0) + (r.realizedPnl || 0);
        }
        return history;
      }
      // ── Prop-firm account state (challenge/funded phase + per-phase risk rules) ──
      // One row per (connectionId, connectionType) — supports MT5/TradeLocker/
      // Tradovate (FX) and Alpaca/TastyTrade (Options), independently of each other.
      async getPropFirmAccountState(connectionId, connectionType) {
        const [row] = await db.select().from(propFirmAccountState).where(and(eq(propFirmAccountState.connectionId, connectionId), eq(propFirmAccountState.connectionType, connectionType)));
        return row;
      }
      async getAllPropFirmAccountStatesForUser(userId, connectionType) {
        const conditions = [eq(propFirmAccountState.userId, userId)];
        if (connectionType) conditions.push(eq(propFirmAccountState.connectionType, connectionType));
        return db.select().from(propFirmAccountState).where(and(...conditions));
      }
      async upsertPropFirmAccountState(userId, connectionId, connectionType, patch) {
        const existing = await this.getPropFirmAccountState(connectionId, connectionType);
        if (existing) {
          const [row2] = await db.update(propFirmAccountState).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(propFirmAccountState.id, existing.id)).returning();
          return row2;
        }
        const [row] = await db.insert(propFirmAccountState).values({ userId, connectionId, connectionType, phaseStartBalance: 0, ...patch }).returning();
        return row;
      }
      async updateOptionsEngineTradeTrailState(id, data) {
        await db.update(optionsEngineTrades).set({ peakPnlPercent: data.peakPnlPercent, trailArmed: data.trailArmed, updatedAt: /* @__PURE__ */ new Date() }).where(eq(optionsEngineTrades.id, id));
      }
      // ── Futures AI Engine config ────────────────────────────────────────────────
      async getUserFuturesEngineConfig(userId) {
        const [result] = await db.select().from(futuresEngineConfigs).where(eq(futuresEngineConfigs.userId, userId));
        return result;
      }
      async upsertFuturesEngineConfig(userId, data) {
        const existing = await this.getUserFuturesEngineConfig(userId);
        if (existing) {
          const [result2] = await db.update(futuresEngineConfigs).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(futuresEngineConfigs.userId, userId)).returning();
          return result2;
        }
        const [result] = await db.insert(futuresEngineConfigs).values({ userId, ...data }).returning();
        return result;
      }
      async getAllActiveFuturesEngineConfigs() {
        return db.select().from(futuresEngineConfigs).where(eq(futuresEngineConfigs.isActive, true));
      }
      // ── Futures AI Engine — scan/decision activity feed ─────────────────────────
      async createFuturesEngineActivity(entry) {
        const [result] = await db.insert(futuresEngineActivity).values(entry).returning();
        return result;
      }
      async getUserFuturesEngineActivity(userId, limit = 50) {
        return db.select().from(futuresEngineActivity).where(eq(futuresEngineActivity.userId, userId)).orderBy(desc(futuresEngineActivity.createdAt)).limit(limit);
      }
      // ── Futures AI Engine — executed trades ─────────────────────────────────────
      async createFuturesEngineTrade(trade) {
        const [result] = await db.insert(futuresEngineTrades).values(trade).returning();
        return result;
      }
      async getOpenFuturesEngineTrades(userId) {
        return db.select().from(futuresEngineTrades).where(and(eq(futuresEngineTrades.userId, userId), eq(futuresEngineTrades.status, "open")));
      }
      async getUserFuturesEngineTrades(userId, limit = 50) {
        return db.select().from(futuresEngineTrades).where(eq(futuresEngineTrades.userId, userId)).orderBy(desc(futuresEngineTrades.createdAt)).limit(limit);
      }
      async closeFuturesEngineTrade(id, data) {
        const [result] = await db.update(futuresEngineTrades).set({ status: "closed", exitPrice: data.exitPrice, exitOrderId: data.exitOrderId, exitReason: data.exitReason, realizedPnl: data.realizedPnl, closedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq(futuresEngineTrades.id, id)).returning();
        return result;
      }
      async markFuturesEngineTradeFailed(id, reason) {
        await db.update(futuresEngineTrades).set({ status: "failed", exitReason: reason, closedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq(futuresEngineTrades.id, id));
      }
      async getTodayFuturesEngineTradeCount(userId) {
        const startOfDay = /* @__PURE__ */ new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const rows = await db.select().from(futuresEngineTrades).where(and(eq(futuresEngineTrades.userId, userId), gte(futuresEngineTrades.createdAt, startOfDay)));
        return rows.length;
      }
      async getTodayFuturesEngineRealizedPnl(userId) {
        const startOfDay = /* @__PURE__ */ new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const rows = await db.select().from(futuresEngineTrades).where(and(eq(futuresEngineTrades.userId, userId), eq(futuresEngineTrades.status, "closed"), gte(futuresEngineTrades.closedAt, startOfDay)));
        return rows.reduce((sum, r) => sum + (r.realizedPnl || 0), 0);
      }
      // Per-symbol concentration + cooldown inputs for the futures safety gate —
      // mirrors getOptionsEngineSymbolActivity so both engines cap single-symbol
      // stacking and enforce a re-entry cooldown identically.
      async getFuturesEngineSymbolActivity(userId, symbol) {
        const startOfDay = /* @__PURE__ */ new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const rows = await db.select().from(futuresEngineTrades).where(and(eq(futuresEngineTrades.userId, userId), eq(futuresEngineTrades.symbol, symbol)));
        let openCount = 0, todayEntryCount = 0, lastEntryAt = null;
        for (const r of rows) {
          if (r.status === "open") openCount++;
          const created = r.createdAt ? new Date(r.createdAt) : null;
          if (created && created >= startOfDay) todayEntryCount++;
          if (created && (!lastEntryAt || created > lastEntryAt)) lastEntryAt = created;
        }
        return { openCount, todayEntryCount, lastEntryAt };
      }
      async getFuturesEngineTradeStats(userId) {
        const rows = await db.select().from(futuresEngineTrades).where(and(eq(futuresEngineTrades.userId, userId), eq(futuresEngineTrades.status, "closed")));
        const totalClosed = rows.length;
        const wins = rows.filter((r) => (r.realizedPnl || 0) > 0).length;
        const winRate = totalClosed > 0 ? Math.round(wins / totalClosed * 100) : 0;
        return { totalClosed, wins, winRate };
      }
      async getFuturesEngineDailyPnlHistory(userId, days) {
        const since = /* @__PURE__ */ new Date();
        since.setUTCHours(0, 0, 0, 0);
        since.setUTCDate(since.getUTCDate() - days);
        const rows = await db.select().from(futuresEngineTrades).where(and(eq(futuresEngineTrades.userId, userId), eq(futuresEngineTrades.status, "closed"), gte(futuresEngineTrades.closedAt, since)));
        const history = {};
        for (const r of rows) {
          if (!r.closedAt) continue;
          const day = new Date(r.closedAt).toISOString().split("T")[0];
          history[day] = (history[day] || 0) + (r.realizedPnl || 0);
        }
        return history;
      }
      async updateFuturesEngineTradeTrailState(id, data) {
        await db.update(futuresEngineTrades).set({ peakRMultiple: data.peakRMultiple, trailArmed: data.trailArmed, updatedAt: /* @__PURE__ */ new Date() }).where(eq(futuresEngineTrades.id, id));
      }
      // ── Content Studio — durable saved-content library ──────────────────────────
      async createContentStudioGeneration(entry) {
        const [result] = await db.insert(contentStudioGenerations).values(entry).returning();
        return result;
      }
      async getUserContentStudioGenerations(userId, contentType, limit = 100) {
        const conditions = contentType ? and(eq(contentStudioGenerations.userId, userId), eq(contentStudioGenerations.contentType, contentType)) : eq(contentStudioGenerations.userId, userId);
        return db.select().from(contentStudioGenerations).where(conditions).orderBy(desc(contentStudioGenerations.createdAt)).limit(limit);
      }
      async deleteContentStudioGeneration(id, userId) {
        const result = await db.delete(contentStudioGenerations).where(and(eq(contentStudioGenerations.id, id), eq(contentStudioGenerations.userId, userId))).returning();
        return result.length > 0;
      }
      // ── Crypto.com Perpetuals AI Engine ─────────────────────────────────────────
      async getUserCryptocomEngineConfig(userId) {
        const [result] = await db.select().from(cryptocomEngineConfigs).where(eq(cryptocomEngineConfigs.userId, userId));
        return result;
      }
      async upsertCryptocomEngineConfig(userId, data) {
        const existing = await this.getUserCryptocomEngineConfig(userId);
        if (existing) {
          const [result2] = await db.update(cryptocomEngineConfigs).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(cryptocomEngineConfigs.userId, userId)).returning();
          return result2;
        }
        const [result] = await db.insert(cryptocomEngineConfigs).values({ userId, ...data }).returning();
        return result;
      }
      async getAllActiveCryptocomEngineConfigs() {
        return db.select().from(cryptocomEngineConfigs).where(eq(cryptocomEngineConfigs.isActive, true));
      }
      async createCryptocomEngineActivity(entry) {
        const [result] = await db.insert(cryptocomEngineActivity).values(entry).returning();
        return result;
      }
      async getUserCryptocomEngineActivity(userId, limit = 50) {
        return db.select().from(cryptocomEngineActivity).where(eq(cryptocomEngineActivity.userId, userId)).orderBy(desc(cryptocomEngineActivity.createdAt)).limit(limit);
      }
      async createCryptocomEngineTrade(trade) {
        const [result] = await db.insert(cryptocomEngineTrades).values(trade).returning();
        return result;
      }
      async getOpenCryptocomEngineTrades(userId) {
        return db.select().from(cryptocomEngineTrades).where(and(eq(cryptocomEngineTrades.userId, userId), eq(cryptocomEngineTrades.status, "open")));
      }
      async getUserCryptocomEngineTrades(userId, limit = 50) {
        return db.select().from(cryptocomEngineTrades).where(eq(cryptocomEngineTrades.userId, userId)).orderBy(desc(cryptocomEngineTrades.createdAt)).limit(limit);
      }
      async closeCryptocomEngineTrade(id, data) {
        const [result] = await db.update(cryptocomEngineTrades).set({ status: "closed", exitPrice: data.exitPrice, exitOrderId: data.exitOrderId, exitReason: data.exitReason, realizedPnl: data.realizedPnl, closedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq(cryptocomEngineTrades.id, id)).returning();
        return result;
      }
      async getTodayCryptocomEngineTradeCount(userId) {
        const startOfDay = /* @__PURE__ */ new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const rows = await db.select().from(cryptocomEngineTrades).where(and(eq(cryptocomEngineTrades.userId, userId), gte(cryptocomEngineTrades.createdAt, startOfDay)));
        return rows.length;
      }
      async getTodayCryptocomEngineRealizedPnl(userId) {
        const startOfDay = /* @__PURE__ */ new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const rows = await db.select().from(cryptocomEngineTrades).where(and(eq(cryptocomEngineTrades.userId, userId), eq(cryptocomEngineTrades.status, "closed"), gte(cryptocomEngineTrades.closedAt, startOfDay)));
        return rows.reduce((sum, r) => sum + (r.realizedPnl || 0), 0);
      }
      async getCryptocomEngineTradeStats(userId) {
        const rows = await db.select().from(cryptocomEngineTrades).where(and(eq(cryptocomEngineTrades.userId, userId), eq(cryptocomEngineTrades.status, "closed")));
        const totalClosed = rows.length;
        const wins = rows.filter((r) => (r.realizedPnl || 0) > 0).length;
        const winRate = totalClosed > 0 ? Math.round(wins / totalClosed * 100) : 0;
        return { totalClosed, wins, winRate };
      }
      async getCryptocomEngineDailyPnlHistory(userId, days) {
        const since = /* @__PURE__ */ new Date();
        since.setUTCHours(0, 0, 0, 0);
        since.setUTCDate(since.getUTCDate() - days);
        const rows = await db.select().from(cryptocomEngineTrades).where(and(eq(cryptocomEngineTrades.userId, userId), eq(cryptocomEngineTrades.status, "closed"), gte(cryptocomEngineTrades.closedAt, since)));
        const history = {};
        for (const r of rows) {
          if (!r.closedAt) continue;
          const day = new Date(r.closedAt).toISOString().split("T")[0];
          history[day] = (history[day] || 0) + (r.realizedPnl || 0);
        }
        return history;
      }
      async updateCryptocomEngineTradeTrailState(id, data) {
        await db.update(cryptocomEngineTrades).set({ peakRMultiple: data.peakRMultiple, trailArmed: data.trailArmed, updatedAt: /* @__PURE__ */ new Date() }).where(eq(cryptocomEngineTrades.id, id));
      }
      // ── Crypto.com Connection methods (crypto-derivatives bucket) ──────────────
      async createCryptocomConnection(connection) {
        const [result] = await db.insert(cryptocomConnections).values(connection).returning();
        return result;
      }
      async getCryptocomConnection(id) {
        const [result] = await db.select().from(cryptocomConnections).where(eq(cryptocomConnections.id, id));
        return result;
      }
      async getUserCryptocomConnections(userId) {
        return db.select().from(cryptocomConnections).where(eq(cryptocomConnections.userId, userId));
      }
      async updateCryptocomConnection(id, data) {
        const [result] = await db.update(cryptocomConnections).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(cryptocomConnections.id, id)).returning();
        return result;
      }
      async deleteCryptocomConnection(id) {
        await db.delete(cryptocomConnections).where(eq(cryptocomConnections.id, id));
        return true;
      }
      // ── Tradovate Connection methods ──────────────────────────────────────────
      async createTradovateConnection(connection) {
        const [result] = await db.insert(tradovateConnections).values(connection).returning();
        return result;
      }
      async getTradovateConnection(id) {
        const [result] = await db.select().from(tradovateConnections).where(eq(tradovateConnections.id, id));
        return result;
      }
      async getUserTradovateConnection(userId) {
        const [result] = await db.select().from(tradovateConnections).where(eq(tradovateConnections.userId, userId));
        return result;
      }
      async updateTradovateConnection(id, data) {
        const [result] = await db.update(tradovateConnections).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(tradovateConnections.id, id)).returning();
        return result;
      }
      async deleteTradovateConnection(id) {
        await db.delete(tradovateTradeLogs).where(eq(tradovateTradeLogs.connectionId, id));
        await db.delete(tradovateConnections).where(eq(tradovateConnections.id, id));
        return true;
      }
      async createTradovateTradeLog(log) {
        const [result] = await db.insert(tradovateTradeLogs).values(log).returning();
        return result;
      }
      async getTradovateTradeLogs(userId, limit = 100) {
        return await db.select().from(tradovateTradeLogs).where(eq(tradovateTradeLogs.userId, userId)).orderBy(desc(tradovateTradeLogs.createdAt)).limit(limit);
      }
      // AI Trade Results methods
      async createAiTradeResult(result) {
        const [created] = await db.insert(aiTradeResults).values(result).returning();
        return created;
      }
      async updateAiTradeResult(id, userId, data) {
        const [updated] = await db.update(aiTradeResults).set(data).where(and(eq(aiTradeResults.id, id), eq(aiTradeResults.userId, userId))).returning();
        return updated;
      }
      async deleteAiTradeResult(id, userId) {
        const result = await db.delete(aiTradeResults).where(and(eq(aiTradeResults.id, id), eq(aiTradeResults.userId, userId)));
        return true;
      }
      async getAiTradeResultById(id) {
        const [result] = await db.select().from(aiTradeResults).where(eq(aiTradeResults.id, id)).limit(1);
        return result;
      }
      async getAiTradeResults(userId, limit = 100, connectionId) {
        const conditions = [eq(aiTradeResults.userId, userId)];
        if (connectionId != null) conditions.push(eq(aiTradeResults.connectionId, connectionId));
        return await db.select().from(aiTradeResults).where(and(...conditions)).orderBy(desc(aiTradeResults.createdAt)).limit(limit);
      }
      async getAiTradeResultsBySymbol(userId, symbol, limit = 500) {
        return await db.select().from(aiTradeResults).where(and(
          eq(aiTradeResults.userId, userId),
          sql`UPPER(${aiTradeResults.symbol}) LIKE UPPER(${"%" + symbol + "%"})`
        )).orderBy(desc(aiTradeResults.createdAt)).limit(limit);
      }
      async getAiTradeResultByTicket(userId, ticket) {
        const results = await db.select().from(aiTradeResults).where(and(
          eq(aiTradeResults.userId, userId),
          eq(aiTradeResults.mt5Ticket, ticket)
        )).limit(1);
        return results[0];
      }
      // ── AI Confirmation Outcomes (learning loop) ────────────────────────────────
      async createConfirmationOutcome(data) {
        const [result] = await db.insert(aiConfirmationOutcomes).values(data).returning();
        return result;
      }
      // Called when a trade closes: find the most recent PENDING confirmation for
      // this user + symbol + direction within the last 24 hours and mark its outcome.
      // Returns whether a match was found and updated — false means this trade has
      // no corresponding row in ai_confirmation_outcomes at all (e.g. it wasn't
      // opened by the bot, or it was held longer than 24h), which callers that
      // have their own full outcome data (like TradeLocker's reconciliation pass)
      // can use to create a fresh row instead of the trade silently never
      // reaching the Brain Dashboard.
      async resolveConfirmationOutcome(userId, symbol, direction, tradeOutcome, actualPips) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1e3);
        const rows = await db.select().from(aiConfirmationOutcomes).where(
          and(
            eq(aiConfirmationOutcomes.userId, userId),
            eq(aiConfirmationOutcomes.symbol, symbol.toUpperCase()),
            eq(aiConfirmationOutcomes.direction, direction),
            eq(aiConfirmationOutcomes.tradeOutcome, "PENDING"),
            gte(aiConfirmationOutcomes.confirmedAt, since)
          )
        ).orderBy(desc(aiConfirmationOutcomes.confirmedAt)).limit(1);
        if (rows.length > 0) {
          await db.update(aiConfirmationOutcomes).set({ tradeOutcome, actualPips, closedAt: /* @__PURE__ */ new Date() }).where(eq(aiConfirmationOutcomes.id, rows[0].id));
          return true;
        }
        return false;
      }
      async getConfirmationOutcomes(userId, limit = 200) {
        return db.select().from(aiConfirmationOutcomes).where(eq(aiConfirmationOutcomes.userId, userId)).orderBy(desc(aiConfirmationOutcomes.confirmedAt)).limit(limit);
      }
      // AI Second Opinion / Strategy Action Feed durability — mirrors every
      // addAiConfirmationLog() call (server/openai.ts's in-memory Map) so the
      // feed survives a server restart instead of going blank.
      async createAiConfirmationLogEntry(userId, entry) {
        await db.insert(aiConfirmationLogs).values({ userId, entry });
      }
      async getAiConfirmationLogEntries(userId, limit = 50) {
        const rows = await db.select().from(aiConfirmationLogs).where(eq(aiConfirmationLogs.userId, userId)).orderBy(desc(aiConfirmationLogs.id)).limit(limit);
        return rows.map((r) => ({ ...r.entry, id: r.id }));
      }
      async getBrainSummary(userId) {
        try {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3);
          const rows = await db.select().from(aiConfirmationOutcomes).where(
            and(
              eq(aiConfirmationOutcomes.userId, userId),
              gte(aiConfirmationOutcomes.confirmedAt, thirtyDaysAgo)
            )
          ).orderBy(desc(aiConfirmationOutcomes.confirmedAt)).limit(500);
          const groups = {};
          for (const row of rows) {
            if (row.tradeOutcome !== "WIN" && row.tradeOutcome !== "LOSS" && row.tradeOutcome !== "BREAKEVEN") continue;
            const key = `${row.symbol}|${row.tradeSource ?? "ai_confirmation"}|${row.confluenceGrade ?? "N/A"}`;
            if (!groups[key]) groups[key] = { symbol: row.symbol, tradeSource: row.tradeSource ?? "ai_confirmation", confluenceGrade: row.confluenceGrade ?? "N/A", tradeCount: 0, wins: 0, totalPips: 0, pipsCount: 0 };
            groups[key].tradeCount++;
            if (row.tradeOutcome === "WIN") groups[key].wins++;
            if (row.actualPips != null) {
              groups[key].totalPips += row.actualPips;
              groups[key].pipsCount++;
            }
          }
          return Object.values(groups).map((g) => ({
            ...g,
            winRate: g.tradeCount > 0 ? Math.round(g.wins / g.tradeCount * 100) : 0,
            avgPips: g.pipsCount > 0 ? Math.round(g.totalPips / g.pipsCount) : 0
          })).sort((a, b) => b.winRate - a.winRate);
        } catch (err) {
          console.error("[BrainSummary]", err);
          return [];
        }
      }
      async getAiTradeAccuracy(userId) {
        const now = /* @__PURE__ */ new Date();
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
        const monthStart2 = new Date(now.getFullYear(), now.getMonth(), 1);
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const allTrades = await db.select().from(aiTradeResults).where(and(
          eq(aiTradeResults.userId, userId),
          sql`${aiTradeResults.result} IN ('WIN', 'LOSS', 'BREAKEVEN')`
        ));
        const calculateAccuracy = (trades) => {
          if (trades.length === 0) return 0;
          const wins = trades.filter((t) => t.result === "WIN").length;
          return Math.round(wins / trades.length * 100);
        };
        const dailyTrades = allTrades.filter((t) => t.closedAt && new Date(t.closedAt) >= dayStart);
        const weeklyTrades = allTrades.filter((t) => t.closedAt && new Date(t.closedAt) >= weekStart);
        const monthlyTrades = allTrades.filter((t) => t.closedAt && new Date(t.closedAt) >= monthStart2);
        const yearlyTrades = allTrades.filter((t) => t.closedAt && new Date(t.closedAt) >= yearStart);
        return {
          daily: calculateAccuracy(dailyTrades),
          weekly: calculateAccuracy(weeklyTrades),
          monthly: calculateAccuracy(monthlyTrades),
          yearly: calculateAccuracy(yearlyTrades),
          allTime: calculateAccuracy(allTrades),
          totalTrades: allTrades.length,
          wins: allTrades.filter((t) => t.result === "WIN").length,
          losses: allTrades.filter((t) => t.result === "LOSS").length
        };
      }
      // Ambassador Training Progress methods
      async getAmbassadorTrainingProgress(userId) {
        const [result] = await db.select().from(ambassadorTrainingProgress).where(eq(ambassadorTrainingProgress.userId, userId));
        return result;
      }
      async createAmbassadorTrainingProgress(progress) {
        const [result] = await db.insert(ambassadorTrainingProgress).values(progress).returning();
        return result;
      }
      async updateAmbassadorTrainingProgress(userId, data) {
        const [result] = await db.update(ambassadorTrainingProgress).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(ambassadorTrainingProgress.userId, userId)).returning();
        return result;
      }
      // Ambassador Certification methods
      async getAmbassadorCertification(userId) {
        const [result] = await db.select().from(ambassadorCertifications).where(eq(ambassadorCertifications.userId, userId));
        return result;
      }
      async getAmbassadorCertificationByNumber(certNumber) {
        const [result] = await db.select().from(ambassadorCertifications).where(eq(ambassadorCertifications.certificateNumber, certNumber));
        return result;
      }
      async createAmbassadorCertification(cert) {
        const [result] = await db.insert(ambassadorCertifications).values(cert).returning();
        return result;
      }
      async updateAmbassadorCertification(id, data) {
        const [result] = await db.update(ambassadorCertifications).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(ambassadorCertifications.id, id)).returning();
        return result;
      }
      async getAllAmbassadorCertifications() {
        return await db.select().from(ambassadorCertifications).orderBy(desc(ambassadorCertifications.issueDate));
      }
      // Workforce Academy certificates
      async createWorkforceCertificate(cert) {
        const [result] = await db.insert(workforceCertificates).values(cert).returning();
        return result;
      }
      async getUserWorkforceCertificates(userId) {
        return await db.select().from(workforceCertificates).where(eq(workforceCertificates.userId, userId)).orderBy(desc(workforceCertificates.issuedAt));
      }
      async getWorkforceCertificateByCertId(certificateId) {
        const [result] = await db.select().from(workforceCertificates).where(eq(workforceCertificates.certificateId, certificateId));
        return result;
      }
      // Workforce Academy course progress — "where the learner left off"
      async getUserWorkforceCourseProgress(userId) {
        return await db.select().from(workforceCourseProgress).where(eq(workforceCourseProgress.userId, userId));
      }
      async upsertWorkforceCourseProgress(userId, courseId, patch) {
        const [result] = await db.insert(workforceCourseProgress).values({ userId, courseId, ...patch }).onConflictDoUpdate({
          target: [workforceCourseProgress.userId, workforceCourseProgress.courseId],
          set: { ...patch, updatedAt: /* @__PURE__ */ new Date() }
        }).returning();
        return result;
      }
      // Wallet integration methods
      async getUserByWalletAddress(walletAddress) {
        const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress));
        return user;
      }
      // Governance methods
      async getGovernanceProposals() {
        return await db.select().from(governanceProposals).orderBy(desc(governanceProposals.createdAt));
      }
      async getGovernanceProposal(id) {
        const [result] = await db.select().from(governanceProposals).where(eq(governanceProposals.id, id));
        return result;
      }
      async createGovernanceProposal(proposal) {
        const [result] = await db.insert(governanceProposals).values(proposal).returning();
        return result;
      }
      async updateGovernanceProposal(id, data) {
        const [result] = await db.update(governanceProposals).set(data).where(eq(governanceProposals.id, id)).returning();
        return result;
      }
      async createGovernanceVote(vote) {
        const [result] = await db.insert(governanceVotes).values(vote).returning();
        return result;
      }
      async getUserVote(proposalId, userId) {
        const [result] = await db.select().from(governanceVotes).where(and(
          eq(governanceVotes.proposalId, proposalId),
          eq(governanceVotes.userId, userId)
        ));
        return result;
      }
      // 44-Day Ambassador Content Flow methods
      async getAmbassadorContentStats(userId) {
        const [result] = await db.select().from(ambassadorContentStats).where(eq(ambassadorContentStats.userId, userId));
        return result;
      }
      async createAmbassadorContentStats(data) {
        const [result] = await db.insert(ambassadorContentStats).values(data).returning();
        return result;
      }
      async updateAmbassadorContentStats(userId, data) {
        const [result] = await db.update(ambassadorContentStats).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(ambassadorContentStats.userId, userId)).returning();
        return result;
      }
      async getAmbassadorContentProgress(userId) {
        return await db.select().from(ambassadorContentProgress).where(eq(ambassadorContentProgress.userId, userId)).orderBy(ambassadorContentProgress.dayNumber);
      }
      async getAmbassadorDayProgress(userId, dayNumber) {
        const [result] = await db.select().from(ambassadorContentProgress).where(and(
          eq(ambassadorContentProgress.userId, userId),
          eq(ambassadorContentProgress.dayNumber, dayNumber)
        ));
        return result;
      }
      async upsertAmbassadorDayProgress(userId, dayNumber, data) {
        const existing = await this.getAmbassadorDayProgress(userId, dayNumber);
        if (existing) {
          const [result] = await db.update(ambassadorContentProgress).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(and(
            eq(ambassadorContentProgress.userId, userId),
            eq(ambassadorContentProgress.dayNumber, dayNumber)
          )).returning();
          return result;
        } else {
          const [result] = await db.insert(ambassadorContentProgress).values({
            userId,
            dayNumber,
            status: data.status || "available",
            ...data
          }).returning();
          return result;
        }
      }
      async updateUserStreak(userId, data) {
        const [result] = await db.update(userStreaks).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(userStreaks.userId, userId)).returning();
        return result;
      }
      // Community Features implementations
      async getSocialDirectionsForDay(dayNumber) {
        return await db.select().from(ambassadorSocialDirections).where(eq(ambassadorSocialDirections.dayNumber, dayNumber));
      }
      async createSocialDirection(data) {
        const [result] = await db.insert(ambassadorSocialDirections).values(data).returning();
        return result;
      }
      async getChallenges(status) {
        if (status) {
          return await db.select().from(ambassadorChallenges).where(eq(ambassadorChallenges.status, status)).orderBy(desc(ambassadorChallenges.startDate));
        }
        return await db.select().from(ambassadorChallenges).orderBy(desc(ambassadorChallenges.startDate));
      }
      async getChallengesByWeek(weekNumber) {
        return await db.select().from(ambassadorChallenges).where(eq(ambassadorChallenges.weekNumber, weekNumber));
      }
      async getChallenge(id) {
        const [result] = await db.select().from(ambassadorChallenges).where(eq(ambassadorChallenges.id, id));
        return result;
      }
      async createChallenge(data) {
        const [result] = await db.insert(ambassadorChallenges).values(data).returning();
        return result;
      }
      async updateChallenge(id, data) {
        const [result] = await db.update(ambassadorChallenges).set(data).where(eq(ambassadorChallenges.id, id)).returning();
        return result;
      }
      async joinChallenge(userId, challengeId) {
        const [result] = await db.insert(ambassadorChallengeParticipants).values({ userId, challengeId, status: "joined" }).returning();
        return result;
      }
      async getChallengeParticipation(userId, challengeId) {
        const [result] = await db.select().from(ambassadorChallengeParticipants).where(and(
          eq(ambassadorChallengeParticipants.userId, userId),
          eq(ambassadorChallengeParticipants.challengeId, challengeId)
        ));
        return result;
      }
      async getUserChallenges(userId) {
        const participations = await db.select().from(ambassadorChallengeParticipants).where(eq(ambassadorChallengeParticipants.userId, userId));
        const result = [];
        for (const p of participations) {
          const challenge = await this.getChallenge(p.challengeId);
          if (challenge) {
            result.push({ ...p, challenge });
          }
        }
        return result;
      }
      async updateChallengeProgress(userId, challengeId, data) {
        const [result] = await db.update(ambassadorChallengeParticipants).set(data).where(and(
          eq(ambassadorChallengeParticipants.userId, userId),
          eq(ambassadorChallengeParticipants.challengeId, challengeId)
        )).returning();
        return result;
      }
      async getEvents(status) {
        if (status) {
          return await db.select().from(ambassadorEvents).where(eq(ambassadorEvents.status, status)).orderBy(desc(ambassadorEvents.scheduledDate));
        }
        return await db.select().from(ambassadorEvents).orderBy(desc(ambassadorEvents.scheduledDate));
      }
      async getEventsByWeek(weekNumber) {
        return await db.select().from(ambassadorEvents).where(eq(ambassadorEvents.weekNumber, weekNumber));
      }
      async getEvent(id) {
        const [result] = await db.select().from(ambassadorEvents).where(eq(ambassadorEvents.id, id));
        return result;
      }
      async createEvent(data) {
        const [result] = await db.insert(ambassadorEvents).values(data).returning();
        return result;
      }
      async updateEvent(id, data) {
        const [result] = await db.update(ambassadorEvents).set(data).where(eq(ambassadorEvents.id, id)).returning();
        return result;
      }
      async registerForEvent(userId, eventId, role = "attendee") {
        const [result] = await db.insert(ambassadorEventRegistrations).values({ userId, eventId, role, status: "registered" }).returning();
        return result;
      }
      async getEventRegistration(userId, eventId) {
        const [result] = await db.select().from(ambassadorEventRegistrations).where(and(
          eq(ambassadorEventRegistrations.userId, userId),
          eq(ambassadorEventRegistrations.eventId, eventId)
        ));
        return result;
      }
      async getUserEvents(userId) {
        const registrations = await db.select().from(ambassadorEventRegistrations).where(eq(ambassadorEventRegistrations.userId, userId));
        const result = [];
        for (const r of registrations) {
          const event = await this.getEvent(r.eventId);
          if (event) {
            result.push({ ...r, event });
          }
        }
        return result;
      }
      async updateEventRegistration(userId, eventId, data) {
        const [result] = await db.update(ambassadorEventRegistrations).set(data).where(and(
          eq(ambassadorEventRegistrations.userId, userId),
          eq(ambassadorEventRegistrations.eventId, eventId)
        )).returning();
        return result;
      }
      async getEventRegistrations(eventId) {
        return await db.select().from(ambassadorEventRegistrations).where(eq(ambassadorEventRegistrations.eventId, eventId));
      }
      async getUserEventRegistrations(userId) {
        return await db.select().from(ambassadorEventRegistrations).where(eq(ambassadorEventRegistrations.userId, userId));
      }
      async getAmbassadorEvent(id) {
        const [result] = await db.select().from(ambassadorEvents).where(eq(ambassadorEvents.id, id));
        return result;
      }
      async updateAmbassadorEventRecording(eventId, recordingUrl, uploadedBy) {
        const [result] = await db.update(ambassadorEvents).set({
          recordingUrl,
          recordingUploadedAt: /* @__PURE__ */ new Date(),
          recordingUploadedBy: uploadedBy
        }).where(eq(ambassadorEvents.id, eventId)).returning();
        return result;
      }
      async updateAmbassadorEventStatus(eventId, status) {
        const [result] = await db.update(ambassadorEvents).set({ status }).where(eq(ambassadorEvents.id, eventId)).returning();
        return result;
      }
      // Challenge Sessions - for AI-guided challenge completion
      async getChallengeSession(userId, challengeId) {
        const [result] = await db.select().from(ambassadorChallengeSessions).where(and(
          eq(ambassadorChallengeSessions.userId, userId),
          eq(ambassadorChallengeSessions.challengeId, challengeId)
        ));
        return result;
      }
      async createChallengeSession(data) {
        const [result] = await db.insert(ambassadorChallengeSessions).values(data).returning();
        return result;
      }
      async updateChallengeSession(userId, challengeId, data) {
        const [result] = await db.update(ambassadorChallengeSessions).set(data).where(and(
          eq(ambassadorChallengeSessions.userId, userId),
          eq(ambassadorChallengeSessions.challengeId, challengeId)
        )).returning();
        return result;
      }
      async getUserChallengeSessions(userId) {
        return await db.select().from(ambassadorChallengeSessions).where(eq(ambassadorChallengeSessions.userId, userId));
      }
      // Event Schedules - for host-created sessions
      async getEventSchedules(eventId) {
        return await db.select().from(ambassadorEventSchedules).where(eq(ambassadorEventSchedules.eventId, eventId)).orderBy(ambassadorEventSchedules.startAt);
      }
      async getUpcomingSchedules(eventId) {
        return await db.select().from(ambassadorEventSchedules).where(and(
          eq(ambassadorEventSchedules.eventId, eventId),
          eq(ambassadorEventSchedules.status, "scheduled")
        )).orderBy(ambassadorEventSchedules.startAt);
      }
      async getSchedule(id) {
        const [result] = await db.select().from(ambassadorEventSchedules).where(eq(ambassadorEventSchedules.id, id));
        return result;
      }
      async getScheduleBySlug(slug) {
        const [result] = await db.select().from(ambassadorEventSchedules).where(eq(ambassadorEventSchedules.shareSlug, slug));
        return result;
      }
      async createEventSchedule(data) {
        const [result] = await db.insert(ambassadorEventSchedules).values(data).returning();
        return result;
      }
      async updateEventSchedule(id, data) {
        const [result] = await db.update(ambassadorEventSchedules).set(data).where(eq(ambassadorEventSchedules.id, id)).returning();
        return result;
      }
      async getHostSchedules(hostId) {
        return await db.select().from(ambassadorEventSchedules).where(eq(ambassadorEventSchedules.hostId, hostId)).orderBy(desc(ambassadorEventSchedules.createdAt));
      }
      async getAllAmbassadorSchedules() {
        return await db.select().from(ambassadorEventSchedules).orderBy(desc(ambassadorEventSchedules.createdAt));
      }
      // Schedule Registrations
      async registerForSchedule(userId, scheduleId) {
        const [result] = await db.insert(ambassadorScheduleRegistrations).values({ userId, scheduleId }).returning();
        await db.update(ambassadorEventSchedules).set({ currentAttendees: sql`${ambassadorEventSchedules.currentAttendees} + 1` }).where(eq(ambassadorEventSchedules.id, scheduleId));
        return result;
      }
      async getScheduleRegistration(userId, scheduleId) {
        const [result] = await db.select().from(ambassadorScheduleRegistrations).where(and(
          eq(ambassadorScheduleRegistrations.userId, userId),
          eq(ambassadorScheduleRegistrations.scheduleId, scheduleId)
        ));
        return result;
      }
      async getScheduleRegistrations(scheduleId) {
        return await db.select().from(ambassadorScheduleRegistrations).where(eq(ambassadorScheduleRegistrations.scheduleId, scheduleId));
      }
      // Community Comments
      async getComments(targetType, targetId) {
        const comments = await db.select().from(ambassadorCommunityComments).where(and(
          eq(ambassadorCommunityComments.targetType, targetType),
          eq(ambassadorCommunityComments.targetId, targetId)
        )).orderBy(ambassadorCommunityComments.createdAt);
        const commentsWithAuthors = await Promise.all(comments.map(async (comment) => {
          const [author] = await db.select().from(users).where(eq(users.id, comment.authorId));
          return { ...comment, author };
        }));
        return commentsWithAuthors;
      }
      async createComment(data) {
        const [result] = await db.insert(ambassadorCommunityComments).values(data).returning();
        return result;
      }
      async updateComment(id, content) {
        const [result] = await db.update(ambassadorCommunityComments).set({ content, updatedAt: /* @__PURE__ */ new Date() }).where(eq(ambassadorCommunityComments.id, id)).returning();
        return result;
      }
      async deleteComment(id) {
        const result = await db.delete(ambassadorCommunityComments).where(eq(ambassadorCommunityComments.id, id));
        return true;
      }
      async likeComment(id) {
        const [result] = await db.update(ambassadorCommunityComments).set({ likes: sql`${ambassadorCommunityComments.likes} + 1` }).where(eq(ambassadorCommunityComments.id, id)).returning();
        return result;
      }
      // VEDD Token System implementations
      async getVeddPoolWallets() {
        return await db.select().from(veddPoolWallets);
      }
      async getAmbassadorRewardsByUser(userId) {
        return await db.select().from(ambassadorActionRewards).where(eq(ambassadorActionRewards.userId, userId)).orderBy(desc(ambassadorActionRewards.createdAt));
      }
      async getVeddTransfersByUser(userId) {
        return await db.select().from(veddTransferJobs).where(eq(veddTransferJobs.userId, userId)).orderBy(desc(veddTransferJobs.createdAt));
      }
      async getVerifiedUnprocessedRewards(userId) {
        return await db.select().from(ambassadorActionRewards).where(and(
          eq(ambassadorActionRewards.userId, userId),
          eq(ambassadorActionRewards.verificationStatus, "verified"),
          isNull(ambassadorActionRewards.transferJobId)
        ));
      }
      async createVeddTransferJob(job) {
        const [result] = await db.insert(veddTransferJobs).values(job).returning();
        return result;
      }
      async updateAmbassadorReward(id, data) {
        const [result] = await db.update(ambassadorActionRewards).set(data).where(eq(ambassadorActionRewards.id, id)).returning();
        return result;
      }
      // Internal Wallet methods
      async getInternalWallet(userId) {
        const [result] = await db.select().from(internalWallets).where(eq(internalWallets.userId, userId));
        return result;
      }
      async createOrUpdateInternalWallet(userId, data) {
        const existing = await this.getInternalWallet(userId);
        if (existing) {
          const [result] = await db.update(internalWallets).set({ ...data, lastActivityAt: /* @__PURE__ */ new Date() }).where(eq(internalWallets.userId, userId)).returning();
          return result;
        } else {
          const [result] = await db.insert(internalWallets).values({ userId, ...data }).returning();
          return result;
        }
      }
      async addToWalletBalance(userId, amount, isPending = false) {
        const existing = await this.getInternalWallet(userId);
        if (existing) {
          const updateData = isPending ? { pendingBalance: (existing.pendingBalance || 0) + amount } : { veddBalance: (existing.veddBalance || 0) + amount, totalEarned: (existing.totalEarned || 0) + amount };
          const [result] = await db.update(internalWallets).set({ ...updateData, lastActivityAt: /* @__PURE__ */ new Date() }).where(eq(internalWallets.userId, userId)).returning();
          return result;
        } else {
          const newWallet = isPending ? { userId, pendingBalance: amount } : { userId, veddBalance: amount, totalEarned: amount };
          const [result] = await db.insert(internalWallets).values(newWallet).returning();
          return result;
        }
      }
      async getOrCreateInternalWallet(userId) {
        return this.createOrUpdateInternalWallet(userId, {});
      }
      async updateInternalWalletBalance(userId, delta) {
        const wallet = await this.getOrCreateInternalWallet(userId);
        const newBalance = Math.max(0, (wallet.veddBalance || 0) + delta);
        const [result] = await db.update(internalWallets).set({ veddBalance: newBalance, lastActivityAt: /* @__PURE__ */ new Date() }).where(eq(internalWallets.userId, userId)).returning();
        return result;
      }
      // Brain Data Marketplace
      async getActiveBrainListings(limit) {
        const query = db.select().from(brainDataListings).where(eq(brainDataListings.isActive, true)).orderBy(sql`${brainDataListings.purchaseCount} DESC`);
        if (limit) return await query.limit(limit);
        return await query;
      }
      async getBrainListing(id) {
        const [listing] = await db.select().from(brainDataListings).where(eq(brainDataListings.id, id));
        return listing;
      }
      async getUserActiveBrainListing(sellerId, sourceCategory) {
        const conditions = [eq(brainDataListings.sellerId, sellerId), eq(brainDataListings.isActive, true)];
        if (sourceCategory) conditions.push(eq(brainDataListings.sourceCategory, sourceCategory));
        const [listing] = await db.select().from(brainDataListings).where(and(...conditions));
        return listing;
      }
      async getUserBrainListings(sellerId) {
        return await db.select().from(brainDataListings).where(eq(brainDataListings.sellerId, sellerId)).orderBy(desc(brainDataListings.createdAt));
      }
      async createBrainListing(listing) {
        const [created] = await db.insert(brainDataListings).values(listing).returning();
        return created;
      }
      async deactivateBrainListing(id) {
        await db.update(brainDataListings).set({ isActive: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq(brainDataListings.id, id));
      }
      async incrementBrainListingPurchaseCount(id) {
        await db.execute(sql`UPDATE brain_data_listings SET purchase_count = COALESCE(purchase_count, 0) + 1 WHERE id = ${id}`);
      }
      async getBrainPurchaseByListingAndBuyer(listingId, buyerId) {
        const [purchase] = await db.select().from(brainDataPurchases).where(and(eq(brainDataPurchases.listingId, listingId), eq(brainDataPurchases.buyerId, buyerId)));
        return purchase;
      }
      async createBrainPurchase(purchase) {
        const [created] = await db.insert(brainDataPurchases).values(purchase).returning();
        return created;
      }
      async getUserBrainPurchases(buyerId) {
        const purchases = await db.select().from(brainDataPurchases).where(eq(brainDataPurchases.buyerId, buyerId)).orderBy(desc(brainDataPurchases.purchasedAt));
        const result = [];
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
      async getOutcomesForListing(userId, sourceCategory, symbols, includeManualTrades) {
        const conditions = [
          eq(aiConfirmationOutcomes.userId, userId),
          sql`${aiConfirmationOutcomes.tradeSource} IS DISTINCT FROM 'purchased_brain'`
        ];
        if (sourceCategory === "tradelocker") {
          conditions.push(inArray(aiConfirmationOutcomes.tradeSource, ["breakout", "ea_only"]));
        } else if (sourceCategory === "forex") {
          conditions.push(sql`${aiConfirmationOutcomes.tradeSource} NOT IN ('breakout', 'ea_only')`);
        }
        if (symbols && symbols.length) {
          conditions.push(inArray(aiConfirmationOutcomes.symbol, symbols));
        }
        const rows = await db.select().from(aiConfirmationOutcomes).where(and(...conditions));
        if (includeManualTrades && sourceCategory !== "tradelocker") {
          const manualConditions = [
            eq(aiTradeResults.userId, userId),
            eq(aiTradeResults.source, "manual"),
            sql`${aiTradeResults.result} IS NOT NULL`,
            sql`${aiTradeResults.result} != 'PENDING'`
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
              aiDecision: "MANUAL",
              aiConfidence: r.aiConfidence,
              proposedConfidence: null,
              tradeOutcome: r.result,
              actualPips: r.profitLossPips,
              confirmedAt: r.closedAt ?? r.createdAt,
              closedAt: r.closedAt,
              tradeSource: "manual",
              modelUsed: null,
              providerUsed: null,
              reasoningText: null,
              bullCase: null,
              bearCase: null,
              deepReasoningUsed: false
            });
          }
        }
        return rows;
      }
      // Matches an active listing by (sellerId, sourceCategory, symbolFilter) —
      // relisting the SAME pair scope replaces that specific brain with a fresh
      // snapshot; a different pair scope is a distinct, coexisting listing.
      async getUserActiveBrainListingBySymbols(sellerId, sourceCategory, symbols) {
        const listings = await db.select().from(brainDataListings).where(and(eq(brainDataListings.sellerId, sellerId), eq(brainDataListings.isActive, true), eq(brainDataListings.sourceCategory, sourceCategory)));
        const norm = (s) => Array.isArray(s) && s.length ? [...s].map((x) => x.toUpperCase()).sort().join(",") : "";
        const target = norm(symbols);
        return listings.find((l) => norm(l.symbolFilter) === target);
      }
      async importBrainDataSnapshot(buyerId, snapshotData) {
        if (!snapshotData.length) return 0;
        const rows = snapshotData.map((r) => ({
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
          tradeOutcome: r.tradeOutcome ?? "PENDING",
          actualPips: r.actualPips ?? null,
          modelUsed: r.modelUsed ?? null,
          providerUsed: r.providerUsed ?? null,
          tradeSource: "purchased_brain"
        }));
        const inserted = await db.insert(aiConfirmationOutcomes).values(rows).returning();
        return inserted.length;
      }
      // Withdrawal Request methods
      async createWithdrawalRequest(userId, amount, destinationWallet) {
        const [result] = await db.insert(withdrawalRequests).values({ userId, amount, destinationWallet, status: "pending" }).returning();
        return result;
      }
      async getWithdrawalRequests(userId) {
        return await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.userId, userId)).orderBy(desc(withdrawalRequests.requestedAt));
      }
      async getAllWithdrawalRequests() {
        return await db.select().from(withdrawalRequests).orderBy(desc(withdrawalRequests.requestedAt));
      }
      async updateWithdrawalRequest(id, data) {
        const [result] = await db.update(withdrawalRequests).set(data).where(eq(withdrawalRequests.id, id)).returning();
        return result;
      }
      // Connected Social Accounts methods
      async getConnectedSocialAccounts(userId) {
        return await db.select().from(connectedSocialAccounts).where(eq(connectedSocialAccounts.userId, userId));
      }
      async getConnectedSocialAccount(userId, platform) {
        const [result] = await db.select().from(connectedSocialAccounts).where(and(
          eq(connectedSocialAccounts.userId, userId),
          eq(connectedSocialAccounts.platform, platform)
        ));
        return result;
      }
      async connectSocialAccount(data) {
        const [result] = await db.insert(connectedSocialAccounts).values(data).onConflictDoUpdate({
          target: [connectedSocialAccounts.userId, connectedSocialAccounts.platform],
          set: {
            platformUserId: data.platformUserId,
            platformUsername: data.platformUsername,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            tokenExpiresAt: data.tokenExpiresAt,
            isActive: true,
            updatedAt: /* @__PURE__ */ new Date()
          }
        }).returning();
        return result;
      }
      async disconnectSocialAccount(userId, platform) {
        await db.delete(connectedSocialAccounts).where(and(
          eq(connectedSocialAccounts.userId, userId),
          eq(connectedSocialAccounts.platform, platform)
        ));
      }
      async updateSocialAccount(userId, platform, data) {
        const [result] = await db.update(connectedSocialAccounts).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(and(
          eq(connectedSocialAccounts.userId, userId),
          eq(connectedSocialAccounts.platform, platform)
        )).returning();
        return result;
      }
      // Social Posts methods
      async createSocialPost(data) {
        const [result] = await db.insert(socialPosts).values(data).returning();
        return result;
      }
      async getSocialPosts(userId) {
        return await db.select().from(socialPosts).where(eq(socialPosts.userId, userId)).orderBy(desc(socialPosts.createdAt));
      }
      async updateSocialPost(id, data) {
        const [result] = await db.update(socialPosts).set(data).where(eq(socialPosts.id, id)).returning();
        return result;
      }
      async getUserApiKeys(userId) {
        const results = await db.select().from(userApiKeys).where(eq(userApiKeys.userId, userId)).orderBy(userApiKeys.provider);
        return results.map((r) => ({ ...r, apiKey: decryptApiKey(r.apiKey) }));
      }
      async getUserApiKey(userId, provider) {
        const [result] = await db.select().from(userApiKeys).where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
        return result;
      }
      async createOrUpdateUserApiKey(data) {
        const encryptedKey = encryptApiKey(data.apiKey);
        const existing = await this.getUserApiKey(data.userId, data.provider);
        if (existing) {
          const [result2] = await db.update(userApiKeys).set({ apiKey: encryptedKey, label: data.label, isActive: data.isActive ?? true, isValid: null, lastValidated: null }).where(and(eq(userApiKeys.userId, data.userId), eq(userApiKeys.provider, data.provider))).returning();
          return result2;
        }
        const [result] = await db.insert(userApiKeys).values({ ...data, apiKey: encryptedKey }).returning();
        return result;
      }
      async deleteUserApiKey(userId, provider) {
        const result = await db.delete(userApiKeys).where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
        return true;
      }
      async updateUserApiKeyUsage(userId, provider) {
        await db.update(userApiKeys).set({ lastUsed: /* @__PURE__ */ new Date(), usageCount: sql`${userApiKeys.usageCount} + 1` }).where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
      }
      async getActiveUserApiKey(userId, provider) {
        const [result] = await db.select().from(userApiKeys).where(and(
          eq(userApiKeys.userId, userId),
          eq(userApiKeys.provider, provider),
          eq(userApiKeys.isActive, true)
        ));
        if (result) {
          return { ...result, apiKey: decryptApiKey(result.apiKey) };
        }
        return result;
      }
      async getActiveWeeklyStrategy(userId) {
        const [result] = await db.select().from(weeklyStrategies).where(and(eq(weeklyStrategies.userId, userId), eq(weeklyStrategies.isActive, true))).limit(1);
        return result;
      }
      async saveWeeklyStrategy(userId, data) {
        await db.update(weeklyStrategies).set({ isActive: false }).where(and(eq(weeklyStrategies.userId, userId), eq(weeklyStrategies.isActive, true)));
        const [result] = await db.insert(weeklyStrategies).values({
          userId,
          profitTarget: data.profitTarget,
          accountBalance: data.accountBalance,
          pairs: data.pairs,
          riskLevel: data.riskLevel || "ai-controlled",
          lotSize: data.lotSize || "auto",
          plan: data.plan,
          pairStats: data.pairStats || null,
          generatedAt: data.generatedAt,
          weekStart: data.weekStart,
          currentProfit: 0,
          progressTrades: 0,
          progressWinRate: 0,
          progressPercentage: 0,
          isActive: true
        }).returning();
        return result;
      }
      async saveWeeklyStrategyField(userId, fields) {
        await db.update(weeklyStrategies).set(fields).where(and(eq(weeklyStrategies.userId, userId), eq(weeklyStrategies.isActive, true)));
      }
      async updateWeeklyStrategyProgress(userId, progress) {
        const updates = {
          currentProfit: progress.currentProfit,
          progressTrades: progress.progressTrades,
          progressWinRate: progress.progressWinRate,
          progressPercentage: progress.progressPercentage
        };
        if (progress.accountBalance !== void 0) updates.accountBalance = progress.accountBalance;
        await db.update(weeklyStrategies).set(updates).where(and(eq(weeklyStrategies.userId, userId), eq(weeklyStrategies.isActive, true)));
      }
      async deleteWeeklyStrategy(userId) {
        await db.update(weeklyStrategies).set({ isActive: false }).where(and(eq(weeklyStrategies.userId, userId), eq(weeklyStrategies.isActive, true)));
      }
      async getAiModelConfig(userId) {
        const [result] = await db.select().from(aiModelConfigs).where(and(eq(aiModelConfigs.userId, userId), eq(aiModelConfigs.isActive, true))).limit(1);
        return result;
      }
      async upsertAiModelConfig(userId, data) {
        const existing = await this.getAiModelConfig(userId);
        if (existing) {
          const [updated] = await db.update(aiModelConfigs).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(aiModelConfigs.id, existing.id)).returning();
          return updated;
        }
        const [created] = await db.insert(aiModelConfigs).values({ userId, ...data }).returning();
        return created;
      }
      // ── Grants & Funding ─────────────────────────────────────────────────────
      async createGrant(grant) {
        const [result] = await db.insert(grants).values(grant).returning();
        return result;
      }
      async getGrants(filters) {
        const conditions = [];
        if (filters?.grantType) conditions.push(eq(grants.grantType, filters.grantType));
        if (filters?.isActive !== void 0) conditions.push(eq(grants.isActive, filters.isActive));
        if (filters?.targetAudience && filters.targetAudience !== "both") {
          conditions.push(sql`(${grants.targetAudience} = ${filters.targetAudience} OR ${grants.targetAudience} = 'both')`);
        }
        const whereClause = conditions.length > 0 ? and(...conditions) : void 0;
        return await db.select().from(grants).where(whereClause).orderBy(desc(grants.relevanceScore), desc(grants.createdAt));
      }
      async getGrantById(id) {
        const [result] = await db.select().from(grants).where(eq(grants.id, id));
        return result;
      }
      async upsertGrant(grant) {
        const [existing] = await db.select().from(grants).where(and(eq(grants.title, grant.title), eq(grants.funder, grant.funder)));
        if (existing) {
          const [updated] = await db.update(grants).set({ ...grant, updatedAt: /* @__PURE__ */ new Date(), lastScannedAt: /* @__PURE__ */ new Date() }).where(eq(grants.id, existing.id)).returning();
          return updated;
        }
        const [created] = await db.insert(grants).values({ ...grant, lastScannedAt: /* @__PURE__ */ new Date() }).returning();
        return created;
      }
      async updateGrant(id, data) {
        const [updated] = await db.update(grants).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(grants.id, id)).returning();
        return updated;
      }
      async createGrantApplication(application) {
        const [result] = await db.insert(grantApplications).values(application).returning();
        return result;
      }
      async getGrantApplicationsByUser(userId) {
        const results = await db.select({
          application: grantApplications,
          grant: grants
        }).from(grantApplications).innerJoin(grants, eq(grantApplications.grantId, grants.id)).where(eq(grantApplications.userId, userId)).orderBy(desc(grantApplications.updatedAt));
        return results.map((r) => ({ ...r.application, grant: r.grant }));
      }
      async getAllGrantApplications() {
        const results = await db.select({
          application: grantApplications,
          grant: grants,
          user: { id: users.id, username: users.username, fullName: users.fullName }
        }).from(grantApplications).innerJoin(grants, eq(grantApplications.grantId, grants.id)).innerJoin(users, eq(grantApplications.userId, users.id)).orderBy(desc(grantApplications.updatedAt));
        return results.map((r) => ({ ...r.application, grant: r.grant, user: r.user }));
      }
      async getGrantApplicationById(id) {
        const [result] = await db.select({
          application: grantApplications,
          grant: grants
        }).from(grantApplications).innerJoin(grants, eq(grantApplications.grantId, grants.id)).where(eq(grantApplications.id, id));
        if (!result) return void 0;
        return { ...result.application, grant: result.grant };
      }
      async updateGrantApplication(id, data) {
        const [updated] = await db.update(grantApplications).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(grantApplications.id, id)).returning();
        return updated;
      }
      async deleteGrantApplication(id) {
        const result = await db.delete(grantApplications).where(eq(grantApplications.id, id));
        return true;
      }
      async createGrantScanSession(sess) {
        const [result] = await db.insert(grantScanSessions).values(sess).returning();
        return result;
      }
      async updateGrantScanSession(id, data) {
        const [updated] = await db.update(grantScanSessions).set(data).where(eq(grantScanSessions.id, id)).returning();
        return updated;
      }
      async getGrantDashboardStats(userId, isAdmin) {
        const [{ count: totalGrants }] = await db.select({ count: sql`count(*)::int` }).from(grants).where(eq(grants.isActive, true));
        const allApps = await db.select({ status: grantApplications.status, awardedAmount: grantApplications.awardedAmount }).from(grantApplications).where(isAdmin ? void 0 : eq(grantApplications.userId, userId));
        const myApplications = allApps.length;
        const awarded = allApps.filter((a) => a.status === "awarded").length;
        const inProgress = allApps.filter((a) => ["applied", "under_review"].includes(a.status || "")).length;
        return { totalGrants, myApplications, awarded, inProgress, totalFundingAwarded: `${awarded} grants` };
      }
      // ─── AMBASSADOR LEAD GENERATION ───────────────────────────────────────────────
      async getOrCreateLandingPageQuiz(userId, referralCode) {
        const [existing] = await db.select().from(landingPageQuizzes).where(eq(landingPageQuizzes.userId, userId));
        if (existing) return existing;
        const [user] = await db.select().from(users).where(eq(users.id, userId));
        const namePart = (user?.fullName || user?.username || "ambassador").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 30);
        const slug = `${namePart}-${referralCode || userId}`.slice(0, 50);
        const [quiz] = await db.insert(landingPageQuizzes).values({
          userId,
          slug,
          title: "My VEDD Landing Page",
          questions: []
        }).returning();
        return quiz;
      }
      async getLandingPageQuizBySlug(slug) {
        const [quiz] = await db.select().from(landingPageQuizzes).where(eq(landingPageQuizzes.slug, slug));
        return quiz;
      }
      async updateLandingPageQuiz(id, data) {
        const [updated] = await db.update(landingPageQuizzes).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(landingPageQuizzes.id, id)).returning();
        return updated;
      }
      async getLeadsByAmbassador(ambassadorId, filters) {
        const conditions = [eq(quizLeads.ambassadorId, ambassadorId)];
        if (filters?.status) conditions.push(eq(quizLeads.status, filters.status));
        if (filters?.source) conditions.push(eq(quizLeads.source, filters.source));
        if (filters?.leadQuality) conditions.push(eq(quizLeads.leadQuality, filters.leadQuality));
        return await db.select().from(quizLeads).where(and(...conditions)).orderBy(desc(quizLeads.createdAt));
      }
      async createLead(lead) {
        const [created] = await db.insert(quizLeads).values(lead).returning();
        return created;
      }
      async updateLead(id, data) {
        const [updated] = await db.update(quizLeads).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(quizLeads.id, id)).returning();
        return updated;
      }
      async deleteLead(id) {
        await db.delete(quizLeads).where(eq(quizLeads.id, id));
      }
      async submitQuizLead(quizSlug, leadData) {
        const [quiz] = await db.select().from(landingPageQuizzes).where(eq(landingPageQuizzes.slug, quizSlug));
        if (!quiz) throw new Error("Quiz not found");
        const answers = leadData.answers || [];
        const questions = quiz.questions || [];
        const yesCount = answers.filter((a) => a.answer === "yes").length;
        const totalQ = questions.length || 1;
        const leadScore = Math.round(yesCount / totalQ * 100);
        const leadQuality = leadScore >= 70 ? "hot" : leadScore >= 40 ? "warm" : "cold";
        const [lead] = await db.insert(quizLeads).values({
          quizId: quiz.id,
          ambassadorId: quiz.userId,
          firstName: leadData.firstName || "Unknown",
          lastName: leadData.lastName || null,
          email: leadData.email || null,
          phone: leadData.phone || null,
          answers,
          leadScore,
          leadQuality,
          status: "new",
          source: "landing_page"
        }).returning();
        await db.update(landingPageQuizzes).set({ leadCount: (quiz.leadCount || 0) + 1, updatedAt: /* @__PURE__ */ new Date() }).where(eq(landingPageQuizzes.id, quiz.id));
        return lead;
      }
      async createSocialLeadScan(scan) {
        const [created] = await db.insert(socialLeadScans).values(scan).returning();
        return created;
      }
      async getSocialLeadScansByUser(userId) {
        return await db.select().from(socialLeadScans).where(eq(socialLeadScans.userId, userId)).orderBy(desc(socialLeadScans.createdAt));
      }
      // ─── BLOG POSTS ────────────────────────────────────────────────
      async getBlogPosts(filters) {
        let query = db.select().from(blogPosts).$dynamic();
        const conditions = [];
        if (filters?.isPublished !== void 0) {
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
      async getBlogPostBySlug(slug) {
        const [post] = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug));
        return post;
      }
      async getBlogPostById(id) {
        const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
        return post;
      }
      async createBlogPost(post) {
        const [created] = await db.insert(blogPosts).values(post).returning();
        return created;
      }
      async updateBlogPost(id, data) {
        const [updated] = await db.update(blogPosts).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(blogPosts.id, id)).returning();
        return updated;
      }
      async deleteBlogPost(id) {
        await db.delete(blogPosts).where(eq(blogPosts.id, id));
      }
      async incrementBlogPostViews(id) {
        await db.execute(sql`UPDATE blog_posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ${id}`);
      }
      async createBlogNewsletterSubscriber(sub) {
        const [created] = await db.insert(blogNewsletterSubscribers).values(sub).returning();
        return created;
      }
      async getBlogNewsletterSubscriberByEmail(email) {
        const [sub] = await db.select().from(blogNewsletterSubscribers).where(eq(blogNewsletterSubscribers.email, email));
        return sub;
      }
      async resubscribeBlogNewsletter(email) {
        const [updated] = await db.update(blogNewsletterSubscribers).set({ status: "subscribed", unsubscribedAt: null }).where(eq(blogNewsletterSubscribers.email, email)).returning();
        return updated;
      }
      async getAllBlogNewsletterSubscribers() {
        return await db.select().from(blogNewsletterSubscribers).orderBy(desc(blogNewsletterSubscribers.subscribedAt));
      }
      // ─── AMBASSADOR FREE PATH JOURNEY ─────────────────────────────
      async getAmbassadorJourney(userId) {
        const [journey] = await db.select().from(ambassadorJourney).where(eq(ambassadorJourney.userId, userId));
        return journey;
      }
      async getOrCreateAmbassadorJourney(userId) {
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
          savedContent: []
        }).returning();
        return created;
      }
      async updateAmbassadorJourney(userId, data) {
        const [updated] = await db.update(ambassadorJourney).set({ ...data, updatedAt: /* @__PURE__ */ new Date(), lastActiveAt: /* @__PURE__ */ new Date() }).where(eq(ambassadorJourney.userId, userId)).returning();
        return updated;
      }
      async completeAmbassadorDay(userId, day) {
        const journey = await this.getOrCreateAmbassadorJourney(userId);
        const completedDays = journey.completedDays || [];
        if (completedDays.includes(day)) return journey;
        const newCompletedDays = [...completedDays, day];
        const newCurrentDay = Math.min(44, day + 1);
        const yesterday = day - 1;
        const hasYesterday = completedDays.includes(yesterday) || day === 1;
        const newStreak = hasYesterday ? journey.streakDays + 1 : 1;
        const newLongestStreak = Math.max(journey.longestStreak, newStreak);
        let tokensToAward = 10;
        if (newStreak === 7 || newStreak === 14 || newStreak === 21 || newStreak === 28 || newStreak === 35 || newStreak === 42) {
          tokensToAward += 100;
        }
        const allDone = newCompletedDays.length >= 44;
        if (allDone) tokensToAward += 960;
        const subscriptionEarned = allDone || journey.subscriptionEarned;
        const monthsEarned = allDone ? journey.monthsEarned + 1 : journey.monthsEarned;
        const [updated] = await db.update(ambassadorJourney).set({
          completedDays: newCompletedDays,
          currentDay: newCurrentDay,
          streakDays: newStreak,
          longestStreak: newLongestStreak,
          tokensEarned: journey.tokensEarned + tokensToAward,
          postsCompleted: journey.postsCompleted + 1,
          subscriptionEarned,
          monthsEarned,
          lastActiveAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(ambassadorJourney.userId, userId)).returning();
        return updated;
      }
      async getDailyActions(userId, day) {
        return await db.select().from(ambassadorDailyActions).where(and(eq(ambassadorDailyActions.userId, userId), eq(ambassadorDailyActions.day, day)));
      }
      async completeDailyAction(userId, actionId) {
        const [updated] = await db.update(ambassadorDailyActions).set({ completed: true, completedAt: /* @__PURE__ */ new Date(), tokensAwarded: 5 }).where(and(eq(ambassadorDailyActions.id, actionId), eq(ambassadorDailyActions.userId, userId))).returning();
        if (!updated) throw new Error("Action not found");
        return updated;
      }
      async awardJourneyTokens(userId, tokens, _reason) {
        await db.update(ambassadorJourney).set({ tokensEarned: sql`tokens_earned + ${tokens}`, updatedAt: /* @__PURE__ */ new Date() }).where(eq(ambassadorJourney.userId, userId));
      }
      // ── Stop Orders ──────────────────────────────────────────────────────────────
      async getStopOrder(id) {
        const [order] = await db.select().from(stopOrders).where(eq(stopOrders.id, id));
        return order;
      }
      async getUserStopOrders(userId, symbol, status) {
        const conditions = [eq(stopOrders.userId, userId)];
        if (symbol) {
          conditions.push(eq(stopOrders.symbol, symbol.toUpperCase().replace("/", "")));
        }
        if (status) {
          conditions.push(eq(stopOrders.status, status.toUpperCase()));
        }
        return db.select().from(stopOrders).where(and(...conditions)).orderBy(sql`${stopOrders.createdAt} DESC`);
      }
      async updateStopOrder(id, data) {
        const [updated] = await db.update(stopOrders).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(stopOrders.id, id)).returning();
        return updated;
      }
    };
    storage = new DatabaseStorage();
  }
});

// server/cryptocom.ts
import crypto2 from "crypto";
function getEncryptionKey2() {
  const key = process.env.CRYPTOCOM_ENCRYPTION_KEY;
  if (!key) {
    console.warn("[Crypto.com] CRYPTOCOM_ENCRYPTION_KEY not set \u2014 using default key. Set it in your Render environment variables.");
    return DEFAULT_ENCRYPTION_KEY;
  }
  if (key.length < 32) {
    console.warn("[Crypto.com] CRYPTOCOM_ENCRYPTION_KEY is too short, padding to 32 chars.");
    return key.padEnd(32, "0");
  }
  return key;
}
function encryptApiSecret(secret) {
  const iv = crypto2.randomBytes(IV_LENGTH);
  const salt = crypto2.randomBytes(SALT_LENGTH);
  const key = crypto2.scryptSync(getEncryptionKey2(), salt, 32);
  const cipher = crypto2.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");
  return salt.toString("hex") + ":" + iv.toString("hex") + ":" + encrypted;
}
function decryptApiSecret(encrypted) {
  const parts = encrypted.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted secret format");
  const [saltHex, ivHex, data] = parts;
  const key = crypto2.scryptSync(getEncryptionKey2(), Buffer.from(saltHex, "hex"), 32);
  const decipher = crypto2.createDecipheriv("aes-256-cbc", key, Buffer.from(ivHex, "hex"));
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
var IV_LENGTH, SALT_LENGTH, DEFAULT_ENCRYPTION_KEY, CryptoComService;
var init_cryptocom = __esm({
  "server/cryptocom.ts"() {
    "use strict";
    IV_LENGTH = 16;
    SALT_LENGTH = 16;
    DEFAULT_ENCRYPTION_KEY = "vedd-cryptocom-default-key-change-32ch";
    CryptoComService = class {
      baseUrl = "https://api.crypto.com/exchange/v1";
      apiKey;
      apiSecret;
      constructor(apiKey, apiSecret) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
      }
      sign(method, id, params, nonce) {
        const paramString = Object.keys(params).sort().map((k) => `${k}${typeof params[k] === "object" ? JSON.stringify(params[k]) : params[k]}`).join("");
        const sigPayload = `${method}${id}${this.apiKey}${paramString}${nonce}`;
        return crypto2.createHmac("sha256", this.apiSecret).update(sigPayload).digest("hex");
      }
      async call(method, params = {}) {
        const id = Date.now();
        const nonce = Date.now();
        const sig = this.sign(method, id, params, nonce);
        const body = { id, method, api_key: this.apiKey, params, nonce, sig };
        const response = await fetch(`${this.baseUrl}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(12e3)
        });
        if (!response.ok) {
          const text2 = await response.text();
          throw new Error(`Crypto.com API failed: ${response.status} - ${text2}`);
        }
        const data = await response.json();
        if (data.code !== void 0 && data.code !== 0) {
          throw new Error(`Crypto.com error ${data.code}: ${data.message || "Unknown error"}`);
        }
        return data.result;
      }
      // "Authenticate" = verify the key/secret pair works before storing it.
      async authenticate() {
        return this.getAccountInfo();
      }
      async getAccountInfo() {
        const result = await this.call("private/user-balance");
        const account = result?.data?.[0];
        if (!account) throw new Error("Crypto.com returned no account balance data");
        return {
          balance: parseFloat(account.total_cash_balance ?? "0"),
          // Crypto.com's user-balance response has no `total_balance` field at all
          // (confirmed via raw API response) — that typo silently returned 0 via
          // the `?? '0'` fallback, every call, forever. `total_margin_balance` is
          // the real equity figure (cash + collateral value, matches total_cash_balance
          // when there's no open PnL). This 0 equity fed straight into
          // computeCryptocomQuantity's `accountBalance <= 0` short-circuit, which is
          // why the engine never sized a single trade since inception despite
          // correctly detecting signals the whole time.
          equity: parseFloat(account.total_margin_balance ?? account.total_cash_balance ?? "0"),
          availableBalance: parseFloat(account.total_available_balance ?? "0"),
          currency: "USD"
        };
      }
      async placeOrder(order) {
        const result = await this.call("private/create-order", {
          instrument_name: order.instrumentName,
          side: order.side,
          type: order.type,
          quantity: String(order.quantity),
          ...order.type === "LIMIT" && order.price ? { price: String(order.price) } : {}
        });
        return {
          orderId: String(result?.order_id ?? ""),
          status: result?.status ?? "unknown"
        };
      }
      // ── Public market data (no auth needed) — static so the scanner can pull
      // candles/price without a per-user connection/credentials. ─────────────────
      static async getCandles(instrumentName, timeframe, count) {
        const url = `https://api.crypto.com/exchange/v1/public/get-candlestick?instrument_name=${encodeURIComponent(instrumentName)}&timeframe=${encodeURIComponent(timeframe)}&count=${count}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15e3) });
        if (!res.ok) throw new Error(`Crypto.com candlestick fetch failed: ${res.status}`);
        const data = await res.json();
        if (data.code !== void 0 && data.code !== 0) throw new Error(`Crypto.com candlestick error ${data.code}: ${data.message}`);
        const rows = data.result?.data ?? [];
        return rows.map((r) => ({ t: Number(r.t), o: parseFloat(r.o), h: parseFloat(r.h), l: parseFloat(r.l), c: parseFloat(r.c), v: parseFloat(r.v) }));
      }
      static async getTicker(instrumentName) {
        const url = `https://api.crypto.com/exchange/v1/public/get-tickers?instrument_name=${encodeURIComponent(instrumentName)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(1e4) });
        if (!res.ok) return null;
        const data = await res.json();
        const t = data.result?.data?.[0];
        return t ? parseFloat(t.a ?? t.l ?? "0") || null : null;
      }
    };
  }
});

// server/indicators.ts
function calculateADX(candles, period = 14) {
  if (candles.length < period + 1) return void 0;
  const chronological = [...candles].reverse();
  const trList = [];
  const plusDMList = [];
  const minusDMList = [];
  for (let i = 1; i < chronological.length; i++) {
    const high = chronological[i].h;
    const low = chronological[i].l;
    const prevClose = chronological[i - 1].c;
    const prevHigh = chronological[i - 1].h;
    const prevLow = chronological[i - 1].l;
    trList.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    const plusDM = high - prevHigh > prevLow - low ? Math.max(high - prevHigh, 0) : 0;
    const minusDM = prevLow - low > high - prevHigh ? Math.max(prevLow - low, 0) : 0;
    plusDMList.push(plusDM);
    minusDMList.push(minusDM);
  }
  if (trList.length < period) return void 0;
  let atr = trList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let smoothPlusDM = plusDMList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let smoothMinusDM = minusDMList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trList.length; i++) {
    atr = (atr * (period - 1) + trList[i]) / period;
    smoothPlusDM = (smoothPlusDM * (period - 1) + plusDMList[i]) / period;
    smoothMinusDM = (smoothMinusDM * (period - 1) + minusDMList[i]) / period;
  }
  const plusDI = atr > 0 ? smoothPlusDM / atr * 100 : 0;
  const minusDI = atr > 0 ? smoothMinusDM / atr * 100 : 0;
  const dx = plusDI + minusDI > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
  const dxList = [];
  let tempATR = trList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let tempPlusDM = plusDMList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let tempMinusDM = minusDMList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trList.length; i++) {
    tempATR = (tempATR * (period - 1) + trList[i]) / period;
    tempPlusDM = (tempPlusDM * (period - 1) + plusDMList[i]) / period;
    tempMinusDM = (tempMinusDM * (period - 1) + minusDMList[i]) / period;
    const pdi = tempATR > 0 ? tempPlusDM / tempATR * 100 : 0;
    const mdi = tempATR > 0 ? tempMinusDM / tempATR * 100 : 0;
    dxList.push(pdi + mdi > 0 ? Math.abs(pdi - mdi) / (pdi + mdi) * 100 : 0);
  }
  let adxValue = dx;
  if (dxList.length >= period) {
    adxValue = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxList.length; i++) {
      adxValue = (adxValue * (period - 1) + dxList[i]) / period;
    }
  }
  const trend = adxValue > 50 ? "VERY STRONG" : adxValue > 25 ? "STRONG" : adxValue > 20 ? "MODERATE" : "WEAK";
  const signal = plusDI > minusDI ? "BUY" : minusDI > plusDI ? "SELL" : "NEUTRAL";
  return {
    value: Math.round(adxValue * 100) / 100,
    plusDI: Math.round(plusDI * 100) / 100,
    minusDI: Math.round(minusDI * 100) / 100,
    trend,
    signal
  };
}
function calculateStochastic(candles, kPeriod = 14, dPeriod = 3) {
  if (candles.length < kPeriod) return void 0;
  const chronological = [...candles].reverse();
  const kValues = [];
  for (let i = kPeriod - 1; i < chronological.length; i++) {
    const window = chronological.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...window.map((c) => c.h));
    const lowest = Math.min(...window.map((c) => c.l));
    const close = chronological[i].c;
    kValues.push(highest !== lowest ? (close - lowest) / (highest - lowest) * 100 : 50);
  }
  const k = kValues[kValues.length - 1];
  const d = kValues.length >= dPeriod ? kValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod : k;
  const status = k > 80 ? "OVERBOUGHT" : k < 20 ? "OVERSOLD" : "NEUTRAL";
  let signal = "NEUTRAL";
  if (k < 20 && k > d) signal = "BUY";
  else if (k > 80 && k < d) signal = "SELL";
  return {
    k: Math.round(k * 100) / 100,
    d: Math.round(d * 100) / 100,
    status,
    signal
  };
}
function calculateVWAP(candles) {
  if (candles.length < 2) return void 0;
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  for (let i = candles.length - 1; i >= 0; i--) {
    const tp = (candles[i].h + candles[i].l + candles[i].c) / 3;
    const vol = candles[i].v || 1;
    cumulativeTPV += tp * vol;
    cumulativeVolume += vol;
  }
  const vwapValue = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : candles[0].c;
  const currentPrice = candles[0].c;
  const priceRelation = currentPrice > vwapValue * 1.001 ? "ABOVE" : currentPrice < vwapValue * 0.999 ? "BELOW" : "AT";
  const signal = priceRelation === "ABOVE" ? "BUY" : priceRelation === "BELOW" ? "SELL" : "NEUTRAL";
  return {
    value: Math.round(vwapValue * 1e5) / 1e5,
    priceRelation,
    signal
  };
}
function calculateOBV(candles) {
  if (candles.length < 5) return void 0;
  let obv = 0;
  const obvValues = [0];
  for (let i = candles.length - 2; i >= 0; i--) {
    const vol = candles[i].v || 0;
    if (candles[i].c > candles[i + 1].c) obv += vol;
    else if (candles[i].c < candles[i + 1].c) obv -= vol;
    obvValues.push(obv);
  }
  const recent = obvValues.slice(-5);
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const trend = obv > avgRecent * 1.05 ? "RISING" : obv < avgRecent * 0.95 ? "FALLING" : "FLAT";
  const priceRising = candles[0].c > candles[Math.min(4, candles.length - 1)].c;
  const obvRising = trend === "RISING";
  let divergence = "NONE";
  if (priceRising && !obvRising) divergence = "BEARISH";
  else if (!priceRising && obvRising) divergence = "BULLISH";
  return { value: Math.round(obv), trend, divergence };
}
function calculatePivotPoints(candles) {
  if (candles.length < 2) return void 0;
  const prevCandle = candles[1];
  const pp = (prevCandle.h + prevCandle.l + prevCandle.c) / 3;
  const r1 = 2 * pp - prevCandle.l;
  const s1 = 2 * pp - prevCandle.h;
  const r2 = pp + (prevCandle.h - prevCandle.l);
  const s2 = pp - (prevCandle.h - prevCandle.l);
  const r3 = prevCandle.h + 2 * (pp - prevCandle.l);
  const s3 = prevCandle.l - 2 * (prevCandle.h - pp);
  const round = (n) => Math.round(n * 1e5) / 1e5;
  return { pp: round(pp), r1: round(r1), r2: round(r2), r3: round(r3), s1: round(s1), s2: round(s2), s3: round(s3) };
}
function calculateFibonacci(candles, lookback = 50) {
  const len = Math.min(lookback, candles.length);
  if (len < 5) return void 0;
  const slice = candles.slice(0, len);
  const highest = Math.max(...slice.map((c) => c.h));
  const lowest = Math.min(...slice.map((c) => c.l));
  const currentPrice = candles[0].c;
  const isUptrend = candles[0].c > candles[len - 1].c;
  const diff = highest - lowest;
  if (diff === 0) return void 0;
  const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const levels = fibLevels.map((fib) => ({
    level: `${(fib * 100).toFixed(1)}%`,
    price: Math.round((isUptrend ? highest - diff * fib : lowest + diff * fib) * 1e5) / 1e5
  }));
  let nearestIdx = 0;
  let nearestDist = Infinity;
  levels.forEach((l, i) => {
    const dist = Math.abs(currentPrice - l.price);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = i;
    }
  });
  return {
    trend: isUptrend ? "UPTREND" : "DOWNTREND",
    levels,
    nearestLevel: levels[nearestIdx].level,
    nearestPrice: levels[nearestIdx].price
  };
}
function findSupportResistance(candles, lookback = 50) {
  const len = Math.min(lookback, candles.length);
  if (len < 10) return void 0;
  const currentPrice = candles[0].c;
  const levels = [];
  for (let i = 2; i < len - 2; i++) {
    if (candles[i].h > candles[i - 1].h && candles[i].h > candles[i - 2].h && candles[i].h > candles[i + 1].h && candles[i].h > candles[i + 2].h) {
      levels.push(candles[i].h);
    }
    if (candles[i].l < candles[i - 1].l && candles[i].l < candles[i - 2].l && candles[i].l < candles[i + 1].l && candles[i].l < candles[i + 2].l) {
      levels.push(candles[i].l);
    }
  }
  const clustered = [];
  const tolerance = currentPrice * 1e-3;
  for (const level of levels.sort((a, b) => a - b)) {
    if (clustered.length === 0 || Math.abs(level - clustered[clustered.length - 1]) > tolerance) {
      clustered.push(Math.round(level * 1e5) / 1e5);
    }
  }
  const supports = clustered.filter((l) => l < currentPrice).slice(-3);
  const resistances = clustered.filter((l) => l > currentPrice).slice(0, 3);
  return {
    supports,
    resistances,
    nearestSupport: supports.length > 0 ? supports[supports.length - 1] : 0,
    nearestResistance: resistances.length > 0 ? resistances[0] : 0
  };
}
function detectCandlePatterns(candles) {
  if (candles.length < 3) return [];
  const patterns = [];
  const c0 = candles[0];
  const c1 = candles[1];
  const c2 = candles[2];
  const bodySize = (c) => Math.abs(c.c - c.o);
  const candleRange = (c) => c.h - c.l;
  const isBullish = (c) => c.c > c.o;
  const isBearish = (c) => c.c < c.o;
  const upperWick = (c) => c.h - Math.max(c.o, c.c);
  const lowerWick = (c) => Math.min(c.o, c.c) - c.l;
  const range0 = candleRange(c0);
  const body0 = bodySize(c0);
  const body1 = bodySize(c1);
  if (range0 > 0 && body0 / range0 < 0.1) {
    patterns.push("Doji");
  }
  if (range0 > 0) {
    const lw = lowerWick(c0);
    const uw = upperWick(c0);
    if (lw > body0 * 2 && uw < body0 * 0.5 && isBullish(c0)) {
      patterns.push("Hammer (Bullish)");
    }
    if (uw > body0 * 2 && lw < body0 * 0.5 && isBearish(c0)) {
      patterns.push("Shooting Star (Bearish)");
    }
  }
  if (isBearish(c1) && isBullish(c0) && c0.c > c1.o && c0.o < c1.c && body0 > body1 * 0.5) {
    patterns.push("Bullish Engulfing");
  }
  if (isBullish(c1) && isBearish(c0) && c0.c < c1.o && c0.o > c1.c && body0 > body1 * 0.5) {
    patterns.push("Bearish Engulfing");
  }
  if (candles.length >= 3) {
    if (isBearish(c2) && bodySize(c2) > 0 && bodySize(c1) < bodySize(c2) * 0.3 && isBullish(c0) && c0.c > (c2.o + c2.c) / 2) {
      patterns.push("Morning Star (Bullish)");
    }
    if (isBullish(c2) && bodySize(c2) > 0 && bodySize(c1) < bodySize(c2) * 0.3 && isBearish(c0) && c0.c < (c2.o + c2.c) / 2) {
      patterns.push("Evening Star (Bearish)");
    }
  }
  if (range0 > 0 && body0 / range0 < 0.3 && upperWick(c0) > range0 * 0.3 && lowerWick(c0) > range0 * 0.3) {
    patterns.push("Spinning Top");
  }
  if (body0 > 0) {
    const avgBody = candles.slice(0, 10).reduce((s, c) => s + bodySize(c), 0) / Math.min(10, candles.length);
    if (body0 > avgBody * 2 && isBullish(c0)) patterns.push("Strong Bullish Candle");
    if (body0 > avgBody * 2 && isBearish(c0)) patterns.push("Strong Bearish Candle");
  }
  return patterns;
}
function findSwingPoints(candles, lookback = 30) {
  const len = Math.min(lookback, candles.length);
  if (len < 5) return void 0;
  let swingHigh = candles[0].h, swingHighIdx = 0;
  let swingLow = candles[0].l, swingLowIdx = 0;
  for (let i = 2; i < len - 2; i++) {
    if (candles[i].h > candles[i - 1].h && candles[i].h > candles[i - 2].h && candles[i].h > candles[i + 1].h && candles[i].h > candles[i + 2].h) {
      if (swingHighIdx === 0 || i < swingHighIdx) {
        swingHigh = candles[i].h;
        swingHighIdx = i;
      }
      break;
    }
  }
  for (let i = 2; i < len - 2; i++) {
    if (candles[i].l < candles[i - 1].l && candles[i].l < candles[i - 2].l && candles[i].l < candles[i + 1].l && candles[i].l < candles[i + 2].l) {
      if (swingLowIdx === 0 || i < swingLowIdx) {
        swingLow = candles[i].l;
        swingLowIdx = i;
      }
      break;
    }
  }
  return {
    lastSwingHigh: Math.round(swingHigh * 1e5) / 1e5,
    lastSwingLow: Math.round(swingLow * 1e5) / 1e5,
    swingHighIndex: swingHighIdx,
    swingLowIndex: swingLowIdx
  };
}
function getSessionContext(symbol) {
  const now = /* @__PURE__ */ new Date();
  const hourUTC = now.getUTCHours();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayOfWeek = days[now.getUTCDay()];
  let session2 = "OFF";
  let isSessionOpen = false;
  if (hourUTC >= 0 && hourUTC < 9) {
    session2 = "ASIAN";
    isSessionOpen = true;
  } else if (hourUTC >= 7 && hourUTC < 16) {
    session2 = "LONDON";
    isSessionOpen = true;
  } else if (hourUTC >= 13 && hourUTC < 22) {
    session2 = "NEW_YORK";
    isSessionOpen = true;
  }
  if (hourUTC >= 13 && hourUTC < 16) session2 = "LONDON_NY_OVERLAP";
  if (hourUTC >= 7 && hourUTC < 9) session2 = "ASIAN_LONDON_OVERLAP";
  if (dayOfWeek === "Saturday" || dayOfWeek === "Sunday") {
    isSessionOpen = false;
    session2 = "WEEKEND";
  }
  return {
    session: session2,
    dayOfWeek,
    hourUTC,
    isSessionOpen,
    distanceFromSessionHigh: 0,
    distanceFromSessionLow: 0
  };
}
function calculateVolatilityContext(candles, currentATR) {
  if (candles.length < 30) return void 0;
  const atrValues = [];
  for (let start = 0; start <= candles.length - 15; start++) {
    let sum = 0;
    for (let i = start; i < start + 14 && i < candles.length - 1; i++) {
      const tr = Math.max(
        candles[i].h - candles[i].l,
        Math.abs(candles[i].h - candles[i + 1].c),
        Math.abs(candles[i].l - candles[i + 1].c)
      );
      sum += tr;
    }
    atrValues.push(sum / 14);
  }
  const atr30Avg = atrValues.slice(0, 30).reduce((a, b) => a + b, 0) / Math.min(30, atrValues.length);
  const ratio = atr30Avg > 0 ? currentATR / atr30Avg : 1;
  const volatilityPercentile = ratio > 1.5 ? "VERY HIGH" : ratio > 1.2 ? "HIGH" : ratio > 0.8 ? "NORMAL" : "LOW";
  const isExpanding = atrValues.length >= 3 && atrValues[0] > atrValues[1] && atrValues[1] > atrValues[2];
  return {
    currentATR: Math.round(currentATR * 1e5) / 1e5,
    atr30Avg: Math.round(atr30Avg * 1e5) / 1e5,
    volatilityPercentile,
    isExpanding
  };
}
function calculateVolumeProfile(candles) {
  if (candles.length < 5) return void 0;
  const totalVol = candles.reduce((s, c) => s + (c.v || 0), 0);
  const avgVolume = totalVol / candles.length;
  const currentVolume = candles[0].v || 0;
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;
  const recentAvg = candles.slice(0, 5).reduce((s, c) => s + (c.v || 0), 0) / 5;
  const olderAvg = candles.slice(5, 15).reduce((s, c) => s + (c.v || 0), 0) / Math.min(10, Math.max(1, candles.length - 5));
  const volumeTrend = recentAvg > olderAvg * 1.2 ? "INCREASING" : recentAvg < olderAvg * 0.8 ? "DECREASING" : "STABLE";
  const vp = computeTrueVolumeProfile(candles);
  return {
    avgVolume: Math.round(avgVolume),
    currentVolume: Math.round(currentVolume),
    volumeRatio: Math.round(volumeRatio * 100) / 100,
    volumeTrend,
    poc: vp?.poc,
    vah: vp?.vah,
    val: vp?.val,
    pocStrength: vp?.pocStrength
  };
}
function computeTrueVolumeProfile(candles) {
  if (candles.length < 10) return void 0;
  const NUM_BUCKETS = 50;
  const priceHigh = Math.max(...candles.map((c) => c.h));
  const priceLow = Math.min(...candles.map((c) => c.l));
  const priceRange = priceHigh - priceLow;
  const totalVol = candles.reduce((s, c) => s + (c.v || 0), 0);
  if (priceRange <= 0 || totalVol === 0) return void 0;
  const bucketSize = priceRange / NUM_BUCKETS;
  const buckets = new Array(NUM_BUCKETS).fill(0);
  for (const candle of candles) {
    const vol = candle.v || 0;
    if (vol === 0) continue;
    const candleRange = candle.h - candle.l;
    if (candleRange <= 0) {
      const bi = Math.min(Math.floor((candle.c - priceLow) / bucketSize), NUM_BUCKETS - 1);
      if (bi >= 0) buckets[bi] += vol;
      continue;
    }
    const startBi = Math.max(0, Math.floor((candle.l - priceLow) / bucketSize));
    const endBi = Math.min(NUM_BUCKETS - 1, Math.floor((candle.h - priceLow) / bucketSize));
    const span = endBi - startBi + 1;
    const volPerBucket = vol / span;
    for (let bi = startBi; bi <= endBi; bi++) {
      buckets[bi] += volPerBucket;
    }
  }
  const maxVol = Math.max(...buckets);
  const pocIdx = buckets.indexOf(maxVol);
  const poc = priceLow + (pocIdx + 0.5) * bucketSize;
  const pocStrength = Math.round(maxVol / totalVol * 100);
  let vaVol = maxVol;
  let loIdx = pocIdx, hiIdx = pocIdx;
  while (vaVol < totalVol * 0.7 && (loIdx > 0 || hiIdx < NUM_BUCKETS - 1)) {
    const loNext = loIdx > 0 ? buckets[loIdx - 1] : 0;
    const hiNext = hiIdx < NUM_BUCKETS - 1 ? buckets[hiIdx + 1] : 0;
    if (loNext >= hiNext) {
      loIdx = Math.max(0, loIdx - 1);
      vaVol += loNext;
    } else {
      hiIdx = Math.min(NUM_BUCKETS - 1, hiIdx + 1);
      vaVol += hiNext;
    }
  }
  const vah = priceLow + (hiIdx + 1) * bucketSize;
  const val = priceLow + loIdx * bucketSize;
  const r = (n) => Math.round(n * 1e5) / 1e5;
  return { poc: r(poc), vah: r(vah), val: r(val), pocStrength };
}
function calculateRSI(candles, period = 14) {
  if (candles.length < period + 1) return void 0;
  const chronological = [...candles].reverse();
  const closes = chronological.map((c) => c.c);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const value = Math.round((100 - 100 / (1 + rs)) * 100) / 100;
  const trend = value < 38 ? "oversold" : value > 62 ? "overbought" : "neutral";
  return { value, trend };
}
function calcEMA(values, period) {
  const k = 2 / (period + 1);
  const ema = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}
function calculateMACD(candles, fast = 12, slow = 26, signalPeriod = 9) {
  if (candles.length < slow + signalPeriod) return void 0;
  const closes = [...candles].reverse().map((c) => c.c);
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]).slice(slow - 1);
  const signalLine = calcEMA(macdLine, signalPeriod);
  const lastIdx = signalLine.length - 1;
  const macdVal = Math.round(macdLine[macdLine.length - 1] * 1e6) / 1e6;
  const signalVal = Math.round(signalLine[lastIdx] * 1e6) / 1e6;
  const histogram = Math.round((macdVal - signalVal) * 1e6) / 1e6;
  const trend = histogram > 0 ? "bullish" : histogram < 0 ? "bearish" : "neutral";
  return { macd: macdVal, signal: signalVal, histogram, trend };
}
function detectMarketOpenBreakout(candles, symbol, timeframe) {
  if (candles.length < 20) return void 0;
  const now = /* @__PURE__ */ new Date();
  const hourUTC = now.getUTCHours();
  const minuteUTC = now.getUTCMinutes();
  const dayOfWeek = now.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return void 0;
  const sessionDefs = [
    { name: "LONDON", openHour: 7, preSessionHours: 7, windowMinutes: 90 },
    { name: "NEW_YORK", openHour: 13, preSessionHours: 6, windowMinutes: 90 },
    { name: "TOKYO", openHour: 0, preSessionHours: 3, windowMinutes: 60 }
  ];
  let activeSession = null;
  let minutesSinceOpen = 0;
  for (const sess of sessionDefs) {
    const totalMinutes = hourUTC * 60 + minuteUTC;
    const openMinutes = sess.openHour * 60;
    let diff = totalMinutes - openMinutes;
    if (diff < 0) diff += 1440;
    if (diff >= 0 && diff <= sess.windowMinutes) {
      activeSession = sess;
      minutesSinceOpen = diff;
      break;
    }
  }
  if (!activeSession) {
    return {
      isBreakoutWindow: false,
      session: "NONE",
      minutesSinceOpen: 0,
      preSessionRange: { high: 0, low: 0, range: 0 },
      breakoutDetected: false,
      breakoutDirection: "NONE",
      breakoutStrength: "NONE",
      priceVsRange: "Outside breakout window",
      breakoutDistance: 0,
      volumeConfirmed: false,
      signal: "NEUTRAL"
    };
  }
  const chronological = [...candles].reverse();
  let tfMinutes = 60;
  if (timeframe.includes("M1")) tfMinutes = 1;
  else if (timeframe.includes("M5")) tfMinutes = 5;
  else if (timeframe.includes("M15")) tfMinutes = 15;
  else if (timeframe.includes("M30")) tfMinutes = 30;
  else if (timeframe.includes("H1")) tfMinutes = 60;
  else if (timeframe.includes("H4")) tfMinutes = 240;
  const preSessionCandles = Math.max(4, Math.ceil(activeSession.preSessionHours * 60 / tfMinutes));
  const openCandles = Math.max(1, Math.ceil(minutesSinceOpen / tfMinutes));
  const endIdx = chronological.length;
  const preSessionSlice = chronological.slice(
    Math.max(0, endIdx - openCandles - preSessionCandles),
    Math.max(0, endIdx - openCandles)
  );
  if (preSessionSlice.length < 2) {
    return {
      isBreakoutWindow: true,
      session: activeSession.name,
      minutesSinceOpen,
      preSessionRange: { high: 0, low: 0, range: 0 },
      breakoutDetected: false,
      breakoutDirection: "NONE",
      breakoutStrength: "NONE",
      priceVsRange: "Insufficient pre-session data",
      breakoutDistance: 0,
      volumeConfirmed: false,
      signal: "NEUTRAL"
    };
  }
  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  for (const c of preSessionSlice) {
    if (c.h > rangeHigh) rangeHigh = c.h;
    if (c.l < rangeLow) rangeLow = c.l;
  }
  const range = rangeHigh - rangeLow;
  if (range <= 0) {
    return {
      isBreakoutWindow: true,
      session: activeSession.name,
      minutesSinceOpen,
      preSessionRange: { high: rangeHigh === -Infinity ? 0 : rangeHigh, low: rangeLow === Infinity ? 0 : rangeLow, range: 0 },
      breakoutDetected: false,
      breakoutDirection: "NONE",
      breakoutStrength: "NONE",
      priceVsRange: "Range too narrow for breakout detection",
      breakoutDistance: 0,
      volumeConfirmed: false,
      signal: "NEUTRAL"
    };
  }
  const currentPrice = candles[0].c;
  const breakoutDistance = currentPrice > rangeHigh ? currentPrice - rangeHigh : currentPrice < rangeLow ? rangeLow - currentPrice : 0;
  let breakoutDirection = "NONE";
  let breakoutDetected = false;
  const threshold = range * 0.05;
  if (currentPrice > rangeHigh + threshold) {
    breakoutDirection = "BULLISH";
    breakoutDetected = true;
  } else if (currentPrice < rangeLow - threshold) {
    breakoutDirection = "BEARISH";
    breakoutDetected = true;
  }
  let breakoutStrength = "NONE";
  if (breakoutDetected) {
    const ratio = breakoutDistance / range;
    if (ratio > 0.4) breakoutStrength = "STRONG";
    else if (ratio > 0.15) breakoutStrength = "MODERATE";
    else breakoutStrength = "WEAK";
  }
  let volumeConfirmed = false;
  if (breakoutDetected && candles.length >= 10) {
    const hasVolume = candles.slice(0, 11).some((c) => c.v && c.v > 0);
    if (hasVolume) {
      const avgVol = candles.slice(1, 11).reduce((s, c) => s + (c.v || 0), 0) / 10;
      volumeConfirmed = avgVol > 0 && (candles[0].v || 0) > avgVol * 1.2;
    } else {
      const recentCandles = candles.slice(0, 5);
      const avgBodySize = recentCandles.reduce((s, c) => s + Math.abs(c.c - c.o), 0) / recentCandles.length;
      const currentBodySize = Math.abs(candles[0].c - candles[0].o);
      volumeConfirmed = currentBodySize > avgBodySize * 1.3;
    }
  }
  let approachingBreakout = false;
  let approachingDirection = "NONE";
  if (!breakoutDetected) {
    const upperZone = rangeHigh - range * 0.08;
    const lowerZone = rangeLow + range * 0.08;
    if (currentPrice >= upperZone && currentPrice <= rangeHigh + threshold) {
      approachingBreakout = true;
      approachingDirection = "BULLISH";
    } else if (currentPrice <= lowerZone && currentPrice >= rangeLow - threshold) {
      approachingBreakout = true;
      approachingDirection = "BEARISH";
    }
  }
  const rangePosition = range > 0 ? (currentPrice - rangeLow) / range * 100 : 50;
  let priceVsRange;
  if (currentPrice > rangeHigh) priceVsRange = `Price ABOVE range high by ${breakoutDistance.toFixed(5)}`;
  else if (currentPrice < rangeLow) priceVsRange = `Price BELOW range low by ${breakoutDistance.toFixed(5)}`;
  else if (approachingBreakout) priceVsRange = `Price APPROACHING ${approachingDirection} breakout (${rangePosition.toFixed(0)}% in range)`;
  else priceVsRange = `Price INSIDE range (${rangePosition.toFixed(0)}% from low)`;
  let signal = "NEUTRAL";
  if (breakoutDetected && breakoutStrength !== "NONE") {
    signal = breakoutDirection === "BULLISH" ? "BUY" : "SELL";
  }
  return {
    isBreakoutWindow: true,
    session: activeSession.name,
    minutesSinceOpen,
    preSessionRange: {
      high: Math.round(rangeHigh * 1e5) / 1e5,
      low: Math.round(rangeLow * 1e5) / 1e5,
      range: Math.round(range * 1e5) / 1e5
    },
    breakoutDetected,
    breakoutDirection,
    breakoutStrength,
    priceVsRange,
    breakoutDistance: Math.round(breakoutDistance * 1e5) / 1e5,
    volumeConfirmed,
    signal,
    approachingBreakout,
    approachingDirection,
    rangePosition: Math.round(rangePosition * 100) / 100
  };
}
function computeKeltnerChannels(candles, emaPeriod = 20, atrPeriod = 10, multiplier = 2) {
  if (candles.length < emaPeriod + 2) return void 0;
  const chronological = [...candles].reverse();
  const k = 2 / (emaPeriod + 1);
  let ema = chronological.slice(0, emaPeriod).reduce((s, c) => s + c.c, 0) / emaPeriod;
  for (let i = emaPeriod; i < chronological.length; i++) {
    ema = chronological[i].c * k + ema * (1 - k);
  }
  const trValues = [];
  for (let i = 1; i < chronological.length; i++) {
    const h = chronological[i].h, l = chronological[i].l, pc = chronological[i - 1].c;
    trValues.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const atrSlice = trValues.slice(-atrPeriod);
  const atr = atrSlice.length > 0 ? atrSlice.reduce((s, v) => s + v, 0) / atrSlice.length : 0;
  if (atr === 0) return void 0;
  const upper = ema + multiplier * atr;
  const lower = ema - multiplier * atr;
  const currentPrice = chronological[chronological.length - 1].c;
  const bandwidth = (upper - lower) / ema * 100;
  const prevBandwidths = [];
  let prevEma = chronological.slice(0, emaPeriod).reduce((s, c) => s + c.c, 0) / emaPeriod;
  for (let i = emaPeriod; i < chronological.length - 5; i++) {
    prevEma = chronological[i].c * k + prevEma * (1 - k);
    const tr = trValues[i - 1] ?? atr;
    const bw = (prevEma + multiplier * tr - (prevEma - multiplier * tr)) / prevEma * 100;
    prevBandwidths.push(bw);
  }
  const avgPrevBW = prevBandwidths.length > 0 ? prevBandwidths.slice(-10).reduce((s, v) => s + v, 0) / Math.min(10, prevBandwidths.length) : bandwidth;
  let squeeze = false;
  if (candles.length >= 20) {
    const bbPeriod = 20;
    const recentCloses = chronological.slice(-bbPeriod).map((c) => c.c);
    const bbMid = recentCloses.reduce((s, v) => s + v, 0) / bbPeriod;
    const std = Math.sqrt(recentCloses.reduce((s, v) => s + (v - bbMid) ** 2, 0) / bbPeriod);
    const bbUpper = bbMid + 2 * std;
    const bbLower = bbMid - 2 * std;
    squeeze = bbUpper < upper && bbLower > lower;
  }
  const nearBand = atr * 0.3;
  let position;
  if (currentPrice > upper) position = "ABOVE_UPPER";
  else if (currentPrice >= upper - nearBand) position = "NEAR_UPPER";
  else if (currentPrice <= lower) position = "BELOW_LOWER";
  else if (currentPrice <= lower + nearBand) position = "NEAR_LOWER";
  else position = "INSIDE";
  let volatilityPhase;
  if (squeeze) volatilityPhase = "SQUEEZE";
  else if (bandwidth > avgPrevBW * 1.1) volatilityPhase = "EXPANSION";
  else if (bandwidth < avgPrevBW * 0.9) volatilityPhase = "CONTRACTION";
  else volatilityPhase = "EXPANSION";
  let signal = "NEUTRAL";
  let note = "";
  if (position === "ABOVE_UPPER") {
    signal = "BUY";
    note = squeeze ? "Post-squeeze BULLISH BREAKOUT \u2014 strongest signal" : "Bullish KC breakout \u2014 momentum up";
  } else if (position === "BELOW_LOWER") {
    signal = "SELL";
    note = squeeze ? "Post-squeeze BEARISH BREAKDOWN \u2014 strongest signal" : "Bearish KC breakdown \u2014 momentum down";
  } else if (position === "NEAR_UPPER" && volatilityPhase === "EXPANSION") {
    signal = "BUY";
    note = "Approaching KC upper \u2014 bullish momentum building";
  } else if (position === "NEAR_LOWER" && volatilityPhase === "EXPANSION") {
    signal = "SELL";
    note = "Approaching KC lower \u2014 bearish pressure building";
  } else if (squeeze) {
    signal = "NEUTRAL";
    note = "Keltner SQUEEZE \u2014 volatility compressed, major move imminent, wait for direction";
  } else if (position === "INSIDE" && volatilityPhase === "CONTRACTION") {
    signal = "NEUTRAL";
    note = "Price inside KC, bandwidth contracting \u2014 ranging market, lower signal quality";
  } else {
    note = `Price inside Keltner (${position}), ${volatilityPhase.toLowerCase()} phase`;
  }
  return {
    upper: Math.round(upper * 1e5) / 1e5,
    middle: Math.round(ema * 1e5) / 1e5,
    lower: Math.round(lower * 1e5) / 1e5,
    bandwidth: Math.round(bandwidth * 100) / 100,
    position,
    squeeze,
    volatilityPhase,
    signal,
    note
  };
}
function computeCVD(candles) {
  if (candles.length < 5) return void 0;
  const chronological = [...candles].reverse();
  const deltas = [];
  for (const c of chronological) {
    const vol = c.v || 0;
    const range = c.h - c.l;
    if (range <= 0 || vol === 0) {
      deltas.push(0);
      continue;
    }
    const buyVol = vol * (c.c - c.l) / range;
    const sellVol = vol * (c.h - c.c) / range;
    deltas.push(buyVol - sellVol);
  }
  const cumulativeDelta = deltas.reduce((s, d) => s + d, 0);
  const deltaPerBar = deltas[deltas.length - 1] ?? 0;
  const last5 = deltas.slice(-5);
  const cvd5 = last5.reduce((s, d) => s + d, 0);
  const cvd5Start = deltas.slice(-10, -5).reduce((s, d) => s + d, 0);
  const cvdTrend = cvd5 > cvd5Start * 1.1 ? "RISING" : cvd5 < cvd5Start * 0.9 ? "FALLING" : "FLAT";
  const priceChange = chronological[chronological.length - 1].c - chronological[Math.max(0, chronological.length - 6)].c;
  let cvdDivergence = "NONE";
  if (priceChange > 0 && cvdTrend === "FALLING") cvdDivergence = "BEARISH";
  if (priceChange < 0 && cvdTrend === "RISING") cvdDivergence = "BULLISH";
  const totalVol = chronological.reduce((s, c) => s + (c.v || 0), 0);
  const deltaRatio = totalVol > 0 ? cumulativeDelta / totalVol : 0;
  const aggressionSide = deltaRatio > 0.1 ? "BUYERS" : deltaRatio < -0.1 ? "SELLERS" : "NEUTRAL";
  const aggressionStrength = Math.abs(deltaRatio) > 0.35 ? "STRONG" : Math.abs(deltaRatio) > 0.15 ? "MODERATE" : "WEAK";
  let signal = "NEUTRAL";
  if (aggressionSide === "BUYERS" && aggressionStrength !== "WEAK" && cvdDivergence !== "BEARISH") signal = "BUY";
  else if (aggressionSide === "SELLERS" && aggressionStrength !== "WEAK" && cvdDivergence !== "BULLISH") signal = "SELL";
  return {
    cumulativeDelta: Math.round(cumulativeDelta),
    deltaPerBar: Math.round(deltaPerBar),
    cvdTrend,
    cvdDivergence,
    aggressionSide,
    aggressionStrength,
    signal
  };
}
function analyzeLocationAggression(vp, cvd, currentPrice) {
  if (!vp || !currentPrice) return void 0;
  const { poc, vah, val } = vp;
  const range = vah - val;
  if (range <= 0) return void 0;
  const fairBand = range * 0.1;
  let location;
  let locationBias;
  let locationDescription;
  if (currentPrice > vah) {
    location = "PREMIUM";
    locationBias = "SELL";
    locationDescription = `Price above VAH (${vah.toFixed(5)}) \u2014 supply zone, sellers in control`;
  } else if (currentPrice > poc + fairBand) {
    location = "HIGH_VALUE";
    locationBias = "SELL";
    locationDescription = `Price in high-value area (above POC ${poc.toFixed(5)}) \u2014 slight sell bias`;
  } else if (Math.abs(currentPrice - poc) <= fairBand) {
    location = "FAIR_VALUE";
    locationBias = "NEUTRAL";
    locationDescription = `Price at POC (${poc.toFixed(5)}) \u2014 equilibrium, no location edge`;
  } else if (currentPrice >= val) {
    location = "LOW_VALUE";
    locationBias = "BUY";
    locationDescription = `Price in low-value area (below POC, above VAL ${val.toFixed(5)}) \u2014 slight buy bias`;
  } else {
    location = "DISCOUNT";
    locationBias = "BUY";
    locationDescription = `Price below VAL (${val.toFixed(5)}) \u2014 demand zone, buyers expected`;
  }
  let aggression = "NEUTRAL";
  if (cvd) {
    if (cvd.aggressionSide === "BUYERS") {
      aggression = cvd.aggressionStrength === "STRONG" ? "STRONG_BUY" : "BUY";
    } else if (cvd.aggressionSide === "SELLERS") {
      aggression = cvd.aggressionStrength === "STRONG" ? "STRONG_SELL" : "SELL";
    }
    if (cvd.cvdDivergence === "BEARISH" && (aggression === "STRONG_BUY" || aggression === "BUY")) {
      aggression = "NEUTRAL";
    }
    if (cvd.cvdDivergence === "BULLISH" && (aggression === "STRONG_SELL" || aggression === "SELL")) {
      aggression = "NEUTRAL";
    }
  }
  const agrBias = aggression === "STRONG_BUY" || aggression === "BUY" ? "BUY" : aggression === "STRONG_SELL" || aggression === "SELL" ? "SELL" : "NEUTRAL";
  let alignment;
  if (locationBias === "NEUTRAL" || agrBias === "NEUTRAL") {
    alignment = "NEUTRAL";
  } else if (locationBias === agrBias) {
    alignment = "ALIGNED";
  } else {
    alignment = "CONFLICTED";
  }
  let confidenceVotes = 0;
  if (alignment === "ALIGNED") {
    const isExtreme = location === "DISCOUNT" || location === "PREMIUM";
    const isStrong = aggression === "STRONG_BUY" || aggression === "STRONG_SELL";
    confidenceVotes = isExtreme && isStrong ? 3 : isExtreme ? 2 : isStrong ? 2 : 1.5;
  } else if (alignment === "CONFLICTED") {
    confidenceVotes = -2;
  }
  const note = `${location} (${locationBias} bias) + ${aggression} CVD \u2192 ${alignment} (${confidenceVotes > 0 ? "+" : ""}${confidenceVotes} votes)`;
  return { location, locationDescription, locationBias, aggression, alignment, confidenceVotes, note };
}
function computeAllAdvancedIndicators(candles, currentATR, symbol, timeframe = "H1") {
  const cvd = computeCVD(candles);
  const vp = calculateVolumeProfile(candles);
  const currentPrice = candles[0]?.c ?? 0;
  const vpForLA = vp?.poc && vp?.vah && vp?.val ? { poc: vp.poc, vah: vp.vah, val: vp.val } : void 0;
  return {
    adx: calculateADX(candles),
    rsi: calculateRSI(candles),
    macd: calculateMACD(candles),
    stochastic: calculateStochastic(candles),
    vwap: calculateVWAP(candles),
    obv: calculateOBV(candles),
    pivotPoints: calculatePivotPoints(candles),
    fibonacci: calculateFibonacci(candles),
    supportResistance: findSupportResistance(candles),
    candlePatterns: detectCandlePatterns(candles),
    swingPoints: findSwingPoints(candles),
    sessionContext: getSessionContext(symbol),
    volatilityContext: calculateVolatilityContext(candles, currentATR),
    volumeProfile: vp,
    keltner: computeKeltnerChannels(candles),
    cvd,
    locationAggression: analyzeLocationAggression(vpForLA, cvd, currentPrice),
    breakoutDetection: detectMarketOpenBreakout(candles, symbol, timeframe)
  };
}
var init_indicators = __esm({
  "server/indicators.ts"() {
    "use strict";
  }
});

// server/services/crypto-brain.ts
function bump(map, key, win) {
  const s = map[key] ??= { trades: 0, wins: 0, winRate: 0 };
  s.trades++;
  if (win) s.wins++;
  s.winRate = Math.round(s.wins / s.trades * 100);
}
function sizeMult(winRate, rr, trades) {
  if (trades < MIN_TRADES) return 1;
  const w = winRate / 100, r = rr > 0 ? rr : 1;
  const kelly = w - (1 - w) / r;
  return Math.max(0.25, Math.min(1.5, 1 + kelly));
}
async function backfillIfEmpty(userId) {
  const { rows } = await pool.query(`SELECT count(*)::int n FROM crypto_brain_outcomes WHERE user_id=$1`, [userId]);
  if (rows[0].n > 0) return;
  const { rows: trades } = await pool.query(
    `SELECT symbol, strategy, direction, realized_pnl, closed_at FROM cryptocom_engine_trades
     WHERE user_id=$1 AND status='closed' AND realized_pnl IS NOT NULL ORDER BY closed_at DESC LIMIT 1000`,
    [userId]
  );
  if (!trades.length) return;
  for (const t of trades) {
    const pnl = Number(t.realized_pnl) || 0;
    const d = t.closed_at ? new Date(t.closed_at) : /* @__PURE__ */ new Date();
    await pool.query(
      `INSERT INTO crypto_brain_outcomes (user_id, symbol, strategy, direction, result, profit_loss, hour_utc, source, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'backfill',$8)`,
      [userId, t.symbol, t.strategy || "unknown", t.direction || "long", pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN", pnl, d.getUTCHours(), d]
    ).catch(() => {
    });
  }
}
async function learnFromCryptoTrades(userId) {
  await backfillIfEmpty(userId).catch(() => {
  });
  const { rows } = await pool.query(
    `SELECT symbol, strategy, direction, result, profit_loss, hour_utc FROM crypto_brain_outcomes
     WHERE user_id=$1 ORDER BY closed_at DESC LIMIT 2000`,
    [userId]
  );
  const symbols = {};
  const winSum = {}, winN = {}, lossSum = {}, lossN = {};
  let totalWins = 0, totalDecided = 0, totalPnl = 0;
  for (const r of rows) {
    const sym = r.symbol || "UNKNOWN";
    const k = symbols[sym] ??= { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0, avgWin: 0, avgLoss: 0, riskReward: 0, byStrategy: {}, byHour: {}, bestStrategy: null, recommendedSizeMultiplier: 1 };
    const pnl = Number(r.profit_loss) || 0;
    const win = r.result === "WIN", loss = r.result === "LOSS";
    k.totalTrades++;
    k.totalPnl += pnl;
    totalPnl += pnl;
    if (win) {
      k.wins++;
      totalWins++;
      winSum[sym] = (winSum[sym] ?? 0) + pnl;
      winN[sym] = (winN[sym] ?? 0) + 1;
    }
    if (loss) {
      k.losses++;
      lossSum[sym] = (lossSum[sym] ?? 0) + Math.abs(pnl);
      lossN[sym] = (lossN[sym] ?? 0) + 1;
    }
    if (win || loss) totalDecided++;
    if (r.strategy) bump(k.byStrategy, r.strategy, win);
    if (r.hour_utc != null) bump(k.byHour, String(r.hour_utc), win);
  }
  for (const [sym, k] of Object.entries(symbols)) {
    const decided = k.wins + k.losses;
    k.winRate = decided ? Math.round(k.wins / decided * 100) : 0;
    k.avgWin = winN[sym] ? winSum[sym] / winN[sym] : 0;
    k.avgLoss = lossN[sym] ? lossSum[sym] / lossN[sym] : 0;
    k.riskReward = k.avgLoss > 0 ? k.avgWin / k.avgLoss : k.avgWin > 0 ? 2 : 1;
    k.recommendedSizeMultiplier = sizeMult(k.winRate, k.riskReward, decided);
    let best = null, bestWr = -1;
    for (const [s, b] of Object.entries(k.byStrategy)) if (b.trades >= 3 && b.winRate > bestWr) {
      best = s;
      bestWr = b.winRate;
    }
    k.bestStrategy = best;
  }
  const insights = [];
  for (const [sym, k] of Object.entries(symbols)) {
    if (k.wins + k.losses >= MIN_TRADES) insights.push(`${sym}: ${k.winRate}% WR over ${k.wins + k.losses} \u2192 sizing \xD7${k.recommendedSizeMultiplier}${k.bestStrategy ? `, best on ${k.bestStrategy}` : ""}.`);
    else insights.push(`${sym}: still learning (${k.wins + k.losses}/${MIN_TRADES}).`);
  }
  const brain = { userId, lastLearned: (/* @__PURE__ */ new Date()).toISOString(), totalTrades: rows.length, overallWinRate: totalDecided ? Math.round(totalWins / totalDecided * 100) : 0, totalPnl: Math.round(totalPnl * 100) / 100, symbolKnowledge: symbols, insights };
  _cache.set(userId, { brain, at: Date.now() });
  return brain;
}
async function getOrRefreshCryptoBrain(userId, force = false) {
  const hit = _cache.get(userId);
  if (!force && hit && Date.now() - hit.at < REFRESH_TTL_MS) return hit.brain;
  return learnFromCryptoTrades(userId);
}
function cryptoBrainSizeMultiplier(userId, symbol) {
  const k = _cache.get(userId)?.brain?.symbolKnowledge[symbol];
  return k ? k.recommendedSizeMultiplier : 1;
}
function cryptoBrainGate(userId, symbol, strategy, hourUtc) {
  const k = _cache.get(userId)?.brain?.symbolKnowledge[symbol];
  if (!k) return { blocked: false, reason: "" };
  const decided = k.wins + k.losses;
  if (decided >= 15 && k.winRate < 35) return { blocked: true, reason: `\u{1F9E0} Crypto brain: ${symbol} ${k.winRate}% WR over ${decided} \u2014 skipping symbol` };
  if (strategy) {
    const st = k.byStrategy[strategy];
    if (st && st.trades >= 8 && st.winRate < 30) return { blocked: true, reason: `\u{1F9E0} Crypto brain: ${symbol}/${strategy} ${st.winRate}% WR over ${st.trades} \u2014 skipping` };
  }
  if (hourUtc != null) {
    const h = k.byHour[String(hourUtc)];
    if (h && h.trades >= 8 && h.winRate < 30) return { blocked: true, reason: `\u{1F9E0} Crypto brain: ${symbol} @ ${hourUtc}:00 UTC ${h.winRate}% WR over ${h.trades} \u2014 skipping this hour` };
  }
  return { blocked: false, reason: "" };
}
async function recordCryptoBrainOutcome(o) {
  try {
    await pool.query(
      `INSERT INTO crypto_brain_outcomes (user_id, symbol, strategy, direction, entry_confidence, return_pct, hour_utc, holding_minutes, exit_reason, result, profit_loss, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'live')`,
      [
        o.userId,
        o.symbol,
        o.strategy || "unknown",
        o.direction,
        o.entryConfidence ?? null,
        o.returnPct ?? null,
        (/* @__PURE__ */ new Date()).getUTCHours(),
        o.holdingMinutes ?? null,
        o.exitReason ?? null,
        o.profitLoss > 0 ? "WIN" : o.profitLoss < 0 ? "LOSS" : "BREAKEVEN",
        o.profitLoss
      ]
    );
    await learnFromCryptoTrades(o.userId);
  } catch (err) {
    console.error("[crypto-brain] recordCryptoBrainOutcome failed (non-fatal):", err?.message ?? err);
  }
}
var MIN_TRADES, REFRESH_TTL_MS, _cache;
var init_crypto_brain = __esm({
  "server/services/crypto-brain.ts"() {
    "use strict";
    init_db();
    MIN_TRADES = 10;
    REFRESH_TTL_MS = 60 * 1e3;
    _cache = /* @__PURE__ */ new Map();
  }
});

// server/services/prop-firm-consistency.ts
function todayUtcDateStr() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
async function recordRealizedPnl(userId, connectionId, connectionType, realizedPnlDelta, tradeDate) {
  if (!isFinite(realizedPnlDelta) || realizedPnlDelta === 0) return;
  const dateStr = tradeDate || todayUtcDateStr();
  try {
    await pool.query(
      `INSERT INTO prop_firm_daily_pnl (user_id, connection_id, connection_type, trade_date, realized_pnl)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (connection_id, connection_type, trade_date)
       DO UPDATE SET realized_pnl = prop_firm_daily_pnl.realized_pnl + $5, updated_at = now()`,
      [userId, connectionId, connectionType, dateStr, realizedPnlDelta]
    );
  } catch (err) {
    console.error("[Consistency] Failed to record daily P&L (non-fatal):", err?.message ?? err);
  }
}
var init_prop_firm_consistency = __esm({
  "server/services/prop-firm-consistency.ts"() {
    "use strict";
    init_db();
  }
});

// server/services/crypto-market-data.ts
var crypto_market_data_exports = {};
__export(crypto_market_data_exports, {
  getAggregatedQuote: () => getAggregatedQuote,
  getAggregatedQuotes: () => getAggregatedQuotes
});
function krakenPair(sym) {
  const s = sym.toUpperCase();
  return (s === "BTC" ? "XBT" : s) + "USD";
}
async function coinbaseSpot(sym) {
  try {
    const r = await fetch(`https://api.coinbase.com/v2/prices/${sym}-USD/spot`, { headers: { "User-Agent": "VEDD/1.0" }, signal: AbortSignal.timeout(6e3) });
    if (!r.ok) return { venue: "coinbase", symbol: sym, price: null, error: `HTTP ${r.status}` };
    const d = await r.json();
    const p = parseFloat(d?.data?.amount);
    return { venue: "coinbase", symbol: sym, price: isFinite(p) ? p : null };
  } catch (e) {
    return { venue: "coinbase", symbol: sym, price: null, error: e.message };
  }
}
async function krakenTicker(sym) {
  try {
    const r = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${krakenPair(sym)}`, { headers: { "User-Agent": "VEDD/1.0" }, signal: AbortSignal.timeout(6e3) });
    if (!r.ok) return { venue: "kraken", symbol: sym, price: null, error: `HTTP ${r.status}` };
    const d = await r.json();
    const first = Object.values(d?.result || {})[0];
    const p = parseFloat(first?.c?.[0]);
    const v = parseFloat(first?.v?.[1]);
    return { venue: "kraken", symbol: sym, price: isFinite(p) ? p : null, volume24h: isFinite(v) ? v : null, error: d?.error?.length ? d.error.join(",") : void 0 };
  } catch (e) {
    return { venue: "kraken", symbol: sym, price: null, error: e.message };
  }
}
async function geminiTicker(sym) {
  try {
    const r = await fetch(`https://api.gemini.com/v1/pubticker/${sym.toLowerCase()}usd`, { headers: { "User-Agent": "VEDD/1.0" }, signal: AbortSignal.timeout(6e3) });
    if (!r.ok) return { venue: "gemini", symbol: sym, price: null, error: `HTTP ${r.status}` };
    const d = await r.json();
    const p = parseFloat(d?.last);
    const v = parseFloat(d?.volume?.[sym.toUpperCase()]);
    return { venue: "gemini", symbol: sym, price: isFinite(p) ? p : null, volume24h: isFinite(v) ? v : null };
  } catch (e) {
    return { venue: "gemini", symbol: sym, price: null, error: e.message };
  }
}
async function cryptocomTicker(sym) {
  try {
    const r = await fetch(`https://api.crypto.com/v2/public/get-ticker?instrument_name=${sym.toUpperCase()}_USDT`, { headers: { "User-Agent": "VEDD/1.0" }, signal: AbortSignal.timeout(6e3) });
    if (!r.ok) return { venue: "cryptocom", symbol: sym, price: null, error: `HTTP ${r.status}` };
    const d = await r.json();
    const t = d?.result?.data;
    const row = Array.isArray(t) ? t[0] : t;
    const p = parseFloat(row?.a ?? row?.k);
    const v = parseFloat(row?.v);
    return { venue: "cryptocom", symbol: sym, price: isFinite(p) ? p : null, volume24h: isFinite(v) ? v : null };
  } catch (e) {
    return { venue: "cryptocom", symbol: sym, price: null, error: e.message };
  }
}
async function getAggregatedQuote(symbol) {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const hit = _cache2.get(sym);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.q;
  const venues = await Promise.all([coinbaseSpot(sym), krakenTicker(sym), geminiTicker(sym), cryptocomTicker(sym)]);
  const priced = venues.filter((v) => typeof v.price === "number" && v.price > 0);
  let best = null;
  let spreadPct = null;
  if (priced.length) {
    const lo = priced.reduce((a, b) => b.price < a.price ? b : a);
    const hi = priced.reduce((a, b) => b.price > a.price ? b : a);
    best = { venue: lo.venue, price: lo.price };
    spreadPct = lo.price > 0 ? Math.round((hi.price - lo.price) / lo.price * 1e4) / 100 : null;
  }
  const q = { symbol: sym, best, spreadPct, venues, fetchedAt: (/* @__PURE__ */ new Date()).toISOString() };
  _cache2.set(sym, { q, ts: Date.now() });
  return q;
}
async function getAggregatedQuotes(symbols) {
  const uniq = Array.from(new Set(symbols.map((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "")))).slice(0, 25);
  return Promise.all(uniq.map(getAggregatedQuote));
}
var TTL_MS, _cache2;
var init_crypto_market_data = __esm({
  "server/services/crypto-market-data.ts"() {
    "use strict";
    TTL_MS = 15e3;
    _cache2 = /* @__PURE__ */ new Map();
  }
});

// server/coinbase.ts
var coinbase_exports = {};
__export(coinbase_exports, {
  CoinbaseService: () => CoinbaseService,
  decryptApiSecret: () => decryptApiSecret,
  encryptApiSecret: () => encryptApiSecret
});
import crypto3 from "crypto";
import jwt from "jsonwebtoken";
function buildJwt(keyName, privateKeyPem, method, path) {
  const uri = `${method} ${API_HOST}${path}`;
  const now = Math.floor(Date.now() / 1e3);
  const payload = { sub: keyName, iss: "cdp", nbf: now, exp: now + 120, uri };
  return jwt.sign(payload, privateKeyPem, {
    algorithm: "ES256",
    header: { kid: keyName, nonce: crypto3.randomBytes(16).toString("hex"), typ: "JWT", alg: "ES256" }
  });
}
var API_HOST, CoinbaseService;
var init_coinbase = __esm({
  "server/coinbase.ts"() {
    "use strict";
    init_cryptocom();
    API_HOST = "api.coinbase.com";
    CoinbaseService = class {
      keyName;
      privateKey;
      constructor(keyName, privateKeyPem) {
        this.keyName = keyName;
        this.privateKey = privateKeyPem.includes("\\n") ? privateKeyPem.replace(/\\n/g, "\n") : privateKeyPem;
      }
      async get(path) {
        const token = buildJwt(this.keyName, this.privateKey, "GET", path);
        const res = await fetch(`https://${API_HOST}${path}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(12e3)
        });
        if (!res.ok) {
          const text2 = await res.text();
          throw new Error(`Coinbase ${res.status}: ${text2.slice(0, 300)}`);
        }
        return res.json();
      }
      async post(path, body) {
        const token = buildJwt(this.keyName, this.privateKey, "POST", path);
        const res = await fetch(`https://${API_HOST}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(12e3)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Coinbase ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
        return data;
      }
      /**
       * Place a spot order (Advanced Trade). Requires "trade" permission on the key.
       *  - product: e.g. 'BTC-USD'
       *  - side: 'BUY' | 'SELL'
       *  - type: 'market' | 'limit'
       *  - quoteSize: USD to spend (market BUY); baseSize: coin amount (SELL / limit)
       *  - limitPrice: required for limit orders
       */
      async placeOrder(o) {
        const clientOrderId = crypto3.randomUUID();
        let order_configuration;
        if (o.type === "market") {
          order_configuration = o.side === "BUY" && o.quoteSize ? { market_market_ioc: { quote_size: String(o.quoteSize) } } : { market_market_ioc: { base_size: String(o.baseSize) } };
        } else {
          if (!o.limitPrice || !o.baseSize) throw new Error("limit orders require baseSize and limitPrice");
          order_configuration = { limit_limit_gtc: { base_size: String(o.baseSize), limit_price: String(o.limitPrice) } };
        }
        const data = await this.post("/api/v3/brokerage/orders", {
          client_order_id: clientOrderId,
          product_id: o.product,
          side: o.side,
          order_configuration
        });
        const success = !!data?.success;
        if (!success) throw new Error(`Coinbase order rejected: ${JSON.stringify(data?.error_response || data).slice(0, 300)}`);
        return { orderId: data?.success_response?.order_id ?? clientOrderId, success, raw: data };
      }
      /** Read-only: list account balances (paginated), valued in USD via public spot. */
      async getBalances() {
        const accounts = [];
        let cursor = "";
        for (let i = 0; i < 10; i++) {
          const path = `/api/v3/brokerage/accounts?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
          const data = await this.get(path);
          for (const a of data?.accounts ?? []) accounts.push(a);
          if (data?.has_next && data?.cursor) cursor = data.cursor;
          else break;
        }
        const balances = [];
        for (const a of accounts) {
          const available = parseFloat(a?.available_balance?.value ?? "0") || 0;
          const hold = parseFloat(a?.hold?.value ?? "0") || 0;
          const total = available + hold;
          if (total <= 0) continue;
          balances.push({ currency: a?.available_balance?.currency ?? a?.currency ?? "?", available, hold, total });
        }
        let totalUsd = 0;
        try {
          const { getAggregatedQuote: getAggregatedQuote2 } = await Promise.resolve().then(() => (init_crypto_market_data(), crypto_market_data_exports));
          for (const b of balances) {
            if (b.currency === "USD" || b.currency === "USDC") {
              b.usdValue = b.total;
              totalUsd += b.total;
              continue;
            }
            const q = await getAggregatedQuote2(b.currency).catch(() => null);
            const px = q?.best?.price ?? null;
            b.usdValue = px != null ? Math.round(b.total * px * 100) / 100 : null;
            if (b.usdValue) totalUsd += b.usdValue;
          }
        } catch {
        }
        balances.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
        return { balances, totalUsd: Math.round(totalUsd * 100) / 100, accountCount: accounts.length };
      }
      /** Lightweight auth check for the "Test connection" button. */
      async test() {
        const data = await this.get("/api/v3/brokerage/accounts?limit=1");
        return { ok: true, accountCount: (data?.accounts ?? []).length };
      }
    };
  }
});

// server/kraken.ts
var kraken_exports = {};
__export(kraken_exports, {
  KrakenService: () => KrakenService,
  decryptApiSecret: () => decryptApiSecret,
  encryptApiSecret: () => encryptApiSecret
});
import crypto4 from "crypto";
function normalizeAsset(code) {
  const c = code.toUpperCase().replace(/\.(S|F|M)$/, "");
  const map = { XXBT: "BTC", XBT: "BTC", XETH: "ETH", XXRP: "XRP", XLTC: "LTC", XXDG: "DOGE", XDG: "DOGE", ZUSD: "USD", ZEUR: "EUR", ZGBP: "GBP", XXLM: "XLM", XETC: "ETC", XZEC: "ZEC" };
  if (map[c]) return map[c];
  if (c.length === 4 && (c[0] === "X" || c[0] === "Z")) return c.slice(1);
  return c;
}
var API_HOST2, KrakenService;
var init_kraken = __esm({
  "server/kraken.ts"() {
    "use strict";
    init_cryptocom();
    API_HOST2 = "https://api.kraken.com";
    KrakenService = class {
      apiKey;
      secret;
      constructor(apiKey, secret) {
        this.apiKey = apiKey;
        this.secret = secret;
      }
      sign(path, nonce, postData) {
        const sha256 = crypto4.createHash("sha256").update(nonce + postData).digest();
        const message = Buffer.concat([Buffer.from(path, "utf8"), sha256]);
        const key = Buffer.from(this.secret, "base64");
        return crypto4.createHmac("sha512", key).update(message).digest("base64");
      }
      async privatePost(endpoint, params = {}) {
        const path = `/0/private/${endpoint}`;
        const nonce = String(Date.now() * 1e3);
        const body = new URLSearchParams({ nonce, ...params });
        const postData = body.toString();
        const res = await fetch(`${API_HOST2}${path}`, {
          method: "POST",
          headers: {
            "API-Key": this.apiKey,
            "API-Sign": this.sign(path, nonce, postData),
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "VEDD/1.0"
          },
          body: postData,
          signal: AbortSignal.timeout(12e3)
        });
        const data = await res.json();
        if (data?.error?.length) throw new Error(`Kraken: ${data.error.join(", ")}`);
        return data?.result ?? {};
      }
      /** Read-only: account balances, valued in USD via the public price layer. */
      async getBalances() {
        const raw = await this.privatePost("Balance");
        const merged = /* @__PURE__ */ new Map();
        for (const [code, valStr] of Object.entries(raw)) {
          const amt = parseFloat(String(valStr));
          if (!isFinite(amt) || amt <= 0) continue;
          const cur = normalizeAsset(code);
          merged.set(cur, (merged.get(cur) ?? 0) + amt);
        }
        const balances = Array.from(merged, ([currency, total]) => ({ currency, total }));
        let totalUsd = 0;
        try {
          const { getAggregatedQuote: getAggregatedQuote2 } = await Promise.resolve().then(() => (init_crypto_market_data(), crypto_market_data_exports));
          for (const b of balances) {
            if (b.currency === "USD" || b.currency === "USDC" || b.currency === "USDT") {
              b.usdValue = b.total;
              totalUsd += b.total;
              continue;
            }
            const q = await getAggregatedQuote2(b.currency).catch(() => null);
            const px = q?.best?.price ?? null;
            b.usdValue = px != null ? Math.round(b.total * px * 100) / 100 : null;
            if (b.usdValue) totalUsd += b.usdValue;
          }
        } catch {
        }
        balances.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
        return { balances, totalUsd: Math.round(totalUsd * 100) / 100 };
      }
      /**
       * Place an order. Requires "Create & modify orders" permission on the key.
       *  - pair: Kraken pair, e.g. 'XBTUSD' (BTC) or 'ETHUSD'
       *  - type: 'buy' | 'sell'
       *  - ordertype: 'market' | 'limit'
       *  - volume: base amount (in the traded coin)
       *  - price: required for limit orders
       */
      async placeOrder(o) {
        const params = { pair: o.pair, type: o.type, ordertype: o.ordertype, volume: String(o.volume) };
        if (o.ordertype === "limit") {
          if (!o.price) throw new Error("limit orders require a price");
          params.price = String(o.price);
        }
        const res = await this.privatePost("AddOrder", params);
        return { txids: res?.txid ?? [], descr: res?.descr?.order ?? "", raw: res };
      }
      async test() {
        const raw = await this.privatePost("Balance");
        return { ok: true, assetCount: Object.keys(raw).length };
      }
    };
  }
});

// server/gemini.ts
var gemini_exports = {};
__export(gemini_exports, {
  GeminiService: () => GeminiService,
  decryptApiSecret: () => decryptApiSecret,
  encryptApiSecret: () => encryptApiSecret
});
import crypto5 from "crypto";
var API_HOST3, GeminiService;
var init_gemini = __esm({
  "server/gemini.ts"() {
    "use strict";
    init_cryptocom();
    API_HOST3 = "https://api.gemini.com";
    GeminiService = class {
      apiKey;
      secret;
      constructor(apiKey, secret) {
        this.apiKey = apiKey;
        this.secret = secret;
      }
      async privatePost(endpoint, params = {}) {
        const nonce = Date.now();
        const payload = { request: endpoint, nonce, ...params };
        const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
        const signature = crypto5.createHmac("sha384", this.secret).update(b64).digest("hex");
        const res = await fetch(`${API_HOST3}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            "Content-Length": "0",
            "X-GEMINI-APIKEY": this.apiKey,
            "X-GEMINI-PAYLOAD": b64,
            "X-GEMINI-SIGNATURE": signature,
            "Cache-Control": "no-cache",
            "User-Agent": "VEDD/1.0"
          },
          signal: AbortSignal.timeout(12e3)
        });
        const data = await res.json();
        if (!res.ok || data?.result === "error") {
          throw new Error(`Gemini: ${data?.reason || data?.message || res.status}`);
        }
        return data;
      }
      /** Read-only: account balances, valued in USD via the public price layer. */
      async getBalances() {
        const raw = await this.privatePost("/v1/balances");
        const balances = [];
        for (const b of Array.isArray(raw) ? raw : []) {
          const amt = parseFloat(b?.amount ?? "0");
          if (!isFinite(amt) || amt <= 0) continue;
          balances.push({ currency: String(b?.currency ?? "?").toUpperCase(), total: amt });
        }
        let totalUsd = 0;
        try {
          const { getAggregatedQuote: getAggregatedQuote2 } = await Promise.resolve().then(() => (init_crypto_market_data(), crypto_market_data_exports));
          for (const b of balances) {
            if (b.currency === "USD" || b.currency === "USDC" || b.currency === "GUSD" || b.currency === "USDT") {
              b.usdValue = b.total;
              totalUsd += b.total;
              continue;
            }
            const q = await getAggregatedQuote2(b.currency).catch(() => null);
            const px = q?.best?.price ?? null;
            b.usdValue = px != null ? Math.round(b.total * px * 100) / 100 : null;
            if (b.usdValue) totalUsd += b.usdValue;
          }
        } catch {
        }
        balances.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
        return { balances, totalUsd: Math.round(totalUsd * 100) / 100 };
      }
      /**
       * Place an order. Requires "Trading" scope on the key. Gemini's API is
       * limit-only ("exchange limit"); a market-style fill is an immediate-or-cancel
       * limit at an aggressive price. Caller supplies the limit price either way.
       *  - symbol: e.g. 'btcusd'
       *  - side: 'buy' | 'sell'
       *  - amount: base amount (coin)
       *  - price: limit price (required by Gemini)
       *  - immediateOrCancel: true = market-like (fills now or cancels the rest)
       */
      async placeOrder(o) {
        if (!o.price) throw new Error("Gemini requires a limit price (its API is limit-only)");
        const params = {
          symbol: o.symbol.toLowerCase(),
          amount: String(o.amount),
          price: String(o.price),
          side: o.side,
          type: "exchange limit"
        };
        if (o.immediateOrCancel) params.options = ["immediate-or-cancel"];
        const data = await this.privatePost("/v1/order/new", params);
        return { orderId: String(data?.order_id ?? ""), executedAmount: parseFloat(data?.executed_amount ?? "0") || 0, isLive: !!data?.is_live, raw: data };
      }
      async test() {
        const raw = await this.privatePost("/v1/balances");
        return { ok: true, assetCount: Array.isArray(raw) ? raw.length : 0 };
      }
    };
  }
});

// server/services/cefi-executor.ts
function baseCoin(symbol) {
  return symbol.toUpperCase().replace(/[-_]/g, "").replace(/PERP$/, "").replace(/(USDT|USDC|USD)$/, "") || symbol.toUpperCase();
}
function venueSymbol(venue, base) {
  if (venue === "coinbase") return `${base}-USD`;
  if (venue === "kraken") return `${base === "BTC" ? "XBT" : base}USD`;
  return `${base.toLowerCase()}usd`;
}
async function serviceFor(userId, venue) {
  const table = `${venue}_connections`;
  const keyCol = venue === "coinbase" ? "api_key_name" : "api_key";
  const { rows } = await pool.query(`SELECT ${keyCol} AS k, encrypted_api_secret AS s FROM ${table} WHERE user_id=$1 AND is_active=true ORDER BY id LIMIT 1`, [userId]);
  if (!rows.length) return null;
  if (venue === "coinbase") {
    const { CoinbaseService: CoinbaseService2, decryptApiSecret: decryptApiSecret3 } = await Promise.resolve().then(() => (init_coinbase(), coinbase_exports));
    return new CoinbaseService2(rows[0].k, decryptApiSecret3(rows[0].s));
  }
  if (venue === "kraken") {
    const { KrakenService: KrakenService2, decryptApiSecret: decryptApiSecret3 } = await Promise.resolve().then(() => (init_kraken(), kraken_exports));
    return new KrakenService2(rows[0].k, decryptApiSecret3(rows[0].s));
  }
  const { GeminiService: GeminiService2, decryptApiSecret: decryptApiSecret2 } = await Promise.resolve().then(() => (init_gemini(), gemini_exports));
  return new GeminiService2(rows[0].k, decryptApiSecret2(rows[0].s));
}
async function cefiEntryBuy(userId, venue, base, notionalUsd) {
  const sym = venueSymbol(venue, base);
  const svc = await serviceFor(userId, venue);
  if (!svc) return { ok: false, venue, venueSymbol: sym, qtyBase: 0, entryPrice: 0, orderId: "", reason: `no active ${venue} connection` };
  const q = await getAggregatedQuote(base).catch(() => null);
  const price = q?.best?.price ?? 0;
  if (!price) return { ok: false, venue, venueSymbol: sym, qtyBase: 0, entryPrice: 0, orderId: "", reason: `no live price for ${base}` };
  const qtyBase = Math.max(0, Math.round(notionalUsd / price * 1e6) / 1e6);
  if (qtyBase <= 0) return { ok: false, venue, venueSymbol: sym, qtyBase: 0, entryPrice: price, orderId: "", reason: "size rounds to 0" };
  let orderId = "";
  if (venue === "coinbase") {
    const r = await svc.placeOrder({ product: sym, side: "BUY", type: "market", quoteSize: Math.round(notionalUsd * 100) / 100 });
    orderId = r.orderId;
  } else if (venue === "kraken") {
    const r = await svc.placeOrder({ pair: sym, type: "buy", ordertype: "market", volume: qtyBase });
    orderId = (r.txids || [])[0] || "";
  } else {
    const r = await svc.placeOrder({ symbol: sym, side: "buy", amount: qtyBase, price: Math.round(price * 1.01 * 100) / 100, immediateOrCancel: true });
    orderId = r.orderId;
  }
  return { ok: true, venue, venueSymbol: sym, qtyBase, entryPrice: price, orderId };
}
async function cefiExitSell(userId, venue, base, qtyBase) {
  const sym = venueSymbol(venue, base);
  const svc = await serviceFor(userId, venue);
  if (!svc) return { ok: false, exitPrice: 0, orderId: "", reason: `no active ${venue} connection` };
  const q = await getAggregatedQuote(base).catch(() => null);
  const price = q?.best?.price ?? 0;
  let orderId = "";
  if (venue === "coinbase") {
    const r = await svc.placeOrder({ product: sym, side: "SELL", type: "market", baseSize: qtyBase });
    orderId = r.orderId;
  } else if (venue === "kraken") {
    const r = await svc.placeOrder({ pair: sym, type: "sell", ordertype: "market", volume: qtyBase });
    orderId = (r.txids || [])[0] || "";
  } else {
    const r = await svc.placeOrder({ symbol: sym, side: "sell", amount: qtyBase, price: price ? Math.round(price * 0.99 * 100) / 100 : 0.01, immediateOrCancel: true });
    orderId = r.orderId;
  }
  return { ok: true, exitPrice: price, orderId };
}
var init_cefi_executor = __esm({
  "server/services/cefi-executor.ts"() {
    "use strict";
    init_db();
    init_crypto_market_data();
  }
});

// server/services/defi-swap.ts
import { ethers } from "ethers";
function isDefiSwapAvailable() {
  return !!process.env.ZEROX_API_KEY;
}
async function loadTokenIndex() {
  if (tokenIndexCache && Date.now() - tokenIndexLoadedAt < 6 * 36e5) return tokenIndexCache;
  try {
    const res = await fetch(TOKEN_LIST_URL, { signal: AbortSignal.timeout(1e4) });
    const data = await res.json();
    const idx = /* @__PURE__ */ new Map();
    for (const t of data?.tokens ?? []) {
      if (t?.chainId && t?.symbol && t?.address) idx.set(`${t.chainId}:${String(t.symbol).toUpperCase()}`, t.address);
    }
    if (idx.size > 0) {
      tokenIndexCache = idx;
      tokenIndexLoadedAt = Date.now();
    }
    return tokenIndexCache ?? idx;
  } catch {
    return tokenIndexCache ?? /* @__PURE__ */ new Map();
  }
}
async function resolveToken(chainKey, token) {
  const c = DEFI_CHAINS[chainKey];
  const t = token.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(t)) return t;
  const up = t.toUpperCase();
  if (up === c.native || up === "ETH" || up === "NATIVE" || up === "POL" || up === "MATIC") return NATIVE_PSEUDO;
  if (up === "USDC") return c.usdc;
  if (up === "WETH") return c.weth;
  const idx = await loadTokenIndex();
  const candidates = SYMBOL_ALIASES[up] ?? [up];
  for (const sym of candidates) {
    const addr = idx.get(`${c.chainId}:${sym}`);
    if (addr) return addr;
  }
  throw new Error(`Token "${token}" isn't listed on ${chainKey} \u2014 it may not exist on this chain. Use a 0x address, or pick a token that trades on ${chainKey}.`);
}
async function isTokenTradeable(chainKey, token) {
  try {
    await resolveToken(chainKey, token);
    return true;
  } catch {
    return false;
  }
}
async function zeroXQuote(chainId, params) {
  const qs = new URLSearchParams({ chainId: String(chainId), ...params });
  const res = await fetch(`https://api.0x.org/swap/allowance-holder/quote?${qs.toString()}`, {
    headers: { "0x-api-key": process.env.ZEROX_API_KEY || "", "0x-version": "v2" },
    signal: AbortSignal.timeout(15e3)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`0x ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
async function executeDefiSwap(opts) {
  if (!isDefiSwapAvailable()) return { ok: false, reason: "ZEROX_API_KEY not set on the server" };
  const chain = DEFI_CHAINS[opts.chainKey];
  if (!chain) return { ok: false, reason: `unsupported chain ${opts.chainKey}` };
  const provider = new ethers.JsonRpcProvider(chain.rpc, chain.chainId);
  try {
    const wallet = new ethers.Wallet(decryptApiSecret(opts.encryptedPrivateKey), provider);
    let sellToken, buyToken;
    try {
      sellToken = await resolveToken(opts.chainKey, opts.sellToken);
      buyToken = await resolveToken(opts.chainKey, opts.buyToken);
    } catch (e) {
      return { ok: false, reason: e?.message || "token resolution failed" };
    }
    let decimals = 18;
    if (sellToken !== NATIVE_PSEUDO) {
      const erc = new ethers.Contract(sellToken, ERC20_ABI, provider);
      decimals = Number(await erc.decimals());
    }
    const sellAmount = ethers.parseUnits(String(opts.sellAmountHuman), decimals).toString();
    const quote = await zeroXQuote(chain.chainId, {
      sellToken,
      buyToken,
      sellAmount,
      taker: wallet.address,
      slippageBps: String(opts.slippageBps)
    });
    if (!quote?.liquidityAvailable && quote?.liquidityAvailable !== void 0) {
      return { ok: false, reason: "no liquidity for this pair/size" };
    }
    let approveTxHash;
    const spender = quote?.issues?.allowance?.spender || quote?.allowanceTarget;
    if (sellToken !== NATIVE_PSEUDO && spender) {
      const erc = new ethers.Contract(sellToken, ERC20_ABI, wallet);
      const current = await erc.allowance(wallet.address, spender);
      if (current < BigInt(sellAmount)) {
        const aTx = await erc.approve(spender, ethers.MaxUint256);
        approveTxHash = aTx.hash;
        return { ok: false, approveTxHash, reason: `One-time token approval submitted (tx ${aTx.hash.slice(0, 10)}\u2026). Wait ~20s for it to confirm, then run the swap again \u2014 this only happens once per token.` };
      }
    }
    let buyAmountHuman;
    if (quote.buyAmount) {
      try {
        let bDec = 18;
        if (buyToken !== NATIVE_PSEUDO) bDec = Number(await new ethers.Contract(buyToken, ERC20_ABI, provider).decimals());
        buyAmountHuman = Number(ethers.formatUnits(BigInt(quote.buyAmount), bDec));
      } catch {
      }
    }
    const t = quote.transaction;
    if (!t?.to || !t?.data) return { ok: false, reason: "quote returned no transaction" };
    const txResp = await wallet.sendTransaction({
      to: t.to,
      data: t.data,
      value: t.value ? BigInt(t.value) : BigInt(0),
      ...t.gas ? { gasLimit: BigInt(Math.ceil(Number(t.gas) * 1.2)) } : {}
    });
    try {
      await Promise.race([txResp.wait(), new Promise((r) => setTimeout(r, 8e3))]);
    } catch {
    }
    return { ok: true, txHash: txResp.hash, approveTxHash, buyAmount: quote.buyAmount, buyAmountHuman };
  } finally {
    try {
      provider.destroy();
    } catch {
    }
  }
}
var DEFI_CHAINS, NATIVE_PSEUDO, ERC20_ABI, tokenIndexCache, tokenIndexLoadedAt, TOKEN_LIST_URL, SYMBOL_ALIASES;
var init_defi_swap = __esm({
  "server/services/defi-swap.ts"() {
    "use strict";
    init_cryptocom();
    DEFI_CHAINS = {
      ethereum: { chainId: 1, rpc: "https://ethereum-rpc.publicnode.com", name: "Ethereum", native: "ETH", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
      base: { chainId: 8453, rpc: "https://base-rpc.publicnode.com", name: "Base", native: "ETH", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", weth: "0x4200000000000000000000000000000000000006" },
      arbitrum: { chainId: 42161, rpc: "https://arbitrum-one-rpc.publicnode.com", name: "Arbitrum", native: "ETH", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" },
      optimism: { chainId: 10, rpc: "https://optimism-rpc.publicnode.com", name: "Optimism", native: "ETH", usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", weth: "0x4200000000000000000000000000000000000006" },
      polygon: { chainId: 137, rpc: "https://polygon-bor-rpc.publicnode.com", name: "Polygon", native: "POL", usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", weth: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" }
    };
    NATIVE_PSEUDO = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    ERC20_ABI = ["function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)"];
    tokenIndexCache = null;
    tokenIndexLoadedAt = 0;
    TOKEN_LIST_URL = "https://tokens.uniswap.org";
    SYMBOL_ALIASES = {
      ETH: ["WETH"],
      WETH: ["WETH"],
      BTC: ["WBTC", "CBBTC", "BTCB"],
      WBTC: ["WBTC", "CBBTC"],
      MATIC: ["WMATIC", "POL"],
      POL: ["POL", "WMATIC"]
    };
  }
});

// server/services/defi-executor.ts
var defi_executor_exports = {};
__export(defi_executor_exports, {
  defiEntryBuy: () => defiEntryBuy,
  defiExitSell: () => defiExitSell,
  defiTokenAvailable: () => defiTokenAvailable
});
async function defiTokenAvailable(chainKey, symbol) {
  return isTokenTradeable(chainKey, baseCoin(symbol));
}
async function loadHotWallet(userId) {
  const { rows } = await pool.query(
    `SELECT encrypted_private_key AS k, chain FROM defi_hot_wallets WHERE user_id=$1 AND is_active=true ORDER BY id LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  return { encryptedKey: rows[0].k, chain: rows[0].chain || "base" };
}
async function defiEntryBuy(userId, chainKey, base, notionalUsd, slippageBps) {
  const token = baseCoin(base);
  const chain = chainKey || "base";
  if (!await isTokenTradeable(chain, token)) {
    return { ok: false, token, qtyBase: 0, entryPrice: 0, reason: `DeFi venue can't trade ${token} on ${chain} \u2014 not on the chain's token list (try a token that exists on ${chain}, or a different chain)` };
  }
  const hw = await loadHotWallet(userId);
  if (!hw) return { ok: false, token, qtyBase: 0, entryPrice: 0, reason: "no active DeFi hot wallet connected" };
  const q = await getAggregatedQuote(token).catch(() => null);
  const price = q?.best?.price ?? 0;
  if (!price) return { ok: false, token, qtyBase: 0, entryPrice: 0, reason: `no live price for ${token}` };
  const r = await executeDefiSwap({
    encryptedPrivateKey: hw.encryptedKey,
    chainKey: chain,
    sellToken: "USDC",
    buyToken: token,
    sellAmountHuman: notionalUsd,
    slippageBps
  });
  if (!r.ok) return { ok: false, token, qtyBase: 0, entryPrice: price, reason: r.reason };
  let qtyBase = notionalUsd / price;
  if (r.buyAmountHuman && Number.isFinite(r.buyAmountHuman) && r.buyAmountHuman > 0) qtyBase = r.buyAmountHuman;
  qtyBase = Math.max(0, Math.round(qtyBase * 1e8) / 1e8);
  return { ok: true, token, qtyBase, entryPrice: price, txHash: r.txHash };
}
async function defiExitSell(userId, chainKey, base, qtyBase, slippageBps) {
  const token = baseCoin(base);
  const hw = await loadHotWallet(userId);
  if (!hw) return { ok: false, exitPrice: 0, reason: "no active DeFi hot wallet connected" };
  const q = await getAggregatedQuote(baseCoin(base)).catch(() => null);
  const price = q?.best?.price ?? 0;
  const r = await executeDefiSwap({
    encryptedPrivateKey: hw.encryptedKey,
    chainKey: chainKey || hw.chain,
    sellToken: token,
    buyToken: "USDC",
    sellAmountHuman: qtyBase,
    slippageBps
  });
  if (!r.ok) return { ok: false, exitPrice: price, reason: r.reason };
  return { ok: true, exitPrice: price, txHash: r.txHash };
}
var init_defi_executor = __esm({
  "server/services/defi-executor.ts"() {
    "use strict";
    init_db();
    init_crypto_market_data();
    init_defi_swap();
    init_cefi_executor();
  }
});

// server/services/github-strategy-context.ts
import https from "https";
function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}
function setCached(key, data) {
  cache.set(key, { data, ts: Date.now() });
}
function classifySymbol(symbol) {
  const s = symbol.toUpperCase();
  if (s.includes("XAU") || s.includes("GOLD")) return "GOLD";
  if (s.includes("BTC") || s.includes("ETH") || s.includes("SOL") || s.includes("BNB") || s.includes("ADA") || s.includes("USDT")) return "CRYPTO";
  if (s.includes("NAS") || s.includes("SPX") || s.includes("US30") || s.includes("SPY") || s.includes("GER") || s.includes("UK100") || s.includes("NKY") || s.includes("DAX") || s.includes("FTSE")) return "INDICES";
  return "FOREX";
}
function fetchGitHubRaw(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "VEDD-Trading-AI/1.0" },
      timeout: 5e3
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}
function parseFreqtradeParams(code) {
  const params = {};
  const rsiLow = code.match(/rsi.*?(\d+).*?oversold|buy.*?rsi.*?<\s*(\d+)/i);
  const rsiHigh = code.match(/rsi.*?(\d+).*?overbought|sell.*?rsi.*?>\s*(\d+)/i);
  const adxMin = code.match(/adx.*?>\s*(\d+)/i);
  if (rsiLow) params.rsiOversold = parseInt(rsiLow[1] || rsiLow[2]);
  if (rsiHigh) params.rsiOverbought = parseInt(rsiHigh[1] || rsiHigh[2]);
  if (adxMin) params.minADX = parseInt(adxMin[1]);
  return params;
}
async function getStrategyContext(symbol) {
  const assetClass = classifySymbol(symbol);
  const cacheKey = `strategy_${assetClass}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const baseRules = { ...ASSET_DEFAULTS[assetClass] };
  let externalParams = {};
  let sourceNote = `Embedded validated defaults (${assetClass})`;
  try {
    if (assetClass === "FOREX" || assetClass === "CRYPTO") {
      const code = await fetchGitHubRaw(GITHUB_SOURCES.freqtrade_rsi);
      const parsed = parseFreqtradeParams(code);
      if (parsed.rsiOversold && parsed.rsiOversold > 10 && parsed.rsiOversold < 50) {
        externalParams = parsed;
        sourceNote = "freqtrade/freqtrade-strategies (berlinguyinca) + embedded defaults";
      }
    }
  } catch (_e) {
  }
  const result = {
    assetClass,
    symbol,
    rules: baseRules,
    externalParams,
    sourceNote,
    fetchedAt: Date.now()
  };
  setCached(cacheKey, result);
  return result;
}
function formatStrategyContextForPrompt(ctx) {
  const r = ctx.rules;
  const ext = ctx.externalParams || {};
  const rsiOB = ext.rsiOverbought || r.rsiOverbought;
  const rsiOS = ext.rsiOversold || r.rsiOversold;
  const adx = ext.minADX || r.minADX;
  const lines = [
    ``,
    `\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 VALIDATED STRATEGY REFERENCE (${ctx.assetClass}) \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`,
    `Source: ${ctx.sourceNote}`,
    ``,
    `ASSET-SPECIFIC THRESHOLDS FOR ${ctx.symbol}:`,
    `  RSI Overbought: ${rsiOB} | RSI Oversold: ${rsiOS}`,
    `  Minimum ADX to trade: ${adx} (below = ranging/choppy, do NOT enter trend trades)`,
    `  Recommended ATR multiplier for SL: ${r.atrMultiplierSL}x`,
    `  Minimum acceptable R:R: ${r.minRR}:1`,
    `  Minimum confluence score to confirm: ${r.minConfluence}/12`,
    ``,
    `SESSION NOTES: ${r.sessionNotes}`,
    ``,
    `CONFLUENCE RULES (must satisfy majority for CONFIRM):`,
    ...r.confluenceRules.map((rule, i) => `  ${i + 1}. ${rule}`),
    ``,
    `REJECTION TRIGGERS (any one = strong reason to REJECT):`,
    ...r.rejectRules.map((rule, i) => `  ${i + 1}. ${rule}`),
    ``,
    `OVERRIDE INSTRUCTION: Apply these ${ctx.assetClass}-specific thresholds INSTEAD OF generic`,
    `RSI 70/30 rules. ${ctx.symbol} has its own volatility profile \u2014 the above thresholds are`,
    `calibrated from backtested community strategies for this asset class.`,
    `\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`
  ];
  return lines.join("\n");
}
var CACHE_TTL_MS, cache, ASSET_DEFAULTS, GITHUB_SOURCES;
var init_github_strategy_context = __esm({
  "server/services/github-strategy-context.ts"() {
    "use strict";
    CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
    cache = /* @__PURE__ */ new Map();
    ASSET_DEFAULTS = {
      GOLD: {
        rsiOverbought: 75,
        rsiOversold: 25,
        minADX: 25,
        atrMultiplierSL: 2,
        minRR: 1.8,
        minConfluence: 6,
        sessionNotes: "Gold is most volatile during London open (3-5 AM EST) and NY open (9:30-11 AM EST). Avoid Asian session entries unless breakout confirmed. Tuesday/Wednesday see highest volume.",
        confluenceRules: [
          "XAUUSD requires 3+ timeframe agreement \u2014 M15+H1+H4 all must align before entry",
          "RSI divergence on H1/H4 is STRONG signal for Gold reversals \u2014 weight heavily",
          "Gold respects round numbers ($10 increments) as key S/R \u2014 check if SL/TP aligns",
          "FVG + Order Block confluence required for high-probability Gold entries",
          "News (Fed, CPI, NFP, geopolitical) moves Gold 200-800 pips \u2014 block 30 min before/after",
          "ATR on Gold averages 150-300 pips on H1 \u2014 SL < 100 pips is likely too tight",
          "Volume spike before entry = institutional footprint \u2014 confirms direction"
        ],
        rejectRules: [
          "RSI > 80 for BUY or RSI < 20 for SELL \u2014 extreme exhaustion, fade not follow",
          "ADX < 20 with no breakout catalyst \u2014 choppy Gold loses money fast",
          "Entry against weekly structure \u2014 Gold respects weekly S/R strongly",
          "CPI/NFP within 2 hours \u2014 Gold can spike 500+ pips on these events"
        ]
      },
      FOREX: {
        rsiOverbought: 70,
        rsiOversold: 30,
        minADX: 20,
        atrMultiplierSL: 1.5,
        minRR: 1.5,
        minConfluence: 5,
        sessionNotes: "Forex is most liquid during London (3-12 PM GMT) and NY overlap (8 AM-12 PM EST). Best R:R setups form during London open. Avoid NY close and Asian dead zone for most pairs.",
        confluenceRules: [
          "EURUSD/GBPUSD: require at least H1 structure + M15 entry signal alignment",
          "ICT macro windows (2:33-3:00, 4:03-4:30, 8:50-9:10, 9:50-10:10 NY) = highest probability entries",
          "GBPUSD has wider ATR than EURUSD \u2014 use 1.8x ATR for SL on GBP pairs",
          "Correlation check: EURUSD and GBPUSD should agree on direction (both BUY or both SELL)",
          "USDJPY inversely correlates with US indices \u2014 check SPX direction for JPY bias",
          "OTE zone (61.8\u201379% Fibonacci retracement) entries are highest probability ICT setups",
          "Session open range breakout with volume = institutional order flow \u2014 confirm direction"
        ],
        rejectRules: [
          "Counter-trend trade with ADX < 25 \u2014 ranging market, direction unclear",
          "High-impact news within 15 minutes \u2014 spreads widen, fills unreliable",
          "Price at weekly/monthly S/R against signal direction \u2014 wall too strong",
          "MACD histogram diverging from price for 5+ candles \u2014 momentum failing"
        ]
      },
      CRYPTO: {
        rsiOverbought: 75,
        rsiOversold: 25,
        minADX: 22,
        atrMultiplierSL: 2.5,
        minRR: 2,
        minConfluence: 6,
        sessionNotes: "Crypto trades 24/7 but volume peaks during NY session (9 AM-5 PM EST) and Asian evening (6 PM-midnight EST). Weekend volume drops 40% \u2014 wider spreads, avoid large entries Sat/Sun.",
        confluenceRules: [
          "BTC leads the market \u2014 check BTC direction before trading altcoins",
          "Crypto ATR is 3-5x Forex \u2014 use wider stops, minimum 2.5x ATR for SL",
          "RSI divergence on 4H/daily timeframe is most reliable crypto reversal signal",
          "Volume is king for crypto \u2014 a breakout without volume spike is 70% likely to fail",
          "Bitcoin dominance rising = sell altcoins; BTC dominance falling = altcoins outperform",
          "Round numbers ($50k, $100k for BTC; $3000, $5000 for ETH) act as powerful magnets",
          "Funding rate extremes (>0.1% or <-0.1%) signal potential reversal \u2014 counter-trend warning"
        ],
        rejectRules: [
          "BTC making lower highs while altcoin makes new high \u2014 divergence, reject altcoin BUY",
          "Weekend entry with low volume \u2014 high manipulation risk, spreads wide",
          "RSI > 80 on daily \u2014 crypto tops form here, avoid new BUY entries",
          "Exchange outflow spike (large wallets moving to cold storage) \u2014 distribution signal"
        ]
      },
      INDICES: {
        rsiOverbought: 72,
        rsiOversold: 28,
        minADX: 22,
        atrMultiplierSL: 1.8,
        minRR: 1.5,
        minConfluence: 5,
        sessionNotes: "US indices (NAS100, US30, SP500) peak volume at NY open (9:30-11 AM EST) and last hour (3-4 PM EST). Pre-market moves 8-9:30 AM often set the day direction. Avoid lunch (12-2 PM EST).",
        confluenceRules: [
          "NAS100 is tech-heavy \u2014 Fed rate news and tech earnings move it 200-500 points",
          "VIX above 25 = fear, indices likely falling \u2014 avoid BUY entries when VIX spiking",
          "Opening range breakout (first 15-30 minutes) sets daily bias \u2014 high probability direction",
          "US indices respect 50-day and 200-day SMA as major S/R on daily chart",
          "SPX leads \u2014 check SPX direction before trading NAS100 or US30",
          "Gaps at market open often fill within same session \u2014 factor into TP placement",
          "FOMC meeting days and days after = extreme volatility, reduce position size by 50%"
        ],
        rejectRules: [
          "VIX > 30 for BUY entries \u2014 extreme fear, strong downside momentum",
          "Counter-trend trade against daily 200 SMA without major catalyst",
          "Entry during lunch session (12-2 PM EST) \u2014 low volume, choppy, poor fills",
          "Economic surprise data (GDP, jobs) within 30 minutes \u2014 high gap risk"
        ]
      }
    };
    GITHUB_SOURCES = {
      // freqtrade community strategies — RSI/MACD thresholds used in profitable strategies
      freqtrade_rsi: "https://raw.githubusercontent.com/freqtrade/freqtrade-strategies/master/user_data/strategies/berlinguyinca/ReinforcedQuickie.py",
      // Jesse AI strategy docs — ATR/momentum rules
      jesse_readme: "https://raw.githubusercontent.com/jesse-ai/jesse/master/README.md"
    };
  }
});

// server/services/confirmation-learning.ts
import { eq as eq2, and as and2, gte as gte2, sql as sql2, inArray as inArray2 } from "drizzle-orm";
async function getWinningStrategyPatterns(userId) {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1e3);
    const rows = await db.select().from(aiConfirmationOutcomes).where(
      and2(
        eq2(aiConfirmationOutcomes.userId, userId),
        gte2(aiConfirmationOutcomes.confirmedAt, ninetyDaysAgo),
        inArray2(aiConfirmationOutcomes.tradeOutcome, ["WIN", "LOSS", "BREAKEVEN"])
      )
    ).limit(300);
    const groups = {};
    for (const row of rows) {
      const key = `${row.symbol}|${row.tradeSource ?? "ai_confirmation"}|${row.confluenceGrade ?? "N/A"}|${row.session ?? "Unknown"}`;
      if (!groups[key]) groups[key] = { wins: 0, total: 0, pips: 0, symbol: row.symbol, source: row.tradeSource ?? "ai_confirmation", grade: row.confluenceGrade ?? "N/A", session: row.session ?? "Unknown" };
      groups[key].total++;
      if (row.tradeOutcome === "WIN") groups[key].wins++;
      if (row.actualPips) groups[key].pips += row.actualPips;
    }
    const patterns = Object.values(groups).filter((g) => g.total >= 3 && g.wins / g.total >= 0.6).sort((a, b) => b.wins / b.total - a.wins / a.total).slice(0, 5);
    if (patterns.length === 0) return "No significant winning patterns identified yet (need 3+ trades per pattern).";
    return patterns.map((p) => {
      const wr = Math.round(p.wins / p.total * 100);
      const ap = Math.round(p.pips / p.total);
      return `\u2022 ${p.symbol} Grade ${p.grade} during ${p.session} (${p.source}): ${wr}% win rate across ${p.total} trades, avg ${ap} pips`;
    }).join("\n");
  } catch (err) {
    return "Pattern analysis unavailable.";
  }
}
var LEARNING_CACHE_TTL;
var init_confirmation_learning = __esm({
  "server/services/confirmation-learning.ts"() {
    "use strict";
    init_db();
    init_schema();
    LEARNING_CACHE_TTL = 60 * 60 * 1e3;
  }
});

// server/services/profit-split.ts
var profit_split_exports = {};
__export(profit_split_exports, {
  DEFAULT_SPLIT_PCT: () => DEFAULT_SPLIT_PCT,
  enrollProfitSplit: () => enrollProfitSplit,
  getProfitSplitStatus: () => getProfitSplitStatus,
  isProfitSplitEnrolled: () => isProfitSplitEnrolled,
  listProfitSplitEnrollments: () => listProfitSplitEnrollments,
  recordProfitSplitPayment: () => recordProfitSplitPayment,
  unenrollProfitSplit: () => unenrollProfitSplit
});
async function isProfitSplitEnrolled(userId) {
  const hit = _enrolledCache.get(userId);
  if (hit && Date.now() - hit.at < ENROLL_TTL_MS) return hit.v;
  let v = false;
  try {
    const r = await pool.query(
      `SELECT 1 FROM profit_split_enrollments WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [userId]
    );
    v = (r.rowCount ?? 0) > 0;
  } catch {
  }
  _enrolledCache.set(userId, { v, at: Date.now() });
  return v;
}
function _invalidate(userId) {
  _enrolledCache.delete(userId);
}
async function _propFirmRealized(userId) {
  const conns = await pool.query(
    `SELECT id FROM tradelocker_connections WHERE user_id = $1 AND is_prop_firm_account = true`,
    [userId]
  );
  const ids = conns.rows.map((r) => r.id);
  if (!ids.length) return { net: 0, connections: 0 };
  const sum = await pool.query(
    `SELECT COALESCE(SUM(realized_pnl), 0) AS net FROM prop_firm_daily_pnl
       WHERE connection_type = 'tradelocker' AND connection_id = ANY($1::int[])`,
    [ids]
  );
  return { net: Number(sum.rows[0]?.net ?? 0), connections: ids.length };
}
async function getProfitSplitStatus(userId) {
  const enr = await pool.query(
    `SELECT pct, status, enrolled_by, created_at FROM profit_split_enrollments WHERE user_id = $1`,
    [userId]
  );
  const row = enr.rows[0];
  const pct = row ? Number(row.pct) : DEFAULT_SPLIT_PCT;
  const active = !!row && row.status === "active";
  const { net, connections } = await _propFirmRealized(userId);
  const owed = net > 0 ? Math.round(net * (pct / 100) * 100) / 100 : 0;
  let paid = 0;
  try {
    const p = await pool.query(`SELECT COALESCE(SUM(amount), 0) AS paid FROM profit_split_payments WHERE user_id = $1`, [userId]);
    paid = Number(p.rows[0]?.paid ?? 0);
  } catch {
  }
  return {
    enrolled: active,
    pct,
    status: row?.status ?? null,
    enrolledBy: row?.enrolled_by ?? null,
    propFirmConnections: connections,
    netProfit: Math.round(net * 100) / 100,
    owed,
    paid: Math.round(paid * 100) / 100,
    balance: Math.round((owed - paid) * 100) / 100,
    startedAt: row?.created_at ? new Date(row.created_at).toISOString() : null
  };
}
async function enrollProfitSplit(userId, enrolledBy, pct = DEFAULT_SPLIT_PCT) {
  await pool.query(
    `INSERT INTO profit_split_enrollments (user_id, pct, status, enrolled_by, updated_at)
       VALUES ($1, $2, 'active', $3, now())
     ON CONFLICT (user_id) DO UPDATE
       SET status = 'active', pct = EXCLUDED.pct, enrolled_by = EXCLUDED.enrolled_by, updated_at = now()`,
    [userId, pct, enrolledBy]
  );
  _invalidate(userId);
}
async function unenrollProfitSplit(userId) {
  await pool.query(
    `UPDATE profit_split_enrollments SET status = 'ended', updated_at = now() WHERE user_id = $1`,
    [userId]
  );
  _invalidate(userId);
}
async function recordProfitSplitPayment(userId, amount, note) {
  await pool.query(
    `INSERT INTO profit_split_payments (user_id, amount, note) VALUES ($1, $2, $3)`,
    [userId, amount, note ?? null]
  );
}
async function listProfitSplitEnrollments() {
  const enr = await pool.query(
    `SELECT e.user_id, u.username FROM profit_split_enrollments e
       LEFT JOIN users u ON u.id = e.user_id
      WHERE e.status = 'active' ORDER BY e.created_at DESC`
  );
  const out = [];
  for (const r of enr.rows) {
    const s = await getProfitSplitStatus(r.user_id);
    out.push({ ...s, userId: r.user_id, username: r.username ?? null });
  }
  return out;
}
var DEFAULT_SPLIT_PCT, _enrolledCache, ENROLL_TTL_MS;
var init_profit_split = __esm({
  "server/services/profit-split.ts"() {
    "use strict";
    init_db();
    DEFAULT_SPLIT_PCT = 30;
    _enrolledCache = /* @__PURE__ */ new Map();
    ENROLL_TTL_MS = 3e4;
  }
});

// server/ai-usage.ts
import { eq as eq3, and as and3, gte as gte3, sql as sql3 } from "drizzle-orm";
function estimateCostCents(model, promptTokens, completionTokens) {
  if (model.endsWith(":free")) return 0;
  const pricing = MODEL_PRICING_CENTS_PER_1M[model];
  if (!pricing) return 0;
  return promptTokens / 1e6 * pricing.input + completionTokens / 1e6 * pricing.output;
}
async function recordAiUsage(params) {
  try {
    const costCents = estimateCostCents(params.model, params.promptTokens, params.completionTokens);
    await db.insert(aiUsageLog).values({
      userId: params.userId,
      provider: params.provider,
      model: params.model,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      costCents,
      usedPlatformKey: params.usedPlatformKey
    });
  } catch (e) {
    console.error("[AI Usage] Failed to record usage:", e);
  }
}
function monthStart() {
  const now = /* @__PURE__ */ new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
async function getMonthlyPlatformKeyCostCents(userId) {
  try {
    const [row] = await db.select({ total: sql3`coalesce(sum(${aiUsageLog.costCents}), 0)` }).from(aiUsageLog).where(and3(
      eq3(aiUsageLog.userId, userId),
      eq3(aiUsageLog.usedPlatformKey, true),
      gte3(aiUsageLog.createdAt, monthStart())
    ));
    return Number(row?.total || 0);
  } catch (e) {
    console.error("[AI Usage] Failed to sum monthly usage:", e);
    return 0;
  }
}
async function getEffectiveAiCostCapCents(userId) {
  try {
    const [user] = await db.select().from(users).where(eq3(users.id, userId));
    if (!user) return 50;
    const plans = await db.select().from(subscriptionPlans).where(eq3(subscriptionPlans.isActive, true));
    let cap = plans.find((p) => p.name === "Free")?.aiMonthlyCostCapCents ?? 50;
    if (user.subscriptionPlanId) {
      const plan = plans.find((p) => p.id === user.subscriptionPlanId);
      if (plan) cap = Math.max(cap, plan.aiMonthlyCostCapCents);
    }
    const membershipTier = user.membershipTier || "none";
    const TIER_PLAN_MAP = { basic: "Starter", pro: "Premium", elite: "Yearly" };
    const equivalentPlanName = TIER_PLAN_MAP[membershipTier];
    if (equivalentPlanName) {
      const plan = plans.find((p) => p.name === equivalentPlanName);
      if (plan) cap = Math.max(cap, plan.aiMonthlyCostCapCents);
    }
    try {
      const { isProfitSplitEnrolled: isProfitSplitEnrolled2 } = await Promise.resolve().then(() => (init_profit_split(), profit_split_exports));
      if (await isProfitSplitEnrolled2(userId)) {
        const topCap = plans.reduce((m, p) => Math.max(m, p.aiMonthlyCostCapCents ?? 0), cap);
        cap = Math.max(cap, topCap);
      }
    } catch {
    }
    return cap;
  } catch (e) {
    console.error("[AI Usage] Failed to resolve cost cap:", e);
    return 50;
  }
}
async function isUnderPlatformKeyCostCap(userId) {
  const [usedCents, capCents] = await Promise.all([
    getMonthlyPlatformKeyCostCents(userId),
    getEffectiveAiCostCapCents(userId)
  ]);
  return usedCents < capCents;
}
var MODEL_PRICING_CENTS_PER_1M;
var init_ai_usage = __esm({
  "server/ai-usage.ts"() {
    "use strict";
    init_db();
    init_schema();
    MODEL_PRICING_CENTS_PER_1M = {
      "gpt-4o": { input: 250, output: 1e3 },
      "gpt-4o-mini": { input: 15, output: 60 },
      "claude-sonnet-4-6": { input: 300, output: 1500 },
      "claude-haiku-4-5-20251001": { input: 80, output: 400 },
      "gemini-2.0-flash": { input: 10, output: 40 },
      "gemini-1.5-pro-latest": { input: 125, output: 500 },
      "mistral-large-latest": { input: 200, output: 600 },
      "mistral-small-latest": { input: 20, output: 60 },
      "openai/gpt-oss-120b": { input: 5, output: 8 },
      // Groq
      "openai/gpt-oss-20b": { input: 3, output: 5 },
      // Groq (no :free suffix)
      "qwen/qwen3.6-27b": { input: 10, output: 10 },
      // Groq
      "qwen/qwen3-vl-32b-instruct": { input: 10, output: 10 }
      // Groq
    };
  }
});

// server/utils/smcUtils.ts
var smcUtils_exports = {};
__export(smcUtils_exports, {
  classifyLiquidityTargets: () => classifyLiquidityTargets,
  detectBOSCHOCH: () => detectBOSCHOCH,
  detectEqualHighsLows: () => detectEqualHighsLows,
  detectFairValueGap: () => detectFairValueGap,
  detectOrderBlock: () => detectOrderBlock,
  detectWyckoff: () => detectWyckoff
});
function findSwingHighs(candles, lookback = 20) {
  const result = [];
  const limit = Math.min(lookback, candles.length - 2);
  for (let i = 1; i < limit; i++) {
    if (candles[i].h > candles[i - 1].h && candles[i].h > candles[i + 1].h) {
      result.push({ index: i, level: candles[i].h });
    }
  }
  return result;
}
function findSwingLows(candles, lookback = 20) {
  const result = [];
  const limit = Math.min(lookback, candles.length - 2);
  for (let i = 1; i < limit; i++) {
    if (candles[i].l < candles[i - 1].l && candles[i].l < candles[i + 1].l) {
      result.push({ index: i, level: candles[i].l });
    }
  }
  return result;
}
function detectBOSCHOCH(candles, signal) {
  const none = { detected: false, type: null, direction: null, level: null, candlesAgo: null, description: "No clear BOS or CHOCH detected in recent structure" };
  if (!candles || candles.length < 10) return none;
  const swingHighs = findSwingHighs(candles, 25);
  const swingLows = findSwingLows(candles, 25);
  const currentClose = candles[0].c;
  const brokeHigh = swingHighs.find((sh) => currentClose > sh.level && sh.index >= 2);
  if (brokeHigh) {
    const priorHighs = swingHighs.filter((sh) => sh.index > brokeHigh.index);
    const priorLows = swingLows.filter((sl) => sl.index > brokeHigh.index);
    const priorTrendBearish = priorHighs.length >= 2 && priorHighs[0].level < priorHighs[priorHighs.length - 1].level && priorLows.length >= 1;
    const type = priorTrendBearish ? "CHOCH" : "BOS";
    return {
      detected: true,
      type,
      direction: "BULLISH",
      level: brokeHigh.level,
      candlesAgo: brokeHigh.index,
      description: `${type} BULLISH \u2014 price broke above swing high at ${brokeHigh.level.toFixed(5)} (${brokeHigh.index} candles ago)${type === "CHOCH" ? ", reversing prior bearish structure" : ", continuing bullish momentum"}`
    };
  }
  const brokeLow = swingLows.find((sl) => currentClose < sl.level && sl.index >= 2);
  if (brokeLow) {
    const priorHighs = swingHighs.filter((sh) => sh.index > brokeLow.index);
    const priorLows = swingLows.filter((sl) => sl.index > brokeLow.index);
    const priorTrendBullish = priorLows.length >= 2 && priorLows[0].level > priorLows[priorLows.length - 1].level && priorHighs.length >= 1;
    const type = priorTrendBullish ? "CHOCH" : "BOS";
    return {
      detected: true,
      type,
      direction: "BEARISH",
      level: brokeLow.level,
      candlesAgo: brokeLow.index,
      description: `${type} BEARISH \u2014 price broke below swing low at ${brokeLow.level.toFixed(5)} (${brokeLow.index} candles ago)${type === "CHOCH" ? ", reversing prior bullish structure" : ", continuing bearish momentum"}`
    };
  }
  return none;
}
function detectFairValueGap(candles, signal) {
  const none = { detected: false, direction: null, top: null, bottom: null, inZone: false, candlesAgo: null, description: "No active Fair Value Gap detected" };
  if (!candles || candles.length < 6) return none;
  const currentClose = candles[0].c;
  const lookback = Math.min(15, candles.length - 2);
  for (let i = lookback - 1; i >= 1; i--) {
    const newer = candles[i - 1];
    const mid = candles[i];
    const older = candles[i + 1];
    if (older.h < newer.l) {
      const top = newer.l;
      const bottom = older.h;
      const midpoint = (top + bottom) / 2;
      const inZone = currentClose >= bottom && currentClose <= top;
      const aligns = signal === "BUY";
      if (!aligns) continue;
      return {
        detected: true,
        direction: "BULLISH",
        top,
        bottom,
        inZone,
        candlesAgo: i,
        description: `Bullish FVG at ${bottom.toFixed(5)}\u2013${top.toFixed(5)} (${i} candles ago)${inZone ? " \u2014 price INSIDE zone, potential support" : ` \u2014 price ${currentClose > top ? "above" : "below"} zone`}`
      };
    }
    if (older.l > newer.h) {
      const top = older.l;
      const bottom = newer.h;
      const inZone = currentClose >= bottom && currentClose <= top;
      const aligns = signal === "SELL";
      if (!aligns) continue;
      return {
        detected: true,
        direction: "BEARISH",
        top,
        bottom,
        inZone,
        candlesAgo: i,
        description: `Bearish FVG at ${bottom.toFixed(5)}\u2013${top.toFixed(5)} (${i} candles ago)${inZone ? " \u2014 price INSIDE zone, potential resistance" : ` \u2014 price ${currentClose < bottom ? "below" : "above"} zone`}`
      };
    }
  }
  return none;
}
function countOBMitigations(candles, obBottom, obTop, obIndex, isBullish) {
  let count = 0;
  for (let k = obIndex - 1; k >= 1; k--) {
    const c = candles[k];
    if (!c) continue;
    if (isBullish) {
      const low = c.l || c.low || Infinity;
      if (low >= obBottom && low <= obTop) count++;
    } else {
      const high = c.h || c.high || 0;
      if (high >= obBottom && high <= obTop) count++;
    }
  }
  return count;
}
function getMitigation(count) {
  if (count === 0) return "FRESH";
  if (count === 1) return "PARTIALLY_MITIGATED";
  return "FULLY_MITIGATED";
}
function detectOrderBlock(candles, signal) {
  const none = { detected: false, type: null, top: null, bottom: null, aligns: false, mitigation: null, mitigationCount: 0, description: "No significant order block detected" };
  if (!candles || candles.length < 6) return none;
  const currentClose = candles[0].c;
  const lookback = Math.min(20, candles.length - 2);
  for (let i = 2; i < lookback; i++) {
    const obCandle = candles[i];
    const impulse = candles[i - 1];
    const obBody = Math.abs(obCandle.c - obCandle.o);
    const impulseBody = Math.abs(impulse.c - impulse.o);
    if (obBody === 0 || impulseBody < obBody * 1.5) continue;
    if (obCandle.c < obCandle.o && impulse.c > impulse.o) {
      const obTop = obCandle.o;
      const obBottom = obCandle.l;
      const inZone = currentClose >= obBottom && currentClose <= obTop;
      const breached = currentClose < obBottom;
      const mitCount = countOBMitigations(candles, obBottom, obTop, i, true);
      const mitStatus = getMitigation(mitCount);
      if (breached) {
        if (signal !== "SELL") continue;
        return {
          detected: true,
          type: "BREAKER",
          top: obTop,
          bottom: obBottom,
          aligns: true,
          mitigation: mitStatus,
          mitigationCount: mitCount,
          description: `Bearish breaker at ${obBottom.toFixed(5)}\u2013${obTop.toFixed(5)} \u2014 bullish OB was breached, now acting as resistance (${i} candles ago) | Mitigation: ${mitStatus} (${mitCount} test${mitCount !== 1 ? "s" : ""})`
        };
      }
      if (signal !== "BUY") continue;
      return {
        detected: true,
        type: "BULLISH_OB",
        top: obTop,
        bottom: obBottom,
        aligns: true,
        mitigation: mitStatus,
        mitigationCount: mitCount,
        description: `${mitStatus} Bullish OB at ${obBottom.toFixed(5)}\u2013${obTop.toFixed(5)} (${i} candles ago)${inZone ? " \u2014 price retesting OB zone" : ""} | ${mitStatus === "FRESH" ? "Never tested \u2014 maximum institutional interest" : mitStatus === "PARTIALLY_MITIGATED" ? "Tested once \u2014 still valid but partially consumed" : "Fully consumed \u2014 weak OB, avoid using as primary entry reference"}`
      };
    }
    if (obCandle.c > obCandle.o && impulse.c < impulse.o) {
      const obTop = obCandle.h;
      const obBottom = obCandle.o;
      const inZone = currentClose >= obBottom && currentClose <= obTop;
      const breached = currentClose > obTop;
      const mitCount = countOBMitigations(candles, obBottom, obTop, i, false);
      const mitStatus = getMitigation(mitCount);
      if (breached) {
        if (signal !== "BUY") continue;
        return {
          detected: true,
          type: "BREAKER",
          top: obTop,
          bottom: obBottom,
          aligns: true,
          mitigation: mitStatus,
          mitigationCount: mitCount,
          description: `Bullish breaker at ${obBottom.toFixed(5)}\u2013${obTop.toFixed(5)} \u2014 bearish OB was breached, now acting as support (${i} candles ago) | Mitigation: ${mitStatus} (${mitCount} test${mitCount !== 1 ? "s" : ""})`
        };
      }
      if (signal !== "SELL") continue;
      return {
        detected: true,
        type: "BEARISH_OB",
        top: obTop,
        bottom: obBottom,
        aligns: true,
        mitigation: mitStatus,
        mitigationCount: mitCount,
        description: `${mitStatus} Bearish OB at ${obBottom.toFixed(5)}\u2013${obTop.toFixed(5)} (${i} candles ago)${inZone ? " \u2014 price retesting OB zone" : ""} | ${mitStatus === "FRESH" ? "Never tested \u2014 maximum institutional interest" : mitStatus === "PARTIALLY_MITIGATED" ? "Tested once \u2014 still valid but partially consumed" : "Fully consumed \u2014 weak OB, avoid using as primary entry reference"}`
      };
    }
  }
  return none;
}
function detectEqualHighsLows(candles) {
  const swingHighs = findSwingHighs(candles, 30);
  const swingLows = findSwingLows(candles, 30);
  const tolerance = 5e-4;
  let eqHighLevel = null;
  let eqHighCount = 0;
  for (let i = 0; i < swingHighs.length; i++) {
    for (let j = i + 1; j < swingHighs.length; j++) {
      const diff = Math.abs(swingHighs[i].level - swingHighs[j].level) / swingHighs[i].level;
      if (diff <= tolerance) {
        eqHighLevel = (swingHighs[i].level + swingHighs[j].level) / 2;
        eqHighCount++;
        break;
      }
    }
    if (eqHighLevel) break;
  }
  let eqLowLevel = null;
  let eqLowCount = 0;
  for (let i = 0; i < swingLows.length; i++) {
    for (let j = i + 1; j < swingLows.length; j++) {
      const diff = Math.abs(swingLows[i].level - swingLows[j].level) / swingLows[i].level;
      if (diff <= tolerance) {
        eqLowLevel = (swingLows[i].level + swingLows[j].level) / 2;
        eqLowCount++;
        break;
      }
    }
    if (eqLowLevel) break;
  }
  return {
    equalHighs: {
      detected: eqHighLevel !== null,
      level: eqHighLevel,
      count: eqHighCount + (eqHighLevel ? 2 : 0),
      description: eqHighLevel ? `Equal highs at ~${eqHighLevel.toFixed(5)} \u2014 buy-side liquidity pool above, likely target for sell-side to sweep` : "No equal highs detected"
    },
    equalLows: {
      detected: eqLowLevel !== null,
      level: eqLowLevel,
      count: eqLowCount + (eqLowLevel ? 2 : 0),
      description: eqLowLevel ? `Equal lows at ~${eqLowLevel.toFixed(5)} \u2014 sell-side liquidity pool below, likely target for buy-side to sweep` : "No equal lows detected"
    }
  };
}
function detectWyckoff(candles) {
  const none = { detected: false, phase: null, stage: null, aligns: false, description: "No clear Wyckoff phase detected" };
  if (!candles || candles.length < 15) return none;
  const lookback = Math.min(20, candles.length);
  const rangeCandles = candles.slice(0, lookback);
  const highs = rangeCandles.map((c) => c.h);
  const lows = rangeCandles.map((c) => c.l);
  const closes = rangeCandles.map((c) => c.c);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangeSize = rangeHigh - rangeLow;
  if (rangeSize === 0) return none;
  const avgPrice = (rangeHigh + rangeLow) / 2;
  const rangePercent = rangeSize / avgPrice;
  const recentCloses = closes.slice(0, 8);
  const midpoint = (rangeHigh + rangeLow) / 2;
  const aboveMid = recentCloses.filter((c) => c > midpoint).length;
  const risingCandles = recentCloses.filter((c, i) => i > 0 && c > recentCloses[i - 1]).length;
  if (aboveMid >= 6 && risingCandles >= 5) {
    return { detected: true, phase: "MARKUP", stage: null, aligns: true, description: "Wyckoff MARKUP \u2014 price in sustained uptrend above range midpoint, bullish momentum confirmed" };
  }
  const belowMid = recentCloses.filter((c) => c < midpoint).length;
  const fallingCandles = recentCloses.filter((c, i) => i > 0 && c < recentCloses[i - 1]).length;
  if (belowMid >= 6 && fallingCandles >= 5) {
    return { detected: true, phase: "MARKDOWN", stage: null, aligns: true, description: "Wyckoff MARKDOWN \u2014 price in sustained downtrend below range midpoint, bearish momentum confirmed" };
  }
  if (rangePercent < 5e-3 && lookback >= 10) {
    const spring = candles.slice(0, 8).find((c, i) => c.l < rangeLow && c.c > rangeLow);
    if (spring) {
      return {
        detected: true,
        phase: "ACCUMULATION",
        stage: "SPRING",
        aligns: true,
        description: `Wyckoff ACCUMULATION Spring \u2014 price swept below range low (${rangeLow.toFixed(5)}) then closed back inside; institutional buy signal`
      };
    }
    const upthrust = candles.slice(0, 8).find((c, i) => c.h > rangeHigh && c.c < rangeHigh);
    if (upthrust) {
      return {
        detected: true,
        phase: "DISTRIBUTION",
        stage: "UPTHRUST",
        aligns: true,
        description: `Wyckoff DISTRIBUTION Upthrust \u2014 price swept above range high (${rangeHigh.toFixed(5)}) then closed back inside; institutional sell signal`
      };
    }
    const latestClose = closes[0];
    if (latestClose > midpoint + rangeSize * 0.3) {
      return {
        detected: true,
        phase: "ACCUMULATION",
        stage: "SOS",
        aligns: true,
        description: `Wyckoff Sign of Strength (SOS) \u2014 price pushing into upper range, accumulation nearing markup phase`
      };
    }
    if (latestClose < midpoint - rangeSize * 0.3) {
      return {
        detected: true,
        phase: "DISTRIBUTION",
        stage: "SOW",
        aligns: true,
        description: `Wyckoff Sign of Weakness (SOW) \u2014 price dropping into lower range, distribution nearing markdown phase`
      };
    }
  }
  return none;
}
function classifyLiquidityTargets(candles, signal, bosCHOCH) {
  const none = {
    internalTarget: { level: null, type: "NONE", description: "No internal liquidity target identified" },
    externalTarget: { level: null, type: "NONE", description: "No external liquidity target identified" },
    priceIsTargetingInternal: false,
    priceIsTargetingExternal: false,
    description: "Insufficient data to classify liquidity targets"
  };
  if (!candles || candles.length < 10) return none;
  const currentPrice = candles[0]?.c || 0;
  const swingHighs = findSwingHighs(candles, 30);
  const swingLows = findSwingLows(candles, 30);
  const boundary = bosCHOCH.level;
  let internalTarget = { level: null, type: "NONE", description: "No internal liquidity target" };
  let externalTarget = { level: null, type: "NONE", description: "No external liquidity target" };
  if (signal === "BUY") {
    const extCandidates = boundary ? swingHighs.filter((s) => s.level > boundary) : swingHighs;
    if (extCandidates.length > 0) {
      const ext = extCandidates.reduce((a, b) => a.level > b.level ? a : b);
      externalTarget = {
        level: ext.level,
        type: "SWING_HIGH (BSL)",
        description: `External BSL (buy-side liquidity) at ${ext.level.toFixed(5)} \u2014 major swing high ${ext.index} candles ago, institutional draw on liquidity above`
      };
    }
    const intCandidates = boundary ? swingHighs.filter((s) => s.level < boundary && s.level > currentPrice) : swingHighs.filter((s) => s.level > currentPrice);
    if (intCandidates.length > 0) {
      const intT = intCandidates.reduce((a, b) => Math.abs(a.level - currentPrice) < Math.abs(b.level - currentPrice) ? a : b);
      internalTarget = {
        level: intT.level,
        type: "INTERNAL_BSL",
        description: `Internal BSL at ${intT.level.toFixed(5)} \u2014 nearest swing high within current range (${intT.index} candles ago), price will likely tap here first before external draw`
      };
    }
  } else {
    const extCandidates = boundary ? swingLows.filter((s) => s.level < boundary) : swingLows;
    if (extCandidates.length > 0) {
      const ext = extCandidates.reduce((a, b) => a.level < b.level ? a : b);
      externalTarget = {
        level: ext.level,
        type: "SWING_LOW (SSL)",
        description: `External SSL (sell-side liquidity) at ${ext.level.toFixed(5)} \u2014 major swing low ${ext.index} candles ago, institutional draw on liquidity below`
      };
    }
    const intCandidates = boundary ? swingLows.filter((s) => s.level > boundary && s.level < currentPrice) : swingLows.filter((s) => s.level < currentPrice);
    if (intCandidates.length > 0) {
      const intT = intCandidates.reduce((a, b) => Math.abs(a.level - currentPrice) < Math.abs(b.level - currentPrice) ? a : b);
      internalTarget = {
        level: intT.level,
        type: "INTERNAL_SSL",
        description: `Internal SSL at ${intT.level.toFixed(5)} \u2014 nearest swing low within current range (${intT.index} candles ago), price will likely tap here first before external draw`
      };
    }
  }
  const intCleared = internalTarget.level !== null && (signal === "BUY" ? currentPrice > internalTarget.level : currentPrice < internalTarget.level);
  const priceIsTargetingExternal = intCleared && externalTarget.level !== null;
  const priceIsTargetingInternal = !intCleared && internalTarget.level !== null;
  const trajDesc = priceIsTargetingExternal ? `EXTERNAL \u2014 internal liquidity already cleared, now targeting ${externalTarget.type} at ${externalTarget.level?.toFixed(5)}` : priceIsTargetingInternal ? `INTERNAL \u2014 price targeting ${internalTarget.type} at ${internalTarget.level?.toFixed(5)} first before external draw` : "UNCLEAR \u2014 no dominant liquidity target identified";
  return {
    internalTarget,
    externalTarget,
    priceIsTargetingInternal,
    priceIsTargetingExternal,
    description: trajDesc
  };
}
var init_smcUtils = __esm({
  "server/utils/smcUtils.ts"() {
    "use strict";
  }
});

// server/utils/ictMacroUtils.ts
var ictMacroUtils_exports = {};
__export(ictMacroUtils_exports, {
  detectAsianRange: () => detectAsianRange,
  detectCRTPattern: () => detectCRTPattern,
  detectKeyReferenceLevels: () => detectKeyReferenceLevels,
  detectOTEZone: () => detectOTEZone,
  detectStopHunt: () => detectStopHunt,
  getICTMacroContext: () => getICTMacroContext,
  getPremiumDiscountContext: () => getPremiumDiscountContext
});
function getNYOffset(date2) {
  const year = date2.getUTCFullYear();
  const dstStart = new Date(Date.UTC(year, 2, 1));
  dstStart.setUTCDate(8 - (dstStart.getUTCDay() + 7) % 7 + 7);
  const dstEnd = new Date(Date.UTC(year, 10, 1));
  dstEnd.setUTCDate(1 + (7 - dstEnd.getUTCDay()) % 7);
  return date2 >= dstStart && date2 < dstEnd ? -4 : -5;
}
function toNYTime(date2) {
  const offset = getNYOffset(date2);
  const nyMs = date2.getTime() + offset * 60 * 60 * 1e3;
  const nyDate = new Date(nyMs);
  const hours = nyDate.getUTCHours();
  const minutes = nyDate.getUTCMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const mm = minutes.toString().padStart(2, "0");
  return { hours, minutes, timeStr: `${h12}:${mm} ${ampm}` };
}
function windowToMinutes(h, m) {
  return h * 60 + m;
}
function deriveSession(hours) {
  if (hours >= 2 && hours < 5) return "LONDON";
  if (hours >= 8 && hours < 12) return "NY_AM";
  if (hours >= 13 && hours < 16) return "NY_PM";
  if (hours >= 17 || hours < 2) return "ASIAN";
  return "OVERNIGHT";
}
function getICTMacroContext(nowUTC) {
  const { hours, minutes, timeStr } = toNYTime(nowUTC);
  const currentTotalMinutes = hours * 60 + minutes;
  const session2 = deriveSession(hours);
  for (const w of MACRO_WINDOWS) {
    const start = windowToMinutes(w.startH, w.startM);
    const end = windowToMinutes(w.endH, w.endM);
    if (currentTotalMinutes >= start && currentTotalMinutes < end) {
      return {
        isInMacroWindow: true,
        macroName: w.name,
        macroType: w.type,
        minutesUntilNextMacro: 0,
        nextMacroName: w.name,
        currentNYTime: timeStr,
        session: session2
      };
    }
  }
  let minWait = Infinity;
  let nextMacro = MACRO_WINDOWS[0];
  for (const w of MACRO_WINDOWS) {
    const start = windowToMinutes(w.startH, w.startM);
    const diff = start > currentTotalMinutes ? start - currentTotalMinutes : 24 * 60 - currentTotalMinutes + start;
    if (diff < minWait) {
      minWait = diff;
      nextMacro = w;
    }
  }
  return {
    isInMacroWindow: false,
    macroName: null,
    macroType: null,
    minutesUntilNextMacro: minWait,
    nextMacroName: nextMacro.name,
    currentNYTime: timeStr,
    session: session2
  };
}
function getPremiumDiscountContext(currentPrice, candles, signal) {
  const recent = candles.slice(0, 20);
  const rangeHigh = Math.max(...recent.map((c) => c.h || c.high || 0));
  const rangeLow = Math.min(...recent.map((c) => c.l || c.low || Infinity));
  const equilibrium = (rangeHigh + rangeLow) / 2;
  const rangeSize = rangeHigh - rangeLow;
  const rawPercentile = rangeSize > 0 ? (currentPrice - rangeLow) / rangeSize * 100 : 50;
  const percentile = Math.max(0, Math.min(100, Math.round(rawPercentile)));
  let zone;
  if (percentile >= 70) zone = "PREMIUM";
  else if (percentile <= 30) zone = "DISCOUNT";
  else zone = "EQUILIBRIUM";
  const aligns = signal === "SELL" && zone === "PREMIUM" || signal === "BUY" && zone === "DISCOUNT";
  const description = `Price at ${percentile}th percentile of 20-candle range (${rangeLow.toFixed(5)}-${rangeHigh.toFixed(5)}), equil ${equilibrium.toFixed(5)} \u2014 ${zone}${aligns ? " (ALIGNS with signal)" : " (CONFLICTS with signal)"}`;
  return { zone, percentile, rangeHigh, rangeLow, equilibrium, aligns, description };
}
function detectStopHunt(candles, signal) {
  if (candles.length < 7) {
    return { detected: false, candlesAgo: null, sweepLevel: null, description: "Not enough candles to detect stop hunt" };
  }
  for (let i = 1; i <= 6; i++) {
    const candle = candles[i];
    if (!candle) continue;
    const prior = candles.slice(i + 1, i + 6);
    if (prior.length < 2) continue;
    if (signal === "BUY") {
      const priorLow = Math.min(...prior.map((c) => c.l || c.low || Infinity));
      const candleLow = candle.l || candle.low || 0;
      const candleClose = candle.c || candle.close || 0;
      if (candleLow < priorLow && candleClose > priorLow) {
        return {
          detected: true,
          candlesAgo: i,
          sweepLevel: priorLow,
          description: `Buy-side liquidity swept: swing low ${priorLow.toFixed(5)} pierced ${i} candle(s) ago, price reclaimed above \u2014 institutional accumulation zone`
        };
      }
    } else if (signal === "SELL") {
      const priorHigh = Math.max(...prior.map((c) => c.h || c.high || 0));
      const candleHigh = candle.h || candle.high || 0;
      const candleClose = candle.c || candle.close || 0;
      if (candleHigh > priorHigh && candleClose < priorHigh) {
        return {
          detected: true,
          candlesAgo: i,
          sweepLevel: priorHigh,
          description: `Sell-side liquidity swept: swing high ${priorHigh.toFixed(5)} exceeded ${i} candle(s) ago, price rejected below \u2014 institutional distribution zone`
        };
      }
    }
  }
  return {
    detected: false,
    candlesAgo: null,
    sweepLevel: null,
    description: `No liquidity sweep detected in last 6 candles \u2014 stop hunt not confirmed`
  };
}
function detectCRTPattern(candles) {
  if (candles.length < 4) {
    return { detected: false, direction: null, stage: null, description: "Not enough candles for CRT detection" };
  }
  const [c0, c1, c2, c3] = candles;
  const getH = (c) => c.h || c.high || 0;
  const getL = (c) => c.l || c.low || Infinity;
  const getC = (c) => c.c || c.close || 0;
  const aH = getH(c3);
  const aL = getL(c3);
  const bH = getH(c2);
  const bL = getL(c2);
  const bC = getC(c2);
  const cH = getH(c1);
  const cL = getL(c1);
  const cC = getC(c1);
  const d0C = getC(c0);
  const bullishManip = bL < aL && bC > aL;
  const bearishManip = bH > aH && bC < aH;
  if (bullishManip) {
    if (cC > aH || d0C > aH) {
      return {
        detected: true,
        direction: "BULLISH",
        stage: "EXPANSION",
        description: `Bullish CRT: candle A range ${aL.toFixed(5)}-${aH.toFixed(5)}, manipulation low ${bL.toFixed(5)} swept below (${Math.abs(candles.indexOf(c2))} candles ago), expansion UP confirmed \u2014 price breaking above range`
      };
    }
    return {
      detected: true,
      direction: "BULLISH",
      stage: "MANIPULATION",
      description: `Bullish CRT in manipulation phase: low ${bL.toFixed(5)} swept A's low (${aL.toFixed(5)}), waiting for expansion UP \u2014 do NOT chase yet`
    };
  }
  if (bearishManip) {
    if (cC < aL || d0C < aL) {
      return {
        detected: true,
        direction: "BEARISH",
        stage: "EXPANSION",
        description: `Bearish CRT: candle A range ${aL.toFixed(5)}-${aH.toFixed(5)}, manipulation high ${bH.toFixed(5)} swept above (${Math.abs(candles.indexOf(c2))} candles ago), expansion DOWN confirmed \u2014 price breaking below range`
      };
    }
    return {
      detected: true,
      direction: "BEARISH",
      stage: "MANIPULATION",
      description: `Bearish CRT in manipulation phase: high ${bH.toFixed(5)} swept A's high (${aH.toFixed(5)}), waiting for expansion DOWN \u2014 fakeout risk if entering now`
    };
  }
  const aRange = aH - aL;
  const bRange = bH - bL;
  const isNarrow = bRange < aRange * 0.6;
  if (isNarrow) {
    return {
      detected: true,
      direction: null,
      stage: "RANGE",
      description: `CRT range candle forming: candle A established ${aL.toFixed(5)}-${aH.toFixed(5)}, watching for manipulation spike next`
    };
  }
  return {
    detected: false,
    direction: null,
    stage: null,
    description: "No CRT pattern detected in recent 4 candles"
  };
}
function detectAsianRange(candles) {
  const none = { high: 0, low: 0, midpoint: 0, detected: false, description: "Asian range not detectable from available candles" };
  if (!candles || candles.length < 10) return none;
  const lookback = Math.min(25, candles.length);
  let bestHigh = 0;
  let bestLow = Infinity;
  let bestRange = Infinity;
  const windowSize = 10;
  for (let start = 0; start + windowSize <= lookback; start++) {
    const slice = candles.slice(start, start + windowSize);
    const sliceHigh = Math.max(...slice.map((c) => c.h || c.high || 0));
    const sliceLow = Math.min(...slice.map((c) => c.l || c.low || Infinity));
    const range = sliceHigh - sliceLow;
    const mid = (sliceHigh + sliceLow) / 2;
    const rangePercent = mid > 0 ? range / mid : 1;
    if (rangePercent < bestRange) {
      bestRange = rangePercent;
      bestHigh = sliceHigh;
      bestLow = sliceLow;
    }
  }
  if (bestRange > 3e-3 || bestLow === Infinity) return none;
  const midpoint = (bestHigh + bestLow) / 2;
  return {
    high: bestHigh,
    low: bestLow,
    midpoint,
    detected: true,
    description: `Asian consolidation range: ${bestLow.toFixed(5)}\u2013${bestHigh.toFixed(5)} (${(bestRange * 100).toFixed(2)}% range) \u2014 midpoint ${midpoint.toFixed(5)}`
  };
}
function detectKeyReferenceLevels(candles) {
  const none = { pdHigh: null, pdLow: null, pwHigh: null, pwLow: null, currentPrice: 0, abovePDH: false, belowPDL: false, description: "Not enough candles for key reference levels" };
  if (!candles || candles.length < 25) return none;
  const currentPrice = candles[0]?.c || candles[0]?.close || 0;
  const pdCandles = candles.slice(24, Math.min(48, candles.length));
  const pwCandles = candles.slice(24, Math.min(168, candles.length));
  const pdHigh = pdCandles.length > 0 ? Math.max(...pdCandles.map((c) => c.h || c.high || 0)) : null;
  const pdLow = pdCandles.length > 0 ? Math.min(...pdCandles.map((c) => c.l || c.low || Infinity)) : null;
  const pwHigh = pwCandles.length > 0 ? Math.max(...pwCandles.map((c) => c.h || c.high || 0)) : null;
  const pwLow = pwCandles.length > 0 ? Math.min(...pwCandles.map((c) => c.l || c.low || Infinity)) : null;
  const safePDLow = pdLow === Infinity ? null : pdLow;
  const safePWLow = pwLow === Infinity ? null : pwLow;
  const abovePDH = pdHigh !== null && currentPrice > pdHigh;
  const belowPDL = safePDLow !== null && currentPrice < safePDLow;
  const lines = [];
  if (pdHigh !== null) lines.push(`PDH: ${pdHigh.toFixed(5)} (price is ${abovePDH ? "ABOVE" : "below"})`);
  if (safePDLow !== null) lines.push(`PDL: ${safePDLow.toFixed(5)} (price is ${belowPDL ? "BELOW" : "above"})`);
  if (pwHigh !== null) lines.push(`PWH: ${pwHigh.toFixed(5)}`);
  if (safePWLow !== null) lines.push(`PWL: ${safePWLow.toFixed(5)}`);
  const posDesc = abovePDH ? "Price trading ABOVE PDH \u2014 potential bearish draw, bulls need strong conviction here" : belowPDL ? "Price trading BELOW PDL \u2014 continuation bearish or bounce incoming" : "Price within PDH/PDL range \u2014 looking for draw on liquidity at these levels";
  return {
    pdHigh,
    pdLow: safePDLow,
    pwHigh,
    pwLow: safePWLow,
    currentPrice,
    abovePDH,
    belowPDL,
    description: `${lines.join(" | ")} \u2192 ${posDesc}`
  };
}
function detectOTEZone(candles, signal) {
  const none = { detected: false, swingHigh: null, swingLow: null, ote618: null, ote705: null, ote79: null, inOTEZone: false, currentPrice: 0, description: "Not enough structure for OTE zone detection" };
  if (!candles || candles.length < 15) return none;
  const currentPrice = candles[0]?.c || candles[0]?.close || 0;
  const lookback = Math.min(30, candles.length - 2);
  let swingHighs = [];
  let swingLows = [];
  for (let i = 1; i < lookback; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const next = candles[i + 1];
    if (!c || !prev || !next) continue;
    if (c.h > prev.h && c.h > next.h) swingHighs.push({ index: i, level: c.h });
    if (c.l < prev.l && c.l < next.l) swingLows.push({ index: i, level: c.l });
  }
  if (swingHighs.length < 1 || swingLows.length < 1) return none;
  let swingHigh = null;
  let swingLow = null;
  if (signal === "BUY") {
    swingLow = Math.min(...swingLows.map((s) => s.level));
    swingHigh = Math.max(...swingHighs.filter((s) => swingLows.some((l) => l.index > s.index)).map((s) => s.level));
    if (!swingHigh) swingHigh = Math.max(...swingHighs.map((s) => s.level));
  } else {
    swingHigh = Math.max(...swingHighs.map((s) => s.level));
    swingLow = Math.min(...swingLows.filter((s) => swingHighs.some((h) => h.index > s.index)).map((s) => s.level));
    if (!swingLow) swingLow = Math.min(...swingLows.map((s) => s.level));
  }
  if (!swingHigh || !swingLow || swingHigh <= swingLow) return none;
  const range = swingHigh - swingLow;
  if (range / ((swingHigh + swingLow) / 2) < 1e-3) return none;
  let ote618, ote705, ote79;
  let inOTEZone;
  if (signal === "BUY") {
    ote618 = swingHigh - range * 0.618;
    ote705 = swingHigh - range * 0.705;
    ote79 = swingHigh - range * 0.79;
    inOTEZone = currentPrice >= ote79 && currentPrice <= ote618;
  } else {
    ote618 = swingLow + range * 0.618;
    ote705 = swingLow + range * 0.705;
    ote79 = swingLow + range * 0.79;
    inOTEZone = currentPrice >= ote618 && currentPrice <= ote79;
  }
  const zoneDesc = inOTEZone ? `\u2705 Price IS in OTE zone (${ote79.toFixed(5)}\u2013${ote618.toFixed(5)}) \u2014 institutional entry sweet spot` : `\u26A0 Price at ${currentPrice.toFixed(5)} NOT in OTE zone (${ote79.toFixed(5)}\u2013${ote618.toFixed(5)}) \u2014 wait for retracement or accept lower-quality entry`;
  return {
    detected: true,
    swingHigh,
    swingLow,
    ote618,
    ote705,
    ote79,
    inOTEZone,
    currentPrice,
    description: `Swing: ${swingLow.toFixed(5)}\u2192${swingHigh.toFixed(5)} | OTE zone: ${ote79.toFixed(5)}\u2013${ote618.toFixed(5)} | 70.5% sweet spot: ${ote705.toFixed(5)} | ${zoneDesc}`
  };
}
var MACRO_WINDOWS;
var init_ictMacroUtils = __esm({
  "server/utils/ictMacroUtils.ts"() {
    "use strict";
    MACRO_WINDOWS = [
      { name: "London Open Macro (3:00-4:00 AM)", type: "LONDON", startH: 3, startM: 0, endH: 4, endM: 0 },
      { name: "London Kill Zone (2:00-5:00 AM)", type: "LONDON", startH: 2, startM: 0, endH: 5, endM: 0 },
      { name: "7:50-8:10 AM Macro", type: "AM", startH: 7, startM: 50, endH: 8, endM: 10 },
      { name: "8:50-9:10 AM Macro", type: "AM", startH: 8, startM: 50, endH: 9, endM: 10 },
      { name: "9:50-10:10 AM Macro", type: "AM", startH: 9, startM: 50, endH: 10, endM: 10 },
      { name: "10:50-11:10 AM Macro", type: "AM", startH: 10, startM: 50, endH: 11, endM: 10 },
      { name: "11:50-12:10 PM Macro", type: "AM", startH: 11, startM: 50, endH: 12, endM: 10 },
      { name: "1:20-1:40 PM Macro", type: "PM", startH: 13, startM: 20, endH: 13, endM: 40 },
      { name: "2:50-3:10 PM Macro", type: "PM", startH: 14, startM: 50, endH: 15, endM: 10 },
      { name: "3:15-3:45 PM Macro", type: "PM", startH: 15, startM: 15, endH: 15, endM: 45 },
      { name: "3:50-4:10 PM Macro", type: "PM", startH: 15, startM: 50, endH: 16, endM: 10 }
    ];
  }
});

// server/utils/breakoutEngine.ts
var breakoutEngine_exports = {};
__export(breakoutEngine_exports, {
  computeBreakoutScore: () => computeBreakoutScore
});
function calcATR(candles, period = 14) {
  if (candles.length < 2) return 0;
  const trs = candles.slice(0, period + 1).map((c, i) => {
    if (i === 0) return c.h - c.l;
    const prev = candles[i - 1];
    return Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c));
  });
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}
function calcVWAP(candles) {
  let cumPV = 0, cumV = 0;
  for (const c of candles) {
    const tp = (c.h + c.l + c.c) / 3;
    const v = c.v || 1;
    cumPV += tp * v;
    cumV += v;
  }
  return cumV > 0 ? cumPV / cumV : 0;
}
function calcBollingerBands(candles, period = 20, mult = 2) {
  if (candles.length < period) return null;
  const closes = candles.slice(0, period).map((c) => c.c);
  const mean = closes.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(closes.map((c) => (c - mean) ** 2).reduce((a, b) => a + b, 0) / period);
  return { upper: mean + mult * stdDev, lower: mean - mult * stdDev, middle: mean, width: 2 * mult * stdDev };
}
function candleDateKey(c) {
  if (!c.t) return null;
  const d = new Date(c.t * 1e3);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function asianRangeBreakout(m15Candles, currentPrice) {
  const name = "Asian Range Breakout (ARB)";
  if (m15Candles.length === 0) {
    return { name, fired: false, direction: "NEUTRAL", reason: "No M15 candles supplied", strength: 0 };
  }
  const refDate = candleDateKey(m15Candles[0]);
  if (!refDate) return { name, fired: false, direction: "NEUTRAL", reason: "No timestamp on candles", strength: 0 };
  const prevDate = new Date(m15Candles[0].t * 1e3);
  prevDate.setUTCDate(prevDate.getUTCDate() - 1);
  const prevDateKey = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}-${String(prevDate.getUTCDate()).padStart(2, "0")}`;
  const asianCandles = m15Candles.filter((c) => {
    if (!c.t) return false;
    const d = new Date(c.t * 1e3);
    const dk = candleDateKey(c);
    const h = d.getUTCHours();
    return (dk === refDate || dk === prevDateKey) && h >= 0 && h < 7;
  });
  if (asianCandles.length < 4) {
    return { name, fired: false, direction: "NEUTRAL", reason: `Only ${asianCandles.length} Asian session candles on ${refDate}/${prevDateKey} (need 4+)`, strength: 0 };
  }
  const high = Math.max(...asianCandles.map((c) => c.h));
  const low = Math.min(...asianCandles.map((c) => c.l));
  const range = high - low;
  if (range === 0) return { name, fired: false, direction: "NEUTRAL", reason: "Zero Asian range", strength: 0 };
  const threshold = range * 0.15;
  const bullish = currentPrice > high + threshold;
  const bearish = currentPrice < low - threshold;
  if (bullish || bearish) {
    const breakPct = Math.round((bullish ? currentPrice - high : low - currentPrice) / range * 100);
    return {
      name,
      fired: true,
      direction: bullish ? "BUY" : "SELL",
      reason: `Price broke Asian ${bullish ? "high" : "low"} by ${breakPct}% of range (H:${high.toFixed(5)} L:${low.toFixed(5)})`,
      strength: Math.min(breakPct / 100, 1)
    };
  }
  return { name, fired: false, direction: "NEUTRAL", reason: `Price within Asian range (${low.toFixed(5)}\u2013${high.toFixed(5)})`, strength: 0 };
}
function openingRangeBreakout(m5Candles, currentPrice) {
  const name = "Opening Range Breakout (ORB)";
  if (m5Candles.length === 0) return { name, fired: false, direction: "NEUTRAL", reason: "No M5 candles", strength: 0 };
  const refDate = candleDateKey(m5Candles[0]);
  if (!refDate) return { name, fired: false, direction: "NEUTRAL", reason: "No timestamp on M5 candles", strength: 0 };
  const sessionFilter = (c, startH, startM, endH, endM) => {
    if (!c.t) return false;
    const d = new Date(c.t * 1e3);
    if (candleDateKey(c) !== refDate) return false;
    const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    return mins >= startH * 60 + startM && mins < endH * 60 + endM;
  };
  const londonCandles = m5Candles.filter((c) => sessionFilter(c, 7, 0, 7, 30));
  const nyCandles = m5Candles.filter((c) => sessionFilter(c, 13, 0, 13, 30));
  const openCandles = londonCandles.length >= 3 ? londonCandles : nyCandles.length >= 3 ? nyCandles : [];
  const session2 = londonCandles.length >= 3 ? "London" : "NY";
  if (openCandles.length < 3) {
    return { name, fired: false, direction: "NEUTRAL", reason: `No ${session2} opening range window on ${refDate}`, strength: 0 };
  }
  const high = Math.max(...openCandles.map((c) => c.h));
  const low = Math.min(...openCandles.map((c) => c.l));
  const range = high - low;
  if (range === 0) return { name, fired: false, direction: "NEUTRAL", reason: "Zero ORB range", strength: 0 };
  const lastCandle = m5Candles[0];
  const bodySize = Math.abs(lastCandle.c - lastCandle.o);
  const bodyVsORBPct = bodySize / range;
  const bullish = lastCandle.c > high && bodyVsORBPct > 0.5;
  const bearish = lastCandle.c < low && bodyVsORBPct > 0.5;
  if (bullish || bearish) {
    return {
      name,
      fired: true,
      direction: bullish ? "BUY" : "SELL",
      reason: `${session2} ORB ${bullish ? "bullish" : "bearish"} breakout \u2014 body is ${Math.round(bodyVsORBPct * 100)}% of opening range`,
      strength: Math.min(bodyVsORBPct, 1)
    };
  }
  return { name, fired: false, direction: "NEUTRAL", reason: `Price inside ${session2} ORB (${low.toFixed(5)}\u2013${high.toFixed(5)}) or weak body vs ORB`, strength: 0 };
}
function donchianBreakout(h1Candles) {
  const name = "Donchian Channel Breakout";
  if (h1Candles.length < 22) {
    return { name, fired: false, direction: "NEUTRAL", reason: "Not enough H1 candles for 20-period Donchian", strength: 0 };
  }
  const lookback = h1Candles.slice(1, 21);
  const channelHigh = Math.max(...lookback.map((c) => c.h));
  const channelLow = Math.min(...lookback.map((c) => c.l));
  const current = h1Candles[0];
  const bullish = current.c > channelHigh;
  const bearish = current.c < channelLow;
  if (bullish || bearish) {
    const breakPips = bullish ? current.c - channelHigh : channelLow - current.c;
    return {
      name,
      fired: true,
      direction: bullish ? "BUY" : "SELL",
      reason: `20-period Donchian ${bullish ? "high" : "low"} broken (channel: ${channelLow.toFixed(5)}\u2013${channelHigh.toFixed(5)})`,
      strength: Math.min(breakPips / (channelHigh - channelLow + 1e-5), 1)
    };
  }
  return { name, fired: false, direction: "NEUTRAL", reason: `Price within Donchian channel (${channelLow.toFixed(5)}\u2013${channelHigh.toFixed(5)})`, strength: 0 };
}
function bollingerSqueeze(h1Candles) {
  const name = "Bollinger Band Squeeze";
  if (h1Candles.length < 55) {
    return { name, fired: false, direction: "NEUTRAL", reason: "Not enough H1 candles for BB squeeze", strength: 0 };
  }
  const currentBB = calcBollingerBands(h1Candles, 20, 2);
  if (!currentBB) return { name, fired: false, direction: "NEUTRAL", reason: "BB calculation failed", strength: 0 };
  const widths = [];
  for (let i = 5; i < 55; i++) {
    const bb = calcBollingerBands(h1Candles.slice(i), 20, 2);
    if (bb) widths.push(bb.width);
  }
  const avgWidth = widths.reduce((a, b) => a + b, 0) / (widths.length || 1);
  const isSqueeze = currentBB.width < avgWidth * 1.5;
  const current = h1Candles[0];
  if (isSqueeze && current.c > currentBB.upper) {
    return { name, fired: true, direction: "BUY", reason: `BB squeeze breakout: price closed above upper band (width ${(currentBB.width / avgWidth * 100).toFixed(0)}% of avg)`, strength: 0.8 };
  }
  if (isSqueeze && current.c < currentBB.lower) {
    return { name, fired: true, direction: "SELL", reason: `BB squeeze breakout: price closed below lower band (width ${(currentBB.width / avgWidth * 100).toFixed(0)}% of avg)`, strength: 0.8 };
  }
  if (!isSqueeze) {
    return { name, fired: false, direction: "NEUTRAL", reason: `No BB squeeze (width ${(currentBB.width / avgWidth * 100).toFixed(0)}% of avg \u2014 need <150%)`, strength: 0 };
  }
  return { name, fired: false, direction: "NEUTRAL", reason: "BB squeeze detected but no breakout yet", strength: 0 };
}
function supplyDemandBreak(h4Candles, currentPrice) {
  const name = "Supply/Demand Zone Break";
  if (h4Candles.length < 20) {
    return { name, fired: false, direction: "NEUTRAL", reason: "Not enough H4 candles for zone detection", strength: 0 };
  }
  let bestDemandZoneTop = 0;
  let bestSupplyZoneBottom = Infinity;
  for (let i = 3; i < Math.min(h4Candles.length - 3, 30); i++) {
    const base = h4Candles.slice(i, i + 3);
    const baseHigh = Math.max(...base.map((c) => c.h));
    const baseLow = Math.min(...base.map((c) => c.l));
    const baseRange = baseHigh - baseLow;
    const before = h4Candles[i + 3];
    const breakout = h4Candles[i - 1];
    if (!before || !breakout) continue;
    const impulse = Math.abs(breakout.c - before.c);
    if (impulse > baseRange * 2) {
      if (breakout.c > before.c) {
        if (baseHigh > bestDemandZoneTop) {
          bestDemandZoneTop = baseHigh;
        }
      } else {
        if (baseLow < bestSupplyZoneBottom) {
          bestSupplyZoneBottom = baseLow;
        }
      }
    }
  }
  if (bestDemandZoneTop > 0 && currentPrice > bestDemandZoneTop) {
    const retest = h4Candles.slice(1, 5).some((c) => c.l <= bestDemandZoneTop && c.c > bestDemandZoneTop);
    if (retest) {
      const breakPct = Math.round((currentPrice - bestDemandZoneTop) / bestDemandZoneTop * 1e4);
      return { name, fired: true, direction: "BUY", reason: `Demand zone broken & retested: ${breakPct}bps above zone (${bestDemandZoneTop.toFixed(5)}) \u2014 institutional demand confirmed`, strength: 0.85 };
    }
    return { name, fired: false, direction: "NEUTRAL", reason: `Demand zone broken (${bestDemandZoneTop.toFixed(5)}) but no retest confirmation yet`, strength: 0 };
  }
  if (bestSupplyZoneBottom < Infinity && currentPrice < bestSupplyZoneBottom) {
    const retest = h4Candles.slice(1, 5).some((c) => c.h >= bestSupplyZoneBottom && c.c < bestSupplyZoneBottom);
    if (retest) {
      const breakPct = Math.round((bestSupplyZoneBottom - currentPrice) / bestSupplyZoneBottom * 1e4);
      return { name, fired: true, direction: "SELL", reason: `Supply zone broken & retested: ${breakPct}bps below zone (${bestSupplyZoneBottom.toFixed(5)}) \u2014 institutional supply confirmed`, strength: 0.85 };
    }
    return { name, fired: false, direction: "NEUTRAL", reason: `Supply zone broken (${bestSupplyZoneBottom.toFixed(5)}) but no retest confirmation yet`, strength: 0 };
  }
  return { name, fired: false, direction: "NEUTRAL", reason: "Price within supply/demand zones \u2014 no confirmed break", strength: 0 };
}
async function ictStructuralBreak(h1Candles, m15Candles, currentPrice) {
  const name = "ICT Structural Break + FVG";
  if (h1Candles.length < 10 || m15Candles.length < 6) {
    return { name, fired: false, direction: "NEUTRAL", reason: "Not enough candles for structural analysis", strength: 0 };
  }
  const { detectBOSCHOCH: detectBOSCHOCH2, detectFairValueGap: detectFairValueGap2 } = await Promise.resolve().then(() => (init_smcUtils(), smcUtils_exports));
  const bullishBOS = detectBOSCHOCH2(h1Candles, "BUY");
  const bearishBOS = detectBOSCHOCH2(h1Candles, "SELL");
  const bullFVG = detectFairValueGap2(m15Candles, "BUY");
  const bearFVG = detectFairValueGap2(m15Candles, "SELL");
  const hasBullishBOS = bullishBOS.detected && bullishBOS.direction === "BULLISH";
  const hasBearishBOS = bearishBOS.detected && bearishBOS.direction === "BEARISH";
  const inBullFVG = bullFVG.detected && bullFVG.direction === "BULLISH" && bullFVG.inZone;
  const inBearFVG = bearFVG.detected && bearFVG.direction === "BEARISH" && bearFVG.inZone;
  if (hasBullishBOS && inBullFVG) {
    return { name, fired: true, direction: "BUY", reason: `H1 ${bullishBOS.type} BULLISH \u2014 price in M15 bullish FVG \u2014 ICT institutional entry zone`, strength: 0.9 };
  }
  if (hasBearishBOS && inBearFVG) {
    return { name, fired: true, direction: "SELL", reason: `H1 ${bearishBOS.type} BEARISH \u2014 price in M15 bearish FVG \u2014 ICT institutional distribution zone`, strength: 0.9 };
  }
  if (hasBullishBOS) return { name, fired: false, direction: "NEUTRAL", reason: `H1 ${bullishBOS.type} BULLISH confirmed \u2014 no M15 FVG entry yet`, strength: 0 };
  if (hasBearishBOS) return { name, fired: false, direction: "NEUTRAL", reason: `H1 ${bearishBOS.type} BEARISH confirmed \u2014 no M15 FVG entry yet`, strength: 0 };
  return { name, fired: false, direction: "NEUTRAL", reason: "No H1 BOS/CHOCH detected in recent structure", strength: 0 };
}
function vwapVolumeSurge(m5Candles, currentPrice) {
  const name = "VWAP + Volume Surge";
  if (m5Candles.length < 12) {
    return { name, fired: false, direction: "NEUTRAL", reason: "Not enough M5 candles for VWAP", strength: 0 };
  }
  const vwap = calcVWAP(m5Candles.slice(0, 78));
  const volLookback = m5Candles.slice(1, 11).map((c) => c.v || 0);
  const avgVol = volLookback.reduce((a, b) => a + b, 0) / (volLookback.length || 1);
  const currentVol = m5Candles[0].v || 0;
  const volSurge = avgVol > 0 && currentVol > avgVol * 1.5;
  if (!volSurge) {
    const ratio = avgVol > 0 ? Math.round(currentVol / avgVol * 100) : 0;
    return { name, fired: false, direction: "NEUTRAL", reason: `Volume not surging (${ratio}% of avg \u2014 need 150%+)`, strength: 0 };
  }
  const prevClose = m5Candles[1]?.c ?? currentPrice;
  const crossedAbove = currentPrice > vwap && prevClose <= vwap;
  const crossedBelow = currentPrice < vwap && prevClose >= vwap;
  if (crossedAbove || crossedBelow) {
    const pct = Math.round(currentVol / avgVol * 100);
    return {
      name,
      fired: true,
      direction: crossedAbove ? "BUY" : "SELL",
      reason: `Price crossed ${crossedAbove ? "above" : "below"} VWAP (${vwap.toFixed(5)}) with ${pct}% volume surge (prev close: ${prevClose.toFixed(5)})`,
      strength: Math.min(pct / 300, 1)
    };
  }
  const side = currentPrice > vwap ? "above" : currentPrice < vwap ? "below" : "at";
  return { name, fired: false, direction: "NEUTRAL", reason: `No VWAP cross \u2014 price already ${side} VWAP (no cross event)`, strength: 0 };
}
async function computeBreakoutScore(currentPrice, m1Candles = [], m5Candles = [], m15Candles = [], h1Candles = [], h4Candles = []) {
  const strategies = [
    asianRangeBreakout(m15Candles, currentPrice),
    openingRangeBreakout(m5Candles, currentPrice),
    donchianBreakout(h1Candles),
    bollingerSqueeze(h1Candles),
    supplyDemandBreak(h4Candles, currentPrice),
    await ictStructuralBreak(h1Candles, m15Candles, currentPrice),
    vwapVolumeSurge(m5Candles, currentPrice)
  ];
  const fired = strategies.filter((s) => s.fired);
  const score = fired.length;
  const maxScore = 7;
  const buyVotes = fired.filter((s) => s.direction === "BUY").length;
  const sellVotes = fired.filter((s) => s.direction === "SELL").length;
  const direction = buyVotes > sellVotes ? "BUY" : sellVotes > buyVotes ? "SELL" : "NEUTRAL";
  const alignedVotes = direction === "BUY" ? buyVotes : direction === "SELL" ? sellVotes : 0;
  const alignedPct = Math.round(alignedVotes / maxScore * 100);
  const percentage = alignedVotes <= 0 ? 0 : Math.min(95, 63 + alignedVotes * 11);
  let grade;
  if (alignedVotes >= 3) grade = "A";
  else if (alignedVotes === 2) grade = "B";
  else if (alignedVotes === 1) grade = "C";
  else grade = "PASS";
  const atrCandles = h1Candles.length >= 14 ? h1Candles : m15Candles.length >= 14 ? m15Candles : m5Candles;
  const atr = calcATR(atrCandles, 14);
  const sign = direction === "BUY" ? 1 : -1;
  const tp1 = direction !== "NEUTRAL" ? currentPrice + sign * atr : 0;
  const tp2 = direction !== "NEUTRAL" ? currentPrice + sign * atr * 2 : 0;
  const tp3 = direction !== "NEUTRAL" ? currentPrice + sign * atr * 3 : 0;
  const breakoutCandle = [...m15Candles, ...h1Candles][0];
  const slDistance = atr * 1.5;
  const summary = `Breakout Score: ${score}/${maxScore} fired | ${alignedVotes} aligned (${alignedPct}%) \u2014 Grade ${grade} \u2014 ${direction}
` + strategies.map((s) => `${s.fired ? "\u2705" : "\u274C"} ${s.name}: ${s.reason}`).join("\n");
  return { score, maxScore, percentage, alignedVotes, alignedPct, grade, direction, strategies, atr, tp1, tp2, tp3, slDistance, breakoutCandle, summary };
}
var init_breakoutEngine = __esm({
  "server/utils/breakoutEngine.ts"() {
    "use strict";
  }
});

// server/openai.ts
var openai_exports = {};
__export(openai_exports, {
  AVAILABLE_VISION_MODELS: () => AVAILABLE_VISION_MODELS,
  addAiConfirmationLog: () => addAiConfirmationLog,
  analyzeChartImage: () => analyzeChartImage,
  analyzeORBSignal: () => analyzeORBSignal,
  coerceConfidence: () => coerceConfidence,
  detectMarketRegime: () => detectMarketRegime,
  enrichLeadWithAI: () => enrichLeadWithAI,
  extractTextFromImage: () => extractTextFromImage,
  generateDailyDevotional: () => generateDailyDevotional,
  generateGrantProposal: () => generateGrantProposal,
  generateMarketTrendPredictions: () => generateMarketTrendPredictions,
  generatePresentationOutline: () => generatePresentationOutline,
  generateReelScript: () => generateReelScript,
  generateSlideCarouselScript: () => generateSlideCarouselScript,
  generateSocialOutreachKit: () => generateSocialOutreachKit,
  generateTradingTip: () => generateTradingTip,
  generateVeddBlogPost: () => generateVeddBlogPost,
  generateWorkforceCurriculum: () => generateWorkforceCurriculum,
  getAiConfirmationLogs: () => getAiConfirmationLogs,
  getAiHealth: () => getAiHealth,
  getAiMinConfidence: () => getAiMinConfidence,
  getAiVisionConfirmation: () => getAiVisionConfirmation,
  getAllStrategiesForPairs: () => getAllStrategiesForPairs,
  getAssetSpecificConfig: () => getAssetSpecificConfig,
  getAssetSpecificPrompt: () => getAssetSpecificPrompt,
  getBreakoutConfirmation: () => getBreakoutConfirmation,
  getDefaultOpenAIClient: () => getDefaultOpenAIClient,
  getOpenAIInstanceForUser: () => getOpenAIInstanceForUser,
  getPlatformOpenAIClient: () => getPlatformOpenAIClient,
  getPropFirmContext: () => getPropFirmContext,
  getUniversalAIClientForUser: () => getUniversalAIClientForUser,
  getUniversalVisionClientForUser: () => getUniversalVisionClientForUser,
  getUserModelPreference: () => getUserModelPreference,
  hasHiddenReasoningOverhead: () => hasHiddenReasoningOverhead,
  hydrateAdaptiveRegimeMap: () => hydrateAdaptiveRegimeMap,
  hydrateAiVisionMap: () => hydrateAiVisionMap,
  hydrateBreakoutModeMap: () => hydrateBreakoutModeMap,
  inferModelProvider: () => inferModelProvider,
  isAdaptiveRegimeEnabled: () => isAdaptiveRegimeEnabled,
  isAiVisionConfirmationEnabled: () => isAiVisionConfirmationEnabled,
  isBreakoutModeEnabled: () => isBreakoutModeEnabled,
  isICTStrategyEnabled: () => isICTStrategyEnabled,
  isPropFirmModeEnabled: () => isPropFirmModeEnabled,
  isReasoningModel: () => isReasoningModel,
  isSMCStrategyEnabled: () => isSMCStrategyEnabled,
  isTrailingStopEnabled: () => isTrailingStopEnabled,
  openai: () => openai,
  scanGrantsWithAI: () => scanGrantsWithAI,
  setAdaptiveRegimeEnabled: () => setAdaptiveRegimeEnabled,
  setAiMinConfidence: () => setAiMinConfidence,
  setAiVisionConfirmation: () => setAiVisionConfirmation,
  setBreakoutModeEnabled: () => setBreakoutModeEnabled,
  setICTStrategyEnabled: () => setICTStrategyEnabled,
  setPropFirmContext: () => setPropFirmContext,
  setPropFirmMode: () => setPropFirmMode,
  setSMCStrategyEnabled: () => setSMCStrategyEnabled,
  setTrailingStopEnabled: () => setTrailingStopEnabled,
  setUserModelPreference: () => setUserModelPreference,
  testOpenAIApiKey: () => testOpenAIApiKey
});
import OpenAI from "openai";
function getRelevantStrategies(symbol) {
  const relevant = TOP_PROFITABLE_STRATEGIES.filter(
    (s) => s.pairs.some((p) => symbol.toUpperCase().includes(p) || p.includes(symbol.toUpperCase().replace("USD", "").replace("PIPS", ""))) || s.pairs.includes(symbol.toUpperCase())
  ).slice(0, 3);
  if (relevant.length === 0) return TOP_PROFITABLE_STRATEGIES.slice(0, 3).map((s) => `\u2022 ${s.name}: ${s.winConditions}`).join("\n");
  return relevant.map((s) => `\u2022 ${s.name}
  Setup: ${s.description}
  Win conditions: ${s.winConditions}
  Risk note: ${s.riskNote}`).join("\n\n");
}
function getAllStrategiesForPairs(pairList) {
  const seen = /* @__PURE__ */ new Set();
  const results = [];
  for (const pair of pairList) {
    const relevant = TOP_PROFITABLE_STRATEGIES.filter(
      (s) => s.pairs.some((p) => pair.toUpperCase().replace("/", "").includes(p) || p.includes(pair.toUpperCase().replace("/", "").replace("USD", "").replace("PIPS", ""))) || s.pairs.includes(pair.toUpperCase().replace("/", ""))
    );
    for (const s of relevant) {
      if (!seen.has(s.name)) {
        seen.add(s.name);
        results.push(`\u2022 ${s.name} (${s.pairs.join(", ")})
  Setup: ${s.description}
  Win conditions: ${s.winConditions}
  Risk note: ${s.riskNote}`);
      }
    }
  }
  if (results.length < 4) {
    for (const s of TOP_PROFITABLE_STRATEGIES) {
      if (!seen.has(s.name)) {
        seen.add(s.name);
        results.push(`\u2022 ${s.name} (${s.pairs.join(", ")})
  Setup: ${s.description}
  Win conditions: ${s.winConditions}
  Risk note: ${s.riskNote}`);
        if (results.length >= 5) break;
      }
    }
  }
  return results.join("\n\n");
}
function getAssetSpecificConfig(symbol) {
  const cleanSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleanSymbol.includes("XAU") || cleanSymbol.includes("GOLD")) {
    return {
      assetType: "gold",
      volatilityMultiplier: 1.5,
      atrMultiplier: 2,
      minimumConfirmations: 3,
      sessionBias: ["London Session", "New York Session"],
      correlationAssets: ["DXY (inverse)", "US Treasury Yields (inverse)", "Silver XAG"],
      specialConsiderations: [
        "Gold is a safe-haven asset - analyze risk sentiment",
        "Strong inverse correlation with USD strength (DXY)",
        "Reacts sharply to Fed rate decisions and inflation data",
        "Higher volatility during London/NY session overlap",
        "Consider geopolitical tensions as bullish catalyst",
        "Widen stop losses by 1.5-2x due to higher pip value volatility",
        "Look for exhaustion patterns at psychological levels ($1900, $2000, $2100)",
        "Volume spikes often precede major reversals"
      ]
    };
  }
  if (cleanSymbol.includes("BTC") || cleanSymbol.includes("BITCOIN") || cleanSymbol.includes("ETH") || cleanSymbol.includes("CRYPTO")) {
    return {
      assetType: "crypto",
      volatilityMultiplier: 2,
      atrMultiplier: 2.5,
      minimumConfirmations: 4,
      sessionBias: ["24/7 - Focus on high volume periods"],
      correlationAssets: ["NASDAQ/Tech stocks", "Ethereum ETH", "Total Crypto Market Cap"],
      specialConsiderations: [
        "BTC trades 24/7 - volatility can spike any time",
        "Weekend volatility often higher with lower liquidity",
        "Whale wallet movements can cause sudden price swings",
        "ETF inflows/outflows significantly impact price",
        "Halving cycles create long-term bullish bias every 4 years",
        "Regulatory news causes extreme volatility - widen stops by 2x minimum",
        "Key psychological levels: $30k, $40k, $50k, $60k, $70k, $100k",
        "Look for CME gap fills as potential targets",
        "Funding rates indicate market sentiment (high = potential reversal)",
        "On-chain metrics (active addresses, exchange flows) provide context",
        "Correlation with risk assets during macro uncertainty"
      ]
    };
  }
  const INDEX_SYMBOLS = ["US30", "NAS100", "SPX500", "UK100", "GER40", "DAX", "AUS200", "HK50", "JP225", "FRA40", "NASDAQ", "DOW", "SP500", "WALLST", "DJ30", "USTEC"];
  if (INDEX_SYMBOLS.some((idx) => cleanSymbol.includes(idx))) {
    return {
      assetType: "index",
      volatilityMultiplier: 1.2,
      atrMultiplier: 1.5,
      minimumConfirmations: 2,
      sessionBias: ["New York Session (09:30\u201316:00 EST)", "London Session (08:00\u201317:00 GMT)"],
      correlationAssets: ["VIX (inverse)", "USD strength", "Treasury yields", "SPX leads NAS100/US30"],
      specialConsiderations: [
        "Entry prices must be within 15\u201350 points of current price \u2014 not hundreds of points away",
        "Stop loss: 50\u2013150 points from entry depending on ATR",
        "Take profit: 100\u2013400 points targeting key levels",
        "US30 moves 200\u2013500 points on a typical day \u2014 scale entries accordingly",
        "Avoid entries more than 100 points from current price \u2014 they will never fill",
        "NY open (09:30 EST) and EU open (08:00 GMT) are highest probability windows",
        "VIX above 25 = elevated volatility, widen SL by 1.5x",
        "SPX500 direction often leads US30 and NAS100",
        "Psychological round numbers (e.g., 40000, 44500) act as magnets and resistance"
      ]
    };
  }
  return {
    assetType: "forex",
    volatilityMultiplier: 1,
    atrMultiplier: 1.5,
    minimumConfirmations: 2,
    sessionBias: ["Session depends on pair"],
    correlationAssets: ["Related pairs"],
    specialConsiderations: ["Standard forex analysis applies"]
  };
}
function getAssetSpecificPrompt(symbol) {
  const config = getAssetSpecificConfig(symbol);
  if (config.assetType === "gold") {
    return `
    
    GOLD/XAU SPECIFIC ANALYSIS (CRITICAL FOR ACCURACY):
    
    Gold is a HIGH-VOLATILITY precious metal with unique characteristics:
    
    1. VOLATILITY ADJUSTMENT:
       - Gold moves in larger pip increments than forex
       - Standard stop losses often get hit prematurely
       - MANDATORY: Widen all stop losses by 1.5-2x compared to forex
       - Use ATR 2x minimum for stop loss calculations
       
    2. CORRELATION CHECK (Must analyze):
       - Check USD strength context (strong USD = bearish gold)
       - Consider Treasury yield direction (rising yields = bearish gold)
       - Evaluate overall risk sentiment (risk-off = bullish gold)
       
    3. SESSION TIMING:
       - Best trading: London-NY overlap (13:00-17:00 GMT)
       - Avoid: Low liquidity Asian session for entries
       - News: Fed speeches, CPI data cause extreme moves
       
    4. PATTERN RELIABILITY:
       - Candlestick patterns need STRONGER confirmation on gold
       - Wait for volume confirmation before entry
       - Psychological levels ($1900, $2000, $2100) act as magnets
       
    5. SIGNAL REQUIREMENTS:
       - Require minimum 3 confirmations before signaling BUY/SELL
       - Single indicator signals are NOT sufficient for gold
       - If unsure, signal should be NEUTRAL with reduced confidence
       
    6. STOP LOSS RULES FOR GOLD:
       - Minimum 200-300 pips from entry (gold pips are 0.01)
       - Place below/above significant swing points
       - Never use tight stops on gold - they will get hunted`;
  }
  if (config.assetType === "crypto") {
    return `
    
    BITCOIN/CRYPTO SPECIFIC ANALYSIS (CRITICAL FOR ACCURACY):
    
    Bitcoin is an EXTREMELY HIGH-VOLATILITY asset with unique characteristics:
    
    1. VOLATILITY ADJUSTMENT:
       - BTC can move 2-5% in hours, 10%+ on volatile days
       - Standard forex stop losses are COMPLETELY INADEQUATE
       - MANDATORY: Use ATR 2.5x minimum for stop loss calculations
       - Accept wider stops to avoid premature stop-outs
       
    2. MARKET STRUCTURE:
       - 24/7 trading means no session gaps (except CME futures)
       - Weekend often sees lower liquidity + higher volatility
       - Whale movements create sudden wicks - plan for them
       
    3. CONFIRMATION REQUIREMENTS:
       - Require minimum 4 confirmations for BTC signals
       - Single timeframe analysis is INSUFFICIENT
       - Volume must strongly confirm the direction
       - RSI extremes (>80, <20) more reliable than mid-range
       
    4. KEY LEVELS:
       - Psychological: $30k, $40k, $50k, $60k, $70k, $100k
       - CME gap levels often get filled
       - Previous all-time highs become strong support/resistance
       
    5. SENTIMENT FACTORS:
       - ETF flows (Blackrock, Fidelity) significantly move price
       - Funding rates: High positive = potential short squeeze, high negative = potential long squeeze
       - Fear & Greed Index provides context
       
    6. STOP LOSS RULES FOR BTC:
       - Minimum $1,000-$2,000 from entry point
       - Place below/above significant swing points
       - Use percentage-based stops (2-5% from entry)
       - Factor in potential wick hunting before major moves
       
    7. SIGNAL CONFIDENCE:
       - Be MORE CONSERVATIVE with confidence ratings
       - "High" confidence requires 4+ confirmations
       - Single indicator signals should be "Low" confidence maximum`;
  }
  if (config.assetType === "index") {
    return `

    EQUITY INDEX SPECIFIC ANALYSIS (CRITICAL FOR ACCURACY \u2014 US30/NAS100/SPX500/UK100/GER40):

    Equity indices move in POINTS, not forex pips. Entry prices MUST be realistic:

    1. ENTRY PRICE RULES (MOST IMPORTANT):
       - Entry must be within 15\u201350 points of CURRENT price for US30/NAS100
       - NEVER suggest an entry more than 100 points from current price \u2014 it will NEVER trigger
       - For limit orders: entry 10\u201330 points from current price (pullback to key level)
       - For stop orders: entry 10\u201325 points beyond current price (breakout confirmation)
       - US30 typical daily range: 200\u2013500 points \u2014 calibrate entries to this scale

    2. STOP LOSS RULES:
       - US30/NAS100: Stop loss 50\u2013150 points from entry
       - SPX500: Stop loss 15\u201350 points from entry
       - Place stops below/above the nearest swing high/low or session open
       - Avoid stops tighter than 30 points on US30 (noise will stop you out)

    3. TAKE PROFIT RULES:
       - Minimum 1.5:1 R:R required
       - US30: TP targets 100\u2013400 points from entry
       - Target the nearest round number (e.g., 44000, 44500, 45000)
       - Multi-target: partial at 100 pts, full at 200\u2013300 pts

    4. SESSION TIMING:
       - Best: NY open 09:30\u201311:00 EST, EU open 08:00\u201310:00 GMT
       - Avoid: 12:00\u201314:00 EST lunch lull (low liquidity, choppy)
       - Watch: Fed speeches, CPI, NFP cause 200\u2013500 pt spikes

    5. CORRELATION:
       - Check SPX direction before US30 entries (SPX leads)
       - VIX rising = bearish pressure; VIX falling = bullish confirmation
       - Strong USD often weighs on indices

    6. ALL PRICE LEVELS IN YOUR RESPONSE must be realistic index values:
       - US30 is currently near ${symbol.includes("US30") || symbol.includes("DOW") ? "~44,000\u201345,000" : "check current price"} \u2014 use real nearby levels
       - Return entry/SL/TP as actual price values, NOT pip distances`;
  }
  return "";
}
function remapBareModelForOpenRouter(model, hasImage) {
  const m = (model || "").toString();
  if (m.includes("/") || m.endsWith(":free")) return m;
  return hasImage ? VISION_FALLBACK.openrouter || "google/gemma-3-4b-it" : "openai/gpt-oss-20b";
}
function messagesHaveImage(messages) {
  return Array.isArray(messages) && messages.some((msg) => Array.isArray(msg?.content) && msg.content.some((part) => part?.type === "image_url"));
}
function getPlatformOpenAIClient() {
  const oaiKey = process.env.OPENAI_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  const realOpenAI = new OpenAI({ apiKey: oaiKey || "not-configured", maxRetries: 4, timeout: 9e4 });
  if (!orKey) return realOpenAI;
  const orClient = new OpenAI({
    apiKey: orKey,
    baseURL: "https://openrouter.ai/api/v1",
    maxRetries: 4,
    timeout: 9e4,
    defaultHeaders: { "HTTP-Referer": "https://veddbuild.com", "X-Title": "VEDDBuild" }
  });
  const wrappedChat = {
    completions: {
      create: async (params) => {
        const p = { ...params };
        p.model = remapBareModelForOpenRouter(params.model, messagesHaveImage(params.messages));
        try {
          return await orClient.chat.completions.create(p);
        } catch (e) {
          if (oaiKey) {
            console.warn(`[AI] OpenRouter failed (${e?.status ?? e?.message}); falling back to OpenAI`);
            return await realOpenAI.chat.completions.create(params);
          }
          throw e;
        }
      }
    }
  };
  return new Proxy(realOpenAI, {
    get(target, prop) {
      if (prop === "chat") return wrappedChat;
      return target[prop];
    }
  });
}
function getDefaultOpenAIClient() {
  if (!_openaiInstance) {
    _openaiInstance = getPlatformOpenAIClient();
  }
  return _openaiInstance;
}
function setUserModelPreference(userId, model) {
  userModelPreferences.set(userId, model);
}
function getUserModelPreference(userId) {
  const pref = userModelPreferences.get(userId) || DEFAULT_AI_MODEL;
  if (DEPRECATED_MODEL_MAP[pref]) {
    const updated = DEPRECATED_MODEL_MAP[pref];
    userModelPreferences.set(userId, updated);
    console.log(`[AI Model] Migrated user ${userId} from deprecated ${pref} to ${updated}`);
    return updated;
  }
  return pref;
}
function getModelProvider(modelId) {
  const model = AVAILABLE_VISION_MODELS.find((m) => m.id === modelId);
  return model?.provider || "openai";
}
function inferModelProvider(modelId) {
  const m = (modelId || "").toLowerCase();
  if (m.endsWith(":free") || m.startsWith("openrouter/")) return "openrouter";
  if (m.includes("/")) return "openrouter";
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4") || m.startsWith("chatgpt")) return "openai";
  if (m.startsWith("claude")) return "anthropic";
  if (m.startsWith("gemini")) return "google";
  if (m.startsWith("mistral") || m.startsWith("mixtral") || m.startsWith("magistral")) return "mistral";
  if (m.includes("gpt-oss") || m.includes("llama") || m.includes("groq") || m.includes("gemma") || m.includes("qwen") || m.includes("deepseek")) return "groq";
  return getModelProvider(modelId);
}
function coerceConfidence(raw) {
  let c = typeof raw === "string" ? parseFloat(raw) : raw;
  if (typeof c !== "number" || !Number.isFinite(c)) return 50;
  if (c > 0 && c <= 1) c *= 100;
  return Math.max(0, Math.min(100, Math.round(c)));
}
function resolveVisionModel(modelId) {
  if (KNOWN_VISION_MODEL_IDS.has(modelId)) return modelId;
  const provider = inferModelProvider(modelId);
  const fallback = VISION_FALLBACK[provider] || "gpt-4o-mini";
  console.log(`[AI Model] ${modelId} is not vision-capable (${provider}) \u2014 switching to ${fallback} for chart confirmation`);
  return fallback;
}
function setAiVisionConfirmation(userId, enabled) {
  aiVisionConfirmationEnabled.set(userId, enabled);
}
function hydrateAiVisionMap(userId, enabled) {
  aiVisionConfirmationEnabled.set(userId, enabled);
}
function isAiVisionConfirmationEnabled(userId) {
  const val = aiVisionConfirmationEnabled.get(userId);
  return val === void 0 ? true : val;
}
function setAiMinConfidence(userId, minConfidence) {
  const clamped = Math.max(0, Math.min(100, Math.round(minConfidence)));
  aiMinConfidenceThreshold.set(userId, clamped);
}
function getAiMinConfidence(userId) {
  return aiMinConfidenceThreshold.get(userId) ?? 70;
}
function setICTStrategyEnabled(userId, enabled) {
  ictStrategyEnabledMap.set(userId, enabled);
}
function isICTStrategyEnabled(userId) {
  const val = ictStrategyEnabledMap.get(userId);
  return val === void 0 ? true : val;
}
function setSMCStrategyEnabled(userId, enabled) {
  smcStrategyEnabledMap.set(userId, enabled);
}
function isSMCStrategyEnabled(userId) {
  const val = smcStrategyEnabledMap.get(userId);
  return val === void 0 ? true : val;
}
function setBreakoutModeEnabled(userId, enabled) {
  if (enabled) {
    if (!breakoutModeEnabledMap.get(userId)) {
      breakoutModePriorState.set(userId, {
        ict: isICTStrategyEnabled(userId),
        smc: isSMCStrategyEnabled(userId),
        trail: isTrailingStopEnabled(userId)
      });
    }
    ictStrategyEnabledMap.set(userId, false);
    smcStrategyEnabledMap.set(userId, false);
    trailingStopEnabledMap.set(userId, false);
  } else {
    if (breakoutModeEnabledMap.get(userId)) {
      const prior = breakoutModePriorState.get(userId);
      if (prior) {
        ictStrategyEnabledMap.set(userId, prior.ict);
        smcStrategyEnabledMap.set(userId, prior.smc);
        trailingStopEnabledMap.set(userId, prior.trail);
        breakoutModePriorState.delete(userId);
      } else {
        ictStrategyEnabledMap.set(userId, true);
        smcStrategyEnabledMap.set(userId, true);
        trailingStopEnabledMap.set(userId, true);
      }
    }
  }
  breakoutModeEnabledMap.set(userId, enabled);
}
function hydrateBreakoutModeMap(userId, enabled) {
  if (!breakoutModeEnabledMap.has(userId)) {
    breakoutModeEnabledMap.set(userId, enabled);
  }
}
function isBreakoutModeEnabled(userId) {
  return breakoutModeEnabledMap.get(userId) ?? false;
}
function setTrailingStopEnabled(userId, enabled) {
  trailingStopEnabledMap.set(userId, enabled);
}
function isTrailingStopEnabled(userId) {
  const val = trailingStopEnabledMap.get(userId);
  return val === void 0 ? true : val;
}
function setPropFirmMode(userId, enabled) {
  propFirmModeMap.set(userId, enabled);
}
function isPropFirmModeEnabled(userId) {
  const val = propFirmModeMap.get(userId);
  return val === void 0 ? false : val;
}
function setPropFirmContext(userId, ctx) {
  propFirmContextMap.set(userId, ctx);
}
function getPropFirmContext(userId) {
  return propFirmContextMap.get(userId) ?? null;
}
function addAiConfirmationLog(userId, entry) {
  if (!aiConfirmationLogs2.has(userId)) {
    aiConfirmationLogs2.set(userId, []);
  }
  const logs = aiConfirmationLogs2.get(userId);
  logs.unshift({ ...entry, id: logIdCounter++ });
  if (logs.length > 50) logs.pop();
  Promise.resolve().then(() => (init_storage(), storage_exports)).then(
    ({ storage: storage2 }) => storage2.createAiConfirmationLogEntry(userId, entry)
  ).catch((err) => console.error("[AI Confirmation Log] DB persist failed (non-fatal):", err?.message));
}
function getAiConfirmationLogs(userId) {
  return aiConfirmationLogs2.get(userId) || [];
}
function estimatePipSize(symbol) {
  const s = symbol.toUpperCase();
  if (s.includes("XAU") || s.includes("GOLD")) return 0.1;
  if (s.includes("JPY")) return 0.01;
  if (["US30", "NAS100", "GER40", "UK100", "SPX500", "DAX", "AUS200", "HK50", "JP225", "FRA40"].some((idx) => s.includes(idx))) return 1;
  if (s.includes("BTC") || s.includes("ETH") || s.includes("XBT")) return 1;
  return 1e-4;
}
function buildTrailSignalSummary(symbol, proposedSignal, tradePlan, ictContext, smcContext) {
  if (!ictContext && !smcContext) return "\u25BA No ICT/SMC context available \u2014 use ADX/ATR baseline only";
  const pipSize = estimatePipSize(symbol);
  const entry = tradePlan?.entry || 0;
  const signals = [];
  const crt = ictContext?.crtPattern;
  if (crt?.detected) {
    if (crt.stage === "EXPANSION") {
      signals.push(`\u25BA CRT EXPANSION stage \u2014 institutional directional move just launched, high-probability run in progress \u2014 bias WIDE or AGGRESSIVE`);
    } else if (crt.stage === "MANIPULATION") {
      signals.push(`\u25BA CRT MANIPULATION stage \u2014 price still faking out before expansion, trail not appropriate yet \u2014 bias NONE`);
    } else if (crt.stage === "RANGE") {
      signals.push(`\u25BA CRT RANGE stage \u2014 accumulation/distribution in progress, no directional momentum yet \u2014 bias STANDARD`);
    }
  } else {
    signals.push(`\u25BA No CRT pattern detected \u2014 use ADX/ATR baseline for trail type`);
  }
  const wyc = smcContext?.wyckoff;
  if (wyc?.detected) {
    if (wyc.phase === "MARKUP" || wyc.phase === "MARKDOWN") {
      signals.push(`\u25BA Wyckoff ${wyc.phase} \u2014 sustained trend confirmed by institutional phase, let profits run \u2014 bias WIDE`);
    } else if (wyc.phase === "ACCUMULATION" && wyc.stage === "SPRING") {
      signals.push(`\u25BA Wyckoff Accumulation SPRING \u2014 fresh bullish launch, give the trade room \u2014 bias STANDARD to WIDE`);
    } else if (wyc.phase === "DISTRIBUTION" && wyc.stage === "UPTHRUST") {
      signals.push(`\u25BA Wyckoff Distribution UPTHRUST \u2014 fresh bearish launch, give the trade room \u2014 bias STANDARD to WIDE`);
    } else if (wyc.phase === "ACCUMULATION" && wyc.stage === "SOS") {
      signals.push(`\u25BA Wyckoff Sign of Strength (SOS) \u2014 bullish trend accelerating out of range \u2014 bias WIDE`);
    } else if (wyc.phase === "DISTRIBUTION" && wyc.stage === "SOW") {
      signals.push(`\u25BA Wyckoff Sign of Weakness (SOW) \u2014 bearish trend accelerating out of range \u2014 bias WIDE`);
    } else {
      signals.push(`\u25BA Wyckoff phase detected (${wyc.phase}/${wyc.stage || "ranging"}) \u2014 ${wyc.description}`);
    }
  } else {
    signals.push(`\u25BA No Wyckoff phase detected \u2014 use ADX baseline`);
  }
  const eql = smcContext?.equalHighsLows;
  if (eql && entry > 0 && pipSize > 0) {
    if (proposedSignal === "BUY" && eql.equalHighs.detected && eql.equalHighs.level) {
      const distPips = Math.abs(eql.equalHighs.level - entry) / pipSize;
      const tightThreshold = pipSize === 1e-4 ? 30 : pipSize === 0.1 ? 300 : pipSize === 0.01 ? 3 : 100;
      if (distPips < tightThreshold) {
        signals.push(`\u25BA Equal Highs (Buy-Side Liquidity) at ${eql.equalHighs.level.toFixed(5)} \u2014 only ~${Math.round(distPips)} pips away \u2014 TIGHTEN trail to lock in profits before sweep`);
      } else {
        signals.push(`\u25BA Equal Highs (BSL) at ${eql.equalHighs.level.toFixed(5)} \u2014 ${Math.round(distPips)} pips away \u2014 TP target, trail width unconstrained`);
      }
    } else if (proposedSignal === "SELL" && eql.equalLows.detected && eql.equalLows.level) {
      const distPips = Math.abs(entry - eql.equalLows.level) / pipSize;
      const tightThreshold = pipSize === 1e-4 ? 30 : pipSize === 0.1 ? 300 : pipSize === 0.01 ? 3 : 100;
      if (distPips < tightThreshold) {
        signals.push(`\u25BA Equal Lows (Sell-Side Liquidity) at ${eql.equalLows.level.toFixed(5)} \u2014 only ~${Math.round(distPips)} pips away \u2014 TIGHTEN trail to lock in profits before sweep`);
      } else {
        signals.push(`\u25BA Equal Lows (SSL) at ${eql.equalLows.level.toFixed(5)} \u2014 ${Math.round(distPips)} pips away \u2014 TP target, trail width unconstrained`);
      }
    } else {
      signals.push(`\u25BA No nearby liquidity pool in trade direction \u2014 trail width unconstrained`);
    }
  } else {
    signals.push(`\u25BA No liquidity pool data available`);
  }
  const mw = ictContext?.macroWindow;
  if (mw) {
    if (mw.isInMacroWindow) {
      signals.push(`\u25BA ICT macro window ACTIVE (${mw.macroName}) \u2014 institutional engine running, high-probability directional flow \u2014 bias WIDE`);
    } else {
      signals.push(`\u25BA ICT macro window INACTIVE \u2014 impulse may exhaust sooner, next window: ${mw.nextMacroName} in ${mw.minutesUntilNextMacro}min \u2014 bias STANDARD`);
    }
  }
  if (mw) {
    const session2 = mw.session;
    const timeLabel = mw.currentNYTime ? ` (${mw.currentNYTime} NY)` : "";
    if (session2 === "LONDON") {
      signals.push(`\u25BA Session: London Kill Zone${timeLabel} \u2014 institutional range highs/lows being set, high-volatility institutional flow \u2014 bias WIDE`);
    } else if (session2 === "NY_AM") {
      signals.push(`\u25BA Session: New York AM${timeLabel} \u2014 peak trending session, highest volume of the day \u2014 bias WIDE to AGGRESSIVE`);
    } else if (session2 === "NY_PM") {
      signals.push(`\u25BA Session: New York PM${timeLabel} \u2014 continuation or late exhaustion \u2014 bias STANDARD`);
    } else if (session2 === "ASIAN") {
      signals.push(`\u25BA Session: Asian session${timeLabel} \u2014 low momentum, range-bound, avoid wide trails \u2014 bias TIGHT`);
    } else if (session2 === "OVERNIGHT") {
      signals.push(`\u25BA Session: Off-hours / Overnight${timeLabel} \u2014 minimal volume, erratic moves \u2014 bias TIGHT or NONE`);
    } else if (mw.currentNYTime) {
      const match = mw.currentNYTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        let hours = parseInt(match[1]);
        const mins = parseInt(match[2]);
        const ampm = match[3].toUpperCase();
        if (ampm === "PM" && hours !== 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;
        const totalMins = hours * 60 + mins;
        if (totalMins >= 7 * 60 && totalMins < 11 * 60 + 30) {
          signals.push(`\u25BA Session: London/NY overlap${timeLabel} \u2014 peak trending window \u2014 bias WIDE to AGGRESSIVE`);
        } else if (totalMins >= 12 * 60 && totalMins < 14 * 60 + 30) {
          signals.push(`\u25BA Session: NY Lunch${timeLabel} \u2014 low momentum, chop risk \u2014 reduce trail one level (WIDE\u2192STANDARD, STANDARD\u2192TIGHT)`);
        } else if (totalMins >= 14 * 60 + 30 && totalMins < 17 * 60) {
          signals.push(`\u25BA Session: NY PM${timeLabel} \u2014 steady continuation or late reversal \u2014 bias STANDARD`);
        } else {
          signals.push(`\u25BA Session: Asian/off-hours${timeLabel} \u2014 low momentum, tight spreads \u2014 bias TIGHT`);
        }
      }
    }
  }
  const bos = smcContext?.bosCHOCH;
  if (bos?.detected) {
    if (bos.type === "CHOCH") {
      signals.push(`\u25BA ${bos.direction} CHOCH detected \u2014 fresh trend reversal just confirmed, plenty of room to run \u2014 bias WIDE`);
    } else if (bos.type === "BOS") {
      signals.push(`\u25BA ${bos.direction} BOS continuation \u2014 trend is mature, watch for exhaustion near next structure \u2014 bias STANDARD`);
    }
  } else {
    signals.push(`\u25BA No BOS/CHOCH \u2014 ranging environment, no clear trend direction \u2014 bias TIGHT`);
  }
  if (tradePlan?.entry && tradePlan?.stopLoss && tradePlan?.takeProfit) {
    const rrEntry = tradePlan.entry;
    const rrSL = tradePlan.stopLoss;
    const rrTP = tradePlan.takeProfit;
    const risk = Math.abs(rrEntry - rrSL);
    const reward = Math.abs(rrTP - rrEntry);
    const rr = risk > 0 ? reward / risk : 0;
    if (rr >= 3) {
      signals.push(`\u25BA Trade R:R is ${rr.toFixed(1)}R \u2014 high reward trade, use WIDE or AGGRESSIVE trail to let profits compound; only tighten after 2R secured`);
    } else if (rr >= 2) {
      signals.push(`\u25BA Trade R:R is ${rr.toFixed(1)}R \u2014 solid trade, STANDARD to WIDE trail; move to breakeven at 1R`);
    } else if (rr >= 1.5) {
      signals.push(`\u25BA Trade R:R is ${rr.toFixed(1)}R \u2014 acceptable trade, TIGHT trail preferred; target is relatively close, protect quickly`);
    } else if (rr > 0) {
      signals.push(`\u25BA Trade R:R is ${rr.toFixed(1)}R \u2014 low reward, TIGHT or NONE; risk/reward doesn't justify a wide trail`);
    }
  }
  return signals.join("\n");
}
function resolveIctThresholds(accountBalance) {
  if (accountBalance < 1e3) return { aPlus: 10, a: 8, b: 5, c: 3, minGrade: "C" };
  if (accountBalance < 5e3) return { aPlus: 10, a: 8, b: 6, c: 4, minGrade: "B" };
  if (accountBalance < 2e4) return { aPlus: 10, a: 7, b: 5, c: 4, minGrade: "A" };
  return { aPlus: 9, a: 7, b: 5, c: 4, minGrade: "A+" };
}
function computeConfluenceScore(signal, ictContext, smcContext, accountBalance = 0) {
  let score = 0;
  const summary = [];
  if (ictContext) {
    if (ictContext.premiumDiscount.aligns) {
      score++;
      summary.push(`\u2705 PD Array: ${ictContext.premiumDiscount.zone} zone aligns with ${signal}`);
    } else {
      summary.push(`\u274C PD Array: ${ictContext.premiumDiscount.zone} zone conflicts with ${signal}`);
    }
    if (ictContext.stopHunt.detected) {
      score++;
      summary.push(`\u2705 Stop Hunt: Liquidity sweep detected before entry`);
    } else {
      summary.push(`\u26A0 Stop Hunt: No liquidity sweep detected`);
    }
    if (ictContext.crtPattern.detected) {
      if (ictContext.crtPattern.stage === "EXPANSION") {
        score++;
        summary.push(`\u2705 CRT: EXPANSION phase confirmed \u2014 institutional move launched`);
      } else if (ictContext.crtPattern.stage === "MANIPULATION") {
        summary.push(`\u274C CRT: MANIPULATION phase \u2014 fakeout risk, no score`);
      } else {
        summary.push(`\u26A0 CRT: RANGE forming \u2014 no directional confirmation yet`);
      }
    }
    if (ictContext.macroWindow.isInMacroWindow) {
      score++;
      summary.push(`\u2705 ICT Macro: Active window (${ictContext.macroWindow.macroName})`);
    } else {
      summary.push(`\u26A0 ICT Macro: Inactive \u2014 ${ictContext.macroWindow.minutesUntilNextMacro}min to next window`);
    }
    const sess = ictContext.macroWindow.session;
    if (sess === "LONDON" || sess === "NY_AM") {
      score++;
      summary.push(`\u2705 Session: ${sess} \u2014 peak institutional session`);
    } else {
      summary.push(`\u26A0 Session: ${sess || "UNKNOWN"} \u2014 lower volume session`);
    }
    if (ictContext.oteZone?.detected && ictContext.oteZone.inOTEZone) {
      score++;
      summary.push(`\u2705 OTE: Price in 61.8\u201379% retracement zone \u2014 institutional entry sweet spot`);
    } else if (ictContext.oteZone?.detected) {
      summary.push(`\u26A0 OTE: Zone identified but price not in it (${ictContext.oteZone.description.slice(0, 60)}...)`);
    }
    if (ictContext.keyLevels) {
      const kl = ictContext.keyLevels;
      const bearishPDH = signal === "SELL" && kl.abovePDH;
      const bullishPDL = signal === "BUY" && kl.belowPDL;
      if (bearishPDH || bullishPDL) {
        score++;
        summary.push(`\u2705 PDH/PDL: Price ${bearishPDH ? "above PDH \u2014 bearish bias confirmed" : "below PDL \u2014 bullish bias confirmed"}`);
      } else {
        summary.push(`\u26A0 PDH/PDL: ${kl.description.slice(0, 80)}`);
      }
    }
  }
  if (smcContext) {
    if (smcContext.bosCHOCH.detected) {
      const bosAligns = signal === "BUY" && smcContext.bosCHOCH.direction === "BULLISH" || signal === "SELL" && smcContext.bosCHOCH.direction === "BEARISH";
      if (bosAligns) {
        score++;
        summary.push(`\u2705 Structure: ${smcContext.bosCHOCH.type} ${smcContext.bosCHOCH.direction} aligns with ${signal}`);
      } else {
        summary.push(`\u274C Structure: ${smcContext.bosCHOCH.type} ${smcContext.bosCHOCH.direction} conflicts with ${signal}`);
      }
    } else {
      summary.push(`\u26A0 Structure: No BOS/CHOCH \u2014 ranging`);
    }
    if (smcContext.fvg.detected && smcContext.fvg.inZone) {
      score++;
      summary.push(`\u2705 FVG: Price inside Fair Value Gap \u2014 imbalance zone entry`);
    } else if (smcContext.fvg.detected) {
      summary.push(`\u26A0 FVG: Detected but price not in zone`);
    } else {
      summary.push(`\u26A0 FVG: No aligned Fair Value Gap`);
    }
    if (smcContext.orderBlock.detected && smcContext.orderBlock.aligns && smcContext.orderBlock.mitigation === "FRESH") {
      score++;
      summary.push(`\u2705 Order Block: FRESH ${smcContext.orderBlock.type} \u2014 maximum institutional interest`);
    } else if (smcContext.orderBlock.detected && smcContext.orderBlock.aligns) {
      summary.push(`\u26A0 Order Block: Aligned but ${smcContext.orderBlock.mitigation} \u2014 partially consumed`);
    } else {
      summary.push(`\u26A0 Order Block: No aligned fresh order block`);
    }
    if (smcContext.wyckoff.detected && smcContext.wyckoff.aligns) {
      score++;
      summary.push(`\u2705 Wyckoff: ${smcContext.wyckoff.phase}/${smcContext.wyckoff.stage || "phase"} aligns`);
    } else if (smcContext.wyckoff.detected) {
      summary.push(`\u26A0 Wyckoff: Detected but conflicts \u2014 ${smcContext.wyckoff.phase}`);
    } else {
      summary.push(`\u26A0 Wyckoff: No clear phase`);
    }
    const eqAligns = signal === "BUY" ? smcContext.equalHighsLows.equalHighs.detected : smcContext.equalHighsLows.equalLows.detected;
    if (eqAligns) {
      score++;
      summary.push(`\u2705 Liquidity Target: Equal ${signal === "BUY" ? "highs (BSL)" : "lows (SSL)"} above \u2014 clear institutional draw on liquidity`);
    } else {
      summary.push(`\u26A0 Liquidity: No equal ${signal === "BUY" ? "highs" : "lows"} as TP target`);
    }
  }
  const ictThresholds = resolveIctThresholds(accountBalance);
  let grade;
  if (score >= ictThresholds.aPlus) grade = "A+";
  else if (score >= ictThresholds.a) grade = "A";
  else if (score >= ictThresholds.b) grade = "B";
  else if (score >= ictThresholds.c) grade = "C";
  else grade = "D";
  const gradeOrder = ["D", "C", "B", "A", "A+"];
  if (gradeOrder.indexOf(grade) < gradeOrder.indexOf(ictThresholds.minGrade)) {
    console.log(`[ICT] Grade ${grade} below min ${ictThresholds.minGrade} for $${accountBalance} account \u2014 blocked`);
  }
  return { score, maxScore: 12, grade, summary };
}
function computeNewsProximity(upcomingEvents, blockThresholdMinutes = 15) {
  if (!upcomingEvents || upcomingEvents.length === 0) {
    return { minutesToNext: null, eventName: null, isBlocked: false, isWarning: false, summary: "" };
  }
  const highImpact = upcomingEvents.filter((e) => {
    const imp = (e.impact || "").toLowerCase();
    return imp === "high" || imp === "3" || imp === "red";
  });
  if (highImpact.length === 0) {
    return { minutesToNext: null, eventName: null, isBlocked: false, isWarning: false, summary: "" };
  }
  const now = Date.now();
  let closestMinutes = null;
  let closestName = null;
  for (const ev of highImpact) {
    try {
      let eventMs = null;
      const t = ev.time || "";
      const iso = new Date(t);
      if (!isNaN(iso.getTime())) {
        eventMs = iso.getTime();
      } else {
        const relMatch = t.match(/in\s+(\d+)\s*min/i);
        if (relMatch) eventMs = now + parseInt(relMatch[1]) * 6e4;
        const todayMatch = t.match(/today\s+(\d{1,2}):(\d{2})/i);
        if (todayMatch) {
          const d = /* @__PURE__ */ new Date();
          d.setHours(parseInt(todayMatch[1]), parseInt(todayMatch[2]), 0, 0);
          eventMs = d.getTime();
        }
      }
      if (eventMs !== null) {
        const mins2 = (eventMs - now) / 6e4;
        if (mins2 >= -5 && (closestMinutes === null || mins2 < closestMinutes)) {
          closestMinutes = mins2;
          closestName = ev.event;
        }
      }
    } catch {
    }
  }
  if (closestMinutes === null || closestMinutes < -5) {
    return { minutesToNext: null, eventName: null, isBlocked: false, isWarning: false, summary: "" };
  }
  const mins = Math.round(closestMinutes);
  const isBlocked = mins < blockThresholdMinutes;
  const isWarning = mins < 60;
  const summary = isBlocked ? `\u26D4 ${closestName} in ${mins} min \u2014 BLOCKED (within ${blockThresholdMinutes}-min prop firm news window)` : isWarning ? `\u26A0 ${closestName} in ${mins} min \u2014 CAUTION: reduce size and tighten SL` : "";
  return { minutesToNext: mins, eventName: closestName, isBlocked, isWarning, summary };
}
function detectWeekendRolloverRisk() {
  const now = /* @__PURE__ */ new Date();
  const jan = new Date(now.getFullYear(), 0, 1);
  const jul = new Date(now.getFullYear(), 6, 1);
  const isDST = now.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  const nyOffset = isDST ? -4 : -5;
  const nyMs = now.getTime() + (now.getTimezoneOffset() + nyOffset * 60) * 6e4;
  const nyDate = new Date(nyMs);
  const nyDay = nyDate.getDay();
  const nyHour = nyDate.getHours();
  const nyMin = nyDate.getMinutes();
  const isFridayPM = nyDay === 5 && nyHour >= 16;
  const minutesToRollover = Math.max(0, 17 * 60 - (nyHour * 60 + nyMin));
  const isNearRollover = minutesToRollover <= 15 && minutesToRollover >= 0 && nyDay >= 1 && nyDay <= 5;
  let warning = null;
  if (isFridayPM) {
    warning = `\u26A0 WEEKEND HOLD RISK: It is Friday ${nyHour}:${String(nyMin).padStart(2, "0")} NY time \u2014 most prop firms prohibit holding positions over the weekend. If this trade cannot reach TP before Friday 5 PM NY, REDUCE size or skip entirely.`;
  } else if (isNearRollover) {
    warning = `\u26A0 ROLLOVER WARNING: 5 PM NY rollover in ${minutesToRollover} minutes \u2014 swap charges apply. Consider reducing trail width to TIGHT.`;
  }
  return { isFridayPM, isNearRollover, minutesToRollover, warning };
}
function detectMarketRegime(indicators) {
  const adx = indicators?.adx?.value ?? (typeof indicators?.adx === "number" ? indicators.adx : null);
  if (adx == null || !Number.isFinite(adx)) {
    return { regime: "TRANSITIONAL", adx: null, reason: "ADX unavailable \u2014 treat as transitional" };
  }
  if (adx >= 25) return { regime: "TRENDING", adx, reason: `ADX ${adx.toFixed(1)} \u2265 25 \u2014 trending/impulsive` };
  if (adx < 20) return { regime: "RANGING", adx, reason: `ADX ${adx.toFixed(1)} < 20 \u2014 ranging/mean-reverting` };
  return { regime: "TRANSITIONAL", adx, reason: `ADX ${adx.toFixed(1)} in 20\u201325 \u2014 transitional` };
}
function setAdaptiveRegimeEnabled(userId, enabled) {
  adaptiveRegimeEnabledMap.set(userId, enabled);
}
function isAdaptiveRegimeEnabled(userId) {
  return adaptiveRegimeEnabledMap.get(userId) ?? false;
}
function hydrateAdaptiveRegimeMap(userId, enabled) {
  adaptiveRegimeEnabledMap.set(userId, enabled);
}
function buildRegimeAdaptationSection(regime, adx, strategyMode) {
  const isSniperFamily = strategyMode === "sniper" || strategyMode === "prop_firm_sniper";
  if (!isSniperFamily) return "";
  const adxStr = adx != null ? adx.toFixed(1) : "n/a";
  if (regime === "RANGING") {
    return `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F9ED} ADAPTIVE REGIME: RANGING (ADX ${adxStr})
\u26A0\uFE0F PRECEDENCE: this ADAPTIVE REGIME block OVERRIDES any earlier rule in the
strategy filter that says "BOS/CHOCH must be confirmed" or "no ranging market
entries." When the two conflict, follow THIS block \u2014 do NOT reject a valid
range-reversal setup just because no BOS/CHOCH is present.
The market is RANGE-BOUND, not trending. In a range, waiting for a Break of
Structure is WRONG \u2014 the highest-quality range trade is a REVERSAL at the edge.
OVERRIDE the sniper's trending rules as follows:
\u2022 BOS/CHOCH is NO LONGER required (do not reject for "no BOS/CHOCH \u2014 ranging").
\u2022 ICT macro window is a bonus, NOT a hard requirement.
Instead, CONFIRM only if ALL of these range-reversal criteria are met:
1. Price is AT or sweeping a VALIDATED range extreme \u2014 support/resistance,
   PDH/PDL, or equal highs/lows (BUY at range low, SELL at range high ONLY).
2. A fresh Order Block OR Fair Value Gap sits at that extreme in the trade direction.
3. A rejection signal is present: liquidity sweep of the extreme + close back
   inside, RSI extreme (>70 for SELL, <30 for BUY), or bullish/bearish engulf.
4. Target is the OPPOSITE range boundary; R:R must be >= 1:2 (ranges give tighter targets than trends).
REJECT if price is in the MIDDLE of the range (no edge), or the setup is trading
INTO the range boundary rather than reversing off it (that's chop = no trade).
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`;
  }
  if (regime === "TRENDING") {
    return `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F9ED} ADAPTIVE REGIME: TRENDING (ADX ${adxStr})
Impulsive/trending conditions confirmed \u2014 the FULL sniper breakout rules apply:
BOS/CHOCH is REQUIRED, favor continuation in the trend direction, and treat
counter-trend reversals as LOW quality unless a CHOCH confirms the shift.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`;
  }
  return `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F9ED} ADAPTIVE REGIME: TRANSITIONAL (ADX ${adxStr})
\u26A0\uFE0F PRECEDENCE: this block OVERRIDES any earlier "BOS/CHOCH must be confirmed /
no ranging entries" hard rule in the strategy filter \u2014 follow the guidance here.
Neither cleanly trending nor ranging. Demand EXTRA confirmation: either a
confirmed BOS/CHOCH (trend path) OR a clean range-edge reversal with OB/FVG +
sweep (range path). If the setup fits neither cleanly, REJECT \u2014 no forcing.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`;
}
function buildStrategyFilterSection(strategyMode) {
  if (!strategyMode || strategyMode === "aggressive") return "";
  const filters = {
    sniper: `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F3AF} ACTIVE STRATEGY FILTER: SNIPER MODE
Your job is to confirm ONLY the highest-quality setups. Apply all of the following as hard requirements:
1. BOS or CHOCH must be CONFIRMED on the trading timeframe (no confirmation = REJECT)
2. Entry must be AT or INSIDE an Order Block, Fair Value Gap, or OTE zone (61.8\u201378.6% retrace)
3. ICT macro window must be ACTIVE (NY 8:30\u201311:00 or 13:30\u201316:00, London 7:00\u201310:00 UTC)
4. At least 2 higher timeframes must align with the trade direction
5. R:R must be >= 1:3. If TP gives less than 3\xD7 the SL distance, REJECT.
6. Minimum 3 independent confluences (OB + FVG + multi-TF counts as 3)
If ANY of these 6 criteria is missing, your verdict must be REJECT.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`,
    ict_order_blocks: `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F3AF} ACTIVE STRATEGY FILTER: ICT ORDER BLOCKS
You are ONLY confirming Order Block entries. Apply these rules:
1. There must be a clear Order Block visible (last bullish candle before bearish displacement for SELL OBs, last bearish candle before bullish displacement for BUY OBs)
2. Price must currently be RETURNING to the OB zone (retrace/pull-back, not continuation)
3. The OB must be from a structural move \u2014 a BOS or significant displacement
4. OB must be UNMITIGATED (price has not fully traded through it before)
5. Look in smcContext for orderBlocks array \u2014 if none are detected, confidence should be < 50
If no valid Order Block is present in the data, REJECT with low confidence.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`,
    ict_fvg: `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F3AF} ACTIVE STRATEGY FILTER: ICT FAIR VALUE GAP (FVG)
You are ONLY confirming Fair Value Gap entries. Rules:
1. An active, unfilled FVG must exist in the direction of the trade (bullish FVG for BUY, bearish FVG for SELL)
2. Price must currently be ENTERING or sitting INSIDE the FVG zone
3. Check smcContext.fairValueGaps \u2014 if none detected, significantly lower confidence
4. A FVG created after a BOS/CHOCH is the highest quality
5. FVG entries against the HTF trend are LOW quality \u2014 require multi-TF alignment
6. Partial fills of FVG are allowed if other confluences agree
If no FVG is present in the candle data or smcContext, REJECT.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`,
    ict_liquidity_sweep: `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F3AF} ACTIVE STRATEGY FILTER: ICT LIQUIDITY SWEEP
You are confirming stop-hunt / liquidity sweep reversals. Rules:
1. There MUST be a visible sweep of equal highs (for SELL) or equal lows (for BUY) within the last 10 candles
2. The sweep candle should show a wick through the level with a close back inside the range (stop hunt anatomy)
3. After the sweep, look for a reversal confirmation: engulfing candle, BOS on LTF, displacement
4. Check ictContext for stopHuntData \u2014 a sweep without confirmation is a fake-out risk
5. The swept level should be a resting liquidity pool (prior swing highs/lows, equal highs/lows)
6. Do NOT confirm if the sweep is WITH the trend (continuation sweeps have lower probability)
If no liquidity sweep is detectable, REJECT.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`,
    ict_bos: `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F3AF} ACTIVE STRATEGY FILTER: ICT BREAK OF STRUCTURE (BOS)
You are confirming BOS continuation entries. Rules:
1. A clear BOS must have occurred recently \u2014 price took out a prior swing high (bullish BOS for BUY) or swing low (bearish BOS for SELL)
2. After the BOS, price should be pulling back (retracing) \u2014 entry is on the PULLBACK, not on the initial BOS candle
3. Ideal entry: pullback to 50% retracement of the BOS leg, OB or FVG within that zone
4. Check smcContext for bos/choch detection
5. A CHOCH (Change of Character) without a BOS confirmation = lower quality, reduce confidence
6. BOS entries aligned with HTF trend = highest quality
If no BOS is detected in smcContext, confidence must be below 55.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`,
    ict_ote: `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F3AF} ACTIVE STRATEGY FILTER: ICT OPTIMAL TRADE ENTRY (OTE)
You are confirming OTE zone entries. Rules:
1. A clear swing structure must exist \u2014 identify the recent swing high and swing low
2. For BUY: price must be in the 61.8\u201378.6% Fibonacci retracement zone of the most recent bullish swing
   For SELL: price must be in the 61.8\u201378.6% zone of the most recent bearish swing
3. Check indicators.fibonacci \u2014 the OTE zone is typically between fib 0.618 and 0.786
4. ICT macro timing is critical for OTE \u2014 confirm the ICT macro window is active
5. HTF must show the trend direction aligned with the OTE entry
6. OTE without HTF alignment = WATCH only, not CONFIRM
If price is NOT in the 61.8\u201378.6% zone, REJECT.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`,
    smc_demand_supply: `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F3AF} ACTIVE STRATEGY FILTER: SMC DEMAND/SUPPLY ZONES
You are confirming supply and demand zone entries. Rules:
1. There must be a clear supply zone (for SELL) or demand zone (for BUY) visible in the chart
2. Price should be RETURNING to a fresh (unmitigated) zone
3. A valid supply zone = a sharp departure (displacement) from a consolidation or base
4. Check smcContext for orderBlocks and supplyDemandZones
5. Zones that have been tested once are lower quality; fresh zones (first touch) are highest quality
6. Zone + BOS confirmation on the candle at the zone = highest quality entry
7. Entering mid-zone or on the far edge of a zone = reduced quality
If no supply/demand zone is present at the current price, REJECT.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`,
    session_breakout: `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F3AF} ACTIVE STRATEGY FILTER: SESSION BREAKOUT
You are confirming session open breakout trades only. Rules:
1. Trade MUST be during or immediately after the London open (06:00\u201309:00 UTC) or NY open (12:30\u201315:00 UTC)
2. A pre-session consolidation range must exist \u2014 price was ranging during Asian or pre-London session
3. Check breakoutDetection data \u2014 breakoutDetected must be true or approachingBreakout must be true
4. Volume confirmation (volumeConfirmed=true) greatly increases quality
5. The breakout direction must align with the HTF trend for highest quality
6. Counter-trend breakouts require extra confluence (at minimum 3 factors agreeing)
7. False breakout risk: if price breaks then immediately retraces 50%+ of breakout move, do NOT confirm
If breakoutDetection.isBreakoutWindow is false or no session breakout is detected, REJECT.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`,
    momentum: `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F3AF} ACTIVE STRATEGY FILTER: MOMENTUM SURFING
You are confirming momentum-driven trend entries. Rules:
1. ADX must be > 25 (trending market). ADX < 20 = ranging = avoid
2. MACD histogram must be in the signal direction AND trending (growing, not shrinking)
3. RSI must be 50\u201370 for BUY momentum, 30\u201350 for SELL momentum (not overbought/oversold)
4. Multiple EMAs should be fanned out in the direction of the trade
5. Price should be making higher highs + higher lows (for BUY) or lower highs + lower lows (for SELL)
6. Entry on a brief pullback to EMA support/resistance, NOT on a continuation extension
7. AVOID momentum entries if RSI is > 75 (BUY) or < 25 (SELL) \u2014 overextended
If ADX < 20 or RSI is extreme, REJECT.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`,
    scalping: `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F3AF} ACTIVE STRATEGY FILTER: SCALPING / HFT
You are confirming short-duration scalp trades. Rules:
1. Target is 3\u201310 pips. R:R can be as low as 1:1 if win rate is high
2. SL must be tight \u2014 no wider than 10\u201315 pips for major pairs
3. Look for micro-structure: quick LTF (M1/M5) momentum confirmations
4. RSI reversals from extremes (> 70 or < 30) are valid scalp signals
5. Avoid scalping during low-liquidity periods (Asian session for major USD pairs) unless there is clear range-bound movement
6. High-impact news within 30 minutes = DO NOT scalp (spreads widen, stops get hunted)
7. MACD histogram reversal on the trading timeframe is a valid entry signal
This is a volume strategy \u2014 multiple entries per session are expected.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`,
    asia_range_breakout: `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F3AF} ACTIVE STRATEGY FILTER: ASIA RANGE BREAKOUT
You are confirming breakouts of the Asian session price range. Rules:
1. The Asian session (00:00\u201307:00 UTC) must have established a consolidation range
2. Price must be breaking OUT of that range (above the Asia high for BUY, below the Asia low for SELL)
3. Check breakoutDetection.session \u2014 should indicate Asian range context
4. The breakout should occur at or after the London open for maximum liquidity
5. Volume expansion on the breakout candle = high quality
6. The Asia range should be at least 10 pips for meaningful breakout
7. Avoid if the range was very wide (> 50 pips for majors) \u2014 larger ranges have higher false-breakout rate
If no Asian range context is detected, REJECT.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`,
    vwap_mean_reversion: `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F3AF} ACTIVE STRATEGY FILTER: VWAP MEAN REVERSION
You are confirming mean-reversion entries back toward VWAP. Rules:
1. Price must be SIGNIFICANTLY extended from VWAP \u2014 at least 0.5\xD7 ATR away
2. For BUY: price must be BELOW VWAP, extended, showing reversal signs
   For SELL: price must be ABOVE VWAP, extended, showing reversal signs
3. RSI divergence (price makes new extreme but RSI doesn't) = high quality signal
4. Look for rejection candles at the extended zone before entry
5. This is a counter-trend strategy \u2014 require extra confirmation (engulfing, pin bar at S/R)
6. Do NOT use VWAP mean reversion in strongly trending markets (ADX > 35) \u2014 trend will fight against reversion
7. Best timeframe: M15\u2013H1. Very short timeframes have too much noise.
If VWAP data is missing or price is near VWAP (within 0.3\xD7 ATR), REJECT.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`,
    prop_firm_sniper: `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F3AF} ACTIVE STRATEGY FILTER: PROP FIRM SNIPER (MAXIMUM PROTECTION)
You are operating under STRICT prop firm rules. ALL of the following are required:
1. R:R MINIMUM 1:3 \u2014 TP must be 3\xD7 the SL distance. Less than 1:3 = immediate REJECT
2. ICT macro window MUST be active (no off-hours trading)
3. BOS/CHOCH MUST be confirmed \u2014 no ranging market entries
4. Entry MUST be at OB or FVG \u2014 no "middle of nowhere" entries
5. Multi-TF alignment: at LEAST 2 higher timeframes agree
6. No high-impact news within 30 minutes \u2014 hard rule
7. Maximum confidence threshold: only CONFIRM if your confidence is > 75%
8. No counter-trend trades (check HTF bias \u2014 must align)
This is the most conservative filter. Reject anything that isn't a near-perfect setup.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`
  };
  return filters[strategyMode] || `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F4CB} ACTIVE STRATEGY: ${strategyMode.toUpperCase().replace(/_/g, " ")}
Apply the rules appropriate for this strategy when evaluating the trade. Prioritize setups that align with the ${strategyMode} methodology.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`;
}
async function buildConfirmationPrompt(candleData, indicators, proposedSignal, proposedConfidence, tradePlan, symbol, timeframe, newsContext, ictContext, smcContext, htfLevels, propFirmContext, performanceStats, learnedInsights, userId, strategyMode) {
  const strategyCtx = await getStrategyContext(symbol).catch(() => null);
  const strategySection = strategyCtx ? formatStrategyContextForPrompt(strategyCtx) : "";
  const learnedSection = learnedInsights || "";
  let winningPatternsSection = "";
  try {
    if (userId) {
      const winPatterns = await getWinningStrategyPatterns(userId);
      if (winPatterns && !winPatterns.includes("No significant")) {
        winningPatternsSection = `

## Your Historically Winning Patterns (from your trade brain)
Prioritise setups that match these \u2014 they have proven profitable in your account:
${winPatterns}
`;
      }
    }
  } catch {
  }
  const strategyContext = getRelevantStrategies(symbol);
  const recentCandles = candleData.slice(0, 30);
  const candleSummary = recentCandles.map(
    (c, i) => `[${i}] O:${c.o} H:${c.h} L:${c.l} C:${c.c} V:${c.v || 0}`
  ).join("\n");
  const trailSignalSummary = buildTrailSignalSummary(symbol, proposedSignal, tradePlan, ictContext, smcContext);
  const confluenceResult = computeConfluenceScore(proposedSignal, ictContext, smcContext);
  const coreIndicators = {};
  const advancedIndicators = {};
  if (indicators) {
    const advancedKeys = ["adx", "stochastic", "vwap", "obv", "pivotPoints", "fibonacci", "supportResistance", "candlePatterns", "swingPoints", "sessionContext", "volatilityContext", "volumeProfile", "breakoutDetection"];
    for (const [key, val] of Object.entries(indicators)) {
      if (advancedKeys.includes(key)) advancedIndicators[key] = val;
      else coreIndicators[key] = val;
    }
  }
  const coreStr = JSON.stringify(coreIndicators, null, 2);
  const advStr = Object.keys(advancedIndicators).length > 0 ? JSON.stringify(advancedIndicators, null, 2) : "";
  let newsSection = "";
  if (newsContext) {
    const parts = [];
    if (newsContext.sentiment) {
      parts.push(`NEWS SENTIMENT: ${newsContext.sentiment.overallLabel?.toUpperCase() || "NEUTRAL"} (score: ${newsContext.sentiment.overallScore || 0}/100)`);
      parts.push(`Bullish articles: ${newsContext.sentiment.bullishCount || 0} | Bearish: ${newsContext.sentiment.bearishCount || 0} | Neutral: ${newsContext.sentiment.neutralCount || 0}`);
      if (newsContext.sentiment.tradingImplication) {
        parts.push(`Trading Implication: ${newsContext.sentiment.tradingImplication}`);
      }
      if (newsContext.sentiment.pairDirection) {
        parts.push(`Pair Direction from News: ${newsContext.sentiment.pairDirection}`);
      }
    }
    if (newsContext.topHeadlines && newsContext.topHeadlines.length > 0) {
      parts.push(`
Recent Headlines:`);
      newsContext.topHeadlines.slice(0, 5).forEach((h, i) => parts.push(`  ${i + 1}. ${h}`));
    }
    if (newsContext.upcomingEvents && newsContext.upcomingEvents.length > 0) {
      parts.push(`
UPCOMING ECONOMIC EVENTS (potential volatility):`);
      newsContext.upcomingEvents.slice(0, 5).forEach((e) => {
        const timeUntil = e.daysUntil === 0 ? "TODAY" : e.daysUntil === 1 ? "TOMORROW" : `in ${e.daysUntil} days`;
        parts.push(`  - [${e.impact?.toUpperCase()}] ${e.event} (${e.currency}) - ${timeUntil} at ${e.timeFormatted || "TBD"}`);
        if (e.potentialImpact) parts.push(`    Impact: ${e.potentialImpact}`);
      });
    }
    if (newsContext.marketNarrative) {
      parts.push(`
VEDD WEEKLY MARKET BRIEFING (from this week's community research \u2014 context only, not a trade signal):`);
      parts.push(`  ${newsContext.marketNarrative}`);
    }
    if (parts.length > 0) {
      newsSection = `
NEWS & ECONOMIC EVENTS CONTEXT:
${parts.join("\n")}`;
    }
  }
  let propFirmSection = "";
  let newsProximityAlert = "";
  let computedRiskPct = 0;
  let remainingDailyBuffer = 0;
  if (propFirmContext?.enabled) {
    const blockMins = propFirmContext.newsBlockMinutes || 15;
    const newsProx = computeNewsProximity(newsContext?.upcomingEvents, blockMins);
    if (newsProx.isBlocked) {
      newsProximityAlert = `
${"\u2550".repeat(47)}
\u26D4 NEWS PROXIMITY ALERT \u2014 ${newsProx.eventName} in ${newsProx.minutesToNext} minutes
PROP FIRM RULE: DO NOT ENTER. High-impact news within ${blockMins}-min block window. REJECT this trade.
${"\u2550".repeat(47)}`;
    } else if (newsProx.isWarning && newsProx.summary) {
      newsProximityAlert = `
\u26A0 NEWS WARNING: ${newsProx.summary}`;
    }
    const weekendRisk = detectWeekendRolloverRisk();
    const weekendWarning = weekendRisk.warning || "";
    remainingDailyBuffer = propFirmContext.maxDailyDrawdownPct + propFirmContext.currentDailyPnlPct;
    const totalBuffer = propFirmContext.maxTotalDrawdownPct + propFirmContext.currentTotalPnlPct;
    let drawdownAlert = "";
    if (remainingDailyBuffer < 0.5) {
      drawdownAlert = `
\u26D4 DAILY LIMIT CRITICAL: Only ${remainingDailyBuffer.toFixed(2)}% daily buffer remaining \u2014 DO NOT TRADE. One more loss hits the daily limit.`;
    } else if (remainingDailyBuffer < 1.5) {
      drawdownAlert = `
\u26A0 DAILY BUFFER LOW: Only ${remainingDailyBuffer.toFixed(2)}% remaining \u2014 micro lot only or skip this trade.`;
    }
    if (tradePlan?.entry && tradePlan?.stopLoss && tradePlan?.lotSize && propFirmContext.accountBalance > 0) {
      const pipSize = symbol.includes("JPY") ? 0.01 : symbol.includes("XAU") || symbol.includes("GOLD") ? 0.1 : 1e-4;
      const pipDist = Math.abs(tradePlan.entry - tradePlan.stopLoss) / pipSize;
      const pipValuePerLot = symbol.includes("JPY") ? 1e3 : symbol.includes("XAU") || symbol.includes("GOLD") ? 10 : 10;
      const dollarRisk = pipDist * pipValuePerLot * tradePlan.lotSize;
      computedRiskPct = dollarRisk / propFirmContext.accountBalance * 100;
    }
    const riskWarning = computedRiskPct > 2 ? `
\u26A0 RISK WARNING: Estimated trade risk is ${computedRiskPct.toFixed(2)}% of account \u2014 exceeds the 2% prop firm guideline.` : "";
    propFirmSection = `
${"\u2550".repeat(19)} PROP FIRM COMPLIANCE ${"\u2550".repeat(19)}
Firm preset: ${propFirmContext.firmPreset}
Daily P&L: ${propFirmContext.currentDailyPnlPct.toFixed(2)}% | Buffer remaining: ${remainingDailyBuffer.toFixed(2)}% of ${propFirmContext.maxDailyDrawdownPct}% limit
Total P&L: ${propFirmContext.currentTotalPnlPct.toFixed(2)}% | Total buffer: ${totalBuffer.toFixed(2)}% of ${propFirmContext.maxTotalDrawdownPct}% limit
Intended risk/trade: ${propFirmContext.riskPerTradePct}% | Estimated actual risk: ${computedRiskPct > 0 ? computedRiskPct.toFixed(2) + "%" : "N/A"}
News block window: ${blockMins} min | Overnight holds: ${propFirmContext.allowOvernightHolds} | Weekend holds: ${propFirmContext.allowWeekendHolds}${drawdownAlert}${riskWarning}${weekendWarning ? "\n" + weekendWarning : ""}
\u26A0 Apply prop firm rules 12\u201317 STRICTLY. A failed challenge cannot be recovered. When in doubt, REJECT.
${"\u2550".repeat(59)}`;
  }
  let smcSection = "";
  if (smcContext) {
    const { bosCHOCH, fvg, orderBlock, equalHighsLows, wyckoff } = smcContext;
    const lines = [];
    lines.push(`SMC / SMART MONEY CONCEPTS ANALYSIS:`);
    if (bosCHOCH.detected) {
      const icon = bosCHOCH.direction === "BULLISH" ? "\u2705" : bosCHOCH.direction === "BEARISH" ? "\u2705" : "\u26A0\uFE0F";
      lines.push(`\u25BA Structure (${bosCHOCH.type}): ${bosCHOCH.description} ${icon}`);
    } else {
      lines.push(`\u25BA Structure: No BOS/CHOCH \u2014 price still within prior range, no clear directional break \u26A0\uFE0F`);
    }
    if (fvg.detected) {
      const inZoneStr = fvg.inZone ? " \u26A1 PRICE IN ZONE" : "";
      lines.push(`\u25BA Fair Value Gap (FVG): ${fvg.description}${inZoneStr} \u2705`);
    } else {
      lines.push(`\u25BA Fair Value Gap: No aligned FVG detected \u2014 entry not anchored to an imbalance zone \u26A0\uFE0F`);
    }
    if (orderBlock.detected) {
      const mitLabel = orderBlock.mitigation ? ` | ${orderBlock.mitigation} (${orderBlock.mitigationCount || 0} test${orderBlock.mitigationCount !== 1 ? "s" : ""})` : "";
      const mitIcon = orderBlock.mitigation === "FRESH" ? "\u2705" : orderBlock.mitigation === "FULLY_MITIGATED" ? "\u26A0\uFE0F" : "\u2705";
      lines.push(`\u25BA Order Block: ${orderBlock.description}${mitLabel} ${mitIcon}`);
    } else {
      lines.push(`\u25BA Order Block: No order block or breaker block detected for this direction \u26A0\uFE0F`);
    }
    const ehLine = equalHighsLows.equalHighs.detected ? `Equal Highs at ~${equalHighsLows.equalHighs.level?.toFixed(5)} (BSL above)` : "No equal highs";
    const elLine = equalHighsLows.equalLows.detected ? `Equal Lows at ~${equalHighsLows.equalLows.level?.toFixed(5)} (SSL below)` : "No equal lows";
    lines.push(`\u25BA Liquidity Map: ${ehLine} | ${elLine}`);
    if (smcContext.liquidityTargets) {
      const lt = smcContext.liquidityTargets;
      lines.push(`\u25BA Liquidity Targets: ${lt.description}`);
      lines.push(`  Internal: ${lt.internalTarget.description}`);
      lines.push(`  External: ${lt.externalTarget.description}`);
    }
    if (wyckoff.detected) {
      const wIcon = wyckoff.aligns ? "\u2705" : "\u26A0\uFE0F";
      lines.push(`\u25BA Wyckoff Phase: ${wyckoff.description} ${wIcon}`);
    } else {
      lines.push(`\u25BA Wyckoff: No clear accumulation/distribution phase detected`);
    }
    smcSection = `
${lines.join("\n")}`;
  }
  let ictSection = "";
  if (ictContext) {
    const mw = ictContext.macroWindow;
    const pd = ictContext.premiumDiscount;
    const sh = ictContext.stopHunt;
    const crt = ictContext.crtPattern;
    const sess = mw.session || "UNKNOWN";
    const macroLine = mw.isInMacroWindow ? `ACTIVE \u2014 ${mw.macroName} \u2705` : `INACTIVE \u2014 next: ${mw.nextMacroName} in ${mw.minutesUntilNextMacro}min \u26A0\uFE0F`;
    const pdAlignIcon = pd.aligns ? "\u2705 ALIGNS" : "\u274C CONFLICTS";
    const shLine = sh.detected ? `DETECTED \u2014 ${sh.description} \u2705` : `NOT DETECTED \u2014 no liquidity sweep in last 6 candles \u26A0\uFE0F`;
    const crtLine = crt.detected ? `${crt.direction} CRT (${crt.stage}) \u2014 ${crt.description}` : "No CRT pattern detected";
    const ictLines = [
      `ICT "ONE SETUP FOR LIFE" FRAMEWORK (NY Time: ${mw.currentNYTime} | Session: ${sess}):`,
      `\u25BA Macro Window: ${macroLine}`,
      `\u25BA PD Array: ${pd.zone} zone (${pd.percentile}th percentile) \u2014 ${pdAlignIcon} with ${proposedSignal} signal`,
      `  Range: ${pd.rangeLow.toFixed(5)}\u2013${pd.rangeHigh.toFixed(5)} | Equilibrium: ${pd.equilibrium.toFixed(5)}`,
      `\u25BA Stop Hunt / Liquidity Sweep: ${shLine}`,
      `\u25BA CRT Pattern: ${crtLine}`
    ];
    if (ictContext.asianRange?.detected) {
      ictLines.push(`\u25BA Asian Range: ${ictContext.asianRange.description}`);
    }
    if (ictContext.keyLevels) {
      const kl = ictContext.keyLevels;
      ictLines.push(`\u25BA KEY REFERENCE LEVELS (ICT Draw on Liquidity):`);
      if (kl.pdHigh !== null) ictLines.push(`  Previous Day High (PDH): ${kl.pdHigh.toFixed(5)} ${kl.abovePDH ? "\u2190 price ABOVE PDH (bearish draw, HTF resistance)" : "\u2190 price below PDH (potential BSL target above)"}`);
      if (kl.pdLow !== null) ictLines.push(`  Previous Day Low (PDL): ${kl.pdLow.toFixed(5)} ${kl.belowPDL ? "\u2190 price BELOW PDL (bearish, continuation down)" : "\u2190 price above PDL (potential SSL target below)"}`);
      if (kl.pwHigh !== null) ictLines.push(`  Previous Week High (PWH): ${kl.pwHigh.toFixed(5)}`);
      if (kl.pwLow !== null) ictLines.push(`  Previous Week Low (PWL): ${kl.pwLow.toFixed(5)}`);
      ictLines.push(`  \u2192 These are MAGNET levels \u2014 price is drawn to PDH/PDL/PWH/PWL regardless of LTF signals. Factor into TP and bias.`);
    }
    if (ictContext.oteZone?.detected) {
      const ote = ictContext.oteZone;
      const inZoneIcon = ote.inOTEZone ? "\u2705" : "\u26A0\uFE0F";
      ictLines.push(`\u25BA OTE ZONE (Optimal Trade Entry \u2014 61.8\u201379% retracement): ${inZoneIcon}`);
      ictLines.push(`  Swing: ${ote.swingLow?.toFixed(5)} \u2192 ${ote.swingHigh?.toFixed(5)}`);
      ictLines.push(`  OTE zone: ${ote.ote79?.toFixed(5)} \u2013 ${ote.ote618?.toFixed(5)} | Sweet spot (70.5%): ${ote.ote705?.toFixed(5)}`);
      ictLines.push(`  ${ote.inOTEZone ? "\u2705 Price IS in OTE zone \u2014 institutional entry sweet spot, maximum probability entry" : `\u26A0 Price at ${ote.currentPrice.toFixed(5)} NOT in OTE zone \u2014 entry is outside the 61.8\u201379% retracement window`}`);
    }
    ictSection = `
${ictLines.join("\n")}`;
  }
  let htfSection = "";
  if (htfLevels && htfLevels.length > 0) {
    try {
      const { detectBOSCHOCH: detectBOSCHOCH2, detectWyckoff: detectWyckoff2 } = (init_smcUtils(), __toCommonJS(smcUtils_exports));
      const { getPremiumDiscountContext: getPremiumDiscountContext2 } = (init_ictMacroUtils(), __toCommonJS(ictMacroUtils_exports));
      const tfLabels = {
        "5min": "M5",
        "15min": "M15",
        "1h": "H1",
        "4h": "H4",
        "1day": "D1",
        "1week": "W1",
        "1m": "M1",
        "5m": "M5",
        "15m": "M15",
        "30m": "M30",
        "1d": "D1",
        "1w": "W1"
      };
      const levelResults = [];
      for (let i = 0; i < htfLevels.length; i++) {
        const level = htfLevels[i];
        if (!level.candles || level.candles.length < 10) continue;
        const tfLabel = tfLabels[level.timeframe] || level.timeframe.toUpperCase();
        const role = level.role || (i === 0 ? "INTERMEDIATE" : "MACRO");
        const bosResult = detectBOSCHOCH2(level.candles, proposedSignal);
        const entry = tradePlan?.entry || level.candles[0]?.c || 0;
        const pdResult = getPremiumDiscountContext2(entry, level.candles, proposedSignal);
        const wyckoffResult = detectWyckoff2(level.candles);
        const bosAligns = !bosResult.detected || (proposedSignal === "BUY" && bosResult.direction === "BULLISH" || proposedSignal === "SELL" && bosResult.direction === "BEARISH");
        const pdConflicts = !pdResult.aligns && pdResult.zone !== "EQUILIBRIUM";
        const aligns = bosAligns && !pdConflicts;
        const recentCloses = level.candles.slice(0, 10).map((c) => c.c);
        const sma = recentCloses.reduce((s, v) => s + v, 0) / recentCloses.length;
        const trendDirection = recentCloses[0] > sma * 1.001 ? "BULLISH" : recentCloses[0] < sma * 0.999 ? "BEARISH" : "NEUTRAL";
        levelResults.push({ label: role, tf: tfLabel, trendDirection, aligns, bosCHOCH: bosResult, pd: pdResult, wyckoff: wyckoffResult });
      }
      if (levelResults.length > 0) {
        const blocks = levelResults.map((lr) => {
          const alignFlag = lr.aligns ? "\u2705 ALIGNS with signal" : "\u26A0 CONFLICTS with signal";
          return `\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 ${lr.tf} ${lr.label} BIAS \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
Trend Direction: ${lr.trendDirection} (${lr.tf} 10-candle SMA crossover)
Structure: ${lr.bosCHOCH.detected ? lr.bosCHOCH.description : `No clear BOS/CHOCH on ${lr.tf} \u2014 ranging context`}
Premium/Discount: ${lr.pd.description}
Wyckoff: ${lr.wyckoff.detected ? lr.wyckoff.description : `No Wyckoff phase on ${lr.tf}`}
${lr.tf} Verdict: ${alignFlag}
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`;
        });
        const allAlign = levelResults.every((lr) => lr.aligns);
        const noneAlign = levelResults.every((lr) => !lr.aligns);
        let crossLevelSummary;
        if (allAlign) {
          crossLevelSummary = `\u2705 MULTI-TF ALIGNMENT: All ${levelResults.length + 1} timeframes (${timeframe} + ${levelResults.map((lr) => lr.tf).join(" + ")}) AGREE \u2014 high-conviction institutional setup. Full size allowed.`;
        } else if (noneAlign) {
          crossLevelSummary = `\u{1F6A8} MULTI-TF CONFLICT: ${proposedSignal} on ${timeframe} CONFLICTS with ALL higher timeframes (${levelResults.map((lr) => lr.tf).join(" + ")}). This is a counter-trend fade against the macro structure. REJECT unless overwhelming LTF confluence.`;
        } else {
          const conflicting = levelResults.filter((lr) => !lr.aligns).map((lr) => lr.tf);
          const aligned = levelResults.filter((lr) => lr.aligns).map((lr) => lr.tf);
          crossLevelSummary = `\u26A0 PARTIAL MULTI-TF ALIGNMENT: ${aligned.join(", ")} support${aligned.length === 1 ? "s" : ""} the signal, but ${conflicting.join(", ")} conflict${conflicting.length === 1 ? "s" : ""}. Reduce position size and require extra LTF confluence.`;
        }
        htfSection = "\n" + blocks.join("\n\n") + `

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 CROSS-TIMEFRAME VERDICT \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
${crossLevelSummary}
\u26A0 RULE: LTF signals must align with HTF structure. Trading against HTF bias requires significantly more LTF confluence.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`;
      }
    } catch (htfErr) {
      htfSection = "";
    }
  }
  const confluenceHeader = `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
CONFLUENCE SCORE: ${confluenceResult.score}/${confluenceResult.maxScore} \u2014 Grade ${confluenceResult.grade}
${confluenceResult.summary.join("\n")}
Grade guide: A+ (10-12) = ELITE | A (8-9) = HIGH | B (6-7) = MODERATE | C (4-5) = LOW | D (0-3) = POOR
Grade D \u2192 avoid. Grade A/A+ \u2192 high conviction trade.
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`;
  const _regimeSection = userId && isAdaptiveRegimeEnabled(userId) ? (() => {
    const r = detectMarketRegime(indicators);
    return buildRegimeAdaptationSection(r.regime, r.adx, strategyMode);
  })() : "";
  return {
    system: "You are a master trader who speaks with street knowledge and the wisdom of Supreme Mathematics \u2014 Gods and Earths style. You build and destroy with the science of trading, dropping jewels and keeping it real. Your analysis is sharp, your reasoning is laced with knowledge of self and mathematical precision. You reference concepts like Knowledge (1), Wisdom (2), Understanding (3), Culture (4), Power (5), Equality (6), God (7), Build/Destroy (8), Born (9), and Cipher (0) naturally when they fit. You say things like 'the chart is showing and proving', 'peace \u2014 the math don't lie', 'this is a cipher of accumulation', 'knowledge this pattern God', 'the wisdom here is...', 'we building or we destroying?', etc. Keep it concise, authentic, and never forced \u2014 the science comes first, the flavor is the delivery. You provide honest, unbiased second opinions on trade signals using ALL available data including news sentiment and upcoming economic events. Always return valid JSON.",
    user: `You are an elite trading analyst providing a SECOND OPINION on a proposed trade. Use ALL data below for maximum accuracy.
${buildStrategyFilterSection(strategyMode)}${_regimeSection}${htfSection}${newsProximityAlert}${propFirmSection}${confluenceHeader}

SYMBOL: ${symbol}
TIMEFRAME: ${timeframe}

PROPOSED SIGNAL: ${proposedSignal} with ${proposedConfidence}% confidence
PROPOSED TRADE PLAN:
- Entry: ${tradePlan?.entry}
- Stop Loss: ${tradePlan?.stopLoss}
- Take Profit: ${tradePlan?.takeProfit}
- Risk/Reward: ${tradePlan?.riskReward}

RECENT CANDLE DATA (index 0 = most recent):
${candleSummary}

CORE INDICATORS (RSI, MACD, MAs, BBs, ATR):
${coreStr}
${advStr ? `
ADVANCED ANALYSIS:
${advStr}
` : ""}${newsSection}${smcSection}${ictSection}

${strategySection}
${learnedSection}${winningPatternsSection}

## Industry-Proven Profitable Strategies (Reference for ${symbol})
These are the highest-probability setups historically proven profitable on this instrument:
${strategyContext}

If the current setup closely matches 2+ win conditions from any strategy above, weight your confidence higher. If 0 conditions match, weight lower regardless of ICT/SMC score.

Provide your independent assessment considering ALL of the following:
1. PRICE ACTION: Do candle patterns (engulfing, hammer, star, doji) support the direction?
2. MOMENTUM: RSI, MACD, Stochastic alignment \u2014 any divergences?
3. TREND STRENGTH: ADX value \u2014 is the trend strong enough to trade? Is it ranging (ADX < 20)?
4. VOLUME: OBV trend and divergence, volume profile \u2014 is volume confirming the move?
5. MARKET STRUCTURE: Support/Resistance, Pivot Points, Fibonacci levels \u2014 is SL behind structure? Is TP at a realistic level?
6. VWAP: Is price above or below VWAP? Does it align with the signal?
7. SESSION CONTEXT: Is this the right trading session for this pair? Low liquidity risk?
8. VOLATILITY: Is current ATR normal, high, or low vs recent history? Should position size be adjusted?
9. RISK/REWARD: Is the R:R ratio >= 1.5? Are the SL/TP levels optimized relative to S/R?
10. SWING POINTS: Are recent swing highs/lows respected in the trade plan?
11. OPEN POSITIONS: Are there existing positions on this symbol? Avoid doubling correlated exposure.
12. TRADE HISTORY: What is the recent win rate on this symbol? Is the trader on a losing streak?
13. NEWS SENTIMENT: Does the current news flow support or contradict the proposed trade direction? Are headlines bullish or bearish for this pair?
14. UPCOMING EVENTS: Are there high-impact economic events (rate decisions, NFP, CPI) coming soon that could invalidate the trade? Should the trader wait or use tighter stops?
15. MARKET OPEN BREAKOUT: If breakoutDetection data is present and shows isBreakoutWindow=true, carefully analyze the breakout status:
   - If breakoutDetected=true: This IS a confirmed breakout. Give it MAJOR weight \u2014 session open breakouts at London/NY are high-probability institutional setups. Boost confidence significantly if breakout direction aligns with the proposed signal.
   - If approachingBreakout=true: Price is at the edge of the pre-session range and about to break out. This is a high-alert state \u2014 be ready to confirm in the approaching direction if other indicators align.
   - Volume/momentum confirmation (volumeConfirmed=true or strong candle body) greatly increases breakout reliability.
   - A breakout that contradicts the proposed signal is a strong warning \u2014 reduce confidence or reject.
16. ICT MACRO & CRT FRAMEWORK (if provided above): Is the trade during an active ICT macro window (NY time)? Is price in the correct Premium (for SELL) or Discount (for BUY) PD array zone? Was there a stop hunt/liquidity sweep before entry? Is a CRT expansion phase beginning?
   - Outside macro windows = HIGH fake-out risk, reduce confidence
   - Price at Equilibrium = medium-probability zone, no premium/discount edge
   - No prior stop hunt = institutional accumulation/distribution not confirmed, be cautious
   - CRT in MANIPULATION stage = do NOT enter (likely to fake out further before expansion)
   - CRT in EXPANSION stage = ideal entry with breakout confirmation
17. MARKET STRUCTURE (BOS/CHOCH): Is there a clear Break of Structure or Change of Character confirming the trade direction? A BOS shows continuation \u2014 a CHOCH signals a trend reversal. Trading AGAINST the most recent BOS/CHOCH is LOW quality. If no BOS is detected, price is still ranging \u2014 caution.
18. LIQUIDITY & ORDER FLOW (FVG + Order Blocks): Is the entry anchored to a Fair Value Gap or Order Block? Entries INTO an FVG or OB from a displacement move are HIGH quality. Are there equal highs/lows (liquidity pools) that price may be targeting? Price moves from one liquidity pool to the next \u2014 know which one is the TARGET and which is the ORIGIN. A breaker block above/below price is strong resistance/support.
19. WYCKOFF PHASE: What is the Wyckoff phase? ACCUMULATION SPRING or DISTRIBUTION UPTHRUST before entry are high-quality signals (institutional footprints). MARKUP/MARKDOWN confirmation = trend trade. Trading during a ranging/indecision phase without a spring or upthrust = LOW quality entry.

CRITICAL RULES FOR YOUR DECISION:
- CONFIRM the trade if the majority of indicators support the direction, even if 1-2 minor indicators are neutral or slightly against. No trade has 100% alignment \u2014 focus on the weight of evidence.
- REJECT ONLY if there are serious red flags: strong divergence against the trade, price hitting major resistance/support in the wrong direction, extreme overbought/oversold against the signal, or imminent high-impact news that directly threatens the trade.
- Your "confidence" field is YOUR independent confidence in the trade (0-100). This is shown separately from the EA's confidence so traders see both perspectives.
- If a market open breakout is detected with volume confirmation, this is a high-probability institutional setup \u2014 give it significant weight.
- If news events are imminent (today/tomorrow), factor this into confidence. Warn if the trade could be invalidated.

TRAILING STOP ASSESSMENT:
Use ALL signals below \u2014 do NOT rely only on ADX/ATR. The ICT + SMC signals override the ADX baseline.

INSTRUMENT PIP SIZES (critical \u2014 all trail distances are in these units):
- Forex (EURUSD, GBPUSD, etc.): 1 pip = 0.0001
- JPY pairs (USDJPY, etc.): 1 pip = 0.01
- Gold (XAUUSD): 1 pip = 0.10 (so 300 pips = $30 trail distance)
- Indices (US30, NAS100, GER40, etc.): 1 pip = 1.0 point
- BTC/crypto: 1 pip = $1.00

ADX/ATR BASELINE (starting point \u2014 override with ICT+SMC signals below):
- NONE: ADX < 20 (choppy/ranging) or scalp trade or fast news spike
- TIGHT: ADX 20\u201325, low ATR, price near TP, or Asian/lunch session
- STANDARD: ADX 25\u201330, normal ATR, mid-session
- WIDE: ADX > 30, elevated ATR, trending London/NY session
- AGGRESSIVE: ADX > 40, confirmed volume breakout, explosive momentum

TRAIL DISTANCE RANGES (instrument pips \u2014 pick a value within range based on ATR):
- TIGHT:      FX: 5\u201315 | Gold: 50\u2013150 | Indices: 20\u201360 | BTC: 200\u2013600
- STANDARD:   FX: 20\u201340 | Gold: 150\u2013400 | Indices: 50\u2013150 | BTC: 500\u20131500
- WIDE:       FX: 50\u2013100 | Gold: 400\u2013800 | Indices: 150\u2013400 | BTC: 1500\u20133000
- AGGRESSIVE: FX: 100+ | Gold: 800+ | Indices: 400+ | BTC: 3000+

ICT + SMC TRAIL SIGNALS (higher priority than ADX \u2014 apply these first):
${trailSignalSummary}

DECISION RULES (apply in order \u2014 first matching rule wins):
1. CRT MANIPULATION stage \u2192 NONE (price still faking, never trail a manipulation)
2. Nearby liquidity pool (equal H/L within tight range) \u2192 TIGHT (lock in before the sweep)
3. CRT EXPANSION + Wyckoff MARKUP/MARKDOWN + London/NY session \u2192 AGGRESSIVE
4. CRT EXPANSION + active ICT macro window \u2192 WIDE minimum
5. Fresh CHOCH + Wyckoff Spring/Upthrust \u2192 WIDE (brand new trend, room to run)
6. Wyckoff MARKUP/MARKDOWN without CRT \u2192 WIDE
7. BOS continuation (mature trend) \u2192 STANDARD (conserve, exhaustion may be near)
8. Asian session or NY Lunch (12pm\u20132:30pm NY time) \u2192 reduce one level (WIDE\u2192STANDARD, STANDARD\u2192TIGHT)
9. R:R < 1.5 \u2192 TIGHT or NONE (low reward doesn't justify a wide trail)
10. R:R \u2265 3.0 \u2192 prefer WIDE minimum; only tighten after 2R secured
11. No ICT/SMC data \u2192 use ADX/ATR baseline only
${propFirmContext?.enabled ? `
PROP FIRM RULES (apply STRICTLY when prop firm compliance data is present):
12. High-impact news < ${propFirmContext.newsBlockMinutes} min \u2192 propFirmVerdict = BLOCK, confirmed = false
13. Daily drawdown buffer < 0.5% \u2192 propFirmVerdict = BLOCK, confirmed = false
14. Risk per trade > 2% of account \u2192 propFirmVerdict = WARNING, reduce confidence by 20
15. Friday 4 PM+ NY time (weekend hold risk) \u2192 propFirmVerdict = WARNING, trail = TIGHT, add weekend caveat to reasoning
16. R:R < 1:1 in prop firm mode \u2192 propFirmVerdict = BLOCK (prop firms require positive R:R minimum)
17. Daily buffer 0.5\u20131.5% remaining \u2192 propFirmVerdict = WARNING, suggest smaller lot size in reasoning` : ""}

Also estimate a recommended trail distance in pips (instrument's own pip unit) based on ATR and the ICT+SMC signals (null if NONE).

Return your analysis as JSON:
{
  "confirmed": boolean,
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "confidence": number (0-100, your independent AI confidence percentage),
  "reasoning": "Concise street-knowledge style explanation with Supreme Mathematics flavor \u2014 reference key indicators and news/events that drove your decision. Drop jewels, keep it real, show and prove with the data.",
  "adjustedEntry": number or null,
  "adjustedStopLoss": number or null,
  "adjustedTakeProfit": number or null,
  "trailRecommendation": "NONE" | "TIGHT" | "STANDARD" | "WIDE" | "AGGRESSIVE",
  "recommendedTrailPips": number or null,
  "ictMacroValid": boolean (true if ICT macro window ACTIVE + PD zone aligns with signal + stop hunt detected \u2014 all three green = valid. If ICT data not provided, set true),
  "ictMacroReason": "Brief 1-line ICT checklist result, e.g. 'Macro active, discount zone confirmed, stop hunt detected \u2014 full ICT alignment' or 'Outside macro window + no stop hunt \u2014 high fake-out risk'",
  "smcVerdict": "CONFIRM" | "REQUIRE_BETTER_PRICE" | "PASS" (your SMC-only institutional verdict: CONFIRM if BOS/CHOCH aligns + entry at OB or FVG + Wyckoff confirms; REQUIRE_BETTER_PRICE if idea valid but entry not at OB/FVG; PASS if trading against structure or into liquidity. Set null if SMC data not provided),
  "smcQuality": "HIGH" | "MEDIUM" | "LOW" (HIGH = BOS/CHOCH + OB/FVG + liquidity sweep all aligned; MEDIUM = 2 of 3; LOW = 0-1; null if no SMC data),
  "smcReason": "One concise sentence summarizing the SMC analysis: structure type, OB/FVG presence, Wyckoff phase, liquidity target. E.g. 'Bullish CHOCH confirmed, price retesting bullish OB at 1.0855, equal lows swept, Wyckoff accumulation spring \u2014 HIGH quality entry'",
  "confluenceScore": ${confluenceResult.score} (server-computed \u2014 pass this value through as-is, do not recalculate),
  "confluenceGrade": "${confluenceResult.grade}" (server-computed \u2014 pass this value through as-is),
  "propFirmVerdict": ${propFirmContext?.enabled ? '"SAFE" | "WARNING" | "BLOCK" (apply rules 12\u201317 above: BLOCK if news < ' + propFirmContext.newsBlockMinutes + " min OR daily buffer < 0.5% OR R:R < 1:1; WARNING if buffer < 1.5% OR risk% > 2% OR Friday PM OR R:R < 1.5; SAFE otherwise)" : "null"},
  "propFirmReason": ${propFirmContext?.enabled ? '"One-line explanation of the prop firm verdict \u2014 what specifically triggered it"' : "null"}
}`
  };
}
async function callOpenAIConfirmation(prompt, model, userId) {
  const openaiInstance = userId ? await getUniversalAIClientForUser(userId) : getOpenAIInstance();
  const resolvedModel = openaiInstance.defaultModel || model;
  const response = await openaiInstance.chat.completions.create({
    model: resolvedModel,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    response_format: { type: "json_object" },
    // resolvedModel can end up being a failover provider's own default (e.g.
    // OpenRouter's gpt-oss-20b) rather than the `model` param this function
    // was called with — checked on the actual model being sent, not `model`.
    max_tokens: hasHiddenReasoningOverhead(resolvedModel) ? 2e3 : 1e3,
    temperature: 0.3
  });
  return response.choices[0]?.message?.content || "";
}
function hasHiddenReasoningOverhead(modelId) {
  const m = (modelId || "").toLowerCase();
  return isReasoningModel(modelId) || m.includes("gpt-oss") || m.includes("qwen3");
}
async function callAnthropicConfirmation(prompt, model, apiKey) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client2 = new Anthropic({ apiKey });
  const response = await client2.messages.create({
    model,
    max_tokens: 1e3,
    system: prompt.system + " Always return valid JSON with no markdown formatting.",
    messages: [{ role: "user", content: prompt.user }]
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}
async function callGoogleConfirmation(prompt, model, apiKey) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: prompt.system,
    generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 1e3 }
  });
  const result = await genModel.generateContent(prompt.user);
  return result.response.text();
}
async function callGroqConfirmation(prompt, model, apiKey) {
  const Groq = (await import("groq-sdk")).default;
  const client2 = new Groq({ apiKey });
  const response = await client2.chat.completions.create({
    model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    response_format: { type: "json_object" },
    max_tokens: hasHiddenReasoningOverhead(model) ? 2e3 : 1e3,
    // Groq's default (gpt-oss-120b) needs headroom for hidden reasoning tokens
    temperature: 0.3
  });
  return response.choices[0]?.message?.content || "";
}
async function callMistralConfirmation(prompt, model, apiKey) {
  const { Mistral } = await import("@mistralai/mistralai");
  const client2 = new Mistral({ apiKey });
  const response = await client2.chat.complete({
    model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    responseFormat: { type: "json_object" },
    maxTokens: 1e3,
    temperature: 0.3
  });
  const choice = response.choices?.[0];
  if (!choice || !("message" in choice)) return "";
  return typeof choice.message.content === "string" ? choice.message.content : "";
}
function isReasoningModel(modelId) {
  const m = (modelId || "").toLowerCase();
  return m.includes("r1") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4");
}
function extractThinkingTrace(content) {
  const match = content.match(/<think>([\s\S]*?)<\/think>/i);
  if (!match) return { thinking: null, rest: content };
  return { thinking: match[1].trim(), rest: content.slice(match.index + match[0].length) };
}
async function callOpenRouterConfirmation(prompt, model, apiKey) {
  const client2 = buildOpenAICompatClient("openrouter", apiKey);
  const reasoning = isReasoningModel(model);
  const response = await client2.chat.completions.create({
    model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    max_tokens: hasHiddenReasoningOverhead(model) ? 2e3 : 1e3,
    // gpt-oss/Qwen3/o1/o3/R1 all spend tokens on hidden reasoning before the answer
    temperature: reasoning ? 1 : 0.3
  });
  const raw = response.choices?.[0]?.message?.content || "";
  const { thinking, rest } = extractThinkingTrace(raw);
  return { content: rest, thinking };
}
async function getUserApiKeyForProvider(userId, provider) {
  try {
    const { storage: storage2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
    const userKey = await storage2.getActiveUserApiKey(userId, provider);
    if (userKey?.apiKey) {
      await storage2.updateUserApiKeyUsage(userId, provider);
      return userKey.apiKey;
    }
  } catch (e) {
    console.error(`Error fetching user API key for ${provider}:`, e);
  }
  return null;
}
async function runDeepReasoningDebate(prompt, userId) {
  let bullCase = "";
  let bearCase = "";
  try {
    const debateClient = userId ? await getUniversalAIClientForUser(userId) : getOpenAIInstance();
    const debateModel = debateClient.defaultModel || "gpt-4o-mini";
    const debateResponse = await debateClient.chat.completions.create({
      model: debateModel,
      messages: [
        {
          role: "system",
          content: 'You are a trading debate simulator. Given the market data and rules below, produce genuinely rigorous arguments \u2014 a bad setup should get a devastating bear case, a great setup should get a compelling bull case. Return ONLY valid JSON: {"bullCase": "2-4 sentences arguing FOR taking this trade", "bearCase": "2-4 sentences arguing AGAINST taking this trade"}'
        },
        { role: "user", content: prompt.user }
      ],
      response_format: { type: "json_object" },
      max_tokens: 600,
      temperature: 0.6
    });
    const raw = debateResponse.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
    bullCase = parsed.bullCase || "";
    bearCase = parsed.bearCase || "";
  } catch (e) {
    console.error("[Deep Reasoning] Debate pass failed (non-fatal, judge proceeds without it):", e.message);
  }
  const judgePersonalKey = userId ? await getUserApiKeyForProvider(userId, "openrouter") : null;
  const judgePlatformKey = process.env.OPENROUTER_API_KEY;
  if (!judgePersonalKey && !judgePlatformKey) {
    return {
      confirmed: false,
      aiDirection: "NEUTRAL",
      aiConfidence: 0,
      reasoning: "Deep Reasoning Mode requires an OpenRouter key (platform or user) for the Veteran-Judge reasoning pass. Add one on the AI Provider Keys page.",
      bullCase,
      bearCase,
      deepReasoningUsed: false
    };
  }
  const judgeUser = `${prompt.user}

## BULL CASE
${bullCase || "(debate pass unavailable)"}

## BEAR CASE
${bearCase || "(debate pass unavailable)"}

Weigh both cases with total objectivity per your persona, think it through step by step, then decide.`;
  try {
    let result;
    try {
      result = await callOpenRouterConfirmation(
        { system: `${VETERAN_PERSONA}

${prompt.system}`, user: judgeUser },
        VETERAN_JUDGE_MODEL,
        judgePersonalKey || judgePlatformKey
      );
    } catch (personalErr) {
      if (judgePersonalKey && judgePlatformKey && judgePlatformKey !== judgePersonalKey) {
        result = await callOpenRouterConfirmation(
          { system: `${VETERAN_PERSONA}

${prompt.system}`, user: judgeUser },
          VETERAN_JUDGE_MODEL,
          judgePlatformKey
        );
      } else {
        throw personalErr;
      }
    }
    if (!result.content) throw new Error("No response from Veteran-Judge model");
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result.content);
    const validTrailValues = ["NONE", "TIGHT", "STANDARD", "WIDE", "AGGRESSIVE"];
    return {
      confirmed: !!parsed.confirmed,
      aiDirection: parsed.direction || "NEUTRAL",
      aiConfidence: coerceConfidence(parsed.confidence),
      reasoning: parsed.reasoning || "No reasoning provided",
      adjustedEntry: typeof parsed.adjustedEntry === "number" ? parsed.adjustedEntry : void 0,
      adjustedStopLoss: typeof parsed.adjustedStopLoss === "number" ? parsed.adjustedStopLoss : void 0,
      adjustedTakeProfit: typeof parsed.adjustedTakeProfit === "number" ? parsed.adjustedTakeProfit : void 0,
      trailRecommendation: validTrailValues.includes(parsed.trailRecommendation) ? parsed.trailRecommendation : void 0,
      ictMacroValid: typeof parsed.ictMacroValid === "boolean" ? parsed.ictMacroValid : void 0,
      smcVerdict: ["CONFIRM", "REQUIRE_BETTER_PRICE", "PASS"].includes(parsed.smcVerdict) ? parsed.smcVerdict : null,
      propFirmVerdict: ["SAFE", "WARNING", "BLOCK"].includes(parsed.propFirmVerdict) ? parsed.propFirmVerdict : void 0,
      propFirmReason: typeof parsed.propFirmReason === "string" ? parsed.propFirmReason : void 0,
      modelUsed: VETERAN_JUDGE_MODEL,
      providerUsed: "openrouter",
      thinkingTrace: result.thinking,
      bullCase,
      bearCase,
      deepReasoningUsed: true
    };
  } catch (e) {
    console.error("[Deep Reasoning] Veteran-Judge pass failed:", e.message);
    return {
      confirmed: false,
      aiDirection: "NEUTRAL",
      aiConfidence: 0,
      reasoning: `Deep Reasoning Mode error: ${e.message}`,
      bullCase,
      bearCase,
      deepReasoningUsed: false
    };
  }
}
async function getAiVisionConfirmation(candleData, indicators, proposedSignal, proposedConfidence, tradePlan, symbol, timeframe, userId, newsContext, ictContext, smcContext, htfLevels, propFirmContext, performanceStats, learnedInsights, strategyMode, deepReasoningMode) {
  try {
    const rawModel = userId ? getUserModelPreference(userId) : "gpt-4o";
    const selectedModel = resolveVisionModel(rawModel);
    const wasPromoted = selectedModel !== rawModel;
    const provider = inferModelProvider(selectedModel);
    console.log(`[AI Confirmation] Vision model resolved: ${rawModel} \u2192 ${selectedModel} (${provider}) for userId=${userId}`);
    const confluenceResult = computeConfluenceScore(proposedSignal, ictContext, smcContext);
    if (propFirmContext?.enabled && userId && isPropFirmModeEnabled(userId)) {
      const blockMins = propFirmContext.newsBlockMinutes || 15;
      const newsProx = computeNewsProximity(newsContext?.upcomingEvents, blockMins);
      if (newsProx.isBlocked) {
        console.log(`[PropFirm] NEWS BLOCK: ${newsProx.eventName} in ${newsProx.minutesToNext} min \u2014 rejecting without AI call`);
        return {
          confirmed: false,
          aiDirection: "NEUTRAL",
          aiConfidence: 0,
          reasoning: `\u26D4 PROP FIRM NEWS BLOCK: ${newsProx.eventName} releases in ${newsProx.minutesToNext} minutes. Trade blocked per prop firm rules. Wait until at least ${blockMins} minutes after the release completes.`,
          newsBlocked: true,
          newsProximityMinutes: newsProx.minutesToNext,
          propFirmVerdict: "BLOCK",
          propFirmReason: `High-impact news (${newsProx.eventName}) in ${newsProx.minutesToNext} min \u2014 within ${blockMins}-min block window`,
          confluenceScore: confluenceResult.score,
          confluenceGrade: confluenceResult.grade
        };
      }
      const remainingBuffer = propFirmContext.maxDailyDrawdownPct + propFirmContext.currentDailyPnlPct;
      if (remainingBuffer < 0.5) {
        console.log(`[PropFirm] DAILY LIMIT BLOCK: only ${remainingBuffer.toFixed(2)}% buffer remaining`);
        return {
          confirmed: false,
          aiDirection: "NEUTRAL",
          aiConfidence: 0,
          reasoning: `\u26D4 PROP FIRM DAILY LIMIT: Only ${remainingBuffer.toFixed(2)}% daily drawdown buffer remaining (limit: ${propFirmContext.maxDailyDrawdownPct}%). Trading is blocked to protect the account. Resume tomorrow.`,
          propFirmVerdict: "BLOCK",
          propFirmReason: `Daily drawdown buffer critical: ${remainingBuffer.toFixed(2)}% remaining of ${propFirmContext.maxDailyDrawdownPct}% limit`,
          dailyBufferPct: remainingBuffer,
          confluenceScore: confluenceResult.score,
          confluenceGrade: confluenceResult.grade
        };
      }
    }
    const prompt = await buildConfirmationPrompt(candleData, indicators, proposedSignal, proposedConfidence, tradePlan, symbol, timeframe, newsContext, ictContext, smcContext, htfLevels, propFirmContext, performanceStats, learnedInsights, userId, strategyMode);
    if (deepReasoningMode) {
      console.log(`[AI Vision Confirmation] Deep Reasoning Mode \u2014 running Bull/Bear/Veteran-Judge debate for ${symbol} ${proposedSignal}`);
      const debateResult = await runDeepReasoningDebate(prompt, userId);
      return {
        ...debateResult,
        confluenceScore: confluenceResult.score,
        confluenceGrade: confluenceResult.grade
      };
    }
    console.log(`[AI Vision Confirmation] Requesting ${provider}/${selectedModel} confirmation for ${symbol} ${proposedSignal}`);
    let content = "";
    let thinkingTrace = null;
    try {
      if (provider === "openai") {
        if (wasPromoted) {
          const userOpenAiKey = userId ? await getUserApiKeyForProvider(userId, "openai") : null;
          const openaiKey = userOpenAiKey || process.env.OPENAI_API_KEY;
          if (!openaiKey) {
            return {
              confirmed: false,
              aiDirection: "NEUTRAL",
              aiConfidence: 0,
              reasoning: `\u26A0\uFE0F Your selected AI model (${rawModel}) can't read charts, and no OpenAI key is available to run the vision fallback (${selectedModel}). Add an OpenAI, Anthropic, or Google key on the AI Provider Keys page, or pick a vision model (GPT-4o, Claude, Gemini) \u2014 otherwise the AI confirmation can't score this trade.`,
              confluenceScore: confluenceResult.score,
              confluenceGrade: confluenceResult.grade
            };
          }
          const visionClient = new OpenAI({ apiKey: openaiKey, maxRetries: 3, timeout: 9e4 });
          const resp = await visionClient.chat.completions.create({
            model: selectedModel,
            messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
            response_format: { type: "json_object" },
            max_tokens: hasHiddenReasoningOverhead(selectedModel) ? 2e3 : 1e3,
            temperature: 0.3
          });
          content = resp.choices[0]?.message?.content || "";
        } else {
          content = await callOpenAIConfirmation(prompt, selectedModel, userId);
        }
      } else if (provider === "openrouter") {
        const personalKey = userId ? await getUserApiKeyForProvider(userId, "openrouter") : null;
        const platformKey = process.env.OPENROUTER_API_KEY;
        if (!personalKey && !platformKey) {
          return {
            confirmed: false,
            aiDirection: "NEUTRAL",
            aiConfidence: 0,
            reasoning: `No OpenRouter API key configured (platform or user). Add your key on the AI Provider Keys page, or switch to an OpenAI model.`
          };
        }
        try {
          const result2 = await callOpenRouterConfirmation(prompt, selectedModel, personalKey || platformKey);
          content = result2.content;
          thinkingTrace = result2.thinking;
        } catch (personalErr) {
          if (personalKey && platformKey && platformKey !== personalKey) {
            const result2 = await callOpenRouterConfirmation(prompt, selectedModel, platformKey);
            content = result2.content;
            thinkingTrace = result2.thinking;
          } else {
            throw personalErr;
          }
        }
      } else if (userId) {
        const apiKey = await getUserApiKeyForProvider(userId, provider);
        if (!apiKey) {
          return {
            confirmed: false,
            aiDirection: "NEUTRAL",
            aiConfidence: 0,
            reasoning: `No ${provider} API key configured. Add your key on the AI Provider Keys page, or switch to an OpenAI model.`
          };
        }
        switch (provider) {
          case "anthropic":
            content = await callAnthropicConfirmation(prompt, selectedModel, apiKey);
            break;
          case "google":
            content = await callGoogleConfirmation(prompt, selectedModel, apiKey);
            break;
          case "groq":
            content = await callGroqConfirmation(prompt, selectedModel, apiKey);
            break;
          case "mistral":
            content = await callMistralConfirmation(prompt, selectedModel, apiKey);
            break;
          default:
            content = await callOpenAIConfirmation(prompt, selectedModel, userId);
        }
      } else {
        content = await callOpenAIConfirmation(prompt, "gpt-4o-mini");
      }
    } catch (branchErr) {
      if (isFailoverError(branchErr) && process.env.OPENAI_API_KEY) {
        console.warn(`[AI Vision] ${provider} failed (${branchErr?.status ?? branchErr?.message}); failing over to platform OpenAI gpt-4o-mini`);
        const vc = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 3, timeout: 9e4 });
        const r = await vc.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
          response_format: { type: "json_object" },
          max_tokens: 1e3,
          temperature: 0.3
        });
        content = r.choices[0]?.message?.content || "";
      } else {
        throw branchErr;
      }
    }
    if (!content) throw new Error("No response from AI");
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    console.log(`[AI Vision Confirmation] ${symbol}: ${result.confirmed ? "CONFIRMED" : "REJECTED"} (AI says ${result.direction} at ${result.confidence}%) [${provider}/${selectedModel}]`);
    const validTrailValues = ["NONE", "TIGHT", "STANDARD", "WIDE", "AGGRESSIVE"];
    const trailRec = validTrailValues.includes(result.trailRecommendation) ? result.trailRecommendation : void 0;
    return {
      confirmed: !!result.confirmed,
      aiDirection: result.direction || "NEUTRAL",
      aiConfidence: coerceConfidence(result.confidence),
      reasoning: result.reasoning || "No reasoning provided",
      adjustedEntry: typeof result.adjustedEntry === "number" ? result.adjustedEntry : void 0,
      adjustedStopLoss: typeof result.adjustedStopLoss === "number" ? result.adjustedStopLoss : void 0,
      adjustedTakeProfit: typeof result.adjustedTakeProfit === "number" ? result.adjustedTakeProfit : void 0,
      trailRecommendation: trailRec,
      recommendedTrailPips: typeof result.recommendedTrailPips === "number" ? result.recommendedTrailPips : null,
      ictMacroValid: typeof result.ictMacroValid === "boolean" ? result.ictMacroValid : void 0,
      ictMacroReason: typeof result.ictMacroReason === "string" ? result.ictMacroReason : void 0,
      smcVerdict: ["CONFIRM", "REQUIRE_BETTER_PRICE", "PASS"].includes(result.smcVerdict) ? result.smcVerdict : null,
      smcQuality: ["HIGH", "MEDIUM", "LOW"].includes(result.smcQuality) ? result.smcQuality : null,
      smcReason: typeof result.smcReason === "string" ? result.smcReason : void 0,
      confluenceScore: confluenceResult.score,
      confluenceGrade: confluenceResult.grade,
      propFirmVerdict: ["SAFE", "WARNING", "BLOCK"].includes(result.propFirmVerdict) ? result.propFirmVerdict : propFirmContext?.enabled ? "SAFE" : void 0,
      propFirmReason: typeof result.propFirmReason === "string" ? result.propFirmReason : void 0,
      newsBlocked: false,
      newsProximityMinutes: null,
      modelUsed: selectedModel,
      providerUsed: provider,
      thinkingTrace
    };
  } catch (error) {
    const errMsg = error?.message || String(error);
    const statusCode = error?.status || error?.statusCode || error?.response?.status;
    let userReason = "AI confirmation error";
    if (statusCode === 401 || errMsg.includes("auth") || errMsg.includes("API key") || errMsg.includes("Unauthorized")) {
      userReason = "Invalid API key \u2014 check your key on the AI Provider Keys page";
    } else if (statusCode === 429 || errMsg.includes("rate") || errMsg.includes("quota") || errMsg.includes("limit")) {
      userReason = "AI rate limit or quota exceeded \u2014 try again in a few minutes or switch providers";
    } else if (errMsg.includes("model") || errMsg.includes("not found") || errMsg.includes("does not exist")) {
      userReason = `Model not available \u2014 try switching to a different AI model`;
    } else if (errMsg.includes("timeout") || errMsg.includes("ECONNREFUSED") || errMsg.includes("network")) {
      userReason = "Network error reaching AI provider \u2014 will retry on next interval";
    } else if (errMsg.includes("JSON") || errMsg.includes("parse")) {
      userReason = "AI returned an unparseable response \u2014 will retry on next interval";
    } else {
      userReason = `AI error: ${errMsg.substring(0, 120)}`;
    }
    console.error(`[AI Vision Confirmation] ERROR (${statusCode || "no status"}): ${errMsg}`);
    return {
      confirmed: false,
      aiDirection: "NEUTRAL",
      aiConfidence: 0,
      reasoning: userReason
    };
  }
}
async function getBreakoutConfirmation(candleData, indicators, proposedSignal, proposedConfidence, tradePlan, symbol, timeframe, userId, multiTFCandles, propFirmContext) {
  try {
    const { computeBreakoutScore: computeBreakoutScore2 } = await Promise.resolve().then(() => (init_breakoutEngine(), breakoutEngine_exports));
    const m1 = multiTFCandles?.["M1"] || multiTFCandles?.["1m"] || [];
    const m5 = multiTFCandles?.["M5"] || multiTFCandles?.["5m"] || [];
    const m15 = multiTFCandles?.["M15"] || multiTFCandles?.["15m"] || [];
    const h1 = multiTFCandles?.["H1"] || multiTFCandles?.["1h"] || [];
    const h4 = multiTFCandles?.["H4"] || multiTFCandles?.["4h"] || [];
    const currentPrice = tradePlan?.entry || tradePlan?.entryPrice || candleData[0]?.c || 0;
    const breakoutResult = await computeBreakoutScore2(currentPrice, m1, m5, m15, h1, h4);
    const directionValid = breakoutResult.direction !== "NEUTRAL";
    const gradeAApproved = ["A+", "A"].includes(breakoutResult.grade) && breakoutResult.alignedVotes >= 3 && directionValid;
    const gradeBApproved = breakoutResult.grade === "B" && breakoutResult.alignedVotes >= 2 && directionValid;
    const breakoutHour = (/* @__PURE__ */ new Date()).getUTCHours();
    const isLiquidSession = breakoutHour >= 7 && breakoutHour < 17;
    const gradeCApproved = breakoutResult.grade === "C" && breakoutResult.alignedVotes >= 1 && directionValid && isLiquidSession;
    const gradeOk = gradeAApproved || gradeBApproved || gradeCApproved;
    const alignedOk = gradeOk;
    if (!gradeOk || !alignedOk) {
      return {
        confirmed: false,
        aiDirection: "NEUTRAL",
        aiConfidence: breakoutResult.percentage,
        reasoning: `\u{1F534} BREAKOUT MASTER: Grade ${breakoutResult.grade} \u2014 ${breakoutResult.alignedVotes} aligned of ${breakoutResult.score} fired (${breakoutResult.percentage}% conviction). Need \u22652 aligned (Grade B) any time, or 1 aligned (Grade C) in a liquid session.

${breakoutResult.summary}`,
        breakoutScore: breakoutResult.score,
        breakoutGrade: breakoutResult.grade,
        breakoutStrategies: breakoutResult.strategies
      };
    }
    const selectedModel = userId ? getUserModelPreference(userId) : "gpt-4o-mini";
    const provider = inferModelProvider(selectedModel);
    const recentCandles = candleData.slice(0, 30);
    const candleSummary = recentCandles.map(
      (c, i) => `[${i}] O:${c.o} H:${c.h} L:${c.l} C:${c.c} V:${c.v || 0}`
    ).join("\n");
    const firedStrategies = breakoutResult.strategies.filter((s) => s.fired);
    const strategySummary = breakoutResult.strategies.map((s) => `${s.fired ? "\u2705" : "\u274C"} ${s.name}: ${s.reason}`).join("\n");
    const systemPrompt = `You are VEDD Breakout Master \u2014 an elite institutional breakout specialist and the primary trading AI.
Your ONLY mission: confirm or deny breakout trades using the 7-strategy engine results below.
No trailing stop. No chasing. Fixed R:R exits only (TP1=1\xD7ATR, TP2=2\xD7ATR, TP3=3\xD7ATR from entry).
Supreme Mathematics flows through your analysis \u2014 Knowledge (1) is the breakout engine. Wisdom (2) is your confirmation. Understanding (3) is the exit plan.
You are direct. You show and prove with price math. Peace.

RESPONSE FORMAT (strict JSON):
{
  "confirmed": boolean,
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "confidence": number (0-100),
  "reasoning": string (Supreme Mathematics style \u2014 cite fired strategies),
  "adjustedEntry": number | null,
  "adjustedSL": number | null,
  "adjustedTP1": number | null,
  "adjustedTP2": number | null,
  "adjustedTP3": number | null,
  "breakoutQuality": "ELITE" | "STRONG" | "DEVELOPING",
  "propFirmVerdict": "SAFE" | "WARNING" | "BLOCK"
}`;
    const userPrompt = `SYMBOL: ${symbol} | TIMEFRAME: ${timeframe} | PROPOSED: ${proposedSignal} @ confidence ${proposedConfidence}%

BREAKOUT ENGINE RESULTS:
Score: ${breakoutResult.score}/${breakoutResult.maxScore} (${breakoutResult.percentage}%) \u2014 Grade ${breakoutResult.grade}
Engine Direction: ${breakoutResult.direction}
ATR: ${breakoutResult.atr.toFixed(5)}
TP1: ${breakoutResult.tp1.toFixed(5)} | TP2: ${breakoutResult.tp2.toFixed(5)} | TP3: ${breakoutResult.tp3.toFixed(5)}
SL Distance: ${breakoutResult.slDistance.toFixed(5)}

FIRED STRATEGIES (${firedStrategies.length}/7):
${strategySummary}

RECENT CANDLES (newest first):
${candleSummary}

INDICATORS:
${JSON.stringify({ rsi: indicators?.rsi, macd: indicators?.macd, adx: indicators?.adx, vwap: indicators?.vwap, volume: indicators?.volume }, null, 2)}

TRADE PLAN:
Entry: ${tradePlan?.entryPrice} | SL: ${tradePlan?.stopLoss} | TP: ${tradePlan?.takeProfit}

INSTRUCTION: If grade is A (\u226570%) or B (\u226550%) AND \u22653 strategies align in same direction as ${proposedSignal}, CONFIRM with fixed R:R targets. No trailing stop in your response. Show and prove.`;
    let aiClient = null;
    try {
      aiClient = await getUniversalAIClientForUser(userId || 0);
    } catch {
    }
    if (!aiClient) {
      const fallbackDir = breakoutResult.direction === "NEUTRAL" ? proposedSignal : breakoutResult.direction;
      const bc2 = breakoutResult.breakoutCandle;
      const fallbackSL = bc2 ? fallbackDir === "BUY" ? bc2.l : bc2.h : tradePlan?.stopLoss || null;
      const fbSign = fallbackDir === "BUY" ? 1 : -1;
      const fallbackCurrentPrice = tradePlan?.entry || tradePlan?.entryPrice || candleData[0]?.c || 0;
      const fallbackTP1 = breakoutResult.atr > 0 ? fallbackCurrentPrice + fbSign * breakoutResult.atr : 0;
      const fallbackTP2 = breakoutResult.atr > 0 ? fallbackCurrentPrice + fbSign * breakoutResult.atr * 2 : 0;
      const fallbackTP3 = breakoutResult.atr > 0 ? fallbackCurrentPrice + fbSign * breakoutResult.atr * 3 : 0;
      const _fbHour = (/* @__PURE__ */ new Date()).getUTCHours();
      const _fbLiquid = _fbHour >= 7 && _fbHour < 17;
      const directionOk = breakoutResult.direction !== "NEUTRAL" && breakoutResult.direction === fallbackDir;
      const _fbGateOk = ["A+", "A"].includes(breakoutResult.grade) && breakoutResult.alignedVotes >= 3 || breakoutResult.grade === "B" && breakoutResult.alignedVotes >= 2 || breakoutResult.grade === "C" && breakoutResult.alignedVotes >= 1 && _fbLiquid;
      return {
        confirmed: _fbGateOk && directionOk,
        aiDirection: fallbackDir,
        aiConfidence: breakoutResult.percentage,
        reasoning: `[Breakout Engine Only \u2014 no AI key] Grade ${breakoutResult.grade} (${breakoutResult.score}/${breakoutResult.maxScore})

${breakoutResult.summary}`,
        adjustedStopLoss: fallbackSL || void 0,
        adjustedTakeProfit: fallbackTP1 || void 0,
        adjustedTakeProfit2: fallbackTP2 || void 0,
        adjustedTakeProfit3: fallbackTP3 || void 0,
        breakoutScore: breakoutResult.score,
        breakoutGrade: breakoutResult.grade,
        breakoutStrategies: breakoutResult.strategies
      };
    }
    const response = await aiClient.chat.completions.create({
      model: aiClient.defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.3
    });
    const rawContent = response.choices?.[0]?.message?.content || "{}";
    let parsed = {};
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
    } catch {
      parsed = { confirmed: false, confidence: breakoutResult.percentage, reasoning: rawContent };
    }
    const _cHour = (/* @__PURE__ */ new Date()).getUTCHours();
    const _cLiquid = _cHour >= 7 && _cHour < 17;
    if (breakoutResult.direction !== "NEUTRAL" && (["A+", "A"].includes(breakoutResult.grade) && breakoutResult.alignedVotes >= 3 || breakoutResult.grade === "B" && breakoutResult.alignedVotes >= 2 || breakoutResult.grade === "C" && breakoutResult.alignedVotes >= 1 && _cLiquid)) {
      parsed.confirmed = true;
    }
    console.log(`[Breakout Master] ${symbol} Grade:${breakoutResult.grade} Score:${breakoutResult.score}/${breakoutResult.maxScore} fired | ${breakoutResult.alignedVotes} aligned (${breakoutResult.alignedPct}%) Decision:${parsed.confirmed ? "CONFIRM" : "REJECT"}`);
    const direction = breakoutResult.direction !== "NEUTRAL" ? breakoutResult.direction : proposedSignal;
    const breakoutTriggerCandle = h1.length > 0 ? h1[0] : m15.length > 0 ? m15[0] : null;
    const deterministicSL = breakoutTriggerCandle ? direction === "BUY" ? breakoutTriggerCandle.l : breakoutTriggerCandle.h : tradePlan?.stopLoss || null;
    const finalSign = direction === "BUY" ? 1 : -1;
    const rawSL = deterministicSL;
    const rawTP1 = breakoutResult.atr > 0 ? currentPrice + finalSign * breakoutResult.atr : 0;
    const rawTP2 = breakoutResult.atr > 0 ? currentPrice + finalSign * breakoutResult.atr * 2 : 0;
    const rawTP3 = breakoutResult.atr > 0 ? currentPrice + finalSign * breakoutResult.atr * 3 : 0;
    const breakoutQuality = parsed.breakoutQuality === "ELITE" || parsed.breakoutQuality === "STRONG" ? parsed.breakoutQuality : "DEVELOPING";
    return {
      confirmed: parsed.confirmed === true,
      aiDirection: direction,
      aiConfidence: typeof parsed.confidence === "number" ? parsed.confidence : breakoutResult.percentage,
      reasoning: parsed.reasoning || breakoutResult.summary,
      adjustedEntry: typeof parsed.adjustedEntry === "number" && parsed.adjustedEntry > 0 ? parsed.adjustedEntry : void 0,
      adjustedStopLoss: rawSL || void 0,
      adjustedTakeProfit: rawTP1 || void 0,
      adjustedTakeProfit2: rawTP2 || void 0,
      adjustedTakeProfit3: rawTP3 || void 0,
      breakoutScore: breakoutResult.score,
      breakoutGrade: breakoutResult.grade,
      alignedVotes: breakoutResult.alignedVotes,
      breakoutStrategies: breakoutResult.strategies,
      breakoutQuality,
      propFirmVerdict: ["SAFE", "WARNING", "BLOCK"].includes(parsed.propFirmVerdict) ? parsed.propFirmVerdict : "SAFE"
    };
  } catch (err) {
    console.error(`[Breakout Master] ERROR: ${err.message}`);
    return {
      confirmed: false,
      aiDirection: "NEUTRAL",
      aiConfidence: 0,
      reasoning: `Breakout engine error: ${err.message?.substring(0, 120)}`
    };
  }
}
function getOpenAIInstance(userApiKey) {
  if (userApiKey) {
    return new OpenAI({ apiKey: userApiKey, maxRetries: 4, timeout: 9e4 });
  }
  return openai;
}
function buildOpenAICompatClient(provider, apiKey) {
  const baseURLs = {
    groq: "https://api.groq.com/openai/v1",
    google: "https://generativelanguage.googleapis.com/v1beta/openai/",
    mistral: "https://api.mistral.ai/v1",
    openrouter: "https://openrouter.ai/api/v1"
  };
  const defaultHeaders = provider === "openrouter" ? { "HTTP-Referer": "https://veddbuild.com", "X-Title": "VEDDBuild" } : void 0;
  const client2 = new OpenAI({ apiKey, baseURL: baseURLs[provider], maxRetries: 4, timeout: 9e4, defaultHeaders });
  const wrapper = client2;
  wrapper.defaultModel = PROVIDER_MODELS[provider];
  wrapper.provider = provider;
  return wrapper;
}
function isFailoverError(e) {
  const status = e?.status ?? e?.statusCode ?? e?.response?.status;
  if (status === 429 || status >= 500 && status < 600) return true;
  const msg = (e?.message || "").toLowerCase();
  return /rate.?limit|\b429\b|quota|insufficient_quota|overloaded|capacity|temporarily|timeout|invalid response body|econnreset|fetch failed|service unavailable/.test(msg);
}
function recordAiHealth(userId, data) {
  if (!userId) return;
  const g = global;
  g.aiHealth = g.aiHealth || {};
  g.aiHealth[userId] = { ...data, lastCallAt: (/* @__PURE__ */ new Date()).toISOString() };
}
function getAiHealth(userId) {
  return global.aiHealth?.[userId] || null;
}
function makeFailoverClient(clients, userId) {
  const primary = clients[0];
  return {
    defaultModel: primary.defaultModel,
    provider: primary.provider,
    chat: {
      completions: {
        create: async (params) => {
          let lastErr;
          const attempts = [];
          for (let i = 0; i < clients.length; i++) {
            const c = clients[i];
            const p = { ...params };
            if (i > 0 && c.defaultModel) p.model = c.defaultModel;
            attempts.push(c.provider);
            try {
              const result = await c.chat.completions.create(p);
              recordAiHealth(userId, { ok: true, provider: c.provider, model: p.model, failedOver: i > 0, attempts, lastError: i > 0 ? lastErr?.message || null : null });
              if (userId && result?.usage) {
                recordAiUsage({
                  userId,
                  provider: c.provider,
                  model: p.model,
                  promptTokens: result.usage.prompt_tokens || 0,
                  completionTokens: result.usage.completion_tokens || 0,
                  usedPlatformKey: !!c.usedPlatformKey
                }).catch(() => {
                });
              }
              return result;
            } catch (e) {
              lastErr = e;
              if (i < clients.length - 1) {
                console.warn(`[AI failover] ${c.provider} failed (${e?.status ?? e?.message}); switching to ${clients[i + 1].provider}`);
                continue;
              }
              recordAiHealth(userId, { ok: false, provider: c.provider, model: p.model, failedOver: i > 0, attempts, lastError: e?.message || String(e) });
              throw e;
            }
          }
          throw lastErr;
        }
      }
    }
  };
}
async function buildGroqEconomyClient(userGroqKey) {
  const apiKey = userGroqKey || process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const client2 = buildOpenAICompatClient("groq", apiKey);
    client2.defaultModel = "openai/gpt-oss-120b";
    client2.provider = "groq";
    return client2;
  } catch (e) {
    console.error("[AI] Failed to build Groq economy client:", e);
    return null;
  }
}
async function getUniversalAIClientForUser(userId) {
  try {
    const { storage: storage2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
    const user = await storage2.getUser(userId);
    const aiCostMode = user?.aiCostMode || "full";
    const allKeys = await storage2.getUserApiKeys(userId);
    const activeKeys = allKeys.filter((k) => k.isActive && k.isValid !== false);
    const keyFor = (p) => activeKeys.find((k) => k.provider === p)?.apiKey;
    const selModel = getUserModelPreference(userId);
    const selProvider = inferModelProvider(selModel);
    const canUsePlatformKey = await isUnderPlatformKeyCostCap(userId);
    if (!canUsePlatformKey) {
      console.warn(`[AI] user ${userId} has exceeded their platform-key AI cost cap this month \u2014 platform-key fallback disabled`);
    }
    const hasProviderKey = (p) => !!keyFor(p) || p === "groq" && !!process.env.GROQ_API_KEY && canUsePlatformKey || p === "openrouter" && !!process.env.OPENROUTER_API_KEY && canUsePlatformKey;
    const order = [];
    if (aiCostMode === "economy") {
      if (selProvider !== "groq" && hasProviderKey(selProvider)) order.push(selProvider);
      order.push("groq");
    } else if (hasProviderKey(selProvider)) {
      order.push(selProvider);
    }
    for (const p of PROVIDER_PRIORITY) if (!order.includes(p)) order.push(p);
    const clients = [];
    for (const provider of order) {
      try {
        if (provider === "groq") {
          const personalGroqKey = keyFor("groq");
          if (personalGroqKey) {
            const c = await buildGroqEconomyClient(personalGroqKey);
            if (c) {
              c.usedPlatformKey = false;
              clients.push(c);
            }
          }
          if (canUsePlatformKey && process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== personalGroqKey) {
            const c = await buildGroqEconomyClient(process.env.GROQ_API_KEY);
            if (c) {
              c.usedPlatformKey = true;
              clients.push(c);
            }
          }
          continue;
        }
        if (provider === "openrouter") {
          const personalKey = keyFor("openrouter");
          if (personalKey) {
            const c = buildOpenAICompatClient("openrouter", personalKey);
            c.usedPlatformKey = false;
            clients.push(c);
          }
          if (canUsePlatformKey && process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== personalKey) {
            const c = buildOpenAICompatClient("openrouter", process.env.OPENROUTER_API_KEY);
            c.usedPlatformKey = true;
            clients.push(c);
          }
          continue;
        }
        const apiKey = keyFor(provider);
        if (!apiKey) continue;
        if (provider === "openai") {
          const c = new OpenAI({ apiKey, maxRetries: 4, timeout: 9e4 });
          c.defaultModel = inferModelProvider(selModel) === "openai" ? selModel : PROVIDER_MODELS.openai;
          c.provider = "openai";
          c.usedPlatformKey = false;
          clients.push(c);
        } else if (provider === "anthropic") {
          const c = new AnthropicAsOpenAI(apiKey);
          c.usedPlatformKey = false;
          clients.push(c);
        } else {
          const c = buildOpenAICompatClient(provider, apiKey);
          c.usedPlatformKey = false;
          clients.push(c);
        }
      } catch (e) {
        console.error(`[AI] Failed to build ${provider} client, skipping:`, e);
      }
    }
    try {
      if (process.env.OPENAI_API_KEY && canUsePlatformKey) {
        const plat = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 4, timeout: 9e4 });
        plat.defaultModel = "gpt-4o";
        plat.provider = "openai-platform";
        plat.usedPlatformKey = true;
        clients.push(plat);
      }
    } catch {
    }
    if (clients.length) {
      if (clients[0].provider === selProvider && selModel) {
        clients[0].defaultModel = selModel;
      }
      storage2.updateUserApiKeyUsage(userId, clients[0].provider).catch(() => {
      });
      console.log(`[AI] user ${userId} client chain: ${clients.map((c) => c.provider).join(" \u2192 ")} (primary model ${clients[0].defaultModel})`);
      return makeFailoverClient(clients, userId);
    }
    if (!canUsePlatformKey) {
      throw new Error("AI_COST_CAP_EXCEEDED: Monthly AI usage cap reached for your membership tier. Add your own AI provider key in AI API Keys settings to continue.");
    }
  } catch (e) {
    if (typeof e?.message === "string" && e.message.startsWith("AI_COST_CAP_EXCEEDED")) throw e;
    console.error("Error fetching user API keys, falling back to platform key:", e);
  }
  const platformClient = openai;
  platformClient.defaultModel = "gpt-4o";
  platformClient.provider = "openai";
  platformClient.usedPlatformKey = true;
  return platformClient;
}
async function getUniversalVisionClientForUser(userId) {
  try {
    let buildProviderClient2 = function(provider, apiKey, preferredModel) {
      try {
        if (provider === "anthropic") {
          const c = new AnthropicAsOpenAI(apiKey);
          if (preferredModel && !AVAILABLE_VISION_MODELS.find((m) => m.id === preferredModel)?.textOnly) {
            c.defaultModel = preferredModel;
          }
          return c;
        }
        if (provider === "openai") {
          const c = new OpenAI({ apiKey, maxRetries: 1, timeout: 9e4 });
          c.defaultModel = preferredModel && selIsVision ? preferredModel : "gpt-4o";
          c.provider = "openai";
          return c;
        }
        if (provider === "openrouter") {
          const c = buildOpenAICompatClient("openrouter", apiKey);
          c.defaultModel = VISION_FALLBACK.openrouter;
          return c;
        }
        if (provider === "groq") {
          return null;
        }
        return buildOpenAICompatClient(provider, apiKey);
      } catch (e) {
        console.error(`[AI Vision] Failed to build ${provider} client:`, e);
        return null;
      }
    };
    var buildProviderClient = buildProviderClient2;
    const { storage: storage2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
    const user = await storage2.getUser(userId);
    const aiCostMode = user?.aiCostMode || "full";
    const allKeys = await storage2.getUserApiKeys(userId);
    const activeKeys = allKeys.filter((k) => k.isActive && k.isValid !== false);
    const keyFor = (p) => activeKeys.find((k) => k.provider === p)?.apiKey;
    const canUsePlatformKey = await isUnderPlatformKeyCostCap(userId);
    if (!canUsePlatformKey) {
      console.warn(`[AI Vision] user ${userId} has exceeded their platform-key AI cost cap this month \u2014 platform-key fallback disabled`);
    }
    const clients = [];
    const selModel = getUserModelPreference(userId);
    const selProvider = inferModelProvider(selModel);
    const selIsVision = !AVAILABLE_VISION_MODELS.find((m) => m.id === selModel)?.textOnly;
    console.log(`[AI Vision] user ${userId} selected model: ${selModel} (provider: ${selProvider}, vision: ${selIsVision})`);
    const preferredPersonalKey = keyFor(selProvider);
    if (preferredPersonalKey) {
      await storage2.updateUserApiKeyUsage(userId, selProvider).catch(() => {
      });
      const c = buildProviderClient2(selProvider, preferredPersonalKey, selModel);
      if (c) {
        c.usedPlatformKey = false;
        clients.push(c);
      }
    }
    const preferredPlatformKey = selProvider === "openrouter" && canUsePlatformKey ? process.env.OPENROUTER_API_KEY : void 0;
    if (preferredPlatformKey && preferredPlatformKey !== preferredPersonalKey) {
      const c = buildProviderClient2(selProvider, preferredPlatformKey, selModel);
      if (c) {
        c.usedPlatformKey = true;
        clients.push(c);
      }
    }
    const VISION_PROVIDERS = ["openrouter", "anthropic", "openai", "google", "mistral"];
    for (const provider of VISION_PROVIDERS) {
      if (provider === selProvider) continue;
      const personalKey = keyFor(provider);
      if (personalKey) {
        const c = buildProviderClient2(provider, personalKey);
        if (c) {
          c.usedPlatformKey = false;
          clients.push(c);
        }
      }
      const platformKey = provider === "openrouter" && canUsePlatformKey ? process.env.OPENROUTER_API_KEY : void 0;
      if (platformKey && platformKey !== personalKey) {
        const c = buildProviderClient2(provider, platformKey);
        if (c) {
          c.usedPlatformKey = true;
          clients.push(c);
        }
      }
    }
    if (process.env.OPENAI_API_KEY && canUsePlatformKey) {
      const plat = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1, timeout: 9e4 });
      plat.defaultModel = "gpt-4o-mini";
      plat.provider = "openai-platform";
      plat.usedPlatformKey = true;
      clients.push(plat);
    }
    if (clients.length) {
      storage2.updateUserApiKeyUsage(userId, clients[0].provider).catch(() => {
      });
      console.log(`[AI Vision] user ${userId} client chain: ${clients.map((c) => c.provider).join(" \u2192 ")}`);
      return makeFailoverClient(clients, userId);
    }
    if (!canUsePlatformKey) {
      throw new Error("AI_COST_CAP_EXCEEDED: Monthly AI usage cap reached for your membership tier. Add your own AI provider key in AI API Keys settings to continue.");
    }
  } catch (e) {
    if (typeof e?.message === "string" && e.message.startsWith("AI_COST_CAP_EXCEEDED")) throw e;
    console.error("Error building vision client, falling back to platform key:", e);
  }
  const platformClient = getDefaultOpenAIClient();
  platformClient.defaultModel = "gpt-4o-mini";
  platformClient.provider = "openai";
  platformClient.usedPlatformKey = true;
  return platformClient;
}
async function getOpenAIInstanceForUser(userId) {
  return getUniversalAIClientForUser(userId);
}
async function testOpenAIApiKey() {
  try {
    const openai2 = getOpenAIInstance();
    const response = await openai2.models.list();
    return response.data.length > 0;
  } catch (error) {
    console.error("Error validating OpenAI API key:", error);
    return false;
  }
}
async function analyzeChartImage(base64Image, knownSymbol, userId) {
  try {
    let extractJsonContent2 = function(text2) {
      const fenced = text2.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenced) return fenced[1];
      const first = text2.indexOf("{");
      const last = text2.lastIndexOf("}");
      if (first !== -1 && last > first) return text2.slice(first, last + 1);
      return text2;
    };
    var extractJsonContent = extractJsonContent2;
    const aiClient = userId ? await getUniversalVisionClientForUser(userId) : getOpenAIInstance();
    const rawModel = aiClient.defaultModel || (userId ? getUserModelPreference(userId) : "gpt-4o");
    const selectedModel = resolveVisionModel(rawModel);
    if (selectedModel !== rawModel) aiClient.defaultModel = selectedModel;
    const openai2 = aiClient;
    const assetSpecificAddition = knownSymbol ? getAssetSpecificPrompt(knownSymbol) : "";
    const assetConfig = knownSymbol ? getAssetSpecificConfig(knownSymbol) : null;
    const providerName = aiClient.provider || "unknown";
    console.log(`[AI Analysis] Using model: ${selectedModel} provider: ${providerName} for user ${userId || "platform"}`);
    const visionResponse = await openai2.chat.completions.create({
      model: selectedModel,
      messages: [
        {
          role: "system",
          content: `You are an expert trading chart analyst with deep expertise in technical analysis, volume analysis, and momentum indicators. Analyze the trading chart image and provide detailed, accurate analysis.
          
          CRITICAL ANALYSIS REQUIREMENTS:
          
          1. VOLUME & MOMENTUM ANALYSIS (Priority):
             - Analyze volume bars visible on the chart to assess buying/selling pressure
             - Look for volume divergences that could signal trend reversals
             - Identify momentum indicators (RSI, MACD, Stochastic if visible)
             - Assess whether volume confirms or contradicts price action${assetSpecificAddition}
             - Higher volume on breakouts increases signal reliability
             - Low volume in trends suggests potential reversal
          
          2. UNBIASED SIGNAL DIRECTION:
             - Consider BOTH bullish and bearish scenarios equally
             - If price is at resistance with bearish volume/momentum, suggest SELL
             - If price is at support with bullish volume/momentum, suggest BUY
             - Volume should CONFIRM direction (e.g., rising prices need rising volume)
             - Momentum indicators (RSI >70 = overbought/SELL, RSI <30 = oversold/BUY)
          
          3. ATR-BASED STOP LOSS CALCULATION:
             - Estimate the Average True Range (ATR) from visible price action
             - Provide multiple stop loss options based on ATR multiples:
               * Conservative: 1x ATR
               * Balanced: 1.5x ATR (recommended for most trades)
               * Aggressive: 2x ATR (for swing trades)
             - ATR-based stops adapt to market volatility and reduce premature stop-outs
          
          4. TECHNICAL ANALYSIS:
             - Identify chart patterns, support/resistance levels
             - Analyze trend direction across multiple timeframes if visible
             - Consider confluence of multiple indicators for higher confidence
          
          5. VOLUME SESSIONS ANALYSIS:
             - Asian, London, New York session characteristics
             - Best trading times based on currency pair and volume
          
          6. CANDLESTICK SIGNIFICANCE ANALYSIS (NEW INDICATOR):
             - Identify all visible candlestick patterns (Doji, Hammer, Engulfing, Morning/Evening Star, etc.)
             - Assess significance based on location (at support/resistance, after trend, at breakout)
             - Rate each pattern's reliability and trading implications
             - Consider pattern clusters and confluences
             - Provide actionable insights for each significant pattern
          
          CRITICAL OUTPUT FORMAT: Your entire response must be a single valid JSON object.
          - Start your response with '{' and end with '}'
          - Do NOT use markdown code blocks (no backticks, no \`\`\`json)
          - Do NOT include any text before or after the JSON
          - Include placeholder values rather than omitting properties
          - For numeric fields you cannot determine, use a string (e.g., "Unknown")
          - All properties in the response schema are required`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this trading chart in detail and provide the following information in structured JSON format:

{
  "symbol": string,           // Name of the trading pair or symbol (e.g. "EURUSD", "BTCUSD")
  "timeframe": string,        // Chart timeframe (e.g. "1H", "4H", "1D")
  "currentPrice": string,     // Current price visible on the chart
  "direction": string,        // "BUY" or "SELL" signal based on volume, momentum, and technical analysis
  "trend": string,            // "Bullish" or "Bearish"
  "confidence": string,       // "Low", "Medium", or "High" - higher if volume confirms the signal
  "entryPoint": string,       // Suggested entry price
  "exitPoint": string,        // Suggested exit price
  "stopLoss": string,         // Suggested stop loss level (can be based on ATR)
  "takeProfit": string,       // Suggested take profit level
  "riskRewardRatio": string,  // Risk-to-reward ratio (e.g. "1:2", "1:3")
  "potentialPips": string,    // Potential pips/points in the trade
  "atrStopLoss": {            // ATR-based stop loss options (REQUIRED)
    "atrValue": string,       // Estimated ATR value from chart (e.g. "0.0045")
    "atr1x": string,          // Conservative stop: current price +/- 1x ATR
    "atr15x": string,         // Balanced stop: current price +/- 1.5x ATR (RECOMMENDED)
    "atr2x": string,          // Wide stop: current price +/- 2x ATR
    "recommended": string     // Your recommended stop loss from the above options
  },
  "momentumIndicators": {     // Momentum and volume indicators (REQUIRED)
    "rsi": {                  // RSI if visible, otherwise estimate from price action
      "value": string,        // e.g. "68"
      "signal": string,       // "Overbought", "Oversold", "Neutral"
      "interpretation": string // Brief explanation
    },
    "macd": {                 // MACD if visible
      "value": string,        // e.g. "Bullish crossover"
      "signal": string,       // "Bullish", "Bearish", "Neutral"
      "interpretation": string
    },
    "volumeTrend": {          // Volume analysis (CRITICAL)
      "direction": string,    // "Increasing", "Decreasing", "Stable"
      "strength": string,     // "Weak", "Moderate", "Strong"
      "interpretation": string // How volume confirms or contradicts price action
    }
  },
  "patterns": [               // Array of identified chart patterns
    {
      "name": string,         // Pattern name (e.g. "Double Top", "Head and Shoulders")
      "description": string,  // Brief description
      "strength": string,     // "Weak", "Moderate", "Strong"
      "type": string,         // "Reversal", "Continuation", etc.
      "details": string       // Additional details about the pattern
    }
  ],
  "indicators": [             // Array of technical indicators visible on chart
    {
      "name": string,         // Indicator name (e.g. "RSI", "MACD", "Volume")
      "type": string,         // Type of indicator (e.g. "Oscillator", "Trend", "Volume")
      "signal": string,       // "Bullish", "Bearish", "Neutral"
      "details": string       // Additional details about the indicator
    }
  ],
  "supportResistance": [      // Array of support and resistance levels
    {
      "type": string,         // "Support" or "Resistance"
      "strength": string,     // "Weak", "Moderate", "Strong"
      "level": string         // Price level
    }
  ],
  "timeframeAnalysis": [      // Analysis across different timeframes
    {
      "timeframe": string,    // Timeframe (e.g. "1H", "4H", "1D")
      "trend": string         // "Bullish" or "Bearish" on that timeframe
    }
  ],
  "volumeAnalysis": [         // Analysis of volume patterns and best trading times
    {
      "period": string,       // Time period (e.g. "Asian Session", "London Session", "New York Session") 
      "volume": string,       // "Low", "Medium", "High" volume level
      "activity": string,     // Description of market activity during this period
      "quality": string       // Quality of trading opportunities ("Poor", "Average", "Excellent")
    }
  ],
  "preferredVolumeThreshold": string, // Preferred volume level (e.g. "150% above average", "2x average volume")
  "preferredTradingTime": string,     // Best time to trade (e.g. "London Session", "US Market Open")
  "candlestickSignificance": {        // Candlestick pattern analysis as an indicator (REQUIRED)
    "overallSignal": string,          // "Strong Buy", "Buy", "Neutral", "Sell", "Strong Sell"
    "reliability": string,            // "Low", "Medium", "High" - how reliable the signals are
    "patterns": [                     // Array of identified candlestick patterns
      {
        "name": string,               // Pattern name (e.g., "Doji", "Hammer", "Bullish Engulfing")
        "type": string,               // "Bullish", "Bearish", or "Neutral"
        "significance": string,       // "Low", "Medium", "High", "Very High"
        "location": string,           // Where it appears (e.g., "At key support", "After downtrend")
        "description": string,        // Brief explanation of what this pattern means
        "actionableInsight": string   // What traders should consider doing
      }
    ],
    "keyObservation": string,         // Most important observation about recent candles
    "tradingImplication": string      // What this means for trading decisions
  },
  "recommendation": string,   // Overall trading recommendation considering volume and momentum
  "steps": string[],          // Array of actionable steps to take
  "volumeProfile": {           // Price-level volume profile (REQUIRED \u2014 estimate from visible bars/candles)
    "poc": number,             // Point of Control: price level with highest traded volume
    "vah": number,             // Value Area High: upper boundary of 70% value area
    "val": number,             // Value Area Low: lower boundary of 70% value area
    "currentPrice": number,    // Current/last close price visible on the chart
    "hvnLevels": number[],     // High Volume Node prices (2-4 significant support/resistance prices)
    "lvnLevels": number[],     // Low Volume Node prices (1-3 thin zones where price moves fast)
    "levels": [                // 8-15 price levels with relative volume 0-100
      { "price": number, "volume": number }
    ]
  },
  "orgStrategyInsight": {     // VEDD platform strategy framework assessment (REQUIRED)
    "strategyName": string,      // Which top strategy best matches this setup: "ICT AMD Kill Zone", "SMC Order Block Raid", "Wyckoff Accumulation/Distribution", "Fibonacci OTE Reversal", "Session Breakout Momentum", "Trend Continuation Pullback", or similar
    "alignment": string,         // How well price action aligns: "Strong", "Moderate", "Weak", or "None"
    "institutionalBias": string, // Smart money directional lean: "Bullish", "Bearish", or "Neutral"
    "keyFactor": string,         // The single most important factor confirming or negating the strategy (e.g. "Price swept Asian low and reclaimed OB" or "Volume absent on breakout")
    "insight": string,           // 1-2 sentence expert institutional analysis of this specific setup
    "actionNote": string         // One concrete thing the trader should watch for or do right now based on this strategy framework
  }
}

IMPORTANT: All fields marked as REQUIRED must be included in your response with actual data, not "Unknown".`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 8192
    });
    const rawLen = visionResponse.choices[0].message.content?.length ?? 0;
    const finishReason = visionResponse.choices[0].finish_reason;
    console.log(`OpenAI JSON Response (${rawLen} chars, finish_reason=${finishReason}):`, visionResponse.choices[0].message.content?.slice(0, 300));
    const rawContent = visionResponse.choices[0].message.content;
    const contentStr = extractJsonContent2(rawContent);
    let response;
    try {
      response = JSON.parse(contentStr);
      console.log("Parsed response successfully");
    } catch (parseError) {
      console.error("Failed to parse JSON response:", parseError);
      console.log("Response content:", rawContent.slice(0, 500));
      response = {};
    }
    const symbol = typeof response.symbol === "string" ? response.symbol : "Unknown";
    const analysisResponse = {
      symbol,
      timeframe: typeof response.timeframe === "string" ? response.timeframe : "Unknown",
      currentPrice: typeof response.currentPrice === "string" ? response.currentPrice : "Unknown",
      direction: typeof response.direction === "string" ? response.direction : "Unknown",
      trend: typeof response.trend === "string" ? response.trend : "Unknown",
      confidence: typeof response.confidence === "string" ? response.confidence : "Medium",
      entryPoint: typeof response.entryPoint === "string" ? response.entryPoint : "Unknown",
      exitPoint: typeof response.exitPoint === "string" ? response.exitPoint : "Unknown",
      stopLoss: typeof response.stopLoss === "string" ? response.stopLoss : "Unknown",
      takeProfit: typeof response.takeProfit === "string" ? response.takeProfit : "Unknown",
      riskRewardRatio: typeof response.riskRewardRatio === "string" ? response.riskRewardRatio : "Unknown",
      potentialPips: typeof response.potentialPips === "string" ? response.potentialPips : "Unknown",
      volatilityScore: 50,
      // Default medium volatility, client will recalculate
      volatilityData: {
        score: 50,
        atr: 1e-3,
        standardDeviation: 15e-4,
        range: 0.01,
        historicalRank: 50,
        riskFactor: 50
      },
      // ATR-based stop loss options
      atrStopLoss: response.atrStopLoss && typeof response.atrStopLoss === "object" ? {
        atrValue: response.atrStopLoss.atrValue || "0.0010",
        atr1x: response.atrStopLoss.atr1x || "Unknown",
        atr15x: response.atrStopLoss.atr15x || "Unknown",
        atr2x: response.atrStopLoss.atr2x || "Unknown",
        recommended: response.atrStopLoss.recommended || "Unknown"
      } : void 0,
      // Momentum indicators
      momentumIndicators: response.momentumIndicators && typeof response.momentumIndicators === "object" ? {
        rsi: response.momentumIndicators.rsi,
        macd: response.momentumIndicators.macd,
        stochastic: response.momentumIndicators.stochastic,
        volumeTrend: response.momentumIndicators.volumeTrend
      } : void 0,
      // Candlestick significance analysis
      candlestickSignificance: response.candlestickSignificance && typeof response.candlestickSignificance === "object" ? {
        overallSignal: response.candlestickSignificance.overallSignal || "Neutral",
        reliability: response.candlestickSignificance.reliability || "Medium",
        patterns: Array.isArray(response.candlestickSignificance.patterns) ? response.candlestickSignificance.patterns : [],
        keyObservation: response.candlestickSignificance.keyObservation || "No significant patterns detected",
        tradingImplication: response.candlestickSignificance.tradingImplication || "Continue monitoring for clearer signals"
      } : void 0,
      // Generate market trend data for related pairs
      marketTrends: await generateMarketTrendPredictions(symbol),
      patterns: Array.isArray(response.patterns) ? response.patterns : [],
      indicators: Array.isArray(response.indicators) ? response.indicators : [],
      supportResistance: Array.isArray(response.supportResistance) ? response.supportResistance : [],
      timeframeAnalysis: Array.isArray(response.timeframeAnalysis) ? response.timeframeAnalysis : [],
      volumeAnalysis: Array.isArray(response.volumeAnalysis) && response.volumeAnalysis.length > 0 ? response.volumeAnalysis : (() => {
        const symbol2 = typeof response.symbol === "string" ? response.symbol : "Unknown";
        const defaultVolume = [
          {
            period: "Asian Session",
            volume: "Medium",
            activity: "Moderate price action with occasional breakouts during Tokyo open",
            quality: "Average"
          },
          {
            period: "London Session",
            volume: "High",
            activity: "Increased volatility and liquidity as European markets open",
            quality: "Excellent"
          },
          {
            period: "New York Session",
            volume: "High",
            activity: "Peak trading volume when both European and US markets are active",
            quality: "Excellent"
          }
        ];
        if (symbol2.includes("JPY") || symbol2.includes("AUD") || symbol2.includes("NZD")) {
          defaultVolume[0].volume = "High";
          defaultVolume[0].quality = "Excellent";
          defaultVolume[0].activity = "Strong price movements and liquidity during Tokyo/Sydney sessions";
        } else if (symbol2.includes("GBP") || symbol2.includes("EUR") || symbol2.includes("CHF")) {
          defaultVolume[1].volume = "Very High";
          defaultVolume[1].activity = "Peak liquidity and volatility for European currencies";
        } else if (symbol2.includes("CAD")) {
          defaultVolume[2].volume = "Very High";
          defaultVolume[2].activity = "Highest volatility during New York and Toronto market hours";
        }
        return defaultVolume;
      })(),
      recommendation: typeof response.recommendation === "string" ? response.recommendation : "No recommendation available",
      steps: Array.isArray(response.steps) ? response.steps : [],
      orgStrategyInsight: response.orgStrategyInsight && typeof response.orgStrategyInsight === "object" ? {
        strategyName: typeof response.orgStrategyInsight.strategyName === "string" ? response.orgStrategyInsight.strategyName : "Unknown",
        alignment: typeof response.orgStrategyInsight.alignment === "string" ? response.orgStrategyInsight.alignment : "Weak",
        institutionalBias: typeof response.orgStrategyInsight.institutionalBias === "string" ? response.orgStrategyInsight.institutionalBias : "Neutral",
        keyFactor: typeof response.orgStrategyInsight.keyFactor === "string" ? response.orgStrategyInsight.keyFactor : "",
        insight: typeof response.orgStrategyInsight.insight === "string" ? response.orgStrategyInsight.insight : "",
        actionNote: typeof response.orgStrategyInsight.actionNote === "string" ? response.orgStrategyInsight.actionNote : ""
      } : void 0,
      volumeProfile: (() => {
        const vp = response.volumeProfile;
        if (!vp || typeof vp !== "object" || !vp.poc || !Array.isArray(vp.levels) || vp.levels.length === 0) return void 0;
        return {
          poc: Number(vp.poc),
          vah: Number(vp.vah || vp.poc),
          val: Number(vp.val || vp.poc),
          currentPrice: vp.currentPrice ? Number(vp.currentPrice) : void 0,
          hvnLevels: Array.isArray(vp.hvnLevels) ? vp.hvnLevels.map(Number).filter(Boolean) : [],
          lvnLevels: Array.isArray(vp.lvnLevels) ? vp.lvnLevels.map(Number).filter(Boolean) : [],
          levels: vp.levels.filter((l) => l && typeof l.price === "number" && typeof l.volume === "number").map((l) => ({ price: Number(l.price), volume: Number(l.volume) }))
        };
      })()
    };
    return analysisResponse;
  } catch (error) {
    console.error("Error analyzing chart:", error);
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error("Failed to analyze chart image");
    }
  }
}
async function generateTradingTip(symbol, timeframe = "4H", marketContext = "") {
  const openai2 = getOpenAIInstance();
  const prompt = `Generate a concise trading tip for ${symbol} on the ${timeframe} timeframe.
${marketContext ? `Current market context: ${marketContext}` : ""}

Analyze potential trade opportunities for ${symbol} based on recent price action, key support/resistance levels, 
and relevant indicators. Focus on actionable advice for traders.

Format your response as a JSON object with these fields:
- tip: A concise 1-2 sentence trading recommendation
- direction: Either "buy", "sell", or "neutral"
- confidence: A number from 1-100 representing confidence in this tip
- key_levels: An object containing "support" and "resistance" price levels

Keep the tip under 150 characters - direct and actionable.`;
  try {
    const response = await openai2.chat.completions.create({
      model: "gpt-4o",
      // use the newest model
      messages: [
        { role: "system", content: "You are a professional forex and crypto trading advisor with 15+ years of experience." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });
    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Failed to generate trading tip");
    }
    try {
      const tipData = JSON.parse(content);
      return {
        tip: tipData.tip || "No tip available",
        direction: tipData.direction || "neutral",
        confidence: Number(tipData.confidence) || 50,
        key_levels: {
          support: tipData.key_levels?.support || "N/A",
          resistance: tipData.key_levels?.resistance || "N/A"
        }
      };
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      throw new Error("Failed to parse trading tip");
    }
  } catch (error) {
    console.error("Error generating trading tip:", error);
    throw error;
  }
}
async function extractTextFromImage(base64Image) {
  try {
    const openai2 = getOpenAIInstance();
    const visionResponse = await openai2.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text visible in this trading chart image. Focus on price values, indicators, timeframes, and any other relevant information."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1e3
    });
    return visionResponse.choices[0].message.content || "";
  } catch (error) {
    console.error("Error extracting text from image:", error);
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error("Failed to extract text from image");
    }
  }
}
async function generateMarketTrendPredictions(mainSymbol) {
  try {
    const openai2 = getOpenAIInstance();
    const response = await openai2.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a professional forex and trading market analyst with deep technical analysis expertise. Generate accurate trend predictions for currency pairs related to the main pair being analyzed. Your predictions should be based on recent market patterns, economic data, and technical indicators."
        },
        {
          role: "user",
          content: `Based on the current analysis of ${mainSymbol}, predict the market trends for 8-12 related trading pairs. For each pair, provide: pair name, probability (0-100), direction (bullish/bearish/neutral), and signal strength (0-100). Format your response as a JSON array of objects with the field name 'predictions'.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });
    const parsedResponse = JSON.parse(response.choices[0].message.content || "{}");
    if (Array.isArray(parsedResponse.predictions)) {
      return parsedResponse.predictions.map((pred) => ({
        pair: pred.pair || "Unknown Pair",
        probability: typeof pred.probability === "number" ? pred.probability : parseInt(pred.probability) || 50,
        direction: pred.direction === "bullish" || pred.direction === "bearish" || pred.direction === "neutral" ? pred.direction : "neutral",
        strength: typeof pred.strength === "number" ? pred.strength : parseInt(pred.strength) || 50,
        timestamp: Date.now()
      }));
    }
    return generateFallbackTrendData(mainSymbol);
  } catch (error) {
    console.error("Error generating market trend predictions:", error);
    return generateFallbackTrendData(mainSymbol);
  }
}
function generateFallbackTrendData(mainSymbol) {
  const currencyPairs = [
    "EUR/USD",
    "GBP/USD",
    "USD/JPY",
    "USD/CHF",
    "USD/CAD",
    "AUD/USD",
    "NZD/USD",
    "EUR/GBP"
  ];
  const relatedPairs = currencyPairs.filter((pair) => pair !== mainSymbol).slice(0, 8);
  return relatedPairs.map((pair) => {
    const random = Math.random();
    let direction;
    if (random < 0.4) {
      direction = "bullish";
    } else if (random < 0.8) {
      direction = "bearish";
    } else {
      direction = "neutral";
    }
    return {
      pair,
      probability: Math.round(60 + Math.random() * 35),
      // 60-95%
      direction,
      strength: Math.round(20 + Math.random() * 75),
      // 20-95
      timestamp: Date.now()
    };
  });
}
async function generatePresentationOutline(eventTitle, eventDescription, talkingPoints, agenda, duration) {
  if (!openai) {
    throw new Error("OpenAI API key is not configured");
  }
  const prompt = `You are creating a professional presentation outline for a live trading/educational event. 
  
EVENT DETAILS:
- Title: ${eventTitle}
- Description: ${eventDescription}
- Duration: ${duration} minutes
- Key Talking Points: ${talkingPoints.join(", ")}
- Agenda: ${agenda.map((a) => `${a.time}: ${a.topic}`).join("; ")}

Create a visually engaging presentation outline with ${Math.max(3, Math.min(10, Math.floor(duration / 5)))} slides.

Each slide MUST have:
1. A compelling title (short, impactful)
2. 2-4 bullet points (concise, action-oriented)
3. An EXPLAINER EXAMPLE - a simple analogy or everyday comparison that makes the concept click (e.g., "A stop loss is like a safety net for a trapeze artist - you hope you never need it, but it saves you when things go wrong")
4. A REAL-WORLD EXAMPLE - a specific, concrete scenario with names/numbers (e.g., "When Bitcoin dropped 40% in May 2021, traders using 3% stop losses preserved 97% of capital")
5. A NOTABLE INCIDENT - a famous trading story or market event (e.g., "Nick Leeson lost $1.3B and collapsed Barings Bank by hiding losses")
6. KEY REASONS - 2-3 specific reasons WHY this matters with data (e.g., "Studies show 90% of day traders lose money due to emotional trading")
7. Brief speaker notes
8. Visual suggestion (icon/graphic idea)
9. Approximate duration

CRITICAL: 
- Explainer examples should use everyday analogies (cooking, sports, driving, etc.) to make complex trading concepts easy to understand
- Real-world examples, incidents, and reasons must be SPECIFIC and MEMORABLE with real names, numbers, and events

Style guidelines:
- Professional trading/finance theme
- Clear, educational tone
- Actionable insights with proof
- Memorable stories that stick

Return a JSON object with this exact structure:
{
  "eventTitle": "string",
  "totalSlides": number,
  "estimatedDuration": "string",
  "slides": [
    {
      "slideNumber": 1,
      "title": "string",
      "bulletPoints": ["point1", "point2", "point3"],
      "explainerExample": "Simple analogy using everyday concepts to explain the topic",
      "realWorldExample": "Specific example with names and numbers",
      "notableIncident": "Famous trading story or market event",
      "keyReasons": ["Reason 1 with data", "Reason 2 with statistics"],
      "speakerNotes": "string",
      "visualSuggestion": "string",
      "duration": "2 min"
    }
  ]
}`;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert presentation designer for trading and financial education. Create compelling, professional slide outlines. Always return valid JSON."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_tokens: 2e3,
      // was 4000 — slide outlines don't need that many tokens
      temperature: 0.7
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }
    const result = JSON.parse(content);
    return result;
  } catch (error) {
    console.error("Error generating presentation outline:", error);
    return {
      eventTitle,
      totalSlides: 3,
      estimatedDuration: `${duration} minutes`,
      slides: [
        {
          slideNumber: 1,
          title: "Welcome & Overview",
          bulletPoints: ["Session objectives", "What you'll learn today", "Key takeaways"],
          speakerNotes: "Introduce yourself and set expectations",
          visualSuggestion: "Welcome graphic with logo",
          duration: "3 min"
        },
        {
          slideNumber: 2,
          title: eventTitle,
          bulletPoints: talkingPoints.slice(0, 4),
          speakerNotes: "Cover the main content",
          visualSuggestion: "Chart or diagram",
          duration: `${Math.floor(duration * 0.7)} min`
        },
        {
          slideNumber: 3,
          title: "Summary & Next Steps",
          bulletPoints: ["Key points recap", "Action items", "Questions?"],
          speakerNotes: "Wrap up and take questions",
          visualSuggestion: "Checklist graphic",
          duration: "5 min"
        }
      ]
    };
  }
}
async function scanGrantsWithAI(grantTypes, isAdmin, userId) {
  const typeLabels = {
    business_fintech: "Business Development & Fintech",
    community_dev: "Community Development & Economic Empowerment",
    ambassador_education: "Ambassador Programs & Financial Education",
    international: "International Expansion & Global Programs",
    ai_focused: "AI & Technology Innovation"
  };
  const typesText = grantTypes.map((t) => typeLabels[t] || t).join(", ");
  const systemPrompt = "You are an expert grant researcher specializing in fintech, community development, and technology education funding. Return only valid JSON with a 'grants' array.";
  const userPrompt = `Based on your knowledge of real grant programs, foundations, and government initiatives, identify ${isAdmin ? "20-25" : "10-15"} grants relevant to this organization:

${VEDD_IDENTITY_CONTEXT}

Focus on grant categories: ${typesText}

Include: Federal programs (SBA, CDFI Fund, EDA, NSF, HUD), private foundations (Kauffman, JPMorgan Chase, etc.), corporate grants, fintech accelerators.

Return JSON: { "grants": [ { "title", "funder", "description", "fundingAmount", "deadline" (null or YYYY-MM-DD), "eligibilityCriteria" (array), "applicationUrl", "grantType" (business_fintech|community_dev|ambassador_education|international|ai_focused), "targetAudience" (business|ambassador|both), "geographicScope", "relevanceScore" (60-100), "aiScanNotes" } ] }`;
  try {
    const aiClient = userId ? await getUniversalAIClientForUser(userId) : null;
    let content = null;
    const client2 = aiClient || openai;
    const model = aiClient ? aiClient.defaultModel : "gpt-4o";
    const response = await client2.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      max_tokens: 6e3,
      temperature: 0.4
    });
    content = response.choices[0]?.message?.content || null;
    if (!content) throw new Error("No response from AI");
    const parsed = JSON.parse(content);
    return parsed.grants || [];
  } catch (error) {
    console.error("Grant scan AI error:", error);
    throw error;
  }
}
async function generateGrantProposal(grant, mode, options) {
  const eligibilityText = Array.isArray(grant.eligibilityCriteria) ? grant.eligibilityCriteria.join(", ") : grant.eligibilityCriteria || "See grant requirements";
  const fundingAmt = grant.fundingAmount || "Amount not specified";
  const baseContext = `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
GRANT OPPORTUNITY DETAILS
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
Grant Title: ${grant.title}
Funding Organization: ${grant.funder}
Grant Description: ${grant.description}
Funding Amount Available: ${fundingAmt}
Eligibility Requirements: ${eligibilityText}
Grant Category: ${grant.grantType}

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
APPLICANT ORGANIZATION \u2014 VEDD AI TRADING
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
${VEDD_IDENTITY_CONTEXT}

DIFFERENTIATORS (use these to stand out):
- First-mover AI trading education platform integrated with Solana blockchain infrastructure
- Proprietary 44-day Ambassador Certification Program with NFT-based credentialing
- Faith-based community trust networks across multiple U.S. cities \u2014 channels that traditional fintech cannot access
- Ambassador network model creates self-sustaining economic micro-ecosystems in underserved areas
- Dual revenue model (subscriptions + VEDD token ecosystem) demonstrates financial sustainability
- Technology democratizes tools previously available only to institutional traders ($50/month vs. $10,000+/year for institutional platforms)
- Measurable community outcomes: each ambassador directly impacts 50-200 community members in financial literacy
`;
  const aiClient = options?.userId ? await getUniversalAIClientForUser(options.userId) : null;
  const client2 = aiClient || openai;
  const model = aiClient ? aiClient.defaultModel : "gpt-4o";
  const callAI = async (systemMsg, userMsg, maxTokens = 4500) => {
    const response = await client2.chat.completions.create({
      model,
      messages: [{ role: "system", content: systemMsg }, { role: "user", content: userMsg }],
      max_tokens: maxTokens,
      temperature: 0.65
    });
    return response.choices[0]?.message?.content || "";
  };
  if (mode === "auto") {
    const content = await callAI(
      MASTER_GRANT_WRITER_SYSTEM,
      `Write a complete, competition-winning grant proposal for VEDD AI Trading to submit to ${grant.funder} for the "${grant.title}" grant.

${baseContext}

PROPOSAL REQUIREMENTS:
Write a 2,200\u20133,000 word professional grant proposal with the following clearly formatted sections. Each section must be substantive, specific, and funder-aligned. Do NOT use placeholders. Write as if this is the final submission.

## EXECUTIVE SUMMARY
(250\u2013300 words) Lead with the funder's mission. State: who VEDD is, what specific problem this grant will solve, what VEDD will do with the funding, the measurable outcomes, and the funding amount requested. Make the first sentence impossible to ignore.

## STATEMENT OF NEED
(300\u2013400 words) Build an urgent, data-grounded case for the problem. Use national and community-level statistics on financial exclusion, the wealth gap, lack of access to investment tools in underserved communities, and the cost of financial illiteracy. Connect this directly to ${grant.funder}'s stated priorities. This is where reviewers decide whether your project matters.

## ORGANIZATIONAL BACKGROUND & CAPACITY
(250\u2013350 words) Establish VEDD's credibility and readiness. Highlight: founding mission, platform capabilities, ambassador network scale, technical infrastructure, team expertise, and any existing community partnerships. Include specific metrics where possible. Demonstrate you have the organizational muscle to deliver.

## PROJECT DESCRIPTION
(400\u2013500 words) Describe exactly what VEDD will do with this grant funding. Be specific: activities, timelines, team responsibilities, community partners, and delivery methods. Use a Theory of Change frame: Activities \u2192 Outputs \u2192 Outcomes \u2192 Long-term Impact. Make this feel real and executable, not theoretical.

## GOALS, OBJECTIVES & EVALUATION PLAN
(300\u2013350 words) List 4\u20135 SMART objectives (Specific, Measurable, Achievable, Relevant, Time-bound). For each, include: the target number, how it will be measured, and the reporting timeline. Include a brief evaluation methodology: how VEDD will collect data, track progress, and report to the funder.

## BUDGET NARRATIVE
(200\u2013300 words) Justify the use of ${fundingAmt} with line-item categories (personnel, technology infrastructure, training materials, community outreach, evaluation, indirect costs). Show cost-effectiveness by noting what each dollar achieves in terms of community impact. Demonstrate fiscal responsibility.

## SUSTAINABILITY PLAN
(200\u2013250 words) Explain how this program continues after the grant period ends. Reference VEDD's subscription revenue model, token ecosystem, growing ambassador network, and plans for follow-on funding. Funders need to know their investment won't disappear.

## COMMUNITY IMPACT & EQUITY STATEMENT
(200\u2013250 words) Paint a vivid, specific picture of who benefits and how. Name the communities. Use "before and after" language. Connect to themes of equity, access, and economic justice that resonate with ${grant.funder}'s values.

## CONCLUSION
(150\u2013200 words) End with bold, forward-looking vision. Reinforce the partnership frame \u2014 VEDD and ${grant.funder} together accomplishing something that neither could alone. Express genuine gratitude and confidence. Leave the reviewer feeling inspired, not just informed.

CRITICAL RULES:
- Mirror ${grant.funder}'s language and values throughout
- Every statistic must be plausible and consistent with publicly known data
- Active voice, present/future tense throughout
- No filler sentences \u2014 every sentence must add value
- Professional but human \u2014 avoid academic jargon
- This proposal must stand alone as a complete, ready-to-submit document`,
      4500
    );
    return { content };
  }
  if (mode === "guided") {
    const sectionKey = options?.sectionKey || "executiveSummary";
    const userInputs = options?.userInputs || {};
    const sectionInstructions = {
      executiveSummary: {
        title: "Executive Summary",
        words: "250\u2013300",
        tokens: 900,
        prompt: `Write a 250\u2013300 word Executive Summary that opens with ${grant.funder}'s mission and immediately connects it to VEDD's work.
${userInputs.focus ? `Reviewer focus areas to emphasize: ${userInputs.focus}` : ""}
The summary must cover: the community problem, VEDD's solution, specific activities, measurable outcomes, and the funding amount requested (${fundingAmt}).
The first sentence must be a powerful hook \u2014 a statistic, a human reality, or a bold vision statement.
End with a clear ask that makes approving this proposal feel like the obvious decision.`
      },
      orgBackground: {
        title: "Organizational Background & Capacity",
        words: "250\u2013350",
        tokens: 900,
        prompt: `Write a 250\u2013350 word Organizational Background section that positions VEDD AI Trading as the most capable, credible organization to execute this project.
${userInputs.achievements ? `Key achievements/milestones to highlight: ${userInputs.achievements}` : ""}
Include: founding story, core platform capabilities, ambassador network reach, technical infrastructure, leadership expertise, and community trust. Use specific metrics wherever possible. Avoid generalities \u2014 reviewers have seen "passionate team committed to change" a thousand times.`
      },
      statementOfNeed: {
        title: "Statement of Need",
        words: "300\u2013400",
        tokens: 1e3,
        prompt: `Write a compelling 300\u2013400 word Statement of Need using real, plausible statistics about financial exclusion, the racial wealth gap, lack of investment access in underserved communities, and the cost of financial illiteracy in America.
Connect these statistics directly to the communities VEDD serves and to ${grant.funder}'s stated mission.
Build urgency: why does this need to be addressed NOW? What worsens if it isn't?
${userInputs.communityData ? `Local/community data to incorporate: ${userInputs.communityData}` : ""}`
      },
      projectDescription: {
        title: "Project Description",
        words: "400\u2013500",
        tokens: 1100,
        prompt: `Write a 400\u2013500 word Project Description that reads like a crisp operational plan.
${userInputs.projectDetails ? `Additional project context: ${userInputs.projectDetails}` : ""}
Structure it as a Theory of Change: Activities (what VEDD will do) \u2192 Outputs (what will be produced) \u2192 Outcomes (what will change) \u2192 Impact (the lasting difference).
Be specific about: timelines, who delivers what, community partner roles, technology deployment, and training delivery methods.
Make this feel real \u2014 not "we will work to" but "we will deliver."`
      },
      goalsObjectives: {
        title: "Goals, Objectives & Evaluation Plan",
        words: "300\u2013350",
        tokens: 900,
        prompt: `Write 4\u20135 SMART objectives for VEDD's grant project, followed by an evaluation methodology.
${userInputs.goals ? `Applicant-provided goals to incorporate: ${userInputs.goals}` : ""}
Each objective must include: specific number/target, measurement method, responsible party, and deadline.
Follow with 150 words on evaluation: how will data be collected, who collects it, how frequently, and how results will be reported to ${grant.funder}.
Avoid soft language like "increase awareness" \u2014 every objective must be quantifiable.`
      },
      budgetNarrative: {
        title: "Budget Narrative",
        words: "250\u2013300",
        tokens: 850,
        prompt: `Write a 250\u2013300 word Budget Narrative justifying the use of ${fundingAmt} in grant funding.
${userInputs.budgetItems ? `Specific budget items/priorities: ${userInputs.budgetItems}` : ""}
Use these category headings: Personnel & Training, Technology Infrastructure, Community Outreach & Marketing, Program Materials, Evaluation & Reporting, Administrative/Indirect (max 15%).
For each category, explain what it covers and why it is necessary to achieve the stated outcomes.
Show cost-effectiveness: what community impact does each major expenditure produce?
Close by noting how VEDD's existing infrastructure reduces grant overhead \u2014 demonstrating efficient use of funds.`
      },
      impactStatement: {
        title: "Community Impact & Equity Statement",
        words: "250\u2013300",
        tokens: 850,
        prompt: `Write a 250\u2013300 word Community Impact and Equity Statement that paints a specific, vivid picture of who benefits and how their lives improve.
${userInputs.impactMetrics ? `Impact metrics/data to include: ${userInputs.impactMetrics}` : ""}
Name the communities. Use "before and after" framing. Connect to systemic equity themes that resonate with ${grant.funder}.
Include 3\u20134 specific measurable impact metrics (e.g., number of households reached, average income change, number of new investors onboarded).
Close with a line about the ripple effect: how each VEDD ambassador impacts their broader network.`
      },
      sustainability: {
        title: "Sustainability Plan",
        words: "200\u2013250",
        tokens: 700,
        prompt: `Write a 200\u2013250 word Sustainability Plan explaining how VEDD's programs continue and grow after the grant period ends.
Reference: VEDD's subscription revenue model, VEDD token ecosystem, growing ambassador network self-funding capacity, diversified grant pipeline, and potential earned revenue from ambassador-led events.
Be specific about year 2 and year 3 funding projections.
Funders invest in programs with futures \u2014 reassure ${grant.funder} that their investment compounds over time.`
      },
      conclusion: {
        title: "Conclusion",
        words: "150\u2013200",
        tokens: 600,
        prompt: `Write a 150\u2013200 word Conclusion that closes the proposal with vision, gratitude, and momentum.
Don't summarize \u2014 project forward. Describe what the world looks like in 3 years if this grant is funded.
Frame this as a partnership between VEDD and ${grant.funder} \u2014 two organizations with aligned missions creating outcomes neither could achieve alone.
Express authentic appreciation for the funder's consideration.
End with a confident, forward-looking sentence that makes approving this proposal feel like joining a movement.`
      }
    };
    const section = sectionInstructions[sectionKey] || sectionInstructions.executiveSummary;
    const content = await callAI(
      MASTER_GRANT_WRITER_SYSTEM,
      `Write the "${section.title}" section (${section.words} words) for a grant proposal from VEDD AI Trading to ${grant.funder} for "${grant.title}".

${baseContext}

SECTION INSTRUCTIONS:
${section.prompt}

CRITICAL: Write the section content only \u2014 no meta-commentary, no "here is the section," no headers other than the section title. This section must be ready to paste directly into the final proposal.`,
      section.tokens
    );
    return { content, sections: { [sectionKey]: content } };
  }
  if (mode === "template") {
    const templateType = options?.templateType || (grant.grantType === "ambassador_education" ? "ambassador_program" : grant.grantType === "community_dev" ? "community_dev" : "fintech_expansion");
    const templateFocus = {
      ambassador_program: `
TEMPLATE FOCUS \u2014 Ambassador Education & Financial Literacy:
This proposal emphasizes VEDD's 44-day Ambassador Certification Program, the train-the-trainer multiplier model, NFT credentialing system, and the measurable ripple effect of each certified ambassador reaching 50\u2013200 community members.
Lead with the financial literacy crisis in underserved communities. Show how VEDD's ambassador model is uniquely scalable and self-sustaining.
Key metrics to build around: ambassadors certified, community members reached per ambassador, financial literacy scores improved, new investors onboarded, inter-city expansion milestones.`,
      fintech_expansion: `
TEMPLATE FOCUS \u2014 Fintech Innovation & Technology Access:
This proposal emphasizes VEDD's full AI trading infrastructure \u2014 live multi-broker execution (MT5 + TradeLocker), the ABBA AI strategist/voice assistant, Solana blockchain integration, an AI prediction-markets engine (Kalshi/Polymarket), and copy-trading with token profit-sharing \u2014 all delivered at democratized pricing versus institutional platforms.
Lead with the technological exclusion of retail and minority investors from AI-powered financial tools. Show how VEDD closes this gap at scale across multiple asset classes (forex, crypto, prediction markets) from one platform.
Key metrics: platform users reached, trades analyzed by AI, subscription growth, cost-per-user vs. institutional alternatives, technology adoption in underserved markets.`,
      community_dev: `
TEMPLATE FOCUS \u2014 Community Economic Development & Financial Inclusion:
This proposal emphasizes VEDD's faith-based community trust networks, inter-city economic ecosystem building, minority entrepreneur financial empowerment, and long-term wealth creation in historically disinvested communities.
Lead with the racial wealth gap and the specific barriers that VEDD is dismantling. Show how VEDD's community-embedded model works where traditional fintech cannot reach.
Key metrics: household income impact, new investor accounts opened, community GDP contribution, ambassador business development outcomes, generational wealth indicators.`
    };
    const content = await callAI(
      MASTER_GRANT_WRITER_SYSTEM,
      `Write a complete, ready-to-submit grant proposal (2,000\u20132,500 words) for VEDD AI Trading applying to ${grant.funder} for "${grant.title}."

${baseContext}

${templateFocus[templateType]}

PROPOSAL SECTIONS REQUIRED (all fully written, no placeholders):
1. Executive Summary (250 words) \u2014 funder-aligned opener, problem, solution, ask
2. Statement of Need (300 words) \u2014 data-backed urgency, community context
3. Organizational Background (250 words) \u2014 capacity proof, credibility, track record
4. Project Description (350 words) \u2014 Theory of Change, activities, deliverables, timeline
5. Goals & Objectives (250 words) \u2014 4 SMART goals with evaluation method
6. Budget Narrative (200 words) \u2014 justified use of ${fundingAmt}
7. Sustainability Plan (150 words) \u2014 post-grant continuity
8. Impact Statement (200 words) \u2014 specific community outcomes
9. Conclusion (150 words) \u2014 visionary close, partnership frame

This proposal must read like a veteran wrote it \u2014 specific, compelling, funder-centric, ready to submit.`,
      4e3
    );
    return { content };
  }
  return { content: "" };
}
async function generateSocialOutreachKit(platform, keywords, ambassadorName, userId) {
  let resolvedApiKey = process.env.OPENAI_API_KEY;
  if (userId) {
    try {
      const { storage: storage2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
      const keys = await storage2.getUserApiKeys(userId);
      const userKey = keys.find((k) => k.provider === "openai" && k.isActive && k.isValid !== false);
      if (userKey?.apiKey) resolvedApiKey = userKey.apiKey;
    } catch {
    }
  }
  if (!resolvedApiKey) {
    throw new Error("No OpenAI API key available. Please add your OpenAI key in Settings \u2192 API Keys.");
  }
  const openai2 = getPlatformOpenAIClient();
  const encodedKeywords = encodeURIComponent(keywords);
  const firstHashtag = keywords.split(/[\s,]+/)[0]?.replace("#", "") || "trading";
  const systemPrompt = `You are a social media lead generation expert for VEDD Trading AI \u2014 a fintech/forex/crypto trading education platform with AI signal tools, an ambassador program, and Solana token investments. You help ambassadors find and convert prospects into VEDD subscribers.`;
  const userPrompt = `Generate a complete lead generation outreach kit for ambassador "${ambassadorName}" targeting ${platform} using these keywords/interests: "${keywords}".

Return a JSON object with these exact fields:
- hashtags: string[] \u2014 10-15 best hashtags for ${platform} matching these interests
- searchQueries: string[] \u2014 8-10 specific search query strings to find trading/finance prospects
- searchUrls: { label: string, url: string, description: string }[] \u2014 4-6 deep-link search URLs for ${platform}. Use these URL patterns:
  * Twitter/X: https://twitter.com/search?q={encoded_query}&f=people
  * Instagram: https://www.instagram.com/explore/tags/{hashtag}/
  * LinkedIn: https://www.linkedin.com/search/results/people/?keywords={encoded_query}
  * Facebook: https://www.facebook.com/search/people/?q={encoded_query}
  * TikTok: https://www.tiktok.com/search?q={encoded_query}
- dmScript: string \u2014 150-200 word personalized DM template for ${platform}, referencing trading/financial freedom, signed by ${ambassadorName}. Include [NAME] placeholder.
- commentScript: string \u2014 2-3 sentence comment to leave on target posts, curiosity-driven
- profileKeywords: string[] \u2014 8-10 keywords to look for in bios when scanning profiles
- bestTimeToPost: string \u2014 best times to engage on ${platform} for this audience
- tips: string[] \u2014 3-4 platform-specific tactics for finding and converting prospects on ${platform}

Pre-generate the URLs using encoded versions of: "${encodedKeywords}" and hashtag: "${firstHashtag}"`;
  const response = await openai2.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" },
    max_tokens: 2e3
  });
  const raw = response.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    return {
      hashtags: [],
      searchQueries: [],
      searchUrls: [],
      dmScript: "",
      commentScript: "",
      profileKeywords: [],
      bestTimeToPost: "",
      tips: []
    };
  }
}
async function enrichLeadWithAI(lead) {
  const openai2 = getPlatformOpenAIClient();
  const answersText = lead.answers && lead.answers.length > 0 ? `Quiz answers: ${lead.answers.map((a) => `Q${a.questionId}: ${a.answer}`).join(", ")}` : "No quiz answers provided.";
  const bioText = lead.bioSnippet ? `Bio/Profile snippet: "${lead.bioSnippet}"` : "No bio provided.";
  const platformText = lead.platform ? `Found on: ${lead.platform}` : "";
  const prompt = `Analyze this VEDD Trading AI prospect and return a JSON assessment (max 150 words total across all fields):

Name: ${lead.firstName}
${platformText}
${bioText}
${answersText}

Return JSON with:
- interestLevel: "High" | "Medium" | "Low"
- approach: string \u2014 1-2 sentence best outreach approach for this person
- talkingPoints: string[] \u2014 3 key talking points based on their profile/answers
- suggestedOpener: string \u2014 a specific first message opener (1-2 sentences, natural, not salesy)
- summary: string \u2014 1 sentence overall assessment

Base on VEDD's offerings: AI trading signals, financial education, passive income through referrals, trading community.`;
  const response = await openai2.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a lead qualification expert for VEDD Trading AI. Be concise and actionable." },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    max_tokens: 400
  });
  const raw = response.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    return {
      interestLevel: "Medium",
      approach: "Standard outreach recommended.",
      talkingPoints: ["AI trading signals", "Financial freedom", "Ambassador income"],
      suggestedOpener: `Hey ${lead.firstName}, noticed you're interested in trading \u2014 have you seen what AI can do for your charts?`,
      summary: "Prospect requires manual review."
    };
  }
}
function generateSlug(title) {
  const base = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim().substring(0, 60);
  return `${base}-${Date.now().toString(36)}`;
}
function estimateReadTime(html) {
  const text2 = html.replace(/<[^>]+>/g, " ");
  const wordCount = text2.trim().split(/\s+/).length;
  const minutes = Math.ceil(wordCount / 200);
  return `${minutes} min read`;
}
async function generateVeddBlogPost(topic, userId) {
  let openai2;
  let blogModel = "gpt-4o";
  try {
    openai2 = await getUniversalAIClientForUser(userId || 0);
    blogModel = openai2.defaultModel || "gpt-4o";
  } catch {
  }
  if (!openai2) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("No AI key configured. Add any AI key (OpenAI, Groq, or free OpenRouter) in AI Settings.");
    const isGroq = !process.env.OPENAI_API_KEY;
    openai2 = new OpenAI({ apiKey, ...isGroq ? { baseURL: "https://api.groq.com/openai/v1" } : {}, maxRetries: 4, timeout: 9e4 });
    blogModel = isGroq ? "openai/gpt-oss-120b" : "gpt-4o";
  }
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  let chosenTopic;
  let currentEventsContext;
  if (topic) {
    chosenTopic = topic;
    currentEventsContext = `User-specified topic: ${topic}`;
  } else {
    const topicsResponse = await openai2.chat.completions.create({
      model: blogModel,
      messages: [
        {
          role: "system",
          content: "You are a financial market analyst. Identify current hot topics in trading and finance based on your training data. Focus on what is trending, volatile, or widely discussed among traders right now."
        },
        {
          role: "user",
          content: `Today is ${today}. Identify 3 current hot topics in trading/finance/crypto that traders are most interested in. Consider: ongoing market trends, economic events, interest rate decisions, crypto movements, forex volatility, gold/commodities, AI in trading, economic uncertainty, major indices performance. Return a JSON object with: { "topics": ["topic1", "topic2", "topic3"], "chosen": "the single best topic for a VEDD Trading AI blog post", "context": "1-2 sentences describing the current market context for the chosen topic" }`
        }
      ],
      response_format: { type: "json_object" },
      // Reasoning models (Groq gpt-oss/Qwen3/etc.) spend tokens on hidden
      // reasoning before the JSON, so 300 truncated the topic selection.
      max_tokens: hasHiddenReasoningOverhead(blogModel) ? 1200 : 400
    });
    const topicsRaw = topicsResponse.choices[0]?.message?.content || "{}";
    let topicsData = {};
    try {
      topicsData = JSON.parse(topicsRaw);
    } catch {
      topicsData = { chosen: "Forex market volatility and AI trading strategies", context: "Markets are experiencing significant volatility creating opportunities for disciplined traders." };
    }
    chosenTopic = topicsData.chosen || "Forex market volatility and AI trading strategies";
    currentEventsContext = topicsData.context || `Auto-selected topic based on current market conditions as of ${today}`;
  }
  const systemPrompt = `You are the content writer for VEDD Trading AI, a faith-driven financial education platform.

VEDD BRAND VOICE:
- Brand: VEDD Trading AI (AI signal engine called "VEDD SS AI")
- Tone: Confident, empowering, faith-driven, educational \u2014 with a street-urban authenticity: direct, real, from-the-block, no fluff. Talk to the reader like you know their hustle, not like a textbook.
- Key phrases: "financial freedom", "God's timing", "discipline", "strategic", "abundance mindset", "the come-up", "getting your mind right before your money right"
- Occasionally reference scripture naturally (not forced) \u2014 e.g., Proverbs, Philippians 4:13
- Weave in Supreme Mathematics (Five Percent Nation numerology) as natural thematic language where it fits the point being made \u2014 not a rigid 9-part structure, just vocabulary and framing pulled in when it lands:
  Knowledge (1) = the base \u2014 knowing the setup, the data, yourself before you risk anything
  Wisdom (2) = applying what you know \u2014 turning knowledge into a decision
  Understanding (3) = the "aha," clarity earned after Knowledge meets Wisdom in real trades
  Culture/Freedom (4) = building your own way of moving, breaking from what's been holding you back
  Power/Refinement (5) = the strength that comes from repetition and discipline, sharpened over time
  Equality (6) = balance \u2014 risk vs. reward, work vs. rest, staying even-keeled through wins and losses
  God (7) = the highest self \u2014 the version of you that shows up disciplined every single day
  Build or Destroy (8) = every trade either builds your account/character or destroys it \u2014 there's no neutral
  Born (9) = the new you that comes out the other side of doing the work
  Cipher (0) = the full circle \u2014 the community, the exchange of game, VEDD's ecosystem itself
  Use these sparingly and naturally (one or two per article at most) \u2014 never force all ten into a single post.
- Target audience: Everyday people learning forex/crypto trading, aspiring ambassadors, side-hustle seekers
- Always tie current events back to VEDD tools: VEDD SS AI signal engine, Weekly Strategy Plan, Solana scanner, Ambassador program, 44-day trading system
- Every article ends with a CTA to join VEDD or try a free demo

CONTENT RULES:
- Length: 600-900 words
- Use HTML tags: <h2>, <h3>, <p>, <ul>/<li>, <strong>, <em>
- Use headings to break up sections
- Bold key trading terms and important phrases
- Write in second person ("you", "your trades")
- Practical, actionable advice \u2014 not just theory
- CTA at the end linking to sign up or the platform

OUTPUT: Return a JSON object with these exact fields:
{
  "title": "compelling SEO-friendly title (max 80 chars)",
  "excerpt": "2-sentence summary that hooks readers (max 200 chars)",
  "category": one of: "Trading Strategy" | "Trading Psychology" | "Technical Analysis" | "Crypto Trading" | "Forex Trading" | "Market Analysis" | "Financial Education",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "content": "full HTML article content"
}`;
  const articleResponse = await openai2.chat.completions.create({
    model: blogModel,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Write a VEDD Trading AI blog post about: ${chosenTopic}

Market context: ${currentEventsContext}

Make it timely, relevant to current market conditions, and show how VEDD's tools help traders navigate these conditions. Include practical takeaways.`
      }
    ],
    response_format: { type: "json_object" },
    // A 600-900 word HTML article wrapped in JSON needs real headroom — 1800
    // truncated the JSON mid-article, which failed JSON.parse and fell back to a
    // tiny stub (the "articles aren't full" bug). Reasoning models need even more
    // since they burn tokens on hidden reasoning before emitting the article.
    max_tokens: hasHiddenReasoningOverhead(blogModel) ? 6e3 : 4e3
  });
  const articleRaw = articleResponse.choices[0]?.message?.content || "{}";
  if (articleResponse.choices[0]?.finish_reason === "length") {
    console.warn("[Blog] Article generation hit the token limit \u2014 output may be truncated; consider raising max_tokens.");
  }
  let articleData = {};
  try {
    articleData = JSON.parse(articleRaw);
  } catch {
    articleData = {
      title: `Market Insight: ${chosenTopic}`,
      excerpt: "VEDD Trading AI brings you the latest market analysis to help you trade with confidence and precision.",
      category: "Market Analysis",
      tags: ["Trading", "VEDD", "Market Analysis"],
      content: `<p>Markets are moving. Are you positioned to take advantage? With VEDD Trading AI, you have the tools, signals, and community to make informed decisions every day.</p><p><a href="/auth">Join VEDD today and start your journey to financial freedom.</a></p>`
    };
  }
  const title = articleData.title || `Trading Insight: ${chosenTopic}`;
  const content = articleData.content || "";
  return {
    title,
    slug: generateSlug(title),
    excerpt: articleData.excerpt || `Discover how ${chosenTopic} creates opportunities for disciplined traders using VEDD's AI-powered tools.`,
    content,
    category: articleData.category || "Trading Strategy",
    tags: articleData.tags || ["Trading", "VEDD", "Market Analysis"],
    readTime: estimateReadTime(content),
    currentEventsContext
  };
}
async function generateReelScript(topic, userId) {
  let openai2;
  let model = "gpt-4o";
  try {
    openai2 = await getUniversalAIClientForUser(userId || 0);
    model = openai2.defaultModel || "gpt-4o";
  } catch {
  }
  if (!openai2) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("No AI key configured. Add any AI key (OpenAI, Groq, or free OpenRouter) in AI Settings.");
    const isGroq = !process.env.OPENAI_API_KEY;
    openai2 = new OpenAI({ apiKey, ...isGroq ? { baseURL: "https://api.groq.com/openai/v1" } : {}, maxRetries: 4, timeout: 9e4 });
    model = isGroq ? "openai/gpt-oss-120b" : "gpt-4o";
  }
  const systemPrompt = `You write short-form social reel scripts for VEDD Trading AI, a faith-driven financial education platform (brand voice: confident, empowering, street-urban authentic, no fluff \u2014 talk to the reader like you know their hustle).

The reel clip itself is only 5-6 seconds of AI-generated video, so the script is a voiceover/on-screen-text script meant to be read over that clip plus following text cards \u2014 it does not need to match the clip's runtime exactly.

Return a JSON object with these exact fields:
{
  "hook": "one punchy opening line (max 100 chars) that stops the scroll",
  "script": ["3-5 short lines/beats after the hook, building to a CTA to join VEDD"],
  "caption": "a social caption for the post (2-4 sentences, includes a CTA to veddbuild.com, no hashtags \u2014 those get added separately)",
  "videoPrompt": "a vivid, concrete visual SCENE (1-2 sentences) for an AI video generator, staying FAITHFUL to the topic above \u2014 describe the setting, subject and mood only. Do NOT describe film style, grain, color grade or camera settings (those are applied automatically). No text overlays, captions, signage, logos or readable words. If the scene includes people, they are young Black people in contemporary streetwear in an authentic inner-city/urban setting."
}`;
  const response = await openai2.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Write a VEDD reel script about: ${topic}` }
    ],
    response_format: { type: "json_object" },
    max_tokens: 700
  });
  const raw = response.choices[0]?.message?.content || "{}";
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = {};
  }
  return {
    hook: data.hook || `Stop scrolling \u2014 this is about ${topic}.`,
    script: Array.isArray(data.script) && data.script.length > 0 ? data.script : [
      `Here's what most traders get wrong about ${topic}.`,
      `VEDD's AI signal engine keeps you disciplined when the charts get emotional.`,
      `Build your vault before this window closes.`
    ],
    caption: data.caption || `${topic} \u2014 here's how VEDD's AI keeps traders disciplined through it. Start free at veddbuild.com.`,
    videoPrompt: data.videoPrompt || `Inner-city scene evoking "${topic}": a young person in contemporary streetwear in a moody urban interior, lit by one warm gold light source, holding a phone that glows with a rising green chart, quiet and contemplative`
  };
}
async function generateSlideCarouselScript(topic, slideCount, userId) {
  let openai2;
  let model = "gpt-4o";
  try {
    openai2 = await getUniversalAIClientForUser(userId || 0);
    model = openai2.defaultModel || "gpt-4o";
  } catch {
  }
  if (!openai2) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("No AI key configured. Add any AI key (OpenAI, Groq, or free OpenRouter) in AI Settings.");
    const isGroq = !process.env.OPENAI_API_KEY;
    openai2 = new OpenAI({ apiKey, ...isGroq ? { baseURL: "https://api.groq.com/openai/v1" } : {}, maxRetries: 4, timeout: 9e4 });
    model = isGroq ? "openai/gpt-oss-120b" : "gpt-4o";
  }
  const systemPrompt = `You write slide carousels for VEDD Trading AI, a faith-driven financial education platform (brand voice: confident, empowering, street-urban authentic, no fluff \u2014 talk to the reader like you know their hustle). Write them in the style of top Instagram finance/motivation pages like @wealth and @entrepreneursonig: each slide is ONE bold declarative statement that could stand alone as a quote card \u2014 short, punchy, scroll-stopping. Not paragraphs, not lecture notes.

Return a JSON object with these exact fields:
{
  "title": "short title for the whole carousel (max 60 chars)",
  "caption": "a social caption for the post introducing the carousel (2-4 sentences), includes a CTA to veddbuild.com, no hashtags",
  "slides": [
    {
      "heading": "the slide's BIG bold statement (max 60 chars) \u2014 one punchy declarative line, e.g. 'Most traders lose to their own emotions.' or 'Step 1: Connect your broker.'",
      "body": "one short supporting line (max 100 chars) \u2014 sharpens or proves the heading, never repeats it",
      "imagePrompt": "a vivid, concrete visual scene description (1 sentence) for an AI image generator to render as this slide's dark, moody background. Dark/cinematic tones only. No text overlays, no logos, no UI screenshots. If the scene includes people, they should be Black, Brown, or Indigenous people of color in contemporary urban/hip-hop-inspired style (streetwear, sneakers, fitted caps), with smartphones and modern tech woven in naturally \u2014 this reflects VEDD's inner-city audience, not a generic stock-photo cast."
    }
  ]
}

Write exactly ${slideCount} slides, in logical order (slide 1 is a hook that stops the scroll, the last slide is always a CTA to join VEDD).`;
  const response = await openai2.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Write a VEDD slide carousel about: ${topic}` }
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500
  });
  const raw = response.choices[0]?.message?.content || "{}";
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = {};
  }
  const fallbackSlides = Array.from({ length: slideCount }, (_, i) => ({
    heading: i === 0 ? `Let's talk about ${topic}` : i === slideCount - 1 ? "Start free today" : `Step ${i}`,
    body: i === slideCount - 1 ? "Join VEDD and put this to work in your own account." : `Here's what you need to know about ${topic}.`,
    imagePrompt: `A clean, modern trading desk scene, warm natural light, cinematic depth of field`
  }));
  const slides = Array.isArray(data.slides) && data.slides.length > 0 ? data.slides.slice(0, slideCount).map((s, i) => ({
    heading: s.heading || fallbackSlides[i]?.heading || `Step ${i + 1}`,
    body: s.body || fallbackSlides[i]?.body || "",
    imagePrompt: s.imagePrompt || fallbackSlides[i]?.imagePrompt || "A clean, modern trading desk scene, warm natural light"
  })) : fallbackSlides;
  return {
    title: data.title || `How ${topic} Works`,
    caption: data.caption || `Here's exactly how ${topic} works on VEDD \u2014 swipe through, then start free at veddbuild.com.`,
    slides
  };
}
async function generateDailyDevotional(date2) {
  let client2;
  try {
    client2 = await getUniversalAIClientForUser(0);
  } catch {
  }
  if (!client2) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    if (apiKey) {
      const isGroq = !process.env.OPENAI_API_KEY;
      client2 = new OpenAI({ apiKey, ...isGroq ? { baseURL: "https://api.groq.com/openai/v1" } : {}, maxRetries: 4, timeout: 9e4 });
    }
  }
  const devotionalModel = client2?.defaultModel || "gpt-4o-mini";
  const systemPrompt = `You are the VEDD Trading AI spiritual coach. VEDD is a faith-based, community-driven fintech and trading AI platform built around mindset, discipline, and excellence. Our ambassador network spans cities worldwide. Our values: faith, resilience, discipline, community, generosity, and excellence in trading.

Generate a daily devotional for ambassadors and users that:
1. Ties Christian/faith-based scripture to trading mindset and financial discipline
2. Speaks to our inter-city ambassador community building vision
3. Is motivational, grounded, and practical
4. Connects spiritual growth with professional growth in trading/finance
5. Encourages community and collaboration between ambassadors

Return ONLY valid JSON, no markdown, no extra text.`;
  const userPrompt = `Generate a daily devotional for ${date2}. Return JSON with exactly these fields:
{
  "title": "Compelling devotional title (max 10 words)",
  "theme": "One-word or short theme (e.g. 'Discipline', 'Community', 'Excellence', 'Patience', 'Vision')",
  "scripture": "Book Chapter:Verse reference (e.g. 'Proverbs 16:3')",
  "scriptureText": "The full scripture verse text",
  "reflection": "A 3-4 paragraph devotional reflection (300-400 words) connecting the scripture to trading mindset, financial discipline, and the ambassador community mission. Write in second person ('you'). Mention VEDD's mission of building inter-city ambassador communities.",
  "prayerPoints": ["Prayer point 1", "Prayer point 2", "Prayer point 3", "Prayer point 4"],
  "affirmation": "A powerful one-sentence daily affirmation the ambassador/user can speak aloud. Start with 'I am' or 'Today I'.",
  "tradingTieIn": "2-3 sentences specifically connecting today's scripture theme to trading discipline, risk management, patience in the markets, or the mindset needed to succeed as a VEDD trader/ambassador."
}`;
  try {
    if (!client2) throw new Error("No AI provider configured (add an AI key in AI Settings)");
    const response = await client2.chat.completions.create({
      model: devotionalModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 1200,
      response_format: { type: "json_object" }
    });
    const raw = response.choices[0]?.message?.content || "{}";
    const data = JSON.parse(raw);
    return {
      title: data.title || `Daily Devotional \u2014 ${date2}`,
      theme: data.theme || "Excellence",
      scripture: data.scripture || "Philippians 4:13",
      scriptureText: data.scriptureText || "I can do all things through Christ who strengthens me.",
      reflection: data.reflection || "Today, embrace the discipline that separates great traders from average ones.",
      prayerPoints: Array.isArray(data.prayerPoints) ? data.prayerPoints : ["Clarity in decisions", "Strength in discipline", "Unity in community", "Wisdom in trading"],
      affirmation: data.affirmation || "I am disciplined, focused, and aligned with excellence today.",
      tradingTieIn: data.tradingTieIn || "Faith-based discipline applies directly to the markets \u2014 patience, trust in your system, and community accountability all drive long-term trading success."
    };
  } catch (err) {
    console.error("[devotional] AI generation failed, using rotating static fallback:", err);
    const FALLBACKS = [
      { theme: "Faith", scripture: "Proverbs 16:3", scriptureText: "Commit to the LORD whatever you do, and he will establish your plans.", reflection: "Every trade you place, every analysis you run, every ambassador you recruit \u2014 all of it flows from a foundation of discipline and purpose. When you commit your work to God, you trade not from fear or greed, but from a place of peace and clarity. The markets will fluctuate, but your foundation does not have to.", prayerPoints: ["For clarity in decision-making", "For patience in volatile markets", "For unity among VEDD ambassadors", "For financial breakthrough in our community"], affirmation: "I am disciplined, focused, and committed to excellence in every trade and every relationship.", tradingTieIn: "Committing your trading plan to a higher purpose removes emotional noise from your decisions. When you follow your system with faith and discipline, you trade with confidence regardless of market conditions." },
      { theme: "Patience", scripture: "James 1:4", scriptureText: "Let perseverance finish its work so that you may be mature and complete, not lacking anything.", reflection: "The trader who exits a winning system too early, or abandons a strategy after one losing week, never gives perseverance the chance to finish its work. Maturity in trading \u2014 and in life \u2014 comes from staying the course through the parts that test you, not just the parts that reward you instantly.", prayerPoints: ["For endurance through drawdowns", "For trust in a proven process", "For a community that holds each other accountable", "For steady, compounding growth"], affirmation: "Today I trust the process and let perseverance finish its work in me.", tradingTieIn: "Every profitable system has losing streaks built into its math. Patience is not passive \u2014 it is the active decision to let your edge play out over enough trades to matter." },
      { theme: "Community", scripture: "Ecclesiastes 4:9-10", scriptureText: "Two are better than one, because they have a good return for their labor. If either of them falls down, one can help the other up.", reflection: "No ambassador builds alone. The trader isolated from community makes decisions in an echo chamber \u2014 fear and greed with no one to check them. VEDD was built on the belief that shared discipline, shared wins, and shared accountability produce a return no individual can match alone.", prayerPoints: ["For ambassadors who lift each other up", "For humility to ask for help", "For generosity in sharing what works", "For a community that grows together"], affirmation: "Today I show up for my community, and I let my community show up for me.", tradingTieIn: "Sharing your trade journal, your wins, and your losses with a community keeps you honest in a way that trading alone never will." },
      { theme: "Excellence", scripture: "Colossians 3:23", scriptureText: "Whatever you do, work at it with all your heart, as working for the Lord, not for men.", reflection: "Excellence in trading is not about being right every time \u2014 it is about the quality of your process regardless of outcome. A well-executed losing trade, following your rules to the letter, is excellence. A lucky winning trade taken outside your system is not. Work your process with your whole heart, and let the results follow.", prayerPoints: ["For discipline in following your own rules", "For integrity when no one is watching your trades", "For excellence that does not depend on outcome", "For a legacy built on process, not luck"], affirmation: "Today I trade my process with excellence, and I let the results take care of themselves.", tradingTieIn: "A trader who journals every trade, honors every stop loss, and reviews every week regardless of P&L is practicing excellence \u2014 and that is what compounds over years." },
      { theme: "Wisdom", scripture: "Proverbs 4:7", scriptureText: "The beginning of wisdom is this: Get wisdom. Though it cost all you have, get understanding.", reflection: "Every dollar spent on education, every hour spent studying charts and reviewing losing trades, is an investment in wisdom that compounds far beyond any single trade. The ambassadors who last in this business are the ones who never stop being students of the market and of themselves.", prayerPoints: ["For a teachable spirit", "For wisdom to know when to act and when to wait", "For discernment between signal and noise", "For growth that outlasts any one trade"], affirmation: "Today I choose to learn, even from my losses, and I let wisdom guide my next decision.", tradingTieIn: "The market is the most honest teacher there is \u2014 it will show you exactly where your discipline breaks down, if you are humble enough to look." },
      { theme: "Resilience", scripture: "Romans 5:3-4", scriptureText: "We also glory in our sufferings, because we know that suffering produces perseverance; perseverance, character; and character, hope.", reflection: "Every trader has a drawdown story. What separates the ones who make it from the ones who quit is not the absence of losing streaks \u2014 it is what those losing streaks build in them. Let this season, whatever it looks like in your account, build character rather than despair.", prayerPoints: ["For hope in the middle of a drawdown", "For character built through hard seasons", "For the strength to keep showing up", "For a testimony that helps the next ambassador"], affirmation: "Today I choose resilience, and I trust that this season is building something in me that a shortcut never could.", tradingTieIn: "Risk management exists precisely so a losing streak builds your character instead of ending your account \u2014 protect your capital so you live to apply the lesson." },
      { theme: "Generosity", scripture: "2 Corinthians 9:6", scriptureText: "Whoever sows sparingly will also reap sparingly, and whoever sows generously will also reap generously.", reflection: "The ambassadors who share their signals, their knowledge, and their referral links generously are the ones who see the community \u2014 and their own results \u2014 grow fastest. Generosity is not just a spiritual principle here; it is the literal growth engine of this platform.", prayerPoints: ["For a generous spirit toward new ambassadors", "For willingness to share what took you years to learn", "For a harvest that matches your sowing", "For a community defined by giving, not just taking"], affirmation: "Today I sow generously into my community, trusting the harvest that generosity produces.", tradingTieIn: "Every ambassador who mentors a new trader, or shares an honest losing trade instead of only wins, sows into the credibility of this entire community." }
    ];
    const idx = new Date(date2).getDay();
    const f = FALLBACKS[idx] ?? FALLBACKS[0];
    return {
      title: `Daily Devotional \u2014 ${f.theme}`,
      theme: f.theme,
      scripture: f.scripture,
      scriptureText: f.scriptureText,
      reflection: f.reflection,
      prayerPoints: f.prayerPoints,
      affirmation: f.affirmation,
      tradingTieIn: f.tradingTieIn
    };
  }
}
async function generateWorkforceCurriculum(params) {
  const client2 = await getUniversalAIClientForUser(params.userId || 0).catch(() => null);
  const systemPrompt = `You are an expert workforce development curriculum designer for VEDD Technologies, LLC \u2014 an AI trading education and community finance platform. VEDD serves underrepresented communities, offering AI literacy, digital skills, financial planning, and trading education aligned with DOL WIOA, NSF AI Workforce, SBA, CDFI Fund, and EDA grant programs. All curricula must be inclusive, practical, and measurable for grant reporting.`;
  const userPrompt = `Design a complete workforce training curriculum with these parameters:

Title: ${params.title}
Category: ${params.category}
Target Audience: ${params.targetAudience}
Difficulty: ${params.difficulty}
Estimated Duration: ${params.estimatedMinutes} minutes
Learning Objectives: ${params.objectives}
Grant Alignment: ${params.grantTags.join(", ")}

Return a JSON object with exactly this structure:
{
  "overview": "2-3 sentence course overview",
  "objectives": ["measurable learning objective 1", "objective 2", "objective 3", "objective 4"],
  "modules": [
    { "title": "Module 1 title", "duration": "X minutes", "content": "Detailed module description and key topics covered" },
    { "title": "Module 2 title", "duration": "X minutes", "content": "..." }
  ],
  "assessmentQuestions": [
    { "question": "Question text", "options": ["A", "B", "C", "D"], "correct": 0, "explanation": "Why this answer is correct" }
  ],
  "grantAlignment": "Explanation of how this curriculum aligns with specified grant programs and their workforce development goals",
  "instructorNotes": "Facilitation tips, differentiation strategies for diverse learners, and accommodations for underserved populations"
}

Create 4-6 modules and 5 assessment questions. Make objectives measurable (Bloom's taxonomy verbs). Ensure content is practical and immediately applicable.`;
  try {
    const aiClient = client2 || getPlatformOpenAIClient();
    const response = await aiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });
    const content = response.choices[0].message.content;
    return JSON.parse(content || "{}");
  } catch (err) {
    console.error("generateWorkforceCurriculum error:", err);
    return {
      overview: `${params.title} is a ${params.difficulty}-level course designed to build ${params.category.replace(/_/g, " ")} skills for ${params.targetAudience} learners.`,
      objectives: [
        `Define key concepts in ${params.category.replace(/_/g, " ")}`,
        `Apply learned skills to real-world scenarios`,
        `Demonstrate competency through practical exercises`,
        `Connect skills to career and financial opportunities`
      ],
      modules: [
        { title: "Introduction & Foundations", duration: `${Math.floor(params.estimatedMinutes * 0.2)} minutes`, content: "Course overview, learning expectations, and foundational concepts." },
        { title: "Core Concepts", duration: `${Math.floor(params.estimatedMinutes * 0.3)} minutes`, content: "Deep dive into primary subject matter with examples and case studies." },
        { title: "Practical Application", duration: `${Math.floor(params.estimatedMinutes * 0.3)} minutes`, content: "Hands-on exercises and real-world application of learned concepts." },
        { title: "Assessment & Next Steps", duration: `${Math.floor(params.estimatedMinutes * 0.2)} minutes`, content: "Knowledge check, certificate preparation, and career pathway guidance." }
      ],
      assessmentQuestions: [
        { question: "Which best describes the primary goal of this course?", options: ["Build technical skills", "Develop financial literacy", "Improve career readiness", "All of the above"], correct: 3, explanation: "This course addresses all three areas as part of VEDD's holistic workforce development approach." }
      ],
      grantAlignment: `This curriculum aligns with ${params.grantTags.join(" and ")} grant requirements for workforce development, skills training, and community economic empowerment.`,
      instructorNotes: "Accommodate diverse learning styles with visual aids, real-world examples, and peer discussion. Provide additional support resources for participants with limited prior exposure to digital tools."
    };
  }
}
async function analyzeORBSignal(params) {
  const isIndex = ["US30", "NAS100", "SPX500", "UK100", "DAX40"].includes(params.symbol.toUpperCase());
  const isCommodity = ["XAUUSD", "XAGUSD", "USOIL"].includes(params.symbol.toUpperCase());
  let rangeMinPct = 0.1;
  let rangeMaxPct = 2.5;
  if (isIndex) {
    rangeMinPct = 0.08;
    rangeMaxPct = 1.5;
  }
  if (isCommodity) {
    rangeMinPct = 0.1;
    rangeMaxPct = 1.2;
  }
  const rangeOk = params.orbRangePct >= rangeMinPct && params.orbRangePct <= rangeMaxPct;
  const now = /* @__PURE__ */ new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 6e4;
  const est = new Date(utc + -5 * 36e5);
  const h = est.getHours();
  const m = est.getMinutes();
  const totalMin = h * 60 + m;
  const peakWindowStart = 9 * 60 + 45;
  const peakWindowEnd = 11 * 60 + 30;
  const extWindowEnd = 14 * 60;
  const inPeakWindow = totalMin >= peakWindowStart && totalMin <= peakWindowEnd;
  const inExtWindow = totalMin > peakWindowEnd && totalMin <= extWindowEnd;
  const isBreakout = params.phase.includes("BREAKOUT");
  const isRetest = params.phase.includes("RETEST");
  const hasPattern = !!(params.pattern && params.pattern !== "" && params.pattern !== "None detected yet");
  const biasMatches = params.tradeDirection === "LONG" && params.preMarketBias !== "bearish" || params.tradeDirection === "SHORT" && params.preMarketBias !== "bullish" || params.preMarketBias === "neutral";
  const systemPrompt = `You are the VEDD SS AI Bot \u2014 a professional institutional-grade ORB (Opening Range Breakout) trade analyzer.
You specialize in the 9:30 AM NYSE open strategy: 15-min opening range, 6-minute breakout confirmation, retest entry.
You are objective, data-driven, and always prioritize risk management over trade frequency.
Respond ONLY with valid JSON. No extra text.`;
  const userPrompt = `Analyze this ORB setup and provide a second confirmation score.

INSTRUMENT: ${params.symbol}
ORB HIGH: ${params.orbHigh}
ORB LOW: ${params.orbLow}
ORB RANGE: ${params.orbRange} (${params.orbRangePct.toFixed(2)}% of price)
CURRENT PRICE: ${params.currentPrice}
PHASE: ${params.phase}
TRADE DIRECTION: ${params.tradeDirection || "Not determined"}
PRE-MARKET BIAS: ${params.preMarketBias}
BREAKOUT CANDLE TF: ${params.breakoutCandle || "6min"}
CANDLESTICK PATTERN ON RETEST: ${params.pattern || "None observed"}
CURRENT EST TIME: ${h}:${m.toString().padStart(2, "0")}

CONTEXT:
- Range quality: ${rangeOk ? "GOOD (within ideal range)" : `CONCERN \u2014 ${params.orbRangePct.toFixed(2)}% is ${params.orbRangePct < rangeMinPct ? "too narrow (false break risk)" : "too wide (risk too large)"}`}
- Time window: ${inPeakWindow ? "PEAK (9:45\u201311:30 AM)" : inExtWindow ? "EXTENDED (marginal)" : "OUTSIDE WINDOW"}
- Bias alignment: ${biasMatches ? "ALIGNED" : "CONFLICTING with trade direction"}

Evaluate these 6 checks and score the overall setup 0-100:
1. ORB Range Quality \u2014 Is ${params.orbRangePct.toFixed(2)}% within optimal parameters for ${params.symbol}?
2. Breakout Candle Strength \u2014 Was the breakout on a ${params.breakoutCandle || "6min"} full-body close? Rate strength.
3. Retest Validity \u2014 Is price respecting the broken ORB level as new support/resistance? Phase is "${params.phase}".
4. Pattern Confirmation \u2014 Is "${params.pattern || "none"}" a valid pattern for a ${params.tradeDirection || "directional"} retest entry?
5. Trading Window \u2014 ${inPeakWindow ? "In peak window" : inExtWindow ? "Extended window" : "Outside standard window"} \u2014 rate timing quality.
6. Pre-Market Bias Alignment \u2014 ${params.preMarketBias} bias with ${params.tradeDirection || "unknown"} direction trade.

SCORING:
- 80\u2013100: High confidence, all major criteria met
- 60\u201379: Marginal, proceed with reduced size
- 0\u201359: Pass \u2014 one or more critical criteria failed

Respond with this exact JSON structure:
{
  "score": <number 0-100>,
  "verdict": "<TAKE TRADE | MARGINAL \u2014 CAUTION | PASS \u2014 SKIP THIS>",
  "checks": [
    { "label": "ORB Range Quality", "pass": <boolean>, "note": "<specific note about this setup>" },
    { "label": "Breakout Candle Strength", "pass": <boolean>, "note": "<specific note>" },
    { "label": "Retest Validity", "pass": <boolean>, "note": "<specific note>" },
    { "label": "Pattern Confirmation", "pass": <boolean>, "note": "<specific note>" },
    { "label": "Trading Window", "pass": <boolean>, "note": "<specific note>" },
    { "label": "Pre-Market Bias Alignment", "pass": <boolean>, "note": "<specific note>" }
  ],
  "note": "<2-3 sentence SS AI Bot summary \u2014 specific to this exact setup, mention the symbol, key level, and what to watch for on the retest>"
}`;
  try {
    const client2 = getPlatformOpenAIClient();
    const completion = await client2.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 800
    });
    const result = JSON.parse(completion.choices[0].message.content || "{}");
    return {
      score: Math.max(0, Math.min(100, result.score || 0)),
      verdict: result.verdict || "PASS \u2014 SKIP THIS",
      checks: result.checks || [],
      note: result.note || ""
    };
  } catch {
    const checks = [
      { label: "ORB Range Quality", pass: rangeOk, note: rangeOk ? `${params.orbRangePct.toFixed(2)}% is within optimal parameters` : `${params.orbRangePct.toFixed(2)}% is outside the ideal range \u2014 skip` },
      { label: "Breakout Candle Strength", pass: isBreakout || isRetest, note: isRetest ? "Price has broken out and is retesting \u2014 breakout confirmed" : isBreakout ? "Breakout detected, waiting for retest" : "No confirmed breakout yet" },
      { label: "Retest Validity", pass: isRetest, note: isRetest ? "Price is at the retest zone \u2014 entry condition met" : "Wait for price to pull back to ORB level" },
      { label: "Pattern Confirmation", pass: hasPattern, note: hasPattern ? `${params.pattern} detected on retest \u2014 valid confirmation` : "No candlestick pattern detected yet \u2014 wait for confirmation candle" },
      { label: "Trading Window", pass: inPeakWindow || inExtWindow, note: inPeakWindow ? "In peak ORB window (9:45\u201311:30 AM)" : inExtWindow ? "Extended window \u2014 valid but lower probability" : "Outside trading window \u2014 wait for next session" },
      { label: "Pre-Market Bias Alignment", pass: biasMatches, note: biasMatches ? `${params.preMarketBias} bias aligns with ${params.tradeDirection} direction` : "Bias conflicts with trade direction \u2014 proceed with caution" }
    ];
    const passing = checks.filter((c) => c.pass).length;
    const score = Math.round(passing / 6 * 100);
    return {
      score,
      verdict: score >= 80 ? "TAKE TRADE" : score >= 60 ? "MARGINAL \u2014 CAUTION" : "PASS \u2014 SKIP THIS",
      checks,
      note: `Rule-based analysis (AI unavailable): ${passing}/6 checks passed. ${score >= 80 ? "Setup meets criteria \u2014 enter on retest with pattern confirmation." : score >= 60 ? "Marginal setup \u2014 consider half size or wait for stronger confirmation." : "Critical criteria not met \u2014 skip this setup."}`
    };
  }
}
var TOP_PROFITABLE_STRATEGIES, _openaiInstance, openai, AVAILABLE_VISION_MODELS, userModelPreferences, DEPRECATED_MODEL_MAP, DEFAULT_AI_MODEL, VISION_FALLBACK, KNOWN_VISION_MODEL_IDS, aiVisionConfirmationEnabled, aiMinConfidenceThreshold, ictStrategyEnabledMap, breakoutModeEnabledMap, trailingStopEnabledMap, breakoutModePriorState, smcStrategyEnabledMap, propFirmModeMap, propFirmContextMap, aiConfirmationLogs2, logIdCounter, adaptiveRegimeEnabledMap, VETERAN_JUDGE_MODEL, VETERAN_PERSONA, PROVIDER_MODELS, AnthropicAsOpenAI, PROVIDER_PRIORITY, VEDD_IDENTITY_CONTEXT, MASTER_GRANT_WRITER_SYSTEM;
var init_openai = __esm({
  "server/openai.ts"() {
    "use strict";
    init_github_strategy_context();
    init_confirmation_learning();
    init_ai_usage();
    TOP_PROFITABLE_STRATEGIES = [
      { name: "ICT AMD Kill Zone", pairs: ["XAUUSD", "GBPUSD", "EURUSD"], description: "Asian Range defined 02:00\u201305:00 UTC. London open (06:00\u201308:00) raids Asian low, price reverses. Entry on M15 OB inside Asian boundary + FVG fill. NY session sweeps AMD high.", winConditions: "FVG fill + bullish engulf at OB, ADX > 25, ictMacroValid = true", riskNote: "Avoid if NFP/FOMC within 4h" },
      { name: "SMC Order Block Raid", pairs: ["GBPJPY", "USDJPY", "XAUUSD"], description: "Weekly/Daily OB identified. H4 price sweeps below OB, wicks back inside. Enter on M15 BOS above OB bottom.", winConditions: "Volume spike on wick, RSI divergence on M15, BOS confirmed", riskNote: "Invalid if OB broken on close" },
      { name: "VWAP Bounce Mean Reversion", pairs: ["EURUSD", "GBPUSD", "USDJPY"], description: "Price deviates >1.5 SD from VWAP during NY session (13:00\u201317:00 UTC). Fade at VWAP SD band when RSI > 75 or < 25.", winConditions: "RSI divergence, VWAP reclaim candle, ADX < 20", riskNote: "Do not trade against trend if ADX > 35" },
      { name: "Breaker Block Continuation", pairs: ["GBPUSD", "EURUSD"], description: "Failed OB becomes a breaker. Price sweeps through OB creating BOS, then retests old OB as resistance/support. Trade continuation.", winConditions: "Clean BOS on H1, retest holds on M15, RSI 40-60 on retest", riskNote: "Requires at least 2 prior OB tests" },
      { name: "Fair Value Gap Fill", pairs: ["XAUUSD", "GBPJPY", "NAS100"], description: "3-candle imbalance FVG on M15/H1. Price returns to 50% gap level. Trade continuation after 50% fill holds.", winConditions: "FVG from strong impulsive move, ADX > 30, volume on imbalance candles", riskNote: "Full-fill FVGs (100%) less reliable" },
      { name: "London-NY Overlap Momentum", pairs: ["GBPUSD", "EURUSD", "GBPJPY"], description: "10:00\u201312:00 UTC peak liquidity. Breakout of London AM range (07:00\u201310:00). 15m close outside range is entry trigger.", winConditions: "15m close + retest of range, ADX > 28, volume above 20-period avg", riskNote: "High false-breakout rate without NY catalyst" },
      { name: "PDH/PDL Liquidity Sweep", pairs: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"], description: "PDH or PDL swept by 5\u201315 pips at session open. Immediate rejection pin bar/engulf on M5/M15. Enter reversal targeting 50% of prior day range.", winConditions: "Wick > body on sweep candle, OB within 20 pips, ictMacroValid = true", riskNote: "Must close below/above sweep wick for invalidation" },
      { name: "ICT Macro HTF Confluence", pairs: ["XAUUSD", "GBPUSD", "EURUSD"], description: "Trade only when M15 aligns with H4 and D1 trend. Active ICT macro time (02:00, 08:30, 10:00, 14:00 UTC). OB + FVG + EQ levels on H4.", winConditions: "All 3 timeframes aligned, minimum 2 confluence factors, London/NY session", riskNote: "Skip if only 1 confluence factor present" }
    ];
    _openaiInstance = null;
    openai = new Proxy({}, {
      get(_target, prop) {
        return getDefaultOpenAIClient()[prop];
      }
    });
    AVAILABLE_VISION_MODELS = [
      { id: "gpt-4o", name: "GPT-4o", description: "Best accuracy for chart analysis", tier: "premium", provider: "openai" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Budget-friendly, good accuracy", tier: "budget", provider: "openai" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", description: "Excellent reasoning and analysis", tier: "premium", provider: "anthropic" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", description: "Fast and affordable", tier: "budget", provider: "anthropic" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "Fast multimodal analysis", tier: "budget", provider: "google" },
      { id: "gemini-1.5-pro-latest", name: "Gemini 1.5 Pro", description: "Advanced reasoning", tier: "premium", provider: "google" },
      { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B (Groq)", description: "Groq flagship open model \u2014 fast & reliable (text/confirmation)", tier: "budget", provider: "groq", textOnly: true },
      { id: "qwen/qwen3.6-27b", name: "Qwen 3.6 27B (Groq)", description: "Strong reasoning, fast on Groq (text/confirmation)", tier: "budget", provider: "groq", textOnly: true },
      { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B (Groq)", description: "Fastest Groq model \u2014 ultra-low latency (text/confirmation)", tier: "budget", provider: "groq", textOnly: true },
      { id: "qwen/qwen3-vl-32b-instruct", name: "Qwen 3 VL (Vision, Groq)", description: "Groq vision model \u2014 use OpenAI/Anthropic for chart analysis", tier: "budget", provider: "groq", textOnly: true },
      { id: "mistral-large-latest", name: "Mistral Large", description: "Top-tier reasoning", tier: "premium", provider: "mistral" },
      { id: "mistral-small-latest", name: "Mistral Small", description: "Efficient and affordable", tier: "budget", provider: "mistral" },
      // OpenRouter — 100% FREE open-source models (get a free key at openrouter.ai)
      // NOTE: OpenRouter rotates which models are free — verify against
      // https://openrouter.ai/api/v1/models before adding new entries here.
      { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B (OpenRouter)", description: "OpenAI open-weight model via OpenRouter \u2014 ultra-cheap (~$4/1M calls), no daily cap", tier: "budget", provider: "openrouter", textOnly: true },
      { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super 120B (FREE)", description: "NVIDIA large reasoning model \u2014 free via OpenRouter", tier: "budget", provider: "openrouter", textOnly: true },
      { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B (FREE)", description: "Google efficient MoE model \u2014 free via OpenRouter", tier: "budget", provider: "openrouter", textOnly: true },
      { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B Vision (FREE)", description: "Multimodal vision \u2014 reads chart images, completely free via OpenRouter", tier: "budget", provider: "openrouter" },
      // Cheaper OpenRouter vision picks (selectable; honored as-is, not promoted).
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini (OpenRouter)", description: "GPT-4o Mini via OpenRouter \u2014 capable chart vision, cheaper than OpenAI-direct, no daily cap", tier: "budget", provider: "openrouter" },
      { id: "google/gemma-3-4b-it", name: "Gemma 3 4B Vision (OpenRouter)", description: "Ultra-cheap OpenRouter vision (~$0.0000009/call, no daily cap) \u2014 lowest cost, lighter confidence scoring", tier: "budget", provider: "openrouter" }
    ];
    userModelPreferences = /* @__PURE__ */ new Map();
    DEPRECATED_MODEL_MAP = {
      "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
      "claude-sonnet-4-20250514": "claude-sonnet-4-6",
      "claude-3-5-sonnet-20241022": "claude-sonnet-4-6",
      // Groq models decommissioned 2026-06-17 → migrate to current Groq models
      "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
      "llama-3.1-8b-instant": "openai/gpt-oss-20b",
      "meta-llama/llama-4-scout-17b-16e-instruct": "qwen/qwen3-vl-32b-instruct",
      "mixtral-8x7b-32768": "openai/gpt-oss-120b",
      "qwen/qwen3-32b": "qwen/qwen3.6-27b",
      // OpenRouter retired these free slugs (confirmed 404 on live test 2026-07-26) → migrate to a live free model
      "deepseek/deepseek-chat-v3-0324:free": "openai/gpt-oss-20b",
      "deepseek/deepseek-r1:free": "openai/gpt-oss-20b",
      "meta-llama/llama-3.3-70b-instruct:free": "openai/gpt-oss-20b",
      "qwen/qwen3-235b-a22b:free": "openai/gpt-oss-20b"
    };
    DEFAULT_AI_MODEL = "openai/gpt-oss-20b";
    VISION_FALLBACK = {
      "groq": "gpt-4o-mini",
      "openai": "gpt-4o-mini",
      "anthropic": "claude-sonnet-4-6",
      // gpt-4o-mini via OpenRouter — a genuinely capable model that scores the trade
      // confirmation reliably. Was 'google/gemma-3-4b-it', a 4B model that returned
      // uniformly junk-low confidence (~12% ceiling) which failed the min-confidence
      // gate and REJECTED EVERY TRADE. The default pick (openai/gpt-oss-20b) routes
      // through OpenRouter, so nearly every user hit that weak fallback. gpt-4o-mini
      // is what line ~452 already treats as the OpenRouter vision model.
      "openrouter": "openai/gpt-4o-mini"
    };
    KNOWN_VISION_MODEL_IDS = /* @__PURE__ */ new Set([
      ...AVAILABLE_VISION_MODELS.filter((m) => !m.textOnly).map((m) => m.id),
      ...Object.values(VISION_FALLBACK)
    ]);
    aiVisionConfirmationEnabled = /* @__PURE__ */ new Map();
    aiMinConfidenceThreshold = /* @__PURE__ */ new Map();
    ictStrategyEnabledMap = /* @__PURE__ */ new Map();
    breakoutModeEnabledMap = /* @__PURE__ */ new Map();
    trailingStopEnabledMap = /* @__PURE__ */ new Map();
    breakoutModePriorState = /* @__PURE__ */ new Map();
    smcStrategyEnabledMap = /* @__PURE__ */ new Map();
    propFirmModeMap = /* @__PURE__ */ new Map();
    propFirmContextMap = /* @__PURE__ */ new Map();
    aiConfirmationLogs2 = /* @__PURE__ */ new Map();
    logIdCounter = 1;
    adaptiveRegimeEnabledMap = /* @__PURE__ */ new Map();
    VETERAN_JUDGE_MODEL = "openai/gpt-oss-120b";
    VETERAN_PERSONA = `You are a trader with over 30 years of unbroken, consistently profitable trading experience across every market regime \u2014 bull runs, bear markets, chop, and black-swan crashes. Early in your career you blew up two accounts by over-trading and chasing marginal setups; you have never repeated that mistake. Your hallmarks:
- Capital preservation is priority #1, always \u2014 profit is priority #2.
- You are far more likely to skip a setup than take it. Most trades that look "pretty good" get passed on. You only act on genuine, high-probability confluence.
- Consistency beats occasional brilliance \u2014 you would rather bank ten small, disciplined wins than swing for one big one and risk the account.
- You have zero ego. If the Bear Case is stronger than the Bull Case, you say no, full stop, regardless of how the setup "feels."
- You never revenge trade, never widen risk to chase a loss back, and never let a strong bull case override a real structural risk.`;
    PROVIDER_MODELS = {
      openai: "gpt-4o",
      groq: "openai/gpt-oss-120b",
      anthropic: "claude-sonnet-4-6",
      // was claude-3-5-sonnet-20241022 (retired → 404'd every Anthropic-routed confirmation)
      google: "gemini-2.0-flash",
      // was gemini-1.5-pro (deprecated id)
      mistral: "mistral-large-latest",
      openrouter: "openai/gpt-oss-20b"
      // cheap paid (~$4/1M calls), NO free-tier daily cap — confirmed live
    };
    AnthropicAsOpenAI = class {
      defaultModel;
      provider = "anthropic";
      client;
      constructor(apiKey) {
        const Anthropic = __require("@anthropic-ai/sdk");
        this.client = new Anthropic.default({ apiKey });
        this.defaultModel = PROVIDER_MODELS.anthropic;
      }
      get chat() {
        return {
          completions: {
            create: async (params) => {
              const messages = (params.messages || []).filter((m) => m.role !== "system");
              const systemMsg = (params.messages || []).find((m) => m.role === "system");
              const maxTokens = params.max_tokens || 4096;
              const model = params.model || this.defaultModel;
              const wantsJson = params.response_format?.type === "json_object";
              let systemContent = systemMsg?.content || "";
              if (wantsJson) {
                systemContent = systemContent ? `${systemContent}

Respond with valid JSON only. No markdown, no explanation.` : "Respond with valid JSON only. No markdown, no explanation.";
              }
              const response = await this.client.messages.create({
                model,
                max_tokens: maxTokens,
                ...systemContent ? { system: systemContent } : {},
                messages: messages.map((m) => ({
                  role: m.role,
                  content: typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((c) => {
                    if (c.type === "text") return { type: "text", text: c.text };
                    if (c.type === "image_url") {
                      const url = c.image_url?.url || "";
                      if (url.startsWith("data:")) {
                        const [meta, data] = url.split(",");
                        const mediaType = meta.split(":")[1].split(";")[0];
                        return { type: "image", source: { type: "base64", media_type: mediaType, data } };
                      }
                      return { type: "image", source: { type: "url", url } };
                    }
                    return c;
                  }) : m.content
                }))
              });
              const text2 = response.content?.[0]?.text || "";
              return {
                choices: [{ message: { role: "assistant", content: text2 }, finish_reason: response.stop_reason }],
                usage: { prompt_tokens: response.usage?.input_tokens, completion_tokens: response.usage?.output_tokens }
              };
            }
          }
        };
      }
    };
    PROVIDER_PRIORITY = ["openrouter", "openai", "groq", "anthropic", "google", "mistral"];
    VEDD_IDENTITY_CONTEXT = `
VEDD AI Trading (VEDDBuild) is a fintech AI trading education platform with the following characteristics:
- Mission: Democratizing access to institutional-grade AI trading tools and financial education for underserved communities
- Faith-based community values with inter-city economic empowerment focus
- Legal structure: Technology company / EdTech platform
- Geographic focus: United States (with international ambassador expansion)
- Key impact areas: Financial inclusion, STEM/fintech education, community economic development, prediction-market literacy

CORE AI TRADING ENGINES (current platform capability):
- AI Chart Analysis: upload any chart screenshot (MT4/MT5/TradingView/TradeLocker) for AI-generated entry/exit/stop/target signals, pattern recognition, and multi-timeframe confluence scoring
- VEDD SS AI Engine: fully automated forex trading engine connected live to both MT5 and TradeLocker brokers simultaneously \u2014 scans, scores, and auto-executes trades with configurable risk, session windows, and confidence thresholds; includes a paper-trading mode for risk-free onboarding
- Live TradeLocker + MT5 multi-broker execution with real-time balance/equity sync (background-synced every 20 seconds), supporting multiple broker accounts per user concurrently
- ORB (Opening Range Breakout) Engine: automated NY-session breakout strategy with live AI scoring, auto-detected retest entries, and mobile-optimized live status monitoring
- ABBA \u2014 proprietary AI trading strategist and voice assistant: gives users a personalized daily/weekly trading plan grounded in their real closed-trade history, diagnoses win/loss patterns by pair/session/confidence, and answers questions conversationally (with live speech) about their account, strategy, and the platform
- Micro Account Growth Engine: a higher-risk, concentrated-pair (1-2 pairs at a time) AI engine purpose-built to grow small FX accounts quickly, including automatic weekend crypto-pair trading (BTC/ETH) when traditional FX markets are closed \u2014 kept fully separate from prop-firm challenge accounts to protect funded-account compliance
- Prop Firm Challenge Mode: enforces funded-account rules automatically (daily loss limits, consistency requirements, session filters) so ambassadors and users can safely pursue funded trading accounts
- Copy Trading: a live leaderboard of verified trader performance (win rate, P&L, best trade) that any user can subscribe to and auto-mirror, with a built-in VEDD-token profit-share model that lets top traders earn passive income from followers' wins
- Solana (SOL) Token Scanner: autonomous on-chain token-scanning engine with multiple selectable trading strategies (momentum, order-flow, trend-following, adaptive auto-selection) and configurable auto-trade execution against a connected Solana wallet
- AI Prediction Markets Engine (Kalshi + Polymarket): scans live prediction-market contracts, ranks the highest win-probability opportunities using an AI edge model plus learned historical strategy accuracy, and supports an automatic bankroll-compounding mode that scales stake size as the account grows
- EA/Expert Advisor Generator: converts plain-English trading rules into ready-to-run MQL5 (MT5) or Pine Script (TradingView) code, with a marketplace for sharing/downloading community-built EAs
- AI Trade Performance Dashboard: unified live performance tracking across every connected broker/account (MT5, TradeLocker, prop-firm, copy-trading), with per-account and per-strategy breakdowns

COMMUNITY, EDUCATION & AMBASSADOR INFRASTRUCTURE:
- Ambassador Network: a 44-day certification training program with NFT-based credentialing, quiz-gated modules, and a referral/commission structure that creates self-sustaining local economic micro-ecosystems
- Lead Hunter: an AI-powered outreach system that scans social platforms (Reddit, StockTwits, X, Instagram, LinkedIn, Facebook) for high-intent prospects, scores and drafts personalized outreach for each ambassador, and can auto-engage where platform APIs allow
- Content Studio: AI-generated branded social content (posts + educational reels) with one-tap, per-platform-formatted sharing to 8 platforms
- AI-generated Blog/Insights: automated market-relevant educational articles published on a rotating schedule
- VEDD Token Ecosystem: on-chain Solana token used for platform rewards, ambassador commissions, and a profit-share mechanism between copy-trading followers and the traders they mirror
- Gamification: XP/tier progression, daily missions, streak tracking, and achievement badges that drive sustained engagement with financial-literacy content
- Multi-provider AI infrastructure: the platform is provider-agnostic (OpenAI, Anthropic, Google, Groq, Mistral, and free open-source models via OpenRouter), which keeps the cost of delivering AI-driven education low and sustainable at scale

DIFFERENTIATORS (use these to stand out):
- First-mover AI trading education platform integrated with live multi-broker execution (MT5 + TradeLocker) AND Solana blockchain infrastructure AND regulated prediction markets (Kalshi/Polymarket) in a single platform
- Proprietary 44-day Ambassador Certification Program with NFT-based credentialing
- Faith-based community trust networks across multiple U.S. cities \u2014 channels that traditional fintech cannot access
- Ambassador network model creates self-sustaining economic micro-ecosystems in underserved areas, reinforced by a token profit-share model between traders and their followers
- Dual revenue model (subscriptions + VEDD token ecosystem) demonstrates financial sustainability
- Technology democratizes tools previously available only to institutional traders ($50/month vs. $10,000+/year for institutional platforms)
- Purpose-built risk segmentation: separate engines for aggressive small-account growth vs. compliance-strict prop-firm accounts, showing responsible, segmented risk design rather than one-size-fits-all automation
- Measurable community outcomes: each ambassador directly impacts 50-200 community members in financial literacy
`;
    MASTER_GRANT_WRITER_SYSTEM = `You are Dr. Ren\xE9e Hargrove, a senior grant strategist and proposal writer with 10 years of experience and a 98% funding success rate. You have secured over $47 million in competitive grants for fintech companies, community development organizations, EdTech platforms, and minority-owned enterprises.

Your proposals consistently win because you:

1. **Mirror the funder's language and priorities exactly** \u2014 You study what the funder cares about most and lead with their values before introducing the applicant.

2. **Lead with urgency and a data-backed problem statement** \u2014 Reviewers decide in the first 30 seconds. Your openings are precise, emotionally resonant, and grounded in real data.

3. **Demonstrate organizational credibility immediately** \u2014 You front-load proof of capacity: team expertise, existing infrastructure, past success metrics, and community relationships.

4. **Write SMART, measurable objectives** \u2014 Every goal has a number, a timeline, and a responsible party. Reviewers hate vague language; you never use it.

5. **Build a compelling Theory of Change** \u2014 You always show the causal chain: Activities \u2192 Outputs \u2192 Short-term Outcomes \u2192 Long-term Impact. Funders fund logic, not hope.

6. **Tell human stories** \u2014 You weave real community narratives into technical sections to create emotional connection without sacrificing professionalism.

7. **Write budget narratives that justify every dollar** \u2014 You show cost-effectiveness by benchmarking against industry standards and demonstrating efficiency.

8. **Address sustainability proactively** \u2014 You always explain how the work continues post-grant, reducing perceived risk for the funder.

9. **Include a strong evaluation plan** \u2014 Funders want to see how success will be measured. You always include specific KPIs, data collection methods, and reporting timelines.

10. **Close with vision, not summary** \u2014 Your conclusions paint a picture of the world after the grant succeeds, creating a lasting impression on reviewers.

Your writing is:
- Professional but accessible (8th-grade readability, not academic jargon)
- Specific (concrete numbers, names, places \u2014 never vague generalities)
- Funder-centric (their mission first, applicant's needs second)
- Action-oriented (present tense, active voice)
- Formatted for skimmability (strong headers, strategic bullet use, clear paragraph breaks)

You ALWAYS produce proposals that are ready to submit \u2014 no placeholders like [INSERT DATA HERE], no generic language, no filler content. Every sentence earns its place.`;
  }
});

// server/services/engine-consensus.ts
var engine_consensus_exports = {};
__export(engine_consensus_exports, {
  getEngineConsensusForUser: () => getEngineConsensusForUser,
  recordEngineConsensus: () => recordEngineConsensus
});
async function recordEngineConsensus(userId, engine, entry) {
  try {
    await pool.query(
      `INSERT INTO engine_consensus_log
         (user_id, engine, symbol, strategy, quant_verdict, quant_score, ai_verdict, ai_confidence, ai_reasoning, consensus, trade_allowed, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (user_id, engine, symbol) DO UPDATE SET
         strategy = $4, quant_verdict = $5, quant_score = $6, ai_verdict = $7,
         ai_confidence = $8, ai_reasoning = $9, consensus = $10, trade_allowed = $11, updated_at = now()`,
      [
        userId,
        engine,
        entry.symbol,
        entry.strategy,
        entry.quantVerdict,
        entry.quantScore,
        entry.aiVerdict,
        entry.aiConfidence,
        entry.aiReasoning,
        entry.consensus,
        entry.tradeAllowed
      ]
    );
  } catch (err) {
    console.error(`[engine-consensus] Failed to record consensus for ${engine}/${entry.symbol} (non-fatal):`, err?.message ?? err);
  }
}
async function getEngineConsensusForUser(userId, engine) {
  try {
    const { rows } = await pool.query(
      `SELECT symbol, strategy, quant_verdict, quant_score, ai_verdict, ai_confidence, ai_reasoning, consensus, trade_allowed, updated_at
       FROM engine_consensus_log WHERE user_id = $1 AND engine = $2 ORDER BY updated_at DESC LIMIT 20`,
      [userId, engine]
    );
    return rows.map((r) => ({
      symbol: r.symbol,
      strategy: r.strategy,
      quantVerdict: r.quant_verdict,
      quantScore: r.quant_score,
      aiVerdict: r.ai_verdict,
      aiConfidence: r.ai_confidence,
      aiReasoning: r.ai_reasoning,
      consensus: r.consensus,
      tradeAllowed: r.trade_allowed,
      timestamp: new Date(r.updated_at).toISOString()
    }));
  } catch (err) {
    console.error(`[engine-consensus] Failed to read consensus for ${engine} (non-fatal):`, err?.message ?? err);
    return [];
  }
}
var init_engine_consensus = __esm({
  "server/services/engine-consensus.ts"() {
    "use strict";
    init_db();
  }
});

// server/services/cryptocom-scanner.ts
var cryptocom_scanner_exports = {};
__export(cryptocom_scanner_exports, {
  manualCloseCryptoTrade: () => manualCloseCryptoTrade,
  runCryptocomEngineScan: () => runCryptocomEngineScan,
  startCryptocomEngineScanner: () => startCryptocomEngineScanner
});
function convertToCandles(bars) {
  return bars.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
}
async function runTrendFollowing(symbol, cfg) {
  const bars = await CryptoComService.getCandles(symbol, "5m", 100);
  if (bars.length < 30) {
    return { decision: "error", reasoning: `${symbol}: not enough candle history returned.`, score: null, price: null, dailyChangePercent: null, strategy: "trend_following" };
  }
  const candles = convertToCandles(bars);
  const indicators = computeAllAdvancedIndicators(candles, 0, symbol, "M5");
  const price = candles[candles.length - 1].c;
  const dailyChangePercent = (price - candles[0].c) / candles[0].c * 100;
  const adx = indicators.adx?.adx || 0;
  const plusDI = indicators.adx?.plusDI || 0;
  const minusDI = indicators.adx?.minusDI || 0;
  const rsi = indicators.rsi?.value || 50;
  const macdHist = indicators.macd?.histogram || 0;
  let direction = null;
  let score = 0;
  const confluences = [];
  if (adx > 25 && plusDI > minusDI && rsi < 68 && macdHist > 0) {
    direction = "BUY";
    score = 60 + Math.min(20, adx - 25);
    confluences.push(`ADX ${adx.toFixed(1)} trend`, "DI+ dominant", "MACD bullish");
  } else if (adx > 25 && minusDI > plusDI && rsi > 32 && macdHist < 0) {
    direction = "SELL";
    score = 60 + Math.min(20, adx - 25);
    confluences.push(`ADX ${adx.toFixed(1)} trend`, "DI- dominant", "MACD bearish");
  }
  if (!direction) {
    return { decision: "watching", reasoning: `${symbol}: no clear trend confluence (ADX ${adx.toFixed(1)}, RSI ${rsi.toFixed(1)}).`, score: Math.round(score), price, dailyChangePercent, strategy: "trend_following" };
  }
  const directionAllowed = cfg.directionFilter === "both" || cfg.directionFilter === "long_only" && direction === "BUY" || cfg.directionFilter === "short_only" && direction === "SELL";
  if (!directionAllowed) {
    return { decision: "skipped", reasoning: `${symbol}: ${direction} confluence found, but direction filter is "${cfg.directionFilter}".`, score: Math.round(score), price, dailyChangePercent, strategy: "trend_following" };
  }
  if (score < cfg.minConfidence) {
    return { decision: "watching", reasoning: `${symbol}: ${direction} confluence (${confluences.join(", ")}) but score ${Math.round(score)}/100 below ${cfg.minConfidence} threshold.`, score: Math.round(score), price, dailyChangePercent, strategy: "trend_following" };
  }
  return {
    decision: "signal",
    score: Math.round(score),
    price,
    dailyChangePercent,
    strategy: "trend_following",
    direction,
    reasoning: `${symbol}: ${direction} trend confluence \u2014 ${confluences.join(", ")}. Score ${Math.round(score)}/100.`
  };
}
async function runMomentum(symbol, cfg) {
  const bars = await CryptoComService.getCandles(symbol, "15m", 30);
  if (bars.length < 10) {
    return { decision: "error", reasoning: `${symbol}: not enough candle history.`, score: null, price: null, dailyChangePercent: null, strategy: "momentum" };
  }
  const price = bars[bars.length - 1].c;
  const dailyChangePercent = (price - bars[0].c) / bars[0].c * 100;
  const direction = dailyChangePercent >= 0 ? "BUY" : "SELL";
  const score = Math.round(Math.min(100, 50 + Math.min(Math.abs(dailyChangePercent) / 3, 1) * 50));
  const directionAllowed = cfg.directionFilter === "both" || cfg.directionFilter === "long_only" && direction === "BUY" || cfg.directionFilter === "short_only" && direction === "SELL";
  if (!directionAllowed) {
    return { decision: "skipped", reasoning: `${symbol}: moved ${direction === "BUY" ? "up" : "down"} ${Math.abs(dailyChangePercent).toFixed(2)}%, but direction filter is "${cfg.directionFilter}".`, score, price, dailyChangePercent, strategy: "momentum" };
  }
  if (score < cfg.minConfidence) {
    return { decision: "watching", reasoning: `${symbol}: momentum score ${score}/100 below ${cfg.minConfidence} threshold.`, score, price, dailyChangePercent, strategy: "momentum" };
  }
  return { decision: "signal", score, price, dailyChangePercent, strategy: "momentum", direction, reasoning: `${symbol}: momentum ${direction} \u2014 moved ${Math.abs(dailyChangePercent).toFixed(2)}% this window. Score ${score}/100.` };
}
async function runOrderFlow(symbol, cfg) {
  const bars = await CryptoComService.getCandles(symbol, "5m", 60);
  if (bars.length < 20) return { decision: "error", reasoning: `${symbol}: not enough candles for order flow.`, score: null, price: null, dailyChangePercent: null, strategy: "order_flow" };
  const c = convertToCandles(bars);
  const price = c[c.length - 1].c;
  const dailyChangePercent = (price - c[0].c) / c[0].c * 100;
  const win = c.slice(-30);
  let pv = 0, vv = 0;
  for (const b of win) {
    const tp = (b.h + b.l + b.c) / 3;
    pv += tp * (b.v ?? 0);
    vv += b.v ?? 0;
  }
  const vwap = vv > 0 ? pv / vv : price;
  const delta = win.map((b) => (b.c >= b.o ? 1 : -1) * (b.v ?? 0));
  const mid = Math.floor(delta.length / 2);
  const cvdFirst = delta.slice(0, mid).reduce((s, d) => s + d, 0);
  const cvdSecond = delta.slice(mid).reduce((s, d) => s + d, 0);
  const cvdShiftPct = vv > 0 ? (cvdSecond - cvdFirst) / vv * 100 : 0;
  const rangePct = (Math.max(...win.map((b) => b.h)) - Math.min(...win.map((b) => b.l))) / price * 100;
  const last = win[win.length - 1];
  let direction = null;
  if (rangePct >= 0.8 && price > vwap && cvdShiftPct > 0 && last.c >= last.o) direction = "BUY";
  else if (rangePct >= 0.8 && price < vwap && cvdShiftPct < 0 && last.c <= last.o) direction = "SELL";
  if (!direction) return { decision: "watching", reasoning: `${symbol}: order flow balanced (range ${rangePct.toFixed(2)}%, CVD shift ${cvdShiftPct.toFixed(1)}%, price ${price > vwap ? "above" : "below"} VWAP).`, score: 45, price, dailyChangePercent, strategy: "order_flow" };
  const score = Math.round(Math.min(92, 60 + Math.min(20, Math.abs(cvdShiftPct)) + Math.min(12, rangePct)));
  const directionAllowed = cfg.directionFilter === "both" || cfg.directionFilter === "long_only" && direction === "BUY" || cfg.directionFilter === "short_only" && direction === "SELL";
  if (!directionAllowed) return { decision: "skipped", reasoning: `${symbol}: ${direction} order-flow read, but direction filter is "${cfg.directionFilter}".`, score, price, dailyChangePercent, strategy: "order_flow" };
  if (score < cfg.minConfidence) return { decision: "watching", reasoning: `${symbol}: ${direction} order flow (CVD ${cvdShiftPct.toFixed(1)}%) but score ${score}/100 below ${cfg.minConfidence}.`, score, price, dailyChangePercent, strategy: "order_flow" };
  return { decision: "signal", score, price, dailyChangePercent, strategy: "order_flow", direction, reasoning: `${symbol}: ${direction} order flow \u2014 CVD shift ${cvdShiftPct.toFixed(1)}%, price ${direction === "BUY" ? "above" : "below"} VWAP $${vwap.toFixed(2)}, ${rangePct.toFixed(2)}% range. Score ${score}/100.` };
}
async function runVolumeProfile(symbol, cfg) {
  const bars = await CryptoComService.getCandles(symbol, "15m", 96);
  if (bars.length < 40) return { decision: "error", reasoning: `${symbol}: not enough candles for volume profile.`, score: null, price: null, dailyChangePercent: null, strategy: "volume_profile" };
  const c = convertToCandles(bars);
  const price = c[c.length - 1].c;
  const dailyChangePercent = (price - c[0].c) / c[0].c * 100;
  const hi = Math.max(...c.map((b) => b.h)), lo = Math.min(...c.map((b) => b.l));
  const bins = 24, binSize = (hi - lo) / bins || 1;
  const vol = new Array(bins).fill(0);
  for (const b of c) {
    const tp = (b.h + b.l + b.c) / 3;
    let i = Math.floor((tp - lo) / binSize);
    i = Math.max(0, Math.min(bins - 1, i));
    vol[i] += b.v ?? 0;
  }
  const total = vol.reduce((a, b) => a + b, 0) || 1;
  let poc = 0;
  for (let i = 1; i < bins; i++) if (vol[i] > vol[poc]) poc = i;
  let inc = vol[poc], loI = poc, hiI = poc;
  while (inc < total * 0.7 && (loI > 0 || hiI < bins - 1)) {
    const d = loI > 0 ? vol[loI - 1] : -1;
    const u = hiI < bins - 1 ? vol[hiI + 1] : -1;
    if (u >= d) {
      hiI++;
      inc += vol[hiI];
    } else {
      loI--;
      inc += vol[loI];
    }
  }
  const VAL = lo + loI * binSize, VAH = lo + (hiI + 1) * binSize;
  const avgVol = total / c.length, recentVol = c.slice(-3).reduce((s, b) => s + (b.v ?? 0), 0) / 3;
  const volConfirm = recentVol > avgVol;
  let direction = null;
  if (price > VAH && volConfirm) direction = "BUY";
  else if (price < VAL && volConfirm) direction = "SELL";
  if (!direction) return { decision: "watching", reasoning: `${symbol}: inside/at value area $${VAL.toFixed(2)}\u2013$${VAH.toFixed(2)} or volume not confirming \u2014 no VP edge.`, score: 46, price, dailyChangePercent, strategy: "volume_profile" };
  const dist = direction === "BUY" ? (price - VAH) / binSize : (VAL - price) / binSize;
  const score = Math.round(Math.max(55, Math.min(90, 60 + dist * 8)));
  const directionAllowed = cfg.directionFilter === "both" || cfg.directionFilter === "long_only" && direction === "BUY" || cfg.directionFilter === "short_only" && direction === "SELL";
  if (!directionAllowed) return { decision: "skipped", reasoning: `${symbol}: ${direction} VP breakout, but direction filter is "${cfg.directionFilter}".`, score, price, dailyChangePercent, strategy: "volume_profile" };
  if (score < cfg.minConfidence) return { decision: "watching", reasoning: `${symbol}: ${direction} VP breakout but score ${score}/100 below ${cfg.minConfidence}.`, score, price, dailyChangePercent, strategy: "volume_profile" };
  return { decision: "signal", score, price, dailyChangePercent, strategy: "volume_profile", direction, reasoning: `${symbol}: ${direction} value-area ${direction === "BUY" ? "breakout above " + VAH.toFixed(2) : "breakdown below " + VAL.toFixed(2)} (POC ~$${(lo + (poc + 0.5) * binSize).toFixed(2)}), volume confirming. Score ${score}/100.` };
}
async function runBreakout(symbol, cfg) {
  const bars = await CryptoComService.getCandles(symbol, "1h", 60);
  if (bars.length < 25) return { decision: "error", reasoning: `${symbol}: not enough candles for breakout.`, score: null, price: null, dailyChangePercent: null, strategy: "breakout" };
  const c = convertToCandles(bars);
  const price = c[c.length - 1].c;
  const dailyChangePercent = (price - c[0].c) / c[0].c * 100;
  const lookback = 20;
  const prior = c.slice(-(lookback + 1), -1);
  const priorHigh = Math.max(...prior.map((b) => b.h)), priorLow = Math.min(...prior.map((b) => b.l));
  const avgVol = prior.reduce((s, b) => s + (b.v ?? 0), 0) / prior.length;
  const last = c[c.length - 1];
  let direction = null;
  if (last.c > priorHigh) direction = "BUY";
  else if (last.c < priorLow) direction = "SELL";
  if (!direction) return { decision: "watching", reasoning: `${symbol}: inside its ${lookback}h range $${priorLow.toFixed(2)}\u2013$${priorHigh.toFixed(2)} \u2014 no breakout.`, score: 45, price, dailyChangePercent, strategy: "breakout" };
  const volConfirm = (last.v ?? 0) > avgVol;
  if (!volConfirm) return { decision: "watching", reasoning: `${symbol}: ${direction} breakout of ${lookback}h range but volume not confirming (${Math.round(last.v ?? 0)} vs avg ${Math.round(avgVol)}).`, score: 52, price, dailyChangePercent, strategy: "breakout" };
  const score = Math.round(Math.min(90, 65 + Math.min(20, Math.abs(last.c - (direction === "BUY" ? priorHigh : priorLow)) / price * 2e3)));
  const directionAllowed = cfg.directionFilter === "both" || cfg.directionFilter === "long_only" && direction === "BUY" || cfg.directionFilter === "short_only" && direction === "SELL";
  if (!directionAllowed) return { decision: "skipped", reasoning: `${symbol}: ${direction} breakout, but direction filter is "${cfg.directionFilter}".`, score, price, dailyChangePercent, strategy: "breakout" };
  if (score < cfg.minConfidence) return { decision: "watching", reasoning: `${symbol}: ${direction} volume-confirmed breakout but score ${score}/100 below ${cfg.minConfidence}.`, score, price, dailyChangePercent, strategy: "breakout" };
  return { decision: "signal", score, price, dailyChangePercent, strategy: "breakout", direction, reasoning: `${symbol}: ${direction} volume-confirmed breakout of ${lookback}h range ($${priorLow.toFixed(2)}\u2013$${priorHigh.toFixed(2)}), now $${price.toFixed(2)}. Score ${score}/100.` };
}
async function scanSymbol(symbol, cfg) {
  if (cfg.strategyMode === "auto") {
    const results = await Promise.all(AUTO_STRATEGIES.map((k) => STRATEGY_RUNNERS[k](symbol, cfg).catch(() => null)));
    const valid = results.filter((r) => !!r);
    const signals = valid.filter((r) => r.decision === "signal").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (signals.length > 0) return signals[0];
    if (cfg.enableCompositeAutonomous) {
      const dir = valid.filter((r) => r.direction);
      const buys = dir.filter((r) => r.direction === "BUY"), sells = dir.filter((r) => r.direction === "SELL");
      const side = buys.length > sells.length ? buys : sells.length > buys.length ? sells : [];
      if (side.length >= 2) {
        const composite = Math.round(side.reduce((s, r) => s + (r.score ?? 0), 0) / side.length);
        const floor = cfg.compositeMinEdgeScore ?? 72;
        if (composite >= floor) {
          const direction = side[0].direction;
          const allowed = cfg.directionFilter === "both" || cfg.directionFilter === "long_only" && direction === "BUY" || cfg.directionFilter === "short_only" && direction === "SELL";
          if (allowed) return { decision: "signal", score: composite, price: side[0].price, dailyChangePercent: side[0].dailyChangePercent, strategy: "composite_autonomous", direction, reasoning: `${symbol}: Composite Autonomous Entry \u2014 ${side.length} strategies agree ${direction}, blended ${composite}/100 (floor ${floor}).` };
        }
      }
    }
    const watching = valid.filter((r) => r.decision === "watching").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (watching.length > 0) return watching[0];
    return valid[0] ?? { decision: "error", reasoning: `${symbol}: all strategies failed.`, score: null, price: null, dailyChangePercent: null, strategy: "auto" };
  }
  const runner = STRATEGY_RUNNERS[cfg.strategyMode] || runTrendFollowing;
  return runner(symbol, cfg);
}
async function computeCryptocomQuantity(userId, cfg, accountBalance, price, symbol) {
  if (!price || price <= 0 || accountBalance <= 0) return { quantity: 0, reasoning: "" };
  const riskAmount = accountBalance * (cfg.riskPerTrade / 100) * cfg.leverage;
  let baseQty = Math.max(0, Math.round(riskAmount / price * 1e3) / 1e3);
  let brainNote = "";
  if (cfg.cryptoBrainEnabled !== false && symbol) {
    const bm = cryptoBrainSizeMultiplier(userId, symbol);
    if (bm !== 1) {
      baseQty = Math.round(baseQty * bm * 1e3) / 1e3;
      brainNote = ` \u{1F9E0} Brain ${bm}\xD7 (${symbol}).`;
    }
  }
  if (cfg.brainLearningMode) {
    const stats = await storage.getCryptocomEngineTradeStats(userId);
    const brainLocked = stats.totalClosed < 10 || stats.winRate < 60;
    if (brainLocked) {
      return { quantity: baseQty > 0 ? Math.min(baseQty, Math.max(1e-3, baseQty * 0.25)) : 0, reasoning: `\u{1F9E0} Learning Mode: sized conservatively (${stats.totalClosed}/10 trades, ${stats.winRate}%/60% WR).` };
    }
    if (cfg.useKellyCriterion) {
      const fractionalKelly = stats.winRate / 100 * 0.25;
      return { quantity: baseQty * (1 + fractionalKelly), reasoning: `\u{1F9E0} Brain unlocked (${stats.totalClosed} trades @ ${stats.winRate}% WR) + Kelly sizing.${brainNote}` };
    }
    return { quantity: baseQty, reasoning: `\u{1F9E0} Brain unlocked (${stats.totalClosed} trades @ ${stats.winRate}% WR) \u2014 full risk sizing.${brainNote}` };
  }
  if (cfg.useKellyCriterion) {
    const stats = await storage.getCryptocomEngineTradeStats(userId);
    const fractionalKelly = stats.winRate / 100 * 0.25;
    return { quantity: baseQty * (1 + fractionalKelly), reasoning: `Kelly sizing (${stats.winRate}% WR over ${stats.totalClosed} trades).${brainNote}` };
  }
  return { quantity: baseQty, reasoning: brainNote.trim() };
}
function computeTrailFloorR(cfg, peakR) {
  switch (cfg.trailMethod) {
    case "fixed_r":
      return peakR - cfg.trailFixedR;
    case "stepped_fixed": {
      const steps = Math.floor(peakR / cfg.trailStepR);
      return (steps - 1) * cfg.trailStepR;
    }
    case "profit_lock":
      return peakR * (cfg.trailProfitLockPct / 100);
    case "chandelier":
      return peakR - cfg.trailFixedR * 1.5;
    case "parabolic_sar": {
      const af = Math.min(cfg.trailSarMaxAF, cfg.trailSarInitialAF + peakR * cfg.trailSarInitialAF);
      return peakR * (1 - af);
    }
    case "r_multiple":
      return cfg.trailActivationR + (peakR - cfg.trailActivationR) * 0.5;
    case "swing_structure":
      return peakR - cfg.trailFixedR * 0.75;
    default:
      return -Infinity;
  }
}
async function monitorOpenPositions(userId, cfg) {
  const openTrades = await storage.getOpenCryptocomEngineTrades(userId);
  if (openTrades.length === 0) return;
  for (const trade of openTrades) {
    try {
      if (trade.venue && trade.venue !== "cryptocom") {
        const { getAggregatedQuote: getAggregatedQuote2 } = await Promise.resolve().then(() => (init_crypto_market_data(), crypto_market_data_exports));
        const q = await getAggregatedQuote2(baseCoin(trade.symbol)).catch(() => null);
        const px = q?.best?.price ?? 0;
        if (!px) continue;
        if (trade.takeProfit && px >= trade.takeProfit) {
          await closePosition(userId, trade, px, "take_profit");
          continue;
        }
        if (trade.stopLoss && px <= trade.stopLoss) {
          await closePosition(userId, trade, px, "stop_loss");
          continue;
        }
        continue;
      }
      if (cfg.trailMethod === "none") continue;
      const currentPrice = await CryptoComService.getTicker(trade.symbol);
      if (!currentPrice || !trade.stopLoss) continue;
      const riskDistance = Math.abs(trade.entryPrice - trade.stopLoss);
      if (riskDistance <= 0) continue;
      const isLong = trade.direction === "long";
      const currentR = isLong ? (currentPrice - trade.entryPrice) / riskDistance : (trade.entryPrice - currentPrice) / riskDistance;
      const peakR = Math.max(trade.peakRMultiple, currentR);
      const armed = trade.trailArmed || peakR >= cfg.trailActivationR;
      if (currentR <= -1) {
        await closePosition(userId, trade, currentPrice, "stop_loss");
        continue;
      }
      if (armed) {
        const floor = Math.max(computeTrailFloorR(cfg, peakR), cfg.breakevenBufferR);
        if (currentR <= floor) {
          await closePosition(userId, trade, currentPrice, "trailing_stop");
          continue;
        }
      }
      if (peakR !== trade.peakRMultiple || armed !== trade.trailArmed) {
        await storage.updateCryptocomEngineTradeTrailState(trade.id, { peakRMultiple: peakR, trailArmed: armed });
      }
    } catch (err) {
      console.error(`[cryptocom-scanner] monitor failed for trade ${trade.id}:`, err.message);
    }
  }
}
async function closePosition(userId, trade, currentPrice, reason) {
  try {
    const venue = trade.venue && trade.venue !== "cryptocom" ? trade.venue : null;
    if (venue === "defi") {
      const cfg = await storage.getUserCryptocomEngineConfig(userId).catch(() => null);
      const { defiExitSell: defiExitSell2 } = await Promise.resolve().then(() => (init_defi_executor(), defi_executor_exports));
      const exit = await defiExitSell2(userId, cfg?.defiChain || "base", baseCoin(trade.symbol), trade.quantity, cfg?.defiSlippageBps ?? 100).catch((e) => ({ ok: false, exitPrice: 0, reason: e?.message || String(e) }));
      if (!exit?.ok) {
        console.error(`[cryptocom-scanner] DeFi exit FAILED for trade ${trade.id} (${trade.symbol}): ${exit?.reason || "unknown"} \u2014 position left OPEN`);
        await storage.createCryptocomEngineActivity({ userId, symbol: trade.symbol, decision: "signal", strategy: trade.strategy, reasoning: `${trade.symbol}: DeFi EXIT FAILED (${exit?.reason || "error"}) \u2014 position still OPEN, will retry next cycle. No P&L booked.`, score: null, price: currentPrice, dailyChangePercent: null, source: "cryptocom" }).catch(() => {
        });
        return;
      }
      if (exit.exitPrice) currentPrice = exit.exitPrice;
    } else if (venue) {
      const exit = await cefiExitSell(userId, venue, baseCoin(trade.symbol), trade.quantity).catch((e) => ({ ok: false, exitPrice: 0, reason: e?.message || String(e) }));
      if (!exit?.ok) {
        console.error(`[cryptocom-scanner] CeFi exit FAILED for trade ${trade.id} (${trade.symbol}) on ${venue}: ${exit?.reason || "unknown"} \u2014 position left OPEN`);
        await storage.createCryptocomEngineActivity({ userId, symbol: trade.symbol, decision: "signal", strategy: trade.strategy, reasoning: `${trade.symbol}: ${venue} EXIT FAILED (${exit?.reason || "error"}) \u2014 position still OPEN, will retry. No P&L booked.`, score: null, price: currentPrice, dailyChangePercent: null, source: "cryptocom" }).catch(() => {
        });
        return;
      }
      if (exit.exitPrice) currentPrice = exit.exitPrice;
    } else {
      const connection = await storage.getUserCryptocomConnections(userId).then((c) => c.find((x) => x.id === trade.connectionId));
      if (connection) {
        const service = new CryptoComService(connection.apiKey, decryptApiSecret(connection.encryptedApiSecret));
        const closeSide = trade.direction === "long" ? "SELL" : "BUY";
        await service.placeOrder({ instrumentName: trade.symbol, side: closeSide, quantity: trade.quantity, type: "MARKET" }).catch(() => {
        });
      }
    }
    const realizedPnl = (trade.direction === "long" ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice) * trade.quantity;
    await storage.closeCryptocomEngineTrade(trade.id, { exitPrice: currentPrice, exitReason: reason, realizedPnl });
    await storage.createCryptocomEngineActivity({
      userId,
      symbol: trade.symbol,
      decision: "signal",
      strategy: trade.strategy,
      reasoning: `${trade.symbol}: CLOSED ${trade.quantity} @ ~$${currentPrice.toFixed(2)} (${reason.replace("_", " ")}). Realized P&L: $${realizedPnl.toFixed(2)}.`,
      score: null,
      price: currentPrice,
      dailyChangePercent: null,
      source: "cryptocom"
    });
    try {
      await recordRealizedPnl(userId, trade.connectionId, "cryptocom", realizedPnl);
    } catch {
    }
    try {
      const notional = (trade.entryPrice || 0) * (trade.quantity || 0);
      const returnPct = notional > 0 ? realizedPnl / notional * 100 : 0;
      const entered = trade.createdAt ? new Date(trade.createdAt).getTime() : Date.now();
      await recordCryptoBrainOutcome({
        userId,
        symbol: trade.symbol,
        strategy: trade.strategy || "unknown",
        direction: trade.direction,
        entryConfidence: trade.entryConfidence ?? null,
        returnPct,
        holdingMinutes: Math.max(0, Math.round((Date.now() - entered) / 6e4)),
        exitReason: reason,
        profitLoss: realizedPnl
      });
    } catch {
    }
  } catch (err) {
    console.error(`[cryptocom-scanner] closePosition failed for trade ${trade.id}:`, err.message);
  }
}
async function manualCloseCryptoTrade(userId, tradeId) {
  try {
    const open = await storage.getOpenCryptocomEngineTrades(userId);
    const trade = open.find((t) => t.id === tradeId);
    if (!trade) return { ok: false, error: "Trade not found or already closed" };
    let px = 0;
    try {
      const bars = await CryptoComService.getCandles(trade.symbol, "5m", 2);
      px = bars?.[bars.length - 1]?.c ?? 0;
    } catch {
    }
    if (!(px > 0)) return { ok: false, error: "Could not fetch current price to close" };
    await closePosition(userId, trade, px, "manual");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || "close failed" };
  }
}
async function checkSafetyGates(userId, cfg, equity) {
  if (cfg.maxDailyTrades > 0) {
    const count = await storage.getTodayCryptocomEngineTradeCount(userId);
    if (count >= cfg.maxDailyTrades) return { allowed: false, reason: `max daily trades (${cfg.maxDailyTrades}) reached`, riskMultiplier: 1 };
  }
  const openTrades = await storage.getOpenCryptocomEngineTrades(userId);
  if (openTrades.length >= cfg.maxOpenTrades) return { allowed: false, reason: `max open trades (${cfg.maxOpenTrades}) reached`, riskMultiplier: 1 };
  let riskMultiplier = 1;
  if (equity > 0) {
    const todayPnl = await storage.getTodayCryptocomEngineRealizedPnl(userId);
    if (cfg.dailyLossLimit > 0 && todayPnl <= -(equity * cfg.dailyLossLimit / 100)) {
      return { allowed: false, reason: `daily loss limit (${cfg.dailyLossLimit}%) reached`, riskMultiplier: 1 };
    }
    if (cfg.dailyProfitTarget > 0 && todayPnl >= equity * cfg.dailyProfitTarget / 100) {
      return { allowed: false, reason: `daily profit target (${cfg.dailyProfitTarget}%) already reached`, riskMultiplier: 1 };
    }
    const peak = Math.max(sessionPeakEquity.get(userId) ?? equity, equity);
    sessionPeakEquity.set(userId, peak);
    const ddFromPeakPct = peak > 0 ? (peak - equity) / peak * 100 : 0;
    if (ddFromPeakPct >= cfg.drawdownShieldThreshold) riskMultiplier = Math.min(riskMultiplier, 0.25);
    if (cfg.ruinGuardEnabled) {
      const base = cfg.accountBalance > 0 ? cfg.accountBalance : equity;
      const dailyLimitPct = cfg.dailyLossLimitPct ?? 5;
      const maxDdPct = cfg.maxDrawdownLimitPct ?? 10;
      if (dailyLimitPct > 0 && todayPnl <= -(base * dailyLimitPct / 100)) {
        return { allowed: false, reason: `\u{1F6D1} Ruin Guard: daily P&L hit the \u2212${dailyLimitPct}% limit \u2014 halted until next UTC day`, riskMultiplier: 1 };
      }
      if (maxDdPct > 0 && ddFromPeakPct >= maxDdPct) {
        return { allowed: false, reason: `\u{1F6D1} Ruin Guard: drawdown ${ddFromPeakPct.toFixed(1)}% from peak hit the ${maxDdPct}% max-DD limit \u2014 halted until equity recovers`, riskMultiplier: 1 };
      }
    }
    if (cfg.consistencyEnforcementEnabled) {
      const history = await storage.getCryptocomEngineDailyPnlHistory(userId, cfg.consistencyPeriodDays);
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      history[today] = todayPnl;
      if (cfg.maxDailyProfitPctOfTotal > 0) {
        const totalProfitAllTime = Object.values(history).reduce((s, v) => s + Math.max(0, v ?? 0), 0);
        const todayProfit = Math.max(0, todayPnl);
        if (totalProfitAllTime > 0 && todayProfit > 0) {
          const todayPctOfTotal = todayProfit / totalProfitAllTime * 100;
          if (todayPctOfTotal >= cfg.maxDailyProfitPctOfTotal) {
            return { allowed: false, reason: `consistency rule \u2014 today's profit already ${todayPctOfTotal.toFixed(0)}% of total`, riskMultiplier: 1 };
          }
        }
      }
    }
  }
  return { allowed: true, riskMultiplier };
}
function quantVerdictFromScore(score) {
  if (score === null) return "SKIP";
  if (score >= 65) return "CONFIRM";
  if (score >= 40) return "WATCH";
  return "SKIP";
}
async function getCryptocomAiConfirmationLite(userId, symbol, result) {
  try {
    const { getUniversalAIClientForUser: getUniversalAIClientForUser2 } = await Promise.resolve().then(() => (init_openai(), openai_exports));
    const client2 = await getUniversalAIClientForUser2(userId);
    const system = 'You are a disciplined crypto perpetual futures second opinion. Given a rules-based signal, decide whether you would independently confirm or skip it. Respond ONLY with JSON: {"confirmed": boolean, "confidence": number (0-100), "reasoning": string}.';
    const user = `Symbol: ${symbol}
Strategy: ${result.strategy}
Direction: ${result.direction}
Quant score: ${result.score}/100
Price: ${result.price}
Daily change %: ${result.dailyChangePercent}
Reasoning: ${result.reasoning}`;
    const r = await client2.chat.completions.create({
      model: client2.defaultModel || "gpt-4o-mini",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.3
    });
    const parsed = JSON.parse(r.choices?.[0]?.message?.content || "{}");
    return { confirmed: !!parsed.confirmed, confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)), reasoning: String(parsed.reasoning || "") };
  } catch (err) {
    return { confirmed: false, confidence: 0, reasoning: `AI confirmation unavailable: ${err.message}` };
  }
}
async function getCryptocomAiConfirmation(userId, symbol, result) {
  try {
    const bars = await CryptoComService.getCandles(symbol, "5m", 100);
    if (!bars || bars.length < 30) return getCryptocomAiConfirmationLite(userId, symbol, result);
    const candles = convertToCandles(bars);
    const indicators = computeAllAdvancedIndicators(candles, 0, symbol, "M5");
    const { getAiVisionConfirmation: getAiVisionConfirmation2 } = await Promise.resolve().then(() => (init_openai(), openai_exports));
    const proposedSignal = result.direction === "BUY" ? "BUY" : result.direction === "SELL" ? "SELL" : "NEUTRAL";
    const tradePlan = { direction: proposedSignal, entry: result.price, strategy: result.strategy };
    const conf = await getAiVisionConfirmation2(
      candles,
      indicators,
      proposedSignal,
      Math.max(0, Math.min(100, result.score ?? 0)),
      tradePlan,
      symbol,
      "M5",
      userId,
      void 0,
      null,
      null,
      void 0,
      null,
      void 0,
      void 0,
      `crypto-${result.strategy}`,
      false
    );
    if (!conf || conf.aiConfidence === void 0 && conf.confirmed === void 0) {
      return getCryptocomAiConfirmationLite(userId, symbol, result);
    }
    const dirOk = !conf.aiDirection || conf.aiDirection === "NEUTRAL" || conf.aiDirection === proposedSignal;
    return {
      confirmed: !!conf.confirmed && dirOk,
      confidence: Math.max(0, Math.min(100, Number(conf.aiConfidence) || 0)),
      reasoning: `[SS AI${conf.modelUsed ? ` \xB7 ${conf.modelUsed}` : ""}] ${String(conf.reasoning || "no reasoning returned")}${dirOk ? "" : ` (direction mismatch: AI says ${conf.aiDirection}, signal is ${proposedSignal} \u2014 skipped)`}`
    };
  } catch (err) {
    return getCryptocomAiConfirmationLite(userId, symbol, result);
  }
}
function pushConsensus(userId, entry) {
  global.cryptocomEngineConsensus = global.cryptocomEngineConsensus || {};
  const list = global.cryptocomEngineConsensus[userId] || [];
  const deduped = list.filter((e) => e.symbol !== entry.symbol);
  global.cryptocomEngineConsensus[userId] = [entry, ...deduped].slice(0, 20);
  Promise.resolve().then(() => (init_engine_consensus(), engine_consensus_exports)).then(
    ({ recordEngineConsensus: recordEngineConsensus2 }) => recordEngineConsensus2(userId, "cryptocom", entry)
  ).catch(() => {
  });
}
async function assembleConsensus(userId, symbol, result, cfg) {
  const quantVerdict = quantVerdictFromScore(result.score);
  if (cfg.aiMode === "rule_based") {
    const tradeAllowed2 = quantVerdict !== "SKIP";
    pushConsensus(userId, {
      symbol,
      strategy: result.strategy,
      quantVerdict,
      quantScore: result.score ?? 0,
      aiVerdict: "CONFIRM",
      aiConfidence: 0,
      aiReasoning: "Rule-based mode \u2014 AI confirmation skipped.",
      consensus: quantVerdict === "CONFIRM" ? "STRONG_CONFIRM" : quantVerdict === "SKIP" ? "STRONG_SKIP" : "WATCH",
      tradeAllowed: tradeAllowed2,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    return tradeAllowed2;
  }
  const ai = await getCryptocomAiConfirmation(userId, symbol, result);
  const aiVerdict = ai.confirmed && ai.confidence >= Math.max(60, cfg.minConfidence) ? "CONFIRM" : "SKIP";
  let consensus;
  if (quantVerdict === "CONFIRM" && aiVerdict === "CONFIRM") consensus = "STRONG_CONFIRM";
  else if (quantVerdict === "SKIP" && aiVerdict === "SKIP") consensus = "STRONG_SKIP";
  else if (quantVerdict === "CONFIRM" && aiVerdict === "SKIP" || quantVerdict === "SKIP" && aiVerdict === "CONFIRM") consensus = "CAUTION";
  else consensus = "WATCH";
  const tradeAllowed = consensus !== "STRONG_SKIP" && aiVerdict === "CONFIRM";
  pushConsensus(userId, { symbol, strategy: result.strategy, quantVerdict, quantScore: result.score ?? 0, aiVerdict, aiConfidence: ai.confidence, aiReasoning: ai.reasoning, consensus, tradeAllowed, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  return tradeAllowed;
}
async function executeSignal(service, connection, userId, symbol, result, cfg) {
  if (!result.direction || !result.price) return;
  if (!cfg.multiVenueEnabled) {
    return executeSignalSingle(service, connection, userId, symbol, result, cfg);
  }
  const arms = [];
  if (connection) arms.push({ venue: "cryptocom", label: "perps" });
  if (cfg.defiAutoTradeEnabled) arms.push({ venue: "defi", label: "DeFi" });
  if (cfg.cefiAutoTradeEnabled) {
    try {
      const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      for (const [tbl, v] of [["coinbase_connections", "coinbase"], ["kraken_connections", "kraken"], ["gemini_connections", "gemini"]]) {
        const r = await pool2.query(`SELECT 1 FROM ${tbl} WHERE user_id=$1 AND is_active=true LIMIT 1`, [userId]).catch(() => null);
        if (r && r.rows.length) arms.push({ venue: v, label: v });
      }
    } catch {
    }
  }
  for (const arm of arms) {
    const armCfg = {
      ...cfg,
      executionVenue: arm.venue,
      defiAutoTradeEnabled: arm.venue === "defi",
      cefiAutoTradeEnabled: arm.venue !== "defi" && arm.venue !== "cryptocom"
    };
    await executeSignalSingle(service, connection, userId, symbol, result, armCfg).catch((e) => console.error(`[cryptocom-scanner] fan-out ${arm.label} failed for ${symbol}:`, e?.message ?? e));
  }
}
async function executeSignalSingle(service, connection, userId, symbol, result, cfg) {
  if (!result.direction || !result.price) return;
  const venue = cfg.executionVenue;
  if (venue === "defi" && cfg.defiAutoTradeEnabled) {
    if (result.direction !== "BUY") {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: "skipped", strategy: result.strategy, reasoning: `${symbol}: DeFi swaps are long-only \u2014 SELL/short signals aren't traded on-chain.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
      return;
    }
    const gateD = await checkSafetyGates(userId, cfg, cfg.accountBalance);
    if (!gateD.allowed) {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: "skipped", strategy: result.strategy, reasoning: `${symbol}: signal confirmed, but execution blocked \u2014 ${gateD.reason}.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
      return;
    }
    const chain = cfg.defiChain || "base";
    const slip = cfg.defiSlippageBps ?? 100;
    const notionalD = Math.max(1, cfg.defiNotionalUsd ?? 25) * (gateD.riskMultiplier < 1 ? gateD.riskMultiplier : 1);
    try {
      const { defiEntryBuy: defiEntryBuy2 } = await Promise.resolve().then(() => (init_defi_executor(), defi_executor_exports));
      const r = await defiEntryBuy2(userId, chain, symbol, notionalD, slip);
      if (!r.ok) {
        await storage.createCryptocomEngineActivity({ userId, symbol, decision: r.reason?.includes("can't trade") ? "skipped" : "error", strategy: result.strategy, reasoning: `${symbol}: DeFi swap entry ${r.reason?.includes("can't trade") ? "skipped" : "failed"} \u2014 ${r.reason}.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
        return;
      }
      const tp = r.entryPrice * (1 + (cfg.cefiTakeProfitPct ?? 3) / 100);
      const sl = r.entryPrice * (1 - (cfg.cefiStopLossPct ?? 2) / 100);
      await storage.createCryptocomEngineTrade({
        userId,
        connectionId: connection?.id ?? 0,
        venue: "defi",
        symbol,
        strategy: result.strategy,
        direction: "long",
        quantity: r.qtyBase,
        entryPrice: r.entryPrice,
        stopLoss: sl,
        takeProfit: tp,
        entryOrderId: r.txHash ?? "",
        entryReasoning: result.reasoning,
        status: "open"
      });
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: "signal", strategy: result.strategy, reasoning: `${symbol}: EXECUTED on DeFi (${chain}) \u2014 swapped ~$${notionalD.toFixed(0)} USDC \u2192 ${r.qtyBase} ${r.token} @ ~$${r.entryPrice.toFixed(2)}. TP +${cfg.cefiTakeProfitPct ?? 3}% / SL -${cfg.cefiStopLossPct ?? 2}%. tx ${r.txHash?.slice(0, 12) ?? ""}\u2026 ${result.reasoning}`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
    } catch (err) {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: "error", strategy: result.strategy, reasoning: `${symbol}: DeFi swap error: ${err.message}`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
    }
    return;
  }
  if (venue && venue !== "cryptocom" && venue !== "defi" && cfg.cefiAutoTradeEnabled) {
    if (result.direction !== "BUY") {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: "skipped", strategy: result.strategy, reasoning: `${symbol}: ${venue} is spot (long-only) \u2014 SELL/short signals aren't traded on this venue.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
      return;
    }
    const gateC = await checkSafetyGates(userId, cfg, cfg.accountBalance);
    if (!gateC.allowed) {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: "skipped", strategy: result.strategy, reasoning: `${symbol}: signal confirmed, but execution blocked \u2014 ${gateC.reason}.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
      return;
    }
    const base = baseCoin(symbol);
    const notional = Math.max(1, cfg.cefiNotionalUsd ?? 25) * (gateC.riskMultiplier < 1 ? gateC.riskMultiplier : 1);
    try {
      const r = await cefiEntryBuy(userId, venue, base, notional);
      if (!r.ok) {
        await storage.createCryptocomEngineActivity({ userId, symbol, decision: "error", strategy: result.strategy, reasoning: `${symbol}: ${venue} spot entry failed \u2014 ${r.reason}.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
        return;
      }
      await storage.createCryptocomEngineTrade({
        userId,
        connectionId: connection?.id ?? 0,
        venue,
        symbol: r.venueSymbol,
        strategy: result.strategy,
        direction: "long",
        quantity: r.qtyBase,
        entryPrice: r.entryPrice,
        stopLoss: r.entryPrice * (1 - (cfg.cefiStopLossPct ?? 2) / 100),
        takeProfit: r.entryPrice * (1 + (cfg.cefiTakeProfitPct ?? 3) / 100),
        entryOrderId: r.orderId,
        entryReasoning: result.reasoning,
        status: "open"
      });
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: "signal", strategy: result.strategy, reasoning: `${symbol}: EXECUTED on ${venue.toUpperCase()} \u2014 spot BUY ${r.qtyBase} ${base} (~$${notional.toFixed(0)}) @ ~$${r.entryPrice.toFixed(2)}. TP +${cfg.cefiTakeProfitPct ?? 3}% / SL -${cfg.cefiStopLossPct ?? 2}%. ${result.reasoning}`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
    } catch (err) {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: "error", strategy: result.strategy, reasoning: `${symbol}: ${venue} spot order error: ${err.message}`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
    }
    return;
  }
  let account;
  try {
    account = await service.getAccountInfo();
  } catch (err) {
    await storage.createCryptocomEngineActivity({ userId, symbol, decision: "error", strategy: result.strategy, reasoning: `${symbol}: couldn't fetch account info: ${err.message}`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
    return;
  }
  const gateEquity = account.equity > 0 ? account.equity : cfg.accountBalance;
  const gate = await checkSafetyGates(userId, cfg, gateEquity);
  if (!gate.allowed) {
    await storage.createCryptocomEngineActivity({ userId, symbol, decision: "skipped", strategy: result.strategy, reasoning: `${symbol}: signal confirmed, but execution blocked \u2014 ${gate.reason}.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
    return;
  }
  const sizingCfg = gate.riskMultiplier < 1 ? { ...cfg, riskPerTrade: cfg.riskPerTrade * gate.riskMultiplier } : cfg;
  const { quantity, reasoning: sizingReasoning } = await computeCryptocomQuantity(userId, sizingCfg, gateEquity, result.price, symbol);
  if (quantity <= 0) {
    await storage.createCryptocomEngineActivity({ userId, symbol, decision: "skipped", strategy: result.strategy, reasoning: `${symbol}: signal confirmed, but sizing produced 0 quantity.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
    return;
  }
  const atrDistance = Math.max(result.price * 0.01, result.price * 5e-3);
  const stopLoss = result.direction === "BUY" ? result.price - atrDistance : result.price + atrDistance;
  const takeProfit = result.direction === "BUY" ? result.price + atrDistance * 2 : result.price - atrDistance * 2;
  let order;
  try {
    order = await service.placeOrder({ instrumentName: symbol, side: result.direction, quantity, type: "MARKET" });
  } catch (err) {
    await storage.createCryptocomEngineActivity({ userId, symbol, decision: "error", strategy: result.strategy, reasoning: `${symbol}: order failed: ${err.message}`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
    return;
  }
  await storage.createCryptocomEngineTrade({
    userId,
    connectionId: connection.id,
    symbol,
    strategy: result.strategy,
    direction: result.direction === "BUY" ? "long" : "short",
    quantity,
    entryPrice: result.price,
    stopLoss,
    takeProfit,
    entryOrderId: order.orderId,
    entryReasoning: result.reasoning,
    status: "open"
  });
  await storage.createCryptocomEngineActivity({
    userId,
    symbol,
    decision: "signal",
    strategy: result.strategy,
    reasoning: `${symbol}: EXECUTED \u2014 ${result.direction === "BUY" ? "long" : "short"} ${quantity} @ ~$${result.price.toFixed(2)}. ${result.reasoning}${sizingReasoning ? ` ${sizingReasoning}` : ""}`,
    score: result.score,
    price: result.price,
    dailyChangePercent: result.dailyChangePercent,
    source: "cryptocom"
  });
}
async function scanOneUser(userId) {
  const config = await storage.getUserCryptocomEngineConfig(userId);
  if (!config || !config.isActive) return;
  const now = Date.now();
  const last = lastScanAt.get(userId) || 0;
  if (now - last < Math.max(MIN_SCAN_INTERVAL_MS, config.scanIntervalMs)) return;
  lastScanAt.set(userId, now);
  const connections = await storage.getUserCryptocomConnections(userId);
  const activeConn = connections.find((c) => c.isActive);
  if (!activeConn) {
    await storage.createCryptocomEngineActivity({ userId, symbol: "\u2014", decision: "error", reasoning: "No active Crypto.com connection.", score: null, price: null, dailyChangePercent: null, source: "cryptocom", strategy: null });
    return;
  }
  let service;
  try {
    service = new CryptoComService(activeConn.apiKey, decryptApiSecret(activeConn.encryptedApiSecret));
  } catch (err) {
    await storage.createCryptocomEngineActivity({ userId, symbol: "\u2014", decision: "error", reasoning: `Could not decrypt credentials: ${err.message}`, score: null, price: null, dailyChangePercent: null, source: "cryptocom", strategy: null });
    return;
  }
  await monitorOpenPositions(userId, config).catch((e) => console.error(`[cryptocom-scanner] monitorOpenPositions failed for user ${userId}:`, e.message));
  if (config.cryptoBrainEnabled !== false) await getOrRefreshCryptoBrain(userId).catch(() => {
  });
  const canAutoExecute = activeConn.autoExecute && config.enableAutoExecution;
  const allSymbols = Array.isArray(config.symbols) ? config.symbols : [];
  let symbols = allSymbols;
  if (allSymbols.length > MAX_SYMBOLS_PER_CYCLE) {
    const start = (scanCursor.get(userId) || 0) % allSymbols.length;
    symbols = [];
    for (let i = 0; i < MAX_SYMBOLS_PER_CYCLE; i++) symbols.push(allSymbols[(start + i) % allSymbols.length]);
    scanCursor.set(userId, (start + MAX_SYMBOLS_PER_CYCLE) % allSymbols.length);
  }
  for (const symbol of symbols) {
    try {
      const result = await scanSymbol(symbol, config);
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: result.decision, reasoning: result.reasoning, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom", strategy: result.strategy });
      if (result.decision === "signal" && canAutoExecute) {
        if (config.cryptoBrainEnabled !== false && config.cryptoBrainGating) {
          const g = cryptoBrainGate(userId, symbol, result.strategy, (/* @__PURE__ */ new Date()).getUTCHours());
          if (g.blocked) {
            await storage.createCryptocomEngineActivity({ userId, symbol, decision: "skipped", strategy: result.strategy, reasoning: g.reason, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
            continue;
          }
        }
        const tradeAllowed = await assembleConsensus(userId, symbol, result, config).catch(() => true);
        if (tradeAllowed) {
          await executeSignal(service, activeConn, userId, symbol, result, config).catch((e) => console.error(`[cryptocom-scanner] executeSignal failed for ${symbol}:`, e.message));
        } else {
          await storage.createCryptocomEngineActivity({ userId, symbol, decision: "skipped", strategy: result.strategy, reasoning: `${symbol}: signal confirmed by quant scan, but Dual-Vote Consensus blocked execution.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: "cryptocom" });
        }
      }
    } catch (err) {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: "error", reasoning: `Scan failed for ${symbol}: ${err.message}`, score: null, price: null, dailyChangePercent: null, source: "cryptocom", strategy: config.strategyMode });
    }
  }
}
async function runCryptocomEngineScan() {
  try {
    const configs = await storage.getAllActiveCryptocomEngineConfigs();
    for (const config of configs) {
      await scanOneUser(config.userId).catch((e) => console.error(`[cryptocom-scanner] user ${config.userId} scan failed:`, e.message));
    }
  } catch (err) {
    console.error("[cryptocom-scanner] runCryptocomEngineScan failed:", err.message);
  }
}
function startCryptocomEngineScanner() {
  if (started) return;
  started = true;
  const LOOP_INTERVAL_MS = 6e4;
  setInterval(() => {
    if (scanInFlight) {
      console.warn("[cryptocom-scanner] previous scan still running \u2014 skipping this tick to avoid overlap/OOM");
      return;
    }
    scanInFlight = true;
    runCryptocomEngineScan().catch(() => {
    }).finally(() => {
      scanInFlight = false;
    });
  }, LOOP_INTERVAL_MS);
  console.log("[cryptocom-scanner] Background Crypto.com perpetuals scan loop started (60s tick, re-entrancy guarded, per-user throttled, strategies: trend_following/momentum/auto).");
}
var MIN_SCAN_INTERVAL_MS, lastScanAt, MAX_SYMBOLS_PER_CYCLE, scanCursor, STRATEGY_RUNNERS, AUTO_STRATEGIES, sessionPeakEquity, started, scanInFlight;
var init_cryptocom_scanner = __esm({
  "server/services/cryptocom-scanner.ts"() {
    "use strict";
    init_storage();
    init_cryptocom();
    init_indicators();
    init_crypto_brain();
    init_prop_firm_consistency();
    init_cefi_executor();
    MIN_SCAN_INTERVAL_MS = 6e4;
    lastScanAt = /* @__PURE__ */ new Map();
    MAX_SYMBOLS_PER_CYCLE = 5;
    scanCursor = /* @__PURE__ */ new Map();
    STRATEGY_RUNNERS = {
      trend_following: runTrendFollowing,
      momentum: runMomentum,
      order_flow: runOrderFlow,
      volume_profile: runVolumeProfile,
      breakout: runBreakout
    };
    AUTO_STRATEGIES = ["trend_following", "momentum", "order_flow", "volume_profile", "breakout"];
    sessionPeakEquity = /* @__PURE__ */ new Map();
    started = false;
    scanInFlight = false;
  }
});

// server/crypto-cron.ts
var MAX_RUNTIME_MS = 4 * 60 * 1e3;
var _killTimer = setTimeout(() => {
  console.error("[crypto-cron] MAX_RUNTIME exceeded \u2014 force-exiting to reclaim memory.");
  process.exit(1);
}, MAX_RUNTIME_MS);
_killTimer.unref();
async function main() {
  const started2 = Date.now();
  console.log(`[crypto-cron] start ${(/* @__PURE__ */ new Date()).toISOString()}`);
  try {
    const { ensureCryptocomEngineTables: ensureCryptocomEngineTables2 } = await Promise.resolve().then(() => (init_ensure_cryptocom_engine_tables(), ensure_cryptocom_engine_tables_exports));
    await ensureCryptocomEngineTables2();
  } catch (err) {
    console.error("[crypto-cron] ensureCryptocomEngineTables (non-fatal):", err?.message ?? err);
  }
  const { runCryptocomEngineScan: runCryptocomEngineScan2 } = await Promise.resolve().then(() => (init_cryptocom_scanner(), cryptocom_scanner_exports));
  await runCryptocomEngineScan2();
  console.log(`[crypto-cron] scan complete in ${Date.now() - started2}ms`);
}
main().then(() => {
  clearTimeout(_killTimer);
  process.exit(0);
}).catch((err) => {
  console.error("[crypto-cron] fatal:", err?.stack ?? err);
  clearTimeout(_killTimer);
  process.exit(1);
});
