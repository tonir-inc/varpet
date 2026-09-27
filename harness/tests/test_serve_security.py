import asyncio
import base64
import io
import json
import os
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

from varpet_harness import serve


def request(tmp_path, method='POST', headers=None, path='/structure', cls=None):
    cls = cls or serve.handler(Path('.'), tmp_path)
    obj = object.__new__(cls)
    obj.path = path
    obj.headers = {'Host': 'localhost:8788', 'Content-Type': 'application/json', 'Content-Length': '2', **(headers or {})}
    obj.server = SimpleNamespace(server_port=8788)
    obj.rfile, obj.wfile = io.BytesIO(b'{}'), io.BytesIO()
    obj.response_headers = {}
    obj.send_response = lambda status: setattr(obj, 'status', status)
    obj.send_header = lambda key, value: obj.response_headers.update({key: value})
    obj.end_headers = lambda: None
    getattr(obj, 'do_' + method)()
    return obj


@pytest.mark.parametrize('method', ['GET', 'POST', 'OPTIONS'])
def test_foreign_origin(tmp_path, method):
    obj = request(tmp_path, method, {'Origin': 'https://evil.example', 'Content-Type': 'text/plain'})
    assert obj.status == 403
    assert 'Access-Control-Allow-Origin' not in obj.response_headers


@pytest.mark.parametrize('origin', ['http://localhost:5174', 'https://127.0.0.1:5173', 'https://[::1]:5173'])
def test_local_origin(tmp_path, origin):
    obj = request(tmp_path, 'OPTIONS', {'Origin': origin})
    assert obj.status == 204
    assert obj.response_headers['Access-Control-Allow-Origin'] == origin


@pytest.mark.parametrize('host', ['evil.example:8788', 'localhost:99', 'localhost:8788@evil.example', 'localhost'])
def test_host(tmp_path, host):
    assert request(tmp_path, 'GET', {'Host': host}).status == 403


def test_content_type(tmp_path):
    assert request(tmp_path, headers={'Content-Type': 'text/plain'}).status == 415


def test_retention(tmp_path, monkeypatch):
    old, fresh = tmp_path / 'old', tmp_path / 'fresh'
    old.mkdir(); fresh.mkdir()
    (old / 'input').write_text('private')
    os.utime(old, (time.time() - 7200,) * 2)
    monkeypatch.setenv('VARPET_RUN_RETENTION_HOURS', '1')
    serve._prepare_runs(tmp_path)
    assert not old.exists() and fresh.exists()
    assert tmp_path.stat().st_mode & 0o777 == 0o700


@pytest.mark.parametrize('format', ['JPEG', 'PNG', 'WEBP'])
def test_metadata(tmp_path, format):
    image = Image.new('RGB', (40, 20))
    exif = Image.Exif()
    exif[274] = 6
    exif[34853] = {1: 'N', 2: (40.0, 0.0, 0.0), 3: 'E', 4: (44.0, 0.0, 0.0)}
    raw = io.BytesIO()
    image.save(raw, format=format, exif=exif)
    path = serve._save({'name': 'photo', 'data': base64.b64encode(raw.getvalue()).decode()}, tmp_path, 'photo')
    with Image.open(path) as saved:
        assert saved.format == format
        assert saved.size == (20, 40)
        assert not saved.getexif()


def test_non_image_unchanged(tmp_path):
    assert serve._save({'data': base64.b64encode(b'pdf bytes').decode()}, tmp_path, 'plan.pdf').read_bytes() == b'pdf bytes'


def test_busy_build(tmp_path, monkeypatch):
    import threading
    started, release = threading.Event(), threading.Event()
    cls = serve.handler(Path('.'), tmp_path)
    def build(self, route, size):
        started.set()
        assert release.wait(2)
    monkeypatch.setattr(cls, '_build', build)
    thread = threading.Thread(target=lambda: request(tmp_path, cls=cls))
    thread.start()
    try:
        assert started.wait(2)
        assert request(tmp_path, cls=cls).status == 429
    finally:
        release.set()
        thread.join()


@pytest.mark.parametrize('route', ['/flat', '/structure'])
def test_disconnect_cancels_and_cleans_inputs(tmp_path, monkeypatch, route):
    inputs = tmp_path / 'run' / 'inputs'
    cancelled = []
    async def build(*args, **kwargs):
        inputs.mkdir(parents=True)
        (inputs / 'photo').write_bytes(b'private')
        serve._track_inputs(inputs)
        try:
            await asyncio.sleep(30)
        finally:
            cancelled.append(True)
    async def accepted(*args):
        return dict(is_plan=True, kind='plan', confidence=1., reason='Plan.')
    monkeypatch.setattr(serve, 'check_plan', accepted)
    monkeypatch.setattr(serve, 'furnished_flat', build)
    monkeypatch.setattr(serve, 'reconstruct', build)
    cls = serve.handler(Path('.'), tmp_path)
    monkeypatch.setattr(cls, '_disconnected', lambda self: inputs.exists())
    start = time.monotonic()
    request(tmp_path, cls=cls, path=route)
    assert time.monotonic() - start < 2
    assert cancelled and not inputs.exists()


async def test_invalid_classification_does_not_allow_build(tmp_path, monkeypatch):
    from varpet_harness.plan_gate import parse_verdict
    async def malformed(path):
        return parse_verdict('not json')
    monkeypatch.setattr(serve, 'classify_plan', malformed)
    with pytest.raises(ValueError):
        await serve.check_plan({'plan': {'data': base64.b64encode(b'image').decode()}})


def test_png_text_removed(tmp_path):
    from PIL.PngImagePlugin import PngInfo
    text = PngInfo()
    text.add_text('Location', 'private address')
    raw = io.BytesIO()
    Image.new('RGB', (20, 20)).save(raw, format='PNG', pnginfo=text)
    path = serve._save({'data': base64.b64encode(raw.getvalue()).decode()}, tmp_path, 'photo.png')
    with Image.open(path) as image:
        assert not image.text


@pytest.mark.parametrize('host', ['localhost:8788', '127.0.0.1:8788', '[::1]:8788'])
def test_files_without_origin(tmp_path, host):
    (tmp_path / 'piece.glb').write_bytes(b'glTF')
    obj = request(tmp_path, 'GET', {'Host': host}, path='/files/piece.glb')
    assert obj.status == 200 and obj.wfile.getvalue() == b'glTF'
    assert 'Access-Control-Allow-Origin' not in obj.response_headers
