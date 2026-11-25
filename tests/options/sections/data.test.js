import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDom,
  fakeClient,
  click,
  fire,
  typeInto,
  settle,
  textOf,
  trackFocus,
} from '../../../test-support/dom.js';
import { MSG } from '../../../src/platform/messages.js';
import { RequestError } from '../../../src/platform/runtime-client.js';
import { createDataSection } from '../../../src/options/sections/data.js';

const NOW = new Date(2026, 10, 21, 9, 0);

function setup(routes = {}) {
  const ctx = makeDom();
  const focused = trackFocus(ctx.window);
  const said = [];
  const downloads = [];
  const client = fakeClient({ [MSG.EXPORT_DATA]: '{"version":1}', ...routes });
  const section = createDataSection(ctx.dom, {
    client,
    announce: (t) => said.push(t),
    now: () => NOW,
    createDownload: (file) => downloads.push(file),
  });
  ctx.document.body.append(section.element);
  const btn = (label) =>
    [...section.element.querySelectorAll('button')].find((b) => b.textContent === label);
  const fileInput = section.element.querySelector('input[type="file"]');
  const pick = async (file) => {
    Object.defineProperty(fileInput, 'files', { value: file ? [file] : [], configurable: true });
    fire(ctx.window, fileInput, 'change');
    await settle();
  };
  return { ...ctx, focused, said, downloads, client, section, btn, fileInput, pick };
}
const file = (text, size = text.length) => ({ size, text: async () => text });

test('export downloads the library under a dated file name', async () => {
  const { window, btn, downloads, said } = setup();
  click(window, btn('Export library'));
  await settle();
  assert.deepEqual(downloads, [
    { filename: 'xmark-manager-2026-11-21.json', text: '{"version":1}', mime: 'application/json' },
  ]);
  assert.deepEqual(said, ['Export ready. Your download should start now.']);
});

test('export failure shows an alert and downloads nothing', async () => {
  const { window, btn, downloads, section } = setup({
    [MSG.EXPORT_DATA]: () => {
      throw new RequestError('internal_error');
    },
  });
  click(window, btn('Export library'));
  await settle();
  assert.deepEqual(downloads, []);
  assert.equal(section.element.querySelector('.data-error').hidden, false);
});

test('Import opens the file chooser; the input only accepts JSON', () => {
  const { window, btn, fileInput } = setup();
  let opened = 0;
  fileInput.click = () => (opened += 1);
  click(window, btn('Import library'));
  assert.equal(opened, 1);
  assert.match(fileInput.getAttribute('accept'), /json/);
});

const PREVIEW = { added: 3, updated: 1, removed: 2, unchanged: 12, rejected: 2, foldersChanged: 0 };

test('import first previews (dryRun), asks inline, and changes nothing until Continue', async () => {
  const { window, pick, client, said, section, btn, focused } = setup({
    [MSG.IMPORT_DATA]: () => ({ ...PREVIEW }),
  });
  await pick(file('{"version":1,"folders":[],"posts":[]}'));
  const imports = () => client.calls.filter((c) => c.type === MSG.IMPORT_DATA);
  assert.deepEqual(
    imports().map((c) => c.payload.dryRun),
    [true],
  );
  const panel = section.element.querySelector('.import-panel');
  assert.equal(panel.hidden, false);
  assert.match(
    textOf(panel),
    /This import will add 3, change 1 and remove 2 posts \(2 records skipped as invalid\)\. Nothing is changed until you continue\./,
  );
  assert.equal(panel.classList.contains('confirm-danger'), true);
  assert.equal(focused.at(-1).textContent, 'Cancel');
  click(window, btn('Continue'));
  await settle();
  assert.deepEqual(
    imports().map((c) => c.payload.dryRun),
    [true, undefined],
  );
  assert.equal(imports()[1].payload.text, imports()[0].payload.text);
  const expected =
    'Import finished: 3 added, 1 updated, 2 removed, 12 unchanged. 2 invalid records were skipped.';
  assert.equal(textOf(section.element.querySelector('.import-result')), expected);
  assert.deepEqual(said, [expected]);
});

