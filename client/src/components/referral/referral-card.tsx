import React, { useState } from 'react';
import { Users, Gift, Share, Award, ExternalLink, Copy, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

interface ReferralCardProps {
  className?: string;
  preview?: boolean;
}

export function ReferralCard({ className = '', preview = false }: ReferralCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  
  // Force preview mode until database is updated
  preview = true;
  
  // This will be populated from the backend once fully implemented
  const referralCode = 'COMINGSOON';
  const referralCredits = 0;
  const referralUrl = `${window.location.origin}/auth?ref=${referralCode}`;
  
  // Mock leaderboard data for preview
  const mockLeaderboard = [
    { username: 'trader1', referrals: 15 },
    { username: 'cryptoqueen', referrals: 12 },
    { username: 'forexmaster', referrals: 10 },
    { username: 'investorpro', referrals: 8 },
    { username: 'wallstreetbets', referrals: 5 }
  ];

  const handleCopyCode = () => {
    if (preview) {
      toast({
        title: "Coming Soon!",
        description: "Our referral program will be available soon.",
      });
      return;
    }
    
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    toast({
      title: "Copied!",
      description: "Referral code copied to clipboard",
    });
    setTimeout(() => setCopied(false), 3000);
  };

  const handleCopyLink = () => {
    if (preview) {
      toast({
        title: "Coming Soon!",
        description: "Our referral program will be available soon.",
      });
      return;
    }
    
    navigator.clipboard.writeText(referralUrl);
    toast({
      title: "Copied!",
      description: "Referral link copied to clipboard",
    });
  };

  if (preview) {
    return (
      <Card className={`${className} relative overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/30 to-purple-600/30 z-0" />
        <div className="absolute top-0 right-0 bg-gradient-to-bl from-pink-500 to-purple-600 text-white px-4 py-1 rounded-bl-lg font-bold text-xs z-10">
          COMING SOON
        </div>
        <CardHeader className="relative z-10">
          <CardTitle className="flex items-center text-xl">
            <Gift className="h-5 w-5 mr-2 text-amber-500" /> Refer & Earn Program
          </CardTitle>
          <CardDescription>
            Invite friends and earn trading credits
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="grid gap-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium mb-1">Your Referral Code</p>
                <div className="flex items-center space-x-2">
                  <code className="bg-muted p-2 rounded text-sm">COMINGSOON</code>
                  <Button size="sm" variant="outline" onClick={handleCopyCode}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium mb-1">Your Credits</p>
                <p className="text-2xl font-bold">0</p>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="relative z-10 flex justify-between">
          <Button variant="outline" disabled className="w-full">
            <Users className="h-4 w-4 mr-2" /> View Leaderboard
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Gift className="h-5 w-5 mr-2 text-amber-500" /> Refer & Earn Program
        </CardTitle>
        <CardDescription>
          Invite friends and earn trading credits. Each successful referral earns you 500 credits.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-medium mb-1">Your Referral Code</p>
              <div className="flex items-center space-x-2">
                <code className="bg-muted p-2 rounded text-sm">{referralCode}</code>
                <Button size="sm" variant="outline" onClick={handleCopyCode}>
                  {copied ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium mb-1">Your Credits</p>
              <p className="text-2xl font-bold">{referralCredits}</p>
            </div>
          </div>
          
          <div>
            <p className="text-sm font-medium mb-2">Share Your Link</p>
            <div className="flex space-x-2">
              <Input value={referralUrl} readOnly className="flex-1" />
              <Button size="sm" variant="outline" onClick={handleCopyLink}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-sm font-semibold mb-2">How It Works</p>
            <ul className="text-xs space-y-2">
              <li className="flex items-start">
                <Share className="h-3.5 w-3.5 mr-2 mt-0.5 text-blue-400" /> 
                <span>Share your referral code with friends</span>
              </li>
              <li className="flex items-start">
                <Users className="h-3.5 w-3.5 mr-2 mt-0.5 text-green-400" /> 
                <span>When they sign up using your code, you both get rewarded</span>
              </li>
              <li className="flex items-start">
                <Award className="h-3.5 w-3.5 mr-2 mt-0.5 text-amber-400" /> 
                <span>Use credits for premium features and analysis</span>
              </li>
              <li className="flex items-start">
                <ExternalLink className="h-3.5 w-3.5 mr-2 mt-0.5 text-purple-400" /> 
                <span>Compete on the leaderboard for bonus rewards</span>
              </li>
            </ul>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" className="w-full">
          <Users className="h-4 w-4 mr-2" /> View Leaderboard
        </Button>
      </CardFooter>
    </Card>
  );
}

export default ReferralCard;