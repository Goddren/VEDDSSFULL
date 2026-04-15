import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Users, MessageSquare, Zap, BookOpen, Target, Copy, Check,
  Plus, Trash2, Edit2, Save, X, ChevronRight, Star, TrendingUp,
  Instagram, Twitter, Facebook, Hash, Play, RefreshCw, Lightbulb,
  Calendar, Award, DollarSign, BarChart3, Bot, Megaphone,
  Globe, Search, Sparkles, ExternalLink, ChevronDown, ChevronUp,
  Flame, Phone, Mail, Link2, Loader2,
} from "lucide-react";
import { Redirect } from "wouter";

interface DmKeyword {
  id: number;
  keyword: string;
  responseTemplate: string;
  platform: string;
  isActive: boolean;
  triggerCount: number;
}

interface QuizQuestion {
  id: string | number;
  text: string;
  yesScore: number;
}

interface LandingPageQuiz {
  id: number;
  userId: number;
  title: string;
  slug: string;
  headline: string | null;
  subheadline: string | null;
  questions: QuizQuestion[];
  ctaText: string | null;
  thankYouMessage: string | null;
  brandColor: string | null;
  isActive: boolean | null;
  leadCount: number | null;
  createdAt: string;
}

interface QuizLead {
  id: number;
  quizId: number | null;
  ambassadorId: number;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  answers: Array<{ questionId: string | number; answer: string }> | null;
  leadScore: number | null;
  leadQuality: string | null;
  status: string | null;
  source: string | null;
  platform: string | null;
  profileUrl: string | null;
  bioSnippet: string | null;
  aiInsights: string | null;
  notes: string | null;
  convertedAt: string | null;
  createdAt: string;
}

interface SocialLeadScan {
  id: number;
  userId: number;
  platform: string;
  keywords: string;
  searchUrls: Array<{ label: string; url: string; description: string }> | null;
  outreachKit: string | null;
  leadsAdded: number | null;
  createdAt: string;
}

interface OutreachKit {
  hashtags: string[];
  searchQueries: string[];
  searchUrls: Array<{ label: string; url: string; description: string }>;
  dmScript: string;
  commentScript: string;
  profileKeywords: string[];
  bestTimeToPost: string;
  tips: string[];
}

const STARTER_QUESTIONS: QuizQuestion[] = [
  { id: "q1", text: "Are you currently looking for ways to grow your income?", yesScore: 5 },
  { id: "q2", text: "Have you ever tried trading or investing before?", yesScore: 4 },
  { id: "q3", text: "Are you open to learning a proven trading system?", yesScore: 5 },
  { id: "q4", text: "Do you have at least 30 minutes a day to dedicate to building wealth?", yesScore: 4 },
  { id: "q5", text: "Are you serious about achieving financial freedom in the next 12 months?", yesScore: 5 },
];