test('without removals the preview is not styled as dangerous; Cancel imports nothing', async () => {
  const { window, pick, client, section, btn } = setup({
    [MSG.IMPORT_DATA]: () => ({ ...PREVIEW, removed: 0 }),
  });
  await pick(file('{}'));
  const panel = section.element.querySelector('.import-panel');
  assert.equal(panel.classList.contains('confirm-danger'), false);
  click(window, btn('Cancel'));
  await settle();
  assert.equal(client.calls.filter((c) => c.type === MSG.IMPORT_DATA).length, 1);
  assert.equal(panel.hidden, true);
});

test('a file that changes nothing says so without asking', async () => {
  const { pick, section } = setup({
    [MSG.IMPORT_DATA]: () => ({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 7,
      rejected: 0,
      foldersChanged: 0,
    }),
  });
  await pick(file('{}'));
  assert.equal(section.element.querySelector('.import-panel').hidden, true);
  assert.match(textOf(section.element.querySelector('.import-result')), /Nothing to change/);
});

test('files over 25 MB are refused before reading', async () => {
  const { pick, client, section } = setup();
  await pick(file('x', 25 * 1024 * 1024 + 1));
  assert.equal(
    client.calls.some((c) => c.type === MSG.IMPORT_DATA),
    false,
  );
  assert.match(section.element.querySelector('.data-error').textContent, /25 MB/);
});

test('export and import buttons are busy and cannot start twice while a request runs', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { window, btn, client } = setup({ [MSG.EXPORT_DATA]: () => gate.then(() => '{}') });
  const exportBtn = btn('Export library');
  click(window, exportBtn);
  click(window, exportBtn);
  assert.equal(exportBtn.disabled, true);
  assert.equal(exportBtn.getAttribute('aria-busy'), 'true');
  assert.equal(btn('Import library').disabled, true);
  release();
  await settle();
  assert.equal(client.calls.filter((c) => c.type === MSG.EXPORT_DATA).length, 1);
  assert.equal(exportBtn.disabled, false);
  assert.equal(exportBtn.getAttribute('aria-busy'), null);
});

test('an unusually large export still downloads but warns; a small one does not', async () => {
  for (const [size, warned] of [
    [50, true],
    [5, false],
  ]) {
    const ctx = makeDom();
    const downloads = [];
    const section = createDataSection(ctx.dom, {
      client: fakeClient({ [MSG.EXPORT_DATA]: 'x'.repeat(size) }),
      announce: () => {},
      now: () => NOW,
      createDownload: (f) => downloads.push(f),
      exportWarnChars: 20,
    });
    ctx.document.body.append(section.element);
    const button = [...section.element.querySelectorAll('button')].find(
      (b) => b.textContent === 'Export library',
    );
    click(ctx.window, button);
    await settle();
    const warning = section.element.querySelector('.export-warning');
    assert.equal(downloads.length, 1);
    assert.equal(warning.hidden, !warned);
    if (warned) assert.match(warning.textContent, /unusually large.*consider deleting old posts/);
  }
});

test('an invalid export file shows the specific message', async () => {
  const { pick, section } = setup({
    [MSG.IMPORT_DATA]: () => {
      throw new RequestError('InvalidImportError');
    },
  });
  await pick(file('nope'));
  assert.match(
    section.element.querySelector('.data-error').textContent,
    /not a valid xmark-manager export/,
  );
});

test('cancelling the file chooser does nothing', async () => {
  const { pick, client } = setup();
  await pick(null);
  assert.equal(client.calls.length, 0);
});

test('delete all local data requires typing DELETE', async () => {
  const { window, btn, client, said, section } = setup({ [MSG.DELETE_ALL_DATA]: undefined });
  click(window, btn('Delete all local data'));
  await settle();
  const panel = section.element.querySelector('.delete-all-panel');
  assert.equal(panel.hidden, false);
  assert.match(panel.textContent, /cannot be undone/);
  const confirm = [...panel.querySelectorAll('button')].find(
    (b) => b.textContent === 'Delete everything',
  );
  click(window, confirm);
  await settle();
  assert.equal(
    client.calls.some((c) => c.type === MSG.DELETE_ALL_DATA),
    false,
  );
  typeInto(window, panel.querySelector('input'), 'DELETE');
  click(window, confirm);
  await settle();
  assert.equal(
    client.calls.some((c) => c.type === MSG.DELETE_ALL_DATA),
    true,
  );
  assert.deepEqual(said, ['All local data was deleted.']);
  assert.equal(section.element.querySelector('.check-row').hidden, true, 'no copies, no checkbox');
  assert.deepEqual(
    client.calls.find((c) => c.type === MSG.DELETE_ALL_DATA).payload,
    { discardCopy: false },
    'the kept copies stay unless the user ticks the box',
  );
});

