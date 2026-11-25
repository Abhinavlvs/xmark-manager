/**
 * In-memory store fake implementing the store port. Not under tests/.
 */

/**
 * @param {import('../src/core/model.js').Doc} initial
 * @param {{delayMs?: number, failSaveTimes?: number}} [opts]
 */
export function memoryStore(initial, { delayMs = 0, failSaveTimes = 0 } = {}) {
  let doc = structuredClone(initial);
  let failures = failSaveTimes;
  const pause = () => (delayMs ? new Promise((r) => setTimeout(r, delayMs)) : Promise.resolve());
  return {
    saves: 0,
    async load() {
      const snapshot = structuredClone(doc);
      await pause();
      return snapshot;
    },
    async save(next) {
      await pause();
      if (failures > 0) {
        failures -= 1;
        throw new Error('save failed');
      }
      doc = structuredClone(next);
      this.saves += 1;
    },
    async clear() {
      await pause();
      doc = { version: 1, folders: [], posts: [] };
    },
    /** Pretend an unreadable library was set aside. */
    quarantined: null,
    async status() {
      return this.quarantined === null
        ? { state: 'ok' }
        : { state: 'quarantined', quarantinedAt: '2026-11-21T10:00:00.000Z' };
    },
    async exportQuarantine() {
      return this.quarantined;
    },
    async exportCurrentUnreadable() {
      return this.quarantined;
    },
    async discardQuarantine() {
      this.quarantined = null;
    },
    peek: () => structuredClone(doc),
  };
}
