"""Real plan-only architect HTTP batch; source images and SDK runs stay outside git."""
from __future__ import annotations
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import ThreadingHTTPServer
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'harness'))
import designer


def worker(plan: Path, work: Path):
    from varpet_harness import codex_runner
    from varpet_harness.serve import handler
    (work / 'revision.txt').write_text(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip())
    original = codex_runner.quiet_guard
    latest = {}
    async def observed(stream, stall):
        last = 0
        async for event in original(stream, stall):
            payload = event.payload
            if hasattr(payload, 'token_usage'):
                latest.update(thread_id=payload.thread_id, usage=payload.token_usage.model_dump(mode='json'))
                (work / 'usage.json').write_text(json.dumps(latest))
            if time.monotonic() - last > 10:
                print(json.dumps({'activity': 'architect SDK event', 'tokens': latest.get('usage', {}).get('total', {}).get('total_tokens')}), flush=True)
                last = time.monotonic()
            yield event
    codex_runner.quiet_guard = observed  # observation only; original guard and events are unchanged
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler(ROOT, work / 'runs'))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    body = {'plan': {'name': plan.name, 'data': base64.b64encode(plan.read_bytes()).decode()}, 'photos': []}
    start = time.monotonic()
    lines = []
    try:
        request = Request(f'http://127.0.0.1:{server.server_port}/structure', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        with urlopen(request, timeout=1200) as response:
            for raw in response:
                line = json.loads(raw)
                lines.append(line)
                if line.get('type') == 'progress': print(json.dumps(line), flush=True)
                if 'usage limit' in str(line).lower(): print('usage limit', file=sys.stderr, flush=True)
        result = {'seconds': time.monotonic()-start, 'lines': lines, **latest}
        (work / 'http.json').write_text(json.dumps(result, indent=2))
        print(json.dumps({'finished': True, 'seconds': result['seconds'], 'type': lines[-1].get('type')}), flush=True)
    finally:
        server.shutdown()
        server.server_close()


def clear_previous(output: Path, id: str):
    """Invalidate the previous attempt before launching a new one; never touch source plans."""
    for suffix in ('.scene.json', '.rejected.json', '.shell.json', '.faults.json',
                   '.metrics.json', '.architect.json', '.repair.json', '-top.png', '-3d.png'):
        (output / (id + suffix)).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--worker', type=Path)
    parser.add_argument('--work', type=Path)
    parser.add_argument('--plans', type=Path, default=Path.home()/'AshProjects/tonir/apartment/komitas-park/data/plans')
    parser.add_argument('--parallel', type=int, default=4)
    parser.add_argument('--ids', nargs='*')
    args = parser.parse_args()
    if args.worker:
        worker(args.worker, args.work)
        return
    output = ROOT / 'packages/designer/eval/komitas'
    rows = json.loads((output/'ground-truth.json').read_text())
    if args.ids: rows = [row for row in rows if row['id'] in args.ids]
    cancel = threading.Event()
    batch = Path(tempfile.mkdtemp(prefix='varpet-komitas-'))
    print(json.dumps({'work': str(batch), 'parallel': args.parallel}), flush=True)
    def run(row):
        id = row['id']
        if cancel.is_set(): return
        work = batch/id; work.mkdir()
        plans = list(args.plans.glob(id+'.*'))
        if len(plans) != 1: raise ValueError(f'{id}: expected one source plan')
        clear_previous(output, id)
        def activity(channel, chunk):
            if 'usage limit' in chunk.lower(): cancel.set()
            with (work/(channel+'.log')).open('a') as stream: stream.write(chunk)
        result = designer.watch_process([sys.executable, '-u', str(Path(__file__).resolve()), '--worker', str(plans[0]), '--work', str(work)],
            env={**os.environ, 'PYTHONPATH': str(ROOT/'harness')}, idle_timeout=240,
            deadline=time.monotonic()+1200, cancel_event=cancel, on_output=activity)
        if result.usage_limited: cancel.set()
        record = {'id': id, 'work': str(work), 'seconds': result.seconds, 'returncode': result.returncode,
                  'timed_out': result.timed_out, 'cancelled': result.cancelled, 'usage_limited': result.usage_limited,
                  'source_revision': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()}
        if (work/'http.json').exists(): record.update(json.loads((work/'http.json').read_text()))
        elif (work/'usage.json').exists(): record.update(json.loads((work/'usage.json').read_text()))
        (output/(id+'.architect.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
        for name in ('shell', 'faults'):
            files = list(work.glob('runs/*/shell/' + name + '.json'))
            if files: shutil.copyfile(files[-1], output / (id + '.' + name + '.json'))
        if (work/'revision.txt').exists():
            record['source_revision'] = (work/'revision.txt').read_text()
            (output/(id+'.architect.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
        checked = subprocess.run([str(ROOT/'packages/designer/node_modules/.bin/tsx'), str(ROOT/'packages/designer/eval/komitas-validate.ts'), id], cwd=ROOT,capture_output=True,text=True)
        print(json.dumps({'id':id,'validation':checked.returncode,'message':checked.stdout or checked.stderr,'seconds':record['seconds']}),flush=True)
    with ThreadPoolExecutor(max_workers=args.parallel) as pool:
        for future in as_completed([pool.submit(run,row) for row in rows]): future.result()
    if cancel.is_set(): raise SystemExit('usage limit: stopped the entire batch')


if __name__ == '__main__':
    main()
