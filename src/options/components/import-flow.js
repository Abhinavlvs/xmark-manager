/**
 * Import flow of the Data section: pick a file, preview what would change (dry run), ask inline,
 * then import. The file text is held only between the preview and Continue.
 */

import { MSG } from '../../platform/messages.js';
import { describeError, isStorageFailure } from '../../ui/errors.js';
import { MAX_IMPORT_CHARS } from '../../core/portability.js';
import { createConfirmPanel } from './confirm-panel.js';
import { importSummaryText, importPreviewText, keptLocalText } from '../view-model.js';

const NOTHING = 'Nothing to change: everything in that file is already in your library.';
const NO_VALID = 'No valid records were found in that file.';
const TOO_BIG = 'That file is larger than 25 MB, so it cannot be an export from xmark-manager.';

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{client: {request: Function}, announce: (t: string) => void,
 *   importBtn: HTMLElement, error: {show(t: string): void, hide(): void},
 *   guarded: (owner: HTMLElement, fn: () => Promise<unknown>) => Promise<void>,
 *   isBusy: () => boolean}} deps
 */
export function createImportFlow(dom, { client, announce, importBtn, error, guarded, isBusy }) {
  let pendingText = null;
  const result = dom.el('p', { class: 'note-success import-result', attrs: { hidden: true } });
  const fileInput = dom.el('input', {
    attrs: { type: 'file', accept: '.json,application/json', hidden: true, tabindex: -1 },
    on: {
      change: async () => {
        await onFile();
        fileInput.value = '';
      },
    },
  });

  function showResult(text) {
    result.textContent = text;
    result.hidden = false;
    announce(text);
  }

  const panel = createConfirmPanel(dom, {
    title: 'Import this file?',
    message: '',
    confirmLabel: 'Continue',
    describe: (err) => (isStorageFailure(err) ? describeError(err) : undefined),
    onConfirm: async () => {
      // Same busy state as the other buttons, so a second file pick cannot swap the text.
      if (isBusy() || pendingText === null) throw new Error('busy');
      await guarded(importBtn, async () => {
        const summary = await client.request(MSG.IMPORT_DATA, { text: pendingText });
        pendingText = null;
        showResult(importSummaryText(summary));
      });
    },
  });
  panel.element.classList.add('import-panel');

  const changes = (p) => p.added + p.updated + p.removed + (p.foldersChanged ?? 0);

  function onFile() {
    return guarded(importBtn, async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      error.hide();
      result.hidden = true;
      try {
        if (file.size > MAX_IMPORT_CHARS) return error.show(TOO_BIG);
        const text = await file.text();
        const preview = await client.request(MSG.IMPORT_DATA, { text, dryRun: true });
        if (changes(preview) === 0) {
          const kept = keptLocalText(preview.keptLocal ?? 0, false, preview.keptLocalFolders ?? 0);
          if (kept) return showResult(`Nothing was imported. ${kept}`); // never "nothing to change"
          if (preview.valid === 0 && preview.rejected > 0) return showResult(NO_VALID);
          const n = preview.rejected ?? 0;
          const skipped = n
            ? ` ${n} invalid ${n === 1 ? 'record was' : 'records were'} skipped.`
            : '';
          return showResult(`${NOTHING}${skipped}`);
        }
        pendingText = text;
        panel.setMessage(importPreviewText(preview));
        panel.setDanger(preview.removed > 0);
        panel.open(importBtn);
      } catch (err) {
        error.show(describeError(err));
      } finally {
        fileInput.value = '';
      }
    });
  }

  return { fileInput, panel, result };
}
