"""Office chairs. Seat height 45-50 cm, seat depth 42-48 cm, front faces -Y."""
import kit
import parts as P
from parts import bar

BLACK = "paint:#1d1d1f"
CHROME = "metal:#c3c6c9"


def _lift(z0, z1, shroud=BLACK):
    """Gas lift: shroud from the base hub, chrome piston above it."""
    kit.cylinder(0.026, (z1 - z0) * 0.55, (0, 0, z0), shroud, verts=28, bevel=0.002, roughness=0.4)
    kit.cylinder(0.014, (z1 - z0) * 0.5, (0, 0, z0 + (z1 - z0) * 0.5), CHROME, verts=20, bevel=0.001)


def task_mesh():
    """Ergonomic mesh task chair: five-star base on twin castors, synchro mechanism, lumbar-curved mesh back."""
    hub = P.star_base(0.33, 5, spec=BLACK, roughness=0.35)
    _lift(hub - 0.02, 0.38)
    bar((-0.1, -0.12, 0.37), (0.1, 0.13, 0.415), BLACK, bevel=0.012)                 # mechanism
    lev = kit.cylinder(0.006, 0.09, (0, 0, 0), BLACK, verts=12, rot=(0, 90, 0))
    lev.location = (0.1, -0.05, 0.385)
    kit.cylinder(0.012, 0.02, (0.19, -0.05, 0.378), BLACK, verts=16, bevel=0.004)     # lever knob
    P.top(0.5, 0.48, 0.02, 0.415, BLACK, r=0.09, bevel=0.006)                         # seat pan
    kit.cushion((0.49, 0.47, 0.065), (0, -0.005, 0.432), "wool-felt", tint="#3d3e41", puff=0.5)
    # back: black frame shell with a woven mesh panel set just in front of it
    at, tilt, R = (0, 0.215, 0.56), 11, 0.6
    P.bent_panel(0.47, 0.56, 0.02, at, BLACK, R=R, tilt=tilt, lumbar=0.022, lumbar_z=0.17, roughness=0.4, name="backframe")
    P.bent_panel(0.405, 0.495, 0.005, at, "linen", tint="#2e3034", R=R, tilt=tilt, lumbar=0.022, lumbar_z=0.17,
                 y_off=-0.004, z_off=0.032, roughness=0.85, name="mesh")
    kit.curve_tube([(0, 0.06, 0.395), (0, 0.2, 0.4), (0, 0.255, 0.45), (0, 0.268, 0.56), (0, 0.3, 0.72)], 0.021,
                   BLACK, roughness=0.4, name="spine")
    for sx in (-1, 1):
        kit.curve_tube([(sx * 0.08, 0.02, 0.4), (sx * 0.24, 0.02, 0.4), (sx * 0.262, 0.02, 0.43), (sx * 0.262, 0.03, 0.645)],
                       0.014, BLACK, roughness=0.4, name="arm")
        kit.cushion((0.075, 0.24, 0.024), (sx * 0.262, 0.0, 0.645), P.custom("pu", "#232325", 0.55), puff=0.4)


def swivel_boucle():
    """Upholstered swivel desk chair: cream boucle tub seat on a four-arm rift-oak base with felt glides."""
    top = P.star_base(0.3, 4, hub_z=0.1, spec="oak-rift", feet="glide")
    kit.cylinder(0.03, 0.3, (0, 0, top - 0.02), BLACK, verts=28, bevel=0.002, roughness=0.35)
    kit.cylinder(0.12, 0.012, (0, 0, 0.395), BLACK, verts=40, bevel=0.003)
    kit.cushion((0.53, 0.5, 0.1), (0, -0.02, 0.405), "boucle", tint="#ebe3d6", puff=0.55)
    P.bent_panel(1.0, 0.34, 0.075, (0, 0.235, 0.44), "boucle", tint="#ebe3d6", R=0.3, tilt=6, p=4, arm_drop=0.35,
                 nx=30, nz=10, subsurf=1, name="tub")


def mcm_walnut():
    """Mid-century walnut desk chair: splayed tapered legs, raked back posts, curved walnut back rail, cognac leather."""
    import math
    zs = 0.415
    for sx in (-1, 1):
        kit.taper_leg(zs, 0.019, 0.013, (sx * 0.2, -0.19, zs), "walnut", splay_deg=5, toward=(0, 0))
        kit.curve_tube([(sx * 0.215, 0.225, 0.0), (sx * 0.203, 0.19, zs), (sx * 0.2, 0.215, 0.6), (sx * 0.2, 0.248, 0.752)],
                       0.016, "walnut", name="post")
        bar((sx * 0.2 - 0.009, -0.19, 0.15), (sx * 0.2 + 0.009, 0.195, 0.172), "walnut", grain="y", bevel=0.004)
    bar((-0.2, 0.0, 0.15), (0.2, 0.018, 0.17), "walnut", bevel=0.004)
    # seat frame (aprons) and leather cushion
    for y0, y1 in ((-0.215, -0.195), (0.185, 0.205)):
        bar((-0.215, y0, zs - 0.055), (0.215, y1, zs), "walnut")
    for sx in (-1, 1):
        bar((sx * 0.215 - (0.02 if sx > 0 else 0), -0.215, zs - 0.055), (sx * 0.215 + (0 if sx > 0 else 0.02), 0.205, zs),
            "walnut", grain="y")
    kit.cushion((0.44, 0.43, 0.05), (0, -0.005, zs), "leather-brown", tint="#9a5a2e", puff=0.45)
    P.bent_panel(0.47, 0.13, 0.024, (0, 0.23, 0.63), "walnut", R=0.34, tilt=12, p=6, name="backrail")
    P.bent_panel(0.4, 0.1, 0.02, (0, 0.23, 0.63), "leather-brown", tint="#9a5a2e", R=0.34, tilt=12, p=6,
                 y_off=-0.018, z_off=0.015, subsurf=1, nx=14, nz=8, name="backpad")
    _ = math


def plywood_shell():
    """Moulded rift-oak plywood shell on a black five-star base with castors (swivel, height adjustable)."""
    hub = P.star_base(0.32, 5, spec=BLACK, roughness=0.35)
    _lift(hub - 0.02, 0.4)
    kit.cylinder(0.075, 0.042, (0, 0.02, 0.4), BLACK, radius_top=0.1, verts=36, bevel=0.004)
    spine = [(-0.245, 0.418), (-0.22, 0.452), (-0.12, 0.462), (0.04, 0.458), (0.16, 0.47), (0.215, 0.52),
             (0.235, 0.62), (0.25, 0.74), (0.262, 0.83)]
    half_w = [0.19, 0.225, 0.235, 0.228, 0.21, 0.2, 0.215, 0.235, 0.228]
    dish = [0.004, 0.018, 0.028, 0.03, 0.04, 0.05, 0.05, 0.04, 0.03]
    P.spine_shell(spine, half_w, dish, 0.011, "oak-rift", nu=16, per=5, subsurf=1)
