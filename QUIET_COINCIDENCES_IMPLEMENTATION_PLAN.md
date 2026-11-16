# A View — occasional, quiet coincidences

Status: first fish-ripple release implemented locally September 23, 2026, with [validation evidence](docs/coincidences-validation/README.md). The sections below retain the implementation design and initial tuning proposals. M1–M3 and automated M4 checks are complete; uninterrupted human viewing and physical-device coverage remain review work. Deployment is separate. This develops item 7 in [the engagement plan](ENGAGEMENT_PLAN.md); the drifting leaf and window light remain separate follow-ons.

## Intended experience

A small disturbance opens in the lake. A reflection breaks into two or three uneven arcs, spreads, and settles back into the painting. Someone may notice it halfway through. Another visit may contain no such moment at all.

The moment belongs to the shared place. Arrival, pointer movement, panning, opening notes, returning to a tab, and time spent looking do not make it happen. There is no cue to watch, countdown, collection, missed-event message, or reward. The undisturbed painting must remain a complete experience.

Use a fish ripple first because it needs no new visible character, foliage lifecycle, or directional window-light model. It suggests something below the surface without establishing a named fish, species, feeding routine, or ecological simulation. Visitor-facing wording describes the visible water; it does not invent what caused it.

## Scope and sequence

| Moment | Scope | What must work first |
| --- | --- | --- |
| A fish briefly disturbs a reflection | First release: one small surface disturbance at a time, selected from a few fixed lake locations | Painterly water treatment, shared timing, sparse admission, safe shoreline clearance |
| A leaf touches the lake and drifts away | Separate later pilot | A plausible source and arrival, wind/current-driven route, receiving water, occlusion, and an honest exit |
| Evening light catches a window as clouds part | Separate later lighting pilot | An authored pane orientation, compatible sun direction, cloud transmission along that direction, and separation from interior room light |

The first release has no visible fish body, jump, splash particles, wake crossing the lake, added sound, field-note milestone, or new visitor control. Existing weather, bird, cottage, and celestial schedules retain their behavior. Do not combine this work with a broader ambience system.

## Starting checkout

- `src/store.js` owns a version-4 world, chronological action boundaries, SQLite transactions, structured events, and hidden history through `noteVisible: 0`. It advances every two real seconds even with no connected visitors.
- `public/world-client.js` orders snapshots and holds displayed time before uncommitted bird/cottage boundaries or at lease expiry. New discrete coincidences need to participate in that contract.
- `public/painting.js` already distinguishes displayed time, held motion time, local pause, reduced motion, and private studies. A coincidence must use the displayed snapshot and time together.
- `public/sky-renderer.js` moves the painted lake through small UV displacements and adds subdued glimmer. Its seven texture samplers already include a coarse water mask. That mask supports broad water motion; it is not precise shoreline or reed occlusion.
- `shared/world.js` exposes deterministic weather and calendar functions. Weather varies in elapsed real seconds; the calendar advances at exactly 365 world days per 30 real days. There is no water-temperature, fish-population, current, or leaf-loss model.
- `shared/sky.js` describes cloud placement, while spatial cloud opacity is evaluated in the sky shader from the cloud atlas. Global cloud cover alone cannot establish that a sunbeam has reached a particular window.

The painting and [combined engagement review](docs/engagement-validation/README.md) favor local changes and broad lake rest areas. Select real scene locations during the art pilot. Keep them fixed under crop and pan, even when a particular visitor cannot see them.

## 1. Prove one ripple in the production renderer

Begin with a fixed fixture in `/dev/sky-study.html`, without a live scheduler. Select one open-water patch near the existing shore reflection, clear of rocks, reeds, moving foliage, and the far bank. Inspect both the original day/night plates and active foliage bases before recording native 1672 × 941 coordinates.

The pilot should show a slight initial dimple followed by two or three broken, flattened arcs. Displace the existing reflected brushwork locally, with only a restrained light/dark edge contribution. Preserve its texture and palette. Avoid perfect concentric white circles, a bright target, a persistent dark hole, or a transparent oval pasted over the water.

Initial art limits, to be tuned at normal viewing size:

