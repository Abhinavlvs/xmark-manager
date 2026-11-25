# Screenshots

How the images in `docs/screenshots/` are made, and how to redo them.

## Data

Everything comes from the dev harness (`dev/mock-browser.js`), which runs the real handlers over an in-memory store. The sample library is fictional: 4 folders (Reading, Ideas, Design, Tools), 12 posts by invented handles (`@ada_builds`, `@devon_writes`, `@mira_codes`, `@theo_notes`, all in `dev/mock-browser.js`) with neutral invented text, tags and notes. No real accounts or quotes. The mock x.com timeline shots were removed as inaccurate; the on-page shots are real captures (see below). Nothing is read from x.com and nothing leaves the machine.

## Produce

```sh
PORT=5195 npm run dev      # binds 127.0.0.1 only; stop it by its own pid afterwards
```

Drive headless Google Chrome over the DevTools protocol (the dependency-free client in `scripts/e2e/cdp.mjs`; it needs Node 22 or newer for the global `WebSocket`). Launch Chrome with `--headless=new --remote-debugging-port=<port> --user-data-dir=<temp dir> --hide-scrollbars`, then per shot open a new page, call `Emulation.setDeviceMetricsOverride` (`mobile: false`), emulate `prefers-color-scheme: dark` (the shipped look), navigate, click and type by evaluating JavaScript in the page (find elements by their text), blur the focused field, and call `Page.captureScreenshot`. Every file ends up exactly 1280x800 (the Chrome Web Store and Firefox Add-ons size), RGB, under 400 KB:

- Options shots: CSS viewport 800x500 at device scale 1.6, so the PNG is natively 1280x800. `options-data.png` is taller than that, so it uses a 1100x688 viewport at scale 1.1636 (then one spare pixel row is cropped) so the whole page fits. `options-privacy.png` (with the snippet length control) needs more height still and uses a 1280x800 viewport at scale 1.
- Popup shots and `options-mobile.png`: CSS 380x600 at scale 1.3333 (popup) or 390x740 at scale 1.08 (phone layout), then centred on a 1280x800 canvas with `sips --padToHeightWidth 800 1280 --padColor 16181C file.png`. For the popup, set `document.body.style.minHeight = '100vh'` before capturing so the dev page's side borders run the full height.
- Real x.com captures: scaled to 800 px high with `sips --resampleHeight 800` and padded the same way (the panel capture is flattened to RGB first). Not recaptured. If a result is over 400 KB, re-save it losslessly (re-filter and recompress the PNG data); never reduce colours.

`TAB` below is `tab=https://x.com/ada_builds/status/1999999999999999999`.

| File                          | URL (port 5195)                                       | Window                  | State                                                    |
| ----------------------------- | ----------------------------------------------------- | ----------------------- | -------------------------------------------------------- |
| `popup-save.png`              | `/dev/popup.html?TAB`                                 | 380x600 @1.3333, padded | folder Reading, tags ai and llm, a note, nothing focused |
| `popup-saved.png`             | same, Saved tab                                       | 380x600 @1.3333, padded | All chip; pointer moved off the tabs                     |
| `popup-folders-filter.png`    | same                                                  | 380x600 @1.3333, padded | Design chip, then the `#ui` tag on a card                |
| `popup-undo.png`              | same                                                  | 380x600 @1.3333, padded | All chip, after Delete on the first card                 |
| `popup-quarantine-notice.png` | `/dev/popup.html?quarantine=1&empty=1&TAB`, Saved tab | 380x600 @1.3333, padded | notice shown                                             |
| `options-saved.png`           | `/dev/options.html?snippets=0&perm=0#saved`           | 800x500 @1.6            | the 12 sample posts, All chip, "Tags:" row               |
| `options-saved-filtered.png`  | same                                                  | 800x500 @1.6            | click the Design chip, then the `#ui` tag chip           |
| `options-folders.png`         | `/dev/options.html?perm=0#folders`                    | 800x500 @1.6            |                                                          |
| `options-data.png`            | `/dev/options.html?perm=0#data`                       | 1100x688 @1.1636        | import preview shown (see below)                         |
| `options-privacy.png`         | `/dev/options.html?perm=0&snippets=1&len=140#privacy` | 1280x800 @1             | snippet toggle on, Snippet length 140                    |
| `options-permissions.png`     | `/dev/options.html?perm=0#permissions`                | 800x500 @1.6            | host access off                                          |
| `options-about.png`           | `/dev/options.html?perm=0#about`                      | 800x500 @1.6            |                                                          |
| `options-mobile.png`          | `/dev/options.html?perm=0#folders`                    | 390x740 @1.08, padded   | phone layout (the tab strip scrolls sideways)            |

Before each options shot check that the navigation lists exactly Saved, Folders, Data, Privacy, Permissions, About.

Notes: the popup is limited to 600 px tall (the snackbar sits at the bottom of the window, so use 600 CSS px). The import preview in `options-data.png` was shown by writing a generated file (3 fictional posts, 1 folder, handles from the list above) to disk and attaching it to the hidden file input with `DOM.setFileInputFiles`. After a click the pointer can leave a hover highlight (for example on the Saved tab): move it to an inert corner (`Input.dispatchMouseEvent` `mouseMoved`) before capturing. Blur focused fields (`document.activeElement.blur()`) so no caret or focus ring shows.

## Regeneration checklist

1. Run the dev server, load each page, and check no real handle, email, path or personal data is visible.
2. Recapture every file above with the same names; make every PNG exactly 1280x800 and under 400 KB.
3. View each PNG; look for cut-off UI, stray focus rings and blank areas.
4. Run `npm test` (`tests/docs.test.js` checks names, sizes and README references) and `npm run lint`.
5. Stop the dev server.

## Store listings

Every screenshot above is 1280x800, the size both stores recommend. Sizes, checked from the stores' documentation:

- Chrome Web Store ([Supplying Images](https://developer.chrome.com/docs/webstore/images)): screenshots 1280x800 (preferred) or 640x400, square corners, full bleed; small promo tile 440x280; optional marquee 1400x560; store icon 128x128 PNG (96x96 artwork plus transparent padding).
- Firefox Add-ons ([Create an appealing listing](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/)): screenshots 1280x800 recommended (the maximum display size); other sizes should keep a 1.6:1 aspect ratio; no practical limit on the number of screenshots; one set only (descriptions can be localised). The page does not specify a screenshot file format (PNG/JPEG is stated for the 32x32 and 64x64 icons).

## Screenshots still wanted for store listings

Not created yet:

- Folder picker / Move dialog
- Edit post view
- Search results and the no-results state
- Per-store composites with headlines: "Save to folders", "Find fast", "Local only", "Undo and export"
- Small promo tile (440x280)
- Firefox 128x128 icon

## Real x.com captures

`x-live-button.png` and `x-live-panel.png` are manual captures from a real Firefox session on x.com, showing a public post by NASA. They are not generated by the dev harness and cannot be regenerated by a script. Retake them by hand after a visible UI change, then scale and pad to 1280x800 as described under Produce and keep each file under 400 KB.
