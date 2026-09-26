"""One command: real browser/service baseline, guarded private ports, persistent evidence."""
import argparse,importlib.util,json,os,signal,socket,statistics,subprocess,sys,tempfile,time
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timezone
from pathlib import Path
import acceptance_grade as grade
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
spec=importlib.util.spec_from_file_location('acceptance_watchdog',HERE/'komitas-batch.py')
watch=importlib.util.module_from_spec(spec);spec.loader.exec_module(watch)
TIER1=['open','living','living-apply','cozier','cozier-apply','why','quote']

def write_report(output,manifest):
 rows=[]
 for flat in manifest['flats']:
  for repeat in range(1,manifest['tier1_runs']+1):
   run=output/f'{flat}-{repeat}'/'run.json'
   actual=json.loads(run.read_text())['rows'] if run.exists() else []
   expected=[(1,k) for k in TIER1]+([(2,s['key']) for s in grade.tier2('bedroom')] if repeat<=manifest['runs'] and not manifest['tier1_only'] else [])
   by={r['key']:r for r in actual}
   for tier,key in expected:rows.append(by.get(key,dict(flat=flat,repeat=repeat,tier=tier,key=key,pass_=False,failures=['not_run_or_driver_stopped'],seconds=None,tokens=None)))
 def stat(values):
  values=[x for x in values if x is not None]
  return f'{statistics.median(values):,.3f} / {max(values):,.3f}' if values else 'unknown'
 def escaped(value):return str(value).replace('|','/').replace('\n',' ')
 lines=['# Demo acceptance baseline',f"\nMeasured {manifest['started_at']} UTC; source `{manifest['source']}`. Fast path **ON**, production service defaults, real catalog `localhost:8765/mcp`, AMD, north 0. Two real editor browser sessions maximum; private ports {manifest['editor_port']}/{manifest['service_port']}. No designer fixes or response stubs.",
 '\nKomitas default **b21-t13** is fixed before testing, not selected post hoc for a higher score. Avani is the actual editor portal template built from `demo.ts` via `createInitialScene` (empty furniture, production behavior). This baseline starts from pre-built shells; it does not test plan reconstruction.',
 '\n## Results', '| Flat / tier | Automated passes | Median / max seconds | Median / max tokens | Target |','|---|---:|---:|---:|---|']
 for flat in manifest['flats']:
  for tier in (1,2):
   group=[r for r in rows if r['flat']==flat and r['tier']==tier]
   if not group:continue
   passed=sum(r.get('pass',False) for r in group)
   lines.append(f"| {flat} / {tier} | {passed}/{len(group)} | {stat([r.get('seconds') for r in group])} | {stat([r.get('tokens') for r in group])} | {'100%' if tier==1 else '≥80%'} per step, 10 repeats; human screenshots pending |")
 for flat in manifest['flats']:
  lines += [f'\n## {flat}', '| Tier / step | Pass count | Median / max seconds | Median / max tokens | Screenshots / failure text |','|---|---:|---:|---:|---|']
  for tier,key in [(1,k) for k in TIER1]+[(2,s['key']) for s in grade.tier2('bedroom')]:
   group=[r for r in rows if r['flat']==flat and r['key']==key]
   if not group:continue
   evidence=[]
   for r in group:
    link=f"[{r['repeat']}]({r['screenshot']})" if r.get('screenshot') else str(r['repeat'])+' (no capture)'
    errors='; '.join(r.get('failures',[]))
    if errors:link+=' '+escaped(errors)
    evidence.append(link)
   lines.append(f"| {tier} / {key} | {sum(r.get('pass',False) for r in group)}/{len(group)} | {stat([r.get('seconds') for r in group])} | {stat([r.get('tokens') for r in group])} | {'<br>'.join(evidence)} |")
 lines+=['\n## Grading and limits',
 '- Measured UI acceptance requires clicking Apply and seeing Applied, plus exported before/after scenes. It is necessary but insufficient. Every step has a response/final screenshot and raw HTTP/SDK evidence; proposal Apply is a separate golden-path row. Request time includes UI response and Apply; screenshot/model-download/export overhead is excluded. Open time includes initial loading/export/capture. Apply time is also shown separately, so aggregate step times are not total conversation duration.',
 '- Independent Python geometry uses editor XZ coordinates, catalog dimensions and rotations. Living: sofa within 20° of a window span/TV, rug overlap, front coffee table edge gap 0.25–0.60 m, lamp, displayed total, widest 10 cm grid route ≥0.90 m including door width. Grid sampling subtracts half-diagonal clearance conservatively; screenshots need human review. Bedroom: double bed ≥1.35×1.80 m, solid headboard gap ≤0.25 m, nightstand each side, wardrobe, bed-side samples ≥0.60 m. No production request/layout checker grades its own output.',
 '- Cozier requires added rug/lamp/soft seating/plant or warmer wall colour and preservation of every previously chosen object ID. Named paint must cover the named room; apartment red covers all walls. Desk/armchair must be a new catalog subtype within 1.5 m of a window. Bigger furnished must retain inventory and increase an independently sampled largest open rectangle; empty must give an honest unchanged-scene explanation.',
 '- Why requires an actual layout, placement-specific prose and a numerical claim matching an independently measured coffee gap/open rectangle; this conservative proxy may reject other correct numerical explanations. Quote requires actual per-piece prices, matching total and a named shop/link per row; catalog prices are mock AMD and shop identity still requires human provenance review. No invented shop is established as real by a text match.',
 '- Assumed fast honest bathroom refusal threshold: ≤10 s. Failed-answer follow-up immediately follows the bathroom-bed refusal and must address that bed/bathroom request, with no unsafe edit. Tier 2 branches reset the editor and chat to the frozen initial or golden furnished snapshot, avoiding accidental cross-request dependencies; missing furnished prerequisites are explicit failures.',
 '- Automated passes are provisional until a human checks the linked screenshots and semantic explanations. Three repeats are a baseline, not evidence of 10/10 or ≥8/10 reliability. Missing outcomes/tokens remain unknown, never zero. No failed or blocked step is dropped from denominators.',
 '\n## Reproduce', '```sh','pnpm acceptance                       # 3 repeats per flat, both tiers','pnpm acceptance --tier1-runs 10        # golden path 10 each; Tier 2 remains 3','pnpm acceptance --runs 10              # both tiers 10 each','pnpm acceptance --tier1-only --runs 10 # just the golden path','```',
 f"\n[Manifest and raw evidence]({output.relative_to(HERE)}/manifest.json). Each invocation creates a new timestamped directory; previous measurements are retained. Nonzero exit means an observed rubric/driver failure. Service/worker stdin is closed; 180-second model-output watchdog, 240-second worker-output watchdog, process-group cleanup; usage-limit stderr stops the batch. Requires the real catalog, authenticated Codex SDK (`VARPET_ACCEPTANCE_PYTHON` or `/tmp/varpet-designer-sdk/bin/python`), Chrome and `uv` for the Playwright driver."]
 # Preserve exact customer-visible failure copy separately from diagnostic codes.
 lines+=['\n## Customer-visible failure text']
 for r in rows:
  if not r.get('pass',False) and r.get('text'):lines.append(f"\n**{r['flat']} / run {r['repeat']} / {r['key']}**: {escaped(r['text'])}")
 (HERE/'acceptance.md').write_text('\n'.join(lines)+'\n')
 (output/'summary.json').write_text(json.dumps({'rows':rows,'observed_all_pass':all(r.get('pass',False) for r in rows)},indent=2,ensure_ascii=False)+'\n')
 return rows

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--runs',type=int,default=3);p.add_argument('--tier1-runs',type=int);p.add_argument('--tier1-only',action='store_true');p.add_argument('--flat',default='b21-t13');p.add_argument('--editor-port',type=grade.port,default=53220);p.add_argument('--service-port',type=grade.port,default=53221);p.add_argument('--jobs',type=int,choices=(1,2),default=2);p.add_argument('--report-only',type=Path);args=p.parse_args()
 if args.report_only:
  write_report(args.report_only,json.loads((args.report_only/'manifest.json').read_text()));return
 if not 1<=args.runs<=20 or not 1<=(args.tier1_runs or args.runs)<=20:p.error('runs must be 1–20')
 if args.tier1_runs and args.tier1_runs<args.runs:p.error('tier1-runs must be at least runs')
 if args.editor_port==args.service_port:p.error('ports must differ')
 for port in (args.editor_port,args.service_port):
  with socket.socket() as sock:sock.bind(('127.0.0.1',port))
 if not (HERE/'komitas'/f'{args.flat}.scene.json').exists():p.error('Published Komitas scene not found')
 stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ');output=HERE/'acceptance-runs'/stamp;output.mkdir(parents=True,exist_ok=False)
 manifest={'started_at':datetime.now(timezone.utc).isoformat(),'source':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'runs':args.runs,'tier1_runs':args.tier1_runs or args.runs,'tier1_only':args.tier1_only,'flats':[args.flat,'avani'],'editor_port':args.editor_port,'service_port':args.service_port}
 (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 services=[];logs=[];temporary=tempfile.TemporaryDirectory(prefix='varpet-acceptance-')
 sdk=os.environ.get('VARPET_ACCEPTANCE_PYTHON','/tmp/varpet-designer-sdk/bin/python')
 env={**os.environ,'VARPET_DESIGNER_FAST_PATH':'1','VARPET_CATALOG_URL':'http://localhost:8765/mcp','VITE_DESIGNER_URL':f'http://127.0.0.1:{args.service_port}','VARPET_DATA_DIR':temporary.name+'/accounts','VARPET_SHARES_DIR':temporary.name+'/shares'}
 commands=[([sdk,'-u',str(HERE/'acceptance-service.py'),'--port',str(args.service_port),'--output',str(output/'events')],ROOT,'service'),(['pnpm','--filter','@varpet/editor','exec','vite','--host','127.0.0.1','--port',str(args.editor_port),'--strictPort'],ROOT,'editor')]
 try:
  for command,cwd,name in commands:
   log=(output/(name+'.log')).open('wb');logs.append(log)
   services.append(subprocess.Popen(command,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True))
  for port in (args.service_port,args.editor_port):
   for _ in range(300):
    if any(service.poll() is not None for service in services):raise RuntimeError('Private service failed; inspect logs')
    try:
     with socket.create_connection(('127.0.0.1',port),timeout=.2):break
    except OSError:time.sleep(.1)
   else:raise RuntimeError('Private service startup timeout')
  def job(flat,repeat):
   directory=output/f'{flat}-{repeat}';directory.mkdir()
   command=['uv','run','--no-project','--with','playwright','python','-u',str(HERE/'acceptance_browser.py'),'--flat',flat,'--repeat',str(repeat),'--port',str(args.editor_port),'--events',str(output/'events'),'--output',str(directory)]
   if args.tier1_only or repeat>args.runs:command.append('--tier1-only')
   return watch.watched(command,directory/'browser.log')
  def per_flat(flat):
   for repeat in range(1,manifest['tier1_runs']+1):
    if watch.STOP.is_set():break
    code=job(flat,repeat)
    if code:print(json.dumps({'driver_exit':code,'flat':flat,'repeat':repeat}),flush=True)
  with ThreadPoolExecutor(max_workers=args.jobs) as pool:
   for future in as_completed([pool.submit(per_flat,flat) for flat in manifest['flats']]):future.result();write_report(output,manifest)
 finally:
  for service in services:
   try:os.killpg(service.pid,signal.SIGTERM)
   except ProcessLookupError:pass
  for service in services:
   try:service.wait(timeout=20)
   except subprocess.TimeoutExpired:watch.terminate_group(service)
  for log in logs:log.close()
  temporary.cleanup();rows=write_report(output,manifest)
 print(json.dumps({'output':str(output),'passed':sum(r.get('pass',False) for r in rows),'total':len(rows),'usage_limit':watch.STOP.is_set()}),flush=True)
 if watch.STOP.is_set() or not all(r.get('pass',False) for r in rows):raise SystemExit(1)
if __name__=='__main__':main()
