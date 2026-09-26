"""Benchmark contract tests; synthetic events never become live report rows."""
import importlib.util
import pathlib
import sys
import unittest

PATH = pathlib.Path(__file__).with_name("run.py")


class BenchmarkContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not PATH.exists():
            raise AssertionError("Missing benchmark runner run.py")
        spec = importlib.util.spec_from_file_location("eval_runner", PATH)
        cls.runner = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = cls.runner
        spec.loader.exec_module(cls.runner)

    def test_latest_cumulative_tokens_are_not_added(self):
        events = [{"method": "thread/tokenUsage/updated", "payload": {
            "tokenUsage": {"total": {"totalTokens": n, "inputTokens": n - 2, "outputTokens": 2}}}}
            for n in (5, 12)]
        result = self.runner.summarize_events(events)
        self.assertEqual(result["tokens"], 12)
        self.assertEqual(result["rounds"], 0)

    def test_empty_usage_remains_unknown(self):
        result = self.runner.summarize_events([])
        self.assertIsNone(result["tokens"])
        self.assertIsNone(result["model_cost_usd"])
        self.assertEqual(result["tool_calls"], [])

    def test_mcp_rejection_is_not_an_accepted_proposal(self):
        event = {"method": "item/completed", "payload": {"item": {
            "id": "p1", "type": "mcpToolCall", "tool": "propose", "arguments": {"ops": []},
            "result": {"content": [{"type": "text", "text": '{"ok":false,"errors":[{"check":"request_add"}]}'}]},
        }}}
        result = self.runner.summarize_events([event, event])
        self.assertIsNone(result["proposal"])
        self.assertEqual(len(result["tool_calls"]), 1)

    def test_without_place_really_hides_tool(self):
        config = self.runner.worker_config(pathlib.Path("/scene.json"), without_place=True)
        self.assertNotIn("place", config["mcp_servers"]["varpet-designer"]["enabled_tools"])
        self.assertIn("propose", config["mcp_servers"]["varpet-designer"]["enabled_tools"])
        self.assertEqual(config["model"], "gpt-6-astra")
        self.assertEqual(config["model_reasoning_effort"], "medium")

    def test_usage_limit_stops_even_on_success_exit(self):
        self.assertTrue(self.runner.usage_limit("prefix Usage limit reached", 0))
        self.assertFalse(self.runner.usage_limit("", 0))


if __name__ == "__main__":
    unittest.main()
