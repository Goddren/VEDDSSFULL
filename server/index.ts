import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";
import { setupAuth } from "./auth";
import { seedAchievements, seedSubscriptionPlans } from "./seed";
import { initializeMarketDataService } from "./market-data";

const app = express();
// Increase the JSON payload limit to handle larger images (10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

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

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });

  // Seed initial data after the server is already listening.
  // Retries with backoff to handle Neon endpoint wake-up delays.
  (async () => {
    await withRetry(() => seedSubscriptionPlans(), 'seedSubscriptionPlans');
    await withRetry(() => seedAchievements(), 'seedAchievements');

    // Initialize market data service for Live AI Refresh
    initializeMarketDataService();

    // Start independent breakout monitor (M15 polling during session windows)
    const { startBreakoutMonitor } = await import('./services/breakout-monitor');
    startBreakoutMonitor();
  })().catch(err => {
    console.error('[startup] Background initialization error:', err);
  });
})();
