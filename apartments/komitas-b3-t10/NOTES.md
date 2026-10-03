# Komitas Park · Building 3 · Type 10 (b3-t10)

## Current state (2026-10-03 13:45 +04; read this first, the sections below are history)
- As drawn: 19 pieces. Deviations: dining set shifted ~0.17 m east (sofa pushed 0.19 m east with it); the TV stands
  on a TV unit. Doors open as the plan draws them.
- Build: faults 2 (facade pylons "not on a room edge"; walls right), 19/19. Audit: 1 fault, plan-inherent (balcony
  door to bedroom door route at the drawn bed's foot). Styled: option.styled.json (made 13:14 before the door
  swings; same 1 fault).

Plan: `experimental/komitas-plans/b3-t10.png` (1684 x 1190), printed total 47.6 m2, 2 rooms (flat No. 4 on the plan).
`trace.svg` is the "As drawn" option: walls, rooms, openings, fixtures and the plan's own furniture, every drawn piece.

## Scale
57.1 px/m from 6 printed dimension lines, measured wall face to wall face:
6050 (486→830 px, y 548), 7500 (559→986, y 697), 2700 (410→565, x 670), 3200 (569→752, x 670), 1400 (835→915, y 548),
1700 (654→751, x 842). They agree within 0.5 px/m. Not used: the bathroom's 2300 (it spans 126 px = 2.2 m, a plan
error or a line to the far face) and the balcony's 1000 / 2900 (the balcony lines stop short of the walls).

## Areas (traced after the build's tidy vs printed)
| Room | Traced | Printed |
|---|---|---|
| 1 Hall | 3.60 | 3.9 |
| 2 Living room | 15.39 | 15.3 |
| 3 Kitchen | 4.67 | 4.7 |
| 4 Bedroom | 15.99 | 16.1 |
| 5 Bathroom | 4.43 | 4.4 |
| 6 Balcony | 3.42 | 3.2 |
Hall: 0.3 m2 short. It is traced to the wall faces, including the wardrobe niche (915-949 x 524-573); the printed area
probably also counts the entrance-door recess. Balcony: 0.2 m2 over. It runs from the railing band's inner line to
the wall faces (486-549 x 575-752); the plan's own 1000 x 2900 lines give 2.9 m2. Both are within 1 m2.

## Reading decisions
- Living room and kitchen have no wall between them, but the table prints them as separate rooms. So they are two
  polygons sharing an open edge at x = 829 (the fridge's west edge and the end of the kitchen's north wall), as are
  the hall and living room at x = 835. The checker treats both edges as passages.
- The kitchen's north line (y 650-654, x 829-1048) is a drawn dark-grey partition, so the kitchen is closed to the hall.
- Structure: 2 + 2 green-hatched columns on axis crosses (north 599-633, south-west 599-633, south-east 939-973) and
  grey-hatched pieces (pylon north 633-651, pylon south-west 633-650, south facade strip 650-939, pylon south-east
  973-1008). Each is its own `wall main` polygon, tight to the drawing. Columns are traced 34 x 33 px so their axis is
  horizontal: a 34 x 34 square reads as a vertical wall and fails the room-edge check.
- Walls are written from their centrelines: at an L both centrelines end on the corner point, and at a T the stem ends on
  the other wall's centreline. The shell's tidy merges any two wall ends within 8 cm, so offset butt joints came out
  skewed. Consequences, each 2-5 px (3-9 cm):
  - The bedroom/living partition is traced at y 563-567; the plan draws it at 565-569. Its end meets the balcony wall's
    end exactly.
  - The bedroom/hall partition is collinear with the thick bedroom east wall (x 835); the plan has its bedroom face
    flush at 830.
  - The facade walls' outer corner stubs (west wall above y 405, south-west wall west of x 481, north-east wall east
    of 840) are not traced.
- Dropped: the small grey-hatched piece under the shaft (1008-1025 x 751-762). The shell's gap closing joined it to the
  shaft, and the editor's mitre then stretched it down to y 785 (empty plan). It is outside every room.
- Black X box by the kitchen: a closed shaft (`wall secondary`, 990-1024 x 652-751, including its exterior skin), with
  its kitchen-side wall separate (986-990). As one piece it would be 0.665 m thick, over the 0.6 m limit.
- Light-blue X box in the bathroom (1019-1048 x 524-558): a plumbing riser box, `wall secondary`. The bathroom polygon
  includes it, as the printed 4.4 m2 does (4.43 traced). Cutting it out leaves the bathroom's north and east walls off
  a room edge.
- Light-blue X box on the balcony (491-540 x 720-747): the AC unit place, not modelled.
- Railing: one, on the balcony's open west edge. As in 2-5, it is a thin strip just inside the balcony polygon (486-489),
  because a fixture must lie inside a room. The drawn band is 474-486.
