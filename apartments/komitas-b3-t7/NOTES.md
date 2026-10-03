# Komitas Park · Building 3 · Type 7 (b3-t7), "As drawn"

## Current state (2026-10-03 13:45 +04; read this first, the sections below are history)
- As drawn: 30 pieces. Deviations from the plan: dining set shifted ~0.16 m east, ~0.14 m south (chairs pulled clear
  of the table); bedroom 4 wall TV and its unit left out (walk past the bed); hall L-sofa = sofa + armchair; balcony
  floor meets the bedroom-5 wall, its outer edge and railing 5 px in (railing runs to the pylon). Doors open as the
  plan draws them. Fresh re-check 13:45: CONFIRMED with caveats (walls, columns, doors, windows, fixtures match).
- Build: faults 4 ("not on a room edge", corner blocks; walls right), 30/30 picked. Audit: 7 faults, all
  plan-inherent hall routes (door swings into the 1.1 m hall; the empty shell has the same 7).
- Styled: pending (designer usage limit until 16:04).

Plan: `experimental/komitas-plans/b3-t7.png` (1190 x 1684, portrait), copied to `source.png` (git-excluded).
`trace.svg` is in the plan's own pixels; build: `uv run --project harness python apartments/_svg/build.py apartments/komitas-b3-t7`.

## Scale
56.6 px/m (median of 10 printed dimensions): 2650 (150 px), 3350 (188), 4150 (234.5), kitchen 1950 (110),
6650 (377), 6300 (358), 3250 (186), 3800 (219), 3150 (177), 2900 (164.75). The spread is 56.1 to 57.6 px/m.

## Rooms, printed and traced
| # | Room | Printed | Traced |
|---|---|---|---|
| 1 | Hall (ՆԱԽԱՍՐԱՀ) | 20.6 | 20.28 |
| 2 | Living room | 21.6 | 21.43 |
| 3 | Kitchen | 5.9 | 5.86 |
| 4 | Bedroom (north) | 17.6 | 17.44 |
| 5 | Bedroom (south) | 12.1 | 11.83 |
| 6 | Bathroom | 3.8 | 3.45 |
| 7 | Bathroom | 2.4 | 2.31 |
| 8 | Balcony | 3.6 | 3.74 |
Total printed 87.6 m2. Bathroom 6 traces 0.35 m2 under the printed area because its light-blue riser box
(0.59 x 0.49 m) and the pylon corner are cut out of the floor. The balcony is the tiled floor from the tile line (y 1316)
to the inner railing line (y 1390). It stops at the wall faces west (x 531) and east (x 704), with the pylon notch.

## Reading decisions
- **Open plan.** The living room, hall and kitchen are separate rooms, as in the plan's table. The living room and hall
  meet on an open edge at y 647, from x 519 to 592. The living room and kitchen meet on an open edge at y 647, from x 599
  to 669. The kitchen is closed to the hall by the partition at x 592-599. No wall is drawn on either open edge.
- **Structure.** Each piece of structure is its own `wall main` polygon, tight to the drawn outline:
  - 6 columns (green hatch on the red axis crosses): NW, NE, west at the hall, kitchen, bathroom 6, balcony.
  - 9 grey-hatched pieces: the pylon blocks beside the 4 columns at NW, NE, kitchen and bathroom; the 0.3 m strips
    on the west wall (2) and east wall (3); the pylon beside the balcony column.
- **Not traced.** The hatched block outside the flat (x 476-531, y 1382-1399), south-west of the balcony. It lies
  outside every room, and the shell check faults any wall that is not on a room edge.
