import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
from designer_service import DesignerService

class ConversionFallbackTests(unittest.TestCase):
    def test_failed_conversion_answers_and_discloses_once_per_conversation(self):
        service = DesignerService(profile={'fast_path': True})
        self.addCleanup(service.close)
        jobs = []
        def process(command, cancel, **kwargs):
            if 'to-designer' in command:
                raise RuntimeError('Unsupported elevation on room')
            job = json.loads(Path(command[-1]).read_text()); jobs.append(job)
            self.assertTrue(job.get('conversion_error'))
            self.assertEqual(json.loads(Path(job['runtime']['scene']).read_text())['format'], 'varpet.editor')
            kwargs['on_output']('stdout', json.dumps({'kind':'worker_summary', 'status':'completed', 'response':'Sage is a calm colour.'}) + '\n')
        body = {'scene': {'format':'varpet.editor'}, 'revision':0, 'request':'Why sage?'}
        with patch.object(service, '_process', process):
            first = service.propose(body, threading.Event(), lambda _: None)
            second = service.propose({**body, 'conversationId':first['conversationId']}, threading.Event(), lambda _: None)
        self.assertEqual(first['type'], 'message')
        self.assertIn('Sage', first['message'])
        self.assertIn('layout', first['message'].lower())
        self.assertEqual(second['message'], 'Sage is a calm colour.')

    def test_cancellation_does_not_fall_back(self):
        service = DesignerService(); self.addCleanup(service.close)
        cancel = threading.Event(); cancel.set()
        with self.assertRaisesRegex(RuntimeError, 'cancelled'):
            service.propose({'scene':{'format':'varpet.editor'}, 'revision':0, 'request':'Hello'}, cancel, lambda _:None)

    def test_worker_bypasses_fast_path_and_disables_layout_mcp(self):
        import sys
        import tempfile
        import types
        import designer
        import designer_fast
        captured = {}
        class ReachedSDK(Exception):
            pass
        def config(**kwargs):
            captured.update(kwargs)
            return kwargs
        def codex(_):
            raise ReachedSDK()
        sdk = types.ModuleType('openai_codex')
        for key, value in dict(Codex=codex, CodexConfig=config, ApprovalMode=object(), Sandbox=object(), LocalImageInput=object(), TextInput=object()).items():
            setattr(sdk, key, value)
        generated = types.ModuleType('openai_codex.generated.v2_all'); generated.ReasoningEffort = object()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = designer.prepare_runtime(root / 'runtime', {'format':'varpet.editor'})
            job = root / 'job.json'
            job.write_text(json.dumps({'runtime':runtime, 'request':'Why sage?', 'conversion_error':'Unsupported elevation', 'profile':{'fast_path':True}}))
            with patch.dict(sys.modules, {'openai_codex':sdk, 'openai_codex.generated.v2_all':generated}), patch.object(designer, '_forward_sdk_stderr'), patch.object(designer_fast, 'run') as fast:
                with self.assertRaises(ReachedSDK):
                    designer.sdk_worker(job)
                fast.assert_not_called()
            settings = captured['config_overrides']
            mcp = next(value for value in settings if value.startswith('mcp_servers='))
            self.assertIn('"enabled" = false', mcp)
