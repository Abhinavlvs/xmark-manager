/**
 * Reads ONE post, and only when called from a click handler. Never called on inject/observe.
 * Takes the author from the URL path, never from the user-name DOM, and never touches
 * cookies, storage or the logged-in user's identity.
 */
(function () {
  const ns = (globalThis.__xmark = globalThis.__xmark || {});
  const MAX_PREVIEW = 280;
  const POST_RE = /^https:\/\/(?:x|twitter)\.com\/([^/]+)\/status\/\d+/;
  const HANDLE_RE = /^\w{1,15}$/;

  /** The caller's length when it is a whole number from 1 to 280, else 280. */
  const limitOf = (n) => (Number.isInteger(n) && n >= 1 && n <= MAX_PREVIEW ? n : MAX_PREVIEW);

  function truncate(text, max) {
    if (text.length <= max) return text;
    let cut = text.slice(0, max);
    const last = cut.charCodeAt(cut.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
    return cut.trimEnd();
  }

  function resolveUrl(href) {
    try {
      const base = globalThis.location?.href || 'https://x.com/';
      const match = POST_RE.exec(new URL(href, base).href);
      return match ? { url: match[0], handle: match[1] } : null;
    } catch {
      return null;
    }
  }

  /**
   * @param {Element} article
   * @param {{includeText?: boolean, maxLength?: number}} [opts] `maxLength` (whole units, at most 280)
   * @returns {{url: string, author: string|null, textPreview: string}|null}
   */
  ns.extractPost = function extractPost(article, { includeText = false, maxLength } = {}) {
    const { findStatusLink, findTextNode } = ns.selectors;
    const href = findStatusLink(article)?.getAttribute('href');
    const found = typeof href === 'string' ? resolveUrl(href) : null;
    if (!found) return null;
    let textPreview = '';
    if (includeText === true) {
      const raw = findTextNode(article)?.textContent ?? '';
      textPreview = truncate(raw.replace(/\s+/g, ' ').trim(), limitOf(maxLength));
    }
    return {
      url: found.url,
      author: HANDLE_RE.test(found.handle) ? found.handle : null,
      textPreview,
    };
  };
})();
