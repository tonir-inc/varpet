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
