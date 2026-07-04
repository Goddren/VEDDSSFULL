import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'wouter';
import VeddLogo from '@/components/ui/vedd-logo';
import {
  Coins,
  Users,
  TrendingUp,
  Gift,
  Shield,
  Wallet,
  ArrowRight,
  CheckCircle,
  Brain,
  Trophy,
  Target,
  Zap,
  Star,
  BookOpen,
  Video,
  MessageSquare,
  Share2,
  BarChart3,
  Lock,
  Unlock,
  Clock,
  DollarSign,
  Percent,
  PieChart,
  Shirt,
  ShoppingBag,
  QrCode,
  Copy,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { SiSolana } from 'react-icons/si';

interface RewardConfig {
  actionType: string;
  baseAmount: number;
  description: string;
}

interface RewardSummary {
  totalEarned: number;
  pendingRewards: number;
  claimedRewards: number;
  referralEarnings: number;
}

const tokenAllocation = [
  { name: 'Community Rewards Pool', percent: 30, color: 'bg-green-500', description: 'Ambassador, referral, and trading rewards' },
  { name: 'Development & Operations', percent: 20, color: 'bg-blue-500', description: 'Platform development and maintenance' },
  { name: 'Liquidity Pool', percent: 20, color: 'bg-purple-500', description: 'DEX liquidity for trading' },
  { name: 'Team & Advisors', percent: 15, color: 'bg-yellow-500', description: 'Vested over 2 years' },
  { name: 'Marketing & Partnerships', percent: 10, color: 'bg-pink-500', description: 'Growth and adoption' },
  { name: 'Reserve', percent: 5, color: 'bg-gray-500', description: 'Emergency and future initiatives' }
];

const rewardActions = [
  {
    category: 'Ambassador Rewards',
    icon: Trophy,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    actions: [
      { name: 'Daily Social Post (verified)', reward: '10 VEDD', description: 'Post VEDD content — admin verified, 1/day' },
      { name: 'Host Community Event', reward: '100 VEDD', description: 'Host a live session — admin verified, 1/day' },
      { name: 'Challenge Completion', reward: '25 VEDD', description: 'Complete ambassador training challenges' },
      { name: '44-Day Journey Day', reward: '10 VEDD', description: 'Complete each day of the free-path journey' },
      { name: '44-Day Completion Bonus', reward: '500 VEDD', description: 'Full journey completion — admin verified' }
    ]
  },
  {
    category: 'Referral Rewards',
    icon: Users,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    actions: [
      { name: 'Referral Signup', reward: '50 VEDD', description: 'Referred user creates account, up to 5/day' },
      { name: 'Referral Subscribes', reward: '200 VEDD', description: 'Referred user pays for a plan, up to 5/day' },
      { name: 'Trade Referral Bonus', reward: '25 VEDD flat', description: 'Flat VEDD bonus per referral profitable trade' }
    ]
  },
  {
    category: 'Community Rewards',
    icon: MessageSquare,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    actions: [
      { name: 'Event Attendance', reward: '15 VEDD', description: 'Attend a community event, up to 2/day' },
      { name: 'Daily Comment / Engage', reward: '5 VEDD', description: 'Community engagement, up to 3/day' }
    ]
  },
  {
    category: 'Wear-to-Earn',
    icon: Shirt,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    actions: [
      { name: 'VEDD Clothing QR Scan', reward: '50 VEDD', description: 'Scan tag on purchased clothing — admin verified, 1/day' }
    ]
  }
];

const tokenUtility = [
  { icon: Unlock, title: 'Premium Features', description: 'Access advanced AI analysis, unlimited charts, and premium EAs' },
  { icon: TrendingUp, title: 'Trading Benefits', description: 'Reduced fees, priority execution, and exclusive signals' },
  { icon: Shield, title: 'Governance', description: 'Vote on platform decisions, feature priorities, and reward rates' },
  { icon: Gift, title: 'Staking Rewards', description: 'Stake VEDD to earn additional yield and boost multipliers' },
  { icon: Trophy, title: 'Ambassador Perks', description: 'Enhanced earning rates and exclusive ambassador tools' },
  { icon: Star, title: 'NFT Access', description: 'Exclusive NFT drops and ambassador badges' },
  { icon: Coins, title: 'Two Payment Systems', description: 'Earned VEDD (ambassador rewards): 2,000 = 1 month free. Bought VEDD (market): live price ~20M VEDD = $50 today, falling as price grows.' }
];

interface RoadmapMonth {
  month: number;
  label: string;
  quarter: string;
  theme: string;
  priceTarget: string;
  priceRange: string;
  marketCap: string;
  milestones: string[];
  drivers: string[];
  communityTarget: string;
  ambassadorTarget: string;
  color: string;
  gradient: string;
}

// Current live price: $0.000002448 | Market cap: ~$2,448 | Supply: 1B | DEX: pump.fun bonding curve
const CURRENT_PRICE = '$0.0000024';
const CURRENT_MCAP = '$2,448';

const priceRoadmap: RoadmapMonth[] = [
  {
    month: 1, label: 'Month 1 (NOW)', quarter: 'Q1', theme: 'Bonding Curve — Early Accumulation',
    priceTarget: '$0.000010', priceRange: '$0.0000024 - $0.000015', marketCap: '$10K',
    milestones: ['Token live on pump.fun bonding curve', 'Ambassador reward system activated', 'Treasury wallet funded & sending tokens', 'First 10 ambassadors verified & earning'],
    drivers: ['Early buyer accumulation at micro-cap', 'Ambassador content creating first awareness', 'Wear-to-earn and referral rewards driving sign-ups'],
    communityTarget: '100', ambassadorTarget: '10',
    color: 'text-blue-400', gradient: 'from-blue-600/20 to-blue-900/20 border-blue-500/30'
  },
  {
    month: 2, label: 'Month 2', quarter: 'Q1', theme: 'Community Ignition',
    priceTarget: '$0.000050', priceRange: '$0.000025 - $0.000080', marketCap: '$50K',
    milestones: ['44-Day Ambassador Journey fully active', 'First ambassador cohort completing days 1-30', 'Referral reward chain generating organic sign-ups', 'SOL Scanner auto-trading attracting traders'],
    drivers: ['Ambassador army posting daily content', 'Referral compounding: each member brings more', '20x from launch = still sub-$100K mcap'],
    communityTarget: '500', ambassadorTarget: '50',
    color: 'text-blue-400', gradient: 'from-blue-600/20 to-blue-900/20 border-blue-500/30'
  },
  {
    month: 3, label: 'Month 3', quarter: 'Q1', theme: 'Bonding Curve Graduation',
    priceTarget: '$0.000085', priceRange: '$0.000060 - $0.000120', marketCap: '$85K',
    milestones: ['Token graduates pump.fun bonding curve (~$69K raised)', 'Raydium liquidity pool opens', 'First 44-day journey completions (500 VEDD bonuses)', 'VEDD staking program activates'],
    drivers: ['Graduation = massive price catalyst (Raydium listing)', 'Staking locks supply off market', 'Growing platform usage driving real utility demand'],
    communityTarget: '1,500', ambassadorTarget: '150',
    color: 'text-blue-400', gradient: 'from-blue-600/20 to-blue-900/20 border-blue-500/30'
  },
  {
    month: 4, label: 'Month 4', quarter: 'Q2', theme: 'Raydium Discovery Phase',
    priceTarget: '$0.00020', priceRange: '$0.00012 - $0.00030', marketCap: '$200K',
    milestones: ['Listed on Jupiter aggregator', 'Ambassador training V2 with video certification', 'Regional ambassador leads appointed', 'Token-gated membership tiers live'],
    drivers: ['Jupiter listing exposes to millions of Solana traders', 'Staking reduces circulating supply', 'Membership utility creates recurring buy pressure'],
    communityTarget: '4,000', ambassadorTarget: '350',
    color: 'text-green-400', gradient: 'from-green-600/20 to-green-900/20 border-green-500/30'
  },
  {
    month: 5, label: 'Month 5', quarter: 'Q2', theme: 'Viral Ambassador Growth',
    priceTarget: '$0.00050', priceRange: '$0.00030 - $0.00080', marketCap: '$500K',
    milestones: ['Ambassadors active in 10+ countries', 'VEDD NFT membership collection launches', 'MT5 trade copier reaches 500 active users', 'Community trading competitions begin'],
    drivers: ['Viral ambassador content reaching new audiences daily', 'NFT scarcity narrative', 'Trading competitions increase daily active users'],
    communityTarget: '10,000', ambassadorTarget: '600',
    color: 'text-green-400', gradient: 'from-green-600/20 to-green-900/20 border-green-500/30'
  },
  {
    month: 6, label: 'Month 6', quarter: 'Q2', theme: 'First Million Dollar Cap',
    priceTarget: '$0.0010', priceRange: '$0.00060 - $0.0015', marketCap: '$1M',
    milestones: ['First $1M market cap milestone', 'EA Marketplace with creator royalties live', 'Webhook signal system adoption spike', 'First $500K platform trading volume'],
    drivers: ['Psychological $1M milestone attracts media attention', 'EA creators earning passive VEDD income', 'Platform trading volume validates real utility'],
    communityTarget: '20,000', ambassadorTarget: '1,000',
    color: 'text-green-400', gradient: 'from-green-600/20 to-green-900/20 border-green-500/30'
  },
  {
    month: 7, label: 'Month 7', quarter: 'Q3', theme: 'CEX Preparation',
    priceTarget: '$0.0025', priceRange: '$0.0015 - $0.0040', marketCap: '$2.5M',
    milestones: ['CEX listing applications submitted', 'API for third-party integrations launched', 'Ambassador-led regional in-person events', 'VEDD Debit Card partnership announced'],
    drivers: ['CEX listing anticipation builds momentum', 'Real-world utility (debit card) narrative', 'Growing institutional-level interest at $2M+ mcap'],
    communityTarget: '40,000', ambassadorTarget: '1,500',
    color: 'text-yellow-400', gradient: 'from-yellow-600/20 to-yellow-900/20 border-yellow-500/30'
  },
  {
    month: 8, label: 'Month 8', quarter: 'Q3', theme: 'Revenue Sharing Launch',
    priceTarget: '$0.0050', priceRange: '$0.003 - $0.008', marketCap: '$5M',
    milestones: ['Platform revenue sharing for VEDD stakers', 'Mobile app beta launch', 'Ambassador summit (virtual)', 'VEDD burn mechanism introduced'],
    drivers: ['Revenue-backed token value (staking APY from platform fees)', 'Mobile expands addressable market', 'Token burn creates first deflationary pressure'],
    communityTarget: '65,000', ambassadorTarget: '2,500',
    color: 'text-yellow-400', gradient: 'from-yellow-600/20 to-yellow-900/20 border-yellow-500/30'
  },
  {
    month: 9, label: 'Month 9', quarter: 'Q3', theme: 'First CEX Listing',
    priceTarget: '$0.010', priceRange: '$0.007 - $0.015', marketCap: '$10M',
    milestones: ['First CEX listing goes live', 'AI signal accuracy exceeds 75% rate', 'Cross-chain expansion announced', 'DAO governance fully operational'],
    drivers: ['CEX listing brings massive new audience overnight', 'Proven AI track record attracts serious traders', 'Token burn + staking = shrinking supply vs growing demand'],
    communityTarget: '100,000', ambassadorTarget: '4,000',
    color: 'text-yellow-400', gradient: 'from-yellow-600/20 to-yellow-900/20 border-yellow-500/30'
  },
  {
    month: 10, label: 'Month 10', quarter: 'Q4', theme: 'Broker Partnerships',
    priceTarget: '$0.025', priceRange: '$0.015 - $0.035', marketCap: '$25M',
    milestones: ['Strategic partnership with major Forex broker', 'VEDD integrated into broker platforms', 'Ambassador certification industry-recognized', 'Second CEX listing'],
    drivers: ['Broker partnership = millions of existing traders exposed to VEDD', 'Cross-platform utility increases daily demand', 'Two CEX listings = massive liquidity and visibility'],
    communityTarget: '175,000', ambassadorTarget: '6,000',
    color: 'text-purple-400', gradient: 'from-purple-600/20 to-purple-900/20 border-purple-500/30'
  },
  {
    month: 11, label: 'Month 11', quarter: 'Q4', theme: 'Global Ambassador Network',
    priceTarget: '$0.050', priceRange: '$0.030 - $0.075', marketCap: '$50M',
    milestones: ['Ambassador program in 50+ countries', 'Multi-language platform (10 languages)', 'VEDD mobile app full launch', 'Institutional trading desk beta'],
    drivers: ['Global ambassador army creating content in every language', 'Mobile accessibility multiplies addressable market', 'Institutional interest at $50M mcap'],
    communityTarget: '300,000', ambassadorTarget: '8,500',
    color: 'text-purple-400', gradient: 'from-purple-600/20 to-purple-900/20 border-purple-500/30'
  },
  {
    month: 12, label: 'Month 12', quarter: 'Q4', theme: 'Year One Complete — $100M Target',
    priceTarget: '$0.10', priceRange: '$0.06 - $0.15', marketCap: '$100M',
    milestones: ['Year-end ambassador gala event', 'VEDD AI V2 with proprietary trading models', 'Community flywheel self-sustaining', '500K+ community members'],
    drivers: ['Full ecosystem delivering real value at scale', 'Brand recognition across global crypto-trading community', 'Supply squeeze: staking + burns vs growing utility demand'],
    communityTarget: '500,000', ambassadorTarget: '12,000',
    color: 'text-purple-400', gradient: 'from-purple-600/20 to-purple-900/20 border-purple-500/30'
  },
];

const quarterSummary = [
  {
    quarter: 'Q1',
    title: 'Bonding → Raydium',
    subtitle: 'Months 1-3',
    priceStart: '$0.0000024',
    priceEnd: '$0.000085',
    growth: '3,440%',
    focus: 'Pump.fun bonding curve graduation, Raydium listing, first ambassador cohort, Treasury live',
    color: 'from-blue-600 to-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/30',
  },
  {
    quarter: 'Q2',
    title: 'Community Growth',
    subtitle: 'Months 4-6',
    priceStart: '$0.00020',
    priceEnd: '$0.0010',
    growth: '400%',
    focus: 'Jupiter listing, ambassador expansion, NFT memberships, $1M market cap milestone',
    color: 'from-green-600 to-green-400',
    bgColor: 'bg-green-500/10 border-green-500/30',
  },
  {
    quarter: 'Q3',
    title: 'CEX & Revenue',
    subtitle: 'Months 7-9',
    priceStart: '$0.0025',
    priceEnd: '$0.010',
    growth: '300%',
    focus: 'First CEX listing, revenue sharing for stakers, mobile app, token burn mechanism',
    color: 'from-yellow-600 to-yellow-400',
    bgColor: 'bg-yellow-500/10 border-yellow-500/30',
  },
  {
    quarter: 'Q4',
    title: '$100M Target',
    subtitle: 'Months 10-12',
    priceStart: '$0.025',
    priceEnd: '$0.10',
    growth: '300%',
    focus: 'Broker partnerships, 50+ countries, 500K community, institutional interest',
    color: 'from-purple-600 to-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/30',
  },
];

interface DexScreenerPair {
  priceUsd: string;
  fdv: number;
  marketCap: number;
  volume: { h24: number };
  priceChange: { h24: number; h6: number; h1: number };
  liquidity?: { usd: number };
  txns?: { h24: { buys: number; sells: number } };
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

function formatPrice(p: number): string {
  if (p === 0) return '$0';
  if (p < 0.000001) return `$${p.toFixed(10).replace(/0+$/, '')}`;
  if (p < 0.0001) return `$${p.toFixed(8).replace(/0+$/, '')}`;
  if (p < 0.01) return `$${p.toFixed(6)}`;
  return `$${p.toFixed(4)}`;
}

function formatMcap(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function VeddTokenomics() {
  const { data: rewardConfigs = [] } = useQuery<RewardConfig[]>({
    queryKey: ['/api/vedd/config']
  });

  const { data: rewardSummary } = useQuery<RewardSummary>({
    queryKey: ['/api/vedd/rewards/summary']
  });

  const MINT_ADDRESS = 'Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump';

  // Live price via server proxy — avoids browser CORS issues
  const { data: dexData, isLoading: priceLoading } = useQuery<DexScreenerResponse>({
    queryKey: ['/api/vedd/live-price'],
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
    throwOnError: false,
  });

  const pair = dexData?.pairs?.[0] ?? null;
  const livePrice  = pair ? parseFloat(pair.priceUsd) : null;
  const liveMcap   = pair?.marketCap ?? pair?.fdv ?? null;
  const priceChange24h = pair?.priceChange?.h24 ?? null;
  const volume24h  = pair?.volume?.h24 ?? null;
  const buys24h    = pair?.txns?.h24?.buys ?? null;
  const sells24h   = pair?.txns?.h24?.sells ?? null;
  const liquidity  = pair?.liquidity?.usd ?? null;

  const displayPrice = livePrice ? formatPrice(livePrice) : '$0.0000024';
  const displayMcap  = liveMcap  ? formatMcap(liveMcap)   : '$2,448';
  const priceUp = (priceChange24h ?? 0) >= 0;

  const totalSupply = 1000000000;
  const [mintCopied, setMintCopied] = useState(false);
  const copyMint = () => { navigator.clipboard.writeText(MINT_ADDRESS); setMintCopied(true); setTimeout(() => setMintCopied(false), 2000); };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-purple-900/5 to-background">
      <div className="container mx-auto px-4 py-8">
        {/* ── Regulatory & Legal Disclaimer — TOP OF PAGE ── */}
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-300 mb-1 text-sm">Regulatory Notice — Read Before Proceeding</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-white">VEDD tokens are platform utility and reward tokens, NOT securities or investment products.</strong>{" "}
                They are not registered with the U.S. Securities and Exchange Commission (SEC), the Financial Industry Regulatory Authority (FINRA),
                or any other securities regulator. Purchase or acquisition of VEDD tokens does not constitute an investment in any company,
                fund, or enterprise, and confers no ownership rights, profit-sharing rights, or dividends.
                All price roadmaps, growth scenarios, and community projections shown on this page are
                <strong className="text-white"> illustrative milestones only</strong> — they are not forecasts,
                guarantees of returns, or promises of future value. Cryptocurrency tokens carry substantial risk of total loss.
                <strong className="text-white"> This page does not constitute investment advice.</strong> Always consult a licensed financial advisor.
              </p>
            </div>
          </div>
        </div>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
                Back to Vault
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/vedd-wallet">
              <Button variant="outline">
                <Wallet className="h-4 w-4 mr-2" />
                My VEDD Wallet
              </Button>
            </Link>
          </div>
        </div>
        
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
              <Coins className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
            VEDD Token Economics
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            The utility token powering the VEDD AI Trading Vault ecosystem. 
            Earn, trade, stake, and govern with VEDD.
          </p>
        </div>
        
        {/* Live price strip */}
        <div className="rounded-2xl p-4 mb-6"
          style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(236,72,153,0.06))', border: '1px solid rgba(139,92,246,0.25)' }}>
          {/* Top row — price + change + links */}
          <div className="flex flex-wrap items-center gap-4 justify-between mb-3">
            <div className="flex items-center gap-3">
              <SiSolana className="h-5 w-5 text-purple-400 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-white font-black text-lg leading-none">
                    {priceLoading ? <span className="text-gray-500 text-sm animate-pulse">Loading…</span> : displayPrice}
                  </p>
                  {priceChange24h !== null && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${priceUp ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {priceUp ? '▲' : '▼'} {Math.abs(priceChange24h).toFixed(2)}% 24h
                    </span>
                  )}
                  <span className="text-[10px] text-gray-600 bg-white/[0.03] border border-white/05 px-2 py-0.5 rounded-full">
                    {priceLoading ? '…' : 'LIVE'}
                  </span>
                </div>
                <p className="text-gray-500 text-xs mt-0.5">
                  Market Cap: {displayMcap} · pump.fun bonding curve · 1B supply
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="bg-black/30 rounded-xl px-3 py-1.5">
                <p className="text-[10px] text-gray-500 mb-0.5">Mint Address</p>
                <div className="flex items-center gap-1.5">
                  <code className="text-amber-300 text-[10px]">{MINT_ADDRESS.slice(0,12)}...{MINT_ADDRESS.slice(-8)}</code>
                  <button onClick={copyMint} className="text-gray-500 hover:text-amber-400 transition-colors">
                    {mintCopied ? <CheckCircle className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
              <a href={`https://dexscreener.com/solana/${MINT_ADDRESS}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-xl px-3 py-1.5 hover:bg-purple-500/15 transition-all">
                DexScreener <ExternalLink className="h-3 w-3" />
              </a>
              <a href={`https://pump.fun/coin/${MINT_ADDRESS}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-pink-400 bg-pink-500/10 border border-pink-500/20 rounded-xl px-3 py-1.5 hover:bg-pink-500/15 transition-all">
                pump.fun <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Secondary stats row — only shown when data loaded */}
          {pair && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-white/05">
              {[
                { label: '24h Volume', value: volume24h ? formatMcap(volume24h) : '—' },
                { label: 'Liquidity', value: liquidity ? formatMcap(liquidity) : '—' },
                { label: '24h Buys', value: buys24h !== null ? buys24h.toString() : '—', color: 'text-emerald-400' },
                { label: '24h Sells', value: sells24h !== null ? sells24h.toString() : '—', color: 'text-red-400' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className={`text-sm font-bold ${s.color ?? 'text-white'}`}>{s.value}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Token Stats */}
        <div className="grid md:grid-cols-4 gap-4 mb-12">
          <Card className="bg-gradient-to-br from-purple-600/20 to-purple-900/20 border-purple-500/30">
            <CardContent className="pt-6 text-center">
              <Coins className="h-8 w-8 mx-auto mb-2 text-purple-400" />
              <p className="text-3xl font-bold">1B</p>
              <p className="text-sm text-muted-foreground">Total Supply</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-600/20 to-green-900/20 border-green-500/30">
            <CardContent className="pt-6 text-center">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 text-green-400" />
              <p className="text-3xl font-bold">{priceLoading ? <span className="text-base animate-pulse text-gray-500">…</span> : displayMcap}</p>
              <p className="text-sm text-muted-foreground">Market Cap (Live)</p>
              {priceChange24h !== null && (
                <p className={`text-xs mt-1 font-semibold ${priceUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  {priceUp ? '▲' : '▼'} {Math.abs(priceChange24h).toFixed(2)}% today
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-600/20 to-yellow-900/20 border-yellow-500/30">
            <CardContent className="pt-6 text-center">
              <Gift className="h-8 w-8 mx-auto mb-2 text-yellow-400" />
              <p className="text-3xl font-bold">50M</p>
              <p className="text-sm text-muted-foreground">Rewards Pool (5%)</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-600/20 to-blue-900/20 border-blue-500/30">
            <CardContent className="pt-6 text-center">
              <Target className="h-8 w-8 mx-auto mb-2 text-blue-400" />
              <p className="text-3xl font-bold">$100M</p>
              <p className="text-sm text-muted-foreground">12-Month Target</p>
            </CardContent>
          </Card>
        </div>
        
        <Tabs defaultValue="allocation" className="mb-12">
          <TabsList className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 h-auto w-full max-w-3xl mx-auto mb-8">
            <TabsTrigger value="allocation">Allocation</TabsTrigger>
            <TabsTrigger value="roadmap">Price Roadmap</TabsTrigger>
            <TabsTrigger value="rewards">Earn VEDD</TabsTrigger>
            <TabsTrigger value="utility">Utility</TabsTrigger>
            <TabsTrigger value="pool">Rewards Pool</TabsTrigger>
          </TabsList>
          
          {/* Token Allocation Tab */}
          <TabsContent value="allocation">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Token Allocation
                </CardTitle>
                <CardDescription>
                  Distribution of the 1 billion VEDD token supply
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Visual Chart */}
                  <div className="relative">
                    <div className="aspect-square max-w-xs mx-auto">
                      <svg viewBox="0 0 100 100" className="w-full h-full">
                        {(() => {
                          let currentAngle = 0;
                          return tokenAllocation.map((item, idx) => {
                            const angle = (item.percent / 100) * 360;
                            const startAngle = currentAngle;
                            const endAngle = currentAngle + angle;
                            currentAngle = endAngle;
                            
                            const startRad = (startAngle - 90) * Math.PI / 180;
                            const endRad = (endAngle - 90) * Math.PI / 180;
                            
                            const x1 = 50 + 40 * Math.cos(startRad);
                            const y1 = 50 + 40 * Math.sin(startRad);
                            const x2 = 50 + 40 * Math.cos(endRad);
                            const y2 = 50 + 40 * Math.sin(endRad);
                            
                            const largeArc = angle > 180 ? 1 : 0;
                            
                            const colors = ['#22c55e', '#3b82f6', '#a855f7', '#eab308', '#ec4899', '#6b7280'];
                            
                            return (
                              <path
                                key={idx}
                                d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                                fill={colors[idx]}
                                stroke="hsl(var(--background))"
                                strokeWidth="0.5"
                              />
                            );
                          });
                        })()}
                        <circle cx="50" cy="50" r="20" fill="hsl(var(--background))" />
                        <text x="50" y="48" textAnchor="middle" className="fill-foreground text-[6px] font-bold">VEDD</text>
                        <text x="50" y="56" textAnchor="middle" className="fill-muted-foreground text-[4px]">1B Supply</text>
                      </svg>
                    </div>
                  </div>
                  
                  {/* Legend */}
                  <div className="space-y-3">
                    {tokenAllocation.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded ${item.color}`} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{item.name}</span>
                            <Badge variant="outline">{item.percent}%</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                          <Progress value={item.percent} className="h-1 mt-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Price Roadmap Tab */}
          <TabsContent value="roadmap">
            <div className="space-y-8">
              <Card className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border-purple-500/30">
                <CardContent className="py-6">
                  <div className="text-center mb-4">
                    <h2 className="text-2xl font-bold mb-2">12-Month Milestone Roadmap</h2>
                    <p className="text-muted-foreground max-w-2xl mx-auto">
                      Illustrative community and platform milestone targets — <strong>not price forecasts or guaranteed returns.</strong>{" "}
                      Token market prices are determined solely by open market activity and are not controlled or guaranteed by VEDD.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    {quarterSummary.map((q, idx) => (
                      <div key={idx} className={`rounded-lg border p-4 text-center ${q.bgColor}`}>
                        <Badge className={`bg-gradient-to-r ${q.color} text-white border-0 mb-2`}>{q.quarter}</Badge>
                        <p className="text-xs text-muted-foreground mb-1">{q.subtitle}</p>
                        <p className="font-bold text-lg">{q.priceEnd}</p>
                        <p className="text-xs text-muted-foreground">{q.priceStart} → {q.priceEnd}</p>
                        <Badge variant="outline" className="mt-2 text-green-400 border-green-500/30">+{q.growth} <span className="text-[9px] text-amber-400/60 font-normal ml-0.5">*scenario</span></Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <p className="text-[11px] text-amber-400/50 text-center -mt-4 mb-2">* These are illustrative milestone scenarios, not price forecasts or guaranteed returns. Open market prices may differ significantly.</p>

              <div className="grid md:grid-cols-4 gap-3 mb-4">
                {quarterSummary.map((q, idx) => (
                  <Card key={idx} className={`${q.bgColor}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={`bg-gradient-to-r ${q.color} text-white border-0`}>{q.quarter}</Badge>
                        <span className="font-bold text-sm">{q.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{q.focus}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="relative">
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500 via-green-500 via-yellow-500 to-purple-500 hidden md:block" />
                
                <div className="space-y-6">
                  {priceRoadmap.map((month, idx) => (
                    <Card key={idx} className={`bg-gradient-to-br ${month.gradient} overflow-hidden`}>
                      <CardContent className="py-5">
                        <div className="flex flex-col md:flex-row gap-6">
                          <div className="md:w-48 shrink-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-3 h-3 rounded-full ${month.color.replace('text-', 'bg-')}`} />
                              <Badge variant="outline" className={`${month.color}`}>{month.quarter}</Badge>
                            </div>
                            <h3 className="text-xl font-bold">{month.label}</h3>
                            <p className={`text-sm font-medium ${month.color}`}>{month.theme}</p>
                            <div className="mt-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Target</span>
                                <span className="text-lg font-bold">{month.priceTarget}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Range</span>
                                <span className="text-xs">{month.priceRange}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Mkt Cap</span>
                                <span className="text-sm font-semibold">{month.marketCap}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex-1 grid md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                                <Target className="h-3 w-3" /> Milestones
                              </p>
                              <ul className="space-y-1.5">
                                {month.milestones.map((m, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm">
                                    <CheckCircle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${month.color}`} />
                                    <span>{m}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" /> Price Drivers
                              </p>
                              <ul className="space-y-1.5 mb-3">
                                {month.drivers.map((d, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm">
                                    <Zap className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${month.color}`} />
                                    <span>{d}</span>
                                  </li>
                                ))}
                              </ul>
                              
                              <div className="flex gap-3 mt-auto">
                                <div className="flex items-center gap-1.5 text-xs bg-muted/40 rounded-lg px-2 py-1">
                                  <Users className="h-3 w-3 text-blue-400" />
                                  <span>{month.communityTarget} members</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs bg-muted/40 rounded-lg px-2 py-1">
                                  <Trophy className="h-3 w-3 text-yellow-400" />
                                  <span>{month.ambassadorTarget} ambassadors</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
              
              <Card className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-green-500/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-400">
                    <TrendingUp className="h-5 w-5" />
                    Year 1 Growth Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-4 gap-6">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-green-400">250x</p>
                      <p className="text-sm text-muted-foreground">Illustrative Scenario</p>
                      <p className="text-xs text-muted-foreground text-amber-400/70">Not a forecast or guarantee</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-blue-400">250K</p>
                      <p className="text-sm text-muted-foreground">Community Members</p>
                      <p className="text-xs text-muted-foreground">Global VEDD community</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-yellow-400">12K</p>
                      <p className="text-sm text-muted-foreground">Certified Ambassadors</p>
                      <p className="text-xs text-muted-foreground">50+ countries</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-purple-400">$62.5M</p>
                      <p className="text-sm text-muted-foreground">Market Cap Target</p>
                      <p className="text-xs text-muted-foreground">Fully diluted valuation</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-red-500/5 border-red-500/30">
                <CardContent className="py-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-red-400 mb-2">Important Legal Notice — Not Investment Advice</p>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <p><strong className="text-white">VEDD tokens are NOT securities.</strong> They are platform utility and reward tokens. Nothing on this page is investment advice, a solicitation to invest, or a guarantee of any financial return.</p>
                        <p>All price scenarios, roadmap milestones, community growth projections, and percentage figures shown are <strong className="text-white">illustrative only</strong>. Actual token prices are determined entirely by open market activity and cannot be predicted or guaranteed.</p>
                        <p>Purchasing VEDD tokens involves <strong className="text-white">substantial risk of total financial loss</strong>. VEDD tokens may have zero monetary value. Past performance does not indicate future results. Never acquire more tokens than you can afford to lose completely.</p>
                        <p className="text-xs text-muted-foreground/60 border-t border-border/40 pt-2 mt-2">VEDD tokens are not registered with or approved by the U.S. Securities and Exchange Commission, FINRA, or any other securities regulatory authority. This page has not been reviewed by any financial regulatory authority.</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          {/* Earn VEDD Tab */}
          <TabsContent value="rewards">
            <div className="grid md:grid-cols-2 gap-6">
              {rewardActions.map((category, idx) => (
                <Card key={idx} className="overflow-hidden">
                  <CardHeader className={`${category.bgColor}`}>
                    <CardTitle className={`flex items-center gap-2 ${category.color}`}>
                      <category.icon className="h-5 w-5" />
                      {category.category}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      {category.actions.map((action, actionIdx) => (
                        <div key={actionIdx} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                          <div>
                            <p className="font-medium text-sm">{action.name}</p>
                            <p className="text-xs text-muted-foreground">{action.description}</p>
                          </div>
                          <Badge className={`${category.bgColor} ${category.color} border-0`}>
                            {action.reward}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {/* Wear to Earn — VEDD Clothing */}
            <Card className="mt-6 overflow-hidden border-amber-500/30 bg-gradient-to-br from-amber-950/40 via-gray-900 to-gray-900">
              <CardHeader className="pb-3 border-b border-amber-500/20">
                <CardTitle className="flex items-center gap-2 text-amber-400">
                  <Shirt className="h-5 w-5" />
                  Wear to Earn — VEDD Clothing
                </CardTitle>
                <CardDescription>
                  Buy official VEDD clothing and scan the QR code on the tag to earn VEDD tokens instantly
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="grid sm:grid-cols-3 gap-4 mb-5">
                  {[
                    { name: 'Clothing Purchase Scan', reward: '50 VEDD', description: 'Scan QR on any VEDD clothing item tag', icon: QrCode },
                    { name: 'First Item Bonus', reward: '+25 VEDD', description: 'Bonus on your very first clothing claim', icon: Star },
                    { name: 'Refer a Purchase', reward: '10 VEDD', description: 'When a referral buys and scans VEDD clothing', icon: Users },
                  ].map((action, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                      <action.icon className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-white">{action.name}</p>
                        <p className="text-xs text-muted-foreground">{action.description}</p>
                        <Badge className="mt-1.5 bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">{action.reward}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/vedd-clothing">
                    <Button className="bg-amber-500 hover:bg-amber-400 text-black font-bold">
                      <QrCode className="h-4 w-4 mr-2" />
                      Scan & Claim VEDD
                    </Button>
                  </Link>
                  <a href="https://replit.com/@goddren/VeddVerse?s=app" target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="border-amber-500/40 text-amber-400 hover:border-amber-500">
                      <ShoppingBag className="h-4 w-4 mr-2" />
                      Shop VEDD Clothing
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>

            {/* Two systems explainer card */}
            <Card className="mt-4 border-amber-500/30 bg-gradient-to-br from-amber-950/30 to-gray-900">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-amber-400 flex items-center gap-2">
                  <Coins className="h-4 w-4" /> Understanding Your VEDD Tokens
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-emerald-500/08 border border-emerald-500/20">
                    <p className="text-emerald-400 font-bold text-sm mb-1">① Earned VEDD — Ambassador Rate</p>
                    <p className="text-gray-400 text-xs">Tokens earned through platform activities (posting, referrals, journey). Redeemed at a <strong className="text-white">fixed platform rate</strong>:</p>
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-xs"><span className="text-gray-500">500 VEDD</span><span className="text-emerald-400 font-bold">= 1 free week</span></div>
                      <div className="flex justify-between text-xs"><span className="text-gray-500">2,000 VEDD</span><span className="text-emerald-400 font-bold">= 1 free month</span></div>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-2">This rate never changes — it's your ambassador promise.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-500/08 border border-blue-500/20">
                    <p className="text-blue-400 font-bold text-sm mb-1">② Bought VEDD — Market Rate</p>
                    <p className="text-gray-400 text-xs">Buy VEDD on pump.fun and pay for membership at <strong className="text-white">live market price</strong>. Amount needed falls as VEDD grows:</p>
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-xs"><span className="text-gray-500">Today ($0.0000024)</span><span className="text-blue-400 font-bold">~20M VEDD/$50</span></div>
                      <div className="flex justify-between text-xs"><span className="text-gray-500">Month 9 ($0.01)</span><span className="text-blue-400 font-bold">~5,000 VEDD/$50</span></div>
                      <div className="flex justify-between text-xs"><span className="text-gray-500">Month 12 ($0.10)</span><span className="text-blue-400 font-bold">~500 VEDD/$50</span></div>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-2">Market rate calculated live from DexScreener.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-4 bg-gradient-to-r from-purple-900/30 to-pink-900/30 border-purple-500/30">
              <CardContent className="py-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold mb-2">Start Earning VEDD Now</h3>
                    <p className="text-muted-foreground">Complete actions to earn rewards automatically sent to your wallet</p>
                  </div>
                  <div className="flex gap-2">
                    <Link href="/solana-scanner">
                      <Button className="bg-gradient-to-r from-purple-600 to-pink-600">
                        <Brain className="h-4 w-4 mr-2" />
                        Trade & Earn
                      </Button>
                    </Link>
                    <Link href="/ambassador-training">
                      <Button variant="outline">
                        <Trophy className="h-4 w-4 mr-2" />
                        Become Ambassador
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Utility Tab */}
          <TabsContent value="utility">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tokenUtility.map((item, idx) => (
                <Card key={idx} className="hover:border-purple-500/50 transition-colors">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-3">
                      <item.icon className="h-6 w-6 text-purple-400" />
                    </div>
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{item.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Token Tiers & Benefits</CardTitle>
                <CardDescription>Hold VEDD to unlock exclusive benefits</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-4 gap-4">
                  {[
                    { tier: 'Holder', amount: '1,000+', benefits: ['Basic features', 'Community access'], color: 'border-gray-500' },
                    { tier: 'Silver', amount: '10,000+', benefits: ['10% fee discount', 'Priority support'], color: 'border-gray-400' },
                    { tier: 'Gold', amount: '50,000+', benefits: ['25% fee discount', 'Early features', 'Exclusive signals'], color: 'border-yellow-500' },
                    { tier: 'Diamond', amount: '100,000+', benefits: ['50% fee discount', 'Private channels', 'Direct team access'], color: 'border-purple-500' }
                  ].map((tier, idx) => (
                    <Card key={idx} className={`${tier.color} border-2`}>
                      <CardContent className="pt-4 text-center">
                        <Star className={`h-8 w-8 mx-auto mb-2 ${tier.color.replace('border-', 'text-')}`} />
                        <h3 className="font-bold">{tier.tier}</h3>
                        <p className="text-sm text-muted-foreground mb-3">{tier.amount} VEDD</p>
                        <ul className="text-xs space-y-1">
                          {tier.benefits.map((b, i) => (
                            <li key={i} className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3 text-green-400" />
                              {b}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Rewards Pool Tab */}
          <TabsContent value="pool">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Community Rewards Pool
                </CardTitle>
                <CardDescription>
                  Tokens allocated for automatic distribution to community members
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-6 mb-6">
                  <Card className="bg-green-500/10 border-green-500/30">
                    <CardContent className="pt-4 text-center">
                      <p className="text-3xl font-bold text-green-400">300M</p>
                      <p className="text-sm text-muted-foreground">Total Pool Allocation</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-blue-500/10 border-blue-500/30">
                    <CardContent className="pt-4 text-center">
                      <p className="text-3xl font-bold text-blue-400">287.5M</p>
                      <p className="text-sm text-muted-foreground">Available for Distribution</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-purple-500/10 border-purple-500/30">
                    <CardContent className="pt-4 text-center">
                      <p className="text-3xl font-bold text-purple-400">12.5M</p>
                      <p className="text-sm text-muted-foreground">Already Distributed</p>
                    </CardContent>
                  </Card>
                </div>
                
                <div className="space-y-4">
                  <h3 className="font-semibold">How Automatic Distribution Works</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    {[
                      { step: '1', title: 'Action Completed', desc: 'User completes rewarded action (trade, referral, content)', icon: Zap },
                      { step: '2', title: 'Verification', desc: 'System or admin verifies the action', icon: CheckCircle },
                      { step: '3', title: 'Reward Queued', desc: 'VEDD tokens queued for transfer', icon: Clock },
                      { step: '4', title: 'Auto-Transfer', desc: 'Tokens sent directly to user wallet', icon: Wallet }
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-purple-400">{item.step}</span>
                        </div>
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-sm text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Gamification earning breakdown */}
                <div className="mt-6 space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-400" />
                    How the Pool Distributes to You
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      { action: 'Chart Analysis', reward: '5–25 VEDD', note: 'Bonus for analyses above 75% confidence' },
                      { action: 'Daily Devotional Streak', reward: '10 VEDD/day', note: 'Streak multiplier grows each consecutive day' },
                      { action: 'Referral Signup', reward: '50 VEDD', note: 'Per new user who joins with your link' },
                      { action: 'Referral Subscribes', reward: '150 VEDD', note: 'Per referred user who upgrades to paid plan' },
                      { action: 'EA Marketplace Sale', reward: '100 VEDD/mo', note: 'Per active subscriber to your strategy' },
                      { action: 'Community Challenge Win', reward: 'Up to 1,000 VEDD', note: 'Weekly & monthly prize pools' },
                      { action: 'Ambassador Certification', reward: '500 VEDD', note: 'One-time bonus on completion + NFT mint' },
                      { action: 'Wear-to-Earn (NFC Tap)', reward: '25 VEDD/day', note: 'Official VEDD clothing — tap NFC chip daily' },
                      { action: 'XP Tier Milestone', reward: '100–500 VEDD', note: 'Awarded at Rising → Pro → Elite → OG' },
                      { action: 'Achievement Badge Unlock', reward: '10–200 VEDD', note: 'Varies by badge rarity and difficulty' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border border-border/40">
                        <div className="shrink-0 mt-0.5 w-2 h-2 rounded-full bg-green-400 mt-2" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="font-medium text-sm">{item.action}</p>
                            <span className="text-green-400 font-bold text-sm whitespace-nowrap">{item.reward}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    Redemption rate: <span className="text-white font-medium">2,000 earned VEDD = 1 month free subscription</span>. Market VEDD price is separate and grows with the ecosystem.
                  </p>
                </div>

                <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-400">Pool Wallet Security</p>
                      <p className="text-sm text-muted-foreground">
                        The rewards pool is managed by a secure multi-sig wallet. Admins can deposit tokens,
                        and the system automatically distributes rewards when actions are verified.
                        All transactions are recorded on-chain for full transparency.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-green-400">Pool Status: ACTIVE — Distributing Now</p>
                      <p className="text-sm text-muted-foreground">
                        The Community Rewards Pool is funded and live. Every chart analysis, devotional completion, referral,
                        and ambassador action pulls from this pool automatically. New users and existing users
                        are both eligible — there is no waiting period.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Gamification & XP Tiers Section */}
        <div className="mt-12 mb-6">
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-400" />
            Gamification & XP Tier System
          </h2>
          <p className="text-muted-foreground mb-6">Every action on the platform earns XP and VEDD tokens. Progress through tiers to unlock multipliers and exclusive benefits.</p>
          <div className="grid sm:grid-cols-5 gap-3">
            {[
              { tier: 'YG', label: 'Young Grinder', xp: '0–499 XP', color: 'border-gray-500 text-gray-400', perks: 'Platform access + base earn rate' },
              { tier: 'Rising', label: 'Rising Trader', xp: '500–1,999 XP', color: 'border-blue-500 text-blue-400', perks: '1.25× VEDD multiplier + Rising badge' },
              { tier: 'Pro', label: 'Pro Trader', xp: '2,000–4,999 XP', color: 'border-purple-500 text-purple-400', perks: '1.5× multiplier + Pro signals channel' },
              { tier: 'Elite', label: 'Elite Trader', xp: '5,000–9,999 XP', color: 'border-yellow-500 text-yellow-400', perks: '2× multiplier + Elite leaderboard + prize draws' },
              { tier: 'OG', label: 'OG VEDD', xp: '10,000+ XP', color: 'border-amber-400 text-amber-400', perks: '3× multiplier + governance vote + OG community' },
            ].map((t, i) => (
              <div key={i} className={`rounded-xl border-2 ${t.color.split(' ')[0]} p-4 text-center`}>
                <p className={`text-2xl font-black ${t.color.split(' ')[1]} mb-1`}>{t.tier}</p>
                <p className="text-xs font-semibold mb-1">{t.label}</p>
                <p className="text-xs text-muted-foreground mb-2">{t.xp}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{t.perks}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center py-12 border-t border-border/50">
          <VeddLogo height={40} className="mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-4">Ready to Join the VEDD Ecosystem?</h2>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            Connect your Solana wallet and start earning VEDD through trading, referrals, community participation, and wear-to-earn clothing.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/solana-scanner">
              <Button size="lg" className="bg-gradient-to-r from-purple-600 to-pink-600">
                <SiSolana className="h-4 w-4 mr-2" />
                Start Trading
              </Button>
            </Link>
            <Link href="/referral">
              <Button size="lg" variant="outline">
                <Share2 className="h-4 w-4 mr-2" />
                Refer & Earn
              </Button>
            </Link>
            <Link href="/achievements">
              <Button size="lg" variant="outline">
                <Trophy className="h-4 w-4 mr-2" />
                View Achievements
              </Button>
            </Link>
            <Link href="/ambassador-training">
              <Button size="lg" variant="outline">
                <Gift className="h-4 w-4 mr-2" />
                Ambassador Training
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
