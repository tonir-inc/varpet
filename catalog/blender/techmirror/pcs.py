"""Desktop computers, monitors and a keyboard set. Front faces -Y; x = width, z = up; base on z=0."""
import math

import kit
import lib
from lib import bar

RUBBER = "paint:#1b1b1b"

THEMES = {
    "black": dict(shell="paint:#1d1d1f", shell_r=0.45, front="mesh", trim="paint:#2a2a2c", board="#16181a",
                  gpu="#232326", gpu_accent="#8a8d91", fan="paint:#161617", blade="paint:#202022",
                  cap="paint:#1a1a1b", fins="metal:#b9bdc1", ram="#2a2a2d", glass="dark", button="metal:#9a9ea3"),
    "white": dict(shell="paint:#efefec", shell_r=0.5, front="mesh", trim="paint:#e2e2df", board="#d8d9d8",
                  gpu="#ecebea", gpu_accent="#9fa3a7", fan="paint:#f1f1ef", blade="paint:#e9e9e6",
                  cap="paint:#f1f1ef", fins="metal:#c9ccd0", ram="#e8e8e6", glass="clear", button="metal:#b9bcc0"),
    "japandi": dict(shell="paint:#2f2f30", shell_r=0.6, front="slats", trim="paint:#262627", board="#17191a",
                    gpu="#262628", gpu_accent="#b69668", fan="paint:#1b1b1c", blade="paint:#242425",
                    cap="paint:#1c1c1d", fins="metal:#b0a898", ram="#2b2b2d", glass="smoke", button="brass"),
}


def _mesh_front(W, H, z0, yf, depth, th, ribs=True):
    """Framed front fascia with a recessed dark mesh insert lined with fine horizontal ribs."""
    border = 0.012
    lib.frame_profile("rounded", W, H - z0, [(0, yf), (border, yf), (border, yf + depth), (0, yf + depth)],
                      th["shell"], r=0.006, z0=z0, roughness=th["shell_r"], bevel=0.0025, name="fascia")
    mesh = lib.custom("mesh-" + th["trim"], th["trim"][6:], 0.85)
    lib.slab("rounded", W, H - z0, yf + 0.004, yf + 0.008, mesh, r=0.006, inset=border, z0=z0, bevel=0, name="mesh")
    if ribs:
        rib = lib.custom("rib", "#0e0e0f" if th is not THEMES["white"] else "#c9c9c6", 0.8)
        n, zlo, zhi = 46, z0 + border + 0.006, H - border - 0.006
        for i in range(n):
            z = zlo + (zhi - zlo) * i / (n - 1)
            bar((-W / 2 + border + 0.004, yf + 0.0032, z - 0.0009), (W / 2 - border - 0.004, yf + 0.004, z + 0.0009), rib)


def _slat_front(W, H, z0, yf, depth, th):
    """Japandi front: charcoal surround, oak vertical slats over a black mesh."""
    border = 0.014
    lib.frame_profile("rounded", W, H - z0, [(0, yf + 0.006), (border, yf + 0.006), (border, yf + depth), (0, yf + depth)],
                      th["shell"], r=0.006, z0=z0, roughness=th["shell_r"], bevel=0.0025, name="fascia")
    lib.slab("rounded", W, H - z0, yf + 0.021, yf + 0.022, lib.custom("mesh-dark", "#101011", 0.9), r=0.006, inset=border,
             z0=z0, bevel=0, name="mesh")
    n, sw = 11, 0.0115
    span = W - 2 * border - 0.006
    gap = (span - n * sw) / (n - 1)
    for i in range(n):
        x = -span / 2 + sw / 2 + i * (sw + gap)
        slat = kit.box((sw, 0.018, H - z0 - 2 * border - 0.004), (x, yf + 0.003, z0 + border + 0.002), "oak",
                       tint="#a47a4f", bevel=0.0025, grain="y")
        for loop in slat.data.uv_layers.active.data:  # finer grain on thin slats; offset so no two slats match
            loop.uv = (loop.uv[0] * 2.2 + i * 0.137, loop.uv[1] * 2.2 + i * 0.31)


