# Contributing

Thanks for helping improve xmark-manager.

Where the project stands and what is next: [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md). AI-assisted work follows [CLAUDE.md](CLAUDE.md).

## Setup

```sh
npm ci
```

Requires Node.js 20 or newer.

## Workflow

1. Create a branch from `main`.
2. Make a focused change with tests.
3. Run `npm run lint`, `npm test`, and `npm run build:lint`.
4. Open a pull request using the template.

## Architecture

- `src/core`: pure logic; dependencies are injected.
- `src/platform`: thin adapters around `browser.*` APIs. Only `platform/browser-api.js` (and the inline copy in `content/messages.js`) may name `browser` or `chrome`; everything else receives the API by injection.
- `src/popup`, `src/options`, `src/content`: UI shells that talk to the background by messages.

Keep files small and single-purpose.

## Developing the UI

The popup can be built and checked in a normal browser tab, without Firefox:

```sh
npm run dev
```

Open <http://127.0.0.1:5173/dev/popup.html?tab=https://x.com/ada_builds/status/123456789>. The server binds to 127.0.0.1 only. It serves `src/` at `/` and `dev/` at `/dev/`. `dev/mock-browser.js` fakes the `browser` global (real handlers over an in-memory store) and then loads the real `src/popup/popup.js` unchanged.

Query params: `?tab=<url>` active tab URL (a non-post URL such as `https://x.com/home` opens the Saved tab), `?latency=<ms>` simulated delay, `?empty=1` empty library, `?error=1` make every request fail. Keep the window about 380 px wide to match the real popup.

`dev/` and `scripts/` live outside `src/`, so bundles never contain them. Use `npm run run` for a final check in real Firefox.

## Building and loading unpacked

`npm run build` writes `dist/firefox`, `dist/chrome` and `dist/safari` (`npm run build:<browser>` builds one; `npm run package` also zips them into `dist/zips/`). `src/manifest.json` stays the Firefox manifest; `scripts/manifest-transform.mjs` derives the others. Edit `src/`, then rebuild.

Step by step for every browser: [docs/INSTALL.md](docs/INSTALL.md).

- Firefox: `npm run run`, or `about:debugging#/runtime/this-firefox` > "Load Temporary Add-on..." > `dist/firefox/manifest.json`.
- Chrome: `chrome://extensions` > Developer mode > "Load unpacked" > `dist/chrome`. Reload the extension after each rebuild.
- Safari (UNVERIFIED until Task C3; macOS with Xcode): `npm run safari:convert` then `npm run safari:build`, and follow `docs/SAFARI.md` to run it (Safari > Settings > Extensions; "Allow unsigned extensions" for local builds).

Keep classic content scripts free of `import`/`export`; if you change the normalisation in `platform/browser-api.js`, mirror it in `content/messages.js` (a test compares both). `onMessage` listeners are wrapped identically on every browser; do not rely on promise-returning listeners. `node scripts/export-icons.mjs` regenerates `assets/branding/export/` from `src/ui/logo-paths.js`.

## Tests

Tests live in `tests/` and run with `npm test` (`scripts/run-tests.mjs`: lists `tests/**/*.test.js` and runs `node --test` on them, so checkouts under `.claude/worktrees/` are not picked up; pass extra `.js` paths to run only those files). `npm run coverage` (Node 22 or newer) adds V8 coverage of `src/`, writes `coverage/lcov.info` (git-ignored) and fails below 80% lines, 70% functions or 60% branches; CI runs it on Node 22 and uploads the report. Shared fakes and helpers live in `test-support/` (not `tests/`, so the runner does not treat them as tests).

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).

## Security rules

- Render with `textContent` only. No `innerHTML`, `eval`, or remote code.
- Do not add permissions without a clear justification in the PR.

## Privacy and platform safety

Contributions must respect the non-negotiable rules in [CLAUDE.md](CLAUDE.md#privacy-and-platform-safety-non-negotiable): no reading of cookies, tokens or account data; no extra permissions (`cookies`, `webRequest`, `tabs`, `history`, `scripting`, `<all_urls>`); no requests to X; DOM read only on an explicit Save click; no automation of actions on X; no telemetry or remote code.

## Network and permissions

Phase 1 transmits nothing off the device: do not add network requests, remote code or permissions beyond `storage` and `activeTab` (plus the x.com and twitter.com hosts). Google Drive sync is a Phase 2 item.
