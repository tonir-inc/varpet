"""Review picture: a top-down plan PNG of a finished run for the architect to check
against the listing photos (rooms, walls, openings, fixtures and every placed piece
with an arrow toward its front).

Frame: x to the right, z down the image, metres. Rotation 0 = front faces +z.

CLI: python -m varpet_harness.review <run_dir> <out.png>
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pydantic import ValidationError
from shapely import affinity
from shapely.geometry import LineString, Point, Polygon

from .furnish import Furnished, footprint, load_run
from .graph import Graph
from .pieces import _colour
from .shell import Shell

SS = 2  # supersampling: draw at 2x, downscale for antialiasing
LONG_SIDE_PX = 1400
MARGIN_PX = 70
TITLE_PX = 70
FOOTER_PX = 80
ARROW = (230, 110, 0)  # orange: neither door red nor window blue
DOOR = (215, 30, 30)
WINDOW = (30, 90, 220)
INK = (25, 25, 25)
FIXTURE = (150, 150, 150)
MIN_ARROW_PX = 40
FONTS = ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVuSans.ttf")


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for path in FONTS:
        try:
            return ImageFont.truetype(path, size, index=1 if bold and path.endswith(".ttc") else 0)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def _rgb(hex_: str) -> tuple[int, int, int]:
    h = hex_.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _blend(rgb: tuple[int, int, int], alpha: float) -> tuple[int, int, int]:
    return tuple(round(alpha * c + (1 - alpha) * 255) for c in rgb)


def _components(raw: dict) -> list[tuple[str, Polygon]]:
    """Fixtures from shell.json `components`, read raw (the Shell model may not know them yet).
    position [x, z] or [x, y, z]; dimensions [w, d] or [w, h, d]; rotation in degrees like
    placements, unless it is within one turn in radians (the editor's BuildingComponent)."""
    out = []
    for c in raw.get("components", []) or []:
        pos, dim = c.get("position", [0, 0]), c.get("dimensions", [0.5, 0.5])
        x, z = (pos[0], pos[2]) if len(pos) >= 3 else (pos[0], pos[1])
        w, d = (dim[0], dim[2]) if len(dim) >= 3 else (dim[0], dim[1])
        rot = float(c.get("rotation", 0) or 0)
        deg = rot if abs(rot) > 2 * math.pi + 1e-6 or rot == 0 else math.degrees(rot)
        rect = Polygon([(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)])
        poly = affinity.translate(affinity.rotate(rect, -deg, origin=(0, 0)), x, z)
        out.append((str(c.get("name") or c.get("kind") or c.get("id") or "fixture"), poly))
    return out


class _Canvas:
    def __init__(self, bounds: tuple[float, float, float, float], title: str, px_per_m: int):
        minx, minz, maxx, maxz = bounds
        self.minx, self.minz = minx, minz
        long_side = max(maxx - minx, maxz - minz, 0.5)
        self.s = max(px_per_m, LONG_SIDE_PX / long_side)  # px per metre in the final image
        w = (maxx - minx) * self.s + 2 * MARGIN_PX
        h = (maxz - minz) * self.s + 2 * MARGIN_PX + TITLE_PX + FOOTER_PX
        self.img = Image.new("RGB", (round(w * SS), round(h * SS)), "white")
        self.d = ImageDraw.Draw(self.img)
        self.title = title
        self.boxes: list[tuple[float, float, float, float]] = []  # placed label boxes, image px

    def px(self, x: float, z: float) -> tuple[float, float]:
        return ((MARGIN_PX + (x - self.minx) * self.s) * SS, (TITLE_PX + MARGIN_PX + (z - self.minz) * self.s) * SS)

    def pts(self, poly: Polygon) -> list[tuple[float, float]]:
        return [self.px(x, z) for x, z in list(poly.exterior.coords)[:-1]]

    def poly(self, poly: Polygon, fill, outline=None, width: int = 0) -> None:
        pts = self.pts(poly)
        self.d.polygon(pts, fill=fill)
        if outline:
            self.d.line(pts + [pts[0]], fill=outline, width=width * SS, joint="curve")

    def text_box(self, xy, text, font) -> tuple[float, float, float, float]:
        l, t, r, b = self.d.textbbox(xy, text, font=font, anchor="mm", stroke_width=3 * SS)
        return l, t, r, b

    def label(self, anchor, lines: list[str], fonts: list, hard=(), soft=(), leader: bool = True) -> None:
        """Place a multi-line label near anchor (image px), dodging earlier labels and `hard` shapes
        (image-px shapely geometries), and `soft` shapes too when there is room."""
        ax, ay = anchor
        heights = [self.text_box((0, 0), t, f) for t, f in zip(lines, fonts)]
        bw = max(r - l for l, _, r, _ in heights)
        bh = sum(b - t for _, t, _, b in heights) + 2 * SS * (len(lines) - 1)
        step = 10 * SS
        cands = [(0, 0)] + [(dx * k, dy * k) for k in range(1, 16)
                            for dx, dy in ((0, -1), (0, 1), (1, 0), (-1, 0), (1, -1), (-1, -1), (1, 1), (-1, 1))]
        best = None
        for avoid in (list(hard) + list(soft), list(hard), []):
            for dx, dy in cands:
                cx, cy = ax + dx * step, ay + dy * step
                box = (cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2)
                if any(_hit(box, o) for o in self.boxes):
                    continue
                rect = Polygon([(box[0], box[1]), (box[2], box[1]), (box[2], box[3]), (box[0], box[3])])
                if any(rect.intersects(a) for a in avoid):
                    continue
                best = (cx, cy, box)
                break
            if best:
                break
        if best is None:
            best = (ax, ay, (ax - bw / 2, ay - bh / 2, ax + bw / 2, ay + bh / 2))
        cx, cy, box = best
        if leader and not (box[0] <= ax <= box[2] and box[1] <= ay <= box[3]):
            ex = min(max(ax, box[0]), box[2])
            ey = min(max(ay, box[1]), box[3])
            self.d.line([(ax, ay), (ex, ey)], fill=(60, 60, 60), width=2 * SS)
            self.d.ellipse([ax - 4 * SS, ay - 4 * SS, ax + 4 * SS, ay + 4 * SS], fill=(60, 60, 60))
        self.boxes.append(box)
        y = box[1]
        for (l, t, r, b), text, f in zip(heights, lines, fonts):
            hh = b - t
            self.d.text((cx, y + hh / 2), text, font=f, fill=INK, anchor="mm", stroke_width=3 * SS, stroke_fill="white")
            y += hh + 2 * SS

    def arrow(self, a, b, colour, width: int) -> None:
        (x0, y0), (x1, y1) = a, b
        ang = math.atan2(y1 - y0, x1 - x0)
        head = 20 * SS
        base = (x1 - head * math.cos(ang), y1 - head * math.sin(ang))
        wing = 11 * SS
        left = (base[0] + wing * math.sin(ang), base[1] - wing * math.cos(ang))
        right = (base[0] - wing * math.sin(ang), base[1] + wing * math.cos(ang))
        # white halo so the arrow reads over any fill
        self.d.line([(x0, y0), base], fill="white", width=(width + 5) * SS)
        self.d.polygon([(x1 + 3 * SS * math.cos(ang), y1 + 3 * SS * math.sin(ang)), _grow(left, base, 3 * SS),
                        _grow(right, base, 3 * SS)], fill="white")
        self.d.line([(x0, y0), base], fill=colour, width=width * SS)
        self.d.polygon([(x1, y1), left, right], fill=colour)
        r = (width + 2) * SS
        self.d.ellipse([x0 - r, y0 - r, x0 + r, y0 + r], fill=colour, outline="white", width=2 * SS)


def _grow(p, centre, by):
    dx, dy = p[0] - centre[0], p[1] - centre[1]
    n = math.hypot(dx, dy) or 1
    return p[0] + dx / n * by, p[1] + dy / n * by


def _hit(a, b) -> bool:
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])


