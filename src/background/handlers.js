/**
 * Message handlers: validate payloads, call the repository, shape responses.
 * Never logs and never leaks error details beyond stable codes.
 */

import { MSG } from '../platform/messages.js';
import { filterPosts } from '../core/search.js';
import { TOMBSTONE_TTL_MS } from '../core/merge.js';
import { systemClock } from '../core/clock.js';
import { SNIPPET_MIN, SNIPPET_MAX, coerceSnippetLength } from '../core/snippet.js';
import { exportDocument, parseImport } from '../core/portability.js';
import {
  InvalidPostUrlError,
  InvalidFolderNameError,
  NotFoundError,
  InvalidImportError,
  FolderNameTakenError,
  CopyChangedError,
  StorageFullError,
  StorageError,
  StorageReadError,
  StorageUnreadableError,
  SettingsUnavailableError,
} from '../core/errors.js';

const MAX_TAGS_IN = 20;
const DOMAIN_ERRORS = [
  InvalidPostUrlError,
  InvalidFolderNameError,
  NotFoundError,
  InvalidImportError,
  FolderNameTakenError,
  CopyChangedError,
  StorageFullError,
  StorageError,
  StorageReadError,
  StorageUnreadableError,
  SettingsUnavailableError,
];

class BadPayload extends Error {}

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const need = (cond) => {
  if (!cond) throw new BadPayload('bad_payload');
};

/**
 * Copy only whitelisted, type-checked fields. `textPreview` is passed on; the repository drops it
 * unless the snippet setting is on (checked inside its queue, see `allowPreview`).
 * @param {unknown} src
 * @param {string[]} keys
 */
function pick(src, keys) {
  need(isObj(src));
  const out = {};
  for (const key of keys) {
    const v = src[key];
    if (v === undefined) continue;
    if (key === 'tags')
      need(Array.isArray(v) && v.length <= MAX_TAGS_IN && v.every((t) => typeof t === 'string'));
    else if (key === 'folderId') need(v === null || typeof v === 'string');
    else if (key === 'saveSnippets') need(typeof v === 'boolean');
    else if (key === 'snippetLength')
      need(Number.isInteger(v) && v >= SNIPPET_MIN && v <= SNIPPET_MAX);
    else need(typeof v === 'string');
    out[key] = v;
  }
  return out;
}

/** A copy is named by number AND id (numbers are reused): `{n, id}`. */
function copyRef(p) {
  need(isObj(p) && Number.isInteger(p.n) && p.n > 0 && typeof p.id === 'string' && p.id !== '');
  return [p.n, p.id];
}

const SAVE_KEYS = ['url', 'folderId', 'tags', 'notes', 'textPreview'];
function saveInput(p) {
  const out = pick(p, SAVE_KEYS);
  need(typeof out.url === 'string');
  return out;
}

const PATCH_KEYS = ['folderId', 'tags', 'notes', 'textPreview'];

function postQuery(payload) {
  const p = isObj(payload) ? payload : {};
  const q = {};
  if (typeof p.text === 'string') q.text = p.text;
  if (p.folderId === null || typeof p.folderId === 'string') q.folderId = p.folderId;
  if (typeof p.tag === 'string' && p.tag.trim()) q.tag = p.tag;
  return q;
}

/**
 * @param {{repo: object, settings: {get, set, clear}, clock?: import('../core/clock.js').Clock}} deps
 * @returns {(message: unknown, context?: {origin?: 'content'|'extension', senderKey?: string} (default 'content': fail closed)) => Promise<import('../platform/messages.js').Response>}
 */
