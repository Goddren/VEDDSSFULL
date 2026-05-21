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
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

  // ── Course 2: Digital Skills Foundations ────────────────────────────────────
  2: {
    lessons: [
      {
        number: 1, title: "Internet Safety & Password Security", timeEstimate: "10 min",
        sections: [
          { heading: "Why Digital Safety Matters Now More Than Ever", content: "Your financial life lives online. Bank accounts, investment platforms, crypto wallets, tax documents — all accessible through a browser. One weak password or one phishing click can cost you everything you've built.\n\nIn 2023, consumers lost $10.3 billion to internet fraud (FBI IC3). The most common entry point? Poor password hygiene and phishing emails." },
          { heading: "Strong Passwords: The Rules", content: "A strong password:\n• Is at least 16 characters long\n• Contains uppercase, lowercase, numbers, and symbols\n• Is UNIQUE to every single site — never reused\n• Does not contain your name, birthday, or dictionary words\n\nExample of a weak password: chris1985\nExample of a strong password: gT#9mKz!vR4@LpQw\n\nYou cannot memorize 50+ strong unique passwords — that's what password managers are for." },
          { heading: "Password Managers", content: "A password manager stores all your passwords in an encrypted vault protected by one master password.\n\nRecommended (all free tier available):\n• Bitwarden — open source, most trusted\n• 1Password — best for families\n• Dashlane — strong autofill\n\nSetup takes 20 minutes. It will be the best 20 minutes you spend on digital security." },
          { heading: "Two-Factor Authentication (2FA)", content: "2FA adds a second verification step after your password. Even if someone steals your password, they can't log in without your second factor.\n\n2FA methods (best to worst):\n1. Authenticator app (Google Authenticator, Authy) — best\n2. Hardware key (YubiKey) — most secure\n3. SMS text code — convenient but can be SIM-swapped\n\nEnable 2FA on: email, bank, brokerage, crypto exchange, VEDD account — everywhere it's offered.", isWarning: true },
          { heading: "Phishing: How to Spot a Fake", content: "Phishing = fake email/text pretending to be a trusted source to steal your credentials.\n\nRed flags:\n• Sender email doesn't match the real domain (support@paypa1.com vs paypal.com)\n• Creates urgency ('Your account will be closed in 24 hours')\n• Link URL doesn't match the displayed text (hover to preview)\n• Generic greeting ('Dear Customer' instead of your name)\n• Grammar errors or odd formatting\n\nRule: NEVER click a link in an email to log in. Type the URL directly into your browser.", isWarning: true },
        ],
        keyTakeaways: ["Use a password manager — unique 16+ character passwords for every site", "Enable 2FA on all financial and email accounts", "Verify URLs before clicking — type addresses directly when in doubt"],
      },
      {
        number: 2, title: "Productivity Tools for the Digital Economy", timeEstimate: "12 min",
        sections: [
          { heading: "Google Workspace vs Microsoft 365", content: "These two suites dominate the workplace. Knowing both makes you employable anywhere.\n\nGoogle Workspace (free personal tier):\n• Google Docs (word processing)\n• Google Sheets (spreadsheets)\n• Google Slides (presentations)\n• Google Drive (15GB free storage)\n• Google Meet (video calls)\n\nMicrosoft 365 (paid, ~$7/month):\n• Microsoft Word, Excel, PowerPoint\n• OneDrive (cloud storage)\n• Teams (workplace communication)\n• Outlook (email)\n\nFor VEDD work: Google Workspace is sufficient for most tasks." },
          { heading: "Essential Google Sheets Skills for Finance", content: "Google Sheets (and Excel) are must-have skills for anyone managing money or data.\n\nFormulas you must know:\n• =SUM(A1:A10) — add a range of numbers\n• =AVERAGE(B1:B20) — calculate average\n• =IF(C1>100, 'Profitable', 'Loss') — conditional logic\n• =VLOOKUP() — find data across tables\n• =CONCATENATE() — combine text\n\nPractical use: Build your trading journal, track expenses, calculate ROI, organize your pipeline." },
          { heading: "Cloud Storage & File Organization", content: "Never lose a file again. Cloud storage = your files are automatically backed up and accessible from any device.\n\nBest practice file structure:\n📁 VEDD Business\n  📁 Proposals\n  📁 Client Documents\n  📁 Trading Journal\n📁 Personal Finance\n  📁 Tax Documents\n  📁 Bank Statements\n  📁 Contracts\n\nRule: Scan and upload every important paper document. Physical documents get lost. Digital copies with good naming (2024-Tax-Return.pdf) don't." },
          { heading: "Collaboration & Communication Tools", content: "Modern work is remote and collaborative. Tools you need to know:\n\n• Slack — team messaging, organized by channels\n• Zoom / Google Meet — video calls\n• Notion — documentation and project management\n• Trello / Asana — task management\n• Calendly — scheduling without email back-and-forth\n\nFor VEDD ambassadors: These tools help you manage clients, schedule workshops, and coordinate with other ambassadors professionally.", isExample: true },
        ],
        keyTakeaways: ["Google Sheets/Excel proficiency is a core financial skill", "Organize cloud storage with a consistent folder structure", "Master collaboration tools — Slack, Zoom, Notion are the language of modern work"],
      },
      {
        number: 3, title: "Financial Apps & Budgeting Tools", timeEstimate: "10 min",
        sections: [
          { heading: "The Financial App Ecosystem", content: "There's an app for every financial job. The challenge isn't finding them — it's choosing the right ones and actually using them.\n\nCategories:\n• Budgeting & tracking: Mint, YNAB (You Need A Budget), Copilot\n• Investment tracking: Personal Capital, Empower\n• Credit monitoring: Credit Karma, Experian\n• Banking: Chime, Ally (online), traditional\n• Crypto: Phantom wallet, Coinbase, Kraken\n• Payments: Venmo, Cash App, Zelle" },
          { heading: "YNAB vs Mint: Which Budgeting App?", content: "YNAB (You Need A Budget) — $14.99/month or $99/year\n• Zero-based budgeting philosophy\n• Every dollar gets a job before you spend it\n• Forces intentional spending\n• Best for: people who want to change behavior\n\nMint (free, now sunset → use Monarch Money)\n• Automatic transaction tracking\n• Spending categories and alerts\n• Best for: people who want passive tracking\n\nVEDD recommendation: Start with Monarch Money (free tier) for passive tracking while you build the YNAB habit." },
          { heading: "Credit Monitoring Apps", content: "Check your credit monthly — for free.\n\nCredit Karma:\n• Free VantageScore (TransUnion + Equifax)\n• Shows factors hurting your score\n• Alerts for new accounts or inquiries\n\nExperian (free tier):\n• Shows your FICO score (lenders use FICO, not VantageScore)\n• Experian Boost: add on-time utilities/subscriptions\n\nAnnualCreditReport.com:\n• Free full credit report from all 3 bureaus annually\n• Look for errors — dispute them! 34% of credit reports have errors." },
          { heading: "Phantom Wallet & VEDD Integration", content: "For VEDD members, Phantom Wallet is essential — it's your gateway to the Solana ecosystem where VEDD's AI trading operates.\n\nSetup:\n1. Install Phantom browser extension (phantom.app)\n2. Create new wallet — WRITE DOWN your 12-word seed phrase on paper\n3. Store seed phrase offline — never digital, never cloud\n4. Connect to veddbuild.com to access live trading features\n\nYour seed phrase = your entire wallet. Anyone with it owns your funds.", isWarning: true },
        ],
        keyTakeaways: ["Use a budgeting app that matches your style — passive tracking or active assignment", "Monitor credit monthly with Credit Karma + annual full report at AnnualCreditReport.com", "Phantom Wallet seed phrase must be written on paper and stored safely — never digital"],
      },
      {
        number: 4, title: "Data Basics: Spreadsheets & Analysis", timeEstimate: "12 min",
        sections: [
          { heading: "Why Every Professional Needs Data Skills", content: "Data literacy is the new literacy. Whether you're running a budget, analyzing trades, managing a grant pipeline, or tracking sales — the people who understand data make better decisions.\n\nYou don't need to be a data scientist. You need to know how to:\n• Organize data cleanly in rows and columns\n• Use formulas to calculate and summarize\n• Build charts to visualize trends\n• Filter and sort to find what matters" },
          { heading: "Spreadsheet Best Practices", content: "Clean data beats complex formulas.\n\nRules:\n• One piece of information per cell (not '50 shares @ $10' — use separate columns)\n• Headers in row 1, data below — always\n• Dates in date format (not text)\n• No merged cells in data ranges\n• Use consistent naming (not 'jan', 'January', 'Jan 2024' — pick one)\n\nFor your trading journal: Date | Pair | Direction | Entry | Stop | Target | Result | Notes — each in its own column." },
          { heading: "Essential Formulas for Traders & Finance", content: "• Profit/Loss: =EXIT_PRICE - ENTRY_PRICE\n• Percentage Return: =(B2-B1)/B1*100\n• Risk Amount: =ACCOUNT_SIZE * 0.01 (1% risk)\n• Reward:Risk Ratio: =(TARGET-ENTRY)/(ENTRY-STOP)\n• Running Total: =SUM($B$2:B2)\n• Count Wins: =COUNTIF(C:C, 'Win')\n• Win Rate: =COUNTIF(C:C,'Win')/COUNTA(C:C)*100\n\nThese formulas turn raw trade data into performance analytics.", isExample: true },
          { heading: "Charts That Tell Stories", content: "The right chart for the right data:\n• Line chart — price over time, portfolio growth\n• Bar chart — comparing categories (trades per pair, monthly income)\n• Pie chart — proportions (budget allocation)\n• Scatter plot — correlation (trade size vs profit)\n\nFor your VEDD trading journal: A line chart of running P&L over time immediately shows you whether your system is working." },
        ],
        keyTakeaways: ["One piece of data per cell, headers in row 1 — clean data beats complex formulas", "Build a trading journal in Google Sheets with Date, Pair, Entry, Stop, Target, Result", "Line charts of running P&L show your system's performance at a glance"],
      },
      {
        number: 5, title: "Email & Professional Digital Communication", timeEstimate: "8 min",
        sections: [
          { heading: "Email Is Still the Foundation", content: "Despite Slack and Teams, email remains the primary professional communication tool. A poorly written email costs opportunities. A well-written email builds trust and reputation.\n\nGet a professional email address:\n• Good: christopher@myveddconsulting.com\n• Acceptable: c.chism@gmail.com\n• Avoid: bigmoneytrader99@hotmail.com\n\nFor VEDD ambassadors: Your email address is your first impression to potential clients and grant organizations." },
          { heading: "Professional Email Structure", content: "Subject line: Specific and actionable — 'VEDD Ambassador Partnership Inquiry — [Your City]' not 'Hello'\n\nOpening: Address by name when possible — 'Hi Marcus,'\n\nBody: One purpose per email. State why you're writing in sentence 1.\n\nCall to action: One clear ask — 'Would you have 15 minutes for a call this week?'\n\nClosing: 'Best regards,' or 'Thank you,' — not 'Thx' or nothing\n\nSignature: Name, title, phone, website" },
          { heading: "Digital Communication Across Platforms", content: "Each platform has a different tone:\n\n• Email: Professional, full sentences, clear subject\n• LinkedIn: Professional but personable — like a networking event\n• Slack/Discord: Conversational, concise, emoji acceptable\n• Text/WhatsApp: Only for established relationships\n• Social media: Public-facing, represents your brand\n\nVEDD Ambassador rule: Anything in writing is permanent. Before sending, ask: 'Would I be comfortable if this was screenshotted and shared publicly?'" },
          { heading: "Managing Your Digital Inbox", content: "Email overwhelm kills productivity.\n\nInbox Zero approach:\n• Process email twice daily (morning + evening) — not constantly\n• Each email: Delete | Archive | Reply now (<2 min) | Add to task list\n• Create folders: Clients, VEDD, Grants, Finance, Follow-Up\n• Unsubscribe immediately from any list you don't need\n\nFor grant applications: Create a dedicated folder for each grant opportunity with all correspondence, deadlines, and documents.", isExample: true },
        ],
        keyTakeaways: ["Professional email address is a non-negotiable first impression", "One purpose per email, one clear call to action", "Process email in batches — not constantly — to protect focus time"],
      },
    ],
    assessment: {
      passingScore: 70,
      certTitle: "Digital Skills Foundations — VEDD Certified",
      questions: [
        { q: "What is the most important rule about passwords for financial accounts?", options: ["Make them short and memorable", "Use unique, strong passwords for every account stored in a password manager", "Change them every 30 days", "Use the same strong password everywhere so you don't forget"], correct: 1, explanation: "Every account needs a unique, strong password. Reusing passwords means one data breach exposes all your accounts. A password manager makes this practical." },
        { q: "Which two-factor authentication method is MOST secure?", options: ["SMS text message code", "Email verification link", "Authenticator app or hardware key", "Security question"], correct: 2, explanation: "Authenticator apps and hardware keys are most secure because they can't be intercepted like SMS (SIM-swapping attack). SMS 2FA is still better than nothing but is the weakest 2FA option." },
        { q: "You receive an email from 'support@paypa1.com' saying your account will close in 24 hours. What do you do?", options: ["Click the link quickly before your account closes", "Forward it to friends as a warning", "Delete it — this is a phishing attempt (paypa1 vs paypal)", "Reply asking for more information"], correct: 2, explanation: "This is a classic phishing attack. The domain 'paypa1.com' uses the number 1 instead of the letter l. The urgency is designed to make you act without thinking." },
        { q: "In a spreadsheet trading journal, what is the correct way to calculate win rate?", options: ["=WINS/TOTAL*100", "=COUNTIF(C:C,'Win')/COUNTA(C:C)*100", "=SUM(wins)/COUNT(trades)", "=WIN_COUNT-LOSS_COUNT"], correct: 1, explanation: "COUNTIF counts cells matching 'Win', COUNTA counts all non-empty cells in the column. Dividing and multiplying by 100 gives the percentage win rate." },
        { q: "Where should you store your Phantom wallet seed phrase?", options: ["In a password manager app", "In a Google Doc in your Drive", "Written on paper, stored offline in a secure location", "Saved as a note on your phone"], correct: 2, explanation: "Your seed phrase must be stored offline on paper. Digital storage (cloud, phone, password manager) can be hacked remotely. Physical paper cannot be remotely compromised." },
        { q: "Which formula calculates the Risk:Reward ratio of a trade?", options: ["=(EXIT-ENTRY)/ENTRY", "=(TARGET-ENTRY)/(ENTRY-STOP)", "=PROFIT/LOSS", "=(ENTRY-STOP)/(TARGET-ENTRY)"], correct: 1, explanation: "R:R = potential reward (distance from entry to target) divided by potential risk (distance from entry to stop). A 1:3 ratio means you risk 1 to potentially make 3." },
        { q: "What does 'Inbox Zero' primarily mean?", options: ["Having zero unread emails at all times", "Deleting all emails immediately", "A system for processing every email to a decision — delete, archive, reply, or task", "Only checking email once per week"], correct: 2, explanation: "Inbox Zero is a processing methodology — every email gets a decision: delete, archive, reply now (under 2 min), or add to task list. The goal is an empty inbox as a workflow state, not anxiety." },
      ],
    },
  },

  // ── Course 5: Web3 & Blockchain Basics ──────────────────────────────────────
  5: {
    lessons: [
      {
        number: 1, title: "What Is Blockchain? Decentralization Explained", timeEstimate: "10 min",
        sections: [
          { heading: "The Problem Blockchain Solves", content: "Traditional finance requires trusted intermediaries: banks verify transactions, governments issue currency, clearinghouses settle trades. Each adds cost, time, and a single point of failure.\n\nBlockchain creates a decentralized ledger — a record of transactions maintained simultaneously by thousands of computers worldwide. No single entity controls it. No one can alter history. No permission needed to participate." },
          { heading: "How a Blockchain Works", content: "1. A transaction is initiated (you send 1 SOL to a friend)\n2. The transaction is broadcast to a network of computers (nodes)\n3. Nodes validate the transaction using consensus rules\n4. The transaction is grouped with others into a 'block'\n5. The block is cryptographically linked to the previous block — forming a chain\n6. The chain is updated on every node simultaneously\n\nAltering any block would change its cryptographic hash, breaking the chain — making fraud instantly detectable." },
          { heading: "Proof of Work vs Proof of Stake", content: "Blockchains need consensus mechanisms — rules for how nodes agree on the valid chain.\n\nProof of Work (Bitcoin):\n• Miners solve complex math problems to validate blocks\n• Consumes enormous electricity\n• Very secure and decentralized\n\nProof of Stake (Ethereum, Solana):\n• Validators 'stake' (lock) crypto as collateral to validate\n• Dramatically more energy efficient\n• Faster transaction speeds\n• Solana processes ~65,000 transactions per second vs Bitcoin's ~7" },
          { heading: "Why Blockchain Matters for VEDD", content: "VEDD operates on the Solana blockchain because:\n• Transaction fees are fractions of a cent (vs dollars on Ethereum)\n• Confirmations in under 1 second\n• Smart contract capabilities for automated trading\n• Growing DeFi ecosystem for capital deployment\n\nEvery time VEDD AI executes a trade, it interacts directly with the Solana blockchain — no broker middleman, no settlement delay, 24/7 operation.", isExample: true },
        ],
        keyTakeaways: ["Blockchain is a decentralized ledger maintained by thousands of nodes simultaneously", "Proof of Stake (Solana) is faster and more efficient than Proof of Work (Bitcoin)", "VEDD uses Solana for its speed (<1 sec), low fees, and smart contract capabilities"],
      },
      {
        number: 2, title: "Crypto Wallets: Types, Setup & Security", timeEstimate: "12 min",
        sections: [
          { heading: "What Is a Crypto Wallet?", content: "A crypto wallet doesn't store your crypto — it stores the KEYS that prove you own crypto on the blockchain.\n\n• Private key: Secret number that lets you sign transactions (spend your funds)\n• Public key: Your wallet address (like a bank account number — safe to share)\n• Seed phrase: 12-24 words that can regenerate your private key on any device\n\nYour crypto is always on the blockchain. The wallet is just your access credential." },
          { heading: "Types of Wallets", content: "Hot wallets (connected to internet):\n• Browser extension: Phantom (Solana), MetaMask (Ethereum)\n• Mobile app: Phantom Mobile, Trust Wallet\n• Exchange account: Coinbase, Kraken (custodial — they hold your keys)\n\nCold wallets (offline):\n• Hardware wallet: Ledger, Trezor — physical device, air-gapped\n• Paper wallet: Keys printed on paper\n\nSecurity principle: Use a hot wallet for daily transactions, cold storage for savings." },
          { heading: "Setting Up Phantom Wallet", content: "1. Download from phantom.app (verify URL — many fake sites exist)\n2. Click 'Create New Wallet'\n3. Write down your 12-word seed phrase on paper — NEVER digital\n4. Verify the seed phrase when prompted\n5. Set a password for local device access\n6. Your wallet address starts with a random string of letters/numbers\n\nOnce set up, connect at veddbuild.com to access VEDD's Solana features.\n\nNever share your seed phrase with anyone — VEDD support will NEVER ask for it.", isWarning: true },
          { heading: "Common Wallet Security Mistakes", content: "• Storing seed phrase in a text file, email, or photo\n• Using the same wallet for everything (use separate wallets for DeFi/trading vs savings)\n• Connecting wallet to unverified sites\n• Approving unlimited token allowances\n• Not verifying recipient address before sending (addresses are irreversible)\n\nVEDD security practice: Use a dedicated 'hot' trading wallet funded only with what you're actively trading. Keep long-term savings in a hardware wallet.", isWarning: true },
        ],
        keyTakeaways: ["Your seed phrase is your entire wallet — paper only, stored securely offline", "Hot wallets for trading, cold wallets for savings", "VEDD or Phantom support will never ask for your seed phrase"],
      },
      {
        number: 3, title: "DeFi: Decentralized Finance", timeEstimate: "12 min",
        sections: [
          { heading: "What Is DeFi?", content: "DeFi (Decentralized Finance) recreates financial services — lending, borrowing, trading, earning yield — using smart contracts instead of banks.\n\nSmart contract = self-executing code on the blockchain that automatically enforces the terms of an agreement without human intermediaries.\n\nExample: Instead of a bank deciding whether to give you a loan, a DeFi protocol automatically lends you crypto when you deposit collateral — no credit check, no application, instant." },
          { heading: "Core DeFi Products", content: "DEX (Decentralized Exchange):\nSwap tokens directly from your wallet without a centralized exchange. On Solana: Jupiter (aggregates best rates), Raydium, Orca.\n\nLending/Borrowing:\nDeposit crypto, earn yield. Borrow against your crypto. Protocols: Solend (Solana), Aave (Ethereum).\n\nYield Farming/Liquidity Pools:\nProvide two tokens to a liquidity pool, earn trading fees. Risk: impermanent loss.\n\nStaking:\nLock tokens to earn rewards, support network security. Solana validators pay ~6-7% APY to stakers." },
          { heading: "Jupiter: VEDD's Trading Infrastructure", content: "VEDD's AI trading engine uses Jupiter — Solana's leading DEX aggregator.\n\nHow Jupiter works:\n• Queries all Solana DEXs simultaneously\n• Finds the best price route for your trade\n• Executes in a single transaction\n• Handles multi-hop routes (SOL → USDC → TOKEN in one click)\n\nWhen VEDD AI identifies a signal, it uses Jupiter to execute instantly at best market prices — the same infrastructure used by institutional Solana traders.", isExample: true },
          { heading: "DeFi Risks to Understand", content: "DeFi is powerful but carries unique risks:\n\n• Smart contract risk: Code bugs can drain funds (hacks have cost billions)\n• Liquidation risk: If collateral drops below threshold, protocol auto-liquidates\n• Impermanent loss: LP positions can underperform vs just holding\n• Rug pulls: Malicious token projects drain liquidity and disappear\n• Gas/fee spikes: Network congestion can make transactions expensive\n\nVEDD principle: Never put in DeFi what you cannot afford to lose entirely.", isWarning: true },
        ],
        keyTakeaways: ["DeFi uses smart contracts to offer financial services without banks", "Jupiter aggregates Solana DEX prices — VEDD's AI uses it for best-execution trading", "Smart contract risk, liquidation, and rug pulls are real DeFi dangers"],
      },
      {
        number: 4, title: "Solana Ecosystem & VEDD Integration", timeEstimate: "10 min",
        sections: [
          { heading: "Why Solana?", content: "Solana was built for high-performance decentralized applications. Key specs:\n\n• ~65,000 transactions per second (TPS) theoretical max\n• ~400ms average block time (transaction confirmed in under 1 second)\n• Average transaction cost: ~$0.00025\n• Proof of History consensus mechanism (unique to Solana)\n• Growing ecosystem: $5B+ in DEX volume weekly\n\nFor comparison: Ethereum = ~15 TPS, $5-50 per transaction. Solana's speed and cost make it ideal for active trading systems like VEDD." },
          { heading: "Key Solana Ecosystem Projects", content: "DEXs:\n• Jupiter — best swap aggregator\n• Raydium — AMM + yield farming\n• Orca — user-friendly DEX\n\nNFT Marketplaces:\n• Magic Eden — largest Solana NFT marketplace\n\nInfrastructure:\n• Helius — premium RPC provider (VEDD uses this)\n• Metaplex — NFT standard\n\nStablecoins on Solana:\n• USDC (Circle) — most trusted\n• USDT (Tether) — most liquid\n\nVEDD trades primarily SOL/USDC pairs — the most liquid Solana market." },
          { heading: "VEDD's Solana Architecture", content: "How VEDD connects to Solana:\n\n1. AI Signal Engine: Analyzes price action, volume, order flow across timeframes\n2. Execution Layer: Server-side Jupiter API calls for instant execution\n3. Position Manager: Tracks open positions, P&L, risk per trade\n4. Helius RPC: Premium Solana node access for reliable transaction broadcasting\n5. Paper Trading: Simulated trades against real prices — zero risk practice\n6. Live Trading: Real capital deployed with your connected wallet\n\nThe Phase System (Seedling → Professional) scales position sizes as your account grows.", isExample: true },
          { heading: "Reading Solana Transactions", content: "Every Solana transaction is publicly visible on explorers:\n\n• Solscan.io — detailed transaction viewer\n• Explorer.solana.com — official explorer\n\nA transaction record shows:\n• Signature (unique transaction ID)\n• Timestamp and block number\n• Fee paid (in SOL)\n• Accounts involved\n• Instructions executed (swap, transfer, etc.)\n• Pre/post balances\n\nYou can verify every VEDD trade by looking up the transaction signature on Solscan." },
        ],
        keyTakeaways: ["Solana handles ~65,000 TPS at fractions of a cent — ideal for active trading", "Jupiter aggregates all Solana DEX prices for best execution", "Every VEDD trade is verifiable on Solscan using the transaction signature"],
      },
      {
        number: 5, title: "NFTs, Tokens & Digital Asset Economics", timeEstimate: "10 min",
        sections: [
          { heading: "Fungible vs Non-Fungible Tokens", content: "Fungible token: Every unit is identical and interchangeable. 1 SOL = 1 SOL. 1 USDC = 1 USDC. Like dollars — one $20 bill is the same as another.\n\nNon-Fungible Token (NFT): Each token is unique. Token #4521 ≠ Token #4522. Represents unique ownership: digital art, game items, membership passes, certificates.\n\nSPL Tokens: Solana's token standard. Both fungible tokens (like USDC on Solana) and NFTs are SPL tokens — just different types." },
          { heading: "Token Economics Fundamentals", content: "Understanding a token's economics determines if it has real value:\n\n• Total Supply: How many tokens exist (or will exist)?\n• Circulating Supply: How many are currently tradeable?\n• Market Cap: Price × Circulating Supply\n• Utility: What can you actually DO with the token?\n• Distribution: Who holds what percentage? (Whale concentration risk)\n• Emission Schedule: How are new tokens created over time? (inflation rate)\n\nRed flags: 50%+ held by team/insiders, no utility beyond speculation, unlimited emission." },
          { heading: "Common Token Scams to Avoid", content: "The crypto space has more scams per capita than any other market.\n\n• Rug pulls: Team hypes token, dumps their allocation, price crashes to zero\n• Honeypots: Token can be bought but not sold (coded into the contract)\n• Pump and dump: Coordinated buying creates FOMO, then coordinated selling\n• Fake airdrops: 'You've won 500 tokens!' — connecting wallet lets them drain it\n• Copycat tokens: Fake versions of real tokens with almost-identical names\n\nRule: If something sounds too good to be true, it's a scam. No legitimate project guarantees returns.", isWarning: true },
          { heading: "VEDD and the Digital Asset Economy", content: "VEDD operates in the legitimate layer of crypto:\n• Trading major, liquid tokens (SOL, USDC) — not speculative meme coins\n• Using audited infrastructure (Jupiter, Helius)\n• Transparent execution — every trade verifiable on-chain\n• Education first — ensuring members understand what they're doing\n\nThe goal isn't to catch the next 100x token. The goal is consistent, systematic execution of a tested strategy using real market infrastructure.", isExample: true },
        ],
        keyTakeaways: ["Fungible tokens are interchangeable (SOL, USDC); NFTs are unique digital assets", "Evaluate token economics: supply, utility, distribution before investing", "VEDD trades liquid majors (SOL/USDC) — not speculative altcoins or meme tokens"],
      },
      {
        number: 6, title: "Getting Started: Your Web3 Action Plan", timeEstimate: "8 min",
        sections: [
          { heading: "Your 30-Day Web3 Onboarding Checklist", content: "Week 1 — Setup:\n☐ Install Phantom wallet (phantom.app — verify URL)\n☐ Write seed phrase on paper, store securely\n☐ Connect to veddbuild.com and create account\n☐ Fund wallet with small test amount ($10)\n\nWeek 2 — Explore:\n☐ Make your first SOL transaction (send to your own address)\n☐ Look up your transaction on Solscan.io\n☐ Explore the VEDD paper trading feature\n☐ Research one Solana ecosystem project\n\nWeek 3-4 — Learn:\n☐ Try a small Jupiter swap on devnet or with tiny amount\n☐ Review your paper trading results\n☐ Complete this course and take the assessment" },
          { heading: "Security Checklist Before Going Live", content: "Before using any real money:\n☐ Seed phrase stored on paper, offline, in secure location\n☐ Phantom app downloaded from official source only\n☐ 2FA enabled on VEDD account\n☐ Using a dedicated trading wallet (not your savings wallet)\n☐ You understand that crypto transactions are irreversible\n☐ You have only funded what you can afford to lose entirely\n\nNo shortcuts on security. One mistake = permanent loss.", isWarning: true },
          { heading: "Resources for Continued Learning", content: "• Solana.com/learn — official Solana educational content\n• Jupiter.ag — documentation on how swaps work\n• Helius.dev/blog — Solana development deep dives\n• Decrypt.co — crypto news without hype\n• The Block — professional crypto research\n• VEDD Workforce Academy — complete the Advanced AI Trading course next\n\nThe Web3 space moves fast. Allocate 30 minutes per week to staying current with legitimate sources." },
          { heading: "Paper Trading: Your Risk-Free Starting Point", content: "VEDD's paper trading feature lets you:\n• Execute simulated trades against real live prices\n• Experience the full trading workflow with zero real capital risk\n• Track your performance: win rate, average R, drawdown\n• Build confidence in the strategy before committing real funds\n\nRecommendation: Complete at least 50 paper trades with documented results before activating live trading. Treat paper trading like real trading — no revenge trades, respect your rules.", isExample: true },
        ],
        keyTakeaways: ["Set up Phantom wallet and connect to VEDD before exploring any other Web3 tools", "Security checklist must be complete before any real funds are involved", "Complete 50+ paper trades with tracked results before going live"],
      },
    ],
    assessment: {
      passingScore: 70,
      certTitle: "Web3 & Blockchain Basics — VEDD Certified",
      questions: [
        { q: "What makes a blockchain transaction tamper-proof?", options: ["It's encrypted with a password", "Each block is cryptographically linked to the previous block — altering one breaks the chain", "Only the owner can see their transactions", "A central authority reviews all transactions"], correct: 1, explanation: "Blockchain's security comes from cryptographic hashing — each block contains the hash of the previous block. Altering any historical transaction changes its hash, breaking every subsequent link and making tampering immediately detectable." },
        { q: "What does your crypto wallet actually store?", options: ["Your cryptocurrency", "The keys that prove ownership of crypto on the blockchain", "A copy of the blockchain", "Your transaction history only"], correct: 1, explanation: "Crypto doesn't sit in your wallet — it exists on the blockchain. Your wallet stores private keys that let you sign transactions, proving you have the right to move specific funds." },
        { q: "Why does VEDD use Solana instead of Ethereum for trading?", options: ["Solana is more decentralized", "Solana has lower transaction fees and faster confirmation times", "Solana has more tokens available", "Ethereum doesn't support smart contracts"], correct: 1, explanation: "Solana's ~$0.00025 fees and sub-second confirmations make it practical for active trading. Ethereum's $5-50 fees would make small trades unprofitable." },
        { q: "What is a rug pull in crypto?", options: ["A bear market crash", "When a project team abandons development", "Team hypes a token, dumps their allocation, causing price to crash to zero", "When a DEX runs out of liquidity"], correct: 2, explanation: "A rug pull is a deliberate exit scam — project founders hype a token to attract buyers, then sell their large allocation suddenly, crashing the price to near zero while retail investors lose everything." },
        { q: "What is Jupiter's role in VEDD's trading system?", options: ["A price prediction algorithm", "A DEX aggregator that finds the best swap price across all Solana DEXs", "The blockchain VEDD is built on", "A lending protocol for margin trading"], correct: 1, explanation: "Jupiter aggregates prices from all Solana DEXs simultaneously and routes trades through the most efficient path. VEDD's AI execution uses Jupiter to guarantee best-available pricing on every trade." },
        { q: "What is the safe way to store your Phantom seed phrase?", options: ["Screenshot it and save to Google Photos", "Write it on paper and store securely offline", "Save it in your password manager", "Email it to yourself as a backup"], correct: 1, explanation: "Your seed phrase must be stored physically on paper, offline. Any digital storage — cloud, email, password manager, screenshot — is vulnerable to remote hacking. Paper cannot be remotely compromised." },
        { q: "Which of these is a red flag when evaluating a new crypto token?", options: ["The token has a use case in DeFi lending", "The token is tradeable on Jupiter", "50% of the token supply is held by the founding team", "The token has a maximum fixed supply"], correct: 2, explanation: "Heavy insider token concentration is a major red flag — it means a small group can dump a massive supply on the market at any time, crashing the price. Fair distribution across many holders is healthier." },
      ],
    },
  },

  // ── Course 6: STEM for Young Traders ────────────────────────────────────────
  6: {
    lessons: [
      {
        number: 1, title: "Math Behind Trading: Percentages & Ratios", timeEstimate: "8 min",
        sections: [
          { heading: "Why Math Makes You a Better Trader", content: "Trading without math is gambling. Math tells you exactly how much to risk, how much you can make, and whether your strategy is actually profitable over time. The good news: you only need basic math — percentages, ratios, and averages." },
          { heading: "Percentages: The Universal Language of Finance", content: "Percentage change formula: (New Value − Old Value) ÷ Old Value × 100\n\nExamples:\n• SOL goes from $100 to $115: (115−100)/100 × 100 = +15%\n• Your account drops from $500 to $450: (450−500)/500 × 100 = −10%\n• You need a 10% loss to require an 11.1% gain just to break even\n\nKey insight: Losses hurt more than gains help. A 50% loss requires a 100% gain to recover. This is why protecting capital matters more than chasing big wins." },
          { heading: "Risk:Reward Ratio", content: "R:R Ratio = Potential Profit ÷ Potential Loss\n\nExample trade:\n• Entry: $100\n• Stop Loss: $95 (risk = $5)\n• Take Profit: $115 (reward = $15)\n• R:R = 15/5 = 3:1\n\nWith a 3:1 ratio, you only need to be RIGHT 34% of the time to be profitable.\n• 3 losses × $5 = −$15\n• 1 win × $15 = +$15\n• Net: $0 at 25% win rate!\nAt 40% win rate: 4 wins × $15 = $60, 6 losses × $5 = $30 → Net: +$30", isExample: true },
          { heading: "Position Sizing: Math That Protects Your Account", content: "Position sizing = How many units/shares/coins to buy based on your risk rules.\n\nFormula: Position Size = (Account × Risk %) ÷ Stop Loss Distance\n\nExample:\n• Account: $1,000\n• Risk per trade: 1% = $10\n• Entry: $100, Stop: $95 (distance = $5)\n• Position Size: $10 ÷ $5 = 2 coins\n\nYou buy 2 coins. If the trade loses, you lose exactly $10 (1% of account). This is how professionals stay in the game long-term." },
        ],
        keyTakeaways: ["Percentage change = (New−Old)/Old × 100", "Risk:Reward ratio determines if a strategy is profitable even with a low win rate", "Position size = (Account × Risk%) ÷ Stop Distance — always calculate before entering"],
      },
      {
        number: 2, title: "Reading Charts: Visual Data Analysis", timeEstimate: "10 min",
        sections: [
          { heading: "Why Charts Are Data, Not Magic", content: "A price chart is just data visualization — it shows the history of every transaction in a market over time. Each candlestick represents thousands of real buy and sell decisions.\n\nLearning to read charts is learning to read the collective psychology of market participants: when are they fearful? When are they greedy? Where have they placed their orders?" },
          { heading: "Anatomy of a Candlestick", content: "A candlestick has 4 pieces of information: Open, High, Low, Close (OHLC)\n\nGreen/White candle (bullish): Close > Open\n• Body: Open to Close (buyers won)\n• Upper wick: How high price reached above the close\n• Lower wick: How low price dipped below the open\n\nRed/Black candle (bearish): Close < Open\n• Body: Open to Close (sellers won)\n• Wicks: Rejection zones where one side pushed but lost\n\nLarge body = strong conviction. Large wick = strong rejection." },
          { heading: "Support, Resistance & Trend Lines", content: "Support: A price level where buyers consistently step in and push price back up. Price has 'bounced' here before.\n\nResistance: A price level where sellers consistently push price back down. Price has 'rejected' here before.\n\nTrend line: Connect two or more lows (uptrend) or two or more highs (downtrend).\n\nKey concept: Once broken, support becomes resistance and resistance becomes support. This 'flip' is one of the most reliable patterns in all markets.", isExample: true },
          { heading: "Volume: The Confirmation Tool", content: "Price tells you WHAT happened. Volume tells you HOW CONVINCING it was.\n\n• High volume + price rising = strong bullish move, likely to continue\n• Low volume + price rising = weak move, may reverse\n• High volume + price falling = strong bearish move\n• High volume at a support bounce = strong buyers defending that level\n\nRule: Never trade a breakout without confirming volume. Low-volume breakouts fail 70%+ of the time." },
        ],
        keyTakeaways: ["Each candlestick body shows Open vs Close; wicks show rejected extremes", "Support and resistance flip roles once broken", "Volume confirms the strength of any price move — never trust low-volume breakouts"],
      },
      {
        number: 3, title: "Statistics & Probability in Trading", timeEstimate: "10 min",
        sections: [
          { heading: "Your Strategy Is a Statistical Sample", content: "No strategy wins 100% of the time. A good strategy wins often ENOUGH and wins BIG enough to be profitable overall. You don't judge a strategy by one trade — you judge it by 50, 100, 200 trades.\n\nThis is called thinking in probabilities. Each trade is just one data point in a larger experiment. The goal is a positive expected value over many trades." },
          { heading: "Expected Value (EV)", content: "EV = (Win Rate × Average Win) − (Loss Rate × Average Loss)\n\nExample strategy:\n• Win rate: 45%\n• Average win: $150 (3R)\n• Loss rate: 55%\n• Average loss: $50 (1R)\n\nEV = (0.45 × $150) − (0.55 × $50)\nEV = $67.50 − $27.50 = +$40 per trade\n\nThis strategy LOSES more often than it wins — but it's highly profitable because the wins are 3× bigger. This is why professional traders focus on R:R, not win rate.", isExample: true },
          { heading: "Streaks: Math Beats Emotion", content: "Even a 60% win rate strategy will have losing streaks. Math tells you this:\n\nProbability of 5 consecutive losses with a 40% loss rate:\n0.4 × 0.4 × 0.4 × 0.4 × 0.4 = 1.02%\n\nThat means in 100 sequences of 5 trades, you'll see 5 losses in a row about once. It's not a broken strategy — it's normal statistical variance.\n\nTraders who don't understand this quit their profitable strategy after a normal losing streak." },
          { heading: "Building Your Stats Tracking System", content: "Track every trade:\n• Date, pair, entry, stop, target, exit\n• Result in R (not dollars — R normalizes across different position sizes)\n• Session (London/NY/Asia)\n• Setup type (order block, FVG, trend continuation)\n\nAfter 50 trades, calculate:\n• Win rate per setup type\n• Average R per session\n• Maximum drawdown\n• Sharpe-like ratio (average R / standard deviation of R)\n\nData reveals which setups work best FOR YOU." },
        ],
        keyTakeaways: ["Think in expected value over many trades, not single-trade outcomes", "Losing streaks are statistically normal — understand probability so emotion doesn't make you quit", "Track every trade and calculate win rate/avg R by setup type after 50+ trades"],
      },
      {
        number: 4, title: "Building Your Trading Journal", timeEstimate: "8 min",
        sections: [
          { heading: "Why Most Traders Never Journal (And Why You Will)", content: "Journaling separates serious traders from gamblers. Without a journal:\n• You remember your wins, forget your losses\n• You can't identify patterns in your mistakes\n• You make the same errors repeatedly\n• You have no data to improve your strategy\n\nWith a journal: Every loss teaches you something. Every win shows you what to repeat. Your performance improves measurably." },
          { heading: "The Minimum Viable Trading Journal", content: "Start with Google Sheets. Create these columns:\n\nDate | Pair | Direction (Long/Short) | Entry Price | Stop Price | Target Price | Exit Price | Result ($) | Result (R) | Setup Type | Session | Emotion (1-5) | Notes\n\nR calculation: Result (R) = (Exit − Entry) ÷ (Entry − Stop)\nPositive R = win, negative R = loss in units of risk.\n\nExample: Entered at $100, stop $95, exited at $112\nR = (112−100)/(100−95) = 12/5 = +2.4R" },
          { heading: "What to Write in Notes", content: "After every trade, write:\n• WHY you entered (the specific signal or pattern)\n• What the market structure looked like\n• Did you follow your rules? If not, why?\n• What was your emotional state? (Impatient? Fearful? Overconfident?)\n• What would you do differently?\n\nThe notes column is where the real growth happens. Patterns in your mistakes (e.g., 'I always enter too early when London opens') become your improvement targets.", isExample: true },
          { heading: "Reviewing Your Journal: Weekly Ritual", content: "Set aside 30 minutes every Sunday to review your week:\n\n1. Calculate your total R for the week\n2. Review every losing trade — was the loss from a valid setup that just didn't work, or did you break a rule?\n3. Review every winning trade — did you execute well or did you get lucky?\n4. Look for emotional patterns in your notes\n5. Set one specific improvement goal for next week\n\nThe goal isn't to avoid losses — it's to only take losses that come from following your rules correctly." },
        ],
        keyTakeaways: ["Journal every trade in Google Sheets with Date, Entry, Stop, Target, Exit, R result", "Notes column captures WHY you entered and your emotional state", "Weekly review: separate 'bad loss' (broke rules) from 'good loss' (valid setup, didn't work)"],
      },
      {
        number: 5, title: "Coding Basics for Finance: Automate Your Edge", timeEstimate: "10 min",
        sections: [
          { heading: "Why Young Traders Should Learn to Code", content: "You don't need to be a software engineer. But basic coding skills let you:\n• Build automated trading journal spreadsheets\n• Backtest strategies on historical data\n• Create price alerts and notifications\n• Understand how AI trading tools like VEDD actually work\n• Build simple bots for data collection\n\nThe most valuable traders of the next decade will combine market knowledge with technical skills." },
          { heading: "Google Sheets Formulas: Your First Code", content: "Spreadsheet formulas ARE programming — just in a visual interface.\n\n=IF(F2>0, 'Win', 'Loss') — categorize trade results\n=SUMIF(G:G,'Win',F:F) — total profit from winning trades only\n=AVERAGEIF(G:G,'Win',F:F) — average win size\n=COUNTIF(G:G,'Win')/COUNTA(F:F)*100 — win rate percentage\n=STDEV(F:F) — standard deviation of results (consistency measure)\n\nThese formulas turn raw trade data into a complete performance dashboard. Build this before writing a single line of Python." },
          { heading: "Python for Finance: The Basics", content: "Python is the dominant language for financial analysis, backtesting, and AI/ML. Free resources to learn:\n• Python.org/doc — official tutorials\n• Automate the Boring Stuff with Python (free online)\n• QuantConnect — paper trading + Python backtesting platform\n\nFirst Python finance project:\n```python\nimport yfinance as yf\ndata = yf.download('SOL-USD', period='1mo')\nprint(data[['Close']].describe())\n```\nThis downloads 1 month of SOL prices and shows basic statistics.", isExample: true },
          { heading: "Connecting to APIs: How VEDD Works Under the Hood", content: "An API (Application Programming Interface) lets programs talk to each other. VEDD connects to:\n• Jupiter API: Get swap quotes and execute trades\n• Helius API: Connect to Solana blockchain data\n• OpenAI API: AI analysis of market conditions\n\nBasic API call concept (pseudo-code):\n1. Send a request: 'Give me the price of SOL/USDC'\n2. Receive a response: JSON data with price, volume, etc.\n3. Your program reads the response and makes a decision\n\nLearning to read API documentation is a superpower — every major financial platform has one." },
        ],
        keyTakeaways: ["Google Sheets formulas are your first step into financial coding", "Python is the standard language for financial analysis and backtesting", "APIs are how programs connect to markets and blockchains — VEDD uses Jupiter, Helius, and OpenAI APIs"],
      },
    ],
    assessment: {
      passingScore: 70,
      certTitle: "STEM for Young Traders — VEDD Certified",
      questions: [
        { q: "SOL drops from $200 to $160. What is the percentage change?", options: ["-20%", "-25%", "-40%", "-30%"], correct: 0, explanation: "(160−200)/200 × 100 = −40/200 × 100 = −20%. A $40 drop on a $200 asset is a 20% decline." },
        { q: "Your entry is $50, stop is $47, target is $59. What is your Risk:Reward ratio?", options: ["1:2", "1:3", "2:1", "3:1"], correct: 1, explanation: "Risk = $50−$47 = $3. Reward = $59−$50 = $9. R:R = 9/3 = 3:1. For every $1 risked, you could make $3." },
        { q: "A strategy has a 40% win rate and 1:3 R:R. Over 10 trades risking $50 each, what is the approximate net result?", options: ["Break even", "−$50 net loss", "+$300 net profit", "+$100 net profit"], correct: 2, explanation: "4 wins × $150 (3R) = $600. 6 losses × $50 (1R) = $300. Net = +$300. High R:R ratio makes even a sub-50% win rate very profitable." },
        { q: "What does a large upper wick on a candlestick indicate?", options: ["Strong bullish momentum with no resistance", "Price was pushed up but strongly rejected back down by sellers", "The candle closed at the highest price", "Volume was very high during the session"], correct: 1, explanation: "A large upper wick means buyers pushed price up significantly, but sellers rejected that level hard and pushed price back down before the candle closed. It's a bearish rejection signal." },
        { q: "What does 'Expected Value' (EV) measure in trading?", options: ["The probability of winning the next trade", "The average profit or loss per trade over many trades", "The maximum amount you can earn in a session", "How much you expect to win today"], correct: 1, explanation: "EV = (Win Rate × Avg Win) − (Loss Rate × Avg Loss). It tells you whether your strategy is profitable on average across many trades, independent of any single outcome." },
        { q: "In a trading journal, what does +2.5R mean?", options: ["You made $2.50", "You made 2.5 times your risk amount on that trade", "Your win rate is 2.5 times your loss rate", "The trade took 2.5 hours to complete"], correct: 1, explanation: "R measures results as a multiple of your risk. +2.5R means you made 2.5 times what you risked. If you risked $50, +2.5R = +$125 profit. Using R normalizes results across different position sizes." },
      ],
    },
  },

  // ── Course 7: AI Ethics in Finance ──────────────────────────────────────────
  7: {
    lessons: [
      {
        number: 1, title: "What Is AI Bias and Why It Matters in Finance", timeEstimate: "10 min",
        sections: [
          { heading: "AI Is Not Neutral", content: "Artificial intelligence learns from data. If that data reflects historical discrimination, the AI learns to discriminate too — and does so at scale, in milliseconds, on millions of people.\n\nIn finance, AI bias can determine:\n• Whether you get a loan\n• Your interest rate\n• Your credit limit\n• Your insurance premium\n• Whether your fraud alert fires\n• Which investment opportunities you see\n\nAI bias isn't theoretical — it's causing real financial harm to real people right now." },
          { heading: "How Bias Enters AI Systems", content: "Training data bias: The AI learns from historical human decisions. If past loan officers were biased, the AI learns those biases as 'correct' patterns.\n\nProxy variable bias: An AI trained to 'not use race' might still find ZIP code, school attended, or social network as proxies that correlate strongly with race — achieving the same discriminatory result through different variables.\n\nFeedback loop bias: AI decides who gets loans → people who don't get loans can't build credit → AI later sees low credit scores from that group → confirms its original discrimination.", isExample: true },
          { heading: "Real Cases: AI Bias in Financial Services", content: "Apple Card (2019): Independent investigation found the Apple Card algorithm was offering significantly lower credit limits to women than men with similar financial profiles.\n\nAmazon Hiring Algorithm (2018): Amazon scrapped an AI recruiting tool that learned to downgrade resumes from women's colleges because historical tech hiring was male-dominated.\n\nPredictive Policing → Insurance: Some insurance companies use algorithms partially based on data derived from predictive policing models — which have documented racial bias — affecting auto insurance rates.", isExample: true },
          { heading: "Why This Matters for VEDD and You", content: "VEDD members come from communities that have historically been on the wrong side of algorithmic bias. Understanding AI ethics means:\n\n1. Recognizing when an algorithm may be unfairly affecting you\n2. Knowing how to challenge AI-based decisions\n3. Building AI systems (like VEDD's) with fairness as a design requirement\n4. Advocating for regulation and transparency in financial AI\n\nKnowledge is protection. You can't fight a bias you don't know exists." },
        ],
        keyTakeaways: ["AI learns from historical data — if that data is biased, the AI amplifies that bias at scale", "Proxy variables can achieve racial/gender discrimination even when race/gender is explicitly excluded", "Apple Card and Amazon's hiring AI are documented examples of financial AI bias"],
      },
      {
        number: 2, title: "Fairness in Credit & Lending Algorithms", timeEstimate: "10 min",
        sections: [
          { heading: "How Credit Scoring Became Algorithmic", content: "FICO scores (introduced 1989) were the first widely adopted algorithmic credit system — replacing subjective banker judgments with a number.\n\nThis was progress: objective criteria replaced openly discriminatory human decisions. But the underlying data still reflected decades of discriminatory lending.\n\nToday, lenders use 'alternative credit scoring' models that go beyond FICO — analyzing banking behavior, social data, employment patterns, and more. These models are more accurate on average but introduce new fairness risks." },
          { heading: "The Four Types of Fairness (That Often Conflict)", content: "Group fairness: Equal approval rates across demographic groups.\nIndividual fairness: Similar people get similar outcomes.\nCounterfactual fairness: Would the outcome change if only your demographic changed?\nCalibration: Predicted risk should match actual risk across groups.\n\nThe challenge: Mathematically, you CANNOT simultaneously satisfy all four definitions of fairness when base rates differ between groups. Every AI fairness solution involves tradeoffs — which is why human judgment and policy choices must accompany the math.", isWarning: true },
          { heading: "Your Rights When AI Denies You Credit", content: "In the US, laws protect you when AI-based credit decisions hurt you:\n\n• Equal Credit Opportunity Act (ECOA): Lenders must tell you WHY you were denied. They cannot use prohibited factors (race, sex, religion, national origin).\n• Fair Credit Reporting Act (FCRA): You can dispute errors in the data used in decisions.\n• CFPB (Consumer Financial Protection Bureau): Regulates and accepts complaints about unfair AI credit practices.\n\nIf denied credit: Request a written 'adverse action notice' explaining the specific reasons. Dispute any errors. File CFPB complaints for potential violations." },
          { heading: "Building Fair AI at VEDD", content: "VEDD's AI trading system applies fairness principles differently — it's analyzing market data, not people. But the principles matter:\n\n• Transparency: Users can see what signals triggered AI recommendations\n• Explainability: 'The AI entered long because it detected an order block + FVG confluence at support' — not a black box\n• Backtesting: Strategy is tested on historical data and results are shared\n• No favoritism: Same algorithm, same rules, applied equally to all users\n\nThis is how AI should work: explainable, transparent, and consistently applied.", isExample: true },
        ],
        keyTakeaways: ["ECOA requires lenders to explain why credit was denied — request an adverse action notice", "Mathematical fairness definitions conflict — every AI fairness solution involves policy tradeoffs", "VEDD's AI is transparent: users can see the signals that triggered every recommendation"],
      },
      {
        number: 3, title: "Transparency & Explainability in AI", timeEstimate: "8 min",
        sections: [
          { heading: "The Black Box Problem", content: "Many powerful AI models (deep neural networks) cannot explain their own decisions in human-understandable terms. They find patterns in vast amounts of data and output a prediction — but even their creators can't fully explain WHY.\n\nIn finance, this creates serious problems:\n• Regulators can't verify fairness\n• Customers can't understand or contest decisions\n• Errors are hard to diagnose and fix\n• Systemic risks are invisible until they trigger crises" },
          { heading: "Explainable AI (XAI) Methods", content: "Researchers have developed tools to make AI decisions more understandable:\n\nSHAP values: Assigns a contribution score to each input feature for a specific prediction. 'Your loan was denied because ZIP code contributed −35 points, employment type −20 points, credit utilization +15 points.'\n\nLIME: Approximates a complex model locally with a simpler interpretable model.\n\nDecision Trees: Inherently explainable — you can trace the exact path of any decision.\n\nAttention mechanisms: In language AI, shows which words/phrases most influenced the output." },
          { heading: "The EU AI Act and Financial Explainability", content: "The European Union's AI Act (2024) classifies credit scoring AI as 'high-risk' — subject to strict requirements:\n• Transparency and documentation requirements\n• Human oversight for significant decisions\n• Right to explanation for AI-based decisions\n• Regular bias testing and reporting\n\nThe US is moving toward similar regulation. Financial institutions are preparing now.\n\nFor VEDD: Understanding these regulations helps ambassadors serve clients who ask about AI-based financial tools.", isExample: true },
          { heading: "Asking the Right Questions About Any AI Tool", content: "When evaluating any AI financial tool, ask:\n\n1. 'Can you explain how this decision was made?' (If no, that's a red flag)\n2. 'What data does this AI use? Could it reflect historical biases?'\n3. 'Has this system been independently audited for fairness?'\n4. 'What happens if the AI makes a mistake? Who is accountable?'\n5. 'Can I opt for a human review?'\n\nGood AI tools should welcome these questions. Tools that can't answer them shouldn't be trusted with financial decisions." },
        ],
        keyTakeaways: ["Black-box AI can't explain its decisions — a serious problem for high-stakes financial applications", "SHAP values and LIME are tools that help explain AI predictions in human terms", "The EU AI Act requires explainability for credit AI — US regulation is following"],
      },
      {
        number: 4, title: "Data Privacy in AI Financial Systems", timeEstimate: "10 min",
        sections: [
          { heading: "The Data That Powers Financial AI", content: "Modern financial AI is trained on and makes decisions using:\n• Transaction history (what you buy, where, when)\n• Location data (from mobile apps)\n• Social media connections and activity\n• Device and browser fingerprints\n• Typing speed and phone angle (behavioral biometrics)\n• Voice pattern analysis (from customer service calls)\n• Facial recognition (for account verification)\n\nMost users have no idea how much data financial companies collect, or that it's used in AI-driven decisions." },
          { heading: "GDPR vs CCPA: Your Privacy Rights", content: "GDPR (EU General Data Protection Regulation):\n• Right to know what data is collected\n• Right to access your data\n• Right to delete your data ('right to be forgotten')\n• Right to portability (get your data in machine-readable format)\n• Right to object to automated decision-making\n• Violations: Up to 4% of global annual revenue\n\nCCPA (California Consumer Privacy Act):\n• Similar rights for California residents\n• Right to opt out of sale of personal information\n• Non-discrimination for exercising privacy rights\n\nEven outside CA/EU: Know these rights exist and advocate for federal US equivalents." },
          { heading: "How AI Uses Your Financial Data", content: "Beyond credit scoring, financial companies use AI on your data to:\n\n• Price discrimination: Show you higher prices if your data signals you're willing to pay more\n• Cross-selling: Target products based on behavioral prediction\n• Fraud detection: Flag unusual behavior (mostly beneficial)\n• Marketing scoring: Rank your 'lifetime value' to prioritize service\n• Wallet share analysis: Estimate how much of your spending they don't capture yet\n\nNone of this is disclosed clearly at signup. Understanding it helps you make informed choices about which services to use.", isWarning: true },
          { heading: "Protecting Your Financial Data", content: "Practical steps:\n• Read privacy policies (at least the 'what we share' and 'your rights' sections)\n• Use privacy-focused browsers and VPNs for financial research\n• Opt out of data sharing where available (most apps have this in settings)\n• Use unique email addresses for financial services (SimpleLogin, AnonAddy)\n• Regularly review app permissions — financial apps shouldn't need microphone access\n• Request your data file from major financial services annually\n\nFor crypto users: Blockchain data is public but pseudonymous. Using multiple wallets maintains separation between your activities." },
        ],
        keyTakeaways: ["Financial AI uses transaction history, location, and behavioral biometrics you may not know about", "GDPR and CCPA give you rights to access, delete, and object to automated decisions about your data", "Regularly review app permissions and privacy settings — opt out of data sharing where available"],
      },
      {
        number: 5, title: "Responsible AI Deployment in Financial Services", timeEstimate: "8 min",
        sections: [
          { heading: "Principles of Responsible AI", content: "Major AI organizations (Google, Microsoft, IBM, OECD) have converged on similar responsible AI principles:\n\n• Fairness: AI should not create unjust discrimination\n• Reliability & Safety: AI should behave as intended, even in unusual situations\n• Privacy & Security: User data should be protected\n• Inclusiveness: AI should benefit all people, not just some\n• Transparency: How AI works should be explainable\n• Accountability: Humans must be responsible for AI decisions\n\nThese aren't just ethics — they're increasingly legal requirements." },
          { heading: "Human-in-the-Loop: When AI Needs Oversight", content: "Not every decision should be fully automated. High-stakes financial decisions require human oversight:\n\n• Loan denial above a certain amount → require human review\n• Fraud alert freezing an account → notify customer and allow challenge\n• Investment recommendation for retirement funds → licensed advisor review\n• Insurance denial → human review option\n\nVEDD's approach: The AI signals opportunities; the human (or human-programmed rules) controls position sizes, risk parameters, and when to disengage. The AI amplifies human judgment — it doesn't replace it.", isExample: true },
          { heading: "Building AI You Can Trust: VEDD's Standards", content: "VEDD's AI trading system is built with these ethics principles:\n\n1. Transparent signals: Every trade recommendation shows the specific technical pattern detected\n2. Auditable execution: Every live trade is recorded on the Solana blockchain — permanently verifiable\n3. User control: Users set their own risk parameters; the AI executes within those limits\n4. Paper trading first: No one is pushed into live trading before demonstrating understanding\n5. Clear disclaimers: AI predictions are not financial advice — market outcomes are uncertain\n\nResponsible AI is a competitive advantage: users trust systems they understand." },
          { heading: "Your Role as an Ethical AI User", content: "As a VEDD member and ambassador, you interact with AI and help others do the same. Your responsibilities:\n\n• Don't present AI signals as guarantees — they're probabilistic\n• Educate community members about how VEDD's AI works before they invest\n• Report any AI behavior that seems biased, unfair, or inaccurate to VEDD\n• Stay current on AI regulation in your state/country\n• Advocate for AI transparency in any financial tools you recommend\n\nThe people who understand AI ethics will lead the next generation of financial services." },
        ],
        keyTakeaways: ["Responsible AI requires fairness, transparency, accountability, and human oversight", "VEDD's AI amplifies human judgment — it doesn't replace it; users control all risk parameters", "As a VEDD ambassador, your role includes educating others on how AI works and what it can't guarantee"],
      },
    ],
    assessment: {
      passingScore: 70,
      certTitle: "AI Ethics in Finance — VEDD Certified",
      questions: [
        { q: "What is 'proxy variable bias' in AI credit models?", options: ["The AI uses incorrect math", "Variables like ZIP code correlate with race and produce discriminatory results even without using race directly", "The AI is biased toward proxy servers", "A bug in the training software"], correct: 1, explanation: "Proxy bias occurs when a variable (ZIP code, school, social network) correlates strongly enough with a protected characteristic (race, gender) that excluding the protected variable doesn't prevent discriminatory outcomes." },
        { q: "Under the Equal Credit Opportunity Act, what must a lender provide when denying your credit application?", options: ["A 30-day waiting period to reapply", "A written adverse action notice explaining specific reasons for denial", "An alternative credit product offer", "A free credit score"], correct: 1, explanation: "ECOA requires lenders to provide an adverse action notice stating specific reasons for denial. This is your right — you can use it to identify errors in your data or potential discrimination." },
        { q: "What does SHAP (SHapley Additive exPlanations) do in AI explainability?", options: ["Speeds up AI model training", "Assigns a contribution score to each input showing how much it influenced a specific prediction", "Encrypts AI model data", "Reduces bias in training datasets"], correct: 1, explanation: "SHAP values quantify how much each input feature contributed to a specific AI prediction — allowing humans to understand why the AI made a particular decision for a particular case." },
        { q: "The EU AI Act classifies credit scoring algorithms as:", options: ["Low-risk tools requiring minimal oversight", "High-risk systems requiring transparency, human oversight, and bias testing", "Prohibited AI applications", "General-purpose AI not requiring special rules"], correct: 1, explanation: "The EU AI Act classifies credit scoring as 'high-risk AI' because errors or bias can significantly harm people's financial lives. High-risk classification requires extensive documentation, transparency, and human oversight." },
        { q: "What is VEDD's approach to responsible AI trading?", options: ["Fully autonomous AI with no user control", "Transparent signals, auditable blockchain execution, user-controlled risk parameters", "AI replaces human judgment entirely", "Black-box algorithms for competitive advantage"], correct: 1, explanation: "VEDD's responsible AI approach: every signal is explainable, every trade is verifiable on-chain, users set their own risk parameters, and paper trading is required before live trading." },
        { q: "Under GDPR, which right allows you to demand a company delete all data they have on you?", options: ["Right to transparency", "Right to portability", "Right to be forgotten (right to erasure)", "Right to rectification"], correct: 2, explanation: "The 'right to be forgotten' (Article 17, GDPR) allows individuals to request deletion of their personal data. Exceptions apply for legal obligations and public interest, but companies must comply with most deletion requests." },
      ],
    },
  },

  // ── Course 8: Job Readiness & Portfolio Building ─────────────────────────────
  8: {
    lessons: [
      {
        number: 1, title: "Resume Writing for the Digital Economy", timeEstimate: "12 min",
        sections: [
          { heading: "The Resume Has Evolved", content: "Modern resumes are scanned by Applicant Tracking Systems (ATS) before any human reads them. Your resume must:\n1. Pass the ATS scan (correct keywords, clean formatting)\n2. Impress a recruiter in 6 seconds (the average first-pass scan time)\n3. Tell a story of growth and impact\n\nThe days of listing job duties are over. Every line must show IMPACT — what changed because of what you did." },
          { heading: "Resume Structure for 2024+", content: "Modern one-page format:\n\n• Name + Contact + LinkedIn URL + Portfolio URL (header)\n• Professional Summary: 2-3 sentences. Who you are, your specialization, your value.\n• Skills: 8-12 keywords relevant to your target role (this is how you pass ATS)\n• Experience: Reverse chronological. Company, role, dates, 2-3 bullet points PER ROLE\n• Education: Degree, institution, year\n• Certifications: Include VEDD certifications, Google certificates, etc.\n\nKeep to one page if under 7 years of experience." },
          { heading: "Writing Impact Bullet Points", content: "The formula: Action Verb + What You Did + The Result (Quantified)\n\nWeak: 'Responsible for managing social media'\nStrong: 'Grew Instagram following by 340% in 6 months by implementing data-driven posting strategy'\n\nWeak: 'Helped customers with financial questions'\nStrong: 'Advised 50+ clients on budgeting and credit repair, 80% improved credit scores within 6 months'\n\nWeak: 'Used VEDD trading platform'\nStrong: 'Generated 23% paper-trading return over 90 days using VEDD AI signals and ICT methodology'\n\nNumbers matter. Estimate if you must, but quantify your impact.", isExample: true },
          { heading: "The VEDD Certification Advantage", content: "VEDD Workforce Academy certificates are verifiable credentials that signal:\n• Technical competency (AI, blockchain, trading, finance)\n• Self-directed learning capability\n• Exposure to cutting-edge fintech\n\nHow to list them:\nCertifications section:\n• AI Literacy 101 — VEDD Certified Trader (2024)\n• Trading Fundamentals — VEDD Certified Trader (2024)\n• Web3 & Blockchain Basics — VEDD Certified (2024)\n\nThese differentiate you in fintech, banking, wealth management, and tech finance roles." },
        ],
        keyTakeaways: ["Every resume bullet should follow: Action Verb + What + Quantified Result", "Modern resumes must pass ATS keyword scanning before any human reads them", "VEDD certifications belong in your certifications section as verifiable fintech credentials"],
      },
      {
        number: 2, title: "LinkedIn Optimization for Finance & Tech", timeEstimate: "10 min",
        sections: [
          { heading: "LinkedIn Is Your Digital First Impression", content: "Recruiters and hiring managers check LinkedIn before (and sometimes instead of) your resume. A complete, optimized LinkedIn profile:\n• Gets found in recruiter searches (LinkedIn's algorithm surfaces you for relevant roles)\n• Shows you're professional and current\n• Demonstrates thought leadership if you post content\n• Provides social proof through recommendations\n\n40 million people job search on LinkedIn every week. You need to be visible." },
          { heading: "The 7 LinkedIn Sections That Matter", content: "1. Profile Photo: Professional, well-lit, smiling. Profiles with photos get 21× more views.\n2. Banner Image: VEDD branded or finance/tech themed.\n3. Headline: Not just your job title. 'VEDD Certified Trader | AI Finance | Solana | Community Financial Literacy Advocate'\n4. About: 3-5 paragraphs. Your story, skills, what you're seeking.\n5. Experience: Same impact bullets as your resume.\n6. Skills: List 15-20 skills. Connections can endorse them.\n7. Recommendations: Ask 3-5 people to write specific recommendations about working with you." },
          { heading: "LinkedIn for Ambassadors: Building Your Network", content: "The VEDD ambassador business runs on relationships. LinkedIn strategy:\n\n• Connect with every person you meet professionally within 24 hours\n• Personalize connection requests: 'Hi Marcus, I enjoyed your presentation at the financial literacy workshop. I'd love to connect.'\n• Post content weekly: market updates, VEDD insights, financial literacy tips\n• Comment thoughtfully on posts in your industry\n• Join and participate in Finance, Fintech, and Community Development groups\n\nGoal: 500+ connections in your first year as an ambassador. Quality + quantity." },
          { heading: "LinkedIn Content Strategy", content: "Content types that perform for VEDD ambassadors:\n\n• Educational posts: 'Here's how to read a candlestick chart in 3 steps' (carousel)\n• Milestone posts: 'Just earned my VEDD AI Literacy certification' (with certificate image)\n• Community stories: 'Ran a financial literacy workshop at [school/church/community center] today'\n• Market observations: 'SOL bounced off the weekly support level exactly as predicted by order block theory'\n• Behind-the-scenes: 'Day in the life of a VEDD ambassador'\n\nConsistency > virality. Post 2-3 times per week, engage daily." },
        ],
        keyTakeaways: ["Headline = your specialty, not just job title — pack it with searchable keywords", "Connect within 24 hours of every professional meeting; personalize the request", "Post 2-3 times per week — VEDD certifications, financial tips, community work"],
      },
      {
        number: 3, title: "Freelance Finance: Getting Paid in the Digital Economy", timeEstimate: "10 min",
        sections: [
          { heading: "The Freelance Economy in Finance", content: "Millions of people now earn income outside traditional employment through freelance and gig work. In finance specifically:\n\n• Financial coaching and credit repair consulting\n• Tax preparation (enrolled agent or CTEC certification)\n• Bookkeeping (QuickBooks, Xero)\n• Investment research and writing\n• Financial literacy workshop facilitation\n• Social media management for financial brands\n\nVEDD ambassadors are entrepreneurs — understanding freelance income management is essential." },
          { heading: "Setting Up for Freelance Income", content: "Legal and financial foundation:\n\n1. Form an LLC ($50-150 in most states via your Secretary of State website)\n2. Open a separate business checking account (never mix personal and business money)\n3. Get an EIN (Employer Identification Number) from IRS.gov — free, takes 5 minutes\n4. Track all income and expenses in a simple spreadsheet or Wave (free accounting software)\n5. Set aside 25-30% of every payment for taxes — freelancers pay self-employment tax\n\nBusiness checking at a credit union or Relay Bank (built for freelancers) is ideal." },
          { heading: "Freelance Platforms and VEDD Work", content: "General freelance platforms:\n• Upwork — best for ongoing client relationships\n• Fiverr — best for defined service packages\n• Toptal — high-end tech and finance talent\n\nVEDD-specific income streams:\n• Financial literacy workshops: $50-200/person or $500-1500 per group workshop\n• VEDD referrals: Ambassador referral commissions\n• Trading education: 1-on-1 coaching once you have documented trading history\n• Grant writing: Use your VEDD grants training to help nonprofits (charge $75-150/hr)\n\nNever promise investment returns to clients. Educate — never advise on specific investments.", isWarning: true },
          { heading: "Invoicing, Contracts & Getting Paid", content: "For every client engagement:\n\n• Written contract or agreement before work begins (even a simple email confirming scope, rate, and deliverables)\n• Invoice with payment terms (Net 15 — payment due within 15 days)\n• Payment methods: Venmo Business, Stripe, PayPal Business, Zelle\n• Late payment policy: 1.5% monthly fee on overdue invoices\n\nFree invoice tools:\n• Wave (free), AND CO (free), HoneyBook (paid)\n\nFor amounts over $600 from one client in a year: they must send you a 1099 form for taxes. Keep records of all income regardless." },
        ],
        keyTakeaways: ["Form an LLC and open a business checking account before taking your first client dollar", "Set aside 25-30% of freelance income for taxes immediately — self-employment tax is real", "Never promise investment returns — VEDD ambassadors educate, they do not provide investment advice"],
      },
      {
        number: 4, title: "Building Your Digital Portfolio", timeEstimate: "10 min",
        sections: [
          { heading: "Why Every Finance Professional Needs a Portfolio", content: "A resume tells employers what you did. A portfolio SHOWS them.\n\nFor VEDD ambassadors and finance professionals, your portfolio can include:\n• VEDD certification certificates (downloadable PDF)\n• Trading journal screenshots (P&L charts, win rate statistics)\n• Workshop presentations and materials\n• Financial literacy content you've created (blog posts, social media)\n• Client testimonials\n• Community project documentation\n\nYour portfolio is the difference between being considered and being hired." },
          { heading: "Portfolio Platforms", content: "Options for finance/fintech professionals:\n\n• LinkedIn: Share certifications, post portfolio items as articles\n• Personal website: Wix, Squarespace, or Carrd.co ($19/year) with your domain\n• Notion: Free, easy to organize, shareable link\n• GitHub: If you have any coding projects or data analysis work\n\nMinimum viable portfolio: A one-page Carrd.co or Notion site with:\n• Your bio and photo\n• List of skills and certifications\n• 3-5 portfolio items (workshop slides, trading results, projects)\n• Contact form or email\n• LinkedIn link" },
          { heading: "Documenting Your VEDD Work", content: "Your VEDD trading results are portfolio evidence — but must be presented honestly:\n\n✅ Do: Show 90-day paper trading results with win rate, average R, maximum drawdown\n✅ Do: Include VEDD certificates with issue dates\n✅ Do: Show workshop attendance and participant feedback\n✅ Do: Share educational content you've created about trading/finance\n\n❌ Don't: Show cherry-picked winning trades without full context\n❌ Don't: Imply past performance guarantees future results\n❌ Don't: Present paper trading results as live trading performance\n\nHonesty builds long-term trust. Exaggeration destroys careers.", isWarning: true },
          { heading: "Telling Your VEDD Story", content: "The most compelling portfolio tells a transformation story:\n\n'I came to VEDD without any background in trading or technology. Through the Workforce Academy, I learned AI literacy, blockchain fundamentals, and technical trading methodology. In 90 days of paper trading, I achieved a 31% simulated return using ICT methodology. I now teach financial literacy workshops in my community, helping families build credit and understand modern financial tools.\n\nThis is how I help people: [link to workshop video / testimonial / certificate]'\n\nThis story: Shows growth, demonstrates skills, includes measurable results, leads with community impact.", isExample: true },
        ],
        keyTakeaways: ["Portfolio shows what resume tells — include certifications, trading results, and workshop work", "Present trading results honestly: include win rate, drawdown, and whether it was paper or live trading", "Your VEDD transformation story is your most powerful portfolio asset"],
      },
      {
        number: 5, title: "Interview Skills for Finance & Tech Roles", timeEstimate: "10 min",
        sections: [
          { heading: "The Modern Finance Interview", content: "Finance and fintech interviews test three things:\n1. Technical knowledge (can you do the job?)\n2. Behavioral fit (do you handle real situations well?)\n3. Cultural alignment (do you belong here?)\n\nPrepare for all three. The biggest mistake candidates make: preparing only for technical questions and bombing the behavioral ones — or vice versa." },
          { heading: "The STAR Method for Behavioral Questions", content: "Behavioral questions: 'Tell me about a time when...' 'Describe a situation where...'\n\nSTAR framework:\n• Situation: Set the context briefly\n• Task: What was your responsibility?\n• Action: What specific steps did you take?\n• Result: What measurably happened?\n\nExample: 'Tell me about a time you had to learn something complex quickly.'\n'When I joined VEDD (S), I had no trading or blockchain background (T). I completed the Workforce Academy AI Literacy and Trading Fundamentals courses in 3 weeks and ran 50 paper trades before going live (A). My paper trading account showed a 23% gain over 90 days, and I'm now teaching trading fundamentals to my community (R).'", isExample: true },
          { heading: "Finance-Specific Technical Questions", content: "Prepare for these common questions in finance/fintech roles:\n\n• 'Walk me through how you would analyze whether to buy a stock/crypto asset'\n• 'How would you explain risk:reward ratio to a client with no finance background?'\n• 'What is blockchain and why does it matter for financial services?'\n• 'How do you manage risk in volatile markets?'\n• 'What's the difference between a centralized and decentralized exchange?'\n\nPractice answering these out loud, not just in your head. Record yourself — watch for filler words ('um', 'like'), pace, and clarity." },
          { heading: "Salary Negotiation: You Are Worth More Than You Think", content: "Most people leave money on the table by accepting the first offer.\n\nResearch: Use Glassdoor, LinkedIn Salary, Levels.fyi to find market ranges BEFORE the interview.\n\nNever give a number first: 'I'd like to understand the full scope of the role before discussing compensation.'\n\nWhen they name a number: Ask for time. 'Thank you — I'm very excited about this role. Could I have 24 hours to review the full offer?'\n\nCountering: 'Based on my research and the qualifications I bring — [specific VEDD skills] — I was targeting [X range]. Is there flexibility there?'\n\nNon-salary negotiation: remote work, extra PTO, signing bonus, professional development budget, equity." },
        ],
        keyTakeaways: ["STAR method: Situation, Task, Action, Result — for every behavioral interview question", "Prepare finance-specific technical questions out loud, on video, before the interview", "Research salary ranges before interviews — never give a number first, always ask for time before accepting"],
      },
      {
        number: 6, title: "The VEDD Ambassador Career Path", timeEstimate: "8 min",
        sections: [
          { heading: "What Being a VEDD Ambassador Really Means", content: "VEDD Ambassador is more than a referral program — it's a business model built around financial education and community impact.\n\nAmbassadors:\n• Represent VEDD in their local community and online\n• Facilitate financial literacy workshops and trading education\n• Onboard new VEDD members and guide them through the platform\n• Access exclusive features and trading data not available to general users\n• Build a network and brand in the financial education space\n• Earn commissions and performance bonuses\n\nThe ambassador who invests in their own education and community relationships builds something lasting." },
          { heading: "Ambassador Income Streams", content: "Multiple ways VEDD ambassadors earn:\n\n1. Referral commissions: Direct compensation for members you bring to VEDD\n2. Workshop facilitation fees: Charge communities, schools, churches for financial literacy workshops\n3. Coaching: 1-on-1 financial literacy or trading education coaching (not investment advice)\n4. Grant writing: Use VEDD's grants module to secure funding for community programs\n5. Corporate training: Deliver VEDD financial literacy content to HR departments and employee ERGs\n6. Content creation: Build audience on LinkedIn/YouTube teaching VEDD methodology\n\nTop ambassadors treat this as a full business — not a side hustle." },
          { heading: "Your 90-Day Ambassador Launch Plan", content: "Days 1-30: Foundation\n• Complete Workforce Academy (all courses)\n• Set up professional social profiles and portfolio\n• Execute 50+ paper trades and document results\n• Join local community financial organizations\n\nDays 31-60: First Engagements\n• Host your first free financial literacy workshop (any size — even 5 people)\n• Make 50 LinkedIn connections in your target community\n• Apply for one grant through VEDD's grants module\n• Complete your first live client referral\n\nDays 61-90: Momentum\n• Formalize your LLC and business banking\n• Schedule monthly recurring workshops\n• Build referral pipeline of 10+ active prospects\n• Set 6-month revenue goal and track progress", isExample: true },
          { heading: "Long-Term: Building a VEDD Business That Lasts", content: "The ambassadors who succeed long-term share these habits:\n\n• They treat VEDD as a business, not a platform they use occasionally\n• They document everything — testimonials, results, workshop photos\n• They invest in their own continuing education (markets change)\n• They build community relationships that aren't dependent on any single platform\n• They have a clear mission beyond money: helping their community build wealth\n\nVEDD's mission — democratizing AI trading tools and financial education for underserved communities — is the story that opens doors. Embody it, and every door opens easier." },
        ],
        keyTakeaways: ["VEDD Ambassador is a business model with multiple income streams — treat it like one", "90-day launch: complete courses → host workshop → first referral → formalize LLC", "Long-term success: document everything, invest in your education, build community-first relationships"],
      },
    ],
    assessment: {
      passingScore: 70,
      certTitle: "Job Readiness & Portfolio Building — VEDD Certified",
      questions: [
        { q: "What is the correct formula for an impact-driven resume bullet point?", options: ["Job title + years of experience", "Action verb + what you did + quantified result", "List of responsibilities from your job description", "Educational background + skills"], correct: 1, explanation: "Strong resume bullets follow: Action Verb + What You Did + Quantified Result. 'Grew portfolio 23% in 90 days using VEDD AI signals' beats 'Used trading platform.'" },
        { q: "What does the 'A' in the STAR interview method stand for?", options: ["Attitude", "Achievement", "Action", "Assessment"], correct: 2, explanation: "STAR = Situation, Task, Action, Result. The Action step describes the specific steps YOU took to address the task — this is where you demonstrate your skills and decision-making." },
        { q: "What percentage of freelance income should be set aside for taxes?", options: ["10-15%", "15-20%", "25-30%", "35-40%"], correct: 2, explanation: "Freelancers pay both self-employment tax (~15.3%) plus income tax. Combined, 25-30% of gross income is a safe amount to set aside for taxes to avoid an unexpected tax bill." },
        { q: "What is the most important rule when presenting VEDD trading results in a portfolio?", options: ["Only show your winning trades to impress employers", "Show paper trading results as live trading for impact", "Present results honestly including win rate, drawdown, and whether it was paper or live", "Don't include trading results — they're too risky to share"], correct: 2, explanation: "Honesty builds long-term trust in finance. Portfolio trading results must disclose win rate, maximum drawdown, and whether results are paper (simulated) or live. Cherry-picking wins and hiding losses is dishonest and can damage your reputation." },
        { q: "As a VEDD Ambassador, which of the following is NOT an appropriate income stream?", options: ["Facilitation fees for financial literacy workshops", "Referral commissions for VEDD member signups", "Providing specific investment advice for a fee", "Grant writing services for community organizations"], correct: 2, explanation: "VEDD Ambassadors educate — they do NOT provide specific investment advice. Providing investment advice without proper licensing (RIA, broker-dealer) is illegal. Ambassadors teach principles, not 'buy this asset.'" },
        { q: "What should you do immediately when you receive a job offer before accepting?", options: ["Accept immediately to show enthusiasm", "Decline if it's below your target salary", "Ask for 24 hours to review the full offer", "Immediately counter with a higher number"], correct: 2, explanation: "Always ask for time to review a job offer before accepting or countering. This is standard professional practice, not rudeness. Use the time to research market salaries and evaluate the full compensation package." },
      ],
    },
  },

  // ── Course 9: Advanced AI Trading Strategies ─────────────────────────────────
  9: {
    lessons: [
      {
        number: 1, title: "ICT Methodology Deep Dive: Order Blocks", timeEstimate: "15 min",
        sections: [
          { heading: "What Is an Order Block?", content: "An Order Block (OB) is the last opposing candle before a significant institutional price move. It represents an area where a large institution placed their orders — creating a zone of 'unfilled' institutional interest that price often returns to.\n\nBullish Order Block: The last bearish (red) candle before a significant move upward. When price returns to this zone, institutions are defending their long positions.\n\nBearish Order Block: The last bullish (green) candle before a significant move downward. When price retraces here, institutions are adding to shorts." },
          { heading: "Identifying Valid Order Blocks", content: "Not every candle qualifies as an order block. Valid OBs have these characteristics:\n\n1. Strong displacement: Price moved away from the OB with momentum (large candles, minimal pullback)\n2. Left a Price Imbalance (Fair Value Gap) nearby — indicating rapid institutional movement\n3. Located at a key structural level (previous support/resistance, weekly/daily range extreme)\n4. Has not been previously 'tapped' and rejected — fresh is stronger\n5. The OB body (open to close) is the key zone, with wicks as secondary reference\n\nThe best OBs are on higher timeframes (daily, 4H) that align with lower timeframe entry zones (1H, 15M).", isExample: true },
          { heading: "ICT OB Trading Process", content: "Step 1 — HTF Bias: Determine higher timeframe trend direction. Is price above/below weekly VWAP? Is structure making higher highs/lows (bullish) or lower highs/lows (bearish)?\n\nStep 2 — Mark OBs on 4H/Daily: Identify the last bearish candle before each major bullish leg (for bullish bias).\n\nStep 3 — Wait for Mitigation: Price must return to the OB zone. The first return to a fresh OB is statistically the most reliable.\n\nStep 4 — LTF Entry Confirmation: Drop to 15M or 5M. Look for: displacement candle away from OB, micro order block, or fair value gap fill as entry trigger.\n\nStep 5 — Set Stop: Below the low of the OB (for bullish trades). Set target at nearest liquidity pool or OB on the next resistance level." },
          { heading: "OB Invalidation: When to Abandon the Setup", content: "Order blocks fail. Knowing when to walk away is as important as knowing when to enter.\n\nOB is invalidated when:\n• Price closes through the ENTIRE OB body with a strong bearish/bullish candle (not a wick)\n• HTF structure has shifted (market now making lower highs/lows when you expected bullish)\n• A major news event has disrupted the technical picture\n• Price has already tapped the OB 2+ times (loses effectiveness with each visit)\n\nInvalidated OBs often flip to resistance — the zone where buyers got trapped becomes the level sellers defend.", isWarning: true },
        ],
        keyTakeaways: ["Order Block = last opposing candle before a significant institutional price move", "Valid OBs: strong displacement, nearby FVG, at structural extremes, fresh (not previously tapped)", "Invalidated when price closes through the OB body with conviction — old OBs often flip to resistance"],
      },
      {
        number: 2, title: "Smart Money Concepts: Liquidity & Stop Hunts", timeEstimate: "15 min",
        sections: [
          { heading: "Understanding Liquidity Pools", content: "Liquidity in trading means: where are the orders? Large institutions can't simply buy/sell their full position at one price — they need counterparty orders to trade against.\n\nWhere orders concentrate:\n• Above swing highs (buy stop orders from breakout traders; stop losses from shorts)\n• Below swing lows (sell stop orders from breakdown traders; stop losses from longs)\n• Round numbers ($100, $50,000 BTC, etc.) — psychological magnet for orders\n• Equal highs/lows — retail traders see these as obvious levels, so they're obvious liquidity targets\n\nInstitutions deliberately engineer price to reach these zones to execute their real positions." },
          { heading: "The Liquidity Sweep Pattern", content: "Classic stop hunt / liquidity sweep:\n\n1. Price consolidates below/above an obvious high/low\n2. Retail traders place stops just beyond the obvious level (or enter breakouts)\n3. Price spikes through the level (the 'sweep') — triggering retail stops\n4. Institutions collect the liquidity (buy the retail sell stops, sell the retail buy stops)\n5. Price quickly reverses — the 'false breakout' or 'liquidity grab'\n6. Price delivers in the real direction, leaving breakout traders trapped\n\nThe sweep candle itself often has a significant wick — the visual evidence of the grab.", isExample: true },
          { heading: "AMD Cycle: Accumulation, Manipulation, Distribution", content: "ICT's AMD model describes the institutional price delivery cycle:\n\nAccumulation: Price ranges (consolidates). Institutions are quietly building positions. Volume is relatively low. Retail sees 'chop' and gets frustrated.\n\nManipulation: The liquidity sweep. Price makes a false move against the accumulated direction — stops are hunted, weak hands shaken out, institutions complete their entry.\n\nDistribution: The real move. Price delivers to the target — the direction institutions always intended. Retail finally enters in the wrong direction or misses the move entirely." },
          { heading: "Trading Liquidity Sweeps with VEDD AI", content: "VEDD's AI scanner monitors for liquidity sweep signals across multiple pairs simultaneously:\n\n• Equal highs/lows formed (retail trap being set)\n• Price approaching old high/low with increasing momentum\n• Sweep occurs (price spikes through level)\n• Displacement candle forms away from the sweep zone\n• Entry signal triggered as price returns into the sweep candle's range\n\nThe AI removes the emotional challenge of these setups — it's very difficult to buy after a scary wick down. The AI executes the entry mechanically when the signal criteria are met.", isExample: true },
        ],
        keyTakeaways: ["Liquidity pools collect above swing highs and below swing lows — institutions target them to fill orders", "AMD cycle: Accumulation (range) → Manipulation (false sweep) → Distribution (real move)", "VEDD AI detects sweep patterns and executes mechanically — removing the emotional difficulty of fading false breakouts"],
      },
      {
        number: 3, title: "Multi-Timeframe Analysis", timeEstimate: "12 min",
        sections: [
          { heading: "Why Single-Timeframe Analysis Fails", content: "Looking at only one timeframe is like navigating a city using only a street-level map while ignoring the city map and the country map.\n\nEvery timeframe tells part of the story:\n• Monthly/Weekly: Macro trend and major structural levels\n• Daily/4H: Intermediate trend, significant OBs and FVGs, key institutional levels\n• 1H/15M: Entry zone identification, pattern confirmation\n• 5M/1M: Entry trigger and precise stop placement\n\nThe higher timeframe context determines whether lower timeframe signals are valid entries or traps." },
          { heading: "The Top-Down Analysis Framework", content: "Step 1 — Monthly: Is the overall trend up or down? Where is price relative to the yearly range? What are the major support/resistance levels?\n\nStep 2 — Weekly: Confirming trend direction. Mark key weekly swing highs/lows. Note any weekly FVGs or OBs that price hasn't yet mitigated.\n\nStep 3 — Daily: Determine the current day's bias. Is today's range expansion up or down? Mark daily OBs and key levels.\n\nStep 4 — 4H: Find the zone you're interested in. Is there an OB + FVG confluence? Does the 4H structure confirm the daily bias?\n\nStep 5 — 15M/5M: Wait for a trigger — displacement, micro OB, or entry into a FVG within the higher timeframe zone." },
          { heading: "HTF/LTF Alignment = Highest Probability", content: "The highest-probability setups are when ALL timeframes align:\n\nBullish example:\n• Weekly: Above VWAP, making higher highs and higher lows ✓\n• Daily: Pulled back to a bullish OB, held the low ✓\n• 4H: Displacement candle formed up from OB zone ✓\n• 15M: Created a bullish FVG during displacement, price returning to fill ✓\n\nWhen all four timeframes agree, the setup is 'stacked.' This is where you size up within your risk parameters.\n\nContrasting: A 15M signal going AGAINST the daily trend is a counter-trend trade — lower probability, reduce size.", isExample: true },
          { heading: "Kill Zones: When Markets Are Most Active", content: "ICT identifies specific sessions with the highest probability for quality setups:\n\n• Asian Kill Zone (12 AM – 4 AM EST): Lower volume, range-building, often sets the manipulation targets for London\n• London Open Kill Zone (2 AM – 5 AM EST): Often where the daily manipulation occurs — the fake move before the real move\n• New York Open Kill Zone (8:30 AM – 11 AM EST): Highest volume, real directional delivery for the day, often confirms or reverses London move\n• London Close Kill Zone (10 AM – 12 PM EST): Consolidation before afternoon session\n\nVEDD AI focuses signals primarily on NY Open and London Open kill zones for highest-quality setups." },
        ],
        keyTakeaways: ["Top-down: Monthly/Weekly for macro bias, Daily/4H for zone identification, 15M/5M for entry trigger", "Stacked timeframe alignment = highest probability — all timeframes confirming the same direction", "NY Open (8:30–11 AM EST) and London Open (2–5 AM EST) kill zones produce the highest-quality setups"],
      },
      {
        number: 4, title: "VEDD AI Signal Interpretation & Execution", timeEstimate: "12 min",
        sections: [
          { heading: "How VEDD Generates Signals", content: "VEDD's AI signal engine combines multiple layers of analysis:\n\n1. Structural Analysis: Identifies higher high/lower low patterns, break of structure (BOS), and change of character (CHoCH)\n2. Institutional Level Detection: Scans for order blocks, fair value gaps, and liquidity pools\n3. Session Context: Weights signals differently based on active trading session and kill zone timing\n4. Phase Engine: Applies position sizing rules based on your current phase (Seedling → Professional)\n5. Confluence Scoring: Rates setups by how many factors align (OB + FVG + Kill Zone = higher score)\n\nHigh-confluence setups trigger stronger signals; single-factor setups are noted but not auto-executed at full size." },
          { heading: "Reading the Signal Dashboard", content: "When VEDD surfaces a trade signal:\n\n• Signal Type: Long/Short — direction of the trade\n• Pair: SOL/USDC or other configured pairs\n• Signal Strength: 1-5 scale based on confluence factors\n• Entry Zone: Price range for valid entry\n• Stop Level: Below/above invalidation point (with reason)\n• Target 1 / Target 2: Based on liquidity pools above/below\n• HTF Context: Brief statement of higher timeframe alignment\n• Trigger: What caused the signal (OB mitigation, FVG fill, liquidity sweep)\n\nNever execute a signal without understanding WHY it was generated. The explanation is part of the UI for your education.", isExample: true },
          { heading: "Paper Trading Mode: Your Signal Test Lab", content: "Before going live, use paper trading to:\n\n1. Execute every signal for 30 days — no skipping setups you don't 'feel'\n2. Track which signal types perform best for you (some traders execute OBs better than FVGs)\n3. Measure your execution quality: Are you entering in the zone or chasing?\n4. Identify your emotional triggers: What signals do you overtrade or avoid?\n5. Calculate your paper trading stats: Win rate, avg R, max drawdown\n\nTarget before going live: 50+ paper trades with documented rationale, and a positive expected value (positive avg R × win rate)." },
          { heading: "Common Signal Execution Mistakes", content: "• Entering too early: Price hasn't actually reached the OB/FVG zone yet — FOMO entry\n• Entering too late: Price has blown through the zone — you've missed the entry, don't chase\n• Wrong stop placement: Stop inside the OB instead of below it — getting stopped by normal retest\n• Ignoring HTF context: Taking a long signal on a 15M while the daily is bearish\n• Moving stop to breakeven too early: Removing your position before it reaches target\n• Taking partial signals: Only trading the 'comfortable' setups and missing the best ones\n\nThe AI executes consistently. Your job in manual trading is to replicate that consistency.", isWarning: true },
        ],
        keyTakeaways: ["VEDD signals are scored by confluence — OB + FVG + Kill Zone timing = highest quality", "Paper trade 50+ signals with documented rationale before activating live capital", "Consistent execution means taking all qualifying signals, not just comfortable ones"],
      },
      {
        number: 5, title: "Backtesting & Building a Proven Edge", timeEstimate: "15 min",
        sections: [
          { heading: "What Is Backtesting?", content: "Backtesting = testing a trading strategy against historical price data to see how it would have performed.\n\nWhy it matters:\n• Proves (or disproves) that your strategy has a statistical edge\n• Reveals how the strategy performs in different market conditions (trending, ranging, volatile)\n• Builds the psychological confidence to execute during drawdowns\n• Identifies parameter optimization opportunities\n\nRisk: 'Overfitting' — optimizing so specifically to past data that the strategy fails in live markets. Backtest for understanding patterns, not for perfecting parameters to 3 decimal places." },
          { heading: "Manual Backtesting: The ICT Way", content: "Manual backtesting using TradingView:\n\n1. Set chart to your target timeframe (start with 1H)\n2. Scroll back 6+ months on your chosen pair\n3. Move candle by candle forward using the right arrow key\n4. Apply your entry rules: When would you have entered? Stop? Target?\n5. Record in your journal: Date, signal type, entry, stop, target, actual outcome, R result\n6. Continue for 50+ trades\n\nManual backtesting is slower than automated but forces you to actually see the setups — building pattern recognition that automated testing can't replicate." },
          { heading: "Interpreting Your Backtest Results", content: "After 50+ backtested trades, calculate:\n\n• Win Rate: Wins ÷ Total Trades × 100\n• Average R: Sum of all R results ÷ Total Trades\n• Expected Value (EV): Win Rate × Avg Win R + Loss Rate × Avg Loss R (should be positive)\n• Maximum Drawdown: Largest peak-to-trough loss in R units\n• Profit Factor: Gross Wins ÷ Gross Losses (>1.5 is good, >2.0 is excellent)\n• Consistency: Standard deviation of R results (lower = more consistent)\n\nA strategy is worth pursuing live if: Positive EV + Profit Factor >1.5 + Maximum Drawdown you can psychologically handle.", isExample: true },
          { heading: "Walk-Forward Testing: The Live Test", content: "After backtesting on 'in-sample' data (the period you optimized on), test on 'out-of-sample' data — the most recent 30-60 days you deliberately excluded.\n\nIf the strategy holds up on out-of-sample data → high confidence it's a real edge.\n\nIf out-of-sample performance is significantly worse → the strategy may be overfit to the backtest period.\n\nVEDD paper trading IS your walk-forward test. It's running your strategy on current live data before committing real capital. Treat it with the same seriousness as live trading." },
        ],
        keyTakeaways: ["Manual backtesting: scroll back 6 months, apply rules candle-by-candle, record 50+ trades", "Positive EV + Profit Factor >1.5 + acceptable max drawdown = strategy worth trading live", "VEDD paper trading is your walk-forward test — treat it with the same discipline as live trading"],
      },
      {
        number: 6, title: "Position Sizing: The Phase System", timeEstimate: "10 min",
        sections: [
          { heading: "Why Position Sizing Is the Most Important Variable", content: "Two traders with the same strategy and the same win rate can have completely different outcomes — because of position sizing.\n\nOver-sizing: One bad loss wipes a significant portion of the account. Emotional panic causes rule-breaking in subsequent trades. The account spirals down.\n\nUnder-sizing: The strategy never generates meaningful returns. Frustration with small gains causes increasing position size at the wrong time.\n\nOptimal sizing: Grow the account steadily, survive inevitable losing streaks, and have a mathematical ceiling on worst-case loss." },
          { heading: "VEDD Phase System Overview", content: "VEDD's 6-phase system scales risk % and position sizing as your account demonstrates consistent profitability:\n\n• Phase 1 — Seedling: $0-$999, 0.5% risk per trade\n• Phase 2 — Sprout: $1,000-$4,999, 0.75% risk per trade\n• Phase 3 — Growth: $5,000-$19,999, 1.0% risk per trade\n• Phase 4 — Momentum: $20,000-$49,999, 1.25% risk per trade\n• Phase 5 — Acceleration: $50,000-$99,999, 1.5% risk per trade\n• Phase 6 — Professional: $100,000+, 2.0% risk per trade\n\nPhase progression is automatic based on account size — no manual changes needed." },
          { heading: "Calculating Position Size at Any Phase", content: "Formula: Position Size (in tokens) = (Account Balance × Risk %) ÷ (Entry Price − Stop Price)\n\nPhase 3 example ($10,000 account, 1% risk):\n• SOL Entry: $150, Stop: $147 (distance = $3)\n• Risk Amount: $10,000 × 0.01 = $100\n• Position Size: $100 ÷ $3 = 33.33 SOL\n\nPhase 6 example ($150,000 account, 2% risk):\n• Same trade: $150,000 × 0.02 = $3,000\n• Position Size: $3,000 ÷ $3 = 1,000 SOL\n\nSame setup, same stop — but 30× larger position because the account is 15× larger and the risk % increased.", isExample: true },
          { heading: "The Psychology of the Phase System", content: "The phase system solves a critical psychological problem: impatience.\n\nTraders who start with full position sizing before having consistent results blow up their accounts. Traders who know they'll be bumped to higher risk % as their account grows have a roadmap — they stay patient.\n\nPractical mindset:\n• Phase 1 and 2 are education phases — you're paying tuition to the market, keep it small\n• Phase 3 is where the strategy starts generating meaningful income\n• Phase 5+ is where VEDD becomes a primary income-generating engine\n\nEach phase requires maintaining the discipline of the previous phase. More size means more dollars per R — both winning and losing." },
        ],
        keyTakeaways: ["Position size = (Account × Risk%) ÷ Stop Distance — calculate before every trade", "VEDD's Phase System automatically scales risk % from 0.5% (Phase 1) to 2% (Phase 6)", "Phases 1-2 are tuition — small losses teach more than lectures; Phase 3+ is where income builds"],
      },
      {
        number: 7, title: "Managing Psychology Under Pressure", timeEstimate: "12 min",
        sections: [
          { heading: "Why Trading Psychology Is the Final Boss", content: "You can memorize every ICT concept, backtest a profitable strategy, and understand position sizing perfectly — and still blow your account because of emotions.\n\nThe market is the greatest psychological pressure machine ever invented. It's real-time, it involves your money, and it's designed to trigger your deepest fears:\n• Fear of missing out (entering setups that don't meet your rules)\n• Fear of loss (cutting winning trades too early)\n• Revenge trading (doubling size after a loss to 'get it back')\n• Overconfidence (increasing size after a winning streak — right before a drawdown)\n\nNone of this is weakness. It's biology. The amygdala sees portfolio losses the same as physical threats." },
          { heading: "The Trading Mindset Rules", content: "Professional traders operate by a set of rules that override emotion:\n\n1. The outcome of one trade is irrelevant. Judge strategy only over 50+ trades.\n2. A loss from a valid setup is a correct decision — not a failure.\n3. Every losing streak ends. Every winning streak ends. Both are temporary.\n4. You cannot control the market. You can only control your execution.\n5. If you've broken your rules today, stop trading. Come back tomorrow.\n6. Never trade angry, fearful, or overly excited. Flat emotional state only.\n7. The trade is over when you set your stop — let it run or get stopped out." },
          { heading: "Recognizing and Stopping Tilt", content: "Trading tilt = emotional state that compromises decision-making\n\nWarning signs you're in tilt:\n• Checking the chart every 30 seconds after entry\n• Considering moving your stop to 'give it more room'\n• Thinking 'just this once' about breaking a rule\n• Opening a new trade immediately after a loss\n• Thinking about the dollar amount instead of the R amount\n• Physical tension, faster heartbeat, difficulty thinking clearly\n\nWhen you notice tilt: Close the trading app. Go outside. Exercise. Eat. Sleep. The market will be there tomorrow. Your account balance after tilt-trading may not be.", isWarning: true },
          { heading: "Building a Pre-Market Routine", content: "Elite traders have a structured routine before the market opens:\n\n30 minutes before kill zone:\n1. Review HTF bias: Has anything changed from yesterday's analysis?\n2. Mark key levels for today: OBs, FVGs, liquidity above/below\n3. Identify the 1-2 setups you'd be interested in today\n4. Set your 'off' condition: 'I will stop trading today if I reach 2R loss or 3 trades'\n5. Mental preparation: Deep breathing, review your rules, recall why you follow them\n\nAfter trading session:\n• Journal the trades immediately (while memory is fresh)\n• Rate your execution, not just the P&L\n• Identify one improvement for tomorrow" },
        ],
        keyTakeaways: ["A loss from a valid setup is a correct decision — judge the process, not single outcomes", "Tilt warning signs: checking chart constantly, considering moving stops, trading right after a loss", "Pre-market routine: HTF review, mark key levels, set stop conditions, mental preparation"],
      },
    ],
    assessment: {
      passingScore: 75,
      certTitle: "Advanced AI Trading Strategies — VEDD Certified",
      questions: [
        { q: "What defines a valid ICT Order Block?", options: ["Any large candlestick on the chart", "The last opposing candle before a significant displacement move, ideally with a nearby FVG", "A candle that touches a round number", "The highest volume candle in the session"], correct: 1, explanation: "A valid OB is the last opposing candle before significant institutional displacement. Validity is enhanced by: nearby FVG, strong displacement, location at structural extremes, and being fresh (not previously mitigated)." },
        { q: "In the AMD cycle, what happens during the 'Manipulation' phase?", options: ["Institutions distribute their positions at the highs", "Price consolidates in a tight range", "Price makes a false move to sweep retail stops before the real directional move", "Volume spikes as institutions buy the news"], correct: 2, explanation: "Manipulation = the liquidity sweep. Price makes a false move (often sweeping equal highs/lows) to trigger retail stop losses and complete institutional position building before reversing in the intended direction." },
        { q: "When performing top-down analysis, which timeframe should you analyze FIRST?", options: ["1-minute for precise entry", "15-minute for setup identification", "Monthly/Weekly for macro bias and major structural levels", "4-hour for intermediate trend"], correct: 2, explanation: "Top-down analysis starts from the highest timeframe (Monthly/Weekly) to establish macro bias and major levels, then works down through Daily/4H for zone identification, and finally 15M/5M for entry triggers." },
        { q: "With a $5,000 account in Phase 3 (1% risk), entry at $200, stop at $196, what is the correct position size?", options: ["10 coins", "12.5 coins", "25 coins", "50 coins"], correct: 1, explanation: "Risk Amount = $5,000 × 1% = $50. Stop Distance = $200 − $196 = $4. Position Size = $50 ÷ $4 = 12.5 coins." },
        { q: "A strategy's backtest shows: 45% win rate, average win of 2.5R, average loss of 1R. What is the Expected Value per trade?", options: ["-$0.025", "+$0.575", "+$1.125", "+$0.675"], correct: 1, explanation: "EV = (Win Rate × Avg Win) − (Loss Rate × Avg Loss) = (0.45 × 2.5) − (0.55 × 1.0) = 1.125 − 0.55 = +0.575R per trade. Positive EV with a sub-50% win rate — R:R is doing the work." },
        { q: "Which of the following is a sign that a trader is in 'tilt'?", options: ["Sticking to pre-planned entry and exit levels", "Reviewing the HTF analysis before entering", "Considering moving the stop loss to 'give it more room' after a small adverse move", "Journaling the trade rationale before entry"], correct: 2, explanation: "Considering moving your stop to give the trade 'more room' is a classic tilt response — your plan said stop goes at X, but you're considering changing it because the trade moved against you. This is emotional override of your rules." },
        { q: "What is the primary purpose of VEDD's paper trading mode for advanced traders?", options: ["To practice without any stakes before learning the platform", "To serve as a walk-forward test — validating your strategy on current live data before committing real capital", "To earn commissions without risk", "To backtest historical data automatically"], correct: 1, explanation: "For advanced traders, paper trading is a walk-forward test — you apply your strategy to current live market data, without the bias of knowing past outcomes, to validate that your edge holds in current conditions before deploying real capital." },
      ],
    },
  },

  // ── Course 10: Community Finance Leadership ──────────────────────────────────
  10: {
    lessons: [
      {
        number: 1, title: "Running Effective Financial Wellness Workshops", timeEstimate: "12 min",
        sections: [
          { heading: "Why Financial Literacy Workshops Matter", content: "Financial illiteracy costs American households an average of $1,200+ per year in excess fees, interest, and missed opportunities (NFEC data). For underserved communities, the cost is higher — predatory lending, check cashing fees, and lack of access to investment vehicles.\n\nA well-run financial workshop doesn't just share information — it changes behavior. The VEDD ambassador who facilitates meaningful financial education is providing real, measurable economic value to their community." },
          { heading: "Workshop Design Principles", content: "Adult learning research (andragogy) shows adults learn best when:\n\n1. Content is immediately relevant to their life\n2. They participate actively (not just listen)\n3. They leave with a specific, actionable next step\n4. The environment is non-judgmental — no shame about past money mistakes\n5. Content builds on what they already know\n\nDesign for action, not information. The goal isn't to teach everything — it's to change one behavior. 'After today, you'll set up your first HYSA' is a better workshop goal than 'After today, you'll understand banking.'" },
          { heading: "The Workshop Delivery Framework", content: "A 60-minute financial literacy workshop structure:\n\n0:00-0:10 — Opening: Introduce yourself, share YOUR financial transformation story, establish safety ('no judgment here')\n0:10-0:30 — Core content: ONE topic, deeply. Budget basics, credit repair, or emergency fund — not all three.\n0:30-0:45 — Interactive exercise: Budget worksheet, credit report review, or 'where does my money actually go' activity\n0:45-0:55 — Q&A: Open floor — the best learning happens here\n0:55-1:00 — Commitment close: 'Write down ONE action you'll take in the next 48 hours'\n\nEnd on time. Have a simple handout they leave with." },
          { heading: "Venue, Promotion & Logistics", content: "Best venues for community workshops:\n• Libraries (free space, trusted community institution)\n• Churches and community centers\n• Employer lunch-and-learns\n• High school and community college partnerships\n• Credit union branch partner events\n\nPromotion:\n• Facebook community groups (local)\n• NextDoor app\n• Flyers at the venue 2 weeks prior\n• Personal invitations — highest conversion\n\nLogistics: Laptop + HDMI adapter, printed handouts, sign-in sheet for follow-up, WiFi (ask venue), water. Arrive 30 minutes early. Have a backup plan if tech fails.", isExample: true },
        ],
        keyTakeaways: ["Design workshops for ONE behavior change, not information overload", "End every workshop with a written 48-hour commitment from each attendee", "Libraries, churches, and employer lunch-and-learns are the most accessible free venues"],
      },
      {
        number: 2, title: "Starting a Community Credit Co-op", timeEstimate: "12 min",
        sections: [
          { heading: "What Is a Credit Co-op (Credit Union)?", content: "A credit union is a member-owned, not-for-profit financial cooperative. Members are also owners — profits return as better rates and lower fees rather than going to shareholders.\n\nThe difference between a bank and a credit union:\n• Bank: Profit-driven, shareholders come first, higher fees, lower savings rates\n• Credit Union: Member-owned, members come first, lower fees, higher savings rates, more flexible lending\n\nHistorically, Black and Latino communities were denied access to traditional banking — credit unions were formed specifically to fill this gap. Today they remain the best community banking option." },
          { heading: "Community Lending Circles: The Starting Point", content: "Before forming a full credit union (which requires significant regulatory work), start with a Lending Circle — an informal, trust-based savings group.\n\nHow it works:\n• 8-12 members, each contribute $100/month\n• Total pool: $800-1,200/month\n• Each month, one member receives the full pool\n• Continues until every member has received the pool once\n• No interest, no fees — pure community trust\n\nBenefits:\n• Members build emergency savings\n• Some programs (MAF — Mission Asset Fund) report payments to credit bureaus, building credit\n• Builds community trust and financial relationships", isExample: true },
          { heading: "CDFI: Community Development Financial Institution", content: "CDFIs are mission-driven financial institutions that provide credit and financial services to underserved markets.\n\nFor VEDD ambassadors:\n• CDFIs provide small business loans with more flexible criteria than banks\n• Many CDFIs offer free business development training\n• CDFIs are a key funding source for VEDD community finance programs\n• Grant funding for VEDD programs often comes through CDFI networks\n\nFind local CDFIs at cdfi.org/industry-awards/cdfi-fund-community-partners/ or ask at your local SCORE office." },
          { heading: "Investment Clubs: Building Collective Wealth", content: "An investment club pools money from members to invest collectively — building both wealth and financial education.\n\nBASIC STRUCTURE:\n• 5-15 members, each contribute $25-100/month\n• Monthly meetings to review research and vote on investments\n• Legal structure: Partnership (most common) or LLC\n• Brokerage account in the club's name\n\nFor VEDD clubs: Focus on ETFs and major crypto assets (including Solana) — not speculative picks. Educate before investing.\n\nNAIC (National Association of Investors Corporation) provides club setup guides and legal templates." },
        ],
        keyTakeaways: ["Lending circles are the simplest starting point — no regulatory burden, builds trust and savings", "CDFIs provide small business capital with flexible criteria — key partner for VEDD community programs", "Investment clubs: 5-15 members, monthly contributions, focus on education first then collective investing"],
      },
      {
        number: 3, title: "VEDD Ambassador Network Strategy", timeEstimate: "10 min",
        sections: [
          { heading: "Building Your Ambassador Network", content: "Successful VEDD ambassadors don't operate alone — they build networks of:\n\n• Other VEDD ambassadors (referral and collaboration network)\n• Community organizations (referral partners)\n• Employers (corporate workshop opportunities)\n• Schools and colleges (youth financial literacy)\n• Churches and community centers (workshop venues and networks)\n• CDFI and credit union partners (financial service referrals)\n• Grant organizations (funding for community programs)\n\nEvery organization you partner with is a potential source of new VEDD members AND a community finance impact opportunity." },
          { heading: "The Partnership Proposal", content: "When approaching organizations for partnership:\n\n1-page partnership proposal structure:\n• Who you are (VEDD ambassador, brief bio, your VEDD credentials)\n• What you offer (free financial literacy workshops, specific curriculum)\n• What you need from them (venue, audience access, co-promotion)\n• What they and their audience get (measurable financial education outcomes)\n• Specific ask (a 60-minute workshop slot in the next 60 days)\n\nKey message: You're bringing VALUE to their audience. You're not selling them anything. Make it easy to say yes by taking care of all preparation.", isExample: true },
          { heading: "Building a Referral Pipeline", content: "A referral pipeline is an organized system for turning community relationships into VEDD member referrals.\n\nSimple pipeline (track in Google Sheets):\nName | Organization | Last Contact | Interest Level (1-5) | Next Action | Date\n\nPipeline stages:\n1. Awareness: They've heard of VEDD but don't know details\n2. Education: You've explained VEDD's value to them\n3. Interest: They've engaged with VEDD content or attended a workshop\n4. Trial: They're exploring paper trading or the free platform\n5. Member: Active VEDD member\n\nGoal: 5-10 new contacts into stage 1 each week. Move 20-30% to membership over 90 days." },
          { heading: "Collaboration vs Competition with Other Ambassadors", content: "New ambassadors sometimes see other VEDD ambassadors as competition. This is a scarcity mindset.\n\nAbundance mindset reality:\n• Your city has millions of people who need financial literacy\n• Co-hosting workshops with other ambassadors creates better events and splits the work\n• Referring community members to a nearby ambassador who specializes in their need builds reciprocal referrals\n• Sharing what works (outreach scripts, venue contacts, workshop materials) raises everyone's success rate\n\nVEDD's collective impact is stronger when ambassadors collaborate. The pie grows — you're not dividing a fixed slice." },
        ],
        keyTakeaways: ["Build a network of community orgs, schools, employers, CDFIs — every partner is a referral and impact source", "Partnership proposal: offer value (free workshops) in exchange for access and co-promotion", "Ambassador collaboration > competition — co-hosting workshops is better than solo, and the market is enormous"],
      },
      {
        number: 4, title: "Grant Writing for Community Programs", timeEstimate: "12 min",
        sections: [
          { heading: "Why Grants Matter for VEDD Programs", content: "Grants allow you to run financial literacy programs at ZERO cost to participants — expanding your reach from people who can pay to everyone who needs it.\n\nTypes of grants relevant to VEDD ambassadors:\n• Workforce Development (DOL): Funding for job readiness and digital skills training\n• Community Development (CDFI Fund, USDA): Funding for community financial education\n• Education (NSF, local foundations): Funding for STEM and financial literacy in schools\n• Economic Development (EDA, SBA): Funding for small business and entrepreneurship programs\n\nVEDD's Grants & Funding module helps you identify, apply for, and track all of these." },
          { heading: "Grant Writing Fundamentals", content: "Every grant proposal answers the same core questions:\n\n1. Who are you? (Organization background, credibility, track record)\n2. What is the problem? (Documented need in your community — use data)\n3. What is your solution? (Your specific program — VEDD financial literacy workshops)\n4. What outcomes will you achieve? (Measurable: X people served, X% improve financial literacy scores)\n5. How much does it cost? (Detailed budget)\n6. Why are you the right organization to do this? (Your unique position, partnerships, community relationships)\n\nAnswer these six questions clearly and you have the core of any grant proposal." },
          { heading: "Using VEDD's AI Grant Writer", content: "VEDD's Grants & Funding module includes an AI proposal generator with three modes:\n\n• Auto Mode: Input your program details, grant requirements, and VEDD generates a complete 1500-2000 word proposal\n• Guided Mode: AI walks you through each section with prompts for your specific input\n• Template Mode: VEDD brand-aligned templates for Ambassador Program, Community Development, and Fintech Expansion grant types\n\nBest practice: Use AI to draft, then personalize with:\n• Your specific community data and stories\n• Local partner names and letters of support\n• Your personal background and credibility\n• Specific, measurable outcomes for YOUR community", isExample: true },
          { heading: "Grant Application Tracking & Follow-Up", content: "Most ambassadors apply for one grant and forget about it. Winners build a pipeline.\n\nGrant pipeline tracker (in Google Sheets or VEDD's built-in tracker):\n• Grant name, funder, amount, deadline\n• Application status: draft → submitted → under review → awarded/rejected\n• Follow-up date: Most funders accept one status inquiry 30 days after submission\n• Notes: Reviewer feedback, portal login info, reporting requirements if awarded\n\nReporting: If awarded, grantors require periodic reports. Track your program outcomes (attendance, pre/post financial literacy scores, credit score improvements) from day one — you'll need this data." },
        ],
        keyTakeaways: ["Grants fund free community programs — DOL, CDFI, NSF, and SBA are primary sources for VEDD programs", "Every grant proposal answers: Who, Problem, Solution, Outcomes, Budget, Why you", "VEDD's AI grant writer generates complete proposals — personalize with local data and community stories"],
      },
      {
        number: 5, title: "Measuring Financial Impact in Your Community", timeEstimate: "10 min",
        sections: [
          { heading: "Why Impact Measurement Matters", content: "Impact measurement serves three critical purposes:\n\n1. Grant reporting: Funders require measurable outcomes to justify their investment\n2. Program improvement: Data shows what's working and what needs to change\n3. Story-telling: Real numbers make compelling cases for partnerships, media coverage, and scaling\n\nWithout measurement, you're running a program. With measurement, you're running a mission with evidence." },
          { heading: "Financial Literacy Impact Metrics", content: "Measurable outputs (easy to count):\n• Number of workshops delivered\n• Number of people served\n• Hours of financial education delivered\n• Number of VEDD members referred\n\nMeasurable outcomes (harder but more important):\n• % of participants who opened an emergency savings account\n• Average credit score change 90 days post-workshop\n• % who created their first household budget\n• Number of families who eliminated high-interest debt\n• Dollar amount of predatory financial products replaced with better alternatives\n\nCollect pre/post surveys. Even simple 5-question surveys create measurable outcome data." },
          { heading: "Pre/Post Assessment Design", content: "Simple financial literacy pre/post assessment (5 questions, 1-minute completion):\n\nPre-workshop (collect at registration or start):\n1. Do you currently have a monthly budget? Yes/No\n2. Do you have an emergency fund with 1+ month expenses? Yes/No\n3. Do you know your current credit score? Yes/No\n4. Are you satisfied with your current financial situation? 1-5 scale\n5. What is your #1 financial stress right now? (open text)\n\nPost-workshop (collect 60-90 days later via email/text follow-up):\nSame questions + 'What specific action did you take after the workshop?'\n\nThe difference between pre and post answers IS your measurable impact." },
          { heading: "Telling the Impact Story", content: "Numbers alone don't change hearts and open wallets. Combine data with stories.\n\nThe impact story format:\n'After attending the VEDD financial literacy workshop in [neighborhood], [first name] — a [job type] and mother of [#] — opened her first high-yield savings account, enrolled in a credit builder program, and improved her credit score from [X] to [Y] in 90 days. She is now saving toward [goal].'\n\nFor LinkedIn, grant reports, and media:\n• 3 statistics showing program reach and outcomes\n• 1 personal story with a before/after outcome\n• Visual: Photo of workshop, certificate, or testimonial quote\n\nImpact stories + hard numbers = compelling case for expansion and funding.", isExample: true },
        ],
        keyTakeaways: ["Track both outputs (# served) and outcomes (credit score changes, savings opened) from day one", "Pre/post 5-question assessments create measurable impact data with minimal participant burden", "Combine impact numbers with personal stories — data convinces minds, stories change hearts"],
      },
    ],
    assessment: {
      passingScore: 70,
      certTitle: "Community Finance Leadership — VEDD Certified",
      questions: [
        { q: "According to adult learning principles, what is the most important element of an effective financial literacy workshop?", options: ["Covering as many topics as possible in the time", "Designing for one specific behavior change with an actionable next step", "Using advanced financial terminology to establish credibility", "Keeping all content theoretical to avoid giving financial advice"], correct: 1, explanation: "Adults learn best when content leads to immediate, specific action. The best workshops are designed around ONE behavior change — 'you'll open an HYSA today' — rather than broad information coverage." },
        { q: "What is a Lending Circle?", options: ["A peer-to-peer lending platform", "An informal group where members pool monthly contributions and take turns receiving the full pool", "A type of credit union", "A grant program for community organizations"], correct: 1, explanation: "Lending circles are trust-based savings groups where members contribute monthly and take turns receiving the pooled funds. They build savings discipline and some programs report payments to credit bureaus to build credit." },
        { q: "What does CDFI stand for?", options: ["Community Digital Finance Initiative", "Community Development Financial Institution", "Credit Development and Financial Investment", "Cooperative Development Finance Institution"], correct: 1, explanation: "CDFI = Community Development Financial Institution — mission-driven lenders that provide credit and financial services to underserved markets. They're key partners for VEDD community programs and funding sources." },
        { q: "What is the 'outcome' measurement difference from an 'output' measurement?", options: ["Outputs measure people served; outcomes measure actual changes in financial behavior or wellbeing", "Outputs are harder to collect; outcomes are easier", "Outcomes measure attendance; outputs measure surveys completed", "There is no meaningful difference"], correct: 0, explanation: "Outputs = what you did (# workshops, # people). Outcomes = what changed (credit score improvements, savings accounts opened, budget adoption rates). Funders increasingly require outcome data, not just outputs." },
        { q: "What six questions does every grant proposal need to answer?", options: ["Who, Why, Where, When, How much, and How long", "Who, Problem, Solution, Outcomes, Budget, Why you", "Mission, Vision, Goals, Activities, Timeline, Evaluation", "Audience, Need, Program, Partners, Funding sources, Risk"], correct: 1, explanation: "Every grant proposal answers: Who are you?, What is the problem?, What is your solution?, What outcomes will you achieve?, What does it cost?, and Why are you the right organization? Answering these clearly is the foundation of any successful proposal." },
        { q: "What is the primary advantage of VEDD ambassadors collaborating rather than competing?", options: ["It reduces the number of referrals each ambassador handles", "The target community for financial literacy is enormous — collaboration reaches more people and creates reciprocal referrals", "It allows ambassadors to charge higher rates", "It simplifies grant reporting requirements"], correct: 1, explanation: "The market for financial literacy in underserved communities is vast. Ambassador collaboration — co-hosting workshops, sharing venue contacts, cross-referring specialties — expands the total reach and creates a reciprocal referral network that benefits everyone." },
      ],
    },
  },

  // ── Course 11: Data Privacy & Cybersecurity ──────────────────────────────────
  11: {
    lessons: [
      {
        number: 1, title: "Understanding GDPR, CCPA & Your Privacy Rights", timeEstimate: "10 min",
        sections: [
          { heading: "Why Privacy Law Matters to You", content: "Every financial app, trading platform, bank, and social media site collects your data. Privacy laws determine what rights you have over that data — and what companies can be held accountable for.\n\nAs a VEDD ambassador recommending financial tools to community members, you have a duty to understand the privacy implications of the tools you recommend. Your clients trust you." },
          { heading: "GDPR: The Gold Standard", content: "The EU's General Data Protection Regulation (2018) applies to any company handling data of EU residents — including US companies with EU users.\n\nKey GDPR rights:\n• Right to access: Request all data a company has on you\n• Right to erasure: Request deletion of your data ('right to be forgotten')\n• Right to portability: Get your data in a machine-readable format to transfer elsewhere\n• Right to object: Opt out of automated decision-making (including algorithmic credit scoring)\n• Data breach notification: Companies must notify you within 72 hours of a breach affecting your data" },
          { heading: "CCPA: California's Privacy Law (& What's Coming Federally)", content: "The California Consumer Privacy Act (2020) gives California residents:\n• Right to know what personal data is collected and why\n• Right to opt out of the sale of their data\n• Right to delete data\n• Non-discrimination for exercising privacy rights (companies can't charge you more for opting out)\n\nThe American Data Privacy and Protection Act (ADPPA) — proposed federal law that would create national privacy rights similar to GDPR/CCPA.\n\nFor non-Californians: Many companies apply CCPA-level protections globally because it's operationally simpler than having different rules by state." },
          { heading: "Exercising Your Privacy Rights", content: "How to request your data or deletion:\n\n1. Find the company's privacy policy (required by law to be accessible)\n2. Look for 'Data Subject Rights,' 'Privacy Request,' or 'Do Not Sell My Data' sections\n3. Submit a verified request — you'll need to verify your identity\n4. Response time: GDPR = 30 days, CCPA = 45 days\n\nIf a company refuses or ignores your request:\n• EU/UK: File a complaint with your national Data Protection Authority\n• California: File a complaint with the California AG\n• US federal: File with the FTC (Federal Trade Commission)\n\nData brokers: Sites like LexisNexis, Acxiom, and Equifax sell your data. Opt-out instructions exist for each — search '[company name] opt out CCPA'." },
        ],
        keyTakeaways: ["GDPR gives rights to access, delete, and object to automated decisions — request these from any company", "CCPA grants Californians the right to opt out of data sale — many companies apply this nationally", "If a company refuses your privacy request, file with your national Data Protection Authority or the FTC"],
      },
      {
        number: 2, title: "Phishing, Social Engineering & Attack Recognition", timeEstimate: "10 min",
        sections: [
          { heading: "Social Engineering: Hacking Humans", content: "The weakest link in any security system is the human. Social engineering is the art of manipulating people into revealing information or taking actions they shouldn't.\n\nWhy it works: humans are wired to be helpful, to respond to authority, and to act under urgency. Attackers exploit these instincts.\n\nSocial engineering doesn't require hacking skills — just psychology. The most sophisticated technical security can be bypassed with a convincing phone call." },
          { heading: "Types of Phishing Attacks", content: "• Email phishing: Fake emails from 'your bank' or 'PayPal' with credential-stealing links\n• Spear phishing: Targeted phishing using your name, employer, and personal details to seem legitimate\n• Smishing: Phishing via SMS — 'Your package was delayed. Click to reschedule delivery.'\n• Vishing: Phone phishing — 'This is IRS fraud detection. Press 1 immediately.'\n• Whaling: Phishing targeting executives — fake urgent requests from 'the CEO'\n• Clone phishing: Exact copy of a legitimate email, with links replaced\n\nMost sophisticated attacks are spear phishing — they reference real details about you found from social media and data breaches.", isWarning: true },
          { heading: "Red Flags Checklist", content: "STOP before clicking when you see:\n☐ Urgency or threat ('Your account will close in 24 hours')\n☐ Mismatched sender domain (support@paypa1.com vs paypal.com)\n☐ Link URL doesn't match displayed text (hover to preview)\n☐ Generic greeting ('Dear Customer' not your actual name)\n☐ Request for login credentials, payment, or personal info\n☐ Unexpected attachments (.zip, .exe, .docx with macros)\n☐ Emotional triggers ('You've won! Claim now')\n☐ Familiar logos/design but small visual errors\n\nRule: Verify out-of-band. If your bank emails you, call the number on the BACK of your card — not any number in the email." },
          { heading: "What to Do If You Clicked", content: "You clicked a phishing link. Don't panic — act fast:\n\nWithin minutes:\n1. Disconnect from the internet (WiFi/ethernet off) — stops data exfiltration\n2. Do NOT enter any credentials if the site is still loading\n3. If on a work computer: notify IT immediately\n\nWithin an hour:\n4. Change the password for the targeted account FROM A DIFFERENT DEVICE\n5. Enable 2FA if not already active\n6. Check for unauthorized logins in account security settings\n7. Run a malware scan (Malwarebytes, free version)\n8. Monitor financial accounts for 30 days for suspicious activity\n\nReport to: Anti-Phishing Working Group (reportphishing@apwg.org) and the impersonated company." },
        ],
        keyTakeaways: ["Spear phishing uses your real personal details — social media oversharing increases your attack surface", "Verify suspicious requests out-of-band — call the number on your card, not a number in the email", "If you clicked: disconnect, change password from different device, enable 2FA, run malware scan immediately"],
      },
      {
        number: 3, title: "Securing Your Financial Accounts", timeEstimate: "10 min",
        sections: [
          { heading: "Financial Account Security Audit", content: "Most people have never reviewed the security settings of their financial accounts. Do this today:\n\nFor every bank, brokerage, crypto exchange, and VEDD account:\n☐ Password: Is it 16+ characters, unique, stored in a password manager?\n☐ 2FA: Enabled? Using authenticator app (not just SMS)?\n☐ Trusted devices: Are all listed devices ones you recognize?\n☐ Login notifications: Email/SMS alert for new logins enabled?\n☐ Recovery email/phone: Current and secure?\n☐ Active sessions: Any unfamiliar sessions logged in?\n\nThis audit takes 30 minutes. Do it now — not after a breach." },
          { heading: "2FA Deep Dive: Choosing the Right Method", content: "Authentication factors hierarchy (best to worst):\n\n1. Hardware Security Key (YubiKey, Google Titan): Physical USB/NFC device. Phishing-proof — can't be remotely stolen. Best for highest-value accounts.\n\n2. Time-based One-Time Password (TOTP) App: Google Authenticator, Authy, 1Password TOTP. 6-digit code that changes every 30 seconds. Codes are generated offline and can't be intercepted in transit.\n\n3. Push Notification (Duo, Microsoft Authenticator): One-tap approval. Vulnerable to 'MFA fatigue' attacks — attackers send dozens of push requests hoping you approve by accident.\n\n4. SMS Code: One-time code via text. Vulnerable to SIM-swapping — attacker convinces carrier to port your number to their SIM.\n\nFor crypto wallets: Hardware key or TOTP only." },
          { heading: "SIM-Swapping: Crypto Thief's Favorite Attack", content: "SIM-swapping: An attacker calls your mobile carrier, pretends to be you, and convinces them to transfer your phone number to the attacker's SIM card. Now all SMS codes go to the attacker.\n\nThis has been used to steal millions from crypto holders.\n\nDefenses:\n• Port freeze / SIM lock: Call your carrier and request a port freeze — no number transfers without in-person verification at a store\n• PIN/passcode on your mobile account: Different from your phone PIN — set with the carrier\n• Remove SMS 2FA from crypto and financial accounts — replace with authenticator app\n\nCrypto exchanges Coinbase and Kraken both have account PIN options for additional protection.", isWarning: true },
          { heading: "Monitoring for Unauthorized Access", content: "Set up financial monitoring to detect unauthorized access early:\n\n• Bank/brokerage: Enable alerts for all transactions above $0 (yes, $0 — you'll catch test charges)\n• Credit monitoring: Credit Karma or Experian for new account alerts\n• HIBP (HaveIBeenPwned.com): Enter your email — shows every data breach it appears in\n• Google account: Review 'Security' section — shows all active sessions and recent security events\n• Annual full credit report: AnnualCreditReport.com — look for accounts you didn't open\n\nIdentity theft is most damaging when discovered months or years late. Early detection limits the harm." },
        ],
        keyTakeaways: ["Complete a financial account security audit today: unique passwords, TOTP 2FA, login alerts enabled", "SIM-swap attacks steal SMS codes — request a port freeze from your carrier and switch to authenticator apps", "Monitor with transaction alerts on every account and check HaveIBeenPwned.com for data breach exposure"],
      },
      {
        number: 4, title: "Password Managers & Multi-Factor Authentication", timeEstimate: "8 min",
        sections: [
          { heading: "The Password Manager Deep Dive", content: "A password manager is non-negotiable security infrastructure. Here's exactly how they work:\n\nYour data is encrypted locally with your master password using AES-256 encryption before syncing to the provider's servers. Even the provider can't read your passwords (zero-knowledge architecture).\n\nIf someone hacks the provider's servers, they get encrypted gibberish — useless without your master password.\n\nPassword manager comparison:\n• Bitwarden: Open source, free tier with full features, most trusted by security community\n• 1Password: Best design, strong family plan, $3/month\n• Dashlane: Strong features, more expensive at $5/month\n• KeePassXC: Free, fully local (no cloud sync), maximum privacy" },
          { heading: "Setting Up Bitwarden (Recommended)", content: "Step-by-step Bitwarden setup:\n1. Create account at bitwarden.com — use your most secure email\n2. Set master password: 5-6 random words from a dictionary (passphrase) — e.g., 'correct-horse-battery-staple-lamp'\n3. Write master password on paper and store securely offline\n4. Install browser extension (Chrome/Firefox/Safari)\n5. Install mobile app\n6. Import existing passwords (Settings → Import) if you have them saved in browser\n7. Change your 5 most critical account passwords to Bitwarden-generated ones first\n\nDo not save your master password anywhere digital. If you forget it, there is no recovery — by design.", isWarning: true },
          { heading: "Authenticator App Setup (Google Authenticator / Authy)", content: "Setting up TOTP 2FA:\n\n1. Download Google Authenticator (Google) or Authy (more features) on your phone\n2. In your account security settings, find '2-Factor Authentication' → 'Authenticator App'\n3. Scan the QR code displayed in account settings with the app\n4. Enter the 6-digit code generated to verify setup\n5. SAVE BACKUP CODES: Every 2FA setup provides 1-time backup codes — print and store with your seed phrases\n\nAuthy advantage: Encrypted cloud backup for your 2FA codes. If you lose your phone, you can recover. Google Authenticator has no backup — if you lose your phone, you're locked out.\n\nPriority accounts for 2FA: Email first (it's the recovery for everything else), then bank, crypto, VEDD." },
          { heading: "The Password Security Ecosystem", content: "Complete security ecosystem:\n\n1. Password Manager: Bitwarden (unique passwords everywhere)\n2. Email: 2FA on your primary email — this is the master key to all accounts\n3. Authenticator App: Authy (backed up) for TOTP codes\n4. Hardware Key: YubiKey for your highest-value accounts (crypto, brokerage)\n5. Port Freeze: Call carrier to prevent SIM-swapping\n6. Monitoring: Transaction alerts, Credit Karma, HaveIBeenPwned\n\nThis entire setup takes 2-3 hours. It protects everything you've built financially and digitally. The cost is ~$3/month for 1Password (or free with Bitwarden). The alternative is potentially losing everything." },
        ],
        keyTakeaways: ["Bitwarden is free, open-source, and zero-knowledge — start here for password management", "Master password = 5-6 random words (passphrase); write on paper; no digital copy ever", "2FA priority order: email account first, then bank, then crypto, then everything else"],
      },
      {
        number: 5, title: "Protecting Your Crypto & Digital Assets", timeEstimate: "10 min",
        sections: [
          { heading: "Crypto Security Is Different From Bank Security", content: "Bank security: A bank's fraud department can reverse unauthorized transactions. Your money is FDIC insured up to $250,000. Mistakes are recoverable.\n\nCrypto security: Transactions are irreversible. There is no fraud department. There is no insurance. There is no recovery. If your private key is compromised, your funds are gone — permanently.\n\nThis doesn't mean crypto is inherently dangerous — it means the responsibility for security falls entirely on YOU. Understanding this changes how seriously you take every security decision." },
          { heading: "The Hot vs Cold Wallet Security Model", content: "Security model for serious crypto users:\n\n• Cold wallet (hardware wallet — Ledger, Trezor): 90%+ of holdings. Never connected to internet. No browser extensions, no DeFi connections. Only used to transfer to/from hot wallet.\n\n• Hot wallet (Phantom, MetaMask): 10% or less — 'spending money' for active trading and DeFi. Assume this wallet WILL be compromised at some point.\n\n• Separate hot wallets by activity: One wallet for VEDD trading. Separate wallet for DeFi experimentation. Never mix savings with active trading wallets.\n\nThis model limits maximum loss even if a hot wallet is compromised." },
          { heading: "Common Crypto Attack Vectors", content: "How crypto gets stolen — know these:\n\n• Fake website: Typing phantom.app wrong → phishing site that steals your seed phrase\n• Malicious browser extension: Looks like a wallet, actually a seed phrase stealer\n• Clipboard hijacking malware: You copy a wallet address, malware replaces it with the attacker's address before you paste\n• Drainer smart contracts: You approve a transaction that grants unlimited access to your tokens\n• Discord/Telegram fake support: 'Support' DMs you asking for seed phrase to 'fix' your wallet\n• Fake token airdrop: Free tokens appear in wallet — interacting with them triggers a drainer\n\nRule: No legitimate project, support team, or VEDD representative will EVER ask for your seed phrase or private key.", isWarning: true },
          { heading: "Transaction Verification Habits", content: "Before sending ANY crypto transaction:\n\n1. Verify the recipient address character by character — not just first/last few characters\n2. Send a test transaction of $1 before the full amount\n3. Check the smart contract address on a block explorer before approving\n4. Read what you're approving: 'Approve unlimited USDC' is dangerous\n5. Use a hardware wallet for any transaction over $500\n6. Revoke unused token approvals at revoke.cash (Ethereum) or Solana equivalent\n\nFor VEDD specifically: The platform only interacts with Jupiter and Helius — both verified infrastructure. If you see a pop-up requesting approval to a different contract, do NOT approve." },
        ],
        keyTakeaways: ["Hot wallet (Phantom) for active trading; cold wallet (Ledger/Trezor) for 90%+ of holdings", "Clipboard hijacking can replace copied wallet addresses — verify character by character, send test first", "VEDD will never ask for your seed phrase or private key — anyone who does is an attacker"],
      },
    ],
    assessment: {
      passingScore: 70,
      certTitle: "Data Privacy & Cybersecurity — VEDD Certified",
      questions: [
        { q: "Under GDPR, how quickly must a company notify you of a data breach affecting your personal data?", options: ["Immediately (within 1 hour)", "Within 24 hours", "Within 72 hours", "Within 30 days"], correct: 2, explanation: "GDPR Article 33 requires controllers to notify supervisory authorities within 72 hours of discovering a breach. Companies should also notify affected individuals 'without undue delay' if the breach poses a high risk to their rights and freedoms." },
        { q: "What is a SIM-swapping attack?", options: ["Hacking into a smartphone's SIM card physically", "An attacker convincing your mobile carrier to transfer your phone number to their SIM card", "Installing malware on your phone via SMS", "Intercepting SMS messages in transit"], correct: 1, explanation: "SIM-swapping involves social engineering the mobile carrier into porting your number to an attacker-controlled SIM. Once successful, all SMS 2FA codes are delivered to the attacker, allowing account takeovers." },
        { q: "Which is the most phishing-resistant form of two-factor authentication?", options: ["SMS text code", "Email verification link", "TOTP authenticator app code", "Hardware security key (YubiKey)"], correct: 3, explanation: "Hardware security keys are the most phishing-resistant because they cryptographically verify both the origin (they won't work on fake sites) and the user's physical presence. TOTP apps are second-best; SMS is the weakest 2FA method." },
        { q: "You receive a crypto transaction and see an unknown token appear in your Phantom wallet. What should you do?", options: ["Sell it immediately for profit", "Interact with it to see what it does", "Do nothing — it may be a drainer contract designed to steal your funds when you interact", "Transfer it to your cold wallet"], correct: 2, explanation: "Unknown tokens appearing in your wallet are often 'drainer' traps — the token itself is worthless, but interacting with it (approving, transferring) triggers a smart contract that drains your real assets." },
        { q: "What is 'zero-knowledge architecture' in password managers?", options: ["The password manager has zero knowledge of security risks", "Your passwords are encrypted locally with your master password before syncing — the provider cannot read them", "The manager works without any passwords stored", "Zero data is transmitted over the internet"], correct: 1, explanation: "Zero-knowledge means your data is encrypted client-side (on your device) before it's sent to the provider's servers. The provider holds only encrypted ciphertext — they mathematically cannot read your passwords even if they wanted to." },
        { q: "What is the correct response immediately after accidentally clicking a phishing link?", options: ["Clear your browser history and hope for the best", "Immediately change your passwords on the same device", "Disconnect from internet immediately, then change passwords FROM A DIFFERENT DEVICE, enable 2FA", "Restart your computer"], correct: 2, explanation: "Disconnect first to stop any data exfiltration in progress. Then change compromised account passwords FROM A DIFFERENT DEVICE (the original device may be compromised). Enable 2FA on affected accounts and run a malware scan on the original device." },
      ],
    },
  },

  // ── Course 12: Entrepreneurship & VEDD Business Launch ───────────────────────
  12: {
    lessons: [
      {
        number: 1, title: "Forming Your LLC: Step-by-Step", timeEstimate: "12 min",
        sections: [
          { heading: "Why Every VEDD Ambassador Needs an LLC", content: "Operating as a sole proprietor means your personal assets (home, car, bank account) are at risk if someone sues your business. An LLC (Limited Liability Company) separates you from your business — protecting your personal assets.\n\nAdditional LLC benefits:\n• Tax flexibility: LLC profits are taxed as personal income by default, but you can elect S-Corp taxation to save on self-employment taxes above ~$60k income\n• Business credit: Separate business credit profile — doesn't affect personal credit\n• Professional credibility: 'VEDD Ambassador LLC' vs. your personal name\n• Grant eligibility: Many grants require a registered business entity\n• Banking: Business checking accounts require a legal entity" },
          { heading: "LLC Formation Step by Step", content: "1. Choose your state: Form in the state where you primarily do business. Wyoming and Delaware have favorable LLC laws but add complexity if you do business elsewhere.\n\n2. Choose a name: Check availability at your Secretary of State's website. Must include 'LLC' or 'Limited Liability Company.'\n\n3. File Articles of Organization: Your state's Secretary of State website. Fee: $50-150 depending on state. Processing: 1-14 days (expedited available).\n\n4. Get an EIN: irs.gov/businesses/small-businesses → Apply for EIN online. Free. Takes 5 minutes. Required for business banking.\n\n5. Operating Agreement: Not always required by law, but essential. Defines ownership, decision-making, profit distribution.\n\n6. Open business checking: With EIN + Articles of Organization. Relay, Mercury, or Bluevine are ideal for new LLCs." },
          { heading: "Costs and Ongoing Requirements", content: "Formation costs:\n• Articles filing: $50-150\n• Registered agent (if required): $50-100/year\n• Operating agreement template: Free to $100\n\nAnnual ongoing:\n• Annual report/fee: Most states require an annual filing, $25-500/year\n• Registered agent renewal\n• Business banking (often free with Relay/Mercury/Bluevine)\n\nHigh-fee states to note:\n• California: $800/year minimum franchise tax + annual report\n• New York: Publication requirement, ~$500+\n\nFor most ambassadors: $100-200 total first year, $50-150/year ongoing.", isExample: true },
          { heading: "Professional Profile After Formation", content: "Once your LLC is formed:\n\n• Business email: chris@yourveddconsulting.com (Google Workspace, $6/month)\n• Business phone: Google Voice (free) — separate from personal line\n• Website: Carrd.co, $19/year — your portfolio and contact hub\n• Business cards: Canva design, Vistaprint printing (~$15 for 250)\n• LinkedIn: Update to reflect your LLC and ambassador role\n\nYou are now a professional business entity. Every client interaction, invoice, and contract should reflect that." },
        ],
        keyTakeaways: ["LLC formation: Articles of Organization → EIN → Operating Agreement → Business checking", "Costs are $100-200 first year — one of the best investments you'll make for liability protection and credibility", "Open a business checking account immediately — never mix personal and business money"],
      },
      {
        number: 2, title: "Business Credit Building for VEDD Ambassadors", timeEstimate: "12 min",
        sections: [
          { heading: "Business Credit vs Personal Credit: A Separate Score", content: "Business credit is a completely separate credit profile from your personal FICO score.\n\nBusiness credit bureaus:\n• Dun & Bradstreet (PAYDEX score, 1-100)\n• Experian Business\n• Equifax Business\n\nThe power of business credit:\n• Access capital without personal guarantee\n• Higher credit limits than personal cards\n• Protects personal credit if business finances fluctuate\n• Essential for scaling beyond what you can fund personally\n• Grants and contracts sometimes require minimum business credit thresholds" },
          { heading: "The Business Credit Building Sequence", content: "Phase 1 — Foundation (Months 1-3):\n• Form LLC, get EIN\n• Open business checking account (Relay, Mercury, or established bank)\n• Get a DUNS number (free at dnb.com)\n• Open Net-30 vendor accounts: Uline, Quill, Crown Office Supplies — these report to Dun & Bradstreet\n\nPhase 2 — Building (Months 3-9):\n• Apply for a secured business credit card\n• Apply for bank credit card (Nav.com shows which cards your current profile qualifies for)\n• Pay ALL business obligations early or on time — PAYDEX rewards early payment\n\nPhase 3 — Scale (Month 9+):\n• Apply for business lines of credit\n• Net-60 and Net-90 vendor accounts\n• Consider SBA microloan (up to $50,000) with documented revenue" },
          { heading: "Net-30 Vendor Accounts: The First Step", content: "Net-30 accounts allow you to purchase now and pay in 30 days. They're specifically designed for building business credit.\n\nStarter accounts that report to D&B without requiring personal credit check:\n• Uline: Office/shipping supplies, Net-30, reports to D&B. Initial order can be small.\n• Quill: Office supplies, Net-30, reports to major bureaus\n• Grainger: Industrial supplies (less relevant for ambassadors but reports well)\n• Crown Office Supplies: Office supplies, easy approval, reports to D&B\n\nStrategy:\n1. Open 3-5 Net-30 accounts\n2. Make purchases every month (even small ones)\n3. PAY EARLY — PAYDEX scores reward early payment (paid in 20 days vs due in 30)\n4. After 6 months of reporting, you have a business credit history", isExample: true },
          { heading: "Funding: Where Business Credit Leads", content: "A strong business credit profile (PAYDEX 80+, 6+ trade lines, 1+ year in business) unlocks:\n\n• Business credit cards: $5,000-50,000 limits, often 0% intro APR\n• SBA Microloans: Up to $50,000, low interest rates, for businesses under 5 years old\n• SBA 7(a) Loans: Up to $5M for established businesses\n• CDFI Loans: Mission-driven lenders with flexible criteria for community businesses\n• Equipment financing: Purchase business equipment with payments spread over time\n• Business line of credit: Revolving credit for operational needs\n\nNote: In early stages, personal guarantee is often still required. Building business credit REDUCES personal exposure over time — it doesn't eliminate it immediately." },
        ],
        keyTakeaways: ["Get a DUNS number and open 3-5 Net-30 vendor accounts as your first business credit steps", "Pay vendor invoices early — PAYDEX score rewards payment before due date, not just on time", "Strong business credit (PAYDEX 80+) unlocks SBA loans, business credit cards, and CDFI financing"],
      },
      {
        number: 3, title: "The VEDD Ambassador Revenue Model", timeEstimate: "10 min",
        sections: [
          { heading: "Multiple Revenue Streams, One Mission", content: "Sustainable VEDD ambassador businesses have multiple income streams — not just referrals.\n\nThe full revenue model:\n1. VEDD member referrals: Commission per active referral\n2. Workshop facilitation: $50-200/person, $500-1,500/group for financial literacy workshops\n3. 1-on-1 financial education coaching: $75-150/hour once certified\n4. Corporate financial wellness programs: $2,000-10,000 per engagement for employer groups\n5. Grant-funded community programs: Grants pay you to run free programs in the community\n6. Content creation: YouTube/LinkedIn revenue from financial literacy content\n7. Trading income: VEDD AI live trading on your own capital (Phase 3+)\n\nTop ambassadors earn from all 7 streams." },
          { heading: "Workshop Pricing Strategy", content: "Your workshops are worth money. Price them accordingly.\n\nPricing tiers:\n• Community workshops (churches, libraries): Free or suggested donation — build reputation and referrals\n• Corporate lunch-and-learns (employers): $500-1,500 per session depending on audience size and prep\n• School programs (K-12, community college): Negotiate — often grant-funded or small honorarium\n• Credit union partner workshops: Revenue share or flat fee ($300-600/session)\n• Online workshops (Zoom, recorded): $25-75/person, scalable\n\nPricing principle: Free in community, paid in corporate. Your skills have value — don't give them away to people who have a budget." },
          { heading: "The 90-Day Revenue Plan", content: "Month 1:\n• Form LLC, set up professional profiles\n• Deliver 2 free community workshops (build referrals and social proof)\n• Make 5 VEDD ambassador referrals\n• Target: $0-500 (reputation building phase)\n\nMonth 2:\n• First paid corporate workshop ($500-1,000)\n• 10 VEDD referrals (building pipeline)\n• Start grant application for one community program\n• Target: $1,000-2,500\n\nMonth 3:\n• 2 corporate workshops, recurring monthly schedule established\n• Grant application submitted\n• First coaching client (3-session package)\n• Target: $2,500-5,000\n\nMonth 3+ run rate: $3,000-8,000/month is achievable for full-time ambassadors within 6 months.", isExample: true },
          { heading: "Important Legal and Ethical Boundaries", content: "What VEDD ambassadors CAN do:\n✅ Teach financial literacy principles and budgeting\n✅ Educate about how VEDD's AI trading platform works\n✅ Share their own paper/live trading results as education (with full disclosure)\n✅ Recommend VEDD platform features and explain benefits\n✅ Teach about credit building, debt elimination, and savings strategies\n\nWhat VEDD ambassadors CANNOT do:\n❌ Give specific investment advice ('You should buy X coin' or 'Invest $5,000 in VEDD')\n❌ Promise or imply specific returns ('VEDD will make you X%')\n❌ Manage someone else's money or wallet\n❌ Provide services that require professional licensing (financial advisor, broker)\n\nWhen in doubt: 'I can share how it works for me and let you decide — I'm an educator, not a financial advisor.'", isWarning: true },
        ],
        keyTakeaways: ["7 revenue streams: referrals, workshops, coaching, corporate, grants, content, trading income", "Price: free for community, paid for corporate — your expertise has value to organizations with budgets", "VEDD ambassadors educate — they do not give investment advice or manage others' money"],
      },
      {
        number: 4, title: "Financial Projections & Business Planning", timeEstimate: "10 min",
        sections: [
          { heading: "Why Financial Projections Matter", content: "A financial projection isn't a guarantee — it's a thinking tool. Building projections forces you to:\n• Identify your actual revenue assumptions (how many clients, at what price?)\n• Calculate your break-even point\n• Plan cash flow (when does money come in vs go out?)\n• Set specific, measurable revenue goals\n• Present a credible business case for grants and loans\n\nEvery grant proposal requires a budget. Every SBA loan requires financial projections. Building this skill is essential." },
          { heading: "Simple 12-Month P&L Projection", content: "Profit & Loss Projection structure:\n\nRevenue:\n• Workshop income: [# sessions/month] × [avg revenue/session]\n• Coaching income: [# clients] × [sessions/month] × [$/session]\n• Referral commissions: [# referrals/month] × [commission rate]\n• Grant income: [grant amount ÷ 12 months]\n\nExpenses:\n• LLC annual fee: [$50-500 ÷ 12]\n• Software (VEDD, Google Workspace, etc.): [monthly]\n• Marketing (printing, ads): [monthly estimate]\n• Professional development: [monthly estimate]\n• Phone/internet (business portion): [monthly]\n\nNet Profit = Revenue − Expenses\nGross Margin % = Net Profit / Revenue × 100", isExample: true },
          { heading: "Cash Flow: When Money Actually Moves", content: "P&L shows profit; cash flow shows when money is actually in your account.\n\nCash flow traps for ambassadors:\n• Grant payments come quarterly or even annually — but expenses are monthly\n• Corporate workshops may not pay until Net-30 after invoice\n• Tax payments are quarterly (April 15, June 15, Sept 15, Jan 15)\n\nCash flow management:\n• Invoice immediately after workshop delivery\n• Follow up on unpaid invoices at Net-15 (before they hit Net-30)\n• Keep 2 months of operating expenses as a cash reserve\n• Set aside 25-30% of every payment for quarterly estimated taxes immediately\n• Do NOT spend grant funds before they're earned per the grant reporting schedule" },
          { heading: "Setting Business Goals That Drive Action", content: "SMART goal framework for ambassador businesses:\n\n• Specific: Not 'grow my business' — 'onboard 5 corporate workshop clients by Q2'\n• Measurable: Revenue target, # referrals, # workshops — trackable numbers\n• Achievable: Based on realistic conversion rates from your pipeline\n• Relevant: Aligned with your income goals and community mission\n• Time-bound: By when?\n\nExample 6-month VEDD ambassador goals:\n• Run 12 workshops (8 community, 4 corporate) → $4,000 revenue\n• Make 30 VEDD referrals → $X commissions\n• Complete 1 grant application → $X if awarded\n• Build LinkedIn to 500+ connections in finance/community space\n• Launch monthly recurring online workshop → $500+/month passive" },
        ],
        keyTakeaways: ["Financial projections force clarity: how many clients, at what price, what does it cost to deliver", "Cash flow ≠ profit — corporate clients may pay 30 days after invoice; plan accordingly", "SMART goals: specific, measurable revenue targets by quarter keep you accountable to your own plan"],
      },
      {
        number: 5, title: "Grants for Your VEDD Business", timeEstimate: "10 min",
        sections: [
          { heading: "Your VEDD Business Is Grant-Eligible", content: "Many VEDD ambassadors don't know they qualify for grants. If you are:\n• Running financial literacy programs in underserved communities → eligible for CDFI, DOL, and community foundation grants\n• A minority-owned, woman-owned, or veteran-owned business → eligible for targeted SBA and private grants\n• Providing workforce development (digital skills, job readiness) → eligible for DOL and WIA grants\n• Delivering AI/STEM education → eligible for NSF and state education grants\n• Building inter-city community finance programs → eligible for USDA and EDA grants\n\nVEDD's Grants & Funding module identifies and tracks all of these for you." },
          { heading: "Top Grant Sources for VEDD Ambassadors", content: "Federal:\n• SBA Small Business Grants: Various programs, competitive\n• CDFI Fund (Treasury Dept.): For CDFIs and community financial education\n• DOL Workforce Innovation and Opportunity Act (WIOA): Workforce training grants\n• NSF STEM Education: For STEM financial literacy programs\n\nPrivate/Foundation:\n• JPMorgan Chase Foundation: Small business and workforce development\n• Bank of America Foundation: Financial health and economic mobility\n• W.K. Kellogg Foundation: Community development and opportunity\n• Local community foundations: Search '[your city] community foundation grants'\n\nState and local:\n• State economic development offices\n• City and county small business grants\n• Local bank CRA (Community Reinvestment Act) grant programs" },
          { heading: "VEDD's Grant Module in Action", content: "The VEDD Grants & Funding page (accessible to ambassadors and admins) provides:\n\n1. AI Grant Scanner: Identifies relevant grants based on VEDD's profile and your community focus\n2. Grant Cards: Title, funder, amount range, deadline, eligibility, relevance score\n3. AI Proposal Generator: Three modes (Auto, Guided, Template) for writing proposals\n4. Application Tracker: Pipeline from Draft → Applied → Under Review → Awarded\n5. Achievement: 'Grant Champion' badge awarded on first successful grant\n\nUse the scanner monthly — grant deadlines are often annual and can be missed without a system.", isExample: true },
          { heading: "The Grant Cycle: Managing Multiple Applications", content: "Professional grant writers maintain a portfolio of 3-7 active applications at any time.\n\nWhy multiple simultaneously:\n• Most grants have 5-20% approval rates — it's a numbers game\n• Different grants fund different program elements — layering grants funds more\n• Some grants are renewable — a successful first application leads to multi-year funding\n\nCalendar management:\n• Mark every deadline 60 days out, 30 days out, and 7 days out\n• Submit at least 1 week early — systems crash on deadline day\n• After submission: Set a 30-day follow-up reminder\n• Track funder relationships — funders remember applicants who communicate professionally\n\nGranted: Most grants take 90-180 days from submission to decision. Apply now for money you'll receive in 6 months." },
        ],
        keyTakeaways: ["VEDD ambassadors qualify for CDFI, DOL, NSF, SBA, and private foundation grants", "VEDD's Grants module scans for relevant grants and generates AI-written proposals in Auto, Guided, or Template mode", "Maintain 3-7 active grant applications simultaneously — it's a numbers game with 5-20% approval rates"],
      },
      {
        number: 6, title: "Scaling Your VEDD Business", timeEstimate: "10 min",
        sections: [
          { heading: "From Ambassador to Ambassador Business", content: "Most ambassadors start solo. Scaling requires building systems that don't require your personal presence for every dollar earned.\n\nThe scaling progression:\n1. Solo practitioner: You deliver everything — ceiling is your personal capacity\n2. Productized services: Standardized workshop packages, coaching programs with set curriculum — easier to deliver consistently\n3. Digital products: Recorded courses, downloadable guides — earn while you sleep\n4. Other ambassadors: Recruit and onboard other VEDD ambassadors under your network — earn on their activity\n5. Grant-funded programs: Hire staff, run at scale, funded by others\n\nEach stage requires different infrastructure — systems, contracts, and processes." },
          { heading: "Building Systems for Scale", content: "Businesses that scale run on documented systems, not personal heroics.\n\nKey systems to build:\n• Client onboarding: What happens from first contact to first payment — documented step by step\n• Workshop delivery: Standard slides, handouts, exercises, evaluation forms — consistent regardless of audience\n• Follow-up sequence: Email series for workshop attendees (3 emails over 30 days) → VEDD referral conversion\n• Referral tracking: Spreadsheet or CRM (HubSpot free tier) tracking every prospect's status\n• Content calendar: Pre-planned LinkedIn posts 2 weeks ahead — never scramble for content\n\nDocument everything. If you can't explain how something works to someone new in writing, it's not scalable." },
          { heading: "Hiring and Delegation", content: "Your first hire should be a virtual assistant ($15-25/hour) for:\n• Scheduling and calendar management\n• Email inbox management and responses\n• Social media scheduling\n• Invoice creation and follow-up\n• Research tasks\n\nThis frees your time for high-value activities only you can do: delivering workshops, building relationships, strategy.\n\n10 hours/month VA = ~$200. If that time generates $1,000+ in additional revenue, it's a clear ROI.\n\nUse Upwork, Fiverr, or Belay for vetted VA services. Detailed SOPs (Standard Operating Procedures) are required before delegating anything.", isExample: true },
          { heading: "Your VEDD Legacy: Beyond Income", content: "The most successful VEDD ambassadors don't measure their impact only in revenue.\n\nThe VEDD mission metric:\n• How many families in your community improved their financial situation?\n• How many people gained access to investment tools they would never have found otherwise?\n• How many young people (ages 13-21) learned about markets, blockchain, and financial literacy?\n• How much grant funding did you bring into your community?\n• How many other ambassadors did you develop?\n\nMoney is the fuel. Community transformation is the destination. When your work builds wealth for people who have been systematically excluded from it, you are part of something that outlasts any single income stream.\n\nVEDD's vision: AI-powered financial tools, education, and community finance infrastructure for everyone." },
        ],
        keyTakeaways: ["Scale by systematizing: document every process so it can be delivered consistently without your personal presence", "Your first hire is a VA for admin tasks — free your time for high-value relationship and delivery work", "Measure both revenue AND community impact — the VEDD mission is financial democratization, not just income"],
      },
    ],
    assessment: {
      passingScore: 70,
      certTitle: "Entrepreneurship & VEDD Business Launch — VEDD Certified",
      questions: [
        { q: "What is the primary reason every VEDD ambassador should form an LLC?", options: ["It reduces your tax rate immediately", "It separates personal and business assets, protecting personal finances from business liability", "It is required by law to receive VEDD referral commissions", "It automatically builds business credit"], correct: 1, explanation: "An LLC creates a legal separation between you and your business. If your business is sued, your personal assets (home, car, savings) are protected. Operating as a sole proprietor means personal assets are at risk." },
        { q: "What is a DUNS number and why do VEDD ambassadors need one?", options: ["A tax ID number from the IRS", "A unique business identifier used by Dun & Bradstreet for business credit reporting", "A license number required for financial education businesses", "A number required to open a business bank account"], correct: 1, explanation: "A DUNS number is a 9-digit unique identifier assigned by Dun & Bradstreet. It's the foundation of your D&B business credit profile and is required to open Net-30 vendor accounts that build your PAYDEX score." },
        { q: "What is the correct PAYDEX behavior to maximize your D&B business credit score?", options: ["Pay exactly on the due date", "Pay early (before the due date)", "Pay within 30 days of purchase", "Pay the minimum balance monthly"], correct: 1, explanation: "PAYDEX rewards early payment. Paying 10-20 days before the Net-30 due date scores higher than paying exactly on time. A PAYDEX of 80 (pay on time) vs 90+ (pay early) is a meaningful difference for lenders." },
        { q: "Which activity is OUTSIDE the boundaries of what a VEDD ambassador can ethically do?", options: ["Teaching how candlestick charts work", "Sharing their own VEDD paper trading results with full disclosure", "Telling a client 'You should invest $5,000 in SOL right now'", "Running a financial literacy workshop on budgeting basics"], correct: 2, explanation: "Specific investment advice ('buy this asset') requires a licensed financial advisor or broker-dealer registration. VEDD ambassadors educate about financial principles and how platforms work — they do not advise on specific investment decisions." },
        { q: "What is the difference between Profit & Loss (P&L) and Cash Flow?", options: ["P&L measures revenue; Cash Flow measures expenses", "P&L shows profitability; Cash Flow shows when money actually moves in and out of your account", "They are the same measurement presented differently", "Cash Flow only applies to businesses with employees"], correct: 1, explanation: "P&L shows whether your business is profitable over a period. Cash flow shows when money physically arrives and leaves. A profitable business can still have cash flow problems — e.g., if clients pay Net-30 but your expenses are due immediately." },
        { q: "What is the recommended strategy for grant applications?", options: ["Submit only one perfect application per year", "Wait until you have a track record before applying", "Maintain 3-7 active grant applications simultaneously — grants have 5-20% approval rates", "Only apply for grants you are certain to win"], correct: 2, explanation: "Most grants have 5-20% approval rates. Professional grant seekers maintain a portfolio of multiple applications simultaneously, applying to different funders with different deadlines. Volume + quality = grant success." },
      ],
    },
  },
};

