import type { Opening, SceneDocument, Wall } from '../contracts';
import { inspectorOpenings } from './inspector-openings';
import { migrateScene } from './renovation';

let assertions = 0;
function equal(actual: unknown, expected: unknown, message: string): void {
  assertions++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)}`);
}
const window = (id: string, offset: number, sill = 1): Opening => ({ id, kind: 'window', offset, sill, width: 1, height: 1 });
const wall = (id: string, start: Wall['start'], end: Wall['end'], openings: Opening[]): Wall => ({ id, start, end, height: 6, thickness: .2, color: '#ffffff', openings });
const scene: SceneDocument = {
  format: 'varpet.editor', version: 1, id: 'inspector-openings', name: 'Opening selection', units: 'm', upAxis: 'Y', objects: [],
  rooms: [
    { id: 'left', name: 'Left room', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]], color: '#ffffff' },
    { id: 'right', name: 'Right room', polygon: [[4, 0], [8, 0], [8, 3], [4, 3]], color: '#ffffff' },
  ],
  walls: [
    wall('continuous', [0, 0], [8, 0], [window('left-window', 1), window('right-window', 5)]),
    wall('divider', [4, 0], [4, 3], [{ id: 'shared-door', kind: 'door', offset: 1, sill: 0, width: .8, height: 2.1 }]),
    wall('unrelated', [10, 0], [12, 0], [window('distant-window', .5)]),
  ],
};
const ids = (document: SceneDocument, id: string) => inspectorOpenings(document, id).map(item => item.opening.id);
const before = JSON.stringify(scene);
equal(ids(scene, 'left'), ['left-window', 'shared-door'], 'Room includes its section of a long wall and shared door');
equal(ids(scene, 'right'), ['right-window', 'shared-door'], 'Adjacent room excludes the other room’s window');
equal(ids(scene, 'continuous'), ['left-window', 'right-window'], 'Wall includes all of its hosted openings');
equal(ids(scene, 'divider'), ['shared-door'], 'Divider remains independently inspectable');
equal(ids(scene, 'missing'), [], 'Unknown selection has no openings');
equal(ids(scene, 'left-window'), [], 'Opening is not treated as a room');
equal(JSON.stringify(scene), before, 'Reading inspector choices does not mutate scene or add project data');

const reversed = structuredClone(scene);
const continuous = reversed.walls[0]!;
[continuous.start, continuous.end] = [continuous.end, continuous.start];
continuous.openings.forEach(opening => { opening.offset = 8 - opening.offset - opening.width; });
reversed.rooms.forEach(room => room.polygon.reverse());
equal(ids(reversed, 'left'), ['left-window', 'shared-door'], 'Reversing wall direction and polygon winding preserves membership');

const finishedFaces = structuredClone(scene);
finishedFaces.rooms[0]!.polygon = [[.1, .1], [3.9, .1], [3.9, 2.9], [.1, 2.9]];
equal(ids(finishedFaces, 'left'), ['left-window', 'shared-door'], 'Finished-face room boundaries include their openings');

const elevated = migrateScene(scene);
elevated.project!.metadata.left = { ceilingHeight: 2.8 };
elevated.rooms.push({ ...structuredClone(elevated.rooms[0]!), id: 'upper' });
elevated.project!.metadata.upper = { elevation: 3, ceilingHeight: 2.8 };
elevated.walls[0]!.openings.push(window('upper-window', 1, 4));
equal(ids(elevated, 'left'), ['left-window', 'shared-door'], 'Window above this room’s ceiling is excluded');
equal(ids(elevated, 'upper'), ['upper-window'], 'Elevated room includes only openings at its elevation');
elevated.project!.metadata['left-window'] = { locked: true, phase: 'remove' };
equal(ids(elevated, 'left'), ['left-window', 'shared-door'], 'Locked and removed openings remain reachable for inspection and restoration');

console.log(`Inspector opening selection checks passed (${assertions} assertions).`);
