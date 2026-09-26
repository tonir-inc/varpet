---
name: part-dsl-draft
description: Write one furniture piece as a JSON part program (draft DSL, until the c105 part-dsl lands).
---

# Part program (draft)

Write one JSON file. Code builds the mesh and checks it; faults come back to you once.

## Frame
Metres. Z is up. The origin is the floor centre of the piece. The piece box spans
x -w/2..w/2 (width), y -d/2..d/2 (depth, +y is the back), z 0..h. `size` is the true [w, d, h].

## Parts
Each part: `id`, `shape` (`box`, `rounded_box` with `radius`, `cylinder` with diameter min(x, y)),
`size` [x, y, z], `material`, and exactly one placement:
- `attach`: `{"to": <earlier part or "piece">, "at": [u,v,w], "self": [u,v,w], "offset": [x,y,z]}`.
  Unit points run 0..1 inside a box: [0.5,0.5,0] bottom centre, [0.5,1,1] top back edge.
  The `self` point of this part lands on the `at` point of `to`. Prefer offset 0: contact is then built in.
- `between`: `{"bottom": <part or "floor">, "top": <part>, "at": [u,v]}` stretches the part in z from
  the top of `bottom` to the bottom of `top`, centred at unit [u,v] of `top`. Use it for legs; its z size is ignored.
Optional: `rotate` [x,y,z] degrees about the part centre; `mirror` ["x","y"] adds reflected copies through the
centre of the box it is placed on (four legs = one leg + mirror x,y); `repeat` {"axis","count","step"} for shelves and rails.

## Materials
`materials`: name -> `{"finish": <id below>, "color": "#rrggbb", "roughness": 0..1 (optional)}`.
- Pick the finish that matches what the photo shows (wood species, fabric weave, stone, metal).
- `color` is the part's colour as seen in the photo; it tints the finish exactly. Leave it out for the usual colour.
- Mirrors and glass: `{"kind": "mirror"}` or `{"kind": "glass", "color": ...}`, no finish.
- For wood and brushed metal set the part's `grain` to the axis the grain runs along (usually its longest side).
- A part with no material is plain grey: avoid it.

<!-- finishes:start -->
<!-- finishes:end -->

## Checks (you get these back as faults)
- size within max(2 cm, 3%) of the true size on every axis;
- lowest point on the floor;
- every part touches a chain of parts that reaches the floor; loose groups come back with where they sit and the gap;
- at most 60k triangles.

## What scored well
- Structure before detail: get the big shapes, heights and proportions right first.
- Soft pieces need soft parts: `rounded_box` cushions, tall backs where the photo shows them.
- Part sizes in metres from the photo, never fractions of the whole.
- Identical parts once, via `mirror` or `repeat`.

## Example
```json
{
  "name": "dining-chair",
  "size": [0.45, 0.5, 0.85],
  "materials": {
    "oak": {"finish": "oak", "color": "#a57c52"},
    "linen": {"finish": "linen", "color": "#d9d2c5"}
  },
  "parts": [
    {"id": "seat", "size": [0.45, 0.5, 0.04], "material": "oak",
     "attach": {"to": "piece", "at": [0.5, 0.5, 0], "self": [0.5, 0.5, 0], "offset": [0, 0, 0.42]}},
    {"id": "cushion", "shape": "rounded_box", "size": [0.41, 0.42, 0.05], "radius": 0.02, "material": "linen",
     "attach": {"to": "seat", "at": [0.5, 0.45, 1], "self": [0.5, 0.5, 0]}},
    {"id": "leg", "shape": "cylinder", "size": [0.04, 0.04, 0], "material": "oak",
     "between": {"bottom": "floor", "top": "seat", "at": [0.08, 0.08]}, "mirror": ["x", "y"]},
    {"id": "back-post", "size": [0.04, 0.03, 0.39], "material": "oak",
     "attach": {"to": "seat", "at": [0.06, 1, 1], "self": [0.5, 1, 0]}, "mirror": ["x"]},
    {"id": "back-rail", "size": [0.37, 0.02, 0.06], "material": "oak",
     "attach": {"to": "back-post", "at": [1, 0.5, 1], "self": [0, 0.5, 1]}, "repeat": {"axis": "z", "count": 3, "step": -0.12}}
  ]
}
```
