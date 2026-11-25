/**
 * Data section card for kept copies of unreadable data: each copy can be exported or discarded
 * (inline confirm). Texts say a copy exists only when one does.
 */

import { MSG } from '../../platform/messages.js';
import { describeError } from '../../ui/errors.js';
import { downloadUnreadableCopy, isQuarantined } from '../../ui/quarantine-notice.js';
import { createAlert } from './section.js';
import { createRows } from './unreadable-rows.js';

const FREES = 'Only discarding a copy frees a slot; exporting does not.';
const WITH_COPIES = `Some or all of your saved library couldn't be read. A copy of that data is kept on this device and is never sent anywhere. A new copy is made whenever a different unreadable value is found (at most 5; saving stops until a slot is free). ${FREES} Discarding a copy never touches your current library, and if the library is still unreadable it is copied again.`;
const CURRENT_UNCOPIED = `Your current library can't be read and has no copy of its own (all 5 slots are used, or a copy could not be written), so saving is stopped. The copies below are older values. Export the current unreadable value first. ${FREES}`;
const CHANGED = 'That copy changed. The list was refreshed.';
const NO_COPY =
  "Your saved library can't be read right now and no copy could be made, so nothing can be discarded. Export your data first, or reload the extension.";

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{client: {request: Function}, createDownload: Function, now: () => Date,
 *   announce: (t: string) => void, onChange: () => void}} deps
 */
export function createUnreadableCard(dom, { client, createDownload, now, announce, onChange }) {
  const error = createAlert(dom, 'unreadable-error');
  const intro = dom.el('p', { class: 'muted' });
  const list = dom.el('ul', { class: 'copy-list' });
  const note = dom.el('p', { class: 'muted', attrs: { role: 'status' } });
  const element = dom.el(
    'div',
    { class: 'card unreadable-card', attrs: { hidden: true } },
    dom.el('h2', { text: 'Unreadable copies' }),
    intro,
    note,
    list,
    error.element,
  );

  const rows = createRows(dom);

  /** A request about a copy that is no longer the one shown: say so, refresh, do nothing else. */
  function stale(err) {
    if (err?.code !== 'copy_changed') return false;
    note.textContent = CHANGED;
    refresh();
    return true;
  }

  async function exportCopy(copy, current = false) {
    error.hide();
    note.textContent = '';
    try {
      await downloadUnreadableCopy({ client, createDownload, now, copy, current });
      announce('The unreadable copy was exported.');
    } catch (err) {
      if (!stale(err)) error.show(describeError(err));
    }
  }

  async function discardCopy(copy) {
    note.textContent = '';
    try {
      await client.request(MSG.DISCARD_QUARANTINE, { n: copy.n, id: copy.id });
    } catch (err) {
      if (stale(err)) return;
      throw err;
    }
    announce(`Copy ${copy.n} was discarded.`);
    await refresh();
    onChange();
  }

  /** @returns {Promise<object|null>} the status answer, so the shell can react to it */
  async function refresh() {
    let status;
    try {
      status = await client.request(MSG.GET_STORAGE_STATUS);
    } catch {
      status = null;
    }
    const copies = status?.copies ?? [];
    element.hidden = !isQuarantined(status);
    const uncopied = status?.state === 'storage_unreadable' && copies.length > 0;
    intro.textContent = uncopied ? CURRENT_UNCOPIED : copies.length > 0 ? WITH_COPIES : NO_COPY;
    dom.clear(list);
    if (!element.hidden) {
      const handlers = { onExport: exportCopy, onDiscard: discardCopy };
      if (uncopied) list.append(rows.currentRow(() => exportCopy(undefined, true)));
      if (copies.length > 0) for (const copy of copies) list.append(rows.copyRow(copy, handlers));
      else list.append(rows.emptyRow(() => exportCopy()));
    }
    return status;
  }

  return { element, refresh };
}
