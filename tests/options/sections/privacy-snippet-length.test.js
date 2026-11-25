import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDom,
  fakeClient,
  fire,
  settle,
  textOf,
  trackFocus,
} from '../../../test-support/dom.js';
import { MSG } from '../../../src/platform/messages.js';
import { RequestError } from '../../../src/platform/runtime-client.js';
import { createPrivacySection } from '../../../src/options/sections/privacy.js';

const HELP =
  'Applies to posts you save from now on. Snippets already saved keep their length. About 35 characters is a short phrase; 280 is a full post.';
const INVALID = 'Enter a whole number from 35 to 280.';

/** Timers that only move when the test says so. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const jobs = new Map();
  return {
    setTimeout(fn, ms) {
      jobs.set(next, { fn, at: now + ms });
      return next++;
    },
    clearTimeout(id) {
      jobs.delete(id);
    },
    async advance(ms) {
      now += ms;
      for (const [id, job] of [...jobs]) {
        if (job.at <= now) {
          jobs.delete(id);
          job.fn();
        }
      }
      await settle();
    },
    pending: () => jobs.size,
  };
}

async function setup({ saveSnippets = true, snippetLength = 140, routes = {} } = {}) {
  const said = [];
  const ctx = makeDom();
  const focused = trackFocus(ctx.window);
  const timers = fakeTimers();
  const client = fakeClient({
    [MSG.GET_SETTINGS]: { saveSnippets, snippetLength },
    ...routes,
  });
  const section = createPrivacySection(ctx.dom, { client, announce: (t) => said.push(t), timers });
  ctx.document.body.append(section.element);
  await section.load();
  const q = (sel) => section.element.querySelector(sel);
  const saves = () =>
    client.calls.filter((c) => c.type === MSG.SET_SETTINGS && 'snippetLength' in c.payload);
  return {
    ...ctx,
    said,
    focused,
    timers,
    client,
    section,
    saves,
    toggle: q('#snippet-toggle'),
    panel: q('#snippet-length-panel'),
    range: q('input[type="range"]'),
    number: q('input[type="number"]'),
    readout: q('.snippet-readout'),
    invalid: q('.snippet-invalid'),
    status: q('.snippet-saved'),
  };
}

const typeNumber = (t, value) => {
  t.number.value = String(value);
  fire(t.window, t.number, 'input');
};
const slide = (t, value) => {
  t.range.value = String(value);
  fire(t.window, t.range, 'input');
};

test('disabled while the toggle is off, enabled while it is on', async () => {
  const off = await setup({ saveSnippets: false });
  assert.equal(off.range.disabled, true);
  assert.equal(off.number.disabled, true);
  assert.equal(off.panel.hidden, false);
  assert.ok(off.panel.classList.contains('is-off'));
  off.toggle.checked = true;
  fire(off.window, off.toggle, 'change');
  await settle();
  assert.equal(off.range.disabled, false);
  assert.equal(off.number.disabled, false);
  assert.ok(!off.panel.classList.contains('is-off'));
  off.toggle.checked = false;
  fire(off.window, off.toggle, 'change');
  await settle();
  assert.equal(off.range.disabled, true);
  assert.equal(off.number.disabled, true);

  const on = await setup({ saveSnippets: true });
  assert.equal(on.range.disabled, false);
  assert.equal(on.number.disabled, false);
});

test('disabled before the settings load, and stays disabled if they cannot be read', async () => {
  const t = await setup({
    routes: {
      [MSG.GET_SETTINGS]: () => {
        throw new RequestError('internal_error');
      },
    },
  });
  assert.equal(t.range.disabled, true);
  assert.equal(t.number.disabled, true);
});

test('a failed toggle save keeps the control in step with the toggle', async () => {
  const t = await setup({
    saveSnippets: false,
    routes: {
      [MSG.SET_SETTINGS]: () => {
        throw new RequestError('internal_error');
      },
    },
  });
  t.toggle.checked = true;
  fire(t.window, t.toggle, 'change');
  await settle();
  assert.equal(t.toggle.checked, false);
  assert.equal(t.range.disabled, true);
});

test('turning snippets off saves a pending length at once and clears an invalid entry', async () => {
  const t = await setup({ snippetLength: 90 });
  slide(t, 120);
  t.toggle.checked = false;
  fire(t.window, t.toggle, 'change');
  await settle();
  assert.deepEqual(t.saves().at(-1).payload, { snippetLength: 120 });
  assert.equal(t.timers.pending(), 0);
  t.toggle.checked = true;
  fire(t.window, t.toggle, 'change');
  await settle();
  typeNumber(t, 'abc');
  t.toggle.checked = false;
  fire(t.window, t.toggle, 'change');
  await settle();
  assert.equal(t.invalid.hidden, true);
  assert.equal(t.number.value, '120');
});

test('shows the stored length, the readout, labels and help text', async () => {
  const t = await setup({ snippetLength: 90 });
  assert.equal(t.range.value, '90');
  assert.equal(t.number.value, '90');
  assert.equal(textOf(t.readout), '90 characters');
  assert.match(textOf(t.panel), /Snippet length/);
  assert.ok(textOf(t.panel).includes(HELP));
  for (const input of [t.range, t.number]) {
    assert.equal(input.getAttribute('min'), '35');
    assert.equal(input.getAttribute('max'), '280');
  }
  for (const input of [t.range, t.number]) assert.equal(input.getAttribute('step'), '1');
  const label = t.panel.querySelector('label');
  assert.equal(label.getAttribute('for'), t.range.id);
  assert.equal(t.range.getAttribute('aria-valuetext'), '90 characters');
  assert.equal(t.number.getAttribute('aria-describedby')?.includes('snippet-length-help'), true);
  assert.ok(t.number.getAttribute('aria-labelledby') || t.number.getAttribute('aria-label'));
});

test('a missing or junk stored length shows the default 280; out of range is clamped', async () => {
  for (const [bad, want] of [
    [undefined, '280'],
    ['x', '280'],
    [9999, '280'],
    [3, '35'],
  ]) {
    const t = await setup({
      routes: { [MSG.GET_SETTINGS]: { saveSnippets: true, snippetLength: bad } },
    });
    assert.equal(t.number.value, want, String(bad));
    assert.equal(t.range.value, want, String(bad));
  }
});

test('the slider syncs the number and readout and saves after 300 ms of quiet', async () => {
  const t = await setup();
  slide(t, 60);
  assert.equal(t.number.value, '60');
  assert.equal(textOf(t.readout), '60 characters');
  await t.timers.advance(299);
  assert.equal(t.saves().length, 0);
  await t.timers.advance(1);
  assert.deepEqual(
    t.saves().map((c) => c.payload),
    [{ snippetLength: 60 }],
  );
  assert.equal(textOf(t.status), 'Saved');
  assert.deepEqual(t.said, ['Snippet length set to 60 characters.']);
});

test('the slider moves one character at a time with the keyboard step', async () => {
  const t = await setup({ snippetLength: 140 });
  slide(t, 141);
  fire(t.window, t.range, 'change');
  await settle();
  assert.deepEqual(t.saves().at(-1).payload, { snippetLength: 141 });
  assert.equal(t.range.getAttribute('aria-valuetext'), '141 characters');
});

test('rapid changes coalesce into one save of the last value', async () => {
  const t = await setup();
  slide(t, 50);
  await t.timers.advance(200);
  slide(t, 55);
  await t.timers.advance(200);
  slide(t, 70);
  await t.timers.advance(300);
  assert.deepEqual(
    t.saves().map((c) => c.payload),
    [{ snippetLength: 70 }],
  );
});

test('change (blur or release) saves at once and cancels the debounce', async () => {
  const t = await setup();
  slide(t, 100);
  fire(t.window, t.range, 'change');
  await settle();
  assert.equal(t.saves().length, 1);
  assert.equal(t.timers.pending(), 0);
  await t.timers.advance(1000);
  assert.equal(t.saves().length, 1);
});

test('typing a valid number syncs the slider and saves debounced', async () => {
  const t = await setup();
  typeNumber(t, 201);
  assert.equal(t.range.value, '201');
  assert.equal(textOf(t.readout), '201 characters');
  assert.equal(t.invalid.hidden, true);
  await t.timers.advance(300);
  assert.deepEqual(t.saves().at(-1).payload, { snippetLength: 201 });
});

test('invalid typing shows the inline alert and saves nothing', async () => {
  const t = await setup();
  assert.equal(t.invalid.getAttribute('role'), 'alert');
  for (const bad of ['', '20', '300', '-5', 'abc']) {
    typeNumber(t, bad);
    assert.equal(t.invalid.hidden, false, bad);
    assert.equal(textOf(t.invalid), INVALID);
  }
  await t.timers.advance(1000);
  assert.equal(t.saves().length, 0);
  typeNumber(t, 80);
  assert.equal(t.invalid.hidden, true);
});

test('on change the number clamps to 35..280, rounds, and saves the clamped value', async () => {
  const table = [
    ['300', 280],
    ['10', 35],
    ['0', 35],
    ['-4', 35],
    ['36', 36],
    ['140.6', 141],
    ['280', 280],
    ['35', 35],
  ];
  for (const [typed, want] of table) {
    const t = await setup();
    typeNumber(t, typed);
    fire(t.window, t.number, 'change');
    await settle();
    assert.equal(t.number.value, String(want), typed);
    assert.equal(t.range.value, String(want), typed);
    assert.equal(textOf(t.readout), `${want} characters`, typed);
    assert.deepEqual(t.saves().at(-1).payload, { snippetLength: want }, typed);
    assert.equal(t.invalid.hidden, true, typed);
  }
});

test('an empty or non-numeric number reverts to the last saved value on change', async () => {
  const t = await setup({ snippetLength: 90 });
  for (const bad of ['', 'abc']) {
    typeNumber(t, bad);
    fire(t.window, t.number, 'change');
    await settle();
    assert.equal(t.number.value, '90');
    assert.equal(t.range.value, '90');
    assert.equal(t.invalid.hidden, true);
  }
  assert.equal(t.saves().length, 0);
});

test('the slider ends exactly on the limits', async () => {
  const t = await setup();
  slide(t, 35);
  fire(t.window, t.range, 'change');
  await settle();
  slide(t, 280);
  fire(t.window, t.range, 'change');
  await settle();
  assert.deepEqual(
    t.saves().map((c) => c.payload.snippetLength),
    [35, 280],
  );
});

test('a failed save reverts to the last saved length and shows an alert; focus never moves', async () => {
  let fail = false;
  const t = await setup({
    snippetLength: 90,
    routes: {
      [MSG.SET_SETTINGS]: () => {
        if (fail) throw new RequestError('internal_error');
      },
    },
  });
  slide(t, 120);
  fire(t.window, t.range, 'change');
  await settle();
  assert.equal(textOf(t.status), 'Saved');
  fail = true;
  slide(t, 200);
  fire(t.window, t.range, 'change');
  await settle();
  assert.equal(t.range.value, '120');
  assert.equal(t.number.value, '120');
  assert.equal(textOf(t.status), '');
  assert.equal(t.said.at(-1), 'Snippet length set to 120 characters.');
  assert.equal(t.section.element.querySelector('[role="alert"]').hidden, false);
  assert.deepEqual(t.focused, []);
});

test('saving does not steal focus', async () => {
  const t = await setup();
  slide(t, 77);
  await t.timers.advance(300);
  typeNumber(t, 99);
  fire(t.window, t.number, 'change');
  await settle();
  assert.deepEqual(t.focused, []);
});

test('editing again clears the Saved confirmation until the next save lands', async () => {
  const t = await setup();
  slide(t, 60);
  await t.timers.advance(300);
  assert.equal(textOf(t.status), 'Saved');
  slide(t, 65);
  assert.equal(textOf(t.status), '');
});
