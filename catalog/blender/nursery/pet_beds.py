"""Pet beds: plush boucle donut, woven rattan basket with cushion, mid-century raised wooden frame with
cushion, wool-felt cave. Small and medium of each. Entry side (low rim / opening) faces the front (-Y).

blender -b --factory-startup --python pet_beds.py -- [slug ...]
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402
from common import kit  # noqa: E402

import bmesh  # noqa: E402

FRONT = -math.pi / 2  # angle of -Y


def cyl_uv(obj, tile):
    """Cylindrical UVs in metres around Z (weave runs round the basket, no cube-projection seams)."""
    me = obj.data
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        us = []
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            r = math.hypot(co.x, co.y)
            th = math.atan2(co.y, co.x)
            us.append([th, r, co.z])
        ths = [u[0] for u in us]
        if max(ths) - min(ths) > math.pi:  # face straddles the seam
            for u in us:
                if u[0] < 0:
                    u[0] += 2 * math.pi
        for li, (th, r, z) in zip(poly.loop_indices, us):
            uv[li].uv = (th * 0.3 / tile, (z + (0.3 - r) * 0.5) / tile)


def front_dip(obj, depth, sigma, z0, z1):
    """Lower the rim toward the front (-Y) for an easy step-in; floor below z0 untouched."""
    for v in obj.data.vertices:
        th = math.atan2(v.co.y, v.co.x)
        d = math.atan2(math.sin(th - FRONT), math.cos(th - FRONT))
        w = min(1.0, max(0.0, (v.co.z - z0) / (z1 - z0)))
        v.co.z -= depth * math.exp(-d * d / (2 * sigma * sigma)) * w


# ---------- donut ----------
def donut(R, H, spec, tint):
    bx, bz = R * 0.23, H / 2
    hc = H * 0.34
    prof = [(0.0, 0.0), (R - bx, 0.0)]
    cx, cz = R - bx, bz
    for i in range(0, 25):
        a = -math.pi / 2 + (1.5 * math.pi) * i / 24
        prof.append((cx + bx * math.cos(a), cz + bz * math.sin(a)))
    x_in = R - 2 * bx
    for i in range(1, 7):  # soft fillet down into the centre cushion
        t = i / 6
        prof.append((x_in - 0.035 * math.sin(t * math.pi / 2), bz - (bz - hc) * (1 - math.cos(t * math.pi / 2))))
    for i in range(1, 7):
        t = i / 6
        r = (x_in - 0.035) * (1 - t)
        prof.append((r, hc + 0.012 * math.sin(t * math.pi / 2)))
    lump = lambda th, z: 1 + 0.012 * math.sin(7 * th + 0.6) * min(1, z / H * 2) + 0.006 * math.sin(13 * th)
    obj = C.revolve(prof, (0, 0, 0), spec, tint, steps=72, rmod=lump, cap_top=False, cap_bottom=False, name="donut")
    return obj


# ---------- rattan basket ----------
def rattan_basket(W, D, H, cushion_tint):
    R = W / 2 - 0.018  # flare + rim bring the outside back to W
    k = (D / 2 - 0.018) / R
    wall = 0.014
    prof = [(0.0, 0.0), (R - 0.05, 0.0), (R - 0.02, 0.006), (R - 0.004, 0.03)]
    for i in range(1, 9):  # slight flare
        t = i / 8
        prof.append((R - 0.004 + 0.02 * t ** 1.3, 0.03 + (H - 0.045) * t))
    rim = 0.016
    top_r, top_z = prof[-1]
    for i in range(1, 9):  # rolled rim
        a = math.pi * i / 8
        prof.append((top_r - rim + rim * math.cos(a), top_z + rim * 0.9 * math.sin(a)))
    ir, iz = prof[-1]
    prof += [(ir - 0.002, iz - 0.02), (R - wall - 0.004, 0.045), (R - wall - 0.03, wall + 0.004), (0.0, wall + 0.004)]
    obj = C.revolve(prof, (0, 0, 0), "rattan", "#c7a273", steps=64, rmod=lambda th, z: (1.0, k),
                    cap_top=False, cap_bottom=False, name="basket", finish=False)
    front_dip(obj, H * 0.42, 0.55, 0.06, H)
    kit.finish(obj, "rattan", "#c7a273", smooth=True)
    cyl_uv(obj, 0.4 / 2.6)
    # plump round cushion inside, with a gusset edge
    cr = R - wall - 0.012
    ch = min(0.10, H * 0.45)
    cprof = [(0.0, 0.0), (cr - 0.03, 0.0)]
    for i in range(1, 11):
        a = -math.pi / 2 + math.pi * i / 10
        cprof.append((cr - 0.03 + 0.03 * math.cos(a), ch / 2 + ch / 2 * math.sin(a)))
    for i in range(1, 7):
        t = i / 6
        cprof.append(((cr - 0.03) * (1 - t), ch + 0.018 * math.sin(t * math.pi / 2)))
    C.revolve(cprof, (0, 0, wall + 0.004), "wool-felt", cushion_tint, steps=48, rmod=lambda th, z: (1.0, k),
              cap_top=False, cap_bottom=False, name="cushion")


# ---------- MCM raised frame ----------
def mcm_frame(W, D, spec, tint, cushion):
    leg_h = 0.11
    t = 0.022
    side_h, front_h = 0.15, 0.075
    z0 = leg_h
    # back
    C.hbox((W, t, side_h), (0, D / 2 - t / 2, z0), spec, tint, bevel=0.005)
    # sides: tall at the back, sweeping down to the front
    for sx in (-1, 1):
        pts = [(-D / 2, z0), (D / 2 - t + 0.0005, z0), (D / 2 - t + 0.0005, z0 + side_h)]
        for i in range(1, 13):
            a = i / 12
            yy = (D / 2 - t) - (D - t) * a
            zz = z0 + front_h + (side_h - front_h) * (0.5 + 0.5 * math.cos(math.pi * min(1, a * 1.25)))
            pts.append((yy, zz))
        C.extrude_yz(pts, t, sx * (W / 2 - t / 2), spec, tint, bevel=0.005)
    # front board (low)
    C.hbox((W - 2 * t + 0.001, t, front_h), (0, -D / 2 + t / 2, z0), spec, tint, bevel=0.005)
    # base board
    C.hbox((W - 2 * t + 0.001, D - 2 * t + 0.001, 0.016), (0, 0, z0), spec, tint, bevel=0.002)
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.taper_leg(leg_h + 0.003, 0.016, 0.01, (sx * (W / 2 - 0.05), sy * (D / 2 - 0.05), leg_h + 0.003),
                          spec, tint, splay_deg=8, toward=(0, 0))
    spec_c, tint_c = cushion
    iw, idp = W - 2 * t - 0.008, D - 2 * t - 0.008
    C.rounded_block((iw, idp, 0.085), (0, 0, z0 + 0.016), spec_c, tint_c, radius=0.035, puff=0.28, n_mid=8,
                    name="cushion")


# ---------- felt cave ----------
def felt_cave(R, H, spec, tint, cushion):
    steps, rings = 112, 40
    prof = []
    for i in range(rings + 1):
        phi = (math.pi / 2) * i / rings
        r = R * math.cos(phi) ** 0.85
        z = 0.012 + (H - 0.012) * math.sin(phi)
        prof.append((r, z))
    prof.insert(0, (R * 0.955, 0.0))
    # profile lookup for placing the opening edge on the surface
    def r_at(z):
        for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
            if z0 <= z <= z1:
                return r0 + (r1 - r0) * (z - z0) / max(z1 - z0, 1e-9)
        return prof[-1][0]

    bm = bmesh.new()
    grid = []
    for r, z in prof:
        grid.append([bm.verts.new((r * math.cos(2 * math.pi * s / steps), r * math.sin(2 * math.pi * s / steps), z))
                     for s in range(steps)])
    for a, b in zip(grid, grid[1:]):
        for s in range(steps):
            bm.faces.new((a[s], a[(s + 1) % steps], b[(s + 1) % steps], b[s]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    # opening: ellipse in (angle, height) around the front
    tw, zc, zh = 0.6, H * 0.42, H * 0.33
    zc_lo = 0.035

    def ell(v):
        th = math.atan2(v.co.y, v.co.x)
        d = math.atan2(math.sin(th - FRONT), math.cos(th - FRONT))
        return d, v.co.z

    kill = []
    for f in bm.faces:
        c = f.calc_center_median()
        th = math.atan2(c.y, c.x)
        d = math.atan2(math.sin(th - FRONT), math.cos(th - FRONT))
        dz = (c.z - zc) / zh if c.z >= zc else (c.z - zc) / (zc - zc_lo + 1e-3)
        if (d / tw) ** 2 + dz ** 2 < 1:
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    for v in bm.verts:  # snap the stepped edge onto the ellipse -> clean arch-shaped opening
        if v.is_boundary and v.co.z > 0.001:
            d, z = ell(v)
            sz = zh if z >= zc else (zc - zc_lo + 1e-3)
            ex, ez = d / tw, (z - zc) / sz
            n = math.hypot(ex, ez) or 1
            d2, z2 = FRONT + tw * ex / n, zc + sz * ez / n
            z2 = max(z2, 0.0)
            r = r_at(z2)
            v.co.x, v.co.y, v.co.z = r * math.cos(d2), r * math.sin(d2), z2
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = C._obj(bm, "cave")
    sol = obj.modifiers.new("felt", "SOLIDIFY")
    sol.thickness = 0.012
    sol.offset = -1
    bev = obj.modifiers.new("edge", "BEVEL")
    bev.width, bev.segments, bev.limit_method = 0.004, 2, "ANGLE"
    kit.finish(obj, spec, tint, smooth=True)
    # cushion inside
    cr = R - 0.03
    cprof = [(0.0, 0.0), (cr - 0.025, 0.0)]
    for i in range(1, 9):
        a = -math.pi / 2 + math.pi * i / 8
        cprof.append((cr - 0.025 + 0.025 * math.cos(a), 0.025 + 0.025 * math.sin(a)))
    for i in range(1, 6):
        t = i / 5
        cprof.append(((cr - 0.025) * (1 - t), 0.05 + 0.01 * math.sin(t * math.pi / 2)))
    C.revolve(cprof, (0, 0, 0.0), cushion[0], cushion[1], steps=48, cap_top=False, cap_bottom=False, name="cushion")


VARIANTS = [
    dict(slug="boucle-donut-pet-bed-small", fam="donut", size=(0.50, 0.17), fabric=("boucle", "#efe6d8"),
         name="Round boucle donut pet bed, small 50 cm", colors=["white", "beige"], materials=["boucle"],
         price=19000, style="modern", tags=["pet bed", "dog bed", "cat bed", "donut", "boucle", "round", "small"]),
    dict(slug="boucle-donut-pet-bed-medium", fam="donut", size=(0.70, 0.21), fabric=("boucle", "#d9c7ae"),
         name="Round boucle donut pet bed, medium 70 cm", colors=["beige"], materials=["boucle"],
         price=27000, style="modern", tags=["pet bed", "dog bed", "donut", "boucle", "round", "medium"]),
    dict(slug="rattan-basket-pet-bed-small", fam="basket", size=(0.56, 0.44, 0.22), cushion="#e9e2d4",
         name="Woven rattan basket pet bed with cushion, small 56x43", colors=["beige", "white"],
         materials=["rattan", "cotton cushion"], price=34000, style="boho",
         tags=["pet bed", "cat bed", "basket", "rattan", "woven", "small"]),
    dict(slug="rattan-basket-pet-bed-medium", fam="basket", size=(0.76, 0.60, 0.27), cushion="#d8cbb6",
         name="Woven rattan basket pet bed with cushion, medium 76x59", colors=["beige", "brown"],
         materials=["rattan", "cotton cushion"], price=46000, style="boho",
         tags=["pet bed", "dog bed", "basket", "rattan", "woven", "medium"]),
    dict(slug="mcm-raised-pet-bed-small", fam="mcm", size=(0.60, 0.46), wood=("walnut", "#8a5d3e"),
         cushion=("wool-felt", "#b9b4ac"), name="Mid-century raised walnut pet bed with cushion, small 60x46",
         colors=["brown", "grey"], materials=["walnut", "wool blend cushion"], price=49000, style="mid-century",
         tags=["pet bed", "cat bed", "raised", "walnut", "tapered legs", "small"]),
    dict(slug="mcm-raised-pet-bed-medium", fam="mcm", size=(0.82, 0.60), wood=("oak-rift", "#c9a57a"),
         cushion=("wool-felt", "#e3dccf"), name="Mid-century raised oak pet bed with cushion, medium 82x60",
         colors=["beige", "white"], materials=["oak", "wool blend cushion"], price=66000, style="mid-century",
         tags=["pet bed", "dog bed", "raised", "oak", "tapered legs", "medium"]),
    dict(slug="felt-cave-pet-bed-small", fam="cave", size=(0.42, 0.30), felt=("wool-felt", "#8e8c89"),
         cushion=("boucle", "#ede4d6"), name="Wool felt cat cave bed with cushion, small 42 cm",
         colors=["grey", "white"], materials=["wool felt", "boucle cushion"], price=24000, style="scandinavian",
         tags=["pet bed", "cat cave", "cat bed", "felt", "hooded", "small"]),
    dict(slug="felt-cave-pet-bed-medium", fam="cave", size=(0.56, 0.38), felt=("wool-felt", "#c8b8a0"),
         cushion=("boucle", "#f0e8dc"), name="Wool felt cave pet bed with cushion, medium 56 cm",
         colors=["beige", "white"], materials=["wool felt", "boucle cushion"], price=33000, style="scandinavian",
         tags=["pet bed", "cave", "dog bed", "cat bed", "felt", "hooded", "medium"]),
]


def build(v):
    kit.reset()
    if v["fam"] == "donut":
        d, h = v["size"]
        donut(d / 2, h, *v["fabric"])
    elif v["fam"] == "basket":
        rattan_basket(*v["size"], v["cushion"])
    elif v["fam"] == "mcm":
        mcm_frame(*v["size"], *v["wood"], v["cushion"])
    else:
        d, h = v["size"]
        felt_cave(d / 2, h, *v["felt"], v["cushion"])
    return C.export(v["slug"])


def main():
    want = set(C.args())
    parts_file = C.PARTS / "pet_beds.json"
    old = {e["slug"]: e for e in json.loads(parts_file.read_text())} if parts_file.exists() else {}
    for v in VARIANTS:
        if want and v["slug"] not in want:
            continue
        info = build(v)
        old[v["slug"]] = C.entry(v["slug"], info, name=v["name"], kind="pet_bed", colors=v["colors"], price=v["price"],
                                 materials=v["materials"], style=v["style"], tags=v["tags"])
    C.write_part("pet_beds", [old[v["slug"]] for v in VARIANTS if v["slug"] in old])


main()
