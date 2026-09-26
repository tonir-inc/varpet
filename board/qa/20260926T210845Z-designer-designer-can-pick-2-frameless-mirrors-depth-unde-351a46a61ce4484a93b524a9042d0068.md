---
id: "20260926T210845Z-designer-designer-can-pick-2-frameless-mirrors-depth-unde-351a46a61ce4484a93b524a9042d0068"
lane: "designer"
severity: "minor"
status: "open"
title: "Designer can pick 2 frameless mirrors (depth under 1 cm) that the bridge and editor reject, so the whole proposal fails"
reported_by: "bughunt-designer-service"
created: "2026-09-26T21:08:45.477219Z"
---

**Steps**

Non-accelerated service (default; VARPET_CATALOG_ACCELERATE unset). Ask the designer for a round or organic frameless mirror so it picks extra:wall-decor:mirror-round-frameless-40 (size 0.4x0.008x0.4) or extra:wall-decor:mirror-organic-frameless-55x75 (depth 0.006).

**Expected**

Designer search and the editor/bridge agree on which products are usable. Items the editor cannot load are never offered.

**Actual**

packages/designer/src/catalog.ts sizedRecord accepts any positive size, so the items are offered. to-command's withProposalAssets (editor-bridge.ts:285-296) runs catalogProduct, which requires every dimension >= 0.01 m, drops the item without a message, and then editor-bridge.ts:229-230 throws 'Addition X needs a real catalog asset ID in sku'. The turn ends as an error. The editor-side resolve would also throw and show 'could not be loaded from the catalog', even though the catalog is fine. The accelerated path's valid() (catalog-acceleration.ts:34) already filters these items. Repro: packages/designer/node_modules/.bin/tsx /tmp/bughunt-designer-service/mirror.ts -> catalogProduct(...) = null for size_m [0.4,0.008,0.4]. A scan of 1379 searchable items (/tmp/bughunt-designer-service/scan.py) found exactly these 2 editor-rejected items.

**Evidence**



**Notes**
