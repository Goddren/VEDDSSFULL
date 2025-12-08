import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Share2, Twitter, Facebook, Linkedin, MessageCircle, Download, Copy, ExternalLink, Loader2 } from 'lucide-react';

interface ChartAnalysisSummary {
  timeframe: string;
  direction: string;
  confidence: string;
  patterns: string[];
  entryPoint: string;
  stopLoss: string;
  takeProfit: string;
}

interface UnifiedSignal {
  direction: string;
  confidence: number;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  riskReward: string;
}

interface ShareCardDialogProps {
  eaId: number;
  eaName: string;
  symbol: string;
  chartAnalyses?: ChartAnalysisSummary[];
  unifiedSignal?: UnifiedSignal;
  trigger?: React.ReactNode;
}

interface ShareCardResponse {
  success: boolean;
  shareAsset: any;
  shareCardUrl: string;
  shareUrl: string;
  socialShareUrls: {
    twitter: string;
    facebook: string;
    linkedin: string;
    whatsapp: string;
  };
}

export function ShareCardDialog({ 
  eaId, 
  eaName, 
  symbol, 
  chartAnalyses = [], 
  unifiedSignal,
  trigger 
}: ShareCardDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [shareData, setShareData] = useState<ShareCardResponse | null>(null);

  const generateShareCardMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/eas/${eaId}/share-card`, {
        chartAnalyses,
        unifiedSignal
      });
      return response.json() as Promise<ShareCardResponse>;
    },
    onSuccess: (data) => {
      setShareData(data);
      toast({ title: 'Share card generated!', description: 'Your branded share card is ready.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Generation failed', description: error.message, variant: 'destructive' });
    }
  });

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setShareData(null);
      generateShareCardMutation.mutate();
    }
  };

  const handleShare = async (platform: string, url: string) => {
    try {
      await apiRequest('POST', `/api/share/${shareData?.shareUrl?.replace('/share/', '')}/track`, { platform });
    } catch (e) {
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = async () => {
    if (shareData?.shareUrl) {
      const fullUrl = `${window.location.origin}${shareData.shareUrl}`;
      await navigator.clipboard.writeText(fullUrl);
      toast({ title: 'Link copied!', description: 'Share link copied to clipboard.' });
    }
  };

  const handleDownload = () => {
    if (shareData?.shareCardUrl) {
      const link = document.createElement('a');
      link.href = shareData.shareCardUrl;
      link.download = `${eaName.replace(/\s+/g, '-')}-share-card.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: 'Downloaded!', description: 'Share card saved to your device.' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" data-testid={`button-share-social-${eaId}`}>
            <Share2 className="w-4 h-4 mr-1" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Share Your Analysis
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {generateShareCardMutation.isPending ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Generating your branded share card...</p>
            </div>
          ) : shareData ? (
            <>
              <div className="relative rounded-lg overflow-hidden border bg-card">
                <img 
                  src={shareData.shareCardUrl} 
                  alt="Share Card Preview" 
                  className="w-full h-auto"
                  data-testid="img-share-card-preview"
                />
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button 
                    size="sm" 
                    variant="secondary" 
                    onClick={handleDownload}
                    data-testid="button-download-share-card"
                    className="h-8"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Share on social networks:</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 border-[#1DA1F2]/30"
                    onClick={() => handleShare('twitter', shareData.socialShareUrls.twitter)}
                    data-testid="button-share-twitter"
                  >
                    <Twitter className="w-4 h-4 text-[#1DA1F2]" />
                    Twitter/X
                  </Button>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 bg-[#1877F2]/10 hover:bg-[#1877F2]/20 border-[#1877F2]/30"
                    onClick={() => handleShare('facebook', shareData.socialShareUrls.facebook)}
                    data-testid="button-share-facebook"
                  >
                    <Facebook className="w-4 h-4 text-[#1877F2]" />
                    Facebook
                  </Button>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 border-[#0A66C2]/30"
                    onClick={() => handleShare('linkedin', shareData.socialShareUrls.linkedin)}
                    data-testid="button-share-linkedin"
                  >
                    <Linkedin className="w-4 h-4 text-[#0A66C2]" />
                    LinkedIn
                  </Button>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 border-[#25D366]/30"
                    onClick={() => handleShare('whatsapp', shareData.socialShareUrls.whatsapp)}
                    data-testid="button-share-whatsapp"
                  >
                    <MessageCircle className="w-4 h-4 text-[#25D366]" />
                    WhatsApp
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleCopyLink}
                  data-testid="button-copy-share-link"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Link
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(`${window.location.origin}${shareData.shareUrl}`, '_blank', 'noopener,noreferrer')}
                  data-testid="button-view-share-page"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Page
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Your analysis includes today's trading wisdom and VEDD AI branding
              </p>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>Failed to generate share card. Please try again.</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => generateShareCardMutation.mutate()}
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
