"""Opt-in customer events cross the actual service/socket boundary without raw SDK payloads."""
import http.client
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
from designer_service import DesignerService, make_server, validate_request


def sdk(method, name='search_catalog', **extra):
    item = {'id':'call-1','type':'mcpToolCall','server':'varpet-designer','tool':name,
            'arguments':{'secret':'private image data'}, **extra}
    return {'method':method,'payload':{'item':item}}

class EventTests(unittest.TestCase):
    def test_real_build_pool_callback_reaches_service_before_final_answer(self):
        from designer_builds_test import slot
        import time
        for enabled in (False,True):
            service=DesignerService();self.addCleanup(service.close);output=[]
            def build(value,work,images,cancel,emit):
                emit('fixing');(work/'piece.glb').write_bytes(b'glTFsample')
                return {'status':'ok','actual_wdh_m':value['size_wdh_m']}
            service.build_pool.run_piece=build
            def process(command,cancel,**kw):
                if 'to-designer' in command:Path(command[command.index('to-designer')+2]).write_text('{}');return
                env=kw['env'];root=Path(env['VARPET_BUILDS_DIR'])
                value=slot(root,1,turn=env['VARPET_TURN_ID'],conversation=env['VARPET_CONVERSATION_ID'])
                state=root/'states'/f"{value['slotId']}.json";deadline=time.monotonic()+3
                while time.monotonic()<deadline:
                    if state.exists() and json.loads(state.read_text()).get('state')=='done':break
                    time.sleep(.01)
                else:self.fail('Real controller did not finish the injected builder')
                kw['on_output']('stdout',json.dumps({'kind':'worker_summary','status':'completed','response':'Your cabinet is ready.'})+'\n')
            body={'scene':{'format':'varpet.editor'},'revision':0,'request':'Build a cabinet','events':enabled}
            with patch.object(service,'_process',process):final=service.propose(body,threading.Event(),output.append)
            builds=[value for value in output if isinstance(value,dict) and value['type']=='build']
            self.assertEqual([e['state'] for e in builds],['queued','building','fixing','done'] if enabled else [])
            self.assertEqual(final['type'],'message')
            self.assertTrue(any(isinstance(v,str) and 'Custom piece' in v for v in output))

    def test_checked_paint_does_not_claim_placement_and_quote_keeps_provenance(self):
        from designer_events import DesignerEvents
        records=[]
        events=DesignerEvents(records.append,True)
        saved={'id':'p','ops':[{'type':'set_color','id':'chair'}],'checks':{'ok':True,'price':{'cost_dram':1234,'currency':'AMD','basis':'incremental_purchases'}}}
        events.checked(saved)
        self.assertEqual([r['name'] for r in records],['check_layout','quote'])
        self.assertEqual(records[-1]['refs']['price_source'],'unknown')
        records.clear();saved['ops']=[{'type':'add','item':{'id':'chair'}}];events.checked(saved)
        self.assertEqual([r['name'] for r in records],['place','check_layout','quote'])

    def request(self, enabled=None, events=None):
        service=DesignerService(); self.addCleanup(service.close); output=[]
        def process(command,cancel,**kw):
            if 'to-designer' in command: Path(command[command.index('to-designer')+2]).write_text('{}')
            else:
                for event in events or [sdk('item/started'),sdk('item/completed',status='completed',result={'content':[{'type':'text','text':json.dumps({'items':[{'sku':'sku-1','private':'secret'}]})}]})]:
                    kw['on_output']('stdout',json.dumps(event)+'\n')
                kw['on_output']('stdout',json.dumps({'kind':'worker_summary','status':'completed','response':'Here are the options.'})+'\n')
        body={'scene':{'format':'varpet.editor'},'revision':0,'request':'Find a cabinet'}
        if enabled is not None:body['events']=enabled
        with patch.object(service,'_process',process): final=service.propose(body,threading.Event(),output.append)
        return [v for v in output if isinstance(v,dict)],final

    def test_events_are_strict_boolean_and_off_by_default(self):
        body={'scene':{'format':'varpet.editor'},'revision':0,'request':'Hi','events':'true'}
        with self.assertRaisesRegex(ValueError,'events'):validate_request(body)
        self.assertEqual(self.request()[0],[]);self.assertEqual(self.request(False)[0],[])

    def test_opt_in_projects_search_and_candidates_without_private_payloads(self):
        records,final=self.request(True)
        self.assertEqual([(r['name'],r['phase']) for r in records],[('search_catalog','start'),('search_catalog','end'),('show_candidates','end')])
        self.assertEqual(records[-1]['refs']['results'],['sku-1']);self.assertEqual(final['type'],'message')
        self.assertNotIn('secret',json.dumps(records));self.assertNotIn('arguments',json.dumps(records))

    def test_real_catalog_result_shape_emits_product_references(self):
        records,_=self.request(True,[sdk('item/completed',status='completed',result={'structuredContent':{'results':[{'sku':'real-sku'}]}})])
        self.assertEqual(records[-1]['name'],'show_candidates')
        self.assertEqual(records[-1]['refs']['results'],['real-sku'])

    def test_failed_tools_emit_error_and_no_candidate_success(self):
        records,_=self.request(True,[sdk('item/started'),sdk('item/completed',status='completed',result={'isError':True,'content':[{'type':'text','text':'/private/path failure'}]})])
        self.assertEqual([r['phase'] for r in records],['start','error'])
        self.assertNotIn('/private',json.dumps(records))

    def test_non_designer_and_reasoning_events_do_not_leak(self):
        other=sdk('item/completed',server='other-server',result={'secret':'private'})
        records,_=self.request(True,[other,{'method':'item/started','payload':{'item':{'type':'reasoning','text':'private'}}}])
        self.assertEqual(records,[])

    def test_http_build_events_are_nonterminal_and_opt_in(self):
        class Stub:
            progress_interval=.01
            def propose(self,body,cancel,emit):
                emit({'type':'tool','name':'build_piece','phase':'end','summary':'Build queued','refs':{'slotId':'custom-c-1'}})
                for state in ['queued','building','fixing','failed']:
                    emit({'type':'build','slotId':'custom-c-1','state':state,**({'reason':'Choose a catalog alternative'} if state=='failed' else {})})
                return {'type':'message','conversationId':'c','message':'Choose another option.'}
        server=make_server(Stub(),0);worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        try:
            for enabled in [False,True]:
                conn=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3)
                body={'scene':{'format':'varpet.editor'},'revision':0,'request':'Build','events':enabled}
                conn.request('POST','/designer/propose',json.dumps(body),{'Content-Type':'application/json'})
                response=conn.getresponse();records=[json.loads(line) for line in response.read().splitlines()];conn.close()
                self.assertEqual(records[-1]['type'],'message')
                self.assertEqual(len([r for r in records if r['type']=='build']),4 if enabled else 0)
        finally:server.shutdown();server.server_close();worker.join()

