# Public app

Deploys the synced **clean origin/main** snapshot to `/opt/varpet-app/repo`.
Run the script on Sergey's laptop, not in the sandbox. It does not modify DNS or the
existing tunnel. The public app is open, by Sergey’s choice; optional app accounts
are not an access gate. Catalog keeps its existing read-only role and service.

## Run in this order

1. Review these changes, run the checks below outside the sandbox, commit and push
   them to main, then synchronize your laptop. The deployment script requires both
   a completely clean tree and `HEAD == origin/main`; it does not fetch for you.

   ```sh
   cd /Users/serg/Documents/varpet
   pnpm test
   pnpm typecheck
   (cd harness && uv run --frozen pytest -q tests)
   bash -n deploy/app/deploy-app.sh
   # Review, commit, push, then synchronize main using your team's usual workflow.
   git status --short
   git rev-parse HEAD origin/main
   ./deploy/app/deploy-app.sh
   ```

   SSH defaults: `sergey@152.53.158.86`, key `~/.ssh/varpet_ed25519`.
   Override with `VARPET_SSH` / `VARPET_SSH_KEY`. Requires passwordless sudo, rsync,
   curl, npm, Node **22.13+** at `/usr/bin/node`, and uv at `/usr/local/bin/uv`.
   Installs pnpm 10 if absent; refuses another installed major version. Installs
   frozen workspace, harness and compiler dependencies, builds the editor, and
   installs the pinned Playwright Chromium and Ubuntu system libraries. This step
   needs network on the VM. Services stop during update/build (brief downtime).
   An install/build failure leaves them stopped for inspection; rerun after fixing.

   Only `git archive origin/main` files are sent; ignored laptop `.env`, credentials,
   caches and data cannot enter the upload. rsync also excludes `node_modules`,
   `.venv`, `catalog/data`, `.git`, `.pnpm-store`, `runs`, and Python caches.
   Data, shares, runs and authentication live outside the mirror. The deployed
   SHA is recorded in `/opt/varpet-app/repo/DEPLOYED_REVISION`.

2. One-time Codex device login **on the VM** (use the team account in the displayed
   browser flow). The Python SDK resolves this same bundled CLI; do not install a
   different global Codex. No credential is sent as a command argument or copied
   from the laptop.

   ```sh
   ssh -i ~/.ssh/varpet_ed25519 sergey@152.53.158.86
   CODEX_BIN=$(sudo -u varpet-app /opt/varpet-app/repo/harness/.venv/bin/python -c 'from codex_cli_bin import bundled_codex_path; print(bundled_codex_path())')
   sudo -u varpet-app env HOME=/opt/varpet-app CODEX_HOME=/opt/varpet-app/codex-home "$CODEX_BIN" login --device-auth
   sudo -u varpet-app env HOME=/opt/varpet-app CODEX_HOME=/opt/varpet-app/codex-home "$CODEX_BIN" login status
   sudo systemctl restart varpet-designer varpet-architect
   ```

   `/opt/varpet-app/codex-home` is owned by `varpet-app`, mode 700. Designer creates
   isolated temporary Codex homes with auth symlinks; architect/plan gate inherit
   this CODEX_HOME. The login must produce `auth.json` there.

3. On the VM, back up and edit the **existing** tunnel config:

   ```sh
   sudo cp -a /etc/varpet-langfuse-tunnel/config.yml /etc/varpet-langfuse-tunnel/config.yml.before-varpet
   sudoedit /etc/varpet-langfuse-tunnel/config.yml
   ```

   Insert the three entries from
   `/opt/varpet-app/repo/deploy/app/cloudflared-ingress.yml` into `ingress:`, after
   the Langfuse entry and **before** the final `service: http_status:404` entry.
   Preserve the existing tunnel ID, credentials file and Langfuse rule. Do not set
   `httpHostHeader` to another hostname: architect validates the public Host.

   ```sh
   sudo cloudflared tunnel --config /etc/varpet-langfuse-tunnel/config.yml ingress validate
   sudo cloudflared tunnel --config /etc/varpet-langfuse-tunnel/config.yml ingress rule https://varpet.snek.page/designer/health
   sudo cloudflared tunnel --config /etc/varpet-langfuse-tunnel/config.yml ingress rule https://varpet.snek.page/flat
   sudo cloudflared tunnel --config /etc/varpet-langfuse-tunnel/config.yml ingress rule https://varpet.snek.page/api/flats
   sudo cloudflared tunnel --config /etc/varpet-langfuse-tunnel/config.yml ingress rule https://langfuse.snek.page/
   sudo systemctl restart varpet-langfuse-tunnel.service
   ```

4. **Feliks adds Cloudflare DNS** in the `snek.page` zone:

   | Type | Name | Target | Proxy |
   | --- | --- | --- | --- |
   | CNAME | `varpet` | `efc368cb-fcad-46f2-80e9-3a8dd3dfd01f.cfargotunnel.com` | Proxied |

   This uses the existing named tunnel; no new tunnel or tunnel service is needed.

