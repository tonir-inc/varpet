"""Unit-only replacements verify telemetry; live benchmark uses unmodified real workers."""
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('komitas_service',Path(__file__).with_name('komitas-service.py'))
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Telemetry(unittest.TestCase):
    def test_turn_usage_is_delta_and_same_conversation_survives_error(self):
        with tempfile.TemporaryDirectory() as directory:
            service=m.Service(Path(directory),[])
            conversation=SimpleNamespace(usage={'totalTokens':100},usage_known=True)
            service.conversations['actual-thread']=conversation
            def fail(_body,_cancel,_progress):
                service.local.run_id='test'
                conversation.usage={'totalTokens':160}
                raise RuntimeError('bridge rejected proposal')
            try:
                with patch.object(m.module.VisionService,'propose',side_effect=fail):
                    reply=service.propose({'conversationId':'actual-thread'},threading.Event(),lambda _:None)
                self.assertEqual(reply['conversationId'],'actual-thread')
                self.assertEqual(reply['type'],'error')
                records=[json.loads(line) for line in (Path(directory)/'test.events.jsonl').read_text().splitlines()]
                self.assertEqual(records[-1]['usage'],{'totalTokens':60})
            finally:service.close()

    def test_unmeasured_previous_turn_is_not_charged_to_next(self):
        with tempfile.TemporaryDirectory() as directory:
            service=m.Service(Path(directory),[])
            conversation=SimpleNamespace(usage={'totalTokens':100},usage_known=False)
            service.conversations['actual-thread']=conversation
            def succeed(_body,_cancel,_progress):
                service.local.run_id='test'
                conversation.usage={'totalTokens':250};conversation.usage_known=True
                return {'type':'question','conversationId':'actual-thread','question':'Which room?'}
            try:
                with patch.object(m.module.VisionService,'propose',side_effect=succeed):
                    service.propose({'conversationId':'actual-thread'},threading.Event(),lambda _:None)
                record=json.loads((Path(directory)/'test.events.jsonl').read_text())
                self.assertIsNone(record['usage'])
            finally:service.close()

if __name__=='__main__':unittest.main()
