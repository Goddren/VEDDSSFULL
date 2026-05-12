import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useRef } from "react";
import { Redirect } from "wouter";
import {
  Heart,
  Users,
  BookOpen,
  DollarSign,
  Shield,
  Globe,
  Smartphone,
  Monitor,
  GraduationCap,
  Building2,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  MapPin,
  Handshake,
  Zap,
  Send,
  Bot,
  UserCircle,
  ArrowRight,
  Star,
  FileText,
  Phone,
  Mail,
  Calendar,
  Loader2,
  ChevronRight,
  Info,
  Target,
  TrendingUp,
  Award,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "standard" | "youth" | "community";

interface Partner {
  org: string;
  type: string;
  participants: number;
  mou: boolean;
  status: "active" | "prospect" | "reporting";
}

interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

interface Program {
  icon: React.ReactNode;
  title: string;
  description: string;
  participants: number;
  status: "Active" | "Pilot";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PARTNERS: Partner[] = [
  { org: "City of Atlanta Workforce Development Board", type: "Government", participants: 89, mou: true, status: "active" },
  { org: "Historically Black Colleges Coalition", type: "Education", participants: 124, mou: true, status: "active" },
  { org: "Chicago CDFI Alliance", type: "CDFI", participants: 67, mou: false, status: "prospect" },
  { org: "Rural Opportunities Inc.", type: "Nonprofit", participants: 43, mou: true, status: "active" },
  { org: "Veterans Financial Alliance", type: "Nonprofit", participants: 38, mou: true, status: "active" },
  { org: "National Urban League - Tech Chapter", type: "Nonprofit", participants: 71, mou: false, status: "reporting" },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How do I build credit?",
    answer: (
      <div className="space-y-2 text-sm">
        <p className="font-semibold text-amber-400">Steps to Build Credit:</p>
        <ol className="list-decimal list-inside space-y-1 text-slate-300">
          <li>Open a secured credit card with a small limit ($200–$500).</li>
          <li>Use it for one small recurring bill (e.g., streaming service).</li>
          <li>Pay the full balance every month — never miss a due date.</li>
          <li>Keep your utilization below 30% of your limit.</li>
          <li>Check your credit report annually at AnnualCreditReport.com.</li>
          <li>After 12 months of on-time payments, request a credit limit increase.</li>
        </ol>
      </div>
    ),
  },
  {
    question: "What is a budget?",
    answer: (
      <div className="space-y-2 text-sm">
        <p className="font-semibold text-amber-400">A Budget is Your Money Plan:</p>
        <p className="text-slate-300">A budget tells every dollar where to go before the month begins. Try the 50/30/20 rule:</p>
        <ul className="list-disc list-inside space-y-1 text-slate-300">
          <li><span className="text-green-400">50%</span> — Needs (rent, groceries, utilities)</li>
          <li><span className="text-blue-400">30%</span> — Wants (dining, entertainment)</li>
          <li><span className="text-purple-400">20%</span> — Savings & debt payoff</li>
        </ul>
        <p className="text-slate-400 text-xs mt-2">Track with a free app like Mint or a simple spreadsheet.</p>
      </div>
    ),
  },
  {
    question: "How do I start investing with $100?",
    answer: (
      <div className="space-y-2 text-sm">
        <p className="font-semibold text-amber-400">Your First $100 Investment:</p>
        <ol className="list-decimal list-inside space-y-1 text-slate-300">
          <li>Open a free brokerage account (Fidelity, Charles Schwab, or Robinhood).</li>
          <li>Buy a low-cost S&P 500 index fund (e.g., VOO or FXAIX).</li>
          <li>Enable automatic monthly contributions — even $25 helps.</li>
          <li>Reinvest dividends automatically.</li>
          <li>Do not sell during market dips — time in the market beats timing the market.</li>
        </ol>
      </div>
    ),
  },
  {
    question: "What is a 401k?",
    answer: (
      <div className="space-y-2 text-sm">
        <p className="font-semibold text-amber-400">401k: Your Employer-Sponsored Retirement Account</p>
        <ul className="list-disc list-inside space-y-1 text-slate-300">
          <li>Pre-tax contributions reduce your taxable income now.</li>
          <li>Grows tax-deferred until retirement (age 59½+).</li>
          <li>Many employers match contributions — this is <span className="text-green-400">free money</span>.</li>
          <li>2024 contribution limit: $23,000 ($30,500 if age 50+).</li>
          <li>Always contribute at least enough to get the full employer match first.</li>
        </ul>
      </div>
    ),
  },
  {
    question: "How do I pay off debt?",
    answer: (
      <div className="space-y-2 text-sm">
        <p className="font-semibold text-amber-400">Two Proven Strategies:</p>
        <p className="text-slate-300"><span className="text-red-400 font-semibold">Avalanche Method</span> (saves most money): Pay minimums on all debts, then throw extra money at the highest-interest debt first.</p>
        <p className="text-slate-300"><span className="text-blue-400 font-semibold">Snowball Method</span> (builds momentum): Pay off the smallest balance first, then roll that payment to the next debt.</p>
        <ul className="list-disc list-inside space-y-1 text-slate-300 mt-1">
          <li>List all debts with balances and interest rates.</li>
          <li>Cut one unnecessary expense and redirect it to debt.</li>
          <li>Call creditors to negotiate lower interest rates.</li>
        </ul>
      </div>
    ),
  },
];

const PROGRAMS: Program[] = [
  {
    icon: <DollarSign className="h-5 w-5 text-green-400" />,
    title: "SNAP-to-Trade Program",
    description: "Financial aid recipients learn trading fundamentals and build investment knowledge while maintaining SNAP eligibility.",
    participants: 93,
    status: "Active",
  },
  {
    icon: <Shield className="h-5 w-5 text-blue-400" />,
    title: "Re-Entry Financial Coaching",
    description: "Dedicated support for returning citizens rebuilding financial lives with credit repair, budgeting, and employment resources.",
    participants: 47,
    status: "Active",
  },
  {
    icon: <Heart className="h-5 w-5 text-red-400" />,
    title: "Veterans Financial Resilience",
    description: "Tailored financial planning and trading education for veterans, including VA benefits optimization and investment strategies.",
    participants: 38,
    status: "Active",
  },
  {
    icon: <MapPin className="h-5 w-5 text-amber-400" />,
    title: "Rural Community Digital Access",
    description: "USDA Rural Development-aligned program bringing digital finance tools to underconnected rural communities.",
    participants: 24,
    status: "Pilot",
  },
  {
    icon: <Building2 className="h-5 w-5 text-purple-400" />,
    title: "Faith Community Finance",
    description: "Church and faith-based organization workshops covering stewardship, family budgeting, and community investment.",
    participants: 61,
    status: "Active",
  },
];

const EQUITY_FEATURES = [
  { label: "Mobile-first interface (no desktop required)", done: true },
  { label: "Offline-capable modules", done: true },
  { label: "Multi-language support (English/Spanish)", done: true },
  { label: "Low-bandwidth mode", done: true },
  { label: "Screen reader compatible", done: true },
  { label: "Free tier available", done: true },
  { label: "SMS-based learning (coming Q2)", done: false },
  { label: "Library kiosk mode (coming Q3)", done: false },
];

const TOPIC_CATEGORIES = ["Budgeting", "Credit", "Investing", "Debt", "Business"];

const YOUTH_LESSONS = [
  { emoji: "💵", title: "What is money?", body: "Money is a tool we use to trade goods and services. Coins and bills represent value agreed upon by society." },
  { emoji: "📈", title: "What is a trade?", body: "A trade is when two people exchange things of value. In financial markets, you buy and sell assets like stocks." },
  { emoji: "🤖", title: "How does AI work?", body: "AI learns patterns from millions of examples — like how you learned to ride a bike through practice — and uses those patterns to make predictions." },
];

const YOUTH_BADGES = [
  { emoji: "🌟", label: "Finance Explorer", color: "text-yellow-400" },
  { emoji: "🧮", label: "Math Wizard", color: "text-blue-400" },
  { emoji: "🚀", label: "Tech Pioneer", color: "text-purple-400" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function CircularGauge({ value, max }: { value: number; max: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = (value / max) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#1e293b" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="#22d3ee"
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-cyan-400">{value}</span>
          <span className="text-xs text-slate-400">/ {max}</span>
        </div>
      </div>
      <p className="text-sm text-slate-400 font-medium">Digital Access Score</p>
    </div>
  );
}

function PartnerStatusBadge({ status }: { status: Partner["status"] }) {
  const map: Record<Partner["status"], { label: string; className: string }> = {
    active: { label: "Active", className: "bg-green-500/20 text-green-400 border-green-500/30" },
    prospect: { label: "Prospect", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    reporting: { label: "Reporting", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  };
  const cfg = map[status];
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}

function AddPartnerDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ org: "", type: "", email: "", notes: "" });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.org || !form.type || !form.email) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    toast({ title: "Partner Added", description: `${form.org} has been added to your partner list.` });
    setForm({ org: "", type: "", email: "", notes: "" });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-cyan-600 hover:bg-cyan-500 text-white">
          <Handshake className="h-4 w-4 mr-2" />
          Add New Partner
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#0f1623] border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add Community Partner</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label htmlFor="partner-org">Organization Name *</Label>
            <Input
              id="partner-org"
              placeholder="e.g. City of Detroit CDFI"
              className="bg-slate-800 border-slate-600 text-white"
              value={form.org}
              onChange={(e) => setForm((f) => ({ ...f, org: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="partner-type">Organization Type *</Label>
            <Input
              id="partner-type"
              placeholder="e.g. Government, Nonprofit, CDFI, Education"
              className="bg-slate-800 border-slate-600 text-white"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="partner-email">Contact Email *</Label>
            <Input
              id="partner-email"
              type="email"
              placeholder="contact@organization.org"
              className="bg-slate-800 border-slate-600 text-white"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="partner-notes">Notes</Label>
            <Textarea
              id="partner-notes"
              placeholder="MOU status, program interests, point of contact..."
              className="bg-slate-800 border-slate-600 text-white resize-none"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="text-slate-400">
              Cancel
            </Button>
            <Button type="submit" className="bg-cyan-600 hover:bg-cyan-500">
              Save Partner
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Section: Digital Equity ──────────────────────────────────────────────────

function DigitalEquityCard() {
  const { toast } = useToast();
  return (
    <Card className="bg-[#0f1623] border-slate-700 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-white flex items-center gap-2 text-base">
          <Globe className="h-5 w-5 text-cyan-400" />
          Digital Equity Access Tools
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex justify-center">
          <CircularGauge value={73} max={100} />
        </div>
        <div className="space-y-2">
          {EQUITY_FEATURES.map((feat) => (
            <div key={feat.label} className="flex items-start gap-2">
              {feat.done ? (
                <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
              ) : (
                <Clock className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              )}
              <span className={`text-sm ${feat.done ? "text-slate-300" : "text-slate-500"}`}>
                {feat.label}
              </span>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          className="w-full border-slate-600 text-slate-300 hover:text-white hover:border-cyan-500"
          onClick={() =>
            toast({
              title: "Accessibility Issue Reported",
              description: "Our team will review your report within 48 hours. Thank you.",
            })
          }
        >
          Report Accessibility Issue
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Full Financial Coach Session Dialog ─────────────────────────────────────

interface ChatMessage {
  role: "user" | "coach";
  text: string;
  timestamp: Date;
}

const QUICK_QUESTIONS = [
  "How do I build credit from scratch?",
  "What's the best way to start investing with $100?",
  "How do I create a budget that actually works?",
  "How do I pay off debt fast?",
  "What is a 401k and should I use it?",
  "How do I open a bank account with bad credit?",
];

const COACH_RESPONSES: Record<string, string> = {
  default: "Great question! Let me break that down for you in simple terms. Financial health is a journey — every step forward counts. Could you share a bit more context so I can give you the most relevant advice?",
  credit: "Building credit takes consistency, not perfection. Start with a secured credit card ($200–$500 deposit), use it for ONE small recurring bill, and pay the FULL balance every month. Check your credit report free at AnnualCreditReport.com. After 12 months of on-time payments, request a limit increase — that lowers your utilization ratio, which is 30% of your score.",
  invest: "Your first $100 investment: Open a free brokerage account at Fidelity or Charles Schwab. Buy a low-cost S&P 500 index fund like VOO or FXAIX. Enable automatic monthly contributions — even $25 matters. Reinvest dividends. The key? DON'T sell during dips. Time in the market beats timing the market every time.",
  budget: "The 50/30/20 rule is the simplest starting point: 50% for needs (rent, groceries, utilities), 30% for wants (dining out, entertainment), 20% for savings and debt payoff. Track everything for 30 days — most people are shocked where their money goes. Free apps: Mint, YNAB, or even a notes app works.",
  debt: "Two proven strategies: Avalanche Method (pay off highest-interest debt first — saves the most money long term), or Snowball Method (pay off smallest balance first — builds momentum and motivation). List all your debts with balances and rates. Cut one unnecessary expense and redirect it to debt. Call creditors and negotiate — they often lower rates if you ask.",
  "401k": "A 401k is your employer's retirement account. Contributions come out pre-tax, which lowers your taxable income NOW. The huge benefit: employer matching — that's literally free money. Always contribute at least enough to get the full match. 2024 limit is $23,000. The money grows tax-deferred until you retire at 59½+.",
  bank: "If traditional banks won't work, try: (1) Credit unions — they're member-owned and more flexible, (2) Online banks like Chime or Current — no credit check, no minimum balance, (3) Second-chance checking accounts — banks like Wells Fargo and US Bank offer these specifically for people rebuilding. You can also start with a prepaid debit card to build a transaction history.",
};

function getCoachResponse(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('credit')) return COACH_RESPONSES.credit;
  if (q.includes('invest') || q.includes('$100') || q.includes('stock')) return COACH_RESPONSES.invest;
  if (q.includes('budget')) return COACH_RESPONSES.budget;
  if (q.includes('debt') || q.includes('pay off')) return COACH_RESPONSES.debt;
  if (q.includes('401k') || q.includes('retirement')) return COACH_RESPONSES["401k"];
  if (q.includes('bank') || q.includes('account')) return COACH_RESPONSES.bank;
  return COACH_RESPONSES.default;
}

function FinancialCoachSessionDialog() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "coach",
      text: "Hey! I'm your VEDD Financial Coach. I'm here to help you with budgeting, credit, investing, and building wealth — no judgment, just real talk. What's on your mind?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(text: string) {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { role: "user", text: text.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setTimeout(() => {
      const coachMsg: ChatMessage = {
        role: "coach",
        text: getCoachResponse(text),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, coachMsg]);
      setLoading(false);
    }, 900);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full mt-2 bg-cyan-700 hover:bg-cyan-600 text-white gap-2">
          <Bot className="h-4 w-4" /> Start Full Coaching Session
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#0f1623] border-slate-700 text-white max-w-lg h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-slate-700 shrink-0">
          <DialogTitle className="text-white flex items-center gap-2">
            <Bot className="h-5 w-5 text-cyan-400" />
            VEDD Financial Coach
            <Badge className="ml-auto bg-green-600/20 text-green-400 border-green-500/40 text-xs">Live</Badge>
          </DialogTitle>
          <p className="text-xs text-slate-400">Free for all community members — ask anything about money</p>
        </DialogHeader>

        {/* Quick questions */}
        <div className="px-4 pt-3 pb-2 border-b border-slate-700/50 shrink-0">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Quick Questions</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-full px-2.5 py-1 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-3">
          <div className="space-y-3">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === "coach" ? "bg-cyan-700/40" : "bg-slate-700"}`}>
                  {msg.role === "coach"
                    ? <Bot className="h-4 w-4 text-cyan-400" />
                    : <UserCircle className="h-4 w-4 text-slate-300" />
                  }
                </div>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "coach"
                    ? "bg-slate-800 text-slate-200"
                    : "bg-cyan-700 text-white"
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-cyan-700/40 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="bg-slate-800 rounded-xl px-3 py-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="px-4 py-3 border-t border-slate-700 shrink-0">
          <div className="flex gap-2">
            <Input
              placeholder="Ask anything about money, credit, investing..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              className="bg-slate-800 border-slate-600 text-white placeholder-slate-500 flex-1"
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="bg-cyan-700 hover:bg-cyan-600 text-white px-3"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-slate-600 mt-1.5">Educational guidance only — not financial advice. Always consult a licensed professional for major decisions.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Section: Financial Literacy Coach ───────────────────────────────────────

function FinancialCoachCard() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function toggleFaq(index: number) {
    setOpenFaq((prev) => (prev === index ? null : index));
  }

  return (
    <Card className="bg-[#0f1623] border-slate-700 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Bot className="h-4 w-4 text-cyan-400" />
          Ask Your Financial Coach
        </CardTitle>
        <p className="text-xs text-slate-400 mt-0.5">
          Powered by VEDD AI — Free for all community members
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 mb-1">
          {TOPIC_CATEGORIES.map((cat) => (
            <Badge key={cat} variant="outline" className="border-cyan-800 text-cyan-400 text-xs cursor-default">
              {cat}
            </Badge>
          ))}
        </div>

        <div className="space-y-2">
          {FAQ_ITEMS.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-slate-700 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left text-slate-200 hover:bg-slate-800 transition-colors"
                onClick={() => toggleFaq(idx)}
              >
                <span>{item.question}</span>
                {openFaq === idx ? (
                  <ChevronUp className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
                )}
              </button>
              <AnimatePresence initial={false}>
                {openFaq === idx && (
                  <motion.div
                    key="answer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 py-3 bg-slate-800/60 border-t border-slate-700">
                      {item.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Live chat session — replaces broken route link */}
        <FinancialCoachSessionDialog />
      </CardContent>
    </Card>
  );
}

// ─── Program Detail Dialog ────────────────────────────────────────────────────

const PROGRAM_DETAILS: Record<string, {
  fullDescription: string;
  eligibility: string[];
  whatYouGet: string[];
  howToEnroll: string[];
  coordinator: { name: string; email: string; phone: string };
  nextSession: string;
  duration: string;
  cost: string;
}> = {
  "SNAP-to-Trade Program": {
    fullDescription: "The SNAP-to-Trade Program is designed specifically for individuals receiving SNAP (food assistance) benefits. We teach trading fundamentals, chart reading, and financial planning in a way that's approachable for absolute beginners — no prior finance knowledge required. Participation does NOT affect your SNAP eligibility.",
    eligibility: ["Currently receiving SNAP benefits", "18+ years old", "Access to a smartphone or computer", "No prior trading or finance experience needed"],
    whatYouGet: ["8-week structured trading curriculum", "Free VEDD platform access during program", "Financial literacy certificate upon completion", "1-on-1 financial coaching session (1 hour)", "Community group for peer support and accountability"],
    howToEnroll: ["Fill out the enrollment form below", "Provide your SNAP case number (for eligibility verification only)", "Attend virtual orientation (30 min, held every Monday)", "Complete 3-module pre-course assessment", "Begin your cohort on the next available start date"],
    coordinator: { name: "Community Programs Team", email: "community@veddbuild.com", phone: "(404) 555-0192" },
    nextSession: "Starts every first Monday of the month",
    duration: "8 weeks (2 hours/week)",
    cost: "Free",
  },
  "Re-Entry Financial Coaching": {
    fullDescription: "Built specifically for returning citizens rebuilding their financial lives after incarceration. We provide a judgment-free space to repair credit, establish banking, navigate employment, and build a sustainable financial foundation. Our coaches have personal experience with the re-entry process.",
    eligibility: ["Returning citizen (released within last 3 years)", "Currently residing in a supported city", "18+ years old", "Committed to completing the 6-week program"],
    whatYouGet: ["6-week personalized financial coaching program", "Credit repair action plan", "Bank account setup assistance", "Employment resource directory", "Legal aid referrals for expungement (where available)", "Monthly alumni check-ins for 1 year"],
    howToEnroll: ["Submit the enrollment form below", "Initial intake call scheduled within 48 hours", "Complete a confidential financial assessment", "Meet your assigned coach at your first session"],
    coordinator: { name: "Re-Entry Support Team", email: "reentry@veddbuild.com", phone: "(312) 555-0847" },
    nextSession: "Rolling enrollment — intake calls weekly",
    duration: "6 weeks intensive + 12-month alumni support",
    cost: "Free",
  },
  "Veterans Financial Resilience": {
    fullDescription: "Tailored financial planning and trading education built around the unique needs of veterans. We cover VA benefits optimization, transition from military to civilian finances, GI Bill strategies, and investment basics. All facilitators are veterans or veteran-allied professionals.",
    eligibility: ["U.S. military veteran (any branch, any era)", "Currently separated or planning separation", "18+ years old", "Valid DD-214 or equivalent documentation"],
    whatYouGet: ["VA benefits optimization review", "Customized financial plan", "Trading basics and VEDD platform training", "GI Bill and education benefit guidance", "Monthly veteran peer group sessions", "Priority access to VEDD's job board"],
    howToEnroll: ["Complete the veteran enrollment form below", "Upload DD-214 or proof of service", "Schedule your first session within 1 week", "Attend veteran cohort orientation"],
    coordinator: { name: "Veterans Programs Team", email: "veterans@veddbuild.com", phone: "(757) 555-0321" },
    nextSession: "New cohorts start every 2 weeks",
    duration: "10-week program",
    cost: "Free for veterans",
  },
  "Rural Community Digital Access": {
    fullDescription: "A USDA Rural Development-aligned program bringing digital finance tools and AI trading education to rural and underconnected communities. We partner with local libraries, community centers, and extension offices to deliver in-person AND remote sessions with low-bandwidth optimization.",
    eligibility: ["Located in a rural area (USDA-designated)", "Access to at minimum a smartphone with data", "18+ years old", "No prior technology experience required"],
    whatYouGet: ["Digital literacy foundation course", "Mobile-first VEDD platform access", "Offline-capable learning modules", "Local community ambassador assignment", "Quarterly in-person workshops at partner sites", "Digital device access program (limited availability)"],
    howToEnroll: ["Submit interest form below with your ZIP code", "We'll confirm rural eligibility and connect you to your nearest partner site", "Attend virtual or in-person orientation", "Join your regional cohort"],
    coordinator: { name: "Rural Outreach Team", email: "rural@veddbuild.com", phone: "(800) 555-0456" },
    nextSession: "Quarterly cohorts — next starts in 3 weeks",
    duration: "12 weeks flexible",
    cost: "Free",
  },
  "Faith Community Finance": {
    fullDescription: "Finance workshops designed for churches, mosques, temples, and faith-based organizations. We help faith communities teach financial stewardship, family budgeting, and ethical investing to their congregations. Sessions can be hosted at your place of worship and customized for your community's values.",
    eligibility: ["Faith-based organization or individual congregation member", "Any denomination or faith tradition welcome", "All ages (youth sessions available)", "No finance background required"],
    whatYouGet: ["Customized finance workshop for your congregation", "Tithing and stewardship planning tools", "Family budget worksheets", "Ethical investing curriculum (halal, faith-aligned options covered)", "Community credit union setup guidance", "Annual financial health event template"],
    howToEnroll: ["Request a workshop for your congregation below", "Your ministry leader or coordinator will be contacted within 3 business days", "Co-create a session schedule that works for your community", "Facilitate your first workshop within 2 weeks of onboarding"],
    coordinator: { name: "Faith Partnerships Team", email: "faith@veddbuild.com", phone: "(678) 555-0783" },
    nextSession: "Workshops hosted on your schedule",
    duration: "Flexible — 1-day event or 6-week series",
    cost: "Free",
  },
};

function ProgramDetailDialog({ program }: { program: Program }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const details = PROGRAM_DETAILS[program.title];

  function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email) {
      toast({ title: "Missing fields", description: "Please provide your name and email.", variant: "destructive" });
      return;
    }
    setEnrolled(true);
    toast({ title: "Enrollment Request Submitted! 🎉", description: `We'll contact you at ${form.email} within 48 hours to confirm your spot.` });
  }

  if (!details) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/20 px-2 gap-1">
          Learn More <ChevronRight className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#0f1623] border-slate-700 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            {program.icon}
            <DialogTitle className="text-white text-lg">{program.title}</DialogTitle>
            <Badge variant="outline" className={program.status === "Active" ? "border-green-600 text-green-400 text-xs ml-auto" : "border-amber-600 text-amber-400 text-xs ml-auto"}>
              {program.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: <Users className="h-4 w-4 text-cyan-400" />, label: "Participants", value: `${program.participants}` },
              { icon: <Clock className="h-4 w-4 text-amber-400" />, label: "Duration", value: details.duration },
              { icon: <DollarSign className="h-4 w-4 text-green-400" />, label: "Cost", value: details.cost },
            ].map(s => (
              <div key={s.label} className="bg-slate-800/60 rounded-lg p-3 text-center border border-slate-700">
                <div className="flex justify-center mb-1">{s.icon}</div>
                <p className="text-sm font-bold text-white">{s.value}</p>
                <p className="text-[10px] text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Full description */}
          <div>
            <p className="text-sm text-slate-300 leading-relaxed">{details.fullDescription}</p>
          </div>

          {/* Eligibility */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Eligibility
            </h4>
            <div className="space-y-1.5">
              {details.eligibility.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* What you get */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-yellow-400" /> What You Get
            </h4>
            <div className="grid grid-cols-1 gap-1.5">
              {details.whatYouGet.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-slate-300 bg-slate-800/40 rounded-lg px-3 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 mt-0.5 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* How to enroll */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <ArrowRight className="h-3.5 w-3.5 text-blue-400" /> How to Enroll
            </h4>
            <div className="space-y-2">
              {details.howToEnroll.map((step, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="w-5 h-5 rounded-full bg-blue-700/60 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-slate-300">{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Next session */}
          <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3 flex items-center gap-3">
            <Calendar className="h-4 w-4 text-cyan-400 shrink-0" />
            <div>
              <p className="text-xs font-medium text-white">Next Session</p>
              <p className="text-xs text-slate-400">{details.nextSession}</p>
            </div>
          </div>

          {/* Enrollment form or confirmation */}
          {!enrolled ? (
            <form onSubmit={handleEnroll} className="space-y-3 border-t border-slate-700 pt-4">
              <h4 className="text-sm font-semibold text-white">Request Enrollment</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="enroll-name" className="text-xs text-slate-400">Full Name *</Label>
                  <Input id="enroll-name" placeholder="Your name" className="bg-slate-800 border-slate-600 text-white text-sm h-9"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="enroll-email" className="text-xs text-slate-400">Email *</Label>
                  <Input id="enroll-email" type="email" placeholder="your@email.com" className="bg-slate-800 border-slate-600 text-white text-sm h-9"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="enroll-phone" className="text-xs text-slate-400">Phone (optional)</Label>
                <Input id="enroll-phone" placeholder="(555) 000-0000" className="bg-slate-800 border-slate-600 text-white text-sm h-9"
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="enroll-notes" className="text-xs text-slate-400">Anything you'd like your coordinator to know?</Label>
                <Textarea id="enroll-notes" placeholder="Optional — share your goals, challenges, or questions..." className="bg-slate-800 border-slate-600 text-white text-sm resize-none" rows={3}
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <Button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 text-white gap-2">
                <Send className="h-4 w-4" /> Submit Enrollment Request
              </Button>
              <p className="text-[10px] text-slate-500 text-center">
                Questions? Contact {details.coordinator.email} or call {details.coordinator.phone}
              </p>
            </form>
          ) : (
            <div className="border-t border-slate-700 pt-4 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-green-600/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
              <div>
                <p className="text-base font-bold text-green-400">Enrollment Request Submitted! 🎉</p>
                <p className="text-sm text-slate-400 mt-1">We'll reach out to {form.email} within 48 hours to confirm your spot and share next steps.</p>
              </div>
              <Button variant="outline" className="border-slate-600 text-slate-300" onClick={() => setOpen(false)}>Close</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Section: Community Programs ─────────────────────────────────────────────

function CommunityProgramsCard() {
  return (
    <Card className="bg-[#0f1623] border-slate-700 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-white flex items-center gap-2 text-base">
          <Users className="h-5 w-5 text-purple-400" />
          Underserved Community Support
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {PROGRAMS.map((prog) => (
          <div
            key={prog.title}
            className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {prog.icon}
                <span className="text-sm font-medium text-white">{prog.title}</span>
              </div>
              <Badge
                variant="outline"
                className={
                  prog.status === "Active"
                    ? "border-green-600 text-green-400 text-xs"
                    : "border-amber-600 text-amber-400 text-xs"
                }
              >
                {prog.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-400">{prog.description}</p>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500">
                <Users className="h-3 w-3 inline mr-1" />
                {prog.participants} participants
              </span>
              <ProgramDetailDialog program={prog} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Section: Youth STEM Mode ─────────────────────────────────────────────────

function YouthSTEMMode() {
  const [answer, setAnswer] = useState("");
  const CORRECT = 520;
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [prediction, setPrediction] = useState<"up" | "down" | null>(null);
  const [earnedBadges, setEarnedBadges] = useState<number[]>([]);

  function checkAnswer() {
    const val = parseInt(answer.replace(/[^0-9]/g, ""), 10);
    if (val === CORRECT) {
      setResult("correct");
      setEarnedBadges((prev) => (prev.includes(1) ? prev : [...prev, 1]));
    } else {
      setResult("wrong");
    }
  }

  function handlePrediction(dir: "up" | "down") {
    setPrediction(dir);
    if (!earnedBadges.includes(0)) setEarnedBadges((prev) => [...prev, 0]);
  }

  return (
    <div className="space-y-6">
      {/* Lesson Cards */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-yellow-400" /> Learn About Money
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {YOUTH_LESSONS.map((lesson) => (
            <Card key={lesson.title} className="bg-[#0f1623] border-slate-600">
              <CardContent className="pt-5 pb-4 space-y-2 text-center">
                <div className="text-4xl">{lesson.emoji}</div>
                <p className="text-lg font-bold text-white">{lesson.title}</p>
                <p className="text-base text-slate-300">{lesson.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Math Challenge */}
      <Card className="bg-[#0f1623] border-slate-600">
        <CardHeader>
          <CardTitle className="text-white text-lg flex items-center gap-2">
            🧮 Math Challenge
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-base text-slate-300">
            If you invest <span className="text-green-400 font-bold">$10/week</span> for{" "}
            <span className="text-green-400 font-bold">52 weeks</span>, how much do you have?
          </p>
          <div className="flex gap-3 items-center">
            <Input
              type="number"
              placeholder="Your answer..."
              className="bg-slate-800 border-slate-600 text-white text-base max-w-xs"
              value={answer}
              onChange={(e) => { setAnswer(e.target.value); setResult(null); }}
            />
            <Button onClick={checkAnswer} className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold">
              Check Answer
            </Button>
          </div>
          <AnimatePresence>
            {result === "correct" && (
              <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-lg font-bold text-green-400">
                🎉 Correct! $520 — great math skills!
              </motion.p>
            )}
            {result === "wrong" && (
              <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-base text-red-400">
                Not quite — hint: 10 × 52 = ?
              </motion.p>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Trading Simulator */}
      <Card className="bg-[#0f1623] border-slate-600">
        <CardHeader>
          <CardTitle className="text-white text-lg flex items-center gap-2">
            📈 Trading Simulator — Will the market go up or down today?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-base text-slate-300">VEDD Index is at <span className="text-cyan-400 font-bold">4,283</span>. Make your prediction!</p>
          <div className="flex gap-4">
            <Button
              size="lg"
              className={`text-lg flex-1 ${prediction === "up" ? "bg-green-600 hover:bg-green-500" : "bg-slate-700 hover:bg-green-700"}`}
              onClick={() => handlePrediction("up")}
            >
              📈 Going Up!
            </Button>
            <Button
              size="lg"
              className={`text-lg flex-1 ${prediction === "down" ? "bg-red-600 hover:bg-red-500" : "bg-slate-700 hover:bg-red-700"}`}
              onClick={() => handlePrediction("down")}
            >
              📉 Going Down!
            </Button>
          </div>
          <AnimatePresence>
            {prediction && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="rounded-lg bg-slate-800 p-4 text-center">
                <p className="text-xl">{prediction === "up" ? "🚀 Bold prediction!" : "🛡️ Playing it safe!"}</p>
                <p className="text-base text-slate-300 mt-1">
                  Real traders analyze news, earnings reports, and economic data before predicting. Keep learning!
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Badge System */}
      <Card className="bg-[#0f1623] border-slate-600">
        <CardHeader>
          <CardTitle className="text-white text-lg">🏆 Your Badges</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {YOUTH_BADGES.map((badge, idx) => (
              <motion.div
                key={badge.label}
                whileHover={{ scale: 1.05 }}
                className={`flex flex-col items-center gap-1 p-4 rounded-xl border-2 ${
                  earnedBadges.includes(idx)
                    ? "border-yellow-500 bg-yellow-500/10"
                    : "border-slate-700 bg-slate-800/40 opacity-40"
                }`}
              >
                <span className="text-4xl">{badge.emoji}</span>
                <span className={`text-sm font-bold ${badge.color}`}>{badge.label}</span>
                {!earnedBadges.includes(idx) && <span className="text-xs text-slate-500">Locked</span>}
              </motion.div>
            ))}
          </div>
          <p className="text-sm text-slate-500 mt-3">Complete activities to unlock badges!</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CommunityImpactPage() {
  const { user, isLoading } = useAuth();

  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("vedd_community_mode") as Mode) ?? "standard";
    }
    return "standard";
  });

  useEffect(() => {
    localStorage.setItem("vedd_community_mode", mode);
  }, [mode]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#080B14] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-cyan-500" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  const textBase = mode === "community" ? "text-base" : "text-sm";

  const MODES: { key: Mode; label: string; icon: React.ReactNode }[] = [
    { key: "standard", label: "Standard Mode", icon: <Monitor className="h-4 w-4" /> },
    { key: "youth", label: "Youth STEM Mode", icon: <GraduationCap className="h-4 w-4" /> },
    { key: "community", label: "Community Mode", icon: <Users className="h-4 w-4" /> },
  ];

  return (
    <div className={`min-h-screen bg-[#080B14] text-white ${mode === "community" ? "text-lg" : ""}`}>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* ── 1. Header ──────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">
                Community Impact Layer
              </h1>
              <p className="text-cyan-400 text-sm mt-1 font-medium">
                Digital Equity &amp; Financial Empowerment
              </p>
            </div>

            {/* Mode Toggle */}
            <div className="flex rounded-lg border border-slate-700 overflow-hidden bg-slate-900 w-fit">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                    mode === m.key
                      ? "bg-cyan-700 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {m.icon}
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── 2. Impact Stats Row ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {[
            { icon: <MapPin className="h-5 w-5 text-cyan-400" />, value: "847", label: "Communities Served" },
            { icon: <Heart className="h-5 w-5 text-red-400" />, value: "62%", label: "Low-Income Participants" },
            { icon: <GraduationCap className="h-5 w-5 text-yellow-400" />, value: "156", label: "Youth Enrolled" },
            { icon: <BookOpen className="h-5 w-5 text-green-400" />, value: "423", label: "Financial Literacy Completions" },
          ].map((stat) => (
            <Card key={stat.label} className="bg-[#0f1623] border-slate-700">
              <CardContent className="pt-5 pb-4 flex flex-col items-center text-center gap-2">
                {stat.icon}
                <p className="text-3xl font-bold text-white">{stat.value}</p>
                <p className={`${textBase} text-slate-400`}>{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* ── 3 / 4. Main Content ─────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {mode === "youth" ? (
            <motion.div
              key="youth"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
            >
              <YouthSTEMMode />
            </motion.div>
          ) : (
            <motion.div
              key="standard"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              <div className="lg:col-span-1">
                <DigitalEquityCard />
              </div>
              <div className="lg:col-span-1">
                <FinancialCoachCard />
              </div>
              <div className="lg:col-span-1">
                <CommunityProgramsCard />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 5. Community Partnership Manager ───────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <Card className="bg-[#0f1623] border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Handshake className="h-5 w-5 text-cyan-400" />
                  Community Partnership Manager
                </CardTitle>
                <AddPartnerDialog />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 text-left">
                      <th className="pb-3 pr-4 font-medium">Organization</th>
                      <th className="pb-3 pr-4 font-medium">Type</th>
                      <th className="pb-3 pr-4 font-medium text-right">Participants</th>
                      <th className="pb-3 pr-4 font-medium text-center">MOU</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PARTNERS.map((partner) => (
                      <tr key={partner.org} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 pr-4 text-white font-medium">{partner.org}</td>
                        <td className="py-3 pr-4 text-slate-400">{partner.type}</td>
                        <td className="py-3 pr-4 text-slate-300 text-right">{partner.participants}</td>
                        <td className="py-3 pr-4 text-center">
                          {partner.mou ? (
                            <CheckCircle2 className="h-4 w-4 text-green-400 mx-auto" />
                          ) : (
                            <Clock className="h-4 w-4 text-amber-400 mx-auto" />
                          )}
                        </td>
                        <td className="py-3">
                          <PartnerStatusBadge status={partner.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── 6. Grant Alignment Note ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
        >
          <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-4 flex gap-3">
            <Zap className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <p className={`${textBase} text-amber-300`}>
              <span className="font-semibold">Grant Alignment:</span> This module directly supports{" "}
              <span className="font-medium text-amber-200">CDFI Fund grants</span>,{" "}
              <span className="font-medium text-amber-200">DOL WIOA Title I funding</span>,{" "}
              <span className="font-medium text-amber-200">NSF ADVANCE program</span>,{" "}
              <span className="font-medium text-amber-200">USDA Rural Development grants</span>, and{" "}
              <span className="font-medium text-amber-200">HUD Community Development Block Grants</span>.
              Maintain participation records for quarterly reporting.
            </p>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
