# Release checklist (owner)

From "all tasks green" to "published" for Firefox (AMO), Chrome Web Store and Safari (App Store Connect). Sources are cited per item. UNCONFIRMED means no official page fetched this session stated it.

Legend: **[manual]** always done by the owner. **[auto]** the project's GitHub Actions workflows do this (see `docs/RELEASING.md`): `ci.yml` (checks), `release.yml` (verify, zips, checksums, provenance, draft GitHub Release on a `vX.Y.Z` tag) and the manual, reviewer-gated, dry-run-by-default `deploy-firefox.yml`, `deploy-chrome.yml` and `deploy-safari.yml` (the Safari one is a scaffold). The workflows need the owner inputs listed in `docs/RELEASING.md` (environments, secrets) before they can upload anything.

## Repository protections (mandatory before any store secret is added)

See `docs/RELEASING.md` for the reasons. Tick all of these first:

- [ ] [manual] GitHub environments `amo`, `chrome-web-store`, `app-store-connect` exist, each with required reviewers and "Prevent self-review".
- [ ] [manual] Each environment is restricted to the deployment branch `main` ONLY (the deploy workflows run from `main`, never from tags). Mandatory: if the plan cannot do this, do not store store secrets in the repository (or use public visibility, or upload by hand).
- [ ] [manual] Store secrets exist only as environment secrets, never repository or organisation secrets.
- [ ] [manual] A tag ruleset for `v*` limits who can create, move or delete release tags; immutable releases are enabled (mandatory; UNCONFIRMED availability: if the plan cannot, treat release assets as untrusted and use `verify = attestation`, or `rebuild` with `ATTESTATIONS=off`).
- [ ] [manual] Branch ruleset for `main`: pull request, Code Owner review, required checks, no force push.
- [ ] [manual] Actions settings: read-only default token, approval for outside-collaborator fork workflows, allowed actions restricted to the pinned set; `actionlint` and zizmor run once over `.github/`.

## 0. Before any store

