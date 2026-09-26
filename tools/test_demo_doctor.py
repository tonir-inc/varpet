"""Offline HTTP integration tests: python3 -m unittest discover -s tools -p test_demo_doctor.py -v"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import sys
import threading
import time
import unittest
from unittest.mock import patch

import demo_doctor as doctor


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, value, status=200, content_type='application/json'):
        data = value if isinstance(value, bytes) else json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Mcp-Session-Id', 'doctor-test')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/health':
            return self.send({'ok': True, 'model_ready': self.server.ready, 'items': 42})
        if self.path.startswith('/api/catalog/search'):
            return self.send({'results': [{'id': 'abo:SOFA1'}]})
        if self.path.startswith('/api/catalog/models/'):
            return self.send(self.server.magic + b'\0' * 50)
        if self.path == '/src/portal/blueprint-pdf.ts':
            return self.send(b'import x from "/node_modules/.vite/deps/pdfjs-dist.js?v=abc";', content_type='text/javascript')
        if self.path.startswith('/node_modules/.vite/deps/'):
            return self.send(b'Outdated Optimize Dep' if self.server.stale else b'export const x=1',
                             504 if self.server.stale else 200, 'text/javascript')
        if self.path == '/src/main.ts':
            return self.send(b'import.meta.env = {"VITE_ARCHITECT_URL":"http://localhost:8788"};', content_type='text/javascript')
        if self.path == '/designer/health':
            return self.send({'ok': True})
        if self.path == '/runs':
            return self.send([])
        return self.send(b'<html>Editor</html>', content_type='text/html')

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.server.bodies.append(body)
        if self.path == '/plan-check':
            import base64
            tiny = base64.b64decode(body['plan']['data']) == doctor.blank_png()
            return self.send({'is_plan': not tiny, 'kind': 'unknown' if self.server.fail_open else 'too small' if tiny else 'floor plan',
                              'confidence': 0 if self.server.fail_open else 1})
        if self.path == '/designer/propose':
            return self.send(self.server.designer_reply, content_type='application/x-ndjson')
        if body['method'] == 'notifications/initialized':
            return self.send(b'', 202)
        if body['method'] == 'initialize':
            result = {'protocolVersion': '2025-03-26', 'capabilities': {}, 'serverInfo': {'name': 'fake', 'version': '1'}}
        else:
            if self.headers.get('Mcp-Session-Id') != 'doctor-test':
                return self.send({'error': 'missing session'}, 400)
            params = body['params']
            if params['name'] == 'show_candidates':
                result = {'content': [{'type': 'image', 'data': '/9j/AA==', 'mimeType': 'image/jpeg'}]}
            else:
                result = {'structuredContent': {'results': [{'id': f'abo:{i}'} for i in range(4)]}}
        packet = {'jsonrpc': '2.0', 'id': body['id'], 'result': result}
        if self.server.sse:
            return self.send(('event: message\ndata: ' + json.dumps(packet) + '\n\n').encode(), content_type='text/event-stream')
        return self.send(packet)


class DoctorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.server.ready = True
        self.server.magic = b'glTF'
        self.server.stale = False
        self.server.sse = False
        self.server.fail_open = False
        self.server.bodies = []
        self.server.designer_reply = (json.dumps({'type': 'proposal', 'proposal': {'command': {
            'operations': [{'type': 'add', 'object': {'id': 'bed'}}]}}}) + '\n').encode()

    def cli(self, *args):
        return subprocess.run([sys.executable, str(Path(doctor.__file__)), '--catalog', self.url,
                               '--editor', self.url, '--designer', self.url, '--architect', self.url, *args],
                              capture_output=True, text=True, timeout=10)

    def test_pass_table_and_exit(self):
        result = self.cli('--quick', '--only', 'catalog-local,editor,relay-search,relay-model,pdfjs,designer,architect')
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn('check                | status | time', result.stdout)
        self.assertEqual(result.stdout.count('| PASS'), 7)
        self.assertNotIn('FIX:', result.stdout)

    def test_fail_health_json_exit(self):
        self.server.ready = False
        result = self.cli('--only', 'catalog-local', '--json')
        self.assertEqual(result.returncode, 1)
        row = json.loads(result.stdout)[0]
        self.assertEqual(row['status'], 'FAIL')
        self.assertIn('model_ready', row['detail'])
        self.assertTrue(row['fix'])

    def test_stale_pdf_fix(self):
        self.server.stale = True
        result = self.cli('--only', 'pdfjs')
        self.assertEqual(result.returncode, 1)
        self.assertIn('504', result.stdout)
        self.assertIn('FIX: Stop Vite; rm -rf apps/editor/node_modules/.vite', result.stdout)

    def test_wrong_glb_magic(self):
        self.server.magic = b'HTML'
        result = self.cli('--only', 'relay-model')
        self.assertEqual(result.returncode, 1)
        self.assertIn('lacks GLB magic', result.stdout)

    def test_warn_is_zero_and_has_fix(self):
        result = self.cli('--only', 'editor-config')
        self.assertEqual(result.returncode, 0)
        self.assertIn('| WARN', result.stdout)
        self.assertIn('Demo replay', result.stdout)
        self.assertIn('FIX:', result.stdout)

    def test_mcp_json_and_sse(self):
        for sse in (False, True):
            with self.subTest(sse=sse):
                self.server.sse = sse
                result = self.cli('--only', 'search-sofa,search-outdoor,show-candidates', '--json')
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertTrue(all(r['status'] == 'PASS' for r in json.loads(result.stdout)))
        queries = [b['params']['arguments'] for b in self.server.bodies if b.get('method') == 'tools/call']
        self.assertTrue(any(q.get('styles') == ['outdoor'] and q.get('scope') == 'placeable' for q in queries))
        self.assertTrue(any(len(q.get('item_ids', [])) == 4 for q in queries))

    def test_plan_rejection_and_fail_open(self):
        self.assertIn('is_plan=False', doctor.plan(doctor.HTTP(2), self.url, False))
        with patch.object(Path, 'read_bytes', return_value=b'fake plan'):
            self.assertIn('is_plan=True', doctor.plan(doctor.HTTP(2), self.url, True))
            self.server.fail_open = True
            with self.assertRaisesRegex(ValueError, 'failed open'):
                doctor.plan(doctor.HTTP(2), self.url, True)

    def test_designer_body_and_errors(self):
        self.assertIn('1 added', doctor.designer(doctor.HTTP(2), self.url))
        body = self.server.bodies[-1]
        self.assertEqual(body['scene']['format'], 'varpet.editor')
        self.assertEqual(body['request'], 'Furnish the Bedroom 1.')
        self.assertTrue(body['events'])
        for error in ('fetch failed', 'no checked fit', 'geometry is supported'):
            self.server.designer_reply = (json.dumps({'type': 'progress', 'message': error}) + '\n').encode() + self.server.designer_reply
            with self.assertRaisesRegex(ValueError, error):
                doctor.designer(doctor.HTTP(2), self.url)

    def test_no_add_fails(self):
        self.server.designer_reply = b'{"type":"message","message":"hello"}\n'
        with self.assertRaisesRegex(ValueError, 'no added item'):
            doctor.designer(doctor.HTTP(2), self.url)

    def test_modes_and_unknown_only(self):
        self.assertEqual(self.cli('--quick', '--only', 'plan-positive').returncode, 2)
        self.assertEqual(self.cli('--only', 'designer-turn').returncode, 2)
        self.assertEqual(self.cli('--only', 'typo').returncode, 2)
        result = self.cli('--vm', self.url, '--only', 'catalog-vm')
        self.assertEqual(result.returncode, 0, result.stdout)


class LocalTest(unittest.TestCase):
    def test_cli_formatting_without_socket(self):
        import contextlib
        import io
        for status, code in [('PASS', 0), ('WARN', 0), ('FAIL', 1)]:
            output = io.StringIO()
            with patch.object(doctor, 'run', return_value=[doctor.Result('editor', status, .1, 'detail', 'restart')]), contextlib.redirect_stdout(output):
                self.assertEqual(doctor.main(['--quick', '--only', 'editor']), code)
            self.assertIn('| ' + status, output.getvalue())
            self.assertEqual('FIX:' in output.getvalue(), status != 'PASS')

    def test_deadlines_and_parallel_checks(self):
        start = time.monotonic()
        results = doctor.run([doctor.Check(str(i), .08, lambda h: time.sleep(.4), 'retry') for i in range(3)])
        self.assertLess(time.monotonic() - start, .3)
        self.assertTrue(all(r.status == 'FAIL' and r.fix == 'retry' for r in results))

    def test_process_ancestry_and_memory(self):
        ps = '10 1 20:00 python -m varpet_harness.serve\n11 10 12:00 helper\n12 11 11:00 /bin/codex app-server\n13 1 20:00 codex\n14 10 01:00 codex\n'
        with patch.object(doctor.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, ps)):
            status, detail, fix = doctor.processes(doctor.HTTP(2))
        self.assertEqual(status, 'WARN')
        self.assertIn('[12]', detail)
        self.assertTrue(fix.endswith('kill 12'))
        with patch.object(doctor.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0,
                          'The system has 17179869184 bytes\nSystem-wide memory free percentage: 9%\n')):
            self.assertEqual(doctor.memory(doctor.HTTP(2))[0], 'WARN')
        with patch.object(doctor.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0,
                          'System-wide memory free percentage: 54%\n')):
            self.assertEqual(doctor.memory(doctor.HTTP(2)), '54% memory available')



if __name__ == '__main__':
    unittest.main()
