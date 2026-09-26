#!/usr/bin/env python3
"""Regrade saved Designer evals; --live explicitly runs the thirteen conversations."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import threading
import time

from designer import MODEL, ROOT, WatchResult, watch_process

PACKAGE = ROOT / 'packages/designer'
EVAL = PACKAGE / 'eval'


def run_scenario(scenario: dict, output_dir: Path, python: str, timeout: float,
                 cancel_event: threading.Event, *, watch=watch_process) -> dict:
    row = {'scenario_id': scenario['id'], 'transcript': None, 'status': 'not_run'}
    if cancel_event.is_set():
        return {**row, 'error': 'Batch stopped after a usage limit.'}
    directory = output_dir / scenario['id']
    directory.mkdir(parents=True, exist_ok=True)
    scene_path = Path(scenario['scene'])
    if not scene_path.is_absolute():
        scene_path = (PACKAGE / scene_path) if '/' in str(scene_path) else PACKAGE / 'test/fixtures' / scene_path
    scene = json.loads(scene_path.read_text())
    injection = scenario.get('injection')
    if injection:
        item = next(item for item in scene['items'] if item['id'] == injection['item_id'])
        item[injection.get('field', 'name')] = injection.get('value', injection.get('text'))
    snapshot = directory / 'scene.json'
    snapshot.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + '\n')
    command = [python, '-u', str(ROOT / 'harness/designer.py'), '--scene', str(snapshot.resolve()),
               '--prompt', scenario['prompt'], '--output-dir', str(directory.resolve())]
    try:
        result = watch(command, deadline=time.monotonic() + timeout, cancel_event=cancel_event)
        row['seconds'] = result.seconds
        (directory / 'stdout.log').write_text(result.stdout)
        (directory / 'stderr.log').write_text(result.stderr)
        for line in result.stdout.splitlines():
            if line.startswith('Transcript: '):
                candidate = Path(line.removeprefix('Transcript: ')).resolve()
                if candidate.parent == directory.resolve() and candidate.is_file():
                    row['transcript'] = str(candidate)
                    break
        if result.usage_limited or 'usage limit' in result.stderr.lower():
            cancel_event.set()
            return {**row, 'status': 'usage_limit', 'error': 'Usage limit stopped the batch.'}
        if result.deadline_exceeded or result.timed_out:
            return {**row, 'status': 'timeout', 'error': f'Conversation exceeded {timeout:g}s budget.'}
        if result.cancelled:
            return {**row, 'status': 'failed', 'error': 'Cancelled after another conversation reached a usage limit.'}
        if result.returncode or row['transcript'] is None:
            return {**row, 'status': 'failed', 'error': f'Worker exit {result.returncode}; inspect stderr.log.'}
        return {**row, 'status': 'completed'}
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        return {**row, 'status': 'failed', 'error': f'{type(error).__name__}: {error}'}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='Spend model calls; otherwise only regrade cached traces')
    parser.add_argument('--manifest', type=Path, default=EVAL / 'runs/manifest.json')
    parser.add_argument('--python', default=sys.executable, help='Python with designer_requirements.txt installed')
    parser.add_argument('--scenario', action='append', help='Run only named rows, retaining other recorded runs')
    parser.add_argument('--parallel', type=int, default=3)
    parser.add_argument('--max-seconds', type=float, default=180)
    args = parser.parse_args()
    if args.parallel < 1 or args.parallel > 3 or args.max_seconds <= 0:
        parser.error('Use 1–3 parallel conversations and a positive time budget')
    manifest = args.manifest.resolve()
    limited = threading.Event()
    if args.live:
        scenarios = json.loads((EVAL / 'scenarios.json').read_text())
        selected = [row for row in scenarios if not args.scenario or row['id'] in args.scenario]
        if args.scenario and set(args.scenario) - {row['id'] for row in scenarios}:
            parser.error('Unknown scenario ID')
        prior = json.loads(manifest.read_text()) if manifest.exists() else {'runs': []}
        records = {row['scenario_id']: row for row in prior.get('runs', [])}
        run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        output_dir = manifest.parent / run_id
        manifest.parent.mkdir(parents=True, exist_ok=True)

        def save():
            for record in records.values():
                if record.get('transcript') and Path(record['transcript']).is_absolute():
                    try:
                        record['transcript'] = str(Path(record['transcript']).relative_to(ROOT))
                    except ValueError:
                        pass
            data = {'schema_version': 1, 'model': MODEL, 'run_id': run_id,
                    'fixture_scope': 'Assumed surrogate fixtures; actual demo flat is unavailable.',
                    'runs': [records.get(row['id'], {'scenario_id': row['id'], 'transcript': None, 'status': 'not_run'}) for row in scenarios]}
            temporary = manifest.with_suffix('.tmp')
            temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
            temporary.replace(manifest)

        with ThreadPoolExecutor(max_workers=args.parallel) as pool:
            futures = {pool.submit(run_scenario, row, output_dir, args.python, args.max_seconds, limited): row['id'] for row in selected}
            for future in as_completed(futures):
                result = future.result()
                records[result['scenario_id']] = result
                save()
                print(result['scenario_id'] + ': ' + result['status'], flush=True)
        save()
    graded = subprocess.run(['pnpm', 'exec', 'tsx', 'eval/grade.ts', str(manifest)], cwd=PACKAGE)
    return 3 if limited.is_set() else graded.returncode


if __name__ == '__main__':
    raise SystemExit(main())
