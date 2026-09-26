"""CC0 interior decor from Poly Haven -> normalised GLBs + data/extra/polyhaven/entries.json.

Do not import this group as-is (26 Sept): the shelf-styling, tabletop, plants and textiles groups already hold
most of these Poly Haven assets under other ids. Import only slugs you have checked are missing.

Run from catalog/:
    uv run python tools/polyhaven_models.py            # list, download 1k glTF, convert, write manifest
    uv run python tools/polyhaven_models.py --only ceramic_vase_01 wall_clock
    uv run python tools/polyhaven_models.py sheet      # contact sheet from rendered previews

The Blender half of this file runs inside Blender (driven by the command above):
    Blender -b --python tools/polyhaven_models.py -- <jobs.json> <results.json>

Poly Haven API terms: send a user agent naming the software; downloaded assets are CC0.
Normalised GLB: metres, Y-up, centred on x/z, base at y=0, front +Z (Poly Haven's
Blender -Y front exports as glTF +Z, so no rotation unless a row sets rot_z).
size_m = mesh_extents_m = [w (x), d (z), h (y)] measured after normalising.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

API = "https://api.polyhaven.com"
UA = {"User-Agent": "varpet-catalog/1.0 (+https://github.com/snek-git/varpet)"}
BLENDER = os.environ.get("BLENDER", "/Applications/Blender.app/Contents/MacOS/Blender")
MAX_BYTES = 2_000_000

# kind, placement, AMD price, style, materials, tags; optional parts = {suffix: root-node regex}
# for Poly Haven files that spread several variants side by side; optional colors override.
F, S, W = "floor", "surface", "wall"
PICKS = {
    # plants
    "potted_plant_01": dict(colors=["green", "orange"], kind="plant", placement=F, price=38000, style="boho",
                            materials=["terracotta", "plant"], tags=["potted", "tall", "leafy"]),
    "potted_plant_02": dict(colors=["green", "orange"], kind="plant", placement=F, price=29000, style="boho",
                            materials=["terracotta", "plant"], tags=["potted", "leafy"]),
    "potted_plant_04": dict(colors=["green", "white"], kind="plant", placement=S, price=7000, style="minimalist",
                            materials=["ceramic", "plant"], tags=["potted", "small", "succulent"]),
    "planter_pot_clay": dict(colors=["orange", "brown"], kind="planter", placement=F, price=6000, style="traditional",
                             materials=["terracotta"], tags=["pot", "clay", "empty"]),
    # vases, bowls, baskets, books
    "antique_ceramic_vase_01": dict(colors=["white", "blue"], kind="decor", placement=S, price=18000, style="classic",
                                    materials=["ceramic"], tags=["vase", "antique", "painted"]),
    "ceramic_vase_01": dict(colors=["white"], kind="decor", placement=S, price=9000, style="japandi",
                            materials=["ceramic"], tags=["vase", "glazed"]),
    "ceramic_vase_02": dict(colors=["white"], kind="decor", placement=S, price=8000, style="minimalist",
                            materials=["ceramic"], tags=["vase", "round"]),
    "ceramic_vase_03": dict(colors=["white", "beige"], kind="decor", placement=S, price=7000, style="minimalist",
                            materials=["ceramic"], tags=["vase", "slim", "bud vase"]),
    "ceramic_vase_04": dict(colors=["white"], kind="decor", placement=S, price=8000, style="japandi",
                            materials=["ceramic"], tags=["vase", "glazed"]),
    "brass_vase_01": dict(colors=["yellow", "brown"], kind="decor", placement=F, price=24000, style="classic",
                          materials=["brass"], tags=["vase", "tall", "metal"]),
    "brass_vase_02": dict(colors=["orange", "brown"], kind="decor", placement=S, price=18000, style="classic",
                          materials=["brass"], tags=["vase", "metal"]),
    "brass_vase_03": dict(colors=["orange", "brown"], kind="decor", placement=S, price=6000, style="eclectic",
                          materials=["brass"], tags=["vase", "small", "metal"]),
    "brass_vase_04": dict(colors=["orange", "brown"], kind="decor", placement=S, price=5000, style="eclectic",
                          materials=["brass"], tags=["vase", "small", "metal"]),
    "wooden_bowl_01": dict(colors=["brown"], kind="decor", placement=S, price=7000, style="scandinavian",
                           materials=["wood"], tags=["bowl", "fruit bowl", "turned"]),
    "wooden_bowl_02": dict(colors=["brown", "orange"], kind="decor", placement=S, price=4000, style="scandinavian",
                           materials=["wood"], tags=["bowl", "small", "turned"]),
    "carved_wooden_plate": dict(colors=["beige"], kind="decor", placement=S, price=6000, style="boho",
                                materials=["wood"], tags=["plate", "carved", "tray"]),
    "wicker_basket_01": dict(colors=["brown"], kind="decor", placement=S, price=6000, style="boho",
                             materials=["wicker"], tags=["basket", "woven", "tray"]),
    "wicker_basket_02": dict(colors=["beige", "brown"], kind="decor", placement=S, price=8000, style="boho",
                             materials=["rattan"], tags=["basket", "woven", "storage"]),
    "book_encyclopedia_set_01": dict(colors=["brown", "black"], kind="decor", placement=S, price=15000, style="classic",
                                     materials=["paper", "leather"], tags=["books", "encyclopedia", "row"]),
    # candles, lanterns, cushions, sculptures
    "brass_candleholders": dict(colors=["yellow", "white"], kind="decor", placement=S, price=9000, style="classic",
                                materials=["brass"], tags=["candle holder", "candlestick", "metal"],
                                parts={n: rf"_{n}$" for n in ("01", "02", "03")}),
    "wooden_candlestick": dict(colors=["brown"], kind="decor", placement=S, price=4000, style="scandinavian",
                               materials=["wood"], tags=["candle", "candlestick"]),
    "wooden_lantern_01": dict(colors=["brown", "black"], kind="decor", placement=F, price=12000, style="japandi",
                              materials=["wood", "glass"], tags=["lantern", "candle"]),
    "throw_pillows_01": dict(colors=["orange", "red", "yellow"], kind="decor", placement=S, price=8000, style="modern",
                             materials=["fabric"], tags=["cushion", "pillow", "throw pillow"],
                             parts={n: rf"_pillow{n}$" for n in ("01", "02")}),
    "carved_wooden_elephant": dict(colors=["brown"], kind="decor", placement=S, price=5000, style="eclectic",
                                   materials=["wood"], tags=["sculpture", "figurine", "elephant"]),
    "concrete_cat_statue": dict(colors=["grey", "beige"], kind="decor", placement=S, price=9000, style="industrial",
                                materials=["concrete"], tags=["sculpture", "cat", "statue"]),
    "horse_statue_01": dict(colors=["white"], kind="decor", placement=S, price=9000, style="classic",
                            materials=["bronze"], tags=["sculpture", "horse", "figurine"]),
    "marble_bust_01": dict(colors=["white", "grey"], kind="decor", placement=S, price=28000, style="classic",
                           materials=["marble"], tags=["sculpture", "bust", "statue"]),
    "horse_head": dict(colors=["brown"], kind="decor", placement=S, price=16000, style="classic",
                       materials=["stone"], tags=["sculpture", "horse", "bust"]),
    "lion_head": dict(colors=["grey", "black"], kind="decor", placement=S, price=16000, style="classic",
                      materials=["stone"], tags=["sculpture", "lion", "bust"]),
    "bull_head": dict(colors=["brown", "black"], kind="decor", placement=S, price=16000, style="eclectic",
                      materials=["stone"], tags=["sculpture", "bull", "bust"]),
    "lambis_shell": dict(colors=["orange", "beige"], kind="decor", placement=S, price=4000, style="boho",
                         materials=["shell"], tags=["seashell", "coastal", "ornament"]),
    "standing_picture_frame_01": dict(colors=["black", "white"], kind="decor", placement=S, price=5000, style="classic",
                                      materials=["wood", "glass"], tags=["picture frame", "photo frame"], rot_z=-90),
    "standing_picture_frame_02": dict(colors=["white"], kind="decor", placement=S, price=5000, style="modern",
                                      materials=["wood", "glass"], tags=["picture frame", "photo frame"], rot_z=-90),
    "chess_set": dict(colors=["black", "white"], kind="decor", placement=S, price=14000, style="classic",
                      materials=["wood"], tags=["chess", "board game", "tabletop"]),
    # wall art (catalog kind wall_art; frames hang on the wall)
    "fancy_picture_frame_01": dict(colors=["yellow", "brown"], kind="wall_art", placement=W, price=18000, style="classic",
                                   materials=["wood", "canvas"], tags=["picture frame", "painting", "gilded"]),
    "fancy_picture_frame_02": dict(colors=["yellow", "brown"], kind="wall_art", placement=W, price=22000, style="classic",
                                   materials=["wood", "canvas"], tags=["picture frame", "painting", "ornate"]),
    "hanging_picture_frame_01": dict(colors=["black", "grey"], kind="wall_art", placement=W, price=14000, style="modern",
                                     materials=["wood", "canvas"], tags=["picture frame", "art print"]),
    "hanging_picture_frame_02": dict(colors=["white", "grey"], kind="wall_art", placement=W, price=14000, style="modern",
                                     materials=["wood", "canvas"], tags=["picture frame", "art print"]),
    "hanging_picture_frame_03": dict(colors=["brown", "grey"], kind="wall_art", placement=W, price=10000, style="modern",
                                     materials=["wood", "canvas"], tags=["picture frame", "art print"]),
    # clocks, mirror, lamps
    "wall_clock": dict(colors=["white", "grey"], kind="clock", placement=W, price=9000, style="modern",
                       materials=["plastic", "glass"], tags=["wall clock", "round"]),
    "vintage_telephone_wall_clock": dict(colors=["red", "black"], kind="clock", placement=W, price=16000, style="classic",
                                         materials=["wood", "metal"], tags=["wall clock", "vintage"]),
    "mantel_clock_01": dict(colors=["brown"], kind="decor", placement=S, price=18000, style="classic",
                            materials=["wood", "brass"], tags=["mantel clock", "table clock"]),
    "alarm_clock_01": dict(colors=["green", "white"], kind="decor", placement=S, price=5000, style="mid-century",
                           materials=["metal"], tags=["alarm clock", "bedside"]),
    "vintage_grandfather_clock_01": dict(colors=["brown"], kind="decor", placement=F, price=45000, style="traditional",
                                         materials=["wood", "brass"], tags=["grandfather clock", "floor clock"]),
    "ornate_mirror_01": dict(colors=["yellow", "grey"], kind="mirror", placement=W, price=32000, style="classic",
                             materials=["wood", "glass"], tags=["mirror", "ornate", "gilded"]),
    "desk_lamp_arm_01": dict(colors=["orange"], kind="lamp", placement=S, price=16000, style="industrial",
                             materials=["metal"], tags=["desk lamp", "table lamp", "task lamp"], rot_z=90),
    "industrial_pipe_lamp": dict(colors=["grey", "black"], kind="lamp", placement=S, price=14000, style="industrial",
                                 materials=["metal"], tags=["table lamp", "pipe", "edison bulb"]),
}

# Seen in the listing and deliberately left out (reported, never ingested).
SKIPPED = {
    "wall lamps (the editor does not wall-mount lamps)": ["industrial_wall_lamp"],
    "ceiling lights (no ceiling placement)": ["Chandelier_01", "Chandelier_02", "Chandelier_03",
        "chinese_chandelier", "lantern_chandelier_01", "modern_ceiling_lamp_01", "hanging_industrial_lamp"],
    "big furniture worth a separate pass": ["mid_century_lounge_chair", "modern_arm_chair_01", "sofa_02",
        "sofa_03", "Ottoman_01", "modern_coffee_table_01", "modern_coffee_table_02", "coffee_table_round_01",
        "side_table_01", "side_table_tall_01", "ClassicNightstand_01", "ClassicConsole_01",
        "modern_wooden_cabinet", "Shelf_01", "wooden_display_shelves_01", "chinese_screen_panels",
        "round_wooden_table_02", "dining_chair_02", "bar_chair_round_01"],
    "outdoor planters / wild plants": ["planter_box_01", "planter_box_02", "planter_box_03", "fern_02"],
    "no glTF download (blend/fbx only)": ["decorative_book_set_01"],
    "unpotted botany scans (bare plant, no pot)": ["anthurium_botany_01", "calathea_orbifolia_01",
        "pachira_aquatica_01"],
    "hangs from a chain/rod (ceiling)": ["brass_diya_lantern", "vintage_oil_lamp"],
}


def _check_scale(parts_used, dims_mm, extents, height_range=None):
    """Whole-asset rows compare to the listing's [x, y, z] mm; split rows only sanity-check height."""
    if parts_used or not dims_mm:
        return None
    listed = [d / 1000 for d in dims_mm]  # Blender axes: x, y (depth), z (up) == our w, d, h
    bad = [i for i, (a, b) in enumerate(zip(extents, listed)) if abs(a - b) > max(0.02, 0.15 * b)]
    return f"extents {extents} vs listed {[round(x, 3) for x in listed]}" if bad else None


