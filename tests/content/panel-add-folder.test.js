import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetContent, tick, fire } from '../../test-support/content.js';
import { setup } from '../../test-support/panel-setup.js';

afterEach(() => {
  globalThis.__xmark?.stop?.();
  resetContent();
});

const OPEN = { ok: true };
const pick = (window, select, value, props) => {
  for (const o of select.options) if (o.value === value) o.selected = true;
  fire(window, select, 'change', props);
};
const ADD = () => globalThis.__xmark.panelFolder.ADD_VALUE;
const opens = (calls) => calls.filter((c) => c.type === 'OPEN_FOLDER_SETTINGS');

test('"Add folder…" is the last option and the hint explains the flow', async () => {
  const { open } = await setup();
  const a = await open();
  const select = a.panel().querySelector('select');
  assert.equal(select.options.at(-1).textContent, 'Add folder…');
  assert.match(a.panel().textContent, /Add a folder in settings, then open Save again\./);
  assert.equal(select.getAttribute('aria-describedby'), 'xm-folder-hint');
});

test('an untrusted choice does nothing', async () => {
  const { open, window, calls } = await setup({ routes: { OPEN_FOLDER_SETTINGS: OPEN } });
  const a = await open();
  pick(window, a.panel().querySelector('select'), ADD(), { isTrusted: false });
  await tick();
  assert.equal(opens(calls).length, 0);
  assert.ok(a.panel());
});

test('a trusted choice sends exactly one OPEN_FOLDER_SETTINGS, no payload, no save, then closes', async () => {
  const { open, window, calls } = await setup({ routes: { OPEN_FOLDER_SETTINGS: OPEN } });
  const focused = [];
  window.HTMLElement.prototype.focus = function () {
    focused.push(this);
  };
  const a = await open();
  const select = a.panel().querySelector('select');
  pick(window, select, ADD());
  assert.match(a.panel().querySelector('[role="status"]').textContent, /Opening folder settings…/);
  await tick();
  assert.equal(opens(calls).length, 1);
  assert.equal(opens(calls)[0].payload, undefined);
  assert.equal(calls.filter((c) => c.type === 'SAVE_POST').length, 0);
  assert.equal(a.panel(), null);
  assert.equal(focused.at(-1), a.button);
});

test('the select returns to its previous value', async () => {
  const { open, window } = await setup({ routes: { OPEN_FOLDER_SETTINGS: { ok: false } } });
  const a = await open();
  const select = a.panel().querySelector('select');
  pick(window, select, 'f1');
  pick(window, select, ADD());
  await tick();
  assert.equal(select.value, 'f1');
});

test('a failed request keeps the panel and shows an inline alert', async () => {
  const { open, window, calls } = await setup({
    routes: { OPEN_FOLDER_SETTINGS: { ok: false, error: 'settings_unavailable' } },
  });
  const a = await open();
  pick(window, a.panel().querySelector('select'), ADD());
  await tick();
  const alert = a.panel().querySelector('[role="alert"]');
  assert.equal(alert.hidden, false);
  assert.equal(
    alert.textContent,
    'Could not open settings. Open xmark-manager options from the toolbar.',
  );
  assert.equal(opens(calls).length, 1);
  assert.equal(a.panel().querySelector('[role="status"]').textContent, '');
});

test('saving never sends the sentinel value as a folder id', async () => {
  const { open, window, calls } = await setup({
    routes: { OPEN_FOLDER_SETTINGS: { ok: false } },
  });
  const a = await open();
  pick(window, a.panel().querySelector('select'), ADD());
  await tick();
  fire(window, a.panel().querySelector('button.xm-primary'), 'click');
  await tick();
  const { payload } = calls.find((c) => c.type === 'SAVE_POST');
  assert.equal(payload.folderId, null);
});
