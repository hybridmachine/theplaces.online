# Plates for the walkable yard

A plate is a finished picture that takes the place of a code-painted slot in `public/assets/lakeside-space-v1/`. Put it here as `<slot>.png`; the exporter encodes it instead of painting that slot, and never writes to this folder.

| Slot | File here | Size (px) | Alpha |
| --- | --- | --- | --- |
| `meadow`, `earth`, `shore`, `stone`, `slate`, `bark`, `water` | `<slot>.png` | 1024 × 1024 | opaque, tiles seamlessly both ways |
| `drystone`, `hills` | `<slot>.png` | 512 × 512 | opaque, tiles seamlessly both ways (hills is surface brushwork for the hill shapes, which the scene builds; it has no sky edge. The cabin's eave boards and soffits use it too, darkened) |
| `door` | `door.png` | 256 × 512 | opaque |
| `window` | `window.png` | 256 × 256 | opaque |
| `cards` | `cards.png` | 2048 × 2048 | straight (unpremultiplied) alpha; must contain transparent pixels |

The `cards` plate keeps the atlas layout in `shared/lakeside-space-art.js`: 4 × 4 cells of 512 px, cell 0 at the top left, row-major. Cells 0–3 oak clumps, 4–5 woods (also cut into the shrubs at the cabin's foot), 6–7 neutral light dabs (tinted in the scene), 8–10 grass tufts, 11 cow parsley, 12–13 reeds. Keep at least 8 clear pixels around every shape inside its cell. Grass, flower and reed cells stand on the cell's bottom edge, their foot at the bottom centre. Cards are drawn with an alpha cut-off at 0.5, so give shapes firm edges and carry their colour out under the transparent area (at a small non-zero alpha) so filtering never pulls in black. To replace only some cells, start from the exported `cards.webp` and paint over those cells.

Export the slot:

```sh
node scripts/prepare-space-assets.mjs --only cards
```

When the plate is accepted, `public/assets/lakeside-space-v1/export.json` records `"source": "plate"` and `"seed": null` for that slot.

This path has no automated test, because Node cannot decode the images here; it was verified by hand.

A plate the exporter cannot use makes the command exit non-zero, with a message that names the slot. For the wrong dimensions, the message also gives the size it wants, for example `cards: plate is 1024×1024, want 2048×2048`. For a `cards` plate with no transparent pixel it reads `cards: plate has no transparent pixel`.

Remove the plate and run the same command to go back to the painted version.
