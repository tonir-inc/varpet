"""Presentation integration over real HTTP, with no model or catalog calls."""

import copy
import http.client
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import designer_service


class PresentationTransportTests(unittest.TestCase):
    def setUp(self):
        self.saved = {"id": "checked-1", "rationale": "Raw model rationale remains in the record.",
                      "ops": [{"type": "move", "id": "sofa", "pos": [1, 2], "rot": 90}],
                      "score": {"free_floor": 1.2}}
        self.translated = {"id": "checked-1", "title": "Raw title", "description": "Raw description",
                           "command": {"id": "command-1", "label": "Apply designer layout",
                                       "source": "designer", "baseRevision": 3,
                                       "operations": [{"type": "update", "id": "sofa",
                                                       "patch": {"position": [1, 0, 2]}}]}}
        self.body = {"scene": {"format": "varpet.editor", "objects": [{"id": "sofa", "name": "Sofa"}]},
                     "revision": 3, "request": "make the living room feel bigger"}
        self.service = designer_service.DesignerService(bridge_command=["bridge"], worker_command=["worker"])
        self.addCleanup(self.service.close)
        self.process = patch.object(self.service, "_process", side_effect=self.process_fixture)
        self.process.start()
        self.addCleanup(self.process.stop)
        runtime = patch.object(designer_service.designer, "prepare_runtime", side_effect=self.runtime_fixture)
        runtime.start()
        self.addCleanup(runtime.stop)
        self.server = designer_service.make_server(self.service, port=0)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(lambda: (self.server.shutdown(), self.server.server_close(), thread.join(timeout=2)))

    def runtime_fixture(self, root, scene):
        root.mkdir()
        path = root / "scene.json"
        path.write_text(json.dumps(scene))
        return {"scene": str(path)}

    def process_fixture(self, command, cancel, *, env=None, on_output=None):
        if command[0] == "worker":
            Path(env["VARPET_PROPOSALS_DIR"], "checked-1.json").write_text(json.dumps(self.saved))
            on_output("stdout", json.dumps({"kind": "worker_summary", "status": "completed",
                                            "response": "Raw model answer"}) + "\n")
        elif command[1] == "to-designer":
            Path(command[3]).write_text(json.dumps({"rooms": [], "items": []}))
        elif command[1] == "to-command":
            self.assertNotIn("--notes-out", command, "Presentation must not alter the bridge CLI")
            Path(command[5]).write_text(json.dumps(self.translated))
        else:
            self.fail(f"Unexpected command: {command}")

    def post(self, presentation):
        with patch.object(designer_service, "format_presentation", return_value=presentation, create=True) as formatter:
            connection = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=5)
            connection.request("POST", "/designer/propose", json.dumps(self.body), {"Content-Type": "application/json"})
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            records = [json.loads(line) for line in response]
            connection.close()
        finals = [record for record in records if record["type"] != "progress"]
        self.assertEqual(len(finals), 1)
        self.assertEqual(records[-1], finals[0])
        return finals[0], formatter

    def test_presentation_changes_only_display_copy_and_transports_notes_beside_proposal(self):
        original_saved = copy.deepcopy(self.saved)
        original_proposal = copy.deepcopy(self.translated)
        presentation = {"title": "More room to move", "description": "Bring the seating together.",
                        "notes": "The furniture stays within the room."}
        final, formatter = self.post(presentation)
        self.assertEqual(final["type"], "proposal")
        self.assertEqual(final["proposal"], {**original_proposal, "title": presentation["title"],
                                             "description": presentation["description"]})
        self.assertEqual(final["notes"], presentation["notes"])
        self.assertNotIn("notes", final["proposal"])
        self.assertEqual(final["metrics"], original_saved["score"])
        self.assertEqual(self.saved, original_saved)
        self.assertEqual(self.translated, original_proposal)
        formatter.assert_called_once_with(original_saved, self.body["scene"], original_proposal,
                                          self.body["request"])

    def test_absent_notes_preserves_the_existing_proposal_reply_shape(self):
        final, _ = self.post({"title": "More room", "description": "Move the sofa."})
        self.assertEqual(final["type"], "proposal")
        self.assertNotIn("notes", final)
        self.assertEqual(final["proposal"]["title"], "More room")

    def test_notes_accepts_exact_1600_character_boundary(self):
        final, _ = self.post({"title": "More room", "description": "Move the sofa.", "notes": "n" * 1600})
        self.assertEqual(final["type"], "proposal")
        self.assertEqual(len(final["notes"]), 1600)

    def test_invalid_notes_never_reach_the_proposal_stream(self):
        for notes in (None, ["not text"], {"notes": "nested"}, "", " \n", "n" * 1601):
            with self.subTest(notes_type=type(notes).__name__, length=len(notes) if notes is not None else None):
                final, _ = self.post({"title": "More room", "description": "Move the sofa.", "notes": notes})
                self.assertEqual(final["type"], "error")
                self.assertIn("presentation", final["message"].lower())
                self.assertNotIn("proposal", final)

    def test_invalid_required_copy_is_an_error_not_a_malformed_proposal(self):
        for presentation in (None, [], {}, {"title": "Title", "description": None},
                             {"title": " ", "description": "Description"},
                             {"title": "Title", "description": " \n"},
                             {"title": "t" * 161, "description": "Description"},
                             {"title": "Title", "description": "d" * 4001}):
            with self.subTest(presentation_type=type(presentation).__name__):
                final, _ = self.post(presentation)
                self.assertEqual(final["type"], "error")
                self.assertIn("presentation", final["message"].lower())

    def test_stale_bridge_proposal_is_rejected_before_presentation(self):
        self.translated["command"]["baseRevision"] = 2
        final, formatter = self.post({"title": "A friendly title", "description": "Friendly copy"})
        self.assertEqual(final["type"], "error")
        formatter.assert_not_called()


if __name__ == "__main__":
    unittest.main()
