import unittest

import designer_spike


class SpikeServiceTest(unittest.TestCase):
    def test_engine_defaults_to_spike_and_rejects_unknown(self):
        self.assertEqual(designer_spike.engine({}), "spike")
        self.assertEqual(designer_spike.engine({"VARPET_DESIGNER_ENGINE": "legacy"}), "legacy")
        with self.assertRaises(ValueError):
            designer_spike.engine({"VARPET_DESIGNER_ENGINE": "fast"})

    def test_strip_design_removes_only_the_designs_own_records(self):
        doc = {"objects": [{"id": "sofa"}, {"id": "own-chair"}],
               "project": {"components": [{"id": "pendant"}, {"id": "radiator"}],
                           "finishes": [{"id": "spike:room:floor"}, {"id": "tile"}]}}
        stripped = designer_spike.strip_design(doc, ["sofa", "pendant"])
        self.assertEqual([o["id"] for o in stripped["objects"]], ["own-chair"])
        self.assertEqual([c["id"] for c in stripped["project"]["components"]], ["radiator"])
        self.assertEqual([f["id"] for f in stripped["project"]["finishes"]], ["tile"])
        self.assertEqual(len(doc["objects"]), 2)

    def test_progress_lines_are_short_customer_text(self):
        lines = []
        observer = designer_spike.Progress([{"id": "room-living", "name": "Living & dining"}], lines.append, None)
        for command in ("./varpet describe", "./varpet search --kind sofa --text oak",
                        "./varpet render-view v.png --room room-living --camera eye --time evening", "ls -la"):
            observer.item("item/started", {"type": "commandExecution", "command": f"/bin/zsh -lc '{command}'"})
        observer.item("item/completed", {"type": "commandExecution", "command": "./varpet check", "exitCode": 0, "aggregatedOutput": "OK\n"})
        observer.item("item/completed", {"type": "commandExecution", "command": "./varpet check", "exitCode": 1,
                                         "aggregatedOutput": "FAIL (1 hard)\n- sofa overlaps rug by 0.2 m\n"})
        observer.item("item/completed", {"type": "agentMessage", "phase": "commentary", "text": "I will warm it up. Then more."})
        self.assertEqual(lines, ["Reading the flat", "Searching the catalog for sofa", "Rendering the living & dining in the evening",
                                 "Checked: OK", "Checked: fixing sofa overlaps rug by 0.2 m", "I will warm it up."])

    def test_restyled_fitted_pieces_count_as_room_changes_and_survive_room_files(self):
        import json
        import tempfile
        from pathlib import Path
        restyle = {"id": "k-run", "room_id": "room-kitchen", "materials": {"fronts": "#1f3a5f"}}
        before = designer_spike._signatures({"items": []})
        after = designer_spike._signatures({"items": [], "restyle": [restyle]})
        self.assertNotIn("room-kitchen", before)
        self.assertIn("room-kitchen", after)
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            (workspace / "draft.json").write_text(json.dumps({"items": []}))
            (workspace / "rooms").mkdir()
            (workspace / "rooms" / "room-kitchen.json").write_text(json.dumps({"items": [], "restyle": [restyle]}))
            self.assertEqual(designer_spike._combined(workspace)["restyle"], [restyle])
        lines = []
        observer = designer_spike.Progress([], lines.append, None)
        observer.item("item/started", {"type": "commandExecution", "command": "./varpet restyle k-run fronts=#1f3a5f"})
        self.assertEqual(lines, ["Restyling the made-to-measure pieces"])


if __name__ == "__main__":
    unittest.main()
