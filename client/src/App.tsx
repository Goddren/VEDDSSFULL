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

import { useLocation } from "wouter";

function AppLayout() {
  const [location] = useLocation();
  
  // Determine if we should show the header/footer
  const isLandingPage = location === "/";
  const isAuthPage = location === "/auth";
  const showHeaderFooter = !isLandingPage;
  
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {showHeaderFooter && <Header />}
      <main className="flex-grow">
        <Switch>
          <Route path="/" component={LandingPage} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/subscription" component={SubscriptionPage} />
          <ProtectedRoute path="/dashboard" component={Dashboard} />
          <ProtectedRoute path="/analysis" component={Analysis} />
          <ProtectedRoute path="/historical" component={Historical} />
          <ProtectedRoute path="/profile" component={ProfilePage} />
          <ProtectedRoute path="/home" component={Home} />
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
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
