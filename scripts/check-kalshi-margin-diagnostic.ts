/**
 * Kalshi margin DIAGNOSTIC — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-margin-diagnostic.ts
 *
 * The perp live panel used to show margin "status unknown" with the actual
 * Kalshi answer swallowed by a catch. The diagnostic read
 * (getKalshiMarginDiagnostic in kalshi-trading.ts) performs the same two
 * signed GETs (/margin/enabled, /margin/balance) through the same raw path
 * and captures the raw outcome for display. These checks pin:
 *
 *   A. Call builders: HTTP answers capture status + ok flag + a
 *      whitespace-collapsed, 300-char-truncated body snippet; transport
 *      failures capture the error message with null status/snippet.
 *   B. parseMarginEnabledOrNull: an explicit flag parses true/false; junk
 *      or flag-less payloads parse to null (distinct from the gate parser,
 *      which stays strict-false — pinned unchanged).
 *   C. Security: the diagnostic objects carry EXACTLY the declared fields —
 *      no headers, signature, key id, or private key can ride along.
 *   D. The async read NEVER throws: no-credentials, HTTP error statuses,
 *      and a throwing fetch (mocked) all resolve into per-call results;
 *      success shapes parse. The pre-existing throwing client behavior is
 *      pinned unchanged on the same mocked fetch.
 *   E. Source pins: the report gains marginDiagnostic ONLY inside the
 *      hasCredentials branch; the trading cycle never references the
 *      diagnostic; the panel renders the raw answers; sw vedd-v295.
 *
 * Mocked-fetch section D writes a THROWAWAY credential (a freshly generated
 * RSA key for a synthetic user id) into the local creds file ONLY when no
 * creds file exists, and removes it again — it never touches a real file.
 * No real network: global fetch is stubbed throughout section D.
 */
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import {
  marginBodySnippet, marginCallDiagnosticFromHttp, marginCallDiagnosticFromError,
  parseMarginEnabledOrNull, parseMarginEnabled, getKalshiMarginDiagnostic,
  getKalshiMarginEnabled, getKalshiMarginBalance,
  loadKalshiCredentials, saveKalshiCredentials, deleteKalshiCredentials,
} from '../server/services/kalshi-trading';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

const read = (p: string) => readFileSync(p, 'utf8');
const trading = read('server/services/kalshi-trading.ts');
const live = read('server/services/kalshi-perp-live.ts');
const panel = read('client/src/components/kalshi-shadow-panel.tsx');
const sw = read('client/public/sw.js');

// ── A. Call builders ────────────────────────────────────────────────────────
{
  const ok = marginCallDiagnosticFromHttp('/margin/enabled', 200, '{"enabled":true}');
  check('A1 HTTP 200: ok, status captured, no error', ok.ok === true && ok.httpStatus === 200 && ok.errorMessage === null);
  check('A2 HTTP 200: body snippet captured verbatim', ok.bodySnippet === '{"enabled":true}');

  const nf = marginCallDiagnosticFromHttp('/margin/enabled', 404, '{\n  "error": "not   found"\n}');
  check('A3 HTTP 404: not ok, status captured (the answer the panel used to swallow)', nf.ok === false && nf.httpStatus === 404);
  check('A4 body snippet collapses whitespace', nf.bodySnippet === '{ "error": "not found" }');

  const long = 'x'.repeat(500);
  const snip = marginBodySnippet(long);
  check('A5 snippet truncates at 300 chars + ellipsis', snip.length === 301 && snip.endsWith('…'));
  check('A6 snippet of short body is untouched', marginBodySnippet('  a  b ') === 'a b');

  const err = marginCallDiagnosticFromError('/margin/balance', new Error('socket hangup'));
  check('A7 transport failure: null status/snippet, message captured',
    err.ok === false && err.httpStatus === null && err.bodySnippet === null && err.errorMessage === 'socket hangup');
  const errStr = marginCallDiagnosticFromError('/margin/balance', 'weird');
  check('A8 non-Error failure stringifies', errStr.errorMessage === 'weird');
}

