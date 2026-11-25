# Chrome Web Store listing pack

Paste-ready text for the first listing of xmark-manager on the Chrome Web Store. Items marked `TODO(owner)` need a value from the owner. Items marked UNCONFIRMED could not be verified from an official page fetched while writing this pack. Structure follows `docs/AMO_SUBMISSION.md`.

Build status: `npm run build` produces `dist/chrome` and `npm run package` the zip. The bundle exists and is unit-tested. It has NOT yet been run in real branded Chrome by the maintainers. It passes the real Chrome for Testing 158 end-to-end checks (`npm run e2e:chrome`, `npm run e2e:chrome:persistence`; see `scripts/e2e/README.md`). The Chrome manifest has a module service worker, `minimum_chrome_version` "98", PNG icons and `incognito: "not_allowed"`. See "Known gaps before upload".

## Limits verified from official docs

| Field                  | Limit                                                       | Source                                                                      |
| ---------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| Manifest `name`        | 75 characters                                               | https://developer.chrome.com/docs/extensions/reference/manifest/name        |
| Manifest `description` | 132 characters, plain text                                  | https://developer.chrome.com/docs/extensions/reference/manifest/description |
| Detailed description   | no character limit stated; no keyword spam                  | https://developer.chrome.com/docs/webstore/cws-dashboard-listing            |
| Store icon             | 128x128 PNG, 96x96 artwork, 16 px transparent padding       | https://developer.chrome.com/docs/webstore/images                           |
| Screenshots            | 1280x800 (preferred) or 640x400; 1 to 5; square, no padding | same page                                                                   |
| Small promo tile       | 440x280, one, optional                                      | same page                                                                   |
| Marquee promo          | 1400x560, one, optional (needed to be featured in marquee)  | same page                                                                   |

The dashboard listing page does not state a limit for a separate "summary" field. The manifest `description` is capped at 132 characters. Whether the store summary is taken from it: UNCONFIRMED. Keep the summary at or under 132 characters and the two will agree either way.

## Listing fields

**Item name:** xmark-manager (13 characters).

**Summary** (132 characters or fewer; also use it as the manifest `description`, the current value "Save X posts into folders you control." is 38 characters and fine):

> Save X posts into folders you control. Tags, notes, search, export and import. Everything stays in your browser.

(112 characters)

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
- It never sends data anywhere. This version makes no network requests at all, to X or to anyone else.
- It has no account, no sync, no analytics and no telemetry. The developer runs no servers.
- It reads a post only when you click the Save button on that post (this opens the panel), and only that one post. Nothing is stored until you press Save in the panel. It does not scan your timeline, crawl, or bulk-capture.
- It never reads cookies, tokens, or your account's name, avatar, settings, messages or notifications.
- It never clicks, likes, follows, reposts, posts or messages on X for you.
- It saves nothing from private windows.

What is stored (locally, in your browser)
The post link, the author handle, your own folder, tags and notes, and timestamps. A text snippet only if you turn that option on.

Your controls
Export, import, and "Delete all local data" are on the options page. Uninstalling removes everything.

xmark-manager is an independent project. It is not affiliated with, endorsed by or sponsored by X Corp. "X" is a trademark of its owner.
```

Notes on the text: it makes no claim about ratings, awards or other products, and repeats no keyword (the policy flags repeating one keyword more than 5 times as spam, https://developer.chrome.com/docs/webstore/program-policies/policies). Do not add "Twitter" keyword lists. The word "X" appears often because it is the site's name; keep it descriptive. Add "Requires Chrome 98 or newer" if you want a requirement line.

**Category:** a primary category is required. The category list was not on the fetched pages, so the choice is UNCONFIRMED. Likely candidates: Productivity. TODO(owner): pick from the dashboard dropdown.

**Language:** English. The page says language is set so users can search in it (https://developer.chrome.com/docs/webstore/cws-dashboard-listing).

**Homepage URL:** https://github.com/Abhinavlvs/xmark-manager

**Support URL:** https://github.com/Abhinavlvs/xmark-manager/issues

**Privacy policy URL:** https://github.com/Abhinavlvs/xmark-manager/blob/main/PRIVACY.md (same text as `docs/PRIVACY_POLICY_TEXT.md`).

## Single purpose statement

Policy summary (https://developer.chrome.com/docs/webstore/program-policies/policies): an extension "must have a single purpose that is narrow and easy to understand". The dashboard asks for a single purpose description so reviewers see the focus (https://developer.chrome.com/docs/webstore/cws-dashboard-privacy). No required wording was found.

Paste:

```
Save X (x.com) posts into folders the user controls, stored locally on the device.
```

All features serve it: the Save button and popup save a post, the Saved list and search find it, folders, tags and notes organise it, export, import and delete-all manage the stored library. Nothing unrelated (no theme, no search override, no analytics) is included.

## Permission justifications

The dashboard lists every permission in the uploaded manifest with a justification field (https://developer.chrome.com/docs/webstore/cws-dashboard-privacy). Policy: request "the narrowest permissions necessary" and none for future features (policies page above). Paste each:

- `storage`:

  ```
  Stores the user's library (folders, saved post links, author handles, tags, notes, settings) in chrome.storage.local on the device. Nothing is sent anywhere.
  ```

- `activeTab`:

  ```
  When the user clicks the toolbar button, the popup reads the URL of the active tab only, to offer saving that post. It does not read other tabs and runs only on that click.
  ```

- Host permission `*://x.com/*` and `*://twitter.com/*`:

  ```
  Needed to run the content script on x.com and twitter.com, which adds a Save button next to each post's actions. When the user clicks that button on one post, the script reads that post's link, its author handle (taken from the link) and, only if the user turned on the snippet option (off by default), the first 35 to 280 characters of its text (the user chooses the length; default 280). It reads nothing at any other time. twitter.com is included because X links and old bookmarks still use that domain. The extension makes no network requests of its own.
  ```

