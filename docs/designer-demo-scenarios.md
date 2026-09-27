# Designer demo scenarios (27 Sept 2026, overnight run)

Three pitch scenarios on the demo flats, each a long Yerevan household brief plus three scripted follow-ups, all on
one designer thread (gpt-6-astra, medium, spike designer). Run with one critic round after the first design.

```sh
cd packages/designer/spike
uv run --project ../../../harness python run/scenario.py --scenario orion-t8-family --critic-rounds 1
uv run --project ../../../harness python run/scenario.py --rerender out/scenarios/<id>/<stamp>   # redraw after a renderer fix
```

Briefs and follow-ups live in `packages/designer/spike/run/scenarios.json`. Every run writes `summary.json` and
`turn-<n>/` (draft snapshot, plan, overview + eye + evening per furnished room, flat overview and top) under
`packages/designer/spike/out/scenarios/<id>/<stamp>/` (gitignored). Render paths below are relative to that
directory. The final designs are exported to `apps/editor/public/demo-flats/<id>.json` (untracked) and open at
`/?open=/demo-flats/<id>.json` (this run's exports sit in the `varpet-lane-scenarios` worktree; copy them into the
checkout that serves the editor).

The inspiration picture `spike/fixtures/inspiration-terracotta-living.jpg` is our own editor render of a hand-picked
draft in the m6-12-54 living room (bpy catalog pieces plus one ABO chair and rug, CC BY 4.0), not a photo.

Caveats on the numbers:
- The first turns of sunday-hosts and orion-t7 lost time to render-daemon restarts that I caused by pushing `lib/view` fixes
  mid-run (the sandbox could not restart the daemon; the designer slept and retried). Fixed in `d2778a9`; expect
  those two first turns to be faster now.
- All renders were redrawn after the run with the final renderer and the corrected flats (fittings facing their room,
  wall kerbs, eye cameras), so they are fairer than what the designer saw.
- orion-t7 started after the critic lane enabled sub-agents (`multi_agent_v2`); the other two ran without them.

## 1. sunday-hosts: whole-flat planning and hosting, Sunday Towers b12121 (188.6 m²)

**Brief.** Narek (52, commercial lawyer, works late at home) and Lilit (49, pastry chef) Hakobyan, daughter Mariam (19,
studies in Vienna, paints) whose room doubles as the room for Lilit's mother (76). Sunday lunch for 10-12, summer
dinners for 6 on the balcony, a real office with files and a calm video background, king bed and blackout curtains,
a welcoming entrance for 12 winter coats. Warm walnut, oak, travertine, deep green and rust; no grey minimalism.
16,000,000 AMD. Scope: entrance, living, kitchen, living balcony, three bedrooms, one bathroom.

**Follow-ups.** (1) Mother-in-law finds the living room cold: green velvet sofa, warmer evening light, show the
evening. (2) 20% less, 12,800,000 AMD, keep table, bed and office. (3) New Year's Eve for 14.

The designer asked first (balcony: 4 comfortable seats or 6 tight ones). The scripted answer addressed rooms, not the
balcony; it chose 4 seats.

| Turn | Time | Tokens (out) | Tools / images viewed | Items | Furniture AMD / budget | Check |
|---|---|---|---|---|---|---|
| brief (question 34 s, answer 2002 s, critic 118 s + fix 831 s) | 2985 s | 11.41 M (64.8 k) | 186 / 67 | 91 | 7,812,700 / 16,000,000 | OK |
| green velvet, evening | 91 s | 0.62 M (1.8 k) | 11 / 5 | 91 | 7,819,700 | OK |
| 20% less | 32 s | 0.19 M (0.8 k) | 2 / 0 | 91 | 7,819,700 / 12,800,000 | OK |
| New Year for 14 | 128 s | 0.33 M (3.6 k) | 4 / 1 | 91 | 7,819,700 | OK, ends in a question |

Thread: 5292 s wall including renders, 12.56 M tokens (12.19 M cached).

**Best renders.**
- Turn 1: `turn-1/report/r-living-eye.png` (ten-seat Sunday table, green sofa, terrace doors),
  `turn-1/report/r-bedroom-11-eye.png` (terracotta bedding against a green wall), `turn-1/report/r-bedroom-9-overview.png`
  (office: green walls, filing cabinets, desk with return).
- Turn 2: `turn-2/report/r-living-evening.png`, `turn-2/report/r-living-eye.png`, `turn-2/report/r-living-overview.png`.
- Turns 3 and 4: no visual change; `turn-3/report/flat-top.png` shows the whole flat.

**What looked wrong.**
- Only 49% of the budget spent (7.8 of 16 M), so the "20% less" turn had nothing to cut and answered in 32 s.
  Great answer, dull demo.
- The first design took 50 minutes: 186 tool calls, a context compaction, and render retries (partly my daemon restarts).
- The sofa corner is thin: sofa, lamp, rug, no coffee table or armchairs, for a 35 m² living room. The entrance is sparse
  (two coat trees standing in the open floor, one bench).
