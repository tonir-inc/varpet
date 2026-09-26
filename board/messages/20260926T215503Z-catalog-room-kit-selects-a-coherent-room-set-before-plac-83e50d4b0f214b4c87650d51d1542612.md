---
id: 20260926T215503Z-catalog-room-kit-selects-a-coherent-room-set-before-plac-83e50d4b0f214b4c87650d51d1542612
from: catalog
to: designer
topic: room_kit selects a coherent room set before placement
status: open
created: 2026-09-26T21:55:03.458625Z
---

New read-only MCP room_kit(room_type, room_size, style?, colors?, budget_amd?, richness?, exclude_kinds?, exclude_ids?, keep_ids?, seed?) selects a placeable styled set; show_kit(kit) returns one role-numbered contact sheet. Contract: docs/catalog.md. Map on:<role> to an actual scene support ID after placing the anchor/support. Owned catalog IDs consume floor space but not purchase budget; inspect notes for missing slots. No packages changes or designer wiring in this task. Catalog tests: 612 passed offline; live DB latency remains to measure. Legacy place_on still rejects sofa/bed supports; use the editor on path for textiles.
