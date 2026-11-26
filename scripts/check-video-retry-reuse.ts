/**
 * Video retry — never charge twice for a failed video.
 *
 * Run:  node --import tsx/esm scripts/check-video-retry-reuse.ts
 *
 * No live network, no database: the scrub helper is exercised directly and
 * the resume guarantees are pinned by source checks (same style as
 * check-daily-video-jobs.ts).
 *
 *   A. scrubErrorDetail (pure): readable provider text survives; sk- keys,
 *      Bearer tokens and key=value credentials are redacted; output capped.
 *   B. Resume selection: only FAILED explainer jobs with paid work saved
 *      (script and/or a finished scene URL), matched by post or by input;
 *      startExplainerJob resumes BEFORE it can INSERT a new job, and the
 *      resume relaunches the SAME row with its script + sceneUrls.
 *   C. Assembly-failure reuse: runJob seeds its scene slots from
 *      resume.sceneUrls and only calls renderScene for empty slots — a
 *      job that failed after all scenes rendered needs zero new renders.
 *   D. Daily limit: jobsToday excludes retryResume jobs, and both entry
 *      routes skip the limit check when a resumable job exists.
 *   E. Owner detail: the explainer poll route exposes scrubbed
 *      errorDetail; the shared JobProgress UI shows it under the friendly
 *      headline and tells the user a retry reuses rendered scenes.
 *   F. Kill switch: VIDEO_RETRY_REUSE=off makes the finder return null,
 *      so every start falls through to the unchanged fresh-job path.
 */
import { readFileSync } from 'node:fs';
import { scrubErrorDetail, videoRetryReuseEnabled } from '../server/services/explainer-video';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(p, 'utf8');
const explainer = src('server/services/explainer-video.ts');
const routes = src('server/routes.ts');
const maker = src('client/src/components/content-studio/explainer-maker.tsx');
const sw = src('client/public/sw.js');

const seg = (s: string, from: string, to: string) => s.slice(s.indexOf(from), s.indexOf(to));

// A — scrub (pure)
{
  check('A1 plain provider error stays readable',
    scrubErrorDetail('scene failed: model overloaded at step 3') === 'scene failed: model overloaded at step 3');
  check('A2 sk- key redacted', !/sk-live/.test(scrubErrorDetail('auth failed for sk-liveabcdef123456')));
  check('A3 Bearer token redacted', !/abc123token/.test(scrubErrorDetail('OpenRouter 401: Bearer abc123token.value')));
  check('A4 api_key=value redacted', !/hunter2/.test(scrubErrorDetail('bad request api_key=hunter2 retry')));
  check('A5 long opaque token redacted', !/a{40}/.test(scrubErrorDetail(`failed ${'a'.repeat(48)} end`)));
  check('A6 output capped at 300 chars', scrubErrorDetail('x'.repeat(500) + ' tail').length <= 300);
  check('A7 empty/null detail scrubs to empty string', scrubErrorDetail(null) === '' && scrubErrorDetail(undefined) === '');
}

