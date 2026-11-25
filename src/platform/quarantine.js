/**
 * Copies of unreadable (or only partly readable) library values, kept on the device.
 *
 * One copy per DISTINCT raw value, under `xmark.doc.quarantine.<n>`, plus an index at
 * `xmark.doc.status` = {state, at, reason, dropped?, copies: [{n, id, at, reason, dropped?, bytes}]}.
 * Every copy has a unique `id`: numbers are reused, so a request about a copy must carry both,
 * and a mismatch is refused (`copy_changed`) before anything is touched. A copy and its index
 * entry are written in ONE `set`. At most MAX_COPIES are kept; a further distinct value is
 * refused (never dropping a copy the user has not discarded). Everything runs in one queue per
 * storage area, so readers and writers never interleave. The library key `xmark.doc` is never
 * touched here.
 */

import { StorageUnreadableError, CopyChangedError } from '../core/errors.js';

export const MAX_COPIES = 5;
const SCAN_TO = MAX_COPIES * 2; // old versions numbered upwards; look past five for such keys
const COPY_PREFIX = 'xmark.doc.quarantine.';
export const STATUS_KEY = 'xmark.doc.status';
export const copyKey = (n) => `${COPY_PREFIX}${n}`;

/** Stable text for comparing raw values (stored values are plain JSON by construction). */
export const fingerprint = (raw) =>
  typeof raw === 'string' ? `s:${raw}` : `j:${JSON.stringify(raw)}`;

const BYTES = (raw) => fingerprint(raw).length - 2;
const queues = new WeakMap();

/**
 * @param {{get: Function, set: Function, remove: Function}} area
 * @param {{now: () => string, createId?: () => string}} deps
 */
