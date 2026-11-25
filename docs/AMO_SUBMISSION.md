# Firefox Add-ons (AMO) submission pack, v0.1.0

Paste-ready text for the first listing of xmark-manager on addons.mozilla.org (AMO). Items marked `TODO(owner)` need a value from the owner. Items marked UNCONFIRMED could not be verified from an official page.

## Limits verified from official docs

| Field        | Limit                                    | Source                                                                           |
| ------------ | ---------------------------------------- | -------------------------------------------------------------------------------- |
| Summary      | 250 characters                           | https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/ |
| Description  | no practical limit                       | same page                                                                        |
| Categories   | up to two                                | same page                                                                        |
| Listing icon | 32x32 and 64x64, PNG or JPEG             | same page                                                                        |
| Screenshots  | no practical limit; 1280x800 recommended | same page                                                                        |
| Upload size  | 200 MB (.zip, .xpi, .crx)                | https://extensionworkshop.com/documentation/publish/submitting-an-add-on/        |

## Listing fields

**Name:** xmark-manager

**Summary** (under 250 characters):

> Save X posts into folders you control. Add tags and notes, search your library, export and import it. Everything stays in your browser: no account, no sync, no analytics, no network requests.

(about 190 characters)

**Detailed description:**

```
xmark-manager lets you file posts from X (x.com) into folders you create, so you can find them again.

What it does
- Adds a small Save button next to the actions of each post on x.com. Click it, pick a folder, add tags and a note, and Save.
- Or open the toolbar popup on a post page and save that post from there.
- Browse everything you saved in the popup: search, filter by folder or tag, edit, delete, and undo a delete.
- Manage folders on the options page; the Saved page there shows the whole library on one roomy page.
- Export your library to one JSON file, and import it again (you see what will change before anything is applied).
- Optional, off by default: save the first 35 to 280 characters of a post's text with it (you choose the length; default 280).

What it never does
- It never sends data anywhere. Phase 1 makes no network requests at all, to X or to anyone else.
- It has no account, no sync, no analytics and no telemetry. The developer runs no servers.
- It reads a post only when you click the Save button on that post (this opens the panel), and only that one post. Nothing is stored until you press Save in the panel. It does not scan your timeline, crawl, or bulk-capture.
- It never reads cookies, tokens, or your account's name, avatar, settings, messages or notifications.
- It never clicks, likes, follows, reposts, posts or messages on X for you.
- It saves nothing from private windows.

What is stored (locally, in your browser)
The post link, the author handle, your own folder, tags and notes, and timestamps. A text snippet only if you turn that option on.

Your controls
Export, import, and "Delete all local data" are on the options page. Uninstalling removes everything.

Requires Firefox 140 or newer.

xmark-manager is not affiliated with or endorsed by X Corp. "X" is a trademark of its owner.
```

**Categories (pick up to two):** Bookmarks, Productivity. TODO(owner): confirm both names exist in the AMO category picker when submitting (UNCONFIRMED, not listed in the fetched docs).

**Tags (suggested):** bookmarks, x, twitter, folders, notes, tags, privacy, local-only. TODO(owner): confirm tag availability in the form.

**Homepage URL:** https://github.com/Abhinavlvs/xmark-manager

**Support URL:** https://github.com/Abhinavlvs/xmark-manager/issues

**Privacy policy URL:** https://github.com/Abhinavlvs/xmark-manager/blob/main/PRIVACY.md (same text as `docs/PRIVACY_POLICY_TEXT.md`). The submission guide says to provide a policy if data leaves the device (source below); this extension sends none, but a public policy is still recommended and is required by the Chrome and Apple stores.

**License:** MIT (see `LICENSE`). Choose "MIT License" in the license picker.

**Contributions / donations:** none.

## Permission justifications

Paste into "Notes to reviewer" or any permission field.

- `storage`: stores the user's library (folders, saved post links, tags, notes, settings) in `browser.storage.local` on the device. Nothing is sent anywhere.
- `activeTab`: when the user clicks the toolbar button, the popup reads the URL of the active tab only, to offer saving that post. It does not read other tabs.
- Host permissions `*://x.com/*` and `*://twitter.com/*`: needed only to show the on-page Save button and to read the link of one post when the user clicks Save. The content script does nothing else on these hosts. The extension makes no network requests of its own. The host permissions only allow the content script to run on those pages.
- Nothing else is requested: no `tabs`, `cookies`, `webRequest`, `history`, `scripting`, `<all_urls>`, and no `web_accessible_resources`.

