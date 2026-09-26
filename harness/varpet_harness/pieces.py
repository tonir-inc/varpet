"""Built pieces as editor catalog assets (apps/editor/src/contracts.ts CatalogAsset).

A run folder holds graph.json and one folder per job; a piece that passed its checks
has piece.glb. Generated pieces are not shop products: price 0, category says so.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .graph import Graph

# The editor's closed AssetKind enum; the first keyword that matches a job id wins.
KINDS = [("lamp", ("lamp", "light", "pendant", "chandelier", "sconce")), ("rug", ("rug", "carpet")), ("sofa", ("sofa", "couch", "settee", "chaise")),
         ("chair", ("chair", "stool", "armchair")), ("bed", ("bed",)),
         ("table", ("table", "desk")),
         ("plant", ("plant",)), ("shelf", ("shelf", "shelves", "bookcase", "bookshelf"))]
CATEGORY = "Built from your photos"


def kind_of(job_id: str) -> str:
    """Whole words only: 'bedroom-2-chest' is a cabinet, 'bedside-lamp' a lamp."""
    words = set(re.split(r"[^a-z]+", job_id.lower()))
    return next((kind for kind, keys in KINDS if words & set(keys)), "cabinet")


def _colour(program: dict) -> str:
    """Tint of the largest part, as the swatch colour the editor shows."""
    materials = program.get("materials", {})
    best, volume = None, -1.0
    for part in program.get("parts", []):
        x, y, z = part.get("size", (0, 0, 0))
        v = x * y * max(z, 0.01)
        if v > volume:
            best, volume = part.get("material"), v
    colour = (materials.get(best) or {}).get("color")
    return colour if isinstance(colour, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", colour) else "#b0b0b0"


def runs(root: Path) -> list[dict]:
    """Run folders that have at least one built piece, newest first."""
    out = []
    for run in sorted((p for p in root.glob("*/graph.json")), key=lambda p: p.stat().st_mtime, reverse=True):
        built = sorted(p.parent.name for p in run.parent.glob("*/piece.glb"))
        if built:
            out.append({"run": run.parent.name, "pieces": len(built)})
    return out


def catalog(run_dir: Path, base_url: str) -> list[dict]:
    graph = Graph.model_validate_json((run_dir / "graph.json").read_text())
    assets = []
    for job in graph.jobs:
        glb, program = run_dir / job.id / "piece.glb", run_dir / job.id / "program.json"
        if job.kind != "piece" or not glb.exists() or not program.exists():
            continue
        prog = json.loads(program.read_text())
        w, d, h = prog.get("size") or job.size
        assets.append({
            "id": f"built-{run_dir.name}-{job.id}"[:100],
            "name": job.id.replace("-", " ").capitalize(),
            "category": CATEGORY,
            "kind": kind_of(job.id),
            "dimensions": [round(w, 3), round(h, 3), round(d, 3)],  # editor Vec3 is x, y (up), z
            "color": _colour(prog),
            "price": 0,
            "source": {"type": "gltf", "url": f"{base_url}/files/{run_dir.name}/{job.id}/piece.glb"},
        })
    return assets


# Detail bar: parts after mirror/repeat copies. Below it a piece reads as a block, not furniture.
DETAIL = {
    "table": (4, "a top, legs or a base, and an apron or rails under the top"),
    "chair": (6, "seat, back, four legs (or a base) and rails or arms"),
    "sofa": (8, "base, a seat cushion per seat, back cushions, two arms and legs"),
    "bed": (7, "frame, mattress, headboard, pillows and a duvet or throw that overhangs the mattress"),
    "cabinet": (6, "carcass, doors or drawer fronts with 3 mm gaps between them, handles and a plinth or legs"),
    "shelf": (6, "sides, top, back, shelves and a plinth"),
    "lamp": (3, "base, stem and shade"),
    "rug": (1, "one rounded slab"),
    "plant": (3, "pot, soil and foliage"),
}


def detail_fault(job_id: str, parts: int) -> str | None:
    kind = kind_of(job_id)
    floor, needs = DETAIL.get(kind, (4, "its main visible parts"))
    if parts >= floor:
        return None
    return json.dumps([{"check": "detail", "kind": kind, "parts": parts, "minimum": floor,
                        "detail": f"this {kind} is {parts} parts and reads as a block. Real ones in photos have {needs}. "
                                  "Add the parts the photos show; keep the size."}])
