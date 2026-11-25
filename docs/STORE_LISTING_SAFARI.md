# Safari (Mac App Store / TestFlight) listing pack

Paste-ready text for xmark-manager as a Safari web extension shipped inside a macOS app, submitted through App Store Connect. Items marked `TODO(owner)` need a value from the owner. Items marked UNCONFIRMED could not be verified from an official page fetched while writing this pack. See also `docs/RELEASE_CHECKLIST.md` section 4.

Build status: `npm run build` produces `dist/safari` (background scripts, PNG icons, `strict_min_version` 18.0 under `browser_specific_settings.safari`, no `incognito` key) and it is unit-tested. It is UNVERIFIED on a real Safari or device. `npm run safari:convert` and `npm run safari:build` generate and compile an unsigned Xcode project (git-ignored `safari/`, see `docs/SAFARI.md`); it has never been run in Safari. No committed Xcode project or signed host app exists in this repo.

## Limits verified from official docs

| Field                | Limit                                                                                       | Source                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| App name             | 2 to 30 characters                                                                          | https://developer.apple.com/help/app-store-connect/reference/app-information/app-information              |
| Subtitle             | 30 characters                                                                               | same page                                                                                                 |
| Promotional text     | 170 characters                                                                              | https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information |
| Description          | 4,000 characters, plain text                                                                | same page                                                                                                 |
| Keywords             | 100 bytes; each keyword longer than two characters; no app or company names                 | same page                                                                                                 |
| Support URL          | must include protocol and lead to real contact information                                  | same page                                                                                                 |
| Notes for App Review | 4,000 bytes                                                                                 | same page                                                                                                 |
| Privacy policy URL   | required for macOS apps                                                                     | app-information page above                                                                                |
| Mac screenshots      | 1280x800, 1440x900, 2560x1600 or 2880x1800; JPEG or PNG; no alpha; up to 10                 | https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/   |
| Developer Program    | USD 99 per membership year (varies by region); Apple Account with two-factor authentication | https://developer.apple.com/programs/enroll/                                                              |

## Listing fields

**App name** (30 characters or fewer): `xmark-manager` (13). Name uniqueness is checked at submission (guideline 2.3.7 says to "choose a unique name"). TODO(owner): if taken, use `xmark-manager for Safari` (25).

**Subtitle** (30 characters or fewer): `Save X posts into folders` (25). Guidelines say subtitles must follow metadata rules and avoid unverifiable claims.

**Promotional text** (170 characters or fewer):

> File posts from X into folders, with tags and notes. Search, export and import. Everything stays on your Mac: no account, no sync, no analytics.

(144 characters)

**Description** (plain text, under 4,000 characters):

```
xmark-manager lets you file posts from X (x.com) into folders you create, so you can find them again. It is a Safari extension that comes with a small Mac app.

What it does
- Adds a small Save button next to the actions of each post on x.com. Click it, pick a folder, add tags and a note, and Save.
- Or click the toolbar button on a post page and save that post from the popup.
- Browse everything you saved: search, filter by folder or tag, edit, delete, and undo a delete.
- Manage folders on the options page; the Saved page there shows the whole library on one roomy page.
- Export your library to one JSON file, and import it again. You see what will change before anything is applied.
- Optional, off by default: save the first 35 to 280 characters of a post's text with it (you choose the length; default 280).

What it never does
- It never sends data anywhere. This version makes no network requests at all, to X or to anyone else.
- It has no account, no sync, no analytics and no telemetry. The developer runs no servers.
- It reads a post only when you click the Save button on that post, and only that one post. Nothing is stored until you press Save in the panel. It does not scan your timeline or capture posts in bulk.
- It never reads cookies, tokens, or your account's name, avatar, settings, messages or notifications.
- It never clicks, likes, follows, reposts, posts or messages on X for you.
- It refuses to save from Private Browsing windows.

Turning it on
1. Open Safari, then Settings, then Extensions, and tick xmark-manager.
2. Allow it on x.com and twitter.com when Safari asks for website access. Without that access the Save button does not appear.

What is stored
The post link, the author handle, your own folder, tags and notes, and timestamps, in Safari's extension storage on your Mac. A text snippet only if you turn that option on. "Delete all local data" is on the options page. Removing the app removes the extension.

xmark-manager is an independent project. It is not affiliated with, endorsed by or sponsored by X Corp. or Apple. "X" is a trademark of its owner.
```

