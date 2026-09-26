"""Styled shelving: bookcases and shelf units sold dressed, like a staged showroom. One function per slug.
Z up, FRONT toward -Y, metres. Each unit builds its carcass with kit boxes, then a Dresser fills every
shelf segment from a named recipe (books, stacks, ceramics, plants, frames, baskets) into one Batch."""
import math
import random

import kit
from mathutils import Matrix
from parts import (BLACK, BRASS, OAK, RIFT, WALNUT, GLAZES, Batch, Books, M, arch_band, basket, bookend, box_lidded,
                   candle, extrude_xz, frame, grain_uv, height, plant, plant_scale, slab, vase)

REGISTRY = {}


def piece(slug, name, kind, colors, price, materials, style, tags=()):
    def deco(fn):
        REGISTRY[slug] = (fn, dict(name=name, kind=kind, colors=colors, price=price, materials=materials,
                                   style=style, tags=list(tags)))
        return fn
    return deco


# ============================================================ dresser
class Dresser:
    def __init__(self, seed, end_spec=BLACK, glazes=None, frame_specs=None):
        self.B = Batch()
        self.bk = Books(self.B, seed)
        self.rng = random.Random(seed + 101)
        self.end_spec = end_spec
        self.glazes = glazes or GLAZES
        self.frames = frame_specs or ["paint:#1f1e1d", "paint:#b48d63", "paint:#efebe3", "metal:#b8955a"]
        self.art = self.rng.randrange(8)

    def glaze(self):
        return self.rng.choice(self.glazes)

    def _vase(self, x, y, z, hmax, kinds=("bud", "belly", "bottle", "amphora", "moon", "cylinder")):
        k = self.rng.choice(kinds)
        s = min(self.rng.uniform(0.85, 1.25), hmax / height(k))
        vase(k, (x, y, z), self.glaze(), s)
        return height(k, s)

    def _frame(self, x, z, yb, hmax, wmax, pad=0.0):
        h = min(hmax - 0.01, self.rng.uniform(0.2, 0.3))
        w = min(wmax, h * self.rng.choice([0.75, 0.8, 1.0, 1.25]))
        self.art = (self.art + 3) % 8
        frame(self.B, x, z, yb, w, h, self.art, self.rng.choice(self.frames), lean=self.rng.uniform(6, 10))

    SPREAD = {"snake": 0.09, "pilea": 0.17, "trail": 0.08, "fern": 0.2, "succulent": 0.07}

    def _plant(self, kind, x, y, z, hmax, x0, x1, yf, yb, top=1.35):
        """Plant scaled to the clear height and to the room around it, so no leaf goes through a panel."""
        s = plant_scale(kind, hmax, top)
        room = min(x - x0, x1 - x, (y - yf) + 0.03, yb - y)
        s = min(s, room / self.SPREAD[kind])
        plant(self.B, kind, (x, y, z), self.rng, self.glaze(), max(0.55, s))

    def shelf(self, x0, x1, z, yf, yb, clear, recipe, flip=False):
        """Dress the free box x0..x1 (x0 < x1), floor z, front yf, back yb, clear height `clear`."""
        if isinstance(recipe, tuple):
            recipe, flip = recipe
        W, D = x1 - x0, yb - yf
        X = (lambda u: x1 - u * W) if flip else (lambda u: x0 + u * W)
        L, R = (x1, x0) if flip else (x0, x1)            # "left" and "right" ends after mirroring
        hmax = clear - 0.025
        dmax = D - 0.025
        yc = yf + min(D * 0.45, 0.11)
        bk, rng = self.bk, self.rng
        if recipe == "empty":
            return
        if recipe == "books":
            bk.row(L + (0.002 if not flip else -0.002), R, z, yf, dmax, hmax, fill=rng.uniform(0.78, 0.9), lean=True)
        elif recipe == "books_full":
            bk.row(L, R, z, yf, dmax, hmax, fill=0.97, series=0.35, tall=True)
        elif recipe == "books_vase":
            bk.row(L, X(0.6), z, yf, dmax, hmax, fill=0.95, lean=True)
            self._vase(X(0.8), yc, z, min(hmax, 0.24))
        elif recipe == "stack_orb_books":
            top = bk.stack(X(0.22), z, yf, rng.choice([3, 4]), min(0.27, W * 0.38), dmax)
            if hmax - (top - z) > 0.08:
                if rng.random() < 0.5:
                    vase("orb", (X(0.22), yc, top), self.glaze(), min(1.0, (hmax - (top - z)) / 0.12))
                else:
                    candle((X(0.22), yc, top), 0.028, min(0.09, hmax - (top - z) - 0.01))
            bk.row(R, X(0.47), z, yf, dmax, hmax, fill=0.97, lean=True)
        elif recipe == "plant_books":
            kind = rng.choice(["pilea", "fern", "trail"] if hmax > 0.22 else ["succulent", "trail"])
            self._plant(kind, X(0.25), yc, z, hmax, x0, x1, yf, yb, 1.2)
            bk.row(R, X(0.55), z, yf, dmax, hmax, fill=0.98, lean=True)
        elif recipe == "frame_vase":
            self._frame(X(0.38), z, yb, hmax, min(0.32, W * 0.5))
            self._vase(X(0.75), yf + 0.07, z, min(hmax * 0.8, 0.18), ("bud", "bottle", "belly"))
            if W > 0.5:
                candle((X(0.12), yf + 0.08, z), 0.03, 0.07)
        elif recipe == "frame_books":
            self._frame(X(0.3), z, yb, hmax, min(0.3, W * 0.45))
            top = bk.stack(X(0.78), z, yf, 2, min(0.24, W * 0.3), dmax)
            if hmax - (top - z) > 0.12:
                self._vase(X(0.78), yc, top, min(0.16, hmax - (top - z)), ("bud", "cup", "orb"))
        elif recipe == "baskets":
            n = 2 if W > 0.55 else 1
            bw = min(0.4, W / n - 0.04)
            bh = min(hmax - 0.01, 0.25)
            for i in range(n):
                basket((x0 + W * (i + 0.5) / n, yf + (D - 0.02) / 2, z), bw, D - 0.03, bh, rng.choice(["#a98a5e", "#b89a6a", "#8f7453"]))
        elif recipe == "basket_round":
            r = min(W * 0.36, 0.16)
            basket((X(0.5), yf + D / 2, z), 2 * r, 2 * r, min(hmax - 0.02, 0.22), rng.choice(["#a98a5e", "#8f7453"]), round_=True)
        elif recipe == "ceramics":
            xs = (0.24, 0.5, 0.74) if W > 0.45 else (0.3, 0.7)
            for i, u in enumerate(xs):
                zz = z
                if i == 1 and W > 0.45 and rng.random() < 0.6:
                    zz = bk.stack(X(u), z, yf, 2, min(0.22, W * 0.3), dmax)
                self._vase(X(u), yc + (0.03 if i == 1 else 0), zz, min(hmax - (zz - z), 0.26 - 0.06 * i))
        elif recipe == "stack_plant":
            top = bk.stack(X(0.7), z, yf, 3, min(0.25, W * 0.36), dmax)
            if hmax - (top - z) > 0.1:
                self._plant("succulent", X(0.7), yc, top, hmax - (top - z), x0, x1, yf, yb, 0.9)
            kind = rng.choice(["trail", "pilea", "snake"] if hmax > 0.34 else ["trail", "pilea"])
            self._plant(kind, X(0.25), yc, z, hmax, x0, x1, yf, yb)
        elif recipe == "bookends":
            a = X(0.12)
            bookend(self.B, a, z, yf, dmax, 0.14, -1 if flip else 1, self.end_spec)
            x = bk.row(a + (-0.006 if flip else 0.006), X(0.72), z, yf, dmax, hmax, fill=1.0, series=0.4)
            bookend(self.B, x + (-0.004 if flip else 0.004), z, yf, dmax, 0.14, 1 if flip else -1, self.end_spec)
            if W > 0.55:
                self._vase(X(0.87), yc, z, min(hmax, 0.2), ("bud", "orb", "cup", "belly"))
        elif recipe == "bowl":
            vase("bowl", (X(0.4), yc, z), self.glaze(), min(1.2, W / 0.4))
            vase("orb", (X(0.72), yc, z), self.glaze(), 0.7)
        elif recipe == "boxes":
            c = rng.choice(["#d8cdb5", "#56606b", "#b98b82", "#8a9a7b"])
            box_lidded(self.B, (X(0.3), yf + 0.12, z), min(0.26, W * 0.4), 0.18, 0.12, c)
            box_lidded(self.B, (X(0.3), yf + 0.12, z + 0.12), min(0.2, W * 0.3), 0.15, 0.09, "#efe8da")
            self._vase(X(0.72), yc, z, min(hmax, 0.2))
        else:
            raise ValueError(recipe)

    def flush(self):
        self.B.flush()


