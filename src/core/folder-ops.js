/**
 * Folder mutations on a working copy of the document. Pure; callers save.
 */

import { cleanFolderName } from './folder-name.js';
import { FolderNameTakenError, NotFoundError } from './errors.js';

/** @typedef {import('./model.js').Doc} Doc */

const lower = (s) => s.toLowerCase();

function assertNameFree(doc, name, exceptId) {
  const taken = doc.folders.some(
    (f) => !f.deleted && f.id !== exceptId && lower(f.name) === lower(name),
  );
  if (taken) throw new FolderNameTakenError('You already have a folder with that name.');
}

export function addFolder(doc, rawName, id, now) {
  const name = cleanFolderName(rawName);
  assertNameFree(doc, name, null);
  const folder = { id, name, updated_at: now, deleted: false };
  doc.folders.push(folder);
  return folder;
}

export function renameFolderIn(doc, id, rawName, now) {
  const name = cleanFolderName(rawName);
  const folder = doc.folders.find((f) => f.id === id && !f.deleted);
  if (!folder) throw new NotFoundError('Folder not found');
  assertNameFree(doc, name, id);
  folder.name = name;
  folder.updated_at = now;
  return folder;
}

/** @returns {boolean} whether anything changed */
export function removeFolder(doc, id, now) {
  const folder = doc.folders.find((f) => f.id === id && !f.deleted);
  if (!folder) return false;
  folder.deleted = true;
  folder.updated_at = now;
  for (const post of doc.posts) {
    if (!post.deleted && post.folder_id === id) {
      post.folder_id = null;
      post.updated_at = now;
    }
  }
  return true;
}

export function assertLiveFolder(doc, id) {
  if (!doc.folders.some((f) => f.id === id && !f.deleted)) {
    throw new NotFoundError('Folder not found');
  }
}
