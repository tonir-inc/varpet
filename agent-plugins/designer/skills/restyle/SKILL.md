---
name: restyle
description: Restyle a room to a named style or mood, including wall paint and floor finishes. Use when the buyer names a style (Scandinavian, japandi, art deco, industrial...), asks to repaint, change the floor, renovate, or change a room's colours.
---

# Restyle a room

The outcome is a room whose furniture, walls and floor read as one look the buyer recognises from the words they
used. Walls and floors are part of the brief whenever it says renovate, paint, colours, floors or names a style
that lives in its surfaces (dark academia, art deco, Mediterranean).

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
2. Walls: `set_wall_finish` with the room's `zone_id` for all its walls, or `wall_ids` plus `zone_id` for an
   accent wall (usually the longest solid wall the sofa or bed backs onto or faces). Shared walls change only
   the face toward this room.
3. Floors: `set_floor_finish` with the `zone_id`. Wet rooms and balconies take tile or stone; living rooms and
   bedrooms wood. A whole-flat floor change is one call per room.
4. If the finish tools are missing from the tool list, say so plainly and name the finish you would choose.

## Furniture

Replace the movable furniture that clashes with the style, keep what the buyer asked to keep, and fill every
role of the room (the `furnish-room` roles). Match wood tones across pieces; one statement piece per room.

Done means: walls and floor changed when the brief asked for them, every piece chosen to the palette, and the
answer names each finish by its label and where it went.
