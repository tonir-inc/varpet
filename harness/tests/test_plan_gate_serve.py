import base64
import io
import json
from pathlib import Path

import pytest

from varpet_harness import serve


def request(tmp_path, route, classifier):
    body = json.dumps({'plan': {'name': 'plan.png', 'data': base64.b64encode(b'image').decode()}}).encode()
    cls = serve.handler(Path('.'), tmp_path, classifier=classifier)
    instance = object.__new__(cls)
    instance.path = route
    instance.headers = {'Content-Length': str(len(body))}
    instance.rfile = io.BytesIO(body)
    instance.wfile = io.BytesIO()
    instance.send_response = lambda *args: None
    instance.send_header = lambda *args: None
    instance.end_headers = lambda: None
    instance.do_POST()
    return [json.loads(line) for line in instance.wfile.getvalue().splitlines()]


@pytest.mark.parametrize('route', ['/flat', '/structure'])
@pytest.mark.parametrize('verdict,confidence,builds', [(True, .9, True), (False, .9, False), (False, .6, False), (False, .59, True), (None, 0, True)])
def test_gate_before_architect(tmp_path, monkeypatch, caplog, route, verdict, confidence, builds):
    calls = []
    async def classifier(path):
        assert path.read_bytes() == b'image'
        if verdict is None:
            raise RuntimeError('offline')
        return dict(is_plan=verdict, kind='room photo', confidence=confidence, reason='This image shows a room.')
    async def build(*args, **kwargs):
        calls.append(True)
        return {}
    monkeypatch.setattr(serve, 'furnished_flat', build)
    monkeypatch.setattr(serve, 'reconstruct', build)
    lines = request(tmp_path, route, classifier)
    assert lines[0] == {'type': 'progress', 'message': 'Checking the plan'}
    assert bool(calls) is builds
    assert lines[-1]['type'] == (('project' if route == '/flat' else 'structure') if builds else 'rejected')
    if not builds:
        assert lines[-1]['kind'] == 'room photo'
        assert lines[-1]['reason'] == 'This image shows a room.'
    if verdict is None:
        assert 'plan gate' in caplog.text.lower()


def test_plan_check(tmp_path):
    expected = dict(is_plan=False, kind='blank', confidence=.99, reason='The image is blank.')
    async def classifier(path):
        return expected
    assert request(tmp_path, '/plan-check', classifier) == [expected]
