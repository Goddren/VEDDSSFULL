import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, User, ArrowRight, ChevronDown, ChevronUp, Lightbulb, Clock, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Predefined questions
const QUICK_QUESTIONS = [
  "What's the best time to trade EUR/USD?",
  "How can I improve my risk management?",
  "What's a good win/loss ratio to aim for?",
  "How do I identify a trend reversal?",
  "What are the most reliable chart patterns?",
  "How to handle trading losses emotionally?"
];

// Tip categories for automated tips
const TIP_CATEGORIES = [
  "risk-management", 
  "psychology", 
  "technical-analysis", 
  "fundamentals", 
  "discipline"
];

// Coach personalities
type CoachPersonality = "friendly" | "analytical" | "motivational";

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'coach';
  timestamp: Date;
  isLoading?: boolean;
  category?: string;
}

interface TradingCoachProps {
  compact?: boolean;
  defaultOpen?: boolean;
  personality?: CoachPersonality;
  className?: string;
}

export function TradingCoach({ 
  compact = false, 
  defaultOpen = false,
  personality = "friendly",
  className 
}: TradingCoachProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("chat");
  const [selectedCategory, setSelectedCategory] = useState<string>(TIP_CATEGORIES[0]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  // Initial welcome message
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage = getWelcomeMessage();
      setMessages([{
        id: Date.now().toString(),
        content: welcomeMessage,
        sender: 'coach',
        timestamp: new Date()
      }]);
    }
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Get welcome message based on personality
  const getWelcomeMessage = () => {
    switch(personality) {
      case "friendly":
        return `Hi there! 👋 I'm your friendly trading coach. How can I help you improve your trading today?`;
      case "analytical":
        return `Welcome. I'm your analytical trading coach. I can provide data-driven insights to optimize your trading strategy.`;
      case "motivational":
        return `Hey champ! 🔥 Ready to crush the markets today? I'm here to help you reach your trading potential!`;
      default:
        return `Hello! I'm your trading coach. How can I assist with your trading journey today?`;
    }
  };

  // Generate a personalized response
  const generateResponse = async (userMessage: string) => {
    try {
      setIsTyping(true);
      
      // Add loading message
      const tempId = Date.now().toString();
      setMessages(prev => [...prev, {
        id: tempId,
        content: "...",
        sender: 'coach',
        timestamp: new Date(),
        isLoading: true
      }]);
      
      // Call API to get response
      const response = await apiRequest("POST", "/api/trading-coach", {
        message: userMessage,
        personality: personality,
        userId: user?.id
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || "Failed to get response");
      }
      
      // Replace loading message with actual response
      setMessages(prev => prev.map(msg => 
        msg.id === tempId ? {
          ...msg,
          content: data.response,
          isLoading: false
        } : msg
      ));
      
    } catch (error) {
      console.error("Error generating coach response:", error);
      toast({
        title: "Error",
        description: "Failed to get coach response. Please try again.",
        variant: "destructive"
      });
      
      // Remove loading message on error
      setMessages(prev => prev.filter(msg => !msg.isLoading));
      
    } finally {
      setIsTyping(false);
    }
  };

  // Handle user message submission
  const handleSendMessage = async () => {
    if (input.trim() === "") return;
    
    // Add user message to chat
    const userMessage = input.trim();
    const newMessage: Message = {
      id: Date.now().toString(),
      content: userMessage,
      sender: 'user',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    setInput("");
    
    // Generate coach response
    await generateResponse(userMessage);
  };

  // Handle predefined question click
  const handleQuickQuestion = async (question: string) => {
    // Add user message
    const newMessage: Message = {
      id: Date.now().toString(),
      content: question,
      sender: 'user',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    
    // Generate coach response
    await generateResponse(question);
  };

  // Get tip based on category
  const getTipForCategory = async (category: string) => {
    try {
      const response = await apiRequest("GET", `/api/trading-tips?category=${category}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || "Failed to get tip");
      }
      
      // Add tip to messages
      const newTip: Message = {
        id: Date.now().toString(),
        content: data.tip,
        sender: 'coach',
        timestamp: new Date(),
        category: category
      };
      
      setMessages(prev => [...prev, newTip]);
      
    } catch (error) {
      console.error("Error getting trading tip:", error);
      toast({
        title: "Error",
        description: "Failed to get trading tip. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Get category label for display
  const getCategoryLabel = (category: string) => {
    switch(category) {
      case "risk-management": return "Risk Management";
      case "psychology": return "Trading Psychology";
      case "technical-analysis": return "Technical Analysis";
      case "fundamentals": return "Fundamentals";
      case "discipline": return "Trading Discipline";
      default: return category.charAt(0).toUpperCase() + category.slice(1);
    }
  };

  // Get category icon
  const getCategoryIcon = (category: string) => {
    switch(category) {
      case "risk-management": return <Lightbulb className="h-4 w-4" />;
      case "psychology": return <Sparkles className="h-4 w-4" />;
      case "technical-analysis": return <ArrowRight className="h-4 w-4" />;
      case "fundamentals": return <Clock className="h-4 w-4" />;
      case "discipline": return <User className="h-4 w-4" />;
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  // Format timestamp for messages
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Toggle coach open/closed
  const toggleCoach = () => {
    setIsOpen(!isOpen);
    if (!isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  // Rendering the compact version of the coach
  if (compact && !isOpen) {
    return (
      <Button
        className={cn("fixed bottom-4 right-4 rounded-full p-3 shadow-lg", className)}
        onClick={toggleCoach}
        variant="default"
      >
        <Bot className="h-6 w-6" />
      </Button>
    );
  }

  // Render the expanded coach interface
  return (
    <Card 
      className={cn(
        "shadow-lg border-2",
        compact ? "fixed bottom-4 right-4 w-80 md:w-96 h-[500px] max-h-[80vh] z-50" : "w-full h-full",
        className
      )}
    >
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0 border-b">
        <CardTitle className="text-base font-medium flex items-center">
          <Bot className="h-5 w-5 mr-2 text-primary" />
          Trading Coach
          <Badge variant="outline" className="ml-2 text-xs">
            {personality.charAt(0).toUpperCase() + personality.slice(1)}
          </Badge>
        </CardTitle>
        {compact && (
          <Button variant="ghost" size="sm" onClick={toggleCoach} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="px-4 py-2 border-b">
          <TabsList className="w-full">
            <TabsTrigger value="chat" className="flex-1">Chat</TabsTrigger>
            <TabsTrigger value="tips" className="flex-1">Trading Tips</TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden m-0 p-0 data-[state=active]:flex-1">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.sender === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2 max-w-[80%] break-words",
                      message.sender === 'user'
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {message.isLoading ? (
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 rounded-full bg-current animate-bounce" />
                        <div className="w-2 h-2 rounded-full bg-current animate-bounce [animation-delay:0.2s]" />
                        <div className="w-2 h-2 rounded-full bg-current animate-bounce [animation-delay:0.4s]" />
                      </div>
                    ) : (
                      <>
                        <div className="text-sm">{message.content}</div>
                        <div className="text-xs mt-1 opacity-60 text-right">
                          {formatTime(message.timestamp)}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          
          <div className="p-4 border-t">
            <div className="mb-2">
              <ScrollArea className="w-full whitespace-nowrap" type="always">
                <div className="flex space-x-2 py-1">
                  {QUICK_QUESTIONS.map((question, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="h-auto py-1 px-3 text-xs flex-shrink-0"
                      onClick={() => handleQuickQuestion(question)}
                      disabled={isTyping}
                    >
                      {question}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                placeholder="Ask your trading coach..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isTyping}
                className="flex-1"
              />
              <Button 
                size="icon" 
                onClick={handleSendMessage}
                disabled={isTyping || input.trim() === ""}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="tips" className="flex-1 flex flex-col overflow-hidden m-0 data-[state=active]:flex-1">
          <div className="p-4 border-b">
            <div className="text-sm font-medium mb-2">Select Tip Category:</div>
            <div className="flex flex-wrap gap-2">
              {TIP_CATEGORIES.map((category) => (
                <TooltipProvider key={category}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={selectedCategory === category ? "default" : "outline"}
                        size="sm"
                        className="h-8"
                        onClick={() => setSelectedCategory(category)}
                      >
                        {getCategoryIcon(category)}
                        <span className="ml-1">{getCategoryLabel(category)}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Get tips about {getCategoryLabel(category).toLowerCase()}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
          
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages
                .filter(m => m.sender === 'coach' && (m.category === selectedCategory || !m.category))
                .map((message) => (
                  <div key={message.id} className="bg-muted rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="h-5 w-5 text-primary" />
                      <div className="font-medium">Trading Coach</div>
                      {message.category && (
                        <Badge variant="outline" className="ml-auto">
                          {getCategoryLabel(message.category)}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm">{message.content}</div>
                    <div className="text-xs mt-2 opacity-60 text-right">
                      {formatTime(message.timestamp)}
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
          
          <CardFooter className="border-t p-4">
            <Button 
              onClick={() => getTipForCategory(selectedCategory)}
              className="w-full"
            >
              <Lightbulb className="mr-2 h-4 w-4" />
              Get {getCategoryLabel(selectedCategory)} Tip
            </Button>
          </CardFooter>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

export default TradingCoach;