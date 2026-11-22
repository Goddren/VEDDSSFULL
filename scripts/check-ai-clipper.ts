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
 * L. yt-dlp ingestion (the ytdl-core replacement): client chain, CLI
 *    args, error classification → specific user messages, the pinned
 *    provisioning script, and the upload fallback's validation + wiring.
 * M. YouTube login cookies (YOUTUBE_COOKIES env): Netscape validation,
 *    --cookies arg wiring, per-job temp file (0600 + deletion), secret
 *    redaction from error text, and the bot-blocked message split
 *    (saved login rejected vs no login configured). FAKE fixtures only.
 */
import fs, { readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import {
  classifySourceUrl, validateClipperSettings, viralityScore, normalizeSubscores,
  parseSilenceDetect, silenceRatio, finalizeMoments, buildCaptionCues,
  buildAssDocument, assTime, escapeAss, wrapTitleLines, buildReframeFilter,
  frameForAspect, buildShareTargets, buildShareCaption,
  CLIPPER_STEPS, clipperStepProgress, LENGTH_PRESETS,
  ytdlpClientChain, buildYtdlpInfoArgs, buildYtdlpDownloadArgs,
  classifyYtdlpError, ytdlpErrorMessage, validateClipperUpload,
  parseYouTubeCookies, redactSecrets,
  CLIPPER_UPLOAD_MAX_BYTES, YTDLP_DEFAULT_CLIENTS, type YtdlpErrorCode,
  type WordTiming, type MomentSeed,
} from '../server/services/clipper-core';
import {
  youtubeCookiesConfigured, writeYouTubeCookiesFile, removeYouTubeCookiesFile,
} from '../server/services/ytdlp';

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
  check('K13 sw bumped for the client change', sw.includes("CACHE_VERSION = 'vedd-v289'"));
}

