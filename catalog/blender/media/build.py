"""Media pieces for the varpet catalog (bpy, headless): TVs, speakers, consoles, turntable, projector, radio.

Run: Blender -b --factory-startup --python catalog/blender/media/build.py -- [slug ...|all]
Writes catalog/data/extra/bpy-media/<slug>.glb and merges entries.json by slug.
Metres, Z up, front -Y (export turns it into glTF +Z). TVs rest on a TV unit (placement "surface").
"""
import json
import math
import sys
from contextlib import contextmanager
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import kit_shapes  # noqa: E402
import parts as P  # noqa: E402

OUT = HERE.parents[1] / "data" / "extra" / "bpy-media"
PAINTING = HERE / "tex" / "painting.jpg"  # Met Open Access CC0: Aert van der Neer, Landscape at Sunset (437191)
SCREEN = "paint:#0b0c0f"
BEZEL = "paint:#141518"
DARK = "metal:#2a2b2e"
BLACKP = "paint:#121212"
WALNUT = "walnut"
GRILLE = "wool-felt"
PIECES = {}


def piece(slug, name, price, colors, materials, style, tags, kind, placement="surface", notes="", shrink=True):
    def deco(fn):
        PIECES[slug] = (fn, dict(name=name, kind=kind, price_amd=price, colors=colors, materials=materials,
                                 style=style, placement=placement, tags=["media"] + tags, notes=notes,
                                 shrink=shrink))
        return fn
    return deco


# ------------------------------------------------------------------ helpers
@contextmanager
def frame(M):
    """Everything created inside is moved by the 4x4 matrix M."""
    before = set(bpy.context.scene.objects)
    yield
    for o in bpy.context.scene.objects:
        if o not in before:
            o.matrix_basis = M @ o.matrix_basis


def front_cyl(r, depth, x, y, z, spec, roughness=None, verts=32, bevel=None):
    """Cylinder whose axis points -Y, back face at y."""
    return kit.cylinder(r, depth, (x, y, z), spec, verts=verts, bevel=min(0.002, r / 3) if bevel is None else bevel,
                        roughness=roughness, rot=(90, 0, 0))


def side_slab(outline, thick, x, spec, roughness=None, bevel=0.002, name="side"):
    """Outline (u=y, v=z) extruded `thick` along +X starting at x."""
    return P.slab(outline, thick, (x, 0, 0), spec, rot=(90, 0, 90), bevel=bevel, roughness=roughness, name=name)


def lit(obj, spec):
    """Swap an object's material for an emissive glow spec ("glow:#hex@strength")."""
    obj.data.materials.clear()
    obj.data.materials.append(P.glow(spec))
    return obj


