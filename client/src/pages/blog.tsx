import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'wouter';
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
  ArrowRight,
  Calendar,
  Clock,
  Eye,
  Sparkles,
  Trash2,
  Edit,
  Star,
  Globe,
  EyeOff,
  RefreshCw,
  Loader2,
  Share2,
  Copy,
  Check,
  X,
  Radio,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';

/** Fire-and-forget VEDD reward tracker */
async function trackReward(actionType: string, actionId?: number) {
  try {
    await apiRequest('POST', '/api/vedd/track', { actionType, actionId });
  } catch { /* non-fatal */ }
}

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Topic Suggestion Chips ──────────────────────────────────────────────────

const TOPIC_CHIPS = [
  'Forex volatility',
  'Crypto bull run',
  'Fed interest rates',
  'Gold trading',
  'AI in trading',
  'VEDD Ambassador',
  'Passive income strategies',
];

// ─── Share Panel ─────────────────────────────────────────────────────────────

/** Strip HTML tags from AI-generated content to get plain text for share messages */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Truncate plain text to a max length, ending at a word boundary */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

// ─── Breaking News Card (share image preview) ────────────────────────────────

function BreakingNewsCard({
  post,
  referralCode,
}: {
  post: BlogPost;
  referralCode?: string | null;
}) {
  const signupUrl = referralCode
    ? `${window.location.origin}/auth?ref=${referralCode}`
    : `${window.location.origin}/auth`;
  const plainContent = stripHtml(post.content || '');
  const snippet = truncate(post.excerpt || truncate(plainContent, 160), 160);

  return (
    <div
      className="rounded-xl overflow-hidden select-none"
      style={{
        background: 'linear-gradient(135deg, #0a0a0f 0%, #12060a 60%, #0f0a1a 100%)',
        border: '2px solid rgba(220,38,38,0.7)',
        boxShadow: '0 0 24px rgba(220,38,38,0.25), inset 0 0 40px rgba(0,0,0,0.4)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* BREAKING NEWS bar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5"
        style={{ background: 'linear-gradient(90deg, #dc2626 0%, #b91c1c 100%)' }}
      >
        <span
          className="text-[9px] font-black tracking-[0.3em] uppercase text-white animate-pulse"
          style={{ letterSpacing: '0.3em' }}
        >
          ● BREAKING NEWS
        </span>
        <span className="ml-auto text-[9px] text-red-200 font-mono opacity-80">
          VEDD AI TRADING
        </span>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-2">
        {/* VEDD logo row */}
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #dc2626, #7c3aed)', border: '1px solid rgba(220,38,38,0.5)' }}
          >
            <span className="text-[8px] font-black text-white">V</span>
          </div>
          <span className="text-[10px] font-bold tracking-widest text-red-400 uppercase">VEDD · Trading Intelligence</span>
        </div>

        {/* Headline */}
        <h3 className="text-sm font-extrabold text-white leading-snug" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
          📈 {post.title}
        </h3>

        {/* Divider */}
        <div className="h-px" style={{ background: 'linear-gradient(90deg, #dc2626 0%, transparent 100%)' }} />

        {/* Snippet */}
        <p className="text-[11px] text-gray-300 leading-relaxed">{snippet}</p>

        {/* CTA */}
        <div
          className="rounded-lg px-3 py-2 mt-1"
          style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.35)' }}
        >
          <p className="text-[10px] text-gray-400 mb-0.5">🔗 Join VEDD AI Trading now →</p>
          <p
            className="text-[11px] font-bold text-red-400 break-all"
            style={{ wordBreak: 'break-all' }}
          >
            {signupUrl}
          </p>
        </div>

        {referralCode && (
          <p className="text-[9px] text-emerald-400 opacity-75">
            Referral code: <span className="font-mono font-bold">{referralCode}</span>
          </p>
        )}
      </div>

      {/* Footer ticker */}
      <div
        className="px-3 py-1 flex items-center gap-2"
        style={{ background: 'rgba(220,38,38,0.08)', borderTop: '1px solid rgba(220,38,38,0.2)' }}
      >
        <span className="text-[8px] text-gray-600 uppercase tracking-widest">veddbuild.com · AI-Powered Forex & Crypto Trading</span>
      </div>
    </div>
  );
}

// ─── Share Panel ─────────────────────────────────────────────────────────────

function SharePanel({
  post,
  referralCode,
  onClose,
}: {
  post: BlogPost;
  referralCode?: string | null;
  onClose: () => void;
}) {
  const [copiedMsg, setCopiedMsg]     = useState(false);
  const [copiedLink, setCopiedLink]   = useState(false);
  const [copiedBreaking, setCopiedBreaking] = useState(false);
  const [activeTab, setActiveTab]     = useState<'share' | 'breaking'>('breaking');

  const signupUrl = referralCode
    ? `${window.location.origin}/auth?ref=${referralCode}`
    : `${window.location.origin}/auth`;

  const articleUrl = `${window.location.origin}/blog`;
  const readMoreUrl = referralCode
    ? `${articleUrl}?ref=${referralCode}`
    : articleUrl;

  // Build the plain-text excerpt from content or excerpt field
  const plainContent = stripHtml(post.content || '');
  const plainExcerpt = post.excerpt || truncate(plainContent, 220);
  const snippet = truncate(plainExcerpt, 220);

  // Breaking news formatted text (copy-paste ready)
  const breakingText =
    `📡 BREAKING NEWS — VEDD AI Trading\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📈 ${post.title}\n\n` +
    `${truncate(plainExcerpt, 180)}\n\n` +
    `🔗 Join VEDD AI Trading now:\n${signupUrl}\n\n` +
    `#VEDD #Trading #Forex #AI #BreakingNews`;

  // Full rich share message — what the reader will actually see
  const fullMessage =
    `📈 ${post.title}\n\n` +
    `${snippet}\n\n` +
    `Read the full article on VEDD AI Trading 👇\n${readMoreUrl}`;

  // Twitter-friendly version (shorter)
  const twitterSnippet = truncate(plainExcerpt, 120);
  const twitterMessage =
    `📈 ${post.title}\n\n${twitterSnippet}\n\n#VEDD #Trading #Forex`;

  const encodedFull    = encodeURIComponent(fullMessage);
  const encodedUrl     = encodeURIComponent(readMoreUrl);
  const encodedTwitter = encodeURIComponent(twitterMessage);
  const encodedBreaking = encodeURIComponent(breakingText);

  const platforms = [
    {
      name: 'WhatsApp',
      color: 'bg-green-700 hover:bg-green-600',
      emoji: '💬',
      url: `https://wa.me/?text=${activeTab === 'breaking' ? encodedBreaking : encodedFull}`,
    },
    {
      name: 'X / Twitter',
      color: 'bg-gray-800 hover:bg-gray-700 border border-gray-600',
      emoji: '𝕏',
      url: `https://twitter.com/intent/tweet?text=${encodedTwitter}&url=${encodedUrl}`,
    },
    {
      name: 'Facebook',
      color: 'bg-blue-700 hover:bg-blue-600',
      emoji: 'f',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodeURIComponent(activeTab === 'breaking' ? breakingText : fullMessage)}`,
    },
    {
      name: 'LinkedIn',
      color: 'bg-blue-600 hover:bg-blue-500',
      emoji: 'in',
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}&summary=${encodeURIComponent(activeTab === 'breaking' ? breakingText : fullMessage)}`,
    },
  ];

  const copyText = async (text: string, which: 'msg' | 'link' | 'breaking') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    trackReward('blog_share', post.id);
    if (which === 'msg')      { setCopiedMsg(true);      setTimeout(() => setCopiedMsg(false), 2200); }
    if (which === 'link')     { setCopiedLink(true);     setTimeout(() => setCopiedLink(false), 2200); }
    if (which === 'breaking') { setCopiedBreaking(true); setTimeout(() => setCopiedBreaking(false), 2200); }
  };

  const handleSocialClick = () => trackReward('blog_share', post.id);

  return (
    <div className="mt-4 bg-gray-900/90 border border-gray-700 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white flex items-center gap-2">
          <Share2 className="h-4 w-4 text-red-400" />
          Share this article
          {referralCode && (
            <span className="text-xs font-normal text-emerald-400 bg-emerald-900/30 px-2 py-0.5 rounded-full">
              + your ref link
            </span>
          )}
        </p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-800/60 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('breaking')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-md transition-all ${
            activeTab === 'breaking'
              ? 'bg-red-700 text-white shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Radio className="h-3 w-3" /> Breaking News
        </button>
        <button
          onClick={() => setActiveTab('share')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-md transition-all ${
            activeTab === 'share'
              ? 'bg-gray-600 text-white shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Share2 className="h-3 w-3" /> Standard Share
        </button>
      </div>

      {activeTab === 'breaking' ? (
        <>
          {/* Breaking News card preview */}
          <BreakingNewsCard post={post} referralCode={referralCode} />

          {/* Copy breaking news text */}
          <Button
            size="sm"
            onClick={() => copyText(breakingText, 'breaking')}
            className={`w-full text-xs h-9 font-semibold transition-all ${
              copiedBreaking
                ? 'bg-emerald-700 text-white'
                : 'bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-700/50'
            }`}
            variant="outline"
          >
            {copiedBreaking
              ? <><Check className="h-3.5 w-3.5 mr-1.5" /> Breaking News Text Copied!</>
              : <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy Breaking News Caption</>
            }
          </Button>

          <p className="text-[10px] text-gray-500 italic text-center">
            Screenshot the card above + paste the caption — or share directly 👇
          </p>
        </>
      ) : (
        <>
          {/* Standard preview card */}
          <div className="bg-gray-800/70 border border-gray-600/50 rounded-lg p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Preview — what your followers will see</p>
            <p className="text-xs font-bold text-white leading-snug">📈 {post.title}</p>
            <p className="text-xs text-gray-300 leading-relaxed">{snippet}</p>
            <div className="pt-1 border-t border-gray-700/60">
              <p className="text-xs text-gray-400">Read the full article on VEDD AI Trading 👇</p>
              <p className="text-xs text-emerald-400 font-mono truncate mt-0.5">{readMoreUrl}</p>
            </div>
          </div>

          {/* Copy buttons */}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => copyText(fullMessage, 'msg')}
              className={`flex-1 text-xs h-8 transition-all ${
                copiedMsg
                  ? 'bg-emerald-700 text-white border-emerald-600'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600'
              }`}
              variant="outline"
            >
              {copiedMsg ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copiedMsg ? 'Message Copied!' : 'Copy Full Message'}
            </Button>
            <Button
              size="sm"
              onClick={() => copyText(readMoreUrl, 'link')}
              className={`text-xs h-8 transition-all ${
                copiedLink
                  ? 'bg-emerald-700 text-white border-emerald-600'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700'
              }`}
              variant="outline"
              title="Copy link only"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </>
      )}

      {/* Social share buttons — always visible */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {platforms.map((p) => (
          <a
            key={p.name}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleSocialClick}
            className={`${p.color} text-white text-xs font-semibold rounded-lg px-3 py-2.5 text-center transition-colors flex items-center justify-center gap-1.5`}
          >
            <span className="text-sm leading-none">{p.emoji}</span>
            {p.name}
          </a>
        ))}
      </div>

      {referralCode && (
        <p className="text-xs text-gray-500 italic">
          🔗 Code <span className="text-emerald-400 font-mono">{referralCode}</span> is embedded — earn VEDD rewards when someone joins through your link.
        </p>
      )}
    </div>
  );
}

// ─── Article Content — intercepts all link clicks → VEDD sign-up ─────────────

function ArticleContent({
  html,
  referralCode,
  className,
}: {
  html: string;
  referralCode?: string | null;
  className?: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  const signupUrl = referralCode
    ? `${window.location.origin}/auth?ref=${referralCode}`
    : `${window.location.origin}/auth`;

  // After every render, patch all <a> tags so they point to VEDD sign-up
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.querySelectorAll('a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (
        href.startsWith('#') ||
        href === '' ||
        href.includes(window.location.hostname)
      ) {
        // Internal / anchor → sign-up page
        a.setAttribute('href', signupUrl);
        a.removeAttribute('target');
      } else if (href.startsWith('http')) {
        // External → open in new tab AND show sign-up link
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        // Wrap in a parent span with a VEDD sign-up nudge if not already done
        if (!a.dataset.veddPatched) {
          a.dataset.veddPatched = '1';
          // Append a small "→ Join VEDD" sibling link after external links
          const nudge = document.createElement('a');
          nudge.href = signupUrl;
          nudge.className = 'vedd-signup-nudge';
          nudge.textContent = ' → Join VEDD';
          nudge.style.cssText =
            'display:inline-block;margin-left:4px;font-size:0.75em;font-weight:700;color:#ef4444;text-decoration:none;background:rgba(220,38,38,0.12);border:1px solid rgba(220,38,38,0.35);border-radius:4px;padding:0 5px;line-height:1.6;';
          a.insertAdjacentElement('afterend', nudge);
        }
      } else {
        // Relative path → sign-up page
        a.setAttribute('href', signupUrl);
        a.removeAttribute('target');
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

// ─── Blog Post Card ──────────────────────────────────────────────────────────

function BlogPostCard({
  post,
  isAdmin,
  isAmbassador,
  referralCode,
  onDelete,
  onTogglePublish,
  onToggleFeature,
}: {
  post: BlogPost;
  isAdmin: boolean;
  isAmbassador: boolean;
  referralCode?: string | null;
  onDelete: (id: number) => void;
  onTogglePublish: (id: number) => void;
  onToggleFeature: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const formattedDate = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date(post.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

  return (
    <div className="bg-black/50 backdrop-blur-sm border border-gray-800 rounded-lg overflow-hidden hover:border-red-800/50 transition-all duration-300">
      <div className="p-6">
        {/* Header row: category, badges, views */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-medium text-red-400 uppercase bg-red-900/20 px-2 py-1 rounded-full">
            {post.category}
          </span>
          {post.aiGenerated && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-400 bg-purple-900/20 px-2 py-1 rounded-full">
              <Sparkles className="h-3 w-3" /> AI Generated
            </span>
          )}
          {post.isFeatured && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-400 bg-yellow-900/20 px-2 py-1 rounded-full">
              <Star className="h-3 w-3" /> Featured
            </span>
          )}
          {isAdmin && !post.isPublished && (
            <Badge variant="outline" className="text-xs text-orange-400 border-orange-700">
              DRAFT
            </Badge>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500">
            <Eye className="h-3 w-3" /> {post.viewCount ?? 0}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-xl md:text-2xl font-bold text-white mb-3">{post.title}</h3>

        {/* Meta row */}
        <div className="flex flex-wrap items-center text-gray-400 text-sm mb-4 gap-3">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-4 w-4" /> {formattedDate}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" /> {post.readTime}
          </span>
        </div>

        {/* Content */}
        {expanded ? (
          <ArticleContent
            html={post.content}
            referralCode={referralCode}
            className="text-gray-300 mb-6 prose prose-invert max-w-none prose-p:text-gray-300 prose-li:text-gray-300 prose-headings:text-white prose-strong:text-white"
          />
        ) : (
          <p className="text-gray-300 mb-6">{post.excerpt}</p>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {post.tags.map((tag: string) => (
              <span key={tag} className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Action row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            className="text-white border-gray-700 hover:bg-gray-800"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show Less' : 'Read More'}
          </Button>

          <div className="flex items-center gap-2">
            {/* Share button — visible to ambassadors and admins */}
            {(isAmbassador || isAdmin) && (
              <Button
                variant="ghost"
                size="sm"
                className={`transition-colors ${
                  shareOpen
                    ? 'text-red-400 bg-red-900/20'
                    : 'text-gray-400 hover:text-red-400 hover:bg-red-900/10'
                }`}
                onClick={() => setShareOpen(!shareOpen)}
                title="Share with affiliate link"
              >
                <Share2 className="h-4 w-4" />
                <span className="ml-1 text-xs hidden sm:inline">Share</span>
              </Button>
            )}

            {isAdmin && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                  onClick={() => onTogglePublish(post.id)}
                  title={post.isPublished ? 'Unpublish' : 'Publish'}
                >
                  {post.isPublished ? <EyeOff className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/20"
                  onClick={() => onToggleFeature(post.id)}
                  title={post.isFeatured ? 'Unfeature' : 'Feature'}
                >
                  <Star className={`h-4 w-4 ${post.isFeatured ? 'fill-yellow-400' : ''}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  onClick={() => onDelete(post.id)}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
            {!isAdmin && !isAmbassador && <EarlyAccessForm />}
          </div>
        </div>

        {/* Share Panel */}
        {shareOpen && (
          <SharePanel
            post={post}
            referralCode={referralCode}
            onClose={() => setShareOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Generate Dialog ─────────────────────────────────────────────────────────

function GenerateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
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
      setGenerated(data.post);
      setEditTitle(data.post.title);
      setEditExcerpt(data.post.excerpt);
      setEditCategory(data.post.category);
      setEditMode(false);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (publish: boolean) => {
      if (!generated) return;
      const payload = {
        ...(editMode
          ? { ...generated, title: editTitle, excerpt: editExcerpt, category: editCategory }
          : generated),
        isPublished: publish,
        isFeatured: false,
        aiGenerated: true,
        publishedAt: publish ? new Date().toISOString() : null,
      };
      const res = await apiRequest('POST', '/api/blog', payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/blog'] });
      setGenerated(null);
      setTopic('');
      onOpenChange(false);
    },
  });

  const handleGenerate = () => {
    generateMutation.mutate(topic || undefined);
  };

  const handleRegenerate = () => {
    setGenerated(null);
    generateMutation.mutate(topic || undefined);
  };

  const isLoading = generateMutation.isPending;
  const isSaving = saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-950 border border-gray-800 text-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-red-400" />
            Generate AI Blog Post
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Let VEDD AI write a VEDD-branded trading article. Leave blank to pick a hot market topic.
          </DialogDescription>
        </DialogHeader>

        {!generated ? (
          <div className="space-y-4 mt-2">
            {/* Topic input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Topic (optional)
              </label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Leave blank to let AI pick a hot market topic, or enter a specific topic"
                className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
                disabled={isLoading}
              />
            </div>

            {/* Topic chips */}
            <div className="flex flex-wrap gap-2">
              {TOPIC_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setTopic(chip)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    topic === chip
                      ? 'bg-red-900/50 border-red-600 text-red-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-red-700 hover:text-red-400'
                  }`}
                  disabled={isLoading}
                >
                  {chip}
                </button>
              ))}
            </div>

            {generateMutation.isError && (
              <p className="text-red-400 text-sm">
                Error: {(generateMutation.error as Error).message}
              </p>
            )}

            <Button
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  ✨ AI is writing your VEDD-styled article...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Generate Post
                </span>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {/* Preview */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
              {editMode ? (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Title</label>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Excerpt</label>
                    <Textarea
                      value={editExcerpt}
                      onChange={(e) => setEditExcerpt(e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Category</label>
                    <Input
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-bold text-white">{generated.title}</h3>
                  <p className="text-gray-400 text-sm">{generated.excerpt}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                    <span className="bg-red-900/20 text-red-400 px-2 py-0.5 rounded">
                      {generated.category}
                    </span>
                    <span>{generated.readTime}</span>
                    {generated.tags?.map((t) => (
                      <span key={t} className="bg-gray-800 px-2 py-0.5 rounded">
                        #{t}
                      </span>
                    ))}
                  </div>
                </>
              )}

              <div className="border-t border-gray-700 pt-3">
                <p className="text-xs text-gray-500 mb-2 italic">
                  Context: {generated.currentEventsContext}
                </p>
                <div
                  className="prose prose-invert prose-sm max-w-none prose-p:text-gray-300 prose-li:text-gray-300 prose-headings:text-white prose-strong:text-white max-h-64 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: generated.content }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditMode(!editMode)}
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                <Edit className="h-4 w-4 mr-1" />
                {editMode ? 'Done Editing' : 'Edit'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={isLoading || isSaving}
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Regenerate
              </Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate(false)}
                disabled={isSaving}
                className="bg-gray-700 hover:bg-gray-600 text-white ml-auto"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save as Draft'}
              </Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate(true)}
                disabled={isSaving}
                className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Globe className="h-4 w-4 mr-1" />
                    Publish Now
                  </>
                )}
              </Button>
            </div>

            {saveMutation.isError && (
              <p className="text-red-400 text-sm">
                Save error: {(saveMutation.error as Error).message}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Blog Page ──────────────────────────────────────────────────────────

export default function BlogPage() {
  const { user } = useAuth();
  const isAdmin     = !!(user as any)?.isAdmin;
  const isAmbassador = !!(user as any)?.isAmbassador;
  const referralCode: string | null = (user as any)?.referralCode ?? null;
  const queryClient = useQueryClient();

  // Canonical sign-up URL — embeds referral code when viewer is an ambassador
  const signupUrl = referralCode
    ? `/auth?ref=${referralCode}`
    : '/auth';

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);

  const { data: posts = [], isLoading, isError } = useQuery<BlogPost[]>({
    queryKey: ['/api/blog'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/blog');
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/blog/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/blog'] }),
  });

  const togglePublishMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('PATCH', `/api/blog/${id}/publish`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/blog'] }),
  });

  const toggleFeatureMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('PATCH', `/api/blog/${id}/feature`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/blog'] }),
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black">
      <div className="max-w-5xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Trading{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-red-800">
              Insights
            </span>
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Expert analysis, trading strategies, and market wisdom to help you succeed in the markets.
          </p>
        </div>

        {/* Admin: Generate AI Post button */}
        {isAdmin && (
          <div className="mb-8 flex justify-center">
            <Button
              onClick={() => setGenerateDialogOpen(true)}
              className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-700 hover:to-rose-800 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50 transition-all duration-300 transform hover:scale-105 px-6 py-3 text-base"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              ✨ Generate AI Blog Post
            </Button>
          </div>
        )}

        {/* Blog post list */}
        {isLoading && (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-red-400" />
          </div>
        )}

        {isError && (
          <div className="text-center py-12 text-gray-400">
            <p>Failed to load blog posts. Please try again later.</p>
          </div>
        )}

        {!isLoading && !isError && posts.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p>No posts published yet. Check back soon!</p>
          </div>
        )}

        {!isLoading && !isError && posts.length > 0 && (
          <div className="grid grid-cols-1 gap-8">
            {posts.map((post) => (
              <BlogPostCard
                key={post.id}
                post={post}
                isAdmin={isAdmin}
                isAmbassador={isAmbassador}
                referralCode={referralCode}
                onDelete={(id) => {
                  if (confirm('Delete this post?')) deleteMutation.mutate(id);
                }}
                onTogglePublish={(id) => togglePublishMutation.mutate(id)}
                onToggleFeature={(id) => toggleFeatureMutation.mutate(id)}
              />
            ))}
          </div>
        )}

        {/* CTA section */}
        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Ready to Elevate Your Trading?</h2>
          {referralCode && (
            <p className="text-sm text-emerald-400 mb-5">
              🔗 Referred by an ambassador — your code <span className="font-mono font-bold">{referralCode}</span> will be applied automatically.
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href={signupUrl}>
              <Button
                size="lg"
                className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50 transition-all duration-300 transform hover:scale-105"
              >
                Join VEDD AI Trading <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <EarlyAccessForm />
          </div>
        </div>
      </div>

      {/* Generate Dialog */}
      <GenerateDialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen} />
    </div>
  );
}
