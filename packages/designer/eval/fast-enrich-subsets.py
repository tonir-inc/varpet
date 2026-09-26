"""Attach the recorder's measured telemetry to completed isolated runs."""
from pathlib import Path
import json,shutil
ROOT=Path(__file__).resolve().parent/'fast-runs'
for name in ['scope-zero-process-final','kids-before-three-final','kids-after-three-final','paint-deterministic-final','matched-paint-scope-rebased','real-catalog-before','real-catalog-after']:
 p=ROOT/name/'run.json'
 if not p.exists():continue
 data=json.loads(p.read_text())
 for row in data['rows']:
  events=Path('/tmp/varpet-fast-matrix-final-'+row['arm']+'-events')
  candidates=list(events.glob(f"{row['arm']}-{row['flat']}-{row['kind']}-{row['repetition']}-*.events.jsonl"))
  matches=[]
  for log in candidates:
   records=[json.loads(line) for line in log.read_text().splitlines()]
   telemetry=[r for r in records if r.get('kind')=='turn_telemetry' and r.get('conversation_id')==row['reply'].get('conversationId')]
   if telemetry:matches.append((log,telemetry[-1]))
  if len(matches)!=1:raise RuntimeError(f'Telemetry ambiguous: {name} {row}')
  log,telemetry=matches[0];target=p.parent/f"{row['flat']}-{row['kind']}-{row['repetition']}-sdk.events.jsonl";shutil.copyfile(log,target)
  row['tokens']=(telemetry.get('usage') or {}).get('totalTokens');row['usage']=telemetry.get('usage');row['actual_profile']={k:telemetry[k] for k in ['model','effort','profile']};row['event_log']=str(target.relative_to(ROOT.parent.parent.parent.parent))
 p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
