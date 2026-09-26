# Should the Designer see the room?

[measured] 2026-09-26T11:06:04.344Z to 2026-09-26T11:13:22.648Z; gpt-6-astra **low / without-place / compact-base**. Seven requests × two conditions × two fresh-thread repetitions = 28 live HTTP runs. [Manifest](vision-runs/20260926T110604Z/manifest.json); [aggregate JSON](vision-runs/20260926T110604Z/summary.json).

[measured] Product base `206e3c6b25b2a4e34a63b3a1b10b97e91391f43b` plus the experimental image/collector patch. [Exact executed source files](vision-runs/20260926T110604Z/sources/) match the manifest SHA-256 hashes. Later CLI-default compatibility and collector-diagnostic changes do not rewrite these recorded trials.

[measured] Input images are screenshots of the running Avani editor on spare port **5193**, not generated pictures: [plan](vision-fixtures/avani-plan.png), [3D](vision-fixtures/avani-3d.png), [capture provenance](vision-fixtures/capture.json), [exact scene/catalog](vision-fixtures/editor-input.json). The grouped variant changes membership only; its visible geometry matches these images.

| Condition | Pass | Editor accepted / mutation requests | Median / max seconds | Median / max tokens | Token coverage |
|---|---:|---:|---:|---:|---:|
| text | 9/14 (64.3%) | 6/8 | 33.854 / 252.876 | 52,612 / 137,058 | 13/14 |
| images | 11/14 (78.6%) | 6/8 | 35.317 / 220.427 | 60,943 / 174,174 | 13/14 |

[measured] Seconds span HTTP submission through the final response (offline grading excluded); tokens are cumulative SDK totals including cached input, not estimated cost. One structural-decline run per condition hit the no-output watchdog before any token-usage event. Those runs count as failures and remain in latency statistics; their unavailable token counts are N/A and excluded from token medians/maxima. Default text-only prompt/profile and all physical/request gates stay unchanged. The image condition adds two SDK LocalImageInput values and a note that images are appearance context and JSON controls geometry.

[assumed] Each run starts at revision 0, with the normal demo payload and local immutable catalog, and approval only inside a disposable EditorStore. No product UI integration, model/bridge/store mock, north guess, new remote catalog loading, or post-proposal render is introduced. Live catalog prices carry mock provenance.

[derived] Seven scenarios comprise all three standing Avani rows plus reading-armchair, cozier, structural-decline and sofa/floor-compatibility requests. Existing Avani independent request/geometry checks plus real EditorStore acceptance grade the first three. The bigger-room proxy requires ≥0.10 m² more largest empty rectangle. Catalog additions must be editor accepted; any accepted row also requires manual armchair/window review. Cozier must ask. Structural work must be politely declined. Sofa/floor answer completeness is manually assessed against the rubric recorded before running: direct judgement, grounded reason, proportionate suggestion/caveat, no edits. An honest request for missing floor information is appropriate behavior but does not complete this visual question.

[derived] [Adjudications](vision-runs/20260926T110604Z/adjudications.json) keep raw automatic grades unchanged. Structural refusal wording is reviewed semantically because the inherited regex misses ‘but not wall demolition’. A plain conversational answer is transported as `decline` by the current service; this label is not counted as a semantic refusal for the sofa/floor question.

[derived] Keep production text-only by default. Offer opt-in images for appearance questions: both image runs directly answered sofa/floor compatibility, while both text runs correctly reported missing floor information. No observed editor-acceptance improvement: all six standing-suite proposals pass per condition, all catalog additions fail the same integration boundary. Colour and cozier explanations show no material gain; geometry outcomes do not establish an image advantage. The small sample and paired stalls do not support a latency claim.

