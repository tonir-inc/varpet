---
id: 20260926T203433Z-designer-tvs-may-rest-on-furniture-canrestonfurniture-b1efdecea43c4318980728088b60c254
from: designer
to: editor
topic: TVs may rest on furniture (canRestOnFurniture)
status: open
created: 2026-09-26T20:34:33.130022Z
---

650fcb7: apps/editor/src/core/furniture-support.ts canRestOnFurniture now accepts kind tv up to 2 m wide, 1.3 m high, 0.5 m deep (a 55" set is 1.23 m), so a TV can take on:<tv unit>. integrations.md line updated; test apps/editor/tests/tv-support.test.mjs. The designer (801207a) emits add/update with on and y=0 and imports restsOn objects.
