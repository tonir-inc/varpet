"""Read-only timing extraction from real SDK events; no inferred model-only timing."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent

def events(path):
    result=[];stdout=[]
    for line in path.read_text().splitlines():
        record=json.loads(line)
        if record.get('kind')=='process_output' and record.get('channel')=='stdout':
            stdout.append(record['chunk'])
        elif record.get('kind')=='sdk':result.append(record['event'])
        elif record.get('method'):result.append(record)
    for line in ''.join(stdout).splitlines():
        try:result.append(json.loads(line))
        except ValueError:pass
    return result

rows=[]
report=json.loads((HERE/'fast-runs/promotion-report.json').read_text())
expanded=HERE/'fast-runs/real-catalog-report.json'
if expanded.exists():report['rows']+=json.loads(expanded.read_text())['rows']
kind_of={'furnish.living':'living','furnish.bedroom':'bedroom','furnish.kids':'kids','move.face-window':'sofa','add.desk-window':'desk','appearance.walls':'paint','scope.structural':'structural'}
for record in report['rows']:
    path=ROOT/record['evidence']
    if record.get('event_log'):log=ROOT/record['event_log']
    elif path.name=='run.json':log=path.parent/f"{kind_of[record['class_id']]}-sdk.events.jsonl"
    else:log=path.with_suffix('.jsonl')
    stream=events(log);calls=[];rounds=set()
    for event in stream:
        payload=event.get('payload',{})
        if event.get('method')=='thread/tokenUsage/updated':
            usage=payload.get('tokenUsage',{})
            if usage.get('last',{}).get('totalTokens',0)>0:rounds.add((payload.get('threadId'),payload.get('turnId'),usage.get('total',{}).get('totalTokens')))
        item=payload.get('item',{})
        if event.get('method')=='item/completed' and item.get('type')=='mcpToolCall':calls.append(item)
    tools=sum(c.get('durationMs',0) for c in calls)/1000
    fast=[e for e in stream if e.get('kind')=='fast_path'];selected=[e for e in stream if e.get('kind')=='fast_proposal']
    stages=[{k:e[k] for k in ('stage','seconds','returncode') if k in e} for e in (json.loads(line) for line in log.read_text().splitlines()) if e.get('kind')=='process_end']
    rows.append({'id':record['case'],'class_id':record['class_id'],'arm':record['arm'],'total_seconds':record['seconds'],
        'rounds':len(rounds),'tool_calls':len(calls),'tools_seconds':tools,'process_stages':stages,
        'proposal_checks_seconds':sum(c.get('durationMs',0) for c in calls if c.get('tool') in ('propose','check_layout','score_layout'))/1000+sum(e.get('checks_ms',0)/1000 for e in selected),
        'fast_preparation':fast,'model_window_seconds':sum(e.get('model_seconds',0) for e in selected) if selected else None,
        'outside_tools_seconds':record['seconds']-tools,'evidence':str(log.relative_to(ROOT))})
output=HERE/'fast-runs/timings.json'
output.write_text(json.dumps({'basis':'Measured SDK tool durations and fast model-call window. General model/network/startup time is inseparable; residual is not model-only time.','rows':rows},indent=2)+'\n')
print(f'{len(rows)} per-request timing records: {output}')
