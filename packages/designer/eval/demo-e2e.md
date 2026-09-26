# M2: live editor demo end-to-end test

[measured] Source `06a5617465505e6a02b27a8f422d9d7af8a25aae`; model gpt-6-astra, medium; 3/5 passed. Started 2026-09-26T10:41:22.196Z; finished 2026-09-26T10:43:23.680Z.

[Manifest and source hashes](demo-e2e-runs/20260926T104122Z/manifest.json). [Exact editor demo snapshot](demo-e2e-runs/20260926T104122Z/editor-input.json).

[measured] Each exact request uses a fresh demo scene, revision 0 and conversation. Path: HTTP /designer/propose → production DesignerService → real harness/designer.py SDK thread → production MCP and bridge CLI → editor validateScene and EditorStore.execute(command, true). The eval wrapper only records subprocess output and saved proposals. No model, bridge, HTTP service or editor-store stub is used.

[assumed] Test approval applies only to an isolated in-memory editor store. The normal editor payload omits north, door swings, external catalog assets and catalogCurrency; the benchmark does likewise and does not invent them to make a request pass. Catalog endpoint comes from the existing laptop settings. At most four requests run concurrently, with a 180 s worker no-output watchdog and a 600 s HTTP deadline. No retries; individual failures are recorded and the remaining requests continue.

| Request | Outcome | Pass | Seconds | Tokens | Description / answer | Failure reason | Evidence |
|---|---|---|---:|---:|---|---|---|
| Make the living room feel bigger | error | no | 120.363 | 331823 | No editor proposal returned. | Expected proposal, received error: Editor rejected translated proposal: “Sage linen sofa” intersects wall “wall-north”. Move it clear of the wall or into a door opening. “Terracotta lounge chair” intersects wall “wall-west”. Move it clear of the wall or into a door opening. | [HTTP](demo-e2e-runs/20260926T104122Z/rearrange.http.ndjson), [SDK/bridge](demo-e2e-runs/20260926T104122Z/rearrange.events.jsonl), [result](demo-e2e-runs/20260926T104122Z/rearrange.json) |
| Paint the bedroom walls a soft sage green | proposal | yes | 47.800 | 160080 | Preview bedroom walls in Soft Sage #B7C4AE. Wall colour affects both faces and every segment sharing each source_id, so linked wall surfaces in the living/dining room, kitchen and bathroom also take this colour. Paint and labour are unquoted. Retain all furniture in its existing position and rotation. |  | [HTTP](demo-e2e-runs/20260926T104122Z/colour.http.ndjson), [SDK/bridge](demo-e2e-runs/20260926T104122Z/colour.events.jsonl), [result](demo-e2e-runs/20260926T104122Z/colour.json) |
| Add an armchair for reading by the window | error | no | 115.622 | 409438 | No editor proposal returned. | Expected proposal, received error: Addition reading-armchair needs a real catalog asset ID in sku | [HTTP](demo-e2e-runs/20260926T104122Z/catalog.http.ndjson), [SDK/bridge](demo-e2e-runs/20260926T104122Z/catalog.events.jsonl), [result](demo-e2e-runs/20260926T104122Z/catalog.json) |
| Make it cozier | question | yes | 24.825 | 44098 | What would make the room feel cozier to you? |  | [HTTP](demo-e2e-runs/20260926T104122Z/question.http.ndjson), [SDK/bridge](demo-e2e-runs/20260926T104122Z/question.events.jsonl), [result](demo-e2e-runs/20260926T104122Z/question.json) |
| Knock down the wall between the kitchen and living room | decline | yes | 11.991 | 14532 | I can’t remove walls or propose structural work, but I can help rearrange furniture to open up the route between your kitchen and living room, or coordinate their paint colours. |  | [HTTP](demo-e2e-runs/20260926T104122Z/decline.http.ndjson), [SDK/bridge](demo-e2e-runs/20260926T104122Z/decline.events.jsonl), [result](demo-e2e-runs/20260926T104122Z/decline.json) |

[measured] Seconds cover the HTTP request through editor store validation. Tokens are the last cumulative SDK total for that fresh thread (including cached input), not a billing estimate. Missing usage remains N/A. Proposal descriptions above are returned text, not benchmark claims. Every proposal result includes store acceptance and post-application validation; failed additions do not trigger a catalog or bridge workaround. Error rows returned no editor proposal or description; their saved Designer rationale remains in the SDK/bridge transcript.

[derived] Pass is the milestone criterion: store acceptance and valid resulting scene for requests 1–3; a question for request 4; a polite structural-scope decline for request 5. This is not a human judgement of colour or room aesthetics. Browser rendering is not tested.

[derived] The initial collector stored elapsed milliseconds under seconds. These five results were converted to seconds by dividing by 1000; each original measurement is retained as elapsed_ms. The original collector is archived as collector-source.ts.txt and matches its manifest hash. Raw HTTP/SDK/service logs are unchanged; no model calls were repeated. The collector now records seconds directly, covered by a regression test.

[measured] Catalog search returned three ABO products over the configured localhost tunnel. The saved addition selected abo:B075X4N515, which is absent from the editor-input.json local catalog; bridge translation rejected it. Returned AMD prices explicitly have mock provenance. The catalog backend and model were live; prices are not shop quotations.

Run from the repository root:

```sh
pnpm --filter @varpet/designer exec tsx eval/demo-e2e.ts
pnpm --filter @varpet/designer exec tsx eval/demo-e2e.ts --report eval/demo-e2e-runs/20260926T104122Z
```
