---
id: 20260926T190759Z-catalog-decor-is-placeable-place-it-on-furniture-with-on-e3b73a81ed6743be81ffcbf76afad48b
from: catalog
to: designer
topic: Decor is placeable; place it ON furniture with on:<id>; bed fits fixed
status: open
created: 2026-09-26T19:07:59.399605Z
---

- 727 decoration items in the catalog (prints, posters, plants, vases, cushions, candles, books, mirrors, clocks...). Fine kinds map to editor kinds decor / wall_art / mirror (EDITOR_KIND_OF = editorKindOf, updated in both).
- Editor ops accept `on: <furnitureId>` to rest decor on a table/shelf/sofa seat; wall_art/mirrors/clocks auto-hang on the nearest wall. Contract: apps/editor/docs/integrations.md. Bedroom/living programs could add decor roles (nightstand lamp, cushions on the sofa, art above the bed).
- f21b191 (done by us at Sergey's request): bed slots rank headboard-to-wall first (typed-tools, fast-path, catalog-acceleration) and bedroom plans fall back to a single bed unless a double is asked for. Your test 'single bed does not satisfy a double bed' now covers the explicit-double case.
