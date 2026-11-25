/** (g) Service worker lifecycle: stop the worker with CDP Target.closeTarget and keep using the extension. */

import { until } from '../chromium-lib.mjs';

export async function run(ctx) {
  const { browser, check, swFile, send, listPosts } = ctx;
  const stop = async () => {
    const w = await browser.findWorker(swFile, 3000);
    if (!w) return null;
    await browser.send('Target.closeTarget', { targetId: w.id });
    const gone = await until(async () => !(await browser.targets()).some((t) => t.id === w.id), {
      timeoutMs: 5000,
    });
    return gone ? w.id : null;
  };
  const save = (n) => send({ type: 'SAVE_POST', payload: { url: `https://x.com/sw/status/${n}` } });

  const countBefore = (await listPosts()).length;
  const killed = await stop();
  check('(g) the service worker was stopped (target closed and gone)', !!killed, killed ?? '');
  const afterKill = await send({ type: 'LIST_POSTS', payload: {} });
  check(
    '(g) the next message wakes a worker and no data was lost',
    afterKill.value?.ok === true && afterKill.value.data.length === countBefore,
    `before=${countBefore} after=${afterKill.value?.data?.length}`,
  );
  const revived = await browser.findWorker(swFile, 5000);
  check(
    '(g) a new worker target exists with a different target id',
    !!revived && revived.id !== killed,
  );

  const s1 = await save(501);
  const stoppedMid = await stop();
  const s2 = await save(502);
  check(
    '(g) saves before and after stopping the worker both succeed',
    s1.value?.ok === true && !!stoppedMid && s2.value?.ok === true,
    JSON.stringify([s1.value?.ok, s2.value?.ok]),
  );
  await stop();
  const posts = await listPosts();
  check(
    '(g) both saves around a worker stop are listed after another stop',
    posts.some((p) => p.url.endsWith('/sw/status/501')) &&
      posts.some((p) => p.url.endsWith('/sw/status/502')) &&
      posts.length === countBefore + 2,
    `count=${posts.length}`,
  );
}
