# Keep this view validation

Checked locally on Windows with Node.js 24 and headless Chrome, using a disposable SQLite world. Production data and deployment were untouched.

## Experience and rendering

The [desktop dialog](desktop.png), [portrait dialog](portrait.png), [download error](download-error.png), and [downloaded PNG](keepsake.png) show the implemented flow. The painting and caption in these images come from deterministic test fixtures.

The core [browser report](browser-results.json) records 43 passing checks with no page errors. It covers:

- Comparison with the actual displayed WebGL painting, Canvas animation overlay, and scene shading.
- A preview whose pixels and metadata survive note edits, advancing world time, and viewport resizing.
- A real browser download whose bytes match the prepared PNG. The painted region of the postcard matches the held preview exactly.
- Live, paused, private-study, reduced-motion, expired-connection, and static-fallback labels, including combined modes and fallback without a world date.
- Controls and dialogs at 320, 390, 800, and 1440 CSS pixels, plus short viewports, Escape, and focus restoration.
- Failed capture, failed PNG encoding, blocked download dispatch, retry, cancelled asynchronous work, and object-URL cleanup.

The [additional browser report](extra-browser-results.json) checks visitor panning in both GPU and fallback modes, high-DPI sizing, the 2560-pixel capture limit, modal keyboard focus, retained captures during GPU context loss, and removal of the faded download link from the tab order.

The screenshot comparisons allow small compositor rounding differences. At the same output resolution, the postcard's painted area must match its held preview exactly. CSS image rectangles use snapped edges in fallback captures; this preserves the displayed crop rather than independently rounding the destination width.

## Automated checks

`npm run check` passes. The five tests in `test/view-capture.test.js` pass, covering calendar conventions, immutable metadata, combined mode labels, undated fallback, and Unicode caption wrapping.

The full unit suite, run serially without browser tests competing for CPU, reports **104 passed, 3 failed, and 1 skipped**. All three failures are in the existing Bash-based deployment tests and also reproduce from unchanged commit `89aa6ff` on this Windows host. The skipped deployment test requires the unavailable `sqlite3` command. The server catch-up test timed out during concurrent browser work and passed in the final isolated suite. No deployment code changed for this feature.

## Reproduction

Start the server with a temporary `A_VIEW_DB` and `PORT=4176`. With development-only Playwright and Sharp available to Node, run:

```sh
node scripts/check-keep-view-browser.mjs
node --test test/view-capture.test.js
npm run check
node --test --test-concurrency=1 test/*.test.js
```

`SKY_PREVIEW_URL`, `BROWSER_EXECUTABLE`, `SKY_GPU`, and `KEEP_VALIDATION_DIR` configure the browser run. `KEEP_EXTRA=1` runs only the additional checks and writes `extra-browser-results.json`; an ordinary run includes both groups in `browser-results.json`. Browser tests create isolated contexts and in-memory fixtures and do not write shared-world actions.

## Coverage limits

Desktop Chrome and emulated viewport/device-pixel ratios were checked. Physical iOS/Android save dialogs, mobile keyboards, Safari, and Firefox still need device review. The page acknowledges download initiation, not successful filesystem saving. The Open image fallback and the retained last-download link support browsers that handle image saving differently.
