# Privacy Policy

xmark-manager keeps your data under your control. Phase 1 (this version) is local-only: nothing leaves your device.

- **Local storage:** Your saved posts and folders are stored in your browser using the extension storage API.
- **No network requests:** the extension makes no network requests at all, to X or anyone else. There is no sync, no account and no login.
- **Nothing is sent to the developer.** There are no servers operated by the developer, no analytics, and no telemetry.
- **Permissions:** Access to `x.com` and `twitter.com` is used only to read the post you choose to save.

You can delete your data at any time with "Delete all local data" in the extension's settings, or by uninstalling it. You can also export your library to a file and import it again.

Last updated: 2026-11-25

Contact or issue tracker: https://github.com/Abhinavlvs/xmark-manager/issues

## Details

- **Nothing is collected by the developer.** No data is transmitted to, or stored by, the developer.
- **What is stored:** the canonical post URL, the author handle, your own folder, tags and notes, and timestamps. A post text snippet (the first 35 to 280 characters of the post, you choose; default 280) is saved only if you turn that option on; it is off by default. The length you choose applies to posts you save after choosing it; snippets already saved are not shortened.
- **When the page is read:** It reads a post only when you click the Save button on that post (this opens the panel), and only that one post. Nothing is stored until you press Save in the panel. The extension does not scan timelines, crawl, or bulk-capture, and it never reads cookies, tokens, or your account's name, avatar, settings, messages or notifications. If you close the panel without saving, the read has still happened, but only in memory.
- **Toolbar button:** when you click it, the extension reads the address of the active tab only, to offer saving that post. It is not stored or sent.
- **Private windows:** Firefox and Chrome do not run the extension in private windows (`incognito` is `not_allowed`) and on-page clicks there are refused. Safari can run it there if you allow it, and the extension itself refuses to save (not yet verified on Safari).
- **Uninstalling and exports:** uninstalling removes the stored data. A file you export is yours, and keeping it safe is your responsibility.
- **Children:** the extension is not directed at children and collects nothing.
- **No network requests:** the extension makes no network requests at all, to X or anyone else. Nothing is saved from private windows. Firefox and Chrome do not run the extension in private windows; Safari can run it there if you allow it, and the extension itself refuses to save (not yet verified on Safari).
- **Unreadable data:** if the stored library cannot be read, the extension keeps up to five copies of the unreadable value in the same extension storage on your device (never sent anywhere), shows a notice, and lets you export or discard each copy. A normal Export never includes them, and "Delete all local data" keeps them unless you also tick the option to delete them (uninstalling removes them too).
- **Your controls:** you can export your library, import a file, and delete all local data at any time.

## Roadmap: Phase 2

Optional sync to your own Google Drive is planned for a future version. It would be off by default, use the `drive.file` scope (the extension can only see files it creates), store one JSON file, and start only after an explicit consent screen, with disconnect and delete-copy controls. This policy will be updated before that ships. None of it exists in this version.

## Content script on x.com

The content script adds a Save button next to each post's actions and reads a post only when you click that Save button on that post (this opens the panel), and only that one post. Nothing is stored until you press Save in the panel. Its interface lives in closed shadow roots (the button in the post's action bar, the panel in a separate element appended to the page root while the panel is open) and ignores clicks that were not made by you (script-generated clicks are dropped). Residual risk, stated plainly: scripts that X itself loads on the page can still see the extension's host elements (the button's, and the panel's while it is open, including its position and size, but not its contents because the roots are closed), and they can observe keystrokes typed into the panel, because capture-phase key listeners on the page run before the extension can stop the event. Text-carrying events (input, composition, paste, copy, cut) are stopped at the extension's root so page listeners do not receive them, and the closed root keeps page scripts from reading the fields' values or the post data the extension handles. Do not type anything into the notes that you would not want a page script to be able to observe keystroke by keystroke.
