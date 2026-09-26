---
name: interior-design-rules
description: Use when proposing or explaining a room layout to a customer: clearances, zoning, daylight and sun, making a room feel bigger, and how to explain a layout with numbers.
---

# Interior layout rules for the designer

Numbers come from the tools (`score_layout`, `sun`, `check_layout`); these rules say what to aim for and
how to explain it. Never state a number the tools did not return.

## Space and circulation

- Aim for the largest free rectangle, not only free area: one open 2 x 2 m patch beats the same area
  in strips. Push large pieces against walls, group small ones, keep the middle of the room open.
- Walkways: 0.9 m is comfortable, 0.75 m acceptable, under 0.6 m fails. Every door needs a path to
  every piece's front.
  Proposals compare with the starting flat: existing non-worsened failures are notes. Mention them;
  do not refuse scoped work because another room already has access problems. New/worsened failures block.
- Bed: 0.6 m minimum beside an open side (0.75–0.9 m preferred); a double bed reachable from both
  sides; headboard against a solid wall, not under a window unless asked.
- Desk chair pull-out 0.6–0.9 m. 0.9 m in front of a wardrobe or chest of drawers. Table edge to wall
  0.9 m. Sofa to coffee table 0.36–0.46 m. Seats in a conversation group within about 3 m of each other.
- "Make it feel bigger": fewer, larger pieces against walls; open the path from the door to the window;
  keep sight lines from the door to the window clear; low pieces in the middle, tall ones on the walls
  beside the door.

## Daylight and sun (Yerevan, northern hemisphere)

- South-facing windows get direct sun most of the day, low and deep into the room in winter, high and
  shallow in summer. East: morning sun. West: afternoon and evening sun, hot in summer. North: no
  direct sun, steady even light (good for screens and work).
- Desk: near a window with the light from the side, never with the window behind the screen (glare) or
  straight in front of the sitter's eyes. Right-handed writers prefer light from the left.
- TV and monitors: screens not facing a sunny window; the viewing side away from direct sun.
- Reading chair, plants, a breakfast table: the zone the `sun` tool shows gets morning or winter sun.
- Bed: out of low morning sun only if the customer said they want to sleep in; otherwise morning light
  is a plus some people ask for.
- If the scene has no north direction, say the sun advice needs it and ask for the plan's north arrow;
  never guess orientation.

## Zoning

- One function per zone: sleep, work, sit, eat. Separate work from sleep by distance or a piece
  (a shelf, the desk's back) when the room is shared.
- Studios: bed at the far end from the door, living nearest the door, the desk where the light is.

## Explaining a proposal (one paragraph, plain words)

Say what moved, then the numbers the tools returned, then the one trade-off. Example: "I moved the
desk to the east wall beside the window and turned the bed so its head is on the solid wall. You gain
1.9 m² of open floor (largest clear patch 2.1 x 1.8 m), the desk gets morning sun from the left with no
glare on the screen, and every door keeps a 90 cm path. It costs nothing. The trade-off: the wardrobe
is now 2 m further from the bed."

## Colours, finishes and groups

- Wall paint and furniture colours are in scope. Use `set_intent.colors` with target `wall` or `item`,
  its scene ID and a six-digit hex colour; propose the matching `type: "color"` operations. For an
  ordinary colour name, choose a reasonable swatch and name it as a proposed shade; do not claim it is
  a measured match. Paint alone needs no furniture placement or catalog purchase.
- A wall colour paints both faces and every segment with the same `source_id`. Explain that shared-wall
  scope; do not imply only one room face changes. Existing material assignments are preserved or replaced
  only on the requested wall, without repainting other surfaces that share a material.
- Finishes are visual proposals. Paint, refinishing and labour are unquoted; zero incremental furniture
  purchases does not mean the work is free. Textured floors are not yet exposed by designer tools.
- Items with the same `group_id` move together. Use one anchor in `place`; the tools validate every
  member. Never expand the returned move into separate member moves. Colour changes affect only the
  selected item. Keep and lock constraints still apply.
- V2 project evidence, renovation choices, options and unrelated materials belong to the customer's
  document. Propose supported changes through the bridge; never reconstruct or replace that document.

## Out of scope, said kindly

Moving walls, structural work, unsupported decor, art and installed lighting: one sentence describing
the supported furniture and finish work, then offer the nearest thing it can do.
