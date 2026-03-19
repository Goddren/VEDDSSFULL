CREATE TABLE "achievements" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "description" text NOT NULL,
        "category" text NOT NULL,
        "icon" text NOT NULL,
        "points" integer DEFAULT 10 NOT NULL,
        "threshold" integer DEFAULT 1 NOT NULL,
        "is_secret" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_model_configs" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "routing_mode" text DEFAULT 'single' NOT NULL,
        "primary_model_id" text DEFAULT 'openai-gpt4o' NOT NULL,
        "ensemble_model_ids" jsonb DEFAULT '[]'::jsonb,
        "strategy_assignments" jsonb DEFAULT '{}'::jsonb,
        "fallback_order" jsonb DEFAULT '[]'::jsonb,
        "ensemble_min_agreement" integer DEFAULT 60 NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_trade_results" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "analysis_id" integer,
        "symbol" text NOT NULL,
        "timeframe" text,
        "direction" text NOT NULL,
        "entry_price" real NOT NULL,
        "exit_price" real,
        "stop_loss" real,
        "take_profit" real,
        "ai_confidence" integer,
        "result" text,
        "profit_loss" real,
        "profit_loss_pips" real,
        "closed_at" timestamp,
        "source" text DEFAULT 'manual',
        "mt5_ticket" text,
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ambassador_action_rewards" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "action_type" text NOT NULL,
        "action_id" integer,
        "base_reward" real NOT NULL,
        "bonus_reward" real DEFAULT 0,
        "total_reward" real NOT NULL,
        "verification_status" text DEFAULT 'pending' NOT NULL,
        "verified_by" integer,
        "verified_at" timestamp,
        "transfer_job_id" integer,
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ambassador_certifications" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "certificate_number" text NOT NULL,
        "holder_name" text NOT NULL,
        "issue_date" timestamp DEFAULT now() NOT NULL,
        "expiry_date" timestamp,
        "status" text DEFAULT 'active' NOT NULL,
        "final_score" integer NOT NULL,
        "modules_completed" integer NOT NULL,
        "solana_wallet_address" text,
        "nft_mint_address" text,
        "nft_metadata_uri" text,
        "nft_transaction_id" text,
        "nft_minted_at" timestamp,
        "vedd_token_balance" integer DEFAULT 100 NOT NULL,
        "vedd_token_claimed" boolean DEFAULT false NOT NULL,
        "verification_hash" text NOT NULL,
        "certificate_image_url" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "ambassador_certifications_user_id_unique" UNIQUE("user_id"),
        CONSTRAINT "ambassador_certifications_certificate_number_unique" UNIQUE("certificate_number")
);
--> statement-breakpoint
CREATE TABLE "ambassador_challenge_participants" (
        "id" serial PRIMARY KEY NOT NULL,
        "challenge_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "status" text DEFAULT 'joined' NOT NULL,
        "progress" jsonb,
        "proof_url" text,
        "tokens_earned" integer DEFAULT 0,
        "completed_at" timestamp,
        "joined_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "ambassador_challenge_participants_challenge_id_user_id_unique" UNIQUE("challenge_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "ambassador_challenge_sessions" (
        "id" serial PRIMARY KEY NOT NULL,
        "challenge_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "status" text DEFAULT 'in_progress' NOT NULL,
        "current_step" integer DEFAULT 1 NOT NULL,
        "total_steps" integer DEFAULT 1 NOT NULL,
        "ai_context" json,
        "ai_steps" json,
        "evidence_url" text,
        "evidence_notes" text,
        "tokens_claimed" boolean DEFAULT false,
        "started_at" timestamp DEFAULT now() NOT NULL,
        "completed_at" timestamp,
        CONSTRAINT "ambassador_challenge_sessions_challenge_id_user_id_unique" UNIQUE("challenge_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "ambassador_challenges" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL,
        "challenge_type" text NOT NULL,
        "category" text NOT NULL,
        "difficulty" text DEFAULT 'medium' NOT NULL,
        "objectives" jsonb NOT NULL,
        "success_criteria" text NOT NULL,
        "token_reward" integer DEFAULT 50 NOT NULL,
        "bonus_reward" integer DEFAULT 0,
        "badge_reward" text,
        "max_participants" integer,
        "start_date" timestamp NOT NULL,
        "end_date" timestamp NOT NULL,
        "week_number" integer,
        "status" text DEFAULT 'upcoming' NOT NULL,
        "ai_generated" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ambassador_community_comments" (
        "id" serial PRIMARY KEY NOT NULL,
        "target_type" text NOT NULL,
        "target_id" integer NOT NULL,
        "parent_id" integer,
        "author_id" integer NOT NULL,
        "content" text NOT NULL,
        "likes" integer DEFAULT 0,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ambassador_content_progress" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "day_number" integer NOT NULL,
        "status" text DEFAULT 'locked' NOT NULL,
        "ai_generated_content" text,
        "user_media_url" text,
        "user_media_type" text,
        "custom_content" text,
        "tokens_earned" integer DEFAULT 0 NOT NULL,
        "completed_at" timestamp,
        "started_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "ambassador_content_progress_user_id_day_number_unique" UNIQUE("user_id","day_number")
);
--> statement-breakpoint
CREATE TABLE "ambassador_content_stats" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "current_day" integer DEFAULT 1 NOT NULL,
        "completed_days" integer DEFAULT 0 NOT NULL,
        "total_tokens_earned" integer DEFAULT 0 NOT NULL,
        "current_streak" integer DEFAULT 0 NOT NULL,
        "longest_streak" integer DEFAULT 0 NOT NULL,
        "last_completed_at" timestamp,
        "journey_started_at" timestamp,
        "journey_completed_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "ambassador_content_stats_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "ambassador_daily_lessons" (
        "id" serial PRIMARY KEY NOT NULL,
        "day_number" integer NOT NULL,
        "title" text NOT NULL,
        "trading_topic" text NOT NULL,
        "trading_lesson" text NOT NULL,
        "scripture_reference" text NOT NULL,
        "scripture_text" text NOT NULL,
        "devotional_message" text NOT NULL,
        "content_prompt" text NOT NULL,
        "suggested_hashtags" text[],
        "media_type" text DEFAULT 'image' NOT NULL,
        "token_reward" integer DEFAULT 15 NOT NULL,
        "bonus_tokens" integer DEFAULT 5 NOT NULL,
        "week_number" integer NOT NULL,
        "category" text NOT NULL,
        CONSTRAINT "ambassador_daily_lessons_day_number_unique" UNIQUE("day_number")
);
--> statement-breakpoint
CREATE TABLE "ambassador_event_registrations" (
        "id" serial PRIMARY KEY NOT NULL,
        "event_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "role" text DEFAULT 'attendee' NOT NULL,
        "status" text DEFAULT 'registered' NOT NULL,
        "tokens_earned" integer DEFAULT 0,
        "feedback" text,
        "rating" integer,
        "registered_at" timestamp DEFAULT now() NOT NULL,
        "attended_at" timestamp,
        CONSTRAINT "ambassador_event_registrations_event_id_user_id_unique" UNIQUE("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "ambassador_event_schedules" (
        "id" serial PRIMARY KEY NOT NULL,
        "event_id" integer NOT NULL,
        "host_id" integer NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "start_at" timestamp NOT NULL,
        "end_at" timestamp,
        "timezone" text DEFAULT 'UTC',
        "capacity" integer DEFAULT 50,
        "current_attendees" integer DEFAULT 0,
        "meeting_link" text,
        "share_slug" text,
        "ai_agenda" json,
        "status" text DEFAULT 'scheduled' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "ambassador_event_schedules_share_slug_unique" UNIQUE("share_slug")
);
--> statement-breakpoint
CREATE TABLE "ambassador_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL,
        "event_type" text NOT NULL,
        "format" text NOT NULL,
        "host_guide" text NOT NULL,
        "talking_points" jsonb,
        "agenda" jsonb,
        "resource_links" jsonb,
        "suggested_duration" integer DEFAULT 60 NOT NULL,
        "token_reward" integer DEFAULT 25 NOT NULL,
        "host_token_reward" integer DEFAULT 100 NOT NULL,
        "scheduled_date" timestamp,
        "week_number" integer,
        "status" text DEFAULT 'template' NOT NULL,
        "ai_generated" boolean DEFAULT true NOT NULL,
        "recording_url" text,
        "recording_uploaded_at" timestamp,
        "recording_uploaded_by" integer,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ambassador_schedule_registrations" (
        "id" serial PRIMARY KEY NOT NULL,
        "schedule_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "status" text DEFAULT 'registered' NOT NULL,
        "registered_at" timestamp DEFAULT now() NOT NULL,
        "attended_at" timestamp,
        CONSTRAINT "ambassador_schedule_registrations_schedule_id_user_id_unique" UNIQUE("schedule_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "ambassador_social_directions" (
        "id" serial PRIMARY KEY NOT NULL,
        "day_number" integer NOT NULL,
        "platform" text NOT NULL,
        "content_type" text NOT NULL,
        "post_idea" text NOT NULL,
        "caption_template" text NOT NULL,
        "hook_line" text NOT NULL,
        "call_to_action" text NOT NULL,
        "hashtags" text[],
        "best_posting_time" text,
        "engagement_tips" text[],
        "ai_generated" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "ambassador_social_directions_day_number_platform_unique" UNIQUE("day_number","platform")
);
--> statement-breakpoint
CREATE TABLE "ambassador_training_progress" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "completed_modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "completed_lessons" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "quiz_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "total_progress" integer DEFAULT 0 NOT NULL,
        "started_at" timestamp DEFAULT now() NOT NULL,
        "completed_at" timestamp,
        "is_completed" boolean DEFAULT false NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "ambassador_training_progress_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "analysis_feedback" (
        "id" serial PRIMARY KEY NOT NULL,
        "analysis_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "feedback_type" text NOT NULL,
        "comment" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "analysis_feedback_analysis_id_user_id_feedback_type_unique" UNIQUE("analysis_id","user_id","feedback_type")
);
--> statement-breakpoint
CREATE TABLE "analysis_views" (
        "id" serial PRIMARY KEY NOT NULL,
        "analysis_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "viewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chart_analyses" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer,
        "image_url" text NOT NULL,
        "symbol" text,
        "timeframe" text,
        "price" text,
        "direction" text NOT NULL,
        "trend" text NOT NULL,
        "confidence" text NOT NULL,
        "entry_point" text NOT NULL,
        "exit_point" text NOT NULL,
        "stop_loss" text NOT NULL,
        "take_profit" text NOT NULL,
        "risk_reward_ratio" text,
        "potential_pips" text,
        "patterns" jsonb NOT NULL,
        "indicators" jsonb NOT NULL,
        "support_resistance" jsonb,
        "recommendation" text,
        "notes" text,
        "share_id" text,
        "shared_image_url" text,
        "is_public" boolean DEFAULT false,
        "multi_timeframe_group_id" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_social_accounts" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "platform" text NOT NULL,
        "platform_user_id" text,
        "platform_username" text,
        "access_token" text,
        "refresh_token" text,
        "token_expires_at" timestamp,
        "is_active" boolean DEFAULT true NOT NULL,
        "last_sync_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp,
        CONSTRAINT "connected_social_accounts_user_id_platform_unique" UNIQUE("user_id","platform")
);
--> statement-breakpoint
CREATE TABLE "ea_share_assets" (
        "id" serial PRIMARY KEY NOT NULL,
        "ea_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "share_card_url" text,
        "chart_analyses" jsonb NOT NULL,
        "unified_signal" jsonb,
        "devotion_id" integer,
        "devotion_verse" text,
        "devotion_reference" text,
        "devotion_wisdom" text,
        "share_url" text,
        "view_count" integer DEFAULT 0,
        "share_count" integer DEFAULT 0,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ea_subscriptions" (
        "id" serial PRIMARY KEY NOT NULL,
        "ea_id" integer NOT NULL,
        "creator_id" integer NOT NULL,
        "subscriber_id" integer NOT NULL,
        "status" text DEFAULT 'active' NOT NULL,
        "stripe_subscription_id" text,
        "start_date" timestamp DEFAULT now() NOT NULL,
        "end_date" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "ea_subscriptions_ea_id_subscriber_id_unique" UNIQUE("ea_id","subscriber_id")
);
--> statement-breakpoint
CREATE TABLE "follows" (
        "id" serial PRIMARY KEY NOT NULL,
        "follower_id" integer NOT NULL,
        "following_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "follows_follower_id_following_id_unique" UNIQUE("follower_id","following_id")
);
--> statement-breakpoint
CREATE TABLE "governance_proposals" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL,
        "proposer_user_id" integer NOT NULL,
        "proposer_wallet" text NOT NULL,
        "category" text NOT NULL,
        "status" text DEFAULT 'active' NOT NULL,
        "votes_for" integer DEFAULT 0 NOT NULL,
        "votes_against" integer DEFAULT 0 NOT NULL,
        "total_voting_power" real DEFAULT 0 NOT NULL,
        "quorum_required" real DEFAULT 1000 NOT NULL,
        "start_date" timestamp DEFAULT now() NOT NULL,
        "end_date" timestamp NOT NULL,
        "executed_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_votes" (
        "id" serial PRIMARY KEY NOT NULL,
        "proposal_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "wallet_address" text NOT NULL,
        "vote" text NOT NULL,
        "voting_power" real NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "governance_votes_proposal_id_user_id_unique" UNIQUE("proposal_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "internal_wallets" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "vedd_balance" real DEFAULT 0 NOT NULL,
        "pending_balance" real DEFAULT 0 NOT NULL,
        "total_earned" real DEFAULT 0 NOT NULL,
        "total_withdrawn" real DEFAULT 0 NOT NULL,
        "last_activity_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "internal_wallets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "market_data_refresh_jobs" (
        "id" serial PRIMARY KEY NOT NULL,
        "ea_id" integer NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "triggered_by" text NOT NULL,
        "change_summary" jsonb,
        "new_direction" text,
        "new_confidence" text,
        "error" text,
        "triggered_at" timestamp DEFAULT now() NOT NULL,
        "completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "market_data_snapshots" (
        "id" serial PRIMARY KEY NOT NULL,
        "symbol" text NOT NULL,
        "asset_type" text NOT NULL,
        "timeframe" text NOT NULL,
        "provider" text NOT NULL,
        "data" jsonb NOT NULL,
        "hash" text NOT NULL,
        "captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mt5_api_tokens" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "token" text NOT NULL,
        "name" text NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "last_used_at" timestamp,
        "signal_count" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "mt5_api_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "mt5_signal_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "token_id" integer,
        "user_id" integer NOT NULL,
        "action" text NOT NULL,
        "symbol" text NOT NULL,
        "direction" text NOT NULL,
        "volume" real NOT NULL,
        "entry_price" real,
        "stop_loss" real,
        "take_profit" real,
        "ticket" text,
        "source" text,
        "confidence" real,
        "relayed_to_webhooks" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_alerts" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "symbol" text NOT NULL,
        "alert_type" text NOT NULL,
        "target_price" text,
        "current_price" text,
        "message" text NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "is_triggered" boolean DEFAULT false NOT NULL,
        "triggered_at" timestamp,
        "notification_sent" boolean DEFAULT false NOT NULL,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "referrals" (
        "id" serial PRIMARY KEY NOT NULL,
        "referrer_id" integer NOT NULL,
        "referred_id" integer NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "credit_amount" integer DEFAULT 500 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "saved_eas" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "platform_type" text NOT NULL,
        "ea_code" text NOT NULL,
        "symbol" text NOT NULL,
        "strategy_type" text,
        "direction" text,
        "confidence" text,
        "entry_point" text,
        "stop_loss" text,
        "take_profit" text,
        "chart_analysis_data" jsonb,
        "multi_timeframe_group_id" text,
        "refresh_volatility_threshold" integer DEFAULT 30,
        "refresh_atr_threshold" integer DEFAULT 20,
        "refresh_price_threshold" integer DEFAULT 2,
        "volume" real DEFAULT 0.01,
        "use_risk_percent" boolean DEFAULT true,
        "risk_percent" real DEFAULT 0.25,
        "max_open_trades" integer DEFAULT 1,
        "daily_loss_limit" real DEFAULT 0,
        "min_confidence" integer DEFAULT 65,
        "trade_cooldown_minutes" integer DEFAULT 5,
        "live_refresh_enabled" boolean DEFAULT false,
        "is_shared" boolean DEFAULT false,
        "price" integer,
        "share_count" integer DEFAULT 0,
        "stripe_product_id" text,
        "stripe_price_id" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_analyses" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "chart_analysis_id" integer,
        "symbol" text NOT NULL,
        "current_price" text NOT NULL,
        "scenario_type" text NOT NULL,
        "scenario_params" jsonb NOT NULL,
        "outcomes" jsonb NOT NULL,
        "recommendation" text,
        "risk_assessment" text,
        "profit_potential" text,
        "best_case" jsonb,
        "worst_case" jsonb,
        "most_likely" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "platform" text NOT NULL,
        "content_type" text NOT NULL,
        "caption" text,
        "media_urls" text[],
        "hashtags" text[],
        "source_type" text NOT NULL,
        "source_id" integer,
        "platform_post_id" text,
        "platform_post_url" text,
        "status" text DEFAULT 'pending' NOT NULL,
        "scheduled_for" timestamp,
        "published_at" timestamp,
        "error_message" text,
        "engagement" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sol_engine_positions" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "position_id" text NOT NULL,
        "mode" text NOT NULL,
        "symbol" text NOT NULL,
        "mint" text NOT NULL,
        "entry_price" real NOT NULL,
        "current_price" real DEFAULT 0 NOT NULL,
        "target_pct" real NOT NULL,
        "sl_pct" real NOT NULL,
        "size" real NOT NULL,
        "token_amount" real DEFAULT 0 NOT NULL,
        "decimals" integer DEFAULT 9 NOT NULL,
        "strategy_id" text NOT NULL,
        "tx_hash" text,
        "status" text DEFAULT 'open' NOT NULL,
        "opened_at" text NOT NULL,
        "closed_at" text,
        "close_pnl_pct" real,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "sol_engine_positions_position_id_unique" UNIQUE("position_id")
);
--> statement-breakpoint
CREATE TABLE "sol_engine_settings" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "active_strategy" text DEFAULT 'momentum_surfer' NOT NULL,
        "active_strategies" jsonb DEFAULT '[]'::jsonb,
        "auto_trade_enabled" boolean DEFAULT false NOT NULL,
        "live_trade_enabled" boolean DEFAULT false NOT NULL,
        "auto_trade_tp" real DEFAULT 8 NOT NULL,
        "auto_trade_sl" real DEFAULT 4 NOT NULL,
        "auto_trail_activation_pct" real DEFAULT 4 NOT NULL,
        "auto_trail_distance_pct" real DEFAULT 3 NOT NULL,
        "weekly_goal" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "auto_trade_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "server_wallet_key" text,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "sol_engine_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "spread_strategies" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "group_id" text NOT NULL,
        "base_symbol" text NOT NULL,
        "hedge_symbol" text NOT NULL,
        "spread_name" text NOT NULL,
        "spread_type" text NOT NULL,
        "hedge_ratio" real NOT NULL,
        "correlation" real,
        "platform_type" text NOT NULL,
        "generated_code" text NOT NULL,
        "entry_strategy" jsonb,
        "exit_strategy" jsonb,
        "risk_management" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "description" text NOT NULL,
        "price" integer NOT NULL,
        "interval" text DEFAULT 'month' NOT NULL,
        "features" jsonb NOT NULL,
        "analysis_limit" integer NOT NULL,
        "social_share_limit" integer NOT NULL,
        "stripe_product_id" text,
        "stripe_price_id" text,
        "ls_variant_id" text,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "subscription_token_payments" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "subscription_plan_id" integer NOT NULL,
        "token_amount" real NOT NULL,
        "usd_equivalent" real NOT NULL,
        "exchange_rate" real NOT NULL,
        "period_start" timestamp NOT NULL,
        "period_end" timestamp NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "stripe_invoice_id" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_positions" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "token_address" text NOT NULL,
        "token_symbol" text NOT NULL,
        "token_name" text,
        "entry_price_sol" real NOT NULL,
        "current_price_sol" real,
        "amount_tokens" real NOT NULL,
        "amount_sol_invested" real NOT NULL,
        "unrealized_pl" real DEFAULT 0,
        "realized_pl" real,
        "status" text DEFAULT 'open' NOT NULL,
        "signal_confidence" integer,
        "signal_type" text,
        "exit_reason" text,
        "opened_at" timestamp DEFAULT now() NOT NULL,
        "closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tradelocker_connections" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "email" text NOT NULL,
        "encrypted_password" text NOT NULL,
        "server_id" text NOT NULL,
        "account_id" text NOT NULL,
        "account_type" text DEFAULT 'live' NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "auto_execute" boolean DEFAULT false NOT NULL,
        "acc_num" text,
        "access_token" text,
        "refresh_token" text,
        "token_expires_at" timestamp,
        "last_connected_at" timestamp,
        "last_error" text,
        "trade_count" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "tradelocker_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "tradelocker_trade_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "connection_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "source_signal_id" integer,
        "action" text NOT NULL,
        "symbol" text NOT NULL,
        "direction" text NOT NULL,
        "volume" real NOT NULL,
        "entry_price" real,
        "stop_loss" real,
        "take_profit" real,
        "tradelocker_order_id" text,
        "status" text NOT NULL,
        "error_message" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_activity_log" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "position_id" integer,
        "action" text NOT NULL,
        "token_address" text,
        "token_symbol" text,
        "amount_sol" real,
        "amount_tokens" real,
        "price_sol" real,
        "profit_loss" real,
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_strategies" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "group_id" text NOT NULL,
        "symbol" text NOT NULL,
        "platform_type" text NOT NULL,
        "generated_code" text NOT NULL,
        "timeframes" jsonb NOT NULL,
        "entry_conditions" text,
        "exit_conditions" text,
        "risk_management" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "trading_strategies_group_id_unique" UNIQUE("group_id")
);
--> statement-breakpoint
CREATE TABLE "trading_wallets" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "sol_balance" real DEFAULT 0 NOT NULL,
        "locked_balance" real DEFAULT 0 NOT NULL,
        "total_deposited" real DEFAULT 0 NOT NULL,
        "total_withdrawn" real DEFAULT 0 NOT NULL,
        "total_profit_loss" real DEFAULT 0 NOT NULL,
        "is_auto_trade_enabled" boolean DEFAULT false NOT NULL,
        "max_positions" integer DEFAULT 3 NOT NULL,
        "trade_amount_sol" real DEFAULT 0.1 NOT NULL,
        "take_profit_percent" real DEFAULT 50 NOT NULL,
        "stop_loss_percent" real DEFAULT 20 NOT NULL,
        "min_signal_confidence" integer DEFAULT 70 NOT NULL,
        "is_auto_rebalance_enabled" boolean DEFAULT false NOT NULL,
        "rebalance_threshold_percent" real DEFAULT 10 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp,
        CONSTRAINT "trading_wallets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "achievement_id" integer NOT NULL,
        "unlocked_at" timestamp DEFAULT now(),
        "progress" integer DEFAULT 0 NOT NULL,
        "is_completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_api_keys" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "provider" text NOT NULL,
        "api_key" text NOT NULL,
        "label" text,
        "is_active" boolean DEFAULT true NOT NULL,
        "is_valid" boolean,
        "last_validated" timestamp,
        "last_used" timestamp,
        "usage_count" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "user_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "bio" text,
        "trading_experience" text,
        "trading_style" text,
        "preferred_markets" jsonb,
        "trade_grade" real DEFAULT 0,
        "win_rate" real DEFAULT 0,
        "followers" integer DEFAULT 0,
        "following" integer DEFAULT 0,
        "social_links" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_streaks" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "current_streak" integer DEFAULT 0 NOT NULL,
        "longest_streak" integer DEFAULT 0 NOT NULL,
        "last_activity_date" timestamp,
        "total_charts_analyzed" integer DEFAULT 0 NOT NULL,
        "total_eas_created" integer DEFAULT 0 NOT NULL,
        "total_trades" integer DEFAULT 0 NOT NULL,
        "tier" text DEFAULT 'YG' NOT NULL,
        "tier_progress" integer DEFAULT 0 NOT NULL,
        "xp_points" integer DEFAULT 0 NOT NULL,
        "weekly_charts_analyzed" integer DEFAULT 0 NOT NULL,
        "weekly_eas_created" integer DEFAULT 0 NOT NULL,
        "week_start_date" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "user_streaks_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
        "id" serial PRIMARY KEY NOT NULL,
        "username" text NOT NULL,
        "password" text NOT NULL,
        "email" text NOT NULL,
        "full_name" text,
        "profile_image" text,
        "avatar_url" text,
        "bio" text,
        "subscription_plan_id" integer,
        "stripe_customer_id" text,
        "stripe_subscription_id" text,
        "ls_customer_id" text,
        "ls_subscription_id" text,
        "subscription_status" text DEFAULT 'none',
        "subscription_current_period_end" timestamp,
        "monthly_analysis_count" integer DEFAULT 0,
        "monthly_social_share_count" integer DEFAULT 0,
        "last_count_reset" timestamp,
        "wallet_address" text,
        "vedd_token_balance" real DEFAULT 0,
        "is_ambassador" boolean DEFAULT false,
        "ambassador_nft_mint" text,
        "token_gated_subscription_end" timestamp,
        "last_wallet_sync" timestamp,
        "wallet_verified" boolean DEFAULT false,
        "is_admin" boolean DEFAULT false,
        "ai_cost_mode" text DEFAULT 'full',
        "membership_tier" text DEFAULT 'none',
        "membership_nft_mint" text,
        "has_vedd_nft" boolean DEFAULT false,
        "breakout_mode_enabled" boolean DEFAULT false,
        "trailing_stop_enabled" boolean DEFAULT true,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "users_username_unique" UNIQUE("username"),
        CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE "vedd_pool_wallets" (
        "id" serial PRIMARY KEY NOT NULL,
        "label" text NOT NULL,
        "public_key" text NOT NULL,
        "wallet_type" text DEFAULT 'rewards' NOT NULL,
        "status" text DEFAULT 'active' NOT NULL,
        "token_balance" real DEFAULT 0,
        "low_balance_threshold" real DEFAULT 1000,
        "last_sync_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "vedd_pool_wallets_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE TABLE "vedd_reward_config" (
        "id" serial PRIMARY KEY NOT NULL,
        "action_type" text NOT NULL,
        "base_amount" real NOT NULL,
        "streak_multiplier" real DEFAULT 1,
        "max_daily_rewards" integer DEFAULT 5,
        "requires_verification" boolean DEFAULT false,
        "is_active" boolean DEFAULT true,
        "description" text,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "vedd_reward_config_action_type_unique" UNIQUE("action_type")
);
--> statement-breakpoint
CREATE TABLE "vedd_transfer_jobs" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "source_wallet_id" integer NOT NULL,
        "destination_wallet" text NOT NULL,
        "amount" real NOT NULL,
        "action_type" text NOT NULL,
        "action_id" integer,
        "status" text DEFAULT 'pending' NOT NULL,
        "solana_transaction_sig" text,
        "error_message" text,
        "retry_count" integer DEFAULT 0,
        "idempotency_key" text,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "processed_at" timestamp,
        CONSTRAINT "vedd_transfer_jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "wear_to_earn_claims" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "claim_code" text NOT NULL,
        "product_name" text NOT NULL,
        "reward_amount" real DEFAULT 50 NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "image_url" text,
        "submitted_at" timestamp DEFAULT now() NOT NULL,
        "processed_at" timestamp,
        "processed_by" integer
);
--> statement-breakpoint
CREATE TABLE "webhook_configs" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "name" text NOT NULL,
        "url" text NOT NULL,
        "platform" text NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "trigger_on" jsonb NOT NULL,
        "signal_format" text DEFAULT 'json' NOT NULL,
        "custom_payload_template" text,
        "secret_key" text,
        "headers" jsonb,
        "last_triggered_at" timestamp,
        "last_status" text,
        "failure_count" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "webhook_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "trigger_type" text NOT NULL,
        "payload" jsonb NOT NULL,
        "response_status" integer,
        "response_body" text,
        "status" text NOT NULL,
        "error_message" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_strategies" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "profit_target" real NOT NULL,
        "account_balance" real NOT NULL,
        "pairs" text[] NOT NULL,
        "risk_level" text DEFAULT 'ai-controlled',
        "lot_size" text DEFAULT 'auto',
        "plan" jsonb NOT NULL,
        "pair_stats" jsonb,
        "generated_at" text NOT NULL,
        "week_start" text NOT NULL,
        "current_profit" real DEFAULT 0,
        "progress_trades" integer DEFAULT 0,
        "progress_win_rate" integer DEFAULT 0,
        "progress_percentage" integer DEFAULT 0,
        "is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "withdrawal_requests" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "amount" real NOT NULL,
        "destination_wallet" text NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "admin_id" integer,
        "admin_notes" text,
        "solana_transaction_sig" text,
        "error_message" text,
        "requested_at" timestamp DEFAULT now() NOT NULL,
        "processed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_trade_results" ADD CONSTRAINT "ai_trade_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_trade_results" ADD CONSTRAINT "ai_trade_results_analysis_id_chart_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."chart_analyses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_action_rewards" ADD CONSTRAINT "ambassador_action_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_action_rewards" ADD CONSTRAINT "ambassador_action_rewards_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_action_rewards" ADD CONSTRAINT "ambassador_action_rewards_transfer_job_id_vedd_transfer_jobs_id_fk" FOREIGN KEY ("transfer_job_id") REFERENCES "public"."vedd_transfer_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_certifications" ADD CONSTRAINT "ambassador_certifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_challenge_participants" ADD CONSTRAINT "ambassador_challenge_participants_challenge_id_ambassador_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."ambassador_challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_challenge_participants" ADD CONSTRAINT "ambassador_challenge_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_challenge_sessions" ADD CONSTRAINT "ambassador_challenge_sessions_challenge_id_ambassador_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."ambassador_challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_challenge_sessions" ADD CONSTRAINT "ambassador_challenge_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_community_comments" ADD CONSTRAINT "ambassador_community_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_content_progress" ADD CONSTRAINT "ambassador_content_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_content_stats" ADD CONSTRAINT "ambassador_content_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_event_registrations" ADD CONSTRAINT "ambassador_event_registrations_event_id_ambassador_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."ambassador_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_event_registrations" ADD CONSTRAINT "ambassador_event_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_event_schedules" ADD CONSTRAINT "ambassador_event_schedules_event_id_ambassador_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."ambassador_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_event_schedules" ADD CONSTRAINT "ambassador_event_schedules_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_events" ADD CONSTRAINT "ambassador_events_recording_uploaded_by_users_id_fk" FOREIGN KEY ("recording_uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_schedule_registrations" ADD CONSTRAINT "ambassador_schedule_registrations_schedule_id_ambassador_event_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."ambassador_event_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_schedule_registrations" ADD CONSTRAINT "ambassador_schedule_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassador_training_progress" ADD CONSTRAINT "ambassador_training_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_feedback" ADD CONSTRAINT "analysis_feedback_analysis_id_chart_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."chart_analyses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_feedback" ADD CONSTRAINT "analysis_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_views" ADD CONSTRAINT "analysis_views_analysis_id_chart_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."chart_analyses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_views" ADD CONSTRAINT "analysis_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_analyses" ADD CONSTRAINT "chart_analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_social_accounts" ADD CONSTRAINT "connected_social_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ea_share_assets" ADD CONSTRAINT "ea_share_assets_ea_id_saved_eas_id_fk" FOREIGN KEY ("ea_id") REFERENCES "public"."saved_eas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ea_share_assets" ADD CONSTRAINT "ea_share_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ea_subscriptions" ADD CONSTRAINT "ea_subscriptions_ea_id_saved_eas_id_fk" FOREIGN KEY ("ea_id") REFERENCES "public"."saved_eas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ea_subscriptions" ADD CONSTRAINT "ea_subscriptions_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ea_subscriptions" ADD CONSTRAINT "ea_subscriptions_subscriber_id_users_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_proposals" ADD CONSTRAINT "governance_proposals_proposer_user_id_users_id_fk" FOREIGN KEY ("proposer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_votes" ADD CONSTRAINT "governance_votes_proposal_id_governance_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."governance_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_votes" ADD CONSTRAINT "governance_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_wallets" ADD CONSTRAINT "internal_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_data_refresh_jobs" ADD CONSTRAINT "market_data_refresh_jobs_ea_id_saved_eas_id_fk" FOREIGN KEY ("ea_id") REFERENCES "public"."saved_eas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mt5_api_tokens" ADD CONSTRAINT "mt5_api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mt5_signal_logs" ADD CONSTRAINT "mt5_signal_logs_token_id_mt5_api_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."mt5_api_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mt5_signal_logs" ADD CONSTRAINT "mt5_signal_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_users_id_fk" FOREIGN KEY ("referred_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_eas" ADD CONSTRAINT "saved_eas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_analyses" ADD CONSTRAINT "scenario_analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_analyses" ADD CONSTRAINT "scenario_analyses_chart_analysis_id_chart_analyses_id_fk" FOREIGN KEY ("chart_analysis_id") REFERENCES "public"."chart_analyses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sol_engine_positions" ADD CONSTRAINT "sol_engine_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sol_engine_settings" ADD CONSTRAINT "sol_engine_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spread_strategies" ADD CONSTRAINT "spread_strategies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_token_payments" ADD CONSTRAINT "subscription_token_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_token_payments" ADD CONSTRAINT "subscription_token_payments_subscription_plan_id_subscription_plans_id_fk" FOREIGN KEY ("subscription_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_positions" ADD CONSTRAINT "token_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tradelocker_connections" ADD CONSTRAINT "tradelocker_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tradelocker_trade_logs" ADD CONSTRAINT "tradelocker_trade_logs_connection_id_tradelocker_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."tradelocker_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tradelocker_trade_logs" ADD CONSTRAINT "tradelocker_trade_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_activity_log" ADD CONSTRAINT "trading_activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_activity_log" ADD CONSTRAINT "trading_activity_log_position_id_token_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."token_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_strategies" ADD CONSTRAINT "trading_strategies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_wallets" ADD CONSTRAINT "trading_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_subscription_plan_id_subscription_plans_id_fk" FOREIGN KEY ("subscription_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vedd_transfer_jobs" ADD CONSTRAINT "vedd_transfer_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vedd_transfer_jobs" ADD CONSTRAINT "vedd_transfer_jobs_source_wallet_id_vedd_pool_wallets_id_fk" FOREIGN KEY ("source_wallet_id") REFERENCES "public"."vedd_pool_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wear_to_earn_claims" ADD CONSTRAINT "wear_to_earn_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_configs" ADD CONSTRAINT "webhook_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_webhook_id_webhook_configs_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhook_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_strategies" ADD CONSTRAINT "weekly_strategies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;