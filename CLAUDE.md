# CLAUDE.md

Project instructions for AI-assisted and human work. Current state and next steps: [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) (read it first when picking the project up).

## Purpose and scope

xmark-manager is a cross-browser Manifest V3 extension that saves X posts into folders the user controls (folders, tags, notes, search, export/import). Plain JavaScript ES modules, zero runtime dependencies (dev only: eslint, prettier, web-ext, linkedom).

- Phase 1 (this code): local-only. Data lives in `browser.storage.local`; the extension makes NO network requests. Phase 2 (optional Google Drive sync) is NOT built; see `docs/PROJECT_STATUS.md`.
- Browsers and minimum versions (declared in `src/manifest.json` and `scripts/manifest-transform.mjs`): Firefox 140 (Android 142), Chrome 98, Safari 18.0. Chrome 98 is the maximum over everything the shipped code needs (`structuredClone`); `tests/browser-floor.test.js` scans `src/` and fails on disagreement, so add new built-ins to its table. Safari 18.0 is a project choice.
- `src/manifest.json` is the Firefox manifest and the single source of truth. `scripts/manifest-transform.mjs` (pure, unit-tested) derives Chrome (`background.service_worker`, PNG icons, `minimum_chrome_version`, no gecko keys or `theme_icons`) and Safari (background `scripts` module, `browser_specific_settings.safari`, PNG icons). Permissions, hosts and content scripts are never changed per browser.

## Repository layout

- `src/core`: pure logic (model, merge, import/export `portability.js`, `repository.js`, `post-identity.js`, `post-view.js`, `search.js`). No `browser.*`, no DOM, no I/O; dependencies are injected.
- `src/platform`: thin adapters (`local-store.js`, `quarantine.js`, `settings-store.js`, `runtime-client.js`, `messages.js`, `active-tab.js`). `platform/browser-api.js` (`getBrowserApi(globalObj)`) is the ONLY module that reads the `browser`/`chrome` globals; composition roots (`background.js`, `popup.js`, `options.js`) call it once and inject the result. `tests/no-stray-browser-api.test.js` greps `src` for strays.
- `src/background`: `guard.js` (sender/message gatekeeper), `handlers.js` (payload validation, response shaping), `app.js` (wiring, listener wrapping), `open-settings.js`, `background.js` (composition root).
- `src/content`: classic scripts on x.com and twitter.com (see Content scripts).
- `src/popup`: toolbar popup (Save and Saved tabs, gear opens Options).
- `src/options`: options page (see Options page).
- `src/ui`: shared components (`components/`, `saved/`), `theme.css` tokens, `icons.js`, `logo.js` and `logo-paths.js` (the XM monogram), `dom.js`.
- `scripts/`: `build.mjs`, `manifest-transform.mjs`, `zip.mjs`, `package.mjs`, `export-icons.mjs`, `release-*.mjs`, `verify-rebuild.mjs`, `dev-server.js`, `e2e/` (real Firefox and Chromium), `safari/` (convert and build).
- `dev/`: dev harness (mock browser, `x-fixture.html` imitation of X, popup/options pages). `tests/` (mirrors `src/`), `test-support/` (shared fakes, not tests), `docs/`, `.github/workflows/` (ci, release, deploy-firefox|chrome|safari, codeql, dependency-review, scorecard).

## Message protocol

- Types are in `src/platform/messages.js` (`MSG`). A content script may send exactly four: `SAVE_POST`, `LIST_FOLDERS`, `GET_SETTINGS`, `OPEN_FOLDER_SETTINGS`. All others (list/update/delete post, folder CRUD, export/import, delete-all, set settings, storage status, quarantine export/discard) are for extension pages only.
- Guard rules (`createMessageGuard`, fails closed): `sender.id` must equal the extension id; message must be a plain object with a known type; extension pages are recognised by `runtime.getURL('')` (`moz-extension://`, `chrome-extension://`, `safari-web-extension://`; the guard throws at start if it has another shape); everything else must come from an https page on x.com, www.x.com, twitter.com or www.twitter.com and use an allow-listed type. `SAVE_POST` and `OPEN_FOLDER_SETTINGS` are denied (`incognito`) when `sender.tab.incognito` or `message.incognito` is true.
- `onMessage` listeners are wrapped identically on every browser (sendResponse + `return true`; a rejected promise answers `undefined`; at most one `sendResponse`). Responses are `{ok: true, data?}` or `{ok: false, error: <stable code>}`; no error details leak. Content scripts get reduced data (`forContent` in `handlers.js`).
- `src/content/messages.js` repeats the four types and a small inline copy of the adapter (classic scripts cannot import); `tests/content/messages.test.js` and `browser-api-parity.test.js` keep both equal to the modules.
- `OPEN_FOLDER_SETTINGS` carries no payload (any payload is `bad_payload`), is sent only after a trusted choice of "Add folder…" in the panel, and the background opens `options/options.html#folders-add` in a new tab through `tabs.create` (no `tabs` permission), at most once per 2 s per sender. Folders are never created from content scripts.
- Private windows: Firefox and Chrome never run the extension there (`incognito: not_allowed`). Safari ignores that key, so the popup sends `inIncognitoContext || activeTab.incognito`, content scripts are checked via `sender.tab.incognito`, and the guard refuses. Safari flags are unobserved on a device.

