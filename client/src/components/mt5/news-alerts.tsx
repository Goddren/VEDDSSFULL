import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Newspaper, 
  AlertTriangle, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Bell, 
  ChevronDown, 
  ChevronUp,
  Calendar,
  Zap
} from "lucide-react";

interface NewsEvent {
  id: string;
  event: string;
  country: string;
  currency: string;
  datetime: number;
  dateFormatted: string;
  timeFormatted: string;
  daysUntil: number;
  impact: "high" | "medium" | "low";
  forecast?: string;
  previous?: string;
  potentialImpact: string;
}

interface NewsSentiment {
  label: string;
  score: number;
  bullishCount: number;
  bearishCount: number;
  tradingImplication: string;
  pairDirection: string | null;
}

interface NewsAlertsData {
  sentiment: NewsSentiment;
  topHeadlines: string[];
  upcomingEvents: NewsEvent[];
  imminentEvents: NewsEvent[];
  todayHighImpact: NewsEvent[];
  hasImminentNews: boolean;
  hasTodayHighImpact: boolean;
}

function getTimeUntilStr(datetime: number): string {
  const now = Date.now();
  const diff = datetime - now;
  if (diff <= 0) return "NOW";
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function ImpactDot({ impact }: { impact: string }) {
  const colors: Record<string, string> = {
    high: "bg-red-500",
    medium: "bg-yellow-500",
    low: "bg-green-500",
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[impact] || colors.low}`} />
  );
}

export function NewsAlerts({ symbol }: { symbol?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [notifiedEvents, setNotifiedEvents] = useState<Set<string>>(new Set());

  const { data: newsData } = useQuery<NewsAlertsData>({
    queryKey: ["/api/news/alerts", symbol],
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/news/alerts/${encodeURIComponent(symbol)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!symbol,
    refetchInterval: 120000,
    staleTime: 60000,
  });

  useEffect(() => {
    if (!newsData?.imminentEvents?.length) return;
    
    newsData.imminentEvents.forEach((event) => {
      if (notifiedEvents.has(event.id)) return;
      
      const minutesUntil = Math.floor((event.datetime - Date.now()) / 60000);
      if (minutesUntil > 0 && minutesUntil <= 60) {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`News Alert: ${event.event}`, {
            body: `${event.currency} - ${event.impact.toUpperCase()} impact event in ${minutesUntil} minutes!\n${event.potentialImpact}`,
            icon: "/favicon.ico",
            tag: event.id,
          });
        }
        setNotifiedEvents(prev => new Set(prev).add(event.id));
      }
    });
  }, [newsData?.imminentEvents, notifiedEvents]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  if (!newsData) return null;

  const { sentiment, topHeadlines, upcomingEvents, imminentEvents, hasImminentNews, hasTodayHighImpact } = newsData;

  const sentimentIcon = sentiment?.label === "bullish" 
    ? <TrendingUp className="w-4 h-4 text-green-400" />
    : sentiment?.label === "bearish" 
    ? <TrendingDown className="w-4 h-4 text-red-400" />
    : <Minus className="w-4 h-4 text-gray-400" />;

  const sentimentColor = sentiment?.label === "bullish" 
    ? "border-green-500/30 from-green-900/20 to-emerald-900/20"
    : sentiment?.label === "bearish" 
    ? "border-red-500/30 from-red-900/20 to-rose-900/20"
    : "border-gray-500/30 from-gray-900/20 to-slate-900/20";

  const sentimentBadgeColor = sentiment?.label === "bullish"
    ? "bg-green-500/20 text-green-400 border-green-500/40"
    : sentiment?.label === "bearish"
    ? "bg-red-500/20 text-red-400 border-red-500/40"
    : "bg-gray-500/20 text-gray-400 border-gray-500/40";

  return (
    <Card className={`bg-gradient-to-br ${sentimentColor} border`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20">
              <Newspaper className="w-4 h-4 text-amber-400" />
            </div>
            <h3 className="font-semibold text-white text-sm">News & Events</h3>
            {hasImminentNews && (
              <Badge className="bg-red-500/30 text-red-300 border-red-500/50 text-[10px] animate-pulse flex items-center gap-1">
                <Bell className="w-3 h-3" /> IMMINENT
              </Badge>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setExpanded(!expanded)}
            className="h-7 px-2 text-gray-400 hover:text-white"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1.5">
            {sentimentIcon}
            <Badge variant="outline" className={`text-[10px] ${sentimentBadgeColor}`}>
              {sentiment?.label?.toUpperCase() || "NEUTRAL"} ({sentiment?.score || 0})
            </Badge>
          </div>
          {sentiment?.tradingImplication && (
            <p className="text-xs text-gray-400 truncate flex-1">
              {sentiment.tradingImplication}
            </p>
          )}
        </div>

        {hasImminentNews && imminentEvents.length > 0 && (
          <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs font-semibold text-red-300">
                Event{imminentEvents.length > 1 ? "s" : ""} within 1 hour
              </span>
            </div>
            {imminentEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  <ImpactDot impact={event.impact} />
                  <span className="text-xs text-white">{event.event}</span>
                  <span className="text-[10px] text-gray-400">({event.currency})</span>
                </div>
                <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[10px]">
                  <Clock className="w-3 h-3 mr-0.5" />
                  {getTimeUntilStr(event.datetime)}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {expanded && (
          <div className="space-y-3 mt-2">
            {topHeadlines && topHeadlines.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-300 mb-1.5 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Recent Headlines
                </h4>
                <div className="space-y-1">
                  {topHeadlines.map((headline, i) => (
                    <p key={i} className="text-xs text-gray-400 pl-3 border-l-2 border-gray-600/50">
                      {headline}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {upcomingEvents && upcomingEvents.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-300 mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Upcoming Economic Events
                </h4>
                <div className="space-y-1.5">
                  {upcomingEvents.map((event) => {
                    const isImminent = event.datetime - Date.now() <= 3600000 && event.datetime > Date.now();
                    return (
                      <div 
                        key={event.id} 
                        className={`flex items-center justify-between p-1.5 rounded ${isImminent ? "bg-red-500/10 border border-red-500/20" : "bg-white/5"}`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <ImpactDot impact={event.impact} />
                          <div className="min-w-0">
                            <span className="text-xs text-white block truncate">{event.event}</span>
                            <span className="text-[10px] text-gray-500">{event.currency} · {event.dateFormatted}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-gray-400">{event.timeFormatted}</span>
                          <Badge 
                            variant="outline" 
                            className={`text-[9px] ${
                              event.impact === "high" ? "text-red-400 border-red-500/40" : 
                              event.impact === "medium" ? "text-yellow-400 border-yellow-500/40" : 
                              "text-green-400 border-green-500/40"
                            }`}
                          >
                            {event.impact.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {sentiment?.pairDirection && (
              <div className="p-2 rounded-lg bg-white/5">
                <p className="text-xs text-gray-300">
                  <span className="font-semibold text-amber-400">News Direction: </span>
                  {sentiment.pairDirection}
                </p>
              </div>
            )}
          </div>
        )}

        {!expanded && upcomingEvents && upcomingEvents.length > 0 && (
          <p className="text-[10px] text-gray-500 mt-1">
            {upcomingEvents.length} upcoming event{upcomingEvents.length > 1 ? "s" : ""} · 
            {hasTodayHighImpact ? " High-impact today" : " Click to expand"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