Nothing else is requested: no `tabs`, `cookies`, `webRequest`, `history`, `scripting`, `<all_urls>`, and no `web_accessible_resources`. Today's manifest matches this list (`"permissions": ["storage", "activeTab"]`, two hosts).

Risk to watch: the justification for `activeTab` next to broad host permission may prompt a reviewer question, because the popup could in principle use the host permission instead. Answer if asked: the popup reads only the active tab URL via the toolbar click, which `activeTab` grants without any tabs permission. UNCONFIRMED whether a Chrome build can drop `activeTab` and read the URL through the host permission; do not change permissions without the build owner.

## Privacy practices tab

Source: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy . That page describes two groups of checkboxes (data types collected, then certifications) but does not list the exact category names or the exact certification wording. The names below are therefore UNCONFIRMED; read the live form and answer the same way.

| Question                                  | Answer                                                                                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single purpose description                | Text above                                                                                                                                                                                           |
| Permission justifications                 | Text above                                                                                                                                                                                           |
| Remote code                               | "No." MV3 does not allow remotely hosted files and the extension loads none. The page says to choose "No" in that case.                                                                              |
| Data usage: types of user data collected  | Tick nothing. The extension transmits no data and the developer receives none. Keep this consistent with `PRIVACY.md`.                                                                               |
| Certifications (limited use, disclosures) | Tick all that the form shows and that are true. All are true as written because no data is collected, sold, used for ads or credit decisions, or read by humans. Read each statement before ticking. |
| Privacy policy URL                        | https://github.com/Abhinavlvs/xmark-manager/blob/main/PRIVACY.md                                                                                                                                     |

Think carefully about one point before ticking "no data collected". The Chrome policy treats browsing activity as user data, and the extension does read a post's link and author when the user clicks Save. That data is stored only on the user's device and is never transmitted. This pack assumes the form's "collected" means leaves the device. The Chrome pages fetched do not define the term: UNCONFIRMED. If the form defines it more broadly (for example, any handling of web history or website content), disclose "website content" and "web history" as used only for the single purpose, never transferred, and keep the policy text in line. Policy also says the product's website must carry a statement that data use complies with Limited Use (policies page above). Add one sentence to the privacy policy page: "The use of information received by this extension complies with the Chrome Web Store User Data Policy, including the Limited Use requirements." (wording UNCONFIRMED; check the User Data FAQ). TODO(owner).

## Assets

