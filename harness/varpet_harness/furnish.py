"""Furnish: put the built pieces where the photos show them in the flat's shell.

This is the flat as it is today (the architect's reconstruction). Rearranging it
is the designer's job afterwards.

Editor frame: x, z in metres on the floor (the shell's frame), rotation in degrees
about +Y, 0 = the piece's front faces +z. A piece's footprint is width x depth.

CLI: python -m varpet_harness.furnish <placements.json> <workdir>; reads the run's
shell/shell.json and graph.json next to <workdir>. Exit 0 on pass, else faults.json.
"""

from __future__ import annotations

import itertools
import json
import math
import sys
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from shapely import affinity
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

from .graph import Graph
from .shell import Shell

INSIDE_TOL_M = 0.03  # a footprint may overhang its room by this much
OVERLAP_M2 = 0.02  # footprints overlapping more than this collide
IN_WALL_M2 = 1e-4  # any real overlap with a wall body; the editor's own check is exact (a 2 cm mirror counts)
DOOR_CLEAR_M = 0.5  # keep this much floor free in front of and behind every door
UNDER = {"rug"}  # pieces other furniture may stand on


class Placement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    piece: str = Field(description="piece job id")
    copy_: int = Field(default=1, ge=1, alias="copy", description="1..count for identical pieces")
    room: str
    x: float
    z: float
    rotation: float = Field(description="degrees about +Y; 0 = front faces +z")
    y: float = Field(default=0.0, ge=0, description="height of the piece's bottom above the floor, metres")
    on: str | None = Field(default=None, description="piece id it stands on (a lamp on a chest)")
    under: str | None = Field(default=None, description="piece id it is tucked under (a pouffe under a table)")
    hanging: bool = Field(default=False, description="hangs from the ceiling (pendant lights)")


class Furnished(BaseModel):
    model_config = ConfigDict(extra="forbid")
    placements: list[Placement]
    notes: list[str] = []


def footprint(p: Placement, width: float, depth: float) -> Polygon:
    rect = box(-width / 2, -depth / 2, width / 2, depth / 2)
    # Three.js rotates +z toward +x for a positive angle about +Y; in (x, z) that is clockwise
    return affinity.translate(affinity.rotate(rect, -p.rotation, origin=(0, 0)), p.x, p.z)


def _is_under(piece_id: str) -> bool:
    return any(word in piece_id.lower().split("-") for word in UNDER)


def check(f: Furnished, shell: Shell, sizes: dict[str, tuple[float, float, float]], counts: dict[str, int]) -> list[dict]:
    faults: list[dict] = []
    rooms = {r.id: Polygon(r.polygon) for r in shell.rooms}
    feet: dict[str, Polygon] = {}
    for p in f.placements:
        key = f"{p.piece}#{p.copy_}"
        if p.piece not in sizes:
            faults.append({"check": "piece", "placement": key, "detail": f"no built piece {p.piece}"})
            continue
        if p.room not in rooms:
            faults.append({"check": "room", "placement": key, "detail": f"no room {p.room}"})
            continue
        w, d, _ = sizes[p.piece]
        fp = footprint(p, w, d)
        feet[key] = fp
        outside = fp.difference(rooms[p.room].buffer(INSIDE_TOL_M)).area
        if outside > 0.005:
            where = [rid for rid, poly in rooms.items() if poly.buffer(INSIDE_TOL_M).contains(fp)]
            faults.append({"check": "inside", "placement": key, "room": p.room, "outside_m2": round(outside, 3),
                           "detail": f"footprint leaves {p.room}" + (f"; it fits inside {where[0]}" if where else "")})
    by_key = {f"{p.piece}#{p.copy_}": p for p in f.placements}
    by_piece = {p.piece: p for p in f.placements}
    ceiling = max((w.height for w in shell.walls), default=2.6)
    for key, fp in feet.items():
        p = by_key[key]
        h = sizes[p.piece][2]
        if p.on:
            base = by_piece.get(p.on)
            if base is None or p.on not in sizes:
                faults.append({"check": "on", "placement": key, "detail": f"stands on {p.on}, which is not placed"})
            else:
                top = base.y + sizes[p.on][2]
                bw, bd, _ = sizes[p.on]
                if abs(p.y - top) > 0.03:
                    faults.append({"check": "on", "placement": key, "detail": f"y must be the top of {p.on}: {top:.2f} m"})
                if fp.difference(footprint(base, bw, bd).buffer(0.02)).area > 0.005:
                    faults.append({"check": "on", "placement": key, "detail": f"hangs over the edge of {p.on}"})
        if p.hanging and p.y + h > ceiling + 0.01:
            faults.append({"check": "hanging", "placement": key, "detail": f"top at {p.y + h:.2f} m is above the {ceiling:.2f} m ceiling"})
        if p.under:
            cover = by_piece.get(p.under)
            if cover is None or p.under not in sizes or h > cover.y + sizes[p.under][2] - 0.05:
                faults.append({"check": "under", "placement": key, "detail": f"is not lower than {p.under}, so it cannot tuck under it"})

    def stacked(a: str, b: str) -> bool:
        pa, pb = by_key[a], by_key[b]
        if pa.on == pb.piece or pb.on == pa.piece or pa.under == pb.piece or pb.under == pa.piece:
            return True
        ha, hb = sizes[pa.piece][2], sizes[pb.piece][2]
        return pa.y >= pb.y + hb - 0.01 or pb.y >= pa.y + ha - 0.01  # one entirely above the other

    for (a, fa), (b, fb) in itertools.combinations(feet.items(), 2):
        if _is_under(a.split("#")[0]) or _is_under(b.split("#")[0]) or stacked(a, b):
            continue
        overlap = fa.intersection(fb).area
        if overlap > OVERLAP_M2:
            faults.append({"check": "overlap", "placements": [a, b], "area_m2": round(overlap, 3)})
    for w in shell.walls:
        line = LineString([w.start, w.end])
        body = line.buffer(w.thickness / 2, cap_style="flat")
        for key, fp in feet.items():
            if not _is_under(key.split("#")[0]) and fp.intersection(body).area > IN_WALL_M2:
                faults.append({"check": "wall", "placement": key, "wall": w.id, "detail": "footprint is inside a wall"})
        for o in w.openings:
            if o.kind != "door":
                continue
            a, b = line.interpolate(o.offset), line.interpolate(o.offset + o.width)
            swing = LineString([a, b]).buffer(DOOR_CLEAR_M, cap_style="flat")
            for key, fp in feet.items():
                if by_key[key].y >= o.sill + o.height:  # a pendant above the door head does not block it
                    continue
                if not _is_under(key.split("#")[0]) and fp.intersection(swing).area > OVERLAP_M2:
                    faults.append({"check": "door", "placement": key, "door": o.id, "detail": "blocks the doorway"})
    placed: dict[str, int] = {}
    for p in f.placements:
        placed[p.piece] = placed.get(p.piece, 0) + 1
    for piece, n in counts.items():
        if placed.get(piece, 0) > n:
            faults.append({"check": "count", "piece": piece, "detail": f"placed {placed[piece]}, the flat has {n}"})
    return faults


