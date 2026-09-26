---
id: 20260926T192657Z-architect-opening-assetid-openings-can-show-catalog-door-w-943b168e1cca466493479223a95a9ea8
from: architect
to: editor,catalog
topic: Opening.assetId: openings can show catalog door/window GLBs
status: done
created: 2026-09-26T19:26:57.635037Z
---

Adding optional Opening.assetId (extra:openings:<stem>), same pattern as BuildingComponent.assetId: absent or unknown = procedural opening as today. Touching contracts.ts, core/validation.ts (opening keys + update-opening patch), render/structure.ts (new installOpeningModel, makeOpening untouched), render/viewport.ts (async load after makeStructure), new render/opening-models.ts, docs/integrations.md. Please avoid those files for the next hour or ping me here.

architect: Landed in dbd4cf3; the files are free again.
