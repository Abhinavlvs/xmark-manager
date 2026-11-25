/**
 * Popup shell: header, tab bar (Save / Saved) and the two screens.
 */

import { createLogo } from '../ui/logo.js';
import { createIcon } from '../ui/icons.js';
import { parsePostUrl } from '../core/url.js';
import { createSaveScreen } from './screens/save-screen.js';
import { createSavedScreen } from '../ui/saved/saved-screen.js';
import { createQuarantineNotice } from '../ui/quarantine-notice.js';

/**
 * @param {ReturnType<import('../ui/dom.js').createDom>} dom
 * @param {{client: {request: Function}, tabUrl?: string, now?: () => Date,
 *   openOptions: () => void, openUrl: (url: string) => void, closeWindow: () => void,
 *   createDownload?: Function}} deps
 */
export function createApp(
  dom,
  { client, tabUrl, now = () => new Date(), openOptions, openUrl, closeWindow, createDownload },
) {
  const factories = [
    () => createSaveScreen(dom, { client, tabUrl, onDone: closeWindow }),
    () => createSavedScreen(dom, { client, now, onOpenUrl: openUrl, onGoSave: () => select(0) }),
  ];
  const names = ['Save', 'Saved'];
  const screens = [null, null];
  let active = parsePostUrl(tabUrl) ? 0 : 1;

  const tabs = names.map((name, i) =>
    dom.el(
      'button',
      {
        class: 'tab',
        attrs: { role: 'tab', id: `tab-${i}`, 'aria-controls': `panel-${i}`, type: 'button' },
        on: {
          click: () => select(i),
          keydown: (e) => onKey(e, i),
        },
      },
      dom.el('span', { text: name }),
    ),
  );
  const panels = names.map((_, i) =>
    dom.el('div', {
      class: 'panel',
      attrs: { role: 'tabpanel', id: `panel-${i}`, 'aria-labelledby': `tab-${i}` },
    }),
  );

  function onKey(e, i) {
    const last = tabs.length - 1;
    const target = {
      ArrowRight: i === last ? 0 : i + 1,
      ArrowLeft: i === 0 ? last : i - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    select(target);
    tabs[target].focus();
  }

  function select(i) {
    active = i;
    if (!screens[i]) {
      screens[i] = factories[i]();
      panels[i].appendChild(screens[i].element);
    }
    tabs.forEach((tab, n) => {
      tab.setAttribute('aria-selected', String(n === i));
      tab.setAttribute('tabindex', n === i ? '0' : '-1');
      panels[n].hidden = n !== i;
    });
  }

  const header = dom.el(
    'header',
    { class: 'app-header' },
    dom.el(
      'div',
      { class: 'brand' },
      createLogo(dom.doc, { size: 26 }),
      dom.el('span', { class: 'wordmark', text: 'xmark-manager' }),
    ),
    dom.el(
      'button',
      {
        class: 'btn btn-ghost icon-btn',
        attrs: { type: 'button', 'aria-label': 'Settings', title: 'Settings' },
        on: { click: openOptions },
      },
      createIcon(dom.doc, 'gear', { size: 24 }),
    ),
  );
  const notice = createQuarantineNotice(dom, {
    client,
    now,
    createDownload: createDownload ?? (() => {}),
  });
  const element = dom.el(
    'div',
    { class: 'app' },
    header,
    notice.element,
    dom.el(
      'div',
      { class: 'tabs', attrs: { role: 'tablist', 'aria-label': 'xmark-manager' } },
      ...tabs,
    ),
    ...panels,
  );

  select(active);
  notice.refresh();
  return { element, focus: () => screens[active]?.focus() };
}