// ─── L. yt-dlp ingestion + upload fallback ──────────────────────────────────
console.log('L. yt-dlp ingestion + upload fallback');
{
  // Client chain: tv first (the client that answers datacenter IPs),
  // env override sanitized.
  check('L1 default chain is tv-first', ytdlpClientChain()[0] === 'tv' && ytdlpClientChain().join(',') === YTDLP_DEFAULT_CLIENTS.join(','));
  check('L2 env chain override sanitized', ytdlpClientChain(' web , bad client!, ios ').join(',') === 'web,ios');
  check('L3 junk env falls back to default', ytdlpClientChain('!!!').join(',') === YTDLP_DEFAULT_CLIENTS.join(','));

  const infoArgs = buildYtdlpInfoArgs('https://youtu.be/x', ['tv', 'ios']);
  check('L4 info args dump json via the chain', infoArgs.includes('--dump-single-json')
    && infoArgs[infoArgs.indexOf('--extractor-args') + 1] === 'youtube:player_client=tv,ios'
    && infoArgs.includes('--no-playlist'));
  const dlArgs = buildYtdlpDownloadArgs('https://youtu.be/x', {
    outputTemplate: '/tmp/source.%(ext)s', maxBytes: 1234, clients: ['tv'], ffmpegLocation: '/bin/ffmpeg',
  });
  check('L5 download args: format + merge + caps', dlArgs[dlArgs.indexOf('-f') + 1].includes('height<=720')
    && dlArgs[dlArgs.indexOf('--merge-output-format') + 1] === 'mp4'
    && dlArgs[dlArgs.indexOf('--max-filesize') + 1] === '1234'
    && dlArgs[dlArgs.indexOf('--ffmpeg-location') + 1] === '/bin/ffmpeg'
    && dlArgs.includes('--fragment-retries'));
  check('L6 no-cert-checks only when asked', !dlArgs.includes('--no-check-certificates')
    && buildYtdlpDownloadArgs('u', { outputTemplate: 'o', maxBytes: 1, clients: ['tv'], noCheckCerts: true }).includes('--no-check-certificates'));

  // Error classification: real yt-dlp failure text → stable codes.
  check('L7 bot block classified', classifyYtdlpError('ERROR: [youtube] abc: Sign in to confirm you\u2019re not a bot') === 'bot-blocked');
  check('L8 age beats bot (order matters)', classifyYtdlpError('ERROR: Sign in to confirm your age') === 'age-restricted');
  check('L9 private classified', classifyYtdlpError('ERROR: This video is private') === 'private');
  check('L10 unavailable classified', classifyYtdlpError('ERROR: Video unavailable') === 'unavailable');
  check('L11 geo classified', classifyYtdlpError('ERROR: The uploader has not made this video available in your country') === 'geo-blocked');
  check('L12 network classified', classifyYtdlpError('Unable to download API page: Read timed out. (read timeout=30)') === 'network');
  check('L13 unknown stays unknown', classifyYtdlpError('something entirely different') === 'unknown');

  // Every code → a specific message that names the cause and the upload
  // path; none of them is the old generic fallback.
  const codes: YtdlpErrorCode[] = ['bot-blocked', 'unavailable', 'private', 'age-restricted', 'geo-blocked', 'network', 'binary-missing', 'unknown'];
  const msgs = codes.map(ytdlpErrorMessage);
  check('L14 every code has a distinct message', new Set(msgs).size === codes.length);
  check('L15 messages point at upload, never generic', msgs.every((m) => /upload/i.test(m))
    && msgs.every((m) => m !== 'The clipper hit a problem processing that video. Please try again.'));

  // Upload validation boundaries (asset-store 25MB cap).
  check('L16 upload ok at exactly the cap', validateClipperUpload({ size: CLIPPER_UPLOAD_MAX_BYTES, mime: 'video/mp4', name: 'a.mp4' }).ok);
  check('L17 upload rejected over the cap', !validateClipperUpload({ size: CLIPPER_UPLOAD_MAX_BYTES + 1, mime: 'video/mp4', name: 'a.mp4' }).ok);
  check('L18 upload rejected for non-video', !validateClipperUpload({ size: 1000, mime: 'image/png', name: 'a.png' }).ok);
  check('L19 mkv accepted via extension', validateClipperUpload({ size: 1000, mime: 'application/octet-stream', name: 'a.mkv' }).ok);
  check('L20 empty upload rejected', !validateClipperUpload({ size: 0, mime: 'video/mp4', name: 'a.mp4' }).ok);

  // Source pins: the new path is wired and the old one is gone.
  const clipper = readFileSync('server/services/clipper.ts', 'utf8');
  const ytdlp = readFileSync('server/services/ytdlp.ts', 'utf8');
  const routes = readFileSync('server/routes.ts', 'utf8');
  const maker = readFileSync('client/src/components/content-studio/clipper-maker.tsx', 'utf8');
  const pkg = readFileSync('package.json', 'utf8');
  const fetchScript = readFileSync('scripts/fetch-ytdlp.mjs', 'utf8');
  check('L21 clipper uses yt-dlp, ytdl-core gone', clipper.includes("from './ytdlp'")
    && !/import\s*\(\s*['"]@distube\/ytdl-core/.test(clipper) && !/from\s+['"]@distube\/ytdl-core/.test(clipper)
    && !pkg.includes('@distube/ytdl-core'));
  check('L22 runner is pinned + classified', ytdlp.includes("YTDLP_VERSION = '2026.10.26'") && ytdlp.includes('classifyYtdlpError') && ytdlp.includes('binary-missing'));
  check('L23 postinstall provisions the binary', pkg.includes('"postinstall": "node scripts/fetch-ytdlp.mjs"')
    && fetchScript.includes('2026.10.26') && /[0-9a-f]{64}/.test(fetchScript) && fetchScript.includes('sha256'));
  check('L24 upload route wired with gates', routes.includes("app.post('/api/content-studio/clipper/upload'")
    && routes.includes('persistBuffer') && routes.includes('validateClipperUpload'));
  check('L25 upload job carries the asset id', clipper.includes('uploadAssetId') && clipper.includes('getPersistedAsset'));
  check('L26 client offers the upload path', maker.includes('clipper-mode-upload') && maker.includes('clipper-file') && maker.includes('/api/content-studio/clipper/upload'));
  check('L27 friendlyError honors yt codes first', clipper.includes('ytdlpCode') && clipper.includes('ytdlpErrorMessage'));
}

// ─── M. YouTube login cookies (YOUTUBE_COOKIES) ─────────────────────────────
console.log('M. YouTube login cookies');
{
  // FAKE fixture — invented values, no real account anywhere near this.
  const FAKE_COOKIES = [
    '# Netscape HTTP Cookie File',
    '#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1893456000\tFAKE_SAPISID\tfake-sapisid-value',
    '.youtube.com\tTRUE\t/\tTRUE\t1893456000\tFAKE_LOGIN_INFO\tfake-login-info-value',
    '.google.com\tTRUE\t/\tTRUE\t1893456000\tFAKE_NID\tfake-nid-value',
    '',
  ].join('\n');

  // Validation: shape + a youtube.com entry are both required.
  const good = parseYouTubeCookies(FAKE_COOKIES);
  check('M1 valid Netscape fixture accepted', good.ok && good.cookieCount === 3);
  check('M2 garbage rejected without throwing', !parseYouTubeCookies('definitely not a cookie file').ok
    && !parseYouTubeCookies('').ok && !parseYouTubeCookies(undefined).ok && !parseYouTubeCookies(null).ok);
  check('M3 no youtube.com entry rejected', !parseYouTubeCookies('.google.com\tTRUE\t/\tTRUE\t1893456000\tFAKE_NID\tx').ok);
  check('M4 malformed rows rejected', !parseYouTubeCookies('.youtube.com\tTRUE\t/').ok
    && !parseYouTubeCookies('.youtube.com\tTRUE\t/\tTRUE\tnotanumber\tNAME\tv').ok);
  check('M5 literal \\n paste normalized', parseYouTubeCookies(FAKE_COOKIES.replace(/\n/g, '\\n')).ok);

  // Arg wiring: --cookies present ONLY when a file is configured.
  const infoCk = buildYtdlpInfoArgs('https://youtu.be/x', ['tv'], false, '/job/.yt-cookies-ab12cd.txt');
  check('M6 info args carry --cookies when configured', infoCk[infoCk.indexOf('--cookies') + 1] === '/job/.yt-cookies-ab12cd.txt');
  check('M7 info args omit --cookies by default', !buildYtdlpInfoArgs('https://youtu.be/x', ['tv']).includes('--cookies'));
  const dlCk = buildYtdlpDownloadArgs('https://youtu.be/x', {
    outputTemplate: '/tmp/source.%(ext)s', maxBytes: 1, clients: ['tv'], cookiesFile: '/job/.yt-cookies-ab12cd.txt',
  });
  check('M8 download args carry --cookies when configured', dlCk[dlCk.indexOf('--cookies') + 1] === '/job/.yt-cookies-ab12cd.txt'
    && !buildYtdlpDownloadArgs('u', { outputTemplate: 'o', maxBytes: 1, clients: ['tv'] }).includes('--cookies'));

  // Message split: no-login wording is byte-identical to PR #84; with a
  // configured login the bot-block message blames the login instead.
  const noLogin = ytdlpErrorMessage('bot-blocked');
  check('M9 no-login bot-block message unchanged', noLogin
    === 'YouTube blocked this download from our server — it asked for a sign-in to confirm we are not a bot, which a server can\'t do. Upload the video file instead; uploads always work.');
  const withLogin = ytdlpErrorMessage('bot-blocked', { cookiesConfigured: true });
  const allDefault = (['bot-blocked', 'unavailable', 'private', 'age-restricted', 'geo-blocked', 'network', 'binary-missing', 'unknown'] as YtdlpErrorCode[])
    .map((c) => ytdlpErrorMessage(c));
  check('M10 with-login message: refresh the login, upload still offered', withLogin !== noLogin
    && /rejected the saved login/i.test(withLogin) && /refresh/i.test(withLogin) && /upload/i.test(withLogin)
    && !allDefault.includes(withLogin));
  check('M11 other codes ignore the cookies flag', ytdlpErrorMessage('unavailable', { cookiesConfigured: true }) === ytdlpErrorMessage('unavailable'));

  // Redaction: paths/values never survive into error text.
  const dirty = 'ERROR: could not read /job/.yt-cookies-ab12cd.txt (value fake-login-info-value) Sign in to confirm';
  const clean = redactSecrets(dirty, ['/job/.yt-cookies-ab12cd.txt', 'fake-login-info-value']);
  check('M12 redactSecrets scrubs path + value', !clean.includes('.yt-cookies') && !clean.includes('fake-login-info-value')
    && clean.includes('Sign in to confirm'));

  // Runner behavior against the REAL env var (fake fixture only).
  const prevEnv = process.env.YOUTUBE_COOKIES;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clipper-ck-'));
  try {
    process.env.YOUTUBE_COOKIES = FAKE_COOKIES;
    check('M13 configured with a valid fixture', youtubeCookiesConfigured() === true);
    const f = writeYouTubeCookiesFile(tmp);
    check('M14 temp file written 0600 with content intact', !!f && fs.existsSync(f)
      && (fs.statSync(f).mode & 0o777) === 0o600
      && fs.readFileSync(f, 'utf8').includes('FAKE_LOGIN_INFO'));
    removeYouTubeCookiesFile(f);
    check('M15 temp file deleted after the step', !!f && !fs.existsSync(f));
    process.env.YOUTUBE_COOKIES = 'garbage, not cookies';
    check('M16 malformed env → no file, not configured', youtubeCookiesConfigured() === false
      && writeYouTubeCookiesFile(tmp) === null && fs.readdirSync(tmp).length === 0);
    delete process.env.YOUTUBE_COOKIES;
    check('M17 unset env → off by default', youtubeCookiesConfigured() === false
      && writeYouTubeCookiesFile(tmp) === null);
  } finally {
    if (prevEnv === undefined) delete process.env.YOUTUBE_COOKIES;
    else process.env.YOUTUBE_COOKIES = prevEnv;
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // Source pins: env-only secret handling, no UI, no stray logging.
  const ytdlp = readFileSync('server/services/ytdlp.ts', 'utf8');
  const clipper = readFileSync('server/services/clipper.ts', 'utf8');
  const routes = readFileSync('server/routes.ts', 'utf8');
  const maker = readFileSync('client/src/components/content-studio/clipper-maker.tsx', 'utf8');
  check('M18 runner reads env, warns statically, writes 0600', ytdlp.includes('YOUTUBE_COOKIES')
    && ytdlp.includes('not a valid Netscape') && ytdlp.includes('0o600')
    && (ytdlp.match(/console\.(warn|log|error)/g) || []).length === 1);
  check('M19 clipper splits the bot-block message on the login state',
    clipper.includes('cookiesConfigured: youtubeCookiesConfigured()'));
  check('M20 env-only: no route or UI touches the secret', !routes.includes('YOUTUBE_COOKIES')
    && !maker.includes('YOUTUBE_COOKIES'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
