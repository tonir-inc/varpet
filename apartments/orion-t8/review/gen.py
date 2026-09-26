"""Generates apartments/orion-t8/trace.svg (pixel coordinates of source.png, 1428x2519)."""
import math
from pathlib import Path

OUT = Path("/Users/snek/dev/varpet-demo/apartments/orion-t8/trace.svg")

# the angled facade: inner face x = FI + K*(y-1600), 41 px wide horizontally
K, FI = 0.3675, 476.0
fin = lambda y: FI + K * (y - 1600)          # inner (room) face
fc = lambda y: fin(y) - 20.5                 # centreline

el = []


def rect(x0, y0, x1, y1):
    return f"{x0},{y0} {x1},{y0} {x1},{y1} {x0},{y1}"


def wall(i, x0, y0, x1, y1, cls="main"):
    el.append(f'<polygon id="{i}" class="wall {cls}" points="{rect(x0, y0, x1, y1)}"/>')


def line(i, cls, x1, y1, x2, y2):
    el.append(f'<line id="{i}" class="{cls}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>')


def poly(i, cls, pts, **attrs):
    a = "".join(f' data-{k.replace("_", "-")}="{v}"' for k, v in attrs.items())
    p = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    el.append(f'<polygon id="{i}" class="{cls}"{a} points="{p}"/>')


def fix(i, kind, name, x0, y0, x1, y1):
    el.append(f'<polygon id="{i}" class="fixture" data-kind="{kind}" data-name="{name}" points="{rect(x0 + 2, y0 + 2, x1 - 2, y1 - 2)}"/>')


def furn(i, kind, name, front, x0, y0, x1, y1, asset=None):
    a = f' data-asset="{asset}"' if asset else ""
    el.append(f'<polygon id="{i}" class="furniture" data-kind="{kind}" data-name="{name}" data-front="{front}"{a} '
              f'points="{rect(x0, y0, x1, y1)}"/>')


# ---------------- rooms (inside faces)
poly("lounge", "room", [(71, 86), (372, 86), (372, 163), (437, 163), (437, 684), (169, 684), (169, 593), (71, 593)],
     name="Reading room")
poly("bedroom-1", "room", [(449, 124), (834, 124), (834, 409), (912, 409), (912, 684), (449, 684)], name="Bedroom 1")
poly("bedroom-2", "room", [(845, 124), (1270, 124), (1270, 163), (1309, 163), (1309, 684), (924, 684), (924, 398),
                           (845, 398)], name="Bedroom 2")
poly("hall", "room", [(175.5, 696), (834, 696), (834, 853), (671, 853), (671, 944), (449, 944), (449, 905), (372, 905),
                      (372, 944), (175.5, 944)], name="Entrance hall")
poly("lobby", "room", [(846, 696), (1035, 696), (1035, 853), (846, 853)], name="Inner hall")
poly("bathroom", "room", [(683, 865), (1035, 865), (1035, 1062), (683, 1062)], name="Bathroom")
poly("shower-room", "room", [(1047, 696), (1309, 696), (1309, 905), (1270, 905), (1270, 982), (1309, 982), (1309, 1062),
                             (1047, 1062)], name="Shower room")
poly("living", "room", [(449, 944), (671, 944), (671, 1113), (1048, 1113), (1048, 1171), (1309, 1171), (1309, 1231),
                        (1270, 1231), (1270, 1360), (1309, 1360), (1309, 2089), (1270, 2089), (1270, 2120), (737, 2120),
                        (737, 2089), (fin(2089), 2089), (fin(1359), 1359), (540, 1359), (540, 1283), (410, 1283),
                        (410, 982), (449, 982)], name="Living room and kitchen")
poly("balcony", "room", [(737, 2130), (1270, 2130), (1270, 2166), (1309, 2166), (1309, 2437), (fin(2437), 2437),
                         (fin(2166), 2166), (737, 2166)], name="Balcony", kind="balcony")