| Look request | Text-only versus images |
|---|---|
| Sofa versus floor | Substantive, repeated difference. Text (2/2) knows sage sofa, beige rug and wood furniture but explicitly cannot confirm the floor. Images (2/2) identify warm pale beige floor in the render, explain muted-green contrast and the rug as a colour bridge, then suggest optional olive sage. The floor appearance is visibly present in the captured render. Hex suggestions are model design preferences, not measurements. |
| Exact blue wall | No substantive difference: all four explanations describe #3366cc on both faces/source-wall segments, preserve furniture/geometry/other colours and leave paint/labour unquoted. Images add no needed information to an exact colour instruction. |
| Make it cozier | No substantive difference: all four ask one clarification question and offer closer seating, warmer colours, or both. Image runs do not ground the options in a distinctive observed texture, material or lighting detail. |
| Living room feels bigger | Same basic explanation in both conditions: move seating toward the bottom wall to open the centre at zero purchase cost. Largest empty rectangle gains are text +2.205/+1.715 m² versus images +1.960/+2.205 m²; narrowest walkway delta is 0 in all four. Text run 1 explicitly mentions the coffee-table reach trade-off; images do not consistently improve explanatory substance. |
| Grouped move (control) | All four are accepted and preserve the group. Image moves are 0.6/1.0 m, versus text 0.4/0.4 m; empty-rectangle loss is larger with images (-1.225/-2.930 versus -0.245/-0.245 m²). The request did not require more floor area, so these remain passes, but they argue against claiming a general geometry win. |

[derived] Two runs per request are a directional experiment, not statistical evidence of a population-wide win. Counterbalanced order reduces simple ordering bias, but cache warmth, server load and concurrent work remain uncontrolled. Four requests run at a time with the production process-tree watchdog (180 s no output); a 600 s HTTP deadline cancels each request. Usage-limit stderr stops the batch. No failures were retried.

