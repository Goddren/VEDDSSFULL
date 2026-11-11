/**
 * Audio stage for Content Studio clips/reels (content-video.ts): a narrator
 * voiceover + a music bed, mixed onto the rendered clip in post-production.
 *
 * WHY POST: every provider in the clip chain renders SILENT video —
 * OpenRouter is called with generate_audio:false on purpose (PR #47: the
 * model's native audio can't be steered to the brand voice, and silent
 * renders bill cheaper), and the Wan/fal paths are silent too. So sound is
 * added here, after the render, alongside the ffmpeg branding step:
 *
 *   1. NARRATION — text comes from the render itself when it carries one
 *      (reel jobs pass their voiceover script: hook + script lines). Clip
 *      jobs carry no script, so one cheap AI call writes 1–2 sentences
 *      (≤35 words) from the shot/prompt. Speech is synthesized through
 *      OpenRouter's speech endpoint on the platform OPENROUTER_API_KEY —
 *      the same request shape and model order as the ABBA TTS chain in
 *      routes.ts (ElevenLabs eleven-turbo-v2.5 first, with the app's
 *      urban-male voice — Yusuf Hakeem Kiser, whose library ID passes
 *      through raw per PR #41 — then OpenAI gpt-4o-mini-tts 'onyx').
 *      VIDEO_TTS_MODEL / VIDEO_TTS_VOICE override the primary step.
 *   2. MUSIC — a royalty-free bed from server/assets/audio (all CC0, see
 *      LICENSES.md in that folder). VIDEO_MUSIC_BED picks the file.
 *   3. MIX — the pipeline's ffmpeg: narration full volume, the bed looped
 *      under it at ~-18 dB and sidechain-ducked further while the narrator
 *      speaks, fades in/out, AAC out, video stream copied untouched.
 *
 * FAILURE IS NEVER FATAL: a paid render must not die over sound. If TTS
 * fails the clip ships music-only; if the mix itself fails the caller
 * ships the silent clip. Either way the job metadata records what audio
 * actually landed (audio.narration / audio.musicBed, plus a reason when
 * something is 'none'). Kill switch: VIDEO_AUDIO=off skips the stage
 * entirely and restores the old silent behavior exactly.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { runFfmpeg, probe as probeVideo } from './ffmpeg';

export interface VideoAudioMeta {
  /** 'openrouter:<model>' when narration was synthesized, else 'none'. */
  narration: string;
  /** Shipped bed filename (e.g. 'bed-groove.mp3'), else 'none'. */
  musicBed: string;
  /** Why a component is 'none' (first failure reason), when applicable. */
  reason?: string;
}

const MAX_NARRATION_WORDS = 35;
const TTS_TIMEOUT_MS = 30000;
// ABBA's urban_male preset: Yusuf Hakeem Kiser (ElevenLabs Voice Library).
// OpenRouter's ElevenLabs models accept library voices by raw ID.
const DEFAULT_TTS_VOICE = 'nJvj5shg2xu1GKGxqfkE';
const DEFAULT_TTS_MODEL = 'elevenlabs/eleven-turbo-v2.5';
// Same fallback model the ABBA chain uses on OpenRouter.
const FALLBACK_TTS_MODEL = 'openai/gpt-4o-mini-tts-2025-12-15';
const FALLBACK_TTS_VOICE = 'onyx';
const DEFAULT_BED = 'bed-groove.mp3';

export function videoAudioEnabled(): boolean {
  return process.env.VIDEO_AUDIO !== 'off';
}

/* ── Music beds ──────────────────────────────────────────────────────────── */

// The server ships bundled (dist/) but the assets stay in the source tree,
// so resolve against both the working directory (dev + Render) and the
// bundle's location (dist/<file> -> ../server/assets/audio).
const AUDIO_DIR_CANDIDATES = [
  path.resolve(process.cwd(), 'server/assets/audio'),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server/assets/audio'),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../server/assets/audio'),
];

function audioDir(): string | null {
  return AUDIO_DIR_CANDIDATES.find((d) => fs.existsSync(d)) ?? null;
}

export function listMusicBeds(): string[] {
  const dir = audioDir();
  if (!dir) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(mp3|ogg|wav|m4a)$/i.test(f))
    .sort();
}

/** The bed to mix: VIDEO_MUSIC_BED override, else the house default, else any bed. */
export function resolveMusicBed(): { name: string; file: string } | null {
  const dir = audioDir();
  if (!dir) return null;
  const beds = listMusicBeds();
  if (!beds.length) return null;
  const wanted = (process.env.VIDEO_MUSIC_BED || '').trim();
  const name = (wanted && beds.includes(wanted)) ? wanted : (beds.includes(DEFAULT_BED) ? DEFAULT_BED : beds[0]);
  return { name, file: path.join(dir, name) };
}

