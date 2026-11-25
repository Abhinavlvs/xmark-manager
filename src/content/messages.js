/**
 * Content script messaging. The only content file that names the `browser` / `chrome` globals.
 * Classic scripts cannot import modules, so this file repeats (a) the four message types a
 * content script may send (kept equal to src/platform/messages.js by a test) and (b) a small
 * inline copy of the normalisation in src/platform/browser-api.js, limited to what content
 * scripts use: runtime.id and runtime.sendMessage (a parity test keeps both copies identical).
 */
(function () {
  const ns = (globalThis.__xmark = globalThis.__xmark || {});
  ns.MSG = Object.freeze({
    SAVE_POST: 'SAVE_POST',
    LIST_FOLDERS: 'LIST_FOLDERS',
    GET_SETTINGS: 'GET_SETTINGS',
    OPEN_FOLDER_SETTINGS: 'OPEN_FOLDER_SETTINGS',
  });

  /** Promise-based `{runtime: {id, sendMessage}}` from `browser` (Firefox, Safari, Chrome 148+) or callback-style `chrome`. */
  ns.getBrowserApi = function getBrowserApi(globalObj = globalThis) {
    if (globalObj.browser) return globalObj.browser;
    const chrome = globalObj.chrome;
    if (!chrome) throw new Error('no WebExtension API available (neither `browser` nor `chrome`)');
    const rt = chrome.runtime;
    return {
      runtime: {
        get id() {
          return rt.id;
        },
        sendMessage: (message) =>
          new Promise((resolve, reject) => {
            rt.sendMessage(message, (result) => {
              const err = rt.lastError;
              if (err) reject(new Error(err.message ?? String(err)));
              else resolve(result);
            });
          }),
      },
    };
  };

  /** Send a message to the background; never throws, always resolves to a Response-shaped object. */
  ns.send = async function send(type, payload) {
    try {
      const res = await ns.getBrowserApi().runtime.sendMessage({ type, payload });
      return res && typeof res === 'object' ? res : { ok: false, error: 'internal_error' };
    } catch {
      return { ok: false, error: 'internal_error' };
    }
  };
})();