def _internals(W, D, H, z0, t, th, yin):
    """What shows through the side glass: board, tower cooler, RAM, GPU, PSU shroud and fans."""
    xl = -W / 2 + t          # inner face of the left side panel (motherboard tray)
    yb = D / 2 - t           # inner face of the back panel
    zt = H - t
    pcb = lib.custom("pcb-" + th["board"], th["board"], 0.55)
    bar((xl, yb - 0.02 - 0.244, zt - 0.02 - 0.305), (xl + 0.002, yb - 0.02, zt - 0.02), pcb)
    bz1, bz0 = zt - 0.02, zt - 0.325
    # rear I/O cover and VRM heatsinks
    bar((xl + 0.002, yb - 0.065, bz1 - 0.1), (xl + 0.03, yb - 0.022, bz1 - 0.004), th["trim"], bevel=0.003)
    bar((xl + 0.002, yb - 0.16, bz1 - 0.03), (xl + 0.024, yb - 0.075, bz1 - 0.008), th["trim"], bevel=0.003)
    # tower cooler: base, copper heat pipes, aluminium fin stack, top cap, front fan
    cy, cz = yb - 0.125, bz1 - 0.1
    bar((xl + 0.002, cy - 0.022, cz - 0.022), (xl + 0.012, cy + 0.022, cz + 0.022), "metal:#b8bcbf", bevel=0.001)
    fins = th["fins"]
    for i in range(26):
        x = xl + 0.03 + i * 0.0048
        bar((x, cy - 0.026, cz - 0.063), (x + 0.0007, cy + 0.026, cz + 0.063), fins)
    x_top = xl + 0.03 + 25 * 0.0048 + 0.0007
    for dz in (-0.03, -0.01, 0.01, 0.03):
        pipe = kit.cylinder(0.003, x_top - xl - 0.012, (0, 0, 0), "metal:#b87333", verts=10, bevel=0, rot=(0, 90, 0))
        pipe.location = (xl + 0.012, cy, cz + dz)
    bar((x_top, cy - 0.028, cz - 0.065), (x_top + 0.006, cy + 0.028, cz + 0.065), th["cap"], bevel=0.002)
    lib.fan(0.12, (xl + 0.03 + 0.06, cy - 0.026 - 0.0125, cz), (0, -1, 0), th["fan"], th["blade"], name="cpufan")
    # two DIMMs between the cooler and the front edge of the board
    ram = lib.custom("ram-" + th["ram"], th["ram"], 0.45, metallic=0.3)
    for dy in (0.0, 0.011):
        y = cy - 0.026 - 0.025 - 0.02 - dy
        bar((xl + 0.002, y - 0.0035, cz - 0.07), (xl + 0.036, y + 0.0035, cz + 0.063), ram, bevel=0.001)
    # graphics card on a vertical mount, fans facing the glass
    sz = z0 + t + 0.09
    gx1 = W / 2 - 0.004 - 0.021
    gx0, gz0, gz1, gy0 = gx1 - 0.05, sz + 0.02, sz + 0.145, yb - 0.3
    gpu = lib.custom("gpu-" + th["gpu"], th["gpu"], 0.45)
    bar((gx0, gy0, gz0), (gx1, yb - 0.003, gz1), gpu, bevel=0.004)
    bar((gx0 - 0.003, gy0 + 0.002, gz0 + 0.002), (gx0, yb - 0.003, gz1 - 0.002), lib.custom("backplate", "#2c2d30", 0.5, 0.6))
    bar((gx0, yb - 0.003, gz0 - 0.004), (gx1, yb, gz1 + 0.004), "metal:#a8acb0")          # slot bracket on the back
    bar((gx0 + 0.012, yb - 0.2, sz), (gx1 - 0.012, yb - 0.185, gz0), th["trim"], bevel=0.001)  # support post
    acc = lib.custom("gpu-accent-" + th["gpu_accent"], th["gpu_accent"], 0.35, metallic=0.8)
    bar((gx1, gy0 + 0.01, gz1 - 0.012), (gx1 + 0.0006, yb - 0.02, gz1 - 0.008), acc)
    for k in range(3):
        lib.fan(0.088, (gx1 + 0.0075, gy0 + 0.05 + k * 0.093, (gz0 + gz1) / 2 - 0.004), (1, 0, 0), th["fan"], th["blade"],
                depth=0.012, blades=9, ring=True, pitch=35, name="gpufan")
    bar((xl + 0.002, yb - 0.27, bz0 + 0.1), (xl + 0.005, yb - 0.02, bz0 + 0.106), lib.custom("slot", "#0c0c0d", 0.6))
    # PSU shroud across the floor with a small vent grille
    bar((xl, yin, z0 + t), (W / 2 - 0.0052, yb, sz), th["shell"], bevel=0.003, roughness=th["shell_r"])
    for i in range(7):
        y = yin + 0.03 + i * 0.012
        bar((xl + 0.03, y, sz), (xl + 0.15, y + 0.005, sz + 0.0006), lib.custom("vent", "#0c0c0d", 0.8))
    # front intake fans and rear exhaust
    for zc in (sz + 0.078, sz + 0.078 + 0.145):
        lib.fan(0.14, (0.0, yin + 0.0135, zc), (0, -1, 0), th["fan"], th["blade"], name="intake")
    lib.fan(0.12, (xl + 0.1, yb - 0.0135, cz), (0, -1, 0), th["fan"], th["blade"], name="exhaust")


