## What changed on latest main — measured 26 September 2026 UTC

The matched Avani/Komitas cohort improves from **35/72 to 46/72 Tier 2 passes** (derived: 48.6% → 63.9%). **Complete golden paths remain 0/3 on each flat.** Avani now applies the living proposal 3/3, but all three are incomplete against the requested living-room program. Editor acceptance is **27/27 → 28/28** returned proposals, not proof of request completion. The added Balcony Apartment cohort scores **11/36 Tier 2**, **0/3 golden**, and returns no proposals.

| Request-only metric, matched 96 turns | Before aa87b09 | After d2d7966 |
|---|---:|---:|
| Median / max seconds | 18.503 / 134.623 | 8.200 / 113.776 |
| Median / max tokens | 33,165 / 246,197 | 0 / 155,004 |
| Total tokens, including cached input | 4,244,661 | 1,845,923 |
| Error outcomes | 12 | 0 |

Derived: the matched cohort uses **56.5% fewer total tokens**. This is a measured three-repeat comparison on the same machine/profile, not a reliability or causal performance guarantee. The new Balcony cohort is excluded from those deltas: its 48 requests have median/max **9.099/19.483 s**, median/max **9,525.5/14,160 tokens**, total **460,551 tokens**. All 144 current turns together use 2,306,474 tokens.

| Remaining cause | Measured result / concrete evidence |
|---|---|
| Incomplete or unavailable furnishing | Komitas living and both flats' bedroom requests return no checked layout in every repeat. Avani living applies two pieces (sofa and console), but omits the rug, coffee table and lamp and fails the facing rule. [Actual Avani state](acceptance-runs/20260926T163635Z/geometry/d57a8abb817a6027.png). These are real purchases, but not a furnished-home success. |
| Golden conversation does not finish the layout | All six matched “cozier” turns ask a question rather than making the requested edit. All “why” replies fail the requirement for verifiable placement numbers. All quotes fail price/shop coverage; Avani explicitly calls the prices unknown even though its preceding proposal displayed a catalog total. Failed furnishing also leaves Komitas without a sofa for subsequent requests. |
| Balcony geometry disables checked editing | The portal's actual `m6` template opens 3/3, but all 48 requests produce conversation or refusal, never an edit. The service says it cannot check/change the layout until geometry is supported; recorded worker audits show layout MCP disabled. [Actual Balcony shell](acceptance-runs/20260926T163635Z/geometry/be9be4ef68476284.png). Its empty-room replies refer to furniture details missing from the snapshot rather than honestly establishing that it is empty. |
| Coverage and specificity gaps | Komitas apartment-red still misses five sections (`bath_north_step`, `column_north`, `bed_north:section-1jygvqk`, `column_south`, `column_south:section-qyw8eq`). Its bathroom-bed refusal and follow-up return generic bounded-search failure copy, without the required bed/bathroom-specific answer. |
| Some single-piece requests still vary | Komitas armchair and desk improve from 2/3 each to 3/3 each; Avani regresses from 3/3 each to 2/3 each. The maximum current matched turn is a Komitas armchair at 113.776 s. No unsuccessful repeat was removed. |

**Measured improvements.** The 12 old bigger-room exceptions disappear. All six matched empty-room requests now give an honest unchanged-scene explanation. Avani sofa-to-window improves 0/3 → 3/3, and fast bathroom refusal improves 0/3 → 3/3. Named paint, minimalist advice and structural decline remain 3/3 on both original flats. Balcony bathroom refusal is 2/3 only because one takes **10.063 s**, beyond the predeclared **10 s** threshold; its honesty is not failed on that row.

**Provenance and grading audit.** Product code stayed at `d2d7966` throughout all model calls; this includes HOTFIX `34c24c1` and the later QUALITY commits. Live runner source is `a74d92f`; exact runtime scripts and input hashes are saved. [Evidence audit](acceptance-runs/20260926T163635Z/evidence-audit.json) verifies 144 raw HTTP/telemetry matches, all fast-path/profile flags, immutable original grades, 171 UI screenshots and 171 supplemental top-view mappings (30 unique rendered states, zero capture errors). All 28 proposals were applied through the real UI and changed the exported store state. No response or catalog is stubbed.

The only post-run scoring change recognizes **“no movable furniture”** as an honest empty-room explanation. A failing counterexample and error/changed-scene negatives precede the fix. It changes six current scores; all 96 earlier baseline scores reproduce unchanged under the same corrected grader ([baseline recheck](acceptance-runs/20260926T163635Z/baseline-recheck.json), [six corrections](acceptance-runs/20260926T163635Z/grading-audit.json)). Original `run.json`, timings, replies, scenes and screenshots remain untouched. Raw command output is 63/171; audited output is **69/171**, including 12 open/Apply steps, not 69 successful customer requests.

Run **`pnpm acceptance --include-balcony`** to repeat this exact three-flat cohort, three runs per step. Both private ports were verified closed after capture. [Verification and push-rule evidence](acceptance-verification.md). Human screenshot/explanation signoff remains pending; neither the golden target nor ten-repeat reliability is certified.
