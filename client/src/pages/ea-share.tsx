import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Share2, Copy, Check, Twitter, Facebook, Linkedin, MessageCircle, Download, User, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

interface ShareData {
  shareAsset: {
    id: number;
    eaId: number;
    shareUrl: string;
    shareCardUrl: string;
    scripture: string;
    scriptureReference: string;
    chartAnalysesSummary: any;
    unifiedSignal: any;
    viewCount: number;
    shareCount: number;
  };
  ea: {
    name: string;
    symbol: string;
    platformType: string;
  } | null;
  creatorName: string;
}

export default function EASharePage() {
  const { slug } = useParams<{ slug: string }>();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [copySuccess, setCopySuccess] = useState(false);

  const { data, isLoading, error } = useQuery<ShareData, Error>({
    queryKey: ['/api/share', slug],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/share/${slug}`);
      if (!res.ok) {
        throw new Error('Shared analysis not found');
      }
      return await res.json();
    },
    retry: false,
    enabled: !!slug
  });

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      toast({ title: 'Link copied!', description: 'Share link copied to clipboard.' });
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      toast({ title: 'Copy failed', description: 'Please copy the URL manually.', variant: 'destructive' });
    }
  };

  const handleDownload = () => {
    if (data?.shareAsset.shareCardUrl) {
      const link = document.createElement('a');
      link.href = data.shareAsset.shareCardUrl;
      link.download = `${data.ea?.name || 'trading-analysis'}-share-card.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: 'Downloaded!', description: 'Share card saved to your device.' });
    }
  };

  const shareOnPlatform = (platform: string) => {
    const shareUrl = window.location.href;
    const text = data?.ea 
      ? `Check out this ${data.ea.symbol} trading analysis from AI Trading Vault!`
      : 'Check out this trading analysis from AI Trading Vault!';

    let url = '';
    switch (platform) {
      case 'twitter':
        url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
        break;
      case 'facebook':
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        break;
      case 'linkedin':
        url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        break;
      case 'whatsapp':
        url = `https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`;
        break;
    }

    if (url) {
      apiRequest('POST', `/api/share/${slug}/track`, { platform }).catch(() => {});
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="animate-spin h-12 w-12 text-primary mb-4" />
          <p className="text-muted-foreground">Loading shared analysis...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <Share2 className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Share Not Found</h2>
              <p className="text-muted-foreground mb-6">
                This shared analysis may have been removed or the link is invalid.
              </p>
              <Button onClick={() => navigate('/')} data-testid="button-return-home">
                Return to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { shareAsset, ea, creatorName } = data;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate('/')}
              className="mr-2 h-10 w-10 rounded-full"
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold flex items-center">
              <Share2 className="h-6 w-6 mr-2 text-primary" />
              Shared Trading Analysis
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span>Shared by {creatorName}</span>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <Card>
              <CardContent className="p-0">
                {shareAsset.shareCardUrl ? (
                  <img 
                    src={shareAsset.shareCardUrl} 
                    alt="Trading Analysis Share Card" 
                    className="w-full h-auto rounded-t-lg"
                    data-testid="img-share-card"
                  />
                ) : (
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <TrendingUp className="h-16 w-16 text-muted-foreground" />
                  </div>
                )}
              </CardContent>
            </Card>

            {shareAsset.scripture && (
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Daily Trading Wisdom</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm italic text-muted-foreground">"{shareAsset.scripture}"</p>
                  <p className="text-xs text-primary mt-2">— {shareAsset.scriptureReference}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            {ea && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Analysis Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Strategy</span>
                    <span className="text-sm font-medium">{ea.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Symbol</span>
                    <span className="text-sm font-medium">{ea.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Platform</span>
                    <span className="text-sm font-medium">{ea.platformType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Views</span>
                    <span className="text-sm font-medium">{shareAsset.viewCount}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Share This Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 border-[#1DA1F2]/30"
                    onClick={() => shareOnPlatform('twitter')}
                    data-testid="button-share-twitter"
                  >
                    <Twitter className="w-4 h-4 mr-1 text-[#1DA1F2]" />
                    Twitter
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-[#1877F2]/10 hover:bg-[#1877F2]/20 border-[#1877F2]/30"
                    onClick={() => shareOnPlatform('facebook')}
                    data-testid="button-share-facebook"
                  >
                    <Facebook className="w-4 h-4 mr-1 text-[#1877F2]" />
                    Facebook
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 border-[#0A66C2]/30"
                    onClick={() => shareOnPlatform('linkedin')}
                    data-testid="button-share-linkedin"
                  >
                    <Linkedin className="w-4 h-4 mr-1 text-[#0A66C2]" />
                    LinkedIn
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-[#25D366]/10 hover:bg-[#25D366]/20 border-[#25D366]/30"
                    onClick={() => shareOnPlatform('whatsapp')}
                    data-testid="button-share-whatsapp"
                  >
                    <MessageCircle className="w-4 h-4 mr-1 text-[#25D366]" />
                    WhatsApp
                  </Button>
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={copyToClipboard}
                    data-testid="button-copy-link"
                  >
                    {copySuccess ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                    {copySuccess ? 'Copied!' : 'Copy Link'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleDownload}
                    data-testid="button-download"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-4">
                <div className="text-center">
                  <p className="text-sm font-medium mb-2">Want to create your own analysis?</p>
                  <Link to="/analysis">
                    <Button size="sm" className="w-full" data-testid="button-try-vedd">
                      Try AI Trading Vault Free
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
