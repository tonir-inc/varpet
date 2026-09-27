import io
import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import pytest
from varpet_harness import serve
from varpet_harness.http_policy import HourlyLimit, client_ip, origin_allowed, public_origin
from test_serve_security import request

PUBLIC = 'https://varpet.snek.page'


def test_origin_is_exact_and_optional(monkeypatch):
    monkeypatch.delenv('VARPET_PUBLIC_ORIGIN', raising=False)
    assert not origin_allowed(PUBLIC, serve.LOCAL_ORIGIN)
    monkeypatch.setenv('VARPET_PUBLIC_ORIGIN', PUBLIC)
    assert public_origin() == PUBLIC
    assert origin_allowed(PUBLIC, serve.LOCAL_ORIGIN)
    for origin in [PUBLIC + '.evil', PUBLIC + '/', 'http://varpet.snek.page', 'null']:
        assert not origin_allowed(origin, serve.LOCAL_ORIGIN)
    assert origin_allowed('http://localhost:5173', serve.LOCAL_ORIGIN)
    monkeypatch.setenv('VARPET_PUBLIC_ORIGIN', PUBLIC + '/path')
    with pytest.raises(ValueError):
        public_origin()


def test_public_host_cors_and_asset_base(tmp_path, monkeypatch):
    monkeypatch.setenv('VARPET_PUBLIC_ORIGIN', PUBLIC)
    assert request(tmp_path, 'OPTIONS', {'Origin': PUBLIC, 'Host': 'varpet.snek.page'}).status == 204
    assert request(tmp_path, 'GET', {'Origin': PUBLIC, 'Host': 'evil.example'}).status == 403
    (tmp_path / 'demo').mkdir()
    (tmp_path / 'demo/graph.json').write_text('{}')
    monkeypatch.setattr(serve, 'catalog', lambda directory, base: {'base': base})
    result = request(tmp_path, 'GET', {'Host': 'varpet.snek.page'}, path='/pieces?run=demo')
    assert json.loads(result.wfile.getvalue())['base'] == PUBLIC


def test_sliding_limit_atomic_expiry_and_clients(monkeypatch):
    monkeypatch.setenv('TEST_LIMIT', '3')
    now = [10]
    limit = HourlyLimit('TEST_LIMIT', 10, lambda: now[0])
    with ThreadPoolExecutor(max_workers=10) as pool:
        assert sum(pool.map(lambda _: limit.allow('a'), range(20))) == 3
    assert limit.allow('b')
    now[0] += 3600
    assert limit.allow('a')
    assert 'b' not in limit.events


def test_client_ip():
    obj = SimpleNamespace(headers={'CF-Connecting-IP': '2001:db8::1'}, client_address=('127.0.0.2', 10))
    assert client_ip(obj) == '2001:db8::1'
    obj.headers = {'CF-Connecting-IP': 'invalid'}
    assert client_ip(obj) == '127.0.0.2'
    obj.headers = {}
    assert client_ip(obj) == '127.0.0.2'


def test_build_routes_share_quota_and_plan_checks_separate(tmp_path, monkeypatch):
    monkeypatch.setenv('VARPET_BUILD_LIMIT_PER_HOUR', '2')
    monkeypatch.setenv('VARPET_PLAN_CHECK_LIMIT_PER_HOUR', '1')
    cls = serve.handler(Path('.'), tmp_path)
    cls._build = lambda self, route, size: self._json(200, {})
    async def check(*args):
        return {'is_plan': True}
    monkeypatch.setattr(serve, 'check_plan', check)
    for path in ['/flat', '/structure']:
        assert request(tmp_path, cls=cls, path=path).status == 200
    blocked = request(tmp_path, cls=cls, path='/flat')
    assert blocked.status == 429 and b'Build limit reached (2 per hour)' in blocked.wfile.getvalue()
    assert request(tmp_path, cls=cls, headers={'CF-Connecting-IP': '1.2.3.4'}).status == 200
    assert request(tmp_path, cls=cls, path='/plan-check').status == 200
    assert request(tmp_path, cls=cls, path='/plan-check').status == 429


def test_designer_origin_and_turn_limit(monkeypatch):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import designer_service as designer
    monkeypatch.setenv('VARPET_PUBLIC_ORIGIN', PUBLIC)
    monkeypatch.setenv('VARPET_DESIGNER_LIMIT_PER_HOUR', '1')
    # Capture the real handler without binding a socket or invoking a model.
    monkeypatch.setattr(designer, 'ThreadingHTTPServer', lambda address, cls: cls)
    monkeypatch.setattr(designer, 'validate_request', lambda body: body)
    class Worker:
        def __init__(self, target, **kwargs): self.target = target
        def start(self): self.target()
        def join(self): pass
    monkeypatch.setattr(designer.threading, 'Thread', Worker)
    service = SimpleNamespace(progress_interval=.1, propose=lambda *a: {'type': 'message', 'message': 'hello'})
    cls = designer.make_server(service)
    def turn(origin=PUBLIC, ip='1.2.3.4'):
        obj = object.__new__(cls)
        obj.path = '/designer/propose'
        obj.headers = {'Origin': origin, 'CF-Connecting-IP': ip, 'Content-Length': '2'}
        obj.client_address = ('127.0.0.1', 1)
        obj.rfile, obj.wfile = io.BytesIO(b'{}'), io.BytesIO()
        obj.connection = SimpleNamespace(settimeout=lambda _: None)
        obj.send_response = lambda status: setattr(obj, 'status', status)
        obj.send_header = lambda *a: None
        obj.end_headers = lambda: None
        obj.disconnected = lambda: False
        obj.do_POST()
        return obj
    assert turn(PUBLIC + '.evil').status == 403
    assert turn().status == 200
    blocked = turn()
    assert blocked.status == 429 and b'Designer limit reached' in blocked.wfile.getvalue()
    assert turn('http://localhost:5173', '2.3.4.5').status == 200
