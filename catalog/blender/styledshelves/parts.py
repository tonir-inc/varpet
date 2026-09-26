"""Styled-shelves primitives on top of kit.py / kit_shapes.py (both read-only).

Metres, Z up, front faces -Y. Two ideas keep a fully dressed bookcase under budget:
- Batch: every book, frame, leaf and small box of a piece goes into ONE bmesh as 12-tri boxes / 4-tri leaves
  with UVs into generated atlases (tex/ss-books.png: 64 spines with cover and page-edge swatches;
  tex/ss-art.png: 8 framed prints + 8 picture-book covers). One object, a handful of materials.
- Wood parts use kit.box plus grain_uv (per-face planar UVs with U along the part's grain).
"""
import math
import random
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import kit

HERE = Path(__file__).resolve().parent
TEX = HERE / "tex"
RIFT = "oak-rift"
OAK = "#b48d63"
WALNUT = "#7a5238"
BLACK = "metal:#1d1d1e"
BRASS = "metal:#b8955a"
BOOK_COLS, BOOK_ROWS, BOOK_PX = 16, 4, 1024          # 64 cells of 64 x 256 px
ART_COLS, ART_PX = 4, 512                            # 16 cells of 128 px
_mats = {}


def reset():
    kit.reset()
    _mats.clear()


# ================================================================== atlases
def _hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


SPINE_PALETTE = ["#b8894a", "#9a4e32", "#8a9a7b", "#6b6a45", "#2f3d52", "#56606b", "#e5dcc8", "#4e5d4a",
                 "#33312f", "#b0664a", "#b98b82", "#3d4f3f", "#6d2f33", "#c49b3f", "#1f1e1d", "#9c948a",
                 "#c2a57f", "#3f6466", "#7d6b5a", "#a7a08c", "#4a3b35", "#8c3f3a", "#8b5a3c", "#5b6e7a"]
INKS = {"gold": "#c9a45c", "cream": "#efe6d2", "dark": "#262320", "white": "#f4f1ea"}


def _save_png(arr, path):
    """arr: (h, w, 3) floats, row 0 = image BOTTOM (Blender pixel order)."""
    h, w, _ = arr.shape
    rgba = np.concatenate([np.clip(arr, 0, 1), np.ones((h, w, 1))], axis=2).astype(np.float32)
    im = bpy.data.images.new(path.stem, w, h)
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = str(path)
    im.file_format = "PNG"
    im.save()
    bpy.data.images.remove(im)


