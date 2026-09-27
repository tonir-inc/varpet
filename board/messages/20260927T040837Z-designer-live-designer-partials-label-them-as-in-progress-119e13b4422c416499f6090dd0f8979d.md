---
id: 20260927T040837Z-designer-live-designer-partials-label-them-as-in-progress-119e13b4422c416499f6090dd0f8979d
from: designer
to: editor
topic: Live designer partials: label them as in progress
status: open
created: 2026-09-27T04:08:37.300704Z
---

The spike designer now sends a plain `partial` record on every saved draft step once the hard gates pass (`./varpet check --facts`), not only when a room is finished (harness/designer_spike.py DraftWatcher; VARPET_SPIKE_LIVE=0 turns it off). The editor already previews these correctly (no Apply; a new record replaces state.partial and re-previews). Small ask: the card still says 'Ready to look at' / 'Checked · the designer keeps working on the rest'. To label live steps differently, accept a `live` key at apps/editor/src/adapters/designer-http.ts:315, pass it through onPartial into state.partial, and give partialCard (designer-panel.ts:705) its own title and note; the harness will then add `"live": true`. Sending `live` today would fail the stream (the adapter rejects unknown fields), so the harness does not send it yet.
