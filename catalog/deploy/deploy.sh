#!/usr/bin/env bash
# Deploy the catalog MCP service to the team VM. Run from catalog/: ./deploy/deploy.sh
# Needs VARPET_DB_URL (the tunnel URL; only the password is reused) and SSH access to the VM.
set -euo pipefail
HOST=${VARPET_SSH:-sergey@152.53.158.86}
KEY=${VARPET_SSH_KEY:-$HOME/.ssh/varpet_ed25519}
TS_IP=${VARPET_TS_IP:-100.107.246.46}
PW=$(sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' <<<"$VARPET_DB_URL")
vm() { ssh -i "$KEY" "$HOST" "$@"; }

vm 'sudo -n useradd --system --home /opt/varpet-catalog --shell /usr/sbin/nologin varpet-catalog 2>/dev/null || true
    sudo -n mkdir -p /opt/varpet-catalog/app /opt/varpet-catalog/hf /opt/varpet-catalog/uv-cache
    sudo -n chown -R sergey:varpet-catalog /opt/varpet-catalog/app'
rsync -az --delete -e "ssh -i $KEY" --exclude .venv --exclude data --exclude eval/sheets --exclude __pycache__ \
  ./ "$HOST:/opt/varpet-catalog/app/"
vm "printf 'VARPET_DB_URL=postgresql://varpet:%s@localhost:5432/varpet\nCATALOG_HTTP_HOST=$TS_IP\nCATALOG_HTTP_PORT=8765\nHF_HOME=/opt/varpet-catalog/hf\nUV_CACHE_DIR=/opt/varpet-catalog/uv-cache\nOMP_NUM_THREADS=2\nSIGLIP_DIR=/opt/varpet-catalog/models\n' '$PW' \
      | sudo -n tee /etc/varpet-catalog.env >/dev/null
    sudo -n chown root:varpet-catalog /etc/varpet-catalog.env && sudo -n chmod 640 /etc/varpet-catalog.env
    sudo -n chown -R varpet-catalog:varpet-catalog /opt/varpet-catalog/app /opt/varpet-catalog/hf /opt/varpet-catalog/uv-cache /opt/varpet-catalog/models 2>/dev/null || true
    sudo -n mkdir -p /opt/varpet-catalog/generated && sudo -n chgrp varpet-catalog /opt/varpet-catalog/generated && sudo -n chmod 2775 /opt/varpet-catalog/generated
    cd /opt/varpet-catalog/app && sudo -n -u varpet-catalog env UV_CACHE_DIR=/opt/varpet-catalog/uv-cache uv sync --frozen --no-dev 2>&1 | tail -2
    [ -d /opt/varpet-catalog/models/siglip2-base-patch16-224-bf16 ] || sudo -n -u varpet-catalog env HF_HOME=/opt/varpet-catalog/hf .venv/bin/python -c \"
import torch; from transformers import AutoModel, AutoProcessor; n='google/siglip2-base-patch16-224'; o='/opt/varpet-catalog/models/siglip2-base-patch16-224-bf16'
AutoModel.from_pretrained(n, dtype=torch.bfloat16).save_pretrained(o); AutoProcessor.from_pretrained(n).save_pretrained(o)\" 2>&1 | tail -1
    sudo -n cp deploy/varpet-catalog.service deploy/varpet-catalog-files.service /etc/systemd/system/
    sudo -n systemctl daemon-reload && sudo -n systemctl enable --now varpet-catalog varpet-catalog-files && sudo -n systemctl restart varpet-catalog varpet-catalog-files
    sleep 3; systemctl --no-pager --lines=5 status varpet-catalog | head -12"
