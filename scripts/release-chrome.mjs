#!/usr/bin/env node
/**
 * Chrome Web Store upload / publish / status through the Chrome Web Store API v2. Zero dependencies.
 *
 *   node scripts/release-chrome.mjs upload  --zip dist/release/xmark-manager-X.Y.Z-chrome.zip [--dry-run]
 *   node scripts/release-chrome.mjs publish --expected-version X.Y.Z [--dry-run]
 *   node scripts/release-chrome.mjs status  [--dry-run]
 *
 * Environment (names only, values come from GitHub environment secrets):
 *   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_EXTENSION_ID, CWS_PUBLISHER_ID
 *
 * Endpoints (https://developer.chrome.com/docs/webstore/using-api, read for this task):
 *   POST https://oauth2.googleapis.com/token                                              (refresh token -> access token)
 *   POST https://chromewebstore.googleapis.com/upload/v2/publishers/{P}/items/{E}:upload  (raw zip body)
 *   POST https://chromewebstore.googleapis.com/v2/publishers/{P}/items/{E}:publish
 *   GET  https://chromewebstore.googleapis.com/v2/publishers/{P}/items/{E}:fetchStatus
 * The API cannot create an item: the FIRST version must be uploaded in the Developer Dashboard.
 * A dry run prints the requests without reading secrets or touching the network. Secrets and
 * tokens are never printed.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from './release-http.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://chromewebstore.googleapis.com';
const ID = /^[a-z]{32}$/;
const PUBLISHER = /^[A-Za-z0-9_-]{1,64}$/;

/** `lenient` (dry run only) lets missing ids show as placeholders instead of failing. */
export function endpoints({ publisherId, extensionId }, { lenient = false } = {}) {
  if (lenient) {
    publisherId ||= '<CWS_PUBLISHER_ID>';
    extensionId ||= '<CWS_EXTENSION_ID>';
  } else {
    if (!PUBLISHER.test(publisherId ?? ''))
      throw new Error('CWS_PUBLISHER_ID is missing or malformed');
    if (!ID.test(extensionId ?? '')) {
      throw new Error('CWS_EXTENSION_ID must be the 32-letter extension id');
    }
  }
  const item = `publishers/${publisherId}/items/${extensionId}`;
  return {
    upload: `${API}/upload/v2/${item}:upload`,
    publish: `${API}/v2/${item}:publish`,
    status: `${API}/v2/${item}:fetchStatus`,
  };
}

/** The requests an action would send, with the bearer token and secrets shown as placeholders. */
export function plan(action, { publisherId, extensionId, zip }, options) {
  const urls = endpoints({ publisherId, extensionId }, options);
  const auth = { Authorization: 'Bearer <access token>' };
  const token = {
    method: 'POST',
    url: TOKEN_URL,
    body: 'client_id=<CWS_CLIENT_ID>&client_secret=<CWS_CLIENT_SECRET>&refresh_token=<CWS_REFRESH_TOKEN>&grant_type=refresh_token',
  };
  if (action === 'upload') {
    if (!zip) throw new Error('upload needs --zip');
    return [
      token,
      { method: 'POST', url: urls.upload, headers: auth, body: `<contents of ${zip}>` },
    ];
  }
  if (action === 'publish') return [token, { method: 'POST', url: urls.publish, headers: auth }];
  if (action === 'status') return [token, { method: 'GET', url: urls.status, headers: auth }];
  throw new Error(`unknown action: ${action} (expected upload, publish or status)`);
}

async function json(response, what) {
  const text = await response.text();
  if (!response.ok)
    throw new Error(`${what} failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${what}: response was not JSON`);
  }
}

/**
 * @param {{action: string, zip?: string, dryRun?: boolean, env?: Record<string,string|undefined>,
 *   fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, log?: (s: string) => void,
 *   maxPolls?: number, expectedVersion?: string}} options
 */
