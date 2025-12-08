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
    console.log(`News service initialized: Finnhub=${!!this.apiKey}, OpenAI=${!!this.openai}`);
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
      'EUR': 'Euro / European Central Bank',
      'GBP': 'British Pound / Bank of England',
      'USD': 'US Dollar / Federal Reserve',
      'JPY': 'Japanese Yen / Bank of Japan',
      'CHF': 'Swiss Franc / Swiss National Bank',
      'AUD': 'Australian Dollar / RBA',
      'CAD': 'Canadian Dollar / Bank of Canada',
      'NZD': 'New Zealand Dollar / RBNZ'
    };

    return [{
      id: `fallback-${currency}-${Date.now()}`,
      headline: `${currencyNames[currency] || currency} - Market Awaiting Data`,
      summary: `Monitor central bank announcements and economic data releases for ${currency} trading direction.`,
      source: 'VEDD AI',
      url: '',
      image: '',
      datetime: Date.now(),
      related: currency,
      category: 'forex'
    }];
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
    return [
      {
        id: 'fallback-1',
        headline: `${symbol} shows strong technical patterns in recent trading`,
        summary: `Technical analysts note key support and resistance levels forming for ${symbol}, suggesting potential trading opportunities.`,
        source: 'VEDD AI Market Analysis',
        url: '#',
        image: '',
        datetime: now - 3600000,
        related: symbol,
        category: 'analysis'
      },
      {
        id: 'fallback-2',
        headline: `Market volatility creates opportunities for ${symbol} traders`,
        summary: `Current market conditions present both risks and opportunities for active traders.`,
        source: 'VEDD AI Market Analysis',
        url: '#',
        image: '',
        datetime: now - 7200000,
        related: symbol,
        category: 'analysis'
      },
      {
        id: 'fallback-3',
        headline: `Global economic factors influencing ${symbol} price action`,
        summary: `Central bank policies and economic indicators continue to drive market sentiment.`,
        source: 'VEDD AI Market Analysis',
        url: '#',
        image: '',
        datetime: now - 10800000,
        related: symbol,
        category: 'economy'
      }
    ];
  }

  private getFallbackMarketNews(): NewsItem[] {
    const now = Date.now();
    return [
      {
        id: 'market-1',
        headline: 'Global markets show mixed signals amid economic uncertainty',
        summary: 'Traders are closely watching central bank decisions and economic data releases.',
        source: 'VEDD AI Market Analysis',
        url: '#',
        image: '',
        datetime: now - 3600000,
        related: '',
        category: 'general'
      },
      {
        id: 'market-2',
        headline: 'Technical indicators suggest key market turning points',
        summary: 'Major indices approaching critical support and resistance levels.',
        source: 'VEDD AI Market Analysis',
        url: '#',
        image: '',
        datetime: now - 7200000,
        related: '',
        category: 'general'
      }
    ];
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
}

export const newsService = new NewsService();
