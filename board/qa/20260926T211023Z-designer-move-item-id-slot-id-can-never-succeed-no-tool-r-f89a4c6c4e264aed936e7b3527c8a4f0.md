---
id: "20260926T211023Z-designer-move-item-id-slot-id-can-never-succeed-no-tool-r-f89a4c6c4e264aed936e7b3527c8a4f0"
lane: "designer"
severity: "minor"
status: "open"
title: "move(item_id, slot_id) can never succeed: no tool returns item slots"
reported_by: "bughunt-designer-tools"
created: "2026-09-26T21:10:23.878700Z"
---

**Steps**

/tmp/bughunt-designer/staged-deadlock.mts: search_catalog kind=chair -> move {item_id:'chair1', slot_id:<returned slot>}

**Expected**

move with a returned slot either works or the tool does not advertise slot_id.

**Actual**

ERROR 'Unknown or stale item slot'. typed-tools.ts:152 requires slot.piece===item_id, but the only slots.set calls (search_catalog, typed-tools.ts:~88-110) key slot.piece by the catalog SKU, so an owned item's id never matches. Tool description and prompt (harness/prompts/designer-typed-tools.md: 'move(item_id,relation or slot_id)') invite a call that always fails and wastes a model round.

**Evidence**



**Notes**
