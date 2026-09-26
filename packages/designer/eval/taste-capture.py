"""Capture actual editor 3D results, with loaded-asset/error evidence; no generated images."""
import argparse,json,subprocess,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('directory',type=Path);parser.add_argument('--port',type=int,default=5199);parser.add_argument('--cache',type=Path);args=parser.parse_args()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True)
 page=browser.new_page(viewport={'width':1500,'height':1100},device_scale_factor=1)
 if args.cache:
  def cached(route):
   path=args.cache/(hashlib.sha256(route.request.url.encode()).hexdigest()+'.glb')
   if path.exists():route.fulfill(path=str(path),headers={'Access-Control-Allow-Origin':'*'},content_type='model/gltf-binary')
   else:route.continue_()
  page.route('https://amazon-berkeley-objects.s3.amazonaws.com/**',cached)
 initialized=False
 for state in sorted(args.directory.glob('*.json')):
  if state.stem.endswith('-capture'):continue
  data=json.loads(state.read_text())
  if 'scene' not in data or 'catalog' not in data:continue
  target=state.with_name(state.stem+'-furnished-3d.png')
  if target.exists():continue
  errors=[]
  def error(e):errors.append(str(e))
  page.on('pageerror',error)
  try:
   if initialized:
    page.evaluate('''async path=>{const {scene,catalog}=await fetch(path).then(r=>r.json());window.captureErrors.length=0;window.captureExpected=[...new Set(scene.objects.map(o=>o.assetId))].filter(id=>catalog.find(a=>a.id===id)?.source.type==='gltf');document.querySelector('#label').textContent=scene.name;evalViewport.setScene(scene,catalog);}''',f'/@fs{state.resolve()}')
   else:
    page.goto(f'http://127.0.0.1:{args.port}/@fs{Path(__file__).resolve().parent}/komitas-view.html?state=/@fs{state.resolve()}',wait_until='domcontentloaded',timeout=120000)
    initialized=True
   page.wait_for_function('window.captureReady===true && window.capturePending===0 && window.captureExpected.every(id=>window.captureLoaded.includes(id))',timeout=120000)
   page.evaluate("room=>{evalViewport.setView('perspective');evalViewport.focus(room);}",data.get('focus_room','room-living'))
   page.wait_for_timeout(1200)
   page.screenshot(path=str(target))
   errors+=page.evaluate('window.captureErrors')
   manifest={'captured_at':subprocess.check_output(['date','-u','+%Y-%m-%dT%H:%M:%SZ'],text=True).strip(),'state':str(state),'renderer':'apps/editor/src/render/viewport.ts','expected':page.evaluate('window.captureExpected'),'loaded':page.evaluate('window.captureLoaded'),'errors':errors,'complete':not errors}
  except Exception as e:manifest={'state':str(state),'errors':errors+[str(e)],'complete':False,'loading':page.evaluate('({expected:window.captureExpected,loaded:window.captureLoaded,pending:window.capturePending})')}
  state.with_name(state.stem+'-capture.json').write_text(json.dumps(manifest,indent=2))
  print(json.dumps({'id':state.stem,'complete':manifest['complete'],'errors':manifest['errors']}),flush=True)
  page.remove_listener('pageerror',error)
 browser.close()
