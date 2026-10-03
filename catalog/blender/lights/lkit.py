"""Light-fitting toolkit: Ashot's kit.py + lighting2/parts.py (experimental/floor-plans-3d), trimmed, plus an
exporter that keeps named nodes instead of joining everything.

Build in Blender units = metres, Z up, front -Y (glTF export turns that into Y up, front +Z). Ceiling pieces are
built hanging from the origin (the ceiling attachment point, everything at z <= 0); wall pieces have the back of
the wall plate on y = 0 and the plate's centre at the origin. Every object goes into the node named by the
enclosing `with node("..."):` block; export() joins each node's objects into one mesh, parents them under an
empty root named after the slug and writes the root's custom properties as glTF extras.

Material specs: "paint:#hex", "metal:#hex", "ceramic:#hex", "glow:#hex@strength" (emissive, a lit opal or a
bulb), "lit:<texture>@strength[#hex]" (a textured shade with a warm constant glow), or a texture id from
catalog/materials (fetched from origin/main by git into out/materials, so the script runs on any branch).
"""
import contextlib
import json
import math
import subprocess
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
MATS = OUT / "materials"
AMBER = "#ffb46e"   # ~2700K tint for lit fabric and paper
_cache = {}
_node = ["body"]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _cache.clear()
    _node[0] = "body"


@contextlib.contextmanager
def node(name):
    prev, _node[0] = _node[0], name
    try:
        yield
    finally:
        _node[0] = prev


# ---------------------------------------------------------------- materials
def _hex(c):
    c = c.lstrip("#")
    srgb = [int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in srgb], 1.0)


def _principled(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def _texture_dir(tex):
    """catalog/materials/<tex> from origin/main, cached under out/materials (v2 has no catalog/materials)."""
    folder = MATS / tex
    if not (folder / "material.json").exists():
        folder.mkdir(parents=True, exist_ok=True)
        for f in ("material.json", "basecolor.jpg", "roughness.jpg", "normal.jpg"):
            blob = subprocess.run(["git", "-C", str(HERE), "show", f"origin/main:catalog/materials/{tex}/{f}"],
                                  check=True, capture_output=True).stdout
            (folder / f).write_bytes(blob)
    return folder


def _image(nt, path, color):
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = bpy.data.images.load(str(path), check_existing=True)
    n.image.colorspace_settings.name = "sRGB" if color else "Non-Color"
    return n


def material(spec, tint=None, roughness=None):
    """(material, tile_m or None), cached per (spec, tint, roughness)."""
    key = (spec, tint, roughness)
    if key in _cache:
        return _cache[key]
    kind, _, arg = spec.partition(":")
    tile = None
    if kind in ("paint", "ceramic", "metal"):
        m, b = _principled(spec + (f"~{roughness}" if roughness is not None else ""))
        b.inputs["Base Color"].default_value = _hex(arg or "#cccccc")
        b.inputs["Roughness"].default_value = roughness if roughness is not None else {"paint": 0.6, "ceramic": 0.35, "metal": 0.3}[kind]
        b.inputs["Metallic"].default_value = 1.0 if kind == "metal" else 0.0
    elif kind == "glow":
        hexc, _, s = arg.partition("@")
        m, b = _principled(spec)
        b.inputs["Base Color"].default_value = tuple(0.55 * c + 0.45 * w for c, w in zip(_hex(hexc), _hex("#f6f1e8")))
        b.inputs["Roughness"].default_value = 0.35
        b.inputs["Emission Color"].default_value = _hex(hexc)
        b.inputs["Emission Strength"].default_value = float(s or 1.0)
    elif kind == "lit":
        body, _, rest = arg.partition("@")
        s, _, hexc = rest.partition("#")
        base, tile = material(body, tint, roughness)
        m = base.copy()
        m.name = f"{spec}{tint or ''}"
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Emission Color"].default_value = _hex("#" + hexc if hexc else AMBER)
        b.inputs["Emission Strength"].default_value = float(s or 0.4)
    else:
        folder = _texture_dir(spec)
        meta = json.loads((folder / "material.json").read_text())
        tile = meta["tile_m"]
        m, b = _principled(spec + (tint or ""))
        nt = m.node_tree
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(_image(nt, folder / "basecolor.jpg", True).outputs["Color"], mix.inputs["A"])
        mix.inputs["B"].default_value = _hex(tint or meta["default_color"])
        nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
        if roughness is None:
            nt.links.new(_image(nt, folder / "roughness.jpg", False).outputs["Color"], b.inputs["Roughness"])
        else:
            b.inputs["Roughness"].default_value = roughness
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(_image(nt, folder / "normal.jpg", False).outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
        b.inputs["Metallic"].default_value = meta.get("metal", 0.0)
    _cache[key] = (m, tile)
    return _cache[key]


def tile_of(spec):
    if spec.startswith("lit:"):
        spec = spec[4:].partition("@")[0]
    return None if spec.partition(":")[0] in ("paint", "ceramic", "metal", "glow") else material(spec)[1]


# ---------------------------------------------------------------- geometry
def _link(obj):
    bpy.context.scene.collection.objects.link(obj)
    obj["node"] = _node[0]
    return obj


def _select(obj):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def dress(obj, spec, tint=None, roughness=None, smooth=40):
    _select(obj)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.clear()
    obj.data.materials.append(material(spec, tint, roughness)[0])
    if smooth:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(smooth))
    return obj


def aim(direction):
    """Rotation matrix taking +Z to `direction`."""
    return Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized()).to_matrix()


