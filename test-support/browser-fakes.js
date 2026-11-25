/**
 * Fakes of the two WebExtension API flavours. Not under tests/.
 * - promiseBrowser(): Firefox/Safari-style `browser` (every call returns a promise).
 * - callbackChrome(): Chrome-style `chrome` (callbacks + runtime.lastError, listeners need sendResponse).
 */

const MANIFEST = { manifest_version: 3, version: '9.9.9' };

function listenerRegistry() {
  const listeners = [];
  return {
    addListener: (fn) => listeners.push(fn),
    removeListener: (fn) => listeners.splice(listeners.indexOf(fn), 1),
    listeners,
  };
}

export function promiseBrowser() {
  const store = {};
  return {
    runtime: {
      id: 'ext@id',
      getManifest: () => MANIFEST,
      getURL: (p) => `moz-extension://abc/${p}`,
      openOptionsPage: async () => undefined,
      sendMessage: async (m) => ({ echoed: m }),
      onMessage: listenerRegistry(),
    },
    storage: {
      local: {
        get: async (k) => (typeof k === 'string' ? { [k]: store[k] } : { ...store }),
        set: async (o) => void Object.assign(store, o),
        remove: async (k) => [].concat(k).forEach((x) => delete store[x]),
      },
    },
    tabs: {
      query: async () => [{ url: 'https://x.com/' }],
      create: async (o) => ({ id: 1, ...o }),
    },
    permissions: { contains: async () => true, request: async () => true },
    extension: { inIncognitoContext: false },
  };
}

/** Set `state.failNext` to a message to make the next callback-style call set runtime.lastError. */
export function callbackChrome() {
  const store = {};
  const state = { failNext: null };
  const runtime = { id: 'ext@id', lastError: undefined };
  const cb = (callback, value) => {
    if (typeof callback !== 'function') throw new Error('callback-style fake needs a callback');
    if (state.failNext) {
      runtime.lastError = { message: state.failNext };
      state.failNext = null;
      callback(undefined);
      runtime.lastError = undefined;
      return;
    }
    callback(value);
  };
  Object.assign(runtime, {
    getManifest: () => MANIFEST,
    getURL: (p) => `chrome-extension://abc/${p}`,
    openOptionsPage: (callback) => cb(callback, undefined),
    sendMessage: (m, callback) => cb(callback, { echoed: m }),
    onMessage: listenerRegistry(),
  });
  return {
    state,
    runtime,
    storage: {
      local: {
        get: (k, c) => cb(c, typeof k === 'string' ? { [k]: store[k] } : { ...store }),
        set: (o, c) => cb(c, void Object.assign(store, o)),
        remove: (k, c) =>
          cb(
            c,
            [].concat(k).forEach((x) => delete store[x]),
          ),
      },
    },
    tabs: {
      query: (q, c) => cb(c, [{ url: 'https://x.com/' }]),
      create: (o, c) => cb(c, { id: 1, ...o }),
    },
    permissions: { contains: (p, c) => cb(c, true), request: (p, c) => cb(c, true) },
    extension: { inIncognitoContext: true },
  };
}

/** Deliver a message to the first registered raw listener, as a browser would; resolves with the reply. */
export function deliver(rawApi, message, sender = { id: 'ext@id' }) {
  const [listener] = rawApi.runtime.onMessage.listeners;
  return new Promise((resolve) => {
    const out = listener(message, sender, resolve);
    if (out && typeof out.then === 'function') out.then(resolve);
    else if (out !== true) resolve(undefined);
  });
}
