import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, resetContent } from '../../test-support/content.js';
import { MSG } from '../../src/platform/messages.js';

afterEach(resetContent);

test('content message constants match src/platform/messages.js', async () => {
  const { xmark } = await loadContent(['messages.js']);
  assert.deepEqual(Object.keys(xmark.MSG).sort(), [
    'GET_SETTINGS',
    'LIST_FOLDERS',
    'OPEN_FOLDER_SETTINGS',
    'SAVE_POST',
  ]);
  for (const [key, value] of Object.entries(xmark.MSG)) assert.equal(value, MSG[key], key);
  assert.ok(Object.isFrozen(xmark.MSG));
});
