/**
 * AI Clipper — pure core (no I/O): URL classification, settings, virality
 * scoring, moment finalization, caption cue building + ASS rendering,
 * silence parsing, reframe filter math, and share targets. Everything
 * here is unit-checkable
 * (scripts/check-ai-clipper.ts); the network/ffmpeg/DB pipeline lives in
 * clipper.ts and calls into these functions.
 *
 * Design mirrors the category leaders (Opus Clip et al. — see
 * research_notes/ai-clipper-industry-features-20261115.md): a virality
 * score graded on hook/flow/value/trend, word-highlight burned-in
 * captions, a hook headline on the first seconds, platform presets, and
 * honest share states (direct posting only when a platform integration
 * genuinely exists — it does not in v1).
 */

// ─── Transcript ─────────────────────────────────────────────────────────────

export interface WordTiming { word: string; start: number; end: number }
export interface TranscriptSegment { start: number; end: number; text: string }
export interface Transcript {
  words: WordTiming[];
  segments: TranscriptSegment[];
  text: string;
  durationSec: number;
  /** Which transcription path produced this (for job metadata). */
  source: string;
}

// ─── Settings ───────────────────────────────────────────────────────────────

export type LengthPreset = 'short' | 'medium' | 'long';
export const LENGTH_PRESETS: Record<LengthPreset, { label: string; min: number; max: number; target: number }> = {
  short: { label: 'Under 30s', min: 12, max: 30, target: 24 },
  medium: { label: '30–60s', min: 28, max: 60, target: 45 },
  long: { label: '60–90s', min: 55, max: 90, target: 75 },
};

export type CaptionStyleId = 'bold-pop' | 'karaoke' | 'clean';
export const CAPTION_STYLES: Record<CaptionStyleId, {
  label: string; blurb: string; fontName: string; wordsPerCue: number;
  primary: string; highlight: string; fontSize: number; outline: number;
  alignment: number; marginV: number; box: boolean; allCaps: boolean;
}> = {
  // ASS colors are &HBBGGRR. bold-pop: Archivo Black, white text, thick
  // black outline, active word in yellow — the Hormozi-style look.
  'bold-pop': {
    label: 'Bold Pop', blurb: 'Big heavy captions, word-by-word highlight',
    fontName: 'Archivo Black', wordsPerCue: 3, primary: '&HFFFFFF', highlight: '&H00E5FF',
    fontSize: 56, outline: 6, alignment: 5, marginV: 0, box: false, allCaps: true,
  },
  // karaoke: clean sans, active word sweeps green with a slight scale pop.
  'karaoke': {
    label: 'Karaoke', blurb: 'Word highlight sweep, lower third',
    fontName: 'Liberation Sans', wordsPerCue: 4, primary: '&HFFFFFF', highlight: '&H4ADE80',
    fontSize: 48, outline: 4, alignment: 2, marginV: 90, box: false, allCaps: false,
  },
  // clean: full-line cues on a translucent box, no per-word work.
  'clean': {
    label: 'Clean', blurb: 'Simple line captions on a soft box',
    fontName: 'Liberation Sans', wordsPerCue: 8, primary: '&HFFFFFF', highlight: '&HFFFFFF',
    fontSize: 42, outline: 1, alignment: 2, marginV: 70, box: true, allCaps: false,
  },
};

export type PlatformPreset = 'tiktok' | 'reels' | 'shorts' | 'facebook';
export type ClipAspect = '9:16' | '1:1' | '4:5' | '16:9' | 'original';
export const PLATFORM_ASPECT: Record<PlatformPreset, ClipAspect> = {
  tiktok: '9:16', reels: '9:16', shorts: '9:16', facebook: '9:16',
};

export interface ClipperSettings {
  clipCount: number;
  lengthPreset: LengthPreset;
  minVirality: number;
  captionStyle: CaptionStyleId;
  platform: PlatformPreset;
  aspect: ClipAspect;
  silenceTrim: boolean;
  topic: string;
}

export const DEFAULT_CLIPPER_SETTINGS: ClipperSettings = {
  clipCount: 5, lengthPreset: 'medium', minVirality: 60,
  captionStyle: 'bold-pop', platform: 'tiktok', aspect: '9:16',
  silenceTrim: true, topic: '',
};

