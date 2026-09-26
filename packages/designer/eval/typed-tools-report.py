"""Summarize immutable paired recordings; reuse BENCH's independent acceptance grader."""
from pathlib import Path
import argparse
import hashlib
import json
import math
import statistics
from acceptance_grade import grade

def sdk(path):
    records=[json.loads(line) for line in path.read_text().splitlines()]
    stream=''.join(r.get('chunk','') for r in records if r.get('kind')=='process_output' and r.get('channel')=='stdout')
    events=[]
    for line in stream.splitlines():
        try: events.append(json.loads(line))
        except ValueError: pass
    rounds=set();calls=[];modes=[];phases=[]
    for event in events:
        if event.get('kind')=='tool_mode_audit':modes.append(event)
        payload=event.get('payload',{});item=payload.get('item',{})
        if event.get('method')=='thread/tokenUsage/updated':
            usage=payload.get('tokenUsage',{})
            if usage.get('last',{}).get('totalTokens',0)>0:rounds.add((payload.get('threadId'),payload.get('turnId'),usage.get('total',{}).get('totalTokens')))
        if event.get('method')=='item/completed' and item.get('type') in ('mcpToolCall','customToolCall','dynamicToolCall','commandExecution'):
            calls.append({'type':item['type'],'tool':item.get('tool',item.get('name')),'seconds':item.get('durationMs',0)/1000})
            for part in (item.get('result') or {}).get('content',[]):
                if part.get('type')!='text':continue
                try:value=json.loads(part['text'])
                except (ValueError,TypeError):continue
                if isinstance(value,dict) and value.get('timing'):phases.append(value['timing'])
    return {'rounds':len(rounds) if rounds else None,'calls':calls,'exec_calls':sum(c['type']=='commandExecution' or c['tool'] in ('exec','functions.exec','code_execution','exec_command') for c in calls),'non_mcp_calls':sum(c['type']!='mcpToolCall' for c in calls),'tool_seconds':sum(c['seconds'] for c in calls),'tool_modes':modes,'plan_timing':phases}

def stats(rows):
    def distribution(values):
        values=sorted(v for v in values if v is not None)
        return None if not values else {'median':round(statistics.median(values),3),'p90':round(values[math.ceil(len(values)*.9)-1],3),'max':round(max(values),3)}
    return {'n':len(rows),'runner_pass':sum(r['runner_pass'] for r in rows),'partial_accepted':sum(r['editor_accepted'] is True and r['description'].startswith('Partial layout:') for r in rows),'within_two_rounds':sum(r['audit']['rounds'] is not None and r['audit']['rounds']<=2 for r in rows),'unknown_rounds':sum(r['audit']['rounds'] is None for r in rows),'missing_traces':sum(r['audit'].get('missing_trace',False) for r in rows),'acceptance_pass':sum(r['acceptance']['pass'] for r in rows),'editor_accepted':sum(r['editor_accepted'] is True for r in rows),'proposals':sum(r['outcome']=='proposal' for r in rows),'seconds':distribution(r['seconds'] for r in rows),'tokens':distribution(r['tokens'] for r in rows),'rounds':distribution(r['audit']['rounds'] for r in rows),'exec_calls':sum(r['audit']['exec_calls'] for r in rows)}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--runs',type=Path,default=Path(__file__).parent/'typed-tools-runs');parser.add_argument('--output',type=Path,required=True);parser.add_argument('--partial',action='store_true',help='Explicitly label incomplete diagnostic output')
    args=parser.parse_args();rows=[];sources={};files={};completed=set()
    kinds={'living','bedroom','kids','cozier','why'}
    expected={f'{phase}-portal-{flat}-{n}' for phase in ('before','after') for flat in ('avani','balcony','b21-t13') for n in (1,2,3)}
    expected.update('robustness-'+p.name.removesuffix('.scene.json') for p in (Path(__file__).parent/'komitas').glob('*.scene.json') if p.name!='b21-t13.scene.json' and '.drawn.' not in p.name)
    for phase in ('before','after','robustness'):
        pattern='robustness-*' if phase=='robustness' else phase+'-portal-*'
        for folder in sorted(args.runs.glob(pattern)):
            if not (folder/'run.json').exists():continue
            run=json.loads((folder/'run.json').read_text());sources[folder.name]=run['source']
            if run.get('finished_at') and len(run['rows'])==5 and {r['kind'] for r in run['rows']}==kinds:completed.add(folder.name)
            for original in run['rows']:
                kind=original['kind'];before=json.loads((folder/(kind+'-request.json')).read_text())['scene'];after=json.loads((folder/(kind+'-after.json')).read_text())
                # QUALITY's kids rubric includes program, scope, access and play-space checks.
                acceptance={'pass':original['pass'],'failures':original['reasons'],'rubric':'QUALITY/BENCH Komitas kids'} if kind=='kids' else grade(kind,before,after['scene'],after['catalog'],original['reply'],original['editor_accepted'],original['description'],original['seconds'])
                event_path=folder/(kind+'-sdk.events.jsonl')
                audit=sdk(event_path) if event_path.exists() else {'rounds':None,'calls':[],'exec_calls':0,'missing_trace':True}
                rows.append({'phase':phase,'run':folder.name,'flat':run['id'],'kind':kind,'tier':1 if kind in ('living','cozier','why') else 2,'runner_pass':original['pass'],'acceptance':acceptance,'editor_accepted':original['editor_accepted'],'outcome':original['outcome'],'seconds':original['seconds'],'tokens':original['tokens'],'description':original['description'],'audit':audit})
            for path in folder.glob('*'):
                if path.is_file():files[str(path.relative_to(args.runs))]=hashlib.sha256(path.read_bytes()).hexdigest()
    summary={phase:{kind:stats([r for r in rows if r['phase']==phase and r['kind']==kind]) for kind in ('living','bedroom','kids','cozier','why')} for phase in ('before','after','robustness')}
    tiers={phase:{tier:stats([r for r in rows if r['phase']==phase and r['tier']==tier]) for tier in (1,2)} for phase in ('before','after','robustness')}
    flats={phase:{flat:{kind:stats([r for r in rows if r['phase']==phase and r['flat']==flat and r['kind']==kind]) for kind in ('living','bedroom','kids','cozier','why')} for flat in ('avani','balcony','b21-t13')} for phase in ('before','after')}
    incomplete=sorted(expected-completed)
    if incomplete and not args.partial:raise ValueError('Incomplete cohort; final report refused: '+', '.join(incomplete))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps({'status':'incomplete' if incomplete else 'complete','incomplete_runs':incomplete,'sources':sources,'summary':summary,'tiers':tiers,'flats':flats,'rows':rows,'files_sha256':files},indent=2)+'\n')
    print(json.dumps(summary,indent=2))

if __name__=='__main__':main()
