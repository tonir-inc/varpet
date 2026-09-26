"""Leather, stone and metal finishes."""
import numpy as np

from core import (
    N, ao_from_height, blur_noise, fbm, gblur, norm01, normal_from_height, rot_noise, smoothstep, std,
    tint_ready, voronoi, warp,
)


def _jittered_points(rng, cell_px):
    k = int(round(N / cell_px))
    gy, gx = np.mgrid[0:k, 0:k]
    pts = np.stack([gy.ravel(), gx.ravel()], 1).astype(float) + rng.uniform(0.1, 0.9, (k * k, 2))
    return pts * (N / k)


def _random_points(rng, mean_cell_px, density=None):
    """Uniform random points; optional density field (N,N) in 0..1 thins them by rejection."""
    n = int((N / mean_cell_px) ** 2)
    pts = rng.uniform(0, N, (int(n * 1.6), 2))
    if density is None:
        return pts[:n]
    keep = rng.random(len(pts)) < density[pts[:, 0].astype(int), pts[:, 1].astype(int)]
    return pts[keep]


def _poisson_keep(pts, rmin):
    """Greedy periodic dart-throwing filter: keep points no closer than rmin to an earlier kept one."""
    from scipy.spatial import cKDTree

    tree = cKDTree(np.mod(pts, N), boxsize=N)
    keep = np.ones(len(pts), bool)
    for i, j in sorted(tree.query_pairs(rmin)):
        if keep[i] and keep[j]:
            keep[j] = False
    return keep


def leather(rng, tile_m=0.2):
    px_mm = N / (tile_m * 1000)
    qy, qx = np.mgrid[0:N, 0:N].astype(float) + 0.5
    # pebble size drifts across the hide (about 2-3 mm, ~80 across the tile)
    dens = 0.55 + 0.45 * norm01(fbm(rng, 220, 3))
    pts = _random_points(rng, 1.5 * px_mm, dens)
    # thin to a blue-noise set so pebbles are evenly sized and rounded, not slivers
    pts = pts[_poisson_keep(pts, 1.9 * px_mm)]
    wy, wx = 2.0 * fbm(rng, 9, 3), 2.0 * fbm(rng, 9, 3)
    d, idx = voronoi(pts, qx=qx + wx, qy=qy + wy)
    f1, f2 = d[..., 0], d[..., 1]
    edge = f2 - f1  # ~2x distance to the cell border
    t = 2 * f1 / (f1 + f2 + 1e-9)
    cell_h = rng.uniform(0.7, 1.0, len(pts))[idx[..., 0]]
    # flattened dome: plateau top, rounding off into a V-shaped crease
    dome = gblur(smoothstep(0.0, 1.4 * px_mm, edge) ** 0.6 * (1 - 0.15 * t**2), 1.0)
    crease = 1 - smoothstep(0.0, 0.7 * px_mm, edge)
    pebble = dome * cell_h
    # micro grain on pebble tops and a few long fold creases across the hide
    micro = blur_noise(rng, 0.9)
    region = norm01(fbm(rng, 250, 3))
    folds = (1 - smoothstep(0, 0.07, np.abs(warp(fbm(rng, 90, 3, aniso=1.6), 10 * fbm(rng, 60, 2), 10 * fbm(rng, 60, 2)))))
    folds *= smoothstep(0.4, 0.9, region)
    pores = smoothstep(2.9, 3.6, blur_noise(rng, 0.8)) * (1 - crease)

    h = 0.22 * pebble - 0.06 * crease - 0.05 * folds - 0.02 * pores + 0.006 * micro
    cav = ao_from_height(h, 4)
    mottling = fbm(rng, 35, 4, gain=0.6)
    lum = (0.8 + 0.2 * cav) * (1 + 0.025 * mottling) * (1 - 0.05 * folds) * (1 + 0.04 * (pebble - 0.6)) * (1 + 0.015 * micro)
    base = tint_ready(lum)
    normal = normal_from_height(h, tile_m)
    # burnished pebble tops read glossier; creases dry and matte; broad sheen drift across the hide
    sheen = norm01(fbm(rng, 140, 3))
    rough = 0.6 - 0.14 * pebble + 0.12 * crease + 0.08 * folds + 0.08 * pores + 0.08 * (sheen - 0.5) + 0.02 * micro
    return base, normal, rough


def _rot_fbm(rng, scale, octaves, stretch, angle, gain=0.5):
    out = np.zeros((N, N))
    amp = 1.0
    for _ in range(octaves):
        out += amp * rot_noise(rng, scale * stretch, scale, angle)
        amp *= gain
        scale /= 2
    return std(out)


