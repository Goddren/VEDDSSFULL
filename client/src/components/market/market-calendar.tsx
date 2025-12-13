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
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-medium text-white flex items-center gap-2">
                      {event.title}
                      {event.impact === 'high' && (
                        <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20">
                          High Impact
                        </Badge>
                      )}
                      {event.impact === 'medium' && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                          Medium Impact
                        </Badge>
                      )}
                    </h3>
                    <div className="text-sm text-gray-400 flex items-center mt-1">
                      <Calendar className="h-3 w-3 mr-1 inline" />
                      {formatDate(event.date)}
                      <span className="mx-2">•</span>
                      <Clock className="h-3 w-3 mr-1 inline" />
                      {event.time}
                      {event.currency && (
                        <>
                          <span className="mx-2">•</span>
                          <span className="text-blue-400">{event.currency}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex space-x-1">
                    {hasPotentialImpact(event.title, 'bullish') && (
                      <div className="h-6 w-6 rounded-full bg-emerald-600/10 flex items-center justify-center" title="Potential bullish impact">
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                      </div>
                    )}
                    {hasPotentialImpact(event.title, 'bearish') && (
                      <div className="h-6 w-6 rounded-full bg-rose-600/10 flex items-center justify-center" title="Potential bearish impact">
                        <TrendingDown className="h-3 w-3 text-rose-500" />
                      </div>
                    )}
                    {event.impact === 'high' && (
                      <div className="h-6 w-6 rounded-full bg-amber-600/10 flex items-center justify-center" title="High volatility expected">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="text-xs">
                    <span className="text-gray-500">Forecast:</span>
                    <span className="text-white ml-1">{event.forecast || 'N/A'}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-gray-500">Previous:</span>
                    <span className="text-white ml-1">{event.previous || 'N/A'}</span>
                  </div>
                </div>
                
                <div className="mt-3">
                  <div className="text-xs flex flex-wrap gap-1">
                    <span className="text-gray-500">Affected pairs:</span>
                    {event.affectedPairs.slice(0, 3).map((pair, index) => (
                      <Badge key={index} variant="outline" className="bg-gray-800 text-xs border-gray-700">
                        {pair}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                {event.description && (
                  <Button variant="ghost" size="sm" className="w-full mt-3 text-xs text-gray-400 hover:text-white justify-start p-0">
                    <Info className="h-3 w-3 mr-1" />
                    {event.description}
                  </Button>
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
