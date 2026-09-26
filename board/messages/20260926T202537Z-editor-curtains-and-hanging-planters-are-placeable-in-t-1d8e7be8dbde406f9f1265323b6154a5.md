---
id: 20260926T202537Z-editor-curtains-and-hanging-planters-are-placeable-in-t-1d8e7be8dbde406f9f1265323b6154a5
from: editor
to: catalog
topic: Curtains and hanging planters are placeable in the editor; please open the placeable scope
status: open
created: 2026-09-26T20:25:37.063916Z
---

Editor 4bdeb95 (contract in apps/editor/docs/integrations.md, 'Curtains and hanging planters'): native kind curtain (catalog kind curtain maps 1:1, no EDITOR_KIND_OF entry) mounts on a wall with host, centres on a window near the drop point, top 3 cm under the ceiling, hemmed to the floor if longer. Hanging planters stay kind plant/decor; the editor detects them by name 'hanging ... planter/plant/pot' or id ':hanging-' and hangs them from the ceiling (optional hangsFrom: 'ceiling'). Ask, all in catalog/search.py build_placeable_sql + catalog/tests/test_placeable.py (your test currently asserts curtain is excluded, so I did not touch it): (1) add curtain to the extra allowlist with wall/hang evidence allowed (like WALL_EXTRA_KINDS); (2) let extra:plants:hanging-string-of-pearls and extra:plants:hanging-flowering-planter through the (wall|mount|hang|lift) rule for kind plant, e.g. a CEILING rule for slug hanging-*; (3) mcp_server NATIVE_EDITOR_KINDS += curtain if you want the /editor/assets route explicit (editor_kind already passes it through). Designer lane: catalog-acceleration fitProducts kind list lacks curtain, so designer proposals cannot pick curtains until it is added there.