def _tint(run_dir: Path, piece: str) -> tuple[int, int, int]:
    prog = run_dir / piece / "program.json"
    try:
        return _rgb(_colour(json.loads(prog.read_text())))
    except (OSError, ValueError):
        return _rgb("#b0b0b0")


def _front(p, width: float, depth: float, reach: float) -> tuple[Point, Point, LineString]:
    """Centre, arrow tip past the front edge, and the front edge; same transform as footprint()."""
    def place(g):
        return affinity.translate(affinity.rotate(g, -p.rotation, origin=(0, 0)), p.x, p.z)
    return place(Point(0, 0)), place(Point(0, depth / 2 + reach)), place(LineString([(-width / 2, depth / 2), (width / 2, depth / 2)]))


def _sizes(run_dir: Path) -> dict[str, tuple[float, float, float]]:
    """Piece sizes as furnish.load_run reads them; its Shell check rejects `components` until the
    model has them, so fall back to reading the graph directly then."""
    try:
        return load_run(run_dir)[1]
    except ValidationError:
        graph = Graph.model_validate_json((run_dir / "graph.json").read_text())
        out = {}
        for j in graph.jobs:
            prog = run_dir / j.id / "program.json"
            if j.kind == "piece" and (run_dir / j.id / "piece.glb").exists():
                out[j.id] = tuple(json.loads(prog.read_text()).get("size") if prog.exists() else j.size)
        return out