# ---------------------------------------------------------------- driver (uv run)
def driver(argv):
    import argparse
    import hashlib
    import urllib.request

    root = Path(__file__).resolve().parents[1]
    data = root / "data"
    out_dir = data / "extra" / "polyhaven"
    cache = data / "cache" / "polyhaven"
    previews = data / "previews-extra" / "polyhaven"

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", nargs="?", default="build", choices=["build", "sheet"])
    ap.add_argument("--only", nargs="*", help="Poly Haven ids to (re)build; others keep their entries")
    args = ap.parse_args(argv)
    if args.cmd == "sheet":
        return contact_sheet(out_dir, previews, data / "previews-extra" / "polyhaven-sheet.png")

    def fetch(url, tries=4):
        last = None
        for _ in range(tries):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                    return r.read()
            except Exception as e:  # flaky CDN: retry, then fail loudly
                last = e
        raise RuntimeError(f"download failed: {url}: {last}")

    listing = json.loads(fetch(f"{API}/assets?t=models"))
    ids = [i for i in PICKS if not args.only or i in args.only]
    jobs, meta, skipped = [], {}, []
    for aid in ids:
        if aid not in listing:
            skipped.append((aid, "not in API listing"))
            continue
        files = json.loads(fetch(f"{API}/files/{aid}"))
        g = files.get("gltf", {}).get("1k", {}).get("gltf")
        if not g:
            skipped.append((aid, "no 1k glTF"))
            continue
        d = cache / aid
        todo = [(Path(aid + "_1k.gltf"), g)] + [(Path(k), v) for k, v in g.get("include", {}).items()]
        for rel, f in todo:
            p = d / rel
            if p.is_file() and hashlib.md5(p.read_bytes()).hexdigest() == f.get("md5"):
                continue
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(fetch(f["url"]))
        pick = PICKS[aid]
        for suffix, rx in (pick.get("parts") or {None: None}).items():
            slug = re.sub(r"[^a-z0-9]+", "-", aid.lower()).strip("-") + (f"-{suffix}" if suffix else "")
            jobs.append(dict(slug=slug, gltf=str(d / f"{aid}_1k.gltf"), keep=rx,
                             rot_z=pick.get("rot_z", 0), out=str(out_dir / f"{slug}.glb")))
            meta[slug] = (aid, suffix)
        print(f"fetched {aid}", flush=True)

    out_dir.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    jobs_path, results_path = cache / "jobs.json", cache / "results.json"
    jobs_path.write_text(json.dumps(jobs, indent=1))
    subprocess.run([BLENDER, "-b", "--factory-startup", "--python", __file__, "--",
                    str(jobs_path), str(results_path)], check=True,
                   stdout=subprocess.DEVNULL if not os.environ.get("VERBOSE") else None)
    results = json.loads(results_path.read_text())

    manifest = out_dir / "entries.json"
    entries = {e["slug"]: e for e in json.loads(manifest.read_text())} if manifest.exists() and args.only else {}
    warnings = []
    for job in jobs:
        slug = job["slug"]
        aid, suffix = meta[slug]
        res = results.get(slug)
        if not res or res.get("error"):
            skipped.append((slug, (res or {}).get("error", "blender produced nothing")))
            entries.pop(slug, None)
            continue
        if res["bytes"] > MAX_BYTES:
            skipped.append((slug, f"GLB {res['bytes'] / 1e6:.1f} MB > 2 MB"))
            Path(job["out"]).unlink(missing_ok=True)
            entries.pop(slug, None)
            continue
        info, pick = listing[aid], PICKS[aid]
        w, d, h = res["extents"]
        size = [round(w, 3), round(d, 3), round(h, 3)]
        warn = _check_scale(suffix, info.get("dimensions"), [w, d, h])
        if warn:
            warnings.append(f"{slug}: {warn}")
        name = info["name"] + (f" {suffix.upper()}" if suffix and suffix.isalpha() else
                               f" {suffix}" if suffix else "")
        colors = pick.get("colors") or palette_colors(Path(job["gltf"]).parent, res.get("textures", []))
        notes = "front faces +Z" + ("; Wall-hung" if pick["placement"] == W else "")
        if res.get("decimated", 1) < 1:
            notes += f"; geometry decimated to {res['decimated']:.0%} to fit 2 MB"
        entries[slug] = dict(
            slug=slug, name=name, kind=pick["kind"], placement=pick["placement"],
            source_url=f"https://polyhaven.com/a/{aid}", license="CC0 (Poly Haven)",
            attribution="Poly Haven, " + ", ".join(info.get("authors", {})),
            glb=f"{slug}.glb", size_m=size, mesh_extents_m=size, colors=colors,
            price_amd=int(pick["price"]), materials=pick["materials"], style=pick["style"],
            notes=notes, tags=sorted(set(pick["tags"]) | {pick["placement"]}),
        )
    order = {s: i for i, s in enumerate(re.sub(r"[^a-z0-9]+", "-", a.lower()) for a in PICKS)}
    rows = sorted(entries.values(), key=lambda e: (order.get(e["slug"].rsplit("-", 1)[0], order.get(e["slug"], 999)), e["slug"]))
    manifest.write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n")
    total = sum((out_dir / e["glb"]).stat().st_size for e in rows)
    print(f"wrote {len(rows)} entries, {total / 1e6:.1f} MB -> {manifest}")
    for s, why in skipped:
        print(f"SKIPPED {s}: {why}")
    for wmsg in warnings:
        print(f"SCALE? {wmsg}")
    return 0


