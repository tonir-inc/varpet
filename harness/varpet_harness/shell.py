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
import math
import json
import re
import sys
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

from .openings import choose_model

Vec2 = tuple[float, float]
HEX = r"^#[0-9a-fA-F]{6}$"

ON_EDGE_M = 0.08  # a wall's centreline may sit this far off a room edge
AREA_TOL = 0.10  # computed room area vs the area the plan prints
OPEN_MIN_M = 0.6  # an unwalled shared edge this long is a passage
EDITOR_EPS = 1e-5  # apps/editor/src/core/validation.ts
CLAMP_M = 0.02  # overshoot tidy() treats as rounding
JUNCTION_M = 0.35  # a joining wall end this wide in an opening is a junction, not a mistake
SNAP_M = 0.08  # wall ends this close to a corner or crossing are the same point
SLIVER_M = 0.05  # the editor splits walls at every crossing and rejects shorter sections
INSIDE_TOL_M = 0.03  # a component footprint may overhang its room by this much
WALL_HIT_M2 = 1e-4  # a free component may touch a wall body by this much
OVERLAP_M2 = 0.02  # component footprints overlapping more than this collide
DOOR_CLEAR_M = 0.5  # floor kept free in front of and behind every door (furnish.py)
Vec3 = tuple[float, float, float]
ComponentKind = Literal["sink", "toilet", "shower", "bath", "cabinet", "worktop", "appliance", "radiator", "railing"]
POINTS_MAX = 32  # the editor's polygon limit (validation.ts)
JOG_M = 0.08  # a notch this shallow (a door recess in a thick wall) flattens first when a room has too many points
SIMPLIFY_M = (0.01, 0.02, 0.03, 0.05)  # then Douglas-Peucker, never as far as ON_EDGE_M
HEIGHT_M = (2.1, 4.0)  # a full-height wall
PARAPET_M = 0.9  # a lower wall with no openings is a parapet or balcony rail
DOOR_MIN_M = 0.6  # tidy() never clips a door narrower than this
GAP_M = 2 * EDITOR_EPS  # clearance tidy() leaves between an opening and what it moved off
FACE_M = 0.053  # the designer bridge's room-face tolerance (packages/designer/src/reconcile-geometry.ts)
FACE_DEG = 5.0  # a room edge this close in angle to a wall is that wall's face
NUDGE_M = 0.10  # tidy() pushes a free fixture this far out of a wall body; deeper stays a fault for the model


class Opening(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Literal["door", "window"]
    offset: float = Field(ge=0, description="metres from wall.start to the near edge")
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    sill: float = Field(ge=0)
    assetId: str | None = Field(default=None, description="catalog model for the rendered GLB, e.g. extra:openings:door-oak-glazed; absent renders the procedural opening")


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


class ComponentHost(BaseModel):
    """apps/editor/src/renovation-contracts.ts ComponentHost."""

    model_config = ConfigDict(extra="forbid")
    wallId: str
    offset: float = Field(ge=0, le=100, description="metres from wall.start to the component's centre")
    elevation: float = Field(ge=-10, le=20, description="metres from the wall base to the component's bottom")
    side: Literal[1, -1] = Field(description="1 = the face on the (-dz, dx) normal of start->end (+z for a +x wall), -1 = the other")


class Component(BaseModel):
    """A built fixture, the editor's BuildingComponent (renovation-contracts.ts) restricted to fixtures.

    position is [x, y, z] m: footprint centre in x/z, y = bottom. dimensions is
    [width along local x, height, depth along local z] m. rotation is radians
    about +Y (editor footprint: local x -> (cos r, -sin r)). With a host the editor
    ignores position and places it on the wall face; rotation then adds to the wall's yaw."""

    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=120, pattern=r"\S")
    kind: ComponentKind
    position: Vec3
    dimensions: Vec3
    rotation: float = 0.0
    color: str = Field(pattern=HEX)
    phase: Literal["existing"] = "existing"
    host: ComponentHost | None = None
    roomId: str
    notes: str | None = None


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
    components: list[Component] = Field(default=[], description="built fixtures, the editor's BuildingComponent")


