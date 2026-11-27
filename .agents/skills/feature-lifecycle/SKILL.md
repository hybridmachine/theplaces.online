---
name: feature-lifecycle
description: >-
  Guide spec-driven feature planning, repository hygiene, CI parity checks, and
  PR close-out for A View. Use when starting a new feature, adding new JS/MJS
  files, preparing commits or PRs, or closing out a completed milestone.
---

# Feature Lifecycle & PR Hygiene

## 1. Spec-First Workflow

1. **Design before coding:** Write a design spec at
   `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md` and an implementation
   plan at `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`.
2. **Branch off current `main`** (or rebase onto `origin/main` before opening/merging
   the PR).
3. **Close out honestly:** When implementation finishes, append an **As built**
   section to the spec with the actual measured metrics, passing test counts, and
   honest limits—matching committed validation JSONs 1-to-1.

## 2. Hard Repository Constraints

- **Zero runtime dependencies & zero build step:** Do not add packages to
  `dependencies` in `package.json`. Browser ES modules in `public/` and `shared/`
  run directly as written on Node ≥ 24 (`node:sqlite`, vendored three.js).
- **Hand-maintained `npm run check` list:** Every new `.js` or `.mjs` file (in
  `src/`, `shared/`, `public/`, `scripts/`) **must** be appended to
  `scripts.check` in `package.json`, or CI will not syntax-check it.
- **No runtime symlinks:** `scripts/deploy.sh` rejects symlinks anywhere under
  `src/`, `shared/`, or `public/`.
- **Never dirty `data/world.sqlite`:** Keep local dev/test runs on temp DBs via
  `A_VIEW_DB`.
- **Selective validation captures:** Check `.gitignore` before committing images
  under `docs/*-validation/`; add explicit `!docs/<dir>/<file>` rules only for
  representative review frames meant to be kept.

## 3. Local CI Parity (Matches `.github/workflows/ci.yml`)

Run all three CI stages before pushing:
```sh
(for f in scripts/deploy.sh deploy/*.sh; do bash -n "$f" || exit 1; done)
shellcheck scripts/deploy.sh deploy/*.sh
npm run check
npm test
```
*(Note: `bash -n` only parses its first file argument, so always loop per file;
if `shellcheck` is not installed locally, still run that per-file `bash -n`
loop.)*

## 4. Documentation Sync Checklist

Update every affected doc in the same PR so nothing drifts:
- `README.md` — user-visible behavior, URL flags, and **Honest limits**
- `CLAUDE.md` — commands, architecture notes, query flags, or conventions
- `DESIGN.md` — implementation checkpoint summary when major capabilities land
- `ARTWORK.md` — whenever assets, seeds, plates, or shaders change visual provenance
- `docs/*-validation/README.md` — measured figures matching `browser-results.json`
- Parent & feature specs in `docs/superpowers/specs/` — **As built** section

## 5. PR & Merge Hygiene

- Review `git status -sb` and `git diff --stat` to ensure no stray scratch files,
  unintended capture diffs, or `data/world.sqlite` changes are staged.
- Wait for both `Checks/Node 24` and `Checks/Node 26` to pass before merging.
- Use squash-merge to match repository history, then switch to `main` and
  fast-forward pull.
