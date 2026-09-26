"""Top-down SVG of a shell next to its plan, and room sizes against a source.json.

    python -m varpet_harness.shell_view <shell.json> <plan image> [source.json] > view.html

A development check only; the product never shows 2D previews.
"""

from __future__ import annotations

import html
import json
import sys
from pathlib import Path

from shapely.geometry import LineString, Polygon

from .shell import Shell

FIT_PX = 520  # the drawing's longer side


def svg(shell: Shell) -> str:
    xs = [p[0] for r in shell.rooms for p in r.polygon] + [c for w in shell.walls for c in (w.start[0], w.end[0])]
    zs = [p[1] for r in shell.rooms for p in r.polygon] + [c for w in shell.walls for c in (w.start[1], w.end[1])]
    x0, z0 = min(xs) - 0.5, min(zs) - 0.5
    PX = FIT_PX / max(max(xs) - x0 + 0.5, max(zs) - z0 + 0.5)
    width, height = (max(xs) - x0 + 0.5) * PX, (max(zs) - z0 + 0.5) * PX
    t = lambda p: f"{(p[0] - x0) * PX:.1f},{(p[1] - z0) * PX:.1f}"
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" style="background:#fff">']
    for r in shell.rooms:
        poly = Polygon(r.polygon)
        c = poly.representative_point()
        out.append(f'<polygon points="{" ".join(t(p) for p in r.polygon)}" fill="{r.color}" fill-opacity="0.45" stroke="#999"/>')
        out.append(f'<text x="{(c.x - x0) * PX:.0f}" y="{(c.y - z0) * PX:.0f}" font-size="11" text-anchor="middle">'
                   f'{html.escape(r.name)} {poly.area:.1f} m²</text>')
    for w in shell.walls:
        out.append(f'<line x1="{t(w.start).split(",")[0]}" y1="{t(w.start).split(",")[1]}" x2="{t(w.end).split(",")[0]}" '
                   f'y2="{t(w.end).split(",")[1]}" stroke="#222" stroke-width="{max(w.thickness * PX, 2):.1f}"/>')
        line = LineString([w.start, w.end])
        for o in w.openings:
            a, b = line.interpolate(o.offset), line.interpolate(o.offset + o.width)
            colour = "#e2553b" if o.kind == "door" else "#3b8be2"
            out.append(f'<line x1="{(a.x - x0) * PX:.1f}" y1="{(a.y - z0) * PX:.1f}" x2="{(b.x - x0) * PX:.1f}" '
                       f'y2="{(b.y - z0) * PX:.1f}" stroke="{colour}" stroke-width="{max(w.thickness * PX, 2) + 2:.1f}"/>')
    out.append("</svg>")
    return "".join(out)


def score(shell: Shell, source: dict) -> list[dict]:
    """Traced room size vs the dimensions the plan prints (source.json room_sizes)."""
    rows = []
    for want in source.get("room_sizes", []):
        dims = want.get("metric_m")
        if not dims:
            continue
        name = want["room"].lower()
        match = next((r for r in shell.rooms if name in r.name.lower() or r.name.lower() in name), None)
        if match is None:
            rows.append({"room": want["room"], "want": dims, "got": None})
            continue
        rect = Polygon(match.polygon).minimum_rotated_rectangle
        edges = sorted({round(LineString(rect.exterior.coords[i : i + 2]).length, 2) for i in range(2)}, reverse=True)
        got = (edges + edges)[:2]
        err = max(abs(g - w) for g, w in zip(sorted(got, reverse=True), sorted(dims, reverse=True)))
        rows.append({"room": want["room"], "traced": match.name, "want": dims, "got": got, "max_err_m": round(err, 2)})
    return rows


def main() -> None:
    shell = Shell.model_validate_json(Path(sys.argv[1]).read_text())
    plan = Path(sys.argv[2]).resolve()
    rows = score(shell, json.loads(Path(sys.argv[3]).read_text())) if len(sys.argv) > 3 else []
    table = "".join(f"<tr><td>{html.escape(r['room'])}</td><td>{r.get('traced', '-')}</td><td>{r['want']}</td>"
                    f"<td>{r.get('got')}</td><td>{r.get('max_err_m', '-')}</td></tr>" for r in rows)
    notes = "".join(f"<li>{html.escape(n)}</li>" for n in shell.notes)
    print(f'''<!doctype html><meta charset="utf-8"><body style="font:13px sans-serif;margin:12px">
<div style="display:flex;gap:16px;align-items:flex-start"><img src="{plan.name}" style="max-width:48%">{svg(shell)}</div>
<table border="1" cellpadding="4" style="border-collapse:collapse;margin-top:10px"><tr><th>plan room</th><th>traced</th><th>printed m</th><th>traced m</th><th>max error m</th></tr>{table}</table>
<ul>{notes}</ul></body>''')
    if rows:
        print(json.dumps(rows), file=sys.stderr)


if __name__ == "__main__":
    main()
