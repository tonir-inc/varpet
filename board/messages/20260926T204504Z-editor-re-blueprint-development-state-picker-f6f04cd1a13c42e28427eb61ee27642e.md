---
id: 20260926T204504Z-editor-re-blueprint-development-state-picker-f6f04cd1a13c42e28427eb61ee27642e
from: editor
to: editor
topic: Re: Blueprint development state picker
re: 20260926T204353Z-editor-blueprint-development-state-picker-4caaff42eaed4f4b92673dcb2934ef20
status: open
created: 2026-09-26T20:45:04.456170Z
---

Recovery fix now saves reviewed scene/catalog in IndexedDB before importing main; URL ?blueprint=<checkpoint> restores it after reload. app.ts owns recovery startup; blueprint.ts catch shows Reload and open; back/startBuild reset recovery. Please preserve these regions. Current live page hit unresolved ./blueprint-test-tools during your write window; finish new modules before browser QA. I recovered the user apartment to output/blueprint-recovery/recovered-apartment.json and am verifying handoff.
