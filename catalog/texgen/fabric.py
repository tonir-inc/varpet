"""Textiles: plain-weave linen, boucle loops, velvet pile, wool felt."""
import numpy as np

from core import (
    N, ao_from_height, blur_noise, fbm, fibers, gblur, noise1d, norm01, normal_from_height, rot_noise,
    smoothstep, splat, stamp_max, std, tint_ready, warp,
)


def _threads(rng, T, slub_amt):
    """Per-thread fields along their length: centre jitter, half-width (slubs), tone."""
    jitter = 0.06 * noise1d(rng, N, 30, T) + 0.03 * noise1d(rng, N, 6, T)
    slub_raw = noise1d(rng, N, 30, T)
    slub = slub_amt * np.clip(slub_raw - 1.4, 0, None) ** 1.2 + 0.05 * noise1d(rng, N, 4, T)
    base_w = 0.46 * (1 + 0.07 * rng.standard_normal((T, 1)))
    width = np.clip(base_w * (1 + slub), 0.2, 0.62)
    tone = 0.045 * rng.standard_normal((T, 1)) + 0.035 * noise1d(rng, N, 40, T) + 0.12 * slub
    return jitter, width, tone, slub


def _weave_dir(s, along, jitter, width, tone, T, sign, amp):
    """Height of the threads running along `along` (pixel index array), s = across coordinate in threads."""
    best_h = np.full(s.shape, -9.0)
    best_t = np.zeros(s.shape)
    best_u = np.zeros(s.shape)
    i0 = np.floor(s).astype(int)
    tpos = along * T / N - 0.5  # crossing centres at integers
    for di in (-1, 0, 1):
        i = (i0 + di) % T
        u = s - (i0 + di) - 0.5 - jitter[i, along]
        w = width[i, along]
        prof = np.sqrt(np.clip(1 - (u / w) ** 2, 0, 1))
        z = sign * amp * np.cos(np.pi * (tpos - (i0 + di)))
        h = np.where(prof > 0, z + prof * w * 1.4, -9.0)
        m = h > best_h
        best_h = np.where(m, h, best_h)
        best_t = np.where(m, tone[i, along], best_t)
        best_u = np.where(m, u / w, best_u)
    return best_h, best_t, best_u


def linen(rng, tile_m=0.08, T=96):
    rows, cols = np.mgrid[0:N, 0:N]
    # warp threads run along V (index by column), weft along U (index by row)
    jw, ww, tw, sw = _threads(rng, T, 0.6)
    jf, wf, tf, sf = _threads(rng, T, 0.8)
    # slight global waviness so the grid is not ruler-straight
    wav_x = 0.25 * fbm(rng, 120, 3)
    wav_y = 0.25 * fbm(rng, 120, 3)
    sx = (cols * T / N + wav_x) % T
    sy = (rows * T / N + wav_y) % T
    hw, tnw, uw = _weave_dir(sx, rows, jw, ww, tw, T, +1, 0.22)
    hf, tnf, uf = _weave_dir(sy, cols, jf, wf, tf, T, -1, 0.22)
    top_warp = hw >= hf
    h = np.maximum(hw, hf)
    h = np.where(h < -5, -0.6, h)
    h = np.maximum(h, -0.6)

    # yarn twist striations and fibre texture, oriented along whichever thread is on top
    twist_w = np.cos(2 * np.pi * (rows * T / N * 2.6 + uw * 0.8))
    twist_f = np.cos(2 * np.pi * (cols * T / N * 2.6 + uf * 0.8))
    fib_w = blur_noise(rng, 0.5, 5.0)
    fib_f = blur_noise(rng, 5.0, 0.5)
    twist = np.where(top_warp, twist_w, twist_f)
    fib = np.where(top_warp, fib_w, fib_f)
    tone = np.where(top_warp, tnw, tnf)
    h = h + 0.03 * twist + 0.04 * fib

    # stray hairs lying on the surface
    ys, xs, _ = fibers(rng, 1500, 30, 0.7, 0.3)
    hair = np.clip(gblur(splat(ys, xs, np.full(ys.shape, 1.0)), 0.5), 0, 1)

    cav = ao_from_height(h, 3)
    lum = (0.62 + 0.38 * cav) * (1 + tone) * (1 + 0.05 * fib) * (1 + 0.04 * fbm(rng, 200, 3)) + 0.04 * hair
    base = tint_ready(lum)
    h_mm = h * (tile_m * 1000 / T) * 0.45 + 0.01 * hair
    normal = normal_from_height(h_mm, tile_m)
    rough = 0.9 - 0.08 * norm01(h) + 0.03 * fib + 0.04 * (1 - cav)
    return base, normal, rough


