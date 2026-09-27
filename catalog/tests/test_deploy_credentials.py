"""Exercise deployment with fake git/SSH/rsync; no VM or network needed."""
import os
from pathlib import Path
import subprocess

DEPLOY = Path(__file__).resolve().parents[1] / 'deploy/deploy.sh'


def deploy(tmp_path, **settings):
    bin_dir = tmp_path / 'bin'
    bin_dir.mkdir()
    for name, body in {
        'git': 'case "$1" in rev-parse) echo same;; esac',
        'rsync': 'exit 0',
        'ssh': 'printf "%s\\n" "$*" >> "$CAPTURE/argv"; cat >> "$CAPTURE/stdin"',
    }.items():
        path = bin_dir / name
        path.write_text('#!/bin/sh\n' + body + '\n')
        path.chmod(0o755)
    env = {k: v for k, v in os.environ.items() if not k.startswith('VARPET_')}
    env.update(PATH=f'{bin_dir}:{env["PATH"]}', CAPTURE=str(tmp_path), **settings)
    result = subprocess.run(['bash', str(DEPLOY)], env=env, capture_output=True, text=True)
    return result, (tmp_path / 'stdin').read_text() if (tmp_path / 'stdin').exists() else '', (tmp_path / 'argv').read_text() if (tmp_path / 'argv').exists() else ''


def test_readonly_password_without_owner_url(tmp_path):
    result, stdin, argv = deploy(tmp_path, VARPET_CATALOG_RO_PASSWORD="p@ss:' /%", VARPET_CATALOG_RO_URL='postgresql://varpet_ro@localhost:5432/varpet')
    assert result.returncode == 0, result.stderr
    assert 'VARPET_DB_URL=postgresql://varpet_ro:p%40ss%3A%27%20%2F%25@localhost:5432/varpet\n' in stdin
    assert 'CATALOG_ENABLE_GENERATION=0\n' in stdin
    assert 'p%40ss' not in argv + result.stdout + result.stderr


def test_owner_fallback_warns(tmp_path):
    result, stdin, argv = deploy(tmp_path, VARPET_DB_URL='postgresql://varpet:owner-secret@localhost:15432/varpet')
    assert result.returncode == 0, result.stderr
    assert 'VARPET_DB_URL=postgresql://varpet:owner-secret@localhost:5432/varpet\n' in stdin
    assert 'WARNING' in result.stderr and 'owner' in result.stderr
    assert 'owner-secret' not in argv + result.stdout + result.stderr
    assert 'CATALOG_ENABLE_GENERATION=0\n' in stdin


def test_rejects_owner_as_readonly_url(tmp_path):
    result, stdin, argv = deploy(tmp_path, VARPET_CATALOG_RO_PASSWORD='secret', VARPET_CATALOG_RO_URL='postgresql://varpet@localhost:5432/varpet')
    assert result.returncode != 0
    assert not stdin and not argv


def test_readonly_default_url(tmp_path):
    result, stdin, argv = deploy(tmp_path, VARPET_CATALOG_RO_PASSWORD='ro-secret')
    assert result.returncode == 0, result.stderr
    assert 'VARPET_DB_URL=postgresql://varpet_ro:ro-secret@localhost:5432/varpet\n' in stdin
    assert 'ro-secret' not in argv + result.stdout + result.stderr


def test_rejects_url_environment_injection(tmp_path):
    result, stdin, argv = deploy(tmp_path, VARPET_CATALOG_RO_PASSWORD='secret', VARPET_CATALOG_RO_URL='postgresql://varpet_ro@localhost:5432/varpet?options=unsafe')
    assert result.returncode != 0
    assert not stdin and not argv
