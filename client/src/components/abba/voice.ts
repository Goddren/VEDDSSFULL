// ─── ABBA shared voice module ─────────────────────────────────────────────
// ONE voice implementation for every ABBA surface (floating assistant +
// the dedicated ABBA page): speech recognition, the server-TTS-first speak
// path (/api/abba/tts — ElevenLabs → OpenAI → Edge) with browser
// speechSynthesis ONLY as the error fallback, voice presets, and the
// X-TTS-Provider label so a fallback is always visible. Extracted from
// travis-assistant.tsx in the Phase A unification so both surfaces sound
// and behave identically by construction.
import { useState, useRef, useCallback } from 'react';

// ── Browser speech support detection ─────────────────────────────────────────
export const hasSpeechRecognition = typeof window !== 'undefined' &&
  !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
export const hasSpeechSynthesis = typeof window !== 'undefined' && !!window.speechSynthesis;

// ── Async voice loader — Chrome/Edge load voices lazily; getVoices() returns [] on first call ──
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise(resolve => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) return resolve(voices);
    const handler = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler);
    // Safety: some browsers never fire voiceschanged
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(window.speechSynthesis.getVoices());
    }, 2000);
  });
}


// ── Voice style presets ───────────────────────────────────────────────────────
export const ABBA_VOICE_PRESETS = [
  { id: 'urban_male',   label: 'Urban Male',   openaiVoice: 'onyx',    elevenLabsId: 'pNInz6obpgDQGcFmaJgB', description: 'Deep, authoritative — ABBA default' },
  { id: 'street_male',  label: 'Street Male',  openaiVoice: 'fable',   elevenLabsId: 'TxGEqnHWrfWFTfGW9XjX', description: 'Younger, casual male energy' },
  { id: 'deep_male',    label: 'Deep Male',    openaiVoice: 'echo',    elevenLabsId: '2EiwWnXFnvU5JabPnv8n', description: 'Mature, warm, commanding' },
  { id: 'female',       label: 'Female',       openaiVoice: 'nova',    elevenLabsId: '21m00Tcm4TlvDq8ikWAM', description: 'Clear, intelligent female voice' },
] as const;
export type AbbaVoicePresetId = typeof ABBA_VOICE_PRESETS[number]['id'];

// ── Which provider actually produced the last spoken audio (X-TTS-Provider) ──
// Surfaced in the header so a silent fallback to a robotic voice is visible.
export const TTS_PROVIDER_LABELS: Record<string, string> = {
  elevenlabs: 'ElevenLabs',
  openai: 'OpenAI voice',
  edge: 'Edge voice (fallback)',
  browser: 'Browser voice (fallback)',
};

