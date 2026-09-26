"""Ashot's live failures: request binding, zero edits, and cheap scope routing."""
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import designer_service as api

class LiveRegressions(unittest.TestCase):
    def test_another_option_retries_latest_request_even_if_it_never_entered_model_history(self):
        resolve = getattr(api, 'resolve_followup', None)
        self.assertIsNotNone(resolve)
        history = ['yes, try double bed in the bedroom instead', 'Furnish the living room']
        request, variant = resolve('Show me another option', history)
        self.assertEqual(request, 'Furnish the living room')
        self.assertEqual(variant, 1)
        self.assertEqual(resolve('Show me another option', history + ['Show me another option']), (request, 2))
        self.assertEqual(resolve('Paint the apartment red', history), ('Paint the apartment red', 0))
        self.assertEqual(resolve('Show me another option', []), ('Show me another option', 0))
        request, _ = resolve('What would it cost?', history)
        self.assertIn('Furnish the living room', request)
        self.assertNotIn('bedroom', request)

    def test_destroy_wall_is_zero_process_and_stays_in_request_history(self):
        service = api.DesignerService(profile={'fast_path':True})
        try:
            with patch.object(service, '_process', side_effect=AssertionError('no bridge or model')):
                request = 'destroy the wall between the kitchen and the other room'
                reply = service.propose({'scene':{'format':'varpet.editor'},'revision':0,'request':request},threading.Event(),lambda _:None)
            self.assertEqual(reply['type'],'decline')
            self.assertEqual(service.conversations[reply['conversationId']].customer_requests, [request])
        finally: service.close()

    def test_empty_native_proposal_never_crosses_editor_bridge(self):
        class Service(api.DesignerService):
            def _process(self, command, cancel, *, env=None, on_output=None):
                if 'to-designer' in command:
                    Path(command[command.index('to-designer')+2]).write_text(json.dumps({'rooms':[], 'items':[]}))
                elif 'to-command' in command:
                    raise AssertionError('An empty proposal must become a message before translation')
                else:
                    Path(env['VARPET_PROPOSALS_DIR'],'p.json').write_text(json.dumps({'id':'p','ops':[],'rationale':'Nothing changed.'}))
                    on_output('stdout',json.dumps({'kind':'worker_summary','status':'completed','response':'There is nothing to rearrange. I can furnish the room instead.'})+'\n')
                return SimpleNamespace(returncode=0,stdout='',stderr='')
        service=Service(profile={'fast_path':False})
        try:
            reply=service.propose({'scene':{'format':'varpet.editor'},'revision':0,'request':'Make the living room feel bigger'},threading.Event(),lambda _:None)
            self.assertEqual(reply['type'],'message')
            self.assertNotIn('proposal',reply)
            self.assertIn('furnish',reply['message'])
        finally: service.close()

class FollowupModifiers(unittest.TestCase):
    def test_another_option_keeps_latest_warmer_request(self):
        request, variant = api.resolve_followup('Show me another option', ['Furnish the living room','Make it warmer'])
        self.assertIn('Make it warmer', request)
        self.assertIn('Furnish the living room', request)
        self.assertEqual(variant, 1)

class ServiceFollowupHistory(unittest.TestCase):
    def test_failed_furnish_after_successful_bed_is_the_next_worker_task(self):
        jobs=[]
        class Service(api.DesignerService):
            def _process(self, command, cancel, *, env=None, on_output=None):
                if 'to-designer' in command:
                    Path(command[command.index('to-designer')+2]).write_text(json.dumps({'rooms':[], 'items':[]}))
                elif 'to-command' in command:
                    index=command.index('to-command')
                    Path(command[index+4]).write_text(json.dumps({'id':'p','title':'Move bed','description':'Move the bed.',
                        'command':{'id':'p','label':'Move bed','source':'designer','baseRevision':0,
                            'operations':[{'type':'update','id':'bed','patch':{'position':[1,0,1]}}]}}))
                else:
                    job=json.loads(Path(command[-1]).read_text());jobs.append(job)
                    if len(jobs)==1:
                        Path(env['VARPET_PROPOSALS_DIR'],'p.json').write_text(json.dumps({'id':'p','ops':[{'type':'move','id':'bed','pos':[1,1]}],'rationale':'Move the bed.'}))
                    on_output('stdout',json.dumps({'kind':'worker_summary','status':'completed','response':'Could not find a checked option.'})+'\n')
                return SimpleNamespace(returncode=0,stdout='',stderr='')
        service=Service(profile={'fast_path':True})
        try:
            base={'scene':{'format':'varpet.editor'},'revision':0}
            first=service.propose({**base,'request':'Move the bed'},threading.Event(),lambda _:None)
            self.assertEqual(first['type'],'proposal')
            base['conversationId']=first['conversationId']
            second=service.propose({**base,'request':'Furnish the living room'},threading.Event(),lambda _:None)
            self.assertEqual(second['type'],'message')
            service.propose({**base,'request':'Show me another option'},threading.Event(),lambda _:None)
            self.assertEqual(jobs[-1]['request'],'Furnish the living room')
            self.assertEqual(jobs[-1]['variant'],1)
            self.assertEqual(jobs[-1]['excluded_ops'],[])
            self.assertTrue(jobs[-1]['discover_catalog'])
        finally: service.close()
