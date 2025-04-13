import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Sparkles, Send, Brain, Book, MessageSquare, Lightbulb } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

const TradingCoach: React.FC<TradingCoachProps> = ({ personality = 'professional', className }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Avatars based on personality
  const coachAvatars = {
    friendly: '👨‍🏫',
    professional: '👨‍💼',
    casual: '🧠'
  };
  
  // Placeholder greeting based on personality
  const placeholderMessages = {
    friendly: "Hi there, trader friend! 👋 I'm your AI Trading Coach! Ask me anything about trading patterns, strategies, or market analysis!",
    professional: "Welcome. I'm your AI Trading Coach. How can I assist with your trading analysis today?",
    casual: "Hey! 🚀 Ready to crush the markets? Ask me anything about trading!"
  };

  // Add initial message when component mounts
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

  // Scroll to bottom of messages when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch trading tips from API
  const { data: tradingTips = [] } = useQuery<TradingTip[]>({
    queryKey: ['/api/trading-tips'],
  });

  // Group tips by category
  const tipsByCategory = tradingTips.reduce((acc, tip) => {
    if (!acc[tip.category]) {
      acc[tip.category] = [];
    }
    acc[tip.category].push(tip);
    return acc;
  }, {} as Record<string, TradingTip[]>);
  
  // Send message to AI Trading Coach
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
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to get response from Trading Coach. Please try again.',
        variant: 'destructive',
      });
      console.error('Trading coach error:', error);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim()) return;
    
    // Add user message
    const newMessage: Message = {
      id: generateId(),
      content: input,
      sender: 'user',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    
    // Call API with the user's message
    coachMutation.mutate(input);
    
    // Clear input field
    setInput('');
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <Tabs defaultValue="chat" className="w-full h-full">
        <TabsList className="mb-4 grid grid-cols-2">
          <TabsTrigger value="chat" className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />
            Chat with Coach
          </TabsTrigger>
          <TabsTrigger value="tips" className="flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4" />
            Trading Tips
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="chat" className="flex-1 flex flex-col h-[340px]">
          <ScrollArea className="flex-1 pr-4 mb-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.sender === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.sender === 'user'
                        ? 'bg-rose-600 text-white ml-auto'
                        : 'bg-gray-800 border border-gray-700'
                    }`}
                  >
                    {message.sender === 'coach' && (
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="text-xl">{coachAvatars[personality]}</div>
                        <div className="text-xs font-semibold text-rose-400">Trading Coach</div>
                      </div>
                    )}
                    <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                    <div className="text-xs opacity-70 mt-1 text-right">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          
          <form onSubmit={handleSubmit} className="mt-auto flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about trading patterns, strategies..."
              className="bg-gray-950 border-gray-700"
            />
            <Button 
              type="submit" 
              className="bg-rose-600 hover:bg-rose-700"
              disabled={coachMutation.isPending}
            >
              {coachMutation.isPending ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </TabsContent>
        
        <TabsContent value="tips" className="h-[340px]">
          <ScrollArea className="h-full pr-4">
            <div className="space-y-6">
              {Object.entries(tipsByCategory).length > 0 ? (
                Object.entries(tipsByCategory).map(([category, tips]) => (
                  <div key={category}>
                    <div className="mb-3">
                      <Badge variant="outline" className="bg-gray-800 text-rose-400 border-rose-500/30">
                        {category}
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {tips.map((tip) => (
                        <Card key={tip.id} className="p-3 bg-gray-800 border-gray-700">
                          <div className="flex items-start gap-2">
                            <Sparkles className="h-4 w-4 text-amber-500 mt-1 flex-shrink-0" />
                            <p className="text-sm text-gray-200">{tip.content}</p>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-gray-400">
                  <Book className="h-12 w-12 mx-auto mb-4 text-gray-500 opacity-50" />
                  <p>Trading tips are loading...</p>
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