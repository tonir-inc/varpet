import * as THREE from 'three';
import type { Operation } from '../contracts';
import { demoScene, localCatalog } from '../core/demo';
import { buildFinishOperations, FINISH_DRAG_TYPE, getFinishPreset, type FinishPreset } from '../core/finish-presets';
import { EditorStore } from '../core/store';
import { createFinishInteraction } from '../render/finish-interaction';
import { renderEntityInspector } from './inspector';

/** Browser checks for native drag events, DOM replacement, and real Three.js surface picking. */
export async function checkInspectorDrag(container: HTMLElement): Promise<string> {
  let count = 0;
  const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label); count++; };
  function syntheticTransfer() {
    const data = new DataTransfer();
    // Observe handler assignments even where native setters ignore synthetic
    // events. The separate trusted-gesture QA proves actual browser effects.
    Object.defineProperties(data, {
      effectAllowed: { value: 'none', writable: true },
      dropEffect: { value: 'none', writable: true },
    });
    return data;
  }
  container.innerHTML = '<div data-stage style="position:relative;width:400px;height:240px"><canvas width="400" height="240" style="display:block;width:400px;height:240px"></canvas></div><div data-inspector></div>';
  const stage = container.querySelector<HTMLElement>('[data-stage]')!;
  const canvas = stage.querySelector('canvas')!;
  const inspector = container.querySelector<HTMLElement>('[data-inspector]')!;
  const store = new EditorStore(demoScene, localCatalog);
  const world = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.2), Array(6).fill(material));
  wall.userData = { finishEntityId: 'wall-bedroom', finishSurfaces: { 4: 'wall-front', 5: 'wall-back' } };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), material);
  floor.rotation.x = -Math.PI / 2;
  floor.userData = { finishEntityId: 'room-kitchen', finishSurface: 'floor' };
  world.add(wall, floor);
  const camera = new THREE.PerspectiveCamera(45, 400 / 240, 0.1, 20);
  let selected = 'wall-spine';
  let starts = 0, ends = 0, errors = 0;
  let brush: string | null = null;
  const execute = (operations: Operation[], label: string) => store.execute({ id: crypto.randomUUID(), source: 'human', baseRevision: store.revision, label, operations }, true).ok;
  const interaction = createFinishInteraction({
    canvas, container: stage, world, camera: () => camera, scene: () => store.scene,
    roots: () => [wall, floor], render: () => {}, error: () => { errors++; },
    apply: (presetId, target) => {
      check(execute(buildFinishOperations(store.scene, getFinishPreset(presetId)!, target.entityId, target.surface), 'Drop finish'), 'A valid drop executes the checked finish command');
    },
  });
  const baseConfig = {
    getScene: () => store.scene, getCatalog: () => localCatalog, execute, notice: () => {},
    refresh: render, advanced: () => {}, getDoorAngle: () => 0, testDoor: () => {},
  };
  const config = {
    ...baseConfig,
    onFinishDragStart: (preset: FinishPreset) => { starts++; brush = preset.id; interaction.setBrush(preset.id); },
    onFinishDragEnd: () => { ends++; brush = null; interaction.setBrush(null); },
  };
  function render() { renderEntityInspector(inspector, selected, config); }
  function aim(surface: 'wall' | 'floor') {
    wall.visible = surface === 'wall'; floor.visible = surface === 'floor';
    camera.position.set(0, surface === 'floor' ? 5 : 0, surface === 'wall' ? -5 : 0);
    camera.up.set(0, surface === 'floor' ? 0 : 1, surface === 'floor' ? -1 : 0);
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); world.updateMatrixWorld(true);
  }
  function swatch(preset: string, surface: string) {
    const button = inspector.querySelector<HTMLButtonElement>(`[data-finish="${preset}"][data-surface="${surface}"]`);
    check(button, `The ${surface} ${preset} swatch exists`);
    return button!;
  }
  function event(type: string, dataTransfer: DataTransfer, outside = false) {
    const rect = canvas.getBoundingClientRect();
    return new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX: outside ? rect.right + 30 : rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
  }
  function begin(button: HTMLButtonElement) {
    const data = syntheticTransfer();
    const revision = store.revision;
    button.dispatchEvent(event('dragstart', data));
    check(data.getData(FINISH_DRAG_TYPE) === button.dataset.finish, 'Drag advertises the finish MIME payload');
    check(data.getData('text/plain') === button.dataset.finish, 'Drag includes a plain text finish ID');
    check(data.effectAllowed === 'copy', 'Dragging a finish allows copying');
    check(brush === button.dataset.finish && canvas.style.cursor === 'crosshair', 'Drag start activates the real surface brush');
    check(store.revision === revision, 'Starting a drag does not edit the document');
    return data;
  }
  const finish = (entity: string, surface: string) => store.scene.project?.finishes.find(item => item.entityId === entity && item.surface === surface);
  const stop = store.subscribe(render);
  try {
    aim('wall'); render();
    check([...inspector.querySelectorAll<HTMLButtonElement>('[data-finish]')].every(button => button.draggable), 'Wall Properties swatches must be draggable');
    const source = swatch('sage', 'wall-front');
    const data = begin(source);
    const over = event('dragover', data);
    canvas.dispatchEvent(over);
    check(over.defaultPrevented, 'A raycast wall target accepts the drag');
    check(data.dropEffect === 'copy', 'An accepted raycast wall target allows copying');
    check(!stage.querySelector<HTMLElement>('.finish-drop-hint')!.hidden, 'Dragging shows the surface preview hint');
    check(stage.querySelector<HTMLElement>('.finish-drop-hint')!.textContent === 'Drop to apply Quiet sage', 'The raycast accepts the specific wall face as a valid drop target');
    canvas.dispatchEvent(event('drop', data));
    check(finish('wall-bedroom', 'wall-back')?.materialId === 'builtin-finish:sage', 'The hit wall side receives the paint, independently of the source swatch side');
    check(!finish('wall-spine', 'wall-front') && !finish('wall-bedroom', 'wall-front'), 'Dropping does not paint the selected source or the other wall side');
    check(store.revision === 1, 'A successful drag creates exactly one document revision');
    check(!source.isConnected, 'The committed drop re-renders and disconnects the original swatch');
    document.dispatchEvent(event('dragend', data));
    check(brush === null && ends === 1 && canvas.style.cursor === '', 'Document dragend clears the brush even after its source was disconnected');
    check(stage.querySelector<HTMLElement>('.finish-drop-hint')!.hidden, 'Drag completion removes the surface preview');
    store.undo();
    check(!finish('wall-bedroom', 'wall-back') && !store.canUndo, 'One undo reverses the entire dropped finish');
    store.redo();
    check(finish('wall-bedroom', 'wall-back')?.materialId === 'builtin-finish:sage', 'Redo restores the dropped finish');

    const cancelSource = swatch('linen', 'wall-front');
    const cancelData = begin(cancelSource);
    const beforeCancel = store.revision;
    canvas.dispatchEvent(event('drop', cancelData, true));
    cancelSource.dispatchEvent(event('dragend', cancelData));
    check(store.revision === beforeCancel && errors === 1, 'Dropping outside the canvas changes no finish');
    check(brush === null && ends === 2, 'An outside or canceled drag clears its brush once');
    const escapeData = begin(cancelSource);
    cancelSource.dispatchEvent(event('dragend', escapeData));
    check(store.revision === beforeCancel && brush === null && ends === 3, 'Canceling without any drop leaves the document unchanged');

    swatch('clay', 'wall-front').click();
    check(finish('wall-spine', 'wall-front')?.materialId === 'builtin-finish:clay', 'An ordinary click still applies to the selected wall side');
    selected = 'room-living'; aim('floor'); render();
    check([...inspector.querySelectorAll<HTMLButtonElement>('[data-finish]')].every(button => button.draggable), 'Floor Properties swatches must be draggable');
    const floorSource = swatch('oak', 'floor');
    const floorData = begin(floorSource);
    canvas.dispatchEvent(event('drop', floorData));
    document.dispatchEvent(event('dragend', floorData));
    check(finish('room-kitchen', 'floor')?.materialId === 'builtin-finish:oak' && !finish('room-living', 'floor'), 'A raycast floor drop changes the target room');
    check(brush === null && starts === ends, 'Every completed or canceled drag releases the brush');

    const replacedSource = swatch('walnut', 'floor');
    const fallbackData = begin(replacedSource);
    canvas.dispatchEvent(event('drop', fallbackData));
    check(!replacedSource.isConnected, 'The fallback test removes the dragging source during the drop');
    await new Promise(resolve => setTimeout(resolve, 10));
    check(finish('room-kitchen', 'floor')?.materialId === 'builtin-finish:walnut', 'Deferred cleanup lets the target consume the drop first');
    check(brush === null && starts === ends && canvas.style.cursor === '', 'Drop cleanup releases the brush when a detached source sends no dragend');

    const escapeSource = swatch('oak', 'floor');
    begin(escapeSource);
    let bubbledEscapes = 0;
    const observeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') bubbledEscapes++; };
    window.addEventListener('keydown', observeEscape);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    window.removeEventListener('keydown', observeEscape);
    check(brush === null && starts === ends, 'Escape cancels the active finish drag');
    check(bubbledEscapes === 0, 'Handled Escape does not reach normal editor keyboard shortcuts');
    begin(escapeSource);
    window.dispatchEvent(new Event('blur'));
    check(brush === null && starts === ends, 'Losing window focus cancels the active finish drag');

    for (const id of ['room-living', 'wall-spine']) {
      selected = id;
      for (const patch of [{ locked: true }, { locked: false, phase: 'remove' as const }]) {
        check(execute([{ type: 'set-metadata', id, patch }], 'Protect surface'), 'Surface metadata accepts the protection state');
        render();
        const buttons = [...inspector.querySelectorAll<HTMLButtonElement>('[data-finish]')];
        check(buttons.length > 0 && buttons.every(button => button.disabled && !button.draggable), 'Locked and removed swatches are disabled and cannot be dragged');
        const before = starts;
        buttons[0]!.dispatchEvent(event('dragstart', new DataTransfer()));
        check(starts === before, 'Disabled swatches cannot activate a drag callback');
      }
      check(execute([{ type: 'set-metadata', id, patch: { locked: false, phase: 'existing' } }], 'Restore surface'), 'Restoring the source enables editing');
    }
    renderEntityInspector(inspector, 'wall-spine', baseConfig);
    check([...inspector.querySelectorAll<HTMLButtonElement>('[data-finish]')].every(button => !button.draggable), 'Inspectors without drag integration keep click-only swatches');
    return `Inspector drag checks passed: ${count} assertions. Copy-effect assignments are checked with writable synthetic properties; native effects use the trusted drag check below.`;
  } finally {
    document.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    stop(); interaction.dispose(); wall.geometry.dispose(); floor.geometry.dispose(); material.dispose();
    container.innerHTML = '';
  }
}

