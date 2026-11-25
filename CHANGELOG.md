# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-21

First beta release (pre-release). Phase 1 is local-only: no network requests, no account, no analytics.

### Added

- On-page XM button in each post's action bar on x.com and twitter.com (the XM monogram; a check badge shows a saved post). Clicking it opens the Save panel, which renders in its own top-level host so X's layers and the sticky reply bar cannot clip it. Pick a folder, add tags and a note. The post is read only when you click the button on that post; nothing is stored until you press Save in the panel. Nothing is injected into X's own menus.
- The panel's last Folder choice, "Add folder…", opens Options > Folders in a new tab (with a hint and the name field focused); no folder is created from x.com.
- Toolbar popup with a Save tab (save or update the post in the active tab, with "New folder…") and a Saved tab (search, folder and tag filters, edit, delete with undo). Its gear opens Options.
- Folders: create, rename and delete; posts without a folder show as Uncategorised.
- Options page with a full-width layout (nav docked to the left, top tabs on narrow windows): Saved, Folders, Data, Privacy, Permissions and About. Options > Saved is the full-page library browser: search, sort (newest, oldest, author), folder and tag filters with counts, 50 posts per page with "Show more", and Edit, Move, Delete with Undo; it refreshes when you return to the page after saving elsewhere.
- Export the library to one JSON file; import a file with a preview of what will change before it is applied; "Delete all local data" with typed confirmation.
- Optional text snippet, off by default. Options > Privacy lets you choose how many characters are kept: 35 to 280 characters (default 280, the maximum), with a slider and a number field. The length applies to posts you save from then on; snippets already saved, and snippets in an imported file (which may hold the full 280), are not shortened when you pick a smaller length. The export format is unchanged and does not include settings.
- "Enable on X" button to grant host access from the options page.
- Posts are identified by their X status id, so the same post is never saved twice under different link forms.
- Unreadable stored data is kept as a copy, never overwritten, with a notice. Each copy (at most 5) has its own id; Options > Data lists the copies with "Export" and "Discard", and a request that names an old copy is refused and refreshed instead of acting on a newer one.
- Cross-browser support: Firefox (140+), Chrome (98+) and Safari (18+) bundles built from one source by `npm run build` and zipped deterministically by `npm run package`.
- Real-browser end-to-end checks: `npm run e2e:firefox` and `npm run e2e:persistence` (real Firefox, including restarts) and `npm run e2e:chrome` and `npm run e2e:chrome:persistence` (real Chrome for Testing, with mutation controls); Safari builds into an unsigned Xcode project with `npm run safari:convert` and `npm run safari:build`.
- GitHub workflows (not yet run): CI, a release workflow that creates a draft Release with checksums and provenance, manual dry-run-by-default store deployments, CodeQL, dependency review and Scorecard.
- An original XM monogram logo and toolbar icons (light and dark variants on Firefox, PNG app icons on Chrome and Safari), and a redrawn gear icon.
- A message guard that accepts messages only from this extension's own pages and from x.com and twitter.com content scripts (four allow-listed message types), re-validates every payload and refuses saves from private windows.

### Known limitations

- Safari has not been checked on a real device yet (private-window flags, install steps, toolbar icon tinting). Safari requires you to grant website access to x.com and twitter.com.
- Scripts that X itself loads on the page can still observe keystrokes typed into the on-page panel, because capture-phase key listeners run before the extension can stop the event. Do not type anything into notes that you would not want a page script to see.
- The 16 px toolbar icon is hard to read at that size.
- Tag chip counts count the whole library, not the current filter.
- Google Drive sync is planned for a later version and does not exist yet.
- Selectors for real x.com may need updates when X changes its markup (they live in `src/content/selectors.js`).
