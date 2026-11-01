/**
 * Real app screens for explainer videos.
 *
 * Chris's rule: when an explainer talks about the app itself, the video must
 * show the ACTUAL veddbuild.com pages — never an AI-invented app background.
 * Same trick as chart-overlay.ts (AI models can't draw the real thing, so we
 * composite it in post): the script writer assigns a screen id to a scene,
 * the presenter is filmed in the upper half gesturing down, and assembly
 * overlays the real screenshot as a phone card in the lower half.
 *
 * The screenshots live in client/public/app-screens/ (committed; vite copies
 * them to dist/public/app-screens/ at build). They are captures of the public
 * site taken 2026-11-01 at a phone viewport. Logged-in pages can't be
 * captured without an account session — add those captures to the same
 * folder + one catalog line each and they become available automatically.
 */
import fs from 'fs';
import path from 'path';

export interface AppScreen {
  id: string;
  /** Short name for humans (job metadata, future studio UI). */
  title: string;
  /** What the page actually shows — this is what the script writer matches narration against. */
  shows: string;
  file: string;
}

export const APP_SCREENS: AppScreen[] = [
  { id: 'home-hero', title: 'Home — hero', shows: 'the veddbuild.com home page hero: "The brain that trades while you sleep", the Start free button and the live BTC/USD chart card', file: 'home-hero.jpg' },
  { id: 'how-it-works', title: 'How it works', shows: 'the "How it works" section: set it up once and it runs itself — connect your account or drop in a chart, the brain reads structure, momentum and news and decides', file: 'how-it-works.jpg' },
  { id: 'trading-engine', title: 'Engine + brain', shows: 'the "Engine + brain" section: it trades, it learns, it repeats — the live engine trades while you sleep 24/7 and the self-learning brain grades every trade', file: 'trading-engine.jpg' },
  { id: 'brain-marketplace', title: 'Brain Marketplace', shows: 'the Brain Marketplace section: "Outgrown your brain? Sell it" — list a trained brain, other traders plug it in, the seller earns VEDD', file: 'brain-marketplace.jpg' },
  { id: 'community', title: 'The movement / Academy', shows: 'the "Movement" section: more than a platform — free education through the Workforce Academy (trading, AI, credit and entrepreneurship courses), a faith-driven community, meetups and mentors', file: 'community.jpg' },
  { id: 'ambassador', title: 'Ambassador program', shows: 'the Ambassador Program section: "Get paid to put people on" — share VEDD, earn credits on referrals, recurring monthly commission and the 30% profit split', file: 'ambassador.jpg' },
  { id: 'pricing', title: 'Plans and pricing', shows: 'the Plans section: start free, upgrade when it is paying off — Free at $0 forever (AI chart analysis), Starter at $49.95 a month (live engine, self-learning brain), Premium above it', file: 'pricing.jpg' },
  { id: 'about', title: 'About VEDD', shows: 'the About page: "About VEDD — AI-powered trading chart analysis platform built for modern traders" and the mission to democratize professional-grade trading tools', file: 'about.jpg' },
];

export const APP_SCREEN_IDS = APP_SCREENS.map((s) => s.id);

/** Catalog text for the script-writer prompt: one "id — what it shows" line per screen. */
export function screenCatalogForPrompt(): string {
  return APP_SCREENS.map((s) => `${s.id} — ${s.shows}`).join('\n');
}

const fileCache = new Map<string, string | null>();

/**
 * Absolute path of a screen's image file, or null when it isn't on disk
 * (scene then renders without the overlay instead of failing the video).
 * Candidates cover the production bundle (dist/public), a dev server run
 * from the repo root (client/public), and this module's own neighborhood.
 */
export function screenImagePath(id: string): string | null {
  const cached = fileCache.get(id);
  if (cached !== undefined) return cached;
  const screen = APP_SCREENS.find((s) => s.id === id);
  let found: string | null = null;
  if (screen) {
    const candidates = [
      path.resolve(process.cwd(), 'dist/public/app-screens', screen.file),
      path.resolve(process.cwd(), 'client/public/app-screens', screen.file),
      path.resolve(__dirname, '../public/app-screens', screen.file),
      path.resolve(__dirname, '../../client/public/app-screens', screen.file),
    ];
    found = candidates.find((c) => fs.existsSync(c)) ?? null;
    if (!found) console.warn(`[app-screens] ${screen.file} not found in any known location — scene will render without the screen overlay`);
  }
  fileCache.set(id, found);
  return found;
}

/**
 * ffmpeg filter snippet (no input/output labels — the caller wires them)
 * that presents the screen as a phone card in the lower half of a WxH
 * frame: a dark panel behind, the screenshot cover-cropped into a portrait
 * card on top. The presenter occupies the upper half and gestures down at
 * it. `seconds` is unused today (the card is held for the whole scene,
 * like the chart panel) and kept for symmetry with chartFilter.
 */
export function screenCardGeometry(W: number, H: number): { cardW: number; cardH: number; x: number; y: number; panelPad: number } {
  const cardH = Math.round(H * (W > H ? 0.66 : 0.5));
  const cardW = Math.round(cardH * 0.475); // ~ phone aspect
  const x = Math.round((W - cardW) / 2);
  const y = H - cardH - Math.round(H * 0.055);
  return { cardW, cardH, x, y, panelPad: Math.round(W * 0.016) };
}
