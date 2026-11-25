/**
 * Folder picker styled as a pill, with an inline "New folder" creator.
 */

import { describeError } from '../saved/view-model.js';
import { MAX_FOLDER_NAME } from '../../core/model.js';

const NEW = '__new__';
const byName = (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{folders: import('../../core/model.js').Folder[], value?: string|null,
 *   onChange?: (id: string|null) => void,
 *   onCreate: (name: string) => Promise<import('../../core/model.js').Folder>,
 *   id?: string, labelledBy?: string}} opts
 */
export function createFolderSelect(
  dom,
  { folders, value = null, onChange, onCreate, id, labelledBy },
) {
  let list = [...folders];
  let current = value;

  const select = dom.el('select', {
    class: 'select',
    attrs: { id, 'aria-labelledby': labelledBy },
  });
  const creatorInput = dom.el('input', {
    class: 'input',
    attrs: {
      type: 'text',
      'aria-label': 'New folder name',
      placeholder: 'Folder name',
      maxlength: MAX_FOLDER_NAME,
    },
  });
  const createButton = dom.el('button', {
    class: 'btn btn-primary btn-sm',
    text: 'Create',
    attrs: { type: 'button' },
  });
  const cancelButton = dom.el('button', {
    class: 'btn btn-secondary btn-sm',
    text: 'Cancel',
    attrs: { type: 'button' },
  });
  const errorNode = dom.el('div', { class: 'note-error', attrs: { role: 'alert', hidden: true } });
  const creator = dom.el(
    'div',
    { class: 'folder-creator', attrs: { hidden: true } },
    creatorInput,
    dom.el('div', { class: 'row' }, createButton, cancelButton),
    errorNode,
  );
  const element = dom.el('div', { class: 'folder-select' }, select, creator);

  /** Select the option for `id` (null means Uncategorised). */
  function pick(id) {
    const wanted = id ?? '';
    for (const option of select.options) if (option.value === wanted) option.selected = true;
  }

  function renderOptions() {
    dom.clear(select);
    const opt = (v, label) => dom.el('option', { text: label, attrs: { value: v } });
    select.appendChild(opt('', 'Uncategorised'));
    for (const f of [...list].sort(byName)) select.appendChild(opt(f.id, f.name));
    select.appendChild(opt(NEW, 'New folder…'));
    pick(current);
  }

  function showError(text) {
    errorNode.textContent = text;
    errorNode.hidden = !text;
  }

  function closeCreator() {
    creator.hidden = true;
    creatorInput.value = '';
    showError('');
    pick(current);
    select.focus();
  }

  async function create() {
    const name = creatorInput.value.trim();
    if (name.length < 1 || name.length > MAX_FOLDER_NAME) {
      showError(`Folder names must be 1 to ${MAX_FOLDER_NAME} characters.`);
      return;
    }
    createButton.disabled = true;
    try {
      const folder = await onCreate(name);
      list.push(folder);
      current = folder.id;
      renderOptions();
      closeCreator();
      onChange?.(current);
    } catch (err) {
      showError(describeError(err));
    } finally {
      createButton.disabled = false;
    }
  }

  select.addEventListener('change', () => {
    if (select.value === NEW) {
      creator.hidden = false;
      creatorInput.focus();
      return;
    }
    current = select.value === '' ? null : select.value;
    onChange?.(current);
  });
  createButton.addEventListener('click', create);
  cancelButton.addEventListener('click', closeCreator);
  creatorInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      create();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeCreator();
    }
  });

  renderOptions();
  return {
    element,
    select,
    creatorInput,
    createButton,
    cancelButton,
    errorNode,
    getValue: () => current,
    setValue(v) {
      current = v;
      pick(v);
    },
    setFolders(next) {
      list = [...next];
      renderOptions();
    },
    focus: () => select.focus(),
  };
}
