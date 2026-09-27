import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import designer_spike


class LiveSyncTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.workspace, self.turn = root / "ws", root / "turn"
        self.workspace.mkdir()
        self.turn.mkdir()
        (self.workspace / "scene.json").write_text("{}")
        self.save([])
        self.state = SimpleNamespace(rooms=[{"id": "room-living", "name": "Living"}], workspace=self.workspace, owned=[])
        self.records, self.translated, self.checks = [], [], []
        self.gate = 0

        def run(command, **_):
            self.checks.append([str(part) for part in command])
            return SimpleNamespace(returncode=self.gate, stdout="FAIL (1 hard)\n- sofa blocks the door\n" if self.gate else "OK\n", stderr="")

        def translate(state, body, workspace, turn, title, description):
            self.translated.append(json.loads((workspace / "draft.json").read_text()))
            return {"proposal": {"id": f"p{len(self.translated)}", "command": {"operations": []}}}

        patches = [mock.patch.object(designer_spike, "_run", run), mock.patch.object(designer_spike, "_translate", translate)]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        self.addCleanup(self.tmp.cleanup)

    def save(self, ids):
        items = [{"id": key, "room_id": "room-living", "sku": "x"} for key in ids]
        (self.workspace / "draft.json").write_text(json.dumps({"items": items}))

    def watcher(self, **kwargs):
        return designer_spike.DraftWatcher(self.state, self.records.append, {"scene": {}, "revision": 1}, self.turn,
                                           partials=False, **kwargs)

    def settle(self, watcher, now):
        watcher.poll(now)
        if watcher.live_thread is not None:
            watcher.live_thread.join(5)

    def partials(self):
        return [record for record in self.records if isinstance(record, dict) and record.get("type") == "partial"]

    def test_rapid_saves_coalesce_into_one_live_partial(self):
        watcher = self.watcher(live=True)
        for now, ids in ((0.0, ["sofa"]), (0.5, ["sofa", "rug"]), (1.0, ["sofa", "rug", "lamp"])):
            self.save(ids)
            self.settle(watcher, now)
        self.assertEqual(self.partials(), [])  # still inside the 2 s debounce
        self.settle(watcher, 3.5)
        self.settle(watcher, 5.0)  # nothing new: no second send
        self.assertEqual(len(self.partials()), 1)
        self.assertEqual([item["id"] for item in self.translated[0]["items"]], ["sofa", "rug", "lamp"])
        self.assertEqual(set(self.partials()[0]), {"type", "proposal", "rooms"})  # the editor's partial allowlist
        self.assertEqual(self.partials()[0]["rooms"], ["Living"])
        self.assertIn("--facts", self.checks[0])

        self.save(["sofa", "rug", "lamp", "table"])
        self.settle(watcher, 6.0)
        self.settle(watcher, 8.5)
        self.assertEqual(len(self.partials()), 2)

    def test_the_draft_before_the_turn_is_not_sent(self):
        self.save(["sofa"])
        watcher = self.watcher(live=True)
        self.settle(watcher, 0.0)
        self.settle(watcher, 5.0)
        self.assertEqual(self.partials(), [])

    def test_an_undo_inside_the_debounce_sends_nothing(self):
        watcher = self.watcher(live=True)
        self.save(["sofa"])
        self.settle(watcher, 0.0)
        self.save([])
        self.settle(watcher, 0.5)
        self.settle(watcher, 5.0)
        self.assertEqual(self.partials(), [])

    def test_failing_gates_skip_with_a_logged_reason(self):
        self.gate = 1
        watcher = self.watcher(live=True)
        self.save(["sofa"])
        self.settle(watcher, 0.0)
        self.settle(watcher, 3.0)
        self.assertEqual(self.partials(), [])
        self.assertEqual(self.translated, [])
        log = [json.loads(line) for line in (self.turn / "live.jsonl").read_text().splitlines()]
        self.assertEqual(log[0]["skipped"], "gates failed")
        self.assertIn("- sofa blocks the door", log[0]["reason"])

    def test_env_zero_disables_live_sync(self):
        with mock.patch.dict(os.environ, {"VARPET_SPIKE_LIVE": "0"}):
            watcher = self.watcher()
        self.save(["sofa"])
        self.settle(watcher, 0.0)
        self.settle(watcher, 5.0)
        self.assertEqual(self.partials(), [])
        self.assertEqual(self.checks, [])


if __name__ == "__main__":
    unittest.main()
