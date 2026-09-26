# Real interior videos compared with Varpet

Reviewed 2026-09-26. Analysis and recommendations only; no model or runtime edits.

The current apartment is legible as an editing model, but the inspected inside view feels like a display set. The largest opportunities are convincing window light, complete kitchens and bathrooms, coherent architectural junctions, and furniture with more natural silhouettes. Decoration comes after those.

## Evidence and limits

- Inspected the live **The Avani Apartment / Demo scene**, revision 0, at `http://127.0.0.1:5174/`: both the cutaway and Inside view. The shell tree showed four rooms, thirteen normalized wall sections, five windows and four doors. This is a demo, not verified evidence of the user's actual house.
- Visually sampled the three real tour videos below at the listed timestamps and read the creators' project descriptions. These are selected-frame comparisons, not claims to have watched every video end to end. The screenshots were inspected in the browser; no third-party media was downloaded or copied into the repository.
- Source audit covered the demo, architecture, assets, lighting and walkthrough implementation. The workspace was dirty and changed during review; source findings below distinguish that change from the earlier visual observation.
- Assumption: since no particular house video was supplied, these tours are inspiration for realism. They cannot establish our home's dimensions, window orientation, structural layout or correct furnishing positions. No circulation measurement was performed.

## Three references, three useful lessons

