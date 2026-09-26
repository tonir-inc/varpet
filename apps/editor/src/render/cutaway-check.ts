import * as THREE from 'three';
import type { SceneDocument, Vec2 } from '../contracts';
import { disposeObject } from './assets';
import { makeStructure, type StructureProjection } from './structure';

let assertions = 0;
function assert(value: unknown, message: string): void {
  assertions++;
  if (!value) throw new Error(`Cutaway: ${message}`);
}
// Labels require a canvas; projection visibility does not require WebGL.
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => null }),
} });

function rectangle(scale = 1, offset: Vec2 = [0, 0], reversed = false): SceneDocument {
  const point = (x: number, z: number): Vec2 => [x * scale + offset[0], z * scale + offset[1]];
  const corners = [point(-4, -3), point(4, -3), point(4, 3), point(-4, 3)];
  const edges = [['south', 0, 1], ['east', 1, 2], ['north', 2, 3], ['west', 3, 0]] as const;
  return {
    format: 'varpet.editor', version: 1, id: 'cutaway-check', name: 'Cutaway check', units: 'm', upAxis: 'Y', objects: [],
    rooms: [{ id: 'room', name: 'Room', color: '#eeeeee', polygon: corners }],
    walls: edges.map(([id, a, b]) => ({
      id, start: corners[reversed ? b : a]!, end: corners[reversed ? a : b]!,
      height: 2.7 * scale, thickness: 0.2 * scale, color: '#eeeeee',
      openings: [{ id: `${id}-window`, kind: 'window', offset: scale, width: scale, height: scale, sill: scale }],
    })),
  };
}

function cameraAt(angle: number, offset: Vec2 = [0, 0], scale = 1): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera();
  const radians = angle * Math.PI / 180;
  camera.position.set(offset[0] - 12 * scale * Math.cos(radians), 8 * scale, offset[1] - 12 * scale * Math.sin(radians));
  return camera;
}

function projections(shell: StructureProjection, id: string): THREE.Object3D[] {
  return shell.entities.get(id)!.children;
}

function expectWall(shell: StructureProjection, id: string, state: 'full' | 'low' | 'hidden', label: string, openingsVisible = state === 'full'): void {
  const [full, low, openings] = projections(shell, id);
  assert(full!.visible === (state === 'full'), `${label}: ${id} full wall should be ${state === 'full' ? 'visible' : 'hidden'}`);
  assert(low!.visible === (state === 'low'), `${label}: ${id} low wall should be ${state === 'low' ? 'visible' : 'hidden'}`);
  assert(openings!.visible === openingsVisible, `${label}: ${id} opening visibility should follow its wall or selection`);
}

function withShell(source: SceneDocument, run: (shell: StructureProjection) => void): void {
  const saved = JSON.stringify(source);
  const shell = makeStructure(source);
  try {
    run(shell);
    assert(JSON.stringify(source) === saved, 'camera and display changes leave scene data unchanged');
  } finally {
    disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);
  }
}

// Head-on and shallow views should preserve side walls. At a diagonal, both
// near walls obstruct the room and should be lowered.
for (const variant of [
  { label: 'original', scale: 1, offset: [0, 0] as Vec2, reversed: false },
  { label: 'translated', scale: 1, offset: [17, -11] as Vec2, reversed: false },
  { label: 'reversed endpoints', scale: 1, offset: [0, 0] as Vec2, reversed: true },
  { label: 'half scale', scale: 0.5, offset: [0, 0] as Vec2, reversed: false },
  { label: 'triple scale and translated', scale: 3, offset: [-13, 9] as Vec2, reversed: true },
]) {
  for (const angle of [0, -6, 6, -45, 45]) {
    withShell(rectangle(variant.scale, variant.offset, variant.reversed), shell => {
      shell.updateWalls(cameraAt(angle, variant.offset, variant.scale), 'cutaway', false, 0);
      const label = `${variant.label}, ${angle} degree view`;
      expectWall(shell, 'west', 'low', label);
      expectWall(shell, 'east', 'full', label);
      expectWall(shell, 'south', angle === 45 ? 'low' : 'full', label);
      expectWall(shell, 'north', angle === -45 ? 'low' : 'full', label);
    });
  }
}

withShell(rectangle(), shell => {
  const camera = cameraAt(0);
  shell.updateWalls(camera, 'full', false, 0, true);
  for (const id of ['west', 'east', 'south', 'north']) expectWall(shell, id, 'full', 'Full mode');
  shell.updateWalls(camera, 'hidden', false, 100, true);
  for (const id of ['west', 'east', 'south', 'north']) expectWall(shell, id, 'hidden', 'Hidden mode');
  shell.updateWalls(camera, 'cutaway', true, 200, true);
  for (const id of ['west', 'east', 'south', 'north']) expectWall(shell, id, 'low', 'Top cutaway', true);
  shell.updateWalls(camera, 'full', true, 300, true);
  for (const id of ['west', 'east', 'south', 'north']) expectWall(shell, id, 'full', 'Top Full mode');
  shell.updateWalls(camera, 'hidden', true, 400, true);
  for (const id of ['west', 'east', 'south', 'north']) expectWall(shell, id, 'hidden', 'Top Hidden mode');
  shell.updateWalls(camera, 'cutaway', false, 500, true, 'west-window');
  expectWall(shell, 'west', 'low', 'Selected opening remains visible', true);
  expectWall(shell, 'south', 'full', 'Side wall remains visible while selecting an opening');
  shell.updateWalls(camera, 'cutaway', false, 600, true);
  expectWall(shell, 'west', 'low', 'Deselected opening follows its cut wall');
});

// Crossing the angular boundary should have a dead band in both directions.
// These camera directions keep the midpoint test safely on its near side.
withShell(rectangle(), shell => {
  let now = 0;
  for (const [normalDot, state] of [[0.2, 'full'], [0.28, 'full'], [0.32, 'low'], [0.26, 'low'], [0.2, 'full']] as const) {
    const angle = Math.asin(normalDot) * 180 / Math.PI;
    shell.updateWalls(cameraAt(angle), 'cutaway', false, now, true);
    expectWall(shell, 'south', state, `Orbit normal alignment ${normalDot}`);
    now += 100;
  }
});

withShell(rectangle(), shell => {
  shell.updateWalls(cameraAt(0), 'cutaway', false, 0);
  const [full, low] = projections(shell, 'south');
  const mesh = full!.children[0] as THREE.Mesh;
  const material = (mesh.material as THREE.Material[])[0]!;
  assert(shell.updateWalls(cameraAt(45), 'cutaway', false, 100), 'orbit into an obstructing angle requests animation frames');
  assert(shell.updateWalls(cameraAt(45), 'cutaway', false, 200), 'angular transition keeps animating between states');
  assert(full!.visible && low!.visible && material.opacity > 0 && material.opacity < 1, 'angular cutaway fades between the actual full and low projections');
  const interrupted = material.opacity;
  shell.updateWalls(cameraAt(0), 'cutaway', false, 200);
  assert(Math.abs(material.opacity - interrupted) < 1e-7, 'reversing the orbit preserves the displayed opacity');
  assert(!shell.updateWalls(cameraAt(0), 'cutaway', false, 600), 'returning to a side view settles the transition');
  expectWall(shell, 'south', 'full', 'Settled orbit reversal');
  assert(material.opacity === 1 && !material.transparent && material.depthWrite, 'settled side wall restores opaque material state');
});

console.log(`Cutaway checks passed (${assertions} assertions).`);
