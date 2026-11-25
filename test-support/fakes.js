/**
 * Shared test fakes. Not under tests/ so node's test runner does not pick it up.
 */

/**
 * @param {string} iso
 * @returns {import('../src/core/clock.js').Clock}
 */
export function fixedClock(iso) {
  return { now: () => iso };
}

/**
 * @param {string} [prefix]
 * @returns {import('../src/core/ids.js').IdGenerator}
 */
export function sequentialIds(prefix = 'id-') {
  let n = 0;
  return () => `${prefix}${++n}`;
}
