# Designer review for Felix — 26 September 2026

This review describes main at `d2d7966`, inspected on 26 September 2026, local time +04:00. **The designer does not reliably furnish real flats.** Today’s work improved transport, checking, interaction and some response times, but the published whole-room benchmarks remain unsuccessful. Passing unit tests and accepting an editor command do not establish customer satisfaction or a completed room.

“Measured” below means an inspected report, trace, source file or Git record. “Derived” identifies an interpretation of that evidence. “Reported” identifies information supplied by Ashot or the coordinator. Historical results retain their original product revisions; later fixes do not change their scores.

## 1. How the designer works today

[Measured] The editor owns the scene and the decision to apply changes. `apps/editor/src/contracts.ts` and `renovation-contracts.ts` define objects, renovation entities and commands. `apps/editor/src/ui/designer-panel.ts` manages chat and proposal review; `apps/editor/src/adapters/designer-http.ts` sends the scene, revision, request, conversation ID and optional picture to the Python service. Its catalog payload contains registered products needed by the scene and history, not the full purchasing inventory. The integration contract is [designer-service.md](designer-service.md).

`harness/designer_service.py` validates the request, saves request evidence, maintains conversation history and starts a worker. It streams newline-delimited progress, text and optional tool/build events, followed by one final reply. Cancellation terminates the worker’s process group. Conversation state persists between turns, but each request gets a fresh scene snapshot and proposal directory.

`packages/designer/src/editor-bridge.ts` converts editor coordinates, catalog identities, walls, openings and fixed obstacles into the designer’s smaller scene. The original editor document stays on disk for translation back. `harness/designer_context.py` creates bounded model context; the full editor document and catalog are not supposed to be pasted into the model turn.

`harness/designer.py` runs the Codex SDK thread. Production defaults are `gpt-6-astra`, low effort, `without-place`, `compact-base`. That profile hides `place`, `scene_summary`, `check_layout` and `score_layout` from the model. The reference benchmark’s relation/full profile is different. Explorer support exists in the CLI through `--options`; the HTTP flow should not be described as automatically running three explorers on every request.

The optional fast route, `harness/designer_fast.py` and `packages/designer/src/{fast-cli,fast-path}.ts`, classifies supported requests, searches bounded candidate sets and sometimes answers without a model. Other requests fall back to the general thread. Current fast furnishing discovers real catalog products by requested kind rather than treating registered editor products as the buying universe.

The MCP server is `packages/designer/src/server.ts`. It exposes intent, catalog, proposal and other tools according to the profile. `session.ts`, `layout.ts`, `local-checks.ts`, `request.ts` and `metrics/` apply operations to a copy, check geometry, circulation, access, budget and request matching, and calculate scores. Unchanged baseline violations may remain disclosed; new or worsened violations block. A saved proposal still requires bridge translation and editor validation. Preview does not apply it; Apply executes the revision-bound command, and Undo uses editor history.

## 2. What was built today

[Measured Git history] These groups identify implementation and evidence, not claims that every feature passed a customer trial.

- **Fast path:** `1db1746` added checked slots; `a738b52` added catalog caching, fitting and evidence-based default promotion; `0604bc6` promoted matched paint edits; `c97162b` recertified Avani recipes after access checks changed. Main files are `src/fast-path.ts`, `fast-cli.ts`, `catalog-acceleration.ts` and `harness/designer_fast.py`.
- **Taste and room programs:** `70c37c9` added style knowledge/program scoring; `ef6c2f9` composed complete catalog candidates; `cd113f2` added bedroom/office compositions. `2fca3c5`, `63e39f6` and `8213723` addressed singleton candidates, structural appearance, kids budgets and an unnecessary living-room chair requirement. See `packages/designer/knowledge/room-programs.ts`, `knowledge/styles/` and `src/taste/`. `90224bd` publishes the unsuccessful paired follow-up.
- **Conversation and events:** `40291b9` added conversational answers and streamed chat; `8dd936e` separated customer copy from technical notes; `e724f1a` documented optional events; `754e43e` streamed tool/build observations. `d88635b` changed triage to act on clear requests without an unnecessary preference interview. Relevant files include `harness/designer_presentation.py`, the service and editor panel.
- **Product previews:** `55f6489` requires inspection before purchases; `32f49d0` records vision experiments. `harness/designer_products.py` and `src/catalog-vision.ts` supply product evidence. Preview inspection is not proof that a whole room is attractive or that an item fits.
- **Pictures:** `19264e4` preserves picture requests when fast selection is enabled; `d1e42be` allows private inspiration images on any turn. The image is appearance evidence, not authoritative room geometry. Runtime files remain private rather than becoming repository fixtures.
- **Custom pieces:** `f2f4dd2` added checked slots and parallel builders; `bb7b1a4` records verification. `src/custom-slots.ts`, `harness/designer_builds.py` and `designer_build_check.py` reserve space, dispatch work and validate returned assets. Estimated custom prices and unresolved builds must remain disclosed.
- **Bridge robustness:** `a4723fb` represents components/routes as fixed obstacles and permits conversation after conversion limitations. `2c82892` bounds model input after the one-megabyte failure. `59e4eb0` fixes architect components disappearing during editor reconstruction review. Existing fixtures are not movable purchases.
- **Showcase:** `b30f29b` added residence pages/embeds; `3911481` reads recorded conversations; `c3668c5` compares developer-drawn layouts. `apps/showcase/` displays recorded results and availability. A functioning page does not demonstrate a new successful designer run.
- **Acceptance suite:** `e69062d` adds a repeatable real-browser command; `b179459` accounts for editor wall normalization; `9a51578` audits grading/evidence; `0430060` publishes the baseline. Entry point: `pnpm acceptance`; report: `packages/designer/eval/acceptance.md`.
- **Latest live hotfixes:** `34c24c1` fixes real-catalog discovery, follow-ups after failed requests, empty proposals and routing coverage. `e5751fe` records the Avani replay. Approved obsolete tests now reject empty proposals while retaining valid-operation coverage; the commit message lists each old → new expectation.

