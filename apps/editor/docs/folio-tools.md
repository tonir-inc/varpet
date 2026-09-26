# Manual tools in Folio

Restored on 26 September 2026. The Folio layout uses the existing checked commands,
catalog placement, scene document and history; no scene contract changed.

- **Sandbox** in the landing navigation opens `/?editor=sandbox`. Bare `?editor`
  remains compatible. Both start the unfurnished local shell without an account
  request; Save and Files → Load saved scene use device storage. The editor's
  Sandbox link opens a separate tab so the current project stays open.
- **Add furniture** opens Furniture on the right, even when another panel is open.
  Click a catalog card to place a product or drag it onto the floor. Clicking Add
  again closes the Furniture drawer. Placement keeps it open for the next piece;
  Properties replaces it only when explicitly opened. Designer stays on the left
  on desktop; on small screens it steps aside while the library is open.
  Catalog unavailability retains Retry and its
  existing error message; there are no invented fallback products.
- The top tool row restores Select, Move, Rotate, Resize, multi-selection, framing,
  snapping and one Selection properties toggle. Selecting a different item opens
  Properties consistently for furniture and structural elements. Toggling or
  closing Properties preserves selection; refreshes do not reopen a closed panel.
  Properties contains only the current selection. Other general tools occupy the left
  workspace and temporarily replace Designer; closing them restores the conversation.
  The costs button opens a centered dialog instead of another right drawer.
- **Sun** opens above the bottom dock, scrolls within available space and supports
  time presets, direction, intensity and automatic room lights. **Lighting off/on**
  is reachable in Top view; turning it on exposes Sun there too. Sun is temporary
  view state. Escape closes the panel and returns focus to its trigger.
- More retains the scene list, materials, ceilings, renovation, proposals, wall
  visibility, rendering quality, project files, connections and keyboard help.
  Preview has a dock button with an explicit Exit preview state. Preview and
  Inside keep editing tools hidden.

## Regression traps

Moving a popover trigger to the bottom requires changing its placement calculation;
placing Sun below the dock reduced its usable height almost to zero. Hiding the
old view-options container also hid the prerequisite Top lighting switch. Move
the real controls rather than replacing their event wiring.

Do not derive inspector visibility from selection type or open tools: structural
entities and furniture use the same explicit open state. Selection camera reveal
waits for closing a sidebar to resize the canvas, then reserves the space beside
the floating card and between the editing row and bottom dock. Use layout offsets
to exclude the card's entrance animation. Inspector rerenders must not reopen
Properties after the person closes it. Revealing Designer must close the left
tool panel first; a recorded reply must keep its conversation visible.

## Verification

26 September 2026, Codex GPT-6 session. Shared main contained concurrent editor
work, which was preserved. No tests, fixtures or schema were changed for this task.
The requested definition-of-done skill and Notion connector were unavailable;
this document records the local verification and handoff.

```
VITEST_MAX_WORKERS=1 pnpm test       # exit 0, all workspace suites
pnpm typecheck                     # exit 0, all workspace projects
pnpm --filter @varpet/editor build  # exit 0
pnpm --filter @varpet/editor test:renovation
git diff --check                    # exit 0
```

The sunlight subtask also passed all 15 existing sun-compass DOM checks, and
Sandbox routing passed the 15 existing apartment-portal tests. Production-build
Chrome checks used a spare local port and the already-running catalog tunnel:

- Scene → Add furniture opens the library in one click; a real ABO product was
  added, moved, rotated and resized. Resize undo/redo restored 0.36/0.45 m width.
- Wall height 2.7 → 2.8 m and window width 2.4 → 2.3 m used the existing structural
  correction dialog; Undo restored their original dimensions.
- Night/Noon presets, advanced sun controls, Top lighting and preview/Inside
  editing visibility worked. A 390 × 844 viewport kept the toolbar/dock visible
  and Sun scrollable; Escape restored focus. The viewport override was reset.
- Sandbox portal entry, local Save, reload and Files → Load saved scene worked on
  a separate origin, preserving existing browser saves.

Screenshot: `output/ui-restoration/restored-tools.png`. A fresh read-only review
approved the restoration changes. Existing Vite chunk-size/config-loader warnings
remain; build success does not claim those warnings were addressed.

The single-sidebar follow-up passed the same commands (including 102 renovation
and 29 reconstruction/handoff assertions). Chrome checks confirmed Furniture stays
open on room selection and product placement, explicit Properties replaces it,
and the inspector is docked on desktop and a bottom sheet at 390 × 844. A fresh
read-only review approved the follow-up. Screenshot:
`output/ui-restoration/single-sidebar.png`.

The subsequent selection-view adjustment restores the floating Properties card
while retaining the mutual exclusion above. Desktop and 390 × 844 Chrome checks
covered room selection, framing, switching between Furniture and Properties, and
preview visibility. The viewport override was reset. Full workspace tests,
typecheck and production build passed; fresh read-only review approved the adjustment. Screenshot:
`output/ui-restoration/floating-selection.png`.

## Blueprint workspace and furniture panel, 27 September 2026

The blueprint ground is now the default for every editor entry, including direct
editor/sandbox links, saved apartments and read-only shared progress. The optional
construction presentation still supplies its paper colour, camera and arrival.
There is no fallback to the old studio pedestal in these entry points.

The right library reuses the catalog cards, search, category filtering, thumbnails
and checked placement commands. Opening it hides Properties; adding a piece keeps
the library open and frames the selection beside it. The close button, Escape
inside the library and shortcut 2 retain the existing panel controls. Its fade
keeps thumbnail rectangles fixed and respects reduced motion. The catalog clears
the top editing row; below 900 px, the designer sheet steps aside to preserve room
for the catalog list and scene.

Browser verification used the real catalog through the existing SSH tunnel on a
separate local preview origin. Click-add, Undo, explicit Properties switching,
close/reopen, Escape and shortcut 2 passed. Layout checked at 1200, 1024 and 390 px;
the 390 px library measured 280 × 586 px. The existing furniture-drop QA page
completed 26 checks covering placement, exact-once commits, undo/redo, invalid
floors, cancellation, detached cards and click suppression. The UI automation's
native drag gesture did not complete a drop; native dragging was not re-proven.
Screenshot: `output/furniture-panel/blueprint-library.png`.

The untargeted run exposed an existing blueprint rejection test dependency issue:
presentation constants pulled account/catalog persistence into the landing.
`portal/blueprint-presentation.ts` now owns the lightweight constants/types;
`session.ts` re-exports them for compatibility. Renderer startup failure also
keeps independent architect validation alive, so a late invalid-plan rejection
can still reset the landing. Back, new uploads, retry and disposal cancel it.
The four existing rejection tests pass without test or schema changes.

Final verification (Codex GPT-6, 27 September 2026):

```text
pnpm test                         # exit 0, untargeted
# Designer: 134 files / 637 tests; Python: 204 + 81 tests
# Buyer: 10; Showcase: 17; Editor: 29 server + 247 application tests
# All editor domain/render assertion scripts passed.
pnpm typecheck                    # exit 0, all workspace packages
pnpm --filter @varpet/editor build # exit 0; existing chunk-size advisory
git diff --check                  # exit 0
```

Fresh independent review: no blocking findings. Concurrent blueprint animation
edits were preserved in shared main. The named completion/debugging skill files
were absent; verification is recorded here.
