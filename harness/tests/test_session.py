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


def test_sets_go_to_one_builder(tmp_path, monkeypatch):
    run = tmp_path / "run"
    sets_built, singles_built = [], []

    async def scripted_turn(self, thread, items, job):
        text = items[0].text
        if text.startswith("You are the architect"):
            (run / "shell" / "shell.json").write_text(flat().model_dump_json())
            (run / "pieces.json").write_text(json.dumps({"pieces": [
                {"id": "dining-table", "brief": "x", "size": [1.2, 0.8, 0.75], "set": "dining"},
                {"id": "dining-chair", "brief": "x", "size": [0.45, 0.5, 0.9], "count": 2, "set": "dining"},
                {"id": "sofa", "brief": "x", "size": [2.0, 0.9, 0.8]}]}))
        elif text.startswith("Step 3"):
            (run / "furnish" / "placements.json").write_text(json.dumps({"placements": []}))
        return SimpleNamespace(usage=SimpleNamespace(last=SimpleNamespace(total_tokens=1000)))

    def write(pid, size):
        (run / pid).mkdir(exist_ok=True)
        (run / pid / "program.json").write_text(json.dumps({"size": size, "materials": {}, "parts": []}))
        (run / pid / "piece.glb").write_bytes(b"glb")

    async def fake_single(self, job, workdir, deps):
        singles_built.append(job.id)
        write(job.id, job.size)
        return JobResult(job.id, "ok", tokens=500)

    async def fake_set(self, name, members, run_dir):
        sets_built.append((name, [m.id for m in members]))
        for m in members:
            write(m.id, m.size)
        return {m.id: JobResult(m.id, "ok", tokens=300, seconds=1) for m in members}

    monkeypatch.setattr(S.CodexRunner, "_turn", scripted_turn)
    monkeypatch.setattr(S.CodexRunner, "run", fake_single)
    monkeypatch.setattr(S.CodexRunner, "run_set", fake_set)
    import asyncio

    report = asyncio.run(S.run_session(FakeCodex(), REPO, "t", "fixtures/real/x/plan.jpg", [], run, None,
                                       review=False, progress=lambda m: None))
    assert sets_built == [("dining", ["dining-table", "dining-chair"])] and singles_built == ["sofa"]
    build = next(s for s in report.steps if s["step"] == "build")
    assert build["built"] == 3 and build["builders"] == 2