export function validateClipperSettings(raw: any): { ok: true; settings: ClipperSettings } | { ok: false; error: string } {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const s: ClipperSettings = { ...DEFAULT_CLIPPER_SETTINGS };
  if (r.clipCount !== undefined) {
    const n = Number(r.clipCount);
    if (!Number.isFinite(n) || n < 1 || n > 10) return { ok: false, error: 'Clip count must be between 1 and 10.' };
    s.clipCount = Math.round(n);
  }
  if (r.lengthPreset !== undefined) {
    if (!(r.lengthPreset in LENGTH_PRESETS)) return { ok: false, error: 'Pick a clip length: under 30s, 30–60s, or 60–90s.' };
    s.lengthPreset = r.lengthPreset;
  }
  if (r.minVirality !== undefined) {
    const n = Number(r.minVirality);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: 'Minimum virality score must be 0–100.' };
    s.minVirality = Math.round(n);
  }
  if (r.captionStyle !== undefined) {
    if (!(r.captionStyle in CAPTION_STYLES)) return { ok: false, error: 'Unknown caption style.' };
    s.captionStyle = r.captionStyle;
  }
  if (r.platform !== undefined) {
    if (!(r.platform in PLATFORM_ASPECT)) return { ok: false, error: 'Unknown platform preset.' };
    s.platform = r.platform;
  }
  if (r.aspect !== undefined) {
    if (!['9:16', '1:1', '4:5', '16:9', 'original'].includes(r.aspect)) return { ok: false, error: 'Unknown video size.' };
    s.aspect = r.aspect;
  } else if (r.platform !== undefined) {
    s.aspect = PLATFORM_ASPECT[s.platform];
  }
  if (r.silenceTrim !== undefined) s.silenceTrim = !!r.silenceTrim;
  if (r.topic !== undefined) s.topic = String(r.topic).slice(0, 200).trim();
  return { ok: true, settings: s };
}

// ─── Source URL classification ──────────────────────────────────────────────

export type SourceClass =
  | { kind: 'youtube'; videoId: string }
  | { kind: 'direct' }
  | { kind: 'unsupported'; reason: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
export function classifySourceUrl(raw: string): SourceClass {
  const url = String(raw || '').trim();
  if (!url) return { kind: 'unsupported', reason: 'Paste a video link first.' };
  let u: URL;
  try { u = new URL(url); } catch { return { kind: 'unsupported', reason: 'That does not look like a valid link.' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { kind: 'unsupported', reason: 'Only web links (http/https) are supported.' };
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    const id = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop() || '';
    if (YT_ID.test(id)) return { kind: 'youtube', videoId: id };
    return { kind: 'unsupported', reason: 'That YouTube link has no video id — use a watch, Shorts or youtu.be link.' };
  }
  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0] || '';
    if (YT_ID.test(id)) return { kind: 'youtube', videoId: id };
    return { kind: 'unsupported', reason: 'That youtu.be link has no video id.' };
  }
  if (/\.(mp4|webm|mov|m4v|mkv)$/i.test(u.pathname)) return { kind: 'direct' };
  return {
    kind: 'unsupported',
    reason: 'That link is not a video file we can read. Paste a YouTube link or a direct video file link (.mp4, .webm, .mov, .m4v, .mkv).',
  };
}

// ─── Virality scoring ───────────────────────────────────────────────────────

export interface Subscores { hook: number; flow: number; value: number; trend: number }

const clampScore = (n: any): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
};
export function normalizeSubscores(raw: any): Subscores {
  const r = (raw && typeof raw === 'object') ? raw : {};
  return { hook: clampScore(r.hook), flow: clampScore(r.flow), value: clampScore(r.value), trend: clampScore(r.trend) };
}

/** The clip's virality score 0–100: hook weighs most (the first seconds
 *  decide a swipe), then flow and value, then trend fit. */
export function viralityScore(sub: Subscores): number {
  const s = normalizeSubscores(sub);
  return Math.max(0, Math.min(100, Math.round(s.hook * 0.35 + s.flow * 0.25 + s.value * 0.25 + s.trend * 0.15)));
}

// ─── Silence ────────────────────────────────────────────────────────────────

export interface SilenceRange { start: number; end: number }

