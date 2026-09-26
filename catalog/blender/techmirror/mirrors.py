"""Narrow wall mirrors for small halls. Wall-hung pieces: back on y=0, glass facing -Y."""
import math

from mathutils import Matrix

import kit
import lib

HARDBOARD = "paint:#3b332b"


def moulded(kind, w, h, face, depth, spec, r=0.0, tint=None, lip=None, rebate=0.006, chamfer=0.0, roughness=None,
            z0=0.0, bevel=0.0015):
    """Frame with a rebate at the back that holds a 4 mm mirror and a 3 mm hardboard back, all flush-fitted."""
    lip = lip or depth * 0.45
    prof = [(0, -depth)]
    if chamfer:
        prof += [(face - chamfer, -depth), (face, -depth + chamfer)]
    else:
        prof += [(face, -depth)]
    prof += [(face, -depth + lip), (face - rebate, -depth + lip), (face - rebate, 0), (0, 0)]
    lib.frame_profile(kind, w, h, prof, spec, r=r, z0=z0, tint=tint, roughness=roughness, bevel=bevel, name="frame")
    inset = face - rebate + 0.0005
    lib.slab(kind, w, h, -depth + lip, -depth + lip + 0.004, "mirror", r=r, inset=inset, z0=z0, bevel=0.0006, name="glass")
    lib.slab(kind, w, h, -depth + lip + 0.004, -depth + lip + 0.007, HARDBOARD, r=r, inset=inset, z0=z0, bevel=0.0, name="back")


def arched_oak():
    moulded("arch", 0.40, 1.20, 0.026, 0.030, "oak", r=0.003, tint="#b89067", chamfer=0.004)


def slim_black():
    moulded("rounded", 0.35, 1.40, 0.011, 0.022, "black-metal", r=0.004, tint="#3a3a3c", lip=0.007, rebate=0.004,
            roughness=0.45, bevel=0.0012)


def rounded_brass():
    moulded("rounded", 0.45, 1.00, 0.013, 0.020, lib.custom("brass", "#c29b5c", 0.28, metallic=1.0), r=0.10,
            lip=0.007, rebate=0.004, bevel=0.0012)


def leaning_oak():
    moulded("rect", 0.50, 1.70, 0.045, 0.032, "oak", tint="#b08a62", chamfer=0.003, rebate=0.008)
    rot = Matrix.Rotation(math.radians(-7), 4, "X")  # top leans back toward the wall (+Y)
    for o in kit.meshes():
        o.matrix_world = rot @ o.matrix_world


def pill_rattan():
    w, h, rr = 0.40, 1.10, 0.017
    path = lib.shape("pill", w, h, inset=rr)
    lib.sweep_tube(path, rr, -rr, "rattan", tint="#b08d5e", ring=14, name="rim")
    # board and glass sit in the rim's groove (edges hidden inside the cane)
    lib.slab("pill", w, h, -0.011, -0.003, HARDBOARD, inset=0.021, bevel=0.0, name="back")
    lib.slab("pill", w, h, -0.015, -0.011, "mirror", inset=0.021, bevel=0.0006, name="glass")


def hallway_shelf():
    W, H, T = 0.50, 0.80, 0.018
    oak = ("oak", "#b89067")
    lib.slab("rounded", W, H, -T, 0, oak[0], r=0.025, tint=oak[1], bevel=0.003, grain="y", name="board")
    lib.slab("rounded", 0.42, 0.44, -T - 0.004, -T, "mirror", r=0.018, z0=0.315, bevel=0.0015, name="glass")
    # ledge shelf with a small front lip
    kit.box((W, 0.11, 0.02), (0, -T - 0.055, 0.225), oak[0], tint=oak[1], bevel=0.003)
    kit.box((W, 0.012, 0.012), (0, -T - 0.11 + 0.006, 0.245), oak[0], tint=oak[1], bevel=0.003)
    # three round oak pegs under the shelf, tilted slightly upward, set 6 mm into the board
    for x in (-0.15, 0.0, 0.15):
        peg = kit.cylinder(0.0095, 0.065, (0, 0, 0), oak[0], tint=oak[1], verts=24, bevel=0.003, rot=(78, 0, 0))
        peg.location = (x, -T + 0.006, 0.10)
        knob = kit.cylinder(0.0135, 0.012, (0, 0, 0), oak[0], tint=oak[1], verts=24, bevel=0.004, rot=(78, 0, 0))
        tip = 0.065 - 0.002
        knob.location = (x, -T + 0.006 - tip * math.sin(math.radians(78)), 0.10 + tip * math.cos(math.radians(78)))
