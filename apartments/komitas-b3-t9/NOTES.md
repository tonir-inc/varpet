# Komitas Park · Building 3 · Type 9 (b3-t9)

## Current state (2026-10-03 13:45 +04; read this first, the sections below are history)
- As drawn: 37 pieces. Deviations from the plan: the three wall TVs stand on TV units (bedroom 5's unit 8 px west,
  bedroom 4's 7 px south, clear of their doors' swings: the editor cannot wall-mount a TV), hall corner seat left
  out, the dining table's two end chairs left out (see the trace comment); hall sofa is a settee. Doors open as the
  plan draws them. Fresh re-check 13:44: walls, columns, doors, windows, fixtures match.
- Build: faults 0, 37/37. Audit: 0 faults.
- Styled: pending (designer usage limit until 16:04).

Plan `experimental/komitas-plans/b3-t9.png` (1684 x 1190), printed 95.8 m2, 3 rooms. Main trace = the plan's
furniture as drawn (`data-option-name="As drawn"`).

## Scale
56.7 px/m: median of 16 printed dimension lines laid tick to tick on the wall faces (5600 x2, 5800 x2, 2050, 1200,
1850, 2000, 2350, 3150, 1900, 3100, 5300, 3700, 4900, 7200). They agree within 56.5-57.1 px/m.

## Rooms: traced vs printed
| Room | Traced m2 | Printed m2 |
|---|---|---|
| 1 Hall | 20.69 | 21.0 |
| 2 Living room | 24.71 | 24.8 |
| 3 Kitchen | 8.17 | 8.3 |
| 4 Bedroom | 15.35 | 15.4 |
| 5 Bedroom | 17.25 | 17.2 |
| 6 Bathroom | 3.63 | 3.9 |
| 7 Bathroom | 1.93 | 2.0 |
| 8 Balcony | 3.37 | 3.2 |

- Bathroom 6 is 7% under: its printed 2050 x 1900 (3.9) includes the light-blue riser box (0.5 x 0.65 m), which is
  solid here. With it the room would be 3.93.
- Balcony is 5% over: the floor runs from the wall faces to the tile edge (x 388-501, y 838-934 px). The printed
  1900 x 1600 dimensions give 3.04; the table says 3.2.

## Reading decisions
- Living room and kitchen are two rooms. The kitchen's west wall stops at y 866 px, and from there to the south wall
  (y 866-934 px, 1.2 m) the two rooms share an open edge at x 712. Hall and living room share an open edge at x 705,
  y 640-718 (no wall drawn).
- Structure: columns at (501-536, 435-469), (841-875, 435-469), (501-536, 804-838), (841-875, 804-838). Each grey-hatched
  piece is its own `wall main`. The L of hatch round the living-room column is two pieces plus the column, as Ashot
  graded #53: top (501-536 x 781-804) and east (536-553 x 804-838). The empty corner at 536-553 x 781-804 is floor.
- Shafts: the black X box in the hall niche and the black X box by the kitchen are solid `wall secondary`. The white
  X box inside the bedroom 5 / bathroom 6 wall is part of that 0.4 m wall. The light-blue X box in bathroom 6 is the
  plumbing riser (815-845 x 523-560). The light-blue X box on the balcony is the AC unit place and is not modelled.