def _len(w: Wall) -> float:
    return LineString([w.start, w.end]).length


def check(shell: Shell) -> list[dict]:
    faults: list[dict] = []
    ids = ([r.id for r in shell.rooms] + [w.id for w in shell.walls] + [o.id for w in shell.walls for o in w.openings]
           + [c.id for c in shell.components])
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        faults.append({"check": "ids", "detail": f"duplicate ids {dupes}; ids are unique across rooms, walls, openings and components"})
    # The editor's own limits (apps/editor/src/core/validation.ts)
    if len(shell.rooms) > 32 or len(shell.walls) > 160 or len(shell.components) > 500:
        faults.append({"check": "limits", "detail": "at most 32 rooms, 160 walls and 500 components"})
    for r in shell.rooms:
        if len(r.polygon) > POINTS_MAX:
            faults.append({"check": "limits", "room": r.id, "detail": f"at most {POINTS_MAX} polygon points"})
    for w in shell.walls:
        spans = sorted((o.offset, o.offset + o.width) for o in w.openings)
        if len(spans) > 16 or any(b[0] < a[1] - EDITOR_EPS for a, b in zip(spans, spans[1:])):
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
        parapet = not w.openings and PARAPET_M <= w.height < HEIGHT_M[0]
        if not 0.05 <= w.thickness <= 0.6 or not (HEIGHT_M[0] <= w.height <= HEIGHT_M[1] or parapet):
            faults.append({"check": "wall", "wall": w.id, "detail": f"thickness {w.thickness} or height {w.height} out of range"})
        # A wall end sits at the corner of two wall centrelines: the room corner is up to both half-thicknesses away
        off = max(boundaries.distance(line.interpolate(t, normalized=True)) - _corner_reach(shell, w, t) for t in (0, 0.5, 1))
        if off > ON_EDGE_M:
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

    faults += _faces(shell, polys)
    faults += _reachable(shell, polys)
    faults += _slivers(shell)
    faults += _components(shell, polys)

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
    for a, b in _through_doors(shell, polys):
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


def _corner_reach(shell: Shell, w: Wall, t: float) -> float:
    """How far a room edge may sit from w's centreline at fraction t: its half-thickness, and at an
    end that another wall joins, the diagonal to the inside corner of the two faces."""
    half = w.thickness / 2
    if t not in (0, 1):
        return half
    end = Point(w.start if t == 0 else w.end)
    joins = [o.thickness / 2 for o in shell.walls if o is not w and LineString([o.start, o.end]).distance(end) <= SNAP_M]
    return math.hypot(half, max(joins)) if joins else half


def _through_doors(shell: Shell, polys: dict[str, Polygon]) -> list[tuple[str, str]]:
    """Room pairs a door joins across its wall's thickness: the rooms just past each face."""
    pairs = []
    for w in shell.walls:
        length = _len(w)
        nx, nz = -(w.end[1] - w.start[1]) / length, (w.end[0] - w.start[0]) / length
        reach = w.thickness / 2 + ON_EDGE_M
        for o in w.openings:
            if o.kind != "door":
                continue
            mid = _door_segment(w, o).interpolate(0.5, normalized=True)
            sides = []
            for sign in (1, -1):
                probe = Point(mid.x + sign * nx * reach, mid.y + sign * nz * reach)
                near = min(((p.distance(probe), rid) for rid, p in polys.items()), default=(ON_EDGE_M + 1, None))
                sides.append(near[1] if near[0] <= ON_EDGE_M else None)
            if sides[0] and sides[1] and sides[0] != sides[1]:
                pairs.append((sides[0], sides[1]))
    return pairs


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