def image_plane(w, h, center, img_path, emit=0.6, name="picture"):
    """Quad in the XZ plane facing -Y with 0..1 UVs, showing an image (base colour + emission)."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    cx, cy, cz = center
    vs = [bm.verts.new((cx + dx * w / 2, cy, cz + dz * h / 2)) for dx, dz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    for loop, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uvl].uv = uv
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(img_path), check_existing=True)
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = emit
    b.inputs["Roughness"].default_value = 0.35
    obj.data.materials.append(m)
    return obj


def driver(r, x, y, z, cone="paint:#161616", cap="paint:#222222", frame_spec="metal:#2c2c2e"):
    """Woofer on a baffle whose front face is at y: frame ring, rubber surround, paper cone, dust cap."""
    rot = P.aim((0, -1, 0))
    at = (x, y, z)
    P.revolve([(r * 1.12, 0.0), (r * 1.12, 0.003), (r * 1.02, 0.004), (r * 1.0, 0.002)], frame_spec, None, 48, at,
              0.35, rot=rot, caps=False, name="frame")
    roll = [(r * (1.0 - 0.08 * (1 - math.cos(math.pi * i / 6)) / 2), 0.002 + 0.006 * math.sin(math.pi * i / 6))
            for i in range(7)]
    P.revolve(roll + [(r * 0.33, -0.018 * r / 0.07)], cone, None, 48, at, 0.75, rot=rot, caps=False, name="cone")
    cr = r * 0.33
    P.revolve([(cr, -0.018 * r / 0.07)] + [(cr * math.cos(math.pi / 2 * i / 5), -0.018 * r / 0.07 + cr * 0.45 *
                                             math.sin(math.pi / 2 * i / 5)) for i in range(1, 6)],
              cap, None, 32, at, 0.3, rot=rot, caps=False, name="cap")


def tweeter(r, x, y, z):
    rot = P.aim((0, -1, 0))
    P.revolve([(r * 1.9, 0.0), (r * 1.9, 0.003), (r * 1.1, 0.004), (r * 1.05, 0.0)], "metal:#3a3a3c", None, 32,
              (x, y, z), 0.3, rot=rot, caps=False, name="tw-plate")
    P.revolve([(r * math.cos(math.pi / 2 * i / 6), r * 0.6 * math.sin(math.pi / 2 * i / 6)) for i in range(7)],
              "metal:#9c9c9c", None, 32, (x, y, z), 0.25, rot=rot, caps=False, name="dome")


def tube_between(p0, p1, r, spec, roughness=None, verts=16, name="leg"):
    return P.rod(p0, p1, r, r, spec, None, verts, roughness, name=name)


def controller(M, body="paint:#1b1b1b", accent="paint:#2a2a2a"):
    """Game controller lying flat, local origin at the bottom centre, front (triggers) toward +Y."""
    with frame(M):
        P.ellipsoid((0.058, 0.034, 0.016), (0, 0.004, 0.018), body, roughness=0.55, name="ctl-body")
        for s in (-1, 1):
            e = P.ellipsoid((0.024, 0.042, 0.017), (s * 0.048, -0.022, 0.017), body, roughness=0.55,
                            rot=(0, 0, s * 22), name="grip")
            P.ellipsoid((0.018, 0.008, 0.006), (s * 0.04, 0.036, 0.028), accent, roughness=0.4, name="bumper")
        for (x, y) in ((-0.03, 0.012), (0.017, -0.012)):
            kit.cylinder(0.011, 0.004, (x, y, 0.03), accent, bevel=0.001, roughness=0.5, name="stick-base")
            kit.cylinder(0.009, 0.008, (x, y, 0.033), BLACKP, bevel=0.0025, roughness=0.8, name="stick")
        for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            kit.box((0.005, 0.005, 0.003), (-0.017 + dx * 0.006, -0.012 + dy * 0.006, 0.031), accent, bevel=0.0008,
                    name="dpad")
        kit.box((0.012, 0.012, 0.003), (-0.017, -0.012, 0.031), accent, bevel=0.0008, name="dpad-c")
        for (dx, dy, c) in ((0, 1, "#5a8f5a"), (0, -1, "#b24a3a"), (1, 0, "#3a5fa0"), (-1, 0, "#c9a33a")):
            kit.cylinder(0.0038, 0.004, (0.032 + dx * 0.008, 0.012 + dy * 0.008, 0.03), f"paint:{c}", bevel=0.001,
                         roughness=0.35, verts=16, name="face-btn")


# ------------------------------------------------------------------ TVs
def _tv(diag_in, stand="feet", bezel=BEZEL, foot=DARK):
    sw = diag_in * 0.0254 * 16 / math.hypot(16, 9)
    sh = sw * 9 / 16
    W, H = sw + 0.012, sh + 0.006 + 0.014
    z0 = 0.055 if stand == "feet" else 0.075
    th = 0.024 if diag_in >= 50 else 0.03
    P.rbox((W, th, H), (0, 0, z0), bezel, r=0.003, roughness=0.4, name="panel")
    kit.box((sw, 0.0012, sh), (0, -th / 2, z0 + 0.014), SCREEN, bevel=0.0, roughness=0.2, name="screen")
    # chin: logo slug and an IR/status dot
    kit.box((0.05, 0.001, 0.004), (0, -th / 2 - 0.0005, z0 + 0.005), "metal:#8a8a8c", bevel=0.0, roughness=0.3,
            name="logo")
    kit.box((0.003, 0.001, 0.003), (W * 0.3, -th / 2 - 0.0005, z0 + 0.0055), "paint:#b3261e", bevel=0.0, name="led")
    # electronics hump on the back, lower two thirds
    P.rbox((W * 0.64, 0.035 if diag_in >= 50 else 0.045, H * 0.55), (0, th / 2 + 0.016, z0 + H * 0.1), bezel,
           r=0.012, roughness=0.5, name="hump")
    if stand == "feet":
        d = min(0.26, 0.12 + diag_in * 0.0022)
        top = z0 + 0.05
        out = [(-d * 0.55, 0.0), (d * 0.45, 0.0), (d * 0.45, 0.006), (0.009, top), (-0.009, top), (-d * 0.55, 0.006)]
        for s in (-1, 1):
            side_slab(out, 0.012, s * W * 0.37 - 0.006, foot, roughness=0.3, name="foot")
    else:
        bw, bd = max(0.36, W * 0.26), 0.26 if diag_in < 70 else 0.3
        P.rbox((bw, bd, 0.012), (0, 0.02, 0), foot, r=0.005, roughness=0.3, name="base")
        P.rbox((bw * 0.9, bd * 0.9, 0.006), (0, 0.02, 0.012), foot, r=0.004, roughness=0.25, name="base-step")
        P.rbox((0.09, 0.03, z0 + H * 0.3 - 0.018), (0, th / 2 + 0.03, 0.018), foot, r=0.006, roughness=0.3,
               name="neck")


TV_NOTE = "Rests on a TV unit or media console; front faces +Z"


@piece("tv-32-white-feet", "32 inch LED TV, white, on slim feet, 73x16x48 cm", 110000, ["white", "grey"],
       ["plastic", "aluminium"], "modern", ["tv", "television", "32 inch", "bedroom tv", "small tv"], "tv",
       notes=TV_NOTE)
def _tv32():
    _tv(32, "feet", bezel="paint:#e9e9e7", foot="metal:#bdbdbd")


@piece("tv-43-black-feet", "43 inch 4K TV, black, on blade feet", 180000, ["black"],
       ["plastic", "aluminium"], "modern", ["tv", "television", "43 inch", "4k", "smart tv"], "tv", notes=TV_NOTE)
def _tv43():
    _tv(43, "feet")


@piece("tv-55-black-feet", "55 inch 4K TV, black, on blade feet", 290000, ["black"],
       ["plastic", "aluminium"], "modern", ["tv", "television", "55 inch", "4k", "smart tv"], "tv", notes=TV_NOTE)
def _tv55():
    _tv(55, "feet")


@piece("tv-65-black-pedestal", "65 inch 4K OLED TV, black, on a centre pedestal stand", 420000, ["black", "grey"],
       ["glass", "aluminium"], "modern", ["tv", "television", "65 inch", "4k", "oled", "smart tv"], "tv",
       notes=TV_NOTE)
def _tv65():
    _tv(65, "pedestal")


@piece("tv-75-black-pedestal", "75 inch 4K TV, black, on a centre pedestal stand", 650000, ["black", "grey"],
       ["glass", "aluminium"], "modern", ["tv", "television", "75 inch", "4k", "big screen", "smart tv"], "tv",
       notes=TV_NOTE)
def _tv75():
    _tv(75, "pedestal")


@piece("tv-frame-55-easel-oak", "55 inch art-mode frame TV on an oak easel stand, showing a painting", 780000,
       ["brown", "beige"], ["oak", "aluminium", "glass"], "scandinavian",
       ["tv", "television", "frame tv", "art tv", "easel", "studio stand", "55 inch", "painting"], "tv",
       placement="floor", shrink=False,
       notes="Floor easel TV; screen shows Aert van der Neer, Landscape at Sunset (Met Open Access, CC0); "
             "front faces +Z")
def _tv_frame():
    sw = 55 * 0.0254 * 16 / math.hypot(16, 9)
    sh = sw * 9 / 16
    fw = 0.022  # oak frame width
    W, H, th = sw + 2 * fw, sh + 2 * fw, 0.026
    tilt = math.radians(8)
    ledge_z = 0.52
    M = Matrix.Translation((0, 0, ledge_z)) @ Matrix.Rotation(-tilt, 4, "X")
    with frame(M):
        P.rbox((sw, th, sh), (0, 0, fw), BEZEL, r=0.002, roughness=0.45, name="panel")
        # oak picture frame: four rails with mitred look (overlapping boxes)
        for z in (0, H - fw):
            kit.box((W, th + 0.004, fw), (0, 0, z), "oak-rift", bevel=0.002, name="rail")
        for s in (-1, 1):
            kit.box((fw, th + 0.004, sh), (s * (W - fw) / 2, 0, fw), "oak-rift", bevel=0.002, grain="y", name="stile")
        mat_b = 0.05
        kit.box((sw, 0.001, sh), (0, -th / 2 - 0.0005, fw), "paint:#efece4", bevel=0.0, roughness=0.8, name="mat")
        image_plane(sw - 2 * mat_b, sh - 2 * mat_b, (0, -th / 2 - 0.0012, fw + sh / 2), PAINTING, emit=0.55)
        # easel: two front legs in the tilted plane behind the panel, a ledge under the frame
        yb = th / 2 + 0.018
        for s in (-1, 1):
            zb = (yb * math.sin(tilt) - ledge_z) / math.cos(tilt)
            tube_between((s * 0.42, yb, zb), (s * 0.07, yb, H + 0.14), 0.017, "oak-rift", name="leg")
        kit.box((W * 0.72, 0.075, 0.022), (0, -0.01, -0.022), "oak-rift", bevel=0.003, name="ledge")
        kit.box((W * 0.72, 0.012, 0.03), (0, -0.045, -0.004), "oak-rift", bevel=0.003, name="lip")
        kit.box((0.2, 0.012, 0.06), (0, yb, H + 0.09), "oak-rift", bevel=0.003, name="top-cross")
    # rear leg from the top of the easel down to the floor behind
    top = M @ Vector((0, th / 2 + 0.03, H + 0.12))
    tube_between(tuple(top), (0, 0.62, 0.0), 0.016, "oak-rift", name="rear-leg")
    tube_between(tuple(M @ Vector((0, th / 2 + 0.03, 0.2))), (0, 0.42, 0.28), 0.01, "metal:#b8955e", name="stay")


# ------------------------------------------------------------------ speakers
@piece("soundbar-black-fabric", "Soundbar, black fabric wrap, 3.1 channel, 95 cm", 150000, ["black", "grey"],
       ["fabric", "plastic"], "modern", ["soundbar", "speaker", "tv audio", "home cinema"], "speaker",
       notes="Sits in front of a TV on a TV unit; front faces +Z")
def _soundbar():
    P.rbox((0.95, 0.105, 0.052), (0, 0, 0.006), GRILLE, "#3a3b3d", r=0.022, name="wrap")
    P.rbox((0.946, 0.101, 0.014), (0, 0, 0.05), "paint:#1a1a1b", r=0.006, roughness=0.3, name="top")
    P.rbox((0.9, 0.08, 0.008), (0, 0.004, 0), BLACKP, r=0.003, roughness=0.6, name="foot")
    for i, x in enumerate((0.3, 0.32, 0.34, 0.36)):
        kit.cylinder(0.0045, 0.0012, (x, 0.02, 0.064), "paint:#3a3a3a", bevel=0.0005, verts=16, name="btn")
    kit.box((0.06, 0.001, 0.002), (0, -0.0527, 0.012), "paint:#e6e6e6", bevel=0.0, name="led")


def _bookshelf(x):
    w, d, h = 0.17, 0.24, 0.3
    P.rbox((w, d, h), (x, 0, 0), WALNUT, r=0.006, name="cab")
    kit.box((w - 0.008, 0.008, h - 0.008), (x, -d / 2 - 0.002, 0.004), "paint:#161616", bevel=0.002, roughness=0.6,
            name="baffle")
    yf = -d / 2 - 0.006
    driver(0.062, x, yf, 0.115)
    tweeter(0.012, x, yf, 0.235)
    front_cyl(0.016, 0.004, x, yf, 0.03, "paint:#0a0a0a", 0.4)
    port = P.ring(0.016, 0.0, 0.002, "metal:#2c2c2e", center=(0, 0), n=32, name="port")
    port.rotation_euler = (math.radians(90), 0, 0)
    port.location = (x, yf - 0.004, 0.03)


@piece("speakers-bookshelf-walnut-pair", "Bookshelf speakers pair, walnut with black baffle", 220000,
       ["brown", "black"], ["walnut veneer", "mdf"], "mid-century",
       ["speaker", "speakers", "bookshelf speaker", "stereo", "hifi", "pair"], "speaker",
       notes="Pair of passive speakers for a shelf or TV unit; front faces +Z")
def _bookshelf_pair():
    for x in (-0.3, 0.3):
        _bookshelf(x)


def _tower(x):
    w, d, h = 0.2, 0.3, 0.98
    P.rbox((0.26, 0.34, 0.025), (x, 0.01, 0.028), BLACKP, r=0.006, roughness=0.4, name="plinth")
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.cylinder(0.009, 0.028, (x + sx * 0.11, 0.01 + sy * 0.15, 0), "metal:#2a2a2a", radius_top=0.012,
                         verts=16, bevel=0.001, name="spike")
    P.rbox((w, d, h), (x, 0, 0.053), WALNUT, r=0.006, name="cab")
    kit.box((w - 0.01, 0.008, h - 0.01), (x, -d / 2 - 0.002, 0.058), "paint:#161616", bevel=0.002, roughness=0.6,
            name="baffle")
    yf = -d / 2 - 0.006
    tweeter(0.013, x, yf, 0.053 + h - 0.075)
    driver(0.07, x, yf, 0.053 + h - 0.2)
    driver(0.07, x, yf, 0.053 + h - 0.38)
    front_cyl(0.02, 0.004, x, yf, 0.2, "paint:#0a0a0a", 0.4)


@piece("speakers-floorstanding-walnut-pair", "Floor-standing speakers pair, walnut, three-way, 105 cm", 520000,
       ["brown", "black"], ["walnut veneer", "mdf", "steel"], "mid-century",
       ["speaker", "speakers", "floor speaker", "tower speaker", "stereo", "hifi", "pair"], "speaker",
       placement="floor", notes="Pair of tower speakers on plinths with spikes; front faces +Z")
def _tower_pair():
    for x in (-0.32, 0.32):
        _tower(x)


@piece("subwoofer-black-30cm", "Subwoofer, matte black, 30 cm driver", 240000, ["black"], ["mdf", "plastic"],
       "modern", ["speaker", "subwoofer", "home cinema", "bass"], "speaker", placement="floor",
       notes="Floor subwoofer; front faces +Z")
def _sub():
    s = 0.36
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.cylinder(0.022, 0.02, (sx * 0.14, sy * 0.14, 0), "paint:#0e0e0e", bevel=0.003, verts=24, name="foot")
    P.rbox((s, s, s), (0, 0, 0.02), "paint:#161617", r=0.012, roughness=0.55, name="cab")
    driver(0.13, 0, -s / 2 - 0.001, 0.02 + s / 2, frame_spec="metal:#3a3a3c")
    kit.box((0.02, 0.001, 0.004), (0, -s / 2 - 0.001, 0.035), "metal:#9a9a9a", bevel=0.0, name="badge")


@piece("smart-speaker-grey-fabric", "Smart speaker, grey fabric with light ring", 60000, ["grey", "white"],
       ["fabric", "plastic"], "modern", ["speaker", "smart speaker", "voice assistant", "wifi speaker"], "speaker",
       notes="Small speaker for a shelf or side table; front faces +Z")
def _smart():
    r, h = 0.062, 0.165
    prof = [(0.0, 0.0), (r - 0.012, 0.0)] + [(r - 0.012 + 0.012 * math.sin(math.pi / 2 * i / 4),
                                              0.012 - 0.012 * math.cos(math.pi / 2 * i / 4)) for i in range(1, 5)]
    prof += [(r, h - 0.01), (r - 0.004, h - 0.002), (0.0, h - 0.002)]
    P.revolve(prof, "linen", "#9a9b9b", 64, name="body")
    P.revolve([(0.0, h - 0.003), (r - 0.005, h - 0.003), (r - 0.007, h), (0.0, h)], "paint:#dcdcda", None, 64,
              roughness=0.35, name="cap")
    P.ring(0.03, h + 0.0005, 0.0015, "glow:#8fd3ff@3", n=48, name="light")
    for x in (-0.012, 0.012):
        kit.cylinder(0.004, 0.0008, (x, 0, h), "paint:#b8b8b6", bevel=0.0003, verts=16, name="btn")


@piece("turntable-walnut", "Turntable, walnut plinth with aluminium platter and record", 190000,
       ["brown", "grey", "black"], ["walnut", "aluminium"], "mid-century",
       ["turntable", "record player", "vinyl", "hifi"], "speaker",
       notes="Record player for a sideboard; front faces +Z")
def _turntable():
    W, D = 0.43, 0.35
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.cylinder(0.024, 0.018, (sx * 0.17, sy * 0.13, 0), "paint:#161616", radius_top=0.026, bevel=0.003,
                         name="foot")
    P.rbox((W, D, 0.07), (0, 0, 0.018), WALNUT, r=0.006, name="plinth")
    zt = 0.088
    kit.box((W - 0.002, D - 0.002, 0.004), (0, 0, zt), "metal:#1d1d1e", bevel=0.001, roughness=0.35, name="deck")
    zt += 0.004
    cx, cy = -0.045, 0.005
    P.disc(0.15, 0.024, (cx, cy, zt), "metal:#c9c9c9", roughness=0.25, bevel=0.003, name="platter")
    P.disc(0.147, 0.003, (cx, cy, zt + 0.024), GRILLE, "#1a1a1a", bevel=0.001, name="mat")
    P.disc(0.1505, 0.002, (cx, cy, zt + 0.027), "paint:#0c0c0c", roughness=0.22, bevel=0.0005, name="record")
    for rr in (0.14, 0.12, 0.1, 0.08):
        P.ring(rr, zt + 0.0292, 0.0004, "paint:#1c1c1c", center=(cx, cy), n=64, roughness=0.5, name="groove")
    P.disc(0.05, 0.0006, (cx, cy, zt + 0.029), "paint:#c2482c", bevel=0.0, roughness=0.6, name="label")
    kit.cylinder(0.0035, 0.018, (cx, cy, zt + 0.02), "metal:#dcdcdc", verts=16, bevel=0.001, name="spindle")
    # tonearm
    px, py = 0.155, 0.1
    kit.cylinder(0.028, 0.012, (px, py, zt), "metal:#bdbdbd", bevel=0.002, name="arm-base")
    kit.cylinder(0.01, 0.035, (px, py, zt + 0.012), "metal:#8e8e8e", bevel=0.002, verts=24, name="pillar")
    za = zt + 0.042
    tip = Vector((cx + 0.03, cy - 0.125, zt + 0.036))
    piv = Vector((px, py, za))
    dirv = (tip - piv).normalized()
    tube_between(tuple(piv), tuple(tip - dirv * 0.03), 0.0035, "metal:#d6d6d6", roughness=0.2, name="arm")
    head = kit.box((0.016, 0.042, 0.006), (0, 0, 0), "paint:#1b1b1b", bevel=0.001, name="headshell")
    head.rotation_euler = (0, 0, math.atan2(dirv.y, dirv.x) - math.pi / 2)
    head.location = tuple(tip - dirv * 0.018 - Vector((0, 0, 0.004)))
    tube_between(tuple(piv), tuple(piv - dirv * 0.035), 0.0035, "metal:#d6d6d6", name="stub")
    tube_between(tuple(piv - dirv * 0.035), tuple(piv - dirv * 0.065), 0.013, "metal:#9a9a9a", roughness=0.3,
                 verts=24, name="counterweight")
    kit.cylinder(0.004, 0.034, (px - 0.01, py - 0.14, zt), "metal:#9a9a9a", verts=16, bevel=0.001, name="rest")
    # controls on the front-left of the deck
    front_cyl(0.011, 0.008, -0.17, -D / 2, 0.052, "metal:#cfcfcf", 0.25)
    for i, x in enumerate((-0.145, -0.125)):
        kit.box((0.014, 0.01, 0.004), (x - 0.02, -0.14, zt), "metal:#bdbdbd" if i else "paint:#1a1a1a", bevel=0.001,
                name="speed")
    kit.box((0.018, 0.018, 0.005), (0.17, -0.14, zt), "metal:#cfcfcf", bevel=0.002, name="start")


# ------------------------------------------------------------------ consoles
@piece("game-console-tower-black", "Game console, black tower style, with controller", 250000, ["black"],
       ["plastic"], "modern", ["game console", "console", "gaming", "controller"], "game_console",
       notes="Upright console for a TV unit, controller beside it; front faces +Z")
def _console_tower():
    s, h = 0.151, 0.301
    P.rbox((s, s, h), (0, 0, 0), "paint:#141414", r=0.004, roughness=0.6, name="body")
    P.disc(0.064, 0.002, (0, 0, h), "paint:#3a3b3c", roughness=0.45, bevel=0.001, name="grille")
    for i in range(-6, 7):
        for j in range(-6, 7):
            x, y = (i + 0.5 * (j % 2)) * 0.009, j * 0.0078
            if math.hypot(x, y) < 0.056:
                kit.cylinder(0.0032, 0.0008, (x, y, h + 0.0016), "paint:#050505", verts=8, bevel=0.0, name="vent")
    lit(front_cyl(0.007, 0.0015, -0.045, -s / 2, h - 0.03, BLACKP, verts=24, bevel=0.0005), "glow:#ffffff@2")
    kit.box((0.085, 0.001, 0.002), (0.018, -s / 2 - 0.0005, h - 0.08), "paint:#050505", bevel=0.0, name="slot")
    kit.box((0.012, 0.001, 0.005), (-0.05, -s / 2 - 0.0005, 0.03), "paint:#050505", bevel=0.0, name="usb")
    P.rbox((s - 0.02, s - 0.02, 0.006), (0, 0, 0), "paint:#0a0a0a", r=0.003, name="foot")
    controller(Matrix.Translation((0.17, -0.02, 0)) @ Matrix.Rotation(math.radians(-15), 4, "Z"))


@piece("game-console-flat-white", "Game console, slim flat white, with controller", 200000, ["white", "black"],
       ["plastic"], "modern", ["game console", "console", "gaming", "controller"], "game_console",
       notes="Flat console for a TV unit shelf, controller in front; front faces +Z")
def _console_flat():
    W, D = 0.29, 0.26
    P.rbox((W - 0.02, D - 0.02, 0.008), (0, 0, 0), "paint:#1a1a1a", r=0.004, name="foot")
    P.rbox((W, D, 0.018), (0, 0, 0.008), "paint:#ecebe8", r=0.006, roughness=0.35, name="lower")
    P.rbox((W - 0.006, D - 0.006, 0.006), (0, 0, 0.026), "paint:#121212", r=0.004, roughness=0.2, name="band")
    P.rbox((W, D, 0.016), (0, 0, 0.032), "paint:#ecebe8", r=0.006, roughness=0.35, name="upper")
    lit(kit.box((0.06, 0.001, 0.0025), (0.08, -D / 2 - 0.0005, 0.0285), BLACKP, bevel=0.0, name="light"),
        "glow:#6fb6ff@3")
    for x in (-0.11, -0.09):
        kit.box((0.012, 0.001, 0.003), (x, -D / 2 - 0.0005, 0.036), "paint:#bdbdbb", bevel=0.0, name="btn")
    controller(Matrix.Translation((0.03, -0.22, 0)) @ Matrix.Rotation(math.radians(8), 4, "Z"),
               body="paint:#e9e8e5", accent="paint:#1e1e1e")


# ------------------------------------------------------------------ projector, radio
@piece("projector-white-tripod", "Home projector, white, on a small tabletop tripod", 280000, ["white", "black"],
       ["plastic", "aluminium"], "modern", ["projector", "home cinema", "movie night", "beamer"], "tv",
       notes="Compact projector on a short tripod for a table or shelf; front faces +Z")
def _projector():
    hub_z = 0.16
    for k in range(3):
        a = math.radians(90 + 120 * k)
        tube_between((0.13 * math.cos(a), 0.13 * math.sin(a), 0.004), (0.012 * math.cos(a), 0.012 * math.sin(a),
                                                                        hub_z), 0.0065, "black-metal", name="leg")
        kit.cylinder(0.009, 0.008, (0.13 * math.cos(a), 0.13 * math.sin(a), 0), "paint:#111111", verts=16,
                     bevel=0.002, name="tip")
    kit.cylinder(0.02, 0.03, (0, 0, hub_z - 0.012), "black-metal", bevel=0.003, name="hub")
    kit.cylinder(0.008, 0.03, (0, 0, hub_z + 0.018), "metal:#3a3a3a", verts=16, name="column")
    kit.cylinder(0.03, 0.01, (0, 0, hub_z + 0.046), "black-metal", bevel=0.002, name="plate")
    z = hub_z + 0.056
    P.rbox((0.23, 0.22, 0.085), (0, 0, z), "paint:#efefed", r=0.022, roughness=0.4, name="body")
    P.rbox((0.232, 0.222, 0.012), (0, 0, z + 0.036), "paint:#2a2a2c", r=0.006, roughness=0.5, name="band")
    lx, lz = -0.055, z + 0.042
    front_cyl(0.034, 0.012, lx, -0.108, lz, "paint:#1b1b1b", 0.35)
    front_cyl(0.026, 0.004, lx, -0.12, lz, "paint:#0f1a24", 0.05)
    ring = P.ring(0.03, 0.0, 0.0015, "metal:#bdbdbd", n=48, name="lens-ring")
    ring.rotation_euler = (math.radians(90), 0, 0)
    ring.location = (lx, -0.121, lz)
    for i in range(7):
        kit.box((0.004, 0.001, 0.045), (0.035 + i * 0.01, -0.1105, z + 0.02), "paint:#9a9a9a", bevel=0.0,
                name="vent")
    kit.cylinder(0.005, 0.002, (0.08, 0.05, z + 0.085), "paint:#9a9a9a", verts=16, bevel=0.0, name="btn")


@piece("radio-retro-walnut", "Retro table radio, walnut case with fabric grille and dial", 45000,
       ["brown", "beige"], ["walnut", "fabric", "brass"], "retro",
       ["radio", "retro radio", "speaker", "bluetooth speaker", "vintage"], "speaker",
       notes="Tabletop radio for a shelf or kitchen counter; front faces +Z")
def _radio():
    W, D, H = 0.34, 0.14, 0.2
    for sx in (-1, 1):
        kit.box((0.04, D - 0.03, 0.008), (sx * 0.13, 0, 0), "paint:#2a1c12", bevel=0.002, name="foot")
    P.rbox((W, D, H), (0, 0, 0.008), WALNUT, r=0.02, name="case")
    yf = -D / 2
    kit.box((0.19, 0.004, 0.14), (-0.06, yf - 0.001, 0.038), "metal:#b8955e", bevel=0.002, roughness=0.3,
            name="grille-rim")
    kit.box((0.176, 0.004, 0.126), (-0.06, yf - 0.003, 0.045), "linen", "#cdb58c", bevel=0.001, name="grille")
    for i in range(5):
        kit.box((0.176, 0.002, 0.003), (-0.06, yf - 0.005, 0.06 + i * 0.024), "metal:#b8955e", bevel=0.0,
                roughness=0.3, name="bar")
    kit.box((0.1, 0.004, 0.06), (0.095, yf - 0.001, 0.12), "metal:#b8955e", bevel=0.002, roughness=0.3, name="dial-rim")
    kit.box((0.09, 0.002, 0.05), (0.095, yf - 0.004, 0.125), "paint:#efe3c2", bevel=0.0, roughness=0.3, name="dial")
    for i in range(10):
        kit.box((0.0012, 0.001, 0.006 if i % 2 else 0.01), (0.058 + i * 0.0082, yf - 0.0045, 0.14),
                "paint:#2a2a2a", bevel=0.0, name="tick")
    kit.box((0.0015, 0.001, 0.038), (0.1, yf - 0.005, 0.13), "paint:#b3261e", bevel=0.0, name="needle")
    for x in (0.07, 0.12):
        front_cyl(0.015, 0.012, x, yf, 0.07, "paint:#efe6d2", 0.35)
        front_cyl(0.011, 0.0025, x, yf - 0.012, 0.07, "metal:#b8955e", 0.3)
    P.tube([(-0.1, 0.0, 0.203), (-0.08, 0.0, 0.245), (0.08, 0.0, 0.245), (0.1, 0.0, 0.203)], 0.006, "leather-brown",
           name="handle")
    for x in (-0.1, 0.1):
        kit.cylinder(0.01, 0.006, (x, 0.0, 0.204), "metal:#b8955e", verts=24, bevel=0.002, name="lug")


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    slugs = list(PIECES) if not args or args == ["all"] else args
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "entries.json"
    entries = {e["slug"]: e for e in json.loads(mf.read_text())} if mf.exists() else {}
    for slug in slugs:
        fn, meta = PIECES[slug]
        kit.reset()
        P._glow.clear()
        fn()
        if meta["shrink"]:
            kit_shapes.shrink_images(512)
        res = kit.export(OUT / f"{slug}.glb", slug)
        entries[slug] = {"slug": slug, "name": meta["name"], "kind": meta["kind"],
                         "source_url": "generated:bpy", "license": "CC0 (generated by varpet)", "glb": f"{slug}.glb",
                         "size_m": res["size_m"], "mesh_extents_m": res["size_m"],
                         **{k: meta[k] for k in ("colors", "price_amd", "materials", "style", "placement", "tags",
                                                 "notes")},
                         "tris": res["tris"], "bytes": res["bytes"]}
        print(f"BUILT {slug} size={res['size_m']} tris={res['tris']} kb={res['bytes'] // 1024}", flush=True)
    order = list(PIECES)
    out = sorted((e for e in entries.values() if e["slug"] in order), key=lambda e: order.index(e["slug"]))
    mf.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


main()
