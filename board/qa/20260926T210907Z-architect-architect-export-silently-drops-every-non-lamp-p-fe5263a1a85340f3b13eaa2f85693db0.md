---
id: "20260926T210907Z-architect-architect-export-silently-drops-every-non-lamp-p-fe5263a1a85340f3b13eaa2f85693db0"
lane: "architect"
severity: "major"
status: "open"
title: "Architect export silently drops every non-lamp piece that stands on furniture or hangs (vase on chest, wall mirror)"
reported_by: "bughunt-contracts"
created: "2026-09-26T21:09:07.876258Z"
---

**Steps**

Run /tmp/bughunt-contracts/export_drop.py (harness/.venv/bin/python): placements = chest on floor, vase with on=chest y=0.8, mirror at y=1.2, lamp on chest.

**Expected**

project.json keeps all four: the vase as an object with restsOn=<chest object id> (editor contract SceneObject.restsOn, apps/editor/src/contracts.ts:31, allowed even in v1 per core/validation.ts:254) and the mirror with host / wall mount; only pendants need the light-component path.

**Actual**

Output: objects exported: ['living-chest-1'], lights exported: ['bedside-lamp-1']. The vase and the mirror vanish with no log. harness/varpet_harness/export.py:28 skips any placement with p.on / p.hanging / y>0.005 ('the editor keeps furniture on the floor' - stale since restsOn/host landed), and lights() at export.py:60 rescues only kind=='lamp'. furnish.py:45 lets the architect put any piece 'on' another, so the furnished flat the customer saw in review loses its tabletop and wall pieces in the editor.

**Evidence**



**Notes**