def _host_pose(shell: Shell, c: Component) -> tuple[tuple[float, float, float], float]:
    """World position and yaw, as componentPosition/componentRotation in apps/editor/src/core/geometry.ts."""
    wall = next((w for w in shell.walls if c.host and w.id == c.host.wallId), None)
    if wall is None:
        return c.position, c.rotation
    length = _len(wall)
    dx, dz = (wall.end[0] - wall.start[0]) / length, (wall.end[1] - wall.start[1]) / length
    across = c.host.side * (wall.thickness + c.dimensions[2]) / 2
    pos = (wall.start[0] + dx * c.host.offset - dz * across, c.host.elevation, wall.start[1] + dz * c.host.offset + dx * across)
    yaw = -math.atan2(dz, dx) + (math.pi if c.host.side == -1 else 0.0) + c.rotation
    return pos, yaw


def _footprint(shell: Shell, c: Component) -> Polygon:
    """footprint() in apps/editor/src/core/renovation.ts."""
    (px, _, pz), r = _host_pose(shell, c)
    w, d = c.dimensions[0] / 2, c.dimensions[2] / 2
    return Polygon([(px + math.cos(r) * x * w + math.sin(r) * z * d, pz - math.sin(r) * x * w + math.cos(r) * z * d)
                    for x, z in ((-1, -1), (1, -1), (1, 1), (-1, 1))])


def _wall_body(w: Wall) -> Polygon:
    return LineString([w.start, w.end]).buffer(w.thickness / 2, cap_style="flat")


def _components(shell: Shell, polys: dict[str, Polygon]) -> list[dict]:
    faults: list[dict] = []
    walls = {w.id: w for w in shell.walls}
    feet: dict[str, Polygon] = {}
    spans: dict[str, tuple[float, float]] = {}
    for c in shell.components:
        # validateProject in apps/editor/src/core/validation.ts
        if not all(-100 <= v <= 100 for v in c.position) or not all(0.01 <= v <= 30 for v in c.dimensions) \
                or abs(c.rotation) > math.pi * 100:
            faults.append({"check": "component", "component": c.id, "detail": "invalid geometry: position within +-100 m, each dimension 0.01..30 m"})
            continue
        if c.roomId not in {r.id for r in shell.rooms}:
            faults.append({"check": "component", "component": c.id, "detail": f"references missing room {c.roomId}"})
        host = walls.get(c.host.wallId) if c.host else None
        if c.host:
            if host is None:
                faults.append({"check": "component", "component": c.id, "detail": f"references missing host wall {c.host.wallId}"})
                continue
            half, length = c.dimensions[0] / 2, _len(host)
            if c.host.offset < half - EDITOR_EPS or c.host.offset + half > length + EDITOR_EPS \
                    or c.host.elevation < -EDITOR_EPS or c.host.elevation + c.dimensions[1] > host.height + EDITOR_EPS:
                faults.append({"check": "component", "component": c.id, "wall": host.id,
                               "detail": f"extends beyond its host wall (offset {c.host.offset:.2f} m is the centre; wall is {length:.2f} m long, {host.height} m tall)"})
            for other in shell.walls:  # the editor splits the host where a wall meets it (wall-junctions.ts)
                hit = _crossing(host, other) if other is not host else None
                if hit is None or not -EDITOR_EPS / _len(other) <= hit[3] <= 1 + EDITOR_EPS / _len(other):
                    continue
                cut = hit[2] * length
                if EDITOR_EPS < cut < length - EDITOR_EPS and c.host.offset - half < cut - EDITOR_EPS < cut + EDITOR_EPS < c.host.offset + half:
                    faults.append({"check": "component", "component": c.id, "wall": host.id,
                                   "detail": f"crosses the junction with wall {other.id} at {cut:.2f} m along {host.id}; "
                                             "the editor splits the wall there: move it clear or split it in two"})
        elif not any(p.contains(Point(c.position[0], c.position[2])) for p in polys.values()):
            faults.append({"check": "component", "component": c.id,
                           "detail": "its centre lies outside every room (the editor rejects it): move it inside or mount it on a wall"})
        fp = _footprint(shell, c)
        feet[c.id] = fp
        base = _host_pose(shell, c)[0][1]
        spans[c.id] = (base, base + c.dimensions[1])
        room = polys.get(c.roomId)
        if room is not None and not room.buffer(INSIDE_TOL_M).contains(fp):
            out = fp.difference(room).area
            faults.append({"check": "component", "component": c.id, "room": c.roomId,
                           "detail": f"footprint leaves its room by {out:.2f} m2"})
        for w in shell.walls:
            if host is not None and w.id == host.id:
                continue
            hit = fp.intersection(_wall_body(w)).area
            if hit > WALL_HIT_M2:
                faults.append({"check": "component", "component": c.id, "wall": w.id,
                               "detail": f"runs {hit:.3f} m2 into the wall body; set host to mount it on a wall"})
        for w in shell.walls:
            line = LineString([w.start, w.end])
            for o in w.openings:
                if o.kind != "door" or spans[c.id][0] >= o.sill + o.height:
                    continue
                zone = LineString([line.interpolate(o.offset), line.interpolate(o.offset + o.width)]).buffer(DOOR_CLEAR_M, cap_style="flat")
                if fp.intersection(zone).area > OVERLAP_M2:
                    faults.append({"check": "door", "component": c.id, "door": o.id, "detail": "blocks the doorway"})
    for a, b in itertools.combinations(feet, 2):
        (la, ha), (lb, hb) = spans[a], spans[b]
        if min(ha, hb) <= max(la, lb):
            continue  # one above the other, e.g. a wall cabinet over a worktop
        overlap = feet[a].intersection(feet[b]).area
        if overlap > OVERLAP_M2:
            faults.append({"check": "component", "components": [a, b], "area_m2": round(overlap, 3), "detail": "footprints overlap"})
    return faults


