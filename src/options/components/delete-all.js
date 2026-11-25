/**
 * "Delete all local data" card: an inline confirmation that requires typing DELETE.
 */

import { MSG } from '../../platform/messages.js';
import { createConfirmPanel } from './confirm-panel.js';

const FULL =
  "Your unreadable library value cannot be set aside first because all 5 copy slots are used, so nothing was deleted. Discard a copy first, or tick 'Also delete the kept unreadable copies' to delete without keeping it.";

/** The confirmation text for what is actually on the device. */
export function confirmText(copies, unreadable) {
  return [
    'This removes every saved post, folder and setting from this browser.',
    unreadable
      ? 'The current unreadable library value has no copy and will be deleted too (export it first if you need it).'
      : '',
    copies > 0 ? 'Kept unreadable copies stay unless you tick the box above.' : '',
    'It cannot be undone. Exported files you saved elsewhere are not touched.',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{client: {request: Function}, announce: (t: string) => void,
 *   onChange?: () => void}} deps
 */
export function createDeleteAllCard(dom, { client, announce, onChange = () => {} }) {
  const discard = dom.el('input', { attrs: { type: 'checkbox', id: 'delete-copy' } });
  const copyRow = dom.el(
    'label',
    { class: 'check-row', attrs: { hidden: true } },
    discard,
    ' Also delete the kept unreadable copies',
  );
  const button = dom.el('button', {
    class: 'btn btn-secondary btn-danger-outline',
    text: 'Delete all local data',
    attrs: { type: 'button' },
    on: { click: () => openFresh() },
  });
  /** Ask for the current state, so the text is right even if it changed since the last refresh. */
  async function openFresh() {
    try {
      const status = await client.request(MSG.GET_STORAGE_STATUS);
      panel.setMessage(
        confirmText(status?.copies?.length ?? 0, status?.state === 'storage_unreadable'),
      );
    } catch {
      /* keep the text from the last refresh */
    }
    panel.open(button);
  }
  const panel = createConfirmPanel(dom, {
    title: 'Delete all local data?',
    message: confirmText(0, false),
    confirmLabel: 'Delete everything',
    describe: (err) => (err?.code === 'storage_unreadable' ? FULL : undefined),
    requireText: 'DELETE',
    onConfirm: async () => {
      const discardCopy = discard.checked === true;
      await client.request(MSG.DELETE_ALL_DATA, { discardCopy });
      announce(
        discardCopy || copyRow.hidden
          ? 'All local data was deleted.'
          : 'All local data was deleted. The kept unreadable copies stay on this device.',
      );
      onChange();
    },
  });
  panel.element.classList.add('delete-all-panel');
  const element = dom.el(
    'div',
    { class: 'card' },
    dom.el('h2', { text: 'Delete' }),
    copyRow,
    dom.el('div', { class: 'btn-row' }, button),
    panel.element,
  );
  return {
    element,
    /** Offer the "also delete the copies" checkbox only when copies exist. */
    setCopies(count, state = 'ok') {
      panel.setMessage(confirmText(count, state === 'storage_unreadable'));
      copyRow.hidden = !(count > 0);
      if (copyRow.hidden) discard.checked = false;
    },
  };
}
