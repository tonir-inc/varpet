---
name: scene-visual-check
description: Use after writing or changing a traced scene, to compare what the 3D viewer will draw against the developer's plan image and find walls, gaps and rooms that do not match.
---

# Check the 3D against the plan, by picture and by audit

> **varpet note (26 Sept):** written for Tonir's scene format (`scene/schema.md`, `apartment/` paths). The plan-reading rules hold; the OUTPUT must follow varpet's scene schema in `packages/engine` once decided. Rewrite the format parts before a batch run.

The model's own read misses things a picture shows at once. On 23 Sept this loop found
balconies stopping 0.3 m short of the facade, wall stubs beside doors, a wall running 0.23 m
past its drawn end, and a 0.1 m hole in a solid wall, on plans that already passed every
automatic check.

## The loop (at most four rounds)

1. Convert and draw what the viewer draws, top-down, 1 px = 1 cm:
   ```
   node designer/to_friend_shell.mjs <scene.json> designer/friend-viewer/runs/<id>/scene.json
   node designer/topdown.mjs designer/friend-viewer/runs/<id>/scene.json <scratch>/<id>-r<N>.png
   ```
   Key: black = wall drawn, green = door, blue = window, dashed orange = open passage (no
   wall), dark grey = shaft or column, pale green = open balcony floor.
2. Read the picture and the plan image side by side. For every black run, the plan must draw a
   wall band over the same stretch, same start, same end. Fix the scene (not the picture):
   - a black run where the plan has no wall → split the room edge, add an open passage;
   - a wall run past its drawn end → shorten the polygon edge or the wall;
   - a stub beside a door or window → widen the opening to the whole gap;
   - a gap in a wall the plan draws solid → close it (move the room edge onto the wall line);
   - a room with no green or orange on its outline → it cannot be entered; add its door.
3. Audit mechanically:
   ```
   node scene/bin/check.js <scene.json>                  # no INVALID
   node designer/audit_traced.mjs <scene.json>           # no room without a way in, nothing floating
   node designer/audit_viewer.mjs <scene.json>=designer/friend-viewer/runs/<id>/scene.json
   ```
   In the last one, "doors cut on one side only" is normal for the entrance door.
4. Repeat until the picture matches. Copy the final picture to the flat's folder as
   `topdown.png` and list every change, with the reason seen on the plan, in NOTES.md.

## When the tool is wrong

If the picture looks cut off or wrong, say so and report it; do not patch `designer/*.mjs` from
inside a tracing task. Test a tool on one plan before running it on ten.
