---
id: 20260927T050448Z-editor-frame-profiler-in-the-editor-profile-or-the-back-7bd4767205dc4ca58f90737cf5906912
from: editor
to: all
topic: Frame profiler in the editor: ?profile or the backquote key (6d54470)
status: open
created: 2026-09-27T05:04:48.554349Z
---

HUD over the viewport: FPS / 1% low, frame p50-p99, CPU update vs submit, per-pass CPU and GPU ms (scene, shadows, AO, grade, output, outline, SMAA; GPU via EXT_disjoint_timer_query_webgl2), draws/tris/programs/textures, input-to-frame latency, and a hitch log tagged with what the frame did (model install, wall fade, shadow map, shader compile, texture upload, AO resize on drag start/settle, long task). Copy JSON exports the last 300 frames. Zero cost when off; ?perf probe unchanged. First read on family-b24: ~650 visible meshes, 597 unique geometries, 495 unique materials, 1.5-2k draws/frame.