- [ ] [manual] All tasks merged, `main` green: `npm test`, `npm run lint`, `npm run build:lint` pass.
- [ ] [manual] Full QA done: `docs/MANUAL_QA.md` parts A, B, C (as far as builds exist) and D. Results table filled, no open blockers.
- [ ] [manual] `PRIVACY.md`, `docs/PRIVACY_POLICY_TEXT.md` and the store answers below agree with each other and with the code.
- [x] [manual] Real add-on id `{6c820dd8-f422-43e5-bb44-e392b7fac38a}` is set in `src/manifest.json`. Never change it after the first upload.
- [x] [manual] Public privacy policy page is live (https://github.com/Abhinavlvs/xmark-manager/blob/main/PRIVACY.md). Homepage and support URLs are the repository and its issues.
- [ ] [manual] Screenshots exist in `docs/screenshots/`: popup-save.png, popup-saved.png, popup-folders-filter.png, x-live-button.png, x-live-panel.png, options-folders.png. Resize per store below.

## 1. Version bump, changelog, tag

1. Pick the version (Semantic Versioning). First release: `0.1.0` (pre-release beta; browser manifests cannot hold `-beta.1`).
2. Edit the version in `src/manifest.json` and `package.json` (and `package-lock.json` via `npm install --package-lock-only`). They must match. [auto: `npm run release:dry-run` and `release.yml` verify equality, including the built bundles and the CHANGELOG section]
3. In `CHANGELOG.md` set the heading to `## [X.Y.Z] - YYYY-MM-DD`, empty `[Unreleased]`, and add the compare links if used.
4. Commit: `chore(release): vX.Y.Z`.
5. Tag: `git tag -a vX.Y.Z -m "vX.Y.Z"` and push the tag. [auto: the tag triggers `release.yml`, which builds and creates a draft GitHub Release with the zips, `SHA256SUMS` and the notes; you publish the draft]
6. Build the packages: `npm run package` writes the Firefox, Chrome and Safari zips to `dist/zips/`.
7. Inspect each zip: `manifest.json` at the root, no `.local`, tests, dev files or source maps.

## 2. Firefox Add-ons (AMO)

Source for the whole section: https://extensionworkshop.com/documentation/publish/submitting-an-add-on/ . Full paste-ready text: `docs/AMO_SUBMISSION.md`.

- **Account:** Mozilla Account plus a Developer Hub profile. Fee: none stated on the pages fetched (UNCONFIRMED; AMO is widely known as free, verify at sign-up).
- **Upload:** "Submit a New Add-on", choose "On this site" (listed), upload the zip (limit 200 MB), validate (errors block, warnings do not). [manual first time]
- **Source code question:** answer "No" (no minification or bundling); see AMO_SUBMISSION.md.
- **Listing fields:** name, summary (max 250 characters), description, license MIT, up to 2 categories, support details, screenshots (1280x800 recommended), listing icon 32x32 and 64x64. Source: https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/
- **Data consent:** manifest has `data_collection_permissions.required = ["none"]`. Source: https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- **Privacy questionnaire answers:** collects no data; no transmission; no third parties; local storage only. Privacy policy URL: https://github.com/Abhinavlvs/xmark-manager/blob/main/PRIVACY.md
- **Review time:** not stated in the pages fetched; UNCONFIRMED.
- **Later versions:** upload each through the add-on's AMO page so Firefox sees an update. [manual, or `deploy-firefox.yml` (AMO API v5, dry run first)]
- **Rollback (UNCONFIRMED):** AMO does not remove a bad version for you. Fix forward: bump the patch version and submit again. You can disable a version from the Developer Hub (UNCONFIRMED: check the "Manage Status and Versions" page). Users on a bad version only move when the new one is approved.

## 3. Chrome Web Store

Sources: https://developer.chrome.com/docs/webstore/register , /cws-dashboard-listing , /cws-dashboard-privacy , /images , /review-process (all under developer.chrome.com/docs/webstore/).

- **Account and fee:** register a developer account, accept the developer agreement, pay a one-time registration fee. The register page does not state the amount. The Developer Agreement leaves the amount to Google, and a search result of Google support pages mentioned $5, but I could not confirm that on a fetched page: UNCONFIRMED. Check the amount on the dashboard before paying. The developer email cannot be changed later; use an address you check often. [manual]
- **Assets (from /images):**
  - Store icon: 128x128 PNG, artwork 96x96 with 16 px transparent padding per side. Required.
  - Screenshots: 1280x800 (preferred) or 640x400, square corners, no padding, at least 1, 5 recommended.
  - Small promo tile: 440x280, optional. Marquee promo tile: 1400x560, optional.
- **Listing fields:** detailed description (start with a concise statement of what it does), primary category, language, homepage URL, support URL. Manifest name 75 and description 132 characters (limits for a separate summary: UNCONFIRMED). Paste-ready text: `docs/STORE_LISTING_CHROME.md`.
- **Privacy tab answers:**
  - Single purpose: "Save X posts into folders the user controls, stored locally on the device."
  - `storage`: stores the user's library on the device.
  - `activeTab`: reads the active tab's URL when the user clicks the toolbar button.
  - Host permissions x.com and twitter.com: show the on-page Save button and read one post's link when the user clicks Save.
  - Remote code: "No, I am not using remote code."
  - Data usage: tick nothing (no data collected). Tick the three certification statements only if the dashboard shows them and they are true.
  - Privacy policy URL: https://github.com/Abhinavlvs/xmark-manager/blob/main/PRIVACY.md
- **Review time:** most reviews finish within a few days, can take up to a few weeks; contact support if pending over three weeks (/review-process). Broad host permissions and new developers can lengthen it; we request only two hosts.
- **Later versions:** upload the new zip to the dashboard. [manual, or `deploy-chrome.yml` with `action = upload`, then a separate `action = publish` run; the first version must be uploaded by hand]
- **Rollback:** publish a new higher version with the fix (UNCONFIRMED: the store does not accept a lower version number). Rejection leaves the live listing unchanged (/review-process).

## 4. Safari (App Store Connect)

Sources: https://developer.apple.com/programs/enroll/ , https://developer.apple.com/app-store/app-privacy-details/ , https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/

- **Account and fee:** Apple Developer Program, $99 USD per year (prices vary by region), Apple Account with two-factor authentication. Individuals need legal name, email, phone, address. Organizations need a D-U-N-S number and a website. [manual]
- **Packaging:** a Safari web extension ships inside an app. Apple's converter is `xcrun safari-web-extension-converter` and the build is archived in Xcode. The Apple conversion page could not be read this session: UNCONFIRMED, read https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari before starting. `dist/safari` exists (unit-tested, unverified on a device) and `npm run safari:convert` generates a git-ignored Xcode project that `npm run safari:build` compiles unsigned (`docs/SAFARI.md`); signing, the final bundle id, a 1024 px icon and the host app screen are still TODO(owner).
- **Required assets:** Mac screenshots, at least 1, up to 10, JPEG or PNG, no alpha, one of 1280x800, 1440x900, 2560x1600, 2880x1800. If you also ship iPhone or iPad, more sizes apply (see the screenshot page). App icon requirements: UNCONFIRMED (not fetched). Name 30, subtitle 30, promotional text 170, description 4,000 characters, keywords 100 bytes. Paste-ready text and what could not be verified: `docs/STORE_LISTING_SAFARI.md`.
- **Privacy questionnaire:** Apple defines "collect" as transmitting data off the device so it can be accessed longer than needed in real time, and says on-device-only data is not collected. Answer: Data Not Collected. Privacy policy URL is required: TODO(owner). (The "Data Not Collected" option name is not on the fetched page; the choice is in App Store Connect.)
- **Safari-specific note for the listing:** users must grant website access to x.com and twitter.com; say so in the description.
- **Review time:** UNCONFIRMED.
- **Later versions:** archive, upload, submit a new build in App Store Connect. [manual; `deploy-safari.yml` is a scaffold that still needs the Xcode project and signing set-up]
- **Rollback:** submit a fixed build with a higher build number. Removing a version from sale is done in App Store Connect (UNCONFIRMED details).

## 5. After publishing

- [ ] [manual] Install from each store on a clean profile and run QA items 1, 3, 9, 13 and part D once.
- [ ] [manual] Create the GitHub release for the tag; attach the zips; paste the changelog section.
- [ ] [manual] Put store URLs into `README.md`.
- [ ] [manual] Reopen `[Unreleased]` in `CHANGELOG.md`.

## 6. Rollback summary

Stores do not roll back for you. For every store: fix forward with a higher version. If the problem is serious, unpublish or hide the listing from the store dashboard until the fix is approved, and say so in the GitHub release notes. Because data is local only, a bad release cannot leak data, but a buggy storage migration can lose it: keep the Export instructions in the release notes and never ship a change to `core/model.js` migrations without a test with an old-version library.
