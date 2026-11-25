/**
 * Folders section: list with post counts, create, rename, delete.
 */

import { MSG } from '../../platform/messages.js';
import { describeError } from '../../ui/errors.js';
import { createSection, createAlert } from '../components/section.js';
import { createFolderRow, createUncategorisedRow } from '../components/folder-row.js';
import { folderRows } from '../view-model.js';

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{client: {request: Function}, announce: (text: string) => void}} deps
 */
export function createFoldersSection(dom, { client, announce }) {
  const { element, body, heading } = createSection(dom, {
    id: 'folders',
    title: 'Folders',
    intro: 'Organise saved posts into folders. Deleting a folder never deletes posts.',
  });
  const loadError = createAlert(dom, 'load-error');
  const createError = createAlert(dom);
  const list = dom.el('ul', { class: 'folder-list card' });
  const input = dom.el('input', {
    class: 'input',
    attrs: {
      type: 'text',
      maxlength: 80,
      'aria-label': 'New folder name',
      placeholder: 'New folder',
    },
  });
  const addBtn = dom.el('button', {
    class: 'btn btn-primary',
    text: 'Add folder',
    attrs: { type: 'submit' },
  });
  const form = dom.el(
    'form',
    {
      class: 'folder-create',
      on: {
        submit: async (e) => {
          e.preventDefault();
          await create(input.value.trim());
        },
      },
    },
    dom.el('div', { class: 'inline-form' }, input, addBtn),
    createError.element,
  );
  const hint = dom.el('p', {
    class: 'muted',
    text: 'Create a folder, then go back to X and open Save again.',
  });
  hint.hidden = true;
  body.append(hint, form, loadError.element, list);

  let creating = false;
  async function create(name) {
    if (creating) return;
    createError.hide();
    if (!name) return createError.show(describeError({ code: 'InvalidFolderNameError' }));
    creating = true;
    addBtn.disabled = true;
    try {
      await client.request(MSG.CREATE_FOLDER, { name });
      input.value = '';
      announce(`Folder "${name}" created.`);
      await load();
    } catch (err) {
      createError.show(describeError(err));
    } finally {
      creating = false;
      addBtn.disabled = false;
    }
  }

  async function countIn(id) {
    const posts = await client.request(MSG.LIST_POSTS);
    return posts.filter((p) => p.folder_id === id).length;
  }

  const renameButtonFor = (name) =>
    [...list.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === `Rename ${name}`,
    );

  async function rename(id, name) {
    const renamed = await client.request(MSG.RENAME_FOLDER, { id, name });
    const stored = typeof renamed?.name === 'string' ? renamed.name : name;
    announce(`Folder renamed to "${stored}".`);
    await load();
    renameButtonFor(stored)?.focus();
  }

  async function remove(row) {
    await client.request(MSG.DELETE_FOLDER, { id: row.id });
    announce(`Folder "${row.name}" deleted. Its posts are now Uncategorised.`);
    await load();
    heading.focus();
  }

  async function load() {
    let folders;
    let posts;
    try {
      [folders, posts] = await Promise.all([
        client.request(MSG.LIST_FOLDERS),
        client.request(MSG.LIST_POSTS),
      ]);
    } catch {
      loadError.show('Could not load your folders. Try again.');
      return;
    }
    loadError.hide();
    const { rows, uncategorised } = folderRows(folders, posts);
    dom.clear(list);
    for (const row of rows) {
      list.appendChild(
        createFolderRow(dom, {
          row,
          onRename: rename,
          onDelete: () => remove(row),
          getCount: countIn,
          describe: describeError,
        }),
      );
    }
    if (rows.length === 0) {
      list.appendChild(
        dom.el('li', { class: 'folder-row muted', text: 'No folders yet. Add one above.' }),
      );
    }
    list.appendChild(createUncategorisedRow(dom, uncategorised));
  }

  /** Arrived from the on-page panel: show the hint and put the cursor in the name field. */
  function focusAdd() {
    hint.hidden = false;
    input.focus();
  }

  return { element, load, focusAdd };
}
