import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Rocket, Flame, Trophy, Users, Star, Copy, Check,
  ChevronDown, ChevronUp, Heart, X, BookOpen,
  TrendingUp, Target, Zap, MessageSquare, Send,
  Instagram, Twitter, Linkedin, Globe, Video,
  CheckCircle2, Circle, Award, BarChart3, Calendar,
} from "lucide-react";
import { TokenomicsBanner } from '@/components/vedd-rewards/tokenomics-banner';

// ─── Types ──────────────────────────────────────────────────────

interface AmbassadorJourney {
  id: number;
  userId: number;
  currentDay: number;
  startedAt: string;
  lastActiveAt: string;
  tokensEarned: number;
  referralsCount: number;
  subscribedReferrals: number;
  postsCompleted: number;
  dmsCompleted: number;
  commentsCompleted: number;
  streakDays: number;
  longestStreak: number;
  subscriptionEarned: boolean;
  monthsEarned: number;
  completedDays: number[];
  savedContent: string[];
}

interface CommentExample {
  context: string;
  comment: string;
}

interface DayPlan {
  day: number;
  week: number;
  theme: string;
  platform: string;
  contentType: string;
  mainPost: {
    caption: string;
    hashtags: string[];
    visualIdea: string;
    ctaText: string;
  };
  storyIdea: string;
  commentExamples: CommentExample[];
  dmScript: string;
  dailyGoal: string;
  tokensAvailable: number;
  weeklyContext: string;
  veddTool: string;
  proTip: string;
}

// ─── Static Content Cards (30 swipe cards) ──────────────────────

interface ContentCard {
  id: string;
  platform: string;
  contentType: string;
  caption: string;
  hashtags: string[];
  visualIdea: string;
  estimatedReach: string;
  category: string;
}

