/**
 * Store port over a browser.storage.local-shaped area.
 *
 * Invariant: an unreadable (or only partly readable) library is never overwritten unless a copy
 * of exactly that raw value exists (see quarantine.js). `load()` makes the copy first and
 * returns the readable part; `save()` re-checks the value stored at that moment and refuses
 * with `storage_unreadable` otherwise. If a copy cannot be written, saving is refused.
 */

import { migrate, emptyDocument } from '../core/model.js';
import { StorageUnreadableError } from '../core/errors.js';
import { guardStorage } from './storage-errors.js';
import { createQuarantine } from './quarantine.js';

const KEY = 'xmark.doc';

/**
 * @typedef {{
 *   get(key: string): Promise<Record<string, unknown>>,
 *   set(obj: Record<string, unknown>): Promise<void>,
 *   remove(key: string|string[]): Promise<void>,
 * }} StorageArea
 * @typedef {{n: number, id: string, at: string, reason: string, dropped?: number, bytes: number}} CopyInfo
 * @typedef {{state: 'ok'} | {state: 'storage_unreadable', copies: CopyInfo[]} |
 *   {state: 'quarantined', quarantinedAt: string, reason: string, dropped?: number,
 *    copies: CopyInfo[]}} StorageStatus
 */

/**
 * @param {StorageArea} area
 * @param {{now?: () => string, createId?: () => string}} [opts]
 */
export function createLocalStore(area, { now = () => new Date().toISOString(), createId } = {}) {
  const read = async (key) => (await area.get(key))?.[key];
  const copies = createQuarantine(area, { now, createId });
  /** Unreadable, or readable only after dropping records: either way the raw value is kept. */
  const lossy = (raw) => {
    const { ok, dropped } = migrate(raw);
    return !ok || dropped > 0;
  };

  async function load() {
    const raw = await read(KEY);
    if (raw === undefined) return emptyDocument();
    const { doc, ok, reason, dropped } = migrate(raw);
    if (!ok || dropped > 0) await copies.ensure(raw, reason, dropped);
    return doc;
  }

  async function save(doc) {
    const stored = await read(KEY); // re-validated now, not trusted from the last load()
    if (stored !== undefined && lossy(stored) && !(await copies.covers(stored))) {
      throw new StorageUnreadableError('Refusing to overwrite a library that has no copy');
    }
    await area.set({ [KEY]: doc });
  }

  async function status() {
    let state = 'quarantined';
    try {
      await load();
    } catch (err) {
      if (!(err instanceof StorageUnreadableError)) throw err;
      state = 'storage_unreadable';
    }
    const list = await copies.list();
    if (state === 'storage_unreadable') return { state, copies: list };
    if (list.length === 0) return { state: 'ok' };
    const newest = list[list.length - 1];
    const out = { state, quarantinedAt: newest.at, reason: newest.reason, copies: list };
    return newest.dropped ? { ...out, dropped: newest.dropped } : out;
  }

  /** The kept copy as text; with none (e.g. it could not be written), the unreadable stored value. */
  async function exportCopy(n, id) {
    const text = await copies.text(n, id);
    return text !== null || n !== undefined ? text : exportCurrent();
  }

  /** The stored value as text when it is unreadable (it may have no copy), else null. */
  async function exportCurrent() {
    const stored = await read(KEY);
    if (stored === undefined || !lossy(stored)) return null;
    return typeof stored === 'string' ? stored : JSON.stringify(stored);
  }

  /** Copy the stored value if it is unreadable and uncopied; throws if that is impossible. */
  async function protect() {
    const stored = await read(KEY);
    if (stored === undefined || !lossy(stored)) return;
    const { reason, dropped } = migrate(stored);
    await copies.ensure(stored, reason, dropped);
  }

  async function clearAll() {
    await copies.removeAll();
    await area.remove(KEY);
  }

  return {
    /** @returns {Promise<import('../core/model.js').Doc>} the readable part of the library */
    load: () => guardStorage(load, { read: true }),
    /** Writes only the library key, so copies always survive; refuses to destroy uncopied data. */
    save: (doc) => guardStorage(() => save(doc)),
    /**
     * Remove the library. Copies stay unless `keepCopy` is false.
     * @param {{keepCopy?: boolean}} [opts] default: remove everything
     */
    clear: ({ keepCopy = false } = {}) =>
      guardStorage(async () => {
        if (!keepCopy) return clearAll();
        await protect(); // never destroy an unreadable value that has no copy
        await area.remove(KEY);
      }),
    /** @returns {Promise<StorageStatus>} checks the stored library first, so it is always current */
    status: () => guardStorage(status, { read: true }),
    /** @param {number} [n] copy number (with its `id`); default newest. Needs no loaded library. */
    exportQuarantine: (n, id) => guardStorage(() => exportCopy(n, id), { read: true }),
    /** The stored unreadable value itself (it may have no copy), or null if it is readable. */
    exportCurrentUnreadable: () => guardStorage(exportCurrent, { read: true }),
    /** Delete copy `n` (with its `id`), or all copies when `n` is undefined. Never the library. */
    discardQuarantine: (n, id) => guardStorage(() => copies.discard(n, id)),
  };
}
