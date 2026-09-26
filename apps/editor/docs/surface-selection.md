# Surface selection

Architectural selection follows the visible surface: a floor's upper cap, the camera-facing broad wall face, or a ceiling's underside. In Top view the wall's upper cap remains selectable and highlighted. The existing ink/yellow outline palette is retained. Move mode no longer adds a volume corner frame around these surfaces.

This is presentation state. Entity IDs, property editing, commands, history and saved geometry retain their existing contracts. Picking a room ceiling or its ceiling design records a transient ceiling target under the room's existing ID; the outline resolves the live ceiling projection. Inside view retains its navigation-only interaction.

`selection-surfaces.ts` extracts exact source triangles, so floor concavities, wall junctions and opening cutouts survive. Openings and skirting remain separate occluders. The outline temporarily substitutes cached mask geometry during its pass and restores geometry, visibility, selection and renderer state in `finally`. Masks are released with their source geometry and at renderer disposal; rebuilding a wall preview automatically gets a fresh mask.

Three's `OutlinePass` mask is double-sided. Preserving winding alone does not hide the back of floors and ceilings: explicitly return an empty mask for the culled side. A top-facing wall mask also needs the prism's cap (group 2), since a vertical face is edge-on in Top view.

## Verification

26 September 2026, Codex. New geometry checks are included in the normal editor test command. No existing tests, fixtures or scene schemas were changed for this feature. Fresh-context review found no remaining actionable issues after the back-face and Top-view corrections.

```text
node apps/editor/scripts/check-selection-surfaces.mjs
Selection surface checks passed: 25 assertions.

node output/surface-selection-verification/probe.cjs
COMPLETE 19 surface selection checks.
page errors: 0

pnpm test
packages/designer: Test Files 123 passed; Tests 551 passed
apps/editor: Selection surface checks passed: 25 assertions.
apps/editor test: Done
exit 0

pnpm typecheck
all workspace packages: Done
exit 0

pnpm --filter @varpet/editor build
built in 325ms

git diff --check
exit 0
```

The browser page `/surface-selection-qa.html` verifies real mask draws, both wall sides, openings/trim exclusion, ceiling slabs and room ceilings, back-face suppression, Top, multiple surfaces, hidden layers, clearing selection, state restoration and unchanged document data. Floor and wall screenshots, including Top, were visually inspected. Furniture still uses its existing whole-object outline and Move frame. Screenshots and full command logs are in `output/surface-selection-verification/`.

The first full test run hit a five-second timeout in the unrelated designer `ashot-live.test.ts`. That suite passed alone (16 tests), then the complete unchanged workspace suite passed on rerun. Build retains the existing large-chunk advisory. No test thresholds or expectations were relaxed.

The shared primary checkout stayed on `main`; unrelated unfinished editor work prevented safe synchronization and was preserved under the editor's coordination rules. Notion tooling and the referenced `definition-of-done` skill were unavailable, so verification is recorded here.
