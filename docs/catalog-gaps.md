# Catalog gaps: models the designer needed and could not find

Living list. Source: the spike designer's own `missing.md` logs from whole-flat runs on 26–27 Sept 2026
(briefs: family of three on Komitas b24-t22, three generations on b23-t64, couple expecting a baby on b21-t13,
remote engineer on Avani) plus render review. Add a row when a run logs a new `[catalog]` gap; mark it done
with the commit that fills it.

## Missing products

| Product | Needed for | Status |
|---|---|---|
| Mattress + bedding (single 90x200, double 140x200, queen 160x200, king 180x200) | every bed; all four flats render beds as bare slats | live 27 Sept: 12 SKUs (kind `mattress`, 118–250k AMD) imported and embedded on mc-server |
| Crib / cot | baby brief | live 27 Sept: 6 (`extra:bpy-nursery:*`, kind `crib` -> editor `bed`), 06ad102 |
| Changing table | baby brief | live 27 Sept: 3 (kind `changing_table` -> editor `dresser`), 06ad102 |
| Pet bed | baby brief (small dog) | live 27 Sept: 8 (kind `pet_bed` -> editor `decor`), 06ad102 |
| Curtains, blackout blinds, roller blinds | bedrooms (privacy, a light sleeper) | live 27 Sept: 12 curtain pairs + 6 blinds (`bpy-curtains`); the 21 older curtains were not placeable until 8a2c22e; blinds hang like curtains (5412dfb) |
| Kitchen furnishing beyond carts (bar stools, kitchen storage, small dining sets for kitchens) | every kitchen | live 27 Sept: 18 (`bpy-kitchen`: 8 stools, tables, chairs, trolley, rack, pantry, bench) |
| Bathroom furnishing (wet-room cabinets, towel storage, bath mats) | every bathroom; searches return farmhouse and filing cabinets | live 27 Sept: 18 (`bpy-bathroom`: vanities with basin, cabinets, towel racks, hampers, mats, mirror cabinets) |
| Small outdoor furniture (bistro set, balcony chairs, weather-proof side tables) | balconies in b24, b23 | live 27 Sept: 17 (`bpy-balcony`, tagged outdoor/balcony) |
| Desktop PCs / towers | teen study rooms (b23) | live 27 Sept: 7 PCs + 2 monitors (`bpy-techmirror`) |
| Narrow wall mirrors (< 0.6 m wide) | small halls (b21) | live 27 Sept: 6 (`bpy-techmirror`), plus 97 ABO mirrors placeable after the wd_swapped fix |
| Wall art, mirrors, clocks, framed prints | every room | added 26 Sept (Met public-domain framed art, Poly Haven decor) |
| Plants in pots | every room | available (`extra:home:plant-*`) |

## Catalog data problems

| Problem | Effect | Status |
|---|---|---|
| `bed` kind includes bare support frames, bed bases, box springs | bed renders as a metal skeleton (Balcony Bedroom 1 bug) | filtered out of search in 226858c; retagging at import still open |
| `decor` kind contains sofas and armchairs at 16–23k AMD | wrong products offered as decor | missing fix |
| Size filters (`max_w/d/h`) return larger products | model must re-check every size | fixed: one horizontal bound no longer passes items turned 90°; spike search also filters client-side (server half deployed 27 Sept) |
| Contact-sheet images blank for some `extra:` products | model cannot inspect them | missing fix |
| No firmness / seat height for chairs, no open size for sofa beds | cannot design for an elderly user or verify a sofa bed | missing data |
| Search timeouts and fetch failures under parallel load | retries, slower runs | improved 26 Sept (in-memory embeddings); still seen at 8 parallel runs |

## Not catalog, but found in the same runs

- Avani's scene has no kitchen or bathroom fittings, so those rooms cannot be designed around them.
- Lamps cannot be dimmed or switched individually; sofa beds have no open state.
- Safety fittings (anti-tip anchors, socket covers, child locks) cannot be represented or priced.
- Three Komitas flats (b21 bed door, b23 entrance, b24 living-to-balcony door) have a door nobody can walk from even when empty.