| Property | Starting target |
| --- | --- |
| Lifetime | 8–12 elapsed real seconds, including emergence and disappearance |
| Largest footprint | Approximately 35–65 native pixels wide; vertical extent set by the painted perspective |
| Reflection displacement | At most about one native pixel in the first pilot |
| Shape variation | A few fixed, seeded arc variations; no per-frame randomness |
| Endpoints | Zero displacement and edge contribution at both ends; no persistent mark |

Use one continuous age parameter derived from the action's start/end timestamps. Radius, broken-edge shape, contrast, and displacement are pure samples of that age and a committed variation seed. They must not depend on frame count or prior rendered frames.

Review the full scene before judging enlarged crops. Capture the default portrait view, landscape, and pan extremes; author at least one suitable location in the default portrait crop if the water geometry supports it. Never move or enlarge a live event to fit a visitor's screen. If the treatment reads as an interface animation, keep iterating on the fixture before adding live opportunities.

After this pilot passes, approve at most three water locations. Store their centers, perspective ellipses, maximum bounds, and clearance margins in proposed `shared/lakeside-coincidences.js`. Every phase must fit within safe open water, including its maximum texture-sampling displacement. The initial release should not require a new general depth system or a shoreline mask.

## 2. Admit sparse moments on the server

Use a small proposed `shared/coincidences.js` module for pure decisions, validation, boundaries, and action sampling. Persist accepted episodes and scheduler progress. Keep rendered wave detail procedural, as smoke and bird motion already are.

Persisting admission gives a stable action identity, restart behavior, and explicit introduction point. It also keeps future rule changes from silently reinterpreting an already accepted episode. This is a bounded scene-effect scheduler, not a fish actor or a general story engine.

### Initial rules

All durations below use **elapsed real time**, without multiplication by `RATE`. Calendar light is an input to eligibility.

| Rule | Proposed initial value |
| --- | --- |
| Decision interval | 60 real seconds on a grid anchored at feature introduction |
| Eligibility | `calendar.light >= .45`, `weather.rain < .03`, and `weather.wind < .30` at the decision timestamp |
| Admission chance | 1 in 24 eligible, idle, off-cooldown opportunities |
| Action start | The accepted decision timestamp |
| Duration | Seeded 8–12 real seconds within the approved art range |
| Minimum rest | 12 real minutes from the previous episode's end |
| Initial rest | 12 real minutes from feature introduction; no immediate demonstration event |
| Maximum active episodes | One across the coincidence feature |

These thresholds and rates are artistic tuning parameters, not claims about fish biology. Under continuously eligible conditions, the initial settings suggest roughly 35–40 real minutes between starts, including rest time. Actual weather and darkness may leave much longer gaps. There is no guarantee per visit or world day, and no mechanism that raises the odds after an uneventful visit.

A planning-only sketch over 30 real days of the checkout's existing weather/calendar found eligibility at about 24.6% of minute boundaries. One seeded sequence produced 365 episodes, a mean interval of 118 real minutes, a median of 97 minutes, and gaps from 13 to 853 minutes. About 96% of five-minute windows were empty, including about 91% of wholly daylight windows; active time was 0.14%. This suggests roughly one episode per world day on average, with some much longer quiet stretches. This is a deliberately rare starting proposal, not a promised cadence or production validation. Reproduce the sketch with epoch zero, minute indices starting at one, `hash(index + 42871) < 1/24` for admission, and `8000 + floor(hash(index + 57349) * 4001)` milliseconds for duration. The implementation must validate multiple seeds and its final seed policy independently.

Use a stable seed scoped to the world, scene, rule version, and decision index. Derive admission, location, duration, and variation from separate named purposes. Rejected opportunities remain rejected, with no queued replacement. Requests and renderers never consume randomness. Make IDs unique from feature introduction and decision index; persist resolved action parameters so browsers do not repeat the admission calculation.

Once admitted, the short ripple runs to its normal end. Changing light or rain shades it through the existing renderer; it does not restart, jump to another location, or freeze because an eligibility threshold changed. Eligibility controls starting an episode.

Do not gate on whether a visitor can see the location. Do not reschedule bird flights, calls, or cottage tasks to frame a moment. Existing activity may overlap naturally. Review total visual activity before release; if it becomes busy, reduce coincidence frequency or footprint first.

### Persistent state and history

Proposed `world.coincidences`:

| Field | Purpose |
| --- | --- |
| `rulesVersion`, `introducedAt`, `seed` | Rule identity, explicit start of history, stable world-scoped variation |
| `decisionIndex`, `nextDecisionAt` | Canonical progress on the 60-second grid |
| `restUntil` | Earliest eligible time, preserved through restarts |
| `pending` | `null` or one committed episode with `id`, `kind`, `rulesVersion`, `layoutVersion`, `locationId`, `start`, `end`, and `variationSeed` |

Validate safe timestamps, grid alignment, recognized versions and IDs, bounded duration, and consistency between pending state and rest time. Do not store frame histories, expanding arrays of past ripples, or browser-specific state.

Record `coincidence.started` at admission and `coincidence.completed` at its scheduled end, with unique IDs and structured action parameters. Both have `noteVisible: 0`; empty visitor prose is acceptable, as in existing hidden action records. Rejected opportunities update canonical state without inserting event rows. Completion clears `pending`; the rest deadline is already determined from the accepted end time.

These records support continuity checks. They are not surfaced in the latest-20 notes, “Since you were here,” or the unread indicator. A later decision to write about them would require a separate product and factual-copy review; do not add such prose in this release.

## 3. Migration, catch-up, and client timing

Introduce a proposed version-4-to-version-5 migration. At `max(upgradeTime, world.updatedAt)`, initialize the scheduler with no pending episode, its first decision one minute later, and the initial rest deadline. Preserve the epoch, environment, cottage, bird, nest, pending legacy action, note-history identity, existing events, and revision lineage. Do not simulate coincidences before introduction or create a “first fish” note. Fresh worlds use the same initialization rule.

Migrate transactionally, reject unsupported future versions, and keep a pre-upgrade SQLite backup. Rolling back to version-4 application code also requires a compatible database restore. Reopening a migrated world must preserve its seed and scheduler rather than reinitializing them.

Extend `nextCommitAt()` with the earlier of the coincidence decision and pending completion. Preserve the existing ordering of environment, nest, bird, and cottage operations. For equal timestamps, finish coincidence actions after the existing completions, then make coincidence decisions after the existing bird/cottage decisions. Define and test this order explicitly. The feature reads weather/calendar inputs and does not change those other subsystems.

Advance every canonical decision and completion during catch-up, using the same rules as continuous execution. Advance revisions by processed transitions, independent of request count. Write state and hidden events atomically; transaction failure must not leave an episode without its event or insert an event twice. Retain bounded catch-up batches and the current `WORLD_CATCHING_UP` response until all subsystems cover the requested time.

At a snapshot's `serverTime`, `pending` is either absent or names an episode still in progress. Completed episodes remain in history and are not replayed. A client joining halfway through samples the current age; it does not begin at the dimple. A client arriving after completion sees undisturbed water.

Update client snapshot validation and its independently calculated boundary with the coincidence state. Display time holds just before an uncommitted decision/completion until a newer snapshot covers it. Start requires no extra boundary because admission and start share a canonical decision timestamp. The existing two-second broadcast may deliver the first view partway through an episode; do not stretch the action to compensate for transport latency.

An unsupported world/rules contract must fail snapshot validation rather than let the client improvise events. A valid action with unavailable local artwork is different: retain shared timing and omit its visual layer independently.

## 4. Rendering and failure behavior

Prefer a bounded extension to the existing lake displacement shader. It already samples the painted reflection, light blend, and water movement; reuse that treatment so the ripple disturbs the same visible water. Pass a fixed number of uniforms for center, extent, age, and variation. No new image asset, texture sampler, per-frame texture upload, framebuffer readback, or full-screen postprocessing pass is planned.

Multiply the contribution by both the existing water mask and the approved local footprint. Preserve the current checks that displaced samples remain inside opaque foreground. Author shoreline clearance conservatively: the coarse mask alone must never permit a ripple to bend a rock, reed, bank, or cottage reflection edge outside the selected water patch.

The inactive effect must reproduce the existing scene with a zero contribution. Keep the original shader path available as a compile-time feature-off variant using the same scene textures. If compiling or drawing the added effect fails, disable it and redraw a complete frame with that baseline variant. Do not put the entire dynamic sky behind successful coincidence initialization. If baseline rendering also fails, retain the existing original-painting fallback.

