import { useQuery } from '@tanstack/react-query';
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
  PieChart
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
    category: 'Trading Rewards',
    icon: TrendingUp,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    actions: [
      { name: 'Chart Analysis', reward: '10 VEDD', description: 'Complete AI chart analysis' },
      { name: 'EA Strategy Creation', reward: '25 VEDD', description: 'Create multi-timeframe EA' },
      { name: 'Profitable Trade', reward: '5% of profit', description: 'Close trade in profit' },
      { name: 'Daily Login Streak', reward: '2-10 VEDD', description: 'Consecutive daily logins' }
    ]
  },
  { 
    category: 'Ambassador Rewards',
    icon: Trophy,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    actions: [
      { name: 'Training Completion', reward: '100 VEDD', description: 'Complete ambassador training' },
      { name: 'Content Creation', reward: '15 VEDD', description: 'Daily content journey posts' },
      { name: 'Host Live Session', reward: '50 VEDD', description: 'Host community event' },
      { name: 'Challenge Completion', reward: '20-50 VEDD', description: 'Complete weekly challenges' }
    ]
  },
  { 
    category: 'Referral Rewards',
    icon: Users,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    actions: [
      { name: 'New User Signup', reward: '10 VEDD', description: 'When referral creates account' },
      { name: 'First Trade', reward: '25 VEDD', description: 'When referral makes first trade' },
      { name: 'Profit Share', reward: '5% of profits', description: 'Ongoing share of referral trading profits' },
      { name: 'Ambassador Referral', reward: '50 VEDD', description: 'Referral becomes ambassador' }
    ]
  },
  { 
    category: 'Community Rewards',
    icon: MessageSquare,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    actions: [
      { name: 'Share Trade Card', reward: '5 VEDD', description: 'Share on social media' },
      { name: 'Helpful Comment', reward: '2 VEDD', description: 'Valuable community contribution' },
      { name: 'Bug Report', reward: '25-100 VEDD', description: 'Valid bug reports' },
      { name: 'Feature Suggestion', reward: '10 VEDD', description: 'Adopted feature ideas' }
    ]
  }
];

