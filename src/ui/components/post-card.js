/**
 * One saved post. All text is set via text nodes; the link is only rendered for real X post urls.
 */

import { describePost } from '../saved/view-model.js';
import { safeOpenTarget } from '../saved/view-model.js';
import { createIcon } from '../icons.js';

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{post: import('../../core/model.js').Post, now: Date,
 *   folders: import('../../core/model.js').Folder[],
 *   onOpen: (url: string) => void, onEdit: (p: object) => void, onMove: (p: object) => void,
 *   onDelete: (p: object) => void, onTag: (tag: string) => void}} opts
 */
export function createPostCard(
  dom,
  { post, now, folders, onOpen, onEdit, onMove, onDelete, onTag },
) {
  const d = describePost(post, now, folders);
  const icon = (name) => createIcon(dom.doc, name, { size: 14 });
  const action = (label, iconName, extra, handler) =>
    dom.el(
      'button',
      { class: `btn btn-ghost btn-sm ${extra}`, attrs: { type: 'button' }, on: { click: handler } },
      icon(iconName),
      label,
    );

  const target = safeOpenTarget(post.url);
  const open = target
    ? dom.el(
        'a',
        {
          class: 'btn btn-ghost btn-sm open-link',
          attrs: { href: target, target: '_blank', rel: 'noopener noreferrer' },
          on: {
            click: (e) => {
              e.preventDefault();
              onOpen(target);
            },
          },
        },
        icon('external'),
        'Open on X',
      )
    : null;

  return dom.el(
    'article',
    { class: 'card post-card', dataset: { id: post.id } },
    dom.el(
      'header',
      { class: 'post-head' },
      dom.el('strong', { class: 'post-author', text: d.title }),
      dom.el('span', { class: 'muted post-age', text: d.savedAgo }),
    ),
    d.subtitle ? dom.el('p', { class: 'post-snippet', text: d.subtitle }) : null,
    dom.el('p', { class: 'muted post-url', text: d.displayUrl }),
    dom.el(
      'div',
      { class: 'post-meta' },
      dom.el('span', { class: 'chip' }, icon('folder'), d.folderLabel),
      ...d.tags.map((tag) =>
        dom.el('button', {
          class: 'tag-link',
          text: `#${tag}`,
          attrs: { type: 'button' },
          on: { click: () => onTag(tag) },
        }),
      ),
    ),
    dom.el(
      'div',
      { class: 'post-actions' },
      open,
      action('Edit', 'pencil', '', () => onEdit(post)),
      action('Move', 'folder', '', () => onMove(post)),
      action('Delete', 'trash', 'danger-text', () => onDelete(post)),
    ),
  );
}
