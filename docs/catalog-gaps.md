# Catalog gaps: models the designer needed and could not find

Living list. Source: the spike designer's own `missing.md` logs from whole-flat runs on 26–27 Sept 2026
(briefs: family of three on Komitas b24-t22, three generations on b23-t64, couple expecting a baby on b21-t13,
remote engineer on Avani) plus render review. Add a row when a run logs a new `[catalog]` gap; mark it done
with the commit that fills it.

## Missing products

| Product | Needed for | Status |
|---|---|---|
| Mattress + bedding (single 90x200, double 140x200, queen 160x200, king 180x200) | every bed; all four flats render beds as bare slats | in progress (spike/beds agent) |
| Crib / cot | baby brief | missing |
| Changing table | baby brief | missing |
| Pet bed | baby brief (small dog) | missing |
| Curtains, blackout blinds, roller blinds | bedrooms (privacy, a light sleeper) | missing; also needs a window-mounted placement in the editor |
| Kitchen furnishing beyond carts (bar stools, kitchen storage, small dining sets for kitchens) | every kitchen | missing |
| Bathroom furnishing (wet-room cabinets, towel storage, bath mats) | every bathroom; searches return farmhouse and filing cabinets | missing |
| Small outdoor furniture (bistro set, balcony chairs, weather-proof side tables) | balconies in b24, b23 | missing: only indoor or oversized pieces |
| Desktop PCs / towers | teen study rooms (b23) | missing: search returns stands and bookends |
| Narrow wall mirrors (< 0.6 m wide) | small halls (b21) | missing |
| Wall art, mirrors, clocks, framed prints | every room | added 26 Sept (Met public-domain framed art, Poly Haven decor) |
| Plants in pots | every room | available (`extra:home:plant-*`) |

## Catalog data problems

| Problem | Effect | Status |
|---|---|---|
| `bed` kind includes bare support frames, bed bases, box springs | bed renders as a metal skeleton (Balcony Bedroom 1 bug) | in progress (shared filter) |
| `decor` kind contains sofas and armchairs at 16–23k AMD | wrong products offered as decor | missing fix |
| Size filters (`max_w/d/h`) return larger products | model must re-check every size | in progress (spike/beds agent) |
| Contact-sheet images blank for some `extra:` products | model cannot inspect them | missing fix |
| No firmness / seat height for chairs, no open size for sofa beds | cannot design for an elderly user or verify a sofa bed | missing data |
| Search timeouts and fetch failures under parallel load | retries, slower runs | improved 26 Sept (in-memory embeddings); still seen at 8 parallel runs |

## Not catalog, but found in the same runs

- Avani's scene has no kitchen or bathroom fittings, so those rooms cannot be designed around them.
- Lamps cannot be dimmed or switched individually; sofa beds have no open state.
- Safety fittings (anti-tip anchors, socket covers, child locks) cannot be represented or priced.
- Three Komitas flats (b21 bed door, b23 entrance, b24 living-to-balcony door) have a door nobody can walk from even when empty.
