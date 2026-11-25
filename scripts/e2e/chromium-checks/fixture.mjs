/** The local x.com fixture page: safety gate, injection (e), and the page-script boundary (d). */

import { until } from '../chromium-lib.mjs';

/** Sets ctx.x (page), ctx.contexts, ctx.readingId. Throws if x.com is not served locally. */
export async function run(ctx) {
  const { browser, check, localX, send } = ctx;

  // Safety gate: a .test host must be served by OUR fixture server before any x.com URL is opened.
  const gatePage = await browser.openPage('https://xmark-local-check.test/');
  const title = await until(() => gatePage.eval('document.title').catch(() => ''));
  const gate =
    String(title).includes('x fixture') && localX.hits.includes('xmark-local-check.test');
  check('(d) safety gate: a .test host is served by the local fixture server', gate, String(title));
  await gatePage.close();
  if (!gate) throw new Error('local fixture routing is not active; refusing to open x.com URLs');

  ctx.readingId = (
    await send({ type: 'CREATE_FOLDER', payload: { name: 'Reading' } })
  ).value?.data?.id;

  const x = await browser.openPage('about:blank');
  ctx.x = x;
  ctx.contexts = await x.trackContexts();
  await x.send('Page.enable');
  await x.send('Page.navigate', { url: 'https://x.com/home' });
  const page = await until(() =>
    x.eval(`({ url: location.href, title: document.title })`).catch(() => null),
  );
  check(
    '(d) x.com resolves to the local fixture (never the real site)',
    page?.url === 'https://x.com/home' &&
      page.title.includes('x fixture') &&
      localX.hits.includes('x.com'),
    JSON.stringify(page),
  );
  const ready = await until(
    async () => (await x.eval(`document.querySelectorAll('[data-xmark-host]').length`)) === 3,
  );
  const perArticle = await x.eval(
    `[...document.querySelectorAll('article')].map((a) => a.querySelectorAll('[data-xmark-host]').length)`,
  );
  check(
    '(e) content script injected exactly one [data-xmark-host] per article',
    !!ready && perArticle.length === 3 && perArticle.every((n) => n === 1),
    JSON.stringify(perArticle),
  );
  const main = await x.eval(
    `typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.sendMessage)`,
  );
  check(
    '(d) a page script (main world) has no chrome.runtime.sendMessage to reach the extension',
    main === false,
    String(main),
  );
}
