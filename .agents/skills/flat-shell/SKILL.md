---
name: flat-shell
description: Read a developer's floor plan and the flat's photos into rooms and walls (the editor's structure contract), before any furniture.
---

# Flat shell from a plan and photos

Write `shell.json`. Code checks it and sends faults back once.

## Output
```json
{
  "rooms": [{"id": "living", "name": "Living room", "polygon": [[x, z], ...], "color": "#rrggbb"}],
  "walls": [{"id": "w1", "start": [x, z], "end": [x, z], "height": 2.6, "thickness": 0.12, "color": "#rrggbb",
             "openings": [{"id": "d1", "kind": "door|window", "offset": 0.4, "width": 0.8, "height": 2.05, "sill": 0}]}],
  "notes": ["what was printed, what was measured off the image, what was guessed"],
  "printed": {"living": {"dims_m": [5.0, 4.7]}, "bed": {"area_m2": 12.3}}
}
```
- Metres. `x` runs right on the plan, `z` runs down the plan. Put the flat's top-left corner near [0, 0].
- Room polygons follow the inside of the walls, corners in order. Bays, angled walls and L shapes are real corners, not rectangles.
- A wall is a centreline from `start` to `end`. `offset` is metres from `start` to the near edge of the opening.
- Where two rooms meet with no drawn wall (hall to living, living to kitchen), draw no wall there: that edge is an open passage.
- `printed`: copy the numbers the plan prints for each room (dimensions or area). Do not compute them from your polygon; code compares the two.
- `color`: room = floor colour in the photos; wall = wall paint colour in the photos.

## Fixtures (`components`)
Everything built in: toilets, showers, baths, basins/sinks, kitchen worktops and base/wall cabinets, appliances
(oven, fridge, washing machine, hob), radiators, balcony railings. Plans draw most of them; photos confirm them.
```json
"components": [{"id": "wc", "name": "Toilet", "kind": "toilet", "roomId": "bath", "position": [x, 0, z],
                "dimensions": [0.38, 0.8, 0.68], "rotation": 3.14159, "color": "#f4f4f2", "phase": "existing"}]
```
- `kind`: sink, toilet, shower, bath, cabinet, worktop, appliance, radiator, railing.
- `position`: [x, y, z] metres; x, z the footprint centre, y the bottom (0 on the floor, e.g. 1.4 for a wall cabinet).
- `dimensions`: [width, height, depth] metres. `rotation`: radians about the vertical, 0 = front faces +z.
- A kitchen run is a `cabinet` (base units) plus a `worktop` on top plus `cabinet`s on the wall above; one
  component per run, not per door. Appliances that sit in the run replace that stretch of cabinet.
- Wall-mounted (wall cabinets, radiators, basins on a wall): add `"host": {"wallId", "offset" (metres from the
  wall start to the centre), "elevation" (bottom height), "side"}`. side 1 is the face in the direction
  (-dz, dx), where (dx, dz) runs from the wall's start to its end: a wall running +x has side 1 on its +z face
  (lower on the plan); a wall running +z has side 1 on its -x face. -1 is the other face.
  For a hosted fixture the editor places it on that face; its rotation then adds to the wall's direction.
- Keep 0.5 m clear in front of every door. Fixtures sit inside their room and never inside a wall.

## Reading the plan (measured on real developer plans; each rule is a mistake a first read made)
1. **Scale** from three or more printed dimensions that agree. Zoom by cropping the image (`sips` on macOS, or Python) into this folder; do not guess small text.
2. **A wall exists only where a filled, thick or hatched band is drawn, and only over that stretch.** Thin lines with ticks, arrows and a number are dimension lines, never walls. A wall must not run past where its band ends: that closes doorways and seals rooms.
3. **Doors and windows fill the whole gap** the plan leaves in the wall; a narrower opening leaves a stub of wall that is not there. A door arc shows the swing; its width is the gap.
4. **Balconies** are rooms (name them so) whose edge lies on the facade line; they need a door.
5. **Every room has a way in**: a door on a wall it shares with another room, or an open passage. The flat has an entrance door on an outer wall.
6. **The listing can be wrong** (developer tables disagreed with their own plan 2 times in 10). Trace the image; say so in `notes`.
7. **"Not to scale" plans** still print room dimensions: scale from those, and say which you trusted.

## Using the photos
- **Ceiling height**: a standard door leaf is about 2.0 m; compare it with the ceiling in the photos. UK period flats run 2.7 to 3.2 m, new builds 2.4 to 2.6 m.
- **Windows**: sill height and window height from the photos, not the plan. A bay window is several walls, each with its window.
- **Colours**: floor colour per room, wall colour per wall, as they look in daylight. Different rooms often have different floors (tiles in bathrooms and kitchens).
- If a photo contradicts the plan (a wall that is not there, a door that moved), trust the photo for what exists and the plan for dimensions, and write it in `notes`.
