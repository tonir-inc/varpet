import unittest

import designer_spike


class SpikeServiceTest(unittest.TestCase):
    def test_engine_defaults_to_spike_and_rejects_unknown(self):
        self.assertEqual(designer_spike.engine({}), "spike")
        self.assertEqual(designer_spike.engine({"VARPET_DESIGNER_ENGINE": "legacy"}), "legacy")
        with self.assertRaises(ValueError):
            designer_spike.engine({"VARPET_DESIGNER_ENGINE": "fast"})

    def test_agent_defaults_to_codex_and_claude_turns_the_codex_critic_off(self):
        self.assertEqual(designer_spike.agent({}), "codex")
        self.assertTrue(designer_spike.critic_on({}))
        self.assertEqual(designer_spike.agent({"VARPET_SPIKE_AGENT": "claude"}), "claude")
        self.assertFalse(designer_spike.critic_on({"VARPET_SPIKE_AGENT": "claude"}))
        self.assertFalse(designer_spike.critic_on({"VARPET_SPIKE_CRITIC": "0"}))
        with self.assertRaises(ValueError):
            designer_spike.agent({"VARPET_SPIKE_AGENT": "gpt"})

    def test_claude_sandbox_keeps_writes_local_and_network_to_the_catalog(self):
        import json
        settings = json.loads(designer_spike.claude_settings({"VARPET_CATALOG_URL": "http://10.0.0.7:8765/mcp"}))["sandbox"]
        self.assertTrue(settings["enabled"])
        self.assertFalse(settings["allowUnsandboxedCommands"])
        self.assertIn("10.0.0.7", settings["network"]["allowedDomains"])
        self.assertNotIn("example.com", settings["network"]["allowedDomains"])

    def test_forget_leaves_codex_conversations_alone(self):
        import tempfile, unittest.mock
        from pathlib import Path
        with tempfile.TemporaryDirectory() as root, unittest.mock.patch.object(designer_spike.subprocess, "run") as run:
            (Path(root) / "spike").mkdir()
            with unittest.mock.patch.dict(designer_spike.os.environ, {"VARPET_SPIKE_AGENT": "codex"}):
                designer_spike.forget(Path(root))
            run.assert_not_called()

    def test_claude_turn_text_names_an_attached_picture(self):
        class Text:
            text = "Customer request: style it"
        class Picture:
            path = "/w/inspiration.png"
        self.assertEqual(designer_spike._claude_text("plain"), "plain")
        text = designer_spike._claude_text([Picture(), Text()])
        self.assertIn("/w/inspiration.png", text)
        self.assertIn("style it", text)

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

    def test_suggestion_asks_and_changes_are_told_apart(self):
        for ask in ("any suggestions?", "What could be better here?", "what's wrong with this flat", "what would you improve?"):
            self.assertTrue(designer_spike.wants_suggestions(ask), ask)
        for change in ("move the coffee table 10 cm closer to the TV unit", "fix the walkways", "make it better",
                       "Suggestion: add the lighting", "make the sofa blue",
                       "Now improve the arrangement as a designer would: give every door a clear path"):
            self.assertFalse(designer_spike.wants_suggestions(change), change)

    def test_every_dram_amount_is_labelled_mock(self):
        self.assertEqual(designer_spike.mock_amounts("The total stays 4,111,000 AMD; a lamp is 12 000 dram (mock)."),
                         "The total stays 4,111,000 AMD (mock); a lamp is 12 000 dram (mock).")

    def test_suggestions_are_offered_as_optional_groups_and_a_chip_becomes_its_request(self):
        import json, tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as root:
            state = designer_spike.SpikeConversation(workspace=Path(root), home=Path(root), config={})
            (Path(root) / "draft.json").write_text(json.dumps({"items": [{"id": "desk-1", "name": "Desk"}]}))
            groups = [{"id": "lighting", "title": "Lighting", "chip": "Suggestion: add the lighting",
                       "lines": ["lighting: desk desk-1 has no task light"], "plain": ["desk desk-1 has no task light"]},
                      {"id": "walls", "title": "Art, plants and wall colour", "chip": "Suggestion: add art, plants and wall colour",
                       "lines": ["paint: hall has no wall colour"], "plain": ["hall has no wall colour"]}]
            reply = designer_spike.suggestions_reply(state, "c1", groups)
            self.assertEqual(reply["type"], "question")
            self.assertEqual(reply["options"], ["Suggestion: add the lighting", "Suggestion: add art, plants and wall colour"])
            self.assertIn("optional", reply["question"])
            self.assertIn("1) Lighting: desk has no task light.", reply["question"])
            self.assertLessEqual(len(reply["question"]), 1000)
            self.assertIn("lighting: desk desk-1 has no task light", state.offered["Suggestion: add the lighting"])
            self.assertIn("change nothing else", state.offered["Suggestion: add the lighting"])
            self.assertNotIn("suggestions", designer_spike.suggestions_reply(state, "c1", []))


if __name__ == "__main__":
    unittest.main()
