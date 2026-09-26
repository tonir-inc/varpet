"""Changing dressers / changing tables with a contoured padded changing mat and guard rails.

blender -b --factory-startup --python changing.py -- [slug ...]
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402
from common import kit  # noqa: E402

VARIANTS = [
    dict(slug="oak-changing-dresser", kind="dresser", W=0.92, D=0.52, Hc=0.86, wood=("oak-rift", "#d0b088"),
         plinth="recessed", cols=1, rows=3, pull="knob", mat=("wool-felt", "#ece7de"),
         name="Japandi oak changing dresser with 3 drawers and padded mat, 92x55", colors=["beige", "white"],
         materials=["solid oak", "oak veneer", "cotton pad"], price=198000, style="japandi",
         tags=["changing table", "dresser", "drawers", "oak", "baby", "nursery"]),
    dict(slug="white-changing-table-baskets", kind="open", W=0.82, D=0.52, Hc=0.90, wood=("paint:#e4e0d8", None),
         mat=("wool-felt", "#d9d0c2"),
         name="White open changing table with two shelves, rattan baskets and pad, 82x52",
         colors=["white", "beige"], materials=["painted beech", "rattan", "cotton pad"], price=112000,
         style="scandinavian", tags=["changing table", "open shelves", "baskets", "white", "baby", "nursery"]),
    dict(slug="mcm-walnut-changing-dresser", kind="dresser", W=1.02, D=0.50, Hc=0.80, wood=("walnut", "#8a5d3e"),
         plinth="legs", cols=2, rows=3, pull="bar", mat=("wool-felt", "#e8e2d6"),
         name="Mid-century walnut 6-drawer changing dresser on tapered legs with pad, 102x50",
         colors=["brown", "white"], materials=["walnut veneer", "solid walnut", "brass", "cotton pad"],
         price=248000, style="mid-century", tags=["changing table", "dresser", "walnut", "tapered legs", "baby", "nursery"]),
]


def changing_top(W, D, z, spec, tint, mat, rail_h=0.11, t=0.018, mat_w=None):
    """Guard rails on back and both sides (solid, rounded top edge) + contoured pad inside."""
    C.hbox((W, t, rail_h), (0, D / 2 - t / 2, z), spec, tint, bevel=0.006)
    for sx in (-1, 1):
        pts = [(-D / 2, z), (D / 2 - t, z), (D / 2 - t, z + rail_h)]
        # side rail slopes down toward the front: tall at the back, low at the front
        pts += [(D / 2 - t - 0.12, z + rail_h), (-D / 2 + 0.05, z + 0.045), (-D / 2, z + 0.045)]
        C.extrude_yz(pts, t, sx * (W / 2 - t / 2), spec, tint, bevel=0.005)
    iw, idp = W - 2 * t - 0.012, D - t - 0.03
    pw = mat_w or iw
    mspec, mtint = mat
    C.rounded_block((pw, idp, 0.05), (0, -D / 2 + 0.015 + idp / 2, z), mspec, mtint, radius=0.03, puff=0.08,
                    contour=0.05, n_mid=10, name="pad")


def dresser(v):
    W, D, Hc = v["W"], v["D"], v["Hc"]
    spec, tint = v["wood"]
    base = 0.17 if v["plinth"] == "legs" else 0.0
    top_t = 0.028
    body_h = Hc - base - top_t
    # carcass: sides, top, (recessed plinth or bottom rail), back; front face recessed 18 mm for reveals
    side_t = 0.022
    for sx in (-1, 1):
        C.vbox((side_t, D - 0.004, body_h), (sx * (W / 2 - side_t / 2), 0.002, base), spec, tint, bevel=0.003)
    C.hbox((W, D, top_t), (0, 0, Hc - top_t), spec, tint, bevel=0.005)
    plinth_h = 0.07 if v["plinth"] == "recessed" else 0.0
    if plinth_h:
        C.hbox((W - 2 * side_t - 0.001, D - 0.06, plinth_h), (0, 0.02, 0), spec, tint, bevel=0.002)
    C.hbox((W - 2 * side_t, 0.012, body_h), (0, D / 2 - 0.006, base), spec, tint, bevel=0.0)       # back
    C.hbox((W - 2 * side_t, D - 0.03, body_h - plinth_h - 0.002), (0, 0.012, base + plinth_h), "paint:#3a2e24", None, bevel=0.0)  # shadowed interior
    if v["plinth"] == "legs":
        C.hbox((W, D - 0.004, 0.022), (0, 0.002, base), spec, tint, bevel=0.003)  # bottom panel
        for sx in (-1, 1):
            for sy in (-1, 1):
                x, y = sx * (W / 2 - 0.06), sy * (D / 2 - 0.06)
                leg = kit.taper_leg(base + 0.004, 0.019, 0.012, (x, y, base + 0.004), spec, tint, splay_deg=7,
                                    toward=(0, 0))
                fer = kit.cylinder(0.0128, 0.03, (0, 0, 0), "metal:#b89560", radius_top=0.0137, verts=24, bevel=0.0)
                fer.location, fer.rotation_euler = leg.location.copy(), leg.rotation_euler.copy()
    # drawer fronts
    fz0 = base + (0.022 if v["plinth"] == "legs" else plinth_h) + 0.004
    fz1 = Hc - top_t - 0.004
    fx0, fx1 = -W / 2 + side_t + 0.003, W / 2 - side_t - 0.003
    gap = 0.004
    cols, rows = v["cols"], v["rows"]
    cw = (fx1 - fx0 - gap * (cols - 1)) / cols
    heights = [1.0] * rows if rows == 1 else [1.0 + 0.12 * (rows - 1 - r) for r in range(rows)]  # graduated
    tot = sum(heights)
    avail = fz1 - fz0 - gap * (rows - 1)
    y_front = -D / 2
    for c in range(cols):
        x = fx0 + cw / 2 + c * (cw + gap)
        z = fz0
        for r in range(rows):
            h = avail * heights[r] / tot
            C.hbox((cw, 0.02, h), (x, y_front + 0.01, z), spec, tint, bevel=0.003)
            if v["pull"] == "knob":
                kit.cylinder(0.019, 0.026, (x, y_front + 0.001, z + h / 2), spec, "#b08a5e", radius_top=0.015, verts=24,
                             bevel=0.003, rot=(90, 0, 0))
            else:  # slim brass bar pull
                kit.box((0.14, 0.012, 0.012), (x, y_front - 0.006 + 0.001, z + h - 0.035), "metal:#b89560", bevel=0.003)
            z += h + gap
    changing_top(W, D, Hc, spec, tint, v["mat"])


def open_table(v):
    W, D, Hc = v["W"], v["D"], v["Hc"]
    spec, tint = v["wood"]
    leg = 0.042
    for sx in (-1, 1):
        for sy in (-1, 1):
            C.vbox((leg, leg, Hc), (sx * (W / 2 - leg / 2), sy * (D / 2 - leg / 2), 0), spec, tint, bevel=0.006)
    iw, idp = W - 2 * leg, D - 2 * leg
    # top board between the legs + aprons
    C.hbox((W, D, 0.022), (0, 0, Hc - 0.022), spec, tint, bevel=0.004)
    for z in (0.10, 0.46):  # shelves on rails
        C.hbox((iw + 0.004, idp + 0.004, 0.018), (0, 0, z), spec, tint, bevel=0.003)
        for sy in (-1, 1):
            C.hbox((iw + 0.002, 0.02, 0.05), (0, sy * (D / 2 - 0.01 - 0.011), z - 0.05 + 0.018), spec, tint, bevel=0.003)
    for sy in (-1, 1):
        C.hbox((iw + 0.002, 0.02, 0.07), (0, sy * (D / 2 - 0.021), Hc - 0.022 - 0.07), spec, tint, bevel=0.003)
    for sx in (-1, 1):
        C.hbox((0.02, idp + 0.002, 0.07), (sx * (W / 2 - 0.021), 0, Hc - 0.022 - 0.07), spec, tint, bevel=0.003)
    # two rattan baskets on the lower shelf, one on the middle shelf
    bw = (iw - 0.05) / 2
    for i, x in enumerate((-bw / 2 - 0.012, bw / 2 + 0.012)):
        basket(bw, idp - 0.06, 0.2, (x, 0, 0.118))
    basket(iw * 0.5, idp - 0.08, 0.16, (-iw * 0.2, 0, 0.478))
    changing_top(W, D, Hc, spec, tint, v["mat"], rail_h=0.10, t=0.02)


def basket(w, d, h, at):
    """Woven rattan storage basket: open box with rounded corners and a thicker rim."""
    x, y, z = at
    r = 0.03
    outer = C.rounded_rect(w, d, r, n=4)
    inner = C.rounded_rect(w - 0.016, d - 0.016, r - 0.008, n=4)
    import bmesh
    import bpy
    bm = bmesh.new()
    ob = [bm.verts.new((px, py, 0)) for px, py in outer]
    ot = [bm.verts.new((px, py, h)) for px, py in outer]
    it = [bm.verts.new((px, py, h)) for px, py in inner]
    ib = [bm.verts.new((px, py, 0.012)) for px, py in inner]
    n = len(outer)
    bm.faces.new(list(reversed(ob)))
    bm.faces.new(ib)
    for a, b in ((ob, ot), (ot, it), (it, ib)):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = C._obj(bm, "basket")
    obj.location = (x, y, z)
    kit.finish(obj, "rattan", "#c9a576", bevel=0.003, segments=2, grain="y")
    C.uv_scale(obj, 1.6)


def main():
    want = set(C.args())
    parts_file = C.PARTS / "changing.json"
    old = {e["slug"]: e for e in json.loads(parts_file.read_text())} if parts_file.exists() else {}
    for v in VARIANTS:
        if want and v["slug"] not in want:
            continue
        kit.reset()
        (dresser if v["kind"] == "dresser" else open_table)(v)
        info = C.export(v["slug"])
        old[v["slug"]] = C.entry(v["slug"], info, name=v["name"], kind="changing_table", colors=v["colors"],
                                 price=v["price"], materials=v["materials"], style=v["style"], tags=v["tags"])
    C.write_part("changing", [old[v["slug"]] for v in VARIANTS if v["slug"] in old])


main()