| Run | Outcome | Pass | Editor accepted | Seconds | Tokens | Evidence |
|---|---|---|---|---:|---:|---|
| avani-living-rearrange-text-1 | proposal | yes | true | 63.328 | 87796 | [result](vision-runs/20260926T110604Z/avani-living-rearrange-text-1.json), [HTTP](vision-runs/20260926T110604Z/avani-living-rearrange-text-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/avani-living-rearrange-text-1.events.jsonl) |
| avani-living-rearrange-images-1 | proposal | yes | true | 74.363 | 150076 | [result](vision-runs/20260926T110604Z/avani-living-rearrange-images-1.json), [HTTP](vision-runs/20260926T110604Z/avani-living-rearrange-images-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/avani-living-rearrange-images-1.events.jsonl) |
| avani-wall-blue-text-1 | proposal | yes | true | 40.086 | 64168 | [result](vision-runs/20260926T110604Z/avani-wall-blue-text-1.json), [HTTP](vision-runs/20260926T110604Z/avani-wall-blue-text-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/avani-wall-blue-text-1.events.jsonl) |
| avani-wall-blue-images-1 | proposal | yes | true | 37.756 | 74951 | [result](vision-runs/20260926T110604Z/avani-wall-blue-images-1.json), [HTTP](vision-runs/20260926T110604Z/avani-wall-blue-images-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/avani-wall-blue-images-1.events.jsonl) |
| avani-grouped-lounge-text-1 | proposal | yes | true | 30.903 | 52612 | [result](vision-runs/20260926T110604Z/avani-grouped-lounge-text-1.json), [HTTP](vision-runs/20260926T110604Z/avani-grouped-lounge-text-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/avani-grouped-lounge-text-1.events.jsonl) |
| avani-grouped-lounge-images-1 | proposal | yes | true | 30.293 | 60742 | [result](vision-runs/20260926T110604Z/avani-grouped-lounge-images-1.json), [HTTP](vision-runs/20260926T110604Z/avani-grouped-lounge-images-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/avani-grouped-lounge-images-1.events.jsonl) |
| catalog-text-1 | error | no | N/A | 36.805 | 66592 | [result](vision-runs/20260926T110604Z/catalog-text-1.json), [HTTP](vision-runs/20260926T110604Z/catalog-text-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/catalog-text-1.events.jsonl) |
| catalog-images-1 | error | no | N/A | 59.785 | 113980 | [result](vision-runs/20260926T110604Z/catalog-images-1.json), [HTTP](vision-runs/20260926T110604Z/catalog-images-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/catalog-images-1.events.jsonl) |
| question-text-1 | question | yes | N/A | 14.725 | 29519 | [result](vision-runs/20260926T110604Z/question-text-1.json), [HTTP](vision-runs/20260926T110604Z/question-text-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/question-text-1.events.jsonl) |
| question-images-1 | question | yes | N/A | 17.989 | 37581 | [result](vision-runs/20260926T110604Z/question-images-1.json), [HTTP](vision-runs/20260926T110604Z/question-images-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/question-images-1.events.jsonl) |
| decline-text-1 | decline | yes | N/A | 8.149 | 9678 | [result](vision-runs/20260926T110604Z/decline-text-1.json), [HTTP](vision-runs/20260926T110604Z/decline-text-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/decline-text-1.events.jsonl) |
| decline-images-1 | decline | yes | N/A | 12.875 | 12390 | [result](vision-runs/20260926T110604Z/decline-images-1.json), [HTTP](vision-runs/20260926T110604Z/decline-images-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/decline-images-1.events.jsonl) |
| sofa-floor-text-1 | decline | no | N/A | 11.308 | 9741 | [result](vision-runs/20260926T110604Z/sofa-floor-text-1.json), [HTTP](vision-runs/20260926T110604Z/sofa-floor-text-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/sofa-floor-text-1.events.jsonl) |
| sofa-floor-images-1 | decline | yes | N/A | 10.819 | 12433 | [result](vision-runs/20260926T110604Z/sofa-floor-images-1.json), [HTTP](vision-runs/20260926T110604Z/sofa-floor-images-1.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/sofa-floor-images-1.events.jsonl) |
| avani-living-rearrange-images-2 | proposal | yes | true | 57.536 | 174174 | [result](vision-runs/20260926T110604Z/avani-living-rearrange-images-2.json), [HTTP](vision-runs/20260926T110604Z/avani-living-rearrange-images-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/avani-living-rearrange-images-2.events.jsonl) |
| avani-living-rearrange-text-2 | proposal | yes | true | 83.184 | 137058 | [result](vision-runs/20260926T110604Z/avani-living-rearrange-text-2.json), [HTTP](vision-runs/20260926T110604Z/avani-living-rearrange-text-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/avani-living-rearrange-text-2.events.jsonl) |
| avani-wall-blue-images-2 | proposal | yes | true | 30.648 | 74893 | [result](vision-runs/20260926T110604Z/avani-wall-blue-images-2.json), [HTTP](vision-runs/20260926T110604Z/avani-wall-blue-images-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/avani-wall-blue-images-2.events.jsonl) |
| avani-wall-blue-text-2 | proposal | yes | true | 29.675 | 64152 | [result](vision-runs/20260926T110604Z/avani-wall-blue-text-2.json), [HTTP](vision-runs/20260926T110604Z/avani-wall-blue-text-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/avani-wall-blue-text-2.events.jsonl) |
| avani-grouped-lounge-images-2 | proposal | yes | true | 32.877 | 60943 | [result](vision-runs/20260926T110604Z/avani-grouped-lounge-images-2.json), [HTTP](vision-runs/20260926T110604Z/avani-grouped-lounge-images-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/avani-grouped-lounge-images-2.events.jsonl) |
| avani-grouped-lounge-text-2 | proposal | yes | true | 25.827 | 52612 | [result](vision-runs/20260926T110604Z/avani-grouped-lounge-text-2.json), [HTTP](vision-runs/20260926T110604Z/avani-grouped-lounge-text-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/avani-grouped-lounge-text-2.events.jsonl) |
| catalog-images-2 | error | no | N/A | 49.941 | 93946 | [result](vision-runs/20260926T110604Z/catalog-images-2.json), [HTTP](vision-runs/20260926T110604Z/catalog-images-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/catalog-images-2.events.jsonl) |
| catalog-text-2 | error | no | N/A | 252.876 | 81084 | [result](vision-runs/20260926T110604Z/catalog-text-2.json), [HTTP](vision-runs/20260926T110604Z/catalog-text-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/catalog-text-2.events.jsonl) |
| question-images-2 | question | yes | N/A | 18.675 | 37639 | [result](vision-runs/20260926T110604Z/question-images-2.json), [HTTP](vision-runs/20260926T110604Z/question-images-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/question-images-2.events.jsonl) |
| question-text-2 | question | yes | N/A | 18.271 | 29680 | [result](vision-runs/20260926T110604Z/question-text-2.json), [HTTP](vision-runs/20260926T110604Z/question-text-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/question-text-2.events.jsonl) |
| decline-images-2 | error | no | N/A | 187.646 | N/A | [result](vision-runs/20260926T110604Z/decline-images-2.json), [HTTP](vision-runs/20260926T110604Z/decline-images-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/decline-images-2.events.jsonl) |
| decline-text-2 | error | no | N/A | 190.681 | N/A | [result](vision-runs/20260926T110604Z/decline-text-2.json), [HTTP](vision-runs/20260926T110604Z/decline-text-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/decline-text-2.events.jsonl) |
| sofa-floor-images-2 | decline | yes | N/A | 220.427 | 12434 | [result](vision-runs/20260926T110604Z/sofa-floor-images-2.json), [HTTP](vision-runs/20260926T110604Z/sofa-floor-images-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/sofa-floor-images-2.events.jsonl) |
| sofa-floor-text-2 | decline | no | N/A | 43.220 | 9725 | [result](vision-runs/20260926T110604Z/sofa-floor-text-2.json), [HTTP](vision-runs/20260926T110604Z/sofa-floor-text-2.http.ndjson), [SDK/bridge](vision-runs/20260926T110604Z/sofa-floor-text-2.events.jsonl) |

