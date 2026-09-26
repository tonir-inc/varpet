"""Customer copy is separate from accepted geometry, scores and eval evidence."""
import copy
import unittest

from designer_presentation import format_presentation


class CustomerCopyTest(unittest.TestCase):
    def setUp(self):
        self.scene = {"rooms": [{"id": "living", "name": "Living room"}],
                      "objects": [{"id": "sofa", "name": "Sofa"}]}
        self.translated = {"id": "p1", "title": "Designer layout proposal", "description": "Old copy",
                           "command": {"operations": [{"type": "add", "object": {"id": "reading-chair"}}]}}
        self.saved = {"rationale": "Budget unconfirmed; catalog price 77000 AMD is mock, not a shop quotation. Solar orientation and door-sweep clearance are unverified. Preview requires customer acceptance.",
                      "ops": [{"type": "add", "item": {"id": "reading-chair", "kind": "chair", "name": "Reading armchair", "room_id": "living"}}],
                      "intent": {"room_id": "living", "preferences": [{"type": "near_window", "item_id": "reading-chair"}]},
                      "checks": {"notes": []},
                      "score": {"cost_dram": 77000, "price": {"currency": "AMD"},
                                "before": {"space": {"rooms": [{"room_id": "living", "free_area_m2": 20, "largest_free_rectangle": {"area_m2": 12}}]}},
                                "after": {"daylight": {"status": "unknown"}, "space": {"rooms": [{"room_id": "living", "free_area_m2": 19.2, "largest_free_rectangle": {"area_m2": 12}}]}}}}

    def render(self, request="Add an armchair for reading by the window"):
        return format_presentation(self.saved, self.scene, self.translated, request)

    def test_engineering_log_becomes_reading_corner_with_separate_notes(self):
        result = self.render()
        self.assertEqual(result["title"], "A reading corner by the window")
        self.assertIn("armchair", result["description"])
        self.assertIn("77,000 ֏", result["description"])
        self.assertIn("0.8 m²", result["description"])
        self.assertIn("trade-off", result["description"])
        for word in ("mock", "unconfirmed", "unverified", "acceptance", "north", "west"):
            self.assertNotIn(word, result["description"].lower())
        self.assertIn("Sample catalog price", result["notes"])
        self.assertIn("Sun direction", result["notes"])
        self.assertIn("Door swings", result["notes"])

    def test_only_display_fields_returned_and_inputs_unchanged(self):
        before = copy.deepcopy((self.saved, self.scene, self.translated))
        result = self.render()
        self.assertEqual(set(result), {"title", "description", "notes"})
        self.assertEqual((self.saved, self.scene, self.translated), before)

    def test_real_clearance_tradeoff_takes_priority_over_extra_floor_space(self):
        self.saved["score"]["after"]["function_clearances"] = [{"item_id": "reading-chair", "function": "chair_pullout", "side": "back", "clearance_m": .21465, "status": "warn"}]
        result = self.render()
        self.assertIn("21 cm", result["description"])
        self.assertIn("behind", result["description"])
        self.assertNotIn("0.8 m²", result["description"])

    def test_rearrangement_uses_room_score_and_does_not_invent_free_area_gain(self):
        self.saved["ops"] = [{"type": "move", "id": "sofa", "pos": [0, 0], "rot": 0}]
        self.saved["intent"] = {"room_id": "living"}
        self.saved["score"]["cost_dram"] = 0
        self.saved["score"]["before"]["space"]["rooms"][0]["largest_free_rectangle"]["area_m2"] = 22.68
        self.saved["score"]["after"]["space"]["rooms"][0]["largest_free_rectangle"]["area_m2"] = 30.24
        result = self.render("Make the living room feel bigger")
        self.assertEqual(result["title"], "More room in the living room")
        self.assertIn("sofa", result["description"].lower())
        self.assertIn("22.68", result["description"])
        self.assertIn("30.24 m²", result["description"])
        self.assertIn("No furniture purchases", result["description"])
        self.assertNotIn("7.56 m² of floor", result["description"])

    def test_wall_finish_tradeoff_stays_visible_and_zero_does_not_mean_free_paint(self):
        self.saved["ops"] = [{"type": "color", "target": "wall", "id": "wall", "color": "#A3B18A"}]
        self.saved["score"]["cost_dram"] = 0
        result = self.render("Paint the living room walls sage")
        self.assertIn("colour", result["title"].lower())
        self.assertIn("both sides", result["description"])
        self.assertIn("Paint and labour", result["notes"])
        self.assertNotIn("free", result["description"].lower())

    def test_missing_measurements_do_not_acquire_numbers_or_an_orientation(self):
        self.saved["score"] = {}
        result = self.render()
        self.assertNotIn("77,000", result["description"])
        self.assertNotIn("m²", result["description"])
        self.assertNotIn("west", result["title"].lower())
        self.assertTrue(result["description"])

    def test_uncertain_window_position_is_not_claimed_from_customer_words(self):
        self.saved["intent"] = {"room_id": "living"}
        result = self.render()
        self.assertNotIn("by the window", result["title"])
        self.assertNotIn("beside the window", result["description"])

    def test_existing_access_notes_are_retained_without_dumping_engine_ids(self):
        self.saved["checks"]["notes"] = [{"check": "walkway", "message": "baseline room-bedroom item_id access 0.41", "baseline": True}]
        result = self.render()
        self.assertIn("Existing access", result["notes"])
        self.assertNotIn("item_id", result["notes"])
        self.assertLessEqual(len(result["notes"]), 1600)

    def test_legacy_bridge_without_accepted_operations_keeps_its_copy(self):
        result = format_presentation({"score": {}}, self.scene,
                                     {"title": "A lighter layout", "description": "Frees 1.2 m²."}, "More room")
        self.assertEqual(result, {"title": "A lighter layout", "description": "Frees 1.2 m²."})


if __name__ == "__main__":
    unittest.main()
