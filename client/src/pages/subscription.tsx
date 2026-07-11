import { useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { Loader2, Check, X, Zap, Crown, Star, ChevronDown, ChevronUp, Sparkles, TrendingUp, Bot, Shield, Gift, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

// Ambassador credits required to pay for each plan (1 credit = $0.01)
const AMBASSADOR_CREDIT_COSTS: Record<number, number> = {
  2: 4995,   // Starter $49.95
  3: 14999,  // Premium $149.99
  4: 99999,  // Yearly $999.99
};

const PLAN_META: Record<number, {
  icon: typeof Loader2;
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
      'ABBA AI Personal Assistant',
      '50 chart analyses per month',
      'Multi-timeframe analysis',
      'EA generator — MT5, TradingView, TradeLocker, NinjaTrader 8',
      'Futures EA Generator (NQ/ES/YM/GC/CL)',
      'Weekly AI trading strategy',
      'What-If scenario modeling',
      'News & economic event alerts',
      'Signal webhooks',
      'VEDD SS AI Brain Engine',
      'Paper Trade AI Journal — auto-resolving',
      'Brain Data Marketplace — buy & sell AI brain data',
      'Achievements, streaks & XP tiers',
      'Ambassador Training & 44-Day Journey',
      'Referral Hub — earn credits & VEDD',
      'Bring Your Own AI Key (BYOK)',
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
      'ABBA AI Personal Assistant (full context)',
      'Unlimited chart analyses',
      'Everything in Starter',
      'VEDD Live Trading Engine (Forex)',
      'Trailing Stop AI — 9 dynamic methods',
      'Copy Trading — paper & real-broker execution with safety gates',
      'Automatic trade logging (TradeLocker/MT5 auto-sync)',
      'Deep Reasoning Mode — Bull/Bear/Veteran-Judge AI debate',
      'Prop Firm Consistency Toolkit (drawdown buffer + payout rules)',
      'ORB Breakout Strategy Engine',
      'Futures AI Live Feed (NQ/ES/YM/GC/CL scanner)',
      'Solana Token Scanner + Auto-Trade',
      'Sol Engine — paper & live trading',
      'Polymarket Prediction Engine (BTC/ETH)',
      'Business Credit Builder (6-phase)',
      'Business Builder — formation, banking & funding',
      'Grants Hub (SBA, NSF, CDFI, Google.org)',
      'Community Impact Dashboard',
      'Advanced SL/TP confidence scoring',
      'Multi-agent AI consensus',
      'Bring Your Own AI Key (BYOK)',
      'Unlimited social shares',
    ],
  },
  4: {
    icon: Crown,
    color: 'text-amber-500',
    border: 'border-amber-500/60',
    badge: 'Best Value',
    features: [
      'ABBA AI Personal Assistant',
      'Everything in Premium — yearly renewal',
      'Business Credit Builder + Biz Builder',
      'Grants Hub (SBA, NSF, CDFI, Google.org)',
      'Copy Trading — paper & real-broker execution',
      'Deep Reasoning Mode + Prop Firm Consistency Toolkit',
      'ORB Breakout Strategy Engine',
      'Polymarket Prediction Engine',
      'NFC Wear-to-Earn VEDD Clothing rewards',
      'Innovation Lab (beta features)',
      'All future feature updates included',
      'Early access to beta features',
      'Bring Your Own AI Key (BYOK)',
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
  { label: 'Community & Social Hub', values: { 1: true, 2: true, 3: true, 4: true } },
  { label: 'Achievements, Streaks & XP Tiers', values: { 1: true, 2: true, 3: true, 4: true } },
  { label: 'VEDD Token Earning & Wallet', values: { 1: true, 2: true, 3: true, 4: true } },
  { label: 'Ambassador Training (44-Day Journey)', values: { 1: true, 2: true, 3: true, 4: true } },
  { label: 'Referral Hub', values: { 1: true, 2: true, 3: true, 4: true } },
  { label: 'Daily Devotional & Streak Tracker', values: { 1: true, 2: true, 3: true, 4: true } },
  { label: 'ABBA AI Personal Assistant', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'EA Code Generator (MT5/TV/TL/NT8)', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'Futures EA Generator', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'Weekly AI Trading Strategy', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'What-If Scenario Modeling', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'News & Economic Alerts', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'Signal Webhooks', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'VEDD SS AI Brain Engine', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'Paper Trade AI Journal (Auto-Resolving)', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'Brain Data Marketplace (Buy & Sell)', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'Bring Your Own AI Key (BYOK)', values: { 1: false, 2: true, 3: true, 4: true } },
  { label: 'VEDD Live Trading Engine', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Trailing Stop AI (9 methods)', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Copy Trading (Paper + Real Broker)', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Automatic Trade Logging (TL/MT5)', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Deep Reasoning Mode (Veteran AI Judge)', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Prop Firm Consistency Toolkit', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'ORB Breakout Strategy Engine', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Futures AI Live Feed', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Solana Token Scanner', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Sol Engine Auto-Trade', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Polymarket Prediction Engine', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Business Credit Builder (6-phase)', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Business Builder (Formation + Funding)', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Grants Hub (SBA, NSF, CDFI…)', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Advanced Confidence Scoring', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Multi-Agent AI Consensus', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'NFC Wear-to-Earn Clothing Rewards', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Community Impact Dashboard', values: { 1: false, 2: false, 3: true, 4: true } },
  { label: 'Innovation Lab (Beta Features)', values: { 1: false, 2: false, 3: false, 4: true } },
  { label: 'Early Beta Access', values: { 1: false, 2: false, 3: false, 4: true } },
  { label: 'Yearly Updates Included', values: { 1: false, 2: false, 3: false, 4: true } },
];

export default function SubscriptionPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [creditLoading, setCreditLoading] = useState<number | null>(null);

  // Fetch ambassador credit balance
  const { data: creditData } = useQuery<{ balance: number }>({
    queryKey: ['/api/ambassador/credits'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/ambassador/credits');
      return res.json();
    },
    enabled: !!user,
  });
  const creditBalance = creditData?.balance ?? 0;

  const handlePayWithCredits = async (planId: number) => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Please log in to use ambassador credits.', variant: 'default' });
      setLocation('/auth');
      return;
    }
    const cost = AMBASSADOR_CREDIT_COSTS[planId];
    if (creditBalance < cost) {
      toast({
        title: 'Insufficient Credits',
        description: `You need ${cost.toLocaleString()} credits but only have ${creditBalance.toLocaleString()}. Keep referring traders to earn more!`,
        variant: 'destructive',
      });
      return;
    }
    try {
      setCreditLoading(planId);
      const res = await apiRequest('POST', '/api/subscription/pay-with-credits', { planId });
      const result = await res.json();
      if (result.success) {
        toast({ title: 'Subscription Activated!', description: `You are now on the ${result.planName} plan. ${cost.toLocaleString()} credits deducted.` });
        queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
        queryClient.invalidateQueries({ queryKey: ['/api/ambassador/credits'] });
        window.location.reload();
      } else {
        toast({ title: 'Payment Failed', description: result.message || 'Could not process credit payment.', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'An error occurred.', variant: 'destructive' });
    } finally {
      setCreditLoading(null);
    }
  };

  const beaconsLinks: Record<number, string> = {
    2: 'https://shop.beacons.ai/vedd/0b05e744-972f-442f-a686-a9ae7698173c',
    3: 'https://shop.beacons.ai/vedd/7a28ca06-c694-4e0b-9f2c-e4b9992cb478',
    4: 'https://shop.beacons.ai/vedd/632403c6-6405-4d93-87c1-6a7785aad428',
  };
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

  const formatPrice = (price: number): string => {
    if (price === 0) return '$0';
    return `$${(price / 100).toFixed(0)}`;
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
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" /> Pay with USD, VEDD tokens, or Ambassador Credits</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" /> Replaces 7+ separate tools</span>
          </div>
          {user && creditBalance > 0 && (
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-sm font-medium">
              <Gift className="h-4 w-4" />
              You have <strong>{creditBalance.toLocaleString()}</strong> ambassador credits — use them to pay for a plan below!
            </div>
          )}
          {user && creditBalance === 0 && (
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/40 border border-border text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Earn ambassador credits by referring traders —
              <a href="/ambassador-training" className="text-primary underline ml-1">Start here</a>
            </div>
          )}
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

        {/* ABBA Feature Highlight Banner */}
        <div className="mb-8 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0a14 0%, #130a0a 100%)', border: '1px solid rgba(220,38,38,0.4)', boxShadow: '0 0 30px rgba(220,38,38,0.08)' }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.06)' }}>
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-bold tracking-widest text-red-400 uppercase">New Feature</span>
          </div>
          <div className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative w-12 h-12 flex-shrink-0">
              <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(135deg, #1a0a0a 0%, #0d0d1a 100%)', border: '1.5px solid rgba(220,38,38,0.5)' }} />
              <div className="absolute rounded-full" style={{ inset: 4, border: '1px solid rgba(220,38,38,0.7)', boxShadow: '0 0 6px rgba(220,38,38,0.5)' }} />
              <div className="absolute rounded-full" style={{ inset: 14, background: 'radial-gradient(circle, #dc2626 0%, #7c3aed 100%)', boxShadow: '0 0 10px rgba(220,38,38,0.9)' }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-black tracking-widest text-lg" style={{ background: 'linear-gradient(90deg, #ef4444, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ABBA</h3>
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">Included in Starter+</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Your personal VEDD AI trading assistant. Monitors live P&L, weekly goal pacing, open positions, and pair strategy — suggests the best entries and protects your gains like a fund manager.</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center flex-shrink-0">
              <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)' }}>
                <p className="text-red-400 font-bold text-sm">Goal AI</p>
                <p className="text-[10px] text-muted-foreground">Auto lot sizing</p>
              </div>
              <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
                <p className="text-purple-400 font-bold text-sm">Live P&L</p>
                <p className="text-[10px] text-muted-foreground">Real-time context</p>
              </div>
              <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <p className="text-emerald-400 font-bold text-sm">NL Plans</p>
                <p className="text-[10px] text-muted-foreground">Voice-style setup</p>
              </div>
            </div>
          </div>
        </div>

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
                        {plan.id === 4 ? '/yr' : '/mo'}
                      </span>
                    )}
                  </div>
                  {plan.id === 4 && (
                    <p className="text-xs text-amber-500 font-medium mb-3">Best value — billed annually</p>
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
                      <a
                        href={beaconsLinks[plan.id] || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full"
                      >
                        <Button
                          className="w-full font-semibold gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          <span>$</span>
                          Pay USD — {formatPrice(plan.price)}{plan.id === 4 ? '/yr' : '/mo'}
                        </Button>
                      </a>
                      {/* VEDD Payment explanation */}
                      <div className="mt-2 p-2.5 rounded-xl bg-amber-500/05 border border-amber-500/15 text-xs">
                        <p className="text-amber-400 font-semibold mb-1">Two ways to pay with VEDD:</p>
                        <div className="space-y-1">
                          <div className="flex items-start gap-1.5">
                            <span className="text-emerald-400 font-bold shrink-0">①</span>
                            <p className="text-gray-400"><strong className="text-white">Earned VEDD (Ambassador)</strong> — 2,000 VEDD tokens earned through platform activities = 1 free month. Use "Redeem Earned VEDD" below.</p>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <span className="text-blue-400 font-bold shrink-0">②</span>
                            <p className="text-gray-400"><strong className="text-white">Bought VEDD (Market)</strong> — Buy VEDD on pump.fun, pay at live market price (~20M VEDD = $50 today, fewer tokens as price grows).</p>
                          </div>
                        </div>
                      </div>
                      <VeddPaymentButton
                        planId={plan.id}
                        planName={plan.name}
                        priceUsd={plan.price / 100}
                      />
                      {/* Ambassador Credits Payment */}
                      {AMBASSADOR_CREDIT_COSTS[plan.id] && (
                        <Button
                          variant="outline"
                          className={`w-full gap-2 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 ${creditBalance >= AMBASSADOR_CREDIT_COSTS[plan.id] ? '' : 'opacity-50'}`}
                          onClick={() => handlePayWithCredits(plan.id)}
                          disabled={creditLoading === plan.id}
                          title={creditBalance < AMBASSADOR_CREDIT_COSTS[plan.id] ? `Need ${AMBASSADOR_CREDIT_COSTS[plan.id].toLocaleString()} credits — you have ${creditBalance.toLocaleString()}` : ''}
                        >
                          {creditLoading === plan.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Gift className="h-4 w-4" />}
                          Pay with Credits — {AMBASSADOR_CREDIT_COSTS[plan.id].toLocaleString()}
                        </Button>
                      )}
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

        {showTable && (
          <p className="text-center text-xs text-muted-foreground -mt-12 mb-16">
            * With your own API key (BYOK), platform AI usage limits don't apply — requests route directly through your account.
          </p>
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
              { tier: 'Elite', tokens: 'VEDD NFT', equiv: 'Yearly', color: 'amber' },
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
                a: 'USD via credit/debit card through our secure checkout, or pay with VEDD tokens from your Solana wallet.',
              },
              {
                q: 'What is the Yearly plan?',
                a: 'An annual subscription that gives you all Premium features at the best price. Renews once a year — all updates included.',
              },
              {
                q: 'How does VEDD token access work?',
                a: 'Connect your Phantom wallet on the login page. If you hold enough VEDD tokens, your tier is detected automatically and access is granted instantly.',
              },
              {
                q: 'Which AI models does the platform use?',
                a: 'GPT-4o, Groq Llama 3.3, Claude 3.5, Gemini 1.5 Pro, and Mistral Large. You can add your own API key or use the platform default.',
              },
            ].map(({ q, a }, i) => (
              <div key={i} className="p-5 rounded-xl border border-border bg-card">
                <p className="font-semibold text-sm mb-1.5">{q}</p>
                <p className="text-sm text-muted-foreground">{a}</p>
              </div>
            ))}
          </div>
        </div>


        <p className="text-center text-xs text-muted-foreground">
          All monthly subscriptions renew automatically. Cancel anytime. ·{' '}
          <a href="/contact" className="text-primary hover:underline">Contact support</a>
        </p>
      </div>
    </div>
  );
}
