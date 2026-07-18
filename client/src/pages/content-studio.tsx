import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { Redirect, useSearch } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VeddReelPlayer } from '@/components/vedd-reel-player';
import { VeddReelWhatIsVedd } from '@/components/vedd-reel-whatisveddbuild';
import { VeddEduReel, EDU_REELS } from '@/components/vedd-edu-reels';
import { ReelRecorder } from '@/components/reel-recorder';
import { FullscreenLoading } from '@/components/ui/fullscreen-loading';
import {
  BookOpen, BarChart3, Heart, Megaphone, Star,
  Copy, Check, Share2, ChevronRight, ChevronDown, ChevronUp,
  Sparkles, RefreshCw, Loader2, Radio, ArrowRight,
  TrendingUp, Shield, Award, Users, Zap, ImageIcon,
  Instagram, Twitter, Mail, Film, Clapperboard, Wand2, Layers,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface BlogPost { id: number; slug: string; title: string; excerpt: string; category: string; tags: string[]; content: string; publishedAt?: string; }
interface ChartAnalysis { id: number; symbol: string; direction: string; confidence: string; entryPoint: string; stopLoss: string; takeProfit: string; riskRewardRatio: string; potentialPips: string; trend: string; timeframe: string; createdAt: string; imageUrl?: string; }
// devotionals table fields: `scripture` is the citation (e.g. "Proverbs 16:3"),
// `scriptureText` is the actual full verse, `tradingTieIn` is the trading
// application. GET /api/devotionals returns raw snake_case (server does a
// raw sql`SELECT *`) — normalized to camelCase where it's fetched below.
interface Devotional { id: number; title: string; scripture: string; scriptureText: string; reflection: string; tradingTieIn?: string; createdAt: string; }

type ContentType = 'lesson' | 'signal' | 'scripture' | 'update' | 'testimony';

interface Testimony { id: string; author: string; result: string; quote: string; period: string; }

// ── Static company updates ────────────────────────────────────────────────────
const COMPANY_UPDATES = [
  { id: 'upd1', date: 'April 2025', headline: 'VEDD AI Platform Now Live', body: 'Our full AI-powered trading intelligence platform is officially live — live signals, MT5 sync, weekly strategy builder, and the ABBA AI assistant are all running. Thousands of traders are already building consistent weekly profits.', tag: 'Launch' },
  { id: 'upd2', date: 'April 2025', headline: 'Ambassador Program Open', body: 'The VEDD Ambassador Program is officially open. Ambassadors earn commissions + VEDD tokens for every trader they refer. Top ambassadors are earning $1,000–$5,000/month sharing AI trading knowledge with their networks.', tag: 'Opportunity' },
  { id: 'upd3', date: 'April 2025', headline: 'VEDD Token (VEDD) Launching on Solana', body: 'The VEDD Token is launching on the Solana blockchain. Token holders gain access to premium signals, platform governance, and staking rewards. Early ambassadors receive bonus token allocations.', tag: 'Token' },
  { id: 'upd4', date: 'April 2025', headline: 'Community Goal: 10,000 Traders', body: 'VEDD is on a mission to help 10,000 traders build consistent income from the markets using AI. Every ambassador referral moves us closer to this milestone. Join the movement.', tag: 'Mission' },
  { id: 'upd5', date: 'April 2025', headline: 'Faith-Based Trading Community', body: 'VEDD combines financial intelligence with faith and purpose. Our devotional trading program connects scripture to market principles — helping traders grow spiritually and financially at the same time.', tag: 'Community' },
];

// ── Default testimonies ───────────────────────────────────────────────────────
const DEFAULT_TESTIMONIES: Testimony[] = [
  { id: 't1', author: 'Marcus T.', result: '+$1,240 in Week 1', quote: "VEDD's AI weekly plan told me exactly which pairs to focus on. I followed the strategy and hit my weekly goal in 3 trading days. This platform is the real deal.", period: '1 week' },
  { id: 't2', author: 'Priya K.', result: '87% Win Rate', quote: "The chart analysis feature breaks down every setup clearly — entry, stop, take profit, confidence score. My win rate jumped from 52% to 87% in 6 weeks using VEDD signals.", period: '6 weeks' },
  { id: 't3', author: 'Jordan M.', result: '$3,800 Commission', quote: "As a VEDD Ambassador I earned $3,800 in commissions last month just by sharing content. The referral system makes it easy — every post, every share builds passive income.", period: '1 month' },
  { id: 't4', author: 'Destiny W.', result: 'Left 9-to-5 in 90 Days', quote: "I came to VEDD with zero trading knowledge. The training, AI tools, and community showed me a path. 90 days later I resigned from my job. Faith + AI = financial freedom.", period: '90 days' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function stripHtml(html: string) { return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function truncate(text: string, max: number) { if (text.length <= max) return text; return text.slice(0, max).replace(/\s+\S*$/, '') + '…'; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
}

// ── Content type config ───────────────────────────────────────────────────────
const CONTENT_TYPES: { id: ContentType; label: string; emoji: string; color: string; bg: string; desc: string }[] = [
  { id: 'lesson',    label: 'Lesson',         emoji: '📚', color: '#60a5fa', bg: 'rgba(59,130,246,.12)',  desc: 'Share blog articles as branded trading lessons' },
  { id: 'signal',    label: 'Signal Proof',   emoji: '📊', color: '#34d399', bg: 'rgba(16,185,129,.12)',  desc: 'Share live chart analysis as proof of signals' },
  { id: 'scripture', label: 'Scripture',      emoji: '✝️',  color: '#c084fc', bg: 'rgba(168,85,247,.12)',  desc: 'Share devotional scripture tied to trading' },
  { id: 'update',    label: 'VEDD Update',    emoji: '📣', color: '#fb923c', bg: 'rgba(249,115,22,.12)',  desc: 'Share official VEDD company announcements' },
  { id: 'testimony', label: 'Testimony',      emoji: '🙌', color: '#fbbf24', bg: 'rgba(245,158,11,.12)',  desc: 'Share trader success stories and results' },
];

// ── Slide carousel topic presets — quick-fill starters for the four most
// common "how to get set up" explainer topics ambassadors ask for ──────────
const CAROUSEL_TOPIC_PRESETS = [
  { label: 'Account & Broker Setup', topic: 'How to sign up for VEDD, connect your MT5 or TradeLocker broker account, and sync your balance' },
  { label: 'AI Signal Engine Setup', topic: 'How to turn on the VEDD SS AI signal engine, confirm trades, and understand confidence scores and Deep Reasoning Mode' },
  { label: 'Ambassador Setup', topic: 'How to become a VEDD Ambassador, get your referral link, and start creating content in Content Studio' },
  { label: 'Platform Tour', topic: 'A general walkthrough of what VEDD Trading AI is and its main features' },
];

// ── Caption templates ─────────────────────────────────────────────────────────
function buildCaption(type: ContentType, item: any, referralCode: string | null, referralUrl?: string): string {
  const url = referralUrl ?? (referralCode
    ? `${window.location.origin}/auth?ref=${referralCode}`
    : window.location.origin);

  // Lesson posts deep-link to the actual article (not just the signup page)
  // so shares build the VEDD blog community — the referral code rides along
  // on the article URL too, so credit still lands once the reader signs up
  // from the article's own "Join VEDD" prompt.
  const articleUrl = item?.slug
    ? (referralCode ? `${window.location.origin}/blog/${item.slug}?ref=${referralCode}` : `${window.location.origin}/blog/${item.slug}`)
    : url;

  switch (type) {
    case 'lesson': return (
      `📚 VEDD AI Trading Lesson\n\n` +
      `"${item?.title || 'Master Your Trading Edge'}"\n\n` +
      `${truncate(stripHtml(item?.excerpt || ''), 200)}\n\n` +
      `🧠 Real knowledge. Real results. AI-powered.\n\n` +
      `👇 Read the full lesson & join VEDD free:\n${articleUrl}\n\n` +
      `#VEDD #TradingEducation #Forex #AITrading #Investing`
    );
    case 'signal': return (
      `📊 LIVE SIGNAL — VEDD AI Trading\n\n` +
      `Pair: ${item?.symbol || 'EURUSD'} | ${item?.direction || 'BUY'} | ${item?.timeframe || 'H4'}\n` +
      `Entry: ${item?.entryPoint || 'N/A'} | SL: ${item?.stopLoss || 'N/A'} | TP: ${item?.takeProfit || 'N/A'}\n` +
      `R:R ${item?.riskRewardRatio || '1:2'} | Confidence: ${item?.confidence || 'High'}\n\n` +
      `This is what AI-powered chart analysis looks like. No guessing — just data.\n\n` +
      `🔗 Get your own AI signals free:\n${url}\n\n` +
      `#VEDD #ForexSignals #AITrading #TradingProof #Forex`
    );
    case 'scripture': return (
      `✝️ Faith + Finance — VEDD Daily Word\n\n` +
      `"${truncate(item?.scriptureText || '', 160)}"\n— ${item?.scripture || ''}\n\n` +
      `${truncate(item?.tradingTieIn || item?.reflection || '', 200)}\n\n` +
      `Trade with purpose. Build with faith. 🙏\n\n` +
      `📖 Daily devotionals + trading inside VEDD:\n${url}\n\n` +
      `#VEDD #FaithAndFinance #Trading #Scripture #TradingMindset`
    );
    case 'update': return (
      `📣 ${item?.tag || 'BREAKING'}: ${item?.headline || 'VEDD Update'}\n\n` +
      `${truncate(item?.body || '', 240)}\n\n` +
      `🚀 Be part of the movement.\n\n` +
      `👇 Join VEDD now:\n${url}\n\n` +
      `#VEDD #AITrading #TradingCommunity #Forex #Fintech`
    );
    case 'testimony': return (
      `🙌 REAL RESULTS — VEDD AI Trading\n\n` +
      `"${item?.quote || ''}"\n— ${item?.author || 'VEDD Trader'}\n\n` +
      `Result: ${item?.result || ''} in ${item?.period || ''}\n\n` +
      `This could be YOUR story. Start free today.\n\n` +
      `👇 Join VEDD:\n${url}\n\n` +
      `#VEDD #TradingResults #ProofOfProfit #Forex #AITrading`
    );
    default: return '';
  }
}

// Builds a short subject line per content type for the AI image prompt —
// separate from buildCaption() since the image prompt wants a subject, not
// the full formatted caption text.
function buildImageSubject(type: ContentType, item: any): string {
  switch (type) {
    case 'lesson': return item?.title || 'trading education';
    case 'signal': return `${item?.symbol || 'forex'} ${item?.direction || ''} trade setup`;
    case 'scripture': return item?.scripture || item?.title || 'faith and trading';
    case 'update': return item?.headline || 'VEDD platform update';
    case 'testimony': return item?.result || 'trader success story';
    default: return 'trading';
  }
}

// CSS background-image URLs fail silently (no onError to hook into), so a
// broken/expired asset just renders as a blank gradient with no signal to
// the user. This preloads the URL via a real <img> load check and only
// hands back the URL once it's confirmed to actually load.
function useValidatedImage(url?: string | null): string | null {
  const [valid, setValid] = useState<string | null>(null);
  useEffect(() => {
    if (!url) { setValid(null); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setValid(url); };
    img.onerror = () => { if (!cancelled) setValid(null); };
    img.src = url;
    return () => { cancelled = true; };
  }, [url]);
  return valid;
}

// Shared card shell — lays the optional AI-generated background image behind
// the existing per-type gradient (dimmed to keep text readable on top of it)
// so cards keep their brand look whether or not an image was generated.
function CardShell({ gradient, color, bgImage, children }: {
  gradient: string; color: string; bgImage?: string | null; children: ReactNode;
}) {
  const validBgImage = useValidatedImage(bgImage);
  return (
    <div className="rounded-2xl w-full aspect-square relative overflow-hidden" style={{ border: `1px solid ${color}44` }}>
      {validBgImage && (
        <div className="absolute inset-0" style={{ backgroundImage: `url(${validBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      )}
      <div className="absolute inset-0" style={{ background: gradient, opacity: validBgImage ? 0.82 : 1 }} />
      <div className="relative z-10 p-4 w-full h-full flex flex-col">
        {children}
      </div>
    </div>
  );
}

// ── VEDD Branded Post Card ─────────────────────────────────────────────────────
function BrandedCard({ type, item, referralCode, bgImage }: {
  type: ContentType; item: any; referralCode: string | null; bgImage?: string | null;
}) {
  const signupUrl = referralCode ? `${window.location.host}/auth?ref=${referralCode}` : window.location.host;
  const cfg = CONTENT_TYPES.find(c => c.id === type)!;

  // Shared header
  const Header = () => (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#dc2626,#7c3aed)' }}>
          <span className="text-xs font-black text-white">V</span>
        </div>
        <div>
          <p className="text-[11px] font-black text-white tracking-widest uppercase">VEDD AI Trading</p>
          <p className="text-[9px] text-gray-500">veddbuild.com</p>
        </div>
      </div>
      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
        {cfg.emoji} {cfg.label.toUpperCase()}
      </span>
    </div>
  );

  // Shared footer
  const Footer = () => (
    <div className="mt-3 pt-2.5 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Join Free →</p>
      <p className="text-[11px] font-black" style={{ color: cfg.color }}>{signupUrl}</p>
    </div>
  );

  if (type === 'lesson') return (
    <CardShell gradient="linear-gradient(160deg,#0a0a14 0%,#0d0a1a 60%,#0a0f0a 100%)" color={cfg.color} bgImage={bgImage}>
      <Header />
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: cfg.color }}>📚 Trading Lesson</p>
        <h3 className="text-base font-black text-white leading-snug mb-2">{item?.title || 'Master Your Trading Edge'}</h3>
        <div className="h-px mb-2" style={{ background: `linear-gradient(90deg,${cfg.color},transparent)` }} />
        <p className="text-[11px] text-gray-300 leading-relaxed">{truncate(item?.excerpt || stripHtml(item?.content || ''), 180)}</p>
        {item?.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {item.tags.slice(0, 3).map((t: string) => (
              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: cfg.bg, color: cfg.color }}>#{t}</span>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </CardShell>
  );

  if (type === 'signal') return (
    <CardShell gradient="linear-gradient(160deg,#020f08 0%,#061a12 60%,#0a0a14 100%)" color={cfg.color} bgImage={bgImage}>
      <Header />
      {/* Live badge */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(16,185,129,.15)', border: '1px solid rgba(16,185,129,.4)' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-400">LIVE SIGNAL</span>
        </div>
        <span className="text-[10px] text-gray-500">{item?.createdAt ? fmtDate(item.createdAt) : 'Today'}</span>
      </div>
      {/* Signal details */}
      <div className="flex-1">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-2xl font-black text-white">{item?.symbol || 'EURUSD'}</p>
            <p className="text-[10px] text-gray-500">{item?.timeframe || 'H4'} Timeframe</p>
          </div>
          <div className="px-3 py-1.5 rounded-xl font-black text-sm" style={{
            background: (item?.direction || 'BUY') === 'BUY' || (item?.direction || '').toLowerCase().includes('bull') ? 'rgba(16,185,129,.2)' : 'rgba(220,38,38,.2)',
            color: (item?.direction || 'BUY') === 'BUY' || (item?.direction || '').toLowerCase().includes('bull') ? '#34d399' : '#f87171',
            border: `1px solid ${(item?.direction || 'BUY') === 'BUY' ? 'rgba(16,185,129,.4)' : 'rgba(220,38,38,.4)'}`,
          }}>
            {(item?.direction || 'BUY').toUpperCase()}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {[
            { label: 'Entry', val: item?.entryPoint || 'N/A' },
            { label: 'Stop Loss', val: item?.stopLoss || 'N/A' },
            { label: 'Take Profit', val: item?.takeProfit || 'N/A' },
          ].map(r => (
            <div key={r.label} className="rounded-lg p-2 text-center" style={{ background: 'rgba(0,0,0,.4)' }}>
              <p className="text-[9px] text-gray-500 mb-0.5">{r.label}</p>
              <p className="text-[11px] font-black text-white">{r.val}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-500">R:R <span className="text-white font-bold">{item?.riskRewardRatio || '1:2'}</span></span>
          <span style={{ color: cfg.color }}>Confidence: <span className="font-bold">{item?.confidence || 'High'}</span></span>
          <span className="text-gray-500">{item?.potentialPips || '—'} pips</span>
        </div>
      </div>
      <Footer />
    </CardShell>
  );

  if (type === 'scripture') return (
    <CardShell gradient="linear-gradient(160deg,#0d0a1a 0%,#120a14 60%,#0a0a14 100%)" color={cfg.color} bgImage={bgImage}>
      <Header />
      <div className="flex-1 flex flex-col justify-center">
        <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.25)' }}>
          <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: cfg.color }}>✝️ Daily Scripture</p>
          <p className="text-xs text-white italic leading-relaxed">"{truncate(item?.scriptureText || 'Trust in the LORD with all your heart and lean not on your own understanding.', 180)}"</p>
          <p className="text-[10px] font-bold mt-1.5" style={{ color: cfg.color }}>— {item?.scripture || 'Proverbs 3:5'}</p>
        </div>
        <div className="h-px mb-2" style={{ background: `linear-gradient(90deg,${cfg.color},transparent)` }} />
        <p className="text-[11px] text-gray-300 leading-relaxed">{truncate(item?.tradingTieIn || item?.reflection || 'Apply wisdom and patience to every trade. Faith and discipline build lasting wealth.', 160)}</p>
      </div>
      <Footer />
    </CardShell>
  );

  if (type === 'update') return (
    <CardShell gradient="linear-gradient(160deg,#0f0a05 0%,#1a0f05 60%,#0a0a14 100%)" color={cfg.color} bgImage={bgImage}>
      <Header />
      {/* Breaking bar */}
      <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.3)' }}>
        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
        <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">{item?.tag || 'Update'}</span>
        <span className="text-[9px] text-gray-500 ml-auto">{item?.date || 'April 2025'}</span>
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <h3 className="text-base font-black text-white leading-snug mb-2">{item?.headline || 'VEDD News'}</h3>
        <div className="h-px mb-2" style={{ background: `linear-gradient(90deg,${cfg.color},transparent)` }} />
        <p className="text-[11px] text-gray-300 leading-relaxed">{truncate(item?.body || '', 200)}</p>
      </div>
      <Footer />
    </CardShell>
  );

  if (type === 'testimony') return (
    <CardShell gradient="linear-gradient(160deg,#0f0f05 0%,#1a140a 60%,#0a0a14 100%)" color={cfg.color} bgImage={bgImage}>
      <Header />
      {/* Result badge */}
      <div className="flex items-center justify-center mb-3">
        <div className="px-4 py-2 rounded-xl" style={{ background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.35)' }}>
          <p className="text-[10px] text-gray-400 text-center">Verified Result</p>
          <p className="text-lg font-black text-center" style={{ color: cfg.color }}>{item?.result || '+$1,200 Week 1'}</p>
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <div className="rounded-xl p-3 mb-2" style={{ background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.06)' }}>
          <p className="text-xs text-gray-200 italic leading-relaxed">"{truncate(item?.quote || '', 180)}"</p>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-bold text-white">— {item?.author || 'VEDD Trader'}</span>
          <span style={{ color: cfg.color }}>in {item?.period || '30 days'}</span>
        </div>
      </div>
      <Footer />
    </CardShell>
  );

  return null;
}

// ── Content Browser ───────────────────────────────────────────────────────────
function ContentBrowser({ type, selected, onSelect }: {
  type: ContentType; selected: any; onSelect: (item: any) => void;
}) {
  const { data: blogPosts = [] } = useQuery<BlogPost[]>({
    queryKey: ['/api/blog'],
    queryFn: async () => { const r = await apiRequest('GET', '/api/blog'); return r.json(); },
    enabled: type === 'lesson',
  });

  const { data: analyses = [] } = useQuery<ChartAnalysis[]>({
    queryKey: ['/api/analyses/recent'],
    queryFn: async () => { const r = await apiRequest('GET', '/api/analyses/recent'); return r.json(); },
    enabled: type === 'signal',
  });

  const { data: devotionals = [] } = useQuery<Devotional[]>({
    queryKey: ['/api/devotionals'],
    queryFn: async () => {
      const r = await apiRequest('GET', '/api/devotionals');
      const raw: any[] = await r.json();
      // Server returns raw snake_case (raw SQL SELECT *) — normalize once here.
      return raw.map(d => ({
        id: d.id, title: d.title, scripture: d.scripture,
        scriptureText: d.scripture_text, reflection: d.reflection,
        tradingTieIn: d.trading_tie_in, createdAt: d.created_at,
      }));
    },
    enabled: type === 'scripture',
  });

  const [testimonies, setTestimonies] = useState<Testimony[]>(DEFAULT_TESTIMONIES);
  const [newTestimony, setNewTestimony] = useState({ author: '', result: '', quote: '', period: '' });
  const [addingTestimony, setAddingTestimony] = useState(false);

  const cfg = CONTENT_TYPES.find(c => c.id === type)!;

  const addTestimony = () => {
    if (!newTestimony.quote || !newTestimony.author) return;
    const t: Testimony = { ...newTestimony, id: Date.now().toString() };
    setTestimonies(prev => [t, ...prev]);
    setNewTestimony({ author: '', result: '', quote: '', period: '' });
    setAddingTestimony(false);
    onSelect(t);
  };

  const ItemRow = ({ item, label, sub }: { item: any; label: string; sub?: string }) => (
    <button
      onClick={() => onSelect(item)}
      className="w-full text-left p-3 rounded-xl transition-all flex items-start gap-3"
      style={{
        background: selected?.id === item?.id ? cfg.bg : 'rgba(255,255,255,.03)',
        border: `1px solid ${selected?.id === item?.id ? cfg.color + '55' : 'rgba(255,255,255,.06)'}`,
      }}
    >
      <div className="flex-shrink-0 w-1.5 h-full min-h-[2rem] rounded-full mt-1" style={{ background: selected?.id === item?.id ? cfg.color : 'rgba(255,255,255,.1)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white leading-snug line-clamp-2">{label}</p>
        {sub && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{sub}</p>}
      </div>
      {selected?.id === item?.id && <Check className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: cfg.color }} />}
    </button>
  );

  if (type === 'lesson') return (
    <div className="space-y-2">
      {blogPosts.length === 0
        ? <p className="text-xs text-gray-500 text-center py-6">No blog posts found.</p>
        : blogPosts.map(p => <ItemRow key={p.id} item={p} label={p.title} sub={`${p.category} · ${fmtDate(p.publishedAt || '')}`} />)
      }
    </div>
  );

  if (type === 'signal') return (
    <div className="space-y-2">
      {(analyses as any[]).length === 0
        ? <p className="text-xs text-gray-500 text-center py-6">No recent analyses found. Run a chart analysis first.</p>
        : (analyses as ChartAnalysis[]).map(a => (
          <ItemRow key={a.id} item={a}
            label={`${a.symbol} — ${a.direction?.toUpperCase()}`}
            sub={`${a.timeframe} · R:R ${a.riskRewardRatio} · ${a.confidence} confidence · ${fmtDate(a.createdAt)}`}
          />
        ))
      }
    </div>
  );

  if (type === 'scripture') return (
    <div className="space-y-2">
      {(devotionals as any[]).length === 0
        ? <p className="text-xs text-gray-500 text-center py-6">No devotionals found.</p>
        : (devotionals as Devotional[]).map(d => (
          <ItemRow key={d.id} item={d}
            label={d.title}
            sub={`${d.scripture} · ${fmtDate(d.createdAt)}`}
          />
        ))
      }
    </div>
  );

  if (type === 'update') return (
    <div className="space-y-2">
      {COMPANY_UPDATES.map(u => <ItemRow key={u.id} item={u} label={u.headline} sub={`${u.tag} · ${u.date}`} />)}
    </div>
  );

  if (type === 'testimony') return (
    <div className="space-y-2">
      {/* Add testimony form */}
      {addingTestimony ? (
        <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.25)' }}>
          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Add New Testimony</p>
          {[
            { key: 'author', placeholder: "Trader name (e.g. 'Marcus T.')" },
            { key: 'result', placeholder: "Result (e.g. '+$1,200 in Week 1')" },
            { key: 'period', placeholder: "Time period (e.g. '30 days')" },
          ].map(f => (
            <input key={f.key} placeholder={f.placeholder}
              value={(newTestimony as any)[f.key]}
              onChange={e => setNewTestimony(prev => ({ ...prev, [f.key]: e.target.value }))}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-gray-600 outline-none focus:border-amber-500/40"
            />
          ))}
          <textarea placeholder="Their quote / testimonial..."
            value={newTestimony.quote}
            onChange={e => setNewTestimony(prev => ({ ...prev, quote: e.target.value }))}
            rows={3}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-gray-600 outline-none focus:border-amber-500/40 resize-none"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={addTestimony} className="flex-1 text-xs h-7 bg-amber-600 hover:bg-amber-500 text-white">Save</Button>
            <Button size="sm" onClick={() => setAddingTestimony(false)} variant="outline" className="text-xs h-7 border-gray-700 text-gray-400">Cancel</Button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAddingTestimony(true)}
          className="w-full text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all"
          style={{ background: 'rgba(245,158,11,.06)', border: '1px dashed rgba(245,158,11,.3)' }}>
          <span>+</span> Add a new testimony
        </button>
      )}
      {testimonies.map(t => <ItemRow key={t.id} item={t} label={`${t.author} — ${t.result}`} sub={`"${truncate(t.quote, 60)}"`} />)}
    </div>
  );

  return null;
}

// ── Share Buttons — per-platform formatted, one tap straight to each platform ──
// Each platform gets a caption formatted for ITS style (length, hashtags, tone).
// mode 'reel' adds reel-specific hooks/hashtags. The "Share to App" button uses
// the native OS share sheet — no screen recording needed, pick any installed app.
const HASHTAGS = '#trading #forex #AItrading #passiveincome #daytrader #veddbuild';
function formatForPlatform(platform: string, caption: string, url: string, mode: 'post' | 'reel'): string {
  const base = caption.trim();
  const reelTag = mode === 'reel' ? '\n\n🎬 Full breakdown in the reel — sound ON.' : '';
  switch (platform) {
    case 'tw': { // X: hard 280-char budget incl. link (~24 chars)
      const budget = 280 - 26 - 20;
      const short = base.length > budget ? base.slice(0, budget - 1).replace(/\s+\S*$/, '') + '…' : base;
      return `${short}\n${'#AItrading #forex'}`;
    }
    case 'ig': // Instagram: hook, spacing, heavy hashtags, link in bio note
      return `${base}${reelTag}\n\n🔗 Link in bio or → ${url}\n.\n.\n.\n${HASHTAGS} #reels #fyp`;
    case 'tt': // TikTok: punchy + fyp hashtags
      return `${base}${reelTag}\n\n${HASHTAGS} #fyp #foryou #moneytok`;
    case 'yt': // YouTube Shorts: title line + description
      return `${base.split('\n')[0].slice(0, 90)}\n\n${base}${reelTag}\n\n▶ Start free: ${url}\n${HASHTAGS} #shorts`;
    case 'li': // LinkedIn: professional, minimal hashtags
      return `${base}\n\nI've been using VEDD's AI trading platform — worth a look if you're serious about systematic trading: ${url}\n\n#trading #fintech #AI`;
    case 'fb':
      return `${base}${reelTag}\n\n👉 ${url}`;
    case 'wa': case 'tg':
      return `${base}\n\n${url}`;
    default:
      return `${base}\n\n${url}`;
  }
}

// Fetches a same-origin image URL (e.g. a flattened slide from
// /api/content-studio/asset/:id) as a Blob and wraps it as a File — the
// shape navigator.share({files}) needs to hand the actual image straight to
// whichever app the user picks in the native share sheet, no download step.
async function urlToShareFile(imageUrl: string, filename: string): Promise<File | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || 'image/png' });
  } catch {
    return null;
  }
}

// One carousel slide, with its own "flatten" (bake heading/body text onto
// the image server-side, same service as the single-slide flow) + native
// share — today the carousel only overlays text via CSS in this preview, so
// "Download" grabbed just the plain background with no words on it, forcing
// a screenshot. Flattening first means the shared/downloaded file actually
// has the text baked in, and native share sends that finished image straight
// to whichever app the user picks.
function CarouselSlideCard({ slide, index, total, includeLogo, referralCode, referralUrl }: {
  slide: { heading: string; body: string; imageUrl: string | null };
  index: number; total: number; includeLogo: boolean;
  referralCode: string | null; referralUrl?: string;
}) {
  const [flattening, setFlattening] = useState(false);
  const [flattenedUrl, setFlattenedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flatten = async () => {
    if (!slide.imageUrl || flattening) return;
    setFlattening(true);
    setError(null);
    try {
      const res = await apiRequest('POST', '/api/content-studio/flatten-slide', {
        imageUrl: slide.imageUrl,
        heading: slide.heading,
        body: slide.body,
        includeLogo,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Flattening failed');
      setFlattenedUrl(data.flattenedUrl);
    } catch (err: any) {
      setError(err.message || 'Flattening failed');
    } finally {
      setFlattening(false);
    }
  };

  const share = async () => {
    if (!flattenedUrl) return;
    const file = await urlToShareFile(flattenedUrl, `vedd-slide-${index + 1}-${Date.now()}.png`);
    const url = referralUrl ?? (referralCode ? `${window.location.origin}/auth?ref=${referralCode}` : window.location.origin);
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: 'VEDDBuild', text: `${slide.heading}\n\n${url}`, files: [file] });
        return;
      } catch { /* user cancelled — fall through to opening the image */ }
    }
    window.open(flattenedUrl, '_blank');
  };

  return (
    <div className="flex-shrink-0" style={{ width: 240 }}>
      <div className="rounded-2xl w-full aspect-square relative overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.12)', background: '#050507' }}>
        {slide.imageUrl && (
          <div className="absolute inset-0" style={{ backgroundImage: `url(${flattenedUrl || slide.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: flattenedUrl ? 1 : 0.28 }} />
        )}
        {!flattenedUrl && (
          <>
            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,.75) 100%)' }} />
            <div className="relative z-10 p-4 w-full h-full flex flex-col">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#dc2626,#7c3aed)' }}>
                    <span className="text-[9px] font-black text-white">V</span>
                  </div>
                  <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">VEDD</span>
                </div>
                <span className="text-[9px] font-bold text-gray-500">{index + 1}/{total}</span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center text-center px-1">
                <h4 className="text-lg font-black text-white leading-tight uppercase tracking-tight" style={{ textShadow: '0 2px 12px rgba(0,0,0,.9)' }}>{slide.heading}</h4>
                <div className="w-8 h-0.5 my-2.5" style={{ background: 'linear-gradient(90deg,#dc2626,#7c3aed)' }} />
                <p className="text-[11px] text-gray-300 leading-relaxed" style={{ textShadow: '0 1px 8px rgba(0,0,0,.9)' }}>{slide.body}</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400">@veddbuild</span>
                {index < total - 1 && <span className="text-[10px] text-gray-500">swipe →</span>}
              </div>
            </div>
          </>
        )}
      </div>
      {slide.imageUrl ? (
        <div className="mt-1.5 space-y-1">
          {!flattenedUrl ? (
            <button onClick={flatten} disabled={flattening}
              className="w-full text-center text-[10px] font-bold px-2 py-1.5 rounded-lg"
              style={{ background: 'rgba(56,189,248,.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,.25)' }}>
              {flattening ? 'Baking text onto image…' : '✍️ Bake Words Onto Image'}
            </button>
          ) : (
            <>
              <button onClick={share}
                className="w-full text-center text-[10px] font-bold px-2 py-1.5 rounded-lg"
                style={{ background: 'linear-gradient(135deg,#ef4444,#a855f7)', color: '#fff' }}>
                📲 Share Slide {index + 1}
              </button>
              <a href={flattenedUrl} download target="_blank" rel="noreferrer"
                className="block text-center text-[10px] font-bold px-2 py-1.5 rounded-lg"
                style={{ background: 'rgba(56,189,248,.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,.25)' }}>
                ⬇ Download Slide {index + 1}
              </a>
            </>
          )}
          {error && <p className="text-[9px] text-red-400 text-center">{error}</p>}
        </div>
      ) : (
        <p className="text-center text-[10px] text-gray-500 mt-1.5">Background image unavailable — text still generated</p>
      )}
    </div>
  );
}

function ShareButtons({ caption, referralCode, referralUrl, mode = 'post', imageUrl }: { caption: string; referralCode: string | null; referralUrl?: string; mode?: 'post' | 'reel'; imageUrl?: string | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  const url = referralUrl ?? (referralCode ? `${window.location.origin}/auth?ref=${referralCode}` : window.location.origin);

  const doCopy = async (text: string, key: string) => {
    await copyText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2200);
  };

  // Direct share targets — caption is FORMATTED for each platform before opening
  const platforms = [
    { key: 'tw', label: 'X / Twitter', color: '#111827', compose: (t: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(url)}` },
    { key: 'wa', label: 'WhatsApp',   color: '#16a34a', compose: (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}` },
    { key: 'tg', label: 'Telegram',   color: '#0284c7', compose: (t: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(t)}` },
    { key: 'fb', label: 'Facebook',   color: '#1d4ed8', compose: (t: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(t)}` },
    { key: 'li', label: 'LinkedIn',   color: '#0369a1', compose: (t: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&summary=${encodeURIComponent(t)}` },
    { key: 'yt', label: 'YT Shorts',  color: '#dc2626', compose: () => 'https://studio.youtube.com/channel/upload' },
    { key: 'ig', label: 'Instagram',  color: '#a855f7', compose: () => 'https://www.instagram.com/' },
    { key: 'tt', label: 'TikTok',     color: '#0f766e', compose: () => 'https://www.tiktok.com/upload' },
  ];

  const sharePlatform = async (p: typeof platforms[number]) => {
    const formatted = formatForPlatform(p.key, caption, url, mode);
    // Copy the platform-formatted caption first so paste-to-post works everywhere
    await copyText(formatted);
    setCopied(p.key);
    setTimeout(() => setCopied(null), 2200);
    window.open(p.compose(formatted), '_blank');
  };

  // Native OS share sheet — the real "straight to the platform" on mobile.
  // When a generated image is available, attach it as an actual file so the
  // user can pick a social app and post the finished image immediately —
  // no download-then-re-upload round trip.
  const nativeShare = async () => {
    const formatted = formatForPlatform('ig', caption, url, mode);
    if (imageUrl) {
      const file = await urlToShareFile(imageUrl, `vedd-${Date.now()}.png`);
      if (file && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: 'VEDDBuild', text: formatted, files: [file] });
          return;
        } catch { /* user cancelled — fall through to text-only/copy below */ }
      }
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: 'VEDDBuild', text: formatted, url });
        return;
      }
    } catch { /* user cancelled or unsupported */ }
    await doCopy(formatted, 'native');
  };

  return (
    <div className="space-y-3">
      {/* Native share — opens the phone's share sheet (TikTok, IG, anything installed) */}
      <button
        onClick={nativeShare}
        className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-xs font-black transition-all"
        style={{ background: 'linear-gradient(135deg,#ef4444,#a855f7)', color: '#fff' }}
      >
        <Share2 className="h-4 w-4" />
        {copied === 'native' ? 'Copied! (share sheet unavailable)' : imageUrl ? '📲 Share Image + Caption to App' : '📲 Share Straight to App'}
      </button>

      {/* Copy caption */}
      <button
        onClick={() => doCopy(caption, 'caption')}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all"
        style={{ background: copied === 'caption' ? 'rgba(16,185,129,.15)' : 'rgba(255,255,255,.05)', border: `1px solid ${copied === 'caption' ? 'rgba(16,185,129,.4)' : 'rgba(255,255,255,.1)'}`, color: copied === 'caption' ? '#34d399' : '#e5e7eb' }}
      >
        {copied === 'caption' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied === 'caption' ? 'Caption Copied!' : 'Copy Full Caption'}
      </button>

      {/* Per-platform share — formats the caption for that platform, copies it, opens compose */}
      <p className="text-[9px] text-gray-500 -mb-1">Tap a platform — caption auto-formats for it, copies, and the compose page opens:</p>
      <div className="grid grid-cols-2 gap-2">
        {platforms.map(p => (
          <button key={p.key} onClick={() => sharePlatform(p)}
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-bold text-white transition-opacity hover:opacity-80"
            style={{ background: `${p.color}cc` }}>
            {copied === p.key ? <Check className="h-3 w-3" /> : <Share2 className="h-3 w-3" />}
            {copied === p.key ? 'Copied!' : p.label}
          </button>
        ))}
      </div>

      {/* Copy link alone */}
      <button
        onClick={() => doCopy(url, 'link')}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] transition-all"
        style={{ background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.06)', color: '#6b7280' }}
      >
        {copied === 'link' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        <span className={copied === 'link' ? 'text-emerald-400' : ''}>
          {copied === 'link' ? 'Link copied!' : `Copy ref link: ${url.replace('https://', '')}`}
        </span>
      </button>
    </div>
  );
}

// ── Saved Content Library — everything generated in Content Studio, kept ──────
// permanently (survives past the first day, unlike raw provider URLs) and
// browsable/filterable here so nothing gets lost after the session it was
// created in.
interface SavedGeneration {
  id: number;
  contentType: 'image' | 'video' | 'reel' | 'carousel';
  prompt: string | null;
  title: string | null;
  caption: string | null;
  assetUrl: string | null;
  flattenedAssetUrl: string | null;
  metadata: any;
  createdAt: string;
}

const SAVED_TYPE_FILTERS: { id: SavedGeneration['contentType'] | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'reel', label: 'Reels' },
  { id: 'carousel', label: 'Carousels' },
];

