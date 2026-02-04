import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { Loader2, Check, AlertCircle, Coins } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import VeddPaymentButton from '@/components/VeddPaymentButton';

type Plan = {
  id: number;
  name: string;
  description: string;
  price: number;
  interval: string;
  features: string[];
  analysisLimit: number;
  socialShareLimit: number;
  isActive: boolean;
};

type Subscription = {
  planId: number;
  planName: string;
  status: string;
  currentPeriodEnd?: Date;
  monthlyAnalysisCount: number;
  monthlySocialShareCount: number;
  analysisLimit: number;
  socialShareLimit: number;
};

export default function SubscriptionPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // No redirect - pricing page is public

  // Fetch subscription plans
  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ['/api/subscription/plans'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/subscription/plans');
      return response.json();
    },
  });

  // Fetch current subscription
  const { data: subscription, isLoading: subscriptionLoading } = useQuery<Subscription>({
    queryKey: ['/api/subscription'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/subscription');
      return response.json();
    },
    enabled: !!user,
  });

  // Format price for display
  const formatPrice = (price: number): string => {
    if (price === 0) return 'Free';
    return `$${(price / 100).toFixed(2)}`;
  };

  // Handle subscription
  const handleSubscribe = async (planId: number) => {
    // Redirect to login if not logged in
    if (!user) {
      toast({
        title: 'Login Required',
        description: 'Please log in or create an account to subscribe.',
        variant: 'default',
      });
      setLocation('/auth');
      return;
    }

    try {
      setIsLoading(true);
      setSelectedPlanId(planId);

      // Check if already subscribed to this plan
      if (subscription?.planId === planId) {
        toast({
          title: 'Already Subscribed',
          description: `You are already subscribed to the ${subscription.planName} plan.`,
          variant: 'default',
        });
        setIsLoading(false);
        return;
      }

      // Create subscription
      const response = await apiRequest('POST', '/api/subscription/subscribe', { planId });
      const result = await response.json();

      if (result.checkoutUrl) {
        // For paid plans, redirect to Stripe checkout
        toast({
          title: 'Redirecting to Payment',
          description: 'Please complete your payment to activate your subscription.',
          variant: 'default',
        });
        // Redirect to Stripe Checkout page
        window.location.href = result.checkoutUrl;
        return;
      } else {
        // For free plan
        toast({
          title: 'Subscription Updated',
          description: `You are now subscribed to the ${plans?.find(p => p.id === planId)?.name} plan.`,
          variant: 'default',
        });
        window.location.reload();
      }
    } catch (error) {
      console.error('Error subscribing:', error);
      toast({
        title: 'Subscription Failed',
        description: error instanceof Error ? error.message : 'An error occurred while processing your subscription.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setSelectedPlanId(null);
    }
  };

  // Handle cancel subscription
  const handleCancelSubscription = async () => {
    try {
      setIsLoading(true);
      
      // Free plan doesn't need cancellation
      if (subscription?.planId === 1) {
        toast({
          title: 'Cannot Cancel Free Plan',
          description: 'You are on the Free plan which cannot be cancelled.',
          variant: 'default',
        });
        setIsLoading(false);
        return;
      }

      // Cancel subscription
      const response = await apiRequest('POST', '/api/subscription/cancel');
      const result = await response.json();

      toast({
        title: 'Subscription Cancelled',
        description: 'Your subscription has been cancelled. You will still have access until the end of your billing period.',
        variant: 'default',
      });
      
      // Reload to show updated subscription status
      window.location.reload();
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      toast({
        title: 'Cancellation Failed',
        description: error instanceof Error ? error.message : 'An error occurred while cancelling your subscription.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (plansLoading || subscriptionLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted/20">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <h2 className="mt-4 text-xl font-semibold">Loading Subscription Plans...</h2>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4 max-w-6xl">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold tracking-tight">Subscription Plans</h1>
        <p className="mt-4 text-xl text-muted-foreground">
          Choose the perfect plan to enhance your trading analytics experience
        </p>
      </div>

      {/* Competitive Pricing Comparison */}
      <div className="mb-12 p-6 bg-gradient-to-r from-green-500/10 to-green-500/5 rounded-lg border border-green-500/20">
        <h2 className="text-2xl font-bold mb-4 text-center">Replace 7+ Separate Tools With One Platform</h2>
        <p className="text-center text-muted-foreground mb-6">Stop paying for multiple subscriptions — AI Trading Vault includes everything</p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <Card className="border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground line-through">EA AI Refresh</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-lg font-bold text-red-500 line-through">$249-349/mo</p>
              <p className="text-xs text-muted-foreground">Live AI Re-analysis</p>
            </CardContent>
          </Card>
          <Card className="border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground line-through">TrendSpider</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-lg font-bold text-red-500 line-through">$139-197/mo</p>
              <p className="text-xs text-muted-foreground">AI Patterns</p>
            </CardContent>
          </Card>
          <Card className="border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground line-through">Trade Ideas</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-lg font-bold text-red-500 line-through">$167-228/mo</p>
              <p className="text-xs text-muted-foreground">AI Scanning</p>
            </CardContent>
          </Card>
          <Card className="border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground line-through">EA Builder Pro</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-lg font-bold text-red-500 line-through">$59-99/mo</p>
              <p className="text-xs text-muted-foreground">EA Generator</p>
            </CardContent>
          </Card>
          <Card className="border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground line-through">Trade Copier</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-lg font-bold text-red-500 line-through">$79-149/mo</p>
              <p className="text-xs text-muted-foreground">MT5→TradeLocker</p>
            </CardContent>
          </Card>
          <Card className="border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground line-through">News Sentiment</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-lg font-bold text-red-500 line-through">$79-129/mo</p>
              <p className="text-xs text-muted-foreground">AI News Analysis</p>
            </CardContent>
          </Card>
          <Card className="border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground line-through">Webhooks</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-lg font-bold text-red-500 line-through">$29-59/mo</p>
              <p className="text-xs text-muted-foreground">Signal Alerts</p>
            </CardContent>
          </Card>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-white text-center">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-3">
            <div className="text-center">
              <p className="text-sm opacity-80">Total if purchased separately</p>
              <p className="text-2xl font-bold line-through opacity-70">$801-1,210/mo</p>
            </div>
            <div className="hidden md:block text-3xl">→</div>
            <div className="text-center">
              <p className="text-sm opacity-80">Starter Plan</p>
              <p className="text-3xl font-bold">$49.95/mo</p>
            </div>
            <div className="hidden md:block text-3xl">or</div>
            <div className="text-center">
              <p className="text-sm opacity-80">Premium Plan</p>
              <p className="text-3xl font-bold">$149.99/mo</p>
            </div>
            <div className="hidden md:block text-3xl">or</div>
            <div className="text-center">
              <p className="text-sm opacity-80">Yearly Access</p>
              <p className="text-3xl font-bold">$999.99/yr</p>
            </div>
          </div>
          <p className="text-sm opacity-90">Save up to <strong>$12,700/year</strong> with AI Trading Vault Pro</p>
        </div>
      </div>

      {/* NEW: All-In-One Features */}
      <div className="mb-12 p-6 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border border-primary/20">
        <h2 className="text-2xl font-bold mb-4 text-center">Everything Included in AI Trading Vault</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-start gap-2 p-3 bg-background rounded-lg">
            <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">AI Chart Analysis</p>
              <p className="text-xs text-muted-foreground">Pattern recognition & signals</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-background rounded-lg">
            <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">EA Code Generator</p>
              <p className="text-xs text-muted-foreground">MT5, TradingView, TradeLocker</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-background rounded-lg">
            <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">MT5 Trade Copier</p>
              <p className="text-xs text-muted-foreground">Auto-copy to TradeLocker</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-background rounded-lg">
            <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">AI Direction Alerts</p>
              <p className="text-xs text-muted-foreground">Auto re-analysis on change</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-background rounded-lg border-2 border-amber-500">
            <Check className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-amber-600 dark:text-amber-400">News-Smart Trading</p>
              <p className="text-xs text-muted-foreground">AI grades news, blocks bad trades</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-background rounded-lg">
            <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Webhook System</p>
              <p className="text-xs text-muted-foreground">Automate signal delivery</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-background rounded-lg">
            <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">EA Marketplace</p>
              <p className="text-xs text-muted-foreground">Share & earn from strategies</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-background rounded-lg">
            <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">What-If Analysis</p>
              <p className="text-xs text-muted-foreground">Scenario planning with AI</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-background rounded-lg border-2 border-indigo-500">
            <Check className="h-5 w-5 text-indigo-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-indigo-600 dark:text-indigo-400">4-Stage Entry System</p>
              <p className="text-xs text-muted-foreground">HTF trend → Pattern scoring → LTF timing → Smart orders</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-background rounded-lg border-2 border-rose-500">
            <Check className="h-5 w-5 text-rose-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-rose-600 dark:text-rose-400">Choppy Market Filter</p>
              <p className="text-xs text-muted-foreground">Auto-pause in sideways markets</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-background rounded-lg border-2 border-purple-500">
            <Check className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-purple-600 dark:text-purple-400">Solana Token Scanner</p>
              <p className="text-xs text-muted-foreground">AI-powered token signals with auto-trading</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-background rounded-lg border-2 border-cyan-500">
            <Check className="h-5 w-5 text-cyan-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-cyan-600 dark:text-cyan-400">Phantom Wallet Integration</p>
              <p className="text-xs text-muted-foreground">Auto-buy/sell via Jupiter DEX</p>
            </div>
          </div>
        </div>
      </div>

      {/* Supported Platforms Section */}
      <div className="mb-12 p-6 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border border-primary/20">
        <h2 className="text-2xl font-bold mb-4 text-center">Expert Advisor Code Generation Platforms</h2>
        <p className="text-center text-muted-foreground mb-6">Generate trading bot code for your preferred platform</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-2 border-blue-500 bg-blue-50 dark:bg-blue-950">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-2xl">📈</span>
                MetaTrader 5
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Generate MQL5 Expert Advisors for MetaTrader 5 with full backtesting support.</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-orange-500 bg-orange-50 dark:bg-orange-950">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-2xl">📊</span>
                TradingView
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Create Pine Script strategies for TradingView charts with real-time alerts.</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-green-500 bg-green-50 dark:bg-green-950">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-2xl">🤖</span>
                TradeLocker
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Generate Node.js trading bots for TradeLocker API automation.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {subscription && (
        <div className="mb-8">
          <Alert className="bg-card border-primary/20">
            <AlertCircle className="h-5 w-5 text-primary" />
            <AlertTitle className="text-primary font-medium">Current Subscription</AlertTitle>
            <AlertDescription>
              <div className="flex flex-col space-y-2 mt-2">
                <div>
                  You are currently on the <span className="font-semibold">{subscription.planName}</span> plan.
                  {subscription.status === 'active' && subscription.currentPeriodEnd && (
                    <span className="ml-2">
                      Your subscription will renew on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div className="flex items-center space-x-2">
                    <div className="text-sm font-medium">Chart Analysis Usage:</div>
                    <div className="text-sm">
                      {subscription.monthlyAnalysisCount} / {subscription.analysisLimit} 
                      {subscription.analysisLimit > 999 ? ' (Unlimited)' : ''}
                    </div>
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary" 
                        style={{ 
                          width: `${Math.min(100, (subscription.monthlyAnalysisCount / subscription.analysisLimit) * 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="text-sm font-medium">Social Sharing Usage:</div>
                    <div className="text-sm">
                      {subscription.monthlySocialShareCount} / {subscription.socialShareLimit}
                      {subscription.socialShareLimit > 999 ? ' (Unlimited)' : ''}
                    </div>
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary" 
                        style={{ 
                          width: `${Math.min(100, (subscription.monthlySocialShareCount / subscription.socialShareLimit) * 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {plans?.map((plan) => (
          <Card key={plan.id} className={`relative overflow-hidden transition-all duration-300 ${
            plan.interval === 'lifetime' 
              ? 'border-2 border-primary shadow-2xl scale-105 ring-4 ring-primary/20' 
              : subscription?.planId === plan.id 
                ? 'border-primary shadow-lg' 
                : 'hover:shadow-md hover:border-primary/50'
          }`}>
            {plan.interval === 'lifetime' && (
              <div className="absolute top-0 left-0 right-0">
                <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-center py-2 font-bold text-sm">
                  ⭐ BEST VALUE - ONE-TIME PAYMENT
                </div>
              </div>
            )}
            {subscription?.planId === plan.id && (
              <div className="absolute top-0 right-0">
                <Badge className="m-2 bg-primary hover:bg-primary">Current Plan</Badge>
              </div>
            )}
            <CardHeader className={plan.interval === 'lifetime' ? 'mt-8' : ''}>
              <CardTitle className="flex justify-between items-start">
                <span>{plan.name}</span>
                <div className="text-right">
                  <span className="text-2xl font-bold">{formatPrice(plan.price)}</span>
                  {plan.interval === 'lifetime' && (
                    <div className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">Pay once, own forever!</div>
                  )}
                </div>
              </CardTitle>
              <CardDescription>
                {plan.interval === 'month' ? 'per month' : plan.interval === 'lifetime' ? 'one-time payment' : plan.interval}
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-[200px]">
              <div className="text-sm mb-4">{plan.description}</div>
              <ul className="space-y-2">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <Check className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
                <li className="flex items-start">
                  <Check className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
                  <span className="text-sm">
                    <strong>{plan.analysisLimit > 999 ? 'Unlimited' : plan.analysisLimit}</strong> chart analyses per month
                  </span>
                </li>
                <li className="flex items-start">
                  <Check className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
                  <span className="text-sm">
                    <strong>{plan.socialShareLimit > 999 ? 'Unlimited' : plan.socialShareLimit}</strong> social shares per month
                  </span>
                </li>
              </ul>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              {subscription?.planId === plan.id ? (
                subscription.planId !== 1 ? (
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={handleCancelSubscription}
                    disabled={isLoading}
                    data-testid={`button-cancel-${plan.id}`}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Cancel Subscription
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled data-testid={`button-current-${plan.id}`}>
                    Current Plan
                  </Button>
                )
              ) : (
                <>
                  {plan.price === 0 ? (
                    <Button 
                      variant="default" 
                      className="w-full"
                      onClick={() => handleSubscribe(plan.id)}
                      disabled={isLoading || selectedPlanId === plan.id}
                      data-testid={`button-subscribe-${plan.id}`}
                    >
                      {isLoading && selectedPlanId === plan.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Select Free Plan
                    </Button>
                  ) : (
                    <VeddPaymentButton 
                      planId={plan.id} 
                      planName={plan.name}
                      priceUsd={plan.price / 100}
                    />
                  )}
                </>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Feature Comparison Table */}
      <div className="mt-16">
        <h2 className="text-3xl font-bold tracking-tight text-center mb-2">Feature Comparison</h2>
        <p className="text-center text-muted-foreground mb-8">See what's included in each subscription tier</p>
        
        <div className="overflow-x-auto rounded-lg border border-border shadow-lg">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-primary/10 to-primary/5">
                <th className="px-6 py-5 text-left font-medium text-muted-foreground">
                  <span className="text-base">Feature</span>
                </th>
                {plans?.map((plan) => (
                  <th key={plan.id} className={`px-6 py-5 text-center ${
                    plan.interval === 'lifetime' 
                      ? 'bg-primary/20 border-x-2 border-primary' 
                      : subscription?.planId === plan.id 
                        ? 'bg-primary/15' 
                        : ''
                  }`}>
                    {plan.interval === 'lifetime' && (
                      <Badge className="mb-2 bg-primary hover:bg-primary">⭐ Best Value</Badge>
                    )}
                    <span className="text-lg font-bold">{plan.name}</span>
                    <div className="text-base font-medium mt-1">
                      {formatPrice(plan.price)}
                      <span className="text-xs text-muted-foreground">
                        {plan.interval === 'lifetime' ? ' one-time' : '/month'}
                      </span>
                    </div>
                    {subscription?.planId === plan.id && 
                      <Badge className="mt-2 bg-primary hover:bg-primary">Current Plan</Badge>
                    }
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {/* Group 1: Basic Features */}
              <tr className="bg-muted/30">
                <td colSpan={plans?.length ? plans.length + 1 : 4} className="px-6 py-3 text-sm font-bold">
                  Core Trading Features
                </td>
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Chart Analyses per Month</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${
                    plan.interval === 'lifetime' 
                      ? 'bg-primary/10 border-x-2 border-primary/30' 
                      : subscription?.planId === plan.id 
                        ? 'bg-primary/5' 
                        : ''
                  }`}>
                    <span className="font-semibold">{plan.analysisLimit > 999 ? 'Unlimited' : plan.analysisLimit}</span>
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Social Shares per Month</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    <span className="font-semibold">{plan.socialShareLimit > 999 ? 'Unlimited' : plan.socialShareLimit}</span>
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Pattern Recognition</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 1 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Entry & Exit Points</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 1 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Support & Resistance Levels</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 1 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>

              {/* Group 2: Standard Features */}
              <tr className="bg-muted/30">
                <td colSpan={plans?.length ? plans.length + 1 : 4} className="px-6 py-3 text-sm font-bold">
                  Advanced Features
                </td>
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">AI Trading Tip Generator</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 2 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Christian Market Wisdom</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 2 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Social Trading Features</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 2 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Solana Token Scanner</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 2 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>

              {/* Group 3: Premium Features */}
              <tr className="bg-muted/30">
                <td colSpan={plans?.length ? plans.length + 1 : 4} className="px-6 py-3 text-sm font-bold">
                  Premium Features
                </td>
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Advanced Pattern Analysis</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 3 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Priority Customer Support</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 3 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">API Access</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 3 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>

              {/* Group 4: EA Code Generation */}
              <tr className="bg-muted/30">
                <td colSpan={plans?.length ? plans.length + 1 : 4} className="px-6 py-3 text-sm font-bold">
                  Expert Advisor Code Generation
                </td>
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">MetaTrader 5 (MQL5)</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 2 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">TradingView (Pine Script)</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 2 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">TradeLocker (Node.js)</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 2 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Unified Trade Signal (Multi-Timeframe Synthesis)</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 2 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* VEDD Token Purchase Section */}
      <div className="mt-12 p-8 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-purple-500/10 rounded-xl border border-purple-500/30">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-4">
            <Coins className="w-8 h-8 text-purple-500" />
            <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
              Buy VEDD Token
            </h2>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            VEDD is our native cryptocurrency token. Use it to pay for subscriptions, unlock premium features, and participate in our ecosystem.
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card className="border-purple-500/30 bg-purple-500/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="text-2xl">💰</span>
                Save on Subscriptions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Pay with VEDD tokens and get discounted rates on all subscription plans.
              </p>
            </CardContent>
          </Card>
          <Card className="border-purple-500/30 bg-purple-500/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="text-2xl">🚀</span>
                Future Utility
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                VEDD tokens will unlock exclusive features, governance rights, and staking rewards.
              </p>
            </CardContent>
          </Card>
          <Card className="border-purple-500/30 bg-purple-500/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="text-2xl">🔥</span>
                Growing Ecosystem
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Join our growing community and be part of the decentralized trading analysis revolution.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-wrap gap-4 justify-center">
            <a 
              href="https://pump.fun/coin/Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                data-testid="button-buy-vedd-pumpfun"
              >
                <Coins className="w-5 h-5 mr-2" />
                Buy VEDD on Pump.fun
              </Button>
            </a>
            <a 
              href="https://raydium.io/swap/?inputCurrency=sol&outputCurrency=Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Button 
                size="lg" 
                variant="outline"
                className="border-purple-500 text-purple-500 hover:bg-purple-500/10"
                data-testid="button-buy-vedd-raydium"
              >
                <Coins className="w-5 h-5 mr-2" />
                Buy VEDD on Raydium
              </Button>
            </a>
          </div>
          <p className="text-xs text-muted-foreground text-center max-w-md">
            Token Contract: Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump
          </p>
        </div>
      </div>

      <div className="mt-12 text-center text-sm text-muted-foreground">
        <p>All subscriptions are automatically renewed monthly. You can cancel at any time.</p>
        <p className="mt-2">
          Need help? <a href="/contact" className="text-primary hover:underline">Contact support</a>
        </p>
      </div>
    </div>
  );
}