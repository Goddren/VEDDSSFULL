import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  GraduationCap, Brain, Monitor, TrendingUp, DollarSign, Coins, Shield, Briefcase,
  LineChart, Users, Lock, Rocket, Award, BookOpen, CheckCircle2, Clock, ChevronRight,
  ChevronLeft, Download, Sparkles, Star, X, AlertTriangle
} from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ─── Real Lesson Content ─────────────────────────────────────────────────────

interface LessonSection {
  heading: string;
  content: string;
  isExample?: boolean;
  isWarning?: boolean;
}

interface Lesson {
  number: number;
  title: string;
  timeEstimate: string;
  sections: LessonSection[];
  keyTakeaways: string[];
}

interface AssessmentQuestion {
  q: string;
  options: string[];
  correct: number;
  explanation: string;
}

interface CourseContent {
  lessons: Lesson[];
  assessment: { questions: AssessmentQuestion[]; passingScore: number; certTitle: string };
}

const LESSON_CONTENT: Record<number, CourseContent> = {
  // ── Course 1: AI Literacy 101 ─────────────────────────────────────────────
  1: {
    lessons: [
      {
        number: 1, title: "What Is Artificial Intelligence?", timeEstimate: "10 min",
        sections: [
          { heading: "The Simple Definition", content: "AI is a computer system that learns from data to make decisions or predictions — without being explicitly programmed for every situation. Traditional software follows hard-coded rules: 'IF this, THEN that.' AI instead learns the rules from examples." },
          { heading: "Machine Learning vs. Traditional Programming", content: "Traditional: A programmer writes IF rain → carry umbrella.\nMachine Learning: Show the computer 10,000 photos labeled 'cloudy' or 'clear', and it learns to predict rain on its own.\n\nThink of it like teaching a child. You don't write them a rulebook — you show them enough examples until they get it." },
          { heading: "The Three Types of AI We Use Every Day", content: "1. Supervised Learning — learns from labeled examples (spam filters, credit scoring, VEDD's chart analysis AI)\n2. Unsupervised Learning — finds patterns in data without labels (customer segmentation, fraud detection)\n3. Reinforcement Learning — learns by trial and error with rewards (chess engines, autonomous vehicles, algo trading bots)" },
          { heading: "Real-World Example: Your Netflix", content: "Netflix's recommendation engine watches what you watch, skip, or pause. It doesn't have rules like 'if action movie → recommend action.' It uses your 10,000+ data points to predict what you'll enjoy. This is AI in your daily life.", isExample: true },
          { heading: "AI in Finance Right Now", content: "• VEDD's chart analysis: trained on thousands of trades to spot ICT patterns and generate signals\n• JPMorgan's LOXM AI executes $6 trillion in trades daily, better than human traders\n• Credit card fraud detection: your bank's AI flags suspicious charges in milliseconds\n• Robo-advisors (Betterment, Wealthfront): manage $400B+ in assets" },
        ],
        keyTakeaways: ["AI learns patterns from data, not hardcoded rules", "Machine learning is the dominant form of modern AI", "AI already powers your finances, entertainment, and healthcare"],
      },
      {
        number: 2, title: "How AI Models Learn: Training & Neural Networks", timeEstimate: "12 min",
        sections: [
          { heading: "What Is a Neural Network?", content: "A neural network is loosely modeled after the human brain. It has layers of 'neurons' (really just math functions) that pass information to each other. Input layer → Hidden layers → Output layer.\n\nExample: For VEDD's chart AI — Input = candlestick data, volume, indicators. Hidden layers = pattern recognition. Output = Buy/Sell/Hold signal + confidence %." },
          { heading: "Training Data: The Fuel of AI", content: "An AI model is only as good as its training data. GIGO applies: Garbage In, Garbage Out.\n\n• More data = better model (generally)\n• Biased data = biased model\n• Outdated data = outdated predictions\n\nVEDD's AI is trained on years of forex/crypto price data, ICT methodology trades, and winning strategy patterns." },
          { heading: "Real Example: How VEDD Analyzes a Chart", content: "1. You upload a chart image\n2. The AI extracts: price action, candlestick patterns, support/resistance zones, volume\n3. It matches these against patterns from thousands of winning trades\n4. It outputs: trend direction, entry/exit zones, confidence score, risk:reward\n5. The confidence score tells you HOW SURE the model is — never trade a sub-60% signal blindly", isExample: true },
          { heading: "Overfitting: When AI Memorizes Instead of Learns", content: "Overfitting happens when an AI model memorizes training data but fails on new data. Like a student who memorizes practice test answers but can't answer questions phrased differently.\n\nIn trading: an over-fitted model might claim 95% accuracy on historical data but fail in live markets. Always ask: was this tested on data the model NEVER saw?" },
          { heading: "Large Language Models (LLMs)", content: "ChatGPT, ABBA (VEDD's AI assistant), Claude, Gemini — these are LLMs. Trained on hundreds of billions of words from the internet. They don't 'understand' language like humans do — they predict which word comes next based on patterns. This is why they can be confidently wrong (hallucinations)." },
        ],
        keyTakeaways: ["Neural networks learn through layers of pattern recognition", "Training data quality determines AI quality", "Confidence scores matter — they measure how certain an AI is", "Overfitting = memorizing data, not generalizing from it"],
      },
      {
        number: 3, title: "AI Bias: When Algorithms Discriminate", timeEstimate: "14 min",
        sections: [
          { heading: "What Is AI Bias?", content: "AI bias occurs when a model produces systematically unfair outcomes for certain groups. It's usually not intentional — it's baked into the training data or the way the problem was framed." },
          { heading: "Case Study 1: COMPAS Recidivism AI", content: "COMPAS was an AI tool used by U.S. courts to predict criminal re-offense risk. ProPublica's 2016 investigation found:\n• Black defendants were nearly twice as likely as white defendants to be incorrectly flagged as high risk\n• White defendants were more often incorrectly labeled low risk\n\nThe tool was trained on historical criminal justice data — which already reflected systemic racial disparities. The AI learned and amplified the bias.", isExample: true },
          { heading: "Case Study 2: Amazon's Hiring AI", content: "Amazon built an AI resume screener trained on 10 years of hiring data. Problem: most hires over those 10 years were men. The AI learned to penalize resumes that included the word 'women's' (as in 'women's chess club') and downgraded graduates of all-women's colleges.\n\nAmazon scrapped the tool in 2018.", isExample: true },
          { heading: "Case Study 3: Facial Recognition Failures", content: "MIT Media Lab research (2018) found commercial facial recognition software had:\n• Error rate of 0.8% for light-skinned males\n• Error rate of 34.7% for dark-skinned females\n\nIn 2020, multiple Black men were wrongfully arrested due to faulty facial recognition matches. Detroit, New Orleans, and Atlanta cases documented by ACLU.", isExample: true },
          { heading: "AI Bias in Finance", content: "• Credit scoring algorithms trained on biased historical lending data can deny loans to qualified minority applicants\n• Algorithmic trading systems may amplify volatility in certain asset classes affecting emerging market currencies\n• VEDD's AI Governance module actively scans for bias in our curriculum, signals, and recommendations" },
          { heading: "How to Spot AI Bias", content: "Questions to ask about any AI system:\n1. Who built it and what data did they use?\n2. Who was included/excluded from training data?\n3. Have outcomes been tested across demographic groups?\n4. Is there human oversight for high-stakes decisions?\n5. Can the decision be explained and appealed?", isWarning: true },
        ],
        keyTakeaways: ["AI bias is usually inherited from biased training data, not intentional", "High-stakes AI decisions (criminal justice, hiring, lending) have caused real harm", "Always ask who the training data represents", "Human oversight is essential for consequential AI decisions"],
      },
      {
        number: 4, title: "Responsible AI: Privacy, Consent & Transparency", timeEstimate: "10 min",
        sections: [
          { heading: "The Three Pillars of Responsible AI", content: "1. Privacy — only collect and use data people consented to share\n2. Transparency — be able to explain how the AI reached a decision\n3. Accountability — humans must be responsible for AI outcomes; you can't blame the algorithm" },
          { heading: "Data Privacy Basics", content: "Every time you use an AI tool, data about your behavior is collected. GDPR (EU) and CCPA (California) give you rights:\n• Right to know what data is collected\n• Right to delete your data\n• Right to opt out of data sale\n• Right to non-discrimination if you exercise these rights\n\nVEDD collects trading data with your consent and never sells it to third parties." },
          { heading: "The Black Box Problem", content: "Many AI models are 'black boxes' — they produce outputs without explaining why. A bank can deny your loan application by AI, but legally they must be able to tell you why under the Equal Credit Opportunity Act.\n\nVEDD's AI always gives you an explanation with every signal: which patterns were detected, why the confidence is at X%, what the risk factors are." },
          { heading: "AI and Your Trading", content: "When using VEDD AI signals:\n• AI is a decision support tool, not a decision maker\n• Never risk money you can't afford to lose based solely on an AI signal\n• The AI doesn't know your personal financial situation\n• A 75% confidence signal means 25% chance it's wrong — manage your risk accordingly", isWarning: true },
        ],
        keyTakeaways: ["Privacy, transparency, and accountability are the pillars of responsible AI", "You have legal rights over your data under GDPR/CCPA", "AI signals support your decisions — they don't replace your judgment"],
      },
      {
        number: 5, title: "AI Tools for Your Financial Future", timeEstimate: "8 min",
        sections: [
          { heading: "The AI Financial Toolkit", content: "AI tools are democratizing financial services that used to cost thousands per month. Here's your toolkit:" },
          { heading: "For Trading & Markets", content: "• VEDD AI — chart analysis, signal generation, ICT pattern detection\n• TradingView — AI-powered alerts and strategy scripts\n• Bloomberg Terminal — used by institutional traders, now has AI summarization\n• AlphaSense — AI for earnings reports and financial research" },
          { heading: "For Personal Finance", content: "• Copilot Money — AI categorizes spending and predicts future cash flow\n• Cleo — conversational AI that roasts your spending habits but actually helps\n• Tally — AI credit card manager that eliminates late fees\n• Monarch Money — AI-powered financial planning dashboard" },
          { heading: "For Building a Business", content: "• ChatGPT / Claude — business plans, grant proposals, email templates\n• Canva AI — branded content without a designer\n• Notion AI — organize your VEDD ambassador business operations\n• VEDD Content Studio — generates branded content with your referral link built in" },
          { heading: "Warning: AI Scams in Finance", content: "Be extremely cautious of:\n• AI trading bots claiming guaranteed returns (no AI can guarantee this)\n• Deepfake videos of celebrities promoting crypto investments\n• 'AI-powered' platforms with no transparent trading history\n• Signal groups using 'AI' as a marketing term with no explainability\n\nVEDD's AI shows you the chart, the pattern detected, and the reasoning. If an AI tool can't explain its signals — walk away.", isWarning: true },
        ],
        keyTakeaways: ["AI tools have democratized financial services previously reserved for institutions", "Free AI tools exist for trading, personal finance, and business", "Always verify AI financial tools — guaranteed returns are scams"],
      },
      {
        number: 6, title: "AI in the Workforce: Preparing for the Future", timeEstimate: "8 min",
        sections: [
          { heading: "What Jobs Will AI Change?", content: "McKinsey (2024): By 2030, AI could automate 30% of work hours across the U.S. economy. But this doesn't mean 30% unemployment — it means 30% of TASKS within jobs, creating demand for new skills." },
          { heading: "Jobs AI Is Most Affecting Now", content: "High automation risk:\n• Data entry and basic processing\n• Routine customer service\n• Basic financial analysis and reporting\n• Standard legal document review\n\nLow automation risk:\n• Roles requiring emotional intelligence\n• Physical trades and skilled labor\n• Creative direction and strategy\n• AI oversight and ethics roles" },
          { heading: "Skills That Make You AI-Proof", content: "1. AI Literacy — understanding and directing AI tools (this course)\n2. Critical Thinking — evaluating AI outputs, not just accepting them\n3. Financial Intelligence — money management AI can inform but not replace\n4. Communication — articulating ideas AI can't originate\n5. Trading & Investing — building assets that work while you don't" },
          { heading: "The VEDD Path Forward", content: "VEDD is built on the premise that financial literacy + AI literacy + community = economic freedom. You don't just learn to use AI — you learn to generate income, build business credit, apply for grants, and grow a network of people doing the same.\n\nThe Workforce Academy certificate you earn here is documentation of real skills for DOL workforce programs, grant applications, and career advancement." },
        ],
        keyTakeaways: ["AI will change 30% of job tasks, not 30% of jobs", "AI literacy is now a core career skill across all industries", "VEDD's mission is financial + AI literacy = economic freedom"],
      },
    ],
    assessment: {
      passingScore: 70,
      certTitle: "AI Literacy 101 — VEDD Certified",
      questions: [
        { q: "What is the main difference between traditional programming and machine learning?", options: ["Traditional programming is faster", "Machine learning writes its own code", "Machine learning learns rules from data, traditional programming follows hardcoded rules", "Machine learning doesn't use computers"], correct: 2, explanation: "Machine learning discovers patterns from training data rather than following explicitly programmed if/then rules." },
        { q: "What does 'GIGO' stand for in the context of AI training data?", options: ["Graphics In, Graphics Out", "Garbage In, Garbage Out", "Growth In, Growth Out", "General Input, General Output"], correct: 1, explanation: "GIGO means Garbage In, Garbage Out — an AI model trained on poor quality or biased data will produce poor quality or biased results." },
        { q: "The COMPAS recidivism AI tool was found to be biased against which group?", options: ["Women", "Elderly defendants", "Black defendants", "Non-citizens"], correct: 2, explanation: "ProPublica's 2016 investigation found COMPAS incorrectly flagged Black defendants as high-risk at nearly twice the rate of white defendants." },
        { q: "Under CCPA (California Consumer Privacy Act), which right do consumers have?", options: ["Right to guaranteed AI accuracy", "Right to delete their personal data", "Right to free credit scores", "Right to AI-generated legal advice"], correct: 1, explanation: "CCPA grants California residents the right to know what data is collected, the right to delete it, and the right to opt out of data sales." },
        { q: "What does a 75% AI confidence score mean for a trading signal?", options: ["The trade will be profitable 75% of the time", "There is a 75% probability the pattern analysis is correct and a 25% chance it's wrong", "Risk:reward ratio is 3:1", "75 pips profit expected"], correct: 1, explanation: "Confidence score reflects model certainty about the pattern, not guaranteed profitability. Risk management is still required." },
        { q: "Amazon scrapped its AI hiring tool because it learned to discriminate based on what?", options: ["Age", "Location", "Gender (penalized resumes mentioning women's activities)", "Educational background"], correct: 2, explanation: "The AI was trained on 10 years of mostly male hires, so it learned to penalize any mention of women's activities or all-women's colleges." },
        { q: "Which statement about large language models (LLMs) like ChatGPT is TRUE?", options: ["They truly understand human language", "They predict the next most likely word based on patterns", "They have access to real-time financial data by default", "They are always factually accurate"], correct: 1, explanation: "LLMs generate text by predicting statistically likely next tokens — they don't 'understand' language and can confidently produce incorrect information (hallucinations)." },
        { q: "What is 'overfitting' in AI model training?", options: ["Using too much computing power", "A model memorizing training data but failing on new data", "Training a model for too long", "Using too many data features"], correct: 1, explanation: "Overfitting means the model memorized training data patterns rather than generalizing, causing it to fail when it encounters data it hasn't seen before." },
      ],
    },
  },

  // ── Course 3: Trading Fundamentals ───────────────────────────────────────
  3: {
    lessons: [
      {
        number: 1, title: "What Is Forex? Currency Pairs & Market Structure", timeEstimate: "12 min",
        sections: [
          { heading: "The Forex Market", content: "Forex (Foreign Exchange) is the largest financial market on earth — $7.5 trillion traded every single day. More than all global stock markets combined. It operates 24 hours a day, 5 days a week, across Sydney, Tokyo, London, and New York." },
          { heading: "How Currency Pairs Work", content: "In forex, you always trade one currency against another:\n• EUR/USD — Euro vs. US Dollar (most traded)\n• GBP/USD — British Pound vs. US Dollar (called 'Cable')\n• XAU/USD — Gold vs. US Dollar (VEDD's most analyzed pair)\n\nThe first currency is the BASE, the second is the QUOTE.\nEUR/USD = 1.0875 means 1 Euro buys $1.0875" },
          { heading: "What Is a Pip?", content: "A pip is the smallest standard price movement. For most pairs, it's the 4th decimal place.\n\nEUR/USD moves from 1.0875 to 1.0876 = 1 pip movement\n\nFor USD/JPY and XAU/USD, pips work differently:\n• XAU/USD moves from 2,318.50 to 2,319.50 = $1.00 move per ounce", isExample: true },
          { heading: "Lot Sizes: How Much Are You Trading?", content: "• Standard Lot = 100,000 units (1 pip = $10)\n• Mini Lot = 10,000 units (1 pip = $1)\n• Micro Lot = 1,000 units (1 pip = $0.10)\n\nMost beginners start with micro lots. VEDD's position size calculator tells you exactly which lot size fits your account and risk tolerance." },
          { heading: "The Four Major Trading Sessions", content: "• Sydney Session: 10 PM – 7 AM UTC (low volume, range-bound)\n• Tokyo Session: 12 AM – 9 AM UTC (JPY pairs most active)\n• London Session: 8 AM – 5 PM UTC (highest volume, most volatility)\n• New York Session: 1 PM – 10 PM UTC (USD pairs spike at 2:30 PM UTC)\n\nThe London–New York overlap (1 PM – 5 PM UTC) is the BEST time to trade for most pairs." },
        ],
        keyTakeaways: ["Forex is a $7.5T/day market — the world's largest", "Currency pairs = one currency vs another; you profit from relative movement", "Pip = smallest price movement; lot size = how much you're risking", "London-NY overlap has the highest volume and best trading conditions"],
      },
      {
        number: 2, title: "Reading Candlestick Charts: Patterns That Pay", timeEstimate: "15 min",
        sections: [
          { heading: "What Is a Candlestick?", content: "Each candle represents price action over a time period (1 min, 15 min, 1 hour, 1 day, etc). A candle has:\n• Open price — where price started\n• Close price — where price ended\n• High — highest point reached\n• Low — lowest point reached\n• Body — the rectangle between open and close\n• Wicks/Shadows — the lines above/below the body" },
          { heading: "Bullish vs. Bearish Candles", content: "Green (Bullish) candle: Close > Open. Buyers won. Price went UP.\nRed (Bearish) candle: Close < Open. Sellers won. Price went DOWN.\n\nThe SIZE of the body tells you the conviction. Big body = strong move. Small body = uncertainty. Long wick = price was rejected at that level." },
          { heading: "High-Probability Candlestick Patterns", content: "1. BULLISH ENGULFING — Red candle followed by a larger green candle that completely engulfs it. Strong reversal signal at support.\n\n2. BEARISH ENGULFING — Green candle followed by a larger red candle. Strong reversal at resistance.\n\n3. HAMMER — Small body at top, long lower wick. Price dipped, buyers slammed it back up. Bullish reversal.\n\n4. SHOOTING STAR — Small body at bottom, long upper wick. Price shot up, sellers crushed it back down. Bearish reversal.\n\n5. DOJI — Open and close almost identical. Indecision. Potential reversal if at key level." },
          { heading: "Real Example: XAUUSD Bullish Engulfing Setup", content: "Date: June 2025, H4 chart\n• Price pulled back to key support at $2,285\n• Red candle formed as sellers tested the level\n• Following candle: large bullish engulfing closed at $2,302\n• Entry: $2,303 (above the engulfing candle high)\n• Stop Loss: $2,278 (below the wick low)\n• Target: $2,340 (previous resistance)\n• Result: 2.2 Risk:Reward, hit target in 18 hours", isExample: true },
          { heading: "What Wicks Tell You", content: "Long upper wick = price tried to go higher but SELLERS rejected it — bearish signal at resistance\nLong lower wick = price tried to go lower but BUYERS stepped in — bullish signal at support\n\nIn ICT methodology, these wicks are often 'liquidity grabs' — institutional traders run stop losses before reversing price. A long wick through a previous low, immediately reversing, is an ICT classic entry trigger." },
        ],
        keyTakeaways: ["Every candle tells a story of buyer vs. seller battle", "Bullish/bearish engulfing are the most reliable reversal signals", "Wicks show rejection — they reveal where big money stepped in", "Pattern + key level = high probability setup"],
      },
      {
        number: 3, title: "Support, Resistance & Key Price Levels", timeEstimate: "12 min",
        sections: [
          { heading: "What Is Support?", content: "Support is a price level where buying pressure historically overcame selling pressure — causing price to bounce upward. Think of it as a floor. Every time price returns to this level, buyers show up.\n\nWhy? Because institutional traders (banks, hedge funds) place buy orders at these levels in advance. Retail traders see the bounces and call them 'support.'" },
          { heading: "What Is Resistance?", content: "Resistance is a price level where selling pressure historically overcame buying pressure — causing price to reverse downward. Think of it as a ceiling.\n\nWhen price breaks through old resistance, that level BECOMES support (role reversal). This is one of the most reliable setups in trading." },
          { heading: "How to Find Key Levels", content: "1. Zoom out to the Daily chart first — mark the BIG levels that held for weeks or months\n2. Look for multiple candle wicks clustering at the same price — that's a key level\n3. Mark previous major highs and lows (PDH = Previous Day High, PDL = Previous Day Low)\n4. Note round numbers ($2,300, 1.0900) — big orders cluster here\n5. Mark where strong bullish/bearish candles started — those are order blocks" },
          { heading: "Real Example: EURUSD Support/Resistance", content: "On EURUSD Daily chart (May 2025):\n• Key resistance: 1.0942 (April high, rejected 3 times)\n• Key support: 1.0780 (March low, held twice)\n• When price reached 1.0942 again, three bearish wicks appeared → Short setup\n• Stop above 1.0965, target 1.0840 = 4:1 risk:reward\n\nThis is why marking levels before the market opens matters.", isExample: true },
          { heading: "ICT Order Blocks: Institutional Support & Resistance", content: "Order Blocks (OBs) are the LAST candle moving OPPOSITE to the strong move before it. They represent where banks placed their bulk orders.\n\nBullish OB: The last RED candle before a strong bullish breakout. Price returns to it → banks reload → price rallies.\nBearish OB: The last GREEN candle before a strong bearish breakdown. Price returns to it → banks sell → price drops.\n\nVEDD's AI automatically identifies order blocks on uploaded charts." },
        ],
        keyTakeaways: ["Support = floor, Resistance = ceiling — institutional orders create these", "Old resistance becomes new support after a breakout (role reversal)", "Mark levels on Daily chart first, then drill down to H4/H1 for entries", "Order Blocks show exactly where institutional money placed orders"],
      },
      {
        number: 4, title: "Risk Management: The 1% Rule That Protects Your Capital", timeEstimate: "14 min",
        sections: [
          { heading: "Why Risk Management Is Everything", content: "Truth most trading 'gurus' skip: you can have a 40% win rate and still be profitable if your winners are bigger than your losers. Risk management is what separates traders who survive from those who blow accounts.\n\nStatistic: 70-80% of retail traders lose money. The #1 reason is not bad signals — it's poor risk management." },
          { heading: "The 1% Rule", content: "Never risk more than 1% of your total account on a single trade.\n\n$1,000 account → max risk per trade = $10\n$5,000 account → max risk per trade = $50\n$10,000 account → max risk per trade = $100\n\nWith 1% risk, you can lose 20 consecutive trades and still have 82% of your account. Most strategies don't lose 20 in a row." },
          { heading: "Risk:Reward Ratio (R:R)", content: "R:R compares how much you risk vs. how much you aim to gain.\n\n1:2 R:R = risk $50 to make $100\n1:3 R:R = risk $50 to make $150 (VEDD standard target)\n\nAt 1:3 R:R with 40% win rate:\n• 10 trades: 4 wins × $150 = $600 profit\n• 6 losses × $50 = $300 loss\n• Net: +$300 profit — with only a 40% win rate!\n\nThis math is why R:R matters more than win rate." },
          { heading: "Stop Loss Placement: Do It Right", content: "Your stop loss goes where your trade idea is proven WRONG — not where you'd lose a comfortable amount.\n\nBullish setup: Stop goes BELOW the low of the order block or support level\nBearish setup: Stop goes ABOVE the high of the order block or resistance level\n\nNEVER set a stop based on dollar amount first. Set it based on structure, then calculate your position size to fit the 1% rule.", isWarning: true },
          { heading: "Position Size Formula", content: "Position Size = Risk Amount ÷ (Stop Loss in Pips × Pip Value)\n\nExample:\n• Account: $2,000\n• 1% Risk: $20\n• Stop Loss: 20 pips\n• Pip value (EUR/USD mini lot): $1\n• Position Size = $20 ÷ (20 × $1) = 1.0 mini lot\n\nVEDD's Position Size Calculator on the chart analysis page does this automatically." },
          { heading: "The Worst Risk Mistakes Beginners Make", content: "1. No stop loss — 'I'll watch it' (you won't, and it'll cost you)\n2. Moving stop loss further when trade goes against you (turning small loss into account blow)\n3. Risking 10-20% on one trade because 'it's a sure thing' (nothing is)\n4. Revenge trading after a loss — doubling up to recover (spiral to zero)\n5. Trading without writing down the setup, stop, and target first", isWarning: true },
        ],
        keyTakeaways: ["1% rule = never risk more than 1% per trade regardless of conviction", "Risk:Reward ratio matters more than win rate — 1:3 R:R with 40% win rate is profitable", "Stop loss placement is based on chart structure, not dollar amount", "Revenge trading and no stop loss are account killers"],
      },
      {
        number: 5, title: "ICT Methodology: How Institutional Money Moves Markets", timeEstimate: "16 min",
        sections: [
          { heading: "The ICT Foundation", content: "ICT (Inner Circle Trader) methodology, developed by Michael Huddleston, is based on how institutional traders — banks, hedge funds, central banks — actually move markets. They don't use retail indicators. They engineer price to hunt liquidity, then deliver in the opposite direction." },
          { heading: "Liquidity: What Institutions Hunt", content: "Retail traders place stop losses in predictable places:\n• Below previous lows (buy stops)\n• Above previous highs (sell stops)\n• Below support levels\n• At round numbers\n\nInstitutions KNOW this. They engineer price to sweep those levels, collect the stop loss orders (liquidity), then reverse sharply. This is why price often spikes just below a support level before reversing — it was a liquidity grab." },
          { heading: "Fair Value Gaps (FVGs)", content: "A Fair Value Gap is a 3-candle pattern where price moved so fast (institution entering a large position) that it left an 'imbalance' — a price range that was never properly traded.\n\nBullish FVG: Candle 1 high to Candle 3 low — a gap zone. Price often returns to 'fill' this gap before continuing up.\nBearish FVG: Candle 1 low to Candle 3 high — a gap zone above current price.\n\nVEDD's AI detects FVGs automatically on uploaded charts." },
          { heading: "Real Trade: ICT AMD Setup on XAUUSD H1", content: "AMD = Accumulation → Manipulation → Distribution\n\nAsian Session (10 PM – 5 AM UTC): Price ranges between $2,315 – $2,318 (Accumulation)\nLondon Open (8 AM): Price spikes DOWN to $2,308, sweeping Asian session low buy stops (Manipulation/liquidity grab)\n$2,308 is right on a bullish order block from previous day\nBullish engulfing forms at $2,308 on M15 chart\nEntry: $2,310 | Stop: $2,303 | Target: $2,335 (previous high)\nResult: +$25 move = 3.6:1 R:R — hit within 4 hours", isExample: true },
          { heading: "ICT Macro Times", content: "Institutional order flow follows specific time windows:\n• 2:00 AM UTC — London pre-market\n• 8:30 AM UTC — London open (highest activity)\n• 10:00 AM UTC — London mid-session\n• 2:30 PM UTC — New York open (USD news, highest volatility)\n• 4:00 PM UTC — NY afternoon drift\n\nVEDD's 'Best Time to Trade' meter uses these macro windows to score your trading conditions in real time." },
        ],
        keyTakeaways: ["Institutions hunt liquidity (stop losses) before reversing — retail gets trapped", "Fair Value Gaps are imbalances institutions often revisit before continuing", "AMD (Accumulation-Manipulation-Distribution) describes institutional cycle", "ICT macro times tell you WHEN institutional flow is most active"],
      },
    ],
    assessment: {
      passingScore: 70,
      certTitle: "Trading Fundamentals — VEDD Certified Trader",
      questions: [
        { q: "What does EUR/USD = 1.0875 mean?", options: ["1 USD buys 1.0875 Euros", "1 Euro buys $1.0875 USD", "EUR is 10.875% stronger than USD", "USD is the base currency"], correct: 1, explanation: "In a currency pair, the first currency (EUR) is the base. EUR/USD = 1.0875 means 1 Euro buys 1.0875 US Dollars." },
        { q: "The London–New York trading overlap occurs during which UTC hours?", options: ["6 AM – 10 AM", "10 AM – 12 PM", "1 PM – 5 PM", "8 PM – 12 AM"], correct: 2, explanation: "London session runs 8 AM–5 PM UTC. New York runs 1 PM–10 PM UTC. The overlap (1–5 PM UTC) has the highest volume and best trading conditions." },
        { q: "A bullish engulfing candlestick pattern signals what?", options: ["Continuation of a downtrend", "Indecision in the market", "Potential bullish reversal at support", "Distribution phase beginning"], correct: 2, explanation: "A bullish engulfing — where a large green candle fully engulfs the previous red candle — signals buyers taking control and a potential reversal upward." },
        { q: "What does the 1% rule in risk management mean?", options: ["Only 1% of your trades should be winners", "Take profit at 1% gain", "Never risk more than 1% of your account on a single trade", "Use 1:1 risk:reward ratio"], correct: 2, explanation: "The 1% rule means maximum risk per trade is 1% of your total account balance, ensuring that losing streaks don't devastate your capital." },
        { q: "An ICT Fair Value Gap (FVG) is best described as:", options: ["A price consolidation zone", "An area of price imbalance caused by rapid institutional movement", "The difference between bid and ask price", "A gap on weekly charts only"], correct: 1, explanation: "An FVG is a 3-candle imbalance where price moved too fast for proper two-sided trading, leaving a zone that price often returns to fill." },
        { q: "In ICT methodology, what is the purpose of a 'liquidity grab'?", options: ["To create volatility for news traders", "Institutions sweeping retail stop losses before reversing direction", "A fast price spike during low volume", "When price reaches a round number"], correct: 1, explanation: "Institutions engineer price moves to sweep retail stop loss clusters (liquidity pools) before reversing, which is why price often dips just below support before reversing up." },
        { q: "With a 1:3 risk:reward ratio and a 40% win rate over 10 trades, what is the outcome?", options: ["Net loss of $50", "Break even", "Net profit of $300", "Net profit of $200"], correct: 2, explanation: "4 wins × $150 (3R) = $600. 6 losses × $50 (1R) = $300. Net = +$300. This is why R:R matters more than win rate." },
        { q: "Where should a stop loss be placed on a bullish trade setup?", options: ["$50 below entry regardless of chart structure", "At the nearest round number", "Below the low of the order block or support level that defines the trade idea", "At the previous day's low always"], correct: 2, explanation: "Stop loss placement should be based on chart structure — specifically below the level that, if broken, invalidates your bullish trade idea." },
        { q: "What does AMD stand for in ICT methodology?", options: ["Automated Market Dynamics", "Accumulation, Manipulation, Distribution", "Average Move Direction", "Asian Market Data"], correct: 1, explanation: "AMD (Accumulation, Manipulation, Distribution) describes the institutional price delivery cycle — ranging, then a false move to grab liquidity, then directional delivery." },
        { q: "A shooting star candlestick has a small body and long upper wick. What does it signal?", options: ["Strong bullish momentum", "Price was rejected at a high — potential bearish reversal", "Indecision with no directional bias", "A continuation of uptrend"], correct: 1, explanation: "A shooting star's long upper wick shows buyers pushed price up but sellers aggressively rejected it back down — a bearish rejection signal, especially at resistance." },
      ],
    },
  },

  // ── Course 4: Financial Planning & Literacy ──────────────────────────────
  4: {
    lessons: [
      {
        number: 1, title: "The Money Mindset: Scarcity vs. Abundance", timeEstimate: "8 min",
        sections: [
          { heading: "Why Mindset Comes First", content: "Most financial education starts with budgets and credit scores. We start with mindset — because the numbers don't change until the thinking does. Research from Harvard shows that financial stress literally reduces IQ by 13 points, impairing the decisions needed to improve your situation." },
          { heading: "The Scarcity Mindset", content: "Scarcity mindset: money is limited, someone else's gain means your loss, fear drives financial decisions.\n\nSigns of scarcity thinking:\n• Avoiding looking at bank balances\n• Spending to feel better temporarily\n• Believing 'people like me don't have money'\n• Lottery mentality — waiting for one big break\n• Hoarding or extreme fear of spending on essentials" },
          { heading: "The Abundance Mindset", content: "Abundance mindset: money is a tool, there is enough for everyone who builds the right skills and systems, money follows value creation.\n\nThis doesn't mean ignoring financial reality — it means making decisions from opportunity rather than fear." },
          { heading: "Breaking Generational Patterns", content: "Many communities have been systematically excluded from wealth-building: redlining blocked Black homeownership, predatory lending targeted low-income families, lack of financial education was deliberate.\n\nRecognizing these patterns isn't about victim mentality — it's about understanding why financial literacy is an act of liberation, not just personal finance.", isExample: true },
        ],
        keyTakeaways: ["Mindset determines financial behavior before numbers ever matter", "Scarcity thinking creates the decisions that keep you stuck", "Financial literacy in underserved communities is an act of empowerment"],
      },
      {
        number: 2, title: "Budgeting: The 50/30/20 Rule and Beyond", timeEstimate: "10 min",
        sections: [
          { heading: "The 50/30/20 Framework", content: "50% — Needs: rent/mortgage, utilities, groceries, minimum debt payments, insurance\n30% — Wants: dining out, entertainment, subscriptions, clothing beyond basics\n20% — Savings & Debt Payoff: emergency fund, investments, extra debt payments\n\nThis is a starting framework — adjust based on your income reality. If you're in a high cost-of-living area, 50% needs might be 65%." },
          { heading: "Zero-Based Budgeting", content: "Every dollar gets a job. Income – all assigned expenses = $0. You're not spending $0 — you're assigning every dollar a purpose before the month starts.\n\nExample: $3,200/month income\n• Rent: $950\n• Food: $400\n• Utilities: $180\n• Transport: $300\n• Savings: $500\n• Debt extra payment: $200\n• Entertainment: $150\n• VEDD subscription: $30\n• Remaining assigned to emergency fund: $490\nTotal: $3,200 ✓" },
          { heading: "The Emergency Fund — Non-Negotiable", content: "Before anything else: build a $1,000 starter emergency fund. This buffer prevents every unexpected expense from becoming debt.\n\nGoal: 3-6 months of living expenses in a high-yield savings account (HYSAs currently paying 4.5-5% APY).\n\nWhere to open one: Marcus by Goldman Sachs, Ally Bank, SoFi — all FDIC insured, all paying 4.5%+ APY vs. 0.5% at big banks." },
          { heading: "Real Case: From Broke to $2,000 Saved in 6 Months", content: "VEDD Community Member Story:\nStarted with $340 in savings. $2,100/month take-home. Used zero-based budgeting:\n• Cut 3 streaming services: saved $45/month\n• Meal prepped Sunday: saved $200/month\n• Paid minimum on all but highest-interest debt\n• Directed $350/month to HYSA\nAfter 6 months: $2,100 saved. Stopped living paycheck to paycheck.", isExample: true },
        ],
        keyTakeaways: ["50/30/20 is a framework, not a law — adapt to your reality", "Zero-based budgeting assigns every dollar a purpose before the month starts", "Emergency fund first — without it, every setback becomes debt"],
      },
      {
        number: 3, title: "Credit Scores: How They Work & How to Build Yours", timeEstimate: "12 min",
        sections: [
          { heading: "What Is a Credit Score?", content: "A credit score (FICO score) is a number 300–850 that predicts how likely you are to repay debt. Used by:\n• Lenders (mortgage, auto, personal loans)\n• Landlords (apartment applications)\n• Insurance companies (rates)\n• Employers (some background checks)\n• Utility companies (deposit requirements)" },
          { heading: "The 5 FICO Score Factors", content: "1. Payment History (35%) — On-time payments are the BIGGEST factor. One 30-day late can drop your score 100 points.\n2. Credit Utilization (30%) — How much of your available credit you're using. Keep under 30%, ideal under 10%.\n3. Length of Credit History (15%) — Older accounts help. Don't close your oldest card.\n4. Credit Mix (10%) — Having both revolving (credit cards) and installment (loans) helps.\n5. New Credit Inquiries (10%) — Each hard inquiry can drop score ~5 points temporarily." },
          { heading: "Real Score Impact Examples", content: "Scenario A: $5,000 credit limit, $4,500 balance = 90% utilization → Score drops significantly\nScenario B: Pay that down to $500 balance (10% utilization) → Score improves ~50-80 points in 30 days\n\nScenario C: Miss one payment (30 days late) → Score drops 80-110 points\nScenario D: Set up autopay for minimums → Never miss again, score rebuilds in 6-12 months", isExample: true },
          { heading: "Building Credit from Scratch", content: "If you have no credit:\n1. Secured Credit Card (Discover it Secured, Capital One Secured) — deposit becomes your limit, reports to all 3 bureaus\n2. Credit Builder Loan (Self, Credit Strong) — pay monthly, money goes to savings, builds history\n3. Become an authorized user on a family member's old, well-managed card\n4. Retail credit card (easier to get, but higher interest — pay in full monthly)" },
          { heading: "The Business Credit Builder Connection", content: "VEDD's Business Credit Builder module shows how to build a SEPARATE business credit profile for VEDD Technologies LLC. Business credit allows you to access capital without personally guaranteeing every debt — protecting your personal assets. This is how companies scale." },
        ],
        keyTakeaways: ["Payment history (35%) is the single biggest factor — set up autopay", "Keep utilization under 30% — paying down balances improves scores fast", "Don't close old accounts — length of history counts", "Business credit is separate from personal and essential for funding"],
      },
    ],
    assessment: {
      passingScore: 70,
      certTitle: "Financial Planning & Literacy — VEDD Certified",
      questions: [
        { q: "In the 50/30/20 budget framework, what does the '20%' represent?", options: ["Taxes", "Savings and debt payoff", "Wants and entertainment", "Housing costs"], correct: 1, explanation: "The 20% in the 50/30/20 rule is designated for savings, investment, and paying down debt beyond minimums." },
        { q: "What is the most important factor in your FICO credit score?", options: ["Credit utilization (30%)", "Length of credit history (15%)", "Payment history (35%)", "Number of accounts (10%)"], correct: 2, explanation: "Payment history accounts for 35% of your FICO score — the single biggest factor. One 30-day late payment can drop your score by 80-110 points." },
        { q: "What is zero-based budgeting?", options: ["Spending nothing on wants", "Assigning every dollar a job so income minus all assignments equals zero", "Saving zero until debt is paid", "Using only cash, no credit"], correct: 1, explanation: "Zero-based budgeting means every dollar of income is assigned a purpose (spending, saving, debt) before the month begins, so nothing is unaccounted for." },
        { q: "You have a $3,000 credit limit and a $2,700 balance. What is your utilization rate?", options: ["27%", "90%", "30%", "70%"], correct: 1, explanation: "$2,700 ÷ $3,000 = 90% utilization. This is very high and significantly hurts your credit score. Ideal is under 30%, best under 10%." },
        { q: "What is the recommended first financial milestone before investing?", options: ["Pay off all debt", "Get a 750+ credit score", "Build a starter emergency fund of $1,000", "Max out your 401k"], correct: 2, explanation: "A $1,000 starter emergency fund prevents every unexpected expense from becoming new debt, giving you a buffer before tackling bigger financial goals." },
        { q: "Which type of account currently offers the best return for emergency funds?", options: ["Traditional savings at a big bank (0.5% APY)", "Checking account", "High-Yield Savings Account (4.5-5% APY)", "Money market fund"], correct: 2, explanation: "High-Yield Savings Accounts at online banks (Ally, Marcus, SoFi) are FDIC insured and paying 4.5-5% APY vs 0.5% at traditional big banks." },
      ],
    },
  },
};

