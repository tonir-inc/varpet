"""Render the actual checked proposal using the editor; parent enforces the wall-clock budget."""
import argparse,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
payload=json.loads(args.input.read_text());args.output.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parents[1]
url=os.environ.get('VARPET_VISION_EDITOR_URL','http://127.0.0.1:5262').rstrip('/')
with sync_playwright() as playwright:
 browser=playwright.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True)
 page=browser.new_page(viewport={'width':1024,'height':768},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto(url+'/@fs'+str(root/'packages/designer/eval/vision-proposal.html'),wait_until='domcontentloaded',timeout=15000)
 page.wait_for_function('typeof window.renderVision==="function"',timeout=15000)
 page.evaluate('(payload)=>renderVision(payload)',payload)
 page.wait_for_function('capturePending===0 && captureExpected.every(id=>captureLoaded.includes(id))',timeout=15000)
 for mode in ['top','perspective']:
  page.evaluate('(mode)=>{evalViewport.setView(mode);evalViewport.focus();}',mode);page.wait_for_timeout(400)
  page.screenshot(path=str(args.output/(mode+'.png')))
 errors+=page.evaluate('captureErrors')
 (args.output/'render.json').write_text(json.dumps({'errors':errors,'loaded':page.evaluate('captureLoaded'),'expected':page.evaluate('captureExpected')}))
 browser.close()
 if errors:raise RuntimeError('Editor rendering failed: '+str(errors))
print(json.dumps({'images':[str(args.output/(mode+'.png')) for mode in ['top','perspective']]}),flush=True)