5. Check public routing, then open the app and perform one designer turn and one
   plan upload/build. Health checks alone do not prove Codex login, Chromium or
   the compiler work inside the VM's systemd sandbox.

   ```sh
   curl -f https://varpet.snek.page/ -o /dev/null
   curl -f https://varpet.snek.page/designer/health
   curl -f -H 'Origin: https://varpet.snek.page' https://varpet.snek.page/runs
   curl -f https://varpet.snek.page/api/flats
   curl -I https://langfuse.snek.page/
   ```

   Confirm catalog thumbnails/models, a team flat save/reload, sharing, and a
   rendered designer preview. Generated GLB URLs must start with the public HTTPS
   origin. If `/api/flats` reports missing tables/permissions, the catalog's separate
   flats migration is a prerequisite: follow `docs/catalog.md` “Saved flats” as a DB
   administrator. This app deployment does not change database grants or run SQL.

## Routing, limits and storage

Both VITE base URLs are `https://varpet.snek.page`, without a path. Designer appends
`/designer/propose`, `/designer/health`, `/designer/files/...` and conversation paths.
Architect appends `/flat`, `/structure`, `/plan-check`, `/runs`, `/pieces`, `/files/...`.
All other traffic, including `/api/account`, `/api/shares`, `/api/catalog` and
`/api/flats`, goes to the editor's Vite production preview on loopback port 4173.
All four server plugins install through `configurePreviewServer`; the public host
is in `preview.allowedHosts`. Architect and designer bind loopback ports 8788/8787.

`/etc/varpet-app.env` is created once (root:varpet-app, mode 640), preserved on
redeploy, and sent over SSH stdin. Edit with `sudoedit` and restart the three app
services for changes. `VARPET_PUBLIC_ORIGIN` adds the exact public origin to
Python origin checks and supplies the editor proxy origin. Local origins remain
usable. It also permits the public Host and sets HTTPS architect asset URLs.
Changing the public URL requires updating the two build-time URLs in the script
and rebuilding, as well as changing runtime env and tunnel/DNS rules.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VARPET_BUILD_LIMIT_PER_HOUR` | 3 | `/flat` and `/structure` combined, per client IP |
| `VARPET_PLAN_CHECK_LIMIT_PER_HOUR` | 30 | `/plan-check`, per client IP |
| `VARPET_DESIGNER_LIMIT_PER_HOUR` | 30 | Valid designer turns, per client IP |
| `VARPET_RUN_RETENTION_HOURS` | 24 | Old architect runs reaped at service startup |

Limits are positive integers, atomic rolling 60-minute windows in service memory;
restarts reset them. Quota attempts count even if a model/build later fails. The
architect's existing one-build-at-a-time 429 remains and busy rejections do not
consume quota. Limits use `CF-Connecting-IP`, falling back to the peer address.
Only the existing tunnel should reach the loopback listeners; never expose them
on `0.0.0.0`. HTTP 429 responses include readable messages shown by both adapters.

Memory high/max: editor 384/640 MiB, designer 1280/2048 MiB, architect 1536/2560
MiB. The shared `varpet-app.slice` has high/max 3/3.5 GiB and no swap allowance:
individual maxima cannot all be used simultaneously. This fits under the stated
~3.9 GiB free but is a protective cap, not a measured workload requirement; heavy
concurrent work may be killed and restarted. Designer eager warmup is off and
parallel room subagents are off to reduce idle and peak RAM. Chromium renders
through software WebGL on Linux. Test a real build before judging.

All units use `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`, mode-700
persistent data directories and explicit writable paths. The read-only checkout
has narrow writable Vite cache exceptions. Designer's renderer also starts an
internal loopback Vite server; it needs data/share/cache writes as well as temp.
Compiler dependencies are installed in advance; `UV_NO_SYNC=1` prevents agent
compiler calls from trying to mutate the read-only virtualenv during requests.

## Logs and rollback

```sh
sudo systemctl status varpet-editor varpet-designer varpet-architect --no-pager
sudo journalctl -u varpet-editor -u varpet-designer -u varpet-architect -f
sudo journalctl -u varpet-langfuse-tunnel.service -n 100 --no-pager
sudo systemctl status varpet-app.slice --no-pager
sudo cat /opt/varpet-app/repo/DEPLOYED_REVISION
```

To remove public exposure without affecting Langfuse, restore the saved tunnel
config, validate it, and restart `varpet-langfuse-tunnel.service`. If someone has
changed that config since the backup, remove only the three Varpet entries instead
of restoring the whole file. Remove the `varpet` DNS record if desired.

To roll back app code, revert the deployment change(s) on main, review/commit/push
that revert, synchronize the laptop to origin/main and rerun `deploy-app.sh`.
The clean-main guard deliberately refuses a detached historical SHA. Persistent
accounts, shares, runs, auth and `/etc/varpet-app.env` are retained. Restore reviewed
env/unit changes as appropriate; no database rollback is performed. Stop the three
app services while investigating a failed build or repeated memory kills.

## Local verification (sandbox)

`pnpm typecheck`, public-origin/UI tests, renderer launch tests, editor production
build and `bash -n` pass. Targeted Python public-policy and existing serve-security
tests: 30 passed. Full harness run: 188 passed, 2 socket-bind permission failures.
`pnpm test` is not green in this sandbox: designer subprocess/socket tests encounter
`EPERM` on Unix IPC/listen. Re-run the full commands in step 1 on the laptop before
publishing. No VM deployment, live browser rendering or model call was run here.