// ─── Course Data ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string; className?: string }>> = {
  Brain, Monitor, TrendingUp, DollarSign, Coins, GraduationCap, Shield,
  Briefcase, LineChart, Users, Lock, Rocket,
};

const COURSES = [
  { id: 1, title: "AI Literacy 101", category: "ai_literacy", difficulty: "beginner", minutes: 45, description: "Understand how AI works, bias, responsible use, and AI tools for your financial future.", grantTags: ["NSF", "DOL"], audience: "all", icon: "Brain", color: "#6366f1", lessons: 6, enrolled: 342 },
  { id: 2, title: "Digital Skills Foundations", category: "digital_skills", difficulty: "beginner", minutes: 60, description: "Core digital literacy: internet safety, productivity tools, financial apps, and data basics.", grantTags: ["DOL", "CDFI"], audience: "community", icon: "Monitor", color: "#06b6d4", lessons: 8, enrolled: 218 },
  { id: 3, title: "Trading Fundamentals", category: "trading_fundamentals", difficulty: "beginner", minutes: 90, description: "Forex market structure, candlestick charts, support/resistance, ICT methodology, risk management.", grantTags: ["SBA"], audience: "all", icon: "TrendingUp", color: "#22c55e", lessons: 5, enrolled: 567 },
  { id: 4, title: "Financial Planning & Literacy", category: "financial_planning", difficulty: "beginner", minutes: 75, description: "Mindset, budgeting systems, credit scores, emergency funds, and debt elimination strategies.", grantTags: ["CDFI", "DOL"], audience: "community", icon: "DollarSign", color: "#f59e0b", lessons: 3, enrolled: 423 },
  { id: 5, title: "Web3 & Blockchain Basics", category: "web3_basics", difficulty: "intermediate", minutes: 60, description: "Cryptocurrency wallets, NFTs, DeFi, Solana ecosystem, and VEDD token economics.", grantTags: ["NSF", "EDA"], audience: "all", icon: "Coins", color: "#a855f7", lessons: 9, enrolled: 189 },
  { id: 6, title: "STEM for Young Traders", category: "stem", difficulty: "beginner", minutes: 30, description: "Math, data analysis, and logic for youth (ages 13-21) applied to markets and money.", grantTags: ["NSF", "DOL"], audience: "youth", icon: "GraduationCap", color: "#ec4899", lessons: 8, enrolled: 156 },
  { id: 7, title: "AI Ethics in Finance", category: "ai_literacy", difficulty: "intermediate", minutes: 45, description: "Bias, fairness, transparency, and responsible AI deployment in financial services.", grantTags: ["NSF", "NIST"], audience: "all", icon: "Shield", color: "#ef4444", lessons: 6, enrolled: 98 },
  { id: 8, title: "Job Readiness & Portfolio Building", category: "digital_skills", difficulty: "beginner", minutes: 90, description: "Resume building, LinkedIn optimization, freelance finance, and digital portfolio creation.", grantTags: ["DOL", "WIA"], audience: "community", icon: "Briefcase", color: "#06b6d4", lessons: 10, enrolled: 134 },
  { id: 9, title: "Advanced AI Trading Strategies", category: "trading_fundamentals", difficulty: "advanced", minutes: 120, description: "ICT methodology deep dive, SMC order blocks, algorithmic signals, and backtesting with AI.", grantTags: ["NSF", "EDA"], audience: "ambassador", icon: "LineChart", color: "#22c55e", lessons: 15, enrolled: 87 },
  { id: 10, title: "Community Finance Leadership", category: "financial_planning", difficulty: "intermediate", minutes: 60, description: "Lead financial wellness workshops, credit co-ops, and community investment clubs.", grantTags: ["CDFI", "USDA"], audience: "ambassador", icon: "Users", color: "#f59e0b", lessons: 8, enrolled: 73 },
  { id: 11, title: "Data Privacy & Cybersecurity", category: "digital_skills", difficulty: "intermediate", minutes: 45, description: "Protect personal data, understand GDPR/CCPA, spot phishing, secure financial accounts.", grantTags: ["NSF", "CISA"], audience: "all", icon: "Lock", color: "#06b6d4", lessons: 7, enrolled: 211 },
  { id: 12, title: "Entrepreneurship & VEDD Business Launch", category: "financial_planning", difficulty: "intermediate", minutes: 90, description: "LLC formation, business credit, grants, and the VEDD ambassador business model.", grantTags: ["SBA", "EDA"], audience: "ambassador", icon: "Rocket", color: "#f59e0b", lessons: 12, enrolled: 95 },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface EnrolledCourse { courseId: number; progress: number; completed: boolean; currentLesson: number; enrolledAt: string; score?: number }
interface CurriculumResult { overview: string; objectives: string[]; modules: { title: string; duration: string; content: string }[]; grantAlignment: string; instructorNotes: string }

// ─── Lesson Player ───────────────────────────────────────────────────────────

function LessonPlayer({
  courseId, courseTitle, courseColor, initialLesson, onClose, onComplete
}: {
  courseId: number; courseTitle: string; courseColor: string; initialLesson: number;
  onClose: () => void; onComplete: (score: number) => void;
}) {
  const content = LESSON_CONTENT[courseId];
  const [currentLesson, setCurrentLesson] = useState(initialLesson - 1); // 0-indexed
  const [mode, setMode] = useState<"lesson" | "assessment">("lesson");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const { toast } = useToast();

  if (!content) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center p-8">
        <BookOpen className="w-16 h-16 text-gray-600 mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Full Lessons Coming Soon</h3>
        <p className="text-gray-400 text-sm max-w-sm">This course is being expanded with real lesson content. Check back soon or enroll in AI Literacy 101, Trading Fundamentals, or Financial Planning & Literacy for full interactive lessons now.</p>
        <Button className="mt-6" onClick={onClose}>Close</Button>
      </div>
    );
  }

  const lessons = content.lessons;
  const lesson = lessons[currentLesson];
  const totalLessons = lessons.length;
  const isLastLesson = currentLesson === totalLessons - 1;

  function submitAssessment() {
    const qs = content.assessment.questions;
    const correct = qs.filter((q, i) => answers[i] === q.correct).length;
    const pct = Math.round((correct / qs.length) * 100);
    setScore(pct);
    setSubmitted(true);
    if (pct >= content.assessment.passingScore) {
      toast({ title: "🎉 Congratulations! You passed!", description: `Score: ${pct}% — Certificate unlocked!` });
      setTimeout(() => { onComplete(pct); onClose(); }, 2500);
    } else {
      toast({ title: `Score: ${pct}% — Need ${content.assessment.passingScore}% to pass`, description: "Review the lessons and try again.", variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col h-full max-h-[85vh] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${courseColor}22` }}>
            <BookOpen className="w-4 h-4" style={{ color: courseColor }} />
          </div>
          <div>
            <p className="text-xs text-gray-500">{courseTitle}</p>
            <p className="text-sm font-bold text-white">
              {mode === "assessment" ? "Final Assessment" : `Lesson ${currentLesson + 1} of ${totalLessons}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${((currentLesson + (mode === "assessment" ? 1 : 0)) / totalLessons) * 100}%`, background: courseColor }} />
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {mode === "lesson" ? (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold text-white">{lesson.title}</h2>
              <span className="text-xs text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" />{lesson.timeEstimate}</span>
            </div>
            <div className="space-y-6">
              {lesson.sections.map((section, i) => (
                <div key={i} className={`rounded-xl p-4 border ${
                  section.isExample ? "bg-blue-500/10 border-blue-500/30" :
                  section.isWarning ? "bg-amber-500/10 border-amber-500/30" :
                  "bg-white/[0.03] border-white/10"
                }`}>
                  <h3 className={`text-sm font-bold mb-2 ${section.isExample ? "text-blue-300" : section.isWarning ? "text-amber-300" : "text-white"}`}>
                    {section.isExample ? "📌 " : section.isWarning ? "⚠️ " : ""}{section.heading}
                  </h3>
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{section.content}</p>
                </div>
              ))}
            </div>
            {lesson.keyTakeaways.length > 0 && (
              <div className="mt-6 p-4 rounded-xl border" style={{ background: `${courseColor}10`, borderColor: `${courseColor}44` }}>
                <h3 className="text-sm font-bold mb-3" style={{ color: courseColor }}>Key Takeaways</h3>
                <ul className="space-y-1.5">
                  {lesson.keyTakeaways.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: courseColor }} />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            {!submitted ? (
              <>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-white mb-1">Final Assessment</h2>
                  <p className="text-sm text-gray-400">Answer all {content.assessment.questions.length} questions. You need {content.assessment.passingScore}% to earn your certificate.</p>
                </div>
                <div className="space-y-6">
                  {content.assessment.questions.map((q, qi) => (
                    <div key={qi} className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
                      <p className="text-sm font-semibold text-white mb-3">{qi + 1}. {q.q}</p>
                      <div className="space-y-2">
                        {q.options.map((opt, oi) => (
                          <button key={oi} onClick={() => setAnswers(a => ({ ...a, [qi]: oi }))}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all border ${
                              answers[qi] === oi
                                ? "border-indigo-500/60 bg-indigo-500/15 text-white"
                                : "border-white/10 bg-white/5 text-gray-300 hover:border-white/25"
                            }`}>
                            <span className="font-mono mr-2 text-gray-500">{String.fromCharCode(65 + oi)}.</span>{opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full mt-6 text-white font-bold"
                  style={{ background: courseColor }}
                  disabled={Object.keys(answers).length < content.assessment.questions.length}
                  onClick={submitAssessment}>
                  Submit Assessment ({Object.keys(answers).length}/{content.assessment.questions.length} answered)
                </Button>
              </>
            ) : (
              <div className="text-center py-8">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${score >= content.assessment.passingScore ? "bg-green-500/20" : "bg-red-500/20"}`}>
                  {score >= content.assessment.passingScore
                    ? <CheckCircle2 className="w-12 h-12 text-green-400" />
                    : <AlertTriangle className="w-12 h-12 text-red-400" />}
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Score: {score}%</h2>
                <p className="text-gray-400 mb-6">
                  {score >= content.assessment.passingScore
                    ? "Excellent! Certificate unlocking…"
                    : `You need ${content.assessment.passingScore}% to pass. Review lessons and retake.`}
                </p>
                {score < content.assessment.passingScore && (
                  <Button onClick={() => { setSubmitted(false); setAnswers({}); setMode("lesson"); setCurrentLesson(0); }} className="bg-indigo-600 hover:bg-indigo-700">
                    Review Lessons & Retake
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer navigation */}
      {mode === "lesson" && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 flex-shrink-0">
          <Button variant="outline" className="border-white/10 text-gray-300 hover:text-white"
            disabled={currentLesson === 0}
            onClick={() => setCurrentLesson(p => p - 1)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          {isLastLesson ? (
            <Button className="font-bold text-white" style={{ background: courseColor }} onClick={() => setMode("assessment")}>
              Take Assessment <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button className="text-white" style={{ background: courseColor }} onClick={() => setCurrentLesson(p => p + 1)}>
              Next Lesson <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Course Card ─────────────────────────────────────────────────────────────

function CourseCard({ course, enrolled, onEnroll, onOpenLesson }: {
  course: typeof COURSES[0]; enrolled?: EnrolledCourse;
  onEnroll: (id: number) => void; onOpenLesson: (id: number, lesson: number) => void;
}) {
  const Icon = ICON_MAP[course.icon] || Brain;
  const diffColor = course.difficulty === "beginner" ? "#22c55e" : course.difficulty === "intermediate" ? "#f59e0b" : "#ef4444";
  const hasContent = !!LESSON_CONTENT[course.id];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="bg-white/[0.03] border-white/10 hover:border-white/20 transition-all h-full flex flex-col">
        <CardContent className="p-5 flex flex-col h-full">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${course.color}20`, border: `1px solid ${course.color}40` }}>
              <Icon size={20} color={course.color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full border capitalize"
                  style={{ background: `${diffColor}15`, color: diffColor, borderColor: `${diffColor}40` }}>
                  {course.difficulty}
                </span>
                {hasContent && <span className="text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full border border-green-400/30">✓ Real Lessons</span>}
              </div>
              <h3 className="font-bold text-sm text-white leading-snug">{course.title}</h3>
            </div>
          </div>

          <p className="text-xs text-gray-400 mb-3 flex-1 leading-relaxed">{course.description}</p>

          <div className="flex items-center gap-3 text-[11px] text-gray-500 mb-3">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{course.minutes} min</span>
            <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{course.lessons} lessons</span>
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{course.enrolled.toLocaleString()}</span>
          </div>

          <div className="flex gap-1 flex-wrap mb-4">
            {course.grantTags.map(tag => (
              <span key={tag} className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 text-[10px] border border-indigo-500/25">{tag}</span>
            ))}
          </div>

          {enrolled ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{enrolled.completed ? "Completed ✓" : `${enrolled.progress}% complete`}</span>
                {enrolled.score && <span className="text-green-400">Score: {enrolled.score}%</span>}
              </div>
              {!enrolled.completed && <Progress value={enrolled.progress} className="h-1.5" />}
              <Button className="w-full text-xs h-8 font-semibold text-white"
                style={{ background: course.color }}
                onClick={() => onOpenLesson(course.id, enrolled.currentLesson)}>
                {enrolled.completed ? "Review Course" : "Continue Lesson"}
              </Button>
            </div>
          ) : (
            <Button className="w-full text-xs h-8 font-semibold text-white"
              style={{ background: course.color }}
              onClick={() => onEnroll(course.id)}>
              Start Course
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Certificate Card ────────────────────────────────────────────────────────

function CertificateCard({ name, title, certId, score, date }: { name: string; title: string; certId: string; score: number; date: string }) {
  const { toast } = useToast();
  return (
    <div className="p-5 rounded-xl border-2 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0d1226, #1a1040)", borderColor: "rgba(251,191,36,0.4)" }}>
      <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: "linear-gradient(90deg, #f59e0b, #6366f1, #22c55e)" }} />
      <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full opacity-10" style={{ background: "#f59e0b" }} />
      <div className="text-center mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">VEDD Technologies, LLC</p>
        <p className="text-xs text-gray-400 italic mb-2">Certificate of Completion</p>
        <p className="text-white font-bold text-lg leading-tight">{name}</p>
      </div>
      <div className="text-center mb-4">
        <p className="text-xs text-gray-400 mb-1">has successfully completed</p>
        <p className="text-sm font-bold text-white">{title}</p>
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mb-4">
        <span>Score: <span className="text-green-400 font-semibold">{score}%</span></span>
        <span>Issued: {date}</span>
        <span>ID: {certId}</span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 border-amber-500/30 text-amber-400 text-xs h-7 hover:bg-amber-500/10"
          onClick={() => toast({ title: "Download coming soon", description: "PDF certificate generation is in development." })}>
          <Download className="w-3 h-3 mr-1" /> Download PDF
        </Button>
        <Button size="sm" variant="outline" className="flex-1 border-white/10 text-gray-400 text-xs h-7"
          onClick={() => { navigator.clipboard.writeText(`VEDD Certificate: ${certId}`); toast({ title: "Certificate ID copied!" }); }}>
          Copy ID
        </Button>
      </div>
    </div>
  );
}

