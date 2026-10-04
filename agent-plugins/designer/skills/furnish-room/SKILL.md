---
name: furnish-room
description: Furnish a room or a whole flat with catalog products, a finished first pass by room type. Use when the buyer asks to furnish, fill or decorate a room or flat, says it feels empty or bare, or asks to make it cozier.
---

# Furnish a room

The outcome is a room someone would move into tomorrow, the kind a magazine photographs: not a showroom, not a hotel
lobby. A first pass the buyer calls empty has failed, however correct each piece is.

## What a finished room has

- **Stations.** Every activity the room is for gets a complete station: a seat, a surface within reach, light on it,
  storage where things pile up. A sofa with nowhere to put a cup, an armchair with no lamp, a bed with no bedside are
  half stations.
- **The whole room used.** Each zone reads at a glance and together they hold the floor. Paths from the doors run
  free, doors open fully, windows stay clear.
- **Scale.** Pieces sized to the room and its ceiling; the rug carries the whole group; art and mirrors sized to
  their wall or the piece below; a pendant to its table or the room.
- **Layers.** Textiles, dressed walls (art, mirrors, shelves, a storage wall), books and objects on surfaces, plants
  at different heights. A lone plant in an empty corner is filler: ask what furniture that spot is for.
- **Surfaces.** A chosen floor and one wall colour on all the room's walls (by `zone_id`); an accent only as a whole
  plane (the full wall behind the sofa or bed, piers included) or a whole small room, never a lone segment; trims
  when you can set them.
- **Light.** Something overhead, a lamp at every seat and bed side, an accent that makes a corner glow.
- **The concept.** Its palette and materials repeated (match the wood tones), its signature move visible.

Anchors by room. Living: a seating group facing each other around a table, a focal wall, storage. Bedroom: bed head on
a solid wall, a bedside station each open side, clothes storage, a mirror; a guest room adds a chair and a place for a
suitcase. Kitchen: the base run plus uppers or open shelves, a backsplash, a hood, light over the worktop, styled
counters; a table sized to the space with chairs all round and light over it, stools at an island. Kids: sleep, a play
floor, a desk by the window, low storage, tall pieces fixed to walls. Study: desk with the window at its side, a good
chair, shelves, a reading seat with its lamp. Hall, corridor, landing or stair zone: a runner, a console or bench, a
mirror, hooks, art or a gallery wall, a light. Bath or WC: a mirror, a towel rail or shelf, a plant.

"Cozier": keep what is there and add warmth: more and softer textiles, a reading corner with its own lamp, warm
light, plants, a warm wall finish.

## How

1. **Read the flat.** `get_zones` (polygons, areas) and `get_walls` (solid walls, doors, windows). `get_scene`
   overflows on a full flat; use `get_node`. List every zone now, halls, stair zones and baths included, and the
   passages inside open zones, so none is forgotten at the end.
2. **Plan on paper.** First the concept (palette, two or three materials, the signature move). Then per room: its
   zones, which wall takes each anchor, where each door's path runs, what stays open, its wall colour, accent and
   floor. Size each search to the wall or gap you chose (`max_w`, `max_d`).
3. **Surfaces.** Set each room's walls and floor from the plan (`restyle` has the finish steps).
4. **Anchors, then stations.** Search with hard filters and style words, `show_products` the shortlist and pick by
   the models. Prefer `sizeStatus: confirmed` for tight spots. A product renders as its model: a bed frame shows a bare
   mattress, so pick a bed sold with bedding or a made-up mattress.
5. **Rug from the group.** With the group placed, take the rug's size from the pieces' positions: across, the
   sofa's width and a little more; deep, from under the sofa's front legs to under the front legs of the seats
   opposite. Under a bed it runs out on both sides and past the foot. Search with those as `min_w`/`min_d` and
   `target_size`; the stock 5 x 8 ft rug is usually the mistake in a living room. A seat that cannot reach the rug
   belongs closer to the group.
6. **Layers.** Cushions (kind `cushion` or `decor`, "throw pillow") and throws (`throw_blanket`) go on sofas, chairs
   and beds with `mount: 'surface'` and y at the seat or mattress top (about 0.45 m on most sofas), else they land on
   the floor. Curtains wider than the window. Wall pieces sized to the wall or to the furniture under them.
7. **Light.** Pendants and ceiling lights hang from the ceiling at the floor point under them. Over a dining table:
   a shade or a row of pendants matched to the table, bottom about 0.75 m above the top; elsewhere above 2 m. When
   `place_product` takes a drop, set it; otherwise the result gives the bottom height, so pick a pendant whose length
   lands there.
8. **Review it room by room, as a designer would.** `view_scene` with the room's `zone_id`, `'inside'` and `'top'` (an
   inside view facing a wall shows nothing; use `'3d'` then). Write down what a designer reviewing it would flag:
   walk each wall and say what stands or hangs on it and what colour it is (the kitchen wall above the run too); then
   the seats and beds (dressed?), the rug (under every seat's legs?), each seat's lamp, the floor with no use, a zone
   the brief implies but the room lacks, all the weight on one wall, a piece off the concept. Halls, stair zones and
   baths get looked at too. Fix what the catalog can fix and look again. Only what you cannot fix
   goes in the answer as a trade-off.
9. **Check.** `check_collisions` with `floorOnly: true` and `minimumClearance` 0.05, fix every overlap and every piece
   through a wall or in a door's path. Then the walkways: `check_clearances`, or `measure` for a gap it does not
   cover (sofa to table, chairs to walls, bed sides and foot, in front of storage), against the layout standards in
   your instructions.

Hung pieces: art, mirrors, wall lamps and shelves go on a wall by `wall_id`, `along` (metres from the wall's start to
the centre) and `height` (bottom edge), with the room's `zone_id` as `target_id`: art centred near eye height, or its
bottom a hand's span above the sofa, console or headboard, about two thirds of that piece's width (`min_w`). Curtains
and blinds go by `window_id`.

Done means: every zone in the plan has its stations, surfaces, layers and light, the review in step 8 finds nothing the catalog
could fix, collisions are clean, every stated clearance was measured, and the answer gives each product's price and
the total.
