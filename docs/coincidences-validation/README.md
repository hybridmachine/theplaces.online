# Quiet coincidences validation

Recorded September 23, 2026, against the local fish-ripple implementation. All servers and simulation checks used disposable databases. Production state and deployment were untouched. Tests ran with Node.js 26.7.0 and local Chrome 153 using ANGLE Metal on an Apple M1.

## Visual treatment

The [daytime frame](ripple-day.png) and [location sheet](locations.png) show three fixed ellipses in safe open water. The shader disturbs existing reflection paint and adds subdued, broken arcs. It adds no image asset, texture sampler, sound, or interface control to the visitor page. Inspection of the source painting, captures, enlarged details, and sampled recording frames found no shoreline, rock, or reed displacement. All phases return to the undisturbed painting without residue.

The [default portrait capture](portrait-default.png) intentionally retains the existing composition. At 390 × 844 with the default pan, all three ripple sites lie outside the crop. Panning toward the lake reveals them. Events stay at their shared locations, and the inspectable description omits an offscreen ripple. This is a recorded composition limitation, not a claim of visibility on every device.

`ripple-real-speed.webm` is a locally generated, Git-ignored recording of a ten-second developer fixture with the ordinary water/foliage motion running. It includes initial preview loading and a brief settled tail. The fixture controls are hidden during playback. It demonstrates production-renderer motion at real speed; it does not establish the experience of waiting for a naturally admitted event. Regenerate with `COINCIDENCE_RECORD=1`.

## Automated evidence

- [Focused browser checks](browser-results.json): 18 passing checks, including 60 combinations of location, illumination, and phase; exact inactive endpoint pixels; bounded changed pixels; pause/reduced motion; invalid art; actual injected optional shader compilation/draw failure; context restoration; identical pixels across two visitor sessions; notes; and private studies. No page exceptions were recorded.
- [State and cadence measurements](state-results.json): day/month/year catch-up and three month-long seeds. All meet the proposed limits of under 1% active time and at least 80% quiet five-minute windows, including windows wholly in daylight.
- [One world-day timeline](day-timeline.json): committed hidden events from the first world day, including the existing cottage and bird activity. Ripple admission does not reschedule those other activities.
- Unit/integration tests exercise restart during a ripple, regular/irregular/unobserved advancement, equal-time boundaries through the store, transaction rollback, legacy migration, preserved note identity, unsupported snapshots, skipped completed events, and unchanged semantic bird/cottage/environment histories. Syntax checking and the full test suite pass.
- Existing sky, visitor display, foliage, weather, cottage, bird, celestial, and combined-engagement browser checks were run against this checkout. Retained regression reports are linked in [the regression index](regressions.json).

Two old browser fixtures required correction: the weather fixture inserted a note without advancing its history cursor; the cottage fixture manufactured future decision boundaries and expected paused notes to update. The corrected checks use the current note cursor and real committed cottage snapshots, and verify that pause holds both the cottage and displayed note history. No runtime behavior was relaxed to satisfy them.

## Cadence and cost

Across three 30-real-day runs, the scheduler admitted 356–366 episodes. Mean intervals were about 117–121 real minutes. Roughly 91.4–91.5% of daylight five-minute windows contained no ripple, and active time was 0.138–0.141%. The longest month-run gap was 931 real minutes. These deterministic samples describe the configured rules; they do not promise an event during a visit.

The 365-real-day run admitted 4,374 episodes and produced 8,748 hidden coincidence event rows. Catch-up completed in ten bounded yields and about 7.8 seconds in the retained run, with browser checks also running on the machine. The idle coincidence checkpoint remained about 160 serialized bytes. Total database size in that run was about 61.5 MB for all subsystems; it is not the incremental cost of ripples alone. Only admitted starts/completions add coincidence event rows; rejected minute opportunities do not.

The focused 1672 × 941 browser measurement kept seven sky textures and seven initial uploads. Median draw-plus-GPU-finish time was approximately 0.4 ms without the effect and 1.2 ms with it; p95 was 1.3 and 2.0 ms respectively. An active ripple lazily adds one shader program and two shaders. No per-frame texture uploads are introduced by the effect. The baseline program remains available after optional failure; all programs/shaders follow renderer disposal and context restoration.

## Reproduction and limits

Start the server with `A_VIEW_DB` pointing to a temporary SQLite file and `PORT=4181`. Open `/dev/sky-study.html?fixture=Quiet%20ripple` to inspect or play one episode without affecting shared state.

```sh
npm run check
npm test
node scripts/check-coincidences-state.mjs
node scripts/check-coincidences-browser.mjs
```

The browser script uses optional development-only Playwright, `SKY_PREVIEW_URL`, `BROWSER_EXECUTABLE`, optional `SKY_GPU=metal`, and `COINCIDENCE_VALIDATION_DIR`. Recording additionally needs Playwright's FFmpeg component. Neither is a runtime dependency. Existing browser suites use their documented configuration. Regenerable capture matrices and video are ignored by Git; representative frames and JSON evidence are retained.

Uninterrupted human viewing at natural frequency, physical mobile performance, and Safari/Firefox coverage remain outstanding. Pixel checks and short recordings do not establish those results. Leaf drift and window highlights remain separate future pilots. Version-5 deployment requires the usual pre-upgrade database backup; rollback to older code requires restoring the compatible database as described in the main README and deployment guide.