export function createQuarantine(area, { now, createId = () => crypto.randomUUID() }) {
  let known = null; // {fp, n}: the last raw value we saw a copy of, and where
  const read = async (key) => (await area.get(key))?.[key];
  const exclusive = (fn) => {
    const run = (queues.get(area) ?? Promise.resolve()).then(fn);
    queues.set(
      area,
      run.catch(() => {}),
    );
    return run;
  };

  const statusOf = (copies) => {
    const newest = copies[copies.length - 1];
    return {
      state: 'quarantined',
      at: newest.at,
      reason: newest.reason,
      ...(newest.dropped ? { dropped: newest.dropped } : {}),
      copies,
    };
  };

  /** A clean entry from whatever the index held (junk fields are replaced, never thrown on). */
  const clean = (e, raw) => ({
    n: e.n,
    id: typeof e.id === 'string' && e.id ? e.id : createId(),
    at: typeof e.at === 'string' ? e.at : now(),
    reason: typeof e.reason === 'string' ? e.reason : 'recovered',
    ...(Number.isInteger(e.dropped) && e.dropped > 0 ? { dropped: e.dropped } : {}),
    bytes: BYTES(raw),
  });

  /**
   * The index reconciled with the copy KEYS, inside the queue: junk and dangling entries are
   * dropped, entries without an id get one, copy keys the index lost are adopted. Written back
   * (read-compare-write, we hold the queue) only when something changed.
   */
  async function index() {
    const status = await read(STATUS_KEY);
    const listed = Array.isArray(status?.copies) ? status.copies : [];
    const copies = [];
    let changed = status !== undefined && !Array.isArray(status?.copies);
    for (const e of listed) {
      const ok = e && Number.isInteger(e.n) && e.n >= 1 && !copies.some((c) => c.n === e.n);
      const raw = ok ? await read(copyKey(e.n)) : undefined;
      if (raw === undefined || copies.length >= MAX_COPIES) changed = true;
      else {
        const entry = clean(e, raw);
        if (typeof e.id !== 'string' || !e.id) changed = true;
        copies.push(entry);
      }
    }
    for (let n = 1; n <= SCAN_TO && copies.length < MAX_COPIES; n += 1) {
      if (copies.some((c) => c.n === n)) continue;
      const raw = await read(copyKey(n));
      if (raw === undefined) continue;
      copies.push(clean({ n }, raw));
      changed = true;
    }
    copies.sort((x, y) => x.n - y.n);
    if (changed) {
      try {
        if (copies.length > 0) await area.set({ [STATUS_KEY]: statusOf(copies) });
        else await area.remove(STATUS_KEY);
      } catch {
        /* the in-memory list is still right; the next call tries again */
      }
    }
    return copies;
  }

  async function covers(raw) {
    const fp = fingerprint(raw);
    if (known?.fp === fp) {
      const value = await read(copyKey(known.n)); // one key: is that copy still there?
      if (value !== undefined && fingerprint(value) === fp) return true;
      known = null;
    }
    for (const { n } of await index()) {
      const value = await read(copyKey(n));
      if (value !== undefined && fingerprint(value) === fp) {
        known = { fp, n };
        return true;
      }
    }
    return false;
  }

  async function freeNumber() {
    for (let n = 1; ; n += 1) if ((await read(copyKey(n))) === undefined) return n;
  }

  /** The entry for `n` (and `id`, when given), or a CopyChangedError. */
  function pick(copies, n, id) {
    const entry = copies.find((c) => c.n === n);
    if (!entry || (id !== undefined && entry.id !== id)) {
      throw new CopyChangedError('That copy is not the one that was shown');
    }
    return entry;
  }

  return {
    covers: (raw) => exclusive(() => covers(raw)),
    /** Forget what is cached (after the copies were removed from outside). */
    reset() {
      known = null;
    },
    /** Make sure a copy of `raw` exists before anything can overwrite it, or throw. */
    ensure: (raw, reason, dropped) =>
      exclusive(async () => {
        if (await covers(raw)) return;
        const copies = await index();
        if (copies.length >= MAX_COPIES) {
          throw new StorageUnreadableError('Too many unreadable copies; discard some');
        }
        const n = await freeNumber(); // by KEY, never trusting the index alone
        const entry = { n, id: createId(), at: now(), reason, bytes: BYTES(raw) };
        if (dropped > 0) entry.dropped = dropped;
        const next = [...copies, entry].sort((x, y) => x.n - y.n);
        try {
          await area.set({ [copyKey(n)]: raw, [STATUS_KEY]: statusOf(next) });
        } catch {
          throw new StorageUnreadableError('The unreadable library could not be set aside');
        }
        known = { fp: fingerprint(raw), n };
      }),
    /** @returns {Promise<object[]>} the index entries, oldest first */
    list: () => exclusive(index),
    /** The kept copy as text (default: newest; with `n`, `id` must match), or null. */
    text: (n, id) =>
      exclusive(async () => {
        const copies = await index();
        const entry = n === undefined ? copies[copies.length - 1] : pick(copies, n, id);
        if (!entry) return null;
        const raw = await read(copyKey(entry.n));
        if (raw === undefined) return null;
        return typeof raw === 'string' ? raw : JSON.stringify(raw);
      }),
    /** Remove copy `n` (its `id` must match), or every copy when `n` is undefined. */
    discard: (n, id) =>
      exclusive(async () => {
        const copies = await index();
        const gone = n === undefined ? copies : [pick(copies, n, id)];
        known = null;
        const left = copies.filter((c) => !gone.includes(c));
        if (left.length > 0) await area.set({ [STATUS_KEY]: statusOf(left) });
        else await area.remove(STATUS_KEY);
        await area.remove(gone.map((c) => copyKey(c.n)));
      }),
    /** Remove the index and EVERY prefixed copy key, whatever its number. */
    removeAll: () =>
      exclusive(async () => {
        known = null;
        const all = Object.keys((await area.get(null)) ?? {});
        await area.remove([STATUS_KEY, ...all.filter((k) => k.startsWith(COPY_PREFIX))]);
      }),
  };
}
