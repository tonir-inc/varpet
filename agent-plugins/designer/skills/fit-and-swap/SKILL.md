---
name: fit-and-swap
description: Check whether a piece fits and swap one piece for another. Use when the buyer asks "will a 2 m sofa fit", "is there room for", "swap the sofa for something cheaper/bigger/in green", or wants one piece replaced or moved.
---

# Fit and swap

The outcome is a straight answer the buyer can trust: yes, no, or what is missing to say, backed by a check on
the real room. The evidence rules are Pascal's `furniture-fit` skill; this is the buyer-facing path.

## Will it fit

1. Pin the item: width, depth and height in metres from the buyer's numbers or a catalog product. A size the
   buyer did not give and no product supplies is a question, asked once.
2. Find the spot: the room's walls and doors (`get_zones`, `get_walls`), the existing pieces, the wall the
   piece would stand on, and its pose (rotation so its front faces the room).
3. Test it without changing the scene: `check_collisions` with `levelId`, `floorOnly: true`,
   `minimumClearance` (0.05 for touching, 0.75 for a walkway) and `candidate: {levelId, dimensions: [w, h, d],
   position, rotationY}` (radians). Check it lies inside the room polygon and clear of each door's 0.9 m path.
4. Fails: try the other walls and a 90-degree turn before saying no; name the largest size that fits there.
5. Answer: "A 2.0 x 0.9 m sofa fits on the west wall with 1.1 m to the coffee table and the door path clear."
   Height under a window sill, the delivery route through doors and stairwells, and assembly are not checked;
   say so when they matter.

## Swap

1. Note the old piece: product, size, position, rotation, and what relates to it (the coffee table in front,
   the lamp beside it).
2. Search the same `kind` with the buyer's change (`price_max` below the old price for cheaper, colours or
   styles for a look) and `max_w`/`max_d` no larger than the free space; `show_products` the shortlist.
3. `delete_node` the old item, `place_product` the new one at the old pose, then re-seat related pieces if the
   size changed (sofa to coffee table 0.36-0.46 m; the rug still under every seat's front legs; cushions and throw
   moved onto the new piece) and run `check_collisions`, and `check_clearances` when it is in your tools.
4. Answer with old and new name and price, the saving or extra, and any clearance that changed.

Done means: a verdict from a check (not from arithmetic alone), or the swap placed, checked and priced.
