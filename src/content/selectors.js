/**
 * The ONLY file that knows X's markup.
 *
 * These selectors are fragile by nature: X changes its DOM without notice. When the markup
 * changes, only this file should need to change. Every finder returns null on a mismatch
 * and never throws, so a broken selector means "no button", never a broken page.
 */
(function () {
  const ns = (globalThis.__xmark = globalThis.__xmark || {});

  const selectors = Object.freeze({
    article: 'article[data-testid="tweet"]',
    actionGroup: 'div[role="group"]',
    likeButton: '[data-testid="like"], [data-testid="unlike"]',
    statusLink: 'a[href*="/status/"]',
    time: 'time',
    text: '[data-testid="tweetText"]',
    // Deliberately broad: a too-wide match fails closed ("Could not read this post", nothing
    // saved), while a too-narrow one could save a quoted post under the wrong URL.
    quoteCard: 'div[role="link"], div[tabindex]',
  });

  const isElement = (node) =>
    node !== null &&
    typeof node === 'object' &&
    typeof node.querySelectorAll === 'function' &&
    typeof node.querySelector === 'function';

  const safe = (fn) => (article) => {
    try {
      return isElement(article) ? (fn(article) ?? null) : null;
    } catch {
      return null;
    }
  };

  /** The row of reply/repost/like buttons: the last role=group that holds a like button. */
  const findActionBar = safe((article) => {
    const groups = Array.from(article.querySelectorAll(selectors.actionGroup)).filter((g) =>
      g.querySelector(selectors.likeButton),
    );
    return groups.length ? groups[groups.length - 1] : null;
  });

  /**
   * True when `node` sits inside a quoted post's card rather than the main post. A card is the
   * nearest div[role=link] / div[tabindex] between the node and the article that does not also
   * hold the action bar (the main post's wrapper does).
   */
  function inQuoteCard(node, article) {
    for (let el = node.parentElement; el && el !== article; el = el.parentElement) {
      if (el.matches(selectors.quoteCard) && !findActionBar(el)) return true;
    }
    return false;
  }

  /** Belongs to this article itself, not to a nested article or an anchor above it. */
  const ownedBy = (node, article) =>
    article.contains(node) && node.closest(selectors.article) === article;

  const mainOnly = (article, nodes) =>
    Array.from(nodes).filter((n) => ownedBy(n, article) && !inQuoteCard(n, article));

  /** The permalink: the status anchor around the main post's timestamp (never a quote's). */
  const findStatusLink = safe((article) => {
    for (const time of mainOnly(article, article.querySelectorAll(selectors.time))) {
      const anchor = time.closest('a');
      const href = anchor?.getAttribute('href');
      if (
        typeof href === 'string' &&
        href.includes('/status/') &&
        ownedBy(anchor, article) &&
        !inQuoteCard(anchor, article)
      ) {
        return anchor;
      }
    }
    return null;
  });

  /** The main post's text; null for media-only posts (a quote's text is never returned). */
  const findTextNode = safe((article) => {
    return mainOnly(article, article.querySelectorAll(selectors.text))[0] ?? null;
  });

  ns.selectors = Object.freeze({ ...selectors, findActionBar, findStatusLink, findTextNode });
})();
