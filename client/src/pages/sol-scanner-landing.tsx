import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Brain, 
  Zap, 
  TrendingUp, 
  Shield, 
  Clock, 
  DollarSign, 
  Share2, 
  Users, 
  ArrowRight,
  Copy,
  CheckCircle,
  Wallet,
  BarChart3,
  Target,
  Gift
} from 'lucide-react';
import { SiSolana } from 'react-icons/si';
import { useToast } from '@/hooks/use-toast';
import VeddLogo from '@/components/ui/vedd-logo';

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'VEDD';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function SolScannerLanding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [referralCode, setReferralCode] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [referralStats, setReferralStats] = useState({
    referrals: 0,
    earnings: 0
  });
  
  // Get or generate referral code
  useEffect(() => {
    const stored = localStorage.getItem('vedd_referral_code');
    if (stored) {
      setReferralCode(stored);
    } else {
      const newCode = generateReferralCode();
      localStorage.setItem('vedd_referral_code', newCode);
      setReferralCode(newCode);
    }
    
    // Load referral stats
    const stats = localStorage.getItem('vedd_referral_stats');
    if (stats) {
      setReferralStats(JSON.parse(stats));
    }
  }, []);
  
  // Check for referral in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && ref !== referralCode) {
      localStorage.setItem('vedd_referred_by', ref);
      toast({
        title: 'Referral Applied!',
        description: `You were referred by code ${ref}. Start trading to earn rewards!`
      });
    }
  }, [referralCode]);
  
  const shareLink = `${window.location.origin}/sol-scanner?ref=${referralCode}`;
  
  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    toast({ title: 'Link Copied!', description: 'Share this link to earn VEDD rewards' });
    setTimeout(() => setCopied(false), 2000);
  };
  
  const features = [
    {
      icon: Brain,
      title: 'AI-Powered Analysis',
      description: 'Advanced AI scans trending Solana tokens analyzing sentiment, tokenomics, and whale activity in real-time'
    },
    {
      icon: Zap,
      title: 'Auto-Trading',
      description: 'Automatically buy tokens when strong signals detected and sell at take-profit or stop-loss targets'
    },
    {
      icon: Shield,
      title: 'Risk Management',
      description: 'Built-in stop-loss, take-profit, and pump detection to protect your capital'
    },
    {
      icon: TrendingUp,
      title: 'Live P&L Tracking',
      description: 'Real-time profit/loss tracking with shareable performance cards'
    },
    {
      icon: Clock,
      title: '24/7 Monitoring',
      description: 'AI never sleeps - monitors markets around the clock for opportunities'
    },
    {
      icon: Share2,
      title: 'Social Sharing',
      description: 'Share your trade wins with branded cards on Twitter and social media'
    }
  ];
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900">
      {/* Hero Section */}
      <div className="container mx-auto px-4 pt-8 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <VeddLogo height={40} />
          <div className="flex items-center gap-4">
            <Link href="/solana-scanner">
              <Button variant="outline" className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                Launch Scanner
              </Button>
            </Link>
            <Link href="/">
              <Button variant="ghost" className="text-gray-400">
                Trading Vault
              </Button>
            </Link>
          </div>
        </div>
        
        {/* Hero Content */}
        <div className="text-center max-w-4xl mx-auto mb-16">
          <Badge className="mb-4 bg-purple-500/20 text-purple-300 border-purple-500/30">
            <SiSolana className="h-3 w-3 mr-1" />
            Powered by AI + Solana
          </Badge>
          
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
            AI Solana Token Scanner
          </h1>
          
          <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            Discover and auto-trade trending Solana tokens with AI-powered signals. 
            Get real-time buy/sell recommendations backed by sentiment, tokenomics, and whale activity analysis.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-lg px-8"
              onClick={() => setLocation('/solana-scanner')}
            >
              <Wallet className="h-5 w-5 mr-2" />
              Start Trading Now
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-purple-500/30 text-purple-400 text-lg px-8"
              onClick={() => setLocation('/sol-scanner/trades')}
            >
              <BarChart3 className="h-5 w-5 mr-2" />
              View All Trades
            </Button>
          </div>
          
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <p className="text-2xl font-bold text-green-400">24/7</p>
              <p className="text-xs text-gray-500">AI Monitoring</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <p className="text-2xl font-bold text-purple-400">100+</p>
              <p className="text-xs text-gray-500">Tokens Scanned</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <p className="text-2xl font-bold text-blue-400">Free</p>
              <p className="text-xs text-gray-500">To Start</p>
            </div>
          </div>
        </div>
        
        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {features.map((feature, idx) => (
            <Card key={idx} className="bg-gray-800/50 border-gray-700/50 hover:border-purple-500/30 transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <feature.icon className="h-5 w-5 text-purple-400" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-400">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* How It Works */}
        <div className="max-w-4xl mx-auto mb-16">
          <h2 className="text-3xl font-bold text-center mb-8">How It Works</h2>
          
          <div className="grid md:grid-cols-4 gap-4">
            {[
              { step: '1', title: 'Connect Wallet', desc: 'Link your Phantom wallet to start' },
              { step: '2', title: 'Enable Auto-Trade', desc: 'Set your risk preferences' },
              { step: '3', title: 'AI Scans Tokens', desc: 'AI analyzes trending tokens 24/7' },
              { step: '4', title: 'Profit', desc: 'Auto-buy signals & auto-sell at targets' }
            ].map((item, idx) => (
              <div key={idx} className="text-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xl font-bold mx-auto mb-3">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-1">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
        
        {/* Referral Section */}
        <Card className="max-w-2xl mx-auto bg-gradient-to-r from-purple-900/50 to-pink-900/50 border-purple-500/30 mb-16">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Gift className="h-6 w-6 text-yellow-400" />
              <CardTitle className="text-2xl">Earn VEDD Rewards</CardTitle>
            </div>
            <CardDescription className="text-gray-300">
              Share your referral link and earn 5% of your referrals' trading profits, paid in VEDD tokens!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-4">
              <Input 
                value={shareLink} 
                readOnly 
                className="bg-gray-800/50 border-gray-600"
              />
              <Button onClick={copyLink} variant="outline" className="shrink-0">
                {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-purple-500/30">
                  Your Code: {referralCode}
                </Badge>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-gray-400">
                  <Users className="h-4 w-4 inline mr-1" />
                  {referralStats.referrals} referrals
                </span>
                <span className="text-green-400">
                  <DollarSign className="h-4 w-4 inline mr-1" />
                  {referralStats.earnings.toFixed(2)} VEDD earned
                </span>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-700/50 text-center">
              <p className="text-xs text-gray-500">
                Referral earnings are backed by the VEDD token ecosystem. 
                <Link href="/vedd-tokenomics" className="text-purple-400 hover:underline ml-1">
                  Learn more about VEDD Tokenomics
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
        
        {/* CTA Section */}
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Trading?</h2>
          <p className="text-gray-400 mb-6">Join the VEDD AI Trading community and let AI work for you</p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              onClick={() => setLocation('/solana-scanner')}
            >
              <Brain className="h-5 w-5 mr-2" />
              Launch AI Scanner
            </Button>
            <Link href="/">
              <Button size="lg" variant="outline" className="border-purple-500/30">
                <Target className="h-5 w-5 mr-2" />
                Enter Trading Vault
              </Button>
            </Link>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500">
          <VeddLogo height={24} className="mx-auto mb-4" />
          <p>VEDD AI Trading Vault - Empowering traders with intelligent tools</p>
          <p className="mt-2">All trading involves risk. Only trade what you can afford to lose.</p>
        </div>
      </footer>
    </div>
  );
}
