/**
 * Sender and message gatekeeper for runtime messages.
 */

import { MSG } from '../platform/messages.js';

const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']);
const CONTENT_SCRIPT_TYPES = new Set([
  MSG.SAVE_POST,
  MSG.LIST_FOLDERS,
  MSG.GET_SETTINGS,
  MSG.OPEN_FOLDER_SETTINGS,
]);
// Messages that must never act for a private window (saving, and opening a tab from it).
const NOT_FROM_PRIVATE = new Set([MSG.SAVE_POST, MSG.OPEN_FOLDER_SETTINGS]);
const KNOWN_TYPES = new Set(Object.values(MSG));

const deny = (reason) => ({ allowed: false, reason });

function isXPage(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && X_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Extension pages are recognised by this extension's own origin (`runtime.getURL('')`:
 * moz-extension://, chrome-extension:// or safari-web-extension:// plus the instance id), so pages of
 * other extensions never qualify.
 * @param {{extensionId: string, extensionOrigin: string}} opts
 * @returns {(message: unknown, sender: {id?: string, url?: string, tab?: {incognito?: boolean}}|undefined) => {allowed: boolean, reason?: string, origin?: 'content'|'extension'}}
 */
export function createMessageGuard({ extensionId, extensionOrigin }) {
  if (
    typeof extensionOrigin !== 'string' ||
    !/^[a-z-]+-extension:\/\/[^/]+\/$/.test(extensionOrigin)
  ) {
    throw new Error('createMessageGuard needs the extension origin (runtime.getURL(""))');
  }
  return (message, sender) => {
    if (!sender || sender.id !== extensionId) return deny('foreign_sender');
    if (typeof message !== 'object' || message === null || Array.isArray(message)) {
      return deny('bad_message');
    }
    if (!KNOWN_TYPES.has(message.type)) return deny('unknown_type');
    if (
      NOT_FROM_PRIVATE.has(message.type) &&
      (sender.tab?.incognito === true || message.incognito === true)
    ) {
      return deny('incognito');
    }
    // Extension pages (popup, options) are identified by URL, not by having a tab.
    const isExtensionPage =
      typeof sender.url === 'string' && sender.url.startsWith(extensionOrigin);
    if (!isExtensionPage) {
      if (!isXPage(sender.url)) return deny('bad_origin');
      if (!CONTENT_SCRIPT_TYPES.has(message.type)) return deny('type_not_allowed');
    }
    return { allowed: true, origin: isExtensionPage ? 'extension' : 'content' };
  };
}