# ============================================================ carcasses
def open_case(w, d, h, cols, levels, spec, tint, t=0.022, kick=0.07, back=True, top=True, widths=None):
    """Open bookcase with kick board; returns [(x0, x1, z_floor, clear)] per free box, bottom to top."""
    slab((w - 2 * t, 0.018, kick), (0, -d / 2 + 0.03, 0), spec, tint, "x", 0.0015, name="kick")
    for sx in (-1, 1):
        slab((t, d, h - t), (sx * (w / 2 - t / 2), 0, 0), spec, tint, "z", 0.002, name="side")
    if top:
        slab((w, d, t), (0, 0, h - t), spec, tint, "x", 0.0025, name="top")
    if back:
        slab((w - 2 * t, 0.01, h - t - kick), (0, d / 2 - 0.005, kick), spec, tint, "z", 0.0005, name="back")
    inner = w - 2 * t
    zs = [kick + (h - t - kick) * k / levels for k in range(levels)]
    widths = widths or [1.0 / cols] * cols
    net = inner - (cols - 1) * t
    xs, x = [], -inner / 2
    for i, f in enumerate(widths):
        xs.append((x, x + net * f))
        x += net * f + t
        if i < cols - 1:
            slab((t, d - 0.012, h - 2 * t - kick), (x - t / 2, -0.006, kick + t), spec, tint, "z", 0.0015, name="divider")
    boxes = []
    for x0, x1 in xs:
        for k, z in enumerate(zs):
            slab((x1 - x0, d - 0.012, t), ((x0 + x1) / 2, -0.006, z), spec, tint, "x", 0.0015, name="shelf")
            ztop = zs[k + 1] if k + 1 < levels else h - t
            boxes.append((x0, x1, z + t, ztop - z - t))
    return boxes


def run_plan(dr, boxes, plan, yf, yb):
    """plan: list of recipe names (or (recipe, flip)) matched to boxes in order."""
    for (x0, x1, z, clear), p in zip(boxes, plan):
        r, flip = (p, False) if isinstance(p, str) else p
        dr.shelf(x0 + 0.004, x1 - 0.004, z, yf, yb, clear, r, flip)


