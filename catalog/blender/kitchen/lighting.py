"""Kitchen lights: under-cabinet LED bars (wall, kit.py) and pendants over a counter or island (ceiling, the lights
lane's node contract through vendor/lkit.py).

Pendants follow catalog/blender/lights exactly: glTF Y up, origin = ceiling attachment point, root extras
`varpet_hang` + `placement`, nodes canopy / cord / body; to hang the shade bottom at drop D:
c = clamp(D - canopy_m - body_m, cord_min_m, cord_max_m); cord.scale.y = c / cord_m; body.position.y = -(canopy_m + c).
`pendant`, `canopy`, `cords`, `socket`, `bulb` and `build_hung` (lights/build.py main + hang_meta) are copied from
catalog/blender/lights/build.py.
"""
import json
import math

import kit
import lkit as K
from common import MODELS, piece, record
from lkit import node

# ---------------------------------------------------------------- under-cabinet LED bars (kit, joined)
ALU = "metal:#c4c6c8"


def led_bar(L):
    """Aluminium profile 22 x 11 mm with an opal diffuser underneath and end caps; top = the cabinet underside."""
    kit.box((L, 0.022, 0.011), (0, -0.011, 0.0015), ALU, bevel=0.0015, roughness=0.35, name="profile")
    kit.box((L - 0.012, 0.016, 0.0015), (0, -0.011, 0.0), "glow:#fff1da@2.5", bevel=0, name="diffuser")
    for sx in (-1, 1):
        kit.box((0.006, 0.023, 0.0125), (sx * (L / 2 + 0.002), -0.0115, 0.0005), "paint:#d9d9d9", bevel=0.001,
                name="cap")


for L, cm, price in ((0.56, 60, 14000), (0.86, 90, 18500)):
    piece(f"led-bar-under-cabinet-{cm}", f"Under-cabinet LED light bar, aluminium with opal diffuser, {round(L * 100)} cm "
          f"for a {cm} cm wall unit, 3000 K", "light", "wall", ["grey", "white"], price, ["aluminium", "opal acrylic"],
          "modern", "light", ["under cabinet light", "LED strip", "task light", "worktop lighting"],
          f"Fix it under a wall unit, against the wall; its top meets the unit's underside (1.44 m for this lane's "
          f"72 cm uppers).", mount_bottom=1.427)(lambda L=L: led_bar(L))


# ---------------------------------------------------------------- pendants (lkit, node contract)
BRASS = "metal:#b8955e"
BLACK = "paint:#1d1d1f"
CORD_BLACK = "paint:#161616"
INNER = "glow:#ffc98f@1.6"
BULB = "glow:#ffe2b4@4"
DEFAULT_DROP = 1.0


def canopy(spec, r=0.06, h=0.025, roughness=None):
    with node("canopy"):
        K.disc(r, h, (0, 0, -h), spec, roughness=roughness, bevel=0.006, name="canopy")
    return h


def cords(top, length, spec=CORD_BLACK, r=0.0028):
    with node("cord"):
        K.rod((0, 0, top - length), (0, 0, top), r, r, spec, verts=8, name="cord")


def socket(z, spec, roughness=None, r=0.02, h=0.06):
    K.revolve([(0.0, 0.0), (r, 0.0), (r, h - 0.008), (r * 0.6, h), (0.0, h)], spec, steps=24, at=(0, 0, z - h),
              roughness=roughness, name="socket")
    return h


def bulb(z, r=0.03):
    K.sphere(r, (0, 0, z), BULB, steps=20, name="bulb")


def pendant(canopy_spec, cord_spec, cord_m, body, body_h, canopy_rough=None):
    ch = canopy(canopy_spec, roughness=canopy_rough)
    cords(-ch, cord_m, cord_spec)
    z0 = -(ch + cord_m)
    with node("body"):
        body(z0)
    return ({"canopy": (0, 0, 0), "cord": (0, 0, -ch), "body": (0, 0, z0)},
            {"canopy_m": ch, "cord_m": cord_m, "body_m": body_h})


def enamel_dome(D, outer, rough):
    """Factory enamel shade: a shallow dome with a flared rim, white enamel inside, a brass socket collar."""
    R = D / 2
    H = round(0.5 * R, 3)

    def build(z0):
        sh = socket(z0, BRASS, 0.3, h=0.05)
        prof = [(R, 0.0), (R * 0.97, 0.03 * H), (R * 0.86, 0.18 * H), (R * 0.62, 0.48 * H), (R * 0.36, 0.78 * H),
                (R * 0.16, 0.96 * H), (0.03, H)]
        K.shade(prof, outer, INNER, roughness=rough, at=(0, 0, z0 - sh + 0.01 - H), steps=56, name="dome")
        K.ring(R - 0.002, z0 - sh + 0.01 - H, 0.0035, outer, roughness=rough, name="rim")
        bulb(z0 - sh - 0.15 * H, 0.03)
    return build, round(0.05 - 0.01 + H, 4)


