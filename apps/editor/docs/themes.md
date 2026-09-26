# Light and charcoal themes

The header's **Theme** button switches the page between the existing light paper palette and a charcoal palette. Both use blueprint teal for primary actions and the active editing tool: `#155F6D` in light, matching `PAPER` in `src/portal/blueprint.ts`, lifted to `#247C89` in dark to keep selected controls distinct from their surface. Dark-theme teal text uses `#8DCDD5` for contrast; selection backgrounds use a quieter teal tint.

Light is the default. The choice is a browser preference stored as `varpet.ui.theme.v1`, with only `light` and `dark` accepted. It persists across reloads and portal/editor navigation and synchronizes between open tabs. If browser storage is unavailable, switching still works for the current page. The small reader in `index.html` sets the palette before modules load, so a saved dark theme does not flash light first.

`src/ui/theme.ts` owns preference state and accessible controls; `src/ui/theme.css` owns palette overrides. Theme controls mount outside account content that is replaced during sign-in/retry. The document attribute `data-theme` carries the palette into the portal, blueprint intake, editor, shared viewer and dialogs. Colors transition for 180 ms; reduced motion applies changes immediately.

This preference does not mutate apartment documents, undo/redo, material colors, plan evidence, scene lighting, sky selection or rendered geometry. The 3D scene retains its own lighting and backdrop. Keep plan drawing roles (`--plan-*`) distinct from UI roles. New UI surfaces should use the shared tokens; use `--accent` for teal fills and `--accent-ink` for readable teal text.

## Verification — 26 September 2026, Codex (GPT-6)

```text
pnpm test
apps/showcase: 17 passed
apps/buyer: 10 passed
packages/designer: 123 test files, 551 tests passed; 197 + 81 Python tests passed
packages/engine: Done
apps/editor: all domain/rendering suites passed; 29 server + 181 node tests passed; Done

pnpm typecheck
apps/buyer, apps/showcase, packages/engine, packages/designer, apps/editor: Done

pnpm --filter @varpet/editor test:renovation
Renovation checks passed (102 assertions).
Reconstruction and handoff checks passed (29 assertions).

pnpm --filter @varpet/editor build
built successfully; existing large-chunk advisory remains

Browser: 14 checks passed; no runtime errors.
Responsive headers: 8 route/width combinations passed.
```

Browser checks cover the default on a dark OS, keyboard toggle and pressed state, persistence, reload, account dialog colors, portal/editor navigation, unchanged scene revision/save state, cross-tab updates, persisted page lifecycle, cleared preferences, reduced motion, blocked storage, and dark background before app modules load. The landing page and editor headers were also checked at 390, 768, 1024 and 1440 px: no overlaps or horizontal overflow, and the theme control remained reachable. The tablet account/control gap was corrected to 12 px. Screenshots and results are in `output/theme-verification/`.

Historical palette contrast before the blueprint accent change: white on light-theme cobalt 6.30:1; white on dark-theme cobalt 4.87:1; dark-theme cobalt against its surface 3.06:1; dark ink on the surface 13.08:1; muted text on the surface 6.86:1; blue text on the surface 7.39:1. These are palette checks, not a claim of a full accessibility audit.

Fresh review found no blocking issues after retaining shared-view controls on bfcache navigation and aligning the toggle's visible and accessible labels. Existing shared-checkout work was preserved. Notion tools and the referenced definition-of-done skill were unavailable in this session; the changed contract and measured verification are recorded here.

## Blueprint accent — 27 September 2026, Codex (GPT-6)

The UI accent now matches the blueprint paper at `#155F6D`. Hover, focus, selection,
designer and background-grid tokens follow the same teal family; dark controls use
`#247C89` and dark text uses `#8DCDD5`. The base stylesheet and theme overrides agree.

Measured contrast: white on light accent 7.27:1, white on dark accent 4.86:1,
white on dark hover 4.73:1, dark accent against its surface 3.07:1, dark accent
text against its surface 8.40:1 and against selection 5.17:1.

```text
pnpm test: passed
  showcase: 17; buyer: 10
  designer: 126 test files / 606 tests; 200 + 81 Python tests
  editor: all domain/rendering checks; 29 server + 194 node tests
pnpm typecheck: all workspace packages passed
pnpm --filter @varpet/editor build: passed (existing large-chunk advisory)
git diff --check: passed
```

Browser verification covered the blueprint landing page and active editor tools in
both themes. Computed brand and blueprint backgrounds match exactly in light;
dark tools have white labels on the lighter teal. The existing development server
on port 5173 failed to import `src/main.ts`; a fresh server on port 5217 loaded the
editor successfully. Screenshots, contrast measurements and command logs are in
`output/blueprint-accent/`. Fresh read-only review found no blockers. The referenced
definition-of-done skill is still absent from repository and personal skill roots.
