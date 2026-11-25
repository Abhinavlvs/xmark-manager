/**
 * "Snippet length" control: a slider and a number box kept in step, a live readout, an inline
 * validation message and a "Saved" note; results are announced through the page's polite live
 * region. It never re-renders, so focus stays put. Saving is debounced while the value moves
 * and immediate on `change` (release or blur). It is disabled while snippets are off.
 */

import { MSG } from '../../platform/messages.js';
import {
  SNIPPET_MIN,
  SNIPPET_MAX,
  SNIPPET_DEFAULT,
  coerceSnippetLength,
} from '../../core/snippet.js';

export const SNIPPET_HELP = `Applies to posts you save from now on. Snippets already saved keep their length. About ${SNIPPET_MIN} characters is a short phrase; ${SNIPPET_MAX} is a full post.`;
export const SNIPPET_INVALID = `Enter a whole number from ${SNIPPET_MIN} to ${SNIPPET_MAX}.`;
const DEBOUNCE_MS = 300;
const LIMITS = { min: SNIPPET_MIN, max: SNIPPET_MAX, step: 1 };

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{client: {request: Function}, timers: {setTimeout: Function, clearTimeout: Function},
 *   announce: (text: string) => void, onError: (text: string) => void, onOk: () => void}} deps
 */
export function createSnippetLength(dom, { client, timers, announce, onError, onOk }) {
  let current = SNIPPET_DEFAULT; // what the controls show
  let saved = SNIPPET_DEFAULT; // what the background has
  let timer = null;
  let chain = Promise.resolve();

  const range = dom.el('input', {
    class: 'snippet-range',
    attrs: {
      type: 'range',
      id: 'snippet-range',
      ...LIMITS,
      'aria-describedby': 'snippet-length-help',
    },
  });
  const number = dom.el('input', {
    class: 'input snippet-number',
    attrs: {
      type: 'number',
      id: 'snippet-number',
      ...LIMITS,
      inputmode: 'numeric',
      'aria-label': 'Snippet length in characters',
      'aria-describedby': 'snippet-length-help snippet-invalid',
    },
  });
  const readout = dom.el('span', { class: 'snippet-readout', attrs: { 'aria-hidden': 'true' } });
  const invalid = dom.el('p', {
    class: 'note-error snippet-invalid',
    text: SNIPPET_INVALID,
    attrs: { id: 'snippet-invalid', role: 'alert', hidden: true },
  });
  const status = dom.el('p', { class: 'snippet-saved' });

  const words = (n) => `${n} characters`;
  /** Move the slider, readout and text alternative to `n` (and the number box unless typing). */
  function show(n, { keepNumber = false } = {}) {
    current = n;
    range.value = String(n);
    if (!keepNumber) number.value = String(n);
    range.setAttribute('aria-valuetext', words(n));
    readout.textContent = words(n);
  }
  function setInvalid(on) {
    invalid.hidden = !on;
    if (on) number.setAttribute('aria-invalid', 'true');
    else number.removeAttribute('aria-invalid');
  }

  function persist(n) {
    chain = chain.then(async () => {
      if (n === saved) return;
      try {
        await client.request(MSG.SET_SETTINGS, { snippetLength: n });
        saved = n;
        onOk();
        if (current === n && timer === null) {
          status.textContent = 'Saved';
          announce(`Snippet length set to ${words(n)}.`);
        }
      } catch {
        if (timer === null) show(saved);
        onError('Could not save that setting. Please try again.');
      }
    });
  }
  function clearTimer() {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  }
  function later() {
    clearTimer();
    status.textContent = '';
    timer = timers.setTimeout(() => {
      timer = null;
      persist(current);
    }, DEBOUNCE_MS);
  }
  function now() {
    clearTimer();
    persist(current);
  }

  range.addEventListener('input', () => {
    setInvalid(false);
    show(coerceSnippetLength(Number(range.value)));
    later();
  });
  range.addEventListener('change', now);
  number.addEventListener('input', () => {
    const raw = number.value.trim();
    const n = raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(n) || n < SNIPPET_MIN || n > SNIPPET_MAX) {
      clearTimer();
      status.textContent = '';
      setInvalid(true);
      return;
    }
    setInvalid(false);
    show(Math.round(n), { keepNumber: true });
    later();
  });
  number.addEventListener('change', () => {
    const raw = number.value.trim();
    setInvalid(false);
    if (raw === '' || Number.isNaN(Number(raw))) {
      clearTimer();
      show(saved);
      return;
    }
    show(coerceSnippetLength(Number(raw)));
    now();
  });

  const element = dom.el(
    'div',
    { class: 'snippet-length', attrs: { id: 'snippet-length-panel' } },
    dom.el('label', {
      class: 'snippet-label',
      text: 'Snippet length',
      attrs: { id: 'snippet-length-label', for: 'snippet-range' },
    }),
    dom.el('div', { class: 'snippet-controls' }, range, number, readout),
    invalid,
    dom.el('p', {
      class: 'muted snippet-help',
      text: SNIPPET_HELP,
      attrs: { id: 'snippet-length-help' },
    }),
    status,
  );
  show(SNIPPET_DEFAULT);

  return {
    element,
    /** Show a stored value without saving it. */
    setValue(raw) {
      const n = coerceSnippetLength(raw);
      saved = n;
      show(n);
      setInvalid(false);
    },
    /** Usable only while snippets are on (disabled controls are skipped by Tab). */
    setEnabled(on) {
      range.disabled = !on;
      number.disabled = !on;
      element.classList.toggle('is-off', !on);
      if (on) return;
      if (timer !== null) now(); // keep a value the user just picked
      if (!invalid.hidden) {
        setInvalid(false);
        show(current);
      }
    },
  };
}
