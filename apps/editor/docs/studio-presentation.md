# Studio presentation verification

Verified 2026-09-26. The requested presentation is implemented in the live 3D editor: a fitted charcoal pedestal with limestone cap and brass trim, a dark studio floor with procedural light falloff and contact shadow, warm key light with cool fill/rim, and camera framing that includes the base.

Assumption: the reference specifies the presentation environment and lighting for the current apartment; the apartment geometry, furnishings, and authoritative project data remain the source of the model. Photorealistic furniture replacement and path tracing are outside this task.

## Browser evidence

Native Arc displayed the final scene at `http://127.0.0.1:5174/`. Visual review covered the initial perspective, Top view, Balanced-to-High quality switching, and full-width Preview. The entire pedestal fits in the frame. The floor shader renders successfully. The view changes retained revision 0. The task's in-app browser also opened High quality Preview and returned no warning/error console entries. It remains open for inspection.

## Mechanical evidence

Fresh root command, exit 0:

```text
pnpm typecheck && pnpm test && pnpm --filter @varpet/editor build && git diff --check

packages/engine typecheck: Done
packages/designer typecheck: Done
apps/editor typecheck: Done
Designer: 33 test files, 144 tests passed
Designer Python harness: 11 tests, OK
Tools: 7 passed, 0 failed
Domain checks passed (265 assertions).
Renovation checks passed (102 assertions).
Reconstruction and handoff checks passed (29 assertions).
Opening clearance: 80 assertions passed.
Finish regressions passed: 92 assertions across 5 scenarios.
Vite: 50 modules transformed; built in 182ms.
```

The engine reports no test files. Vite retains its bundle-size advisory (998.09 kB JS / 275.01 kB gzip). This task makes no GPU performance, mobile, or cross-browser certification claim.

## Definition-of-done accounting

DONE: 5 of 7

- 1 ✓ Editor production build passed, and the final GPU-rendered appearance was visually inspected as recorded above.
- 2 ✓ Untargeted root typecheck and tests passed; exact counts are recorded above.
- 3 ✗ No permanent tests were added for this reversible visual change. Existing checks, direct browser verification, and the reviewer's temporary stage assertions were used. This follows the session instruction not to add tests for reversible, low-impact changes.
- 4 ✓ This task changed no contracts, schemas, fixtures, or existing tests. Its source changes were limited to `src/render/studio-stage.ts`, the lighting/stage/framing portions of `src/render/viewport.ts`, canvas colors in `src/ui/style.css`, and rendering documentation. Concurrent work was preserved.
- 5 ✓ Fresh-context `reviewer` verdict: APPROVE. Read-only stage assertions covered origin/off-origin/elevated bounds, underside contact, non-pickability, geometry reuse, shader insertion, and idempotent disposal. Browser GPU compilation was subsequently checked by the primary agent.
- 6 ✓ Scope assumption and exclusions are stated above.
- 7 ✗ Within this task, the stage agent exclusively wrote `studio-stage.ts`; the primary wrote `viewport.ts`, `style.css`, `rendering.md`, and this record; reviewers did not edit. Separate ongoing chats also changed `viewport.ts` during the session, so repository-wide exclusive ownership cannot be claimed. No overlapping lighting/stage changes were observed or overwritten.

Not proven: permanent automated visual regressions; exclusive file ownership across independent chats; performance/mobile coverage.
