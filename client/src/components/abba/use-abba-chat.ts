// ─── ABBA shared chat core ──────────────────────────────────────────────────
// ONE chat implementation for every ABBA surface (floating assistant +
// dedicated ABBA page), extracted from travis-assistant.tsx in the Phase A
// unification: message state, the stream-first send flow (POST
// /api/abba/stream with POST /api/abba/chat as fallback), idea/setup draft
// handling, and speaking the COMPLETED reply through the shared voice
// module (server TTS chain). Surfaces differ only in chrome: the floating
// panel adds its context/sync bars, the page adds its tabs around this core.
import { useState, useRef, useCallback } from 'react';
import type { IdeaDraft } from "@/components/abba/idea-lab";

export interface PlanProposal {
  pairs: string[];
  sessions: string[];
  direction: 'BUY' | 'SELL' | 'BOTH';
  strategyType: string;
  profitTarget: number | null;
  accountBalance: number | null;
  lotSize: number | null;
  riskLevel: string;
  tradingDays: string[];
  maxTradesPerDay: number | null;
  notes: string;
  missingFields: string[];
  summary: string;
}

export interface AbbaChatMessage {
  id: string;
  role: 'user' | 'abba';
  content: string;
  timestamp: Date;
  navigateTo?: string | null;
  planProposal?: PlanProposal | null;
  ideaDraft?: IdeaDraft | null;
  setupDraft?: any;
  suggestions?: string[];
  audioUrl?: string; // blob URL for tap-to-play
}

export const genAbbaId = () => Math.random().toString(36).slice(2, 10);

export interface UseAbbaChatOptions {
  voiceEnabled: boolean;
  speak: (text: string, msgId?: string, onAudioReady?: (url: string) => void) => void;
  stopSpeaking: () => void;
  safeSetSpeaking: (val: boolean) => void;
  onContext?: (ctx: any) => void;
  onNeedsKey?: () => void;
  currentPage?: string;
  initialMessages?: AbbaChatMessage[];
}

export function useAbbaChat(opts: UseAbbaChatOptions) {
  const [messages, setMessages] = useState<AbbaChatMessage[]>(opts.initialMessages ?? []);
  const [isStreaming, setIsStreaming] = useState(false);
  // Latest options + messages behind refs so sendMessage stays stable and
  // never acts on a stale closure (voice toggles, page changes, history).
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const streamingRef = useRef(false);

  const sendMessage = useCallback(async (msg: string) => {
    const o = optsRef.current;
    if (!msg.trim() || streamingRef.current) return;
    streamingRef.current = true;
    const history = messagesRef.current.slice(-8).map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { id: genAbbaId(), role: 'user', content: msg, timestamp: new Date() }]);

    // Stop any in-progress speech — stops server-TTS playback AND invalidates
    // a still-fetching TTS request from the previous reply (speak generation),
    // so the old reply can never start talking over this one.
    o.stopSpeaking();

    const msgId = genAbbaId();
    // Add empty ABBA bubble that fills in as stream arrives
    setMessages(prev => [...prev, { id: msgId, role: 'abba', content: '', timestamp: new Date() }]);
    setIsStreaming(true);
    let ttsKickedOff = false;

    try {
      const res = await fetch('/api/abba/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: msg, history, currentPage: o.currentPage }),
      });

      if (!res.ok || !res.body) throw new Error('Stream unavailable');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let fullText = '';
      let streamFailed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const parts = sseBuffer.split('\n\n');
        sseBuffer = parts.pop() || '';

        for (const part of parts) {
          let eventType = 'message';
          let dataStr = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;
          let parsed: any;
          try { parsed = JSON.parse(dataStr); } catch { continue; }

          if (eventType === 'text') {
            fullText += parsed.text;
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m));
            // No mid-stream speech: the full reply is spoken via the server
            // TTS chain once the stream completes (below).
          }

          if (eventType === 'done') {
            if (parsed.context) o.onContext?.(parsed.context);
            setMessages(prev => prev.map(m => m.id === msgId ? {
              ...m,
              // navigateTo stored on message — the surface shows a "Take me
              // there" affordance. We do NOT auto-navigate.
              navigateTo: parsed.navigateTo || null,
              planProposal: parsed.planProposal || null,
              ideaDraft: parsed.ideaDraft || null,
              setupDraft: parsed.setupDraft || null,
              suggestions: parsed.suggestions || [],
            } : m));
          }

          if (eventType === 'error') {
            streamFailed = true;
            if (parsed.needsApiKey) o.onNeedsKey?.();
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: parsed.error || 'Something went wrong.' } : m));
          }
        }
      }

      // ── Stream complete: speak the FULL reply through the server TTS chain
      // (/api/abba/tts — ElevenLabs → OpenAI → Edge). Browser speechSynthesis
      // is only speak()'s internal error fallback. Trade-off: speech starts
      // at reply completion (~1–2s) instead of mid-stream.
      if (o.voiceEnabled && !streamFailed && fullText.trim()) {
        ttsKickedOff = true;
        o.speak(fullText, msgId, (url) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, audioUrl: url } : m)));
      }

    } catch {
      // Fallback to non-streaming chat
      try {
        const fallback = await fetch('/api/abba/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message: msg, history, currentPage: o.currentPage }),
        });
        const data = await fallback.json();
        if (data.context) o.onContext?.(data.context);
        setMessages(prev => prev.map(m => m.id === msgId ? {
          ...m, content: data.response || data.reply || 'Systems offline.',
          navigateTo: data.navigateTo || null, planProposal: data.planProposal || null,
          ideaDraft: data.ideaDraft || null, setupDraft: data.setupDraft || null,
          suggestions: data.suggestions || [],
        } : m));
        const replyText = data.response || data.reply;
        if (replyText && o.voiceEnabled) { ttsKickedOff = true; o.speak(replyText, msgId, (url) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, audioUrl: url } : m))); }
      } catch {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: 'Connection lost. Please try again.' } : m));
      }
    } finally {
      streamingRef.current = false;
      setIsStreaming(false);
      // If no TTS was kicked off for this reply, clear the speaking indicator
      if (!ttsKickedOff) o.safeSetSpeaking(false);
    }
  }, []);

  return { messages, setMessages, isStreaming, sendMessage };
}
