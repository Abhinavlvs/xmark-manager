# Releasing

How a release of xmark-manager is cut, built, attested and sent to the stores. Everything here is written so that nothing is published by accident: the release workflow only ever creates a DRAFT GitHub Release, and every store upload is a separate, manual, reviewer-gated run that is a dry run unless you switch that off.

UNCONFIRMED means the claim could not be verified from an official page while this was written. The source that was tried is named so you can check it.

## Overview

| Workflow                   | Trigger                        | What it does                                                                                | Publishes?                       |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------- |
| `ci.yml`                   | pull request, push to `main`   | lint, tests (Node 20 and 22), build, `web-ext lint`, audit, zips as artifacts               | no                               |
| `release.yml`              | tag `vX.Y.Z`, manual rehearsal | verify, build, `SHA256SUMS`, `release-manifest.json`, provenance attestation, draft Release | draft only, never on a rehearsal |
| `deploy-firefox.yml`       | manual                         | verifies the release files, uploads the Firefox zip to AMO                                  | only with `dry_run` off          |
| `deploy-chrome.yml`        | manual                         | uploads the Chrome zip as a draft, or publishes it (separate run), or reads the status      | only with `dry_run` off          |
| `deploy-safari.yml`        | manual                         | macOS: builds the Safari app and uploads it to App Store Connect (scaffold, see below)      | only with `dry_run` off          |
| `codeql.yml`               | push, pull request, weekly     | CodeQL analysis of the JavaScript                                                           | no                               |
| `dependency-review.yml`    | pull request                   | fails PRs that add dependencies with known high-severity advisories                         | no                               |
| `scorecard.yml` (optional) | push, weekly, manual           | OpenSSF Scorecard to the Security tab                                                       | no                               |

Locally, `npm run release:dry-run` runs the same checks and builds as `release.yml` (`scripts/release-dry-run.mjs`). CI calls the same script, so both agree.

## Cut a release, step by step

1. Decide the version `X.Y.Z` (Semantic Versioning).
2. Bump it in all three places, in one commit on a branch:
   - `package.json` `version`
   - `src/manifest.json` `version` (the Chrome and Safari manifests are derived from it)
   - `CHANGELOG.md`: add a `## [X.Y.Z] - YYYY-MM-DD` section with the user-facing changes (the release notes are cut from it). Move entries out of `[Unreleased]`.
3. Run the local rehearsal:
   ```sh
   npm run lint && npm test && npm run build:lint
   npm run release:dry-run -- --tag vX.Y.Z
   ```
   It checks that the tag, `package.json`, `src/manifest.json` and all three built manifests agree, that the changelog section exists and is not empty, then writes to `dist/release/`: the three zips, `SHA256SUMS`, `release-manifest.json` and `RELEASE_NOTES.md`. It never touches git or the network. A failed check names every mismatch.
4. Open the pull request, let CI pass, get the review required by the branch protection, merge to `main`.
5. Rehearse in CI: Actions, "Release", "Run workflow" from `main`, leave `dry_run` ticked (a manual run is always a rehearsal; unticking it fails). This verifies and builds in CI and uploads the files as the `release-dist` artifact; nothing is attested or published.
6. Tag the merged commit and push the tag:
   ```sh
   git tag -s vX.Y.Z -m "xmark-manager X.Y.Z"   # or: git tag -a
   git push origin vX.Y.Z
   ```
   The workflow refuses a tag that is not on `main`.
7. `release.yml` runs: `verify` (workflow invariants with every action pinned, version and changelog checks, lint, tests, `web-ext lint`), `package` (zips, checksums, manifest), `attest` (build provenance for the three zips, `SHA256SUMS` and `release-manifest.json`) and `github-release` (a DRAFT release with the notes and files).
8. Open the draft release, compare its files with `SHA256SUMS`, edit the notes if needed and publish it by hand.
9. Send to the stores, each a dry run first (see "Store deployment").

