#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

CATALOG_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
DATA_DIR="$CATALOG_DIR/data/demo"
WEB_DIR="$DATA_DIR/web"
ENV_FILE="$HOME/.config/varpet/local.env"
SSH_HOST=${VARPET_SSH:-sergey@152.53.158.86}
SSH_KEY=${VARPET_SSH_KEY:-$HOME/.ssh/varpet_ed25519}
REQUESTED_PASSWORD=${VARPET_LOCAL_DB_PASSWORD:-}
say() { printf '[catalog setup] %s\n' "$*"; }
die() { say "$*" >&2; exit 1; }

[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || die 'Run on an Apple Silicon Mac.'
command -v brew >/dev/null || die 'Homebrew is required.'
[[ -r "$SSH_KEY" ]] || die 'SSH key is missing; set VARPET_SSH_KEY.'
for formula in postgresql@17 pgvector; do
    if brew list --versions "$formula" >/dev/null 2>&1; then
        say "$formula is already installed."
    else
        say "Installing $formula."
        brew install "$formula"
    fi
done
if ! command -v uv >/dev/null; then
    say 'Installing uv.'
    brew install uv
fi
export PATH="$(brew --prefix postgresql@17)/bin:$PATH"
# Do not inherit a tunnel, service definition, or remote libpq connection.
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGPASSWORD PGOPTIONS
ADMIN_USER=$(id -un)
admin() { psql -X -w -h /tmp -p 5432 -U "$ADMIN_USER" -v ON_ERROR_STOP=1 "$@"; }
say 'Starting PostgreSQL 17 with brew services.'
brew services start postgresql@17
for ((attempt = 0; attempt < 30; attempt++)); do
    if pg_isready -q -h /tmp -p 5432; then break; fi
    sleep 1
done
pg_isready -q -h /tmp -p 5432 || die 'PostgreSQL did not become ready on port 5432.'
EXPECTED_PGDATA=$(cd "$(brew --prefix)/var/postgresql@17" && pwd -P)
ACTUAL_PGDATA=$(admin -d postgres -Atc 'show data_directory')
[[ $(cd "$ACTUAL_PGDATA" && pwd -P) == "$EXPECTED_PGDATA" ]] || die 'Port 5432 belongs to another PostgreSQL cluster; stop it first.'

say 'Installing the catalog Python environment from the lockfile.'
cd "$CATALOG_DIR"
uv sync --frozen --no-dev
mkdir -p "$DATA_DIR" "$WEB_DIR/previews" "$(dirname "$ENV_FILE")"
if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$ENV_FILE"
fi
VARPET_LOCAL_DB_PASSWORD=${REQUESTED_PASSWORD:-${VARPET_LOCAL_DB_PASSWORD:-}}
if [[ -z "$VARPET_LOCAL_DB_PASSWORD" ]]; then
    say 'Generating a local database password.'
    VARPET_LOCAL_DB_PASSWORD=$(openssl rand -hex 24)
else
    say 'Using the supplied or saved local database password.'
fi
export VARPET_LOCAL_DB_PASSWORD
VARPET_DB_URL=$(uv run --frozen --no-sync python -c 'import os; from urllib.parse import quote; print("postgresql://varpet:" + quote(os.environ["VARPET_LOCAL_DB_PASSWORD"], safe="") + "@127.0.0.1:5432/varpet")')
ENV_TMP=$(mktemp "${ENV_FILE}.XXXXXX")
trap 'rm -f "${ENV_TMP:-}" "${DUMP_TMP:-}"' EXIT
{
    printf 'export VARPET_LOCAL_DB_PASSWORD=%q\n' "$VARPET_LOCAL_DB_PASSWORD"
    printf 'export VARPET_DB_URL=%q\n' "$VARPET_DB_URL"
    printf 'export CATALOG_HTTP_HOST=127.0.0.1\nexport CATALOG_HTTP_PORT=8765\n'
    printf 'export CATALOG_MODELS_DIR=%q\n' "$WEB_DIR"
} > "$ENV_TMP"
chmod 600 "$ENV_TMP"
mv -f "$ENV_TMP" "$ENV_FILE"
say "Saved local settings to $ENV_FILE (mode 600)."

say 'Ensuring the varpet role, database and vector extension exist.'
# Read the secret from the environment, not argv; suppress SQL error echoes.
if ! admin -d postgres -q >/dev/null 2>&1 <<'SQL'
\getenv local_password VARPET_LOCAL_DB_PASSWORD
SELECT 'CREATE ROLE varpet LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'varpet') \gexec
SELECT format('ALTER ROLE varpet PASSWORD %L', :'local_password') \gexec
SELECT 'CREATE DATABASE varpet OWNER varpet' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'varpet') \gexec
ALTER DATABASE varpet OWNER TO varpet;
SQL
then
    die 'Could not configure the local role/database; check the Homebrew PostgreSQL administrator.'
