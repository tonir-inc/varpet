#!/usr/bin/env python3
"""Demo preflight, Python 3.11 stdlib only. Never applies a proposal or kills a process."""
from __future__ import annotations

import argparse
import base64
from dataclasses import asdict, dataclass
import http.client
import json
import os
from pathlib import Path
import queue
import re
import struct
import subprocess
import sys
import threading
import time
from urllib.parse import urljoin, urlsplit
import zlib

ROOT = Path(__file__).resolve().parents[1]
START = ('VITE_DESIGNER_URL=http://127.0.0.1:8787 VITE_ARCHITECT_URL=http://127.0.0.1:8788 '
         'VARPET_CATALOG_URL=http://127.0.0.1:8765/mcp pnpm dev')
PDF_FIX = 'Stop Vite; rm -rf apps/editor/node_modules/.vite; restart with ' + START


@dataclass
class Result:
    check: str
    status: str
    time: float
    detail: str
    fix: str = ''


@dataclass
class Check:
    name: str
    timeout: float
    action: object
    fix: str
    failure: str = 'FAIL'


class HTTP:
    """A shared wall deadline includes connect, headers and every streamed read."""
    def __init__(self, timeout):
        self.deadline = time.monotonic() + timeout

    def remaining(self):
        left = self.deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError('check deadline exceeded')
        return left

    def request(self, url, body=None, headers=None, method=None, prefix=None, rpc_id=None):
        parsed = urlsplit(url)
        if parsed.scheme not in ('http', 'https'):
            raise ValueError('expected HTTP(S) URL')
        cls = http.client.HTTPSConnection if parsed.scheme == 'https' else http.client.HTTPConnection
        conn = cls(parsed.hostname, parsed.port, timeout=self.remaining())
        data = None if body is None else json.dumps(body).encode()
        head = {'Content-Type': 'application/json', **(headers or {})}
        try:
            conn.request(method or ('POST' if data is not None else 'GET'),
                         parsed.path + ('?' + parsed.query if parsed.query else '') or '/', data, head)
            response = conn.getresponse()
            sock = conn.sock or getattr(getattr(response.fp, 'raw', None), '_sock', None)

            def settle():  # a server that sends Connection: close leaves no usable socket to re-arm
                try:
                    if sock is not None:
                        sock.settimeout(self.remaining())
                except OSError:
                    pass
            settle()
            if response.status not in (200, 202, 204):
                raise ValueError(f'HTTP {response.status} {response.reason} at {url}')
            output = bytearray()
            sse = 'text/event-stream' in response.getheader('Content-Type', '')
            event = []
            while response.status == 200:
                settle()
                chunk = response.readline(1_048_577) if sse else response.read1(min(65536, prefix or 65536))
                if not chunk:
                    break
                output.extend(chunk)
                if len(output) > 32_000_000:
                    raise ValueError('response exceeds 32 MB')
                if sse:
                    line = chunk.decode().strip()
                    if line.startswith('data:'):
                        event.append(line[5:].lstrip())
                    elif not line and event:
                        packet = json.loads('\n'.join(event))
                        event = []
                        if packet.get('id') == rpc_id:
                            return json.dumps(packet).encode(), dict(response.getheaders())
                if prefix and len(output) >= prefix:
                    break
            self.remaining()
            return bytes(output), dict(response.getheaders())
        finally:
            conn.close()

    def json(self, url, body=None, **kwargs):
        return json.loads(self.request(url, body, **kwargs)[0])


