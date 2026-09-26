#!/usr/bin/env bash
set -euo pipefail
set +x

CATALOG_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
ENV_FILE="$HOME/.config/varpet/local.env"
if [[ ! -r "$ENV_FILE" ]]; then
    printf 'Run catalog/demo/setup_local.sh first (local.env is missing).\n' >&2
    exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"
export VARPET_DB_URL CATALOG_HTTP_HOST CATALOG_HTTP_PORT CATALOG_MODELS_DIR
command -v uv >/dev/null || { printf 'uv is missing; run setup_local.sh.\n' >&2; exit 1; }
command -v lsof >/dev/null || { printf 'lsof is required to check port 8765.\n' >&2; exit 1; }
# Include wildcard listeners, which also occupy 127.0.0.1:8765.
if lsof -nP -iTCP:8765 -sTCP:LISTEN -Fn 2>/dev/null | grep -E '^n(127\.0\.0\.1|\*):8765$' >/dev/null; then
    printf 'Something already listens on 127.0.0.1:8765; stop it before starting the catalog.\n' >&2
    exit 1
fi
printf 'MCP http://127.0.0.1:8765/mcp\n'
printf 'VARPET_CATALOG_URL=http://127.0.0.1:8765/mcp pnpm dev\n'
printf 'Health http://127.0.0.1:8765/health (wait for model_ready: true)\n'
cd "$CATALOG_DIR"
# Dependencies and model weights were cached by setup; never download on stage.
export UV_OFFLINE=1 UV_FROZEN=1 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
unset SIGLIP_DIR
exec uv run mcp_server.py
