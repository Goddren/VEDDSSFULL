import OpenAI from 'openai';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
  datetime: number;
  related: string;
  category: string;
  sentiment?: {
    score: number;
    label: 'bullish' | 'bearish' | 'neutral';
  };
}

export interface NewsSentiment {
  overallScore: number;
  overallLabel: 'bullish' | 'bearish' | 'neutral';
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  totalArticles: number;
  topHeadlines: string[];
  tradingImplication: string;
}

export interface AnalyzedNewsItem extends NewsItem {
  sentiment: {
    score: number;
    label: 'bullish' | 'bearish' | 'neutral';
  };
  relativeTime: string;
  tradingRelevance: 'high' | 'medium' | 'low';
}

export interface TradingTimingAnalysis {
  optimalEntryWindow: string;
  newsPatternAlignment: 'aligned' | 'conflicting' | 'neutral';
  confidenceLevel: number;
  recommendation: string;
  recentBullishNews: AnalyzedNewsItem[];
  recentBearishNews: AnalyzedNewsItem[];
  recentNeutralNews: AnalyzedNewsItem[];
  warningMessage?: string;
  upcomingEvents?: UpcomingEconomicEvent[];
}

export interface EconomicCalendarEvent {
  country: string;
  currency?: string;
  event: string;
  time: string;
  impact: 'low' | 'medium' | 'high';
  forecast?: string;
  previous?: string;
  actual?: string;
  unit?: string;
}

export interface UpcomingEconomicEvent {
  id: string;
  event: string;
  country: string;
  currency: string;
  datetime: number;
  dateFormatted: string;
  timeFormatted: string;
  daysUntil: number;
  impact: 'high' | 'medium' | 'low';
  forecast?: string;
  previous?: string;
  potentialImpact: string;
}

class NewsService {
  private apiKey: string | null = null;
  private openai: OpenAI | null = null;
  private initialized: boolean = false;

