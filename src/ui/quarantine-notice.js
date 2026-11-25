/**
 * Persistent notice shown when the stored library could not be read (or only partly).
 * Shared by the popup and the options page; talks to the background by messages only.
 * The `role="status"` region exists from the start and is filled in, so screen readers
 * announce the notice when it appears.
 */

import { MSG } from '../platform/messages.js';
import { describeError } from './errors.js';

export const QUARANTINE_TEXT =
  "We couldn't read your saved library, so we started a fresh one and kept a copy. Export the unreadable copy from Options > Data.";
export const DROPPED_TEXT =
  "Some saved posts couldn't be read, so they were left out. A copy of your original data was kept. Export it from Options > Data.";
export const UNREADABLE_TEXT =
  "Your saved library can't be read right now. Export your data or reload the extension.";

const pad = (n) => String(n).padStart(2, '0');

/** @param {Date} date */
export const unreadableFilename = (date) =>
  `xmark-manager-unreadable-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.txt`;

/** File name for one kept copy: its number and the start of its id tell exports apart. */
export const copyFilename = ({ n, id }) =>
  `xmark-unreadable-copy-${n}-${String(id).slice(0, 8)}.txt`;

/**
 * Fetch the unreadable copy and hand it to the download adapter.
 * @param {{client: {request: Function}, createDownload: Function, now: () => Date,
 *   copy?: {n: number, id: string}, current?: boolean}} deps `copy` names a kept copy (default the newest);
 *   `current` exports the stored unreadable value itself, which may have no copy
 */
export async function downloadUnreadableCopy({ client, createDownload, now, copy, current }) {
  const payload = current ? { current: true } : copy ? { n: copy.n, id: copy.id } : undefined;
  const text = await client.request(MSG.EXPORT_QUARANTINE, payload);
  const filename = copy && !current ? copyFilename(copy) : unreadableFilename(now());
  createDownload({ filename, text, mime: 'text/plain' });
}

/** True when a GET_STORAGE_STATUS answer says the library needs the user's attention. */
export const isQuarantined = (status) =>
  status?.state === 'quarantined' || status?.state === 'storage_unreadable';

/** The notice wording for a status answer. */
export function noticeText(status) {
  if (status?.state === 'storage_unreadable') return UNREADABLE_TEXT;
  return status?.reason === 'records_dropped' ? DROPPED_TEXT : QUARANTINE_TEXT;
}

/**
 * @param {ReturnType<import('./dom.js').createDom>} dom
 * @param {{client: {request: Function}, createDownload: Function, now?: () => Date,
 *   announce?: (t: string) => void}} deps
 */
export function createQuarantineNotice(
  dom,
  { client, createDownload, now = () => new Date(), announce = () => {} },
) {
  let busy = false;
  const element = dom.el('div', { class: 'notice-region', attrs: { role: 'status' } });
  const error = dom.el('p', { class: 'notice-error', attrs: { role: 'alert', hidden: true } });
  const button = dom.el('button', {
    class: 'btn btn-secondary btn-sm',
    text: 'Export unreadable copy',
    attrs: { type: 'button' },
    on: { click: () => exportCopy() },
  });

  async function exportCopy() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    error.hidden = true;
    try {
      await downloadUnreadableCopy({ client, createDownload, now });
      announce('The unreadable copy was exported.');
    } catch (err) {
      error.textContent = describeError(err);
      error.hidden = false;
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  const countText = (n) =>
    `${n} ${n === 1 ? 'copy of the unreadable data is' : 'copies of unreadable data are'} kept on this device.`;

  function show(text, withExport, copies = 0) {
    dom.clear(element);
    error.hidden = true;
    button.textContent = copies > 0 ? 'Export unreadable copy' : 'Export unreadable data';
    element.append(
      dom.el(
        'div',
        { class: 'notice quarantine-notice' },
        dom.el('p', { class: 'notice-text', text }),
        copies > 0 ? dom.el('p', { class: 'notice-count', text: countText(copies) }) : null,
        withExport ? dom.el('div', { class: 'btn-row' }, button) : null,
        error,
      ),
    );
  }

  return {
    element,
    /** Ask the background again. A failure to ask is shown, not swallowed. */
    async refresh() {
      let status;
      try {
        status = await client.request(MSG.GET_STORAGE_STATUS);
      } catch (err) {
        return show(describeError(err), false);
      }
      if (isQuarantined(status)) show(noticeText(status), true, status.copies?.length ?? 0);
      else dom.clear(element);
    },
  };
}
