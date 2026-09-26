"""Extract reproducible per-turn usage, process timings and tool evidence from service logs."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('arm', type=Path)
parser.add_argument('events', type=Path)
args = parser.parse_args()
for state in args.arm.glob('*.json'):
    data = json.loads(state.read_text())
    if not isinstance(data, dict) or 'turns' not in data:
        continue
    telemetry = []
    for i in range(len(data['turns'])):
        source = args.events / f'taste-{data["id"]}-{i}.events.jsonl'
        events = [json.loads(line) for line in source.read_text().splitlines()]
        record = [e for e in events if e.get('kind') == 'turn_telemetry'][-1]
        record['processes'] = [{k: e[k] for k in ('stage', 'seconds', 'returncode') if k in e}
                               for e in events if e.get('kind') == 'process_end']
        record['tools'] = []
        for event in events:
            if event.get('kind') != 'process_output':
                continue
            for line in event.get('chunk', '').splitlines():
                try:
                    detail = json.loads(line)
                except ValueError:
                    continue
                item = detail.get('payload', {}).get('item', {})
                if detail.get('method') == 'item/completed' and item.get('type') == 'mcpToolCall':
                    record['tools'].append({k: item.get(k) for k in
                                            ('tool', 'arguments', 'durationMs', 'status', 'result')})
        telemetry.append(record)
    state.with_name(state.stem + '-telemetry.json').write_text(json.dumps(telemetry, indent=2))
