# Project status

Snapshot of 2026-11-25 on branch `main` (one squashed commit). Work is paused here; this page is the hand-over. Rules and conventions: [CLAUDE.md](../CLAUDE.md). Version 0.1.0 is prepared (`CHANGELOG.md`); the repository is public, no store listing exists and the `v0.1.0` tag is not pushed yet.

## What is built and how it was verified

| Area                                                                                                                                                           | Verified by                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core (model, merge, import/export, post identity, search, view helpers), platform adapters, storage with unreadable-data copies, background guard and handlers | 815 unit tests (`npm test`, Node 20 and 22+), linkedom DOM tests                                                                                                    |
| Popup (Save and Saved tabs, undo), Options (Saved, Folders, Data, Privacy with snippet length, Permissions, About), shared UI, XM monogram, gear icon          | Unit tests; dev harness (`npm run dev`); the owner's manual looks                                                                                                   |
| On-page XM button and top-level panel host, "Add folder…" opening Options                                                                                      | Unit tests; real Firefox e2e and real Chromium e2e on a LOCAL copy of the fixture (trusted click, never real x.com); the owner's manual checks on real x.com so far |
| Firefox bundle (140+)                                                                                                                                          | Real headless Firefox: `npm run e2e:firefox` and `npm run e2e:persistence` (library survives restarts, uninstall/reinstall, a corrupt library)                      |
| Chrome bundle (98+ declared)                                                                                                                                   | Real Chrome for Testing 158 (macOS arm64, headless): `npm run e2e:chrome`, `npm run e2e:chrome:persistence`, plus mutation runs proving the checks have power       |
| Safari bundle (18.0+ declared)                                                                                                                                 | Build only: `npm run safari:convert` and `npm run safari:build` produce and compile an unsigned project (Xcode 26.6). Never run in Safari                           |
| Cross-browser build, deterministic zips, version floor table                                                                                                   | `tests/build.test.js`, `tests/manifest-transform.test.js`, `tests/browser-floor.test.js`, `tests/package.test.js`, `npm run release:dry-run`                        |
| Release and deploy workflows (ci, release, deploy-firefox, deploy-chrome, deploy-safari, codeql, dependency-review, scorecard)                                 | Static tests (`tests/workflows.test.js`, `tests/release.test.js`, `tests/scripts/`). NEVER executed on GitHub                                                       |

## What is NOT verified

- Real x.com markup beyond the owner's manual checks so far. `docs/MANUAL_QA.md` Part D is the script; selectors live only in `src/content/selectors.js`.
- Branded Google Chrome (it ignores the command-line load switch the e2e uses; use "Load unpacked", `docs/MANUAL_QA.md` Part B), a Chrome Web Store install, and the Chrome 98 floor on a real Chrome 98 (the floor is derived from compatibility data, not run).
- Safari at runtime: module background, private-window flags (`sender.tab.incognito`, popup `tabs.query` `incognito`), site-access flow, toolbar icon tinting, storage persistence. `docs/SAFARI.md` "First check on a Mac" comes first.
- Windows and Linux (everything was run on macOS).
- GitHub workflows have never run: the repository has no remote yet, environments, secrets and rulesets do not exist.
- Reproducibility of the zips across Node versions is UNCONFIRMED (fixed timestamps and sorted entries; compare `release:dry-run` checksums on Node 20 and 22+).
- The `--experimental-websocket` flag on Node 22+ for the Chromium e2e is expected to be a harmless no-op but was only run on Node 20.

## Known limitations

- The 16 px toolbar icon is hard to read.
- Tag chip counts on the Saved page and popup count the whole library, not the current filter.
- Unreadable-library copies can race across contexts (several pages writing at once); identity checks (`{n, id}`, `copy_changed`) make a wrong action refuse, but a stale list can still be shown until refresh.
- Page scripts on X can observe keystrokes typed into the panel and can see our host elements (documented in PRIVACY.md).
- Purging a tombstone older than 90 days can resurrect an older live copy held by a peer that never saw the deletion (inherent; matters for Phase 2).
- Safari asks users to grant website access to x.com and twitter.com; Firefox MV3 does not grant it at install either (Options > Permissions > Enable on X).
- `Add folder…` needs a round trip: create the folder in Options, then reopen Save on X. Typed panel input is not kept.

## Decisions made by the owner

- Phase 1 is local-only; no network requests at all.
- No injection into X's own menus: the XM button goes in the post's action bar.
- "Add folder…" in the panel opens Options; folders are never created from x.com.
- The XM monogram is the logo everywhere (button, popup, options, icons). Nothing derived from X's logo.
- Avoid anything that could affect Firefox Add-ons approval; minimal dependence on X's markup.
- Permissions stay `storage`, `activeTab`, `x.com`, `twitter.com`.

