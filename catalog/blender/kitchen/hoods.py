"""Extractor hoods: wall chimney hoods (pyramid in brushed steel, flat T-shape in black or white) and hoods that go
under an upper (telescopic slimline, classic under-cabinet canopy). Back on the wall (Blender y 0), canopy
underside = the piece's underside. Chimneys are built 90 cm overall; the real flue cover telescopes to the ceiling.
"""
import bmesh
import bpy

import kit
from common import piece

STEEL = "brushed-steel"
FILTER = "metal:#8e9092"
LED = "glow:#fff4e0@3"
CHIMNEY_H = 0.90
OVER_HOB = 1.55     # underside of a chimney hood: 65 cm over a 90 cm worktop
UNDER_UNIT = 1.80   # underside of the 36 cm over-hood unit (uppers.py)


def frustum(bottom, top, z0, z1, spec, tint=None, roughness=None):
    """Hull of two wall-backed rectangles: bottom/top = (width, depth), back face on y 0."""
    me = bpy.data.meshes.new("frustum")
    bm = bmesh.new()
    for (w, d), z in ((bottom, z0), (top, z1)):
        for x in (-w / 2, w / 2):
            for y in (-d, 0.0):
                bm.verts.new((x, y, z))
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new("frustum", me)
    bpy.context.scene.collection.objects.link(obj)
    return kit.finish(obj, spec, tint, roughness, bevel=0.002, grain="y")


def underside(w, d, z, filters=2, leds=2):
    """Grease filters and LED spots on the canopy's underside, set into its bottom 3 mm."""
    fw = (w - 0.08) / filters
    for k in range(filters):
        kit.box((fw - 0.01, d - 0.12, 0.003), (-w / 2 + 0.04 + fw * (k + 0.5), -d / 2 - 0.01, z), FILTER, bevel=0,
                roughness=0.45, name="filter")
    for k in range(leds):
        x = (k - (leds - 1) / 2) * (w * 0.6 / max(leds - 1, 1))
        kit.cylinder(0.022, 0.003, (x, -d + 0.045, z), LED, verts=20, bevel=0, name="led")


def controls(w, d, z, spec="paint:#1d1d1f", n=4):
    for k in range(n):
        kit.box((0.022, 0.004, 0.01), (w / 2 - 0.06 - 0.032 * k, -d - 0.002, z), spec, bevel=0.001, name="button")


def pyramid(w, spec=STEEL):
    d, base = 0.5, 0.06
    kit.box((w, d, base - 0.003), (0, -d / 2, 0.003), spec, bevel=0.002, grain="x", name="canopy")
    underside(w, d, 0.0, filters=2 if w < 0.8 else 3)
    frustum((w, d), (0.27, 0.25), base, 0.36, spec)
    kit.box((0.26, 0.24, CHIMNEY_H - 0.36), (0, -0.12, 0.36), spec, bevel=0.0015, grain="y", name="chimney")
    controls(w, d, base / 2 - 0.005, "paint:#2a2a2c")


def t_shape(w, spec, rough):
    d, slab = 0.5, 0.05
    kit.box((w, d, slab - 0.003), (0, -d / 2, 0.003), spec, bevel=0.003, roughness=rough, name="canopy")
    underside(w, d, 0.0, filters=2 if w < 0.8 else 3, leds=2 if w < 0.8 else 3)
    kit.box((0.3, 0.25, CHIMNEY_H - slab), (0, -0.125, slab), spec, bevel=0.0015, roughness=rough, name="chimney")
    controls(w, d, slab / 2 - 0.005, "paint:#8a8a8a" if spec.endswith("1d1d1f") else "paint:#2a2a2c")


def telescopic(w, visor, rough):
    """Slimline hood under a unit: body 28 cm deep, the visor pulled out 6 cm switches it on."""
    d, h = 0.28, 0.18
    kit.box((w, d, h - 0.003), (0, -d / 2, 0.003), "paint:#c9c9c7", bevel=0.002, roughness=0.5, name="body")
    underside(w, d - 0.04, 0.0, filters=1 if w < 0.8 else 2, leds=2)
    kit.box((w, 0.3, 0.012), (0, -0.15 - 0.06, 0.003), "paint:#3a3a3c", bevel=0.001, roughness=0.5, name="drawer")
    kit.box((w, 0.02, 0.045), (0, -d - 0.06 - 0.01 + 0.0, 0.0), visor, bevel=0.002, roughness=rough, name="visor")
    controls(w, d + 0.06, 0.02, "paint:#9a9a9a" if visor.endswith("1d1d1f") else "paint:#2a2a2c", n=3)


