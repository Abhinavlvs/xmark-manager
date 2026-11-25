/**
 * The runtime client both composition roots (popup, options) use. The `incognito` flag it sends is
 * derived in exactly one place: private if the extension context OR the active tab is private
 * (Safari reports `inIncognitoContext` as false in extension pages, so the tab flag matters there).
 */

import { readActiveTab, isPrivate } from './active-tab.js';
import { createRuntimeClient } from './runtime-client.js';

/**
 * @param {{runtime: object, tabs: object, extension: object}} browserApi adapter from getBrowserApi()
 * @returns {Promise<{client: ReturnType<typeof createRuntimeClient>, tab: {url: string, incognito: boolean}}>}
 */
export async function createPrivateAwareClient(browserApi) {
  const tab = await readActiveTab(browserApi.tabs);
  const client = createRuntimeClient({
    runtime: browserApi.runtime,
    isIncognito: isPrivate(browserApi.extension, tab),
  });
  return { client, tab };
}