/** Parse ffmpeg silencedetect stderr into ranges. */
export function parseSilenceDetect(stderr: string): SilenceRange[] {
  const out: SilenceRange[] = [];
  const starts = new Map<number, number>();
  const re = /silence_(start|end):\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  let pending: number | null = null;
  while ((m = re.exec(stderr))) {
    const t = Number(m[2]);
    if (m[1] === 'start') pending = t;
    else if (pending !== null) { out.push({ start: pending, end: t }); pending = null; }
  }
  void starts;
  return out.filter((r) => r.end > r.start);
}

/** Fraction of [start,end] covered by silence ranges. */
export function silenceRatio(ranges: SilenceRange[], start: number, end: number): number {
  if (end <= start) return 0;
  let covered = 0;
  for (const r of ranges) {
    const s = Math.max(r.start, start), e = Math.min(r.end, end);
    if (e > s) covered += e - s;
  }
  return Math.max(0, Math.min(1, covered / (end - start)));
}

// ─── Moment finalization ────────────────────────────────────────────────────

export interface MomentSeed {
  startSec: number; endSec: number; hook: string; reason: string;
  category: string; caption: string; subscores: Subscores;
}

export interface FinalMoment extends MomentSeed {
  viralityScore: number; durationSec: number; rank: number; belowThreshold: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Snap a time to the start of the word that contains it (or the nearest
 *  following word), so cuts land on word boundaries, never mid-word. */
export function snapToWordStart(words: WordTiming[], t: number): number {
  if (!words.length) return t;
  for (const w of words) if (t >= w.start && t < w.end) return w.start;
  for (const w of words) if (w.start >= t) return w.start;
  return words[words.length - 1].end;
}
export function snapToWordEnd(words: WordTiming[], t: number): number {
  if (!words.length) return t;
  for (const w of words) if (t > w.start && t <= w.end) return w.end;
  let best = words[0].end;
  for (const w of words) { if (w.end <= t) best = w.end; else break; }
  return best;
}

/** Move a boundary out of a silence it sits inside (max shift each way),
 *  so clips don't open or close on dead air. */
export function snapOutOfSilence(ranges: SilenceRange[], t: number, dir: 'start' | 'end', maxShift = 2.5): number {
  for (const r of ranges) {
    if (t > r.start && t < r.end && r.end - r.start >= 0.35) {
      if (dir === 'start') { const nt = r.end; return nt - t <= maxShift ? nt : t; }
      const nt = r.start; return t - nt <= maxShift ? nt : t;
    }
  }
  return t;
}

export function finalizeMoments(
  seeds: MomentSeed[],
  ctx: { words: WordTiming[]; silences: SilenceRange[]; durationSec: number; settings: ClipperSettings },
): FinalMoment[] {
  const { words, silences, durationSec, settings } = ctx;
  const preset = LENGTH_PRESETS[settings.lengthPreset];
  const cleaned: FinalMoment[] = [];
  for (const seed of seeds) {
    if (!seed || !Number.isFinite(seed.startSec) || !Number.isFinite(seed.endSec)) continue;
    let start = Math.max(0, Math.min(seed.startSec, durationSec));
    let end = Math.max(0, Math.min(seed.endSec, durationSec));
    if (end - start < 3) continue; // too short to be a moment
    // Word-boundary snap, then a breath of padding.
    start = Math.max(0, snapToWordStart(words, start) - 0.25);
    end = Math.min(durationSec, snapToWordEnd(words, end) + 0.35);
    // Out of dead air at the edges.
    if (settings.silenceTrim) {
      start = snapOutOfSilence(silences, start, 'start');
      end = snapOutOfSilence(silences, end, 'end');
      if (end - start < 3) continue;
    }
    // Enforce the length preset: trim long windows from the end (the hook
    // lives at the start), extend short ones toward the target.
    if (end - start > preset.max) end = start + preset.max;
    if (end - start < preset.min) {
      end = Math.min(durationSec, start + preset.target);
      if (end - start < preset.min) start = Math.max(0, end - preset.target);
    }
    if (end - start < 3) continue;
    const subscores = normalizeSubscores(seed.subscores);
    cleaned.push({
      startSec: round2(start), endSec: round2(end),
      hook: String(seed.hook || '').slice(0, 90).trim() || 'Untitled clip',
      reason: String(seed.reason || '').slice(0, 240).trim(),
      category: String(seed.category || 'moment').slice(0, 40).trim() || 'moment',
      caption: String(seed.caption || '').slice(0, 500).trim(),
      subscores, viralityScore: viralityScore(subscores),
      durationSec: round2(end - start), rank: 0, belowThreshold: false,
    });
  }
  // Filter by the score bar — but a job that finds moments should never
  // return zero clips: keep the single best, flagged belowThreshold.
  let kept = cleaned.filter((m) => m.viralityScore >= settings.minVirality);
  if (!kept.length && cleaned.length) {
    const best = [...cleaned].sort((a, b) => b.viralityScore - a.viralityScore)[0];
    best.belowThreshold = true;
    kept = [best];
  }
  // Dedupe overlaps greedily, best score first: a new moment must not
  // overlap an accepted one by ≥30% of the shorter window.
  kept.sort((a, b) => b.viralityScore - a.viralityScore);
  const accepted: FinalMoment[] = [];
  for (const m of kept) {
    const clash = accepted.some((a) => {
      const overlap = Math.min(a.endSec, m.endSec) - Math.max(a.startSec, m.startSec);
      return overlap >= 0.3 * Math.min(a.durationSec, m.durationSec);
    });
    if (!clash) accepted.push(m);
    if (accepted.length >= settings.clipCount) break;
  }
  accepted.forEach((m, i) => { m.rank = i + 1; });
  return accepted;
}

// ─── Captions (ASS) ─────────────────────────────────────────────────────────

export interface CaptionCue { start: number; end: number; text: string; words: WordTiming[] }

export function buildCaptionCues(words: WordTiming[], styleId: CaptionStyleId): CaptionCue[] {
  const style = CAPTION_STYLES[styleId];
  const cues: CaptionCue[] = [];
  let cur: WordTiming[] = [];
  const flush = () => {
    if (!cur.length) return;
    cues.push({
      start: cur[0].start, end: cur[cur.length - 1].end + 0.08,
      text: cur.map((w) => w.word).join(' '), words: cur,
    });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    const span = w.end - cur[0].start;
    if (cur.length >= style.wordsPerCue || (styleId === 'clean' && span >= 2.4)) flush();
  }
  flush();
  return cues;
}

export function assTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${ss.toFixed(2).padStart(5, '0')}`;
}

export function escapeAss(text: string): string {
  return String(text).replace(/\\/g, '').replace(/[{}]/g, '').replace(/\r?\n/g, ' ').trim();
}

/**
 * Full ASS document for one clip: word-highlight caption events (each word
 * gets an event where it is shown in the highlight color while its line
 * stays on screen) plus the hook headline across the top for the first
 * seconds. Times are clip-local (caller shifts words by -clipStart).
 */
/** Wrap a headline into balanced lines at word boundaries (ASS \N). */
export function wrapTitleLines(text: string, maxChars: number): string {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3).join('\\N');
}

export function buildAssDocument(
  cues: CaptionCue[], styleId: CaptionStyleId,
  opts: { width: number; height: number; hookTitle?: string },
): string {
  const style = CAPTION_STYLES[styleId];
  const scale = opts.height / 1280;
  const fontSize = Math.max(24, Math.round(style.fontSize * scale));
  const titleSize = Math.max(26, Math.round(46 * scale));
  const marginV = Math.round(style.marginV * scale);
  const fmt = (name: string, font: string, size: number, primary: string, bold: number, outline: number, align: number, mv: number, box: number) =>
    `Style: ${name},${font},${size},${primary},&H000000,&H000000,${box ? '&H80000000' : '&H000000'},${bold},0,0,0,100,100,0,0,${box ? 3 : 1},${outline},0,${align},24,24,${mv},1`;
  const lines: string[] = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${opts.width}`, `PlayResY: ${opts.height}`, 'WrapStyle: 0', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    fmt('Base', style.fontName, fontSize, style.primary, styleId === 'clean' ? 0 : 1, style.outline, style.alignment, marginV, style.box ? 1 : 0),
    fmt('Title', 'Archivo Black', titleSize, '&HFFFFFF', 1, 5, 8, Math.round(36 * scale), 0),
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const show = (w: string) => (style.allCaps ? w.toUpperCase() : w);
  for (const cue of cues) {
    if (styleId === 'clean') {
      lines.push(`Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Base,,0,0,0,,${escapeAss(show(cue.text))}`);
      continue;
    }
    // One event per word: the whole cue line is visible; the active word is
    // colored (and slightly enlarged in bold-pop). Between words the line
    // holds plain until the next word starts.
    cue.words.forEach((w, i) => {
      const parts = cue.words.map((cw, j) => {
        const t = escapeAss(show(cw.word));
        if (j !== i) return t;
        return styleId === 'bold-pop'
          ? `{\\c${style.highlight}&\\fscx112\\fscy112}${t}{\\r}`
          : `{\\c${style.highlight}&}${t}{\\r}`;
      });
      lines.push(`Dialogue: 0,${assTime(w.start)},${assTime(w.end)},Base,,0,0,0,,${parts.join(' ')}`);
    });
  }
  const title = (opts.hookTitle || '').trim();
  if (title) {
    const maxChars = Math.max(10, Math.floor(opts.width / (titleSize * 0.58)));
    const wrapped = wrapTitleLines(escapeAss(title.toUpperCase()).slice(0, 90), maxChars);
    lines.push(`Dialogue: 1,${assTime(0)},${assTime(3.2)},Title,,0,0,0,,{\\fad(200,300)}${wrapped}`);
  }
  return lines.join('\n');
}

