import { NewsEvent } from "@/components/ui/news-alert";

// This would ideally come from an actual financial news API like Alpha Vantage,
// MarketAux, or a custom backend endpoint that aggregates news from sources.
// For now, we're using demo data that would change based on the currency pair.

// Sample of high-impact news events by currency
const newsEvents: Record<string, NewsEvent[]> = {
  "USD": [
    {
      id: "usd-fomc-1",
      title: "FOMC Meeting Minutes",
      currency: "USD",
      impact: "high",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days from now
      description: "Federal Reserve's Federal Open Market Committee releases minutes from their latest meeting. May impact interest rate expectations."
    },
    {
      id: "usd-nfp-1",
      title: "Non-Farm Payroll",
      currency: "USD",
      impact: "high",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 4).toISOString(), // 4 days from now
      description: "Key employment data showing the number of jobs added to the US economy. Strong indicator of economic health."
    },
    {
      id: "usd-gdp-1",
      title: "Preliminary GDP",
      currency: "USD",
      impact: "high",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 6).toISOString(), // 6 days from now
      description: "Preliminary Gross Domestic Product report measuring the annualized change in the inflation-adjusted value of all goods and services produced by the economy."
    },
  ],
  "EUR": [
    {
      id: "eur-ecb-1",
      title: "ECB Interest Rate Decision",
      currency: "EUR",
      impact: "high",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(), // 3 days from now
      description: "European Central Bank's decision on interest rates and monetary policy for the Eurozone."
    },
    {
      id: "eur-pmi-1",
      title: "German Manufacturing PMI",
      currency: "EUR",
      impact: "medium",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 1).toISOString(), // 1 day from now
      description: "Survey of purchasing managers in the manufacturing sector, indicating economic health of Germany, Europe's largest economy."
    },
  ],
  "GBP": [
    {
      id: "gbp-boe-1",
      title: "BOE Monetary Policy Report",
      currency: "GBP",
      impact: "high",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString(), // 5 days from now
      description: "Bank of England's quarterly report containing economic analysis and inflation projections."
    },
  ],
  "JPY": [
    {
      id: "jpy-boj-1",
      title: "BOJ Outlook Report",
      currency: "JPY",
      impact: "high",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(), // 7 days from now
      description: "Bank of Japan's report on economic and financial developments, including future monetary policy direction."
    },
  ],
  "AUD": [
    {
      id: "aud-rba-1",
      title: "RBA Interest Rate Decision",
      currency: "AUD",
      impact: "high",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 4).toISOString(), // 4 days from now
      description: "Reserve Bank of Australia's decision on interest rates, which significantly impacts the Australian Dollar."
    },
  ],
  "CAD": [
    {
      id: "cad-boc-1",
      title: "BOC Rate Statement",
      currency: "CAD",
      impact: "high",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(), // 3 days from now
      description: "Bank of Canada's statement on interest rates and monetary policy, with significant impact on CAD."
    },
  ],
  "CHF": [
    {
      id: "chf-snb-1",
      title: "SNB Monetary Policy Assessment",
      currency: "CHF",
      impact: "high",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 8).toISOString(), // 8 days from now
      description: "Swiss National Bank's quarterly assessment on monetary policy and interest rates."
    },
  ],
  "NZD": [
    {
      id: "nzd-rbnz-1",
      title: "RBNZ Interest Rate Decision",
      currency: "NZD",
      impact: "high",
      dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 6).toISOString(), // 6 days from now
      description: "Reserve Bank of New Zealand's decision on interest rates, with significant impact on the New Zealand Dollar."
    },
  ],
  // Add more currencies as needed
};

export function getNewsForSymbol(symbol: string): NewsEvent[] {
  // Extract currency parts (e.g., from EURUSD extract EUR and USD)
  let currencies: string[] = [];
  
  // Common forex pairs are 6 characters (EURUSD, GBPJPY, etc.)
  if (symbol.length === 6) {
    currencies = [symbol.substring(0, 3), symbol.substring(3, 6)];
  } 
  // Some indices or crypto might have different formats
  else if (symbol.includes('/')) {
    currencies = symbol.split('/');
  } 
  // If we can't determine the format, use the whole symbol
  else {
    currencies = [symbol];
  }
  
  // Get all news for each currency in the pair
  let allNews: NewsEvent[] = [];
  currencies.forEach(currency => {
    if (newsEvents[currency]) {
      allNews = [...allNews, ...newsEvents[currency]];
    }
  });
  
  // Sort by date and return
  return allNews.sort((a, b) => {
    return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
  });
}

// This function would register for notifications at specific times for news events
export function registerNewsNotifications(newsEvents: NewsEvent[], onNotify: (event: NewsEvent) => void) {
  // In a real implementation, this would set up actual notification timers
  // or register with a push notification service
  
  // For this demo, we'll log which events would trigger notifications
  console.log(`Registered for ${newsEvents.length} news event notifications`);
  
  // Return a cleanup function to unregister notifications
  return () => {
    console.log('Unregistered from news notifications');
  };
}