def render(run_dir: Path, out: Path, px_per_m: int = 90) -> Path:
    run_dir, out = Path(run_dir), Path(out)
    raw = json.loads((run_dir / "shell" / "shell.json").read_text())
    shell = Shell.model_validate({k: v for k, v in raw.items() if k != "components"})
    sizes = _sizes(run_dir)
    pf = run_dir / "furnish" / "placements.json"
    placements = Furnished.model_validate_json(pf.read_text()).placements if pf.exists() else []
    fixtures = _components(raw)

    rooms = [(r, Polygon(r.polygon)) for r in shell.rooms]
    xs = [c[0] for _, p in rooms for c in p.exterior.coords] + [c for w in shell.walls for c in (w.start[0], w.end[0])]
    zs = [c[1] for _, p in rooms for c in p.exterior.coords] + [c for w in shell.walls for c in (w.start[1], w.end[1])]
    cv = _Canvas((min(xs) - 0.3, min(zs) - 0.3, max(xs) + 0.3, max(zs) + 0.3), run_dir.name, px_per_m)
    s = cv.s

    # Rooms
    for r, poly in rooms:
        cv.poly(poly, fill=_blend(_rgb(r.color), 0.35))
    # Walls, each separately (a union would be a ring with a hole)
    for w in shell.walls:
        line = LineString([w.start, w.end])
        if line.length > 0:
            # square ends fill the corner where two walls meet at their centrelines, as the editor's mitres do
            cv.poly(line.buffer(w.thickness / 2, cap_style="square"), fill=INK)
    for w in shell.walls:
        line = LineString([w.start, w.end])
        for o in w.openings:
            seg = LineString([line.interpolate(o.offset), line.interpolate(min(o.offset + o.width, line.length))])
            if seg.length > 0:
                cv.poly(seg.buffer(w.thickness / 2 + 0.03, cap_style="flat"),
                        fill=DOOR if o.kind == "door" else WINDOW, outline="white", width=1)

    # Fixtures
    for name, poly in fixtures:
        cv.poly(poly, fill=FIXTURE, outline=(70, 70, 70), width=2)

    # Furniture
    feet, arrows = [], []
    for p in placements:
        if p.piece not in sizes:
            continue
        w, dep, _ = sizes[p.piece]
        fp = footprint(p, w, dep)
        tint = _tint(run_dir, p.piece)
        cv.poly(fp, fill=tint, outline=INK, width=3)
        if sum(tint) < 240:  # a dark piece gets a white inner line so it does not read as wall
            inner = fp.buffer(-5 / s, join_style="mitre")
            if not inner.is_empty and inner.geom_type == "Polygon":
                cv.poly(inner, fill=None, outline="white", width=2)
        feet.append((p, fp, dep))
    for p, fp, dep in feet:
        # arrow: centre to past the front edge; at least 0.35 m or 60 px beyond centre
        # arrow: centre to 80% of the way to the front edge, or MIN_ARROW_PX when that is shorter
        # (thin pieces), so two pieces facing each other (table and chair) get arrows that do not meet
        reach = max(0.8 * dep / 2, MIN_ARROW_PX / s) - dep / 2
        c, tip, edge = _front(p, sizes[p.piece][0], dep, reach)
        cv.d.line([cv.px(*q) for q in edge.coords], fill=ARROW, width=6 * SS)
        a, b = cv.px(c.x, c.y), cv.px(tip.x, tip.y)
        cv.arrow(a, b, ARROW, 5)
        arrows.append(LineString([a, b]).buffer(14 * SS))

    # Labels: furniture first, then fixtures, then rooms (dodging footprints)
    f_piece, f_room, f_area = _font(19 * SS, bold=True), _font(24 * SS, bold=True), _font(18 * SS)
    for p, fp, dep in feet:
        # prefer the back half so the arrow stays clear
        c, tip, _ = _front(p, sizes[p.piece][0], dep, 0)
        back = (2 * c.x - tip.x, 2 * c.y - tip.y)
        anchor = cv.px(c.x + (back[0] - c.x) * 0.5, c.y + (back[1] - c.y) * 0.5)
        others = [Polygon(cv.pts(o)) for q, o, _ in feet if q is not p]
        cv.label(anchor, [f"{p.piece} #{p.copy_}"], [f_piece], hard=arrows, soft=others)
    for name, poly in fixtures:
        cv.label(cv.px(poly.centroid.x, poly.centroid.y), [name[:18]], [_font(16 * SS)], hard=arrows)
    for r, poly in rooms:
        rp = poly.representative_point() if not poly.contains(poly.centroid) else poly.centroid
        cv.label(cv.px(rp.x, rp.y), [r.name, f"{poly.area:.1f} m2"], [f_room, f_area],
                 hard=arrows + [Polygon(cv.pts(fp)) for _, fp, _ in feet], leader=False)

    _chrome(cv, run_dir.name)
    final = cv.img.resize((round(cv.img.width / SS), round(cv.img.height / SS)), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    final.save(out)
    return out


def _chrome(cv: _Canvas, name: str) -> None:
    d, H = cv.d, cv.img.height
    d.text((MARGIN_PX * SS, TITLE_PX * SS / 2), f"{name}  -  furnished plan (top-down)", font=_font(30 * SS, bold=True),
           fill=INK, anchor="lm")
    y = H - FOOTER_PX * SS / 2
    x0 = MARGIN_PX * SS
    bar = cv.s * SS
    d.rectangle([x0, y - 6 * SS, x0 + bar, y + 6 * SS], fill=INK)
    d.rectangle([x0 + bar / 2, y - 4 * SS, x0 + bar - 2 * SS, y + 4 * SS], fill="white")
    small = _font(18 * SS)
    d.text((x0, y - 12 * SS), "0", font=small, fill=INK, anchor="mb")
    d.text((x0 + bar, y - 12 * SS), "1 m", font=small, fill=INK, anchor="mb")
    x = x0 + bar + 40 * SS
    d.text((x, y), "x right, z down", font=small, fill=INK, anchor="lm")
    x += d.textlength("x right, z down", font=small) + 40 * SS
    for colour, text in ((DOOR, "door"), (WINDOW, "window")):
        d.rectangle([x, y - 7 * SS, x + 30 * SS, y + 7 * SS], fill=colour)
        x += 38 * SS
        d.text((x, y), text, font=small, fill=INK, anchor="lm")
        x += d.textlength(text, font=small) + 30 * SS
    cv.arrow((x, y), (x + 60 * SS, y), ARROW, 5)
    x += 72 * SS
    d.text((x, y), "= front of piece", font=small, fill=INK, anchor="lm")


def main() -> None:
    print(render(Path(sys.argv[1]), Path(sys.argv[2])))


if __name__ == "__main__":
    main()
