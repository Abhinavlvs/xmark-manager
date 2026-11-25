/**
 * Rows of the unreadable-copies card: one per kept copy (export, discard with inline confirm),
 * one for the current value that has no copy, and one for "no copy could be made".
 */

import { describeError } from '../../ui/errors.js';
import { createConfirmPanel } from './confirm-panel.js';

const REASONS = {
  not_object: 'unreadable data',
  unknown_version: 'written by a newer version',
  bad_shape: 'unexpected shape',
  bad_records: 'invalid records',
  records_dropped: 'some records left out',
};
const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** @param {ReturnType<import('../../ui/dom.js').createDom>} dom */
export function createRows(dom) {
  const button = (text, onClick, cls = 'btn btn-secondary btn-sm', label) =>
    dom.el('button', {
      class: cls,
      text,
      attrs: { type: 'button', ...(label ? { 'aria-label': label } : {}) },
      on: { click: onClick },
    });

  return {
    /** @param {{n: number, at: string, reason: string, bytes: number}} copy */
    copyRow(copy, { onExport, onDiscard }) {
      const discard = button(
        'Discard',
        () => panel.open(discard),
        'btn btn-secondary btn-sm btn-danger-outline',
        `Discard copy ${copy.n}`,
      );
      const panel = createConfirmPanel(dom, {
        title: `Discard copy ${copy.n}?`,
        message:
          'This deletes this kept copy from the device. Your current library is not changed. It cannot be undone, so export it first if you might need it.',
        confirmLabel: 'Discard copy',
        describe: describeError,
        onConfirm: () => onDiscard(copy),
      });
      panel.element.classList.add('unreadable-panel');
      const label = `Copy ${copy.n}: ${String(copy.at).slice(0, 10)}, ${REASONS[copy.reason] ?? 'unreadable'}, ${kb(copy.bytes)}`;
      return dom.el(
        'li',
        { class: 'copy-row' },
        dom.el('span', { class: 'copy-label', text: label }),
        dom.el(
          'div',
          { class: 'btn-row' },
          button('Export', () => onExport(copy), undefined, `Export copy ${copy.n}`),
          discard,
        ),
        panel.element,
      );
    },
    /** The stored value that has no copy of its own. */
    currentRow: (onExport) =>
      dom.el(
        'li',
        { class: 'copy-row current-row' },
        dom.el('span', { class: 'copy-label', text: 'Current library value (no copy)' }),
        dom.el(
          'div',
          { class: 'btn-row' },
          button('Export current unreadable value', () => onExport()),
        ),
      ),
    emptyRow: (onExport) =>
      dom.el(
        'li',
        { class: 'copy-row' },
        dom.el(
          'div',
          { class: 'btn-row' },
          button('Export unreadable data', () => onExport()),
        ),
        dom.el(
          'div',
          { class: 'btn-row' },
          dom.el('button', {
            class: 'btn btn-secondary btn-sm',
            text: 'Discard',
            attrs: { type: 'button', disabled: true, 'aria-describedby': 'no-copy-note' },
          }),
        ),
        dom.el('p', {
          class: 'muted',
          text: 'There is no copy to discard.',
          attrs: { id: 'no-copy-note' },
        }),
      ),
  };
}
