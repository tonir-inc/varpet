"""The flat shell: rooms and walls the architect reads off the plan and photos.

Output is the editor's structure contract (apps/editor/src/contracts.ts:
Room, Wall, Opening; Vec2 is [x, z] in metres, Y up) plus what the plan
prints, so code can check the reading against the plan's own numbers.
Open passages between rooms are simply edges with no wall.

CLI: python -m varpet_harness.shell <shell.json> <workdir>  (exit 0 on pass,
else <workdir>/faults.json), the same contract as the piece compiler.
"""

from __future__ import annotations

import itertools
import json
import sys
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

Vec2 = tuple[float, float]
HEX = r"^#[0-9a-fA-F]{6}$"

ON_EDGE_M = 0.08  # a wall's centreline may sit this far off a room edge
AREA_TOL = 0.10  # computed room area vs the area the plan prints
OPEN_MIN_M = 0.6  # an unwalled shared edge this long is a passage


class Opening(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Literal["door", "window"]
    offset: float = Field(ge=0, description="metres from wall.start to the near edge")
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    sill: float = Field(ge=0)


class Wall(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    start: Vec2
    end: Vec2
    height: float
    thickness: float
    color: str = Field(pattern=HEX)
    openings: list[Opening] = []


class Room(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    polygon: list[Vec2] = Field(min_length=3)
    color: str = Field(pattern=HEX, description="floor colour seen in the photos")


class Printed(BaseModel):
    """What the plan itself prints for a room; checked against the traced polygon."""

    model_config = ConfigDict(extra="forbid")
    area_m2: float | None = None
    dims_m: tuple[float, float] | None = None


class Shell(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rooms: list[Room] = Field(min_length=1)
    walls: list[Wall] = Field(min_length=1)
    notes: list[str] = Field(description="what was printed, measured off the image, or guessed")
    printed: dict[str, Printed] = Field(default={}, description="room id -> numbers printed on the plan")


def _len(w: Wall) -> float:
    return LineString([w.start, w.end]).length


def check(shell: Shell) -> list[dict]:
    faults: list[dict] = []
    ids = [r.id for r in shell.rooms] + [w.id for w in shell.walls]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        faults.append({"check": "ids", "detail": f"duplicate ids {dupes}"})

    polys: dict[str, Polygon] = {}
    for r in shell.rooms:
        poly = Polygon(r.polygon)
        if not poly.is_valid:
            faults.append({"check": "room", "room": r.id, "detail": "polygon crosses itself"})
        elif poly.area < 0.5:
            faults.append({"check": "room", "room": r.id, "detail": f"area {poly.area:.2f} m2 is too small"})
        else:
            polys[r.id] = poly
    for (a, pa), (b, pb) in itertools.combinations(polys.items(), 2):
        overlap = pa.intersection(pb).area
        if overlap > 0.05:
            faults.append({"check": "overlap", "rooms": [a, b], "area_m2": round(overlap, 2)})

    boundaries = unary_union([p.exterior for p in polys.values()])
    for w in shell.walls:
        length = _len(w)
        line = LineString([w.start, w.end])
        if length < 0.2:
            faults.append({"check": "wall", "wall": w.id, "detail": f"length {length:.2f} m"})
            continue
        if not 0.05 <= w.thickness <= 0.6 or not 2.1 <= w.height <= 4.0:
            faults.append({"check": "wall", "wall": w.id, "detail": f"thickness {w.thickness} or height {w.height} out of range"})
        off = max(boundaries.distance(line.interpolate(t, normalized=True)) for t in (0, 0.5, 1))
        if off > ON_EDGE_M + w.thickness / 2:
            faults.append({"check": "wall", "wall": w.id, "detail": f"not on a room edge ({off:.2f} m off)"})
        for o in w.openings:
            if o.offset + o.width > length + 0.01:
                faults.append({"check": "opening", "wall": w.id, "opening": o.id,
                               "detail": f"runs {o.offset + o.width - length:.2f} m past the wall end"})
            if o.sill + o.height > w.height + 0.01:
                faults.append({"check": "opening", "wall": w.id, "opening": o.id, "detail": "taller than the wall"})
            if o.kind == "door" and o.sill > 0.01:
                faults.append({"check": "opening", "wall": w.id, "opening": o.id, "detail": "a door has sill 0"})

    faults += _reachable(shell, polys)

    for rid, pr in shell.printed.items():
        poly = polys.get(rid)
        if poly is None:
            continue
        want = pr.area_m2 if pr.area_m2 else (pr.dims_m[0] * pr.dims_m[1] if pr.dims_m else None)
        if want and abs(poly.area - want) > AREA_TOL * want:
            faults.append({"check": "printed", "room": rid, "traced_m2": round(poly.area, 2),
                           "printed_m2": round(want, 2)})
    return faults


def _reachable(shell: Shell, polys: dict[str, Polygon]) -> list[dict]:
    """Rooms connect through a door on a shared wall or an unwalled shared edge."""
    if len(polys) < 2:
        return []
    links: dict[str, set[str]] = {r: set() for r in polys}
    for (a, pa), (b, pb) in itertools.combinations(polys.items(), 2):
        shared = pa.exterior.intersection(pb.exterior.buffer(ON_EDGE_M))
        if shared.length < 0.3:
            continue
        zone = shared.buffer(ON_EDGE_M + 0.1)
        near = [w for w in shell.walls if LineString([w.start, w.end]).intersection(zone).length > 0.3]
        walled = unary_union([LineString([w.start, w.end]).buffer(ON_EDGE_M + w.thickness / 2) for w in near]) if near else None
        open_len = shared.difference(walled).length if walled is not None else shared.length
        door = any(_door_segment(w, o).intersection(zone).length > 0.5 * o.width
                   for w in near for o in w.openings if o.kind == "door")
        if door or open_len >= OPEN_MIN_M:
            links[a].add(b)
            links[b].add(a)
    start = next(iter(links))
    seen, todo = {start}, [start]
    while todo:
        for n in links[todo.pop()] - seen:
            seen.add(n)
            todo.append(n)
    cut = sorted(set(polys) - seen)
    return [{"check": "reachable", "rooms": cut, "detail": "no door or open passage links these to the rest"}] if cut else []


def _door_segment(w: Wall, o: Opening) -> LineString:
    line = LineString([w.start, w.end])
    return LineString([line.interpolate(o.offset), line.interpolate(o.offset + o.width)])


def check_file(path: Path, workdir: Path) -> list[dict]:
    try:
        shell = Shell.model_validate_json(path.read_text())
    except (ValidationError, ValueError) as e:
        return [{"check": "format", "detail": str(e)}]
    return check(shell)


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
