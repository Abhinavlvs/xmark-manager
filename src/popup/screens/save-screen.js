/**
 * Save tab: choose folder, tags and notes for the active X post, then save or update it.
 */

import { MSG } from '../../platform/messages.js';
import { MAX_NOTES } from '../../core/model.js';
import { createIcon } from '../../ui/icons.js';
import { buildSaveForm, describeError } from '../view-model.js';
import { createTagInput } from '../../ui/components/tag-input.js';
import { createFolderSelect } from '../../ui/components/folder-select.js';

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{client: {request: Function}, tabUrl?: string, onDone: () => void}} opts
 */
export function createSaveScreen(dom, { client, tabUrl, onDone }) {
  const form = buildSaveForm(tabUrl);
  const element = dom.el('div', { class: 'screen save-screen' });

  if (!form.canSave) {
    const hint = dom.el(
      'div',
      { class: 'card hint-card' },
      dom.el('p', { class: 'hint', text: form.hint }),
    );
    const button = dom.el('button', {
      class: 'btn btn-primary btn-block save-button',
      text: 'Save post',
      attrs: { type: 'button', disabled: true },
    });
    element.append(hint, dom.el('div', { class: 'actions' }, button));
    return { element, ready: Promise.resolve(), focus: () => {} };
  }

  let existing = null;
  let loaded = false;
  let status = 'idle'; // idle | saving | saved | error
  let errorText = '';
  let retry = null;

  const postId = form.canonicalUrl.split('/').pop();
  const touch = () => {
    if (status === 'saved' || status === 'error') {
      status = 'idle';
      renderActions();
    }
  };

  const folderSelect = createFolderSelect(dom, {
    folders: [],
    id: 'save-folder',
    onChange: touch,
    onCreate: (name) => client.request(MSG.CREATE_FOLDER, { name }),
  });
  const tags = createTagInput(dom, { id: 'save-tags', onChange: touch });
  const notes = dom.el('textarea', {
    class: 'textarea',
    attrs: {
      id: 'save-notes',
      maxlength: MAX_NOTES,
      rows: 3,
      placeholder: 'Why did you save this?',
    },
    on: { input: touch },
  });
  const badge = dom.el(
    'span',
    { class: 'saved-badge', attrs: { hidden: true } },
    createIcon(dom.doc, 'check', { size: 14 }),
    'Saved',
  );
  const actions = dom.el('div', { class: 'actions' });
  const label = (text, forId) =>
    dom.el('label', { class: 'field-label', text, attrs: { for: forId } });

  const context = dom.el(
    'div',
    { class: 'card post-context' },
    dom.el(
      'div',
      { class: 'context-text' },
      dom.el('strong', { text: form.author ? `@${form.author}` : 'Post on X' }),
      dom.el('span', { class: 'muted', text: form.canonicalUrl.replace(/^https:\/\//, '') }),
    ),
    badge,
  );
  element.append(
    context,
    dom.el('div', { class: 'field' }, label('Folder', 'save-folder'), folderSelect.element),
    dom.el('div', { class: 'field' }, label('Tags', 'save-tags'), tags.element),
    dom.el('div', { class: 'field' }, label('Notes', 'save-notes'), notes),
    actions,
  );

  function renderActions() {
    dom.clear(actions);
    badge.hidden = !existing;
    if (status === 'saved') {
      actions.append(
        dom.el(
          'div',
          { class: 'note-success' },
          createIcon(dom.doc, 'check', { size: 18 }),
          dom.el('span', { text: 'Saved to your library' }),
        ),
        dom.el('button', {
          class: 'btn btn-secondary btn-block done-button',
          text: 'Done',
          attrs: { type: 'button' },
          on: { click: onDone },
        }),
      );
      return;
    }
    if (status === 'error') {
      actions.append(
        dom.el(
          'div',
          { class: 'note-error', attrs: { role: 'alert' } },
          dom.el('span', { text: errorText }),
          dom.el('button', {
            class: 'btn btn-secondary btn-sm',
            text: 'Retry',
            attrs: { type: 'button' },
            on: { click: () => retry?.() },
          }),
        ),
      );
    }
    const saving = status === 'saving';
    actions.append(
      dom.el('button', {
        class: 'btn btn-primary btn-block save-button',
        text: saving ? 'Saving…' : existing ? 'Update' : 'Save post',
        attrs: { type: 'button', disabled: saving || !loaded },
        on: { click: submit },
      }),
    );
  }

  function fail(err, again) {
    status = 'error';
    errorText = describeError(err);
    retry = again;
    renderActions();
  }

  async function load() {
    status = 'idle';
    try {
      const [folders, posts] = await Promise.all([
        client.request(MSG.LIST_FOLDERS),
        client.request(MSG.LIST_POSTS, { text: postId }),
      ]);
      folderSelect.setFolders(folders);
      existing = posts.find((p) => p.url.endsWith(`/status/${postId}`)) ?? null;
      if (existing) {
        folderSelect.setValue(existing.folder_id);
        tags.setTags(existing.tags);
        notes.value = existing.notes;
      }
      loaded = true;
      renderActions();
    } catch (err) {
      fail(err, load);
    }
  }

  async function submit() {
    status = 'saving';
    renderActions();
    const fields = { folderId: folderSelect.getValue(), tags: tags.getTags(), notes: notes.value };
    try {
      if (existing) {
        await client.request(MSG.UPDATE_POST, { id: existing.id, patch: fields });
      } else {
        const saved = await client.request(MSG.SAVE_POST, { url: form.canonicalUrl, ...fields });
        existing = saved?.id ? saved : null;
      }
      status = 'saved';
      renderActions();
      actions.querySelector('.done-button')?.focus();
    } catch (err) {
      fail(err, submit);
    }
  }

  renderActions();
  return { element, ready: load(), focus: () => folderSelect.focus() };
}
