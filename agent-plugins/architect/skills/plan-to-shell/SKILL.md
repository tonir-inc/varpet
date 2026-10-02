---
name: plan-to-shell
description: Build the empty flat's walls, rooms, doors and windows from a developer's floor plan or photos. Use when the buyer sends a plan image or photos, asks to model, trace or rebuild the flat, or reports a wall, room or opening that is wrong.
---

# Plan to shell

The outcome is the flat as the plan draws it, wall by wall, with every guess written down so the buyer can
correct it. Each rule below is a mistake a first read made on real Yerevan developer plans; with them up front a
plan-reading pass went from 95.3% to 98.3% on held-out plans (Sept 2026).

## 1. Read the plan into numbers before drawing

- **Scale** from three or more printed dimensions that agree. With areas only, pick the one scale that makes
  all printed room areas agree at once, never one room. Check it on a door (interior 0.8-0.9 m, entrance
  0.9-1.0 m). A printed flat total usually includes walls (gross); room areas are net, inside the wall faces.
- **Gridlines**: list each x where a wall face runs down the plan and each z where one runs across (x right,
  z down the plan, metres). Rooms and walls come from the same numbers, so they share corners exactly. A wall
  centreline sits half its thickness outside the room face it bounds.
- Write the room list (name, printed area, gridlines it spans) before the first edit.

## 2. What the drawing means

- **A wall exists only where the plan draws a filled, thick or hatched band, and only over that stretch.**
  Thin lines with ticks, arrows and a number are dimension lines. A wall run past its band seals a doorway.
- **Structure**: a green-hatched ~0.6 m square on a red axis cross is a concrete column; a grey-hatched band is
  a structural wall. One element per separately hatched piece: an L of two grey pieces round a column is two
  walls and a column (a short wall box of the column's size).
- **X boxes** (a rectangle with both diagonals): dark ones anywhere, and light-blue ones in a bathroom, are
  unused service shafts: a solid box of short walls (or one thick wall) at their size, never floor and not part
  of any room polygon. A white X inside a thick wall is part of that wall. A light-blue X on a balcony is the
  AC outdoor unit's place: leave the balcony floor there and mention it. None of these is a shower tray or a
  washing machine.
- **Openings fill the whole gap** the plan leaves in the band; a narrower one leaves a stub that is not there.
  A door arc shows the swing; its width is the gap. Windows are floor-to-ceiling (sill 0, head 2.6 m) unless
  the plan draws a sill or a narrower pane.
- Where two rooms meet with no drawn band (hall to living, living to kitchen), draw no wall: an open passage.
- **Balconies** are rooms (name them "Balcony") on the facade line, reached by a door. Their floor edge lies on
  the facade wall; draw no parapet walls on their open edges (railings belong only on open slab edges).
- Every room has a door or an open passage, and the flat has its entrance door on an outer wall.
- The developer's text can disagree with its own image: trace the image and say so.

## 3. Build (Pascal tools)

- `get_level_summary` gives the level id; a new flat starts with an empty level.
- Walls: draw the first with `create_wall`, then the rest in one or a few `apply_patch` batches (one call is
  atomic and saves once; looping one-op calls is slow). A wall node: `{type: "wall", start: [x, z], end: [x, z],
  thickness, height}` with `parentId` the level. Exterior and load-bearing walls 0.25-0.4 m, partitions
  0.1-0.12 m, height 2.7-3.0 m. Measure each thickness off the plan at your scale.
- Rooms: one zone per room with the polygon on the inner faces (`set_zone`, or `{type: "zone", name, polygon}`
  in a batch), corners in order (L shapes and bays are real corners), and a slab with the same polygon
  (`{type: "slab", name: "<room> floor", polygon}`) so its floor can take a finish. `create_room` draws its own
  walls: only for a free-standing room, else walls double.
- Doors and windows: `add_door` / `add_window` with `t` the opening's centre along the wall (0 start, 1 end) and
  the real width, or in a batch `{type: "door"|"window", wallId, position: [metres from wall start to the
  centre, sill + height / 2, 0], width, height}` with `parentId` the wall.
- Edits are sequential: wait for one call's result before the next.

## 4. Check against the plan, then answer

- `view_scene` with view `top`: compare the picture with the plan wall by wall (missing or extra wall, a wall
  across a doorway, a room on the wrong side, a shaft drawn as floor). The caption gives the x/z range and
  pixels per metre. Fix and look again until they agree.
- `get_zones` areas against the printed areas (within about 3%; a bigger gap means a gridline or the scale is
  wrong: move the gridline and rebuild from it, rather than nudging one corner). `get_walls` lengths against
  printed dimensions.
- `verify_scene` clean, or each remaining issue explained.

Done means every printed area matched or its mismatch explained, and the answer lists rooms with areas, then
every assumption (scale and how you got it, guessed thicknesses, an unreadable dimension, a symbol you were
unsure of) with the one question that matters most.
