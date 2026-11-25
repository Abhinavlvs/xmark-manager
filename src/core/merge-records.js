/**
 * Generic last-writer-wins record merge. Pure: no browser APIs, no I/O.
 */

export const MAX_FUTURE_MS = 24 * 3600 * 1000;

/**
 * Rewrite an `updated_at` later than now + 24h to `now`, so a skewed or
 * malicious far-future timestamp wins at most "as of now". Returns a copy.
 * @template {{updated_at: string}} T
 * @param {T} rec
 * @param {string} now
 * @returns {T}
 */
export function sanitizeFuture(rec, now) {
  const limit = Date.parse(now) + MAX_FUTURE_MS;
  return Date.parse(rec.updated_at) > limit ? { ...rec, updated_at: now } : rec;
}

/**
 * True if `a` should win over `b`: newer updated_at (epoch millis), then
 * larger id, then larger JSON, so the choice never depends on argument order.
 * @template {{id: string, updated_at: string}} T
 * @param {T} a
 * @param {T} b
 */
export function isNewer(a, b) {
  const ta = Date.parse(a.updated_at);
  const tb = Date.parse(b.updated_at);
  if (ta !== tb) return ta > tb;
  if (a.id !== b.id) return a.id > b.id;
  return JSON.stringify(a) > JSON.stringify(b);
}

/**
 * Merge two record lists keyed by id. Future timestamps are sanitised first;
 * winner per id by `isNewer`; expired
 * tombstones are dropped; output is sorted by id. Inputs are not mutated.
 * @template {{id: string, updated_at: string, deleted: boolean}} T
 * @param {T[]} a
 * @param {T[]} b
 * @param {{now: string, tombstoneTtlMs: number}} opts
 * @returns {T[]}
 */
export function mergeRecords(a, b, opts) {
  const nowMs = Date.parse(opts.now);
  const byId = new Map();
  for (const raw of [...a, ...b]) {
    const rec = sanitizeFuture(raw, opts.now);
    const prev = byId.get(rec.id);
    if (!prev || isNewer(rec, prev)) byId.set(rec.id, rec);
  }
  const cutoff = nowMs - opts.tombstoneTtlMs;
  return [...byId.values()]
    .filter((rec) => !(rec.deleted && Date.parse(rec.updated_at) < cutoff))
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
