# Space hand tool

2026-09-26, Codex (GPT-6).

Hold Space over the focused canvas, then drag with the primary mouse button to pan
in 3D, Top, or Plan. The cursor changes immediately to an open hand, then a closed
hand during the drag. In 3D and Top, movement calls the same OrbitControls pan
operation as right-drag. Plan translates its existing SVG view. Neither changes
scene data or history. The Inside walking controls keep their existing behavior.

The hand takes precedence over selection, furniture movement, wall/window handles,
and finish painting. Space still types in text fields and activates focused buttons
(including accessible Plan entities). Releasing Space, losing focus, hiding the
document, cancellation, and view changes clear the hand. Pointer capture keeps a
drag continuous outside the view. Direct movement and cursor feedback are immediate,
including reduced motion; merely holding Space requests no render loop.

`render/hand-pan.ts` handles shared key/pointer ownership. Its window capture handlers
run before finish painting and transform picking. Keep its active interaction state
separate from OrbitControls: a wheel gesture can start/end while a hand drag continues.

Command verification:

```text
VITEST_MAX_WORKERS=2 pnpm test
packages/designer: Test Files 123 passed; Tests 551 passed
packages/designer: Ran 197 tests; OK; Ran 81 tests; OK
apps/showcase: tests 17; pass 17; fail 0
apps/buyer: tests 10; pass 10; fail 0
apps/editor: domain, renovation, navigation and rendering checks passed
apps/editor: integration tests 182; pass 182; fail 0; Done
exit 0

pnpm typecheck
packages/engine, packages/designer, apps/showcase, apps/buyer, apps/editor: Done
exit 0

pnpm --filter @varpet/editor test:renovation
Renovation checks passed (102 assertions).
Reconstruction and handoff checks passed (29 assertions).

pnpm --filter @varpet/editor test:plan
Plan movement checks passed (283 assertions).

pnpm --filter @varpet/editor build
Production build passed; existing bundle-size advisory remains.

git diff --check
exit 0
```

Native Chrome verification passed **32/32 checks**, with zero browser exceptions.
Equal pointer drags produced equal 3D/Top camera movement to floating-point precision.
The probe exercised hand cursors, selected-object protection, stationary Space clicks,
finish painting protection and normal painting after release, early key release,
native tab blur, typing/button activation, wheel zoom during a hand drag, normal
orbit/selection, and Plan panning/selection. The real 3D, Top and Plan screenshots
were inspected. Reproducible probe sources, JSON results and screenshots are in
`output/hand-pan-verification/`. The isolated browser and Vite server were closed.
Other browsers and physical touch devices were not tested.

Fresh-context code review: APPROVE. Existing tests, fixtures and contracts were not
changed for this gesture. Shared-main work was preserved; fetched remote changes
were reviewed, with synchronization deferred under the editor coordination rule.
Notion tools and the repository's referenced definition-of-done skill were unavailable;
this page records the behavior and verification locally.
