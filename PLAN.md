# v2 plan

Pascal replaces our editor and architect pipeline. We keep what is ours: the portal website, the Folio look,
the designer chat, the catalog of real products. Pascal's editor needs Next.js and React, so our vanilla-TS UI
is ported to React with the same markup and CSS classes. v1 source (read only): `/Users/snek/dev/varpet` on main.

## Lanes
Each lane works in its own worktree and branch (`v2/<lane>`), owns only the paths listed, and commits there.
Shared files (root and app `package.json`, `layout.tsx`, `globals.css`, `next.config.ts`, contracts) are not
owned by any lane: a lane that needs a dependency or a contract change reports it instead.

| Lane | Owns | Done when |
|---|---|---|
| A editor | `apps/web/app/editor/**`, `apps/web/app/api/scenes/**`, `apps/web/components/editor/**`, `apps/web/lib/scenes/**`, `apps/web/app/pascal-theme.css`, `apps/web/public/pascal/**` | `/editor/:sceneId` loads and saves through the store; a `scene_events` row written outside the browser shows in the open editor within a second; Folio theme on Pascal; catalog tab uses `/api/catalog/search` |
| B portal | `apps/web/app/(portal)/**`, `apps/web/app/api/{account,apartments,developers,bundles,studio,shares,catalog,flats}/**`, `apps/web/components/portal/**`, `apps/web/lib/server/**`, `apps/web/styles/**` | v1 portal pages render in React with v1 CSS; the API routes behave like v1's `apps/editor/server/*` |
| C agents | `packages/scene-mcp/**`, `packages/agents/**`, `apps/web/app/api/agents/**`, `prompts/**` | one real designer turn against a test scene: the agent calls `place_product`, a proposal scene holds the item, the NDJSON stream matches `AgentEvent` |
| D chat | `apps/web/components/designer/**`, `apps/web/components/intake/**`, `apps/web/lib/agent-stream.ts` | the React designer panel and plan intake render a recorded `AgentEvent` stream: steps, tool rows, proposal card with Apply and Dismiss, composer with image attach |

After A to D merge: integration (panel in the editor sidebar, Apply wired, portal links into the editor), then
deploy to the VM (needs `claude setup-token` there).

## Not in v2 yet
The Python catalog service stays on main and keeps running on the VM; v2 calls it over HTTP. The part compiler,
the recorded demos (buyer, showcase) and the old harness are not ported.
