/**
 * Accurate candlestick patterns drawn over explainer scenes.
 *
 * AI video models draw random squiggles, so a "bullish engulfing" scene never
 * actually showed one. For scenes that explain a pattern, we draw the real
 * thing with ffmpeg drawbox: a dark chart panel in the lower part of the
 * frame, candles appearing one by one, the pattern candles last, then a gold
 * box around the pattern held to the end of the scene. No text, so no fonts
 * are needed. The narrator's audio from the scene keeps playing.
 */
export interface Candle { o: number; h: number; l: number; c: number }
export interface ChartSpec { candles: Candle[]; highlight: number[]; level?: number; range?: [number, number] }

const k = (o: number, h: number, l: number, c: number): Candle => ({ o, h, l, c });
const downtrend = [k(60, 61, 56, 57), k(57, 58, 53, 54), k(54, 56, 51, 55), k(55, 55.5, 50, 51), k(51, 52, 47, 48)];
const uptrend = [k(40, 44, 39, 43), k(43, 47, 42, 46), k(46, 47, 43, 45), k(45, 49, 44, 48), k(48, 52, 47, 51)];

export const PATTERNS: Record<string, ChartSpec> = {
  bullish_engulfing: { candles: [...downtrend, k(48, 48.5, 45.5, 46), k(45.5, 52, 45, 51.5)], highlight: [5, 6] },
  bearish_engulfing: { candles: [...uptrend, k(51, 53.5, 50.5, 53), k(53.5, 54, 47, 47.5)], highlight: [5, 6] },
  hammer: { candles: [...downtrend, k(48, 48.6, 42, 48.4)], highlight: [5] },
  shooting_star: { candles: [...uptrend, k(51, 57, 50.6, 51.2)], highlight: [5] },
  doji: { candles: [...uptrend, k(51, 53.5, 48.5, 51.05)], highlight: [5] },
  morning_star: { candles: [...downtrend, k(48, 48.5, 43, 43.5), k(43.2, 44, 42, 43.4), k(43.6, 49, 43.4, 48.6)], highlight: [5, 6, 7] },
  evening_star: { candles: [...uptrend, k(51, 56, 50.8, 55.5), k(55.8, 57, 55, 55.6), k(55.4, 55.6, 50, 50.6)], highlight: [5, 6, 7] },
  breakout: {
    candles: [k(50, 54, 49, 53), k(53, 55, 51, 52), k(52, 54.8, 50.5, 54), k(54, 55, 52, 52.5), k(52.5, 54.9, 51.5, 54.5), k(54.5, 60, 54, 59.5)],
    highlight: [5], level: 55,
  },
  support_bounce: {
    candles: [k(58, 59, 54, 55), k(55, 56, 50.5, 51), k(51, 53, 50.2, 52.5), k(52.5, 53, 50.1, 50.8), k(50.8, 51, 50, 50.6), k(50.6, 56, 50.3, 55.6)],
    highlight: [4, 5], level: 50,
  },
  opening_range_breakout: {
    candles: [k(50, 53, 48, 52), k(52, 53.5, 49, 49.5), k(49.5, 52.5, 48.5, 51), k(51, 53.2, 50, 52.8), k(52.8, 58, 52.5, 57.5), k(57.5, 60, 56.8, 59.5)],
    highlight: [4], range: [0, 2],
  },
};
export const PATTERN_KEYS = Object.keys(PATTERNS);

const GREEN = '0x27D07C', RED = '0xFF3B34', GOLD = '0xF5C451', PANEL = '0x0B0B0E', GRID = '0xFFFFFF';

/**
 * ffmpeg filter chain (no input/output labels) that draws the pattern onto a
 * WxH frame over `seconds`: candles from 0.6s, one every `step`, then the
 * gold highlight.
 */
export function chartFilter(spec: ChartSpec, W: number, H: number, seconds = 8): string {
  const px = Math.round(W * 0.06), pw = W - px * 2;
  const ph = Math.round(H * (W > H ? 0.58 : 0.47));
  const py = H - ph - Math.round(H * 0.07);
  const pad = Math.round(ph * 0.1);
  const n = spec.candles.length;
  const lo = Math.min(...spec.candles.map((c) => c.l), spec.level ?? Infinity);
  const hi = Math.max(...spec.candles.map((c) => c.h), spec.level ?? -Infinity);
  const y = (v: number) => Math.round(py + pad + (hi - v) / (hi - lo) * (ph - pad * 2));
  const slot = (pw - pad * 2) / n;
  const bodyW = Math.max(8, Math.round(slot * 0.64));
  const wickW = Math.max(2, Math.round(bodyW * 0.14));
  const start = 0.6, step = Math.min(0.45, (seconds - 3.2) / n);
  const showAt = (i: number) => (start + i * step).toFixed(2);
  const f: string[] = [];
  const box = (x: number, yy: number, w: number, h: number, color: string, t: string, enable?: string) =>
    f.push(`drawbox=x=${Math.round(x)}:y=${Math.round(yy)}:w=${Math.max(1, Math.round(w))}:h=${Math.max(1, Math.round(h))}:color=${color}:t=${t}${enable ? `:enable='${enable}'` : ''}`);

  box(px, py, pw, ph, `${PANEL}@0.86`, 'fill');
  box(px, py, pw, ph, `${GRID}@0.10`, '2');
  for (let g = 1; g < 4; g++) box(px + pad, py + (ph * g) / 4, pw - pad * 2, 1, `${GRID}@0.06`, 'fill');
  if (spec.level != null) box(px + pad, y(spec.level) - 2, pw - pad * 2, 4, `${GOLD}@0.75`, 'fill', `gte(t,${start})`);
  if (spec.range) {
    const [a, b] = spec.range;
    const rh = Math.max(...spec.candles.slice(a, b + 1).map((c) => c.h)), rl = Math.min(...spec.candles.slice(a, b + 1).map((c) => c.l));
    box(px + pad, y(rh), pw - pad * 2, y(rl) - y(rh), `${GOLD}@0.12`, 'fill', `gte(t,${showAt(b)})`);
    box(px + pad, y(rh) - 2, pw - pad * 2, 4, `${GOLD}@0.8`, 'fill', `gte(t,${showAt(b)})`);
    box(px + pad, y(rl) - 2, pw - pad * 2, 4, `${GOLD}@0.8`, 'fill', `gte(t,${showAt(b)})`);
  }
  spec.candles.forEach((c, i) => {
    const cx = px + pad + slot * i + slot / 2;
    const color = c.c >= c.o ? GREEN : RED;
    const en = `gte(t,${showAt(i)})`;
    box(cx - wickW / 2, y(c.h), wickW, y(c.l) - y(c.h), color, 'fill', en);
    const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
    box(cx - bodyW / 2, top, bodyW, Math.max(3, bot - top), color, 'fill', en);
  });
  if (spec.highlight.length) {
    const first = Math.min(...spec.highlight), last = Math.max(...spec.highlight);
    const hs = spec.highlight.map((i) => spec.candles[i]);
    const x0 = px + pad + slot * first + slot * 0.08, x1 = px + pad + slot * (last + 1) - slot * 0.08;
    const y0 = y(Math.max(...hs.map((c) => c.h))) - pad * 0.4, y1 = y(Math.min(...hs.map((c) => c.l))) + pad * 0.4;
    const at = (Number(showAt(last)) + 0.5).toFixed(2);
    box(x0, y0, x1 - x0, y1 - y0, GOLD, '5', `gte(t,${at})`);
  }
  return f.join(',');
}
