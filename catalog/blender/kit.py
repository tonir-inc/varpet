"""Shared toolkit for catalog pieces modelled with bpy (headless Blender).

A piece script builds in Blender units = metres, Z up, the piece's FRONT facing -Y (the exporter turns that
into glTF +Z, the editor's front), then calls export(). Lanes import this module read-only.

    import sys; sys.path.insert(0, "<repo>/catalog/blender"); import kit
    kit.reset()
    top = kit.box((1.2, 0.6, 0.03), (0, 0, 0.72), "oak", bevel=0.004)
    leg = kit.taper_leg(0.72, 0.028, 0.018, (0.5, 0.22, 0), "walnut", splay_deg=6)
    kit.export("out/table.glb")   # -> {"size_m": [w, d, h], "tris": n, "bytes": b}

Materials: ids from catalog/materials (oak walnut ash-light rattan linen boucle velvet wool-felt leather-brown
travertine marble-white brushed-steel black-metal painted-wood-matte white-laminate ...) or "paint:#rrggbb"
(plain PBR colour), "glass", "mirror", "ceramic:#rrggbb", "metal:#rrggbb". tint="#rrggbb" multiplies a
textured finish (materials are tint-ready greys; default tint = the material's default_color).
Run: /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python <script.py> -- <args>
"""
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

MATERIALS = Path(__file__).resolve().parents[1] / "materials"
_cache = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _cache.clear()


