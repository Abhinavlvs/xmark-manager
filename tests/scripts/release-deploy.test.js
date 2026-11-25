import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createZip } from '../../scripts/zip.mjs';
import * as chrome from '../../scripts/release-chrome.mjs';
import * as firefox from '../../scripts/release-firefox.mjs';

const EXT = 'a'.repeat(32);
const CHROME_ENV = {
  CWS_CLIENT_ID: 'id-value',
  CWS_CLIENT_SECRET: 'secret-value',
  CWS_REFRESH_TOKEN: 'refresh-value',
  CWS_EXTENSION_ID: EXT,
  CWS_PUBLISHER_ID: 'pub1',
};
const noSleep = async () => {};
const reply = (status, body) => ({
  ok: status < 400,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

let dir;
let chromeZip;
let firefoxZip;
let firefoxPlaceholderZip;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'xmark-deploy-'));
  chromeZip = join(dir, 'c.zip');
  await writeFile(chromeZip, 'zip-bytes');
  const mk = (id) =>
    createZip([
      {
        name: 'manifest.json',
        data: Buffer.from(
          JSON.stringify({ version: '1.2.3', browser_specific_settings: { gecko: { id } } }),
        ),
      },
    ]);
  firefoxZip = join(dir, 'f.zip');
  await writeFile(firefoxZip, mk('real@example.org'));
  firefoxPlaceholderZip = join(dir, 'p.zip');
  await writeFile(firefoxPlaceholderZip, mk('xmark-manager@placeholder.invalid'));
});
after(() => rm(dir, { recursive: true, force: true }));

test('chrome endpoints follow the v2 documentation and validate ids', () => {
  const e = chrome.endpoints({ publisherId: 'pub1', extensionId: EXT });
  assert.equal(
    e.upload,
    `https://chromewebstore.googleapis.com/upload/v2/publishers/pub1/items/${EXT}:upload`,
  );
  assert.equal(
    e.publish,
    `https://chromewebstore.googleapis.com/v2/publishers/pub1/items/${EXT}:publish`,
  );
  assert.equal(
    e.status,
    `https://chromewebstore.googleapis.com/v2/publishers/pub1/items/${EXT}:fetchStatus`,
  );
  assert.throws(() => chrome.endpoints({ publisherId: 'pub1', extensionId: 'short' }), /32-letter/);
  assert.throws(() => chrome.endpoints({ publisherId: '../x', extensionId: EXT }), /PUBLISHER/);
  assert.throws(
    () => chrome.plan('delete', { publisherId: 'p', extensionId: EXT }),
    /unknown action/,
  );
});

test('chrome dry run needs no secrets, sends nothing and prints no secret values', async () => {
  const lines = [];
  const r = await chrome.run({
    action: 'upload',
    zip: 'x.zip',
    dryRun: true,
    env: { CWS_EXTENSION_ID: EXT, CWS_PUBLISHER_ID: 'pub1' },
    fetch: () => assert.fail('network used in a dry run'),
    log: (s) => lines.push(s),
  });
  assert.equal(r.dryRun, true);
  assert.match(lines.join('\n'), /:upload/);
  assert.doesNotMatch(lines.join('\n'), /secret-value|refresh-value/);
});

test('chrome upload exchanges the refresh token, uploads the raw zip and polls', async () => {
  const calls = [];
  const responses = [
    reply(200, { access_token: 'AT' }),
    reply(200, { uploadState: 'IN_PROGRESS' }),
    reply(200, { lastAsyncUploadState: 'IN_PROGRESS' }),
    reply(200, { lastAsyncUploadState: 'SUCCEEDED' }),
  ];
  const lines = [];
  const result = await chrome.run({
    action: 'upload',
    zip: chromeZip,
    env: CHROME_ENV,
    sleep: noSleep,
    log: (s) => lines.push(s),
    fetch: async (url, init) => {
      calls.push({ url, init });
      return responses.shift();
    },
  });
  assert.equal(result.lastAsyncUploadState, 'SUCCEEDED');
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(calls[0].init.body.get('grant_type'), 'refresh_token');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer AT');
  assert.equal(Buffer.from(calls[1].init.body).toString(), 'zip-bytes');
  assert.match(calls[2].url, /:fetchStatus$/);
  assert.doesNotMatch(lines.join('\n'), /AT|secret-value|refresh-value/);
});