## Data collection declaration

The manifest declares:

```json
"data_collection_permissions": { "required": ["none"] }
```

In the AMO submission form, state that the add-on does not collect or transmit any data. This is accurate because the extension makes no network requests, has no servers, and stores the library only in local extension storage. Mozilla's page describes `none` as declaring that the extension collects or transmits no data, and says new extensions (from 3 November 2025) must use this system. Firefox 140 or newer (desktop) and 142 (Android) support it, which matches our `strict_min_version`.

Source: https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/ . The exact wording of the AMO form question was not visible in the docs: UNCONFIRMED, read it when submitting. Keep this answer consistent with `PRIVACY.md`.

## Notes for reviewers

Paste this block into "Notes to Reviewer".

```
No X account is needed to test.

Quick test without X
1. git clone the repository and run: npm ci && npm run dev
2. As a developer aid only, open http://127.0.0.1:5173/dev/x-fixture.html (default port 5173; set PORT to change). This is a static imitation of X markup that loads the real content scripts with a mock browser API. It makes no request to X.
3. The popup and options pages also run there: /dev/popup.html and /dev/options.html.
4. Unit tests: npm test (Node 20 or newer). Tests use fakes in test-support/ and linkedom; they need no network.
5. Real Firefox smoke test (optional): npm run e2e:firefox (needs geckodriver; see scripts/e2e/README.md).

Source and build
- No bundler, no minification, no transpiler, no obfuscation. The uploaded package is src/ copied by scripts/build.mjs with only manifest.json generated (for Firefox the manifest is src/manifest.json unchanged, re-serialized as JSON; test files and .DS_Store are left out).
- To reproduce the Firefox zip byte for byte: npm ci && npm run package, then use dist/zips/xmark-manager-0.1.0-firefox.zip. The zip writer is deterministic (sorted entries, fixed timestamps).
- Plain JavaScript ES modules.
- Zero runtime dependencies. Dev dependencies only (see package.json).

Content script (src/content, runs only on x.com and twitter.com)
- Classic scripts (not modules), each wrapped in an IIFE, registered on one global object. Order is set in manifest.json.
- src/content/selectors.js is the only file that knows X's markup.
- It appends one host element with a CLOSED shadow root to each post's action bar; the XM Save button lives in that root. The panel opens in its own separate host element with a closed root, appended to the page root only while the panel is open.
- It reads the DOM only inside a click handler, only if event.isTrusted is true, and only for the one post whose button was clicked: post link, author (from the URL), and the first 35 to 280 characters of text (the length the user chose in Options > Privacy; default 280) only if the user turned on the snippet option (off by default). The length reaches the content script only through the reduced GET_SETTINGS answer, and the background cuts the stored text to it again.
- No network access, no remote code, no eval, no innerHTML (textContent only), no cookies or storage reads, no logging of content.
- Known, disclosed limit (policy 6.3.1): scripts that X itself loads on the page can see our host elements and, because they run in the same page, can observe keystrokes typed into the on-page panel (capture-phase listeners run first). The extension sends nothing to any website or server; it only stops text-carrying events at its own closed root. This is stated on the Options Privacy page and in PRIVACY.md.
- It sends only four message types to the background: SAVE_POST, LIST_FOLDERS, GET_SETTINGS and OPEN_FOLDER_SETTINGS (no payload; opens the extension's own options page in a new tab after the user chooses "Add folder…"). The background accepts messages only from this extension (sender.id check) and re-validates every payload.

Other facts
- incognito is "not_allowed": nothing is saved from private windows.
- Phase 1 makes no network requests. Google Drive sync is a planned later phase and no code for it exists.
- gecko id: {6c820dd8-f422-43e5-bb44-e392b7fac38a} (permanent; set in manifest.json).
```

Privacy rules summary for reviewers: see `CLAUDE.md` section "Privacy and platform safety" and `PRIVACY.md`.

