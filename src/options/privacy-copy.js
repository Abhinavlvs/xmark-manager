/**
 * Plain-language privacy facts for the options page. Each `quote` is a sentence taken verbatim
 * from PRIVACY.md (a test keeps them in sync), so the page never says more than the policy.
 */

export const PRIVACY_FACTS = [
  {
    label: 'Developer',
    text: 'Nothing is collected by the developer. No data is transmitted to, or stored by, the developer.',
    quote:
      'Nothing is collected by the developer. No data is transmitted to, or stored by, the developer.',
  },
  {
    label: 'Stored',
    text: 'The canonical post URL, the author handle, your own folder, tags and notes, and timestamps. A post text snippet (the first 35 to 280 characters of the post, you choose; default 280) is saved only if you turn that option on; it is off by default.',
    quote:
      'the canonical post URL, the author handle, your own folder, tags and notes, and timestamps. A post text snippet (the first 35 to 280 characters of the post, you choose; default 280) is saved only if you turn that option on; it is off by default.',
  },
  {
    label: 'What is read',
    text: "It reads a post only when you click the Save button on that post (this opens the panel), and only that one post. Nothing is stored until you press Save in the panel. The extension does not scan timelines, crawl, or bulk-capture, and it never reads cookies, tokens, or your account's name, avatar, settings, messages or notifications.",
    quote:
      "It reads a post only when you click the Save button on that post (this opens the panel), and only that one post. Nothing is stored until you press Save in the panel. The extension does not scan timelines, crawl, or bulk-capture, and it never reads cookies, tokens, or your account's name, avatar, settings, messages or notifications.",
  },
  {
    label: 'Network',
    text: 'The extension makes no network requests at all, to X or anyone else. Nothing is saved from private windows.',
    quote:
      'the extension makes no network requests at all, to X or anyone else. Nothing is saved from private windows.',
  },
  {
    label: 'Analytics',
    text: 'There are no servers operated by the developer, no analytics, and no telemetry.',
    quote: 'There are no servers operated by the developer, no analytics, and no telemetry.',
  },
];

export const RESIDUAL_RISK =
  "One limit to know about: scripts that X itself loads on the page can still see the extension's host element and can observe keystrokes typed into the on-page panel. Do not type anything into the notes that you would not want a page script to be able to observe keystroke by keystroke. PRIVACY.md has the details.";

export const SNIPPET_EXPLAINER =
  "When this is on, the first 35 to 280 characters (you choose; default 280) of a post's text are saved with it, only when you save from the on-page button. They are stored only in this browser. It is off by default; turning it off stops new snippets from being saved.";
