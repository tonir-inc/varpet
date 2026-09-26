"""RPC-boundary regressions using the portal M6 document and a 900-item catalog."""
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import designer
import designer_fast
from designer_service import DesignerService

ROOT = Path(__file__).resolve().parents[1]

class ContextTests(unittest.TestCase):
    def test_catalog_prefix_and_product_legend_are_bounded(self):
        prefix=designer.catalog_instructions({'catalog_prefix':'catalog-data'*200000},'STATIC RULES')
        self.assertLess(len(json.dumps(prefix)),100000)
        candidate={'id':'a','catalog_ids':[],'score':1,'scores':{},'description':'Chair'}
        with self.assertRaises(ValueError):
            designer_fast.selection_prompt('Add a chair',{'recipe':'Choose','candidates':[candidate]},'legend'*200000)

    def sdk_turn(self, scene, **extra):
        sdk, generated = ModuleType('openai_codex'), ModuleType('openai_codex.generated.v2_all')
        generated.ReasoningEffort = lambda value: value
        generated.ListMcpServerStatusResponse = object
        thread = Mock(id='bounded-test')
        event = SimpleNamespace(method='turn/completed', payload=SimpleNamespace(model_dump=lambda **_: {'turn': {'status':'completed'}}))
        thread.turn.return_value.stream.return_value = [event]
        client = Mock(); client.thread_start.return_value = client.thread_resume.return_value = thread
        client._client.request.return_value = SimpleNamespace(data=[], next_cursor=None)
        sdk.Codex = Mock(); sdk.Codex.return_value.__enter__ = Mock(return_value=client); sdk.Codex.return_value.__exit__ = Mock(return_value=False)
        sdk.CodexConfig = lambda **kwargs: kwargs
        sdk.ApprovalMode = SimpleNamespace(deny_all='deny_all'); sdk.Sandbox = SimpleNamespace(read_only='read_only')
        sdk.LocalImageInput = lambda path: ('image',path); sdk.TextInput = lambda text: ('text',text)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); source=root/'scene.json'; source.write_text(json.dumps(scene))
            runtime={'scene':str(source),'state':str(root/'thread.json'),'workspace':directory,'home':directory}
            job=root/'job.json'; job.write_text(json.dumps({'runtime':runtime,'request':'Explain this apartment briefly.','profile':{'placement':'without-place','context':'compact-base','fast_path':False},**extra}))
            with patch.dict(sys.modules,{'openai_codex':sdk,'openai_codex.generated.v2_all':generated}), patch.object(designer,'_forward_sdk_stderr'), patch.object(designer,'_isolate_skills'), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(designer.sdk_worker(job),0)
            self.assertEqual(json.loads(source.read_text()),scene)
            return thread.turn.call_args.args[0], sdk.Codex.call_args.args[0]

    def test_portal_m6_fallback_does_not_inline_plan_or_900_product_catalog(self):
        scene=json.loads((ROOT/'apartments/m6-12-54/scene.json').read_text())
        self.assertGreater(len(json.dumps(scene)),1048576)
        catalog=[{'id':f'sku-{i}','name':'Oak chair','kind':'chair','dimensions':[.5,.8,.5],'source':{'type':'gltf','url':'https://example.com/'+('model-data'*1000)},'price':30000} for i in range(900)]
        payload,config=self.sdk_turn(scene,conversion_error='Unsupported entrance metadata',catalog=catalog)
        self.assertLess(len(json.dumps(payload)),250000)
        self.assertNotIn('data:image',payload); self.assertNotIn('model-data',payload)
        self.assertNotIn('"project"',payload); self.assertNotIn('"assumptions"',payload)
        self.assertIn(scene['rooms'][0]['id'],payload)
        self.assertTrue(any('"enabled" = false' in x for x in config['config_overrides']))

    def test_large_designer_scene_is_bounded_and_disables_edits_when_incomplete(self):
        scene={'rooms':[{'id':f'room-{i}','name':'room','polygon':[[0,0],[4,0],[4,4],[0,4]]} for i in range(10000)],'walls':[],'openings':[],'items':[],'fixed':[]}
        payload,config=self.sdk_turn(scene)
        self.assertLess(len(json.dumps(payload)),250000)
        self.assertIn('incomplete',payload.lower())
        self.assertTrue(any('"enabled" = false' in x for x in config['config_overrides']))

    def test_fast_selection_bounds_candidates_descriptions_and_nested_scores(self):
        candidate={'id':'slot-a','catalog_ids':['sku-a'],'score':1,'scores':{'open_floor':1,'junk':'x'*200000},'description':'Warm chair '*10000}
        prompt=designer_fast.selection_prompt('Add a chair',{'recipe':'Choose a chair','candidates':[candidate]*1000})
        self.assertLess(len(json.dumps(prompt)),250000)
        self.assertNotIn('junk',prompt)
        self.assertIn('slot-a',prompt)

    def test_service_passes_full_catalog_by_file_reference(self):
        service=DesignerService(); self.addCleanup(service.close)
        catalog=[{'id':f'sku-{i}','name':'Chair','dimensions':[.5,.8,.5]} for i in range(900)]
        def process(command,cancel,**kwargs):
            if 'to-designer' in command: Path(command[command.index('to-designer')+2]).write_text('{"rooms":[]}')
            else:
                job=json.loads(Path(command[-1]).read_text())
                self.assertNotIn('catalog',job)
                self.assertEqual(json.loads(Path(job['catalog_path']).read_text()),catalog)
                self.assertEqual(json.loads(Path(job['editor_scene_path']).read_text())['format'],'varpet.editor')
                kwargs['on_output']('stdout',json.dumps({'kind':'worker_summary','status':'completed','response':'Hello.'})+'\n')
        import threading
        with patch.object(service,'_process',process):
            self.assertEqual(service.propose({'scene':{'format':'varpet.editor'},'catalog':catalog,'revision':0,'request':'Hello'},threading.Event(),lambda _:None)['type'],'message')

    def test_request_limit_and_complete_native_geometry(self):
        from designer_context import model_scene, turn_prompt, validate_request_text
        validate_request_text('a'*16000)
        with self.assertRaises(ValueError): validate_request_text('a'*16001)
        native={'rooms':[{'id':'r','name':'Room','polygon':[[0,0],[4,0],[4,4],[0,4]]}],
                'walls':[], 'openings':[], 'items':[], 'fixed':[], 'north_deg':35}
        view,limited=model_scene(native)
        self.assertFalse(limited);self.assertEqual(view,native)
        self.assertLess(len(json.dumps(turn_prompt(view,'a'*16000,'🎨'*8000))),250000)

    def test_catalog_reference_preserves_purchase_provenance(self):
        from designer_context import load_catalog
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'catalog.json'; assets=[{'id':'sku','price':100}];path.write_text(json.dumps(assets))
            job={'request':'Add a chair','catalog_path':str(path),'catalogCurrency':'AMD'}
            self.assertTrue(designer_fast.purchase_context_known(job))
            self.assertEqual(load_catalog(job),assets)
            self.assertFalse(designer_fast.purchase_context_known({**job,'catalogCurrency':'USD'}))
