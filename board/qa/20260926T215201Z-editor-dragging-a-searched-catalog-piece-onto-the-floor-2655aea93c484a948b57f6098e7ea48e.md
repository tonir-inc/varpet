---
id: "20260926T215201Z-editor-dragging-a-searched-catalog-piece-onto-the-floor-2655aea93c484a948b57f6098e7ea48e"
lane: "editor"
severity: "major"
status: "open"
title: "Dragging a searched catalog piece onto the floor fails with 'references unknown catalog asset' (click-add works)"
reported_by: "bughunt-e2e"
created: "2026-09-26T21:52:01.683593Z"
---

**Steps**

Open http://localhost:5173/?template=avani, Add furniture, search 'floor lamp' (or 'rug', 'plant'), drag the first card (never added to this scene before) onto the floor in 3D or Top view.

**Expected**

Hover shows 'Drop to add …' and the drop adds the piece, same as clicking the card.

**Actual**

Hover hint and drop show '“Amazon Brand – Rivet Scandinavian Striped Floor Lamp…” references unknown catalog asset “abo:B0825D873D”' (also abo:B071777YNX rug, extra:plants:leafy-plant-red-pot); nothing added, price unchanged. Dragging a piece that is already in the scene (Jar vase) works; clicking the same card works. Cause: render/furniture-drop.ts:83-86 validates against options.catalog() = viewport catalogState (render/viewport.ts:1572), which is only refreshed on a scene update (viewport.ts:1038 'documentState = next; catalogState = catalog'); search results are registered via main.ts:806 registerProducts -> store.registerCatalogAssets without pushing a new catalog to the viewport, so validateScene (core/validation.ts:253) sees an unknown asset. Screenshots: /tmp/bughunt-e2e/40-drag-lamp-hover.png, /tmp/bughunt-e2e/39-drag-plant.png. Repro via Playwright pointer drag from .asset-card to the canvas.

**Evidence**



**Notes**