Guideline 4.4 says extensions must be disclosed in marketing text and should include some functionality such as help or settings screens: the description names the extension and the options page. The host app needs a minimal screen (what the extension does, how to enable it, a button to open Safari extension settings). TODO(build task). Source for 4.4: https://developer.apple.com/app-store/review/guidelines/

**Keywords** (100 bytes or fewer; do not include other apps' or companies' names, trademark terms, or the app name; guideline 2.3.7 warns against trademarked terms):

```
bookmarks,folders,notes,tags,save,posts,organize,archive,research,library,privacy,local
```

(86 bytes). Do not add "twitter", "tweet" or "X": they are third-party trademark terms and risk 2.3.7. TODO(owner): confirm.

**Category:** primary Productivity, secondary Utilities. The category list was not on the fetched pages: UNCONFIRMED. For macOS the primary category should match the Xcode setting (app-information page above). TODO(owner).

**Support URL:** https://github.com/Abhinavlvs/xmark-manager/issues (must lead to real contact information; confirm it satisfies Apple).
**Marketing URL:** TODO(owner), optional.
**Privacy policy URL:** https://github.com/Abhinavlvs/xmark-manager/blob/main/PRIVACY.md. Guideline 5.1.1 also asks for a policy link inside the app (the host app screen should link to it).
**Copyright:** TODO(owner), the holder name and year.
**Price:** free. In-app purchases: none.

## App Privacy ("nutrition label") answers

Source: https://developer.apple.com/app-store/app-privacy-details/

Apple defines "collect" as transmitting data off the device so it can be accessed for longer than needed to service a request in real time, and says data "processed only on device is not 'collected'". xmark-manager transmits nothing: no network requests, no servers, no third-party SDKs, no analytics. So:

- Data types collected: none. In the questionnaire this is the "Data Not Collected" outcome (the exact option wording was not on the page fetched: UNCONFIRMED; the form is in App Store Connect and is filled by an Account Holder, Admin or App Manager).
- Tracking: no. Linked to identity: not applicable.
- The host app and the extension must both match: no SDKs, no crash reporters that transmit, no network entitlement beyond what the sandbox needs. TODO(build task): verify the app target has no network client entitlement it does not use.

Keep this answer identical to `PRIVACY.md` and `docs/PRIVACY_POLICY_TEXT.md`.

## Age rating

Source tried: https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions . The page is long and the questionnaire wording was not confirmed from what was read: UNCONFIRMED. Answer the form truthfully for the app as shipped:

- The host app has no web browser, no in-app web view, no user-generated content, no social feed, no messaging, no ads, no purchases, no gambling, no mature content.
- The extension acts on x.com inside the user's Safari; it does not itself browse. Whether Apple's "unrestricted web access" question should be answered yes because the extension runs on a social site is a judgement the form's own definition decides. Read that question's definition and answer it as the app functions. Do not pick an answer to get a lower rating. Expect "4+" if all answers are no. UNCONFIRMED.

## Screenshots and icon

| Asset              | Requirement                                                                                                  | Status                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mac screenshots    | At least 1, up to 10; one of 1280x800, 1440x900, 2560x1600, 2880x1800; JPEG or PNG; no alpha or transparency | Existing PNGs in `docs/screenshots/` are 1280x800, one of the accepted sizes. Check they are RGB without alpha before upload (they are today).                                                                                                                                                       |
| Screenshot content | Must "accurately reflect the app's core experience" (guideline 2.3)                                          | Use real Safari windows once the build exists; the x.com images in `docs/screenshots/` are mocks, so say "illustrative" or retake in Safari.                                                                                                                                                         |
| App icon           | 1024x1024 App Store icon is the usual requirement, but the official icon pages returned no body text         | UNCONFIRMED. Read the Human Interface Guidelines "App icons" page and Xcode's asset catalog before building. The build has PNG icons at 16, 32, 48 and 128 in `dist/safari/icons` plus a black toolbar icon; the Mac app still needs an `AppIcon` asset set (1024 px source) made from the monogram. |

