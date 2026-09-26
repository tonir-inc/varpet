# Inside view framing

2026-09-26, Codex (GPT-6). The owner (178 cm tall) reported feeling too tall and
wide in Inside view compared with their apartment photo. At the supplied screenshot's
approximately 1.20 canvas aspect, the standard lens showed only 74.8° horizontally.

The editor now defaults to **Photo** and offers **Standard**, **Photo**, and **Extra
wide** beside the 1.65 m eye-height label. The browser remembers this presentation
preference under `varpet.inside-lens.v1`; unavailable or invalid storage falls back
to Photo. Changing the lens never edits the scene, history, camera pose, collision
body, or exterior view. Resize reapplies the selected preset.

| Preset | Vertical cap | Horizontal cap | Horizontal at aspect 1.20 |
| --- | ---: | ---: | ---: |
| Standard | 65° | 95° | 74.8° |
| Photo | 80° | 95° | 90.4° |
| Extra wide | 85° | 105° | 95.4° |

These are adjustable framing approximations, not recovered phone intrinsics. The
source photo's exact lens, camera position and phone height are unknown. The
apartment's 2.8 m ceiling remains explicitly unverified in its scene assumptions.

`FinishViewport.setInsideLens` is renderer-local. The two-argument
`configureInsideCamera` and a standalone `createViewport` retain Standard for
existing consumers; the editor applies its saved/default preference explicitly.
No existing tests, fixtures or schemas were edited. New tests project fixed wall
landmarks through each lens to verify the actual visible coverage, and check
resize, pose preservation and safe invalid-input handling.

## Verification

```text
node --test apps/editor/tests/inside-lens.test.mjs
tests 5; pass 5; fail 0

npx --yes pnpm@10.0.0 test
packages/designer: Test Files 112 passed; Tests 504 passed
packages/designer: Ran 183 tests; Ran 48 tests; OK
apps/editor: Walkthrough camera checks passed (98 assertions).
apps/editor: tests 147; pass 147; fail 0
exit 0

npx --yes pnpm@10.0.0 typecheck
all workspace packages passed; exit 0

npx --yes pnpm@10.0.0 --filter @varpet/editor build
161 modules transformed; built in 515 ms; exit 0
Existing Vite config-loader and chunk-size advisories remain.
```

In-app browser on the M6 template verified Photo by default, Extra wide selection,
Extra wide restoration after reload, and restoration to Photo. The scene stayed
at revision 0 with Undo disabled. DOM bounds verified the lens control below Sky
without overlap at a 608 px canvas width. The phone viewport override was clamped
by the browser backend, so phone layout is statically reviewed only.

Screenshot capture was unavailable and Chrome tab creation timed out; subjective
photo likeness is not claimed. Notion access also timed out, so this local note
records the changed contract. The referenced definition-of-done skill is absent
from the repository and installed skill roots; the documented full repository
checks and an independent review were used.

After integration into the primary workspace, the untargeted test and typecheck
commands passed again (editor: 147 tests, plus existing check scripts including
75 window-dimension assertions). The running editor on localhost:5173 also
showed Photo selected in Inside view at scene revision 0.
