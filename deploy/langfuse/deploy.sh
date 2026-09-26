#!/usr/bin/env bash
# Deploy self-hosted Langfuse to the team VM behind a Cloudflare named tunnel. Run from the repo root:
#   LANGFUSE_HOST=langfuse.example.com INIT_USER_EMAIL=you@example.com deploy/langfuse/deploy.sh
# Tunnel (once, on a laptop): cloudflared tunnel login; cloudflared tunnel create varpet-langfuse;
#   cloudflared tunnel route dns varpet-langfuse $LANGFUSE_HOST. The script copies that tunnel's credentials
#   (~/.cloudflared/<id>.json) to the VM with an ingress for $LANGFUSE_HOST -> 127.0.0.1:3100.
# Secrets are generated once on the VM (/opt/varpet-langfuse/.env, mode 600) and never leave it except
# the project keys and admin password, printed at the end of the first deploy.
set -euo pipefail
HOST=${VARPET_SSH:-sergey@152.53.158.86}
SSH_OPTS=(${VARPET_SSH_KEY:+-i "$VARPET_SSH_KEY"})
: "${LANGFUSE_HOST:?set LANGFUSE_HOST, the public hostname of the tunnel}"
: "${INIT_USER_EMAIL:?set INIT_USER_EMAIL, the first admin account}"
DIR=/opt/varpet-langfuse
vm() { ssh "${SSH_OPTS[@]}" "$HOST" "$@"; }

# ClickHouse alone wants ~2-3 GB; the box also runs the catalog and a Minecraft server.
vm bash -s <<'EOF'
set -e
command -v docker >/dev/null && sudo -n docker compose version >/dev/null || { echo "docker + compose plugin missing on the VM" >&2; exit 1; }
avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
echo "VM MemAvailable: ${avail} MB"
[ "$avail" -ge 4000 ] || { echo "refusing: under 4 GB free for Langfuse, caps total 7.3 GB" >&2; exit 1; }
EOF

vm "sudo -n mkdir -p $DIR && sudo -n chown \$(id -u):\$(id -g) $DIR"
scp "${SSH_OPTS[@]}" -q deploy/langfuse/docker-compose.yml "$HOST:$DIR/docker-compose.yml"

vm "set -e; cd $DIR
  if [ ! -f .env ]; then
    r() { openssl rand -hex \"\$1\"; }
    umask 077
    cat > .env <<EOF
LANGFUSE_PORT=3100
NEXTAUTH_URL=https://$LANGFUSE_HOST
NEXTAUTH_SECRET=\$(r 32)
SALT=\$(r 32)
ENCRYPTION_KEY=\$(r 32)
POSTGRES_PASSWORD=\$(r 24)
CLICKHOUSE_PASSWORD=\$(r 24)
MINIO_ROOT_PASSWORD=\$(r 24)
REDIS_AUTH=\$(r 24)
LANGFUSE_PUBLIC_KEY=pk-lf-\$(r 16)
LANGFUSE_SECRET_KEY=sk-lf-\$(r 16)
INIT_USER_EMAIL=$INIT_USER_EMAIL
INIT_USER_PASSWORD=\$(r 12)
EOF
    echo FIRST_DEPLOY
  fi
  sudo -n docker compose -p varpet-langfuse up -d --pull always 2>&1 | tail -3"

TUNNEL=${CF_TUNNEL:-varpet-langfuse}
TID=$(cloudflared tunnel list -o json | python3 -c "import json,sys; print(next(t['id'] for t in json.load(sys.stdin) if t['name']=='$TUNNEL'))")
scp "${SSH_OPTS[@]}" -q "$HOME/.cloudflared/$TID.json" "$HOST:/tmp/$TID.json"
vm "set -e
  if ! command -v cloudflared >/dev/null; then
    sudo -n mkdir -p --mode=0755 /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo -n tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \\
      | sudo -n tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
    sudo -n apt-get update -qq && sudo -n apt-get install -y -qq cloudflared
  fi
  sudo -n mkdir -p /etc/varpet-langfuse-tunnel
  sudo -n install -m 600 /tmp/$TID.json /etc/varpet-langfuse-tunnel/$TID.json && rm /tmp/$TID.json
  printf 'tunnel: %s\\ncredentials-file: /etc/varpet-langfuse-tunnel/%s.json\\ningress:\\n  - hostname: %s\\n    service: http://127.0.0.1:3100\\n  - service: http_status:404\\n' $TID $TID $LANGFUSE_HOST \\
    | sudo -n tee /etc/varpet-langfuse-tunnel/config.yml >/dev/null
  printf '[Unit]\\nDescription=cloudflared tunnel for varpet Langfuse\\nAfter=network-online.target\\nWants=network-online.target\\n\\n[Service]\\nExecStart=/usr/bin/cloudflared --no-autoupdate --config /etc/varpet-langfuse-tunnel/config.yml tunnel run\\nRestart=always\\nRestartSec=5\\n\\n[Install]\\nWantedBy=multi-user.target\\n' \\
    | sudo -n tee /etc/systemd/system/varpet-langfuse-tunnel.service >/dev/null
  sudo -n systemctl daemon-reload && sudo -n systemctl enable --now varpet-langfuse-tunnel && sudo -n systemctl restart varpet-langfuse-tunnel"

echo "waiting for Langfuse (migrations take a minute on first start)"
vm 'for i in $(seq 60); do curl -fs -o /dev/null http://127.0.0.1:3100/api/public/health && { echo local health ok; exit 0; }; sleep 5; done; echo "Langfuse did not come up; sudo docker compose -p varpet-langfuse logs langfuse-web" >&2; exit 1'
curl -fs -o /dev/null "https://$LANGFUSE_HOST/api/public/health" && echo "public https://$LANGFUSE_HOST ok" \
  || echo "public URL not answering yet: check the public hostname of the tunnel in the Cloudflare dashboard" >&2
vm "grep -E '^(LANGFUSE_PUBLIC_KEY|LANGFUSE_SECRET_KEY|INIT_USER_EMAIL|INIT_USER_PASSWORD)=' $DIR/.env"
echo "LANGFUSE_HOST=https://$LANGFUSE_HOST   (put the keys in ~/.config/varpet/env; change the admin password in the UI)"