def _door_segment(w: Wall, o: Opening) -> LineString:
    line = LineString([w.start, w.end])
    return LineString([line.interpolate(o.offset), line.interpolate(o.offset + o.width)])


def to_editor(shell: Shell) -> dict:
    """Exactly what StructureAdapter.reconstruct returns, plus the project's components
    (BuildingComponent, unset optionals left out) when there are any: `printed` stays behind.
    An opening with no assetId gets one from the catalog when a model fits (openings.py); the
    editor renders that GLB instead of the procedural opening."""
    polys = {r.id: Polygon(r.polygon) for r in shell.rooms}
    entrance = _entrance(shell, polys)
    walls = []
    for w in shell.walls:
        wd = w.model_dump()
        wd["openings"] = [_opening_dict(o, o.id == entrance) for o in w.openings]
        walls.append(wd)
    out = {"rooms": [r.model_dump() for r in shell.rooms], "walls": walls, "notes": shell.notes}
    if shell.components:
        out["components"] = [c.model_dump(exclude_none=True) for c in shell.components]
    return out


def _opening_dict(o: Opening, entrance: bool) -> dict:
    od = o.model_dump(exclude_none=True)
    if o.assetId is None:
        model = choose_model(o.kind, o.width, o.height, exterior=entrance)
        if model:
            od["assetId"] = model
    return od


def _sides(w: Wall, o: Opening, polys: dict[str, Polygon]) -> list[str | None]:
    """The room just past each face of the wall at the opening's midpoint, or None."""
    mid = _door_segment(w, o).interpolate(0.5, normalized=True)
    length, reach = _len(w), w.thickness / 2 + 0.25
    nx, nz = -(w.end[1] - w.start[1]) / length, (w.end[0] - w.start[0]) / length
    return [next((rid for rid, p in polys.items() if p.contains(Point(mid.x + sign * nx * reach, mid.y + sign * nz * reach))), None)
            for sign in (1, -1)]


HALL = re.compile(r"entr|hall|corridor|foyer|lobby", re.I)


def _entrance(shell: Shell, polys: dict[str, Polygon]) -> str | None:
    """The flat's front door: a door with a room on one side only, from a hall-like room first, then
    the widest. One per flat; balcony doors have the balcony room behind them and never qualify."""
    names = {r.id: r.name for r in shell.rooms}
    doors = []
    for w in shell.walls:
        for o in w.openings:
            sides = _sides(w, o, polys) if o.kind == "door" else []
            inside = [r for r in sides if r]
            if len(inside) == 1:
                doors.append((not HALL.search(names[inside[0]]), -o.width, o.id))
    return min(doors)[2] if doors else None


