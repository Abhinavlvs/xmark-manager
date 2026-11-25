import { deepStrictEqual } from 'node:assert/strict';

/** Helpers for chromium-persistence.mjs. */

export const tryEqual = (actual, expected) => {
  try {
    deepStrictEqual(actual, expected);
    return { ok: true, detail: '' };
  } catch (err) {
    return { ok: false, detail: String(err.message).split('\n').slice(0, 6).join(' | ') };
  }
};
export const noExportedAt = (text) => {
  const doc = JSON.parse(text);
  delete doc.exported_at;
  return JSON.stringify(doc);
};

export const call = async (send, type, payload) => {
  const res = await send(type, payload);
  const r = res.value;
  if (r?.ok !== true) throw new Error(`${type} failed: ${JSON.stringify(res)}`);
  return r.data;
};
export const snapshot = async (send) => ({
  posts: await call(send, 'LIST_POSTS', {}),
  folders: await call(send, 'LIST_FOLDERS'),
  settings: await call(send, 'GET_SETTINGS'),
});
export const setRaw = (popup, value) =>
  popup.eval(
    `new Promise((resolve) => chrome.storage.local.set({ 'xmark.doc': ${JSON.stringify(value)} }, () => resolve(chrome.runtime.lastError?.message ?? 'ok')))`,
  );
export const exportCopy = async (send, copy) =>
  call(send, 'EXPORT_QUARANTINE', { n: copy.n, id: copy.id });
