# Demo apartments

Open any `scene.furnished.json` (or the empty `scene.json`) in the editor: **File → Import project JSON**.

| Flat | Source | Size | Rooms | Furniture |
| --- | --- | --- | --- | --- |
| `sunday-b12121` | Sunday Towers, building B, floor 12, Arabkir, Yerevan (developer's vector plan and room table) | 188.6 m² | 3 bedrooms, 4 bathrooms, 3 balconies, kitchen island | 54 catalog pieces |
| `orion-t8` | Orion, type 8, top floor (developer's floor-plate PDF) | 120.6 m² | 2 bedrooms, reading room, 2 bathrooms, wedge living room, balcony | 29 catalog pieces |
| `orion-t7` | Orion, type 7, top floor (developer's floor-plate PDF) | 134.0 m² | 3 bedrooms, 3 bathrooms, long living/dining room | 30 catalog pieces |
| `m6-12-54` | Hand-built earlier (see its NOTES.md) | 76.1 m² | 2 bedrooms, 2 balconies | 37 demo pieces |

## How a flat is made

`trace.svg` is the only hand-made file: the plan traced in its own pixels with every element labelled
(walls, doors, windows, rooms with printed areas, fixtures, furniture footprints). One command builds the rest:

```sh
uv run --project harness python apartments/_svg/build.py apartments/<flat>
```

It converts the trace to metres (`harness/varpet_harness/trace.py`), tidies and checks it with the architect's checker,
picks the real catalog model closest to each drawn footprint (catalog cached in `_svg/catalog-cache.json`, models are
ABO, CC BY 4.0), exports both editor projects through the editor's own code, and draws `review/overlay.png` (trace over
the plan) and `review/top.png`.

Known small gaps: pieces face straight up, down, left or right (the plans' 45° dining sets are squared); two orion-t7
wardrobes sit 1.5 cm into a wall; a few closed service shafts are left as holes.