- Walk-in shower: the tiled zone behind the glass line at x 1000, 1001-1048 x 561-650. A light-blue bar under the riser
  box (999-1046 x 558-561) is taken as the screen's top or a ledge.
- Kitchen: one L run (east leg 950-986 under the hob, south leg 864-986 from the fridge). It is cut into worktop pieces
  where the hob, sink and draining board sit, as in 2-5, because overlapping fixtures are a shell fault.
- Dining: the table runs north-south by the balcony window, with six round chairs (0.4 m) drawn half under it.

## Picks and pins
Pinned from 2-5's walnut set: the bedroom wardrobe (abo:B07GFSJ69T, data-fit width; no catalog wardrobe is 2.0 m), the
desk and desk chair, TV unit and TV, coffee table, dining chairs, and fridge. New pins:
- Bed: abo:B085W6V8CN (Solimo Draco, teak finish, 1.91 x 2.03 m). 2-5's walnut cane bed (2.17 m long) left a 0.45 m
  route between the bed's foot and the wall from the balcony door to the bedroom door.
- Bedside tables: extra:bpy-bathstore:table-bath-side-teak (0.36 m round). The drawn 0.42 m slot between the pylon and
  the bed is 0.37 m once the real bed stands there.
- Dining table: extra:bpy-kitchen:japandi-oak-rectangular-table-110 (1.1 x 0.7 m). No walnut table is close to the
  drawn 1.19 x 0.81 m; the Rivet 1.35 m is outside the width tolerance.
- Hall wardrobe: extra:bpy-gaps:wardrobe-walnut-2-door-80.
- Auto-picked: the sofa (abo:B07B4G5QD4, as 2-5).
- TV unit traced 9 px deep (569.5-578.5), its outline lines included; the outline's inner span is 8 px.

## Build
faults 2, furniture 19/19. Both faults are `not on a room edge`: pylon-sw (0.45 m) and pylon-se (0.19 m). They are
the grey-hatched pylons that stick 0.6 m out of the south facade beyond every room edge. Traced as drawn, and the
editor's wall footprints draw them right (checked by rendering `wallFootprint` over the plan). The check does not allow
a structural piece outside the rooms.

## Audit
4 faults besides notes:
- Plan-inherent, the dining chairs: dining-chair-w1 and w2 extend outside the living room and into the balcony wall by
  0.12 m. The plan draws them half under the table, 0.33 m from the wall. A real 0.49 m chair pulled clear of the table
  does not fit.
- Plan-inherent, the walkway from door-balcony-living to door-bedroom is 0.50 m. The plan's north dining chair stands
  0.53 m from the balcony door's wall face, and pulling it clear of the table moves it nearer. With that chair removed
  the route passes.
- Audit limitation, wardrobe-bedroom: it is stretched to the drawn 1.98 m by data-fit, but audit.ts compares the
  unscaled 1.78 m model. 2-5 has the same fault.
- Notes only: bed side clearances 0.0 m (the plan's bedside tables), the bedroom route to the bed and the dining
  clearances, all from the drawn arrangement.

## Unsure (plan px)
- The 2300 dimension in the bathroom (x 1030, y 524-650) measures 2.2 m.
- Bathroom light-blue bar at 999-1046 x 558-561: glass screen top or ledge.
- The pylon south-west may be one L with the south strip (labels #40/#41); traced as two.

timing: START=1791017328 END=1791018501

## Changes by the coordinating session (2026-10-03 13:10 +04)
- Dining set (table + 6 chairs) shifted 10 px (~0.17 m) east of where it is drawn so real chairs pulled clear of the
  table fit against the balcony wall; this also cleared the 0.50 m balcony-door route.
- audit.ts counts the data-fit stretch, so the stretched bedroom wardrobe passes.
- After these: audit 0 faults. Build still reports 2 faults: the two facade pylons are "not on a room edge" (the
  checker does not accept structural pieces outside every room); their 3D walls are right. Part of the wall research.
- 13:40: doors carry the plan's swings (data-hinge/data-opens). Audit: 1 fault, plan-inherent: no route from the
  balcony-bedroom door to the bedroom door. The drawn bed's foot ends 0.65 m from the wall at the bedroom door,
  whose swing the designer reserves; the bed alone reproduces it (a 3 cm narrower bed does not help), the empty
  shell passes. Styled (option.styled.json, made before the door swings) has the same one fault.
- 13:43 fresh re-check (independent-verifier): walls, columns, doors (all 5 hinges and rooms), windows and fixtures
  match; furniture all present. Remaining low items: the sofa sits 0.19 m east of where it is drawn (settle pushed it
  clear of the pulled-out east dining chairs); secondary partitions come out 0.07 m thick against ~0.105 m drawn
  (faces within 1-2 px; wall research). Correction: the bathroom dimension reads 2200, not 2300; the plan is
  consistent (the "plan error" note above is a misreading).
