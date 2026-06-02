import React, { useState } from 'react';
import { Users, Gift, Share, Award, ExternalLink, Copy, CheckCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';

interface ReferralCardProps {
  className?: string;
}

export function ReferralCard({ className = '' }: ReferralCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Fetch real referral link from API
  const { data: referralData, isLoading } = useQuery<{ code: string; url: string; shortUrl: string }>({
    queryKey: ['/api/referral/my-link'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // code won't change often
  });

  const referralCode = referralData?.code ?? '';
  const referralUrl = referralData?.url ?? '';
  const referralCredits = (user as any)?.referralCredits ?? 0;

  const handleCopyCode = () => {
    if (!referralCode) return;
    navigator.clipboard.writeText(referralCode);
    setCopiedCode(true);
    toast({ title: 'Copied!', description: 'Referral code copied to clipboard' });
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const handleCopyLink = () => {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl);
    setCopiedLink(true);
    toast({ title: 'Copied!', description: 'Referral link copied to clipboard' });
    setTimeout(() => setCopiedLink(false), 3000);
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Gift className="h-5 w-5 mr-2 text-amber-500" /> Refer &amp; Earn Program
        </CardTitle>
        <CardDescription>
          Invite friends and earn VEDD tokens. Each successful referral earns you 500 credits.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading your referral link…
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium mb-1">Your Referral Code</p>
                <div className="flex items-center space-x-2">
                  <code className="bg-muted p-2 rounded text-sm font-mono tracking-wider">
                    {referralCode || '—'}
                  </code>
                  <Button size="sm" variant="outline" onClick={handleCopyCode} disabled={!referralCode}>
                    {copiedCode ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium mb-1">Your Credits</p>
                <p className="text-2xl font-bold text-amber-400">{referralCredits.toLocaleString()}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Share Your Link</p>
              <div className="flex space-x-2">
                <Input value={referralUrl} readOnly className="flex-1 text-xs" placeholder="Generating link…" />
                <Button size="sm" variant="outline" onClick={handleCopyLink} disabled={!referralUrl}>
                  {copiedLink ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm font-semibold mb-2">How It Works</p>
              <ul className="text-xs space-y-2">
                <li className="flex items-start">
                  <Share className="h-3.5 w-3.5 mr-2 mt-0.5 text-blue-400" />
                  <span>Share your referral link or code with friends</span>
                </li>
                <li className="flex items-start">
                  <Users className="h-3.5 w-3.5 mr-2 mt-0.5 text-green-400" />
                  <span>They sign up via your link — you both get rewarded</span>
                </li>
                <li className="flex items-start">
                  <Award className="h-3.5 w-3.5 mr-2 mt-0.5 text-amber-400" />
                  <span>+50 VEDD when they sign up · +200 VEDD when they subscribe</span>
                </li>
                <li className="flex items-start">
                  <ExternalLink className="h-3.5 w-3.5 mr-2 mt-0.5 text-purple-400" />
                  <span>Compete on the leaderboard for bonus rewards</span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Link href="/referral-hub" className="w-full">
          <Button variant="outline" className="w-full">
            <Users className="h-4 w-4 mr-2" /> View Full Referral Hub
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}

export default ReferralCard;