PALETTE = {
    "black": (25, 25, 25), "white": (240, 240, 235), "grey": (128, 128, 128), "beige": (215, 195, 160),
    "brown": (110, 70, 40), "red": (180, 40, 35), "orange": (220, 120, 40), "yellow": (225, 195, 60),
    "green": (70, 130, 60), "blue": (50, 90, 170), "purple": (120, 60, 140), "pink": (225, 150, 170),
}


def palette_colors(folder, textures):
    """1-3 palette words from the base-colour textures (pixel share >= 12%)."""
    import numpy as np
    from PIL import Image

    names, cols = list(PALETTE), np.array(list(PALETTE.values()), dtype=np.float32)
    counts = np.zeros(len(names))
    for rel in textures:
        p = folder / rel
        if not p.is_file():
            continue
        px = np.asarray(Image.open(p).convert("RGB").resize((64, 64)), dtype=np.float32).reshape(-1, 3)
        idx = ((px[:, None, :] - cols[None]) ** 2).sum(-1).argmin(1)
        counts += np.bincount(idx, minlength=len(names))
    if not counts.sum():
        return ["grey"]
    share = counts / counts.sum()
    ranked = [names[i] for i in share.argsort()[::-1] if share[i] >= 0.12][:3]
    return ranked or [names[int(share.argmax())]]