Suggested files, in order: `x-live-button.png`, `x-live-panel.png`, `options-saved.png`, `options-folders.png`, `options-data.png`, `options-privacy.png`.

## Review notes for Apple

Guideline 2.3.1(a) says generic review notes are rejected (https://developer.apple.com/app-store/review/guidelines/), so be specific. Limit 4,000 bytes. Paste:

```
No account or login is needed. xmark-manager is a Safari web extension packaged in a macOS app.

To test
1. Open the app once, then open Safari > Settings > Extensions and enable xmark-manager.
2. Grant website access for x.com and twitter.com only, when Safari asks. No other site is needed. The extension also uses the activeTab permission.
3. Without X: click the toolbar button on any page. The popup opens and shows its Save and Saved tabs; on a non-X page it says there is no post to save. The options page opens from the extension's preferences and from the popup.
4. With X: open any public post page on https://x.com (https://x.com/<user>/status/<id>). A Save button appears next to the post's actions. Click it, pick a folder, add tags and a note, press Save. Open the popup > Saved to see it, search it, delete it and undo.
5. Options page: folders, export to JSON, import with preview, Delete all local data, privacy and permissions notes.

Behaviour and privacy
- No data leaves the device. The extension and the app make no network requests. There are no servers, analytics or third-party SDKs.
- The extension reads a post only when the user clicks Save on it, and only that post. It never clicks, likes, follows, reposts, posts or messages on X. It reads no cookies, tokens or account details.
- Stored locally: post link, author handle, the user's folder, tags and notes, timestamps. Text snippet only if the user turns it on (off by default; the user chooses 35 to 280 characters, default 280, never more than 280).
- It is not affiliated with or endorsed by X Corp. The icon is an original "XM" monogram designed by the owner. No X logo or branding is used.
- Private Browsing: Safari does not support the `incognito: "not_allowed"` manifest value, so the user may allow the extension in private windows. The extension refuses saves there (checks the tab's private flag). Not yet verified on Safari.
```

Step 3's popup wording is from the Firefox build; check it against the real Safari build.

Honest caveat: the popup text on non-X pages and the exact Safari permission prompts were not run in Safari by this pack (no build). Verify steps against the real build with `docs/MANUAL_QA.md` Part C before submitting.

## App Review Guidelines that matter here

Source for all: https://developer.apple.com/app-store/review/guidelines/ (the last 14,000 characters of the page were not read: UNCONFIRMED whether anything there changes this).

| Guideline                    | What it asks (short)                                                                                                                                               | How xmark-manager complies                                                                                                                                                                                                                               | Risk                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1 App completeness         | Final build, working URLs, no placeholder text                                                                                                                     | All `TODO(owner)` items filled before submit; support and privacy URLs live                                                                                                                                                                              | Medium. Unfilled placeholders are the usual cause.                                                                                                                                                                                                                                                           |
| 2.3 Accurate metadata        | Screenshots and text match the real app; specific review notes; unique name; keywords not stuffed with trademarks                                                  | Text above describes only real features; no "twitter" keywords; screenshots from the real build                                                                                                                                                          | Medium. Mock x.com screenshots may be challenged.                                                                                                                                                                                                                                                            |
| 4.1 Copycats / impersonation | Do not use another party's icon, brand or product name; no impersonation                                                                                           | Original monogram, no X logo, name is "xmark-manager", description says unaffiliated                                                                                                                                                                     | Medium. The name contains "x" and the product works on X.                                                                                                                                                                                                                                                    |
| 4.2 Minimum functionality    | More than a repackaged website; works on its own                                                                                                                   | Real local features: folders, tags, notes, search, export, import, undo                                                                                                                                                                                  | Medium for the host app: it is a wrapper. Give the app a useful screen (enable steps, privacy link, status).                                                                                                                                                                                                 |
| 4.4 Extensions               | Disclose extensions in marketing; include some functionality such as help or settings; no ads or purchases in extensions                                           | Description names the extension; options page exists; no ads or purchases                                                                                                                                                                                | Low                                                                                                                                                                                                                                                                                                          |
| 4.4.2 Safari extensions      | Run on current Safari; do not interfere with Safari or system UI; no misleading content; claim only websites strictly needed                                       | Only x.com and twitter.com are requested; it adds one host element inside post action bars                                                                                                                                                               | Low to medium. `twitter.com` is justified by old links; be ready to explain.                                                                                                                                                                                                                                 |
| 5.1.1 Data collection        | Privacy policy link in App Store Connect and in the app; describe data and retention                                                                               | Policy text exists in `docs/PRIVACY_POLICY_TEXT.md`; collects nothing                                                                                                                                                                                    | Medium until the URL is live and linked inside the host app.                                                                                                                                                                                                                                                 |
| 5.1.2 Data use and sharing   | No sharing without permission; no profiling                                                                                                                        | No sharing at all                                                                                                                                                                                                                                        | Low                                                                                                                                                                                                                                                                                                          |
| 5.2 Intellectual property    | No protected material or trademarks without permission (5.2.1); do not suggest Apple endorses the app (5.2.4); do not look confusingly like Apple products (5.2.5) | No X logo or assets used; the name includes the letter x; stated as unaffiliated; says nothing about Apple endorsement                                                                                                                                   | Medium. The trademark holder can object after approval. The XM monogram is an original design by the owner and the "X" is part of the letters XM, but a reviewer might still see the crossing as echoing X's logo. Mitigations: the unaffiliated statement, original geometry, no X branding in screenshots. |
| 5.2.2 Third-party services   | Make sure the service's terms permit your use; authorization on request                                                                                            | The extension adds UI to x.com and stores user-chosen post links. It never calls X's API. It does not automate X (no clicks, likes, posts). Whether X's terms of service permit a browser extension that adds buttons to its pages was not checked here. | Medium and UNCONFIRMED. Read X's current terms before submitting and be ready to explain.                                                                                                                                                                                                                    |

## What the owner must do

- **Enrol** in the Apple Developer Program: USD 99 per year (varies by region), Apple Account with two-factor authentication. Individuals need a verified legal name, email, phone and address; organisations also need a D-U-N-S number, legal binding authority and a public website (https://developer.apple.com/programs/enroll/).
- **Bundle ids:** one for the macOS app and one for the extension target (the extension id is usually the app id plus a suffix: UNCONFIRMED). TODO(owner): choose a reverse-DNS prefix you control, for example `com.<yourname>.xmarkmanager`. Do not change it after the first upload.
- **Signing team:** the enrolled team in Xcode, automatic signing for development, distribution certificates for release. TODO(owner).
- **Packager and Xcode project:** `npm run safari:convert` wraps Apple's `xcrun safari-web-extension-packager` (flags verified in `docs/SAFARI.md`). The remaining App Store steps are UNCONFIRMED. Read https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari first.
- **Distribution route:** two routes exist in general: the Mac App Store through App Store Connect (review by Apple), or a Developer ID signed and notarised app distributed on your own site. The pages fetched this session did not describe notarisation or Developer ID, so the exact steps and fees for that route are UNCONFIRMED. This pack covers the App Store route only.
- **TestFlight:** the Mac App Store route usually supports TestFlight for testers. No page fetched this session covers TestFlight: UNCONFIRMED. Read Apple's TestFlight documentation, then test the installed build with `docs/MANUAL_QA.md` Part C before submitting for review.
- **App Store Connect record:** create the app, enter the fields above, answer App Privacy, age rating, and export compliance questions (UNCONFIRMED: whether encryption questions apply; the app uses no custom encryption but answer the form honestly).
- **Upload and submit:** archive in Xcode, upload the build, attach it to the version, paste review notes, submit for review. Review time: UNCONFIRMED.

## What I could not verify

- App icon sizes and format for the Mac App Store (both Apple icon pages returned no usable text).
- The exact wording of the App Privacy option ("Data Not Collected") and of the age-rating questions.
- Safari extension packaging steps, the converter's options and the Apple Safari web extension distribution rules (pages returned only titles).
- TestFlight for macOS, Developer ID and notarisation, export compliance questions, review time.
- Category names and whether Productivity and Utilities are both offered for macOS.
- The last 14,000 characters of the App Review Guidelines page.
- Whether X's terms permit this extension (guideline 5.2.2).
- Private-window refusal on Safari (README: not yet observed on a device; Task C3 open).
- Whether the extension id suffix convention and the exact Safari website-access prompts match the descriptions above; the Safari bundle is unverified on a real device and the generated Xcode project is not signed or committed.
