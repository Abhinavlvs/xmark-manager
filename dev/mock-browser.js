/**
 * Fake `browser` global for developing the popup in a plain browser tab.
 * Runs the real handlers and repository over an in-memory store.
 *
 * Query params: ?tab=<url> active tab URL, ?latency=<ms>, ?empty=1 empty library, ?error=1 fail all,
 * ?posts=N a big fictional library of N posts (instead of the 12 sample posts), ?snippets=1 enable post text snippets, ?quarantine=1 pretend the stored library was unreadable,
 * ?full=1 make every save fail with a full-storage error, ?perm=0|1 host access for the options page (default 0).
 * Messages run through the REAL guard. `window.__mockSender` (set before this module) overrides
 * the default popup sender, e.g. the x-fixture page pretends to be a content script on x.com.
 */

import { createRepository } from '/core/repository.js';
import { createHandlers } from '/background/handlers.js';
import { createMessageGuard } from '/background/guard.js';
import { createSettingsOpener } from '/background/open-settings.js';
import { emptyDocument } from '/core/model.js';
import { StorageFullError } from '/core/errors.js';
import { coerceSnippetLength } from '/core/snippet.js';

const params = new URLSearchParams(location.search);
const tabUrl = params.get('tab') ?? '';
const latency = Number(params.get('latency')) || 0;
const failAll = params.get('error') === '1';
const storageFull = params.get('full') === '1';
let quarantined =
  params.get('quarantine') === '1' ? '{"version":2,"posts":"from a newer version"}' : null;
const EXT_ID = 'dev@xmark-manager';
const sender = window.__mockSender ?? { id: EXT_ID, url: 'moz-extension://dev/popup.html' };
const guard = createMessageGuard({ extensionId: EXT_ID, extensionOrigin: 'moz-extension://dev/' });

let doc = emptyDocument();
const store = {
  load: async () => structuredClone(doc),
  save: async (next) => {
    if (storageFull) throw new StorageFullError('full');
    doc = structuredClone(next);
  },
  status: async () =>
    quarantined === null
      ? { state: 'ok' }
      : {
          state: 'quarantined',
          quarantinedAt: new Date().toISOString(),
          reason: 'unknown_version',
          copies: [
            {
              n: 1,
              id: 'dev-copy-0001',
              at: new Date().toISOString(),
              reason: 'unknown_version',
              bytes: quarantined.length,
            },
          ],
        },
  exportQuarantine: async () => quarantined,
  exportCurrentUnreadable: async () => null,
  discardQuarantine: async (n) => {
    if (n !== undefined && n !== 1) return;
    quarantined = null;
  },
  clear: async () => {
    doc = emptyDocument();
  },
};

let current = new Date();
let counter = 0;
const repo = createRepository({
  store,
  clock: { now: () => current.toISOString() },
  createId: () => `dev-${(counter += 1)}`,
});

