/**
 * Cross-browser WebExtension adapter. The ONLY module (besides the classic-script copy in
 * `src/content/messages.js`) that may read the `browser` / `chrome` globals.
 *
 * - Promise-based `browser` (Firefox, Safari, Chrome 148+): its methods are used as they are.
 * - Callback-style `chrome` only (older Chrome): methods are wrapped to return promises and
 *   `runtime.lastError` rejects.
 * - `runtime.onMessage` listeners are wrapped identically on EVERY browser: the listener may return
 *   a Promise, which is delivered through `sendResponse` while the wrapper returns `true`. This avoids
 *   depending on per-version support for promise-returning listeners (Chrome only from 148).
 *   Rejection semantics: a rejected promise answers `undefined` (the app's handlers already turn
 *   every error into `{ok:false,...}`); a synchronous throw answers nothing and returns `false` so
 *   other listeners can still respond; `sendResponse` is called at most once per message.
 * Pure and injectable: takes the global object, keeps no module state.
 */

const call = (fn, owner, runtime, args) =>
  new Promise((resolve, reject) => {
    fn.call(owner, ...args, (result) => {
      const err = runtime.lastError;
      if (err) reject(new Error(err.message ?? String(err)));
      else resolve(result);
    });
  });

const isThenable = (v) => v !== null && typeof v === 'object' && typeof v.then === 'function';

function wrapListener(listener) {
  return (message, sender, sendResponse) => {
    let result;
    try {
      result = listener(message, sender);
    } catch {
      return false;
    }
    if (!isThenable(result)) return false;
    let answered = false;
    const answer = (value) => {
      if (answered) return;
      answered = true;
      sendResponse(value);
    };
    result.then(answer, () => answer(undefined));
    return true;
  };
}

const promisified = (owner, runtime, names) =>
  Object.fromEntries(
    names.map((name) => [name, (...args) => call(owner[name], owner, runtime, args)]),
  );

const passthrough = (owner, names) =>
  Object.fromEntries(names.map((name) => [name, (...args) => owner[name](...args)]));

/** One facade shape for both flavours; `promisify(owner, names)` supplies the promise-returning methods. */
function facade(raw, promisify) {
  const rt = raw.runtime;
  const wrapped = new Map();
  return {
    runtime: {
      get id() {
        return rt.id;
      },
      getManifest: () => rt.getManifest(),
      getURL: (path) => rt.getURL(path),
      ...promisify(rt, ['sendMessage', 'openOptionsPage']),
      onMessage: {
        addListener(listener) {
          const wrapper = wrapListener(listener);
          wrapped.set(listener, wrapper);
          rt.onMessage.addListener(wrapper);
        },
        removeListener(listener) {
          const wrapper = wrapped.get(listener);
          if (!wrapper) return;
          wrapped.delete(listener);
          rt.onMessage.removeListener(wrapper);
        },
      },
    },
    storage: { local: promisify(raw.storage.local, ['get', 'set', 'remove']) },
    tabs: promisify(raw.tabs, ['query', 'create']),
    permissions: promisify(raw.permissions, ['contains', 'request']),
    extension: {
      get inIncognitoContext() {
        return raw.extension.inIncognitoContext;
      },
    },
  };
}

/**
 * @param {object} [globalObj] defaults to `globalThis`
 * @returns the promise-based API surface this project uses (runtime, storage.local, tabs, permissions, extension)
 */
export function getBrowserApi(globalObj = globalThis) {
  if (globalObj.browser) return facade(globalObj.browser, passthrough);
  if (globalObj.chrome) {
    const chrome = globalObj.chrome;
    return facade(chrome, (owner, names) => promisified(owner, chrome.runtime, names));
  }
  throw new Error('no WebExtension API available (neither `browser` nor `chrome`)');
}
