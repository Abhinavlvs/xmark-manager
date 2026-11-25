import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDom,
  choose,
  click,
  press,
  typeInto,
  settle,
  textOf,
} from '../../../test-support/dom.js';
import { createFolderSelect } from '../../../src/ui/components/folder-select.js';

const folders = [
  { id: 'f2', name: 'Zed', updated_at: '', deleted: false },
  { id: 'f1', name: 'alpha', updated_at: '', deleted: false },
];

function setup(opts = {}) {
  const ctx = makeDom();
  const changes = [];
  const fs = createFolderSelect(ctx.dom, {
    folders,
    onChange: (v) => changes.push(v),
    onCreate: async (name) => ({ id: 'new', name, updated_at: '', deleted: false }),
    ...opts,
  });
  ctx.document.body.append(fs.element);
  return { ...ctx, fs, changes };
}
const optionLabels = (fs) => [...fs.select.querySelectorAll('option')].map((o) => o.textContent);

test('options: Uncategorised first, folders sorted, New folder last', () => {
  const { fs } = setup();
  assert.deepEqual(optionLabels(fs), ['Uncategorised', 'alpha', 'Zed', 'New folder…']);
  assert.equal(fs.getValue(), null);
});

test('choosing a folder reports its id; Uncategorised reports null', () => {
  const { window, fs, changes } = setup();
  choose(window, fs.select, 'f1');
  assert.equal(fs.getValue(), 'f1');
  choose(window, fs.select, '');
  assert.deepEqual(changes, ['f1', null]);
});

test('New folder reveals the creator; Create calls onCreate and selects the folder', async () => {
  const created = [];
  const { window, fs, changes } = setup({
    onCreate: async (name) => {
      created.push(name);
      return { id: 'new', name, updated_at: '', deleted: false };
    },
  });
  choose(window, fs.select, '__new__');
  assert.equal(fs.creatorInput.closest('[hidden]'), null);
  typeInto(window, fs.creatorInput, '  Reading  ');
  click(window, fs.createButton);
  await settle();
  assert.deepEqual(created, ['Reading']);
  assert.equal(fs.getValue(), 'new');
  assert.deepEqual(optionLabels(fs), ['Uncategorised', 'alpha', 'Reading', 'Zed', 'New folder…']);
  assert.equal(changes.at(-1), 'new');
});

test('validates length 1-80 without calling onCreate', async () => {
  let calls = 0;
  const { window, fs } = setup({ onCreate: async () => (calls += 1) });
  choose(window, fs.select, '__new__');
  typeInto(window, fs.creatorInput, '   ');
  click(window, fs.createButton);
  typeInto(window, fs.creatorInput, 'x'.repeat(81));
  click(window, fs.createButton);
  await settle();
  assert.equal(calls, 0);
  assert.match(textOf(fs.errorNode), /1 to 80/);
  assert.equal(fs.errorNode.getAttribute('role'), 'alert');
});

test('server errors are shown as text', async () => {
  const { window, fs } = setup({
    onCreate: async () => {
      throw Object.assign(new Error('x'), { code: 'InvalidFolderNameError' });
    },
  });
  choose(window, fs.select, '__new__');
  typeInto(window, fs.creatorInput, '<b>x</b>');
  click(window, fs.createButton);
  await settle();
  assert.match(textOf(fs.errorNode), /folder name/i);
  assert.equal(fs.element.querySelector('b'), null);
});

test('Cancel and Escape hide the creator and restore the previous value', () => {
  const { window, fs } = setup({ value: 'f1' });
  choose(window, fs.select, '__new__');
  click(window, fs.cancelButton);
  assert.equal(fs.getValue(), 'f1');
  assert.equal(fs.creatorInput.closest('[hidden]') !== null, true);
  choose(window, fs.select, '__new__');
  press(window, fs.creatorInput, 'Escape');
  assert.equal(fs.getValue(), 'f1');
});
