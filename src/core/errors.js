/**
 * Domain errors. Each has a stable `name` and `code` for message handlers.
 */

class DomainError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = new.target.name;
    this.code = this.name;
  }
}

export class InvalidPostUrlError extends DomainError {}
export class InvalidFolderNameError extends DomainError {}
export class NotFoundError extends DomainError {}
export class FolderNameTakenError extends InvalidFolderNameError {}
export class InvalidImportError extends DomainError {}

/** The browser refused a write because the extension storage is full. Code: `storage_full`. */
export class StorageFullError extends DomainError {
  constructor(message) {
    super(message);
    this.code = 'storage_full';
  }
}

/** Reading or writing extension storage failed for another reason. Code: `storage_error`. */
export class StorageError extends DomainError {
  constructor(message) {
    super(message);
    this.code = 'storage_error';
  }
}

/** Stored data cannot be read and could not be set aside either. Code: `storage_read_error`. */
export class StorageReadError extends DomainError {
  constructor(message) {
    super(message);
    this.code = 'storage_read_error';
  }
}

/** The stored library is unreadable and no copy could be kept. Code: `storage_unreadable`. */
export class StorageUnreadableError extends DomainError {
  constructor(message) {
    super(message);
    this.code = 'storage_unreadable';
  }
}

/** The settings page could not be opened. Code: `settings_unavailable`. */
export class SettingsUnavailableError extends DomainError {
  constructor(message) {
    super(message);
    this.code = 'settings_unavailable';
  }
}

/** The kept copy named by a request is not the one the caller saw. Code: `copy_changed`. */
export class CopyChangedError extends DomainError {
  constructor(message) {
    super(message);
    this.code = 'copy_changed';
  }
}