fi
admin -d varpet -c 'CREATE EXTENSION IF NOT EXISTS vector;'

say 'Dumping the VM database (the previous complete dump is kept until this succeeds).'
DUMP_TMP=$(mktemp "$DATA_DIR/varpet.dump.XXXXXX")
ssh -i "$SSH_KEY" "$SSH_HOST" 'sudo -n -u postgres pg_dump -Fc -d varpet' > "$DUMP_TMP"
pg_restore --list "$DUMP_TMP" > "$DATA_DIR/restore.list"
mv -f "$DUMP_TMP" "$DATA_DIR/varpet.dump"
# vector needs an administrator to install; keep the extension created above.
awk '!/ EXTENSION - vector / && !/ COMMENT - EXTENSION vector /' \
    "$DATA_DIR/restore.list" > "$DATA_DIR/restore-local.list"
say 'Replacing the local varpet catalog with the VM snapshot.'
pg_restore -h /tmp -p 5432 -U "$ADMIN_USER" -w -d varpet \
    --clean --if-exists --no-owner --no-acl --role=varpet \
    --exit-on-error --single-transaction --use-list="$DATA_DIR/restore-local.list" "$DATA_DIR/varpet.dump"
admin -d varpet -c "SELECT 'item' AS table_name, count(*) AS rows FROM item UNION ALL SELECT 'item_embedding', count(*) FROM item_embedding;"

say 'Hard-linking local models and previews (earlier sources take precedence).'
shopt -s nullglob
link_files() {
    local destination=$1 preferred=$2 file target
    shift 2
    for file in "$@"; do
        target="$destination/${file##*/}"
        if [[ ${file%/*} != "$preferred" && -f "$preferred/${file##*/}" ]]; then continue; fi
        # ln -f may fail when a rerun encounters the very same inode.
        if [[ ! "$file" -ef "$target" ]]; then ln -f "$file" "$target"; fi
    done
}
link_files "$WEB_DIR" "$CATALOG_DIR/data/models" "$CATALOG_DIR"/data/models/*.glb
link_files "$WEB_DIR/previews" "$CATALOG_DIR/data/previews-web" "$CATALOG_DIR"/data/previews-web/*.webp
link_files "$WEB_DIR/previews" "$CATALOG_DIR/data/previews-web" "$CATALOG_DIR"/data/extra-previews-web/*.webp
link_files "$WEB_DIR" "$CATALOG_DIR/data/models" "$CATALOG_DIR"/data/extra-stage/*.glb
say 'Pulling missing served models and previews from the VM.'
# rsync parses its remote-shell string itself; quote embedded spaces/apostrophes.
RSYNC_KEY=${SSH_KEY//\'/\'\\\'\'}
rsync -rltO --ignore-existing -e "ssh -i '$RSYNC_KEY'" \
    --include='/previews/' --include='/previews/*.webp' --include='/*.glb' --exclude='*' \
    "$SSH_HOST:/opt/varpet-catalog/models-web/" "$WEB_DIR/"
models=("$WEB_DIR"/*.glb)
previews=("$WEB_DIR"/previews/*.webp)
say "Served files: ${#models[@]} GLBs, ${#previews[@]} previews. Total size:"
du -sh "$WEB_DIR"

say 'Caching and warming SigLIP for local text search (first run downloads the model).'
unset SIGLIP_DIR
uv run --frozen --no-sync python -c 'import embed_siglip_query; embed_siglip_query.text("sofa"); print("SigLIP is ready.")'
say 'Setup complete. Start catalog/demo/run_local.sh before the demo.'
