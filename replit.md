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
- **Ambassador Training Program**: Complete training system for promoting the application through social media and live explainer videos, featuring modules on platform features, social media strategies, video creation, live demos, and compliance, with quizzes and certification upon completion.
- **Gamification System**: Streak tracking with five-tier progression (YG → Apprentice → Journeyman → Expert → OG) based on XP earned from chart analyses (10 XP) and EA creations (25 XP). Includes a StreakBanner component showing current streak/tier and StreakTrackerPage for detailed statistics.
- **What If Scenario Analysis**: AI-powered scenario analysis tool that allows traders to explore different trading outcomes. Supports multiple scenario types (price targets, stop loss comparison, news impact, timeframe analysis, market conditions, custom scenarios) and provides probability assessments, risk analysis, and recommendations using GPT-4o. Integrated with chart analysis for seamless data transfer.
- **Immersive Processing Experience**: Full-page interactive processing views for both single chart analysis and multi-timeframe EA synthesis, featuring animated progress pipelines, step-by-step visualization, and Daily Scripture devotional content displayed during AI analysis.
- **Webhook Signal System**: Trade copy relay system that allows users to configure webhooks to receive trading signals automatically. Supports TradeLocker, TradingView alerts, and custom webhook endpoints. Triggers on chart analysis completion, multi-timeframe EA synthesis, MT5 trade copier signals, or manual signals. Includes test functionality, delivery logs, and secret key verification for secure webhook calls.
- **MT5 Trade Copier EA**: MetaTrader 5 Expert Advisor that monitors trades and sends HTTP requests to VEDD AI when trades open. Users can download the EA, configure it with an API token, and have their MT5 trades automatically relayed to TradeLocker or other platforms via the webhook system. Includes API token management, signal logging, and setup instructions.

### Technical Implementations
- **Backend**: Node.js with Express, TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Passport.js with local strategy (session-based).
- **State Management**: React Query for server state, Context API for authentication.
- **Routing**: Wouter for client-side routing.
- **Styling**: Tailwind CSS with a custom design system.
- **Build Tools**: Vite for frontend, ESBuild for backend.
- **File Processing**: Multer for uploads, Canvas for server-side image processing.
- **AI Integration**: OpenAI GPT-4o for chart analysis.
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