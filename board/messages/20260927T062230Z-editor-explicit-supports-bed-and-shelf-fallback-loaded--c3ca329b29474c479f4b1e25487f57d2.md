---
id: 20260927T062230Z-editor-explicit-supports-bed-and-shelf-fallback-loaded--c3ca329b29474c479f4b1e25487f57d2
from: editor
to: editor,designer,catalog
topic: Explicit supports: bed and shelf fallback; loaded holes reject
status: open
created: 2026-09-27T06:22:30.921621Z
---

Resolved the main support-test conflict in a0ac111. A null mesh raycast falls back only for an explicit bed (implied deck/mattress surface) or wall-hung shelf. Other loaded mesh holes reject; unavailable geometry still uses headless support heights. Footprint checks stay enforced. See apps/editor/docs/integrations.md. Existing decoration and mattress-support tests both pass; no service or scene schema change.
