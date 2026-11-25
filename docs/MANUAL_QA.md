# Manual QA

A script for the owner. Run Part A in Firefox, Part B in Chrome, Part C in Safari, then Part D on the real x.com. Record results in the table at the end.

Which items need real X: on-page items (1, 2, 14, 16, 17, 20 and all of Part D; item 21 needs only the extension's own pages) need a real x.com post and your own account, because the content script matches only x.com and twitter.com and the popup needs a real X post URL in the active tab. The dev fixture (`npm run dev`) and `npm run e2e:firefox` are developer aids only and cannot be used with the installed extension.

Build status: `npm run build` writes `dist/firefox`, `dist/chrome` and `dist/safari`; `npm run package` zips them. Firefox can also load `src/` directly (`npm run run`). The Chrome bundle (`dist/chrome`) loads in Chrome for Testing 158 with no manifest warnings and passes `npm run e2e:chrome` and `npm run e2e:chrome:persistence` (see `scripts/e2e/README.md`); Part B is what remains for branded Chrome and real x.com. Safari: `npm run safari:convert` and `npm run safari:build` (see Part C and docs/SAFARI.md); it has not been run in Safari yet.

## Testing restarts and persistence

A temporary add-on (about:debugging "Load Temporary Add-on", or `web-ext run` on a throwaway profile) has its storage deleted when it is removed, and Firefox forgets it on restart, so a plain temporary install proves nothing about restarts. Release Firefox cannot install an unsigned add-on permanently (only Developer Edition, Nightly and ESR/unbranded builds can, with `xpinstall.signatures.required=false`). Test persistence with one of these:

- Automated: `npm run e2e:persistence` (see `scripts/e2e/README.md`). It keeps a throwaway profile across five real headless Firefox runs by setting `extensions.webextensions.keepStorageOnUninstall` and `extensions.webextensions.keepUuidOnUninstall` and pinning the add-on uuid. It covers save, clean quit, relaunch, an uninstall + reinstall at the same uuid and a corrupt-library restart (the about:debugging Reload button is not exercised). It does not cover a signed AMO install.
- Manual with a kept profile: run `web-ext run -s src --firefox-profile ./.local/qa-profile --keep-profile-changes --pref=extensions.webextensions.keepStorageOnUninstall=true --pref=extensions.webextensions.keepUuidOnUninstall=true` with the same profile directory every time (not run by the maintainers; `scripts/e2e/persistence.mjs` uses the same prefs through geckodriver, and `--pref` exists in the installed web-ext 10.x `run` command). Without them, an explicit uninstall of a temporary add-on clears its storage (observed in the automated check). Then quit Firefox completely and run the same command again.
- A real install: a signed build (AMO unlisted or listed) or an unsigned xpi on Developer Edition/Nightly/ESR.

Do not use your main browser profile for QA. Use a throwaway profile, or accept that the library you create lives in that profile.

## Common checklist

Parts A to C each run this checklist in their browser. Items are numbered so the results table can refer to them.

1. Popup save from a post tab: open a real x.com post page, click the toolbar icon, Save tab shows the post link and author, choose a folder, add tags and a note, click "Save post". Expect "Saved to your library". Click "Done".
2. Duplicate save: open the popup on the same post again. The button reads "Update", not "Save post". Update the note; the Saved tab shows one entry, not two.
3. Folders CRUD (Options > Folders): add a folder, rename it, delete it. An empty list shows "No folders yet. Add one above." Duplicate names are refused with a message. Posts in a deleted folder show as Uncategorised.
4. Tags: type tags separated by commas, remove one with its remove button, filter by a tag in Saved, clear the tag filter.
5. Notes: edit a note and confirm it persists after closing and reopening the popup.
6. Search and filter: search by author, note and tag text in "Search saved posts"; use the folder chips; "Clear filters" resets; a query with no hits shows "No matching posts".
7. Delete and undo: delete a post, the snackbar offers Undo; Undo restores the post, folder, tags and note. Delete twice quickly and check the "(n to undo)" count.
8. Options page sections: Saved, Folders, Data, Privacy, Permissions, About all open from the left navigation (also by URL hash such as `#data`). About shows the version and "Not affiliated with or endorsed by X Corp."
9. Export: Options > Data > Export downloads one JSON file. Open it in a text editor: `version`, `exported_at`, folders, posts. No snippet text for posts saved while the option was off.
10. Import preview and apply: change nothing, import the same file: preview says what will change (nothing new). Then delete one post, import again: preview shows one post to add; Cancel leaves the library unchanged; apply restores it.
11. Delete all: Options > Data > "Delete all local data" asks you to type DELETE to confirm, then empties the library. Import the earlier export: everything is back.
12. Quarantine notice: in the browser's extension storage inspector (see each part), set the `xmark.doc` value to `{broken`. Reopen the popup: the notice "We couldn't read your saved library..." appears and the library is empty. "Export unreadable copy" downloads a file containing `{broken`. Save a post; the notice stays. Options > Data > "Discard" (then "Discard copy" to confirm) removes it. Delete-all keeps the copy unless the extra box is ticked.
13. Restart persistence: with a few posts saved, quit the browser completely (not just the window) and start it again. The posts, folders, tags and notes are still there. See Part A setup for how to keep a profile.
14. Snippet toggle and length (Options > Privacy): off by default, and the Snippet length slider and number field are greyed out and skipped by Tab while it is off. Turn it on: both become usable and show 280 (the default). Move the slider with the arrow keys (one character per step) and type a value in the number field: both stay in step, the readout shows "N characters", "Saved" appears and a screen reader announces "Snippet length set to N characters.". Type 20 or 300: an inline message asks for a whole number from 35 to 280 and nothing is saved; leaving the field clamps to 35 or 280. Reload the page: the chosen value is kept. Set 60, save a post from the on-page button: the post card in the Saved tab shows at most the first 60 characters of the text. Set 280 again: older snippets are not changed, a new save keeps the text, never longer than 280 characters. Turn the toggle off: new saves have no snippet.
15. Permissions button (Options > Permissions): without host access the page shows "Enable on X". Click it, grant in the browser prompt; the button state changes. Revoke the access in the browser's extension settings and confirm the page returns to the "Enable on X" state.
16. Keyboard-only pass: do items 1, 3, 6 and 7 using only Tab, Shift+Tab, Enter, Space and Escape. Every control is reachable, order is logical, Escape closes the on-page panel and returns focus to the XM button.
17. Focus rings: every focused control shows a visible ring in both light and dark browser themes.
18. Light and dark toolbar icons: switch the browser theme (and the OS theme). The toolbar icon stays visible on both. Note whether it is legible at 16 px (known limitation).
19. Narrow popup: shrink the window or enlarge the browser font size so the popup is as narrow as it can be. No horizontal scroll, no clipped buttons, long notes wrap.
20. Add folder from the on-page panel: on a real x.com post click the XM button, choose "Add folder…" (last Folder option) with the mouse and again with the keyboard. A new tab opens on Options > Folders with the "New folder name" field focused and the hint "Create a folder, then go back to X and open Save again."; the panel closes and focus returns to the XM button; no folder or post is created by the choice itself. Create a folder there, return to X, open Save: the folder is listed. Click the choice twice quickly: only one tab opens (one per 2 seconds). Not in a private window.
21. Options > Saved page (open the options from the popup gear; it lands on Saved):
    - Search: type an author, a tag or a note word; results update after a short pause and the count ("N posts") changes. A query with no hits shows "No matching posts" and "Clear filters".
    - Filters: folder chips show counts (posts whose folder was deleted count as Uncategorised); tag chips show the most used tags, "Show all tags" expands; selecting a tag, then a folder, narrows the list; "Clear filters" resets everything.
    - Sort: Newest first (default), Oldest first, Author A to Z reorder the list.
    - Pagination: with more than 50 posts only 50 cards show, "Show more" adds the next 50 and moves focus to the first new card; a status line says "Showing n of N posts".
    - Edit tags and notes, Move to another folder, Delete then Undo: each behaves like the popup, and focus lands on the next card (or the search box when the list is empty).
    - Refresh after saving elsewhere: keep this page open, save a post from the popup or the on-page panel on X, then switch back to the page; the new post appears without reloading.
    - Layout: the left menu sits at the window's left edge and the content uses the full width; two columns from 1000 px, three from 1500 px; under 720 px the menu becomes top tabs and the cards stack.

## Part A: Firefox (140 or newer)

### Setup

- Enable host access first: Options > Permissions > Enable on X, grant it. Firefox MV3 does not grant host access at install; without it the on-page button does not appear.
- Temporary load: `about:debugging#/runtime/this-firefox` > "Load Temporary Add-on" > choose `src/manifest.json`. Or `npm run run`.
- Persistent profile (needed for item 13; a temporary add-on is forgotten on restart and its storage discarded, so item 13 needs this or a signed xpi): run `npx web-ext run -s src --firefox-profile ./.local/qa-profile --keep-profile-changes` with the same profile directory every time.
- Storage inspector for item 12: about:debugging > this extension > Inspect > Storage tab > Extension Storage > `xmark.doc`.
- Private windows: the extension is not allowed there. Open a private window, try to save, and confirm nothing is saved.

### Restart persistence steps (item 13 in detail)

1. Start as above. On a post, click the XM button, pick a folder and press Save in the panel. Popup > Saved lists the post.
2. Quit Firefox completely and start it again on the same profile.
3. Popup > Saved still lists the post, its folder, tags and notes.
4. Reload the add-on (about:debugging > Reload): the post is still listed.
5. Options > Data > Export, then "Delete all local data", then Import that file: everything is back.

The automated check covers steps 1 to 4 for a profile that keeps extension storage; the Options export/delete/import round trip (step 5) stays manual.

### Checklist

Run items 1 to 21 (items 1, 2, 14, 16, 17 and 20 need a real x.com post). Results go in the table.

### Unreadable-data copies (item 12 in detail)

1. In about:debugging > Inspect the extension > Storage, change the `xmark.doc` value to `{broken`.
2. Open the popup: the notice "We couldn't read your saved library..." and "1 copy of the unreadable data is kept" are shown and the library is empty.
3. Click "Export unreadable copy": a text file containing `{broken` downloads.
4. Save a post; the notice stays. Change `xmark.doc` to another broken value and reopen the popup: now two copies are listed in Options > Data, each with Export and Discard.
5. Discard one copy (inline confirm): the other stays and your library is not changed.

## Part B: Chrome (98 or newer)

Already proven by the automated real-Chromium run (Chrome for Testing 158, macOS arm64, headless): the bundle loads, the popup and options page work, the message guard works with real Chrome senders, the content script injects one Save host per post on a local copy of the fixture, a trusted click and keys save a post, the extension is inactive in an off-the-record context and Chrome offers no way to turn it on there, the service worker can be stopped without data loss, and the library, settings, tombstones and unreadable-library copies survive a clean quit and relaunch. NOT proven there: branded Google Chrome, a Chrome Web Store install, Windows and Linux, the real x.com markup, the toolbar icon on light and dark themes and real window rendering. Those are what this part is for.

### Setup

- Build: `npm ci && npm run build:chrome`.
- Load: `chrome://extensions` > switch on "Developer mode" > "Load unpacked" > pick the `dist/chrome` folder. The card must show no "Errors" button and no warning. Record anything else in the results table.
- Host access: Chrome grants `x.com` and `twitter.com` at install, so the on-page button should appear right away. For item 15, use the extension's Details page > "Site access" ("On specific sites" or "On click") to take the access away, then Options > Permissions > "Enable on X" to give it back. If the Details page offers no way to take it away, record that.
- Use a throwaway Chrome profile (profile picker > "Add") for QA, not your main profile.
- Restart persistence (item 13): unpacked extensions keep their storage across restarts. Quit Chrome completely (Cmd+Q or all windows, and check no Chrome process is left) and start it again on the same profile. Branded Chrome 137+ ignores the `--load-extension` switch, so load through "Load unpacked" as above.
- Storage inspector for item 12: `chrome://extensions` > the extension's "service worker" link (or an extension page) > DevTools > Application > Storage > Extension Storage > Local.
- Incognito: leave "Allow in Incognito" off. The manifest says `incognito: "not_allowed"`, so the toggle should be missing or off. Open an incognito window on x.com and confirm no Save button appears.
- Service worker: on `chrome://extensions` > "service worker" > stop it (or wait about 30 seconds idle), then use the popup. It must work and show your data.

### Checklist

Run items 1 to 21 (items 1, 2, 14, 16, 17 and 20 need a real x.com post). Results go in the table.

## Part C: Safari

The Safari bundle converts and compiles (`npm run safari:convert`, `npm run safari:build`); nothing below has been run in Safari yet, so every Safari-specific observation is a first observation: record exactly what you see. Background: [docs/SAFARI.md](SAFARI.md).

### Setup

- On a Mac with Xcode: `npm ci && npm run safari:convert`. FIRST do the module-background check in docs/SAFARI.md ("First check on a Mac"); only continue if it passes. Open `safari/xmark-manager/xmark-manager.xcodeproj`, and for both targets set Signing & Capabilities to "Sign to Run Locally" with Team None. Product > Run.
- Safari > Settings > Advanced > "Show features for web developers", then Settings > Developer > "Allow unsigned extensions" (resets each time Safari quits; Safari 16 and earlier: Develop > Allow Unsigned Extensions).
- Safari > Settings > Extensions: tick xmark-manager. Quick alternative without Xcode: Settings > Developer > "Add Temporary Extension..." and pick `dist/safari` (removed after 24 hours or on quit, so it cannot test restarts).
- Enable host access: on x.com click the toolbar button and allow website access (once, for the day, or always); repeat for twitter.com. Item 15 is the main check here. Without access the on-page Save button must not appear and the options page must say so.
- Storage inspector for item 12: Develop > Web Extension Background Content, choose xmark-manager, then Storage or Console. TODO(owner): record the working path.
- Safari-only checks to record: (a) the module background loads (Develop > Web Extension Background Content > inspect: no "Cannot use import statement"; `browser.runtime.getURL('')` returns `safari-web-extension://...`; one popup save round trip). If it fails, report it and stop: only then is a classic-script background fallback to be built; (b) popup size and layout; (c) the toolbar icon is readable in light and dark and tinted like other extensions; (d) private window: allow the extension in private windows (Settings > Extensions), open a private window on x.com, click Save on a post and confirm the save is refused, in the popup too; (e) data survives quitting and reopening Safari (storage persistence); (f) after a minute idle the popup and a save still work (non-persistent background); (g) `runtime.getURL('')` starts with `safari-web-extension://`: if the background fails to start, the message guard throws at start-up and every action fails, so report that first.
- Use the `pluginkit -mAvvv -p com.apple.Safari.web-extension` command to see whether Safari has registered the extension.

### Checklist

Run items 1 to 21 (items 1, 2, 14, 16, 17 and 20 need a real x.com post). Results go in the table.

## Part D: Real x.com checks (owner only)

Why this is manual: tests use a static fixture of X markup. Only the real site shows whether the selectors still match.

### Rules

- Use your own account, by hand, at normal human speed.
- Do NOT write or run scripts, bots, macros or test automation against x.com. Do NOT automate clicking. Do NOT save posts in bulk or repeat Save quickly to test. A few single, deliberate clicks per check is enough.
- Do not open the extension's console on x.com and paste code into the page.
- If something looks wrong, stop and report it. Do not work around it with a script.

### Checks

Each check is a human action followed by an observation.

D1. Timeline: scroll your Home timeline slowly. Each post shows exactly one XM mark (the extension's Save button, not X's own bookmark icon) in its action bar. No duplicates, no button on ads or on non-post items where it should not be.
D2. Post page: open one post page. The main post and each reply shows one XM mark in its action bar.
D3. Quote post: find a post that quotes another. Click Save on the outer post: the saved link (Saved tab) is the outer post. Then Save on the quoted one if it has its own button: the link is the quoted post. If it has none, skip. Never the wrong one.
D4. Reply thread: open a long thread. Buttons appear once per reply; saving a reply stores that reply, not the thread root.
D5. Scrolling and recycled posts: scroll far down and back. X reuses elements; confirm there is still only one button per post and that the button saves the post it sits on (check the Saved tab after).
D6. Panel placement: open the panel on a post near the top of the screen and on one near the bottom. The panel opens below when there is room and above otherwise, never clipped off screen. Resize the window narrow and repeat. Scroll while the panel is open: it follows the button and closes when the button scrolls out of view. On a post page (a status URL) with X's sticky "Post your reply" bar at the bottom, click Save on the main post's action bar: the whole panel (title "Save post", Folder, Tags, Notes and the Save button) must be fully visible above the reply bar, never cut off by it.
D7. Panel behaviour: Escape closes it, clicking outside closes it, Tab stays usable. While typing in the notes field, note whether any X keyboard shortcut fires (it should not).
D8. Snippet off: with the option off, saved posts have no text. Snippet on with the default length (280): the text is saved, never longer than 280 characters. Set Options > Privacy > Snippet length to 50 and save a long post on x.com: the saved text is cut at 50 characters (never more) and an emoji at the cut is not broken. Set it back to 280 and turn the option back off afterwards.
D9. Logged-out view: log out (or use a clean profile), open a public post. Behaviour is sensible: the button appears or not, and nothing errors. Saving a public post works.
D10. Protected or unavailable post: open a protected account's post (one you can see) and a deleted or unavailable post. No button appears on the unavailable placeholder, or Save fails with a clear message. Nothing crashes.
D11. twitter.com host: open a `twitter.com/.../status/...` link; it may redirect. Saved link uses the canonical form.
D12. Nothing on X was changed: confirm the extension never liked, followed or clicked anything (check your likes and following lists).

### If the button vanishes (X changed its markup)

1. Reload the page and the extension once.
2. Check if the button is missing everywhere or on some post types only.
3. The selectors live only in `src/content/selectors.js`. Do not change other files. Open an issue with the post type, the browser and the date; see below. A fix is a change to that one file plus its tests.

## Results table template

| Date | Browser and version | OS  | Part | Item | Pass / Fail / N/A | Notes or issue link |
| ---- | ------------------- | --- | ---- | ---- | ----------------- | ------------------- |
|      |                     |     | A    | 1    |                   |                     |
|      |                     |     | A    | 2    |                   |                     |
|      |                     |     | D    | D1   |                   |                     |

## How to report an issue

Open a GitHub issue (security problems: see `SECURITY.md`, do not file them publicly). Include:

- extension version (Options > About) and browser version and OS,
- the checklist item number,
- steps, expected result, actual result,
- a screenshot with personal data hidden. Never paste your exported library or cookies.
- for x.com problems: post type (timeline, post page, quote, reply), logged in or out, and whether the Save button was missing, duplicated or saved the wrong post.
