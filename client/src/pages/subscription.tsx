import { useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { Loader2, Check, X, Zap, Crown, Star, Settings, ChevronDown, ChevronUp, Sparkles, TrendingUp, Bot, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

const PLAN_META: Record<number, {
  icon: any;
  color: string;
  border: string;
  badge?: string;
  highlight?: boolean;
  features: string[];
}> = {
  1: {
    icon: Star,
    color: 'text-muted-foreground',
    border: 'border-border',
    features: [
      '3 chart analyses per month',
      'AI pattern recognition',
      'Basic entry & exit signals',
      'Support & resistance levels',
      '2 social shares per month',
      'Community access',
    ],
  },
  2: {
    icon: Zap,
    color: 'text-blue-500',
    border: 'border-blue-500/40',
    features: [
      '50 chart analyses per month',
      'Multi-timeframe analysis',
      'EA generator — MT5, TradingView, TradeLocker',
      'Weekly AI trading strategy',
      'News & economic event alerts',
      'Signal webhooks',
      'VEDD SS AI Brain Engine',
      '25 social shares per month',
    ],
  },
  3: {
    icon: Sparkles,
    color: 'text-primary',
    border: 'border-primary',
    badge: 'Most Popular',
    highlight: true,
    features: [
      'Unlimited chart analyses',
      'Everything in Starter',
      'VEDD Live Trading Engine (Forex)',
      'Solana Token Scanner + Auto-Trade',
      'Sol Engine — paper & live trading',
      'Advanced SL/TP confidence scoring',
      'Multi-agent AI consensus',
      'Unlimited social shares',
    ],
  },
  4: {
    icon: Crown,
    color: 'text-amber-500',
    border: 'border-amber-500/60',
    badge: 'Best Value',
    features: [
      'Everything in Premium — forever',
      'Pay once, own it for life',
      'All future feature updates included',
      'Early access to beta features',
      'Priority support',
      'Transferable membership',
    ],
  },
};

const FEATURE_ROWS = [
  { label: 'Chart Analyses / Month', values: { 1: '3', 2: '50', 3: 'Unlimited', 4: 'Unlimited' } },
  { label: 'Social Shares / Month', values: { 1: '2', 2: '25', 3: 'Unlimited', 4: 'Unlimited' } },
  { label: 'AI Pattern Recognition', values: { 1: true, 2: true, 3: true, 4: true } },
  { label: 'Entry, Exit & SL/TP Signals', values: { 1: true, 2: true, 3: true, 4: true } },
  { label: 'EA Code Generator (MT5/TV/TL)', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'Weekly AI Trading Strategy', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'News & Economic Alerts', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'Signal Webhooks', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'VEDD SS AI Brain Engine', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'VEDD Live Trading Engine', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Solana Token Scanner', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Sol Engine Auto-Trade', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Advanced Confidence Scoring', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Multi-Agent AI Consensus', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Early Beta Access', values: { 1: false, 2: false, 3: false, 4: true } },
  { label: 'Lifetime Updates', values: { 1: false, 2: false, 3: false, 4: true } },
];

export default function SubscriptionPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lsLoading, setLsLoading] = useState<number | null>(null);
  const [showLsSetup, setShowLsSetup] = useState(false);
  const [variantInputs, setVariantInputs] = useState<Record<number, string>>({});
  const [showTable, setShowTable] = useState(false);

  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ['/api/subscription/plans'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/subscription/plans');
      return response.json();
    },
  });

  const { data: subscription, isLoading: subscriptionLoading } = useQuery<Subscription>({
    queryKey: ['/api/subscription'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/subscription');
      return response.json();
    },
    enabled: !!user,
  });

  const { data: lsVariants } = useQuery<Record<number, string | null>>({
    queryKey: ['/api/lemonsqueezy/plan-variants'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/lemonsqueezy/plan-variants');
      return res.json();
    },
    enabled: !!user,
  });

  const formatPrice = (price: number): string => {
    if (price === 0) return '$0';
    return `$${(price / 100).toFixed(0)}`;
  };

  const handleLemonSqueezyCheckout = async (planId: number) => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Please log in to subscribe.', variant: 'default' });
      setLocation('/auth');
      return;
    }
    try {
      setLsLoading(planId);
      const res = await apiRequest('POST', '/api/lemonsqueezy/checkout', { planId });
      const result = await res.json();
      if (result.code === 'LS_NOT_CONFIGURED') {
        toast({ title: 'Payment Setup In Progress', description: 'USD checkout is being configured. Please try again shortly.', variant: 'default' });
        return;
      }
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        throw new Error(result.message || 'No checkout URL returned');
      }
    } catch (error) {
      toast({ title: 'Checkout Failed', description: error instanceof Error ? error.message : 'Error creating checkout session.', variant: 'destructive' });
    } finally {
      setLsLoading(null);
    }
  };

  const handleSubscribe = async (planId: number) => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Please log in or create an account to subscribe.', variant: 'default' });
      setLocation('/auth');
      return;
    }
    try {
      setIsLoading(true);
      setSelectedPlanId(planId);
      if (subscription?.planId === planId) {
        toast({ title: 'Already Subscribed', description: `You are already subscribed to this plan.`, variant: 'default' });
        return;
      }
      const response = await apiRequest('POST', '/api/subscription/subscribe', { planId });
      const result = await response.json();
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        toast({ title: 'Subscription Updated', description: `You are now on the ${plans?.find(p => p.id === planId)?.name} plan.` });
        window.location.reload();
      }
    } catch (error) {
      toast({ title: 'Subscription Failed', description: error instanceof Error ? error.message : 'An error occurred.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
      setSelectedPlanId(null);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      setIsLoading(true);
      if (subscription?.planId === 1) {
        toast({ title: 'Cannot Cancel Free Plan', variant: 'default' });
        return;
      }
      await apiRequest('POST', '/api/subscription/cancel');
      toast({ title: 'Subscription Cancelled', description: 'You will have access until the end of your billing period.' });
      window.location.reload();
    } catch (error) {
      toast({ title: 'Cancellation Failed', description: error instanceof Error ? error.message : 'An error occurred.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveVariant = async (planId: number) => {
    const variantId = variantInputs[planId]?.trim();
    if (!variantId) { toast({ title: 'Enter a variant ID', variant: 'destructive' }); return; }
    try {
      await apiRequest('POST', '/api/lemonsqueezy/set-variant', { planId, variantId });
      queryClient.invalidateQueries({ queryKey: ['/api/lemonsqueezy/plan-variants'] });
      toast({ title: 'Saved!', description: `Plan ${planId} linked to variant ${variantId}` });
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    }
  };

  if (plansLoading || subscriptionLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading plans...</p>
      </div>
    );
  }

  const isCurrentPlan = (planId: number) => subscription?.planId === planId;
  const isFree = (plan: Plan) => plan.price === 0;
  const isPaid = (plan: Plan) => plan.price > 0;

  return (
    <div className="min-h-screen bg-background">

      {/* Hero */}
      <div className="border-b border-border bg-gradient-to-b from-primary/5 to-background">
        <div className="max-w-5xl mx-auto px-4 py-16 text-center">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
            AI-Powered Trading Platform
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
            Everything you need to trade smarter — chart analysis, live AI engines, EA generators, Solana scanner, and more. One subscription, no hidden fees.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" /> Cancel anytime</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" /> Pay with USD or VEDD tokens</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" /> Replaces 7+ separate tools</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12">

        {/* Active Subscription Banner */}
        {subscription && subscription.planId > 1 && (
          <div className="mb-10 p-4 rounded-xl border border-primary/30 bg-primary/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Current plan: <span className="text-primary">{subscription.planName}</span></p>
              <p className="text-sm text-muted-foreground">
                {subscription.monthlyAnalysisCount} / {subscription.analysisLimit > 999 ? '∞' : subscription.analysisLimit} analyses used this month
                {subscription.currentPeriodEnd && ` · Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleCancelSubscription} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancel subscription
            </Button>
          </div>
        )}

        {/* Plan Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {plans?.map((plan) => {
            const meta = PLAN_META[plan.id] || PLAN_META[2];
            const Icon = meta.icon;
            const current = isCurrentPlan(plan.id);

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 bg-card flex flex-col transition-shadow hover:shadow-lg ${meta.border} ${meta.highlight ? 'shadow-lg shadow-primary/10' : ''}`}
              >
                {/* Popular / Best Value Badge */}
                {meta.badge && (
                  <div className={`absolute -top-3.5 left-1/2 -translate-x-1/2`}>
                    <Badge className={meta.highlight ? 'bg-primary text-primary-foreground px-3 py-1' : 'bg-amber-500 text-black px-3 py-1'}>
                      {meta.badge}
                    </Badge>
                  </div>
                )}

                <div className={`p-6 pb-4 ${meta.badge ? 'pt-8' : ''}`}>
                  {/* Icon + Name */}
                  <div className="flex items-center gap-2 mb-4">
                    <Icon className={`h-5 w-5 ${meta.color}`} />
                    <span className="font-semibold text-base">{plan.name}</span>
                    {current && <Badge variant="outline" className="ml-auto text-xs border-primary text-primary">Active</Badge>}
                  </div>

                  {/* Price */}
                  <div className="mb-1">
                    <span className="text-4xl font-bold tracking-tight">
                      {isFree(plan) ? 'Free' : formatPrice(plan.price)}
                    </span>
                    {isPaid(plan) && (
                      <span className="text-muted-foreground text-sm ml-1">
                        {plan.interval === 'lifetime' ? ' one-time' : '/mo'}
                      </span>
                    )}
                  </div>
                  {plan.interval === 'lifetime' && (
                    <p className="text-xs text-amber-500 font-medium mb-3">Pay once. Use forever.</p>
                  )}

                  {/* Features */}
                  <ul className="space-y-2.5 mt-5 mb-6 flex-1">
                    {meta.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${meta.highlight ? 'text-primary' : 'text-green-500'}`} />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA */}
                <div className="px-6 pb-6 mt-auto flex flex-col gap-2">
                  {current ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : isFree(plan) ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => handleSubscribe(plan.id)}
                      disabled={isLoading && selectedPlanId === plan.id}
                    >
                      {isLoading && selectedPlanId === plan.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Get started free
                    </Button>
                  ) : (
                    <>
                      <Button
                        className={`w-full font-semibold gap-2 ${meta.highlight ? '' : 'bg-yellow-500 hover:bg-yellow-400 text-black'}`}
                        variant={meta.highlight ? 'default' : 'default'}
                        style={!meta.highlight ? {} : {}}
                        onClick={() => handleLemonSqueezyCheckout(plan.id)}
                        disabled={lsLoading === plan.id}
                      >
                        {lsLoading === plan.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <span>🍋</span>
                        )}
                        Pay USD — {formatPrice(plan.price)}
                      </Button>
                      <VeddPaymentButton
                        planId={plan.id}
                        planName={plan.name}
                        priceUsd={plan.price / 100}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Platform trust bar */}
        <div className="flex flex-wrap items-center justify-center gap-6 mb-16 text-sm text-muted-foreground border-y border-border py-6">
          <span className="font-medium text-foreground">Works with:</span>
          <span className="flex items-center gap-1.5"><Bot className="h-4 w-4" /> MetaTrader 5</span>
          <span className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4" /> TradingView</span>
          <span className="flex items-center gap-1.5"><Zap className="h-4 w-4" /> TradeLocker</span>
          <span className="flex items-center gap-1.5"><Shield className="h-4 w-4" /> Phantom Wallet</span>
          <span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4" /> Jupiter DEX</span>
        </div>

        {/* Feature comparison toggle */}
        <div className="mb-8 text-center">
          <button
            onClick={() => setShowTable(!showTable)}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
          >
            {showTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showTable ? 'Hide' : 'Show'} full feature comparison
          </button>
        </div>

        {/* Feature Table */}
        {showTable && (
          <div className="mb-16 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-5 py-4 font-medium text-muted-foreground w-1/2">Feature</th>
                  {plans?.map(p => (
                    <th key={p.id} className={`px-5 py-4 text-center font-semibold ${p.id === 3 ? 'text-primary' : ''}`}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {FEATURE_ROWS.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-muted-foreground">{row.label}</td>
                    {plans?.map(p => {
                      const val = (row.values as any)[p.id];
                      return (
                        <td key={p.id} className={`px-5 py-3.5 text-center ${p.id === 3 ? 'bg-primary/5' : ''}`}>
                          {typeof val === 'boolean' ? (
                            val
                              ? <Check className="h-4 w-4 text-green-500 mx-auto" />
                              : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                          ) : (
                            <span className="font-medium">{val}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* VEDD Token Access */}
        <div className="mb-12 rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-amber-500/5 p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">Hold VEDD Tokens — Skip the Subscription</h2>
            <p className="text-muted-foreground text-sm max-w-xl mx-auto">
              Connect your Phantom wallet on login. Hold VEDD tokens in your wallet to unlock membership tiers automatically — no credit card needed.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              { tier: 'Basic', tokens: '100+', equiv: 'Starter', color: 'blue' },
              { tier: 'Pro', tokens: '500+', equiv: 'Premium', color: 'purple' },
              { tier: 'Elite', tokens: 'VEDD NFT', equiv: 'Yearly (lifetime)', color: 'amber' },
            ].map(({ tier, tokens, equiv, color }) => (
              <div key={tier} className={`rounded-xl border border-${color}-500/20 bg-${color}-500/5 p-4 text-center`}>
                <p className={`text-lg font-bold text-${color}-400 mb-0.5`}>{tokens}</p>
                <p className="text-xs text-muted-foreground mb-1">VEDD Tokens required</p>
                <p className="text-sm font-semibold">{tier} Tier</p>
                <p className="text-xs text-muted-foreground">= {equiv} plan access</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="https://pump.fun/coin/Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                Buy VEDD on Pump.fun
              </Button>
            </a>
            <a href="https://raydium.io/swap/?inputMint=sol&outputMint=Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                Buy VEDD on Raydium
              </Button>
            </a>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-center mb-6">Common questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                q: 'Can I cancel anytime?',
                a: 'Yes. Cancel from the subscription page at any time. You keep access until the end of your billing period.',
              },
              {
                q: 'What payment methods are accepted?',
                a: 'USD via credit/debit card (Lemon Squeezy checkout), or pay with VEDD tokens from your Solana wallet.',
              },
              {
                q: 'What is the Yearly plan?',
                a: 'A one-time payment that gives you lifetime access to all Premium features — no monthly fees, ever. All future updates included.',
              },
              {
                q: 'How does VEDD token access work?',
                a: 'Connect your Phantom wallet on the login page. If you hold enough VEDD tokens, your tier is detected automatically and access is granted instantly.',
              },
              {
                q: 'Which AI models does the platform use?',
                a: 'GPT-4o, Groq Llama 3.3, Claude 3.5, Gemini 1.5 Pro, and Mistral Large. You can add your own API key or use the platform default.',
              },
              {
                q: 'What is the Lemon Squeezy checkout?',
                a: 'A secure USD payment processor. Click the yellow "Pay USD" button on any paid plan to be taken to a secure hosted checkout page.',
              },
            ].map(({ q, a }, i) => (
              <div key={i} className="p-5 rounded-xl border border-border bg-card">
                <p className="font-semibold text-sm mb-1.5">{q}</p>
                <p className="text-sm text-muted-foreground">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Lemon Squeezy Admin Setup */}
        {user && (
          <div className="border border-yellow-500/30 rounded-xl overflow-hidden mb-12">
            <button
              className="w-full flex items-center justify-between px-6 py-4 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors"
              onClick={() => setShowLsSetup(!showLsSetup)}
            >
              <div className="flex items-center gap-3">
                <span>🍋</span>
                <div className="text-left">
                  <p className="font-semibold text-sm">Lemon Squeezy Setup</p>
                  <p className="text-xs text-muted-foreground">Link variant IDs to enable USD checkout per plan</p>
                </div>
              </div>
              {showLsSetup ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {showLsSetup && (
              <div className="p-6 space-y-4 border-t border-yellow-500/20">
                <Alert className="border-yellow-500/30 bg-yellow-500/5">
                  <Settings className="h-4 w-4 text-yellow-500" />
                  <AlertTitle className="text-yellow-600 dark:text-yellow-400 text-sm">Setup Instructions</AlertTitle>
                  <AlertDescription className="text-xs space-y-1 mt-1">
                    <p>1. Log in to <a href="https://app.lemonsqueezy.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">app.lemonsqueezy.com</a> and create a product for each paid plan</p>
                    <p>2. Copy the Variant ID from each product and paste it below, then click Save</p>
                    <p>3. Set up a webhook pointing to: <code className="bg-muted px-1 rounded">{window.location.origin}/api/lemonsqueezy/webhook</code></p>
                    <p>4. Add the webhook signing secret as <code className="bg-muted px-1 rounded">LEMONSQUEEZY_WEBHOOK_SECRET</code> in your environment</p>
                  </AlertDescription>
                </Alert>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {plans?.filter(p => p.price > 0).map(plan => (
                    <div key={plan.id} className="rounded-lg border border-border p-4 space-y-2">
                      <p className="font-semibold text-sm">{plan.name}</p>
                      {lsVariants?.[plan.id] && (
                        <p className="text-xs text-green-500 flex items-center gap-1">
                          <Check className="h-3 w-3" /> {lsVariants[plan.id]}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Input
                          placeholder="Variant ID"
                          className="text-xs h-8"
                          value={variantInputs[plan.id] || ''}
                          onChange={e => setVariantInputs(prev => ({ ...prev, [plan.id]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          className="h-8 bg-yellow-500 hover:bg-yellow-400 text-black text-xs px-3"
                          onClick={() => handleSaveVariant(plan.id)}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          All monthly subscriptions renew automatically. Cancel anytime. ·{' '}
          <a href="/contact" className="text-primary hover:underline">Contact support</a>
        </p>
      </div>
    </div>
  );
}