test('chrome upload failure and HTTP errors are reported, not swallowed', async () => {
  await assert.rejects(
    chrome.run({
      action: 'upload',
      zip: chromeZip,
      env: CHROME_ENV,
      fetch: (() => {
        const q = [reply(200, { access_token: 'AT' }), reply(200, { uploadState: 'FAILED' })];
        return async () => q.shift();
      })(),
      log: () => {},
    }),
    /did not succeed/,
  );
  await assert.rejects(
    chrome.run({
      action: 'publish',
      env: CHROME_ENV,
      fetch: async () => reply(401, 'nope'),
      log: () => {},
    }),
    /token request failed: HTTP 401/,
  );
  await assert.rejects(
    chrome.run({ action: 'status', env: { ...CHROME_ENV, CWS_REFRESH_TOKEN: '' }, log: () => {} }),
    /CWS_REFRESH_TOKEN is not set/,
  );
});

test('chrome status calls fetchStatus', async () => {
  const calls = [];
  const q = [reply(200, { access_token: 'AT' }), reply(200, { ok: true })];
  await chrome.run({
    action: 'status',
    env: CHROME_ENV,
    log: () => {},
    fetch: async (url, init) => {
      calls.push({ url, init });
      return q.shift();
    },
  });
  assert.ok(calls[1].url.endsWith(':fetchStatus'));
});

const draft = (version) => ({
  submittedItemRevisionStatus: {
    state: 'PENDING_REVIEW',
    distributionChannels: [{ crxVersion: version }],
  },
});

test('chrome publish checks the submitted draft version, then publishes with no body', async () => {
  const calls = [];
  const q = [
    reply(200, { access_token: 'AT' }),
    reply(200, draft('1.2.3')),
    reply(200, { state: 'PENDING_REVIEW' }),
  ];
  await chrome.run({
    action: 'publish',
    expectedVersion: '1.2.3',
    env: CHROME_ENV,
    log: () => {},
    fetch: async (url, init) => {
      calls.push({ url, init });
      return q.shift();
    },
  });
  assert.ok(calls[1].url.endsWith(':fetchStatus'));
  assert.ok(calls[2].url.endsWith(':publish'));
  assert.equal(calls[2].init.method, 'POST');
  assert.equal(calls[2].init.body, undefined);
});

test('chrome publish is refused for another version, an unreadable draft, or no expected version', async () => {
  const attempt = (expectedVersion, status) => {
    const q = [reply(200, { access_token: 'AT' }), reply(200, status), reply(200, {})];
    let published = false;
    const p = chrome.run({
      action: 'publish',
      expectedVersion,
      env: CHROME_ENV,
      log: () => {},
      fetch: async (url) => {
        if (url.endsWith(':publish')) published = true;
        return q.shift();
      },
    });
    return { p, published: () => published };
  };
  const wrong = attempt('1.2.3', draft('1.2.2'));
  await assert.rejects(wrong.p, /refusing to publish: .*1\.2\.2.*expected 1\.2\.3/);
  assert.equal(wrong.published(), false);
  await assert.rejects(attempt('1.2.3', {}).p, /unreadable/);
  await assert.rejects(attempt(undefined, draft('1.2.3')).p, /needs --expected-version/);
});

test('chrome upload refuses a package whose crxVersion differs from the release', async () => {
  const q = [
    reply(200, { access_token: 'AT' }),
    reply(200, { uploadState: 'SUCCEEDED', crxVersion: '0.9.0' }),
  ];
  await assert.rejects(
    chrome.run({
      action: 'upload',
      zip: chromeZip,
      expectedVersion: '1.0.0',
      env: CHROME_ENV,
      log: () => {},
      fetch: async () => q.shift(),
    }),
    /version 0\.9\.0, expected 1\.0\.0/,
  );
});

test('firefox metadata: a symlink inside the workspace cannot point outside it', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'xmark-outside-'));
  await writeFile(join(outside, 'secret.json'), JSON.stringify({ stolen: true }));
  await symlink(join(outside, 'secret.json'), join(dir, 'link.json'));
  await assert.rejects(firefox.readMetadata('link.json', dir), /inside the workspace/);
  await rm(outside, { recursive: true, force: true });
});

test('firefox JWT is a valid HS256 token with a short lifetime', () => {
  const jwt = firefox.buildJwt({ issuer: 'user:1', secret: 's3', now: 1000, jti: 'j' });
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'HS256', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url')), {
    iss: 'user:1',
    jti: 'j',
    iat: 1000,
    exp: 1060,
  });
  assert.equal(s, createHmac('sha256', 's3').update(`${h}.${p}`).digest('base64url'));
  assert.throws(
    () => firefox.buildJwt({ issuer: 'a', secret: 'b', ttlSeconds: 300 }),
    /five minutes/,
  );
  assert.throws(() => firefox.buildJwt({ issuer: '', secret: 'b' }), /required/);
});

