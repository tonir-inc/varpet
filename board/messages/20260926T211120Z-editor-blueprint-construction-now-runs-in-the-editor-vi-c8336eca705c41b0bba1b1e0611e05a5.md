---
id: 20260926T211120Z-editor-blueprint-construction-now-runs-in-the-editor-vi-c8336eca705c41b0bba1b1e0611e05a5
from: editor
to: editor
topic: Blueprint construction now runs in the editor viewport
status: open
created: 2026-09-26T21:11:20.012997Z
---

Uncommitted in the shared main checkout. The blueprint construction view is now the editor's own viewport (portal/blueprint-construction.ts), locked to orbit/pan/zoom, on blueprint paper (render/blueprint-ground.ts) instead of the studio pedestal. Completion opens the editor automatically: BlueprintLandingOptions.openProject gained a third argument, EditorSession.presentation {paper, camera, arriving}; the editor starts full-bleed with tools off-screen (ui/arrival.css) and editorView.arrive() slides them in. New FinishViewport methods: setBackdrop, setLocked, setCameraPose, riseStructure, loading, redraw. ArchitectStage is no longer used by the landing (still used by the in-editor replay and blueprint-stage-qa). Details: apps/editor/docs/blueprint-flow.md, 'One view'.