const SWIPE_CARDS: ContentCard[] = [
  { id:"c1", platform:"Instagram", contentType:"Post", caption:"Before VEDD: spending 3 hours analysing charts, second-guessing every trade, missing moves because I was overwhelmed.\n\nAfter VEDD: 15 minutes reviewing AI signals, clear entry/exit/stop levels, confident execution.\n\nThe platform didn't just save time — it changed my relationship with trading entirely. 📊", hashtags:["#beforeafter","#AItrading","#VEDD","#tradingjourney","#forextrader","#tradingplatform","#tradingstrategy","#transformation"], visualIdea:"Before/after split photo — stressed at laptop vs relaxed, confident with phone", estimatedReach:"800–2,400", category:"Social Proof" },
  { id:"c2", platform:"TikTok", contentType:"Reel", caption:"POV: You upload a chart to VEDD and in 8 seconds the AI tells you:\n✅ Pattern: Bullish Engulfing\n✅ Entry: 1.2645\n✅ Stop: 1.2610\n✅ TP1: 1.2700\n✅ Confidence: 76%\n\nThis is not a gimmick. This is what AI trading assistance actually looks like. 🤯", hashtags:["#tradingpov","#AIanalysis","#VEDD","#forexsignals","#tradingtech","#AItools","#forex","#daytrader"], visualIdea:"Screen recording of VEDD analysis being generated — the reveal moment", estimatedReach:"2,000–8,000", category:"VEDD Tools" },
  { id:"c3", platform:"Instagram", contentType:"Carousel", caption:"5 trading mistakes I stopped making after using VEDD:\n\n1. Trading without a defined stop loss\n2. Entering on emotion, not confirmation\n3. Ignoring the higher timeframe trend\n4. Taking 1:1 or worse risk/reward setups\n5. Trading every day whether setups are there or not\n\nSwipe for the fix to each one 👉", hashtags:["#tradingtips","#tradingmistakes","#VEDD","#forexeducation","#tradingpsychology","#riskmanagement","#AItrading","#learntrading"], visualIdea:"Mistake #1–5 each on their own slide with a clean visual fix illustration", estimatedReach:"1,200–4,000", category:"Education" },
  { id:"c4", platform:"Facebook", contentType:"Post", caption:"Did you know? The average retail forex trader loses money not because of bad strategy — but because of inconsistent execution.\n\nSame strategy. Different results. Why?\n\nEmotional decisions. Moving stops. Closing winners too early. Letting losers run.\n\nAI-assisted trading solves the execution side. The strategy is already in the machine. Your job becomes following it. VEDD does this. 📊", hashtags:["#forexfacts","#tradingpsychology","#VEDD","#AItrading","#executiondiscipline","#forextrader","#tradingstrategy","#consistency"], visualIdea:"Statistic-style graphic: '70% of retail traders lose — here's the real reason'", estimatedReach:"600–2,200", category:"Education" },
  { id:"c5", platform:"Instagram", contentType:"Reel", caption:"The VEDD Solana Scanner just flagged this token 3 hours before the 40% pump 🔭\n\nHere's what it spotted:\n📊 Volume 3x above 7-day average\n📊 Price consolidating at key resistance\n📊 Whale wallet accumulation detected\n\nI'm not saying I caught the full move. But I was IN before 90% of people knew it was moving.\n\n[Not financial advice — high risk investment]", hashtags:["#solana","#cryptoscanner","#VEDD","#solanatoken","#cryptoalpha","#solanaNFT","#degen","#cryptotrading"], visualIdea:"VEDD Solana Scanner interface with the token flagged, then price chart showing the move", estimatedReach:"3,000–12,000", category:"VEDD Tools" },
  { id:"c6", platform:"Twitter", contentType:"Post", caption:"Hot take: You don't need to understand 50 indicators to trade profitably.\n\nYou need:\n→ Trend direction (1 thing)\n→ Key level proximity (1 thing)\n→ Entry confirmation (1 thing)\n\nThat's it. The AI does all three.\n\n#simplifytrading #VEDD #AItrading", hashtags:["#tradinghotake","#simplifytrading","#VEDD","#forextrader","#tradingadvice","#AItrading","#priceaction","#keepitsimple"], visualIdea:"Clean text tweet format with bold formatting on the three points", estimatedReach:"400–2,000", category:"Hot Posts" },
  { id:"c7", platform:"Instagram", contentType:"Post", caption:"The trading platform that actually pays you to use it 💰\n\nMost platforms charge you for signals, data, and tools.\n\nVEDD does something different:\n• Complete your daily ambassador tasks → earn VEDD tokens\n• Refer someone who subscribes → earn commission\n• Hold VEDD tokens → earn staking yield\n• Complete the 44-day journey → earn a FREE month\n\nThe platform designed for traders who are also builders.\n\n[Not financial advice. Income varies and is not guaranteed]", hashtags:["#earnwhileyoulearn","#VEDD","#ambassadorprogram","#tradingplatform","#passiveincome","#AItrading","#web3trading","#tokenearnings"], visualIdea:"Clean income flow infographic showing the 4 earning streams", estimatedReach:"900–3,200", category:"Recruitment" },
  { id:"c8", platform:"LinkedIn", contentType:"Post", caption:"I've been tracking something interesting over 6 weeks of AI-assisted trading.\n\nWith manual analysis only: average setup evaluation time = 47 minutes per trade idea.\n\nWith VEDD AI analysis: average setup evaluation time = 4 minutes per trade idea.\n\nThat's 90% time reduction. And accuracy improved because I was evaluating MORE setups faster.\n\nThis is what AI tools actually deliver in practice — not magic, but leverage.", hashtags:["#AIproductivity","#VEDD","#tradingefficiency","#AItools","#fintech","#tradingtech","#AItrading","#datadriven"], visualIdea:"Professional infographic showing time comparison with VEDD AI analysis stats", estimatedReach:"800–4,000", category:"VEDD Tools" },
  { id:"c9", platform:"TikTok", contentType:"Reel", caption:"I just showed my dad (not a trader) how VEDD works and his reaction says everything 😂\n\nHim: 'Wait… the AI just DREW all those levels automatically?'\nMe: 'Yes'\nHim: 'And it tells you where to buy and sell?'\nMe: 'Yes'\nHim: 'And you didn't pay someone for that signal?'\nMe: 'It's the platform.'\nHim: '…why does everyone not use this?'\n\nHonestly valid question 🤷", hashtags:["#tradingvideo","#VEDDreaction","#AItrading","#VEDD","#forex","#tradingplatform","#dadreacts","#relatable"], visualIdea:"Talking-head video with reaction face, VEDD screen share for the reveal moment", estimatedReach:"5,000–25,000", category:"Social Proof" },
  { id:"c10", platform:"Instagram", contentType:"Story", caption:"'I can't afford a trading subscription right now' — I hear this a lot.\n\nBut here's what I know: the FREE ambassador path in VEDD lets you EARN your subscription through daily activities.\n\nPost content. Refer people. Complete tasks. Earn tokens. Tokens = free months.\n\nYou don't need money to start. You need consistency.", hashtags:["#freepath","#VEDD","#earnfreesubscription","#ambassadorpath","#tradingplatform","#consistency","#AItrading","#noexcuses"], visualIdea:"Story with text overlay: 'What if you didn't have to PAY for your subscription?'", estimatedReach:"600–1,800", category:"Recruitment" },
  { id:"c11", platform:"Instagram", contentType:"Carousel", caption:"The 7 VEDD features most traders don't know exist:\n\n1. Brain Mode — double AI confirmation\n2. Breakout Master Mode — compression alert\n3. Multi-TF EA — automated multi-timeframe\n4. Solana Scanner — crypto token momentum\n5. TradeLocker integration — signal to execution\n6. Futures Connect — indices/commodities AI\n7. Ambassador NFT — enhanced access + earnings\n\nSwipe for a breakdown of each one 👉", hashtags:["#VEDDfeatures","#AItrading","#VEDD","#tradingplatform","#hiddengems","#forextools","#cryptotrading","#tradingapp"], visualIdea:"Each feature on its own slide with a clean icon and 2-sentence description", estimatedReach:"1,500–5,500", category:"VEDD Tools" },
  { id:"c12", platform:"TikTok", contentType:"Reel", caption:"Trading myth: 'You need a lot of money to make money trading'\n\nReality: You need a SYSTEM. Small accounts with consistent systems grow. Large accounts with no system shrink.\n\nThe system is:\n1. AI analysis (VEDD handles this)\n2. Risk management (1-2% per trade)\n3. Emotional discipline (practice + community)\n\nMoney amplifies your system — it doesn't create it.", hashtags:["#tradingmyths","#tradingfacts","#VEDD","#AItrading","#smallaccount","#tradingbeginners","#forexeducation","#systemtrading"], visualIdea:"Myth-busting style video with bold text overlays", estimatedReach:"4,000–18,000", category:"Education" },
  { id:"c13", platform:"Facebook", contentType:"Post", caption:"I've been in 3 trading groups, tried 2 signal services, and watched 200+ hours of YouTube tutorials.\n\nNone of it clicked until I stopped consuming and started USING a platform that did the analysis for me.\n\nVEDD made me a better trader because it showed me what GOOD analysis actually looks like. Then I understood why.\n\nLearn by watching the AI. Then learn WHY it made those calls. Then you know how to trade.", hashtags:["#learningtrading","#VEDD","#tradingplatform","#AItrading","#forexeducation","#tradingjourney","#tradingcommunity","#activelearer"], visualIdea:"Text-forward post with a highlighted quote from the caption", estimatedReach:"700–2,500", category:"Social Proof" },
  { id:"c14", platform:"Instagram", contentType:"Reel", caption:"Watch VEDD's Brain Mode fire in real-time 🧠\n\n[Screen recording of Brain Mode activating]\n\nFirst signal: Confirmed ✅\nSecond signal: Waiting… Confirmed ✅\nBrain Mode ACTIVE: Trade flagged at 1.0854\n\nThis is why it's called Brain Mode. Two brains are better than one. Even when they're both AI.\n\nDrop 'BRAIN' for the full breakdown 👇", hashtags:["#VEDDbrainmode","#AItrading","#doubleconfirmation","#forexsignals","#VEDD","#tradingtech","#smarttrading","#AItools"], visualIdea:"Screen recording focused on the Brain Mode activation sequence in VEDD", estimatedReach:"2,500–9,000", category:"VEDD Tools" },
  { id:"c15", platform:"Twitter", contentType:"Post", caption:"If your trading strategy can't survive a bad week psychologically — it's not a strategy. It's a hope.\n\nStrategies that work:\n→ Have defined rules\n→ Have defined stop points\n→ Don't depend on your mood\n→ Work even when you 'don't feel it'\n\nAI removes most of this. You still need discipline for the rest.\n\n#tradingpsychology #AItrading #VEDD", hashtags:["#tradingmindset","#tradingpsychology","#VEDD","#AItrading","#discipline","#systemstrading","#forextrader","#twittertrader"], visualIdea:"Thread-starter tweet with bold hook and continuation promised", estimatedReach:"500–3,000", category:"Motivation" },
  { id:"c16", platform:"Instagram", contentType:"Post", caption:"The VEDD ambassador path is different from every other referral program I've tried.\n\nOther programs: refer someone → get a one-time payment → done.\n\nVEDD: refer someone → earn tokens when they sign up → earn commission when they subscribe → earn EVERY MONTH they stay → earn overrides when they become ambassadors.\n\nThe income compounds. Because the product has real retention.\n\nThis changes the math completely.", hashtags:["#ambassadorincome","#VEDD","#recurringincome","#residualincome","#affiliatemarketing","#ambassadorprogram","#passiveincome","#compoundingincome"], visualIdea:"Side-by-side comparison: one-time affiliate payment vs VEDD compounding income", estimatedReach:"800–2,800", category:"Recruitment" },
  { id:"c17", platform:"TikTok", contentType:"Reel", caption:"The Solana Scanner found this before everyone else was talking about it 📈\n\n[Screenshot of token flagged 3 days ago]\n\nHere's the VEDD signal that caught it:\n• Volume spike: 340% above average\n• Wallet accumulation: 3 new large wallets\n• Pattern: Bullish consolidation\n\nI entered at [X]. It's now at [Y]. \n\n[Not financial advice — crypto is high risk]\n\nDrop 'SOL' for the scanner link", hashtags:["#solanagemfound","#VEDDscanner","#cryptoscanner","#solanamoonshot","#VEDD","#cryptotrading","#solanadefi","#earlyentry"], visualIdea:"Before/after price chart with VEDD scanner screenshot as proof of early detection", estimatedReach:"6,000–30,000", category:"Social Proof" },
  { id:"c18", platform:"LinkedIn", contentType:"Post", caption:"Something I've observed after 6 weeks of AI-assisted trading:\n\nThe value isn't in the AI making decisions for you.\n\nIt's in the AI making you ask BETTER questions.\n\nBefore VEDD: 'Does this look like a good trade?'\nAfter VEDD: 'Is the confidence above 70%? Is the R:R above 2? Is the higher TF aligned?'\n\nBetter questions = better decisions = better results.\n\nTools don't replace thinking. They sharpen it.", hashtags:["#AItools","#VEDD","#tradinginsights","#AIassisted","#fintech","#tradingprofessional","#criticalthinking","#datadriven"], visualIdea:"Professional quote graphic with the 'better questions' insight highlighted", estimatedReach:"1,000–5,000", category:"Education" },
  { id:"c19", platform:"Instagram", contentType:"Post", caption:"Accountability post ✅\n\nThis week's ambassador activities completed:\n📊 7 posts published\n💬 21 comments left on other accounts\n📱 14 DMs sent to warm leads\n📖 3 new followers onboarded to platform trial\n\nTokens earned this week: [X]\nToward free subscription: [X]%\n\nThe system works when you work the system. Day [X] of 44 complete.\n\nWho else is building their ambassador journey? Drop your day number below 👇", hashtags:["#ambassadorlife","#VEDD","#accountability","#44dayjourney","#ambassadorjourney","#dailyactions","#buildingamission","#consistencywins"], visualIdea:"Clean stats dashboard screenshot or hand-drawn weekly tracker", estimatedReach:"700–2,200", category:"Social Proof" },
  { id:"c20", platform:"TikTok", contentType:"Reel", caption:"5 types of people who actually succeed as VEDD ambassadors:\n\n1. The Content Creator — already posting, adds trading angle\n2. The Trader — already trading, shares the platform they use\n3. The Network Marketer — has team skills, loves the duplicating income model\n4. The Teacher — loves explaining things, builds authority fast\n5. The Side Hustler — motivated by recurring income, consistent content\n\nWhich one are you? Comment below 👇", hashtags:["#VEDDambassador","#ambassadorprogram","#VEDD","#sidehutle","#onlineincome","#contentcreator","#tradingambassador","#whichonereyou"], visualIdea:"5-type reveal format — each type with a visual persona icon", estimatedReach:"3,500–15,000", category:"Recruitment" },
  { id:"c21", platform:"Facebook", contentType:"Post", caption:"Trading education doesn't have to cost $5,000.\n\nHere's what I used to learn everything I know about AI-assisted trading — for free:\n\n1. The VEDD platform's built-in training materials\n2. Watching VEDD's AI analyse real charts (best teacher)\n3. The ambassador community — traders sharing setups daily\n4. This 44-day content challenge I'm in\n\nTotal spent on 'education': $0 (subscription covered by tokens)\n\nStop paying for courses. Start using the tools.", hashtags:["#freetradinguducation","#VEDD","#tradingplatform","#AItrading","#learnforfrree","#tradingcommunity","#selftaughtrader","#ambassadorpath"], visualIdea:"'Free education sources' list graphic with VEDD platform as #1", estimatedReach:"900–3,000", category:"Education" },
  { id:"c22", platform:"Instagram", contentType:"Reel", caption:"The moment I went from 'confused trader' to 'systematic trader':\n\nI uploaded a chart I'd been staring at for 20 minutes.\n\nVEDD returned: pattern identified, entry zone, stop loss, take profit, confidence score.\n\nI looked at the AI output and thought — that's EXACTLY what I was trying to figure out.\n\nAnd it did it in 8 seconds.\n\nThat was the moment. 🤯", hashtags:["#tradingstory","#VEDD","#AItrading","#turningpoint","#tradingmoment","#forextrader","#AIanalysis","#gamechanger"], visualIdea:"Talking head reaction video with the VEDD analysis output as B-roll", estimatedReach:"2,000–8,000", category:"Social Proof" },
  { id:"c23", platform:"Twitter", contentType:"Post", caption:"The 4 stages of a new VEDD user:\n\nStage 1: 'Can AI really help me trade?'\nStage 2: 'Oh. It can.'\nStage 3: 'Why did I wait so long to try this?'\nStage 4: 'I need to tell every trader I know.'\n\nMost people reach Stage 4 within 2 weeks. What stage are you at?\n\n#AItrading #VEDD #forextrader", hashtags:["#tradingstages","#VEDD","#AItrading","#newuser","#forextrader","#tradingplatform","#tradinglife","#relatable"], visualIdea:"4-stage ladder infographic with VEDD branding", estimatedReach:"600–3,500", category:"Hot Posts" },
  { id:"c24", platform:"Instagram", contentType:"Post", caption:"Free demo invitation 🎙️\n\nI'm walking 5 people through a personal VEDD demo this week.\n\nHere's what we'll cover:\n✅ Live chart analysis — I'll run your chart through VEDD\n✅ Signal explanation — what each metric means\n✅ Confidence score walkthrough\n✅ How to set your first alert\n✅ Free trial setup\n\n15 minutes. No pitch. No upsell. Just the platform.\n\nDrop 'DEMO' to claim one of the 5 spots 👇", hashtags:["#freetradingdemo","#VEDD","#chartanalysis","#AItrading","#personalised","#tryforfree","#tradingplatform","#limitedspots"], visualIdea:"'5 spots available' invitation graphic with a trading chart background", estimatedReach:"900–3,200", category:"Recruitment" },
  { id:"c25", platform:"TikTok", contentType:"Reel", caption:"Trading myths busted in 60 seconds:\n\n❌ 'You need $10,000 to start' — FALSE. Start with $200-500.\n❌ 'You need years of experience' — FALSE. AI tools compress the learning.\n❌ 'Signal services are scams' — FALSE. AI analysis ≠ random signals.\n❌ 'You can't make money trading' — FALSE. You can't make money trading WITHOUT a system.\n\nThe real barrier isn't money or experience. It's having the right tools and mindset.", hashtags:["#tradingmythsbusted","#forexmyths","#VEDD","#AItrading","#beginnertrader","#tradingfacts","#mythbusting","#learntrading"], visualIdea:"Fast-paced myth-bust format with X/checkmark graphics appearing", estimatedReach:"5,000–22,000", category:"Education" },
  { id:"c26", platform:"Instagram", contentType:"Carousel", caption:"How I earn tokens on VEDD every day (and how you can too):\n\n→ Post trading content: +10 tokens\n→ Complete your 3 daily comments: bonus tokens\n→ Send 3 DMs: bonus tokens\n→ 7-day streak: +100 bonus tokens\n→ Referral signs up: +50 tokens\n→ Referral subscribes: +200 tokens\n→ Complete all 44 days: +500 BONUS tokens\n\n500 tokens = 1 free week | 2,000 tokens = 1 free month\n\nSwipe for the full breakdown 👉", hashtags:["#VEDDtokens","#earnwhileyoulearn","#VEDD","#freesubs","#ambassadorpath","#tokenearnings","#tradingplatform","#44days"], visualIdea:"Each earning action on its own slide with token icon and amount", estimatedReach:"1,000–3,500", category:"Recruitment" },
  { id:"c27", platform:"Facebook", contentType:"Post", caption:"What does 'AI trading assistance' actually look like day to day?\n\n7am: VEDD EA flagged a EUR/USD setup overnight. I review the signal at breakfast.\n10am: Confidence score 74%. Enter the trade. Stop set.\n12pm: TP1 hit. Partial close. Trail stop to breakeven.\n3pm: TP2 hit. Full close. +68 pips.\n4pm: New signal on GBP/JPY. Confidence 61% — below my threshold. Skip.\n\nTotal active screen time: 40 minutes.\nOther 23 hours 20 mins: living my life.\n\nThis is the lifestyle AI trading enables.", hashtags:["#tradinglifestyle","#VEDD","#AItrading","#daytradinglife","#forexlifestyle","#passiveincome","#tradingautomation","#automatedtrading"], visualIdea:"Day timeline graphic with trade entries/exits marked and 'living life' gap highlighted", estimatedReach:"1,200–4,000", category:"Social Proof" },
  { id:"c28", platform:"Instagram", contentType:"Reel", caption:"Motivation Monday: The compounding effect of showing up 💪\n\nDay 1 of 44: You have 0 followers interested in trading. 0 referrals. 0 tokens.\n\nDay 44 of 44: You have an audience, a system, referral income, and a platform you know better than 95% of users.\n\nNone of that happens in a week. All of it happens in 44 days.\n\nConsistency is the strategy. Are you in?", hashtags:["#motivationmonday","#VEDD","#consistency","#44dayjourney","#ambassadorpath","#buildingadream","#tradingjourney","#showup"], visualIdea:"Motivational reel with day 1 vs day 44 comparison stats", estimatedReach:"2,500–9,000", category:"Motivation" },
  { id:"c29", platform:"Instagram", contentType:"Post", caption:"The VEDD Weekly Strategy feature is the thing I didn't know I needed 🗺️\n\nEvery Monday I open it and in 5 minutes I know:\n• Which pairs moved the most last week\n• Which pairs to focus on THIS week\n• What my win/loss ratio looks like YTD\n• How I'm tracking against my weekly goal\n\nTrading without this is like driving without a dashboard.\n\nYou could do it. But why would you?", hashtags:["#weeklystrategy","#VEDD","#tradingplanning","#forexweekly","#tradingdashboard","#AItrading","#pairselection","#structuredtrading"], visualIdea:"VEDD Weekly Strategy page screenshot with annotation arrows highlighting key metrics", estimatedReach:"800–2,600", category:"VEDD Tools" },
  { id:"c30", platform:"Instagram", contentType:"Post", caption:"Last one for the week — and I want to say something real.\n\nTrading is hard. Building an ambassador business is hard. Posting content every day is hard.\n\nBut here's what I know after [X] days:\n\nHard things compound. Every post builds reach. Every trade builds skill. Every conversation builds a relationship.\n\nVEDD gave me the platform. This 44-day journey gave me the structure. YOU gave me the reason to keep showing up.\n\nSee you tomorrow. Day [X+1]. 🔥", hashtags:["#tradingjourney","#VEDD","#gratitude","#keepgoing","#44dayjourney","#ambassadorpath","#tradingcommunity","#showupeveryday"], visualIdea:"Personal, unfiltered selfie or desk photo — real, not polished", estimatedReach:"700–2,000", category:"Motivation" },
];