def under_cabinet(w, spec, rough):
    d, h = 0.47, 0.13
    kit.box((w, d, h - 0.003), (0, -d / 2, 0.003), spec, bevel=0.01, roughness=rough, name="canopy")
    underside(w, d, 0.0, filters=2 if w < 0.8 else 3)
    kit.box((w - 0.04, 0.004, 0.05), (0, -d - 0.001, 0.04), "paint:#2a2a2c", bevel=0.001, roughness=0.3, name="panel")
    controls(w, d + 0.004, 0.055, "paint:#d8d8d8", n=4)


def hood(slug, name, price, colors, mats, style, tags, mount, fn, notes=""):
    piece(slug, name, "range_hood", "wall", colors, price, mats, style, "hood",
          ["extractor hood", "cooker hood", "range hood", *tags], notes, mount_bottom=mount)(fn)


CH_NOTE = "Built with a 90 cm chimney; the telescopic flue cover reaches a 2.6-2.8 m ceiling."
UC_NOTE = "Hangs under a 36 cm over-hood unit (whose underside is about 1.80 m)."
hood("hood-chimney-pyramid-steel-60", "Chimney extractor hood, brushed stainless steel pyramid, 60 cm", 145000,
     ["grey"], ["stainless steel", "aluminium"], "classic", ["chimney", "pyramid", "stainless steel"], OVER_HOB,
     lambda: pyramid(0.6), CH_NOTE)
hood("hood-chimney-pyramid-steel-90", "Chimney extractor hood, brushed stainless steel pyramid, 90 cm", 189000,
     ["grey"], ["stainless steel", "aluminium"], "classic", ["chimney", "pyramid", "stainless steel"], OVER_HOB,
     lambda: pyramid(0.9), CH_NOTE)
hood("hood-chimney-box-black-90", "Chimney extractor hood, matte black T-shape, 90 cm", 235000, ["black"],
     ["powder-coated steel", "aluminium"], "modern", ["chimney", "T-shape", "matte black"], OVER_HOB,
     lambda: t_shape(0.9, "paint:#1d1d1f", 0.55), CH_NOTE)
hood("hood-chimney-box-white-90", "Chimney extractor hood, matte white T-shape, 90 cm", 215000, ["white"],
     ["powder-coated steel", "aluminium"], "scandinavian", ["chimney", "T-shape", "matte white"], OVER_HOB,
     lambda: t_shape(0.9, "paint:#efede8", 0.55), CH_NOTE)
hood("hood-telescopic-steel-60", "Telescopic slimline hood with stainless steel visor, 60 cm, fits under a wall unit",
     98000, ["grey"], ["stainless steel", "aluminium"], "modern", ["integrated", "telescopic", "slimline", "under cabinet"],
     UNDER_UNIT - 0.18, lambda: telescopic(0.6, STEEL, None), UC_NOTE)
hood("hood-telescopic-black-90", "Telescopic slimline hood with black glass visor, 90 cm, fits under a wall unit", 139000,
     ["black", "grey"], ["glass", "aluminium"], "modern", ["integrated", "telescopic", "slimline", "under cabinet"],
     UNDER_UNIT - 0.18, lambda: telescopic(0.9, "paint:#1d1d1f", 0.1), UC_NOTE)
hood("hood-under-cabinet-white-60", "Under-cabinet canopy hood, white, 60 cm", 69000, ["white"],
     ["painted steel", "aluminium"], "classic", ["under cabinet", "canopy", "visor"], UNDER_UNIT - 0.13,
     lambda: under_cabinet(0.6, "paint:#efede8", 0.45), UC_NOTE)
hood("hood-under-cabinet-steel-90", "Under-cabinet canopy hood, stainless steel, 90 cm", 92000, ["grey"],
     ["stainless steel", "aluminium"], "classic", ["under cabinet", "canopy", "visor"], UNDER_UNIT - 0.13,
     lambda: under_cabinet(0.9, STEEL, None), UC_NOTE)