class MCP:
    def __init__(self, http, base):
        self.http = http
        self.url = base.rstrip('/') if base.rstrip('/').endswith('/mcp') else base.rstrip('/') + '/mcp'
        self.headers = {'Accept': 'application/json, text/event-stream'}
        self.counter = 0
        result, headers = self.call('initialize', {'protocolVersion': '2025-03-26', 'capabilities': {},
                                    'clientInfo': {'name': 'demo-doctor', 'version': '1'}})
        self.headers['MCP-Protocol-Version'] = result['protocolVersion']
        session = next((v for k, v in headers.items() if k.lower() == 'mcp-session-id'), None)
        if session:
            self.headers['Mcp-Session-Id'] = session
        http.request(self.url, {'jsonrpc': '2.0', 'method': 'notifications/initialized'}, self.headers)

    def call(self, method, params):
        self.counter += 1
        raw, headers = self.http.request(self.url, {'jsonrpc': '2.0', 'id': self.counter,
                                        'method': method, 'params': params}, self.headers, rpc_id=self.counter)
        packet = json.loads(raw)
        if packet.get('id') != self.counter or 'error' in packet:
            raise ValueError(f'MCP {method}: {packet}')
        return packet['result'], headers

    def tool(self, name, args):
        result, _ = self.call('tools/call', {'name': name, 'arguments': args})
        if result.get('isError'):
            raise ValueError(f'{name}: {result.get("content")}')
        return result


def payload(result):
    if isinstance(result.get('structuredContent'), dict):
        return result['structuredContent']
    for block in result.get('content', []):
        if block.get('type') == 'text':
            try:
                value = json.loads(block['text'])
                if isinstance(value, dict):
                    return value
            except ValueError:
                pass
    raise ValueError('MCP returned no JSON object')


def require(condition, detail):
    if not condition:
        raise ValueError(detail)


def health(http, base):
    data = http.json(base.removesuffix('/mcp').rstrip('/') + '/health')
    require(data.get('ok') is True and data.get('model_ready') is True and
            isinstance(data.get('items'), int) and data['items'] > 0, f'catalog not ready: {data}')
    return f'{base}: ok; model_ready=true; items={data["items"]}'


def relay(http, editor, model=False):
    results = http.json(editor + '/api/catalog/search?kind=sofa&limit=2').get('results', [])
    require(results, 'sofa search returned no results')
    if not model:
        return f'{len(results)} sofa results'
    item = results[0]
    # Prefer the model URL returned by search; fall back to catalog file_stem.
    iid = item['id']
    name = (iid[4:] if iid.startswith('abo:') else iid.replace(':', '-')) + '.glb'
    for key in ('glb_web_url', 'glb_url'):
        model_path = urlsplit(item.get(key) or '').path
        if model_path.startswith('/models/'):
            name = model_path.removeprefix('/models/')
            break
    require(re.fullmatch(r'[A-Za-z0-9_-]{1,120}\.glb', name), f'invalid model name: {name}')
    raw, _ = http.request(editor + '/api/catalog/models/' + name, prefix=4)
    require(raw[:4] == b'glTF', f'{name}: response lacks GLB magic glTF')
    return name + ': glTF'


def pdf(http, editor):
    raw, _ = http.request(editor + '/src/portal/blueprint-pdf.ts')
    text = raw.decode()
    require('Outdated Optimize Dep' not in text, 'Outdated Optimize Dep')
    paths = re.findall(r'''["']([^"']*node_modules/\.vite/deps/pdfjs-dist[^"']*)["']''', text)
    require(paths, 'served blueprint module has no optimized pdfjs-dist import')
    for path in set(paths):
        raw, _ = http.request(urljoin(editor, path))
        require(b'Outdated Optimize Dep' not in raw and b'<html' not in raw.lower(),
                'pdfjs-dist returned stale dependency or HTML')
    return 'blueprint module and optimized pdfjs-dist loaded'


def config(http, editor):
    raw, _ = http.request(editor + '/src/main.ts')
    match = re.search(r'import\.meta\.env\s*=\s*(\{[^\n]*?\})\s*;', raw.decode())
    require(match, 'served Vite env could not be detected')
    env = json.loads(match[1])
    values = '; '.join(f'{key}={env.get(key, "MISSING")}' for key in
                       ('VITE_DESIGNER_URL', 'VITE_ARCHITECT_URL'))
    if not env.get('VITE_DESIGNER_URL'):
        values += '; chat shows Demo replay'
    return ('WARN', values + '; VARPET_CATALOG_URL is server-only and cannot be verified over HTTP', START)


