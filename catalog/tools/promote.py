"""Give a finish's plain id to another set; the old plain set becomes <id>-alt.

    python catalog/tools/promote.py linen=linen-gen marble-white=marble-gen
"""

import json
import shutil
import sys
from pathlib import Path

MATERIALS = Path(__file__).resolve().parents[1] / "materials"


def set_id(folder: Path, new_id: str) -> None:
    meta = folder / "material.json"
    m = json.loads(meta.read_text())
    m["id"] = new_id
    meta.write_text(json.dumps(m, indent=2))


def promote(plain: str, winner: str) -> None:
    src, dst, alt = MATERIALS / winner, MATERIALS / plain, MATERIALS / f"{plain}-alt"
    if not src.is_dir():
        sys.exit(f"no set {winner}")
    if dst.is_dir():
        if alt.exists():
            shutil.rmtree(alt)
        dst.rename(alt)
        set_id(alt, alt.name)
    shutil.copytree(src, dst)
    set_id(dst, plain)
    print(f"{plain} <- {winner} (old kept as {alt.name})")


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        promote(*arg.split("="))