## Release path

Mechanics and per-store field values: `docs/RELEASING.md`, `docs/RELEASE_CHECKLIST.md`, `docs/AMO_SUBMISSION.md`, `docs/STORE_LISTING_CHROME.md`, `docs/STORE_LISTING_SAFARI.md`. The release workflow only creates a DRAFT GitHub Release; every store upload is a manual, reviewer-gated run that is a dry run by default.

### Firefox v1 (first target): blockers the owner must supply

- Done: public privacy policy URL (`PRIVACY.md` on GitHub), homepage and support URLs (the repository and its issues), release date, and an AMO developer account (the owner already publishes another add-on).
- A GitHub repository, with the protections in `docs/RELEASE_CHECKLIST.md`, if the workflows are to be used; and the manual QA results (Part A and D).
- Done: all screenshots are 1280x800 (`docs/SCREENSHOTS.md`).

### Chrome and Safari

- Chrome Web Store: developer account with a one-time fee (amount UNCONFIRMED; check the dashboard), the first upload by hand, a privacy policy URL, the same listing assets, branded-Chrome QA.
- Safari: Apple Developer Program (USD 99 per year, as documented), Apple Team ID, a final bundle id ending in `.xmark-manager` (current default is a placeholder), a real 1024 px app icon (the generated one is upscaled from 128 px), a macOS host app screen, App Store screenshots, and the Mac runtime checks. Several App Store details are UNCONFIRMED in `docs/STORE_LISTING_SAFARI.md`.

## Backlog in priority order

1. Staff Security Engineer hardening pass over everything: the panel host (z-index, event isolation, placement), `OPEN_FOLDER_SETTINGS` and its rate limit, the guard allow-list, the import path, and the workflows (`actionlint`, zizmor, pinned actions, environment gating).
2. Senior Staff code review pass over the whole code base (file sizes, duplication between `src/content` and `src/ui`, error handling, test gaps).
3. Done: the public history starts from one squashed commit, so the early X-derived logo is not in the published repository. The pre-squash history exists only in the local `feat/initial-implementation` branch; never push it.
4. Remove stale local worktrees under `.claude/worktrees/` (ten of the eleven `worktree-agent-*` branches; keep the theme one, `worktree-agent-a4dc7317f9436721c`, until the theme feature is decided) once their content is confirmed merged or dropped.
5. Done: configurable snippet length, 35 to 280 characters, default 280 (Options > Privacy > Snippet length; `src/core/snippet.js`, `src/options/components/snippet-length.js`). The branch `wip/snippet-length` is obsolete (its history is unrelated to `main`; its code was reviewed and finished here) and can be deleted.
6. Optional features requested but NOT merged (do not describe them as present):
   - Light and dark theme with an Appearance setting (system, light, dark) and detection of X's own theme from the page background colour so the XM button and panel match. Work in progress is on the unfinished worktree branch `worktree-agent-a4dc7317f9436721c`. Today everything uses the X dark tokens.
7. After the Firefox listing is approved: an owner-switchable option to use the extension in private windows. Today `incognito` is `not_allowed` in the manifest, the guard refuses private tabs and the privacy copy says nothing is saved from private windows (Mozilla policy 6.3.2: data from private browsing sessions must not be stored). Design when it is picked up: manifest `spanning` (Firefox shows its own Run in Private Windows switch, off by default) plus an in-extension setting the guard honours; update the privacy copy, review `data_collection_permissions`, the tests and the `incognito-spanning` e2e control.
8. Phase 2, Google Drive sync (not started; no design doc beyond the notes in `README.md` and `PRIVACY.md`): `drive.file` scope only (the extension sees only files it created), one JSON file, off by default, an explicit consent screen before the first connect, controls to disconnect and delete the Drive copy, and PRIVACY.md updated before it ships. Risks to design for: OAuth redirect handling and the redirect URI differ per browser (UNVERIFIED how each browser's identity API behaves; test all three), a new network permission and host, token storage, and the merge semantics above (tombstone resurrection, clock skew clamp). It would break the "makes no network requests" claims in README, PRIVACY, SECURITY, the store listings and the AMO `data_collection_permissions`, which must change with it.

## Picking up in a fresh session

1. Read this page and `CLAUDE.md`. Run `npm ci && npm test && npm run lint` (expect green, 815 tests).
2. For anything touching X's page, use `npm run dev` and `/dev/x-fixture.html`; never script real x.com.
3. To resume Firefox release: do the owner items above, then `docs/MANUAL_QA.md` Parts A and D, then `docs/RELEASE_CHECKLIST.md`.
