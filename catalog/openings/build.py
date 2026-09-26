"""Five doors and five windows as part programs, compiled to GLB by the draft part compiler.

    cd compiler && uv run python ../catalog/openings/build.py

Program frame (Z-up): origin at the bottom centre of the wall opening on the wall's middle plane,
x along the wall, -y is the room side. The GLB is Y-up with the room side facing +Z.
Moving parts are named `leaf-*` (doors) and `sash-*` (windows); see manifest.json for pivots.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "compiler"))

from partdsl import glb  # noqa: E402
from partdsl.compile import build, compile_file  # noqa: E402
from partdsl.materials import library  # noqa: E402
from partdsl.program import Program  # noqa: E402

GRAINED = {f.id for f in library().values() if f.grain}
GLASS = {"kind": "glass", "color": "#dce6e7"}
FROSTED = {"kind": "glass", "color": "#f1f5f5"}
GASKET = {"color": "#242527", "roughness": 0.8}


class Model:
    def __init__(self, name, kind, mechanism, opening, wall, about):
        self.name, self.kind, self.mechanism, self.about = name, kind, mechanism, about
        self.opening, self.wall = opening, wall
        self.materials: dict[str, dict] = {}
        self.parts: list[dict] = []
        self.pivots: dict[str, dict] = {}

    def mat(self, key, spec):
        self.materials[key] = spec

    def box(self, pid, size, centre, mat, shape="box", radius=None, rotate=None):
        ids = {p["id"] for p in self.parts}
        base, i = pid, 2
        while pid in ids:
            pid, i = f"{base}-{i}", i + 1
        p = {"id": pid, "shape": shape, "size": [round(s, 4) for s in size], "material": mat,
             "attach": {"to": "piece", "at": [0.5, 0.5, 0], "self": [0.5, 0.5, 0.5],
                        "offset": [round(c, 4) for c in centre]}}
        if radius:
            p["radius"] = radius
        if rotate:
            p["rotate"] = rotate
        if self.materials[mat].get("finish") in GRAINED:
            p["grain"] = "xyz"[max(range(3), key=lambda k: size[k])]
        self.parts.append(p)

    def rod_y(self, pid, d, length, centre, mat):
        self.box(pid, [d, d, length], centre, mat, shape="cylinder", rotate=[90, 0, 0])

    def rod_z(self, pid, d, length, centre, mat):
        self.box(pid, [d, d, length], centre, mat, shape="cylinder")

    def pivot(self, prefix, point, motion):
        """`point` in program frame; stored in the GLB frame (x, z, -y)."""
        x, y, z = point
        self.pivots[prefix] = {"point_m": [round(x, 4), round(z, 4), round(-y, 4)], "motion": motion}


# ---------- shared pieces ----------

def casing(m, W, H, T, mat, jw=0.03, aw=0.07, at=0.018, faces=(-1, 1), y0=None, y1=None):
    """Jamb liners filling the reveal between y0 and y1, architraves on the given wall faces."""
    y0 = -T / 2 if y0 is None else y0
    y1 = T / 2 if y1 is None else y1
    ly, ld = (y0 + y1) / 2, y1 - y0
    Wc, Hc = W - 2 * jw, H - jw
    for s in (-1, 1):
        m.box("jamb", [jw, ld, H], [s * (W / 2 - jw / 2), ly, H / 2], mat)
    m.box("jamb-head", [Wc, ld, jw], [0, ly, H - jw / 2], mat)
    for f in faces:
        y = f * (T / 2 + at / 2)
        for s in (-1, 1):
            m.box("architrave", [aw, at, Hc + 0.005], [s * (Wc / 2 + 0.005 + aw / 2), y, (Hc + 0.005) / 2], mat)
        m.box("architrave-head", [Wc + 0.01 + 2 * aw, at, aw], [0, y, Hc + 0.005 + aw / 2], mat)
    return Wc, Hc


def stops(m, Wc, Hc, y, mat):
    for s in (-1, 1):
        m.box("stop", [0.012, 0.03, Hc], [s * (Wc / 2 - 0.006), y, Hc / 2], mat)
    m.box("stop-head", [Wc - 0.024, 0.03, 0.012], [0, y, Hc - 0.006], mat)


def lever(m, pre, x, z, face_y, out, mat, toward=-1, length=0.13, rose=0.052):
    """Lever on a leaf face at face_y, sticking out along y by sign `out`, blade toward x sign `toward`."""
    m.rod_y(f"{pre}-rose", rose, 0.01, [x, face_y + out * 0.005, z], mat)
    m.rod_y(f"{pre}-neck", 0.02, 0.05, [x, face_y + out * 0.035, z], mat)
    m.box(f"{pre}-lever", [length, 0.019, 0.019], [x + toward * (length / 2 - 0.01), face_y + out * (0.06 - 0.0095), z],
          mat, shape="rounded_box", radius=0.009)


def escutcheon(m, pre, x, z, face_y, out, mat, d=0.04):
    m.rod_y(f"{pre}-escutcheon", d, 0.008, [x, face_y + out * 0.004, z], mat)


def hinges(m, x, y, heights, mat, d=0.016, length=0.1):
    for z in heights:
        m.rod_z("hinge", d, length, [x, y, z], mat)


def window_sills(m, W, T, inner_y, outer_y, board, drip, board_t=0.025, proud=0.035):
    """Room-side sill board from the frame to past the wall face, weather sill outside."""
    depth = inner_y - (-T / 2 - proud)
    m.box("sill-board", [W + 0.08, depth, board_t], [0, inner_y - depth / 2, board_t / 2], board,
          shape="rounded_box", radius=0.004)
    d2 = T / 2 + 0.045 - outer_y
    m.box("sill-drip", [W + 0.04, d2, 0.01], [0, outer_y + d2 / 2, 0.005], drip)


def outer_frame(m, W, H, fw, fd, fy, mat, bottom=None):
    for s in (-1, 1):
        m.box("frame", [fw, fd, H], [s * (W / 2 - fw / 2), fy, H / 2], mat)
    m.box("frame-head", [W - 2 * fw, fd, fw], [0, fy, H - fw / 2], mat)
    bh = fw if bottom is None else bottom
    m.box("frame-bottom", [W - 2 * fw, fd, bh], [0, fy, bh / 2], mat)


def sash(m, pre, x0, x1, z0, z1, y_room, sd, sfw, mat, glass, gasket=None, bottom=None):
    """Rectangular sash or leaf frame spanning x0..x1, z0..z1, room face at y_room, glass in the middle."""
    w, h, yc = x1 - x0, z1 - z0, y_room + sd / 2
    bw = sfw if bottom is None else bottom
    cx = (x0 + x1) / 2
    for s, x in ((-1, x0 + sfw / 2), (1, x1 - sfw / 2)):
        m.box(f"{pre}-stile", [sfw, sd, h], [x, yc, z0 + h / 2], mat)
    m.box(f"{pre}-rail", [w - 2 * sfw, sd, sfw], [cx, yc, z1 - sfw / 2], mat)
    m.box(f"{pre}-rail", [w - 2 * sfw, sd, bw], [cx, yc, z0 + bw / 2], mat)
    gw, gh = w - 2 * sfw, h - sfw - bw
    gz = z0 + bw + gh / 2
    m.box(f"{pre}-glass", [gw + 0.02, 0.024, gh + 0.02], [cx, yc, gz], glass)
    if gasket:
        gy = yc - 0.012 - 0.003
        for x in (cx - gw / 2 + 0.002, cx + gw / 2 - 0.002):
            m.box(f"{pre}-gasket", [0.004, 0.006, gh], [x, gy, gz], gasket)
        for z in (gz - gh / 2 + 0.002, gz + gh / 2 - 0.002):
            m.box(f"{pre}-gasket", [gw - 0.008, 0.006, 0.004], [cx, gy, z], gasket)
    return gw, gh, gz


def pvc_handle(m, pre, x, z, face_y, mat, down=True):
    m.box(f"{pre}-handle-base", [0.03, 0.012, 0.075], [x, face_y - 0.006, z], mat, shape="rounded_box", radius=0.005)
    dz = -1 if down else 1
    m.box(f"{pre}-handle", [0.022, 0.018, 0.12], [x, face_y - 0.021, z + dz * (0.06 - 0.02)], mat,
          shape="rounded_box", radius=0.008)


# ---------- doors ----------

def door_flush_white():
    W, H, T = 0.9, 2.1, 0.12
    m = Model("door-flush-white", "door", "hinged", (W, H), T,
              "Flush interior door, matte white paint, brushed steel lever and hinges.")
    m.mat("paint", {"color": "#eeebe5", "roughness": 0.55})  # smooth paint: the painted-wood texture reads as distressed
    m.mat("steel", {"finish": "brushed-steel", "color": "#c6c8ca"})
    Wc, Hc = casing(m, W, H, T, "paint")
    lt, lw, lh = 0.04, Wc - 0.006, Hc - 0.011
    front = -T / 2
    stops(m, Wc, Hc, front + lt + 0.015, "paint")
    m.box("leaf", [lw, lt, lh], [0, front + lt / 2, 0.008 + lh / 2], "paint")
    hx = Wc / 2 - 0.003 - 0.065
    lever(m, "leaf-front", hx, 1.0, front, -1, "steel")
    lever(m, "leaf-back", hx, 1.0, front + lt, 1, "steel")
    for face, out in ((front, -1), (front + lt, 1)):
        escutcheon(m, "leaf-turn", hx, 0.915, face, out, "steel", d=0.036)
    hinges(m, -Wc / 2, front, [0.25, Hc - 0.5, Hc - 0.22], "steel")
    m.pivot("leaf", (-Wc / 2, front, 0), "rotate about +Y, 0..90deg, swings to the room side (+Z)")
    return m


def door_shaker_sage():
    W, H, T = 0.8, 2.05, 0.12
    m = Model("door-shaker-sage", "door", "hinged", (W, H), T,
              "Two-panel shaker door painted sage, colour-drenched frame, matte black hardware.")
    m.mat("paint", {"color": "#7f8b73", "roughness": 0.6})
    m.mat("black", {"finish": "black-metal", "color": "#29292b", "roughness": 0.4})
    Wc, Hc = casing(m, W, H, T, "paint")
    lw, lh, core = Wc - 0.006, Hc - 0.011, 0.03
    front = -T / 2
    lt = core + 0.02
    stops(m, Wc, Hc, front + lt + 0.015, "paint")
    z0 = 0.008
    m.box("leaf", [lw, core, lh], [0, front + 0.01 + core / 2, z0 + lh / 2], "paint")
    sw, top, lock, bottom = 0.11, 0.11, 0.14, 0.2
    for face in (front + 0.005, front + 0.01 + core + 0.005):
        for s in (-1, 1):
            m.box("leaf-stile", [sw, 0.01, lh], [s * (lw / 2 - sw / 2), face, z0 + lh / 2], "paint")
        inner = lw - 2 * sw
        m.box("leaf-rail-top", [inner, 0.01, top], [0, face, z0 + lh - top / 2], "paint")
        m.box("leaf-rail-lock", [inner, 0.01, lock], [0, face, 1.0], "paint")
        m.box("leaf-rail-bottom", [inner, 0.01, bottom], [0, face, z0 + bottom / 2], "paint")
    hx = Wc / 2 - 0.003 - 0.06
    lever(m, "leaf-front", hx, 1.0, front, -1, "black", length=0.12)
    lever(m, "leaf-back", hx, 1.0, front + lt, 1, "black", length=0.12)
    hinges(m, -Wc / 2, front, [0.25, Hc - 0.5, Hc - 0.22], "black")
    m.pivot("leaf", (-Wc / 2, front, 0), "rotate about +Y, 0..90deg, swings to the room side (+Z)")
    return m


def door_oak_glazed():
    W, H, T = 0.9, 2.1, 0.12
    m = Model("door-oak-glazed", "door", "hinged", (W, H), T,
              "Solid oak door with three satin glass lites, oak frame, black lever.")
    m.mat("oak", {"finish": "oak", "color": "#b48f63"})
    m.mat("black", {"finish": "black-metal", "color": "#232426", "roughness": 0.4})
    m.mat("glass", FROSTED)
    Wc, Hc = casing(m, W, H, T, "oak")
    lt, lw, lh, z0 = 0.045, Wc - 0.006, Hc - 0.011, 0.008
    front = -T / 2
    yc = front + lt / 2
    stops(m, Wc, Hc, front + lt + 0.015, "oak")
    sw, top, bottom, bar = 0.12, 0.12, 0.22, 0.05
    for s in (-1, 1):
        m.box("leaf-stile", [sw, lt, lh], [s * (lw / 2 - sw / 2), yc, z0 + lh / 2], "oak")
    inner = lw - 2 * sw
    m.box("leaf-rail-top", [inner, lt, top], [0, yc, z0 + lh - top / 2], "oak")
    m.box("leaf-rail-bottom", [inner, lt, bottom], [0, yc, z0 + bottom / 2], "oak")
    gz0, gz1 = z0 + bottom, z0 + lh - top
    lite = (gz1 - gz0 - 2 * bar) / 3
    m.box("leaf-glass", [inner + 0.02, 0.01, gz1 - gz0 + 0.02], [0, yc, (gz0 + gz1) / 2], "glass")
    for i in range(3):
        lz0 = gz0 + i * (lite + bar)
        if i:
            m.box("leaf-bar", [inner, lt, bar], [0, yc, lz0 - bar / 2], "oak")
        for face in (front + 0.006, front + lt - 0.006):
            for z in (lz0 + 0.006, lz0 + lite - 0.006):
                m.box("leaf-bead", [inner, 0.012, 0.012], [0, face, z], "oak")
            for x in (-inner / 2 + 0.006, inner / 2 - 0.006):
                m.box("leaf-bead", [0.012, 0.012, lite - 0.024], [x, face, lz0 + lite / 2], "oak")
    hx = Wc / 2 - 0.003 - 0.06
    lever(m, "leaf-front", hx, 1.02, front, -1, "black")
    lever(m, "leaf-back", hx, 1.02, front + lt, 1, "black")
    hinges(m, -Wc / 2, front, [0.25, Hc - 0.5, Hc - 0.22], "black")
    m.pivot("leaf", (-Wc / 2, front, 0), "rotate about +Y, 0..90deg, swings to the room side (+Z)")
    return m


def door_entrance_armored():
    W, H, T = 0.96, 2.1, 0.2
    m = Model("door-entrance-armored", "door", "hinged", (W, H), T,
              "Steel entrance door: charcoal steel outside, walnut slatted panel inside, two locks, peephole.")
    m.mat("steel", {"finish": "black-metal", "color": "#55575c", "roughness": 0.55})
    m.mat("walnut", {"finish": "walnut", "color": "#7a5942"})
    m.mat("chrome", {"finish": "brushed-steel", "color": "#d2d4d6"})
    m.mat("black", {"finish": "black-metal", "color": "#1c1d1f", "roughness": 0.35})
    fd, ff = 0.09, 0.06  # steel frame depth and face
    out_face = T / 2
    # steel frame on the landing side, walnut liners and architraves on the room side
    for s in (-1, 1):
        m.box("frame", [ff, fd, H], [s * (W / 2 - ff / 2), out_face - fd / 2, H / 2], "steel")
        m.box("frame-flange", [0.05, 0.004, H], [s * (W / 2 + 0.025 - 0.01), out_face + 0.002, H / 2], "steel")
    m.box("frame-head", [W - 2 * ff, fd, ff], [0, out_face - fd / 2, H - ff / 2], "steel")
    m.box("frame-flange-head", [W + 0.08, 0.004, 0.05], [0, out_face + 0.002, H + 0.025], "steel")
    m.box("threshold", [W - 2 * ff, fd, 0.025], [0, out_face - fd / 2, 0.0125], "chrome")
    casing(m, W, H, T, "walnut", jw=0.016, aw=0.08, at=0.016, faces=(-1,), y1=out_face - fd)
    Wf, z0, z1 = W - 2 * ff, 0.025, H - ff
    lw, lh = Wf - 0.006, z1 - z0 - 0.007
    y_in, y_out = out_face - 0.075, out_face - 0.005
    lz = z0 + 0.004 + lh / 2
    m.box("leaf", [lw, y_out - y_in - 0.012, lh], [0, (y_in + 0.012 + y_out) / 2, lz], "steel")
    # room face: walnut slats with routed grooves
    n, gap = 12, 0.005
    pw, ph = lw - 0.03, lh - 0.03
    slat = (ph - (n - 1) * gap) / n
    for i in range(n):
        m.box("leaf-slat", [pw, 0.012, slat], [0, y_in + 0.006, lz - ph / 2 + slat / 2 + i * (slat + gap)], "walnut")
    # landing face: two milled lines
    for x in (-lw / 6, lw / 6):
        m.box("leaf-line", [0.006, 0.002, lh - 0.3], [x, y_out + 0.001, lz], "black")
    hx = lw / 2 - 0.075
    lever(m, "leaf-in", hx, 1.0, y_in, -1, "chrome", length=0.14, rose=0.055)
    lever(m, "leaf-out", hx, 1.0, y_out, 1, "chrome", length=0.14, rose=0.055)
    for face, out in ((y_in, -1), (y_out, 1)):
        escutcheon(m, "leaf-lock-low", hx, 0.9, face, out, "chrome", d=0.045)
        escutcheon(m, "leaf-lock-high", hx, 1.4, face, out, "chrome", d=0.045)
    m.rod_y("leaf-peephole", 0.032, y_out - y_in + 0.012, [0, (y_in + y_out) / 2, 1.55], "chrome")
    hinges(m, -Wf / 2, y_out, [0.3, 1.05, z1 - 0.3], "black", d=0.024, length=0.13)
    m.pivot("leaf", (-Wf / 2, y_out, 0), "rotate about +Y, 0..90deg, swings out to the landing (-Z)")
    return m


def door_steel_french():
    W, H, T = 1.2, 2.15, 0.16
    m = Model("door-steel-french", "door", "double", (W, H), T,
              "Black steel French doors with a divided-lite grid and brass levers, for a balcony or a kitchen.")
    m.mat("steel", {"finish": "black-metal", "color": "#1f2023", "roughness": 0.35})
    m.mat("brass", {"finish": "brushed-steel", "color": "#b89a5e", "roughness": 0.35})
    m.mat("glass", GLASS)
    ff, fd = 0.045, 0.06
    outer_frame(m, W, H, ff, fd, 0, "steel", bottom=0.015)
    Wf, z0, z1 = W - 2 * ff, 0.015, H - ff
    lt, lh = 0.045, z1 - z0 - 0.006
    front = -lt / 2
    for side, x_hinge in (("l", -Wf / 2), ("r", Wf / 2)):
        s = 1 if side == "l" else -1
        xa, xb = sorted((x_hinge + s * 0.003, s * -0.0015))
        pre = f"leaf-{side}"
        sw, top, bottom = 0.05, 0.05, 0.18
        lw, cx, zc = xb - xa, (xa + xb) / 2, z0 + 0.003 + lh / 2
        lz0 = z0 + 0.003
        for x in (xa + sw / 2, xb - sw / 2):
            m.box(f"{pre}-stile", [sw, lt, lh], [x, 0, zc], "steel")
        m.box(f"{pre}-rail", [lw - 2 * sw, lt, top], [cx, 0, lz0 + lh - top / 2], "steel")
        m.box(f"{pre}-rail", [lw - 2 * sw, lt, bottom], [cx, 0, lz0 + bottom / 2], "steel")
        gw, gz0, gz1 = lw - 2 * sw, lz0 + bottom, lz0 + lh - top
        m.box(f"{pre}-glass", [gw + 0.02, 0.01, gz1 - gz0 + 0.02], [cx, 0, (gz0 + gz1) / 2], "glass")
        m.box(f"{pre}-muntin", [0.022, 0.03, gz1 - gz0], [cx, 0, (gz0 + gz1) / 2], "steel")
        rows = 5
        for i in range(1, rows):
            m.box(f"{pre}-muntin", [gw, 0.03, 0.022], [cx, 0, gz0 + i * (gz1 - gz0) / rows], "steel")
        hx = xb - 0.045 if side == "l" else xa + 0.045
        lever(m, f"{pre}-front", hx, 1.02, front, -1, "brass", toward=-s, length=0.12, rose=0.045)
        lever(m, f"{pre}-back", hx, 1.02, -front, 1, "brass", toward=-s, length=0.12, rose=0.045)
        hinges(m, x_hinge, front, [0.3, lz0 + lh - 0.3], "steel", d=0.018, length=0.11)
        m.pivot(pre, (x_hinge, front, 0), "rotate about +Y, 0..90deg, swings to the room side (+Z)")
    return m


# ---------- windows ----------

def window_pvc_tilt_turn():
    W, H, T = 1.5, 1.45, 0.2
    m = Model("window-pvc-tilt-turn", "window", "tilt", (W, H), T,
              "White PVC window, two tilt-and-turn sashes on a mullion, laminate sill board, steel weather sill.")
    m.mat("pvc", {"finish": "white-laminate", "color": "#f4f4f1", "roughness": 0.35})
    m.mat("glass", GLASS)
    m.mat("gasket", GASKET)
    m.mat("sill", {"finish": "white-laminate", "color": "#f0eee9"})
    m.mat("drip", {"finish": "brushed-steel", "color": "#b5b8bb"})
    fw, fd, fy, mw = 0.065, 0.07, 0.03, 0.08
    outer_frame(m, W, H, fw, fd, fy, "pvc")
    m.box("mullion", [mw, fd, H - 2 * fw], [0, fy, H / 2], "pvc")
    window_sills(m, W, T, fy - fd / 2, fy + fd / 2, "sill", "drip")
    y_room = fy - fd / 2 - 0.012
    lw = (W - 2 * fw - mw) / 2
    for side, s in (("l", -1), ("r", 1)):
        inner, outer = s * mw / 2, s * (mw / 2 + lw)
        x0, x1 = sorted((inner - s * 0.008, outer + s * 0.008))
        sash(m, f"sash-{side}", x0, x1, fw - 0.008, H - fw + 0.008, y_room, 0.076, 0.065, "pvc", "glass", "gasket")
        pvc_handle(m, f"sash-{side}", inner + s * 0.0245, H / 2, y_room, "pvc")
        m.pivot(f"sash-{side}", (outer + s * 0.008, y_room, 0), "turn: rotate about +Y 0..90deg into the room (+Z); tilt: top edge 0..10deg into the room about the bottom rail")
    return m


def window_alu_transom():
    W, H, T = 1.2, 1.5, 0.2
    m = Model("window-alu-transom", "window", "casement", (W, H), T,
              "Anthracite aluminium casement pair under a fixed transom light, oak sill board.")
    m.mat("alu", {"color": "#3b4045", "roughness": 0.5})  # powder coat, smooth
    m.mat("glass", GLASS)
    m.mat("gasket", GASKET)
    m.mat("oak", {"finish": "oak", "color": "#b08a5e"})
    m.mat("steel", {"finish": "brushed-steel", "color": "#c9cbcd"})
    fw, fd, fy, mw = 0.06, 0.075, 0.03, 0.06
    zt = H - 0.42  # transom bar centre
    outer_frame(m, W, H, fw, fd, fy, "alu")
    m.box("transom", [W - 2 * fw, fd, 0.06], [0, fy, zt], "alu")
    m.box("mullion", [mw, fd, zt - 0.03 - fw], [0, fy, fw + (zt - 0.03 - fw) / 2], "alu")
    tz0, tz1 = zt + 0.03, H - fw
    m.box("transom-glass", [W - 2 * fw + 0.02, 0.028, tz1 - tz0 + 0.02], [0, fy, (tz0 + tz1) / 2], "glass")
    by = fy - 0.014 - 0.01
    for z in (tz0 + 0.01, tz1 - 0.01):
        m.box("transom-bead", [W - 2 * fw, 0.02, 0.02], [0, by, z], "alu")
    for x in (-(W / 2 - fw - 0.01), W / 2 - fw - 0.01):
        m.box("transom-bead", [0.02, 0.02, tz1 - tz0 - 0.04], [x, by, (tz0 + tz1) / 2], "alu")
    window_sills(m, W, T, fy - fd / 2, fy + fd / 2, "oak", "alu", board_t=0.03)
    y_room = fy - fd / 2 - 0.01
    lw = (W - 2 * fw - mw) / 2
    for side, s in (("l", -1), ("r", 1)):
        inner, outer = s * mw / 2, s * (mw / 2 + lw)
        x0, x1 = sorted((inner - s * 0.008, outer + s * 0.008))
        sash(m, f"sash-{side}", x0, x1, fw - 0.008, zt - 0.03 + 0.008, y_room, 0.07, 0.055, "alu", "glass", "gasket")
        m.box(f"sash-{side}-handle-base", [0.026, 0.01, 0.06], [inner + s * 0.0195, y_room - 0.005, (zt - 0.03) / 2 + 0.03], "steel",
              shape="rounded_box", radius=0.004)
        m.box(f"sash-{side}-handle", [0.016, 0.016, 0.115], [inner + s * 0.0195, y_room - 0.018, (zt - 0.03) / 2 - 0.01], "steel",
              shape="rounded_box", radius=0.0075)
        m.pivot(f"sash-{side}", (outer + s * 0.008, y_room, 0), "rotate about +Y, 0..90deg into the room (+Z)")
    return m


def window_panoramic_slider():
    W, H, T = 2.4, 1.45, 0.2
    m = Model("window-panoramic-slider", "window", "sliding", (W, H), T,
              "Black slim-line aluminium sliding window, two big panes, marble sill board.")
    m.mat("alu", {"finish": "black-metal", "color": "#1d1e21", "roughness": 0.4})
    m.mat("glass", GLASS)
    m.mat("marble", {"finish": "marble-white", "color": "#ebe8e3"})
    fw, fd, fy, track = 0.05, 0.13, 0.02, 0.045
    outer_frame(m, W, H, fw, fd, fy, "alu", bottom=track)
    for dy in (-0.03, 0.03):
        m.box("rail", [W - 2 * fw, 0.008, 0.012], [0, fy + dy, track + 0.006], "alu")
    window_sills(m, W, T, fy - fd / 2, fy + fd / 2, "marble", "alu", board_t=0.03)
    pz0, pz1 = track + 0.012, H - fw + 0.012
    pw = (W - 2 * fw) / 2 + 0.025
    xl, xr = -(W / 2 - fw), W / 2 - fw
    # a: fixed on the outer track, left; b: slides left on the room-side track
    for pre, x0, x1, dy in (("sash-a", xl - 0.012, xl + pw, 0.03), ("sash-b", xr - pw, xr + 0.012, -0.03)):
        sash(m, pre, x0, x1, pz0, pz1, fy + dy - 0.025, 0.05, 0.045, "alu", "glass", bottom=0.055)
    m.box("sash-b-pull", [0.02, 0.022, 0.32], [xr - pw + 0.0225, fy - 0.03 - 0.025 - 0.011, pz0 + 0.62], "alu",
          shape="rounded_box", radius=0.008)
    m.pivot("sash-b", (xr, fy - 0.03, 0), f"translate 0..{pw - 0.05:.2f} m along -X")
    return m


def window_oak_box():
    W, H, T = 1.7, 1.45, 0.2
    m = Model("window-oak-box", "window", "fixed", (W, H), T,
              "Picture window: a solid oak box lining the whole reveal, proud of the wall, slim black fixed frame.")
    m.mat("oak", {"finish": "oak", "color": "#b58f62"})
    m.mat("black", {"finish": "black-metal", "color": "#1e1f22", "roughness": 0.4})
    m.mat("glass", GLASS)
    fy, fd, fw = T / 2 - 0.055, 0.07, 0.04
    y0, y1 = -T / 2 - 0.04, fy - fd / 2
    by, bd = (y0 + y1) / 2, y1 - y0
    bt, st, tt = 0.045, 0.03, 0.03
    m.box("box-bottom", [W, bd, bt], [0, by, bt / 2], "oak")
    m.box("box-top", [W, bd, tt], [0, by, H - tt / 2], "oak")
    for s in (-1, 1):
        m.box("box-side", [st, bd, H - bt - tt], [s * (W / 2 - st / 2), by, bt + (H - bt - tt) / 2], "oak")
    # black frame fills the hole behind the box; from the room only fw of it shows
    sx, zb, zt = st + fw, bt + fw, H - tt - fw
    for s in (-1, 1):
        m.box("frame", [sx, fd, H], [s * (W / 2 - sx / 2), fy, H / 2], "black")
    m.box("frame-head", [W - 2 * sx, fd, H - zt], [0, fy, (zt + H) / 2], "black")
    m.box("frame-bottom", [W - 2 * sx, fd, zb], [0, fy, zb / 2], "black")
    m.box("glass", [W - 2 * sx + 0.02, 0.03, zt - zb + 0.02], [0, fy, (zb + zt) / 2], "glass")
    d2 = T / 2 + 0.045 - (fy + fd / 2)
    m.box("sill-drip", [W + 0.04, d2, 0.01], [0, fy + fd / 2 + d2 / 2, 0.005], "black")
    return m


def window_bath_hopper():
    W, H, T = 1.0, 0.8, 0.16
    m = Model("window-bath-hopper", "window", "tilt", (W, H), T,
              "Small white PVC bathroom window, satin glass, tilts in from the bottom rail.")
    m.mat("pvc", {"finish": "white-laminate", "color": "#f4f4f1", "roughness": 0.35})
    m.mat("glass", FROSTED)
    m.mat("gasket", GASKET)
    m.mat("sill", {"finish": "white-laminate", "color": "#f0eee9"})
    m.mat("drip", {"finish": "brushed-steel", "color": "#b5b8bb"})
    fw, fd, fy = 0.065, 0.07, 0.02
    outer_frame(m, W, H, fw, fd, fy, "pvc")
    window_sills(m, W, T, fy - fd / 2, fy + fd / 2, "sill", "drip", proud=0.025)
    y_room = fy - fd / 2 - 0.012
    sash(m, "sash", -W / 2 + fw - 0.008, W / 2 - fw + 0.008, fw - 0.008, H - fw + 0.008, y_room, 0.076, 0.065,
         "pvc", "glass", "gasket")
    m.box("sash-handle-base", [0.075, 0.012, 0.03], [0, y_room - 0.006, H - fw - 0.0245], "pvc", shape="rounded_box", radius=0.005)
    m.box("sash-handle", [0.12, 0.018, 0.022], [0.04, y_room - 0.021, H - fw - 0.0245], "pvc", shape="rounded_box", radius=0.008)
    m.pivot("sash", (0, y_room, fw - 0.008), "rotate about X through the bottom rail, 0..12deg, top into the room (+Z)")
    return m


MODELS = [door_flush_white, door_shaker_sage, door_oak_glazed, door_entrance_armored, door_steel_french,
          window_pvc_tilt_turn, window_alu_transom, window_panoramic_slider, window_oak_box, window_bath_hopper]


def program(m: Model) -> dict:
    prog = {"name": m.name, "size": [1, 1, 1], "materials": m.materials, "parts": m.parts}
    parts = build(Program.model_validate(prog))
    lo = min(p.lo[2] for p in parts)
    size = [max(p.hi[k] for p in parts) - min(p.lo[k] for p in parts) for k in range(3)]
    assert abs(lo) < 1e-6, f"{m.name}: lowest point {lo}"
    prog["size"] = [round(s, 4) for s in size]
    return prog


def main() -> None:
    manifest = []
    with tempfile.TemporaryDirectory() as tmp:
        for make in MODELS:
            m = make()
            prog = program(m)
            src = Path(tmp) / f"{m.name}.json"
            src.write_text(json.dumps(prog))
            work = Path(tmp) / m.name
            faults = compile_file(src, work)
            if faults:
                sys.exit(f"{m.name}: {json.dumps(faults, indent=1)}")
            report = json.loads((work / "report.json").read_text())
            w, d, h = prog["size"]
            entry = {"file": f"{m.name}.glb", "kind": m.kind, "mechanism": m.mechanism, "about": m.about,
                     "opening_m": {"width": m.opening[0], "height": m.opening[1]}, "wall_m": m.wall,
                     "size_m": {"width": w, "height": h, "depth": d}, "moving": m.pivots,
                     "parts": report["parts"], "triangles": report["triangles"]}
            # the piece frame says "floor centre of the footprint"; an opening is placed by its hole instead
            doc, binary = glb.read((work / "piece.glb").read_bytes())
            root = doc["nodes"][doc["scenes"][0]["nodes"][0]]["extras"]["varpet"]
            root["schema"] = "varpet.opening.v1"
            root["frame"] = {**glb.FRAME, "origin": "bottom centre of the wall opening, on the wall's middle plane",
                             "front": "+Z is the room side"}
            root["opening"] = {k: entry[k] for k in ("kind", "mechanism", "opening_m", "wall_m", "moving")}
            (HERE / f"{m.name}.glb").write_bytes(glb.write(doc, binary))
            manifest.append(entry | {"bytes": (HERE / f"{m.name}.glb").stat().st_size})
            print(f"{m.name}: {report['parts']} parts, {report['triangles']} tris")
    (HERE / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")


if __name__ == "__main__":
    main()
