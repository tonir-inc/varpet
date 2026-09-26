"""Opt-in images must not change the default text-only boundary."""
import tempfile
import contextlib
import io
import json
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, patch
from pathlib import Path
import unittest
import designer
import designer_typed_tools
from designer_service import DesignerService


class VisionTests(unittest.TestCase):
    def test_sdk_payload_is_text_by_default_images_opt_in_and_text_on_resume(self):
        sdk = ModuleType('openai_codex')
        generated = ModuleType('openai_codex.generated.v2_all')
        generated.ReasoningEffort = lambda value: value
        generated.ListMcpServerStatusResponse = object
        thread = Mock(id='vision-test-thread')
        event = SimpleNamespace(method='turn/completed', payload=SimpleNamespace(model_dump=lambda **_: {'turn': {'status': 'completed'}}))
        thread.turn.return_value.stream.return_value = [event]
        client = Mock()
        client.thread_start.return_value = client.thread_resume.return_value = thread
        client._client.request.return_value = SimpleNamespace(data=[], next_cursor=None)
        sdk.Codex = Mock()
        sdk.Codex.return_value.__enter__ = Mock(return_value=client)
        sdk.Codex.return_value.__exit__ = Mock(return_value=False)
        sdk.CodexConfig = lambda **kwargs: kwargs
        sdk.ApprovalMode = SimpleNamespace(deny_all='deny_all')
        sdk.Sandbox = SimpleNamespace(read_only='read_only')
        sdk.LocalImageInput = lambda path: ('local-image', path)
        sdk.TextInput = lambda text: ('text', text)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scene = root / 'scene.json'; scene.write_text('{"rooms":[]}')
            image = root / 'plan.png'; image.write_bytes(b'\x89PNG\r\n\x1a\n')
            state = root / 'thread.json'; job = root / 'job.json'
            runtime = {'scene': str(scene), 'state': str(state), 'workspace': directory, 'home': directory}
            with patch.dict(sys.modules, {'openai_codex': sdk, 'openai_codex.generated.v2_all': generated}), patch.object(designer, '_forward_sdk_stderr'), patch.object(designer, '_isolate_skills'), patch.object(designer_typed_tools, 'discover_models', return_value={'models': [{'slug': designer.MODEL}]}), contextlib.redirect_stdout(io.StringIO()):
                job.write_text(json.dumps({'runtime': runtime, 'request': 'Match colours'}))
                self.assertEqual(designer.sdk_worker(job), 0)
                original = thread.turn.call_args.args[0]
                self.assertIsInstance(original, str)
                state.unlink()
                job.write_text(json.dumps({'runtime': runtime, 'request': 'Match colours', 'images': [str(image), str(image)]}))
                self.assertEqual(designer.sdk_worker(job), 0)
                payload = thread.turn.call_args.args[0]
                self.assertEqual(payload[:2], [('local-image', str(image))] * 2)
                self.assertEqual(payload[-1][0], 'text')
                self.assertTrue(payload[-1][1].endswith(original))
                self.assertEqual(designer.sdk_worker(job), 0)
                self.assertEqual(thread.turn.call_args.args[0], original)
                client.thread_resume.assert_called_once()

    def test_default_and_resumed_turns_have_no_images(self):
        self.assertEqual(designer.first_turn_images({}, first_turn=True), [])
        self.assertEqual(designer.first_turn_images({'images': ['/missing.png']}, first_turn=False), [])

    def test_first_turn_preserves_two_images_in_order(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = [Path(directory) / name for name in ('plan.png', 'perspective.png')]
            for path in paths:
                path.write_bytes(b'\x89PNG\r\n\x1a\n' + b'test')
            self.assertEqual(designer.first_turn_images({'images': list(map(str, paths))}, first_turn=True), list(map(str, paths)))

    def test_bad_images_fail_before_model_calls(self):
        for images in ('/missing.png', ['/missing.png'], ['a', 'b', 'c']):
            with self.subTest(images=images), self.assertRaises(ValueError):
                designer.first_turn_images({'images': images}, first_turn=True)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'not-an-image.png'; path.write_text('not a PNG')
            with self.assertRaises(ValueError):
                designer.first_turn_images({'images': [str(path)]}, first_turn=True)

    def test_service_default_empty_and_explicit_images(self):
        service = DesignerService()
        try:
            self.assertEqual(service.image_paths, [])
        finally:
            service.close()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'plan.png'; path.write_bytes(b'\x89PNG\r\n\x1a\n')
            service = DesignerService(image_paths=[str(path)])
            try:
                self.assertEqual(service.image_paths, [str(path)])
            finally:
                service.close()


if __name__ == '__main__':
    unittest.main()
