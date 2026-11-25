/**
 * Text snippet length: the limits the user may choose from and the surrogate-safe cut.
 * Pure. The content scripts keep a small copy of these numbers (a drift test compares them).
 */

export const SNIPPET_MIN = 35;
export const SNIPPET_MAX = 280;
export const SNIPPET_DEFAULT = 280;

/**
 * Any value to a valid length: integers 35 to 280. Non-numbers and NaN give the default;
 * other numbers are rounded and clamped.
 * @param {unknown} value
 * @returns {number}
 */
export function coerceSnippetLength(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return SNIPPET_DEFAULT;
  return Math.min(SNIPPET_MAX, Math.max(SNIPPET_MIN, Math.round(value)));
}

/**
 * Cut `text` to at most `max` UTF-16 units, never leaving half of a surrogate pair.
 * @param {string} text
 * @param {number} max
 */
export function cutSnippet(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}
