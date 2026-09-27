import asyncio
import json

import pytest
from PIL import Image

from varpet_harness.plan_gate import PROMPT, classify_plan


@pytest.fixture
def image(tmp_path):
    path = tmp_path / 'image.png'
    Image.new('RGB', (400, 250)).save(path)
    return path


@pytest.mark.parametrize('is_plan,kind', [(True, 'floor plan'), (False, 'room photo')])
async def test_classification_one_call(image, is_plan, kind):
    calls = []
    expected = dict(is_plan=is_plan, kind=kind, confidence=0.9, reason='A short explanation.')

    async def runner(path):
        calls.append(path)
        return json.dumps(expected)

    assert await classify_plan(image, runner=runner) == expected
    assert calls == [image]


@pytest.mark.parametrize('response', ['not json', '{"is_plan":"false"}'])
async def test_invalid_result_does_not_fail_open(image, response, caplog):
    async def runner(path):
        return response
    with pytest.raises(ValueError):
        await classify_plan(image, runner=runner)


async def test_timeout_fails_open(image, caplog):
    async def runner(path):
        await asyncio.sleep(10)
    result = await classify_plan(image, runner=runner, timeout=0.01)
    assert result['is_plan'] is True
    assert 'plan gate' in caplog.text.lower()


async def test_sdk_uses_one_low_effort_image_turn_without_tools(tmp_path, monkeypatch, image):
    from types import SimpleNamespace
    import openai_codex
    from varpet_harness import plan_gate

    home = tmp_path / 'home'
    home.mkdir()
    cache = home / 'models_cache.json'
    original = json.dumps({'models': [{'slug': 'gpt-6-astra', 'tool_mode': 'code_mode_only'}]})
    cache.write_text(original)
    monkeypatch.setenv('CODEX_HOME', str(home))
    calls = []
    expected = dict(is_plan=True, kind='floor plan', confidence=.95, reason='This shows the interior layout.')
    class Thread:
        async def run(self, items, **options):
            calls.append('turn')
            assert options['effort'] == 'low'
            schema = options['output_schema']
            assert schema['type'] == 'object'
            assert schema['additionalProperties'] is False
            assert schema['required'] == ['is_plan', 'kind', 'confidence', 'reason']
            assert {name: field['type'] for name, field in schema['properties'].items()} == {
                'is_plan': 'boolean', 'kind': 'string', 'confidence': 'number', 'reason': 'string',
            }
            assert len(items) == 2
            assert isinstance(items[1], openai_codex.LocalImageInput)
            assert items[1].path == str((tmp_path / 'image.png').resolve())
            return SimpleNamespace(final_response=json.dumps(expected))
    class Codex:
        async def thread_start(self, **options):
            assert options['model'] == 'gpt-6-astra'
            config = options['config']
            assert config['web_search'] == 'disabled'
            assert not any(config['features'].values())
            assert json.loads(Path(config['model_catalog_json']).read_text())['models'][0]['tool_mode'] == 'direct'
            return Thread()
        async def close(self):
            calls.append('close')
    from pathlib import Path
    monkeypatch.setattr(openai_codex, 'AsyncCodex', Codex)
    assert await plan_gate.classify_plan(tmp_path / 'image.png') == expected
    assert calls == ['turn', 'close']
    assert cache.read_text() == original


async def test_dollhouse_prompt_and_classification(image):
    # A fake runner verifies policy delivery, not real-model vision accuracy.
    assert 'top-down or isometric 3D dollhouse cutaway floor plans' in PROMPT
    assert 'extruded walls and visible furniture' in PROMPT
    assert 'Reject eye-level room renders/photos and perspective 3D views of a single room' in PROMPT
    expected = dict(is_plan=True, kind='dollhouse floor plan', confidence=.95,
                    reason='This shows the whole flat layout from above.')
    calls = []

    async def runner(path):
        calls.append(path)
        return json.dumps(expected)

    assert await classify_plan(image, runner=runner) == expected
    assert calls == [image]


@pytest.mark.parametrize('size', [(32, 24), (399, 250), (400, 249), (250, 399), (249, 400)])
async def test_too_small_never_calls_model(tmp_path, size):
    path = tmp_path / 'small.png'
    Image.new('RGB', size).save(path)
    calls = []

    async def runner(path):
        calls.append(path)
        return '{}'

    assert await classify_plan(path, runner=runner) == dict(
        is_plan=False, kind='too small', confidence=1.0,
        reason='The image is too small to read - upload the plan at least 400 px wide.')
    assert calls == []


@pytest.mark.parametrize('size', [(400, 250), (250, 400)])
@pytest.mark.parametrize('format', ['PNG', 'JPEG', 'WEBP'])
async def test_readable_boundary_calls_model(tmp_path, size, format):
    path = tmp_path / 'plan'
    Image.new('RGB', size).save(path, format=format)
    calls = []
    expected = dict(is_plan=True, kind='floor plan', confidence=.9, reason='An interior layout.')

    async def runner(path):
        calls.append(path)
        return json.dumps(expected)

    assert await classify_plan(path, runner=runner) == expected
    assert calls == [path]


@pytest.mark.parametrize('damage', ['empty', 'garbage', 'truncated', 'missing'])
async def test_unreadable_never_calls_model(image, damage):
    if damage == 'missing':
        image.unlink()
    else:
        data = {'empty': b'', 'garbage': b'not an image',
                'truncated': image.read_bytes()[:50]}[damage]
        image.write_bytes(data)
    calls = []

    async def runner(path):
        calls.append(path)
        return '{}'

    result = await classify_plan(image, runner=runner)
    assert result['is_plan'] is False
    assert result['kind'] == 'unreadable image'
    assert result['confidence'] == 1.0
    assert result['reason']
    assert calls == []


@pytest.mark.parametrize('change', ['fences', 'extra', 'reason', 'high', 'low'])
async def test_lenient_verdict(image, change):
    verdict = dict(is_plan=False, kind='photo', confidence=.9, reason='Room.')
    if change == 'extra': verdict['extra'] = 'ignored'
    if change == 'reason': verdict['reason'] = 'x' * 400
    if change == 'high': verdict['confidence'] = 2
    if change == 'low': verdict['confidence'] = -1
    raw = json.dumps(verdict)
    if change == 'fences': raw = '```json\n' + raw + '\n```'
    async def runner(path): return raw
    result = await classify_plan(image, runner=runner)
    assert result['is_plan'] is False
    assert len(result['reason']) <= 300
    assert result['confidence'] == (1 if change == 'high' else 0 if change == 'low' else .9)
    assert 'extra' not in result
