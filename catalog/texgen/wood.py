"""Flat-sawn plank wood. The board surface is a plane cutting a log whose pith runs along U at a
depth that wanders along the board, so ring contours form cathedral arches. Grain runs along U."""
import numpy as np

from core import N, blur_noise, norm01, fbm, noise1d, normal_from_height, rot_noise, smoothstep, std, tint_ready

SPECIES = {
    "oak": dict(
        ring_mm=3.2, ring_sd=0.35, late_contrast=0.15, late_start=0.35, early_contrast=0.1, pores="ring", pore_contrast=0.45,
        rays=True, streak=0.035, figure=0.015, fiber=0.04, planks=4, depth=(0.14, 0.24),
        style="straight", plank_tone=0.02, seam_dark=0.14, seam_depth=0.03,
    ),
    "walnut": dict(
        ring_mm=4.5, ring_sd=0.4, late_contrast=0.13, late_start=0.25, early_contrast=0.03, pores="diffuse", pore_contrast=0.4,
        rays=False, streak=0.06, figure=0.05, fiber=0.04, planks=3, depth=(0.04, 0.12),
        style="figured", plank_tone=0.018, seam_dark=0.35, seam_depth=0.08,
    ),
}


def plank_widths(rng, count, tile):
    w = rng.uniform(0.8, 1.25, count)
    return w / w.sum() * tile


