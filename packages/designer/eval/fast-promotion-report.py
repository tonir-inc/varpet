"""Release evidence from unchanged Avani and BENCH graders; failures stay in denominators."""
import json, math
from pathlib import Path
from statistics import median
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[2]; RUNS=HERE/'fast-runs'
CLASSES={'avani-wall-blue':'appearance.walls','avani-living-rearrange':'rearrange.open-floor','avani-grouped-lounge':'move.group','i01-one-hundred-beds':'feasibility.area',
'living':'furnish.living','bedroom':'furnish.bedroom','sofa':'move.face-window','desk':'add.desk-window','paint':'appearance.walls','kids':'furnish.kids','structural':'scope.structural'}
def stats(values):
 v=sorted(x for x in values if x is not None)
 return {'median':median(v),'p90':v[math.ceil(.9*len(v))-1],'max':max(v)} if v else None
def summarize(rows):
 return {'attempts':len(rows),'passes':sum(r['pass'] for r in rows),'pass_rate':sum(r['pass'] for r in rows)/len(rows),
 'editor_accepts':sum(r.get('editor_accepted') is True for r in rows),'editor_attempts':sum(r.get('editor_accepted') is not None for r in rows),
 'seconds':stats([r['seconds'] for r in rows]),'tokens':stats([r['tokens'] for r in rows]),'unknown_token_runs':sum(r['tokens'] is None for r in rows)}
def collect():
 rows=[]
 for arm in ['before','after']:
  for batch in json.loads((RUNS/f'repeated-{arm}.json').read_text()):
   if batch['exit_code']:raise RuntimeError('Incomplete repeated cohort')
   folder=Path(batch['stdout'].splitlines()[0])
   for p in folder.glob('*.json'):
    if p.name=='manifest.json':continue
    r=json.loads(p.read_text());scenario=r['scenario'];m=r['measurement']
    rows.append({'arm':arm,'cohort':'avani-repeated','flat':'avani','case':scenario['id'],'class_id':CLASSES[scenario['id']],
    'phrasing':scenario['request'],'expected':scenario['expect'],'seconds':r['seconds'],'tokens':r['tokens'],'pass':m['pass'],
    'editor_accepted':(m.get('editor_check') or {}).get('ok'),'reasons':m['reasons'],'evidence':str(p.relative_to(ROOT))})
 # Entire stateful conversations are selected, never individual successful turns.
 sources={'before':{'b20-t11':'matrix-before','b21-t13':'matrix-before','b25-t72':'matrix-before-restored-valid','b28-t31':'matrix-before-restored-valid','b30-t35':'matrix-before-restored-valid','b31-t46':'matrix-before-skill-final'},
 'after':{'b20-t11':'matrix-after-restored','b21-t13':'matrix-after-restored','b25-t72':'matrix-after-restored','b28-t31':'matrix-after-watchdog-final','b30-t35':'matrix-after-restored','b31-t46':'matrix-after-skill-final'}}
 for arm,flats in sources.items():
  for flat,folder in flats.items():
   p=RUNS/folder/flat/'run.json';v=json.loads(p.read_text())
   if not v.get('finished_at'):raise RuntimeError(f'Incomplete conversation {p}')
   for r in v['rows']:
    rows.append({'arm':arm,'cohort':'komitas-six','flat':flat,'case':f"{flat}-{r['kind']}",'class_id':CLASSES[r['kind']],
    'phrasing':r['request'],'expected':{'kind':'decline' if r['kind']=='structural' else 'proposal'},'seconds':r['seconds'],'tokens':r['tokens'],
    'pass':r['pass'],'editor_accepted':r['editor_accepted'],'reasons':r['reasons'],'evidence':str(p.relative_to(ROOT))})
 # Final code-only appearance and scope cohorts supersede the measured model-selection version.
 paint_batches=json.loads((RUNS/'paint-deterministic-batches.json').read_text())
 rows=[r for r in rows if not (r['arm']=='after' and r['class_id']=='appearance.walls' and r['cohort']=='avani-repeated')]
 for batch in paint_batches:
  p=RUNS/batch/'avani-wall-blue.json';v=json.loads(p.read_text());m=v['measurement']
  rows.append({'arm':'after','cohort':'avani-repeated','flat':'avani','case':'avani-wall-blue','class_id':'appearance.walls','phrasing':v['scenario']['request'],'expected':v['scenario']['expect'],'seconds':v['seconds'],'tokens':v['tokens'],'pass':m['pass'],'editor_accepted':(m.get('editor_check') or {}).get('ok'),'reasons':m['reasons'],'evidence':str(p.relative_to(ROOT))})
 for name,kind in [('matched-paint-scope-rebased','structural'),('matched-paint-scope-rebased','paint')]:
  p=RUNS/name/'run.json';v=json.loads(p.read_text())
  v['rows']=[r for r in v['rows'] if r['kind']==kind]
  if len(v['rows'])!=6:raise RuntimeError('Incomplete six-flat final class run')
  for r in v['rows']:
   rows=[old for old in rows if not (old['arm']=='after' and old['case']==f"{r['flat']}-{kind}")]
   rows.append({'arm':'after','cohort':'komitas-six-final-isolated','flat':r['flat'],'case':f"{r['flat']}-{kind}",'class_id':CLASSES[kind],'phrasing':r['request'],'expected':{'kind':'decline' if kind=='structural' else 'proposal'},'seconds':r['seconds'],'tokens':r['tokens'],'pass':r['pass'],'editor_accepted':r['editor_accepted'],'reasons':r['reasons'],'evidence':str(p.relative_to(ROOT)),'event_log':r['event_log']})
 for arm in ['before','after']:
  p=RUNS/f'kids-{arm}-three-final'/'run.json';v=json.loads(p.read_text())
  if len(v['rows'])!=3:raise RuntimeError('Incomplete kids repetitions')
  for r in v['rows']:
   rows.append({'arm':arm,'cohort':'kids-isolated-three','flat':r['flat'],'case':r['flat']+'-kids-isolated','class_id':'furnish.kids','phrasing':r['request'],'expected':{'kind':'proposal'},'seconds':r['seconds'],'tokens':r['tokens'],'pass':r['pass'],'editor_accepted':r['editor_accepted'],'reasons':r['reasons'],'evidence':str(p.relative_to(ROOT)),'event_log':r['event_log']})
 return rows

