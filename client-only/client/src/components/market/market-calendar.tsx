import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, TrendingUp, TrendingDown, AlertTriangle, Info } from 'lucide-react';

interface EconomicEvent {
  id: number;
  title: string;
  date: string;
  time: string;
  impact: 'high' | 'medium' | 'low';
  affectedPairs: string[];
  forecast?: string;
  previous?: string;
  description?: string;
}

export const MarketCalendar: React.FC = () => {
  // The economic events would normally be fetched from an API
  // This is mock data for demonstration purposes
  const upcomingEvents: EconomicEvent[] = [
    {
      id: 1,
      title: 'US Non-Farm Payrolls',
      date: '2025-04-12',
      time: '12:30 GMT',
      impact: 'high',
      affectedPairs: ['USD/EUR', 'USD/JPY', 'USD/GBP'],
      forecast: '+180K',
      previous: '+275K',
      description: 'Monthly change in employment excluding the farming sector'
    },
    {
      id: 2,
      title: 'ECB Interest Rate Decision',
      date: '2025-04-15',
      time: '11:45 GMT',
      impact: 'high',
      affectedPairs: ['EUR/USD', 'EUR/GBP', 'EUR/JPY'],
      forecast: '3.50%',
      previous: '3.50%',
      description: 'European Central Bank decision on interest rates'
    },
    {
      id: 3,
      title: 'UK CPI',
      date: '2025-04-13',
      time: '06:00 GMT',
      impact: 'medium',
      affectedPairs: ['GBP/USD', 'GBP/JPY', 'GBP/EUR'],
      forecast: '3.2%',
      previous: '3.4%',
      description: 'Year-over-year change in Consumer Price Index'
    },
    {
      id: 4,
      title: 'Japan GDP',
      date: '2025-04-16',
      time: '23:50 GMT',
      impact: 'medium',
      affectedPairs: ['USD/JPY', 'EUR/JPY'],
      forecast: '0.1%',
      previous: '-0.1%',
      description: 'Quarter-over-quarter change in Gross Domestic Product'
    },
  ];

  // Get today's date in the format YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];
  
  // Filter events to show only upcoming ones
  const filteredEvents = upcomingEvents.filter(event => event.date >= today).slice(0, 3);

  return (
    <Card className="bg-gray-900 border-gray-800 shadow-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl text-white">Economic Calendar</CardTitle>
            <CardDescription>Upcoming market-moving events</CardDescription>
          </div>
          <div className="h-8 w-8 rounded-full bg-blue-600/20 flex items-center justify-center">
            <Calendar className="h-4 w-4 text-blue-500" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredEvents.length > 0 ? (
          <div className="space-y-4">
            {filteredEvents.map((event) => (
              <div key={event.id} className="p-3 bg-gray-950 rounded-lg border border-gray-800 hover:border-blue-500/50 transition-colors">
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
                    {event.affectedPairs.map((pair, index) => (
                      <Badge key={index} variant="outline" className="bg-gray-800 text-xs border-gray-700">
                        {pair}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <Button variant="ghost" size="sm" className="w-full mt-3 text-xs text-gray-400 hover:text-white justify-start p-0">
                  <Info className="h-3 w-3 mr-1" />
                  {event.description}
                </Button>
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

// Helper function to format dates nicely
function formatDate(dateString: string): string {
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric'
  };
  return new Date(dateString).toLocaleDateString('en-US', options);
}

// Helper function to determine if an event has potential bullish/bearish impact
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