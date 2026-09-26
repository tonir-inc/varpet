import type { CatalogAsset, SceneDocument, Vec2, Wall } from '../contracts';
import { demoScene, localCatalog } from './demo';
import { migrateScene } from './renovation';
import { findWalkSpawn, moveWalkPosition } from './walkthrough';

let assertions = 0;
const failures: string[] = [];
function assert(condition: unknown, message: string): asserts condition { assertions++; if (!condition) throw new Error(message); }
function check(name: string, run: () => void): void { try { run(); } catch (error) { failures.push(`${name}: ${String(error)}`); } }
const wall = (id: string, start: Vec2, end: Vec2, openings: Wall['openings'] = []): Wall => ({ id, start, end, openings, height: 2.8, thickness: 0.16, color: '#eee' });
function roomScene(): SceneDocument {
  return migrateScene({ format: 'varpet.editor', version: 1, id: 'view', name: 'View', units: 'm', upAxis: 'Y',
    rooms: [{ id: 'room', name: 'Room', color: '#eee', polygon: [[0, 0], [6, 0], [6, 8], [0, 8]] }],
    walls: [wall('north', [0, 0], [6, 0], [{ id: 'window', kind: 'window', offset: 1, width: 4, sill: 0.9, height: 1.4 }]),
      wall('east', [6, 0], [6, 8]), wall('south', [6, 8], [0, 8]), wall('west', [0, 8], [0, 0])], objects: [] });
}
const cabinet: CatalogAsset = { id: 'cabinet', name: 'Cabinet', category: 'test', kind: 'cabinet', dimensions: [5, 0.9, 1], color: '#eee', price: 0, source: { type: 'procedural' } };
function withCabinet(height: number, bottom = 0): [SceneDocument, CatalogAsset[]] {
  const scene = roomScene(); scene.objects.push({ id: 'cabinet', assetId: 'cabinet', name: 'Cabinet', position: [3, bottom, 3], rotation: 0, scale: [1, 1, 1] });
  return [scene, [{ ...cabinet, dimensions: [5, height, 1] }]];
}
function view(scene: SceneDocument, catalog: CatalogAsset[] = [], point: Vec2 = [3, 5]) {
  const result = findWalkSpawn(scene, catalog, { roomId: 'room', point });
  assert(result, 'room has a safe standing point');
  return { ...result, direction: [result.target[0] - result.position[0], result.target[2] - result.position[2]] as Vec2 };
}
check('demo kitchen presents its window rather than a nearby blank partition', () => {
  const result = findWalkSpawn(demoScene, localCatalog, { roomId: 'room-kitchen' }); assert(result, 'demo kitchen has a spawn');
  assert(Math.abs(result.position[0] - 1.8833333333333333) < 1e-8 && Math.abs(result.position[2] + 2.411111111111111) < 1e-8, 'presentation preserves the exact safe demo standing point');
  assert(result.target[2] - result.position[2] < -0.7, 'kitchen view faces the window and worktop instead of the bath partition');
  assert(result.position[1] === 1.65 && result.target[1] === 1.65, 'view remains at level standing eye height');
});
check('low cabinets limit feet but not eye-level visibility', () => {
  const [scene, catalog] = withCabinet(0.9), before = JSON.stringify(scene), result = view(scene, catalog);
  assert(result.position[0] === 3 && result.position[2] === 5, 'safe requested position is preserved');
  assert(result.direction[1] < -0.8, 'view looks across a low cabinet toward the daylight opening');
  assert(moveWalkPosition(scene, catalog, result.position, [0, -4])[2] > 3.5, 'the same low cabinet still blocks walking');
  assert(JSON.stringify(scene) === before, 'view scoring never mutates the document');
  assert(JSON.stringify(result) === JSON.stringify(view(scene, catalog)), 'view selection is deterministic');
});
check('eye-height furniture blocks a window while overhead objects do not', () => {
  const [tall, tallCatalog] = withCabinet(2.2), blocked = view(tall, tallCatalog);
  assert(blocked.direction[1] > -0.4, 'a tall opaque cabinet suppresses the hidden window preference');
  const [overhead, overheadCatalog] = withCabinet(0.4, 2.1);
  assert(view(overhead, overheadCatalog).direction[1] < -0.8, 'furniture above eye level does not block sight');
  tall.project!.metadata.cabinet = { phase: 'remove' };
  assert(view(tall, tallCatalog).direction[1] < -0.8, 'removed furniture no longer hides the window');
});
check('fixed glazing stays visible and its sill must intersect eye height', () => {
  const scene = roomScene(); scene.project!.metadata.window = { mechanism: 'fixed' };
  const fixed = view(scene); assert(fixed.direction[1] < -0.8, 'fixed glazing is visible even though it is not walkable');
  const closed = structuredClone(scene); closed.walls[0]!.openings[0]!.sill = 2.2; closed.walls[0]!.openings[0]!.height = 0.5;
  // A near partition leaves the room depth asymmetric, exposing an incorrectly applied daylight bonus.
  closed.walls[0]!.start = [0, 3]; closed.walls[0]!.end = [6, 3];
  assert(view(closed).direction[1] > -0.4, 'a window above eye height cannot be treated as visible at eye height');
});
check('doors and open passages respect fixed panels and aperture height', () => {
  const scene = roomScene(); scene.walls[0]!.openings = [];
  scene.walls.push(wall('partition', [0, 3], [6, 3], [{ id: 'passage', kind: 'door', offset: 0.5, width: 5, sill: 0, height: 2.2 }]));
  assert(view(scene).direction[1] < -0.7, 'open door reveals the room beyond the partition');
  scene.project!.metadata.passage = { mechanism: 'fixed' };
  assert(view(scene).direction[1] > -0.4, 'opaque fixed door panel blocks eye-level visibility');
  scene.project!.metadata.passage = {}; scene.walls.at(-1)!.openings[0]!.height = 1.2;
  assert(view(scene).direction[1] > -0.4, 'an opening below the eyes is not treated as a clear view');
  scene.project!.metadata.partition = { phase: 'remove' };
  assert(view(scene).direction[1] < -0.7, 'removed walls no longer occlude the room beyond');
});
check('elevation and world translation preserve the view', () => {
  const [scene, catalog] = withCabinet(0.9), original = view(scene, catalog), elevated = structuredClone(scene);
  for (const room of elevated.rooms) { room.polygon = room.polygon.map(([x, z]) => [x + 37, z - 22]); elevated.project!.metadata[room.id] = { elevation: 1.1 }; }
  for (const wall of elevated.walls) { wall.start = [wall.start[0] + 37, wall.start[1] - 22]; wall.end = [wall.end[0] + 37, wall.end[1] - 22]; elevated.project!.metadata[wall.id] = { elevation: 1.1 }; }
  for (const object of elevated.objects) object.position = [object.position[0] + 37, object.position[1] + 1.1, object.position[2] - 22];
  const result = view(elevated, catalog, [40, -17]);
  assert(Math.hypot(result.direction[0] - original.direction[0], result.direction[1] - original.direction[1]) < 1e-8, 'world translation and floor elevation do not alter sight direction');
  assert(Math.abs(result.position[1] - 2.75) < 1e-8 && result.target[1] === result.position[1], 'elevated view stays at the same height above the floor');
});
check('fixed building components and wall vertical spans occlude at eye height', () => {
  const scene = roomScene(); scene.project!.components.push({ id: 'screen', name: 'Screen', kind: 'column', position: [3, 0, 3], dimensions: [5, 2.2, 1], rotation: 0, color: '#fff', phase: 'existing' });
  assert(view(scene).direction[1] > -0.4, 'eye-height component blocks a view');
  scene.project!.components[0]!.phase = 'remove';
  assert(view(scene).direction[1] < -0.8, 'removed component no longer blocks a view');
  scene.project!.components = []; scene.walls.push(wall('screen', [0, 3], [6, 3])); scene.walls.at(-1)!.height = 1;
  assert(view(scene).direction[1] < -0.8, 'low wall permits an eye-level view above it');
  scene.project!.metadata.screen = { elevation: 1 };
  assert(view(scene).direction[1] > -0.4, 'raised wall crossing eye height blocks the same view');
});
if (failures.length) throw new Error(`Walkthrough view checks failed:\n${failures.join('\n')}`);
console.log(`Walkthrough view checks passed (${assertions} assertions).`);
