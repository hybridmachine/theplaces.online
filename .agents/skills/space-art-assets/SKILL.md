---
name: space-art-assets
description: >-
  Regenerate or replace painted 3D space art bundles and 2D layer atlases using
  the offline asset pipelines. Use when editing scripts/space-painter/,
  shared/lakeside-space-art.js, scripts/prepare-*-assets.mjs, artwork plates,
  or updating public/assets/ and ARTWORK.md.
---

# Art Bundles & Procedural Painting Pipeline

All runtime assets are static files under `public/assets/` with no build step at
server startup. Offline exporters use optional dev-only Playwright (for the 3D
space bundle) or Sharp (for 2D bundles).

## 1. 3D Space Bundle (`public/assets/lakeside-space-v1/`)

Defined in `shared/lakeside-space-art.js` (`version: 1`, `quality: 0.9`, total
budget **`4,000,000` bytes**):
- **Surfaces (seamless tiles, opaque):** `meadow`, `earth`, `shore`, `stone`,
  `slate`, `bark`, `water` (`1024×1024`), `drystone`, `hills` (`512×512`)
- **Panels (opaque):** `door` (`256×512`), `window` (`256×256`), `windowLit`
  (`256×256`)
- **Card atlas (straight alpha):** `cards` (`2048×2048`, 4×4 grid of `512 px`
  cells: 0–3 oak, 4–5 woods, 6–7 dabs, 8–10 grass, 11 flower, 12–13 reeds)

### Re-exporting Code-Painted Slots
Slots are painted deterministically from `SEEDS` in `scripts/space-painter/painter.js`:
```sh
node scripts/prepare-space-assets.mjs
node scripts/prepare-space-assets.mjs --only stone,cards
```
This writes `<slot>.webp`, updates `public/assets/lakeside-space-v1/export.json`
(dimensions, byte sizes, `seed`, `source`, `sha256`), checks `SPACE_ART.budgetBytes`,
and regenerates the contact sheet at `docs/space-validation/art-sheet.png`.

### Supplying a Custom Plate Instead of Code Paint
1. Save a PNG at `artwork/lakeside-space-v1/plates/<slot>.png` matching the exact
   dimensions and alpha rules in `artwork/lakeside-space-v1/plates/README.md`.
   - For `cards.png`: straight (unpremultiplied) alpha, at least 8 clear pixels
     around every shape in its cell, firm alpha ≥ 0.5 edges, and colour carried
     out under transparent pixels so mip/bilinear filtering never pulls in black.
   - The exporter never overwrites files in `plates/`.
2. Run `node scripts/prepare-space-assets.mjs --only <slot>`.
3. Confirm `export.json` records `"source": "plate"` and `"seed": null` for that
   slot. Remove the plate and re-run to revert to procedural paint.

## 2. 2D Painting Bundles (`public/assets/lakeside-*-v1/`)

Regenerate registered 2D atlases with Sharp:
- `node scripts/prepare-sky-assets.mjs`
- `node scripts/prepare-foliage-assets.mjs` (validated by `scripts/foliage-asset-validation.mjs`)
- `node scripts/prepare-weather-assets.mjs`
- `node scripts/prepare-cottage-assets.mjs`

## 3. Provenance & Verification

1. Visually inspect `docs/space-validation/art-sheet.png` (2×2 tiling seams for
   surfaces; alpha-0.5 cut over grey and sky for `cards`).
2. Confirm total bundle size stays well under `4,000,000` bytes.
3. Update `ARTWORK.md` whenever plates, seeds, or asset provenance change.
4. Run unit checks and verify graceful fallback if an asset is missing/broken:
   ```sh
   npm run check
   node --test test/space-art.test.js test/foliage-assets.test.js
   ```
5. Capture before/after visual checks with `scripts/capture-space-review.mjs`
   (see the `browser-validation` skill).
