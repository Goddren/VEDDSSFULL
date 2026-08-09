import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import VeddLogo from '@/components/ui/vedd-logo';
import { GlobalWalletIndicator } from '@/components/wallet/global-wallet-indicator';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Menu, Bell, User, LogOut, Settings, History, LineChart, CreditCard,
  Award, Users, Newspaper, Wand2, Clock, Briefcase, Zap, HelpCircle, MapPin,
  BookOpen, GraduationCap, FileText, Lightbulb, ChevronDown, MoreHorizontal,
  BarChart3, Webhook, Wallet, Scan, Coins, KeyRound, Rocket, Brain, Shirt,
  Radio, Star, CheckCircle2, AlertTriangle, Loader2, ExternalLink, TrendingUp, Code2, Activity,
  DollarSign, Globe, Search, Shield, Flame, Calculator, Target, Link as LinkIcon, RefreshCcw,
  PowerOff, LayoutDashboard, Copy, Layers, Bot, Server, Heart, Building2, Calendar,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const AI_PROVIDERS = [
  { id: 'openai',      name: 'OpenAI',      placeholder: 'sk-...',              icon: '🤖' },
  { id: 'anthropic',   name: 'Anthropic',   placeholder: 'sk-ant-...',          icon: '🧠' },
  { id: 'google',      name: 'Google AI',   placeholder: 'AIza...',             icon: '💎' },
  { id: 'groq',        name: 'Groq',        placeholder: 'gsk_...',             icon: '⚡' },
  { id: 'mistral',     name: 'Mistral',     placeholder: 'your-mistral-api-key', icon: '🌊' },
  { id: 'elevenlabs',  name: 'ElevenLabs',  placeholder: 'sk_...',              icon: '🎙️' },
];

interface UserApiKey {
  id: number;
  provider: string;
  hasKey: boolean;
  label: string | null;
  isActive: boolean;
  isValid: boolean;
  lastValidated: string | null;
  usageCount: number;
}