def midtower(theme):
    th = THEMES[theme]
    W, D, H, feet, t = (0.215, 0.45, 0.47, 0.012, 0.005) if theme == "japandi" else (0.21, 0.45, 0.47, 0.012, 0.005)
    z0 = feet
    yf = -D / 2
    fd = 0.022                   # front fascia depth
    yin = yf + fd                # chassis starts behind the fascia
    shell = dict(roughness=th["shell_r"])
    for sx in (-1, 1):
        for sy in (-1, 1):
            lib.plan_slab(0.05, 0.03, feet, 0.01, (sx * 0.07, sy * 0.17, 0), RUBBER, bevel=0.002)
    bar((-W / 2, yin, z0), (W / 2, D / 2, z0 + t), th["shell"], bevel=0.002, **shell)
    bar((-W / 2, yin, H - t), (W / 2, D / 2, H), th["shell"], bevel=0.002, **shell)
    bar((-W / 2, yin, z0 + t), (-W / 2 + t, D / 2, H - t), th["shell"], bevel=0.0015, **shell)
    bar((-W / 2 + t, D / 2 - t, z0 + t), (W / 2 - 0.004, D / 2, H - t), th["shell"], bevel=0.0015, **shell)
    # glass side (+X) with a black silk-screen border, held by front and rear posts
    glass = {"clear": lib.custom("clear-glass", "#e3e8e8", 0.03, alpha=0.12),
             "dark": lib.custom("dark-glass", "#262a2a", 0.03, alpha=0.2),
             "smoke": lib.custom("smoke-glass", "#2a2a2c", 0.04, alpha=0.42)}[th["glass"]]
    bar((W / 2 - 0.004, yin + 0.0005, z0 + t), (W / 2, D / 2 - 0.0005, H - t), glass, bevel=0.0012)
    ink = lib.custom("silkscreen", "#0b0b0c", 0.4)
    gi = W / 2 - 0.004
    for p0, p1 in (((gi - 0.0006, yin + 0.001, z0 + t), (gi, yin + 0.016, H - t)),
                   ((gi - 0.0006, D / 2 - 0.016, z0 + t), (gi, D / 2 - 0.001, H - t)),
                   ((gi - 0.0006, yin + 0.016, H - t - 0.012), (gi, D / 2 - 0.016, H - t)),
                   ((gi - 0.0006, yin + 0.016, z0 + t), (gi, D / 2 - 0.016, z0 + t + 0.012))):
        bar(p0, p1, ink)
    bar((gi - 0.016, yin, z0 + t), (gi - 0.0006, yin + 0.012, H - t), th["shell"], **shell)
    bar((gi - 0.016, D / 2 - t - 0.012, z0 + t), (gi - 0.0006, D / 2 - t, H - t), th["shell"], **shell)
    if th["front"] == "slats":
        _slat_front(W, H, z0, yf, fd, th)
    else:
        _mesh_front(W, H, z0, yf, fd, th)
    # top: magnetic dust filter, power button and front I/O
    filt = lib.custom("filter-" + th["trim"], th["trim"][6:], 0.9)
    lib.plan_slab(W - 0.05, 0.25, 0.0012, 0.008, (0, 0.06, H), filt, bevel=0.0004)
    btn = "brass" if th["button"] == "brass" else th["button"]
    if btn == "brass":
        lib.custom("brass", "#c29b5c", 0.28, metallic=1.0)
    kit.cylinder(0.0075, 0.0025, (0, yin + 0.03, H), btn, verts=32, bevel=0.0008)
    port = lib.custom("port", "#0a0a0a", 0.6)
    for x in (-0.055, -0.035):
        bar((x - 0.0068, yin + 0.026, H), (x + 0.0068, yin + 0.034, H + 0.0006), port)
    lib.plan_slab(0.009, 0.0035, 0.0006, 0.0017, (0.035, yin + 0.03, H), port, bevel=0, n=4)
    # rear: I/O shield, expansion slot covers, PSU plate
    bar((-W / 2 + 0.012, D / 2, H - 0.13), (-W / 2 + 0.058, D / 2 + 0.0008, H - 0.03), port)
    for i in range(7):
        z = z0 + 0.12 + i * 0.02
        bar((-W / 2 + 0.02, D / 2, z), (W / 2 - 0.06, D / 2 + 0.0008, z + 0.014), th["trim"])
    bar((-W / 2 + 0.015, D / 2, z0 + 0.012), (W / 2 - 0.03, D / 2 + 0.0008, z0 + 0.09), port)
    _internals(W, D, H, z0, t, th, yin)


