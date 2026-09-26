"""Design-led planters for the plants2 lane: fluted concrete, ribbed terracotta, black matte cylinder, woven
seagrass belly basket, travertine bowl, oak mid-century stand, tall stoneware floor vase.

Each planter stands on z=0 and returns (soil z, inner radius at the soil line). Texture names carry a "p2-"
prefix so they never collide with the plants lane. Uses plants/parts.py read-only.
"""
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "plants"))
sys.path.insert(0, str(HERE.parent))
import kit  # noqa: E402
import parts as P  # noqa: E402  (plants lane, read-only)
from parts import Builder, mat  # noqa: E402


def _smooth_band(z, lo, hi, soft=0.012):
    """1 inside [lo, hi], easing to 0 over `soft` metres outside."""
    a = min(1.0, max(0.0, (z - lo) / soft))
    b = min(1.0, max(0.0, (hi - z) / soft))
    return a * b


def fluted_concrete(r, h, seed=1, tint="#a9a69e", flutes=30, soil_drop=0.03, cover="soil"):
    """Straight concrete cylinder with deep vertical flutes between a plain foot band and rim band."""
    B = Builder()
    wall = 0.02
    pitch = 2 * math.pi / flutes
    depth = r * pitch * 0.32

    def disp(th, z):
        f = (th % pitch) / pitch
        return -depth * math.sin(math.pi * f) ** 0.8 * _smooth_band(z, 0.035, h - 0.045)

    prof = [(0, 0.0), (r - 0.006, 0.0), (r, 0.006)]
    prof += [(r, z) for z in np.linspace(0.02, h - 0.02, 26)]
    prof += [(r, h - 0.004), (r - 0.004, h), (r - wall, h), (r - wall, h - 0.06), (r - wall - 0.01, 0.04), (0, 0.04)]
    P.lathe(B, prof, steps=flutes * 8, v_scale=1.0, disp=disp)
    B.obj("pot", mat("p2-concrete", tex=P.texture_concrete("p2-concrete" + str(seed), seed, tint), rough=0.92))
    inner = r - wall - 0.002
    P._soil(inner, h - soil_drop, seed, cover)
    return h - soil_drop, inner


def ribbed_terracotta(r_top, h, r_bot=None, seed=2, tint="#b6623c", ribs=11, soil_drop=0.03, cover="soil"):
    """Tapered terracotta pot with stacked rounded horizontal ribs (ribbed 'Hoop' planter)."""
    r_bot = r_bot or r_top * 0.78
    B = Builder()
    wall = 0.016
    body = h - 0.012
    rib_h = body / ribs
    prof = [(0, 0.0), (r_bot - 0.01, 0.0), (r_bot, 0.008)]
    n = ribs * 8
    for i in range(1, n + 1):
        z = 0.008 + (body - 0.008) * i / n
        f = z / h
        base_r = r_bot + (r_top - r_bot) * f ** 0.9
        ph = ((z - 0.008) / rib_h) % 1.0
        prof.append((base_r + 0.009 * math.sin(math.pi * ph) ** 0.6, z))
    prof += [(r_top + 0.004, h - 0.004), (r_top, h), (r_top - wall, h), (r_top - wall - 0.004, h - 0.06),
             (r_bot - wall, 0.04), (0, 0.04)]
    P.lathe(B, prof, steps=96, v_scale=1.0)
    B.obj("pot", mat("p2-terracotta", tex=P.texture_terracotta("p2-terracotta" + str(seed), seed, tint), rough=0.86))
    inner = r_top - wall - 0.004
    P._soil(inner, h - soil_drop, seed, cover)
    return h - soil_drop, inner


def black_cylinder(r, h, seed=3, tint="#1e1e1f", soil_drop=0.03, cover="soil"):
    """Tall matte black cylinder with a softly rounded rim, recessed plinth shadow gap at the foot."""
    B = Builder()
    wall = 0.012
    prof = [(0, 0.0), (r - 0.02, 0.0), (r - 0.02, 0.012), (r - 0.004, 0.014), (r, 0.02)]
    prof += [(r, z) for z in np.linspace(0.04, h - 0.01, 6)]
    prof += [(r - 0.001, h - 0.004), (r - 0.005, h), (r - wall + 0.002, h), (r - wall, h - 0.006),
             (r - wall, h - 0.08), (0, h - 0.08)]
    P.lathe(B, prof, steps=72, v_scale=1.0)
    B.obj("pot", mat("p2-black", tex=P.texture_speckle("p2-black" + str(seed), tint, seed, 0.05, 0.0), rough=0.7))
    inner = r - wall
    P._soil(inner, h - soil_drop, seed, cover)
    return h - soil_drop, inner


def seagrass_belly(r_top, h, seed=4, tint="#bf9f6c", soil_drop=0.05, cover="soil"):
    """Woven seagrass belly basket with a rolled rim and two rope loop handles."""
    soil_z, inner = P.pot("basket", r_top, h, r_bot=r_top * 0.82, seed=seed, tint=tint, soil_drop=soil_drop, cover=cover)
    H = Builder()
    for a in (0.0, math.pi):
        c = (math.cos(a), math.sin(a))
        side = (-math.sin(a), math.cos(a))
        pts = []
        for k in range(13):
            t = k / 12
            ang = math.pi * t
            off = 0.055 * math.cos(ang)
            out = r_top + 0.012 + 0.03 * math.sin(ang)
            pts.append((c[0] * out + side[0] * off, c[1] * out + side[1] * off, h - 0.035 + 0.02 * math.sin(ang)))
        P.tube(H, pts, 0.007, sides=8, v_scale=30)
    H.obj("handles", mat("p2-rope", tex=P.image("p2-rope" + str(seed), _rope(tint)), rough=0.9))
    return soil_z, inner


