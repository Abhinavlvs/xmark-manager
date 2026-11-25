/**
 * About section: logo, name, version, non-affiliation line and optional links.
 */

import { createLogo } from '../../ui/logo.js';
import { createSection } from '../components/section.js';

const isHttps = (url) => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{version: string, links: {source: string, privacyPolicy: string}}} deps
 */
export function createAboutSection(dom, { version, links }) {
  const { element, body } = createSection(dom, { id: 'about', title: 'About' });
  const link = (label, url) =>
    isHttps(url)
      ? dom.el(
          'li',
          {},
          dom.el('a', {
            text: label,
            attrs: { href: url, target: '_blank', rel: 'noopener noreferrer' },
          }),
        )
      : null;
  const items = [
    link('Source code', links.source),
    link('Privacy policy', links.privacyPolicy),
  ].filter(Boolean);
  body.append(
    dom.el(
      'div',
      { class: 'card about-card' },
      createLogo(dom.doc, { size: 48 }),
      dom.el(
        'div',
        {},
        dom.el('h2', { text: 'xmark-manager' }),
        dom.el('p', { class: 'muted', text: `Version ${version}` }),
      ),
    ),
    dom.el('p', { class: 'muted', text: 'Not affiliated with or endorsed by X Corp.' }),
    ...(items.length ? [dom.el('ul', { class: 'link-list' }, ...items)] : []),
  );
  return { element, load: async () => {} };
}
