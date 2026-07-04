import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { Redirect } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { VeddReelPlayer } from '@/components/vedd-reel-player';
import { VeddReelWhatIsVedd } from '@/components/vedd-reel-whatisveddbuild';
import { VeddEduReel, EDU_REELS } from '@/components/vedd-edu-reels';
import {
  BookOpen, BarChart3, Heart, Megaphone, Star,
  Copy, Check, Share2, ChevronRight, ChevronDown, ChevronUp,
  Sparkles, RefreshCw, Loader2, Radio, ArrowRight,
  TrendingUp, Shield, Award, Users, Zap, ImageIcon,
  Instagram, Twitter, Mail,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface BlogPost { id: number; title: string; excerpt: string; category: string; tags: string[]; content: string; publishedAt?: string; }
interface ChartAnalysis { id: number; symbol: string; direction: string; confidence: string; entryPoint: string; stopLoss: string; takeProfit: string; riskRewardRatio: string; potentialPips: string; trend: string; timeframe: string; createdAt: string; imageUrl?: string; }
interface Devotional { id: number; title: string; scripture: string; scriptureReference: string; content: string; tradingLesson?: string; createdAt: string; }

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

// ── Caption templates ─────────────────────────────────────────────────────────
function buildCaption(type: ContentType, item: any, referralCode: string | null, referralUrl?: string): string {
  const url = referralUrl ?? (referralCode
    ? `https://veddbuild.com/auth?ref=${referralCode}`
    : 'https://veddbuild.com');

  switch (type) {
    case 'lesson': return (
      `📚 VEDD AI Trading Lesson\n\n` +
      `"${item?.title || 'Master Your Trading Edge'}"\n\n` +
      `${truncate(stripHtml(item?.excerpt || ''), 200)}\n\n` +
      `🧠 Real knowledge. Real results. AI-powered.\n\n` +
      `👇 Join VEDD free & get access to every lesson:\n${url}\n\n` +
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
      `"${truncate(item?.scripture || '', 160)}"\n— ${item?.scriptureReference || ''}\n\n` +
      `${truncate(item?.tradingLesson || item?.content || '', 200)}\n\n` +
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

// ── VEDD Branded Post Card ─────────────────────────────────────────────────────
function BrandedCard({ type, item, referralCode }: {
  type: ContentType; item: any; referralCode: string | null;
}) {
  const signupUrl = referralCode ? `veddbuild.com/auth?ref=${referralCode}` : 'veddbuild.com';
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
    <div className="rounded-2xl p-4 w-full aspect-square flex flex-col" style={{ background: 'linear-gradient(160deg,#0a0a14 0%,#0d0a1a 60%,#0a0f0a 100%)', border: `1px solid ${cfg.color}44` }}>
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
    </div>
  );

  if (type === 'signal') return (
    <div className="rounded-2xl p-4 w-full aspect-square flex flex-col" style={{ background: 'linear-gradient(160deg,#020f08 0%,#061a12 60%,#0a0a14 100%)', border: `1px solid ${cfg.color}44` }}>
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
    </div>
  );

  if (type === 'scripture') return (
    <div className="rounded-2xl p-4 w-full aspect-square flex flex-col" style={{ background: 'linear-gradient(160deg,#0d0a1a 0%,#120a14 60%,#0a0a14 100%)', border: `1px solid ${cfg.color}44` }}>
      <Header />
      <div className="flex-1 flex flex-col justify-center">
        <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.25)' }}>
          <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: cfg.color }}>✝️ Daily Scripture</p>
          <p className="text-xs text-white italic leading-relaxed">"{truncate(item?.scripture || 'Trust in the LORD with all your heart and lean not on your own understanding.', 180)}"</p>
          <p className="text-[10px] font-bold mt-1.5" style={{ color: cfg.color }}>— {item?.scriptureReference || 'Proverbs 3:5'}</p>
        </div>
        <div className="h-px mb-2" style={{ background: `linear-gradient(90deg,${cfg.color},transparent)` }} />
        <p className="text-[11px] text-gray-300 leading-relaxed">{truncate(item?.tradingLesson || item?.content || 'Apply wisdom and patience to every trade. Faith and discipline build lasting wealth.', 160)}</p>
      </div>
      <Footer />
    </div>
  );

  if (type === 'update') return (
    <div className="rounded-2xl p-4 w-full aspect-square flex flex-col" style={{ background: 'linear-gradient(160deg,#0f0a05 0%,#1a0f05 60%,#0a0a14 100%)', border: `1px solid ${cfg.color}44` }}>
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
    </div>
  );

  if (type === 'testimony') return (
    <div className="rounded-2xl p-4 w-full aspect-square flex flex-col" style={{ background: 'linear-gradient(160deg,#0f0f05 0%,#1a140a 60%,#0a0a14 100%)', border: `1px solid ${cfg.color}44` }}>
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
    </div>
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
    queryFn: async () => { const r = await apiRequest('GET', '/api/devotionals'); return r.json(); },
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
            sub={`${d.scriptureReference} · ${fmtDate(d.createdAt)}`}
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

function ShareButtons({ caption, referralCode, referralUrl, mode = 'post' }: { caption: string; referralCode: string | null; referralUrl?: string; mode?: 'post' | 'reel' }) {
  const [copied, setCopied] = useState<string | null>(null);
  const url = referralUrl ?? (referralCode ? `https://veddbuild.com/auth?ref=${referralCode}` : 'https://veddbuild.com');

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

  // Native OS share sheet — the real "straight to the platform" on mobile
  const nativeShare = async () => {
    const formatted = formatForPlatform('ig', caption, url, mode);
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
        {copied === 'native' ? 'Copied! (share sheet unavailable)' : '📲 Share Straight to App'}
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

  const [view, setView] = useState<'studio' | 'reels'>('studio');
  const [reelId, setReelId] = useState<string>('correction');
  const [activeType, setActiveType] = useState<ContentType>('lesson');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [caption, setCaption] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  if (!isAmbassador && !isAdmin) return <Redirect to="/dashboard" />;

  const cfg = CONTENT_TYPES.find(c => c.id === activeType)!;

  // Rebuild caption when content or type changes
  useEffect(() => {
    if (selectedItem) setCaption(buildCaption(activeType, selectedItem, referralCode, referralData?.url));
  }, [selectedItem, activeType, referralCode, referralData?.url]);

  const handleTypeSwitch = (type: ContentType) => {
    setActiveType(type);
    setSelectedItem(null);
    setCaption('');
  };

  return (
    <div className="min-h-screen pb-16" style={{ background: 'linear-gradient(180deg,#060610 0%,#080812 100%)' }}>
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
        </div>

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
                  {r.title} · :{r.duration}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-xl" style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)' }}>
              <span>🎬</span>
              <p className="text-xs text-gray-300">Animated reel preview — press Play, then screen-record to export as a real video.</p>
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
                      {r.closing.map((l, i) => (
                        <span key={i}>{i === r.closing.length - 1 ? <span style={{ color: r.accent }}>{l}</span> : l}<br /></span>
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
                      <BrandedCard type={activeType} item={selectedItem} referralCode={referralCode} />
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
                  <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
                    <ImageIcon className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      <span className="text-white font-semibold">Screenshot this card</span> (iPhone: Side+Volume / Android: Power+Volume) then post the image + paste the caption below.
                    </p>
                  </div>
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
                  <ShareButtons caption={caption} referralCode={referralCode} referralUrl={referralData?.url} />
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
