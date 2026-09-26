#!/usr/bin/env bash
# Deploy the catalog MCP service to the team VM. Run from catalog/: ./deploy/deploy.sh
# Needs VARPET_DB_URL (the tunnel URL; only the password is reused) and SSH access to the VM.
set -euo pipefail
cd "$(dirname "$0")/.."  # rsync mirrors ./ onto the VM: always the catalog/ dir, wherever this is run from
HOST=${VARPET_SSH:-sergey@152.53.158.86}
KEY=${VARPET_SSH_KEY:-$HOME/.ssh/varpet_ed25519}
TS_IP=${VARPET_TS_IP:-100.107.246.46}
PW=$(sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' <<<"$VARPET_DB_URL")
vm() { ssh -i "$KEY" "$HOST" "$@"; }

# rsync --delete mirrors this tree onto the VM, so deploy only exactly what is on origin/main:
# an older or dirty tree once put an old search.py back over a teammate's change.
git fetch -q origin
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] || [ -n "$(git status --porcelain -- .)" ]; then
  echo "refusing to deploy: catalog/ must be clean and HEAD must equal origin/main (git pull --rebase, commit, push first)" >&2
  exit 1
fi

vm 'set -euo pipefail
    sudo -n useradd --system --home /opt/varpet-catalog --shell /usr/sbin/nologin varpet-catalog 2>/dev/null || true
    sudo -n mkdir -p /opt/varpet-catalog/app /opt/varpet-catalog/hf /opt/varpet-catalog/uv-cache
    sudo -n chown -R sergey:varpet-catalog /opt/varpet-catalog/app'
rsync -az --delete -e "ssh -i $KEY" --exclude .venv --exclude data --exclude eval/sheets --exclude __pycache__ \
  ./ "$HOST:/opt/varpet-catalog/app/"
# The secret travels on stdin, never in the local or remote ssh argv.
printf 'VARPET_DB_URL=postgresql://varpet:%s@localhost:5432/varpet\nCATALOG_HTTP_HOST=%s\nCATALOG_HTTP_PORT=8765\nHF_HOME=/opt/varpet-catalog/hf\nUV_CACHE_DIR=/opt/varpet-catalog/uv-cache\nOMP_NUM_THREADS=2\nSIGLIP_DIR=/opt/varpet-catalog/models\n' "$PW" "$TS_IP" |
  vm 'set -euo pipefail; sudo -n tee /etc/varpet-catalog.env >/dev/null'
vm "set -euo pipefail
    sudo -n chown root:varpet-catalog /etc/varpet-catalog.env && sudo -n chmod 640 /etc/varpet-catalog.env
    sudo -n chown -R varpet-catalog:varpet-catalog /opt/varpet-catalog/app /opt/varpet-catalog/hf /opt/varpet-catalog/uv-cache /opt/varpet-catalog/models 2>/dev/null || true
    sudo -n mkdir -p /opt/varpet-catalog/generated /opt/varpet-catalog/models-web && sudo -n chgrp varpet-catalog /opt/varpet-catalog/models-web && sudo -n chmod 2775 /opt/varpet-catalog/models-web && sudo -n chgrp varpet-catalog /opt/varpet-catalog/generated && sudo -n chmod 2775 /opt/varpet-catalog/generated
    cd /opt/varpet-catalog/app && sudo -n -u varpet-catalog env UV_CACHE_DIR=/opt/varpet-catalog/uv-cache uv sync --frozen --no-dev 2>&1 | tail -2
    [ -d /opt/varpet-catalog/models/siglip2-base-patch16-224-bf16 ] || sudo -n -u varpet-catalog env HF_HOME=/opt/varpet-catalog/hf .venv/bin/python -c \"
import torch; from transformers import AutoModel, AutoProcessor; n='google/siglip2-base-patch16-224'; o='/opt/varpet-catalog/models/siglip2-base-patch16-224-bf16'
AutoModel.from_pretrained(n, dtype=torch.bfloat16).save_pretrained(o); AutoProcessor.from_pretrained(n).save_pretrained(o)\" 2>&1 | tail -1
    sudo -n cp deploy/varpet-catalog.service deploy/varpet-catalog-files.service deploy/varpet-catalog-watchdog.service deploy/varpet-catalog-watchdog.timer /etc/systemd/system/
    sudo -n systemctl daemon-reload && sudo -n systemctl enable --now varpet-catalog varpet-catalog-files varpet-catalog-watchdog.timer && sudo -n systemctl restart varpet-catalog varpet-catalog-files
    sleep 3
    systemctl is-active --quiet varpet-catalog
    systemctl is-active --quiet varpet-catalog-files
    systemctl --no-pager --lines=5 status varpet-catalog | sed -n '1,12p'"
