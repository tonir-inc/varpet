"""Open wall shelves, styled: oak or walnut boards on black steel L-brackets or floating, a black steel rail shelf,
and a two-tier oak unit. Back on the wall (Blender y 0), the bracket's lowest point is the piece's underside.
Contents are the styling props, each standing on the board top it is computed from.
"""
import random

import kit
from common import piece
from styling import (OAK, WALNUT, WHITE_CER, book_row, canister, glass_jar, herb, mug, plate_stack, trailing_plant,
                     upright_plate, vessel)

IRON = "paint:#232324"
D = 0.22          # board depth
UNDER = 1.45      # underside above the floor: ~55 cm over a 90 cm worktop
BOOKS = ["paint:#b4553a", "paint:#2f4a5c", "paint:#e3d6b8", "paint:#6d7f5c", "paint:#1f1f21", "paint:#c9a24a",
         "paint:#8a3b3b", "paint:#d7d1c4"]


def bracket(x, top, arm=0.18, leg=0.15):
    """Black L-bracket: leg on the wall below the board, arm under it."""
    kit.box((0.025, 0.004, leg), (x, -0.002, top - leg), IRON, bevel=0.001, roughness=0.5, name="leg")
    kit.box((0.025, arm, 0.004), (x, -arm / 2, top - 0.004), IRON, bevel=0.001, roughness=0.5, name="arm")


def board(w, z, wood, t=0.03, d=D):
    kit.box((w, d, t), (0, -d / 2, z), wood[0], wood[1], bevel=0.003, name="board")
    return z + t


def on_brackets(w, wood, leg=0.15):
    """Board on two brackets; returns the board top (z)."""
    inset = 0.12 if w < 0.8 else 0.18
    for sx in (-1, 1):
        bracket(sx * (w / 2 - inset), leg, leg=leg)
    return board(w, leg, wood)


def shelf_piece(slug, title, price, colors, mats, style, tags):
    return piece(slug, title, "shelf", "wall", colors, price, mats, style, "shelf", ["open shelf", "wall shelf", *tags],
                 mount_bottom=UNDER)


@shelf_piece("shelf-oak-60-plates", "Oak wall shelf on black brackets, 60 cm, styled with plates and mugs", 26000,
             ["beige", "white", "black"], ["solid oak", "steel", "stoneware"], "scandinavian", ["oak", "plates", "mugs"])
def _():
    z = on_brackets(0.6, OAK)
    upright_plate((-0.16, -0.0, z), "ceramic:#f1eee8", r=0.13)
    upright_plate((-0.07, -0.025, z), "ceramic:#d9cbb4", r=0.11)
    plate_stack((0.08, -0.11, z), 4, WHITE_CER, r=0.1)
    mug((0.2, -0.1, z), "ceramic:#8fa08a", turn=-60)
    mug((0.08, -0.11, z + 0.05), WHITE_CER, turn=-120)


@shelf_piece("shelf-oak-90-jars", "Oak wall shelf on black brackets, 90 cm, styled with pantry jars, mugs and herbs", 34000,
             ["beige", "green", "black"], ["solid oak", "steel", "glass"], "farmhouse", ["oak", "jars", "herbs"])
def _():
    z = on_brackets(0.9, OAK)
    glass_jar((-0.36, -0.1, z), 0.05, 0.2, "paint:#e3c27a", 0.8)
    glass_jar((-0.24, -0.1, z), 0.055, 0.16, "paint:#b4552f", 0.7)
    glass_jar((-0.13, -0.1, z), 0.05, 0.13, "paint:#efe9dc", 0.75)
    for k, spec in enumerate(("ceramic:#f1eee8", "ceramic:#2c2c2e", "ceramic:#c8b79c")):
        mug((0.02 + 0.1 * k, -0.11, z), spec, turn=-70)
    herb((0.34, -0.1, z), "basil", seed=9)


@shelf_piece("shelf-oak-120-cookbooks", "Oak wall shelf on black brackets, 120 cm, styled with cookbooks, bowls and a pothos",
             42000, ["beige", "white", "green"], ["solid oak", "steel", "stoneware"], "scandinavian",
             ["oak", "cookbooks", "plant"])
def _():
    z = on_brackets(1.2, OAK)
    book_row(-0.56, -0.01, z, BOOKS[:6], rng=random.Random(4))
    for k in range(3):
        vessel((-0.15, -0.11, z + 0.03 * k), 0.05, 0.08, 0.035, "ceramic:#e7dfd2", t=0.004, name="bowl")
    canister((0.04, -0.1, z), 0.06, 0.16, WHITE_CER)
    upright_plate((0.2, 0.0, z), "ceramic:#c6d0c4", r=0.13)
    trailing_plant((0.45, -0.1, z))


@shelf_piece("shelf-walnut-90-floating", "Floating walnut shelf, 90 cm x 4 cm, styled with stoneware and cookbooks", 38000,
             ["brown", "white"], ["walnut", "stoneware"], "modern", ["walnut", "floating shelf", "cookbooks"])
