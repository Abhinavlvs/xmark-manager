/**
 * Post URL parsing. Pure: no browser APIs, no I/O.
 */

const ALLOWED_HOSTS = new Set([
  'x.com',
  'twitter.com',
  'www.x.com',
  'www.twitter.com',
  'mobile.twitter.com',
]);

const HANDLE_RE = /^\w{1,15}$/;
const ID_RE = /^\d{1,20}$/;

/**
 * First path segments that are X routes, not user handles.
 * `i` is handled separately for the exact /i/web/status/<id> form.
 */
const RESERVED_SEGMENTS = new Set([
  'home',
  'explore',
  'search',
  'settings',
  'messages',
  'notifications',
  'i',
  'compose',
  'intent',
  'hashtag',
  'login',
  'logout',
  'signup',
  'tos',
  'privacy',
  'about',
  'share',
  'lists',
  'bookmarks',
  'jobs',
  'communities',
  'premium',
]);

/**
 * @typedef {{id: string, author: string|null, url: string}} ParsedPost
 */

/**
 * Parse an X/Twitter post URL into its id, author handle and canonical URL.
 * Never throws; returns null for anything that is not a post URL.
 * @param {unknown} href
 * @returns {ParsedPost|null}
 */
export function parsePostUrl(href) {
  if (typeof href !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(href.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password) return null;
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) return null;

  const parts = parsed.pathname.split('/').slice(1);

  const head = parts.slice(0, 3).map((p) => p.toLowerCase());
  if (head[0] === 'i' && head[1] === 'web' && head[2] === 'status') {
    const id = parts[3];
    if (!id || !ID_RE.test(id)) return null;
    return { id, author: null, url: `https://x.com/i/web/status/${id}` };
  }

  const [handle, marker, id] = parts;
  if (!handle || RESERVED_SEGMENTS.has(handle.toLowerCase())) return null;
  if (!HANDLE_RE.test(handle)) return null;
  if (marker !== 'status' || !id || !ID_RE.test(id)) return null;
  return { id, author: handle, url: `https://x.com/${handle}/status/${id}` };
}