Returned explanations (verbatim; these are model output, not benchmark assertions):

**avani-living-rearrange-text-1**

> Make the living room feel bigger at zero cost while retaining every piece. Consolidate seating toward the bottom wall and relocate the lamp along the left wall, opening the centre and improving circulation. All other rooms and dining furniture remain unchanged. Wider coffee-table spacing prioritizes sofa access over easy reach.

**avani-living-rearrange-images-1**

> Zero-cost preview to make the living room feel bigger: retain all furniture, consolidate seating at the bottom wall, enlarge the clear middle and improve seating access. Dining and other rooms unchanged.

**avani-wall-blue-text-1**

> Colour-only preview: living room west wall exactly #3366cc, on both faces and all segments sharing source_id wall-west. All furniture, positions, rotations, geometry and other colours unchanged. No furniture purchases. Paint and labour unquoted, with no colour-work budget specified. Requires customer acceptance.

**avani-wall-blue-images-1**

> Colour-only preview: living room west wall exactly #3366cc, including both faces and all segments sharing source_id wall-west. All furniture, geometry, positions, rotations and other colours unchanged. No purchases; paint and labour unquoted, with no colour-work budget specified. Requires customer acceptance.

**avani-grouped-lounge-text-1**

> Translate the living-group rug and lounge chair together 0.4 m toward positive y within the living room, preserving their relative arrangement and rotations. Retain every item and preserve all other furniture positions and rotations; buy nothing.

**avani-grouped-lounge-images-1**

> Translate the living-group rug and lounge chair together 0.6 m north without rotating, preserving their relative arrangement. Keep every item, buy nothing, and preserve positions and rotations of all other furniture. Preview for customer acceptance.

**catalog-text-1**

> Addition reading-armchair needs a real catalog asset ID in sku

[derived] Failure: Requires an editor-accepted furniture addition.; Addition reading-armchair needs a real catalog asset ID in sku

**catalog-images-1**

> Addition reading-armchair needs a real catalog asset ID in sku

[derived] Failure: Requires an editor-accepted furniture addition.; Addition reading-armchair needs a real catalog asset ID in sku