async function seed() {
  const minutesAgo = (m) => new Date(Date.now() - m * 60_000);
  const reading = await repo.createFolder('Reading');
  const ideas = await repo.createFolder('Ideas');
  const design = await repo.createFolder('Design');
  const tools = await repo.createFolder('Tools');
  // All handles and texts below are invented for illustration. No real accounts or quotes.
  const day = 60 * 24;
  const rows = [
    [
      3,
      'ada_builds',
      '1234567890123456701',
      reading,
      ['ai', 'llm'],
      'Good walkthrough of tokenizer edge cases.',
      'A short thread about why tokenizers behave oddly on rare words, with a few small examples.',
    ],
    [
      40,
      'devon_writes',
      '1234567890123456702',
      tools,
      ['web', 'perf'],
      'Try this on the next audit.',
      'Notes on trimming bundle size: measure first, then remove what nobody uses.',
    ],
    [
      95,
      'mira_codes',
      '1234567890123456703',
      ideas,
      ['side-project'],
      'Could be a weekend build.',
      'Idea: a tiny CLI that turns a folder of notes into a searchable static page.',
    ],
    [
      60 * 5,
      'theo_notes',
      '1234567890123456704',
      design,
      ['ui', 'color'],
      '',
      'Contrast checks are quicker when you pick the text color before the background.',
    ],
    [
      60 * 9,
      'ada_builds',
      '1234567890123456705',
      reading,
      ['security'],
      'Revisit for the threat model section.',
      'A long post body that keeps going so the three line clamp has something to cut off when the snippet is much longer than the card is wide, with many words in a row.',
    ],
    [
      day,
      'devon_writes',
      '1234567890123456706',
      tools,
      ['cli'],
      '',
      'A small shell alias collection that saves a few keystrokes every day.',
    ],
    [
      day * 2,
      'mira_codes',
      '1234567890123456707',
      ideas,
      ['web', 'side-project'],
      'Pair with the notes CLI idea.',
      'Static sites plus a local search index are enough for most personal wikis.',
    ],
    [
      day * 4,
      'theo_notes',
      '1234567890123456708',
      design,
      ['ui'],
      'Spacing scale reference.',
      'A four point spacing scale keeps layouts consistent without much thought.',
    ],
    [
      day * 6,
      'ada_builds',
      '1234567890123456709',
      reading,
      ['ai'],
      '',
      'Reading list for people new to evaluation of language models.',
    ],
    [
      day * 14,
      'mira_codes',
      '1234567890123456710',
      tools,
      ['web', 'perf'],
      'Compare with the bundle notes.',
      'Profiling a page load: start with the network waterfall, then the main thread.',
    ],
    [
      day * 40,
      'devon_writes',
      '1234567890123456711',
      null,
      ['react'],
      '',
      'An older post about component boundaries.',
    ],
    [
      day * 400,
      'theo_notes',
      '1234567890123456712',
      null,
      [],
      '',
      'An old favourite worth keeping.',
    ],
  ];
  for (const [ago, handle, statusId, folder, tags, notes, textPreview] of rows) {
    current = minutesAgo(ago);
    const url = `https://x.com/${handle}/status/${statusId}`;
    await repo.savePost({ url, folderId: folder ? folder.id : null, tags, notes, textPreview });
  }
  current = new Date();
}
/** A large invented library (?posts=N) for the options Saved page: paging, filters, sort. */
async function seedMany(count) {
  const folderList = [];
  for (const name of ['Reading', 'Ideas', 'Design', 'Tools'])
    folderList.push(await repo.createFolder(name));
  const first = ['ada', 'devon', 'mira', 'theo', 'nora', 'kai', 'iris', 'otto', 'lena', 'omar'];
  const last = ['builds', 'writes', 'codes', 'notes', 'makes', 'draws'];
  const tagPool = [
    'ai',
    'web',
    'perf',
    'ui',
    'cli',
    'security',
    'rust',
    'design',
    'notes',
    'idea',
    'tools',
    'css',
  ];
  const verbs = [
    'Notes on',
    'A short thread about',
    'Why people misuse',
    'A checklist for',
    'Lessons from',
  ];
  const topics = [
    'bundle size',
    'color contrast',
    'tokenizers',
    'static sites',
    'spacing scales',
    'profiling',
  ];
  for (let i = 0; i < count; i += 1) {
    current = new Date(Date.now() - (i * 53 + 5) * 60_000);
    const handle = `${first[i % first.length]}_${last[(i * 7) % last.length]}`;
    const folder = i % 5 === 4 ? null : folderList[i % folderList.length];
    const tags = [tagPool[i % tagPool.length], tagPool[(i * 5 + 3) % tagPool.length]];
    await repo.savePost({
      url: `https://x.com/${handle}/status/${`12345678901234${String(10000 + i)}`}`,
      folderId: folder ? folder.id : null,
      tags: i % 3 === 0 ? tags.slice(0, 1) : tags,
      notes: i % 4 === 0 ? 'Worth a second look.' : '',
      textPreview: `${verbs[i % verbs.length]} ${topics[(i * 3) % topics.length]} (sample ${i + 1}).`,
    });
  }
  current = new Date();
}
const manyPosts = Number(params.get('posts')) || 0;
if (manyPosts > 0) await seedMany(Math.min(manyPosts, 5000));
else if (params.get('empty') !== '1') await seed();

const startLength = coerceSnippetLength(params.has('len') ? Number(params.get('len')) : undefined);
let settings = { saveSnippets: params.get('snippets') === '1', snippetLength: startLength };
let hostAccess = params.get('perm') === '1';
const openSettings = createSettingsOpener({
  tabs: { create: async ({ url }) => window.__mock.opened.push(url) },
  getURL: (path) => `/${path}`,
  now: () => Date.now(),
});
const handle = createHandlers({
  openSettings,
  repo,
  settings: {
    get: async () => ({ ...settings }),
    set: async (p) => (settings = { ...settings, ...p }),
    clear: async () => {
      settings = { saveSnippets: false, snippetLength: coerceSnippetLength(undefined) };
    },
  },
});

const pause = () => (latency ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve());

window.__mock = { opened: [], optionsOpened: 0 };

globalThis.browser = {
  extension: { inIncognitoContext: false },
  // The adapter facade reads this; the mock answers every message itself, nothing is stored here.
  storage: { local: {} },
  tabs: {
    query: async () => [{ url: tabUrl }],
    create: async ({ url }) => {
      window.__mock.opened.push(url);
    },
  },
  permissions: {
    contains: async () => hostAccess,
    request: async () => {
      hostAccess = true;
      return true;
    },
  },
  runtime: {
    id: EXT_ID,
    getManifest: () => ({ version: '0.1.0' }),
    getURL: (path) => `moz-extension://dev/${path}`,
    openOptionsPage: async () => {
      window.__mock.optionsOpened += 1;
    },
    sendMessage: async (message) => {
      await pause();
      if (failAll) return { ok: false, error: 'internal_error' };
      const verdict = guard(message, sender);
      if (!verdict.allowed) return { ok: false, error: 'rejected' };
      return handle(message, { origin: verdict.origin, senderKey: 'dev' });
    },
  },
};
