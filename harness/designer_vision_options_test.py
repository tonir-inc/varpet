"""Opt-in visuals are fresh, bounded and never enabled by a plain request."""
import base64
import tempfile
import unittest
from pathlib import Path
import designer_vision as vision

PNG = 'data:image/png;base64,' + base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'fixture').decode()

class VisionOptionsTests(unittest.TestCase):
    def test_default_does_not_add_work(self):
        self.assertEqual(vision.validate_vision({}, {'id':'flat'}, 2, 'Move chair'), {})

    def test_snapshot_revision_is_checked(self):
        with self.assertRaisesRegex(ValueError, 'revision'):
            vision.validate_vision({'view':{'dataUrl':PNG,'sceneId':'flat','revision':1}}, {'id':'flat'}, 2, 'this corner')

    def test_plan_and_view_become_separate_turn_images(self):
        opt=vision.validate_vision({'view':{'dataUrl':PNG,'sceneId':'flat','revision':2},'plan':{'dataUrl':PNG}}, {'id':'flat'}, 2, 'cozy')
        with tempfile.TemporaryDirectory() as tmp:
            paths=vision.materialize_images(opt, Path(tmp))
            self.assertEqual(len(paths),2)
            self.assertTrue(all(Path(path).is_file() for path in paths))

    def test_self_check_is_style_only(self):
        with self.assertRaisesRegex(ValueError, 'style'):
            vision.validate_vision({'selfCheck':True}, {'id':'flat'}, 2, 'Move chair 1 metre')
        self.assertTrue(vision.validate_vision({'selfCheck':True}, {'id':'flat'}, 2, 'Make it minimalistic but cozy')['selfCheck'])

    def test_rejects_urls_types_and_oversize(self):
        for value in [{'products':'yes'},{'view':{'dataUrl':'https://example.com/a.png','sceneId':'flat','revision':2}}, {'unknown':True}, {'plan':{'dataUrl':PNG+'A'*3_000_000}}]:
            with self.assertRaises(ValueError):vision.validate_vision(value, {'id':'flat'}, 2, 'cozy')

class ConfirmationBudgetTests(unittest.TestCase):
    def test_render_timeout_withholds_proposal_without_starting_model(self):
        import threading
        from types import SimpleNamespace
        from unittest.mock import patch
        import designer
        service=SimpleNamespace(worker_command=['worker'])
        result=SimpleNamespace(seconds=20,returncode=-15,deadline_exceeded=True,usage_limited=False,cancelled=False,stderr='')
        with tempfile.TemporaryDirectory() as tmp, patch.object(designer,'watch_process',return_value=result) as process:
            ok,evidence=vision.confirm_proposal(service,{'scene':{},'catalog':[],'request':'cozy'},{'description':'preview'},Path(tmp),threading.Event(),lambda _:None)
        self.assertFalse(ok)
        self.assertEqual(process.call_count,1)
        self.assertEqual(evidence['render_seconds'],20)
        self.assertIn('deadline',process.call_args.kwargs)

    def test_limit_and_cancel_propagate_instead_of_becoming_a_confirmation(self):
        import threading
        from types import SimpleNamespace
        from unittest.mock import patch
        import designer
        result=SimpleNamespace(seconds=1,returncode=0,deadline_exceeded=False,usage_limited=True,cancelled=False,stderr='usage limit')
        with tempfile.TemporaryDirectory() as tmp, patch.object(designer,'watch_process',return_value=result):
            with self.assertRaisesRegex(RuntimeError,'usage limit'):
                vision.confirm_proposal(SimpleNamespace(worker_command=['worker']),{'scene':{},'request':'cozy'},{'description':'preview'},Path(tmp),threading.Event(),lambda _:None)

    def test_model_cannot_overwrite_measured_confirmation_telemetry(self):
        import json,threading
        from types import SimpleNamespace
        from unittest.mock import patch
        import designer
        rendered=SimpleNamespace(seconds=2,returncode=0,deadline_exceeded=False,usage_limited=False,cancelled=False,stderr='')
        output={'kind':'worker_summary','status':'completed','response':json.dumps({'accept':True,'reason':'Matches','observations':['Visible neutral chair'],'seconds':-1,'tokens':0,'render_seconds':0,'status':'fake'}),'total_usage':{'totalTokens':123}}
        checked=SimpleNamespace(seconds=3,returncode=0,deadline_exceeded=False,usage_limited=False,cancelled=False,stdout=json.dumps(output),stderr='')
        with tempfile.TemporaryDirectory() as tmp,patch.object(designer,'watch_process',side_effect=[rendered,checked]),patch.object(designer,'prepare_runtime',return_value={}):
            ok,evidence=vision.confirm_proposal(SimpleNamespace(worker_command=['worker']),{'scene':{},'request':'cozy'},{'description':'preview'},Path(tmp),threading.Event(),lambda _:None)
        self.assertTrue(ok);self.assertEqual(evidence['tokens'],123);self.assertEqual(evidence['render_seconds'],2);self.assertEqual(evidence['model_seconds'],3);self.assertEqual(evidence['status'],'confirmed')
