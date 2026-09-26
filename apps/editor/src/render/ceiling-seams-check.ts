import * as THREE from 'three';
import m6 from '../../../../apartments/m6-12-54/scene.json';
import type { SceneDocument, Vec2 } from '../contracts';
import { emptyProject } from '../core/renovation';
import { disposeObject } from './assets';
import { makeStructure } from './structure';
import { SunOccluders } from './sun-occluders';

let assertions = 0;
const failures: string[] = [];
function assert(value: unknown, message: string): void { assertions++; if (!value) failures.push(message); }
const near = (a: number, b: number) => Math.abs(a - b) < 1e-5;
// The structure's room labels need a canvas factory, but these checks use no GPU.
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => null }),
} });

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); });
  return result;
}
function source(): SceneDocument {
  return {
    format: 'varpet.editor', version: 2, id: 'ceiling-seams', name: 'Ceiling seams', units: 'm', upAxis: 'Y', objects: [],
    rooms: [{ id: 'room', name: 'Room', color: '#fff', polygon: [[10, 20], [14, 20], [14, 24], [10, 24]] }],
    // The finished inner face is x=9.97, three centimetres beyond the room edge.
    walls: [{ id: 'wall', start: [9.87, 20.5], end: [9.87, 23.5], height: 3, thickness: .2, color: '#ddd', openings: [] }],
    project: { ...emptyProject(), metadata: { room: { elevation: .6, ceilingHeight: 3 }, wall: { elevation: .6 } } },
  };
}
function withProjection(scene: SceneDocument, label: string, check: (probe: (x: number, z: number, y: number, covered: boolean, name: string) => void, ceilings: THREE.Group) => void): void {
  const original = JSON.stringify(scene), shell = makeStructure(scene), shadows = new SunOccluders();
  shadows.setScene(scene);
  shell.ceilings.updateWorldMatrix(true, true); shadows.group.updateWorldMatrix(true, true);
  const probe = (x: number, z: number, y: number, covered: boolean, name: string): void => {
    const below = new THREE.Raycaster(new THREE.Vector3(x, y - .15, z), new THREE.Vector3(0, 1, 0), 0, .3);
    const above = new THREE.Raycaster(new THREE.Vector3(x, y + .15, z), new THREE.Vector3(0, -1, 0), 0, .3);
    const underside = below.intersectObject(shell.ceilings, true).filter(hit => near(hit.point.y, y));
    const roof: THREE.Intersection[] = [];
    // Shadow-only meshes intentionally opt out of editor picking. Exercise
    // their actual triangles instead, using the same raycast as a normal mesh.
    for (const mesh of meshes(shadows.group)) THREE.Mesh.prototype.raycast.call(mesh, above, roof);
    const overhead = roof.filter(hit => near(hit.point.y, y));
    assert((underside.length > 0) === covered, `${label}: ${name} ${covered ? 'closes' : 'preserves'} the visible ceiling footprint`);
    assert((overhead.length > 0) === covered, `${label}: ${name} ${covered ? 'blocks' : 'admits'} overhead light through the same footprint`);
    assert(above.intersectObject(shell.ceilings, true).length === 0, `${label}: ${name} preserves the ceiling's exterior back-face cutaway`);
  };
  try {
    check(probe, shell.ceilings);
    assert(JSON.stringify(scene) === original, `${label}: projection leaves the authored scene unchanged`);
  } finally {
    disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions); shadows.dispose();
  }
}

withProjection(m6 as unknown as SceneDocument, 'M6 reported corner', probe => {
  probe(-2.355, 1.5, 2.8, true, '10.3 mm divider slit');
  probe(-2.263, 3.35, 2.8, true, '30.9 mm widened-pier gap');
  probe(-2.355, .58, 2.8, true, 'entry-end return');
  probe(-1, 1, 2.8, true, 'original Bedroom 2 interior');
  probe(5, -1, 2.8, false, 'open living-room balcony');
});

for (const reverseRoom of [false, true]) for (const reverseWall of [false, true]) {
  const scene = source();
  if (reverseRoom) scene.rooms[0]!.polygon.reverse();
  if (reverseWall) [scene.walls[0]!.start, scene.walls[0]!.end] = [scene.walls[0]!.end, scene.walls[0]!.start];
  const label = `Room ${reverseRoom ? 'CW' : 'CCW'}, wall ${reverseWall ? 'reversed' : 'forward'}`;
  withProjection(scene, label, (probe, ceilings) => {
    probe(9.985, 22, 3.6, true, 'three-centimetre gap');
    probe(11, 22, 3.6, true, 'translated and elevated original room');
    probe(9.985, 20.2, 3.6, false, 'free edge before the wall');
    probe(9.985, 23.8, 3.6, false, 'free edge after the wall');
    probe(12, 19.98, 3.6, false, 'unrelated free room edge');
    const ray = new THREE.Raycaster(new THREE.Vector3(9.955, 3.4, 22), new THREE.Vector3(0, 1, 0), 0, .3);
    assert(ray.intersectObject(ceilings, true).length > 0, `${label}: ceiling overlaps fifteen millimetres into its supporting wall`);
    for (const mesh of meshes(ceilings)) {
      const normals = mesh.geometry.getAttribute('normal'), normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      for (let i = 0; i < normals.count; i++) {
        const normal = new THREE.Vector3().fromBufferAttribute(normals, i).applyNormalMatrix(normalMatrix);
        assert(near(normal.x, 0) && near(normal.y, -1) && near(normal.z, 0), `${label}: shading normal ${i} faces into the room`);
      }
    }
  });
}

const thin = source();
thin.walls[0]!.thickness = .01; thin.walls[0]!.start[0] = thin.walls[0]!.end[0] = 9.965;
withProjection(thin, 'Thin wall', probe => {
  probe(9.985, 22, 3.6, true, 'gap next to a ten-millimetre wall');
  probe(9.955, 22, 3.6, false, 'space beyond the exterior face');
});

for (const scenario of ['low', 'removed', 'above-room', 'too-far'] as const) {
  const scene = source();
  if (scenario === 'low') scene.walls[0]!.height = 2.7;
  if (scenario === 'removed') scene.project!.metadata.wall!.phase = 'remove';
  if (scenario === 'above-room') scene.project!.metadata.wall!.elevation = 3.7;
  if (scenario === 'too-far') scene.walls[0]!.start[0] = scene.walls[0]!.end[0] = 9.78;
  withProjection(scene, scenario, probe => {
    probe(9.985, 22, 3.6, false, 'unsupported edge');
    probe(11, 22, 3.6, true, 'unchanged interior');
  });
}

const concave = source();
concave.rooms[0]!.polygon = [[10, 20], [14, 20], [14, 22], [12, 22], [12, 24], [10, 24]] satisfies Vec2[];
withProjection(concave, 'Concave room', probe => {
  probe(9.985, 22, 3.6, true, 'supported outer edge');
  probe(11, 23, 3.6, true, 'narrow original leg');
  probe(13, 23, 3.6, false, 'open concave notch');
});

if (failures.length) throw new Error(`${failures.length}/${assertions} ceiling seam checks failed:\n${failures.join('\n')}`);
console.log(`Ceiling seam checks passed (${assertions} assertions).`);