def _rope(tint):
    H, W = 64, 256
    u = np.linspace(0, 1, W)[None, :]
    v = np.linspace(0, 1, H)[:, None]
    tw = 0.5 + 0.5 * np.sin((u * 3 + v * 6) * 2 * np.pi)
    return P.rgb(tint) * (0.6 + 0.45 * tw[..., None]) * np.ones((H, W, 3))


def travertine_bowl(r_top, h, r_foot=None, seed=5, soil_drop=0.03, cover="soil"):
    """Wide honed travertine bowl on a short recessed foot (the 'Luna' shape)."""
    r_foot = r_foot or r_top * 0.45
    prof = [(0.001, 0.0), (r_foot, 0.0), (r_foot, 0.04), (r_foot + 0.01, 0.045)]
    for i in range(1, 13):
        f = i / 12
        prof.append((r_foot + 0.01 + (r_top - r_foot - 0.01) * math.sin(f * math.pi / 2) ** 0.75, 0.045 + (h - 0.045) * f))
    wall = 0.022
    prof += [(r_top - 0.006, h + 0.002), (r_top - wall, h), (r_top - wall - 0.02, h - 0.06), (0.001, h - 0.06)]
    kit.lathe(prof, "travertine", steps=80, roughness=0.6, name="pot")
    inner = r_top - wall - 0.01
    P._soil(inner, h - soil_drop, seed, cover)
    return h - soil_drop, inner


def travertine_cylinder(r, h, seed=6, soil_drop=0.03, cover="soil"):
    """Honed travertine drum with a softened top edge."""
    wall = 0.025
    prof = [(0.001, 0.0), (r - 0.006, 0.0), (r, 0.006), (r, h - 0.008), (r - 0.004, h), (r - wall, h),
            (r - wall, h - 0.06), (0.001, h - 0.06)]
    kit.lathe(prof, "travertine", steps=80, roughness=0.6, name="pot")
    inner = r - wall
    P._soil(inner, h - soil_drop, seed, cover)
    return h - soil_drop, inner


def oak_stand(pot_r, height, legs=4, seat=0.1):
    """Mid-century oak plant stand: a ring hugging the pot at `height`, splayed tapered legs, and two crossed dowels
    `seat` below the ring that the pot bottom rests on (lift the pot by height - seat)."""
    ring_r = pot_r + 0.013
    out = []
    for i in range(legs):
        a = 2 * math.pi * i / legs + math.pi / 4
        top = ((ring_r + 0.012) * math.cos(a), (ring_r + 0.012) * math.sin(a))
        out.append(kit.taper_leg(height + 0.01, 0.014, 0.009, (top[0], top[1], height), "oak-rift", splay_deg=9,
                                 toward=(0.0, 0.0)))
    R = Builder()
    pts = [(ring_r * math.cos(2 * math.pi * k / 48), ring_r * math.sin(2 * math.pi * k / 48), height - 0.014)
           for k in range(49)]
    P.tube(R, pts, 0.013, sides=10, cap_end=False, v_scale=1.0)
    zc = height - seat - 0.009
    for a in (math.pi / 4, 3 * math.pi / 4):
        e = (ring_r + 0.02) * math.cos(a), (ring_r + 0.02) * math.sin(a)
        P.tube(R, [(-e[0], -e[1], zc), (e[0], e[1], zc)], 0.009, sides=8, cap_end=False, v_scale=1.0)
    out.append(R.obj("ring", kit.material("oak-rift")[0]))
    return out


def floor_vase(seed=7, tint="#3c3632", h=0.62):
    """Tall stoneware floor vase: wide shoulder, narrow neck, reactive dark glaze with a paler rim."""
    B = Builder()
    vz = [0.0, 0.05, 0.14, 0.26, 0.38, 0.47, 0.53, 0.57, 0.6, 1.0]
    vr = [0.1, 0.13, 0.155, 0.165, 0.15, 0.11, 0.075, 0.062, 0.06, 0.07]
    zs = np.linspace(0.012, h - 0.012, 26)
    prof = [(0, 0.004), (0.095, 0.0)] + [(float(np.interp(z / h * 0.62, vz, vr)), z) for z in zs]
    prof += [(0.068, h), (0.058, h - 0.004), (0.052, h - 0.08), (0, h - 0.08)]
    P.lathe(B, prof, steps=64, v_scale=1.0)
    rng = np.random.default_rng(seed)
    Hh, W = 256, 512
    n = P.fbm(Hh, W, 3, 10, rng, 4, wrap_x=True)
    drip = P.vnoise(Hh, W, 3, 60, rng, wrap_x=True)
    v = np.linspace(0, 1, Hh)[:, None]
    col = P.rgb(tint) * (0.8 + 0.35 * n[..., None])
    run = np.clip((v - 0.72 + 0.12 * drip) / 0.08, 0, 1)[..., None]  # paler glaze breaking at the shoulder
    col = col * (1 - 0.5 * run) + P.rgb("#8c7f70") * 0.5 * run
    B.obj("vase", mat("p2-vase", tex=P.image("p2-vase" + str(seed), col), rough=0.45))
    return h