/* ── Narration text ──────────────────────────────────────────────────────── */

/**
 * Clean + cap narration text: strip markdown/URLs (same spirit as the ABBA
 * TTS cleanup), then keep whole sentences up to MAX_NARRATION_WORDS. A first
 * sentence longer than the cap is hard-truncated — the narrator never reads
 * a paragraph over a 6-second clip.
 */
export function capNarrationText(raw: string): string {
  const clean = String(raw || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_~`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
  if (!clean) return '';
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  const out: string[] = [];
  let words = 0;
  for (const s of sentences) {
    const w = s.trim().split(/\s+/).filter(Boolean).length;
    if (words + w > MAX_NARRATION_WORDS) break;
    out.push(s.trim());
    words += w;
  }
  if (out.length) return out.join(' ');
  return clean.split(/\s+/).slice(0, MAX_NARRATION_WORDS).join(' ');
}

/** One cheap AI call: write the voiceover for a clip that carries no script. */
async function generateNarrationText(sourceText: string, userId?: number): Promise<string> {
  const { getUniversalAIClientForUser } = await import('../openai');
  const ai: any = await getUniversalAIClientForUser(userId || 0);
  const completion = await ai.chat.completions.create({
    model: ai.defaultModel || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You write narrator voiceovers for very short social videos for VEDD Trading AI, a faith-driven financial education platform. Brand voice: confident, empowering, street-urban authentic, no fluff. Answer with the voiceover text ONLY — no labels, no quotes, no hashtags.',
      },
      {
        role: 'user',
        content: `Write a voiceover of 1-2 sentences, at most ${MAX_NARRATION_WORDS} words, to be read aloud over a 6-second vertical video. It must fit this scene/topic: """${sourceText.slice(0, 800)}"""\n\nRules: spoken language, present tense, one clear idea, ends on the payoff. No profit promises, no win-rate or income claims, no "guaranteed" language.`,
      },
    ],
    max_tokens: 120,
  });
  return capNarrationText(String(completion.choices?.[0]?.message?.content || ''));
}

/* ── Speech synthesis (OpenRouter, mirroring the ABBA TTS chain) ────────── */

interface SpeechResult { buffer: Buffer; model: string }

async function tryOpenRouterSpeech(key: string, model: string, voice: string, text: string): Promise<SpeechResult | null> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      // response_format pinned to mp3 — the endpoint defaults to pcm.
      body: JSON.stringify({ model, input: text, voice, response_format: 'mp3' }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[video-audio] TTS ${model} ${res.status}:`, errText.slice(0, 200), '— falling back');
      return null;
    }
    const ct = res.headers.get('content-type') || '';
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!ct.includes('audio') || buffer.length < 100) {
      console.warn(`[video-audio] TTS ${model} returned no usable audio (${ct || 'unknown content type'}, ${buffer.length} bytes)`);
      return null;
    }
    return { buffer, model };
  } catch (e: any) {
    console.warn(`[video-audio] TTS ${model} error:`, e?.message || e, '— falling back');
    return null;
  }
}

/**
 * Synthesize narration on the platform OpenRouter balance: the app's
 * urban-male ElevenLabs voice via eleven-turbo-v2.5 first (ABBA's chain
 * order), OpenAI gpt-4o-mini-tts 'onyx' as the fallback. Returns null when
 * no key is configured or every attempt fails — never throws.
 */
export async function synthesizeNarration(text: string): Promise<SpeechResult | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.warn('[video-audio] OPENROUTER_API_KEY not set — narration skipped');
    return null;
  }
  const primary = {
    model: (process.env.VIDEO_TTS_MODEL || '').trim() || DEFAULT_TTS_MODEL,
    voice: (process.env.VIDEO_TTS_VOICE || '').trim() || DEFAULT_TTS_VOICE,
  };
  const attempts = [primary];
  if (primary.model !== FALLBACK_TTS_MODEL) {
    attempts.push({ model: FALLBACK_TTS_MODEL, voice: FALLBACK_TTS_VOICE });
  } else if (!process.env.VIDEO_TTS_VOICE) {
    primary.voice = FALLBACK_TTS_VOICE; // an OpenAI model can't use an ElevenLabs voice ID
  }
  for (const a of attempts) {
    const hit = await tryOpenRouterSpeech(key, a.model, a.voice, text);
    if (hit) return hit;
  }
  return null;
}

/* ── The mix ─────────────────────────────────────────────────────────────── */

export interface ApplyAudioOptions {
  /** Script/caption text the render already carries (reels) — read as-is. */
  narrationText?: string;
  /** Prompt/shot text to write narration from when none is carried (clips). */
  sourceText?: string;
  userId?: number;
}

