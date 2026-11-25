/**
 * User-facing text for stable error codes. Shared by the popup and options page.
 */

const FALLBACK = 'Something went wrong. Please try again.';

/** A Map, not an object: codes come from messages, so `constructor` or `__proto__` must not match. */
const ERROR_TEXT = new Map([
  ['InvalidFolderNameError', 'That folder name is not valid. Use 1 to 80 characters.'],
  ['FolderNameTakenError', 'You already have a folder with that name.'],
  ['InvalidPostUrlError', 'That is not a valid X post link.'],
  ['InvalidImportError', 'That file is not a valid xmark-manager export.'],
  ['NotFoundError', 'That item no longer exists.'],
  ['bad_payload', FALLBACK],
  ['settings_unavailable', 'Could not open settings. Open xmark-manager options from the toolbar.'],
  ['copy_changed', 'That copy changed. The list was refreshed.'],
  [
    'storage_full',
    "Couldn't save. Your library may be full. Export a backup from Options > Data, then delete old posts.",
  ],
  ['storage_error', "Couldn't save. Try again."],
  ['storage_read_error', "Couldn't read your library. Try reloading the extension."],
  [
    'storage_unreadable',
    "Your saved library can't be read right now. Export your data or reload the extension.",
  ],
]);

/** @param {{code?: string}|null|undefined} err */
export function describeError(err) {
  return ERROR_TEXT.get(err?.code) ?? FALLBACK;
}

/** True for the two storage failure codes (the save did not happen). */
export const isStorageFailure = (err) =>
  err?.code === 'storage_full' || err?.code === 'storage_error';
