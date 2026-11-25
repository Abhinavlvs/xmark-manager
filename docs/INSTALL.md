# Install from source

xmark-manager is not in a browser store yet. Until it is published, you install it from a build of this repository. This page is the single place for Firefox, Chrome and Safari. For the testing steps that follow, see [MANUAL_QA.md](MANUAL_QA.md).

## Prerequisites

- Node.js 20 or newer (`.nvmrc` pins 22) and npm.
- A checkout of this repository, then `npm ci` once.
- Minimum browser versions: Firefox 140 (Android 142), Chrome 98, Safari 18.0.

## Build

```sh
npm ci
npm run build           # all three: dist/firefox, dist/chrome, dist/safari
npm run build:firefox   # or one browser at a time (build:chrome, build:safari)
```

Rebuild after every source change, then reload the extension in the browser.

## Firefox

Recommended for development, a persistent profile that keeps your saved data between runs:

```sh
npx web-ext run -s src --firefox-profile="$HOME/xmark-dev-profile" --profile-create-if-missing --keep-profile-changes \
  --pref=extensions.webextensions.keepStorageOnUninstall=true \
  --pref=extensions.webextensions.keepUuidOnUninstall=true
```

Use the same command every time. The two `--pref` flags stop Firefox clearing the add-on's storage and changing its internal id between runs (the same settings the persistence e2e uses); this exact command has not been run by the maintainers beyond that e2e. The first run creates the profile; later runs reuse it, so your library survives restarts. `web-ext` reloads the add-on when you change a file. Starting Firefox some other way will not load the add-on.

For a quick look in a throwaway profile (data is discarded when it closes):

```sh
npm run run
```

Or load the build into your own profile:

1. Run `npm run build:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click "Load Temporary Add-on...", then pick `dist/firefox/manifest.json`.
4. After a rebuild, click "Reload" on the add-on card.

A temporary add-on is removed (with its saved data) when Firefox restarts, and Firefox gives an extension no way to avoid that. Use the persistent profile above, or keep an export; Settings > Data has Export and Import. A permanent install needs the signed package from Firefox Add-ons.

## Chrome (and other Chromium browsers)

1. Run `npm run build:chrome`.
2. Open `chrome://extensions` and switch on "Developer mode".
3. Click "Load unpacked" and pick the `dist/chrome` folder.
4. After a rebuild, click the reload icon on the extension card.

The card should show no "Errors" button. Unpacked extensions keep their data across restarts. Automated checks use Chrome for Testing; branded Chrome is for you to try by hand.

## Safari (macOS, needs Xcode)

Safari support builds but has not been run in Safari yet, so treat these steps as unverified.

1. Run `npm run safari:convert`, which builds `dist/safari` and generates an Xcode project in the git-ignored `safari/` folder. Run `npm run safari:build` to check that it compiles unsigned.
2. Open `safari/xmark-manager/xmark-manager.xcodeproj` in Xcode. For both targets set Signing Certificate to "Sign to Run Locally" and Team to None, then Product > Run.
3. In Safari, enable Settings > Advanced > "Show features for web developers", then Settings > Developer > "Allow unsigned extensions" (it resets every time Safari quits).
4. Turn on xmark-manager in Safari > Settings > Extensions, visit x.com and allow website access from the toolbar button.

`XMARK_BUNDLE_ID` must end in `.xmark-manager`. Full details, limits and what is still unverified: [SAFARI.md](SAFARI.md).

## Check that it works

1. Open x.com in a normal (not private) window. An XM button appears in the action bar of each post.
2. Click it, choose a folder, add tags or a note, and save. The button turns blue with a check.
3. Open the toolbar popup, or the Options page from its gear icon, to see the saved post.

The extension makes no network requests and keeps everything in the browser's local storage.

## Troubleshooting

- No XM button: reload the x.com tab after installing, and make sure the window is not private (the extension refuses private windows).
- Safari asks for access: allow the site from the toolbar button; without it nothing runs.
- Build fails: check `node --version` is 20 or newer, then run `npm ci` again.
- Changes not visible: rebuild, then reload the extension and the x.com tab.
- More help: [CONTRIBUTING.md](../CONTRIBUTING.md) and [PROJECT_STATUS.md](PROJECT_STATUS.md).
