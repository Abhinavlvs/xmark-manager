# xmark-manager Privacy Policy

Effective date: 2026-11-23

Last updated: 2026-11-25

xmark-manager is a browser extension that saves links to X posts into folders you create. This policy covers the local-only Phase 1 design (version 0.1.0 and later until it is updated).

## The short version

- We collect no data. Nothing you save leaves your device.
- The extension makes no network requests at all, to X or to anyone else.
- There is no account, no login, no sync, no analytics and no telemetry. The developer runs no servers.

## What is stored, and where

Your library is stored in your browser, in the extension's own storage on your device. It contains:

- the canonical link to each post you save,
- the author handle (taken from the post link),
- the folder, tags and notes you choose to add,
- timestamps,
- and, only if you turn on "Save a text snippet with each post", the first 35 to 280 characters of the post's text (you choose the length on the options page; default 280, which is also the maximum). This option is off by default.

Your settings (for example the snippet option and its length) are stored the same way. The extension is not allowed to run in private windows, and on-page clicks there are refused, so nothing is saved from them.

If the stored library cannot be read, the extension keeps the unreadable value as a copy in the same local extension storage, shows a notice, and lets you export or delete that copy. It is never sent anywhere.

## What the extension reads from x.com and twitter.com

The extension adds a Save button to posts on x.com and twitter.com. It reads a post only when you click the Save button on that post (this opens the panel), and only that one post. Nothing is stored until you press Save in the panel. The read covers its link, its author handle, and (if you turned the snippet option on) the first 35 to 280 characters of its text, as many as you chose. If you close the panel without saving, the read has still happened, but only in memory, and nothing is kept.

It does not scan your timeline, crawl pages, or capture posts in bulk. It never reads cookies, login tokens, your account name, avatar, settings, messages or notifications. It never clicks, likes, follows, reposts or posts for you.

When you click the toolbar button, the extension reads the address of the active tab only (no other tab), to offer saving that post. It is not stored or sent.

## Sharing

We do not share, sell or transmit your data, because we never receive it.

## Your controls

On the extension's options page you can:

- export your library to a JSON file,
- import a file (you see what will change before it is applied),
- delete all local data,
- turn the text snippet option on or off and choose its length (35 to 280 characters),
- manage your folders.

Uninstalling the extension removes its stored data. A file you export is yours, and keeping it safe is your responsibility; the extension does not keep track of where you put it.

## A limit you should know about

The on-page panel lives in a closed shadow root and ignores clicks that you did not make. Scripts that X itself loads on the page can still see that the extension added an element and can observe keystrokes typed into the panel. Do not type anything into notes that you would not want a page script to see.

## Children

The extension is not directed at children. It collects nothing from anyone.

## Future changes

Optional sync to your own Google Drive is planned for a later version and does not exist now. It would be off by default and start only after an explicit consent screen. This policy will be updated before any such feature ships. We will change the effective date at the top when this policy changes, and describe the change in the release notes.

## Contact

Questions or requests: open an issue at https://github.com/Abhinavlvs/xmark-manager/issues.