Only a tag push is attested and turned into a draft release, so only tag builds can be deployed. Anyone who can create a `v*` tag can start that pipeline, which is why the tag ruleset below is mandatory. The release workflow uses the Node version in `.nvmrc` (exact) and no dependency cache.

## Store deployment

Every deploy workflow is manual (`workflow_dispatch`), never runs on `pull_request`, and its jobs are split by trust:

1. `verify` (Safari also has `unsigned-build`): no `environment:` and no secrets, so it needs no approval. It downloads the release files, checks them against `SHA256SUMS`, proves where they came from (below) and, for Firefox and Chrome, prints what would be sent. It checks the release files, the version and tag consistency, the signer identity and the metadata path; it does NOT check that secrets or environments exist (the job cannot see them by design), so a missing secret first shows up in the real run. It outputs the verified `name:sha256` list of the zips.
2. `deploy`: needs `verify`, runs only when `dry_run` is unticked, and is the only job with the GitHub environment (required reviewers) and the secrets. It downloads the files again (nothing is trusted across jobs) and verifies them again; it NEVER executes code from a release tag.

Every job runs from `main` only: `if: github.ref == 'refs/heads/main'` (not tags: a tag would run an old version of the workflow and the scripts with the secrets). That is defence in depth: the environment deployment-branch restriction below (`main` only) is MANDATORY, because without it code from any branch would run with the store secrets after a reviewer approves. Jobs that run the verification have `contents: read`, `actions: read` and `attestations: read`; `attestations: read` is what lets `gh attestation verify` read attestations of a private repository (GitHub docs, https://docs.github.com/en/rest/repos/attestations, read: `GET /repos/{owner}/{repo}/attestations/{subject_digest}` needs the `attestations:read` permission for fine-grained tokens; that the `GITHUB_TOKEN` of a workflow needs `attestations: read` for `gh attestation verify` on private repositories is the reviewer's finding, UNCONFIRMED by a workflow run).

#### Proving the release files (cannot be skipped)

The composite action `.github/actions/fetch-release` downloads the files (`release` by tag, or `run` by Release workflow run id), requires `SHA256SUMS` to list exactly the zips and to match, requires `release-manifest.json` to hold a strict semver version equal to the tag (anchored bash regex, no newline can slip into `$GITHUB_OUTPUT`; an old release or run cannot be replayed under a new name), resolves the tag to its commit, and then runs ONE of two checks chosen by the `verify` input. Any other value fails, and a failure stops the job before anything is sent (the workflow test checks this ordering):

- `attestation` (default): `gh attestation verify` for every zip AND `SHA256SUMS` and `release-manifest.json`, with `--repo`, the exact `--cert-identity "https://github.com/<repo>/.github/workflows/release.yml@refs/tags/<tag>"`, `--cert-oidc-issuer https://token.actions.githubusercontent.com`, `--source-ref refs/tags/<tag>`, `--source-digest <tag commit>` and `--deny-self-hosted-runners`. Without the identity and ref flags `--repo` only proves "some workflow of this repository built it", which a branch workflow could also do. The certificate identity names the workflow file and the ref exactly, independent of how a given `gh` version parses `--signer-workflow`; the manual (https://cli.github.com/manual/gh_attestation_verify, read) says the signer path is validated "using the `--signer-workflow` or `--cert-identity` flags" and documents no combination of the two, so only `--cert-identity` is used. The `--source-ref` value `refs/tags/vX.Y.Z` is the full ref as recorded in the certificate (checked by the reviewer against the gh source and the Fulcio documentation). For `source = run` the action also reads the run (`gh api repos/<repo>/actions/runs/<id>`) and requires path `.github/workflows/release.yml`, event `push`, conclusion `success`, head repository equal to this repository, a head branch that is a release tag, and `head_sha` equal to the commit the tag points to (UNCONFIRMED: the exact form of the `path` field; an `@ref` suffix is stripped, and the check fails closed if it differs).
- `rebuild`: only when the repository variable `ATTESTATIONS` is `off` (the action refuses it otherwise, so it cannot be chosen as a downgrade). The rebuild executes the tag's own code, therefore it runs ONLY in the secret-free `verify` job (`rebuild_here`): the tag is checked out with its history, must be the commit the release tag resolves to and an ancestor of `origin/main` (the same invariant `release.yml` enforces), Node comes from its `.nvmrc`, `npm ci --ignore-scripts` runs, and `node scripts/verify-rebuild.mjs` requires every zip's sha256 and the `SHA256SUMS` text to equal the downloaded ones (it hashes the zips itself). The `deploy` job, which holds the secrets, runs no tag code: it only requires its downloaded hashes to equal the `verify` job's output. The rebuild runs on ubuntu even for the Safari bundle (the Safari zip is produced by `release.yml` on ubuntu as well); byte identity across operating systems and CPU architectures is UNCONFIRMED. Residual trust: `rebuild` proves the zips equal a clean build of a tag on `main`, but cannot prove which workflow made the GitHub Release or the artifact. For `source = release` the release assets are untrusted data: that is why immutable releases and the tag ruleset are mandatory, and why the zips are only accepted if they equal the rebuild.

Attestations on private repositories: UNCONFIRMED. The GitHub documentation page read (https://docs.github.com/en/actions/concepts/security/artifact-attestations) says only that private repositories use GitHub's own Sigstore instance and does not state the plans; availability on some private-repository plans may be limited (check your plan in the GitHub docs). If the `attest` job cannot run, set the repository variable `ATTESTATIONS` to `off` (the release then skips the attestation) and run every deploy with `verify = rebuild`. Do NOT remove the verification step.

### Firefox (AMO), `deploy-firefox.yml`, environment `amo`

- Secrets: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` (AMO developer hub, "Manage API Keys").
- The script `scripts/release-firefox.mjs` uses the AMO REST API v5, not `web-ext sign`, because `web-ext sign` builds the package from a directory and could not upload the byte-identical checksummed zip. Flow: `POST /api/v5/addons/upload/` (multipart `upload` and `channel`), poll `GET /api/v5/addons/upload/<uuid>/` until `processed` and `valid`, then either `POST /api/v5/addons/addon/<guid>/versions/` (existing add-on) or `POST /api/v5/addons/addon/` (first submission). Auth is `Authorization: JWT <HS256 token>` with claims `iss`, `jti`, `iat`, `exp` (at most five minutes). Sources: https://mozilla.github.io/addons-server/topics/api/addons.html and https://mozilla.github.io/addons-server/topics/api/auth.html (both read).
- First submission versus later versions:
  - A LISTED first submission needs metadata: add-on `name`, `summary`, `categories` per supported app and the version `license`. Pass a JSON file with `metadata_file` (same fields as `web-ext --amo-metadata`, https://extensionworkshop.com/documentation/develop/web-ext-command-reference/). The file is not in the repository yet: TODO(owner), the listing text lives in `docs/AMO_SUBMISSION.md`.
  - Later listed versions only need the upload; the license is inherited when omitted (documented for the version endpoint).
  - UNCONFIRMED: whether the first submission of a brand new add-on is better done once by hand in the AMO developer hub (the listing form, screenshots, privacy policy URL and "notes to reviewer" from `docs/AMO_SUBMISSION.md` are web form fields). Source tried: the two addons-server pages above, which do not say.
  - UNCONFIRMED: how and when source code must be uploaded for review (the zip is a plain copy of `src/` plus the derived manifest, so it is human-readable). `web-ext` has `--upload-source-code`; the v5 version endpoint accepts a multipart `source` field. The script does not send source.
  - UNCONFIRMED: how the signed file of an `unlisted` upload is downloaded after review. Source tried: the v5 addons page (version detail), not read to the end.
- The script refuses a real upload while `src/manifest.json` still has the placeholder add-on id (`xmark-manager@placeholder.invalid`). Set the real id first, and never change it afterwards.
- `metadata_file` must be a relative path of letters, digits, `.`, `_`, `-` and `/` ending in `.json`, without `..`, inside the workspace; the script never prints the file's content, not even in parse errors. The version in the zip's manifest must equal the release version (`--expected-version`).
- Dry run: prints the upload and API plan (it reads the metadata file to validate it). All requests have a timeout; lookups (GET) are retried a few times, the upload and create POSTs are never retried.

### Chrome Web Store, `deploy-chrome.yml`, environment `chrome-web-store`

- Secrets: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID`, and `CWS_PUBLISHER_ID` (the v2 API needs the publisher id from the Developer Dashboard, Publisher, Settings; it is not secret but is stored with the others for convenience).
- The Chrome Web Store API v2 (https://developer.chrome.com/docs/webstore/using-api, read) is used by `scripts/release-chrome.mjs` (zero dependencies): token from `https://oauth2.googleapis.com/token`, `POST .../upload/v2/publishers/{P}/items/{E}:upload` (raw zip), `POST .../v2/publishers/{P}/items/{E}:publish`, `GET .../v2/publishers/{P}/items/{E}:fetchStatus`. The older v1.1 endpoints are not used.
- The API cannot create an item: upload the FIRST version in the Developer Dashboard by hand and complete the Store listing and Privacy tabs. Later versions can go through this workflow; the manifest `version` must be higher than the last upload.
- Two manual steps by design: run with `action = upload` (creates a draft), look at it in the dashboard, then run again with `action = publish`. `action = status` reads the item status.
- Upload states (https://developer.chrome.com/docs/webstore/api/reference/rest/v2/UploadState, read): `UPLOAD_STATE_UNSPECIFIED`, `SUCCEEDED`, `IN_PROGRESS`, `FAILED`, `NOT_FOUND`. The upload response has `uploadState`; `fetchStatus` returns `lastAsyncUploadState` (plus `name`, `itemId`, `publicKey`, `publishedItemRevisionStatus`, `submittedItemRevisionStatus`, `takenDown`, `warned`; https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus, read). The script polls `lastAsyncUploadState` for a bounded time while it is `IN_PROGRESS` and treats only `SUCCEEDED` as success.
- Publish (https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish, read): the request body may carry `publishType` (`DEFAULT_PUBLISH` publishes right after approval, `STAGED_PUBLISH` waits for you; unset means default), `deployInfos` (initial percentage rollout; unset means the dashboard value), `skipReview` (default false; the API errors if the item needs review) and `blockOnWarnings` (default false). The response has `name`, `itemId`, `state` and `warningInfo`. This workflow sends NO body, so the defaults apply: default publish, no `skipReview`, no `blockOnWarnings`. If you want a staged rollout, publish with `publishType` by hand or extend the script.
- Publish is tied to the verified release: the script reads `fetchStatus` first and refuses unless `submittedItemRevisionStatus.distributionChannels[].crxVersion` equals the release version, and the upload step refuses a response whose `crxVersion` differs. UNCONFIRMED: the field name `crxVersion` inside `distributionChannels` (the reference read only names `distributionChannels[]`; the upload response does document `crxVersion`); if it cannot be read, publishing is refused.

### Safari (App Store Connect), `deploy-safari.yml`, environment `app-store-connect`

- Secrets: `APPLE_CERTIFICATE_P12_BASE64`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_PROVISIONING_PROFILE_BASE64`, `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_API_ISSUER_ID`, `APP_STORE_CONNECT_API_PRIVATE_KEY`.
- STATUS: scaffold. `scripts/safari/*.mjs` and the Xcode project come from the Safari task (C3) and are not on this branch. The dry run unpacks the released Safari zip, tries `xcrun safari-web-extension-converter` and an unsigned `xcodebuild`, and stops. A real run fails early with a TODO until the Safari scripts exist.
- Signing steps are written but untested: a temporary keychain is created, the certificate and provisioning profile are imported, and the keychain and key files are deleted in an `always()` step. Secrets are only passed through `env:`. The certificate is imported with `-T /usr/bin/codesign -T /usr/bin/security` (not `-A`), and the cleanup step also deletes the installed provisioning profile. The p12 passphrase is passed to `security import -P` as an argument because the tool has no stdin or file option (UNCONFIRMED: `man security`); on a runner every process on the machine can read it with `ps`, so this is acceptable only on a single-use GitHub-hosted VM and must never run on a self-hosted runner. The value is a masked secret.
- UNCONFIRMED (Apple pages could not be read; the commands come from general knowledge): `xcodebuild -exportArchive` with an `ExportOptions.plist` using `method app-store-connect` and `destination upload` plus `-authenticationKeyPath/-authenticationKeyID/-authenticationKeyIssuerID`; `xcrun altool --upload-app` with `--apiKey/--apiIssuer` is the alternative and may be phased out. The converter flags `--no-open --no-prompt --project-location`. Confirm all of this on a Mac before the first run. Source tried: https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases (the fetched page was empty).
- Apple review of the app, App Store listing and TestFlight are done in App Store Connect by hand.

## One-time repository setup (owner)

### Environments (all mandatory)

Settings, Environments, "New environment", for each of `amo`, `chrome-web-store`, `app-store-connect`:

1. Tick "Required reviewers" and add yourself (or a team); tick "Prevent self-review" as soon as a second person exists.
2. Under "Deployment branches and tags" choose "Selected branches and tags" and add `main` ONLY (not `v*`: the deploy workflows run from `main`). This is MANDATORY, not optional: it is what stops a branch workflow from receiving the store secrets. If your GitHub plan does not offer deployment-branch rules or required reviewers for environments (UNCONFIRMED which private-repository plans include them; source tried: GitHub docs "Managing environments for deployment"), do NOT store any store secret in this repository. Make the repository public, or upgrade, or run the uploads by hand from your own machine.
3. Add the secrets of that environment as ENVIRONMENT secrets only (never repository or organisation secrets), names above. Values never go in files, issues or workflow inputs.

Repository variables (not secret): `GECKODRIVER_SHA256` (only for the manual e2e job) and, only if attestations are unavailable, `ATTESTATIONS=off`.

### Tag ruleset and releases

- Settings, Rules, Rulesets, new TAG ruleset for the pattern `v*`: restrict creation, update and deletion to maintainers (the release pipeline starts from a tag push, so tag creation is the privilege that matters). Block force pushes.
- Settings, General, Releases: enable "Immutable releases" (MANDATORY; UNCONFIRMED: availability and wording, check the GitHub docs for your plan) so a published release's files and tag cannot be changed afterwards. If your plan cannot do this, treat release assets as untrusted: deploy only with `verify = attestation`, or with `verify = rebuild` (which accepts a zip only if it equals a clean rebuild of a tag on `main`), and never from a release you did not just publish.
- A `release` environment with required reviewers on the `github-release` job is an optional extra if you want a human gate before the draft is created; it is not wired in by default because the draft already needs a human to publish.

### Branch ruleset for `main`

Require a pull request with at least one approval, review from Code Owners, the required status checks `Lint and format`, `Test and build (Node 20.x)` and `Test and build (Node 22.x)`, branches up to date before merging, no force pushes, no deletions, and signed commits if you sign. CI jobs skipped by the docs-only filter report as skipped, which counts as passing for required checks.

### Actions settings

- Settings, Actions, General: default workflow token permission "Read repository contents"; do not allow Actions to create pull requests; require approval for fork pull request workflows from outside collaborators (choose the strictest option offered); allow only the pinned actions used here (`actions/*`, `github/codeql-action/*`, `ossf/scorecard-action`) plus GitHub-verified ones.
- Settings, Advanced Security (or Code security): enable dependency graph, Dependabot alerts and security updates, secret scanning and push protection where available.
- Run `actionlint` and [zizmor](https://github.com/woodruffw/zizmor) once over `.github/` and fix what they report (neither is installed by this repository, and neither could be run when these files were written; the repository's own `npm test` check is a smaller, line-based subset).

### Pinning actions

Every third-party action is pinned by full 40-character commit SHA, with the exact version in a trailing comment. The pins were resolved from the public tag lists (`git ls-remote --tags`, using the dereferenced commit for annotated tags) and the `action.yml` of each tag was read to check the inputs the workflows use:

| Action                                                                  | Tag     | Commit                                     |
| ----------------------------------------------------------------------- | ------- | ------------------------------------------ |
| `actions/checkout`                                                      | v7.0.1  | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node`                                                    | v7.1.0  | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| `actions/upload-artifact`                                               | v7.0.2  | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| `actions/download-artifact`                                             | v8.0.2  | `9000827ccba6bdab643e8b6fd33ac0654aef8333` |
| `actions/attest-build-provenance`                                       | v4.2.2  | `4d101475d8b20a2381f78447822ac1eab6504dd8` |
| `actions/dependency-review-action`                                      | v5.0.1  | `bbc44d14a204704ccc493733616cd1e93a0321ec` |
| `github/codeql-action` (`init`, `analyze`, `upload-sarif`, one release) | v4.39.4 | `1bd86f2fdb4b86187fa4059f16f31a3202acc9ea` |
| `ossf/scorecard-action`                                                 | v2.6.0  | `23f22cd43608bae7a1f1fa2603d7314dee9538a5` |

Dependabot (`.github/dependabot.yml`, ecosystem `github-actions`, weekly, minor and patch grouped) opens pull requests that move both the SHA and the comment, so the pins stay fresh. Review each such pull request: read the release notes and the diff of the action.

The tests enforce the pinning:

- `npm test` fails on any `uses:` that is not a local path or a 40-hex SHA (a tag, a branch or no ref is always an error);
- the placeholder `@PIN_ME` is accepted only while writing a new workflow: the test prints the list of unpinned actions, and fails on them when `REQUIRE_PINNED=1`, which `ci.yml` and `release.yml` both set;
- to pin a new action, resolve its tag with `git ls-remote --tags https://github.com/<owner>/<repo>` (for an annotated tag use the `refs/tags/<tag>^{}` line, the commit, not the tag object).

Notes from reading the pinned `action.yml` files: all of them run on the Node 24 runtime (hosted runners are current enough; self-hosted runners need a recent runner version, UNCONFIRMED which); `actions/attest-build-provenance` v4 is a thin wrapper around `actions/attest` and its `create-storage-record` input is switched off because it is for registry pushes; `actions/download-artifact` v8 unpacks by default (`skip-decompress` is false).

## Provenance and checksums for users

Every release carries `SHA256SUMS` and `release-manifest.json` (file names, sizes, sha256, version, commit, source date, and an empty `runtimeDependencies` list: the extension has none).

```sh
# checksums (Linux; on macOS use: shasum -a 256 -c SHA256SUMS)
sha256sum --check SHA256SUMS

# build provenance attestation (GitHub CLI 2.49+ is believed to include this; UNCONFIRMED)
gh attestation verify xmark-manager-X.Y.Z-firefox.zip --repo OWNER/REPO
```

The attestation shows which workflow run on which commit built the file. For the strictest check pin the signer and tag as the deploy workflows do: add `--cert-identity https://github.com/OWNER/REPO/.github/workflows/release.yml@refs/tags/vX.Y.Z --cert-oidc-issuer https://token.actions.githubusercontent.com --source-ref refs/tags/vX.Y.Z`. The flags are documented at https://cli.github.com/manual/gh_attestation_verify. Attestations on PRIVATE repositories are UNCONFIRMED (see "Proving the release files"); without them users can still check the checksums, and you can rebuild the tag with `node scripts/verify-rebuild.mjs --tag vX.Y.Z --dir <downloads>` (needs `npm ci` and the Node version in `.nvmrc`).

Builds are intended to be reproducible: the zips use fixed timestamps and sorted entries (`scripts/zip.mjs`), and `release-manifest.json` carries the commit and source date. Compare the checksums of a local `npm run release:dry-run` with the release to check. Whether the output is byte-identical across Node or OS versions is UNVERIFIED (the zlib output may differ between Node versions).

## Rolling back

- GitHub Release: delete the draft, or unpublish it; a pushed tag can be deleted (`git push origin :refs/tags/vX.Y.Z`) only if no one relies on it. Prefer a new patch version.
- Firefox AMO: UNCONFIRMED. Source tried: addons-server API docs (no delete/disable-version endpoint seen). In the developer hub a version can be disabled by the developer; users keep it until updated. The way to "roll back" is a new version with a higher number.
- Chrome Web Store: UNCONFIRMED. Source tried: the v2 API page (no cancel or rollback operation named). The dashboard offers cancelling a review in progress and "Rollback" to a previous published version (UNCONFIRMED); versions must still only go up.
- Safari: a build in App Store Connect can be removed from review or a new build submitted; UNCONFIRMED details (Apple pages not read).

In all stores the safe rollback is a fixed release with a higher version number.

## Owner inputs still needed

- Repository: name, owner and visibility (public or private). Needed for badges, `gh attestation verify --repo`, CodeQL, dependency review and attestations (see UNCONFIRMED notes for private).
- `.github/CODEOWNERS`: set to `@Abhinavlvs` (done).
- GitHub environments `amo`, `chrome-web-store`, `app-store-connect` with required reviewers and the secrets listed above (names only here).
- Variable `GECKODRIVER_SHA256` for the manual e2e job.
- Real Firefox add-on id in `src/manifest.json` (currently a placeholder), AMO account and API key, AMO metadata JSON for the first listed submission.
- Chrome Web Store developer account, the first upload done by hand in the dashboard, OAuth client and refresh token, publisher id.
- Apple Developer Program membership, Mac signing certificate and provisioning profile, App Store Connect API key, the Safari wrapper project (task C3).
- Release date: `CHANGELOG.md` must carry a `YYYY-MM-DD` date in the heading of the version being tagged (`## [0.1.0] - 2026-11-21` today). The release workflow fails on a placeholder; `npm run release:dry-run --dry-run` only warns.
- Privacy policy URL (required by the stores; see `docs/PRIVACY_POLICY_TEXT.md`).

## Linting the workflows

The repository ships a zero-dependency check (`scripts/release-workflow-lint.mjs`, run by `npm test`): a top-level `permissions:` block, no `pull_request_target`, every `uses:` pinned to a full commit SHA, `persist-credentials: false` after every checkout, no secrets in workflows triggered by `pull_request`, and no `inputs.*`, `github.event.*` or `secrets.*` interpolated into `run:` scripts. It is a line-based check, not a YAML parser.

For full validation use [actionlint](https://github.com/rhysd/actionlint) (not installed by this repository; install it separately, for example `brew install actionlint`, then run `actionlint` in the repository root). It was not available when these files were written, so the workflows have only been checked for valid YAML syntax and by the repository test, never executed on GitHub.

## The manual end-to-end job

`ci.yml` has an `e2e` job that only runs from "Run workflow" with the `e2e` box ticked. It installs geckodriver `0.37.1` from the official release, verifies it against the repository variable `GECKODRIVER_SHA256`, uses the Firefox on the runner (UNCONFIRMED to stay preinstalled on `ubuntu-latest`), runs `npm run e2e:firefox` and `npm run e2e:persistence`, downloads Chrome for Testing (stable, `linux64`, from `googlechromelabs.github.io/chrome-for-testing`) and runs `npm run e2e:chrome` once that script exists (a notice is printed until then). Chrome for Testing publishes no checksums that were found (UNCONFIRMED), so the download is restricted to the official storage host only.
