"""Real editor DOM Send/Apply/export; observation adds only a stripped eval ID."""
import argparse,asyncio,json,time,uuid
from pathlib import Path
from playwright.async_api import async_playwright
import acceptance_grade as grade
HERE=Path(__file__).resolve().parent

def save(path,value):path.write_text(json.dumps(value,indent=2,ensure_ascii=False,allow_nan=False)+'\n')
async def main(args):
 out=args.output;out.mkdir(parents=True,exist_ok=True)
 rows=[];products={};assets={};errors=[];pending=set();record_tasks=set();wire={};active='';usage_limited=False
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=args.chrome,headless=True,args=['--use-angle=swiftshader','--enable-webgl'])
  context=await browser.new_context(viewport={'width':1600,'height':1100},reduced_motion='reduce')
  page=await context.new_page();page.set_default_timeout(30000)
  page.on('dialog',lambda d:asyncio.create_task(d.dismiss()))
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:pending.add(r.url) if '.glb' in r.url else None)
  page.on('requestfinished',lambda r:pending.discard(r.url))
  page.on('requestfailed',lambda r:(pending.discard(r.url),errors.append('download: '+r.url+' '+str(r.failure))) if '.glb' in r.url else None)
  async def observe(response):
   if '/api/catalog/' in response.url:
    try:
     raw=await response.json()
     for product in raw.get('results',[]):products[product['id']]=product
    except Exception:pass
  def on_response(response):
   task=asyncio.create_task(observe(response));record_tasks.add(task);task.add_done_callback(record_tasks.discard)
  page.on('response',on_response)
  async def route(request_route):
   body=request_route.request.post_data_json
   wire[active]=body
   for a in body.get('catalog',[]):assets.setdefault(a['id'],a)
   await request_route.continue_(post_data=json.dumps({**body,'_evalRunId':active}))
  await page.route('**/designer/propose',route)
  async def flush_assets():
   if record_tasks:await asyncio.gather(*list(record_tasks))
   converted=await page.evaluate('async raw => {const {catalogProduct}=await import("/src/adapters/database-catalog.ts"); return raw.map(catalogProduct).filter(Boolean).map(p=>p.asset);}',list(products.values()))
   for a in converted:assets.setdefault(a['id'],a)
  async def export(name):
   await page.locator('#file-menu').click()
   async with page.expect_download() as download:
    await page.locator('#export-json').click()
   file=await download.value;path=out/(name+'.json');await file.save_as(path)
   await page.keyboard.press('Escape');return json.loads(path.read_text())
  async def shot(name):
   start=time.monotonic()
   while pending and time.monotonic()-start<60:await asyncio.sleep(.2)
   await page.screenshot(path=str(out/(name+'.png')))
   return {'screenshot':str((out/(name+'.png')).relative_to(HERE)),'pending_models':sorted(pending),'page_errors':list(errors)}
  async def import_scene(scene):
   previous=await export('pre-import')
   expected=await page.evaluate('async ({scene,previous}) => {const {normalizeWallJunctions}=await import("/src/core/wall-junctions.ts");return normalizeWallJunctions(scene,previous);}',{'scene':scene,'previous':previous})
   await page.locator('#file-input').set_input_files({'name':'acceptance-state.json','mimeType':'application/json','buffer':json.dumps(scene).encode()})
   await page.wait_for_function('document.querySelector("#file-input").value === ""')
   # Export is the observable source of truth; import must really replace the store.
   got=await export('import-check')
   if got!=expected:raise RuntimeError('Editor import differs from its normalised scene contract')
   await page.locator('.designer-new').click()
  def persist():save(out/'run.json',{'flat':args.flat,'repeat':args.repeat,'rows':rows,'catalog':list(assets.values()),'products':list(products.values())})
  async def request(key,text,tier,apply=True,prerequisite=None):
   nonlocal active,usage_limited
   active=f'{args.flat}-{args.repeat}-{key}-{uuid.uuid4().hex[:8]}'
   before=await export(key+'-before');started=time.monotonic();row={'key':key,'tier':tier,'request':text,'flat':args.flat,'repeat':args.repeat,'eval_id':active}
   print(json.dumps({'stage':'request','flat':args.flat,'repeat':args.repeat,'key':key}),flush=True)
   response=None;reply={'type':'error'};accepted=None;ui_text='';exception=None
   try:
    await page.locator('#designer-request').fill(text)
    async with page.expect_response(lambda r:r.url.endswith('/designer/propose'),timeout=240000) as response_event:
     await page.locator('.designer-form button[type=submit]').click()
    response=await response_event.value
    raw=await asyncio.wait_for(response.text(),300)
    (out/(key+'-http.ndjson')).write_text(raw)
    events=[json.loads(line) for line in raw.splitlines() if line.strip()]
    reply=next((e for e in reversed(events) if e.get('type') in ('proposal','message','question','decline','error')),{'type':'error','message':'No terminal response'})
    await page.wait_for_function('!document.querySelector(".designer-form button[type=submit]").disabled',timeout=300000)
    last=page.locator('.designer-message-designer:not(.designer-draft)').last
    ui_text=await last.inner_text()
    row['response_seconds']=time.monotonic()-started
    row['response_capture']=await shot(key+'-response')
    if apply and await last.locator('.designer-proposal-actions').count():
     apply_started=time.monotonic();await last.get_by_role('button',name='Apply',exact=True).click()
     await page.wait_for_timeout(150)
     accepted=await last.locator('.designer-proposal-status').inner_text()=='Applied'
     row['apply_seconds']=time.monotonic()-apply_started
   except Exception as e:
    exception=str(e);row['response_seconds']=time.monotonic()-started
    try:
     if await page.locator('.designer-cancel').is_visible():await page.locator('.designer-cancel').click()
     await page.keyboard.press('Escape')
    except Exception:pass
   after=await export(key+'-after');await flush_assets()
   if active in wire:save(out/(key+'-request.json'),wire[active])
   trace=args.events/(active+'.events.jsonl');telemetry=None
   if trace.exists():
    raw_trace=trace.read_text();(out/(key+'-sdk.events.jsonl')).write_text(raw_trace)
    telemetry=next((e for e in reversed([json.loads(line) for line in raw_trace.splitlines()]) if e.get('kind')=='turn_telemetry'),None)
   seconds=row['response_seconds']+row.get('apply_seconds',0)
   result=grade.grade(key,before,after,list(assets.values()),reply,accepted,ui_text,seconds)
   if exception:result['failures'].append('driver_or_transport:'+exception)
   if prerequisite:result['failures'].append(prerequisite)
   if key=='failed-followup' and not rows[-1]['outcome'] in ('message','decline','error','question'):result['failures'].append('preceding_request_did_not_fail')
   if not telemetry or telemetry.get('fast_path_env')!='1':result['failures'].append('fast_path_telemetry_unverified')
   capture=await shot(key+'-after')
   if capture['pending_models']:result['failures'].append('models_not_loaded_for_screenshot')
   if capture['page_errors']:result['failures'].append('browser_errors')
   result['pass']=not result['failures']
   row.update(result);row.update(capture);row.update(seconds=seconds,tokens=grade.tokens(telemetry),outcome=reply.get('type'),editor_accepted=accepted,text=ui_text,reply=reply,telemetry=telemetry)
   rows.append(row);persist();print(json.dumps({'flat':args.flat,'key':key,'pass':row['pass'],'seconds':round(seconds,3),'tokens':row['tokens'],'failures':row['failures']}),flush=True)
   if key in ('living','cozier'):
    rows.append({'key':key+'-apply','tier':1,'flat':args.flat,'repeat':args.repeat,'pass':accepted is True,'failures':[] if accepted else ['no_proposal_applied'],'seconds':row.get('apply_seconds'),'tokens':0,'outcome':'apply','editor_accepted':accepted,**capture});persist()
   usage_limited=bool((telemetry or {}).get('usage_limited')) or 'usage limit' in str(reply).lower()
   if usage_limited:raise RuntimeError('USAGE LIMIT: stop batch')
   return after
  try:
   start=time.monotonic();await page.goto(f'http://127.0.0.1:{args.port}/?template=avani',wait_until='domcontentloaded',timeout=60000)
   await page.locator('#project-name').wait_for(timeout=60000)
   if args.flat!='avani':await import_scene(json.loads((HERE/'komitas'/f'{args.flat}.scene.json').read_text()))
   await page.locator('.designer-context').evaluate('(el)=>el.open=true')
   await page.locator('#designer-north').fill('0');await page.locator('#designer-north').dispatch_event('change')
   initial=await export('initial');capture=await shot('open')
   rows.append({'key':'open','tier':1,'flat':args.flat,'repeat':args.repeat,'pass':not capture['page_errors'],'failures':capture['page_errors'],'seconds':time.monotonic()-start,'tokens':0,'outcome':'open',**capture});persist()
   after=await request('living','Furnish the living room',1)
   after=await request('cozier','Make it cozier',1)
   after=await request('why','Why this layout?',1,apply=False)
   await request('quote','What would it cost? Give me the total in ֏ and a price and shop for each piece in this layout.',1,apply=False)
   furnished=after;save(out/'golden-final.json',furnished)
   if not args.tier1_only:
    bedroom=grade.room_for(initial,r'bedroom|ննջ');bedroom_name=bedroom['name'] if bedroom else 'bedroom'
    for step in grade.tier2(bedroom_name):
     if step['state']!='previous':await import_scene(furnished if step['state']=='furnished' else initial)
     prerequisite=None
     if step['key'] in ('bigger-furnished','sofa') and not any(grade.kind(a)=='sofa' for o,a in grade.objects_in(furnished,grade.room_for(furnished,r'living|հյուր'),list(assets.values()))):prerequisite='golden_furnishing_prerequisite_missing'
     await request(step['key'],step['request'],2,prerequisite=prerequisite)
  except Exception as e:
   save(out/'fatal.json',{'error':str(e),'usage_limited':usage_limited});print(str(e),flush=True);raise
  finally:
   persist();await context.close();await browser.close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--port',type=grade.port,required=True);p.add_argument('--flat',required=True);p.add_argument('--repeat',type=int,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--events',type=Path,required=True);p.add_argument('--chrome',default='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');p.add_argument('--tier1-only',action='store_true');args=p.parse_args();asyncio.run(main(args))
