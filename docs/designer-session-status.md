# Designer cards 01–05

Measured: card 01 supplies the package, temporary scene adapter and nine-tool stdio server;
card 02 measures space and circulation; card 03 measures potential window sunlight;
card 04 finds checked placement candidates; card 05 checks, scores and stores proposals
only after the request check passes. Seven tools are implemented. `search_catalog` and
`ask` remain explicit error stubs for later cards.

Measured: the earlier card 04 draft test used a window longer than its narrow room.
Following Ashot's instruction to resume and resolve the issues, only the draft setup was
corrected; all assertions remain. Team commits `9fbab41` and `81e299c` separately updated
the contract guard and registered the MCP server. This lane did not bypass either refusal.
The configured launcher was exercised from `packages/designer`: nine tools listed and the
default bedroom summary succeeded. Real sessions select a scene with `VARPET_SCENE`.

## Verification and review

Measured output from repository-root checks:

```text
pnpm test: exit 0
Designer: 108 passed (23 files)
Hooks: 7 passed
Editor: Domain checks passed (265 assertions)
Engine: no test files found, exiting with code 0
pnpm typecheck: exit 0 (designer, engine, editor)
Configured MCP launcher: 9 tools; default bedroom summary succeeds.
```

Measured: card 05's required examples all pass in `test/session.test.ts`: a legal layout
missing the requested crib is refused with its kind named; a kept-item move is refused;
a valid rearrange returns an ID and before/after scores with more conservative raster
open floor and a larger free rectangle. The latter rotates a desk onto the grid; the
reported free-area gain is a raster effect, not a change in exact geometric floor area.
Root integration tests also exercise these tools over MCP. Full command output is pasted
in each card's commit body; local logs use `/tmp/varpet-card05-*`.

Measured: fresh reviewer `card05_review` returned APPROVE with no BLOCKER, HIGH or MEDIUM.
It independently ran root tests and typecheck. Prior reviews found and resolved concave
wall compass, compound-placement final rotation, and unbounded placement-search issues,
with regression tests. Publication and the final whole-lane review are reported separately
at the end of the session so this note does not claim a future push.

## Assumptions and remaining scope

Assumed pending engine integration: metres, x right/y plan-up, rotation counterclockwise,
front local -y; north_deg clockwise from plan-up. Before card 05, `packages/engine` still
exported an empty module. Notion's live Decisions page still required a shared convention
without supplying a concrete schema. Local checks explicitly report engine unavailability
and proposals identify their validation scope as the temporary designer scene.

Assumed: space uses conservative 5 cm occupancy and a 2.5 cm routing lattice; straight
approaches can conservatively reject an immediate turn. Sun uses fixed 2026 seasonal dates,
UTC+4, a 15 degree obstruction horizon and one-minute sampling. Full-window floor projections
are unoccluded and unclipped; furniture shadow and glare are not measured. Function-clearance
targets are soft guidance; circulation below 0.60 m is a hard error.

Decision: every add operation incurs its supplied whole-dram price; removal provides no
assumed refund, and unknown purchase prices fail. A missing budget is explicitly skipped.
Price authenticity awaits catalog integration. Proposals are in memory, tied to an immutable
scene fingerprint, and never applied. Acceptance, persistence, viewer/harness integration,
catalog lookup, the designer thread, explorers and scenario evals are outside cards 01–05.

Decision: stop at card 05 as requested. Next work is the next designer card and replacing
the adapter when the team's engine schema/check/price API lands.

## Definition of done for cards 01–05

DONE: 7 of 7
- 1 ✓ Card commands and required examples pass; proving output is in commit bodies.
- 2 ✓ Untargeted root test and typecheck output is recorded above and in commit bodies.
- 3 ✓ Tests were written first in each card; card 05 adds layout, request, strict-op,
  session and MCP integration cases in seven new test files.
- 4 ✓ No existing committed test, fixture, schema, constitution, hook or agent config was
  changed by this lane to make a check pass. New temporary types/fixtures arrived in card 01.
- 5 ✓ Fresh reviewer APPROVE; no unresolved BLOCKER/HIGH in card 05 or prior card reviews.
- 6 ✓ Assumptions, remaining stubs and unproven product integration are named above.
- 7 ✓ Exclusive file ownership: root adapter/server/session/local-checks, their tests and
  docs; space worker metrics/space.ts and space tests; sun/place/request worker their
  modules and tests; layout worker layout.ts, metrics/function.ts and layout tests.

Not proven: engine integration, viewer acceptance/application, persistent proposals,
authentic catalog prices, designer-thread/explorer execution, or scenario evals.