# ============================================================ units
@piece("oak-bookcase-styled-80", "Styled rift oak bookcase, 80 cm, dressed with books, stoneware vases, a pilea and framed prints",
       "shelf", ["beige", "brown"], 238000, ["oak", "paper", "ceramic"], "scandinavian",
       ["bookcase", "bookshelf", "styled", "dressed", "books", "decor"])
def oak_80():
    w, d, h = 0.8, 0.32, 1.9
    boxes = open_case(w, d, h, 1, 6, RIFT, OAK)
    dr = Dresser(11)
    run_plan(dr, boxes, ["basket_round", "books_vase", ("stack_orb_books", True), "frame_vase", "plant_books", ("ceramics", True)],
             -d / 2 + 0.02, d / 2 - 0.012)
    dr.flush()


@piece("oak-bookcase-styled-120", "Styled wide rift oak bookcase, 120 cm, ten compartments of books, ceramics, plants and baskets",
       "shelf", ["beige", "brown"], 339000, ["oak", "paper", "ceramic", "seagrass"], "scandinavian",
       ["bookcase", "bookshelf", "styled", "dressed", "books", "decor"])
def oak_120():
    w, d, h = 1.2, 0.35, 1.9
    boxes = open_case(w, d, h, 2, 5, RIFT, OAK)
    dr = Dresser(12)
    plan = ["baskets", "books_vase", ("stack_plant", True), "frame_books", "ceramics",
            "books", ("frame_vase", True), "bookends", ("plant_books", True), ("stack_orb_books", True)]
    run_plan(dr, boxes, plan, -d / 2 + 0.02, d / 2 - 0.012)
    dr.flush()


@piece("walnut-mcm-bookcase-styled-100", "Styled mid-century walnut bookcase on splayed tapered legs, one door cupboard, books and ceramics",
       "shelf", ["brown"], 356000, ["walnut", "paper", "ceramic", "brass"], "mid-century",
       ["bookcase", "bookshelf", "styled", "dressed", "books", "mid century"])
def walnut_mcm():
    w, d, h, t, lh = 1.0, 0.34, 1.35, 0.022, 0.22
    z0 = lh
    slab((w, d, t), (0, 0, z0), "walnut", WALNUT, "x", 0.003, name="bottom")
    slab((w + 0.012, d + 0.01, t), (0, 0, z0 + h - t), "walnut", WALNUT, "x", 0.004, name="top")
    for sx in (-1, 1):
        slab((t, d, h - 2 * t), (sx * (w / 2 - t / 2), 0, z0 + t), "walnut", WALNUT, "z", 0.002, name="side")
    slab((w - 2 * t, 0.01, h - 2 * t), (0, d / 2 - 0.005, z0 + t), "walnut", WALNUT, "z", 0.0005, name="back")
    inner = w - 2 * t
    xa = -inner / 2 + (inner - t) * 0.58
    slab((t, d - 0.012, h - 2 * t), (xa + t / 2, -0.006, z0 + t), "walnut", WALNUT, "z", 0.0015, name="divider")
    left, right = (-inner / 2, xa), (xa + t, inner / 2)
    boxes = []
    for (x0, x1), levels in ((left, [0.0, 0.34, 0.64, 0.94]), (right, [0.0, 0.46, 0.9])):
        zs = [z0 + t + f * (h - 2 * t) / 1.2 if f else z0 + t for f in levels]
        zs = [z0 + t + f for f in levels]
        for k, z in enumerate(zs):
            if k:
                slab((x1 - x0, d - 0.012, t), ((x0 + x1) / 2, -0.006, z - t), "walnut", WALNUT, "x", 0.0015, name="shelf")
            ztop = (zs[k + 1] - t) if k + 1 < len(zs) else z0 + h - t
            boxes.append((x0, x1, z, ztop - z))
    # cupboard door over the lowest right box, brass knob
    x0, x1, z, clear = boxes[4]
    slab((x1 - x0 - 0.004, 0.018, clear - 0.004), ((x0 + x1) / 2, -d / 2 + 0.009, z + 0.002), "walnut", WALNUT, "z", 0.0025, name="door")
    kit.cylinder(0.012, 0.018, (0, 0, 0), BRASS, verts=20, bevel=0.003, rot=(90, 0, 0), name="knob").location = (x0 + 0.04, -d / 2, z + clear * 0.55)
    for sx in (-1, 1):
        for sy in (-1, 1):
            o = kit.taper_leg(lh, 0.02, 0.012, (sx * (w / 2 - 0.07), sy * (d / 2 - 0.06), z0), "walnut", WALNUT, splay_deg=7, toward=(0, 0))
            grain_uv(o, "walnut", "z")
    dr = Dresser(13, end_spec=BRASS, frame_specs=["metal:#b8955a", "paint:#1f1e1d"])
    yf, yb = -d / 2 + 0.02, d / 2 - 0.012
    plan = ["books", ("ceramics", True), "stack_orb_books", "frame_vase", None, ("books_vase", True), "plant_books"]
    for b, p in zip(boxes, plan):
        if p:
            r, flip = (p, False) if isinstance(p, str) else p
            dr.shelf(b[0] + 0.004, b[1] - 0.004, b[2], yf, yb, b[3], r, flip)
    # top: a moon vase and a small stack
    dr.shelf(-w / 2 + 0.03, w / 2 - 0.03, z0 + h, -d / 2 + 0.03, d / 2 - 0.03, 0.4, "frame_books")
    dr.flush()