def search(http, catalog, query):
    client = MCP(http, catalog)
    result = payload(client.tool('search_furniture', {**query, 'scope': 'placeable', 'limit': 4}))
    rows = result.get('results', [])
    require(rows and all(isinstance(row.get('id'), str) for row in rows), 'no placeable results')
    return f'{len(rows)} results in scope=placeable'


def candidates(http, catalog):
    client = MCP(http, catalog)
    rows = payload(client.tool('search_furniture', {'kind': 'sofa', 'scope': 'placeable', 'limit': 4}))['results']
    ids = list(dict.fromkeys(row['id'] for row in rows))[:4]
    require(len(ids) == 4, 'need four distinct candidate ids')
    result = client.tool('show_candidates', {'item_ids': ids})
    images = [block for block in result.get('content', []) if block.get('type') == 'image']
    require(any(base64.b64decode(block.get('data', ''), validate=True).startswith((b'\xff\xd8\xff', b'\x89PNG'))
                for block in images), 'show_candidates returned no JPEG/PNG image')
    return 'four ids; candidate image received'


def blank_png():
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 1, 1, 8, 2, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(b'\0\xff\xff\xff')) + chunk(b'IEND', b''))


def plan(http, architect, positive):
    data = (ROOT / 'apartments/m6-12-54/source.png').read_bytes() if positive else blank_png()
    result = http.json(architect + '/plan-check', {'plan': {'name': 'plan.png', 'data': base64.b64encode(data).decode()}})
    require(result.get('is_plan') is positive, f'unexpected verdict: {result}')
    require(result.get('kind') != 'unknown' and result.get('confidence', 0) > 0,
            f'plan gate failed open: {result}')
    if not positive:
        require(result.get('confidence', 0) >= .6, f'rejection below enforcement threshold: {result}')
    return f'is_plan={result["is_plan"]}; {result["kind"]}; confidence={result["confidence"]}'


def designer(http, base):
    scene = json.loads((ROOT / 'apartments/m6-12-54/scene.json').read_text())
    require(scene.get('format') == 'varpet.editor', 'fixture must be an editor SceneDocument')
    # Fixture is the empty editor shell; do not substitute the engine/designer schema.
    require(not scene.get('objects'), 'fixture now contains furniture; supply its catalog before using this smoke')
    body = {'scene': scene, 'revision': 0, 'request': 'Furnish the Bedroom 1.',
            'catalog': [], 'catalogCurrency': 'AMD', 'events': True}
    raw, _ = http.request(base + '/designer/propose', body, {'Accept': 'application/x-ndjson'})
    text = raw.decode()
    errors = [value for value in ('fetch failed', 'no checked fit', 'geometry is supported') if value in text.lower()]
    records = [json.loads(line) for line in text.splitlines() if line.strip()]
    errors.extend(json.dumps(r) for r in records if r.get('type') == 'error' or
                  (r.get('type') == 'tool' and (r.get('status') in ('error', 'failed') or r.get('phase') == 'error' or r.get('error'))))
    require(not errors, '; '.join(errors))
    proposals = [r for r in records if r.get('type') == 'proposal']
    added = sum(op.get('type') == 'add' and isinstance(op.get('object'), dict)
                for r in proposals for op in r.get('proposal', {}).get('command', {}).get('operations', []))
    require(added >= 1, f'no added item in proposal; terminal={records[-1] if records else "empty stream"}')
    return f'proposal received with {added} added items (not applied)'