export function createHandlers({ repo, settings, clock = systemClock, openSettings }) {
  const id = (payload) => {
    need(isObj(payload) && typeof payload.id === 'string');
    return payload.id;
  };
  const name = (payload) => {
    need(isObj(payload) && typeof payload.name === 'string');
    return payload.name;
  };
  // 0 when snippets are off, else the length to cut to (the repository applies it in its queue).
  const snippets = async () => {
    const s = await settings.get();
    return s.saveSnippets === true ? coerceSnippetLength(s.snippetLength) : 0;
  };

  // Content scripts run in the X page context: give them the least data they need.
  const forContent = {
    [MSG.SAVE_POST]: (post) => ({ id: post.id, folder_id: post.folder_id ?? null }),
    [MSG.LIST_FOLDERS]: (list) => list.map((f) => ({ id: f.id, name: f.name })),
    [MSG.GET_SETTINGS]: (s) => ({
      saveSnippets: s.saveSnippets === true,
      snippetLength: coerceSnippetLength(s.snippetLength),
    }),
  };

  const table = {
    // Validate synchronously and enqueue at once; the snippet setting is read inside the queue.
    [MSG.SAVE_POST]: async (p) => repo.savePost(saveInput(p), { allowPreview: snippets }),
    [MSG.LIST_POSTS]: async (p) => filterPosts(await repo.listPosts(), postQuery(p)),
    [MSG.UPDATE_POST]: async (p) => {
      const postId = id(p);
      return repo.updatePost(postId, pick(p.patch, PATCH_KEYS), { allowPreview: snippets });
    },
    [MSG.DELETE_POST]: async (p) => repo.deletePost(id(p)),
    [MSG.LIST_FOLDERS]: async () => repo.listFolders(),
    [MSG.CREATE_FOLDER]: async (p) => repo.createFolder(name(p)),
    [MSG.RENAME_FOLDER]: async (p) => repo.renameFolder(id(p), name(p)),
    [MSG.DELETE_FOLDER]: async (p) => repo.deleteFolder(id(p)),
    // Both start now, in arrival order: a later settings change is never wiped by this clear.
    // The library clear sets an uncopied unreadable value aside first or refuses; on a refusal
    // the settings are put back. The copies stay unless the user also asked to discard them.
    [MSG.DELETE_ALL_DATA]: async (p) => {
      need(
        p === undefined ||
          (isObj(p) && (p.discardCopy === undefined || typeof p.discardCopy === 'boolean')),
      );
      const library = repo.clearAll({ keepCopy: p?.discardCopy !== true });
      const [lib, prefs] = await Promise.allSettled([library, settings.clear()]);
      if (lib.status === 'rejected') {
        if (prefs.status === 'fulfilled') await settings.restore(prefs.value);
        throw lib.reason;
      }
      if (prefs.status === 'rejected') throw prefs.reason;
    },
    [MSG.EXPORT_DATA]: async () => exportDocument(await repo.exportDoc(), clock.now()),
    [MSG.IMPORT_DATA]: async (p) => {
      need(isObj(p) && typeof p.text === 'string');
      need(p.dryRun === undefined || typeof p.dryRun === 'boolean');
      const parsed = parseImport(p.text);
      if (!parsed.ok) throw new InvalidImportError(parsed.error);
      const summary = await repo.importDoc(parsed.doc, {
        tombstoneTtlMs: TOMBSTONE_TTL_MS,
        exportedAt: parsed.exportedAt,
        dryRun: p.dryRun === true,
      });
      const valid = parsed.doc.folders.length + parsed.doc.posts.length;
      return { ...summary, merged: parsed.merged, rejected: parsed.rejected, valid };
    },
    [MSG.GET_STORAGE_STATUS]: async () => repo.storageStatus(),
    [MSG.EXPORT_QUARANTINE]: async (p) => {
      // `{current: true}`: the stored unreadable value itself (it may have no copy); no `n` then.
      if (isObj(p) && p.current !== undefined) {
        need(p.current === true && p.n === undefined);
        const current = await repo.exportCurrentUnreadable();
        if (current === null) throw new NotFoundError('The library is readable');
        return current;
      }
      const text =
        p === undefined
          ? await repo.exportQuarantine()
          : await repo.exportQuarantine(...copyRef(p));
      if (text === null) throw new NotFoundError('Nothing was set aside');
      return text;
    },
    // Explicit: one copy by number, or `{all: true}`.
    [MSG.DISCARD_QUARANTINE]: async (p) => {
      need(isObj(p) && (p.all === true) !== (p.n !== undefined));
      return p.all === true ? repo.discardQuarantine() : repo.discardQuarantine(...copyRef(p));
    },
    [MSG.GET_SETTINGS]: async () => settings.get(),
    // No payload at all: nothing from the page can steer which page opens.
    [MSG.OPEN_FOLDER_SETTINGS]: async (p, ctx) => {
      need(p === undefined || (isObj(p) && Object.keys(p).length === 0));
      if (!openSettings) throw new SettingsUnavailableError('Settings cannot be opened');
      await openSettings(ctx.senderKey);
    },
    [MSG.SET_SETTINGS]: async (p) => settings.set(pick(p, ['saveSnippets', 'snippetLength'])),
  };

  return async (message, { origin = 'content', senderKey = '' } = {}) => {
    const run = isObj(message) && Object.hasOwn(table, message.type) ? table[message.type] : null;
    if (!run) return { ok: false, error: 'unknown_message' };
    try {
      let data = await run(message.payload, { senderKey });
      if (origin === 'content' && Object.hasOwn(forContent, message.type)) {
        data = forContent[message.type](data);
      }
      return data === undefined ? { ok: true } : { ok: true, data };
    } catch (err) {
      if (err instanceof BadPayload) return { ok: false, error: 'bad_payload' };
      if (DOMAIN_ERRORS.some((E) => err instanceof E)) return { ok: false, error: err.code };
      return { ok: false, error: 'internal_error' };
    }
  };
}
