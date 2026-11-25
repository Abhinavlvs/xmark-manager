/**
 * Inline editor for a saved post: "edit" changes tags and notes, "move" changes the folder.
 */

import { createTagInput } from './tag-input.js';
import { createFolderSelect } from './folder-select.js';
import { describeError } from '../saved/view-model.js';
import { MAX_NOTES } from '../../core/model.js';

let counter = 0;

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{post: import('../../core/model.js').Post, folders: object[], mode: 'edit'|'move',
 *   onSubmit: (patch: object) => Promise<void>, onCancel: () => void,
 *   onCreateFolder: (name: string) => Promise<object>}} opts
 */
export function createPostEditor(dom, { post, folders, mode, onSubmit, onCancel, onCreateFolder }) {
  counter += 1;
  const id = `pe${counter}`;
  const label = (text, forId) =>
    dom.el('label', { class: 'field-label', text, attrs: { for: forId } });

  const tags = createTagInput(dom, { tags: post.tags, id: `${id}-tags` });
  const notes = dom.el('textarea', {
    class: 'textarea',
    value: post.notes,
    attrs: { id: `${id}-notes`, maxlength: MAX_NOTES, rows: 3 },
  });
  const folder = createFolderSelect(dom, {
    folders,
    value: post.folder_id,
    onCreate: onCreateFolder,
    id: `${id}-folder`,
  });
  const error = dom.el('div', { class: 'note-error', attrs: { role: 'alert', hidden: true } });
  const save = dom.el('button', {
    class: 'btn btn-primary btn-sm',
    text: 'Save',
    attrs: { type: 'button' },
  });
  const cancel = dom.el('button', {
    class: 'btn btn-secondary btn-sm',
    text: 'Cancel',
    attrs: { type: 'button' },
    on: { click: onCancel },
  });

  save.addEventListener('click', async () => {
    save.disabled = true;
    error.hidden = true;
    try {
      await onSubmit(
        mode === 'move'
          ? { folderId: folder.getValue() }
          : { tags: tags.getTags(), notes: notes.value },
      );
    } catch (err) {
      error.textContent = describeError(err);
      error.hidden = false;
      save.disabled = false;
    }
  });

  const fields =
    mode === 'move'
      ? [label('Move to folder', `${id}-folder`), folder.element]
      : [label('Tags', `${id}-tags`), tags.element, label('Notes', `${id}-notes`), notes];

  const element = dom.el(
    'section',
    {
      class: 'card post-editor',
      dataset: { id: post.id },
      attrs: { 'aria-label': mode === 'move' ? 'Move post' : 'Edit post' },
      on: {
        keydown: (e) => {
          if (e.key === 'Escape' && !e.defaultPrevented) {
            e.preventDefault();
            onCancel();
          }
        },
      },
    },
    ...fields,
    error,
    dom.el('div', { class: 'row' }, save, cancel),
  );
  return { element, focus: () => (mode === 'move' ? folder.focus() : tags.focus()) };
}