@piece("arched-oak-bookcase-styled-90", "Styled arched rift oak bookcase, 90 cm, books, a trailing pothos, vases and a leaning print",
       "shelf", ["beige", "brown"], 289000, ["oak", "paper", "ceramic"], "modern organic",
       ["bookcase", "arched", "arch", "styled", "dressed", "books"])
def arched():
    w, d, h, t, kick = 0.9, 0.32, 1.85, 0.024, 0.07
    r = w / 2
    spring = h - r
    slab((w - 2 * t, 0.018, kick), (0, -d / 2 + 0.03, 0), RIFT, OAK, "x", 0.0015, name="kick")
    for sx in (-1, 1):
        slab((t, d, spring), (sx * (w / 2 - t / 2), 0, 0), RIFT, OAK, "z", 0.002, name="side")
    arch_band(0, spring, r - t, r, -d / 2, d, RIFT, OAK)
    outline = [(-r + 0.005, kick), (r - 0.005, kick)] + [((r - 0.005) * math.cos(math.pi * i / 28), spring + (r - 0.005) * math.sin(math.pi * i / 28)) for i in range(29)]
    extrude_xz(outline, d / 2 - 0.01, 0.01, RIFT, OAK, "z", 0.0, name="back")
    zs = [kick + (spring - kick) * k / 4 for k in range(4)] + [spring]
    for z in zs:
        slab((w - 2 * t, d - 0.012, t), (0, -0.006, z), RIFT, OAK, "x", 0.0015, name="shelf")
    crown = spring + 0.2
    slab((0.44, d - 0.02, t), (0, -0.002, crown), RIFT, OAK, "x", 0.0015, name="crown-shelf")
    dr = Dresser(14)
    yf, yb = -d / 2 + 0.02, d / 2 - 0.012
    plan = ["baskets", ("books_vase", True), "frame_books", "stack_plant"]
    for k, p in enumerate(plan):
        r_, flip = (p, False) if isinstance(p, str) else p
        dr.shelf(-w / 2 + t + 0.004, w / 2 - t - 0.004, zs[k] + t, yf, yb, zs[k + 1] - zs[k] - t, r_, flip)
    # arch: under the crown shelf a row of books, on it a bud vase
    dr.shelf(-0.3, 0.3, spring + t, yf, yb, crown - spring - t, "bookends")
    vase("bud", (0.06, 0.0, crown + t), "#e9e3d6", 1.1)
    dr.flush()


@piece("black-steel-oak-shelving-styled-100", "Styled black steel and solid oak open shelving, 100 cm, five shelves of books, plants and ceramics",
       "shelf", ["black", "brown"], 268000, ["steel", "oak", "paper", "ceramic"], "industrial",
       ["shelving unit", "bookshelf", "etagere", "styled", "dressed", "open shelving"])
def steel_oak():
    w, d, h, p, t = 1.0, 0.36, 1.8, 0.022, 0.028
    for sx in (-1, 1):
        for sy in (-1, 1):
            kit.box((p, p, h), (sx * (w / 2 - p / 2), sy * (d / 2 - p / 2), 0), BLACK, bevel=0.002, name="post")
    zs = [0.06, 0.43, 0.8, 1.17, 1.52]
    for z in zs + [h - 0.02]:
        for sy in (-1, 1):
            kit.box((w - 2 * p, 0.015, 0.02), (0, sy * (d / 2 - 0.0075), z - 0.02 if z > 0.06 else z), BLACK, bevel=0.001, name="rail")
    for sx in (-1, 1):
        for z in (0.06, h - 0.04):
            kit.box((0.015, d - 2 * p, 0.02), (sx * (w / 2 - 0.0075), 0, z), BLACK, bevel=0.001, name="endrail")
    # back X brace, thin rod
    xb, yb_ = w / 2 - p, d / 2 - 0.006
    bays = [0.08] + zs[1:] + [h - t]
    for za, zb in zip(bays, bays[1:]):
        for s_ in (-1, 1):
            kit.curve_tube([(-s_ * xb, yb_, za + t + 0.01), (s_ * xb, yb_, zb - 0.02)], 0.0035, BLACK, name="brace")
    slab((w, d + 0.01, t), (0, 0, h - t), RIFT, "#9c7650", "x", 0.003, name="top")
    for z in zs[1:]:
        slab((w - 2 * p + 0.03, d + 0.01, t), (0, 0, z), RIFT, "#9c7650", "x", 0.003, name="shelf")
    slab((w - 2 * p + 0.03, d + 0.01, t), (0, 0, 0.08), RIFT, "#9c7650", "x", 0.003, name="shelf0")
    dr = Dresser(15, frame_specs=["paint:#1f1e1d", "paint:#efebe3"])
    levels = [0.08 + t] + [z + t for z in zs[1:]]
    tops = [z for z in zs[1:]] + [h - t]
    plan = ["baskets", ("books", True), "stack_plant", ("frame_books", True), "ceramics"]
    for z, zt, rcp in zip(levels, tops, plan):
        r_, flip = (rcp, False) if isinstance(rcp, str) else rcp
        dr.shelf(-w / 2 + p + 0.01, w / 2 - p - 0.01, z, -d / 2 + 0.02, d / 2 - 0.02, zt - z, r_, flip)
    dr.flush()


@piece("oak-3-cube-low-shelf-styled", "Styled low rift oak three-cube shelf, baskets, books and a plant, dressed top",
       "shelf", ["beige", "brown"], 142000, ["oak", "seagrass", "paper", "ceramic"], "scandinavian",
       ["cube shelf", "low bookcase", "styled", "dressed", "bench height"])
