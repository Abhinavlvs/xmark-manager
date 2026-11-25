/**
 * Privacy section: the snippet toggle, the snippet length control and a plain list of what
 * is read and stored.
 */

import { MSG } from '../../platform/messages.js';
import { createSection, createAlert } from '../components/section.js';
import { createSnippetLength } from '../components/snippet-length.js';
import { PRIVACY_FACTS, RESIDUAL_RISK, SNIPPET_EXPLAINER } from '../privacy-copy.js';

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{client: {request: Function}, announce: (t: string) => void,
 *   timers?: {setTimeout: Function, clearTimeout: Function}}} deps
 */
export function createPrivacySection(dom, { client, announce, timers = globalThis }) {
  const { element, body } = createSection(dom, { id: 'privacy', title: 'Privacy' });
  const error = createAlert(dom);
  const toggle = dom.el('input', {
    attrs: {
      type: 'checkbox',
      role: 'switch',
      id: 'snippet-toggle',
      'aria-describedby': 'snippet-help',
    },
    on: { change: () => save() },
  });

  const length = createSnippetLength(dom, {
    client,
    timers: {
      setTimeout: (...a) => timers.setTimeout(...a),
      clearTimeout: (id) => timers.clearTimeout(id),
    },
    announce,
    onError: (text) => error.show(text),
    onOk: () => error.hide(),
  });
  /** The length control is usable only while the toggle is on. */
  const sync = () => length.setEnabled(toggle.checked);
  sync();

  async function save() {
    const wanted = toggle.checked;
    error.hide();
    sync();
    try {
      await client.request(MSG.SET_SETTINGS, { saveSnippets: wanted });
      announce(wanted ? 'Text snippets are on.' : 'Text snippets are off.');
    } catch {
      toggle.checked = !wanted;
      sync();
      error.show('Could not save that setting. Please try again.');
    }
  }

  const facts = dom.el(
    'ul',
    { class: 'facts' },
    ...PRIVACY_FACTS.map((f) =>
      dom.el('li', {}, dom.el('strong', { text: `${f.label}. ` }), f.text),
    ),
  );
  body.append(
    dom.el(
      'div',
      { class: 'card' },
      dom.el(
        'label',
        { class: 'switch-row', attrs: { for: 'snippet-toggle' } },
        dom.el('span', { class: 'switch-label', text: 'Save a text snippet with each post' }),
        toggle,
      ),
      dom.el('p', { class: 'muted', text: SNIPPET_EXPLAINER, attrs: { id: 'snippet-help' } }),
      error.element,
      length.element,
    ),
    dom.el(
      'div',
      { class: 'card' },
      dom.el('h2', { text: 'What xmark-manager reads and stores' }),
      facts,
      dom.el('p', { class: 'muted', text: RESIDUAL_RISK }),
    ),
  );

  async function load() {
    try {
      const settings = await client.request(MSG.GET_SETTINGS);
      toggle.checked = settings?.saveSnippets === true;
      length.setValue(settings?.snippetLength);
      sync();
      error.hide();
    } catch {
      error.show('Could not read your settings. Reload the page to try again.');
    }
  }
  return { element, load };
}
