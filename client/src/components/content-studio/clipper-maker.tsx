import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useContentJob, type ContentJob } from './explainer-maker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Scissors, Sparkles, Download, Share2, Copy, Check,
  ExternalLink, Loader2, Film, Clock, Gauge,
} from 'lucide-react';

/**
 * AI Clipper — paste a video link, the AI finds the viral moments, cuts
 * them, burns word-highlight captions + a hook headline, and saves every
 * clip to the library. Includes the Share & Monetize panel: per-network
 * share rows for the four monetization-capable networks (YouTube Shorts,
 * TikTok, Instagram Reels, Facebook Reels) with an honest state — one-tap
 * share via the platform composer until an integration passes its
 * platform review; nothing is ever posted without the user pressing Post.
 */

interface ClipperClip {
  generationId: number; url: string; hook: string; viralityScore: number;
  subscores: { hook: number; flow: number; value: number; trend: number };
  reason: string; category: string; durationSec: number; startSec: number;
  endSec: number; caption: string; rank: number; belowThreshold?: boolean;
}

interface ShareTarget {
  network: string; label: string; format: string; mode: 'direct' | 'fallback';
  monetizationProgram: string; statusLine: string; composerUrl: string;
}
const CAPTION_LIMITS: Record<string, number> = { youtube: 1000, tiktok: 2200, instagram: 2200, facebook: 2200 };

/** Client mirror of clipper-core.buildShareCaption (kept in lockstep by
 *  scripts/check-ai-clipper.ts source pins). */
function buildClipShareCaption(network: string, clip: { hook: string; caption: string }): string {
  const body = (clip.caption || '').trim() || clip.hook.trim();
  const limit = CAPTION_LIMITS[network] || 2200;
  if (body.length <= limit) return body;
  return `${body.slice(0, Math.max(40, limit - 1)).replace(/\s+\S*$/, '')}…`;
}

const fmtClock = (sec: number) => {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};
const scoreClass = (n: number) => (n >= 80 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
  : n >= 60 ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
    : 'bg-zinc-500/15 text-zinc-300 border-zinc-500/40');

