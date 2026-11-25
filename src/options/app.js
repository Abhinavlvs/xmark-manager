/**
 * Options shell: left nav (top tabs on narrow screens), hash routing, one section at a time,
 * and a polite live region for results.
 */

import { createLogo } from '../ui/logo.js';
import { createQuarantineNotice } from '../ui/quarantine-notice.js';
import { createRouter } from './router.js';
import { createSavedSection } from './sections/saved.js';
import { createFoldersSection } from './sections/folders.js';
import { createDataSection } from './sections/data.js';
import { createPrivacySection } from './sections/privacy.js';
import { createPermissionsSection } from './sections/permissions.js';
import { createAboutSection } from './sections/about.js';

const TITLES = {
  saved: 'Saved',
  folders: 'Folders',
  data: 'Data',
  privacy: 'Privacy',
  permissions: 'Permissions',
  about: 'About',
};

/**
 * @param {ReturnType<import('../ui/dom.js').createDom>} dom
 * @param {{client: {request: Function}, win: object, permissions: object, version: string,
 *   links: {source: string, privacyPolicy: string}, now: () => Date,
 *   createDownload: Function, openUrl?: (url: string) => void}} deps
 */
export function createOptionsApp(
  dom,
  { client, win, permissions, version, links, now, createDownload, openUrl = () => {} },
) {
  const live = dom.el('div', {
    class: 'sr-only',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  const announce = (text) => {
    live.textContent = '';
    live.textContent = text;
  };
  const notice = createQuarantineNotice(dom, { client, createDownload, now, announce });
  const sections = {
    saved: createSavedSection(dom, { client, announce, now, openUrl, win }),
    folders: createFoldersSection(dom, { client, announce }),
    data: createDataSection(dom, {
      client,
      announce,
      now,
      createDownload,
      onQuarantineChange: () => notice.refresh(),
    }),
    privacy: createPrivacySection(dom, { client, announce }),
    permissions: createPermissionsSection(dom, { permissions, announce }),
    about: createAboutSection(dom, { version, links }),
  };
  const names = Object.keys(TITLES);
  const links$ = names.map((name) =>
    dom.el('a', { class: 'nav-link', text: TITLES[name], attrs: { href: `#${name}` } }),
  );
  const nav = dom.el(
    'nav',
    { class: 'nav', attrs: { 'aria-label': 'Settings sections' } },
    dom.el(
      'div',
      { class: 'brand' },
      createLogo(dom.doc, { size: 28 }),
      dom.el('span', { class: 'wordmark', text: 'xmark-manager' }),
    ),
    dom.el('ul', {}, ...links$.map((a) => dom.el('li', {}, a))),
  );
  const main = dom.el(
    'main',
    { class: 'content' },
    notice.element,
    ...names.map((n) => sections[n].element),
  );
  let first = true;

  function show(name, { add = false } = {}) {
    names.forEach((n, i) => {
      sections[n].element.hidden = n !== name;
      if (n === name) links$[i].setAttribute('aria-current', 'page');
      else links$[i].removeAttribute('aria-current');
    });
    sections[name].load();
    if (!first) sections[name].element.querySelector('h1')?.focus();
    if (add && name === 'folders') sections.folders.focusAdd();
    first = false;
  }

  const router = createRouter({ win, routes: names, onRoute: show });
  const element = dom.el('div', { class: 'shell' }, nav, main, live);
  return {
    element,
    start: () => {
      router.start();
      notice.refresh();
    },
  };
}