def sff(theme="grey"):
    """Vertical small-form-factor case: aluminium shell, louvred sides, clean front."""
    W, D, H, feet = 0.17, 0.30, 0.37, 0.008
    alu = ("brushed-steel", "#7f8387") if theme == "grey" else ("paint:#e4e4e0", None)
    dark = lib.custom("sff-dark", "#141415", 0.8)
    for sx in (-1, 1):
        for sy in (-1, 1):
            lib.plan_slab(0.03, 0.03, feet, 0.012, (sx * 0.055, sy * 0.11, 0), RUBBER, bevel=0.0015, n=6)
    z0 = feet
    t = 0.0035
    # core: front and back plates plus top and bottom, wrapped by the two louvred side panels
    kw = dict(tint=alu[1], roughness=0.5) if alu[1] else dict(roughness=0.45)
    frontr = alu[0]
    lib.slab("rounded", W, H - z0, -D / 2, -D / 2 + 0.012, frontr, r=0.003, z0=z0, bevel=0.002, name="front", **kw)
    kit.box((W, D - 0.012, t), (0, 0.006, z0), alu[0], bevel=0.002, **kw)
    kit.box((W, D - 0.012, t), (0, 0.006, H - t), alu[0], bevel=0.002, **kw)
    kit.box((W - 2 * t, t, H - z0 - 2 * t), (0, D / 2 - t / 2, z0 + t), alu[0], bevel=0.001, **kw)
    # dark interior visible through the louvres
    kit.box((W - 2 * t - 0.01, D - 0.03, H - z0 - 2 * t - 0.01), (0, 0.005, z0 + t + 0.005), dark, bevel=0)
    yi, yo = -D / 2 + 0.012, D / 2
    for sx in (-1, 1):
        xo = sx * W / 2
        xi = sx * (W / 2 - t)
        # side frame: solid border, then horizontal louvre bars with gaps
        brd = 0.022
        bar((xi, yi, z0 + t), (xo, yo, z0 + t + brd), alu[0], **kw)
        bar((xi, yi, H - t - brd), (xo, yo, H - t), alu[0], **kw)
        bar((xi, yi, z0 + t + brd), (xo, yi + brd, H - t - brd), alu[0], **kw)
        bar((xi, yo - brd, z0 + t + brd), (xo, yo, H - t - brd), alu[0], **kw)
        n = 34
        zlo, zhi = z0 + t + brd, H - t - brd
        pitch = (zhi - zlo) / n
        for i in range(n):
            z = zlo + i * pitch + pitch * 0.45
            bar((xi, yi + brd, z), (xo, yo - brd, z + pitch * 0.55), alu[0], **kw)
    # front: power button with a thin light ring, USB-C pair, audio jack
    ring = lib.custom("led", "#dfe7ff", 0.3)
    b = kit.cylinder(0.0085, 0.0015, (0, 0, 0), ring, verts=32, bevel=0, rot=(90, 0, 0))
    b.location = (0, -D / 2, H - 0.045)
    b2 = kit.cylinder(0.0075, 0.0022, (0, 0, 0), frontr, verts=32, bevel=0.0006, rot=(90, 0, 0), **kw)
    b2.location = (0, -D / 2 - 0.0005, H - 0.045)
    port = lib.custom("port", "#0a0a0a", 0.6)
    for x in (-0.012, 0.012):
        bar((x - 0.0045, -D / 2 - 0.0004, H - 0.08), (x + 0.0045, -D / 2 + 0.0001, H - 0.0768), port)
    j = kit.cylinder(0.002, 0.0005, (0, 0, 0), port, verts=16, bevel=0, rot=(90, 0, 0))
    j.location = (0, -D / 2 + 0.0001, H - 0.095)