## Content scripts (`src/content`)

- Classic scripts, each an IIFE registering on `globalThis.__xmark`; no top-level `import`/`export`. Order is set in `manifest.json` `content_scripts[0].js` (mirrored in `dev/x-fixture.html`); eslint treats the folder as `sourceType: "script"`.
- `selectors.js` is the ONLY file that knows X's markup. Fix X DOM changes there only.
- Files: `injector.js` (adds our host to each action bar), `save-button.js` (XM monogram button, 24x15 px in a 40x34 pill, check badge when saved; polygons duplicated from `src/ui/logo-paths.js`, a test keeps them equal), `panel.js` (lifecycle), `panel-form.js`, `panel-folder.js` ("Add folder…" choice), `panel-host.js`, `placement.js` (pure), `post-extractor.js`, `dom-util.js`, `styles.js`, `main.js`.
- The button lives in a closed shadow root in the action bar. The panel renders in its own top-level host (`[data-xmark-panel-host]`, appended to `document.documentElement` while open, `position: fixed`, z-index 2147483647, own closed root, at most one) so X's stacking contexts and sticky layers cannot clip it. Scroll/resize listeners exist only while it is open; it closes when the anchor leaves the DOM or viewport. Clicks must be `isTrusted` before anything is read.
- Never claim stronger isolation: page scripts can observe keystrokes typed into the panel (capture-phase listeners run first) and can see our host elements and where they are. We only stop text-carrying events at our root and keep roots closed.
- The post is read only on a Save click for that one post; author comes from the URL, text only when `saveSnippets` is on. Never click, like or follow; never read cookies/storage/identity; never log.

## Options page (`src/options`)

- `options.js` is the composition root and the only options file that obtains the browser API. `router.js` does hash routing (`#folders-add` = Folders plus a hint and focus on the add field). Sections (`sections/`): Saved (landing route), Folders, Data, Privacy, Permissions, About. Shared pieces in `components/`; pure text in `view-model.js` and `privacy-copy.js` (pinned by a test against PRIVACY.md wording; change both and the test together).
- Saved is the full-page library browser on `src/ui/saved/` (`saved-screen.js` with `variant: 'page'`; the popup uses `variant: 'popup'`). It loads the whole library once, filters/sorts/pages in memory (50 per page, "Show more"; `core/post-view.js`, `core/search.js`), refetches on focus/visibility with a stale-response guard. Layout: nav docked left (260 px; 200 px from 721 to 1000 px; top tabs under 720 px), fluid content, non-`section-wide` sections capped at 900 px; list is 1 column, 2 from 1000 px, 3 from 1500 px.
- Inline confirmations only (`components/confirm-panel.js`), never `window.confirm`. Results go to the polite live region.

## Data model and storage

- Library: `browser.storage.local` key `xmark.doc` via `platform/local-store.js`. Posts are identified by their X status id (`core/post-identity.js`), not the URL string. Every repository operation is exactly one `store.save`, serialized by the repository queue (enqueue before any other async read; settings operations are serialized too). Failed writes surface as `storage_full`/`storage_error`, failed reads as `storage_read_error`.
- Unreadable-data rule: an unreadable (or partly readable) library is never overwritten unless a copy of exactly that raw value exists; if a copy cannot be written, saving is refused (`storage_unreadable`). Copies: `xmark.doc.quarantine.<n>`, one per distinct value, at most 5 (a 6th is refused; only DISCARDING frees a slot, exporting does not), index in `xmark.doc.status` (`platform/quarantine.js`). Every copy has a unique `id`; `EXPORT_QUARANTINE`/`DISCARD_QUARANTINE` take `{n, id}` (mismatch is `copy_changed`, nothing touched); `{current: true}` exports the unreadable value that has no copy. Records dropped while reading also trigger a copy (`records_dropped`). Schema `migrate()` table in `core/model.js` decides what is readable. Discard never touches `xmark.doc`; delete-all keeps copies unless asked.
- Export/import: `core/portability.js` owns the format (`version`, `exported_at`, folders, posts); import previews first (`dryRun`), merges via `repository.importDoc` and `core/merge.js`; clamping rules (including `keptLocal`) in `core/import-clamp.js`; files up to 25 MB.
- Merge: last-writer-wins per id; any `updated_at` later than now + 24 h is rewritten to `now`; deletions are tombstones purged after 90 days (purging can resurrect an older live copy held by a peer that never saw the deletion; accepted).

