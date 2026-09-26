"""Offline report contracts: real files, missing telemetry, and conservative grading."""
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest


MODULE = Path(__file__).with_name("report.py")


class ReportTests(unittest.TestCase):
    def subject(self):
        self.assertTrue(MODULE.exists(), "report.py must implement measured benchmark reporting")
        spec = importlib.util.spec_from_file_location("eval_report", MODULE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def make_batch(self, root, jobs, records=(), errors=()):
        home = Path(root) / "eval"
        batch = home / "runs" / "measured-batch"
        batch.mkdir(parents=True)
        manifest = {"model": "gpt-6-astra", "effort": "medium", "concurrency": 4,
                    "started_at": "2026-09-26T09:00:00Z", "git_revision": "abc123",
                    "source_hashes": {"harness/designer.py": "sha256-proof"},
                    "jobs": jobs, "errors": list(errors), "ablation": "Coordinates allowed; place hidden."}
        (batch / "manifest.json").write_text(json.dumps(manifest))
        scenarios = [{"id": job["scenario"], "category": "rearrange", "scene": "bedroom",
                      "request": "Move the desk | keep bed", "expect": {"kind": "proposal"}}
                     for job in jobs]
        (home / "scenarios.json").write_text(json.dumps(scenarios))
        for record in records:
            (batch / (record["id"] + ".json")).write_text(json.dumps(record))
        return home, batch

    def record(self, scenario, mode="with-place", seconds=10, tokens=100, passed=True, match=True):
        return {"id": scenario + "-" + mode, "scenario": {"id": scenario, "category": "rearrange",
                "scene": "bedroom", "request": "Move the desk | keep bed", "expect": {"kind": "proposal"}},
                "mode": mode, "seconds": seconds, "tokens": tokens, "rounds": 2, "status": "completed",
                "transcript": "runs/measured-batch/" + scenario + "-" + mode + ".jsonl",
                "measurement": {"pass": passed, "request_match": match, "propose_accepted": True,
                "baseline": {"free_area_m2": 8, "largest_rectangle_m2": 3, "narrowest_walkway_m": .6},
                "after": {"free_area_m2": 8.1, "largest_rectangle_m2": 3.2, "narrowest_walkway_m": .7},
                "cost_dram": 0, "tiers": {"hard_checks": True, "human_votes": "unvoted"}, "reasons": []}}

    def render(self, module, home, batch):
        module.HERE = home
        output = io.StringIO()
        with redirect_stdout(output):
            path = module.write_report(batch)
        self.assertEqual(path, home / "report.md")
        return path.read_text(), output.getvalue()

    def test_all_planned_rows_exist_and_missing_numbers_are_not_zero(self):
        module = self.subject()
        jobs = [{"scenario": f"r{i:02d}", "mode": "with-place"} for i in range(13)]
        jobs += [{"scenario": f"r{i:02d}", "mode": "without-place"} for i in range(6)]
        with tempfile.TemporaryDirectory() as directory:
            home, batch = self.make_batch(directory, jobs)
            report, _ = self.render(module, home, batch)
        rows = [line for line in report.splitlines() if line.startswith("| r")]
        self.assertEqual(len(rows), 19)
        self.assertTrue(all("pending" in line and "N/A" in line for line in rows))
        self.assertIn("0/19 recorded", report)
        self.assertIn("median seconds N/A (n=0)", report)

    def test_request_refusal_cannot_be_reported_as_pass_even_with_inconsistent_grader(self):
        module = self.subject()
        record = self.record("rejected", match=False)
        record["measurement"]["reasons"] = ["request check refused"]
        with tempfile.TemporaryDirectory() as directory:
            home, batch = self.make_batch(directory, [{"scenario": "rejected", "mode": "with-place"}], [record])
            report, _ = self.render(module, home, batch)
        row = next(line for line in report.splitlines() if line.startswith("| rejected |"))
        self.assertIn("FAIL", row)
        self.assertIn("request check refused", report)
        self.assertIn("pass rate 0/1 (0.0%)", report)

    def test_summary_and_paired_comparison_use_measured_samples(self):
        module = self.subject()
        jobs = [{"scenario": "paired", "mode": "with-place"},
                {"scenario": "paired", "mode": "without-place"},
                {"scenario": "single", "mode": "with-place"}]
        records = [self.record("paired", seconds=10, tokens=100),
                   self.record("paired", "without-place", seconds=30, tokens=500, passed=False, match=False),
                   self.record("single", seconds=20, tokens=300)]
        with tempfile.TemporaryDirectory() as directory:
            home, batch = self.make_batch(directory, jobs, records)
            report, printed = self.render(module, home, batch)
        self.assertIn("median seconds 15.000 (n=2)", report)
        self.assertIn("slowest seconds 20.000 (n=2)", report)
        self.assertIn("median tokens 200 (n=2)", report)
        self.assertIn("Matched rearrange pairs: n=1", report)
        self.assertIn("without minus with", report)
        self.assertIn("20.000", report)
        self.assertIn("400", report)
        self.assertIn("pass rate 2/2 (100.0%)", report)
        self.assertIn("2/2", printed)

    def test_unknown_telemetry_and_engine_human_caveats_are_explicit(self):
        module = self.subject()
        record = self.record("unknown", seconds=None, tokens=None)
        record["rounds"] = None
        record["measurement"]["after"] = None
        record["measurement"]["cost_dram"] = None
        record["measurement"]["propose_accepted"] = False
        record["measurement"]["pass"] = False
        with tempfile.TemporaryDirectory() as directory:
            home, batch = self.make_batch(directory, [{"scenario": "unknown", "mode": "with-place"}], [record])
            report, _ = self.render(module, home, batch)
        self.assertIn("median tokens N/A (n=0)", report)
        self.assertIn("model billing cost is unavailable", report)
        self.assertIn("Human votes: unvoted", report)
        self.assertIn("Demo flat: pending", report)
        self.assertIn("last.totalTokens > 0", report)
        self.assertIn("immutable baseline", report)
        self.assertIn("engine", report.lower())

    def test_raw_source_links_commands_and_errors_survive_markdown(self):
        module = self.subject()
        record = self.record("linked")
        jobs = [{"scenario": "linked", "mode": "with-place"}, {"scenario": "broken", "mode": "with-place"}]
        errors = [{"job": ["broken", "with-place"], "error": "worker failed | timeout"}]
        with tempfile.TemporaryDirectory() as directory:
            home, batch = self.make_batch(directory, jobs, [record], errors)
            report, _ = self.render(module, home, batch)
        self.assertIn("(runs/measured-batch/linked-with-place.jsonl)", report)
        self.assertIn("(runs/measured-batch/manifest.json)", report)
        self.assertIn("uv run --with", report)
        self.assertIn("abc123", report)
        self.assertIn("worker failed \\| timeout", report)
        self.assertIn("[measured]", report)
        self.assertIn("[derived]", report)
        self.assertIn("[assumed]", report)


if __name__ == "__main__":
    unittest.main()