def processes(http):
    text = subprocess.run(['ps', '-axo', 'pid=,ppid=,etime=,command='], capture_output=True,
                          text=True, check=True, timeout=http.remaining()).stdout
    rows = {}
    for line in text.splitlines():
        parts = line.split(None, 3)
        if len(parts) != 4:
            continue
        pid, parent, age, command = parts
        days, _, clock = age.rpartition('-')
        seconds = 0
        for part in clock.split(':'):
            seconds = seconds * 60 + int(part)
        rows[int(pid)] = (int(parent), seconds + int(days or 0) * 86400, command)
    roots = {pid for pid, (_, _, cmd) in rows.items() if
             re.search(r'(?:varpet-harness|varpet_harness(?:\.serve)?)\b.*\bserve\b|varpet_harness\.serve\b', cmd)}
    descendants = set(roots)
    while True:
        expanded = descendants | {pid for pid, (ppid, _, _) in rows.items() if ppid in descendants}
        if expanded == descendants:
            break
        descendants = expanded
    stale = [pid for pid in sorted(descendants - roots) if rows[pid][1] > 600 and
             re.search(r'(?:^|[/\s])codex(?:\s|$)', rows[pid][2])]
    if stale:
        return 'WARN', f'{len(stale)} architect Codex descendants older than 10 min: {stale}; may be active builds', 'Review ps -p ' + ','.join(map(str, stale)) + '; if cancelled, kill ' + ' '.join(map(str, stale))
    if not roots:
        return 'WARN', 'architect serve process not identifiable locally; descendant check unavailable', 'Run doctor on the architect host; inspect ps -axo pid,ppid,etime,command'
    return '0 architect Codex descendants older than 10 min'


def memory(http):
    # macOS keeps most RAM as cache, so 'Pages free' is always tiny; memory_pressure reports what is really available.
    output = subprocess.run(['memory_pressure', '-Q'], capture_output=True, text=True, check=True, timeout=http.remaining()).stdout
    match = re.search(r'free percentage:\s*(\d+)%', output)
    require(match, 'could not parse memory_pressure')
    pct = int(match[1])
    if pct < 15:
        return 'WARN', f'{pct}% memory available (memory_pressure)', 'Close unused apps/builds; check Activity Monitor memory pressure'
    return f'{pct}% memory available'



def checks(args):
    editor, catalog = args.editor.rstrip('/'), args.catalog.rstrip('/')
    architect, design = args.architect.rstrip('/'), args.designer.rstrip('/')
    result = [
        Check('catalog-local', 8, lambda h: health(h, catalog), 'Start catalog/demo/run_local.sh; wait for model warm-up'),
        Check('editor', 5, lambda h: (h.request(editor + '/'), 'HTTP 200')[1], START),
        Check('relay-search', 20, lambda h: relay(h, editor), 'Restart editor with VARPET_CATALOG_URL=' + catalog + '/mcp'),
        Check('relay-model', 65, lambda h: relay(h, editor, True), 'Check catalog model files; rerun catalog/demo/setup_local.sh'),
        Check('pdfjs', 15, lambda h: pdf(h, editor), PDF_FIX),
        Check('editor-config', 8, lambda h: config(h, editor), START, 'WARN'),
        Check('designer', 5, lambda h: (require(h.json(design + '/designer/health').get('ok') is True, 'health not ok'), 'health ok')[1], 'cd harness && uv run python designer_service.py --port 8787'),
        Check('architect', 5, lambda h: (h.json(architect + '/runs'), '/runs reachable')[1], 'cd harness && uv run varpet-harness serve --port 8788'),
        Check('stray-processes', 5, processes, 'Inspect architect descendants with ps -axo pid,ppid,etime,command', 'WARN'),
        Check('memory', 5, memory, 'Run vm_stat on the demo Mac; inspect Activity Monitor', 'WARN')]
    if args.vm:
        result.append(Check('catalog-vm', 8, lambda h: health(h, args.vm), 'Start catalog/deploy/tunnel.sh; check VM catalog', 'WARN'))
    if not args.quick:
        for name, query in [('sofa', {'kind': 'sofa'}), ('bed', {'kind': 'bed'}), ('vase', {'text': 'vase'}),
                            ('kitchen-island', {'kind': 'kitchen_island'}), ('outdoor', {'styles': ['outdoor']})]:
            result.append(Check('search-' + name, 3, lambda h, q=query: search(h, catalog, q), 'Check catalog warm-up, query latency and placeable inventory'))
        result.extend([Check('show-candidates', 15, lambda h: candidates(h, catalog), 'Check catalog previews and show_candidates logs'),
                       Check('plan-positive', 55, lambda h: plan(h, architect, True), 'Check architect plan_gate logs and Codex authentication/model metadata'),
                       Check('plan-negative', 15, lambda h: plan(h, architect, False), 'Check architect /plan-check tiny-image rejection')])
    if args.full:
        result.append(Check('designer-turn', 180, lambda h: designer(h, design), 'Inspect designer tool events/logs, catalog URL and fit checks; retry --full --only designer-turn'))
    return result


