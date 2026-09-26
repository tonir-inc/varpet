"""Pure-python profiles shared by textures.py (uv/PIL) and build.py (Blender), so painted textures line up with UVs.

Normalized vessel UVs: u = angle / 2pi, v = arc length along the profile. The outside (foot disc, wall, lip) takes
v in [0, SPLIT] and the inside (rim down to the floor) v in [SPLIT, 1], both proportional to arc length, so a
motif drawn at physical size on a (circumference x arc) canvas lands undistorted where the radius matches.
Image row 0 is the TOP of the PNG = v 1 (inside floor); the foot is the bottom row.
"""
import math

SPLIT = 0.6


def smooth_profile(pts, n=40):
    """Catmull-Rom through control points [(r, z)] -> dense profile."""
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    segs = len(pts) - 1
    per = max(2, n // segs)
    for s in range(segs):
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        for i in range(per):
            t = i / per
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                                    + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in (0, 1)))
    out.append(tuple(pts[-1]))
    return out


def vessel_profile(outer, wall, lip=None, depth=None):
    """Full revolve profile of a hollow vessel -> (profile, n_out). profile[:n_out] is the outside + rounded lip."""
    lip = lip if lip is not None else wall / 2
    r_rim, z_rim = outer[-1]
    prof = [(0.0, 0.0)] + list(outer[:-1])
    cx = r_rim - wall / 2
    for i in range(7):
        t = math.pi * i / 6
        prof.append((cx + (wall / 2) * math.cos(t), z_rim + lip * math.sin(t) * 0.9))
    stop = z_rim - depth if depth else wall * 1.4
    inner = []
    for r, z in reversed(outer[:-1]):
        if z <= stop:
            break
        inner.append((max(r - wall, wall * 0.6), z))
    inner.append((max((inner[-1][0] if inner else r_rim - wall) * 0.92, wall * 0.6), stop))
    inner.append((0.0, stop))
    return prof + inner, len(prof)


def arcs(profile):
    s = [0.0]
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        s.append(s[-1] + math.hypot(r1 - r0, z1 - z0))
    return s


def vessel_v(profile, n_out, split=SPLIT):
    """Per-point v: arc-length fractions, outside [0, split], inside [split, 1]."""
    s = arcs(profile)
    so, st = s[n_out - 1], s[-1]
    return [split * x / so if k < n_out else split + (1 - split) * (x - so) / (st - so) for k, x in enumerate(s)]


def v_at(profile, n_out, z, inside=False, split=SPLIT):
    """v of the outside (or inside) surface at height z: to place a painted band at a real height."""
    vs = vessel_v(profile, n_out, split)
    idx = range(n_out, len(profile)) if inside else range(1, n_out)
    best = min(idx, key=lambda k: abs(profile[k][1] - z))
    return vs[best]


def canvas(profile, n_out, split=SPLIT):
    """Physical metres covered by the outside / inside bands: (outside arc, inside arc, max radius)."""
    s = arcs(profile)
    return s[n_out - 1], s[-1] - s[n_out - 1], max(r for r, _ in profile)


# ------------------------------------------------------------------ pieces whose textures follow the profile
POM_BOWL = dict(outer=smooth_profile([(0.045, 0), (0.05, 0.004), (0.085, 0.022), (0.118, 0.05), (0.132, 0.075),
                                      (0.134, 0.085)], 36), wall=0.006)
POM_VASE = dict(outer=smooth_profile([(0.05, 0), (0.07, 0.03), (0.095, 0.1), (0.098, 0.15), (0.08, 0.215),
                                      (0.042, 0.26), (0.034, 0.285), (0.036, 0.31), (0.044, 0.325)], 64),
                wall=0.006, depth=0.07)
TRAY = dict(outer=[(0.15, 0), (0.158, 0.003), (0.16, 0.012), (0.165, 0.02), (0.167, 0.022)], wall=0.004)


def vessel_of(d):
    return vessel_profile(d["outer"], d["wall"], d.get("lip"), d.get("depth"))


def plain_v(profile):
    """Per-point v = arc-length fraction over a whole (non-vessel) revolve profile."""
    s = arcs(profile)
    return [x / s[-1] for x in s]


# footed brass pillar-candle holder: engraved band on the straight drum z 0.032..0.088 (r 0.042)
HOLDER = [(0.0, 0.0), (0.064, 0.0), (0.066, 0.003), (0.064, 0.009), (0.056, 0.014), (0.046, 0.02), (0.043, 0.026),
          (0.042, 0.032), (0.042, 0.06), (0.042, 0.088), (0.045, 0.092), (0.05, 0.094), (0.052, 0.098),
          (0.05, 0.1), (0.044, 0.1), (0.04, 0.096), (0.039, 0.082), (0.0, 0.082)]
HOLDER_BAND = (7, 9)  # profile indices bounding the engraved drum
