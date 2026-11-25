#!/usr/bin/env node
/**
 * Uploads the EXACT Firefox zip from the release to addons.mozilla.org through the AMO REST API v5.
 * Zero dependencies (Node 20 fetch, FormData, crypto).
 *
 *   node scripts/release-firefox.mjs --zip dist/release/xmark-manager-X.Y.Z-firefox.zip \
 *     --channel listed|unlisted [--metadata amo-metadata.json] [--dry-run]
 *
 * Environment (names only): AMO_JWT_ISSUER, AMO_JWT_SECRET.
 *
 * Why not `web-ext sign`: it builds the package from a source directory itself, so it cannot upload
 * the byte-identical, checksummed zip produced by the release workflow.
 *
 * Flow (https://mozilla.github.io/addons-server/topics/api/addons.html, read for this task):
 *   1. POST /api/v5/addons/upload/                 multipart: upload=<zip>, channel
 *   2. GET  /api/v5/addons/upload/<uuid>/          poll until processed; need valid=true
 *   3a. add-on exists:  POST /api/v5/addons/addon/<guid>/versions/   {upload, ...metadata.version}
 *   3b. new add-on:     POST /api/v5/addons/addon/                   {...metadata, version:{upload,...}}
 *       A LISTED first submission needs name, summary, categories and version.license in the
 *       metadata file (the same fields web-ext documents for --amo-metadata).
 * Auth: `Authorization: JWT <HS256 token>` with claims iss, jti, iat, exp (exp <= iat + 5 minutes).
 * UNCONFIRMED: how an unlisted signed file is downloaded afterwards, and the exact upload `valid`
 * semantics beyond the documented fields; both are read from the AMO developer hub by hand.
 * A dry run prints the plan without reading secrets or using the network.
 */

import { createHmac, randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from './release-http.mjs';
import { readZipEntries } from './zip.mjs';

const BASE = 'https://addons.mozilla.org/api/v5';

const b64url = (input) => Buffer.from(input).toString('base64url');

/** HS256 JWT as described by the AMO auth docs. `ttlSeconds` must stay below 300. */
export function buildJwt({
  issuer,
  secret,
  now = Math.floor(Date.now() / 1000),
  jti = randomUUID(),
  ttlSeconds = 60,
}) {
  if (!issuer || !secret) throw new Error('AMO_JWT_ISSUER and AMO_JWT_SECRET are required');
  if (ttlSeconds >= 300) throw new Error('JWT lifetime must be under five minutes');
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: issuer, jti, iat: now, exp: now + ttlSeconds }));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

/** Add-on id and version from the manifest inside a zip; refuses the repository placeholder id. */
export function readZipManifest(zipBuffer) {
  const entry = readZipEntries(zipBuffer).find((e) => e.name === 'manifest.json');
  if (!entry) throw new Error('zip has no manifest.json at its root');
  const manifest = JSON.parse(entry.data.toString('utf8'));
  const id = manifest.browser_specific_settings?.gecko?.id;
  if (!id) throw new Error('manifest has no browser_specific_settings.gecko.id');
  return { id, version: manifest.version };
}

/** Throws when the id is the placeholder from the repository (a real upload would be wrong). */
export function assertRealAddonId(id) {
  if (/placeholder|\.invalid$/i.test(id)) {
    throw new Error(
      `add-on id "${id}" is a placeholder; set the real id in src/manifest.json first`,
    );
  }
}

const METADATA_NAME = /^[A-Za-z0-9._/-]+\.json$/;

/**
 * Reads the AMO metadata file. The path must be a plain relative `.json` path inside `cwd`
 * (no `..`, no absolute path, no symlink tricks beyond what resolve() shows). Parse errors never
 * echo file content.
 */
export async function readMetadata(path, cwd = process.cwd()) {
  if (!METADATA_NAME.test(path) || path.split('/').includes('..') || isAbsolute(path)) {
    throw new Error(
      '--metadata must be a relative path of letters, digits, . _ - / ending in .json',
    );
  }
  // realpath resolves symlinks, so a link inside the workspace cannot point outside it.
  const full = await realpath(resolve(cwd, path));
  const rel = relative(await realpath(cwd), full);
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new Error('--metadata must stay inside the workspace');
  const text = await readFile(full, 'utf8');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('metadata file is not valid JSON');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('metadata file must contain a JSON object');
  }
  return data;
}