def cube3():
    c, t, d = 0.33, 0.018, 0.35
    w = 3 * c + 4 * t
    h = c + 2 * t + 0.03
    foot = 0.03
    slab((w, d, t), (0, 0, foot), RIFT, OAK, "x", 0.002, name="bottom")
    slab((w, d, t), (0, 0, h - t), RIFT, OAK, "x", 0.002, name="top")
    for i in range(4):
        x = -w / 2 + t / 2 + i * (c + t)
        slab((t, d, c), (x, 0, foot + t), RIFT, OAK, "z", 0.0015, name="upright")
    slab((w - 2 * t, 0.008, c), (0, d / 2 - 0.004, foot + t), RIFT, OAK, "z", 0.0005, name="back")
    for sx in (-1, 1):
        slab((0.05, d - 0.06, foot), (sx * (w / 2 - 0.06), 0, 0), RIFT, OAK, "x", 0.002, name="foot")
    dr = Dresser(16)
    yf, yb = -d / 2 + 0.02, d / 2 - 0.012
    for i, rcp in enumerate(["baskets", "books", ("stack_plant", True)]):
        x0 = -w / 2 + t + i * (c + t)
        r_, flip = (rcp, False) if isinstance(rcp, str) else rcp
        dr.shelf(x0 + 0.004, x0 + c - 0.004, foot + t, yf, yb, c, r_, flip)
    # top: frame, vase and a book stack with a candle
    dr.shelf(-w / 2 + 0.03, 0.05, h, -d / 2 + 0.03, d / 2 - 0.02, 0.4, "frame_vase")
    dr.shelf(0.1, w / 2 - 0.03, h, -d / 2 + 0.03, d / 2 - 0.02, 0.4, ("stack_orb_books", True))
    dr.flush()


@piece("oak-cube-divider-styled-146", "Styled rift oak four by four cube room divider, open backed, filled with books, baskets, plants and ceramics",
       "shelf", ["beige", "brown"], 352000, ["oak", "seagrass", "paper", "ceramic"], "japandi",
       ["room divider", "cube shelf", "styled", "dressed", "open shelving"])
def divider():
    w, d, h, t, n, foot = 1.46, 0.36, 1.46, 0.022, 4, 0.05
    for sx in (-1, 1):
        slab((t, d, h - foot), (sx * (w / 2 - t / 2), 0, foot), RIFT, OAK, "z", 0.002, name="side")
        slab((0.06, d - 0.04, foot), (sx * (w / 2 - 0.08), 0, 0), RIFT, OAK, "x", 0.002, name="foot")
    inner = w - 2 * t
    cw = (inner - (n - 1) * t) / n
    ch = (h - foot - (n + 1) * t) / n
    for k in range(n + 1):
        slab((inner, d, t), (0, 0, foot + k * (ch + t)), RIFT, OAK, "x", 0.0015, name="shelf")
    for cc in range(1, n):
        x = -inner / 2 + cc * (cw + t) - t / 2
        for k in range(n):
            slab((t, d, ch), (x, 0, foot + t + k * (ch + t)), RIFT, OAK, "z", 0.0015, name="upright")
    plan = [["baskets", "books", "basket_round", "baskets"],
            ["books_vase", "ceramics", ("books", True), "stack_plant"],
            ["plant_books", ("stack_orb_books", True), "frame_vase", ("books_vase", True)],
            ["frame_books", "books", "bowl", ("plant_books", True)]]
    dr = Dresser(17)
    for k in range(n):
        for cc in range(n):
            x0 = -inner / 2 + cc * (cw + t)
            rcp = plan[k][cc]
            r_, flip = (rcp, False) if isinstance(rcp, str) else rcp
            dr.shelf(x0 + 0.004, x0 + cw - 0.004, foot + t + k * (ch + t), -d / 2 + 0.03, d / 2 - 0.03, ch, r_, flip)
    dr.flush()


@piece("oak-ladder-shelf-styled-65", "Styled leaning rift oak ladder shelf, four graduated shelves with books, a plant, a vase and a print",
       "shelf", ["beige", "brown"], 146000, ["oak", "paper", "ceramic"], "scandinavian",
       ["ladder shelf", "leaning", "styled", "dressed", "bookshelf"])
def ladder():
    w, h, lean = 0.65, 1.82, math.radians(11)
    rw, rd = 0.032, 0.045
    L = h / math.cos(lean)
    for sx in (-1, 1):
        o = kit.box((rw, rd, L), (sx * (w / 2 - rw / 2), 0, 0), RIFT, OAK, bevel=0.004, rot=(-math.degrees(lean), 0, 0), name="rail")
        grain_uv(o, RIFT, "z")
    back = h * math.tan(lean) + rd / 2
    dr = Dresser(18)
    plan = ["basket_round", "books_vase", "stack_plant", ("frame_vase", True)]
    zs = (0.1, 0.52, 0.94, 1.36)
    for i, z in enumerate(zs):
        yf = z * math.tan(lean) + rd / 2 - 0.005
        dep = back - yf
        slab((w - 2 * rw, dep, 0.02), (0, yf + dep / 2, z), RIFT, OAK, "x", 0.002, name="shelf")
        slab((w - 2 * rw, 0.016, 0.06), (0, back - 0.008, z + 0.02), RIFT, OAK, "x", 0.002, name="lip")
        clear = (zs[i + 1] - z - 0.02) if i < 3 else 0.36
        # the rails lean back, so the usable depth near the next shelf is shallower: keep to the back
        r_, flip = (plan[i], False) if isinstance(plan[i], str) else plan[i]
        dr.shelf(-w / 2 + rw + 0.006, w / 2 - rw - 0.006, z + 0.02, yf + 0.01, back - 0.016, clear, r_, flip)
    dr.flush()


