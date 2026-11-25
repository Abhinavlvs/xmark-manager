/**
 * Minimal Chrome DevTools Protocol client over Node's built-in WebSocket, plus page helpers and
 * trusted-input helpers. Zero dependencies. Used by chromium-lib.mjs and chromium-checks/*.
 */

import { request } from 'node:http';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function getJSON(port, path) {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    })
      .on('error', reject)
      .end();
  });
}

/** Poll `fn` until it returns a truthy value; returns it, or the last falsy value on timeout. */
export async function until(fn, { timeoutMs = 10000, everyMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await sleep(everyMs);
  }
  return last;
}

/**
 * Poll `fn` for `forMs` and return true only if it was truthy on EVERY poll (a bounded negative
 * check: "this stays true for a while"). Returns false as soon as it is falsy.
 */
export async function holds(fn, { forMs = 1500, everyMs = 100 } = {}) {
  const deadline = Date.now() + forMs;
  do {
    if (!(await fn())) return false;
    await sleep(everyMs);
  } while (Date.now() < deadline);
  return true;
}

/**
 * Connect to a browser websocket. Every call times out (default 15 s); if the socket closes, every
 * pending and later call rejects.
 * @param {string} url
 * @param {{timeoutMs?: number}} [opts]
 */
export async function connectCdp(url, { timeoutMs = 15000 } = {}) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('DevTools websocket failed'));
  });
  const pending = new Map();
  const listeners = new Set();
  let nextId = 0;
  let closed = false;
  const rejectAll = (why) => {
    closed = true;
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error(why));
    }
    pending.clear();
  };
  ws.onclose = () => rejectAll('DevTools websocket closed');
  ws.onerror = () => rejectAll('DevTools websocket error');
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const { resolve, reject, timer } = pending.get(d.id);
      clearTimeout(timer);
      pending.delete(d.id);
      if (d.error) reject(new Error(`${d.error.message} ${d.error.data ?? ''}`.trim()));
      else resolve(d.result);
    } else {
      for (const fn of listeners) fn(d);
    }
  };
  const send = (method, params = {}, sessionId, callTimeoutMs = timeoutMs) =>
    new Promise((resolve, reject) => {
      if (closed) return reject(new Error('DevTools websocket closed'));
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${callTimeoutMs} ms`));
      }, callTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  return {
    send,
    onEvent(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close: () => ws.close(),
    isClosed: () => closed,
  };
}

/** A session attached to one target, with evaluate helpers. */
export function pageFor(cdp, targetId, sessionId) {
  const send = (method, params) => cdp.send(method, params, sessionId);
  return {
    targetId,
    sessionId,
    send,
    /** Evaluate in the main world (or `contextId`); awaits promises; returns the value. */
    async eval(expression, contextId) {
      const r = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        ...(contextId ? { contextId } : {}),
      });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      }
      return r.result.value;
    },
    /** Collect execution contexts created in this page (call before navigating). */
    async trackContexts() {
      const contexts = [];
      cdp.onEvent((e) => {
        if (e.sessionId === sessionId && e.method === 'Runtime.executionContextCreated') {
          contexts.push(e.params.context);
        }
      });
      await send('Runtime.enable');
      return contexts;
    },
    /**
     * Run `fn` (a function source string, `this` = the closed shadow root of the n-th element
     * carrying `attr`, default the in-article `data-xmark-host`; the panel host is
     * `data-xmark-panel-host`) through CDP DOM pierce. Page scripts cannot do this: it is the debugger.
     */
    async inShadow(index, fn, attr = 'data-xmark-host') {
      const { root } = await send('DOM.getDocument', { depth: -1, pierce: true });
      const hosts = [];
      const walk = (n) => {
        if ((n.attributes ?? []).includes(attr)) hosts.push(n);
        for (const c of [
          ...(n.children ?? []),
          ...(n.shadowRoots ?? []),
          n.contentDocument ?? [],
        ]) {
          if (c && c.nodeType) walk(c);
        }
      };
      walk(root);
      const shadow = hosts[index]?.shadowRoots?.[0];
      if (!shadow) throw new Error(`no shadow root on host ${index} (hosts=${hosts.length})`);
      const { object } = await send('DOM.resolveNode', { backendNodeId: shadow.backendNodeId });
      const r = await send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: fn,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    },
    detach: () => send('Target.detachFromTarget', { sessionId }).catch(() => {}),
    close: () => cdp.send('Target.closeTarget', { targetId }).catch(() => {}),
  };
}

/**
 * Send a runtime message from `page` (or the content-script world `contextId`); resolves to
 * `{value}` or `{thrown}`. Callback form, so it works on every Chrome version. In the main world
 * it first waits until the page is an extension page (chrome.runtime appears on commit).
 */
export async function sendMessage(page, message, contextId) {
  if (!contextId) {
    await until(
      () => page.eval(`!!(globalThis.chrome && chrome.runtime?.sendMessage)`).catch(() => false),
      {
        timeoutMs: 5000,
        everyMs: 50,
      },
    );
  }
  return page.eval(
    `new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(${JSON.stringify(message ?? null)}, (v) => {
          const err = chrome.runtime.lastError;
          resolve(err ? { thrown: err.message } : { value: v === undefined ? null : v });
        });
      } catch (e) { resolve({ thrown: String(e) }); }
    })`,
    contextId,
  );
}

/** Type text into the focused element with trusted key events (CDP Input domain). */
export async function typeText(page, text) {
  for (const ch of text) {
    await page.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: ch,
      key: ch,
      unmodifiedText: ch,
    });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
  }
}

const KEYS = {
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
};

export async function pressKey(page, name) {
  const k = KEYS[name];
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...k });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k, text: undefined });
}

/** A trusted left click at viewport coordinates. */
export async function clickAt(page, x, y) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  const base = { x, y, button: 'left', clickCount: 1 };
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base, buttons: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 });
}
