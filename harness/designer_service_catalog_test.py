"""The same editor catalog and geometry extras must reach both bridge calls."""
import json
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest

from designer_service import DesignerService, validate_request


class CatalogHandoffTest(unittest.TestCase):
    def test_rejects_invalid_catalog_extras_before_starting_a_turn(self):
        base = {"scene": {"format": "varpet.editor"}, "revision": 0, "request": "Move the sofa"}
        for extras in ({"catalog": {}}, {"catalog": [None]}, {"catalog": [{}] * 1001},
                       {"catalogCurrency": "USD"}, {"catalogCurrency": 0}):
            with self.subTest(extras=list(extras)), self.assertRaises(ValueError):
                validate_request({**base, **extras})

    def test_catalog_and_extras_are_identical_during_conversion_and_translation(self):
        calls = []
        catalog = [{"id": "real-sofa", "kind": "sofa", "dimensions": [2, 1, 1]}]
        swings = {"door": "in-left"}

        class RecordingService(DesignerService):
            def _process(self, command, cancel, *, env=None, on_output=None):
                calls.append(command)
                if "to-designer" in command:
                    mode = command.index("to-designer")
                    Path(command[mode + 2]).write_text(json.dumps({"rooms": [], "items": []}))
                elif "to-command" in command:
                    mode = command.index("to-command")
                    Path(command[mode + 4]).write_text(json.dumps({"id": "p-1", "title": "Move", "description": "Checked.",
                        "command": {"id": "c-1", "label": "Move", "source": "designer", "baseRevision": 7, "operations": []}}))
                else:
                    Path(env["VARPET_PROPOSALS_DIR"], "p-1.json").write_text(json.dumps({"id": "p-1", "score": {}}))
                    on_output("stdout", json.dumps({"kind": "worker_summary", "status": "completed", "response": "Checked."}) + "\n")
                return SimpleNamespace(returncode=0, stdout="", stderr="")

        service = RecordingService()
        # Runtime setup is local: no SDK or model invocation occurs.
        try:
            result = service.propose({"scene": {"format": "varpet.editor"}, "revision": 7,
                "request": "Move the sofa", "catalog": catalog, "catalogCurrency": "AMD", "keep": ["bed"],
                "northDeg": 35, "doorSwings": swings}, threading.Event(), lambda message: None)
            self.assertEqual(result["type"], "proposal")
            convert, translate = calls[0], calls[-1]
            for flag in ("--catalog", "--currency", "--keep", "--north", "--swings"):
                self.assertIn(flag, convert)
                self.assertIn(flag, translate)
                self.assertEqual(convert[convert.index(flag) + 1], translate[translate.index(flag) + 1])
        finally:
            service.close()


if __name__ == "__main__":
    unittest.main()