**question-text-1**

> How would you like to make it cozier?

Options: Rearrange the living-room seating into a closer conversation area—keep all furniture, no purchases.; Propose warmer wall or furniture colours—finish costs unquoted.; Combine a closer living-room seating arrangement with warmer colours.

**question-images-1**

> How would you like to make it cozier?

Options: A closer, more inviting living-room seating arrangement—keep all furniture, no purchases; Warmer wall colours—keep the furniture layout; Both seating changes and warmer colours

**decline-text-1**

> I can preview furniture layouts and wall colours, but not wall demolition; a qualified structural professional must assess that first. Instead, I can rearrange your existing furniture to improve flow between the kitchen and living room without removing the wall.

**decline-images-1**

> I can preview furniture layouts and colours, but not remove walls; a qualified structural professional would need to assess that change. Instead, I can rearrange the kitchen and living-room furniture to improve flow through the existing doorway, keeping all your pieces.

**sofa-floor-text-1**

> The sage sofa (`#889987`) works well with the warm beige rug and walnut furniture: its muted green adds gentle contrast while keeping the palette calm and earthy. However, the scene doesn’t include the floor’s colour or finish, so I can’t confirm the sofa–floor match.
>
> One optional small adjustment: a slightly warmer, olive-leaning sage (`#909B82`) could tie the sofa more closely to warm wood flooring, if that’s what you have.
>
> Nothing has been changed.

[derived] Failure: Honest and appropriate uncertainty, but the requested sofa/floor judgement is incomplete: the answer explicitly says floor colour/material is absent. It discusses the known rug and furniture and makes its wood-floor suggestion conditional.

**sofa-floor-images-1**

> Yes—the sage sofa works well with the floor’s warm, pale beige appearance in the render. Its muted green offers gentle contrast without looking stark, while the sandy rug helps connect the two.
>
> No adjustment is necessary. If you wanted a slightly warmer pairing, a more olive-leaning sage, such as **#8D987E**, would echo the floor’s golden tones.
>
> Nothing has been changed.

**avani-living-rearrange-images-2**

> Make the living room feel bigger at zero cost while retaining all pieces and leaving other rooms untouched: consolidate seating against the bottom wall, enlarging the central clear floor and improving seating access.

**avani-living-rearrange-text-2**

> Zero-cost rearrangement to make the living room feel bigger, retaining every item and leaving other rooms unchanged; open the central clear space and entry circulation.

**avani-wall-blue-images-2**

> Paint only the living room west source wall exactly #3366cc, including both faces. Preserve every piece of furniture, all positions and rotations, geometry and all other colours. No purchases. Paint and labour are unquoted, with no work budget specified. Checked preview for customer acceptance.

**avani-wall-blue-text-2**

> Preview only: colour the living room west wall exactly #3366cc, including both faces and all segments with source_id wall-west. All furniture, positions, rotations, geometry and other colours remain unchanged. No furniture purchases. Paint and labour are unquoted; customer acceptance required.

**avani-grouped-lounge-images-2**

> Translate the living-group chair and rug together 1 m in positive y within the living room, preserving their relative arrangement and rotations. Retain every item, preserve every other furniture position and rotation, and buy nothing.

**avani-grouped-lounge-text-2**

> Move living-group rigidly 0.4 m toward positive y within the living room, preserving the lounge chair and rug's relative arrangement and rotations. Retain every item, preserve all other furniture positions and rotations, and buy nothing.

**catalog-images-2**

> Addition reading-armchair needs a real catalog asset ID in sku

[derived] Failure: Requires an editor-accepted furniture addition.; Addition reading-armchair needs a real catalog asset ID in sku

**catalog-text-2**

> Addition reading-armchair needs a real catalog asset ID in sku

[derived] Failure: Requires an editor-accepted furniture addition.; Addition reading-armchair needs a real catalog asset ID in sku

**question-images-2**

> How would you like to make it cozier?

