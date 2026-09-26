#!/usr/bin/env python3
"""Paired fast-path evaluation, reusing measure.ts; never edits BENCH inputs or grader."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import uuid

import run as reference
import designer
from designer_fast import code_call


def execute(scenario, batch, arm, warm):
    source = reference.load_scene_input(scenario)
    transcript = designer.Transcript(batch / (scenario['id'] + '.jsonl'))
    transcript.write('input', scenario=scenario, **source)
    events, pending = [], ''
    def output(channel, chunk):
        nonlocal pending
        if channel == 'stderr':
            transcript.write('stderr', text=chunk)
            return
        pending += chunk
        while '\n' in pending:
            line, pending = pending.split('\n', 1)
            try:
                event = json.loads(line)
            except ValueError:
                transcript.write('stdout', text=line)
                continue
            events.append(event)
            transcript.write('sdk', event=event)
    with tempfile.TemporaryDirectory(prefix='varpet-fast-eval-') as directory:
        root = Path(directory)
        runtime = designer.prepare_runtime(root, source['scene'])
        prep_seconds = None
        if warm and arm == 'after':
            start = time.monotonic()
            precomputed = code_call({'action': 'prepare', 'scene': source['scene'], 'catalog': source.get('catalog', []),
                                    'request': scenario['request'], 'cache_dir': str(Path(runtime['workspace']).parent / 'fast-cache')}, timeout=180)
            prep_seconds = time.monotonic()-start
            transcript.write('precompute', seconds=prep_seconds, **precomputed)
        job = root / 'job.json'
        job.write_text(json.dumps({'runtime': runtime, 'request': scenario['request'], 'catalog': source.get('catalog', []), 'catalogCurrency':'AMD',
                                   'effort': 'low', 'profile': {'placement': 'without-place', 'context': 'compact-base', 'fast_path': arm == 'after'}}))
        result = designer.watch_process([sys.executable, '-u', str(reference.ROOT / 'harness/designer.py'), '--worker', str(job)],
                                        on_output=output, deadline=time.monotonic()+240, idle_timeout=180)
    summary = reference.summarize_events(events)
    fast = [e for e in events if e.get('kind') == 'fast_proposal']
    if fast and fast[-1]['result'].get('ok'):
        summary['proposal'] = fast[-1]['result']['proposal']
    prepared = [e for e in events if e.get('kind') == 'fast_path']
    calls = [e['payload']['item'] for e in events if e.get('method') == 'item/completed' and e.get('payload', {}).get('item', {}).get('type') == 'mcpToolCall']
    tool_ms = sum(c.get('durationMs', 0) for c in calls)
    check_ms = sum(c.get('durationMs', 0) for c in calls if c.get('tool') in ('propose', 'check_layout', 'score_layout'))
    record = {**source, **summary, 'scenario': scenario, 'arm': arm, 'warm': warm, 'precompute_seconds': prep_seconds,
              'seconds': result.seconds, 'returncode': result.returncode, 'usage_limited': result.usage_limited,
              'telemetry': {'tools_seconds': tool_ms/1000, 'checks_seconds_in_tools': check_ms/1000,
                            'outside_tools_seconds': result.seconds-tool_ms/1000, 'fast': prepared,
                            'selection': [{k:v for k,v in e.items() if k!='result'} for e in fast]},
              'measured_at': datetime.now(timezone.utc).isoformat()}
    record['measurement'] = reference.score(record)
    (batch / (scenario['id'] + '.json')).write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps({'id': scenario['id'], 'seconds': round(result.seconds,3), 'tokens': record['tokens'],
                      'pass': record['measurement']['pass'], 'reasons': record['measurement']['reasons'],
                      'status': record['status'], 'fast': bool(fast)}), flush=True)
    if result.usage_limited:
        raise RuntimeError('Usage limit: stop batch')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arm', choices=('before','after'), required=True)
    parser.add_argument('--warm', action='store_true')
    parser.add_argument('--only')
    parser.add_argument('--suite',choices=('avani','bedroom'),default='avani')
    parser.add_argument('--concurrency', type=int, default=1)
    args=parser.parse_args()
    scenarios=json.loads(reference.suite_paths(args.suite)['scenarios'].read_text())
    if args.only: scenarios=[s for s in scenarios if s['id'] in args.only.split(',')]
    batch=reference.HERE/'fast-runs'/(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+f'-{args.arm}-{args.suite}-{uuid.uuid4().hex[:6]}')
    batch.mkdir(parents=True)
    paths=[*sorted((reference.ROOT/'packages/designer/src').rglob('*.ts')),
           *sorted((reference.ROOT/'harness').glob('designer*.py')), reference.suite_paths(args.suite)['scenarios'],
           reference.HERE/'measure.ts', reference.HERE/'editor-demo.ts',
           *sorted((reference.ROOT/'apps/editor/src/core').glob('*.ts'))]
    hashes={str(path.relative_to(reference.ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
    hashes['harness/prompts/interior-design-rules.md']=hashlib.sha256(designer.SKILL.read_bytes()).hexdigest()
    for name in ('harness/designer_fast.py','harness/designer_service.py','packages/designer/eval/fast-run.py'):
        hashes[name]=hashlib.sha256((reference.ROOT/name).read_bytes()).hexdigest()
    (batch/'manifest.json').write_text(json.dumps({'arm':args.arm,'warm':args.warm,'scenarios':scenarios,
        'model':designer.MODEL,'source_hashes':hashes,**reference.git_state()},indent=2))
    print(batch,flush=True)
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        list(pool.map(lambda s: execute(s,batch,args.arm,args.warm),scenarios))


if __name__=='__main__': main()
