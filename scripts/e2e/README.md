# Real-Firefox smoke test

`npm run e2e:firefox` installs `src/` as a temporary add-on in a headless, throwaway-profile Firefox
and checks it end to end. It is not part of `npm test`. It skips (exit 0, with a message) when
Firefox, geckodriver or (for the x.com part) `openssl` is missing.

## Run

```sh
GECKODRIVER_BIN=/path/to/geckodriver npm run e2e:firefox
# optional: FIREFOX_BIN=/path/to/firefox  (default: /Applications/Firefox.app/Contents/MacOS/firefox)
```

`geckodriver` is not a dependency of this repo. Download the official build for your platform from
https://github.com/mozilla/geckodriver/releases into an empty folder outside the repo, compare its
sha256 with the digest GitHub shows for the asset, extract it, and point `GECKODRIVER_BIN` at it
(or put it on `PATH`). Tested with geckodriver 0.37.1 and Firefox 160.

## What it covers

- (a) The add-on installs (manifest, `incognito: "not_allowed"`, `data_collection_permissions`).
- (b) The popup renders at a fixed `moz-extension://` origin (the script pins the add-on UUID), with
  the Save and Saved tabs.
- (c, d) Real `browser.runtime.sendMessage` round trips to the real background: SAVE_POST then
  LIST_POSTS, a malformed URL (`InvalidPostUrlError`), a bad payload, an unknown message type and a
  non-object message (`rejected`).
- (e) Firefox's parsed manifest: incognito setting, data-collection permission, no incognito access.
- (f) Firefox stderr is scanned for JavaScript errors. The extension's own console is NOT reachable
  through classic WebDriver, so this is a partial check.
- (g) Content script on a local copy of `dev/x-fixture.html` (dev scripts stripped) that Firefox sees
  as `https://x.com/home`: Save buttons are injected (3 hosts, non-zero rect). The shadow root is
  closed, so the test never reads inside it: it clicks the host with trusted WebDriver pointer
  Actions, types the folder (type-ahead), tags and notes with trusted key Actions (focus crosses
  shadow boundaries), presses Enter on Save, then polls `LIST_POSTS` through the real background
  until the post appears with the typed folder, tags and notes.

## How the x.com page stays local

Real X is never contacted. Firefox is configured with a manual proxy pointing at a Node server
(`local-x.mjs`) that tunnels every HTTPS CONNECT, whatever host it names, to a local TLS server with
a throwaway self-signed certificate (session uses `acceptInsecureCerts`). Before any x.com URL is
opened, the script requests a plain-http `.test` host and requires the proxy marker back; if Firefox
is not using the proxy, step (g) stops.

The popup page is opened through the chrome context (geckodriver `--allow-system-access`) because
WebDriver refuses to navigate to `moz-extension://` URLs.

## Not covered (manual)

- Real x.com markup and behavior (selectors, SPA navigation, infinite scroll).
- Toolbar popup anchoring and sizing, and the look in a real (non-headless) window.
- Keyboard focus rings, theme icons on light and dark toolbars.
- Private-window behavior, sync/OAuth, the options page, real extension-console output.

# Restart persistence test

`npm run e2e:persistence` (same `GECKODRIVER_BIN` / `FIREFOX_BIN` as above; skips with exit 0 if
either is missing; not part of `npm test`; about 20 seconds). Shared helpers live in `lib.mjs`.

## Scenario

One throwaway profile directory (under the OS temp dir, deleted at the end) is reused by five
headless Firefox runs, each ended by WebDriver `DELETE /session` and a check that no process using
that profile is left:

- A: save 3 posts (2 folders, tags, notes, a snippet with the snippet setting on) plus one post that
  is then deleted (tombstone); keep the `EXPORT_DATA` text.
- B (new Firefox, same profile): `LIST_POSTS`, `LIST_FOLDERS`, `GET_SETTINGS` deep-equal A's; the
  deleted post is not listed but is in a fresh export; the export text equals A's except
  `exported_at`. Then the add-on is uninstalled and reinstalled at the same uuid in the same session (WebDriver `/moz/addon/uninstall` + install; this is NOT the about:debugging Reload path) and the
  same checks run again.
- C: still intact after a second restart; garbage is written to `xmark.doc` from the popup page.
- D: `GET_STORAGE_STATUS` is `quarantined`, `EXPORT_QUARANTINE` returns the garbage byte for byte,
  `LIST_POSTS` is empty, a new save works and the copy survives it.
