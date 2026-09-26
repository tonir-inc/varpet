"""Checker per compiler/README.md that replays <workdir>/script.json: one faults list per call, null passes."""
import json
import sys
from pathlib import Path

workdir = Path(sys.argv[2])
script = json.loads((workdir / "script.json").read_text())
calls = workdir / ".calls"
n = int(calls.read_text()) if calls.exists() else 0
calls.write_text(str(n + 1))
faults = script[min(n, len(script) - 1)]
if faults is None:
    sys.exit(0)
(workdir / "faults.json").write_text(json.dumps(faults))
sys.exit(1)
