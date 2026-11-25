/** (d) the message guard with real Chrome sender objects. */

import { until } from '../chromium-lib.mjs';

const rejected = (r) => r.value?.ok === false && r.value?.error === 'rejected';

export async function run(ctx) {
  const { browser, check, id, listPosts, x, contexts } = ctx;

  // Extension pages opened as tabs: popup.html (see basics) and options.html.
  const options = await browser.openPage(`chrome-extension://${id}/options/options.html`);
  const optList = await browser.sendMessage(options, { type: 'LIST_POSTS', payload: {} });
  check('(d) options page may LIST_POSTS', optList.value?.ok === true, JSON.stringify(optList));
  const optSettings = await browser.sendMessage(options, { type: 'GET_SETTINGS' });
  check('(d) options page may GET_SETTINGS', optSettings.value?.ok === true);

  // The real toolbar popup (no tab): chrome.action.openPopup() opens popup.html as a popup target.
  const known = new Set((await browser.targets()).map((t) => t.id));
  const opened = await options.eval(
    `new Promise((resolve) => chrome.action.openPopup(() => resolve(chrome.runtime.lastError?.message ?? 'ok')))`,
  );
  const popupTarget = await until(async () =>
    (await browser.targets()).find(
      (t) => !known.has(t.id) && t.url === `chrome-extension://${id}/popup/popup.html`,
    ),
  );
  check(
    '(d) chrome.action.openPopup() opened the real popup',
    opened === 'ok' && !!popupTarget,
    opened,
  );
  if (popupTarget) {
    const real = await browser.attach(popupTarget.id);
    const tab = await until(() =>
      real
        .eval(
          `new Promise((resolve) => chrome.tabs.getCurrent((t) => resolve(t === undefined ? 'no-tab' : 'tab')))`,
        )
        .catch(() => false),
    );
    check('(d) the real popup has no tab (sender.tab is absent)', tab === 'no-tab', String(tab));
    const list = await browser.sendMessage(real, { type: 'LIST_POSTS', payload: {} });
    check('(d) popup without a tab may LIST_POSTS', list.value?.ok === true);
    const save = await browser.sendMessage(real, {
      type: 'SAVE_POST',
      payload: { url: 'https://x.com/popup/status/77' },
    });
    check('(d) popup without a tab may SAVE_POST', save.value?.ok === true, JSON.stringify(save));
    await real.detach();
  }
  await options.close();

  // A real content-script sender: the isolated world of the extension in the x.com fixture page.
  const cs = contexts.find(
    (c) =>
      c.auxData?.type === 'isolated' && String(c.origin).startsWith(`chrome-extension://${id}`),
  );
  check(
    '(d) found the content script isolated world for our extension',
    !!cs,
    cs ? `contextId=${cs.id}` : `contexts=${contexts.length}`,
  );
  if (!cs) return;
  const fromCs = (message) => browser.sendMessage(x, message, cs.id);
  for (const type of ['LIST_FOLDERS', 'GET_SETTINGS']) {
    const r = await fromCs({ type });
    check(`(d) content script may ${type}`, r.value?.ok === true, JSON.stringify(r));
  }
  const saveOk = await fromCs({
    type: 'SAVE_POST',
    payload: { url: 'https://x.com/csuser/status/42' },
  });
  check('(d) content script may SAVE_POST', saveOk.value?.ok === true, JSON.stringify(saveOk));
  const before = (await listPosts()).length;
  for (const type of ['LIST_POSTS', 'EXPORT_DATA', 'EXPORT_QUARANTINE']) {
    const r = await fromCs({ type, payload: {} });
    check(
      `(d) content script is rejected for ${type}`,
      rejected(r),
      JSON.stringify(r).slice(0, 120),
    );
  }
  const del = await fromCs({ type: 'DELETE_ALL_DATA', payload: {} });
  check(
    '(d) content script is rejected for DELETE_ALL_DATA, and nothing was deleted',
    rejected(del) && (await listPosts()).length === before,
    JSON.stringify(del),
  );
}