- E: the new post and the copy survive one more restart.

## How a temporary add-on keeps its data

An unsigned add-on can only be installed as a temporary add-on on release Firefox (160.0.1 here):
Mozilla documents that unsigned installs (`xpinstall.signatures.required=false`) work only on
Developer Edition, Nightly and ESR/unbranded builds
(https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/). A
permanent unsigned install was therefore not attempted on 160.0.1.

Uninstalling an add-on, which is what a temporary add-on's removal is, normally clears its storage
and its entry in the `moz-extension://` uuid map. Firefox's `Extension.sys.mjs` guards those two steps
with `extensions.webextensions.keepStorageOnUninstall` and `extensions.webextensions.keepUuidOnUninstall`
(both default false, "usually only done in tests", per the source comment;
https://searchfox.org/mozilla-central/source/toolkit/components/extensions/Extension.sys.mjs). The
script sets both to true and pins `extensions.webextensions.uuids` for the add-on id, so the origin
`moz-extension://<uuid>` and its storage directory
(`<profile>/storage/default/moz-extension+++<uuid>^userContextId=4294967295/idb`, checked by the
script) are the same after every relaunch.

Observed with `XMARK_PERSIST_PREFS=none|uuid|storage|both` (a diagnostic knob; only `both`, the
default, is expected to pass):

- `both`: all checks pass.
- `uuid` only: the uninstall + reinstall step already lost the library (storage cleared on uninstall).
- `storage` or `none`: after the restart the popup did not load at the pinned origin, so nothing
  could be read. Both prefs are needed.

## What this proves, and what it does not

Proves: the library written through the real background (`browser.storage.local`, key `xmark.doc`)
survives a clean full browser quit and relaunch, and an uninstall + reinstall at the same uuid, in a profile that keeps
extension storage; the same holds for settings, tombstones and the quarantine copy and flag.

Does not prove:

- The about:debugging Reload button (a different code path from uninstall + install).
- Behaviour of a permanently installed, signed add-on from AMO (different install path, real uuid
  assigned by Firefox, no keep prefs). The storage backend and the extension code are the same.
- Crash or power-loss durability (only clean quits are tested), a laptop sleep/restart on a real
  desktop session, or profile sync/migration.
- Behaviour when the user clears site data or uninstalls the add-on (the data is then meant to go).
- Storage quota/full-disk behaviour.

# Real-Chromium tests (Chrome for Testing)

`npm run e2e:chrome` (smoke, about 10 seconds) and `npm run e2e:chrome:persistence` (six clean
quits and relaunches on one profile, about 20 seconds). Neither is part of `npm test`. Both build
`dist/chrome` first, print `SKIP` and exit 0 when `CHROME_BIN` is missing, and need no dependency:
Chrome is driven over the DevTools protocol with Node's built-in `WebSocket` (the npm scripts pass
`--experimental-websocket`, needed on Node 20; on Node 22+ the flag is expected to be a harmless no-op,
UNTESTED here, which only had Node 20). Without a global `WebSocket` the scripts print `SKIP` and exit 0.
Every CDP call times out after 15 s, a closed socket rejects all pending calls, and a 5 minute watchdog
kills Chrome and fails the run.

Files: `cdp.mjs` (CDP client, page and trusted-input helpers, polling helpers), `chromium-lib.mjs`
(launch, local x.com server, build), `chromium-info.mjs` (what `chrome://extensions` reports),
`chromium-mutate.mjs` (mutation runs), `tls.mjs` (throwaway certificate, shared with the Firefox
script), `chromium-checks/*.mjs` (the checks, one file per area).

```sh
CHROME_BIN="/path/to/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" npm run e2e:chrome
CHROME_BIN=... npm run e2e:chrome:persistence
```

## Getting Chrome for Testing

Use Chrome for Testing or Chromium, NOT branded Google Chrome (branded Chrome 137+ ignores
`--load-extension`, per the chromium-extensions announcement "Removing --load-extension flag in Chrome branded builds" (title as given to us; not re-read here)). Chrome for Testing is Google's test build. Look up the current stable download in
the official JSON endpoint
https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json
(`channels.Stable.downloads.chrome`, pick your platform, for example `mac-arm64`), download that zip
from `storage.googleapis.com` over HTTPS into an empty folder outside this repo, and unzip it. The
tested build is 158.0.8127.36 (mac-arm64). Checksum caveat: that JSON lists URLs only, with no
digest, so the integrity check is "HTTPS from the official endpoint" and nothing more. On macOS
`codesign --verify --deep` on the unzipped app reported "code has no resources but signature
indicates they must be present" (an unzip artefact); the browser still runs. On Linux in a container
you must add `--no-sandbox` yourself if you run as root (the scripts do not).

