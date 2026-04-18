import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, TrendingUp, TrendingDown, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

interface EconomicEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  impact: 'high' | 'medium' | 'low';
  affectedPairs: string[];
  forecast?: string;
  previous?: string;
  description?: string;
  country?: string;
  currency?: string;
}

export const MarketCalendar: React.FC = () => {
  const { data, isLoading, error, refetch, isFetching } = useQuery<{ events: EconomicEvent[] }>({
    queryKey: ['/api/economic-calendar'],
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  const events = data?.events || [];

  return (
    <Card className="bg-gray-900 border-gray-800 shadow-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl text-white">Economic Calendar</CardTitle>
            <CardDescription>Upcoming market-moving events</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 w-8"
              data-testid="button-refresh-calendar"
            >
              <RefreshCw className={`h-4 w-4 text-gray-400 hover:text-white ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <div className="h-8 w-8 rounded-full bg-blue-600/20 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-blue-500" />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 bg-gray-950 rounded-lg border border-gray-800">
                <Skeleton className="h-5 w-3/4 mb-2 bg-gray-800" />
                <Skeleton className="h-4 w-1/2 mb-3 bg-gray-800" />
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-3 w-full bg-gray-800" />
                  <Skeleton className="h-3 w-full bg-gray-800" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="h-48 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <AlertTriangle className="h-10 w-10 mx-auto mb-4 text-amber-500/40" />
              <p>Unable to load economic events</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refetch()} 
                className="mt-3"
                data-testid="button-retry-calendar"
              >
                Try Again
              </Button>
            </div>
          </div>
        ) : events.length > 0 ? (
          <div className="space-y-4">
            {events.slice(0, 4).map((event) => (
              <div key={event.id} className="p-3 bg-gray-950 rounded-lg border border-gray-800 hover:border-blue-500/50 transition-colors" data-testid={`calendar-event-${event.id}`}>

                {/* Top row: impact badges + direction icons */}
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {event.impact === 'high' && (
                    <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[10px] px-1.5 py-0">
                      🔴 High Impact
                    </Badge>
                  )}
                  {event.impact === 'medium' && (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px] px-1.5 py-0">
                      🟡 Medium
                    </Badge>
                  )}
                  {event.currency && (
                    <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{event.currency}</span>
                  )}
                  <div className="ml-auto flex gap-1">
                    {hasPotentialImpact(event.title, 'bullish') && (
                      <div className="h-5 w-5 rounded-full bg-emerald-600/10 flex items-center justify-center" title="Potential bullish impact">
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                      </div>
                    )}
                    {hasPotentialImpact(event.title, 'bearish') && (
                      <div className="h-5 w-5 rounded-full bg-rose-600/10 flex items-center justify-center" title="Potential bearish impact">
                        <TrendingDown className="h-3 w-3 text-rose-500" />
                      </div>
                    )}
                    {event.impact === 'high' && (
                      <div className="h-5 w-5 rounded-full bg-amber-600/10 flex items-center justify-center" title="High volatility expected">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h3 className="font-semibold text-white text-sm leading-snug mb-1.5">{event.title}</h3>

                {/* Date / time row — wraps on mobile */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 mb-2">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 shrink-0" />{formatDate(event.date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 shrink-0" />{event.time}
                  </span>
                </div>

                {/* Forecast / Previous — stacked on mobile */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
                  <div className="text-xs">
                    <span className="text-gray-500">Forecast: </span>
                    <span className="text-white">{event.forecast || 'N/A'}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-gray-500">Previous: </span>
                    <span className="text-white">{event.previous || 'N/A'}</span>
                  </div>
                </div>

                {/* Affected pairs */}
                <div className="flex flex-wrap gap-1">
                  {event.affectedPairs.slice(0, 4).map((pair, index) => (
                    <Badge key={index} variant="outline" className="bg-gray-800 text-[10px] border-gray-700 px-1.5 py-0">
                      {pair}
                    </Badge>
                  ))}
                </div>

                {event.description && (
                  <p className="text-[11px] text-gray-500 mt-2 leading-snug line-clamp-2">{event.description}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <Calendar className="h-10 w-10 mx-auto mb-4 text-blue-500/40" />
              <p>No upcoming economic events</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

function formatDate(dateString: string): string {
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric'
  };
  return new Date(dateString).toLocaleDateString('en-US', options);
}

function hasPotentialImpact(eventTitle: string, direction: 'bullish' | 'bearish'): boolean {
  const bullishIndicators = [
    'GDP', 'Employment', 'Non-Farm Payrolls', 'Consumer Confidence', 
    'Retail Sales', 'Manufacturing PMI', 'Services PMI'
  ];
  
  const bearishIndicators = [
    'CPI', 'Inflation', 'Unemployment', 'Interest Rate', 'Trade Balance'
  ];
  
  if (direction === 'bullish') {
    return bullishIndicators.some(indicator => eventTitle.includes(indicator));
  } else {
    return bearishIndicators.some(indicator => eventTitle.includes(indicator));
  }
}