def run(selected):
    """Daemon threads plus coordinator deadlines also bound slow/dripping servers."""
    out = queue.Queue()
    pending = {}
    results = {}
    def work(check, started):
        try:
            value = check.action(HTTP(check.timeout))
            status, detail, fix = value if isinstance(value, tuple) else ('PASS', value, '')
        except Exception as error:
            status, detail, fix = check.failure, f'{type(error).__name__}: {error}', check.fix
        out.put(Result(check.name, status, round(time.monotonic() - started, 3), str(detail), fix))
    for check in selected:
        started = time.monotonic()
        pending[check.name] = (check, started)
        threading.Thread(target=work, args=(check, started), daemon=True).start()
    while pending:
        delay = max(0, min(start + c.timeout for c, start in pending.values()) - time.monotonic())
        try:
            result = out.get(timeout=delay)
            if result.check in pending:
                check, _ = pending.pop(result.check)
                if result.time > check.timeout:
                    result = Result(check.name, check.failure, result.time, 'check deadline exceeded', check.fix)
                results[result.check] = result
        except queue.Empty:
            pass
        for name, (check, start) in list(pending.items()):
            if time.monotonic() - start >= check.timeout:
                results[name] = Result(name, check.failure, check.timeout, 'check deadline exceeded', check.fix)
                del pending[name]
    return [results[check.name] for check in selected]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--quick', action='store_true', help='skip golden-path checks')
    mode.add_argument('--full', action='store_true', help='also spend one designer model turn (180s limit)')
    parser.add_argument('--json', action='store_true', help='JSON only on stdout')
    parser.add_argument('--vm', nargs='?', const='http://localhost:18765', help='optional VM health check; no URL means localhost:18765')
    parser.add_argument('--only', action='append', help='exact check name; repeat or comma-separate')
    for name, default in [('catalog', 'http://127.0.0.1:8765'), ('editor', 'http://localhost:5173'),
                          ('designer', 'http://127.0.0.1:8787'), ('architect', 'http://127.0.0.1:8788')]:
        parser.add_argument('--' + name, default=os.environ.get('DEMO_' + name.upper() + '_URL', default))
    args = parser.parse_args(argv)
    selected = checks(args)
    if args.only:
        names = {name for group in args.only for name in group.split(',')}
        unknown = names - {c.name for c in selected}
        if unknown:
            parser.error('unknown or disabled checks: ' + ', '.join(sorted(unknown)) + '; available: ' + ', '.join(c.name for c in selected))
        selected = [c for c in selected if c.name in names]
    results = run(selected)
    if args.json:
        print(json.dumps([asdict(result) for result in results], indent=2))
    else:
        print(f'{"check":<20} | status | time    | detail')
        print('-' * 90)
        for result in results:
            clean = lambda value: ' '.join(value.split())
            print(f'{result.check:<20} | {result.status:<6} | {result.time:6.2f}s | {clean(result.detail)}')
            if result.status != 'PASS':
                print('  FIX: ' + clean(result.fix))
    return int(any(result.status == 'FAIL' for result in results))


if __name__ == '__main__':
    sys.exit(main())
