import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
import designer_service
from designer_builds_test import slot

class BuildServiceTests(unittest.TestCase):
    def test_service_starts_builders_and_joins_before_final_asset_delivery(self):
        self.check_build_delivery(empty=False)

    def test_empty_build_translation_returns_reply_not_zero_operation_command(self):
        self.check_build_delivery(empty=True)

    def check_build_delivery(self, *, empty):
        import designer_builds
        started=threading.Event()
        def build(value,work,images,cancel,emit):
            started.set();(work/'piece.glb').write_bytes(b'compiled');return {'status':'ok','actual_wdh_m':[.5,.4,.65]}
        pool=designer_builds.BuildPool(run_piece=build)
        service=designer_service.DesignerService();self.addCleanup(service.close)
        self.assertTrue(hasattr(service,'build_pool'),'Service has no builder controller')
        service.build_pool.close();service.build_pool=pool
        def process(command,cancel,**kwargs):
            if 'to-designer' in command:
                at=command.index('to-designer');Path(command[at+2]).write_text(json.dumps({'rooms':[],'walls':[],'openings':[],'items':[],'fixed':[]}));return
            if 'to-command' in command:
                at=command.index('to-command')
                self.assertTrue(started.is_set());self.assertIn('--custom-assets',command)
                assets=json.loads(Path(command[command.index('--custom-assets')+1]).read_text())
                self.assertEqual(assets[0]['source']['type'],'gltf')
                Path(command[at+4]).write_text(json.dumps({'id':'p','title':'Custom cabinet','description':'Workshop confirms the estimate.','command':{'id':'cmd','source':'designer','label':'Preview','baseRevision':0,'operations':[] if empty else [{'type':'add','object':{'id':'cabinet','name':'Cabinet','assetId':assets[0]['id'],'position':[1,0,-1],'rotation':0,'scale':[1,1,1]}}]}}));return
            env=kwargs['env'];record=slot(Path(env['VARPET_BUILDS_DIR']),1,turn=env['VARPET_TURN_ID'],conversation=env['VARPET_CONVERSATION_ID'])
            self.assertTrue(started.wait(3),'Builder did not start while the designer was still running')
            Path(env['VARPET_PROPOSALS_DIR'],'p.json').write_text(json.dumps({'id':'p','rationale':'Workshop confirms the estimate.','ops':[{'type':'add','item':{'sku':record['slotId']}}],'score':{},'assets':[record['asset']]}))
            kwargs['on_output']('stdout',json.dumps({'kind':'worker_summary','status':'completed','response':'Preview the cabinet.'})+'\n')
        with patch.object(service,'_process',process):
            reply=service.propose({'scene':{'format':'varpet.editor'},'revision':0,'request':'Generic custom cabinet'},threading.Event(),lambda _:None)
        if empty:
            self.assertEqual(reply['type'],'message')
            self.assertIn('no checked change',reply['message'])
            self.assertNotIn('proposal',reply)
            self.assertNotIn('command',reply)
        else:
            self.assertEqual(reply['type'],'proposal');self.assertEqual(reply['assets'][0]['dimensions'],[.5,.65,.4]);self.assertEqual(reply['assets'][0]['source']['type'],'gltf')
            self.assertEqual(len(reply['proposal']['command']['operations']),1)
