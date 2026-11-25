/**
 * Permissions section: shows host access to x.com and twitter.com and lets the user grant it.
 */

import { createSection } from '../components/section.js';

export const X_ORIGINS = ['*://x.com/*', '*://twitter.com/*'];

const WHY =
  'The Save button on the page needs access to x.com and twitter.com so it can appear next to a post and read that one post when you click it. The toolbar popup works without it: you can still save the post you have open.';
const FALLBACK =
  'Firefox did not let this page check or change access. You can manage it yourself: open about:addons, choose xmark-manager, then the Permissions tab.';

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{permissions: {contains(o: string[]): Promise<boolean>, request(o: string[]): Promise<boolean>},
 *   announce: (t: string) => void}} deps
 */
export function createPermissionsSection(dom, { permissions, announce }) {
  const { element, body } = createSection(dom, { id: 'permissions', title: 'Permissions' });
  const status = dom.el('p', { class: 'perm-status', attrs: { role: 'status' } });
  const note = dom.el('p', { class: 'muted' });
  const button = dom.el('button', {
    class: 'btn btn-primary',
    text: 'Enable on X',
    attrs: { type: 'button', hidden: true },
    // request() must run synchronously in this handler to count as a user gesture.
    on: { click: () => onEnable(permissions.request(X_ORIGINS)) },
  });
  body.append(
    dom.el(
      'div',
      { class: 'card' },
      status,
      dom.el('p', { class: 'muted', text: WHY }),
      note,
      dom.el('div', { class: 'btn-row' }, button),
    ),
  );

  function show(on) {
    status.textContent = `Access to x.com and twitter.com is ${on ? 'on' : 'off'}.`;
    button.hidden = on;
  }

  function fallback() {
    status.textContent = 'Permission status unavailable.';
    note.textContent = FALLBACK;
    button.hidden = true;
  }

  async function onEnable(pending) {
    note.textContent = '';
    try {
      const granted = await pending;
      show(granted === true);
      if (granted) announce('Access to x.com and twitter.com is now on.');
      else note.textContent = 'Access was not granted. You can try again whenever you like.';
    } catch {
      fallback();
    }
  }

  async function load() {
    note.textContent = '';
    try {
      show((await permissions.contains(X_ORIGINS)) === true);
    } catch {
      fallback();
    }
  }
  return { element, load };
}
