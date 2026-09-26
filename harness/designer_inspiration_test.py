"""One private inspiration attachment per request, forwarded on every turn and deleted on end."""
import base64,json,threading,unittest
from pathlib import Path
from unittest.mock import patch
import designer_service
from designer_builds_test import slot
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
def picture(raw=PNG):return {'name':'inspiration.png','dataUrl':'data:image/png;base64,'+base64.b64encode(raw).decode()}
def body(**extra):return {'scene':{'format':'varpet.editor'},'revision':0,'request':'What colours are in this picture?',**extra}

class InspirationTests(unittest.TestCase):
 def test_invalid_and_oversized_images_are_rejected_before_worker(self):
  for image in [None,{'name':'x','dataUrl':'https://example.com/p.png'},picture(PNG+b'x'*(256*1024)),{'name':'../secret','dataUrl':picture()['dataUrl']}, {'name':'x','dataUrl':'data:image/jpeg;base64,'+base64.b64encode(PNG).decode()}]:
   with self.subTest(image=str(image)[:80]),self.assertRaises(ValueError):designer_service.validate_request(body(image=image))

 def test_image_on_second_turn_reaches_designer_and_real_build_pool_without_inline_bytes(self):
  import designer_builds
  observed=[];builder_images=[]
  def build(value,work,images,cancel,emit):
   builder_images.extend(images);self.assertEqual(Path(images[-1]).read_bytes(),PNG)
   (work/'piece.glb').write_bytes(b'compiled');return {'status':'ok','actual_wdh_m':[.5,.4,.65]}
  service=designer_service.DesignerService();self.addCleanup(service.close)
  service.build_pool.close();service.build_pool=designer_builds.BuildPool(run_piece=build)
  def process(command,cancel,**kwargs):
   if 'to-designer' in command:
    at=command.index('to-designer');Path(command[at+2]).write_text(json.dumps({'rooms':[],'walls':[],'items':[],'openings':[],'fixed':[]}));return
   job=json.loads(Path(command[-1]).read_text());observed.append(job)
   if len(observed)==2:
    self.assertIn('inspiration_image',job,'The second-turn picture must reach the designer')
    self.assertEqual(Path(job['inspiration_image']).read_bytes(),PNG)
    self.assertNotIn('base64',json.dumps(job));self.assertNotIn(picture()['dataUrl'],json.dumps(job))
    env=kwargs['env'];slot(Path(env['VARPET_BUILDS_DIR']),1,turn=env['VARPET_TURN_ID'],conversation=env['VARPET_CONVERSATION_ID'])
    # Finish must join the actual BuildPool before the attachment can be removed.
    deadline=__import__('time').monotonic()+3
    while not builder_images and __import__('time').monotonic()<deadline:__import__('time').sleep(.01)
   kwargs['on_output']('stdout',json.dumps({'kind':'worker_summary','status':'completed','response':'The picture has a light palette.'})+'\n')
  with patch.object(service,'_process',process):
   first=service.propose(body(),threading.Event(),lambda _:None)
   second=service.propose(body(conversationId=first['conversationId'],image=picture()),threading.Event(),lambda _:None)
  self.assertEqual(second['type'],'message');self.assertTrue(builder_images)
  path=Path(observed[-1]['inspiration_image']);self.assertTrue(path.is_file());self.assertEqual(path.stat().st_mode&0o777,0o600)
  cid=second['conversationId'];root=service.conversations[cid].root
  service.end_conversation(cid)
  self.assertFalse(root.exists());self.assertNotIn(cid,service.conversations)
  with self.assertRaises(ValueError):service.propose(body(conversationId=cid),threading.Event(),lambda _:None)

 def test_exact_byte_cap_and_webp_and_local_path_validation(self):
  import designer_inspiration as images
  import tempfile
  raw=PNG+b'\0'*(images.MAX_BYTES-len(PNG))
  self.assertEqual(len(images.validate_image(picture(raw))[0]),images.MAX_BYTES)
  webp=b'RIFF\x10\0\0\0WEBPVP8 '+b'\0'*8
  value={'name':'idea.webp','dataUrl':'data:image/webp;base64,'+base64.b64encode(webp).decode()}
  with tempfile.TemporaryDirectory() as tmp:
   path=images.store_image(value,tmp);self.assertEqual(images.local_attachment(path),path)
   with self.assertRaises(ValueError):images.local_attachment(Path(tmp)/'missing.png')

 def test_end_cancels_active_request_before_deleting_image(self):
  service=designer_service.DesignerService();self.addCleanup(service.close)
  ready=threading.Event();errors=[];paths=[]
  def process(command,cancel,**kwargs):
   if 'to-designer' in command:
    at=command.index('to-designer');Path(command[at+2]).write_text(json.dumps({'rooms':[],'walls':[],'items':[],'openings':[],'fixed':[]}));return
   job=json.loads(Path(command[-1]).read_text());path=Path(job['inspiration_image']);paths.append(path);ready.set()
   self.assertTrue(cancel.wait(3));self.assertTrue(path.exists(),'File removed while worker still uses it')
   raise RuntimeError('Request cancelled')
  def request():
   try:service.propose(body(image=picture()),threading.Event(),lambda _:None)
   except RuntimeError as error:errors.append(str(error))
  with patch.object(service,'_process',process):
   thread=threading.Thread(target=request);thread.start();self.assertTrue(ready.wait(3))
   service.end_conversation(next(iter(service.conversations)));thread.join(3)
  self.assertFalse(thread.is_alive());self.assertEqual(errors,['Request cancelled']);self.assertFalse(paths[0].exists())

 def test_two_end_requests_do_not_delete_the_same_directory_twice(self):
  service=designer_service.DesignerService();self.addCleanup(service.close)
  root=Path(service.directory.name)/'c1';root.mkdir();conversation=designer_service.Conversation(root)
  ready=threading.Event();count=[]
  class Cancel:
   def set(self):
    count.append(1)
    if len(count)==2:ready.set()
  conversation.cancel=Cancel();service.conversations['c1']=conversation;outcomes=[]
  def end():
   try:service.end_conversation('c1');outcomes.append('deleted')
   except ValueError:outcomes.append('unknown')
   except Exception as error:outcomes.append(type(error).__name__)
  threads=[threading.Thread(target=end) for _ in range(2)]
  for thread in threads:thread.start()
  self.assertTrue(ready.wait(3))
  with service.condition:conversation.cancel=None;service.condition.notify_all()
  for thread in threads:thread.join(3)
  self.assertCountEqual(outcomes,['deleted','unknown'])