def revolve(profile, spec, tint=None, steps=48, at=(0, 0, 0), roughness=None, warp=None, rot=None, caps=True,
            uv_r=None, smooth=40, name="revolve"):
    """Revolve [(r, z), ...] around Z, bottom to top. r == 0 closes to a point; caps=False leaves ends open.
    warp(theta, z) -> fractional radius change (ribs). Cylindrical UVs in metres at the texture's tile."""
    tile = tile_of(spec) or 1.0
    R = uv_r or max(r for r, _ in profile)
    s_acc = [0.0]
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        s_acc.append(s_acc[-1] + math.hypot(r1 - r0, z1 - z0))
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    rings = []
    for r, z in profile:
        if r < 1e-6:
            v = bm.verts.new((0, 0, z))
            rings.append([v] * (steps + 1))
            continue
        ring = []
        for i in range(steps + 1):
            a = 2 * math.pi * (i % steps) / steps
            rr = r * (1 + (warp(a, z) if warp else 0.0))
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(steps):
            quad = [(a[i], (k, i)), (a[i + 1], (k, i + 1)), (b[i + 1], (k + 1, i + 1)), (b[i], (k + 1, i))]
            seen, fv = set(), []
            for v, key in quad:
                if v not in seen:
                    seen.add(v)
                    fv.append((v, key))
            if len(fv) < 3:
                continue
            f = bm.faces.new([v for v, _ in fv])
            for loop, (_, (kk, ii)) in zip(f.loops, fv):
                loop[uvl].uv = (2 * math.pi * R * ii / steps / tile, s_acc[kk] / tile)
    for k in (0, len(rings) - 1):
        ring = rings[k]
        if ring[0] is ring[1] or not caps:
            continue
        f = bm.faces.new(ring[:steps])
        for loop, v in zip(f.loops, ring[:steps]):
            loop[uvl].uv = (v.co.x / tile, v.co.y / tile)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if rot is not None:
        bm.transform(rot.to_4x4())
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return dress(_link(bpy.data.objects.new(name, me)), spec, tint, roughness, smooth)


def shade(profile, spec, inner, tint=None, t=0.003, warp=None, steps=64, at=(0, 0, 0), rot=None, roughness=None,
          name="shade"):
    """Open shade: outer skin in `spec`, a lit inner skin `t` inside it (seen from below)."""
    revolve(profile, spec, tint, steps, at, roughness, warp, rot, caps=False, name=name)
    ip = [(max(r - t, 0.0), z) for r, z in profile]
    return revolve(ip, inner, None, steps, at, None, warp, rot, caps=False, name=name + "-in")


def rod(p0, p1, r0, r1, spec, tint=None, verts=16, roughness=None, name="rod"):
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0
    return revolve([(r0, 0.0), (r1, axis.length)], spec, tint, verts, p0, roughness, rot=aim(axis),
                   uv_r=max(r0, r1), smooth=50, name=name)