class AssetRouteTests(unittest.TestCase):
    def test_only_known_successful_conversation_glb_is_served(self):
        from designer_service import Conversation
        import tempfile
        with tempfile.TemporaryDirectory() as root:
            service=DesignerService(); self.addCleanup(service.close)
            conversation=Conversation(Path(root)/'c1');service.conversations['c1']=conversation
            work=conversation.root/'builds/work/custom-c1-1';work.mkdir(parents=True)
            (work/'piece.glb').write_bytes(b'glTFsample')
            states=conversation.root/'builds/states';states.mkdir()
            state=states/'custom-c1-1.json';state.write_text(json.dumps({'type':'build','slotId':'custom-c1-1','state':'done','glb':'/designer/files/c1/custom-c1-1.glb'}))
            server=make_server(service,0);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                for path,status in [('/designer/files/c1/custom-c1-1.glb',200),('/designer/files/other/custom-c1-1.glb',404),('/designer/files/c1/../runtime/secret',404),('/designer/files/c1/custom-c1-2.glb',404)]:
                    conn=http.client.HTTPConnection('127.0.0.1',server.server_port);conn.request('GET',path);reply=conn.getresponse();data=reply.read();conn.close()
                    self.assertEqual(reply.status,status)
                    if status==200:self.assertEqual(data,b'glTFsample');self.assertEqual(reply.getheader('Content-Type'),'model/gltf-binary')
                state.write_text(json.dumps({'state':'failed'}))
                conn=http.client.HTTPConnection('127.0.0.1',server.server_port);conn.request('GET','/designer/files/c1/custom-c1-1.glb');reply=conn.getresponse();reply.read();conn.close();self.assertEqual(reply.status,404)
            finally:server.shutdown();server.server_close();thread.join()
