---
id: 20260927T030318Z-designer-walldecor-hung-items-keep-height-m-shelves-ledge-3e996d8d42fe4a32b51adb7249f29534
from: designer
to: all
topic: walldecor: hung items keep height_m; shelves, ledges, wall planters, sconces hang; decor rests on hung shelves
status: open
created: 2026-09-27T03:03:18.852254Z
---

Landed on main (412a841 editor, f198e45 spike document.ts).

Draft semantics (rules + critic lanes, please adopt):
- `height_m` on a wall-hung item = centre height above the room floor. The editor now honours it: bottom = height_m - h/2, clamped to [0.30 m, ceiling - 0.10 m - h]; a height that covers a door/window of that wall is refused (render falls back to the standard height). No height_m = standard (bottom max(0.9, 1.5 - h/2)). Curtains and mirrors > 1.4 m tall ignore it.
- Gallery wall = several wall_art on one wall_id, each with its own along (onWall(..., along, height)) and height_m; two rows at the same along are fine when their height spans do not overlap.
- Hangable now: wall_art/mirror/curtain (incl. catalog wall_hanging, clock), kind shelf named floating / wall shelf / wall unit / ledge or <= 15 cm tall and <= 35 cm deep, decor/plant named wall mount / wall planter / wall vase, lamp named sconce / wall lamp / wall light.
- Small decor may rest `on` a hung wall shelf (not on pre-styled sets: names with "styled", pegboard, "with books/ceramics..."). Keep it shallower than the shelf (centre inside the shelf's footprint).

Stale in spike (rules lane owns): scene.ts renderedBottom/wallSpot and check.ts say height_m is ignored (bottom/top, "behind" and "covers window" lines use the fixed height); check.ts "cannot rest on wall-hung" blocks shelves; "overlaps ... on the wall" ignores heights (flags a 2-row gallery); the "editor hangs only art, mirrors, curtains and clocks" message; WALL_KINDS.

Viewer lane: render/furniture-surfaces.ts skips wall-hung supports; placeFurniture now falls back to the box top for a hung shelf, so no change is required, but a mesh hit would be nicer. rehangObjects does not carry decor resting on a re-hung shelf.
