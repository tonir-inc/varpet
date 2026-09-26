"""Set fields in a finish's material.json.

    python catalog/tools/set_finish.py oak clearcoat=0.25 clearcoat_roughness=0.35
"""

import json
import sys
from pathlib import Path

MATERIALS = Path(__file__).resolve().parents[1] / "materials"

if __name__ == "__main__":
    meta = MATERIALS / sys.argv[1] / "material.json"
    m = json.loads(meta.read_text())
    for pair in sys.argv[2:]:
        key, value = pair.split("=", 1)
        try:
            m[key] = json.loads(value)
        except ValueError:
            m[key] = value
    meta.write_text(json.dumps(m, indent=2) + "\n")
    print(meta.parent.name, {k: m[k] for k in (p.split("=")[0] for p in sys.argv[2:])})