def _loop_sprite(rng, r, t, ecc, ang):
    size = int(2 * (r + 3 * t)) | 1
    c = size // 2
    y, x = np.mgrid[0:size, 0:size] - c
    ca, sa = np.cos(ang), np.sin(ang)
    xr = (x * ca + y * sa)
    yr = (-x * sa + y * ca) / ecc
    d = np.sqrt(xr**2 + yr**2)
    tube = np.sqrt(np.clip(1 - ((d - r) / t) ** 2, 0, 1))
    # the loop dips where it enters the ground fabric
    theta = np.arctan2(yr, xr)
    lift = 0.55 + 0.45 * np.cos(theta - rng.uniform(-np.pi, np.pi))
    return tube * t * lift, tube > 0


def boucle(rng, tile_m=0.12):
    px_mm = N / (tile_m * 1000)
    ground = 0.3 * fbm(rng, 6, 4)
    h = ground.copy() - 1.0
    tone = np.zeros((N, N))
    count = 7000
    for _ in range(count):
        r = rng.uniform(0.9, 1.9) * px_mm
        t = r * rng.uniform(0.45, 0.7)
        spr, mask = _loop_sprite(rng, r, t, rng.uniform(0.35, 1.0), rng.uniform(0, np.pi))
        z = rng.uniform(0, 1.2) * px_mm * 0.6
        cy, cx = rng.uniform(0, N, 2)
        size = spr.shape[0]
        rr = (np.arange(size) + int(cy) - size // 2) % N
        cc = (np.arange(size) + int(cx) - size // 2) % N
        sub = h[np.ix_(rr, cc)]
        cand = np.where(mask, spr + z, -9)
        m = cand > sub
        h[np.ix_(rr, cc)] = np.where(m, cand, sub)
        tsub = tone[np.ix_(rr, cc)]
        tone[np.ix_(rr, cc)] = np.where(m, rng.normal(0, 0.06), tsub)
    h = gblur(h, 0.9) / px_mm  # soften to fuzzy yarn, back to ~mm
    ys, xs, fid = fibers(rng, 9000, 18, 0.7, 0.35)
    fuzz = np.clip(gblur(splat(ys, xs, np.full(ys.shape, 1.0)), 0.6), 0, 1.5)
    fine = blur_noise(rng, 0.8)
    cav = ao_from_height(h, 6)
    lum = (0.45 + 0.55 * cav) * (1 + tone) * (1 + 0.04 * fine) + 0.06 * fuzz
    base = tint_ready(lum)
    h_mm = h * 0.9 + 0.03 * fine + 0.03 * fuzz
    normal = normal_from_height(h_mm, tile_m, 0.8)
    rough = 0.93 - 0.06 * cav + 0.03 * fine
    return base, normal, rough


def velvet(rng, tile_m=0.3):
    # individual pile: very fine isotropic speckle (tufts are sub-millimetre)
    pile = blur_noise(rng, 0.55)
    pile2 = blur_noise(rng, 1.2)
    # gentle crush streaks: long soft marks roughly along U where the pile was pressed over
    cw = 10 * fbm(rng, 120, 3)
    crush = warp(fbm(rng, 18, 4, aniso=7), cw, 0.5 * cw)
    crush = smoothstep(0.2, 1.8, crush) * (0.4 + 0.6 * norm01(fbm(rng, 200, 3)))
    # pile lean direction drifts slowly; lean changes how much sheen the pile throws back
    lean = norm01(fbm(rng, 260, 3))
    lum = (1 - 0.035 * crush - 0.02 * (lean - 0.5)) * (1 + 0.03 * pile + 0.015 * pile2)
    base = tint_ready(lum)
    h = 0.025 * pile + 0.015 * pile2 - 0.03 * gblur(crush, 1.5)
    normal = normal_from_height(h, tile_m)
    # directional sheen lives in roughness: crushed / leaning pile is glossier than upright pile
    rough = 0.82 - 0.14 * crush - 0.06 * (lean - 0.5) + 0.05 * pile + 0.02 * pile2
    return base, normal, rough


def felt(rng, tile_m=0.2):
    count = 70000
    ys, xs, fid = fibers(rng, count, 26, 0.8, 0.22)
    fiber_tone = rng.normal(0, 1, count)
    w = np.ones(ys.shape)
    dens = splat(ys, xs, w)
    shade = splat(ys, xs, fiber_tone[fid])
    dens_b = gblur(dens, 0.6)
    heather = gblur(shade, 0.6) / (dens_b + 0.5)
    cloud = fbm(rng, 90, 5)
    pills = smoothstep(2.6, 3.4, blur_noise(rng, 3)) * (0.5 + 0.5 * norm01(cloud))
    d = std(dens_b)
    lum = (1 + 0.06 * d) * (1 + 0.05 * heather) * (1 + 0.025 * cloud) * (1 + 0.05 * pills)
    base = tint_ready(lum)
    h = 0.02 * d + 0.06 * cloud + 0.08 * gblur(pills, 1.2) + 0.015 * blur_noise(rng, 2)
    normal = normal_from_height(h, tile_m)
    rough = 0.94 - 0.02 * d + 0.02 * cloud
    return base, normal, rough