def _():
    z = board(0.9, 0.0, WALNUT, t=0.04, d=0.24)
    plate_stack((-0.3, -0.12, z), 5, "ceramic:#efece6", r=0.11)
    mug((-0.3, -0.12, z + 0.06), "ceramic:#efece6", turn=-60)
    x = book_row(-0.12, -0.02, z, BOOKS[2:6], rng=random.Random(8))
    canister((x + 0.12, -0.12, z), 0.055, 0.12, "ceramic:#2c2c2e", WALNUT)
    herb((0.34, -0.12, z), "rosemary", pot="ceramic:#f1eee8", seed=12)


@shelf_piece("shelf-walnut-120-plates", "Walnut wall shelf on black brackets, 120 cm, styled with plates, jars and herbs",
             46000, ["brown", "white", "green"], ["walnut", "steel", "stoneware", "glass"], "traditional",
             ["walnut", "plates", "herbs"])
def _():
    z = on_brackets(1.2, WALNUT)
    for k, (spec, r) in enumerate((("ceramic:#f1eee8", 0.13), ("ceramic:#9aa98f", 0.12), ("ceramic:#f1eee8", 0.1))):
        upright_plate((-0.44 + 0.11 * k, -0.01 - 0.02 * k, z), spec, r=r)
    plate_stack((-0.1, -0.11, z), 3, "ceramic:#9aa98f", r=0.1)
    glass_jar((0.1, -0.1, z), 0.05, 0.2, "paint:#e3c27a", 0.8)
    glass_jar((0.22, -0.1, z), 0.05, 0.14, "paint:#6b4a32", 0.7)
    herb((0.42, -0.1, z), "thyme", seed=5)


@shelf_piece("shelf-black-steel-60-rail", "Black steel kitchen shelf with a hanging rail, 60 cm, styled with jars and mugs",
             24000, ["black", "white"], ["powder-coated steel", "stoneware", "glass"], "industrial",
             ["black metal", "rail", "mugs"])
def _():
    w = 0.6
    for sx in (-1, 1):
        kit.box((0.004, 0.2, 0.2), (sx * (w / 2 - 0.002), -0.1, 0.0), IRON, bevel=0.001, roughness=0.5, name="side")
    kit.box((w, 0.2, 0.004), (0, -0.1, 0.12), IRON, bevel=0.001, roughness=0.5, name="shelf")
    kit.box((w, 0.004, 0.03), (0, -0.198, 0.124), IRON, bevel=0.001, roughness=0.5, name="lip")
    kit.cylinder(0.006, w - 0.008, (-(w - 0.008) / 2, -0.17, 0.03), IRON, verts=12, bevel=0, rot=(0, 90, 0), name="rail")
    z = 0.124
    glass_jar((-0.2, -0.1, z), 0.045, 0.15, "paint:#efe9dc", 0.7)
    glass_jar((-0.09, -0.1, z), 0.045, 0.11, "paint:#3d2a1e", 0.8)
    mug((0.06, -0.1, z), WHITE_CER, turn=-60)
    mug((0.18, -0.1, z), "ceramic:#2c2c2e", turn=-60)
    for k, x in enumerate((-0.18, -0.06, 0.06, 0.18)):  # S-hooks with a utensil each under the rail
        kit.curve_tube([(x, -0.17, 0.036), (x, -0.165, 0.02), (x, -0.17, 0.0)], 0.0025, "metal:#9c9ea0", name="hook")
        kit.cylinder(0.006, 0.12 - 0.02 * (k % 2), (x, -0.17, -0.12 + 0.02 * (k % 2)), "oak", "#c8a27a" if k % 2 else None,
                     verts=10, bevel=0.002, name="utensil")


@shelf_piece("shelf-oak-90-two-tier", "Two-tier oak wall shelf on black rods, 90 cm, styled with crockery and a pothos",
             52000, ["beige", "white", "black"], ["solid oak", "steel", "stoneware"], "japandi",
             ["oak", "two tier", "plant", "crockery"])
def _():
    w = 0.9
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.08)
        kit.cylinder(0.006, 0.38, (x, -0.19, 0.0), IRON, verts=12, bevel=0, name="rod")
        for zz in (0.0, 0.3):
            kit.box((0.02, D, 0.004), (x, -D / 2, zz), IRON, bevel=0.001, roughness=0.5, name="arm")
            kit.box((0.02, 0.004, 0.06), (x, -0.002, zz), IRON, bevel=0.001, roughness=0.5, name="plate")
    z0 = board(w, 0.004, OAK, t=0.025)
    z1 = board(w, 0.304, OAK, t=0.025)
    plate_stack((-0.28, -0.11, z0), 5, WHITE_CER, r=0.1)
    for k in range(3):
        vessel((-0.04, -0.11, z0 + 0.035 * k), 0.045, 0.075, 0.04, "ceramic:#d9cbb4", t=0.004, name="bowl")
    for k, spec in enumerate((WHITE_CER, "ceramic:#2c2c2e")):
        mug((0.18 + 0.11 * k, -0.11, z0), spec, turn=-60)
    upright_plate((-0.3, 0.0, z1), "ceramic:#d9cbb4", r=0.12)
    glass_jar((-0.1, -0.1, z1), 0.05, 0.16, "paint:#e3c27a", 0.75)
    trailing_plant((0.25, -0.1, z1), seed=11)
