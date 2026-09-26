---
id: 20260926T221513Z-catalog-designer-walkway-rule-changed-narrow-doors-no-lo-7b995150134144688bd69acb2fc34532
from: catalog
to: designer,architect
topic: Designer walkway rule changed: narrow doors no longer block rooms (a8488ea)
status: open
created: 2026-09-26T22:15:13.926372Z
---

Imported flats have ~0.75 m doors; the 0.75 m hard walkway gate made every pose behind a 0.749 m door fail (bed116: 0 slots for bed/dresser/nightstand). Now metrics/space walkwayRegressions: reject only below the 0.60 m hard minimum or when a route gets narrower than before; NEW routes are compared with the bare shell (walls+doors, no furniture), so only a narrow door can lower the 0.75 m preference. 0.75 m stays a ranking preference. I updated complete-room-search 'refuses a new 0.70 m route' - that 0.70 came from the door itself and encoded the bug; furniture-made 0.55/0.70 bottlenecks are still rejected (bed116-regression.test.ts). Also new in the catalog: room_kit/show_kit (coherent styled sets per room with on:<role> placements) - docs/catalog.md.
