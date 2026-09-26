"""Compile a part program to a GLB and check it.

CLI (contract in compiler/README.md): partc <program.json> <workdir>
Writes <workdir>/piece.glb and report.json; exit 0 when every check passes,
otherwise faults.json and exit 1.
"""

from __future__ import annotations

import itertools
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh
from pydantic import ValidationError
from trimesh.visual import TextureVisuals

from .materials import box_uv, library, pbr
from .program import Material, Part, Program

FLOOR_TOL = 0.005  # m
TOUCH_TOL = 0.004  # m; AABB gap that still counts as contact
MAX_TRIS = 60_000
AXIS = {"x": 0, "y": 1, "z": 2}
# Our frame is Z-up; glTF is Y-up. x stays, z becomes y, y becomes -z.
Z_UP_TO_GLTF = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]], dtype=float)


@dataclass
class Instance:
    id: str
    mesh: trimesh.Trimesh
    material: str

    @property
    def lo(self) -> np.ndarray:
        return self.mesh.bounds[0]

    @property
    def hi(self) -> np.ndarray:
        return self.mesh.bounds[1]


def _shape(p: Part, size: np.ndarray) -> trimesh.Trimesh:
    if p.shape == "box":
        return trimesh.creation.box(extents=size)
    if p.shape == "cylinder":
        r = min(size[0], size[1]) / 2
        return trimesh.creation.cylinder(radius=r, height=size[2], sections=24)
    # rounded_box: hull of eight corner spheres, which is exactly a rounded box
    r = p.radius
    inner = size / 2 - r
    ball = trimesh.creation.icosphere(subdivisions=2, radius=r)
    corners = [ball.vertices + np.array(s) * inner for s in itertools.product((-1, 1), repeat=3)]
    return trimesh.convex.convex_hull(np.vstack(corners))


def _uv(mesh: trimesh.Trimesh, p: Part, prog: Program) -> trimesh.Trimesh:
    """Unmerge so each face owns its vertices, then box-project in part-local metres."""
    mat = prog.materials.get(p.material)
    fin = library().get(mat.finish) if mat and mat.finish else None
    mesh.unmerge_vertices()
    normals = mesh.face_normals[np.repeat(np.arange(len(mesh.faces)), 3)]
    verts = mesh.vertices[mesh.faces.reshape(-1)]
    uv = np.zeros((len(mesh.vertices), 2))
    uv[mesh.faces.reshape(-1)] = box_uv(verts, normals, fin.tile_m if fin else 1.0,
                                        AXIS[p.grain] if p.grain else None)
    mesh.visual = TextureVisuals(uv=uv)
    return mesh


def _box(bounds: dict[str, tuple[np.ndarray, np.ndarray]], ref: str, piece: np.ndarray):
    if ref in ("piece", "floor"):
        return np.array([-piece[0] / 2, -piece[1] / 2, 0.0]), np.array([piece[0] / 2, piece[1] / 2, piece[2]])
    return bounds[ref]


def _rotation(deg, centre) -> np.ndarray:
    m = np.eye(4)
    for axis, a in zip(np.eye(3), deg):
        if a:
            m = trimesh.transformations.rotation_matrix(np.radians(a), axis, centre) @ m
    return m


def build(prog: Program) -> list[Instance]:
    piece = np.array(prog.size)
    bounds: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    out: list[Instance] = []
    for p in prog.parts:
        size = np.array(p.size, dtype=float)
        ref = _box(bounds, p.attach.to if p.attach else p.between.top, piece)
        if p.attach:
            lo, hi = ref
            target = lo + np.array(p.attach.at) * (hi - lo)
            centre = target - (np.array(p.attach.self_) - 0.5) * size + np.array(p.attach.offset)
        else:
            b = p.between
            blo, bhi = _box(bounds, b.bottom, piece)
            z0 = 0.0 if b.bottom == "floor" else bhi[2]
            tlo, thi = _box(bounds, b.top, piece)
            z1 = tlo[2]
            if z1 <= z0:
                raise ValueError(f"{p.id}: top of {b.bottom} is not below the bottom of {b.top}")
            size[2] = z1 - z0
            xy = tlo[:2] + np.array(b.at) * (thi[:2] - tlo[:2])
            centre = np.array([xy[0], xy[1], (z0 + z1) / 2])
        mesh = _shape(p, size)
        mesh = _uv(mesh, p, prog)
        mesh.apply_translation(centre)
        mesh.apply_transform(_rotation(p.rotate, centre))
        bounds[p.id] = (mesh.bounds[0].copy(), mesh.bounds[1].copy())

        copies = [(p.id, mesh)]
        if p.repeat:
            step = np.zeros(3)
            step[AXIS[p.repeat.axis]] = p.repeat.step
            copies += [(f"{p.id}@r{i}", mesh.copy().apply_translation(step * i)) for i in range(1, p.repeat.count)]
        for axis in p.mirror:
            k = AXIS[axis]
            flip = np.eye(4)
            flip[k, k] = -1
            flip[k, 3] = ref[0][k] + ref[1][k]  # reflect through the reference box centre
            copies += [(f"{cid}@m{axis}", m.copy().apply_transform(flip)) for cid, m in copies]
        out += [Instance(cid, m, p.material) for cid, m in copies]
    return out


