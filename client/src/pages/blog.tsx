import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { EarlyAccessForm } from '@/components/early-access/early-access-form';
import { ArrowRight, Calendar, Clock, TrendingUp, LineChart, PieChart } from 'lucide-react';

// Sample blog articles data
const articles = [
  {
    id: 1,
    title: 'Master Chart Pattern Recognition with AI',
    excerpt: 'Learn how artificial intelligence is revolutionizing chart pattern recognition for traders.',
    date: 'April 12, 2024',
    readTime: '6 min read',
    category: 'Trading Strategy',
    imageUrl: '/assets/blog-chart-patterns.jpg',
    icon: <TrendingUp className="h-5 w-5" />,
    content: `
      <p>Pattern recognition is one of the most crucial skills for successful trading. Traditional methods require years of practice and experience, but with the rise of AI technology, traders now have access to powerful tools that can identify patterns with remarkable accuracy.</p>
      
      <p>Our AI-powered chart analysis tool can identify over 30 different chart patterns including:</p>
      <ul>
        <li>Head and Shoulders</li>
        <li>Double Tops and Bottoms</li>
        <li>Triangles (Ascending, Descending, Symmetrical)</li>
        <li>Flags and Pennants</li>
        <li>Wedges (Rising and Falling)</li>
      </ul>
      
      <p>By utilizing advanced machine learning algorithms trained on millions of historical chart examples, our system can detect patterns that might be invisible to the human eye. This gives traders a significant edge in the market, allowing them to make more informed decisions based on reliable pattern identification.</p>
      
      <p>Furthermore, our system doesn't just identify patterns—it also provides confidence scores, potential price targets, and risk assessment based on pattern quality and market conditions.</p>
    `
  },
  {
    id: 2,
    title: 'The Psychology of Successful Trading: Faith and Discipline',
    excerpt: 'Explore how combining trading psychology principles with faith-based wisdom can improve your performance.',
    date: 'April 8, 2024',
    readTime: '8 min read',
    category: 'Trading Psychology',
    imageUrl: '/assets/blog-psychology.jpg',
    icon: <PieChart className="h-5 w-5" />,
    content: `
      <p>Trading success is as much about mindset as it is about strategy. The most sophisticated trading systems will fail in the hands of someone who lacks discipline, patience, and emotional control.</p>
      
      <p>Many successful traders integrate spiritual principles into their trading approach. Proverbs like "The plans of the diligent lead to profit as surely as haste leads to poverty" (Proverbs 21:5) remind us of the importance of careful planning and patience.</p>
      
      <p>Here are several psychological principles that align with spiritual wisdom:</p>
      <ul>
        <li><strong>Patience</strong> - Waiting for high-probability setups rather than forcing trades</li>
        <li><strong>Discipline</strong> - Following your trading plan even when emotions try to take over</li>
        <li><strong>Humility</strong> - Accepting that the market is larger than any individual</li>
        <li><strong>Gratitude</strong> - Being thankful for both wins and the lessons that come from losses</li>
      </ul>
      
      <p>Our integrated approach combines cutting-edge technology with timeless wisdom, helping traders develop both the analytical skills and the psychological resilience needed for long-term success in the markets.</p>
    `
  },
  {
    id: 3,
    title: 'How to Leverage AI for Better Entry and Exit Points',
    excerpt: 'Discover how artificial intelligence can help you time your market entries and exits with greater precision.',
    date: 'April 5, 2024',
    readTime: '5 min read',
    category: 'Technical Analysis',
    imageUrl: '/assets/blog-ai-trading.jpg',
    icon: <LineChart className="h-5 w-5" />,
    content: `
      <p>Timing is everything in trading. Enter too early, and you might watch your position go against you unnecessarily. Enter too late, and you've missed much of the move. The same applies to exits—taking profits too soon means leaving money on the table, while holding too long risks giving back gains.</p>
      
      <p>Our AI system analyzes multiple timeframes simultaneously to identify optimal entry and exit points based on:</p>
      <ul>
        <li>Support and resistance levels across different timeframes</li>
        <li>Volume analysis and unusual activity</li>
        <li>Momentum indicators and divergences</li>
        <li>Market structure and swing points</li>
        <li>Volatility patterns and potential price targets</li>
      </ul>
      
      <p>By processing these factors faster and more comprehensively than any human could, our AI provides specific price levels for entries, stop-losses, and take-profit targets. This removes much of the guesswork from trading and helps maintain a disciplined approach.</p>
      
      <p>Early access users are reporting significant improvements in their risk-reward ratios and overall profitability after implementing our AI-suggested entry and exit points in their trading strategies.</p>
    `
  }
];

// Blog article component
function BlogArticle({ article, isExpanded, toggleExpand }: { 
  article: typeof articles[0], 
  isExpanded: boolean, 
  toggleExpand: () => void 
}) {
  return (
    <div className="bg-black/50 backdrop-blur-sm border border-gray-800 rounded-lg overflow-hidden hover:border-red-800/50 transition-all duration-300">
      <div className="p-6">
        <div className="flex items-center mb-3">
          <span className="inline-flex items-center justify-center p-2 bg-red-900/30 rounded-full text-red-400 mr-3">
            {article.icon}
          </span>
          <span className="text-xs font-medium text-red-400 uppercase">{article.category}</span>
        </div>
        
        <h3 className="text-xl md:text-2xl font-bold text-white mb-3">{article.title}</h3>
        
        <div className="flex items-center text-gray-400 text-sm mb-4">
          <Calendar className="h-4 w-4 mr-1" />
          <span className="mr-3">{article.date}</span>
          <Clock className="h-4 w-4 mr-1" />
          <span>{article.readTime}</span>
        </div>
        
        {isExpanded ? (
          <div className="text-gray-300 mb-6">
            <div dangerouslySetInnerHTML={{ __html: article.content }} className="prose prose-invert max-w-none prose-p:text-gray-300 prose-li:text-gray-300" />
          </div>
        ) : (
          <p className="text-gray-300 mb-6">{article.excerpt}</p>
        )}
        
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            className="text-white border-gray-700 hover:bg-gray-800"
            onClick={toggleExpand}
          >
            {isExpanded ? 'Show Less' : 'Read More'}
          </Button>
          
          <EarlyAccessForm />
        </div>
      </div>
    </div>
  );
}

export default function BlogPage() {
  // State to track which article is expanded
  const [expandedArticleId, setExpandedArticleId] = React.useState<number | null>(null);
  
  // Toggle expanded state for an article
  const toggleExpand = (articleId: number) => {
    setExpandedArticleId(expandedArticleId === articleId ? null : articleId);
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black">
      <div className="max-w-5xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Trading <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-red-800">Insights</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Expert analysis, trading strategies, and market wisdom to help you succeed in the markets.
          </p>
        </div>
        
        <div className="grid grid-cols-1 gap-8">
          {articles.map(article => (
            <BlogArticle 
              key={article.id} 
              article={article} 
              isExpanded={expandedArticleId === article.id}
              toggleExpand={() => toggleExpand(article.id)}
            />
          ))}
        </div>
        
        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold text-white mb-6">Ready to Elevate Your Trading?</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth">
              <Button size="lg" className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50 transition-all duration-300 transform hover:scale-105">
                Sign Up Now <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <EarlyAccessForm />
          </div>
        </div>
      </div>
    </div>
  );
}