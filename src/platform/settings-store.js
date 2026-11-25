/**
 * User settings over a browser.storage.local-shaped area.
 */

import { guardStorage } from './storage-errors.js';
import { coerceSnippetLength } from '../core/snippet.js';

const KEY = 'xmark.settings';

/** @typedef {{saveSnippets: boolean, snippetLength: number}} Settings */

/** Coerce anything to a valid Settings object. */
function coerce(raw) {
  const obj = typeof raw === 'object' && raw !== null ? raw : {};
  return {
    saveSnippets: obj.saveSnippets === true,
    snippetLength: coerceSnippetLength(obj.snippetLength),
  };
}

/**
 * @param {import('./local-store.js').StorageArea} area
 */
export function createSettingsStore(area) {
  // One chain for every operation, so a `clear` can never be overtaken by an older `set`.
  let tail = Promise.resolve();
  const queued = (fn) => {
    const result = tail.then(() => guardStorage(fn));
    tail = result.catch(() => {});
    return result;
  };
  const read = async () => coerce((await area.get(KEY))?.[KEY]);
  return {
    get: () => queued(read),
    /** Remove stored settings so defaults apply again. Resolves to the removed raw value. */
    clear: () =>
      queued(async () => {
        const previous = (await area.get(KEY))?.[KEY];
        await area.remove(KEY);
        return previous;
      }),
    /** Put a value removed by `clear` back, unless settings were written since. */
    restore: (previous) =>
      queued(async () => {
        if (previous !== undefined && (await area.get(KEY))?.[KEY] === undefined) {
          await area.set({ [KEY]: previous });
        }
      }),
    /**
     * @param {{saveSnippets?: unknown, snippetLength?: unknown}} patch a boolean `saveSnippets` and a
     *   numeric `snippetLength` (rounded and clamped to 35..280) are accepted; anything else is ignored
     * @returns {Promise<Settings>}
     */
    set: (patch) =>
      queued(async () => {
        const current = await read();
        if (typeof patch?.saveSnippets === 'boolean') current.saveSnippets = patch.saveSnippets;
        if (typeof patch?.snippetLength === 'number') {
          current.snippetLength = coerceSnippetLength(patch.snippetLength);
        }
        await area.set({ [KEY]: current });
        return current;
      }),
  };
}