- **Converter workarounds.**
  - The converter snaps wall ends within 8 cm together. Where a dark wall continues a thicker hatched strip on the
    same outer face, their centrelines differ by 2.5-3 px. The snap would skew the dark wall (fault "degrees off
    square"). Three dark walls therefore run 6 px into the strip they continue: `wall-west-bedroom`,
    `wall-east-living` and `wall-east-bedroom`. The overlap lies inside the strip, so the union is the drawn outline.
  - `pylon-nw` and `pylon-ne` are drawn square. 0.1 px is shaved off their height so that their centreline runs along
    the facade.
  - The east wall beside the wet rooms is split into one stretch per room, so that no stretch is centred on a shaft
    band.
- **X boxes.** Two black X boxes are traced as `wall secondary` bands. One is between the kitchen and bathroom 7. The
  other is between the bathrooms and includes their walls. The black X box in the hall's south wall is
  `shaft-hall`. The light-blue X box in bathroom 6 is the plumbing riser (`riser-bath-6`). The light-blue X box on
  the balcony is the AC unit place and is not modelled.
- **Railing.** One railing, on the south slab edge (x 531-664). It is a 3 px box just inside the balcony floor, as in
  2-5, because the band (y 1390-1401) lies outside the floor polygon and the floor keeps to the printed area. The
  west edge is closed by the corridor wall and the east edge by the pylon and column, so neither gets a railing
  (Ashot's #69).
- **Kitchen.** The counter is one L run: the east leg from the fridge to the corner, then the south leg. The shell
  check faults overlapping fixtures, so the worktop is split around the sink and hob, as in 2-5. The draining board
  is a worktop piece. `worktop-east` starts 1 px below the fridge's drawn edge (y 717.5), so the 0.60 m fridge model
  fits the drawn 0.60 m slot. The kitchen has no window: its east wall is solid on the plan.
- **TVs.** The two thin double rectangles back to back on the bedroom 4/living partition are traced as `TV unit` (the
  reader's label, graded right), each with a TV on it (`data-on`), as in 2-5. The drawing is only 0.13-0.16 m deep
  and looks like wall-mounted screens. A wall-mounted TV would stand on the floor in build.py, because it has no wall
  mount.
- **Hall corner sofa.** The L is two pieces: `hall-sofa` (`Sofa`) is the long leg on the west wall with the curved
  corner seat (1.91 x 0.75 m), and `hall-sofa-end` (`Armchair`) is the short leg, facing north (0.65 x 0.77 m). No L
  sectional fits the drawn 1.92 x 1.40 m. The L's bounding box would also swallow the small table drawn in its
  notch.
- **Hall table.** The small rectangle in the L's notch is traced as `Coffee table`.
- **Desk chair.** The chair drawn at the desk in bedroom 4 has arms (0.58 m wide). It is a `Desk chair`, pinned to
  a mid-century open-back swivel desk chair.

## Pins
- From 2-5's set:
  - desk `extra:bpy-office:desk-walnut-mcm-tapered`;
  - bed 4 `extra:bpy-beds-dressed:mcm-walnut-cane-bed-160-terracotta`;
  - dining chairs `extra:bpy-dining:mcm-walnut-dining-chair-cognac-leather`;
  - armchairs `extra:bpy-living2:mcm-swivel-tub-armchair-cognac-leather`;
  - TV units `abo:B07ML7P93X`;
  - TVs `extra:electronics:tv-50-feet-black`;
  - fridge `extra:bpy-appliances:fridge-combi-stainless-60`.
- New:
  - desk chair `abo:B075Z8M22B` (Rivet mid-century swivel desk chair);
  - living sofa `abo:B07P5LM5D3` (Leila tufted leather, saddle);
  - coffee table `abo:B07BVHL3SZ` (Rivet Bowlyn, walnut);
  - wardrobe 4 `extra:bpy-bedroom:reeded-oak-3-door-wardrobe-150`: no 1.44 m model is closer;
  - hall wardrobe `extra:bpy-bedroom:mcm-walnut-wardrobe-drawers-110`;
  - bed 5 `abo:B07HSF3Y12` (Rylee acacia, 1.76 m);
  - bedroom 5 bedside tables `abo:B072ZK885L` (0.38 m walnut).
- Why bedroom 5 is not 2-5's set:
  - The plan stacks wardrobe (0.60 m), bedside table (0.46 m) and bed (1.81 m) against the north wall with no slack.
  - With the 1.89 m cane bed and 0.46 m bedside tables, the 0.63 m wardrobe cannot fit.
  - The narrower bed and bedside tables are the only models that keep every piece where the plan draws it.
- Automatic picks: dining table (Rivet walnut hairpin 1.79 m), hall sofa and the armchair at its end, hall table,
  wardrobe 5 (Kolva 1.78 m), bedroom 4 bedside tables (Rivet walnut).

## Audit
Plan-inherent (8 faults, 4 chairs):
- **Dining chairs n1, n2, n3 and w.** The plan tucks all 8 chairs under the table. There is 0.43 m between the table
  and the north wall and 0.41 m between the table and the bedroom partition. No dining chair in the catalog is that
  shallow; the shallowest is 0.49 m. build.py pulls chairs out from under the table, which pushes these 4 into the
  wall (containment and collision).

Checker limitation (1 fault):
- **`hall-sofa-end` faces 48° away from `hall-sofa`.** The armchair role faces "coffee table|sofa", and the audit
  takes only the nearest match, which is the sofa beside it. The armchair's front ray does hit the hall table. The
  proposed audit diff below (any matching target counts) clears it and leaves 2-5 at 0 faults.

## Build faults (4): exterior-corner blocks
`column-nw`, `column-ne`, `column-balcony` and `pylon-balcony` sit at the flat's outer corners and touch a room only at
one corner. The check measures a wall's centreline against room edges, which cannot pass for such a block. The
proposed shell.py diff measures the body instead, for blocks no longer than twice their thickness, and gives 0 faults
on this flat.

## Walls in 3D
The editor's own `wallFootprint` (apps/editor/src/render/wall-geometry.ts), drawn over the plan, matches every wall,
column and opening.

`review/top.png` does not show this. It draws every wall with square caps (half a thickness longer at both ends), so
columns and pylons look about 0.3 m longer. A later wall then covers the ends of openings: the living window looks
0.32 m short there, but is full width in scene.json and in the editor.

timing: START=1791017319 END=1791018846

## Changes by the coordinating session (2026-10-03 13:15-13:45 +04)
- Dining set shifted 9 px east and 8 px south (~0.16 m, ~0.14 m) so real chairs pulled clear of the table fit.
- Every door has its plan swing (data-hinge / data-opens, read from the plan's arcs; build.py writes the editor's
  hinge/swing/mechanism metadata).
- Bedroom 4's wall TV is left out: a unit under it left 0.22 m past the bed's foot (plan 0.57 m) and the editor
  cannot wall-mount a TV. Living TV keeps its unit.
- Balcony floor now meets the bedroom-5 wall (a 0.09 m strip had no floor at the balcony door); its outer edge and
  the south railing moved 5 px in so the area stays 3.79 m2 (printed 3.6, tiles only).
- audit.ts: armchairs may face any matching piece (hall-sofa-end faces the hall table).
- Audit: 7 faults, all plan-inherent: hall routes 0.25-0.47 m because the plan's bathroom and bedroom doors swing
  into the 1.1 m hall (the designer reserves every door's full sweep); the empty shell has the same 7.
- Build: 4 "not on a room edge" faults (corner blocks touching rooms only at a corner): checker limit, walls right.
