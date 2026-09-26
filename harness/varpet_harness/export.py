"""A finished run as an editor project (v1 SceneDocument): shell plus placed built pieces.

    python -m varpet_harness.export <run dir> <out.json> [--base http://127.0.0.1:8788]

Objects reference the built pieces' catalog ids (pieces.catalog), so the editor must have
those registered; the architect service lists them at /pieces?run=<run>.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from .furnish import Furnished
from .pieces import catalog
from .shell import Shell, to_editor


def scene(run_dir: Path, base_url: str) -> dict:
    shell = Shell.model_validate_json((run_dir / "shell" / "shell.json").read_text())
    furnished = Furnished.model_validate_json((run_dir / "furnish" / "placements.json").read_text())
    assets = {a["id"].removeprefix(f"built-{run_dir.name}-"): a for a in catalog(run_dir, base_url)}
    objects = []
    for p in furnished.placements:
        asset = assets.get(p.piece)
        if asset is None or p.on or p.hanging or p.y > 0.005:
            continue  # the editor keeps furniture on the floor; raised lights become fixtures (lights())
        objects.append({"id": f"{p.piece}-{p.copy_}", "name": f"{asset['name']} {p.copy_}" if p.copy_ > 1 else asset["name"],
                        "assetId": asset["id"], "position": [round(p.x, 4), 0, round(p.z, 4)],
                        "rotation": round(math.radians(p.rotation), 6), "scale": [1, 1, 1]})
    structure = to_editor(shell)
    return {"format": "varpet.editor", "version": 1, "id": run_dir.name, "name": f"{run_dir.name} (architect)",
            "units": "m", "upAxis": "Y", "rooms": structure["rooms"], "walls": structure["walls"], "objects": objects}


def main() -> None:
    run_dir, out = Path(sys.argv[1]), Path(sys.argv[2])
    base = sys.argv[sys.argv.index("--base") + 1] if "--base" in sys.argv else "http://127.0.0.1:8788"
    doc = scene(run_dir, base)
    out.write_text(json.dumps(doc, indent=1))
    print(f"{len(doc['rooms'])} rooms, {len(doc['walls'])} walls, {len(doc['objects'])} pieces -> {out}")


if __name__ == "__main__":
    main()


def lights(run_dir: Path, base_url: str = "http://127.0.0.1:8788") -> list[dict]:
    """Lamps standing on furniture and pendants on the ceiling, as the editor's light fixtures
    (BuildingComponent kind 'light'), which may sit at any height."""
    shell = Shell.model_validate_json((run_dir / "shell" / "shell.json").read_text())
    furnished = Furnished.model_validate_json((run_dir / "furnish" / "placements.json").read_text())
    assets = {a["id"].removeprefix(f"built-{run_dir.name}-"): a for a in catalog(run_dir, base_url)}
    rooms = {r.id for r in shell.rooms}
    out = []
    for p in furnished.placements:
        asset = assets.get(p.piece)
        if asset is None or asset["kind"] != "lamp" or not (p.on or p.hanging or p.y > 0.005):
            continue
        w, h, d = asset["dimensions"]
        out.append({"id": f"{p.piece}-{p.copy_}", "name": asset["name"], "kind": "light",
                    "position": [round(p.x, 4), round(p.y, 4), round(p.z, 4)], "dimensions": [w, h, d],
                    "rotation": round(math.radians(p.rotation), 6), "color": asset["color"], "phase": "existing",
                    **({"roomId": p.room} if p.room in rooms else {})})
    return out
