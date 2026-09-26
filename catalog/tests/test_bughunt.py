"""27 Sept QA regressions; no network, database, or model downloads."""
import io
from unittest.mock import MagicMock
import pytest
from ingest_abo import kind_of, compare
from search import Query, search
from test_extra_furniture import matches

@pytest.mark.parametrize("name,kind", [
    ('Stone & Beam Carrigan Modern Sofa Couch with Slipcover, 88.5"W', 'sofa'),
    ('Rivet Aiden Bench Seat Sofa, Without Side Pillows', 'sofa'),
    ('Ravenna Darian Oversized Pillow Sofa', 'sofa'),
    ('Andover Slipcover Ottoman', 'ottoman'), ('Bedroom Bench with Cushion', 'bench'),
    ('Leather Sofa with Throw Pillows', 'sofa'), ('Cushioned Pouf', 'ottoman'),
    ('Stool with cushion', 'stool'), ('Slipcover Chair', 'chair'),
    ('Sofa pillow cover', 'decor'), ('Bench seat cushion', 'decor'),
    ('Throw pillow for sofa', 'decor'), ('Sofa slipcover', 'decor'),
    ('Cushion cover', 'decor'), ('Dining Room Table Chairs', 'chair'),
    ('Dining table set with chairs', 'table'), ('Sofa wall art', 'wall_art'),
    ('Stone & Beam Clifton Modern Upholstered King Bed with Headboard', 'bed'),
    ('Rivet Payton Queen Bed with Headboard', 'bed'),
    ('Movian Loue Bed Frame with Headboard, 160 x 200cm', 'bed'),
    ('Upholstered headboard for queen bed', 'headboard'),
])
def test_names(name, kind):
    assert kind_of(None, name) == kind

@pytest.mark.parametrize("kind,notes", [
    ('kitchen_island', 'Free-standing island; overhanging 2 cm'),
    ('shower', 'back walls; shower head on -Z wall'),
    ('toilet', 'against wall'), ('bathtub', 'against wall'),
    ('monitor', 'wallpaper'), ('decor', 'bicycle hanging gear'),
    ('decor', 'snowboard wall storage possible'), ('clock', 'floor; grandfather clock'),
])
def test_floor_evidence(kind, notes):
    assert matches(kind, {'extra': {'notes': notes}}, slug='wall-lift-model')

@pytest.mark.parametrize("kind", ['lamp', 'sink', 'kitchen_cabinet', 'chair'])
@pytest.mark.parametrize("placement", ['wall', 'wall-mounted', 'ceiling', 'ceiling-mounted'])
def test_mount_exclusion_cannot_be_bypassed(kind, placement):
    assert not matches(kind, {'extra': {'placement': placement, 'notes': 'floor; fixture'}})

@pytest.mark.parametrize("mesh,listing,nw", [
    (1.5,2.01,2.0066), (1.7,2.13,2.1336), (1.61,2.01,2.0066),
    (1.81,2.21,2.2098), (2.09,2.32,2.3241), (2.02,2.25,2.2479),
    (.99,1.27,1.27), (1.,1.15,1.15),
])
def test_agreeing_widths(mesh, listing, nw):
    status, evidence, fit = compare([mesh,2.2,1], [listing,2.2,1], nw)
    assert status == 'estimated'
    assert fit[0] == pytest.approx(max(listing,nw), abs=.0001)
    assert evidence['fit_width_rule']
    assert fit[1:] == [2.2,1]

@pytest.mark.parametrize("kwargs,message", [
    ({'limit':0}, 'limit'), ({'limit':-3}, 'limit'), ({'limit':21}, 'limit'),
    ({'offset':-1}, 'offset'), ({'scope':'bogus'}, 'scope'),
    ({'target_size':[2,1]}, 'target_size'), ({'fit_box':[]}, 'fit_box'),
])
def test_invalid_queries_before_db(kwargs, message):
    with pytest.raises(ValueError, match=message):
        search(None, Query(**kwargs))

def test_unknown_kind_lists_vocab():
    conn = MagicMock()
    conn.execute.return_value.fetchall.return_value = [('sofa',2), ('bed',1)]
    with pytest.raises(ValueError, match='Valid kinds: bed, sofa'):
        search(conn, Query(kind='sofaz'))

def test_missing_similarity_reference():
    import mcp_server
    with pytest.raises(ValueError, match='item_id or image'):
        mcp_server.find_similar()

def test_unknown_similarity_reference(monkeypatch):
    import mcp_server
    conn = MagicMock()
    conn.__enter__.return_value = conn
    conn.execute.return_value.fetchone.return_value = None
    monkeypatch.setattr(mcp_server, '_conn', lambda: conn)
    with pytest.raises(ValueError, match='no item nope'):
        mcp_server.find_similar(item_id='nope')

@pytest.mark.parametrize('url', ['/tmp/red.png','file:///tmp/a.png','https://evil.example/a.png',
    'http://localhost:8765/admin','http://localhost:8765/previews/../admin',
    'http://localhost:8765/previews/%2e%2e/admin'])
def test_untrusted_images(url):
    from embed_siglip_query import fetch_image
    with pytest.raises(ValueError):
        fetch_image(url)

