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
`catalog` carries the exact `CatalogAsset[]` captured for this request. The editor registers database
assets dynamically; an existing registered ID retains its identity while the scene or undo history uses
it. Legacy callers that omit `catalog` still get the bridge's local demo catalog; the current editor
passes its database catalog explicitly, including an empty array. Unknown asset IDs fail rather than
acquiring invented dimensions.
`catalogCurrency: "AMD"` explicitly confirms purchase-price units. Without it, owned furniture can
be rearranged, but unlabelled editor prices are not treated as dram quotations.

Response: `Content-Type: application/x-ndjson`, one JSON object per line. Zero or more progress or message-delta lines, then
exactly one final line:

```json
{"type": "progress", "message": "Checking the walkway to the door"}
{"type": "proposal", "conversationId": "c1", "proposal": { "id": "...", "title": "...", "description": "...", "command": { "id": "...", "label": "...", "source": "designer", "baseRevision": 12, "operations": [] } }, "metrics": {}}
{"type": "question", "conversationId": "c1", "question": "Cozier how?", "options": ["warmer light", "fewer pieces", "softer seating"]}
{"type": "message_delta", "delta": "A quieter palette "}
{"type": "message", "conversationId": "c1", "message": "**Minimalism** reduces visual clutter; it does not mean an empty home.", "suggestions": ["Make it warmer", "What would it cost?"]}
{"type": "decline", "conversationId": "c1", "message": "Moving walls is outside my scope; I can help with furniture and finishes."}
{"type": "error", "message": "..."}
```

`proposal` is exactly the editor's `AgentProposal` (`apps/editor/src/contracts.ts`), with `source: "designer"`
and `baseRevision` = the request's `revision`. Closing the connection aborts: the service kills the
Designer thread's whole process group. CORS allows `http://localhost:5173` (the editor's dev server).
A request takes 30–120 s; send a progress line at least every 10 s so proxies and the editor stay alive.

Proposal replies may also carry `notes`, one nonempty string of at most 1,600 characters beside
`proposal` and `metrics`. The panel displays it as a muted, collapsed **Notes** disclosure and retains
it with conversation history. It is not part of the editor's command or `AgentProposal` contract.
After bridge validation, `harness/designer_presentation.py` derives a specific title and one plain
paragraph from the accepted edits and measured scores: what changes, the numbers, and one trade-off.
Mock prices, missing sun direction, unverified door swings and unchanged access problems go in Notes;
an actual tight clearance or shared-wall paint scope stays visible in the paragraph. Raw tool rationale,
proposal IDs, operations, checks, scores, model prompts and eval grading remain unchanged. This adds
no model call. Legacy custom bridges without accepted operations retain their original copy.

## Opt-in tool and build events (website contract, 26 September 2026)