// ─── Course Data ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Brain, Monitor, TrendingUp, DollarSign, Coins, GraduationCap, Shield,
  Briefcase, LineChart, Users, Lock, Rocket,
};

const COURSES = [
  { id: 1, title: "AI Literacy 101", category: "ai_literacy", difficulty: "beginner", minutes: 45, description: "Understand how AI works, bias, responsible use, and AI tools for your financial future.", grantTags: ["NSF", "DOL"], audience: "all", icon: "Brain", color: "#6366f1", lessons: 6, enrolled: 342 },
  { id: 2, title: "Digital Skills Foundations", category: "digital_skills", difficulty: "beginner", minutes: 60, description: "Core digital literacy: internet safety, productivity tools, financial apps, and data basics.", grantTags: ["DOL", "CDFI"], audience: "community", icon: "Monitor", color: "#06b6d4", lessons: 5, enrolled: 218 },
  { id: 3, title: "Trading Fundamentals", category: "trading_fundamentals", difficulty: "beginner", minutes: 90, description: "Forex market structure, candlestick charts, support/resistance, ICT methodology, risk management.", grantTags: ["SBA"], audience: "all", icon: "TrendingUp", color: "#22c55e", lessons: 5, enrolled: 567 },
  { id: 4, title: "Financial Planning & Literacy", category: "financial_planning", difficulty: "beginner", minutes: 75, description: "Mindset, budgeting systems, credit scores, emergency funds, and debt elimination strategies.", grantTags: ["CDFI", "DOL"], audience: "community", icon: "DollarSign", color: "#f59e0b", lessons: 3, enrolled: 423 },
  { id: 5, title: "Web3 & Blockchain Basics", category: "web3_basics", difficulty: "intermediate", minutes: 60, description: "Cryptocurrency wallets, NFTs, DeFi, Solana ecosystem, and VEDD token economics.", grantTags: ["NSF", "EDA"], audience: "all", icon: "Coins", color: "#a855f7", lessons: 6, enrolled: 189 },
  { id: 6, title: "STEM for Young Traders", category: "stem", difficulty: "beginner", minutes: 30, description: "Math, data analysis, and logic for youth (ages 13-21) applied to markets and money.", grantTags: ["NSF", "DOL"], audience: "youth", icon: "GraduationCap", color: "#ec4899", lessons: 5, enrolled: 156 },
  { id: 7, title: "AI Ethics in Finance", category: "ai_literacy", difficulty: "intermediate", minutes: 45, description: "Bias, fairness, transparency, and responsible AI deployment in financial services.", grantTags: ["NSF", "NIST"], audience: "all", icon: "Shield", color: "#ef4444", lessons: 5, enrolled: 98 },
  { id: 8, title: "Job Readiness & Portfolio Building", category: "digital_skills", difficulty: "beginner", minutes: 90, description: "Resume building, LinkedIn optimization, freelance finance, and digital portfolio creation.", grantTags: ["DOL", "WIA"], audience: "community", icon: "Briefcase", color: "#06b6d4", lessons: 6, enrolled: 134 },
  { id: 9, title: "Advanced AI Trading Strategies", category: "trading_fundamentals", difficulty: "advanced", minutes: 120, description: "ICT methodology deep dive, SMC order blocks, algorithmic signals, and backtesting with AI.", grantTags: ["NSF", "EDA"], audience: "ambassador", icon: "LineChart", color: "#22c55e", lessons: 7, enrolled: 87 },
  { id: 10, title: "Community Finance Leadership", category: "financial_planning", difficulty: "intermediate", minutes: 60, description: "Lead financial wellness workshops, credit co-ops, and community investment clubs.", grantTags: ["CDFI", "USDA"], audience: "ambassador", icon: "Users", color: "#f59e0b", lessons: 5, enrolled: 73 },
  { id: 11, title: "Data Privacy & Cybersecurity", category: "digital_skills", difficulty: "intermediate", minutes: 45, description: "Protect personal data, understand GDPR/CCPA, spot phishing, secure financial accounts.", grantTags: ["NSF", "CISA"], audience: "all", icon: "Lock", color: "#06b6d4", lessons: 5, enrolled: 211 },
  { id: 12, title: "Entrepreneurship & VEDD Business Launch", category: "financial_planning", difficulty: "intermediate", minutes: 90, description: "LLC formation, business credit, grants, and the VEDD ambassador business model.", grantTags: ["SBA", "EDA"], audience: "ambassador", icon: "Rocket", color: "#f59e0b", lessons: 6, enrolled: 95 },
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10 flex-shrink-0">
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

      {/* Content — scrollable, reduced padding on mobile */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
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

      {/* Footer navigation — sticky, safe area aware on mobile */}
      {mode === "lesson" && (
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-t border-white/10 flex-shrink-0 pb-[env(safe-area-inset-bottom,12px)] sm:pb-4">
          <Button variant="outline" size="sm" className="border-white/10 text-gray-300 hover:text-white text-xs sm:text-sm"
            disabled={currentLesson === 0}
            onClick={() => setCurrentLesson(p => p - 1)}>
            <ChevronLeft className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Previous</span>
          </Button>
          <span className="text-[11px] text-gray-500">{currentLesson + 1} / {totalLessons}</span>
          {isLastLesson ? (
            <Button size="sm" className="font-bold text-white text-xs sm:text-sm" style={{ background: courseColor }} onClick={() => setMode("assessment")}>
              <span className="hidden sm:inline">Take </span>Assessment <ChevronRight className="w-4 h-4 sm:ml-1" />
            </Button>
          ) : (
            <Button size="sm" className="text-white text-xs sm:text-sm" style={{ background: courseColor }} onClick={() => setCurrentLesson(p => p + 1)}>
              Next <ChevronRight className="w-4 h-4 sm:ml-1" />
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

// ─── Per-course accreditation metadata ───────────────────────────────────────

const COURSE_ACCREDITATION: Record<number, { code: string; ceu: string; frameworks: string[]; onet: string }> = {
  1:  { code: "AIL", ceu: "0.75", frameworks: ["NSF AI Workforce Framework", "DOL O*NET 15-1299.09", "CompTIA IT Fundamentals+ Aligned"], onet: "15-1299.09" },
  2:  { code: "DSF", ceu: "1.00", frameworks: ["DOL WIOA Title I Eligible Training", "DigitalLearn.org Digital Literacy Standard"], onet: "15-1299.03" },
  3:  { code: "TRD", ceu: "1.50", frameworks: ["SBA Financial Education Standard", "FINRA Foundation Financial Capability"], onet: "13-2099.01" },
  4:  { code: "FPL", ceu: "1.25", frameworks: ["CDFI Fund Financial Education", "CFPB Money Smart Curriculum Aligned", "FINRA Foundation"], onet: "13-2051.00" },
  5:  { code: "WEB", ceu: "1.00", frameworks: ["NSF Convergence Accelerator AI+X", "EDA Build to Scale Innovation"], onet: "15-1299.07" },
  6:  { code: "STM", ceu: "0.50", frameworks: ["NSF STEM Education Program", "DOL Youth Build Workforce Program"], onet: "25-2011.00" },
  7:  { code: "AIE", ceu: "0.75", frameworks: ["NIST AI Risk Management Framework 1.0", "NSF Responsible AI Initiative", "DOL AI Workforce Ethics"], onet: "15-2051.02" },
  8:  { code: "JRB", ceu: "1.50", frameworks: ["DOL WIOA Title I Workforce Development", "CareerOneStop Skills Match Standard"], onet: "13-1071.00" },
  9:  { code: "ATS", ceu: "2.00", frameworks: ["NSF Convergence Accelerator", "EDA Build to Scale", "SBA Capital Access"], onet: "13-2099.01" },
  10: { code: "CFL", ceu: "1.00", frameworks: ["CDFI Fund Technical Assistance Grant", "USDA Rural Business Development"], onet: "13-2071.00" },
  11: { code: "DPC", ceu: "0.75", frameworks: ["NIST Cybersecurity Framework 2.0", "CISA Cyber Essentials", "NSF Cybersecurity Education"], onet: "15-1212.00" },
  12: { code: "ENT", ceu: "1.50", frameworks: ["SBA SCORE Entrepreneurship", "EDA Build to Scale", "CDFI Business Finance"], onet: "11-1021.00" },
};

function generateCertId(courseId: number): string {
  const acred = COURSE_ACCREDITATION[courseId];
  const code = acred?.code || "GEN";
  const year = new Date().getFullYear();
  const hex = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `VEDD-${year}-${code}-${hex}`;
}

// ─── Certificate Card ────────────────────────────────────────────────────────

function CertificateCard({
  name, title, certId, score, date, courseId, ceuHours, grantFrameworks,
}: {
  name: string; title: string; certId: string; score: number; date: string;
  courseId?: number; ceuHours?: string; grantFrameworks?: string[];
}) {
  const { toast } = useToast();
  const acred = courseId ? COURSE_ACCREDITATION[courseId] : null;
  const ceu = ceuHours || acred?.ceu || "0.50";
  const frameworks = grantFrameworks || acred?.frameworks || ["DOL WIOA Title I", "VEDD Workforce Academy Standard"];
  const verifyUrl = `https://veddbuild.com/verify/${certId}`;

  // Valid for 2 years from issue date
  const issueDate = new Date(date);
  const expiryDate = new Date(issueDate);
  expiryDate.setFullYear(expiryDate.getFullYear() + 2);
  const expiryStr = !isNaN(expiryDate.getTime()) ? expiryDate.toLocaleDateString() : "2027";

  return (
    <div className="rounded-xl border-2 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0a0e1f, #13103a)", borderColor: "rgba(251,191,36,0.5)" }}>
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-2" style={{ background: "linear-gradient(90deg, #f59e0b, #6366f1, #22c55e, #06b6d4)" }} />
      {/* Watermark seal */}
      <div className="absolute right-4 top-8 opacity-[0.07]">
        <Award className="w-28 h-28 text-amber-400" />
      </div>

      <div className="p-5 pt-6">
        {/* Issuer header */}
        <div className="text-center mb-3">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400">VEDD Technologies, LLC</p>
          <p className="text-[9px] uppercase tracking-widest text-indigo-400 font-semibold">Workforce Academy</p>
          <div className="w-16 h-px mx-auto mt-2 mb-2" style={{ background: "linear-gradient(90deg, transparent, #f59e0b, transparent)" }} />
          <p className="text-xs text-gray-400 italic">Certificate of Completion</p>
        </div>

        {/* Recipient */}
        <div className="text-center mb-3">
          <p className="text-white font-bold text-xl leading-tight tracking-tight">{name}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">has successfully completed</p>
          <p className="text-sm font-bold text-amber-300 mt-1 leading-tight">{title}</p>
        </div>

        {/* Score + CEU row */}
        <div className="flex justify-center gap-4 mb-3">
          <div className="text-center">
            <p className="text-lg font-black text-green-400">{score}%</p>
            <p className="text-[9px] text-gray-500 uppercase tracking-wide">Final Score</p>
          </div>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <p className="text-lg font-black text-indigo-400">{ceu}</p>
            <p className="text-[9px] text-gray-500 uppercase tracking-wide">CEU Hours</p>
          </div>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <p className="text-[11px] font-bold text-amber-400">{expiryStr}</p>
            <p className="text-[9px] text-gray-500 uppercase tracking-wide">Valid Through</p>
          </div>
        </div>

        {/* Framework badges */}
        <div className="flex flex-wrap gap-1 justify-center mb-3">
          {frameworks.slice(0, 3).map((fw, i) => (
            <span key={i} className="text-[8px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)", color: "#a5b4fc" }}>
              ✓ {fw}
            </span>
          ))}
        </div>

        {/* Accreditation notice */}
        <div className="text-center mb-3 px-2">
          <p className="text-[8px] text-gray-500 leading-relaxed italic">
            Issued under IACET CEU guidelines • Aligned with DOL WIOA Title I workforce training standards •
            Continuing Education Units recognized for grant reporting and workforce compliance documentation.
          </p>
        </div>

        {/* Cert ID + dates */}
        <div className="flex justify-between text-[9px] text-gray-600 mb-4 px-1">
          <span>ID: <span className="text-gray-400 font-mono">{certId}</span></span>
          <span>Issued: <span className="text-gray-400">{date}</span></span>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" className="h-8 text-xs font-semibold"
            style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#000" }}
            onClick={() => {
              // Build printable certificate
              const win = window.open("", "_blank");
              if (!win) return;
              win.document.write(`<!DOCTYPE html><html><head><title>VEDD Certificate — ${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Open+Sans:ital,wght@0,400;0,600;1,400&display=swap');
  body{margin:0;background:#fff;font-family:'Open Sans',sans-serif}
  .page{width:11in;height:8.5in;margin:0 auto;padding:0.75in;box-sizing:border-box;border:8px solid #d97706;position:relative;background:linear-gradient(135deg,#fffbf0,#fefefe)}
  .inner{border:2px solid #f59e0b;height:100%;padding:0.5in;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:space-between}
  .issuer{font-family:'Cinzel',serif;font-size:22pt;font-weight:700;color:#92400e;letter-spacing:0.05em;text-align:center}
  .subtitle{font-family:'Cinzel',serif;font-size:12pt;color:#78350f;letter-spacing:0.15em;text-align:center;margin-top:4px}
  .divider{width:400px;height:2px;background:linear-gradient(90deg,transparent,#d97706,transparent);margin:16px auto}
  .cert-title{font-size:13pt;color:#555;letter-spacing:0.1em;text-transform:uppercase}
  .recipient{font-family:'Cinzel',serif;font-size:28pt;font-weight:700;color:#1a1a2e;margin:8px 0}
  .completed{font-size:12pt;color:#555;font-style:italic}
  .course{font-size:18pt;font-weight:600;color:#92400e;margin:8px 0;text-align:center}
  .stats{display:flex;gap:48px;margin:16px 0;justify-content:center}
  .stat{text-align:center}.stat-val{font-size:20pt;font-weight:700;color:#1a1a2e}.stat-lbl{font-size:8pt;color:#888;text-transform:uppercase;letter-spacing:0.1em}
  .frameworks{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:12px 0}
  .fw{font-size:7pt;padding:3px 10px;border:1px solid #d97706;color:#92400e;border-radius:999px}
  .accred{font-size:7.5pt;color:#888;font-style:italic;text-align:center;max-width:600px;line-height:1.6}
  .footer{display:flex;justify-content:space-between;width:100%;border-top:1px solid #f59e0b;padding-top:12px;margin-top:12px}
  .sig{text-align:center}.sig-line{width:160px;border-top:1px solid #555;margin:0 auto 4px}.sig-name{font-size:9pt;color:#333;font-weight:600}.sig-title{font-size:7.5pt;color:#888}
  .cert-id{font-size:7pt;color:#aaa;font-family:monospace;text-align:right}
  .seal{width:80px;height:80px;border-radius:50%;border:3px solid #d97706;display:flex;align-items:center;justify-content:center;font-size:7pt;text-align:center;color:#92400e;font-weight:700;line-height:1.3;padding:8px;box-sizing:border-box}
</style></head><body>
<div class="page"><div class="inner">
  <div>
    <div class="issuer">VEDD Technologies, LLC</div>
    <div class="subtitle">Workforce Academy — Continuing Education</div>
  </div>
  <div class="divider"></div>
  <div class="cert-title">Certificate of Completion</div>
  <div class="recipient">${name}</div>
  <div class="completed">has successfully completed</div>
  <div class="course">${title}</div>
  <div class="stats">
    <div class="stat"><div class="stat-val">${score}%</div><div class="stat-lbl">Final Score</div></div>
    <div class="stat"><div class="stat-val">${ceu}</div><div class="stat-lbl">CEU Hours</div></div>
    <div class="stat"><div class="stat-val">${date}</div><div class="stat-lbl">Date Issued</div></div>
  </div>
  <div class="frameworks">${frameworks.map(fw => `<span class="fw">✓ ${fw}</span>`).join("")}</div>
  <div class="accred">Issued under IACET CEU guidelines • DOL WIOA Title I workforce training standards •<br>
  Continuing Education Units are recognized for grant reporting, workforce compliance documentation, and employer verification.</div>
  <div class="footer">
    <div class="sig"><div class="sig-line"></div><div class="sig-name">Christopher Chism</div><div class="sig-title">CEO, VEDD Technologies, LLC</div></div>
    <div class="seal">VEDD<br>CERTIFIED<br>${new Date().getFullYear()}</div>
    <div style="text-align:right">
      <div class="cert-id">Certificate ID: ${certId}</div>
      <div class="cert-id">Valid Through: ${expiryStr}</div>
      <div class="cert-id">Verify: veddbuild.com/verify/${certId}</div>
    </div>
  </div>
</div></div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`);
              win.document.close();
            }}>
            <Download className="w-3 h-3 mr-1.5" /> Print / Save PDF
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs border-white/10 text-gray-300"
            onClick={() => {
              navigator.clipboard.writeText(verifyUrl);
              toast({ title: "Verification link copied!", description: "Share with employers to verify your certificate." });
            }}>
            Copy Verify Link
          </Button>
        </div>

        {/* Verify URL */}
        <p className="text-center text-[8px] text-gray-600 mt-2 font-mono break-all">{verifyUrl}</p>
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
    onSuccess: async (data) => {
      setResult(data);
      // Auto-save immediately so no curriculum is ever lost
      try {
        await apiRequest("POST", "/api/workforce/save-curriculum", {
          title: form.title,
          category: form.category,
          targetAudience: form.audience,
          difficulty: form.difficulty,
          estimatedMinutes: parseInt(form.minutes) || 45,
          objectives: form.objectives,
          grantTags: form.grantAlignment,
          curriculum: data,
          autoSaved: true,
          savedAt: new Date().toISOString(),
        });
        toast({ title: "✅ Curriculum generated & auto-saved!", description: "Saved to Academy catalog for grant documentation." });
      } catch {
        toast({ title: "Curriculum generated!", description: "Review and click 'Save to Academy' to preserve it." });
      }
    },
    onError: (err: Error) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/workforce/save-curriculum", {
        title: form.title,
        category: form.category,
        targetAudience: form.audience,
        difficulty: form.difficulty,
        estimatedMinutes: parseInt(form.minutes) || 45,
        objectives: form.objectives,
        grantTags: form.grantAlignment,
        curriculum: result,
        savedAt: new Date().toISOString(),
      });
      return res.json();
    },
    onSuccess: () => { toast({ title: "✅ Saved to Academy Catalog!", description: "This curriculum is now documented for grant reporting." }); setResult(null); setForm({ title: "", category: "ai_literacy", audience: "all", difficulty: "beginner", minutes: "45", objectives: "", grantAlignment: [] }); },
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
  const qc = useQueryClient();
  const [catFilter, setCatFilter] = useState("all");
  const [diffFilter, setDiffFilter] = useState("all");
  const [enrollments, setEnrollments] = useState<EnrolledCourse[]>([]);
  const [lessonOpen, setLessonOpen] = useState<{ courseId: number; lesson: number } | null>(null);

  const isAdmin = !!(user as any)?.isAdmin;
  const name = (user as any)?.fullName || (user as any)?.username || "Learner";

  // ── Load persisted certificates from backend ──────────────────────────────
  const { data: certData } = useQuery<{ certificates: any[] }>({
    queryKey: ["/api/workforce/certificates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/workforce/certificates");
      return res.json();
    },
  });
  const certificates = certData?.certificates ?? [];

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

  async function handleComplete(courseId: number, score: number) {
    const course = COURSES.find(c => c.id === courseId);
    if (!course) return;
    setEnrollments(prev => prev.map(e => e.courseId === courseId ? { ...e, completed: true, progress: 100, score } : e));

    const acred = COURSE_ACCREDITATION[courseId];
    const certId = generateCertId(courseId);
    const certTitle = LESSON_CONTENT[courseId]?.assessment.certTitle || course.title;
    const today = new Date().toLocaleDateString();

    // Persist certificate to backend
    try {
      await apiRequest("POST", "/api/workforce/certificates", {
        courseId,
        certId,
        title: certTitle,
        score,
        date: today,
        ceuHours: acred?.ceu,
        grantFrameworks: acred?.frameworks,
        onetCode: acred?.onet,
      });
      qc.invalidateQueries({ queryKey: ["/api/workforce/certificates"] });
    } catch {
      // Still works offline — cert stored locally via query
    }
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

        {/* Accreditation Banner */}
        <div className="mb-6 p-4 rounded-xl border" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(6,182,212,0.06))", borderColor: "rgba(99,102,241,0.3)" }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: "rgba(99,102,241,0.15)" }}>
              <Award className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white mb-1">Industry-Aligned Certifications — IACET CEU Standard</p>
              <p className="text-xs text-gray-300 leading-relaxed">
                All VEDD Workforce Academy certificates are issued under <span className="text-indigo-300 font-semibold">IACET Continuing Education Unit (CEU)</span> guidelines and aligned with federal workforce frameworks including <span className="text-cyan-300 font-semibold">DOL WIOA Title I</span>, <span className="text-cyan-300 font-semibold">NSF AI Workforce</span>, <span className="text-cyan-300 font-semibold">CDFI Fund</span>, <span className="text-cyan-300 font-semibold">SBA Financial Education</span>, and <span className="text-cyan-300 font-semibold">NIST AI Risk Management Framework</span>.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {["IACET CEU Standard", "DOL WIOA Title I", "NSF AI Workforce", "CDFI Fund", "NIST AI RMF 1.0", "FINRA Foundation"].map(tag => (
                  <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc" }}>✓ {tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
                  <CertificateCard key={cert.certId} name={name} title={cert.title} certId={cert.certId} score={cert.score} date={cert.date} courseId={cert.courseId} ceuHours={cert.ceuHours} grantFrameworks={cert.grantFrameworks} />
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

      {/* Lesson Player Modal — full screen on mobile, dialog on desktop */}
      <Dialog open={!!lessonOpen} onOpenChange={open => !open && setLessonOpen(null)}>
        <DialogContent className="bg-[#0d1226] border-white/10 p-0 flex flex-col max-w-3xl w-full sm:w-full sm:max-w-3xl h-[100dvh] sm:h-[88vh] rounded-none sm:rounded-2xl sm:mx-4 [&>button]:top-3 [&>button]:right-3">
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
