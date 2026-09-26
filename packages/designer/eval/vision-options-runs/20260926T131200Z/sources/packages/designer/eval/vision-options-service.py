"""Real service with metadata-only observation; never stores developer plan bytes."""
import argparse,hashlib,importlib.util,json,shutil,signal,threading,time
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('recorder',HERE/'demo-e2e-service.py');recorder=importlib.util.module_from_spec(spec);spec.loader.exec_module(recorder)
class Service(recorder.RecordedService):
 def __init__(self,output):
  recorder.DesignerService.__init__(self,idle_timeout=180,**recorder.designer.default_service_settings())
  self.output=output;self.local=threading.local();self.usage_limited=threading.Event();self.vision_observer=self.visual
 def visual(self,evidence,directory):
  self.record('visual_confirmation',**evidence)
  source=directory/'visual-render'
  if source.exists():shutil.copytree(source,self.output/(self.local.run_id+'-visual'),dirs_exist_ok=True)
 def propose(self,body,cancel,progress):
  body=dict(body);self.local.run_id=body.pop('_evalRunId')
  if not self.local.run_id.replace('-','').isalnum():raise ValueError('Invalid eval ID')
  metadata={key:value for key,value in body.items() if key not in ('scene','catalog','vision')}
  metadata['vision']={key:({k:v for k,v in value.items() if k!='dataUrl'}|{'image_sha256':hashlib.sha256(value['dataUrl'].encode()).hexdigest()}) if isinstance(value,dict) else value for key,value in body.get('vision',{}).items()}
  self.record('request_metadata',body=metadata);start=time.monotonic()
  try:
   reply=recorder.DesignerService.propose(self,body,cancel,progress);self.record('service_reply',reply=reply,seconds=time.monotonic()-start);return reply
  except Exception as error:
   self.record('service_error',error=str(error),seconds=time.monotonic()-start)
   if 'usage limit' in str(error).lower():
    self.usage_limited.set();print('EVAL_USAGE_LIMIT',flush=True)
    with self.condition:
     for event in self.active:event.set()
   raise
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
service=Service(a.output);server=recorder.make_server(service,0)
signal.signal(signal.SIGTERM,lambda *_:threading.Thread(target=server.shutdown,daemon=True).start())
print(json.dumps({'port':server.server_port,**recorder.designer.default_service_settings()}),flush=True)
try:server.serve_forever()
finally:service.close();server.server_close()
