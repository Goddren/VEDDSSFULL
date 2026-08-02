import { useState, useEffect, useRef, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Sparkles,
  Send,
  Book,
  MessageSquare,
  Lightbulb,
  Copy,
  Check,
  Bot,
  Zap,
  TrendingUp,
  BarChart3,
  Target,
  Brain,
  ChevronRight,
  Code2,
  Download,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

type TradingCoachProps = {
  personality?: 'friendly' | 'professional' | 'casual';
  className?: string;
};

type Message = {
  id: string;
  content: string;
  sender: 'user' | 'coach';
  timestamp: Date;
};

type TradingTip = {
  id: string;
  category: string;
  content: string;
};

const generateId = () => Math.random().toString(36).substring(2, 11);

const quickPrompts = [
  { icon: TrendingUp, label: "Am I on pace?", prompt: "Am I on pace to hit my weekly profit goal? Give me a breakdown." },
  { icon: BarChart3,  label: "Best entry now?", prompt: "What's the best trade entry right now based on my weekly plan pairs?" },
  { icon: Target,    label: "Today's summary", prompt: "Give me a quick summary of today's trading performance." },
  { icon: Zap,       label: "Risk Management", prompt: "Based on my current goal and balance, what lot sizes should I be using?" },
];

const TypingIndicator = () => (
  <div className="flex items-center gap-1 px-4 py-3">
    <div className="flex items-center gap-3">
      <div className="relative">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-purple-600 flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-gray-900" />
      </div>
      <div className="flex items-center gap-1">
        <motion.div
          className="w-2 h-2 bg-rose-400 rounded-full"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1, repeat: Infinity, delay: 0 }}
        />
        <motion.div
          className="w-2 h-2 bg-rose-400 rounded-full"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
        />
        <motion.div
          className="w-2 h-2 bg-rose-400 rounded-full"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
        />
      </div>
      <span className="text-xs text-gray-400 ml-1">ABBA is analyzing...</span>
    </div>
  </div>
);