export default function ClipperMaker() {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState('tiktok');
  const [aspect, setAspect] = useState('9:16');
  const [lengthPreset, setLengthPreset] = useState('medium');
  const [clipCount, setClipCount] = useState(5);
  const [minVirality, setMinVirality] = useState(60);
  const [captionStyle, setCaptionStyle] = useState('bold-pop');
  const [silenceTrim, setSilenceTrim] = useState(true);
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const [clips, setClips] = useState<ClipperClip[]>([]);
  const [failed, setFailed] = useState('');

  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const [copiedKey, setCopiedKey] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest('GET', '/api/content-studio/share-targets');
        const data = await res.json();
        setTargets(data.targets || []);
      } catch { /* panel degrades to download-only */ }
    })();
  }, []);

  const job: ContentJob | null = useContentJob(jobId,
    (j) => {
      const result: any = (j as any).result || {};
      setClips(Array.isArray(result.clips) ? result.clips : []);
      setJobId(null);
      toast({ title: 'Clips ready', description: 'Your clips are below — and saved to your library.' });
    },
    (j) => { setFailed(j.error || 'The clipper failed on that video.'); setJobId(null); });

  const start = async () => {
    if (!url.trim()) { toast({ title: 'Paste a video link first', variant: 'destructive' }); return; }
    setStarting(true); setFailed(''); setClips([]);
    try {
      const res = await apiRequest('POST', '/api/content-studio/clipper', {
        url: url.trim(),
        settings: { clipCount, lengthPreset, minVirality, captionStyle, platform, aspect, silenceTrim, topic: topic.trim() },
      });
      const data = await res.json();
      setJobId(data.jobId);
    } catch (e: any) {
      toast({ title: 'Could not start', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally { setStarting(false); }
  };

  const copyText = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedKey(key); setTimeout(() => setCopiedKey(''), 2000); } catch { /* clipboard unavailable */ }
  };

  const shareTo = async (clip: ClipperClip, t: ShareTarget) => {
    const caption = buildClipShareCaption(t.network, clip);
    const nav: any = navigator;
    // Best path: the OS share sheet with the actual video file attached.
    try {
      const resp = await fetch(clip.url);
      const blob = await resp.blob();
      const file = new File([blob], 'vedd-clip.mp4', { type: 'video/mp4' });
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text: caption });
        return;
      }
    } catch { /* fall through to copy + composer */ }
    await copyText(`share-${clip.generationId}-${t.network}`, caption);
    window.open(t.composerUrl, '_blank', 'noopener');
    toast({ title: `Caption copied — paste it in ${t.label}`, description: 'Your clip downloads from the card; upload it in the composer.' });
  };

  const busy = starting || !!jobId;

  return (
    <div className="space-y-5" data-testid="clipper-maker">
      <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Scissors className="h-4 w-4 text-primary" /> AI Clipper</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Paste a link to a long video. The AI finds the moments most likely to travel, cuts them,
            and burns in captions with a hook headline — ready to post. Works best with direct video
            file links; YouTube can block server downloads (you'll get a plain message if it does).
            Videos up to 60 minutes.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Video link</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (YouTube or a direct .mp4/.webm link)" className="min-h-[44px]" data-testid="clipper-url" />
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Optional focus — e.g. 'risk management stories'" className="min-h-[44px]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Made for</Label>
            <div className="flex flex-wrap gap-1.5">
              {([['tiktok', 'TikTok'], ['reels', 'IG Reels'], ['shorts', 'YT Shorts'], ['facebook', 'FB Reels']] as const).map(([id, label]) => (
                <Button key={id} type="button" size="sm" variant={platform === id ? 'default' : 'outline'} className="min-h-[40px]"
                  onClick={() => { setPlatform(id); setAspect('9:16'); }}>{label}</Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Video size</Label>
            <div className="flex flex-wrap gap-1.5">
              {(['9:16', '1:1', '4:5', '16:9', 'original'] as const).map((a) => (
                <Button key={a} type="button" size="sm" variant={aspect === a ? 'default' : 'outline'} className="min-h-[40px]"
                  onClick={() => setAspect(a)}>{a === 'original' ? 'Original' : a}</Button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Clip length</Label>
            <div className="flex flex-wrap gap-1.5">
              {([['short', 'Under 30s'], ['medium', '30–60s'], ['long', '60–90s']] as const).map(([id, label]) => (
                <Button key={id} type="button" size="sm" variant={lengthPreset === id ? 'default' : 'outline'} className="min-h-[40px]"
                  onClick={() => setLengthPreset(id)}>{label}</Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Caption style</Label>
            <div className="flex flex-wrap gap-1.5">
              {([['bold-pop', 'Bold Pop'], ['karaoke', 'Karaoke'], ['clean', 'Clean']] as const).map(([id, label]) => (
                <Button key={id} type="button" size="sm" variant={captionStyle === id ? 'default' : 'outline'} className="min-h-[40px]"
                  onClick={() => setCaptionStyle(id)}>{label}</Button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5"><Film className="h-3.5 w-3.5" /> Clips to make: {clipCount}</Label>
            <input type="range" min={1} max={10} value={clipCount} onChange={(e) => setClipCount(Number(e.target.value))} className="w-full min-h-[32px]" />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> Min. virality score: {minVirality}</Label>
            <input type="range" min={0} max={95} step={5} value={minVirality} onChange={(e) => setMinVirality(Number(e.target.value))} className="w-full min-h-[32px]" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm min-h-[36px]">
          <input type="checkbox" checked={silenceTrim} onChange={(e) => setSilenceTrim(e.target.checked)} className="h-4 w-4" />
          Trim dead air at clip edges (silence-aware cuts)
        </label>

        <Button onClick={start} disabled={busy} className="w-full min-h-[48px]" data-testid="clipper-start">
          {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Working…</> : <><Sparkles className="h-4 w-4 mr-2" /> Find my clips</>}
        </Button>
        {job && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground"><span>{job.step}</span><span>{job.progress}%</span></div>
            <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${job.progress}%` }} /></div>
            <p className="text-xs text-muted-foreground">Long videos take a few minutes — transcription and rendering happen on the server. You can leave this tab; finished clips land in your Saved library.</p>
          </div>
        )}
        {failed && <p className="text-sm text-destructive">{failed}</p>}
      </div>

      {clips.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-semibold">Your clips — best first</h4>
          {clips.map((clip) => (
            <div key={clip.generationId} className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3" data-testid={`clipper-clip-${clip.rank}`}>
              <div className="flex flex-col sm:flex-row gap-4">
                <video src={clip.url} controls playsInline className="w-full sm:w-44 aspect-[9/16] max-h-72 object-contain bg-black rounded-lg" />
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={scoreClass(clip.viralityScore)}>
                      <Gauge className="h-3 w-3 mr-1" /> {clip.viralityScore} viral score
                    </Badge>
                    <Badge variant="outline"><Clock className="h-3 w-3 mr-1" /> {Math.round(clip.durationSec)}s · from {fmtClock(clip.startSec)}</Badge>
                    <Badge variant="secondary">{clip.category}</Badge>
                    {clip.belowThreshold && <Badge variant="outline" className="text-amber-300 border-amber-500/40">best available — under your score bar</Badge>}
                  </div>
                  <p className="font-semibold leading-snug">{clip.hook}</p>
                  <p className="text-sm text-muted-foreground">{clip.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    Hook {clip.subscores.hook} · Flow {clip.subscores.flow} · Value {clip.subscores.value} · Trend {clip.subscores.trend}
                  </p>
                  {clip.caption && (
                    <div className="rounded-lg bg-muted/40 p-2.5 text-sm whitespace-pre-wrap break-words">{clip.caption}</div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => copyText(`cap-${clip.generationId}`, clip.caption || clip.hook)}>
                      {copiedKey === `cap-${clip.generationId}` ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />} Copy caption
                    </Button>
                    <a href={clip.url} download target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" className="min-h-[40px]"><Download className="h-4 w-4 mr-1.5" /> Download</Button>
                    </a>
                  </div>
                </div>
              </div>

              {/* Share & Monetize */}
              <div className="border-t border-border/50 pt-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5"><Share2 className="h-4 w-4 text-primary" /> Share &amp; Monetize</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {targets.map((t) => {
                    const caption = buildClipShareCaption(t.network, clip);
                    return (
                      <div key={t.network} className="rounded-lg border border-border/50 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{t.label} · {t.format}</span>
                          <Badge variant="outline" className="text-[10px]">{t.mode === 'direct' ? 'Direct post' : 'One-tap share'}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Monetization: {t.monetizationProgram} (on your {t.label} account)</p>
                        <div className="flex gap-1.5">
                          <Button size="sm" className="min-h-[38px] flex-1" onClick={() => shareTo(clip, t)}>
                            <Share2 className="h-3.5 w-3.5 mr-1.5" /> Share
                          </Button>
                          <Button size="sm" variant="outline" className="min-h-[38px]" onClick={() => copyText(`share-${clip.generationId}-${t.network}`, caption)}>
                            {copiedKey === `share-${clip.generationId}-${t.network}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                          <a href={t.composerUrl} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="outline" className="min-h-[38px]"><ExternalLink className="h-3.5 w-3.5" /></Button>
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  One-tap share copies the caption and opens the composer — nothing is ever posted without you pressing Post.
                  Monetization runs on your own account at each network; VEDD doesn't take a cut or hold the money.
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
