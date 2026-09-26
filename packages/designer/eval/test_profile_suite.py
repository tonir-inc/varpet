"""Offline integration contracts for named editor suites and speed profiles."""
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("profile_suite_runner", HERE / "run.py")
runner = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = runner
spec.loader.exec_module(runner)


class ProfileSuiteTests(unittest.TestCase):
    def test_resume_restores_complete_recorded_profile_and_clears_unrecorded_cli_overrides(self):
        args = SimpleNamespace(speed_profile="one-batch", context="trimmed", round_cap=8, effort="medium")
        manifest = {"concurrency": 2, "deadline_seconds": 180, "idle_timeout_seconds": 90,
                    "speed_profile": "without-place", "effort": "low", "context": "compact-base", "round_cap": 4}
        runner.restore_settings(args, manifest)
        self.assertEqual((args.speed_profile, args.effort, args.context, args.round_cap), ("without-place", "low", "compact-base", 4))
        runner.restore_settings(args, {"concurrency": 1, "deadline_seconds": 120, "idle_timeout_seconds": 60})
        self.assertEqual((args.speed_profile, args.effort, args.context, args.round_cap), (None, "medium", "full", None))

    def test_editor_snapshot_and_effective_profile_survive_the_same_worker_job(self):
        source = {"scene": {"rooms": [], "walls": [], "openings": [], "items": [], "fixed": []},
                  "editor_scene": {"id": "editor-contract"}, "catalog": [], "scene_source": {"kind": "editor-demo"}}
        scenario = {"id": "profile-contract", "request": "Preserve the exact request", "scene_source": "editor-demo"}
        audit = {"source": "static-catalog", "sha256": "test-catalog"}
        watched = SimpleNamespace(usage_limited=False, timed_out=False, deadline_exceeded=False, cancelled=False, seconds=1, returncode=0)
        for settings, expected in [
            ({}, {"placement": "relations", "context": "full"}),
            ({"speed_profile": "without-place", "context": "compact-base", "round_cap": 4, "effort": "low"},
             {"placement": "without-place", "context": "compact-base", "max_rounds": 4}),
        ]:
            jobs = []
            def process(command, **kwargs):
                jobs.append(json.loads(Path(command[command.index("--worker") + 1]).read_text()))
                kwargs["on_output"]("stdout", json.dumps({"kind": "worker_summary", "status": "completed"}) + "\n")
                return watched
            with tempfile.TemporaryDirectory(dir=HERE, prefix="profile-contract-") as directory:
                with patch.object(runner, "load_scene_input", return_value=source), \
                     patch.object(runner.designer, "prepare_runtime", return_value={"model_catalog_audit": audit}), \
                     patch.object(runner.designer, "watch_process", side_effect=process), \
                     patch.object(runner, "score", return_value={"pass": False}), redirect_stdout(io.StringIO()):
                    result = runner.execute(scenario, "with-place", Path(directory), SimpleNamespace(idle_timeout=1, timeout=2, **settings), threading.Event())
            self.assertEqual(jobs[0]["profile"], expected)
            self.assertEqual(jobs[0]["request"], scenario["request"])
            self.assertEqual(jobs[0]["effort"], settings.get("effort", "medium"))
            self.assertEqual(result["editor_scene"], source["editor_scene"])
            self.assertEqual(result["scene_source"], source["scene_source"])
            self.assertEqual(result["model_catalog"], audit)

    def test_avani_source_hashes_include_both_exporter_and_runtime_profile(self):
        hashes = runner.source_hashes("avani")
        self.assertIn("harness/designer_profiles.py", hashes)
        self.assertIn("packages/designer/eval/editor-demo.ts", hashes)
        self.assertIn("apps/editor/src/core/demo.ts", hashes)


if __name__ == "__main__":
    unittest.main()