## How the real x.com is kept out

Every launch passes:

- `--host-resolver-rules` that map `x.com`, `*.x.com`, `twitter.com`, `*.twitter.com` and a `.test`
  check host to a local TLS server, plus `MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`, so every other host
  fails to resolve (observed: example.com is unreachable);
- `--no-proxy-server`, because name-resolution rules do not apply when a proxy resolves the name (a
  system or PAC proxy would otherwise get `CONNECT x.com:443`). Check (0) in the smoke test launches
  with `--proxy-server=127.0.0.1:1` (a closed port) and shows that without `--no-proxy-server` the
  local fixture does NOT load, with it the fixture loads. That proves the flag overrides a
  browser-level proxy setting; an actual system or PAC proxy was NOT tested (UNVERIFIED);
- `--ignore-certificate-errors-spki-list=<hash>` for the throwaway self-signed certificate only (the
  SHA-256 of its public key, computed with `openssl`; it works in Chrome for Testing 158), not the
  browser-wide `--ignore-certificate-errors`.

Before any x.com URL is opened, the smoke test loads the `.test` host and requires the fixture page plus
a hit on the local server; if that fails it aborts. The persistence test refuses to open any URL that is
not a `chrome-extension://` page. The served page is `dev/x-fixture.html` without its dev scripts (the
real content scripts come from the manifest). Profiles live under the OS temp dir and are deleted at
the end. Only processes the script started are killed.

## Smoke test coverage (chromium-smoke.mjs)

- (a) The extension loads. Its id comes from our service worker's script URL (Chrome for Testing has
  built-in component extensions with their own workers). `chrome.developerPrivate` (on
  `chrome://extensions`) reports state ENABLED, no manifest errors and no install warnings; Chrome's
  stderr has no extension line.
- (b) The popup page (`chrome-extension://<id>/popup/popup.html`) renders the title, header and the
  Save and Saved tabs.
- (c) SAVE_POST then LIST_POSTS through the real worker, an invalid URL (`InvalidPostUrlError`), a bad
  payload, an unknown type and non-object messages (`rejected`).
- (d) The guard with real Chrome senders: extension pages in a tab (popup.html and options.html
  opened as tabs) are allowed; the REAL toolbar popup opened with `chrome.action.openPopup()` (no tab:
  `chrome.tabs.getCurrent` is undefined there) is allowed; a content script is sent from its isolated
  world (found through CDP `Runtime.executionContextCreated`, origin `chrome-extension://<id>`):
  LIST_FOLDERS, GET_SETTINGS and SAVE_POST pass; LIST_POSTS, EXPORT_DATA, EXPORT_QUARANTINE and
  DELETE_ALL_DATA are rejected (and nothing is deleted). A page script in the main world has no
  `chrome.runtime.sendMessage` at all. Not proven: messages from another extension or a web page
  (the manifest has no `externally_connectable`, so Chrome never delivers those).
- (e) One `[data-xmark-host]` per article on the local fixture. The real Save button inside the
  closed shadow root is reached through the debugger (CDP `DOM.getDocument` with `pierce`,
  `DOM.resolveNode`, `Runtime.callFunctionOn`; page scripts cannot do this). A synthetic `.click()` on
  that real button (`isTrusted` false) opens no panel and saves nothing; a trusted CDP
  `Input.dispatchMouseEvent` click then opens the panel (positive control), trusted key events fill
  folder, tags and notes and press Save, and the post is read back with LIST_POSTS (never through the
  shadow DOM). CDP input is dispatched by the browser process and is `isTrusted`, but it is not a
  physical device. The synthetic-click check is only meaningful because the `no-trusted-check`
  mutation makes it fail (below). The panel is a separate top-level host
  (`[data-xmark-panel-host]`, in the page root while open). On a second post, choosing "Add folder…"
  by keyboard opens the options page on `#folders-add` in a new tab and creates nothing.
