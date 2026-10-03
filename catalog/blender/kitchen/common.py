"""Shared by the kitchen builders: paths, the v1 texture library, extra materials, the piece registry, the anchored
exporter and the entry record.

Credit: the registry / meta-per-slug / collect pattern is catalog/blender/soft/common.py (itself after Ashot's gap
lane, origin/experimental/floor-plans-3d:catalog/blender/gaps/common.py); geometry helpers are the v1 bpy kit
(vendor/kit.py, vendor/kit_shapes.py), Ashot's kitchen-fitted parts (vendor/parts.py) and the lights lane's lkit
(vendor/lkit.py, pendants only).

Axes: build in Blender units = metres, Z up, the front facing -Y. The exporter writes glTF (Y up, front +Z) with
  wall pieces     x centred, bottom at y 0, back on the wall at z 0, front +Z (the sconce convention, plus base 0)
  surface/floor   x and z centred, base at y 0, front +Z
Build wall pieces with the back on Blender y = 0 and the body at y < 0, so the anchor shift is ~0.

Output (gitignored): out/bpy-kitchen/<slug>.glb + entries.json (catalog/ingest_extra.py's format), out/meta/<slug>.json
per built piece (merged by collect.py, so several Blender processes can build at once), out/previews/<slug>.png.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VENDOR = HERE / "vendor"
OUT = HERE / "out"
V1 = OUT / "v1"  # catalog/materials extracted from origin/main (v2 has no texture library)
GROUP = "bpy-kitchen"
MODELS = OUT / GROUP
META = OUT / "meta"
PREVIEWS = OUT / "previews"
COLORS = frozenset("black white grey beige brown red orange yellow green blue purple pink".split())
PLACEMENTS = ("floor", "surface", "wall", "ceiling")
FAMILIES = ("upper", "shelf", "backsplash", "hood", "styling", "light")


def ensure_textures(ref="origin/main"):
    if (V1 / "materials" / "oak" / "basecolor.jpg").exists():
        return
    V1.mkdir(parents=True, exist_ok=True)
    top = subprocess.run(["git", "-C", str(HERE), "rev-parse", "--show-toplevel"], check=True, capture_output=True,
                         text=True).stdout.strip()
    archive = subprocess.run(["git", "-C", top, "archive", ref, "catalog/materials"], check=True,
                             capture_output=True).stdout
    subprocess.run(["tar", "-x", "--strip-components=1", "-C", str(V1)], input=archive, check=True)


def _hexlin(c):
    c = c.lstrip("#")
    srgb = [int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in srgb], 1.0)


def setup():
    """Call inside Blender: vendor on sys.path, kit pointed at the extracted library, two extra material specs.

    kit.material gains (by wrapping, vendor/kit.py stays verbatim):
      "glass:#hex@alpha"  clear or tinted glass as plain alpha blend (no transmission, so three.js needs no
                          transmission pass); "glass" alone = clear 0.22
      "glow:#hex@s"       emissive (LED diffusers, lit opal), base colour a light warm white
    """
    ensure_textures()
    sys.path[:0] = [str(VENDOR), str(HERE)]
    import kit
    import lkit
    kit.MATERIALS = V1 / "materials"
    lkit.MATS = V1 / "materials"
    orig = kit.material

    def material(spec, tint=None, roughness=None):
        key = (spec, tint, roughness)
        if key in kit._cache:
            return kit._cache[key]
        kind, _, arg = spec.partition(":")
        if kind == "glass":
            hexc, _, a = arg.partition("@")
            m, b = kit._principled(spec)
            b.inputs["Base Color"].default_value = _hexlin(hexc or "#e8eef0")
            b.inputs["Roughness"].default_value = 0.06 if roughness is None else roughness
            b.inputs["Alpha"].default_value = float(a or 0.22)
            m.surface_render_method = "BLENDED"
            m.use_backface_culling = False
        elif kind == "glow":
            hexc, _, s = arg.partition("@")
            m, b = kit._principled(spec)
            b.inputs["Base Color"].default_value = tuple(0.5 * c + 0.5 * w for c, w in zip(_hexlin(hexc), _hexlin("#f6f1e8")))
            b.inputs["Roughness"].default_value = 0.4
            b.inputs["Emission Color"].default_value = _hexlin(hexc)
            b.inputs["Emission Strength"].default_value = float(s or 1.0)
        else:
            return orig(spec, tint, roughness)
        kit._cache[key] = (m, None)
        return kit._cache[key]

    kit.material = material
    return kit


REGISTRY = {}


def piece(slug, name, kind, placement, colors, price, materials, style, family, tags=(), notes="", mount_bottom=None,
          hang=None, tri_budget=30000):
    """Register a builder. colors: palette words ingest_extra accepts; price: whole AMD. mount_bottom: suggested
    height of the piece's underside above the floor (wall pieces). hang: lights-lane hang meta (pendants only)."""
    assert slug not in REGISTRY, slug
    assert colors and set(colors) <= COLORS, (slug, colors)
    assert isinstance(price, int) and price > 0, slug
    assert placement in PLACEMENTS, slug
    assert family in FAMILIES, slug

    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, placement=placement, colors=list(colors), price=price,
                                   materials=list(materials), style=style, family=family, tags=list(tags),
                                   notes=notes, mount_bottom=mount_bottom, hang=hang, tri_budget=tri_budget,
                                   order=len(REGISTRY)))
        return fn
    return deco