def load_run(run_dir: Path) -> tuple[Shell, dict[str, tuple[float, float, float]], dict[str, int]]:
    shell = Shell.model_validate_json((run_dir / "shell" / "shell.json").read_text())
    graph = Graph.model_validate_json((run_dir / "graph.json").read_text())
    sizes, counts = {}, {}
    fixtures = json.loads((run_dir / "fixtures.json").read_text()) if (run_dir / "fixtures.json").exists() else {}
    for j in graph.jobs:
        prog = run_dir / j.id / "program.json"
        if j.kind == "piece" and j.id not in fixtures and (run_dir / j.id / "piece.glb").exists():  # fixtures are not placed
            size = json.loads(prog.read_text()).get("size") if prog.exists() else j.size
            sizes[j.id] = tuple(size)
            counts[j.id] = j.count
    return shell, sizes, counts


def check_file(path: Path, workdir: Path) -> list[dict]:
    try:
        f = Furnished.model_validate_json(path.read_text())
    except (ValidationError, ValueError) as e:
        return [{"check": "format", "detail": str(e)}]
    shell, sizes, counts = load_run(workdir.parent)
    return check(f, shell, sizes, counts)


def brief(run_dir: Path) -> str:
    """Code-written facts for the furnish call: rooms and the pieces with sizes and counts."""
    shell, sizes, counts = load_run(run_dir)
    rooms = "\n".join(f"- {r.id} ({r.name}): polygon {[[round(x, 2), round(z, 2)] for x, z in r.polygon]}" for r in shell.rooms)
    doors = "\n".join(f"- door {o.id} on wall {w.id} from {w.start} to {w.end}, offset {o.offset:.2f} m, width {o.width:.2f} m"
                      for w in shell.walls for o in w.openings if o.kind == "door")
    pieces = "\n".join(f"- {pid}: width {w} m, depth {d} m, height {h} m, count {counts[pid]}" for pid, (w, d, h) in sizes.items())
    return (f"Rooms (x, z in metres; z runs down the plan):\n{rooms}\n\nDoors:\n{doors}\n\n"
            f"Built pieces (width along the piece's front, depth front to back):\n{pieces}")


def main() -> None:
    path, workdir = Path(sys.argv[1]), Path(sys.argv[2])
    faults = check_file(path, workdir)
    if faults:
        (workdir / "faults.json").write_text(json.dumps(faults, indent=1))
        print(json.dumps(faults, indent=1))
        sys.exit(1)
    (workdir / "faults.json").unlink(missing_ok=True)


if __name__ == "__main__":
    main()