// ─── Reframe filter ─────────────────────────────────────────────────────────

/** Output frame for an aspect (long edge capped for sane file sizes). */
export function frameForAspect(aspect: ClipAspect, srcW: number, srcH: number): { w: number; h: number } {
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  switch (aspect) {
    case '9:16': return { w: 720, h: 1280 };
    case '1:1': return { w: 960, h: 960 };
    case '4:5': return { w: 864, h: 1080 };
    case '16:9': return { w: 1280, h: 720 };
    default: return { w: even(Math.min(srcW, 1280)), h: even(Math.round(Math.min(srcW, 1280) * srcH / Math.max(1, srcW))) };
  }
}

/**
 * ffmpeg -vf chain that reframes the source to the target frame: cover-crop
 * when the source is at least as wide (relative) as the target, otherwise
 * the industry blurred-pad treatment (sharp subject over its own blurred
 * fill) so portrait/square sources are not butchered by a hard crop.
 * The caption burn-in is appended by the caller.
 */
export function buildReframeFilter(srcW: number, srcH: number, aspect: ClipAspect): string {
  const { w, h } = frameForAspect(aspect, srcW, srcH);
  if (aspect === 'original') return `scale=${w}:${h},setsar=1`;
  const srcRatio = srcW / Math.max(1, srcH), tgtRatio = w / h;
  if (srcRatio >= tgtRatio - 0.02) {
    return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
  }
  return `split[bg][fg];[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=42[bgv];` +
    `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs];[bgv][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1`;
}

