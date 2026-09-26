#!/usr/bin/env bash
# Keep an SSH tunnel to the catalog open, reconnecting when it drops (Wi-Fi changes, sleep, VM restarts).
# Usage: catalog/deploy/tunnel.sh [local_port]   (default 18765)
# Then: http://localhost:<port>/mcp  (MCP)  and  http://localhost:<port>/health
PORT=${1:-18765}
KEY=${VARPET_TUNNEL_KEY:-$HOME/.ssh/id_ed25519}
while true; do
  ssh -i "$KEY" -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
      -L "$PORT:100.107.246.46:8765" catalog-tunnel@152.53.158.86
  echo "$(date +%H:%M:%S) tunnel dropped, reconnecting in 2 s" >&2
  sleep 2
done