[Derived contract, agreed with PICTURE's controller] Add `"events": true` to the request.
Omitted or `false` preserves the existing progress/delta/final stream. Non-boolean values fail
request validation. Tool/build lines are **nonterminal** and never authorize a scene edit.
Clients consume them in wire order until the usual single proposal/question/message/decline/error.
No event may follow that terminal record. Disconnect cancels the designer and its builders.

```ts
type ToolEvent = {
  type: 'tool'; name: string; phase: 'start' | 'end' | 'error';
  callId?: string; summary: string;
  refs?: {
    results?: string[]; candidates?: string[]; itemIds?: string[];
    slotId?: string; size_wdh_m?: [number, number, number];
    proposalId?: string; ok?: boolean; cost_dram?: number;
    currency?: 'AMD'; basis?: string; price_source?: 'mock' | 'catalog' | 'unknown';
  };
};
type BuildEvent = {
  type: 'build'; slotId: string;
  state: 'queued' | 'building' | 'fixing' | 'done' | 'failed';
  glb?: string; reason?: string;
};
```

`name` preserves the tool name: `set_intent`, `scene_summary`, `search_catalog`, `reserve_slot`,
`build_piece`, `place`, `check_layout`, `score_layout`, `sun`, `propose`, `ask`.
`show_candidates` is an **observed result event**, emitted at `phase:"end"` after a successful
search returns candidates/products, even if there was no separate model tool call of that name.
`quote` is likewise an `end` event derived from the saved checked proposal's price, after the
editor bridge accepts it, immediately before the final proposal. Its basis remains
`incremental_purchases` until ownership pricing lands; it is not a promised workshop price.
`check_layout` and `place` can be derived `end` observations of a successfully checked composition
returned by `propose`, when the model did not call those tools separately. These carry the proposal
reference; they do not claim extra model calls. No fake starts are emitted for derived observations.

Tool phases mean invocation, completed result, and failed result. `callId`, when present, correlates
SDK starts/ends (derived events may reuse that call ID); it is not an ordering counter.
`summary` is bounded plain customer text (1–300 characters). IDs are at most 200 characters;
reference arrays contain at most 100 IDs. Size is metres in **W/D/H**, all positive; prices are
nonnegative whole AMD. Refs are an allowlisted projection, never raw arguments/results, reasoning,
image bytes, local file paths or private prompts. Unknown tool names do not expose their payloads.

Build names/states exactly match PICTURE's `BuildPool.turn(..., emit)` callback. A slot normally
moves `queued → building → [fixing → building] → done|failed`; repeated states are allowed,
and different slots interleave. The first observed state may be later than queued on a resumed
request. `done` requires `glb: "/designer/files/<conversationId>/<slotId>.glb"`; `failed` requires
`reason` (1–300 characters). Neither is a successful layout approval. Keep a failed slot as a grey
placeholder and show its reason. Do not synthesize success when a build or connection fails.

The final proposal waits for all referenced builds to finish and may include `assets: CatalogAsset[]`.
These are private conversation assets with fixed dimensions and prices: provisional
`source:{type:"procedural"}`, finished `source:{type:"gltf",url:"/designer/files/...glb"}`.
Consumers validate the assets and command together, then register assets before preview/application.
The file route serves only known successful GLBs for that conversation, never arbitrary files.
Progress and message-delta records retain their old shape. Existing callers need not opt in merely
to receive a checked proposal. The editor adapter exposes `onEvent(event)` and the chat opts in,
using the same single progress line with elapsed time; websites may render a richer timeline.

### Recorded replay for the website

`packages/designer/eval/event-stream-sample.ndjson` is a **composite replay of measured recordings**,
not a claim that custom building and the industrial proposal ran in one live request. Its designer
starts/ends, candidate IDs, checks, quote and final proposal are projected from the recorded
industrial Avani turn at 2026-09-26 13:49 UTC (`after-styles` evaluation); the cabinet build states
are copied from PICTURE's real 54.351 s / 86,193-token controller run. The reserve-slot completion
is reconstructed from that run's persisted slot record, labelled in its summary. The custom cabinet
is an independent lifecycle example, not an item in the final industrial proposal, so it is not
smuggled into that proposal's `assets`. Its GLB URL requires the corresponding running service;
the sample does not bundle private source images or a model file. Replay with the Avani empty-room
scene and catalog from that recorded evaluation if applying its final proposal.

This first contract/sample commit unblocks timeline rendering before the opt-in runtime lands.
Failure/fixing/cancellation behavior is covered by the runtime tests; this successful recording
must not be relabelled as evidence of a real failed build.

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
`DesignerQuestionError`, `DesignerMessageReply` and `DesignerDeclineError` preserve non-proposal outcomes for the UI. `askDesigner` converts them into the corresponding reply union.
Aborting the supplied signal cancels the HTTP stream and the service's worker processes.

### Catalog purchases

[measured source, editor main `223cd22`] The editor starts with an empty v2 apartment and resolves
real furniture through same-origin `/api/catalog/search` and `/api/catalog/items`. It registers returned
assets with `EditorStore.registerCatalogAssets`; there is no demo-catalog fallback in current startup.
Chat requests carry the captured catalog and `catalogCurrency: CATALOG_CURRENCY` (`AMD`).
`VITE_CATALOG_ASSETS_URL=http://localhost:8765/editor/assets` additionally enables full-set discovery
for a designer request. Existing registered identities take precedence; proposal additions are retained
by `DesignerProposalCatalog` and registered before preview or approval. Without that optional URL,
discovery is limited to the editor's currently retained database products. The designer MCP search may
find a SKU outside that snapshot, which the bridge correctly refuses as unknown.
Point the designer service's `VARPET_CATALOG_URL` at the same catalog service's `/mcp` route.
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

[measured attempt, 26 Sept 2026] The latest normalized v2/database-only trio is reproducible with
`pnpm --filter @varpet/designer exec tsx eval/latest-editor-smoke.ts --live --output /tmp/current-editor-run.json`.
It uses real same-origin catalog middleware, the configured discovery path above, independent disposable
EditorStores, and checks ceiling metadata and archived v2 data after approval. Furniture poses are assumed
test data in the current Avani shell. The recorded attempt in `eval/latest-editor-smoke.json` stopped at
catalog hydration (HTTP 503; localhost tunnel refused connections and the tailnet endpoint timed out).
No model calls ran, so this attempt supplies no request timings or live proposal-acceptance evidence.

[measured after tunnel recovery, 26 Sept 2026] The same collector completed all three exact requests
on the refreshed main using 877 database assets. EditorStore accepted sage bedroom paint in 31.514 s,
the living-room rearrangement in 59.687 s, and the reading-chair addition in 41.358 s. Paint covered all
five physical bedroom wall sections; the rearrangement increased the largest free rectangle from
22.68 to 30.24 m². Every run preserved ceiling designs, room metadata, baseline, archived options,
other unrelated v2 project fields and structural geometry. These timings include the HTTP request.
The added `abo:B075X4F5CH` costs 80,000 AMD (mock). Its catalog name says “angled chair”, so the narrow
name-only armchair heuristic remained false; its catalog photograph visibly shows two upholstered
armrests. The raw flag and separate visual adjudication are retained in `eval/latest-editor-live.json`.
All other purchase checks, including near-window placement, passed. No browser rendering was measured.

Derived coordinate mapping: editor `[x, y, z]` maps to designer `[x, -z]`; rotation radians about +Y
map to counterclockwise degrees; dimensions `[width, height, depth]` multiplied by object scale map
to `[width, depth, height]`. Existing poses and scale survive the reverse conversion.
Locked and retained objects become keeps. The CLI moves groups together, using one anchor operation;
programmatic bridge callers opt in with `groupPolicy: "move-together"` (the legacy default keeps groups).
Unsupported room/furniture elevations, shell removal/replacement phases and furniture spanning
rooms still fail conversion. Building components and service routes become immutable, unpriced
structural obstacles, using editor world transforms and conservative segment prisms.
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
[measured regressions] Room ceilings live in `project.metadata[roomId].ceilingDesign`: enabled,
disabled and null values survive unrelated designer edits, along with sources, assumptions, materials,
finishes, tasks, baseline and inactive options. The `inside` camera view is editor UI state. After an
architect's approved `replace-scene`, the next request captures that fresh v2 apartment and revision;
designer approval preserves it instead of restoring the previous apartment. Registered photo-built GLB
assets also pass through when supplied in the request catalog. Active building components and service
routes participate in collision and access checks; elevated rooms remain unsupported for layout edits.
Coverage: `test/editor-current-v2.test.ts` and `test/editor-http-current-v2.test.ts` in the designer package.
Finish work is unquoted; the reported incremental furniture purchase cost does not price paint or labour.
The Avani standing fixture also caught a rug penetrating the west wall by 5 mm. Wall thickness now
crosses the bridge into preview checks, circulation and wall/corner placement; the same candidate is
refused before translation. A smaller valid group move still passes the designer and editor gates.

## Inside the editor (added 26 Sept 14:00: the editor owner is not adding designer UI, so we build it)

`apps/editor/src/adapters/designer-http.ts` (main designer session) exports exactly:

```ts
export interface DesignerRequest {
  scene: SceneDocument; revision: number; request: string; conversationId?: string;
  catalog?: CatalogAsset[]; catalogCurrency?: 'AMD';
  keep?: string[]; doorSwings?: Record<string, 'in-left' | 'in-right' | 'out-left' | 'out-right'>; northDeg?: number;
}
export type DesignerReply =
  | { type: 'proposal'; conversationId: string; proposal: AgentProposal; metrics?: unknown; notes?: string }
  | { type: 'question'; conversationId: string; question: string; options: string[] }
  | { type: 'message'; conversationId: string; message: string; suggestions?: string[] }
  | { type: 'decline'; conversationId: string; message: string }
  | { type: 'error'; message: string };
export function askDesigner(req: DesignerRequest,
  opts?: { baseUrl?: string; onProgress?: (message: string) => void; onMessageDelta?: (delta: string) => void; signal?: AbortSignal }): Promise<DesignerReply>;
export const designerHttpAdapter: DesignerAdapter; // propose(scene, revision) = askDesigner with a default request
```

Default `baseUrl`: `import.meta.env.VITE_DESIGNER_URL ?? 'http://127.0.0.1:8787'`.

`apps/editor/src/ui/designer-panel.ts` (+ its CSS; the panel session) is the customer's chat: a text box, the
conversation, a live progress line, option buttons for a question, the decline message, and for a proposal the
editor's existing review/approve flow (the same one the Suggest button uses). Wiring in `apps/editor/src/main.ts`
is kept to a few lines: mount the panel, and use `designerHttpAdapter` when `VITE_DESIGNER_URL` is set,
otherwise the mock.

## Conversation answers and streaming

[derived contract, 26 September 2026] `message` is a free answer, distinct from a clarification
(`question`) and an actual out-of-scope action refusal (`decline`). Its `message` is nonempty text of
at most 4,000 characters; optional `suggestions` holds zero to four nonempty strings, each at most
300 characters. No answer carries scene operations. The same `conversationId` resumes the designer
thread, so “why?” refers to earlier choices. Every request still includes the current authoritative
scene; discussing or accepting an offer is separate from applying a checked proposal in the editor.

[derived protocol] Plain final model text becomes `message`. A genuine refusal uses `DECLINE:`
(the service removes that marker), or a typed JSON `decline` envelope. A typed JSON `message`
envelope can supply suggestions. Unknown fields and invalid suggestion values fail validation.
Progress reports observed tool stages in plain language; heartbeats repeat the current stage.
`message_delta` contains an append-only `delta` string. Only SDK `final_answer` text from a turn
with no tool calls streams; commentary, reasoning and tool payloads never do. JSON replies and
refusal markers are buffered. The final reply is authoritative and replaces the transient draft.
Clients must not treat a delta as the terminal record; cancellation, error, or a proposal clears it.
Both the completed answer and the cumulative draft are bounded to 4,000 characters.

[derived UI] The panel supports paragraphs, bold, emphasis, inline code and short lists. HTML is
escaped and links remain inert text. Answer suggestions and proposal follow-ups send an ordinary
customer message; proposal chips include its title and current status to identify the reference.
Enter sends, Shift+Enter inserts a newline, IME composition does not submit. Retry resends the
failed request using the captured conversation identity and a fresh scene snapshot. MAIN's specific
proposal title, warm paragraph and collapsed Notes remain unchanged.

[assumed scope] General advice and explanations require zero model tool calls and do not silently
become changes. Design knowledge remains owned by QUALITY; routing and acceleration remain owned
by FAST. This change adds the shared conversation policy and transport/UI, without a new classifier.
Measured browser evidence and limitations: `apps/editor/docs/conversation-pass/README.md`.

## Picture lane handoff: custom slots and queued builds

[Derived integration proposal, 2026-09-26 UTC; PICTURE owns tools/build controller, CHAT owns
wire events and final asset delivery, SERVICE owns images/lifetime.] Keep the editor contracts
unchanged. A slot record has `source: "custom"`; its nested editor `asset.source` is
`{type:"procedural"}` while grey, then `{type:"gltf",url:...}` when built. Do not put
`source:"custom"` into an editor CatalogAsset. Asset dimensions are **W/H/D**; stored
`size_wdh_m` is **W/D/H** and never changes after reservation.

The planned filesystem boundary mirrors `VARPET_PROPOSALS_DIR`:

- SERVICE gives the MCP process `VARPET_BUILDS_DIR=<conversation root>/builds`,
  `VARPET_CONVERSATION_ID=<service ID>` and `VARPET_TURN_ID=<fresh turn ID>`.
- `reserve_slot(kind,size_wdh_m,note)` atomically persists `slots/<slotId>.json` and returns
  `{slotId,source:"custom",size_wdh_m,asset,item,estimate}`. IDs are code-generated;
  kind allowlist is cabinet/table/shelf (boxy only). No sofa, chair/armchair or upholstered bed.
  Three new slots per turn; stored sizes, kind and price are checked again on proposal.
- After an accepted checked layout includes the slot, `build_piece(slotId)` writes
  `requests/<slotId>.json` and returns `{slotId,state:"queued"}` immediately. Repeated calls
  are idempotent within the turn; unknown, unproposed or older-turn slots fail explicitly. It starts no model inside the MCP process.
- PICTURE adds `harness/designer_builds.py`: a service-owned controller watches that queue,
  uses Felix's runner/dispatch without changing `varpet_harness/`, and limits all conversations
  to four live builders. SERVICE supplies the current turn's private local image paths to it.
  It writes `states/<slotId>.json`, exposes assets for the bridge/final response, and cancels
  its builds on the request cancellation event before image/temp cleanup.
- CHAT consumes controller records with exactly
  `{type:"build",slotId,state:"queued"|"building"|"fixing"|"done"|"failed",glb?,reason?}`;
  emit them only when `events:true`. `done.glb` is
  `/designer/files/<conversationId>/<slotId>.glb`. Failed builds retain their grey asset
  and a reason. The final proposal waits for all referenced builds to reach a terminal state
  and carries `assets: CatalogAsset[]`, which clients register **before** validating the command.
- SERVICE merges the conversation's slot assets with the request catalog for the bridge;
  custom assets remain private, never entering the shared catalog. CHAT serves only known
  successful GLBs from that conversation and owns the HTTP/file route and editor delivery.
- QUALITY owns price provenance. Until its shared estimate function lands, PICTURE's slot
  estimate will be explicitly assumed, sample AMD per volume, labelled
  `estimate, the workshop confirms`; a workshop contact is an example, not a claimed partner.

[Assumed limits, explicit task scope] Four concurrent builds and three custom pieces per turn
supersede the Notion doc's six-lane wording. Step 0 evidence is in
`packages/designer/eval/build-piece.md`; owner likeness is still unrated.

[derived contract, 2026-09-26] Fixtures and route segments retain their vertical extents;
circulation reserves 2 m walking headroom. Planned removals remain obstacles until actually removed
from the editor snapshot. Entirely below-floor solids do not obstruct this floor. Route prisms
conservatively enclose sloping runs and end caps. Fixtures/routes never enter furniture pricing or ops.
If conversion fails, the worker receives the raw editor snapshot with fast path and layout MCP disabled.
Conversation continues in the same thread; the service appends one limitation notice per conversation
and rejects proposal artifacts until conversion succeeds.

[measured, 2026-09-26, gpt-6-astra low] A real HTTP smoke on ephemeral port 51785 with
VARPET_DESIGNER_FAST_PATH=1 answered a pure question on the editor demo augmented with a kitchen
sink, bath and two pipe segments in 10.085 s (zero tool calls). A resumed question with an unsupported
room elevation answered in 8.470 s (zero tool calls), with the limitation notice.

### Product appearance before purchases

Production threads always expose `show_candidates(item_ids)` through the Designer MCP, forwarding
Sergey's exact-model contact sheet and legend. Before adding catalog furniture, the product prompt
requires inspecting the top candidates; `propose` rejects additions whose SKU has not been shown.
This needs no editor flag. `vision.products` remains accepted for older callers. FAST purchase
selection fetches one grid (at most 12 unique SKUs, 8 s catalog / 10 s process deadline) and attaches
it to its existing single structured model call; rearrangements incur no preview request. Failed
previews withhold the purchase, and blank/visibly broken tiles must be rejected by the selector.
Native desk, wardrobe and dresser kinds are retained; legacy aliases remain compatible.

[Implemented PICTURE boundary, pending lane integration verification]
`BuildPool` lives once on `DesignerService.build_pool`. `pool.turn(builds_dir,
conversation_id, turn_id, image_paths, cancel_event, emit)` is a context manager that
watches requests immediately; `finish()` waits for terminal results, and `assets(slot_ids)`
returns the fixed-size editor records. Context exit cancels and joins before turn cleanup.
The service currently passes its local fixture `self.image_paths`; SERVICE must pass the
current turn's upload paths to this same argument when image input lands. Builders use a
conversation-local SDK home, so their SDK logs are also removed at conversation cleanup.

The service's build callback currently emits ordinary progress text. CHAT owns replacing
that callback with opt-in typed records and treating `build` as nonterminal in the HTTP
loop. The callback receives the exact build record described above. Final `assets` are
already supplied by PICTURE after joining builds; CHAT must accept/register them in the
browser and implement its agreed GLB route. Successful files live at
`<conversation root>/builds/work/<slotId>/piece.glb`; serve only when
`builds/states/<slotId>.json` says `done`, and never expose sibling runtime/SDK/program files.
The bridge CLI now accepts `--custom-assets file` to append private slot assets to either
the explicitly supplied catalog or the legacy local catalog, rejecting ID replacement.
Custom provisional assets render as neutral bounds, not invented procedural furniture.

[Measured integration evidence] The real controller ran a low-effort cabinet through
Felix's runner and immutable-size compiler adapter in 54.351 s, 86,193 cumulative tokens,
one turn and zero remaining faults. This later run used an explicit radius constraint in
its brief and lower machine load; it does not replace the frozen step-0 comparison.
`packages/designer/test/custom-slots.test.ts` checks the real Avani demo through placement,
CLI bridge and EditorStore approval. `harness/designer_builds_test.py` checks queueing,
shared four-lane concurrency, three-per-turn cap, idempotency, cancellation, rate limits
and failed-build placeholders with deterministic workers.

[Measured final builder check, 2026-09-26 13:50 UTC, gpt-6-astra low] With the
conversation-local SDK home enabled, the real controller completed the same cabinet in
77.272 s wall time (runner: 72.557 s), 47,835 cumulative tokens, one turn, zero faults.
The actual GLB W/D/H was 0.5 / 0.400000006 / 0.649999976 m. At 13:56 UTC, a focused
Chrome render check loaded this GLB beside the actual editor neutral-slot renderer.
Both displayed with the stored W/H/D 0.50 / 0.65 / 0.40 m. This verifies rendering only;
CHAT's HTTP asset delivery and SERVICE's upload lifetime are separate lane checks.
