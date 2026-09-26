"""Frozen paired benchmark, four live conversations total; no product changes."""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
spec = importlib.util.spec_from_file_location('batch', HERE / 'komitas-batch.py')
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


def validate_inputs(cohort, here):
    for name, digest in cohort['inputs'].items():
        if hashlib.sha256((here / 'komitas' / name).read_bytes()).hexdigest() != digest:
            raise ValueError(f'Input changed: {name}')
    for identifier in cohort['ids']:
        for arm in ('on', 'off'):
            output = here / 'komitas-runs' / f'{identifier}-freeze-{arm}'
            if output.exists() and any(output.iterdir()):
                raise ValueError(f'Refusing to overwrite evidence: {output}')
    for arm in ('on', 'off'):
        if (here / 'komitas-runs' / f'freeze-{arm}-service.log').exists():
            raise ValueError('Refusing to overwrite service evidence')


def main():
    cohort = json.loads((HERE / 'komitas-freeze-cohort.json').read_text())
    validate_inputs(cohort, HERE)
    subprocess.run(['git', 'diff', '--exit-code', cohort['product_source'], '--',
                    'harness', 'packages/designer/src', 'packages/designer/knowledge',
                    'apps/editor/src', 'catalog'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    services = []
    logs = []
    ports = {'on': 8794, 'off': 8795}
    try:
        for arm, port in ports.items():
            # Refuse to interfere with any existing listener, even on these spare ports.
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', port))
            log = (HERE / 'komitas-runs' / f'freeze-{arm}-service.log').open('wb')
            logs.append(log)
            services.append(subprocess.Popen([
                '/tmp/varpet-designer-sdk/bin/python', '-u', str(HERE / 'komitas-service.py'),
                '--output', f'/tmp/komitas-freeze-{arm}-events', '--port', str(port)],
                cwd=ROOT, env={**os.environ, 'VARPET_DESIGNER_FAST_PATH': '1' if arm == 'on' else '0',
                               'VARPET_CATALOG_URL': 'http://localhost:8765/mcp'},
                stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True))
            for _ in range(100):
                if services[-1].poll() is not None:
                    raise RuntimeError(f'{arm} service exited')
                try:
                    with socket.create_connection(('127.0.0.1', port), timeout=.1):
                        break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError(f'{arm} service did not start')

        def run(identifier, arm):
            if batch.STOP.is_set():
                return 1
            scene = HERE / 'komitas' / f'{identifier}.scene.json'
            if hashlib.sha256(scene.read_bytes()).hexdigest() != cohort['inputs'][scene.name]:
                batch.STOP.set()
                raise ValueError(f'Input changed before request: {scene.name}')
            output = HERE / 'komitas-runs' / f'{identifier}-freeze-{arm}'
            output.mkdir(parents=True, exist_ok=True)
            return batch.watched([
                str(ROOT / 'packages/designer/node_modules/.bin/tsx'), str(HERE / 'komitas-run.ts'),
                '--scene', str(HERE / 'komitas' / f'{identifier}.scene.json'),
                '--truth', str(HERE / 'komitas/ground-truth.json'), '--output', str(output),
                '--service', f'http://127.0.0.1:{ports[arm]}',
                '--events', f'/tmp/komitas-freeze-{arm}-events',
                '--fast-path', '1' if arm == 'on' else '0'], output / 'runner.log')

        jobs = [(identifier, arm) for index, identifier in enumerate(cohort['ids'])
                for arm in (('on', 'off') if index % 2 == 0 else ('off', 'on'))]
        failures = []
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(run, *job): job for job in jobs}
            for future in as_completed(futures):
                job = futures[future]
                try:
                    code = future.result()
                    if code:
                        failures.append([*job, str(code)])
                except Exception as error:
                    failures.append([*job, str(error)])
                print(json.dumps({'finished': job, 'failures': failures}), flush=True)
        if batch.STOP.is_set() or failures:
            raise SystemExit(f'Batch stopped/incomplete: {failures}')
    finally:
        for service in services:
            # Only processes launched here, never shared editor/service ports.
            service.terminate()
        for service in services:
            try:
                service.wait(timeout=30)
            except subprocess.TimeoutExpired:
                batch.terminate_group(service)
        for log in logs:
            log.close()


if __name__ == '__main__':
    main()
