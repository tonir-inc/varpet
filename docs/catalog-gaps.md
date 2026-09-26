# Catalog gaps: models the designer needed and could not find

Living list. Source: the spike designer's own `missing.md` logs from whole-flat runs on 26–27 Sept 2026
(briefs: family of three on Komitas b24-t22, three generations on b23-t64, couple expecting a baby on b21-t13,
remote engineer on Avani) plus render review. Add a row when a run logs a new `[catalog]` gap; mark it done
with the commit that fills it.

## Missing products

| Product | Needed for | Status |
|---|---|---|
| Mattress + bedding (single 90x200, double 140x200, queen 160x200, king 180x200) | every bed; all four flats render beds as bare slats | live 27 Sept: 12 SKUs (kind `mattress`, 118–250k AMD) imported and embedded on mc-server |
| Crib / cot | baby brief | live 27 Sept: 6 cribs (kind crib) |
| Changing table | baby brief | live 27 Sept: 3 (kind changing_table) |
| Pet bed | baby brief (small dog) | live 27 Sept: 8 (kind pet_bed) |
| Curtains, blackout blinds, roller blinds | bedrooms (privacy, a light sleeper) | live 27 Sept: 33 curtains, 6 blinds, wall placement; editor hangs blinds like curtains (5412dfb) |
| Kitchen furnishing beyond carts (bar stools, kitchen storage, small dining sets for kitchens) | every kitchen | live 27 Sept: 42 kitchen_cabinet (fitted modules, islands), bar/counter stools as kind `stool` |
| Bathroom furnishing (wet-room cabinets, towel storage, bath mats) | every bathroom; searches return farmhouse and filing cabinets | live 27 Sept: sinks 14, toilets 8, bath/shower fixtures, floor cabinets/étagère, towel stacks (decor), towel_rack, bath mats (rug) |
| Small outdoor furniture (bistro set, balcony chairs, weather-proof side tables) | balconies in b24, b23 | live 27 Sept: 60 cm balcony bistro sets (tag balcony) |
| Desktop PCs / towers | teen study rooms (b23) | live 27 Sept: 7 PCs + 2 monitors (`bpy-techmirror`) |
| Narrow wall mirrors (< 0.6 m wide) | small halls (b21) | live 27 Sept: 6 (`bpy-techmirror`), plus 97 ABO mirrors placeable after the wd_swapped fix |
| Wall art, mirrors, clocks, framed prints | every room | added 26 Sept (Met public-domain framed art, Poly Haven decor) |
| Plants in pots | every room | available (`extra:home:plant-*`) |

## Catalog data problems

| Problem | Effect | Status |
|---|---|---|
| `bed` kind includes bare support frames, bed bases, box springs | bed renders as a metal skeleton (Balcony Bedroom 1 bug) | filtered out of search in 226858c; retagging at import still open |
| `decor` kind contains sofas and armchairs at 16–23k AMD | wrong products offered as decor | fixed 27 Sept: 33 rows re-kinded |
| Size filters (`max_w/d/h`) return larger products | model must re-check every size | fixed: one horizontal bound no longer passes items turned 90°; spike search also filters client-side (server half deployed 27 Sept) |
| Contact-sheet images blank for some `extra:` products | model cannot inspect them | fixed 27 Sept: every extra model has a studio preview |
| No firmness / seat height for chairs, no open size for sofa beds | cannot design for an elderly user or verify a sofa bed | missing data |
| Search timeouts and fetch failures under parallel load | retries, slower runs | improved 26 Sept (in-memory embeddings); still seen at 8 parallel runs |

## Not catalog, but found in the same runs

- Avani's scene has no kitchen or bathroom fittings, so those rooms cannot be designed around them.
- Lamps cannot be dimmed or switched individually; sofa beds have no open state.
- Safety fittings (anti-tip anchors, socket covers, child locks) cannot be represented or priced.
- Three Komitas flats (b21 bed door, b23 entrance, b24 living-to-balcony door) have a door nobody can walk from even when empty.

## Added 27 Sept

- 15 fully dressed beds (frame, mattress, duvet, pillows) as kind `bed`; prefer them over frame + mattress.
- Sofa beds with an open state (pairs: closed `sofa` + open `bed`, tag `pair:<slug>`): landing.
- Warm Scandinavian / Japandi / mid-century lanes (~130 pieces), cushions and throws, 13 large plants, 16 table/bedside lamps, floor mirrors, shoe and coat racks.