// ─── Share targets ──────────────────────────────────────────────────────────

export type ShareNetwork = 'youtube' | 'tiktok' | 'instagram' | 'facebook';
export interface ShareTarget {
  network: ShareNetwork; label: string; format: string;
  /** 'direct' ONLY when app credentials AND the platform's review/audit
   *  flag are both present in env. Anything less is the honest fallback. */
  mode: 'direct' | 'fallback';
  monetizationProgram: string;
  statusLine: string;
  composerUrl: string;
}

const has = (env: Record<string, string | undefined>, ...keys: string[]) => keys.every((k) => !!(env[k] || '').trim());

export function buildShareTargets(env: Record<string, string | undefined>): ShareTarget[] {
  const ytDirect = has(env, 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'YOUTUBE_AUDIT_PASSED');
  const ttDirect = has(env, 'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_AUDIT_PASSED');
  const metaDirect = has(env, 'META_APP_ID', 'META_APP_SECRET', 'META_PUBLISH_REVIEWED');
  const mk = (
    network: ShareNetwork, label: string, format: string, direct: boolean,
    monetizationProgram: string, ownerStep: string, composerUrl: string,
  ): ShareTarget => ({
    network, label, format, mode: direct ? 'direct' : 'fallback', monetizationProgram, composerUrl,
    statusLine: direct
      ? 'Direct posting is connected for your account.'
      : `One-tap share: we copy your caption and open the ${label} composer — you press Post. Direct posting unlocks after ${ownerStep}.`,
  });
  return [
    mk('youtube', 'YouTube', 'Shorts', ytDirect, 'YouTube Partner Program',
      'Google OAuth verification + the YouTube API audit (app-owner step)', 'https://studio.youtube.com/channel/upload'),
    mk('tiktok', 'TikTok', 'TikTok video', ttDirect, 'TikTok Creator Rewards',
      "TikTok's Content Posting API audit (app-owner step)", 'https://www.tiktok.com/upload'),
    mk('instagram', 'Instagram', 'Reels', metaDirect, 'Meta Reels monetization',
      'Meta App Review for content publishing (app-owner step)', 'https://www.instagram.com/'),
    mk('facebook', 'Facebook', 'Reels', metaDirect, 'Meta monetization for Pages',
      'Meta App Review for Pages publishing (app-owner step)', 'https://www.facebook.com/'),
  ];
}

