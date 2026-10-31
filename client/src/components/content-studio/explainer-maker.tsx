import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Download, Loader2, Mic } from 'lucide-react';

// Narrated explainer videos (server/services/explainer-video.ts): the server
// writes a scene-by-scene script, films each scene with voiceover, joins
// them and adds VEDD branding. It takes a few minutes, so it runs as a job
// and this polls it.

export interface ExplainerJob {
  id: number; status: 'queued' | 'running' | 'done' | 'failed'; step: string | null; progress: number;
  url: string | null; error: string | null; aspect: string;
  script: { title: string; caption: string; scenes: { narration: string; visual: string }[] } | null;
}

export function useExplainerJob(jobId: number | null, onDone?: (job: ExplainerJob) => void) {
  const [job, setJob] = useState<ExplainerJob | null>(null);
  useEffect(() => {
    if (!jobId) { setJob(null); return; }
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/content-studio/explainer/${jobId}`, { credentials: 'include' });
        if (res.ok) {
          const j: ExplainerJob = await res.json();
          if (stop) return;
          setJob(j);
          if (j.status === 'done') { onDone?.(j); return; }
          if (j.status === 'failed') return;
        }
      } catch { /* keep polling */ }
      if (!stop) setTimeout(tick, 5000);
    };
    tick();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  return job;
}

export function JobProgress({ job }: { job: ExplainerJob | null }) {
  if (!job || job.status === 'done') return null;
  if (job.status === 'failed') return <p className="text-sm text-red-400">{job.error || 'The video could not be made.'}</p>;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{job.step || 'Starting'}…</div>
      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.max(5, job.progress)}%` }} />
      </div>
      <p className="text-xs text-gray-400">Usually 3–6 minutes. You can leave this page; it will be in your Saved library when it's ready.</p>
    </div>
  );
}

const SIZES = [
  ['9:16', 'Vertical 9:16', 'Reels · TikTok · Shorts'],
  ['4:5', 'Portrait 4:5', 'IG & FB feed'],
  ['1:1', 'Square 1:1', 'Feed · groups'],
  ['16:9', 'Landscape 16:9', 'YouTube · FB video'],
] as const;

export function ExplainerMaker({ initialTopic = '' }: { initialTopic?: string }) {
  const [topic, setTopic] = useState(initialTopic);
  const [aspect, setAspect] = useState<string>('9:16');
  const [jobId, setJobId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const job = useExplainerJob(jobId);
  const busy = starting || (!!job && (job.status === 'running' || job.status === 'queued'));

  const start = async () => {
    if (!topic.trim() || busy) return;
    setStarting(true); setError(null); setJobId(null);
    try {
      const res = await apiRequest('POST', '/api/content-studio/explainer', { prompt: topic.trim(), aspect });
      const data = await res.json();
      setJobId(data.jobId);
    } catch (e: any) {
      setError(String(e?.message || 'Could not start the video').replace(/^\d+:\s*/, '').replace(/^\{"error":"|"\}$/g, ''));
    } finally { setStarting(false); }
  };

  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(245,196,81,.06)', border: '1px solid rgba(245,196,81,.3)' }}>
      <div>
        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Mic className="w-4 h-4 text-amber-400" /> Explainer video with voiceover</h2>
        <p className="text-xs text-gray-400 mt-1">
          Tell us what to teach. We write a short script, film each step with a narrator explaining it, and finish it with VEDD branding: about 30 seconds, ready to post.
        </p>
      </div>
      <div>
        <label className="text-[10px] text-gray-500 mb-1 block">What should the video explain?</label>
        <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} disabled={busy}
          placeholder="e.g. How the opening range breakout works and where to put your stop"
          className="bg-black/40 border-white/10 text-white text-sm" />
      </div>
      <div>
        <label className="text-[10px] text-gray-500 mb-1 block">Size</label>
        <div className="grid grid-cols-2 gap-2">
          {SIZES.map(([a, label, hint]) => (
            <button key={a} onClick={() => setAspect(a)} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-bold text-left"
              style={{ background: aspect === a ? 'rgba(245,196,81,.2)' : 'rgba(255,255,255,.05)', border: `1px solid ${aspect === a ? 'rgba(245,196,81,.5)' : 'rgba(255,255,255,.1)'}`, color: aspect === a ? '#F5C451' : '#9ca3af' }}>
              {label}<span className="block text-[9px] font-normal opacity-70">{hint}</span>
            </button>
          ))}
        </div>
      </div>
      <Button onClick={start} disabled={!topic.trim() || busy} className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold">
        {busy ? 'Making your video…' : 'Make explainer video'}
      </Button>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <JobProgress job={job} />
      {job?.status === 'done' && job.url && (
        <div className="space-y-2">
          <video src={job.url} controls playsInline className="w-full rounded-xl border border-white/10 bg-black object-contain" style={{ aspectRatio: job.aspect.replace(':', '/'), maxHeight: 520 }} />
          <a href={job.url} download className="flex items-center justify-center gap-1 text-xs font-bold px-3 py-2 rounded-lg" style={{ background: 'rgba(245,196,81,.15)', color: '#F5C451', border: '1px solid rgba(245,196,81,.35)' }}>
            <Download className="w-3 h-3" /> Download video
          </a>
          {job.script && (
            <details className="text-xs text-gray-300">
              <summary className="cursor-pointer text-gray-400">Script and caption</summary>
              <p className="mt-2 font-semibold">{job.script.caption}</p>
              <ol className="list-decimal ml-4 mt-1 space-y-1">{job.script.scenes.map((s, i) => <li key={i}>{s.narration}</li>)}</ol>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
