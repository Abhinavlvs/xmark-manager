/**
 * One folder row: name and count, with inline rename and an inline delete confirmation.
 */

import { createAlert } from './section.js';
import { createConfirmPanel } from './confirm-panel.js';
import { deleteFolderMessage } from '../view-model.js';

const plural = (n) => `${n} ${n === 1 ? 'post' : 'posts'}`;

/** Row for posts without a folder: count only, not editable. */
export function createUncategorisedRow(dom, count) {
  return dom.el(
    'li',
    { class: 'folder-row' },
    dom.el('span', { class: 'folder-main muted', text: 'Uncategorised' }),
    dom.el('span', { class: 'folder-count muted', text: plural(count) }),
  );
}

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{row: {id: string, name: string, count: number},
 *   onRename: (id: string, name: string) => Promise<void>,
 *   onDelete: (id: string) => Promise<void>,
 *   getCount: (id: string) => Promise<number>,
 *   describe: (err: unknown) => string}} opts
 */
export function createFolderRow(dom, { row, onRename, onDelete, getCount, describe }) {
  const main = dom.el('span', { class: 'folder-main' });
  const alert = createAlert(dom);
  const renameBtn = dom.el('button', {
    class: 'btn btn-secondary btn-sm',
    text: 'Rename',
    attrs: { type: 'button', 'aria-label': `Rename ${row.name}` },
    on: { click: () => startRename() },
  });
  const deleteBtn = dom.el('button', {
    class: 'btn btn-secondary btn-sm',
    text: 'Delete',
    attrs: { type: 'button', 'aria-label': `Delete ${row.name}` },
    on: { click: () => askDelete() },
  });
  const panel = createConfirmPanel(dom, {
    message: deleteFolderMessage(row.name, row.count),
    confirmLabel: 'Delete folder',
    onConfirm: () => onDelete(row.id),
  });
  /** Count again when the question is asked, so the number is fresh. */
  async function askDelete() {
    let count = row.count;
    try {
      count = await getCount(row.id);
    } catch {
      // keep the count from the last load
    }
    panel.setMessage(deleteFolderMessage(row.name, count));
    panel.open(deleteBtn);
  }

  const actions = dom.el('div', { class: 'btn-row' }, renameBtn, deleteBtn);

  function showName() {
    dom.clear(main);
    main.appendChild(dom.el('span', { class: 'folder-name', text: row.name }));
    actions.hidden = false;
  }

  function startRename() {
    alert.hide();
    actions.hidden = true;
    const input = dom.el('input', {
      class: 'input',
      value: row.name,
      attrs: { type: 'text', maxlength: 80, 'aria-label': `New name for ${row.name}` },
      on: {
        keydown: (e) => {
          if (e.key !== 'Escape') return;
          showName();
          renameBtn.focus();
        },
      },
    });
    const form = dom.el(
      'form',
      {
        class: 'folder-rename',
        on: {
          submit: async (e) => {
            e.preventDefault();
            try {
              await onRename(row.id, input.value.trim());
            } catch (err) {
              alert.show(describe(err));
            }
          },
        },
      },
      input,
      dom.el('button', {
        class: 'btn btn-primary btn-sm',
        text: 'Save',
        attrs: { type: 'submit' },
      }),
      dom.el('button', {
        class: 'btn btn-secondary btn-sm',
        text: 'Cancel',
        attrs: { type: 'button' },
        on: {
          click: () => {
            showName();
            renameBtn.focus();
          },
        },
      }),
    );
    dom.clear(main);
    main.appendChild(form);
    input.focus();
  }

  showName();
  return dom.el(
    'li',
    { class: 'folder-row' },
    main,
    dom.el('span', { class: 'folder-count muted', text: plural(row.count) }),
    actions,
    alert.element,
    panel.element,
  );
}
