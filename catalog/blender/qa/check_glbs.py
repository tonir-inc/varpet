"""Geometry contract check over every bpy-* catalog GLB.

Run: compiler/.venv/bin/python catalog/blender/qa/check_glbs.py  (needs trimesh)
Writes catalog/data/qa/checks.json. Contract: glTF Y-up, metres, front +Z,
centred x/z, base at y=0, bbox == size_m [w, d, h] (x=w, z=d, y=h).
"""
import glob
import json
import os
import sys

import numpy as np
import trimesh

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
EXTRA = os.path.join(ROOT, "catalog", "data", "extra")
OUT = os.path.join(ROOT, "catalog", "data", "qa", "checks.json")
TOL = 0.01

# kinds whose tall part (backrest, headboard, cistern, leaning top) should be at -Z
TALL_BACK = {"sofa", "chair", "bed", "toilet", "towel_rack", "kitchen_counter", "sink", "crib"}
# kinds that normally have a closed back panel and an open or door front
BOXY = {"cabinet", "wardrobe", "shelf", "dresser", "nightstand", "kitchen_cabinet", "shoe_rack"}


def plane_area(mesh, axis_val, sign, band=0.005):
    """Area of faces whose normal points along sign*Z and whose centroid lies within band of axis_val."""
    n = mesh.face_normals[:, 2] * sign
    c = mesh.triangles_center[:, 2]
    m = (n > 0.9) & (np.abs(c - axis_val) < band)
    return float(mesh.area_faces[m].sum())


def check(group, e):
    path = os.path.join(EXTRA, group, e["glb"])
    r = {"group": group, "slug": e["slug"], "kind": e.get("kind"), "placement": e.get("placement"),
         "size_m": e["size_m"], "issues": [], "info": {}}
    if not os.path.exists(path):
        r["issues"].append(("missing_glb", path))
        return r
    mesh = trimesh.load(path, force="mesh")
    lo, hi = mesh.bounds
    ext = hi - lo
    w, d, h = e["size_m"]
    r["info"].update(bounds_min=[round(v, 4) for v in lo], bounds_max=[round(v, 4) for v in hi],
                     faces=int(len(mesh.faces)))
    got = {"w(x)": ext[0], "d(z)": ext[2], "h(y)": ext[1]}
    want = {"w(x)": w, "d(z)": d, "h(y)": h}
    bad = {k: (round(float(got[k]), 4), want[k]) for k in got if abs(got[k] - want[k]) > TOL}
    if bad:
        r["issues"].append(("bbox_mismatch", bad))
    if abs(lo[1]) > TOL:
        r["issues"].append(("base_not_at_y0", round(float(lo[1]), 4)))
    cx, cz = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
    if abs(cx) > TOL or abs(cz) > TOL:
        r["issues"].append(("not_centred_xz", {"cx": round(float(cx), 4), "cz": round(float(cz), 4)}))
    me = e.get("mesh_extents_m")
    if me and any(abs(a - b) > TOL for a, b in zip(me, e["size_m"])):
        r["issues"].append(("mesh_extents_ne_size", {"mesh_extents_m": me}))

    back = plane_area(mesh, lo[2], -1)
    front = plane_area(mesh, hi[2], +1)
    r["info"].update(back_plane_m2=round(back, 4), front_plane_m2=round(front, 4),
                     wh_m2=round(w * h, 4))

    if e.get("placement") == "wall":
        if abs(lo[2] + d / 2) > TOL:
            r["issues"].append(("wall_back_not_at_-d/2", round(float(lo[2]), 4)))
        cover = back / max(w * h, 1e-6)
        r["info"]["back_cover"] = round(cover, 3)
        if front > 1.5 * back and front > 0.15 * w * h:
            r["issues"].append(("wall_flat_side_at_+Z", {"back_plane_m2": round(back, 4),
                                                          "front_plane_m2": round(front, 4)}))
        elif cover < 0.05:
            r["issues"].append(("wall_back_barely_touches", {"back_cover": round(cover, 3)}))

    if e.get("placement") == "floor" and len(mesh.faces):
        pts, _ = trimesh.sample.sample_surface(mesh, 30000, seed=1)
        top = pts[pts[:, 1] > lo[1] + 0.75 * ext[1]]
        if len(top):
            zc = float(top[:, 2].mean())
            r["info"]["top_band_mean_z"] = round(zc, 4)
            r["info"]["top_band_rel"] = round(zc / max(d, 1e-6), 3)
            if e.get("kind") in TALL_BACK and zc > 0.08 * d:
                r["issues"].append(("tall_part_at_+Z", {"top_band_mean_z": round(zc, 4), "d": d}))
        if e.get("kind") in BOXY and front > 1.5 * back and front > 0.2 * w * h:
            r["issues"].append(("closed_side_at_+Z", {"back_plane_m2": round(back, 4),
                                                       "front_plane_m2": round(front, 4)}))
    return r


def main():
    groups = sys.argv[1:] or sorted(os.path.basename(p) for p in glob.glob(os.path.join(EXTRA, "bpy-*")))
    res = []
    for g in groups:
        f = os.path.join(EXTRA, g, "entries.json")
        if not os.path.exists(f):
            continue
        for e in json.load(open(f)):
            try:
                res.append(check(g, e))
            except Exception as ex:  # noqa: BLE001
                res.append({"group": g, "slug": e.get("slug"), "issues": [("load_error", repr(ex))], "info": {}})
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(res, open(OUT, "w"), indent=1, default=str)
    n_bad = sum(1 for r in res if r["issues"])
    print(f"checked {len(res)} entries, {n_bad} with issues")
    for r in res:
        for t, v in r["issues"]:
            print(r["group"], r["slug"], r.get("kind"), t, v)


if __name__ == "__main__":
    main()