def main():
 rows=collect();classes={}
 for cls in sorted(set(r['class_id'] for r in rows)):
  arms={arm:summarize([r for r in rows if r['class_id']==cls and r['arm']==arm]) for arm in ['before','after']}
  b,a=arms['before'],arms['after'];cases=set(r['case'] for r in rows if r['class_id']==cls)
  no_case_loss=all(summarize([r for r in rows if r['case']==case and r['arm']=='after'])['pass_rate']>=summarize([r for r in rows if r['case']==case and r['arm']=='before'])['pass_rate'] for case in cases)
  wins=min(b['attempts'],a['attempts'])>=3 and a['passes']>0 and no_case_loss and a['seconds']['median']<min(15,b['seconds']['median'])
  if cls in ('scope.structural','feasibility.area'):wins=wins and a['seconds']['max']<3
  classes[cls]={'measurements':arms,'default':wins,'no_case_pass_loss':no_case_loss}
 evidence={'measured_at':'2026-09-26 UTC','model':'gpt-6-astra','effort':'low','classes':classes,'rows':rows,
 'limits':'N<30 is descriptive. Avani three repetitions/class; Komitas six distinct flats/class, two eligible kids flats plus three paired isolated kids repetitions. Final scope and paint replay exact saved before-request scenes and catalogs in fresh threads; earlier stateful versions remain archived. Stateful edits differ when proposals pass. Partial/infrastructure runs retained, excluded only from matched cohorts, never because of answer quality. After Komitas host load was high; all latency retained. Catalog acceleration measured separately.'}
 (RUNS/'promotion-report.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
 cases=[]
 for case in sorted(set(r['case'] for r in rows)):
  records=[r for r in rows if r['case']==case];sample=records[0]
  cases.append({'id':case,'class_id':sample['class_id'],'phrasing':sample['phrasing'],'expected':sample['expected'],
  'measurements':{arm:summarize([r for r in records if r['arm']==arm]) for arm in ['before','after']},'evaluations':records})
 (HERE.parent/'knowledge/cases.json').write_text(json.dumps({'version':2,'model':evidence['model'],'limits':evidence['limits'],'cases':cases},ensure_ascii=False,indent=2)+'\n')
 registry={'version':1,'classes':[cls for cls,v in classes.items() if v['default']],'evidence':'packages/designer/eval/fast-runs/promotion-report.json','rule':'At least three runs per arm, some independently passing outcomes, no per-case pass-rate loss, lower median under15s; proven declines max under3s. Zero-pass speedups remain experimental.'}
 (HERE.parent/'knowledge/fast-defaults.json').write_text(json.dumps(registry,indent=2)+'\n')
 print(json.dumps(classes,indent=2))
if __name__=='__main__':main()
