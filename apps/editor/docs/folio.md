# Folio: the product's design language

White paper, black ink, one green for the designer, a yellow highlighter for the buyer's own selection.
Decided with Felix on 26 Sept after rejecting a pink sheet and a dark UI. Mockup: `folio.html` (session scratchpad).

## Rules

- **Green (`--designer`) means the designer did it**: its pieces, drawings, steps and words. Nothing else is green.
- **Yellow (`--select`) means you**: your selection (3D halo, rows, chips) and what you are asking about.
- **Ink (`--accent`) is the primary action.** Red (`--danger`) only for something blocked or failed.
- **Icons for actions, words for things.** Every icon button has `aria-label` and `title`. Names, prices and Apply stay written.
- **Type**: Sofia Sans for the interface, Source Serif 4 for headings, the designer's voice and prices, condensed figures
  for measurements. Noto Sans/Serif Armenian cover Armenian (֏ included); all families cover Cyrillic. Fonts load with
  `display=swap`; the system fallbacks are acceptable if the venue blocks Google Fonts.
- **Shape**: 2–4 px corners, no clouds, no tilted cards, no spaced capitals.
- **Stage**: a muted sage studio (`#a6ada1`), tall charcoal plinth and softly blurred courtyard forms, ink selection edge inside a yellow halo.

## Where it lives

- Tokens: `apps/editor/src/ui/style.css :root` (every editor stylesheet reads them), `apps/showcase/src/style.css :root`,
  `apps/buyer/src/style.css :root`. Old token names are kept, so no selector changed meaning.
- The buyer workspace: `apps/editor/src/ui/folio-shell.ts|css` (Designer and general tools share the left column,
  flat in the middle, one selection Properties panel on the right, floating toolbar on the selected piece,
  bottom dock with views and light, More menu for general tools, centered costs dialog).
  Panels are moved, not rebuilt; ids, handlers and keyboard shortcuts are unchanged.

## Done means

1. `grep -rnE '#[0-9a-fA-F]{3,8}\b' --include=*.css apps/editor/src apps/showcase/src apps/buyer/src` finds colours only
   in `:root` token blocks (and design-data such as material swatches supplied at runtime).
2. No `text-transform: uppercase` or spaced tracking in any stylesheet.
3. A screenshot at 1440 and 390 of: landing, sign in, create account, my apartments, apartment dialog, workspace (3D, top,
   plan, inside), furniture, materials, ceilings, renovation, designer column, floating toolbar, quote drawer, More menu,
   file, share, connect, help, architect construction view, showcase collection and detail, buyer app.
4. `pnpm test` and `pnpm typecheck` green, untargeted.
