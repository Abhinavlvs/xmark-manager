/**
 * Popup composition root: gets the browser API only through the platform adapter.
 * Reads the active tab URL only (never page content) and wires everything else by injection.
 */

import { createDom } from '../ui/dom.js';
import { getBrowserApi } from '../platform/browser-api.js';
import { createPrivateAwareClient } from '../platform/private-client.js';
import { createDownload } from '../ui/download.js';
import { createApp } from './app.js';
import { safeOpenTarget } from './view-model.js';

const browserApi = getBrowserApi();

const closeWindow = () => window.close();

function openOptions() {
  Promise.resolve(browserApi.runtime.openOptionsPage())
    .catch(() => {})
    .finally(closeWindow);
}

function openUrl(url) {
  const target = safeOpenTarget(url);
  if (!target) return;
  Promise.resolve(browserApi.tabs.create({ url: target }))
    .catch(() => {})
    .finally(closeWindow);
}

async function main() {
  const dom = createDom(document);
  const { client, tab } = await createPrivateAwareClient(browserApi);
  const app = createApp(dom, {
    client,
    tabUrl: tab.url,
    now: () => new Date(),
    openOptions,
    openUrl,
    closeWindow,
    createDownload: createDownload({ dom, urlApi: URL }),
  });
  document.getElementById('root').appendChild(app.element);
  app.focus();
}

main();
