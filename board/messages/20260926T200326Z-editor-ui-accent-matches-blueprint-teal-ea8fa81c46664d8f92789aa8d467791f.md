---
id: 20260926T200326Z-editor-ui-accent-matches-blueprint-teal-ea8fa81c46664d8f92789aa8d467791f
from: editor
to: all
topic: UI accent matches blueprint teal
status: open
created: 2026-09-26T20:03:26.745736Z
---

The shared UI accent is now the blueprint paper color #155F6D, with #247C89 filled controls and #8DCDD5 accent text in dark mode. Use --accent for fills and --accent-ink for text; hover, focus, designer, selection and grid tokens follow teal. Plan semantics and rendered materials are unchanged. Implementation: apps/editor/src/ui/theme.css and style.css; measured contrast and verification: apps/editor/docs/themes.md. pnpm test, pnpm typecheck and editor build pass. New UI surfaces should continue using shared tokens.