@piece("oak-glass-display-cabinet-ceramics-90", "Rift oak glass door display cabinet, 90 cm, styled with stoneware plates, bowls, jugs and vases",
       "cabinet", ["beige", "brown"], 512000, ["oak", "glass", "brass", "ceramic"], "scandinavian",
       ["display cabinet", "vitrine", "glass doors", "styled", "ceramics", "china cabinet"])
def vitrine():
    w, d, h, lh, p = 0.9, 0.4, 1.8, 0.16, 0.036
    z0 = lh
    slab((w, d, 0.03), (0, 0, z0), RIFT, OAK, "x", 0.003, name="base")
    slab((w + 0.01, d + 0.01, 0.03), (0, 0, h - 0.03), RIFT, OAK, "x", 0.004, name="top")
    for sx in (-1, 1):
        for sy in (-1, 1):
            slab((p, p, h - 0.06 - z0), (sx * (w / 2 - p / 2), sy * (d / 2 - p / 2), z0 + 0.03), RIFT, OAK, "z", 0.003, name="post")
    zi, zt = z0 + 0.03, h - 0.03
    slab((w - 2 * p, 0.01, zt - zi), (0, d / 2 - 0.01, zi), RIFT, OAK, "z", 0.0005, name="back")
    for sx in (-1, 1):
        kit.box((0.005, d - 2 * p, zt - zi), (sx * (w / 2 - p / 2), 0, zi), "glass", bevel=0.0, name="side-glass")
    shelves = [zi + 0.4, zi + 0.78, zi + 1.14]
    for z in shelves:
        kit.box((w - 2 * p, d - p - 0.03, 0.008), (0, 0.0, z), "glass", bevel=0.0005, name="shelf-glass")
    fy = -d / 2 + 0.012
    for i, sx in enumerate((-1, 1)):
        dw = (w - 2 * p) / 2 - 0.002
        x = sx * (dw / 2 + 0.001)
        s, dh = 0.035, zt - zi - 0.006
        for ex in (-1, 1):
            slab((s, 0.022, dh), (x + ex * (dw / 2 - s / 2), fy, zi + 0.003), RIFT, OAK, "z", 0.002, name="stile")
        for zz in (zi + 0.003, zi + 0.003 + dh - 0.05):
            slab((dw - 2 * s, 0.022, 0.05), (x, fy, zz), RIFT, OAK, "x", 0.002, name="rail")
        kit.box((dw - 2 * s, 0.005, dh - 0.1), (x, fy, zi + 0.053), "glass", bevel=0.0005, name="glass")
        k = kit.cylinder(0.011, 0.02, (0, 0, 0), BRASS, verts=20, bevel=0.003, rot=(90, 0, 0), name="knob")
        k.location = (x - sx * (dw / 2 - 0.018), fy - 0.011, zi + dh * 0.5)
    for sx in (-1, 1):
        for sy in (-1, 1):
            o = kit.taper_leg(lh, 0.02, 0.014, (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), lh), RIFT, OAK)
            grain_uv(o, RIFT, "z")
    # ceramics: white and oatmeal stoneware, a sage accent
    cream, oat, sage, clay = "#efebe2", "#d9ccb4", "#9aa58c", "#b98b6e"
    yb = d / 2 - 0.03
    B = Batch()
    # bottom level: stacked plates, a tall jug, bowls
    for j in range(6):
        vase("plate", (-0.2, -0.02, zi + j * 0.016), cream, 0.95, steps=32)
    vase("pitcher", (0.03, 0.02, zi), oat, 1.25)
    for j in range(3):
        vase("bowl", (0.24, -0.03, zi + j * 0.035), [cream, oat, cream][j], 1.0 - 0.1 * j)
    # level 2: plates standing on edge against the back, cups in front
    for j, (xx, sc) in enumerate(((-0.19, 0.95), (0.07, 0.85))):
        o = vase("plate", (0, 0, 0), [sage, cream][j], sc, steps=32)
        o.rotation_euler = (math.radians(78), 0, 0)
        o.location = (xx, yb - 0.03 + 0.012 * j, shelves[0] + 0.008 + 0.13 * sc)
    for j, xx in enumerate((-0.16, 0.0, 0.2)):
        vase("cup", (xx, -0.1, shelves[0] + 0.008), [clay, cream, sage][j], 1.0)
    vase("bowl", (0.24, 0.02, shelves[0] + 0.008), oat, 0.9)
    # level 3: vase group
    vase("moon", (-0.2, 0.0, shelves[1] + 0.008), cream, 1.1)
    vase("bottle", (0.02, 0.03, shelves[1] + 0.008), sage, 1.05)
    vase("bud", (0.14, -0.06, shelves[1] + 0.008), clay, 1.0)
    vase("cylinder", (0.26, 0.02, shelves[1] + 0.008), oat, 0.9)
    # top level: tall amphora, bowl with orbs, a small stack of cookbooks
    vase("amphora", (0.2, 0.0, shelves[2] + 0.008), oat, 1.1)
    vase("bowl", (-0.03, -0.02, shelves[2] + 0.008), cream, 1.0)
    bk = Books(B, 19)
    top = bk.stack(-0.22, shelves[2] + 0.008, -0.13, 3, 0.24, 0.2)
    vase("orb", (-0.22, -0.03, top), clay, 0.6)
    B.flush()


