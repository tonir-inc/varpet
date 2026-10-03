# Vendored from varpet v1 origin/main:catalog/blender/kit_shapes.py (shapes, shrink_images). Kept verbatim except where marked VARPET-V2.
"""Real-geometry reeding and fluting on top of kit (a texture alone reads flat in the editor's light).

    import kit, kit_shapes as ks
    ks.reeded_panel(0.58, 0.62, 0.02, (0, -0.24, 0.12), "oak-rift", reed_w=0.02)      # vanity door, reeds face -Y
    ks.fluted_cylinder(0.2, 0.45, (0, 0, 0), "travertine", flutes=20)                   # side table base
    ks.fluted_cylinder(0.2, 0.45, (0, 0, 0), "oak-rift", flutes=28, reeded=True)        # convex reeds instead

Both extrude a 2D profile straight up (one mesh, no booleans), then go through kit.finish (bevel on sharp
edges, auto smooth, UVs in metres with the grain along Z, material). `at` is the BOTTOM CENTRE like kit.box.
Tris: a 0.6 x 0.7 m door at reed_w 0.02 is ~2.5k; a 24-flute column ~3k.
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kit  # noqa: E402


def _extrude(profile, height, name):
    """Closed CCW XY polygon -> prism from z=0 to z=height (ngon caps; Blender tessellates concave caps)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, 0.0)) for x, y in profile]
    hi = [bm.verts.new((x, y, height)) for x, y in profile]
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _place(obj, at, rot):
    obj.location = at
    obj.rotation_euler = [math.radians(a) for a in rot]
    return obj


def reeded_panel(width, height, depth, at, spec, tint=None, reed_w=0.02, relief=None, seg=8, bevel=0.0015,
                 roughness=None, rot=(0, 0, 0), name="reeded"):
    """Slab `width` (X) x `depth` (Y) x `height` (Z) whose FRONT (-Y) is covered by vertical half-round reeds.

    reed_w: target reed pitch (snapped so whole reeds fill the width). relief: how far a reed stands proud
    (default 0.4 * reed_w, capped at 0.6 * depth). The back (+Y) stays flat for mounting on a carcass.
    """
    n = max(1, round(width / reed_w))
    pitch = width / n
    relief = min(relief if relief is not None else 0.4 * pitch, 0.6 * depth)
    # circular segment through the chord (pitch) with sagitta `relief`
    r = (pitch ** 2 / 4 + relief ** 2) / (2 * relief)
    half = math.asin(min(1.0, pitch / 2 / r))
    base_y = -depth / 2 + relief  # the valley line; reed crowns reach -depth/2
    pts = [(width / 2, depth / 2), (-width / 2, depth / 2), (-width / 2, base_y)]
    for k in range(n):
        cx = -width / 2 + pitch * (k + 0.5)
        cy = base_y - relief + r  # centre sits behind the crown
        for s in range(1, seg + 1):  # s=0 is the previous reed's end (or the left edge)
            a = -half + 2 * half * s / seg
            pts.append((cx + r * math.sin(a), cy - r * math.cos(a)))
    # CCW seen from +Z: back edge runs +X -> -X, so the loop above is CCW already
    obj = _extrude(pts, height, name)
    _place(obj, at, rot)
    return kit.finish(obj, spec, tint, roughness, bevel, segments=2, grain="y")


def fluted_cylinder(radius, height, at, spec, tint=None, flutes=24, depth=None, land=0.18, reeded=False, seg=6,
                    radius_top=None, bevel=0.0015, roughness=None, rot=(0, 0, 0), name="fluted"):
    """Column standing on `at` with `flutes` vertical grooves (concave) or, reeded=True, convex reeds.

    depth: groove depth / reed height (default radius * pi / flutes * 0.35). land: fraction of each flute
    pitch left flat between grooves (0 for reeds that touch). radius_top makes it taper.
    """
    pitch = 2 * math.pi / flutes
    depth = depth if depth is not None else radius * pitch * 0.35
    profile = []
    for f in range(flutes):
        a0 = f * pitch
        g0, g1 = a0 + pitch * land / 2, a0 + pitch * (1 - land / 2)
        for a in [a0] + [g0 + (g1 - g0) * s / seg for s in range(seg + 1)]:
            t = (a - g0) / (g1 - g0) if g0 <= a <= g1 else None
            bump = math.sqrt(max(0.0, 1 - (2 * t - 1) ** 2)) if t is not None else 0.0
            rr = radius + depth * bump if reeded else radius - depth * bump
            profile.append((rr * math.cos(a), rr * math.sin(a)))
    obj = _extrude(profile, height, name)
    if radius_top is not None:
        k = radius_top / radius
        for v in obj.data.vertices:
            s = 1 + (k - 1) * v.co.z / height
            v.co.x *= s
            v.co.y *= s
    _place(obj, at, rot)
    return kit.finish(obj, spec, tint, roughness, bevel, segments=2, grain="y")


def alpha_material(spec, tint=None, roughness=None):
    """kit.material plus the set's opacity.jpg wired to Alpha (sets with "alpha": true, e.g. cane).

    Returns (material, tile). Assign with obj.data.materials.append(m) after kit.finish(obj, spec, ...), or use
    cane_panel(). Holes survive kit.export: the glTF exporter packs basecolor + opacity into one RGBA PNG
    (alphaMode MASK, cutoff 0.5) even with export_image_format="JPEG"; the rest of the piece stays JPEG.
    """
    import json
    base, tile = kit.material(spec, tint, roughness)
    key = ("alpha", spec, tint, roughness)
    if key in kit._cache:
        return kit._cache[key]
    folder = kit.MATERIALS / spec
    if not json.loads((folder / "material.json").read_text()).get("alpha"):
        raise ValueError(f"{spec} has no opacity map")
    m = base.copy()
    m.name = f"{base.name}-alpha"
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    op = kit._image(nt, folder / "opacity.jpg", False)
    cut = nt.nodes.new("ShaderNodeMath")  # a hard threshold exports as alphaMode MASK (no sorting in the editor)
    cut.operation = "GREATER_THAN"
    cut.inputs[1].default_value = 0.5
    nt.links.new(op.outputs["Color"], cut.inputs[0])
    nt.links.new(cut.outputs["Value"], bsdf.inputs["Alpha"])
    m.surface_render_method = "DITHERED"
    m.use_backface_culling = False
    kit._cache[key] = (m, tile)
    return kit._cache[key]


def shrink_images(px=512):
    """Downscale every loaded texture before kit.export: each 1k set costs ~0.7 MB in the GLB, so a piece with
    more than ~3 textured finishes breaks the 3 MB budget. 512 px is plenty at furniture scale."""
    for img in bpy.data.images:
        if img.size[0] > px:
            img.scale(px, px)


def cane_panel(width, height, at, spec="cane", tint=None, rot=(0, 0, 0), name="cane"):
    """Flat cane webbing sheet in the XZ plane (faces -Y), `at` = bottom centre; frame it with kit.box rails."""
    obj = _extrude([(width / 2, 0.0005), (-width / 2, 0.0005), (-width / 2, -0.0005), (width / 2, -0.0005)], height, name)
    _place(obj, at, rot)
    kit.finish(obj, spec, tint, None, 0.0, smooth=False)
    m, _ = alpha_material(spec, tint)
    obj.data.materials.clear()
    obj.data.materials.append(m)
    return obj
