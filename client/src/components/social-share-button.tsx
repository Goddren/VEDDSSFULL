import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Share2, Twitter, Instagram, Linkedin, Facebook, 
  Check, Loader2, Link2, ExternalLink, Upload, Plus,
  Image as ImageIcon, Video, FileText, Sparkles, X
} from "lucide-react";
import { SiTiktok, SiX } from "react-icons/si";
import { cn } from "@/lib/utils";

interface ConnectedAccount {
  id: number;
  platform: string;
  platformUsername: string | null;
  isActive: boolean;
}

interface SocialShareButtonProps {
  caption?: string;
  hashtags?: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'carousel' | 'thread';
  carouselFiles?: File[];
  sourceType: 'content_journey' | 'analysis' | 'ea_share' | 'manual';
  sourceId?: number;
  platform?: string;
  onShareComplete?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  showLabel?: boolean;
  disabled?: boolean;
}

const platformConfig: Record<string, { icon: typeof Twitter; name: string; color: string; bgColor: string }> = {
  twitter: { icon: SiX, name: 'X (Twitter)', color: 'text-white', bgColor: 'bg-black hover:bg-gray-900' },
  facebook: { icon: Facebook, name: 'Facebook', color: 'text-white', bgColor: 'bg-blue-600 hover:bg-blue-700' },
  instagram: { icon: Instagram, name: 'Instagram', color: 'text-white', bgColor: 'bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 hover:opacity-90' },
  linkedin: { icon: Linkedin, name: 'LinkedIn', color: 'text-white', bgColor: 'bg-blue-700 hover:bg-blue-800' },
  tiktok: { icon: SiTiktok, name: 'TikTok', color: 'text-white', bgColor: 'bg-black hover:bg-gray-900' }
};

