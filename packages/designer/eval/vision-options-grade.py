"""Independent post-run request checks; visual verdicts are supplied separately, never by the proposal critic."""
import argparse,hashlib,json,math,statistics
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('directory',type=Path);args=p.parse_args();root=args.directory
read=lambda p:json.loads(p.read_text())
rows=read(root/'rows.json');catalog={a['id']:a for a in read(root/'catalog.json')}
manual=read(root/'visual-verdicts.json') if (root/'visual-verdicts.json').exists() else {}
def inside(point,polygon):
 x,y=point;hit=False
 for a,b in zip(polygon,polygon[1:]+polygon[:1]):
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:hit=not hit
 return hit
def grade(row):
 before=read(root/(row['id']+'-before.json'))['scene'];after=read(root/(row['id']+'-after.json'))['scene'];scenario=row['scenario'];checks={}
 objs=lambda s:{o['id']:o for o in s['objects']}
 b,a=objs(before),objs(after);added=[o for id,o in a.items() if id not in b];removed=[id for id in b if id not in a];changed=[id for id in a if id in b and a[id]!=b[id]]
 checks['shell_unchanged']={k:v for k,v in before.items() if k!='objects'}=={k:v for k,v in after.items() if k!='objects'}
 if scenario=='floor':checks['no_edits']=before==after;checks['answer_returned']=row['outcome'] in ['message','decline']
 else:
  checks['editor_accepts']=row.get('editor_accepted') is True
  roomid='bedroom' if scenario=='bedroom' else 'living' if scenario=='reading' else 'room-living'
  room=next(r for r in before['rooms'] if r['id']==roomid)
  checks['other_rooms_unchanged']=all(a.get(id)==o for id,o in b.items() if not inside((o['position'][0],o['position'][2]),room['polygon']))
  checks['additions_in_requested_room']=all(inside((o['position'][0],o['position'][2]),room['polygon']) for o in added)
  kinds=[catalog[o['assetId']].get('kind','') for o in added]
  if scenario=='corner':
   checks['only_owned_chair_changed']=not added and not removed and changed==['lounge-chair']
   chair=a.get('lounge-chair');sofa=a.get('sofa');dx=sofa['position'][0]-chair['position'][0];dz=sofa['position'][2]-chair['position'][2];angle=math.atan2(dx,dz)
   error=abs((chair['rotation']-angle+math.pi)%(2*math.pi)-math.pi)
   checks['chair_faces_sofa_within_20_degrees']=error<=math.radians(20)
  elif scenario=='accent':checks['only_one_replacement_chair']=len(added)==1 and kinds==['chair'] and removed==['lounge-chair'] and not changed
  elif scenario=='reading':checks['one_chair_and_shelf']=len(added)==2 and sorted(kinds)==['chair','shelf'] and not removed and not changed
  elif scenario=='bedroom':checks['sleeping_and_bedside_essentials']='bed' in kinds and sum(k in ['table','cabinet','nightstand'] for k in kinds)>=2 and kinds.count('lamp')>=2
  elif scenario=='ashot':
   final_kinds=[catalog[o['assetId']].get('kind','') for o in a.values() if inside((o['position'][0],o['position'][2]),room['polygon'])]
   checks['complete_seating_group']=all(k in final_kinds for k in ['sofa','chair','rug','lamp','table'])
 scenehash=hashlib.sha256(json.dumps(after,sort_keys=True).encode()).hexdigest()[:16]
 visual=manual.get(row['id'],manual.get(scenehash))
 return {'id':row['id'],'scene_hash':scenehash,'checks':checks,'operation_pass':all(checks.values()),'visual':visual,'request_pass':all(checks.values()) and bool(visual and visual['pass'])}
graded=[grade(row) for row in rows if (root/(row['id']+'-after.json')).exists()]
(root/'adjudications.json').write_text(json.dumps(graded,indent=2)+'\n')
g={r['id']:r for r in graded};baseline={(r['scenario'],r['rep'],r['turn']):r for r in rows if r['arm']=='text'}
median=lambda xs:round(statistics.median(xs),3) if xs else None
stats={}
for arm in ['text','view','products','selfcheck','plan']:
 r=[r for r in rows if r['arm']==arm];pairs=[(v,baseline[(v['scenario'],v['rep'],v['turn'])]) for v in r if (v['scenario'],v['rep'],v['turn']) in baseline]
 stats[arm]={'n':len(r),'proposals':sum(v['outcome']=='proposal' for v in r),'accepted':sum(v.get('editor_accepted') is True for v in r),'operation_pass':sum(g.get(v['id'],{}).get('operation_pass',False) for v in r),'request_pass':sum(g.get(v['id'],{}).get('request_pass',False) for v in r),'seconds_median':median([v['seconds'] for v in r if 'seconds' in v]),'seconds_max':max((v['seconds'] for v in r if 'seconds' in v),default=None),'tokens_median':median([v['total_tokens'] for v in r if v.get('total_tokens') is not None]),'tokens_known':sum(v.get('total_tokens') is not None for v in r),'paired_seconds_delta_median':median([a['seconds']-b['seconds'] for a,b in pairs if 'seconds' in a and 'seconds' in b]),'paired_tokens_delta_median':median([a['total_tokens']-b['total_tokens'] for a,b in pairs if a.get('total_tokens') is not None and b.get('total_tokens') is not None])}
(root/'comparison.json').write_text(json.dumps(stats,indent=2)+'\n');print(json.dumps(stats,indent=2))
# Blinded render IDs hide arm and repetition; identical scenes share one render.
queue={}
for row in rows:
 if row.get('editor_accepted') is True:
  key=g[row['id']]['scene_hash'];queue.setdefault(key,{'id':key,'scene_file':row['id']+'-after.json','runs':[]})['runs'].append(row['id'])
(root/'render-queue.json').write_text(json.dumps(list(queue.values()),indent=2)+'\n')

# Reproduce catalog-availability and preview-duration evidence from lossless SDK events.
import gzip
tool_evidence=[]
for row in rows:
 path=root/(row['id']+'.events.jsonl')
 if path.exists():raw=path.read_text()
 elif path.with_suffix(path.suffix+'.gz').exists():
  with gzip.open(path.with_suffix(path.suffix+'.gz'),'rt') as stream:raw=stream.read()
 else:continue
 chunks=''.join(record['chunk'] for record in map(json.loads,raw.splitlines()) if record.get('kind')=='process_output' and record.get('channel')=='stdout')
 calls=[]
 for line in chunks.splitlines():
  try:event=json.loads(line)
  except ValueError:continue
  item=event.get('payload',{}).get('item',{})
  if event.get('method')=='item/completed' and item.get('type')=='mcpToolCall':calls.append(item)
 unavailable=False
 def contains_unavailable(value):
  if isinstance(value,dict):return value.get('status')=='unavailable' or any(contains_unavailable(v) for v in value.values())
  if isinstance(value,list):return any(contains_unavailable(v) for v in value)
  if isinstance(value,str):
   try:return contains_unavailable(json.loads(value)) if value.startswith(('{','[')) else False
   except ValueError:return False
  return False
 unavailable=any(contains_unavailable(call.get('result',{})) for call in calls)
 shows=[{'seconds':call.get('durationMs',0)/1000,'status':call.get('status'),'ids':call.get('arguments',{}).get('item_ids')} for call in calls if call.get('tool')=='show_candidates']
 tool_evidence.append({'id':row['id'],'catalog_unavailable':unavailable,'show_candidates':shows,'tool_calls':len(calls)})
(root/'tool-evidence.json').write_text(json.dumps(tool_evidence,indent=2)+'\n')
