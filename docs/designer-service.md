# Designer service: the contract between the editor and the designer

Three pieces meet here. Each is built by a different session; this file is what they agree on.

| piece | where | builds |
|---|---|---|
| editor bridge | `packages/designer/` | converts editor scenes to designer scenes and designer proposals to editor commands; two CLI commands below; `VARPET_PROPOSALS_DIR` |
| designer service | `harness/designer_service.py` | the HTTP endpoint below; runs one Designer thread per request |
| editor adapter | `apps/editor/src/adapters/designer-http.ts` (new file) | implements the editor's `DesignerAdapter` by calling the service |

## HTTP (service, `python harness/designer_service.py --port 8787`, bound to 127.0.0.1)

`GET /designer/health` → `{"ok": true}`

`POST /designer/propose`, JSON body:

```json
{
  "scene": { "format": "varpet.editor", "...": "the editor's SceneDocument, unchanged" },
  "revision": 12,
  "request": "keep the bed and wardrobe, fit a desk by the window",
  "conversationId": "optional; continue an earlier conversation",
  "keep": ["optional object ids the customer wants untouched"],
  "doorSwings": { "opening-id": "in-left | in-right | out-left | out-right" },
  "northDeg": 0
}
```

`keep`, `doorSwings` and `northDeg` are optional until the editor carries them (asked of the editor owner).

Response: `Content-Type: application/x-ndjson`, one JSON object per line. Zero or more progress lines, then
exactly one final line:

```json
{"type": "progress", "message": "Checking the walkway to the door"}
{"type": "proposal", "conversationId": "c1", "proposal": { "id": "...", "title": "...", "description": "...", "command": { "id": "...", "label": "...", "source": "designer", "baseRevision": 12, "operations": [] } }, "metrics": {}}
{"type": "question", "conversationId": "c1", "question": "Cozier how?", "options": ["warmer light", "fewer pieces", "softer seating"]}
{"type": "decline", "conversationId": "c1", "message": "I place furniture; I don't pick paint colours."}
{"type": "error", "message": "..."}
```

`proposal` is exactly the editor's `AgentProposal` (`apps/editor/src/contracts.ts`), with `source: "designer"`
and `baseRevision` = the request's `revision`. Closing the connection aborts: the service kills the
Designer thread's whole process group. CORS allows `http://localhost:5173` (the editor's dev server).
A request takes 30–120 s; send a progress line at least every 10 s so proxies and the editor stay alive.

## Bridge CLI (TypeScript, run with the package's `tsx`)

```
packages/designer/node_modules/.bin/tsx packages/designer/src/editor-bridge.ts to-designer <editor-scene.json> <out-designer-scene.json> [--keep id,id] [--north 0] [--swings swings.json]
packages/designer/node_modules/.bin/tsx packages/designer/src/editor-bridge.ts to-command <designer-proposal.json> <editor-scene.json> <revision> <out-agent-proposal.json>
```

Exit 0 on success; non-zero with one line on stderr otherwise.

## How the service gets the proposal

The designer MCP server writes every accepted proposal to `$VARPET_PROPOSALS_DIR/<proposal-id>.json`
(its ops, rationale and score) when that variable is set. The service sets it to a fresh temp folder per
request, points `VARPET_SCENE` at the converted scene, runs the Designer thread, and when the thread ends
with a proposal it runs `to-command` and returns the `AgentProposal`. A question or decline from the
thread comes back as the matching final line.

## Until the other side lands

Each piece tests against a fake of the other: the service with a stub bridge and a stub thread; the
adapter with a stub server that replays a recorded NDJSON stream.
