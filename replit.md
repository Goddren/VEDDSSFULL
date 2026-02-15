# AI Powered Trading Vault

## Overview
AI Powered Trading Vault is a comprehensive AI-powered trading chart analysis platform that leverages artificial intelligence and traditional technical analysis to provide traders with actionable insights. It enables users to upload trading charts from various platforms (MT4, MT5, TradingView) for AI-powered analysis, including pattern recognition, trend analysis, and trading recommendations. The platform features a secure vault-themed interface, Solana wallet integration for token-gated access, governance voting for VEDD token holders, advanced EA trading strategies, an EA marketplace for monetization, and social sharing capabilities. The vault aims to empower traders with intelligent tools and foster a community around shared strategies.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Frontend**: React 18 with TypeScript, Tailwind CSS, Vite.
- **Component Library**: Custom UI components built on Radix UI primitives.
- **Mobile Companion App**: Progressive Web App (PWA) with offline support, push notifications, and a mobile-first responsive design. Features include a touch-friendly chart viewer, quick access actions, and network status indicators.
- **Social Share Card System**: Generates branded share cards with AI Trading Vault branding, EA details, multi-timeframe analysis, and daily devotional scriptures for social media promotion.
- **User Guide**: Comprehensive documentation page covering all platform features with searchable sections, step-by-step guides, tips, and FAQs.
- **Ambassador Training Program**: Complete training system for promoting the application through social media and live explainer videos, featuring modules on platform features, social media strategies, video creation, live demos, compliance, and community building, with quizzes and certification upon completion. Includes a dedicated "Building Your VEDD Community" module covering tribe building, event hosting, member spotlights, accountability partners, and member retention.
- **44-Day Content Journey**: Week 6 focuses on "Community Building & Growth" with lessons on building VEDD tribes, hosting community events, member spotlights, trading buddies, and welcoming new members. Aligns with the "Online University-style community experience" branding.
- **Gamification System**: Streak tracking with five-tier progression (YG → Apprentice → Journeyman → Expert → OG) based on XP earned from chart analyses (10 XP) and EA creations (25 XP). Includes a StreakBanner component showing current streak/tier and StreakTrackerPage for detailed statistics.
- **What If Scenario Analysis**: AI-powered scenario analysis tool that allows traders to explore different trading outcomes. Supports multiple scenario types (price targets, stop loss comparison, news impact, timeframe analysis, market conditions, custom scenarios) and provides probability assessments, risk analysis, and recommendations using GPT-4o. Integrated with chart analysis for seamless data transfer.
- **Immersive Processing Experience**: Full-page interactive processing views for both single chart analysis and multi-timeframe EA synthesis, featuring animated progress pipelines, step-by-step visualization, and Daily Scripture devotional content displayed during AI analysis.
- **Webhook Signal System**: Trade copy relay system that allows users to configure webhooks to receive trading signals automatically. Supports TradeLocker, TradingView alerts, and custom webhook endpoints. Triggers on chart analysis completion, multi-timeframe EA synthesis, MT5 trade copier signals, or manual signals. Includes test functionality, delivery logs, and secret key verification for secure webhook calls.
- **MT5 Trade Copier EA**: MetaTrader 5 Expert Advisor that monitors trades and sends HTTP requests to VEDD AI when trades open. Users can download the EA, configure it with an API token, and have their MT5 trades automatically relayed to TradeLocker or other platforms via the webhook system. Includes API token management, signal logging, and setup instructions.
- **SL/TP/Trailing Confidence Scoring**: Server-side scoring engine that calculates separate confidence percentages for Stop Loss, Take Profit, and Trailing Stop levels based on ATR distance, Bollinger Band support, volume strength, RSI alignment, multi-timeframe confluence, moving average proximity, MACD momentum, R:R quality, and trend strength. Trailing confidence also outputs a mode recommendation (TIGHT/STANDARD/WIDE/AGGRESSIVE) with suggested ATR multiplier. EA v3.94 dynamically adjusts trail distance based on confidence scores.
- **Advanced Indicator Engine** (`server/indicators.ts`): Server-side computation of 12+ advanced indicators from raw candle data: ADX (trend strength with +DI/-DI), Stochastic Oscillator (14,3,3), VWAP, OBV with divergence detection, Classic Pivot Points (R1-R3/S1-S3), Fibonacci retracement/extension levels, Support/Resistance via swing point clustering, candlestick pattern recognition (Doji, Hammer, Shooting Star, Engulfing, Morning/Evening Star, Spinning Top, Strong candles), swing high/low detection, market session context (Asian/London/NY/overlaps), volatility percentile (ATR vs 30-period average), and volume profile. All indicators feed into a weighted consensus voting system and are passed to the AI confirmation prompt for maximum trade accuracy. Trade plans use S/R-enhanced SL/TP placement. Open positions context and recent trade history are included for AI awareness.
- **News-Aware AI Confirmation**: The AI Second Opinion system now fetches real-time news sentiment and upcoming economic events for the trading pair before making its confirmation decision. The AI prompt includes a 14-point institutional checklist covering news sentiment alignment (point 13) and upcoming high-impact events (point 14), with critical warnings about imminent data releases. News conflict alerts are automatically added when sentiment contradicts the proposed trade direction.
- **News & Economic Events Alerts** (`client/src/components/mt5/news-alerts.tsx`): Real-time news alerts panel on the MT5 Chart Data page showing pair-specific news sentiment (bullish/bearish/neutral with score), recent headlines, upcoming economic events with impact ratings, and imminent event warnings. Browser push notifications fire 1 hour before high-impact events. Polls `/api/news/alerts/:symbol` every 2 minutes for live updates.
- **Market Open Breakout Strategy**: Automated breakout detection at London (7:00 UTC), New York (13:00 UTC), and Tokyo (0:00 UTC) session opens. Pre-session lookback periods: London 7 hours (midnight-7AM), New York 6 hours (7AM-1PM), Tokyo 3 hours (9PM-midnight). Calculates the prior session's price range (high/low), then detects if current price breaks above or below that range by 10%+ within the first 30 minutes of the new session. Breakout signals receive weighted votes (STRONG=3, MODERATE=2, WEAK=1 + volume confirmation bonus of +1) in the consensus system. Volume confirmation requires current volume > 1.2x 10-candle average. AI confirmation prompt includes a 15-point institutional checklist with point 15 dedicated to market open breakout analysis. Flat MT5 response fields: `mt5BreakoutWindow`, `mt5BreakoutDetected`, `mt5BreakoutDirection`, `mt5BreakoutStrength`, `mt5BreakoutSignal`, `mt5BreakoutVolumeConfirmed`, `mt5BreakoutRangeHigh`, `mt5BreakoutRangeLow`. Live Breakout Status section on MT5 Chart Data page polls `/api/mt5/breakout-status` every 15s showing current window, next session countdown, and per-pair detection results. Per-pair breakout toggle via `/api/mt5/breakout-settings` (GET/POST) allows enabling/disabling breakout detection per connected pair independently. Ambassador Training includes "Market Open Breakout Strategy" lesson (features-11) with quiz. User Guide documents the strategy under MT5 section.
- **Solana Token Scanner**: AI-powered token scanner that analyzes trending Solana tokens for buy/sell signals. Uses DexScreener API for real-time token data and calculates scores for sentiment (price momentum, buy/sell ratio), tokenomics (liquidity, volume, FDV ratio), and whale activity (transaction sizes, unique traders). Generates signals from STRONG_BUY to STRONG_SELL with confidence percentages, hold duration recommendations, risk levels, entry/target/stop-loss prices, and AI-generated reasoning. Includes token search functionality.

