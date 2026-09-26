"""The architect session: one turn, the model calls the tools. The fake turn plays the model."""

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from test_shell import flat

from varpet_harness import session as S
from varpet_harness.dispatch import JobResult

REPO = Path(__file__).resolve().parents[2]
SOFA = {"id": "sofa", "brief": "white sofa", "size": [2.0, 0.9, 0.8], "size_source": "photo", "count": 1, "refs": []}


class FakeThread:
    id = "t1"


class FakeCodex:
    async def thread_archive(self, tid):
        pass


def session(tmp_path, monkeypatch, play, photos=("photo.jpg",), review=False):
    """Run a session whose single model turn is play(tools, turn_number, text); returns report, events, tools."""
    run, events, offered, turns = tmp_path / "run", [], {}, []

    async def fake_start(codex, tools, **kw):
        offered.update({t.name: t for t in tools})
        return FakeThread()

    async def fake_turn(self, thread, items, job, paused=lambda: False):
        turns.append(items[0].text)
        await play(offered, len(turns), items[0].text, run)
        return SimpleNamespace(usage=SimpleNamespace(last=SimpleNamespace(total_tokens=1000)))

    async def fake_build(self, job, workdir, deps):
        (workdir / "program.json").write_text(json.dumps({"size": job.size, "materials": {}, "parts": []}))
        (workdir / "piece.glb").write_bytes(b"glb")
        return JobResult(job.id, "ok", output=str(workdir / "program.json"), tokens=500)

    monkeypatch.setattr(S, "install", lambda codex: SimpleNamespace(in_flight=lambda tid: False, on_call=None))
    monkeypatch.setattr(S, "start_thread", fake_start)
    monkeypatch.setattr(S.CodexRunner, "_turn", fake_turn)
    monkeypatch.setattr(S.CodexRunner, "run", fake_build)
    monkeypatch.setattr(S, "export_project", lambda repo, run_dir: None)
    report = asyncio.run(S.run_session(FakeCodex(), REPO, "t", "fixtures/real/x/plan.jpg", list(photos), run, None,
                                       review=review, progress=lambda m: None, emit=events.append))
    return report, events, offered, turns


def test_one_turn_reads_builds_places_through_the_tools(tmp_path, monkeypatch):
    answers = {}

    async def play(tools, n, text, run):
        (run / "shell" / "shell.json").write_text(flat().model_dump_json())
        answers["shell"] = await tools["submit_shell"].run({})
        answers["build"] = await tools["build_pieces"].run({"pieces": [SOFA]})
        answers["wait"] = await tools["wait_for_pieces"].run({})
        (run / "furnish" / "placements.json").write_text(json.dumps({"placements": [
            {"piece": "sofa", "room": "living", "x": 4.8, "z": 2.0, "rotation": 90}]}))  # into the partition
        answers["bad"] = await tools["submit_placements"].run({})
        (run / "furnish" / "placements.json").write_text(json.dumps({"placements": [
            {"piece": "sofa", "room": "living", "x": 2.5, "z": 0.55, "rotation": 0}]}))
        answers["good"] = await tools["submit_placements"].run({})

    report, events, tools, turns = session(tmp_path, monkeypatch, play)
    assert report.architect_turns == 1 and "build_pieces" in turns[0]
    assert answers["shell"].startswith("ok: 2 rooms, 5 walls")
    assert "sofa: width 2.0" in answers["wait"] and "# Skill: flat-furnish" in answers["wait"]  # just in time
    assert answers["bad"].startswith("faults") and answers["good"] == "ok"
    assert [s["step"] for s in report.steps] == ["read", "build", "place", "export"]
    assert [e["type"] for e in events if e["type"] != "piece"] == ["shell", "pieces", "placements"]
    graph = json.loads((tmp_path / "run" / "graph.json").read_text())
    assert {j["kind"] for j in graph["jobs"]} == {"piece", "shell", "furnish"}


def test_sets_go_to_one_builder(tmp_path, monkeypatch):
    sets_built = []

    async def play(tools, n, text, run):
        (run / "shell" / "shell.json").write_text(flat().model_dump_json())
        await tools["build_pieces"].run({"pieces": [
            {**SOFA, "id": "dining-table", "set": "dining"}, {**SOFA, "id": "dining-chair", "count": 2, "set": "dining"},
            SOFA]})
        await tools["wait_for_pieces"].run({})
        (run / "furnish" / "placements.json").write_text(json.dumps({"placements": []}))

    async def fake_set(self, name, members, run_dir):
        sets_built.append((name, [m.id for m in members]))
        for m in members:
            (run_dir / m.id).mkdir(exist_ok=True)
            (run_dir / m.id / "piece.glb").write_bytes(b"glb")
        return {m.id: JobResult(m.id, "ok", tokens=300, seconds=1) for m in members}

    monkeypatch.setattr(S.CodexRunner, "run_set", fake_set)
    report, *_ = session(tmp_path, monkeypatch, play)
    assert sets_built == [("dining", ["dining-table", "dining-chair"])]
    build = next(s for s in report.steps if s["step"] == "build")
    assert build["built"] == 3 and build["builders"] == 2