def _books_png():
    path = TEX / "ss-books.png"
    if path.exists():
        return path
    TEX.mkdir(exist_ok=True)
    rng = np.random.default_rng(7)
    rnd = random.Random(7)
    img = np.zeros((BOOK_PX, BOOK_PX, 3))
    cw, ch = BOOK_PX // BOOK_COLS, BOOK_PX // BOOK_ROWS
    for c in range(BOOK_COLS):
        for r in range(BOOK_ROWS):
            base = _hexrgb(rnd.choice(SPINE_PALETTE))
            light = base.mean() > 0.6
            ink = _hexrgb(INKS["dark"] if light else INKS[rnd.choice(["gold", "cream", "white", "gold"])])
            cell = np.ones((ch, cw, 3)) * base
            cell *= 1 + 0.05 * (rng.random((ch, cw, 1)) - 0.5)                # cloth tooth
            cell *= 1 + 0.03 * np.sin(np.arange(ch) * 1.7)[:, None, None]
            sp = cell[:, :48]
            design = rnd.randrange(5)
            if design == 0:      # cloth hardback, gilt bands
                for v0 in (228, 234, 20, 26):
                    sp[v0:v0 + 2, 3:45] = ink
            elif design == 1:    # paperback with a colour block at the head and a publisher mark
                sp[190:, :] = _hexrgb(rnd.choice(SPINE_PALETTE)) * (1 + 0.04 * (rng.random((ch - 190, 48, 1)) - 0.5))
                sp[12:22, 19:29] = ink
            elif design == 2:    # leather label
                lab = _hexrgb(rnd.choice(["#d8c7a0", "#1f1e1d", "#6d2f33", "#c9a45c"]))
                sp[165:212, 6:42] = lab
                sp[166:167, 6:42] = sp[210:211, 6:42] = ink
            elif design == 3:    # two-tone
                sp[:70, :] = _hexrgb(rnd.choice(SPINE_PALETTE))
            else:                # plain, big title
                pass
            # title: vertical run of word dashes down the spine centre
            tink = _hexrgb(INKS["dark"]) if (design == 2 and lab.mean() > 0.5) else ink
            lo, hi = {0: (60, 210), 1: (70, 180), 2: (170, 207), 3: (85, 220), 4: (50, 225)}[design]
            v, wdt = hi, rnd.choice([4, 5, 6, 7])
            while v > lo:
                seg = rnd.randint(6, 28)
                sp[max(lo, v - seg):v, 24 - wdt // 2:24 + (wdt + 1) // 2] = tink
                v -= seg + rnd.randint(3, 6)
            if design != 2:  # author, smaller
                v = lo - 8
                for _ in range(2):
                    seg = rnd.randint(5, 12)
                    sp[max(34, v - seg):v, 22:26] = tink
                    v -= seg + 4
            # cover swatch (u 48..63, v 0..127) stays the base colour; page edge (v 128..255)
            pg = cell[128:, 48:]
            pg[:] = _hexrgb("#ece3cf") * (1 - 0.06 * rng.random((1, 16, 1)))  # page lines along the depth
            pg[:, :2] = base
            pg[:, 14:] = base
            pg[:4, :] = base
            img[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = cell
    _save_png(img, path)
    return path


def _grid(n):
    y, x = np.mgrid[0:n, 0:n] / (n - 1)
    return x, y  # y = 0 at the bottom


def _art_cell(k, rng):
    n = 128
    x, y = _grid(n)
    c = lambda h: _hexrgb(h)
    img = np.ones((n, n, 3))
    if k == 0:    # muted landscape
        img[:] = c("#dfe3de") * (1 - y[..., None]) * 0.1 + c("#e8e1d2")
        img[((x - 0.68) ** 2 + (y - 0.7) ** 2) < 0.012] = c("#e2b58a")
        for i, (base, col) in enumerate([(0.55, "#a9b39a"), (0.42, "#7f8c6e"), (0.28, "#5c6a50")]):
            img[y < base + 0.07 * np.sin(x * (5 + i) + i * 1.3)] = c(col)
    elif k == 1:  # abstract shapes
        img[:] = c("#eee7da")
        img[((x - 0.38) ** 2 + (y - 0.58) ** 2) < 0.05] = c("#b9694a")
        arch = (np.abs(x - 0.64) < 0.16) & (y < 0.52) & (y > 0.15) | (((x - 0.64) ** 2 + (y - 0.52) ** 2) < 0.0256)
        img[arch & (y > 0.15)] = c("#8a9a7b")
        img[(np.abs(y - 0.3) < 0.008) & (x > 0.15) & (x < 0.85)] = c("#2d2b28")
    elif k == 2:  # black and white seascape
        img[:] = (0.55 + 0.35 * y[..., None]) * np.ones(3)
        img[y < 0.42] = (0.28 + 0.2 * y[y < 0.42][..., None]) * np.ones(3)
        img += 0.03 * (rng.random((n, n, 1)) - 0.5)
    elif k == 3:  # botanical line drawing
        img[:] = c("#efe9dc")
        img[(np.abs(x - 0.5 - 0.05 * np.sin(y * 6)) < 0.008) & (y > 0.12) & (y < 0.85)] = c("#3d4f3f")
        for i, t in enumerate(np.linspace(0.25, 0.78, 6)):
            s = 1 if i % 2 else -1
            cx, cy = 0.5 + s * 0.12, t
            img[(((x - cx) / 0.11) ** 2 + ((y - cy) / 0.045) ** 2) < 1] = c("#5f7358")
    elif k == 4:  # arch print
        img[:] = c("#e6dac6")
        img[(np.abs(x - 0.5) < 0.22) & (y < 0.55) & (y > 0.12) | (((x - 0.5) ** 2 + (y - 0.55) ** 2) < 0.0484) & (y >= 0.55)] = c("#a95f3e")
        img[(np.abs(x - 0.5) < 0.1) & (y > 0.12) & (y < 0.45)] = c("#d9b98f")
    elif k == 5:  # b/w portrait blur
        img[:] = 0.72 * np.ones(3)
        img[((x - 0.5) ** 2 / 0.02 + (y - 0.6) ** 2 / 0.03) < 1] = 0.3 * np.ones(3)
        img[(((x - 0.5) / 0.38) ** 2 + ((y - 0.08) / 0.3) ** 2) < 1] = 0.22 * np.ones(3)
        img += 0.04 * (rng.random((n, n, 1)) - 0.5)
    elif k == 6:  # mountains
        img[:] = c("#dcdde2") + 0.05 * y[..., None]
        ridge = 0.35 + 0.3 * np.maximum(0, 1 - np.abs(x - 0.4) * 3.2) + 0.18 * np.maximum(0, 1 - np.abs(x - 0.78) * 4)
        img[y < ridge] = c("#7d7f8c")
        img[(y < ridge) & (y > ridge - 0.07) & (ridge > 0.5)] = c("#f1f1f1")
        img[y < 0.3 + 0.03 * np.sin(x * 9)] = c("#5d6152")
    else:         # warm sepia snapshot
        img[:] = c("#b99f7c") * (0.8 + 0.25 * y[..., None])
        for cx, cy, r in ((0.35, 0.45, 0.09), (0.62, 0.5, 0.1), (0.5, 0.2, 0.25)):
            img[((x - cx) ** 2 + (y - cy) ** 2) < r * r] = c("#6e5a44")
    if k in (0, 1, 3, 4, 6):  # passe-partout mat
        m = 0.11
        img[(x < m) | (x > 1 - m) | (y < m) | (y > 1 - m)] = c("#f5f2ea")
    return img


KID_BG = ["#e9c46a", "#9cc5b8", "#e8a598", "#a8c3de", "#f0dcb4", "#b6c99b", "#d9b8d6", "#f2b880"]


def _kid_cell(k, rng):
    n = 128
    x, y = _grid(n)
    c = lambda h: _hexrgb(h)
    img = np.ones((n, n, 3)) * c(KID_BG[k])
    ink = c("#3a3433")
    fg = [c("#e76f51"), c("#2a6f97"), c("#f4a261"), c("#43aa8b"), c("#bc4749"), c("#577590"), c("#f6bd60"), c("#8e5572")][k]
    shape = k % 4
    if shape == 0:    # sun / big circle
        img[((x - 0.5) ** 2 + (y - 0.4) ** 2) < 0.06] = fg
    elif shape == 1:  # bear head
        for cx, cy, r in ((0.5, 0.38, 0.22), (0.33, 0.58, 0.08), (0.67, 0.58, 0.08)):
            img[((x - cx) ** 2 + (y - cy) ** 2) < r * r] = fg
        for cx in (0.43, 0.57):
            img[((x - cx) ** 2 + (y - 0.42) ** 2) < 0.0006] = ink
    elif shape == 2:  # house
        img[(np.abs(x - 0.5) < 0.2) & (y > 0.12) & (y < 0.4)] = fg
        img[(y >= 0.4) & (y < 0.62 - np.abs(x - 0.5) * 1.1)] = ink * 0.5 + fg * 0.5
    else:             # tree + hill
        img[y < 0.18 + 0.05 * np.sin(x * 5)] = c("#6a994e")
        img[(np.abs(x - 0.5) < 0.03) & (y < 0.42)] = c("#7f5539")
        img[((x - 0.5) ** 2 + (y - 0.5) ** 2) < 0.03] = fg
    img[(y > 0.74) & (y < 0.92) & (x > 0.12) & (x < 0.88)] = c("#fbf6ec")      # title band
    for i, (a, b) in enumerate(((0.17, 0.42), (0.47, 0.6), (0.65, 0.83))):
        img[(y > 0.8) & (y < 0.86) & (x > a) & (x < b)] = ink
    return img


def _art_png():
    path = TEX / "ss-art.png"
    if path.exists():
        return path
    TEX.mkdir(exist_ok=True)
    rng = np.random.default_rng(3)
    img = np.zeros((ART_PX, ART_PX, 3))
    n = ART_PX // ART_COLS
    for k in range(16):
        cell = _art_cell(k, rng) if k < 8 else _kid_cell(k - 8, rng)
        r, c = divmod(k, ART_COLS)
        img[r * n:(r + 1) * n, c * n:(c + 1) * n] = cell
    _save_png(img, path)
    return path


def mat(spec, tint=None, roughness=None):
    key = (spec, tint, roughness)
    if key in _mats:
        return _mats[key]
    if spec.startswith("atlas:"):
        which = spec.split(":")[1]
        png = _books_png() if which == "books" else _art_png()
        m = bpy.data.materials.new("ss-" + which)
        m.use_nodes = True
        nt = m.node_tree
        b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(str(png), check_existing=True)
        t.image.name = "ss-" + which
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.78 if which == "books" else 0.6
    else:
        m = kit.material(spec, tint, roughness)[0]
    _mats[key] = m
    return m


def shrink_images(px=512):
    """kit_shapes.shrink_images, but leaves the ss- atlases at full size (spines need the pixels)."""
    for img in bpy.data.images:
        if not img.name.startswith("ss-") and img.size[0] > px:
            img.scale(px, px)


def book_rects(cell):
    """(spine, cover, page) UV rects of atlas cell 0..63, inset 1.5 px against mip bleed."""
    c, r = cell % BOOK_COLS, (cell // BOOK_COLS) % BOOK_ROWS
    P, e = BOOK_PX, 1.5
    u0, v0 = c * 64, r * 256
    R = lambda a, b, cc, d: ((u0 + a + e) / P, (v0 + b + e) / P, (u0 + cc - e) / P, (v0 + d - e) / P)
    return R(0, 0, 48, 256), R(48, 0, 64, 128), R(48, 128, 64, 256)


def art_rect(k):
    n = ART_PX // ART_COLS
    r, c = divmod(k, ART_COLS)
    e = 1.5
    return ((c * n + e) / ART_PX, (r * n + e) / ART_PX, ((c + 1) * n - e) / ART_PX, ((r + 1) * n - e) / ART_PX)


# ================================================================== batch
# local unit-box corners per face, each (corner signs (sx, sy, sz01), (s, t)) in CCW order seen from outside
_FACES = {
    "-y": [((-1, -1, 0), (0, 0)), ((1, -1, 0), (1, 0)), ((1, -1, 1), (1, 1)), ((-1, -1, 1), (0, 1))],
    "+y": [((1, 1, 0), (0, 0)), ((-1, 1, 0), (1, 0)), ((-1, 1, 1), (1, 1)), ((1, 1, 1), (0, 1))],
    "-x": [((-1, 1, 0), (0, 0)), ((-1, -1, 0), (1, 0)), ((-1, -1, 1), (1, 1)), ((-1, 1, 1), (0, 1))],
    "+x": [((1, -1, 0), (0, 0)), ((1, 1, 0), (1, 0)), ((1, 1, 1), (1, 1)), ((1, -1, 1), (0, 1))],
    "+z": [((-1, -1, 1), (0, 0)), ((1, -1, 1), (1, 0)), ((1, 1, 1), (1, 1)), ((-1, 1, 1), (0, 1))],
    "-z": [((-1, 1, 0), (0, 0)), ((1, 1, 0), (1, 0)), ((1, -1, 0), (1, 1)), ((-1, -1, 0), (0, 1))],
}


def M(x=0.0, y=0.0, z=0.0, yaw=0.0, tilt_x=0.0, tilt_y=0.0):
    """Translation @ Rz(yaw) @ Rx(tilt_x) @ Ry(tilt_y), angles in degrees."""
    return (Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(yaw), 4, "Z")
            @ Matrix.Rotation(math.radians(tilt_x), 4, "X") @ Matrix.Rotation(math.radians(tilt_y), 4, "Y"))


class Batch:
    """Accumulates low-poly parts into one mesh with per-face materials and atlas UVs."""

    def __init__(self, name="dressing"):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.slots = []
        self.tris = 0

    def slot(self, spec, tint=None):
        key = (spec, tint)
        if key not in self.slots:
            self.slots.append(key)
        return self.slots.index(key)

    def box(self, size, T, faces, default=None):
        """size (x, y, z), bottom centre at local origin, placed by matrix T. faces: {"-y": (spec, rect|None)}
        with "*" as fallback; a spec may be a (spec, tint) tuple."""
        sx, sy, sz = size[0] / 2, size[1] / 2, size[2]
        for key, corners in _FACES.items():
            f = faces.get(key, faces.get("*", default))
            if f is None:
                continue
            spec, rect = f
            idx = self.slot(*spec) if isinstance(spec, tuple) else self.slot(spec)
            vs = [self.bm.verts.new(T @ Vector((a * sx, b * sy, c * sz))) for (a, b, c), _ in corners]
            face = self.bm.faces.new(vs)
            face.material_index = idx
            for loop, (_, (s, t)) in zip(face.loops, corners):
                if rect:
                    loop[self.uv].uv = (rect[0] + s * (rect[2] - rect[0]), rect[1] + t * (rect[3] - rect[1]))
            self.tris += 2

    def poly(self, pts, spec, smooth=False):
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        f.material_index = self.slot(*spec) if isinstance(spec, tuple) else self.slot(spec)
        f.smooth = smooth
        self.tris += len(pts) - 2
        return f

    def flush(self):
        if not self.bm.faces:
            self.bm.free()
            return None
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for spec, tint in self.slots:
            me.materials.append(mat(spec, tint))
        obj = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(obj)
        return obj


# ================================================================== books
class Books:
    """Book rows, stacks and face-out picture books into a Batch. Cells are drawn from a seeded RNG."""

    def __init__(self, batch, seed=1):
        self.B = batch
        self.rng = random.Random(seed)

    def one(self, t, d, h, T, cell=None):
        """Standing book in local space: X thickness, Y depth, Z height, spine on -Y."""
        cell = self.rng.randrange(64) if cell is None else cell
        spine, cover, page = book_rects(cell)
        A = "atlas:books"
        self.B.box((t, d, h), T, {"-y": (A, spine), "-x": (A, cover), "+x": (A, cover),
                                  "+z": (A, page), "-z": (A, page), "+y": (A, page)})

    def row(self, x0, x1, z, y_front, d_max, h_max, fill=1.0, lean=None, series=0.25, h_min=0.16, tall=False):
        """Upright books from x0 toward x1 (either direction). Stops at fill * span. lean: lean the last book
        against the row. Returns the x reached (outer face of the last book)."""
        r = self.rng
        sgn = 1 if x1 >= x0 else -1
        span = abs(x1 - x0) * fill
        x, used = x0, 0.0
        hi = min(h_max, 0.36 if tall else 0.3)
        lo = min(h_min, hi - 0.02)
        books = []
        while True:
            if books and r.random() < series:      # a series: same height and cell, a couple of volumes
                t, d, h, cell = books[-1]
            else:
                t = r.choice([0.016, 0.02, 0.024, 0.028, 0.032, 0.038, 0.045])
                h = r.uniform(lo, hi)
                d = min(d_max, h * r.uniform(0.62, 0.78))
                cell = r.randrange(64)
            if used + t > span:
                break
            books.append((t, d, h, cell))
            used += t + 0.0015
        if lean and len(books) > 3:
            books, last = books[:-1], books[-1]
        else:
            last = None
        for t, d, h, cell in books:
            cx = x + sgn * t / 2
            self.one(t, d, h, M(cx, y_front + d / 2 + r.uniform(0, 0.008), z), cell)
            x += sgn * (t + 0.0015)
        if last:
            t, d, h, cell = last
            ph = books[-1][2]
            phi = math.radians(r.uniform(9, 16))
            px = x + sgn * min(h * math.sin(phi), ph * math.tan(phi))   # pivot: the foot of the leaning face
            # pivot on the lower corner nearest the row, box centre offset by t/2 along the tilted base
            cx = px + sgn * (t / 2) * math.cos(phi)
            cz = z + (t / 2) * math.sin(phi)
            self.one(t, d, h, M(cx, y_front + d / 2, cz, tilt_y=-sgn * math.degrees(phi)), cell)
            x = px + sgn * (t * math.cos(phi) + h * math.sin(phi) * 0)
        return x

    def stack(self, cx, z, y_front, n, w_max, d_max, yaw_jit=4.0):
        """Books lying flat, biggest at the bottom, spines to the front. Returns the top z."""
        r = self.rng
        dims = []
        for _ in range(n):
            w = r.uniform(0.17, max(0.18, w_max))
            dims.append((w, min(d_max, w * r.uniform(0.7, 0.8)), r.choice([0.018, 0.022, 0.026, 0.03, 0.036])))
        dims.sort(key=lambda s: -s[0])
        for w, d, t in dims:
            # standing book rotated 90 deg about Y: local Z (height) -> +X, local X (thickness) -> -Z
            T = M(cx + r.uniform(-0.008, 0.008), y_front + d / 2 + r.uniform(0, 0.01), z + t / 2,
                  yaw=r.uniform(-yaw_jit, yaw_jit)) @ Matrix.Translation((-w / 2, 0, 0)) @ Matrix.Rotation(math.radians(90), 4, "Y")
            self.one(t, d, w, T)
            z += t
        return z

    def face_out(self, cx, z, y_back, w, h, cell, tilt=12.0, t=0.012):
        """Picture book standing face-out, leaning back (top toward +Y) against something at y_back."""
        A = "atlas:art"
        rect = art_rect(8 + cell % 8)
        spine, cover, page = book_rects(cell * 5 % 64)
        a = math.radians(tilt)
        y = y_back - t / 2 * math.cos(a) - h * math.sin(a) - 0.002
        self.B.box((w, t, h), M(cx, y, z, tilt_x=-tilt),
                   {"-y": (A, rect), "+y": ("atlas:books", cover), "*": ("atlas:books", page),
                    "-x": ("atlas:books", spine)})


# ================================================================== wood
def grain_uv(obj, spec, along="x"):
    """Per-face planar UVs in metres with U along world axis `along` wherever the face contains it."""
    if spec.partition(":")[0] in ("paint", "ceramic", "metal", "glass", "mirror"):
        return obj
    tile = kit.material(spec)[1]
    bpy.context.view_layer.update()
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    mw = obj.matrix_world.copy()
    g = "xyz".index(along)
    off = (hash(obj.name) % 97 / 97.0, hash(obj.name) % 89 / 89.0)
    for poly in me.polygons:
        n = mw.to_3x3() @ poly.normal
        k = max(range(3), key=lambda i: abs(n[i]))
        plane = [i for i in range(3) if i != k]
        ua, va = (g, next(i for i in plane if i != g)) if g in plane else plane
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (co[ua] / tile + off[0], co[va] / tile + off[1])
    return obj


def slab(size, at, spec, tint=None, along="x", bevel=0.002, rot=(0, 0, 0), name="slab"):
    o = kit.box(size, at, spec, tint, bevel=bevel, rot=rot, name=name)
    return grain_uv(o, spec, along)


def extrude_xz(outline, y0, depth, spec, tint=None, along="z", bevel=0.0015, name="xz"):
    """Closed XZ outline extruded from y0 to y0 + depth (toward the back)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in outline]
    b = [bm.verts.new((x, y0 + depth, z)) for x, z in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    kit.finish(o, spec, tint, None, bevel, segments=2)
    return grain_uv(o, spec, along)


def arch_band(cx, zc, r_in, r_out, y0, depth, spec, tint=None, seg=28, name="arch"):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for y in (y0, y0 + depth):
        ring = []
        for i in range(seg + 1):
            t = math.pi * i / seg
            ring.append((bm.verts.new((cx + r_out * math.cos(t), y, zc + r_out * math.sin(t))),
                         bm.verts.new((cx + r_in * math.cos(t), y, zc + r_in * math.sin(t)))))
        rings.append(ring)
    f, bk = rings
    for i in range(seg):
        bm.faces.new((f[i][0], f[i + 1][0], f[i + 1][1], f[i][1]))
        bm.faces.new((bk[i][1], bk[i + 1][1], bk[i + 1][0], bk[i][0]))
        bm.faces.new((f[i][0], bk[i][0], bk[i + 1][0], f[i + 1][0]))
        bm.faces.new((f[i + 1][1], bk[i + 1][1], bk[i][1], f[i][1]))
    for e in (0, seg):
        bm.faces.new((f[e][0], f[e][1], bk[e][1], bk[e][0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    kit.finish(o, spec, tint, None, 0.0015, segments=2)
    return grain_uv(o, spec, "x")


# ================================================================== props
GLAZES = ["#e9e3d6", "#d9cdb8", "#a9b09a", "#8a9a7b", "#c07a58", "#b98b6e", "#4b4845", "#f2efe8", "#9aa3a8",
          "#cdb89a", "#6f7a6b", "#e3d5c3"]
GREENS = ["#4f6b3c", "#5d7a45", "#3e5a36", "#6b8a4f"]

VASES = {  # (radius, z) profiles in metres for a 1.0 scale; the lip turns inward so the opening reads
    "bud": [(0.0, 0), (0.028, 0), (0.036, 0.03), (0.034, 0.06), (0.016, 0.1), (0.011, 0.13), (0.013, 0.145), (0.009, 0.14)],
    "belly": [(0.0, 0), (0.04, 0), (0.07, 0.05), (0.075, 0.09), (0.055, 0.15), (0.035, 0.18), (0.038, 0.195), (0.03, 0.19)],
    "cylinder": [(0.0, 0), (0.045, 0), (0.05, 0.01), (0.05, 0.2), (0.046, 0.202), (0.043, 0.19)],
    "bottle": [(0.0, 0), (0.045, 0), (0.06, 0.04), (0.06, 0.13), (0.03, 0.18), (0.014, 0.21), (0.014, 0.26), (0.017, 0.265), (0.011, 0.26)],
    "amphora": [(0.0, 0), (0.03, 0), (0.05, 0.05), (0.07, 0.14), (0.06, 0.22), (0.04, 0.26), (0.045, 0.28), (0.036, 0.275)],
    "moon": [(0.0, 0), (0.035, 0), (0.07, 0.04), (0.085, 0.09), (0.07, 0.15), (0.03, 0.18), (0.02, 0.19), (0.02, 0.205), (0.013, 0.2)],
    "bowl": [(0.0, 0), (0.04, 0), (0.042, 0.004), (0.07, 0.03), (0.09, 0.06), (0.085, 0.062), (0.065, 0.034), (0.0, 0.01)],
    "cup": [(0.0, 0), (0.028, 0), (0.035, 0.07), (0.033, 0.072), (0.026, 0.008), (0.0, 0.008)],
    "orb": [(0.0, 0)] + [(0.06 * math.sin(math.pi * i / 10), 0.06 - 0.06 * math.cos(math.pi * i / 10)) for i in range(1, 11)],
    "pitcher": [(0.0, 0), (0.05, 0), (0.058, 0.05), (0.052, 0.12), (0.042, 0.17), (0.048, 0.2), (0.044, 0.2), (0.037, 0.18)],
    "plate": [(0.0, 0), (0.07, 0), (0.1, 0.012), (0.13, 0.02), (0.128, 0.022), (0.098, 0.015), (0.0, 0.008)],
}


def vase(kind, at, glaze, s=1.0, steps=28, roughness=0.5):
    prof = [(r * s, z * s) for r, z in VASES[kind]]
    return kit.lathe(prof, f"ceramic:{glaze}", at=at, steps=steps, roughness=roughness, name="vase")


def height(kind, s=1.0):
    return max(z for _, z in VASES[kind]) * s


def candle(at, r=0.03, h=0.08, color="#efe8da"):
    kit.cylinder(r, h, at, f"paint:{color}", verts=20, bevel=0.002, roughness=0.55, name="candle")


def pot(at, r, h, glaze, soil=True):
    prof = [(0, 0), (r * 0.78, 0), (r, h * 0.9), (r * 1.02, h), (r * 0.9, h), (r * 0.88, h * 0.88), (0, h * 0.88)]
    kit.lathe(prof, f"ceramic:{glaze}", at=at, steps=24, roughness=0.6, name="pot")
    if soil:
        kit.cylinder(r * 0.88, 0.004, (at[0], at[1], at[2] + h * 0.881), "paint:#3b2c22", verts=16, bevel=0, name="soil")


def leaf(B, base, direction, length, width, spec, up=(0, 0, 1), curl=0.25, droop=0.0):
    d = Vector(direction).normalized()
    side = d.cross(Vector(up))
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    nrm = side.cross(d).normalized()
    b = Vector(base)
    m = b + d * length * 0.5 + nrm * curl * length * 0.25 - Vector((0, 0, droop * length * 0.3))
    p = b + d * length - nrm * curl * length * 0.05 - Vector((0, 0, droop * length))
    l_ = m + side * width / 2 - nrm * width * curl * 0.5
    r_ = m - side * width / 2 - nrm * width * curl * 0.5
    B.poly([b, r_, m], spec, True)
    B.poly([b, m, l_], spec, True)
    B.poly([m, r_, p], spec, True)
    B.poly([m, p, l_], spec, True)


PLANT_H = {"snake": 0.44, "pilea": 0.25, "trail": 0.18, "fern": 0.24, "succulent": 0.11}


def plant_scale(kind, hmax, top=1.35):
    return min(top, hmax * 0.9 / PLANT_H[kind])


def plant(B, kind, at, rng, glaze="#e9e3d6", s=1.0):
    """Small shelf plant in a ceramic pot. kinds: pilea, snake, trail, fern, succulent. Returns total height."""
    x, y, z = at
    g = rng.choice(GREENS)
    spec = f"paint:{g}"
    if kind == "snake":
        r, h = 0.055 * s, 0.1 * s
        pot((x, y, z), r, h, glaze)
        for i in range(7):
            a = 2 * math.pi * i / 7 + rng.uniform(-0.3, 0.3)
            L = rng.uniform(0.2, 0.34) * s
            base = (x + math.cos(a) * r * 0.4, y + math.sin(a) * r * 0.4, z + h * 0.86)
            leaf(B, base, (math.cos(a) * 0.15, math.sin(a) * 0.15, 1), L, 0.04 * s, spec, up=(math.cos(a), math.sin(a), 0), curl=0.35)
        return h + 0.34 * s
    if kind == "succulent":
        r, h = 0.05 * s, 0.06 * s
        pot((x, y, z), r, h, glaze)
        for ring, (n, L, el) in enumerate(((9, 0.06, 0.25), (7, 0.045, 0.6), (5, 0.03, 1.2))):
            for i in range(n):
                a = 2 * math.pi * (i + ring * 0.5) / n
                leaf(B, (x, y, z + h * 0.86 + 0.004 * ring), (math.cos(a), math.sin(a), el), L * s, L * 0.55 * s,
                     "paint:#8aa38a", curl=0.4)
        return h + 0.05 * s
    r, h = (0.06 * s, 0.09 * s) if kind != "trail" else (0.065 * s, 0.1 * s)
    pot((x, y, z), r, h, glaze)
    top = z + h * 0.86
    if kind == "pilea":
        for i in range(16):
            a = rng.uniform(0, 2 * math.pi)
            el = rng.uniform(0.3, 1.2)
            stem = rng.uniform(0.06, 0.13) * s
            dirv = Vector((math.cos(a), math.sin(a), el)).normalized()
            tip = Vector((x, y, top)) + dirv * stem
            B.poly([Vector((x, y, top)), tip + Vector((0.002, 0, 0)), tip], "paint:#6b8a4f")
            leaf(B, tip, (math.cos(a) * 0.6, math.sin(a) * 0.6, 0.5), 0.05 * s, 0.05 * s, spec, curl=0.1)
        return h + 0.16 * s
    if kind == "fern":
        for i in range(14):
            a = 2 * math.pi * i / 14 + rng.uniform(-0.2, 0.2)
            L = rng.uniform(0.16, 0.24) * s
            leaf(B, (x, y, top), (math.cos(a), math.sin(a), rng.uniform(0.5, 1.4)), L, 0.05 * s, spec, curl=0.3, droop=0.6)
        return h + 0.15 * s
    # trail: a bushy crown and strands that spill over the shelf's front edge (toward -Y)
    for i in range(10):
        a = rng.uniform(0, 2 * math.pi)
        leaf(B, (x + math.cos(a) * 0.02, y + math.sin(a) * 0.02, top), (math.cos(a), math.sin(a), 0.7), 0.06 * s, 0.045 * s, spec, curl=0.2)
    for k in range(3):
        a = math.radians(-90 + (k - 1) * 22 + rng.uniform(-6, 6))
        p = Vector((x, y, top))
        dirv = Vector((math.cos(a), math.sin(a), 0.2))
        for j in range(9):
            p = p + dirv.normalized() * 0.035 * s
            dirv = Vector((dirv.x * 0.55, dirv.y * 0.55, dirv.z - 0.5))
            if p.z < z - 0.25 * s:
                break
            side = 1 if j % 2 else -1
            leaf(B, p, (math.cos(a) + side * 0.6, math.sin(a) - 0.3, -0.2), 0.045 * s, 0.035 * s, spec, curl=0.2)
    return h + 0.08 * s


def frame(B, cx, z, y_back, w, h, art, frame_spec="paint:#1f1e1d", lean=8.0, depth=0.02, border=0.018):
    """Picture frame leaning back against y_back (top toward +Y): a border of 4 bars and a recessed print."""
    ln = math.radians(lean)
    yb = y_back - depth / 2 - h * math.sin(ln) - 0.003
    T = M(cx, yb, z, tilt_x=-lean)
    f = {"*": (frame_spec, None)}
    B.box((w, depth, border), T, f)
    B.box((w, depth, border), T @ Matrix.Translation((0, 0, h - border)), f)
    for sx in (-1, 1):
        B.box((border, depth, h - 2 * border), T @ Matrix.Translation((sx * (w - border) / 2, 0, border)), f)
    B.box((w - 2 * border, 0.004, h - 2 * border), T @ Matrix.Translation((0, 0.004, border)),
          {"-y": ("atlas:art", art_rect(art)), "*": ("paint:#f2efe8", None)})


def bookend(B, x, z, y_front, d, h=0.15, facing=1, spec=BLACK):
    """L bookend: base plate under the books, upright on the outer side. facing=+1 books to the right."""
    B.box((0.12, min(d, 0.12), 0.003), M(x + facing * 0.055, y_front + min(d, 0.12) / 2, z), {"*": (spec, None)})
    B.box((0.004, min(d, 0.12), h), M(x - facing * 0.002, y_front + min(d, 0.12) / 2, z), {"*": (spec, None)})


def basket(at, w, d, h, tint="#a98a5e", round_=False):
    """Woven seagrass basket: rattan walls, open top with a rolled rim."""
    x, y, z = at
    if round_:
        r = w / 2
        prof = [(0, 0), (r * 0.9, 0), (r, h * 0.95), (r * 1.03, h), (r * 0.94, h), (r * 0.93, h * 0.3), (0, h * 0.3)]
        kit.lathe(prof, "rattan", tint, at=at, steps=24, name="basket")
        return
    t = 0.012
    kit.box((w, d, t), (x, y, z), "rattan", tint, bevel=0.004, name="bk-floor")
    for sy in (-1, 1):
        kit.box((w, t, h), (x, y + sy * (d / 2 - t / 2), z), "rattan", tint, bevel=0.005, name="bk-side")
    for sx in (-1, 1):
        kit.box((t, d - 2 * t, h), (x + sx * (w / 2 - t / 2), y, z), "rattan", tint, bevel=0.005, name="bk-end")
    # rolled rim
    rim = [(x - w / 2, y - d / 2, z + h), (x + w / 2, y - d / 2, z + h), (x + w / 2, y + d / 2, z + h), (x - w / 2, y + d / 2, z + h)]
    kit.curve_tube(rim, 0.008, "rattan", tint, closed=True, name="bk-rim")


def box_lidded(B, at, w, d, h, color):
    x, y, z = at
    B.box((w, d, h - 0.012), M(x, y, z), {"*": (f"paint:{color}", None)})
    B.box((w + 0.004, d + 0.004, 0.014), M(x, y, z + h - 0.014), {"*": (f"paint:{color}", None)})