export const CAPTION_LIMITS: Record<ShareNetwork, number> = {
  youtube: 1000, tiktok: 2200, instagram: 2200, facebook: 2200,
};

/** The caption that goes out with a clip on one network: the AI post copy
 *  (or the hook when no copy was generated), trimmed to the network's
 *  caption limit at a word boundary. */
export function buildShareCaption(
  network: ShareNetwork,
  clip: { hook: string; caption: string },
): string {
  const body = (clip.caption || '').trim() || clip.hook.trim();
  const limit = CAPTION_LIMITS[network];
  if (body.length <= limit) return body;
  return `${body.slice(0, Math.max(40, limit - 1)).replace(/\s+\S*$/, '')}…`;
}

// ─── yt-dlp ingestion (pure helpers) ────────────────────────────────────────
// YouTube downloads run through yt-dlp (server/services/ytdlp.ts) — the
// industry-standard tool that tracks YouTube's changes. These helpers are
// the pure parts: which player clients to try, the exact CLI arguments,
// how to read a failure, and what to tell the user. The runner throws
// errors tagged with a YtdlpErrorCode so a known cause NEVER degrades to
// the generic "hit a problem" message (the @distube/ytdl-core failure
// mode this replaced: its error text matched no friendly pattern).

export type YtdlpErrorCode =
  | 'bot-blocked' | 'unavailable' | 'private' | 'age-restricted'
  | 'geo-blocked' | 'network' | 'binary-missing' | 'unknown';

/** Player clients in fallback order. `tv` (TVHTML5) is first: it is the
 *  client that currently answers from datacenter IPs without a sign-in
 *  (verified 2026-11-15 — the web player returns LOGIN_REQUIRED /
 *  "Sign in to confirm you're not a bot" with no formats at all, while
 *  tv returned downloadable formats for the same videos). */
export const YTDLP_DEFAULT_CLIENTS = ['tv', 'ios', 'android', 'web_safari'] as const;

const YT_CLIENT_OK = /^[a-z0-9_]+$/i;
/** Env override (CLIPPER_YTDLP_CLIENTS, comma list) → sanitized chain. */
export function ytdlpClientChain(envValue?: string): string[] {
  const parts = String(envValue || '').split(',').map((s) => s.trim()).filter((s) => YT_CLIENT_OK.test(s));
  return parts.length ? parts.slice(0, 8) : [...YTDLP_DEFAULT_CLIENTS];
}

export function buildYtdlpInfoArgs(url: string, clients: string[], noCheckCerts = false): string[] {
  return [
    '--no-warnings', '--no-playlist', '--socket-timeout', '30', '--retries', '3',
    '--extractor-args', `youtube:player_client=${clients.join(',')}`,
    ...(noCheckCerts ? ['--no-check-certificates'] : []),
    '--dump-single-json', url,
  ];
}

export function buildYtdlpDownloadArgs(
  url: string,
  opts: { outputTemplate: string; maxBytes: number; clients: string[]; ffmpegLocation?: string; noCheckCerts?: boolean },
): string[] {
  return [
    '--no-warnings', '--no-playlist', '--no-progress',
    '--socket-timeout', '30', '--retries', '5', '--fragment-retries', '10',
    '--extractor-args', `youtube:player_client=${opts.clients.join(',')}`,
    '--max-filesize', String(opts.maxBytes),
    // Best muxed-or-mergeable mp4 at ≤720p (the old ytdl-core pick),
    // loosening step by step rather than failing on a strict filter.
    '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]/b',
    '--merge-output-format', 'mp4',
    ...(opts.ffmpegLocation ? ['--ffmpeg-location', opts.ffmpegLocation] : []),
    ...(opts.noCheckCerts ? ['--no-check-certificates'] : []),
    '-o', opts.outputTemplate, url,
  ];
}

