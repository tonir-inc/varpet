import base64
import json
import threading
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