## Screenshots

Upload in this order (it tells the story: where it lives, how you save, how you find things, how you stay in control). Any size is accepted; 1280x800 is the recommended display size. Leave out `popup-save`, `popup-folders-filter`, `popup-undo`, `popup-quarantine-notice`, `options-permissions`, `options-about` and `options-mobile`: they repeat the above or show error and edge states.

| File                                          | Caption (TODO(owner): confirm wording)                |
| --------------------------------------------- | ----------------------------------------------------- |
| `docs/screenshots/x-live-button.png`          | The Save button in the action bar of a post on x.com. |
| `docs/screenshots/x-live-panel.png`           | Pick a folder, add tags and a note, then save.        |
| `docs/screenshots/options-saved.png`          | Browse and search everything you saved.               |
| `docs/screenshots/options-saved-filtered.png` | Filter by folder and tag together.                    |
| `docs/screenshots/options-folders.png`        | Create your own folders, free.                        |
| `docs/screenshots/popup-saved.png`            | Quick access from the toolbar.                        |
| `docs/screenshots/options-data.png`           | Export and import: you own your data.                 |
| `docs/screenshots/options-privacy.png`        | Nothing leaves your device.                           |

## Submission checklist

- [x] Mozilla Account and Add-ons Developer Hub account exist (the owner already publishes another add-on).
- [x] Add-on id `{6c820dd8-f422-43e5-bb44-e392b7fac38a}` is set in `src/manifest.json`. It is permanent: never change it, or storage and updates break.
- [x] Version is 0.1.0 in `src/manifest.json`, `package.json` and `package-lock.json`.
- [x] `CHANGELOG.md` heading carries the release date (`## [0.1.0] - 2026-11-21`).
- [ ] `npm test`, `npm run lint`, `npm run build:lint` all pass.
- [ ] `npm run package` creates `dist/zips/xmark-manager-0.1.0-firefox.zip`. Inspect it: only the contents of `src/`, `manifest.json` at the zip root.
- [ ] Screenshots exist (table above); description and summary pasted.
- [x] Privacy policy, support and homepage URLs filled above. `homepage_url` stays absent from the manifest; enter it in the form.
- [ ] `data_collection_permissions` shows `none` in the manifest and in the form.
- [ ] Reviewer notes pasted.
- [ ] Source code question: the code is not minified or obfuscated, so no source package should be needed. The AMO page says source is required when code "might be difficult to read". Answer "No" and say why in the notes. The build only copies src/ and generates the manifest; if a transpiler or bundler is added later, answer "Yes" and upload a source zip.

## First-listing process (verified)

Source: https://extensionworkshop.com/documentation/publish/submitting-an-add-on/

1. Log in to the Add-ons Developer Hub with a Mozilla Account and click "Submit a New Add-on".
2. Choose the channel. "On this site" is the listed channel (AMO shows a listing). "On your own" is unlisted (self-distributed; Mozilla signs the file and you host it). For this project choose listed.
3. Upload the zip and wait for validation. Errors block you; warnings do not.
4. Select compatible platforms (desktop Firefox; `gecko_android` is also set in the manifest, not tested; do not tick Android unless tested).
5. Answer the source code question.
6. On "Describe Add-on", manually enter name, summary, description, license, support details, categories (up to two), and tick the privacy policy box with a policy where applicable.
7. Click "Submit Version".

Manual only: all listing text and screenshots, and uploading each later version through the add-on's AMO page so Firefox sees an update. Later versions can also be uploaded by the manual `deploy-firefox.yml` workflow (AMO API v5, dry run first); see `docs/RELEASING.md`. That automation is not part of this pack.

Review: the publishing overview says Mozilla can review an extension "at any time" and that extensions must be signed to install in release Firefox (https://extensionworkshop.com/documentation/publish/). No review-time figure was stated on the pages fetched: review time is UNCONFIRMED. The "Add-on policies" page (https://extensionworkshop.com/documentation/publish/add-on-policies/) requires the listing to describe what the add-on does and what it transmits, which the description above does.

The page /documentation/publish/add-on-review-process/ returned 404 when checked, so no further review-process detail is cited.