// ─── AI Curriculum Tab ───────────────────────────────────────────────────────

function AICurriculumTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState({ title: "", category: "ai_literacy", audience: "all", difficulty: "beginner", minutes: "45", objectives: "", grantAlignment: [] as string[] });
  const [result, setResult] = useState<CurriculumResult | null>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/workforce/generate-curriculum", {
        title: form.title,
        category: form.category,
        targetAudience: form.audience,
        difficulty: form.difficulty,
        estimatedMinutes: parseInt(form.minutes) || 45,
        objectives: form.objectives,
        grantTags: form.grantAlignment,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || "Failed to generate curriculum");
      }
      return res.json() as Promise<CurriculumResult>;
    },
    onSuccess: (data) => { setResult(data); toast({ title: "Curriculum generated!", description: "Review and save to the Academy." }); },
    onError: (err: Error) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/workforce/save-curriculum", { ...form, curriculum: result });
      return res.json();
    },
    onSuccess: () => { toast({ title: "Saved to Academy!" }); setResult(null); setForm({ title: "", category: "ai_literacy", audience: "all", difficulty: "beginner", minutes: "45", objectives: "", grantAlignment: [] }); },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const toggleGrant = (tag: string) => setForm(f => ({ ...f, grantAlignment: f.grantAlignment.includes(tag) ? f.grantAlignment.filter(t => t !== tag) : [...f.grantAlignment, tag] }));

  if (!user?.isAdmin) {
    return (
      <Card className="bg-white/[0.03] border-white/10">
        <CardContent className="p-8 text-center">
          <Lock className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400">Admin privileges required to generate new curricula.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="bg-white/[0.03] border-white/10">
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-400" /> AI Curriculum Generator</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-gray-400 mb-1 block">Course Title *</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Blockchain for Community Finance" className="bg-white/5 border-white/10 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-400 mb-1 block">Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-sm h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0f1525] border-white/10">
                  {[["ai_literacy","AI Literacy"],["digital_skills","Digital Skills"],["trading_fundamentals","Trading"],["financial_planning","Financial Planning"],["web3_basics","Web3"],["stem","STEM"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-400 mb-1 block">Audience</Label>
              <Select value={form.audience} onValueChange={v => setForm(f => ({ ...f, audience: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-sm h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0f1525] border-white/10">
                  {[["all","All Users"],["community","Community"],["youth","Youth (13-21)"],["ambassador","Ambassadors"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-400 mb-1 block">Difficulty</Label>
              <Select value={form.difficulty} onValueChange={v => setForm(f => ({ ...f, difficulty: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-sm h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0f1525] border-white/10">
                  {["beginner","intermediate","advanced"].map(v => <SelectItem key={v} value={v} className="capitalize">{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-400 mb-1 block">Duration (min)</Label>
              <Input value={form.minutes} onChange={e => setForm(f => ({ ...f, minutes: e.target.value }))} type="number" min="15" max="240" className="bg-white/5 border-white/10 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-400 mb-1 block">Learning Objectives</Label>
            <Textarea value={form.objectives} onChange={e => setForm(f => ({ ...f, objectives: e.target.value }))} placeholder="What will participants be able to DO after this course?" className="bg-white/5 border-white/10 text-sm resize-none h-20" />
          </div>
          <div>
            <Label className="text-xs text-gray-400 mb-2 block">Grant Alignment</Label>
            <div className="flex gap-2 flex-wrap">
              {["NSF","DOL","SBA","CDFI","EDA","NIST"].map(tag => (
                <button key={tag} onClick={() => toggleGrant(tag)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${form.grantAlignment.includes(tag) ? "bg-indigo-500/30 border-indigo-500/60 text-indigo-300" : "bg-white/5 border-white/10 text-gray-400 hover:border-white/25"}`}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <Button className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !form.title || !form.objectives}>
            {generateMutation.isPending ? <><Sparkles className="w-4 h-4 mr-2 animate-pulse" /> Generating…</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate Curriculum</>}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {result ? (
          <Card className="bg-white/[0.03] border-indigo-500/30">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-indigo-300">Generated Curriculum</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Overview</p>
                <p className="text-gray-300">{result.overview}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Learning Objectives</p>
                <ul className="space-y-1">{result.objectives?.map((o, i) => <li key={i} className="flex items-start gap-2 text-gray-300"><CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />{o}</li>)}</ul>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Modules ({result.modules?.length})</p>
                <div className="space-y-2">{result.modules?.map((m, i) => <div key={i} className="p-2.5 rounded-lg bg-white/5 border border-white/10"><p className="text-xs font-semibold text-white">{i + 1}. {m.title} <span className="text-gray-500 font-normal">({m.duration})</span></p><p className="text-xs text-gray-400 mt-0.5">{m.content}</p></div>)}</div>
              </div>
              <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Grant Alignment</p>
                <p className="text-xs text-gray-300">{result.grantAlignment}</p>
              </div>
              <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save to Academy Catalog"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-white/[0.03] border-white/10 flex items-center justify-center min-h-60">
            <div className="text-center text-gray-600">
              <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Fill in the form and click Generate</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkforceAcademyPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [catFilter, setCatFilter] = useState("all");
  const [diffFilter, setDiffFilter] = useState("all");
  const [enrollments, setEnrollments] = useState<EnrolledCourse[]>([]);
  const [certificates, setCertificates] = useState<{ courseId: number; certId: string; title: string; score: number; date: string }[]>([]);
  const [lessonOpen, setLessonOpen] = useState<{ courseId: number; lesson: number } | null>(null);

  const isAdmin = !!(user as any)?.isAdmin;
  const name = (user as any)?.fullName || (user as any)?.username || "Learner";

  const cats = ["all", "ai_literacy", "digital_skills", "trading_fundamentals", "financial_planning", "web3_basics", "stem"];
  const catLabels: Record<string, string> = { all: "All", ai_literacy: "AI Literacy", digital_skills: "Digital Skills", trading_fundamentals: "Trading", financial_planning: "Finance", web3_basics: "Web3", stem: "STEM" };

  const filteredCourses = COURSES.filter(c => {
    if (catFilter !== "all" && c.category !== catFilter) return false;
    if (diffFilter !== "all" && c.difficulty !== diffFilter) return false;
    return true;
  });

  function handleEnroll(courseId: number) {
    if (enrollments.find(e => e.courseId === courseId)) return;
    setEnrollments(prev => [...prev, { courseId, progress: 0, completed: false, currentLesson: 1, enrolledAt: new Date().toISOString() }]);
    const course = COURSES.find(c => c.id === courseId);
    toast({ title: `Enrolled in ${course?.title}`, description: "Go to My Progress to start learning." });
  }

  function handleOpenLesson(courseId: number, lesson: number) {
    setLessonOpen({ courseId, lesson: lesson || 1 });
  }

  function handleComplete(courseId: number, score: number) {
    const course = COURSES.find(c => c.id === courseId);
    if (!course) return;
    setEnrollments(prev => prev.map(e => e.courseId === courseId ? { ...e, completed: true, progress: 100, score } : e));
    const certId = `VEDD-CERT-${Date.now().toString().slice(-5)}`;
    setCertificates(prev => [...prev, { courseId, certId, title: LESSON_CONTENT[courseId]?.assessment.certTitle || course.title, score, date: new Date().toLocaleDateString() }]);
  }

  return (
    <div className="min-h-screen bg-[#080B14] text-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-500/15 border border-indigo-500/30">
              <GraduationCap className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Workforce Academy</h1>
              <p className="text-gray-400 text-sm">AI • Trading • Financial Literacy — certifications aligned with DOL WIOA, NSF, SBA & CDFI grants</p>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Courses Available", value: "12", icon: BookOpen, color: "#6366f1" },
            { label: "Total Enrollments", value: "1,895", icon: Users, color: "#22c55e" },
            { label: "Certs Issued", value: certificates.length + 384, icon: Award, color: "#f59e0b" },
            { label: "Grant Tags", value: "7", icon: Star, color: "#06b6d4" },
          ].map((s, i) => (
            <Card key={i} className="bg-white/[0.03] border-white/10">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}20`, border: `1px solid ${s.color}40` }}>
                  <s.icon className="w-5 h-5" style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-xs text-gray-400">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Tabs */}
        <Tabs defaultValue="catalog">
          <TabsList className="bg-white/[0.05] border border-white/10 mb-6 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="catalog" className="text-xs data-[state=active]:bg-indigo-600/80 data-[state=active]:text-white">Course Catalog</TabsTrigger>
            <TabsTrigger value="progress" className="text-xs data-[state=active]:bg-indigo-600/80 data-[state=active]:text-white">My Progress {enrollments.length > 0 && `(${enrollments.length})`}</TabsTrigger>
            <TabsTrigger value="certificates" className="text-xs data-[state=active]:bg-indigo-600/80 data-[state=active]:text-white">Certificates {certificates.length > 0 && `(${certificates.length})`}</TabsTrigger>
            {isAdmin && <TabsTrigger value="ai-gen" className="text-xs data-[state=active]:bg-indigo-600/80 data-[state=active]:text-white">AI Generator</TabsTrigger>}
          </TabsList>

          {/* ── Catalog ─────────────────────────────────────────────────────── */}
          <TabsContent value="catalog">
            <div className="flex flex-wrap gap-2 mb-5 items-center">
              <div className="flex gap-1.5 flex-wrap">
                {cats.map(cat => (
                  <button key={cat} onClick={() => setCatFilter(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${catFilter === cat ? "bg-indigo-600 border-indigo-500 text-white" : "bg-white/5 border-white/10 text-gray-400 hover:border-white/25"}`}>
                    {catLabels[cat]}
                  </button>
                ))}
              </div>
              <Select value={diffFilter} onValueChange={setDiffFilter}>
                <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 w-36"><SelectValue placeholder="Difficulty" /></SelectTrigger>
                <SelectContent className="bg-[#0f1525] border-white/10">
                  <SelectItem value="all">All levels</SelectItem>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCourses.map(course => (
                <CourseCard key={course.id} course={course}
                  enrolled={enrollments.find(e => e.courseId === course.id)}
                  onEnroll={handleEnroll}
                  onOpenLesson={handleOpenLesson} />
              ))}
            </div>
          </TabsContent>

          {/* ── Progress ─────────────────────────────────────────────────────── */}
          <TabsContent value="progress">
            {enrollments.length === 0 ? (
              <Card className="bg-white/[0.03] border-white/10">
                <CardContent className="p-12 text-center">
                  <GraduationCap className="w-14 h-14 mx-auto mb-4 text-gray-600 opacity-50" />
                  <h3 className="text-lg font-semibold text-white mb-2">No courses yet</h3>
                  <p className="text-gray-400 text-sm">Go to Course Catalog and click "Start Course" to begin learning</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[
                    { label: "Enrolled", value: enrollments.length, color: "#6366f1" },
                    { label: "Completed", value: enrollments.filter(e => e.completed).length, color: "#22c55e" },
                    { label: "Certificates", value: certificates.length, color: "#f59e0b" },
                  ].map((s, i) => (
                    <Card key={i} className="bg-white/[0.03] border-white/10">
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                        <p className="text-xs text-gray-400">{s.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {enrollments.map(en => {
                  const course = COURSES.find(c => c.id === en.courseId);
                  if (!course) return null;
                  const Icon = ICON_MAP[course.icon] || Brain;
                  return (
                    <Card key={en.courseId} className="bg-white/[0.03] border-white/10">
                      <CardContent className="p-4 flex items-start gap-4">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${course.color}20` }}>
                          <Icon size={20} color={course.color} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-semibold text-sm text-white">{course.title}</p>
                            {en.completed
                              ? <Badge className="bg-green-500/20 text-green-400 text-[10px]">Completed</Badge>
                              : <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">In Progress</Badge>}
                          </div>
                          {!en.completed && <Progress value={en.progress} className="h-1.5 mb-2" />}
                          <div className="flex gap-3 text-[10px] text-gray-500">
                            {en.score && <span>Score: <span className="text-green-400">{en.score}%</span></span>}
                            <span>Enrolled {new Date(en.enrolledAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        {!en.completed && (
                          <Button size="sm" className="text-xs h-8 text-white flex-shrink-0" style={{ background: course.color }}
                            onClick={() => handleOpenLesson(en.courseId, en.currentLesson)}>
                            Continue
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Certificates ─────────────────────────────────────────────────── */}
          <TabsContent value="certificates">
            {certificates.length === 0 ? (
              <Card className="bg-white/[0.03] border-white/10">
                <CardContent className="p-12 text-center">
                  <Award className="w-14 h-14 mx-auto mb-4 text-gray-600 opacity-50" />
                  <h3 className="text-lg font-semibold text-white mb-2">No certificates yet</h3>
                  <p className="text-gray-400 text-sm">Complete a course and pass the assessment (70%+) to earn your VEDD certificate</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {certificates.map(cert => (
                  <CertificateCard key={cert.certId} name={name} title={cert.title} certId={cert.certId} score={cert.score} date={cert.date} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── AI Generator ─────────────────────────────────────────────────── */}
          {isAdmin && (
            <TabsContent value="ai-gen">
              <AICurriculumTab />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Lesson Player Modal */}
      <Dialog open={!!lessonOpen} onOpenChange={open => !open && setLessonOpen(null)}>
        <DialogContent className="bg-[#0d1226] border-white/10 max-w-3xl w-full p-0 h-[85vh] flex flex-col">
          {lessonOpen && (
            <LessonPlayer
              courseId={lessonOpen.courseId}
              courseTitle={COURSES.find(c => c.id === lessonOpen.courseId)?.title || ""}
              courseColor={COURSES.find(c => c.id === lessonOpen.courseId)?.color || "#6366f1"}
              initialLesson={lessonOpen.lesson || 1}
              onClose={() => setLessonOpen(null)}
              onComplete={(score) => {
                handleComplete(lessonOpen.courseId, score);
                setLessonOpen(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
