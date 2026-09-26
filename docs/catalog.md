# Connecting to the furniture catalog

Owner: Sergey. The catalog is Postgres 17 + pgvector on the team VM, database `varpet`, read by
`catalog/search.py` and served to agents by `catalog/mcp_server.py`. Mock data: 7,953 ABO products that
have a 3D model. Sizes are metres `[w, d, h]`, prices whole dram (mock). Details and test results:
Notion, Docs / Furniture DB & search.

## 1. Access (once per laptop)

1. Send Sergey your SSH public key; he adds it to `sergey@152.53.158.86` (Tailscale `100.107.246.46`).
2. Get the DB password from Sergey (not in git). Put this in your shell or `~/.config/varpet/env`:
   ```sh
   export VARPET_DB_URL=postgresql://varpet:<password>@localhost:15432/varpet
   ```
3. Open the tunnel (Postgres listens only on the VM's localhost):
   ```sh
   ssh -fN -o ServerAliveInterval=30 -L 15432:localhost:5432 sergey@152.53.158.86
   ```
4. Install the Python side: `uv sync --directory catalog`.

Check: `uv run --directory catalog python search.py '{"kind":"sofa","colors":["blue"],"fit_box":[2.2,1,1]}'`

## 2. As an MCP server

stdio server, read-only. Tools: `list_vocab`, `search_furniture`, `find_similar`, `get_item`, `check_fit`.

Codex:
```sh
codex mcp add varpet-catalog --env VARPET_DB_URL=$VARPET_DB_URL -- uv run --directory "$PWD/catalog" mcp_server.py
```
Claude Code:
```sh
claude mcp add varpet-catalog -e VARPET_DB_URL=$VARPET_DB_URL -- uv run --directory "$PWD/catalog" mcp_server.py
```
Under `deny_all` approvals set `default_tools_approval_mode = "approve"` on this server (see Notion,
Engineering / Codex harness).

## 3. From code

- Python: `from search import Query, search` (see `catalog/search.py`).
- The designer's `search_catalog` (`packages/designer/src/catalog.ts`) already calls `search.py` in a
  subprocess.

## Things to know

- **Hard filters:** kind, `max_w/max_d/max_h` (rotation allowed), `price_max`. Colour, style, text and
  likeness only rank. An empty result carries `nearest_misses` with the failing constraint.
- **Text mode:** `text_mode='vector'` (SigLIP 2) scored best in our eval (precision@5 0.82 vs 0.72 for
  `fts`). It downloads the model (~1.5 GB) on first use; `fts` needs no model.
- **Sizes:** `size_status` is `confirmed`, `estimated` or `conflict` (mesh, listing and name disagree).
  Search fits use `fit_size_m`, the larger size on a conflict. `wd_swapped: true` means the mesh faces
  sideways: rotate it 90° when placing.
- **3D model:** `glb_url` from `get_item` (ABO, CC BY 4.0, attribution needed).