def test_no_photos_offers_only_the_shell_and_writes_no_furniture(tmp_path, monkeypatch):
    async def play(tools, n, text, run):
        (run / "shell" / "shell.json").write_text(flat().model_dump_json())
        await tools["submit_shell"].run({})

    report, events, tools, turns = session(tmp_path, monkeypatch, play, photos=(), review=True)
    assert (tmp_path / "run" / "review" / "top.png").exists()  # render reads graph.json, written with nothing built
    assert list(tools) == ["submit_shell"] and "no furniture" in turns[0]
    assert report.architect_turns == 1
    assert [s["step"] for s in report.steps] == ["read", "export"]
    assert json.loads((tmp_path / "run" / "furnish" / "placements.json").read_text())["placements"] == []


def test_code_sends_one_turn_back_when_the_architect_stops_with_faults(tmp_path, monkeypatch):
    async def play(tools, n, text, run):
        s = flat()
        if n == 1:
            s.rooms[1].polygon = [(4, 0), (8, 0), (8, 4), (4, 4)]  # overlaps the living room; never submitted
        else:
            assert text.startswith("Code checked shell/shell.json")
        (run / "shell" / "shell.json").write_text(s.model_dump_json())

    report, *_ = session(tmp_path, monkeypatch, play, photos=())
    assert report.architect_turns == 2


def test_a_bad_piece_list_comes_back_as_the_error(tmp_path, monkeypatch):
    async def play(tools, n, text, run):
        (run / "shell" / "shell.json").write_text(flat().model_dump_json())
        with pytest.raises(ValueError):
            await tools["build_pieces"].run({"pieces": [{"id": "sofa"}]})
        assert (await tools["wait_for_pieces"].run({})).startswith("nothing is being built")

    session(tmp_path, monkeypatch, play)


def test_piece_ids_are_normalised(tmp_path):
    f = tmp_path / "pieces.json"
    f.write_text(json.dumps({"pieces": [{"id": "Wood_Dining Chair", "brief": "x", "size": [0.4, 0.5, 0.9]}]}))
    assert S._read_pieces(f).pieces[0].id == "wood-dining-chair"


def test_a_photographed_fixture_is_built_to_its_component_and_shown_in_its_place(tmp_path, monkeypatch):
    from test_shell import bathroom

    answers = {}

    async def play(tools, n, text, run):
        (run / "shell" / "shell.json").write_text(bathroom().model_dump_json())
        await tools["build_pieces"].run({"pieces": [SOFA]})
        answers["fixture"] = await tools["build_pieces"].run({"pieces": [
            {**SOFA, "id": "shower-tray", "size": [9, 9, 9], "fixture": "shower"}]})  # size comes from the component
        answers["wait"] = await tools["wait_for_pieces"].run({})
        (run / "furnish" / "placements.json").write_text(json.dumps({"placements": [
            {"piece": "sofa", "room": "living", "x": 2.5, "z": 0.55, "rotation": 0}]}))
        answers["placed"] = await tools["submit_placements"].run({})

    report, *_ = session(tmp_path, monkeypatch, play)
    run = tmp_path / "run"
    assert answers["fixture"].startswith("started 1") and answers["placed"] == "ok"
    assert "shower-tray" not in answers["wait"].split("# Skill")[0]  # not furniture to place
    assert json.loads((run / "shower-tray" / "program.json").read_text())["size"] == [0.9, 0.9, 2.0]  # w, d, h
    shown = S._with_models(run, [{"id": "shower"}, {"id": "wc"}], "http://h")
    assert shown[0]["assetId"].endswith("shower-tray") and "assetId" not in shown[1]


def test_a_fixture_piece_needs_its_component_first(tmp_path, monkeypatch):
    async def play(tools, n, text, run):
        (run / "shell" / "shell.json").write_text(flat().model_dump_json())
        answer = await tools["build_pieces"].run({"pieces": [{**SOFA, "id": "kitchen-run", "fixture": "kitchen"}]})
        assert answer.startswith("no component kitchen")

    session(tmp_path, monkeypatch, play)