def export(path, slug, placement):
    """Join all meshes, anchor them per placement (see module doc), write the GLB. Returns size [w, d, h] in
    Blender x, y, z (= glTF x, z, y), glTF bounds lo/hi, tris and bytes."""
    import bpy
    from mathutils import Vector
    import kit_shapes as ks
    ks.shrink_images(512)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
        o.data.uv_layers[0].name = "UVMap"
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = obj.data.name = slug
    vs = obj.data.vertices
    lo = Vector((min(v.co.x for v in vs), min(v.co.y for v in vs), min(v.co.z for v in vs)))
    hi = Vector((max(v.co.x for v in vs), max(v.co.y for v in vs), max(v.co.z for v in vs)))
    shift = Vector(((lo.x + hi.x) / 2, hi.y if placement == "wall" else (lo.y + hi.y) / 2, lo.z))
    for v in vs:
        v.co -= shift
    lo, hi = lo - shift, hi - shift
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_image_format="JPEG", export_image_quality=82, export_yup=True)
    size = [round(hi.x - lo.x, 4), round(hi.y - lo.y, 4), round(hi.z - lo.z, 4)]
    gl_lo = [round(lo.x, 4), round(lo.z, 4), round(-hi.y, 4)]
    gl_hi = [round(hi.x, 4), round(hi.z, 4), round(-lo.y, 4)]
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    return {"size_m": size, "lo": gl_lo, "hi": gl_hi, "tris": tris, "bytes": Path(path).stat().st_size}


ANCHOR = {
    "wall": "Wall piece: origin at the bottom-back-centre, back on the wall (z 0), front faces +Z, underside at y 0.",
    "surface": "Surface piece: origin at the base centre (y 0), front faces +Z; stands on a worktop or shelf.",
    "floor": "Floor piece: origin at the base centre (y 0), front faces +Z.",
}


def record(slug, meta, info, extra=None):
    """One ingest_extra entry (soft/common.record shape, plus glTF bounds and mount hints)."""
    notes = ANCHOR.get(meta["placement"], "")
    if meta["mount_bottom"] is not None:
        notes += f" Suggested underside height {meta['mount_bottom']:.2f} m above the floor."
    if meta["notes"]:
        notes += " " + meta["notes"]
    e = dict(slug=slug, name=meta["name"], kind=meta["kind"], placement=meta["placement"], glb=f"{slug}.glb",
             size_m=info["size_m"], mesh_extents_m=info["size_m"], colors=meta["colors"], price_amd=meta["price"],
             materials=meta["materials"], style=meta["style"], license="CC0 (generated by varpet)",
             source_url="generated:bpy", notes=notes.strip(),
             tags=["generated", "bpy", "kitchen", meta["placement"], *meta["tags"]],
             family=meta["family"], bounds_m={"lo": info["lo"], "hi": info["hi"]}, tris=info["tris"],
             tri_budget=meta["tri_budget"], kb=info["bytes"] // 1024, order=meta["order"])
    if meta["mount_bottom"] is not None:
        e["mount_bottom_m"] = meta["mount_bottom"]
    if extra:
        e.update(extra)
    return e


def write_meta(entry):
    META.mkdir(parents=True, exist_ok=True)
    (META / f"{entry['slug']}.json").write_text(json.dumps(entry, indent=1, ensure_ascii=False) + "\n")
