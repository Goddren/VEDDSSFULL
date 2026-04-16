import { db } from "./db";
import { blogPosts } from "@shared/schema";
import { sql } from "drizzle-orm";

const staticArticles = [
  {
    title: "Master Chart Pattern Recognition with AI",
    slug: "master-chart-pattern-recognition-with-ai",
    excerpt: "Learn how artificial intelligence is revolutionizing chart pattern recognition for traders.",
    category: "Trading Strategy",
    readTime: "6 min read",
    isPublished: true,
    aiGenerated: false,
    authorName: "VEDD Team",
    publishedAt: new Date("2024-04-12"),
    content: `<p>Pattern recognition is one of the most crucial skills for successful trading. Traditional methods require years of practice and experience, but with the rise of AI technology, traders now have access to powerful tools that can identify patterns with remarkable accuracy.</p>

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

<p><strong>Ready to experience AI-powered pattern recognition for yourself?</strong> Join VEDD Trading AI today and get access to our full suite of tools — including the VEDD SS AI signal engine, the 44-day trading system, and more. <a href="/auth">Sign up now for a free demo.</a></p>`,
    tags: ["AI", "Chart Patterns", "Technical Analysis", "Trading Strategy"],
  },
  {
    title: "The Psychology of Successful Trading: Faith and Discipline",
    slug: "psychology-of-successful-trading-faith-and-discipline",
    excerpt: "Explore how combining trading psychology principles with faith-based wisdom can improve your performance.",
    category: "Trading Psychology",
    readTime: "8 min read",
    isPublished: true,
    aiGenerated: false,
    authorName: "VEDD Team",
    publishedAt: new Date("2024-04-08"),
    content: `<p>Trading success is as much about mindset as it is about strategy. The most sophisticated trading systems will fail in the hands of someone who lacks discipline, patience, and emotional control.</p>

<p>Many successful traders integrate spiritual principles into their trading approach. Proverbs like "The plans of the diligent lead to profit as surely as haste leads to poverty" (Proverbs 21:5) remind us of the importance of careful planning and patience.</p>

<p>Here are several psychological principles that align with spiritual wisdom:</p>
<ul>
  <li><strong>Patience</strong> - Waiting for high-probability setups rather than forcing trades</li>
  <li><strong>Discipline</strong> - Following your trading plan even when emotions try to take over</li>
  <li><strong>Humility</strong> - Accepting that the market is larger than any individual</li>
  <li><strong>Gratitude</strong> - Being thankful for both wins and the lessons that come from losses</li>
</ul>

<p>Our integrated approach combines cutting-edge technology with timeless wisdom, helping traders develop both the analytical skills and the psychological resilience needed for long-term success in the markets.</p>

<p><strong>At VEDD Trading AI</strong>, we believe financial freedom is a journey walked in faith. Our 44-day trading system is designed to build the discipline and consistency that leads to lasting results. <a href="/auth">Start your journey today.</a></p>`,
    tags: ["Psychology", "Faith", "Discipline", "Mindset"],
  },
  {
    title: "How to Leverage AI for Better Entry and Exit Points",
    slug: "leverage-ai-for-better-entry-exit-points",
    excerpt: "Discover how artificial intelligence can help you time your market entries and exits with greater precision.",
    category: "Technical Analysis",
    readTime: "5 min read",
    isPublished: true,
    aiGenerated: false,
    authorName: "VEDD Team",
    publishedAt: new Date("2024-04-05"),
    content: `<p>Timing is everything in trading. Enter too early, and you might watch your position go against you unnecessarily. Enter too late, and you've missed much of the move. The same applies to exits—taking profits too soon means leaving money on the table, while holding too long risks giving back gains.</p>

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

<p><strong>The VEDD SS AI signal engine</strong> is built exactly for this — precise, real-time signals with recommended entries, stops, and targets. <a href="/auth">Try it free today and see the difference AI makes.</a></p>`,
    tags: ["AI", "Entry Points", "Exit Points", "Technical Analysis"],
  },
];

export async function seedBlogPosts(): Promise<void> {
  try {
    // Check if blog_posts table already has data
    const result = await db.execute(sql`SELECT COUNT(*) as count FROM blog_posts`);
    const rows = result as unknown as Array<Record<string, unknown>>;
    const count = Number((rows[0] as any)?.count ?? 0);

    if (count > 0) {
      console.log(`[seed] blog_posts already has ${count} row(s), skipping seed.`);
      return;
    }

    for (const article of staticArticles) {
      await db.insert(blogPosts).values({
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt,
        content: article.content,
        category: article.category,
        tags: article.tags,
        authorName: article.authorName,
        isPublished: article.isPublished,
        aiGenerated: article.aiGenerated,
        readTime: article.readTime,
        publishedAt: article.publishedAt,
        viewCount: 0,
      } as any);
    }

    console.log(`[seed] Seeded ${staticArticles.length} blog posts.`);
  } catch (err: any) {
    console.error('[seed] seedBlogPosts error (non-fatal):', err?.message ?? err);
  }
}
