# Plates for the walkable yard

A plate is a finished picture that takes the place of a code-painted slot in `public/assets/lakeside-space-v1/`. Put it here as `<slot>.png`; the exporter encodes it instead of painting that slot, and never writes to this folder.

| Slot | File here | Size (px) | Alpha |
| --- | --- | --- | --- |
| `meadow`, `earth`, `shore`, `stone`, `slate`, `bark`, `water` | `<slot>.png` | 1024 × 1024 | opaque, tiles seamlessly both ways |
| `drystone`, `hills` | `<slot>.png` | 512 × 512 | opaque, tiles seamlessly both ways |
| `door` | `door.png` | 256 × 512 | opaque |
| `window` | `window.png` | 256 × 256 | opaque |
| `cards` | `cards.png` | 2048 × 2048 | straight (unpremultiplied) alpha; must contain transparent pixels |

The `cards` plate keeps the atlas layout in `shared/lakeside-space-art.js`: 4 × 4 cells of 512 px, cell 0 at the top left, row-major. Cells 0–3 oak clumps, 4–5 woods, 6–7 neutral light dabs (tinted in the scene), 8–10 grass tufts, 11 cow parsley, 12–13 reeds. Keep at least 8 clear pixels around every shape inside its cell. Grass, flower and reed cells stand on the cell's bottom edge, their foot at the bottom centre. Cards are drawn with an alpha cut-off at 0.5, so give shapes firm edges and carry their colour a few pixels out under the transparent edge. To replace only some cells, start from the exported `cards.webp` and paint over those cells.

Export the slot:

```sh
node scripts/prepare-space-assets.mjs --only cards
```

The command fails, naming the slot and the size it wants, if a plate has the wrong dimensions or (for `cards`) no transparent pixel. `public/assets/lakeside-space-v1/export.json` then records `"source": "plate"` for that slot. Remove the plate and run the same command to go back to the painted version.
