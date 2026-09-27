# Plan catalog: developer plans, furnished, opened in Design

Built 2026-09-27, Claude Opus 5.5 (lane portal-catalog, branch `portal/catalog`). Contract: `src/portal/bundles-contract.ts`
(unchanged). API: `server/developers.mjs` (lane portal-profile), merged from `portal/profile`.

## Routes

- `/?view=catalog`: **Catalog** tab. One shelf per developer (initials mark or logo, city and tagline, plan count,
  **Developer profile** → `/?developer=<slug>`). Filters: bedrooms (All, Studio, 1, 2, 3+) and developer, kept in
  the URL (`&bedrooms=2&developer=orion`) so a filtered catalog can be shared.
- `/?bundle=<id>`: opens the bundle in the editor's guided **Design** phase (also what a card click does, in place).
- `/?developer=<slug>`, `/?view=studio`: routed to `portal/developer-profile.ts` (lane portal-profile).

## Pieces

| File | Role |
| --- | --- |
| `portal/portal-header.ts` | Shared portal frame: `renderPortalHeader(active)`, `mountPortalAccount(root, {onUser})`, `mountPortalShell(host, active)`. Nav: Start with a plan · Catalog · Sandbox · Saved apartments. `portal.ts` and the catalog use it; profile pages can too. |
| `portal/bundles.ts` | Checked reads of `BUNDLE_API` (malformed records dropped, plan images must be same-origin), filters, `groupByDeveloper`, `restoreBundle` (validates the scene with the editor's `parseScene`, resolves products the bundle did not ship through the furniture database, fresh scene id). |
| `portal/catalog.ts/.css` | The tab. Cards: plan on the left, furnished 3D model on the right. |
| `portal/preview.ts` | `mountFurnishedPreview`: the structure renderer plus furniture for a card. |
| `portal/catalog-launch.ts` | Card or URL → blueprint sheet → editor boots underneath → Design. |
| `ui/design-onboarding.ts` | `bundle` option: the Design brief for a developer's furnished design. |

## Motion

Cards rise in on scroll (IntersectionObserver). When a card is seen, the developer's plan draws itself as light ink on
blueprint paper (the landing's `traceInk` pen order, 1.1 s), a light sweeps across the seam, and the furnished model is
revealed behind it while rising out of the paper (1.3 s ease-out). Hover or keyboard focus orbits the model slowly
(36 s per turn, eased in and out) and brightens the plan. Opening a card grows its model pane into a full sheet of the
same paper carrying the card's last frame; the editor boots under it and the sheet fades (520 ms) into Design.
`prefers-reduced-motion`: no rise, sweep, pen drawing, orbit or clip growth; everything appears settled.

## Budget

One WebGL context for the whole catalog, whatever the number of cards: each card owns a `THREE.Scene` and a plain 2D
canvas; a shared renderer draws a card into the corner of its buffer and the pixels are copied to the card at once.
Scenes are built only for cards near the viewport (400 px margin) and at most 6 are kept on the GPU; a released card
keeps its last frame. Frames are drawn only when something changes (first frame, rise, orbit, resize, a model arriving).
Furniture shows as the editor's drawn stand-ins of the right kind and size; the catalog relay's light GLB replaces them
when reachable. Cards never download ABO originals (up to 54 MB each); two model downloads at most run at once and a
relay that fails twice is not asked again, so a slow relay cannot hold the page's connections.

## Design from a bundle

`EditorPresentation` gains `bundle` (`workflow: 'design'`, `arriving: true`, `paper: BLUEPRINT_PAPER`). The brief reads
"✓ Built by <developer>", shows the plan beside the heading with a link to the developer's profile, names the pieces in
place and asks "What would you change?"; a blank request asks the designer to keep every existing piece and suggest a
few improvements. The scene's furniture is there from the first frame (no re-furnishing); the designer chat works as in
the upload journey (its request carries the bundle scene); **Customize myself** reveals the full tools. Nothing is
written anywhere until the person saves: signed in, Save creates an account apartment; otherwise a team flat of kind
`template`. `templateId` is `bundle:<id>` for provenance.

## Verification (2026-09-27, Claude Opus 5.5)

```text
node output/plan-catalog/probe.cjs                       # dev server :5181, real bundles API
15 checks passed; 0 page errors
node --test apps/editor/tests/plan-catalog.test.mjs
tests 7; pass 7; fail 0
PROBE_BUILD=1 PROBE_BASE=http://127.0.0.1:5182 node output/plan-catalog/probe.cjs   # vite build + preview
15 checks passed; 0 page errors
```

Checks: header tab, one shelf per developer with profile links, plan ink and model pixels drawn, **1 GL context and
≤ 6 live scenes** (measured 1 context, 2 scenes with 2 cards on screen), hover orbit changes the frame and stops on
leave, filters and URL, card → Design with the heading/plan/profile link, 30 pieces in the scene, the designer request
carrying all 30 pieces and its question shown, Customize keeps 30 pieces, direct `/?bundle=`, missing bundle
(404 → way back, no pointless retry), 390 px (no sideways scroll, both panes wider than 150 px, Design brief within the screen),
reduced motion (settled cards, no orbit, still opens).

Measured in headless Chromium with SwiftShader (software WebGL), so absolute times are pessimistic: first card drawn
3.0 s after load (dev); click → Design 13.0 s (dev) / 15.3 s (production preview). The timing trace shows the bundle
and restore done in 96 ms; the rest is the editor's own boot and first software-GL frames plus `editorView.ready()`'s
3 s wait for models, the same cost the upload journey pays. Screenshots: `output/plan-catalog/*.png` (desktop,
hover, opening sheet, Design, designer question, Customize, missing bundle, 390 px catalog and Design, reduced motion).

## Known limits

- With the catalog relay unreachable (as on this machine: `/api/catalog/models/*` → 502 after 10.5 s), cards keep
  drawn stand-ins while the editor loads ABO originals, showing its translucent placeholder volumes until each arrives.
  Using the drawn stand-in as the viewport's loading placeholder too (`render/viewport.ts`) would make the hand-off
  seamless.
- The editor opens in its default perspective framing, not the card's isometric angle.
