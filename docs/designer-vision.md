# Designer vision: decision-specific prototypes

Research and experiment date: 2026-09-26; timestamps below use UTC (`Z`). Raw results are recorded in
`packages/designer/eval/vision-options-runs/20260926T131200Z`; the manifest carries the actual start time.

## What vision can add

[derived] Give the model a picture only when information needed for a decision is absent from JSON.
Image understanding has documented limitations for small/rotated text and precise spatial reasoning;
image resolution also affects input cost. Keep identities, dimensions, collision and access in code.
Do not substitute a screenshot for the scene contract. [Official OpenAI vision documentation](https://developers.openai.com/api/docs/guides/images-vision).

[derived] MCP tool responses can contain image blocks, so a product contact sheet can be delivered at
the moment of selection, without enabling broad browsing or another agent. [MCP tool result specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).
Sergey's `show_candidates` returns a numbered sheet and legend, rendered model first and shop-photo
fallback. These are product images, not evidence of real shop price or physical comfort.

| Option | Decision it can inform | What it cannot establish | Prototype |
|---|---|---|---|
| Customer viewport | What “this corner” refers to; visible palette/material contrast; what the customer currently sees | Off-camera conditions, exact clearances, a stale scene, actual photographic fidelity | Fresh request snapshot, scene/revision bound, up to 1280 px JPEG; works on resumed turns |
| Product sheet | Silhouette, upholstery appearance, visual weight, conspicuous bad meshes, conflicting catalog names/tags | Comfort, dimensions beyond catalog provenance, missing/blank pictures | `vision.products`; one opt-in MCP tool; require a sheet before added SKUs are proposed |
| Rendered proposal | Furniture reading as a coherent seating arrangement; obvious request/look mismatch or broken models | Independent geometric validation, objective aesthetic truth, concealed details | `vision.selfCheck`; top + 3D of disposable EditorStore-approved proposal; one read-only judgement; 20 s total render/model budget |
| Developer plan | Room labels and developer-drawn furniture as an intended-use reference | Existing owned furniture, trustworthy dimensions from pixels, permission to alter shell | `vision.plan`; PNG/JPEG attached as separate context; JSON remains authoritative |

[reported prior measurement] BENCH's fixed first-turn images passed 11/14 versus 9/14 text-only, with
6/8 editor acceptance in both arms and roughly 16% more tokens. Only sofa/floor advice showed a
repeated qualitative advantage. This does not establish a general win; see
[the original report](../packages/designer/eval/vision.md). Ashot reports an earlier generic vision
critic at 3.3× cost for a realism tie; that experiment is not rerun here.

## Experiment and grading

[assumed] Ashot's first request is the wording recorded in the team's Notion design status:
“Remake the living room in minimalistic style but cozy.” The second turn reconstructs his complaint
about odd chairs lined against a wall; it is **not** an exact recovered second-turn transcript.
Both turns retain a real conversation ID, and any accepted first proposal is applied to the disposable
EditorStore before the second request. A declined/question first turn remains unchanged.

[measured design] Five arms: text, current view, products, self-check, plan. Six cases (Ashot's two
turns plus five style/look requests), three repetitions: **105 planned HTTP requests**. Four
conversations run concurrently; arm order rotates between repetitions. Same scenes, catalog,
requests and low/without-place/compact-base profile per pair. Avani plus b20-t11 and b28-t31 are used.
The 877-product live catalog is captured once; database searches and preview sheets stay live.
Catalog values still have placeholder price provenance. Input plans remain outside Git.

[derived] Editor acceptance is not visual or request success. Independent operation checks cover
room scope, keeps, requested additions/removals, no-purchase constraints and seating orientation.
The implementing session visually audits renders/answers against the declared rubric, separately from the model's
self-check. Render filenames hide arm labels, but this is not an independent human or fully blinded study. Colour advice must be direct and grounded, with no edits. Accent selection must match a
simple neutral reading-chair brief. The corner must face the sofa without discarding kept items.
Bedrooms need a coherent sleeping/bedside set; reading corners need one armchair and book storage.
Ashot's makeover needs a useful coordinated seating group, not a row of mismatched chairs.
Declines/questions on actionable requests, unavailable renders and timeouts are not passes.

[measured definitions] HTTP seconds start at submission and end at the final NDJSON line. Evaluation
setup/render capture before submission is separate; never call HTTP latency total UI latency.
Model tokens are SDK cumulative deltas within conversations, including cached input. Self-check
tokens are added only when SDK telemetry exists; timeout tokens stay unknown, not zero. Render
and model-confirmation seconds are recorded separately. Sample size is three per case/arm: noisy
or small differences are not statistical evidence. Shared catalog/model/GPU load is uncontrolled.

## Results and recommendation

[measured] **105 scheduled trials, 104 HTTP completions and one pre-submission render failure**,
2026-09-26 13:11:20–13:31:51 UTC, `gpt-6-astra` low. No usage-limit stop. All 34 returned proposals
passed the real EditorStore and validateScene. That is not the completion score below.

| Arm (21 trials each) | Verified request fulfillment | Editor accepted / returned | Median HTTP s | Median total tokens (known n) | Median paired Δs vs text | Median paired Δtokens (known pairs) |
|---|---:|---:|---:|---:|---:|---:|
| Text | 7/21 | 9/9 | 41.208 | 67,755 (21) | — | — |
| Customer view | 10/21 | 8/8 | 35.615 (20 HTTP) | 48,420.5 (20) | −0.899 | +3,288 |
| Product sheet | 7/21 | 8/8 | 35.031 | 65,320 (21) | +3.766 | +11,591 |
| Bounded result check | 1/21 | 1/1 | 48.614 | 44,313 (13) | +7.406 | +2,566 (13) |
| Plan/reference image | 10/21 | 8/8 | 40.298 | 69,797 (21) | +2.304 | +4,505 |

[derived] These paired deltas include failures and different tool paths; **they are not isolated
inference overheads or evidence that images generally make requests faster**. The check-arm token
median excludes eight unavailable totals and is especially unsuitable for a cost comparison.
Five accepted Ashot first-turn proposals share one scene whose original meshes did not finish the
offline 90-second load guard; their appearance remains **unverified**, not judged aesthetically bad.
They are excluded from verified fulfillment. The raw runner's `technical_pass` is only an acceptance
diagnostic; the report uses `adjudications.json`, not that field.

| Case | Text | View | Products | Self-check | Plan | Interpretation |
|---|---:|---:|---:|---:|---:|---|
| Ashot, complete two-turn conversation | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | No arm delivered the requested second-turn correction |
| Sofa/floor appearance answer | 0/3 | 3/3 | 0/3 | 0/3 | 3/3 | Images supplied otherwise missing floor evidence |
| Owned-chair conversation corner | 3/3 | 3/3 | 3/3 | 1/3 | 3/3 | No improvement from vision; bounded review lost two deliveries |
| Neutral replacement armchair | 2/3 | 2/3 | 2/3 | 0/3 | 2/3 | Equal delivery; one product-preview run chose a different silhouette |
| Scandinavian Komitas bedroom | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | No delivered bedroom in any arm; bedroom taste is not evaluated |
| Komitas chair + bookcase | 2/3 | 2/3 | 2/3 | 0/3 | 2/3 | Basic compatible pairs, no demonstrated cozy-style advantage |

[measured] The floor-view answer had median **12.83 s / 11,393 tokens**, versus text's
**16.55 s / 21,631 tokens**. Text honestly reported missing floor evidence; it did not hallucinate a
floor. The image answers directly related the sage sofa to visible warm greige/taupe flooring.
The Avani “plan” input here is a rendered top view, so its floor-color success is **not** evidence
that a developer marketing drawing can establish actual finishes.

[measured] Ten `show_candidates` calls occurred: nine completed, one failed; median tool duration
**3.779 s** including the failure. In accent repetition 2 the product arm selected the visually
lighter Rivet Jamie (`abo:B082VMWB4G`), while text/view selected Lawson (`abo:B075X4F5CH`).
In repetition 3 both product and text selected Lawson. Both silhouettes met the modest neutral-chair
rubric; no aggregate taste gain is proven.

[measured] Result checking was actually reached **9 times: 1 confirmed, 8 timed out**. The confirmed
check added **18.147 s and 6,646 tokens** (render 3.072 s, model 15.059 s). Seven timeouts occurred
before starting the review model; one started a model but yielded no token telemetry. Raw totals
remain unknown for those timeouts; the seven pre-model failures incur no review-model tokens by
construction. Check elapsed time was at most **20.489 s**, including process-group termination.
No timed-out proposal was shown as visually confirmed.

[measured limitations] **61/104 HTTP requests** encountered at least one unavailable catalog search
(text 13, view 11, products 13, self-check 12, plan 12). This includes requests that later recovered;
those counts are not all terminal failures. Live search/preview services and ranking could change
while the frozen editor catalog retained original S3 mesh URLs. Empty candidate sets and catalog
failures dominate the makeover/bedroom results. Original mesh loading also exceeded the review
budget. Backend/profile sources were frozen for the batch and archived with hashes; frontend
capture hooks were refined during collection, and Vite hot reload plus shared tests/GPU load are
additional render confounds. The shipped evaluation Vite config disables HMR and file watching.
This batch establishes feasibility and observed failure rates, **not a clean causal estimate of
visual taste improvement**. Three repetitions do not support significance claims.

[derived recommendation] Switch on **current-view capture for explicit visible color/material
questions** and offer it for “this corner” when selection/camera context matters. Keep it off for
ordinary measured rearrangements. Offer **product sheets for appearance-sensitive purchases**:
it makes look-based choice possible, but keep it experimental until per-tile availability is explicit
and a larger taste evaluation wins. Keep **automatic self-check off**: the cold renderer/model
budget loses valid deliveries; a persistent cached renderer and then a fresh controlled comparison
are prerequisites. Attach **developer plans only for label/drawn-program questions**; this study
does not justify sending them for routine furnishing. No automatic request classifier or CHAT UI
toggle is enabled by this change. QUALITY still needs to solve coherent full-room makeovers.

Evidence: [manifest and exact prompts](../packages/designer/eval/vision-options-runs/20260926T131200Z/manifest.json),
[all outcomes and SDK totals](../packages/designer/eval/vision-options-runs/20260926T131200Z/rows.json),
[independent operation checks and visual verdicts](../packages/designer/eval/vision-options-runs/20260926T131200Z/adjudications.json),
[tool timings/availability](../packages/designer/eval/vision-options-runs/20260926T131200Z/tool-evidence.json).
Per-request HTTP streams, compressed SDK events, source snapshots, before/after scenes and actual
editor captures are alongside them. Original developer plan bytes are not included.

## Opt-in API and ownership

No option changes the default fast path. Explicit visual jobs bypass FAST’s text-only selector; ordinary jobs retain its routing. Omitted `vision` adds no image, catalog-preview round,
renderer process or review model call. QUALITY keeps ownership of style knowledge, programs and
composition generation; this work does not change its definitions or substitute image judgement
for its deterministic checks. FAST's profile remains unchanged. CHAT can opt in per message:

```ts
await askDesigner(request, {
  signal,
  vision: { view: true, products: true },
});
```

The HTTP request can instead carry:

```json
{
  "vision": {
    "view": {"dataUrl":"data:image/jpeg;base64,...","sceneId":"flat-id","revision":12,"selectedIds":["chair-id"]},
    "products": true,
    "selfCheck": true,
    "plan": {"dataUrl":"data:image/png;base64,..."}
  }
}
```

Enable only the desired keys. View ID/revision must match the source; the editor hook also verifies
its actual rendered document before capture and rejects active geometry drags. Capture has a 3 s
deadline and supports cancellation. Image payloads are PNG/JPEG inline data (2 MiB each), not paths
or fetchable URLs. Existing HTTP body limits still apply. The plan is reference evidence, not
instructions or an instruction to recreate furniture without catalog identities.

The adapter owns capture/transport. The viewport and floor-plan each have a small registration hook;
no main.ts or conversation-panel redesign is included. Self-check requires the renderer below and
is limited to style/appearance requests. If the check rejects, fails, or runs out of time, the
service withholds the proposal and reports that it was not visually confirmed; it never silently
labels an unchecked layout as confirmed. There is no iterative critic/repair loop.

```sh
pnpm --filter @varpet/editor exec vite --config ../../packages/designer/eval/vision-vite.config.ts
VARPET_VISION_EDITOR_URL=http://127.0.0.1:5262 VARPET_CATALOG_URL=http://localhost:8765/mcp \
  uv run --no-project --with openai-codex==0.157.1 --with playwright \
  python harness/designer_service.py --port 8796
# Live paired experiment; source developer plans must already exist locally:
packages/designer/node_modules/.bin/tsx packages/designer/eval/vision-options-prepare.ts
packages/designer/node_modules/.bin/tsx packages/designer/eval/vision-options.ts
```

The renderer uses the installed Google Chrome executable on macOS. A production renderer should be
persistent and portable before self-check is enabled by default. Product previews are unavailable
if the catalog does not expose `show_candidates`; this is explicit, not a text-only fallback.

## Implementation limits and ownership handoff

[measured] Capturing the actual Avani viewport took 0.0251 s in 3D and 0.0295 s in SVG plan view
on this machine (one final observation each, no model tokens). The browser also rejected a stale
document and cancelled an outstanding capture. Evidence: `capture-check-static/checks.json` and both JPEGs
in the run directory. These are capture overheads, not network/model latency.

[derived] The product gate proves an identified contact sheet was delivered before an added SKU,
not that every tile contains a usable product or that the model made a correct aesthetic judgement.
Sergey's current response omits per-tile availability/provenance; a missing preview can be a white
numbered tile with a valid legend. The prompt treats a blank tile as unknown. Catalog handoff: add
`{id, preview_available, source: "model-render" | "shop-photo" | "missing"}` per tile so a strict
selection gate can reject unavailable images without guessing from pixels. This prototype does
not claim missing images are visually verified.

[measured] An initial smoke batch failed before model work because both a personal and isolated
workspace copy of `interior-design-rules` were enabled. Skill isolation now permits only the
request runtime's exact path. The failed smoke is excluded from the 105-request comparison; no
failed comparison request is replaced. No personal skill is copied back into the repository.

[derived] CHAT may enable `view` for appearance/deictic messages using `askDesigner`'s option;
selection IDs are supplied by its caller. QUALITY owns incomplete room programs and visual taste.
FAST's default model, effort, tools and context remain unchanged when options are absent. The
experiment uses full-flat standard views, not a controlled close-up camera/selection study; the
"THIS corner" request also names the chair and sofa, so it does not isolate ambiguous pointing.

## Verification and what remains unproven

[measured, merged code] `tsx packages/designer/eval/vision-options.ts --smoke 1` after the CHAT/FAST
rebase returned accepted snapshot and product proposals in **54.592 s / 70,695 tokens** and
**62.149 s / 89,452 tokens**. The self-check request withheld its proposal at **65.310 s total**;
its render/check stage stopped after **20.079 s**, before a review model started. This is a smoke
check under shared load, not a fourth repetition in the comparison.

[measured] Untargeted verification output (26 September 2026):

```text
VITEST_MAX_WORKERS=1 pnpm test                         exit 0
Designer: Test Files 83 passed; Tests 410 passed
Designer harness unittest: Ran 132 tests ... OK
Designer eval unittest: Ran 38 tests ... OK
Editor: all core, rendering, API and integration scripts ... Done
Showcase: 12 passed; tools: 7 passed
pnpm typecheck                                       exit 0 (all workspaces)
cd harness && uv run pytest -q tests                  54 passed
```

[measured] The unmodified `near_window uses the full span and away_from enforces an edge gap`
test exceeded its existing 5 s limit during high-concurrency verification. The complete suite
passed with one Vitest worker; no timeout, assertion, fixture or contract was weakened.

Definition-of-done audit: **DONE, 7 of 7**.

1. ✓ Task command: 105/105 trials recorded; original plans excluded; results and exact model/profile above.
2. ✓ Root test/typecheck output above; independent Python tests passed.
3. ✓ New capture, transport, preview, validation, review-budget, telemetry, skill-isolation and FAST-routing regressions.
4. ✓ No existing test, fixture, scene schema, constitution or personal skill was modified to pass a check.
5. ✓ Fresh read-only reviewer: **APPROVE**. Independently reran the untargeted suite (410 Designer, 132 harness, 38 eval, 12 showcase and editor checks) and all-workspace typecheck. Approval covers prototypes and the qualified report, not a general taste win.
6. ✓ Reconstructed second turn, missing render evidence, catalog outages, HMR/shared-load confounds and limits are explicit.
7. ✓ This lane owns the new vision adapter/module/eval files and minimal registrations; CHAT's message/delta handling and FAST's ordinary routing survive rebase. No main.ts or panel edits.

[not proven] General taste improvement; a complete two-turn makeover; bedroom furnishing quality;
close-up/deictic accuracy without a named object; vision on the new FAST selector; a production-ready
cached renderer; or customer preference in an independent human study. Developer-plan labels and
program understanding need a dedicated ground-truth evaluation. These remain limitations, not
successes inferred from editor acceptance.
