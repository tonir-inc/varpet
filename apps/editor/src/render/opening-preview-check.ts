import * as THREE from 'three';
import type { Opening, SceneDocument } from '../contracts';
import { emptyProject } from '../core/renovation';
import { disposeObject } from './assets';
import { makeStructure } from './structure';
import { SunOccluders } from './sun-occluders';

let assertions = 0;
function assert(value: unknown, message: string): asserts value { assertions++; if (!value) throw new Error(message); }
const near = (a: number, b: number) => Math.abs(a - b) < 1e-7;
// Geometry checks use real Three.js meshes; labels do not need rasterized text.
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => null }),
} });
const source: SceneDocument = {
  format: 'varpet.editor', version: 2, id: 'opening-preview', name: 'Opening preview', units: 'm', upAxis: 'Y', objects: [],
  rooms: [{ id: 'room', name: 'Room', color: '#eeeeee', polygon: [[0, 0], [10, 0], [10, 8], [0, 8]] }],
  walls: [
    { id: 'wall', start: [0, 0], end: [10, 0], height: 3.2, thickness: 0.2, color: '#eeeeee', openings: [
      { id: 'window', kind: 'window', offset: 1, width: 2, height: 1.4, sill: 0.8 },
      { id: 'door', kind: 'door', offset: 6, width: 1.2, height: 2.1, sill: 0 },
    ] },
    { id: 'other-wall', start: [0, 8], end: [10, 8], height: 3.2, thickness: 0.2, color: '#eeeeee', openings: [
      { id: 'other-window', kind: 'window', offset: 2, width: 1.6, height: 1.4, sill: 0.8 },
    ] },
  ], project: emptyProject(),
};
source.project!.metadata = {
  room: { elevation: 0.25, ceilingHeight: 3.2 }, wall: { elevation: 0.25 },
  window: { mechanism: 'casement', hinge: 'right', swing: -1, frameWidth: 0.06, leafThickness: 0.045 },
  door: { mechanism: 'hinged' },
};
const saved = JSON.stringify(source);
const shell = makeStructure(source), rig = new SunOccluders(); rig.setScene(source);
const camera = new THREE.PerspectiveCamera(); camera.position.set(4, 4, -8);
shell.updateWalls(camera, 'full', false, 0, true);
const wall = shell.entities.get('wall')!, [full, low, installed] = wall.children;
const selected = shell.openings.get('window')!, selectedGroup = selected.group;
const otherWall = shell.entities.get('other-wall')!, otherWindow = shell.openings.get('other-window')!;
const door = shell.openings.get('door')!;
selected.setAngle(0.6); selected.target = 0.9; selected.setCollision(true); selected.group.userData.envelope.visible = true;
door.setAngle(Math.PI / 2); door.target = Math.PI / 2;
rig.setDoorAngle('window', 0.6); rig.setDoorAngle('door', Math.PI / 2);

function blocked(group: THREE.Object3D, x: number, y: number, shadow = false): boolean {
  group.updateWorldMatrix(true, true);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, y, -1), new THREE.Vector3(0, 0, 1), 0, 2);
  const hits: THREE.Intersection[] = [];
  group.traverse(object => { if (object instanceof THREE.Mesh && (!shadow || object.castShadow)) THREE.Mesh.prototype.raycast.call(object, ray, hits); });
  return hits.length > 0;
}
function both(x: number, y: number, expected: boolean, message: string) {
  assert(blocked(full!, x, y) === expected, `${message} (visible host wall)`);
  assert(blocked(rig.group, x, y, true) === expected, `${message} (sun occluder)`);
}
function preview(dimensions: Partial<Pick<Opening, 'offset' | 'sill' | 'width' | 'height'>>) {
  shell.previewOpening('window', dimensions); rig.previewOpening('window', dimensions);
}
function watchDisposal(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite)) return;
    if (!(object instanceof THREE.Sprite)) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  let disposedGeometry = 0, disposedMaterial = 0, disposedTexture = 0;
  for (const geometry of geometries) geometry.addEventListener('dispose', () => disposedGeometry++);
  for (const material of materials) material.addEventListener('dispose', () => disposedMaterial++);
  for (const texture of textures) texture.addEventListener('dispose', () => disposedTexture++);
  return () => disposedGeometry === geometries.size && disposedMaterial === materials.size && disposedTexture === textures.size;
}

