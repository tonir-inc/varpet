"""Merge out/meta/*.json into out/bpy-softgoods/entries.json (catalog/ingest_extra.py's format) and check each entry.

python3 catalog/blender/soft/collect.py
Checks what ingest_extra validates (slug, palette colours, whole AMD price, size = mesh extents, GLB present) plus
the lane budget (< 60k tris, < 3 MB). Exits 1 on any problem.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from common import COLORS, META, MODELS  # noqa: E402

entries = sorted((json.loads(p.read_text()) for p in META.glob("*.json")), key=lambda e: e["order"])
bad = []
for e in entries:
    why = []
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", e["slug"]):
        why.append("slug")
    if not e["colors"] or not set(e["colors"]) <= COLORS:
        why.append("colours")
    if type(e["price_amd"]) is not int or e["price_amd"] <= 0:
        why.append("price")
    if not (MODELS / e["glb"]).is_file():
        why.append("no glb")
    if any(abs(a - b) > 0.01 for a, b in zip(e["size_m"], e["mesh_extents_m"])) or min(e["size_m"]) <= 0:
        why.append("size")
    if e["tris"] >= 60000 or e["kb"] >= 3 * 1024:
        why.append(f"budget {e['tris']} tris {e['kb']} kb")
    if why:
        bad.append((e["slug"], why))
MODELS.mkdir(parents=True, exist_ok=True)
(MODELS / "entries.json").write_text(json.dumps(entries, indent=1) + "\n")
print(len(entries), "entries;", dict(Counter(e["kind"] for e in entries)))
print("max tris", max(e["tris"] for e in entries), "max kb", max(e["kb"] for e in entries))
for slug, why in bad:
    print("BAD", slug, why)
sys.exit(1 if bad else 0)