function SavedContentCard({ item, onDelete }: { item: SavedGeneration; onDelete: (id: number) => void }) {
  const [copied, setCopied] = useState(false);
  const previewUrl = item.flattenedAssetUrl || item.assetUrl || (item.metadata?.slides?.[0]?.imageUrl ?? null);
  const copyCaption = () => {
    if (!item.caption) return;
    navigator.clipboard.writeText(item.caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-white/[0.03] flex flex-col">
      {previewUrl && (
        item.contentType === 'video' || item.contentType === 'reel' ? (
          <video src={previewUrl} controls loop className="w-full bg-black" style={{ aspectRatio: '9/16', maxHeight: 260 }} />
        ) : (
          <img src={previewUrl} alt="" loading="lazy" className="w-full object-cover" style={{ aspectRatio: '1/1', maxHeight: 260 }} />
        )
      )}
      <div className="p-3 flex-1 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 text-gray-300">{item.contentType}</span>
          <span className="text-[10px] text-gray-500">{fmtDate(item.createdAt)}</span>
        </div>
        {item.title && <p className="text-sm font-bold text-white leading-snug">{item.title}</p>}
        {item.caption && <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">{item.caption}</p>}
        {item.contentType === 'carousel' && Array.isArray(item.metadata?.slides) && (
          <p className="text-[10px] text-gray-500">{item.metadata.slides.length} slides</p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-1">
          {previewUrl && (
            <a href={previewUrl} download target="_blank" rel="noreferrer" className="text-[11px] font-bold text-blue-400 hover:text-blue-300">Download</a>
          )}
          {item.caption && (
            <button onClick={copyCaption} className="text-[11px] font-bold text-gray-400 hover:text-white">
              {copied ? 'Copied!' : 'Copy caption'}
            </button>
          )}
          <button onClick={() => onDelete(item.id)} className="text-[11px] font-bold text-red-400/80 hover:text-red-400 ml-auto">Delete</button>
        </div>
      </div>
    </div>
  );
}

function SavedContentLibrary() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<SavedGeneration['contentType'] | 'all'>('all');

  const { data, isLoading } = useQuery<{ generations: SavedGeneration[] }>({
    queryKey: ['/api/content-studio/history', filter],
    queryFn: async () => {
      const qs = filter !== 'all' ? `?type=${filter}` : '';
      const res = await apiRequest('GET', `/api/content-studio/history${qs}`);
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest('DELETE', `/api/content-studio/history/${id}`)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/content-studio/history'] }),
  });

  const items = data?.generations ?? [];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-hide">
        {SAVED_TYPE_FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
            style={{
              background: filter === f.id ? 'rgba(251,146,60,.15)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${filter === f.id ? 'rgba(251,146,60,.4)' : 'rgba(255,255,255,.08)'}`,
              color: filter === f.id ? '#fb923c' : '#9ca3af',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 text-center py-12">Loading your saved content...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-gray-500">Nothing saved yet — everything you generate in Content Studio (images, videos, reels, carousels) automatically lands here, permanently.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {items.map(item => (
            <SavedContentCard key={item.id} item={item} onDelete={(id) => deleteMutation.mutate(id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Generation progress pipelines — same FullscreenLoading popup (with the
// scripture/wisdom panel) chart-analysis uses, reused here per the user's
// request that every generation action show consistent step-by-step status.
const IMAGE_PIPELINE = [
  { name: 'Reading your content', icon: <Sparkles className="h-5 w-5" /> },
  { name: 'Writing an on-brand prompt', icon: <Wand2 className="h-5 w-5" /> },
  { name: 'Generating the image', icon: <ImageIcon className="h-5 w-5" /> },
  { name: 'Saving permanently', icon: <Layers className="h-5 w-5" /> },
];
const VIDEO_PIPELINE = [
  { name: 'Styling your prompt on-brand', icon: <Wand2 className="h-5 w-5" /> },
  { name: 'Generating the video clip', icon: <Film className="h-5 w-5" /> },
  { name: 'Saving permanently', icon: <Layers className="h-5 w-5" /> },
];
const REEL_PIPELINE = [
  { name: 'Writing the hook & script', icon: <BookOpen className="h-5 w-5" /> },
  { name: 'Generating the video clip', icon: <Clapperboard className="h-5 w-5" /> },
  { name: 'Saving permanently', icon: <Layers className="h-5 w-5" /> },
];
const CAROUSEL_PIPELINE = [
  { name: 'Writing the slide script', icon: <BookOpen className="h-5 w-5" /> },
  { name: 'Generating slide images', icon: <ImageIcon className="h-5 w-5" /> },
  { name: 'Saving permanently', icon: <Layers className="h-5 w-5" /> },
];

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ContentStudioPage() {
  const { user } = useAuth();
  const isAmbassador = !!(user as any)?.isAmbassador;
  const isAdmin = !!(user as any)?.isAdmin;
  const { data: referralData } = useQuery<{ code: string; url: string; shortUrl: string }>({
    queryKey: ['/api/referral/my-link'],
    enabled: !!user,
  });
  const referralCode: string | null = referralData?.code ?? null;

  const search = useSearch();
  const [view, setView] = useState<'studio' | 'reels' | 'ai-video' | 'ai-reel' | 'slide-carousel' | 'saved'>(() => {
    const v = new URLSearchParams(search).get('view');
    return v === 'ai-video' || v === 'ai-reel' || v === 'slide-carousel' || v === 'saved' ? v : 'studio';
  });
  // Deep-link support: re-check the query string on every navigation (not
  // just first mount) so tapping a nav tile while already on this page
  // still switches views — wouter doesn't remount on a same-route
  // query-only navigation.
  useEffect(() => {
    const v = new URLSearchParams(search).get('view');
    if (v === 'ai-video' || v === 'ai-reel' || v === 'slide-carousel' || v === 'saved') setView(v);
  }, [search]);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState(5);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

  const generateVideo = async () => {
    if (!videoPrompt.trim() || generatingVideo) return;
    setGeneratingVideo(true);
    setVideoError(null);
    setGeneratedVideoUrl(null);
    try {
      const res = await apiRequest('POST', '/api/content-studio/generate-video', {
        prompt: videoPrompt.trim(),
        duration: videoDuration,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Video generation failed');
      setGenProgress(100);
      setTimeout(() => setGeneratingVideo(false), 400);
      setGeneratedVideoUrl(data.url);
    } catch (err: any) {
      setVideoError(err.message || 'Video generation failed');
      setGeneratingVideo(false);
    }
  };

  const [reelTopic, setReelTopic] = useState('');
  const [reelDuration, setReelDuration] = useState(5);
  const [generatingReel, setGeneratingReel] = useState(false);
  const [reelError, setReelError] = useState<string | null>(null);
  const [generatedReel, setGeneratedReel] = useState<{ hook: string; script: string[]; caption: string; url: string } | null>(null);

  const generateReel = async () => {
    if (!reelTopic.trim() || generatingReel) return;
    setGeneratingReel(true);
    setReelError(null);
    setGeneratedReel(null);
    try {
      const res = await apiRequest('POST', '/api/content-studio/generate-reel', {
        topic: reelTopic.trim(),
        duration: reelDuration,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Reel generation failed');
      setGenProgress(100);
      setTimeout(() => setGeneratingReel(false), 400);
      setGeneratedReel(data);
    } catch (err: any) {
      setReelError(err.message || 'Reel generation failed');
      setGeneratingReel(false);
    }
  };

  const [carouselTopic, setCarouselTopic] = useState('');
  const [carouselSlideCount, setCarouselSlideCount] = useState(6);
  const [generatingCarousel, setGeneratingCarousel] = useState(false);
  const [carouselError, setCarouselError] = useState<string | null>(null);
  const [generatedCarousel, setGeneratedCarousel] = useState<{ title: string; caption: string; slides: { heading: string; body: string; imageUrl: string | null }[] } | null>(null);

  const generateCarousel = async () => {
    if (!carouselTopic.trim() || generatingCarousel) return;
    setGeneratingCarousel(true);
    setCarouselError(null);
    setGeneratedCarousel(null);
    try {
      const res = await apiRequest('POST', '/api/content-studio/generate-carousel', {
        topic: carouselTopic.trim(),
        slideCount: carouselSlideCount,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Carousel generation failed');
      setGenProgress(100);
      setTimeout(() => setGeneratingCarousel(false), 400);
      setGeneratedCarousel(data);
    } catch (err: any) {
      setCarouselError(err.message || 'Carousel generation failed');
      setGeneratingCarousel(false);
    }
  };

  const [reelId, setReelId] = useState<string>('correction');
  const [activeType, setActiveType] = useState<ContentType>('lesson');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [caption, setCaption] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [includeLogo, setIncludeLogo] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // ── Shared generation-progress popup (chart-analysis style, with the
  // scripture/wisdom panel) — one shared progress driver for all 4 actions,
  // since only one can realistically run at a time.
  const [genProgress, setGenProgress] = useState(0);
  const showGenLoading = generatingVideo || generatingReel || generatingCarousel || generatingImage;
  const genPipeline = generatingVideo ? VIDEO_PIPELINE : generatingReel ? REEL_PIPELINE : generatingCarousel ? CAROUSEL_PIPELINE : IMAGE_PIPELINE;
  const genTitle = generatingVideo ? 'Generating AI Video' : generatingReel ? 'Generating AI Reel' : generatingCarousel ? 'Generating Slide Carousel' : 'Generating Image';

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (showGenLoading) {
      if (genProgress === 0) setGenProgress(5);
      interval = setInterval(() => {
        setGenProgress(prev => (prev >= 95 ? prev : Math.min(prev + (Math.random() * 8 + 2), 95)));
      }, 800);
    } else {
      setGenProgress(0);
    }
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGenLoading]);

  if (!isAmbassador && !isAdmin) return <Redirect to="/dashboard" />;

  const cfg = CONTENT_TYPES.find(c => c.id === activeType)!;

  // Rebuild caption when content or type changes
  useEffect(() => {
    if (selectedItem) setCaption(buildCaption(activeType, selectedItem, referralCode, referralData?.url));
  }, [selectedItem, activeType, referralCode, referralData?.url]);

  // A new selection invalidates any previously-generated background
  useEffect(() => {
    setBgImage(null);
    setImageError(null);
  }, [selectedItem, activeType]);

  const handleTypeSwitch = (type: ContentType) => {
    setActiveType(type);
    setSelectedItem(null);
    setCaption('');
  };

  const generateBackground = async () => {
    if (!selectedItem || generatingImage) return;
    setGeneratingImage(true);
    setImageError(null);
    try {
      const res = await apiRequest('POST', '/api/content-studio/generate-image', {
        contentType: activeType,
        subject: buildImageSubject(activeType, selectedItem),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Image generation failed');
      setGenProgress(100);
      setTimeout(() => setGeneratingImage(false), 400);
      setBgImage(data.url);
    } catch (err: any) {
      setImageError(err.message || 'Image generation failed');
      setGeneratingImage(false);
    }
  };

  const [flattening, setFlattening] = useState(false);
  const [flattenedSlideUrl, setFlattenedSlideUrl] = useState<string | null>(null);
  const flattenAndSaveSlide = async () => {
    if (!bgImage || flattening) return;
    setFlattening(true);
    try {
      const res = await apiRequest('POST', '/api/content-studio/flatten-slide', {
        imageUrl: bgImage,
        heading: cfg.label,
        body: caption.slice(0, 220),
        includeLogo,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Flattening failed');
      setFlattenedSlideUrl(data.flattenedUrl);
    } catch (err: any) {
      setImageError(err.message || 'Flattening failed');
    } finally {
      setFlattening(false);
    }
  };

  return (
    <div className="min-h-screen pb-16" style={{ background: 'linear-gradient(180deg,#060610 0%,#080812 100%)' }}>
      <FullscreenLoading visible={showGenLoading} progress={genProgress} title={genTitle} subtitle="This can take a moment — hang tight." customPipeline={genPipeline} />
      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6">

        {/* ── Header ── */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Radio className="h-4 w-4 text-red-400 animate-pulse" />
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Ambassador Content Studio</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white">
            Create{' '}
            <span style={{ background: 'linear-gradient(90deg,#ef4444,#a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Branded Content
            </span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Turn VEDD insights into scroll-stopping social posts — with your referral link built in.</p>
          {referralCode && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-800/30 px-3 py-1 rounded-full">
              <Award className="h-3 w-3" />
              Ref code <span className="font-mono font-bold">{referralCode}</span> embedded in every share
            </div>
          )}
        </div>

        {/* ── View Tabs ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-hide">
          <button onClick={() => setView('studio')}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={{
              background: view === 'studio' ? 'rgba(59,130,246,.12)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${view === 'studio' ? 'rgba(59,130,246,.4)' : 'rgba(255,255,255,.08)'}`,
              color: view === 'studio' ? '#60a5fa' : '#9ca3af',
            }}
          >
            📋 Content Studio
          </button>
          <button onClick={() => setView('reels')}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={{
              background: view === 'reels' ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${view === 'reels' ? 'rgba(239,68,68,.4)' : 'rgba(255,255,255,.08)'}`,
              color: view === 'reels' ? '#f87171' : '#9ca3af',
            }}
          >
            🎬 Reel Preview
          </button>
          <button onClick={() => setView('ai-video')}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={{
              background: view === 'ai-video' ? 'rgba(168,85,247,.12)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${view === 'ai-video' ? 'rgba(168,85,247,.4)' : 'rgba(255,255,255,.08)'}`,
              color: view === 'ai-video' ? '#c084fc' : '#9ca3af',
            }}
          >
            ✨ AI Video
          </button>
          <button onClick={() => setView('ai-reel')}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={{
              background: view === 'ai-reel' ? 'rgba(52,211,153,.12)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${view === 'ai-reel' ? 'rgba(52,211,153,.4)' : 'rgba(255,255,255,.08)'}`,
              color: view === 'ai-reel' ? '#34d399' : '#9ca3af',
            }}
          >
            🤖 AI Reel
          </button>
          <button onClick={() => setView('slide-carousel')}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={{
              background: view === 'slide-carousel' ? 'rgba(56,189,248,.12)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${view === 'slide-carousel' ? 'rgba(56,189,248,.4)' : 'rgba(255,255,255,.08)'}`,
              color: view === 'slide-carousel' ? '#38bdf8' : '#9ca3af',
            }}
          >
            📑 Slide Carousel
          </button>
          <button onClick={() => setView('saved')}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={{
              background: view === 'saved' ? 'rgba(251,146,60,.12)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${view === 'saved' ? 'rgba(251,146,60,.4)' : 'rgba(255,255,255,.08)'}`,
              color: view === 'saved' ? '#fb923c' : '#9ca3af',
            }}
          >
            📁 Saved Content
          </button>
        </div>

        {/* ── Saved Content Library ── */}
        {view === 'saved' && <SavedContentLibrary />}

        {/* ── AI Video Generation View ── */}
        {view === 'ai-video' && (
          <div className="max-w-xl mx-auto">
            <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(168,85,247,.06)', border: '1px solid rgba(168,85,247,.25)' }}>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" /> Generate an AI Video Clip
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Describe a short scene and an AI model generates a real video clip — separate from the pre-scripted reels above. Generation takes 30 seconds to a few minutes and produces a short vertical clip.
                </p>
              </div>

              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">Prompt</label>
                <Textarea
                  placeholder="e.g. A trader confidently reviewing a winning chart on a laptop, warm morning light, cinematic"
                  value={videoPrompt}
                  onChange={e => setVideoPrompt(e.target.value)}
                  rows={3}
                  className="bg-black/40 border-white/10 text-white text-sm"
                  disabled={generatingVideo}
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">Duration</label>
                <div className="flex gap-2">
                  {[5, 6].map(d => (
                    <button key={d} onClick={() => setVideoDuration(d)} disabled={generatingVideo}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: videoDuration === d ? 'rgba(168,85,247,.25)' : 'rgba(255,255,255,.05)',
                        border: `1px solid ${videoDuration === d ? 'rgba(168,85,247,.5)' : 'rgba(255,255,255,.1)'}`,
                        color: videoDuration === d ? '#c084fc' : '#9ca3af',
                      }}>
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={generateVideo} disabled={!videoPrompt.trim() || generatingVideo} className="w-full bg-purple-600 hover:bg-purple-500">
                {generatingVideo ? 'Generating… this can take a few minutes' : 'Generate Video'}
              </Button>
              {videoError && <p className="text-xs text-red-400">{videoError}</p>}

              {generatedVideoUrl && (
                <div className="space-y-2">
                  <video src={generatedVideoUrl} controls loop className="w-full rounded-xl border border-white/10" style={{ aspectRatio: '9/16', maxHeight: 480 }} />
                  <a href={generatedVideoUrl} download target="_blank" rel="noreferrer"
                    className="block text-center text-xs font-bold px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(168,85,247,.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,.3)' }}>
                    ⬇ Download Video
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── AI Reel Generation View ── */}
        {view === 'ai-reel' && (
          <div className="max-w-xl mx-auto">
            <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(52,211,153,.06)', border: '1px solid rgba(52,211,153,.25)' }}>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" /> Generate a Full AI Reel
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Give it a topic and AI writes the hook, script, and caption, then generates a matching video clip — a complete ready-to-post reel in one step. (The clip itself is a short 5-6s AI-rendered scene, not a full voiceover video — pair it with the script below when you post.)
                </p>
              </div>

              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">Topic</label>
                <Textarea
                  placeholder="e.g. Why most traders lose money on Fridays"
                  value={reelTopic}
                  onChange={e => setReelTopic(e.target.value)}
                  rows={2}
                  className="bg-black/40 border-white/10 text-white text-sm"
                  disabled={generatingReel}
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">Clip Duration</label>
                <div className="flex gap-2">
                  {[5, 6].map(d => (
                    <button key={d} onClick={() => setReelDuration(d)} disabled={generatingReel}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: reelDuration === d ? 'rgba(52,211,153,.25)' : 'rgba(255,255,255,.05)',
                        border: `1px solid ${reelDuration === d ? 'rgba(52,211,153,.5)' : 'rgba(255,255,255,.1)'}`,
                        color: reelDuration === d ? '#34d399' : '#9ca3af',
                      }}>
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={generateReel} disabled={!reelTopic.trim() || generatingReel} className="w-full bg-emerald-600 hover:bg-emerald-500">
                {generatingReel ? 'Writing script & generating clip… this can take a few minutes' : 'Generate Reel'}
              </Button>
              {reelError && <p className="text-xs text-red-400">{reelError}</p>}

              {generatedReel && (
                <div className="space-y-3">
                  <video src={generatedReel.url} controls loop className="w-full rounded-xl border border-white/10" style={{ aspectRatio: '9/16', maxHeight: 480 }} />
                  <a href={generatedReel.url} download target="_blank" rel="noreferrer"
                    className="block text-center text-xs font-bold px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(52,211,153,.15)', color: '#34d399', border: '1px solid rgba(52,211,153,.3)' }}>
                    ⬇ Download Video
                  </a>

                  <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.06)' }}>
                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Script</p>
                    <p className="text-sm text-white font-semibold">{generatedReel.hook}</p>
                    <div className="space-y-1">
                      {generatedReel.script.map((line, i) => (
                        <p key={i} className="text-xs text-gray-300 leading-relaxed">{line}</p>
                      ))}
                    </div>
                  </div>

                  <div className="w-full max-w-[280px] mx-auto">
                    <ShareButtons caption={generatedReel.caption} referralCode={referralCode} referralUrl={referralData?.url} mode="reel" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Slide Carousel Generation View ── */}
        {view === 'slide-carousel' && (
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.25)' }}>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-400" /> Generate a Slide Carousel
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Built for "how to get set up" and "how this works" explainers — give it a topic and AI writes each slide's heading and body text, then generates an on-brand background image for every slide. Swipe-through content ready for Instagram, LinkedIn, or Facebook carousels.
                </p>
              </div>

              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">Quick topics</label>
                <div className="flex flex-wrap gap-2">
                  {CAROUSEL_TOPIC_PRESETS.map(p => (
                    <button key={p.label} onClick={() => setCarouselTopic(p.topic)} disabled={generatingCarousel}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all"
                      style={{
                        background: carouselTopic === p.topic ? 'rgba(56,189,248,.2)' : 'rgba(255,255,255,.05)',
                        border: `1px solid ${carouselTopic === p.topic ? 'rgba(56,189,248,.5)' : 'rgba(255,255,255,.1)'}`,
                        color: carouselTopic === p.topic ? '#38bdf8' : '#9ca3af',
                      }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">Topic</label>
                <Textarea
                  placeholder="e.g. How to connect your MT5 account to VEDD"
                  value={carouselTopic}
                  onChange={e => setCarouselTopic(e.target.value)}
                  rows={2}
                  className="bg-black/40 border-white/10 text-white text-sm"
                  disabled={generatingCarousel}
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">Number of Slides</label>
                <div className="flex gap-2">
                  {[4, 6, 8].map(n => (
                    <button key={n} onClick={() => setCarouselSlideCount(n)} disabled={generatingCarousel}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: carouselSlideCount === n ? 'rgba(56,189,248,.25)' : 'rgba(255,255,255,.05)',
                        border: `1px solid ${carouselSlideCount === n ? 'rgba(56,189,248,.5)' : 'rgba(255,255,255,.1)'}`,
                        color: carouselSlideCount === n ? '#38bdf8' : '#9ca3af',
                      }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={generateCarousel} disabled={!carouselTopic.trim() || generatingCarousel} className="w-full bg-sky-600 hover:bg-sky-500">
                {generatingCarousel ? `Writing ${carouselSlideCount} slides & generating images… images render one at a time, so this can take several minutes` : 'Generate Carousel'}
              </Button>
              {carouselError && <p className="text-xs text-red-400">{carouselError}</p>}
            </div>

            {generatedCarousel && (
              <div className="mt-5 space-y-4">
                <h3 className="text-base font-bold text-white">{generatedCarousel.title}</h3>

                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <input type="checkbox" checked={includeLogo} onChange={e => setIncludeLogo(e.target.checked)} className="accent-orange-500" />
                  Include VEDD logo when baking words onto slides
                </div>

                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {generatedCarousel.slides.map((slide, i) => (
                    <CarouselSlideCard
                      key={i}
                      slide={slide}
                      index={i}
                      total={generatedCarousel.slides.length}
                      includeLogo={includeLogo}
                      referralCode={referralCode}
                      referralUrl={referralData?.url}
                    />
                  ))}
                </div>

                <div className="w-full max-w-[280px]">
                  <ShareButtons caption={generatedCarousel.caption} referralCode={referralCode} referralUrl={referralData?.url} mode="post" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Reel View ── */}
        {view === 'reels' && (
          <div>
            {/* Reel selector */}
            <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
              <button
                onClick={() => setReelId('correction')}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: reelId === 'correction' ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${reelId === 'correction' ? 'rgba(239,68,68,.4)' : 'rgba(255,255,255,.08)'}`,
                  color: reelId === 'correction' ? '#f87171' : '#6b7280',
                }}
              >
                Stop Staring at the Correction · :20
              </button>
              <button
                onClick={() => setReelId('whatisveddbuild')}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: reelId === 'whatisveddbuild' ? 'rgba(240,210,105,.10)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${reelId === 'whatisveddbuild' ? 'rgba(240,210,105,.4)' : 'rgba(255,255,255,.08)'}`,
                  color: reelId === 'whatisveddbuild' ? '#F0D269' : '#6b7280',
                }}
              >
                What Is VEDDBuild? · :55
              </button>
              {EDU_REELS.map(r => (
                <button
                  key={r.id}
                  onClick={() => setReelId(r.id)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: reelId === r.id ? `${r.accent}1f` : 'rgba(255,255,255,.04)',
                    border: `1px solid ${reelId === r.id ? `${r.accent}66` : 'rgba(255,255,255,.08)'}`,
                    color: reelId === r.id ? r.accent : '#6b7280',
                  }}
                >
                  {r.title} · :20
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 mb-6 px-3 py-3 rounded-xl" style={{ background: 'rgba(124,58,237,.08)', border: '1px solid rgba(124,58,237,.25)' }}>
              <div className="flex items-center gap-2">
                <span>🎬</span>
                <p className="text-xs text-gray-300">Press Record & Export, then Play the reel — you'll get a real video file to post.</p>
              </div>
              <ReelRecorder suggestedName={`vedd-reel-${reelId}`} />
            </div>

            {reelId === 'correction' && (
              <div className="flex flex-col lg:flex-row gap-10 items-start">
                <VeddReelPlayer />
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Script — Stop Staring at the Correction</h3>
                  <div className="space-y-3 text-sm text-gray-400 leading-relaxed" style={{ maxWidth: 480 }}>
                    <p><span className="text-red-400 font-bold">HOOK:</span> You didn't lose money this week because the market was hard. You lost it because you were the trade.</p>
                    <div className="h-px" style={{ background: 'rgba(255,255,255,.06)' }} />
                    <p>Stop. Look at what just happened. BTC spent all week trapped between 64 and 65 thousand dollars. Most traders lost money not because the market was impossible — but because <span className="text-white font-semibold">they were the problem.</span></p>
                    <p><span className="text-red-400">Fear</span> made them exit early. <span className="text-red-400">Greed</span> made them re-enter late.</p>
                    <p><span className="text-emerald-400 font-semibold">VEDD's AI Vault had none of that.</span> Custom expert advisors built inside the platform executed every entry and exit on MT5 and TradingView without a single emotional override.</p>
                    <p>Multi-timeframe synthesis caught the signals before the crowd even saw them. ABBA AI kept the strategy locked in when the charts looked ugliest.</p>
                    <p>And while the dust settled, <span className="text-purple-400 font-semibold">Solana token rewards</span> kept stacking in the background.</p>
                    <p className="text-white font-bold">This is not the future of trading. This is right now.</p>
                    <p>Your vault is waiting. Build it before this window closes.</p>
                    <div className="h-px" style={{ background: 'rgba(255,255,255,.06)' }} />
                    <div className="p-3 rounded-lg text-xs font-mono" style={{ background: '#060910', border: '1px solid #1A2030', color: '#64748B' }}>
                      <div className="text-emerald-400 font-bold mb-1"># CLOSING TEXT CARD</div>
                      the machine never panicked.<br/>
                      you still can.<br/>
                      <span className="text-emerald-400">→ build your vault now · veddbuild.com</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {reelId === 'whatisveddbuild' && (
              <div className="flex flex-col lg:flex-row gap-10 items-start">
                <div className="flex flex-col items-center">
                  <VeddReelWhatIsVedd />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Script — What Is VEDDBuild?</h3>
                  <div className="space-y-3 text-sm text-gray-400 leading-relaxed" style={{ maxWidth: 480 }}>
                    <p><span className="font-bold" style={{ color: '#F0D269' }}>HOOK (0:00–0:04):</span> What if your platform worked while you slept?</p>
                    <div className="h-px" style={{ background: 'rgba(255,255,255,.06)' }} />
                    <p><span className="font-bold" style={{ color: '#F0D269' }}>PLATFORM REVEAL (0:05–0:20):</span> VEDDBuild is an AI trading ecosystem. Live signals. Smart filtering. <span className="text-white font-semibold">Auto-execution on every major broker.</span></p>
                    <p>Features: <span className="text-white">Live AI Signals · SS AI Filter · EA Auto-Execution</span> on MT4, MT5, and TradeLocker.</p>
                    <div className="h-px" style={{ background: 'rgba(255,255,255,.06)' }} />
                    <p><span className="font-bold" style={{ color: '#F0D269' }}>ECOSYSTEM (0:21–0:40):</span> It's not just signals. It's a full ecosystem built for the trader who moves differently.</p>
                    <p><span className="text-white">SOL Scanner</span> · <span className="text-purple-400">$VEDD Token</span> · <span className="text-white">NFC Streetwear</span> · <span className="text-white">Ambassador Program</span></p>
                    <p className="italic" style={{ color: '#F0D269' }}>vous êtes des dieux</p>
                    <div className="h-px" style={{ background: 'rgba(255,255,255,.06)' }} />
                    <p><span className="font-bold" style={{ color: '#F0D269' }}>CTA (0:41–0:55):</span> Start your free trial now. No excuses. Just edge.</p>
                    <div className="p-3 rounded-lg text-xs font-mono" style={{ background: '#060910', border: '1px solid #1A2030', color: '#64748B' }}>
                      <div className="font-bold mb-1" style={{ color: '#F0D269' }}># CLOSING TEXT CARD</div>
                      START FREE<br/>
                      <span className="text-white">VEDDBuild.com</span><br/>
                      <span style={{ color: '#F0D269' }}>→ no excuses. just edge.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 5 Educational reels — build interest in VEDDBuild ── */}
            {EDU_REELS.filter(r => r.id === reelId).map(r => (
              <div key={r.id} className="flex flex-col lg:flex-row gap-10 items-start">
                <div className="flex flex-col items-center gap-4">
                  <VeddEduReel reel={r} />
                  {/* One-tap platform share, formatted per platform (reel mode) */}
                  <div className="w-[270px]">
                    <ShareButtons caption={r.shareCaption} referralCode={referralCode} mode="reel" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Script — {r.title}</h3>
                  <div className="space-y-3 text-sm text-gray-400 leading-relaxed" style={{ maxWidth: 480 }}>
                    {r.script.map((p, i) => (
                      <p key={i}>
                        {i === 0
                          ? <><span className="font-bold" style={{ color: r.accent }}>HOOK: </span>{p.replace(/^HOOK:\s*/i, '')}</>
                          : p}
                      </p>
                    ))}
                    <div className="h-px" style={{ background: 'rgba(255,255,255,.06)' }} />
                    <div className="p-3 rounded-lg text-xs font-mono" style={{ background: '#060910', border: '1px solid #1A2030', color: '#64748B' }}>
                      <div className="font-bold mb-1" style={{ color: r.accent }}># CLOSING TEXT CARD</div>
                      {r.close.filter(Boolean).map((l, i, arr) => (
                        <span key={i}>{i === arr.length - 1 ? <span style={{ color: r.accent }}>{l}</span> : l}<br /></span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'studio' && (<>

        {/* ── Content Type Tabs ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
          {CONTENT_TYPES.map(ct => (
            <button key={ct.id} onClick={() => handleTypeSwitch(ct.id)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: activeType === ct.id ? ct.bg : 'rgba(255,255,255,.04)',
                border: `1px solid ${activeType === ct.id ? ct.color + '55' : 'rgba(255,255,255,.08)'}`,
                color: activeType === ct.id ? ct.color : '#9ca3af',
              }}
            >
              <span>{ct.emoji}</span> {ct.label}
            </button>
          ))}
        </div>

        {/* ── Description bar ── */}
        <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-xl" style={{ background: cfg.bg, border: `1px solid ${cfg.color}33` }}>
          <span>{cfg.emoji}</span>
          <p className="text-xs text-gray-300">{cfg.desc}</p>
          {!selectedItem && <p className="ml-auto text-[11px] font-bold" style={{ color: cfg.color }}>← Select content on the left</p>}
        </div>

        {/* ── 3-column layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Col 1 — Content browser */}
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <BookOpen className="h-3 w-3" /> Choose Content
            </h2>
            <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1 scrollbar-hide">
              <ContentBrowser type={activeType} selected={selectedItem} onSelect={item => setSelectedItem(item)} />
            </div>
          </div>

          {/* Col 2 — Branded card preview */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                <ImageIcon className="h-3 w-3" /> Post Preview
              </h2>
              <button onClick={() => setShowPreview(v => !v)} className="text-[10px] text-gray-600 hover:text-gray-400 flex items-center gap-0.5">
                {showPreview ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showPreview ? 'Hide' : 'Show'}
              </button>
            </div>

            {showPreview && (
              <div ref={cardRef} className="w-full">
                <AnimatePresence mode="wait">
                  <motion.div key={`${activeType}-${selectedItem?.id}`}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                  >
                    {selectedItem ? (
                      <BrandedCard type={activeType} item={selectedItem} referralCode={referralCode} bgImage={bgImage} />
                    ) : (
                      <div className="rounded-2xl aspect-square flex flex-col items-center justify-center gap-3"
                        style={{ background: 'rgba(255,255,255,.02)', border: '1px dashed rgba(255,255,255,.1)' }}>
                        <span className="text-4xl opacity-30">{cfg.emoji}</span>
                        <p className="text-xs text-gray-600 text-center px-6">Select a {cfg.label.toLowerCase()} from the left to preview your branded post</p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                {selectedItem && (
                  <>
                    <button
                      onClick={generateBackground}
                      disabled={generatingImage}
                      className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-60"
                      style={{ background: 'rgba(168,85,247,.12)', border: '1px solid rgba(168,85,247,.35)', color: '#c084fc' }}
                    >
                      {generatingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {generatingImage ? 'Generating background…' : bgImage ? 'Regenerate AI Background' : 'Generate AI Background'}
                    </button>
                    {imageError && <p className="text-[10px] text-red-400 mt-1.5 px-1">{imageError}</p>}

                    <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
                      <ImageIcon className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                      <p className="text-[10px] text-gray-500 leading-relaxed">
                        <span className="text-white font-semibold">Screenshot this card</span> (iPhone: Side+Volume / Android: Power+Volume) then post the image + paste the caption below — or use "Flatten & Save" below for a one-tap file with the caption already baked in.
                      </p>
                    </div>

                    {bgImage && (
                      <div className="mt-3 p-3 rounded-xl space-y-2" style={{ background: 'rgba(251,146,60,.06)', border: '1px solid rgba(251,146,60,.2)' }}>
                        <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer select-none">
                          <input type="checkbox" checked={includeLogo} onChange={e => setIncludeLogo(e.target.checked)} className="accent-orange-500" />
                          Include VEDD logo watermark
                        </label>
                        <button
                          onClick={flattenAndSaveSlide}
                          disabled={flattening}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-60"
                          style={{ background: 'rgba(251,146,60,.15)', border: '1px solid rgba(251,146,60,.4)', color: '#fb923c' }}
                        >
                          {flattening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                          {flattening ? 'Flattening…' : 'Flatten & Save (image + caption in one file)'}
                        </button>
                        {flattenedSlideUrl && (
                          <a href={flattenedSlideUrl} download target="_blank" rel="noreferrer"
                            className="block text-center text-[11px] font-bold text-emerald-400 hover:text-emerald-300 py-1">
                            ✓ Ready — tap to download & upload to social media
                          </a>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Col 3 — Caption + Share */}
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Megaphone className="h-3 w-3" /> Caption & Share
            </h2>

            {selectedItem ? (
              <div className="space-y-4">
                {/* Caption editor */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] text-gray-500">Post caption</label>
                    <button onClick={() => setCaption(buildCaption(activeType, selectedItem, referralCode, referralData?.url))}
                      className="text-[10px] text-gray-500 hover:text-white flex items-center gap-0.5 transition-colors">
                      <RefreshCw className="h-2.5 w-2.5" /> Reset
                    </button>
                  </div>
                  <textarea
                    value={caption}
                    onChange={e => setCaption(e.target.value)}
                    rows={10}
                    className="w-full text-xs text-gray-300 leading-relaxed bg-black/40 border border-white/08 rounded-xl px-3 py-2.5 outline-none focus:border-white/20 resize-none"
                    style={{ borderColor: 'rgba(255,255,255,.08)' }}
                  />
                  <p className="text-[9px] text-gray-700 mt-1 text-right">{caption.length} chars</p>
                </div>

                {/* Hashtag sets */}
                <div>
                  <p className="text-[10px] text-gray-500 mb-1.5">Quick add hashtags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      ['#VEDD', '#AITrading', '#Forex'],
                      ['#TradingCommunity', '#PassiveIncome'],
                      ['#FaithAndFinance', '#TradingMindset'],
                      ['#AmbassadorLife', '#EarnWhileYouLearn'],
                    ].map((group, i) => (
                      <button key={i} onClick={() => setCaption(c => c + '\n' + group.join(' '))}
                        className="text-[10px] px-2 py-1 rounded-lg text-gray-400 hover:text-white transition-colors"
                        style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
                        + {group.join(' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Share buttons */}
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Share To</p>
                  <ShareButtons caption={caption} referralCode={referralCode} referralUrl={referralData?.url} imageUrl={flattenedSlideUrl || bgImage} />
                </div>

                {/* VEDD token reward reminder */}
                <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.2)' }}>
                  <Zap className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    Each share that converts a new signup earns you <span className="text-red-400 font-bold">VEDD tokens + commission</span>. Track referrals in your Referral Hub.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,.02)', border: '1px dashed rgba(255,255,255,.08)' }}>
                <Megaphone className="h-8 w-8 mx-auto mb-3 text-gray-700" />
                <p className="text-xs text-gray-600">Select content and a branded caption will appear here, ready to copy and share.</p>
              </div>
            )}
          </div>

        </div>

        {/* ── Tips Bar ── */}
        <div className="mt-10 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)' }}>
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400" /> Ambassador Posting Tips
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: BarChart3, title: 'Post Signal Proof Daily', tip: 'Share 1 chart analysis per day. Real signal screenshots build trust faster than any ad.' },
              { icon: Heart, title: 'Lead with Scripture', tip: 'Scripture + trading posts outperform regular finance content. Faith-based audiences are highly engaged.' },
              { icon: Users, title: '3-2-1 Posting Mix', tip: '3 lessons, 2 signals, 1 testimony per week. Vary content types to reach different audiences.' },
              { icon: TrendingUp, title: 'Always Add Your Link', tip: 'Every post should have your referral link. Most conversions happen on the 3rd–7th touchpoint.' },
            ].map(t => (
              <div key={t.title} className="flex gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(220,38,38,.12)' }}>
                  <t.icon className="h-3.5 w-3.5 text-red-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white mb-0.5">{t.title}</p>
                  <p className="text-[10px] text-gray-500 leading-relaxed">{t.tip}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        </>)}

      </div>
    </div>
  );
}
