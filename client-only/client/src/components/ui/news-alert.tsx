import React, { useState } from "react";
import { Bell, BellOff, Calendar, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AnimatedTooltip } from "@/components/ui/animated-tooltip";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

export interface NewsEvent {
  id: string;
  title: string;
  currency: string;
  impact: 'high' | 'medium' | 'low';
  dateTime: string;
  description: string;
  url?: string;
}

interface NewsAlertProps {
  symbol: string;
  news: NewsEvent[];
  className?: string;
}

export function NewsAlert({ symbol, news, className }: NewsAlertProps) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const { toast } = useToast();
  
  const filteredNews = news.filter(item => {
    // Extract currency pairs from symbol (e.g., "EURUSD" -> ["EUR", "USD"])
    const currencies = [
      symbol.substring(0, 3),
      symbol.substring(3, 6)
    ].filter(Boolean);
    
    // Check if any of the currency pairs match the news event currency
    return currencies.some(curr => 
      item.currency.toLowerCase() === curr.toLowerCase()
    );
  });
  
  const sortedNews = [...filteredNews].sort((a, b) => {
    // Sort by date (closest first) and then by impact (high first)
    const dateA = new Date(a.dateTime);
    const dateB = new Date(b.dateTime);
    
    if (dateA === dateB) {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    }
    
    return dateA.getTime() - dateB.getTime();
  });
  
  const toggleNotifications = () => {
    setNotificationsEnabled(!notificationsEnabled);
    toast({
      title: notificationsEnabled 
        ? "News notifications disabled" 
        : "News notifications enabled",
      description: notificationsEnabled 
        ? "You will no longer receive alerts for this currency pair." 
        : "You will now receive alerts for upcoming economic events.",
      variant: notificationsEnabled ? "destructive" : "default",
    });
  };
  
  const formatDateTime = (dateTimeStr: string) => {
    const date = new Date(dateTimeStr);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };
  
  // Get impact color
  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high':
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case 'medium':
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case 'low':
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };
  
  if (filteredNews.length === 0) {
    return null;
  }
  
  return (
    <Card className={cn("border border-border", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Economic News Alerts</CardTitle>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground">
              {notificationsEnabled ? 'Alerts On' : 'Alerts Off'}
            </span>
            <Switch
              checked={notificationsEnabled}
              onCheckedChange={toggleNotifications}
              aria-label="Toggle news notifications"
            />
          </div>
        </div>
        <CardDescription>
          Upcoming news events that may impact {symbol} trading signals
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="space-y-3">
          {sortedNews.map(event => {
            const { date, time } = formatDateTime(event.dateTime);
            return (
              <div key={event.id} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={cn("text-xs", getImpactColor(event.impact))}>
                      {event.impact.toUpperCase()} IMPACT
                    </Badge>
                    <Badge variant="outline" className="text-xs bg-primary/10 text-primary">
                      {event.currency}
                    </Badge>
                  </div>
                  <AnimatedTooltip
                    content={
                      <span className="text-xs">
                        {notificationsEnabled 
                          ? "You'll receive a notification before this event" 
                          : "Enable notifications to be alerted"}
                      </span>
                    }
                    animation="sideways"
                  >
                    {notificationsEnabled ? (
                      <Bell className="h-4 w-4 text-primary cursor-help" />
                    ) : (
                      <BellOff className="h-4 w-4 text-muted-foreground cursor-help" />
                    )}
                  </AnimatedTooltip>
                </div>
                
                <h4 className="font-medium text-sm mb-1">{event.title}</h4>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{date}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{time}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{event.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
      <CardFooter className="pt-2">
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full text-xs"
          onClick={() => window.open("https://www.forexfactory.com/calendar", "_blank")}
        >
          View Full Economic Calendar <ExternalLink className="h-3 w-3 ml-1" />
        </Button>
      </CardFooter>
    </Card>
  );
}