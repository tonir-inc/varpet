import * as THREE from 'three';
import type { Opening, SceneDocument } from '../contracts';
import { createViewport } from './viewport';
import { OpeningAssetLoader } from './opening-assets';
import { disposeObject } from './assets';

const wall = { id: 'wall', start: [-3, 0] as [number, number], end: [3, 0] as [number, number], height: 2.7, thickness: .2, color: '#eee9e0', openings: [
  { id: 'door', kind: 'door', offset: .7, width: .9, height: 2.1, sill: 0 },
  { id: 'window', kind: 'window', offset: 3.2, width: 1.5, height: 1.45, sill: .85 },
] satisfies Opening[] };
const scene: SceneDocument = { format: 'varpet.editor', version: 1, id: 'catalog-opening-qa', name: 'Catalog openings', units: 'm', upAxis: 'Y', walls: [wall], objects: [], rooms: [{ id: 'room', name: 'Room', color: '#c4b59d', polygon: [[-3, 0], [3, 0], [3, 3], [-3, 3]] }] };
const original = JSON.stringify(scene);
const status = document.querySelector<HTMLOutputElement>('#status')!, angles = document.querySelector<HTMLOutputElement>('#angles')!;
const viewport = createViewport(document.querySelector<HTMLElement>('#view')!, {
  onSelect(id) { viewport.setSelection(id); readout(); }, onTransform() {}, onInteraction() {},
  onError(message) { status.textContent = `FAIL: ${message}`; },
  onOpeningTransform() { status.textContent = 'Move/resize callback received; isolated scene unchanged.'; },
});
function readout() { angles.textContent = `Door: ${Math.round(viewport.getDoorAngle('door') * 180 / Math.PI)}°\nWindow: ${Math.round(viewport.getDoorAngle('window') * 180 / Math.PI)}°\nSource unchanged: ${JSON.stringify(scene) === original}`; }
viewport.setScene(scene, []); viewport.setWalls('full'); viewport.focus(); readout();
for (const id of ['door', 'window']) document.getElementById(id)!.onclick = () => { viewport.focus(id); };
document.getElementById('all')!.onclick = () => viewport.focus();
document.getElementById('reset')!.onclick = () => { viewport.setDoorAngle('door', 0); viewport.setDoorAngle('window', 0); viewport.setSelection(null); readout(); };
viewport.onFrame(readout);
const loader = new OpeningAssetLoader();
try {
  let checked = 0;
  for (const [opening, metadata] of [
    [wall.openings[0]!, {}], [wall.openings[0]!, { role: 'entrance', hinge: 'right', swing: -1 }],
    [wall.openings[0]!, { mechanism: 'double' }], [wall.openings[1]!, {}],
    [wall.openings[1]!, { mechanism: 'tilt' }], [wall.openings[1]!, { mechanism: 'sliding' }],
    [wall.openings[1]!, { mechanism: 'fixed' }],
    [{ ...wall.openings[1]!, width: 1, height: .8 }, { mechanism: 'tilt' }],
  ] as const) {
    const asset = await loader.load(wall, opening, metadata);
    if (!asset) throw new Error('Missing catalog model');
    asset.group.updateMatrixWorld(true);
    const closed = asset.leaves.map(leaf => leaf.matrixWorld.clone());
    const fixed: { mesh: THREE.Mesh; pose: THREE.Matrix4 }[] = [];
    asset.group.traverse(object => { if (object instanceof THREE.Mesh && !asset.leaves.includes(object)) fixed.push({ mesh: object, pose: object.matrixWorld.clone() }); });
    asset.setAngle(Math.PI / 2);
    if (metadata.mechanism !== 'fixed' && (!asset.leaves.length || !asset.leaves.some((leaf, i) => !leaf.matrixWorld.equals(closed[i]!)))) throw new Error(`${asset.group.name}: leaf did not articulate`);
    const bounds = new THREE.Box3().setFromObject(asset.group);
    if (![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) throw new Error('Invalid animated bounds');
    if (fixed.some(({ mesh, pose }) => !mesh.matrixWorld.equals(pose))) throw new Error(`${asset.group.name}: fixed frame moved with its leaf`);
    asset.setAngle(0);
    if (asset.leaves.some((leaf, i) => leaf.matrixWorld.elements.some((value, n) => Math.abs(value - closed[i]!.elements[n]!) > 1e-7))) throw new Error(`${asset.group.name}: close failed to restore leaf pose`);
    disposeObject(asset.group); checked++;
  }
  status.textContent = `PASS: ${checked} catalog variants load; moving leaves open and return to their exact closed pose.`;
} catch (error) { status.textContent = `FAIL: ${String(error)}`; }
finally { loader.dispose(); }
window.addEventListener('pagehide', () => viewport.dispose());
