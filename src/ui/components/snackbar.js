/**
 * Snackbar with an action button (Undo). Always-present polite live region.
 *
 * Stacking: messages stack. The newest is shown with a "(n to undo)" count; Undo runs the
 * newest action and then reveals the previous one with a fresh timer, so a second delete
 * never forfeits the first Undo. The timer pauses while hovered or focused and, on expiry,
 * drops the whole stack.
 */

const DURATION_MS = 6000;

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{duration?: number, setTimer?: Function, clearTimer?: Function}} [opts]
 */
export function createSnackbar(
  dom,
  { duration = DURATION_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {},
) {
  const element = dom.el('div', {
    class: 'snackbar',
    attrs: { role: 'status', 'aria-live': 'polite', hidden: true },
  });
  const stack = [];
  let timer = null;
  let hover = false;
  let focused = false;

  function stopTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  function startTimer() {
    stopTimer();
    timer = setTimer(hide, duration);
  }
  const resume = () => {
    if (stack.length && !hover && !focused) startTimer();
  };

  function render() {
    dom.clear(element);
    focused = false;
    element.hidden = stack.length === 0;
    const top = stack.at(-1);
    if (!top) return;
    const text = stack.length > 1 ? `${top.message} (${stack.length} to undo)` : top.message;
    element.appendChild(dom.el('span', { text }));
    element.appendChild(
      dom.el('button', {
        class: 'btn btn-secondary btn-sm',
        text: top.actionLabel,
        attrs: { type: 'button' },
        on: {
          click: () => {
            stack.pop();
            stopTimer();
            render();
            resume();
            top.onAction?.();
          },
        },
      }),
    );
  }

  function hide() {
    stopTimer();
    stack.length = 0;
    render();
  }

  /**
   * @param {string} message
   * @param {{actionLabel?: string, onAction?: () => void}} [opts]
   */
  function show(message, { actionLabel = 'Undo', onAction } = {}) {
    stack.push({ message, actionLabel, onAction });
    render();
    if (hover) stopTimer();
    else startTimer();
  }

  element.addEventListener('mouseenter', () => {
    hover = true;
    stopTimer();
  });
  element.addEventListener('mouseleave', () => {
    hover = false;
    resume();
  });
  element.addEventListener('focusin', () => {
    focused = true;
    stopTimer();
  });
  element.addEventListener('focusout', () => {
    focused = false;
    resume();
  });

  return { element, show, hide };
}
