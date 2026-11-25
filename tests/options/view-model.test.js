import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeError } from '../../src/ui/errors.js';
import {
  exportFilename,
  folderRows,
  deleteFolderMessage,
  importSummaryText,
  importPreviewText,
  keptLocalText,
} from '../../src/options/view-model.js';

test('exportFilename uses the local calendar date', () => {
  assert.equal(exportFilename(new Date(2026, 10, 21, 23, 59)), 'xmark-manager-2026-11-21.json');
  assert.equal(exportFilename(new Date(2026, 0, 5)), 'xmark-manager-2026-01-05.json');
});

test('folderRows counts live posts per folder and sorts by name', () => {
  const folders = [
    { id: 'b', name: 'beta' },
    { id: 'a', name: 'Alpha' },
  ];
  const posts = [
    { folder_id: 'a' },
    { folder_id: 'a' },
    { folder_id: null },
    { folder_id: 'gone' },
  ];
  assert.deepEqual(folderRows(folders, posts), {
    rows: [
      { id: 'a', name: 'Alpha', count: 2 },
      { id: 'b', name: 'beta', count: 0 },
    ],
    uncategorised: 1,
  });
});

test('deleteFolderMessage states the count and that posts are kept', () => {
  assert.equal(
    deleteFolderMessage('Reading', 3),
    'Delete "Reading"? Its 3 posts will become Uncategorised. The posts are not deleted.',
  );
  assert.match(deleteFolderMessage('Reading', 1), /Its 1 post will become/);
  assert.match(deleteFolderMessage('Reading', 0), /No posts are in it/);
});

test('importSummaryText', () => {
  assert.equal(
    importSummaryText({ added: 3, updated: 1, removed: 2, unchanged: 12, rejected: 2 }),
    'Import finished: 3 added, 1 updated, 2 removed, 12 unchanged. 2 invalid records were skipped.',
  );
  assert.equal(
    importSummaryText({ added: 0, updated: 0, removed: 0, unchanged: 5 }),
    'Import finished: 0 added, 0 updated, 0 removed, 5 unchanged.',
  );
  assert.match(
    importSummaryText({ added: 0, updated: 0, removed: 0, unchanged: 0, rejected: 1 }),
    /1 invalid record was skipped\./,
  );
});

test('importPreviewText states what will change and that nothing has yet', () => {
  assert.equal(
    importPreviewText({ added: 4, updated: 2, removed: 1, unchanged: 9, rejected: 3 }),
    'This import will add 4, change 2 and remove 1 posts (3 records skipped as invalid). Nothing is changed until you continue.',
  );
  assert.match(
    importPreviewText({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      rejected: 0,
      foldersChanged: 2,
    }),
    /It also changes 2 folders\. Nothing is changed/,
  );
});

test('describeError knows the duplicate folder name code', () => {
  assert.equal(
    describeError({ code: 'FolderNameTakenError' }),
    'You already have a folder with that name.',
  );
});

test('keptLocalText explains why posts were left as they are, and is empty for zero', () => {
  assert.equal(keptLocalText(0), '');
  assert.equal(
    keptLocalText(1),
    '1 post was kept as it is on this device because the file could not prove it is newer.',
  );
  assert.equal(
    keptLocalText(3),
    '3 posts were kept as they are on this device because the file could not prove it is newer.',
  );
  assert.match(
    importPreviewText({ added: 1, updated: 0, removed: 0, unchanged: 0, keptLocal: 2 }),
    /2 posts will be kept as they are on this device because the file could not prove it is newer\./,
  );
  assert.match(
    importSummaryText({ added: 1, updated: 0, removed: 0, unchanged: 0, keptLocal: 2 }),
    /2 posts were kept as they are on this device because the file could not prove it is newer\./,
  );
});