const Header: React.FC = () => {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // AI key quick-switch dialog state
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('openai');

  // Position size calculator state
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcBalance, setCalcBalance] = useState('10000');
  const [calcRisk, setCalcRisk] = useState('1');
  const [calcEntry, setCalcEntry] = useState('');
  const [calcSL, setCalcSL] = useState('');
  const [calcPair, setCalcPair] = useState('EURUSD');

  const calcResult = (() => {
    const balance = parseFloat(calcBalance);
    const riskPct = parseFloat(calcRisk);
    const entry   = parseFloat(calcEntry);
    const sl      = parseFloat(calcSL);
    if (!balance || !riskPct || !entry || !sl || entry === sl) return null;
    const dollarRisk = balance * (riskPct / 100);
    const slDist     = Math.abs(entry - sl);
    const pair       = calcPair.toUpperCase().replace('/', '');
    // pip size heuristic
    const pipSize    = pair.includes('JPY') ? 0.01 : pair === 'XAUUSD' ? 0.10 : 0.0001;
    const slPips     = slDist / pipSize;
    // pip value in USD per standard lot (approx)
    const pipValuePerLot = pair.includes('JPY') ? 9.0 : pair === 'XAUUSD' ? 10.0 : 10.0;
    const lots = dollarRisk / (slPips * pipValuePerLot);
    return {
      dollarRisk: dollarRisk.toFixed(2),
      slPips: slPips.toFixed(1),
      lots: Math.max(0.01, Math.round(lots * 100) / 100).toFixed(2),
    };
  })();
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');

  // ── EA Kill Switch ───────────────────────────────────────────────────────
  const [killConfirm, setKillConfirm] = useState(false);

  const { data: forexEngineStatus } = useQuery<any>({
    queryKey: ['/api/vedd-live-engine/status'],
    refetchInterval: 10000,
    enabled: !!user,
  });

  const { data: polyEngineStatus } = useQuery<any>({
    queryKey: ['/api/polymarket-engine/status'],
    refetchInterval: 10000,
    enabled: !!user,
  });

  const killAllMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/trading/kill-all').then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-live-engine/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/polymarket-engine/status'] });
      setKillConfirm(false);
      toast({ title: '🔴 All trading stopped', description: 'Forex EA and Polymarket engine halted. MT5 will receive CLOSE_ALL on next poll.' });
    },
  });

  const forexActive    = forexEngineStatus?.isRunning   ?? false;
  const polyActive     = polyEngineStatus?.isRunning    ?? false;
  const anyTradeActive = forexActive || polyActive;

  // ── AI Keys ─────────────────────────────────────────────────────────────
  // Query user's saved AI keys
  const { data: savedKeys = [] } = useQuery<UserApiKey[]>({
    queryKey: ['/api/user-api-keys'],
    enabled: !!user,
    refetchInterval: 60000,
  });

  // TradeLocker connections for the slide nav
  const { data: tlNavConnections = [] } = useQuery<any[]>({
    queryKey: ['/api/tradelocker/connections'],
    enabled: !!user,
    refetchInterval: 60000,
  });
  const activeTLNavConns = tlNavConnections.filter((c: any) => c.isActive);

  // Options AI Engine connections (Alpaca / TastyTrade / Crypto.com) for the slide nav
  const { data: navAlpacaConns = [] } = useQuery<any[]>({
    queryKey: ['/api/alpaca/connections'], enabled: !!user, refetchInterval: 60000,
  });
  const { data: navTastyConns = [] } = useQuery<any[]>({
    queryKey: ['/api/tastytrade/connections'], enabled: !!user, refetchInterval: 60000,
  });
  const { data: navCryptocomConns = [] } = useQuery<any[]>({
    queryKey: ['/api/cryptocom/connections'], enabled: !!user, refetchInterval: 60000,
  });
  const activeOptionsNavConns = [
    ...navAlpacaConns.filter((c: any) => c.isActive).map((c: any) => ({ ...c, broker: 'Alpaca', label: c.apiKeyId?.slice(0, 8) + '••••', typeLabel: c.accountType })),
    ...navTastyConns.filter((c: any) => c.isActive).map((c: any) => ({ ...c, broker: 'TastyTrade', label: c.username, typeLabel: c.accountType })),
    ...navCryptocomConns.filter((c: any) => c.isActive).map((c: any) => ({ ...c, broker: 'Crypto.com', label: c.apiKey?.slice(0, 8) + '••••', typeLabel: c.instrumentType })),
  ];

  // Live MT5 EA push data for the nav balance display
  const { data: navMt5Data } = useQuery<any>({
    queryKey: ['/api/mt5/account-data'],
    enabled: !!user && mobileMenuOpen,
    refetchInterval: mobileMenuOpen ? 20000 : false,
  });

  // Live balances per TL connection — one call to the background-sync cache
  // (kept fresh server-side like MT5) instead of a network round-trip per account.
  const [tlNavBalances, setTlNavBalances] = useState<Record<number, { balance: number; currency: string; loading: boolean; error?: boolean }>>({});

  const fetchTLNavBalances = async () => {
    setTlNavBalances(prev => {
      const next = { ...prev };
      for (const conn of activeTLNavConns) {
        next[conn.id] = { balance: prev[conn.id]?.balance ?? 0, currency: prev[conn.id]?.currency ?? 'USD', loading: true };
      }
      return next;
    });
    try {
      const res = await fetch('/api/tradelocker/account-data', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const byConnId: Record<number, any> = {};
        for (const a of data?.accounts ?? []) byConnId[a.connectionId] = a;
        setTlNavBalances(prev => {
          const next = { ...prev };
          for (const conn of activeTLNavConns) {
            const live = byConnId[conn.id];
            next[conn.id] = live
              ? { balance: live.balance ?? 0, currency: live.currency ?? 'USD', loading: false, error: !!live.error }
              : { balance: 0, currency: 'USD', loading: false, error: true };
          }
          return next;
        });
        return;
      }
    } catch { /* fall through to error state */ }
    setTlNavBalances(prev => {
      const next = { ...prev };
      for (const conn of activeTLNavConns) {
        next[conn.id] = { balance: 0, currency: 'USD', loading: false, error: true };
      }
      return next;
    });
  };

  // Auto-fetch balances when the slide nav opens, or when connections load after nav is already open
  useEffect(() => {
    if (mobileMenuOpen && activeTLNavConns.length > 0) {
      fetchTLNavBalances();
    }
  }, [mobileMenuOpen, activeTLNavConns.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived key status for the dot indicator
  const activeValidKey = savedKeys.find(k => k.isActive && k.isValid);
  const hasInvalidKey = savedKeys.some(k => !k.isValid && k.hasKey);
  const keyStatus: 'valid' | 'invalid' | 'none' =
    activeValidKey ? 'valid' : hasInvalidKey ? 'invalid' : 'none';

  const dotColor =
    keyStatus === 'valid'   ? 'bg-emerald-400' :
    keyStatus === 'invalid' ? 'bg-red-400' : '';

  const dotTitle =
    keyStatus === 'valid'   ? `Own AI key active (${activeValidKey?.provider})` :
    keyStatus === 'invalid' ? 'Key invalid — click to fix' :
    'No personal AI key — using platform key';

  // Save key mutation
  const saveKeyMutation = useMutation({
    mutationFn: async ({ provider, apiKey, label }: { provider: string; apiKey: string; label: string }) => {
      const res = await apiRequest('POST', '/api/user-api-keys', { provider, apiKey, label });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-api-keys'] });
      setNewKeyValue('');
      setNewKeyLabel('');
      toast({ title: 'Key Saved', description: 'Click Validate to confirm it works.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to save key', variant: 'destructive' });
    },
  });

  // Validate key mutation
  const validateMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await apiRequest('POST', '/api/user-api-keys/validate', { provider });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-api-keys'] });
      if (data.valid) {
        toast({ title: 'Key Valid', description: `${data.provider} key is working.` });
      } else {
        toast({ title: 'Key Invalid', description: `Check your ${data.provider} key.`, variant: 'destructive' });
      }
    },
    onError: (err: any) => {
      toast({ title: 'Validation Error', description: err.message, variant: 'destructive' });
    },
  });

  // Primary nav items shown directly in header — the major trading sections
  const primaryNavItems = [
    { name: 'Dashboard', path: '/dashboard', active: location === '/dashboard', icon: <LayoutDashboard className="h-4 w-4 mr-2" /> },
    { name: 'AI SS Engine (FX)', path: '/weekly-strategy', active: location === '/weekly-strategy', icon: <Rocket className="h-4 w-4 mr-2" /> },
    { name: 'Options AI Engine', path: '/options-engine', active: location === '/options-engine', icon: <TrendingUp className="h-4 w-4 mr-2" /> },
    { name: 'ORB Breakout', path: '/orb-breakout', active: location === '/orb-breakout', icon: <Target className="h-4 w-4 mr-2" /> },
    { name: 'Ruin Cone', path: '/ruin-cone', active: location === '/ruin-cone', icon: <Activity className="h-4 w-4 mr-2" /> },
    { name: 'Kalshi Hub', path: '/kalshi', active: location === '/kalshi', icon: <TrendingUp className="h-4 w-4 mr-2" /> },
    { name: 'Kalshi Brain', path: '/kalshi-brain', active: location === '/kalshi-brain', icon: <Brain className="h-4 w-4 mr-2" /> },
    { name: 'ABBA', path: '/abba', active: location === '/abba', icon: <Brain className="h-4 w-4 mr-2" /> },
    { name: 'Analysis', path: '/analysis', active: location === '/analysis', icon: <LineChart className="h-4 w-4 mr-2" /> },
    { name: 'Predictions', path: '/polymarket-engine', active: location === '/polymarket-engine', icon: <DollarSign className="h-4 w-4 mr-2" /> },
    { name: 'TradeLocker', path: '/webhooks#tradelocker', active: location === '/webhooks', icon: <LinkIcon className="h-4 w-4 mr-2" /> },
  ];

  // Secondary nav items shown in "More" dropdown
  const moreNavItems = [
    { name: 'Copy Trading', path: '/copy-trading', active: location === '/copy-trading', icon: <Copy className="h-4 w-4 mr-2" /> },
    { name: 'Activity Hub', path: '/activity', active: location === '/activity', icon: <Flame className="h-4 w-4 mr-2" /> },
    { name: 'Multi-TF EA', path: '/multi-timeframe', active: location === '/multi-timeframe', icon: <Clock className="h-4 w-4 mr-2" /> },
    { name: 'My EAs', path: '/my-eas', active: location === '/my-eas', icon: <Briefcase className="h-4 w-4 mr-2" /> },
    { name: 'Marketplace', path: '/ea-marketplace', active: location === '/ea-marketplace', icon: <Zap className="h-4 w-4 mr-2" /> },
    { name: 'Brain Marketplace', path: '/brain-marketplace', active: location === '/brain-marketplace', icon: <Brain className="h-4 w-4 mr-2" /> },
    { name: 'Live Monitor', path: '/live-monitor', active: location === '/live-monitor', icon: <Radio className="h-4 w-4 mr-2" /> },
    { name: 'Futures Engine', path: '/futures-engine', active: location === '/futures-engine' || location === '/futures-connect' || location === '/futures-live-feed', icon: <TrendingUp className="h-4 w-4 mr-2" /> },
    { name: 'Futures EA Gen', path: '/futures-ea-generator', active: location === '/futures-ea-generator', icon: <Code2 className="h-4 w-4 mr-2" /> },
    { name: 'Crypto.com AI Engine', path: '/crypto-engine', active: location === '/crypto-engine', icon: <Coins className="h-4 w-4 mr-2" /> },
    { name: 'My Certifications', path: '/certifications', active: location === '/certifications', icon: <Award className="h-4 w-4 mr-2" /> },
    { name: 'Local Outreach', path: '/ambassador/local-outreach', active: location === '/ambassador/local-outreach', icon: <MapPin className="h-4 w-4 mr-2" /> },
    { name: 'Prop Firm Setup Event', path: '/ambassador/propfirm-event', active: location === '/ambassador/propfirm-event', icon: <Rocket className="h-4 w-4 mr-2" /> },
    { name: 'Solana Scanner', path: '/solana-scanner', active: location === '/solana-scanner', icon: <Scan className="h-4 w-4 mr-2" /> },
    { name: 'VEDD Tokenomics', path: '/vedd-tokenomics', active: location === '/vedd-tokenomics', icon: <Coins className="h-4 w-4 mr-2" /> },
    { name: 'VEDD Clothing', path: '/vedd-clothing', active: location === '/vedd-clothing', icon: <Shirt className="h-4 w-4 mr-2" /> },
    { name: 'MT5 Chart Data', path: '/mt5-chart-data', active: location === '/mt5-chart-data', icon: <BarChart3 className="h-4 w-4 mr-2" /> },
    { name: 'Webhooks', path: '/webhooks', active: location === '/webhooks', icon: <Webhook className="h-4 w-4 mr-2" /> },
    { name: 'What If Analysis', path: '/what-if', active: location === '/what-if', icon: <Lightbulb className="h-4 w-4 mr-2" /> },
    { name: 'Historical', path: '/historical', active: location === '/historical', icon: <History className="h-4 w-4 mr-2" /> },
    { name: 'Community', path: '/community', active: location === '/community', icon: <Users className="h-4 w-4 mr-2" /> },
    { name: 'Blog', path: '/blog', active: location === '/blog', icon: <Newspaper className="h-4 w-4 mr-2" /> },
    { name: 'Achievements', path: '/achievements', active: location === '/achievements', icon: <Award className="h-4 w-4 mr-2" /> },
    { name: 'Pricing', path: '/subscription', active: location === '/subscription', icon: <CreditCard className="h-4 w-4 mr-2" /> },
    { name: 'Support', path: '/support', active: location === '/support', icon: <HelpCircle className="h-4 w-4 mr-2" /> },
    { name: 'Settings', path: '/profile', active: location === '/profile', icon: <Settings className="h-4 w-4 mr-2" /> },
    // ── Previously only reachable via the mobile nav or a typed-in URL —
    // every real page in App.tsx now has a clickable path from the desktop
    // "More" menu too, so nothing on the website is URL-only.
    { name: 'Devotional', path: '/devotional', active: location === '/devotional', icon: <Heart className="h-4 w-4 mr-2" /> },
    { name: 'Paper Trades', path: '/paper-trades', active: location === '/paper-trades', icon: <BookOpen className="h-4 w-4 mr-2" /> },
    { name: 'Content Studio', path: '/ambassador/content-studio', active: location === '/ambassador/content-studio', icon: <Zap className="h-4 w-4 mr-2" /> },
    { name: 'Content Flow', path: '/ambassador/content-flow', active: location === '/ambassador/content-flow', icon: <Calendar className="h-4 w-4 mr-2" /> },
    { name: 'Sales Script', path: '/ambassador/sales-script', active: location === '/ambassador/sales-script', icon: <FileText className="h-4 w-4 mr-2" /> },
    { name: 'Training Calendar', path: '/training-calendar', active: location === '/training-calendar', icon: <Calendar className="h-4 w-4 mr-2" /> },
    { name: 'Event Host Kit', path: '/event-kit', active: location === '/event-kit', icon: <FileText className="h-4 w-4 mr-2" /> },
    { name: 'Host Dashboard', path: '/host-dashboard', active: location === '/host-dashboard', icon: <Award className="h-4 w-4 mr-2" /> },
    { name: 'Streak Tracker', path: '/streak', active: location === '/streak', icon: <Flame className="h-4 w-4 mr-2" /> },
    { name: '7-8 Profit Paths', path: '/seven-eight', active: location === '/seven-eight', icon: <Star className="h-4 w-4 mr-2" /> },
    { name: 'Strategy Wizard', path: '/strategy-wizard', active: location === '/strategy-wizard', icon: <Wand2 className="h-4 w-4 mr-2" /> },
    { name: 'Market Insights', path: '/market-insights', active: location === '/market-insights', icon: <Newspaper className="h-4 w-4 mr-2" /> },
    { name: 'Market Sentiment', path: '/market-sentiment', active: location === '/market-sentiment', icon: <TrendingUp className="h-4 w-4 mr-2" /> },
    { name: 'Market Mood', path: '/market-mood', active: location === '/market-mood', icon: <Activity className="h-4 w-4 mr-2" /> },
    { name: 'Market Trend Game', path: '/market-trend-game', active: location === '/market-trend-game', icon: <Target className="h-4 w-4 mr-2" /> },
    { name: 'SOL Scanner', path: '/sol-scanner', active: location === '/sol-scanner', icon: <Scan className="h-4 w-4 mr-2" /> },
    { name: 'SOL Scanner Trades', path: '/sol-scanner/trades', active: location === '/sol-scanner/trades', icon: <Scan className="h-4 w-4 mr-2" /> },
    { name: 'Workforce Academy', path: '/workforce-academy', active: location === '/workforce-academy', icon: <GraduationCap className="h-4 w-4 mr-2" /> },
    { name: 'Ecosystem Hub', path: '/vedd-ecosystem', active: location === '/vedd-ecosystem', icon: <Building2 className="h-4 w-4 mr-2" /> },
    { name: 'Community Impact', path: '/community-impact', active: location === '/community-impact', icon: <Users className="h-4 w-4 mr-2" /> },
    { name: 'Impact Dashboard', path: '/impact-dashboard', active: location === '/impact-dashboard', icon: <BarChart3 className="h-4 w-4 mr-2" /> },
    { name: 'AI Governance', path: '/ai-governance', active: location === '/ai-governance', icon: <Shield className="h-4 w-4 mr-2" /> },
    { name: 'Innovation Lab', path: '/innovation-lab', active: location === '/innovation-lab', icon: <Lightbulb className="h-4 w-4 mr-2" /> },
    { name: 'Compliance', path: '/compliance', active: location === '/compliance', icon: <Shield className="h-4 w-4 mr-2" /> },
    { name: 'Credit Builder', path: '/credit-builder', active: location === '/credit-builder', icon: <Award className="h-4 w-4 mr-2" /> },
    { name: 'Biz Credit Builder', path: '/biz-builder', active: location === '/biz-builder', icon: <Building2 className="h-4 w-4 mr-2" /> },
    { name: 'My Wallet', path: '/my-wallet', active: location === '/my-wallet', icon: <Wallet className="h-4 w-4 mr-2" /> },
    { name: 'Polymarket Wallet', path: '/polymarket-wallet', active: location === '/polymarket-wallet', icon: <Wallet className="h-4 w-4 mr-2" /> },
    { name: 'My Subscriptions', path: '/my-subscriptions', active: location === '/my-subscriptions', icon: <CreditCard className="h-4 w-4 mr-2" /> },
    { name: 'Alerts', path: '/mobile-alerts', active: location === '/mobile-alerts', icon: <Bell className="h-4 w-4 mr-2" /> },
    { name: 'Notification Settings', path: '/notification-settings', active: location === '/notification-settings', icon: <Bell className="h-4 w-4 mr-2" /> },
  ];

  const navItems = [...primaryNavItems, ...moreNavItems];

  const getUserInitials = () => {
    if (!user) return '?';
    if (user.fullName) {
      return user.fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2);
    }
    return user.username.substring(0, 2).toUpperCase();
  };

  const handleLogout = () => {
    logoutMutation.mutate();
    setMobileMenuOpen(false);
  };

  const handleMobileNavClick = () => {
    setMobileMenuOpen(false);
  };

  const providerInfo = AI_PROVIDERS.find(p => p.id === selectedProvider);
  const existingKey = savedKeys.find(k => k.provider === selectedProvider);

  return (
    <>
      <header className="w-full frosted-nav border-b py-3 px-4 md:px-8 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center gap-2">
              <VeddLogo height={36} />
              <span className="text-grad-red font-black text-xl tracking-tight">VEDD</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center space-x-1 lg:space-x-2 smart-card px-3 py-1.5">
            {primaryNavItems.map(item => (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => {
                  const [basePath, hash] = item.path.split('#');
                  if (location === basePath) {
                    // Already on this page → jump to the anchored section, or the top
                    if (hash) {
                      setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                    } else {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }
                }}
                className={`rounded-2xl px-3 py-1.5 text-sm font-medium transition-all ${item.active ? 'bg-red-500/10 text-red-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                {item.name}
              </Link>
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white rounded-2xl hover:bg-white/5">
                  <MoreHorizontal className="h-4 w-4 mr-1" />
                  More
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56 max-h-[75vh] overflow-y-auto">
                {/* Quick Access — Prop Firm shortcuts */}
                <DropdownMenuLabel className="text-[10px] text-gray-500 uppercase tracking-wider py-1">Quick Access</DropdownMenuLabel>
                <DropdownMenuItem className="cursor-pointer" asChild>
                  <Link href="/prop-firm-challenge">
                    <div className="flex items-center w-full text-violet-400 font-medium">
                      <Shield className="h-4 w-4 mr-2" />
                      <span>Prop Firm Dashboard</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" asChild>
                  <Link href="/prop-firm-challenge#trading-mode">
                    <div className="flex items-center w-full text-cyan-400 font-medium">
                      <Layers className="h-4 w-4 mr-2" />
                      <span>Trading Mode (AI/EA)</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" asChild>
                  <Link href="/prop-firm-challenge#brain">
                    <div className="flex items-center w-full text-violet-400 font-medium">
                      <Brain className="h-4 w-4 mr-2" />
                      <span>Brain Intelligence</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Position Size Calculator — quick access shortcut */}
                <DropdownMenuItem className="cursor-pointer text-cyan-400" onClick={() => setCalcOpen(true)}>
                  <div className="flex items-center w-full font-medium">
                    <Calculator className="h-4 w-4 mr-2" />
                    <span>Position Calc</span>
                  </div>
                </DropdownMenuItem>
                {/* TradeLocker Accounts shortcut */}
                {activeTLNavConns.length > 0 ? (
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href="/webhooks#tradelocker">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center text-cyan-400">
                          <LinkIcon className="h-4 w-4 mr-2" />
                          <span className="font-medium">TradeLocker</span>
                        </div>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 rounded-full px-1.5 py-0.5 font-semibold shrink-0">
                          {activeTLNavConns.length} acct{activeTLNavConns.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href="/webhooks#tradelocker">
                      <div className="flex items-center text-cyan-400/60 w-full">
                        <LinkIcon className="h-4 w-4 mr-2" />
                        <span>Connect TradeLocker</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {moreNavItems.map(item => (
                  <DropdownMenuItem key={item.path} asChild className="cursor-pointer">
                    <Link href={item.path}>
                      <div className={`flex items-center w-full ${item.active ? 'text-red-400 font-medium' : ''}`}>
                        {item.icon}
                        <span>{item.name}</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center space-x-2 md:space-x-3">
            <div className="hidden md:flex items-center gap-2">
              <Link href="/user-guide">
                <span
                  className="text-xs font-medium rounded-xl px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/15 transition-all cursor-pointer inline-flex items-center gap-1"
                  data-testid="button-user-guide"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Guide
                </span>
              </Link>
              <Link href="/ambassador-training">
                <span
                  className="text-xs font-medium rounded-xl px-3 py-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15 transition-all cursor-pointer inline-flex items-center gap-1"
                  data-testid="button-ambassador"
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  Ambassador
                </span>
              </Link>
              {user && (
                <Link href="/micro-growth">
                  <span className="text-xs font-medium rounded-xl px-3 py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15 transition-all cursor-pointer inline-flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Micro Growth
                  </span>
                </Link>
              )}
              {(user?.isAmbassador || user?.isAdmin) && (
                <div className="flex items-center gap-1">
                  <Link href="/token-investments">
                    <span className="text-xs font-medium rounded-xl px-3 py-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15 transition-all cursor-pointer inline-flex items-center gap-1">
                      <Coins className="h-3.5 w-3.5" />
                      Invest
                    </span>
                  </Link>
                  <Link href="/referral">
                    <span className="text-xs font-medium rounded-xl px-3 py-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15 transition-all cursor-pointer inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      Referral
                    </span>
                  </Link>
                  <Link href="/grants">
                    <span className="text-xs font-medium rounded-xl px-3 py-1.5 bg-green-500/10 text-green-400 hover:bg-green-500/15 transition-all cursor-pointer inline-flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5" />
                      Grants
                    </span>
                  </Link>
                </div>
              )}
            </div>

            {/* ── EA Kill Switch (desktop) ── */}
            {user && !killConfirm && (
              <button
                onClick={() => setKillConfirm(true)}
                title={anyTradeActive ? 'Trading engines active — click to stop all' : 'No trading engines running'}
                className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  anyTradeActive
                    ? 'bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25'
                    : 'bg-gray-800/60 border border-gray-700/50 text-gray-500 hover:text-gray-300'
                }`}
              >
                {anyTradeActive && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
                <PowerOff className="h-3.5 w-3.5" />
                {anyTradeActive ? 'LIVE' : 'OFF'}
              </button>
            )}
            {user && killConfirm && (
              <div className="hidden md:flex items-center gap-1.5">
                <span className="text-xs text-red-300 font-semibold">Stop all trading?</span>
                <button
                  onClick={() => killAllMutation.mutate()}
                  disabled={killAllMutation.isPending}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-red-600/80 hover:bg-red-600 text-white border border-red-500 transition-all"
                >
                  {killAllMutation.isPending ? '...' : 'YES, STOP'}
                </button>
                <button
                  onClick={() => setKillConfirm(false)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-gray-800 text-gray-400 border border-gray-700 hover:text-white transition-all"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Global Solana wallet indicator — shows for all users */}
            <GlobalWalletIndicator />

            <ThemeToggle />

            <Button variant="ghost" size="icon" className="rounded-full">
              <Bell className="h-5 w-5" />
            </Button>

            {/* Avatar + AI key status dot */}
            <div className="flex items-center gap-1.5">
              {/* AI key status dot — always visible, opens key dialog */}
              {user && (
                <button
                  onClick={() => setKeyDialogOpen(true)}
                  title={dotTitle}
                  className="relative flex-shrink-0 p-0.5"
                >
                  <span className={`block w-2.5 h-2.5 rounded-full ring-2 ring-background ${
                    keyStatus === 'valid'   ? 'bg-emerald-400 animate-pulse' :
                    keyStatus === 'invalid' ? 'bg-red-400 animate-pulse' :
                    'bg-gray-400'
                  }`} />
                </button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="relative cursor-pointer">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.profileImage || ''} alt={user?.username || 'User'} />
                      <AvatarFallback className="icon-box-sm icon-box-red text-xs font-bold">{getUserInitials()}</AvatarFallback>
                    </Avatar>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.fullName || user?.username}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href="/profile">
                      <div className="flex items-center w-full">
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href="/vedd-wallet">
                      <div className="flex items-center w-full">
                        <Wallet className="mr-2 h-4 w-4" />
                        <span>VEDD Wallet</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href="/achievements">
                      <div className="flex items-center w-full">
                        <Award className="mr-2 h-4 w-4" />
                        <span>Achievements</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href="/social-hub">
                      <div className="flex items-center w-full">
                        <Users className="mr-2 h-4 w-4" />
                        <span>Social Hub</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href="/ai-api-keys">
                      <div className="flex items-center w-full">
                        <KeyRound className="mr-2 h-4 w-4" />
                        <span>AI API Keys</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href="/ai-trading-models">
                      <div className="flex items-center w-full">
                        <Brain className="mr-2 h-4 w-4" />
                        <span>AI Trading Models</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => { window.dispatchEvent(new CustomEvent('vedd:replay-tutorial')); }}
                  >
                    <Star className="mr-2 h-4 w-4" />
                    <span>Getting Started Tour</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href="/user-guide">
                      <div className="flex items-center w-full">
                        <BookOpen className="mr-2 h-4 w-4" />
                        <span>User Guide</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href="/ambassador-training">
                      <div className="flex items-center w-full">
                        <GraduationCap className="mr-2 h-4 w-4" />
                        <span>Ambassador Program</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href="/ambassador/free-path">
                      <div className="flex items-center w-full text-emerald-400">
                        <Rocket className="mr-2 h-4 w-4" />
                        <span>Free Path to Pro</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  {(user?.isAmbassador || user?.isAdmin) && (
                    <>
                      <DropdownMenuItem className="cursor-pointer" asChild>
                        <Link href="/token-investments">
                          <div className="flex items-center w-full text-amber-400">
                            <Coins className="mr-2 h-4 w-4" />
                            <span>Token Investments</span>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer" asChild>
                        <Link href="/referral">
                          <div className="flex items-center w-full text-amber-400">
                            <Users className="mr-2 h-4 w-4" />
                            <span>Referral Hub</span>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer" asChild>
                        <Link href="/ambassador/recruitment">
                          <div className="flex items-center w-full text-blue-400">
                            <GraduationCap className="mr-2 h-4 w-4" />
                            <span>Recruit Ambassadors</span>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer" asChild>
                        <Link href="/ambassador/recruitment?tab=leadpages">
                          <div className="flex items-center w-full text-purple-400">
                            <Globe className="mr-2 h-4 w-4" />
                            <span>My Lead Page</span>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer" asChild>
                        <Link href="/ambassador/recruitment?tab=social">
                          <div className="flex items-center w-full text-pink-400">
                            <Search className="mr-2 h-4 w-4" />
                            <span>Social Scanner</span>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer" asChild>
                        <Link href="/lead-hunter">
                          <div className="flex items-center w-full text-yellow-400">
                            <Target className="mr-2 h-4 w-4" />
                            <span>Lead Hunter</span>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer" asChild>
                        <Link href="/ambassador-prime">
                          <div className="flex items-center w-full text-orange-400">
                            <Zap className="mr-2 h-4 w-4" />
                            <span>Ambassador Prime</span>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer" asChild>
                        <Link href="/grants">
                          <div className="flex items-center w-full text-green-400">
                            <DollarSign className="mr-2 h-4 w-4" />
                            <span>Grants & Funding</span>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  {user?.isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="cursor-pointer" asChild>
                        <Link href="/admin">
                          <div className="flex items-center w-full text-red-400">
                            <Shield className="mr-2 h-4 w-4" />
                            <span>Admin Command Center</span>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden rounded"
                  data-testid="mobile-menu-button"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <div className="flex flex-col gap-6 mt-10">

                  {/* ── Open in Phantom — deep-link into Phantom's in-app browser (hidden when already inside Phantom) ── */}
                  {typeof navigator !== 'undefined' && !/Phantom/i.test(navigator.userAgent) && !(window as any).__phantom__ && (
                    <a
                      href={`https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.origin)}`}
                      className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl bg-red-600 hover:bg-red-600/90 border border-red-500 text-white transition-all active:scale-95"
                    >
                      <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-red-500/30">
                        <ExternalLink className="h-4 w-4" />
                      </span>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-bold">Open in Phantom</p>
                        <p className="text-[10px] text-white/70 mt-0.5">Launch this site in Phantom's browser</p>
                      </div>
                    </a>
                  )}

                  {/* ── EA Kill Switch (mobile sheet) ── */}
                  {!killConfirm ? (
                    <button
                      onClick={() => setKillConfirm(true)}
                      className={`flex items-center gap-3 w-full px-4 py-3 rounded-2xl transition-all active:scale-95 ${
                        anyTradeActive
                          ? 'bg-red-500/15 border border-red-500/45 text-red-400'
                          : 'bg-gray-800/50 border border-gray-700/50 text-gray-500'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${anyTradeActive ? 'bg-red-500/25' : 'bg-gray-700/50'}`}>
                        <PowerOff className="h-4 w-4" />
                      </span>
                      <div className="flex-1 text-left">
                        <p className={`text-sm font-bold ${anyTradeActive ? 'text-red-300' : 'text-gray-400'}`}>
                          {anyTradeActive ? '● TRADING ACTIVE' : 'All Trading OFF'}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {anyTradeActive
                            ? `${forexActive ? 'Forex EA' : ''}${forexActive && polyActive ? ' + ' : ''}${polyActive ? 'Polymarket' : ''} running — tap to stop`
                            : 'No engines running'}
                        </p>
                      </div>
                      {anyTradeActive && <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />}
                    </button>
                  ) : (
                    <div className="rounded-2xl p-3 bg-red-500/15 border border-red-500/50">
                      <p className="text-sm font-bold text-red-300 mb-1 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> Stop ALL trading engines?
                      </p>
                      <p className="text-[10px] text-red-300/60 mb-3">Forex EA + Polymarket engine will stop. MT5 receives CLOSE_ALL on next poll.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => killAllMutation.mutate()}
                          disabled={killAllMutation.isPending}
                          className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-red-600/80 border border-red-500"
                        >
                          {killAllMutation.isPending ? 'Stopping...' : '🔴 STOP ALL'}
                        </button>
                        <button
                          onClick={() => setKillConfirm(false)}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold text-gray-300 bg-gray-800 border border-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {navItems.map(item => (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={handleMobileNavClick}
                      className={`text-lg font-medium transition-colors flex items-center ${item.active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                      data-testid={`mobile-nav-${item.path.substring(1)}`}
                    >
                      {item.icon}
                      {item.name}
                    </Link>
                  ))}
                  <Link
                    href="/profile"
                    onClick={handleMobileNavClick}
                    className={`text-lg font-medium transition-colors flex items-center ${location === '/profile' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    data-testid="mobile-nav-profile"
                  >
                    <User className="h-4 w-4 mr-2" />
                    Profile
                  </Link>
                  <Link
                    href="/vedd-wallet"
                    onClick={handleMobileNavClick}
                    className={`text-lg font-medium transition-colors flex items-center ${location === '/vedd-wallet' ? 'text-purple-500' : 'text-purple-400 hover:text-purple-300'}`}
                    data-testid="mobile-nav-vedd-wallet"
                  >
                    <Wallet className="h-4 w-4 mr-2" />
                    VEDD Wallet
                  </Link>
                  {/* Position Size Calculator — mobile shortcut */}
                  <button
                    onClick={() => { setMobileMenuOpen(false); setCalcOpen(true); }}
                    className="text-lg font-medium transition-colors flex items-center text-left gap-2 text-cyan-400 hover:text-cyan-300"
                  >
                    <Calculator className="h-4 w-4" />
                    Position Size Calc
                  </button>

                  {/* Mobile AI key quick access — just the dot button */}
                  <button
                    onClick={() => { setMobileMenuOpen(false); setKeyDialogOpen(true); }}
                    className="text-lg font-medium transition-colors flex items-center text-left gap-2 text-muted-foreground hover:text-foreground"
                  >
                    <span className={`block w-2.5 h-2.5 rounded-full shrink-0 ${
                      keyStatus === 'valid'   ? 'bg-emerald-400 animate-pulse' :
                      keyStatus === 'invalid' ? 'bg-red-400 animate-pulse' :
                      'bg-gray-400'
                    }`} />
                    AI Keys
                  </button>
                  <div className="border-t border-gray-700 my-2 pt-2">
                    <Link
                      href="/user-guide"
                      onClick={handleMobileNavClick}
                      className={`text-lg font-medium transition-colors flex items-center ${location === '/user-guide' ? 'text-blue-500' : 'text-blue-400 hover:text-blue-300'}`}
                      data-testid="mobile-nav-user-guide"
                    >
                      <BookOpen className="h-4 w-4 mr-2" />
                      User Guide
                    </Link>
                  </div>
                  <Link
                    href="/ambassador-training"
                    onClick={handleMobileNavClick}
                    className={`text-lg font-medium transition-colors flex items-center ${location === '/ambassador-training' ? 'text-amber-500' : 'text-amber-400 hover:text-amber-300'}`}
                    data-testid="mobile-nav-ambassador"
                  >
                    <GraduationCap className="h-4 w-4 mr-2" />
                    Ambassador Program
                  </Link>
                  {(user?.isAmbassador || user?.isAdmin) && (
                    <>
                      <Link
                        href="/token-investments"
                        onClick={handleMobileNavClick}
                        className={`text-lg font-medium transition-colors flex items-center ${location === '/token-investments' ? 'text-amber-400' : 'text-amber-500 hover:text-amber-400'}`}
                      >
                        <Coins className="h-4 w-4 mr-2" />
                        Token Investments
                      </Link>
                      <Link
                        href="/referral"
                        onClick={handleMobileNavClick}
                        className={`text-lg font-medium transition-colors flex items-center ${location === '/referral' ? 'text-amber-400' : 'text-amber-500 hover:text-amber-400'}`}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Referral Hub
                      </Link>
                      <Link
                        href="/ambassador/recruitment"
                        onClick={handleMobileNavClick}
                        className={`text-lg font-medium transition-colors flex items-center ${location === '/ambassador/recruitment' ? 'text-blue-400' : 'text-blue-500 hover:text-blue-400'}`}
                      >
                        <GraduationCap className="h-4 w-4 mr-2" />
                        Recruit Ambassadors
                      </Link>
                      <Link
                        href="/ambassador/recruitment?tab=leadpages"
                        onClick={handleMobileNavClick}
                        className="text-lg font-medium transition-colors flex items-center text-purple-500 hover:text-purple-400"
                      >
                        <Globe className="h-4 w-4 mr-2" />
                        My Lead Page
                      </Link>
                      <Link
                        href="/ambassador/recruitment?tab=social"
                        onClick={handleMobileNavClick}
                        className="text-lg font-medium transition-colors flex items-center text-pink-500 hover:text-pink-400"
                      >
                        <Search className="h-4 w-4 mr-2" />
                        Social Scanner
                      </Link>
                      <Link
                        href="/grants"
                        onClick={handleMobileNavClick}
                        className={`text-lg font-medium transition-colors flex items-center ${location === '/grants' ? 'text-green-400' : 'text-green-500 hover:text-green-400'}`}
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Grants & Funding
                      </Link>
                    </>
                  )}
                  {user?.isAdmin && (
                    <>
                      <Link
                        href="/admin"
                        onClick={handleMobileNavClick}
                        className="text-lg font-medium transition-colors flex items-center text-red-400 hover:text-red-300"
                      >
                        <Shield className="h-4 w-4 mr-2" />
                        Admin Command Center
                      </Link>
                    </>
                  )}
                  {/* ── MT5 Live Account ─────────────────────────── */}
                  {navMt5Data?.accounts?.length > 0 && navMt5Data.accounts.some((a: any) => a.connected) && (
                    <div className="border-t border-gray-700 pt-3 mt-1">
                      <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                        MT5 Live Account
                      </span>
                      <div className="space-y-2 mb-2">
                        {navMt5Data.accounts.filter((a: any) => a.connected).map((a: any, i: number) => (
                          <div key={i} className="bg-gray-800/60 border border-indigo-700/25 rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm text-white font-medium truncate">{a.accountName || a.broker || 'MT5'}</p>
                                <p className="text-[10px] text-gray-500">#{a.accountNumber} · {a.server}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-bold font-mono text-indigo-300">{a.currency} {(a.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                {a.equity !== a.balance && <p className="text-[10px] text-gray-500">Eq: {(a.equity ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── TradeLocker Accounts ─────────────────────── */}
                  {activeTLNavConns.length > 0 && (
                    <div className="border-t border-gray-700 pt-3 mt-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                          <LinkIcon className="h-3 w-3" />
                          TradeLocker Accounts
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); fetchTLNavBalances(); }}
                          className="text-gray-500 hover:text-gray-300 p-0.5"
                          title="Refresh balances"
                        >
                          <RefreshCcw className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="space-y-2 mb-3">
                        {activeTLNavConns.map((conn: any) => {
                          const bal = tlNavBalances[conn.id];
                          return (
                            <div key={conn.id} className="bg-gray-800/60 border border-cyan-700/25 rounded-lg px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm text-white font-medium truncate">{conn.email}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${conn.accountType === 'live' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                      {conn.accountType?.toUpperCase()}
                                    </span>
                                    {conn.serverId && <span className="text-[10px] text-gray-500">{conn.serverId}</span>}
                                    {conn.lotMultiplier && conn.lotMultiplier !== 1 && (
                                      <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${conn.lotMultiplier > 1 ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>
                                        ×{conn.lotMultiplier}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  {bal?.loading ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500 ml-auto" />
                                  ) : bal?.error ? (
                                    <span className="text-[11px] text-gray-500">—</span>
                                  ) : bal ? (
                                    <p className="text-sm font-bold font-mono text-emerald-400">
                                      {bal.currency} {bal.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                  ) : (
                                    <span className="text-[11px] text-gray-500">Loading…</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <Link
                        href="/webhooks#tradelocker"
                        onClick={handleMobileNavClick}
                        className="text-sm font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5"
                      >
                        <Webhook className="h-3.5 w-3.5" />
                        Manage TradeLocker Accounts
                      </Link>
                    </div>
                  )}
                  {activeTLNavConns.length === 0 && (
                    <div className="border-t border-gray-700 pt-3 mt-1">
                      <Link
                        href="/webhooks#tradelocker"
                        onClick={handleMobileNavClick}
                        className="text-base font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-2"
                      >
                        <LinkIcon className="h-4 w-4" />
                        Connect TradeLocker
                      </Link>
                    </div>
                  )}

                  {/* ── Options AI Engine Accounts ─────────────────────── */}
                  {activeOptionsNavConns.length > 0 && (
                    <div className="border-t border-gray-700 pt-3 mt-1">
                      <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                        <TrendingUp className="h-3 w-3" />
                        Options Engine Accounts
                      </span>
                      <div className="space-y-2 mb-3">
                        {activeOptionsNavConns.map((conn: any) => (
                          <div key={`${conn.broker}-${conn.id}`} className="bg-gray-800/60 border border-emerald-700/25 rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm text-white font-medium truncate">{conn.label}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{conn.broker}</span>
                                  <span className="text-[10px] text-gray-500 uppercase">{conn.typeLabel}</span>
                                </div>
                              </div>
                              {conn.lastError ? (
                                <span className="text-[11px] text-red-400 shrink-0">Error</span>
                              ) : conn.lastConnectedAt ? (
                                <span className="text-[11px] text-emerald-400 shrink-0">● Live</span>
                              ) : (
                                <span className="text-[11px] text-gray-500 shrink-0">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <Link
                        href="/options-engine"
                        onClick={handleMobileNavClick}
                        className="text-sm font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5"
                      >
                        <TrendingUp className="h-3.5 w-3.5" />
                        Manage Options Engine
                      </Link>
                    </div>
                  )}
                  {activeOptionsNavConns.length === 0 && (
                    <div className="border-t border-gray-700 pt-3 mt-1">
                      <Link
                        href="/options-engine"
                        onClick={handleMobileNavClick}
                        className="text-base font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-2"
                      >
                        <TrendingUp className="h-4 w-4" />
                        Connect Options Engine
                      </Link>
                    </div>
                  )}

                  <button
                    onClick={handleLogout}
                    className="text-lg font-medium transition-colors flex items-center text-muted-foreground hover:text-foreground text-left"
                    data-testid="mobile-nav-logout"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Log out
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* AI Key Quick-Switch Dialog */}
      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              AI Key Manager
            </DialogTitle>
          </DialogHeader>

          {/* Current status summary */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
            keyStatus === 'valid'   ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400' :
            keyStatus === 'invalid' ? 'bg-red-500/10 border border-red-500/25 text-red-400' :
            'bg-muted border text-muted-foreground'
          }`}>
            {keyStatus === 'valid'   && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {keyStatus === 'invalid' && <AlertTriangle className="h-4 w-4 shrink-0" />}
            {keyStatus === 'none'    && <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>
              {keyStatus === 'valid'
                ? `${activeValidKey?.provider} key is active and working`
                : keyStatus === 'invalid'
                ? 'Your key failed — paste a new one below'
                : 'No personal key — platform key in use'}
            </span>
          </div>

          {/* Saved keys list */}
          {savedKeys.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Saved Keys</p>
              {savedKeys.map(k => {
                const pInfo = AI_PROVIDERS.find(p => p.id === k.provider);
                return (
                  <div key={k.provider} className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/50 text-sm">
                    <span className="flex items-center gap-1.5">
                      <span>{pInfo?.icon}</span>
                      <span className="font-medium capitalize">{k.provider}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {k.isValid
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        : <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2"
                        disabled={validateMutation.isPending}
                        onClick={() => validateMutation.mutate(k.provider)}
                      >
                        {validateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Test'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add / replace key form */}
          <div className="space-y-3 pt-1 border-t">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Add or Replace Key</p>
            <div className="space-y-1">
              <Label className="text-xs">Provider</Label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">API Key</Label>
              <Input
                type="password"
                placeholder={providerInfo?.placeholder || 'Paste your key...'}
                value={newKeyValue}
                onChange={e => setNewKeyValue(e.target.value)}
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label (optional)</Label>
              <Input
                placeholder="e.g. My personal key"
                value={newKeyLabel}
                onChange={e => setNewKeyLabel(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              disabled={!newKeyValue.trim() || saveKeyMutation.isPending}
              onClick={() => saveKeyMutation.mutate({ provider: selectedProvider, apiKey: newKeyValue.trim(), label: newKeyLabel.trim() })}
            >
              {saveKeyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Key
            </Button>
            {existingKey && (
              <Button
                variant="outline"
                className="flex-1"
                disabled={validateMutation.isPending}
                onClick={() => validateMutation.mutate(selectedProvider)}
              >
                {validateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Validate
              </Button>
            )}
          </DialogFooter>

          <div className="text-center">
            <Link href="/ai-api-keys" onClick={() => setKeyDialogOpen(false)}>
              <span className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 cursor-pointer">
                <ExternalLink className="h-3 w-3" />
                Manage all keys & switch AI model
              </span>
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Position Size Calculator Dialog ─────────────────────────────────── */}
      <Dialog open={calcOpen} onOpenChange={setCalcOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-cyan-400" />
              Position Size Calculator
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Account Balance ($)</Label>
                <Input value={calcBalance} onChange={e => setCalcBalance(e.target.value)} placeholder="10000" className="h-8 text-sm" type="number" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Risk Per Trade (%)</Label>
                <Input value={calcRisk} onChange={e => setCalcRisk(e.target.value)} placeholder="1" className="h-8 text-sm" type="number" step="0.1" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Currency Pair</Label>
              <select
                value={calcPair}
                onChange={e => setCalcPair(e.target.value)}
                className="w-full h-8 text-sm bg-background border border-input rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD','GBPJPY','EURJPY','XAUUSD','US30','NAS100','BTCUSD'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Entry Price</Label>
                <Input value={calcEntry} onChange={e => setCalcEntry(e.target.value)} placeholder="1.08500" className="h-8 text-sm font-mono" type="number" step="any" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Stop Loss Price</Label>
                <Input value={calcSL} onChange={e => setCalcSL(e.target.value)} placeholder="1.08200" className="h-8 text-sm font-mono" type="number" step="any" />
              </div>
            </div>

            {/* Result */}
            {calcResult ? (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xl font-black text-cyan-400">{calcResult.lots}</div>
                    <div className="text-[10px] text-gray-400">Lots</div>
                  </div>
                  <div>
                    <div className="text-xl font-black text-red-400">${calcResult.dollarRisk}</div>
                    <div className="text-[10px] text-gray-400">$ at Risk</div>
                  </div>
                  <div>
                    <div className="text-xl font-black text-amber-400">{calcResult.slPips}</div>
                    <div className="text-[10px] text-gray-400">SL Pips</div>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 text-center">Approx. for USD-quoted pairs. Adjust for cross-currency pip values.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-700 bg-gray-900/30 p-3 text-center">
                <p className="text-gray-500 text-sm">Enter entry + stop loss to calculate</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Header;