const SOCIAL_PLATFORMS = [
  { id: "twitter", label: "Twitter / X", icon: Twitter, color: "text-sky-400" },
  { id: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-400" },
  { id: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-500" },
  { id: "linkedin", label: "LinkedIn", icon: Globe, color: "text-blue-400" },
  { id: "tiktok", label: "TikTok", icon: Hash, color: "text-purple-400" },
];

const PLATFORM_ICONS: Record<string, any> = {
  instagram: Instagram,
  twitter: Twitter,
  facebook: Facebook,
  tiktok: Hash,
  all: Megaphone,
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "text-pink-400",
  twitter: "text-sky-400",
  facebook: "text-blue-500",
  tiktok: "text-purple-400",
  all: "text-amber-400",
};

// Updated 44-day plan highlights tied to VEDD features
const WEEK_HIGHLIGHTS = [
  {
    week: 1,
    theme: "Foundation — Chart Analysis & VEDD AI Basics",
    feature: "AI Analysis Engine",
    days: "Days 1–7",
    content: "Introduce candlestick patterns, S/R zones, and trend identification. Tie each day to VEDD's live AI analysis — show how the platform reads charts in real-time. Post screenshots of VEDD identifying patterns.",
    cta: "Share a VEDD analysis screenshot with your personal breakdown. Tag 3 traders who need this.",
    tip: "Use VEDD's Analysis page. Screenshot the AI's pattern ID and add your commentary overlay.",
  },
  {
    week: 2,
    theme: "Strategy — Brain Mode, Breakout & Multi-TF",
    feature: "Brain Mode + Breakout Mode + Multi-Timeframe EA",
    days: "Days 8–14",
    content: "Teach trading strategies using VEDD's Brain Mode (double confirmation), Breakout Master Mode, and Multi-Timeframe EA. Show how the AI layers confirmations before calling a trade.",
    cta: "Go Live showing Brain Mode calling a trade setup. React to it in real-time.",
    tip: "Enable Brain Mode in Settings. Run Multi-TF EA on your broker for live trade stats to show.",
  },
  {
    week: 3,
    theme: "Mindset — Live Trading, Risk & Weekly Strategy",
    feature: "Weekly Strategy + Live Monitor",
    days: "Days 15–21",
    content: "Focus on discipline and planning. Tie to VEDD's Weekly Strategy planner — show how to build a structured trading week. Use Live Monitor for real-time accountability posts.",
    cta: "Post your VEDD Weekly Strategy plan every Sunday. Show your planned pairs and targets.",
    tip: "Weekly Strategy page auto-calculates pair stats. Screenshot the W/L % and progress bars.",
  },
  {
    week: 4,
    theme: "Execution — MT5 EA, TradeLocker & Live Signals",
    feature: "MT5 EA Generator + TradeLocker + Live Engine",
    days: "Days 22–28",
    content: "Show the full execution stack: MT5 EA running automated signals, TradeLocker integration, and VEDD's Live Engine. Post real trade results with the platform doing the analysis.",
    cta: "Record your EA running on MT5 with VEDD signals. Show entry, exit, and P&L.",
    tip: "Connect TradeLocker or MT5 and let VEDD log trades automatically. Share the live stats.",
  },
  {
    week: 5,
    theme: "Advanced — Futures, Solana Scanner & Tokenomics",
    feature: "Futures Connect + Solana Scanner + VEDD Token",
    days: "Days 29–35",
    content: "Introduce advanced asset classes. Show VEDD's Futures Connect page, Solana token scanner, and VEDD tokenomics. Position VEDD as a multi-asset AI platform, not just forex.",
    cta: "Create a 'Did you know VEDD does THIS?' post series covering futures and crypto integration.",
    tip: "Use the SOL Scanner landing page as a standalone share — it works for non-subscribers too.",
  },
  {
    week: 6,
    theme: "Community & Income — Grants, Referrals & Ambassador",
    feature: "Grants Portal + Referral Hub + Ambassador Program",
    days: "Days 36–42",
    content: "Shift to income and impact. Show the Grants & Funding portal for business grants. Teach the referral system and how credits add up. Walk through ambassador income streams.",
    cta: "Post your referral stats screenshot: 'X people signed up through my link this week.' Social proof.",
    tip: "Grants + Referral Hub + Ambassador training all live in the app. Show the CEO Dashboard for impact.",
  },
  {
    week: 7,
    theme: "Graduation & Scale — Social, Wallet & NFT",
    feature: "Social Hub + VEDD Wallet + NFT/Token Gating",
    days: "Days 43–44",
    content: "Final stretch: showcase VEDD as a full financial ecosystem. Social Hub for publishing, VEDD Wallet for token earnings, and how ambassador NFT unlocks token-gated features.",
    cta: "Graduation post: share your journey and invite the next cohort. Create urgency with limited spots.",
    tip: "VEDD Wallet shows your token balance. Combine with Achievements page for a powerful proof post.",
  },
];

// Recruitment training modules
const TRAINING_MODULES = [
  {
    id: 1, title: "The VEDD Value Stack", category: "Foundation",
    desc: "Learn exactly what you're selling: AI trading signals + education + community + income. Understand every feature so you can speak to it naturally.",
    steps: [
      "Know the 5 core platforms: Analysis, Live Engine, Brain Mode, MT5 EA, TradeLocker",
      "Know the 3 income streams: subscription referrals, ambassador credits, grant funding",
      "Know the 2 communities: trading tribe + ambassador network",
      "Practice the 30-second VEDD pitch: 'AI that finds trades + pays you to share it'",
    ],
  },
  {
    id: 2, title: "The Warm Market First Approach", category: "Prospecting",
    desc: "Your warmest audience converts best. Start with who already trusts you before going cold.",
    steps: [
      "List 20 people who've asked you about trading in the last 6 months",
      "Segment: who wants signals? who wants to learn? who wants income?",
      "Reach out personally — NOT a broadcast. Reference something specific about them.",
      "Offer a free trial walkthrough, not a sales pitch",
    ],
  },
  {
    id: 3, title: "Content That Converts", category: "Content",
    desc: "Every post should do one thing: make someone curious about VEDD. Use results, education, and storytelling.",
    steps: [
      "Post category 1: Results — show a trade VEDD called (with entry/exit)",
      "Post category 2: Education — explain a concept using VEDD as the tool",
      "Post category 3: Behind the scenes — show your VEDD dashboard/stats",
      "Post category 4: Social proof — show referral stats or community growth",
    ],
  },
  {
    id: 4, title: "Objection Handling", category: "Sales",
    desc: "The 5 most common objections and exactly how to handle each one with honesty and confidence.",
    steps: [
      "'I don't trade' → 'Perfect — VEDD teaches you while you watch AI trade'",
      "'Too expensive' → 'Less than $2/day, and I can show you how to earn credits to offset it'",
      "'Is it legit?' → 'Try the free tier — no card needed. Here's my link'",
      "'I tried signals before' → 'This isn't just signals — it's an AI that explains WHY'",
      "'I don't have time' → 'Brain Mode runs in the background — 10 min a day max'",
    ],
  },
  {
    id: 5, title: "DM Automation Strategy", category: "Scale",
    desc: "Set up keyword triggers so your content works for you while you sleep. Every comment and DM that contains your keywords gets an instant, personalized response ready to send.",
    steps: [
      "Set up 5 core keywords: VEDD, trading, signals, income, free",
      "Create a 3-message sequence: intro → value → CTA",
      "Reply within 5 minutes — early replies get 10x more engagement",
      "Use the keyword generator in the DM Automation tab for copy-paste responses",
    ],
  },
  {
    id: 6, title: "Building Your Recruit Pipeline", category: "Scale",
    desc: "Treat recruiting like a sales funnel. Track every prospect from first contact to subscription.",
    steps: [
      "Stage 1 (Aware): they've seen your content",
      "Stage 2 (Interested): they commented/DM'd",
      "Stage 3 (Trial): they signed up with your link",
      "Stage 4 (Converted): they subscribed",
      "Follow up consistently — most conversions happen on day 3–7 after signup",
    ],
  },
];

// Default DM response templates for first-time setup
const DEFAULT_TEMPLATES = [
  {
    keyword: "vedd",
    platform: "all",
    responseTemplate: `Hey {name}! 👋 You asked about VEDD — it's the AI trading platform I use every day.

Here's the quick version: VEDD's AI analyzes charts, spots trade setups, and even runs on autopilot through MT5. It also has Brain Mode for double-confirmation signals so you're not guessing.

The best part? You can try it FREE — no card needed.

Link: [YOUR REFERRAL LINK]

DM me if you want a quick walkthrough — I walk new members through it personally. 🚀`,
  },
  {
    keyword: "signals",
    platform: "all",
    responseTemplate: `{name} — I actually use AI signals through VEDD, not manual ones.

The difference is VEDD shows you the reasoning behind every signal (not just buy/sell). You see the pattern, the timeframe confirmation, and the risk level.

Free tier gets you daily signals: [YOUR REFERRAL LINK]

Want me to show you a recent setup it called? 📊`,
  },
  {
    keyword: "income",
    platform: "all",
    responseTemplate: `{name}, great question on income! 💰

VEDD has an ambassador program where you earn credits every time someone signs up through your link. Those credits pay for your own subscription or stack up.

They also just added a Grants & Funding portal to help ambassadors apply for business grants.

Start here (free): [YOUR REFERRAL LINK]

I can walk you through the ambassador setup too — DM me back with "AMBASSADOR" 🙌`,
  },
  {
    keyword: "free",
    platform: "all",
    responseTemplate: `Yes, {name} — VEDD has a real free tier, not a fake one. 😄

Free includes:
✅ AI chart analysis
✅ Daily market signals
✅ 7/8 candle pattern tool
✅ SOL token scanner

No card, no tricks. Just sign up: [YOUR REFERRAL LINK]

Drop a comment here when you're in and I'll send you a quick start guide!`,
  },
];

export default function AmbassadorRecruitmentPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const urlTab = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("tab") || "training";

  const [newKeyword, setNewKeyword] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [newPlatform, setNewPlatform] = useState("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editKeyword, setEditKeyword] = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [generatedResponse, setGeneratedResponse] = useState<{ text: string; keyword: string } | null>(null);
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);
  const [senderName, setSenderName] = useState("");
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Lead Pages tab state
  const [quizEditOpen, setQuizEditOpen] = useState(false);
  const [editQuiz, setEditQuiz] = useState<Partial<LandingPageQuiz>>({});
  const [leadFilter, setLeadFilter] = useState("all");
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ firstName: "", lastName: "", email: "", phone: "", profileUrl: "", bioSnippet: "", platform: "", source: "manual" });
  const [expandedLead, setExpandedLead] = useState<number | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Social Scanner tab state
  const [selectedPlatform, setSelectedPlatform] = useState("twitter");
  const [scanKeywords, setScanKeywords] = useState("");
  const [scanResult, setScanResult] = useState<(SocialLeadScan & { kit?: OutreachKit }) | null>(null);
  const [expandedScan, setExpandedScan] = useState<number | null>(null);
  const [addProspectOpen, setAddProspectOpen] = useState(false);
  const [prospectForm, setProspectForm] = useState({ firstName: "", lastName: "", profileUrl: "", bioSnippet: "", platform: selectedPlatform });
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // All hooks must be before any early returns
  const isAmbassador = user?.isAmbassador || user?.isAdmin;

  // Lead Pages queries
  const { data: landingPageQuiz, refetch: refetchQuiz } = useQuery<LandingPageQuiz>({
    queryKey: ["/api/ambassador/landing-page"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/ambassador/landing-page");
      return res.json();
    },
    enabled: !!isAmbassador,
  });

  const { data: leads = [], refetch: refetchLeads } = useQuery<QuizLead[]>({
    queryKey: ["/api/ambassador/leads"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/ambassador/leads");
      return res.json();
    },
    enabled: !!isAmbassador,
  });

  const { data: pastScans = [] } = useQuery<SocialLeadScan[]>({
    queryKey: ["/api/ambassador/social-scans"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/ambassador/social-scans");
      return res.json();
    },
    enabled: !!isAmbassador,
  });

  const updateQuizMutation = useMutation({
    mutationFn: async (data: Partial<LandingPageQuiz>) => {
      const res = await apiRequest("PATCH", "/api/ambassador/landing-page", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/landing-page"] });
      setQuizEditOpen(false);
      toast({ title: "Landing page updated!" });
    },
    onError: () => toast({ title: "Failed to update landing page", variant: "destructive" }),
  });

  const createLeadMutation = useMutation({
    mutationFn: async (data: typeof newLeadForm) => {
      const res = await apiRequest("POST", "/api/ambassador/leads", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/leads"] });
      setAddLeadOpen(false);
      setNewLeadForm({ firstName: "", lastName: "", email: "", phone: "", profileUrl: "", bioSnippet: "", platform: "", source: "manual" });
      toast({ title: "Lead added!" });
    },
    onError: () => toast({ title: "Failed to add lead", variant: "destructive" }),
  });

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<QuizLead> }) => {
      const res = await apiRequest("PATCH", `/api/ambassador/leads/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/leads"] });
    },
    onError: () => toast({ title: "Failed to update lead", variant: "destructive" }),
  });

  const deleteLeadMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/ambassador/leads/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/leads"] });
      toast({ title: "Lead deleted" });
    },
  });

  const enrichLeadMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/ambassador/leads/${id}/enrich`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/leads"] });
      toast({ title: "Lead enriched with AI!", description: "AI insights added." });
    },
    onError: () => toast({ title: "AI enrichment failed", variant: "destructive" }),
  });

  const socialScanMutation = useMutation({
    mutationFn: async (data: { platform: string; keywords: string }) => {
      const res = await apiRequest("POST", "/api/ambassador/social-scan", data);
      return res.json();
    },
    onSuccess: (data) => {
      setScanResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/social-scans"] });
      toast({ title: "Outreach kit generated!" });
    },
    onError: () => toast({ title: "Failed to generate outreach kit", variant: "destructive" }),
  });

  const addProspectMutation = useMutation({
    mutationFn: async (data: typeof prospectForm) => {
      const res = await apiRequest("POST", "/api/ambassador/leads", { ...data, source: "social_scan" });
      return res.json();
    },
    onSuccess: (newLead) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/leads"] });
      setAddProspectOpen(false);
      setProspectForm({ firstName: "", lastName: "", profileUrl: "", bioSnippet: "", platform: selectedPlatform });
      toast({ title: "Prospect added!", description: "Enriching with AI..." });
      // Auto-enrich
      enrichLeadMutation.mutate(newLead.id);
    },
    onError: () => toast({ title: "Failed to add prospect", variant: "destructive" }),
  });

  const { data: keywords = [], isLoading: kwLoading } = useQuery<DmKeyword[]>({
    queryKey: ["/api/dm-keywords"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/dm-keywords");
      return res.json();
    },
    enabled: !!isAmbassador,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { keyword: string; responseTemplate: string; platform: string }) => {
      const res = await apiRequest("POST", "/api/dm-keywords", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dm-keywords"] });
      setNewKeyword(""); setNewTemplate(""); setNewPlatform("all");
      toast({ title: "Keyword trigger created!" });
    },
    onError: () => toast({ title: "Failed to create keyword", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/dm-keywords/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dm-keywords"] });
      setEditingId(null);
      toast({ title: "Keyword updated!" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/dm-keywords/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dm-keywords"] });
      toast({ title: "Keyword deleted" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async ({ id, senderName }: { id: number; senderName: string }) => {
      const res = await apiRequest("POST", `/api/dm-keywords/${id}/generate`, { senderName });
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedResponse({ text: data.response, keyword: data.keyword });
      setGeneratingFor(null);
    },
    onError: () => toast({ title: "Failed to generate response", variant: "destructive" }),
  });

  if (!isAmbassador) {
    return <Redirect to="/dashboard" />;
  }

  const addDefaultTemplates = () => {
    DEFAULT_TEMPLATES.forEach((t) => {
      createMutation.mutate({ keyword: t.keyword, responseTemplate: t.responseTemplate, platform: t.platform });
    });
    toast({ title: "4 default templates added!", description: "Customize the [YOUR REFERRAL LINK] placeholders." });
  };

  return (
    <div className="container max-w-4xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-bold">Ambassador Recruitment Hub</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Learn to recruit, automate your DMs, and track your growing team.
        </p>
      </div>

      {/* ── Quick-access: My Lead Page shortcut ── */}
      {landingPageQuiz && (
        <div className="mb-5 rounded-xl border border-purple-500/30 bg-purple-500/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Globe className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-purple-300">My Lead Page</span>
            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]">
              {landingPageQuiz.leadCount || 0} leads
            </Badge>
          </div>
          <code className="flex-1 text-xs text-muted-foreground bg-black/30 rounded px-2 py-1 truncate">
            {typeof window !== "undefined" ? window.location.origin : ""}/lp/{landingPageQuiz.slug}
          </code>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" className="h-7 text-xs border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/lp/${landingPageQuiz.slug}`);
                toast({ title: "Lead page link copied!" });
              }}>
              <Copy className="w-3 h-3 mr-1" /> Copy Link
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
              onClick={() => window.open(`/lp/${landingPageQuiz.slug}`, "_blank")}>
              <ExternalLink className="w-3 h-3 mr-1" /> Preview
            </Button>
          </div>
        </div>
      )}

      <Tabs defaultValue={urlTab}>
        <TabsList className="flex flex-wrap gap-1 h-auto mb-6">
          <TabsTrigger value="training" className="text-xs">Training Modules</TabsTrigger>
          <TabsTrigger value="44day" className="text-xs">44-Day Plan</TabsTrigger>
          <TabsTrigger value="dm" className="text-xs">DM Automation</TabsTrigger>
          <TabsTrigger value="scripts" className="text-xs">Scripts</TabsTrigger>
          <TabsTrigger value="leadpages" className="text-xs">Lead Pages</TabsTrigger>
          <TabsTrigger value="social" className="text-xs">Social Scanner</TabsTrigger>
        </TabsList>

        {/* ── TRAINING MODULES ── */}
        <TabsContent value="training">
          <div className="space-y-4">
            {TRAINING_MODULES.map((module) => (
              <Card key={module.id} className="border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge variant="outline" className="text-xs mb-2">{module.category}</Badge>
                      <CardTitle className="text-base">{module.title}</CardTitle>
                      <CardDescription className="text-xs mt-1">{module.desc}</CardDescription>
                    </div>
                    <div className="bg-blue-500/10 text-blue-400 w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm">
                      {module.id}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {module.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <ChevronRight className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">{step}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── UPDATED 44-DAY PLAN ── */}
        <TabsContent value="44day">
          <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <Star className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Updated — Now tied to every VEDD feature</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Each week links your content to specific VEDD tools your audience can immediately try.
                  The full day-by-day curriculum is in the{" "}
                  <a href="/ambassador/content-flow" className="text-amber-400 hover:underline">Content Flow</a> section.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {WEEK_HIGHLIGHTS.map((week) => (
              <Card key={week.week} className="border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="text-xs bg-blue-600 text-white">Week {week.week}</Badge>
                        <span className="text-xs text-muted-foreground">{week.days}</span>
                      </div>
                      <CardTitle className="text-sm">{week.theme}</CardTitle>
                    </div>
                    <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg p-2">
                      <Zap className="w-4 h-4 text-blue-400" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-400 mb-1">VEDD Feature Focus</p>
                    <Badge variant="outline" className="text-xs">{week.feature}</Badge>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Content Strategy</p>
                    <p className="text-xs text-muted-foreground">{week.content}</p>
                  </div>
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                    <p className="text-xs font-semibold text-green-400 mb-1">Daily CTA</p>
                    <p className="text-xs text-muted-foreground">{week.cta}</p>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                    <p className="text-xs font-semibold text-purple-400 mb-1">Pro Tip</p>
                    <p className="text-xs text-muted-foreground">{week.tip}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-4 text-center">
            <Button variant="outline" onClick={() => window.location.href = '/ambassador/content-flow'} className="gap-2">
              <Calendar className="w-4 h-4" />
              Open Full 44-Day Calendar
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </TabsContent>

        {/* ── DM AUTOMATION ── */}
        <TabsContent value="dm">
          <div className="space-y-4">
            {/* Info banner */}
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Bot className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Keyword-Triggered Response Generator</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Set keywords that trigger when someone DMs or comments. Click "Generate" to instantly
                    create a personalized response you copy-paste into your DM. Track how often each keyword fires.
                  </p>
                </div>
              </div>
            </div>

            {/* Generated response display */}
            {generatedResponse && (
              <Card className="border-green-500/30 bg-green-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-400" />
                    Generated Response — Keyword: "{generatedResponse.keyword}"
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={generatedResponse.text}
                    readOnly
                    rows={8}
                    className="text-sm font-mono bg-background/60 mb-3"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-2 bg-green-600 hover:bg-green-500"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedResponse.text);
                        setCopiedResponse(true);
                        toast({ title: "Response copied! Paste into your DM." });
                        setTimeout(() => setCopiedResponse(false), 2500);
                      }}
                    >
                      {copiedResponse ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy Response
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setGeneratedResponse(null)}>
                      <X className="w-3.5 h-3.5 mr-1" /> Clear
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Generate panel */}
            {generatingFor !== null && (
              <Card className="border-blue-500/30">
                <CardContent className="pt-4 space-y-3">
                  <p className="text-sm font-semibold">Personalize Response</p>
                  <div>
                    <Label className="text-xs mb-1 block">Sender's Name (optional)</Label>
                    <Input
                      placeholder="e.g. Marcus"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Replaces {"{name}"} in your template</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-2 bg-blue-600 hover:bg-blue-500"
                      onClick={() => generateMutation.mutate({ id: generatingFor, senderName })}
                      disabled={generateMutation.isPending}
                    >
                      {generateMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      Generate
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setGeneratingFor(null)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Existing keywords */}
            {kwLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : keywords.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="py-10 text-center">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-sm font-semibold mb-1">No keyword triggers yet</p>
                  <p className="text-xs text-muted-foreground mb-4">Add your first keyword to start automating DM responses</p>
                  <Button size="sm" variant="outline" onClick={addDefaultTemplates} className="gap-2">
                    <Zap className="w-3.5 h-3.5" />
                    Load 4 Starter Templates
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {keywords.map((kw) => {
                  const PlatformIcon = PLATFORM_ICONS[kw.platform] || Megaphone;
                  const isEditing = editingId === kw.id;
                  return (
                    <Card key={kw.id} className={`border-border/50 transition-colors ${!kw.isActive ? 'opacity-60' : ''}`}>
                      <CardContent className="p-4">
                        {isEditing ? (
                          <div className="space-y-3">
                            <Input
                              value={editKeyword}
                              onChange={(e) => setEditKeyword(e.target.value)}
                              placeholder="keyword"
                              className="text-sm"
                            />
                            <Textarea
                              value={editTemplate}
                              onChange={(e) => setEditTemplate(e.target.value)}
                              rows={6}
                              className="text-sm font-mono"
                            />
                            <div className="flex gap-2">
                              <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-500"
                                onClick={() => updateMutation.mutate({ id: kw.id, data: { keyword: editKeyword, responseTemplate: editTemplate } })}>
                                <Save className="w-3.5 h-3.5" /> Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs font-mono">#{kw.keyword}</Badge>
                                <PlatformIcon className={`w-3.5 h-3.5 ${PLATFORM_COLORS[kw.platform] || 'text-muted-foreground'}`} />
                                <span className="text-xs text-muted-foreground">{kw.triggerCount} uses</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={kw.isActive}
                                  onCheckedChange={(checked) => updateMutation.mutate({ id: kw.id, data: { isActive: checked } })}
                                  className="scale-75"
                                />
                                <Button size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={() => { setEditingId(kw.id); setEditKeyword(kw.keyword); setEditTemplate(kw.responseTemplate); }}>
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300"
                                  onClick={() => deleteMutation.mutate(kw.id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2 bg-muted/30 p-2 rounded">
                              {kw.responseTemplate.substring(0, 120)}…
                            </p>
                            <Button
                              size="sm"
                              className="gap-2 bg-blue-600 hover:bg-blue-500 w-full"
                              onClick={() => { setGeneratingFor(kw.id); setSenderName(""); setGeneratedResponse(null); }}
                              disabled={!kw.isActive}
                            >
                              <Play className="w-3.5 h-3.5" />
                              Generate Response
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Add new keyword */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4 text-green-400" />
                  Add Keyword Trigger
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1 block">Keyword</Label>
                    <Input
                      placeholder="e.g. trading, vedd, signals"
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value.toLowerCase())}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Platform</Label>
                    <Select value={newPlatform} onValueChange={setNewPlatform}>
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Platforms</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="twitter">Twitter/X</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Response Template</Label>
                  <Textarea
                    placeholder={`Hey {name}! Thanks for asking about VEDD...\n\nUse {name} for the sender's name.\nAdd [YOUR REFERRAL LINK] as a placeholder.`}
                    value={newTemplate}
                    onChange={(e) => setNewTemplate(e.target.value)}
                    rows={6}
                    className="text-sm font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use <code>{"{name}"}</code> for sender's name. Add your referral link manually.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-2 bg-green-600 hover:bg-green-500"
                  onClick={() => createMutation.mutate({ keyword: newKeyword, responseTemplate: newTemplate, platform: newPlatform })}
                  disabled={!newKeyword || !newTemplate || createMutation.isPending}
                >
                  {createMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add Keyword Trigger
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── SCRIPTS ── */}
        <TabsContent value="scripts">
          <div className="space-y-4">
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <BookOpen className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Sales Script Library</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ready-to-use scripts for every conversation. Full 8-step script is in your{" "}
                    <a href="/ambassador/sales-script" className="text-purple-400 hover:underline">Sales Script page</a>.
                  </p>
                </div>
              </div>
            </div>

            {[
              {
                title: "30-Second Elevator Pitch",
                script: `"Hey, I've been using this AI trading platform called VEDD — it literally reads charts for me, spots setups, and even runs automated trades through MT5.

The part I love is Brain Mode — it does two rounds of AI analysis before confirming a trade, so you're not getting noise.

You can try it free, no card. Want me to send the link?"`,
                use: "Quick intro to anyone who asks what you do"
              },
              {
                title: "Social Media Caption Formula",
                script: `[Hook] — Bold claim or question
[Value] — What VEDD showed/did today
[Proof] — Screenshot or stat
[CTA] — Comment/DM a keyword to get the link

Example:
"This AI found the trade BEFORE the breakout happened. 🧠

VEDD's Brain Mode spotted the setup at [price], confirmed it on 2 timeframes, and the entry triggered automatically.

Result: [X pips] captured while I was at work.

Comment 'SETUP' and I'll show you exactly how this works."`,
                use: "Every content post"
              },
              {
                title: "DM Follow-Up Sequence",
                script: `Day 1: "Hey [name]! Did you get a chance to check out the free VEDD trial? Would love to show you around — 10-minute walkthrough, no pressure."

Day 3: "Quick check-in — [name], VEDD's Brain Mode just called a [pair] setup. Sending you a screenshot. This is the kind of thing you'd see daily if you were inside. Still free to join: [link]"

Day 7: "Last nudge, promise 😄 — A lot of people tell me they wish they'd started sooner. Free tier is still up. If you want me to walk you through it live, just say the word."`,
                use: "Follow up with prospects who clicked but didn't subscribe"
              },
              {
                title: "Objection: 'I'll think about it'",
                script: `"Totally understand — what's the main thing you're still on the fence about?

I ask because I've heard all of them: the price, whether it actually works, whether you have time for it. Whatever it is, I can answer it honestly.

And honestly? The free tier exists so you don't have to take my word for it. You see it work yourself first."`,
                use: "When someone stalls after showing interest"
              },
            ].map((script, i) => (
              <ScriptCard key={i} {...script} />
            ))}

            <div className="text-center mt-4">
              <Button variant="outline" onClick={() => window.location.href = '/ambassador/sales-script'} className="gap-2">
                <BookOpen className="w-4 h-4" />
                Open Full Sales Script (8 Steps)
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── LEAD PAGES ── */}
        <TabsContent value="leadpages">
          <div className="space-y-6">
            {/* My Landing Page card */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="w-4 h-4 text-red-400" />
                      My Landing Page
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">Share this link to capture leads automatically</CardDescription>
                  </div>
                  <Dialog open={quizEditOpen} onOpenChange={setQuizEditOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1 text-xs"
                        onClick={() => setEditQuiz({
                          headline: landingPageQuiz?.headline || "",
                          subheadline: landingPageQuiz?.subheadline || "",
                          ctaText: landingPageQuiz?.ctaText || "",
                          thankYouMessage: landingPageQuiz?.thankYouMessage || "",
                          questions: landingPageQuiz?.questions || [],
                        })}>
                        <Edit2 className="w-3.5 h-3.5" /> Edit Page
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Edit Landing Page</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div>
                          <Label className="text-xs">Headline</Label>
                          <Input value={editQuiz.headline || ""} onChange={e => setEditQuiz(q => ({ ...q, headline: e.target.value }))} placeholder="Are You Ready for Financial Freedom?" />
                        </div>
                        <div>
                          <Label className="text-xs">Subheadline</Label>
                          <Input value={editQuiz.subheadline || ""} onChange={e => setEditQuiz(q => ({ ...q, subheadline: e.target.value }))} placeholder="Answer 5 quick questions..." />
                        </div>
                        <div>
                          <Label className="text-xs">CTA Button Text</Label>
                          <Input value={editQuiz.ctaText || ""} onChange={e => setEditQuiz(q => ({ ...q, ctaText: e.target.value }))} placeholder="Get My Free Trading Assessment" />
                        </div>
                        <div>
                          <Label className="text-xs">Thank You Message</Label>
                          <Textarea value={editQuiz.thankYouMessage || ""} onChange={e => setEditQuiz(q => ({ ...q, thankYouMessage: e.target.value }))} rows={2} />
                        </div>

                        {/* Questions */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-xs">Quiz Questions ({(editQuiz.questions || []).length}/10)</Label>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="text-xs h-7 px-2"
                                onClick={() => setEditQuiz(q => ({ ...q, questions: STARTER_QUESTIONS }))}>
                                Use Starter Set
                              </Button>
                              {(editQuiz.questions || []).length < 10 && (
                                <Button size="sm" variant="outline" className="text-xs h-7 px-2"
                                  onClick={() => setEditQuiz(q => ({
                                    ...q,
                                    questions: [...(q.questions || []), { id: `q${Date.now()}`, text: "", yesScore: 4 }],
                                  }))}>
                                  <Plus className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2">
                            {(editQuiz.questions || []).map((q, i) => (
                              <div key={q.id} className="flex gap-2 items-start">
                                <Input
                                  className="flex-1 text-xs h-8"
                                  value={q.text}
                                  onChange={e => {
                                    const qs = [...(editQuiz.questions || [])];
                                    qs[i] = { ...qs[i], text: e.target.value };
                                    setEditQuiz(eq => ({ ...eq, questions: qs }));
                                  }}
                                  placeholder={`Question ${i + 1}`}
                                />
                                <Select value={String(q.yesScore)} onValueChange={v => {
                                  const qs = [...(editQuiz.questions || [])];
                                  qs[i] = { ...qs[i], yesScore: Number(v) };
                                  setEditQuiz(eq => ({ ...eq, questions: qs }));
                                }}>
                                  <SelectTrigger className="w-16 h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                                  onClick={() => {
                                    const qs = (editQuiz.questions || []).filter((_, j) => j !== i);
                                    setEditQuiz(eq => ({ ...eq, questions: qs }));
                                  }}>
                                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <Button className="w-full" disabled={updateQuizMutation.isPending}
                          onClick={() => updateQuizMutation.mutate(editQuiz as Partial<LandingPageQuiz>)}>
                          {updateQuizMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save Changes"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {landingPageQuiz ? (
                  <div className="space-y-3">
                    <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-2">
                      <code className="text-xs flex-1 break-all text-muted-foreground">
                        {window.location.origin}/lp/{landingPageQuiz.slug}
                      </code>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/lp/${landingPageQuiz.slug}`);
                          setCopiedUrl(true);
                          toast({ title: "URL copied!" });
                          setTimeout(() => setCopiedUrl(false), 2500);
                        }}>
                        {copiedUrl ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                        onClick={() => window.open(`/lp/${landingPageQuiz.slug}`, '_blank')}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {landingPageQuiz.leadCount || 0} leads captured</span>
                      <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> {(landingPageQuiz.questions || []).length} questions</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground text-sm">Loading your landing page...</div>
                )}
              </CardContent>
            </Card>

            {/* Lead List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  Lead List ({leads.length})
                </h3>
                <Dialog open={addLeadOpen} onOpenChange={setAddLeadOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1 text-xs h-8"><Plus className="w-3.5 h-3.5" /> Add Lead</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Add Manual Lead</DialogTitle></DialogHeader>
                    <div className="space-y-3 pt-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs">First Name *</Label><Input value={newLeadForm.firstName} onChange={e => setNewLeadForm(f => ({ ...f, firstName: e.target.value }))} /></div>
                        <div><Label className="text-xs">Last Name</Label><Input value={newLeadForm.lastName} onChange={e => setNewLeadForm(f => ({ ...f, lastName: e.target.value }))} /></div>
                      </div>
                      <div><Label className="text-xs">Email</Label><Input type="email" value={newLeadForm.email} onChange={e => setNewLeadForm(f => ({ ...f, email: e.target.value }))} /></div>
                      <div><Label className="text-xs">Phone</Label><Input value={newLeadForm.phone} onChange={e => setNewLeadForm(f => ({ ...f, phone: e.target.value }))} /></div>
                      <div><Label className="text-xs">Profile URL</Label><Input value={newLeadForm.profileUrl} onChange={e => setNewLeadForm(f => ({ ...f, profileUrl: e.target.value }))} placeholder="https://..." /></div>
                      <div><Label className="text-xs">Bio Snippet (for AI enrichment)</Label><Textarea rows={2} value={newLeadForm.bioSnippet} onChange={e => setNewLeadForm(f => ({ ...f, bioSnippet: e.target.value }))} /></div>
                      <Button className="w-full" disabled={createLeadMutation.isPending || !newLeadForm.firstName}
                        onClick={() => createLeadMutation.mutate(newLeadForm)}>
                        {createLeadMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Adding...</> : "Add Lead"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Stats row */}
              {leads.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold">{leads.length}</p>
                    <p className="text-xs text-muted-foreground">Total Leads</p>
                  </div>
                  <div className="bg-red-500/10 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-400">{leads.filter(l => l.leadQuality === 'hot').length}</p>
                    <p className="text-xs text-muted-foreground">Hot Leads</p>
                  </div>
                  <div className="bg-green-500/10 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-400">
                      {leads.length > 0 ? Math.round((leads.filter(l => l.status === 'converted').length / leads.length) * 100) : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">Conversion</p>
                  </div>
                </div>
              )}

              {/* Filter tabs */}
              <div className="flex flex-wrap gap-1 mb-3">
                {["all","hot","warm","cold","contacted","converted"].map(f => (
                  <Button key={f} size="sm" variant={leadFilter === f ? "default" : "outline"} className="text-xs h-7 px-2"
                    onClick={() => setLeadFilter(f)}>
                    {f === "hot" && <Flame className="w-3 h-3 mr-1 text-red-400" />}
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Button>
                ))}
              </div>

              {/* Lead cards */}
              <div className="space-y-2">
                {leads
                  .filter(l => {
                    if (leadFilter === "all") return true;
                    if (["hot","warm","cold"].includes(leadFilter)) return l.leadQuality === leadFilter;
                    return l.status === leadFilter;
                  })
                  .map(lead => (
                    <Card key={lead.id} className="border-border/50">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{lead.firstName} {lead.lastName}</span>
                              <Badge className={`text-xs ${lead.leadQuality === 'hot' ? 'bg-red-500/20 text-red-400' : lead.leadQuality === 'warm' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                {lead.leadQuality === 'hot' && <Flame className="w-3 h-3 mr-1" />}
                                {lead.leadQuality}
                              </Badge>
                              <Badge variant="outline" className="text-xs">{lead.source}</Badge>
                              {lead.platform && <Badge variant="outline" className="text-xs">{lead.platform}</Badge>}
                            </div>
                            <div className="flex gap-3 mt-1 flex-wrap">
                              {lead.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>}
                              {lead.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>}
                              {lead.profileUrl && (
                                <a href={lead.profileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 flex items-center gap-1">
                                  <Link2 className="w-3 h-3" />Profile
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Select value={lead.status || "new"} onValueChange={v => updateLeadMutation.mutate({ id: lead.id, data: { status: v } })}>
                              <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["new","contacted","qualified","converted","not_interested"].map(s => (
                                  <SelectItem key={s} value={s} className="text-xs">{s.replace('_',' ')}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}>
                              {expandedLead === lead.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </div>

                        {expandedLead === lead.id && (
                          <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                            {lead.aiInsights && (() => {
                              try {
                                const insights = JSON.parse(lead.aiInsights);
                                return (
                                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                                    <p className="text-xs font-semibold text-purple-400 mb-1 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> AI Insights</p>
                                    <p className="text-xs text-muted-foreground"><span className="font-medium">Interest:</span> {insights.interestLevel}</p>
                                    <p className="text-xs text-muted-foreground"><span className="font-medium">Approach:</span> {insights.approach}</p>
                                    <p className="text-xs text-muted-foreground"><span className="font-medium">Opener:</span> {insights.suggestedOpener}</p>
                                  </div>
                                );
                              } catch { return null; }
                            })()}
                            <div>
                              <Label className="text-xs">Notes</Label>
                              <Textarea
                                rows={2} className="text-xs mt-1"
                                defaultValue={lead.notes || ""}
                                onBlur={e => {
                                  if (e.target.value !== (lead.notes || "")) {
                                    updateLeadMutation.mutate({ id: lead.id, data: { notes: e.target.value } });
                                  }
                                }}
                                placeholder="Add notes..."
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="text-xs gap-1 flex-1"
                                disabled={enrichLeadMutation.isPending}
                                onClick={() => enrichLeadMutation.mutate(lead.id)}>
                                {enrichLeadMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-purple-400" />}
                                Enrich with AI
                              </Button>
                              <Button size="sm" variant="ghost" className="text-xs text-red-400 hover:text-red-300 gap-1"
                                onClick={() => deleteLeadMutation.mutate(lead.id)}>
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                {leads.filter(l => {
                  if (leadFilter === "all") return true;
                  if (["hot","warm","cold"].includes(leadFilter)) return l.leadQuality === leadFilter;
                  return l.status === leadFilter;
                }).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {leads.length === 0 ? "No leads yet. Share your landing page to start capturing leads!" : `No ${leadFilter} leads found.`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── SOCIAL SCANNER ── */}
        <TabsContent value="social">
          <div className="space-y-6">
            {/* Platform selector */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="w-4 h-4 text-blue-400" />
                  Social Lead Scanner
                </CardTitle>
                <CardDescription className="text-xs">Generate deep-link search URLs + AI outreach kit for any platform</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs mb-2 block">Select Platform</Label>
                  <div className="flex flex-wrap gap-2">
                    {SOCIAL_PLATFORMS.map(p => {
                      const Icon = p.icon;
                      return (
                        <Button
                          key={p.id}
                          size="sm"
                          variant={selectedPlatform === p.id ? "default" : "outline"}
                          className={`gap-1.5 text-xs h-8 ${selectedPlatform === p.id ? "" : p.color}`}
                          onClick={() => setSelectedPlatform(p.id)}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {p.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label className="text-xs mb-1 block">Target Keywords / Interests</Label>
                  <Textarea
                    rows={3}
                    value={scanKeywords}
                    onChange={e => setScanKeywords(e.target.value)}
                    placeholder="e.g. forex trading, financial freedom, passive income, crypto signals, day trading"
                    className="text-sm"
                  />
                </div>

                <Button
                  className="w-full gap-2"
                  disabled={socialScanMutation.isPending || !scanKeywords.trim()}
                  onClick={() => socialScanMutation.mutate({ platform: selectedPlatform, keywords: scanKeywords })}
                >
                  {socialScanMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> AI generating your personalized outreach strategy...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Generate Outreach Kit</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Scan Results */}
            {scanResult?.kit && (
              <div className="space-y-4">
                {/* Search Links */}
                <Card className="border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ExternalLink className="w-3.5 h-3.5 text-blue-400" /> Search Links</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(scanResult.kit.searchUrls || []).map((u, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-muted/30 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold">{u.label}</p>
                          <p className="text-xs text-muted-foreground">{u.description}</p>
                        </div>
                        <Button size="sm" variant="outline" className="text-xs h-7 shrink-0 gap-1"
                          onClick={() => window.open(u.url, '_blank')}>
                          <ExternalLink className="w-3 h-3" /> Open
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Hashtags */}
                <Card className="border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Hash className="w-3.5 h-3.5 text-green-400" /> Top Hashtags</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {(scanResult.kit.hashtags || []).map((h, i) => (
                        <button key={i}
                          className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-2 py-0.5 hover:bg-green-500/20 transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(h);
                            setCopiedText(h);
                            toast({ title: `Copied: ${h}` });
                            setTimeout(() => setCopiedText(null), 2000);
                          }}>
                          {copiedText === h ? <Check className="w-3 h-3 inline mr-1" /> : null}
                          {h}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* DM Script */}
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5 text-purple-400" /> DM Script</CardTitle>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                        onClick={() => { navigator.clipboard.writeText(scanResult.kit!.dmScript); toast({ title: "DM script copied!" }); }}>
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/30 p-3 rounded-lg leading-relaxed">{scanResult.kit.dmScript}</pre>
                  </CardContent>
                </Card>

                {/* Comment Script */}
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5 text-amber-400" /> Comment Script</CardTitle>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                        onClick={() => { navigator.clipboard.writeText(scanResult.kit!.commentScript); toast({ title: "Comment script copied!" }); }}>
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">{scanResult.kit.commentScript}</p>
                  </CardContent>
                </Card>

                {/* Profile Keywords + Tips */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-border/50">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="w-3.5 h-3.5 text-red-400" /> Profile Keywords</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1">
                        {(scanResult.kit.profileKeywords || []).map((k, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{k}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border/50">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-sky-400" /> Best Time to Post</CardTitle></CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">{scanResult.kit.bestTimeToPost}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Platform Tips */}
                <Card className="border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Lightbulb className="w-3.5 h-3.5 text-yellow-400" /> Platform Tips</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {(scanResult.kit.tips || []).map((t, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <ChevronRight className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Add Prospect from this scan */}
                <Card className="border-red-500/20 border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">Found a prospect?</p>
                        <p className="text-xs text-muted-foreground">Add them manually — AI will enrich their profile automatically</p>
                      </div>
                      <Dialog open={addProspectOpen} onOpenChange={setAddProspectOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="gap-1 shrink-0 bg-red-600 hover:bg-red-500 text-white"><Plus className="w-3.5 h-3.5" /> Add Lead</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader><DialogTitle>Add Prospect from Scan</DialogTitle></DialogHeader>
                          <div className="space-y-3 pt-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div><Label className="text-xs">First Name *</Label><Input value={prospectForm.firstName} onChange={e => setProspectForm(f => ({ ...f, firstName: e.target.value }))} /></div>
                              <div><Label className="text-xs">Last Name</Label><Input value={prospectForm.lastName} onChange={e => setProspectForm(f => ({ ...f, lastName: e.target.value }))} /></div>
                            </div>
                            <div><Label className="text-xs">Profile URL</Label><Input value={prospectForm.profileUrl} onChange={e => setProspectForm(f => ({ ...f, profileUrl: e.target.value }))} placeholder="https://..." /></div>
                            <div><Label className="text-xs">Bio Snippet (paste their bio)</Label><Textarea rows={3} value={prospectForm.bioSnippet} onChange={e => setProspectForm(f => ({ ...f, bioSnippet: e.target.value }))} placeholder="Paste bio or profile description..." /></div>
                            <Button className="w-full" disabled={addProspectMutation.isPending || !prospectForm.firstName}
                              onClick={() => addProspectMutation.mutate({ ...prospectForm, platform: selectedPlatform })}>
                              {addProspectMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Adding & Enriching...</> : "Add + AI Enrich"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Past Scans */}
            {pastScans.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                  Past Scans ({pastScans.length})
                </h3>
                <div className="space-y-2">
                  {pastScans.map(scan => (
                    <Card key={scan.id} className="border-border/50">
                      <CardContent className="p-3">
                        <button
                          className="w-full flex items-center justify-between gap-2"
                          onClick={() => setExpandedScan(expandedScan === scan.id ? null : scan.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {(() => {
                              const PIcon = SOCIAL_PLATFORMS.find(p => p.id === scan.platform)?.icon || Globe;
                              return <PIcon className="w-4 h-4 text-muted-foreground shrink-0" />;
                            })()}
                            <div className="text-left min-w-0">
                              <p className="text-xs font-semibold capitalize">{scan.platform}</p>
                              <p className="text-xs text-muted-foreground truncate">{scan.keywords}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">{scan.leadsAdded || 0} leads</span>
                            <span className="text-xs text-muted-foreground">{new Date(scan.createdAt).toLocaleDateString()}</span>
                            {expandedScan === scan.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </div>
                        </button>
                        {expandedScan === scan.id && scan.outreachKit && (() => {
                          try {
                            const kit: OutreachKit = JSON.parse(scan.outreachKit);
                            return (
                              <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                                <div className="flex flex-wrap gap-1">
                                  {(kit.hashtags || []).slice(0,8).map((h, i) => (
                                    <Badge key={i} variant="outline" className="text-xs">{h}</Badge>
                                  ))}
                                </div>
                                <p className="text-xs text-muted-foreground">{kit.tips?.[0]}</p>
                              </div>
                            );
                          } catch { return null; }
                        })()}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ScriptCard({ title, script, use }: { title: string; script: string; use: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{use}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-7 w-7"
              onClick={() => {
                navigator.clipboard.writeText(script);
                setCopied(true);
                toast({ title: "Script copied!" });
                setTimeout(() => setCopied(false), 2500);
              }}>
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7"
              onClick={() => setExpanded(!expanded)}>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </Button>
          </div>
        </div>
        {expanded && (
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans bg-muted/30 p-3 rounded-lg mt-2 leading-relaxed">
            {script}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
