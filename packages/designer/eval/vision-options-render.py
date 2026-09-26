"""Offline visual adjudication only: original catalog meshes, 90 s asset wait, shared browser cache.
Does not alter measured service latency or turn a failed live self-check into a pass.
"""
import argparse,json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('directory',type=Path);args=p.parse_args();directory=args.directory;root=Path(__file__).resolve().parents[3]
read=lambda p:json.loads(p.read_text());catalog=read(directory/'catalog.json')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True);context=browser.new_context(viewport={'width':1024,'height':768})
 for row in read(directory/'render-queue.json'):
  out=directory/'audited-renders'/row['id']
  if (out/'render.json').exists():continue
  out.mkdir(parents=True,exist_ok=True);page=context.new_page();start=time.monotonic();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('requestfailed',lambda r:requests.append({'url':r.url,'failure':r.failure}))
  try:
   page.goto('http://127.0.0.1:5262/@fs'+str(root/'packages/designer/eval/vision-proposal.html'),timeout=20000);page.wait_for_function('typeof renderVision==="function"',timeout=20000)
   page.evaluate('(payload)=>renderVision(payload)',{'scene':read(directory/row['scene_file'])['scene'],'catalog':catalog})
   page.wait_for_function('capturePending===0 && captureExpected.every(id=>captureLoaded.includes(id))',timeout=90000)
   for mode in ['top','perspective']:
    page.evaluate('(mode)=>{evalViewport.setView(mode);evalViewport.focus();}',mode);page.wait_for_timeout(500);page.screenshot(path=str(out/(mode+'.png')))
   errors+=page.evaluate('captureErrors');result={'errors':errors,'loaded':page.evaluate('captureLoaded'),'expected':page.evaluate('captureExpected'),'requests_failed':requests,'seconds':time.monotonic()-start}
  except Exception as e:result={'errors':errors+[str(e)],'requests_failed':requests,'seconds':time.monotonic()-start}
  (out/'render.json').write_text(json.dumps(result,indent=2)+'\n');page.close();print(row['id'],result['seconds'],len(result['errors']),flush=True)
 browser.close()