@piece("kids-picture-book-shelf-styled-100", "Styled kids' low picture book shelf, three face-out ledges of picture books, toy baskets below",
       "shelf", ["white", "beige"], 118000, ["painted wood", "oak", "paper", "seagrass"], "scandinavian",
       ["kids bookcase", "picture books", "front facing", "nursery", "styled", "dressed", "children"])
def kids():
    w, d, h, t = 1.0, 0.34, 1.0, 0.018
    white = "paint:#ece8df"
    for sx in (-1, 1):
        kit.box((t, d, h), (sx * (w / 2 - t / 2), 0, 0), white, bevel=0.003, name="side")
    kit.box((w - 2 * t, d, t), (0, 0, 0.04), white, bevel=0.002, name="bottom")
    kit.box((w - 2 * t, 0.018, 0.04), (0, -d / 2 + 0.02, 0), white, bevel=0.002, name="kick")
    kit.box((w - 2 * t, d, t), (0, 0, 0.3), white, bevel=0.002, name="mid")
    kit.box((w + 0.01, d + 0.01, t), (0, 0, h), white, bevel=0.003, name="top")
    kit.box((w - 2 * t, 0.01, h - 0.04), (0, d / 2 - 0.005, 0.04), white, bevel=0.0005, name="back")
    dr = Dresser(20)
    B, bk = dr.B, dr.bk
    # lower cubby: two baskets and a ball
    basket((-0.23, 0.0, 0.04 + t), 0.4, d - 0.05, 0.2, "#b89a6a")
    basket((0.23, 0.0, 0.04 + t), 0.4, d - 0.05, 0.2, "#a98a5e")
    kit.lathe(VAS_BALL, "paint:#e0a458", at=(0.3, -0.02, 0.04 + t + 0.17), steps=20, name="ball")
    # three face-out ledges, each 10 cm further back than the one below
    tiers = ((0.3 + t, -0.05), (0.55, 0.05), (0.78, d / 2 - 0.01))
    cell = 0
    for i, (z, yb) in enumerate(tiers):
        ly = yb - 0.1
        kit.box((w - 2 * t, 0.1, 0.012), (0, ly + 0.05, z), RIFT, OAK, bevel=0.002, name="ledge")
        kit.box((w - 2 * t, 0.012, 0.055), (0, ly + 0.006, z), RIFT, OAK, bevel=0.002, name="lip")
        if i < 2:
            kit.box((w - 2 * t, 0.012, tiers[i + 1][0] - z), (0, yb + 0.006, z), white, bevel=0.001, name="riser")
        xs = [-0.32, -0.02, 0.29] if i != 1 else [-0.3, 0.0, 0.31]
        for j, xx in enumerate(xs):
            bw = [0.24, 0.21, 0.25][(i + j) % 3]
            bh = [0.19, 0.21, 0.18][(i + 2 * j) % 3]
            bk.face_out(xx, z + 0.012, yb, bw, bh, cell, tilt=12)
            cell += 1
    # top: a small plant and a wooden stacking toy
    plant(B, "pilea", (-0.36, 0.02, h + t), dr.rng, "#f2efe8", 0.9)
    kit.box((0.09, 0.09, 0.012), (0.33, 0.03, h + t), RIFT, OAK, bevel=0.002, name="toy-base")
    kit.cylinder(0.007, 0.11, (0.33, 0.03, h + t), RIFT, OAK, verts=10, bevel=0, name="toy-peg")
    for k, (r, c) in enumerate(((0.05, "#c9764f"), (0.042, "#e2b857"), (0.034, "#8fae8b"), (0.026, "#6f94b0"))):
        kit.cylinder(r, 0.022, (0.33, 0.03, h + t + 0.012 + k * 0.022), f"paint:{c}", verts=20, bevel=0.006, name="ring")
    dr.flush()


VAS_BALL = [(0.0, 0)] + [(0.06 * math.sin(math.pi * i / 8), 0.06 - 0.06 * math.cos(math.pi * i / 8)) for i in range(1, 9)]


@piece("library-bookcase-styled-200", "Styled library bookcase in deep green painted wood, 200 cm wide and 240 cm tall, five bays of books with objects",
       "shelf", ["green", "brown"], 689000, ["painted wood", "paper", "ceramic", "brass"], "traditional",
       ["library", "bookcase", "built-in look", "styled", "dressed", "books", "floor to ceiling"])
def library():
    w, d, h, t, kick = 2.0, 0.38, 2.4, 0.024, 0.1
    spec, tint = "painted-wood-matte", "#3e5247"
    boxes = open_case(w, d, h - 0.06, 5, 7, spec, tint, t=t, kick=kick)
    slab((w + 0.04, d + 0.03, 0.06), (0, -0.015, h - 0.06), spec, tint, "x", 0.004, name="cornice")
    slab((w + 0.02, d + 0.02, 0.02), (0, -0.01, h - 0.08), spec, tint, "x", 0.003, name="cornice-step")
    dr = Dresser(21, end_spec=BRASS, frame_specs=["metal:#b8955a", "paint:#1f1e1d"],
                 glazes=["#efebe2", "#d9ccb4", "#b98b6e", "#e3d5c3", "#4b4845"])
    rng = random.Random(5)
    plan = []
    specials = {2: "ceramics", 5: "frame_vase", 9: "stack_orb_books", 12: "plant_books", 17: "bookends", 20: "stack_plant",
                23: "frame_books", 27: "books_vase", 30: "bowl", 33: "ceramics", 0: "baskets", 7: "baskets", 14: "basket_round",
                21: "baskets", 28: "baskets"}
    for i in range(len(boxes)):
        plan.append((specials.get(i, rng.choice(["books_full", "books_full", "books"])), rng.random() < 0.5))
    run_plan(dr, boxes, plan, -d / 2 + 0.02, d / 2 - 0.012)
    dr.flush()


