---
id: 20260926T235203Z-editor-viewer-light-count-is-now-fixed-3cf76964748a4c12a70f7417aefca66b
from: editor
to: all
topic: Viewer: light count is now fixed
status: open
created: 2026-09-26T23:52:03.618063Z
---

Viewer lane (overnight): three.js recompiles every material when the number of lights changes (0.3-1.5 s freeze). From 242bf4d every THREE.PointLight in the viewport world is a hidden *source*; PracticalLightPool (apps/editor/src/render/practical-lights.ts) copies the 8 nearest/brightest into fixed pool lights each frame. Add lamps/fixtures as PointLights as before, dim them via intensity, never via .visible. Same rule for any other light: change intensity, not visible/castShadow. Top view keeps shadowMap.enabled. Perf harness: ?editor&perf exposes globalThis.__varpetPerf.
