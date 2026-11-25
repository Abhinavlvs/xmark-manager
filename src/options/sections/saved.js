/**
 * Saved section: the full-page library browser. The same list, filters, cards and editors as the
 * popup's Saved tab (src/ui/saved), laid out for a normal-size page, with sort and paging.
 */

import { createSection } from '../components/section.js';
import { createSavedScreen } from '../../ui/saved/saved-screen.js';

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{client: {request: Function}, announce: (text: string) => void, now: () => Date,
 *   openUrl: (url: string) => void, win: object, setTimer?: Function, clearTimer?: Function,
 *   snackbarOptions?: object}} deps
 */
export function createSavedSection(
  dom,
  { client, announce, now, openUrl, win, setTimer, clearTimer, snackbarOptions },
) {
  const { element, body, heading } = createSection(dom, {
    id: 'saved',
    title: 'Saved',
    intro: 'Everything you saved, stored only in this browser.',
  });
  element.classList.add('section-wide');
  const screen = createSavedScreen(dom, {
    variant: 'page',
    client,
    now,
    onOpenUrl: openUrl,
    win,
    isActive: () => !element.hidden,
    announce,
    setTimer,
    clearTimer,
    snackbarOptions,
  });
  body.appendChild(screen.element);
  return { element, heading, load: () => screen.refresh(), focus: () => screen.focus() };
}
