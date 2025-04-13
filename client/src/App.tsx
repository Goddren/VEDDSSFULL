import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import NotFound from "@/pages/not-found";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Analysis from "@/pages/analysis";
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
import SocialHub from "@/pages/social-hub";
import VolatilityMeterShowcase from "@/pages/volatility-meter-showcase";
import MarketInsightsPage from "@/pages/market-insights";
import MarketTrendGamePage from "@/pages/market-trend-game";
import MarketMoodPage from "@/pages/market-mood";
import MarketSentimentPage from "@/pages/market-sentiment";
import InteractiveTooltipShowcase from "@/pages/interactive-tooltip-showcase";
import BlogPage from "@/pages/blog";
import { NewsNotificationScheduler } from "@/components/news-notification-scheduler";
import { SubscriptionUsageHeader } from "@/components/ui/subscription-usage-header";

import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

function AppLayout() {
  const [location] = useLocation();
  const { user } = useAuth();
  
  // Determine if we should show the header/footer
  const isLandingPage = location === "/";
  const isAuthPage = location === "/auth";
  const showHeaderFooter = !isLandingPage;
  const showSubscriptionBar = user && !isLandingPage && !isAuthPage && 
    !['/subscription', '/auth', '/'].includes(location);
  
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {showHeaderFooter && <Header />}
      {showSubscriptionBar && <SubscriptionUsageHeader />}
      <main className="flex-grow">
        <Switch>
          {/* Public routes */}
          <Route path="/" component={LandingPage} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/subscription" component={SubscriptionPage} />
          <Route path="/blog" component={BlogPage} />
          <Route path="/shared/:shareId" component={SharedAnalysisPage} />
          <Route path="/volatility-meter" component={VolatilityMeterShowcase} />
          
          {/* Footer pages */}
          <Route path="/about" component={AboutPage} />
          <Route path="/contact" component={ContactPage} />
          <Route path="/support" component={SupportPage} />
          <Route path="/privacy" component={PrivacyPage} />
          <Route path="/terms" component={TermsPage} />
          <Route path="/security" component={SecurityPage} />
          
          {/* Protected routes */}
          <ProtectedRoute path="/dashboard" component={Dashboard} />
          <ProtectedRoute path="/analysis" component={Analysis} />
          <ProtectedRoute path="/analysis/:id" component={AnalysisDetail} />
          <ProtectedRoute path="/historical" component={Historical} />
          <ProtectedRoute path="/profile" component={ProfilePage} />
          <ProtectedRoute path="/profile/:userId" component={ProfilePage} />
          <ProtectedRoute path="/achievements" component={AchievementsPage} />
          <ProtectedRoute path="/home" component={Home} />
          <ProtectedRoute path="/social-hub" component={SocialHub} />
          <ProtectedRoute path="/market-insights" component={MarketInsightsPage} />
          <ProtectedRoute path="/market-trend-game" component={MarketTrendGamePage} />
          <ProtectedRoute path="/market-mood" component={MarketMoodPage} />
          <ProtectedRoute path="/market-sentiment" component={MarketSentimentPage} />
          <ProtectedRoute path="/interactive-tooltips" component={InteractiveTooltipShowcase} />
          
          <Route component={NotFound} />
        </Switch>
      </main>
      {showHeaderFooter && !isAuthPage && <Footer />}
      <Toaster />
    </div>
  );
}

function AppRoutes() {
  return <AppLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRoutes />
        <NewsNotificationScheduler />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