@piece("oak-tv-unit-styled-shelves-180", "Styled low rift oak TV unit, 180 cm, open shelves with books, baskets, vinyl and ceramics, dressed ends",
       "cabinet", ["beige", "brown"], 298000, ["oak", "paper", "ceramic", "seagrass"], "scandinavian",
       ["tv unit", "media console", "tv stand", "styled", "dressed", "open shelving"])
def tv_unit():
    w, d, h, t = 1.8, 0.4, 0.56, 0.022
    lh = 0.08
    slab((w, d, t), (0, 0, h - t), RIFT, OAK, "x", 0.003, name="top")
    slab((w - 2 * t, d, t), (0, 0, lh), RIFT, OAK, "x", 0.002, name="bottom")
    for sx in (-1, 1):
        slab((t, d, h - t - lh), (sx * (w / 2 - t / 2), 0, lh), RIFT, OAK, "z", 0.002, name="side")
    slab((w - 2 * t, 0.01, h - t - lh - t), (0, d / 2 - 0.005, lh + t), RIFT, OAK, "z", 0.0005, name="back")
    inner = w - 2 * t
    widths = [0.3, 0.4, 0.3]
    net = inner - 2 * t
    xs, x = [], -inner / 2
    for i, f in enumerate(widths):
        xs.append((x, x + net * f))
        x += net * f + t
        if i < 2:
            slab((t, d - 0.012, h - 2 * t - lh), (x - t / 2, -0.006, lh + t), RIFT, OAK, "z", 0.0015, name="divider")
    zmid = lh + t + (h - 2 * t - lh) / 2 - t / 2
    for x0, x1 in xs:
        slab((x1 - x0, d - 0.012, t), ((x0 + x1) / 2, -0.006, zmid), RIFT, OAK, "x", 0.0015, name="shelf")
    for sx in (-1, 1):
        for sy in (-1, 1):
            o = kit.taper_leg(lh, 0.02, 0.014, (sx * (w / 2 - 0.08), sy * (d / 2 - 0.07), lh), RIFT, OAK)
            grain_uv(o, RIFT, "z")
    dr = Dresser(22)
    yf, yb = -d / 2 + 0.02, d / 2 - 0.012
    low_c, up_c = zmid - lh - t, h - t - zmid - t
    plan = [("baskets", "books"), ("books_full", "ceramics"), (("baskets", True), ("stack_plant", True))]
    for (x0, x1), (lo, up) in zip(xs, plan):
        for z, c, rcp in ((lh + t, low_c, lo), (zmid + t, up_c, up)):
            r_, flip = (rcp, False) if isinstance(rcp, str) else rcp
            dr.shelf(x0 + 0.004, x1 - 0.004, z, yf, yb, c, r_, flip)
    # top: dressed ends, centre left clear for the screen
    dr.shelf(-w / 2 + 0.03, -w / 2 + 0.38, h, -d / 2 + 0.04, d / 2 - 0.04, 0.5, "stack_plant")
    dr.shelf(w / 2 - 0.4, w / 2 - 0.03, h, -d / 2 + 0.04, d / 2 - 0.04, 0.5, ("frame_vase", True))
    dr.flush()


@piece("walnut-low-bookcase-styled-150", "Styled low walnut bookcase, 150 cm, six compartments of books and ceramics with a dressed top",
       "shelf", ["brown"], 318000, ["walnut", "paper", "ceramic"], "mid-century",
       ["low bookcase", "bookshelf", "styled", "dressed", "books", "under window"])
def walnut_low():
    w, d, h = 1.5, 0.33, 0.82
    boxes = open_case(w, d, h, 3, 2, "walnut", WALNUT, t=0.022, kick=0.06)
    dr = Dresser(23, end_spec=BRASS, frame_specs=["metal:#b8955a", "paint:#1f1e1d", "paint:#efebe3"])
    plan = ["books", ("books_vase", True), "baskets", "ceramics", "plant_books", ("bookends", True)]
    run_plan(dr, boxes, plan, -d / 2 + 0.02, d / 2 - 0.012)
    dr.shelf(-w / 2 + 0.03, -0.1, h, -d / 2 + 0.03, d / 2 - 0.02, 0.45, "frame_vase")
    dr.shelf(0.05, w / 2 - 0.03, h, -d / 2 + 0.03, d / 2 - 0.02, 0.45, ("stack_plant", True))
    dr.flush()


@piece("white-narrow-bookcase-styled-60", "Styled narrow white bookcase, 60 cm, plants, books and ceramics on five shelves",
       "shelf", ["white", "green"], 176000, ["painted wood", "paper", "ceramic"], "scandinavian",
       ["bookcase", "narrow", "bookshelf", "styled", "dressed", "plants"])
def white_narrow():
    w, d, h = 0.6, 0.3, 1.8
    boxes = open_case(w, d, h, 1, 5, "paint:#ebe7df", None, t=0.02, kick=0.07)
    dr = Dresser(24)
    plan = ["basket_round", "books_vase", "stack_plant", ("plant_books", True), ("frame_vase", True)]
    run_plan(dr, boxes, plan, -d / 2 + 0.02, d / 2 - 0.012)
    dr.flush()
