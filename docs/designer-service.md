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
`catalog` may carry the editor store's immutable `CatalogAsset[]`; when absent, the bridge uses the
editor's local demo catalog. Unknown asset IDs fail rather than acquiring invented dimensions.
`catalogCurrency: "AMD"` explicitly confirms purchase-price units. Without it, owned furniture can
be rearranged, but unlabelled editor prices are not treated as dram quotations.

Response: `Content-Type: application/x-ndjson`, one JSON object per line. Zero or more progress lines, then
exactly one final line:

```json
{"type": "progress", "message": "Checking the walkway to the door"}
{"type": "proposal", "conversationId": "c1", "proposal": { "id": "...", "title": "...", "description": "...", "command": { "id": "...", "label": "...", "source": "designer", "baseRevision": 12, "operations": [] } }, "metrics": {}}
{"type": "question", "conversationId": "c1", "question": "Cozier how?", "options": ["warmer light", "fewer pieces", "softer seating"]}
{"type": "decline", "conversationId": "c1", "message": "Moving walls is outside my scope; I can help with furniture and finishes."}
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
Both commands accept `--catalog catalog.json`, `--currency AMD`, `--keep`, `--north` and `--swings`.
The service passes identical extras to both conversions so the accepted proposal's scene fingerprint
must match the supplied snapshot. The translator checks the resulting command with the editor's store.

## Browser adapter

`createDesignerHttpAdapter` in `apps/editor/src/adapters/designer-http.ts` implements the existing
`DesignerAdapter`. Configure `request`, `catalog`, the optional extras above, `onProgress(message)`
and `onConversationId(id)` when constructing it; call `propose(scene, revision, signal)` as before.
It returns a preview without applying it. The separate Designer panel session owns the chat UI and
its wiring, using `askDesigner` and `designerHttpAdapter` described below.
`DesignerQuestionError` and `DesignerDeclineError` preserve non-proposal outcomes for the UI.
Aborting the supplied signal cancels the HTTP stream and the service's worker processes.

### Catalog purchases

[measured configuration] Set `VITE_CATALOG_ASSETS_URL=http://localhost:8765/editor/assets` for the
local catalog tunnel. The editor resolves and validates the merged remote/demo catalog before creating
EditorStore. Without that flag, or when the remote catalog cannot be loaded or validated, it uses the
demo catalog. The catalog stays fixed for the store session; reload the app to fetch a new set.
Chat snapshots carry that exact catalog and `catalogCurrency: CATALOG_CURRENCY` (`AMD`) on initial and
follow-up requests. Point the designer service's `VARPET_CATALOG_URL` at the same service's `/mcp` route.
The remote catalog has real product records but its current AMD prices are mock prices, not shop quotes.

[derived compatibility] Purchased `desk` maps to editor `table`; `dresser`, `wardrobe`, `nightstand`
map to `cabinet`; `stool`, `ottoman`, `bench` map to `chair`. SKU, dimensions, price and currency checks
remain exact. Subsequent editor-to-designer conversion uses the editor's broad kind; the editor contract
does not carry a separate semantic subtype.

[measured source, catalog commit `206e3c6`] There is no mapped-kind enable flag in
`catalog/select_editor_set.py`: its only CLI flag is `--total`. Sergey must extend `EDITOR_KINDS` and
`SHARE`, and map the REST asset's kind to the editor kind, before those extra subtypes enter the set.

[measured, 26 Sept 2026] The exact request "add an armchair for reading by the window" passed through
the real HTTP service and catalog MCP with 895 merged assets in 46.444 seconds (66,428 tokens;
`gpt-6-astra`, low, without-place, compact-base). EditorStore accepted the added Rivet armchair
`abo:B071J7Q6KD` after approval on a disposable scene. Its 77,000 AMD price is marked `mock` by the
catalog. The independent request check confirmed the existing 1.5 m near-window policy.
Evidence: `packages/designer/eval/catalog-armchair-smoke.json`; reproduce with
`pnpm --filter @varpet/designer exec tsx eval/catalog-armchair-smoke.ts --live --output /tmp/new-purchase-run.json`.
Browser rendering and the remote GLB download were not measured by this HTTP check.

