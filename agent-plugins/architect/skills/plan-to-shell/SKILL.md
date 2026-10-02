---
name: plan-to-shell
description: Build the empty flat's walls, rooms, doors and windows from a developer's floor plan or photos. Use when the buyer sends a plan image or photos, asks to model, trace or rebuild the flat, or reports a wall, room or opening that is wrong.
---

# Plan to shell

The outcome is the flat as the plan draws it, faithful wall by wall, with every guess written down so the buyer
can correct it. Each rule below is a mistake a first read made on real developer plans (v1, Sept 2026).

## Read the plan into gridlines first

1. **Scale** from three or more printed dimensions that agree. With areas only, choose the one scale that makes
   all printed room areas agree at once, never one room. Check it on a door (interior 0.8-0.9 m, entrance
   0.9-1.0 m). "Not to scale" plans still print dimensions: say which you trusted.
2. Name every **gridline** before drawing: each x where a wall face runs down the plan, each z where one runs
   across (x right, z down the plan, metres, the flat centred near the origin). Rooms and walls are then built
   from the same numbers, so they share corners exactly. A wall centreline sits half its thickness outside the
   room face it bounds.
3. **A wall exists only where the plan draws a filled, thick or hatched band, and only over that stretch.**
   Thin lines with ticks, arrows and a number are dimension lines. A wall that runs past its band seals a
   doorway.
4. **Openings fill the whole gap** the plan leaves in the band; a narrower door leaves a stub that is not
   there. A door arc shows the swing; its width is the gap. Windows in Yerevan new builds are often
   floor-to-ceiling: sill 0, head about 2.6 m, unless drawn otherwise.
5. Where two rooms meet with no drawn band (hall to living, living to kitchen) draw no wall: an open passage.
6. Grey boxes with an X are service shafts: a short solid wall box, never floor. Balconies are rooms on the
   facade line with a door.
7. The developer's listing can disagree with its own image (2 of 10 did): trace the image and say so.

## Build

`create_wall` once per band (exterior and load-bearing 0.3-0.4 m, partitions 0.1-0.12 m, height 2.7-3.0 m);
`set_zone` per room with the polygon on the inner faces, corners in order (L shapes and bays are real corners);
a slab per room with `apply_patch` (type "slab", the room polygon) so floors can take finishes; `add_door` and
`add_window` with `t` along the wall (0 start, 1 end) at the real width. One call at a time: edits share the
scene version.

## Check against the plan

Compare, room by room, the built scene with the image and fix the scene until they agree:
- zone areas from `get_zones` against the printed areas (within 3%; a bigger gap means a gridline or the scale
  is wrong: move the gridline and rebuild from it, rather than nudging one corner);
- wall lengths from `get_walls` against the printed dimensions;
- every room has a door or an open passage, and the flat has its entrance door on an outer wall;
- no wall crosses a doorway, no gap in a band the plan draws solid;
- `verify_scene` clean.

Done means: every printed area matched or its mismatch explained, and the answer lists room areas and every
assumption (scale, a guessed thickness, a dimension too small to read) with the question for the one that
matters most.
