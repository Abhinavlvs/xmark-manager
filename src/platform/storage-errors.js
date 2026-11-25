/**
 * Maps whatever `browser.storage.local` rejects with to a stable domain error.
 */

import {
  StorageFullError,
  StorageError,
  StorageReadError,
  StorageUnreadableError,
  CopyChangedError,
} from '../core/errors.js';

const KNOWN = [
  StorageFullError,
  StorageError,
  StorageReadError,
  StorageUnreadableError,
  CopyChangedError,
];
const isQuota = (err) =>
  err?.name === 'QuotaExceededError' || /quota/i.test(String(err?.message ?? ''));

/**
 * @param {unknown} err
 * @param {{read?: boolean}} [opts] a failed read is `storage_read_error`, not a save failure
 */
export function toStorageError(err, { read = false } = {}) {
  if (KNOWN.some((E) => err instanceof E)) return err;
  if (read) return new StorageReadError('Extension storage could not be read');
  return isQuota(err)
    ? new StorageFullError('Extension storage is full')
    : new StorageError('Extension storage failed');
}

/**
 * Run a storage call; any rejection becomes a domain storage error.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{read?: boolean}} [opts]
 * @returns {Promise<T>}
 */
export async function guardStorage(fn, opts) {
  try {
    return await fn();
  } catch (err) {
    throw toStorageError(err, opts);
  }
}
