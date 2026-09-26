"""Three matched flats/class on the expanded live catalog; infrastructure reruns stay archived."""
import json, math
from pathlib import Path
from statistics import median
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[2]; RUNS=HERE/'fast-runs'
def stats(values):
 v=sorted(x for x in values if x is not None)
 return {'median':median(v),'p90':v[math.ceil(.9*len(v))-1],'max':max(v)} if v else None
rows=[]
for arm in ['before','after']:
 for flat in ['b20-t11','b21-t13','b28-t31']:
  retry=flat!='b20-t11' if arm=='before' else flat=='b28-t31'
  folder=RUNS/f"real-catalog-{arm}{'-retry' if retry else ''}"
  data=json.loads((folder/'run.json').read_text())
  for kind in ['desk','bedroom']:
   r=next(r for r in data['rows'] if r['flat']==flat and r['kind']==kind)
   if r['reply'].get('type')=='error' and 'SyntaxError:' in r['reply'].get('message',''):raise RuntimeError('Incomplete infrastructure replacement')
   if 'tokens' not in r:raise RuntimeError('Enrich telemetry before reporting')
   rows.append({**r,'case':f'{flat}-{kind}-expanded-catalog','class_id':'add.desk-window' if kind=='desk' else 'furnish.bedroom','evidence':str((folder/'run.json').relative_to(ROOT))})
classes={}
for kind in ['desk','bedroom']:
 arms={}
 for arm in ['before','after']:
  subset=[r for r in rows if r['kind']==kind and r['arm']==arm]
  arms[arm]={'attempts':len(subset),'passes':sum(r['pass'] for r in subset),'pass_rate':sum(r['pass'] for r in subset)/len(subset),'editor_accepts':sum(r['editor_accepted'] is True for r in subset),'editor_attempts':sum(r['editor_accepted'] is not None for r in subset),'seconds':stats([r['seconds'] for r in subset]),'tokens':stats([r['tokens'] for r in subset]),'unknown_token_runs':sum(r['tokens'] is None for r in subset)}
 classes[kind]=arms
# Every selected pair must preserve the exact input, including the catalog.
for flat in ['b20-t11','b21-t13','b28-t31']:
 for kind in ['desk','bedroom']:
  pair=[next(r for r in rows if r['flat']==flat and r['kind']==kind and r['arm']==arm) for arm in ['before','after']]
  inputs=[json.loads((ROOT/Path(r['evidence']).parent/f'{flat}-{kind}-1-request.json').read_text()) for r in pair]
  assert all(inputs[0][k]==inputs[1][k] for k in ['scene','catalog','request','northDeg','catalogCurrency'])
report={'measured_at':'2026-09-26 UTC','model':'gpt-6-astra','effort':'low','catalog_assets':len(inputs[0]['catalog']),'classes':classes,'rows':rows,'limits':'Three distinct flats per class and arm. Exact inputs match. Complete flat replacements exclude only rebase SyntaxError infrastructure failures; initial traces, including ordinary failures, remain archived. Catalog endpoint still maps shop desks to table, wardrobe/nightstand to cabinet; real SKU/GLB/dimensions retained. Native kinds are accepted without coercion when supplied. N=3 is descriptive. No promotion from zero passes.'}
(RUNS/'real-catalog-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
cases=[]
for flat in ['b20-t11','b21-t13','b28-t31']:
 for kind in ['desk','bedroom']:
  evaluations=[r for r in rows if r['flat']==flat and r['kind']==kind]
  cases.append({'id':f'{flat}-{kind}-expanded-catalog','class_id':evaluations[0]['class_id'],'phrasing':evaluations[0]['request'],'expected':{'kind':'proposal'},'evaluations':evaluations})
(HERE.parent/'knowledge/cases-expanded-catalog.json').write_text(json.dumps({'version':1,'classes':classes,'cases':cases,'limits':report['limits']},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(classes,indent=2))