`SkyRenderer` should own and dispose the shader variants with its normal resources. Context restoration samples the currently displayed episode; it does not revive an expired one. Missing/invalid scene locations disable the effect, with no guessed coordinates. The production renderer should expose whether it actually drew the episode so accessible copy can stay truthful.

If the art pilot requires painted assets to achieve the intended edges, revise this rendering choice explicitly, add an independently validated optional bundle, and document its cost and provenance before expanding the live feature. Do not silently grow the first release into a new water-rendering system.

## 5. Display modes and quiet presentation

| Situation | Behavior |
| --- | --- |
| Live | Sample the shared pending episode at displayed time |
| Local pause | Freeze episode identity, age, lighting, and snapshot with the rest of the painting |
| Reduced motion | Omit the transient ripple entirely; continue shared scheduling and ordinary slow illumination changes |
| Reduced motion switched off | Sample any currently active episode at its current age; never replay its start |
| Hidden tab, reload, reconnect | Rejoin the currently valid shared state; skip completed episodes |
| Snapshot expiry or uncommitted boundary | Hold the last consistent displayed state using the existing client clock |
| Private light study | Omit live coincidences; no fixture changes world state or visit memory |
| Return to live | Show the current live phase if an episode is active |
| Missing layout, shader failure, or original-painting fallback | Omit the effect; other supported scene layers continue |

Add no control, toast, badge, camera movement, automatic pan, or audio. Sound opt-in continues to govern existing sound only.

An inspectable current description may say “A small ripple is spreading on the lake” while that episode is actually displayed. Derive it from the same snapshot, time, and render availability, and leave it out of `announcement`. Omit it in reduced motion, studies, and visual fallback. A paused view may retain the observation alongside the existing paused status. Never say “You missed a fish” or claim a visible animal when only water is depicted.

## 6. Later pilots

### A drifting leaf

Start by finding a plausible arrival into a small receiving-water area. The foreground oak is separated from much of the visible lake by land; a vertical drop from any convenient leaf patch cannot be assumed to reach water. Approve an authored flight/landing route or a clearly off-frame source before choosing its art.

Use one leaf with a continuous fall or arrival, a small contact disturbance, and a slow drift driven by documented real-second wind/current rules. Wind alone is not a modeled lake current. Keep any added current explicitly artistic. End behind a real occluder, beyond the scene boundary, or with an authored sinking action; do not dissolve an intact leaf simply because a timer ended.

Removing a leaf from the visible oak requires compatible foliage repair and persistent loss, or a deliberately modeled regrowth/replacement rule. The existing spring painting has no such lifecycle. Do not repeatedly detach a visible leaf while leaving an identical one on the branch, or imply seasonal leaf fall from a static spring canopy.

A later release should share the one-episode budget with ripples and reduce individual admission rates to retain overall quietness. A leaf's landing ripple is part of that leaf episode, not a second randomly scheduled event.

### Window light through clouds

Treat this as a continuous lighting consequence. Approve the pane's orientation and determine whether low sun can plausibly reach it from the existing celestial model, including directions outside the camera frame. Check the existing casement pose and local occlusion. If the geometry does not support evening light, choose another truthful treatment or leave this idea deferred.

Derive illumination from sun direction and compatible cloud transmission toward the sun. The current camera-projected cloud atlas and global cover value are insufficient by themselves to claim a physically grounded light path to the cottage; the pilot must define the approximation or add the missing mapping. Do not randomly flash a window and describe it as clouds parting.

Keep reflected exterior light distinct from the two rooms' persisted interior emission. Clip it to the appropriate pane, follow the moving casement where relevant, use broad restrained brightness rather than a star-shaped sparkle, and return naturally as the cloud closes. Weather/cloud motion must never be manipulated to produce a highlight for a visitor. The pilot should decide its reduced-motion treatment before release.

## 7. Delivery and integration

| Milestone | Concrete result |
| --- | --- |
| M1 — Art pilot | One fixed-input ripple in the production developer study; full-scene stills and an 8–12-second real-speed clip; approved tonal/footprint limits |
| M2 — Shared continuity | Pure scheduler, version-5 migration, canonical hidden events, snapshot/client boundaries, and deterministic state checks |
| M3 — Complete first release | Up to three approved locations, display modes, factual inspectable copy, baseline shader fallback, and quiet notes behavior |
| M4 — Combined review | Natural-frequency timeline, paired clients, restart evidence, performance/catch-up measurements, regression checks, and documented viewing/device coverage |