# ---------------- walls
wall("wall-glass-reading", 65, 74, 410.5, 86)
wall("pier-top-left", 372, 80, 449, 163)
wall("wall-glass-bedrooms", 410.5, 112, 1273, 124)
wall("pier-top-right", 1270, 124, 1327.5, 163)
wall("wall-east-bedroom", 1309, 143.5, 1346, 690)
wall("wall-east-shower", 1309, 690, 1346, 1000)
wall("wall-east-duct", 1309, 1000, 1346, 1150)
wall("wall-east-living", 1309, 1150, 1346, 2089)
wall("wall-east-balcony", 1309, 2089, 1346, 2437)
wall("wall-west-reading", 59, 80, 71, 599)
wall("wall-shaft-top", 65, 593, 163, 605, "secondary")
wall("wall-shaft-side", 157, 599, 169, 690, "secondary")
wall("wall-reading-bedroom", 437, 163, 449, 690, "secondary")
wall("wall-bedrooms-hall", 163, 684, 1327.5, 696, "secondary")
wall("wall-closet-left", 834, 118, 845, 403.5, "secondary")
wall("wall-closet-mid", 839.5, 398, 918, 409, "secondary")
wall("wall-closet-right", 912, 403.5, 924, 690, "secondary")
wall("wall-entrance", 150.5, 690, 175.5, 963)
wall("wall-core-top", 163, 944, 391, 982)
wall("wall-core-side", 372, 905, 410, 1321)
wall("pier-hall", 410, 905, 449, 982)
wall("pier-core-bottom", fc(1321), 1283, 540, 1359)
wall("wall-lobby", 834, 690, 846, 859, "secondary")
wall("wall-bath-top", 677, 853, 1041, 865, "secondary")
wall("wall-bath-left", 671, 859, 683, 1106.5, "secondary")
wall("wall-shower-left", 1035, 690, 1047, 1067.5, "secondary")
wall("wall-bath-bottom", 677, 1062, 1327.5, 1073, "secondary")
wall("wall-kitchen-top", 677, 1100, 1054, 1113, "secondary")
wall("wall-duct-side", 1048, 1067.5, 1060, 1165, "secondary")
wall("wall-duct-bottom", 1054, 1159, 1327.5, 1171, "secondary")
wall("pier-shower", 1270, 905, 1309, 982)
wall("pier-kitchen", 1270, 1231, 1309, 1360)
wall("pier-balcony-left", fc(2127.5) - 8, 2089, 737, 2166)
wall("pier-balcony-right", 1270, 2089, 1309, 2166)
wall("wall-glass-balcony", 737, 2120, 1289.5, 2130)

