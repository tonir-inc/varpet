# Doors and windows

Ten GLBs for the editor's openings, built by `build.py` with the draft part compiler and the material library.
`manifest.json` has every number below; the same data sits in each GLB's root node (`extras.varpet.opening`).

| file | opening w x h (m) | wall (m) | mechanism | moving parts |
|---|---|---|---|---|
| `door-flush-white.glb` | 0.90 x 2.10 | 0.12 | hinged | `leaf*` |
| `door-shaker-sage.glb` | 0.80 x 2.05 | 0.12 | hinged | `leaf*` |
| `door-oak-glazed.glb` | 0.90 x 2.10 | 0.12 | hinged | `leaf*` |
| `door-entrance-armored.glb` | 0.96 x 2.10 | 0.20 | hinged, swings out | `leaf*` |
| `door-steel-french.glb` | 1.20 x 2.15 | 0.16 | double | `leaf-l*`, `leaf-r*` |
| `window-pvc-tilt-turn.glb` | 1.50 x 1.45 | 0.20 | tilt | `sash-l*`, `sash-r*` |
| `window-alu-transom.glb` | 1.20 x 1.50 | 0.20 | casement | `sash-l*`, `sash-r*` |
| `window-panoramic-slider.glb` | 2.40 x 1.45 | 0.20 | sliding | `sash-b*` |
| `window-oak-box.glb` | 1.70 x 1.45 | 0.20 | fixed | none |
| `window-bath-hopper.glb` | 1.00 x 0.80 | 0.16 | tilt | `sash*` |

## Placing one
- Origin: bottom centre of the wall hole, on the wall's middle plane. Y up, X along the wall, +Z the room side.
  In `makeOpening`'s group (x from 0 at the hole's left edge) that is a shift of `width / 2` in x.
- Do not run it through `normalizeAsset`: sills and handles make the bounding box off-centre, so recentring moves
  the frame off the wall plane.
- Built for the sizes above. Up to about ±15% scale X and Y is fine. Beyond that, change `W, H, T` in the model's
  function and rerun (`cd compiler && uv run python ../catalog/openings/build.py`): mullions, lites and handles
  are laid out from the size, so they stay right.
- To animate, reparent the meshes whose name starts with the prefix under a pivot at `moving.<prefix>.point_m`
  (GLB frame) and apply `moving.<prefix>.motion`. Everything else stays put.