// ─── Content Hub Static Data ─────────────────────────────────────

interface HubPost {
  id: string;
  platforms: string[];
  caption: string;
  hashtags: string[];
  visualSuggestion: string;
  category: string;
}

const HUB_POSTS: HubPost[] = [
  { id:"h1", platforms:["Instagram","TikTok"], caption:"The AI read this chart in 7 seconds. It took me 25 minutes to reach the same conclusion. VEDD's Analysis Engine: pattern detected, entry zone, stop loss, take profit, confidence score. All of it. Instantly. This isn't the future of trading — it's now. 🤖", hashtags:["#AItrading","#VEDD","#forexsignals","#tradingtech","#AIanalysis","#forextrader","#smarttrading","#tradingplatform"], visualSuggestion:"Side-by-side: your tired face vs VEDD output screen", category:"Hot Posts" },
  { id:"h2", platforms:["Facebook","LinkedIn"], caption:"Most traders fail not because of bad strategy but because they can't execute it consistently. Emotions. Tiredness. Distraction. They override the plan. AI doesn't have emotions. VEDD's AI follows the rules every single time. That's the actual edge.", hashtags:["#tradingpsychology","#AItrading","#VEDD","#consistency","#emotionlesstrading","#systemtrading","#forexeducation","#tradingstrategy"], visualSuggestion:"Professional infographic: Emotion vs System execution comparison", category:"Education" },
  { id:"h3", platforms:["Instagram","Instagram Reel"], caption:"3 months ago: I was losing money, doubting myself, and almost giving up on trading.\nToday: I have a system, an AI that backs me up, and I'm building income from sharing it.\nThe platform that changed it? VEDD.\n[Results not typical. Trading involves risk.]", hashtags:["#tradingstory","#VEDD","#transformation","#AItrading","#ambassadorpath","#tradingjourney","#beforeafter","#forexlife"], visualSuggestion:"Before/after timeline graphic with personal photos", category:"Social Proof" },
  { id:"h4", platforms:["TikTok","Instagram Reel"], caption:"If I had to restart trading from zero with just ONE tool — it would be VEDD. Here's why in 60 seconds. [Record a quick walkthrough of the 3 features you use most]", hashtags:["#tradingtools","#VEDD","#AItrading","#besttradingplatform","#forexapp","#tradingtech","#startingover","#tradingreviews"], visualSuggestion:"Talking-head style with VEDD screen recording as B-roll", category:"Hot Posts" },
  { id:"h5", platforms:["Twitter","LinkedIn"], caption:"Real question: How many hours per week do you spend on chart analysis?\n\nBefore VEDD: ~8 hours\nAfter VEDD: ~1.5 hours\n\nThat's 6.5 hours/week returned to my life. What would you do with 6.5 extra hours?\n\n#timeiswealth #AItrading #VEDD", hashtags:["#timemanagement","#AItrading","#VEDD","#productivityhack","#tradingefficiency","#tradinglife","#timeiswealth","#worksmarter"], visualSuggestion:"Time comparison graphic with VEDD logo", category:"VEDD Tools" },
  { id:"h6", platforms:["Instagram","Facebook"], caption:"The 44-day ambassador path is the best thing I've ever committed to.\n\nDay 1: A stranger online with a trading account.\nDay 44: A content creator, trader, mentor, and income builder.\n\nAll from showing up every day with VEDD.\n\nThe path is free. The opportunity is real. The only cost is consistency.", hashtags:["#44dayjourney","#VEDD","#ambassadorpath","#freepathtopro","#consistencyiskey","#tradingjourney","#ambassadorlife","#buildingadream"], visualSuggestion:"Day 1 vs Day 44 split with token balance and follower growth shown", category:"Recruitment" },
  { id:"h7", platforms:["Instagram","TikTok"], caption:"Let me show you what the VEDD Brain Mode double confirmation looks like when it fires. [Screen recording: First confirmation — green. Second confirmation — green. Brain Mode ACTIVE. Entry flagged.] Two signals agree. Trade is on. This is precision.", hashtags:["#VEDDbrainmode","#doubleconfirmation","#AItrading","#VEDD","#forexsignals","#precisiontrading","#smartentry","#tradingbot"], visualSuggestion:"Screen recording of Brain Mode activating in real-time", category:"VEDD Tools" },
  { id:"h8", platforms:["Instagram","Facebook"], caption:"The person who earns the most from VEDD isn't the best trader.\n\nIt's the most consistent ambassador.\n\nBecause the ambassador earns:\n• While they trade\n• While they post\n• While their referrals subscribe\n• While their team grows\n\nLayers of income from one daily habit.\n[Income not guaranteed. Results vary.]", hashtags:["#ambassadorincome","#VEDD","#residualincome","#layeredincome","#tradingbusiness","#buildingincome","#ambassadorprogram","#passiveincome"], visualSuggestion:"Layered income stack infographic: trading + ambassador + team override", category:"Recruitment" },
];

