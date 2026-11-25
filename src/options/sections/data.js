/**
 * Data section: export, import (preview first) and delete-all of the local library.
 */

import { MSG } from '../../platform/messages.js';
import { describeError } from '../../ui/errors.js';
import { createSection, createAlert } from '../components/section.js';
import { createImportFlow } from '../components/import-flow.js';
import { createDeleteAllCard } from '../components/delete-all.js';
import { createUnreadableCard } from '../components/unreadable-card.js';
import { exportFilename } from '../view-model.js';

export const SYNC_NOTE =
  'Optional sync to your own Google Drive is planned for a future version. Until then, use Export and Import to back up your library or move it between browsers.';
const EXPORT_WARN_CHARS = 20 * 1024 * 1024;
const LARGE_EXPORT =
  'This backup is unusually large; keep it somewhere safe and consider deleting old posts.';

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{client: {request: Function}, announce: (t: string) => void, now: () => Date,
 *   createDownload: (f: {filename: string, text: string, mime: string}) => void,
 *   exportWarnChars?: number, onQuarantineChange?: () => void}} deps
 */
export function createDataSection(
  dom,
  {
    client,
    announce,
    now,
    createDownload,
    exportWarnChars = EXPORT_WARN_CHARS,
    onQuarantineChange = () => {},
  },
) {
  const { element, body } = createSection(dom, {
    id: 'data',
    title: 'Data',
    intro: 'Your library lives in this browser. Export a copy, bring one back, or wipe it.',
  });
  const error = createAlert(dom, 'data-error');
  const warning = dom.el('p', { class: 'note-error export-warning', attrs: { hidden: true } });
  let busy = false;
  const button = (text, onClick, cls = 'btn btn-secondary') =>
    dom.el('button', { class: cls, text, attrs: { type: 'button' }, on: { click: onClick } });
  const exportBtn = button(
    'Export library',
    () => guarded(exportBtn, exportLibrary),
    'btn btn-primary',
  );
  const importBtn = button('Import library', () => flow.fileInput.click());

  /** Run one operation at a time; both buttons show a busy state meanwhile. */
  async function guarded(owner, fn) {
    if (busy) return;
    busy = true;
    for (const b of [exportBtn, importBtn]) b.disabled = true;
    owner.setAttribute('aria-busy', 'true');
    try {
      await fn();
    } finally {
      busy = false;
      for (const b of [exportBtn, importBtn]) b.disabled = false;
      owner.removeAttribute('aria-busy');
    }
  }

  async function exportLibrary() {
    error.hide();
    warning.hidden = true;
    try {
      const text = await client.request(MSG.EXPORT_DATA);
      createDownload({ filename: exportFilename(now()), text, mime: 'application/json' });
      warning.textContent = LARGE_EXPORT;
      warning.hidden = text.length <= exportWarnChars;
      announce('Export ready. Your download should start now.');
    } catch (err) {
      error.show(describeError(err));
    }
  }

  const flow = createImportFlow(dom, {
    client,
    announce,
    importBtn,
    error,
    guarded,
    isBusy: () => busy,
  });

  const unreadable = createUnreadableCard(dom, {
    client,
    createDownload,
    now,
    announce,
    onChange: () => {
      load();
      onQuarantineChange();
    },
  });
  const deleteAll = createDeleteAllCard(dom, {
    client,
    announce,
    onChange: () => {
      load();
      onQuarantineChange();
    },
  });
  async function load() {
    const status = await unreadable.refresh();
    deleteAll.setCopies(status?.copies?.length ?? 0, status?.state);
  }
  const card = (...children) => dom.el('div', { class: 'card' }, ...children);
  body.append(
    card(
      dom.el('h2', { text: 'Export and import' }),
      dom.el('p', {
        class: 'muted',
        text: 'Export saves one JSON file with your posts and folders. Importing shows what will change first, then merges the file into your library.',
      }),
      dom.el('div', { class: 'btn-row' }, exportBtn, importBtn),
      flow.fileInput,
      warning,
      flow.result,
      error.element,
      flow.panel.element,
    ),
    unreadable.element,
    dom.el(
      'div',
      { class: 'card sync-note' },
      dom.el('h2', { text: 'About sync' }),
      dom.el('p', { class: 'muted', text: SYNC_NOTE }),
    ),
    deleteAll.element,
  );
  return { element, load };
}
