/**
 * Daily (Today) video jobs — durability + narrated info-ads.
 *
 * Run:  node --import tsx/esm scripts/check-daily-video-jobs.ts
 *
 * No live network, no database: pure helpers are exercised directly, and
 * the server-side-job guarantees are pinned by source checks.
 *
 *   A. Narration text: the ad narration joins scenes in order (hook first,
 *      CTA last); the word cap keeps a full 4-scene ad at the ad cap but
 *      truncates at the 35-word clip default.
 *   B. Ad script prompt: hook → subject → VEDD → CTA structure, veddbuild
 *      CTA, join/try language, no-profit-promise rule.
 *   C. Scene audio plan: muteScenes silences every scene; default keeps
 *      native audio flags untouched.
 *   D. Durability pins (source): jobs carry resume state in the row;
 *      per-scene URLs persist as scenes finish; the watchdog resumes stale
 *      jobs and fails them visibly past the cap; runners register in the
 *      in-flight set; NO generation step is invoked from a GET/status
 *      route or from getJob; clip/reel runners are restartable from their
 *      stored payloads.
 *   E. Completion pins (source): the daily runner writes the post's
 *      video_url itself from the durable postId; the Saved-library insert
 *      is retried and its failure recorded (never a silent catch); an
 *      unpersisted clip/reel render records libraryError.
 *   F. Daily audio pins (source): daily jobs assemble muted and pass the
 *      ad script through applyVideoAudio with the ad word cap; a failed
 *      narration falls back to the native join WITH a recorded reason;
 *      VIDEO_AUDIO=off keeps the native path; makePostVideo starts jobs
 *      in dailyAd mode and stores video_job_id on the post.
 *   G. Viewer pins (source): the queue attaches job status/error; the
 *      Today page seeds its job id from the post row and surfaces the
 *      recorded failure and the narration/library notes.
 */
import { readFileSync } from 'node:fs';
import {
  adNarrationText, buildAdScriptPrompt, sceneAudioPlan,
  AD_NARRATION_MAX_WORDS, AD_SCENE_ROLES, type ExplainerScript,
} from '../server/services/explainer-video';
import { capNarrationText } from '../server/services/video-audio';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(p, 'utf8');

const explainer = src('server/services/explainer-video.ts');
const clipJobs = src('server/services/content-clip-jobs.ts');
const postQueue = src('server/services/ambassador-post-queue.ts');
const routes = src('server/routes.ts');
const todayPage = src('client/src/pages/ambassador-agent.tsx');

// A — narration text + caps
{
  const script: ExplainerScript = {
    title: 'T', caption: 'C', presenter: 'P', setting: 'S',
    scenes: [
      { narration: 'Hook line here.', visual: 'v', chart: null, screen: null },
      { narration: 'Subject made simple.', visual: 'v', chart: null, screen: null },
      { narration: 'VEDD watches it for you.', visual: 'v', chart: null, screen: null },
      { narration: 'Try VEDD AI free today.', visual: 'v', chart: null, screen: null },
    ],
  };
  const text = adNarrationText(script);
  check('A1 ad narration joins scenes in order', text === 'Hook line here. Subject made simple. VEDD watches it for you. Try VEDD AI free today.');
  check('A2 ad narration starts with the hook and ends with the CTA',
    text.startsWith('Hook line here.') && text.endsWith('Try VEDD AI free today.'));
  check('A3 scene roles are hook/subject/vedd/cta', AD_SCENE_ROLES.join(',') === 'hook,subject,vedd,cta');

  const longAd = Array.from({ length: 4 }, (_, i) => `Scene ${i + 1} says fifteen plain spoken words to the camera right now today friend.`).join(' ');
  const cappedDefault = capNarrationText(longAd);
  const cappedAd = capNarrationText(longAd, AD_NARRATION_MAX_WORDS);
  check('A4 default cap truncates a 60-word ad to <=35 words', cappedDefault.split(/\s+/).length <= 35, `${cappedDefault.split(/\s+/).length} words`);
  check('A5 ad cap keeps the full 4-scene narration (CTA survives)', cappedAd === longAd && AD_NARRATION_MAX_WORDS >= 60, `${cappedAd.split(/\s+/).length} words`);
}

// B — ad prompt structure
{
  const p = buildAdScriptPrompt('Trading lesson: Support and resistance. Flip levels.');
  check('B1 prompt names the four beats in order',
    p.indexOf('Scene 1 — HOOK') > -1 && p.indexOf('Scene 1 — HOOK') < p.indexOf('Scene 2 — SUBJECT')
    && p.indexOf('Scene 2 — SUBJECT') < p.indexOf('Scene 3 — VEDD') && p.indexOf('Scene 3 — VEDD') < p.indexOf('Scene 4 — CTA'));
  check('B2 prompt carries the veddbuild CTA', /veddbuild dot com/.test(p) && /try VEDD AI free/i.test(p));
  check('B3 prompt bans profit promises and guaranteed language', /No income or profit promises/.test(p) && /No "guaranteed" language/.test(p));
  check('B4 prompt keeps the day\u2019s subject as the input', p.includes('Support and resistance'));
  check('B5 prompt uses join/try CTA language only', /Join\/try language only/.test(p));
}

