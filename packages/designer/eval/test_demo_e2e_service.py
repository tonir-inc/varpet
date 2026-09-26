"""Recorder contracts; live execution never uses these unit-test replacements."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('demo_e2e_service', Path(__file__).with_name('demo-e2e-service.py'))
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class RecorderContracts(unittest.TestCase):
    def test_recording_preserves_process_result_and_forwards_callback(self):
        with tempfile.TemporaryDirectory() as directory:
            service = module.RecordedService(Path(directory))
            service.local.run_id = 'test'
            forwarded = []
            sentinel = SimpleNamespace(seconds=1.25, returncode=0)
            def process(command, cancel, **kwargs):
                kwargs['on_output']('stdout', '{"kind":"event"}\n')
                return sentinel
            try:
                with patch.object(module.DesignerService, '_process', side_effect=process):
                    result = service._process(['python','--worker','job'],threading.Event(),on_output=lambda *entry: forwarded.append(entry))
                self.assertIs(result, sentinel)
                self.assertEqual(forwarded, [('stdout','{"kind":"event"}\n')])
                records = [json.loads(line) for line in (Path(directory)/'test.events.jsonl').read_text().splitlines()]
                self.assertEqual([r['kind'] for r in records], ['process_start','process_output','process_end'])
                self.assertEqual(records[-1]['seconds'],1.25)
            finally:
                service.close()

    def test_split_usage_limit_cancels_every_active_request(self):
        with tempfile.TemporaryDirectory() as directory:
            service = module.RecordedService(Path(directory));service.local.run_id='limited'
            first, second = threading.Event(), threading.Event()
            service.active.update((first,second))
            def process(command,cancel,**kwargs):
                kwargs['on_output']('stderr','Usage li')
                kwargs['on_output']('stderr','mit reached')
                return SimpleNamespace(seconds=0.1,returncode=0)
            try:
                with patch.object(module.DesignerService, '_process', side_effect=process):
                    service._process(['python','--worker','job'],first)
                self.assertTrue(service.usage_limited.is_set())
                self.assertTrue(first.is_set());self.assertTrue(second.is_set())
            finally:
                service.active.clear();service.close()


if __name__ == '__main__':
    unittest.main()
