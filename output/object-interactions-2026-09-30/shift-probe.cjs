const { chromium } = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const extra = `
  choose(['piece-0']); viewport.setSnap(true); await delay(350);
  const shiftBefore = store.scene.objects[0].position.slice(), shiftRevision = store.revision;
  origin = body('piece-0'); target = origin.clone().add(new THREE.Vector3(.37, 0, .19));
  pointer('pointerdown', origin);
  window.dispatchEvent(new KeyboardEvent('keydown', {key:'Shift',shiftKey:true,bubbles:true}));
  check(controls.translationSnap === null && controls.rotationSnap === null && controls.scaleSnap === null, 'Shift temporarily bypasses all furniture gizmo snap types');
  check(document.querySelector('.placement-measurement').textContent.includes('Smooth'), 'Shift updates the live smooth cue immediately');
  pointer('pointermove', target, {shiftKey:true});
  check(near(findRoot('piece-0').position.x, shiftBefore[0]+.37) && near(findRoot('piece-0').position.z, shiftBefore[2]+.19), 'actual body pointer movement retains precise coordinates while Shift is held');
  window.dispatchEvent(new KeyboardEvent('keyup', {key:'Shift',bubbles:true}));
  check(controls.translationSnap === .25 && controls.rotationSnap === Math.PI/12 && controls.scaleSnap === .1 && document.querySelector('.placement-measurement').textContent.includes('Snap on'), 'Shift release restores snap types and live cue');
  pointer('pointermove', target);
  check(near(findRoot('piece-0').position.x, Math.round((shiftBefore[0]+.37)*4)/4) && near(findRoot('piece-0').position.z, Math.round((shiftBefore[2]+.19)*4)/4), 'same pointer resumes quarter metre snapping on Shift release');
  viewport.cancelInteraction();
  check(store.revision === shiftRevision && !active && captured.size === 0 && document.querySelector('.placement-measurement').hidden, 'canceled precision drag leaves no command, capture, or measurement surface');
  origin = body('piece-0'); pointer('pointerdown', origin);
  window.dispatchEvent(new KeyboardEvent('keydown', {key:'Shift',shiftKey:true,bubbles:true}));
  pointer('pointermove', origin.clone().add(new THREE.Vector3(.37,0,.19)), {shiftKey:true});
  window.dispatchEvent(new Event('blur'));
  check(!active && store.revision === shiftRevision && controls.translationSnap === .25 && controls.rotationSnap === Math.PI/12 && controls.scaleSnap === .1, 'blur cancels precision movement and restores snapping without requiring keyup');
  origin = body('piece-0'); target = origin.clone().add(new THREE.Vector3(.37,0,.19));
  pointer('pointerdown', origin); pointer('pointermove', target);
  check(near(findRoot('piece-0').position.x, Math.round((shiftBefore[0]+.37)*4)/4), 'next gesture starts snapped after focus loss');
  viewport.cancelInteraction();
  controls.getHelper().updateMatrixWorld(true);
  const shiftGizmo = controls.getHelper().children.find(child => child instanceof TransformControlsGizmo);
  const shiftAxis = shiftGizmo.picker.translate.children.find(child => child.name === 'X');
  const shiftAxisPoint = new THREE.Box3().setFromObject(shiftAxis).getCenter(new THREE.Vector3());
  pointer('pointerdown', shiftAxisPoint);
  check(controls.dragging && controls.axis === 'X', 'actual X gizmo starts before precision modifier');
  window.dispatchEvent(new KeyboardEvent('keydown', {key:'Shift',shiftKey:true,bubbles:true}));
  pointer('pointermove', shiftAxisPoint.clone().add(new THREE.Vector3(.37,0,.75)), {shiftKey:true});
  check(near(findRoot('piece-0').position.x,shiftBefore[0]+.37) && near(findRoot('piece-0').position.z,shiftBefore[2]), 'Shift keeps actual gizmo movement precise and constrained to X');
  viewport.cancelInteraction(); window.dispatchEvent(new KeyboardEvent('keyup', {key:'Shift',bubbles:true}));
  check(store.revision === shiftRevision && !active && controls.translationSnap === .25 && near(findRoot('piece-0').position.x,shiftBefore[0]), 'gizmo cancellation restores exact placement and snapping');
  viewport.setSnap(false); origin = body('piece-0'); pointer('pointerdown',origin);
  window.dispatchEvent(new KeyboardEvent('keydown', {key:'Shift',shiftKey:true,bubbles:true}));
  window.dispatchEvent(new KeyboardEvent('keyup', {key:'Shift',bubbles:true}));
  check(controls.translationSnap === null && controls.rotationSnap === null && controls.scaleSnap === null, 'modifier release preserves the user Snap off preference');
  viewport.cancelInteraction(); viewport.setSnap(true);
  const shiftSelectOrigin = body('piece-1');
  pointer('pointerdown',shiftSelectOrigin,{shiftKey:true}); pointer('pointerup',shiftSelectOrigin,{shiftKey:true});
  check(!active && ids.includes('piece-0') && ids.includes('piece-1') && store.revision === shiftRevision, 'Shift-click outside a gesture still adds to selection without editing');
  choose(['piece-0']);
`;
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:'/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
  const errors = [], outputs = {};
  try {
    const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/render/furniture-body-drag-qa.ts', async route => {
      const response = await route.fetch(), body = await response.text(), marker = 'const grouped = migrateScene';
      if (!body.includes(marker)) throw new Error('Body QA injection marker missing');
      await route.fulfill({response, body: body.replace(marker, extra + marker)});
    });
    for (const [url, run] of [['furniture-body-drag-qa.html',false],['furniture-drop-qa.html',true],['editor-motion-qa.html',true]]) {
      await page.goto('http://127.0.0.1:5191/'+url);
      if (run) await page.locator('#run').click();
      await page.waitForFunction(()=>/COMPLETE|FAIL/.test(document.querySelector('#result')?.textContent||document.querySelector('#results')?.textContent||''),{timeout:45000});
      outputs[url] = await page.locator('#result,#results').textContent();
      if (outputs[url].includes('FAIL')) throw new Error(outputs[url]);
    }
    fs.writeFileSync(path.join(__dirname, 'shift-results.json'), JSON.stringify({outputs,errors},null,2));
    console.log(JSON.stringify({counts:Object.values(outputs).map(value=>value.split('\n').at(-1)),errors}));
    if(errors.length) throw new Error(errors.join('\n'));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