// C — scene audio plan
{
  check('C1 muteScenes silences every scene', sceneAudioPlan([true, false, true], true).join() === 'false,false,false');
  check('C2 default plan keeps native audio flags', sceneAudioPlan([true, false, true], false).join() === 'true,false,true');
}

// D — durability pins
{
  check('D1 job row carries resume state from insert', /resumeCount: 0/.test(explainer) && /sceneUrls: \[\]/.test(explainer));
  check('D2 finished scene URLs persist to the job row as scenes complete', /meta: \{ sceneUrls: urls \}/.test(explainer));
  check('D3 watchdog resumes stale jobs on a timer', /export async function resumeStaleJobs/.test(explainer) && /setInterval\(scan, 60000\)/.test(explainer));
  check('D4 watchdog fails past-cap jobs with a visible error', /attempts >= MAX_RESUME_ATTEMPTS/.test(explainer) && /INTERRUPTED_ERROR/.test(explainer));
  check('D5 runners register in the in-flight set', /trackJobStart\(id\)/.test(explainer) && /inFlightJobs/.test(explainer) && /trackJobStart\(id\)/.test(clipJobs));
  const getJobBody = explainer.slice(explainer.indexOf('export async function getJob'), explainer.indexOf('export async function rendersToday'));
  check('D6 getJob invokes no generation step', !/runJob\(|renderScene\(|launchExplainerJob\(|resumeStaleJobs\(/.test(getJobBody));
  const getRoutes = routes.split('\n').filter((l) => l.includes('app.get(')).join('\n');
  check('D7 no GET route starts a video job', !/startExplainerJob|startClipJob|startReelJob/.test(getRoutes));
  check('D8 clip/reel jobs are restartable from their stored payload', /export async function resumeContentJob/.test(clipJobs) && /JSON\.parse\(job\.input/.test(clipJobs));
  check('D9 boot starts the watchdog', src('server/index.ts').includes('ensureJobWatchdog'));
  check('D10 meta updates merge instead of replacing', /meta = COALESCE\(meta, '\{\}'::jsonb\) \|\|/.test(explainer));
}

// E — completion pins
{
  check('E1 daily runner writes the post video_url from the durable postId',
    /UPDATE ambassador_post_queue SET video_url=\$2, video_shot=NULL, video_aspect=\$3/.test(explainer) && /opts\.postId/.test(explainer));
  check('E2 library insert is retried, logged and recorded — no silent catch',
    /library save failed \(attempt/.test(explainer) && /meta: \{ libraryError \}/.test(explainer) && !/library record is best-effort/.test(explainer));
  check('E3 unpersisted clip/reel renders record libraryError',
    (clipJobs.match(/libraryError/g) || []).length >= 2);
  check('E4 the queue reconciles a finished job\u2019s URL into the payload',
    /j\.status === 'done' && j\.result_url/.test(postQueue));
}

// F — daily audio pins
{
  check('F1 daily jobs assemble muted before the audio stage', /assemble\(sceneUrls, aspect, chartArgs, screenArgs, \{ muteScenes: true \}\)/.test(explainer));
  check('F2 the ad script is narrated via applyVideoAudio with the ad cap',
    /applyVideoAudio\(muted, \{\s*narrationText: adNarrationText\(script\), userId, narrationMaxWords: AD_NARRATION_MAX_WORDS,/.test(explainer));
  check('F3 failed narration falls back to the native join WITH a recorded reason',
    /narration: 'none'/.test(explainer) && /voiceover could not be added/.test(explainer));
  check('F4 VIDEO_AUDIO=off keeps the native path (kill switch respected)', /dailyAd && videoAudioEnabled\(\)/.test(explainer));
  check('F5 makePostVideo starts dailyAd jobs and stores the job id on the post',
    /startExplainerJob\(userId, idea, size, \{ postId, dailyAd: true \}\)/.test(postQueue) && /SET video_job_id=\$2/.test(postQueue));
  check('F6 post queue ensures the video_job_id column', /ADD COLUMN IF NOT EXISTS video_job_id/.test(postQueue));
}

// G — viewer pins
{
  check('G1 queue attaches job status and error to posts', /video_job_status = j\.status/.test(postQueue) && /video_job_error = j\.error/.test(postQueue));
  check('G2 Today page seeds its job id from the post row', /useState<number \| null>\(post\.video_job_id \?\? null\)/.test(todayPage));
  check('G3 Today page surfaces a recorded failure without polling', /video_job_status === "failed"/.test(todayPage) && /recordedFailure/.test(todayPage));
  check('G4 Today page surfaces the narration fallback note', /job\.audio\.reason/.test(todayPage));
  check('G5 explainer status route exposes audio + libraryError',
    /audio: job\.meta\?\.audio \?\? null/.test(routes) && /libraryError: job\.meta\?\.libraryError \?\? null/.test(routes));
}

console.log(`\n${total - failures}/${total} checks passed`);
if (failures) process.exit(1);
