#!/usr/bin/env bash
# Usage: catalog/import_extra_groups.sh <group>... (folders under catalog/data/extra/, see BRIEF_DECOR.md there)
# Import extra-model groups (args) into VM + local DB: rows, GLBs, Blender previews, preview-as-photo SigLIP embeddings.
cd "$(dirname "$0")" || exit 1
GRPS="$*"
KEY=$HOME/.ssh/varpet_ed25519
VM=sergey@152.53.158.86
set -a; source ~/.config/varpet/env; set +a
ST=data/decor-stage; PV=data/decor-previews; mkdir -p $ST $PV data/extra-previews-web data/img
uv run ingest_extra.py --apply --stage data/extra-stage | tail -2 || exit 1
for g in $GRPS; do cp data/extra-stage/extra-$g-*.glb $ST/; done
echo "staged $(ls $ST | wc -l) GLBs"
rsync -rltzO -e "ssh -i $KEY" $ST/ $VM:/opt/varpet-catalog/models-web/ && echo "uploaded models"
blender -b --python render_previews.py -- $ST $PV 2>&1 | grep -E "PREVIEW (DONE|FAILED)"
uv run python - <<'PY'
from pathlib import Path
from PIL import Image
n = 0
for p in Path("data/decor-previews").glob("*.png"):
    im = Image.open(p).convert("RGB")
    im.save(Path("data/extra-previews-web") / (p.stem + ".webp"), "WEBP", quality=82)
    slug = p.stem.split("-", 2)[2] if p.stem.count("-") >= 2 else p.stem
    # stem is extra-<group>-<slug>; group names may contain '-' so strip by known prefix instead
    n += 1
print("webp", n)
PY
uv run python - <<'PY'
# preview doubles as the SigLIP "photo": data/img/<source_id>.jpg
import json
from pathlib import Path
from PIL import Image
n = 0
for m in Path("data/extra").glob("*/entries.json"):
    g = m.parent.name
    for e in json.loads(m.read_text()):
        p = Path("data/decor-previews") / f"extra-{g}-{e['slug']}.png"
        out = Path("data/img") / f"{e['slug']}.jpg"
        if p.exists() and not out.exists():
            Image.open(p).convert("RGB").save(out, quality=90); n += 1
print("photos", n)
PY
rsync -rltzO -e "ssh -i $KEY" data/extra-previews-web/ $VM:/opt/varpet-catalog/models-web/previews/ && echo "uploaded previews"
SQL="set lock_timeout='3s'; update item set preview_url = 'http://100.107.246.46:8765/previews/extra-' || replace(substr(id, 7), ':', '-') || '.webp' where source = 'extra' and preview_url is null;"
psql "$VARPET_DB_URL" -Atc "$SQL"
uv run embed_siglip.py 2>&1 | tail -1
set -a; source ~/.config/varpet/local.env; set +a
uv run ingest_extra.py --apply --stage data/extra-stage | tail -1
psql "$VARPET_DB_URL" -Atc "$SQL"
uv run embed_siglip.py 2>&1 | tail -1
rsync -a $ST/ data/demo/web/; rsync -a data/extra-previews-web/ data/demo/web/previews/
psql "$VARPET_DB_URL" -Atc "select count(*), count(preview_url) from item where source='extra'"
echo DECOR DONE