export function useVoice(onTranscript: (text: string, isFinal: boolean) => void) {
  const recognitionRef    = useRef<any>(null);
  const audioRef          = useRef<HTMLAudioElement | null>(null);
  const primedAudioRef    = useRef<HTMLAudioElement | null>(null); // pre-unlocked element for iOS fallback
  const audioCtxRef       = useRef<AudioContext | null>(null);
  const audioSourceRef    = useRef<AudioBufferSourceNode | null>(null);
  const speakingTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic speak generation — every speak()/stopSpeaking() bumps it, so a
  // TTS fetch that resolves after the user stopped or sent a new message can
  // never start playing the stale reply.
  const speakGenRef       = useRef(0);
  const [isListening,  setIsListening]  = useState(false);
  const [isSpeaking,   setIsSpeaking]   = useState(false);
  const [ttsProvider,  setTtsProvider]  = useState<string | null>(null);
  // Why the last speak() fell back (e.g. "TTS request failed (503)") — shown
  // beside the fallback label so a server-side TTS failure is distinguishable
  // from an on-device playback block (live-test evidence, PR #36 follow-up).
  const [ttsError,     setTtsError]     = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    try { return localStorage.getItem('abba_voice') !== 'off'; } catch { return true; }
  });
  const [voicePreset, setVoicePresetState] = useState<AbbaVoicePresetId>(() => {
    try { return (localStorage.getItem('abba_voice_preset') as AbbaVoicePresetId) || 'urban_male'; } catch { return 'urban_male'; }
  });

  const setVoicePreset = useCallback((preset: AbbaVoicePresetId) => {
    setVoicePresetState(preset);
    try { localStorage.setItem('abba_voice_preset', preset); } catch {}
  }, []);

  // ── Audio unlock — MUST be called directly inside a user gesture (tap/click) ─
  // On iOS Safari and Android Chrome, audio is blocked until the AudioContext
  // is resumed AND a buffer is played while the gesture is still active.
  // Called on EVERY gesture (not just first) so the primed element stays fresh.
  const unlockAudio = useCallback(() => {
    // ── 1. Web Audio API unlock (synchronous silent buffer during gesture) ──
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        if (!audioCtxRef.current) audioCtxRef.current = new AC();
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      }
    } catch { /* ignore */ }
    // ── 2. HTML5 Audio element unlock — re-primed on EVERY gesture ──
    // iOS Safari allows future audio.src = url; audio.play() on an element
    // that was .play()'d during a user gesture. We refresh on every tap so the
    // element stays authorised for the CURRENT message, not just the first one.
    try {
      const silent = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAA=';
      // Reuse existing element if idle, otherwise create a fresh one
      const a = (primedAudioRef.current && !audioRef.current) ? primedAudioRef.current : new Audio(silent);
      a.src = silent;
      a.volume = 0.001;
      a.play().then(() => { a.pause(); a.volume = 1.0; }).catch(() => {});
      primedAudioRef.current = a;
    } catch { /* ignore */ }
  }, []);

  // Safety: always clear the isSpeaking flag after a max duration
  const safeSetSpeaking = useCallback((val: boolean) => {
    setIsSpeaking(val);
    if (val) {
      if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = setTimeout(() => setIsSpeaking(false), 60_000);
    } else {
      if (speakingTimerRef.current) { clearTimeout(speakingTimerRef.current); speakingTimerRef.current = null; }
    }
  }, []);

  // ── STT ───────────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!hasSpeechRecognition) return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SpeechRec();
    rec.continuous     = false;
    rec.interimResults = true;
    rec.lang           = 'en-US';
    rec.onstart  = () => setIsListening(true);
    rec.onend    = () => setIsListening(false);
    rec.onerror  = () => setIsListening(false);
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript).join('');
      const isFinal = e.results[e.results.length - 1]?.isFinal ?? false;
      onTranscript(transcript, isFinal);
    };
    recognitionRef.current = rec;
    rec.start();
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // ── Browser TTS fallback — loads voices async (fixes Chrome empty-array bug) ─
  const browserSpeak = useCallback(async (text: string) => {
    setTtsProvider('browser');
    if (!hasSpeechSynthesis) { safeSetSpeaking(false); return; }
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*_~`#>]/g, '').replace(/\[.*?\]/g, '').trim().slice(0, 1000);
      if (!clean) { safeSetSpeaking(false); return; }
      const voices = await loadVoices();
      // Prioritise deep male voices for ABBA's authoritative street tone
      const preferred = voices.find(v => /microsoft guy|microsoft david|google uk english male|daniel|alex|reed|liam|james/i.test(v.name))
                     || voices.find(v => /en-US/i.test(v.lang) && /male/i.test(v.name))
                     || voices.find(v => /male/i.test(v.name))
                     || voices[0];
      const utt    = new SpeechSynthesisUtterance(clean);
      utt.rate     = 0.92; // slightly slower = more authoritative delivery
      utt.pitch    = 0.78; // lower pitch = deeper, more commanding voice
      utt.volume   = 1.0;
      if (preferred) utt.voice = preferred;
      utt.onend    = () => safeSetSpeaking(false);
      utt.onerror  = () => safeSetSpeaking(false);
      safeSetSpeaking(true);
      window.speechSynthesis.speak(utt);
    } catch {
      safeSetSpeaking(false);
    }
  }, [safeSetSpeaking]);

  // ── Primary TTS — fetches audio from server, plays via Web Audio API (mobile-safe) ──
  // Web Audio API (AudioContext) works on iOS/Android AFTER unlockAudio() has been called
  // once in a gesture. Unlike new Audio().play(), it is NOT blocked by autoplay policies
  // in subsequent async calls once the context is running.
  const speak = useCallback(async (text: string, msgId?: string, onAudioReady?: (url: string) => void) => {
    if (!voiceEnabled) return;
    if (!text?.trim()) return;
    const gen = ++speakGenRef.current;

    // Stop any current playback
    if (audioSourceRef.current) { try { audioSourceRef.current.stop(); } catch {} audioSourceRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (hasSpeechSynthesis) window.speechSynthesis.cancel();

    const trimmed = text.replace(/[*_~`#>]/g, '').replace(/\[.*?\]/g, '').trim().slice(0, 1200);
    safeSetSpeaking(true);

    try {
      const activePreset = ABBA_VOICE_PRESETS.find(p => p.id === voicePreset) || ABBA_VOICE_PRESETS[0];
      const res = await fetch('/api/abba/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: trimmed, voiceId: activePreset.elevenLabsId, openaiVoice: activePreset.openaiVoice }),
      });

      if (!res.ok) { setTtsError(`TTS request failed (${res.status})`); throw new Error('TTS unavailable'); }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('audio')) { setTtsError('TTS returned no audio'); throw new Error('Not audio'); }
      // Surface which provider in the chain actually served this audio
      const provider = res.headers.get('x-tts-provider');
      if (provider) setTtsProvider(provider);

      const blob = await res.blob();
      if (gen !== speakGenRef.current) return; // superseded while fetching — stay silent
      if (blob.size < 100) { setTtsError('TTS returned empty audio'); throw new Error('Empty audio'); }
      setTtsError(null); // server audio arrived — any fallback from here is a playback block, labeled below

      // Store blob URL on message for tap-to-play button
      const url = URL.createObjectURL(blob);
      if (onAudioReady) onAudioReady(url);

      // ── Try Web Audio API first (works on iOS/Android once unlocked) ──
      // We call ctx.resume() here too — once the context was user-activated via
      // unlockAudio() during a gesture, subsequent resume() calls succeed even
      // outside a gesture. This covers the case where ctx.state is still
      // 'suspended' because the earlier resume() promise hadn't resolved yet.
      const ctx = audioCtxRef.current;
      if (ctx) {
        try {
          if (ctx.state !== 'running') await ctx.resume();
          const arrayBuffer = await blob.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arrayBuffer);
          if (gen !== speakGenRef.current) return; // superseded while decoding
          const src = ctx.createBufferSource();
          src.buffer = decoded;
          src.connect(ctx.destination);
          src.onended = () => { safeSetSpeaking(false); audioSourceRef.current = null; };
          audioSourceRef.current = src;
          src.start(0);
          return; // Successfully playing via Web Audio API
        } catch {
          // Web Audio failed — fall through to HTML5 Audio
        }
      }

      // ── Fallback: HTML5 Audio — reuse the primed element if available ──
      // The primed element was .play()'d during a user gesture so iOS allows
      // subsequent src-swap + play() calls without a new gesture.
      // Do NOT null it out — keep the reference alive for the next message.
      const audio = primedAudioRef.current || new Audio();
      audio.src = url;
      audio.volume = 1.0;
      audioRef.current = audio;
      audio.onended = () => { safeSetSpeaking(false); audioRef.current = null; };
      audio.onerror = () => { if (gen !== speakGenRef.current) return; setTtsError('Audio playback failed on this device'); safeSetSpeaking(false); audioRef.current = null; browserSpeak(trimmed); };
      await audio.play().catch(async () => {
        if (gen !== speakGenRef.current) return; // superseded — don't fall back for a stale reply
        setTtsError('Audio playback blocked on this device');
        safeSetSpeaking(false);
        audioRef.current = null;
        await browserSpeak(trimmed);
      });
    } catch {
      if (gen !== speakGenRef.current) return; // superseded — stay silent
      safeSetSpeaking(false);
      await browserSpeak(trimmed);
    }
  }, [voiceEnabled, browserSpeak, safeSetSpeaking]);

  // ── Play a stored audio URL on user tap (bypasses autoplay policy) ───────────
  const playStoredAudio = useCallback((url: string) => {
    // Stop ALL active audio sources before playing — prevents overlap on double-press
    if (audioSourceRef.current) { try { audioSourceRef.current.stop(); } catch {} audioSourceRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (hasSpeechSynthesis) window.speechSynthesis.cancel();
    const audio = new Audio(url);
    audio.volume = 1.0;
    audioRef.current = audio;
    safeSetSpeaking(true);
    audio.onended = () => { safeSetSpeaking(false); audioRef.current = null; };
    audio.onerror = () => { safeSetSpeaking(false); audioRef.current = null; };
    audio.play().catch(() => safeSetSpeaking(false));
  }, [safeSetSpeaking]);

  const stopSpeaking = useCallback(() => {
    speakGenRef.current++; // invalidate any in-flight TTS fetch for the old reply
    if (audioSourceRef.current) { try { audioSourceRef.current.stop(); } catch {} audioSourceRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (hasSpeechSynthesis) window.speechSynthesis.cancel();
    safeSetSpeaking(false);
  }, [safeSetSpeaking]);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('abba_voice', next ? 'on' : 'off'); } catch {}
      if (!next) {
        speakGenRef.current++; // invalidate any in-flight TTS fetch
        if (audioSourceRef.current) { try { audioSourceRef.current.stop(); } catch {} audioSourceRef.current = null; }
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        window.speechSynthesis?.cancel();
        safeSetSpeaking(false);
      }
      return next;
    });
  }, [safeSetSpeaking]);

  return { isListening, isSpeaking, ttsProvider, ttsError, voiceEnabled, voicePreset, setVoicePreset, startListening, stopListening, speak, stopSpeaking, toggleVoice, playStoredAudio, unlockAudio, audioRef, audioCtxRef, audioSourceRef, safeSetSpeaking, primedAudioRef, browserSpeak };
}

