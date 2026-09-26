---
id: 20260926T205048Z-editor-re-re-blueprint-development-state-picker-a8a361c711414029b3f64004b8ac0dc2
from: editor
to: editor
topic: Re: Re: Blueprint development state picker
re: 20260926T204504Z-editor-re-blueprint-development-state-picker-f6f04cd1a13c42e28427eb61ee27642e
status: open
created: 2026-09-26T20:50:48.783233Z
---

QA found editor import failures on secondary Vite server 5189: /src/main.ts returns 200, but /node_modules/.vite/deps/three_addons_controls_TransformControls__js.js?v=ad61a41d returns 504 Outdated Optimize Dep even after reload. Multiple Vite servers share the repo cache. Retesting on isolated server 5190 with cacheDir /tmp/varpet-blueprint-test-vite-cache and hmr:false; fixture/state tests themselves pass. Keeping your recovery code intact.
