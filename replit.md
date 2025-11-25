# VEDD AI - Trading Chart Analysis Platform

## Overview

VEDD AI is a comprehensive trading chart analysis platform that combines artificial intelligence with traditional technical analysis to provide traders with actionable insights. The platform allows users to upload trading charts from popular platforms (MT4, MT5, TradingView) and receive AI-powered analysis including pattern recognition, trend analysis, and trading recommendations.

## System Architecture

### Technology Stack
- **Frontend**: React 18 with TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js with Express, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Passport.js with local strategy
- **AI Integration**: OpenAI GPT-4o for chart analysis
- **Payment Processing**: Stripe for subscription management
- **Email Service**: SendGrid for notifications
- **SMS Service**: Twilio for trading alerts
- **Cloud Storage**: Neon Database for PostgreSQL hosting

### Architecture Pattern
Full-stack monorepo with clear separation between client and server, sharing common types and schemas through a shared directory.

## Key Components

### Frontend Architecture
- **Component Library**: Custom UI components built on Radix UI primitives
- **State Management**: React Query for server state, Context API for authentication
- **Routing**: Wouter for lightweight client-side routing
- **Styling**: Tailwind CSS with custom design system
- **Build Tool**: Vite for fast development and optimized builds

### Backend Architecture
- **API Layer**: RESTful API with Express.js
- **Authentication**: Session-based authentication with Passport.js
- **Database Layer**: Drizzle ORM with PostgreSQL
- **File Processing**: Multer for file uploads, Canvas for image processing
- **AI Integration**: OpenAI API for chart analysis and insights

### Database Schema
- **Users**: Authentication, profiles, subscription management
- **Chart Analyses**: AI analysis results, patterns, indicators
- **Achievements**: Gamification system with user progress tracking
- **Subscriptions**: Stripe integration for payment processing
- **Social Features**: Analysis sharing, community interaction

## Data Flow

1. **User Authentication**: Session-based login with password hashing
2. **Chart Upload**: Image compression and processing on frontend
3. **AI Analysis**: OpenAI Vision API processes chart images
4. **Result Storage**: Analysis results stored in PostgreSQL
5. **Achievement Tracking**: Gamification system tracks user progress
6. **Social Sharing**: Watermarked images for public sharing

## External Dependencies

### Third-Party Services
- **OpenAI**: GPT-4o for AI-powered chart analysis
- **Stripe**: Subscription billing and payment processing
- **SendGrid**: Email notifications and marketing
- **Twilio**: SMS trading alerts
- **Neon Database**: Managed PostgreSQL hosting

### Key Libraries
- **Drizzle ORM**: Type-safe database queries
- **Radix UI**: Accessible component primitives
- **React Query**: Server state management
- **Framer Motion**: Animation library
- **Canvas**: Server-side image processing

## Deployment Strategy

### Development
- **Local Development**: Vite dev server with hot module replacement
- **Database**: Local PostgreSQL or Neon Database connection
- **Environment**: Environment variables for API keys and secrets

### Production
- **Build Process**: Vite build for frontend, ESBuild for backend
- **Database**: Neon Database with connection pooling
- **File Storage**: Local storage with static file serving
- **Session Storage**: Memory-based sessions (suitable for single-instance deployment)

### Configuration
- Database URL required for PostgreSQL connection
- OpenAI API key for chart analysis functionality
- Stripe keys for subscription processing
- SendGrid API key for email notifications
- Twilio credentials for SMS functionality

## Mobile Companion App Features

### Progressive Web App (PWA)
- **Service Worker**: Offline caching with stale-while-revalidate strategy
- **Installable**: Add to home screen on iOS and Android
- **Push Notifications**: Real-time alerts for price movements and pattern detection
- **Offline Support**: Cached analysis results accessible without internet

### Price Alerts System
- **Alert Types**: Price above/below, pattern detected, trend change
- **Real-time Monitoring**: Track active, triggered, and historical alerts
- **Custom Notifications**: Set target prices with personalized messages
- **Mobile Dashboard**: Touch-friendly UI with tabs and quick stats