def _crossing(a: Wall, b: Wall) -> tuple[float, float, float, float] | None:
    """Where the lines of a and b cross: (x, z, t along a in 0..1, s along b in 0..1), or None if parallel."""
    (ax, az), (bx, bz) = a.start, b.start
    ux, uz = a.end[0] - ax, a.end[1] - az
    vx, vz = b.end[0] - bx, b.end[1] - bz
    den = ux * vz - uz * vx
    if abs(den) < 1e-9 * max(_len(a) * _len(b), 1e-9):
        return None
    dx, dz = bx - ax, bz - az
    t, s = (dx * vz - dz * vx) / den, (dx * uz - dz * ux) / den
    return ax + ux * t, az + uz * t, t, s


def _move_end(w: Wall, which: str, point: tuple[float, float]) -> None:
    """Move a wall end; openings keep their place along the wall."""
    if which == "start":
        # Signed shift along the wall: extending backwards is negative
        ux, uz = (w.end[0] - w.start[0]) / _len(w), (w.end[1] - w.start[1]) / _len(w)
        shift = (point[0] - w.start[0]) * ux + (point[1] - w.start[1]) * uz
        w.start = point
        for o in w.openings:
            o.offset = max(0.0, o.offset - shift)
    else:
        w.end = point


def _snap_junctions(shell: Shell) -> None:
    ends = [(w, k) for w in shell.walls for k in ("start", "end")]
    # 1. ends within SNAP_M of each other become one exact point
    for i, (w, k) in enumerate(ends):
        p = getattr(w, k)
        for w2, k2 in ends[i + 1 :]:
            q = getattr(w2, k2)
            if w2 is not w and 0 < LineString([p, q]).length <= SNAP_M:
                _move_end(w2, k2, p)
    # 2. an end within SNAP_M of where its wall crosses another wall moves onto the crossing
    for w in shell.walls:
        for other in shell.walls:
            if other is w:
                continue
            hit = _crossing(w, other)
            if hit is None:
                continue
            x, z, t, s = hit
            lo, ho = -SNAP_M / _len(other), 1 + SNAP_M / _len(other)
            if not lo <= s <= ho:
                continue
            for which, at in (("start", 0.0), ("end", 1.0)):
                gap = abs(t - at) * _len(w)
                if EDITOR_EPS < gap <= SNAP_M:
                    _move_end(w, which, (x, z))


def _slivers(shell: Shell) -> list[dict]:
    """Crossings that would leave the editor a wall section under 5 cm."""
    faults = []
    for w in shell.walls:
        L, cuts = _len(w), []
        for other in shell.walls:
            if other is w:
                continue
            hit = _crossing(w, other)
            if hit is None:
                continue
            _, _, t, s = hit
            M = _len(other)
            if not (-1e-6 <= s * M <= M + 1e-6 and -1e-6 <= t * L <= L + 1e-6):
                continue
            cuts.append((t * L, other.id))
            near = min(t * L, (1 - t) * L)
            if 1e-6 < near < SLIVER_M:
                faults.append({"check": "junction", "wall": w.id, "other": other.id,
                               "detail": f"{other.id} meets {w.id} {near * 100:.1f} cm from its end; meet at the end or at least 5 cm in"})
                break
        else:  # two junctions close together leave a sliver between them (wall-junctions.ts)
            cuts.sort()
            for (a, ia), (b, ib) in zip(cuts, cuts[1:]):
                if 1e-6 < b - a < SLIVER_M:
                    faults.append({"check": "junction", "wall": w.id, "other": ib,
                                   "detail": f"{ia} and {ib} meet {w.id} only {(b - a) * 100:.1f} cm apart; "
                                             "make them meet at one point or at least 5 cm apart"})
                    break
    return faults