def mini_pc(theme="silver"):
    """13 x 13 x 5 cm aluminium mini PC with a recessed foot ring and front ports."""
    S, H, foot = 0.13, 0.05, 0.004
    body = ("brushed-steel", "#c5c8cb") if theme == "silver" else ("brushed-steel", "#3a3b3e")
    lib.plan_slab(0.105, 0.105, foot, 0.035, (0, 0, 0), RUBBER if theme == "silver" else "paint:#111112",
                  bevel=0.001, n=8)
    lib.plan_slab(S, S, H - foot, 0.027, (0, 0, foot), body[0], tint=body[1], roughness=0.32, bevel=0.004, n=10)
    port = lib.custom("port", "#0a0a0a", 0.6)
    y = -S / 2 - 0.0003
    for x in (-0.032, -0.021):
        lib.slab("rounded", 0.0084, 0.0026, y, y + 0.001, port, r=0.0013, x0=x, z0=foot + 0.0165, bevel=0, name="usbc")
    for x in (-0.004, 0.012):
        bar((x - 0.0062, y, foot + 0.0162), (x + 0.0062, y + 0.001, foot + 0.0212), port)
    j = kit.cylinder(0.0018, 0.001, (0, 0, 0), port, verts=16, bevel=0, rot=(90, 0, 0))
    j.location = (0.025, y + 0.0007, foot + 0.0187)
    led = kit.cylinder(0.0011, 0.0006, (0, 0, 0), lib.custom("led-w", "#f4f7ff", 0.2), verts=12, bevel=0, rot=(90, 0, 0))
    led.location = (0.033, y + 0.0003, foot + 0.0187)


