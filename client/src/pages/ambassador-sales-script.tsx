import { useState } from 'react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronDown, ChevronUp, Copy, Check, Phone, ArrowLeft,
  MessageSquare, Users, DollarSign, Target, Lightbulb,
  HelpCircle, X, CheckCircle, ChevronRight, ChevronLeft,
  Mic, ClipboardList, TrendingUp, Mail
} from 'lucide-react';

const STEPS = [
  { id: 0, label: 'Opening Hook', icon: Mic },
  { id: 1, label: 'Discovery', icon: HelpCircle },
  { id: 2, label: 'Pain → Solution', icon: Lightbulb },
  { id: 3, label: 'Platform Demo', icon: TrendingUp },
  { id: 4, label: 'Pricing', icon: DollarSign },
  { id: 5, label: 'Objections', icon: MessageSquare },
  { id: 6, label: 'Closing', icon: Target },
  { id: 7, label: 'Follow-Up', icon: Mail },
];

function CopyButton({ text }: { text: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: 'Copied to clipboard!' });
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-primary/30 hover:bg-primary/10" onClick={copy}>
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function ScriptBlock({ label, text, highlight }: { label?: string; text: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-4 border text-sm leading-relaxed ${highlight ? 'bg-primary/10 border-primary/30 text-foreground' : 'bg-muted/40 border-border text-muted-foreground'}`}>
      {label && <p className="text-xs font-semibold text-primary mb-2 uppercase tracking-wide">{label}</p>}
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}

function ScriptCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">{title}</p>
        <CopyButton text={text} />
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}

function ObjectionCard({ objection, response }: { objection: string; response: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <X className="h-4 w-4 text-destructive flex-shrink-0" />
          <p className="font-medium text-sm">{objection}</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Your Response
            </p>
            <CopyButton text={response} />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{response}</p>
        </div>
      )}
    </div>
  );
}

export default function AmbassadorSalesScriptPage() {
  const [step, setStep] = useState(0);
  const [hookVariant, setHookVariant] = useState(0);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const hooks = [
    {
      label: 'Cold Call',
      text: `"Hey [Name], I'll be straight with you — I'm reaching out because I work with traders who are tired of guessing and losing money on bad signals. I found a platform called VEDD AI that literally does the chart analysis, generates trade signals, and even builds Expert Advisors for you automatically. Takes about 30 seconds to get a full AI breakdown of any chart. I wanted to share it with you because I think it could genuinely change how you trade. Do you have 5 minutes right now?"`,
    },
    {
      label: 'Warm Lead',
      text: `"Hey [Name], good to connect — you mentioned you're into trading. I actually wanted to share something I've been using that's been a game changer for me. It's called VEDD AI — basically an all-in-one AI trading platform that analyses charts, generates signals, builds EAs, and even has a live trading engine that runs 24/7. I think you'd get a lot from it. Can I walk you through it real quick?"`,
    },
    {
      label: 'Referral',
      text: `"Hey [Name], [Referrer's Name] gave me your contact and said you'd be the perfect person for this. They've been using VEDD AI for their trading and told me to reach out. It's an AI-powered platform — chart analysis, live signals, EA generator, Solana token scanner. I won't take up much of your time but I'd love to show you what it does. When's a good time for a quick 10-minute call?"`,
    },
  ];

  const discoveryQuestions = [
    {
      q: 'What kind of trading do you currently do — forex, crypto, stocks?',
      tip: 'Listen for: their instrument focus, experience level, and whether they use any tools already.',
    },
    {
      q: 'How long have you been trading and would you say it\'s been profitable so far?',
      tip: 'Listen for: pain points around consistency, losses, or frustration.',
    },
    {
      q: 'What does your current process look like — do you rely on signals from someone else, or do you do your own analysis?',
      tip: 'Listen for: manual analysis struggles, reliance on Telegram signal groups, or expensive tools.',
    },
    {
      q: 'What\'s the biggest challenge you\'re facing right now in your trading?',
      tip: 'Golden question — let them talk. This is where the real pain comes out.',
    },
    {
      q: 'If you could solve one thing about your trading in the next 30 days, what would it be?',
      tip: 'Use their answer to frame your pitch directly around VEDD\'s solution to that specific thing.',
    },
  ];

  const painSolutions = [
    {
      pain: 'Losing money / no consistent system',
      solution: 'VEDD AI uses GPT-4o to analyse charts in seconds, giving you a full breakdown — signal, entry, stop loss, take profit, and confidence score. No more guessing. Every trade backed by AI.',
    },
    {
      pain: 'Manual analysis takes too long',
      solution: 'Upload a chart or connect your MT5 and VEDD\'s 12+ indicator engine analyses everything for you automatically — RSI, MACD, Bollinger Bands, ADX, VWAP, volume — in under 30 seconds.',
    },
    {
      pain: 'Emotional trading / no discipline',
      solution: 'The Live Trading Engine runs 24/7 in the background and takes trades automatically based on AI logic — no emotions, no hesitation, no FOMO. Set it and let it work.',
    },
    {
      pain: 'Paying for too many tools',
      solution: 'VEDD replaces TradingView alerts, signal groups, EA builders, copy trading services, and news sentiment tools — all in one platform starting at $49.95/month.',
    },
    {
      pain: 'No EA / coding knowledge',
      solution: 'VEDD\'s EA Generator creates full Expert Advisors for MT4/MT5 with one click — 18 built-in strategies. Download and run. No coding needed.',
    },
  ];

  const demoPoints = [
    { step: '1. Chart Analysis', detail: 'Upload any chart screenshot → AI identifies patterns, trend direction, support/resistance → Full signal with SL, TP, entry, and confidence score in seconds.' },
    { step: '2. Multi-Timeframe Analysis', detail: 'Run your pair across 5 timeframes simultaneously → See where all timeframes agree → Higher confluence = higher accuracy trades.' },
    { step: '3. Live Trading Engine', detail: 'VEDD\'s autonomous engine monitors 20+ pairs 24/7 → Computes indicators, fetches live news sentiment → Executes trades via TradeLocker automatically. Also syncs signals to your MT5 via a free EA.' },
    { step: '4. EA Generator', detail: '18 built-in strategies (scalping, breakout, momentum, sniper) → One click generates a full MT4/MT5 EA → Download, add to MetaTrader, it trades for you.' },
    { step: '5. Solana Scanner', detail: 'AI scans trending Solana tokens → Scores them for sentiment, tokenomics, whale activity → Paper trading mode to test before going live.' },
    { step: '6. VEDD Token Rewards', detail: 'Every analysis, EA creation, and trade earns VEDD tokens → Redeemable for subscriptions, governance votes, and exclusive features.' },
  ];

  const pricingScripts = [
    {
      plan: 'Free Plan',
      price: '$0',
      script: `"There\'s actually a free plan — no credit card needed. You get access to chart analysis, the EA generator, and the platform so you can see it working with your own eyes. Most people start here and upgrade within the first week once they see what it can do."`,
    },
    {
      plan: 'Starter — $49.95/mo',
      price: '$49.95/mo',
      script: `"The Starter plan is $49.95 a month. Think about it this way — if you're paying $50+ for just a signal Telegram group or a basic charting tool, VEDD gives you AI chart analysis, the EA generator, live signals, multi-timeframe analysis, and the Sol scanner for the same price. It replaces 5 tools in one."`,
    },
    {
      plan: 'Premium — $149.99/mo',
      price: '$149.99/mo',
      script: `"Premium is $149.99 and that's where the real power is — you get the full Live Trading Engine running 24/7, priority AI models, unlimited chart analyses, and full access to everything. If you're serious about trading as income, that's less than $5 a day for a full AI trading system running around the clock while you sleep."`,
    },
    {
      plan: 'Yearly — $999.99',
      price: '$999.99 lifetime access',
      script: `"The yearly deal is $999.99 — that's lifetime access, no monthly fees ever again. Compare that to $149.99 x 12 = $1,800 a year on monthly. You're basically getting 5 months free. If you're committed to trading long term, this one's a no-brainer. Most serious traders grab this one."`,
    },
  ];

  const objections = [
    {
      objection: "It's too expensive.",
      response: `"I hear you — but let me ask this: what are you currently spending on signal groups, charting tools, or EAs separately? Most traders are paying $150–$300/month across different tools. VEDD puts it all in one place for as low as $49.95. And there's a free plan if you want to start with zero risk and see it for yourself first."`,
    },
    {
      objection: "I need to think about it.",
      response: `"Of course — and I respect that. Can I ask what specifically you need to think through? Is it the price, whether it'll work for your style, or something else? I want to make sure I give you the right information so you're not going back and forth on it unnecessarily."`,
    },
    {
      objection: "I already have a broker / signals.",
      response: `"VEDD actually works alongside your broker — it connects to MT5 and sends signals directly to your account, or you can use it independently. And signals from Telegram groups are one person's opinion. VEDD runs 12+ indicators plus GPT-4o analysis plus live news sentiment — it's a completely different level of accuracy."`,
    },
    {
      objection: "I don't know enough about trading yet.",
      response: `"That's actually the best time to start. VEDD does the heavy lifting — the AI tells you exactly what to do, with reasoning behind every signal. There's also ambassador training built into the platform. You're not left on your own — you have an AI coach explaining everything in plain language."`,
    },
    {
      objection: "I've been burned by trading platforms before.",
      response: `"I completely understand that — there's a lot of garbage out there. VEDD is different in that it doesn't promise magic returns — it's a tool, like having a professional analyst on call. It shows you the analysis, explains the reasoning, and you make the decision. There's even a free plan so you can test it before you spend anything."`,
    },
    {
      objection: "I don't have time to learn a new platform.",
      response: `"The whole point of VEDD is that you don't need to spend time on analysis. Upload a chart, get a result in 30 seconds. Or connect MT5 and the engine runs on its own. If anything, it saves you hours every week you'd otherwise spend staring at charts."`,
    },
    {
      objection: "Can I make real money with this?",
      response: `"VEDD is a tool — like any tool, the results depend on how you use it. What I can tell you is that it gives you better information, faster, than what most retail traders have access to. Institutional traders have had AI and algorithmic tools for years. VEDD levels the playing field. A lot of members use it alongside their existing strategy to refine entries and exits."`,
    },
    {
      objection: "What if it doesn't work for me?",
      response: `"Start with the free plan — there's nothing to lose. Get in, run a few chart analyses, see how the signals match up with what the market does. Most people who try it find it immediately useful. If after that it's genuinely not for you, no pressure — but give it a real shot first."`,
    },
    {
      objection: "I'm not technical enough to use it.",
      response: `"The interface is designed to be dead simple. You upload a chart or type in a pair name, and the AI does everything else. There's no coding, no complex settings to configure — just click and get results. If you can use Instagram, you can use VEDD."`,
    },
    {
      objection: "I'll look at the website later.",
      response: `"Totally — and I'll send you the link right now. But while I have you, can I just show you one thing? It'll take 60 seconds and I think it'll make the website make a lot more sense when you visit it."`,
    },
  ];

  const closingScripts = [
    {
      title: 'Assumptive Close',
      text: `"It sounds like you're ready to get started — let me send you the link to the Starter plan right now and you'll be set up in under 5 minutes. I'll also drop my number so you can message me if you have any questions once you're in."`,
    },
    {
      title: 'Urgency Close',
      text: `"Just so you know, the pricing we're at right now won't be like this forever — VEDD is scaling and rates are likely to go up. Getting in at the current price locks you in. If it's something you're going to do eventually, now is genuinely the better time."`,
    },
    {
      title: 'Summary Close',
      text: `"So just to summarise — you get AI chart analysis, the live trading engine, EA generator, Solana scanner, multi-timeframe analysis, VEDD token rewards — all for $49.95/month or free to start. Based on what you told me about [their specific pain point], this directly solves that. Are you ready to get started today?"`,
    },
    {
      title: 'Soft Close',
      text: `"I'm not here to pressure you into anything — I genuinely think this could help you. Why don't you start on the free plan, spend a week exploring it, and if it makes sense for you at that point, upgrade. There's no risk to that approach. Can I send you the link right now?"`,
    },
  ];

  const followUps = [
    {
      title: 'WhatsApp / Text — Same Day',
      text: `Hey [Name]! Great connecting with you today. Here's the VEDD AI link: https://vedd.ai

Start on the free plan and try the chart analysis — upload any chart and see what the AI says. I'm here if you have any questions. Let me know how you get on! 🚀`,
    },
    {
      title: 'WhatsApp — 3 Day Follow-Up',
      text: `Hey [Name], just checking in! Did you get a chance to try VEDD AI? Even just uploading one chart is enough to see how it works. Let me know if you want me to walk you through anything — happy to jump on a quick call. 💪`,
    },
    {
      title: 'Email Follow-Up',
      text: `Subject: Your VEDD AI Access — Quick Check In

Hi [Name],

I wanted to follow up from our conversation about VEDD AI. I hope you've had a chance to explore the platform.

If you haven't already, I'd recommend starting with:
1. Upload a chart you're currently watching — see the AI analysis
2. Run a multi-timeframe check on your favourite pair
3. Generate a quick EA using the EA Generator

Here's your link: https://vedd.ai

If you have any questions or want to jump on a quick screen share, just reply to this email and we'll set something up.

Looking forward to hearing how you get on!

[Your Name]`,
    },
    {
      title: 'Re-engagement — 1 Week Later',
      text: `Hey [Name] — hope you're well! Quick one: VEDD just dropped [mention a recent feature or update]. Thought of you since we spoke about [their specific pain point]. Worth jumping back in if you haven't yet. Happy to do a quick walkthrough anytime — just let me know! 🎯`,
    },
  ];

  const currentStep = STEPS[step];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/ambassador-training">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to Training
            </Button>
          </Link>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Sales Call Script</h1>
              <p className="text-sm text-muted-foreground">Step-by-step call guide for converting prospects to VEDD subscribers</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">Ambassador Tool</Badge>
            <Badge variant="outline" className="text-xs">8 Steps</Badge>
            <Badge variant="outline" className="text-xs">Copy-Ready Scripts</Badge>
          </div>
        </div>

        {/* Progress Stepper */}
        <div className="mb-8 overflow-x-auto pb-2">
          <div className="flex gap-1 min-w-max">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === step;
              const isDone = i < step;
              return (
                <button
                  key={s.id}
                  onClick={() => setStep(i)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all text-xs ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : isDone
                      ? 'bg-primary/20 text-primary hover:bg-primary/30'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                  </div>
                  <span className="font-medium whitespace-nowrap">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step Content */}

        {/* Step 0: Opening Hook */}
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-primary" />
                Opening Hook — 30-Second Pitch
              </CardTitle>
              <p className="text-sm text-muted-foreground">Pick the version that matches your prospect. Deliver it with confidence — you have something genuinely valuable to share.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {hooks.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => setHookVariant(i)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      hookVariant === i ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide">{hooks[hookVariant].label} Script</p>
                  <CopyButton text={hooks[hookVariant].text} />
                </div>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">{hooks[hookVariant].text}</p>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Pro Tips</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Deliver this in 25–30 seconds — don't drag it out</li>
                  <li>Sound curious, not salesy — you're sharing something, not selling</li>
                  <li>The question at the end is critical — it shifts control to them</li>
                  <li>If they say "no time right now" — ask for a better time, not a yes/no</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 1: Discovery */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-primary" />
                Discovery Questions
              </CardTitle>
              <p className="text-sm text-muted-foreground">Ask these questions to understand where they are. Listen more than you talk. Their answers tell you exactly how to pitch.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {discoveryQuestions.map((dq, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">{i + 1}</span>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{dq.q}</p>
                        <CopyButton text={dq.q} />
                      </div>
                      <p className="text-xs text-muted-foreground italic bg-muted/30 rounded px-2 py-1">{dq.tip}</p>
                      <Textarea
                        placeholder="Notes from their answer..."
                        className="text-xs h-16 resize-none"
                        value={notes[i] || ''}
                        onChange={e => setNotes(prev => ({ ...prev, [i]: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Pain → Solution */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-primary" />
                Pain Points → VEDD Solutions
              </CardTitle>
              <p className="text-sm text-muted-foreground">Match what they told you in discovery to the right VEDD feature. Use their words back at them — it makes the solution feel personal.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {painSolutions.map((ps, i) => (
                <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-destructive/5 border-b border-border">
                    <X className="h-4 w-4 text-destructive" />
                    <p className="font-semibold text-sm text-destructive">{ps.pain}</p>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <p className="text-xs font-semibold text-green-500 uppercase tracking-wide">VEDD Solution</p>
                      </div>
                      <CopyButton text={ps.solution} />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{ps.solution}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Platform Demo */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Platform Demo Talking Points
              </CardTitle>
              <p className="text-sm text-muted-foreground">Walk through these on a screen share or describe them verbally. Keep it focused — don't show everything, show what matters to them.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-primary">
                <strong>Tip:</strong> Ask "What do you want to see first?" — let them guide the demo to what they care about most.
              </div>
              {demoPoints.map((dp, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                      </div>
                      <p className="font-semibold text-sm">{dp.step}</p>
                    </div>
                    <CopyButton text={dp.detail} />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{dp.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Pricing */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Pricing Walkthrough Scripts
              </CardTitle>
              <p className="text-sm text-muted-foreground">Always anchor to value before stating the price. Start with what they get, then the cost — never the other way around.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScriptBlock
                label="Value Anchor (say this before any price)"
                text={`"Most professional traders use 4–7 different tools to get what VEDD gives you in one platform. TradingView for charts, a signal provider for signals, an EA builder for automation, a news terminal for sentiment, a copy trade service for execution — that's easily $300–$500/month across the board. VEDD does all of it in one place."`}
                highlight
              />
              {pricingScripts.map((ps, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{ps.plan}</p>
                      <p className="text-xs text-primary font-medium">{ps.price}</p>
                    </div>
                    <CopyButton text={ps.script} />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{ps.script}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Step 5: Objections */}
        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Objection Handling
              </CardTitle>
              <p className="text-sm text-muted-foreground">Click any objection to reveal the response. Remember: an objection is a question in disguise — they're interested, they just need reassurance.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-primary">
                <strong>Golden Rule:</strong> Always acknowledge first ("I hear you", "That makes sense", "I get that") — then respond. Never argue.
              </div>
              {objections.map((obj, i) => (
                <ObjectionCard key={i} objection={obj.objection} response={obj.response} />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Step 6: Closing */}
        {step === 6 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Closing Scripts
              </CardTitle>
              <p className="text-sm text-muted-foreground">Use the technique that fits the conversation. Always ask for the sale — if you don't ask, the answer is always no.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-primary">
                <strong>Before You Close:</strong> Confirm they have no remaining questions. A close attempted too early will feel pushy — make sure they've had their objections addressed first.
              </div>
              {closingScripts.map((cs, i) => (
                <ScriptCard key={i} title={cs.title} text={cs.text} />
              ))}
              <div className="rounded-lg bg-muted/30 border border-border p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1">After They Say Yes</p>
                <p className="text-xs text-muted-foreground">Send them the signup link immediately. Stay on the call while they sign up if possible. Celebrate with them. Add them to your ambassador network for ongoing support.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 7: Follow-Up */}
        {step === 7 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Follow-Up Templates
              </CardTitle>
              <p className="text-sm text-muted-foreground">80% of sales happen after 5+ follow-ups. Be consistent, be valuable, be brief.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-primary">
                <strong>Follow-Up Schedule:</strong> Same day → Day 3 → Day 7 → Day 14 → Day 30. After that, move to monthly touch points.
              </div>
              {followUps.map((fu, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{fu.title}</p>
                    <CopyButton text={fu.text} />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line font-mono text-xs bg-muted/30 rounded-lg p-3">{fu.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <p className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
          <Button
            onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}
            disabled={step === STEPS.length - 1}
            className="gap-2"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

      </div>
    </div>
  );
}
