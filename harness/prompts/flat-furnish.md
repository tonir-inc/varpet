---
name: flat-furnish
description: Place a flat's built pieces where the photos show them, in the flat's shell, as it is today.
---

# Furnish the flat as it is

Write `placements.json`. Code checks it and sends faults back once. This is the flat as the photos show
it today, not a new layout: put each piece where it stands in the photos.

## Output
```json
{"placements": [{"piece": "sofa", "copy": 1, "room": "studio", "x": 2.1, "z": 3.4, "rotation": 180}],
 "notes": ["sofa: photo 2 shows it under the bay window, back to the window"]}
```
- `x`, `z`: the centre of the piece's footprint on the floor, in the shell's frame (metres; z runs down the plan).
- `rotation`: degrees about the vertical; 0 means the piece's front faces +z (down the plan), 90 faces +x,
  180 faces -z, 270 faces -x. A sofa's front is the side you sit on; a bed's front is its foot; a
  wardrobe's front is its doors; a desk's front is where you sit.
- `copy`: 1..count for identical pieces (four dining chairs are copy 1 to 4 of one piece).
- Not everything stands on the floor:
  - `"on": "<piece>", "y": <top of that piece>`: stands on another piece (a lamp on a bedside chest, a TV on a unit).
    Its footprint must fit on the piece below; `y` is that piece's height (plus its own `y`).
  - `"hanging": true, "y": <bottom height>`: hangs from the ceiling (pendant lights). Keep its top under the ceiling.
  - `"under": "<piece>"`: tucked under another piece (a pouffe under a table, a stool under a counter); it may
    overlap that piece from above as long as it is lower than it.
- Only pieces from the list in the brief. Leave a piece out only if no photo shows where it is.
- One `notes` line per piece: which photo shows it and what it stands against.

## How to read the photos into positions
1. Find each piece's wall first: which wall is it against, and what is next to it (window, door, corner)?
2. Backs of beds, sofas, wardrobes, bookcases and chests go against a wall: the footprint's back edge sits
   about 2 cm off the wall's face (a wall's face is half its thickness from its centreline).
3. Then slide along that wall to match the photo: distance from the nearest corner, door or window.
4. Freestanding pieces (coffee table, dining table): in front of or between what they serve, as the photo shows.
5. Chairs around a table face the table.

## Checks (you get these back as faults)
- every footprint inside its room (3 cm tolerance), not inside a wall;
- no two footprints overlap (rugs excepted);
- 0.5 m kept clear on both sides of every door;
- no more copies than the flat has.
