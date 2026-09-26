# Designer stream observations — 26 September 2026

[Measured] The contract and composite recording shipped first as `e724f1a`. The runtime uses
PICTURE's `f2f4dd2` controller states unchanged: queued, building, fixing, done and failed.
`events:true` adds nonterminal tool/build NDJSON lines; omitted/false keeps the prior wire format.

[Derived audit] The work addressed five problems in this narrow progress surface: generic waiting
hid useful work, build lines could be mistaken for terminal replies, raw SDK payloads were unsuitable
for customers, custom GLBs needed a bounded delivery path, and quotes without provenance looked
confirmed. The final implementation projects allowlisted fields, validates every event, labels
unverified prices and keeps proposal approval explicit. Paint-only changes do not claim placement.
Existing styles, controls, IDs and keyboard behavior are retained.

[Measured browser replay] Browser-plugin checks ran on spare port 5354, with no service URLs or
model call. The isolated page mounts the production panel. “Before” replays legacy waiting text;
“after” replays PICTURE's recorded building state. These are transport/UI demonstrations, not a
new live generation or evidence of cabinet likeness. The sample's independent recordings and
reconstructed reserve-slot result are described in `docs/designer-service.md`.

| Size | Legacy progress | Typed build progress |
| --- | --- | --- |
| 1440 × 900 | [Before](events-before-1440.png) | [After](events-after-1440.png) |
| 1280 × 800 | [Before](events-before-1280.png) | [After](events-after-1280.png) |
| 390 × 844 | [Before](events-before-390.png) | [After](events-after-390.png) |

[Measured] Enter submits, Shift+Enter preserves a newline, build state and failure reason appear,
Cancel stops progress, late events cannot revive it, and the final captures have no horizontal
overflow at all three sizes. The temporary overflow came from the isolated QA page's side label;
the narrow fixture now hides that label. Wide and narrow screenshots were visually inspected.
Reproduce with `apps/editor/tests/designer-events-qa.html`.

[Measured existing limitation] `designer-notes-qa.html` reports “Approval controls preserved” as a
failure because its assertion counts follow-up suggestion buttons as approval controls. This
pre-existing assertion was left unchanged; no claim is made that every historical manual QA page
passes. The production Preview / Apply / Dismiss controls were not edited.

[Measured tests] New tests are `harness/designer_events_test.py` and
`apps/editor/tests/designer-events.test.mjs`. They cover opt-in/default compatibility, real SDK
result shapes, tool errors, payload projection, real BuildPool callbacks with an injected builder,
HTTP nonterminal records, scoped GLB delivery, split network chunks arriving before the final reply,
the actual chat HTTP wrapper, malformed records without callbacks, checked assets and sample replay.
Initial failing runs demonstrated the missing behaviors before the fixes.

[Measured review] Fresh read-only review `/root/designer_events_review`: **APPROVE**, after fixes
for wrapper forwarding and callback-independent validation. Parent ran verification independently.
No existing test, scene fixture, schema or EditorStore contract was changed. CHAT owned the event
projection, HTTP boundary, adapter, panel wiring, tests and this note; PICTURE's controller was
rebased from main before its callback was connected.

[Not proven] This pass does not establish a new real-model custom-build conversation, likeness,
or production deployment. The recorded sample explicitly combines separate measured designer and
builder recordings. Existing builder lifecycle tests cover cancellation and failed grey assets.

## Verification evidence

[Measured, 2026-09-26 18:10 +04] `VITEST_MAX_WORKERS=1 pnpm test` exited 0:

```text
designer: Test Files 102 passed; Tests 475 passed
designer Python: Ran 169 tests; OK
designer eval Python: Ran 45 tests; OK
showcase: tests 12; pass 12; fail 0
editor server: tests 24; pass 24; fail 0
editor: tests 131; pass 131; fail 0
editor scripted assertion checks: passed
```

That is 856 named tests plus the editor's scripted assertions. `pnpm typecheck` exited 0 for all
workspaces; `pnpm --filter @varpet/editor build` exited 0 (`built in 269ms`, existing chunk-size
advisory). The first suite attempt could not import the newly landed `gltf-validator` dependency;
`pnpm install --frozen-lockfile` installed it without changing the lockfile, then the full suite passed.
After the final rebase, the push gate is typecheck plus designer Python and editor designer tests,
per Ashot's push rule; no further full-suite rerun is required for an unchanged event implementation.

DONE: 7 of 7 for this event integration: proving tests above; untargeted suite/typecheck;
new positive/negative/boundary tests; no protected contract or old test weakened; fresh APPROVE;
replay and deployment limits stated; separate ownership and PICTURE rebase recorded above.
