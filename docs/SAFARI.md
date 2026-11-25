# Safari

Status: the Safari bundle converts and builds into an unsigned macOS app with Apple's tooling. It has NOT yet been run in Safari by the maintainers. Everything under "Runtime" below is unverified until a person on a Mac does the checklist in `docs/MANUAL_QA.md` Part C.

Labels used here: VERIFIED = observed on the maintainer machine (Xcode 26.6, macOS 26.7) or read from the cited page. UNVERIFIED = not observed or not read. UNCONFIRMED = a page that was not read.

## Build and local test

Needs macOS with Xcode (the command line tools alone are not enough for `xcodebuild`).

```sh
npm ci
npm run safari:convert   # builds dist/safari, runs Apple's packager into safari/ (git-ignored)
npm run safari:build     # xcodebuild, unsigned Debug, derived data in a temp directory; prints the .app path
```

Both commands print `SKIP` and exit 0 when Xcode is not installed; neither is part of `npm test`. Neither launches Safari or installs anything. `safari:convert` writes only `dist/safari` (a clean rebuild) and `safari/`, and refuses to touch a symlinked `safari/` or `safari/xmark-manager`. `safari:build` writes into a temp derived-data directory (removed after a failed build; after a success it is kept and the `rm -rf` command is printed). The scripts write nothing outside the repo and the temp directory; xcodebuild itself may write caches and logs under ~/Library (UNVERIFIED). `safari:build` also prints SKIP when only the command line tools are installed (`xcodebuild -version` must run).

- Bundle id: `XMARK_BUNDLE_ID` (default `io.github.xmark-manager.xmark-manager`, a placeholder: TODO(owner) replace with the id registered in your Apple Developer account). It must end in `.xmark-manager`: VERIFIED on Xcode 26.6, the packager derives the app id as the given id minus its last component plus the app name, and the extension id as the given id plus `.Extension`; any other ending makes `xcodebuild` fail with "Embedded binary's bundle identifier is not prefixed with the parent app's bundle identifier".
- The packager is `xcrun safari-web-extension-packager` (renamed from `safari-web-extension-converter`, which still exists on this Xcode). Flags used, all VERIFIED against `--help` and Apple's page: `--project-location`, `--app-name`, `--bundle-identifier`, `--macos-only`, `--copy-resources` (the project holds its own copy of `dist/safari`, so rebuilding `dist/` does not change it until you convert again), `--no-open`, `--no-prompt`, `--force`. Not used: `--swift` (Swift is the default, VERIFIED output "Language: Swift"), `--objc`, `--ios-only`, `--rebuild-project`.
- Generated layout (VERIFIED): `safari/xmark-manager/xmark-manager.xcodeproj`, an app target `xmark-manager/` (`AppDelegate.swift`, `ViewController.swift`, `Assets.xcassets` with `AppIcon` and `LargeIcon`, `Base.lproj`) and an extension target `xmark-manager Extension/` (`Info.plist`, `SafariWebExtensionHandler.swift`, `Resources/` = the bundle).
- Packager warning (VERIFIED): "keys ... not supported by your current version of Safari: `type`, `open_in_tab`". Both are false alarms for the minimum we target: MDN browser-compat-data lists `background.type: module` from Safari 16.4 and `options_ui.open_in_tab` from Safari 14 (with the note that options always open in a tab). So no manifest change was made. Whether Safari really loads the module background is the FIRST runtime check (see below).
- Built manifest in the `.app` is byte-identical to `dist/safari/manifest.json` (VERIFIED): permissions exactly `storage`, `activeTab`; hosts `*://x.com/*`, `*://twitter.com/*`; no `incognito` key. The extension bundle contains the six PNGs (`icons/icon-{16,32,48,128}.png`, `icons/toolbar-{16,32}.png`).
- Icons: the packager generated `AppIcon.appiconset` for the host app from the manifest icons (macOS 16 to 512 at 1x and 2x; the 1024 px file is upscaled from the 128 px source: provide a real 1024 px icon before App Store submission). The toolbar icon is NOT in an asset catalog; it is the manifest `action.default_icon` PNG (`toolbar-16/32.png`, black monogram on transparent). Whether Safari tints it as a template image is UNVERIFIED (Apple page not found; the MDN note is itself unverified).
- Deployment targets (VERIFIED in the generated project): app 26.5 (the SDK default), extension 10.14. Apple's troubleshooting page says to keep them equal and not above the system you test on. Lower the app target if you test on an older macOS. Version shown is `1.0` (packager default), not `0.1.0`: set `MARKETING_VERSION` in Xcode.

