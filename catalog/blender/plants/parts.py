"""Plant-lane primitives on top of kit.py (read-only): mesh builder, leaves, tapered tubes, UV lathes, and
procedural textures made with numpy (leaf atlases with veins + normal maps, terracotta, concrete, seagrass,
soil). Metres, Z up, front faces -Y.

Every leaf of a species goes into one Builder (one object, one material), so a 1000-leaf olive stays fast.
"""
import math
import random
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402

TEX = Path(tempfile.gettempdir()) / "varpet-bpy-plants-tex"
TEX.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------- colour + noise
def rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def lin(h):
    return kit._hex(h)


def vnoise(h, w, cy, cx, rng, wrap_x=False):
    """Smooth value noise in [0,1], cy x cx cells over an h x w image (wrap_x tiles horizontally)."""
    g = rng.random((cy + 2, cx + 2))
    if wrap_x:
        g[:, cx] = g[:, 0]
        g[:, cx + 1] = g[:, 1]
    y = np.linspace(0, cy, h, endpoint=False)
    x = np.linspace(0, cx, w, endpoint=False)
    y0, x0 = y.astype(int), x.astype(int)
    fy, fx = y - y0, x - x0
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0]
    b = g[y0][:, x0 + 1]
    c = g[y0 + 1][:, x0]
    d = g[y0 + 1][:, x0 + 1]
    fx, fy = fx[None, :], fy[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(h, w, cy, cx, rng, octaves=4, wrap_x=False):
    out, amp, tot = np.zeros((h, w)), 1.0, 0.0
    for o in range(octaves):
        out += amp * vnoise(h, w, cy * 2 ** o, cx * 2 ** o, rng, wrap_x)
        tot += amp
        amp *= 0.5
    return out / tot


def normal_from_height(hgt, strength=2.0):
    gy, gx = np.gradient(hgt)
    n = np.dstack((-gx * strength * hgt.shape[1] / 256, -gy * strength * hgt.shape[0] / 256, np.ones_like(hgt)))
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def image(name, arr, color=True):
    """numpy (H, W, 3|4) in [0,1] (row 0 = v 0) -> packed bpy image. RGB images export as JPEG, RGBA as PNG."""
    h, w, c = arr.shape
    im = bpy.data.images.new(name, w, h, alpha=(c == 4))
    if c == 3:
        arr = np.dstack((arr, np.ones((h, w))))
    im.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
    im.filepath_raw = str(TEX / f"{name}.png")
    im.file_format = "PNG"
    im.save()
    im.colorspace_settings.name = "sRGB" if color else "Non-Color"
    im.pack()
    return im


# ---------------------------------------------------------------- materials
def mat(name, color="#808080", tex=None, normal=None, nstrength=1.0, rough=0.5, alpha=False, rough_tex=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = rough
    if tex is None:
        b.inputs["Base Color"].default_value = lin(color)
    else:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = tex
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        if alpha:
            cut = nt.nodes.new("ShaderNodeMath")
            cut.operation = "GREATER_THAN"
            cut.inputs[1].default_value = 0.5
            nt.links.new(t.outputs["Alpha"], cut.inputs[0])
            nt.links.new(cut.outputs["Value"], b.inputs["Alpha"])
            m.surface_render_method = "DITHERED"
    if rough_tex is not None:
        r = nt.nodes.new("ShaderNodeTexImage")
        r.image = rough_tex
        nt.links.new(r.outputs["Color"], b.inputs["Roughness"])
    if normal is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = normal
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = nstrength
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    m.use_backface_culling = False
    return m


# ---------------------------------------------------------------- mesh builder
class Builder:
    """Accumulates verts (with per-vertex UV) and faces; obj() makes one mesh object with one material."""

    def __init__(self):
        self.P, self.UV, self.F = [], [], []

    def add(self, p, uv=(0, 0)):
        self.P.append(tuple(p))
        self.UV.append(tuple(uv))
        return len(self.P) - 1

    def grid(self, P, UV, flip=False):
        nu, nv = len(P), len(P[0])
        base = len(self.P)
        for i in range(nu):
            for j in range(nv):
                self.P.append(tuple(P[i][j]))
                self.UV.append(tuple(UV[i][j]))
        for i in range(nu - 1):
            for j in range(nv - 1):
                a = base + i * nv + j
                q = (a, a + 1, a + nv + 1, a + nv)
                self.F.append(q[::-1] if flip else q)
        return base

    def obj(self, name, material, smooth=True):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.P, [], self.F)
        me.validate()
        uv = me.uv_layers.new(name="UVMap")
        vi = np.empty(len(me.loops), dtype=np.int64)
        me.loops.foreach_get("vertex_index", vi)
        uv.data.foreach_set("uv", np.asarray(self.UV, dtype=np.float32)[vi].ravel())
        me.polygons.foreach_set("use_smooth", [smooth] * len(me.polygons))
        me.materials.append(material)
        return kit._link(bpy.data.objects.new(name, me))


# ---------------------------------------------------------------- curves
def catmull(ctrl, n=6):
    """Catmull-Rom through control points -> dense list of Vectors."""
    c = [Vector(p) for p in ctrl]
    if len(c) < 3:
        return [c[0].lerp(c[-1], i / n) for i in range(n + 1)]
    c = [2 * c[0] - c[1]] + c + [2 * c[-1] - c[-2]]
    out = []
    for i in range(1, len(c) - 2):
        p0, p1, p2, p3 = c[i - 1], c[i], c[i + 1], c[i + 2]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(c[-2])
    return out


def resample(pts, step):
    """Even arc-length spacing."""
    d = [0.0]
    for a, b in zip(pts, pts[1:]):
        d.append(d[-1] + (b - a).length)
    n = max(2, int(d[-1] / step) + 1)
    out, j = [], 0
    for k in range(n):
        s = d[-1] * k / (n - 1)
        while j < len(d) - 2 and d[j + 1] < s:
            j += 1
        seg = d[j + 1] - d[j] or 1
        out.append(pts[j].lerp(pts[j + 1], (s - d[j]) / seg))
    return out


def frames(pts):
    tang = []
    n = len(pts)
    for i in range(n):
        t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        tang.append(t.normalized() if t.length > 1e-9 else Vector((0, 0, 1)))
    ref = Vector((0, 0, 1)) if abs(tang[0].z) < 0.9 else Vector((1, 0, 0))
    nor = tang[0].cross(ref).normalized()
    out = []
    for i in range(n):
        if i:
            nor = tang[i - 1].rotation_difference(tang[i]) @ nor
        out.append((tang[i], nor, tang[i].cross(nor)))
    return out


def tube(B, pts, radius, sides=8, cap_end=True, v_scale=4.0, jitter=None, rng=None):
    """Tapered tube along pts. radius: float or f(t in 0..1). jitter adds knobbly bark (fraction of radius)."""
    pts = [Vector(p) for p in pts]
    fr = frames(pts)
    n = len(pts)
    L = sum((b - a).length for a, b in zip(pts, pts[1:])) or 1
    rows, uvs, acc = [], [], 0.0
    for i, (p, (t, nor, bi)) in enumerate(zip(pts, fr)):
        if i:
            acc += (p - pts[i - 1]).length
        tt = min(1.0, acc / L)
        r = radius(tt) if callable(radius) else radius
        ring, ruv = [], []
        for k in range(sides + 1):
            a = 2 * math.pi * k / sides
            rr = r
            if jitter and rng is not None and k < sides:
                rr *= 1 + jitter * (rng.random() - 0.5)
            ring.append(p + rr * (math.cos(a) * nor + math.sin(a) * bi))
            ruv.append((k / sides, acc * v_scale))
        if jitter:
            ring[-1] = ring[0]
        rows.append(ring)
        uvs.append(ruv)
    B.grid(rows, uvs, flip=True)
    if cap_end:
        c = B.add(pts[-1] + fr[-1][0] * (radius(1.0) if callable(radius) else radius) * 0.5, (0.5, acc * v_scale))
        base = len(B.P) - 1 - (sides + 1)
        for k in range(sides):
            B.F.append((base + k, base + k + 1, c))
    return pts


def point_on(pts, t):
    """Point and tangent at fraction t of a polyline (by index)."""
    x = t * (len(pts) - 1)
    i = min(int(x), len(pts) - 2)
    f = x - i
    p = pts[i].lerp(pts[i + 1], f)
    return p, (pts[i + 1] - pts[i]).normalized()


# ---------------------------------------------------------------- leaves
def leaf(B, base, direction, length, width, outline, nu=12, nv=5, bend=0.5, cup=0.1, fold=0.0, twist=0.0,
         roll=0.0, wave=0.0, wave_n=6, variant=0, nvar=1, tip_curl=0.0, side_bend=0.0, up=None, thick=0.0):
    """One leaf blade as a grid. `direction` = initial midrib direction (any 3D vector; its elevation is the
    leaf's pitch), bend = radians the midrib droops by the tip, outline(s) = half-width fraction at s in 0..1,
    cup = edge lift (fraction of width), fold = V along the midrib (fraction), twist/roll in radians,
    wave = margin undulation (fraction of width). UV: u = s, v = across in variant row `variant` of `nvar`."""
    d = Vector(direction).normalized()
    upv = Vector(up) if up is not None else Vector((0, 0, 1))
    side = d.cross(upv)
    if side.length < 1e-6:
        side = d.cross(Vector((1, 0, 0)))
    side.normalize()
    # midrib: rotate direction about the side axis progressively (droop), plus a sideways sweep
    pts, tans = [Vector(base)], []
    p = Vector(base)
    ds = length / (nu - 1)
    for i in range(nu):
        s = i / (nu - 1)
        ang = -bend * s ** 1.3 - tip_curl * max(0.0, s - 0.7) / 0.3
        t = (Matrix.Rotation(ang, 3, side) @ d)
        t = Matrix.Rotation(side_bend * s, 3, upv) @ t
        tans.append(t.normalized())
        if i:
            p = p + tans[i - 1].lerp(tans[i], 0.5) * ds
            pts.append(p.copy())
    hw = width / 2
    for sign in ((1, -1) if thick else (0,)):
        rows, uvs = _blade_rows(pts, tans, side, upv, nu, nv, hw, outline, roll, twist, cup, fold, wave, wave_n,
                                variant, nvar, thick * sign)
        B.grid(rows, uvs, flip=sign < 0)
    return pts, tans


def _blade_rows(pts, tans, side, upv, nu, nv, hw, outline, roll, twist, cup, fold, wave, wave_n, variant, nvar, thick):
    rows, uvs = [], []
    for i in range(nu):
        s = i / (nu - 1)
        t = tans[i]
        sd = Matrix.Rotation(roll + twist * s, 3, t) @ side
        sd = (sd - t * sd.dot(t)).normalized()
        nrm = sd.cross(t).normalized()
        if nrm.dot(upv) < 0 and abs(t.dot(upv)) < 0.95:
            nrm = -nrm
        w = max(outline(s), 0.0)
        row, ruv = [], []
        for j in range(nv):
            v = j / (nv - 1)
            y = (v - 0.5) * 2
            off = sd * (y * hw * w)
            lift = (cup * (y * y) + fold * abs(y)) * hw * max(w, 0.15)
            lift += wave * hw * w * math.sin(s * math.pi * wave_n + (1.7 if y > 0 else 0)) * y * y
            lift += thick * hw * w * (1 - y * y) ** 0.7
            row.append(pts[i] + off + nrm * lift)
            ruv.append((0.004 + 0.992 * s, (variant + 0.02 + 0.96 * v) / nvar))
        rows.append(row)
        uvs.append(ruv)
    return rows, uvs


def strip_leaf(B, base, direction, length, width, nu=6, bend=0.6, fold=0.35, variant=0, nvar=1, twist=0.0,
               outline=None, up=None):
    """Narrow 3-column leaf (olive, palm leaflet, grass): V-folded along the midrib."""
    return leaf(B, base, direction, length, width, outline or (lambda s: math.sin(math.pi * min(1, s * 1.05)) ** 0.6 + 0.02),
                nu=nu, nv=3, bend=bend, cup=0.0, fold=fold, twist=twist, variant=variant, nvar=nvar, up=up)


# ---------------------------------------------------------------- leaf textures
def leaf_texture(name, variants, W=1024, TH=512, n_veins=10, vein_k=0.35, vein_p=1.0, vein_w=0.05, vein_amt=0.35,
                 mid_w=0.018, mid_amt=0.8, edge=0.0, margin_col=None, margin_w=0.0, mottle=0.12, seed=1,
                 paint=None, alpha_fn=None, gloss_spec=None, nstrength=3.0, vein_depth=1.0):
    """Leaf atlas, one row per variant: u along the midrib, v across (0.5 = midrib).

    variants: list of dicts with base (hex), vein (hex), mid (hex). Lateral veins leave the midrib and curve
    toward the tip (s = s0 + vein_k*|t|^vein_p). paint(S, T, rgb, rng) may recolour; alpha_fn(S, T, row) -> 0/1
    array cuts holes (monstera). Returns (colour image, normal image)."""
    rng = np.random.default_rng(seed)
    rows_rgb, rows_h, rows_a = [], [], []
    for k, var in enumerate(variants):
        s = np.linspace(0, 1, W)[None, :].repeat(TH, 0)
        t = (np.linspace(0, 1, TH)[:, None].repeat(W, 1) - 0.5)
        at = np.abs(t)
        base, vein, mid = rgb(var["base"]), rgb(var["vein"]), rgb(var["mid"])
        n1 = fbm(TH, W, 4, 8, rng, 4)
        col = base[None, None, :] * (1 - mottle + 2 * mottle * n1[..., None])
        # lateral veins
        phase = (s - vein_k * (at * 2) ** vein_p) * n_veins
        dv = np.abs(phase - np.round(phase))
        vmask = np.exp(-(dv / vein_w) ** 2) * np.clip(1 - (at * 2) ** 3, 0, 1) * (s > 0.03)
        # finer secondary network
        n2 = fbm(TH, W, 24, 48, rng, 2)
        fine = np.exp(-((n2 - 0.5) / 0.02) ** 2) * 0.35
        mw = mid_w * (1.2 - 0.9 * s)
        mmask = np.exp(-(t / mw) ** 2)
        col = col * (1 - vein_amt * vmask[..., None]) + vein[None, None, :] * (vein_amt * vmask[..., None])
        col = col * (1 - 0.15 * fine[..., None]) + vein * 0.15 * fine[..., None]
        col = col * (1 - mid_amt * mmask[..., None]) + mid[None, None, :] * (mid_amt * mmask[..., None])
        if edge:
            col *= (1 - edge * np.clip((at * 2 - 0.85) / 0.15, 0, 1))[..., None]
        if margin_col is not None and margin_w:
            mm = np.clip((at * 2 - (1 - margin_w)) / 0.03, 0, 1)[..., None]
            col = col * (1 - mm) + rgb(margin_col) * mm
        if paint is not None:
            col = paint(s, t, col, rng, k)
        # height: veins sunken, blade puffed between veins, midrib raised
        hgt = (0.5 - vein_depth * 0.5 * vmask - 0.1 * fine + 0.6 * mmask + 0.05 * n1)
        rows_rgb.append(col)
        rows_h.append(hgt)
        if alpha_fn is not None:
            rows_a.append(alpha_fn(s, t, k))
    col = np.vstack(rows_rgb)
    hgt = np.vstack(rows_h)
    if alpha_fn is not None:
        col = np.dstack((col, np.vstack(rows_a)))
    return image(name, col), image(name + "-n", normal_from_height(hgt, nstrength), color=False)


# ---------------------------------------------------------------- surface textures
def texture_terracotta(name, seed=3, base="#b8663f"):
    rng = np.random.default_rng(seed)
    H, W = 256, 512
    n = fbm(H, W, 4, 8, rng, 5, wrap_x=True)
    streak = vnoise(H, W, 2, 40, rng, wrap_x=True)
    b = rgb(base)
    col = b * (0.82 + 0.3 * n[..., None]) * (0.95 + 0.08 * streak[..., None])
    salt = (rng.random((H, W)) > 0.996)[..., None]  # mineral bloom specks
    col = col * (1 - 0.6 * salt) + np.array([0.86, 0.8, 0.72]) * 0.6 * salt
    return image(name, col)


def texture_concrete(name, seed=4, base="#9c9a94"):
    rng = np.random.default_rng(seed)
    H, W = 256, 512
    n = fbm(H, W, 6, 12, rng, 5, wrap_x=True)
    pores = (rng.random((H, W)) > 0.985).astype(float)
    col = rgb(base) * (0.85 + 0.25 * n[..., None]) * (1 - 0.45 * pores[..., None])
    return image(name, col)


def texture_speckle(name, base, seed=5, amt=0.06, dots=0.004):
    """Matte stoneware: subtle mottling + iron specks."""
    rng = np.random.default_rng(seed)
    H, W = 256, 512
    n = fbm(H, W, 4, 8, rng, 4, wrap_x=True)
    d = (rng.random((H, W)) < dots)[..., None]
    col = rgb(base) * (1 - amt + 2 * amt * n[..., None])
    col = col * (1 - 0.55 * d) + rgb("#3b2e25") * 0.55 * d
    return image(name, col)


def texture_soil(name, seed=6, perlite=True):
    rng = np.random.default_rng(seed)
    H = W = 256
    n = fbm(H, W, 8, 8, rng, 5)
    grit = rng.random((H, W))
    col = rgb("#3b2a1e") * (0.55 + 0.7 * n[..., None]) * (0.8 + 0.4 * grit[..., None])
    bark = (vnoise(H, W, 40, 40, rng) > 0.8)[..., None]
    col = col * (1 - 0.6 * bark) + rgb("#6b4a30") * 0.6 * bark
    if perlite:
        p = (rng.random((H, W)) > 0.994)
        p = p | np.roll(p, 1, 0) | np.roll(p, 1, 1)
        col[p] = rgb("#e8e4dc")
    return image(name, col)


def texture_moss(name, seed=7):
    rng = np.random.default_rng(seed)
    H = W = 256
    n = fbm(H, W, 10, 10, rng, 5)
    g = rng.random((H, W))
    col = rgb("#3b5424") * (0.5 + 0.7 * n[..., None]) * (0.85 + 0.3 * g[..., None])
    return image(name, col)


def texture_bark(name, base="#6d6457", seed=8, fissure=0.5):
    """Vertical fissured bark (v along the branch)."""
    rng = np.random.default_rng(seed)
    H, W = 512, 256
    n = fbm(H, W, 16, 4, rng, 4, wrap_x=True)
    f = vnoise(H, W, 6, 24, rng, wrap_x=True)
    col = rgb(base) * (0.75 + 0.45 * n[..., None]) * (1 - fissure * np.clip((0.35 - f) / 0.2, 0, 1)[..., None])
    return image(name, col)


# ---------------------------------------------------------------- pots
def lathe(B, profile, steps=48, u_rep=1.0, v_scale=2.0, disp=None):
    """Revolve [(r, z), ...] around Z into B with cylindrical UV (u = angle * u_rep, v = arc length * v_scale).
    disp(theta, z) -> radial offset (woven baskets)."""
    acc = [0.0]
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        acc.append(acc[-1] + math.hypot(r1 - r0, z1 - z0))
    rows, uvs = [], []
    for (r, z), a in zip(profile, acc):
        row, ruv = [], []
        for k in range(steps + 1):
            th = 2 * math.pi * k / steps
            rr = r + (disp(th, z) if disp and r > 1e-4 else 0.0)
            row.append((rr * math.cos(th), rr * math.sin(th), z))
            ruv.append((k / steps * u_rep, a * v_scale))
        rows.append(row)
        uvs.append(ruv)
    B.grid(rows, uvs, flip=True)


def pot(style, r_top, h, r_bot=None, wall=0.012, soil_drop=0.025, steps=64, soil=True, seed=1, tint=None, cover="soil"):
    """Planter standing on z=0 with soil. Returns (soil z, inner radius at the soil line).
    styles: terracotta, ceramic (matte, rounded), concrete (straight cylinder), basket (seagrass weave),
    black (matte black ceramic), bowl (low glazed dish)."""
    r_bot = r_bot if r_bot is not None else r_top * 0.8
    B = Builder()
    if style == "terracotta":
        band = h * 0.16
        lip = min(0.008, r_top * 0.05)
        rb = r_top - (r_top - r_bot) * band / h
        prof = [(0, 0.004), (r_bot - 0.006, 0), (r_bot, 0.006), (rb - lip * 0.5, h - band), (rb + lip, h - band + 0.002),
                (r_top + lip, h - 0.006), (r_top + lip * 0.75, h), (r_top - wall, h), (r_top - wall - 0.004, h - band),
                (r_bot - wall, 0.02), (0, 0.02)]
        m = mat("terracotta", tex=texture_terracotta("terracotta", seed, tint or "#b8663f"), rough=0.88)
    elif style == "concrete":
        prof = [(0, 0), (r_bot - 0.008, 0), (r_bot, 0.008), (r_top, h - 0.006), (r_top - 0.004, h), (r_top - wall, h),
                (r_top - wall, h - 0.05), (r_bot - wall, 0.03), (0, 0.03)]
        m = mat("concrete", tex=texture_concrete("concrete", seed, tint or "#9c9a94"), rough=0.92)
    elif style in ("ceramic", "black"):
        base = tint or ("#2a2a2a" if style == "black" else "#e9e5dd")
        bulge = r_top * 1.04
        prof = [(0, 0.002), (r_bot * 0.85, 0), (r_bot * 0.97, 0.01)]
        for i in range(1, 9):
            f = i / 8
            r = r_bot + (bulge - r_bot) * math.sin(f * math.pi / 2) ** 0.8
            prof.append((r, 0.01 + (h - 0.03) * f))
        prof += [(bulge - 0.002, h - 0.006), (bulge - 0.008, h), (bulge - wall, h - 0.002), (bulge - wall - 0.003, h - 0.05),
                 (r_bot - wall, 0.03), (0, 0.03)]
        r_top = bulge
        m = mat(style, tex=texture_speckle(style, base, seed, 0.05 if style == "ceramic" else 0.08, 0.003 if style == "ceramic" else 0.0),
                rough=0.55 if style == "ceramic" else 0.6)
    elif style == "basket":
        rows_n = max(8, int(h / 0.018))
        pitch = h / rows_n
        cols = 22

        def weave(th, z):
            if z > h - 0.02:
                return 0.0
            row = int(z / pitch)
            fz = (z / pitch) % 1
            bump = math.sin(math.pi * fz) ** 0.6
            over = 0.5 + 0.5 * math.cos(th * cols + row * math.pi)
            return 0.004 * bump * (0.5 + 0.5 * over)

        prof = [(0, 0), (r_bot - 0.01, 0), (r_bot, 0.01)]
        nz = rows_n * 4
        for i in range(1, nz):
            f = i / nz
            prof.append((r_bot + (r_top - r_bot) * math.sin(f * math.pi / 2) ** 0.7, 0.01 + (h - 0.03) * f))
        prof += [(r_top + 0.006, h - 0.02), (r_top + 0.008, h - 0.008), (r_top + 0.002, h), (r_top - 0.012, h),
                 (r_top - 0.016, h - 0.02), (r_bot - 0.012, 0.03), (0, 0.03)]
        H, W = 512, 1024
        rng = np.random.default_rng(seed)
        v = np.linspace(0, 1, H)[:, None]
        u = np.linspace(0, 1, W)[None, :]
        zz = v * h
        fz = (zz / pitch) % 1
        row = np.floor(zz / pitch)
        over = 0.5 + 0.5 * np.cos(u * 2 * np.pi * cols + row * np.pi)
        twist = 0.5 + 0.5 * np.sin((u * 2 * np.pi * cols * 3 + fz * 6) + row)
        shade = (np.sin(np.pi * fz) ** 0.5) * (0.65 + 0.35 * over) * (0.85 + 0.15 * twist)
        n = fbm(H, W, 8, 32, rng, 3, wrap_x=True)
        col = rgb(tint or "#b99a68")[None, None, :] * (0.35 + 0.75 * shade[..., None]) * (0.85 + 0.3 * n[..., None])
        m = mat("seagrass", tex=image("seagrass", col), rough=0.9)
        lathe(B, prof, steps=128, disp=weave)
        # v in lathe = arc length; remap to z/h for the texture
        for i, (p, uvv) in enumerate(zip(B.P, B.UV)):
            B.UV[i] = (uvv[0], p[2] / h)
        B.obj("pot", m)
        if soil:
            _soil(r_top - 0.016, h - soil_drop, seed, cover)
        return h - soil_drop, r_top - 0.016
    elif style == "bowl":
        prof = [(0, 0.012), (r_bot, 0.012), (r_bot, 0), (r_bot + 0.01, 0), (r_bot + 0.012, 0.012)]
        for i in range(1, 7):
            f = i / 6
            prof.append((r_bot + 0.012 + (r_top - r_bot - 0.012) * math.sin(f * math.pi / 2), 0.012 + (h - 0.012) * f ** 0.8))
        prof += [(r_top - 0.003, h + 0.002), (r_top - wall, h), (r_bot + 0.01, 0.022), (0, 0.022)]
        m = mat("bowl", tex=texture_speckle("bowl", tint or "#5b4a3e", seed, 0.12, 0.0), rough=0.25)
    else:
        raise ValueError(style)
    lathe(B, prof, steps=steps, v_scale=1.0)
    B.obj("pot", m)
    inner = r_top - wall - 0.004
    if soil:
        _soil(inner, h - soil_drop, seed, cover)
    return h - soil_drop, inner


def _soil(r, z, seed=1, cover="soil"):
    """Slightly lumpy soil disc (polar grid) at height z."""
    rng = random.Random(seed)
    B = Builder()
    nr, nt = 5, 40
    bumps = [[rng.uniform(-1, 1) for _ in range(nt)] for _ in range(nr + 1)]
    rows, uvs = [], []
    for i in range(nr + 1):
        f = i / nr
        row, ruv = [], []
        for k in range(nt + 1):
            th = 2 * math.pi * k / nt
            rr = r * f * 1.02
            dz = 0.004 * bumps[i][k % nt] * (1 - f * 0.5) + 0.006 * (1 - f * f)
            row.append((rr * math.cos(th), rr * math.sin(th), z + dz))
            ruv.append((0.5 + 0.5 * f * math.cos(th), 0.5 + 0.5 * f * math.sin(th)))
        rows.append(row)
        uvs.append(ruv)
    B.grid(rows, uvs, flip=True)
    tex = {"moss": texture_moss, "gravel": texture_gravel, "soil": texture_soil}[cover](cover + str(seed), seed)
    B.obj("soil", mat(cover + str(seed), tex=tex, rough=0.95))


def rng_for(slug):
    return random.Random(sum(ord(c) * (i + 1) for i, c in enumerate(slug)))


def fib_dir(i, n, spread=1.0):
    """Golden-angle azimuth for the i-th of n organs."""
    return i * 2.39996323


def texture_gravel(name, seed=9, base="#b9b2a6"):
    """Fine decorative grit for succulent pots: Voronoi-ish pebbles from thresholded noise."""
    rng = np.random.default_rng(seed)
    H = W = 256
    n = vnoise(H, W, 48, 48, rng)
    m = vnoise(H, W, 48, 48, rng)
    col = rgb(base) * (0.6 + 0.6 * n[..., None]) * (0.75 + 0.35 * (m[..., None] > 0.45))
    return image(name, col)
