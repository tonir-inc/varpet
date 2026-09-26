"""Cots / cribs with mattress, one parametric frame: slats, spindles, cane or solid arched ends,
straight posts or mid-century tapered legs. Long side faces the front (-Y).

blender -b --factory-startup --python cribs.py -- [slug ...]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402
from common import kit  # noqa: E402
import kit_shapes as ks  # noqa: E402

MATTRESS = ("wool-felt", "#f8f6f1")

VARIANTS = [
    dict(slug="japandi-oak-cot", materials=["solid oak", "cotton mattress"], mattress=(1.20, 0.60), wood=("oak-rift", "#d0b088"), post=0.045, H=0.90,
         sides="slats", ends="arch", legs="posts", slat=(0.024, 0.036), pitch=0.078,
         name="Japandi oak cot with arched end panels and mattress, 60x120", colors=["beige", "white"],
         price=158000, style="japandi", tags=["cot", "crib", "oak", "slatted", "baby", "nursery"]),
    dict(slug="white-slatted-cot", materials=["painted beech", "cotton mattress"], mattress=(1.20, 0.60), wood=("paint:#e9e6df", None), post=0.05, H=0.92,
         sides="slats", ends="slats", legs="posts", slat=(0.022, 0.034), pitch=0.072, side_drop=0.05,
         name="White painted slatted cot with mattress, 60x120", colors=["white"],
         price=96000, style="scandinavian", tags=["cot", "crib", "white", "slatted", "baby", "nursery"]),
    dict(slug="beech-spindle-cot", materials=["solid beech", "cotton mattress"], mattress=(1.20, 0.60), wood=("ash-light", "#dcc29e"), post=0.048, H=0.90,
         sides="spindles", ends="spindles", legs="posts", slat=(0.024, 0.024), pitch=0.07, side_drop=0.04,
         name="Natural beech spindle cot with mattress, 60x120", colors=["beige", "white"],
         price=124000, style="scandinavian", tags=["cot", "crib", "spindle", "beech", "baby", "nursery"]),
    dict(slug="mcm-walnut-crib", materials=["walnut", "cotton mattress"], mattress=(1.20, 0.60), wood=("walnut", "#8a5d3e"), post=0.044, H=0.92,
         sides="slats", ends="panel", legs="taper", slat=(0.022, 0.034), pitch=0.075,
         name="Mid-century walnut crib on tapered legs with mattress, 60x120", colors=["brown", "white"],
         price=178000, style="mid-century", tags=["crib", "cot", "walnut", "tapered legs", "baby", "nursery"]),
    dict(slug="oak-cane-cot", materials=["solid oak", "rattan cane", "cotton mattress"], mattress=(1.20, 0.60), wood=("oak-rift", "#b98d5e"), post=0.045, H=0.90,
         sides="slats", ends="cane", legs="posts", slat=(0.024, 0.036), pitch=0.078, side_drop=0.04,
         name="Oak cot with rattan cane end panels and mattress, 60x120", colors=["beige", "brown"],
         price=168000, style="japandi", tags=["cot", "crib", "cane", "rattan", "oak", "baby", "nursery"]),
    dict(slug="mini-crib-white-birch", materials=["painted birch", "birch", "cotton mattress"], mattress=(0.90, 0.60), wood=("paint:#e9e6df", None),
         wood2=("ash-light", "#e0c9a6"), post=0.04, H=0.86, sides="spindles", ends="slats", legs="posts",
         slat=(0.022, 0.022), pitch=0.068, base_z=0.30,
         name="Mini crib, white with birch spindles and mattress, 60x90", colors=["white", "beige"],
         price=89000, style="scandinavian", tags=["mini crib", "cot", "compact", "baby", "nursery"]),
]


def infill_x(x0, x1, z0, z1, y, v, spec, tint):
    """Vertical slats / spindles between x0..x1, bottom z0, top z1, centred on y."""
    n = max(2, round((x1 - x0) / v["pitch"]))
    gap_w = (x1 - x0) / n
    for i in range(n - 1):
        x = x0 + gap_w * (i + 1)
        if v["_infill"] == "spindles":
            C.spindle(z1 - z0, v["slat"][0] / 2, (x, y, z0), spec, tint)
        else:
            C.vbox((v["slat"][0], v["slat"][1] * 0.62, z1 - z0), (x, y, z0), spec, tint, bevel=0.004)


def infill_y(y0, y1, z0, z1, x, v, spec, tint):
    n = max(2, round((y1 - y0) / v["pitch"]))
    step = (y1 - y0) / n
    for i in range(n - 1):
        y = y0 + step * (i + 1)
        if v["_infill"] == "spindles":
            C.spindle(z1 - z0, v["slat"][0] / 2, (x, y, z0), spec, tint)
        else:
            C.vbox((v["slat"][1] * 0.62, v["slat"][0], z1 - z0), (x, y, z0), spec, tint, bevel=0.004)


def build(v):
    kit.reset()
    mw, md = v["mattress"]
    wi, di = mw + 0.012, md + 0.012          # inside of the frame, 6 mm clearance around the mattress
    p, H = v["post"], v["H"]
    spec, tint = v["wood"]
    spec2, tint2 = v.get("wood2", v["wood"])
    base_z = v.get("base_z", 0.28)            # top of the slatted mattress base
    leg_h = 0.17 if v["legs"] == "taper" else 0.0
    rail_t = 0.034                            # rail thickness (across the cot side)
    px, py = wi / 2 + p / 2, di / 2 + p / 2   # post centres
    side_top = H - 0.012 - v.get("side_drop", 0.0)
    end_top = H - 0.012
    bot_z0 = max(leg_h + 0.02, base_z - 0.075)  # bottom rail underside
    bot_h = 0.06 if v["legs"] != "taper" else base_z - bot_z0 + 0.012

    # posts (square, softly rounded) ...
    post_z0 = leg_h
    for sx in (-1, 1):
        for sy in (-1, 1):
            C.vbox((p, p, H - post_z0), (sx * px, sy * py, post_z0), spec, tint, bevel=0.008)
            if v["legs"] == "taper":
                kit.taper_leg(leg_h + 0.001, p * 0.46, p * 0.28, (sx * px, sy * py, leg_h + 0.001), spec, tint)

    # long sides (front and back): top rail, bottom rail, infill
    top_h = 0.042
    for sy in (-1, 1):
        y = sy * py
        C.hbox((wi + 0.004, rail_t, top_h), (0, y, side_top - top_h), spec, tint, bevel=0.007)
        C.hbox((wi + 0.004, rail_t, bot_h), (0, y, bot_z0), spec, tint, bevel=0.005)
        v["_infill"] = v["sides"]
        infill_x(-wi / 2, wi / 2, bot_z0 + bot_h - 0.002, side_top - top_h + 0.002, y, v, spec2, tint2)

    # ends
    for sx in (-1, 1):
        x = sx * px
        if v["ends"] in ("slats", "spindles"):
            C.hbox((rail_t, di + 0.004, top_h), (x, 0, end_top - top_h), spec, tint, bevel=0.007)
            C.hbox((rail_t, di + 0.004, bot_h), (x, 0, bot_z0), spec, tint, bevel=0.005)
            v["_infill"] = v["ends"]
            infill_y(-di / 2, di / 2, bot_z0 + bot_h - 0.002, end_top - top_h + 0.002, x, v, spec2, tint2)
        elif v["ends"] == "arch":  # solid panel with a soft arch rising above the posts
            yo = di / 2 + 0.002
            zs = end_top - 0.02
            pts = [(-yo, bot_z0), (yo, bot_z0), (yo, zs)] + C.arc_top(yo, -yo, zs, H + 0.035, 20)[1:-1] + [(-yo, zs)]
            C.extrude_yz(pts, 0.022, x, spec, tint, bevel=0.006, segments=4)
        elif v["ends"] == "panel":  # MCM: solid panel between the posts, gentle upward sweep
            yo = di / 2 + 0.002
            z0 = bot_z0
            pts = [(-yo, z0), (yo, z0), (yo, end_top - 0.01)] + C.arc_top(yo, -yo, end_top - 0.01, H + 0.02, 20)[1:-1] + [(-yo, end_top - 0.01)]
            C.extrude_yz(pts, 0.024, x, spec, tint, bevel=0.006, segments=4)
        elif v["ends"] == "cane":  # oak frame with a woven cane panel
            C.hbox((rail_t, di + 0.004, top_h), (x, 0, end_top - top_h), spec, tint, bevel=0.007)
            C.hbox((rail_t, di + 0.004, bot_h), (x, 0, bot_z0), spec, tint, bevel=0.005)
            z0, z1 = bot_z0 + bot_h - 0.004, end_top - top_h + 0.004
            # real see-through cane webbing, framed by the rails above/below and the posts either side
            ks.cane_panel(di + 0.004, z1 - z0, (x, 0, z0), tint="#d2b184", rot=(0, 0, 90))
            for sy in (-1, 1):  # slim stiles hiding the webbing's cut edge against the posts
                C.vbox((rail_t * 0.7, 0.018, z1 - z0), (x, sy * (di / 2 - 0.009), z0), spec, tint, bevel=0.003)

    # slatted mattress base on ledgers
    led = 0.022
    for sy in (-1, 1):
        C.hbox((wi, led, led), (0, sy * (di / 2 - led / 2), base_z - 0.018 - led), spec2, tint2, bevel=0.002)
    n = int(wi / 0.1)
    for i in range(n):
        x = -wi / 2 + wi * (i + 0.5) / n
        C.hbox((0.07, di - 0.002, 0.018), (x, 0, base_z - 0.018), spec2, tint2, bevel=0.002)

    # mattress
    C.rounded_block((mw, md, 0.10), (0, 0, base_z), MATTRESS[0], MATTRESS[1], radius=0.028, puff=0.10,
                    name="mattress")
    return C.export(v["slug"])


def main():
    want = set(C.args())
    parts_file = C.PARTS / "cribs.json"
    import json
    old = {e["slug"]: e for e in json.loads(parts_file.read_text())} if parts_file.exists() else {}
    for v in VARIANTS:
        if want and v["slug"] not in want:
            continue
        info = build(v)
        old[v["slug"]] = C.entry(v["slug"], info, name=v["name"], kind="crib", colors=v["colors"], price=v["price"],
                                 materials=v["materials"], style=v["style"], tags=v["tags"])
    C.write_part("cribs", [old[v["slug"]] for v in VARIANTS if v["slug"] in old])


main()
