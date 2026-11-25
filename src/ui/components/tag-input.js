/**
 * Chip-style tag editor. Enter, comma or space commits; Backspace on empty removes the last tag.
 */

import { parseTagInput } from '../saved/view-model.js';
import { normalizeTags } from '../../core/model.js';
import { createIcon } from '../icons.js';

const MAX_TAGS = 20;
const COMMIT_KEYS = new Set(['Enter', ',', ' ']);

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{tags?: string[], max?: number, onChange?: (tags: string[]) => void, id?: string,
 *   labelledBy?: string}} [opts]
 */
export function createTagInput(dom, { tags = [], max = MAX_TAGS, onChange, id, labelledBy } = {}) {
  let current = normalizeTags(tags).slice(0, max);

  const input = dom.el('input', {
    class: 'tag-input-field',
    attrs: {
      type: 'text',
      id,
      'aria-labelledby': labelledBy,
      placeholder: 'Add tags',
      autocomplete: 'off',
      spellcheck: 'false',
    },
  });
  const element = dom.el('div', {
    class: 'tag-input',
    on: {
      click: (e) => {
        if (e.target === element) input.focus();
      },
    },
  });
  element.appendChild(input);

  function render() {
    for (const chip of [...element.querySelectorAll('.chip')]) element.removeChild(chip);
    for (const tag of current) {
      const remove = dom.el(
        'button',
        {
          class: 'chip-remove',
          attrs: { type: 'button', 'aria-label': `Remove tag ${tag}` },
          on: {
            click: () =>
              setTags(
                current.filter((t) => t !== tag),
                true,
              ),
          },
        },
        createIcon(dom.doc, 'close', { size: 12 }),
      );
      element.insertBefore(
        dom.el('span', { class: 'chip chip-tag' }, dom.el('span', { text: `#${tag}` }), remove),
        input,
      );
    }
    const full = current.length >= max;
    input.disabled = full;
    input.setAttribute('placeholder', full ? `Maximum ${max} tags` : 'Add tags');
  }

  function setTags(next, notify) {
    current = normalizeTags(next).slice(0, max);
    render();
    if (notify) onChange?.([...current]);
  }

  function commit(text) {
    const added = parseTagInput(text);
    input.value = '';
    if (added.length) setTags([...current, ...added], true);
  }

  input.addEventListener('keydown', (e) => {
    if (COMMIT_KEYS.has(e.key)) {
      if (input.value.trim() || e.key !== 'Enter') {
        e.preventDefault();
        commit(input.value);
      }
    } else if (e.key === 'Backspace' && input.value === '' && current.length) {
      setTags(current.slice(0, -1), true);
    }
  });
  input.addEventListener('input', () => {
    if (/[\s,]/.test(input.value)) commit(input.value);
  });
  input.addEventListener('blur', () => commit(input.value));

  render();
  return {
    element,
    input,
    getTags: () => [...current],
    setTags: (next) => setTags(next, false),
    focus: () => input.focus(),
  };
}
