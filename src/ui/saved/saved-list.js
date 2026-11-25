/**
 * The scrolling list of post cards, plus loading/empty/error states and inline editors.
 * An open editor is created once (and focused once); later renders re-attach the same
 * element so typed input and focus are never discarded.
 */

import { emptyStateFor } from './view-model.js';
import { createPostCard } from '../components/post-card.js';
import { createPostEditor } from '../components/post-editor.js';
import { createEmptyState } from '../components/empty-state.js';

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{now: () => Date, onOpenUrl: (url: string) => void, onTag: (tag: string) => void,
 *   onDelete: (post: object) => void, onPatch: (id: string, patch: object) => Promise<void>, onRefresh: () => void,
 *   onCreateFolder: (name: string) => Promise<object>, onRetry: () => void,
 *   onClearFilters: () => void, onGoSave?: () => void, variant?: 'popup'|'page'}} deps
 */
export function createSavedList(dom, deps) {
  const element = dom.el('div', { class: deps.variant === 'page' ? 'list list-page' : 'list' });
  let editing = null; // {id, mode, editor}
  let last = { view: 'loading', posts: [], folders: [], filtered: false, hasAny: false };

  function finishEdit() {
    editing = null;
    render(last);
  }

  function editorFor(post) {
    if (!editing.editor) {
      editing.editor = createPostEditor(dom, {
        post,
        folders: last.folders,
        mode: editing.mode,
        onSubmit: async (patch) => {
          await deps.onPatch(post.id, patch);
          editing = null;
          deps.onRefresh();
        },
        onCancel: finishEdit,
        onCreateFolder: deps.onCreateFolder,
      });
      queueMicrotask(() => editing?.editor.focus());
    }
    return editing.editor.element;
  }

  function item(post) {
    if (editing?.id === post.id) return editorFor(post);
    return createPostCard(dom, {
      post,
      now: deps.now(),
      folders: last.folders,
      onOpen: deps.onOpenUrl,
      onEdit: (p) => startEdit(p, 'edit'),
      onMove: (p) => startEdit(p, 'move'),
      onDelete: deps.onDelete,
      onTag: deps.onTag,
    });
  }

  function startEdit(post, mode) {
    editing = { id: post.id, mode, editor: null };
    render(last);
  }

  /** "Showing n of total" plus the button that reveals the next page (page variant only). */
  function moreControls({ shown, total, onMore }) {
    return dom.el(
      'div',
      { class: 'show-more-wrap' },
      dom.el('p', {
        class: 'muted show-more-status',
        text: `Showing ${shown} of ${total} posts`,
        attrs: { role: 'status', 'aria-live': 'polite' },
      }),
      dom.el('button', {
        class: 'btn btn-secondary show-more',
        text: 'Show more',
        attrs: { type: 'button' },
        on: { click: onMore },
      }),
    );
  }

  /** @param {{view: string, posts: object[], folders: object[], filtered: boolean, hasAny: boolean,
   *   more?: {shown: number, total: number, onMore: () => void}|null}} state */
  function render(state) {
    last = state;
    dom.clear(element);
    element.setAttribute('aria-busy', String(state.view === 'loading'));
    if (state.view === 'loading') {
      for (let i = 0; i < 3; i += 1) element.appendChild(dom.el('div', { class: 'skeleton' }));
    } else if (state.view === 'error') {
      element.appendChild(
        createEmptyState(dom, {
          ...emptyStateFor('error'),
          role: 'alert',
          action: { label: 'Retry', onClick: deps.onRetry },
        }),
      );
    } else if (!state.posts.length) {
      const kind = state.hasAny || state.filtered ? 'no-results' : 'library';
      const action = state.filtered
        ? { label: 'Clear filters', onClick: deps.onClearFilters }
        : kind === 'library' && deps.onGoSave
          ? { label: 'How to save a post', onClick: deps.onGoSave }
          : undefined;
      element.appendChild(createEmptyState(dom, { ...emptyStateFor(kind), action }));
    } else {
      for (const post of state.posts) element.appendChild(item(post));
      if (state.more) element.appendChild(moreControls(state.more));
    }
  }

  return {
    element,
    render,
    indexOf: (id) => last.posts.findIndex((p) => p.id === id),
    /** Focus the first action of card `index`, else the last card; false if there is none. */
    focusCardAt(index) {
      const cards = element.querySelectorAll('.post-card');
      const card = cards[Math.min(index, cards.length - 1)];
      const target = card?.querySelector('.post-actions a, .post-actions button');
      target?.focus();
      return Boolean(target);
    },
  };
}
