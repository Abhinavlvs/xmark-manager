/**
 * Reads the active tab's URL and private flag (never page content). `tabs.query` returns `url`
 * under `activeTab` and `incognito` without the `tabs` permission.
 */

/**
 * @param {{query(q: object): Promise<Array<{url?: unknown, incognito?: unknown}>>}} tabs
 * @returns {Promise<{url: string, incognito: boolean}>}
 */
export async function readActiveTab(tabs) {
  try {
    const [tab] = await tabs.query({ active: true, currentWindow: true });
    return {
      url: typeof tab?.url === 'string' ? tab.url : '',
      incognito: tab?.incognito === true,
    };
  } catch {
    return { url: '', incognito: false };
  }
}

/**
 * Private if the extension context says so OR the active tab is private. Safari reports
 * `inIncognitoContext` as false in extension pages, so the tab flag is what protects there.
 * @param {{inIncognitoContext?: boolean}} extension
 * @param {{incognito?: boolean}} tab
 */
export function isPrivate(extension, tab) {
  return extension?.inIncognitoContext === true || tab?.incognito === true;
}
