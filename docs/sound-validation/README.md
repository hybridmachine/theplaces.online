# Listening by the lake validation

October 22, 2026. Local ambient-sound study, using the production Web Audio synthesizer and existing shared-world actions. Revised after listening feedback found that the continuous water bed masked the details. The first checks established scheduling and absence of clipping; the revised checks also measure actual playback and detail-to-background contrast.

## Review material

- [20-second stereo listening sample](sound-study.wav): quiet water and passing leaf swells, the oak call at about 2 seconds, a distant answer a few seconds later, and the casement at about 10 seconds. This deliberately arranged review sample is not a recording of live-world event frequency.
- [Desktop listening page](listening-study.png) and [narrow portrait](listening-portrait.png), visually checked for readable text and usable controls.
- [Native browser results](browser-results.json): 24 checks passed in desktop Chrome, including actual live playback of every selection and the painting's commit-wait/lease-expiry distinction.
- [Firefox signal results](firefox-results.json): all five detail/background comparisons pass using Firefox's native offline audio renderer. The separate temporary-profile runner waits for completed measurements before taking its screenshot.
- Private listening page: `/dev/sound-study.html`. Four 20-second fixtures require an explicit **Listen** gesture; they stop when hidden and never contact the world API. **Include lake ambience** defaults off and can be toggled during playback. The breeze no longer waits thirty seconds for a substantial gust.

## Behavior checked

The sound button stays opt-in. The oak phrase remains tied to its shared action. A stable hash of that action permits a distant answer after roughly 45% of heard calls; callers that arrive late, mute, hide the page, pause, or lose valid world timing do not replay missed details. Canceling the oak call before it finishes also cancels its potential answer. A shortened snapshot lease cancels a queued answer. Responses survive both the normal call-completion snapshot and the brief wait before it arrives, without keeping the old bird action alive. During that wait all details stay silent; only an already-heard call's candidate remains, and fresh timing is required to schedule it. A missed reply start or expired lease discards it.

The leaf layer uses the existing oak gust sampler. An hour sampled at one-second intervals has zero leaf target on 2,892 of 3,600 samples (80.3%); rain attenuates it. Gain updates are bounded to twice per audio second and replace old automation. The casement creak follows the committed motion start once per action, with no invented door activity. Static/unavailable casements and reduced-motion held poses suppress it. Transient voice nodes disconnect exactly once on natural completion or cancellation. Mono fallback is covered by the unit harness; the native rendered sample exercises stereo placement.

Native Chrome checks cover all four listening fixtures, explicit start/stop and closed contexts, narrow-screen fit, call/reply/casement scheduling and cancellation, finite unclipped offline rendering, production painting integration, pause, private studies, reduced motion, and mute. A live analyser verifies real output while each selected study runs, including all five bird notes. Isolated native renders compare the loudest 20 ms detail window with the water layer: margins are about 25 dB for the oak call, 15 dB for the answer, 19 dB for the casement, and 15 dB for leaves and rain. Chrome and Firefox agree closely. The comparison would fail the original masked mix. The 20-second, 24 kHz stereo PCM sample remains unclipped; measurements are retained in the reports. Seeded noise keeps the comparison repeatable.

## Automated checks

- `npm run check`: passes, including the new score, fixtures, study page script, and browser checker.
- `node --test test/sound.test.js test/world-client.test.js`: 31 passed after the PR review fix (24 sound and 7 world-client tests). Regressions cover held commit-boundary frames before the completion snapshot, late refreshes, canceled visits, and unheard calls.
- Earlier full-suite baseline: 113 passed, 3 failed, 1 skipped. The focused audio/browser checks were rerun after the mix correction. The three baseline failures are the previously documented Bash deployment tests on this Windows host; deployment sources are unchanged. The skipped test requires the unavailable `sqlite3` CLI. See the prior [Keep this view baseline report](../keep-view-validation/README.md#automated-checks).

## Reproduction

Use Node.js 24 or newer. Start the server with `A_VIEW_DB=:memory:` and `PORT=4177`, then run:

```sh
npm run check
node --test test/sound.test.js
node scripts/check-sound-browser.mjs
node scripts/check-sound-firefox.mjs
```

The Chrome browser checker needs optional development-only Playwright. `SKY_PREVIEW_URL` changes the server address, `BROWSER_EXECUTABLE` selects an installed Chromium browser, and `SOUND_VALIDATION_DIR` changes the output directory. It renders the sample through a native `OfflineAudioContext` and uses private in-memory fixtures; no test writes to shared-world history. The Firefox runner uses installed Firefox (`FIREFOX_EXECUTABLE` overrides the Windows default), a fresh temporary profile, and a separate localhost-only static test server. On this host it needs to run outside the restricted process sandbox so Firefox can launch its tab subprocess.

## Coverage limits

Signal levels, native scheduling, cancellation, UI layout, and automated state behavior were checked. Artistic judgments about the creak, bird timbre, balance, and fatigue still need human listening on speakers and headphones. Firefox coverage is native offline synthesis and mix contrast, not the full interactive control matrix. Physical iOS/Android audio interruptions and Safari have not been checked. The quiet water/rain background remains during pause and private light studies, while action details and leaves stop. No production deployment is included.
