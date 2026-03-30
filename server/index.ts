import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";
import { setupAuth } from "./auth";
import { seedAchievements, seedSubscriptionPlans, seedAdminUser } from "./seed";
import { initializeMarketDataService } from "./market-data";
import { execSync } from "child_process";
import { db } from "./db";
import { sql } from "drizzle-orm";

const app = express();
// Increase the JSON payload limit to handle bulk chart uploads (multiple base64 images)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Health check endpoint — must respond before Vite compiles (Railway health check)
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

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
      const isConnRefused = err?.code === 'ECONNREFUSED' || err?.message?.includes('connect');
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
  console.log(`[startup] DATABASE_URL: ${maskedDb}`);

  // Start the HTTP server immediately so the process doesn't crash-loop
  // while waiting for the Neon endpoint to wake up.
  const server = await registerRoutes(app);

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
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use Railway's dynamic PORT env var, fallback to 5000 for local dev
  const port = parseInt(process.env.PORT || '5000', 10);
  console.log(`[railway-debug] PORT env=${process.env.PORT} parsed=${port}`);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });

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
      ];
      for (const m of migrations) {
        await db.execute(sql.raw(m));
      }
      console.log('[startup] Schema check complete.');
    } catch (err) {
      console.error('[startup] Schema migration check failed (non-fatal):', (err as Error).message);
    }

    try {
      console.log('[startup] Running full schema sync (db:push)...');
      execSync('npm run db:push -- --force', { stdio: 'pipe', timeout: 45000, env: { ...process.env } });
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

    await withRetry(() => seedSubscriptionPlans(), 'seedSubscriptionPlans');
    await withRetry(() => seedAchievements(), 'seedAchievements');
    await withRetry(() => seedAdminUser(), 'seedAdminUser');

    // Initialize market data service for Live AI Refresh
    initializeMarketDataService();

    // Start independent breakout monitor (M15 polling during session windows)
    const { startBreakoutMonitor } = await import('./services/breakout-monitor');
    startBreakoutMonitor();
  })().catch(err => {
    console.error('[startup] Background initialization error:', err);
  });
})();
