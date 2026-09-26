"""A finished run as the event stream /flat sends, with realistic timing, for building and demoing
the live construction view without an 8-minute wait.

    python -m varpet_harness.replay <run dir> <out.json> [--speed 10]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .export import lights, scene
from .graph import Graph
from .pieces import asset
from .shell import Shell, to_editor


def events(run_dir: Path, base_url: str = "http://127.0.0.1:8788") -> list[dict]:
    report = json.loads((run_dir / "report.json").read_text()) if (run_dir / "report.json").exists() else {}
    steps = {s["step"]: s["seconds"] for s in report.get("steps", [])}
    read, build, place = steps.get("read", 240), steps.get("build", 90), steps.get("place", 90)
    graph = Graph.model_validate_json((run_dir / "graph.json").read_text())
    pieces = [j for j in graph.jobs if j.kind == "piece"]
    out = [{"t": 0, "type": "progress", "message": "Reading the plan and photos: walls, doors, kitchen and bathroom"}]
    for i, c in enumerate(["sips -c 900 1400 plan.jpg --out crop-top.png", "sips -c 700 900 plan.jpg --out crop-bath.png",
                           "python3 -c 'measure scale from printed dimensions'"]):
        out.append({"t": 30 + i * 50, "type": "activity", "who": "architect", "kind": "command", "text": c})
    out.append({"t": read - 5, "type": "activity", "who": "architect", "kind": "file", "text": "shell.json"})
    out.append({"t": read, "type": "shell", **to_editor(Shell.model_validate_json((run_dir / "shell" / "shell.json").read_text()))})
    out.append({"t": read, "type": "pieces", "pieces": [{"id": j.id, "size": j.size, "count": j.count} for j in pieces]})
    out.append({"t": read + 1, "type": "progress", "message": f"Building furniture from the photos ({len(pieces)} pieces)"})
    for i, j in enumerate(pieces):
        a = asset(run_dir, j, base_url)
        if a:
            t = read + build * (i + 1) / (len(pieces) + 1)
            out.append({"t": t - 8, "type": "progress", "message": f"Building {j.id.replace('-', ' ')}"})
            out.append({"t": t, "type": "piece", "piece": j.id, "count": j.count, "asset": a})
    t = read + build
    out.append({"t": t, "type": "progress", "message": "Placing the furniture where the photos show it"})
    out.append({"t": t + place, "type": "placements", "objects": scene(run_dir, base_url)["objects"], "lights": lights(run_dir, base_url)})
    out.append({"t": t + place + 1, "type": "progress", "message": "Checking the result against the photos"})
    project = run_dir / "project.json"
    if project.exists():
        out.append({"t": t + place + 30, "type": "project", "project": json.loads(project.read_text())})
    return sorted(out, key=lambda e: e["t"])


if __name__ == "__main__":
    run_dir, out = Path(sys.argv[1]), Path(sys.argv[2])
    speed = float(sys.argv[sys.argv.index("--speed") + 1]) if "--speed" in sys.argv else 1.0
    evs = events(run_dir)
    for e in evs:
        e["t"] = round(e["t"] / speed, 2)
    out.write_text(json.dumps(evs))
    print(f"{len(evs)} events over {evs[-1]['t']:.0f} s -> {out}")
