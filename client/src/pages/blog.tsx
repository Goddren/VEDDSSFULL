import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { EarlyAccessForm } from '@/components/early-access/early-access-form';
import {
  ArrowRight, ArrowLeft, Calendar, Clock, Eye, Sparkles, Trash2, Edit,
  Star, Globe, EyeOff, RefreshCw, Loader2, Share2, Copy, Check, X,
  Radio, TrendingUp, Zap, Users, DollarSign, Lock, BookOpen, ChevronRight,
  Mail, Bell, BarChart2, Award, Tag,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Reward tracker ───────────────────────────────────────────────────────────
async function trackReward(actionType: string, actionId?: number) {
  try { await apiRequest('POST', '/api/vedd/track', { actionType, actionId }); } catch {}
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  coverImage?: string | null;
  authorName: string;
  isPublished: boolean;
  isFeatured: boolean;
  aiGenerated: boolean;
  readTime: string;
  viewCount: number;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GeneratedPost {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  readTime: string;
  currentEventsContext: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TOPIC_CHIPS = [
  'Forex volatility', 'Crypto bull run', 'Fed interest rates',
  'Gold trading', 'AI in trading', 'VEDD Ambassador', 'Passive income strategies',
];

const CATEGORIES = ['All', 'Forex', 'Crypto', 'Strategy', 'AI Trading', 'Market Analysis', 'VEDD News'];

// Category gradient map
const CAT_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  'Forex':           { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa', border: 'rgba(59,130,246,0.35)' },
  'Crypto':          { bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24', border: 'rgba(245,158,11,0.35)' },
  'Strategy':        { bg: 'rgba(16,185,129,0.15)',  text: '#34d399', border: 'rgba(16,185,129,0.35)' },
  'AI Trading':      { bg: 'rgba(168,85,247,0.15)',  text: '#c084fc', border: 'rgba(168,85,247,0.35)' },
  'Market Analysis': { bg: 'rgba(249,115,22,0.15)',  text: '#fb923c', border: 'rgba(249,115,22,0.35)' },
  'VEDD News':       { bg: 'rgba(220,38,38,0.15)',   text: '#f87171', border: 'rgba(220,38,38,0.35)' },
};
const catStyle = (cat: string) =>
  CAT_STYLE[cat] ?? { bg: 'rgba(220,38,38,0.15)', text: '#f87171', border: 'rgba(220,38,38,0.35)' };

// Cover image gradients for posts without an image
const COVER_GRADIENTS = [
  'from-red-900 via-red-800 to-purple-900',
  'from-blue-900 via-indigo-900 to-purple-900',
  'from-green-900 via-emerald-900 to-teal-900',
  'from-amber-900 via-orange-900 to-red-900',
  'from-purple-900 via-fuchsia-900 to-pink-900',
  'from-slate-900 via-gray-800 to-zinc-900',
];
const coverGradient = (id: number) => COVER_GRADIENTS[id % COVER_GRADIENTS.length];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Article Content — intercepts links → VEDD sign-up ───────────────────────
function ArticleContent({ html, referralCode, className }: {
  html: string; referralCode?: string | null; className?: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const signupUrl = referralCode
    ? `${window.location.origin}/auth?ref=${referralCode}`
    : `${window.location.origin}/auth`;

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#') || href === '' || href.includes(window.location.hostname)) {
        a.setAttribute('href', signupUrl); a.removeAttribute('target');
      } else if (href.startsWith('http')) {
        a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer');
        if (!a.dataset.veddPatched) {
          a.dataset.veddPatched = '1';
          const nudge = document.createElement('a');
          nudge.href = signupUrl;
          nudge.textContent = ' → Join VEDD';
          nudge.style.cssText = 'display:inline-block;margin-left:4px;font-size:.75em;font-weight:700;color:#ef4444;text-decoration:none;background:rgba(220,38,38,.12);border:1px solid rgba(220,38,38,.35);border-radius:4px;padding:0 5px;line-height:1.6;';
          a.insertAdjacentElement('afterend', nudge);
        }
      } else {
        a.setAttribute('href', signupUrl); a.removeAttribute('target');
      }
    });
  }, [html, signupUrl]);

  return (
    <div
      ref={contentRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── Breaking News Card ───────────────────────────────────────────────────────
function BreakingNewsCard({ post, referralCode }: { post: BlogPost; referralCode?: string | null }) {
  const signupUrl = referralCode
    ? `${window.location.origin}/auth?ref=${referralCode}`
    : `${window.location.origin}/auth`;
  const snippet = truncate(post.excerpt || truncate(stripHtml(post.content || ''), 160), 160);

  return (
    <div className="rounded-xl overflow-hidden" style={{
      background: 'linear-gradient(135deg,#0a0a0f 0%,#12060a 60%,#0f0a1a 100%)',
      border: '2px solid rgba(220,38,38,.7)',
      boxShadow: '0 0 24px rgba(220,38,38,.25)',
    }}>
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: 'linear-gradient(90deg,#dc2626,#b91c1c)' }}>
        <span className="text-[9px] font-black tracking-[.3em] text-white animate-pulse">● BREAKING NEWS</span>
        <span className="ml-auto text-[9px] text-red-200 font-mono opacity-80">VEDD AI TRADING</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#dc2626,#7c3aed)' }}>
            <span className="text-[8px] font-black text-white">V</span>
          </div>
          <span className="text-[10px] font-bold tracking-widest text-red-400 uppercase">VEDD · Trading Intelligence</span>
        </div>
        <h3 className="text-sm font-extrabold text-white leading-snug">📈 {post.title}</h3>
        <div className="h-px" style={{ background: 'linear-gradient(90deg,#dc2626,transparent)' }} />
        <p className="text-[11px] text-gray-300 leading-relaxed">{snippet}</p>
        <div className="rounded-lg px-3 py-2 mt-1" style={{ background: 'rgba(220,38,38,.12)', border: '1px solid rgba(220,38,38,.35)' }}>
          <p className="text-[10px] text-gray-400 mb-0.5">🔗 Join VEDD AI Trading now →</p>
          <p className="text-[11px] font-bold text-red-400 break-all">{signupUrl}</p>
        </div>
        {referralCode && <p className="text-[9px] text-emerald-400 opacity-75">Referral code: <span className="font-mono font-bold">{referralCode}</span></p>}
      </div>
      <div className="px-3 py-1 flex" style={{ background: 'rgba(220,38,38,.08)', borderTop: '1px solid rgba(220,38,38,.2)' }}>
        <span className="text-[8px] text-gray-600 uppercase tracking-widest">veddbuild.com · AI-Powered Forex & Crypto Trading</span>
      </div>
    </div>
  );
}

// ─── Share Panel ──────────────────────────────────────────────────────────────
function SharePanel({ post, referralCode, onClose }: {
  post: BlogPost; referralCode?: string | null; onClose: () => void;
}) {
  const [copiedMsg,      setCopiedMsg]      = useState(false);
  const [copiedLink,     setCopiedLink]     = useState(false);
  const [copiedBreaking, setCopiedBreaking] = useState(false);
  const [tab,            setTab]            = useState<'breaking' | 'share'>('breaking');

  const signupUrl  = referralCode ? `${window.location.origin}/auth?ref=${referralCode}` : `${window.location.origin}/auth`;
  const articleUrl = referralCode ? `${window.location.origin}/blog/${post.slug}?ref=${referralCode}` : `${window.location.origin}/blog/${post.slug}`;
  const plain      = post.excerpt || truncate(stripHtml(post.content || ''), 220);
  const snippet    = truncate(plain, 220);

  // Tag each share destination with utm_source so analytics can tell which
  // platform (WhatsApp vs X vs copied link) actually drives signups — not
  // just which referral code was attached.
  const utmUrl = (source: string) => {
    const u = new URL(articleUrl);
    u.searchParams.set('utm_source', source);
    u.searchParams.set('utm_medium', 'social_share');
    u.searchParams.set('utm_campaign', 'blog_share');
    return u.toString();
  };
  const copyLinkUrl = utmUrl('copy_link');

  const breakingText =
    `📡 BREAKING NEWS — VEDD AI Trading\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📈 ${post.title}\n\n${truncate(plain, 180)}\n\n🔗 Join VEDD AI Trading now:\n${signupUrl}\n\n#VEDD #Trading #Forex #AI #BreakingNews`;
  const fullMsgFor = (source: string) => `📈 ${post.title}\n\n${snippet}\n\nRead the full article on VEDD AI Trading 👇\n${utmUrl(source)}`;
  const fullMsg = fullMsgFor('copy_link'); // preview/copy-message default
  const twitterMsg = `📈 ${post.title}\n\n${truncate(plain, 120)}\n\n#VEDD #Trading #Forex`;

  const eBreaking = encodeURIComponent(breakingText);
  const eFull     = encodeURIComponent(fullMsgFor('whatsapp'));
  const eTwitter  = encodeURIComponent(twitterMsg);

  const activeMsg = tab === 'breaking' ? breakingText : fullMsg;

  const platforms = [
    { name: 'WhatsApp', color: 'bg-green-700 hover:bg-green-600', emoji: '💬', url: `https://wa.me/?text=${tab === 'breaking' ? eBreaking : eFull}` },
    { name: 'X / Twitter', color: 'bg-gray-800 hover:bg-gray-700 border border-gray-600', emoji: '𝕏', url: `https://twitter.com/intent/tweet?text=${eTwitter}&url=${encodeURIComponent(utmUrl('twitter'))}` },
    { name: 'Facebook', color: 'bg-blue-700 hover:bg-blue-600', emoji: 'f', url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(utmUrl('facebook'))}&quote=${encodeURIComponent(activeMsg)}` },
    { name: 'LinkedIn', color: 'bg-blue-600 hover:bg-blue-500', emoji: 'in', url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(utmUrl('linkedin'))}&summary=${encodeURIComponent(activeMsg)}` },
  ];

  const copy = async (text: string, which: 'msg' | 'link' | 'breaking') => {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
    trackReward('blog_share', post.id);
    if (which === 'msg')      { setCopiedMsg(true);      setTimeout(() => setCopiedMsg(false), 2200); }
    if (which === 'link')     { setCopiedLink(true);     setTimeout(() => setCopiedLink(false), 2200); }
    if (which === 'breaking') { setCopiedBreaking(true); setTimeout(() => setCopiedBreaking(false), 2200); }
  };

  return (
    <div className="mt-4 bg-gray-900/90 border border-gray-700 rounded-xl p-4 space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white flex items-center gap-2">
          <Share2 className="h-4 w-4 text-red-400" /> Share this article
          {referralCode && <span className="text-xs text-emerald-400 bg-emerald-900/30 px-2 py-0.5 rounded-full">+ ref link</span>}
        </p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex gap-1 bg-gray-800/60 p-1 rounded-lg">
        {(['breaking', 'share'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-md transition-all ${tab === t ? (t === 'breaking' ? 'bg-red-700 text-white' : 'bg-gray-600 text-white') : 'text-gray-400 hover:text-white'}`}>
            {t === 'breaking' ? <><Radio className="h-3 w-3" /> Breaking News</> : <><Share2 className="h-3 w-3" /> Standard</>}
          </button>
        ))}
      </div>

      {tab === 'breaking' ? (
        <>
          <BreakingNewsCard post={post} referralCode={referralCode} />
          <Button size="sm" onClick={() => copy(breakingText, 'breaking')} variant="outline"
            className={`w-full text-xs h-9 font-semibold ${copiedBreaking ? 'bg-emerald-700 text-white' : 'bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-700/50'}`}>
            {copiedBreaking ? <><Check className="h-3.5 w-3.5 mr-1.5" />Copied!</> : <><Copy className="h-3.5 w-3.5 mr-1.5" />Copy Breaking News Caption</>}
          </Button>
          <p className="text-[10px] text-gray-500 italic text-center">Screenshot the card above + paste the caption, or share directly 👇</p>
        </>
      ) : (
        <>
          <div className="bg-gray-800/70 border border-gray-600/50 rounded-lg p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Preview</p>
            <p className="text-xs font-bold text-white">📈 {post.title}</p>
            <p className="text-xs text-gray-300">{snippet}</p>
            <p className="text-xs text-emerald-400 font-mono truncate">{copyLinkUrl}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => copy(fullMsg, 'msg')} variant="outline"
              className={`flex-1 text-xs h-8 ${copiedMsg ? 'bg-emerald-700 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600'}`}>
              {copiedMsg ? <><Check className="h-3.5 w-3.5 mr-1" />Copied!</> : <><Copy className="h-3.5 w-3.5 mr-1" />Copy Message</>}
            </Button>
            <Button size="sm" onClick={() => copy(copyLinkUrl, 'link')} variant="outline" title="Copy link"
              className={`text-xs h-8 ${copiedLink ? 'bg-emerald-700 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700'}`}>
              {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {platforms.map(p => (
          <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
            onClick={() => trackReward('blog_share', post.id)}
            className={`${p.color} text-white text-xs font-semibold rounded-lg px-3 py-2.5 text-center flex items-center justify-center gap-1.5`}>
            <span className="text-sm">{p.emoji}</span>{p.name}
          </a>
        ))}
      </div>
      {referralCode && (
        <p className="text-xs text-gray-500 italic">🔗 Code <span className="text-emerald-400 font-mono">{referralCode}</span> — earn VEDD rewards when someone joins.</p>
      )}
    </div>
  );
}

// ─── Monetization: Inline Ad Banner ──────────────────────────────────────────
function InlineAdBanner({ referralCode, variant = 'broker' }: {
  referralCode?: string | null; variant?: 'broker' | 'ambassador' | 'premium';
}) {
  const signupUrl = referralCode ? `/auth?ref=${referralCode}` : '/auth';

  if (variant === 'ambassador') return (
    <div className="rounded-2xl overflow-hidden my-6" style={{
      background: 'linear-gradient(135deg,#0f0715 0%,#1a0a0a 100%)',
      border: '1px solid rgba(168,85,247,.4)',
    }}>
      <div className="px-5 py-4 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#7c3aed,#dc2626)' }}>
          <Users className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <p className="text-xs font-bold text-purple-300 uppercase tracking-widest mb-0.5">🚀 VEDD Ambassador Program</p>
          <p className="text-sm font-bold text-white">Get paid to share trading knowledge</p>
          <p className="text-xs text-gray-400 mt-0.5">Earn commissions + VEDD tokens when your network joins & trades</p>
        </div>
        <Link href={signupUrl}>
          <Button size="sm" className="flex-shrink-0 text-xs font-bold" style={{ background: 'linear-gradient(135deg,#7c3aed,#dc2626)' }}>
            Become Ambassador <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );

  if (variant === 'premium') return (
    <div className="rounded-2xl overflow-hidden my-6" style={{
      background: 'linear-gradient(135deg,#0a0f0a 0%,#061212 100%)',
      border: '1px solid rgba(16,185,129,.4)',
    }}>
      <div className="px-5 py-4 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#059669,#0891b2)' }}>
          <BarChart2 className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-0.5">📊 VEDD AI Trading Platform</p>
          <p className="text-sm font-bold text-white">Live signals · Auto strategy · MT5 sync</p>
          <p className="text-xs text-gray-400 mt-0.5">Join 5,000+ traders using VEDD AI for consistent weekly profits</p>
        </div>
        <Link href={signupUrl}>
          <Button size="sm" className="flex-shrink-0 text-xs font-bold" style={{ background: 'linear-gradient(135deg,#059669,#0891b2)' }}>
            Start Free Trial <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );

  // broker
  return (
    <div className="rounded-2xl overflow-hidden my-6" style={{
      background: 'linear-gradient(135deg,#0a0a14 0%,#0f0a05 100%)',
      border: '1px solid rgba(245,158,11,.35)',
    }}>
      <div className="flex items-center gap-2 px-4 py-1.5" style={{ background: 'rgba(245,158,11,.08)', borderBottom: '1px solid rgba(245,158,11,.2)' }}>
        <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">Sponsored · Partner Broker</span>
      </div>
      <div className="px-5 py-4 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#d97706,#b45309)' }}>
          <DollarSign className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm font-bold text-white">Trade with a VEDD-verified broker</p>
          <p className="text-xs text-gray-400 mt-0.5">Tight spreads · Instant execution · Regulated & trusted</p>
        </div>
        <Link href={signupUrl}>
          <Button size="sm" className="flex-shrink-0 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white">
            Open Account <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Monetization: Content Gate ───────────────────────────────────────────────
function ContentGate({ referralCode }: { referralCode?: string | null }) {
  const signupUrl = referralCode ? `/auth?ref=${referralCode}` : '/auth';
  return (
    <div className="relative -mt-8 pt-16 pb-6 px-4 rounded-b-xl text-center" style={{
      background: 'linear-gradient(to bottom, transparent 0%, rgba(8,8,18,.95) 40%, rgba(8,8,18,1) 100%)',
    }}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'linear-gradient(135deg,#dc2626,#7c3aed)' }}>
        <Lock className="h-5 w-5 text-white" />
      </div>
      <h4 className="text-lg font-bold text-white mb-1">Continue Reading — Free</h4>
      <p className="text-sm text-gray-400 mb-4 max-w-xs mx-auto">Create your free VEDD account to read full articles, access AI signals, and join the trading community.</p>
      <Link href={signupUrl}>
        <Button className="text-sm font-bold px-6" style={{ background: 'linear-gradient(135deg,#dc2626,#7c3aed)' }}>
          Sign Up Free <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </Link>
      <p className="text-xs text-gray-600 mt-2">No credit card required · Takes 30 seconds</p>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function NewsletterForm({ referralCode, sourceSlug }: { referralCode?: string | null; sourceSlug?: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const subscribe = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/blog/newsletter/subscribe', { email, referralCode, sourceSlug });
      return res.json();
    },
    onSuccess: () => { setState('success'); trackReward('newsletter_subscribe'); },
    onError: (err: any) => { setState('error'); setErrorMsg(err?.message || 'Something went wrong — try again.'); },
  });

  if (state === 'success') {
    return (
      <p className="text-xs text-emerald-400 flex items-center gap-1.5">
        <Check className="h-3.5 w-3.5" /> You're in! Watch your inbox for market insights.
      </p>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => { e.preventDefault(); if (email.trim()) subscribe.mutate(); }}
    >
      <Input
        type="email"
        required
        placeholder="you@email.com"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setState('idle'); }}
        className="h-8 text-xs bg-black/30 border-gray-600"
      />
      <Button type="submit" size="sm" disabled={subscribe.isPending} variant="outline"
        className="w-full text-xs border-gray-600 hover:border-red-600 hover:text-red-400">
        {subscribe.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Mail className="h-3 w-3 mr-1" />}
        Subscribe Free
      </Button>
      {state === 'error' && <p className="text-[10px] text-red-400">{errorMsg}</p>}
    </form>
  );
}

function Sidebar({ posts, referralCode, activeCategory, onCategory, sourceSlug }: {
  posts: BlogPost[]; referralCode?: string | null;
  activeCategory: string; onCategory: (c: string) => void;
  sourceSlug?: string;
}) {
  const signupUrl = referralCode ? `/auth?ref=${referralCode}` : '/auth';

  // Trending = highest viewCount
  const trending = [...posts].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0)).slice(0, 4);

  // Tag cloud
  const tagCounts: Record<string, number> = {};
  posts.forEach(p => (p.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t);

  return (
    <div className="space-y-6">
      {/* Join VEDD CTA */}
      <div className="rounded-2xl overflow-hidden" style={{
        background: 'linear-gradient(135deg,#0a0a14 0%,#12060a 100%)',
        border: '1px solid rgba(220,38,38,.4)',
      }}>
        <div className="px-4 pt-4 pb-2 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: 'linear-gradient(135deg,#dc2626,#7c3aed)' }}>
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h3 className="text-base font-black text-white mb-1">Trade smarter with AI</h3>
          <p className="text-xs text-gray-400 mb-3">Live signals · Weekly plans · MT5 sync · Ambassador rewards</p>
          <Link href={signupUrl}>
            <Button size="sm" className="w-full font-bold text-xs" style={{ background: 'linear-gradient(135deg,#dc2626,#7c3aed)' }}>
              Join VEDD Free <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
        {referralCode && (
          <div className="px-4 py-2 text-center" style={{ borderTop: '1px solid rgba(220,38,38,.15)', background: 'rgba(16,185,129,.06)' }}>
            <p className="text-[10px] text-emerald-400">🔗 Ref code: <span className="font-mono font-bold">{referralCode}</span></p>
          </div>
        )}
      </div>

      {/* Newsletter capture */}
      <div className="rounded-2xl p-4 space-y-3" style={{
        background: 'rgba(255,255,255,.03)',
        border: '1px solid rgba(255,255,255,.08)',
      }}>
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-red-400" />
          <h3 className="text-sm font-bold text-white">Trading Alerts</h3>
        </div>
        <p className="text-xs text-gray-400">Get AI market insights & article drops delivered weekly.</p>
        <NewsletterForm referralCode={referralCode} sourceSlug={sourceSlug} />
      </div>

      {/* Categories */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
          <Tag className="h-3 w-3" /> Categories
        </h3>
        <div className="space-y-1">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => onCategory(cat)}
              className={`w-full text-left text-sm px-3 py-1.5 rounded-lg flex items-center justify-between transition-all ${
                activeCategory === cat ? 'text-white font-semibold' : 'text-gray-400 hover:text-white'
              }`}
              style={activeCategory === cat ? { background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.35)' } : { background: 'transparent', border: '1px solid transparent' }}
            >
              {cat}
              <span className="text-xs text-gray-600">
                {cat === 'All' ? posts.length : posts.filter(p => p.category?.toLowerCase().includes(cat.toLowerCase())).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Trending posts */}
      {trending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" /> Trending
          </h3>
          <div className="space-y-3">
            {trending.map((p, i) => (
              <div key={p.id} className="flex gap-2.5 items-start group cursor-pointer"
                onClick={() => document.getElementById(`post-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white mt-0.5"
                  style={{ background: i === 0 ? 'linear-gradient(135deg,#dc2626,#7c3aed)' : 'rgba(255,255,255,.08)' }}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-300 group-hover:text-white transition-colors leading-snug line-clamp-2">{p.title}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5 flex items-center gap-1">
                    <Eye className="h-2.5 w-2.5" /> {p.viewCount ?? 0}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tag cloud */}
      {topTags.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Popular Tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {topTags.map(tag => (
              <span key={tag} className="text-[10px] text-gray-400 bg-gray-800/60 hover:bg-red-900/20 hover:text-red-400 border border-gray-700 hover:border-red-800 px-2 py-0.5 rounded-full cursor-pointer transition-colors">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Leaderboard teaser */}
      <div className="rounded-2xl p-4 space-y-3" style={{
        background: 'linear-gradient(135deg,rgba(245,158,11,.08),rgba(220,38,38,.08))',
        border: '1px solid rgba(245,158,11,.25)',
      }}>
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white">Ambassador Leaderboard</h3>
        </div>
        <p className="text-xs text-gray-400">Top ambassadors earn up to $5,000/month sharing content like this.</p>
        <Link href={signupUrl}>
          <Button size="sm" className="w-full text-xs bg-amber-600/80 hover:bg-amber-600 text-white font-bold">
            View Rankings
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Hero Post ────────────────────────────────────────────────────────────────
function HeroPost({ post, isAdmin, isAmbassador, referralCode, onDelete, onTogglePublish, onToggleFeature, onRead }: {
  post: BlogPost; isAdmin: boolean; isAmbassador: boolean; referralCode?: string | null;
  onDelete: (id: number) => void; onTogglePublish: (id: number) => void;
  onToggleFeature: (id: number) => void; onRead: (post: BlogPost) => void;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const cs = catStyle(post.category);

  return (
    <div id={`post-${post.id}`} className="relative rounded-2xl overflow-hidden group cursor-pointer mb-8"
      style={{ border: '1px solid rgba(220,38,38,.3)', minHeight: 320 }}
      onClick={() => onRead(post)}>
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${coverGradient(post.id)} opacity-70`} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.95) 0%, rgba(0,0,0,.4) 60%, transparent 100%)' }} />

      {/* Featured badge */}
      <div className="absolute top-4 left-4 flex gap-2 z-10">
        <span className="text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest" style={{ background: 'linear-gradient(135deg,#dc2626,#7c3aed)', color: 'white' }}>
          ⭐ Featured
        </span>
        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: cs.bg, color: cs.text, border: `1px solid ${cs.border}` }}>
          {post.category}
        </span>
      </div>

      {/* Admin controls */}
      {isAdmin && (
        <div className="absolute top-4 right-4 flex gap-1 z-10" onClick={e => e.stopPropagation()}>
          <button onClick={() => onTogglePublish(post.id)} className="p-1.5 rounded-lg bg-black/50 text-blue-400 hover:bg-black/70 transition-colors">
            {post.isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => onToggleFeature(post.id)} className="p-1.5 rounded-lg bg-black/50 text-yellow-400 hover:bg-black/70 transition-colors">
            <Star className={`h-3.5 w-3.5 ${post.isFeatured ? 'fill-yellow-400' : ''}`} />
          </button>
          <button onClick={() => { if(confirm('Delete?')) onDelete(post.id); }} className="p-1.5 rounded-lg bg-black/50 text-red-400 hover:bg-black/70 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 p-6 mt-16">
        <h2 className="text-2xl md:text-3xl font-black text-white leading-tight mb-3 group-hover:text-red-200 transition-colors">
          {post.title}
        </h2>
        <p className="text-gray-300 text-sm leading-relaxed mb-4 max-w-2xl">{post.excerpt}</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(post.publishedAt || post.createdAt)}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{post.readTime}</span>
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{post.viewCount ?? 0}</span>
          </div>
          <div className="flex items-center gap-2 ml-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShareOpen(s => !s)} className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-900/10 transition-all">
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
            <button onClick={() => onRead(post)} className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all"
              style={{ background: 'linear-gradient(135deg,#dc2626,#7c3aed)', color: 'white' }}>
              <BookOpen className="h-3 w-3" /> Read Now
            </button>
          </div>
        </div>
        {shareOpen && (
          <div onClick={e => e.stopPropagation()}>
            <SharePanel post={post} referralCode={referralCode} onClose={() => setShareOpen(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────
function PostCard({ post, isAdmin, isAmbassador, referralCode, onDelete, onTogglePublish, onToggleFeature, onRead }: {
  post: BlogPost; isAdmin: boolean; isAmbassador: boolean; referralCode?: string | null;
  onDelete: (id: number) => void; onTogglePublish: (id: number) => void;
  onToggleFeature: (id: number) => void; onRead: (post: BlogPost) => void;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const cs = catStyle(post.category);

  return (
    <motion.div id={`post-${post.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden flex flex-col group cursor-pointer h-full"
      style={{ background: 'rgba(8,8,18,.8)', border: '1px solid rgba(255,255,255,.07)' }}
      onClick={() => onRead(post)}
      whileHover={{ borderColor: 'rgba(220,38,38,.4)', y: -2 }}
      transition={{ duration: 0.2 }}>
      {/* Cover */}
      <div className={`h-40 bg-gradient-to-br ${coverGradient(post.id)} relative flex-shrink-0 overflow-hidden`}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 50%, rgba(8,8,18,.9) 100%)' }} />
        {isAdmin && (
          <div className="absolute top-2 right-2 flex gap-1 z-10" onClick={e => e.stopPropagation()}>
            <button onClick={() => onTogglePublish(post.id)} className="p-1 rounded bg-black/60 text-blue-400"><Globe className="h-3 w-3" /></button>
            <button onClick={() => onToggleFeature(post.id)} className="p-1 rounded bg-black/60 text-yellow-400"><Star className={`h-3 w-3 ${post.isFeatured ? 'fill-yellow-400' : ''}`} /></button>
            <button onClick={() => { if(confirm('Delete?')) onDelete(post.id); }} className="p-1 rounded bg-black/60 text-red-400"><Trash2 className="h-3 w-3" /></button>
          </div>
        )}
        {!post.isPublished && isAdmin && (
          <span className="absolute top-2 left-2 text-[9px] font-bold bg-orange-500/80 text-white px-2 py-0.5 rounded">DRAFT</span>
        )}
        <div className="absolute bottom-2 left-3">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: cs.bg, color: cs.text, border: `1px solid ${cs.border}` }}>
            {post.category}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-2">
          {post.aiGenerated && <span className="text-[9px] font-bold text-purple-400 bg-purple-900/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Sparkles className="h-2.5 w-2.5" />AI</span>}
          {post.isFeatured && <span className="text-[9px] font-bold text-yellow-400 bg-yellow-900/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Star className="h-2.5 w-2.5" />Featured</span>}
          <span className="ml-auto text-[10px] text-gray-600 flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{post.viewCount ?? 0}</span>
        </div>

        <h3 className="text-sm font-bold text-white leading-snug mb-2 group-hover:text-red-300 transition-colors line-clamp-2">{post.title}</h3>
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-3 flex-1">{post.excerpt}</p>

        <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
          <div className="flex items-center gap-2 text-[10px] text-gray-600 flex-1 min-w-0">
            <span className="flex items-center gap-0.5 truncate"><Calendar className="h-2.5 w-2.5 flex-shrink-0" />{fmtDate(post.publishedAt || post.createdAt)}</span>
            <span className="flex items-center gap-0.5 flex-shrink-0"><Clock className="h-2.5 w-2.5" />{post.readTime}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShareOpen(s => !s)} className={`p-1.5 rounded-lg transition-all ${shareOpen ? 'text-red-400 bg-red-900/20' : 'text-gray-600 hover:text-red-400 hover:bg-red-900/10'}`}>
              <Share2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onRead(post)} className="text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-0.5 transition-all"
              style={{ background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.3)', color: '#f87171' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,.3)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,.15)'; }}>
              Read <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {shareOpen && (
          <div onClick={e => e.stopPropagation()}>
            <SharePanel post={post} referralCode={referralCode} onClose={() => setShareOpen(false)} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Full Article Reader ───────────────────────────────────────────────────────
function ArticleReader({ post, isLoggedIn, referralCode, onClose, onShare, allPosts = [], onOpenArticle }: {
  post: BlogPost; isLoggedIn: boolean; referralCode?: string | null;
  onClose: () => void; onShare: () => void;
  allPosts?: BlogPost[]; onOpenArticle?: (post: BlogPost) => void;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const cs = catStyle(post.category);
  const plain = stripHtml(post.content || '');
  const previewWords = plain.split(' ').slice(0, 80).join(' ') + '…';

  // Scroll-depth capture — a second, less-naggy newsletter prompt for
  // logged-out readers who are clearly engaged (past ~55% of the article)
  // but haven't hit the ContentGate paywall trigger yet. Dismissible, shows
  // once per article view, never on top of the sidebar form.
  const readerScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollCapture, setShowScrollCapture] = useState(false);
  const [scrollCaptureDismissed, setScrollCaptureDismissed] = useState(false);
  useEffect(() => {
    if (isLoggedIn) return;
    const el = readerScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (scrollCaptureDismissed || showScrollCapture) return;
      const depth = (el.scrollTop + el.clientHeight) / el.scrollHeight;
      if (depth >= 0.55) setShowScrollCapture(true);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [isLoggedIn, scrollCaptureDismissed, showScrollCapture]);

  const related = allPosts
    .filter(p => p.id !== post.id)
    .map(p => ({ p, score: p.category === post.category ? 2 : (p.tags || []).some(t => (post.tags || []).includes(t)) ? 1 : 0 }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(x => x.p);

  return (
    <div ref={readerScrollRef} className="fixed inset-0 z-[9999] overflow-y-auto" style={{ background: 'rgba(0,0,0,.85)', backdropFilter: 'blur(6px)' }}>
      <div className="min-h-screen flex flex-col">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3" style={{ background: 'rgba(8,8,18,.95)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 truncate">{post.title}</p>
          </div>
          <button onClick={() => setShareOpen(s => !s)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-400 transition-colors">
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>

        <div className="max-w-3xl mx-auto w-full px-4 py-8 flex-1">
          {/* Hero cover — generated image when present, gradient fallback otherwise */}
          <div className={`rounded-2xl h-48 md:h-64 mb-6 flex items-center justify-center relative overflow-hidden ${post.coverImage ? 'bg-black/40' : `bg-gradient-to-br ${coverGradient(post.id)}`}`}>
            {post.coverImage && (
              <img
                src={post.coverImage}
                alt={post.title}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,.1) 100%)' }} />
            <span className="relative z-10 text-[10px] font-bold px-3 py-1 rounded-full" style={{ background: cs.bg, color: cs.text, border: `1px solid ${cs.border}` }}>
              {post.category}
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-2xl md:text-3xl font-black text-white leading-tight mb-3">{post.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-6 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(post.publishedAt || post.createdAt)}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{post.readTime}</span>
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{post.viewCount ?? 0} views</span>
            <span className="text-gray-700">by {post.authorName}</span>
            {post.aiGenerated && <span className="text-purple-400 flex items-center gap-1"><Sparkles className="h-3 w-3" />AI Generated</span>}
          </div>

          {/* Inline VEDD reward banner */}
          {isLoggedIn && (
            <div className="flex items-center gap-3 rounded-xl px-4 py-2.5 mb-6" style={{ background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.2)' }}>
              <Award className="h-4 w-4 text-red-400 flex-shrink-0" />
              <p className="text-xs text-gray-300 flex-1">Share this article with your referral link to earn <span className="text-red-400 font-bold">+50 VEDD tokens</span></p>
              <button onClick={() => setShareOpen(true)} className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1">
                Share <Share2 className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Article body */}
          {isLoggedIn ? (
            <>
              <ArticleContent
                html={post.content}
                referralCode={referralCode}
                className="prose prose-invert max-w-none prose-p:text-gray-300 prose-li:text-gray-300 prose-headings:text-white prose-strong:text-white prose-a:text-red-400 prose-code:text-red-300 text-gray-300"
              />
              {/* Inline ad after content */}
              <InlineAdBanner referralCode={referralCode} variant="ambassador" />
            </>
          ) : (
            <>
              <div className="prose prose-invert max-w-none prose-p:text-gray-300">
                <p className="text-gray-300">{previewWords}</p>
              </div>
              <ContentGate referralCode={referralCode} />
            </>
          )}

          {/* Tags */}
          {post.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-6 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
              {post.tags.map(t => (
                <span key={t} className="text-[11px] text-gray-500 bg-gray-800/60 border border-gray-700 px-2 py-0.5 rounded-full">#{t}</span>
              ))}
            </div>
          )}

          {/* Related articles */}
          {related.length > 0 && (
            <div className="mt-8 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><BookOpen className="h-4 w-4 text-red-400" /> Keep Reading</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {related.map(rp => (
                  <button key={rp.id} onClick={() => onOpenArticle?.(rp)}
                    className="text-left rounded-xl p-3 transition-all hover:border-red-700/50"
                    style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: catStyle(rp.category).bg, color: catStyle(rp.category).text }}>
                      {rp.category}
                    </span>
                    <p className="text-xs font-semibold text-white mt-2 leading-snug line-clamp-2">{rp.title}</p>
                    <p className="text-[10px] text-gray-500 mt-1.5 flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{rp.readTime}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom share */}
          <div className="mt-8 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Share2 className="h-4 w-4 text-red-400" /> Enjoyed this article?</h3>
            {shareOpen ? (
              <SharePanel post={post} referralCode={referralCode} onClose={() => setShareOpen(false)} />
            ) : (
              <Button size="sm" onClick={() => setShareOpen(true)} variant="outline" className="text-xs border-red-800 text-red-400 hover:bg-red-900/20">
                <Share2 className="h-3.5 w-3.5 mr-1.5" /> Share with your referral link
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Scroll-depth newsletter capture — engaged logged-out readers only */}
      <AnimatePresence>
        {showScrollCapture && !scrollCaptureDismissed && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-[10000] px-4 pb-4"
          >
            <div className="max-w-md mx-auto rounded-2xl p-4 flex items-start gap-3" style={{
              background: 'rgba(10,10,20,.97)', border: '1px solid rgba(220,38,38,.35)', backdropFilter: 'blur(8px)',
              boxShadow: '0 -8px 30px rgba(0,0,0,.5)',
            }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#dc2626,#7c3aed)' }}>
                <Bell className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">Enjoying this? Get more like it.</p>
                <p className="text-xs text-gray-400 mt-0.5 mb-2">AI market insights & article drops, weekly. No spam.</p>
                <NewsletterForm referralCode={referralCode} sourceSlug={post.slug} />
              </div>
              <button onClick={() => setScrollCaptureDismissed(true)} className="text-gray-500 hover:text-gray-300 shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Generate Dialog ──────────────────────────────────────────────────────────
function GenerateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState('');
  const [generated, setGenerated] = useState<GeneratedPost | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editExcerpt, setEditExcerpt] = useState('');
  const [editCategory, setEditCategory] = useState('');

  const generateMutation = useMutation({
    mutationFn: async (t?: string) => {
      const res = await apiRequest('POST', '/api/blog/generate', { topic: t || undefined });
      return res.json();
    },
    onSuccess: (data: { post: GeneratedPost }) => {
      setGenerated(data.post); setEditTitle(data.post.title);
      setEditExcerpt(data.post.excerpt); setEditCategory(data.post.category); setEditMode(false);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (publish: boolean) => {
      if (!generated) return;
      const payload = {
        ...(editMode ? { ...generated, title: editTitle, excerpt: editExcerpt, category: editCategory } : generated),
        isPublished: publish, isFeatured: false, aiGenerated: true,
        publishedAt: publish ? new Date().toISOString() : null,
      };
      const res = await apiRequest('POST', '/api/blog', payload);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/blog'] }); setGenerated(null); setTopic(''); onOpenChange(false); },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-950 border border-gray-800 text-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-red-400" /> Generate AI Blog Post
          </DialogTitle>
          <DialogDescription className="text-gray-400">Let VEDD AI write a branded trading article.</DialogDescription>
        </DialogHeader>

        {!generated ? (
          <div className="space-y-4 mt-2">
            <Input value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="Leave blank to let AI pick a hot market topic"
              className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
              disabled={generateMutation.isPending} />
            <div className="flex flex-wrap gap-2">
              {TOPIC_CHIPS.map(chip => (
                <button key={chip} type="button" onClick={() => setTopic(chip)} disabled={generateMutation.isPending}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${topic === chip ? 'bg-red-900/50 border-red-600 text-red-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-red-700 hover:text-red-400'}`}>
                  {chip}
                </button>
              ))}
            </div>
            {generateMutation.isError && <p className="text-red-400 text-sm">Error: {(generateMutation.error as Error).message}</p>}
            <Button onClick={() => generateMutation.mutate(topic || undefined)} disabled={generateMutation.isPending}
              className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white">
              {generateMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />AI is writing...</> : <><Sparkles className="h-4 w-4 mr-2" />Generate Post</>}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
              {editMode ? (
                <>
                  <div><label className="block text-xs text-gray-400 mb-1">Title</label><Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="bg-gray-800 border-gray-600 text-white" /></div>
                  <div><label className="block text-xs text-gray-400 mb-1">Excerpt</label><Textarea value={editExcerpt} onChange={e => setEditExcerpt(e.target.value)} className="bg-gray-800 border-gray-600 text-white" rows={2} /></div>
                  <div><label className="block text-xs text-gray-400 mb-1">Category</label><Input value={editCategory} onChange={e => setEditCategory(e.target.value)} className="bg-gray-800 border-gray-600 text-white" /></div>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-bold text-white">{generated.title}</h3>
                  <p className="text-gray-400 text-sm">{generated.excerpt}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                    <span className="bg-red-900/20 text-red-400 px-2 py-0.5 rounded">{generated.category}</span>
                    <span>{generated.readTime}</span>
                    {generated.tags?.map(t => <span key={t} className="bg-gray-800 px-2 py-0.5 rounded">#{t}</span>)}
                  </div>
                </>
              )}
              <div className="border-t border-gray-700 pt-3">
                <p className="text-xs text-gray-500 mb-2 italic">Context: {generated.currentEventsContext}</p>
                <div className="prose prose-invert prose-sm max-w-none prose-p:text-gray-300 prose-headings:text-white max-h-64 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: generated.content }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditMode(!editMode)} className="border-gray-600 text-gray-300 hover:bg-gray-800">
                <Edit className="h-4 w-4 mr-1" />{editMode ? 'Done' : 'Edit'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setGenerated(null); generateMutation.mutate(topic || undefined); }}
                disabled={generateMutation.isPending || saveMutation.isPending} className="border-gray-600 text-gray-300 hover:bg-gray-800">
                <RefreshCw className="h-4 w-4 mr-1" />Regenerate
              </Button>
              <Button size="sm" onClick={() => saveMutation.mutate(false)} disabled={saveMutation.isPending} className="bg-gray-700 hover:bg-gray-600 text-white ml-auto">
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save as Draft'}
              </Button>
              <Button size="sm" onClick={() => saveMutation.mutate(true)} disabled={saveMutation.isPending}
                className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white">
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Globe className="h-4 w-4 mr-1" />Publish Now</>}
              </Button>
            </div>
            {saveMutation.isError && <p className="text-red-400 text-sm">Save error: {(saveMutation.error as Error).message}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Blog Page ────────────────────────────────────────────────────────────
export default function BlogPage() {
  const { user } = useAuth();
  const isAdmin      = !!(user as any)?.isAdmin;
  const isAmbassador = !!(user as any)?.isAmbassador;
  const isLoggedIn   = !!user;
  const queryClient  = useQueryClient();

  const { data: referralData } = useQuery<{ code: string; url: string; shortUrl: string }>({
    queryKey: ['/api/referral/my-link'],
    enabled: !!user,
  });

  // An anonymous visitor who arrives via a shared article link
  // (/blog/:slug?ref=CODE) previously had that code silently dropped — the
  // page never read it, so their eventual signup never credited whoever
  // shared the article. Capture it the same way auth-page.tsx does for
  // /auth?ref=, so a later signup click still carries it.
  const [incomingRefCode, setIncomingRefCode] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const stored = sessionStorage.getItem('referralCode');
    const code = ref || stored;
    if (code) {
      sessionStorage.setItem('referralCode', code);
      setIncomingRefCode(code);
      if (ref) fetch('/api/referral/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralCode: code }),
      }).catch(() => {});
    }
  }, []);

  const signupUrl = referralData?.url ?? (incomingRefCode ? `${window.location.origin}/auth?ref=${incomingRefCode}` : '/auth');
  // Every card/reader/share component below reads `referralCode` — it was
  // never derived from referralData, so any render path touching it crashed
  // the whole page with "referralCode is not defined" (this is exactly the
  // "something went wrong" screen users were hitting on /blog). Prefer the
  // logged-in ambassador's own code (for outbound shares); fall back to
  // whatever code brought this (anonymous) visitor here, so the signup CTA
  // still credits the original sharer.
  const referralCode: string | null = referralData?.code ?? incomingRefCode;

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [activeCategory, setActiveCategory]         = useState('All');
  const [readingPost,    setReadingPost]             = useState<BlogPost | null>(null);

  // Real per-article route (/blog/:slug) so articles are deep-linkable,
  // bookmarkable, and crawlable instead of living only in React state.
  const params                = useParams<{ slug?: string }>();
  const slug                  = params?.slug;
  const [, setLocation]       = useLocation();

  const { data: posts = [], isLoading, isError } = useQuery<BlogPost[]>({
    queryKey: ['/api/blog'],
    queryFn: async () => { const res = await apiRequest('GET', '/api/blog'); return res.json(); },
  });

  // Resolve the article for a direct /blog/:slug visit via the single-post
  // endpoint (also increments its view count) rather than relying on it
  // already being present in the listing query.
  const { data: slugPost } = useQuery<BlogPost>({
    queryKey: ['/api/blog/slug', slug],
    queryFn: async () => { const res = await apiRequest('GET', `/api/blog/${slug}`); return res.json(); },
    enabled: !!slug,
  });

  useEffect(() => {
    if (slug && slugPost) {
      setReadingPost(slugPost);
      document.title = `${slugPost.title} | VEDD Trading AI`;
    } else if (!slug) {
      setReadingPost(null);
      document.title = 'VEDD AI Trading Vault | Blog';
    }
  }, [slug, slugPost]);

  const openArticle = (post: BlogPost) => setLocation(`/blog/${post.slug}`);
  const closeArticle = () => setLocation('/blog');

  const deleteMutation      = useMutation({ mutationFn: async (id: number) => { await apiRequest('DELETE', `/api/blog/${id}`); }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/blog'] }) });
  const togglePublishMut    = useMutation({ mutationFn: async (id: number) => { const r = await apiRequest('PATCH', `/api/blog/${id}/publish`); return r.json(); }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/blog'] }) });
  const toggleFeatureMut    = useMutation({ mutationFn: async (id: number) => { const r = await apiRequest('PATCH', `/api/blog/${id}/feature`); return r.json(); }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/blog'] }) });

  // Category filter
  const filteredPosts = activeCategory === 'All'
    ? posts
    : posts.filter(p => p.category?.toLowerCase().includes(activeCategory.toLowerCase()));

  const featuredPost  = filteredPosts.find(p => p.isFeatured) || filteredPosts[0];
  const gridPosts     = featuredPost ? filteredPosts.filter(p => p.id !== featuredPost.id) : filteredPosts;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg,#060610 0%,#080812 100%)' }}>
      {/* Full article reader overlay */}
      <AnimatePresence>
        {readingPost && (
          <motion.div key="reader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ArticleReader
              post={readingPost}
              isLoggedIn={isLoggedIn}
              referralCode={referralCode}
              onClose={closeArticle}
              onShare={() => {}}
              allPosts={posts}
              onOpenArticle={openArticle}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Page Header ── */}
      <div className="relative overflow-hidden" style={{ borderBottom: '1px solid rgba(220,38,38,.15)' }}>
        <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(220,38,38,.4), transparent)' }} />
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8 relative">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[.3em] text-red-500 uppercase mb-2 flex items-center gap-1.5">
                <Radio className="h-3 w-3 animate-pulse" /> VEDD Intelligence
              </p>
              <h1 className="text-3xl md:text-5xl font-black text-white">
                Trading{' '}
                <span style={{ background: 'linear-gradient(90deg,#ef4444,#a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Insights
                </span>
              </h1>
              <p className="text-gray-400 mt-2 max-w-lg">AI-powered market analysis, strategies, and intelligence to maximize your trading edge.</p>
            </div>
            {isAdmin && (
              <Button onClick={() => setGenerateDialogOpen(true)}
                className="flex-shrink-0 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-700 hover:to-rose-800 text-white shadow-lg shadow-red-500/30 px-5">
                <Sparkles className="mr-2 h-4 w-4" /> Generate AI Post
              </Button>
            )}
          </div>

          {/* Category tabs */}
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                  activeCategory === cat
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white bg-white/5 hover:bg-white/10'
                }`}
                style={activeCategory === cat ? { background: 'linear-gradient(135deg,#dc2626,#7c3aed)', border: 'none' } : { border: '1px solid rgba(255,255,255,.08)' }}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {isLoading && (
          <div className="flex justify-center items-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-red-400" />
          </div>
        )}

        {isError && (
          <div className="text-center py-16 text-gray-500">
            <p>Failed to load articles. Please try again later.</p>
          </div>
        )}

        {!isLoading && !isError && posts.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No articles published yet. Check back soon!</p>
          </div>
        )}

        {!isLoading && !isError && posts.length > 0 && (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Main column */}
            <div className="flex-1 min-w-0">
              {/* Featured / Hero post */}
              {featuredPost && (
                <HeroPost
                  post={featuredPost}
                  isAdmin={isAdmin} isAmbassador={isAmbassador} referralCode={referralCode}
                  onDelete={id => { if(confirm('Delete?')) deleteMutation.mutate(id); }}
                  onTogglePublish={id => togglePublishMut.mutate(id)}
                  onToggleFeature={id => toggleFeatureMut.mutate(id)}
                  onRead={openArticle}
                />
              )}

              {/* Post grid */}
              {gridPosts.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {gridPosts.map((post, idx) => (
                    <React.Fragment key={post.id}>
                      <PostCard
                        post={post} isAdmin={isAdmin} isAmbassador={isAmbassador} referralCode={referralCode}
                        onDelete={id => { if(confirm('Delete?')) deleteMutation.mutate(id); }}
                        onTogglePublish={id => togglePublishMut.mutate(id)}
                        onToggleFeature={id => toggleFeatureMut.mutate(id)}
                        onRead={openArticle}
                      />
                      {/* Inject ad banners after every 4 posts */}
                      {(idx + 1) % 4 === 0 && idx < gridPosts.length - 1 && (
                        <div className="sm:col-span-2">
                          <InlineAdBanner referralCode={referralCode} variant={idx % 8 === 3 ? 'ambassador' : idx % 8 === 7 ? 'premium' : 'broker'} />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Bottom CTA */}
              <div className="mt-12 rounded-2xl p-8 text-center" style={{
                background: 'linear-gradient(135deg,#0a0a14 0%,#12060a 100%)',
                border: '1px solid rgba(220,38,38,.3)',
              }}>
                <h2 className="text-2xl font-black text-white mb-2">Ready to Elevate Your Trading?</h2>
                <p className="text-gray-400 text-sm mb-4 max-w-md mx-auto">Join thousands of traders using VEDD AI for consistent profits — live signals, auto-strategy, and community.</p>
                {referralCode && (
                  <p className="text-xs text-emerald-400 mb-4">
                    🔗 Ref code <span className="font-mono font-bold">{referralCode}</span> applied automatically
                  </p>
                )}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href={signupUrl}>
                    <Button size="lg" className="font-bold" style={{ background: 'linear-gradient(135deg,#dc2626,#7c3aed)' }}>
                      Join VEDD Free <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                  <EarlyAccessForm />
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="w-full lg:w-72 flex-shrink-0">
              <div className="sticky top-4">
                <Sidebar
                  posts={posts} referralCode={referralCode}
                  activeCategory={activeCategory} onCategory={setActiveCategory}
                  sourceSlug={slug}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <GenerateDialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen} />
    </div>
  );
}
