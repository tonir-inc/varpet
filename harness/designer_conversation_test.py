"""Conversational replies are answers, never implicit refusals or scene edits."""
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch

from designer_service import DesignerService
from designer_profiles import prompt


class ConversationTests(unittest.TestCase):
    def reply(self, response, events=()):
        service = DesignerService()
        self.addCleanup(service.close)
        progress = []
        def process(command, cancel, **kwargs):
            if "to-designer" in command:
                Path(command[command.index("to-designer") + 2]).write_text('{}')
            else:
                for event in [*events, {"kind": "worker_summary", "status": "completed", "response": response}]:
                    kwargs["on_output"]("stdout", json.dumps(event) + "\n")
        with patch.object(service, "_process", process):
            result = service.propose({"scene": {"format": "varpet.editor"}, "revision": 0,
                                      "request": "Why did you choose that?"}, threading.Event(), progress.append)
        return result, progress

    def test_plain_explanation_is_message(self):
        result, _ = self.reply("**Sage** softens the room without adding visual clutter.")
        self.assertEqual(result["type"], "message")
        self.assertIn("**Sage**", result["message"])
        self.assertNotIn("proposal", result)

    def test_explicit_refusal_keeps_decline(self):
        result, _ = self.reply("DECLINE: I cannot move a structural wall, but we can discuss furniture.")
        self.assertEqual(result["type"], "decline")
        self.assertFalse(result["message"].startswith("DECLINE:"))

    def test_optional_suggestions_are_validated(self):
        result, _ = self.reply(json.dumps({"type": "message", "message": "Less visual clutter.", "suggestions": ["Make it warmer"]}))
        self.assertEqual(result["suggestions"], ["Make it warmer"])
        for invalid in [None, "Make it warmer", [""], [4], ["x"] * 5]:
            with self.subTest(invalid=invalid), self.assertRaisesRegex(ValueError, "suggestions"):
                self.reply(json.dumps({"type": "message", "message": "Hello", "suggestions": invalid}))

    def test_only_final_answer_text_streams_not_reasoning_or_tool_payloads(self):
        events = [
            {"method": "item/started", "payload": {"item": {"id": "r", "type": "agentMessage", "phase": "commentary"}}},
            {"method": "item/agentMessage/delta", "payload": {"itemId": "r", "delta": "private planning"}},
            {"method": "item/started", "payload": {"item": {"id": "a", "type": "agentMessage", "phase": "final_answer"}}},
            {"method": "item/agentMessage/delta", "payload": {"itemId": "a", "delta": "A calm "}},
            {"method": "item/agentMessage/delta", "payload": {"itemId": "a", "delta": "palette."}},
        ]
        _, records = self.reply("A calm palette.", events)
        self.assertEqual(''.join(record['delta'] for record in records if isinstance(record, dict)), "A calm palette.")
        self.assertNotIn("private planning", str(records))

    def test_every_profile_requires_zero_tools_for_pure_questions(self):
        original = Path(__file__).with_name('designer_prompt.md').read_text()
        for context in ['full', 'trimmed', 'compact', 'compact-base']:
            instructions = prompt('relations', context, original)
            self.assertIn('zero tool calls', instructions)
            self.assertIn('DECLINE:', instructions)
            self.assertIn('thread', instructions)
