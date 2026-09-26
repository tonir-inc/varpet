"""Actual editor WebGL renderer, disposable eval page; no product UI changes."""
import argparse
import json
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--state',type=Path,required=True)
parser.add_argument('--id',required=True)
parser.add_argument('--output',type=Path,default=Path('packages/designer/eval/komitas'))
parser.add_argument('--port',type=int,default=5193)
args=parser.parse_args()
if args.port in (5180,8787,8788): raise ValueError('Reserved port')
args.output.mkdir(parents=True,exist_ok=True)
def save_manifest(value):
    target=args.output/f'{args.id}-capture.json'
    temporary=target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(value,indent=2)+'\n')
    temporary.replace(target)
save_manifest({'state':str(args.state.resolve()),'complete':False,'reason':'capture started; completion not verified'})
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True)
    page=browser.new_page(viewport={'width':1600,'height':1100},device_scale_factor=1)
    errors=[]; failures=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('response',lambda response:failures.append({'url':response.url,'status':response.status}) if response.status>=400 else None)
    page.on('requestfailed',lambda request:failures.append({'url':request.url,'failure':request.failure}))
    page.goto(f'http://127.0.0.1:{args.port}/@fs{Path(__file__).resolve().parent}/komitas-view.html?state=/@fs{args.state.resolve()}',wait_until='networkidle',timeout=120000)
    page.wait_for_function('window.captureReady===true')
    page.wait_for_function('window.capturePending===0 && window.captureExpected.every(id=>window.captureLoaded.includes(id))',timeout=120000)
    page.wait_for_timeout(1000)
    for mode,suffix in [('perspective','3d'),('top','top')]:
        page.evaluate('(mode)=>{evalViewport.setView(mode);evalViewport.focus();}',mode)
        page.wait_for_timeout(1500)
        page.screenshot(path=str(args.output/f'{args.id}-furnished-{suffix}.png'))
    errors+=page.evaluate('window.captureErrors')
    manifest={'captured_at':datetime.now(timezone.utc).isoformat(),'state':str(args.state.resolve()),'browser':browser.version,'page_errors':errors,'failed_requests':failures,'loaded_assets':page.evaluate('window.captureLoaded'),'expected_gltf_assets':page.evaluate('window.captureExpected'),'complete':not errors and not failures,'renderer':'apps/editor/src/render/viewport.ts','port':args.port}
    save_manifest(manifest)
    print(json.dumps(manifest));browser.close()
    if errors or failures:raise SystemExit('Capture incomplete: inspect recorded render/download errors')
