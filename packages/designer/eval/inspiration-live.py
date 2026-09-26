"""Real photo on turn two, ephemeral spare HTTP port, metadata-only evidence and explicit deletion."""
import argparse,base64,hashlib,json,sys,threading,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];sys.path.insert(0,str(ROOT/'harness'))
import designer
from designer_service import DesignerService,make_server
p=argparse.ArgumentParser();p.add_argument('photo',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
a.output.mkdir(parents=True,exist_ok=True)
raw=a.photo.read_bytes();image={'name':a.photo.name,'dataUrl':'data:image/jpeg;base64,'+base64.b64encode(raw).decode()}
audits=[]
class ObservedService(DesignerService):
 def _process(self,command,cancel,**kwargs):
  original=kwargs.get('on_output');pending=''
  def output(channel,chunk):
   nonlocal pending
   if original:original(channel,chunk)
   if channel!='stdout':return
   pending+=chunk
   while '\n' in pending:
    line,pending=pending.split('\n',1)
    try:event=json.loads(line)
    except ValueError:continue
    if event.get('kind') in ('image_input','context_audit','worker_summary'):
     audits.append({k:v for k,v in event.items() if k in ('kind','count','images','text_json_chars','incomplete','total_usage','status')})
  return super()._process(command,cancel,**{**kwargs,'on_output':output})
service=ObservedService(**designer.default_service_settings());server=make_server(service,0)
assert server.server_port not in (5180,5190,8787,8788)
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
scene=json.loads((ROOT/'packages/designer/eval/komitas/b20-t11.scene.json').read_text());rows=[];cid=None
try:
 for index,text in enumerate(['I will send an inspiration picture next. Please acknowledge briefly; make no edits.','Look at the attached inspiration photo. Describe the small cabinet between the mattress and bed: its colour, legs and drawer front. Do not change the flat.']):
  body={'scene':scene,'revision':0,'request':text,**({'conversationId':cid,'image':image} if cid else {})}
  start=time.monotonic();request=urllib.request.Request(f'http://127.0.0.1:{server.server_port}/designer/propose',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
  with urllib.request.urlopen(request,timeout=240) as response:records=[json.loads(line) for line in response if line.strip()]
  final=records[-1];cid=final.get('conversationId',cid);rows.append({'turn':index+1,'seconds':time.monotonic()-start,'reply':final,'audit':list(audits)});audits.clear()
  print(json.dumps({'turn':index+1,'seconds':rows[-1]['seconds'],'type':final['type']}),flush=True)
  if final['type']=='error':raise RuntimeError(final['message'])
 root=service.conversations[cid].root;path=Path(service.conversations[cid].inspiration_image)
 attachment_sha=hashlib.sha256(path.read_bytes()).hexdigest()
 request=urllib.request.Request(f'http://127.0.0.1:{server.server_port}/designer/conversations/{cid}',method='DELETE')
 with urllib.request.urlopen(request) as response:deleted=json.load(response)
 evidence={'port':server.server_port,'photo_bytes':len(raw),'photo_sha256':hashlib.sha256(raw).hexdigest(),'attachment_sha256':attachment_sha,'rows':rows,'delete_reply':deleted,'conversation_removed':cid not in service.conversations,'private_directory_removed':not root.exists()}
 (a.output/'measurement.json').write_text(json.dumps(evidence,indent=2)+'\n')
 assert attachment_sha==evidence['photo_sha256'] and evidence['private_directory_removed'] and evidence['conversation_removed']
finally:
 service.close();server.shutdown();server.server_close();thread.join()