M1–M3 are implemented. M4 has automated continuity, cadence, rendering, and regression evidence; the remaining human-viewing and device limits are recorded in the validation report. Leaf and window pilots remain separate future choices.

| File or area | Proposed work |
| --- | --- |
| `shared/coincidences.js` (new) | Rules, deterministic admission, state validation, boundaries, action sampling, fixtures |
| `shared/lakeside-coincidences.js` (new), `shared/world.js` | Approved locations, layout version, scene configuration |
| `src/store.js` | Version-5 migration, ordered advancement, hidden events, snapshot state/boundaries |
| `public/world-client.js` | Snapshot validation, boundary holds, recovery compatibility |
| `public/painting.js`, `public/sky-renderer.js` | Displayed episode sampling, bounded displacement, optional shader variant, render availability and resource lifecycle |
| `public/app.js`, `public/scene-description.js` | Quiet current observation tied to displayed state and availability |
| `public/dev/sky-study.html`, `public/dev/sky-study.js` | Phase slider, location/footprint guides, isolated calm/rain/dark fixtures, disabled-feature comparison |
| `test/`, `scripts/`, `package.json` | Focused state/client/browser checks and syntax coverage |
| `README.md`, `ARTWORK.md`, `docs/coincidences-validation/README.md` (new) | Implemented scope, procedural art provenance, measured results and remaining coverage |

The `/api/notes` contract and visitor storage need no feature changes. Add regression coverage that hidden coincidence events leave their behavior unchanged.

## 8. Acceptance and evidence

**Continuity:** compare semantic state, revisions, and ordered events across regular two-second stepping, irregular requests, one-shot catch-up, and restarts before admission, during a ripple, and during rest. Cover simultaneous bird/cottage/coincidence boundaries, rejected opportunities, exact start/end times, rollback after transaction failure, repeated migrations, and stale pre-upgrade worlds. Verify existing subsystems produce unchanged semantic histories apart from the new world version/revision contributions.

**Shared display:** at the same displayed timestamp, two clients receive the same episode ID, location, duration, and phase. Test late entry, zero-viewer advancement, reload, stale/out-of-order snapshots, silently stalled streams, pause/resume, hidden tabs, and studies. Joining the page or panning must never change the server's decisions. Completed episodes must never replay.

**Restraint:** sample at least 30 real days of actual calendar/weather and report episodes, durations, start intervals, eligibility rejections, and overlaps with existing activity. Initial targets are below 1% active time and at least 80% of sampled five-minute windows with no coincidence, including daylight-only windows. These are proposed acceptance thresholds, not measured results. Include a full world-day timeline and a natural-frequency viewing session; forced fixtures and sped-up clips cannot establish that the timing feels quiet. Tune frequency downward if combined motion competes with the scene.

**Art and modes:** capture emergence, maximum extent, disappearance, and inactive state at five day/night blends, including forced dark/rain fixtures for robustness. Inspect real-speed clips, default portrait and landscape crops, pan extremes, supported DPRs, and overlap with existing water/foliage motion. Verify no bank/reed displacement, hard elliptical border, shimmer aliasing, persistent residue, added night glow, or movement under reduced motion. Compare inactive pixels against the baseline shader.

**Failure and performance:** simulate invalid locations, optional shader compile/draw failure, context loss/restoration, and late initialization. Verify the baseline sky survives optional-effect failure and no resources accumulate across restore/dispose cycles. Measure frame intervals and GPU resources with the feature on/off, snapshot bytes, database/event growth, and day/month/year catch-up. Preserve the existing 30 fps target on measured devices; name untested devices rather than extrapolating desktop results.

**Presentation:** hidden history must not change the visible-note head, unread dot, recap selection, or browser visit memory. Inspect current descriptive text, paused text, reduced-motion omission, fallback omission, and absence of automatic announcements. No new sound should occur.

For implementation, run `npm run check`, `npm test`, focused coincidence state/browser checks, and the affected sky/display/engagement regressions against disposable databases. Add existing weather/cottage/foliage/bird suites as required by renderer changes. Record evidence and gaps in the validation report.