## Privacy and platform safety (non-negotiable)

- Never read cookies, auth tokens, request headers, X's localStorage/sessionStorage, or the logged-in user's handle/name/avatar/settings/DMs/notifications.
- Permissions stay `storage`, `activeTab`, hosts `x.com` and `twitter.com`. No `cookies`, `webRequest`, `tabs`, `history`, `scripting`, `<all_urls>`, no `web_accessible_resources`.
- No requests to X or the X API, and no network at all in Phase 1. No telemetry, no console logging of URLs or content, no remote code.
- Read the DOM only when the user clicks the on-page button on one post. No timeline scanning, crawling or bulk capture. Never click, like, follow, repost, post or message on X.
- Stored fields: canonical URL, author handle, the user's folder/tags/notes, timestamps. A text snippet is opt-in, off by default; its length is the user's choice of 35 to 280 characters (default 280, `src/core/snippet.js`), never more than 280. The length reaches content scripts only via the reduced `GET_SETTINGS` data; the background re-cuts to it on save; stored and imported snippets are not shortened retroactively.
- `textContent` only: no `innerHTML`, `eval`, remote code.

## Conventions

- SOLID; small single-purpose files (about 150 lines); TDD (tests first, `tests/` mirrors `src/`).
- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). NEVER add `Co-Authored-By` or any AI attribution to commits or PR descriptions. Git identity: abhinav.lanka <abhinavlvs7@outlook.com>.
- `.local/` (scratch, git-excluded) and `.superpowers/` are never committed; neither is `dist/`. Do not work in or modify `.claude/worktrees/`.
- No em dashes in docs or strings. Prettier covers Markdown (`npm run lint`).
- Theme tokens (X dark): background `#000000`, surface `#16181c`, border `#2f3336`, text `#e7e9ea`, muted `#71767b`, accent `#1d9bf0`, danger `#f4212e`, pill radius `9999px`, base font `15px`. There is no light theme yet.

## Owner's standing preferences

- Avoid anything that could affect Firefox Add-ons (AMO) approval.
- Minimal dependence on X's markup; selectors only in `src/content/selectors.js`.
- Do not inject into X's own menus. The XM button sits in the post's action bar.
- "Add folder…" in the panel opens Options (it never creates a folder). The XM monogram is the logo everywhere; no X-derived artwork.
- Local-only in Phase 1.

## How to run everything

- `npm ci`; Node 20 or newer (`.nvmrc` is 22). `npm test` (`scripts/run-tests.mjs`, runs `node --test` on `tests/**/*.test.js`, never on worktrees; extra `.js` args select files). `npm run lint` (eslint + prettier check); `npm run format`.
- `npm run build` (all) or `build:firefox|chrome|safari` writes `dist/<browser>/` (clean rebuild; refuses to write outside `dist/`). `npm run build:lint` builds Firefox then `web-ext lint`. `npm run run` is `web-ext run -s src`.
- `npm run package` zips each bundle into `dist/zips/xmark-manager-<version>-<browser>.zip` (deterministic). `npm run release:dry-run` rehearses the release checks locally (`docs/RELEASING.md`).
- `npm run dev` (127.0.0.1:5173, `PORT` to change): `/dev/popup.html`, `/dev/options.html` (`?perm=0|1`, `?posts=N`), `/dev/x-fixture.html` (static imitation of X, real guard and handlers, no access to X). Real x.com checks are manual (`docs/MANUAL_QA.md` Part D).
- `npm run e2e:firefox`, `npm run e2e:persistence`: real headless Firefox; need `GECKODRIVER_BIN` (or geckodriver on PATH) and optionally `FIREFOX_BIN`; print SKIP and exit 0 when missing. Not in `npm test`.
- `npm run e2e:chrome`, `npm run e2e:chrome:persistence`: real Chromium over the DevTools protocol; need `CHROME_BIN` = Chrome for Testing or Chromium (branded Chrome ignores `--load-extension`); SKIP otherwise. x.com and twitter.com are mapped to a local TLS fixture and every other host fails, so real X is never contacted; never point them at real x.com. `E2E_MUTATE=guard-allow-list-posts|no-trusted-check|incognito-spanning` runs positive controls. Details: `scripts/e2e/README.md`.
- `npm run safari:convert`, `npm run safari:build`: macOS with Xcode only (SKIP otherwise); generate and compile an unsigned Xcode project in git-ignored `safari/`. `XMARK_BUNDLE_ID` must end in `.xmark-manager`. Details: `docs/SAFARI.md`.

## Current status and how to continue

See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md): what is built and verified, what is not, known limitations, release blockers and the prioritised backlog. Release mechanics: `docs/RELEASING.md`, `docs/RELEASE_CHECKLIST.md`. Manual test script: `docs/MANUAL_QA.md`.
