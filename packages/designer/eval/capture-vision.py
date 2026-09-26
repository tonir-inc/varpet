"""Capture the actual editor UI; run Vite on port 5193 before this script."""
import hashlib
import json
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUTPUT = HERE / 'vision-fixtures'
OUTPUT.mkdir(exist_ok=True)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless=True)
    page = browser.new_page(viewport={'width': 1600, 'height': 1000}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5193', wait_until='networkidle')
    page.locator('#viewport canvas').wait_for()
    page.locator('#focus').click()
    page.wait_for_timeout(2000)  # Let the camera animation and renderer settle.
    assert not page.locator('#render-error').is_visible()
    snapshot = page.evaluate("async () => {const {demoScene,localCatalog}=await import('/src/core/demo.ts'); return {scene:demoScene,catalog:localCatalog};}")
    page.locator('#viewport').screenshot(path=str(OUTPUT / 'avani-3d.png'))
    page.locator('#plan-view').click()
    page.locator('#floor-plan').wait_for(state='visible')
    page.keyboard.press('f')
    page.wait_for_timeout(500)
    page.locator('#floor-plan').screenshot(path=str(OUTPUT / 'avani-plan.png'))
    (OUTPUT / 'editor-input.json').write_text(json.dumps(snapshot, indent=2) + '\n')
    manifest = {'captured_at': subprocess.check_output(['date', '-u', '+%Y-%m-%dT%H:%M:%SZ'], text=True).strip(),
                'source_revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                'url': page.url, 'browser': browser.version, 'viewport': page.viewport_size,
                'scene_id': snapshot['scene']['id'], 'page_errors': errors,
                'method': 'Fresh browser context, unmodified demo, default cutaway 3D and Plan buttons; crop to rendered viewport, no image editing.',
                'sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in OUTPUT.iterdir() if p.suffix in ('.png', '.json')}}
    (OUTPUT / 'capture.json').write_text(json.dumps(manifest, indent=2) + '\n')
    browser.close()
    print(json.dumps(manifest, indent=2))