both(1.2, 1.5, false, 'The original aperture is open');
both(4, 1.5, true, 'The original wall blocks the future wider aperture');
both(2.2, 0.75, true, 'The original sill blocks the future lower aperture');
const disposed = watchDisposal(selectedGroup);
preview({ offset: 1.5, width: 3, height: 1.7, sill: 0.3 });
assert(disposed(), 'Resizing frees every replaced opening geometry, material and label texture exactly once');
assert(shell.openings.get('window') === selected && shell.entities.get('window') === selectedGroup, 'Resizing preserves selection and opening projection identities');
assert(near(selectedGroup.position.x, 1.5) && near(selectedGroup.position.y, 0.55), 'Frame position follows offset and sill plus host elevation');
assert(near(selected.angle, 0.6) && near(selected.target, 0.9), 'Resizing preserves both current and target opening angles');
assert(selectedGroup.userData.envelope.visible && selectedGroup.userData.openingCollision, 'Swing envelope and collision feedback survive geometry replacement');
const leftFrame = selectedGroup.children[0] as THREE.Mesh<THREE.BoxGeometry>;
assert(near(leftFrame.geometry.parameters.width, 0.06) && near(leftFrame.geometry.parameters.height, 1.7), 'Resizing retains the recorded frame thickness');
assert(near((selected.leaves[0]!.geometry as THREE.BoxGeometry).parameters.depth, 0.045), 'Resizing retains the recorded leaf thickness');
assert(near(selected.leaves[0]!.parent!.rotation.y, -0.6), 'Resizing retains the recorded hinge and swing orientation');
assert(shell.entities.get('other-wall') === otherWall && shell.openings.get('other-window') === otherWindow, 'Another wall and its installed window are not rebuilt');
assert(shell.openings.get('door') === door && near(door.angle, Math.PI / 2), 'Another opening on the resized host retains its live angle');
both(1.2, 1.5, true, 'The moved left edge closes the old aperture');
both(4, 1.5, false, 'Width growth opens the newly exposed wall');
both(2.2, 0.75, false, 'Lower sill opens the newly exposed lower wall');
both(2.2, 2.35, true, 'The new head closes the former upper aperture');
assert(!blocked(rig.group, 6.6, 1.25, true), 'Rebuilt shadow wall retains another opened door');
preview({ height: 2.2 });
both(2.2, 2.55, false, 'Height-only preview extends the current aperture');
assert(near(selectedGroup.position.x, 1.5) && near(selectedGroup.position.y, 0.55), 'Partial height preview keeps earlier offset and sill');
preview({ sill: 0.5 });
both(2.2, 0.65, true, 'Raising the sill fills in the old bottom');
both(2.2, 2.85, false, 'Raising the sill moves the current height upward');

const frameBeforeMove = selectedGroup.children[0];
shell.previewOpeningOffset('window', 1.75); rig.previewOpeningOffset('window', 1.75);
assert(selectedGroup.children[0] === frameBeforeMove, 'Offset-only preview reuses installed geometry');
assert(near(selectedGroup.position.x, 1.75) && near(selectedGroup.position.y, 0.75), 'Legacy offset preview preserves the current sill');
both(1.65, 1.25, true, 'Legacy offset preview updates the resized aperture');
const unchangedFrame = selectedGroup.children[0], unchangedWall = full!.children[0], unchangedShadow = rig.group.children.at(-1);
preview({ offset: 1.75, sill: 0.5, width: 3, height: 2.2 });
preview({ width: Number.NaN }); preview({ height: 0 }); preview({ sill: -1 });
assert(selectedGroup.children[0] === unchangedFrame && full!.children[0] === unchangedWall && rig.group.children.at(-1) === unchangedShadow, 'Unchanged or invalid numeric previews allocate no replacement geometry');

shell.updateWalls(camera, 'hidden', false, 100);
shell.updateWalls(camera, 'hidden', false, 200);
const fade = (selected.leaves[0]!.material as THREE.Material).opacity;
preview({ width: 2.8 });
assert(near((selected.leaves[0]!.material as THREE.Material).opacity, fade), 'Resizing during a fade preserves current glass opacity');
const wallMaterial = (full!.children[0] as THREE.Mesh).material as THREE.Material[];
assert(near(wallMaterial[0]!.opacity, fade / 0.45), 'Rebuilt wall holes inherit current wall opacity');
shell.updateWalls(camera, 'hidden', false, 400, true);
preview({ width: 2.6 });
assert(!full!.visible && !low!.visible && !installed!.visible, 'Hidden walls stay hidden while an opening resizes');
shell.updateWalls(camera, 'cutaway', true, 500, true, 'window');
preview({ height: 2 });
assert(!full!.visible && low!.visible && installed!.visible, 'Top cutaway and selected frames retain their visibility during resize');
shell.updateWalls(camera, 'full', false, 600, true);
preview(source.walls[0]!.openings[0]!);
both(1.2, 1.5, false, 'Restoring checked dimensions reopens the original aperture');
both(4, 1.5, true, 'Restoring checked dimensions closes preview-only geometry');
assert(near(selectedGroup.position.y, 1.05) && near((selected.leaves[0]!.material as THREE.Material).opacity, 0.45), 'Cancel restoration keeps elevation and glass transparency');
preview({ width: 3 }); rig.setScene(source);
assert(blocked(rig.group, 3.5, 1.5, true), 'A new scene projection clears outstanding shadow dimension previews');
assert(JSON.stringify(source) === saved, 'All previews leave source geometry and metadata byte-for-byte unchanged');
const disposedFinal = watchDisposal(shell.group);
disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions); rig.dispose();
assert(disposedFinal(), 'Final visible projection releases all retained resources exactly once');
console.log(`Opening preview checks passed (${assertions} assertions).`);