/** A trusted native gesture is required to verify browser-controlled drag effects. */
export function mountNativeInspectorDragQA(container: HTMLElement) {
  container.innerHTML = '<h2>Native drag check</h2><p>Drag any wall paint from Properties onto the target. The target represents a different wall, side B.</p><pre data-native-result role="status">Waiting for a native drag</pre><div style="display:grid;grid-template-columns:380px 400px;gap:24px;align-items:start"><div data-native-inspector></div><div data-native-stage style="position:sticky;top:24px;width:400px;height:240px"><canvas aria-label="Wall side B drop target" width="400" height="240" style="display:block;background:#555063;width:400px;height:240px;border:2px dashed #cbbaf3"></canvas><span style="position:absolute;inset:100px 0 auto;text-align:center;pointer-events:none">Drop paint here — wall side B</span></div></div>';
  const inspector = container.querySelector<HTMLElement>('[data-native-inspector]')!;
  const stage = container.querySelector<HTMLElement>('[data-native-stage]')!;
  const canvas = stage.querySelector('canvas')!;
  const status = container.querySelector<HTMLElement>('[data-native-result]')!;
  const store = new EditorStore(demoScene, localCatalog);
  const world = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.2), Array(6).fill(material));
  mesh.userData = { finishEntityId: 'wall-south', finishSurfaces: { 4: 'wall-front', 5: 'wall-back' } };
  world.add(mesh); world.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(45, 400 / 240, 0.1, 20);
  camera.position.set(0, 0, -5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const write = (message: string) => { status.textContent += `\n${message}`; };
  const execute = (operations: Operation[], label: string) => {
    const result = store.execute({ id: crypto.randomUUID(), source: 'human', baseRevision: store.revision, label, operations }, true);
    write(result.ok ? `${label}; revision=${store.revision}` : `FAIL: ${result.errors.join(' ')}`);
    return result.ok;
  };
  const interaction = createFinishInteraction({
    canvas, container: stage, world, camera: () => camera, scene: () => store.scene, roots: () => [mesh], render: () => {}, error: write,
    apply: (id, target) => execute(buildFinishOperations(store.scene, getFinishPreset(id)!, target.entityId, target.surface), `Applied ${id} to ${target.entityId}/${target.surface}`),
  });
  const config = {
    getScene: () => store.scene, getCatalog: () => localCatalog, execute, notice: write, refresh: render,
    advanced: () => {}, getDoorAngle: () => 0, testDoor: () => {},
    onFinishDragStart: (preset: FinishPreset) => { status.textContent = `Brush ${preset.id}; revision=${store.revision}`; interaction.setBrush(preset.id); },
    onFinishDragEnd: () => { interaction.setBrush(null); write('Brush cleared'); },
  };
  function render() { renderEntityInspector(inspector, 'wall-west', config); }
  inspector.addEventListener('dragstart', event => write(`Native start: trusted=${event.isTrusted}; effectAllowed=${event.dataTransfer?.effectAllowed}; payload=${event.dataTransfer?.getData(FINISH_DRAG_TYPE)}`));
  canvas.addEventListener('drop', event => write(`Native drop: trusted=${event.isTrusted}; dropEffect=${event.dataTransfer?.dropEffect}`));
  const stop = store.subscribe(render); render();
  return () => { stop(); interaction.dispose(); mesh.geometry.dispose(); material.dispose(); container.innerHTML = ''; };
}
