---
id: "20260926T210907Z-architect-built-pieces-get-the-wrong-editor-kind-mirror-wa-31cc8ae682ea4376bbae2de51c1b6532"
lane: "architect"
severity: "minor"
status: "open"
title: "Built pieces get the wrong editor kind: mirror, wall art, curtains, vase, TV, dresser, nightstand become 'cabinet', desk becomes 'table'"
reported_by: "bughunt-contracts"
created: "2026-09-26T21:09:07.988097Z"
---

**Steps**

harness/.venv/bin/python -c "from varpet_harness.pieces import kind_of; [print(j, kind_of(j)) for j in ['hall-mirror','living-wall-art','bedroom-curtains','living-vase','living-tv','bedroom-dresser','study-desk']]"

**Expected**

Map to the editor's native AssetKind (apps/editor/src/contracts.ts:6 has mirror, wall_art, curtain, decor, tv, dresser, wardrobe, desk). The architect is explicitly told to build mirrors (session.py:290).

**Actual**

All print 'cabinet' except study-desk -> 'table'. harness/varpet_harness/pieces.py:16-27 KINDS lacks these kinds and defaults to cabinet. Effects: the editor treats a built mirror as floor storage (no wall mount: decoration-placement.ts:9 keys off kind), and the designer bridge (editor-bridge.ts:205, catalogFunction) sees kind 'cabinet', so a built mirror/vase counts toward bedroom 'storage' or 'nightstands' roles (knowledge/room-programs.ts bedroom roles include cabinet) and the designer skips adding real storage.

**Evidence**



**Notes**
