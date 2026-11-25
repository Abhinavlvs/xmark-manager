import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, textOf } from '../../../test-support/dom.js';
import { createAboutSection } from '../../../src/options/sections/about.js';
import { LINKS } from '../../../src/options/links.js';

const build = (links) => {
  const ctx = makeDom();
  return createAboutSection(ctx.dom, { version: '1.2.3', links }).element;
};

test('shows the logo, name, version and the non-affiliation line', () => {
  const el = build({ source: '', privacyPolicy: '' });
  assert.ok(el.querySelector('svg'));
  assert.match(textOf(el), /xmark-manager/);
  assert.match(textOf(el), /Version 1\.2\.3/);
  assert.match(textOf(el), /Not affiliated with or endorsed by X Corp\./);
});

test('links are rendered only when set to https URLs, with a safe rel', () => {
  assert.equal(build({ source: '', privacyPolicy: '' }).querySelector('a'), null);
  const el = build({
    source: 'https://example.invalid/src',
    privacyPolicy: 'javascript:alert(1)',
  });
  const anchors = [...el.querySelectorAll('a')];
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].getAttribute('href'), 'https://example.invalid/src');
  assert.equal(anchors[0].getAttribute('rel'), 'noopener noreferrer');
  assert.equal(anchors[0].getAttribute('target'), '_blank');
});

test('the shipped link constants point at the public repository', () => {
  assert.deepEqual(
    { ...LINKS },
    {
      source: 'https://github.com/Abhinavlvs/xmark-manager',
      privacyPolicy: 'https://github.com/Abhinavlvs/xmark-manager/blob/main/PRIVACY.md',
    },
  );
});

test('no stray text is rendered when no links are set', () => {
  assert.doesNotMatch(textOf(build({ source: '', privacyPolicy: '' })), /null|undefined/);
});