interface CommentTemplate {
  context: string;
  comment: string;
}

const COMMENT_BANK: { category: string; templates: CommentTemplate[] }[] = [
  { category:"Financial freedom posts", templates:[
    { context:"'I want financial freedom' post", comment:"That's exactly the goal! What's your current approach to building income outside your main job? I've been exploring a combination of trading + ambassador income that's been interesting 🙌" },
    { context:"'Tired of the 9-5' post", comment:"This hits differently when you actually start building alternatives. The 9-5 feels lighter once you know you have something else building in the background. Are you working on anything?" },
    { context:"Dream lifestyle post", comment:"Love this vision! The interesting thing is most people who hit this first built ONE consistent income stream and let it compound. What's your current focus area?" },
  ]},
  { category:"Side hustle posts", templates:[
    { context:"'Looking for side hustle ideas' post", comment:"That's exactly where I was 6 months ago! What kind of skills/time do you have to offer? I found something that works really well around content creation + trading. Curious what you're considering 🙌" },
    { context:"'My side hustle is working' post", comment:"Love seeing this! What's the income split looking like now vs when you started? The early stage is always the hardest — it gets so much better once the momentum kicks in 🔥" },
    { context:"'Failed side hustle' post", comment:"The failure stories are the most valuable! What was the main reason it didn't work — too much time, wrong model, or just not the right fit? I ask because I made similar mistakes before finding something that actually sticks" },
  ]},
  { category:"Trading frustration posts", templates:[
    { context:"'Can't read charts' post", comment:"The frustration is SO real 😅 Have you tried any AI-assisted analysis tools? Changed my whole approach — instead of staring at indicators, I let AI flag the patterns and I just confirm them visually. Worth exploring" },
    { context:"'Lost money trading' post", comment:"That experience is brutal but really valuable. Most losses come from the same root causes: no stop loss, emotional decisions, bad setups. Did you have a defined system when the loss happened?" },
    { context:"'I keep missing entries' post", comment:"The entry timing problem is real — and it comes from trying to be perfect. I solved this with automated alerts instead of watching charts. Are you doing any kind of entry automation?" },
  ]},
  { category:"Crypto / Investing posts", templates:[
    { context:"'Looking for crypto alpha' post", comment:"The early signal problem in crypto is all about data access. I've been using a Solana scanner that flags tokens before the moves based on wallet activity + volume. Not a guarantee but better than chasing pumps 👀" },
    { context:"'Crypto is too risky' post", comment:"Risk in crypto is real — but it's usually about position sizing and not having a system, not the asset itself. Do you use any analysis tools or is it mostly fundamental/news based for you?" },
    { context:"'Where to invest now' post", comment:"Honestly depends on your timeframe and risk tolerance! Short-term: requires a system and tools. Long-term: depends on conviction. What's your current investment horizon?" },
  ]},
  { category:"Work from home posts", templates:[
    { context:"'Work from home setup' post", comment:"The WFH life is the best — and worst 😂 The discipline piece is everything. Are you building any income streams that can work truly location-independently? I've been building something that only needs content + a laptop" },
    { context:"'Remote work opportunity' post", comment:"Remote opportunities have exploded — but the best ones still require a real skill. What's your background? I ask because the combination of trading + content is surprisingly accessible now with AI tools" },
    { context:"'WFH productivity tips' post", comment:"Time blocking is a lifesaver for me too. One thing I added: treating my trading review as a 'morning meeting' at 8am — keeps me focused on the right things before the day starts. Do you have any trading/investing routines?" },
  ]},
];

interface DMScript {
  situation: string;
  script: string;
}

const DM_SCRIPTS: DMScript[] = [
  { situation:"Cold outreach (interested in trading)", script:"Hey [Name]! I came across your profile and noticed you're interested in trading/investing. I'm building something in that space and would love to know — what's your biggest challenge with trading right now? No pitch, just genuinely curious about where you're at in your journey." },
  { situation:"Warm market (friend/family)", script:"Hey! Random question — are you doing anything with investing or trading at the moment? I've been in this for [X months] and found a platform that's completely changed how I approach it. Not trying to sell you anything — just thought of you and wondered if it was relevant. What are you up to these days?" },
  { situation:"Follow-up (haven't heard back)", script:"Hey [Name]! Following up on my last message — no worries if the timing's not right. I just wanted to make sure you saw the info I shared about VEDD. If you're ever curious about the free trial or want to see a demo, I'm happy to set one up. No pressure either way 🙏" },
  { situation:"Event invite (free trading session)", script:"Hey [Name]! I'm hosting a FREE live trading session this week where I walk through VEDD's AI analysis on real charts — no pitch, no upsell, just pure trading education. About 30 mins. Do you want me to send you the link? Totally free, happy to have you." },
  { situation:"Opportunity share (ambassador path)", script:"Hey [Name]! I wanted to share something I wish someone had told me earlier. There's a free ambassador path in VEDD where you can earn tokens toward your subscription by posting daily trading content. If you're already into trading/content, it basically means you can access the platform for free while building income. Worth 5 minutes to look at? Happy to walk you through it." },
];