## 3. Measured results, including failures

[Measured] These are different cohorts and rubrics. Their denominators must not be pooled.

| Evidence | Result | What it establishes |
|---|---|---|
| [komitas.md](../packages/designer/eval/komitas.md), product `303677a` | Fast **20/58**, normal **21/58**; living 0/9 each, bedroom 0/9 each, kids 0/4 each | Strict furnishing completion was 0%. Each arm returned 13 editor-accepted proposals, mainly desks and paint; editor acceptance was not request completion. |
| [integration-final.md](../packages/designer/eval/integration-final.md), repair `59e4eb0`, report `77c07ac` | Only **2/8 actionable requests** produced proposals: paint in both modes; **4/4** conversational/refusal replies completed | Actual plan import, fixture retention and paint approval worked. No furniture was placed; sofa movement remained untested on a furnished result. |
| [taste-komitas.md](../packages/designer/eval/taste-komitas.md), `c4d038b` → `f8637af` | Living, bedroom and kids **0/9 before and after on both paths**; overall **11/72 → 10/72** | Correcting contradictions did not establish reliable furnishing. Sofa additions supplied the successes. |
| [acceptance.md](../packages/designer/eval/acceptance.md), product `aa87b09`, runner `30faee4` | Tier 1 complete conversations **0/3 on each flat**; only open steps passed, 3/21 each. Tier 2: Komitas **14/36**, Avani **21/36** | The golden customer sequence failed. Three repetitions do not certify the intended ten-repeat reliability target. |

The Komitas fast arm had median/max **8.873/72.995 seconds**, versus **11.261/88.851** normal. Total tokens were **2,390,238 versus 5,389,071**, but fast completion was one request lower. Faster unresolved replies contributed to the reduction. Three translation failures were reproduced as overlong 122-character product names against the editor’s 120-character limit. The report also retains conservative subtype/clearance grading failures, including “Beside Table” and broad table classifications; these are not silently regraded as passes.

Integration retained **14/14** and **15/15** architect components after repair, whereas the first import had silently dropped all 15. Paint Preview/Apply/Undo and reconstruction Preview/Apply/Undo worked. All **20 showcase-plus-embed flows** passed. Those navigation checks did not measure newly generated furnishing or complete GLB download latency.

[Measured] [fast-path.md](../packages/designer/eval/fast-path.md) shows real narrow improvements: Avani rearrangement median **56.020 → 8.918 seconds**, grouped movement **23.615 → 11.603**, paint **22.690 → 3.858**, with 3/3 passes before and after for each isolated case. Structural refusal improved to 6/6, median **0.012 seconds**. However, Komitas living remained 0/6 despite **105.755 → 10.799 seconds**. That is faster failure, not successful furnishing.

[Measured] The hotfix [Avani replay](../packages/designer/eval/ashot-live-2026-09-26.md) returned living furniture in **32.725 seconds**, a different living alternative in **24.504**, and honest empty-room replies in **1.976/1.468**. The bathroom-bed answer took **1.489**; whole-apartment red paint took **3.003**. The compound sofa request still took **61.916**. Ten-request total was **190.067 seconds**, median **13.240**. Seven proposals, including two extra paint requests, passed Apply and exact-state Undo checks. Preview confirmed review-mode entry, not settled 3D appearance. The first request text was assumed because the original instant refusal was not persisted. Earlier replay attempts hit catalog outages and a visual-selector timeout; they remain documented. Ashot’s reported satisfaction of roughly one or two answers in ten is not replaced by these technical checks.

## 4. Why furnishing fails

[Derived from code and recorded failures] The whole-room planner couples many decisions before it can return anything. `src/taste/design.ts` searches program kinds, chooses limited product variants, enumerates a small set of room positions/orientations, and requires composition and physical checks to pass together. Bedroom and kids generators likewise require complete groups. Failing a later piece can leave the customer with no proposal despite potentially useful earlier placements. Bounded failure does not prove geometric impossibility.

