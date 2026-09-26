import base64
import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from test_shell import flat

from varpet_harness.dispatch import JobResult
from varpet_harness.serve import handler


class FakeShellRunner:
    """Writes a known-good shell; stands in for the Codex thread."""

    def __init__(self, progress):
        self.progress = progress

    async def run(self, job, workdir, deps):
        workdir.mkdir(parents=True, exist_ok=True)
        assert Path(job.refs[0]).name == "plan.png" and len(job.refs) == 1 + 4  # photos capped at 4
        self.progress("shell: checking")
        out = workdir / "shell.json"
        out.write_text(flat().model_dump_json())
        return JobResult(job.id, "ok", output=str(out), tokens=40_000, seconds=3)


def post(port, body):
    req = urllib.request.Request(f"http://127.0.0.1:{port}/structure", json.dumps(body).encode(),
                                 {"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        assert r.headers["Access-Control-Allow-Origin"] == "*"
        return [json.loads(line) for line in r.read().splitlines()]


def test_structure_stream(tmp_path):
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler(Path("."), tmp_path, FakeShellRunner))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    img = base64.b64encode(b"fake").decode()
    lines = post(server.server_port, {"plan": {"name": "plan.png", "data": img},
                                      "photos": [{"name": f"p{i}.jpg", "data": img} for i in range(6)]})
    assert [l["type"] for l in lines][-1] == "structure"
    assert any("checking" in l.get("message", "") for l in lines)
    result = lines[-1]
    assert set(result) == {"type", "rooms", "walls", "notes"}  # printed stays behind
    assert set(result["rooms"][0]) == {"id", "name", "polygon", "color"}
    bad = post(server.server_port, {"photos": []})
    assert bad[-1]["type"] == "error" and "plan" in bad[-1]["message"]
    server.shutdown()


def test_pieces_catalog_and_files(tmp_path):
    from varpet_harness.graph import Graph

    run = tmp_path / "demo-20260926-120000"
    (run / "sofa").mkdir(parents=True)
    (run / "bedside-lamp").mkdir()
    (run / "graph.json").write_text(Graph(flat="demo", jobs=[
        {"id": "sofa", "kind": "piece", "brief": "x", "size": [2.2, 0.95, 0.85]},
        {"id": "bedside-lamp", "kind": "piece", "brief": "x", "size": [0.3, 0.3, 0.5]}]).model_dump_json())
    (run / "sofa" / "piece.glb").write_bytes(b"glTF-fake")
    (run / "sofa" / "program.json").write_text(json.dumps({"size": [2.2, 0.95, 0.85], "materials": {"f": {"color": "#e0ddd5"}},
                                                           "parts": [{"size": [2.2, 0.9, 0.4], "material": "f"}]}))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler(Path("."), tmp_path))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"
    get = lambda path: json.loads(urllib.request.urlopen(base + path).read())
    assert get("/runs") == [{"run": run.name, "pieces": 1}]
    [asset] = get(f"/pieces?run={run.name}")  # the lamp has no GLB, so only the sofa
    assert asset["kind"] == "sofa" and asset["dimensions"] == [2.2, 0.85, 0.95] and asset["color"] == "#e0ddd5"
    assert urllib.request.urlopen(asset["source"]["url"]).read() == b"glTF-fake"
    for bad in ("/files/../secret.glb", f"/files/{run.name}/sofa/program.json", "/pieces?run=../x"):
        try:
            urllib.request.urlopen(base + bad)
            raise AssertionError(bad)
        except urllib.error.HTTPError as e:
            assert e.code == 404
    server.shutdown()
