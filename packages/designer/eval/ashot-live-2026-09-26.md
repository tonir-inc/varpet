# Ashot live regression replay — 26 September 2026

[Measured] Code based on main `34c0c61`. Own editor `127.0.0.1:53121`, own designer `127.0.0.1:53120`, `VARPET_DESIGNER_FAST_PATH=1`, gpt-6-astra / low / compact-base. Catalog uses `http://localhost:8765/mcp`. Chrome opened **The Avani Apartment** through the portal. Protected ports 5180, 5190, 8787 and 8788 were not touched.

[Assumed] The first instant refusal in Ashot’s log was “Knock down the wall between the kitchen and the living room”. It bypassed request-history persistence, so its exact text is unavailable. The other nine request texts were recovered verbatim from conversation `79db1e8b77534447a62e78aed309088d` and its SDK history. “Paint the apartment red” was absent from that conversation and is reported as an extra check, not silently substituted into the sequence. Confirmation was requested.

[Measured] Each returned proposal entered preview mode, was applied, exported and undone; exported JSON after Undo exactly matched the prior scene. The bed proposal was redone to reproduce Ashot’s applied bed. Living-room proposals were left unapplied after checking them, retaining the nearly empty living room for requests 8–9. “Show me another option” was clicked in the browser, not replaced with a fabricated service request. Times below measure browser Send/chip to answer; they exclude review actions. Preview PASS means entry into the editor’s review state; settled 3D appearance was not graded in this replay.

## Causes and fixes

| Bug | Measured cause | Fix and regression |
|---|---|---|
| False no-sofa answer | Editor deliberately sends registered scene products; fast preparation treated them as the purchase universe. | Query requested kinds from the real catalog, map through `catalogProduct`, preserve registered identities. Bounded misses do not prove catalog absence. `ashot-live.test.ts` discovers furniture with an empty registered list and produces a complete checked proposal. |
| Another option edits old bed | Fast failures never entered the general SDK thread; a bare chip resumed its last successful task. | Bind to latest service request, preserve modifiers, vary search and exclude stored checked alternatives. `designer_ashot_live_test.py` checks successful bed → failed living furnishing → another option. |
| Empty proposal / unsolicited paint | No movable targets fell through to the general model; native propose accepted zero operations. | Direct empty-room answer offers furnishing, native gate rejects empty operations, service does not translate or send them. TS and Python regressions cover both boundaries. |
| Slow same-meaning requests | Exact narrow phrase rules missed destruction, double-bed bathroom feasibility and whole-flat colour. | Whole-message variants, conservative measured bed/access width proof, and all-wall paint scope. Tests include negation, compound requests, wide-room counterexample and a flat with only one windowed room. |

## Exact recovered sequence and answers

| # | Request | Browser seconds | Ashot service seconds¹ | Outcome / answer | Review |
|---:|---|---:|---:|---|---|
| 1 | Knock down the wall between the kitchen and the living room | 0.631 | 0.011¹ | decline: I cannot demolish structural walls. I can rearrange the furniture; consult a structural engineer about changing walls. | N/A — no proposal |
| 2 | destroy the wall between the kitchen and the other room | 0.638 | 8.871¹ | decline: I cannot demolish structural walls. I can rearrange the furniture; consult a structural engineer about changing walls. | N/A — no proposal |
| 3 | Put a double bed in the bathroom | 1.489 | 36.687¹ | message: A double bed cannot fit with usable side access: this room is only 1.6 m wide. A double bed of at least 1.35 × 1.8 m plus 0.60 m access on each side needs at least 1.8 m in its narrowest orientation, before walls and fixtures. Try the bedroom instead, or choose a smaller single piece. | N/A — no proposal |
| 4 | yes, try double bed in the bedroom instead | 37.832 | 40.201¹ | proposal: I’ve added a new bed to the bedroom. Catalog price: 219,000 ֏. The trade-off: 3.36 m² less open floor for the new furniture. | Preview / Apply / Undo PASS |
| 5 | Furnish the living room | 32.725 | 1.113¹ | proposal: I’ve added 2 new pieces to the living and dining area. Catalog price: 321,000 ֏. The trade-off: 1.71 m² less open floor for the new furniture. | Preview / Apply / Undo PASS |
| 6 | Show me another option | 24.504 | 20.657¹ | proposal: I’ve added 2 new pieces to the living and dining area. Catalog price: 321,000 ֏. The trade-off: 1.71 m² less open floor for the new furniture. | Preview / Apply / Undo PASS |
| 7 | furnish the living room | 26.888 | 1.063¹ | proposal: I’ve added 2 new pieces to the living and dining area. Catalog price: 321,000 ֏. The trade-off: 1.71 m² less open floor for the new furniture. | Preview / Apply / Undo PASS |
| 8 | Make the living room feel bigger | 1.976 | 20.969¹ | message: There is no movable furniture in the living room, so there is nothing to rearrange to gain floor space. I can furnish the living room with a sofa and table instead. | N/A — no proposal |
| 9 | Make the living room feel bigger | 1.468 | 26.743¹ | message: There is no movable furniture in the living room, so there is nothing to rearrange to gain floor space. I can furnish the living room with a sofa and table instead. | N/A — no proposal |
| 10 | make a sofa in the middle of the living room and Move the sofa so it faces the window | 61.916 | 57.390¹ | proposal: I’ve added a new sofa to the living and dining area. Catalog price: 254,000 ֏. The trade-off: 1.53 m² less open floor for the new furniture. | Preview / Apply / Undo PASS |
| 11 (extra) | Paint the apartment red | 3.003 | — | proposal: I’ve given 18 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls. | Preview / Apply / Undo PASS |
| 12 (extra) | Paint all walls red | 3.732 | — | proposal: I’ve given 18 wall sections a fresh colour, keeping the layout just as it is. No furniture purchases are needed. The trade-off: the colour covers both sides of each selected wall, including shared walls. | Preview / Apply / Undo PASS |

