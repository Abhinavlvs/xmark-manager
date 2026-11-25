import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogo, createLogoFactory } from '../../src/ui/logo.js';
import { POLYGONS, TRANSLATE, VIEW_BOX } from '../../src/ui/logo-paths.js';

function fakeDoc() {
  const calls = [];
  const make = (ns, name) => {
    const el = {
      ns,
      name,
      attrs: {},
      children: [],
      textContent: '',
      setAttribute(k, v) {
        calls.push(['setAttribute', name, k]);
        this.attrs[k] = String(v);
      },
      appendChild(c) {
        this.children.push(c);
        return c;
      },
      append(...cs) {
        this.children.push(...cs);
      },
    };
    for (const prop of ['innerHTML', 'outerHTML']) {
      Object.defineProperty(el, prop, {
        set() {
          throw new Error(`${prop} must not be used`);
        },
        get() {
          throw new Error(`${prop} must not be used`);
        },
      });
    }
    return el;
  };
  return {
    calls,
    createElementNS(ns, name) {
      calls.push(['createElementNS', name]);
      return make(ns, name);
    },
  };
}

const find = (el, name) => el.children.find((c) => c.name === name);

test('createLogo builds six polygons in a translated group with DOM APIs', () => {
  const doc = fakeDoc();
  const svg = createLogo(doc);
  assert.equal(svg.ns, 'http://www.w3.org/2000/svg');
  assert.equal(svg.attrs.viewBox, VIEW_BOX);
  assert.equal(svg.attrs.width, '24');
  assert.equal(svg.attrs.height, '24');
  assert.equal(svg.attrs['aria-hidden'], 'true');
  const g = find(svg, 'g');
  assert.equal(g.attrs.transform, TRANSLATE);
  assert.equal(g.attrs.fill, 'currentColor');
  const polys = g.children.filter((c) => c.name === 'polygon');
  assert.deepEqual(
    polys.map((p) => p.attrs.points),
    POLYGONS,
  );
  assert.equal(polys.length, 6);
  for (const forbidden of ['defs', 'mask', 'path']) assert.equal(find(svg, forbidden), undefined);
  assert.ok(doc.calls.some(([k]) => k === 'createElementNS'));
});

test('createLogo honours size and color and adds an accessible title', () => {
  const svg = createLogo(fakeDoc(), { size: 40, color: '#1d9bf0', title: 'xmark-manager' });
  assert.equal(svg.attrs.width, '40');
  assert.equal(svg.attrs.height, '40');
  assert.equal(svg.attrs.role, 'img');
  assert.equal(svg.attrs['aria-hidden'], undefined);
  assert.equal(find(svg, 'title').textContent, 'xmark-manager');
  assert.equal(find(svg, 'g').attrs.fill, '#1d9bf0');
});

test('createLogoFactory returns an independent working builder', () => {
  const make = createLogoFactory();
  const a = make(fakeDoc());
  const b = make(fakeDoc());
  assert.notEqual(a, b);
  assert.equal(find(a, 'g').children.length, 6);
});
