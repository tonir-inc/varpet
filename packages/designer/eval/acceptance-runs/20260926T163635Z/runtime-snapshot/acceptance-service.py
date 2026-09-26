"""Observation-only HTTP service. Eval ID is stripped before production validation.
Unlike the historical Komitas wrapper, errors retain production HTTP semantics.
"""
import argparse, importlib.util, os, signal, threading
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('komitas_recorder',HERE/'komitas-service.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Service(m.Service):
 def propose(self,body,cancel,progress):
  cid=body.get('conversationId');self.local.cid=cid
  before=self.conversations[cid].usage if cid in self.conversations else None
  known=self.conversations[cid].usage_known if cid in self.conversations else True
  try:
   reply=m.module.VisionService.propose(self,body,cancel,progress)
   self.local.cid=reply.get('conversationId',self.local.cid)
   return reply
  finally:
   conv=self.conversations.get(self.local.cid)
   usage=m.recorder.designer.usage_delta(before,conv.usage) if conv and known and conv.usage_known else None
   self.record('turn_telemetry',conversation_id=self.local.cid,usage=usage,model=m.recorder.designer.MODEL,effort=self.effort,profile=self.profile,fast_path_env=os.environ.get('VARPET_DESIGNER_FAST_PATH'),usage_limited=self.usage_limited.is_set())
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
 if args.port in (5180,5190,8787,8788):raise ValueError('Reserved port')
 args.output.mkdir(parents=True,exist_ok=True)
 service=Service(args.output,[]);server=m.recorder.make_server(service,args.port)
 def stop(*_):threading.Thread(target=server.shutdown,daemon=True).start()
 signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
 print('Acceptance service ready',flush=True)
 try:server.serve_forever()
 finally:service.close();server.server_close()