The documented investigation exposed actual contradictions, covered in `test/taste-contradictions.test.ts`: fixed structures were being judged for catalog appearance; no eligible furniture could incorrectly fail appearance; and one checked candidate was discarded because no second candidate survived. Living recipes additionally required an accent chair that the minimum compact program did not require. These were corrected, but the fresh paired benchmark stayed at zero complete rooms.

Program costs and geometry still matter. The kids report found sampled bed-plus-desk combinations costing **277,000 AMD** against a complete-room budget of **300,000**. It also recorded a **0.47 m** route below the physical **0.60 m** requirement, unreachable balcony access, wall conflicts and an editor-rejected rug outside the floor plan. These are observed failures of selected candidates, not exhaustive proofs that the room or budget is impossible.

Fixtures make usable space smaller. The integration run’s kitchen/bath/built-in components now remain obstacles instead of disappearing. Conversely, the frozen sequential Komitas cohort explicitly had no project components/routes, so fixtures cannot explain all its failures. Catalog discovery, unnecessary questions, narrow search, semantic classifications and bridge disagreement are separate observed contributors.

## 5. Felix’s tool-use concern

[Measured recount] The preserved directory supplied for this review contains **33 rollout JSONL files**. Counting `response_item` records whose payload type is `function_call` or `custom_tool_call` yields **119 outer calls: 118 named `exec`, one `wait`**. This is an outer-call count, not 119 individual designer MCP operations; one JavaScript invocation can call several tools. It is a preserved sample, not a census of all production turns.

Local evidence directory, intentionally not committed: `/private/tmp/claude-501/-Users-ashotarushanyan-DevProjects/76f3c044-ef52-4b2b-bb13-b5f82374fb74/scratchpad/designer-rollouts-kept/`.

A directly attributable example is `rollout-2026-09-26T19-49-35-01a0de68-574b-7790-9ea0-43a08a8882c8.jsonl`. Its session metadata points to replay conversation `138239b95b264b0499ed99cb79f55252`, also present in `/tmp/varpet-ashot-live/replay.json`. At line 28, JavaScript calls `tools.mcp__varpet_designer__propose` with an added bed at `pos:[2.9,-1.54665]`, `rot:0`. Lines 57 and 64 construct the sofa operations with `pos:[-2.2,0]`, `rot:352.17`, then parse and filter the checker’s JSON response. The retry changes intent handling while retaining the calculated pose. Another preserved rollout, `rollout-2026-09-26T18-00-34-01a0de04-88b6-7c13-a662-9f8c044feb4f.jsonl`, line 28, builds a desk operation at `[0.8,-6.15]`.

[Derived] The general profile therefore asks the model to do more than choose a design: it writes orchestration JavaScript, builds operation payloads and supplies coordinates. Main’s `build_config()` disables shell/unified execution features, but that is not the same as disabling Codex’s JavaScript tool-execution mode. The traces show the latter remained active. Physical checks still run, so this evidence does not establish unchecked scene mutation. It does establish a mismatch with the intended division where code owns placement. Fast candidate selection and whole-room `candidate_id` selection are existing exceptions; not every proposal uses model-written coordinates.

## 6. In progress: FAST

[Reported target; measured local implementation] FAST is working in `~/AshProjects/varpet-fast` on incremental `plan_room`, targeting portal Avani, Balcony and Komitas b21-t13. At inspection this work was uncommitted; it is not part of the reviewed main revision.

`src/incremental-room.ts` places an anchor, updates a working scene, then tries successive program pieces. `src/typed-tools.ts` exposes typed planning/move/paint/proposal tools and selection by option ID. `harness/designer_typed_tools.py` changes private runtime model metadata to direct tool mode; the modified driver disables code-mode flags. Local input files exist for Avani and Balcony. These are implementation observations, not a verified three-flat acceptance result. Partial layouts must remain labelled partial, with missing requested pieces disclosed.

## 7. Open decisions for Felix and Ashot

[Derived review agenda]

1. Decide whether useful partial room proposals are acceptable, and define how missing essentials appear in the answer and grade. Do not silently count partial delivery as complete furnishing.
2. Decide whether the customer runtime must always use direct typed tools with code-owned coordinates, and which legacy profiles remain for reproducible benchmarks.
3. Agree on default bedroom selection, missing-style assumptions and when a clarification is necessary. Current evidence shows clarification repeatedly blocks completion.
4. Reconcile functional furniture categories and preferred-clearance grading with actual catalog products, without relaxing collision, doors, fixed obstacles or explicit customer requirements to improve scores.
5. Require a fresh browser acceptance run after FAST and the hotfixes meet on main. Include failed attempts, fixture-heavy Komitas input, both portal flats, exact model/tool configuration and human screenshot review. Historical green tests and the single hotfix replay do not establish this result.
