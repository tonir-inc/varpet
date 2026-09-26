"""Offline option orchestration tests: no SDK, catalog, or model calls."""

import copy
import importlib.util
import json
import math
from pathlib import Path
import sys
import threading
import time
import unittest


MODULE = Path(__file__).with_name("designer_options.py")
STRATEGIES = ("most_open_floor", "best_daylight_for_work", "social_living")


def metrics(rectangle=4.0, walkway=.9, sofa_gap=.8):
    return {"space": {"free_area_m2": 20, "rooms": [{"room_id": "living",
            "free_area_m2": 20, "largest_free_rectangle": {"area_m2": rectangle},
            "walkways": [{"width_m": walkway, "reachable": True}]}]},
            "daylight": {"status": "known", "windows": []},
            "function_clearances": [{"item_id": "sofa", "other_item_id": "coffee",
                "function": "sofa_coffee", "clearance_m": sofa_gap,
                "minimum_m": .36, "maximum_m": .46,
                "deficit_m": max(0, .36 - sofa_gap), "excess_m": max(0, sofa_gap - .46),
                "status": "good" if .36 <= sofa_gap <= .46 else "warn"}], "cost_dram": 0}


def accepted(index=1, rectangle=5.0, sofa_gap=.8):
    score = {"before": metrics(), "after": metrics(rectangle=rectangle, sofa_gap=sofa_gap),
             "cost_dram": 0, "price": {"cost_dram": 0, "currency": "AMD", "errors": []}}
    proposal = {"id": "proposal-" + str(index), "base_scene_fingerprint": "snapshot",
                "ops": [{"type": "move", "id": "sofa", "pos": [index, 1], "rot": 0}],
                "rationale": "A checked layout.", "intent": {"room_id": "living"},
                "checks": {"ok": True}, "request_check": {"ok": True}, "score": score,
                "requires_user_acceptance": True, "application_status": "not_applied",
                "validation_scope": "temporary_designer_scene"}
    return {"ok": True, "proposal_id": proposal["id"], "score": score, "proposal": proposal}


def event(payload, *, tool="propose", server="varpet-designer", status="completed", structured=False):
    result = {"structuredContent": payload} if structured else {
        "content": [{"type": "text", "text": json.dumps(payload)}]}
    return {"kind": "event", "method": "item/completed", "payload": {"item": {
        "type": "mcpToolCall", "server": server, "tool": tool, "status": status,
        "result": result, "error": None}}}


class OptionsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.options = None
        if MODULE.exists():
            spec = importlib.util.spec_from_file_location("designer_options", MODULE)
            cls.options = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = cls.options
            spec.loader.exec_module(cls.options)

    def subject(self):
        self.assertIsNotNone(self.options, "harness/designer_options.py must implement parallel options")
        return self.options

    def test_three_strategies_start_concurrently_with_low_effort_and_isolated_scene(self):
        subject = self.subject()
        barrier = threading.Barrier(3)
        observed = []
        scene = {"rooms": [{"id": "living"}], "items": []}

        def runner(**job):
            observed.append(job)
            barrier.wait(timeout=1)
            job["scene"]["rooms"].clear()
            index = STRATEGIES.index(job["strategy"]) + 1
            return {"status": "completed", "events": [event(accepted(index, rectangle=4 + index))]}

        result = subject.explore_options(scene, "Show me options for the living room", runner, timeout=2)
        self.assertEqual({job["strategy"] for job in observed}, set(STRATEGIES))
        self.assertTrue(all(job["effort"] == "low" for job in observed))
        self.assertEqual(len({id(job["cancel_event"]) for job in observed}), 1)
        self.assertEqual(len({job["deadline"] for job in observed}), 1)
        self.assertEqual(scene["rooms"], [{"id": "living"}])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(len(result["options"]), 2)

    def test_only_successful_propose_tool_results_are_accepted_not_model_text(self):
        subject = self.subject()
        valid = accepted()
        records = [event(valid, tool="check_layout"), event(valid, server="unrelated"),
                   event(valid, status="failed"), event({"ok": False, "errors": []}),
                   {"method": "item/completed", "payload": {"item": {
                       "type": "agentMessage", "text": json.dumps(valid)}}}, event(valid)]
        extracted = subject.accepted_proposals(records)
        self.assertEqual(extracted, [valid["proposal"]])
        extracted[0]["ops"].clear()
        self.assertTrue(valid["proposal"]["ops"])

    def test_structured_tool_result_preserves_complete_accepted_payload(self):
        subject = self.subject()
        payload = accepted()
        self.assertEqual(subject.accepted_proposals([event(payload, structured=True)]), [payload["proposal"]])

    def test_missing_failed_or_nonfinite_proposal_metrics_are_filtered(self):
        subject = self.subject()
        invalid = []
        for field in ("score", "ops", "checks", "request_check"):
            payload = accepted()
            payload["proposal"].pop(field)
            invalid.append(event(payload))
        failed = accepted()
        failed["proposal"]["request_check"]["ok"] = False
        invalid.append(event(failed))
        nonfinite = accepted()
        nonfinite["proposal"]["score"]["after"]["space"]["free_area_m2"] = math.nan
        invalid.append(event(nonfinite))
        self.assertEqual(subject.accepted_proposals(invalid), [])

    def test_ranking_uses_score_numbers_and_only_two_distinct_layouts(self):
        subject = self.subject()
        one = accepted(1, rectangle=5)
        duplicate = copy.deepcopy(one)
        duplicate["proposal"]["id"] = "other-thread-proposal-99"
        duplicate["proposal_id"] = "other-thread-proposal-99"
        best = accepted(2, rectangle=9)

        def runner(**job):
            payload = {STRATEGIES[0]: one, STRATEGIES[1]: duplicate, STRATEGIES[2]: best}[job["strategy"]]
            return {"status": "completed", "events": [event(payload)]}

        result = subject.explore_options({}, "options", runner)
        self.assertEqual(len(result["options"]), 2)
        self.assertEqual(result["options"][0]["proposal"]["ops"], best["proposal"]["ops"])
        self.assertEqual(result["options"][0]["metrics"]["after"]["largest_free_rectangle_m2"], 9)
        self.assertIn("9.00", result["response"])
        self.assertIn("m²", result["response"])
        self.assertIn("֏", result["response"])

    def test_equivalent_operation_order_is_one_layout_but_different_item_is_distinct(self):
        subject = self.subject()
        first = accepted()["proposal"]
        first["ops"].append({"type": "move", "id": "chair", "pos": [3, 3], "rot": 90})
        second = copy.deepcopy(first)
        second["ops"].reverse()
        second["id"] = "different-id"
        self.assertEqual(subject.layout_key(first), subject.layout_key(second))
        second["ops"][0]["id"] = "another-chair"
        self.assertNotEqual(subject.layout_key(first), subject.layout_key(second))

    def test_strategy_numbers_show_open_floor_and_social_tradeoff_without_sun_claim(self):
        subject = self.subject()
        open_plan = accepted(1, rectangle=8, sofa_gap=.8)
        social_plan = accepted(2, rectangle=5, sofa_gap=.4)

        def runner(**job):
            payload = open_plan if job["strategy"] == STRATEGIES[0] else social_plan
            return {"status": "completed", "events": [event(payload)]}

        result = subject.explore_options({}, "options", runner)
        numbers = [option["metrics"]["after"] for option in result["options"]]
        self.assertEqual({value["largest_free_rectangle_m2"] for value in numbers}, {5, 8})
        self.assertEqual({value["sofa_coffee_gap_m"] for value in numbers}, {.4, .8})
        self.assertTrue(all(value["daylight_for_work"] is None for value in numbers))
        self.assertIn("0.40", result["response"])

    def test_no_accepted_proposals_reports_unresolved_without_inventing_options(self):
        subject = self.subject()
        result = subject.explore_options({}, "options", lambda **job: {"status": "completed", "events": []})
        self.assertEqual(result["status"], "unresolved")
        self.assertEqual(result["options"], [])

    def test_single_distinct_proposal_is_partial_not_two_options(self):
        subject = self.subject()
        result = subject.explore_options({}, "options", lambda **job: {"events": [event(accepted())]})
        self.assertEqual(result["status"], "partial")
        self.assertEqual(len(result["options"]), 1)

    def test_wall_deadline_cancels_all_even_when_runner_keeps_emitting(self):
        subject = self.subject()
        cancelled = []

        def runner(**job):
            job["cancel_event"].wait(1)
            cancelled.append(job["cancel_event"].is_set())
            return {"status": "timeout", "events": []}

        started = time.monotonic()
        result = subject.explore_options({}, "options", runner, timeout=.08)
        self.assertLess(time.monotonic() - started, .5)
        self.assertEqual(result["status"], "timeout")
        time.sleep(.02)
        self.assertEqual(cancelled, [True, True, True])
        self.assertEqual(result["options"], [])

    def test_usage_limit_stops_siblings_and_discards_partial_options(self):
        subject = self.subject()
        barrier = threading.Barrier(3)
        cancelled = []

        def runner(**job):
            barrier.wait(timeout=1)
            if job["strategy"] == STRATEGIES[0]:
                return {"events": [event(accepted())], "stderr": "USAGE LIMIT reached", "status": "completed"}
            job["cancel_event"].wait(1)
            cancelled.append(job["cancel_event"].is_set())
            return {"events": []}

        result = subject.explore_options({}, "options", runner, timeout=1)
        self.assertEqual(result["status"], "usage_limit")
        self.assertEqual(result["options"], [])
        time.sleep(.02)
        self.assertEqual(cancelled, [True, True])

    def test_invalid_budget_rejected_before_starting_any_worker(self):
        subject = self.subject()
        for budget in (0, -1, 120, math.inf, math.nan):
            with self.subTest(budget=budget), self.assertRaises(ValueError):
                subject.explore_options({}, "options", lambda **job: self.fail("started worker"), timeout=budget)

    def test_failed_runner_does_not_discard_accepted_sibling_results(self):
        subject = self.subject()

        def runner(**job):
            if job["strategy"] == STRATEGIES[0]:
                raise RuntimeError("one worker failed")
            return {"events": [event(accepted(STRATEGIES.index(job["strategy"])))]}

        result = subject.explore_options({}, "options", runner)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(len(result["options"]), 2)
        self.assertTrue(any("one worker failed" in str(run) for run in result["explorers"]))

    def test_directional_contrast_requires_each_selected_strategy_to_lead_its_metric(self):
        subject = self.subject()
        plans = [accepted(1, rectangle=9), accepted(2, rectangle=5), accepted(3, rectangle=4)]
        for index, plan in enumerate(plans):
            plan["proposal"]["score"]["after"]["daylight_for_work"] = {
                "score": [.1, .9, .2][index], "desks": [], "basis": "geometry proxy"}
            plan["proposal"]["score"]["after"]["social_living"] = {
                "score": .2, "seating_pairs_within_3m": 1, "mean_facing_alignment": .2,
                "basis": "geometry proxy"}

        def runner(**job):
            return {"events": [event(plans[STRATEGIES.index(job["strategy"])])]}

        result = subject.explore_options({}, "options", runner)
        self.assertEqual({option["strategy"] for option in result["options"]}, set(STRATEGIES[:2]))
        self.assertTrue(result["strategy_contrast"]["proven"])
        self.assertEqual(len(result["strategy_contrast"]["comparisons"]), 2)
        self.assertIn("0.900", result["response"])

    def test_tied_or_missing_strategy_numbers_do_not_claim_directional_contrast(self):
        subject = self.subject()
        result = subject.explore_options({}, "options", lambda **job: {
            "events": [event(accepted(STRATEGIES.index(job["strategy"]) + 1))]})
        self.assertEqual(len(result["options"]), 2)
        self.assertFalse(result["strategy_contrast"]["proven"])
        self.assertIn("does not establish", result["response"])

    def test_one_explorer_cannot_fill_both_presented_option_slots(self):
        subject = self.subject()

        def runner(**job):
            if job["strategy"] == STRATEGIES[0]:
                return {"events": [event(accepted(1, rectangle=8)), event(accepted(2, rectangle=9))]}
            return {"events": []}

        result = subject.explore_options({}, "options", runner)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(len(result["options"]), 1)
        self.assertEqual(result["options"][0]["metrics"]["after"]["largest_free_rectangle_m2"], 9)


if __name__ == "__main__":
    unittest.main()
