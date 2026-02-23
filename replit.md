# AI Powered Trading Vault

## Overview
AI Powered Trading Vault is a comprehensive AI-powered trading chart analysis platform. It leverages artificial intelligence and traditional technical analysis to provide traders with actionable insights, enabling them to upload trading charts from various platforms (MT4, MT5, TradingView) for AI-powered analysis, including pattern recognition, trend analysis, and trading recommendations. Key features include a secure vault-themed interface, Solana wallet integration for token-gated access, governance voting for VEDD token holders, advanced EA trading strategies, an EA marketplace for monetization, and social sharing capabilities. The platform aims to empower traders with intelligent tools and foster a community around shared strategies.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Frontend**: React 18 with TypeScript, Tailwind CSS, Vite.
- **Mobile Companion App**: Progressive Web App (PWA) with offline support, push notifications, and a mobile-first responsive design.
- **Social Share Card System**: Generates branded share cards for social media promotion, including AI-generated social media posts.
- **Gamification System**: Streak tracking with five-tier progression based on XP earned from chart analyses and EA creations.
- **What If Scenario Analysis**: AI-powered tool for exploring different trading outcomes with probability assessments, risk analysis, and recommendations.
- **Immersive Processing Experience**: Full-page interactive processing views with animated progress pipelines and step-by-step visualization.
- **Webhook Signal System**: Allows users to configure webhooks to receive trading signals automatically from various sources.
- **MT5 Trade Copier EA**: An Expert Advisor for MetaTrader 5 that relays trade signals to VEDD AI.
- **SL/TP/Trailing Confidence Scoring**: Server-side engine calculates confidence percentages for Stop Loss, Take Profit, and Trailing Stop levels based on multiple technical factors.
- **News & Economic Events Alerts**: Real-time news alerts panel with sentiment analysis and upcoming economic events.
- **Market Open Breakout Strategy**: Automated breakout detection at key session opens (London, New York, Tokyo).
- **HFT Strategy Modes**: Weekly strategy generation supports different high-frequency trading approaches (scalping, momentum surfing, session breakout, aggressive compound, sniper).
- **Solana Token Scanner**: AI-powered token scanner analyzing trending Solana tokens for buy/sell signals based on sentiment, tokenomics, and whale activity.

### Technical Implementations
- **Backend**: Node.js with Express, TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Passport.js with local strategy and Phantom wallet login for token-gated membership.
- **AI Integration**: OpenAI GPT-4o for chart analysis, with multi-provider AI key management allowing users to connect their own API keys.
- **VEDD SS AI Self-Learning Brain Engine**: Autonomous self-learning engine that analyzes historical trades to build per-pair knowledge for strategy generation and autonomous signal creation.
- **Autonomous Signal Generator**: AI generates proactive trade signals with entry zones, SL/TP, lot sizes, hold times, and confidence scores.
- **VEDD AI Live Trading Engine**: Autonomous background engine that monitors live markets, computes indicators, uses GPT-4o for analysis, and auto-executes trades via TradeLocker. Features weekly profit goal tracking with phase-based strategy (warming_up → building → accelerating → cruising → pushing → target_reached), auto-compounding on win streaks (1.25x-2x multiplier), loss protection (0.5x-0.75x reduction), HFT multi-strategy execution (scalping, momentum, session breakout, sniper, compound), strategy/session performance breakdown, and daily P&L tracking. API: `POST /api/vedd-live-engine/record-result` for recording trade results and updating goal progress.
- **Advanced Indicator Engine**: Server-side computation of 12+ advanced indicators from raw candle data, feeding into a weighted consensus voting system.
- **News-Aware AI Confirmation**: AI Second Opinion system fetches real-time news sentiment and economic events, integrating a 14-point institutional checklist for confirmation decisions.
- **MT5 Signal Receiver EA** (`public/downloads/VEDD_Signal_Receiver_EA.mq5`): MetaTrader 5 Expert Advisor that polls the VEDD AI Live Trading Engine for pending trade signals and auto-executes them on the user's MT5 account. Polls every 5 seconds (configurable), authenticates via MT5 API token, normalizes symbol names with broker suffix detection, supports configurable max lot size and slippage, confirms execution back to server. Runs alongside the Chart Data EA without conflicts. Magic number 202500. Signals expire after 5 minutes if not picked up. API endpoints: `GET /api/vedd-live-engine/mt5-signals` (EA poll), `POST /api/vedd-live-engine/mt5-signal-confirm` (execution confirmation), `GET /api/vedd-live-engine/mt5-signal-history` (signal history). Download available on VEDD SS AI page with setup instructions.

### System Design Choices
- **Architecture Pattern**: Full-stack monorepo with clear separation between client and server.
- **Data Flow**: Secure user authentication, image processing, AI analysis, results storage, gamification, and watermarked social sharing.

## External Dependencies

### Third-Party Services
- **OpenAI**: GPT-4o for AI-powered chart analysis.
- **Stripe**: Subscription billing and payment processing.
- **SendGrid**: Email notifications and marketing.
- **Twilio**: SMS trading alerts.
- **Neon Database**: Managed PostgreSQL hosting.
- **Twelve Data**: Market data provider for live AI refresh.
- **Finnhub**: Financial news provider for real-time market news and sentiment analysis.
- **DexScreener**: Real-time token data for Solana Token Scanner.

### Key Libraries
- **Drizzle ORM**: Type-safe database queries.
- **Radix UI**: Accessible component primitives.
- **React Query**: Server state management.
- **Framer Motion**: Animation library.
- **Canvas**: Server-side image processing.