def tube(points, radius, spec, tint=None, roughness=None, sides=8, closed=False, name="tube"):
    """Round tube along a 3D polyline (arms, hoops); capped when open."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = max(0, sides // 4 - 1)
    cu.use_fill_caps = not closed
    sp = cu.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p, co in zip(sp.points, points):
        p.co = (*co, 1)
    sp.use_cyclic_u = closed
    obj = _link(bpy.data.objects.new(name, cu))
    _select(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    obj["node"] = _node[0]
    obj.data.uv_layers.new(name="UVMap")
    return dress(obj, spec, tint, roughness, 50)


def ring(r, z, radius, spec, n=48, roughness=None, sides=8, center=(0, 0), name="ring"):
    pts = [(center[0] + r * math.cos(2 * math.pi * i / n), center[1] + r * math.sin(2 * math.pi * i / n), z)
           for i in range(n)]
    return tube(pts, radius, spec, roughness=roughness, sides=sides, closed=True, name=name)


def sphere(r, center, spec, tint=None, roughness=None, steps=32, name="sphere"):
    n = max(8, steps // 2)
    prof = [(r * math.sin(math.pi * i / n), -r * math.cos(math.pi * i / n)) for i in range(n + 1)]
    return revolve(prof, spec, tint, steps, center, roughness, name=name)


def disc(r, h, at, spec, tint=None, roughness=None, bevel=0.004, steps=48, name="disc"):
    """Round plate with softened edges; `at` is the bottom centre."""
    b = min(bevel, h / 2)
    prof = [(0.0, 0.0), (r - b, 0.0)]
    prof += [(r - b + b * math.sin(math.pi / 2 * i / 3), b - b * math.cos(math.pi / 2 * i / 3)) for i in range(1, 4)]
    prof += [(r - b + b * math.cos(math.pi / 2 * i / 3), h - b + b * math.sin(math.pi / 2 * i / 3)) for i in range(0, 4)]
    prof += [(0.0, h)]
    return revolve(prof, spec, tint, steps, at, roughness, name=name)


def box(size, at, spec, tint=None, roughness=None, name="box"):
    """Axis box of size (x, y, z); `at` is the bottom centre."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(at) + Vector((0, 0, size[2] / 2)), verts=bm.verts)
    uvl = bm.loops.layers.uv.new("UVMap")
    tile = tile_of(spec) or 1.0
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        u, v = [(1, 2), (0, 2), (0, 1)][ax]
        for loop in f.loops:
            loop[uvl].uv = (loop.vert.co[u] / tile, loop.vert.co[v] / tile)
    bm.to_mesh(me)
    bm.free()
    return dress(_link(bpy.data.objects.new(name, me)), spec, tint, roughness, 0)


def shrink_images(px=512):
    for img in bpy.data.images:
        if img.size[0] > px:
            img.scale(px, px)


# ---------------------------------------------------------------- export
def _bounds(objs):
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def export(path, slug, origins, extras):
    """Join each node's objects, put each node's origin at origins[name] (default (0,0,0)), parent all under an
    empty root `slug`, write the GLB. Returns size [w, d, h] (Blender x, y, z), bounds, tris and bytes."""
    shrink_images()
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in objs:
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
        o.data.uv_layers[0].name = "UVMap"
    groups = {}
    for o in objs:
        groups.setdefault(o["node"], []).append(o)
    root = bpy.data.objects.new(slug, None)
    bpy.context.scene.collection.objects.link(root)
    for k, v in extras.items():
        root[k] = v
    nodes = []
    for name, members in groups.items():
        for o in bpy.context.selected_objects:
            o.select_set(False)
        for o in members:
            o.select_set(True)
        bpy.context.view_layer.objects.active = members[0]
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if len(members) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = obj.data.name = name
        origin = Vector(origins.get(name, (0, 0, 0)))
        obj.data.transform(Matrix.Translation(-origin))
        obj.location = origin
        obj.parent = root
        del obj["node"]
        nodes.append(obj)
    bpy.context.view_layer.update()
    lo, hi = _bounds(nodes)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in nodes + [root]:
        o.select_set(True)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_extras=True,
                              export_image_format="JPEG", export_image_quality=82, export_yup=True)
    size = [round(hi.x - lo.x, 4), round(hi.y - lo.y, 4), round(hi.z - lo.z, 4)]
    tris = sum(len(p.vertices) - 2 for o in nodes for p in o.data.polygons)
    return {"size_m": size, "lo": list(lo), "hi": list(hi), "tris": tris, "bytes": Path(path).stat().st_size,
            "nodes": sorted(groups)}