/** Read a yt-dlp failure (stderr/stdout text) into a stable code. Order
 *  matters: "Sign in to confirm your age" must land on age-restricted,
 *  not bot-blocked. */
export function classifyYtdlpError(text: string): YtdlpErrorCode {
  const m = String(text || '');
  if (/confirm your age|age-restricted|age restricted|inappropriate for some users/i.test(m)) return 'age-restricted';
  if (/sign in to confirm|login_required|not a bot/i.test(m)) return 'bot-blocked';
  if (/private video|video is private/i.test(m)) return 'private';
  if (/available in your country|geo.?restrict/i.test(m)) return 'geo-blocked';
  if (/video is unavailable|video unavailable|no longer available|has been removed|video.*not found/i.test(m)) return 'unavailable';
  if (/timed out|timeout|connection|network|ssl|certificate|eof occurred|HTTP Error 5\d\d|urlopen error/i.test(m)) return 'network';
  return 'unknown';
}

/** The exact user-facing sentence for each code — every one names the
 *  cause and points at the upload path, which always works. */
export function ytdlpErrorMessage(code: YtdlpErrorCode): string {
  switch (code) {
    case 'bot-blocked':
      return 'YouTube blocked this download from our server — it asked for a sign-in to confirm we are not a bot, which a server can\'t do. Upload the video file instead; uploads always work.';
    case 'unavailable':
      return 'That YouTube video is unavailable (removed, or the link is wrong), so there was nothing to download. Check the link — or upload the video file instead.';
    case 'private':
      return 'That YouTube video is private, so it can\'t be downloaded. Make it public or unlisted — or upload the video file instead.';
    case 'age-restricted':
      return 'That video is age-restricted on YouTube and can\'t be downloaded without an account sign-in. Upload the video file instead; uploads always work.';
    case 'geo-blocked':
      return 'YouTube blocks that video in our server\'s region, so it can\'t be downloaded. Upload the video file instead; uploads always work.';
    case 'network':
      return 'The YouTube download kept failing on the network (timeouts or connection errors). Try again in a bit — or upload the video file instead.';
    case 'binary-missing':
      return 'YouTube downloads aren\'t available on this server right now (the downloader tool is missing). Upload the video file instead; uploads always work.';
    default:
      return 'The YouTube download failed for a reason we couldn\'t identify. Try again — or upload the video file instead; uploads always work.';
  }
}

// ─── Upload fallback (pure validation) ──────────────────────────────────────
// Uploads ride the durable asset store (content-asset-store.ts), whose
// cap is 25MB — so uploads are capped there too. Bigger sources belong
// on the link path (600MB cap). Duration is probed after upload with the
// same 60-minute cap as links.

export const CLIPPER_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const CLIPPER_UPLOAD_MIMES = [
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-msvideo',
];
const CLIPPER_UPLOAD_EXTS = ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi'];

export function validateClipperUpload(
  input: { size?: number; mime?: string; name?: string },
): { ok: true } | { ok: false; error: string } {
  const size = Number(input?.size || 0);
  if (!size) return { ok: false, error: 'No file was received — pick a video file and try again.' };
  if (size > CLIPPER_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: `That file is ${(size / (1024 * 1024)).toFixed(1)}MB — uploads are capped at 25MB. For a bigger video, paste a direct file link instead.`,
    };
  }
  const mime = String(input?.mime || '').toLowerCase();
  const ext = String(input?.name || '').split('.').pop()?.toLowerCase() || '';
  if (!CLIPPER_UPLOAD_MIMES.includes(mime) && !CLIPPER_UPLOAD_EXTS.includes(ext)) {
    return { ok: false, error: 'That file is not a video we can read — upload an MP4, MOV, WebM or MKV.' };
  }
  return { ok: true };
}

// ─── Job steps ──────────────────────────────────────────────────────────────

export const CLIPPER_STEPS = [
  'Downloading the video', 'Transcribing', 'Finding the viral moments',
  'Cutting your clips', 'Saving to your library',
] as const;

/** Progress % band for a pipeline step (0-based) — jobs report the band
 *  start; sub-progress inside a step is the runner's business. */
export function clipperStepProgress(stepIndex: number): number {
  const bands = [5, 25, 50, 68, 92];
  return bands[Math.max(0, Math.min(bands.length - 1, stepIndex))];
}
