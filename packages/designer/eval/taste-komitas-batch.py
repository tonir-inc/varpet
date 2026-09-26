"""Fresh-scene paired furnishing benchmark; four conversations, only owned spare ports."""
import argparse
import hashlib
import importlib.util
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--catalog', type=Path, required=True)
    parser.add_argument('--normal-port', type=int, required=True)
    parser.add_argument('--fast-port', type=int, required=True)
    args = parser.parse_args()
    ports = {'off': args.normal_port, 'on': args.fast_port}
    if len(set(ports.values())) != 2 or set(ports.values()) & {5180, 5190, 8787, 8788}:
        raise ValueError('Two distinct spare ports required')
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError('Refusing to overwrite evidence')
    output.mkdir(parents=True, exist_ok=True)
    cohort = json.loads((HERE / 'komitas-freeze-cohort.json').read_text())
    for name, digest in cohort['inputs'].items():
        if hashlib.sha256((HERE / 'komitas' / name).read_bytes()).hexdigest() != digest:
            raise ValueError(f'Input changed: {name}')
    subprocess.run(['git', 'diff', '--exit-code', '--', 'harness', 'packages/designer/src',
                    'packages/designer/knowledge', 'apps/editor/src', 'catalog'], cwd=ROOT, check=True)
    subprocess.run(['node', '--input-type=module', '-e', 'await import("gltf-validator")'],
                   cwd=ROOT / 'packages/designer', check=True)
    source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    manifest = {'service_source': source, 'service_root': str(ROOT), 'ports': ports,
                'cohort': cohort, 'catalog_sha256': hashlib.sha256(args.catalog.read_bytes()).hexdigest(),
                'runner_sha256': hashlib.sha256((HERE / 'taste-komitas-run.ts').read_bytes()).hexdigest(),
                'started_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'model': 'gpt-6-astra', 'effort': 'low', 'max_conversations': 4}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    services, logs = [], []
    try:
        for arm, port in ports.items():
            with socket.socket() as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                probe.bind(('127.0.0.1', port))
            log = (output / f'{arm}-service.log').open('wb')
            logs.append(log)
            service = subprocess.Popen([
                '/tmp/varpet-designer-sdk/bin/python', '-u', str(HERE / 'komitas-service.py'),
                '--output', str(output / f'{arm}-events'), '--port', str(port)],
                cwd=ROOT, env={**os.environ, 'VARPET_DESIGNER_FAST_PATH': '1' if arm == 'on' else '0',
                               'VARPET_CATALOG_URL': 'http://localhost:8765/mcp'},
                stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            services.append(service)
            for _ in range(100):
                if service.poll() is not None:
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
            directory = output / f'{identifier}-{arm}'
            directory.mkdir()
            return batch.watched([
                str(ROOT / 'packages/designer/node_modules/.bin/tsx'), str(HERE / 'taste-komitas-run.ts'),
                '--scene', str(HERE / 'komitas' / f'{identifier}.scene.json'),
                '--truth', str(HERE / 'komitas/ground-truth.json'), '--output', str(directory),
                '--catalog', str(args.catalog.resolve()), '--service', f'http://127.0.0.1:{ports[arm]}',
                '--events', str(output / f'{arm}-events'), '--fast-path', '1' if arm == 'on' else '0'], directory / 'runner.log')

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
