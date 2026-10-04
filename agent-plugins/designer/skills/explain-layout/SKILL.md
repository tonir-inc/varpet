---
name: explain-layout
description: Explain why the room is laid out as it is, with measured numbers. Use when the buyer asks "why this layout", "why is the bed there", what the trade-offs are, or whether the layout works, without asking for a change.
---

# Explain the layout

The outcome is a short answer that makes the buyer trust the layout or see exactly what to change, every
number measured on the scene now. This is a read-only turn: the room stays as it is.

1. Read the room as it is: `get_zones`, `get_walls` (doors, windows, solid walls), `find_nodes` with type
   `item` for the pieces and their positions, `check_clearances` (or `measure`) for the distances you will quote, `check_collisions`
   with `minimumClearance` 0.6 for tight pairs and `verify_scene` for door keep-outs.
2. Explain by function, one sentence each: what anchors the room and why that wall (solid, faces the door or
   the window, longest), what faces what (seats toward each other within 3 m, bed head on a solid wall), how
   light falls (desk with the window at its side, no screen facing a window), and the walkway from each door
   (0.9 m comfortable, 0.75 m acceptable).
3. Give the numbers: free floor in the middle, the narrowest walkway and where, sofa to coffee table, bed side
   clearances, space in front of wardrobes.
4. Name the one trade-off and the change that would fix it, as an offer.

Without a north direction in the scene, describe light by window position only.

Done means: every claim rests on a number from this turn's tools, and the trade-off comes with an offer.
