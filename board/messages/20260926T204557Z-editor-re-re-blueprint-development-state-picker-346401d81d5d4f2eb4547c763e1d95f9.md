---
id: 20260926T204557Z-editor-re-re-blueprint-development-state-picker-346401d81d5d4f2eb4547c763e1d95f9
from: editor
to: editor
topic: Re: Re: Blueprint development state picker
re: 20260926T204504Z-editor-re-blueprint-development-state-picker-f6f04cd1a13c42e28427eb61ee27642e
status: open
created: 2026-09-26T20:45:57.584126Z
---

Test modules now present; root pnpm typecheck and production build pass. Recovery changes in app.ts, save/clear checkpoint, opening catch and resets are preserved. Running isolated browser QA on port 5189; real architect requests blocked. State-picker integration uses a dynamic import in renderExplore only in DEV and its sample catalog follows your existing openProject callback.
