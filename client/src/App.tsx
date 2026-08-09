import { useEffect, Component, type ReactNode } from "react";
import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import { SolanaWalletProvider } from "@/hooks/use-solana-wallet";
import { SolTradingProvider } from "@/hooks/use-sol-trading-state";
import NotFound from "@/pages/not-found";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import AccountDetailPage from "@/pages/account-detail";
import AllTimePerformancePage from "@/pages/all-time-performance";
import Analysis from "@/pages/analysis";
import MultiTimeframeAnalysis from "@/pages/multi-timeframe-analysis";
import Historical from "@/pages/historical";
import AuthPage from "@/pages/auth-page";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import ProfilePage from "@/pages/profile";
import LandingPage from "@/pages/landing";
import SubscriptionPage from "@/pages/subscription";
import AchievementsPage from "@/pages/achievements";
import AboutPage from "@/pages/about";
import ContactPage from "@/pages/contact";
import SupportPage from "@/pages/support";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import SecurityPage from "@/pages/security";
import AnalysisDetail from "@/pages/analysis-detail";
import SharedAnalysisPage from "@/pages/shared-analysis";
import EASharePage from "@/pages/ea-share";
import VolatilityMeterShowcase from "@/pages/volatility-meter-showcase";
import MarketInsightsPage from "@/pages/market-insights";
import MarketTrendGamePage from "@/pages/market-trend-game";
import MarketMoodPage from "@/pages/market-mood";
import MarketSentimentPage from "@/pages/market-sentiment";
import Community from "@/pages/community";
import InteractiveTooltipShowcase from "@/pages/interactive-tooltip-showcase";
import BlogPage from "@/pages/blog";
import DevotionalPage from "@/pages/devotional";
import StrategyWizard from "@/pages/strategy-wizard";
import MobileAlerts from "@/pages/mobile-alerts";
import MyEAsPage from "@/pages/my-eas";
import MySubscriptionsPage from "@/pages/my-subscriptions";
import EAMarketplacePage from "@/pages/ea-marketplace";
import BrainDataMarketplacePage from "@/pages/brain-data-marketplace";
import SocialHub from "@/pages/social-hub";
import UserGuidePage from "@/pages/user-guide";
import AmbassadorTrainingPage from "@/pages/ambassador-training";
import AmbassadorLocalOutreachPage from "@/pages/ambassador-local-outreach";
import AmbassadorPropFirmEventPage from "@/pages/ambassador-propfirm-event";
import CertificationsPage from "@/pages/certifications";
import WorkforceAcademyPage from "@/pages/workforce-academy";
import AmbassadorSalesScriptPage from "@/pages/ambassador-sales-script";
import TrainingCalendar from "@/pages/training-calendar";
import TrainingDay from "@/pages/training-day";
import ContentFlowCalendar from "@/pages/content-flow-calendar";
import ContentFlowDay from "@/pages/content-flow-day";
import ChallengeSession from "@/pages/challenge-session";
import PublicEventPage from "@/pages/public-event";
import StreakTrackerPage from "@/pages/streak-tracker";
import WhatIfAnalysisPage from "@/pages/what-if-analysis";
import AdminVeddPool from "@/pages/admin-vedd-pool";
import AdminHub from "@/pages/admin-hub";
import WebhooksPage from "@/pages/webhooks";
import MT5ChartDataPage from "@/pages/mt5-chart-data";
import NotificationSettings from "@/pages/notification-settings";
import AiApiKeysPage from "@/pages/ai-api-keys";
import AiTradingModelsPage from "@/pages/ai-trading-models";
import VeddWalletPage from "@/pages/vedd-wallet";
import HostDashboardPage from "@/pages/host-dashboard";
import MyWalletPage from "@/pages/my-wallet";
import SolanaScanner from "@/pages/solana-scanner";
import SolScannerLanding from "@/pages/sol-scanner-landing";
import SolScannerTrades from "@/pages/sol-scanner-trades";
import VeddTokenomics from "@/pages/vedd-tokenomics";
import VeddClothingPage from "@/pages/vedd-clothing";
import VeddEcosystemPage from "@/pages/vedd-ecosystem";
import CommunityImpactPage from "@/pages/community-impact";
import ImpactDashboardPage from "@/pages/impact-dashboard";
import AIGovernancePage from "@/pages/ai-governance";
import InnovationLabPage from "@/pages/innovation-lab";
import CompliancePage from "@/pages/compliance";
import LiveMonitorPage from "@/pages/live-monitor";
import WeeklyStrategyPage from "@/pages/weekly-strategy";
import OptionsEnginePage from "@/pages/options-engine";
import CryptoEnginePage from "@/pages/crypto-engine";
import AbbaBotPage from "@/pages/abba-bot";
import PolymarketWalletPage from "@/pages/polymarket-wallet";
import PolymarketEnginePage from "@/pages/polymarket-engine";
import FuturesEnginePage from "@/pages/futures-engine";
import FuturesEaGeneratorPage from "@/pages/futures-ea-generator";
import SevenEightPage from "@/pages/seven-eight";
import GrantsFundingPage from "@/pages/grants-funding";
import CreditBuilderPage from "@/pages/credit-builder";
import BizBuilderPage from "@/pages/biz-builder";
import PropFirmChallengePage from "@/pages/prop-firm-challenge";
import ORBBreakoutPage from "@/pages/orb-breakout";
import RuinConePage from "@/pages/ruin-cone";
import EventKitPage from "@/pages/event-kit";
import ContentStudioPage from "@/pages/content-studio";
import LeadHunterPage from "@/pages/lead-hunter";
import AmbassadorPrimePage from "@/pages/ambassador-prime";
import ReferralHubPage from "@/pages/referral-hub";
import AmbassadorRecruitmentPage from "@/pages/ambassador-recruitment";
import AmbassadorLandingPage from "@/pages/ambassador-landing-page";
import AmbassadorFreePathPage from "@/pages/ambassador-free-path";
import TokenInvestmentsPage from "@/pages/token-investments";
import MicroGrowthPage from "@/pages/micro-growth";
import ActivityHubPage from "@/pages/activity-hub";
import CopyTradingPage from "@/pages/copy-trading";
import PaperTradesPage from "@/pages/paper-trades";
import StreakBanner from "@/components/StreakBanner";
import { OnboardingTutorial } from "@/components/onboarding-tutorial";
import { MobileFAB } from "@/components/mobile-fab";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { NetworkStatus } from "@/components/network-status";
import { NewsNotificationScheduler } from "@/components/news-notification-scheduler";
import { SubscriptionUsageHeader } from "@/components/ui/subscription-usage-header";
import { PageTransition } from "@/components/ui/page-transition";
import { AbbaAssistant } from "@/components/travis/travis-assistant";
import { AmbassadorTodoPopup } from "@/components/ambassador-todo-popup";