// ── B. Enabled parsing for display ──────────────────────────────────────────
{
  check('B1 explicit true parses true', parseMarginEnabledOrNull({ enabled: true }) === true);
  check('B2 explicit false parses false (answered-no is a real answer)', parseMarginEnabledOrNull({ enabled: false }) === false);
  check('B3 bare boolean parses', parseMarginEnabledOrNull(true) === true && parseMarginEnabledOrNull(false) === false);
  check('B4 alias fields parse', parseMarginEnabledOrNull({ margin_enabled: true }) === true && parseMarginEnabledOrNull({ is_enabled: false }) === false);
  check('B5 flag-less payload parses null, not false', parseMarginEnabledOrNull({ hello: 1 }) === null);
  check('B6 junk parses null', parseMarginEnabledOrNull('enabled') === null && parseMarginEnabledOrNull(null) === null && parseMarginEnabledOrNull(42) === null);
  check('B7 gate parser unchanged: strict explicit-true only',
    parseMarginEnabled({ enabled: true }) === true && parseMarginEnabled({ enabled: false }) === false && parseMarginEnabled({}) === false);
}

// ── C. Security field set ───────────────────────────────────────────────────
{
  const call = marginCallDiagnosticFromHttp('/margin/enabled', 200, '{}');
  check('C1 call diagnostic carries exactly the five declared fields',
    JSON.stringify(Object.keys(call).sort()) === JSON.stringify(['bodySnippet', 'endpoint', 'errorMessage', 'httpStatus', 'ok']));
  check('C2 diagnostic reads go through the shared raw path (same URL + headers + timeout)',
    trading.includes('kalshiMarginFetchRaw') && trading.includes("getAuthHeaders(userId, 'GET', endpoint)") && trading.includes('AbortSignal.timeout(10000)'));
  check('C3 throwing client error format unchanged after the raw-path refactor',
    trading.includes('`Kalshi margin GET ${endpoint} failed (${status}): ${bodyText.slice(0, 200)}`'));
}

// ── D. Async read never throws (mocked fetch) ───────────────────────────────
const realFetch = globalThis.fetch;
function stubFetch(handler: (url: string) => Promise<{ status: number; text: () => Promise<string> }> | { status: number; text: () => Promise<string> }): void {
  globalThis.fetch = (async (url: any) => handler(String(url))) as any;
}
const resp = (status: number, body: string) => ({ status, text: async () => body });

