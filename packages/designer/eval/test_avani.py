"""Standing editor-input benchmark contracts; all execution here is offline."""
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    sys.modules[name] = result
    spec.loader.exec_module(result)
    return result


class AvaniBenchmark(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runner = module("avani_runner", HERE / "run.py")

    def test_suites_keep_bedroom_defaults_and_isolate_avani_outputs(self):
        bedroom = self.runner.suite_paths("bedroom")
        avani = self.runner.suite_paths("avani")
        self.assertEqual(bedroom["scenarios"], HERE / "benchmark-scenarios.json")
        self.assertEqual(bedroom["latest"], HERE / "latest.json")
        self.assertEqual(avani["scenarios"], HERE / "avani-benchmark-scenarios.json")
        self.assertEqual(avani["latest"], HERE / "latest-avani.json")
        self.assertEqual(avani["runs"], HERE / "runs" / "avani")
        with self.assertRaises(ValueError):
            self.runner.suite_paths("../bedroom")

    def test_one_smoke_job_never_silently_launches_an_ablation(self):
        scenarios = json.loads((HERE / "benchmark-scenarios.json").read_text())
        self.assertEqual(len(self.runner.build_jobs(scenarios)), 19)
        single = self.runner.build_jobs(scenarios[:1], with_place_only=True)
        self.assertEqual([(s["id"], mode) for s, mode in single], [(scenarios[0]["id"], "with-place")])
        self.assertEqual(self.runner.build_jobs(scenarios[:1], without_place=True)[0][1], "without-place")
        with self.assertRaises(ValueError):
            self.runner.build_jobs(scenarios, with_place_only=True, without_place=True)

    def test_editor_source_is_the_current_demo_and_group_variant_only_adds_explicit_metadata(self):
        original = self.runner.load_scene_input({"scene_source": "editor-demo"})
        grouped = self.runner.load_scene_input({"scene_source": "editor-demo", "scene_variant": "grouped-v2"})
        self.assertEqual(original["editor_scene"]["id"], "apartment-avani")
        self.assertEqual({item["id"] for item in original["scene"]["items"]}, {item["id"] for item in original["editor_scene"]["objects"]})
        self.assertEqual(grouped["editor_scene"]["version"], 2)
        members = {item["id"] for item in grouped["scene"]["items"] if item.get("group_id") == "living-group"}
        self.assertEqual(members, {"lounge-chair", "living-rug"})
        self.assertTrue(all(not item["keep"] for item in grouped["scene"]["items"] if item["id"] in members))
        self.assertEqual(original["editor_scene"]["walls"], grouped["editor_scene"]["walls"])
        self.assertEqual(original["editor_scene"]["rooms"], grouped["editor_scene"]["rooms"])
        for before, after in zip(original["scene"]["items"], grouped["scene"]["items"]):
            self.assertEqual(before, {key: value for key, value in after.items() if key != "group_id"})
        self.assertEqual(original["scene_source"]["kind"], "editor-demo")
        self.assertEqual(original["scene_source"]["variant"], "original")
        self.assertEqual(len(original["scene_source"]["scene_sha256"]), 64)
        self.assertNotEqual(original["scene_source"]["scene_sha256"], grouped["scene_source"]["scene_sha256"])

    def test_source_selection_rejects_unknown_sources_without_launching_a_process(self):
        with patch.object(self.runner.subprocess, "run") as run:
            with self.assertRaises(ValueError):
                self.runner.load_scene_input({"scene_source": "made-up"})
            with self.assertRaises(ValueError):
                self.runner.load_scene_input({"scene_source": "editor-demo", "scene_variant": "made-up"})
            run.assert_not_called()

    def test_source_hashes_cover_actual_demo_catalog_bridge_and_suite(self):
        hashes = self.runner.source_hashes("avani")
        for path in ("apps/editor/src/core/demo.ts", "packages/designer/src/editor-bridge.ts",
                     "packages/designer/eval/editor-demo.ts", "packages/designer/eval/avani-benchmark-scenarios.json",
                     ".agents/skills/interior-design-rules/SKILL.md", "apps/editor/src/contracts.ts",
                     "apps/editor/src/renovation-contracts.ts", "apps/editor/src/core/store.ts",
                     "apps/editor/src/core/geometry.ts", "apps/editor/src/core/validation.ts",
                     "apps/editor/src/core/grouping.ts", "apps/editor/src/core/renovation.ts"):
            self.assertEqual(hashes[path], hashlib.sha256((self.runner.ROOT / path).read_bytes()).hexdigest())

    def test_dirty_worktree_is_recorded_alongside_the_source_revision(self):
        with patch.object(self.runner.subprocess, "check_output", side_effect=["revision\n", " M demo.ts\n"]):
            self.assertEqual(self.runner.git_state(), {"git_revision": "revision", "git_dirty": True})
        with patch.object(self.runner.subprocess, "check_output", side_effect=["revision\n", ""]):
            self.assertEqual(self.runner.git_state(), {"git_revision": "revision", "git_dirty": False})

    def test_avani_grading_requires_the_actual_editor_gate_not_only_a_claimed_acceptance(self):
        source = self.runner.load_scene_input({"scene_source": "editor-demo"})
        scenario = {"id": "claimed-acceptance", "category": "appearance", "scene": "Avani", "scene_source": "editor-demo",
                    "request": "Make the west wall blue #3366cc", "expected_intent": {"room_id": "room-living", "colors": [{"target": "wall", "id": "wall-west", "color": "#3366cc"}]}, "expect": {"kind": "proposal"}}
        proposal = {"id": "claimed", "checks": {"ok": True}, "request_check": {"ok": True},
                    "ops": [{"type": "color", "target": "wall", "id": "wall-west", "color": "#3366cc"}]}
        for input_source in (source, {"scene": source["scene"]}):
            result = self.runner.score({**input_source, "scenario": scenario, "proposal": proposal})
            self.assertFalse(result["pass"])
            self.assertFalse(result["editor_check"]["ok"])
            self.assertFalse(result["tiers"]["editor_preview"])
            self.assertTrue(any("editor" in reason.lower() for reason in result["reasons"]))

    def test_standing_cases_include_original_short_request_explicit_blue_and_group(self):
        scenarios = json.loads((HERE / "avani-benchmark-scenarios.json").read_text())
        bigger = next(s for s in scenarios if s["id"] == "avani-living-rearrange")
        self.assertEqual(bigger["scene_source"], "editor-demo")
        self.assertEqual(bigger["request"], "Make the living room feel bigger.")
        self.assertGreater(bigger["expect"]["min_largest_rectangle_delta_m2"], 0)
        self.assertTrue(any(s["expected_intent"].get("colors") == [{"target": "wall", "id": "wall-west", "color": "#3366cc"}] for s in scenarios))
        self.assertTrue(any(s.get("scene_variant") == "grouped-v2" for s in scenarios))

    def test_saved_execution_contains_exact_input_and_provenance_without_a_model(self):
        scenario = {"id": "offline-contract", "scene_source": "editor-demo", "request": "Contract only"}
        source = {"scene": {"rooms": [], "walls": [], "openings": [], "items": [], "fixed": []},
                  "editor_scene": {"id": "actual-source"}, "catalog": [{"id": "asset"}],
                  "scene_source": {"kind": "editor-demo", "variant": "original", "scene_sha256": "contract-hash"}}
        watched = SimpleNamespace(usage_limited=False, timed_out=False, deadline_exceeded=False, cancelled=False, seconds=1.25, returncode=0)
        with tempfile.TemporaryDirectory(dir=HERE, prefix="avani-contract-") as directory:
            batch = Path(directory)
            with patch.object(self.runner, "load_scene_input", return_value=source), \
                 patch.object(self.runner.designer, "prepare_runtime", return_value={}), \
                 patch.object(self.runner.designer, "watch_process", return_value=watched), \
                 patch.object(self.runner, "score", return_value={"pass": False}), redirect_stdout(io.StringIO()):
                record = self.runner.execute(scenario, "with-place", batch, SimpleNamespace(idle_timeout=1, timeout=2), threading.Event())
            saved = json.loads((batch / "offline-contract-with-place.json").read_text())
            for key in source:
                self.assertEqual(record[key], source[key])
                self.assertEqual(saved[key], source[key])
            self.assertEqual(saved["seconds"], 1.25)
            self.assertIsNone(saved["tokens"])

    def test_avani_report_does_not_overwrite_or_mislabel_historical_bedroom_report(self):
        reporter = module("avani_report", HERE / "report.py")
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory); batch = home / "runs" / "avani" / "offline-contract"; batch.mkdir(parents=True)
            historical = home / "report.md"; historical.write_text("historical measurement sentinel")
            scenario = {"id": "avani-living-rearrange", "category": "rearrange", "request": "Make the living room feel bigger."}
            manifest = {"suite": "avani", "scenarios": [scenario], "model": "gpt-6-astra", "effort": "medium", "concurrency": 1,
                        "started_at": "recorded-time", "git_revision": "source-revision", "git_dirty": True, "source_hashes": {},
                        "jobs": [{"scenario": scenario["id"], "mode": "with-place"}]}
            (batch / "manifest.json").write_text(json.dumps(manifest))
            reporter.HERE = home
            with redirect_stdout(io.StringIO()):
                path = reporter.write_report(batch)
            self.assertEqual(path, home / "report-avani.md")
            self.assertEqual(historical.read_text(), "historical measurement sentinel")
            rendered = path.read_text()
            self.assertIn("Avani", rendered)
            self.assertIn("0/1 recorded", rendered)
            self.assertIn("Make the living room feel bigger.", rendered)
            self.assertIn("--suite avani", rendered)
            self.assertIn("Editor preview", rendered)
            self.assertIn("Working tree dirty at run start: yes", rendered)
            self.assertNotIn("Demo flat: pending", rendered)
            self.assertNotIn("bedroom fixture is the immutable", rendered)

    def test_cli_exposes_named_suite_and_one_run_flag_without_loading_sdk(self):
        result = subprocess.run([sys.executable, str(HERE / "run.py"), "--help"], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0)
        self.assertIn("--suite", result.stdout)
        self.assertIn("--with-place-only", result.stdout)


if __name__ == "__main__":
    unittest.main()
