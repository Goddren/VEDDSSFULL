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
          <TabsList className="grid grid-cols-4 w-full max-w-2xl mx-auto mb-8">
            <TabsTrigger value="allocation">Allocation</TabsTrigger>
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
