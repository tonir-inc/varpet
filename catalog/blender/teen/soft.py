"""Bean bags: a round slouch bag and a lounger with a raised back. Front faces -Y."""
import math

import kit
import tparts as T
from mathutils import Vector
from tparts import piece


def _smooth_profile(pts, per=5):
    return [(p.x, p.y) for p in T.op._catmull([Vector(p) for p in pts], per)]


@piece("teen-round-bean-bag-sage-velvet", kind="ottoman",
       name="Round bean bag chair 90 cm in sage velvet with piped seam and carry handle",
       colors=["green"], price=48000, materials=["velvet", "EPS beads"], style="modern",
       tags=["bean bag", "beanbag", "floor seating", "pouf", "velvet", "sage", "lounge", "gaming", "reading"])
def round_bag():
    tint = "#7f9180"
    prof = [(0.0, 0.0), (0.34, 0.0), (0.42, 0.025), (0.46, 0.09), (0.475, 0.19), (0.455, 0.29), (0.4, 0.37),
            (0.31, 0.43), (0.2, 0.455), (0.1, 0.44), (0.03, 0.425), (0.0, 0.422)]
    prof = _smooth_profile(prof, 4)
    prof[0], prof[-1] = (0.0, 0.0), (0.0, prof[-1][1])

    def rmod(th, z):
        k = 1 + 0.025 * math.sin(3 * th + z * 7) + 0.015 * math.sin(7 * th + 1.3) * (z / 0.45)
        # slump toward the front: seat side a little lower and fuller
        return k * (1 + 0.04 * max(0.0, -math.sin(th)) * (1 - z / 0.46))
    T.revolve(prof, (0, 0, 0), "velvet", tint, steps=56, rmod=rmod, cap_top=False, cap_bottom=False, name="bag")
    ring = [(0.472 * math.cos(2 * math.pi * i / 56) * (1 + 0.025 * math.sin(3 * 2 * math.pi * i / 56 + 1.3)),
             0.472 * math.sin(2 * math.pi * i / 56) * (1 + 0.025 * math.sin(3 * 2 * math.pi * i / 56 + 1.3)), 0.19)
            for i in range(56)]
    kit.curve_tube(ring, 0.006, "velvet", tint="#6d7e6e", closed=True)
    kit.curve_tube([(-0.06, 0.37, 0.355), (-0.05, 0.4, 0.395), (0.05, 0.4, 0.395), (0.06, 0.37, 0.355)], 0.012,
                   "velvet", tint="#6d7e6e")


@piece("teen-bean-bag-lounger-oatmeal-boucle", kind="ottoman",
       name="Bean bag lounger 80 x 115 cm in oatmeal boucle with a raised back and deep seat",
       colors=["beige", "white"], price=69000, materials=["boucle", "EPS beads"], style="modern organic",
       tags=["bean bag", "beanbag lounger", "floor chair", "floor seating", "boucle", "lounge", "gaming", "reading"])
def lounger():
    tint = "#d8cfc0"
    w, d, h = 0.8, 1.15, 0.72
    o = T.rounded_block((w, d, h), (0, 0, 0), "boucle", tint, radius=0.26, puff=0.0, n_mid=12, finish=False,
                        name="lounger")
    for v in o.data.vertices:
        x, y, z = v.co
        t = (y + d / 2) / d                       # 0 front .. 1 back
        s = t * t * (3 - 2 * t)
        f = 0.36 + 0.64 * s ** 1.8                # height scale: low seat, tall back
        zn = 0.1 + (z - 0.1) * f if z > 0.1 else z
        # seat dent in the middle of the seat zone, bulge at the front lip
        dent = 0.12 * math.exp(-((t - 0.42) / 0.2) ** 2) * max(0.0, 1 - (2 * x / w) ** 2) * (zn / (h * f))
        zn -= dent
        # back leans rearward, front bottom spreads a little
        yn = y + 0.12 * (zn / h) ** 2 * s - 0.05 * (1 - s) * (1 - zn / h)
        xn = x * (1 + 0.05 * (1 - z / h))
        # soft wrinkles
        zn += 0.008 * math.sin(x * 17 + y * 5) * math.sin(y * 9) * (z / h)
        v.co = Vector((xn, yn, max(0.0, zn)))
    sub = o.modifiers.new("sub", "SUBSURF")
    sub.levels = 2
    kit.finish(o, "boucle", tint, None, 0.0)
