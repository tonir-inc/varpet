"""Compare frozen acceptance cohorts without pooling new flats into old denominators."""
import argparse,json,statistics
from pathlib import Path

def stats(rows):
 if not rows:return None
 result={'passed':sum(bool(r.get('pass')) for r in rows),'total':len(rows)}
 for field in ('seconds','tokens'):
  values=[r[field] for r in rows if r.get(field) is not None]
  result[field+'_median']=statistics.median(values) if values else None
  result[field+'_max']=max(values) if values else None
  result[field+'_unknown']=len(rows)-len(values)
 proposals=[r for r in rows if r.get('outcome')=='proposal']
 result.update(proposals=len(proposals),accepted=sum(r.get('editor_accepted') is True for r in proposals))
 return result

def compare(before,after):
 keys=sorted({(r['flat'],r['tier'],r['key']) for r in before+after})
 return [dict(flat=flat,tier=tier,key=key,**{label:stats([r for r in rows if (r['flat'],r['tier'],r['key'])==(flat,tier,key)]) for label,rows in [('before',before),('after',after)]}) for flat,tier,key in keys]

def write_comparison(before_dir,after_dir):
 before=json.loads((before_dir/'summary.json').read_text())['rows'];after=json.loads((after_dir/'summary.json').read_text())['rows']
 source=json.loads((after_dir/'manifest.json').read_text());product=source.get('product_source',source['source'])
 baseline=json.loads((before_dir/'manifest.json').read_text());old_product=baseline.get('product_source',baseline['source'])
 rows=compare(before,after)
 def pass_count(value):return f"{value['passed']}/{value['total']}" if value else 'not run'
 def metric(value,key):
  if not value:return 'not run'
  median=value[key+'_median'];maximum=value[key+'_max'];unknown=value[key+'_unknown']
  return ('unknown' if median is None else f'{median:,.3f}/{maximum:,.3f}')+(f' ({unknown} unknown)' if unknown else '')
 def accepted(value):return f"{value['accepted']}/{value['proposals']}" if value else 'not run'
 lines=['## Before / after: frozen baseline versus latest-main rerun','',f'**Measured product code:** before `{old_product}`; after `{product}` (runner `{source["source"]}`). Same independent rubric; repeats per flat: Tier 1 {baseline["tier1_runs"]} → {source["tier1_runs"]}, Tier 2 {baseline["runs"]} → {source["runs"]}. The Balcony Apartment (`m6`) is an additional cohort; it has no before measurement. Every failed or unrun step remains in its denominator. Editor acceptance counts only returned proposals. Times include response and Apply; tokens include cached input. No designer fixes were made by this lane.','', '| Flat / tier | Before passes | After passes | Before median/max s | After median/max s | Before median/max tokens | After median/max tokens | Before → after editor accepted/returned |','|---|---:|---:|---:|---:|---:|---:|---|']
 for flat in dict.fromkeys(r['flat'] for r in before+after):
  for tier in (1,2):
   a=stats([r for r in before if r['flat']==flat and r['tier']==tier]);b=stats([r for r in after if r['flat']==flat and r['tier']==tier])
   lines.append(f'| {flat} / {tier} | {pass_count(a)} | {pass_count(b)} | {metric(a,"seconds")} | {metric(b,"seconds")} | {metric(a,"tokens")} | {metric(b,"tokens")} | {accepted(a)} → {accepted(b)} |')
 lines+=['','Tier 1 counts above include open/Apply steps. Complete golden conversations, requiring all seven steps:']
 keys={'open','living','living-apply','cozier','cozier-apply','why','quote'}
 for flat in dict.fromkeys(r['flat'] for r in before+after):
  counts=[]
  for cohort in (before,after):
   group=[r for r in cohort if r['flat']==flat and r['tier']==1];repeats={r['repeat'] for r in group}
   counts.append(f"{sum(all(any(r['repeat']==n and r['key']==key and r.get('pass') for r in group) for key in keys) for n in repeats)}/{len(repeats)}" if repeats else 'not run')
  lines.append(f'\n- **{flat}: {counts[0]} → {counts[1]}**.')
 lines+=['','| Flat / tier / request | Before passes | After passes |','|---|---:|---:|']
 for r in rows:lines.append(f"| {r['flat']} / {r['tier']} / {r['key']} | {pass_count(r['before'])} | {pass_count(r['after'])} |")
 lines+=['',f'[Earlier raw cohort](acceptance-runs/{before_dir.name}/manifest.json) · [Current raw cohort](acceptance-runs/{after_dir.name}/manifest.json). Per-run screenshot links and failure text follow below. Three repeats are a baseline, not ten-repeat certification; human review remains required.']
 (after_dir/'comparison.md').write_text('\n'.join(lines)+'\n')
 (after_dir/'comparison.json').write_text(json.dumps(rows,indent=2)+'\n')
 return rows
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('before',type=Path);p.add_argument('after',type=Path);args=p.parse_args();write_comparison(args.before,args.after)
