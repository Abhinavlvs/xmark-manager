/**
 * Time source. Injectable so tests can use a fixed clock.
 */

/**
 * @typedef {{now(): string}} Clock  `now()` returns an ISO 8601 timestamp.
 */

/** @type {Clock} */
export const systemClock = {
  now: () => new Date().toISOString(),
};
