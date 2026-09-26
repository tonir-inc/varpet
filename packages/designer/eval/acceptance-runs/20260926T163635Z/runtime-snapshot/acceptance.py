"""One command: real browser/service baseline, guarded private ports, persistent evidence."""
import argparse,importlib.util,json,os,signal,socket,statistics,subprocess,sys,tempfile,time
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timezone
from pathlib import Path
import acceptance_grade as grade
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
spec=importlib.util.spec_from_file_location('acceptance_watchdog',HERE/'komitas-batch.py')
watch=importlib.util.module_from_spec(spec);spec.loader.exec_module(watch)
def selected_flats(komitas,include_balcony):return [komitas,'avani']+(['m6'] if include_balcony else [])

TIER1=['open','living','living-apply','cozier','cozier-apply','why','quote']

def observed_targets_met(rows):
 if not rows:return False
 groups={}
 for row in rows:groups.setdefault((row['flat'],row['tier'],row['key']),[]).append(row)
 return all(sum(bool(row.get('pass')) for row in group)/len(group)>=(1 if tier==1 else .8) for (_,tier,_),group in groups.items())

def write_report(output,manifest):
 output=output.resolve()
 rows=[]
 geometry_path=output/'geometry-captures.json'
 geometry={(r['flat'],r['repeat'],r['key']):r for r in json.loads(geometry_path.read_text())} if geometry_path.exists() else {}
 for flat in manifest['flats']:
  for repeat in range(1,manifest['tier1_runs']+1):
   run=output/f'{flat}-{repeat}'/'run.json'
   graded=run.with_name('graded.json')
   actual=json.loads((graded if graded.exists() else run).read_text())['rows'] if run.exists() else []
   expected=[(1,k) for k in TIER1]+([(2,s['key']) for s in grade.tier2('bedroom')] if repeat<=manifest['runs'] and not manifest['tier1_only'] else [])
   by={r['key']:r for r in actual}
   for tier,key in expected:rows.append(by.get(key,dict(flat=flat,repeat=repeat,tier=tier,key=key,pass_=False,failures=['not_run_or_driver_stopped'],seconds=None,tokens=None)))
 def stat(values):
  values=[x for x in values if x is not None]
  return f'{statistics.median(values):,.3f} / {max(values):,.3f}' if values else 'unknown'
 def escaped(value):return str(value).replace('|','/').replace('\n',' ')
 lines=['# Demo acceptance baseline',f"\nMeasured {manifest['started_at']} UTC; source `{manifest['source']}`. Fast path **ON**, production service defaults, real catalog `localhost:8765/mcp`, AMD, north 0. Two real editor browser sessions maximum; private ports {manifest['editor_port']}/{manifest['service_port']}. No designer fixes or response stubs.",
 f"\nKomitas **{manifest['flats'][0]}** is fixed before testing, not selected post hoc for a higher score. Avani is the actual editor portal template built from `demo.ts` via `createInitialScene` (empty furniture, production behavior). This baseline starts from pre-built shells; it does not test plan reconstruction.",
 '\n## Results', '', '| Flat / tier | Automated passes | Median / max seconds | Median / max tokens | Target |','|---|---:|---:|---:|---|']
 for flat in manifest['flats']:
  for tier in (1,2):
   group=[r for r in rows if r['flat']==flat and r['tier']==tier]
   if not group:continue
   passed=sum(r.get('pass',False) for r in group)
   lines.append(f"| {flat} / {tier} | {passed}/{len(group)} | {stat([r.get('seconds') for r in group])} | {stat([r.get('tokens') for r in group])} | {'100%' if tier==1 else '≥80%'} per step, 10 repeats; human screenshots pending |")
 for flat in manifest['flats']:
  complete=sum(all(any(r['flat']==flat and r['repeat']==repeat and r['key']==key and r.get('pass',False) for r in rows) for key in TIER1) for repeat in range(1,manifest['tier1_runs']+1))
  lines.append(f"\n**{flat}: golden conversations complete {complete}/{manifest['tier1_runs']}.** Open-only success cannot make the golden path pass.")
  lines += [f'\n## {flat}', '', '| Tier / step | Pass count | Editor accepted / returned proposals | Median / max seconds | Median / max tokens | Screenshots / failure text |','|---|---:|---:|---:|---:|---|']
  for tier,key in [(1,k) for k in TIER1]+[(2,s['key']) for s in grade.tier2('bedroom')]:
   group=[r for r in rows if r['flat']==flat and r['key']==key]
   if not group:continue
   proposals=[r for r in group if r.get('outcome')=='proposal']
   editor=f"{sum(r.get('editor_accepted') is True for r in proposals)}/{len(proposals)}" if proposals else '—'
   evidence=[]
   for r in group:
    link=f"[{r['repeat']}]({r['screenshot']})" if r.get('screenshot') else str(r['repeat'])+' (no capture)'
    errors='; '.join(r.get('failures',[]))
    capture=geometry.get((r['flat'],r['repeat'],r['key']))
    if capture and capture.get('complete'):link+=f" [top]({capture['screenshot']})"
    if errors:link+=' '+escaped(errors)
    evidence.append(link)
   lines.append(f"| {tier} / {key} | {sum(r.get('pass',False) for r in group)}/{len(group)} | {editor} | {stat([r.get('seconds') for r in group])} | {stat([r.get('tokens') for r in group])} | {'<br>'.join(evidence)} |")
 findings=output/'findings.md'
 if findings.exists():lines+=['\n'+findings.read_text()]
 lines+=['\n## Grading and limits',
 '- [Grading audit]('+str((output/'grading-audit.json').relative_to(HERE.resolve()))+'): original live grades remain in each `run.json`; `graded.json` records consistent offline checks against the exact same saved exports. Timings, replies, screenshots and token counts are never replaced.',
 '- Editor denominators count returned proposals, excluding service-rejected attempts. Measured UI acceptance requires clicking Apply and seeing Applied, plus exported before/after scenes. It is necessary but insufficient. Every step has a response/final UI screenshot plus a supplemental top view of the exact exported scene (deduplicated by content hash, editor WebGL renderer, captured after timing) and raw HTTP/SDK evidence; proposal Apply is a separate golden-path row. Request time includes UI response and Apply; screenshot/model-download/export overhead is excluded. Open time includes initial loading/export/capture. Apply time is also shown separately, so aggregate step times are not total conversation duration.',
 '- Independent Python geometry uses editor XZ coordinates, catalog dimensions and rotations. Living: sofa within 20° of a window span/TV, rug overlap, front coffee table edge gap 0.25–0.60 m, lamp, displayed total, widest 10 cm grid route ≥0.90 m including door width. Grid sampling subtracts half-diagonal clearance conservatively; screenshots need human review. Bedroom: double bed ≥1.35×1.80 m, solid headboard gap ≤0.25 m, nightstand each side, wardrobe, bed-side samples ≥0.60 m. No production request/layout checker grades its own output.',
 '- Cozier requires added rug/lamp/soft seating/plant or warmer wall colour and preservation of every previously chosen object ID. Named paint must cover the named room; apartment red covers all walls. Desk/armchair must be a new catalog subtype within 1.5 m of a window. Bigger furnished must retain inventory and increase an independently sampled largest open rectangle; empty must give an honest unchanged-scene explanation.',
 '- Why requires an actual layout, placement-specific prose and a numerical claim matching an independently measured coffee gap/open rectangle; this conservative proxy may reject other correct numerical explanations. Quote requires actual per-piece prices, matching total and a named shop/link per row; catalog prices are mock AMD and shop identity still requires human provenance review. No invented shop is established as real by a text match.',
 '- Assumed fast honest bathroom refusal threshold: ≤10 s. Failed-answer follow-up immediately follows the bathroom-bed refusal and must address that bed/bathroom request, with no unsafe edit. Tier 2 branches reset the editor and chat to the frozen initial or golden furnished snapshot, avoiding accidental cross-request dependencies; only furnished-bigger and sofa depend on golden furniture; desk/armchair start independently from the empty shell. Missing furnished prerequisites are explicit failures.',
 '- Automated passes are provisional until a human checks the linked screenshots and semantic explanations. Three repeats are a baseline, not evidence of 10/10 or ≥8/10 reliability. Missing outcomes/tokens remain unknown, never zero. No failed or blocked step is dropped from denominators.',
 '\n## Reproduce', '```sh','pnpm acceptance                       # 3 repeats per flat, both tiers','pnpm acceptance --tier1-runs 10        # golden path 10 each; Tier 2 remains 3','pnpm acceptance --runs 10              # both tiers 10 each','pnpm acceptance --include-balcony      # also the portal Balcony Apartment (m6)','pnpm acceptance --tier1-only --runs 10 # just the golden path','```',
 f"\n[Manifest and raw evidence]({output.relative_to(HERE.resolve())}/manifest.json). Each invocation creates a new timestamped directory; previous measurements are retained. Nonzero exit means a per-step target was missed (Tier 1 100%, Tier 2 ≥80%) or the driver failed. Passing three-repeat checks still does not certify ten-repeat reliability or human visual approval. Service/worker stdin is closed; 180-second model-output watchdog, 240-second worker-output watchdog, process-group cleanup; usage-limit stderr stops the batch. Requires the real catalog, authenticated Codex SDK (`VARPET_ACCEPTANCE_PYTHON` or `/tmp/varpet-designer-sdk/bin/python`), Chrome and `uv` for the Playwright driver."]
 # Preserve exact customer-visible failure copy separately from diagnostic codes.
 lines+=['\n## Customer-visible failure text']
 for r in rows:
  if not r.get('pass',False) and r.get('text'):lines.append(f"\n**{r['flat']} / run {r['repeat']} / {r['key']}**: {escaped(r['text'])}")
 (HERE/'acceptance.md').write_text('\n'.join(lines)+'\n')
 (output/'summary.json').write_text(json.dumps({'rows':rows,'observed_all_pass':all(r.get('pass',False) for r in rows),'observed_targets_met':observed_targets_met(rows)},indent=2,ensure_ascii=False)+'\n')
 return rows

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--runs',type=int,default=3);p.add_argument('--tier1-runs',type=int);p.add_argument('--tier1-only',action='store_true');p.add_argument('--flat',default='b21-t13');p.add_argument('--include-balcony',action='store_true');p.add_argument('--editor-port',type=grade.port,default=53220);p.add_argument('--service-port',type=grade.port,default=53221);p.add_argument('--jobs',type=int,choices=(1,2),default=2);p.add_argument('--report-only',type=Path);args=p.parse_args()
 if args.report_only:
  write_report(args.report_only,json.loads((args.report_only/'manifest.json').read_text()));return
 if not 1<=args.runs<=20 or not 1<=(args.tier1_runs or args.runs)<=20:p.error('runs must be 1–20')
 if args.tier1_runs and args.tier1_runs<args.runs:p.error('tier1-runs must be at least runs')
 if args.editor_port==args.service_port:p.error('ports must differ')
 for port in (args.editor_port,args.service_port):
  with socket.socket() as sock:sock.bind(('127.0.0.1',port))
 if not (HERE/'komitas'/f'{args.flat}.scene.json').exists():p.error('Published Komitas scene not found')
 stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ');output=HERE/'acceptance-runs'/stamp;output.mkdir(parents=True,exist_ok=False)
 manifest={'started_at':datetime.now(timezone.utc).isoformat(),'source':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'runs':args.runs,'tier1_runs':args.tier1_runs or args.runs,'tier1_only':args.tier1_only,'flats':selected_flats(args.flat,args.include_balcony),'editor_port':args.editor_port,'service_port':args.service_port}
 (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 signal.signal(signal.SIGTERM,lambda *_:watch.STOP.set())
 signal.signal(signal.SIGINT,lambda *_:watch.STOP.set())
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
    if code:
     print(json.dumps({'driver_exit':code,'flat':flat,'repeat':repeat}),flush=True)
     watch.STOP.set();break
  with ThreadPoolExecutor(max_workers=args.jobs) as pool:
   for future in as_completed([pool.submit(per_flat,flat) for flat in manifest['flats']]):future.result();write_report(output,manifest)
  if not watch.STOP.is_set():
   from acceptance_regrade import regrade
   regrade(output)
   code=watch.watched(['uv','run','--no-project','--with','playwright','python','-u',str(HERE/'acceptance-capture.py'),'--output',str(output),'--port',str(args.editor_port)],output/'geometry.log')
   if code:watch.STOP.set()
 finally:
  for service in services:
   try:os.killpg(service.pid,signal.SIGTERM)
   except ProcessLookupError:pass
  for service in services:
   try:service.wait(timeout=20)
   except subprocess.TimeoutExpired:watch.terminate_group(service)
  for log in logs:log.close()
  temporary.cleanup();rows=write_report(output,manifest)
 print(json.dumps({'output':str(output),'passed':sum(r.get('pass',False) for r in rows),'total':len(rows),'batch_stopped':watch.STOP.is_set()}),flush=True)
 if watch.STOP.is_set() or not observed_targets_met(rows):raise SystemExit(1)
if __name__=='__main__':main()
