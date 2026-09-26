---
name: product-ui
description: Use when changing how the Varpet editor looks or feels, including layout, the designer chat, panels, typography, colour, spacing, component states, motion, empty and error states, or a visual polish pass. Keeps the editor's behaviour intact.
---

# Product UI for Varpet

## What the product is

A customer redesigns their apartment by talking to a designer. The designer conversation is the main
surface, and the 3D/plan canvas is the stage where proposals appear. The Scene, Furniture, Renovate and
Materials tools are secondary. The customer is neither a designer nor an engineer, so the UI must be calm,
confident and legible, and trustworthy with money (֏) and measurements (m, m²).

## Keep (hard rules)

- Keep every feature, control, keyboard shortcut and `id`, `aria-*` and `data-*` attribute. Tests and the
  `apps/editor/*-qa.html` pages select them. Change how things look, not how they behave.
- Leave the editor's contracts (`contracts.ts`, `renovation-contracts.ts`) and `EditorStore` untouched.
  The approval flow stays: nothing changes in the flat until the customer applies.
- Treat the current style (stepdav's editor) as the starting reference, not the target. Extract its
  tokens first, then raise the level. The design is not final.
- Demo mode (no service URLs) must still look complete.

## Process

1. **Audit.** Before changing anything, take screenshots of the key states below at 1440×900, 1280×800
   and 390×844 with the browser plugin. Write down the 5–10 most visible problems: hierarchy, density,
   contrast, inconsistency, dead space.
2. **Tokens.** Put one token set on `:root` in `apps/editor/src/ui/style.css`:
   - colour roles: ground, surface, raised, line, ink, muted, accent, positive, warning, danger, focus;
   - a type scale, spacing on a 4 px base, 2–3 radii, 2 shadow levels, motion durations and easing.
   Every other stylesheet uses the tokens, with no raw hex values.
3. **Apply** the tokens area by area, re-screenshotting as you go. Keep each commit small: tokens first,
   then one area per commit.
4. **Verify** (below). Put the before/after screenshots in the commit's note.

## Standards

- **Type.**
  - 14 px for reading text; 12 px only for dense labels and metadata.
  - At most one family pair: a UI sans, optionally with a display face for headings.
  - A scale of about six steps; line-height 1.4–1.5 for text.
  - Tabular numerals for metrics, prices and dimensions.
- **Hierarchy.** One primary action per view. Secondary buttons stay quiet. Destructive actions look
  distinct and are confirmed in the page.
- **Colour.**
  - WCAG AA contrast: 4.5:1 for text, 3:1 for large text and UI boundaries.
  - The accent marks the primary action, the selection and the designer's voice, nothing else.
  - Neutrals have a slight hue bias.
  - Pass/warn/fail colours match the check results everywhere.
- **Spacing and alignment.** A 4/8 px grid, the same panel padding everywhere, aligned edges, no double
  borders. Repeated items (list rows, cards) share inner padding and baselines.
- **States.** Every interactive element has hover, a visible `:focus-visible` ring, active, disabled and
  loading states, and is reachable by keyboard.
- **Motion.** 120–200 ms, ease-out on enter, never delaying work; honour `prefers-reduced-motion`.
- **Icons.** One set, one stroke weight, 16 or 20 px. Never emoji as icons.
- **Copy.**
  - Plain words, sentence case.
  - Numbers with units: 1.9 m², 90 cm, 45,000 ֏.
  - Errors say what happened and what to do next.
- **Empty states** show what to do next; for the designer, that means example requests that work.
- **The designer chat.**
  - The customer's and the designer's messages are distinguishable at a glance.
  - Progress is one calm line with the elapsed time.
  - A proposal card has a title, one paragraph and the numbers as a compact row, then Preview / Apply /
    Dismiss with Apply as the primary action.
  - Applied, dismissed and stale proposals keep their card and show that state.
- **Proposal preview** is an unmistakable mode (a banner or frame) with the exits always visible.

## Avoid

Purple-to-blue gradients, glass effects everywhere, a lone neon accent, every block a card with the same
shadow, 11 px grey text, emoji, lorem ipsum, and example data presented as the customer's own.

## Key states to screenshot

- The empty designer chat.
- A question with options.
- A proposal card, the preview mode, and the applied state.
- The Furniture, Renovate and Materials panels.
- The Sources modal.
- Narrow width.

## Verify

- `pnpm test`, `pnpm typecheck` and the editor build pass untargeted, and the `apps/editor/*-qa.html`
  pages still pass.
- No `id`, `aria-*` or `data-*` attribute is lost. Anything removed in
  `git diff origin/main -- apps/editor | grep -E '^-.*(id=|aria-|data-)'` reappears elsewhere in the diff.
- Screenshots before and after are in the note.
- Keyboard pass: Tab through the chat and through one proposal from Preview to Apply.
