---
name: plan-to-scene
description: Use when turning a developer's dimensioned floor-plan image into a scene JSON (walls, doors, windows, open passages, shafts, balconies), before any furniture.
---

# Floor-plan image → scene JSON, in one pass

> **varpet note (26 Sept):** written for Tonir's scene format (`scene/schema.md`, `apartment/` paths). The plan-reading rules hold; the OUTPUT must follow varpet's scene schema in `packages/engine` once decided. Rewrite the format parts before a batch run.

Measured 23 Sept 2026 on eleven Komitas Park plans: with these rules up front, one pass took
7 min for the walls (b24-t22); without them it took three passes and twice the tokens. Every rule
below is a mistake the first read made on real plans. Format: `scene/schema.md`. A finished
example: `apartment/komitas-park/b3-2-5/scene.json` and its README.

## Output

`apartment/<site>/traced/<id>/scene.json`: rooms, walls, openings, fixed; `items: []`,
`renovation: []`, `ops_log: []`, `apartment: {id, source: "plan", scale_confidence}`; and a
`NOTES.md` saying what was printed, measured off the raster, or guessed, and the room areas
against the plan's own table.

## Rules

1. **Scale** from three or more printed dimensions that agree (Komitas plans: ~17.5 mm/px).
   Plan-up is +y. Zoom by cropping with `sips` into a scratch folder; do not guess small text.
2. **A wall exists only where a filled, thick or hatched band is drawn, and only over that
   stretch.** Thin lines with ticks or arrows and a number are dimension lines, never walls.
   A wall must not run past where its band ends: that closes doorways and seals rooms.
3. **The 3D viewer draws a wall along every edge of every room polygon** unless an opening
   cuts it. Where two rooms meet with no drawn wall (hall↔living, living↔kitchen), give that
   edge a wall with `"open": true` and a door with `"leaf": false` spanning its full length.
4. **Doors and windows fill the whole gap** the plan leaves in the wall; a narrower opening
   leaves a stub of wall that is not there.
5. **X boxes** (a rectangle with both diagonals): dark ones anywhere and light-blue ones in a
   bathroom (a plumbing riser box) are unused service shafts: `fixed[]` `{kind: "shaft", pos: [cx, cy, 0],
   size: [w, d, 3.0], rot: 0}`, solid, never floor. White X boxes inside a thick wall are part of the
   wall. A light-blue one on a balcony is the AC outdoor unit place (provisional, Ashot 2026-10-02).
   Not a shower tray, not a washing machine.
5a. **Structure (Komitas Park):** a green-hatched ~0.6 m square on a red axis cross is a
   reinforced-concrete column; grey hatch beside it or along an axis is a structural wall. Both are
   solid and never move. One element per separate hatched piece: an L of two grey pieces round a
   column is two walls and a column. Legend and evidence: `experimental/plan-symbols.md` (local to the
   experimental worktree).
6. **Balconies:** a room whose name contains "Balcony"; its floor edge lies on the facade wall
   line (the converter snaps gaps up to 0.5 m; beyond that the balcony floats). No parapets: the
   viewer draws railings, on the open slab edges only (the ~0.2 m band between the tiles and the
   outer grey line; none where a wall closes the edge). Every room, balconies included, has a door
   or an open passage.
7. **Nothing floats:** fixed items start at z 0.
8. **Windows** in these developers' flats are floor-to-ceiling: sill 0, head 2.6, unless the
   plan shows otherwise.
9. **The developer's listing can be wrong** (2 of 10 records did not match their plan image).
   Trace the image; note the mismatch.

## Done means

- `node scene/bin/check.js <scene>` prints no INVALID;
- `node designer/audit_traced.mjs <scene>` reports no room without a way in, nothing floating;
- the `scene-visual-check` skill finds no mismatch between the top-down picture and the plan.

Record `timing: START=<s> END=<s> seconds=<n>` in NOTES.md (`date +%s` at start and end).
Then furnish with `furnish-from-plan` if the plan draws furniture.
