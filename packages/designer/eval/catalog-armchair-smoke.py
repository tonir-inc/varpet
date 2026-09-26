"""Observe the production CLI without changing its defaults or real worker."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "harness"))
import designer_service


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    original = designer_service.DesignerService._process

    def record(kind, **data):
        with (args.output / "sdk.events.jsonl").open("a") as stream:
            stream.write(json.dumps({"timestamp": datetime.now(timezone.utc).isoformat(),
                                     "kind": kind, **data}, ensure_ascii=False) + "\n")

    def observed(self, command, cancel, *, env=None, on_output=None):
        stage = "worker" if "--worker" in command else "to-designer" if "to-designer" in command else "to-command"
        record("process_start", stage=stage)
        stderr_tail = ""

        def capture(channel, chunk):
            nonlocal stderr_tail
            record("process_output", stage=stage, channel=channel, chunk=chunk)
            if channel == "stderr":
                stderr_tail = (stderr_tail + chunk)[-4096:]
                if "usage limit" in stderr_tail.lower():
                    print("CATALOG_SMOKE_USAGE_LIMIT", file=sys.stderr, flush=True)
            if on_output:
                on_output(channel, chunk)
        try:
            result = original(self, command, cancel, env=env, on_output=capture)
            record("process_end", stage=stage, seconds=result.seconds, returncode=result.returncode)
            return result
        finally:
            if env and stage == "worker":
                for path in sorted(Path(env["VARPET_PROPOSALS_DIR"]).glob("*.json")):
                    record("saved_proposal", proposal=json.loads(path.read_text()))

    designer_service.DesignerService._process = observed
    sys.argv = [str(ROOT / "harness/designer_service.py"), "--port", "0"]
    designer_service.main()


if __name__ == "__main__":
    main()
