# Window resizing and matching

Verified 2026-09-26 with Codex (GPT-6).

Success criteria: resize one opening with an obvious Apply action; explicitly copy its applied height or width and height to other active windows; preserve target sill heights, offsets, mechanisms and frames; reject invalid batches atomically; undo each batch in one step.

Properties now puts **Apply to this window** directly below the dimensions. It becomes active when dimensions or frame/orientation fields change. No-op edits create no history. Rejected dimensions stay in the form so the person can correct them. Width and height use the existing 0.2 m domain minimum; precise values remain unrounded.

**Apply to other windows** offers **Match height** and **Match width & height**, each with the number of windows that would change. These actions use the selected window's applied dimensions and pause while it has a draft. Already matching windows, doors, removed windows and windows on removed walls are excluded. Locked changed targets block matching with an explanation; locks are never silently skipped. Copying a height does not align sills or window tops, and copying dimensions does not assert that these measurements describe the real apartment.

`core/window-dimensions.ts` produces existing `update-opening` operations, with explicit v1 migration where needed. One command retains normal fit/collision validation, revision checks, assumption invalidation and undo/redo. The structural-role confirmation dialog was temporarily removed at the user's request on 2026-09-27; edits now apply directly. A batch that exceeds the existing 100-operation limit is rejected. No scene schema or adapter contract changed.

Browser verification used a disposable M6 template on a separate local port, with HMR disabled to prevent unrelated editor work reloading the page:

- Initial M6 windows all had height 2.35 m; the height action showed Already matched.
- Changing the selected living south window to 2 m enabled Apply and disabled matching until applied.
- Existing structural-wall confirmation named the host; accepting committed revision 1.
- Match height named the other three affected walls in the existing review dialog. Accepting committed revision 2 and showed Already matched.
- One Undo restored the other three heights, re-enabled Match height for three windows and advanced to revision 3.
- The independent DOM checks exercised numeric-equivalent and negative-zero input, frame-only edits, retained rejected drafts, lock errors, removed exclusions, matching counts, both copy modes and undo/redo.

Command output:

```text
pnpm test
packages/designer: Test Files 112 passed; Tests 504 passed
packages/designer: Ran 183 tests; OK
packages/designer: Ran 48 tests; OK
apps/showcase: tests 17; pass 17; fail 0
apps/editor: Window dimension checks passed: 75 assertions across 9 scenarios.
apps/editor: Done
exit 0

pnpm typecheck
packages/engine: Done
packages/designer: Done
apps/showcase: Done
apps/editor: Done
exit 0

pnpm --filter @varpet/editor build
exit 0

Browser /inspector-options-qa.html
Inspector DOM checks passed: 16 assertions.
Window resize DOM checks passed: 74 assertions across 10 scenarios.

git diff --check
exit 0
```

Fresh review found a negative-zero draft mismatch; using the same numeric equality as submission fixed it and a browser regression covers it. Existing Vite import-extension and bundle-size advisories remain. Screenshot capture was unavailable, so verification establishes browser interaction and DOM behavior, not screenshot-based visual QA. Notion access timed out and no connector was available; these local notes record the decision. The referenced definition-of-done skill was absent from repository and local skill directories. Unrelated concurrent editor changes were preserved.
