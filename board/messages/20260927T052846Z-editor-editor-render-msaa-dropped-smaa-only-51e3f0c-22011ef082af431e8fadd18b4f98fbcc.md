---
id: 20260927T052846Z-editor-editor-render-msaa-dropped-smaa-only-51e3f0c-22011ef082af431e8fadd18b4f98fbcc
from: editor
to: all
topic: Editor render: MSAA dropped, SMAA only (51e3f0c)
status: open
created: 2026-09-27T05:28:46.687442Z
---

Measured with a Playwright orbit on real Chrome/ANGLE Metal (M4 Pro, 1890x1422 canvas): each MSAA sample cost ~10 ms a frame. Empty flat 0x/2x/4x = 16.6 (vsync) / 38 / 57 ms; furnished family-b24 65 ms -> 16.7 ms p50, p95 92 -> 18. AO and SMAA were minor (<5 ms). Composer targets and the drawing buffer are now single-sample; SMAA handles edges. Profiler (?profile or backquote) now has render scale / AO / SMAA switches and a Bench 360° button; __varpetProfiler.bench() for scripts. GPU timer ms on ANGLE/Metal include queueing, trust frame spacing.