async function main(): Promise<void> {
  // D1: no credentials → auth failure captured per call, read still resolves.
  const ghostId = 987654321;
  if (loadKalshiCredentials(ghostId) == null) {
    const d = await getKalshiMarginDiagnostic(ghostId);
    check('D1 no credentials: resolves, both calls carry the auth error',
      d.enabled.errorMessage?.includes('No Kalshi credentials') === true && d.balance.errorMessage?.includes('No Kalshi credentials') === true);
    check('D2 no credentials: null status, null parsed values, checkedAt + host present',
      d.enabled.httpStatus === null && d.enabledParsed === null && d.balanceParsed === null
      && Number.isFinite(Date.parse(d.checkedAt)) && (d.host === 'prod' || d.host === 'demo'));
  } else {
    check('D1/D2 skipped: synthetic user unexpectedly has credentials', false);
  }

  // D2+: mocked fetch behind a throwaway credential — only when no real
  // creds file exists, so a real store is never touched.
  const credsFile = 'data/kalshi_credentials.json';
  if (!existsSync(credsFile)) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const testId = 987654322;
    saveKalshiCredentials(testId, { authMethod: 'apikey', keyId: 'diagnostic-test-key', privateKeyPem: pem });
    try {
      // Enabled answers 404 (the suspected production case), balance answers equity.
      stubFetch(async (url) => url.endsWith('/margin/enabled')
        ? resp(404, '{\n "error": "margin not available for this account"\n}')
        : resp(200, '{"cash_balance":"12.34","position_value":"0.00"}'));
      const d = await getKalshiMarginDiagnostic(testId);
      check('D3 HTTP 404 on /margin/enabled: captured, not thrown', d.enabled.ok === false && d.enabled.httpStatus === 404);
      check('D4 404 body snippet is on the diagnostic', (d.enabled.bodySnippet ?? '').includes('margin not available'));
      check('D5 error-status body is NOT parsed as an answer', d.enabledParsed === null);
      check('D6 balance parses on the same read (equity 12.34)', d.balanceParsed?.equityUsd === 12.34 && d.balanceParsed?.cashUsd === 12.34);
      const serialized = JSON.stringify(d);
      check('D6b serialized diagnostic contains NO key id, key material, or auth headers',
        !serialized.includes('diagnostic-test-key') && !serialized.includes('PRIVATE KEY') && !serialized.includes('KALSHI-ACCESS'));
      // The pre-existing throwing client keeps its exact behavior.
      let threw = '';
      try { await getKalshiMarginEnabled(testId); } catch (e: any) { threw = e?.message ?? ''; }
      check('D7 throwing client unchanged: 404 still throws with status + body',
        threw.startsWith('Kalshi margin GET /margin/enabled failed (404):'));
      const bal = await getKalshiMarginBalance(testId);
      check('D8 throwing client unchanged: balance still parses', bal.equityUsd === 12.34);

      // Fetch itself throws (network down).
      stubFetch(async () => { throw new Error('fetch failed: ECONNRESET'); });
      const d2 = await getKalshiMarginDiagnostic(testId);
      check('D9 network failure: resolves with per-call errorMessage, null status',
        d2.enabled.errorMessage?.includes('ECONNRESET') === true && d2.enabled.httpStatus === null && d2.balance.errorMessage != null);

      // Happy path: enabled true + balance.
      stubFetch(async (url) => url.endsWith('/margin/enabled')
        ? resp(200, '{"enabled":true}')
        : resp(200, '{"cash_balance":"100.00","position_value":"50.00","portfolio_value":"150.00"}'));
      const d3 = await getKalshiMarginDiagnostic(testId);
      check('D10 happy path: enabledParsed true, equity from reported portfolio_value',
        d3.enabledParsed === true && d3.balanceParsed?.equityUsd === 150);
      check('D11 happy path through the throwing client still answers true', (await getKalshiMarginEnabled(testId)) === true);
    } finally {
      globalThis.fetch = realFetch;
      deleteKalshiCredentials(testId);
      // The file did not exist before this run; if it now holds only the
      // empty map our cleanup left behind, remove it (and the data dir we
      // may have created) so the tree is exactly as found.
      try {
        if (existsSync(credsFile) && readFileSync(credsFile, 'utf8').trim() === '{}') {
          rmSync(credsFile);
          try { rmSync('data', { recursive: false }); } catch { /* dir not empty or pre-existing */ }
        }
      } catch { /* best-effort cleanup */ }
    }
  } else {
    check('D3–D11 skipped: a real creds file exists in this checkout — mocked-fetch section not run', false);
  }

  // ── E. Source pins ────────────────────────────────────────────────────────
  const reportIdx = live.indexOf('// ── panel report');
  const reportPart = live.slice(reportIdx);
  const cyclePart = live.slice(live.indexOf('async function processLiveEntries('), reportIdx);
  check('E1 report interface carries marginDiagnostic', reportPart.includes('marginDiagnostic: KalshiMarginDiagnostic | null'));
  check('E2 diagnostic populated only inside the hasCredentials branch, beside the enabled read',
    reportPart.includes('marginDiagnostic = await getKalshiMarginDiagnostic(userId).catch(() => null)')
    && reportPart.indexOf('if (hasCredentials)') < reportPart.indexOf('getKalshiMarginDiagnostic'));
  check('E3 entry cycle never references the diagnostic', cyclePart.length > 0 && !cyclePart.includes('marginDiagnostic') && !cyclePart.includes('getKalshiMarginDiagnostic'));
  check('E4 gate behavior unchanged: cycle still gates on the throwing enabled read + original block text',
    cyclePart.includes('marginEnabled = await getKalshiMarginEnabled(userId)') && cyclePart.includes('Kalshi margin is not enabled for this account (/margin/enabled is not true)'));
  check('E5 panel renders the raw answers beside the margin line',
    panel.includes('Kalshi answered:') && panel.includes('data.marginDiagnostic') && panel.includes('fmtMarginCall'));
  check('E6 sw bumped to vedd-v295', sw.includes("CACHE_VERSION = 'vedd-v295'"));

  console.log(`\n${total - failures}/${total} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { globalThis.fetch = realFetch; console.error('check crashed:', e); process.exit(1); });
