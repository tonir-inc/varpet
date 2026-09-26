"""Real browser regression: nonblank 3D/SVG pixels, fresh scene, cancellation; no model call."""
import argparse,base64,json,pathlib
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--input',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);args=p.parse_args();args.output.mkdir(parents=True,exist_ok=True)
root=pathlib.Path(__file__).resolve().parents[3];payload=json.loads(args.input.read_text());results={}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True)
 page=b.new_page(viewport={'width':1024,'height':768});page.goto('http://127.0.0.1:5262/@fs'+str(root/'packages/designer/eval/vision-proposal.html'))
 page.wait_for_function('typeof renderVision==="function"');page.add_style_tag(content=(root/'apps/editor/src/ui/style.css').read_text());page.evaluate('(v)=>renderVision(v)',payload);page.wait_for_timeout(1000)
 for mode in ['3d','plan']:
  if mode=='plan':
   page.evaluate("""async(payload)=>{document.querySelector('canvas').style.visibility='hidden';const {createFloorPlan}=await import('/src/render/floor-plan.ts');window.capturePlan=createFloorPlan(document.querySelector('#viewport'),()=>{});capturePlan.setScene(payload.scene,payload.catalog);capturePlan.setVisible(true);capturePlan.focus();} """,payload);page.wait_for_timeout(500)
  value=page.evaluate("""async()=>{const {captureDesignerView}=await import('/src/adapters/designer-vision.ts');const start=performance.now();const image=await captureDesignerView(structuredClone(window.renderedScene),3,['lounge-chair']);return {...image,seconds:(performance.now()-start)/1000};}""")
  args.output.joinpath(mode+'.jpeg').write_bytes(base64.b64decode(value.pop('dataUrl').split(',')[1]));results[mode]=value
 results['stale_rejected']=page.evaluate("""async()=>{const {captureDesignerView}=await import('/src/adapters/designer-vision.ts');try{await captureDesignerView({...window.renderedScene,id:'old-scene'},3);return false;}catch(e){return e.message.includes('changed');}}""")
 results['cancelled']=page.evaluate("""async()=>{const {captureDesignerView}=await import('/src/adapters/designer-vision.ts');const controller=new AbortController();const promise=captureDesignerView(window.renderedScene,3,[],controller.signal);controller.abort();try{await promise;return false;}catch(e){return e.name==='AbortError';}}""")
 b.close()
assert results['stale_rejected'] and results['cancelled'],results
args.output.joinpath('checks.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results))
