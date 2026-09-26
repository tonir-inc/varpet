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
EDITOR_EPS = 1e-5  # apps/editor/src/core/validation.ts
CLAMP_M = 0.02  # overshoot tidy() treats as rounding
JUNCTION_M = 0.35  # a joining wall end this wide in an opening is a junction, not a mistake


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
    ids = [r.id for r in shell.rooms] + [w.id for w in shell.walls] + [o.id for w in shell.walls for o in w.openings]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        faults.append({"check": "ids", "detail": f"duplicate ids {dupes}; ids are unique across rooms, walls and openings"})
    # The editor's own limits (apps/editor/src/core/validation.ts)
    if len(shell.rooms) > 32 or len(shell.walls) > 160:
        faults.append({"check": "limits", "detail": "at most 32 rooms and 160 walls"})
    for r in shell.rooms:
        if len(r.polygon) > 32:
            faults.append({"check": "limits", "room": r.id, "detail": "at most 32 polygon points"})
    for w in shell.walls:
        spans = sorted((o.offset, o.offset + o.width) for o in w.openings)
        if len(spans) > 16 or any(b[0] < a[1] - 0.001 for a, b in zip(spans, spans[1:])):
            faults.append({"check": "opening", "wall": w.id, "detail": "openings overlap or more than 16 on one wall"})
        if any(o.width < 0.2 or o.height < 0.2 for o in w.openings):
            faults.append({"check": "opening", "wall": w.id, "detail": "openings are at least 0.2 m wide and tall"})

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
            if o.offset + o.width > length + EDITOR_EPS:
                faults.append({"check": "opening", "wall": w.id, "opening": o.id,
                               "detail": f"runs {o.offset + o.width - length:.2f} m past the wall end"})
            if o.sill + o.height > w.height + EDITOR_EPS:
                faults.append({"check": "opening", "wall": w.id, "opening": o.id, "detail": "taller than the wall"})
            if o.kind == "door" and o.sill > 0.01:
                faults.append({"check": "opening", "wall": w.id, "opening": o.id, "detail": "a door has sill 0"})
            for wid, s, e in _blocked(shell, w, o):
                faults.append({"check": "opening", "wall": w.id, "opening": o.id,
                               "detail": f"wall {wid} runs through it between {s:.2f} and {e:.2f} m along {w.id}"})

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


def _obstacles(shell: Shell, host: Wall, o: Opening) -> list[tuple[str, float, float]]:
    """Solid parts of other walls inside the host's thickness over the opening's height, as
    (wall id, start, end) along the host. Mirrors openingWallObstacles in the editor."""
    length = _len(host)
    ux, uz = (host.end[0] - host.start[0]) / length, (host.end[1] - host.start[1]) / length
    half = host.thickness / 2
    band = Polygon([(0, -half), (length, -half), (length, half), (0, half)])
    bottom, top = o.sill, o.sill + o.height
    out = []
    for w in shell.walls:
        if w.id == host.id or w.height <= bottom + EDITOR_EPS:
            continue
        wl = _len(w)
        dx, dz = (w.end[0] - w.start[0]) / wl, (w.end[1] - w.start[1]) / wl
        h = w.thickness / 2
        solids, cursor = [], 0.0
        for a in sorted(w.openings, key=lambda a: a.offset):
            solids.append((cursor, a.offset, 0.0, w.height))
            solids += [(a.offset, a.offset + a.width, 0.0, a.sill), (a.offset, a.offset + a.width, a.sill + a.height, w.height)]
            cursor = a.offset + a.width
        solids.append((cursor, wl, 0.0, w.height))
        for frm, to, low, high in solids:
            if to - frm <= EDITOR_EPS or high <= low or low >= top - EDITOR_EPS or high <= bottom + EDITOR_EPS:
                continue
            pts = []
            for along, across in ((frm, -h), (to, -h), (to, h), (frm, h)):
                x = w.start[0] + dx * along - dz * across - host.start[0]
                z = w.start[1] + dz * along + dx * across - host.start[1]
                pts.append((x * ux + z * uz, -x * uz + z * ux))
            clip = Polygon(pts).intersection(band)
            if clip.area > 1e-9:
                lo, _, hi, _ = clip.bounds
                if hi - lo > EDITOR_EPS:
                    out.append((w.id, max(0.0, lo), min(length, hi)))
    return out


def _blocked(shell: Shell, host: Wall, o: Opening) -> list[tuple[str, float, float]]:
    a, b = o.offset, o.offset + o.width
    return [(wid, s, e) for wid, s, e in _obstacles(shell, host, o) if min(b, e) - max(a, s) > EDITOR_EPS]


def _door_segment(w: Wall, o: Opening) -> LineString:
    line = LineString([w.start, w.end])
    return LineString([line.interpolate(o.offset), line.interpolate(o.offset + o.width)])


def to_editor(shell: Shell) -> dict:
    """Exactly what StructureAdapter.reconstruct returns: our `printed` block stays behind."""
    return {"rooms": [r.model_dump() for r in shell.rooms], "walls": [w.model_dump() for w in shell.walls],
            "notes": shell.notes}


def tidy(shell: Shell) -> Shell:
    """Mechanical fixes in code, not a model turn: drop collinear and near-duplicate
    polygon points (within 1 cm), which also keeps rooms under the editor's 32 points."""
    for r in shell.rooms:
        poly = Polygon(r.polygon)
        if poly.is_valid:
            simple = poly.simplify(0.01, preserve_topology=True)
            r.polygon = [(round(x, 3), round(z, 3)) for x, z in list(simple.exterior.coords)[:-1]]
    for w in shell.walls:  # openings that overshoot their wall by a rounding error are clamped
        length = _len(w)
        for o in w.openings:
            over = o.offset + o.width - length
            if 0 < over <= CLAMP_M:
                o.width -= over + EDITOR_EPS
            over = o.sill + o.height - w.height
            if 0 < over <= CLAMP_M:
                o.height -= over + EDITOR_EPS
    for w in shell.walls:  # an opening at a junction slides clear of the joining wall's end
        length = _len(w)
        for o in w.openings:
            for _, s, e in _blocked(shell, w, o):
                if e - s > JUNCTION_M:
                    continue
                if s <= o.offset + EDITOR_EPS and e + o.width <= length:
                    o.offset = e + 2 * EDITOR_EPS
                elif e >= o.offset + o.width - EDITOR_EPS and s - o.width >= 0:
                    o.offset = s - o.width - 2 * EDITOR_EPS
    return shell


def check_file(path: Path, workdir: Path) -> list[dict]:
    try:
        shell = tidy(Shell.model_validate_json(path.read_text()))
    except (ValidationError, ValueError) as e:
        return [{"check": "format", "detail": str(e)}]
    path.write_text(shell.model_dump_json(indent=1))
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