def _touch(a: Instance, b: Instance) -> bool:
    return bool(np.all(a.lo <= b.hi + TOUCH_TOL) and np.all(b.lo <= a.hi + TOUCH_TOL))


def _gap(a: Instance, b: Instance) -> float:
    d = np.maximum(0, np.maximum(a.lo - b.hi, b.lo - a.hi))
    return float(np.linalg.norm(d))


def check(prog: Program, parts: list[Instance]) -> tuple[list[dict], dict]:
    faults: list[dict] = []
    lo = np.min([p.lo for p in parts], axis=0)
    hi = np.max([p.hi for p in parts], axis=0)
    got, want = hi - lo, np.array(prog.size)
    for i, name in enumerate("wdh"):
        if abs(got[i] - want[i]) > max(0.02, 0.03 * want[i]):
            faults.append({"check": "size", "axis": name, "want_m": round(want[i], 3), "got_m": round(got[i], 3)})
    if abs(lo[2]) > FLOOR_TOL:
        faults.append({"check": "floor", "detail": f"lowest point at z={lo[2]:.3f} m, want 0"})

    grounded = {i for i, p in enumerate(parts) if p.lo[2] <= FLOOR_TOL}
    seen, todo = set(grounded), list(grounded)
    while todo:
        i = todo.pop()
        for j, q in enumerate(parts):
            if j not in seen and _touch(parts[i], q):
                seen.add(j)
                todo.append(j)
    loose = [i for i in range(len(parts)) if i not in seen]
    if not grounded:
        faults.append({"check": "support", "detail": "no part touches the floor"})
    elif loose:
        for group in _groups(parts, loose):
            ids = [parts[i].id for i in group]
            gap = min(_gap(parts[i], parts[j]) for i in group for j in seen)
            centre = np.mean([(parts[i].lo + parts[i].hi) / 2 for i in group], axis=0)
            faults.append({"check": "support", "loose": ids, "centre_m": [round(c, 3) for c in centre],
                           "gap_to_supported_m": round(gap, 3)})

    tris = sum(len(p.mesh.faces) for p in parts)
    if tris > MAX_TRIS:
        faults.append({"check": "triangles", "got": tris, "max": MAX_TRIS})
    summary = {"parts": len(parts), "triangles": tris, "size_m": [round(g, 3) for g in got]}
    return faults, summary


def _groups(parts: list[Instance], idx: list[int]) -> list[list[int]]:
    left, groups = set(idx), []
    while left:
        stack = [left.pop()]
        group = []
        while stack:
            i = stack.pop()
            group.append(i)
            near = [j for j in left if _touch(parts[i], parts[j])]
            left -= set(near)
            stack += near
        groups.append(sorted(group))
    return groups


def export(prog: Program, parts: list[Instance], path: Path) -> None:
    scene = trimesh.Scene()
    mats = {"default": Material()} | prog.materials
    for p in parts:
        m = mats[p.material]
        mesh = p.mesh.copy().apply_transform(Z_UP_TO_GLTF)
        mesh.visual = TextureVisuals(uv=p.mesh.visual.uv, material=pbr(m.finish, m.color, m.kind, m.roughness))
        mesh.metadata["extras"] = {"finish": m.finish, "tint": m.color}
        scene.add_geometry(mesh, node_name=p.id, geom_name=p.id)
    path.write_bytes(scene.export(file_type="glb"))


def compile_file(program: Path, workdir: Path) -> list[dict]:
    workdir.mkdir(parents=True, exist_ok=True)
    try:
        prog = Program.model_validate_json(program.read_text())
        parts = build(prog)
    except (ValidationError, ValueError) as e:
        return [{"check": "program", "detail": str(e)}]
    faults, summary = check(prog, parts)
    export(prog, parts, workdir / "piece.glb")
    (workdir / "report.json").write_text(json.dumps(summary | {"faults": len(faults)}, indent=1))
    return faults


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("usage: partc <program.json> <workdir>")
    workdir = Path(sys.argv[2])
    faults = compile_file(Path(sys.argv[1]), workdir)
    if faults:
        (workdir / "faults.json").write_text(json.dumps(faults, indent=1))
        print(json.dumps(faults, indent=1))
        sys.exit(1)
    (workdir / "faults.json").unlink(missing_ok=True)


if __name__ == "__main__":
    main()