test('explains that sync is planned and that nothing connects to Google now', () => {
  const { section } = setup();
  const note = textOf(section.element.querySelector('.sync-note'));
  assert.match(note, /Optional sync to your own Google Drive is planned for a future version/);
  assert.match(note, /use Export and Import/);
  assert.equal(
    [...section.element.querySelectorAll('button')].some((b) =>
      /connect|google/i.test(b.textContent),
    ),
    false,
  );
});

test('a full library during the real import shows the storage text in the confirmation', async () => {
  let dry = true;
  const { window, pick, btn, section } = setup({
    [MSG.IMPORT_DATA]: (payload) => {
      if (payload.dryRun) return { added: 1, updated: 0, removed: 0, unchanged: 0 };
      dry = false;
      throw new RequestError('storage_full');
    },
  });
  await pick(file('{"version":1}'));
  click(window, btn('Continue'));
  await settle();
  assert.equal(dry, false);
  const alert = section.element.querySelector('.import-panel [role="alert"]');
  assert.match(alert.textContent, /library may be full.*Options > Data/);
});

test('a file whose only effect is rejected records says no valid records were found', async () => {
  const { pick, section } = setup({
    [MSG.IMPORT_DATA]: () => ({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      rejected: 3,
      valid: 0,
      foldersChanged: 0,
    }),
  });
  await pick(file('{}'));
  assert.equal(section.element.querySelector('.import-panel').hidden, true);
  const text = textOf(section.element.querySelector('.import-result'));
  assert.match(text, /No valid records were found in that file\./);
  assert.doesNotMatch(text, /Nothing to change/);
});

test('valid records that are all unchanged still say nothing to change, even with some rejected', async () => {
  const { pick, section } = setup({
    [MSG.IMPORT_DATA]: () => ({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 2,
      rejected: 1,
      valid: 2,
      foldersChanged: 0,
    }),
  });
  await pick(file('{}'));
  const text = textOf(section.element.querySelector('.import-result'));
  assert.match(text, /Nothing to change/);
  assert.match(text, /1 invalid record was skipped/);
});

test('a second file pick while Continue is running cannot replace the pending file', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { window, pick, btn, client } = setup({
    [MSG.IMPORT_DATA]: (payload) =>
      payload.dryRun ? PREVIEW : gate.then(() => ({ ...PREVIEW, rejected: 0 })),
  });
  await pick(file('FIRST'));
  click(window, btn('Continue'));
  await pick(file('SECOND'));
  release();
  await settle();
  const imports = client.calls.filter((c) => c.type === MSG.IMPORT_DATA);
  assert.deepEqual(
    imports.map((c) => [c.payload.text, c.payload.dryRun === true]),
    [
      ['FIRST', true],
      ['FIRST', false],
    ],
    'the second file was never even previewed',
  );
});

test('with copies the box appears; unticked they stay, ticked they go; card and notice refresh', async () => {
  for (const tick of [false, true]) {
    let notices = 0;
    const ctx = makeDom();
    const copies = [{ n: 1, at: '2026-11-21T10:00:00.000Z', reason: 'not_object', bytes: 5 }];
    const said = [];
    const client = fakeClient({
      [MSG.DELETE_ALL_DATA]: undefined,
      [MSG.GET_STORAGE_STATUS]: { state: 'quarantined', reason: 'not_object', copies },
    });
    const section = createDataSection(ctx.dom, {
      client,
      announce: (t) => said.push(t),
      now: () => NOW,
      createDownload: () => {},
      onQuarantineChange: () => (notices += 1),
    });
    ctx.document.body.append(section.element);
    await section.load();
    const box = section.element.querySelector('.check-row');
    assert.equal(box.hidden, false);
    const panel = section.element.querySelector('.delete-all-panel');
    const find = (label) =>
      [...section.element.querySelectorAll('button')].find((b) => b.textContent === label);
    click(ctx.window, find('Delete all local data'));
    await settle();
    section.element.querySelector('#delete-copy').checked = tick;
    typeInto(ctx.window, panel.querySelector('input'), 'DELETE');
    click(ctx.window, find('Delete everything'));
    await settle();
    assert.deepEqual(client.calls.find((c) => c.type === MSG.DELETE_ALL_DATA).payload, {
      discardCopy: tick,
    });
    assert.equal(notices, 1);
    assert.match(
      said.at(-1),
      tick ? /^All local data was deleted\.$/ : /copies stay on this device/,
    );
    assert.equal(client.calls.filter((c) => c.type === MSG.GET_STORAGE_STATUS).length, 3);
  }
});

