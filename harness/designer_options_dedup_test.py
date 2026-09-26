"""Final-state option distinctness and bounded cancellation cleanup."""

from copy import deepcopy
from pathlib import Path
import sys
import threading
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import designer_options
from designer_options_test import STRATEGIES, accepted, event


def scene():
    return {"items": [
        {"id": "sofa", "kind": "sofa", "room_id": "living", "pos": [1, 1],
         "rot": 0, "size": [2, .8, .9], "sku": "sofa-owned", "name": "Sofa"},
        {"id": "chair", "kind": "armchair", "room_id": "living", "pos": [3, 2],
         "rot": 90, "size": [.8, .8, .9], "name": "Chair"}], "fixed": []}


class FinalLayoutTests(unittest.TestCase):
    def test_intermediate_moves_noops_and_whole_rotations_have_one_final_key(self):
        original = scene()
        direct = {"ops": [{"type": "move", "id": "sofa", "pos": [2, 2], "rot": 90}]}
        repeated = {"ops": [
            {"type": "move", "id": "sofa", "pos": [4, 4], "rot": -270},
            {"type": "move", "id": "chair", "pos": [3.0, 2.0], "rot": 450},
            {"type": "move", "id": "sofa", "pos": [2.0, 2.0]}]}
        self.assertEqual(designer_options.layout_key(direct, original),
                         designer_options.layout_key(repeated, original))
        self.assertEqual(original, scene())
        self.assertEqual(designer_options.layout_key({"ops": []}, original),
                         designer_options.layout_key({"ops": [{"type": "move", "id": "sofa",
                                                                "pos": [1, 1], "rot": 720}]}, original))

    def test_final_identity_room_pose_size_and_sku_remain_distinct(self):
        original = scene()
        base = designer_options.layout_key({"ops": []}, original)
        for field, changed in (("id", "other-sofa"), ("room_id", "other-room"),
                               ("pos", [2, 1]), ("rot", 90), ("size", [2.2, .8, .9]),
                               ("sku", "other-product")):
            with self.subTest(field=field):
                item = deepcopy(original["items"][0])
                item[field] = changed
                proposal = {"ops": [{"type": "remove", "id": "sofa"}, {"type": "add", "item": item}]}
                self.assertNotEqual(base, designer_options.layout_key(proposal, original))

    def test_item_order_and_name_do_not_distinguish_identical_geometry(self):
        original, reordered = scene(), scene()
        reordered["items"].reverse()
        reordered["items"][0]["name"] = "Different display name"
        self.assertEqual(designer_options.layout_key({"ops": []}, original),
                         designer_options.layout_key({"ops": []}, reordered))

    def test_add_then_move_equals_add_at_final_position_and_removed_add_is_noop(self):
        original = scene()
        item = {"id": "table", "room_id": "living", "kind": "table", "pos": [4, 4],
                "rot": 0, "size": [.6, .6, .5], "sku": "coffee"}
        moved = deepcopy(item)
        moved["pos"], moved["rot"] = [4, 3], 90
        self.assertEqual(designer_options.layout_key({"ops": [{"type": "add", "item": item},
            {"type": "move", "id": "table", "pos": [4, 3], "rot": 450}]}, original),
            designer_options.layout_key({"ops": [{"type": "add", "item": moved}]}, original))
        self.assertEqual(designer_options.layout_key({"ops": [{"type": "add", "item": item},
            {"type": "remove", "id": "table"}]}, original),
            designer_options.layout_key({"ops": []}, original))

    def test_options_deduplicate_by_final_scene_instead_of_redundant_ops(self):
        def runner(**job):
            payload = accepted(2)
            if job["strategy"] != STRATEGIES[0]:
                payload["proposal"]["ops"].insert(0, {"type": "move", "id": "sofa", "pos": [4, 3]})
                payload["proposal"]["ops"].append({"type": "move", "id": "chair", "pos": [3, 2], "rot": 450})
            return {"events": [event(payload)]}

        result = designer_options.explore_options(scene(), "options", runner)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(len(result["options"]), 1)

    def test_usage_limit_waits_for_cooperative_sibling_cleanup(self):
        barrier = threading.Barrier(3)
        cleaned = []

        def runner(**job):
            barrier.wait(timeout=1)
            if job["strategy"] == STRATEGIES[0]:
                return {"usage_limited": True, "events": []}
            job["cancel_event"].wait(1)
            time.sleep(.05)
            cleaned.append(job["strategy"])
            return {"events": []}

        result = designer_options.explore_options(scene(), "options", runner, timeout=1)
        self.assertEqual(result["status"], "usage_limit")
        self.assertEqual(set(cleaned), set(STRATEGIES[1:]))
        self.assertLess(result["seconds"], .5)

    def test_uncooperative_runners_share_one_cleanup_budget_inside_wall_timeout(self):
        release = threading.Event()

        def runner(**job):
            release.wait(1)
            return {"events": []}

        started = time.monotonic()
        try:
            result = designer_options.explore_options(scene(), "options", runner, timeout=.15)
            self.assertEqual(result["status"], "timeout")
            self.assertLess(time.monotonic() - started, .24)
        finally:
            release.set()


if __name__ == "__main__":
    unittest.main()
