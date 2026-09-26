import importlib
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest


def module(name):
    assert importlib.util.find_spec(name) is not None, f'{name}: picture builder boundary is missing'
    return importlib.import_module(name)


def slot(root, n, turn='t1', conversation='c1'):
    sid=f'custom-{conversation}-{n}'
    value={'slotId':sid,'conversationId':conversation,'turnId':turn,'source':'custom','kind':'cabinet','size_wdh_m':[.5,.4,.65],
           'note':'Generic white cabinet','proposed':True,'asset':{'id':sid,'name':'Custom cabinet','category':'Custom','kind':'cabinet','dimensions':[.5,.65,.4],'color':'#9299a3','price':19500,'source':{'type':'procedural'}}}
    for folder in ['slots','requests']:(root/folder).mkdir(parents=True,exist_ok=True)
    (root/'slots'/f'{sid}.json').write_text(json.dumps(value))
    (root/'requests'/f'{sid}.json').write_text(json.dumps({'slotId':sid,'conversationId':conversation,'turnId':turn}))
    return value


class SlotSizeTests(unittest.TestCase):
    def test_measured_bounds_are_checked_in_wdh_and_exact_boundary_passes(self):
        check=module('designer_build_check').slot_size_faults
        bounds=[[-.25,0,-.2],[.25,.65,.2]] # GLB uses X/Y-up/Z
        self.assertEqual(check(bounds,[.51,.4,.65]),[])
        faults=check(bounds,[.511,.4,.65])
        self.assertEqual(faults[0]['check'],'slot_size');self.assertEqual(faults[0]['axis'],'w')
        self.assertTrue(check(bounds,[.5,.65,.4]))
        for invalid in [[0,.4,.65],[float('nan'),.4,.65],[.5,.4]]:
            self.assertTrue(check(bounds,invalid))
        self.assertTrue(check([[0,0,0],[0,0,0]],[.5,.4,.65]))


class BuildPoolTests(unittest.TestCase):
    def test_global_four_builder_cap_queue_reuse_and_stored_size(self):
        api=module('designer_builds');lock=threading.Lock();active=0;peak=0;started=[];release=threading.Event()
        def run(value,work,images,cancel,emit):
            nonlocal active,peak
            with lock: active+=1;peak=max(peak,active);started.append(value['slotId'])
            self.assertEqual(value['size_wdh_m'],[.5,.4,.65]);self.assertEqual(value['kind'],'cabinet')
            release.wait(5)
            with lock:active-=1
            (work/'piece.glb').write_bytes(b'checked by injected worker')
            return {'status':'ok','actual_wdh_m':[.5,.4,.65]}
        with tempfile.TemporaryDirectory() as temp,api.BuildPool(run_piece=run) as pool:
            root=Path(temp);a=root/'a';b=root/'b'
            first=[slot(a,n) for n in range(1,4)];second=[slot(b,n,conversation='c2') for n in range(1,4)]
            events=[];cancel=threading.Event()
            with pool.turn(a,'c1','t1',[],cancel,events.append) as turn_a, pool.turn(b,'c2','t1',[],cancel,events.append) as turn_b:
                deadline=time.monotonic()+3
                while len(started)<4 and time.monotonic()<deadline:time.sleep(.01)
                self.assertEqual(len(started),4);self.assertEqual(peak,4)
                release.set();turn_a.finish();turn_b.finish()
                self.assertEqual(len(started),6);self.assertEqual(len(set(started)),6)
                assets=turn_a.assets([s['slotId'] for s in first]);self.assertEqual(len(assets),3)
                self.assertEqual(assets[0]['dimensions'],[.5,.65,.4]);self.assertEqual(assets[0]['source']['type'],'gltf')
                self.assertTrue(any(e['state']=='queued' for e in events));self.assertTrue(any(e['state']=='done' for e in events))
            with pool.turn(a,'c1','t1',[],cancel,events.append) as again:again.finish()
            self.assertEqual(len(started),6)

    def test_failure_and_disconnect_keep_grey_and_cancel_before_return(self):
        api=module('designer_builds');started=threading.Event();stopped=threading.Event()
        def run(value,work,images,cancel,emit):
            started.set()
            while not cancel.is_set():time.sleep(.01)
            stopped.set();return {'status':'failed','error':'cancelled'}
        with tempfile.TemporaryDirectory() as temp,api.BuildPool(run_piece=run) as pool:
            root=Path(temp);record=slot(root,1);cancel=threading.Event();events=[]
            with pool.turn(root,'c1','t1',[],cancel,events.append) as turn:
                self.assertTrue(started.wait(3));cancel.set();turn.finish()
                self.assertTrue(stopped.is_set());self.assertEqual(turn.assets([record['slotId']])[0]['source'],{'type':'procedural'})
                self.assertTrue(any(e['state']=='failed' and e.get('reason') for e in events))

    def test_mismatch_unknown_requests_and_more_than_three_fail_closed(self):
        api=module('designer_builds');seen=[]
        def run(value,work,images,cancel,emit):seen.append(value['slotId']);return {'status':'ok','actual_wdh_m':[9,9,9]}
        with tempfile.TemporaryDirectory() as temp,api.BuildPool(run_piece=run) as pool:
            root=Path(temp);records=[slot(root,n) for n in range(1,5)];events=[]
            (root/'requests'/'unknown.json').write_text(json.dumps({'slotId':'../outside','conversationId':'c1','turnId':'t1'}))
            with pool.turn(root,'c1','t1',[],threading.Event(),events.append) as turn:
                turn.finish();assets=turn.assets([r['slotId'] for r in records])
                self.assertLessEqual(len(seen),3);self.assertTrue(all(a['source']['type']=='procedural' for a in assets))
                self.assertFalse(any(e['state']=='done' for e in events))

    def test_rate_limit_stops_queued_batch(self):
        api=module('designer_builds')
        def run(value,work,images,cancel,emit):return {'status':'voided','error':'usage limit'}
        with tempfile.TemporaryDirectory() as temp,api.BuildPool(run_piece=run) as pool:
            root=Path(temp);records=[slot(root,n) for n in range(1,4)];events=[]
            with pool.turn(root,'c1','t1',[],threading.Event(),events.append) as turn:
                turn.finish();self.assertTrue(all(a['source']['type']=='procedural' for a in turn.assets([r['slotId'] for r in records])))
                self.assertFalse(any(e['state']=='done' for e in events))
