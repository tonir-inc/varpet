"""Supplement live UI screenshots with uncluttered top views of exact exported states.
Uses the editor's real WebGL renderer; runs only after timed conversations finish.
"""
import argparse,hashlib,json
from pathlib import Path
from playwright.sync_api import sync_playwright
HERE=Path(__file__).resolve().parent

def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--port',type=int,required=True);args=p.parse_args()
 if args.port in (5180,5190,8787,8788):raise ValueError('Reserved port')
 captures=args.output/'geometry';captures.mkdir(exist_ok=True);index={};manifest=[]
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True)
  for runpath in sorted(args.output.glob('*/run.json')):
   run=json.loads(runpath.read_text())
   for row in run['rows']:
    key=row['key'].removesuffix('-apply')
    statepath=runpath.parent/('initial.json' if key=='open' else key+'-after.json')
    if not statepath.exists():continue
    scene=json.loads(statepath.read_text());ids={o['assetId'] for o in scene['objects']}
    catalog=[a for a in run['catalog'] if a['id'] in ids]
    state={'scene':scene,'catalog':catalog};digest=hashlib.sha256(json.dumps(state,sort_keys=True).encode()).hexdigest()[:16]
    if digest not in index:
     statefile=captures/(digest+'.json');statefile.write_text(json.dumps(state)+'\n');page=browser.new_page(viewport={'width':1400,'height':1000})
     errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
     page.on('response',lambda response:errors.append(f'HTTP {response.status}: {response.url}') if response.status>=400 else None)
     page.on('requestfailed',lambda request:errors.append(f'{request.url}: {request.failure}'))
     result={'state':str(statefile.relative_to(HERE)),'source_export':str(statepath.relative_to(HERE)),'hash':digest}
     try:
      page.goto(f'http://127.0.0.1:{args.port}/@fs{HERE}/komitas-view.html?state=/@fs{statefile.resolve()}',wait_until='domcontentloaded',timeout=60000)
      page.wait_for_function('window.captureReady===true',timeout=60000)
      page.wait_for_function('window.capturePending===0 && window.captureExpected.every(id=>window.captureLoaded.includes(id))',timeout=90000)
      page.evaluate('evalViewport.setView("top");evalViewport.focus();')
      page.wait_for_timeout(300);png=captures/(digest+'.png');page.screenshot(path=str(png))
      errors+=page.evaluate('window.captureErrors')
      result.update(screenshot=str(png.relative_to(HERE)),complete=not errors,errors=errors)
     except Exception as error:result.update(complete=False,errors=errors+[str(error)])
     finally:page.close()
     index[digest]=result;print(json.dumps({'capture':digest,'complete':result['complete']}),flush=True)
    manifest.append({'flat':run['flat'],'repeat':run['repeat'],'key':row['key'],**index[digest]})
  browser.close()
 (args.output/'geometry-captures.json').write_text(json.dumps(manifest,indent=2)+'\n')
 if any(not row['complete'] for row in manifest):raise SystemExit(1)
if __name__=='__main__':main()
