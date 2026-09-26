import threading
import unittest
from unittest.mock import patch
from designer_service import DesignerService
class ScopeServiceTest(unittest.TestCase):
    def test_scope_decline_needs_no_bridge_catalog_or_model_process(self):
        service=DesignerService(profile={'fast_path':True})
        try:
            with patch.object(service,'_process',side_effect=AssertionError('must be zero-process')):
                reply=service.propose({'scene':{'format':'varpet.editor'},'revision':0,'request':'Knock down the wall between the kitchen and the living room'},threading.Event(),lambda _:None)
            self.assertEqual(reply['type'],'decline')
            self.assertIn('structural',reply['message'])
            self.assertIn('furniture',reply['message'])
            self.assertEqual(service.conversations[reply['conversationId']].usage['totalTokens'],0)
        finally:service.close()

    def test_scope_option_false_and_compound_request_preserve_general_dispatch(self):
        for enabled,request in [(False,'Knock down the wall between the kitchen and the living room'),(True,'Knock down the wall between the kitchen and the living room and paint the bedroom')]:
            service=DesignerService(profile={'fast_path':enabled})
            try:
                with patch.object(service,'_process',side_effect=RuntimeError('general dispatch')):
                    with self.assertRaisesRegex(RuntimeError,'general dispatch'):
                        service.propose({'scene':{'format':'varpet.editor'},'revision':0,'request':request},threading.Event(),lambda _:None)
            finally:service.close()