  initialize(finnhubApiKey?: string, openaiApiKey?: string) {
    this.apiKey = finnhubApiKey || process.env.FINNHUB_API_KEY || null;
    const oaiKey = openaiApiKey || process.env.OPENAI_API_KEY;
    if (oaiKey) {
      try {
        this.openai = new OpenAI({ apiKey: oaiKey });
      } catch (e) {
        console.log('Failed to initialize OpenAI for news sentiment:', e);
        this.openai = null;
      }
    }
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
  
  hasFinnhubKey(): boolean {
    return this.apiKey !== null;
  }

  async fetchCompanyNews(symbol: string, daysBack: number = 7): Promise<NewsItem[]> {
    if (!this.apiKey) {
      console.log('Finnhub API key not configured, using fallback news');
      return this.getFallbackNews(symbol);
    }

    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);

    const from = fromDate.toISOString().split('T')[0];
    const to = toDate.toISOString().split('T')[0];

    try {
      const cleanSymbol = this.normalizeSymbol(symbol);
      const url = `${FINNHUB_BASE_URL}/company-news?symbol=${cleanSymbol}&from=${from}&to=${to}&token=${this.apiKey}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Finnhub API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) {
        return this.getFallbackNews(symbol);
      }

      return data.slice(0, 20).map((item: any) => ({
        id: item.id?.toString() || `news-${Date.now()}-${Math.random()}`,
        headline: item.headline,
        summary: item.summary,
        source: item.source,
        url: item.url,
        image: item.image || '',
        datetime: item.datetime * 1000,
        related: item.related,
        category: item.category
      }));
    } catch (error) {
      console.error('Error fetching news:', error);
      return this.getFallbackNews(symbol);
    }
  }

  async fetchMarketNews(category: string = 'general'): Promise<NewsItem[]> {
    if (!this.apiKey) {
      return this.getFallbackMarketNews();
    }

    try {
      const url = `${FINNHUB_BASE_URL}/news?category=${category}&token=${this.apiKey}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Finnhub API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) {
        return this.getFallbackMarketNews();
      }

      return data.slice(0, 15).map((item: any) => ({
        id: item.id?.toString() || `news-${Date.now()}-${Math.random()}`,
        headline: item.headline,
        summary: item.summary,
        source: item.source,
        url: item.url,
        image: item.image || '',
        datetime: item.datetime * 1000,
        related: item.related || '',
        category: item.category
      }));
    } catch (error) {
      console.error('Error fetching market news:', error);
      return this.getFallbackMarketNews();
    }
  }

  async analyzeNewsSentiment(news: NewsItem[], symbol: string): Promise<NewsSentiment> {
    if (news.length === 0) {
      return this.getDefaultSentiment();
    }

    if (this.openai) {
      try {
        const headlines = news.slice(0, 10).map(n => n.headline).join('\n');
        
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are a financial news sentiment analyzer. Analyze the following headlines for ${symbol} and provide sentiment analysis. Respond in JSON format only.`
            },
            {
              role: 'user',
              content: `Analyze these headlines and return JSON with this structure:
{
  "overallScore": number between -100 (very bearish) and 100 (very bullish),
  "overallLabel": "bullish" | "bearish" | "neutral",
  "bullishCount": number of bullish headlines,
  "bearishCount": number of bearish headlines,
  "neutralCount": number of neutral headlines,
  "tradingImplication": "Brief 1-2 sentence trading implication based on news"
}

Headlines:
${headlines}`
            }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 500
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');
        
        const validLabels: ('bullish' | 'bearish' | 'neutral')[] = ['bullish', 'bearish', 'neutral'];
        const overallLabel = validLabels.includes(result.overallLabel) 
          ? result.overallLabel as 'bullish' | 'bearish' | 'neutral'
          : 'neutral';
        
        return {
          overallScore: typeof result.overallScore === 'number' ? result.overallScore : 0,
          overallLabel,
          bullishCount: typeof result.bullishCount === 'number' ? result.bullishCount : 0,
          bearishCount: typeof result.bearishCount === 'number' ? result.bearishCount : 0,
          neutralCount: typeof result.neutralCount === 'number' ? result.neutralCount : news.length,
          totalArticles: news.length,
          topHeadlines: news.slice(0, 3).map(n => n.headline),
          tradingImplication: result.tradingImplication || 'Monitor news for trading opportunities.'
        };
      } catch (error) {
        console.error('Error analyzing sentiment with AI:', error);
      }
    }

    return this.basicSentimentAnalysis(news);
  }

  private basicSentimentAnalysis(news: NewsItem[]): NewsSentiment {
    const bullishWords = ['surge', 'rally', 'gain', 'jump', 'rise', 'soar', 'bullish', 'growth', 'profit', 'beat', 'outperform', 'upgrade', 'buy', 'positive', 'strong', 'record', 'high'];
    const bearishWords = ['fall', 'drop', 'decline', 'crash', 'plunge', 'bearish', 'loss', 'miss', 'underperform', 'downgrade', 'sell', 'negative', 'weak', 'low', 'concern', 'fear', 'risk'];

    let bullishCount = 0;
    let bearishCount = 0;
    let neutralCount = 0;

    for (const item of news) {
      const text = (item.headline + ' ' + item.summary).toLowerCase();
      const bullishMatches = bullishWords.filter(w => text.includes(w)).length;
      const bearishMatches = bearishWords.filter(w => text.includes(w)).length;

      if (bullishMatches > bearishMatches) {
        bullishCount++;
      } else if (bearishMatches > bullishMatches) {
        bearishCount++;
      } else {
        neutralCount++;
      }
    }

    const total = news.length;
    const score = total > 0 ? Math.round(((bullishCount - bearishCount) / total) * 100) : 0;
    
    let label: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (score > 20) label = 'bullish';
    else if (score < -20) label = 'bearish';

    let implication = 'News sentiment is mixed. Consider other indicators.';
    if (label === 'bullish') {
      implication = 'Positive news flow suggests favorable market conditions for long positions.';
    } else if (label === 'bearish') {
      implication = 'Negative news sentiment indicates caution. Consider short positions or staying out.';
    }

    const countSum = bullishCount + bearishCount + neutralCount;
    const normalizedNeutral = total > 0 && countSum !== total ? total - bullishCount - bearishCount : neutralCount;

    return {
      overallScore: score,
      overallLabel: label,
      bullishCount,
      bearishCount,
      neutralCount: Math.max(0, normalizedNeutral),
      totalArticles: total,
      topHeadlines: news.slice(0, 3).map(n => n.headline),
      tradingImplication: implication
    };
  }

  private normalizeSymbol(symbol: string): string {
    let clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    const forexPairs = ['EUR', 'GBP', 'USD', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];
    const isForex = forexPairs.some(c => clean.startsWith(c) && clean.length <= 7);
    if (isForex) {
      return clean.slice(0, 3);
    }

    const cryptoMap: Record<string, string> = {
      'BTCUSD': 'COIN',
      'ETHUSD': 'COIN',
      'BTC': 'COIN',
      'ETH': 'COIN'
    };
    if (cryptoMap[clean]) {
      return cryptoMap[clean];
    }

    return clean;
  }

  private isForexPair(symbol: string): boolean {
    const clean = symbol.toUpperCase().replace(/[^A-Z]/g, '');
    const currencies = ['EUR', 'GBP', 'USD', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];
    if (clean.length === 6) {
      const base = clean.slice(0, 3);
      const quote = clean.slice(3, 6);
      return currencies.includes(base) && currencies.includes(quote);
    }
    return false;
  }

  private getForexCurrencies(symbol: string): { base: string; quote: string } | null {
    const clean = symbol.toUpperCase().replace(/[^A-Z]/g, '');
    if (clean.length === 6) {
      return {
        base: clean.slice(0, 3),
        quote: clean.slice(3, 6)
      };
    }
    return null;
  }

  async fetchPairSpecificNews(symbol: string, daysBack: number = 7): Promise<{ baseNews: NewsItem[]; quoteNews: NewsItem[]; combined: NewsItem[] }> {
    const currencies = this.getForexCurrencies(symbol);
    
    if (!currencies) {
      const news = await this.fetchCompanyNews(symbol, daysBack);
      return { baseNews: news, quoteNews: [], combined: news };
    }

    const currencyStockMap: Record<string, string[]> = {
      'EUR': ['FXE', 'EUO'],
      'GBP': ['FXB', 'GBB'],
      'USD': ['UUP', 'USDU'],
      'JPY': ['FXY', 'YCL'],
      'CHF': ['FXF'],
      'AUD': ['FXA', 'CROC'],
      'CAD': ['FXC'],
      'NZD': ['NZDUSD=X']
    };

    const baseSymbols = currencyStockMap[currencies.base] || [currencies.base];
    const quoteSymbols = currencyStockMap[currencies.quote] || [currencies.quote];

    let baseNews: NewsItem[] = [];
    let quoteNews: NewsItem[] = [];

    for (const sym of baseSymbols) {
      const news = await this.fetchCompanyNews(sym, daysBack);
      if (news.length > 0 && !news[0].headline.includes('No specific news')) {
        baseNews = news;
        break;
      }
    }

    for (const sym of quoteSymbols) {
      const news = await this.fetchCompanyNews(sym, daysBack);
      if (news.length > 0 && !news[0].headline.includes('No specific news')) {
        quoteNews = news;
        break;
      }
    }

    if (baseNews.length === 0) {
      baseNews = this.getCurrencyFallbackNews(currencies.base);
    }
    if (quoteNews.length === 0) {
      quoteNews = this.getCurrencyFallbackNews(currencies.quote);
    }

    const combined = [...baseNews.slice(0, 10), ...quoteNews.slice(0, 10)]
      .sort((a, b) => b.datetime - a.datetime);

    return { baseNews, quoteNews, combined };
  }

  private getCurrencyFallbackNews(currency: string): NewsItem[] {
    const currencyNames: Record<string, string> = {
      'EUR': 'Euro',
      'GBP': 'British Pound',
      'USD': 'US Dollar',
      'JPY': 'Japanese Yen',
      'CHF': 'Swiss Franc',
      'AUD': 'Australian Dollar',
      'CAD': 'Canadian Dollar',
      'NZD': 'New Zealand Dollar'
    };

    const now = Date.now();
    const randomSeed = Math.random();
    const name = currencyNames[currency] || currency;

    if (randomSeed > 0.5) {
      return [
        {
          id: `fallback-${currency}-bull-${now}`,
          headline: `${name} surges on strong economic growth data`,
          summary: `${name} gains momentum as positive economic indicators boost bullish sentiment and drive buying interest.`,
          source: 'VEDD AI Forex Analysis',
          url: '',
          image: '',
          datetime: now - 3600000,
          related: currency,
          category: 'forex'
        },
        {
          id: `fallback-${currency}-neutral-${now}`,
          headline: `${name} traders watch central bank signals`,
          summary: `Market participants monitor policy decisions for ${currency} direction.`,
          source: 'VEDD AI Forex Analysis',
          url: '',
          image: '',
          datetime: now - 7200000,
          related: currency,
          category: 'forex'
        }
      ];
    } else {
      return [
        {
          id: `fallback-${currency}-bear-${now}`,
          headline: `${name} falls amid concerns over weak data`,
          summary: `${name} drops as bearish pressure increases with risk factors weighing on sentiment.`,
          source: 'VEDD AI Forex Analysis',
          url: '',
          image: '',
          datetime: now - 3600000,
          related: currency,
          category: 'forex'
        },
        {
          id: `fallback-${currency}-neutral-${now}`,
          headline: `${name} volatility persists as markets assess risk`,
          summary: `Traders remain cautious on ${currency} positions amid uncertain conditions.`,
          source: 'VEDD AI Forex Analysis',
          url: '',
          image: '',
          datetime: now - 7200000,
          related: currency,
          category: 'forex'
        }
      ];
    }
  }

  async analyzePairSentiment(symbol: string, daysBack: number = 7): Promise<NewsSentiment & { baseImpact: string; quoteImpact: string; pairDirection: string }> {
    const { baseNews, quoteNews, combined } = await this.fetchPairSpecificNews(symbol, daysBack);
    const currencies = this.getForexCurrencies(symbol);
    
    if (!currencies || !this.openai) {
      const basicSentiment = await this.analyzeNewsSentiment(combined, symbol);
      return {
        ...basicSentiment,
        baseImpact: 'neutral',
        quoteImpact: 'neutral',
        pairDirection: 'Monitor for clearer signals'
      };
    }

    try {
      const baseHeadlines = baseNews.slice(0, 5).map(n => n.headline).join('\n');
      const quoteHeadlines = quoteNews.slice(0, 5).map(n => n.headline).join('\n');

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a Forex news sentiment analyzer. Analyze news for the ${symbol} currency pair. The BASE currency is ${currencies.base} and the QUOTE currency is ${currencies.quote}. 
            
For ${symbol}:
- If ${currencies.base} is STRONGER than ${currencies.quote} → pair goes UP (bullish for ${symbol})
- If ${currencies.base} is WEAKER than ${currencies.quote} → pair goes DOWN (bearish for ${symbol})

Respond in JSON format only.`
          },
          {
            role: 'user',
            content: `Analyze these currency-specific headlines for ${symbol} trading direction:

${currencies.base} (Base Currency) Headlines:
${baseHeadlines || 'No specific news available'}

${currencies.quote} (Quote Currency) Headlines:
${quoteHeadlines || 'No specific news available'}

Return JSON:
{
  "overallScore": number -100 to 100 (positive = bullish for ${symbol}, negative = bearish),
  "overallLabel": "bullish" | "bearish" | "neutral",
  "baseImpact": "strengthening" | "weakening" | "neutral" (for ${currencies.base}),
  "quoteImpact": "strengthening" | "weakening" | "neutral" (for ${currencies.quote}),
  "bullishCount": number of bullish headlines for ${symbol},
  "bearishCount": number of bearish headlines for ${symbol},
  "neutralCount": number of neutral headlines,
  "pairDirection": "Brief 1-2 sentence explaining expected ${symbol} direction based on relative currency strength",
  "tradingImplication": "Specific trading recommendation for ${symbol}"
}`
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 600
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      const validLabels: ('bullish' | 'bearish' | 'neutral')[] = ['bullish', 'bearish', 'neutral'];
      const overallLabel = validLabels.includes(result.overallLabel) 
        ? result.overallLabel as 'bullish' | 'bearish' | 'neutral'
        : 'neutral';

      return {
        overallScore: typeof result.overallScore === 'number' ? result.overallScore : 0,
        overallLabel,
        bullishCount: typeof result.bullishCount === 'number' ? result.bullishCount : 0,
        bearishCount: typeof result.bearishCount === 'number' ? result.bearishCount : 0,
        neutralCount: typeof result.neutralCount === 'number' ? result.neutralCount : combined.length,
        totalArticles: combined.length,
        topHeadlines: combined.slice(0, 3).map(n => n.headline),
        tradingImplication: result.tradingImplication || 'Monitor news for trading opportunities.',
        baseImpact: result.baseImpact || 'neutral',
        quoteImpact: result.quoteImpact || 'neutral',
        pairDirection: result.pairDirection || 'Analyze both currencies for clearer direction'
      };
    } catch (error) {
      console.error('Error analyzing pair sentiment:', error);
      const basicSentiment = await this.analyzeNewsSentiment(combined, symbol);
      return {
        ...basicSentiment,
        baseImpact: 'neutral',
        quoteImpact: 'neutral',
        pairDirection: 'Unable to determine pair direction from current news'
      };
    }
  }

  private getFallbackNews(symbol: string): NewsItem[] {
    const now = Date.now();
    const randomSeed = Math.random();
    
    if (randomSeed > 0.6) {
      return [
        {
          id: `fallback-bull-1-${now}`,
          headline: `${symbol} surges as investors rally behind strong economic data`,
          summary: `${symbol} shows bullish momentum with prices jumping on positive growth indicators and strong market sentiment driving gains.`,
          source: 'VEDD AI Market Analysis',
          url: '#',
          image: '',
          datetime: now - 3600000,
          related: symbol,
          category: 'analysis'
        },
        {
          id: `fallback-bull-2-${now}`,
          headline: `Analysts upgrade ${symbol} outlook citing positive fundamentals`,
          summary: `Technical analysts note strong support levels holding as ${symbol} outperforms expectations with record gains.`,
          source: 'VEDD AI Market Analysis',
          url: '#',
          image: '',
          datetime: now - 7200000,
          related: symbol,
          category: 'analysis'
        },
        {
          id: `fallback-neutral-${now}`,
          headline: `${symbol} consolidates near key technical levels`,
          summary: `Market participants await further confirmation before committing to directional trades.`,
          source: 'VEDD AI Market Analysis',
          url: '#',
          image: '',
          datetime: now - 10800000,
          related: symbol,
          category: 'economy'
        }
      ];
    } else if (randomSeed > 0.3) {
      return [
        {
          id: `fallback-bear-1-${now}`,
          headline: `${symbol} falls amid growing concerns over economic weakness`,
          summary: `${symbol} plunges as bearish sentiment increases with risk of further decline on weak data.`,
          source: 'VEDD AI Market Analysis',
          url: '#',
          image: '',
          datetime: now - 3600000,
          related: symbol,
          category: 'analysis'
        },
        {
          id: `fallback-bear-2-${now}`,
          headline: `Analysts downgrade ${symbol} on negative outlook`,
          summary: `Market fear spreads as ${symbol} drops with losses accelerating on weak fundamentals.`,
          source: 'VEDD AI Market Analysis',
          url: '#',
          image: '',
          datetime: now - 7200000,
          related: symbol,
          category: 'analysis'
        },
        {
          id: `fallback-neutral-${now}`,
          headline: `${symbol} traders assess risk levels carefully`,
          summary: `Current conditions suggest monitoring key support and resistance before taking positions.`,
          source: 'VEDD AI Market Analysis',
          url: '#',
          image: '',
          datetime: now - 10800000,
          related: symbol,
          category: 'economy'
        }
      ];
    } else {
      return [
        {
          id: `fallback-mix-1-${now}`,
          headline: `${symbol} gains momentum as market sentiment improves`,
          summary: `Strong buying interest drives ${symbol} higher with positive technical signals emerging.`,
          source: 'VEDD AI Market Analysis',
          url: '#',
          image: '',
          datetime: now - 3600000,
          related: symbol,
          category: 'analysis'
        },
        {
          id: `fallback-mix-2-${now}`,
          headline: `${symbol} faces resistance as volatility concerns persist`,
          summary: `Risk factors and uncertainty create mixed signals for traders.`,
          source: 'VEDD AI Market Analysis',
          url: '#',
          image: '',
          datetime: now - 7200000,
          related: symbol,
          category: 'analysis'
        },
        {
          id: `fallback-mix-3-${now}`,
          headline: `${symbol} technical outlook remains balanced`,
          summary: `Current market dynamics suggest cautious positioning with opportunity for both bulls and bears.`,
          source: 'VEDD AI Market Analysis',
          url: '#',
          image: '',
          datetime: now - 10800000,
          related: symbol,
          category: 'economy'
        }
      ];
    }
  }

  private getFallbackMarketNews(): NewsItem[] {
    const now = Date.now();
    const headlines = [
      { headline: 'Global markets show mixed signals amid economic uncertainty', summary: 'Traders are closely watching central bank decisions and economic data releases.' },
      { headline: 'Technical indicators suggest key market turning points', summary: 'Major indices approaching critical support and resistance levels.' },
      { headline: 'Currency markets remain volatile as investors assess data', summary: 'Forex traders monitoring central bank policies and economic indicators closely.' },
      { headline: 'Precious metals respond to risk sentiment shifts', summary: 'Gold and silver prices fluctuate as traders balance risk-on and risk-off strategies.' },
      { headline: 'Energy markets face supply and demand pressures', summary: 'Oil prices react to inventory data and production forecasts.' },
    ];
    
    const randomizedHeadlines = headlines.sort(() => Math.random() - 0.5).slice(0, 3);
    
    return randomizedHeadlines.map((item, index) => ({
      id: `market-${now}-${index}`,
      headline: item.headline,
      summary: item.summary,
      source: 'VEDD AI Market Analysis',
      url: '#',
      image: '',
      datetime: now - (index * 3600000),
      related: '',
      category: 'general'
    }));
  }

  private getDefaultSentiment(): NewsSentiment {
    return {
      overallScore: 0,
      overallLabel: 'neutral',
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      totalArticles: 0,
      topHeadlines: [],
      tradingImplication: 'No news data available. Focus on technical analysis.'
    };
  }

  private getRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  private getTradingRelevance(timestamp: number): 'high' | 'medium' | 'low' {
    const now = Date.now();
    const diff = now - timestamp;
    const hours = diff / 3600000;

    if (hours < 4) return 'high';
    if (hours < 24) return 'medium';
    return 'low';
  }

  async analyzeIndividualArticles(news: NewsItem[], symbol: string): Promise<AnalyzedNewsItem[]> {
    if (news.length === 0) {
      return [];
    }

    const basicResults = news.map(item => this.basicArticleSentiment(item));
    
    const hasNonNeutralBasic = basicResults.some(r => r.sentiment.label !== 'neutral');
    if (hasNonNeutralBasic || !this.openai) {
      return basicResults;
    }

    try {
      const headlines = news.slice(0, 15).map((n, i) => `${i + 1}. ${n.headline}`).join('\n');
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a financial news sentiment analyzer for ${symbol}. Analyze each headline for trading sentiment. Be generous in scoring - look for words like surge, rally, gain, jump, rise for bullish, and fall, drop, decline, crash for bearish.`
          },
          {
            role: 'user',
            content: `Analyze each headline's sentiment for ${symbol} trading. Be sure to assign non-zero scores when headlines contain sentiment-laden words.

Return JSON object with "sentiments" array:
{ "sentiments": [
  { "index": 1, "sentiment": "bullish" | "bearish" | "neutral", "score": -100 to 100 },
  ...
]}

Headlines:
${headlines}`
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 800
      });

      const result = JSON.parse(response.choices[0].message.content || '{"sentiments":[]}');
      const sentiments = Array.isArray(result) ? result : (result.sentiments || []);

      const aiResults = news.slice(0, 15).map((item, index) => {
        const analysis = sentiments.find((s: any) => s.index === index + 1);
        const validLabels: ('bullish' | 'bearish' | 'neutral')[] = ['bullish', 'bearish', 'neutral'];
        const label = analysis && validLabels.includes(analysis.sentiment) 
          ? analysis.sentiment as 'bullish' | 'bearish' | 'neutral'
          : 'neutral';
        
        return {
          ...item,
          sentiment: {
            score: analysis?.score || 0,
            label
          },
          relativeTime: this.getRelativeTime(item.datetime),
          tradingRelevance: this.getTradingRelevance(item.datetime)
        };
      });

      const aiHasNonNeutral = aiResults.some(r => r.sentiment.label !== 'neutral' || r.sentiment.score !== 0);
      return aiHasNonNeutral ? aiResults : basicResults;
    } catch (error) {
      console.error('Error analyzing individual articles:', error);
      return basicResults;
    }
  }

  private basicArticleSentiment(item: NewsItem): AnalyzedNewsItem {
    const bullishPatterns = [
      /\bsurg/i, /\brall/i, /\bgain/i, /\bjump/i, /\bris(e|ing|es)\b/i, /\bsoar/i, 
      /\bbullish/i, /\bgrowth/i, /\bprofit/i, /\bbeat/i, /\boutperform/i, /\bupgrade/i, 
      /\bbuy\b/i, /\bpositive/i, /\bstrong/i, /\brecord/i, /\bhigh\b/i, /\bboost/i,
      /\bmomentum/i, /\bimprove/i, /\boptimis/i, /\badvance/i, /\bup\b/i
    ];
    const bearishPatterns = [
      /\bfall/i, /\bdrop/i, /\bdeclin/i, /\bcrash/i, /\bplung/i, /\bbearish/i, 
      /\bloss/i, /\bmiss/i, /\bunderperform/i, /\bdowngrade/i, /\bsell\b/i, 
      /\bnegative/i, /\bweak/i, /\blow\b/i, /\bconcern/i, /\bfear/i, /\brisk/i,
      /\bslide/i, /\bslump/i, /\bpressure/i, /\btumble/i, /\bdown\b/i
    ];

    const text = (item.headline + ' ' + item.summary).toLowerCase();
    const bullishMatches = bullishPatterns.filter(pattern => pattern.test(text)).length;
    const bearishMatches = bearishPatterns.filter(pattern => pattern.test(text)).length;

    let label: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let score = 0;

    if (bullishMatches > bearishMatches) {
      label = 'bullish';
      score = Math.min(bullishMatches * 15, 80);
    } else if (bearishMatches > bullishMatches) {
      label = 'bearish';
      score = -Math.min(bearishMatches * 15, 80);
    } else if (bullishMatches > 0 && bearishMatches > 0) {
      score = (bullishMatches - bearishMatches) * 10;
    }

    return {
      ...item,
      sentiment: { score, label },
      relativeTime: this.getRelativeTime(item.datetime),
      tradingRelevance: this.getTradingRelevance(item.datetime)
    };
  }

  async fetchEconomicCalendar(daysAhead: number = 5): Promise<EconomicCalendarEvent[]> {
    if (!this.apiKey) {
      return [];
    }

    const fromDate = new Date();
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + daysAhead);

    const from = fromDate.toISOString().split('T')[0];
    const to = toDate.toISOString().split('T')[0];

    try {
      const url = `${FINNHUB_BASE_URL}/calendar/economic?from=${from}&to=${to}&token=${this.apiKey}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.log('Finnhub economic calendar error');
        return [];
      }

      const data = await response.json();
      
      if (!data.economicCalendar || !Array.isArray(data.economicCalendar)) {
        return [];
      }

      return data.economicCalendar.map((event: any) => ({
        country: event.country || '',
        currency: event.currency || '',
        event: event.event || '',
        time: event.time || '',
        impact: this.mapEventImpact(event.impact),
        forecast: event.estimate?.toString(),
        previous: event.prev?.toString(),
        actual: event.actual?.toString(),
        unit: event.unit
      }));
    } catch (error) {
      console.error('Error fetching economic calendar:', error);
      return [];
    }
  }

  private mapEventImpact(impact: string | number): 'high' | 'medium' | 'low' {
    if (typeof impact === 'number') {
      if (impact >= 3) return 'high';
      if (impact >= 2) return 'medium';
      return 'low';
    }
    const impactStr = String(impact).toLowerCase();
    if (impactStr.includes('high') || impactStr === '3') return 'high';
    if (impactStr.includes('medium') || impactStr === '2') return 'medium';
    return 'low';
  }

  private getFallbackEconomicEventsForPair(baseCurrency: string, quoteCurrency: string): EconomicCalendarEvent[] {
    const now = new Date();
    const events: EconomicCalendarEvent[] = [];
    
    const currencyToCountry: Record<string, string> = {
      'USD': 'US', 'EUR': 'EU', 'GBP': 'GB', 'JPY': 'JP',
      'CHF': 'CH', 'AUD': 'AU', 'CAD': 'CA', 'NZD': 'NZ'
    };

    const allMajorEvents = [
      { currency: 'USD', event: 'Fed Interest Rate Decision', impact: 'high' as const },
      { currency: 'USD', event: 'Non-Farm Payrolls', impact: 'high' as const },
      { currency: 'USD', event: 'CPI Inflation Rate', impact: 'high' as const },
      { currency: 'USD', event: 'Retail Sales', impact: 'medium' as const },
      { currency: 'EUR', event: 'ECB Interest Rate Decision', impact: 'high' as const },
      { currency: 'EUR', event: 'GDP Growth Rate', impact: 'medium' as const },
      { currency: 'EUR', event: 'CPI Flash Estimate', impact: 'high' as const },
      { currency: 'GBP', event: 'BoE Interest Rate Decision', impact: 'high' as const },
      { currency: 'GBP', event: 'GDP Growth Rate', impact: 'medium' as const },
      { currency: 'JPY', event: 'BoJ Interest Rate Decision', impact: 'high' as const },
      { currency: 'CHF', event: 'SNB Interest Rate Decision', impact: 'high' as const },
      { currency: 'AUD', event: 'RBA Interest Rate Decision', impact: 'high' as const },
      { currency: 'CAD', event: 'BoC Interest Rate Decision', impact: 'high' as const },
      { currency: 'NZD', event: 'RBNZ Interest Rate Decision', impact: 'high' as const }
    ];

    const relevantEvents = allMajorEvents.filter(e => 
      e.currency === baseCurrency || e.currency === quoteCurrency
    );

    relevantEvents.slice(0, 6).forEach((evt, idx) => {
      const eventDate = new Date(now);
      eventDate.setDate(eventDate.getDate() + 1 + idx);
      eventDate.setHours(8 + (idx % 4) * 2, 30, 0, 0);

      events.push({
        country: currencyToCountry[evt.currency] || evt.currency,
        currency: evt.currency,
        event: evt.event,
        time: eventDate.toISOString(),
        impact: evt.impact,
        forecast: undefined,
        previous: undefined
      });
    });

    return events;
  }

  async getUpcomingEventsForPair(symbol: string, daysAhead: number = 5): Promise<UpcomingEconomicEvent[]> {
    const currencies = this.getForexCurrencies(symbol);
    const baseCurrency = currencies?.base || symbol.slice(0, 3).toUpperCase();
    const quoteCurrency = currencies?.quote || symbol.slice(3, 6).toUpperCase();
    
    let allEvents: EconomicCalendarEvent[];
    
    if (this.apiKey) {
      allEvents = await this.fetchEconomicCalendar(daysAhead);
      if (allEvents.length === 0) {
        allEvents = this.getFallbackEconomicEventsForPair(baseCurrency, quoteCurrency);
      }
    } else {
      allEvents = this.getFallbackEconomicEventsForPair(baseCurrency, quoteCurrency);
    }
    
    const countryToCurrency: Record<string, string> = {
      'US': 'USD', 'EU': 'EUR', 'GB': 'GBP', 'JP': 'JPY',
      'CH': 'CHF', 'AU': 'AUD', 'CA': 'CAD', 'NZ': 'NZD',
      'United States': 'USD', 'Euro Area': 'EUR', 'Eurozone': 'EUR',
      'United Kingdom': 'GBP', 'Japan': 'JPY', 'Switzerland': 'CHF',
      'Australia': 'AUD', 'Canada': 'CAD', 'New Zealand': 'NZD'
    };

    const relevantCurrencies = [baseCurrency, quoteCurrency];

    const now = Date.now();
    const relevantEvents = allEvents
      .filter(event => {
        const eventCurrency = event.currency?.toUpperCase() || countryToCurrency[event.country] || '';
        return relevantCurrencies.includes(eventCurrency) && 
               (event.impact === 'high' || event.impact === 'medium');
      })
      .map((event, idx) => {
        const eventDate = new Date(event.time);
        const daysUntil = Math.ceil((eventDate.getTime() - now) / (1000 * 60 * 60 * 24));
        const currency = event.currency?.toUpperCase() || countryToCurrency[event.country] || event.country;
        
        return {
          id: `event-${idx}-${eventDate.getTime()}`,
          event: event.event,
          country: event.country,
          currency,
          datetime: eventDate.getTime(),
          dateFormatted: eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          timeFormatted: eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          daysUntil: Math.max(0, daysUntil),
          impact: event.impact,
          forecast: event.forecast,
          previous: event.previous,
          potentialImpact: this.getEventPotentialImpact(event.event, currency, relevantCurrencies)
        };
      })
      .filter(event => event.daysUntil >= 0 && event.daysUntil <= daysAhead)
      .sort((a, b) => a.datetime - b.datetime)
      .slice(0, 8);

    return relevantEvents;
  }

  private getEventPotentialImpact(eventName: string, currency: string, pairCurrencies: string[]): string {
    const eventLower = eventName.toLowerCase();
    const isBase = pairCurrencies[0] === currency;
    const direction = isBase ? 'pair' : 'inverse';
    
    if (eventLower.includes('interest rate') || eventLower.includes('rate decision')) {
      return `Major market mover. ${isBase ? 'Higher rates bullish' : 'Higher rates bearish'} for ${direction}.`;
    }
    if (eventLower.includes('non-farm') || eventLower.includes('nfp') || eventLower.includes('payroll')) {
      return `High volatility expected. Strong data ${isBase ? 'bullish' : 'bearish'} for the pair.`;
    }
    if (eventLower.includes('cpi') || eventLower.includes('inflation')) {
      return `Inflation data impacts rate expectations. Watch for breakout moves.`;
    }
    if (eventLower.includes('gdp')) {
      return `Growth data affects ${currency} strength. May cause trend continuation or reversal.`;
    }
    if (eventLower.includes('retail')) {
      return `Consumer spending indicator. Can trigger intraday volatility.`;
    }
    return `Monitor for potential ${currency} volatility around release time.`;
  }

  async analyzeTradingTiming(
    symbol: string, 
    chartDirection: 'BUY' | 'SELL' | 'NEUTRAL',
    chartConfidence: number
  ): Promise<TradingTimingAnalysis> {
    const [newsResult, upcomingEvents] = await Promise.all([
      this.fetchPairSpecificNews(symbol, 3),
      this.getUpcomingEventsForPair(symbol, 5)
    ]);
    
    const { combined } = newsResult;
    const analyzedNews = await this.analyzeIndividualArticles(combined, symbol);
    
    const recentBullishNews = analyzedNews.filter(n => n.sentiment.label === 'bullish');
    const recentBearishNews = analyzedNews.filter(n => n.sentiment.label === 'bearish');
    const recentNeutralNews = analyzedNews.filter(n => n.sentiment.label === 'neutral');

    const highRelevanceBullish = recentBullishNews.filter(n => n.tradingRelevance === 'high').length;
    const highRelevanceBearish = recentBearishNews.filter(n => n.tradingRelevance === 'high').length;

    let newsDirection: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    if (highRelevanceBullish > highRelevanceBearish + 1) {
      newsDirection = 'BUY';
    } else if (highRelevanceBearish > highRelevanceBullish + 1) {
      newsDirection = 'SELL';
    }

    let alignment: 'aligned' | 'conflicting' | 'neutral' = 'neutral';
    let confidenceLevel = 50;
    let warningMessage: string | undefined;
    let recommendation: string;
    let optimalEntryWindow: string;

    const imminentHighImpact = upcomingEvents.filter(e => e.impact === 'high' && e.daysUntil <= 1);
    const hasImminentEvents = imminentHighImpact.length > 0;

    if (chartDirection === 'NEUTRAL' || newsDirection === 'NEUTRAL') {
      alignment = 'neutral';
      confidenceLevel = 40;
      recommendation = 'Market signals are mixed. Wait for clearer direction from both news and technical patterns.';
      optimalEntryWindow = 'Wait for confirmation';
    } else if (chartDirection === newsDirection) {
      alignment = 'aligned';
      confidenceLevel = Math.min(90, chartConfidence + 20);
      
      if (hasImminentEvents) {
        confidenceLevel = Math.max(50, confidenceLevel - 20);
        optimalEntryWindow = `Consider waiting until after ${imminentHighImpact[0].event}`;
        recommendation = `${chartDirection} signal aligned with news, but high-impact event coming soon. Consider waiting or using tighter stops.`;
      } else if (highRelevanceBullish > 0 || highRelevanceBearish > 0) {
        optimalEntryWindow = 'Now - within next 4 hours (recent news supports pattern)';
        recommendation = `Strong ${chartDirection} signal! News sentiment aligns with chart patterns. Consider entering soon while news momentum is fresh.`;
      } else {
        optimalEntryWindow = 'Monitor for fresh news confirmation';
        recommendation = `${chartDirection} signal with pattern alignment. Watch for new supporting news to time your entry.`;
      }
    } else {
      alignment = 'conflicting';
      confidenceLevel = Math.max(20, chartConfidence - 30);
      warningMessage = `⚠️ CAUTION: News sentiment (${newsDirection}) conflicts with chart pattern (${chartDirection}). This is NOT an ideal time to trade.`;
      optimalEntryWindow = 'Not recommended - wait for alignment';
      recommendation = `Conflicting signals detected. Recent news suggests ${newsDirection} while charts show ${chartDirection}. Wait for news and patterns to align before entering.`;
    }

    if (hasImminentEvents && !warningMessage) {
      const eventNames = imminentHighImpact.map(e => e.event).join(', ');
      warningMessage = `⚠️ High-impact event(s) coming soon: ${eventNames}. Expect increased volatility.`;
    }

    return {
      optimalEntryWindow,
      newsPatternAlignment: alignment,
      confidenceLevel,
      recommendation,
      recentBullishNews: recentBullishNews.slice(0, 5),
      recentBearishNews: recentBearishNews.slice(0, 5),
      recentNeutralNews: recentNeutralNews.slice(0, 3),
      warningMessage,
      upcomingEvents
    };
  }
}

export const newsService = new NewsService();
