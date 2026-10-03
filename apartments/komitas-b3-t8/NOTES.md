# Komitas Park, building 3, type 8 (b3-t8)

## Current state (2026-10-03 13:45 +04; read this first, the sections below are history)
- As drawn: 23 pieces. Deviations from the plan: dining set shifted ~0.27 m east, ~0.18 m north and 7 of the 8 drawn
  chairs (the south-east one stood in the balcony door's swing); living wall TV stands on a TV unit; bedroom wall TV
  left out (a unit leaves 0.32 m past the bed's foot, the only way to the desk; the editor cannot wall-mount a TV);
  bedroom bed is the 2.03 m teak bed. Doors open as the plan draws them.
- Build: faults 0, 23/23. Audit: 2 faults, plan-inherent (hall routes past the door swings; same on the empty shell).
- Open: the arc at the hall wardrobe's end (758-792 x 421-444) may be a rounded end shelf, not modelled.
- Styled: pending (designer usage limit until 16:04).
- Walls after Ashot's wall review (2026-10-03 14:47 +04, `experimental/wall-review/marks/b3-t8.json`): the balcony's
  south-west wall end is drawn thinner east of the west wall, so it is traced 577-598 x 1010.5-1017.5 (0.12 m) and the
  west wall runs down to 1017.5 (mark 2); the balcony floor reaches its face (577-598 x 1005-1010.5). Build faults 0,
  23/23; audit 2 (unchanged). The shell now takes walls up to the editor's 1 m, so the 0.6 m workarounds below
  (shaft-kitchen from y 303.1, hall column and pylon 33.8 px) are no longer needed; they are within 1 px and stay.
- Outside the flat, deliberately not modelled (Ashot: "not wrong, as long as it is not going to trip you"): the wall
  piece west of the balcony's west wall (551-565 x 1005-1017, mark 1).

The plan is labelled "Bn. 2": 60.9 m2, 2 rooms. It is `experimental/komitas-plans/b3-t8.png` (1684 x 1190), copied here as `source.png`, which git excludes. The label file `labels/b3-t8.json` is an ungraded held-out reading. I used it only as a starting point and checked every box against the image.

## Scale
56.6 px/m. trace.py takes this from 10 dimension lines, each laid between the wall faces it measures:

| Dimension | Pixels | Ratio |
|---|---|---|
| 1700 | 96 px | 56.5 |
| 2000 | 113 px | 56.5 |
| 2250 | 128 px | 56.9 |
| 7550 | 427 px | 56.6 |
| 3450 | 195 px | 56.5 |
| 2700 | 153 px | 56.7 |
| 2500 | 141.5 px | 56.6 |
| 1250 | 71 px | 56.8 |
| 3630 | 205.5 px | 56.6 |
| 1600 | 92 px | 57.5 |

This is a little under the legend's "about 57".

## Areas (traced vs printed table)
| Room | Traced | Printed |
|---|---|---|
| 1 Hall | 9.91 | 10.0 |
| 2 Living room | 23.61 | 23.8 |
| 3 Kitchen | 3.83 | 3.8 |
| 4 Bedroom | 14.54 | 14.6 |
| 5 Bathroom | 3.13 | 3.2 |
| 6 Balcony | 5.87 | 5.5 |

The traced rooms sum to 60.9; the printed total is 60.9.
- **Balcony +0.37 m2 (6.7%).** The polygon reaches the facade wall (y 909) and the balcony's west wall (x 577), so nothing floats. The printed 5.5 matches the tiled area inside the magenta line (x 582, y 913), which would come to 5.4.
- **Bathroom** includes the plumbing riser box in its polygon. The plan's 2500 x 1250 dimensions, and so its 3.2, count the box. Leaving it out would give 2.86, which fails the checker's 10% area test. The box is still a solid `wall secondary` inside the room, so it is not usable floor.

## Reading decisions
- **Kitchen (3).** It is its own room, as the table numbers it. It is open to the living room along y 465 with no wall.
- **Hall (1).** It meets the living room along an L with no wall: x 679 from y 465 to 506, then y 506 to the hall pylon at x 724. That edge runs from the end of the kitchen partition to the pylon.
- **North of the kitchen and north of the bathroom.**
  - The outer wall, the closed shaft (dark X box) and the partition round it are one solid block each: `shaft-kitchen` (302-337) and `shaft-bath` (411-433).
  - Traced as single blocks, their ends reach the corners. Traced as separate thin walls, the checker reported the outer walls "not on a room edge", because no room touches them.
  - `shaft-kitchen` starts at y 303.1, not 302, so it stays within the checker's 0.6 m wall limit.
- **Columns and pylons.**
  - Each green-hatched column and each grey-hatched structural wall is its own `wall main` polygon.
  - Hall: pylon west, column, and pylon south (761-778 x 541-614).
  - Facade: pylon north (761-778 x 800-875), pylon west, column, pylon east, and the hatched stub on the facade west of the living window.
  - The hall column and pylon are traced 33.8 px across, against 34-35 px drawn, so they stay within the 0.6 m wall limit.
- **The hall's north-east outer corner.** The two walls meet on their centrelines at (798,308), so the editor mitres the corner.
- **The hall stub (792-798).** It is traced from y 411, the top of the band, not from 421. From 421, tidy() first closes its top onto the north wall's line at (795,416), then snaps it 3 px across to the corner (798,416). That leaned the stub 6° and narrowed the cupboard niche.
- **TVs.**
  - The plan draws two flat TVs on wall brackets, one on each side of the living/bedroom partition, and no TV unit.
  - Both are traced as `TV` and pinned to `extra:electronics:tv-55-wall-black`: 1.23 x 0.12 m, against 1.24 x 0.12-0.14 m drawn.
  - build.py has no elevation for furniture, so they stand on the floor. See "Proposed shared-script changes".
- **Hall wardrobes.**
  - The tall one is one block with two doors. The arc at its south end is the swing of its lower door.
  - The tall one is pinned to Kolva 1.78 with `data-fit="width"` at 1.87 m. It is traced 0.5 px inside each end so that it does not touch the walls.
  - The shallow cupboard sits in a 1.007 m niche. No closed wardrobe in the catalog is narrower than 1.0 m, so the AmazonBasics Sideboard (a 2-door wardrobe on legs, 1.006 m) is fitted down to 0.989 m.
  - The cupboard therefore uses `data-fit` to shrink by 1.7%, not to stretch.
- **Kitchen run.**
  - One L-shaped run, stopping at the fridge, tiled without overlaps:
    - worktop corner, draining board, sink and worktop down the west leg;
    - worktop, hob and worktop along the north leg.
  - Fronts are set: the west leg faces right and the north leg faces down.
- **Bathroom shower.** The walk-in shower is the tiled zone behind the glass line: x 894-931, y 529-574, 0.65 x 0.8 m.
- **Railings.** There are three, on the open slab edges: east, diagonal and south.
  - There is none on the west, which a wall closes, or under the SW wall end (565-598).
  - The plan's railing band lies just outside the tiled floor. Fixtures must stay inside their room, so the rails are 3 px strips along the floor's edge, as in 2-5.
- **Not modelled.** The light-blue X box on the balcony is the AC unit place.
- **Pins.**
  - From 2-5's set: armchairs (MCM swivel tub), dining chairs (MCM walnut), the bed (MCM walnut cane 160, which is 1.89 m overall), the fridge and the desk.
  - Bedside tables: Rivet Stark walnut, `abo:B075YZ16V4`.
  - Dining table: Rivet hairpin walnut, `abo:B075YPTG8S`, 1.79 x 0.88. 2-5's 1.61 m table is outside the width tolerance for the 1.71 m traced here.
  - Desk chair: Rivet Swope curved-arm, `abo:B075Z8769G`. The plan draws a 0.58 m armchair-like chair, and 2-5's 0.46 m chair is outside the tolerance.
  - The sofa (Rivet Edgewest), coffee table (Ravenna Anne Marie) and bedroom wardrobe (Movian Indre 1.29) are automatic picks.

## Audit: plan-inherent faults (11, all listed)
- **dining-chair-s1, s2, s3 and dining-chair-w** are outside the living room and in a wall, 9 faults.
  - The plan tucks the 8 chairs half under the table: the set is 1.38 m deep, and the west chair is 0.3 m from the wall.
  - build.py's settle() backs every chair fully clear of the table. Then the south row (0.35 m left to the facade) and the west chair (0.30 m to the west wall) no longer fit, and they stay in the wall.
  - No dining chair is 0.35 m deep.
- **cupboard-hall** is outside the hall and 0.073 m into wall-north-hall, 2 faults.
  - The model is 0.57 m deep against a 0.42 m drawn depth, so it must step 0.08 m out from the wall.
  - settle() measures fitted pieces at their unscaled width, 1.006 m, and finds no room in the 1.007 m niche.
  - Checked by monkeypatching settle() to use the scaled width, without editing build.py: the cupboard then settles 0.080 m into the hall and both faults go.

Notes only: walkways from the balcony door through the dining set, bed sides 0.01 m (the plan's 1.8 m bed fills the 2.7 m room with bedside tables), and chair pull-outs.

## design.json
It owns 19 of the 24 pieces. The five settle() could not place inside a room (4 dining chairs and the cupboard) have no room for the designer bridge and are left out.

## Walls in 3D
- I drew the editor's own footprints over the plan, using `wallFootprint` from apps/editor/src/render/wall-geometry.ts on scene.json. Every column, pylon, shaft block and corner matches the drawn band.
- `review/top.png` does not match, because build.py's top() buffers each wall with `cap_style="square"`. Every free end is drawn half a thickness too long, so thick pieces look 0.15-0.3 m too long:
  - the hall pylon and column;
  - the facade column row;
  - `shaft-kitchen`, which pokes 0.3 m out west;
  - `shaft-bath`, which pokes out east;
  - the riser box, which looks tall;
  - the pylon strips.
- This is in the picture only, not in the scene.

## Proposed shared-script changes (not made)
1. build.py `footprint()`: measure a fitted piece at its scaled width (validated on this flat, see above).
   ```diff
   -    w, _, d = a["dimensions"]
   +    w, _, d = a["dimensions"]
   +    w *= (o.get("scale") or [1])[0]  # data-fit stretches the placement, not the catalog record
   ```
2. build.py `settle()`: when a piece cannot be placed (`stuck`), put it back at its traced position, so a plan's tucked chair stays under the table instead of in a wall.
3. build.py `top()`: draw walls with `cap_style="flat"`, or with the editor's wallFootprint, so that top.png shows walls the way the editor builds them.
4. build.py `furniture()`: honour a `data-elevation` (metres) on a piece, so the plan's wall-mounted TVs hang at about 1.0 m:
   `"position": [round(x, 4), float(a.get("data-elevation") or 0), round(z, 4)]`.

timing: START=1791017323 END=1791018665

## Changes by the coordinating session (2026-10-03 13:15 +04)
- Dining set (table + 8 chairs) shifted 15 px east and 11 px north (~0.27 m, ~0.19 m) of where it is drawn: the plan
  tucks the chairs half under the table, and real chairs pulled clear did not fit against the facade and west wall.
- The two wall-mounted TVs stand on TV units (abo:B07ML7P93X, as 2-5): the editor cannot wall-mount a TV. The only
  pieces As drawn adds to the plan.
- build.py footprint() now measures a data-fit piece at its scaled width, so the hall cupboard settles in its niche.
- After these: build faults 0, 26/26 picked; audit 0 faults.
- 13:25 after the fresh plan check: the bedroom TV unit (with the 2.17 m walnut bed) left 0.16 m to pass the bed's
  foot (plan 0.45 m). The bed is now the 2.03 m teak bed abo:B085W6V8CN (as long as drawn) and the bedroom wall TV is
  left out: the editor cannot wall-mount a TV and a unit there blocks the only way past the bed. Living TV keeps its
  unit. Build faults 0, 24/24; audit 0.
- 13:40: doors carry the plan's swings. dining-chair-s3 (south row, east) is left out: it stood in the balcony
  door's swing; moving the set north instead put the north chairs into the south armchair. Audit: 2 faults, both
  plan-inherent (entrance/bathroom to bedroom 0.30 m: door sweeps in the hall; same on the empty shell).