test('a file whose only conflicts are kept local says so in the result', async () => {
  const { pick, section } = setup({
    [MSG.IMPORT_DATA]: () => ({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 2,
      rejected: 0,
      valid: 2,
      foldersChanged: 0,
      keptLocal: 2,
    }),
  });
  await pick(file('{}'));
  const text = textOf(section.element.querySelector('.import-result'));
  assert.match(
    text,
    /2 posts were kept as they are on this device because the file could not prove it is newer\./,
  );
  assert.doesNotMatch(text, /Nothing to change/);
});

test('kept posts and folders are both reported, and the preview mentions them', async () => {
  const { pick, section } = setup({
    [MSG.IMPORT_DATA]: (p) => ({
      added: p.dryRun ? 1 : 1,
      updated: 0,
      removed: 0,
      unchanged: 0,
      rejected: 0,
      valid: 3,
      foldersChanged: 0,
      keptLocal: 1,
      keptLocalFolders: 2,
    }),
  });
  await pick(file('{}'));
  assert.match(
    textOf(section.element.querySelector('.import-panel')),
    /1 post and 2 folders will be kept as they are on this device because the file could not prove it is newer\./,
  );
});

async function deleteAllText(status) {
  const { section } = setup({ [MSG.GET_STORAGE_STATUS]: status });
  await section.load();
  return textOf(section.element.querySelector('.delete-all-panel'));
}
const aCopy = { n: 1, at: '2026-11-21T10:00:00.000Z', reason: 'not_object', bytes: 9 };

test('the delete-all text mentions kept copies only when copies exist', async () => {
  assert.doesNotMatch(await deleteAllText({ state: 'ok' }), /cop(y|ies)/);
  assert.match(
    await deleteAllText({ state: 'quarantined', copies: [aCopy] }),
    /Kept unreadable copies stay unless you tick the box/,
  );
});

test('in the unreadable state the delete-all text warns that the uncopied value is deleted', async () => {
  const text = await deleteAllText({ state: 'storage_unreadable', copies: [aCopy] });
  assert.match(text, /unreadable library value has no copy and will be deleted/);
  assert.match(text, /Kept unreadable copies stay unless you tick the box/);
  const none = await deleteAllText({ state: 'storage_unreadable', copies: [] });
  assert.match(none, /unreadable library value has no copy and will be deleted/);
  assert.doesNotMatch(none, /Kept unreadable copies/);
});

test('the delete-all text is computed when the panel opens, from the current state', async () => {
  let status = { state: 'ok' };
  const { window, btn, section } = setup({ [MSG.GET_STORAGE_STATUS]: () => status });
  await section.load();
  const panel = section.element.querySelector('.delete-all-panel');
  assert.doesNotMatch(textOf(panel), /cop(y|ies)/);
  status = { state: 'storage_unreadable', copies: [aCopy] }; // changed after the last refresh
  click(window, btn('Delete all local data'));
  await settle();
  assert.match(textOf(panel), /has no copy and will be deleted/);
  assert.equal(panel.hidden, false);
});

test('a refused delete-all explains that a copy slot must be freed', async () => {
  const { window, btn, section } = setup({
    [MSG.GET_STORAGE_STATUS]: { state: 'ok' },
    [MSG.DELETE_ALL_DATA]: () => {
      throw new RequestError('storage_unreadable');
    },
  });
  await section.load();
  click(window, btn('Delete all local data'));
  await settle();
  const panel = section.element.querySelector('.delete-all-panel');
  typeInto(window, panel.querySelector('input'), 'DELETE');
  click(window, btn('Delete everything'));
  await settle();
  assert.match(textOf(panel.querySelector('[role="alert"]')), /Discard a copy first/);
});