### Technical Implementations
- **Backend**: Node.js with Express, TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Passport.js with local strategy (session-based), plus Phantom wallet login with token-gated membership tiers (Basic: 100+ VEDD tokens, Pro: 500+ tokens, Elite: VEDD NFT holder).
- **State Management**: React Query for server state, Context API for authentication.
- **Routing**: Wouter for client-side routing.
- **Styling**: Tailwind CSS with a custom design system.
- **Build Tools**: Vite for frontend, ESBuild for backend.
- **File Processing**: Multer for uploads, Canvas for server-side image processing.
- **AI Integration**: OpenAI GPT-4o for chart analysis. Multi-provider AI key management allows users to connect their own API keys (OpenAI, Anthropic, Google, Groq, Mistral - up to 5 providers) with encrypted storage and automatic routing through user keys when available, falling back to platform credits.
- **AI API Key Management**: User-configurable AI providers at `/ai-api-keys` with AES-256-CBC encrypted storage, per-provider validation, usage tracking, and active/inactive toggling.
- **EA Trading Strategy**: Hybrid AI + Technical Indicator approach, combining AI pattern analysis (baked-in) with real-time technical indicator confirmation (MACD, RSI, Volume, ATR).
- **EA Marketplace**: Allows users to save, manage, publish, and subscribe to Expert Advisors, enabling passive income for creators.
- **Market Data Service**: Fetches real-time market data (Forex, stocks, crypto, indices) to enable a "Live AI Refresh" feature, detecting pattern changes for EA re-analysis.
- **Financial News Integration**: Finnhub API provides real-time financial news, with OpenAI GPT-4o analyzing sentiment to generate trading signals (BUY/SELL/NEUTRAL) based on news flow. Includes defensive fallbacks when APIs are unavailable.

### System Design Choices
- **Architecture Pattern**: Full-stack monorepo with clear separation between client and server, sharing common types and schemas.
- **Data Flow**: Secure user authentication, image compression and processing, AI analysis via OpenAI Vision API, results stored in PostgreSQL, gamification tracking, and watermarked social sharing.
- **Deployment Strategy**: Vite dev server for local development, Vite/ESBuild for production builds, Neon Database for PostgreSQL hosting, local storage for static files, memory-based sessions.

## External Dependencies

### Third-Party Services
- **OpenAI**: GPT-4o for AI-powered chart analysis.
- **Stripe**: Subscription billing and payment processing.
- **SendGrid**: Email notifications and marketing.
- **Twilio**: SMS trading alerts.
- **Neon Database**: Managed PostgreSQL hosting.
- **Twelve Data**: Market data provider for live AI refresh (Forex, stocks, crypto, indices).
- **Finnhub**: Financial news provider for real-time market news and company-specific news with sentiment analysis.

### Key Libraries
- **Drizzle ORM**: Type-safe database queries.
- **Radix UI**: Accessible component primitives.
- **React Query**: Server state management.
- **Framer Motion**: Animation library.
- **Canvas**: Server-side image processing.