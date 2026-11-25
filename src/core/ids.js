/**
 * Id generation. Injectable so tests can use deterministic fakes.
 */

/**
 * @typedef {() => string} IdGenerator
 */

/** @type {IdGenerator} */
export function createId() {
  return crypto.randomUUID();
}
