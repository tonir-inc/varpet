"""designer_spike pieces the live chat relies on: the brief's budget and the customer's own edits of an applied design."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import designer_spike  # noqa: E402


def test_budget_is_read_only_in_amd_or_as_a_bare_budget():
    assert designer_spike.parse_budget("Budget 3.5 million AMD please") == 3_500_000
    assert designer_spike.parse_budget("we can spend 2 000 000 dram") == 2_000_000
    assert designer_spike.parse_budget("budget: 4m") == 4_000_000
    assert designer_spike.parse_budget("about 800k AMD for the living room") == 800_000
    assert designer_spike.parse_budget("budget is 1,500,000") == 1_500_000
    assert designer_spike.parse_budget("budget $5000") is None
    assert designer_spike.parse_budget("a 2.5 m sofa for four") is None


def _state(tmp_path, items, owned, seen=()):
    (tmp_path / "draft.json").write_text(json.dumps({"items": items}))
    return designer_spike.SpikeConversation(workspace=tmp_path, home=tmp_path, config={}, owned=list(owned), seen=set(seen))


def _item(item_id, pos, **extra):
    return {"id": item_id, "room_id": "living", "kind": "sofa", "name": item_id.title(), "pos": pos, "rot": 0,
            "size": [2, 1, 1], "keep": False, **extra}


def _object(item_id, x, z, rotation=0.0):
    return {"id": item_id, "position": [x, 0, z], "rotation": rotation}


def test_an_applied_piece_the_customer_moved_or_deleted_stays_that_way(tmp_path):
    state = _state(tmp_path, [_item("sofa", [2, -3]), _item("table", [3, -4]), _item("art", [1, -1], wall_id="w1", height_m=1.5)],
                   ["sofa", "table", "art"])
    edits = designer_spike.sync_edits(state, {"objects": [_object("sofa", 2.5, 3), _object("art", 9, 9)]})
    assert edits == {"applied": True, "moved": ["Sofa"], "removed": ["Table"]}
    draft = json.loads((tmp_path / "draft.json").read_text())
    assert [item["id"] for item in draft["items"]] == ["sofa", "art"]
    assert draft["items"][0]["pos"] == [2.5, -3]
    assert draft["items"][1]["pos"] == [1, -1]  # wall-hung pieces follow their wall; only deletion is synced


def test_a_proposal_not_applied_yet_keeps_the_whole_design(tmp_path):
    state = _state(tmp_path, [_item("sofa", [2, -3])], ["sofa"])
    assert designer_spike.sync_edits(state, {"objects": []}) == {"applied": False, "moved": [], "removed": []}
    assert len(json.loads((tmp_path / "draft.json").read_text())["items"]) == 1


def test_an_unchanged_applied_design_is_not_reported_as_moved(tmp_path):
    state = _state(tmp_path, [_item("sofa", [2, -3], rot=270)], ["sofa"])
    edits = designer_spike.sync_edits(state, {"objects": [_object("sofa", 2, 3, rotation=-1.5707963267948966)]})
    assert edits == {"applied": True, "moved": [], "removed": []}


def test_room_order_follows_the_designer_through_the_flat():
    draft = {"items": [{"room_id": "living"}, {"room_id": "lounge"}, {"room_id": "living"}], "finishes": [{"room_id": "hall"}]}
    assert designer_spike._room_order(draft) == ["living", "lounge"]


def test_finished_rooms_tolerates_rooms_finishing_in_any_order():
    finished = designer_spike.finished_rooms
    assert finished(["living"], {"living": 0}, 100, 30) == ()
    # One after another: the room left behind is finished once quiet, the current one never.
    assert finished(["living", "lounge"], {"living": 10, "lounge": 50}, 60, 30) == ("living",)
    assert finished(["living", "lounge"], {"living": 40, "lounge": 50}, 60, 30) == ()
    # In parallel: whichever rooms have gone quiet, in any order; rooms from earlier turns are ignored.
    assert finished(["hall", "living", "lounge", "bedroom"], {"lounge": 5, "bedroom": 90, "living": 70}, 101, 30) == ("living", "lounge")


def test_watcher_names_each_room_and_previews_rooms_as_they_finish(tmp_path, monkeypatch):
    lines, partials = [], []
    state = _state(tmp_path, [], [])
    state.rooms = [{"id": "living", "name": "Living room"}, {"id": "lounge", "name": "Reading room"}]
    watcher = designer_spike.DraftWatcher(state, lines.append, {}, tmp_path, quiet=30)
    monkeypatch.setattr(watcher, "_partial", lambda draft, rooms: (partials.append(rooms), setattr(watcher, "previewed", rooms)))
    write = lambda items: (tmp_path / "draft.json").write_text(json.dumps({"items": items}))
    write([_item("sofa", [1, -1])]); watcher.poll(0)
    write([_item("sofa", [1, -1]), {**_item("desk", [5, -1]), "room_id": "lounge"}]); watcher.poll(10)
    watcher.poll(35); watcher.poll(45)
    assert lines == ["Designing the living room", "Designing the reading room"]
    assert partials == [("living",)]


def test_a_lettered_question_becomes_option_buttons():
    question, options = designer_spike.question_options(
        "The flat has three bedrooms; which do you prefer: A) kids share Bedroom 9; or B) office in the living room?")
    assert question == "The flat has three bedrooms; which do you prefer?"
    assert options == ["A: kids share Bedroom 9", "B: office in the living room"]
    assert designer_spike.question_options("Should I keep the sofa?") is None
    assert designer_spike.question_options("Done: A) sofa, B) table.") is None


def test_translation_errors_leave_renderer_notes_out(tmp_path, monkeypatch):
    import subprocess
    stderr = "renderView: soft-glow ceiling design does not fit r-closet-1; drawn as one ceiling light\nThe design needs 600 editor operations; the limit is 500\n"
    monkeypatch.setattr(designer_spike, "_run", lambda *a, **k: subprocess.CompletedProcess([], 1, "", stderr))
    state = _state(tmp_path, [], [])
    saved = designer_spike._translate(state, {"scene": {}, "revision": 0}, tmp_path, tmp_path, "t", "d")
    assert saved == {"error": "The design needs 600 editor operations; the limit is 500"}


def test_repeated_room_names_are_counted_once():
    assert designer_spike.room_labels(["Balcony", "Bathroom", "Balcony", "Kitchen", "Bathroom", "Bathroom"]) == ["Balcony ×2", "Bathroom ×3", "Kitchen"]


def test_a_rendered_room_is_finished_once_it_settles_even_while_others_change():
    finished = designer_spike.finished_rooms
    changed = {"living": 100, "bed1": 104, "bed2": 110}
    assert finished(["living", "bed1", "bed2"], changed, 117, 30, {"bed1": 105}) == ("bed1",)
    assert finished(["living", "bed1", "bed2"], changed, 112, 30, {"bed1": 105}) == ()


def test_room_files_of_parallel_designers_overlay_the_draft(tmp_path):
    (tmp_path / "rooms").mkdir()
    (tmp_path / "draft.json").write_text(json.dumps({"items": [_item("old-sofa", [0, 0]), {**_item("bed", [1, 1]), "room_id": "bed1"}]}))
    (tmp_path / "rooms" / "living.json").write_text(json.dumps({"items": [_item("sofa", [2, 2])], "finishes": [{"room_id": "living", "surface": "floor"}]}))
    combined = designer_spike._combined(tmp_path)
    assert [item["id"] for item in combined["items"]] == ["bed", "sofa"]
    assert combined["finishes"] == [{"room_id": "living", "surface": "floor"}]


def test_whole_flat_briefs_take_the_parallel_path_and_one_room_requests_do_not():
    rooms = [{"id": "living", "name": "Living room and kitchen"}, {"id": "lounge", "name": "Reading room"}, {"id": "bedroom-1", "name": "Bedroom 1"}]
    assert designer_spike.whole_flat("Furnish the whole flat for a family of four", rooms)
    assert designer_spike.whole_flat("Furnish the living room with kitchen and the reading room", rooms)
    assert not designer_spike.whole_flat("Make the bedroom cosy", rooms)
    assert not designer_spike.whole_flat("Furnish Bedroom 1 as a nursery", rooms)


def test_a_recorded_run_becomes_a_replayable_session(tmp_path, monkeypatch):
    import importlib.util
    monkeypatch.setenv("VARPET_RECORD_DIR", str(tmp_path / "rec"))
    body = {"request": "Furnish the flat", "revision": 0, "scene": {"id": "flat"}}
    recorder = designer_spike.Recorder.open("conv1", body)
    seen = []
    progress = recorder.wrap(seen.append)
    for message in ("Planning the flat", "Planning the flat", {"type": "preview", "image": "data:image/jpeg;base64,AA", "caption": "View"}):
        progress(message)
    proposal = {"type": "proposal", "conversationId": "conv1", "proposal": {"id": "p"}}
    state = _state(tmp_path, [_item("sofa", [1, -1])], ["sofa"])
    recorder.finish(proposal, type("C", (), {"spike": state, "customer_requests": ["Furnish the flat"]})())
    assert seen[0] == "Planning the flat" and len(seen) == 3
    spec = importlib.util.spec_from_file_location("demo_session", Path(__file__).resolve().parents[2] / "tools/demo_session.py")
    demo_session = importlib.util.module_from_spec(spec); spec.loader.exec_module(demo_session)
    turns, conversation, design, recorded = demo_session.turns_of(tmp_path / "rec")
    assert conversation == "conv1" and recorded
    assert [event["record"]["type"] for event in turns[0]["events"]] == ["progress", "preview", "proposal"]
    assert design == {"draft": {"items": [_item("sofa", [1, -1])]}, "owned": ["sofa"], "requests": ["Furnish the flat"]}


def test_a_markdown_lettered_question_becomes_option_buttons():
    question, options = designer_spike.question_options(
        "The balcony bay is 2.3 m wide; would you prefer **A:** a table for four there, or **B:** dining for six on the long balcony?")
    assert question == "The balcony bay is 2.3 m wide; would you prefer?"
    assert options == ["A: a table for four there", "B: dining for six on the long balcony"]


def test_the_designs_own_finish_materials_leave_with_its_finishes():
    doc = {"objects": [{"id": "sofa"}, {"id": "own"}], "project": {"components": [], "finishes": [{"id": "spike:living:floor"}, {"id": "mine"}],
           "materials": [{"id": "spike-finish:paint:chalk|#eeeae0"}, {"id": "oak"}]}}
    out = designer_spike.strip_design(doc, ["sofa"])
    assert [o["id"] for o in out["objects"]] == ["own"]
    assert [f["id"] for f in out["project"]["finishes"]] == ["mine"]
    assert [m["id"] for m in out["project"]["materials"]] == ["oak"]


def test_supports_come_before_what_rests_on_them():
    items = [{"id": "lamp", "on": "table"}, {"id": "book", "on": "lamp"}, {"id": "table"}, {"id": "rug"}]
    assert [item["id"] for item in designer_spike.supports_first(items)] == ["table", "lamp", "book", "rug"]
