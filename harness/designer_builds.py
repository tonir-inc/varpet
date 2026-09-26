"""Service-wide four-lane builder pool and private per-turn filesystem handoff."""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor, CancelledError
from copy import deepcopy
import json
import math
from pathlib import Path
import re
import sys
import threading
import uuid
from designer_build_check import slot_size_faults

SLOT_ID=re.compile(r'^custom-[a-zA-Z0-9-]+-\d+$')

def read(path):return json.loads(path.read_text())

def atomic(path,value):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    temp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp');temp.write_text(json.dumps(value));temp.chmod(0o600);temp.replace(path)

class Cancel:
    def __init__(self,*events):self.events=events
    def is_set(self):return any(e.is_set() for e in self.events)

class BuildPool:
    def __init__(self,run_piece=None):
        self.executor=ThreadPoolExecutor(max_workers=4,thread_name_prefix='custom-piece')
        self.run_piece=run_piece or self._run_piece
        self.stop=threading.Event()
    def __enter__(self):return self
    def __exit__(self,*args):self.close()
    def close(self):self.stop.set();self.executor.shutdown(wait=True,cancel_futures=True)
    def turn(self,root,conversation_id,turn_id,images,cancel,emit):
        return BuildTurn(self,Path(root),conversation_id,turn_id,list(images),cancel,emit)
    def _run_piece(self,slot,work,images,cancel,emit):
        import designer
        spec=work.parent/(work.name+'-input.json')
        atomic(spec,{'slot':slot,'images':images,'effort':'low'})
        pending=''
        def output(channel,chunk):
            nonlocal pending
            if channel!='stdout':return
            pending+=chunk
            while '\n' in pending:
                line,pending=pending.split('\n',1)
                try:event=json.loads(line)
                except ValueError:continue
                if event.get('state') in ('building','fixing'):emit(event['state'])
        python=designer.ROOT/'harness/.venv/bin/python'
        if not python.is_file():raise RuntimeError('Run uv sync --project harness before enabling custom builds')
        result=designer.watch_process([str(python),'-u',str(Path(__file__).with_name('designer_piece_worker.py')),str(spec),str(work)],cancel_event=cancel,on_output=output,deadline=__import__('time').monotonic()+600)
        if result.cancelled:return {'status':'failed','error':'Build cancelled'}
        if result.usage_limited:return {'status':'voided','error':'Builder usage limit reached'}
        if result.returncode or result.timed_out or result.deadline_exceeded:return {'status':'failed','error':'Builder failed or timed out; choose a catalog alternative'}
        return read(work/'result.json')

class BuildTurn:
    def __init__(self,pool,root,conversation,turn,images,cancel,emit):
        self.pool,self.root,self.conversation,self.turn_id=pool,root,conversation,turn
        self.images,self.external,self.emit=images,cancel,emit
        self.stop=threading.Event();self.sealed=threading.Event();self.cancel=Cancel(cancel,self.stop,pool.stop)
        self.futures={};self.seen=set();self.scan_lock=threading.Lock();self.events_lock=threading.Lock()
        self.thread=threading.Thread(target=self._watch,daemon=True)
    def __enter__(self):self.thread.start();return self
    def __exit__(self,*args):
        self.stop.set();self.sealed.set();self.thread.join();self._wait()
    def _record(self,slot,state,reason=None):
        sid=slot['slotId'];record={'type':'build','slotId':sid,'state':state}
        if state=='done':record['glb']=f'/designer/files/{self.conversation}/{sid}.glb'
        if reason:record['reason']=reason[:300]
        with self.events_lock:
            atomic(self.root/'states'/f'{sid}.json',record)
            self.emit(record)
    def _watch(self):
        while not self.sealed.is_set():
            self.scan();self.sealed.wait(.05)
    def scan(self):
        with self.scan_lock:
            for path in sorted((self.root/'requests').glob('*.json')):
                if path.name in self.seen:continue
                self.seen.add(path.name)
                try:
                    request=read(path);sid=request['slotId']
                    if not SLOT_ID.fullmatch(sid) or path.name!=sid+'.json' or request.get('conversationId')!=self.conversation or request.get('turnId')!=self.turn_id:continue
                    slot=read(self.root/'slots'/f'{sid}.json')
                    if slot.get('slotId')!=sid or slot.get('conversationId')!=self.conversation or slot.get('turnId')!=self.turn_id or not slot.get('proposed'):continue
                    existing=self.root/'states'/f'{sid}.json'
                    if existing.is_file() and read(existing).get('state') in ('done','failed'):continue
                    if len(self.futures)>=3:
                        self._record(slot,'failed','At most three custom pieces per turn');continue
                    if slot['kind'] not in ('cabinet','table','shelf'):self._record(slot,'failed','Use the catalog for soft furniture');continue
                    if slot_size_faults([[0,0,0],[slot['size_wdh_m'][0],slot['size_wdh_m'][2],slot['size_wdh_m'][1]]],slot['size_wdh_m']):raise ValueError('Invalid slot size')
                    self._record(slot,'queued')
                    self.futures[sid]=(slot,self.pool.executor.submit(self._build,slot))
                except (OSError,ValueError,KeyError,TypeError,IndexError):
                    # Ignore malformed/untrusted request files; they can never become filesystem paths or assets.
                    continue
    def _build(self,slot):
        if self.cancel.is_set():self._record(slot,'failed','Build cancelled');return
        self._record(slot,'building');work=self.root/'work'/slot['slotId'];work.mkdir(parents=True,exist_ok=True)
        try:
            result=self.pool.run_piece(deepcopy(slot),work,list(self.images),self.cancel,lambda state:self._record(slot,state))
            if result.get('status')=='voided':self.stop.set()
            if self.cancel.is_set() or result.get('status')!='ok':raise ValueError(result.get('error') or 'Build cancelled or failed; choose a catalog alternative')
            actual=result.get('actual_wdh_m',[])
            bounds=[[0,0,0],[actual[0],actual[2],actual[1]]] if len(actual)==3 else []
            faults=slot_size_faults(bounds,slot['size_wdh_m'])
            if faults or not (work/'piece.glb').is_file():raise ValueError('Built piece does not match the stored slot within 1 cm')
            self._record(slot,'done')
        except Exception as error:self._record(slot,'failed',str(error))
    def _wait(self):
        for slot,future in list(self.futures.values()):
            if self.cancel.is_set() and future.cancel():self._record(slot,'failed','Build cancelled')
            try:future.result()
            except CancelledError:pass
    def finish(self):
        self.scan();self.sealed.set();self.thread.join();self._wait()
    def assets(self,ids):
        assets=[]
        for sid in dict.fromkeys(ids):
            if not SLOT_ID.fullmatch(sid):raise ValueError('Invalid custom slot ID')
            slot=read(self.root/'slots'/f'{sid}.json')
            if slot['conversationId']!=self.conversation:raise ValueError('Foreign custom slot')
            asset=deepcopy(slot['asset']);state=self.root/'states'/f'{sid}.json'
            if state.is_file() and read(state).get('state')=='done':asset['source']={'type':'gltf','url':read(state)['glb']}
            assets.append(asset)
        return assets
