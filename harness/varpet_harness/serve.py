"""The architect as a local service for the editor's StructureAdapter.

    uv run varpet-harness serve [--port 8788]

POST /structure  {"plan": {"name", "data"}, "photos": [{"name", "data"}, ...]}  (data is base64)
Replies with newline-delimited JSON: {"type": "progress", "message"} lines, then exactly one of
{"type": "structure", "rooms", "walls", "notes"} (the StructureAdapter result) or {"type": "error", "message"}.
The structure is a proposal: the editor shows it for review, nothing is applied here.
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
import time
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .graph import Job
from .shell import Shell, to_editor

MAX_BODY = 40_000_000
MAX_PHOTOS = 4
SAFE = re.compile(r"[^A-Za-z0-9._-]")


def _save(item: dict, folder: Path, fallback: str) -> Path:
    name = SAFE.sub("_", str(item.get("name") or fallback))[-80:] or fallback
    path = folder / name
    path.write_bytes(base64.b64decode(item["data"], validate=True))
    return path


async def reconstruct(body: dict, repo: Path, runs: Path, progress: Callable[[str], None], runner_factory=None) -> dict:
    if not isinstance(body.get("plan"), dict):
        raise ValueError("send a plan image")
    folder = runs / f"architect-{time.strftime('%Y%m%d-%H%M%S')}-{time.monotonic_ns() % 10_000}"
    inputs = folder / "inputs"
    inputs.mkdir(parents=True)
    plan = _save(body["plan"], inputs, "plan.jpg")
    photos = [_save(p, inputs, f"photo-{i + 1}.jpg") for i, p in enumerate(body.get("photos", [])[:MAX_PHOTOS])]
    job = Job(id="shell", kind="shell", brief="Read this flat's plan and photos into rooms and walls.",
              refs=[str(plan), *map(str, photos)], skills=["flat-shell"], effort="medium")
    progress(f"Reading the plan with {len(photos)} photo{'s' if len(photos) != 1 else ''}")

    if runner_factory is None:
        from openai_codex import AsyncCodex

        from .codex_runner import CodexRunner

        codex = AsyncCodex()
        try:
            result = await CodexRunner(codex, repo, progress=progress).run(job, folder / "shell", {})
        finally:
            await codex.close()
    else:
        result = await runner_factory(progress).run(job, folder / "shell", {})

    if result.status != "ok" or not result.output:
        raise RuntimeError(f"The architect could not produce a checked structure ({result.error}). Files: {folder}")
    progress(f"Checked structure ready ({result.tokens // 1000}k tokens, {result.seconds:.0f} s)")
    return to_editor(Shell.model_validate_json(Path(result.output).read_text()))


def handler(repo: Path, runs: Path, runner_factory=None):
    class Handler(BaseHTTPRequestHandler):
        def _cors(self) -> None:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_POST(self) -> None:
            if self.path.rstrip("/") != "/structure":
                self.send_error(404)
                return
            size = int(self.headers.get("Content-Length") or 0)
            if not 0 < size <= MAX_BODY:
                self.send_error(413 if size else 411)
                return
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/x-ndjson")
            self.end_headers()

            def line(obj: dict) -> None:
                self.wfile.write((json.dumps(obj) + "\n").encode())
                self.wfile.flush()

            try:
                body = json.loads(self.rfile.read(size))
                structure = asyncio.run(reconstruct(body, repo, runs, lambda m: line({"type": "progress", "message": m}),
                                                    runner_factory))
                line({"type": "structure", **structure})
            except Exception as e:  # the editor shows the message; the service keeps running
                line({"type": "error", "message": f"{type(e).__name__}: {e}"})

        def log_message(self, fmt, *args) -> None:
            print(f"architect {self.address_string()} {fmt % args}")

    return Handler


def serve(repo: Path, runs: Path, port: int) -> None:
    server = ThreadingHTTPServer(("127.0.0.1", port), handler(repo, runs))
    print(f"architect service on http://127.0.0.1:{port}/structure (runs in {runs})")
    server.serve_forever()
