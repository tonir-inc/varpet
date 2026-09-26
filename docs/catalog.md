# Connecting to the furniture catalog

Owner: Sergey. Mock data: 7,953 ABO products with a 3D model; sizes in metres `[w, d, h]`, prices in whole
dram (mock). Details and test results: Notion, Docs / Furniture DB & search.

## How it runs

- **Service:** `varpet-catalog` (systemd) on the team VM `mc-server`, MCP over streamable HTTP, bound to
  the Tailscale address only: **`http://100.107.246.46:8765/mcp`**. Read-only, runs as its own user,
  capped at 2 GB RAM and 2 CPUs (the box is shared).
- **Database:** Postgres 17 + pgvector on the same VM, database `varpet`, localhost only. Only the
  service talks to it.
- **Tools:** `list_vocab`, `search_furniture`, `find_similar`, `get_item`, `check_fit`.

## Connect (once per laptop)

1. Be on the tailnet with `mc-server` shared to you (ask Felix), and have Tailscale running.
   Check: `curl -s -o /dev/null -w '%{http_code}\n' http://100.107.246.46:8765/mcp` prints a status code.
2. Register the server:
   - Codex: `codex mcp add varpet-catalog --url http://100.107.246.46:8765/mcp`
   - Claude Code: `claude mcp add --transport http varpet-catalog http://100.107.246.46:8765/mcp`
   - Under `deny_all` approvals set `default_tools_approval_mode = "approve"` on this server.
3. From code: any MCP client on that URL.

No password or DB access is needed on laptops. The designer's `search_catalog`
(`packages/designer/src/catalog.ts`) currently calls `catalog/search.py` directly with `VARPET_DB_URL`;
pointing it at the MCP URL instead removes that need.

## Things to know

- **Hard filters:** kind, `max_w/max_d/max_h` (rotation allowed), `price_max`. Colour, style, text and
  likeness only rank. An empty result carries `nearest_misses` with the failing constraint.
- **Text:** keyword + SigLIP 2 vector (best in our eval: precision@5 0.82 vs 0.72 keyword only).
- **Sizes:** `size_status` is `confirmed`, `estimated` or `conflict` (mesh, listing and name disagree).
  Fit checks use `fit_size_m`, the larger size on a conflict. `wd_swapped: true` means the mesh faces
  sideways: rotate it 90° when placing.
- **3D model:** `glb_url` from `get_item` (ABO, CC BY 4.0, attribution needed).

## Operate (Sergey)

- Deploy or update: `cd catalog && ./deploy/deploy.sh` (needs SSH to the VM and `VARPET_DB_URL`).
- Logs: `ssh <vm> journalctl -u varpet-catalog -f`.
- Load or refresh data from a laptop through a tunnel:
  `ssh -fN -L 15432:localhost:5432 <vm>`, then `uv run ingest_abo.py`, `colors.py`, `embed_siglip.py`.