def _face_of(w: Wall, a: Vec2, b: Vec2) -> tuple[Vec2, Vec2] | None:
    """The face of w that room edge a-b lies along, as (point, unit direction), or None.
    The edge must run within FACE_DEG of the wall, overlap it, and sit on one side near that face."""
    length = _len(w)
    ux, uz = (w.end[0] - w.start[0]) / length, (w.end[1] - w.start[1]) / length
    ex, ez = b[0] - a[0], b[1] - a[1]
    elen = (ex * ex + ez * ez) ** 0.5
    if elen < 0.2 or abs(ux * ez - uz * ex) / elen > math.sin(math.radians(FACE_DEG)):
        return None
    along = sorted(((p[0] - w.start[0]) * ux + (p[1] - w.start[1]) * uz) for p in (a, b))
    if min(along[1], length) - max(along[0], 0.0) < 0.2:
        return None
    mid = ((a[0] + b[0]) / 2 - w.start[0], (a[1] + b[1]) / 2 - w.start[1])
    side = -mid[0] * uz + mid[1] * ux  # signed distance of the edge's middle from the centreline
    half = w.thickness / 2
    if abs(abs(side) - half) > ON_EDGE_M or abs(side) < half / 2:  # nearer the centreline: that convention stays
        return None
    sign = 1 if side > 0 else -1
    return (w.start[0] - uz * half * sign, w.start[1] + ux * half * sign), (ux, uz)


def _off_face(p: Vec2, face: tuple[Vec2, Vec2]) -> float:
    (fx, fz), (ux, uz) = face
    return -(p[0] - fx) * uz + (p[1] - fz) * ux


def _edge_faces(shell: Shell, pts: list[Vec2]) -> list[tuple[Vec2, Vec2] | None]:
    """For each edge i (pts[i] -> pts[i+1]) the nearest wall face it lies along."""
    out = []
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        faces = [f for w in shell.walls if (f := _face_of(w, a, b))]
        out.append(min(faces, key=lambda f: abs(_off_face(a, f)) + abs(_off_face(b, f)), default=None))
    return out


def _align_faces(shell: Shell, pts: list[Vec2]) -> list[Vec2]:
    """Move room corners onto the wall faces their edges lie along, so a slightly skewed
    edge becomes the wall's own face: two faces meet at their crossing, one face takes a projection."""
    faces = _edge_faces(shell, pts)
    out = []
    for i, p in enumerate(pts):
        f1, f2 = faces[i - 1], faces[i]  # the edge into p and the edge out of p
        q = p
        if f1 and f2 and abs(f1[1][0] * f2[1][1] - f1[1][1] * f2[1][0]) > 0.1:
            (ax, az), (ux, uz) = f1
            (bx, bz), (vx, vz) = f2
            den = ux * vz - uz * vx
            t = ((bx - ax) * vz - (bz - az) * vx) / den
            q = (ax + ux * t, az + uz * t)
        elif f1 or f2:
            (fx, fz), (ux, uz) = f1 or f2
            t = (p[0] - fx) * ux + (p[1] - fz) * uz
            q = (fx + ux * t, fz + uz * t)
        out.append(q if LineString([p, q]).length <= ON_EDGE_M + FACE_M else p)
    return out