test('firefox dry run prints the plan from the zip manifest and sends nothing', async () => {
  const lines = [];
  const r = await firefox.run({
    zip: firefoxPlaceholderZip,
    channel: 'listed',
    dryRun: true,
    env: {},
    fetch: () => assert.fail('network used in a dry run'),
    log: (s) => lines.push(s),
  });
  assert.equal(r.version, '1.2.3');
  assert.match(lines.join('\n'), /addons\/upload\//);
  assert.match(lines.join('\n'), /JWT <redacted>/);
  assert.throws(() => firefox.plan({ id: 'x', channel: 'beta' }), /listed or unlisted/);
});

test('firefox refuses the placeholder add-on id for a real upload', async () => {
  await assert.rejects(
    firefox.run({
      zip: firefoxPlaceholderZip,
      channel: 'unlisted',
      env: { AMO_JWT_ISSUER: 'i', AMO_JWT_SECRET: 's' },
      fetch: () => assert.fail('must not call the network'),
    }),
    /placeholder/,
  );
});

test('firefox new version: upload, poll, version create', async () => {
  const calls = [];
  const q = [
    reply(201, { uuid: 'u1', processed: false }),
    reply(200, { uuid: 'u1', processed: true, valid: true, submitted: false }),
    reply(200, { guid: 'real@example.org' }),
    reply(201, { version: '1.2.3' }),
  ];
  await firefox.run({
    zip: firefoxZip,
    channel: 'listed',
    env: { AMO_JWT_ISSUER: 'i', AMO_JWT_SECRET: 's' },
    sleep: noSleep,
    log: () => {},
    fetch: async (url, init = {}) => {
      calls.push({ url, init });
      return q.shift();
    },
  });
  assert.ok(calls.every((c) => /^JWT /.test(c.init.headers.Authorization)));
  assert.equal(calls[0].url, 'https://addons.mozilla.org/api/v5/addons/upload/');
  assert.equal(calls[0].init.body.get('channel'), 'listed');
  assert.match(calls[3].url, /addon\/real%40example\.org\/versions\/$/);
  assert.equal(JSON.parse(calls[3].init.body).upload, 'u1');
});

test('firefox first listed submission needs metadata; invalid uploads are refused', async () => {
  const env = { AMO_JWT_ISSUER: 'i', AMO_JWT_SECRET: 's' };
  const valid = { uuid: 'u', processed: true, valid: true, submitted: false };
  await assert.rejects(
    firefox.run({
      zip: firefoxZip,
      channel: 'listed',
      env,
      log: () => {},
      fetch: (() => {
        const q = [reply(201, valid), reply(404, 'nf')];
        return async () => q.shift();
      })(),
    }),
    /pass --metadata/,
  );
  await assert.rejects(
    firefox.run({
      zip: firefoxZip,
      channel: 'unlisted',
      env,
      log: () => {},
      fetch: async () => reply(201, { ...valid, valid: false, validation: { errors: 1 } }),
    }),
    /not valid/,
  );
});

test('chrome upload accepts an immediate SUCCEEDED and rejects every other final state', async () => {
  const mk = (state) => {
    const q = [reply(200, { access_token: 'AT' }), reply(200, { uploadState: state })];
    return chrome.run({
      action: 'upload',
      zip: chromeZip,
      env: CHROME_ENV,
      sleep: noSleep,
      log: () => {},
      fetch: async () => q.shift(),
    });
  };
  assert.equal((await mk('SUCCEEDED')).uploadState, 'SUCCEEDED');
  for (const bad of ['SUCCESS', 'FAILED', 'NOT_FOUND', 'UPLOAD_STATE_UNSPECIFIED', undefined]) {
    await assert.rejects(mk(bad), /did not succeed/, String(bad));
  }
});

test('chrome upload polls lastAsyncUploadState and gives up after a bounded wait', async () => {
  let polls = 0;
  const q = [reply(200, { access_token: 'AT' }), reply(200, { uploadState: 'IN_PROGRESS' })];
  await assert.rejects(
    chrome.run({
      action: 'upload',
      zip: chromeZip,
      env: CHROME_ENV,
      sleep: noSleep,
      maxPolls: 3,
      log: () => {},
      fetch: async () => {
        if (q.length) return q.shift();
        polls++;
        return reply(200, { lastAsyncUploadState: 'IN_PROGRESS' });
      },
    }),
    /still in progress/,
  );
  assert.equal(polls, 3);
});

test('chrome: GETs are retried with a timeout signal, the upload POST is never retried', async () => {
  const seen = [];
  const q = [reply(200, { access_token: 'AT' }), reply(503, 'busy'), reply(200, { name: 'x' })];
  await chrome.run({
    action: 'status',
    env: CHROME_ENV,
    sleep: noSleep,
    log: () => {},
    fetch: async (url, init) => {
      seen.push(init);
      return q.shift();
    },
  });
  assert.equal(seen.length, 3);
  assert.ok(seen.every((i) => i.signal instanceof AbortSignal));

  let posts = 0;
  const q2 = [reply(200, { access_token: 'AT' })];
  await assert.rejects(
    chrome.run({
      action: 'upload',
      zip: chromeZip,
      env: CHROME_ENV,
      sleep: noSleep,
      log: () => {},
      fetch: async (url) => {
        if (q2.length) return q2.shift();
        if (url.includes(':upload')) posts++;
        return reply(503, 'busy');
      },
    }),
    /upload failed: HTTP 503/,
  );
  assert.equal(posts, 1);
});

test('chrome dry run works without any secret or id (placeholders only)', async () => {
  const lines = [];
  await chrome.run({ action: 'publish', dryRun: true, env: {}, log: (l) => lines.push(l) });
  assert.match(lines.join('\n'), /<CWS_PUBLISHER_ID>.*<CWS_EXTENSION_ID>:publish/);
});

test('firefox metadata path: plain relative .json inside the workspace only; no content in errors', async () => {
  await writeFile(join(dir, 'meta.json'), JSON.stringify({ name: 'n' }));
  await writeFile(join(dir, 'broken.json'), '{"secret-looking": ');
  await writeFile(join(dir, 'list.json'), '[]');
  assert.deepEqual(await firefox.readMetadata('meta.json', dir), { name: 'n' });
  for (const bad of [
    '../meta.json',
    '/etc/passwd.json',
    'a/../meta.json',
    'meta.txt',
    'm eta.json',
    '',
  ]) {
    await assert.rejects(firefox.readMetadata(bad, dir), /--metadata must/, bad);
  }
  await assert.rejects(firefox.readMetadata('broken.json', dir), (e) => {
    assert.equal(e.message, 'metadata file is not valid JSON');
    return true;
  });
  await assert.rejects(firefox.readMetadata('list.json', dir), /JSON object/);
});

test('firefox: the zip manifest version must equal the expected release version', async () => {
  await assert.rejects(
    firefox.run({
      zip: firefoxZip,
      channel: 'unlisted',
      dryRun: true,
      expectedVersion: '9.9.9',
      log: () => {},
    }),
    /does not match the expected 9\.9\.9/,
  );
  const r = await firefox.run({
    zip: firefoxZip,
    channel: 'unlisted',
    dryRun: true,
    expectedVersion: '1.2.3',
    log: () => {},
  });
  assert.equal(r.version, '1.2.3');
});

test('firefox: lookups are retried, the upload POST is not, every call has a timeout', async () => {
  const env = { AMO_JWT_ISSUER: 'i', AMO_JWT_SECRET: 's' };
  const signals = [];
  let uploads = 0;
  await assert.rejects(
    firefox.run({
      zip: firefoxZip,
      channel: 'unlisted',
      env,
      sleep: noSleep,
      log: () => {},
      fetch: async (url, init) => {
        signals.push(init.signal);
        uploads++;
        return reply(503, 'busy');
      },
    }),
    /upload failed: HTTP 503/,
  );
  assert.equal(uploads, 1);
  assert.ok(signals.every((x) => x instanceof AbortSignal));

  const calls = [];
  const q = [
    reply(201, { uuid: 'u', processed: false }),
    reply(502, 'bad gateway'),
    reply(200, { uuid: 'u', processed: true, valid: true, submitted: false }),
    reply(200, {}),
    reply(201, { version: '1.2.3' }),
  ];
  await firefox.run({
    zip: firefoxZip,
    channel: 'unlisted',
    env,
    sleep: noSleep,
    log: () => {},
    fetch: async (url) => {
      calls.push(url);
      return q.shift();
    },
  });
  assert.equal(calls.filter((u) => u.includes('/upload/u/')).length, 2);
});
