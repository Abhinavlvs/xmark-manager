/**
 * (e) The on-page panel. The closed shadow root is reached only through the debugger (CDP DOM pierce),
 * which a page script cannot do. Saves are asserted through LIST_POSTS, never through the shadow DOM.
 */

import { clickAt, holds, pressKey, typeText, until } from '../cdp.mjs';

const FIXTURE_POST = 'https://x.com/ada/status/1000000000000000001';
const HAS_BUTTON = `function () { return !!this.querySelector('button.xm-btn'); }`;
const PANEL_HOST = 'data-xmark-panel-host';
// The panel lives in its own top-level host (reachable from the page as an element, not its root).
const PANEL_HOST_OPEN = `!!document.querySelector('[${PANEL_HOST}]')`;
const PANEL_HOST_FACTS = `(() => { const h = document.querySelector('[${PANEL_HOST}]');
  const cs = getComputedStyle(h);
  return { direct: h.parentNode === document.documentElement, inArticle: !!h.closest('article'),
    position: cs.position, z: cs.zIndex, closed: h.shadowRoot === null,
    count: document.querySelectorAll('[${PANEL_HOST}]').length }; })()`;
const SYNTHETIC_CLICK = `function () { this.querySelector('button.xm-btn').click(); return true; }`;

export async function run(ctx) {
  const { check, x, listPosts, readingId } = ctx;
  const rect = await x.eval(
    `(() => { const r = document.querySelector('[data-xmark-host]').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })()`,
  );
  check(
    '(e) first Save host has a visible, non-zero rect',
    rect.w > 0 && rect.h > 0,
    JSON.stringify(rect),
  );

  // Negative: a synthetic click (isTrusted false) on the REAL button inside the closed shadow root.
  const button = await x.inShadow(0, HAS_BUTTON);
  check('(e) the real Save button was found inside the closed shadow root', button === true);
  await x.inShadow(0, SYNTHETIC_CLICK);
  const stayedClosed = await holds(async () => !(await x.eval(PANEL_HOST_OPEN)), { forMs: 2000 });
  check(
    '(e) a synthetic (isTrusted false) click on the real button opens no panel',
    button === true && stayedClosed,
  );
  check('(e) and saves nothing', !(await listPosts()).some((p) => p.url === FIXTURE_POST));

  // Positive control: a trusted click opens the panel.
  await clickAt(x, rect.x, rect.y);
  const opened = await until(() => x.eval(PANEL_HOST_OPEN), { timeoutMs: 8000 });
  check('(e) a trusted click opens the panel (positive control)', opened === true);
  if (!opened) return;
  const facts = await x.eval(PANEL_HOST_FACTS);
  check(
    '(e) the panel host is a direct child of the document root, fixed, z-index max, root closed',
    facts.direct &&
      !facts.inArticle &&
      facts.position === 'fixed' &&
      facts.z === '2147483647' &&
      facts.closed &&
      facts.count === 1,
    JSON.stringify(facts),
  );
  // The panel focuses Folder once rendered: the focused <select> takes type-ahead.
  const focused = await until(() =>
    x.inShadow(0, `function () { return this.activeElement?.tagName === 'SELECT'; }`, PANEL_HOST),
  );
  check('(e) focus moved into the panel host (Folder select)', focused === true);
  await typeText(x, 'R');
  await pressKey(x, 'Tab');
  await typeText(x, 'fixture, e2e');
  await pressKey(x, 'Tab');
  await typeText(x, 'typed by keys');
  await pressKey(x, 'Tab');
  await pressKey(x, 'Enter');
  const post = await until(async () => (await listPosts()).find((p) => p.url === FIXTURE_POST), {
    timeoutMs: 10000,
  });
  check('(e) the post saved from the page (trusted click + keys) is listed via LIST_POSTS', !!post);
  check(
    '(e) saved post carries the chosen folder, tags and notes',
    post?.folder_id === readingId &&
      JSON.stringify(post?.tags) === JSON.stringify(['fixture', 'e2e']) &&
      post?.notes === 'typed by keys',
    JSON.stringify(post),
  );
  check(
    '(e) author comes from the URL and no text snippet was stored (snippets are off)',
    post?.author === 'ada' && !post?.text_preview,
    JSON.stringify({ a: post?.author, t: post?.text_preview }),
  );

  await addFolderByKeys(ctx);
}

const SECOND_POST = 'https://x.com/devon_writes/status/1000000000000000002';

/** Second post: "Add folder…" by keys opens the options page on #folders-add and creates nothing. */
async function addFolderByKeys(ctx) {
  const { check, x, send, listPosts, browser } = ctx;
  await until(async () => !(await x.eval(PANEL_HOST_OPEN)), { timeoutMs: 8000 });
  const optionsTabs = async () =>
    (await browser.targets()).filter(
      (t) => t.type === 'page' && /^chrome-extension:\/\/[^/]+\/options\/options\.html/.test(t.url),
    );
  const before = (await optionsTabs()).length;
  const foldersBefore = (await send({ type: 'LIST_FOLDERS', payload: {} })).value?.data ?? [];
  const rect = await x.eval(
    `(() => { const r = document.querySelectorAll('[data-xmark-host]')[1].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
  await clickAt(x, rect.x, rect.y);
  await until(() => x.eval(PANEL_HOST_OPEN), { timeoutMs: 8000 });
  const focused = await until(() =>
    x.inShadow(0, `function () { return this.activeElement?.tagName === 'SELECT'; }`, PANEL_HOST),
  );
  check('(e) second panel opens with the Folder select focused', focused === true);
  // Type-ahead "A" picks "Add folder…" (the only option starting with A).
  await typeText(x, 'A');
  const tab = await until(
    async () => (await optionsTabs()).find((t) => /#folders-add$/.test(t.url)),
    {
      timeoutMs: 10000,
    },
  );
  check(
    '(e) choosing "Add folder…" by keyboard opens the options page on #folders-add in a new tab',
    !!tab && (await optionsTabs()).length === before + 1,
    JSON.stringify(tab?.url),
  );
  const closed = await until(async () => !(await x.eval(PANEL_HOST_OPEN)), { timeoutMs: 8000 });
  check('(e) the panel closed itself after opening settings', closed === true);
  const foldersAfter = (await send({ type: 'LIST_FOLDERS', payload: {} })).value?.data ?? [];
  check(
    '(e) no folder and no post was created by that choice',
    foldersAfter.length === foldersBefore.length &&
      !(await listPosts()).some((p) => p.url === SECOND_POST),
    JSON.stringify({ foldersAfter }),
  );
}