- (f) Private windows. Chrome does not run an unpacked extension in incognito unless "Allow in
  Incognito" is on, so an empty off-the-record context alone would say nothing about `not_allowed`.
  What is checked: `chrome.developerPrivate` reports `incognitoAccess.isEnabled === false` (the user
  cannot switch it on; field names observed in Chrome 158's own data, `isEnabled` taken to mean "the
  toggle can be used", `isActive` "it is on"), asking Chrome to enable it (the call behind the toggle)
  leaves `isActive` false, `isAllowedIncognitoAccess()` is false, and a fixture page in a CDP
  off-the-record context (`Target.createBrowserContext`; not a window a user opened) gets no Save host
  and no extension world. The mutation `incognito-spanning` (below) is the positive control: without
  the key the toggle IS available, enabling it activates the extension and it DOES run in the
  off-the-record context. Not distinguished: whether `not_allowed` or some other Chrome default is why a
  fresh unpacked extension is inactive there without the user's consent; the proof is that
  `not_allowed` blocks the user's opt-in, which the mutation shows the key controls.
- (g) Service worker lifecycle: `Target.closeTarget` on our worker (the `ServiceWorker` CDP domain is
  not available on extension workers); the next message starts a new worker (different target id) and
  nothing is lost; saves before and after a stop, and a stop between two saves, all survive.
- (h) Options > Saved (`#saved`) renders the posts the earlier flows saved and its count matches the
  library.
- (i) Permissions: `getManifest()` lists exactly `storage` and `activeTab` and the two hosts, no
  optional permissions; `permissions.getAll()` and `contains()` agree and nothing else is granted;
  `chrome://extensions` shows both hosts granted and no all-sites access; no uncaught extension error
  was recorded during the run.

## Mutation runs (does each check have power?)

`E2E_MUTATE=<name> npm run e2e:chrome` copies the built bundle into a temp dir (the repo and
`dist/chrome` are never changed), breaks one rule in the copy, runs the same checks and exits 0 only if
the named checks FAIL (each prints `MUTATION DETECTED <check>`; the other output is the normal PASS/FAIL list).

| `E2E_MUTATE=`            | Change in the copy                                           | Expected FAIL lines                                                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guard-allow-list-posts` | the content-script allow list also lets `LIST_POSTS` through | `(d) content script is rejected for LIST_POSTS`                                                                                                                                                                                                                                                |
| `no-trusted-check`       | the `isTrusted` checks are removed from the content scripts  | `(e) a synthetic (isTrusted false) click on the real button opens no panel` (and `(e) a trusted click opens the panel`, because the synthetic click already opened and the trusted one closes it)                                                                                              |
| `incognito-spanning`     | the `incognito` key is removed from the manifest             | `(f) manifest incognito is "not_allowed"`, `(f) chrome://extensions: incognito access cannot be enabled`, `(f) asking Chrome to allow incognito access changes nothing`, `(f) no content script ran in the off-the-record context`, `(f) chrome.extension.isAllowedIncognitoAccess() is false` |

The `incognito-spanning` run switches Developer mode on and calls
`chrome.developerPrivate.updateExtensionConfiguration({extensionId, incognitoAccess: true})` from
`chrome://extensions` (Chrome 138+ disables an unpacked extension on reload when Developer mode is off).

## Persistence test coverage (chromium-persistence.mjs)

Six launches on one profile, each ended by `Browser.close` with a check that no process is left:
A saves 3 posts in 2 folders with tags, notes, a snippet (snippet setting on) and a deleted post
(tombstone) and keeps the export; B (relaunch) lists equal data and an export equal to A's apart
from `exported_at`; C writes garbage to `xmark.doc` through the extension page; D (relaunch) reports
`GET_STORAGE_STATUS` quarantined, exports the copy byte for byte, shows an empty library, saves a new
post and writes a second, different garbage value; E has two copies intact and saves again; F has the
post and both copies after one more restart. The extension id is the same in every run because the
unpacked path is the same.

## What Chromium proves, and what it does not

Proves: the Chrome bundle loads in current Chromium without warnings; the background, popup, options
and content scripts work with real Chrome APIs and sender objects; the guard decisions hold; data
survives clean restarts and worker restarts.

Does not prove: a system or PAC proxy being bypassed (only the `--proxy-server` flag case); branded Google Chrome or a Chrome Web Store install; Windows and Linux; the real
x.com markup, SPA behaviour and logged-in pages; the toolbar icon on light and dark themes and real
(non-headless) window layout; crash or power-loss durability (only clean quits); the minimum Chrome
98 (only 158 was run).