export async function run({
  action,
  zip,
  dryRun = false,
  env = process.env,
  fetch: doFetch = globalThis.fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = console.log,
  maxPolls = 30,
  expectedVersion,
}) {
  const net = { sleep: dryRun ? undefined : sleep };
  const cfg = { publisherId: env.CWS_PUBLISHER_ID, extensionId: env.CWS_EXTENSION_ID, zip };
  const requests = plan(action, cfg, { lenient: dryRun });
  if (dryRun) {
    log(`DRY RUN: ${action}. Nothing is sent. Requests that would be made:`);
    for (const r of requests) {
      log(`  ${r.method} ${r.url}`);
      if (r.headers) log(`    headers: ${Object.keys(r.headers).join(', ')}`);
      if (r.body) log(`    body: ${r.body}`);
    }
    return { dryRun: true, requests };
  }
  for (const name of ['CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN']) {
    if (!env[name]) throw new Error(`${name} is not set`);
  }
  const urls = endpoints(cfg);
  const tokenResponse = await json(
    await request(doFetch, TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.CWS_CLIENT_ID,
        client_secret: env.CWS_CLIENT_SECRET,
        refresh_token: env.CWS_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    }),
    'token request',
  );
  if (!tokenResponse.access_token) throw new Error('token response had no access_token');
  const headers = { Authorization: `Bearer ${tokenResponse.access_token}` };

  if (action === 'status') {
    const status = await json(await request(doFetch, urls.status, { headers }, net), 'fetchStatus');
    log(JSON.stringify(status, null, 2));
    return status;
  }
  if (action === 'publish') {
    // Tie the publish to the verified release: the draft awaiting submission must be this version.
    // UNCONFIRMED field names: only `submittedItemRevisionStatus.distributionChannels[]` is named
    // by the fetchStatus reference; `crxVersion` inside it is assumed (the upload response does
    // document `crxVersion`). If the version cannot be read, publishing is refused.
    if (!expectedVersion) throw new Error('publish needs --expected-version');
    const current = await json(
      await request(doFetch, urls.status, { headers }, net),
      'fetchStatus',
    );
    const versions = (current.submittedItemRevisionStatus?.distributionChannels ?? []).map(
      (c) => c?.crxVersion,
    );
    if (!versions.includes(expectedVersion)) {
      throw new Error(
        `refusing to publish: the submitted draft has version ${versions.join(', ') || '(unreadable)'}, expected ${expectedVersion}`,
      );
    }
    // Default publish (no body): publishType DEFAULT_PUBLISH, no skipReview, no blockOnWarnings.
    // https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish
    const result = await json(
      await request(doFetch, urls.publish, { method: 'POST', headers }, net),
      'publish',
    );
    log(JSON.stringify(result, null, 2));
    return result;
  }
  const body = await readFile(zip);
  // The upload POST is sent exactly once (never retried); only the status GETs are retried.
  let result = await json(
    await request(
      doFetch,
      urls.upload,
      { method: 'POST', headers, body },
      { ...net, timeoutMs: 300_000 },
    ),
    'upload',
  );
  // Values per https://developer.chrome.com/docs/webstore/api/reference/rest/v2/UploadState:
  // UPLOAD_STATE_UNSPECIFIED, SUCCEEDED, IN_PROGRESS, FAILED, NOT_FOUND. The upload response
  // carries `uploadState`; fetchStatus carries `lastAsyncUploadState`.
  if (expectedVersion && result.crxVersion !== undefined && result.crxVersion !== expectedVersion) {
    throw new Error(
      `uploaded package has version ${result.crxVersion}, expected ${expectedVersion}`,
    );
  }
  if (expectedVersion && result.crxVersion === undefined) {
    log('warning: the upload response has no crxVersion; publish re-checks the draft version');
  }
  let state = result.uploadState;
  for (let i = 0; state === 'IN_PROGRESS' && i < maxPolls; i++) {
    await sleep(10_000);
    result = await json(await request(doFetch, urls.status, { headers }, net), 'fetchStatus');
    state = result.lastAsyncUploadState;
  }
  log(`upload state: ${state ?? '(missing)'}`);
  if (state !== 'SUCCEEDED') {
    const why = state === 'IN_PROGRESS' ? 'still in progress after the wait' : `state ${state}`;
    throw new Error(`upload did not succeed (${why}): ${JSON.stringify(result).slice(0, 500)}`);
  }
  return result;
}

function parseArgs(argv) {
  const [action, ...rest] = argv;
  const opts = { action };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--zip') opts.zip = rest[++i];
    else if (rest[i] === '--expected-version') opts.expectedVersion = rest[++i];
    else if (rest[i] === '--dry-run') opts.dryRun = true;
    else throw new Error(`unknown argument: ${rest[i]}`);
  }
  return opts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
