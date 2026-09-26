# Flat-aware conversation starters

Measured 26 September 2026 (+0400), GPT-6 Codex. Conversation support is already on main
as `40291b9`; MAIN's warm proposal titles, explanation and collapsed Notes (`8dd936e`) remain intact.

## Audit and change

Measured before: all flats received the same four requests, scene edits did not refresh them,
and the large empty-chat greeting put the first request below the composer at narrow widths.
Derived change: show three or four local scene observations in “Ideas for this flat”, directly
under the conversation header. Keep this section accessible during a conversation and refresh
it on scene changes and north changes. An unclassified cabinet never proves a missing wardrobe.
No proposal, scene mutation or model request occurs until a customer chooses an idea.

Assumed: English room names identify living rooms, bedrooms and studies. Other rooms receive
neutral room-specific palette and circulation questions. A room with no scene furniture or built-in
furnishing is described as empty; this describes the model, not a survey of the physical flat.
Built-in occupancy uses the editor's shared ceiling-height calculation: recorded height, adjoining
walls, or its 2.8 m fallback when neither is known.
Compass wording requires saved north and an exterior window; it does not promise sunlight through
unknown neighbouring obstructions. No room data retains the four original fallback examples.

## Browser evidence

Measured with the browser plugin on spare port **5341**, no service URLs. This is a controlled
replay of the production panel with a cloned demo scene and recorded answer callback, not a model
conversation. The preceding [three-turn live proof](../README.md#live-browser-proof) remains the
conversation evidence. No additional live designer requests were needed for local suggestions.

| State | 1440×900 | 1280×800 | 390×844 |
| --- | --- | --- | --- |
| Before | [image](before-1440.png) | [image](before-1280.png) | [image](before-390.png) |
| Scene ideas | [image](after-1440.png) | [image](after-1280.png) | [image](after-390.png) |

[Updated bedroom storage and saved north](updated-1280.png).
[Recorded assertions](browser-proof.json): adding a bed replaces “empty” with a storage suggestion;
adding a wardrobe removes that suggestion; setting north to 0° identifies the west window;
loading an empty scene restores the original examples. Zero designer network requests and zero
answer callbacks before click. Enter on a focused starter sends exactly “Furnish the Living & dining.”
The section collapses after sending and can reopen. Keyboard focus has a 3 px outline. No page
overflow at any tested width; on mobile the conversation scroll exposes the remaining ideas.

## Verification

Ten new tests in `apps/editor/tests/designer-starters.test.mjs`: fallback, scene edits, uncertain
catalog entries, concave/boundary/floor membership, renovation phases and built-ins, compass rotation,
interior/removed windows, deterministic maximum count, elevated cabinets and shell-derived height. The cabinet regression
was added after read-only review, observed failing, and fixed in code. No existing test changed.

Single writer: `designer-starters.ts`, `designer-panel.ts`, `designer-panel.css`, the new test and this
evidence directory. No editor contracts, store, main markup, service, knowledge or fast path changed.


Measured final commands, all exit 0:

```text
VITEST_MAX_WORKERS=1 pnpm test
406 designer; 122 + 38 Python; 12 showcase; 7 hooks; 6 + 67 editor Node tests
11,202 explicitly reported editor assertions; all 10 new starter tests passed
pnpm typecheck: engine, designer, showcase, editor passed
pnpm --filter @varpet/editor build: passed
```

Full output: [tests](verification-test.log), [typecheck](verification-typecheck.log),
[build](verification-build.log). Existing chunk-size advisory only. Fresh read-only review: **APPROVE**.

DONE: **7 of 7**
- 1 ✓ Browser proof and new tests demonstrate scene edits, north, fallback and zero automatic requests.
- 2 ✓ Untargeted test/typecheck outputs above, editor build green.
- 3 ✓ Ten behavior tests added, including two observed red/green geometry regressions.
- 4 ✓ No protected contract, scene fixture or existing test changed; all selectors retained.
- 5 ✓ Read-only reviewer approved code, screenshots and logs; height refinement also approved.
- 6 ✓ Room naming, model occupancy and provisional heights are explicitly identified above.
- 7 ✓ File ownership is listed above; no other agent edited these files.

Not proven: universal daylight availability or physical inventory; suggestions use scene evidence only.
The controlled replay is not a second live-model conversation. Nothing requested was descoped.
