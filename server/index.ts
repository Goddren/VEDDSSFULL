// NOTE: the app-wide outbound "Premature close" on AI POST calls was caused by
// Render auto-upgrading to Node v26 (broken built-in fetch for POST bodies). The
// fix is pinning Node 22 LTS (.node-version / engines), NOT a custom dispatcher —
// so no undici dependency is needed here.
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";
import { setupAuth } from "./auth";
import { seedAchievements, seedSubscriptionPlans, seedAdminUser, seedInvestmentPools, seedVeddRewardConfig } from "./seed";
import { seedBlogPosts } from "./blog-seed";
import { initializeMarketDataService } from "./market-data";
import { execSync } from "child_process";
import { db } from "./db";
import { sql } from "drizzle-orm";

// ── OpenRouter key normalization ─────────────────────────────────────────────
// All 13 code sites read process.env.OPENROUTER_API_KEY exactly. If the key was
// set on Render under a slightly different name (a very common cause of "I added
// it but AI still 429s on OpenAI"), copy the first matching alternate into the
// canonical name so every OpenRouter path finds it. Also trims accidental quotes
// or whitespace pasted around the value.
(() => {
  const ALIASES = [
    'OPENROUTER_API_KEY', 'OPENROUTER_KEY', 'OPEN_ROUTER_API_KEY', 'OPEN_ROUTER_KEY',
    'OPENROUTER_API', 'OPENROUTERAPIKEY', 'OR_API_KEY', 'OPENROUTER_TOKEN', 'OPENROUTER',
  ];
  const clean = (v?: string) => (v || '').trim().replace(/^["']|["']$/g, '');
  let found = clean(process.env.OPENROUTER_API_KEY);
  if (!found) {
    for (const name of ALIASES) {
      const v = clean(process.env[name]);
      if (v) { found = v; console.log(`[env] OPENROUTER_API_KEY not set — using alternate env var "${name}"`); break; }
    }
  }
  if (found) {
    process.env.OPENROUTER_API_KEY = found;
    console.log(`[env] OpenRouter key detected (len ${found.length}, starts "${found.slice(0, 8)}…")`);
  } else {
    console.warn('[env] No OpenRouter key found under any known env var name — AI will fall back to OpenAI/Groq.');
  }
})();

// Prevent DB connection errors from crashing the server
process.on('unhandledRejection', (reason: any) => {
  console.error('[process] Unhandled rejection (non-fatal):', reason?.message ?? reason);
});
process.on('uncaughtException', (err: any) => {
  console.error('[process] Uncaught exception (non-fatal):', err?.message ?? err);
});

const app = express();
// Increase the JSON payload limit to handle bulk chart uploads (multiple base64 images)
// rawBody is stored for Stripe/LS webhook signature verification (must run before route handlers)
app.use(express.json({ limit: '50mb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Tolerate MT5 EAs that doubled the API path — this happens when a user pastes
// the full endpoint URL into an EA's *base URL* field (the Combined EA appends
// "/api/mt5/chart-data" itself), producing ".../api/mt5/chart-data/api/mt5/
// chart-data" → 404. Collapse the duplicated segment so those posts still work
// without the user reconfiguring the EA.
app.use((req, _res, next) => {
  if (req.url.includes('/api/mt5/chart-data/api/mt5/chart-data')) {
    req.url = req.url.replace('/api/mt5/chart-data/api/mt5/chart-data', '/api/mt5/chart-data');
  }
  next();
});

// Health check endpoint — must respond before Vite compiles (Railway health check)
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

// ── Ambassador portal redirect ───────────────────────────────────────────────
// Sends logged-in ambassadors (isAmbassador=true) to the separate portal service.
// Non-authenticated users go to the portal login page.
app.get("/ambassador-portal", (req, res) => {
  const portalUrl = process.env.VEDD_PORTAL_URL;
  if (!portalUrl) return res.status(503).send('Ambassador portal not configured');
  res.redirect(portalUrl + '/ambassadors');
});

// ── Referral code cookie capture ─────────────────────────────────────────────
// When a visitor arrives via ?ref=<code>, store it in a 30-day cookie so it
// survives through registration and Lemon Squeezy checkout redirect.
// We parse req.cookies manually (no cookie-parser dependency needed).
app.use((req, _res, next) => {
  if (req.query.ref && typeof req.query.ref === 'string') {
    // Set the cookie via Set-Cookie header directly — no cookie-parser needed
    const maxAge = 30 * 24 * 60 * 60;
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const value = encodeURIComponent(req.query.ref);
    _res.setHeader('Set-Cookie', `vedd_ref=${value}; Max-Age=${maxAge}; SameSite=Lax; Path=/${secure}`);
  }
  next();
});

// ── Bind the port RIGHT NOW, before any async work ──────────────────────────
// Render kills the deploy if no port is open within 60 s. By listening here
// (before registerRoutes, before DB, before static setup) we guarantee the
// port is open within milliseconds of process start.
const PORT = parseInt(process.env.PORT || '5000', 10);
const httpServer = createServer(app);
httpServer.listen(PORT, "0.0.0.0", () => {
  log(`serving on port ${PORT}`);
});
// ────────────────────────────────────────────────────────────────────────────

// Set up authentication
setupAuth(app);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Serve EA templates for download
app.use('/ea-templates', express.static(path.join(process.cwd(), 'public/ea-templates')));

// Serve downloads folder (for MT5 EA files) with proper content type
app.use('/downloads', express.static(path.join(process.cwd(), 'public/downloads'), {
  setHeaders: (res, filePath) => {
    // Force download and set correct content type for MQ5 files
    if (filePath.endsWith('.mq5')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="' + path.basename(filePath) + '"');
    }
  }
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

/**
 * Retry a DB operation with exponential backoff.
 * Neon endpoints can take several seconds to wake from auto-suspension.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 6,
  baseDelayMs = 2000
): Promise<T | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isDisabled = err?.message?.includes('endpoint has been disabled');
      const isConnRefused = err?.code === 'ECONNREFUSED' || err?.code === 'ENETUNREACH' || err?.message?.includes('connect');
      const isRetryable = isDisabled || isConnRefused || err?.code === 'XX000';

      if (attempt === maxAttempts || !isRetryable) {
        console.error(`[startup] ${label} failed after ${attempt} attempt(s):`, err?.message ?? err);
        return null;
      }

      const delay = baseDelayMs * Math.pow(1.5, attempt - 1);
      console.warn(`[startup] ${label} attempt ${attempt} failed (${err?.message ?? err}). Retrying in ${Math.round(delay / 1000)}s…`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return null;
}

(async () => {
  const dbUrl = process.env.DATABASE_URL || '(not set)';
  const maskedDb = dbUrl.replace(/:\/\/[^@]+@/, '://***@');
  console.log(`[startup] NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`[startup] DATABASE_URL: ${maskedDb}`);
  console.log(`[startup] PORT=${process.env.PORT}`);
  console.log(`[startup] Registering routes...`);

  // Restore credential files from the durable DB mirror BEFORE routes/engines
  // read them (Render's disk is ephemeral and wipes data/*.json on each deploy).
  try {
    const { restoreDurableFiles } = await import("./services/cred-store");
    await restoreDurableFiles();
    console.log(`[startup] Durable credential files restored`);
  } catch (err: any) {
    console.error(`[startup] restoreDurableFiles error (non-fatal):`, err?.message ?? err);
  }

  // Ensure the durable Kalshi engine config table exists, then hydrate saved
  // coin-selection/strategy/risk settings BEFORE the run-state restore below
  // fires the engine back up — otherwise a running engine would restart with
  // symbols reset to BTC-only until the override cache caught up.
  try {
    const { ensureKalshiEngineConfigTable } = await import('./services/ensure-kalshi-engine-config-table');
    await ensureKalshiEngineConfigTable();
    const { hydratePersistedKalshiConfigs } = await import('./services/kalshi-engine');
    await hydratePersistedKalshiConfigs();
    const { ensureKalshiBrainTables } = await import('./services/ensure-kalshi-brain-tables');
    await ensureKalshiBrainTables();
    const { ensureTokenomicsMigration } = await import('./services/ensure-tokenomics-migration');
    await ensureTokenomicsMigration();
  } catch (err: any) {
    console.error(`[startup] ensureKalshiEngineConfigTable import error (non-fatal):`, err?.message ?? err);
  }

  // Restore Polymarket + Kalshi engine run-state for all users that had engines
  // running before the last Render redeploy (persisted to DB on start/stop).
  try {
    const { db } = await import('./db');
    const { engineRunState } = await import('../shared/schema');
    const { eq } = await import('drizzle-orm');
    const runningRows = await db.select().from(engineRunState).where(eq(engineRunState.isRunning, true));
    if (runningRows.length > 0) {
      const { restoreEngineStateFromDb } = await import('./services/polymarket-autonomous-engine');
      const { restoreKalshiEngineStateFromDb } = await import('./services/kalshi-engine');
      const { restorePmUsEngineStateFromDb } = await import('./services/polymarket-us-engine');
      for (const row of runningRows) {
        if (row.engine === 'polymarket')    await restoreEngineStateFromDb(row.userId);
        if (row.engine === 'kalshi')        await restoreKalshiEngineStateFromDb(row.userId);
        if (row.engine === 'polymarket-us') await restorePmUsEngineStateFromDb(row.userId);
      }
      console.log(`[startup] Restored ${runningRows.length} engine(s) from DB`);
    }
  } catch (err: any) {
    console.error(`[startup] Engine state restore error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Options AI Engine broker tables exist (idempotent, self-provisioning
  // on deploy so no interactive drizzle-kit push is required).
  try {
    const { ensureOptionsTables } = await import('./services/ensure-options-tables');
    await ensureOptionsTables();
  } catch (err: any) {
    console.error(`[startup] ensureOptionsTables import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure blog lead-gen tables exist (newsletter capture, etc.)
  try {
    const { ensureBlogTables } = await import('./services/ensure-blog-tables');
    await ensureBlogTables();
  } catch (err: any) {
    console.error(`[startup] ensureBlogTables import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Ambassador Prime (Daily Growth Engine) tables exist — these were
  // defined in schema.ts but never migrated, so the page always 500'd.
  try {
    const { ensureAmbassadorPrimeTables } = await import('./services/ensure-ambassador-prime-tables');
    await ensureAmbassadorPrimeTables();
  } catch (err: any) {
    console.error(`[startup] ensureAmbassadorPrimeTables import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Brain Data Marketplace tables exist
  try {
    const { ensureBrainMarketplaceTables } = await import('./services/ensure-brain-marketplace-tables');
    await ensureBrainMarketplaceTables();
  } catch (err: any) {
    console.error(`[startup] ensureBrainMarketplaceTables import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Options AI Engine brain feature store exists
  try {
    const { ensureOptionsBrainOutcomesTable } = await import('./services/ensure-options-brain-outcomes-table');
    await ensureOptionsBrainOutcomesTable();
  } catch (err: any) {
    console.error(`[startup] ensureOptionsBrainOutcomesTable import error (non-fatal):`, err?.message ?? err);
  }

  try {
    const { ensureOptionsIvHistoryTable } = await import('./services/ensure-options-iv-history-table');
    await ensureOptionsIvHistoryTable();
  } catch (err: any) {
    console.error(`[startup] ensureOptionsIvHistoryTable import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Persona Content Engine tables exist (Don Chism founder-brand, 3x/week)
  try {
    const { ensurePersonaContentTables } = await import('./services/ensure-persona-content-tables');
    await ensurePersonaContentTables();
  } catch (err: any) {
    console.error(`[startup] ensurePersonaContentTables import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure content-image columns exist (devotionals, ambassador daily/bonus/community content)
  try {
    const { ensureContentImageColumns } = await import('./services/ensure-content-image-columns');
    await ensureContentImageColumns();
  } catch (err: any) {
    console.error(`[startup] ensureContentImageColumns import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Options Engine order-flow strategy column exists
  try {
    const { ensureOrderFlowColumn } = await import('./services/ensure-order-flow-column');
    await ensureOrderFlowColumn();
  } catch (err: any) {
    console.error(`[startup] ensureOrderFlowColumn import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Options Engine FX-parity columns exist (trailing stops, Drawdown
  // Shield, Kelly, Brain Learning Mode, prop-firm presets, Copy Mode, etc.)
  try {
    const { ensureOptionsEngineParityColumns } = await import('./services/ensure-options-engine-parity-columns');
    await ensureOptionsEngineParityColumns();
  } catch (err: any) {
    console.error(`[startup] ensureOptionsEngineParityColumns import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Futures Engine's persisted config/activity/trades tables exist
  // (previously the scanner had zero DB persistence — config was ad-hoc from
  // the client, auto-executed trades were never logged anywhere).
  try {
    const { ensureFuturesEngineTables } = await import('./services/ensure-futures-engine-tables');
    await ensureFuturesEngineTables();
  } catch (err: any) {
    console.error(`[startup] ensureFuturesEngineTables import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Content Studio's durable media store exists (generated images/
  // videos otherwise vanish once the provider's temporary URL expires).
  try {
    const { ensureContentStudioTables } = await import('./services/ensure-content-studio-tables');
    await ensureContentStudioTables();
  } catch (err: any) {
    console.error(`[startup] ensureContentStudioTables import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Crypto.com Perpetuals Engine tables exist (previously "Auto-execute"
  // was a dead toggle with no scanner/strategy engine behind it).
  try {
    const { ensureCryptocomEngineTables } = await import('./services/ensure-cryptocom-engine-tables');
    await ensureCryptocomEngineTables();
  } catch (err: any) {
    console.error(`[startup] ensureCryptocomEngineTables import error (non-fatal):`, err?.message ?? err);
  }

  try {
    const { ensureCryptoBrainTable } = await import('./services/ensure-crypto-brain-table');
    await ensureCryptoBrainTable();
  } catch (err: any) {
    console.error(`[startup] ensureCryptoBrainTable import error (non-fatal):`, err?.message ?? err);
  }

  try {
    const { ensureCoinbaseTables } = await import('./services/ensure-coinbase-tables');
    await ensureCoinbaseTables();
  } catch (err: any) {
    console.error(`[startup] ensureCoinbaseTables import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure the durable Dual-Vote Consensus table exists (Options/Crypto.com
  // engine consensus panels — previously in-memory only, wiped on restart).
  try {
    const { ensureEngineConsensusTable } = await import('./services/ensure-engine-consensus-table');
    await ensureEngineConsensusTable();
  } catch (err: any) {
    console.error(`[startup] ensureEngineConsensusTable import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Micro Growth's doubling-milestone tracker table exists.
  try {
    const { ensureMicroGrowthMilestonesTable } = await import('./services/ensure-micro-growth-milestones-table');
    await ensureMicroGrowthMilestonesTable();
  } catch (err: any) {
    console.error(`[startup] ensureMicroGrowthMilestonesTable import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Micro Growth's session-history table exists.
  try {
    const { ensureMicroGrowthSessionsTable } = await import('./services/ensure-micro-growth-sessions-table');
    await ensureMicroGrowthSessionsTable();
  } catch (err: any) {
    console.error(`[startup] ensureMicroGrowthSessionsTable import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Workforce Academy's "where you left off" course-progress table exists.
  try {
    const { ensureWorkforceCourseProgressTable } = await import('./services/ensure-workforce-course-progress-table');
    await ensureWorkforceCourseProgressTable();
  } catch (err: any) {
    console.error(`[startup] ensureWorkforceCourseProgressTable import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Live Engine (FX SS AI Engine) durable config table exists, then
  // hydrate propFirmMode/consistency-rule defaults from it so they survive
  // this restart — never auto-resumes live trading itself.
  try {
    const { ensureLiveEngineConfigTable } = await import('./services/ensure-live-engine-config-table');
    await ensureLiveEngineConfigTable();
    const { hydratePersistedEngineConfigs } = await import('./services/live-trading-engine');
    await hydratePersistedEngineConfigs();
  } catch (err: any) {
    console.error(`[startup] Live Engine config hydration error (non-fatal):`, err?.message ?? err);
  }

  // Ensure copy trading execution columns exist (real-mode broker execution + paper-mode mirroring)
  try {
    const { ensureCopyTradingExecutionColumns } = await import('./services/ensure-copy-trading-execution-columns');
    await ensureCopyTradingExecutionColumns();
  } catch (err: any) {
    console.error(`[startup] ensureCopyTradingExecutionColumns import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Deep Reasoning Mode + prop firm phase tables exist
  try {
    const { ensureReasoningPropFirmTables } = await import('./services/ensure-reasoning-propfirm-tables');
    await ensureReasoningPropFirmTables();
  } catch (err: any) {
    console.error(`[startup] ensureReasoningPropFirmTables import error (non-fatal):`, err?.message ?? err);
  }

  // Ensure Ambassador Profit Split tables exist
  try {
    const { ensureProfitSplitTables } = await import('./services/ensure-profit-split-tables');
    await ensureProfitSplitTables();
  } catch (err: any) {
    console.error(`[startup] ensureProfitSplitTables import error (non-fatal):`, err?.message ?? err);
  }

  // Register routes and attach WebSocket to the already-listening server
  try {
    await registerRoutes(app, httpServer);
    console.log(`[startup] Routes registered OK`);
  } catch (err: any) {
    console.error(`[startup] registerRoutes error (non-fatal, server still running):`, err?.message ?? err);
    console.error(err?.stack);
  }

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    // Handle JSON parsing errors from MT5 EA with helpful message
    if (err instanceof SyntaxError && 'body' in err && req.path.includes('/mt5/')) {
      console.error('MT5 JSON Parse Error:', err.message);
      return res.status(400).json({
        error: "Invalid JSON format from EA",
        message: err.message,
        fix: "Download the latest EA (v3.65) from VEDD, recompile it in MetaEditor (F7), and restart MT5. Your EA may be sending invalid characters or numbers.",
        help: "Check MT5 View > Experts tab for errors. Make sure you have chart history loaded."
      });
    }

    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
  });

  // Setup static file serving / Vite dev middleware
  console.log(`[startup] env=${app.get("env")} — setting up static/vite...`);
  try {
    if (app.get("env") === "development") {
      await setupVite(app, httpServer);
    } else {
      serveStatic(app);
    }
    console.log(`[startup] Static/Vite setup OK`);
  } catch (err: any) {
    console.error(`[startup] FATAL: static/vite setup threw:`, err?.message ?? err);
    console.error(err?.stack);
    process.exit(1);
  }

  // Seed initial data after the server is already listening.
  // Retries with backoff to handle Neon endpoint wake-up delays.
  (async () => {
    try {
      console.log('[startup] Checking for missing DB columns...');
      const migrations = [
        `ALTER TABLE saved_eas ADD COLUMN IF NOT EXISTS refresh_volatility_threshold integer DEFAULT 30`,
        `ALTER TABLE saved_eas ADD COLUMN IF NOT EXISTS refresh_atr_threshold integer DEFAULT 20`,
        `ALTER TABLE saved_eas ADD COLUMN IF NOT EXISTS refresh_price_threshold integer DEFAULT 2`,
        `ALTER TABLE saved_eas ADD COLUMN IF NOT EXISTS volume real DEFAULT 0.01`,
        `ALTER TABLE saved_eas ADD COLUMN IF NOT EXISTS use_risk_percent boolean DEFAULT true`,
        `ALTER TABLE saved_eas ADD COLUMN IF NOT EXISTS risk_percent real DEFAULT 0.25`,
        `ALTER TABLE saved_eas ADD COLUMN IF NOT EXISTS max_open_trades integer DEFAULT 1`,
        `ALTER TABLE saved_eas ADD COLUMN IF NOT EXISTS daily_loss_limit real DEFAULT 0`,
        `ALTER TABLE saved_eas ADD COLUMN IF NOT EXISTS min_confidence integer DEFAULT 65`,
        `ALTER TABLE saved_eas ADD COLUMN IF NOT EXISTS trade_cooldown_minutes integer DEFAULT 5`,
        `ALTER TABLE saved_eas ADD COLUMN IF NOT EXISTS live_refresh_enabled boolean DEFAULT false`,
        // AI Vision Confirmation persistence — default TRUE so all users get 2nd-confirmation AI out of the box
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_vision_enabled boolean DEFAULT true`,
        // Multi-TradeLocker: drop the unique constraint so multiple accounts per user are allowed
        `ALTER TABLE tradelocker_connections DROP CONSTRAINT IF EXISTS tradelocker_connections_user_id_unique`,
        // Per-account lot multiplier — allows different lot sizes per TradeLocker account
        `ALTER TABLE tradelocker_connections ADD COLUMN IF NOT EXISTS lot_multiplier double precision NOT NULL DEFAULT 1.0`,
        // Gate mode — 'basic' (original EA permissive) or 'full' (strict live-engine gates)
        `ALTER TABLE tradelocker_connections ADD COLUMN IF NOT EXISTS gate_mode text NOT NULL DEFAULT 'basic'`,
        // Broker name — human-readable label derived from serverId (e.g. "Atlas", "FTUK")
        `ALTER TABLE tradelocker_connections ADD COLUMN IF NOT EXISTS broker_name text`,
        `ALTER TABLE tradelocker_connections ADD COLUMN IF NOT EXISTS use_risk_percent boolean NOT NULL DEFAULT false`,
        `ALTER TABLE tradelocker_connections ADD COLUMN IF NOT EXISTS risk_percent double precision NOT NULL DEFAULT 1.0`,
        // All-time record tracker for the dashboard
        `CREATE TABLE IF NOT EXISTS all_time_records (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES users(id),
          record_type text NOT NULL DEFAULT 'best_daily_pnl',
          value real NOT NULL DEFAULT 0,
          achieved_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(user_id, record_type)
        )`,
        // FX Paper Trading — simulated account + trade log for AI SS Engine
        `CREATE TABLE IF NOT EXISTS fx_paper_accounts (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES users(id) UNIQUE,
          balance real NOT NULL DEFAULT 10000,
          initial_balance real NOT NULL DEFAULT 10000,
          is_enabled boolean NOT NULL DEFAULT false,
          updated_at timestamptz NOT NULL DEFAULT now()
        )`,
        `CREATE TABLE IF NOT EXISTS fx_paper_trades (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES users(id),
          pair text NOT NULL,
          direction text NOT NULL,
          entry_price real NOT NULL,
          exit_price real,
          stop_loss real,
          take_profit real,
          lot_size real NOT NULL DEFAULT 0.01,
          pnl real,
          pnl_pips real,
          status text NOT NULL DEFAULT 'open',
          confidence real,
          source text DEFAULT 'fx_paper_engine',
          opened_at timestamptz NOT NULL DEFAULT now(),
          closed_at timestamptz
        )`,
        // Copy Trading — relationships and mirrored trade log
        `CREATE TABLE IF NOT EXISTS copy_relationships (
          id serial PRIMARY KEY,
          copier_id integer NOT NULL REFERENCES users(id),
          source_user_id integer NOT NULL REFERENCES users(id),
          account_type text NOT NULL DEFAULT 'paper',
          max_lot_size real NOT NULL DEFAULT 0.01,
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(copier_id, source_user_id)
        )`,
        `CREATE TABLE IF NOT EXISTS copy_trade_logs (
          id serial PRIMARY KEY,
          relationship_id integer NOT NULL REFERENCES copy_relationships(id),
          copier_id integer NOT NULL REFERENCES users(id),
          source_user_id integer NOT NULL REFERENCES users(id),
          original_trade_id integer,
          pair text NOT NULL,
          direction text NOT NULL,
          entry_price real NOT NULL,
          exit_price real,
          stop_loss real,
          take_profit real,
          lot_size real NOT NULL DEFAULT 0.01,
          pnl real,
          pnl_pips real,
          status text NOT NULL DEFAULT 'open',
          opened_at timestamptz NOT NULL DEFAULT now(),
          closed_at timestamptz
        )`,
        // AI Trading Models routing config — lets users pick model per strategy
        `CREATE TABLE IF NOT EXISTS ai_model_configs (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES users(id),
          routing_mode text NOT NULL DEFAULT 'single',
          primary_model_id text NOT NULL DEFAULT 'openai-gpt4o',
          ensemble_model_ids jsonb DEFAULT '[]',
          strategy_assignments jsonb DEFAULT '{}',
          fallback_order jsonb DEFAULT '[]',
          ensemble_min_agreement integer NOT NULL DEFAULT 60,
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )`,
      ];
      for (const m of migrations) {
        await db.execute(sql.raw(m));
      }
      console.log('[startup] Schema check complete.');
    } catch (err) {
      console.error('[startup] Schema migration check failed (non-fatal):', (err as Error).message);
    }

    // ── AI Model Configs table — own block so a failed earlier migration can't skip it ──
    try {
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS ai_model_configs (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES users(id),
          routing_mode text NOT NULL DEFAULT 'single',
          primary_model_id text NOT NULL DEFAULT 'openai-gpt4o',
          ensemble_model_ids jsonb DEFAULT '[]',
          strategy_assignments jsonb DEFAULT '{}',
          fallback_order jsonb DEFAULT '[]',
          ensemble_min_agreement integer NOT NULL DEFAULT 60,
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `));
      console.log('[startup] ai_model_configs table ready.');
    } catch (err) {
      console.error('[startup] ai_model_configs table creation failed (non-fatal):', (err as Error).message);
    }

    // ── Stop Orders table ──────────────────────────────────────────────────
    try {
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS stop_orders (
          id              SERIAL PRIMARY KEY,
          user_id         INTEGER NOT NULL REFERENCES users(id),
          symbol          TEXT    NOT NULL,
          direction       TEXT    NOT NULL,
          trigger_price   REAL    NOT NULL,
          lot_size        REAL    NOT NULL,
          stop_loss       REAL,
          take_profit     REAL,
          status          TEXT    NOT NULL DEFAULT 'PENDING',
          breakout_level  REAL,
          notes           TEXT,
          triggered_at    TIMESTAMP,
          cancelled_at    TIMESTAMP,
          created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `));
      await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS stop_orders_user_symbol_status ON stop_orders(user_id, symbol, status)`));
      console.log('[startup] stop_orders table ready.');
    } catch (err) {
      console.error('[startup] stop_orders table creation failed (non-fatal):', (err as Error).message);
    }

    try {
      console.log('[startup] Running full schema sync (db:push)...');
      execSync('npm run db:push -- --force', { stdio: 'pipe', timeout: 120000, env: { ...process.env } });
      console.log('[startup] Full schema sync complete.');
    } catch (err) {
      console.error('[startup] Full schema sync failed (non-fatal, critical columns already added above):', (err as Error).message?.slice(0, 200));
    }

    try {
      await db.execute(sql`UPDATE subscription_plans SET name = 'Yearly', interval = 'yearly', description = 'Annual subscription — all Premium features with yearly renewal. Best value for serious traders.', price = 100000 WHERE id = 4 AND (name = 'Lifetime' OR interval = 'lifetime')`);
      await db.execute(sql`UPDATE subscription_plans SET price = 100000 WHERE id = 4 AND price = 14900`);
      await db.execute(sql`UPDATE subscription_plans SET price = 5000 WHERE id = 2 AND price != 5000`);
      await db.execute(sql`UPDATE subscription_plans SET price = 15000 WHERE id = 3 AND price != 15000`);
    } catch (err) {
      console.error('[startup] Lifetime→Yearly migration (non-fatal):', (err as Error).message);
    }

    try {
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS breakout_mode_enabled boolean DEFAULT false`);
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS trailing_stop_enabled boolean DEFAULT true`);
    } catch (err) {
      console.error('[startup] AI settings columns migration (non-fatal):', (err as Error).message);
    }

    try {
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text UNIQUE`);
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by integer`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS referral_visits (
        id serial PRIMARY KEY,
        referral_code text NOT NULL,
        referrer_id integer REFERENCES users(id),
        visitor_id integer REFERENCES users(id),
        visitor_ip text,
        user_agent text,
        visited_at timestamp DEFAULT now() NOT NULL,
        signed_up boolean DEFAULT false,
        signed_up_at timestamp,
        subscribed boolean DEFAULT false,
        subscribed_at timestamp,
        reminder_sent boolean DEFAULT false,
        reminder_sent_at timestamp
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS dm_keywords (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) NOT NULL,
        keyword text NOT NULL,
        response_template text NOT NULL,
        platform text DEFAULT 'all',
        is_active boolean DEFAULT true,
        trigger_count integer DEFAULT 0,
        last_triggered_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )`);
      console.log('[startup] Referral & DM keyword tables created/verified.');
    } catch (err) {
      console.error('[startup] Referral/DM tables migration (non-fatal):', (err as Error).message);
    }

    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS investment_pools (
        id serial PRIMARY KEY,
        name text NOT NULL,
        slug text NOT NULL UNIQUE,
        pool_type text NOT NULL,
        description text NOT NULL,
        apy_rate real NOT NULL,
        lock_period_days integer NOT NULL DEFAULT 0,
        min_investment real NOT NULL DEFAULT 100,
        max_investment real,
        risk_level text NOT NULL DEFAULT 'low',
        total_pool_size real NOT NULL DEFAULT 0,
        total_invested real NOT NULL DEFAULT 0,
        total_yield_paid real NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        is_paused boolean NOT NULL DEFAULT false,
        created_by integer REFERENCES users(id),
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS token_investments (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) NOT NULL,
        pool_id integer REFERENCES investment_pools(id) NOT NULL,
        amount_invested real NOT NULL,
        current_value real NOT NULL,
        yield_earned real NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'active',
        start_date timestamp DEFAULT now() NOT NULL,
        maturity_date timestamp,
        last_yield_calculated_at timestamp DEFAULT now() NOT NULL,
        withdrawn_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )`);
      console.log('[startup] Investment pool tables created/verified.');
    } catch (err) {
      console.error('[startup] Investment pool tables migration (non-fatal):', (err as Error).message);
    }

    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS grants (
        id serial PRIMARY KEY,
        title text NOT NULL,
        description text NOT NULL,
        grant_type text NOT NULL,
        funder text NOT NULL,
        funding_amount text,
        deadline timestamp,
        eligibility_criteria jsonb,
        target_audience text DEFAULT 'both',
        geographic_scope text DEFAULT 'US',
        application_url text,
        ai_scan_notes text,
        relevance_score integer DEFAULT 0,
        is_active boolean DEFAULT true,
        is_verified boolean DEFAULT false,
        is_featured boolean DEFAULT false,
        source text DEFAULT 'ai_scan',
        last_scanned_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS grant_applications (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id),
        grant_id integer REFERENCES grants(id),
        status text DEFAULT 'draft',
        proposal_mode text NOT NULL DEFAULT 'auto',
        proposal_content text,
        proposal_sections jsonb,
        proposal_version integer DEFAULT 1,
        submitted_at timestamp,
        awarded_at timestamp,
        awarded_amount text,
        rejection_reason text,
        application_notes text,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS grant_scan_sessions (
        id serial PRIMARY KEY,
        triggered_by integer REFERENCES users(id),
        scan_type text NOT NULL,
        grant_types_scanned jsonb,
        grants_found integer DEFAULT 0,
        grants_created integer DEFAULT 0,
        status text DEFAULT 'pending',
        error_message text,
        started_at timestamp DEFAULT now() NOT NULL,
        completed_at timestamp
      )`);
      console.log('[startup] Grants tables created/verified.');
    } catch (err) {
      console.error('[startup] Grants tables migration (non-fatal):', (err as Error).message);
    }

    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS landing_page_quizzes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        title TEXT NOT NULL DEFAULT 'My VEDD Landing Page',
        slug TEXT UNIQUE NOT NULL,
        headline TEXT DEFAULT 'Are You Ready for Financial Freedom?',
        subheadline TEXT DEFAULT 'Answer 5 quick questions to get your FREE trading assessment',
        questions JSONB NOT NULL DEFAULT '[]',
        cta_text TEXT DEFAULT 'Get My Free Trading Assessment',
        thank_you_message TEXT DEFAULT 'Thanks! Your ambassador will reach out within 24 hours.',
        brand_color TEXT DEFAULT '#ef4444',
        is_active BOOLEAN DEFAULT true,
        lead_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS quiz_leads (
        id SERIAL PRIMARY KEY,
        quiz_id INTEGER REFERENCES landing_page_quizzes(id),
        ambassador_id INTEGER REFERENCES users(id) NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT,
        email TEXT,
        phone TEXT,
        answers JSONB,
        lead_score INTEGER DEFAULT 0,
        lead_quality TEXT DEFAULT 'cold',
        status TEXT DEFAULT 'new',
        source TEXT DEFAULT 'landing_page',
        platform TEXT,
        profile_url TEXT,
        bio_snippet TEXT,
        ai_insights TEXT,
        notes TEXT,
        converted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS social_lead_scans (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        platform TEXT NOT NULL,
        keywords TEXT NOT NULL,
        search_urls JSONB,
        outreach_kit TEXT,
        leads_added INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      console.log('[startup] Ambassador lead generation tables created/verified.');
    } catch (err) {
      console.error('[startup] Ambassador lead generation tables migration (non-fatal):', (err as Error).message);
    }

    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS leads (
        id VARCHAR(500) PRIMARY KEY,
        date VARCHAR(20) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        username VARCHAR(255) NOT NULL,
        profile_url TEXT,
        post_content TEXT,
        post_url TEXT,
        intent_score INTEGER DEFAULT 0,
        account_quality INTEGER DEFAULT 0,
        contact_opportunity TEXT,
        status VARCHAR(50) DEFAULT 'New',
        subreddit VARCHAR(100),
        follower_count INTEGER DEFAULT 0,
        headline TEXT,
        engagement_stats TEXT,
        suggested_reply TEXT,
        auto_engaged BOOLEAN DEFAULT FALSE,
        engagement_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS lead_hunter_runs (
        id SERIAL PRIMARY KEY,
        date VARCHAR(20) NOT NULL,
        status VARCHAR(50) DEFAULT 'running',
        total_scraped INTEGER DEFAULT 0,
        new_leads INTEGER DEFAULT 0,
        high_intent INTEGER DEFAULT 0,
        auto_engaged_count INTEGER DEFAULT 0,
        platform_breakdown TEXT,
        error_log TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )`);
      console.log('[startup] Lead Hunter tables created/verified.');
    } catch (err) {
      console.error('[startup] Lead Hunter tables migration (non-fatal):', (err as Error).message);
    }

    // Add VEDD copy-trading columns to copy_relationships (idempotent)
    try {
      await db.execute(sql`ALTER TABLE copy_relationships ADD COLUMN IF NOT EXISTS profit_share_pct real NOT NULL DEFAULT 20`);
      await db.execute(sql`ALTER TABLE copy_relationships ADD COLUMN IF NOT EXISTS vedd_fee_paid real NOT NULL DEFAULT 0`);
      await db.execute(sql`ALTER TABLE copy_trade_logs ADD COLUMN IF NOT EXISTS profit_share_vedd real`);
      console.log('[startup] Copy trading VEDD columns verified.');
    } catch (err) {
    }

    // Prop-firm linkage columns (idempotent) — ties TradeLocker accounts + trades
    // to prop-firm accounts for Trade Performance.
    try {
      await db.execute(sql`ALTER TABLE tradelocker_connections ADD COLUMN IF NOT EXISTS is_prop_firm_account boolean NOT NULL DEFAULT false`);
      await db.execute(sql`ALTER TABLE tradelocker_connections ADD COLUMN IF NOT EXISTS prop_firm_name text`);
      await db.execute(sql`ALTER TABLE tradelocker_connections ADD COLUMN IF NOT EXISTS prop_firm_account_size double precision`);
      await db.execute(sql`ALTER TABLE tradelocker_connections ADD COLUMN IF NOT EXISTS weekly_profit_target double precision`);
      await db.execute(sql`ALTER TABLE ai_trade_results ADD COLUMN IF NOT EXISTS connection_id integer`);
      // Last-known balance snapshot so the UI shows real figures across restarts / while re-authing
      await db.execute(sql`ALTER TABLE tradelocker_connections ADD COLUMN IF NOT EXISTS last_balance double precision`);
      await db.execute(sql`ALTER TABLE tradelocker_connections ADD COLUMN IF NOT EXISTS last_equity double precision`);
      await db.execute(sql`ALTER TABLE tradelocker_connections ADD COLUMN IF NOT EXISTS last_balance_at timestamp`);
      console.log('[startup] Prop-firm linkage + balance-snapshot columns verified.');
    } catch (err) {
      console.error('[startup] Prop-firm linkage migration (non-fatal):', (err as Error).message);
    }

    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS blog_posts (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        excerpt TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Trading Strategy',
        tags JSONB DEFAULT '[]',
        cover_image TEXT,
        author_id INTEGER REFERENCES users(id),
        author_name TEXT DEFAULT 'VEDD Team',
        is_published BOOLEAN DEFAULT false,
        is_featured BOOLEAN DEFAULT false,
        ai_generated BOOLEAN DEFAULT false,
        current_events_context TEXT,
        read_time TEXT DEFAULT '5 min read',
        view_count INTEGER DEFAULT 0,
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      // Patch older deployments — IF NOT EXISTS on CREATE won't add columns that
      // were introduced later, and a missing column 500s every /api/blog select.
      for (const col of [
        `tags JSONB DEFAULT '[]'`, `cover_image TEXT`, `author_id INTEGER`, `author_name TEXT DEFAULT 'VEDD Team'`,
        `is_published BOOLEAN DEFAULT false`, `is_featured BOOLEAN DEFAULT false`, `ai_generated BOOLEAN DEFAULT false`,
        `current_events_context TEXT`, `read_time TEXT DEFAULT '5 min read'`, `view_count INTEGER DEFAULT 0`,
        `published_at TIMESTAMP`, `updated_at TIMESTAMP DEFAULT NOW()`,
      ]) {
        await db.execute(sql.raw(`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS ${col}`)).catch(() => {});
      }
      console.log('[startup] blog_posts table created/verified.');
    } catch (err) {
      console.error('[startup] blog_posts table migration (non-fatal):', (err as Error).message);
    }

    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS ambassador_journey (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL UNIQUE,
        current_day INTEGER DEFAULT 1 NOT NULL,
        started_at TIMESTAMP DEFAULT NOW() NOT NULL,
        last_active_at TIMESTAMP DEFAULT NOW() NOT NULL,
        tokens_earned INTEGER DEFAULT 0 NOT NULL,
        referrals_count INTEGER DEFAULT 0 NOT NULL,
        subscribed_referrals INTEGER DEFAULT 0 NOT NULL,
        posts_completed INTEGER DEFAULT 0 NOT NULL,
        dms_completed INTEGER DEFAULT 0 NOT NULL,
        comments_completed INTEGER DEFAULT 0 NOT NULL,
        streak_days INTEGER DEFAULT 0 NOT NULL,
        longest_streak INTEGER DEFAULT 0 NOT NULL,
        subscription_earned BOOLEAN DEFAULT false NOT NULL,
        months_earned INTEGER DEFAULT 0 NOT NULL,
        completed_days JSONB DEFAULT '[]' NOT NULL,
        saved_content JSONB DEFAULT '[]' NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS ambassador_daily_actions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        day INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        platform TEXT NOT NULL,
        completed BOOLEAN DEFAULT false NOT NULL,
        completed_at TIMESTAMP,
        notes TEXT,
        tokens_awarded INTEGER DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      console.log('[startup] Ambassador journey tables created/verified.');
    } catch (err) {
      console.error('[startup] Ambassador journey tables migration (non-fatal):', (err as Error).message);
    }

    // ── VEDD Token Tables ─────────────────────────────────────────────────────
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS vedd_pool_wallets (
        id SERIAL PRIMARY KEY,
        label TEXT NOT NULL,
        public_key TEXT NOT NULL UNIQUE,
        wallet_type TEXT NOT NULL DEFAULT 'rewards',
        status TEXT NOT NULL DEFAULT 'active',
        token_balance REAL DEFAULT 0,
        low_balance_threshold REAL DEFAULT 1000,
        last_sync_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS vedd_reward_config (
        id SERIAL PRIMARY KEY,
        action_type TEXT NOT NULL UNIQUE,
        base_amount REAL NOT NULL DEFAULT 0,
        streak_multiplier REAL DEFAULT 1.0,
        max_daily_rewards INTEGER DEFAULT 5,
        requires_verification BOOLEAN DEFAULT false,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS ambassador_action_rewards (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        action_type TEXT NOT NULL,
        action_id INTEGER,
        base_reward REAL NOT NULL,
        bonus_reward REAL DEFAULT 0,
        total_reward REAL NOT NULL,
        verification_status TEXT DEFAULT 'pending',
        verified_by INTEGER REFERENCES users(id),
        verified_at TIMESTAMP,
        transfer_job_id INTEGER,
        notes TEXT,
        security_flag TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS vedd_transfer_jobs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        source_wallet_id INTEGER REFERENCES vedd_pool_wallets(id) NOT NULL,
        destination_wallet TEXT NOT NULL,
        amount REAL NOT NULL,
        action_type TEXT NOT NULL,
        action_id INTEGER,
        status TEXT DEFAULT 'pending',
        solana_transaction_sig TEXT,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        idempotency_key TEXT UNIQUE,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        processed_at TIMESTAMP
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS vedd_wallet_blacklist (
        id SERIAL PRIMARY KEY,
        wallet_address TEXT NOT NULL UNIQUE,
        reason TEXT NOT NULL,
        added_by INTEGER REFERENCES users(id),
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      console.log('[startup] VEDD token tables created/verified.');
    } catch (err) {
      console.error('[startup] VEDD token tables migration (non-fatal):', (err as Error).message);
    }

    // ─── Devotional tables ───────────────────────────────────────────────────
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS devotionals (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        theme TEXT NOT NULL,
        scripture TEXT NOT NULL,
        scripture_text TEXT NOT NULL,
        reflection TEXT NOT NULL,
        prayer_points JSONB DEFAULT '[]',
        affirmation TEXT NOT NULL,
        trading_tie_in TEXT,
        minimum_minutes INTEGER DEFAULT 5,
        ai_generated BOOLEAN DEFAULT true,
        is_published BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS devotional_groups (
        id SERIAL PRIMARY KEY,
        devotional_id INTEGER REFERENCES devotionals(id),
        created_by INTEGER REFERENCES users(id),
        invite_code TEXT NOT NULL UNIQUE,
        city TEXT,
        is_active BOOLEAN DEFAULT true,
        participant_count INTEGER DEFAULT 1,
        completed_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS devotional_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        devotional_id INTEGER REFERENCES devotionals(id) NOT NULL,
        group_id INTEGER REFERENCES devotional_groups(id),
        started_at TIMESTAMP DEFAULT NOW() NOT NULL,
        completed_at TIMESTAMP,
        duration_seconds INTEGER,
        is_completed BOOLEAN DEFAULT false,
        is_group_session BOOLEAN DEFAULT false,
        reward_earned BOOLEAN DEFAULT false,
        reward_amount INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )`);
      // Upsert all reward configs — safe to run on every startup (ON CONFLICT DO NOTHING)
      await db.execute(sql`INSERT INTO vedd_reward_config (action_type, base_amount, streak_multiplier, max_daily_rewards, requires_verification, is_active, description)
        VALUES
          ('devotional_solo',        73,  1.1, 1, false, true, 'Completed daily devotional solo (5+ minutes)'),
          ('devotional_group',       148, 1.2, 1, false, true, 'Completed daily devotional in a group session (2× reward)'),
          ('blog_share',             20,  1.0, 1, false, true, 'Shared a blog article with affiliate link'),
          ('strategy_review',        15,  1.0, 1, false, true, 'Reviewed weekly trading strategy'),
          ('analysis_view',          10,  1.0, 1, false, true, 'Viewed AI chart analysis'),
          ('live_monitor_check',      5,  1.0, 1, false, true, 'Checked live trading monitor'),
          ('grant_apply',            25,  1.0, 1, false, true, 'Started or submitted a grant application'),
          ('training_module',        50,  1.0, 3, false, true, 'Completed an ambassador training module'),
          ('devotional_streak_bonus',200, 1.0, 1, false, true, '5-day devotional streak bonus (weekly)')
        ON CONFLICT (action_type) DO UPDATE SET base_amount = EXCLUDED.base_amount
          WHERE vedd_reward_config.action_type IN ('devotional_solo','devotional_group')`);
      console.log('[startup] Devotional & daily-mission reward configs created/verified.');
    } catch (err) {
      console.error('[startup] Devotional tables migration (non-fatal):', (err as Error).message);
    }

    // ── SOL Engine tables ─────────────────────────────────────────────────────
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS sol_engine_settings (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) NOT NULL UNIQUE,
        active_strategy text DEFAULT 'momentum_surfer',
        active_strategies jsonb DEFAULT '[]',
        signal_weights jsonb DEFAULT '{}',
        kelly_stats jsonb DEFAULT '{}',
        weekly_goal jsonb DEFAULT '{}',
        session_high_watermark real DEFAULT 0,
        current_portfolio_value real DEFAULT 0,
        shield_active boolean DEFAULT false,
        auto_trade_enabled boolean DEFAULT false,
        live_trade_enabled boolean DEFAULT false,
        auto_trade_tp real DEFAULT 8,
        auto_trade_sl real DEFAULT 4,
        server_wallet_key text,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS sol_engine_positions (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) NOT NULL,
        token_address text NOT NULL,
        token_symbol text NOT NULL,
        dex text NOT NULL,
        mode text NOT NULL DEFAULT 'paper',
        entry_price real NOT NULL,
        entry_sol real NOT NULL,
        take_profit_pct real DEFAULT 8,
        stop_loss_pct real DEFAULT 4,
        status text NOT NULL DEFAULT 'open',
        close_pnl_pct real,
        opened_at timestamp DEFAULT now() NOT NULL,
        closed_at timestamp
      )`);
      console.log('[startup] SOL Engine tables created/verified.');
    } catch (err) {
      console.error('[startup] SOL Engine tables migration (non-fatal):', (err as Error).message);
    }

    // ── Account Growth Plan tables ────────────────────────────────────────────
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS account_growth_plans (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) NOT NULL UNIQUE,
        starting_balance real NOT NULL DEFAULT 0,
        current_balance real NOT NULL DEFAULT 0,
        goal_balance real NOT NULL DEFAULT 0,
        risk_profile text NOT NULL DEFAULT 'conservative',
        trading_style text NOT NULL DEFAULT 'day',
        current_phase integer NOT NULL DEFAULT 1,
        phase_unlocked_at jsonb DEFAULT '{}',
        milestones_hit jsonb DEFAULT '[]',
        weekly_target_pct real DEFAULT 3,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS growth_plan_trades (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) NOT NULL,
        plan_id integer REFERENCES account_growth_plans(id),
        symbol text NOT NULL,
        direction text NOT NULL DEFAULT 'long',
        entry_price real,
        exit_price real,
        stop_loss real,
        lot_size real,
        pnl_usd real,
        pnl_pct real,
        risk_usd real,
        phase_at_entry integer DEFAULT 1,
        notes text,
        opened_at timestamp DEFAULT now() NOT NULL,
        closed_at timestamp,
        status text DEFAULT 'open'
      )`);
      console.log('[startup] Account Growth Plan tables created/verified.');
    } catch (err) {
      console.error('[startup] Account Growth Plan tables migration (non-fatal):', (err as Error).message);
    }

    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS nfc_activations (
        id serial PRIMARY KEY,
        chip_uid text NOT NULL UNIQUE,
        user_id integer REFERENCES users(id) NOT NULL,
        garment_name text NOT NULL DEFAULT 'VEDD Garment',
        activated_at timestamp DEFAULT now() NOT NULL,
        total_taps integer NOT NULL DEFAULT 0,
        total_earned real NOT NULL DEFAULT 0,
        last_tap_at timestamp,
        current_streak integer NOT NULL DEFAULT 0,
        best_streak integer NOT NULL DEFAULT 0
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS nfc_daily_taps (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) NOT NULL,
        chip_uid text NOT NULL,
        reward_amount real NOT NULL DEFAULT 15,
        tapped_at timestamp DEFAULT now() NOT NULL,
        day_string text NOT NULL
      )`);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS nfc_daily_taps_dedup ON nfc_daily_taps(user_id, chip_uid, day_string)`);
      // Extended garment metadata columns (clothing ecosystem v2)
      await db.execute(sql`ALTER TABLE nfc_activations ADD COLUMN IF NOT EXISTS icon text DEFAULT '👕'`);
      await db.execute(sql`ALTER TABLE nfc_activations ADD COLUMN IF NOT EXISTS drop_name text DEFAULT 'Genesis Drop'`);
      await db.execute(sql`ALTER TABLE nfc_activations ADD COLUMN IF NOT EXISTS size_info text DEFAULT 'One Size'`);
      await db.execute(sql`ALTER TABLE nfc_activations ADD COLUMN IF NOT EXISTS garment_code text`);
      await db.execute(sql`ALTER TABLE nfc_activations ADD COLUMN IF NOT EXISTS referral_earn integer DEFAULT 0`);
      console.log('[startup] NFC Garment tables created/verified.');
    } catch (err) {
      console.error('[startup] NFC Garment tables migration (non-fatal):', (err as Error).message);
    }

    // ── VEDD Clothing Ecosystem v2 tables ────────────────────────────────────
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS vedd_earn_events (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) NOT NULL,
        type text NOT NULL,
        amount integer NOT NULL DEFAULT 0,
        label text,
        location text,
        garment_id integer,
        lat real,
        lon real,
        distance_miles real,
        created_at timestamp DEFAULT now() NOT NULL
      )`);
      // Add GPS columns to existing table if upgrading
      await db.execute(sql`ALTER TABLE vedd_earn_events ADD COLUMN IF NOT EXISTS lat real`);
      await db.execute(sql`ALTER TABLE vedd_earn_events ADD COLUMN IF NOT EXISTS lon real`);
      await db.execute(sql`ALTER TABLE vedd_earn_events ADD COLUMN IF NOT EXISTS distance_miles real`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS vedd_earn_events_user ON vedd_earn_events(user_id, created_at DESC)`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS vedd_popup_sequence (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) NOT NULL,
        sequence_index integer NOT NULL,
        shown_at timestamp DEFAULT now() NOT NULL,
        CONSTRAINT vedd_popup_unique UNIQUE(user_id, sequence_index)
      )`);
      // Home-location columns on users table (for distance-based rewards)
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS home_lat real`);
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS home_lon real`);
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS home_set_at timestamp`);
      console.log('[startup] VEDD Clothing Ecosystem v2 tables ready.');
    } catch (err) {
      console.error('[startup] VEDD Clothing Ecosystem v2 tables (non-fatal):', (err as Error).message);
    }

    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS daily_checkins (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) NOT NULL,
        day_string text NOT NULL,
        reward_amount real NOT NULL DEFAULT 10,
        streak_day integer NOT NULL DEFAULT 1,
        checked_in_at timestamp DEFAULT now() NOT NULL,
        UNIQUE(user_id, day_string)
      )`);
      console.log('[startup] Daily check-in table created/verified.');
    } catch (err) {
      console.error('[startup] Daily check-in table migration (non-fatal):', (err as Error).message);
    }

    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS daily_task_completions (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) NOT NULL,
        day_string text NOT NULL,
        task_key text NOT NULL,
        completed_at timestamp DEFAULT now() NOT NULL,
        UNIQUE(user_id, day_string, task_key)
      )`);
      console.log('[startup] Daily task completions table created/verified.');
    } catch (err) {
      console.error('[startup] Daily task completions table migration (non-fatal):', (err as Error).message);
    }

    try {
      // workforce_certificates/workforce_modules are defined in shared/schema.ts
      // but the automatic db:push schema-sync above doesn't reliably create
      // brand-new tables with FK references in every environment — create
      // them explicitly so the ALTER TABLE columns below have something to
      // attach to (this was silently failing: "relation does not exist").
      await db.execute(sql`CREATE TABLE IF NOT EXISTS workforce_modules (
        id serial PRIMARY KEY,
        title text NOT NULL,
        description text NOT NULL,
        category text NOT NULL,
        difficulty text DEFAULT 'beginner',
        estimated_minutes integer DEFAULT 30,
        content jsonb,
        assessment_questions jsonb,
        passing_score integer DEFAULT 70,
        target_audience text DEFAULT 'all',
        grant_tags jsonb,
        is_published boolean DEFAULT true,
        sort_order integer DEFAULT 0,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS workforce_certificates (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        module_id integer REFERENCES workforce_modules(id),
        certificate_type text DEFAULT 'module',
        certificate_id text NOT NULL UNIQUE,
        title text NOT NULL,
        recipient_name text,
        score integer,
        issued_at timestamp DEFAULT now() NOT NULL
      )`);
      console.log('[startup] workforce_modules/workforce_certificates tables created/verified.');
    } catch (err) {
      console.error('[startup] workforce_modules/workforce_certificates table creation (non-fatal):', (err as Error).message);
    }

    try {
      // The /api/workforce/certificates routes wrote to a flat data/certificates.json
      // file — Render's disk is ephemeral, so every certificate a user earned was
      // silently wiped on the next deploy. These columns let the routes persist to
      // the real workforce_certificates Postgres table instead.
      await db.execute(sql`ALTER TABLE workforce_certificates ADD COLUMN IF NOT EXISTS course_id integer`);
      await db.execute(sql`ALTER TABLE workforce_certificates ADD COLUMN IF NOT EXISTS ceu_hours double precision`);
      await db.execute(sql`ALTER TABLE workforce_certificates ADD COLUMN IF NOT EXISTS grant_frameworks jsonb`);
      await db.execute(sql`ALTER TABLE workforce_certificates ADD COLUMN IF NOT EXISTS onet_code text`);
      await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS city text`);
      await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS prop_firm_referral_link text`);
      await db.execute(sql`ALTER TABLE brain_data_listings ADD COLUMN IF NOT EXISTS symbol_filter jsonb`);
      await db.execute(sql`ALTER TABLE brain_data_listings ADD COLUMN IF NOT EXISTS includes_manual_trades boolean DEFAULT false NOT NULL`);
      console.log('[startup] Workforce certificate durability columns + profile city/prop-firm-link + brain listing symbol_filter/includes_manual_trades columns verified.');
    } catch (err) {
      console.error('[startup] Workforce certificate/city columns migration (non-fatal):', (err as Error).message);
    }

    try {
      // AI Second Opinion / Strategy Action Feed durability — previously kept
      // only in an in-memory Map (server/openai.ts), wiped on every restart.
      await db.execute(sql`CREATE TABLE IF NOT EXISTS ai_confirmation_logs (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        entry jsonb NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL
      )`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_confirmation_logs_user ON ai_confirmation_logs(user_id, id DESC)`);
      console.log('[startup] ai_confirmation_logs table verified.');
    } catch (err) {
      console.error('[startup] ai_confirmation_logs table migration (non-fatal):', (err as Error).message);
    }

    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS engine_run_state (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        engine text NOT NULL,
        is_running boolean NOT NULL DEFAULT false,
        is_paper_mode boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(user_id, engine)
      )`);
      console.log('[startup] engine_run_state table ready.');
    } catch (err) {
      console.error('[startup] engine_run_state table (non-fatal):', (err as Error).message);
    }

    await withRetry(() => seedSubscriptionPlans(), 'seedSubscriptionPlans');
    await withRetry(() => seedAchievements(), 'seedAchievements');

    // Ensure "Grant Champion" achievement exists (idempotent — skips if already present)
    try {
      const existing = await db.execute(sql`SELECT id FROM achievements WHERE name = 'Grant Champion' LIMIT 1`);
      if (((existing as any).rows ?? existing as any[]).length === 0) {
        await db.execute(sql`
          INSERT INTO achievements (name, description, category, icon, points, threshold, is_secret)
          VALUES ('Grant Champion', 'Successfully secure your first grant award for VEDD', 'special', 'trophy', 100, 1, false)
        `);
        console.log('[startup] Grant Champion achievement seeded.');
      }
    } catch (_) {}

    await withRetry(() => seedAdminUser(), 'seedAdminUser');
    await withRetry(() => seedInvestmentPools(), 'seedInvestmentPools');
    await withRetry(() => seedBlogPosts(), 'seedBlogPosts');
    await withRetry(() => seedVeddRewardConfig(), 'seedVeddRewardConfig');

    // Initialize market data service for Live AI Refresh
    initializeMarketDataService();

    // Start independent breakout monitor (M15 polling during session windows)
    const { startBreakoutMonitor } = await import('./services/breakout-monitor');
    startBreakoutMonitor();

    // Start daily lead hunter (runs at 08:00 UTC)
    const { startLeadHunterScheduler } = await import('./services/lead-hunter');
    startLeadHunterScheduler();

    // Start Ambassador Prime daily content engine (runs at 09:00 UTC)
    const { startAmbassadorPrimeScheduler } = await import('./services/ambassador-prime');
    startAmbassadorPrimeScheduler();

    // Start Persona Content Engine — Don Chism founder-brand, 3x/week (Mon/Wed/Fri 10:00 UTC)
    const { startPersonaContentScheduler } = await import('./services/persona-content-engine');
    startPersonaContentScheduler();

    // Start auto blog post generation (runs Wed + Fri at 13:00 UTC)
    const { startBlogPostScheduler } = await import('./services/blog-scheduler');
    startBlogPostScheduler();

    const { startTierCreditScheduler } = await import('./services/tier-credit-scheduler');
    startTierCreditScheduler();

    // Start live TradeLocker balance sync (keeps balances fresh like MT5)
    const { startTradeLockerSync } = await import('./services/tradelocker-sync');
    startTradeLockerSync();

    // Start Paper Trade AI Journal resolver (auto-closes pending paper trades against live price)
    const { startPaperTradeResolverLoop } = await import('./services/paper-trade-resolver-loop');
    startPaperTradeResolverLoop();

    // Start prop-firm consistency audit loop (live-monitors each funded
    // account's FTMO-style consistency ratio from the durable ledger)
    const { startPropFirmConsistencyAuditLoop } = await import('./services/prop-firm-consistency-audit-loop');
    startPropFirmConsistencyAuditLoop();

    // Start Options AI Engine scan loop (produces the live decision feed)
    const { startOptionsEngineScanner } = await import('./services/options-scanner');
    startOptionsEngineScanner();

    // Resume any futures scanners that were running before this restart —
    // previously futures_engine_configs.isActive rows were never re-read at
    // boot, so a running futures scanner silently died on every deploy with
    // no auto-recovery until the user noticed and clicked Start again.
    const { startFuturesEngineScanner } = await import('./services/futures-scanner');
    startFuturesEngineScanner();

    // Start Crypto.com Perpetuals AI Engine scan loop
    const { startCryptocomEngineScanner } = await import('./services/cryptocom-scanner');
    startCryptocomEngineScanner();
  })().catch(err => {
    console.error('[startup] Background initialization error:', err);
  });
})();