// B — resume selection + wiring
{
  const find = seg(explainer, 'export async function findResumableFailedExplainerJob', 'export async function resumeFailedExplainerJob');
  check('B1 finder only picks FAILED explainer jobs', find.includes("kind='explainer' AND status='failed'"));
  check('B2 finder requires saved paid work (script or a finished scene)',
    find.includes('script IS NOT NULL') && find.includes("jsonb_array_elements_text(COALESCE(meta->'sceneUrls'"));
  check('B3 finder matches by post when postId is given, else by input',
    find.includes("meta->>'postId' = $2") && find.includes('input = $2'));
  check('B4 finder takes the latest such job', find.includes('ORDER BY id DESC LIMIT 1'));

  const resume = seg(explainer, 'export async function resumeFailedExplainerJob', 'export function scrubErrorDetail');
  check('B5 resume relaunches with the stored script + sceneUrls as resume state',
    resume.includes('script: job.script ?? undefined') && resume.includes('sceneUrls: Array.isArray(meta.sceneUrls) ? meta.sceneUrls : undefined'));
  check('B6 resume reuses the same job row (no INSERT in the resume path)',
    !resume.includes('INSERT INTO content_video_jobs') && resume.includes('return job.id'));
  check('B7 resume resets the row to running and clears the old error',
    resume.includes("status: 'running', error: null") && resume.includes('retryResume: true'));

  const start = seg(explainer, 'export async function startExplainerJob', 'function friendlyError');
  check('B8 startExplainerJob looks for a resumable failed job before inserting',
    start.indexOf('findResumableFailedExplainerJob') > -1
    && start.indexOf('findResumableFailedExplainerJob') < start.indexOf('INSERT INTO content_video_jobs'));
  check('B9 a found job is resumed and its id returned (no new job)',
    start.includes('if (failed) return resumeFailedExplainerJob(failed);'));
}

// C — assembly-failure reuse (zero renders when every scene already exists)
{
  const run = seg(explainer, 'async function runJob', '// ─── Script');
  check('C1 runJob seeds scene slots from resume.sceneUrls',
    run.includes('resume.sceneUrls?.[i] ?? null'));
  check('C2 renderScene is only called for empty scene slots',
    run.includes('if (!urls[i])') && run.includes('await renderScene('));
  check('C3 script is not rewritten on a resume',
    run.includes('resume.script') && run.includes('dailyAd ? await writeAdScript'));
}

// D — daily limit
{
  const jobs = seg(explainer, 'export async function jobsToday', '// ─── Manual retry');
  check('D1 jobsToday excludes resumed-from-failure jobs',
    jobs.includes("NOT COALESCE((meta->>'retryResume')::boolean, false)"));
  check('D2 post-video route skips the limit when a resumable job exists',
    routes.includes('findResumableFailedExplainerJob(u.id, { postId: Number(req.params.id) })')
    && routes.includes('!resumable && (await ex.rendersToday(u.id)) >= limit'));
  check('D3 explainer route skips the limit when a resumable job exists',
    routes.includes('findResumableFailedExplainerJob(u.id, { input: prompt })'));
}

// E — owner-visible detail
{
  check('E1 poll route exposes errorDetail, scrubbed',
    routes.includes('errorDetail: job.meta?.error_detail ? ex.scrubErrorDetail(job.meta.error_detail) : null'));
  check('E2 client job type carries errorDetail', maker.includes('errorDetail?: string | null'));
  check('E3 JobProgress shows the detail under the friendly headline',
    maker.includes('Detail: {job.errorDetail}'));
  check('E4 failure UI tells the user a retry reuses rendered scenes',
    maker.includes("you won't be charged for them twice"));
}

// F — kill switch
{
  check('F1 kill switch reads VIDEO_RETRY_REUSE', explainer.includes("process.env.VIDEO_RETRY_REUSE !== 'off'"));
  const find = seg(explainer, 'export async function findResumableFailedExplainerJob', 'export async function resumeFailedExplainerJob');
  check('F2 switch off = finder returns null (fresh-job path unchanged)',
    find.includes('if (!videoRetryReuseEnabled()) return null;'));
  const prev = process.env.VIDEO_RETRY_REUSE;
  process.env.VIDEO_RETRY_REUSE = 'off';
  check('F3 helper reports off when env is off', videoRetryReuseEnabled() === false);
  delete process.env.VIDEO_RETRY_REUSE;
  check('F4 helper defaults to on', videoRetryReuseEnabled() === true);
  if (prev !== undefined) process.env.VIDEO_RETRY_REUSE = prev;
  check('F5 sw bumped for the client change', sw.includes("CACHE_VERSION = 'vedd-v298'"));
}

console.log(`\n${total - failures}/${total} checks passed`);
if (failures) process.exit(1);
