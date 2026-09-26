"""Build pending catalog requests on a machine with a Codex login.

From the repo root: uv run --project catalog python catalog/generate_worker.py --once
Requires VARPET_DB_URL. SIGINT/SIGTERM fail the active request before exiting;
SIGKILL, machine loss, or an unavailable database cannot guarantee that cleanup.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
from pathlib import Path
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from ingest_abo import mock_price

REPO = Path(__file__).resolve().parents[1]
LOG = logging.getLogger(__name__)


def claim_query(hostname: str, request_id: int | None = None) -> tuple[str, tuple]:
    """One atomic claim; targeted runs also only take pending rows."""
    target = " and id=%s" if request_id is not None else ""
    return (
        "update generation_request set status='building', worker=%s, updated_at=now() "
        "where id = (select id from generation_request where status='pending'"
        + target + " order by created_at for update skip locked limit 1) returning *",
        (hostname,) if request_id is None else (hostname, request_id),
    )


def build_graph(row: dict, reference: Path | None = None, repo: Path = REPO) -> dict:
    return {"flat": f"gen-{row['id']}", "jobs": [{
        "id": "piece", "kind": "piece",
        "brief": row["description"] + " Kind: " + row["kind"],
        "size": list(row["size_m"]), "skills": ["part-dsl-draft"], "effort": "low",
        "refs": [os.path.relpath(reference, repo)] if reference is not None else [],
    }]}


def checked_size(extents: list[float], requested: list[float]) -> list[float]:
    """Convert glTF XYZ extents to catalog width/depth/height and enforce 5 cm."""
    for dimensions in (extents, requested):
        if len(dimensions) != 3 or any(not math.isfinite(x) or x <= 0 for x in dimensions):
            raise ValueError("size must contain three finite positive dimensions")
    measured = [float(extents[0]), float(extents[2]), float(extents[1])]
    if any(abs(a - b) > 0.05 + 1e-9 for a, b in zip(measured, requested)):
        raise ValueError(f"mesh size {measured} differs from requested {requested} by more than 5 cm")
    return measured


def find_piece(runs: Path) -> Path:
    pieces = list(runs.glob("*/piece/piece.glb"))
    if len(pieces) != 1 or pieces[0].stat().st_size == 0:
        raise ValueError("harness did not produce exactly one nonempty piece GLB")
    report = pieces[0].with_name("report.json")
    if not report.is_file():
        raise ValueError("missing compiler report.json")
    data = json.loads(report.read_text())
    if not isinstance(data, dict) or type(data.get("faults")) is not int or data["faults"] != 0:
        raise ValueError("compiler checks failed or missing faults count")
    return pieces[0]


def run_command(command: list[str], timeout: int) -> str:
    """Bound commands and kill their process group on timeout or interruption."""
    with subprocess.Popen(command, cwd=REPO, stdin=subprocess.DEVNULL,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, start_new_session=True) as process:
        try:
            stdout, stderr = process.communicate(timeout=timeout)
        except BaseException:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.communicate()
            raise
        if process.returncode:
            raise RuntimeError(f"{command[0]} exited {process.returncode}: {(stderr or stdout)[-400:]}")
        return stdout


def download_reference(url: str, folder: Path) -> Path:
    # A real image suffix is required for the harness's LocalImageInput path.
    from PIL import Image

    target = folder / "reference.png"
    with urllib.request.urlopen(url, timeout=60) as response:
        raw = folder / "reference.download"
        with raw.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
    with Image.open(raw) as image:
        image.convert("RGB").save(target)
    raw.unlink()
    return target


def build_piece(row: dict, folder: Path) -> tuple[list[float], str]:
    reference = (download_reference(row["reference_image_url"], folder)
                 if row.get("reference_image_url") else None)
    graph = folder / "graph.json"
    graph.write_text(json.dumps(build_graph(row, reference)))
    runs = folder / "runs"
    run_command([
        "uv", "run", "--project", "harness", "varpet-harness", "run", str(graph),
        "--compile", "uv run --project compiler python -m partdsl.compile",
        "--runs", str(runs),
    ], 15 * 60)
    glb = find_piece(runs)
    # Use the compiler environment's trimesh, including scene node transforms.
    output = run_command([
        "uv", "run", "--project", "compiler", "python", "-c",
        "import json, sys, trimesh; "
        "scene = trimesh.load(sys.argv[1], force='scene'); "
        "print(json.dumps(scene.extents.tolist()))", str(glb),
    ], 120)
    measured = checked_size(json.loads(output), row["size_m"])
    filename = f"gen-{row['id']}.glb"
    host = os.environ.get("VARPET_SSH", "sergey@152.53.158.86")
    key = os.path.expanduser(os.environ.get("VARPET_SSH_KEY", "~/.ssh/varpet_ed25519"))
    remote = os.environ.get("VARPET_GEN_DIR", "/opt/varpet-catalog/generated").rstrip("/")
    run_command(["scp", "-B", "-o", "ConnectTimeout=30", "-i", key,
                 str(glb), f"{host}:{remote}/{filename}"], 120)
    base = os.environ.get("VARPET_GEN_URL", "http://100.107.246.46:8766").rstrip("/")
    return measured, f"{base}/{filename}"


def save_item(connection, row: dict, measured: list[float], url: str) -> None:
    item_id = f"gen:{row['id']}"
    # The item and done state become visible together, or neither does.
    with connection.transaction():
        connection.execute("""
            insert into item
                (id, source, source_id, name, kind, size_m, fit_size_m, size_status,
                 size_evidence, price, currency, price_source, glb_url, main_image_url,
                 license, tags)
            values (%s, 'generated', %s, %s, %s, %s, %s, 'confirmed', %s,
                    %s, 'AMD', 'generated', %s, null, 'generated by varpet', %s)
            """, (item_id, str(row["id"]), row["description"][:80], row["kind"],
                  measured, measured,
                  Jsonb({"from": "generated mesh", "requested_m": row["size_m"]}),
                  mock_price(row["kind"], measured), url,
                  Jsonb({"generated": {"description": row["description"]}})))
        connection.execute("""
            update generation_request set status='done', item_id=%s, error=null,
                updated_at=now() where id=%s
            """, (item_id, row["id"]))


def fail_request(connection, db_url: str, request_id: int, error: BaseException) -> None:
    sql = ("update generation_request set status='failed', error=%s, updated_at=now() "
           "where id=%s and status='building'")
    params = (str(error)[:500], request_id)
    try:
        connection.execute(sql, params)
    except psycopg.Error:
        # A broken connection must not prevent a best-effort cleanup via a new one.
        with psycopg.connect(db_url, autocommit=True, connect_timeout=10) as recovery:
            recovery.execute(sql, params)


def handle_one(connection, db_url: str, request_id: int | None = None) -> bool | None:
    """Return None if the queue is empty, otherwise success/failure."""
    row = None
    try:
        # Keep the returned id before committing so interruption can be cleaned up.
        with connection.transaction():
            row = connection.execute(*claim_query(socket.gethostname(), request_id)).fetchone()
        if row is None:
            return None
        with tempfile.TemporaryDirectory(prefix=f"varpet-gen-{row['id']}-") as folder:
            measured, url = build_piece(row, Path(folder))
        save_item(connection, row, measured, url)
        LOG.info("request %s done", row["id"])
        return True
    except BaseException as error:
        if row is not None:
            fail_request(connection, db_url, row["id"], error)
            LOG.error("request %s failed: %s", row["id"], error)
        if not isinstance(error, Exception) or row is None:
            raise
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="handle at most one pending request")
    parser.add_argument("--request-id", type=int, help="handle only this pending request, then exit")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    def interrupted(signum, frame):
        raise KeyboardInterrupt(f"worker interrupted by signal {signum}")

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        db_url = os.environ["VARPET_DB_URL"]
        with psycopg.connect(db_url, autocommit=True, row_factory=dict_row,
                             connect_timeout=10) as connection:
            while True:
                result = handle_one(connection, db_url, args.request_id)
                if args.once or args.request_id is not None:
                    return 1 if result is False else 0
                if result is None:
                    time.sleep(5)
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