# the facade as a rotated rectangle along its centreline from the core pier to the balcony edge
y0, y1 = 1321, 2437
p0, p1 = (fc(y0), y0), (fc(y1), y1)
L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
ux, uy = (p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L
h = 20.5 * uy  # perpendicular half-thickness
nx, ny = uy, -ux
poly("wall-facade", "wall main", [(p0[0] - nx * h, p0[1] - ny * h), (p0[0] + nx * h, p0[1] + ny * h),
                                  (p1[0] + nx * h, p1[1] + ny * h), (p1[0] - nx * h, p1[1] - ny * h)])

# ---------------- openings
line("window-reading", "window", 71, 80, 372, 80)
line("window-bedroom-1", "window", 449, 118, 829, 118)
line("window-bedroom-2", "window", 930, 118, 1270, 118)
line("door-reading", "door", 306, 690, 423, 690)
line("door-bedroom-1", "door", 703, 690, 820, 690)
line("door-bedroom-2", "door", 927, 690, 1032, 690)
line("door-entrance", "door", 163, 696, 163, 827)
line("door-inner-hall", "door", 840, 716, 840, 833)
line("door-bathroom", "door", 696, 859, 801, 859)
line("door-shower-room", "door", 1041, 722, 1041, 827)
line("door-balcony", "door", 740, 2125, 850, 2125)
line("window-balcony", "window", 850, 2125, 1270, 2125)

# ---------------- fixtures
fix("bath", "bath", "Bathtub", 918, 865, 1035, 1062)
fix("bath-toilet", "toilet", "Toilet", 833, 968, 887, 1062)
fix("bath-basin", "basin", "Washbasin", 683, 993, 801, 1062)
fix("shower", "shower", "Shower tray", 1152, 905, 1270, 1062)
fix("shower-toilet", "toilet", "Toilet", 1217, 817, 1309, 897)
fix("shower-basin", "basin", "Washbasin", 1242, 696, 1309, 786)
fix("washer", "washing_machine", "Washing machine", 1047, 983, 1127, 1062)
fix("fridge", "fridge", "Fridge", 671, 1113, 749, 1200)
fix("oven-column", "oven", "Oven column", 749, 1113, 827, 1200)
fix("worktop-1", "worktop", "Worktop", 827, 1113, 885, 1205)
fix("kitchen-sink", "sink", "Kitchen sink", 885, 1113, 990, 1205)
fix("worktop-2", "worktop", "Worktop", 990, 1113, 1048, 1205)
fix("worktop-3", "worktop", "Worktop", 1048, 1171, 1217, 1205)
fix("worktop-corner", "worktop", "Worktop", 1217, 1171, 1309, 1231)
fix("worktop-4", "worktop", "Worktop", 1217, 1231, 1270, 1360)
fix("worktop-5", "worktop", "Worktop", 1217, 1360, 1309, 1380)
fix("hob", "hob", "Hob", 1217, 1380, 1309, 1470)
fix("worktop-6", "worktop", "Worktop", 1217, 1470, 1309, 1490)
ca, cb = (fin(1815) + 2, 1815), (fin(2065) + 2, 2065)
dn = (0.9385 * 44, -0.3453 * 44)
el.append('<polygon id="convector" class="fixture" data-kind="radiator" data-name="Floor convector" points="'
          + " ".join(f"{x:.1f},{y:.1f}" for x, y in (ca, cb, (cb[0] + dn[0], cb[1] + dn[1]), (ca[0] + dn[0], ca[1] + dn[1]))) + '"/>')
fix("railing", "railing", "Balcony railing", 800, 2426, 1305, 2436)

# ---------------- furniture: footprints sized to the pinned catalog model, centred where the plan draws each piece
PX = 138.2  # px per metre, from the build's scale


def piece(i, kind, name, front, cx, cy, w, d, asset):
    hw, hd = w * PX / 2, d * PX / 2
    ex, ey = (hw, hd) if front in ("up", "down") else (hd, hw)
    furn(i, kind, name, front, round(cx - ex, 1), round(cy - ey, 1), round(cx + ex, 1), round(cy + ey, 1), asset)


BED, NIGHT, WARD = "abo:B07GFS1W12", "abo:B07RMZ83ZY", "abo:B01LWRYSFS"
ARM, DCHAIR = "abo:B082VMWB4G", "abo:B0853KR33B"
# reading room
piece("reading-rug", "rug", "Striped leather rug", "down", 254, 292, 2.45, 1.54, "abo:B07B51T9SR")
piece("reading-chair-1", "chair", "Armchair", "down", 145, 232, 0.79, 0.82, ARM)
piece("reading-chair-2", "chair", "Armchair", "down", 351, 232, 0.79, 0.82, ARM)
piece("reading-table", "table", "Coffee table", "down", 246, 355, 0.9, 0.45, "abo:B01LWVEZ1C")
piece("reading-bookcase", "shelf", "Bookcase", "right", 71 + 0.35 * PX / 2 + 2, 470, 0.91, 0.35, "abo:B07B7DL32H")
piece("reading-lamp", "lamp", "Floor lamp", "down", 248, 150, 0.42, 0.42, "abo:B07374SBFN")
# bedroom 1: head against the west wall
piece("bed-1", "bed", "Double bed", "right", 449 + 1.96 * PX / 2 + 2, 391, 1.62, 1.96, BED)
piece("night-1a", "cabinet", "Bedside table", "right", 449 + 0.38 * PX / 2 + 2, 242, 0.45, 0.38, NIGHT)
piece("night-1b", "cabinet", "Bedside table", "right", 449 + 0.38 * PX / 2 + 2, 540, 0.45, 0.38, NIGHT)
piece("wardrobe-1", "wardrobe", "Open wardrobe", "left", 912 - 0.48 * PX / 2 - 2, 546.5, 1.77, 0.48, WARD)
# bedroom 2: head against the east wall
piece("bed-2", "bed", "Double bed", "left", 1309 - 1.96 * PX / 2 - 2, 391, 1.62, 1.96, BED)
piece("night-2a", "cabinet", "Bedside table", "left", 1309 - 0.38 * PX / 2 - 2, 242, 0.45, 0.38, NIGHT)
piece("night-2b", "cabinet", "Bedside table", "left", 1309 - 0.38 * PX / 2 - 2, 540, 0.45, 0.38, NIGHT)
piece("wardrobe-2", "wardrobe", "Open wardrobe", "right", 845 + 0.48 * PX / 2 + 2, 261, 1.77, 0.48, WARD)
# entrance hall
piece("hall-console", "shelf", "Hall console", "up", 273, 944 - 0.39 * PX / 2 - 3, 1.19, 0.39, "abo:B07DBFG1BH")
# dining
piece("dining-table", "table", "Round dining table", "down", 939, 1430, 0.9, 0.9, "abo:B0853Q3Z93")
piece("dining-chair-n", "chair", "Dining chair", "down", 939, 1430 - 62 - 0.59 * PX / 2 - 4, 0.49, 0.59, DCHAIR)
piece("dining-chair-s", "chair", "Dining chair", "up", 939, 1430 + 62 + 0.59 * PX / 2 + 4, 0.49, 0.59, DCHAIR)
piece("dining-chair-w", "chair", "Dining chair", "right", 939 - 62 - 0.59 * PX / 2 - 4, 1430, 0.49, 0.59, DCHAIR)
piece("dining-chair-e", "chair", "Dining chair", "left", 939 + 62 + 0.59 * PX / 2 + 4, 1430, 0.49, 0.59, DCHAIR)
# lounge
piece("living-rug", "rug", "Handwoven ivory rug", "left", 1095, 1828, 2.44, 1.53, "abo:B07QHL6SF2")
piece("sofa", "sofa", "Linen sofa", "left", 1309 - 0.9 * PX / 2 - 2, 1828, 2.2, 0.9, "abo:B075X4QMX3")
piece("coffee-table", "table", "Oval coffee table", "left", 1125, 1828, 1.08, 0.54, "abo:B07GFG6JMM")
piece("living-chair-1", "chair", "Armchair", "right", 1000, 1727, 0.79, 0.82, ARM)
piece("living-chair-2", "chair", "Armchair", "right", 1000, 1929, 0.79, 0.82, ARM)
piece("living-lamp", "lamp", "Floor lamp", "down", 1276, 1640, 0.42, 0.42, "abo:B07374SBFN")
# balcony bistro set
piece("balcony-table", "table", "Bistro table", "down", 1100, 2280, 0.75, 0.75, "abo:B07MF1V33V")
piece("balcony-chair-1", "chair", "Bistro chair", "right", 1100 - 52 - 0.59 * PX / 2 - 4, 2280, 0.49, 0.59, DCHAIR)
piece("balcony-chair-2", "chair", "Bistro chair", "left", 1100 + 52 + 0.59 * PX / 2 + 4, 2280, 0.49, 0.59, DCHAIR)

OUT.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1428 2519" data-printed="120.6 m2">\n  '
               + "\n  ".join(el) + "\n</svg>\n")
print("wrote", OUT)