export function plan({ id, channel, hasMetadata }) {
  if (!['listed', 'unlisted'].includes(channel))
    throw new Error('--channel must be listed or unlisted');
  return [
    {
      method: 'POST',
      url: `${BASE}/addons/upload/`,
      note: `multipart: upload=<zip>, channel=${channel}`,
    },
    { method: 'GET', url: `${BASE}/addons/upload/<uuid>/`, note: 'poll until processed and valid' },
    {
      method: 'GET',
      url: `${BASE}/addons/addon/${encodeURIComponent(id)}/`,
      note: 'does the add-on exist? 404 means first submission',
    },
    {
      method: 'POST',
      url: `${BASE}/addons/addon/${encodeURIComponent(id)}/versions/`,
      note: 'if it exists: {upload: <uuid>, ...metadata.version}',
    },
    {
      method: 'POST',
      url: `${BASE}/addons/addon/`,
      note: `if new: {...metadata, version: {upload: <uuid>, ...}}${
        channel === 'listed' && !hasMetadata
          ? ' (listed needs --metadata with name, summary, categories, license)'
          : ''
      }`,
    },
  ];
}

/**
 * @param {{zip: string, channel: string, metadata?: string, dryRun?: boolean,
 *   env?: Record<string,string|undefined>, fetch?: typeof fetch,
 *   sleep?: (ms: number) => Promise<void>, log?: (s: string) => void, maxPolls?: number,
 *   expectedVersion?: string, cwd?: string}} options
 */
export async function run({
  zip,
  channel,
  metadata,
  dryRun = false,
  env = process.env,
  fetch: doFetch = globalThis.fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = console.log,
  maxPolls = 60,
  expectedVersion,
  cwd = process.cwd(),
}) {
  if (!zip) throw new Error('--zip is required');
  const zipBuffer = await readFile(zip);
  const { id, version } = readZipManifest(zipBuffer);
  if (expectedVersion !== undefined && version !== expectedVersion) {
    throw new Error(
      `zip manifest version ${version} does not match the expected ${expectedVersion}`,
    );
  }
  const steps = plan({ id, channel, hasMetadata: Boolean(metadata) });
  if (dryRun) {
    if (metadata) await readMetadata(metadata, cwd);
    log(`DRY RUN: add-on ${id} version ${version}, channel ${channel}. Nothing is sent. Plan:`);
    for (const s of steps) log(`  ${s.method} ${s.url}  # ${s.note}`);
    log('  header: Authorization: JWT <redacted>');
    return { dryRun: true, id, version, steps };
  }
  assertRealAddonId(id);
  const extra = metadata ? await readMetadata(metadata, cwd) : {};
  const authHeaders = () => ({
    Authorization: `JWT ${buildJwt({ issuer: env.AMO_JWT_ISSUER, secret: env.AMO_JWT_SECRET })}`,
  });
  const call = async (url, init = {}) => {
    const response = await request(
      doFetch,
      url,
      { ...init, headers: { ...authHeaders(), ...init.headers } },
      { sleep, timeoutMs: init.body instanceof FormData ? 300_000 : 30_000 },
    );
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return { status: response.status, ok: response.ok, data, text };
  };
  const must = (r, what) => {
    if (!r.ok) throw new Error(`${what} failed: HTTP ${r.status} ${r.text.slice(0, 500)}`);
    return r.data;
  };

  const form = new FormData();
  form.set('upload', new Blob([zipBuffer], { type: 'application/zip' }), zip.split(/[\\/]/).pop());
  form.set('channel', channel);
  let upload = must(await call(`${BASE}/addons/upload/`, { method: 'POST', body: form }), 'upload');
  for (let i = 0; !upload.processed && i < maxPolls; i++) {
    await sleep(5_000);
    upload = must(await call(`${BASE}/addons/upload/${upload.uuid}/`), 'upload status');
  }
  if (!upload.processed) throw new Error('upload was not processed in time');
  if (!upload.valid) {
    throw new Error(
      `upload is not valid: ${JSON.stringify(upload.validation ?? {}).slice(0, 800)}`,
    );
  }
  if (upload.submitted) throw new Error('upload was already submitted');

  const existing = await call(`${BASE}/addons/addon/${encodeURIComponent(id)}/`);
  let result;
  if (existing.ok) {
    result = must(
      await call(`${BASE}/addons/addon/${encodeURIComponent(id)}/versions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(extra.version ?? {}), upload: upload.uuid }),
      }),
      'create version',
    );
    log(`created version ${result.version ?? version} for ${id} (${channel})`);
  } else if (existing.status === 404) {
    if (channel === 'listed' && !metadata) {
      throw new Error(
        'first listed submission: pass --metadata (name, summary, categories, version.license)',
      );
    }
    result = must(
      await call(`${BASE}/addons/addon/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...extra,
          version: { ...(extra.version ?? {}), upload: upload.uuid },
        }),
      }),
      'create add-on',
    );
    log(`created add-on ${id} with its first version (${channel})`);
  } else {
    throw new Error(`add-on lookup failed: HTTP ${existing.status} ${existing.text.slice(0, 300)}`);
  }
  return result;
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--zip') opts.zip = argv[++i];
    else if (a === '--channel') opts.channel = argv[++i];
    else if (a === '--metadata') opts.metadata = argv[++i];
    else if (a === '--expected-version') opts.expectedVersion = argv[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else throw new Error(`unknown argument: ${a}`);
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
