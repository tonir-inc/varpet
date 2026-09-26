# The designer: the agent the customer talks to

Owner: Ashot. Status: design, 26 Sept 11:40. Builds on Notion's Design doc and Designer and evals pages and on
the week's research (skills and data carry over; code is rebuilt here).

## What the customer gets

The customer opens their flat and talks: "make the living room feel bigger", "where should my desk go so I
get good light", "fit a crib and keep the bed". The designer answers with a whole layout, shown as a
ghost over the room, and one short paragraph that explains it with numbers the customer can check:
"frees 1.9 m² of open floor, the desk gets morning sun from the side and no glare on the screen, every
door keeps a 90 cm path, costs 0 ֏". The customer taps yes and the moves play one by one, or asks for
another option. It asks at most one question when the request is too vague to act on, and it says
plainly what it does not do (moving walls, structural work, unsupported decor). Wall paint and furniture
colours are in scope; finish previews are design choices, not supplier quotes (assumed cost unknown).

## Rules it is built on (each one measured before; sources in Notion and `research/`)

1. **The model proposes ops, code disposes.** The designer never writes the scene. It sends ops; code
   applies them to a copy, checks, prices and decides. Without the checker 1 of 6 layouts blocked a
   walkway.
2. **Relations, not coordinates.** The model says "desk against the east wall, beside the window";
   code finds the exact pose. In the literature, moving coordinates out of the model cut invalid
   layouts by roughly ten times (LayoutVLM, I-Design, FlairGPT, AnyHome).
3. **Hard facts are checks; taste is data.** Physics, doors, walkways, kept items, budget: code, the
   same for everyone. Preferences ("bed away from the window") are stored on the scene with their source
   and honoured.
4. **Rearranging what they own, at zero cost, is the default.** That is 41 of 67 real layout requests;
   buying is the follow-up.
5. **The proposal must answer the request.** A request check at proposal time compares what was asked
   (kinds, counts, keeps, budget, preferences) with what the ops do. This is the known gap in the old
   designer: legal layouts that ignored the request passed.
6. **No model critic in the loop.** A VLM critic cost 3.3 times more for a tie on realism. Deterministic
   scorers instead, and the customer as the judge of taste.

## The agents in the product

| agent | runs as | job |
|---|---|---|
| **Designer** | one Codex thread per conversation, `gpt-6-astra` medium | owns the conversation: triage, intent, one question at most, a layout, the explanation |
| **Explorers** (2–3) | parallel threads started by the harness when the customer asks for options, or when the request allows real alternatives | each gets one strategy (most open floor / best daylight for work / social living) and returns one checked layout |
| **Scorers** | code, not agents | free floor, circulation, daylight, function clearances, cost, request match |

The Designer ranks what comes back by the scorers and shows the best two with their numbers. No agent
tree beyond that: architect/builder subagent trees lost to single calls this week (0.63 vs 0.79 and
2.1M vs 39k tokens on furniture).

## Tools (one MCP server, `packages/designer`, stdio; the same server for the product and for tests)

| tool | in | out |
|---|---|---|
| `scene_summary` | room ids (optional) | rooms, walls with compass side, openings with swing, items with `keep`, fixed items, current metrics |
| `set_intent` | kinds and counts to add/remove/move, keeps, budget, preferences, room, `colors:[{target:"wall"\|"item",id,color:"#RRGGBB"}]` | the stored intent (the request check reads it) |
| `search_catalog` | kind, max w/d/h, max price, style words | sized products only, with SKU, size, price, vendor |
| `place` | item or SKU, relation (`against_wall`, `beside`, `facing`, `in_corner`, `centered`, `near_window`, `away_from`), anchor, wall or compass side, exclusions | up to 3 candidate poses, each with the clearances it leaves |
| `check_layout` | ops | pass/fail per check, errors with coordinates, ordered hard to soft; price; metrics |
| `score_layout` | ops | the design metrics below, before and after |
| `sun` | room or window, date, hours | sun hours per window, and which floor zones get direct sun when |
| `propose` | furniture ops or `{type:"color",target:"wall"\|"item",id,color:"#RRGGBB"}`, one-paragraph rationale | refused if a check or the request check fails; else a proposal id for approval |
| `ask` | one question, 2–4 options | ends the turn; the customer's answer comes back as the next message |

## Design metrics (code; each one explainable in a sentence)

- **Open floor:** free area in m² and the largest free rectangle (the space you can actually use), per
  room, before and after. Physical wall thickness is occupied floor; wall-based placements touch the
  inner face. Rugs can underlie furniture but must still clear physical walls. Floor-reaching doors
  create wall passages only for furniture that fits below the door head.
