"""uv run --project ../../../harness python -m pytest -q run/critic_test.py   (from packages/designer/spike)"""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import critic  # noqa: E402
import spike  # noqa: E402


class CriticTest(unittest.TestCase):
    def test_parse_accepts_object_list_and_fences(self):
        issue = {"room": "r", "severity": "major", "issue": "chairs away", "evidence": "plan", "fix": "move"}
        self.assertEqual(critic.parse(json.dumps({"issues": [issue]}), "r"), [issue])
        self.assertEqual(critic.parse("```json\n" + json.dumps([issue]) + "\n```", "r"), [issue])
        self.assertEqual(critic.parse("not json", "r"), [])
        odd = critic.parse(json.dumps({"issues": [{"severity": "huge", "issue": "x"}, {"issue": ""}]}), "room-a")
        self.assertEqual(odd, [{"room": "room-a", "severity": "minor", "issue": "x", "evidence": "", "fix": ""}])

    def test_serious_and_feedback(self):
        issues = [{"room": "r", "severity": s, "issue": s, "evidence": "e", "fix": "f"} for s in critic.SEVERITIES]
        self.assertEqual([i["severity"] for i in critic.serious(issues)], ["blocker", "major"])
        text = critic.feedback(critic.serious(issues))
        self.assertIn("independent reviewer", text)
        self.assertNotIn("[minor]", text)

    def test_lit(self):
        draft = {"items": [{"room_id": "a", "kind": "lamp"}], "lighting": [{"room_id": "b", "type": "ceiling"}]}
        self.assertTrue(critic.lit(draft, "a") and critic.lit(draft, "b"))
        self.assertFalse(critic.lit(draft, "c"))

    def test_question_means_empty_draft_and_a_question(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            (workspace / "draft.json").write_text('{"items": []}')
            self.assertTrue(spike.is_question("A: share, or B: sofa bed?", workspace))
            self.assertFalse(spike.is_question("Done.", workspace))
            (workspace / "draft.json").write_text('{"items": [{"id": "bed"}]}')
            self.assertFalse(spike.is_question("Shall I add a rug?", workspace))


if __name__ == "__main__":
    unittest.main()
