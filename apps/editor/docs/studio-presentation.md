# Studio presentation verification

Verified 2026-09-26 after the user rejected the initial flat presentation. This record supersedes the first studio check.

The live editor now includes a 1.24 m deep charcoal pedestal, limestone cap and brass trim, dark slab floor, a softened gallery backdrop, warm spotlights and lamp illumination, contact ambient occlusion, wood/textile shading, and a lower presentation camera. Front openings follow cutaway walls; selecting an opening restores its host frames for editing.

Assumption: the reference guides the environment and lighting around the current apartment, whose layout and furniture remain the authoritative model. The result remains a real-time architectural visualization with procedural furniture; it does not reproduce the reference's detailed furniture or provide path-traced global illumination.

## Browser evidence

The primary agent inspected the live app at `http://127.0.0.1:5174/` in Chrome and Safari. Safari verification covered perspective cutaway, Top, Balanced-to-High quality, and full-width Preview. The final screenshot is `output/studio/preview-v2.png`; only browser chrome was cropped away. It shows the complete pedestal, warm lamp pool, contact shadows and continuous studio surround. Backdrop speckles observed during the iteration were absent after bounded shader arithmetic and background AO exclusion. View changes retained revision 0.

The in-app browser returned no warning/error logs and remains attached. Its screenshot/interaction capture was unreliable, so final visual evidence comes from Safari rather than a claim of successful in-app screenshot capture. The temporary browser viewport override was reset.

## Mechanical evidence

Untargeted root commands `pnpm typecheck` and `pnpm test` both exited 0. After final lighting/shader changes, `pnpm typecheck && pnpm --filter @varpet/editor build && git diff --check` also exited 0.

```text
packages/engine typecheck: Done
packages/designer typecheck: Done
apps/editor typecheck: Done
Designer: 36 test files, 159 tests passed
Designer Python harness: 43 tests, OK
Tools: 7 passed, 0 failed
Domain checks passed (265 assertions).
Renovation checks passed (102 assertions).
Reconstruction and handoff checks passed (29 assertions).
Opening clearance: 80 assertions passed.
Finish regressions passed: 92 assertions across 5 scenarios.
Placement conflict checks passed (345 assertions).
Wall movement checks passed (87 assertions).
Wall controller checks passed (411 assertions).
Grouping: 9 checks passed.
Plan movement checks passed (199 assertions).
Inspector regressions passed: 102 assertions across 10 scenarios.
Editor motion checks passed (52 assertions).
Transform motion checks passed (11 assertions).
Projection motion checks passed (14 assertions).
Vite: 72 modules transformed; built in 191ms.
```

The engine reports no test files. Vite retains its bundle-size advisory (1,084.31 kB JS / 299.13 kB gzip). No GPU performance or mobile coverage is claimed.

Fresh-context `studio_review` verdict: **APPROVE**. Temporary read-only checks produced:

```text
Cutaway opening review passed (23 assertions): perspective, Full, Top,
selected reveal, hidden precedence, animated transitions,
glass/shadow restoration, document immutability.
Final studio shader delta passed (10 headless assertions).
```

The rendering agent also checked DPR resize, quality switching, transparent/helper isolation, camera switching, render-state restoration, and one-time disposal. Furniture and stage modules passed isolated TypeScript and shader-hook checks before integration.

## Definition-of-done accounting

DONE: 5 of 7

- 1 ✓ Editor build passed and final GPU appearance was inspected and captured as recorded above.
- 2 ✓ Untargeted root tests and typecheck passed; counts are pasted above.
- 3 ✗ No permanent visual tests were added. The session instruction excludes tests for reversible low-impact visual changes; existing checks, temporary rendering assertions, and browser inspection were used.
- 4 ✓ This task changed no contracts, schemas, fixtures, or existing tests. The workspace diff also contains independent chats' changes, including AGENTS.md and tests; those are not claimed as this task's edits. `git diff --stat` and `git diff --check` were inspected, and unrelated edits were preserved.
- 5 ✓ Fresh-context `studio_review` approved both the integrated renderer and final shader changes; 33 temporary assertions passed.
- 6 ✓ The scope assumption and rendering limits are stated above. No requested environment/lighting feature was dropped.
- 7 ✗ Within this task, exclusive owners were `studio-stage.ts` (stage agent), `studio-renderer.ts` (pipeline agent), and `assets.ts`/`furniture-materials.ts` (furniture agent). The primary changed lighting, framing and integration in `viewport.ts`, the cutaway opening condition/signature in `structure.ts`, and rendering documentation. Reviewers wrote nothing. Independent chats also edited viewport/structure during the session, so repository-wide exclusive ownership cannot be proven; narrow patches preserved their motion/editing work.

Not proven: permanent automated visual regressions; exclusive file ownership across independent chats; measured GPU performance; mobile coverage; visual parity with the reference's detailed furniture.
