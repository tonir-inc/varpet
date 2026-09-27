#!/usr/bin/env bash
# Run on the laptop after review/commit/push. No local secrets or worktree files are uploaded.
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=${VARPET_SSH:-sergey@152.53.158.86}
KEY=${VARPET_SSH_KEY:-$HOME/.ssh/varpet_ed25519}
# Caller synchronizes origin/main first; deliberately no fetch/SSH until this gate passes.
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] || [ -n "$(git status --porcelain)" ]; then
  echo 'refusing to deploy: repo must be clean and HEAD == origin/main; review, commit, push and sync first' >&2
  exit 1
fi
vm() { ssh -i "$KEY" "$HOST" "$@"; }
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
# git archive prevents ignored laptop .env/auth/data files leaking through rsync.
git archive origin/main | tar -x -C "$stage"
git rev-parse HEAD > "$stage/DEPLOYED_REVISION"
vm 'set -eu
  id varpet-app >/dev/null 2>&1 || sudo -n useradd --system --home-dir /opt/varpet-app --create-home --shell /usr/sbin/nologin varpet-app
  sudo -n install -d -o varpet-app -g varpet-app -m 700 /opt/varpet-app/repo /opt/varpet-app/codex-home /opt/varpet-app/runs /opt/varpet-app/data /opt/varpet-app/shares /opt/varpet-app/cache
  # Stop before replacing sources/dependencies, including all Codex/Chrome children.
  for service in varpet-editor varpet-designer varpet-architect; do
    if sudo -n systemctl cat "$service" >/dev/null 2>&1; then sudo -n systemctl stop "$service"; fi
  done'
rsync -az --delete --rsync-path='sudo -n -u varpet-app rsync' -e "ssh -i $KEY" \
  --exclude=node_modules --exclude=.venv --exclude=catalog/data --exclude=.git \
  --exclude=.pnpm-store --exclude=runs --exclude=__pycache__ \
  "$stage/" "$HOST:/opt/varpet-app/repo/"
# No credentials needed here. Codex auth is created on the VM by device login.
# Preserve admin overrides (and any optional secrets); send defaults over stdin only.
vm 'sudo -n sh -c '\''if [ ! -f /etc/varpet-app.env ]; then umask 027; cat > /etc/varpet-app.env; else cat >/dev/null; fi; chown root:varpet-app /etc/varpet-app.env; chmod 640 /etc/varpet-app.env'\''' <<'ENV'
VARPET_PUBLIC_ORIGIN=https://varpet.snek.page
VARPET_CATALOG_URL=http://100.107.246.46:8765/mcp
CODEX_HOME=/opt/varpet-app/codex-home
VARPET_DATA_DIR=/opt/varpet-app/data
VARPET_SHARES_DIR=/opt/varpet-app/shares
VARPET_RUNS=/opt/varpet-app/runs
UV_CACHE_DIR=/opt/varpet-app/cache/uv
XDG_CACHE_HOME=/opt/varpet-app/cache
XDG_CONFIG_HOME=/opt/varpet-app/cache/config
PLAYWRIGHT_BROWSERS_PATH=/opt/varpet-app/cache/ms-playwright
UV_NO_SYNC=1
VARPET_BUILD_LIMIT_PER_HOUR=3
VARPET_PLAN_CHECK_LIMIT_PER_HOUR=30
VARPET_DESIGNER_LIMIT_PER_HOUR=30
VARPET_SPIKE_WARM=0
VARPET_SPIKE_PARALLEL=off
OMP_NUM_THREADS=2
ENV
vm 'sudo -n bash -se' <<'REMOTE'
set -euo pipefail
cd /opt/varpet-app/repo
/usr/bin/node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22 || a===22&&b<13) throw Error("Node >=22.13 required")'
if ! command -v pnpm >/dev/null; then npm i -g pnpm@10; fi
[[ $(pnpm --version) == 10.* ]] || { echo 'pnpm 10 required' >&2; exit 1; }
app() { sudo -n -u varpet-app env HOME=/opt/varpet-app UV_CACHE_DIR=/opt/varpet-app/cache/uv XDG_CACHE_HOME=/opt/varpet-app/cache PLAYWRIGHT_BROWSERS_PATH=/opt/varpet-app/cache/ms-playwright "$@"; }
app pnpm install --frozen-lockfile
# Build against the public origin configured on the VM (/etc/varpet-app.env).
ORIGIN=$(sed -n 's/^VARPET_PUBLIC_ORIGIN=//p' /etc/varpet-app.env)
app env NODE_OPTIONS=--max-old-space-size=2048 VITE_DESIGNER_URL=$ORIGIN VITE_ARCHITECT_URL=$ORIGIN VARPET_DATA_DIR=/opt/varpet-app/data VARPET_SHARES_DIR=/opt/varpet-app/shares pnpm --filter @varpet/editor build
app /usr/local/bin/uv sync --frozen --project harness
app /usr/local/bin/uv sync --frozen --project compiler
# Designer uses the showcase's pinned Playwright to render through the editor.
pnpm --filter ./apps/showcase exec playwright install-deps chromium
app pnpm --filter ./apps/showcase exec playwright install chromium
install -d -o varpet-app -g varpet-app /opt/varpet-app/repo/node_modules/.vite-temp /opt/varpet-app/repo/apps/editor/node_modules/.vite /opt/varpet-app/repo/apps/editor/node_modules/.vite-temp
install -m 644 deploy/app/*.service deploy/app/*.slice /etc/systemd/system/
systemctl daemon-reload
systemctl enable varpet-editor varpet-designer varpet-architect
systemctl restart varpet-editor varpet-designer varpet-architect
for endpoint in http://127.0.0.1:4173/ http://127.0.0.1:8787/designer/health http://127.0.0.1:8788/runs; do
  curl --fail --silent --show-error --retry 20 --retry-connrefused --retry-delay 2 "$endpoint" -o /dev/null
  echo "healthy: $endpoint"
done
systemctl --no-pager --lines=3 status varpet-editor varpet-designer varpet-architect
if [ ! -s /opt/varpet-app/codex-home/auth.json ]; then echo 'ACTION: run the device login in deploy/app/README.md before opening the tunnel.'; fi
REMOTE
