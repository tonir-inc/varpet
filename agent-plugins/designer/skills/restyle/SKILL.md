---
name: restyle
description: Restyle a room to a named style or mood, including wall paint and floor finishes. Use when the buyer names a style (Scandinavian, japandi, art deco, industrial...), asks to repaint, change the floor, renovate, or change a room's colours.
---

# Restyle a room

The outcome is a room whose furniture, walls and floor read as one look the buyer recognises from the words they
used, on top of what the building already is: a style named for an old tenement with pine floors keeps a pine-toned
floor.

## Styles as palettes (start here, adapt to the brief)

- **Scandinavian:** pale oak or white-washed planks, soft white or greige walls, light wood and linen, grey/oat.
- **Japandi:** smoked or light oak floor, warm greige or sand walls, low pieces, black accents, few objects.
- **Mid-century:** walnut, brass, mustard/teal/navy accents, oak or chevron parquet, one accent wall.
- **Art deco / glam:** velvet, brass, jewel tones (emerald, ink blue, plum), chevron or dark parquet, marble.
- **Industrial:** concrete or dark wood floor, charcoal or brick wall, black metal, leather, Edison light.
- **Mediterranean:** terracotta tile, warm white or sand walls, rattan, linen, olive and ochre.
- **Minimalist:** a restrained complete set (still a full room), white or light grey walls, pale floor.

## Finishes

1. `list_finishes` with `surface` and a `query` in plain colour words ("deep green", "herringbone oak") and use
   only ids it returns. A guessed `library:` id renders as nothing.
2. Walls: every room in scope gets its walls decided. First one considered base on all of them:
   `set_wall_finish` with only the room's `zone_id` covers every face around it (piers, returns, column ends,
   reveals). Then at most one accent, always a whole plane: the full wall behind the sofa or bed (or the one they
   face), with every segment and pier on that plane in `wall_ids` plus `zone_id` (`get_walls` shows them), or a
   whole small room by its `zone_id`. Never an accent on a lone segment. Shared walls change only the face toward
   this room; a zone call splits a wall that runs on into the next room at its edge and returns the pieces
   (`split`): take the accent's ids from that result or a fresh `get_walls`, not from a list read before it. Wainscots and trims go on by `zone_id` too.
3. Floors: `set_floor_finish` with the `zone_id`. Wet rooms and balconies take tile or stone; living rooms and
   bedrooms wood. A whole-flat floor change is one call per room.
4. Trims: `set_wall_trim`, when it is in your tools, for skirting, crown moulding or a chair rail in the palette
   (painted to the wall for calm, contrasting for a period room).
5. Kitchens: the wall behind the run takes the backsplash; tile or stone on that wall face (`wall_ids`) when the
   catalog has no panel.
6. If the finish tools are missing from the tool list, say so plainly and name the finish you would choose.

## Furniture

Replace the movable furniture that clashes with the style, keep what the buyer asked to keep, and finish the room
with `furnish-room`'s steps from the plan on: every zone of the room used (a restyled living room with an empty
kitchen leg is half done), stations, a rug sized to its group, cushions and throws on the seats, a made bed, dressed
walls, light sized to what it lights, all in the palette. A style is carried as much by its textiles, lamps, art and
objects as by its sofa; a minimal style is still a full, warm room. Match wood tones; the signature move is the
style's strongest note (the velvet sofa against a lighter wall rather than lost in the same green).

Then review it as `furnish-room` step 8 does, room by room, and fix what the catalog can fix before answering.

Done means: every room's walls, floor and pieces chosen to the palette, the review
finds nothing the catalog could fix, and the answer names each finish by its label and where it went.
