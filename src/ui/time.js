/**
 * Relative time label shared by the popup and options page. Pure.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * @param {string} iso
 * @param {Date} now
 * @returns {string} `just now`, `5m`, `3h`, `Nov 2`, or `Nov 2, 2025`; empty for an invalid date
 */
export function relativeTime(iso, now) {
  const then = new Date(iso);
  if (Number.isNaN(+then)) return '';
  const diff = +now - +then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  const date = `${MONTHS[then.getUTCMonth()]} ${then.getUTCDate()}`;
  return then.getUTCFullYear() === now.getUTCFullYear()
    ? date
    : `${date}, ${then.getUTCFullYear()}`;
}
