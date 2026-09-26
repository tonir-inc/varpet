import importlib.util
from pathlib import Path
import sys
import unittest

spec = importlib.util.spec_from_file_location("eval_telemetry", Path(__file__).with_name("run.py"))
runner = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = runner
spec.loader.exec_module(runner)


class TelemetryContract(unittest.TestCase):
    def test_rounds_count_advancing_nonzero_usage_not_duplicate_notifications(self):
        def event(total, last):
            return {"method": "thread/tokenUsage/updated", "payload": {
                "threadId": "t", "turnId": "one", "tokenUsage": {
                    "total": {"totalTokens": total}, "last": {"totalTokens": last}}}}
        got = runner.summarize_events([event(0, 0), event(10, 10), event(10, 10), event(14, 4)])
        self.assertEqual(got["rounds"], 2)
        self.assertEqual(got["tokens"], 14)

    def test_failed_tool_status_cannot_accept_proposal(self):
        got = runner.summarize_events([{"method": "item/completed", "payload": {"item": {
            "id": "failed", "type": "mcpToolCall", "tool": "propose", "status": "failed",
            "result": {"structuredContent": {"ok": True, "proposal": {"id": "fake"}}}}}}])
        self.assertIsNone(got["proposal"])

    def test_final_usage_and_response_come_from_completed_worker(self):
        got = runner.summarize_events([{"kind": "worker_summary", "status": "completed",
            "response": "No space for 100 beds", "total_usage": {"totalTokens": 400}}])
        self.assertEqual(got["tokens"], 400)
        self.assertEqual(got["status"], "completed")
        self.assertIn("100", got["final"])


if __name__ == "__main__":
    unittest.main()
