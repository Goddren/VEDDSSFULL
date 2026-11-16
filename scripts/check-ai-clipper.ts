/**
 * Checks for the AI Clipper (Content Studio): paste a link → transcribe →
 * AI moments with a virality score → cut/reframe/burn captions → library,
 * plus the Share & Monetize layer.
 *
 * A. Source URL classification (YouTube / direct file / unsupported).
 * B. Settings validation + platform→aspect defaults.
 * C. Virality scoring math (weights, clamping).
 * D. Silence parsing + coverage.
 * E. Moment finalization: word-boundary snapping, silence snapping,
 *    length-preset enforcement, min-score filter (+ best-kept fallback),
 *    overlap dedupe, clip-count cap, best-first order.
 * F. Caption cues + ASS generation (word highlight, hook title wrap).
 * G. Reframe filters (cover-crop vs blurred pad) + frame sizes.
 * H. Share targets: fallback by default; direct ONLY with credentials AND
 *    the platform review/audit flag — never claimed otherwise.
 * I. Share captions: AI copy (or hook fallback), per-network limits.
 * J. Job steps + progress bands.
 * K. Source pins: routes + gates + caps, client wiring, and the clipper
 *    importing nothing from the trading engines.
 */
import { readFileSync } from 'fs';
import {
  classifySourceUrl, validateClipperSettings, viralityScore, normalizeSubscores,
  parseSilenceDetect, silenceRatio, finalizeMoments, buildCaptionCues,
  buildAssDocument, assTime, escapeAss, wrapTitleLines, buildReframeFilter,
  frameForAspect, buildShareTargets, buildShareCaption,
  CLIPPER_STEPS, clipperStepProgress, LENGTH_PRESETS,
  type WordTiming, type MomentSeed,
} from '../server/services/clipper-core';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ─── A. URL classification ──────────────────────────────────────────────────
console.log('A. URL classification');
check('A1 youtube watch', classifySourceUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ').kind === 'youtube');
check('A2 youtube shorts', classifySourceUrl('https://youtube.com/shorts/dQw4w9WgXcQ').kind === 'youtube');
check('A3 youtu.be', classifySourceUrl('https://youtu.be/dQw4w9WgXcQ?t=42').kind === 'youtube');
check('A4 direct mp4', classifySourceUrl('https://cdn.example.com/talk.mp4').kind === 'direct');
check('A5 direct webm with query', classifySourceUrl('https://example.com/a/b.webm?token=x').kind === 'direct');
check('A6 vimeo unsupported', classifySourceUrl('https://vimeo.com/12345').kind === 'unsupported');
check('A7 web page unsupported', classifySourceUrl('https://example.com/watch').kind === 'unsupported');
check('A8 empty unsupported', classifySourceUrl('   ').kind === 'unsupported');
check('A9 ftp unsupported', classifySourceUrl('ftp://example.com/x.mp4').kind === 'unsupported');
check('A10 youtube without id unsupported', classifySourceUrl('https://youtube.com/feed/trending').kind === 'unsupported');

// ─── B. Settings ────────────────────────────────────────────────────────────
console.log('B. Settings validation');
{
  const d = validateClipperSettings({});
  check('B1 defaults ok', d.ok && d.settings.clipCount === 5 && d.settings.aspect === '9:16');
  const p = validateClipperSettings({ platform: 'shorts' });
  check('B2 platform sets 9:16', p.ok && p.settings.aspect === '9:16' && p.settings.platform === 'shorts');
  const a = validateClipperSettings({ platform: 'tiktok', aspect: '1:1' });
  check('B3 explicit aspect wins', a.ok && a.settings.aspect === '1:1');
  check('B4 clipCount 0 rejected', !validateClipperSettings({ clipCount: 0 }).ok);
  check('B5 clipCount 11 rejected', !validateClipperSettings({ clipCount: 11 }).ok);
  check('B6 bad preset rejected', !validateClipperSettings({ lengthPreset: 'huge' }).ok);
  check('B7 bad style rejected', !validateClipperSettings({ captionStyle: 'neon' }).ok);
  check('B8 minVirality 101 rejected', !validateClipperSettings({ minVirality: 101 }).ok);
  const t = validateClipperSettings({ topic: 'x'.repeat(500) });
  check('B9 topic capped', t.ok && t.settings.topic.length === 200);
}

// ─── C. Scoring ─────────────────────────────────────────────────────────────
console.log('C. Virality scoring');
check('C1 all-100 → 100', viralityScore({ hook: 100, flow: 100, value: 100, trend: 100 }) === 100);
check('C2 all-0 → 0', viralityScore({ hook: 0, flow: 0, value: 0, trend: 0 }) === 0);
check('C3 hook weighs most', viralityScore({ hook: 100, flow: 0, value: 0, trend: 0 }) === 35
  && viralityScore({ hook: 0, flow: 0, value: 0, trend: 100 }) === 15);
check('C4 clamps junk', viralityScore({ hook: 250, flow: -5, value: NaN as any, trend: 50 }) === Math.round(100 * 0.35 + 0 + 0 + 50 * 0.15));
check('C5 normalize rounds', normalizeSubscores({ hook: 55.6 }).hook === 56);

// ─── D. Silence ─────────────────────────────────────────────────────────────
console.log('D. Silence');
{
  const stderr = '[silencedetect] silence_start: 3.5\n[silencedetect] silence_end: 5.25 | silence_duration: 1.75\nnoise\nsilence_start: 9\nsilence_end: 9.4';
  const ranges = parseSilenceDetect(stderr);
  check('D1 parses pairs', ranges.length === 2 && ranges[0].start === 3.5 && ranges[0].end === 5.25);
  check('D2 ratio full', silenceRatio(ranges, 3.5, 5.25) === 1);
  check('D3 ratio none', silenceRatio(ranges, 20, 30) === 0);
  check('D4 ratio partial', Math.abs(silenceRatio(ranges, 4.5, 6.5) - 0.75 / 2) < 0.01);
}

// ─── E. Finalization ────────────────────────────────────────────────────────
console.log('E. Moment finalization');
const words: WordTiming[] = [];
for (let i = 0; i < 600; i++) words.push({ word: `w${i}`, start: i * 0.5, end: i * 0.5 + 0.4 });
const seed = (startSec: number, endSec: number, score: number, hook = 'hook'): MomentSeed => ({
  startSec, endSec, hook, reason: 'r', category: 'story', caption: 'cap',
  subscores: { hook: score, flow: score, value: score, trend: score },
});
const baseSettings = validateClipperSettings({ clipCount: 3, lengthPreset: 'medium', minVirality: 60 });
if (!baseSettings.ok) throw new Error('settings fixture failed');
{
  const out = finalizeMoments([seed(10.2, 70.9, 90)], { words, silences: [], durationSec: 300, settings: baseSettings.settings });
  check('E1 word-snapped start', out.length === 1 && Math.abs(out[0].startSec - (10 - 0.25)) < 0.01, `start=${out[0]?.startSec}`);
  check('E2 length capped at preset max', out[0].durationSec <= LENGTH_PRESETS.medium.max + 0.01, `dur=${out[0].durationSec}`);
  const sil = finalizeMoments([seed(20, 60, 90)], {
    words, silences: [{ start: 19.4, end: 20.8 }], durationSec: 300, settings: baseSettings.settings,
  });
  check('E3 start snapped out of silence', sil.length === 1 && sil[0].startSec >= 20.8 - 0.01, `start=${sil[0]?.startSec}`);
  const low = finalizeMoments([seed(10, 55, 30), seed(100, 145, 20)], { words, silences: [], durationSec: 300, settings: baseSettings.settings });
  check('E4 below-bar keeps single best flagged', low.length === 1 && low[0].belowThreshold === true && low[0].viralityScore === 30);
  const dup = finalizeMoments([seed(10, 55, 90), seed(12, 57, 85), seed(150, 195, 80)], { words, silences: [], durationSec: 300, settings: baseSettings.settings });
  check('E5 overlap deduped', dup.length === 2);
  const many = finalizeMoments([seed(0, 45, 95), seed(60, 105, 90), seed(120, 165, 85), seed(180, 225, 80), seed(240, 285, 75)],
    { words, silences: [], durationSec: 300, settings: baseSettings.settings });
  check('E6 clip count cap + best first', many.length === 3 && many[0].viralityScore === 95 && many[0].rank === 1 && many[2].rank === 3);
  const shortSeed = finalizeMoments([seed(10, 20, 90)], { words, silences: [], durationSec: 300, settings: baseSettings.settings });
  check('E7 short window extended toward preset min', shortSeed.length === 1 && shortSeed[0].durationSec >= LENGTH_PRESETS.medium.min - 0.01, `dur=${shortSeed[0]?.durationSec}`);
  check('E8 junk seeds dropped', finalizeMoments([seed(NaN, 50, 90), seed(10, 11, 90)], { words, silences: [], durationSec: 300, settings: baseSettings.settings }).length === 0);
}

// ─── F. Captions + ASS ──────────────────────────────────────────────────────
console.log('F. Captions');
{
  const cues = buildCaptionCues(words.slice(0, 9), 'bold-pop');
  check('F1 bold-pop groups 3 words', cues.length === 3 && cues[0].words.length === 3);
  const cuesClean = buildCaptionCues(words.slice(0, 16), 'clean');
  check('F2 clean cues ≤8 words and ≤~2.9s span', cuesClean.length >= 2 && cuesClean.every((c) => c.words.length <= 8 && c.end - c.start <= 2.9));
  const ass = buildAssDocument(cues, 'bold-pop', { width: 720, height: 1280, hookTitle: 'The Trade That Taught Me Everything' });
  check('F3 ASS has highlight override', ass.includes('\\c&H00E5FF'));
  check('F4 ASS has title event', ass.includes('Style: Title') && ass.includes('THE TRADE THAT TAUGHT ME'));
  check('F5 long title wrapped with \\N', ass.includes('\\N'), 'title should wrap onto two lines at 720 wide');
  check('F6 PlayRes matches frame', ass.includes('PlayResX: 720') && ass.includes('PlayResY: 1280'));
  check('F7 assTime format', assTime(3661.5) === '1:01:01.50' && assTime(0) === '0:00:00.00');
  check('F8 escapeAss strips braces', escapeAss('a{b}c\\d') === 'abcd');
  check('F9 wrapTitleLines splits', wrapTitleLines('one two three four five six', 11).includes('\\N'));
  const karaoke = buildAssDocument(buildCaptionCues(words.slice(0, 4), 'karaoke'), 'karaoke', { width: 720, height: 1280 });
  check('F10 karaoke green highlight', karaoke.includes('\\c&H4ADE80'));
  const cleanCues = buildCaptionCues(words.slice(0, 8), 'clean');
  const clean = buildAssDocument(cleanCues, 'clean', { width: 720, height: 1280 });
  check('F11 clean = one event per cue (no per-word events)', (clean.match(/Dialogue:/g) || []).length === cleanCues.length);
}

// ─── G. Reframe ─────────────────────────────────────────────────────────────
console.log('G. Reframe');
check('G1 9:16 frame', frameForAspect('9:16', 1280, 720).w === 720 && frameForAspect('9:16', 1280, 720).h === 1280);
check('G2 1:1 frame', frameForAspect('1:1', 1280, 720).w === 960);
check('G3 wide source cover-crops', buildReframeFilter(1280, 720, '9:16').includes('crop=720:1280') && !buildReframeFilter(1280, 720, '9:16').includes('gblur'));
check('G4 narrow source blurred-pads', buildReframeFilter(720, 1280, '16:9').includes('gblur=sigma=42'));
check('G5 original keeps ratio', buildReframeFilter(1280, 720, 'original').startsWith('scale=1280:720'));

// ─── H. Share targets ───────────────────────────────────────────────────────
console.log('H. Share targets');
{
  const none = buildShareTargets({});
  check('H1 four networks', none.length === 4 && none.map((t) => t.network).join(',') === 'youtube,tiktok,instagram,facebook');
  check('H2 empty env → all fallback', none.every((t) => t.mode === 'fallback'));
  check('H3 monetization programs named', none[0].monetizationProgram.includes('Partner Program') && none[1].monetizationProgram.includes('Creator Rewards'));
  const credsOnly = buildShareTargets({ META_APP_ID: 'x', META_APP_SECRET: 'y', TIKTOK_CLIENT_KEY: 'k', TIKTOK_CLIENT_SECRET: 's', GOOGLE_OAUTH_CLIENT_ID: 'g', GOOGLE_OAUTH_CLIENT_SECRET: 'h' });
  check('H4 credentials WITHOUT review/audit stay fallback', credsOnly.every((t) => t.mode === 'fallback'));
  const reviewed = buildShareTargets({ META_APP_ID: 'x', META_APP_SECRET: 'y', META_PUBLISH_REVIEWED: '1', TIKTOK_CLIENT_KEY: 'k', TIKTOK_CLIENT_SECRET: 's', TIKTOK_AUDIT_PASSED: '1', GOOGLE_OAUTH_CLIENT_ID: 'g', GOOGLE_OAUTH_CLIENT_SECRET: 'h', YOUTUBE_AUDIT_PASSED: '1' });
  check('H5 credentials + review flags → direct', reviewed.every((t) => t.mode === 'direct'));
  check('H6 fallback status is honest', none[0].statusLine.includes('One-tap share') && none[0].statusLine.includes('press Post'));
}

// ─── I. Share captions ──────────────────────────────────────────────────────
console.log('I. Share captions');
{
  const clip = { hook: 'Big hook', caption: 'Post body #trading' };
  check('I1 caption passes through', buildShareCaption('tiktok', clip) === 'Post body #trading');
  check('I2 hook fallback when no copy', buildShareCaption('tiktok', { hook: 'Big hook', caption: '  ' }) === 'Big hook');
  const long = buildShareCaption('youtube', { hook: 'h', caption: 'word '.repeat(400) });
  check('I3 youtube caption capped at its limit', long.length <= 1000 && long.endsWith('…'));
  const longTt = buildShareCaption('tiktok', { hook: 'h', caption: 'word '.repeat(600) });
  check('I4 tiktok caption capped at its limit', longTt.length <= 2200 && longTt.endsWith('…'));
}

// ─── J. Job steps ───────────────────────────────────────────────────────────
console.log('J. Job steps');
check('J1 five steps in order', CLIPPER_STEPS.length === 5 && CLIPPER_STEPS[0].includes('Downloading') && CLIPPER_STEPS[4].includes('library'));
check('J2 progress bands monotonic', [0, 1, 2, 3].every((i) => clipperStepProgress(i) < clipperStepProgress(i + 1)) && clipperStepProgress(4) < 100);

// ─── K. Source pins ─────────────────────────────────────────────────────────
console.log('K. Source pins');
{
  const routes = readFileSync('server/routes.ts', 'utf8');
  const clipper = readFileSync('server/services/clipper.ts', 'utf8');
  const page = readFileSync('client/src/pages/content-studio.tsx', 'utf8');
  const maker = readFileSync('client/src/components/content-studio/clipper-maker.tsx', 'utf8');
  check('K1 clipper route exists', routes.includes("app.post('/api/content-studio/clipper'"));
  check('K2 share-targets route exists', routes.includes("app.get('/api/content-studio/share-targets'"));
  check('K3 no monetize-destination layer (dropped by Chris 2026-11-15)',
    !routes.includes('monetize-links')
    && !readFileSync('server/services/clipper-core.ts', 'utf8').includes('MONETIZE_DESTINATIONS')
    && !/whop|skool|patreon|gumroad/i.test(maker));
  check('K4 daily cap wired', routes.includes('CLIPPER_DAILY_LIMIT') && routes.includes("jobsToday(u.id, 'viral-clip')"));
  check('K5 job kind viral-clip', clipper.includes("'viral-clip'") && clipper.includes('content_video_jobs'));
  check('K6 clips save to the library', clipper.includes('createContentStudioGeneration') && clipper.includes("kind: 'viral-clip'"));
  check('K7 asset store used', clipper.includes('persistBuffer'));
  check('K8 no trading imports in clipper', !/from\s+['"][^'"]*(kalshi|solana|crypto-engine|fx-|trading|engine)['"]/.test(clipper)
    && !/from\s+['"][^'"]*(kalshi|solana|crypto-engine|fx-|trading|engine)['"]/.test(readFileSync('server/services/clipper-core.ts', 'utf8')));
  check('K9 page wires the clipper view', page.includes("'clipper'") && page.includes('ClipperMaker'));
  check('K10 client polls the shared job route', maker.includes('useContentJob'));
  check('K11 client share panel honest', maker.includes('One-tap share') && maker.includes('share-targets') && maker.includes('nothing is ever posted without you pressing Post'));
  check('K12 input caps stated', clipper.includes('CLIPPER_MAX_MINUTES') && clipper.includes('CLIPPER_MAX_SOURCE_MB'));
  const sw = readFileSync('client/public/sw.js', 'utf8');
  check('K13 sw bumped for the client change', sw.includes("CACHE_VERSION = 'vedd-v275'"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