Options: Rearrange the living-room seating into a closer conversation area, keeping all furniture and spending nothing; Preview warmer wall and furniture colours, keeping the layout; Combine closer living-room seating with warmer colours

**question-text-2**

> What would feel cozier to you?

Options: A closer, more intimate living-room seating arrangement—keep all furniture, no purchases; Warmer wall or furniture colours—finish costs unquoted; Both seating changes and warmer colours

**decline-images-2**

> Designer process timed out waiting for output

[derived] Failure: Expected a polite structural-scope decline, received error: Designer process timed out waiting for output; Designer process timed out waiting for output; Model turn did not complete.

**decline-text-2**

> Designer process timed out waiting for output

[derived] Failure: Expected a polite structural-scope decline, received error: Designer process timed out waiting for output; Designer process timed out waiting for output; Model turn did not complete.

**sofa-floor-images-2**

> Yes—the muted sage sofa works well with the floor’s warm, pale beige appearance in the render. Its soft green provides gentle contrast without overpowering the floor, while the sandy rug bridges the two colours.
>
> No adjustment is necessary. If you wanted a slightly warmer pairing, a subtly more olive sage for the sofa, such as **#90977F**, would echo the floor’s golden undertone.
>
> Nothing has been changed.

**sofa-floor-text-2**

> The sage sofa works well with the beige rug and warm wood furniture: its muted green adds gentle contrast while keeping the palette earthy and calm. **The floor’s colour and material aren’t supplied**, so I can’t confirm the floor pairing itself.
>
> One optional adjustment: a slightly warmer, olive-leaning sage such as **#909A80** could tie the sofa more closely to warm-toned flooring, if that’s what you have.
>
> Nothing has been changed.

[derived] Failure: Honest and appropriate uncertainty, but the requested sofa/floor judgement is incomplete: the answer explicitly says floor colour/material is absent. It discusses the known rug and furniture and makes its wood-floor suggestion conditional.

Opt-in interface and reproduction:

```sh
pnpm --filter @varpet/editor dev --host 127.0.0.1 --port 5193 --strictPort
uv run --no-project --with playwright python packages/designer/eval/capture-vision.py
pnpm --filter @varpet/designer exec tsx eval/vision.ts < /dev/null
python3 packages/designer/eval/vision-report.py
# Independent experimental service; no image flag means text-only:
uv run --no-project --with openai-codex==0.157.1 python harness/designer_service.py --port 8793 \
  --image packages/designer/eval/vision-fixtures/avani-plan.png \
  --image packages/designer/eval/vision-fixtures/avani-3d.png
```

[measured] Harness `--image PATH` and service `--image PATH` are repeatable opt-ins (maximum two PNG/JPEG files, 10 MiB each). Service embeddings use `DesignerService(image_paths=[...])`; jobs carry `images`, and the worker attaches local images only when starting the thread. `view_image` stays disabled. Paths are trusted server-side configuration, not accepted from HTTP callers.

[derived] If implementing the appearance-only opt-in next: add an async snapshot function at the editor viewport boundary that returns plan and perspective PNG/JPEG blobs plus scene ID, revision, view label and dimensions. Capture after rendering the same frozen scene, hide selection/gizmos/overlays, and do not mutate live camera/scene state. Pass snapshots with that same scene/revision to the service only when requested. The current experimental service takes trusted local image_paths (or --image), writes their paths into job.images and the SDK worker consumes LocalImageInput on the first turn. A product endpoint would need bounded image bytes uploaded/staged to per-conversation files, never client-supplied filesystem paths, and a scene/revision match check. New first-turn snapshots require a fresh thread, or an explicitly designed refresh policy; this experiment does not establish stale-image behavior. Keep JSON as the geometry/check authority. Do not wire the UI yet.

[descoped] No changes to apps/editor/src/main.ts or apps/editor/src/ui/designer-panel.ts; no snapshot/upload/product wiring. Browser appearance is only tested for the initial captured fixture. Real cameras, arbitrary styles and repeated editing conversations are not evaluated.