def test_capped_image_read(monkeypatch):
    import embed_siglip_query as mod
    response = MagicMock()
    response.__enter__.return_value = response
    response.headers = {}
    response.read.side_effect = lambda n: b'x' * n
    opener = MagicMock()
    opener.open.return_value = response
    monkeypatch.setattr('urllib.request.build_opener', lambda *a: opener)
    with pytest.raises(ValueError, match='10 MB'):
        mod.fetch_image('http://localhost:8765/previews/a.webp')
    assert opener.open.call_args.kwargs['timeout'] == 10
    assert all(c.args[0] <= 65536 for c in response.read.call_args_list)

def test_decode_image_before_loading_model(monkeypatch):
    from PIL import Image
    import embed_siglip_query as mod
    buf = io.BytesIO()
    Image.new('RGB',(2,2)).save(buf, 'PNG')
    response = MagicMock()
    response.__enter__.return_value = response
    response.headers = {}
    response.read.side_effect = [buf.getvalue(), b'']
    opener = MagicMock()
    opener.open.return_value = response
    monkeypatch.setattr('urllib.request.build_opener', lambda *a: opener)
    assert mod.fetch_image('https://amazon-berkeley-objects.s3.amazonaws.com/images/a.png').size == (2,2)

def test_width_rule_requires_both_sources_to_agree():
    for listing, nw in [([1.3, 2, 1], 1.6), ([1.3,2,1], None), ([1.1,2,1],1.1)]:
        _, ev, fit = compare([1,2,1], listing, nw)
        assert 'fit_width_rule' not in ev
        assert fit[0] == 1

def test_reclassification_is_scoped_and_idempotent():
    from fixes.reclassify_names import changes
    rows = [('a','Sofa with pillows','decor'),('b','Bed with Headboard','headboard'),
            ('c','Headboard for bed','headboard'),('d','Throw pillow for sofa','decor'),
            ('e','Unrecognized product','decor')]
    result = list(changes(rows))
    assert [(r[0], r[3]) for r in result] == [('a','sofa'),('b','bed')]
    assert list(changes([(iid,name,new) for iid,name,old,new in result])) == []

def test_redirects_are_rejected(monkeypatch):
    import urllib.request
    import embed_siglip_query as mod
    def build(*handlers):
        redirect = next(h for h in handlers if isinstance(h, urllib.request.HTTPRedirectHandler))
        with pytest.raises(ValueError, match='redirect'):
            redirect.redirect_request(None,None,302,'',{},'http://evil.example/x')
        raise RuntimeError('checked')
    monkeypatch.setattr(urllib.request, 'build_opener', build)
    with pytest.raises(RuntimeError, match='checked'):
        mod.fetch_image('http://localhost:8765/previews/a.webp')

def test_invalid_image_body(monkeypatch):
    import embed_siglip_query as mod
    response = MagicMock()
    response.__enter__.return_value = response
    response.headers = {}
    response.read.side_effect = [b'not an image', b'']
    opener = MagicMock()
    opener.open.return_value = response
    monkeypatch.setattr('urllib.request.build_opener', lambda *a: opener)
    with pytest.raises(ValueError, match='decode as an image'):
        mod.fetch_image('http://localhost:8765/previews/a.webp')

@pytest.mark.parametrize('failure,code', [('sync',41), ('service',3)])
def test_deploy_failure_and_secret_transport(tmp_path, failure, code):
    """Execute deploy with fake commands: no SSH, git, sudo or service is contacted."""
    import os
    import subprocess
    from pathlib import Path
    bindir = tmp_path / 'bin'
    bindir.mkdir()
    log = tmp_path / 'argv'
    payload = tmp_path / 'stdin'
    scripts = {
        'git': '#!/bin/bash\ncase "$1" in rev-parse) echo same;; esac\n',
        'rsync': '#!/bin/bash\nexit 0\n',
        'ssh': r"""#!/bin/bash
printf '%s\n' "$@" >> "$QA_LOG"
cmd="${!#}"
if [[ "$cmd" == *"tee /etc/varpet-catalog.env"* ]]; then cat > "$QA_PAYLOAD"; exit 0; fi
if [[ "$cmd" == *"uv sync"* ]]; then
  [[ "$cmd" == "set -euo pipefail"* ]] || exit 90
  # Exercise the real remote block through its sync pipeline.
  cmd="${cmd/cd \/opt\/varpet-catalog\/app/cd .}"
  bash -c "$cmd"
fi
""",
        'sudo': '#!/bin/bash\nif [[ "$*" == *"uv sync"* && "$QA_FAILURE" == sync ]]; then exit 41; fi\nexit 0\n',
    }
    for name, script in scripts.items():
        file = bindir / name
        file.write_text(script)
        file.chmod(0o755)
    for name, script in {
        'sleep': '#!/bin/bash\nexit 0\n',
        'systemctl': '#!/bin/bash\nif [[ "$1" == is-active ]]; then exit 3; fi\n',
    }.items():
        file = bindir / name
        file.write_text(script)
        file.chmod(0o755)
    secret = "fake'quote-password"
    env = {**os.environ, 'PATH': str(bindir)+':'+os.environ['PATH'],
           'VARPET_DB_URL': f'postgresql://varpet:{secret}@localhost/db',
           'QA_LOG': str(log), 'QA_PAYLOAD': str(payload), 'QA_FAILURE': failure}
    result = subprocess.run(['bash', str(Path(__file__).resolve().parents[1]/'deploy/deploy.sh')],
                            env=env, capture_output=True)
    assert result.returncode == code
    assert secret not in log.read_text()
    assert secret in payload.read_text()
