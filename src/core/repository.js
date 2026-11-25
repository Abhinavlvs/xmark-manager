/**
 * Repository: folders and posts over an injected store port.
 * Every operation is load -> mutate a copy -> save, serialized per instance.
 */

import { addFolder, renameFolderIn, removeFolder } from './folder-ops.js';
import { mergeDocuments } from './merge.js';
import { summarizeImport, countFolderChanges } from './portability.js';
import { uniquifyFolders } from './import-clean.js';
import { applyImportClock } from './import-clamp.js';
import { identityKey } from './post-identity.js';
import { upsertPost, patchPost, tombstonePost } from './post-ops.js';
import { MAX_PREVIEW } from './model.js';
import { cutSnippet } from './snippet.js';

/**
 * @typedef {import('./model.js').Doc} Doc
 * @typedef {import('./model.js').Post} Post
 * @typedef {import('./model.js').Folder} Folder
 * @typedef {{load(): Promise<Doc>, save(doc: Doc): Promise<void>, clear?(opts?: {keepCopy?: boolean}): Promise<void>,
 *   status?(): Promise<{state: string}>, exportQuarantine?(n?: number, id?: string): Promise<string|null>,
 *   exportCurrentUnreadable?(): Promise<string|null>,
 *   discardQuarantine?(n?: number): Promise<void>}} Store
 */

const byName = (a, b) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || (a.id < b.id ? -1 : 1);
const newestFirst = (a, b) =>
  a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1;

/**
 * @param {{
 *   store: Store,
 *   clock: import('./clock.js').Clock,
 *   createId: import('./ids.js').IdGenerator,
 * }} deps
 */
export function createRepository({ store, clock, createId }) {
  let tail = Promise.resolve();

  /**
   * Run `fn(doc)` (sync or async) on a deep copy, serialized; one `store.save` when `fn`
   * returns `{save: true}`. A rejected save rejects the operation and leaves nothing behind.
   */
  function run(fn) {
    const result = tail.then(async () => {
      const doc = structuredClone(await store.load());
      const out = await fn(doc);
      if (out.save) await store.save(doc);
      return structuredClone(out.value);
    });
    tail = result.catch(() => {});
    return result;
  }
  /** Queue `fn` without loading the document (works even when the library cannot be read). */
  function exclusive(fn) {
    const result = tail.then(fn);
    tail = result.catch(() => {});
    return result;
  }
  const mutate = (fn) => run(async (doc) => ({ save: true, value: await fn(doc, clock.now()) }));
  /**
   * Drop the text snippet unless `allowPreview()` says yes, and cut it to the length it
   * answers with (a number; `true` means the maximum), so an older or buggy client cannot
   * store more than the setting allows. It runs inside the queued step, so the setting is read
   * at the moment the write happens, in order with delete-all.
   */
  async function withPolicy(input, opts) {
    if (!opts?.allowPreview || input?.textPreview === undefined) return input;
    const answer = await opts.allowPreview();
    const max =
      typeof answer === 'number' ? Math.min(answer, MAX_PREVIEW) : answer ? MAX_PREVIEW : 0;
    if (!(max > 0)) {
      return Object.fromEntries(Object.entries(input).filter(([k]) => k !== 'textPreview'));
    }
    const text = typeof input.textPreview === 'string' ? cutSnippet(input.textPreview, max) : '';
    return { ...input, textPreview: text };
  }

  return {
    savePost: (input, opts) =>
      mutate(async (doc, now) => upsertPost(doc, await withPolicy(input, opts), now, createId)),
    updatePost: (id, patch, opts) =>
      mutate(async (doc, now) => patchPost(doc, id, await withPolicy(patch, opts), now)),
    deletePost: (id) =>
      run((doc) => ({ save: tombstonePost(doc, id, clock.now()), value: undefined })),
    listPosts: () =>
      run((doc) => {
        const live = new Set(doc.folders.filter((f) => !f.deleted).map((f) => f.id));
        const orphan = (p) => p.folder_id !== null && !live.has(p.folder_id);
        const posts = doc.posts.filter((p) => !p.deleted).sort(newestFirst);
        return { value: posts.map((p) => (orphan(p) ? { ...p, folder_id: null } : p)) };
      }),
    createFolder: (name) => mutate((doc, now) => addFolder(doc, name, createId(), now)),
    renameFolder: (id, name) => mutate((doc, now) => renameFolderIn(doc, id, name, now)),
    deleteFolder: (id) =>
      run((doc) => ({ save: removeFolder(doc, id, clock.now()), value: undefined })),
    exportDoc: () => run((doc) => ({ value: doc })),
    /** Whether a stored library was unreadable and set aside (checked before answering). */
    storageStatus: () => exclusive(async () => (await store.status?.()) ?? { state: 'ok' }),
    /** A kept copy (default newest) as text, or null. */
    exportCurrentUnreadable: () =>
      exclusive(async () => (await store.exportCurrentUnreadable?.()) ?? null),
    exportQuarantine: (n, id) =>
      exclusive(async () => (await store.exportQuarantine?.(n, id)) ?? null),
    discardQuarantine: (n, id) =>
      exclusive(async () => void (await store.discardQuarantine?.(n, id))),
    /** Delete everything, serialized after every pending write so nothing can come back. */
    clearAll: (opts) => exclusive(() => store.clear(opts)),
    /**
     * Merge a cleaned imported document into the library (rules in import-clamp.js). Folder
     * names are made unique here, once, against the local and the imported names together.
     * With `dryRun` nothing is saved.
     * @param {Doc} imported
     * @param {{tombstoneTtlMs: number, dryRun?: boolean, exportedAt?: string|null}} opts
     */
    importDoc: (imported, opts) =>
      run((doc) => {
        const now = clock.now();
        const rules = { now, exportedAt: opts.exportedAt ?? null };
        const localFolders = doc.folders.filter((f) => !f.deleted);
        const folders = applyImportClock(imported.folders, doc.folders, rules);
        const posts = applyImportClock(imported.posts, doc.posts, {
          ...rules,
          identityOf: identityKey,
        });
        const incoming = {
          version: imported.version,
          folders: uniquifyFolders(folders.records, localFolders),
          posts: posts.records,
        };
        const merged = mergeDocuments(doc, incoming, { now, tombstoneTtlMs: opts.tombstoneTtlMs });
        const counted = summarizeImport(doc, merged, incoming);
        const summary = {
          ...counted,
          unchanged: counted.unchanged - posts.keptSameId, // kept-local ones are reported apart
          foldersChanged: countFolderChanges(doc, merged),
          keptLocal: posts.keptLocal,
          keptLocalFolders: folders.keptLocal,
        };
        doc.folders = merged.folders;
        doc.posts = merged.posts;
        return { save: opts.dryRun !== true, value: summary };
      }),
    listFolders: () =>
      run((doc) => ({ value: doc.folders.filter((f) => !f.deleted).sort(byName) })),
  };
}
