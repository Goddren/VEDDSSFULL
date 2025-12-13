import { useState, useEffect, useRef } from 'react';
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
  ChevronRight
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
  { icon: TrendingUp, label: "Explain RSI", prompt: "Explain RSI indicator and how to use it effectively" },
  { icon: BarChart3, label: "MACD Strategy", prompt: "What's the best MACD trading strategy?" },
  { icon: Target, label: "Entry Points", prompt: "How do I identify good entry points in trading?" },
  { icon: Zap, label: "Risk Management", prompt: "Explain proper position sizing and risk management" },
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
      <span className="text-xs text-gray-400 ml-1">VEDDAI is thinking...</span>
    </div>
  </div>
);

const MessageBubble = ({ message, onCopy }: { message: Message; onCopy: (text: string) => void }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isCoach = message.sender === 'coach';

  return (
    <motion.div
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
                VEDDAI
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
};

const TradingCoach = ({ personality = 'professional', className }: TradingCoachProps) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showQuickPrompts, setShowQuickPrompts] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const placeholderMessages = {
    friendly: "Hey there, fellow trader! I'm VEDDAI, your AI trading companion. I'm here to help you navigate the markets with confidence. What would you like to explore today?",
    professional: "Welcome to VEDDAI. I'm your AI-powered trading analyst, ready to provide insights on patterns, strategies, and market analysis. How may I assist you?",
    casual: "Hey! I'm VEDDAI - your trading brain! Ready to help you level up your trading game. Fire away with any questions!"
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
      const response = await apiRequest('POST', '/api/trading-coach', { message, personality });
      return await response.json();
    },
    onSuccess: (data) => {
      const coachMessage: Message = {
        id: generateId(),
        content: data.response,
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
    toast({
      title: 'Copied!',
      description: 'Message copied to clipboard',
    });
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-gray-800/50 via-gray-800/30 to-gray-800/50 border border-gray-700/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <motion.div 
                className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-gray-900"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <div>
              <h3 className="font-bold text-lg bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                VEDDAI Trading Coach
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  Online
                </span>
                <span className="text-gray-600">•</span>
                <span className="text-xs text-gray-400">Powered by GPT-4</span>
              </div>
            </div>
          </div>
          <Badge className="bg-gradient-to-r from-rose-500/20 to-purple-500/20 border-rose-500/30 text-rose-300">
            <Sparkles className="w-3 h-3 mr-1" />
            Pro AI
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="chat" className="w-full flex-1 flex flex-col">
        <TabsList className="mb-4 grid grid-cols-2 bg-gray-800/50 border border-gray-700/50 rounded-xl p-1">
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
            Trading Tips
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="chat" className="flex-1 flex flex-col min-h-[400px]">
          <ScrollArea className="flex-1 pr-4 mb-4">
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
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          
          <form onSubmit={handleSubmit} className="mt-auto">
            <div className="flex gap-2 p-2 rounded-xl bg-gray-800/50 border border-gray-700/50 focus-within:border-rose-500/50 transition-colors">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask VEDDAI about trading strategies, patterns, analysis..."
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
        
        <TabsContent value="tips" className="min-h-[400px]">
          <ScrollArea className="h-[400px] pr-4">
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
