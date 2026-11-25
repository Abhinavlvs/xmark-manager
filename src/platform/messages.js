/**
 * Message type constants and shapes shared by the background and UI shells.
 */

export const MSG = Object.freeze({
  SAVE_POST: 'SAVE_POST',
  LIST_POSTS: 'LIST_POSTS',
  UPDATE_POST: 'UPDATE_POST',
  DELETE_POST: 'DELETE_POST',
  LIST_FOLDERS: 'LIST_FOLDERS',
  CREATE_FOLDER: 'CREATE_FOLDER',
  RENAME_FOLDER: 'RENAME_FOLDER',
  DELETE_FOLDER: 'DELETE_FOLDER',
  DELETE_ALL_DATA: 'DELETE_ALL_DATA',
  EXPORT_DATA: 'EXPORT_DATA',
  IMPORT_DATA: 'IMPORT_DATA',
  GET_SETTINGS: 'GET_SETTINGS',
  SET_SETTINGS: 'SET_SETTINGS',
  GET_STORAGE_STATUS: 'GET_STORAGE_STATUS',
  EXPORT_QUARANTINE: 'EXPORT_QUARANTINE',
  DISCARD_QUARANTINE: 'DISCARD_QUARANTINE',
  OPEN_FOLDER_SETTINGS: 'OPEN_FOLDER_SETTINGS',
});

/**
 * @typedef {{type: string, payload?: unknown, incognito?: boolean}} Message
 * @typedef {{ok: true, data?: unknown} | {ok: false, error: string}} Response
 */

/**
 * Every `error` code a failed response can carry:
 * - `rejected`: the message guard denied the sender or message
 * - `unknown_message`: unrecognised message type
 * - `bad_payload`: payload failed validation
 * - `copy_changed`: a kept unreadable copy was replaced since the caller saw it (nothing was changed)
 * - `internal_error`: unexpected failure (no details exposed)
 * - `settings_unavailable`: the settings page could not be opened (OPEN_FOLDER_SETTINGS)
 * - `storage_full`: the browser refused a write because extension storage is full
 * - `storage_error`: reading or writing extension storage failed
 * - `InvalidPostUrlError`, `InvalidFolderNameError`, `NotFoundError`, `InvalidImportError`: domain errors
 * @typedef {'rejected'|'unknown_message'|'bad_payload'|'internal_error'|'storage_full'|'storage_error'|'storage_read_error'|'storage_unreadable'|'copy_changed'|'InvalidPostUrlError'|'InvalidFolderNameError'|'NotFoundError'|'InvalidImportError'|'FolderNameTakenError'|'settings_unavailable'} ErrorCode
 */
