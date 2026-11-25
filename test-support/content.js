/**
 * Test harness for classic content scripts: installs a linkedom window on globalThis,
 * then imports each script for its side effects so it registers on `globalThis.__xmark`.
 */

import { parseHTML } from 'linkedom';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../src/content/', import.meta.url);
let importCounter = 0;

export const ARTICLE = (
  id = '111',
  { user = 'alice', text = 'hello world', bar = true, like = 'like' } = {},
) => `
<article data-testid="tweet">
  <div data-testid="User-Name"><span>Alice Display</span><span>@${user}</span></div>
  <a href="/${user}/status/${id}"><time datetime="2026-01-01T00:00:00Z">Jan 1</time></a>
  <div data-testid="tweetText"><span>${text}</span></div>
  ${
    bar
      ? `<div role="group" aria-label="actions">
           <button data-testid="reply"></button>
           <button data-testid="retweet"></button>
           <button data-testid="${like}"></button>
         </div>`
      : ''
  }
</article>`;

/**
 * @param {string[]} files file names inside src/content, in manifest order
 * @param {string} [body]
 */
export async function loadContent(files, body = '') {
  const window = parseHTML(`<!doctype html><html><body>${body}</body></html>`);
  window.location = new URL('https://x.com/home');
  const names = ['window', 'document', 'MutationObserver', 'Node', 'Element'];
  for (const name of names) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true,
      writable: true,
    });
  }
  Object.defineProperty(globalThis, 'location', {
    value: window.location,
    configurable: true,
    writable: true,
  });
  delete globalThis.__xmark;
  for (const file of files) {
    importCounter += 1;
    await import(`${fileURLToPath(new URL(file, ROOT))}?run=${importCounter}`);
  }
  return { window, document: window.document, xmark: globalThis.__xmark };
}

export function resetContent() {
  delete globalThis.__xmark;
  for (const name of ['window', 'document', 'MutationObserver', 'Node', 'Element', 'location']) {
    delete globalThis[name];
  }
  delete globalThis.browser;
}

export const ALL_FILES = [
  'messages.js',
  'selectors.js',
  'post-extractor.js',
  'dom-util.js',
  'styles.js',
  'save-button.js',
  'panel-folder.js',
  'panel-form.js',
  'placement.js',
  'panel-host.js',
  'panel.js',
  'injector.js',
  'main.js',
];

/** Fake browser.runtime; `routes` maps type to value or function(payload). Records `calls`. */
export function installRuntime(routes = {}) {
  const calls = [];
  globalThis.browser = {
    runtime: {
      id: 'ext@id',
      sendMessage: async ({ type, payload }) => {
        calls.push({ type, payload });
        const route = routes[type];
        return typeof route === 'function' ? route(payload) : route;
      },
    },
  };
  return calls;
}

export const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/** Synchronous-flush scheduler for the injector. */
export function manualScheduler() {
  const queue = [];
  return { schedule: (fn) => queue.push(fn), flush: () => queue.splice(0).forEach((fn) => fn()) };
}

export function fire(window, node, type, props = {}) {
  const event = new window.Event(type, { bubbles: true, cancelable: true, composed: true });
  // Real user input is trusted; pass `{ isTrusted: false }` to simulate a page script.
  Object.assign(event, { isTrusted: true }, props);
  node.dispatchEvent(event);
  return event;
}

/** Quote card as X renders it: a div[role=link] holding another post's time, link and text. */
export const QUOTE = (id = '900', { user = 'quoted', text = 'quoted text' } = {}) =>
  `<div role="link" tabindex="0" data-quote><div data-testid="User-Name">Q</div>
     <a href="/${user}/status/${id}"><time>9h</time></a>
     <div data-testid="tweetText"><span>${text}</span></div></div>`;

export const BAR = `<div role="group"><button data-testid="like"></button></div>`;

/** Open-root access for tests: the real root is closed. */
export const rootOf = (host) => globalThis.__xmark.injector.rootFor(host);
