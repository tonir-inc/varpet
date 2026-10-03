"""Merge out/meta/*.json into out/bpy-kitchen/entries.json (catalog/ingest_extra.py's format) and check each entry.

python3 catalog/blender/kitchen/collect.py
Checks what ingest_extra validates (slug, palette colours, whole AMD price, size = mesh extents, GLB present), the
lane budget (< 1.5 MB, tris under the piece's budget), tags (kitchen + placement) and the anchor per placement
(glTF bounds): wall = bottom 0 and back 0, surface = bottom 0, ceiling = top 0. Exits 1 on any problem.
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from common import COLORS, META, MODELS  # noqa: E402

TOL = 0.0015
entries = sorted((json.loads(p.read_text()) for p in META.glob("*.json")), key=lambda e: e["order"])
bad = []
for e in entries:
    why = []
    lo, hi = e["bounds_m"]["lo"], e["bounds_m"]["hi"]
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
    if e["tris"] > e["tri_budget"] or e["kb"] >= 1.5 * 1024:
        why.append(f"budget {e['tris']} tris {e['kb']} kb")
    if "kitchen" not in e["tags"] or e["placement"] not in e["tags"]:
        why.append("tags")
    if e["placement"] == "wall" and (abs(lo[1]) > TOL or abs(lo[2]) > TOL):
        why.append(f"wall anchor lo={lo}")
    if e["placement"] == "surface" and abs(lo[1]) > TOL:
        why.append(f"surface anchor lo={lo}")
    if e["placement"] == "ceiling" and abs(hi[1]) > TOL:
        why.append(f"ceiling anchor hi={hi}")
    if why:
        bad.append((e["slug"], why))
MODELS.mkdir(parents=True, exist_ok=True)
(MODELS / "entries.json").write_text(json.dumps(entries, indent=1, ensure_ascii=False) + "\n")
fam = defaultdict(list)
for e in entries:
    fam[e["family"]].append(e["price_amd"])
print(len(entries), "entries;", dict(Counter(e["kind"] for e in entries)))
for f, prices in fam.items():
    print(f"  {f}: {len(prices)} pieces, {min(prices) // 1000}-{max(prices) // 1000}k AMD")
print("max tris", max(e["tris"] for e in entries), "max kb", max(e["kb"] for e in entries))
for slug, why in bad:
    print("BAD", slug, why)
sys.exit(1 if bad else 0)