export function SocialShareButton({
  caption = '',
  hashtags = [],
  mediaUrl,
  mediaType = 'image',
  carouselFiles = [],
  sourceType,
  sourceId,
  platform,
  onShareComplete,
  variant = 'default',
  size = 'default',
  className,
  showLabel = true,
  disabled = false
}: SocialShareButtonProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(platform ? [platform] : []);
  const [customCaption, setCustomCaption] = useState(caption);
  const [isSharing, setIsSharing] = useState(false);

  const { data: connectedAccounts = [], isLoading: isLoadingAccounts } = useQuery<ConnectedAccount[]>({
    queryKey: ['/api/social/accounts'],
    enabled: isOpen
  });

  const shareMutation = useMutation({
    mutationFn: async (platforms: string[]) => {
      const results = await Promise.all(
        platforms.map(async (p) => {
          const response = await apiRequest('POST', '/api/social/share', {
            platform: p,
            contentType: mediaType,
            caption: customCaption,
            mediaUrls: mediaUrl ? [mediaUrl] : [],
            hashtags,
            sourceType,
            sourceId
          });
          return response.json();
        })
      );
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['/api/social/posts'] });
      toast({
        title: "Shared Successfully!",
        description: `Your content was shared to ${selectedPlatforms.length} platform(s).`,
      });
      setIsOpen(false);
      onShareComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Share Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleShare = async () => {
    if (selectedPlatforms.length === 0) {
      toast({
        title: "Select Platforms",
        description: "Please select at least one platform to share to.",
        variant: "destructive",
      });
      return;
    }

    const unconnectedPlatforms = selectedPlatforms.filter(
      p => !connectedAccounts.find(a => a.platform === p && a.isActive)
    );

    if (unconnectedPlatforms.length > 0) {
      toast({
        title: "Connect Accounts First",
        description: `Please connect your ${unconnectedPlatforms.join(', ')} account(s) to share.`,
        variant: "destructive",
      });
      return;
    }

    setIsSharing(true);
    try {
      await shareMutation.mutateAsync(selectedPlatforms);
    } finally {
      setIsSharing(false);
    }
  };

  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [platformUsername, setPlatformUsername] = useState('');

  const connectMutation = useMutation({
    mutationFn: async ({ platform, username }: { platform: string; username: string }) => {
      const response = await apiRequest('POST', '/api/social/accounts/connect', {
        platform,
        platformUsername: username
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/social/accounts'] });
      toast({
        title: "Account Connected!",
        description: `Your ${connectingPlatform} account has been connected.`,
      });
      setConnectDialogOpen(false);
      setConnectingPlatform(null);
      setPlatformUsername('');
    },
    onError: (error: Error) => {
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleConnectAccount = (platform: string) => {
    setConnectingPlatform(platform);
    setPlatformUsername('');
    setConnectDialogOpen(true);
  };

  const handleConfirmConnect = () => {
    if (!connectingPlatform || !platformUsername.trim()) {
      toast({
        title: "Enter Username",
        description: "Please enter your platform username.",
        variant: "destructive",
      });
      return;
    }
    connectMutation.mutate({ platform: connectingPlatform, username: platformUsername.trim() });
  };

  const handleNativeShare = async (platformName: string) => {
    const text = customCaption + (hashtags.length > 0 ? '\n\n' + hashtags.join(' ') : '');
    
    const shareUrls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(text)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`
    };

    if (shareUrls[platformName]) {
      window.open(shareUrls[platformName], '_blank', 'width=600,height=400');
      toast({
        title: "Opening Share Window",
        description: `Sharing to ${platformConfig[platformName]?.name || platformName}...`,
      });
    }
  };

  const togglePlatform = (p: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const isConnected = (p: string) => {
    return connectedAccounts.some(a => a.platform === p && a.isActive);
  };

  const getMediaTypeIcon = () => {
    switch (mediaType) {
      case 'video': return <Video className="w-4 h-4" />;
      case 'carousel': return <ImageIcon className="w-4 h-4" />;
      case 'thread': return <FileText className="w-4 h-4" />;
      default: return <ImageIcon className="w-4 h-4" />;
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn(
          "gap-2",
          variant === 'default' && "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700",
          className
        )}
        onClick={() => setIsOpen(true)}
        disabled={disabled}
      >
        <Share2 className="w-4 h-4" />
        {showLabel && "Share to Social"}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              Share to Social Media
            </DialogTitle>
            <DialogDescription>
              Share your content directly to your connected social accounts
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {mediaUrl && (
              <div className="relative rounded-lg overflow-hidden bg-muted">
                {mediaType === 'video' ? (
                  <video src={mediaUrl} className="w-full h-32 object-cover" />
                ) : (
                  <img src={mediaUrl} alt="Content preview" className="w-full h-32 object-cover" />
                )}
                <Badge className="absolute top-2 right-2 gap-1">
                  {getMediaTypeIcon()}
                  {mediaType}
                </Badge>
              </div>
            )}

            <div>
              <Label>Caption</Label>
              <Textarea
                value={customCaption}
                onChange={(e) => setCustomCaption(e.target.value)}
                placeholder="Add a caption for your post..."
                className="mt-1.5 min-h-[80px]"
              />
            </div>

            {hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {hashtags.map((tag, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            <div>
              <Label className="mb-2 block">Select Platforms</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(platformConfig).map(([key, config]) => {
                  const Icon = config.icon;
                  const connected = isConnected(key);
                  const selected = selectedPlatforms.includes(key);
                  
                  return (
                    <div key={key} className="relative">
                      <button
                        onClick={() => connected ? togglePlatform(key) : handleNativeShare(key)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all",
                          selected && connected
                            ? "border-purple-500 bg-purple-500/10"
                            : "border-border hover:border-muted-foreground/50",
                          !connected && "opacity-80"
                        )}
                      >
                        <div className={cn("p-2 rounded-lg", config.bgColor)}>
                          <Icon className={cn("w-4 h-4", config.color)} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium text-sm">{config.name}</p>
                          {connected ? (
                            <p className="text-xs text-green-500 flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Connected
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" />
                              Share via web
                            </p>
                          )}
                        </div>
                        {selected && connected && (
                          <Check className="w-5 h-5 text-purple-500" />
                        )}
                      </button>
                      {!connected && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConnectAccount(key);
                          }}
                          className="absolute -top-1 -right-1 p-1 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-md"
                          title="Connect account"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleShare}
              disabled={isSharing || selectedPlatforms.length === 0}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              {isSharing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sharing...
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 mr-2" />
                  Share to {selectedPlatforms.length || 'Selected'} Platform{selectedPlatforms.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={connectDialogOpen} onOpenChange={(open) => {
        setConnectDialogOpen(open);
        if (!open) {
          setConnectingPlatform(null);
          setPlatformUsername('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {connectingPlatform && platformConfig[connectingPlatform] && (
                <>
                  <div className={cn("p-2 rounded-lg", platformConfig[connectingPlatform].bgColor)}>
                    {(() => {
                      const Icon = platformConfig[connectingPlatform].icon;
                      return <Icon className={cn("w-4 h-4", platformConfig[connectingPlatform].color)} />;
                    })()}
                  </div>
                  Connect {platformConfig[connectingPlatform].name}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Enter your {connectingPlatform} username to connect your account for sharing.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="username">Username / Handle</Label>
              <Input
                id="username"
                value={platformUsername}
                onChange={(e) => setPlatformUsername(e.target.value)}
                placeholder={`@your${connectingPlatform}handle`}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                This will allow you to share content directly to this platform.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmConnect}
              disabled={connectMutation.isPending || !platformUsername.trim()}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              {connectMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Connect Account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function QuickShareButtons({ 
  caption = '', 
  hashtags = [],
  className 
}: { 
  caption?: string; 
  hashtags?: string[];
  className?: string;
}) {
  const text = caption + (hashtags.length > 0 ? '\n\n' + hashtags.join(' ') : '');

  const shareToTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'width=600,height=400');
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(text)}`, '_blank', 'width=600,height=400');
  };

  const shareToLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`, '_blank', 'width=600,height=400');
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <Button size="sm" variant="outline" onClick={shareToTwitter} className="gap-1.5">
        <SiX className="w-3.5 h-3.5" />
        X
      </Button>
      <Button size="sm" variant="outline" onClick={shareToFacebook} className="gap-1.5">
        <Facebook className="w-3.5 h-3.5" />
        Facebook
      </Button>
      <Button size="sm" variant="outline" onClick={shareToLinkedIn} className="gap-1.5">
        <Linkedin className="w-3.5 h-3.5" />
        LinkedIn
      </Button>
      <Button size="sm" variant="outline" onClick={copyToClipboard} className="gap-1.5">
        <Link2 className="w-3.5 h-3.5" />
        Copy
      </Button>
    </div>
  );
}