- Kitchen: the column and its hatch split the counter into two runs (Ashot, #55). North run: worktop, hob, worktop.
  South run: sink, draining board, fridge (the blue box, as furniture). Fixtures may not overlap in the shell (fault
  "footprints overlap"), so the pieces tile each run, as in 2-5.
- Railings: west and south slab edges of the balcony. They are thin boxes inside the balcony polygon along the band,
  as in 2-5. There is none on the north (wall) or east (wall) edge, and none along x 484-501, where a wall piece closes
  the south edge.
- The TV units are drawn as thin wall TVs on a bracket (7 px deep). They are traced 12 px from the wall face, as 2-5
  traces the same symbol, with a TV standing on each (`data-on`). There are three: bedroom 5, living room, bedroom 4.
- Hall corner sofa: the plan draws one curved L sofa (960-1039 x 571-650). A rectangle can't hold an L, so it is two
  pieces: "Sofa" (south seat plus the curved corner, facing up) and "Armchair" (east seat, facing left). The armchair
  box is 3 px north of the drawn seat (568-604) so the two models don't overlap.
- The dining set has 8 chairs (circles), all traced. The kitchen table has 3 chairs, all traced.

## Wall trace vs the converter
- Square columns are traced 0.5 px wider than tall, so their centreline runs along the band. Otherwise `tidy()`
  turned one diagonal (column-kitchen) and left two ends off a room edge.
- Outer L corners: the east wall ends on the south wall's centreline (y 940) and the bathroom-7 east wall ends on
  the bathroom-south centreline (y 563). Otherwise `tidy()` snapped one end and skewed the other wall by 2.2°. The
  editor mitres these corners, so the drawn corner is filled.
- struct-bed5-ne is traced 536-553 x 442.5-469 (drawn from y 435). Its top 7.5 px is covered by the column and
  struct-north, which `tidy()` joins on its centreline. Traced from 435, its free end failed "not on a room edge".
- The shell caps walls at 0.6 m. The hall shaft (drawn 887-927, 0.71 m) is traced 893-927, leaving off its 6 px outer
  skin. The kitchen shaft (drawn 807-845, 0.67 m) is traced 811-845, and the hall face sits 4 px into it.
- Converter issue, not the trace: `_close_gaps` treats the living-room hatch top and hatch east (which touch only at
  the corner 536,804) as an L. It extends both to their centreline crossing (544.5, 792.5), which adds about
  0.3 x 0.4 m of wall in the living-room floor corner. Proposed fix in the session report; tested on a scratch copy:
  faults stay 0 and the pieces keep their drawn extent.
- Converter issue: wall-bed5-door is cut at the partition centreline (y 631). This drops the drawn 0.16 m jamb that
  sticks out below the partition into the hall (y 634-640).
- review/top.png draws walls with square caps, so each wall is one thickness longer than the editor draws it, and
  columns look oversized. It also ignores `data-fit` stretch, so the fitted wardrobes show at model width.

## Pins
mcm walnut set as 2-5 where sizes allow: dining chairs (all 11), dining table B075YMXWZC, tub armchair, coffee table
B07DBDMN5F, sofa B07B4G5QD4, desk-walnut-mcm-tapered (both desks), TV unit B07ML7P93X + tv-50 (x3), fridge-combi-60.
Others:
- Beds: Rylee acacia queen B07HSF3Y12 (1.76 m). The walnut 160 bed (1.89 m) leaves no room for the drawn bedside
  tables, and the walnut 140 is 0.12 m too narrow.
- Bedside tables: Movian Havel B07GFRKNNH (x4). The automatic pick was a rolling file cabinet.
- Wardrobes:
  - Kolva B07GFSJ69T, fit to 1.94 m: bedroom 5 north.
  - Arga B07QZ77FGN (1.6 x 0.5 m, the shallowest closed wardrobe in the catalog):
    - bedroom 4, no fit;
    - bedroom 5 south and living room, back to back on a 0.46 m drawn depth, fit to 2.0 m;
    - hall niche, fit to 1.535 m. The niche is 1.587 m and no model fits it (deviation from "fit only when wider
      than any model").
- Kitchen table: japandi oak 110 (the automatic pick was a console table).
- Hall sofa: Sweeping Arm Settee B073G965TS (1.30 x 0.78 m), so it doesn't push the armchair through the wall.
- Desk chairs: automatic pick (AmazonBasics guest chair, 0.56 m). The plan draws armchairs at the desks, and the
  walnut desk chair (0.46 m) is outside the width tolerance.

## Audit: 3 faults, plan-inherent
- `wardrobe-living overlaps dining-chair-n`: the plan draws the north dining chair tucked half under the table, its
  back 0.25 m from the 0.46 m living wardrobe. build.py pulls every chair clear of the table (0.49 m model). The
  pulled-out chair needs the floor the wardrobe stands on, even with the shallowest closed wardrobe (0.5 m).
- `sofa-hall: nothing to face (coffee table)`: the plan draws no coffee table in the hall.
- `armchair-hall faces 66° away from sofa-hall`: an artefact of splitting the plan's L sofa into two pieces.

timing: START=1791017325 END=1791018911

## Changes by the coordinating session (2026-10-03 13:15-13:45 +04)
- Hall L-sofa: "Hall sofa" + "Hall corner seat" with a roles.json role that checks type and height, not facing.
- shell.py no longer closes an "L" between the two living-column blocks that touch only at a corner (the extra
  0.3 x 0.4 m wall on the living floor is gone).
- Doors carry the plan's swings. With them, left out of As drawn: both bedroom wall TVs and their units (each unit
  blocked its bedroom door), the hall corner seat (with the bathroom-7 door swing it left a 0.25 m hall), and the
  dining table's two end chairs (with chairs pulled clear the plan's table does not fit between the living wardrobe
  and the balcony door's swing). Dining set back at its drawn position.
- Build faults 0, 33/33; audit 0 faults.