| Asset            | Requirement (https://developer.chrome.com/docs/webstore/images)                             | What exists in this repo                                                    | Still to create                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Store icon       | 128x128 PNG, 96x96 art, 16 px transparent padding, works on light and dark, no border       | `dist/chrome/icons/icon-128.png` (also 16, 32, 48; white monogram on black) | Check it has 96x96 artwork inside 16 px transparent padding and no border; the build icon is not confirmed to meet that |
| Screenshots      | 1280x800 preferred or 640x400; 1 to 5; full bleed square corners; all downscaled to 640x400 | 15 PNGs in `docs/screenshots/`, all 1280x800 (store size)                   | pick 1 to 5 of them (see below)                                                                                         |
| Small promo tile | 440x280, optional; without one the item is shown after items that have one                  | none                                                                        | 440x280 tile (optional but recommended)                                                                                 |
| Marquee promo    | 1400x560, optional                                                                          | none                                                                        | Optional                                                                                                                |

Suggested screenshot set (all already 1280x800), in this order: `x-live-button.png` (Save button on a post), `x-live-panel.png` (folder, tags, note), `options-saved.png` (library with search and filters), `options-folders.png` (folders), `options-privacy.png` (nothing leaves the device). The first two are real captures of a public post on x.com; the rest use invented data and say so in `docs/SCREENSHOTS.md`. Policy requires metadata, icon and screenshots to be "accurate, complete, and up to date".

Suggested captions (TODO(owner): confirm): "Save button next to a post's actions", "Pick a folder, add tags and a note", "Search and filter your saved posts", "Create and manage folders", "Nothing leaves your device".

## Distribution tab

Source: https://developer.chrome.com/docs/webstore/cws-dashboard-distribution

- **Visibility:** Public (everyone can find and install), Unlisted (anyone with the link) or Private (trusted testers or groups). All three go through the same review and have the same policy requirements. Recommended path: first upload as Private or Unlisted to test the installed build with a few people, then switch to Public. TODO(owner): choose.
- **Regions:** "All regions" is the default and fits this extension (no region-specific behaviour). Exclude regions only if the owner has a legal reason. TODO(owner).
- **Pricing:** free, no in-app purchases. UNCONFIRMED where the dashboard sets this; the distribution page says it covers "whether the item is paid" (https://developer.chrome.com/docs/webstore/publish).
- **Publish timing:** after review you can publish automatically, or uncheck the box to publish manually; you then have up to 30 days before the submission reverts to a draft (https://developer.chrome.com/docs/webstore/publish).

## Test instructions tab and reviewer notes

The Test instructions tab is only for items that need restricted credentials or a paid account, and "is not required for publishing" (https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions). This extension needs no credentials. Still, reviewers need to know how to see it work on a third-party site, so paste this block into the field (or into any notes field) anyway:

```
No account or credentials are needed from us. The extension works on any public X post page.

How to test
1. Install the extension. Open any public post page on https://x.com (a URL like https://x.com/<user>/status/<id>). You may need to be logged in to X to view posts: use any account you have; the extension never reads or uses your account.
2. Click the toolbar icon. The popup shows the post link and author. Choose a folder, add tags and a note, click "Save post". It shows "Saved to your library".
3. Scroll the feed or a post page. A small Save button appears next to the actions of each post. Click it on one post: a panel opens. Pick a folder and press Save. Nothing is stored until Save is pressed.
4. Open the popup, Saved tab: the post is listed with search and folder and tag filters. Delete shows an Undo.
5. Open the options page (extension details > Extension options): Saved (the whole library), Folders, Data (export, import, "Delete all local data"), Privacy, Permissions, About.

What it does not do
- It never automates X. It does not click, like, follow, repost, post or message.
- It reads a post only on the user's click on the Save button, and only that one post. It does not scan the timeline or crawl.
- It reads no cookies, tokens, or account name, avatar, settings, messages or notifications.
- It makes no network requests and sends no data anywhere. There is no remote code (MV3, no eval, no innerHTML).
- Private (incognito) windows are not allowed.

Permissions: storage, activeTab, and hosts x.com and twitter.com only.
Source: plain JavaScript, no bundler, no minification, no obfuscation. Repository: https://github.com/Abhinavlvs/xmark-manager.
```

Honest caveat: viewing posts on X can need a logged-in X account, depending on X's current rules. This is not verified here (UNCONFIRMED). If a reviewer cannot see a post page without logging in, the note above tells them to use any account. Do not supply an owner account's credentials.

## Remote code

Answer "No, I am not using remote code." The extension uses no remotely hosted files, `eval` or `innerHTML`, and MV3 forbids remotely hosted code (https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).

## Policy compliance and where the risk is

Sources: https://developer.chrome.com/docs/webstore/program-policies/policies (sections quoted by name below), https://developer.chrome.com/docs/webstore/review-process .

| Policy                                      | How xmark-manager complies                                                                                                                                                                                                                                                          | Risk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impersonation and IP                        | Policy bars implying a product is "authorized by, endorsed by, or produced by another company" and infringing trademarks. The listing says plainly it is unaffiliated and not endorsed. Icon is the owner's original "XM" monogram, not X's logo. No X bird or X logo in any asset. | Medium. The name contains "x" and the product works only on X. The trademark is X Corp.'s; a reviewer or the rights holder may judge "xmark" as too close. The XM monogram is an original design by the owner and the "X" is part of the letters XM. A reviewer might still see the crossing as echoing X's logo. Mitigations: the unaffiliated statement in the description, original geometry, no X branding in screenshots or promo images, and never using the word "Twitter" as a hook. |
| Spam and Placement (keyword spam, metadata) | Description is plain, no keyword lists, "X" used only as the site name, no testimonials, no ratings claims.                                                                                                                                                                         | Low. Do not add "twitter, tweet, bookmark" keyword lists. Screenshots must match the real UI.                                                                                                                                                                                                                                                                                                                                                                                                |
| Use of permissions                          | Only `storage`, `activeTab` and two hosts; no future-proofing; each justified above.                                                                                                                                                                                                | Low to medium. Two named hosts are not broad. A reviewer may still ask why `twitter.com` is included (answer given above).                                                                                                                                                                                                                                                                                                                                                                   |
| Minimum functionality                       | Real working features: save, folders, tags, notes, search, export, import, undo. Not a link launcher.                                                                                                                                                                               | Low.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Deceptive installation                      | Listing states exactly what it does. No bundling, no unrelated actions required, no pre-install ads.                                                                                                                                                                                | Low.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| User data and Limited use                   | Collects nothing; a privacy policy URL will be given.                                                                                                                                                                                                                               | Medium until the policy URL is live and the Privacy tab answers agree with it. Mismatch between policy, tab and behaviour is the easy way to fail.                                                                                                                                                                                                                                                                                                                                           |
| Single purpose                              | Stated above; all features serve it.                                                                                                                                                                                                                                                | Low.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

What commonly lengthens review (https://developer.chrome.com/docs/webstore/review-process): new developers or new extensions, dangerous or broad host permissions (`<all_urls>`, `*://*/*`), sensitive permissions with hosts, large or hard-to-review code, and previous rejection. This extension requests none of the broad ones. It is a new developer's first item, which can still take longer.

Review timing: "most extensions are reviewed within a few days", can take up to a few weeks, and the page says to contact developer support if pending more than three weeks. A rejection leaves a live listing unchanged. Source: review-process page. The page lists no specific common rejection reasons.

## Known gaps before upload

- Chrome icons are PNG (16, 32, 48, 128 in `dist/chrome/icons`, white monogram on black). SVG icons are not used in the Chrome bundle. Whether the 128 px file meets the store's 96x96 art plus 16 px padding rule has not been checked.
- Minimum Chrome version is 98 (`minimum_chrome_version` in the built manifest). README "Supported browsers" gives the reason: `structuredClone` (Chrome 98) is the highest "first supported" version of everything the shipped code needs. State "Chrome 98 or newer" in the description if you want.
- `incognito: "not_allowed"` is kept in the Chrome manifest, so Chrome should not run the extension in private windows (README cites Chrome docs, available since Chrome 47; not independently fetched here). Not yet observed in real Chrome.
- The popup's reading of the active tab URL and the content script's behaviour have not been run in real Chrome by this pack or, yet, by the maintainers (a Chrome-for-Testing e2e is in progress). Run `docs/MANUAL_QA.md` Part B first.

## Submission checklist

- [ ] Developer account registered at the Chrome Web Store, developer agreement accepted, one-time registration fee paid. The register page says there is a fee but not the amount: UNCONFIRMED (https://developer.chrome.com/docs/webstore/register). Check the dashboard before paying.
- [ ] Developer email verified. The page says verification is required for a new account and that the register email cannot be changed later (https://developer.chrome.com/docs/webstore/set-up-account , /register).
- [ ] 2-step verification on the Google account: not mentioned on any page fetched, UNCONFIRMED. Turn it on anyway.
- [ ] Your country or region must be on the supported list (register page).
- [ ] Chrome build exists, passes `docs/MANUAL_QA.md` Part B; zip has `manifest.json` at its root; version bumped.
- [ ] Privacy policy page live; URL pasted. Homepage and support URLs filled.
- [ ] Icon PNG 128x128 and 1 to 5 screenshots at 1280x800 (or 640x400) ready; optional 440x280 tile.
- [ ] Description, summary, category, language, single purpose, permission justifications, remote code "No", data usage tab answered, certifications ticked.
- [ ] Visibility and regions chosen; test notes pasted.
- [ ] Submit for review; choose publish timing.

Steps in the dashboard: Add new item, upload zip, fill the Package, Store Listing, Privacy, Distribution and Test instructions tabs, Submit for Review (https://developer.chrome.com/docs/webstore/publish).
