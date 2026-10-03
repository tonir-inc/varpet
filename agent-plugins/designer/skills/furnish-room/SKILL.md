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
- **The whole room used.** Each zone reads at a glance and together they hold the floor. A large living room is not
  one sofa group with an empty middle: it also takes a dining table, a reading corner, a desk or a storage wall. Paths
  from the doors run free, doors open fully, windows stay clear.
- **Scale.** Pieces sized to the room and its ceiling. The rug carries the whole group; art and mirrors are sized to
  their wall or the piece below; a pendant to its table or the room.
- **Layers.** Textiles (rug, curtains, cushions, throws, made beds), dressed walls (art, mirrors, shelves, a bookcase
  or storage wall), books and objects on surfaces, plants at different heights. Layers finish furniture; a lone plant
  in an empty corner is filler, so ask first what furniture that spot is for.
- **Light.** Something overhead, a lamp at every seat and bed side, an accent that makes a corner glow.
- **Harmony and one move.** One palette and a few materials repeated (match the wood tones), one deliberate contrast,
  and the signature move you decided from the brief.

Anchors by room. Living: a seating group facing each other around a table, a focal wall, storage. Bedroom: bed head on
a solid wall, a bedside station each open side, clothes storage, a mirror. Kitchen-dining: a table sized to the space
with chairs all round, light over it; the worktop run stays clear; stools at an island. Kids: sleep, a play floor, a
desk by the window, low storage, tall pieces fixed to walls. Study: desk with the window at its side, a good chair,
shelves, a reading seat with its lamp. Hall or entrance: a bench or shoe cabinet, hooks or a coat rail, a mirror, a
light; a long hall also takes a console or a runner. Bathroom: a mirror, a towel ladder or shelf, a plant, where the
catalog has them.

"Cozier": keep what is there and add warmth: more and softer textiles, a reading corner with its own lamp, warm
light, plants, a warm wall finish (`restyle`).

## How

1. **Read the flat.** `get_zones` (polygons, areas) and `get_walls` (solid walls, doors, windows) for every room in
   scope. `get_scene` overflows on a full flat; use `get_node`. For "the whole flat", list every zone now, hall and
   baths included, so none is forgotten at the end.
2. **Plan on paper.** Per room: its zones, which wall takes each anchor, where each door's path runs, what stays open.
   Name the signature move. Size each search to the wall or gap you chose (`max_w`, `max_d`).
3. **Anchors, then stations.** Search with hard filters and style words, `show_products` the shortlist and pick by
   the models. Prefer `sizeStatus: confirmed` for tight spots. A product renders as its model: a bed frame shows a bare
   mattress, so pick a bed sold with bedding or a made-up mattress. Place one product per call and wait for its
   result (parallel `place_product` calls race and fail).
4. **Rug from the group.** With the group placed, take the rug's size from the pieces' positions: across, the
   sofa's width and a little more; deep, from under the sofa's front legs to under the front legs of the seats
   opposite. Under a bed it runs out on both sides and past the foot. Search with those as `min_w`/`min_d` and
   `target_size`; the stock 5 x 8 ft rug is usually the mistake in a living room. A seat that cannot reach the rug
   belongs closer to the group.
5. **Layers.** Cushions (kind `cushion` or `decor`, "throw pillow") and throws (`throw_blanket`) go on sofas, chairs
   and beds with `mount: 'surface'` and y at the seat or mattress top (about 0.45 m on most sofas), else they land on
   the floor. Curtains wider than the window. Wall pieces sized to the wall or to the furniture under them.
6. **Light.** Pendants and ceiling lights hang from the ceiling at the floor point under them. Over a dining table:
   a shade or a row of pendants matched to the table, bottom about 0.75 m above the top; elsewhere above 2 m. When
   `place_product` takes a drop, set it; otherwise the result gives the bottom height, so pick a pendant whose length
   lands there.
7. **Look as the critic will, room by room.** `view_scene` with the room's `zone_id`, `'inside'` and `'top'` (an
   inside view facing a wall shows nothing; use `'3d'` then). Write down what a designer reviewing it would flag:
   walk each wall and say what stands or hangs on it; then the seats and beds (dressed?), the rug (under every
   seat's legs?), each seat's lamp, the floor with no use, a zone the brief implies but the room lacks, all the
   weight on one wall. Fix what the catalog can fix and look again. Only what you cannot fix
   goes in the answer as a trade-off.
8. **Check.** `check_collisions` with `floorOnly: true` and `minimumClearance` 0.05, fix every overlap and every piece
   through a wall or in a door's path. Then the walkways: `check_clearances` when it is in your tools, otherwise
   `measure` the gaps you will quote (sofa to table, chairs to walls, bed sides and foot, in front of storage). A
   clearance under the rules (walkways 0.75-0.9 m, about 0.4 m sofa to coffee table, 0.9 m in front of
   wardrobes and around a dining table, 0.6 m beside a bed) is a change to make, not a number to report.

Hung pieces: art, mirrors, wall lamps and shelves go on a wall by `wall_id`, `along` (metres from the wall's start to
the centre) and `height` (bottom edge), with the room's `zone_id` as `target_id`: art centred near eye height, or its
bottom a hand's span above the sofa, console or headboard, about two thirds of that piece's width (`min_w`). Curtains
and blinds go by `window_id`.

Done means: every room in scope has its stations, layers and light, the review in step 7 finds nothing the catalog
could fix, collisions are clean, every stated clearance was measured, and the answer gives each product's price and
the total.