import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

// ── Global error boundary — prevents a component crash from going blank ───────
interface EBState { hasError: boolean; error?: Error }
class AppErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[AppErrorBoundary] React render error:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 text-center">
          <div className="text-red-400 text-5xl mb-4">⚠</div>
          <h1 className="text-white text-xl font-bold mb-2">Something went wrong</h1>
          <p className="text-gray-400 text-sm mb-6 max-w-md">
            {this.state.error?.message ?? 'An unexpected error occurred. Please refresh the page.'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg text-sm font-medium"
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppLayout() {
  const [location] = useLocation();
  const { user } = useAuth();
  
  // Scroll to top on location change — unless a #hash anchor is present,
  // in which case scroll to that section (e.g. /webhooks#tradelocker).
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      // Delay so the target page has rendered before we look up the element
      const t = setTimeout(() => {
        const el = document.getElementById(hash.slice(1));
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else window.scrollTo(0, 0);
      }, 200);
      return () => clearTimeout(t);
    }
    window.scrollTo(0, 0);
  }, [location]);
  
  // Determine if we should show the header/footer
  const isLandingPage = location === "/";
  const isAuthPage = location === "/auth";
  const showHeaderFooter = !isLandingPage;
  const showSubscriptionBar = user && !isLandingPage && !isAuthPage && 
    !['/subscription', '/auth', '/'].includes(location);
  
  const showStreakBanner = user && !isLandingPage && !isAuthPage && 
    !['/subscription', '/auth', '/', '/streak'].includes(location);
  
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {showHeaderFooter && (
        <div className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <Header />
          {(showStreakBanner || showSubscriptionBar) && (
            <div className="border-b bg-muted/30">
              <div className="container mx-auto px-4 flex items-center justify-between gap-4 py-1.5">
                {showStreakBanner && <StreakBanner compact />}
                {showSubscriptionBar && <SubscriptionUsageHeader compact />}
              </div>
            </div>
          )}
        </div>
      )}
      <main className="flex-grow">
        <PageTransition>
          <Switch>
            {/* Public routes */}
            <Route path="/" component={LandingPage} />
            <Route path="/auth" component={AuthPage} />
            <Route path="/forgot-password" component={ForgotPasswordPage} />
            <Route path="/reset-password" component={ResetPasswordPage} />
            <Route path="/subscription" component={SubscriptionPage} />
            <Route path="/blog" component={BlogPage} />
            <Route path="/blog/:slug" component={BlogPage} />
            <Route path="/shared/:shareId" component={SharedAnalysisPage} />
            <Route path="/share/:slug" component={EASharePage} />
            <Route path="/volatility-meter" component={VolatilityMeterShowcase} />
            <Route path="/seven-eight" component={SevenEightPage} />
            
            {/* Footer pages */}
            <Route path="/about" component={AboutPage} />
            <Route path="/contact" component={ContactPage} />
            <Route path="/support" component={SupportPage} />
            <Route path="/privacy" component={PrivacyPage} />
            <Route path="/terms" component={TermsPage} />
            <Route path="/security" component={SecurityPage} />
            <Route path="/user-guide" component={UserGuidePage} />
            <Route path="/ambassador-training" component={AmbassadorTrainingPage} />
            <ProtectedRoute path="/ambassador/local-outreach" component={AmbassadorLocalOutreachPage} />
            <ProtectedRoute path="/ambassador/propfirm-event" component={AmbassadorPropFirmEventPage} />
            <ProtectedRoute path="/certifications" component={CertificationsPage} />
            <Route path="/workforce-academy" component={WorkforceAcademyPage} />
            <Route path="/training-calendar" component={TrainingCalendar} />
            <Route path="/training-calendar/day/:dayNumber" component={TrainingDay} />
            <Route path="/streak" component={StreakTrackerPage} />
            
            {/* Ambassador Content Flow (Protected) */}
            <ProtectedRoute path="/ambassador/content-flow" component={ContentFlowCalendar} />
            <ProtectedRoute path="/ambassador/content-flow/day/:dayNumber" component={ContentFlowDay} />
            <ProtectedRoute path="/ambassador/challenge/:id" component={ChallengeSession} />
            <ProtectedRoute path="/ambassador/sales-script" component={AmbassadorSalesScriptPage} />
            <ProtectedRoute path="/ambassador/free-path" component={AmbassadorFreePathPage} />
            <ProtectedRoute path="/ambassador/content-studio" component={ContentStudioPage} />
            <ProtectedRoute path="/lead-hunter" component={LeadHunterPage} />
            <ProtectedRoute path="/ambassador-prime" component={AmbassadorPrimePage} />
            <Route path="/devotional" component={DevotionalPage} />
            
            {/* Public event page (no auth required) */}
            <Route path="/event/:slug" component={PublicEventPage} />
            
            {/* Protected routes */}
            <ProtectedRoute path="/dashboard" component={Dashboard} />
            <ProtectedRoute path="/analysis" component={Analysis} />
            <ProtectedRoute path="/multi-timeframe" component={MultiTimeframeAnalysis} />
            <ProtectedRoute path="/analysis/:id" component={AnalysisDetail} />
            <ProtectedRoute path="/historical" component={Historical} />
            <ProtectedRoute path="/profile" component={ProfilePage} />
            <ProtectedRoute path="/profile/:userId" component={ProfilePage} />
            <ProtectedRoute path="/achievements" component={AchievementsPage} />
            <ProtectedRoute path="/home" component={Home} />
            <ProtectedRoute path="/community" component={Community} />
            <ProtectedRoute path="/market-insights" component={MarketInsightsPage} />
            <ProtectedRoute path="/market-trend-game" component={MarketTrendGamePage} />
            <ProtectedRoute path="/market-mood" component={MarketMoodPage} />
            <ProtectedRoute path="/market-sentiment" component={MarketSentimentPage} />
            <ProtectedRoute path="/strategy-wizard" component={StrategyWizard} />
            <ProtectedRoute path="/interactive-tooltips" component={InteractiveTooltipShowcase} />
            <ProtectedRoute path="/mobile-alerts" component={MobileAlerts} />
            <ProtectedRoute path="/my-eas" component={MyEAsPage} />
            <ProtectedRoute path="/my-subscriptions" component={MySubscriptionsPage} />
            <ProtectedRoute path="/ea-marketplace" component={EAMarketplacePage} />
            <ProtectedRoute path="/brain-marketplace" component={BrainDataMarketplacePage} />
            <ProtectedRoute path="/social-hub" component={SocialHub} />
            <ProtectedRoute path="/what-if" component={WhatIfAnalysisPage} />
            <ProtectedRoute path="/account/:type/:id" component={AccountDetailPage} />
            <ProtectedRoute path="/all-time-performance" component={AllTimePerformancePage} />
            <ProtectedRoute path="/webhooks" component={WebhooksPage} />
            <ProtectedRoute path="/mt5-chart-data" component={MT5ChartDataPage} />
            <ProtectedRoute path="/weekly-strategy" component={WeeklyStrategyPage} />
            <ProtectedRoute path="/options-engine" component={OptionsEnginePage} />
            <ProtectedRoute path="/crypto-engine" component={CryptoEnginePage} />
            <ProtectedRoute path="/abba" component={AbbaBotPage} />
            <ProtectedRoute path="/polymarket-wallet" component={PolymarketWalletPage} />
            <ProtectedRoute path="/polymarket-engine" component={PolymarketEnginePage} />
            <ProtectedRoute path="/notification-settings" component={NotificationSettings} />
            <ProtectedRoute path="/ai-api-keys" component={AiApiKeysPage} />
            <ProtectedRoute path="/ai-trading-models" component={AiTradingModelsPage} />
            
            {/* Grants & Funding (Ambassador + Admin) */}
            <ProtectedRoute path="/grants" component={GrantsFundingPage} />
            <ProtectedRoute path="/credit-builder" component={CreditBuilderPage} />

            {/* Business Credit Builder */}
            <ProtectedRoute path="/biz-builder" component={BizBuilderPage} />
            <ProtectedRoute path="/prop-firm-challenge" component={PropFirmChallengePage} />

            {/* Account Growth Plan */}
            {/* Growth Plan retired — old links land on the Micro Growth Engine */}
            <ProtectedRoute path="/account-growth" component={MicroGrowthPage} />

            {/* Micro Account Growth Engine */}
            <ProtectedRoute path="/micro-growth" component={MicroGrowthPage} />

            {/* Token-Backed Investments */}
            <ProtectedRoute path="/token-investments" component={TokenInvestmentsPage} />

            {/* Referral Hub */}
            <ProtectedRoute path="/referral" component={ReferralHubPage} />

            {/* Ambassador Recruitment Hub */}
            <ProtectedRoute path="/ambassador/recruitment" component={AmbassadorRecruitmentPage} />

            {/* Ambassador Landing Page (public, no auth required) */}
            <Route path="/lp/:slug" component={AmbassadorLandingPage} />

            {/* Admin routes */}
            <ProtectedRoute path="/admin" component={AdminHub} />
            <ProtectedRoute path="/admin/vedd-pool" component={AdminVeddPool} />
            <ProtectedRoute path="/vedd-wallet" component={VeddWalletPage} />
            <ProtectedRoute path="/host-dashboard" component={HostDashboardPage} />
            <ProtectedRoute path="/my-wallet" component={MyWalletPage} />
            <Route path="/solana-scanner" component={SolanaScanner} />
            <Route path="/sol-scanner" component={SolScannerLanding} />
            <Route path="/sol-scanner/trades" component={SolScannerTrades} />
            <Route path="/vedd-tokenomics" component={VeddTokenomics} />
            <ProtectedRoute path="/vedd-clothing" component={VeddClothingPage} />
            <ProtectedRoute path="/vedd-ecosystem" component={VeddEcosystemPage} />
            <ProtectedRoute path="/community-impact" component={CommunityImpactPage} />
            <ProtectedRoute path="/impact-dashboard" component={ImpactDashboardPage} />
            <ProtectedRoute path="/ai-governance" component={AIGovernancePage} />
            <ProtectedRoute path="/innovation-lab" component={InnovationLabPage} />
            <ProtectedRoute path="/compliance" component={CompliancePage} />
            <ProtectedRoute path="/live-monitor" component={LiveMonitorPage} />
            {/* Futures Connect + Futures Live Feed were merged into one page
                (futures-engine.tsx) — the old routes are kept as aliases so
                existing bookmarks/links (More menu, dashboard, user guide)
                keep working without needing every reference hunted down. */}
            <ProtectedRoute path="/futures-connect" component={FuturesEnginePage} />
            <ProtectedRoute path="/futures-live-feed" component={FuturesEnginePage} />
            <ProtectedRoute path="/futures-engine" component={FuturesEnginePage} />
            <ProtectedRoute path="/futures-ea-generator" component={FuturesEaGeneratorPage} />
            <ProtectedRoute path="/orb-breakout" component={ORBBreakoutPage} />
            <ProtectedRoute path="/ruin-cone" component={RuinConePage} />
            <ProtectedRoute path="/event-kit" component={EventKitPage} />
            <ProtectedRoute path="/activity" component={ActivityHubPage} />
            <ProtectedRoute path="/copy-trading" component={CopyTradingPage} />
            <ProtectedRoute path="/paper-trades" component={PaperTradesPage} />

            <Route component={NotFound} />
          </Switch>
        </PageTransition>
      </main>
      {showHeaderFooter && !isAuthPage && <Footer />}
      <OnboardingTutorial />
      <MobileBottomNav />
      <MobileFAB />
      <AbbaAssistant />
      <AmbassadorTodoPopup />
      <NetworkStatus />
      <Toaster />
      <div className="pb-16 md:pb-0" />
    </div>
  );
}

function AppRoutes() {
  return <AppLayout />;
}

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SolanaWalletProvider>
          <SolTradingProvider>
            <AuthProvider>
              <AppRoutes />
              <NewsNotificationScheduler />
            </AuthProvider>
          </SolTradingProvider>
        </SolanaWalletProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