def marble(rng, tile_m=1.2):
    cloud = fbm(rng, 220, 6, gain=0.55)
    # main veins: zero set of a low-frequency, strongly warped field -> a few long wandering veins
    # (isotropic source, so no shared diagonal that would line up into a lattice when tiled)
    # main veins: zero sets of two strongly warped, mildly stretched fields at unrelated angles,
    # so veins wander and cross instead of stacking on one shared diagonal
    a1 = rng.uniform(0, np.pi)
    a2 = a1 + rng.uniform(0.9, 1.6)
    wx, wy = 70 * fbm(rng, 240, 4), 70 * fbm(rng, 240, 4)
    fa = warp(_rot_fbm(rng, 150, 4, 2.2, a1, gain=0.4), wx, wy) + 0.03 * fbm(rng, 12, 3)
    fb = warp(_rot_fbm(rng, 190, 4, 2.2, a2, gain=0.4), wy, wx) + 0.03 * fbm(rng, 12, 3)
    strength_a = norm01(fbm(rng, 200, 3))
    strength_b = 0.6 * norm01(fbm(rng, 200, 3))
    width = 0.02 + 0.12 * norm01(fbm(rng, 150, 3)) ** 2
    main = np.zeros((N, N))
    soft = np.zeros((N, N))
    for f, st in ((fa, strength_a), (fb, strength_b)):
        dist = np.abs(f)
        main = np.maximum(main, (1 - smoothstep(0, 1, dist / width)) * (0.2 + 0.8 * st))
        soft = np.maximum(soft, (1 - smoothstep(0, 1, dist / (width * 7))) * (0.15 + 0.85 * st))
    # branches splitting off the main veins: iso-lines of a finer field, only near a main vein
    br = warp(fbm(rng, 90, 4), 30 * fbm(rng, 120, 3), 30 * fbm(rng, 120, 3))
    branch = (1 - smoothstep(0, 0.05, np.abs(br))) * smoothstep(0.05, 0.4, soft)
    main = np.maximum(gblur(main, 1.0), 0.6 * branch)
    # faint secondary veins over the whole slab
    v2 = warp(fbm(rng, 70, 5), 20 * fbm(rng, 90, 3), 20 * fbm(rng, 90, 3))
    thin = (1 - smoothstep(0, 0.035, np.abs(v2))) * smoothstep(0.4, 0.9, norm01(fbm(rng, 160, 3)))
    grain = blur_noise(rng, 0.9)
    lum = (1 + 0.045 * cloud + 0.01 * grain) * (1 - 0.38 * main - 0.18 * soft - 0.07 * thin)
    base = tint_ready(lum)
    h = -0.003 * main - 0.0015 * thin + 0.0008 * grain
    normal = normal_from_height(h, tile_m)
    rough = 0.11 + 0.03 * norm01(cloud) + 0.06 * main + 0.03 * thin + 0.015 * grain
    return base, normal, rough


def terrazzo(rng, tile_m=0.4):
    px_mm = N / (tile_m * 1000)
    qy, qx = np.mgrid[0:N, 0:N].astype(float) + 0.5
    matrix = 1 + 0.03 * fbm(rng, 80, 4) + 0.04 * blur_noise(rng, 0.7)
    lum = matrix.copy()
    chip_mask = np.zeros((N, N))
    rough = 0.3 + 0.03 * blur_noise(rng, 1.5)
    h = 0.0 * lum
    # large, medium, small chips; each class is a sparse periodic voronoi cut by a random disc
    for size_mm, density, keep in ((16, 1.0, 0.7), (8, 1.0, 0.6), (3.5, 1.0, 0.35)):
        cell = size_mm * px_mm * 1.3
        pts = _jittered_points(rng, cell)
        wx, wy = 0.08 * cell * fbm(rng, cell / 4, 3), 0.08 * cell * fbm(rng, cell / 4, 3)
        d, idx = voronoi(pts, qx=qx + wx, qy=qy + wy)
        n = len(pts)
        rad = rng.uniform(0.18, 0.4, n) * cell
        active = rng.random(n) < keep
        i0 = idx[..., 0]
        inside = smoothstep(1.2, 0.2, d[..., 0] - rad[i0]) * smoothstep(0.8, 2.2, d[..., 1] - d[..., 0])
        inside *= active[i0]
        inside *= 1 - chip_mask  # later (smaller) chips sit behind earlier ones
        tone = rng.choice([0.45, 0.62, 0.8, 1.0, 1.08, 1.15], n, p=[0.07, 0.13, 0.2, 0.22, 0.22, 0.16])
        tone = tone * (1 + 0.05 * rng.standard_normal(n))
        speck = 1 + 0.04 * blur_noise(rng, 1.2)
        lum = lum * (1 - inside) + tone[i0] * speck * inside
        rough = rough * (1 - inside) + rng.uniform(0.12, 0.22, n)[i0] * inside
        h = h + inside * rng.uniform(-0.004, 0.004, n)[i0]
        chip_mask = np.clip(chip_mask + inside, 0, 1)
    # air holes in the cement
    holes = smoothstep(3.1, 3.7, blur_noise(rng, 1.3)) * (1 - chip_mask)
    lum *= 1 - 0.35 * holes
    h = h - 0.05 * holes
    rough = rough + 0.4 * holes
    base = tint_ready(lum)
    normal = normal_from_height(h, tile_m)
    return base, normal, rough


def brushed_steel(rng, tile_m=0.3):
    # abrasive streaks along U at several lengths, amplitude varying slowly across the sheet
    amp = 0.7 + 0.3 * norm01(blur_noise(rng, 200, 120))
    s1 = blur_noise(rng, 120, 0.5)
    s2 = blur_noise(rng, 40, 0.7)
    s3 = blur_noise(rng, 300, 1.2)
    streak = amp * (0.6 * s1 + 0.5 * s2 + 0.3 * s3)
    # occasional deeper scratches, slightly off-axis
    sc = rot_noise(rng, 250, 0.4, 0.004) + rot_noise(rng, 250, 0.4, -0.006)
    scratch = smoothstep(2.9, 3.8, sc)
    lum = 1 + 0.035 * streak - 0.06 * scratch + 0.012 * blur_noise(rng, 150, 150)
    base = tint_ready(lum)
    h = 0.0015 * streak - 0.003 * scratch
    normal = normal_from_height(h, tile_m)
    rough = 0.3 + 0.05 * std(streak) + 0.08 * scratch + 0.03 * norm01(blur_noise(rng, 180, 90))
    return base, normal, rough