### Mobile-Optimized Features
- **Chart Viewer**: Pinch-zoom and swipe gestures for chart analysis
- **Floating Action Button**: Quick access to camera and upload
- **Network Status**: Visual indicator when offline with auto-sync
- **Responsive Design**: Bottom navigation and mobile-first layout

## EA Trading Strategy Features

### Hybrid AI + Technical Indicator Approach
The generated MT5/TradingView EAs now use a sophisticated hybrid trading system that combines:

**AI Pattern Analysis** (Baked-In):
- Specific patterns detected from uploaded charts (Head & Shoulders, Double Top, etc.)
- Direction recommendations (BUY/SELL/NEUTRAL) with confidence levels
- Support/Resistance levels from AI analysis
- Entry/exit points calculated by AI

**Technical Indicator Confirmation** (Real-Time):
- MACD crossover detection and trend analysis
- RSI overbought/oversold conditions
- Volume confirmation filters
- ATR-based stop loss and take profit levels

**Hybrid Logic**:
- When AI recommends a direction → Lighter technical confirmation required
- When AI is neutral → Stricter technical signals needed
- Reduces false signals while maintains responsiveness
- Adapts to both AI insights and live market conditions

### Live AI Refresh Feature (In Development)
A future feature that will enable daily AI analysis refresh:

**Planned Capabilities**:
- Daily API calls to refresh AI analysis with current market data
- Automatic detection of changed market conditions
- Safety pause mechanism when AI changes direction
- Cost: ~$1-3 per month per EA

**Current Status**: DISABLED pending security implementation
- Requires proper authentication and API token management
- Rate limiting and cost protection needed
- Available for early access by contacting support

**Security Measures Needed**:
- Unique API tokens per EA stored in database
- User authentication for API endpoints
- Rate limiting (1-hour minimum between refreshes)
- Cost tracking per user
- Subscription-tier gating

## Changelog

- July 06, 2025. Initial setup
- July 06, 2025. Fixed canvas module deployment error by installing required system dependencies (pkg-config, cairo, pango, libpng, libjpeg, giflib, librsvg, pixman, python3, libuuid)
- November 21, 2025. Implemented mobile companion app with PWA infrastructure, price alerts system, offline support, and mobile-optimized UI components
- November 21, 2025. Implemented hybrid AI + technical indicator trading strategy for MT5 EAs combining pattern analysis with real-time technical confirmation
- November 21, 2025. Developed live AI refresh feature prototype (disabled pending security audit) with backend API endpoint, WebRequest integration, and safety mechanisms
- November 25, 2025. Made code generation UI mobile-friendly with dropdown selector instead of 3 buttons
- November 25, 2025. Added API endpoint explanation for new users (step-by-step process + endpoint documentation)
- November 25, 2025. Implemented AI-powered chart recommendation system to suggest best chart for EA entry based on signal strength, confidence, and technical indicators
- November 25, 2025. Fixed trading day filter default - changed from Mon-Fri only to ALL DAYS ENABLED (Mon-Sun) to prevent accidental trade blocking
- November 25, 2025. Fixed 28 MQL5 compilation errors by:
  1. Removed all emoji characters from generated EA code (⏸️, ✅, ❌, ⚠️, ↑, ↓, 📈, 📉, 🔄, 📊, etc.) - MQL5 doesn't support Unicode emojis
  2. Added explicit numeric values to enum (MODE_SINGLE = 0, MODE_PYRAMIDING = 1, MODE_GRID = 2, MODE_HEDGING = 3) for switch statement compilation
  3. Replaced all emoji references with ASCII text (e.g., "PAUSED" instead of "PAUSED ⏸️")
- November 25, 2025. Fixed EA generation workflow to wait for all charts to complete analysis:
  1. Updated canGenerateCode check to verify NO charts are still uploading (isAnyUploading flag)
  2. Added user-friendly status message "Analyzing in progress... Please wait for all charts to complete before generating EA"
  3. EA code generation now only enables after all selected charts finish analyzing

## User Preferences

Preferred communication style: Simple, everyday language.
