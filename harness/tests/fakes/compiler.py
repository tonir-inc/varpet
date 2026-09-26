"""Fake compiler per compiler/README.md: rejects the first attempt, passes the second."""
import json
import sys
from pathlib import Path

program, workdir = Path(sys.argv[1]), Path(sys.argv[2])
seen = workdir / ".compiled"
if not seen.exists():
    seen.write_text("1")
    (workdir / "faults.json").write_text(json.dumps([{"part": "leg-2", "fault": "floating", "gap_m": 0.03}]))
    sys.exit(1)
sys.exit(0)
