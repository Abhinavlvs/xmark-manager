/**
 * Options composition root: gets the browser API only through the platform adapter.
 */

import { createDom } from '../ui/dom.js';
import { getBrowserApi } from '../platform/browser-api.js';
import { createPrivateAwareClient } from '../platform/private-client.js';
import { createOptionsApp } from './app.js';
import { createDownload } from '../ui/download.js';
import { LINKS } from './links.js';
import { safeOpenTarget } from '../ui/saved/view-model.js';

const browserApi = getBrowserApi();
const dom = createDom(document);

const permissions = {
  contains: (origins) => browserApi.permissions.contains({ origins }),
  // Must be called synchronously from a click handler (user gesture).
  request: (origins) => browserApi.permissions.request({ origins }),
};

function openUrl(url) {
  const target = safeOpenTarget(url);
  if (target) Promise.resolve(browserApi.tabs.create({ url: target })).catch(() => {});
}

const { client } = await createPrivateAwareClient(browserApi);
const app = createOptionsApp(dom, {
  client,
  win: window,
  permissions,
  version: browserApi.runtime.getManifest().version,
  links: LINKS,
  now: () => new Date(),
  createDownload: createDownload({ dom, urlApi: URL }),
  openUrl,
});
document.getElementById('root').appendChild(app.element);
app.start();
