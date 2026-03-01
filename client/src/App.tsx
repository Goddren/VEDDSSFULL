import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import { SolanaWalletProvider } from "@/hooks/use-solana-wallet";
import NotFound from "@/pages/not-found";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Analysis from "@/pages/analysis";
import MultiTimeframeAnalysis from "@/pages/multi-timeframe-analysis";
import Historical from "@/pages/historical";
import AuthPage from "@/pages/auth-page";
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
import StrategyWizard from "@/pages/strategy-wizard";
import MobileAlerts from "@/pages/mobile-alerts";
import MyEAsPage from "@/pages/my-eas";
import MySubscriptionsPage from "@/pages/my-subscriptions";
import EAMarketplacePage from "@/pages/ea-marketplace";
import SocialHub from "@/pages/social-hub";
import UserGuidePage from "@/pages/user-guide";
import AmbassadorTrainingPage from "@/pages/ambassador-training";
import TrainingCalendar from "@/pages/training-calendar";
import TrainingDay from "@/pages/training-day";
import ContentFlowCalendar from "@/pages/content-flow-calendar";
import ContentFlowDay from "@/pages/content-flow-day";
import ChallengeSession from "@/pages/challenge-session";
import PublicEventPage from "@/pages/public-event";
import StreakTrackerPage from "@/pages/streak-tracker";
import WhatIfAnalysisPage from "@/pages/what-if-analysis";
import AdminVeddPool from "@/pages/admin-vedd-pool";
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
import LiveMonitorPage from "@/pages/live-monitor";
import WeeklyStrategyPage from "@/pages/weekly-strategy";
import SevenEightPage from "@/pages/seven-eight";
import StreakBanner from "@/components/StreakBanner";
import { MobileFAB } from "@/components/mobile-fab";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { NetworkStatus } from "@/components/network-status";
import { NewsNotificationScheduler } from "@/components/news-notification-scheduler";
import { SubscriptionUsageHeader } from "@/components/ui/subscription-usage-header";
import { PageTransition } from "@/components/ui/page-transition";

import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

function AppLayout() {
  const [location] = useLocation();
  const { user } = useAuth();
  
  // Scroll to top on location change
  useEffect(() => {
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
            <Route path="/subscription" component={SubscriptionPage} />
            <Route path="/blog" component={BlogPage} />
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
            <Route path="/training-calendar" component={TrainingCalendar} />
            <Route path="/training-calendar/day/:dayNumber" component={TrainingDay} />
            <Route path="/streak" component={StreakTrackerPage} />
            
            {/* Ambassador Content Flow (Protected) */}
            <ProtectedRoute path="/ambassador/content-flow" component={ContentFlowCalendar} />
            <ProtectedRoute path="/ambassador/content-flow/day/:dayNumber" component={ContentFlowDay} />
            <ProtectedRoute path="/ambassador/challenge/:id" component={ChallengeSession} />
            
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
            <ProtectedRoute path="/social-hub" component={SocialHub} />
            <ProtectedRoute path="/what-if" component={WhatIfAnalysisPage} />
            <ProtectedRoute path="/webhooks" component={WebhooksPage} />
            <ProtectedRoute path="/mt5-chart-data" component={MT5ChartDataPage} />
            <ProtectedRoute path="/weekly-strategy" component={WeeklyStrategyPage} />
            <ProtectedRoute path="/notification-settings" component={NotificationSettings} />
            <ProtectedRoute path="/ai-api-keys" component={AiApiKeysPage} />
            <ProtectedRoute path="/ai-trading-models" component={AiTradingModelsPage} />
            
            {/* Admin routes */}
            <ProtectedRoute path="/admin/vedd-pool" component={AdminVeddPool} />
            <ProtectedRoute path="/vedd-wallet" component={VeddWalletPage} />
            <ProtectedRoute path="/host-dashboard" component={HostDashboardPage} />
            <ProtectedRoute path="/my-wallet" component={MyWalletPage} />
            <Route path="/solana-scanner" component={SolanaScanner} />
            <Route path="/sol-scanner" component={SolScannerLanding} />
            <Route path="/sol-scanner/trades" component={SolScannerTrades} />
            <Route path="/vedd-tokenomics" component={VeddTokenomics} />
            <ProtectedRoute path="/vedd-clothing" component={VeddClothingPage} />
            <ProtectedRoute path="/live-monitor" component={LiveMonitorPage} />
            
            <Route component={NotFound} />
          </Switch>
        </PageTransition>
      </main>
      {showHeaderFooter && !isAuthPage && <Footer />}
      <MobileBottomNav />
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
    <QueryClientProvider client={queryClient}>
      <SolanaWalletProvider>
        <AuthProvider>
          <AppRoutes />
          <NewsNotificationScheduler />
        </AuthProvider>
      </SolanaWalletProvider>
    </QueryClientProvider>
  );
}

export default App;
