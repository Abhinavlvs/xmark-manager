import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeClient, RequestError } from '../../src/platform/runtime-client.js';

const client = (reply, incognito = false) => {
  const sent = [];
  const runtime = {
    sendMessage: async (m) => {
      sent.push(m);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { sent, c: createRuntimeClient({ runtime, isIncognito: incognito }) };
};

test('request sends type, payload and incognito flag and unwraps data', async () => {
  const { sent, c } = client({ ok: true, data: [1] }, true);
  assert.deepEqual(await c.request('X', { a: 1 }), [1]);
  assert.deepEqual(sent, [{ type: 'X', payload: { a: 1 }, incognito: true }]);
});

test('request resolves undefined when ok without data', async () => {
  const { c } = client({ ok: true });
  assert.equal(await c.request('X'), undefined);
});

test('request throws RequestError with the error code', async () => {
  const { c } = client({ ok: false, error: 'NotFoundError' });
  await assert.rejects(
    c.request('X'),
    (e) => e instanceof RequestError && e.code === 'NotFoundError',
  );
});

test('request throws on missing or malformed responses', async () => {
  for (const reply of [undefined, null, 'x', {}, { ok: 'yes' }, { ok: false }]) {
    const { c } = client(reply);
    await assert.rejects(
      c.request('X'),
      (e) => e instanceof RequestError && typeof e.code === 'string',
    );
  }
});

test('request wraps transport failures', async () => {
  const { c } = client(new Error('boom'));
  await assert.rejects(
    c.request('X'),
    (e) => e instanceof RequestError && e.code === 'unavailable',
  );
});