def contact_sheet(out_dir, previews, dest):
    from PIL import Image, ImageDraw

    rows = json.loads((out_dir / "entries.json").read_text())
    tile, cols = 256, 8
    sheet = Image.new("RGB", (cols * tile, ((len(rows) + cols - 1) // cols) * (tile + 34)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, e in enumerate(rows):
        x, y = (i % cols) * tile, (i // cols) * (tile + 34)
        p = previews / (e["glb"][:-4] + ".png")
        if p.is_file():
            sheet.paste(Image.open(p).convert("RGB").resize((tile, tile)), (x, y))
        else:
            draw.text((x + 8, y + 120), "NO PREVIEW", fill="red")
        draw.text((x + 4, y + tile + 2), e["slug"][:38], fill="black")
        draw.text((x + 4, y + tile + 17), f"{e['kind']}/{e['placement']} {e['size_m']}", fill="#555")
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest)
    print(f"sheet {len(rows)} tiles -> {dest}")
    return 0


# ---------------------------------------------------------------- Blender half
def blender_main(jobs_path, results_path):
    import math

    import bpy
    import numpy as np
    from mathutils import Vector

    def world_bbox(objs):
        lo, hi = np.full(3, np.inf), np.full(3, -np.inf)
        dg = bpy.context.evaluated_depsgraph_get()
        for o in objs:
            me = o.evaluated_get(dg).data
            n = len(me.vertices)
            if not n:
                continue
            co = np.empty(n * 3, dtype=np.float64)
            me.vertices.foreach_get("co", co)
            co = co.reshape(-1, 3)
            m = np.array(o.matrix_world)
            wc = co @ m[:3, :3].T + m[:3, 3]
            lo, hi = np.minimum(lo, wc.min(0)), np.maximum(hi, wc.max(0))
        return lo, hi

    def export(path, quality):
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_image_format="JPEG",
                                  export_image_quality=quality, export_jpeg_quality=quality,
                                  export_cameras=False, export_lights=False, export_extras=False,
                                  export_draco_mesh_compression_enable=False, export_yup=True,
                                  export_apply=True)

    results = {}
    for job in json.loads(Path(jobs_path).read_text()):
        try:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            bpy.ops.import_scene.gltf(filepath=job["gltf"])
            scene = bpy.context.scene
            for o in list(scene.objects):
                if o.type in ("CAMERA", "LIGHT"):
                    bpy.data.objects.remove(o, do_unlink=True)
            roots = [o for o in scene.objects if o.parent is None]
            if job["keep"]:
                rx = re.compile(job["keep"])
                for r in roots:
                    if not rx.search(re.sub(r"\.\d{3}$", "", r.name)):
                        for o in [r, *r.children_recursive]:
                            bpy.data.objects.remove(o, do_unlink=True)
                roots = [o for o in scene.objects if o.parent is None]
            if not roots:
                raise RuntimeError(f"no nodes match {job['keep']}")
            pivot = bpy.data.objects.new("pivot", None)
            scene.collection.objects.link(pivot)
            for r in roots:
                r.parent = pivot
            pivot.rotation_euler.z = math.radians(job.get("rot_z", 0))
            bpy.context.view_layer.update()
            meshes = [o for o in scene.objects if o.type == "MESH"]
            lo, hi = world_bbox(meshes)
            c = (lo + hi) / 2
            pivot.location = Vector((-c[0], -c[1], -lo[2]))
            bpy.context.view_layer.update()
            lo, hi = world_bbox(meshes)
            ext = (hi - lo).tolist()  # Blender x, y, z == glTF width, depth, height
            for img in bpy.data.images:  # 1k already; cap anything larger
                if img.size[0] > 1024 or img.size[1] > 1024:
                    img.scale(min(1024, img.size[0]), min(1024, img.size[1]))
            for m in {m for o in meshes for m in o.data.materials if m and m.node_tree}:
                # 1k-JPG glTFs route glass alpha through a JPEG (no alpha channel): exports opaque black.
                bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                if bsdf and "glass" in m.name.lower():
                    for link in list(bsdf.inputs["Alpha"].links):
                        m.node_tree.links.remove(link)
                    bsdf.inputs["Alpha"].default_value = 0.15
            export(job["out"], 85)
            if os.path.getsize(job["out"]) > MAX_BYTES:
                for img in bpy.data.images:
                    if img.size[0] > 512:
                        img.scale(512, max(1, img.size[1] * 512 // img.size[0]))
                export(job["out"], 80)
            decimated = 1.0
            for ratio in (0.5, 0.25, 0.12):  # heavy scans: collapse geometry until the GLB fits
                if os.path.getsize(job["out"]) <= MAX_BYTES:
                    break
                for o in meshes:
                    mod = o.modifiers.get("fit") or o.modifiers.new("fit", "DECIMATE")
                    mod.ratio = ratio
                decimated = ratio
                export(job["out"], 80)
            lo, hi = world_bbox(meshes)  # re-measure: decimation can move the hull by a hair
            ext = (hi - lo).tolist()
            textures = sorted({os.path.relpath(bpy.path.abspath(n.image.filepath), os.path.dirname(job["gltf"]))
                               for o in meshes for m in o.data.materials if m and m.node_tree
                               for n in m.node_tree.nodes
                               if n.type == "TEX_IMAGE" and n.image and "diff" in n.image.name.lower()})
            results[job["slug"]] = dict(extents=[ext[0], ext[1], ext[2]], bytes=os.path.getsize(job["out"]),
                                        textures=textures, decimated=decimated, xz_centre=[float((lo[0] + hi[0]) / 2),
                                                                      float((lo[1] + hi[1]) / 2)])
        except Exception as e:  # one bad asset must not stop the batch
            results[job["slug"]] = dict(error=f"{type(e).__name__}: {e}")
        print("PH", job["slug"], results[job["slug"]], flush=True)
    Path(results_path).write_text(json.dumps(results, indent=1))


if __name__ == "__main__":
    if "bpy" in sys.modules or any(a.endswith("Blender") for a in sys.argv[:1]):
        a = sys.argv[sys.argv.index("--") + 1:]
        blender_main(a[0], a[1])
    else:
        raise SystemExit(driver(sys.argv[1:]))
