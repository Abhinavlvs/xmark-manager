/**
 * Inline confirmation panel (no window.confirm). Opens in place, moves focus into itself
 * (the safe button, or the text field when typing a word is required), closes on Escape
 * and returns focus to whatever opened it.
 */

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{title?: string, message: string, confirmLabel: string, cancelLabel?: string,
 *   requireText?: string, onConfirm: () => Promise<unknown>,
 *   describe?: (err: unknown) => string|undefined}} opts
 */
export function createConfirmPanel(
  dom,
  { title, message, confirmLabel, cancelLabel = 'Cancel', requireText, onConfirm, describe },
) {
  let opener = null;
  let busy = false;
  const alert = dom.el('p', { class: 'note-error', attrs: { role: 'alert', hidden: true } });
  const body = dom.el('p', { class: 'confirm-body', text: message });
  const input = requireText
    ? dom.el('input', {
        class: 'input',
        attrs: {
          type: 'text',
          autocomplete: 'off',
          'aria-label': `Type ${requireText} to confirm`,
        },
        on: { input: () => sync() },
      })
    : null;
  const cancel = dom.el('button', {
    class: 'btn btn-secondary',
    text: cancelLabel,
    attrs: { type: 'button' },
    on: { click: () => close() },
  });
  const confirm = dom.el('button', {
    class: 'btn btn-danger',
    text: confirmLabel,
    attrs: { type: 'button' },
    on: { click: () => run() },
  });
  const element = dom.el(
    'div',
    {
      class: 'confirm-panel',
      attrs: { role: 'group', 'aria-label': title ?? confirmLabel, hidden: true },
      on: {
        keydown: (e) => {
          if (e.key === 'Escape' && !busy) close();
        },
      },
    },
    title ? dom.el('h3', { text: title }) : null,
    body,
    requireText ? dom.el('p', { class: 'muted', text: `Type ${requireText} to confirm.` }) : null,
    input,
    alert,
    dom.el('div', { class: 'btn-row' }, cancel, confirm),
  );

  function sync() {
    confirm.disabled = busy || (requireText !== undefined && input.value !== requireText);
    cancel.disabled = busy;
  }

  async function run() {
    if (confirm.disabled) return;
    busy = true;
    alert.hidden = true;
    sync();
    try {
      await onConfirm();
      busy = false;
      close();
    } catch (err) {
      busy = false;
      alert.textContent = describe?.(err) ?? 'That did not work. Please try again.';
      alert.hidden = false;
      sync();
    }
  }

  function close() {
    element.hidden = true;
    if (opener?.isConnected !== false) opener?.focus();
    opener = null;
  }

  return {
    element,
    /** @param {HTMLElement} [from] element that gets focus back on close */
    open(from) {
      opener = from ?? null;
      if (input) input.value = '';
      alert.hidden = true;
      element.hidden = false;
      sync();
      (input ?? cancel).focus();
    },
    close,
    setMessage: (text) => {
      body.textContent = text;
    },
    /** Style the panel and its confirm button as dangerous (red) or neutral (blue). */
    setDanger: (danger) => {
      element.classList.toggle('confirm-danger', danger);
      confirm.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    },
  };
}
