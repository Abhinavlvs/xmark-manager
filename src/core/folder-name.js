/**
 * Folder name validation. Pure.
 */

import { MAX_FOLDER_NAME } from './model.js';
import { InvalidFolderNameError } from './errors.js';

/**
 * Trim and collapse whitespace; throws InvalidFolderNameError if not 1-80 chars.
 * @param {unknown} raw
 * @returns {string}
 */
export function cleanFolderName(raw) {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 1 || name.length > MAX_FOLDER_NAME) {
    throw new InvalidFolderNameError(`Folder name must be 1-${MAX_FOLDER_NAME} characters`);
  }
  return name;
}