// ─── Week data for Day by Day tab ───────────────────────────────

interface WeekGroup {
  week: number;
  theme: string;
  veddTool: string;
  days: number[];
}

const WEEK_GROUPS: WeekGroup[] = [
  { week:1, theme:"Foundation & Identity", veddTool:"AI Analysis Engine", days:[1,2,3,4,5,6] },
  { week:2, theme:"Trading Education", veddTool:"Brain Mode + Multi-TF EA", days:[7,8,9,10,11,12,13] },
  { week:3, theme:"Social Proof & Results", veddTool:"Weekly Strategy + Live Monitor", days:[14,15,16,17,18,19,20] },
  { week:4, theme:"Community & Events", veddTool:"Live Engine + TradeLocker", days:[21,22,23,24,25,26,27] },
  { week:5, theme:"Advanced Features", veddTool:"Futures Connect + SOL Scanner", days:[28,29,30,31,32,33,34] },
  { week:6, theme:"Recruitment & Duplication", veddTool:"Ambassador Program + Referral Hub", days:[35,36,37,38,39,40] },
  { week:7, theme:"Mastery & Legacy", veddTool:"VEDD Wallet + Social Hub", days:[41,42,43,44] },
];

// ─── Helper functions ───────────────────────────────────────────

function getPlatformIcon(platform: string) {
  switch (platform.toLowerCase()) {
    case "instagram": case "instagram reel": return <Instagram className="h-4 w-4" />;
    case "twitter": return <Twitter className="h-4 w-4" />;
    case "linkedin": return <Linkedin className="h-4 w-4" />;
    case "tiktok": return <Video className="h-4 w-4" />;
    default: return <Globe className="h-4 w-4" />;
  }
}

