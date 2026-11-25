/**
 * Fake of the browser.storage.local area shape. Not under tests/.
 * `failSet` makes `set` reject with that error (once if `failOnce`), e.g. a quota error.
 * @param {Record<string, unknown>} [initial]
 * @param {{failSet?: Error, failOnce?: boolean}} [opts]
 */
export function fakeArea(initial = {}, opts = {}) {
  const data = structuredClone(initial);
  const state = { failSet: opts.failSet ?? null };
  return {
    data,
    state,
    sets: 0,
    async get(key) {
      if (key === null) return structuredClone(data);
      return key in data ? { [key]: structuredClone(data[key]) } : {};
    },
    async set(obj) {
      this.sets += 1;
      if (state.failSet) {
        const err = state.failSet;
        if (opts.failOnce) state.failSet = null;
        throw err;
      }
      Object.assign(data, structuredClone(obj));
    },
    async remove(keys) {
      for (const key of [].concat(keys)) delete data[key];
    },
  };
}

/** A rejection shaped like Firefox's quota failure. */
export const quotaError = () =>
  Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' });
