#!/usr/bin/env python3
"""Pitch rehearsal: boot the designer service and the editor on free ports, run one scripted live turn on a demo flat
in a real browser (brief -> streamed rooms -> partial preview -> proposal -> Apply -> follow-up -> Apply -> Undo) and
print the timings. Screenshots land in --out. Stops what it started.

  python3 tools/demo_rehearse.py [--flat orion-t8] [--out DIR] [--brief TEXT] [--follow-up TEXT]
  python3 tools/demo_rehearse.py --service http://127.0.0.1:8787 --editor http://127.0.0.1:5173  # reuse running ones

The flat is apartments/<flat>/scene.json (or origin/demo/flats until those land on main), or any editor JSON path."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BRIEF = ("Furnish the living room with kitchen and the reading room for a young couple who both work from home: "
         "warm Japandi, oak and linen, a big sofa for movie nights, dining for six, and a proper desk corner in the "
         "reading room. Budget 3 million AMD.")
FOLLOW_UP = "Add a floor lamp next to the sofa and make the rug warmer."


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for(url: str, seconds: float, origin: str | None = None) -> float:
    started = time.monotonic()
    while time.monotonic() - started < seconds:
        try:
            request = urllib.request.Request(url, headers={"Origin": origin} if origin else {})
            with urllib.request.urlopen(request, timeout=2) as response:
                if response.status == 200:
                    return time.monotonic() - started
        except OSError:
            pass
        time.sleep(0.5)
    raise RuntimeError(f"{url} did not come up in {seconds:.0f} s")


def flat_path(flat: str, work: Path) -> Path:
    path = Path(flat)
    if path.suffix == ".json" and path.exists():
        return path
    local = ROOT / "apartments" / flat / "scene.json"
    if local.exists():
        return local
    target = work / f"{flat}.json"
    shown = subprocess.run(["git", "-C", str(ROOT), "show", f"origin/demo/flats:apartments/{flat}/scene.json"],
                           capture_output=True, text=True)
    if shown.returncode:
        raise SystemExit(f"no flat {flat}: not in apartments/ and not on origin/demo/flats")
    target.write_text(shown.stdout)
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--flat", default="orion-t8")
    parser.add_argument("--out", default=None)
    parser.add_argument("--brief", default=BRIEF)
    parser.add_argument("--follow-up", default=FOLLOW_UP)
    parser.add_argument("--service", help="use a running designer service at this base URL")
    parser.add_argument("--editor", help="use a running editor at this base URL (it must point at --service)")
    parser.add_argument("--session", metavar="NAME", help="record the run and write apps/editor/public/demo-sessions/NAME.json")
    parser.add_argument("--title", help="the session's title (with --session)")
    parser.add_argument("--image", help="an inspiration picture attached to the brief")
    args = parser.parse_args()
    work = Path(tempfile.mkdtemp(prefix="varpet-rehearse-"))
    out = Path(args.out) if args.out else work / "shots"
    started: list[subprocess.Popen] = []
    timings: dict[str, float] = {}
    try:
        service = args.service
        if not service:
            port = free_port()
            service = f"http://127.0.0.1:{port}"
            env = {**os.environ, **({"VARPET_RECORD_DIR": str(work / "recordings")} if args.session else {})}
            started.append(subprocess.Popen(["uv", "run", "python", "designer_service.py", "--port", str(port)],
                                            cwd=ROOT / "harness", stdout=open(work / "service.log", "w"), stderr=subprocess.STDOUT,
                                            env=env))
            timings["service_up_s"] = round(wait_for(service + "/designer/health", 120), 1)
            # Warm start: the render daemon and Codex come up before the first request.
            clock = time.monotonic()
            while time.monotonic() - clock < 180:
                with urllib.request.urlopen(service + "/designer/health", timeout=2) as response:
                    warm = json.loads(response.read().decode().splitlines()[0]).get("warm", {})
                if warm and all(value in ("ready", "failed") for value in warm.values()):
                    break
                time.sleep(1)
            timings["service_warm_s"] = round(time.monotonic() - clock + timings["service_up_s"], 1)
            print(json.dumps({"event": "warm", **warm}), flush=True)
        editor = args.editor
        if not editor:
            port = free_port()
            editor = f"http://127.0.0.1:{port}"
            started.append(subprocess.Popen(["npx", "vite", "--port", str(port), "--strictPort", "--host", "127.0.0.1"],
                                            cwd=ROOT / "apps/editor", env={**os.environ, "VITE_DESIGNER_URL": service},
                                            stdout=open(work / "vite.log", "w"), stderr=subprocess.STDOUT))
            timings["editor_up_s"] = round(wait_for(editor, 60), 1)
        print(json.dumps({"event": "boot", "service": service, "editor": editor, **timings}), flush=True)
        flat = flat_path(args.flat, work)
        driver = subprocess.run(["node", str(ROOT / "tools/demo_rehearse.mjs"), editor + "/?editor",
                                 str(flat), str(out), args.brief, args.follow_up], text=True,
                                capture_output=True, env={**os.environ, **({"REHEARSE_IMAGE": str(Path(args.image).resolve())} if args.image else {})})
        if args.session and (work / "recordings").is_dir():
            made = subprocess.run([sys.executable, str(ROOT / "tools/demo_session.py"), str(work / "recordings"), str(flat),
                                   args.session, "--title", args.title or args.flat], capture_output=True, text=True)
            print((made.stdout or made.stderr).strip(), flush=True)
        result = {}
        for line in driver.stdout.splitlines():
            print(line, flush=True)
            if line.startswith('{"event":"done"'):
                result = json.loads(line)
        if driver.stderr.strip():
            print(driver.stderr[-2000:], file=sys.stderr)
        print(json.dumps({"event": "summary", "ok": driver.returncode == 0, **timings, **result.get("timings", {}),
                          "screenshots": str(out), "logs": str(work)}), flush=True)
        return driver.returncode
    finally:
        for process in reversed(started):
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    sys.exit(main())
