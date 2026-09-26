import json
from pathlib import Path
from types import SimpleNamespace

from test_shell import flat

from varpet_harness import session as S
from varpet_harness.dispatch import JobResult

REPO = Path(__file__).resolve().parents[2]


class FakeThread:
    id = "t1"

    async def set_name(self, name):
        pass


class FakeCodex:
    async def thread_start(self, **kw):
        self.cwd = Path(kw["cwd"])
        return FakeThread()

    async def thread_archive(self, tid):
        pass


def test_session_reads_builds_places(tmp_path, monkeypatch):
    run = tmp_path / "run"
    turns = []

    async def scripted_turn(self, thread, items, job):
        text = items[0].text
        turns.append(text[:40])
        if text.startswith("You are the architect"):
            (run / "shell" / "shell.json").write_text(flat().model_dump_json())
            (run / "pieces.json").write_text(json.dumps({"pieces": [
                {"id": "sofa", "brief": "white sofa", "size": [2.0, 0.9, 0.8], "refs": ["a.jpg"]}]}))
        elif text.startswith("Step 3"):
            assert "sofa: width 2.0" in text  # the architect is told what was built
            (run / "furnish" / "placements.json").write_text(json.dumps({"placements": [
                {"piece": "sofa", "room": "living", "x": 4.8, "z": 2.0, "rotation": 90}]}))  # into the partition
        elif text.startswith("Code checked furnish"):
            (run / "furnish" / "placements.json").write_text(json.dumps({"placements": [
                {"piece": "sofa", "room": "living", "x": 2.5, "z": 0.55, "rotation": 0}]}))
        return SimpleNamespace(usage=SimpleNamespace(last=SimpleNamespace(total_tokens=1000)))

    async def fake_build(self, job, workdir, deps):
        (workdir / "program.json").write_text(json.dumps({"size": job.size, "materials": {}, "parts": []}))
        (workdir / "piece.glb").write_bytes(b"glb")
        return JobResult(job.id, "ok", output=str(workdir / "program.json"), tokens=500)

    monkeypatch.setattr(S.CodexRunner, "_turn", scripted_turn)
    monkeypatch.setattr(S.CodexRunner, "run", fake_build)
    import asyncio

    report = asyncio.run(S.run_session(FakeCodex(), REPO, "t", "fixtures/real/x/plan.jpg", [], run, None,
                                       review=False, progress=lambda m: None))
    assert [s["step"] for s in report.steps] == ["read", "build", "place", "export"]
    assert report.steps[2]["ok"] and report.architect_turns == 3  # read, place, one fix
    graph = json.loads((run / "graph.json").read_text())
    assert {j["kind"] for j in graph["jobs"]} == {"piece", "shell", "furnish"}


def test_piece_ids_are_normalised(tmp_path):
    f = tmp_path / "pieces.json"
    f.write_text(json.dumps({"pieces": [{"id": "Wood_Dining Chair", "brief": "x", "size": [0.4, 0.5, 0.9]}]}))
    assert S._read_pieces(f).pieces[0].id == "wood-dining-chair"