| Reference and inspected moments | What is visible | How it compares with our model |
|---|---|---|
| **Never Too Small — How a Hotel Designer Brings Luxury to His Small Milan Home, 45sqm/484sqft.** [Kitchen, 4:47](https://www.youtube.com/watch?v=Cfplc4GVphc&t=287s); [living/work area, 9:34](https://www.youtube.com/watch?v=Cfplc4GVphc&t=574s). [Creator's project article](https://www.nevertoosmall.com/post/luxury-hotel-designer-transforms-his-45sqm-484sqft-milan-apartment). | A compact kitchen has an integrated fridge, tap, worktop lighting, splashback, cutting boards and coffee equipment. The living/work frame has clear glazing, an outdoor terrace, curtains, books, plants, a desk and a TV unit. These objects explain daily activities. | Our kitchen reads as cabinets with blank tops. Our living room has the main furniture, but little evidence of cooking, working, reading or arriving home. Borrow complete activity groups and a consistent finish palette; do not copy this apartment's floor plan. |
| **The Local Project — Designing a Minimal Apartment for Calm Living**, Cremorne Point by studioplusthree. [Living/kitchen view, 2:32](https://www.youtube.com/watch?v=Ixr9QweYbCY&t=152s); [timber slats at the ceiling, 3:11](https://www.youtube.com/watch?v=Ixr9QweYbCY&t=191s); [concealed light detail, 3:49](https://www.youtube.com/watch?v=Ixr9QweYbCY&t=229s). [Architect's project](https://studioplusthree.squarespace.com/architecture/cremorne-point). | The wide frame connects sofa, dining and kitchen through a repeated pale-timber palette. Bright glazing and greenery give the room an exterior. Slatted joinery meets the ceiling deliberately; the light detail has a visible architectural source and soft falloff. | This is the most useful restraint reference. It shows that a convincing room needs few decorative objects when the shell, built-ins and light agree. Our dark window panels and broad blank surfaces weaken that relationship. |
| **The Local Project — A Designer's Own Home Filled with Art, Objects and Charm**, Matt McKay / Chelsea. [Texture and architectural detail, 2:05](https://www.youtube.com/watch?v=rr1e-3Mg_IM&t=125s); [furniture discussion, 2:30](https://www.youtube.com/watch?v=rr1e-3Mg_IM&t=150s). [Creator's article](https://thelocalproject.com.au/videos/chelsea-by-matt-mckay-the-local-project/). | In the inspected sitting-room frames, textured wall covering, fireplace trim and tile, a timber cabinet, framed art, a lamp and small objects create distinct surfaces and scale cues. Directional light makes those differences readable. The article also describes layered upholstery and bedroom textiles. | Our walls and furniture need stronger differences in shape and material response. A few contextual objects would make the home feel inhabited. This reference is richer than our apparent style, so borrow layering and specificity rather than its entire decorative language. |

## What our current model is doing well

Inside mode already offers a standing viewpoint, full walls and opaque ceilings. It uses a 1.65 m eye height and 65-degree field of view; there is no need to build another walkthrough. Door frames, window divisions, skirting, furniture materials and contact shading already provide useful scale cues. The renderer has HDR/ACES and GTAO; furniture materials include grain, weave, roughness and sheen. This is a usable foundation.

The issue is partly how the demo uses these features. A more elaborate rendering engine would not supply the missing bathroom fittings or turn a cabinet into a kitchen.

## Priorities for improvement

| Order | Finding and evidence | Proposed change | What would prove it works |
|---|---|---|---|
| **1 — Architectural continuity** | The inspected Inside view had a dark horizontal band above the wall. At the initial source audit, demo walls were 2.7 m while the default ceiling was 2.8 m: a 0.10 m mismatch, consistent with that symptom. During review, another workspace change replaced the fixed fallback with `roomCeilingHeight(...)`, inferred from adjoining walls. See [demo](../src/core/demo.ts), [height resolution](../src/core/heights.ts), [structure](../src/render/structure.ts). | Recheck the latest height work before changing anything further. Treat wall/ceiling closure and intentional thresholds as a prerequisite for lighting review. | A fresh inside view of each room shows closed intended junctions. Check imported v1, explicit v2 heights and elevated rooms; preserve real differences in height. The latest change was not runtime-verified in this review. |
| **2 — Window-led interior light** | Live windows appeared dark teal with no readable exterior, while the floor lamp made a strong warm pool. Window panes use a tinted transparent standard material; the scene retains studio lights in Inside mode. See [structure](../src/render/structure.ts) and [viewport](../src/render/viewport.ts). | Establish separate, deliberate daytime and evening presentations. For day, give windows believable outdoor brightness, glass and light direction; use only verified outside geometry for a faithful reconstruction. Any generic exterior context must be labeled as a visualization assumption. Evaluate the studio fill and ceiling shadow behavior. | At the same inside viewpoint and exposure, a daytime frame has a clear window-to-room light gradient and readable shadowed corners. An evening frame derives its light from placed fixtures. Check that light does not leak through opaque surfaces. |
| **3 — Complete functional rooms** | The demo kitchen contains cabinet/island furniture. The bathroom has a generic vanity cabinet and a plant, without recognizable sanitary fittings. Renderers for sinks, toilets, baths, showers and appliances already exist. See [demo](../src/core/demo.ts), [assets](../src/render/assets.ts), [services](../src/render/services.ts). | Create a reviewed furnishing/design option using the existing building components: cooking, washing, cold storage, bathroom basin, toilet and bathing area as appropriate. Use the real house's evidence before asserting their actual positions. | From the doorway each room's purpose is obvious without its label; fixtures have plausible hosts, clear access and coherent counter/wall relationships. Review dimensions and collisions with the actual scene tools. |
| **4 — Furniture silhouette and contact** | Sofa cushions are rounded boxes, bedding is stacked slabs, foliage is simplified geometry. Materials already carry more detail than these shapes express. GLTF loading exists. See [assets](../src/render/assets.ts) and [furniture materials](../src/render/furniture-materials.ts). | Improve a small set of prominent pieces first: sofa cushions/seams, bedding folds and thickness, chair construction, plant leaves. Add curtains where evidence or a reviewed design choice supports them. | At eye height the sofa and bed read as upholstered objects, have believable contact with the floor, and retain accurate dimensions and selection/collision behavior. |
| **5 — Coherent finishes and lived-in detail** | Current counters, walls and tabletop surfaces are largely bare. Real references use repeated materials and objects related to activities. | Use a small finish family across the whole apartment, with room-appropriate variations. Add a reading lamp/books, a kitchen work group, entry storage, selected art and textiles. Keep circulation clear. | Compare the same viewpoints before/after. Each added object has a purpose; scale and paths remain credible. Fewer well-placed objects should be sufficient. |

## Recommended next pass

Bring **one living-room view and one kitchen doorway view** to a convincing standard before decorating every room. First recheck the ceiling work, then establish daylight and window context, complete the kitchen, improve the sofa/curtains, and add only a few activity-specific objects. Review in Inside mode as well as the cutaway: the latter can hide missing fittings and enclosure problems.

Keep geometry corrections, temporary visualization defaults and proposed renovations distinct. A tour is a visual reference, never evidence that the user's house has a particular terrace, cabinet, opening or fixture. A real reconstruction comparison would require the actual home's footage and matching camera positions.

## Verification record

Only this new Markdown file was written by this task. The research, source-audit and review agents were read-only. No scene data, tests, fixtures, contracts or runtime code were edited; unrelated in-progress changes were preserved. No implementation or visual fix is claimed.

The report's Python link/provenance validation printed:

```text
PASS: 3 video sources, 7 timestamp links, 10 local file links resolve; method and concurrent-change caveats present.
```

`git diff --no-index --check /dev/null apps/editor/docs/real-interior-video-review.md` emitted no whitespace diagnostics. Its exit status was 1 because this is a new-file comparison.

Fresh-context reviewer verdict: **APPROVE**, with the request to replace the verification placeholder with the results now recorded here. The reviewer accepted the parent's video/frame observations; it did not independently inspect the videos or rerender the apartment.

The reviewer additionally ran these untargeted checks against the shared working tree, both with exit 0:

```text
pnpm test
designer: 215 tests / 45 files
Python: 65 tests
tools: 7 tests
editor: 9,797 reported assertions, 9 grouping checks, plus the uncounted legacy-ceiling check
engine: no tests

pnpm typecheck
3 packages passed; no diagnostics
```

Repository implementation checklist — **DONE: 6 of 7**:

1. ✓ Report validation output is pasted above; all referenced local files exist.
2. ✓ Untargeted test/typecheck output is recorded above.
3. ✗ No behavior tests were added: this task changes documentation only, for which `apps/editor/AGENTS.md` specifies content/link/diff review.
4. ✓ This task changed no contracts, tests or fixtures; its sole new file is this report. The rest of the dirty working tree belongs to concurrent work.
5. ✓ Fresh-context reviewer: APPROVE.
6. ✓ Assumption and limits are recorded above. Actual-home fidelity and implementation are outside this analysis; neither is implied complete.
7. ✓ Sole writer: root agent, this file only. All delegated work was read-only.

Not proven: a visual fix, the latest ceiling change's rendered result, measured circulation, or fidelity to the user's actual house. Passing tests do not establish those facts.
