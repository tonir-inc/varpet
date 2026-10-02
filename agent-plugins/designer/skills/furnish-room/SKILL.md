---
name: furnish-room
description: Furnish a room with catalog products, a finished first pass by room type. Use when the buyer asks to furnish, fill or decorate a room, says it feels empty or bare, or asks to make it cozier.
---

# Furnish a room

The outcome is a room the buyer would move into: every role of its type filled with a real product, layered
light, and nothing left that makes them say "it still feels empty". A sparse first pass costs a second turn.

## Roles by room type (the first pass fills all of them where they fit)

- **Living:** sofa; 1-2 more seats (armchairs, pouf) within 3 m of it; coffee table 0.36-0.46 m from the sofa;
  rug that the front legs of the seating stand on; side table within reach of each seat; floor lamp plus a table
  lamp; a focal piece (TV unit, sideboard, bookcase or display cabinet) on the wall the sofa faces; plants; decor.
- **Bedroom:** bed with its head on a solid wall; a bedside table and lamp on each open side; wardrobe or chest
  with 0.9 m in front; rug under the lower two-thirds of the bed; mirror; a chair or bench if there is room.
- **Kitchen-dining:** table sized to the space (0.9 m from edge to wall or worktop), chairs on every usable side,
  a pendant or floor lamp over or beside it, a sideboard or open shelf, plants. Keep the worktop run clear.
- **Kids:** bed, desk with chair by the window light, low storage, rug, soft seat; tall pieces against walls.
- **Office / reading room:** desk with side light from the window, chair, bookcase, reading chair and lamp, rug.
- **Entrance:** shoe cabinet or bench, coat rack, mirror; 0.9 m walkway kept.
- **"Cozier":** keep what is there and add warmth: a larger or softer rug, a reading chair with its own lamp,
  warm table lamps, throws and cushions where the catalog has them, plants, and a warm wall finish (restyle).

## How

1. Read the room: `get_zones` for its polygon and area, `get_walls` for which walls are solid and where doors
   and windows are. `get_scene` overflows on a full flat; read nodes one at a time with `get_node`.
2. Plan the layout on paper first: which wall takes the anchor piece, where the walkway from each door runs,
   what stays open. Size the search to the wall you chose (`max_w`, `max_d`).
3. Search each role with hard filters (`kind`, sizes, `price_max`) and style words; `show_products` on the
   shortlist and pick by what the models look like. Prefer `sizeStatus: confirmed` for tight spots.
4. Place one product per call and wait for its result: parallel `place_product` calls race on the scene
   version and fail. Anchor pieces first, then the pieces that relate to them.
5. `check_collisions` with `floorOnly: true` and `minimumClearance` 0.05, then fix every overlap and every piece
   through a wall or in a door's path with `apply_patch`. Re-check until clean.

Wall pieces (art, hanging mirrors, wall shelves) hang: place them with their back on the wall face (half the
wall's thickness off its centreline), turned to face the room, and `position[1]` at their bottom edge, so the
centre of art sits about 1.5 m up, or 0.2-0.3 m above the sofa or headboard it hangs over.

Done means: every role above is filled or named as a catalog gap, the collision check is clean, and the answer
gives each product's price and the total.
