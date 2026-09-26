import * as THREE from 'three';
import type { SceneDocument, Vec2 } from '../contracts';
import apartment from '../../../../apartments/m6-12-54/scene.json';
import { makeStructure, type StructureProjection } from './structure';
import { disposeObject } from './assets';
import { parseScene } from '../core/persistence';
import { emptyProject } from '../core/renovation';

let assertions = 0;
function assert(value: unknown, message: string): void {
  assertions++;
  if (!value) throw new Error(`Balcony cutaway: ${message}`);
}
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => null }),
} });
function wallState(shell: StructureProjection, id: string, cut: boolean, openingsVisible = !cut): void {
  const [full, low, openings] = shell.entities.get(id)!.children;
  assert(full!.visible === !cut && low!.visible === cut, `${id} should be ${cut ? 'cut away' : 'full height'}`);
  assert(openings!.visible === openingsVisible, `${id} doors and windows should follow the facade`);
}

// Use the unchanged apartment from the reported screenshot, including the
// thresholds that extend interior floor polygons through its balcony doors.
for (const reverse of [false, true]) {
  const scene = parseScene(JSON.stringify(apartment), []);
  if (reverse) for (const wall of scene.walls) {
    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    [wall.start, wall.end] = [wall.end, wall.start];
    for (const opening of wall.openings) opening.offset = length - opening.offset - opening.width;
  }
  const saved = JSON.stringify(scene);
  const shell = makeStructure(scene);
  const camera = new THREE.PerspectiveCamera();
  for (const [position, facades] of [
    [[14, 12, 18], ['wall-bedroom-large-balcony', 'wall-bedroom-small-glazing', 'wall-living-balcony-glazing']],
    [[0, 12, 18], ['wall-bedroom-small-glazing']],
    [[18, 12, 0], ['wall-bedroom-large-balcony', 'wall-living-balcony-glazing']],
  ] as const) {
    camera.position.set(position[0], position[1], position[2]);
    shell.updateWalls(camera, 'cutaway', false, 0, true);
    for (const id of facades) wallState(shell, id, true);
    for (const wall of scene.walls.filter(wall => ['interior', 'shared'].includes(scene.project!.metadata[wall.id]?.boundary ?? ''))) wallState(shell, wall.id, false);
    shell.updateWalls(camera, 'full', false, 0, true);
    for (const id of facades) wallState(shell, id, false);
  }
  camera.position.set(14, 12, 18);
  shell.updateWalls(camera, 'cutaway', false, 0, true, 'door-balcony-small');
  wallState(shell, 'wall-bedroom-small-glazing', true, true);
  shell.updateWalls(camera, 'cutaway', false, 0, true);
  wallState(shell, 'wall-bedroom-small-glazing', true);
  shell.updateWalls(camera, 'cutaway', true, 0, true);
  for (const id of ['wall-bedroom-large-balcony', 'wall-bedroom-small-glazing', 'wall-living-balcony-glazing']) wallState(shell, id, true, true);
  camera.position.set(-1, 1.6, 1);
  shell.updateWalls(camera, 'cutaway', false, 0, true);
  for (const wall of scene.walls) wallState(shell, wall.id, false);
  assert(JSON.stringify(scene) === saved, 'visibility leaves the apartment data unchanged');
  disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);
}

// Balcony, terrace and covered loggia floors do not turn the enclosing facade
// into an internal partition. A genuine adjoining room still does.
for (const zone of ['balcony', 'terrace', 'loggia', 'interior'] as const) {
  const polygon: Vec2[] = [[-3, -3], [0, -3], [0, -0.5], [0.3, -0.5], [0.3, 0.5], [0, 0.5], [0, 3], [-3, 3]];
  const scene: SceneDocument = {
    format: 'varpet.editor', version: 2, id: 'balcony', name: 'Balcony', units: 'm', upAxis: 'Y', objects: [],
    rooms: [
      { id: 'indoor', name: 'Room', color: '#eeeeee', polygon },
      { id: 'outdoor', name: 'Adjacent floor', color: '#eeeeee', polygon: [[0, -3], [2, -3], [2, 3], [0, 3]] },
    ],
    walls: [{ id: 'facade', start: [0, -3], end: [0, 3], height: 2.8, thickness: 0.2, color: '#eeeeee',
      openings: [{ id: 'door', kind: 'door', offset: 2.5, width: 1, height: 2.1, sill: 0 }] }],
    project: { ...emptyProject(), metadata: { outdoor: { zone } } },
  };
  const shell = makeStructure(scene), camera = new THREE.PerspectiveCamera();
  camera.position.set(8, 6, 0);
  shell.updateWalls(camera, 'cutaway', false, 0, true);
  wallState(shell, 'facade', zone !== 'interior');
  camera.position.set(1, 1.6, 0);
  shell.updateWalls(camera, 'cutaway', false, 0, true);
  wallState(shell, 'facade', zone !== 'interior');
  disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);
}

// An outdoor-only perimeter must still cut away, including a glazed loggia.
// Full-width doors use the unambiguous adjacent floor when no solid pier exists.
for (const zone of ['balcony', 'terrace', 'loggia', 'interior'] as const) {
  for (const kind of ['door', 'window'] as const) {
    const scene: SceneDocument = {
      format: 'varpet.editor', version: 2, id: 'perimeter', name: 'Perimeter', units: 'm', upAxis: 'Y', objects: [],
      rooms: [{ id: 'floor', name: 'Floor', color: '#eeeeee', polygon: [[-3, -3], [0, -3], [0, 3], [-3, 3]] }],
      walls: [{ id: 'facade', start: [0, -3], end: [0, 3], height: 2.8, thickness: 0.2, color: '#eeeeee',
        openings: [{ id: 'opening', kind, offset: 0, width: 6, height: 2.1, sill: 0 }] }],
      project: { ...emptyProject(), metadata: { floor: { zone } } },
    };
    const shell = makeStructure(scene), camera = new THREE.PerspectiveCamera();
    camera.position.set(8, 6, 0);
    shell.updateWalls(camera, 'cutaway', false, 0, true);
    wallState(shell, 'facade', true);
    shell.updateWalls(camera, 'cutaway', true, 0, true);
    wallState(shell, 'facade', true, true);
    shell.updateWalls(camera, 'full', false, 0, true);
    wallState(shell, 'facade', false);
    disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);
  }
}
console.log(`Balcony cutaway checks passed (${assertions} assertions).`);