def monitor(inch):
    """Flat panel on a stand. 24": matte black on a round base; 27": aluminium back and a slab foot."""
    screen = lib.custom("screen", "#0b0c0e", 0.12, metallic=0.2)
    if inch == 24:
        W, Hp, bottom = 0.540, 0.320, 0.115
        bezel = lib.custom("bezel-24", "#161617", 0.55)
        back = bezel
        stand = lib.custom("stand-24", "#1b1b1c", 0.4, metallic=0.4)
    else:
        W, Hp, bottom = 0.614, 0.366, 0.12
        bezel = lib.custom("bezel-27", "#121213", 0.5)
        back, stand = "brushed-steel", "brushed-steel"
    th = 0.009
    # panel: thin slab, bezel ring on the front, glass screen inset flush
    lib.slab("rounded", W, Hp, -th / 2, th / 2, bezel, r=0.004, z0=bottom, bevel=0.0015, name="panel")
    chin = 0.018 if inch == 24 else 0.012
    lib.slab("rounded", W - 0.012, Hp - chin - 0.006, -th / 2 - 0.0004, -th / 2, screen, r=0.001, z0=bottom + chin,
             bevel=0, name="screen")
    # rear housing (electronics bump) and stand
    hw, hh = W * 0.62, Hp * 0.62
    kw = dict(tint="#c7cacd", roughness=0.35) if back == "brushed-steel" else {}
    kit.box((hw, 0.026, hh), (0, th / 2 + 0.013, bottom + Hp * 0.22), back, bevel=0.012, **kw)
    kit.box((0.09, 0.012, 0.06), (0, th / 2 + 0.026 + 0.006, bottom + Hp * 0.40), back, bevel=0.004, **kw)
    ny = th / 2 + 0.038 + (0.009 if inch == 24 else 0.008)
    if inch == 24:
        kit.box((0.05, 0.018, bottom + Hp * 0.46), (0, ny, 0.012), stand, bevel=0.006)
        kit.cylinder(0.1, 0.012, (0, ny - 0.03, 0), stand, verts=64, bevel=0.004)
    else:
        kit.box((0.07, 0.016, bottom + Hp * 0.46 - 0.008), (0, ny, 0.008), stand, tint="#c7cacd", roughness=0.35, bevel=0.005)
        lib.plan_slab(0.23, 0.2, 0.008, 0.03, (0, ny - 0.07, 0), stand, tint="#c7cacd", roughness=0.35, bevel=0.003)
    # small power LED under the bottom-right bezel
    led = kit.cylinder(0.001, 0.0005, (0, 0, 0), lib.custom("led-w", "#f4f7ff", 0.2), verts=10, bevel=0, rot=(90, 0, 0))
    led.location = (W / 2 - 0.03, -th / 2, bottom + 0.004)


def keyboard_set():
    """Low-profile full keyboard (with numpad) and a matching mouse, laid out left to right."""
    import bpy
    alu = ("brushed-steel", "#c3c6c9")
    KW, KD, zf, zb = 0.385, 0.125, 0.006, 0.014
    x0 = -0.045
    prof = [(-KD / 2, 0.0), (KD / 2, 0.0), (KD / 2, zb), (-KD / 2, zf)]
    loops = [[(x0 + x, y, z) for y, z in prof] for x in (-KW / 2, KW / 2)]
    kit.finish(lib.loft(loops, closed=False, name="tray", cap=True), alu[0], tint=alu[1], roughness=0.35, bevel=0.0025)
    key = lib.custom("keycap", "#d8d8d4", 0.55)
    u = 0.0185
    rows = [([1] * 15, [1] * 4, 0.011), ([1] * 13 + [2], [1] * 4, u), ([1.5] + [1] * 12 + [1.5], [1] * 4, u),
            ([1.75] + [1] * 11 + [2.25], [1] * 4, u), ([2.25] + [1] * 10 + [2.75], [1] * 4, u),
            ([1.25] * 3 + [6.25] + [1.25] * 4, [2, 1, 1], u)]
    slope = (zb - zf) / KD
    y = KD / 2 - 0.011
    for main, pad, pitch in rows:
        yc = y - pitch / 2
        x = x0 - KW / 2 + 0.0095
        for i, w in enumerate(main + pad):
            if i == len(main):
                x += 0.008
            kz = zf + slope * (yc + KD / 2)
            kit.box((w * u - 0.0026, pitch - 0.0026, 0.003), (x + w * u / 2, yc, kz - 0.0008), key, bevel=0.0009)
            x += w * u
        y -= pitch
    # mouse: a smooth dome, flat underneath, slightly higher toward the palm
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        z = max(z, 0.0)
        hump = 1.0 + 0.18 * max(y, -0.2)  # a touch higher toward the back
        v.co = (x * 0.031, y * 0.057, z * 0.021 * hump)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    mo = lib._obj(bm, "mouse")
    mo.location = (x0 + KW / 2 + 0.065, 0.0, 0.0)
    kit.finish(mo, lib.custom("mouse", "#d4d4d0", 0.35), bevel=0)