const MessageBubble = forwardRef<HTMLDivElement, { message: Message; onCopy: (text: string) => void }>(({ message, onCopy }, ref) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isCoach = message.sender === 'coach';

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex ${isCoach ? 'justify-start' : 'justify-end'}`}
    >
      <div className={`flex gap-3 max-w-[85%] ${isCoach ? '' : 'flex-row-reverse'}`}>
        {isCoach && (
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-gray-900" />
            </div>
          </div>
        )}
        
        <div className="flex flex-col gap-1">
          {isCoach && (
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-bold bg-gradient-to-r from-rose-400 to-purple-400 bg-clip-text text-transparent">
                ABBA
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-gradient-to-r from-rose-500/10 to-purple-500/10 border-rose-500/30 text-rose-300">
                <Brain className="w-2.5 h-2.5 mr-0.5" />
                AI
              </Badge>
            </div>
          )}
          
          <div
            className={`relative group rounded-2xl px-4 py-3 ${
              isCoach
                ? 'bg-gradient-to-br from-gray-800/90 to-gray-900/90 border border-gray-700/50 backdrop-blur-sm shadow-xl shadow-black/20'
                : 'bg-gradient-to-br from-rose-600 to-rose-700 text-white shadow-lg shadow-rose-500/20'
            }`}
          >
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</div>
            
            {isCoach && (
              <button
                onClick={handleCopy}
                className="absolute -right-2 top-2 opacity-0 group-hover:opacity-100 transition-all duration-200 p-1.5 rounded-lg bg-gray-700/80 hover:bg-gray-600 border border-gray-600/50"
                data-testid="button-copy-message"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-gray-300" />
                )}
              </button>
            )}
          </div>
          
          <div className={`text-[10px] text-gray-500 ${isCoach ? '' : 'text-right'}`}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </motion.div>
  );
});
MessageBubble.displayName = 'MessageBubble';

// ── Pair detector (scans text for known trading symbols) ──────────────────────
function detectPair(text: string): string | null {
  const upper = text.toUpperCase();
  const pairs = [
    'EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD',
    'GBPJPY','EURJPY','EURGBP','XAUUSD','GOLD','BTCUSDT','BTCUSD',
    'ETHUSD','ETHUSDT','NAS100','US30','SPX500','GER40',
    'EUR/USD','GBP/USD','USD/JPY','XAU/USD','BTC/USD',
  ];
  for (const p of pairs) {
    if (upper.includes(p.replace('/', ''))) return p.replace('/', '');
  }
  return null;
}

interface GeneratedEA {
  name: string;
  description: string;
  pair: string;
  timeframe: string;
  mql5Code: string;
  filename: string;
  liveContext?: string;
  generatedAt: string;
}

const TradingCoach = ({ personality = 'professional', className }: TradingCoachProps) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showQuickPrompts, setShowQuickPrompts] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // EA Builder state
  const [eaPrompt, setEaPrompt]       = useState('');
  const [eaGenerating, setEaGenerating] = useState(false);
  const [generatedEA, setGeneratedEA]   = useState<GeneratedEA | null>(null);
  
  const placeholderMessages = {
    friendly: "Hey! ABBA online — your personal VEDD trading intelligence. I have your live weekly goal, plan pairs, and current P&L loaded. What do you need?",
    professional: "ABBA online. I have your live trading context — weekly target, open positions, today's P&L, and your plan pairs. How can I assist you?",
    casual: "Yo, ABBA here — your AI fund manager. I'm watching your numbers and your pairs. What's the move?"
  };

  useEffect(() => {
    setMessages([
      {
        id: generateId(),
        content: placeholderMessages[personality],
        sender: 'coach',
        timestamp: new Date()
      }
    ]);
  }, [personality]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const { data: tradingTips = [] } = useQuery<TradingTip[]>({
    queryKey: ['/api/trading-tips'],
    refetchInterval: 300000,  // refresh tips every 5 min
  });

  const tipsByCategory = tradingTips.reduce((acc, tip) => {
    if (!acc[tip.category]) {
      acc[tip.category] = [];
    }
    acc[tip.category].push(tip);
    return acc;
  }, {} as Record<string, TradingTip[]>);
  
  const coachMutation = useMutation({
    mutationFn: async (message: string) => {
      // Route to ABBA endpoint for live-context-aware responses
      const response = await apiRequest('POST', '/api/ABBA/chat', {
        message,
        history: messages.slice(-6).map(m => ({ role: m.sender === 'coach' ? 'abba' : 'user', content: m.content })),
        currentPage: window.location.pathname,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      const coachMessage: Message = {
        id: generateId(),
        content: data.response || data.message || "Standing by.",
        sender: 'coach',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, coachMessage]);
    },
    onError: () => {
      toast({
        title: 'Connection Error',
        description: 'Failed to connect to VEDDAI. Please try again.',
        variant: 'destructive',
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const newMessage: Message = {
      id: generateId(),
      content: input,
      sender: 'user',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    setShowQuickPrompts(false);
    coachMutation.mutate(input);
    setInput('');
  };

  const handleQuickPrompt = (prompt: string) => {
    const newMessage: Message = {
      id: generateId(),
      content: prompt,
      sender: 'user',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    setShowQuickPrompts(false);
    coachMutation.mutate(prompt);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!', description: 'Message copied to clipboard' });
  };

  // Detect pair from recent messages to pre-fill EA context
  const recentPair = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const p = detectPair(messages[i].content);
      if (p) return p;
    }
    return null;
  })();

  const generateEA = async () => {
    const prompt = eaPrompt.trim();
    if (!prompt) return;
    setEaGenerating(true);
    setGeneratedEA(null);
    try {
      const res = await apiRequest('POST', '/api/abba/generate-ea', {
        message: prompt,
        pairHint: recentPair ?? undefined,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeneratedEA(data as GeneratedEA);
    } catch (e: any) {
      toast({ title: 'EA generation failed', description: e.message, variant: 'destructive' });
    } finally {
      setEaGenerating(false);
    }
  };

  const downloadEA = (ea: GeneratedEA) => {
    const blob = new Blob([ea.mql5Code], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = ea.filename; a.click();
    URL.revokeObjectURL(url);
  };

  const useAsEAPrompt = (pair: string) => {
    setEaPrompt(`Create an EA for ${pair} based on the strategy ABBA just recommended. Use EMA crossover with RSI confirmation, 1% risk per trade, 2:1 R:R.`);
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="mb-3 p-3 rounded-xl bg-gradient-to-r from-gray-800/50 via-gray-800/30 to-gray-800/50 border border-gray-700/50 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-rose-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-gray-900" />
            </div>
            <div>
              <h3 className="font-bold text-sm bg-gradient-to-r from-rose-400 to-purple-400 bg-clip-text text-transparent">
                ABBA
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />
                  Online
                </span>
                <span className="text-gray-600 text-[10px]">•</span>
                <span className="text-[10px] text-gray-400">VEDD Intelligence</span>
              </div>
            </div>
          </div>
          <Badge className="bg-gradient-to-r from-rose-500/20 to-purple-500/20 border-rose-500/30 text-rose-300 text-[10px] px-2 py-0.5">
            <Sparkles className="w-2.5 h-2.5 mr-1" />
            Pro AI
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="chat" className="w-full flex-1 flex flex-col">
        <TabsList className="mb-2 grid grid-cols-3 bg-gray-800/50 border border-gray-700/50 rounded-lg p-1 flex-shrink-0">
          <TabsTrigger
            value="chat"
            className="flex items-center gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-rose-500/20 data-[state=active]:to-purple-500/20 data-[state=active]:text-white rounded-lg transition-all"
            data-testid="tab-chat"
          >
            <MessageSquare className="h-4 w-4" />
            AI Chat
          </TabsTrigger>
          <TabsTrigger
            value="tips"
            className="flex items-center gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-rose-500/20 data-[state=active]:to-purple-500/20 data-[state=active]:text-white rounded-lg transition-all"
            data-testid="tab-tips"
          >
            <Lightbulb className="h-4 w-4" />
            Tips
          </TabsTrigger>
          <TabsTrigger
            value="ea"
            className="flex items-center gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500/20 data-[state=active]:to-indigo-500/20 data-[state=active]:text-white rounded-lg transition-all"
            data-testid="tab-ea"
          >
            <Code2 className="h-4 w-4" />
            EA Builder
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 pr-4 mb-2 h-0">
            <div className="space-y-4 pb-4">
              <AnimatePresence mode="popLayout">
                {messages.map((message) => (
                  <MessageBubble 
                    key={message.id} 
                    message={message} 
                    onCopy={handleCopy}
                  />
                ))}
              </AnimatePresence>
              
              {coachMutation.isPending && <TypingIndicator />}
              
              {showQuickPrompts && messages.length === 1 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mt-6"
                >
                  <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Quick questions to get started:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {quickPrompts.map((item, index) => (
                      <motion.button
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 + index * 0.1 }}
                        onClick={() => handleQuickPrompt(item.prompt)}
                        className="flex items-center gap-2 p-3 rounded-xl bg-gray-800/50 border border-gray-700/50 hover:border-rose-500/50 hover:bg-gray-800 transition-all group text-left"
                        data-testid={`button-quick-prompt-${index}`}
                      >
                        <item.icon className="w-4 h-4 text-rose-400 flex-shrink-0" />
                        <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{item.label}</span>
                        <ChevronRight className="w-3 h-3 text-gray-600 group-hover:text-rose-400 ml-auto transition-colors" />
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Smart "Build EA" suggestion after ABBA mentions a pair */}
              {recentPair && !showQuickPrompts && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start pl-12"
                >
                  <button
                    onClick={() => useAsEAPrompt(recentPair)}
                    className="flex items-center gap-1.5 text-[11px] text-purple-300 bg-purple-500/10 border border-purple-500/25 rounded-lg px-3 py-1.5 hover:bg-purple-500/20 transition-colors"
                  >
                    <Code2 className="w-3 h-3" />
                    Build EA for {recentPair} →
                  </button>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          
          <form onSubmit={handleSubmit} className="mt-auto">
            <div className="flex gap-2 p-2 rounded-xl bg-gray-800/50 border border-gray-700/50 focus-within:border-rose-500/50 transition-colors">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask ABBA — market entries, goal pacing, strategy..."
                className="flex-1 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-gray-500"
                disabled={coachMutation.isPending}
                data-testid="input-chat-message"
              />
              <Button 
                type="submit" 
                size="icon"
                className="bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 rounded-lg shadow-lg shadow-rose-500/20 transition-all"
                disabled={coachMutation.isPending || !input.trim()}
                data-testid="button-send-message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </TabsContent>
        
        {/* ── EA Builder Tab ──────────────────────────────────────────────── */}
        <TabsContent value="ea" className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 pr-2 h-0">
            <div className="space-y-4 pb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-900/30 to-indigo-900/20 border border-purple-700/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <Code2 className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-bold text-white">ABBA EA Generator</span>
                  <span className="text-[9px] text-purple-300 bg-purple-500/20 border border-purple-500/30 px-1.5 py-0.5 rounded ml-auto">NL → MQL5</span>
                </div>
                <p className="text-[10px] text-gray-400 leading-snug">
                  Describe your strategy in plain English. ABBA parses it, pulls live market data for your pair, and generates a downloadable Expert Advisor.
                </p>
              </div>

              {recentPair && (
                <div className="flex items-center gap-2 text-[10px] text-purple-300/80 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
                  <Bot className="w-3 h-3 shrink-0" />
                  ABBA detected <strong className="text-purple-200">{recentPair}</strong> in your chat — it will be used as the pair context.
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Strategy Description</label>
                <textarea
                  value={eaPrompt}
                  onChange={e => setEaPrompt(e.target.value)}
                  placeholder={`e.g. "Create an EMA 9/21 crossover EA for EURUSD M5 with RSI filter above 50, 1% risk, 2:1 R:R, ATR-based stop loss"\n\nor "BTC breakout EA using 20-bar high/low with volume confirmation, trailing stop at 1.5 ATR"`}
                  rows={5}
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-xl text-xs text-gray-200 px-3 py-2.5 placeholder:text-gray-600 resize-none focus:outline-none focus:border-purple-500 leading-relaxed"
                />
              </div>

              <button
                onClick={generateEA}
                disabled={eaGenerating || !eaPrompt.trim()}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600/40 to-indigo-600/40 hover:from-purple-600/60 hover:to-indigo-600/60 border border-purple-500/40 text-purple-200 text-sm font-bold rounded-xl py-3 disabled:opacity-40 transition-all"
              >
                {eaGenerating
                  ? <><RefreshCw className="w-4 h-4 animate-spin" />ABBA is building your EA…</>
                  : <><Code2 className="w-4 h-4" />Generate EA with ABBA</>
                }
              </button>

              {generatedEA && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-purple-900/20 border border-purple-600/30 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-purple-200">{generatedEA.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{generatedEA.description}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[9px] bg-purple-800/50 text-purple-300 px-2 py-0.5 rounded-full border border-purple-700/40">{generatedEA.pair}</span>
                        <span className="text-[9px] bg-gray-800/60 text-gray-400 px-2 py-0.5 rounded-full border border-gray-700/40">{generatedEA.timeframe}</span>
                        {generatedEA.liveContext && (
                          <span className="text-[9px] text-emerald-400/80 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />live data included
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => downloadEA(generatedEA)}
                      className="flex items-center gap-1.5 text-xs font-bold text-purple-200 bg-purple-600/30 border border-purple-500/40 rounded-lg px-3 py-2 shrink-0 hover:bg-purple-600/50 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      .mq5
                    </button>
                  </div>

                  {generatedEA.liveContext && (
                    <p className="text-[9px] text-gray-500 bg-black/20 rounded-lg px-2.5 py-1.5">{generatedEA.liveContext}</p>
                  )}

                  <div className="bg-black/40 rounded-lg p-3 max-h-48 overflow-y-auto border border-gray-800/60">
                    <pre className="text-[8px] text-gray-400 font-mono whitespace-pre-wrap leading-relaxed">
                      {generatedEA.mql5Code.slice(0, 1000)}
                      {generatedEA.mql5Code.length > 1000 ? '\n\n… (download for full code)' : ''}
                    </pre>
                  </div>

                  <p className="text-[9px] text-gray-600 text-center">
                    Generated {new Date(generatedEA.generatedAt).toLocaleTimeString()} · Upload {generatedEA.filename} to MetaTrader 5 → Expert Advisors
                  </p>
                </motion.div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="tips" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full pr-4">
            <div className="space-y-6">
              {Object.entries(tipsByCategory).length > 0 ? (
                Object.entries(tipsByCategory).map(([category, tips]) => (
                  <motion.div 
                    key={category}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="mb-3">
                      <Badge 
                        variant="outline" 
                        className="bg-gradient-to-r from-rose-500/10 to-purple-500/10 text-rose-400 border-rose-500/30"
                      >
                        <Sparkles className="w-3 h-3 mr-1" />
                        {category}
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {tips.map((tip) => (
                        <Card 
                          key={tip.id} 
                          className="p-4 bg-gradient-to-br from-gray-800/80 to-gray-900/80 border-gray-700/50 hover:border-rose-500/30 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20">
                              <Sparkles className="h-4 w-4 text-amber-400" />
                            </div>
                            <p className="text-sm text-gray-200 leading-relaxed">{tip.content}</p>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-16 text-gray-400">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gray-800/50 flex items-center justify-center">
                    <Book className="h-8 w-8 text-gray-600" />
                  </div>
                  <p className="text-gray-500">Loading trading tips...</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TradingCoach;
