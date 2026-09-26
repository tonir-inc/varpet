# Local demo catalog
Runs PostgreSQL, catalog MCP, GLBs, previews and SigLIP on the Apple Silicon demo Mac; Homebrew is required.
From the repository root, prepare while online: `catalog/demo/setup_local.sh`.
Start in the foreground: `catalog/demo/run_local.sh` (Ctrl-C stops the service).
Setup needs VM SSH access; override `VARPET_SSH` and `VARPET_SSH_KEY` if needed.
Reruns refresh the local database from the VM, reuse credentials, and download only missing served files.
Credentials live in `~/.config/varpet/local.env` (600); optionally supply `VARPET_LOCAL_DB_PASSWORD` to setup.
Local editor: `VARPET_CATALOG_URL=http://127.0.0.1:8765/mcp pnpm dev`.
Local designer/harness: set `VARPET_CATALOG_URL=http://127.0.0.1:8765/mcp` in `~/.config/varpet/env`, then restart it.
To switch back, use `http://100.107.246.46:8765/mcp` in both places and restart; the VM needs Tailscale or a tunnel.
Health: `http://127.0.0.1:8765/health`; wait for `ok: true` and `model_ready: true` before presenting.
Budget at least 15 GB free for the dump, database, Python/model caches and missing assets; actual usage varies.
Local assets use hard links; the served base-kind VM models alone were about 1.9 GB (26 Sept); setup prints current totals.
Data stays in gitignored `catalog/data/demo/` and local caches; credentials stay outside the repo. Data never goes into git.
Setup downloads dependencies/model weights; runtime uses their offline caches and needs no VM, Tailscale or tunnel.