def generate(rng, species, tile_m=0.6):
    sp = SPECIES[species]
    px = tile_m / N
    coord = (np.arange(N) + 0.5) * px
    X = np.broadcast_to(coord[None, :], (N, N))  # U, along grain
    Y = np.broadcast_to(coord[:, None], (N, N))  # V, across grain

    widths = plank_widths(rng, sp["planks"], tile_m)
    edges = np.concatenate([[0], np.cumsum(widths)])
    edges[-1] = tile_m
    plank = np.clip(np.searchsorted(edges, coord, side="right") - 1, 0, len(widths) - 1)

    ring_phase = np.zeros((N, N))
    local_v = np.zeros((N, N))
    plank_tone = np.zeros((N, N))
    # small 3D wobble of the ring surfaces (in metres), stretched along the grain
    wobble = 0.00035 * fbm(rng, 50, 4, aniso=8) + 0.00012 * blur_noise(rng, 20, 2)
    for p, w in enumerate(widths):
        rows = plank == p
        yl = Y[rows] - edges[p] - w / 2
        xs = X[rows]
        # yearly ring widths: lognormal, with slow climate drift
        n_r = 400
        if sp["style"] == "straight":
            # log taper: the pith depth climbs linearly along the board by exactly K rings per tile.
            # Blending the phase of d(x) with that of d(x) - delta (+K) makes the ring field periodic
            # with no drop, so arches all point one way and the edges stay near-parallel lines.
            widths_mm = sp["ring_mm"] * np.exp(rng.normal(0, sp["ring_sd"] * 0.6, n_r) + 0.2 * noise1d(rng, n_r, 6)[0])
            radii = np.concatenate([[0], np.cumsum(widths_mm) / 1000])
            phi = lambda rr: np.interp(rr, radii, np.arange(n_r + 1))  # noqa: E731
            d0 = rng.uniform(*sp["depth"])
            K = int(rng.integers(1, 3)) * rng.choice([-1, 1])
            delta = np.interp(phi(d0) + K, np.arange(n_r + 1), radii) - d0
            xs = X[rows]
            col = np.clip((xs / px).astype(int), 0, N - 1)
            a = xs / tile_m
            yc = rng.uniform(-0.12, 0.12) * w + noise1d(rng, N, 200)[0] * 0.03 * w
            dy = yl - yc[col]
            dA = d0 + delta * a
            rA = np.sqrt(dy**2 + dA**2) + wobble[rows]
            rB = np.sqrt(dy**2 + (dA - delta) ** 2) + wobble[rows]
            ring_phase[rows] = (1 - a) * phi(rA) + a * (phi(rB) + K)
        else:
            xs = X[rows]
            # pith depth below surface and lateral position, periodic along U
            d0 = rng.uniform(*sp["depth"])
            # one slow rise per tile (smoothed sawtooth: long gentle climb, short drop) -> cathedral arches
            t = np.arange(N) / N * 2 * np.pi + rng.uniform(0, 2 * np.pi)
            saw = -sum(np.sin(k * t) / k * np.exp(-k / 6) for k in range(1, 10))
            saw = (saw - saw.min()) / (saw.max() - saw.min()) - 0.5
            amp = sp["ring_mm"] / 1000 * rng.uniform(7, 12)
            d = np.clip(d0 + amp * saw + amp * 0.06 * noise1d(rng, N, 40)[0], 0.02, None)
            # pith swings out past the plank edge where the arch tips close, so the board shows
            # open cathedral arches rather than closed eyes and saddles
            t_peak = t[np.argmax(saw)]
            side = rng.choice([-1, 1])
            yc = side * w * (0.2 + 0.42 * np.cos(t - t_peak)) + noise1d(rng, N, 160)[0] * 0.04 * w
            col = np.clip((xs / px).astype(int), 0, N - 1)
            r = np.sqrt((yl - yc[col]) ** 2 + d[col] ** 2) + wobble[rows]
            widths_mm = sp["ring_mm"] * np.exp(rng.normal(0, sp["ring_sd"], n_r) + 0.3 * noise1d(rng, n_r, 6)[0])
            radii = np.concatenate([[0], np.cumsum(widths_mm) / 1000])
            ring_phase[rows] = np.interp(r, radii, np.arange(n_r + 1))
        local_v[rows] = yl / w
        plank_tone[rows] = rng.normal(0, sp["plank_tone"])

    p = ring_phase % 1.0
    # earlywood -> latewood ramps gradually, then snaps back at the ring boundary
    late = smoothstep(sp["late_start"], 0.9, p) * (1 - smoothstep(0.965, 1.0, p))
    early = 1 - smoothstep(0.08, 0.3, p)

    # each plank is a different board: decorrelate low-frequency fields per plank
    shifts = rng.integers(0, N, len(widths))

    def per_plank(f):
        out = np.empty_like(f)
        for p in range(len(widths)):
            rows = plank == p
            out[rows] = np.roll(f, shifts[p], axis=0)[rows]
        return out

    lowmod = 0.7 + 0.3 * np.tanh(per_plank(fbm(rng, 180, 3, aniso=3)))  # uneven contrast across the board
    early_soft = 1 - smoothstep(0.05, 0.35, p)
    lum = 1.0 - sp["late_contrast"] * late * lowmod - sp["early_contrast"] * early_soft * lowmod

    # fibre streaks and colour figure along the grain
    fmod = 0.4 + 0.6 * norm01(blur_noise(rng, 150, 40))
    lum += fmod * sp["fiber"] * (0.7 * blur_noise(rng, 14, 0.6) + 0.5 * blur_noise(rng, 60, 1.2))
    lum += sp["streak"] * per_plank(fbm(rng, 30, 4, aniso=10))
    lum += sp["figure"] * np.tanh(1.2 * per_plank(fbm(rng, 110, 3, aniso=5)))
    lum += plank_tone

    # pores: short dashes along U, anti-aliased with smoothstep bands
    pn = blur_noise(rng, 1.8, 0.45) if sp["style"] == "straight" else blur_noise(rng, 2.2, 0.55)
    pn2 = blur_noise(rng, 1.6, 0.5)
    if sp["pores"] == "ring":
        big = smoothstep(1.0, 2.2, pn) * early
        small = smoothstep(2.6, 3.4, pn2) * (1 - early)
        pores = np.clip(big + 0.6 * small, 0, 1)
    else:
        dens = 0.85 + 0.15 * blur_noise(rng, 60, 20)
        pores = smoothstep(2.2, 3.1, pn * dens) * (0.8 + 0.2 * late)
    lum *= 1 - sp["pore_contrast"] * pores

    rays = np.zeros((N, N))
    if sp["rays"]:
        # medullary ray flecks: thin spindles 5-15 mm long, some darker, some catching light
        rn = rot_noise(rng, 8, 0.7, 0.0) + 0.35 * blur_noise(rng, 40, 40)
        rays = smoothstep(2.3, 3.0, rn)
        lum *= 1 - 0.28 * rays

    # glue joints between planks
    edge_dist = np.minimum(np.abs(local_v + 0.5), np.abs(local_v - 0.5)) * widths[plank][:, None] / px
    seam = np.exp(-(edge_dist / 0.9) ** 2)
    lum *= 1 - sp["seam_dark"] * seam

    base = tint_ready(np.clip(lum, 0.05, None))

    height = (
        -0.06 * pores
        - 0.02 * rays
        + 0.012 * late
        + 0.004 * blur_noise(rng, 20, 0.8)
        + 0.01 * fbm(rng, 200, 3, aniso=2)
        - sp["seam_depth"] * seam
    )
    normal = normal_from_height(height, tile_m)
    rough = 0.44 + 0.22 * pores - 0.05 * late + 0.03 * std(blur_noise(rng, 25, 1.0)) + 0.03 * lowmod + 0.2 * seam
    # keep the first glue joint off the wrap boundary (still periodic)
    k = int(widths[0] / px / 2)
    return np.roll(base, k, 0), np.roll(normal, k, 0), np.roll(rough, k, 0)