¹ Baseline seconds come from `/tmp/dsvc.log` service summaries, so compare them cautiously with browser timings. Baseline and replay were not simultaneous; catalog load changed. These ten cases are not enough to establish a general performance win.

[Measured] Ten-request browser total **190.067 s**, median **13.240 s**, nearest-rank p90 **37.832 s**, max **61.916 s**. Baseline service total **213.705 s**; this is not a like-for-like latency estimate.

[Measured] Another option differs from the preceding furnishing proposal: **True**. Both add living-room furniture; neither moves the bedroom bed.

## Live interruptions, not hidden failures

[Measured] Attempt 1 produced valid furnishing candidates, but the visual selector was interrupted at its 12-second cutoff. Both cached candidates passed the final proposal gate when checked directly. Image-bearing selection now has a 25-second budget; nonvisual selection remains at 12 seconds.

[Measured] Attempt 2 completed all ten requests plus both paint checks during a catalog slowdown. The bedroom request reported catalog unavailable (95.903 s); furnishing failed discovery (7.388 / 7.355 s); another option failed preview availability (20.836 s). Both empty-room replies were honest (1.388 / 1.403 s). The compound sofa proposal and both paint proposals passed Preview/Apply/Undo. Health took 4.771 s; `/editor/assets` timed out mid-body at 6.005 s. No catalog server or tunnel was restarted.

[Measured] After recovery, a direct service retry on the portal-exported Avani flat returned a checked two-piece furnishing proposal in **26.789 s**. The final browser replay above uses the live catalog, not recorded responses. Raw runs, exports and screenshots are retained in `/tmp/varpet-ashot-live/`; compact records are in [the JSON report](ashot-live-2026-09-26.json).

## Verification status

```text
New TypeScript regressions: 16 passed
New Python regressions: 5 passed
Fast-path suite: 13 files / 42 tests passed (before two added edge tests)
Root pnpm typecheck: exit 0
Fresh read-only reviewer: APPROVE (static review)
```

[Measured] The coordinator explicitly approved replacing obsolete empty-proposal expectations. Session, MCP persistence, HTTP, catalog-handoff and custom-build tests now assert an honest conversational outcome or tool rejection with no proposal ID, saved proposal or zero-operation command. Nonempty operations retain the previous persistence, streaming, asset-delivery and revision coverage. The first untargeted run exposed three additional obsolete MCP expectations (517 other TypeScript tests passed); those were updated under the same approval and all three focused checks passed.

Not proven: Ashot’s subjective satisfaction, the unsaved exact first request text, and behavior during an ongoing catalog outage. Prices are catalog mock prices, not shop quotations.

Definition-of-done audit: regression and live evidence recorded; source and test changes independently reviewed. No scene schema, committed fixtures or protected project rules changed. Approved obsolete tests were replaced with stronger negative and valid-operation coverage. Only the primary agent edited files; the reviewer was read-only. Final verification results are recorded below.

[Measured] Read-only report review APPROVE: timings, counts, distinct alternatives and all seven before/Undo JSON pairs independently checked. Owned test services were stopped and `lsof` found no listeners on 53120–53121.


[Measured] Final pre-rebase verification (26 September 2026): `VITEST_MAX_WORKERS=1 pnpm test` exited 0: designer 113 files / 520 TypeScript tests, 192 harness tests, 48 eval tests; editor 142 tests plus script checks; showcase 17 tests. Root `pnpm typecheck` exited 0. Logs: `/tmp/varpet-ashot-live/full-suite-green.log` and `typecheck-final.log`. Fresh read-only reviewer approved source, report and the final approved test updates. The browser timings above precede the final rebase; they are not a claim that the live replay ran against later main changes.