- The "ten-place table" is two identical tables pushed together.
- The fixed kitchen runs, basins and closets faced their walls (a trace bug); the critic flagged it as "flat:" issues.
  Fixed in the flats (see Fixes).
- A ceiling light on the open balcony floats in the sky (the balcony has no ceiling).
- Replies link local files (`[View the living room in the evening](living-warm-evening.png)`).

**Verdict.** Good for a "whole flat from one brief" moment if pre-run: the living, office and parents' bedroom shots
are the strongest of the night. Not live: 50 minutes. Use follow-up 1 (green velvet plus the evening render) live; skip
the budget cut unless the first design spends most of the budget.

## 2. orion-t8-family: kids' room and home office, Orion type 8 (120.6 m²)

**Brief.** Arman (36, game developer, home office with 160 cm desk, two monitors, board-game shelves, a door for
calls) and Siranush (34, pediatric dentist, pilates at home) Petrosyan; Tigran (7, dinosaurs, Lego, homework desk) and
Nare (4, naps, drawing) share a room; dining for 6 on Fridays, a sofa that survives kids, a play corner. Bright
Scandinavian, oak, pastels, rounded corners. 7,500,000 AMD. Scope: reading room (office), both bedrooms, hall, living
and kitchen, balcony.

**Follow-ups.** (1) Make the kids' room more playful: climbing corner, dinosaur on the wall, teepee. (2) We adopted a
corgi mix, Bambuk: bed, bowls, lead. (3) Show what is behind Arman on camera and make that wall good.

| Turn | Time | Tokens (out) | Tools / images viewed | Items | Furniture AMD / budget | Check |
|---|---|---|---|---|---|---|
| brief (design 1020 s, critic 134 s, fix 146 s) | 1300 s | 4.93 M (27.9 k) | 109 / 42 | 58 | 5,874,500 / 7,500,000 | OK |
| kids' room playful | 81 s | 0.70 M (1.6 k) | 4 / 0 | 58 | 5,874,500 | OK, nothing changed |
| dog | 144 s | 1.34 M (3.5 k) | 11 / 3 | 62 | 5,969,400 | OK |
| office on camera | 240 s | 1.64 M (6.4 k) | 15 / 7 | 62 | 5,969,400 | OK |

Thread: 2216 s wall, 8.61 M tokens (8.39 M cached).