/**
 * Mix narration + music bed onto a rendered clip. Resolves with the mixed
 * MP4 and metadata describing the audio that actually landed, or null when
 * the mix itself failed (caller ships the silent clip). Never throws.
 */
export async function applyVideoAudio(video: Buffer, opts: ApplyAudioOptions = {}): Promise<{ buffer: Buffer; audio: VideoAudioMeta } | null> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedd-audio-'));
  const src = path.join(dir, 'in.mp4');
  const dst = path.join(dir, 'out.mp4');
  try {
    fs.writeFileSync(src, video);
    const info = await probeVideo(src).catch(() => null);
    const dur = info?.duration || 0;
    if (!(dur > 0)) {
      console.warn('[video-audio] could not read clip duration — skipping audio stage');
      return null;
    }
    const D = Math.round(dur * 100) / 100;

    let reason: string | undefined;
    // 1) Narration text: carried script first, AI-written from the shot second.
    let text = capNarrationText(opts.narrationText || '');
    if (!text && opts.sourceText?.trim()) {
      text = await generateNarrationText(opts.sourceText, opts.userId).catch((e: any) => {
        console.warn('[video-audio] narration writing failed:', e?.message || e);
        return '';
      });
      if (!text) reason = 'narration text unavailable';
    }
    // 2) Speech.
    let speech: SpeechResult | null = null;
    let narrFile: string | null = null;
    if (text) {
      speech = await synthesizeNarration(text);
      if (speech) {
        narrFile = path.join(dir, 'narr.mp3');
        fs.writeFileSync(narrFile, speech.buffer);
      } else {
        reason = reason || 'narration synthesis failed';
      }
    }
    // 3) Music bed.
    const bed = resolveMusicBed();
    if (!bed) reason = reason || 'no music bed available';

    if (!speech && !bed) {
      console.warn('[video-audio] no audio components available — shipping silent clip');
      return null;
    }

    // 4) ffmpeg mix. Input order: 0 = video, then narration, then bed.
    const args: string[] = ['-y', '-i', src];
    let narrIdx = -1;
    let bedIdx = -1;
    if (narrFile) { narrIdx = 1; args.push('-i', narrFile); }
    if (bed) { bedIdx = narrFile ? 2 : 1; args.push('-stream_loop', '-1', '-i', bed.file); }

    const fadeOutStart = Math.max(0, D - 0.8).toFixed(2);
    const parts: string[] = [];
    const mixLabels: string[] = [];
    // A source clip that already carries audio (rare in this chain) keeps it.
    if (info?.hasAudio) {
      parts.push(`[0:a]aresample=44100,apad,atrim=0:${D}[orig]`);
      mixLabels.push('[orig]');
    }
    if (narrFile) {
      if (bed) {
        // Split the narration: one copy to the mix, one to drive the ducking.
        parts.push(`[${narrIdx}:a]aresample=44100,asplit=2[narrMix][narrSc]`);
        parts.push(`[narrMix]apad,atrim=0:${D}[narr]`);
      } else {
        parts.push(`[${narrIdx}:a]aresample=44100,apad,atrim=0:${D}[narr]`);
      }
      mixLabels.push('[narr]');
    }
    if (bed) {
      // ~-18 dB under the narration (0.16 linear) before the ducker; a touch
      // louder when the bed plays alone.
      const bedVol = narrFile ? '0.16' : '0.25';
      parts.push(`[${bedIdx}:a]aresample=44100,atrim=0:${D},volume=${bedVol},afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeOutStart}:d=0.8[bedRaw]`);
      if (narrFile) {
        parts.push(`[bedRaw][narrSc]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=350[bed]`);
      } else {
        parts.push(`[bedRaw]anull[bed]`);
      }
      mixLabels.push('[bed]');
    }
    if (mixLabels.length === 1) {
      parts.push(`${mixLabels[0]}alimiter=limit=0.9,aresample=44100[aout]`);
    } else {
      parts.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:normalize=0,alimiter=limit=0.9,aresample=44100[aout]`);
    }
    args.push(
      '-filter_complex', parts.join(';'),
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', dst,
    );
    await runFfmpeg(args, 120000);
    const buffer = fs.readFileSync(dst);
    const audio: VideoAudioMeta = {
      narration: speech ? `openrouter:${speech.model}` : 'none',
      musicBed: bed ? bed.name : 'none',
    };
    if (!text && !reason) reason = 'no narration text provided';
    if (reason && (!speech || !bed)) audio.reason = reason;
    console.log(`[video-audio] mixed: narration=${audio.narration} bed=${audio.musicBed} (${buffer.length} bytes)`);
    return { buffer, audio };
  } catch (e: any) {
    console.warn('[video-audio] audio stage failed, shipping silent clip:', e?.message || e);
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
