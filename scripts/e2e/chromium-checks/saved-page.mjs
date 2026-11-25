/** (h) Options > Saved lists the posts the earlier flows saved (real extension page, real worker). */

import { until } from '../chromium-lib.mjs';

export async function run(ctx) {
  const { browser, check, id, listPosts } = ctx;
  const posts = await listPosts();
  const page = await browser.openPage(`chrome-extension://${id}/options/options.html#saved`);
  const text = await until(async () => {
    const t = await page.eval(`document.querySelector('#section-saved')?.innerText ?? ''`);
    return /\d+ posts?/.test(t) ? t : false;
  });
  const authors = [...new Set(posts.map((p) => p.author).filter(Boolean))];
  check(
    '(h) the #saved route renders the saved posts created by the earlier flows',
    posts.length > 0 && !!text && authors.every((a) => text.includes(`@${a}`)),
    `posts=${posts.length} authors=${authors.join(',')} text=${String(text).slice(0, 160)}`,
  );
  check(
    '(h) the Saved page count matches the library',
    !!text && text.includes(`${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`),
    String(text).slice(0, 80),
  );
  await page.close();
}