**Best renders.**
- Turn 1: `turn-1/report/living-eye.png` (sofa, round dining table, kitchen), `turn-1/report/lounge-eye.png` (office with
  two monitors at the window), `turn-1/report/bedroom-1-eye.png` (two kids' beds, grey and pink).
- Turn 2: unchanged; `turn-2/report/bedroom-1-evening.png` shows the same room.
- Turn 3: `turn-3/report/living-overview.png` (dog bed by the sofa, feeder by the kitchen), `turn-3/report/hall-overview.png`
  (lead basket on the entry bench), `turn-3/report/living-evening.png`.
- Turn 4: `office-video-backdrop.png` (the designer drew an annotated elevation of the wall behind the desk, a nice
  touch), `turn-4/report/lounge-eye.png`, `turn-4/report/lounge-overview.png`.

**What looked wrong.**
- "Make the kids' room more playful" changed nothing: the designer searched `decor`, `wall_art` and `shelf` for a teepee
  and a Pikler triangle, which exist under kind `toy` (not in the prompt's kind list), then gave up. No dinosaur art
  exists in the catalog. Posted to the board for the critic lane.
- The kids' room itself is plain for a brief about dinosaurs and drawing: grey bedding, no play rug zone, no reading
  nook visible. The office shelves meant for the board-game collection are empty.
- The living room (43 m²) reads empty: no play corner, no marked pilates spot, one floor lamp standing in the open floor,
  a lone armchair far from the sofa.
- Bedside "pendants" hang at head height beside the beds (the designer chose pendant mounts for bedside lights).
- Wall lights rendered as ceiling pendants on cords, and the parents' wardrobe looked free-standing in the overview
  (the dropped near wall). Both were renderer problems, fixed.
- The office reply links a local absolute path.

**Verdict.** The best live candidate: 22 minutes for the first design, and the dog turn (2.5 minutes, 4 sensible
pieces, total updated) is a crowd-pleaser. Do not show "more playful" until kind `toy` is in the prompt; re-run it
then.

## 3. orion-t7-inspired: picture-inspired living room, Orion type 7 (134 m²)

**Brief.** Hayk (31, sommelier, wine bar in Kond) and Mane (29, ceramicist, sells online) Sargsyan. The living room
like the attached picture (terracotta wall, cream sofa, walnut sideboard, travertine table, olive tree, abstract canvas),
the palette carried through the flat; Friday tastings for 8, bar cabinet, record player; a studio office with a packing
table and no carpet; a guest room for Hayk's parents from Glendale (queen bed, armchair for a bad back). No cold greys
or chrome. 9,000,000 AMD. Scope: living and kitchen, three bedrooms, hall, balcony.

**Follow-ups.** (1) Swap the cream sofa for green velvet (red-wine evenings). (2) Show the living room in the evening for
eight: light on the table and bottles, seats after dinner. (3) Parents stay three months: storage, blackout, a better chair.

| Turn | Time | Tokens (out) | Tools / images viewed | Items | Furniture AMD / budget | Check |
|---|---|---|---|---|---|---|
| brief (design 721 s, critic 168 s, fix 303 s) | 1192 s | 5.51 M (16.9 k) | 112 / 22 (incl. 42 sub-agent events) | 61 | 6,850,200 / 9,000,000 | FAIL (1) |
| green velvet sofa | 141 s | 1.47 M (2.8 k) | 13 / 5 | 61 | 6,245,200 | FAIL (1) |
| evening for eight | 206 s | 2.19 M (3.5 k) | 13 / 5 | 61 | 6,245,200 | FAIL (1) |
| three-month stay | 453 s | 3.56 M (10.4 k) | 27 / 10 | 63 | 6,157,200 | FAIL (1) |

Thread: 4938 s wall, 12.73 M tokens (12.48 M cached).

**Best renders.**
- Turn 1: `turn-1/report/living-eye.png` (dining for eight, terracotta wall with the canvas, cloud sofa, olive tree, bar
  cart: the picture carried over faithfully), `turn-1/report/living-overview.png`, `turn-1/report/flat-overview.png`.
- Turn 2: `turn-2/report/living-eye.png` (green velvet sofa against the terracotta wall, the best shot of the night),
  `turn-2/report/living-evening.png`, `turn-2/report/living-overview.png`.
- Turn 3: `turn-3/report/living-evening.png`, and the designer's own `friday-bottles-evening.png` and `friday-evening.png`.
- Turn 4: `turn-4/report/bedroom-3-evening.png`, `turn-4/report/bedroom-3-eye.png`, `turn-4/report/bedroom-3-overview.png`.

**What looked wrong.**
- The check failed on every turn, and the designer finished anyway: the window rule demands a blind on the studio's
  bay window because "the brief asks for dark/privacy". The brief only says they *dislike* "heavy, dark bedrooms",
  and the room is a studio. False positive for the rules lane. No catalog blind fits the 1.03 m bay.
- Customer replies talk about "the studio-blind blocker" and link absolute local paths: internal words in front of the
  customer.
- The green velvet sofa (294,000 AMD) is much smaller than the cloud sofa (899,000 AMD). After dinner "only about three
  fit on the sofa". The designer said so honestly, but it misses the "seat for everyone" ask.
- Pink linen curtains in the main bedroom and a Kandinsky print over the guest bed break the terracotta and cream
  palette.
- The balcony (0.88 m deep) holds one stool instead of two and no plants: correct, and honestly reported.
- The "better chair for his father's back" became a 79,000 AMD recliner replacing a 339,000 AMD wingback.

**Verdict.** Show it. The picture to room moment and the green velvet swap are the strongest pitch material we have,
with the evening render as the closer. Fix the window false positive first so the check stays green. Keep follow-up 3
off stage.

## Across scenarios (for the rules and critic lanes)

1. **Budget under-use.** 49%, 80% and 68% of the budget spent. Budget trade-offs cannot be demoed until the design
   aims at roughly 85-95% of the budget (a plan.md split that is actually spent).
2. **A follow-up that finds nothing does nothing.** When the asked-for piece is missing, deliver the intent with what
   exists (colour, rug, art, cushions). Add kind `toy` to the prompt.
3. **Customer-facing replies** must never contain file paths, check jargon ("blocker") or tool names.
4. **The window rule reads "dark" in a dislike as a need.** It should also respect room re-assignment (studio, office).
5. **Speed.** First designs took 20-50 minutes and 5-11 M tokens. Follow-ups take 0.5-7.5 minutes, which is live-able.
6. **Rooms read empty** at 43 m²: no zoning pieces (play corner, reading nook, pilates spot) and few layers of decor.
7. **Light fixtures:** bedside pendants at head height, a ceiling light on an open balcony.
8. **Blank product sheets** for `extra:` (bpy) products: the designer judged pieces only from room renders (catalog lane).
9. **Mid-scenario questions** (sunday follow-up 3) are fine on stage; the runner has no scripted answer for them.

## Fixes landed in this lane

- `9aae996` and ancestors: the demo flats (sunday-b12121, orion-t8, orion-t7) from `demo/flats` are on main.
- `37692e2` `apartments/_svg/orient.py`: traced fittings (kitchen runs, basins, closets, washer) now face their room; 21
  fittings flipped across the three flats; `build.py` applies it on rebuild. The root cause (a rectangle trace knows
  the axis, not the front) is in `harness/varpet_harness/trace.py` (architect lane).
- `lib/view`: wall lights mount on their wall instead of hanging on a cord, and never on a low parapet; room overviews
  keep a 20 cm kerb where the near walls stand; eye cameras avoid niches and keep lamps or plants out of the foreground.
- `lib/render-view.ts`: a sandboxed render keeps using a stale daemon when it cannot start a new one (before, any
  `lib/view` change broke every render in running designer threads); report renders wait up to 90 s for models.
