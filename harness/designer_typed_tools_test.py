import unittest
from pathlib import Path
import designer
import designer_typed_tools as subject
import tempfile
import json

class TypedToolsTest(unittest.TestCase):
    def test_code_execution_disabled_and_only_typed_tools_exposed(self):
        config=designer.build_config(Path('/tmp/scene.json'))
        for name in ('code_mode_host','code_mode','code_mode_only','unified_exec','shell_tool'):
            self.assertIs(config['features'][name],False)
        subject.configure(config)
        server=config['mcp_servers']['varpet-designer']
        self.assertEqual(server['env']['VARPET_DESIGNER_TYPED_TOOLS'],'1')
        self.assertIn('plan_room',server['enabled_tools'])
        self.assertNotIn('set_intent',server['enabled_tools'])
        self.assertNotIn('check_layout',server['enabled_tools'])

    def test_private_model_catalog_overrides_metadata_without_changing_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            source=Path(tmp)/'models.json'
            original={'models':[{'slug':designer.MODEL,'tool_mode':'code_mode_only','supports_search_tool':True,'context_window':272000}]}
            source.write_text(json.dumps(original))
            path,audit=subject.direct_catalog({'home':tmp,'model_catalog':str(source)},designer.MODEL)
            self.assertEqual(json.loads(source.read_text()),original)
            row=json.loads(Path(path).read_text())['models'][0]
            self.assertEqual(row['tool_mode'],'direct')
            self.assertFalse(row['supports_search_tool'])
            self.assertEqual(row['context_window'],272000)
            self.assertEqual(audit['original_tool_mode'],'code_mode_only')

    def test_discovery_runs_only_without_prepared_catalog_and_still_requires_the_model(self):
        calls=[]
        def discover():
            calls.append(1);return {'models':[{'slug':designer.MODEL,'tool_mode':'code_mode'}]}
        with tempfile.TemporaryDirectory() as tmp:
            path,audit=subject.direct_catalog({'home':tmp},designer.MODEL,discover=discover)
            self.assertEqual(len(calls),1)
            self.assertEqual(json.loads(Path(path).read_text())['models'][0]['tool_mode'],'direct')
            self.assertEqual(audit['original_tool_mode'],'code_mode')
            source=Path(tmp)/'models.json';source.write_text(json.dumps({'models':[{'slug':designer.MODEL}]}))
            subject.direct_catalog({'home':tmp,'model_catalog':str(source)},designer.MODEL,discover=discover)
            self.assertEqual(len(calls),1)
            with self.assertRaises(ValueError):
                subject.direct_catalog({'home':tmp},designer.MODEL,discover=lambda:{'models':[{'slug':'other'}]})

    def test_terminal_receipt_requires_durable_checked_unapplied_proposal(self):
        with tempfile.TemporaryDirectory() as tmp:
            event={'method':'item/completed','payload':{'item':{'type':'mcpToolCall','server':'varpet-designer','tool':'propose','status':'completed','result':{'content':[{'type':'text','text':json.dumps({'ok':True,'proposal_id':'proposal-1'})}]}}}}
            self.assertIsNone(subject.saved_receipt(event,tmp))
            proposal={'id':'proposal-1','ops':[{'type':'remove','id':'chair'}],'checks':{'ok':True},'request_check':{'ok':True},'requires_user_acceptance':True,'application_status':'not_applied','rationale':'Ready for review.'}
            path=Path(tmp)/'proposal-1.json';path.write_text(json.dumps(proposal))
            self.assertEqual(subject.saved_receipt(event,tmp)['proposal'],proposal)
            proposal['checks']['ok']=False;path.write_text(json.dumps(proposal))
            self.assertIsNone(subject.saved_receipt(event,tmp))