Derived coordinate mapping: editor `[x, y, z]` maps to designer `[x, -z]`; rotation radians about +Y
map to counterclockwise degrees; dimensions `[width, height, depth]` multiplied by object scale map
to `[width, depth, height]`. Existing poses and scale survive the reverse conversion.
Locked and retained objects become keeps. The CLI moves groups together, using one anchor operation;
programmatic bridge callers opt in with `groupPolicy: "move-together"` (the legacy default keeps groups).
Unsupported elevations, building components,
service routes, renovation removal/replacement phases and furniture spanning rooms fail explicitly.
Assumed: rugs are floor coverings, so they retain containment and request checks but do not block
usable floor, furniture or door sweeps. This does not measure real door under-clearance.

## How the service gets the proposal

The designer MCP server writes every accepted proposal to `$VARPET_PROPOSALS_DIR/<proposal-id>.json`
(its ops, rationale and score) when that variable is set. The service sets it to a fresh temp folder per
request, points `VARPET_SCENE` at the converted scene, runs the Designer thread, and when the thread ends
with a proposal it runs `to-command` and returns the `AgentProposal`. A question or decline from the
thread comes back as the matching final line.

## Verification

The HTTP unit tests exercise progress and disconnect cancellation with real sockets and subprocesses.
`packages/designer/test/editor-service-e2e.test.ts` connects the real browser adapter, HTTP service,
bridge CLI, MCP proposal gate and proposal persistence to the editor's own `validateScene` and
`EditorStore`. Only model reasoning is replaced with a deterministic worker; it does not measure
live model latency or browser rendering. The store still requires approval and rejects stale edits.
Measured 2026-09-26: all 20 objects and all openings in the editor demo convert. The standing regression
moves the living-room lounge chair and applies its accepted command in EditorStore despite baseline
walkway failures. There are 31 with physical wall thickness included (the earlier centre-line model
reported 29). Existing non-worsened failures remain notes; new or
worsened ones block. This is a preview comparison, not certification that the original flat is legal.

Colour ops carry an explicit item/wall target and `#RRGGBB` value and must match `set_intent.colors`.
Object colours become `update {patch:{color}}`. Simple wall colours become `update-wall {patch:{color}}`;
material-backed or renovation-mode walls use appearance-only finish assignments so the paint is visible
and does not mark the wall for structural replacement. The browser rejects geometry in wall patches.
One wall colour affects both faces and all original-wall segments. V2 project data is retained on the
original snapshot; only requested command effects and the editor's normal assumption invalidation apply.
Finish work is unquoted; the reported incremental furniture purchase cost does not price paint or labour.
The Avani standing fixture also caught a rug penetrating the west wall by 5 mm. Wall thickness now
crosses the bridge into preview checks, circulation and wall/corner placement; the same candidate is
refused before translation. A smaller valid group move still passes the designer and editor gates.

## Inside the editor (added 26 Sept 14:00: the editor owner is not adding designer UI, so we build it)

`apps/editor/src/adapters/designer-http.ts` (main designer session) exports exactly:

```ts
export interface DesignerRequest {
  scene: SceneDocument; revision: number; request: string; conversationId?: string;
  keep?: string[]; doorSwings?: Record<string, 'in-left' | 'in-right' | 'out-left' | 'out-right'>; northDeg?: number;
}
export type DesignerReply =
  | { type: 'proposal'; conversationId: string; proposal: AgentProposal; metrics?: unknown }
  | { type: 'question'; conversationId: string; question: string; options: string[] }
  | { type: 'decline'; conversationId: string; message: string }
  | { type: 'error'; message: string };
export function askDesigner(req: DesignerRequest,
  opts?: { baseUrl?: string; onProgress?: (message: string) => void; signal?: AbortSignal }): Promise<DesignerReply>;
export const designerHttpAdapter: DesignerAdapter; // propose(scene, revision) = askDesigner with a default request
```

Default `baseUrl`: `import.meta.env.VITE_DESIGNER_URL ?? 'http://127.0.0.1:8787'`.

`apps/editor/src/ui/designer-panel.ts` (+ its CSS; the panel session) is the customer's chat: a text box, the
conversation, a live progress line, option buttons for a question, the decline message, and for a proposal the
editor's existing review/approve flow (the same one the Suggest button uses). Wiring in `apps/editor/src/main.ts`
is kept to a few lines: mount the panel, and use `designerHttpAdapter` when `VITE_DESIGNER_URL` is set,
otherwise the mock.