def ribbed_glass(D, rough=0.28):
    """Ribbed (fluted) glass bell, lit, under a brass gallery."""
    R = D / 2
    H = round(1.1 * R, 3)
    cap = 0.04

    def build(z0):
        K.revolve([(0.0, 0.0), (0.03, 0.0), (0.034, 0.006), (0.034, cap - 0.004), (0.022, cap), (0.0, cap)], BRASS,
                  steps=32, at=(0, 0, z0 - cap), roughness=rough, name="gallery")
        prof = [(R, 0.0), (R * 0.98, 0.25 * H), (R * 0.88, 0.6 * H), (R * 0.66, 0.88 * H), (0.034, H)]
        K.revolve(prof, "glow:#f3eadb@0.45", steps=96, at=(0, 0, z0 - cap - H + 0.004), caps=False,
                  warp=lambda a, z: 0.03 * abs(math.sin(14 * a)), name="ribbed")
        K.ring(R * 1.0, z0 - cap - H + 0.004, 0.003, BRASS, roughness=rough, name="rim")
    return build, round(cap + H - 0.004, 4)


def hung(slug, title, price, colors, mats, style, tags, shade, cord_spec, canopy_spec, canopy_rough=None, cord_max=2.0):
    build, body_h = shade
    cord_m = round(DEFAULT_DROP - 0.025 - body_h, 3)
    hang = {"cord_min_m": 0.1, "cord_max_m": cord_max}
    piece(slug, title, "light", "ceiling", colors, price, mats, style, "light",
          ["pendant", "kitchen island", "over counter", "adjustable cord", *tags], hang=hang, tri_budget=8000)(
        lambda: pendant(canopy_spec, cord_spec, cord_m, build, body_h, canopy_rough=canopy_rough))


hung("pendant-enamel-dome-green-32", "Kitchen pendant, bottle-green enamel dome 32 cm, brass collar, cord adjustable to 2 m",
     26000, ["green", "white"], ["enamelled steel", "brass"], "industrial", ["enamel", "dome", "green"],
     enamel_dome(0.32, "paint:#2f4f3f", 0.22), CORD_BLACK, BLACK, 0.45)
hung("pendant-enamel-dome-cream-32", "Kitchen pendant, cream enamel dome 32 cm, brass collar, cord adjustable to 2 m",
     26000, ["white", "beige"], ["enamelled steel", "brass"], "farmhouse", ["enamel", "dome", "cream"],
     enamel_dome(0.32, "paint:#ece6d6", 0.22), CORD_BLACK, BLACK, 0.45)
hung("pendant-ribbed-glass-brass-20", "Kitchen pendant, ribbed glass bell 20 cm with brass gallery, cord adjustable to 2 m",
     31000, ["white", "yellow"], ["ribbed glass", "brass"], "classic", ["ribbed glass", "fluted", "brass"],
     ribbed_glass(0.20), CORD_BLACK, BRASS, 0.28)


def hang_meta(meta, built, res):
    origins, sizes = built
    c, L = sizes["canopy_m"], sizes["cord_m"]
    drop = round(-res["lo"][2], 4)
    hang = meta["hang"]
    return {"mount": "ceiling", "origin": "ceiling attachment point, hangs to -Y", "adjustable": True,
            "cord_node": "cord", "body_node": "body", "canopy_node": "canopy",
            "canopy_m": round(c, 4), "cord_m": round(L, 4), "body_m": round(drop - c - L, 4), "drop_m": drop,
            "cord_min_m": hang["cord_min_m"], "cord_max_m": hang["cord_max_m"],
            "drop_min_m": round(drop - L + hang["cord_min_m"], 3), "drop_max_m": round(drop - L + hang["cord_max_m"], 3)}


def build_hung(slug, fn, meta):
    """lights/build.py main(): a provisional export finds the bounds, the hang meta rides on the real one."""
    K.reset()
    built = fn()
    res = K.export(MODELS / f"{slug}.glb", slug, built[0], {})
    hang = hang_meta(meta, built, res)
    K.reset()
    fn()
    res = K.export(MODELS / f"{slug}.glb", slug, built[0], {"varpet_hang": json.dumps(hang), "placement": "ceiling"})
    lo, hi = res["lo"], res["hi"]
    info = {"size_m": res["size_m"], "tris": res["tris"], "bytes": res["bytes"],
            "lo": [round(lo[0], 4), round(lo[2], 4), round(-hi[1], 4)], "hi": [round(hi[0], 4), round(hi[2], 4), round(-lo[1], 4)]}
    meta = dict(meta, notes=(f"Ceiling piece, origin at the ceiling attachment point (hangs below it, Y up, metres). "
                             f"Nodes canopy/cord/body: cord {hang['cord_m']} m as built (supplied {hang['cord_max_m']} m); "
                             f"shade bottom {hang['drop_m']} m below the ceiling; set a drop by scaling `cord` in Y and "
                             f"moving `body` (see raw.hang). Over a worktop hang the shade bottom about 75 cm above it."))
    return record(slug, meta, info, {"hang": hang, "nodes": res["nodes"]})
