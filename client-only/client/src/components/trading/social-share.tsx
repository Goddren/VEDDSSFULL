import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Share2, SendIcon, Instagram, MessageCircle } from "lucide-react";
import { ChartAnalysisResponse } from "@shared/types";
import { SiTelegram, SiInstagram } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";

interface SocialShareProps {
  analysis: ChartAnalysisResponse;
  imageUrl?: string;
}

export function SocialShare({ analysis, imageUrl }: SocialShareProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("telegram");

  // Create the shareable content
  const createShareableContent = (format: "plain" | "formatted" = "plain") => {
    const direction = analysis.direction.toUpperCase();
    const directionEmoji = direction === "BUY" || direction === "BULLISH" ? "🟢" : "🔴";
    
    let content = "";
    
    if (format === "plain") {
      content = `🚨 TRADING SIGNAL 🚨

${directionEmoji} ${analysis.symbol} ${direction} Signal

💹 Entry: ${analysis.entryPoint}
🎯 Take Profit: ${analysis.takeProfit}
🛑 Stop Loss: ${analysis.stopLoss}
⚖️ Risk/Reward: ${analysis.riskRewardRatio}
📊 Timeframe: ${analysis.timeframe}

💭 Analysis:
${analysis.recommendation}

#trading #forex #signals #${analysis.symbol.replace("/", "")}`;
    } else {
      content = `<b>🚨 TRADING SIGNAL 🚨</b>

${directionEmoji} <b>${analysis.symbol} ${direction} Signal</b>

💹 Entry: <code>${analysis.entryPoint}</code>
🎯 Take Profit: <code>${analysis.takeProfit}</code>
🛑 Stop Loss: <code>${analysis.stopLoss}</code>
⚖️ Risk/Reward: ${analysis.riskRewardRatio}
📊 Timeframe: ${analysis.timeframe}

💭 <b>Analysis:</b>
${analysis.recommendation}

#trading #forex #signals #${analysis.symbol.replace("/", "")}`;
    }

    return content;
  };

  // Handle copy to clipboard
  const handleCopy = () => {
    const content = createShareableContent();
    navigator.clipboard.writeText(content);
    setCopied(true);
    toast({
      title: "Copied!",
      description: "Trading signal copied to clipboard",
    });
    
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  // Handle Telegram share
  const handleTelegramShare = () => {
    const content = encodeURIComponent(createShareableContent());
    window.open(`https://t.me/share/url?url=${content}`, '_blank');
  };

  // Handle Instagram share (redirects to Instagram - users will need to paste the content)
  const handleInstagramShare = () => {
    handleCopy();
    toast({
      title: "Instagram Share",
      description: "Signal copied to clipboard. Open Instagram and paste in your post/story.",
    });
    setTimeout(() => {
      window.open('https://www.instagram.com/', '_blank');
    }, 1000);
  };

  return (
    <Card className="shadow-lg border-2 bg-gradient-to-br from-background/80 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <Share2 className="h-5 w-5 text-primary" />
          Share Trading Signal
        </CardTitle>
        <CardDescription>
          Share this trading signal on social media
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="telegram" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="telegram" className="flex items-center gap-2">
              <SiTelegram className="h-4 w-4" />
              Telegram
            </TabsTrigger>
            <TabsTrigger value="instagram" className="flex items-center gap-2">
              <SiInstagram className="h-4 w-4" />
              Instagram
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="telegram" className="space-y-4">
            <div className="p-4 border rounded-md bg-secondary/10">
              <pre className="whitespace-pre-wrap text-sm">
                {createShareableContent()}
              </pre>
            </div>
            <div className="flex gap-2">
              <Button 
                className="flex-1"
                variant="outline" 
                onClick={handleCopy}
              >
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button 
                className="flex-1 bg-[#0088cc] hover:bg-[#0088cc]/80"
                onClick={handleTelegramShare}
              >
                <SiTelegram className="h-4 w-4 mr-2" />
                Share on Telegram
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="instagram" className="space-y-4">
            <div className="p-4 border rounded-md bg-secondary/10">
              <pre className="whitespace-pre-wrap text-sm">
                {createShareableContent()}
              </pre>
            </div>
            <p className="text-sm text-muted-foreground">
              Instagram doesn't support direct sharing of text content. Copy this message to paste with your image on Instagram.
            </p>
            <div className="flex gap-2">
              <Button 
                className="flex-1"
                variant="outline" 
                onClick={handleCopy}
              >
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button 
                className="flex-1 bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#FCAF45] hover:opacity-90"
                onClick={handleInstagramShare}
              >
                <SiInstagram className="h-4 w-4 mr-2" />
                Open Instagram
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}