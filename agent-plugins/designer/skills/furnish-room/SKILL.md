---
name: furnish-room
description: Furnish a room with catalog products, a finished first pass by room type. Use when the buyer asks to furnish, fill or decorate a room, says it feels empty or bare, or asks to make it cozier.
---

# Furnish a room

The outcome is a room someone would move into tomorrow: it looks like a real, lived-in home, the kind a magazine
photographs, not a showroom and not a hotel lobby. A first pass the buyer calls empty has failed, however correct
each piece is.

## What a finished room has

Think in stations and layers, not in a list of pieces.

- **Stations.** Every activity the brief implies (sitting and talking, eating, working, sleeping, dressing, storing)
  gets a complete station: a seat, a surface within reach of it, light on it, and storage where things pile up. A
  sofa with nowhere to put a cup, an armchair with no lamp, a bed with no bedside, are half stations.
- **Zones and movement.** Each zone reads at a glance; the paths from the doors run free, doors open fully, windows
  stay clear. Seats face each other close enough to talk, a circle around a table and a rug, rather than lined up
  along the walls around an empty middle.
- **Scale.** Pieces sized to the room and its ceiling. A large room needs large pieces and enough of them to hold
  it; a small rug floating in front of a sofa makes a room look emptier, so the rug carries the whole group. Art and
  mirrors are sized to their wall or to the piece below them.
- **Focal point and balance.** One thing the eye goes to first (the view, a sideboard with art above it, a bookcase
  wall, the headboard wall); the rest of the visual weight spread round the room, so no wall is crowded while
  another stands bare.
- **Layers that make it lived in.** Textiles: the rug, curtains on the windows, cushions and throws where the catalog
  has them. Dressed walls: art, mirrors, shelves, a bookcase. Books and objects on the surfaces. Plants at different
  heights. Real homes hold things from someone's life.
- **Light.** Layered: something overhead or ambient, a lamp at every place people sit or read, an accent that makes
  a corner glow. Seats turned toward the daylight; nothing blocks a window.
- **Harmony.** One palette and a few materials repeated round the room, one deliberate contrast, one memorable move.

Each room type has its anchors. Living: a seating group around a table, a focal wall, storage. Bedroom: the bed's
head on a solid wall, a bedside station on each open side, storage for clothes, a mirror. Kitchen-dining: a table
sized to the space with chairs all round, light over it, a sideboard or shelves; the worktop run stays clear. Kids:
sleep, a play floor, a desk by the window light, low storage, tall pieces fixed to walls. Office or reading room: a
desk with the window at its side, a good chair, shelves, somewhere to read with its own lamp. Entrance: somewhere to
sit and take shoes off, coats, a mirror, a light.

"Cozier": keep what is there and add warmth: softer and larger textiles, a reading corner with its own lamp, warm
light, plants, a warm wall finish (`restyle`).

## How

1. Read the room: `get_zones` for its polygon and area, `get_walls` for which walls are solid and where doors and
   windows are. `get_scene` overflows on a full flat; read nodes one at a time with `get_node`.
2. Plan the layout on paper first: which wall takes the anchor, where the path from each door runs, which zones the
   room holds, what stays open. Size each search to the wall or the gap you chose (`max_w`, `max_d`).
3. Search each station with hard filters (`kind`, sizes, `price_max`) and style words; `show_products` on the
   shortlist and pick by what the models look like. Prefer `sizeStatus: confirmed` for tight spots.
4. Place one product per call and wait for its result: parallel `place_product` calls race on the scene version
   and fail. Anchors first, then what completes each station, then the layers.
5. Look at the room: `view_scene` with the room's `zone_id`, `view: 'inside'` (eye level) and `'top'`. Ask whether,
   as a photo of a real home, it looks finished and lived in or whether someone would call it empty: which wall is
   bare, which seat has no lamp or surface, how much floor shows between the pieces, whether the windows have
   curtains, whether the rug holds the group. Add what is missing and look again. Keep going until it holds up as a
   real, lived-in room; stop before it turns cluttered. Without `view_scene` in your tools, run the same questions
   over the zone outline and the placed pieces' positions.
6. `check_collisions` with `floorOnly: true` and `minimumClearance` 0.05, then fix every overlap and every piece
   through a wall or in a door's path with `apply_patch`. Re-check until clean.

Ergonomics that keep a full room usable: walkways about 0.75-0.9 m, a coffee table about 0.4 m from the sofa, about
0.9 m in front of wardrobes and around a dining table. Wall pieces (art, hanging mirrors, wall shelves) hang: place
them with their back on the wall face (half the wall's thickness off its centreline), turned to face the room, with
`position[1]` at their bottom edge, so the centre of art sits near eye height, or a hand's span above the sofa or
headboard it hangs over.

Done means: every station is complete or its gap named as a catalog gap, the room holds up as lived in when you
look at it, the collision check is clean, and the answer gives each product's price and the total.