# ---------- materials ----------
def _principled(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    return m, bsdf


def _hex(c):
    c = c.lstrip("#")
    srgb = [int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in srgb]
    return (*lin, 1.0)


def material(spec, tint=None, roughness=None):
    """Return (bpy material, tile_m or None). Cached per (spec, tint, roughness)."""
    key = (spec, tint, roughness)
    if key in _cache:
        return _cache[key]
    kind, _, arg = spec.partition(":")
    tile = None
    if kind in ("paint", "ceramic", "metal"):
        m, b = _principled(spec)
        b.inputs["Base Color"].default_value = _hex(arg or "#cccccc")
        b.inputs["Roughness"].default_value = roughness if roughness is not None else {"paint": 0.6, "ceramic": 0.35, "metal": 0.3}[kind]
        b.inputs["Metallic"].default_value = 1.0 if kind == "metal" else 0.0
    elif kind == "glass":
        m, b = _principled("glass")
        b.inputs["Base Color"].default_value = (0.9, 0.95, 0.95, 1)
        b.inputs["Roughness"].default_value = 0.05
        b.inputs["Transmission Weight"].default_value = 1.0
        b.inputs["Alpha"].default_value = 0.25
        m.surface_render_method = "BLENDED"
    elif kind == "mirror":
        m, b = _principled("mirror")
        b.inputs["Base Color"].default_value = (0.95, 0.95, 0.95, 1)
        b.inputs["Metallic"].default_value = 1.0
        b.inputs["Roughness"].default_value = 0.02
    else:
        folder = MATERIALS / spec
        meta = json.loads((folder / "material.json").read_text())
        tile = meta["tile_m"]
        m, b = _principled(spec + (tint or ""))
        nt = m.node_tree
        img = lambda f, color: _image(nt, folder / f, color)
        base = img("basecolor.jpg", True)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(base.outputs["Color"], mix.inputs["A"])
        mix.inputs["B"].default_value = _hex(tint or meta["default_color"])
        nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
        rough = img("roughness.jpg", False)
        if roughness is None:
            nt.links.new(rough.outputs["Color"], b.inputs["Roughness"])
        else:
            b.inputs["Roughness"].default_value = roughness
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(img("normal.jpg", False).outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
        b.inputs["Metallic"].default_value = meta.get("metal", 0.0)
    _cache[key] = (m, tile)
    return _cache[key]


def _image(nt, path, color):
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = bpy.data.images.load(str(path), check_existing=True)
    n.image.colorspace_settings.name = "sRGB" if color else "Non-Color"
    return n


# ---------- geometry ----------
def _link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def finish(obj, spec, tint=None, roughness=None, bevel=0.0, segments=3, smooth=True, grain="x"):
    """Bevel, apply modifiers, UV-map in metres (cube projection at the material's tile size), assign material."""
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.harden_normals = False
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    mat, tile = material(spec, tint, roughness)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    if smooth:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
    if tile:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.cube_project(cube_size=tile, scale_to_bounds=False, correct_aspect=True)
        bpy.ops.object.mode_set(mode="OBJECT")
        if grain == "y":  # rotate UVs 90 degrees so the grain runs along Y
            for loop in obj.data.uv_layers.active.data:
                u, v = loop.uv
                loop.uv = (v, -u)
    return obj


def box(size, at, spec, tint=None, bevel=0.003, roughness=None, rot=(0, 0, 0), grain="x", name="box"):
    """Axis box of size (x, y, z); `at` is the BOTTOM CENTRE."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((0, 0, size[2] / 2)), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    obj = _link(bpy.data.objects.new(name, me))
    obj.location = at
    obj.rotation_euler = [math.radians(a) for a in rot]
    return finish(obj, spec, tint, roughness, bevel, grain=grain)


def cylinder(radius, height, at, spec, tint=None, radius_top=None, verts=48, bevel=0.002, roughness=None, rot=(0, 0, 0), name="cyl"):
    """Cylinder or cone standing on `at` (bottom centre); radius_top makes a taper."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=radius,
                          radius2=radius if radius_top is None else radius_top, depth=height)
    bmesh.ops.translate(bm, vec=Vector((0, 0, height / 2)), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    obj = _link(bpy.data.objects.new(name, me))
    obj.location = at
    obj.rotation_euler = [math.radians(a) for a in rot]
    return finish(obj, spec, tint, roughness, bevel, grain="y")


def taper_leg(height, r_top, r_bottom, at, spec, tint=None, splay_deg=0.0, toward=(0, 0)):
    """Mid-century tapered round leg; `at` is where it meets the underside; splays outward from `toward`."""
    leg = cylinder(r_bottom, height, (0, 0, 0), spec, tint, radius_top=r_top, verts=32, name="leg")
    leg.location = (at[0], at[1], at[2] - height)
    if splay_deg:
        dx, dy = at[0] - toward[0], at[1] - toward[1]
        n = math.hypot(dx, dy) or 1
        leg.rotation_euler = (math.radians(splay_deg) * dy / n, -math.radians(splay_deg) * dx / n, 0)
        leg.location = (at[0] + math.sin(math.radians(splay_deg)) * height * dx / n / 2,
                        at[1] + math.sin(math.radians(splay_deg)) * height * dy / n / 2, at[2] - height)
    return leg


def lathe(profile, spec, tint=None, at=(0, 0, 0), steps=64, roughness=None, name="lathe"):
    """Revolve a 2D profile [(radius, z), ...] (bottom to top, outer surface) around Z: vases, lamp bases, pots."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * i / steps), r * math.sin(2 * math.pi * i / steps), z)) for i in range(steps)]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(steps):
            bm.faces.new((a[i], a[(i + 1) % steps], b[(i + 1) % steps], b[i]))
    if profile[0][0] > 1e-4:
        bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = _link(bpy.data.objects.new(name, me))
    obj.location = at
    return finish(obj, spec, tint, roughness, 0.0, grain="y")


def cushion(size, at, spec, tint=None, puff=0.35, roughness=None, name="cushion"):
    """Soft upholstered block: subdivided box with rounded, slightly domed faces. `at` = bottom centre."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=6, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co
        k = 1 + puff * 0.25 * (1 - (2 * x) ** 2) * (1 - (2 * y) ** 2) * (1 - (2 * z) ** 2)
        v.co = Vector((x * size[0], y * size[1], z * size[2] * k + size[2] / 2))
    bm.to_mesh(me)
    bm.free()
    obj = _link(bpy.data.objects.new(name, me))
    obj.location = at
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = 2
    return finish(obj, spec, tint, roughness, 0.0)


def curve_tube(points, radius, spec, tint=None, closed=False, roughness=None, name="tube"):
    """Round tube along a polyline of 3D points (bent steel frames, rails, handles)."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 4
    sp = cu.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p, co in zip(sp.points, points):
        p.co = (*co, 1)
    sp.use_cyclic_u = closed
    obj = _link(bpy.data.objects.new(name, cu))
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return finish(bpy.context.view_layer.objects.active, spec, tint, roughness, 0.0)


def draped(width, drop, depth, at, spec, tint=None, folds=9, gathered=1.0, roughness=None, name="drape"):
    """Hanging fabric panel with vertical folds (curtains): width along X, drop down from `at` (TOP centre)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    nx, nz = max(24, folds * 8), 24
    grid = [[bm.verts.new((width * (i / nx - 0.5),
                            depth / 2 * math.sin(2 * math.pi * folds * i / nx) * (0.6 + 0.4 * gathered * (1 - j / nz)),
                            -drop * j / nz)) for i in range(nx + 1)] for j in range(nz + 1)]
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bm.to_mesh(me)
    bm.free()
    obj = _link(bpy.data.objects.new(name, me))
    obj.location = at
    sol = obj.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = 0.004
    return finish(obj, spec, tint, roughness, 0.0)


# ---------- export ----------
def meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def export(path, name=None):
    """Join all meshes, put the base at z=0 centred on x/y, export GLB (front -Y -> glTF +Z)."""
    objs = meshes()
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    # Every mesh needs a UV map with the same name before join, or glTF drops textured materials' UV link.
    for o in objs:
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
        o.data.uv_layers[0].name = "UVMap"
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name or Path(path).stem
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    shift = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for v in obj.data.vertices:
        v.co -= shift
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_image_format="JPEG", export_image_quality=85, export_yup=True)
    size = [round(hi.x - lo.x, 4), round(hi.y - lo.y, 4), round(hi.z - lo.z, 4)]
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    return {"size_m": size, "tris": tris, "bytes": Path(path).stat().st_size}
