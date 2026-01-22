import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { 
  ArrowLeft, CheckCircle, Clock, BookOpen, Target, Brain, Zap, 
  Award, Video, Share2, Users, Monitor, Camera, Shield, GraduationCap,
  Star, Flame, ChevronRight, Play, Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

import dojiImg from '@assets/training_images/doji_patterns_explained.png';
import hammerImg from '@assets/training_images/hammer_patterns_explained.png';
import engulfingImg from '@assets/training_images/engulfing_patterns_explained.png';
import morningStarImg from '@assets/training_images/morning_evening_star_explained.png';
import headShouldersImg from '@assets/training_images/head_shoulders_explained.png';
import doubleTopImg from '@assets/training_images/double_top_bottom_explained.png';
import movingAvgImg from '@assets/training_images/moving_averages_explained.png';
import rsiImg from '@assets/training_images/rsi_indicator_explained.png';
import macdImg from '@assets/training_images/macd_indicator_explained.png';
import bollingerImg from '@assets/training_images/bollinger_bands_explained.png';
import volumeImg from '@assets/training_images/volume_analysis_explained.png';
import platformsImg from '@assets/training_images/trading_platforms_overview.png';
import chartAnalysisImg from '@assets/training_images/ai_trading_vault_workflow.png';
import socialMediaImg from '@assets/training_images/social_media_trading.png';
import videoCreationImg from '@assets/training_images/video_content_creation.png';
import complianceImg from '@assets/training_images/trading_compliance.png';
import liveStreamImg from '@assets/training_images/video_content_creation.png';
import supportResistanceImg from '@assets/training_images/double_top_bottom_explained.png';
import triangleImg from '@assets/training_images/triangle_patterns_explained.png';

interface TrainingProgress {
  id: number;
  userId: number;
  completedModules: string[];
  completedLessons: string[];
  currentModule: string;
  currentLesson: string;
  quizScores: Record<string, number>;
  totalTimeSpent: number;
  lastAccessedAt: string | null;
  certificationEarned: boolean;
}

const trainingDays = [
  { day: 1, module: "intro", lessonId: "intro-1", title: "What is AI Trading Vault?", icon: BookOpen, category: "foundation",
    image: chartAnalysisImg, imageAlt: "AI Trading Vault chart analysis",
    content: [
      "AI Trading Vault is a cutting-edge chart analysis platform designed to empower traders with AI-powered insights",
      "Our mission is to make professional-grade charting accessible, educational, and community-driven",
      "Features include AI-powered chart analysis, EA generation, marketplace, and social trading",
      "Available for Forex, Stocks, Crypto, and Indices traders on MT5, TradingView, and TradeLocker"
    ],
    tips: ["Focus on the AI-powered analysis capabilities", "Emphasize time savings for busy traders"]
  },
  { day: 2, module: "intro", lessonId: "intro-2", title: "Key Value Propositions", icon: Target, category: "foundation",
    image: chartAnalysisImg, imageAlt: "Trading chart analysis overview",
    content: [
      "Save hours of manual chart analysis with AI automation",
      "Generate professional EA code without programming knowledge",
      "Earn passive income by sharing strategies in the marketplace",
      "Join a community of like-minded traders"
    ],
    tips: ["Highlight the earning potential", "Mention the no-coding-required EA generation"]
  },
  { day: 3, module: "platforms-intro", lessonId: "platforms-1", title: "What are Trading Platforms?", icon: Monitor, category: "foundation",
    image: platformsImg, imageAlt: "Multiple trading platforms",
    content: [
      "Trading platforms are software applications that connect you to financial markets",
      "They let you view price charts, place buy/sell orders, and manage your trades",
      "Think of them like apps for trading - similar to how banking apps let you manage money",
      "AI Trading Vault works with charts from any platform for analysis"
    ],
    tips: ["Use simple analogies", "Emphasize platform compatibility"]
  },
  { day: 4, module: "platforms-intro", lessonId: "platforms-2", title: "MetaTrader 5 (MT5)", icon: Monitor, category: "foundation",
    image: platformsImg, imageAlt: "MetaTrader 5 platform interface",
    content: [
      "MT5 is one of the most popular trading platforms worldwide, especially for Forex",
      "Created by MetaQuotes and used by millions of traders globally",
      "Offers advanced charting, multiple timeframes, and automated trading (Expert Advisors)",
      "AI Trading Vault can generate MT5 Expert Advisor code from your chart analysis"
    ],
    tips: ["Explain that MT5 is free to download", "Mention our MT5 Chart Data EA integration"]
  },
  { day: 5, module: "platforms-intro", lessonId: "platforms-3", title: "TradingView", icon: Monitor, category: "foundation",
    image: platformsImg, imageAlt: "TradingView charting platform",
    content: [
      "TradingView is a web-based charting platform with powerful analysis tools",
      "Works directly in your browser - no software download required",
      "Great for sharing chart ideas and learning from other traders",
      "50+ million users share ideas, strategies, and market commentary"
    ],
    tips: ["Highlight browser-based accessibility", "Mention the learning community"]
  },
  { day: 6, module: "platforms-intro", lessonId: "platforms-4", title: "TradeLocker", icon: Monitor, category: "foundation",
    image: platformsImg, imageAlt: "TradeLocker trading platform",
    content: [
      "TradeLocker is a modern trading platform designed for prop trading firms",
      "Features a clean, intuitive interface optimized for quick execution",
      "AI Trading Vault can send trading signals directly to TradeLocker via webhooks",
      "Integrated TradingView charts for seamless analysis"
    ],
    tips: ["Explain what prop trading firms are", "Mention webhook integration"]
  },
  { day: 7, module: "platforms-intro", lessonId: "platforms-5", title: "Platform Integration", icon: Zap, category: "foundation",
    image: platformsImg, imageAlt: "Platform integration workflow",
    content: [
      "Upload: Take a screenshot of your chart from any platform",
      "Analyze: Our AI examines patterns, trends, and key levels automatically",
      "Generate: Create Expert Advisor code for MT5 or set up webhooks",
      "Trade: Apply the AI insights on your preferred platform"
    ],
    tips: ["Show the simple 4-step workflow", "Emphasize universal compatibility"]
  },
  { day: 8, module: "chart-patterns", lessonId: "patterns-1", title: "Candlestick Basics", icon: Target, category: "strategy",
    image: dojiImg, imageAlt: "Basic candlestick patterns",
    content: [
      "Candlesticks show price movement over a specific time period",
      "Each candle has a body (open to close) and wicks (high and low)",
      "Green/white candles = price went up, Red/black candles = price went down",
      "Understanding candlesticks is the foundation of chart analysis"
    ],
    tips: ["Use visual examples", "Start with the basics before complex patterns"]
  },
  { day: 9, module: "chart-patterns", lessonId: "patterns-2", title: "Doji Patterns", icon: Target, category: "strategy",
    image: dojiImg, imageAlt: "Doji candlestick patterns",
    content: [
      "A Doji forms when open and close prices are nearly equal",
      "Indicates indecision in the market - neither buyers nor sellers won",
      "Can signal potential reversals when found at support/resistance levels",
      "Types include: Standard Doji, Dragonfly, Gravestone, Long-legged"
    ],
    tips: ["Explain market psychology behind the pattern", "Show real chart examples"]
  },
  { day: 10, module: "chart-patterns", lessonId: "patterns-3", title: "Hammer & Hanging Man", icon: Target, category: "strategy",
    image: hammerImg, imageAlt: "Hammer and Hanging Man patterns",
    content: [
      "Hammer: Bullish reversal pattern found at the bottom of downtrends",
      "Hanging Man: Bearish reversal pattern found at the top of uptrends",
      "Both have small bodies and long lower wicks (shadows)",
      "Location matters - same shape, different meaning based on trend"
    ],
    tips: ["Focus on the importance of context", "Use before/after examples"]
  },
  { day: 11, module: "chart-patterns", lessonId: "patterns-4", title: "Engulfing Patterns", icon: Target, category: "strategy",
    image: engulfingImg, imageAlt: "Bullish and bearish engulfing patterns",
    content: [
      "Bullish Engulfing: Large green candle completely engulfs previous red candle",
      "Bearish Engulfing: Large red candle completely engulfs previous green candle",
      "Strong reversal signals when found at key support/resistance",
      "Volume confirmation adds reliability to the signal"
    ],
    tips: ["Show the size comparison between candles", "Explain why engulfing matters"]
  },
  { day: 12, module: "chart-patterns", lessonId: "patterns-5", title: "Morning/Evening Star", icon: Star, category: "strategy",
    image: morningStarImg, imageAlt: "Morning star and evening star patterns",
    content: [
      "Morning Star: Three-candle bullish reversal (red, small, green)",
      "Evening Star: Three-candle bearish reversal (green, small, red)",
      "The middle candle shows indecision, followed by strong move",
      "Very reliable patterns when found at significant levels"
    ],
    tips: ["Break down each candle's meaning", "Explain the psychology of the three stages"]
  },
  { day: 13, module: "chart-patterns", lessonId: "patterns-6", title: "Head & Shoulders", icon: Target, category: "strategy",
    image: headShouldersImg, imageAlt: "Head and shoulders chart pattern",
    content: [
      "Classic reversal pattern with three peaks - left shoulder, head, right shoulder",
      "Neckline connects the lows between the shoulders",
      "Break below neckline confirms the pattern",
      "Inverse Head & Shoulders is the bullish version"
    ],
    tips: ["Draw the pattern clearly", "Explain entry and target calculation"]
  },
  { day: 14, module: "chart-patterns", lessonId: "patterns-7", title: "Double Top/Bottom", icon: Target, category: "strategy",
    image: doubleTopImg, imageAlt: "Double top and double bottom patterns",
    content: [
      "Double Top: Two peaks at similar price level - bearish reversal",
      "Double Bottom: Two valleys at similar price level - bullish reversal",
      "Shows price tested a level twice and failed to break through",
      "Confirmation comes when price breaks the middle point"
    ],
    tips: ["Show the W and M shapes", "Explain why two tests matter"]
  },
  { day: 15, module: "indicators", lessonId: "indicators-1", title: "Moving Averages", icon: Brain, category: "strategy",
    image: movingAvgImg, imageAlt: "Moving averages on chart",
    content: [
      "Moving averages smooth out price data to show the trend direction",
      "Simple Moving Average (SMA) vs Exponential Moving Average (EMA)",
      "Common periods: 20, 50, 100, 200 - each tells a different story",
      "Crossovers between MAs can signal trend changes"
    ],
    tips: ["Explain the difference between SMA and EMA", "Show golden cross and death cross"]
  },
  { day: 16, module: "indicators", lessonId: "indicators-2", title: "RSI Indicator", icon: Brain, category: "strategy",
    image: rsiImg, imageAlt: "RSI indicator overbought oversold zones",
    content: [
      "Relative Strength Index measures momentum on a 0-100 scale",
      "Above 70 = overbought (potential sell), Below 30 = oversold (potential buy)",
      "Divergence between price and RSI can signal reversals",
      "Works best in ranging markets, less reliable in strong trends"
    ],
    tips: ["Show overbought/oversold zones", "Explain RSI divergence with examples"]
  },
  { day: 17, module: "indicators", lessonId: "indicators-3", title: "MACD Explained", icon: Brain, category: "strategy",
    image: macdImg, imageAlt: "MACD indicator crossovers",
    content: [
      "MACD = Moving Average Convergence Divergence",
      "Consists of MACD line, Signal line, and Histogram",
      "Crossovers between MACD and Signal line indicate momentum shifts",
      "Histogram shows the strength of the current trend"
    ],
    tips: ["Break down each component", "Show bullish and bearish crossovers"]
  },
  { day: 18, module: "indicators", lessonId: "indicators-4", title: "Bollinger Bands", icon: Brain, category: "strategy",
    image: bollingerImg, imageAlt: "Bollinger Bands trading chart",
    content: [
      "Bollinger Bands consist of a middle SMA with upper and lower bands",
      "Bands expand during high volatility, contract during low volatility",
      "Price touching upper band = overbought, lower band = oversold",
      "Band squeezes often precede big moves"
    ],
    tips: ["Show band expansion and contraction", "Explain the squeeze setup"]
  },
  { day: 19, module: "indicators", lessonId: "indicators-5", title: "Volume Analysis", icon: Brain, category: "strategy",
    image: volumeImg, imageAlt: "Volume analysis on trading chart",
    content: [
      "Volume shows how much trading activity occurred",
      "High volume confirms price moves, low volume suggests weakness",
      "Volume spikes at key levels can indicate institutional activity",
      "Volume precedes price - watch for divergences"
    ],
    tips: ["Show volume confirmation examples", "Explain smart money concepts"]
  },
  { day: 20, module: "indicators", lessonId: "indicators-6", title: "Combining Indicators", icon: Zap, category: "strategy",
    image: chartAnalysisImg, imageAlt: "Multiple indicators combined",
    content: [
      "No single indicator is perfect - combine for confirmation",
      "Popular combos: RSI + MACD, Moving Averages + Volume",
      "Avoid indicator redundancy (using multiple momentum indicators)",
      "AI Trading Vault combines multiple indicators automatically"
    ],
    tips: ["Show a multi-indicator setup", "Explain when indicators agree"]
  },
  { day: 21, module: "indicators", lessonId: "indicators-7", title: "Week 3 Review", icon: Award, category: "review",
    image: chartAnalysisImg, imageAlt: "Week 3 review chart patterns",
    content: [
      "Review all indicator concepts learned this week",
      "Practice identifying signals on live charts",
      "Combine pattern recognition with indicator confirmation",
      "Prepare for next week's social media training"
    ],
    tips: ["Quiz yourself on indicator basics", "Practice with real charts"]
  },
  { day: 22, module: "social", lessonId: "social-1", title: "Social Media Basics", icon: Share2, category: "execution",
    image: socialMediaImg, imageAlt: "Social media marketing for traders",
    content: [
      "Choose your primary platforms: Twitter/X, Instagram, TikTok, YouTube",
      "Consistency is key - post regularly to build audience",
      "Engage with your followers - reply to comments and DMs",
      "Share valuable content, not just promotions"
    ],
    tips: ["Start with 1-2 platforms", "Quality over quantity for engagement"]
  },
  { day: 23, module: "social", lessonId: "social-2", title: "Creating Engaging Content", icon: Camera, category: "execution",
    image: socialMediaImg, imageAlt: "Creating engaging trading content",
    content: [
      "Hook viewers in the first 3 seconds",
      "Show results and transformations - before/after trading success",
      "Use storytelling to make technical content relatable",
      "Include clear calls-to-action"
    ],
    tips: ["Study viral trading content", "Test different content formats"]
  },
  { day: 24, module: "social", lessonId: "social-3", title: "Building Your Audience", icon: Users, category: "execution",
    image: socialMediaImg, imageAlt: "Building trading audience",
    content: [
      "Define your niche - what makes you unique?",
      "Collaborate with other trading content creators",
      "Cross-promote across platforms",
      "Leverage trending topics and hashtags"
    ],
    tips: ["Focus on a specific trading niche", "Network with other creators"]
  },
  { day: 25, module: "social", lessonId: "social-4", title: "Hashtag Strategy", icon: Target, category: "execution",
    image: socialMediaImg, imageAlt: "Hashtag strategy for trading content",
    content: [
      "Use a mix of popular and niche hashtags",
      "Research what's working in the trading space",
      "Create branded hashtags for AI Trading Vault content",
      "Track which hashtags drive the most engagement"
    ],
    tips: ["Keep a hashtag library", "Test different combinations"]
  },
  { day: 26, module: "social", lessonId: "social-5", title: "Engagement Techniques", icon: Zap, category: "execution",
    image: socialMediaImg, imageAlt: "Social media engagement techniques",
    content: [
      "Ask questions in your posts to drive comments",
      "Run polls and interactive content",
      "Go live to connect with your audience in real-time",
      "Share user testimonials and success stories"
    ],
    tips: ["Respond to every comment", "Create community challenges"]
  },
  { day: 27, module: "social", lessonId: "social-6", title: "Going Viral", icon: Flame, category: "execution",
    image: socialMediaImg, imageAlt: "Viral content strategies",
    content: [
      "Study viral trading content - what made it work?",
      "Ride trending topics when relevant",
      "Create shareable, save-worthy content",
      "Timing matters - post when your audience is active"
    ],
    tips: ["Don't chase virality at the expense of value", "Stay authentic"]
  },
  { day: 28, module: "social", lessonId: "social-7", title: "Week 4 Review", icon: Award, category: "review",
    image: socialMediaImg, imageAlt: "Week 4 social media review",
    content: [
      "Review your social media strategy",
      "Analyze what content performed best",
      "Plan your content calendar for the next week",
      "Set engagement goals"
    ],
    tips: ["Track your metrics", "Iterate based on data"]
  },
  { day: 29, module: "video", lessonId: "video-1", title: "Video Content Basics", icon: Video, category: "mindset",
    image: videoCreationImg, imageAlt: "Video content creation basics",
    content: [
      "Video is the most engaging content format",
      "Start with simple setup - phone + ring light + good audio",
      "Script or outline your content before recording",
      "Keep videos focused on one topic or concept"
    ],
    tips: ["Good audio is more important than video quality", "Practice your delivery"]
  },
  { day: 30, module: "video", lessonId: "video-2", title: "Screen Recording Tips", icon: Monitor, category: "mindset",
    image: videoCreationImg, imageAlt: "Screen recording for tutorials",
    content: [
      "Use screen recording software (OBS, Loom, etc.)",
      "Clean up your desktop before recording",
      "Zoom in on important details",
      "Use mouse highlighting and annotations"
    ],
    tips: ["Record in HD quality", "Edit out mistakes and pauses"]
  },
  { day: 31, module: "video", lessonId: "video-3", title: "Live Streaming Setup", icon: Video, category: "mindset",
    image: liveStreamImg, imageAlt: "Live streaming setup for traders",
    content: [
      "Test your setup before going live",
      "Have a backup plan for technical issues",
      "Interact with chat throughout the stream",
      "Promote your streams in advance"
    ],
    tips: ["Start with shorter streams", "Build a streaming schedule"]
  },
  { day: 32, module: "video", lessonId: "video-4", title: "YouTube Optimization", icon: Video, category: "mindset",
    image: videoCreationImg, imageAlt: "YouTube video optimization",
    content: [
      "Create compelling thumbnails that stand out",
      "Write SEO-optimized titles and descriptions",
      "Use end screens and cards for engagement",
      "Build playlists to increase watch time"
    ],
    tips: ["Study successful trading channels", "A/B test thumbnails"]
  },
  { day: 33, module: "video", lessonId: "video-5", title: "TikTok & Reels", icon: Video, category: "mindset",
    image: videoCreationImg, imageAlt: "TikTok and Reels for traders",
    content: [
      "Short-form content requires different approach",
      "Hook viewers immediately - first frame matters",
      "Use trending sounds and effects",
      "Keep it under 60 seconds for best reach"
    ],
    tips: ["Study trending trading content", "Post consistently"]
  },
  { day: 34, module: "video", lessonId: "video-6", title: "Video Editing Basics", icon: Video, category: "mindset",
    image: videoCreationImg, imageAlt: "Video editing for beginners",
    content: [
      "Cut out dead air and mistakes",
      "Add captions for accessibility and engagement",
      "Use b-roll and graphics to illustrate points",
      "Keep the pace moving - no boring moments"
    ],
    tips: ["Learn keyboard shortcuts", "Develop your editing style"]
  },
  { day: 35, module: "video", lessonId: "video-7", title: "Week 5 Review", icon: Award, category: "review",
    image: videoCreationImg, imageAlt: "Week 5 video content review",
    content: [
      "Review your video content skills",
      "Plan your content production schedule",
      "Set up your recording workspace",
      "Create your first complete tutorial video"
    ],
    tips: ["Get feedback on your videos", "Keep improving"]
  },
  { day: 36, module: "compliance", lessonId: "compliance-1", title: "Financial Disclaimers", icon: Shield, category: "foundation",
    image: complianceImg, imageAlt: "Financial compliance disclaimers",
    content: [
      "Always include 'not financial advice' disclaimers",
      "Never guarantee profits or returns",
      "Be honest about risks involved in trading",
      "Disclose any affiliate relationships"
    ],
    tips: ["Create disclaimer templates", "Stay updated on regulations"]
  },
  { day: 37, module: "compliance", lessonId: "compliance-2", title: "FTC Guidelines", icon: Shield, category: "foundation",
    image: complianceImg, imageAlt: "FTC guidelines for content creators",
    content: [
      "Disclose paid partnerships and sponsorships",
      "Use #ad or #sponsored when required",
      "Be truthful in your testimonials",
      "Keep records of all promotions"
    ],
    tips: ["When in doubt, disclose", "Check FTC guidelines regularly"]
  },
  { day: 38, module: "compliance", lessonId: "compliance-3", title: "Social Media Policies", icon: Shield, category: "foundation",
    image: complianceImg, imageAlt: "Social media platform policies",
    content: [
      "Follow each platform's community guidelines",
      "Avoid making income claims without proof",
      "Don't use misleading thumbnails or titles",
      "Respect copyright - use licensed music and images"
    ],
    tips: ["Read platform ToS", "Keep content clean and professional"]
  },
  { day: 39, module: "advanced", lessonId: "advanced-1", title: "Advanced EA Strategies", icon: Zap, category: "strategy",
    image: chartAnalysisImg, imageAlt: "Advanced EA trading strategies",
    content: [
      "Multi-timeframe EA analysis for better accuracy",
      "Combining AI analysis with technical confirmation",
      "Risk management settings for EAs",
      "Backtesting and optimization"
    ],
    tips: ["Test on demo first", "Start with conservative settings"]
  },
  { day: 40, module: "advanced", lessonId: "advanced-2", title: "Multi-Timeframe Analysis", icon: Brain, category: "strategy",
    image: chartAnalysisImg, imageAlt: "Multi-timeframe chart analysis",
    content: [
      "Higher timeframes show the trend, lower timeframes show entries",
      "Common combo: 4H for trend, 1H for confirmation, 15M for entry",
      "All timeframes should align for best trades",
      "AI Trading Vault analyzes multiple timeframes automatically"
    ],
    tips: ["Practice on different timeframe combos", "Start with higher TFs"]
  },
  { day: 41, module: "advanced", lessonId: "advanced-3", title: "Risk Management", icon: Shield, category: "strategy",
    image: supportResistanceImg, imageAlt: "Risk management with support resistance",
    content: [
      "Never risk more than 1-2% per trade",
      "Use stop losses on every trade",
      "Calculate position size based on stop distance",
      "Have a maximum daily/weekly drawdown limit"
    ],
    tips: ["Risk management is the #1 skill", "Protect your capital"]
  },
  { day: 42, module: "advanced", lessonId: "advanced-4", title: "Building Your Brand", icon: Star, category: "execution",
    image: socialMediaImg, imageAlt: "Building your trading brand",
    content: [
      "Define your unique value proposition",
      "Create consistent branding across platforms",
      "Build trust through transparency and results",
      "Develop your signature content style"
    ],
    tips: ["Be authentic", "Consistency builds recognition"]
  },
  { day: 43, module: "graduation", lessonId: "graduation-1", title: "Final Assessment", icon: Award, category: "review",
    image: chartAnalysisImg, imageAlt: "Final assessment review",
    content: [
      "Review all modules completed",
      "Demonstrate understanding of key concepts",
      "Submit your best content pieces for review",
      "Prepare for certification"
    ],
    tips: ["Review your notes", "Ask questions if unsure"]
  },
  { day: 44, module: "graduation", lessonId: "graduation-2", title: "Certification Day", icon: GraduationCap, category: "review",
    image: chartAnalysisImg, imageAlt: "Ambassador certification",
    content: [
      "Congratulations on completing the 44-day training!",
      "You are now a certified AI Trading Vault Ambassador",
      "Continue creating content and growing your audience",
      "Access exclusive ambassador resources and support"
    ],
    tips: ["Celebrate your achievement!", "Keep learning and growing"]
  }
];

const categoryColors = {
  foundation: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' },
  strategy: { bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400' },
  mindset: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400' },
  execution: { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400' },
  review: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-400' }
};

export default function TrainingDay() {
  const { dayNumber } = useParams<{ dayNumber: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const dayNum = parseInt(dayNumber || "1");

  const dayData = trainingDays.find(d => d.day === dayNum);
  const prevDay = trainingDays.find(d => d.day === dayNum - 1);
  const nextDay = trainingDays.find(d => d.day === dayNum + 1);

  const { data: progress } = useQuery<TrainingProgress>({
    queryKey: ['/api/ambassador/training/progress']
  });

  const completedLessons = progress?.completedLessons || [];
  const isCompleted = dayData ? completedLessons.includes(dayData.lessonId) : false;

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!dayData) return;
      const newCompleted = [...completedLessons, dayData.lessonId];
      const res = await fetch('/api/ambassador/training/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          completedLessons: newCompleted,
          quizScores: progress?.quizScores || {}
        })
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ambassador/training/progress'] });
      toast({
        title: "Day Completed!",
        description: `You've completed Day ${dayNum}. Keep up the great work!`
      });
    }
  });

  if (!dayData) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <Card className="bg-gray-800 border-gray-700 max-w-md">
          <CardContent className="p-8 text-center">
            <Clock className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Day Not Found</h2>
            <p className="text-gray-400 mb-4">This training day doesn't exist.</p>
            <Button onClick={() => setLocation('/training-calendar')}>
              Return to Calendar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const categoryStyle = categoryColors[dayData.category as keyof typeof categoryColors];
  const IconComponent = dayData.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            onClick={() => setLocation('/training-calendar')}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Calendar
          </Button>
          
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                <CheckCircle className="w-4 h-4 mr-1" />
                Completed
              </Badge>
            ) : (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                In Progress
              </Badge>
            )}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <Card className={`${categoryStyle.bg} ${categoryStyle.border}`}>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${categoryStyle.bg}`}>
                  <IconComponent className={`w-8 h-8 ${categoryStyle.text}`} />
                </div>
                <div>
                  <Badge variant="outline" className={`mb-2 ${categoryStyle.text}`}>
                    Day {dayData.day} • {dayData.category}
                  </Badge>
                  <CardTitle className="text-2xl text-white">{dayData.title}</CardTitle>
                  <CardDescription className="text-gray-400">
                    Module: {dayData.module}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          {dayData.image && (
            <Card className="bg-gray-800/50 border-gray-700 overflow-hidden">
              <div className="relative">
                <img 
                  src={dayData.image} 
                  alt={dayData.imageAlt || dayData.title}
                  className="w-full h-64 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <p className="text-white text-sm font-medium">{dayData.imageAlt || "Visual Guide"}</p>
                </div>
              </div>
            </Card>
          )}

          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <BookOpen className="w-5 h-5 text-amber-400" />
                Today's Lesson
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dayData.content.map((point, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-start gap-3"
                >
                  <div className="mt-1">
                    <ChevronRight className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-gray-300">{point}</p>
                </motion.div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Star className="w-5 h-5 text-yellow-400" />
                Pro Tips
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dayData.tips.map((tip, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <Zap className="w-4 h-4 text-yellow-400 mt-0.5" />
                  <p className="text-yellow-200 text-sm">{tip}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row gap-4">
            {!isCompleted && (
              <Button 
                onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isPending}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {completeMutation.isPending ? "Saving..." : "Mark Day Complete"}
              </Button>
            )}
            
            {nextDay && (
              <Button 
                onClick={() => setLocation(`/training-calendar/day/${nextDay.day}`)}
                variant="outline"
                className="flex-1 border-gray-600"
              >
                Next: Day {nextDay.day}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>

          <div className="flex justify-between pt-4 border-t border-gray-700">
            {prevDay ? (
              <Button 
                variant="ghost" 
                onClick={() => setLocation(`/training-calendar/day/${prevDay.day}`)}
                className="text-gray-400"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Day {prevDay.day}
              </Button>
            ) : <div />}
            
            {nextDay ? (
              <Button 
                variant="ghost" 
                onClick={() => setLocation(`/training-calendar/day/${nextDay.day}`)}
                className="text-gray-400"
              >
                Day {nextDay.day}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : <div />}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
