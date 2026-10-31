import { useEffect, useRef, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import logoUrl from '@assets/IMG_3645.png';

// Explainer carousel slides drawn on <canvas> in the veddbuild.com landing
// style (pages/landing.tsx palette: near-black bg, red eyebrow pill, big white
// headline, gold accent). Drawn in the browser so fonts always render (the
// old server-side bake depended on fonts the server doesn't have) and each
// slide downloads/shares as a ready-to-post PNG at a social size.

export interface ExplainerSlide { heading: string; body: string }
export type CarouselSize = '4:5' | '1:1';

const C = { bg: '#0B0B0E', card: '#151619', tx: '#F4F5F6', tx2: '#9BA1A9', tx3: '#5B616B', red: '#FF3B34', gold: '#F5C451' };
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const SIZE: Record<CarouselSize, [number, number]> = { '4:5': [1080, 1350], '1:1': [1080, 1080] };

let logoPromise: Promise<HTMLImageElement | null> | null = null;
function loadLogo() {
  return (logoPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = logoUrl;
  }));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, '') + '…';
    return kept;
  }
  return lines;
}

/** Fits text by stepping the font size down until it fits in maxLines. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, start: number, min: number, maxW: number, maxLines: number) {
  for (let size = start; size >= min; size -= 4) {
    ctx.font = `${weight} ${size}px ${SANS}`;
    const lines = wrap(ctx, text, maxW, 99);
    if (lines.length <= maxLines) return { size, lines };
  }
  ctx.font = `${weight} ${min}px ${SANS}`;
  return { size: min, lines: wrap(ctx, text, maxW, maxLines) };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export async function drawSlide(
  canvas: HTMLCanvasElement, slide: ExplainerSlide, index: number, total: number,
  opts: { size: CarouselSize; eyebrow: string; referralCode?: string | null },
) {
  const [W, H] = SIZE[opts.size];
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  await document.fonts?.load?.(`800 80px Inter`).catch(() => {});
  const logo = await loadLogo();
  const pad = 88;
  const isCover = index === 0;
  const isLast = index === total - 1;

  // Background + the landing page's red/gold glows.
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W * 0.9, H * 0.05, 0, W * 0.9, H * 0.05, W * 0.8);
  g1.addColorStop(0, 'rgba(255,59,52,0.22)'); g1.addColorStop(1, 'rgba(255,59,52,0)');
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(0, H, 0, 0, H, W * 0.7);
  g2.addColorStop(0, 'rgba(245,196,81,0.10)'); g2.addColorStop(1, 'rgba(245,196,81,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
  roundRect(ctx, 24, 24, W - 48, H - 48, 36); ctx.stroke();

  // Header: logo + wordmark, slide counter.
  const top = 76;
  if (logo) ctx.drawImage(logo, pad, top - 34, 68, 68);
  ctx.fillStyle = C.tx; ctx.font = `800 34px ${SANS}`; ctx.textBaseline = 'middle';
  ctx.fillText('VEDD AI', pad + (logo ? 84 : 0), top);
  ctx.fillStyle = C.tx3; ctx.font = `600 28px ${MONO}`; ctx.textAlign = 'right';
  ctx.fillText(`${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, W - pad, top);
  ctx.textAlign = 'left';

  // Eyebrow pill (red mono, like the landing hero).
  let y = isCover ? H * 0.3 : H * 0.22;
  const eyebrow = (isCover ? opts.eyebrow : isLast ? 'Get started' : `Step ${index}`).toUpperCase();
  ctx.font = `600 26px ${MONO}`;
  const ew = ctx.measureText(eyebrow).width + 48;
  roundRect(ctx, pad, y - 30, ew, 60, 30);
  ctx.fillStyle = 'rgba(255,59,52,0.08)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,59,52,0.4)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = C.red; ctx.fillText(eyebrow, pad + 24, y + 1);
  y += 80;

  // Headline.
  const maxW = W - pad * 2;
  const head = fit(ctx, slide.heading, 850, isCover ? 112 : 92, 56, maxW, isCover ? 4 : 3);
  ctx.textBaseline = 'top'; ctx.fillStyle = C.tx;
  ctx.font = `850 ${head.size}px ${SANS}`;
  for (const line of head.lines) { ctx.fillText(line, pad, y); y += head.size * 1.04; }

  // Gold rule.
  y += 28; ctx.fillStyle = C.gold; ctx.fillRect(pad, y, 96, 8); y += 52;

  // Body.
  const footerTop = H - (isLast ? 250 : 150);
  const bodyLinesMax = Math.max(2, Math.floor((footerTop - y) / 60));
  const body = fit(ctx, slide.body, 500, 46, 32, maxW, bodyLinesMax);
  ctx.fillStyle = C.tx2; ctx.font = `500 ${body.size}px ${SANS}`;
  for (const line of body.lines) { ctx.fillText(line, pad, y); y += body.size * 1.4; }

  // Last slide CTA.
  if (isLast) {
    const cta = 'Try VEDD AI free';
    ctx.font = `800 40px ${SANS}`;
    const cw = ctx.measureText(cta).width + 80;
    const cy = H - 230;
    roundRect(ctx, pad, cy, cw, 92, 46); ctx.fillStyle = C.red; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(cta, pad + 40, cy + 47);
    if (opts.referralCode) {
      ctx.fillStyle = C.gold; ctx.font = `700 28px ${MONO}`;
      ctx.fillText(`Code ${opts.referralCode}`, pad + cw + 28, cy + 47);
    }
  }

  // Footer: site + progress dots / swipe cue.
  const fy = H - 82;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.tx3; ctx.font = `600 26px ${MONO}`; ctx.fillText('veddbuild.com', pad, fy);
  const dot = 12, gap = 14, dotsW = total * dot + (total - 1) * gap;
  let dx = W - pad - dotsW - (isLast ? 0 : 150);
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i === index ? C.gold : 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(dx + dot / 2, fy, dot / 2, 0, Math.PI * 2); ctx.fill();
    dx += dot + gap;
  }
  if (!isLast) { ctx.fillStyle = C.tx2; ctx.font = `700 28px ${SANS}`; ctx.textAlign = 'right'; ctx.fillText('Swipe →', W - pad, fy); ctx.textAlign = 'left'; }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export failed'))), 'image/png'));
}

export function ExplainerCarousel({ title, slides, eyebrow = 'Explainer', referralCode }: {
  title: string; slides: ExplainerSlide[]; eyebrow?: string; referralCode?: string | null;
}) {
  const [size, setSize] = useState<CarouselSize>('4:5');
  const [busy, setBusy] = useState(false);
  const all: ExplainerSlide[] = [{ heading: title, body: slides[0]?.heading ? `${slides.length} quick steps. Swipe through.` : '' }, ...slides];
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    all.forEach((s, i) => { const c = refs.current[i]; if (c) drawSlide(c, s, i, all.length, { size, eyebrow, referralCode }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, slides, size, eyebrow, referralCode]);

  const fileName = (i: number) => `vedd-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${i + 1}.png`;
  const download = async (i: number) => {
    const c = refs.current[i]; if (!c) return;
    const url = URL.createObjectURL(await toBlob(c));
    const a = document.createElement('a'); a.href = url; a.download = fileName(i); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const downloadAll = async () => { setBusy(true); try { for (let i = 0; i < all.length; i++) { await download(i); await new Promise((r) => setTimeout(r, 350)); } } finally { setBusy(false); } };
  const files = async () => Promise.all(all.map(async (_, i) => new File([await toBlob(refs.current[i]!)], fileName(i), { type: 'image/png' })));
  const canShareFiles = typeof navigator !== 'undefined' && !!navigator.canShare;
  const share = async () => {
    setBusy(true);
    try {
      const f = await files();
      if (navigator.canShare?.({ files: f })) await navigator.share({ files: f, title });
      else await downloadAll();
    } catch { /* user cancelled */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['4:5', '1:1'] as const).map((s) => (
          <button key={s} onClick={() => setSize(s)} className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ background: size === s ? 'rgba(245,196,81,.18)' : 'rgba(255,255,255,.05)', border: `1px solid ${size === s ? 'rgba(245,196,81,.5)' : 'rgba(255,255,255,.1)'}`, color: size === s ? C.gold : '#9ca3af' }}>
            {s === '4:5' ? 'Portrait 4:5 · Instagram/Facebook' : 'Square 1:1 · LinkedIn/X'}
          </button>
        ))}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
        {all.map((_, i) => (
          <div key={i} className="flex-shrink-0 snap-start space-y-1.5" style={{ width: 240 }}>
            <canvas ref={(el) => { refs.current[i] = el; }} className="w-full rounded-xl border border-white/10" />
            <button onClick={() => download(i)} className="w-full text-[11px] font-bold py-1.5 rounded-lg flex items-center justify-center gap-1"
              style={{ background: 'rgba(255,255,255,.05)', color: '#d1d5db', border: '1px solid rgba(255,255,255,.1)' }}>
              <Download className="w-3 h-3" /> Slide {i + 1}
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {canShareFiles && (
          <button onClick={share} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2" style={{ background: C.red, color: '#fff' }}>
            <Share2 className="w-4 h-4" /> {busy ? 'Preparing…' : 'Share all slides'}
          </button>
        )}
        <button onClick={downloadAll} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
          style={{ background: 'rgba(245,196,81,.15)', color: C.gold, border: '1px solid rgba(245,196,81,.4)' }}>
          <Download className="w-4 h-4" /> {busy ? 'Saving…' : `Save all ${all.length} slides`}
        </button>
      </div>
    </div>
  );
}
