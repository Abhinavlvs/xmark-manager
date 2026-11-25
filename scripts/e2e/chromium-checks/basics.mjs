/** (a) the extension loads, (b) the popup renders, (c) round trips through the real worker. */

import { idFromWorker, until } from '../chromium-lib.mjs';
import { readExtensionInfo } from '../chromium-info.mjs';

const GOOD_URL = 'https://x.com/ada/status/1234567890';

/** Sets ctx.id, ctx.popup, ctx.send, ctx.listPosts. Returns false when the worker never started. */
export async function run(ctx) {
  const { browser, check, swFile } = ctx;
  const worker = await browser.findWorker(swFile);
  check('(a) our service worker is running (matched by script URL)', !!worker, worker?.url);
  if (!worker) return false;
  const id = idFromWorker(worker);
  ctx.id = id;
  const info = await readExtensionInfo(browser, id);
  check('(a) chrome://extensions lists the extension as ENABLED', info?.state === 'ENABLED');
  check(
    '(a) no manifest errors and no install warnings',
    (info?.manifestErrors ?? ['?']).length === 0 && (info?.installWarnings ?? ['?']).length === 0,
    JSON.stringify({ manifestErrors: info?.manifestErrors, warnings: info?.installWarnings }),
  );
  const noise = browser
    .stderr()
    .split('\n')
    .filter((l) => /xtension|manifest/i.test(l) && /error|warn/i.test(l));
  check('(a) no extension or manifest line on Chrome stderr', noise.length === 0, noise[0] ?? '');

  const popup = await browser.openPage(`chrome-extension://${id}/popup/popup.html`);
  await until(() =>
    popup.eval(`document.querySelectorAll('[role="tab"]').length > 0`).catch(() => false),
  );
  const send = (message) => browser.sendMessage(ctx.popup, message);
  ctx.popup = popup;
  ctx.send = send;
  ctx.listPosts = async () => (await send({ type: 'LIST_POSTS', payload: {} })).value?.data;

  const dom = await popup.eval(`({
    title: document.title,
    text: document.body.innerText,
    tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim()),
    url: location.href,
  })`);
  check('(b) popup loads at the extension origin', dom.url.startsWith(`chrome-extension://${id}/`));
  check('(b) popup title is "xmark-manager"', dom.title === 'xmark-manager', dom.title);
  check(
    '(b) popup has Save and Saved tabs',
    dom.tabs.includes('Save') && dom.tabs.includes('Saved'),
    JSON.stringify(dom.tabs),
  );
  check('(b) popup header text contains "xmark-manager"', /xmark-manager/i.test(dom.text));

  const saved = await send({ type: 'SAVE_POST', payload: { url: GOOD_URL } });
  check('(c) SAVE_POST canonical URL ok', saved.value?.ok === true, JSON.stringify(saved));
  const posts = await ctx.listPosts();
  check(
    '(c) LIST_POSTS returns the saved post',
    Array.isArray(posts) && posts.some((p) => p.url === GOOD_URL),
    `count=${posts?.length}`,
  );
  const expectError = (name, r, error) =>
    check(name, r.value?.ok === false && r.value?.error === error, JSON.stringify(r));
  expectError(
    '(c) invalid URL rejected with InvalidPostUrlError',
    await send({ type: 'SAVE_POST', payload: { url: 'https://evil.example/ada/status/1' } }),
    'InvalidPostUrlError',
  );
  expectError(
    '(c) non-object payload rejected with bad_payload',
    await send({ type: 'SAVE_POST', payload: 'nope' }),
    'bad_payload',
  );
  expectError('(c) unknown message type rejected', await send({ type: 'DROP_TABLES' }), 'rejected');
  for (const m of ['SAVE_POST', 42, null, ['SAVE_POST']]) {
    expectError(`(c) non-object message ${JSON.stringify(m)} rejected`, await send(m), 'rejected');
  }
  return true;
}
