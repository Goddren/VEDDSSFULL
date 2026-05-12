import { useState } from 'react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronDown, ChevronUp, Copy, Check, Phone, ArrowLeft,
  MessageSquare, Users, DollarSign, Target, Lightbulb,
  HelpCircle, X, CheckCircle, ChevronRight, ChevronLeft,
  Mic, ClipboardList, TrendingUp, Mail, Link2, Share2
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
  const { toast } = useToast();
  const [linkCopied, setLinkCopied] = useState(false);

  const { data: referralData } = useQuery<{ code: string; url: string; shortUrl: string }>({
    queryKey: ["/api/referral/my-link"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/referral/my-link");
      return res.json();
    },
  });

  const copyReferralLink = () => {
    if (!referralData?.url) return;
    navigator.clipboard.writeText(referralData.url);
    setLinkCopied(true);
    toast({ title: "Referral link copied!", description: "Ready to share with your prospect." });
    setTimeout(() => setLinkCopied(false), 2500);
  };

  const hooks = [
    {
      label: 'Cold Call',
      text: `"Aye [Name], real talk — I'm reaching out 'cause I been putting people on to something that's been lowkey changing the game for traders. It's called VEDD AI and no cap, this thing does the whole chart analysis for you, drops the entry, the stop loss, the take profit — all of it — in like 30 seconds. Most people out here fumbling the bag 'cause they don't have the right tools. I think this could hit different for you. You got 5 minutes right now or nah?"`,
    },
    {
      label: 'Warm Lead / DM',
      text: `"Aye [Name] what's good! I saw you're into trading — bro/sis I had to put you on to VEDD AI. This thing is different, fr. AI does the chart breakdowns, runs live signals, builds EAs for your MT5, got a whole Solana scanner — it's giving full trading desk energy for one low monthly. No cap it's been a W for me and I think you'd vibe with it heavy. Let me show you real quick, you free for 10?"`,
    },
    {
      label: 'Referral',
      text: `"Hey [Name], [Referrer's Name] put me onto you — said you're the one I need to talk to! They been locked in with VEDD AI and told me you'd be the perfect fit. It's an AI trading platform — chart analysis, live signals, EA generator, Solana scanner, the whole bag. On God it's built for people who move serious in these markets. I don't wanna waste your time but I know once you see it you'll understand why [Referrer's Name] sent me. When can we connect for a quick 10?"`,
    },
    {
      label: 'Social Media / IG/TikTok DM',
      text: `"Hey [Name] 👋 I see you're out here in the trading space — I had to slide in your DMs because I feel like you're sleepin on something. It's called VEDD AI and it's lowkey the plug for traders rn. AI chart analysis, live trade signals, EA builder for MT5, Solana token scanner — all in one. Not gonna cap you, it's been bussin for me and I think you'd eat with this. Wanna see how it works? I can break it down no pressure 🔥"`,
    },
    {
      label: 'Community / In-Person',
      text: `"Aye real quick — you trade? I gotta put you on to something. There's this AI platform called VEDD, and bro it's not like them other things out here. This one actually analyzes your charts, drops full trade setups, runs a live engine 24/7, and builds EAs for MetaTrader. I been using it and it's been moving different. They got a free plan too so there's no risk. Let me send you the link and you can see for yourself — secure the bag, you feel me?"`,
    },
  ];

  const discoveryQuestions = [
    {
      q: 'Aye so what you trading out here — you in forex, crypto, stocks, or you doing a lil bit of everything?',
      tip: 'Listen for: what they trade, how deep they are, what tools or apps they\'re already using. This tells you which VEDD features to push hardest.',
    },
    {
      q: 'Real talk — how long you been at it and would you say you\'ve been eating good off it or is it still a struggle?',
      tip: 'This is where the bag pain comes out. If they\'re losing or inconsistent, that\'s your whole pitch right there. Let them vent — don\'t interrupt.',
    },
    {
      q: 'So how you moving right now — you doing your own analysis, following somebody\'s signals, or are you just out here winging it?',
      tip: 'If they\'re in a Telegram signal group or paying for another tool, VEDD replaces it at the same or lower cost with way more firepower. That\'s your angle.',
    },
    {
      q: 'What\'s the one thing in your trading right now that\'s holding you back from really securing the bag?',
      tip: 'The golden question — just be quiet and let them talk. Whatever they say becomes your entire VEDD pitch. Use their exact words back at them.',
    },
    {
      q: 'If you could fix one thing about how you trade in the next 30 days and level up for real — what would that look like for you?',
      tip: 'This gets them thinking about their future W. Connect that W directly to the VEDD feature that delivers it. Make it feel like it was made for their situation.',
    },
    {
      q: 'You ever heard of VEDD before or is this the first time you\'re seeing it?',
      tip: 'If they\'ve heard of it: "What\'s your impression so far?" If not: "Perfect — let me show you something different." Adjust your energy based on their familiarity.',
    },
  ];

  const painSolutions = [
    {
      pain: 'Taking L\'s / no consistent system',
      solution: '"Real talk — that\'s exactly what VEDD fixes. Most people out here are guessing. VEDD uses GPT-4o to analyze your chart in seconds and gives you the full breakdown — signal direction, entry point, stop loss, take profit, confidence score. No cap. No more vibing on bad setups and watching your bag shrink. Every trade you take is backed by AI, not feelings."',
    },
    {
      pain: 'Spending too much time on analysis / staring at charts',
      solution: '"Bro you don\'t have to be glued to your screen no more. Upload any chart — or connect your MT5 — and VEDD\'s engine hits 12+ indicators simultaneously: RSI, MACD, Bollinger Bands, VWAP, volume, all of it — under 30 seconds and you get the full read. You could be doing other things and still be locked in. That\'s moving different."',
    },
    {
      pain: 'Trading emotional / getting FOMO / no discipline',
      solution: '"That\'s the real bag killer right there — emotions. VEDD\'s Live Trading Engine runs 24/7 completely autonomous. It takes the trades, manages the positions, no hesitation, no FOMO, no panic selling. The AI doesn\'t have feelings. It just executes. That\'s the difference between retail traders and people who are actually eating off this."',
    },
    {
      pain: 'Paying for too many separate tools / overspending',
      solution: '"You\'re out here subsidizing 5 different subscriptions when VEDD does all of it in one spot. TradingView, signal Telegram, EA builder, copy trade service, news sentiment tool — that\'s $200-300/month easy. VEDD starts at $49.95. Same features, one platform. That\'s not just a W — that\'s just facts."',
    },
    {
      pain: 'No coding knowledge / can\'t build EAs',
      solution: '"You don\'t need to know how to code, period. VEDD\'s EA Generator has 18 built-in strategies — scalping, breakout, momentum, sniper. One click and it builds the full Expert Advisor for MT4 or MT5. Download it, drag it in, it runs. The coding barrier was the only thing keeping most people out. VEDD just unlocked the door."',
    },
    {
      pain: 'In a signal group that\'s not hitting / bad signals',
      solution: '"On God — those Telegram signal groups are one person\'s opinion. Some random dude thinking he knows what the market\'s doing. VEDD runs 12+ indicators PLUS GPT-4o AI analysis PLUS live news sentiment all at the same time. It\'s not a comparison. Level up and stop paying for someone\'s guesses."',
    },
    {
      pain: 'Want to get into crypto / Solana but don\'t know where to start',
      solution: '"VEDD has a whole Solana token scanner that AI scans trending tokens, scores them on sentiment, tokenomics, whale activity — and you can paper trade first before putting real money in. It\'s literally built for people who want to move smart in crypto without getting rugged. No cap."',
    },
  ];

  const demoPoints = [
    { step: '1. Chart Analysis — The Main Plug', detail: '"Aight watch this — take any chart you\'re looking at right now, upload it or type in the pair, and VEDD\'s AI gives you the full breakdown in like 30 seconds. Trend direction, entry zone, stop loss, take profit, confidence score — everything. This is what a professional analyst would charge you for, and the AI does it instantly. That\'s the whole bag right there."' },
    { step: '2. Multi-Timeframe Analysis — See the Full Picture', detail: '"This is the one that hits different. You run your pair across 5 timeframes at once — 1H, 4H, Daily, Weekly, whatever — and VEDD shows you where all of them agree. When the daily, the 4-hour, and the 1-hour are all saying the same thing? That\'s a high-confluence setup. That\'s how the smart money moves. Retail traders don\'t have access to this — you do."' },
    { step: '3. Live Trading Engine — Set It and Secure the Bag', detail: '"The Live Engine is on another level, fr. It monitors 20+ pairs 24/7 — while you sleep, while you\'re at work, while you\'re living your life. It computes indicators, pulls live news sentiment, and executes trades automatically via TradeLocker. Also syncs signals straight to your MT5 via a free EA. You don\'t have to be locked to a screen. The AI stays on go for you."' },
    { step: '4. EA Generator — No Code, No Cap', detail: '"This one is slept on. VEDD has 18 built-in trading strategies — scalping, breakout, momentum, sniper mode. You pick the one that fits your style, click generate, and it builds a full Expert Advisor for MT4 or MT5. Download it, drop it in MetaTrader, and it runs. No coding, no technical knowledge needed. Most people pay hundreds for custom EAs — VEDD does it with one click."' },
    { step: '5. Solana Scanner — Crypto Bag Alert', detail: '"For my crypto people — VEDD has an AI scanner that goes through trending Solana tokens and scores them. Sentiment, tokenomics, whale activity, on-chain data — all analyzed. You can paper trade first before putting any real money in. It\'s built so you can move smart in crypto without getting caught in a rug pull. IYKYK."' },
    { step: '6. Workforce Academy — Level Up Your Knowledge', detail: '"VEDD isn\'t just a tool — it\'s a whole education ecosystem. The Workforce Academy has 12 full courses: AI trading, Web3, financial literacy, credit building, entrepreneurship. You complete courses, earn certificates that stack for grant eligibility, and level up your knowledge while you level up your bag. It\'s built for communities that been slept on."' },
    { step: '7. VEDD Token Rewards — Earn While You Learn', detail: '"Every analysis you run, every EA you build, every trade that executes — you\'re earning VEDD tokens. Those tokens are redeemable for subscription credits, exclusive features, and governance votes in the ecosystem. You\'re not just using a platform — you\'re building equity in it. That\'s the difference."' },
  ];

  const pricingScripts = [
    {
      plan: 'Free Plan — The Starter W',
      price: '$0 — No credit card',
      script: `"First off — there's a free plan. Zero dollars. No credit card. You can get in right now and see everything with your own eyes. Chart analysis, EA generator, the full platform. Most people who start on the free plan upgrade within the first week 'cause once you see what it does, it's lowkey hard to go back. Start there. I'll send you the link right now."`,
    },
    {
      plan: 'Starter — $49.95/mo',
      price: '$49.95/mo',
      script: `"The Starter plan is $49.95 a month — and real talk, you probably spending more than that right now on tools that ain't moving the needle. Most people in Telegram signal groups are paying $50 just for someone's opinion. VEDD gives you AI chart analysis, the EA generator, live signals, multi-timeframe analysis, AND the Solana scanner for the same price. That's not 5 tools — that's one. Do the math on that."`,
    },
    {
      plan: 'Premium — $149.99/mo',
      price: '$149.99/mo',
      script: `"Premium is where it gets real — $149.99 a month. You get the full Live Trading Engine running 24/7, priority AI models, unlimited analyses, everything unlocked. Break it down: that's less than $5 a day for a full AI trading system working for you around the clock while you're sleep, at work, living your life. If you're trying to make trading a real income stream — not a hobby — this is the move. And lowkey it pays for itself fast."`,
    },
    {
      plan: 'Yearly — $999.99',
      price: '$999.99 — Best value',
      script: `"The yearly deal is $999.99 — one time, and you're locked in. No monthly fees ever again. Compare that to $149.99 times 12 — that's $1,800 a year on monthly. You're saving $800, basically getting 5 months free. If you're serious about this and you're not just kicking tires, the yearly is the bag move. Most people who are committed to their trading grab this one. Real ones know."`,
    },
  ];

  const objections = [
    {
      objection: "It's too expensive / I'm on a budget.",
      response: `"Facts, I hear you — and I respect that. But real talk, what are you paying right now? Signal groups, charting tools, EAs, all that? Most traders out here are dropping $150–$300 a month spread across different stuff that still ain't consistent. VEDD puts all of that in one spot starting at $49.95. And there's a free plan with zero credit card — so there's literally no risk to getting in and seeing it with your own eyes first. Stop fumbling the bag on separate tools."`,
    },
    {
      objection: "I need to think about it / let me think on it.",
      response: `"That's valid — and I'm not here to pressure you. But can I ask real quick: what specifically do you need to think through? Is it the price, whether it fits your style, something else? I just want to make sure I give you the right info so you're not going back and forth on something that has a free trial. Most people who say 'let me think' are really just one question away from understanding it. What's the thing that's making you hesitate?"`,
    },
    {
      objection: "I already got signals / I got a broker.",
      response: `"On God — VEDD doesn't replace your broker, it works with it. It connects straight to MT5 and can push signals directly to your account. And your signal group? Lowkey respect the hustle, but that's one person's read on the market. VEDD runs 12+ indicators simultaneously PLUS GPT-4o AI analysis PLUS live news sentiment all at the same time and cross-references all of it. That's not the same thing. That's not even close to the same thing."`,
    },
    {
      objection: "I'm new to trading / I don't know enough yet.",
      response: `"Bro/sis that's literally the best time to get on VEDD — no cap. The AI does the heavy lifting for you. It tells you the direction, the entry, the stop loss, the take profit, AND explains the reasoning behind it in plain language. VEDD even has a whole Workforce Academy built in — 12 courses on trading, AI, financial literacy, crypto. You're not just getting a tool, you're getting an education. Start where you are and let VEDD level you up."`,
    },
    {
      objection: "I've been burned by trading platforms before.",
      response: `"I respect that 100% — there's a lot of garbage out here, and I get why you're skeptical. VEDD moves different though. It's not promising you a guaranteed bag or some crazy return — it's a tool. Like having a professional analyst on call who explains their thinking every single time. And there's a free plan so you can test the whole thing before spending a dime. Give it a real test run. If it ain't for you after that, we cool. But don't let something that wasn't right before stop you from seeing something that actually is."`,
    },
    {
      objection: "I don't have time to learn a new platform.",
      response: `"Nah that's what I'm saying — VEDD is built so you DON'T have to spend time. You upload a chart, you get the analysis in 30 seconds. Or you connect your MT5 and the Live Engine just runs on its own 24/7. You don't have to be locked to a screen. If anything, VEDD gives you TIME BACK that you'd be spending staring at candles. That's the whole point — the AI does the work, you live your life."`,
    },
    {
      objection: "Can I actually make real money with this?",
      response: `"Real talk — VEDD is a tool, not a magic button. What I can tell you is it gives you better information, faster, than what most retail traders have access to. Hedge funds and institutions have been running AI and algorithmic trading tools for years while regular people been out here guessing. VEDD puts those same capabilities in your hands for under $50 a month. The results depend on how you use it — but the edge is real. A lot of people use it to refine their entries and exits and that alone changes the game."`,
    },
    {
      objection: "What if it doesn't work for me?",
      response: `"That's why the free plan exists — literally zero risk. Get in, run a few chart analyses on pairs you're already watching, see how the signals line up with what happens in the market. You don't have to spend anything to know if it works for you. Most people who actually try it find it hits immediately. But if after a real test it genuinely ain't for you, no pressure. Just don't count it out before you try it — that's leaving a W on the table."`,
    },
    {
      objection: "I'm not technical / I'm not a tech person.",
      response: `"You don't have to be — on God. The whole interface is built for people who are NOT technical. You type in a pair, or upload a chart screenshot, and the AI handles everything else. There's no code to write, no settings to configure, nothing complicated to set up. If you can use Instagram or TikTok, you can use VEDD. It's literally built to be that simple."`,
    },
    {
      objection: "I'll check the website later.",
      response: `"For sure — I'll send you the link right now so you got it. But while I got you, can I show you one thing real quick? Takes 60 seconds and I think once you see the AI analyze a chart it'll all make sense when you visit the site. Most people who see it go from 'I'll check it later' to 'aight how do I get started' in under a minute. You got 60 seconds?"`,
    },
    {
      objection: "I don't trust AI for trading.",
      response: `"That's a fair perspective — and the truth is VEDD isn't asking you to hand over control. The AI gives you the analysis and the recommendation, but YOU make the final call. Think of it like having a really smart analyst explain exactly what they see on the chart and why — then you decide. It's AI-assisted trading, not AI-controlled. The smart money has been using algorithmic tools for years. VEDD just makes that same firepower available to everyone."`,
    },
  ];

  const closingScripts = [
    {
      title: 'Assumptive Close — You Already Know',
      text: `"Aight, it sounds like you're ready to lock in — let me send you the link right now and you'll be set up in under 5 minutes. Start on the free plan if you want zero risk, or go straight to Starter if you're serious. Either way I got you — I'll drop my number too so you can hit me directly once you're in if you have any questions. Let's get you in there."`,
    },
    {
      title: 'Urgency Close — Don\'t Sleep On It',
      text: `"Real talk — the pricing VEDD is at right now is not gonna stay here forever. This platform is scaling, they're adding features, and rates are going up. People who get in now are locking in the current price. If this is something you\'re gonna do eventually — and I think you know it is — doing it now is just the smarter move. Don't fumble the bag on timing."`,
    },
    {
      title: 'Summary Close — Here\'s the Full Bag',
      text: `"Aight let me break it down one more time — AI chart analysis, live trading engine running 24/7, EA generator with 18 strategies, Solana scanner, multi-timeframe analysis, Workforce Academy with 12 courses, VEDD token rewards — all of that for $49.95/month or free to start. You told me [their specific pain point] is the thing holding you back. VEDD directly solves that. So the real question is — are you gonna keep dealing with that, or are you ready to level up today?"`,
    },
    {
      title: 'Soft Close — No Pressure, Just Facts',
      text: `"Aye I'm not here to pressure you — I genuinely think this could be a W for you based on everything you told me. Here's what I'd say: start on the free plan, spend a week with it, run some analyses on charts you're already watching. See how it moves. If it's for you, upgrade. If not, no hard feelings. There's zero risk to that. Can I just send you the link right now and get you in the door?"`,
    },
    {
      title: 'Community Close — Built for Us',
      text: `"I\'ma keep it a buck with you — VEDD was built for communities that have been slept on by traditional finance. People who don't have a hedge fund behind them. People trying to build generational wealth from nothing. The tools that used to be only for the rich? VEDD made them accessible. This is the plug. Are you gonna be one of the ones who got on early, or are you gonna watch from the sideline?"`,
    },
  ];

  const followUps = [
    {
      title: 'Text / WhatsApp — Same Day (After Call)',
      text: `Aye [Name]! Good linking with you today fr 🤝 Here's the VEDD link I was telling you about: [YOUR REFERRAL LINK]

Start on the free plan — no credit card needed. Just upload any chart you're looking at and see what the AI drops. It's giving full analyst energy lol

Hit me whenever if you got questions — I got you 🚀`,
    },
    {
      title: 'IG/TikTok DM — After Initial Conversation',
      text: `Aye [Name] 👋 real good connecting! Here's that VEDD link — [YOUR REFERRAL LINK]

Jump on the free plan and run one chart analysis. You'll see exactly what I was talking about no cap 🔥

Lmk what you think when you try it — I'm right here if anything doesn't make sense 💪`,
    },
    {
      title: 'WhatsApp / Text — 3 Day Follow-Up',
      text: `Hey [Name] 👋 just checking in — did you get a chance to pull up VEDD yet? Even just running one chart analysis is enough to see what it's really doing.

If you haven't jumped in yet no worries — I can walk you through it on a quick screen share anytime, literally 10 minutes. Just lmk 📲

Don't sleep on it tho — you already know what it is 😎`,
    },
    {
      title: 'Email Follow-Up — Professional + Street',
      text: `Subject: VEDD AI — Let's Get Your Access Set Up 🔥

Hey [Name],

Just following up after our conversation — hope you've been able to check out VEDD!

Here's where to start when you're ready:
1. Run a chart analysis on any pair you're currently watching
2. Try the Multi-Timeframe Analysis on your go-to pair
3. Generate an EA — takes 1 click and you'll see what I mean

Your link: [YOUR REFERRAL LINK]

Real talk — most people who actually get in say the chart analysis alone was worth it in the first session.

If you want to jump on a quick call or screen share, just reply and we'll set it up. I got time for you.

Let's secure the bag 💪

[Your Name]
VEDD Ambassador`,
    },
    {
      title: 'Re-engagement — 1 Week Later (They Went Quiet)',
      text: `Hey [Name] — no pressure at all, just wanted to swing back around 👋

VEDD just dropped [mention a new feature or update] and I thought about you when I saw it because you mentioned [their specific pain point].

If the timing wasn't right before, it might be the move now. And if you got questions that were holding you back, I'm here — real talk no sales pressure.

[YOUR REFERRAL LINK] — still got the free plan if you wanna just see it 🎯`,
    },
    {
      title: 'Community Group Message (Facebook/Discord/Group Chat)',
      text: `Aye fam 👋 — I keep getting asked about the AI trading platform I've been using so let me just put y'all on.

It's called VEDD AI and it's lowkey different from everything else out here. AI chart analysis, live trade signals, EA builder for MT5, Solana scanner, financial literacy courses — all in one spot. They got a free plan so you can try it with zero risk.

Not here to spam — just putting the plug on the table for whoever's ready to level up their trading game 🔥

My link: [YOUR REFERRAL LINK]

Drop a 🙋‍♂️ if you want me to walk you through it`,
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
              <h1 className="text-2xl font-bold">Ambassador Sales Script 🔥</h1>
              <p className="text-sm text-muted-foreground">Step-by-step guide — real talk scripts for putting people on to VEDD and securing the bag</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">Ambassador Tool</Badge>
            <Badge variant="outline" className="text-xs">8 Steps</Badge>
            <Badge variant="outline" className="text-xs">Copy-Ready Scripts</Badge>
          </div>
        </div>

        {/* Referral Link — always visible at top of call script */}
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-semibold text-amber-400">Your Referral Link — Send this at the end of every call</p>
          </div>
          <div className="flex gap-2">
            <Input
              value={referralData?.url || "Loading your referral link..."}
              readOnly
              className="font-mono text-xs bg-background/60"
            />
            <Button size="sm" className="shrink-0 gap-1.5 bg-amber-500 hover:bg-amber-400 text-black" onClick={copyReferralLink}>
              {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {linkCopied ? "Copied!" : "Copy"}
            </Button>
            {referralData?.url && (
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: "Try VEDD AI Free", url: referralData.url });
                } else { copyReferralLink(); }
              }}>
                <Share2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Code: <span className="font-mono font-bold text-amber-400">{referralData?.code || "—"}</span>
            {" · "}Every signup through this link tracks back to you automatically.
          </p>
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
              <p className="text-sm text-muted-foreground">Pick the version that matches your vibe and your prospect. Deliver it with confidence — no cap, you're putting people on to something that actually hits.</p>
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
                  <li>Keep it to 25–30 seconds — say what you gotta say and stop talking</li>
                  <li>Match their energy — talk to people the way they talk, not like a sales robot</li>
                  <li>The question at the end is the move — it shifts the convo to them</li>
                  <li>If they say "no time right now" — ask for a better time, not a yes/no</li>
                  <li>Be authentic — you're putting someone on to something real, not running a scam</li>
                  <li>The DM style works different than the phone style — know your platform</li>
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
              <p className="text-sm text-muted-foreground">Ask these to find out where they're really at. Keep it conversational — you're not interrogating them, you're vibing and listening. Their answers tell you exactly what angle to come from.</p>
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
              <p className="text-sm text-muted-foreground">Connect what they told you in discovery to the VEDD feature that fixes it. Use their exact words back at them — when you speak their language, the solution feels like it was made for them specifically.</p>
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
                <strong>🔥 Real Talk:</strong> Ask "What do you want to see first?" — let them guide the demo to what they care about most. Don't show everything at once. Show what matters to them based on what they said in discovery. Less is more.
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
              <p className="text-sm text-muted-foreground">Always build the value first, then drop the price. Never lead with the number. When they already see what they're getting, the price hits completely different.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScriptBlock
                label="Value Anchor (say this before any price)"
                text={`"Real talk — most serious traders are running 4 to 7 different tools just to get what VEDD gives you in one platform. TradingView for charts, a signal provider for the calls, an EA builder for automation, a news terminal for sentiment, a copy trade service for execution — that's $300 to $500 a month easy, and you're still switching between apps. VEDD does all of that in one spot. That's not just more efficient — that's just smarter."`}
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
              <p className="text-sm text-muted-foreground">Click any objection to see how to flip it. Real talk — an objection is a question in disguise. They're not saying no, they're saying "help me understand why this is worth it." That's your cue to pull up.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-primary">
                <strong>💯 The Rule:</strong> Always acknowledge first — "That's valid", "I hear you", "Facts, I get that" — THEN respond. Never argue, never get defensive. An objection means they're interested. They just need the right answer to feel good about moving forward.
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