const tokenUtility = [
  { icon: Unlock, title: 'Premium Features', description: 'Access advanced AI analysis, unlimited charts, and premium EAs' },
  { icon: TrendingUp, title: 'Trading Benefits', description: 'Reduced fees, priority execution, and exclusive signals' },
  { icon: Shield, title: 'Governance', description: 'Vote on platform decisions, feature priorities, and reward rates' },
  { icon: Gift, title: 'Staking Rewards', description: 'Stake VEDD to earn additional yield and boost multipliers' },
  { icon: Trophy, title: 'Ambassador Perks', description: 'Enhanced earning rates and exclusive ambassador tools' },
  { icon: Star, title: 'NFT Access', description: 'Exclusive NFT drops and ambassador badges' }
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

const priceRoadmap: RoadmapMonth[] = [
  {
    month: 1, label: 'Month 1', quarter: 'Q1', theme: 'Foundation & Launch',
    priceTarget: '$0.001', priceRange: '$0.0008 - $0.0015', marketCap: '$250K',
    milestones: ['Token launch on Raydium/Jupiter', 'Initial liquidity pool deployment', 'AI Trading Vault beta live', 'Ambassador program opens enrollment'],
    drivers: ['Initial DEX listing excitement', 'Early adopter accumulation', 'First liquidity provision'],
    communityTarget: '500', ambassadorTarget: '10',
    color: 'text-blue-400', gradient: 'from-blue-600/20 to-blue-900/20 border-blue-500/30'
  },
  {
    month: 2, label: 'Month 2', quarter: 'Q1', theme: 'Ambassador Acceleration',
    priceTarget: '$0.0018', priceRange: '$0.0012 - $0.0025', marketCap: '$450K',
    milestones: ['44-Day Content Journey launches', 'First ambassador cohort certified', 'SOL Scanner auto-trading live', 'Referral rewards system activated'],
    drivers: ['Ambassador content driving awareness', 'Referral network effects begin', 'Trading utility creates buy pressure'],
    communityTarget: '1,500', ambassadorTarget: '50',
    color: 'text-blue-400', gradient: 'from-blue-600/20 to-blue-900/20 border-blue-500/30'
  },
  {
    month: 3, label: 'Month 3', quarter: 'Q1', theme: 'Product-Market Fit',
    priceTarget: '$0.003', priceRange: '$0.002 - $0.005', marketCap: '$750K',
    milestones: ['Multi-DEX integration (Raydium, Orca, Meteora)', 'Token-gated membership tiers live', 'EA Marketplace opens', 'First VEDD governance vote'],
    drivers: ['Utility token demand from memberships', 'EA creators earning passive income', 'Growing trading volume on platform'],
    communityTarget: '3,000', ambassadorTarget: '150',
    color: 'text-blue-400', gradient: 'from-blue-600/20 to-blue-900/20 border-blue-500/30'
  },
  {
    month: 4, label: 'Month 4', quarter: 'Q2', theme: 'Community Expansion',
    priceTarget: '$0.005', priceRange: '$0.003 - $0.008', marketCap: '$1.25M',
    milestones: ['Ambassador training V2 with video certification', 'Regional community leads appointed', 'Staking program launches', 'Partnership with first trading education platform'],
    drivers: ['Staking reduces circulating supply', 'Ambassador army creating daily content', 'First major partnership announcement'],
    communityTarget: '6,000', ambassadorTarget: '350',
    color: 'text-green-400', gradient: 'from-green-600/20 to-green-900/20 border-green-500/30'
  },
  {
    month: 5, label: 'Month 5', quarter: 'Q2', theme: 'Global Ambassador Network',
    priceTarget: '$0.008', priceRange: '$0.005 - $0.012', marketCap: '$2M',
    milestones: ['Ambassadors active in 20+ countries', 'VEDD NFT membership collection launches', 'MT5 trade copier adoption milestone', 'Community trading competitions begin'],
    drivers: ['NFT collection creates scarcity narrative', 'Global word-of-mouth marketing', 'Trading competitions drive engagement'],
    communityTarget: '12,000', ambassadorTarget: '600',
    color: 'text-green-400', gradient: 'from-green-600/20 to-green-900/20 border-green-500/30'
  },
  {
    month: 6, label: 'Month 6', quarter: 'Q2', theme: 'Ecosystem Maturity',
    priceTarget: '$0.015', priceRange: '$0.01 - $0.025', marketCap: '$3.75M',
    milestones: ['Token listed on second DEX aggregator', 'Advanced AI models integrated', 'Webhook signal system adoption spike', 'First $1M total platform trading volume'],
    drivers: ['Real trading volume validates utility', 'Additional exchange exposure', 'Word-of-mouth reaches critical mass'],
    communityTarget: '20,000', ambassadorTarget: '1,000',
    color: 'text-green-400', gradient: 'from-green-600/20 to-green-900/20 border-green-500/30'
  },
  {
    month: 7, label: 'Month 7', quarter: 'Q3', theme: 'Institutional Interest',
    priceTarget: '$0.025', priceRange: '$0.015 - $0.04', marketCap: '$6.25M',
    milestones: ['CEX listing application submitted', 'API for third-party integrations', 'Copy trading across platforms', 'Ambassador-led regional events'],
    drivers: ['CEX listing anticipation', 'B2B utility expansion', 'Growing daily active traders'],
    communityTarget: '35,000', ambassadorTarget: '1,500',
    color: 'text-yellow-400', gradient: 'from-yellow-600/20 to-yellow-900/20 border-yellow-500/30'
  },
  {
    month: 8, label: 'Month 8', quarter: 'Q3', theme: 'Revenue Sharing Launch',
    priceTarget: '$0.04', priceRange: '$0.025 - $0.06', marketCap: '$10M',
    milestones: ['Platform revenue sharing for stakers', 'Premium signal subscription tier', 'Mobile app beta launch', 'Ambassador summit (virtual)'],
    drivers: ['Revenue-backed token value', 'Mobile expands addressable market', 'Staking APY attracts holders'],
    communityTarget: '50,000', ambassadorTarget: '2,500',
    color: 'text-yellow-400', gradient: 'from-yellow-600/20 to-yellow-900/20 border-yellow-500/30'
  },
  {
    month: 9, label: 'Month 9', quarter: 'Q3', theme: 'Market Penetration',
    priceTarget: '$0.065', priceRange: '$0.04 - $0.10', marketCap: '$16.25M',
    milestones: ['First CEX listing goes live', 'AI accuracy exceeds 75% signal rate', 'Cross-chain expansion announced', 'VEDD burn mechanism introduced'],
    drivers: ['CEX listing brings massive new audience', 'Proven track record attracts traders', 'Token burn creates deflationary pressure'],
    communityTarget: '80,000', ambassadorTarget: '4,000',
    color: 'text-yellow-400', gradient: 'from-yellow-600/20 to-yellow-900/20 border-yellow-500/30'
  },
  {
    month: 10, label: 'Month 10', quarter: 'Q4', theme: 'Scaling & Partnerships',
    priceTarget: '$0.10', priceRange: '$0.06 - $0.15', marketCap: '$25M',
    milestones: ['Strategic partnership with major broker', 'VEDD integrated into partner platforms', 'Ambassador certification recognized industry-wide', 'DAO governance fully operational'],
    drivers: ['Broker partnership validates project', 'Cross-platform utility increases demand', 'DAO governance attracts governance token investors'],
    communityTarget: '120,000', ambassadorTarget: '6,000',
    color: 'text-purple-400', gradient: 'from-purple-600/20 to-purple-900/20 border-purple-500/30'
  },
  {
    month: 11, label: 'Month 11', quarter: 'Q4', theme: 'Mass Adoption Push',
    priceTarget: '$0.15', priceRange: '$0.10 - $0.25', marketCap: '$37.5M',
    milestones: ['Second CEX listing', 'Multi-language platform support', 'Ambassador program in 50+ countries', 'VEDD Debit Card partnership announced'],
    drivers: ['Additional CEX exposure', 'Global accessibility drives adoption', 'Real-world utility narrative'],
    communityTarget: '175,000', ambassadorTarget: '8,500',
    color: 'text-purple-400', gradient: 'from-purple-600/20 to-purple-900/20 border-purple-500/30'
  },
  {
    month: 12, label: 'Month 12', quarter: 'Q4', theme: 'Year One Complete',
    priceTarget: '$0.25', priceRange: '$0.15 - $0.40', marketCap: '$62.5M',
    milestones: ['Year-end ambassador gala event', 'Advanced AI V2 with proprietary models', 'Institutional trading desk beta', '500K+ community members target'],
    drivers: ['Full ecosystem delivering real value', 'Institutional demand begins', 'Community flywheel at full speed', 'Strong brand recognition in crypto trading'],
    communityTarget: '250,000', ambassadorTarget: '12,000',
    color: 'text-purple-400', gradient: 'from-purple-600/20 to-purple-900/20 border-purple-500/30'
  },
];

const quarterSummary = [
  {
    quarter: 'Q1',
    title: 'Foundation & Launch',
    subtitle: 'Months 1-3',
    priceStart: '$0.001',
    priceEnd: '$0.003',
    growth: '200%',
    focus: 'Token launch, ambassador program kickoff, core platform features, initial community building',
    color: 'from-blue-600 to-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/30',
  },
  {
    quarter: 'Q2',
    title: 'Community Expansion',
    subtitle: 'Months 4-6',
    priceStart: '$0.005',
    priceEnd: '$0.015',
    growth: '200%',
    focus: 'Global ambassador network, staking launch, NFT memberships, ecosystem maturity',
    color: 'from-green-600 to-green-400',
    bgColor: 'bg-green-500/10 border-green-500/30',
  },
  {
    quarter: 'Q3',
    title: 'Revenue & CEX',
    subtitle: 'Months 7-9',
    priceStart: '$0.025',
    priceEnd: '$0.065',
    growth: '160%',
    focus: 'CEX listing, revenue sharing, mobile app, token burn mechanism',
    color: 'from-yellow-600 to-yellow-400',
    bgColor: 'bg-yellow-500/10 border-yellow-500/30',
  },
  {
    quarter: 'Q4',
    title: 'Mass Adoption',
    subtitle: 'Months 10-12',
    priceStart: '$0.10',
    priceEnd: '$0.25',
    growth: '150%',
    focus: 'Strategic partnerships, multi-CEX presence, global scaling, institutional interest',
    color: 'from-purple-600 to-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/30',
  },
];

export default function VeddTokenomics() {
  const { data: rewardConfigs = [] } = useQuery<RewardConfig[]>({
    queryKey: ['/api/vedd/config']
  });
  
  const { data: rewardSummary } = useQuery<RewardSummary>({
    queryKey: ['/api/vedd/rewards/summary']
  });
  
  const totalSupply = 1000000000;
  const circulatingSupply = 250000000;
  const rewardsDistributed = 12500000;
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-purple-900/5 to-background">
      <div className="container mx-auto px-4 py-8">
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
              <p className="text-3xl font-bold">250M</p>
              <p className="text-sm text-muted-foreground">Circulating</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-600/20 to-yellow-900/20 border-yellow-500/30">
            <CardContent className="pt-6 text-center">
              <Gift className="h-8 w-8 mx-auto mb-2 text-yellow-400" />
              <p className="text-3xl font-bold">12.5M</p>
              <p className="text-sm text-muted-foreground">Rewards Distributed</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-600/20 to-blue-900/20 border-blue-500/30">
            <CardContent className="pt-6 text-center">
              <Users className="h-8 w-8 mx-auto mb-2 text-blue-400" />
              <p className="text-3xl font-bold">5,000+</p>
              <p className="text-sm text-muted-foreground">Token Holders</p>
            </CardContent>
          </Card>
        </div>
        
        <Tabs defaultValue="allocation" className="mb-12">
          <TabsList className="grid grid-cols-5 w-full max-w-3xl mx-auto mb-8">
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
                    <h2 className="text-2xl font-bold mb-2">12-Month VEDD Price Projection</h2>
                    <p className="text-muted-foreground max-w-2xl mx-auto">
                      Price expectations backed by platform build-out milestones, ambassador-driven community growth, 
                      and expanding token utility throughout the VEDD ecosystem.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    {quarterSummary.map((q, idx) => (
                      <div key={idx} className={`rounded-lg border p-4 text-center ${q.bgColor}`}>
                        <Badge className={`bg-gradient-to-r ${q.color} text-white border-0 mb-2`}>{q.quarter}</Badge>
                        <p className="text-xs text-muted-foreground mb-1">{q.subtitle}</p>
                        <p className="font-bold text-lg">{q.priceEnd}</p>
                        <p className="text-xs text-muted-foreground">{q.priceStart} → {q.priceEnd}</p>
                        <Badge variant="outline" className="mt-2 text-green-400 border-green-500/30">+{q.growth}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
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
                      <p className="text-sm text-muted-foreground">Price Growth Target</p>
                      <p className="text-xs text-muted-foreground">$0.001 → $0.25</p>
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
              
              <Card className="bg-yellow-500/5 border-yellow-500/20">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-400">Important Disclaimer</p>
                      <p className="text-sm text-muted-foreground">
                        These price projections are based on planned development milestones, community growth targets, 
                        and utility expansion. Actual token prices are determined by market conditions and are not guaranteed. 
                        Cryptocurrency investments carry significant risk. Always do your own research (DYOR) and never 
                        invest more than you can afford to lose. Past performance does not guarantee future results.
                      </p>
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
            
            <Card className="mt-6 bg-gradient-to-r from-purple-900/30 to-pink-900/30 border-purple-500/30">
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
                
                <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-400">Pool Wallet Security</p>
                      <p className="text-sm text-muted-foreground">
                        The rewards pool is managed by a secure multi-sig wallet. Admins can deposit tokens, 
                        and the system automatically distributes rewards when actions are verified. 
                        All transactions are recorded on-chain for transparency.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        {/* CTA Section */}
        <div className="text-center py-12 border-t border-border/50">
          <VeddLogo height={40} className="mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-4">Ready to Join the VEDD Ecosystem?</h2>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            Connect your Solana wallet and start earning VEDD through trading, referrals, and community participation.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/solana-scanner">
              <Button size="lg" className="bg-gradient-to-r from-purple-600 to-pink-600">
                <SiSolana className="h-4 w-4 mr-2" />
                Start Trading
              </Button>
            </Link>
            <Link href="/sol-scanner">
              <Button size="lg" variant="outline">
                <Share2 className="h-4 w-4 mr-2" />
                Refer & Earn
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