### Run it locally (needs a human)

Apple's documented route (VERIFIED, read from the page below): the extension must be signed, or Safari must be told to run unsigned extensions.

1. Open `safari/xmark-manager/xmark-manager.xcodeproj` in Xcode. For both targets, Signing & Capabilities > Signing Certificate "Sign to Run Locally", Team None (this is the route in Apple's sample-code README). Product > Run.
2. Safari > Settings > Advanced > tick "Show features for web developers" (Safari 17+), then Settings > Developer > tick "Allow unsigned extensions". It resets every time Safari quits. (Safari 16 and earlier: Develop > Allow Unsigned Extensions.)
3. Safari > Settings > Extensions: tick xmark-manager.
4. Visit x.com, click the toolbar button and allow website access (see below).

Alternative without Xcode: Safari > Settings > Developer > "Add Temporary Extension..." and pick the `dist/safari` folder or its zip. Apple states temporary extensions are removed after 24 hours or when Safari quits. It cannot test storage persistence across restarts.

Whether the unsigned build from `npm run safari:build` (`CODE_SIGNING_ALLOWED=NO`, ad-hoc linker signature, no entitlements embedded; VERIFIED with `codesign -d`) is picked up by Safari is UNVERIFIED. It exists to prove the project compiles. Use the Xcode "Sign to Run Locally" route above for runtime testing.

## Facts from Apple and MDN

| Claim                                                                                                                                                                                                                                                          | Status                                                                                        | Source                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Flags `--project-location --app-name --bundle-identifier --macos-only --copy-resources --no-open --no-prompt --force --swift`; tool renamed from converter to packager; project references original files unless `--copy-resources`                            | VERIFIED (page and `--help`)                                                                  | https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari.md                                                       |
| Safari ignores unsigned extensions by default; "Allow unsigned extensions" in Settings > Developer (Safari 17+), resets on quit; "Add Temporary Extension" lasts 24 h or until quit                                                                            | VERIFIED (page)                                                                               | https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension.md                                                          |
| "Sign to Run Locally", Team None, for local runs                                                                                                                                                                                                               | VERIFIED (sample-code README)                                                                 | https://developer.apple.com/documentation/safariservices/developing-a-safari-web-extension.md                                                          |
| Safari 15.4+ supports MV2 and MV3; all MV3 background pages are non-persistent; unsupported manifest keys are generally ignored; `chrome.*` and `browser.*` both exist, callbacks and promises both work; `tabs` needs host permission                         | VERIFIED (page)                                                                               | https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility.md                                |
| `storage.local` exists; quota 5 MB (more only with `unlimited`); `storage.sync` does not sync                                                                                                                                                                  | VERIFIED (page). That `storage.local` persists across Safari restarts: UNVERIFIED on a device | same page                                                                                                                                              |
| Permissions: user grants access per site (once, for the day, or always) from the toolbar button; Settings > Websites to change to Ask/Allow/Deny; `activeTab` recommended; in Safari 17+ access granted to a site applies across profiles AND private browsing | VERIFIED (page)                                                                               | https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions.md                                                  |
| `background.type: module` Safari 16.4; `service_worker` Safari 15.4; `scripts` Safari 14; `strict_min_version` supported in `browser_specific_settings.safari` since Safari 14; `open_in_tab` ignored (options open in a tab)                                  | VERIFIED (BCD data)                                                                           | https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/background.json , .../browser_specific_settings.json , .../options_ui.json |
| Debugging: Develop > Web Extension Background Content (Safari 17+) or Web Extension Background Pages; popup via Control-click > Inspect Element; `pluginkit -mAvvv -p com.apple.Safari.web-extension` lists installed extensions                               | VERIFIED (page)                                                                               | https://developer.apple.com/documentation/safariservices/troubleshooting-your-safari-web-extension.md                                                  |
| Extension page URL is `safari-web-extension://<UUID>/` (uppercase UUID host; random per build or session per forum report)                                                                                                                                     | Partly VERIFIED: seen in bug reports, not in Apple's docs                                     | https://bugs.webkit.org/show_bug.cgi?id=256054 , https://developer.apple.com/forums/thread/670165                                                      |
| `incognito: "not_allowed"` unsupported in Safari                                                                                                                                                                                                               | VERIFIED (MDN BCD note and WebKit bug)                                                        | https://bugs.webkit.org/show_bug.cgi?id=280785                                                                                                         |
| Toolbar icons treated as template images                                                                                                                                                                                                                       | UNVERIFIED (no Apple page found)                                                              | n/a                                                                                                                                                    |
| Popup size limits, service-worker versus scripts lifecycle details                                                                                                                                                                                             | UNVERIFIED                                                                                    | n/a                                                                                                                                                    |

Background form: the Safari manifest keeps `background: {scripts: [...], type: "module"}`, not `service_worker`. Reason: MDN lists both; `scripts` is older (Safari 14) and the project already uses it on Firefox, so the code path is shared. Which one Safari prefers when both exist is irrelevant because only `scripts` is present. UNVERIFIED at runtime.

Private windows: the manifest cannot opt out. Apple says (Safari 17+) site access granted once applies to private browsing too, so the extension must refuse by itself: popup sends the active tab's `incognito`, content-script messages are checked via `sender.tab.incognito`, and the guard rejects `SAVE_POST` for either. Whether Safari reports those flags truthfully is UNVERIFIED (see checklist).

## First check on a Mac: the module background

Do this before any other runtime check. The Safari manifest uses `background: {scripts, type: "module"}` and the background code uses `import`.

1. Safari > Develop > Web Extension Background Content > xmark-manager > inspect.
2. Console must show no "Cannot use import statement" or module-load error. In the console, `browser.runtime.getURL('')` must return `safari-web-extension://<UUID>/`.
3. Make one save round trip from the popup (open a real post, Save, see it in the Saved tab).

Failure mode: the background never starts, so every popup and content-script action fails (the message guard also throws at start-up if `getURL('')` is not an extension origin). Decision rule: only if this check fails, build a classic-script background fallback (a bundled non-module background for Safari). Do not build it now.

## Known limitations

- Not run in Safari by the maintainers. macOS only (`--macos-only`); iOS needs `--rebuild-project` or a new conversion and a paid account for devices.
- Safari 18.0 minimum is our choice (`strict_min_version`); whether Safari enforces it is UNVERIFIED.
- Packager reports `type` and `open_in_tab` as unsupported; both are expected to work (see above) but are runtime-unverified.
- Generated Xcode project is not committed. Argument: it is regenerated deterministically from `dist/safari` by one command, contains machine-specific paths and a 1024 px upscaled icon, and the real signing settings are owner inputs. If the owner wants App Store builds, commit the project after setting team, bundle id, version and icon, and have CI fill `Resources/` from `dist/safari`.

## Distribution (owner)

Needs an Apple Developer Program membership (paid; VERIFIED requirement for the web-based packager and for device testing, from the pages above). Owner inputs: Apple Team ID, final reverse-DNS bundle id, app name and 1024 px icon, version numbers.

1. Choose a bundle id ending in `.xmark-manager` (or change the app name consistently) and set `XMARK_BUNDLE_ID`.
2. Convert, open in Xcode, set Team for both targets, set `MARKETING_VERSION` and build number, Product > Archive, Distribute App > App Store Connect. (Xcode steps UNCONFIRMED: not read this session.)
3. Alternative that needs no Mac or Xcode: App Store Connect > Users and Access > Xcode Cloud tab > Safari Web Extension Packager > upload the `xmark-manager-<version>-safari.zip` from `npm run package`. After creating an app record (platform, name, bundle id, SKU, user access), packaging output goes to TestFlight or App Store review. Packaging compute counts against the 25 h per month of Xcode Cloud in the membership. Whether that page accepts the `npm run package` zip layout (manifest at the zip root, no wrapping folder) is UNCONFIRMED: the page says to upload the full contents of the extension including the manifest, nothing more specific. Source (read): https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect.md
4. App Store review needs metadata, screenshots and a privacy policy URL: UNCONFIRMED, not read (see https://developer.apple.com/help/app-store-connect/ ). The privacy text is in `docs/PRIVACY_POLICY_TEXT.md`. App Privacy answers should be "data not collected" (the extension makes no network requests).

Developer ID signing for outside the App Store (notarization) is also possible but UNCONFIRMED here.