- **Circulation:** a walkway from every door to every item's front and between doors, on a 5 cm grid;
  narrowest width fails under 0.6 m, warns under 0.75 m, good from 0.9 m.
  Proposals and placement compare each violation against the original snapshot. Unchanged or improved
  pre-existing violations are notes; new or worsened violations block. A static scene audit still
  reports every violation. This permits scoped work in an already imperfect flat without claiming
  its existing access problems have been fixed (derived policy, 26 Sept).
- **Daylight:** direct-sun hours per window from the window's compass direction and the sun over
  Yerevan (40.18° N, 44.51° E) on the equinoxes and solstices; where the sun patch falls on the floor.
  Desk: within about 1.5 m of a window, light from the side (not behind the screen, not in the
  sitter's eyes). TV: screen not facing a sunny window. Reading chair and plants: the sunniest zone.
  Bed: out of the low morning sun only if the customer asked.
- **Function clearances:** bed sides 0.6 m minimum (0.75–0.9 preferred), chair pull-out 0.6–0.9 m,
  0.9 m in front of a wardrobe or chest, table edge to wall 0.9 m, sofa to coffee table 0.36–0.46 m,
  door swing clear.
- **Cost:** total in dram; 0 ֏ for a pure rearrange.
- **Request match:** every asked kind and count present, every kept item untouched, the budget held,
  each stated preference met (geometric ones in code).

## A conversation, step by step

1. **Triage.** In scope: layout, furniture, wall paint and furniture colours, finish previews, small
   works priced from the catalog. Out of scope: moving walls, structural work and unsupported decor.
   Current finish operations recolour walls and furniture; textured floor materials are not yet exposed
   by designer tools. Paint, refinishing and labour remain unquoted, so a colour-work budget cannot be
   verified from the furniture purchase total.
2. **Intent.** `set_intent` from the message. If the request cannot be acted on ("make it cozier" with
   nothing else), `ask` one question with options, then stop.
3. **Look.** `scene_summary`, and `sun` when light matters.
4. **Place or recolour.** `place` for each piece by relation; `search_catalog` only when something new
   is needed. A group moves rigidly from one member's operation; do not move its members independently.
   For colour, store the exact target IDs and hex values in `set_intent.colors`, then propose matching
   colour ops. No placement or new furniture is needed for paint. One wall op paints both faces of the
   physical wall, including split segments with the same `source_id`; mention this on shared walls.
5. **Check and score.** `check_layout` until green (errors carry coordinates, so fixes converge);
   `score_layout` for the numbers.
6. **Options.** When alternatives are real, the harness starts the explorers; the Designer keeps the
   best two.
7. **Propose.** `propose` with one paragraph: what changed, the numbers, the trade-off. The customer
   accepts or asks for more; stated preferences are saved on the scene.

## What it depends on from other lanes

- **Engine** (`packages/engine`): the scene schema, `applyOps`, the checks, price. Until it lands the
  designer package works against a small adapter over its own minimal scene type, swapped for the
  engine in one file.
- **Scene field needed:** `north_deg` (the plan's north arrow, degrees clockwise from plan-up), or the
  daylight metric reports "unknown", never a guess.
- **Viewer:** shows a proposal as a ghost and plays accepted ops one by one.
  The editor bridge retains the full v2 source document. Only approved command operations change it;
  project evidence, renovation data, options and existing materials survive. Existing editor semantics
  can invalidate assumptions about an edited entity. Wall paint uses finish assignments when a material
  already controls appearance or when renovation mode would otherwise mark the wall for replacement.
- **Harness:** starts the Designer thread per conversation and the explorers in parallel (Python Codex
  SDK, `deny_all`, the designer MCP server with `default_tools_approval_mode = "approve"`).

## How we know it works

The four tiers from Notion (hard checks, legal trajectory, preferences, pairwise human votes), plus the
request check, on 12 scenarios on the demo flat: 6 rearranges, 2 add-a-function, 2 daylight questions,
1 out of scope, 1 impossible (must decline and say why). Log rounds, seconds and tokens per run. The
prompt-injection row (instructions hidden in product names) stays in the set.

The editor's actual Avani demo is a standing source imported directly from `apps/editor/src/core/demo.ts`
by designer tests and the separate `--suite avani` benchmark. Tests cover the real MCP colour/preview
schemas, HTTP adapter, editor approval and revision checks, scoped rearrangement, grouped v2 data,
and physical wall thickness. Benchmark grading also requires the editor to accept the translated
proposal. Historical bedroom measurements keep their original source and results.

## Build order

`docs/tasks/designer-*.md`, in order. Each card ends with its proving command.