function getPlatformColor(platform: string): string {
  switch (platform.toLowerCase()) {
    case "instagram": case "instagram reel": return "bg-pink-500/20 text-pink-400 border-pink-500/30";
    case "twitter": return "bg-sky-500/20 text-sky-400 border-sky-500/30";
    case "linkedin": return "bg-blue-600/20 text-blue-400 border-blue-600/30";
    case "tiktok": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "facebook": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="text-gray-400 hover:text-white transition-colors p-1 rounded">
      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function AmbassadorFreePathPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"journey"|"swipe"|"daybyday"|"metrics"|"hub">("journey");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<number[]>([1]);
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [savedCards, setSavedCards] = useState<string[]>([]);
  const [hubCategory, setHubCategory] = useState("Hot Posts");
  const [commentCategory, setCommentCategory] = useState("Financial freedom posts");
  const dragStartX = useRef(0);

  // ─── API Queries ──────────────────────────────────────────────

  const { data: journey, isLoading: journeyLoading } = useQuery<AmbassadorJourney>({
    queryKey: ["/api/ambassador/journey"],
    refetchOnWindowFocus: false,
  });

  const { data: todayPlan, isLoading: planLoading } = useQuery<DayPlan>({
    queryKey: ["/api/ambassador/journey/day", journey?.currentDay ?? 1],
    queryFn: () => apiRequest("GET", `/api/ambassador/journey/day/${journey?.currentDay ?? 1}`).then(r => r.json()),
    enabled: !!journey,
  });

  const completeDayMutation = useMutation({
    mutationFn: (day: number) => apiRequest("POST", "/api/ambassador/journey/complete-day", { day }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/journey"] });
      toast({ title: "Day Complete! 🎉", description: "+10 tokens earned. Keep going!" });
    },
    onError: () => toast({ title: "Error", description: "Could not complete day", variant: "destructive" }),
  });

  const saveContentMutation = useMutation({
    mutationFn: (contentId: string) => apiRequest("POST", "/api/ambassador/journey/save-content", { contentId }).then(r => r.json()),
    onSuccess: (data: AmbassadorJourney) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/journey"] });
      setSavedCards(Array.isArray(data.savedContent) ? (data.savedContent as string[]) : []);
    },
  });

  const { data: dayPlanModal } = useQuery<DayPlan>({
    queryKey: ["/api/ambassador/journey/day", selectedDay],
    queryFn: () => apiRequest("GET", `/api/ambassador/journey/day/${selectedDay}`).then(r => r.json()),
    enabled: selectedDay !== null,
  });

  // ─── Swipe handlers ───────────────────────────────────────────

  const onDragStart = useCallback((clientX: number) => {
    dragStartX.current = clientX;
    setIsDragging(true);
  }, []);

  const onDragMove = useCallback((clientX: number) => {
    if (!isDragging) return;
    setDragX(clientX - dragStartX.current);
  }, [isDragging]);

  const onDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const card = SWIPE_CARDS[swipeIndex];
    if (dragX < -80) {
      // Skip
      setSwipeIndex(i => Math.min(i + 1, SWIPE_CARDS.length - 1));
    } else if (dragX > 80) {
      // Save
      if (card && !savedCards.includes(card.id)) {
        setSavedCards(prev => [...prev, card.id]);
        saveContentMutation.mutate(card.id);
      }
      setSwipeIndex(i => Math.min(i + 1, SWIPE_CARDS.length - 1));
    }
    setDragX(0);
  }, [isDragging, dragX, swipeIndex, savedCards, saveContentMutation]);

  // ─── Computed values ──────────────────────────────────────────

  const completedDays = Array.isArray(journey?.completedDays) ? (journey!.completedDays as number[]) : [];
  const tokensEarned = journey?.tokensEarned ?? 0;
  const subscriptionProgress = Math.min(100, (tokensEarned / 2000) * 100);
  const currentDay = journey?.currentDay ?? 1;
  const streakDays = journey?.streakDays ?? 0;

  if (journeyLoading) {
    return (
      <div className="app-page flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Rocket className="h-12 w-12 text-emerald-400 animate-bounce mx-auto mb-4" />
          <p className="text-gray-400">Loading your journey...</p>
        </div>
      </div>
    );
  }

  // ─── Tabs ──────────────────────────────────────────────────────

  const TABS = [
    { id:"journey" as const, label:"My Journey", icon:<Target className="h-4 w-4" /> },
    { id:"swipe" as const, label:"Content Swipe", icon:<Heart className="h-4 w-4" /> },
    { id:"daybyday" as const, label:"Day by Day", icon:<Calendar className="h-4 w-4" /> },
    { id:"metrics" as const, label:"Success Metrics", icon:<BarChart3 className="h-4 w-4" /> },
    { id:"hub" as const, label:"Content Hub", icon:<BookOpen className="h-4 w-4" /> },
  ];

  return (
    <div className="app-page max-w-4xl mx-auto px-4 pb-24">
      {/* Page header */}
      <div className="flex items-center gap-3 pt-6 pb-4">
        <div className="icon-box icon-box-green">
          <Rocket className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Free Path to Pro</h1>
          <p className="text-sm text-gray-400">Earn your subscription through 44 days of ambassador activity</p>
        </div>
      </div>

      <TokenomicsBanner
        highlight="Complete the 44-day journey to earn your free Pro subscription via VEDD tokens"
        rewards={[
          { label: 'Per day completed', amount: '10 VEDD' },
          { label: 'Event hosting', amount: '100 VEDD', color: 'text-blue-400' },
          { label: 'Journey completion', amount: '500 VEDD bonus', color: 'text-emerald-400' },
        ]}
      />

      {/* Tab navigation */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-6 scrollbar-none">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: MY JOURNEY ── */}
      {activeTab === "journey" && (
        <div className="space-y-6">
          {/* Hero card */}
          <div className="smart-card p-5 bg-gradient-to-br from-emerald-900/30 to-green-900/20 border-emerald-500/30">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-emerald-400" />
                  FREE AMBASSADOR PATH
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  Day <span className="text-white font-bold">{currentDay}</span> of 44
                  {streakDays > 0 && (
                    <span className="ml-2 text-orange-400 font-medium">
                      <Flame className="inline h-3.5 w-3.5 mr-0.5" />
                      {streakDays} day streak
                    </span>
                  )}
                </p>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                {completedDays.length}/44 days
              </Badge>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Progress to free month</span>
                <span>{Math.round(subscriptionProgress)}%</span>
              </div>
              <div className="prog-track">
                <div className="prog-fill bg-emerald-500" style={{ width: `${subscriptionProgress}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">{tokensEarned} / 2,000 <span className="text-emerald-400 font-semibold">earned VEDD</span> for 1 free month (ambassador rate)</p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label:"Tokens", value:tokensEarned, icon:<Trophy className="h-4 w-4 text-yellow-400" /> },
                { label:"Referrals", value:journey?.referralsCount ?? 0, icon:<Users className="h-4 w-4 text-blue-400" /> },
                { label:"Posts", value:journey?.postsCompleted ?? 0, icon:<Star className="h-4 w-4 text-purple-400" /> },
                { label:"Free Months", value:journey?.monthsEarned ?? 0, icon:<Award className="h-4 w-4 text-emerald-400" /> },
              ].map(stat => (
                <div key={stat.label} className="text-center">
                  <div className="flex justify-center mb-1">{stat.icon}</div>
                  <div className="stat-num text-lg">{stat.value}</div>
                  <div className="stat-lbl">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Token milestone path */}
          <div className="smart-card p-4">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-400" />
              Token Milestones
            </h3>
            <div className="space-y-3">
              {[
                { tokens:500, reward:"1 Free Week", earned: tokensEarned >= 500 },
                { tokens:2000, reward:"1 Free Month", earned: tokensEarned >= 2000 },
                { tokens:4000, reward:"2 Free Months", earned: tokensEarned >= 4000 },
                { tokens:6000, reward:"3 Free Months", earned: tokensEarned >= 6000 },
              ].map(m => (
                <div key={m.tokens} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${m.earned ? "bg-yellow-500/20 text-yellow-400" : "bg-gray-700 text-gray-500"}`}>
                    {m.earned ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className={`text-sm font-medium ${m.earned ? "text-yellow-400" : "text-gray-300"}`}>{m.reward}</span>
                      <span className="text-xs text-gray-500">{m.tokens} tokens</span>
                    </div>
                    <div className="prog-track mt-1 h-1.5">
                      <div className="prog-fill bg-yellow-500 h-1.5" style={{ width: `${Math.min(100,(tokensEarned/m.tokens)*100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-white/10 space-y-1 text-xs text-gray-400">
              <p>• Complete a day = <span className="text-emerald-400">+10 tokens</span></p>
              <p>• Referral signs up = <span className="text-emerald-400">+50 tokens</span></p>
              <p>• Referral subscribes = <span className="text-emerald-400">+200 tokens</span></p>
              <p>• 7-day streak bonus = <span className="text-emerald-400">+100 tokens</span></p>
              <p>• Complete all 44 days = <span className="text-emerald-400">+500 BONUS tokens</span></p>
            </div>
          </div>

          {/* Today's action card */}
          <div className="smart-card p-5 border-blue-500/20">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-white text-lg">Today's Plan</h3>
                <p className="text-sm text-gray-400">Day {currentDay} of 44</p>
              </div>
              {todayPlan && (
                <div className="flex gap-2">
                  <Badge className={`text-xs ${getPlatformColor(todayPlan.platform)}`}>
                    {getPlatformIcon(todayPlan.platform)}
                    <span className="ml-1">{todayPlan.platform}</span>
                  </Badge>
                  <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                    {todayPlan.contentType}
                  </Badge>
                </div>
              )}
            </div>

            {planLoading ? (
              <div className="text-center py-8 text-gray-500">Loading today's plan...</div>
            ) : todayPlan ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-emerald-400 mb-1">{todayPlan.theme}</h4>
                  <p className="text-xs text-gray-400">{todayPlan.weeklyContext}</p>
                </div>

                {/* Main post caption */}
                <div className="bg-black/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400 font-medium">Today's Caption</span>
                    <CopyButton text={todayPlan.mainPost.caption + "\n\n" + todayPlan.mainPost.hashtags.join(" ")} />
                  </div>
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{todayPlan.mainPost.caption}</p>
                  <p className="text-xs text-blue-400 mt-2">{todayPlan.mainPost.hashtags.join(" ")}</p>
                </div>

                {/* Story idea */}
                <div className="flex items-start gap-2 bg-purple-900/20 rounded-lg p-3">
                  <Zap className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-purple-400 font-medium mb-0.5">Story Idea</p>
                    <p className="text-sm text-gray-300">{todayPlan.storyIdea}</p>
                  </div>
                </div>

                {/* Pro tip */}
                <div className="flex items-start gap-2 bg-amber-900/20 rounded-lg p-3">
                  <Star className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-amber-400 font-medium mb-0.5">Pro Tip</p>
                    <p className="text-sm text-gray-300">{todayPlan.proTip}</p>
                  </div>
                </div>

                {/* Daily checklist */}
                <div>
                  <p className="text-sm font-medium text-gray-300 mb-2">Daily Actions</p>
                  <div className="grid grid-cols-2 gap-2">
                    {["Post content","Share story","3 Comments","3 DMs"].map(action => (
                      <div key={action} className="flex items-center gap-2 text-sm text-gray-400 bg-white/5 rounded-lg px-3 py-2">
                        <Circle className="h-3.5 w-3.5 text-gray-600" />
                        {action}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mark complete */}
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                  onClick={() => completeDayMutation.mutate(currentDay)}
                  disabled={completeDayMutation.isPending || completedDays.includes(currentDay)}
                >
                  {completedDays.includes(currentDay) ? (
                    <><CheckCircle2 className="h-4 w-4 mr-2 text-emerald-300" /> Day {currentDay} Complete!</>
                  ) : completeDayMutation.isPending ? (
                    "Saving..."
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 mr-2" /> Mark Day {currentDay} Complete (+{todayPlan.tokensAvailable} tokens)</>
                  )}
                </Button>
              </div>
            ) : null}
          </div>

          {/* Day calendar strip */}
          <div className="smart-card p-4">
            <h3 className="font-semibold text-white mb-3 text-sm">44-Day Progress</h3>
            <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
              {Array.from({ length: 44 }, (_, i) => i + 1).map(day => {
                const isDone = completedDays.includes(day);
                const isCurrent = day === currentDay;
                const isFuture = day > currentDay;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={`w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                      isDone
                        ? "bg-emerald-500 text-white"
                        : isCurrent
                        ? "border-2 border-red-400 text-red-400 bg-red-500/10"
                        : isFuture
                        ? "bg-gray-700/50 text-gray-600"
                        : "bg-gray-600 text-gray-400"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">Tap any day to view details</p>
          </div>
        </div>
      )}

      {/* ── TAB 2: CONTENT SWIPE ── */}
      {activeTab === "swipe" && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-lg font-bold text-white mb-1">Content Swipe Hub</h2>
            <p className="text-sm text-gray-400">Swipe right to save, left to skip</p>
          </div>

          {swipeIndex < SWIPE_CARDS.length ? (
            <div className="relative flex justify-center" style={{ minHeight: 480 }}>
              {/* Background card peek */}
              {swipeIndex + 1 < SWIPE_CARDS.length && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[92%] smart-card opacity-50 scale-95 pointer-events-none" style={{ height: 380 }} />
              )}

              {/* Active swipe card */}
              {(() => {
                const card = SWIPE_CARDS[swipeIndex];
                const rotation = dragX * 0.08;
                const likeOpacity = Math.min(1, dragX / 80);
                const nopeOpacity = Math.min(1, -dragX / 80);

                return (
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-sm smart-card p-5 cursor-grab active:cursor-grabbing select-none"
                    style={{
                      transform: `translateX(calc(-50% + ${dragX}px)) rotate(${rotation}deg)`,
                      transition: isDragging ? "none" : "transform 0.3s ease",
                    }}
                    onMouseDown={e => onDragStart(e.clientX)}
                    onMouseMove={e => onDragMove(e.clientX)}
                    onMouseUp={onDragEnd}
                    onMouseLeave={onDragEnd}
                    onTouchStart={e => onDragStart(e.touches[0].clientX)}
                    onTouchMove={e => onDragMove(e.touches[0].clientX)}
                    onTouchEnd={onDragEnd}
                  >
                    {/* Like/Nope overlays */}
                    <div className="absolute top-4 left-4 border-4 border-green-400 text-green-400 font-bold text-xl px-3 py-1 rounded-lg rotate-[-20deg]" style={{ opacity: Math.max(0, likeOpacity) }}>
                      SAVE
                    </div>
                    <div className="absolute top-4 right-4 border-4 border-red-400 text-red-400 font-bold text-xl px-3 py-1 rounded-lg rotate-[20deg]" style={{ opacity: Math.max(0, nopeOpacity) }}>
                      SKIP
                    </div>

                    <div className="flex justify-between items-start mb-3">
                      <Badge className={`text-xs ${getPlatformColor(card.platform)}`}>
                        {getPlatformIcon(card.platform)}
                        <span className="ml-1">{card.platform}</span>
                      </Badge>
                      <Badge className="text-xs bg-gray-700 text-gray-300">
                        {card.contentType}
                      </Badge>
                    </div>

                    <p className="text-sm text-gray-200 leading-relaxed mb-3" style={{ display:"-webkit-box", WebkitLineClamp:6, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                      {card.caption}
                    </p>

                    <div className="bg-black/30 rounded-lg p-2 mb-3">
                      <p className="text-xs text-gray-500 mb-1">Visual idea</p>
                      <p className="text-xs text-gray-300">{card.visualIdea}</p>
                    </div>

                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{card.hashtags.length} hashtags</span>
                      <span>Est. reach: {card.estimatedReach}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Swipe buttons */}
              <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-6">
                <button
                  onClick={() => setSwipeIndex(i => Math.min(i + 1, SWIPE_CARDS.length - 1))}
                  className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-all"
                >
                  <X className="h-6 w-6" />
                </button>
                <button
                  onClick={() => {
                    const card = SWIPE_CARDS[swipeIndex];
                    if (card && !savedCards.includes(card.id)) {
                      setSavedCards(prev => [...prev, card.id]);
                      saveContentMutation.mutate(card.id);
                    }
                    setSwipeIndex(i => Math.min(i + 1, SWIPE_CARDS.length - 1));
                  }}
                  className="w-14 h-14 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center text-green-400 hover:bg-green-500/30 transition-all"
                >
                  <Heart className="h-6 w-6" />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-white font-semibold">All cards reviewed!</p>
              <p className="text-gray-400 text-sm mt-1">You saved {savedCards.length} cards</p>
              <Button onClick={() => setSwipeIndex(0)} variant="outline" className="mt-4">Review Again</Button>
            </div>
          )}

          {/* Saved content section */}
          {savedCards.length >= 1 && (
            <div>
              <h3 className="font-semibold text-white mb-3">Your Saved Content ({savedCards.length} cards)</h3>
              <div className="space-y-3">
                {SWIPE_CARDS.filter(c => savedCards.includes(c.id)).map(card => (
                  <div key={card.id} className="smart-card p-4">
                    <div className="flex justify-between items-start mb-2">
                      <Badge className={`text-xs ${getPlatformColor(card.platform)}`}>
                        {getPlatformIcon(card.platform)}
                        <span className="ml-1">{card.platform}</span>
                      </Badge>
                      <CopyButton text={card.caption + "\n\n" + card.hashtags.join(" ")} />
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">{card.caption}</p>
                    <p className="text-xs text-blue-400 mt-2">{card.hashtags.join(" ")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: DAY BY DAY ── */}
      {activeTab === "daybyday" && (
        <div className="space-y-3">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-white">44-Day Content Plan</h2>
            <p className="text-sm text-gray-400">Your complete ambassador journey, day by day</p>
          </div>
          {WEEK_GROUPS.map(wg => {
            const isExpanded = expandedWeeks.includes(wg.week);
            const weekDone = wg.days.filter(d => completedDays.includes(d)).length;
            return (
              <div key={wg.week} className="smart-card overflow-hidden">
                <button
                  onClick={() => setExpandedWeeks(prev => isExpanded ? prev.filter(w => w !== wg.week) : [...prev, wg.week])}
                  className="w-full flex items-center justify-between p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm flex-shrink-0">
                      {wg.week}
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-white">{wg.theme}</p>
                      <p className="text-xs text-gray-500">{wg.veddTool} · {weekDone}/{wg.days.length} days done</p>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-white/10">
                    {wg.days.map(day => {
                      const isDone = completedDays.includes(day);
                      const isCurrent = day === currentDay;
                      return (
                        <div key={day} className={`flex items-center justify-between px-4 py-3 border-b border-white/5 last:border-0 ${isCurrent ? "bg-blue-500/5" : ""}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${isDone ? "bg-emerald-500 text-white" : isCurrent ? "border-2 border-red-400 text-red-400" : "bg-gray-700 text-gray-500"}`}>
                              {isDone ? <Check className="h-3 w-3" /> : day}
                            </div>
                            <div>
                              <span className="text-sm text-gray-300">Day {day}</span>
                              {isCurrent && <Badge className="ml-2 text-xs bg-red-500/20 text-red-400 border-red-500/30">Today</Badge>}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 px-3"
                            onClick={() => setSelectedDay(day)}
                          >
                            View
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB 4: SUCCESS METRICS ── */}
      {activeTab === "metrics" && (
        <div className="space-y-6">
          <div className="mb-2">
            <h2 className="text-lg font-bold text-white">Ambassador Dashboard</h2>
            <p className="text-sm text-gray-400">Your performance metrics and milestones</p>
          </div>

          {/* Activity stats */}
          <div className="smart-card p-4">
            <h3 className="font-semibold text-white mb-3">Activity</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label:"Days Active", value:completedDays.length, color:"text-emerald-400" },
                { label:"Best Streak", value:journey?.longestStreak ?? 0, color:"text-orange-400" },
                { label:"Posts Done", value:journey?.postsCompleted ?? 0, color:"text-blue-400" },
                { label:"DMs Sent", value:journey?.dmsCompleted ?? 0, color:"text-purple-400" },
                { label:"Comments", value:journey?.commentsCompleted ?? 0, color:"text-pink-400" },
                { label:"Streak Now", value:streakDays, color:"text-yellow-400" },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-3 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Growth stats */}
          <div className="smart-card p-4">
            <h3 className="font-semibold text-white mb-3">Growth & Referrals</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label:"Est. Total Reach", value:`${(journey?.postsCompleted ?? 0) * 450}`, sub:"based on avg 450/post", color:"text-cyan-400" },
                { label:"Referral Signups", value:journey?.referralsCount ?? 0, sub:"people joined", color:"text-green-400" },
                { label:"Active Subscribers", value:journey?.subscribedReferrals ?? 0, sub:"from your referrals", color:"text-emerald-400" },
                { label:"Months Earned", value:journey?.monthsEarned ?? 0, sub:"free subscription", color:"text-yellow-400" },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-3">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-sm text-gray-300 font-medium">{s.label}</div>
                  <div className="text-xs text-gray-500">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Token progress */}
          <div className="smart-card p-4">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-400" />
              Token & Subscription Status
            </h3>
            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Tokens earned</span>
                <span className="text-white font-bold">{tokensEarned}</span>
              </div>
              {[
                { threshold:500, label:"Free week (earned rate)" },
                { threshold:2000, label:"1 free month (earned rate)" },
                { threshold:4000, label:"2 free months" },
                { threshold:6000, label:"3 free months" },
              ].map(m => (
                <div key={m.threshold} className="mb-2">
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                    <span>{m.label}</span>
                    <span>{Math.min(100,Math.round((tokensEarned/m.threshold)*100))}% ({m.threshold - Math.min(tokensEarned, m.threshold)} to go)</span>
                  </div>
                  <div className="prog-track h-2">
                    <div className="prog-fill bg-yellow-500 h-2" style={{ width:`${Math.min(100,(tokensEarned/m.threshold)*100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {journey?.subscriptionEarned && (
              <div className="bg-emerald-900/30 rounded-lg p-3 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-1" />
                <p className="text-emerald-400 font-semibold text-sm">Subscription Earned!</p>
                <p className="text-gray-400 text-xs">{journey.monthsEarned} month(s) free</p>
              </div>
            )}
          </div>

          {/* Weekly bar chart */}
          <div className="smart-card p-4">
            <h3 className="font-semibold text-white mb-3">Weekly Activity</h3>
            <div className="flex items-end gap-2 h-28">
              {WEEK_GROUPS.map(wg => {
                const weekDone = wg.days.filter(d => completedDays.includes(d)).length;
                const maxDays = 7;
                const pct = (weekDone / maxDays) * 100;
                return (
                  <div key={wg.week} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-400">{weekDone}</span>
                    <div className="w-full bg-gray-700 rounded-t-sm" style={{ height: 80 }}>
                      <div
                        className="w-full bg-emerald-500 rounded-t-sm transition-all"
                        style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">W{wg.week}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Leaderboard teaser */}
          <div className="smart-card p-4">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              Top Ambassadors This Month
            </h3>
            <div className="space-y-2">
              {[
                { rank:1, name:"Ambassador #1", tokens:3420, color:"text-yellow-400" },
                { rank:2, name:"Ambassador #2", tokens:2870, color:"text-gray-300" },
                { rank:3, name:"Ambassador #3", tokens:2210, color:"text-amber-600" },
              ].map(a => (
                <div key={a.rank} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2.5">
                  <div className={`text-lg font-bold w-6 text-center ${a.color}`}>#{a.rank}</div>
                  <div className="flex-1 text-sm text-gray-300">{a.name}</div>
                  <div className="text-sm text-yellow-400 font-medium">{a.tokens} tokens</div>
                </div>
              ))}
              {tokensEarned > 0 && (
                <div className="flex items-center gap-3 bg-emerald-900/20 border border-emerald-500/20 rounded-lg px-3 py-2.5 mt-2">
                  <div className="text-lg font-bold w-6 text-center text-emerald-400">You</div>
                  <div className="flex-1 text-sm text-gray-300">Your ranking</div>
                  <div className="text-sm text-yellow-400 font-medium">{tokensEarned} tokens</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: CONTENT HUB ── */}
      {activeTab === "hub" && (
        <div className="space-y-6">
          <div className="mb-2">
            <h2 className="text-lg font-bold text-white">Social Content Library</h2>
            <p className="text-sm text-gray-400">Ready-to-use posts, comments, and DM scripts</p>
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {["Hot Posts","Education","Motivation","Recruitment","VEDD Tools","Social Proof"].map(cat => (
              <button
                key={cat}
                onClick={() => setHubCategory(cat)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-all ${hubCategory === cat ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-gray-400 hover:text-white bg-white/5"}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Posts for selected category */}
          <div className="space-y-4">
            {HUB_POSTS.filter(p => p.category === hubCategory).map(post => (
              <div key={post.id} className="smart-card p-4">
                <div className="flex flex-wrap gap-1 mb-3">
                  {post.platforms.map(p => (
                    <Badge key={p} className={`text-xs ${getPlatformColor(p)}`}>
                      {getPlatformIcon(p)}<span className="ml-1">{p}</span>
                    </Badge>
                  ))}
                </div>
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm text-gray-400 font-medium">Caption</p>
                  <CopyButton text={post.caption + "\n\n" + post.hashtags.join(" ")} />
                </div>
                <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line mb-3">{post.caption}</p>
                <div className="flex justify-between items-start">
                  <p className="text-xs text-blue-400">{post.hashtags.slice(0,5).join(" ")} +{post.hashtags.length - 5}</p>
                  <CopyButton text={post.hashtags.join(" ")} />
                </div>
                <div className="mt-2 bg-black/20 rounded p-2">
                  <p className="text-xs text-gray-500">Visual: {post.visualSuggestion}</p>
                </div>
              </div>
            ))}
            {HUB_POSTS.filter(p => p.category === hubCategory).length === 0 && (
              <div className="text-center py-8 text-gray-500">No posts in this category yet</div>
            )}
          </div>

          {/* Comment Bank */}
          <div>
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-pink-400" />
              Comment Bank
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none mb-3">
              {COMMENT_BANK.map(cb => (
                <button
                  key={cb.category}
                  onClick={() => setCommentCategory(cb.category)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-all ${commentCategory === cb.category ? "bg-pink-500/20 text-pink-400 border border-pink-500/30" : "text-gray-400 hover:text-white bg-white/5"}`}
                >
                  {cb.category}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {(COMMENT_BANK.find(cb => cb.category === commentCategory)?.templates ?? []).map((t, i) => (
                <div key={i} className="smart-card p-4">
                  <p className="text-xs text-gray-500 mb-2">Context: <span className="text-gray-400 italic">{t.context}</span></p>
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm text-gray-200 leading-relaxed flex-1">{t.comment}</p>
                    <CopyButton text={t.comment} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DM Scripts */}
          <div>
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Send className="h-4 w-4 text-blue-400" />
              DM Scripts Library
            </h3>
            <div className="space-y-3">
              {DM_SCRIPTS.map((s, i) => (
                <div key={i} className="smart-card p-4">
                  <div className="flex justify-between items-start mb-2">
                    <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">{s.situation}</Badge>
                    <CopyButton text={s.script} />
                  </div>
                  <p className="text-sm text-gray-200 leading-relaxed">{s.script}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── DAY DETAIL MODAL ── */}
      <Dialog open={selectedDay !== null} onOpenChange={() => setSelectedDay(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {dayPlanModal ? (
                <>
                  Day {dayPlanModal.day} — {dayPlanModal.theme}
                  <Badge className={`text-xs ml-2 ${getPlatformColor(dayPlanModal.platform)}`}>
                    {getPlatformIcon(dayPlanModal.platform)}
                    <span className="ml-1">{dayPlanModal.platform}</span>
                  </Badge>
                </>
              ) : selectedDay ? `Day ${selectedDay}` : ""}
            </DialogTitle>
          </DialogHeader>

          {dayPlanModal && (
            <div className="space-y-4">
              {/* Context */}
              <div className="bg-emerald-900/20 rounded-lg p-3">
                <p className="text-xs text-emerald-400 font-medium mb-1">Week Context</p>
                <p className="text-sm text-gray-300">{dayPlanModal.weeklyContext}</p>
              </div>

              {/* Main caption */}
              <div className="bg-black/30 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-white">Main Post Caption</span>
                  <CopyButton text={dayPlanModal.mainPost.caption + "\n\n" + dayPlanModal.mainPost.hashtags.join(" ")} />
                </div>
                <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{dayPlanModal.mainPost.caption}</p>
                <p className="text-xs text-blue-400 mt-2">{dayPlanModal.mainPost.hashtags.join(" ")}</p>
                <div className="mt-2 pt-2 border-t border-white/10">
                  <p className="text-xs text-gray-500">Visual: {dayPlanModal.mainPost.visualIdea}</p>
                  <p className="text-xs text-amber-400 mt-1">CTA: {dayPlanModal.mainPost.ctaText}</p>
                </div>
              </div>

              {/* Story */}
              <div className="bg-purple-900/20 rounded-lg p-3">
                <p className="text-xs text-purple-400 font-medium mb-1">Story Idea</p>
                <p className="text-sm text-gray-300">{dayPlanModal.storyIdea}</p>
              </div>

              {/* Comments */}
              <div>
                <h4 className="text-sm font-semibold text-white mb-2">3 Comment Examples</h4>
                <div className="space-y-3">
                  {dayPlanModal.commentExamples.map((c, i) => (
                    <div key={i} className="bg-white/5 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1 italic">On: {c.context}</p>
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-sm text-gray-200 flex-1">{c.comment}</p>
                        <CopyButton text={c.comment} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* DM Script */}
              <div className="bg-blue-900/20 rounded-lg p-3">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-xs text-blue-400 font-medium">DM Script</p>
                  <CopyButton text={dayPlanModal.dmScript} />
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">{dayPlanModal.dmScript}</p>
              </div>

              {/* Pro tip */}
              <div className="bg-amber-900/20 rounded-lg p-3">
                <p className="text-xs text-amber-400 font-medium mb-1">Pro Tip</p>
                <p className="text-sm text-gray-300">{dayPlanModal.proTip}</p>
              </div>

              {/* Daily goal */}
              <div className="bg-green-900/20 rounded-lg p-3">
                <p className="text-xs text-green-400 font-medium mb-1">Daily Goal</p>
                <p className="text-sm text-gray-300">{dayPlanModal.dailyGoal}</p>
              </div>

              {/* VEDD Tool */}
              <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-3">
                <Zap className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">VEDD Tool to feature</p>
                  <p className="text-sm text-yellow-400 font-medium">{dayPlanModal.veddTool}</p>
                </div>
              </div>

              {/* Complete day button */}
              {selectedDay && (
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                  onClick={() => {
                    if (selectedDay) completeDayMutation.mutate(selectedDay);
                    setSelectedDay(null);
                  }}
                  disabled={completeDayMutation.isPending || completedDays.includes(selectedDay)}
                >
                  {completedDays.includes(selectedDay) ? (
                    <><CheckCircle2 className="h-4 w-4 mr-2" /> Day {selectedDay} Complete</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 mr-2" /> Mark Day {selectedDay} Complete (+{dayPlanModal.tokensAvailable} tokens)</>
                  )}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