def _faces(shell: Shell, polys: dict[str, Polygon]) -> list[dict]:
    """Room edges along a wall must follow its face within the designer bridge's tolerance."""
    faults = []
    for r in shell.rooms:
        if r.id not in polys:
            continue
        pts = list(r.polygon)
        for i, f in enumerate(_edge_faces(shell, pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            off = max(abs(_off_face(a, f)), abs(_off_face(b, f))) if f else 0.0
            if off > FACE_M:
                faults.append({"check": "face", "room": r.id,
                               "detail": f"edge {a}->{b} is {off * 1000:.0f} mm off its wall's face; keep it within {FACE_M * 1000:.0f} mm"})
    return faults


def _flatten_jog(pts: list[Vec2]) -> list[Vec2] | None:
    """Drop the shallowest notch a, b, c, d (short stubs a-b and c-d running opposite ways,
    so a and d sit on one line): the room keeps its silhouette and its right angles."""
    n, best = len(pts), None
    for i in range(n):
        a, b, c, d = (pts[(i + k) % n] for k in range(4))
        ab, cd = (b[0] - a[0], b[1] - a[1]), (d[0] - c[0], d[1] - c[1])
        stub = max(LineString([a, b]).length, LineString([c, d]).length)
        if stub > JOG_M or abs(ab[0] + cd[0]) > 0.01 or abs(ab[1] + cd[1]) > 0.01:
            continue
        loss = Polygon([a, b, c, d]).area
        if best is None or loss < best[0]:
            best = (loss, {(i + 1) % n, (i + 2) % n})
    return None if best is None else [p for j, p in enumerate(pts) if j not in best[1]]


def _fit_points(poly: Polygon) -> Polygon:
    """Under the editor's point limit with the least change: flatten door recesses, then simplify."""
    poly = poly.simplify(0.01, preserve_topology=True)
    while len(poly.exterior.coords) - 1 > POINTS_MAX:
        pts = _flatten_jog(list(poly.exterior.coords)[:-1])
        flat = Polygon(pts).simplify(1e-6, preserve_topology=True) if pts and len(pts) >= 3 else None
        if flat is None or not flat.is_valid:
            break
        poly = flat
    for tol in SIMPLIFY_M:
        if len(poly.exterior.coords) - 1 <= POINTS_MAX:
            break
        poly = poly.simplify(tol, preserve_topology=True)
    return poly


def _free(shell: Shell, w: Wall, o: Opening) -> list[tuple[float, float]]:
    """Stretches of w clear of joining walls and of its other openings, at o's height."""
    taken = sorted([(s, e) for _, s, e in _obstacles(shell, w, o)]
                   + [(p.offset, p.offset + p.width) for p in w.openings if p is not o])
    free, cursor = [], 0.0
    for s, e in taken + [(_len(w), _len(w))]:
        if s - cursor > 2 * GAP_M:
            free.append((cursor + GAP_M if cursor else 0.0, s - GAP_M))
        cursor = max(cursor, e)
    return free


def _clear(shell: Shell, w: Wall) -> None:
    """An opening a joining wall cuts into slides clear, or is clipped a little, never through a real wall."""
    for o in w.openings:
        hits = _blocked(shell, w, o)
        if not hits or any(e - s > JUNCTION_M for _, s, e in hits):
            continue
        free, a, b = _free(shell, w, o), o.offset, o.offset + o.width
        fits = [min(max(a, lo), hi - o.width) for lo, hi in free if hi - lo >= o.width]
        to = min(fits, key=lambda x: abs(x - a), default=None)
        if to is not None and abs(to - a) <= JUNCTION_M:
            o.offset = to
            continue
        near = [(lo, hi) for lo, hi in free if min(b, hi) > max(a, lo) or abs(lo - b) <= JUNCTION_M or abs(hi - a) <= JUNCTION_M]
        lo, hi = max(near, key=lambda s: s[1] - s[0], default=(0.0, 0.0))
        if hi - lo >= (DOOR_MIN_M if o.kind == "door" else 0.2) and o.width - (hi - lo) <= JUNCTION_M:
            o.offset, o.width = lo, hi - lo


def _unoverlap(w: Wall) -> None:
    """Openings that overlap by a rounding error are trimmed apart; two of a kind that overlap
    further are one opening. A door over a window stays a fault for the model."""
    kept: list[Opening] = []
    for o in sorted(w.openings, key=lambda o: o.offset):
        prev = kept[-1] if kept else None
        over = prev.offset + prev.width - o.offset if prev else 0.0
        if prev is None or over <= 0:
            kept.append(o)
        elif over <= CLAMP_M and o.width - over - GAP_M >= 0.2:
            o.offset, o.width = o.offset + over + GAP_M, o.width - over - GAP_M
            kept.append(o)
        elif prev.kind == o.kind:
            top = max(prev.sill + prev.height, o.sill + o.height)
            prev.width = max(prev.offset + prev.width, o.offset + o.width) - prev.offset
            prev.sill = min(prev.sill, o.sill)
            prev.height = top - prev.sill
        else:
            kept.append(o)
    w.openings = kept


def _dedupe_ids(shell: Shell) -> None:
    """Openings and components that reuse an id get a suffix; the first holder keeps it.
    Walls and rooms are referenced by id (hosts, roomId, printed), so their clashes stay with the model."""
    taken = [r.id for r in shell.rooms] + [w.id for w in shell.walls]
    seen = set(taken)
    for item in [o for w in shell.walls for o in w.openings] + list(shell.components):
        if item.id in seen:
            n = 2
            while f"{item.id}-{n}" in seen:
                n += 1
            item.id = f"{item.id}-{n}"
        seen.add(item.id)


def _nudge_out_of_walls(shell: Shell) -> None:
    """A free fixture a few cm into a wall body moves out along the wall's normal, toward its own side,
    if that clears every wall within NUDGE_M."""
    for c in shell.components:
        if c.host:
            continue
        dx = dz = 0.0
        fp = _footprint(shell, c)
        for w in shell.walls:
            if fp.intersection(_wall_body(w)).area <= WALL_HIT_M2:
                continue
            length = _len(w)
            ux, uz = (w.end[0] - w.start[0]) / length, (w.end[1] - w.start[1]) / length
            side = -(c.position[0] - w.start[0]) * uz + (c.position[2] - w.start[1]) * ux
            if abs(side) < EDITOR_EPS:
                continue
            sign = 1 if side > 0 else -1
            depth = max(w.thickness / 2 - sign * (-(x - w.start[0]) * uz + (z - w.start[1]) * ux)
                        for x, z in fp.exterior.coords)
            dx, dz = dx - uz * sign * (depth + GAP_M), dz + ux * sign * (depth + GAP_M)
        if not dx and not dz or math.hypot(dx, dz) > NUDGE_M:
            continue
        moved = c.model_copy(update={"position": (c.position[0] + dx, c.position[1], c.position[2] + dz)})
        if all(_footprint(shell, moved).intersection(_wall_body(w)).area <= WALL_HIT_M2 for w in shell.walls):
            c.position = tuple(round(v, 4) for v in moved.position)


def tidy(shell: Shell) -> Shell:
    """Mechanical fixes in code, not a model turn: drop collinear and near-duplicate
    polygon points (within 1 cm) and keep rooms under the editor's 32 points."""
    _dedupe_ids(shell)
    _snap_junctions(shell)
    for r in shell.rooms:
        poly = Polygon(r.polygon)
        if poly.is_valid:
            pts = list(_fit_points(poly).exterior.coords)[:-1]
            aligned = Polygon(_align_faces(shell, pts)).simplify(0.001, preserve_topology=True)  # corners that met drop out
            if aligned.is_valid and abs(aligned.area - poly.area) <= poly.exterior.length * ON_EDGE_M:
                pts = list(aligned.exterior.coords)[:-1]
            r.polygon = [(round(x, 4), round(z, 4)) for x, z in pts]
    for w in shell.walls:  # openings that overshoot their wall by a rounding error are clamped
        length = _len(w)
        for o in w.openings:
            over = o.offset + o.width - length
            if 0 < over <= CLAMP_M:
                o.width -= over + EDITOR_EPS
            over = o.sill + o.height - w.height
            if 0 < over <= CLAMP_M:
                o.height -= over + EDITOR_EPS
    for w in shell.walls:
        _unoverlap(w)
    for w in shell.walls:
        _clear(shell, w)
    for c in shell.components:  # a mounted component's position is where the editor will draw it
        if c.host and any(w.id == c.host.wallId for w in shell.walls):
            c.position = tuple(round(v, 4) for v in _host_pose(shell, c)[0])
    _nudge_out_of_walls(shell)
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
