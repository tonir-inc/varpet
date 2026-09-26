import * as THREE from 'three';
import { makeStructure } from './structure';
import { disposeObject } from './assets';
import { InteriorDaylight, windowPortals } from './interior-daylight';
import type { SceneDocument } from '../contracts';

let assertions = 0;
function assert(value: unknown, message: string): void { assertions++; if (!value) throw new Error(`Interior lighting: ${message}`); }
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) } });
const source: SceneDocument = {
  format: 'varpet.editor', version: 1, id: 'daylight-check', name: 'Daylight check', units: 'm', upAxis: 'Y', objects: [],
  rooms: [{ id: 'room', name: 'Room', color: '#eeeeee', polygon: [[10, 20], [14, 20], [14, 24], [10, 24]] }],
  walls: [{ id: 'wall', start: [10, 20], end: [14, 20], height: 2.7, thickness: 0.2, color: '#ffffff', openings: [
    { id: 'window', kind: 'window', offset: 1, width: 2, height: 1.4, sill: 0.9 },
  ] }],
};
const original = JSON.stringify(source);
const shell = makeStructure(source);
const glass = shell.openings.get('window')!.leaves[0]!;
assert(!glass.castShadow, 'transparent window panes must not block daylight with opaque shadow silhouettes');
assert((glass.material as THREE.Material).transparent && !(glass.material as THREE.Material).depthWrite, 'glass retains transparent depth semantics');
const camera = new THREE.PerspectiveCamera(); camera.position.set(12, 2, 22);
shell.updateWalls(camera, 'full', false, 0, true);
shell.updateWalls(camera, 'hidden', false, 10);
shell.updateWalls(camera, 'hidden', false, 400);
shell.updateWalls(camera, 'full', false, 410);
shell.updateWalls(camera, 'full', false, 800);
assert(!glass.castShadow && glass.visible, 'cutaway restoration must not turn glass back into a shadow blocker');
assert(JSON.stringify(source) === original, 'lighting presentation leaves the scene document unchanged');
disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);
const portals = windowPortals(source);
assert(portals.length === 1, 'an exterior window creates one daylight portal');
assert(portals[0]!.inward[1] === 1 && portals[0]!.position[0] === 12 && Math.abs(portals[0]!.position[1] - 1.88) < 1e-7, 'off-origin portal follows opening position and inward room side');
const reverse = structuredClone(source); reverse.walls[0]!.start = [14, 20]; reverse.walls[0]!.end = [10, 20];
assert(JSON.stringify(windowPortals(reverse)[0]!.inward) === JSON.stringify(portals[0]!.inward), 'reversing wall endpoints preserves the inward direction');
const internal = structuredClone(source); internal.rooms.push({ id: 'other', name: 'Other', color: '#eeeeee', polygon: [[10, 16], [14, 16], [14, 20], [10, 20]] });
assert(windowPortals(internal).length === 0, 'interior glazing is not treated as an outdoor light source');
const elevated = structuredClone(source);
elevated.project = { mode: 'correct', currency: 'AMD', metadata: { wall: { elevation: 2 }, room: { elevation: 2 } }, components: [], routes: [], sources: [], assumptions: [], materials: [], finishes: [], tasks: [], options: [] };
assert(Math.abs(windowPortals(elevated)[0]!.position[1] - 3.88) < 1e-7, 'window light respects wall elevation');
elevated.project.metadata.window = { phase: 'remove' };
assert(windowPortals(elevated).length === 0, 'removed openings do not emit daylight');
elevated.project.metadata.window = {}; elevated.project.metadata.wall = { elevation: 2, phase: 'remove' };
assert(windowPortals(elevated).length === 0, 'removed walls do not emit daylight');
const noRooms = structuredClone(source); noRooms.rooms = [];
assert(windowPortals(noRooms).length === 0, 'unknown room-facing side does not invent a light direction');
const rig = new InteriorDaylight(); rig.setScene(source);
const spotlights = () => rig.group.children.filter((item): item is THREE.SpotLight => item instanceof THREE.SpotLight);
assert(spotlights().length === 1 && spotlights()[0]!.castShadow, 'window approximation respects partitions through a shadowed light');
assert(spotlights()[0]!.position.z < 20 && spotlights()[0]!.target.position.z > 20, 'light starts outside and aims into the opening');
assert(!spotlights()[0]!.shadow.autoUpdate && spotlights()[0]!.shadow.needsUpdate, 'static daylight shadows are cached between camera-only frames');
spotlights()[0]!.shadow.needsUpdate = false;
rig.updateMotion(true);
assert(spotlights()[0]!.shadow.needsUpdate, 'active scene motion refreshes shadows');
spotlights()[0]!.shadow.needsUpdate = false;
rig.updateMotion(false);
assert(spotlights()[0]!.shadow.needsUpdate, 'the final animation frame refreshes shadows when no jobs remain');
spotlights()[0]!.shadow.needsUpdate = false;
rig.updateMotion(false);
assert(!spotlights()[0]!.shadow.needsUpdate, 'camera-only frames after completion keep shadow maps cached');
rig.invalidateShadows();
assert(spotlights()[0]!.shadow.needsUpdate, 'asynchronous geometry replacement can explicitly refresh the cache');
rig.setEnabled(true); assert(rig.group.visible, 'Inside enables window lighting');
rig.setEnabled(false); assert(!rig.group.visible, 'outside view disables window lighting');
const many = structuredClone(source); many.walls = Array.from({ length: 12 }, (_, i) => ({ ...source.walls[0]!, id: `wall-${i}`, openings: [{ ...source.walls[0]!.openings[0]!, id: `window-${i}` }] }));
rig.setScene(many); assert(spotlights().length <= 4, 'window shadow count is bounded');
let disposed = 0;
for (const light of spotlights()) { light.shadow.map = new THREE.WebGLRenderTarget(2, 2); light.shadow.map.addEventListener('dispose', () => disposed++); }
rig.setScene(source); assert(disposed === 4, 'rebuilding daylight disposes every old shadow target');
rig.dispose(); assert(rig.group.children.length === 0, 'disposal removes window lights and targets');
assert(JSON.stringify(source) === original, 'daylight derivation never persists visualization assumptions in scene data');
console.log(`Interior lighting checks passed (${assertions} assertions).`);
