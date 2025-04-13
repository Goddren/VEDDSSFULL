import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ChartAnalysisResponse } from "@shared/types";
import { ChartAnalysis } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Copy, Share2, Clipboard, Check, Link, Twitter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SiTelegram, SiX } from "react-icons/si";

interface QuickShareDialogProps {
  analysis: ChartAnalysisResponse;
  imageUrl: string;
  trigger?: React.ReactNode;
  onShareComplete?: (shareUrl: string) => void;
}

export function QuickShareDialog({ analysis, imageUrl, trigger, onShareComplete }: QuickShareDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [tradingNotes, setTradingNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [shareStep, setShareStep] = useState<"notes" | "share">("notes");

  // Handle submitting the notes and creating a shareable link
  const handleShare = async () => {
    // Use the analysis ID from the server response if available
    if (!analysis) {
      toast({
        title: "Error",
        description: "Analysis data is missing",
        variant: "destructive",
      });
      return;
    }

    // We need to use the analysis ID provided by the API
    // This will be set by the parent component that passes the analysis from the API
    const analysisId = (analysis as unknown as { id?: number }).id;
    
    if (!analysisId) {
      toast({
        title: "Error",
        description: "Analysis ID is missing. Please save this analysis first.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", `/api/analyses/${analysisId}/share`, {
        notes: tradingNotes
      });
      
      if (!response.ok) {
        throw new Error("Failed to share analysis");
      }
      
      const sharedAnalysis = await response.json();
      const origin = window.location.origin;
      const url = `${origin}/shared/${sharedAnalysis.shareId}`;
      setShareUrl(url);
      setShareStep("share");
      
      // Invoke callback if provided
      if (onShareComplete) {
        onShareComplete(url);
      }
      
      toast({
        title: "Analysis Shared!",
        description: "Your analysis has been shared successfully.",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to share analysis",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Create the shareable content for social platforms
  const createShareableContent = () => {
    const direction = analysis.direction.toUpperCase();
    const directionEmoji = direction === "BUY" || direction === "BULLISH" ? "🟢" : "🔴";
    
    return `🚨 TRADING SIGNAL 🚨

${directionEmoji} ${analysis.symbol} ${direction} Signal

💹 Entry: ${analysis.entryPoint}
🎯 Take Profit: ${analysis.takeProfit}
🛑 Stop Loss: ${analysis.stopLoss}
⚖️ Risk/Reward: ${analysis.riskRewardRatio}
📊 Timeframe: ${analysis.timeframe}

${tradingNotes ? `💭 My Analysis:\n${tradingNotes}\n\n` : ""}
📊 View full analysis: ${shareUrl}

#trading #forex #signals #${analysis.symbol?.replace("/", "") || "trading"}`;
  };

  // Handle copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    
    toast({
      title: "Copied!",
      description: "Share link copied to clipboard",
    });
    
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  // Handle copying the full message
  const handleCopyMessage = () => {
    navigator.clipboard.writeText(createShareableContent());
    
    toast({
      title: "Copied!",
      description: "Trading signal copied to clipboard",
    });
  };

  // Handle social shares
  const handleSocialShare = (platform: string) => {
    const content = encodeURIComponent(createShareableContent());
    const encodedUrl = encodeURIComponent(shareUrl);
    
    let platformUrl = "";
    
    switch (platform) {
      case "telegram":
        platformUrl = `https://t.me/share/url?url=${encodedUrl}&text=${content}`;
        break;
      case "twitter":
        platformUrl = `https://x.com/intent/tweet?text=${content}`;
        break;
      default:
        handleCopyMessage();
        return;
    }
    
    window.open(platformUrl, "_blank");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Quick Share
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            {shareStep === "notes" ? "Add Trading Notes" : "Share Analysis"}
          </DialogTitle>
          <DialogDescription>
            {shareStep === "notes" 
              ? "Add your personal insights or trading notes before sharing."
              : "Share your analysis with other traders."}
          </DialogDescription>
        </DialogHeader>
        
        {shareStep === "notes" ? (
          <>
            <div className="grid gap-4 py-4">
              <div className="bg-secondary/20 p-4 rounded-md mb-2">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">{analysis.symbol || "Chart"} - {analysis.timeframe}</span>
                  <span className={`text-sm font-medium px-2 py-0.5 rounded ${analysis.direction.toLowerCase().includes("buy") || analysis.direction.toLowerCase().includes("bull") ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                    {analysis.direction}
                  </span>
                </div>
                <div className="flex gap-3 justify-between mb-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Entry:</span> {analysis.entryPoint}
                  </div>
                  <div>
                    <span className="text-muted-foreground">TP:</span> {analysis.takeProfit}
                  </div>
                  <div>
                    <span className="text-muted-foreground">SL:</span> {analysis.stopLoss}
                  </div>
                </div>
              </div>
              
              <div className="grid gap-2">
                <label htmlFor="trading-notes" className="text-sm font-medium">
                  Trading Notes
                </label>
                <Textarea
                  id="trading-notes"
                  placeholder="Add your analysis insights, trade reasoning, or additional context..."
                  value={tradingNotes}
                  onChange={(e) => setTradingNotes(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  These notes will be visible to anyone with the share link.
                </p>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleShare} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                    Sharing...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="grid gap-4 py-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="share-url" className="text-sm font-medium">
                  Shareable Link
                </label>
                <div className="flex gap-2">
                  <Input
                    id="share-url"
                    value={shareUrl}
                    readOnly
                    className="flex-1"
                  />
                  <Button size="icon" variant="outline" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this link with others to view your analysis.
                </p>
              </div>
              
              <div className="mt-2">
                <h4 className="text-sm font-medium mb-2">Share on Social Media</h4>
                <div className="flex flex-wrap gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex items-center gap-2"
                    onClick={() => handleSocialShare("telegram")}
                  >
                    <SiTelegram className="h-4 w-4 text-[#0088cc]" />
                    Telegram
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex items-center gap-2"
                    onClick={() => handleSocialShare("twitter")}
                  >
                    <SiX className="h-4 w-4" />
                    X (Twitter)
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex items-center gap-2"
                    onClick={handleCopyMessage}
                  >
                    <Clipboard className="h-4 w-4" />
                    Copy Text
                  </Button>
                </div>
              </div>
              
              <div className="bg-secondary/20 p-4 rounded-md mt-2">
                <h4 className="text-sm font-medium mb-2">Preview</h4>
                <pre className="whitespace-pre-wrap text-xs overflow-auto max-h-[150px]">
                  {createShareableContent()}
                </pre>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}