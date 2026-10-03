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
import logging
import os
import shutil
import socket
import select
import threading
from contextvars import ContextVar
from io import BytesIO

import tempfile
import re
import time
import uuid
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from urllib.parse import parse_qs, urlparse

from PIL import Image, ImageOps, UnidentifiedImageError

from .plan_gate import classify_plan, unavailable, parse_verdict, InvalidVerdict, TIMEOUT
from .http_policy import public_origin, origin_allowed, client_ip, HourlyLimit
from .graph import Job
from .pieces import catalog, runs as list_runs
from .shell import Shell, to_editor

MAX_BODY = 40_000_000
MAX_PHOTOS = 4
MAX_FLAT_PHOTOS = 10
GEOMETRY_TURNS = 3  # Komitas, 26 Sept: one repair turn left 7/10 plans with faults
SAFE = re.compile(r"[^A-Za-z0-9._-]")

LOCAL_ORIGIN = re.compile(r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?")
_INPUTS = ContextVar('run_inputs', default=None)


def _prepare_runs(runs: Path) -> None:
    runs.mkdir(parents=True, exist_ok=True, mode=0o700)
    runs.chmod(0o700)
    cutoff = time.time() - float(os.environ.get('VARPET_RUN_RETENTION_HOURS', '24')) * 3600
    for folder in runs.iterdir():
        if not folder.is_symlink() and folder.is_dir() and folder.stat().st_mtime < cutoff:
            shutil.rmtree(folder)


def _track_inputs(inputs: Path) -> None:
    tracked = _INPUTS.get()
    if tracked is not None:
        tracked.append(inputs)


def _run_connected(work, disconnected):
    """Bound cancellation even when SDK shutdown fails to finish."""
    loop = asyncio.new_event_loop()
    inputs = []
    token = _INPUTS.set(inputs)
    async def watch():
        task = asyncio.create_task(work)
        try:
            while not task.done():
                await asyncio.wait({task}, timeout=0.1)
                if disconnected():
                    raise ConnectionAbortedError('Client disconnected')
            return task.result()
        except BaseException:
            task.cancel()
            await asyncio.wait({task}, timeout=0.2)
            for folder in inputs:
                shutil.rmtree(folder, ignore_errors=True)
            raise
    try:
        return loop.run_until_complete(watch())
    finally:
        for task in asyncio.all_tasks(loop):
            task.cancel()
        loop.close()
        _INPUTS.reset(token)


def _save(item: dict, folder: Path, fallback: str) -> Path:
    name = SAFE.sub("_", str(item.get("name") or fallback))[-80:] or fallback
    path = folder / name
    data = base64.b64decode(item["data"], validate=True)
    try:
        image = Image.open(BytesIO(data))
    except UnidentifiedImageError:
        path.write_bytes(data)
    else:
        with image:
            if image.format in ('JPEG', 'PNG', 'WEBP'):
                clean = ImageOps.exif_transpose(image)
                clean.info.clear()
                clean.save(path, format=image.format)
            else:
                path.write_bytes(data)
    return path


async def reconstruct(body: dict, repo: Path, runs: Path, progress: Callable[[str], None], runner_factory=None) -> dict:
    if not isinstance(body.get("plan"), dict):
        raise ValueError("send a plan image")
    folder = runs / f"architect-{time.strftime('%Y%m%d-%H%M%S')}-{time.monotonic_ns() % 10_000}"
    inputs = folder / "inputs"
    inputs.mkdir(parents=True)
    _track_inputs(inputs)
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
            result = await CodexRunner(codex, repo, fix_turns=GEOMETRY_TURNS, progress=progress).run(job, folder / "shell", {})
        finally:
            await codex.close()
    else:
        result = await runner_factory(progress).run(job, folder / "shell", {})

    if result.status != "ok" or not result.output:
        raise RuntimeError(f"The architect could not produce a checked structure ({result.error}). Files: {folder}")
    progress(f"Checked structure ready ({result.tokens // 1000}k tokens, {result.seconds:.0f} s)")
    return to_editor(Shell.model_validate_json(Path(result.output).read_text()))


FRIENDLY = [("architect: reading the fixtures", "Reading the kitchen, bathroom and furniture"),
            ("architect: reading", "Reading the plan: rooms, walls, doors and windows"),
            ("architect: fixing shell", "Correcting the walls and fixtures"),
            ("architect: fixing pieces", "Correcting the furniture list"),
            ("builders:", "Building furniture from the photos"),
            ("architect: placing", "Placing the furniture where the photos show it"),
            ("architect: fixing furnish", "Correcting the furniture positions"),
            ("architect: checking", "Checking the result against the photos")]


def _friendly(message: str) -> str:
    """Harness progress lines for people: the step, without internal names."""
    for prefix, text in FRIENDLY:
        if message.startswith(prefix):
            detail = message.split(":", 1)[1].strip() if prefix == "builders:" else ""
            return f"{text} ({detail})" if detail else text
    if message.startswith("set ") and ": fixing " in message:
        return "Improving " + message.split(": fixing ", 1)[1].replace("-", " ")
    if ": fixing" in message:
        return "Improving " + message.split(":", 1)[0].replace("-", " ")
    if ": checking" in message:
        return "Checking " + message.split(":", 1)[0].replace("-", " ")
    if message.startswith("set ") and ": working on " in message:
        return "Building " + message.split(": working on ", 1)[1].replace("-", " ")
    if ": working" in message:
        return "Building " + message.split(":", 1)[0].replace("-", " ")
    return message


async def furnished_flat(body: dict, repo: Path, runs: Path, progress: Callable[[str], None], emit=None,
                         base_url: str = "http://127.0.0.1:8788") -> dict:
    """Plan + photos -> the whole architect session -> the editor project (furniture and fixtures)."""
    from openai_codex import AsyncCodex

    from .session import run_session

    if not isinstance(body.get("plan"), dict):
        raise ValueError("send a plan image")
    name = SAFE.sub("-", str(body.get("name") or "flat")).strip("-").lower()[:40] or "flat"
    # Upload replacements can start several sessions with the same name in a single second.
    # Keep the previous 56-character bound: built asset IDs also include this directory name.
    run_dir = runs / f"{name[:27]}-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:12]}"
    inputs = run_dir / "inputs"
    inputs.mkdir(parents=True)
    _track_inputs(inputs)
    plan = _save(body["plan"], inputs, "plan.jpg")
    photos = [_save(p, inputs, f"photo-{i + 1}.jpg") for i, p in enumerate(body.get("photos", [])[:MAX_FLAT_PHOTOS])]
    progress(f"Starting with the plan and {len(photos)} photo{'s' if len(photos) != 1 else ''}")
    codex = AsyncCodex()
    try:
        report = await run_session(codex, repo, name, str(plan), [str(p) for p in photos], run_dir,
                                   _compile_cmd(repo),
                                   progress=progress, emit=emit, base_url=base_url)
    finally:
        await codex.close()
    project = run_dir / "project.json"
    if not project.exists():
        raise RuntimeError(f"The architect finished but the flat could not be exported. Files: {run_dir}")
    progress(f"Done in {report.seconds / 60:.1f} min")
    return json.loads(project.read_text())


def _compile_cmd(repo: Path) -> list[str]:
    return ["uv", "run", "--project", str(repo / "compiler"), "python", "-m", "partdsl.compile"]


async def check_plan(body: dict, classifier=None) -> dict:
    if not isinstance(body.get("plan"), dict):
        raise ValueError("send a plan image")
    with tempfile.TemporaryDirectory(prefix="varpet-plan-check-") as folder:
        plan = _save(body["plan"], Path(folder), "plan.jpg")
        try:
            result = await asyncio.wait_for((classifier or classify_plan)(plan), timeout=TIMEOUT)
        except InvalidVerdict:
            raise
        except Exception:
            logging.getLogger(__name__).warning("Plan gate unavailable; allowing reconstruction", exc_info=True)
            return unavailable()
        return parse_verdict(result)


def handler(repo: Path, runs: Path, runner_factory=None, *, classifier=None):
    build_lock = threading.Lock()
    public = public_origin()
    build_limit = HourlyLimit('VARPET_BUILD_LIMIT_PER_HOUR', 3)
    plan_limit = HourlyLimit('VARPET_PLAN_CHECK_LIMIT_PER_HOUR', 30)

    class Handler(BaseHTTPRequestHandler):
        def _allowed(self):
            origin = self.headers.get('Origin')
            host = self.headers.get('Host')
            allowed_hosts = {f'{name}:{self.server.server_port}' for name in ('localhost', '127.0.0.1', '[::1]')}
            if public:
                allowed_hosts.add(urlparse(public).netloc)
            if not origin_allowed(origin, LOCAL_ORIGIN) or host not in allowed_hosts:
                self._json(403, {'error': 'Origin or Host is not allowed'})
                return False
            return True

        def _disconnected(self):
            if not hasattr(self, 'connection'):
                return False
            readable, _, _ = select.select([self.connection], [], [], 0)
            return bool(readable) and not self.connection.recv(1, socket.MSG_PEEK)

        def _cors(self) -> None:
            origin = self.headers.get('Origin')
            if origin and origin_allowed(origin, LOCAL_ORIGIN):
                self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def do_OPTIONS(self) -> None:
            if not self._allowed():
                return
            self.send_response(204)
            self._cors()
            self.end_headers()

        def _json(self, status: int, body) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:
            if not self._allowed():
                return
            url = urlparse(self.path)
            base = public or f"http://{self.headers.get('Host') or '127.0.0.1'}"
            if url.path == "/runs":
                return self._json(200, list_runs(runs))
            if url.path == "/pieces":
                name = (parse_qs(url.query).get("run") or [""])[0]
                run_dir = (runs / name).resolve()
                if not name or run_dir.parent != runs.resolve() or not (run_dir / "graph.json").exists():
                    return self._json(404, {"error": f"no run {name!r}"})
                return self._json(200, catalog(run_dir, base))
            if url.path.startswith("/files/"):
                target = (runs / url.path[len("/files/"):]).resolve()
                if target.suffix != ".glb" or runs.resolve() not in target.parents or not target.is_file():
                    return self._json(404, {"error": "not found"})
                data = target.read_bytes()
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "model/gltf-binary")
                self.send_header("Cache-Control", "no-store")  # pieces get rebuilt under the same path
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            self._json(404, {"error": "not found"})

        def do_POST(self) -> None:
            if not self._allowed():
                return
            if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
                return self._json(415, {'error': 'Expected application/json'})
            route = self.path.rstrip("/")
            if route not in ("/structure", "/flat", "/plan-check"):
                self.send_error(404)
                return
            size = int(self.headers.get("Content-Length") or 0)
            if not 0 < size <= MAX_BODY:
                self.send_error(413 if size else 411)
                return
            if route == "/plan-check":
                if not plan_limit.allow(client_ip(self)):
                    return self._json(429, {'error': f'Plan check limit reached ({plan_limit.maximum} per hour). Please try again in an hour.'})
                try:
                    body = json.loads(self.rfile.read(size))
                    return self._json(200, asyncio.run(check_plan(body, classifier)))
                except Exception as e:
                    return self._json(400, {"error": f"{type(e).__name__}: {e}"})
            if not build_lock.acquire(blocking=False):
                return self._json(429, {'error': 'A build is already running'})
            try:
                if not build_limit.allow(client_ip(self)):
                    return self._json(429, {'error': f'Build limit reached ({build_limit.maximum} per hour). Please try again in an hour.'})
                self._build(route, size)
            finally:
                build_lock.release()

        def _build(self, route, size):
            # Read the whole upload before answering: once the response starts, proxies (Cloudflare) may stop
            # forwarding a slow plan-plus-photos body, and the half-read request looked like a client disconnect.
            try:
                raw = self.rfile.read(size)
            except (ConnectionError, BrokenPipeError):
                return
            if len(raw) < size:
                return self._json(400, {'error': 'The upload was interrupted. Please try again.'})
            try:
                body = json.loads(raw)
            except ValueError:
                return self._json(400, {'error': 'Expected a JSON body'})
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/x-ndjson")
            self.end_headers()

            def line(obj: dict) -> None:
                self.wfile.write((json.dumps(obj) + "\n").encode())
                self.wfile.flush()

            try:
                progress = lambda m: line({"type": "progress", "message": _friendly(m)})
                progress("Checking the plan")
                verdict = _run_connected(check_plan(body, classifier), self._disconnected)
                if not verdict["is_plan"] and verdict["confidence"] >= 0.5:
                    line({"type": "rejected", "kind": verdict["kind"], "reason": verdict["reason"]})
                    return
                if route == "/flat":
                    project = _run_connected(furnished_flat(body, repo, runs, progress, emit=line,
                                                         base_url=public or f"http://{self.headers.get('Host') or '127.0.0.1:8788'}"), self._disconnected)
                    line({"type": "project", "project": project})
                else:
                    structure = _run_connected(reconstruct(body, repo, runs, progress, runner_factory), self._disconnected)
                    line({"type": "structure", **structure})
            except (ConnectionError, BrokenPipeError):
                return
            except Exception as e:  # the editor shows the message; the service keeps running
                line({"type": "error", "message": f"{type(e).__name__}: {e}"})

        def log_message(self, fmt, *args) -> None:
            print(f"architect {self.address_string()} {fmt % args}")

    return Handler


def serve(repo: Path, runs: Path, port: int) -> None:
    _prepare_runs(runs)
    server = ThreadingHTTPServer(("127.0.0.1", port), handler(repo, runs))
    print(f"architect service on http://127.0.0.1:{port}/structure (runs in {runs})")
    server.serve_forever()
