/** User-facing plan dimensions must agree with wall faces and active opening geometry. */
import type { Opening, SceneDocument, Vec2, Wall } from '../contracts';
import { measurePlanOpening } from './plan-measurements';
import { createPlanMove, previewPlanMove } from './plan-move';
import { migrateScene } from './renovation';

let checks = 0;
function assert(condition: unknown, message: string): asserts condition {
  checks++;
  if (!condition) throw new Error(message);
}
function near(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 1e-7, `${message}: expected ${expected}, got ${actual}`);
}
function point(actual: Vec2, expected: Vec2, message: string): void {
  near(actual[0], expected[0], `${message} x`); near(actual[1], expected[1], `${message} z`);
}
const opening = (patch: Partial<Opening> = {}): Opening => ({ id: 'window', kind: 'window', offset: 2, width: 1.5, height: 1.2, sill: 0.9, ...patch });
const wall = (id: string, start: Vec2, end: Vec2, openings: Opening[] = []): Wall => ({ id, start, end, openings, height: 3, thickness: 0.2, color: '#eeeeee' });
function sceneFor(host = wall('host', [0, 0], [8, 0], [opening()]), ...others: Wall[]): SceneDocument {
  return migrateScene({ format: 'varpet.editor', version: 1, id: 'dimensions', name: 'Plan dimensions', units: 'm', upAxis: 'Y',
    rooms: [{ id: 'room', name: 'Room', color: '#eeeeee', polygon: [[-10, -10], [10, -10], [10, 10], [-10, 10]] }], walls: [host, ...others], objects: [] });
}
function measure(scene: SceneDocument) {
  const value = measurePlanOpening(scene, scene.walls[0]!, scene.walls[0]!.openings[0]!);
  assert(value, 'A valid opening has dimensions');
  return value;
}

const horizontal = sceneFor();
const untouched = JSON.stringify(horizontal);
const dimensions = measure(horizontal);
near(dimensions.width, 1.5, 'Width is physical opening width');
near(dimensions.height, 1.2, 'Height is physical opening height');
near(dimensions.sill, 0.9, 'Sill is measured above host base');
near(dimensions.headroom, 0.9, 'Headroom ends at host wall top');
near(dimensions.wallThickness, 0.2, 'Host thickness remains available');
near(dimensions.before.length, 2, 'Left gap reaches host endpoint when unobstructed');
near(dimensions.after.length, 4.5, 'Right gap reaches host endpoint when unobstructed');
assert(dimensions.before.label === 'Left' && dimensions.after.label === 'Right', 'Horizontal gaps use screen labels');
point(dimensions.before.start, [0, 0], 'Left gap start'); point(dimensions.before.end, [2, 0], 'Left gap end');
point(dimensions.opening.start, [2, 0], 'Width start'); point(dimensions.opening.end, [3.5, 0], 'Width end');
near(dimensions.opening.length, 1.5, 'Width dimension length');
point(dimensions.after.start, [3.5, 0], 'Right gap start'); point(dimensions.after.end, [8, 0], 'Right gap end');
point(dimensions.direction, [1, 0], 'Canonical horizontal tangent');
point(dimensions.normal, [0, 1], 'Canonical horizontal normal');
assert(dimensions.before.boundaryKind === 'wall-end' && dimensions.before.boundaryId === 'host', 'Fallback gap identifies the host endpoint');
assert(JSON.stringify(horizontal) === untouched, 'Measurement never mutates its input');

const reverseHorizontal = sceneFor(wall('host', [8, 0], [0, 0], [opening({ offset: 4.5 })]));
assert(JSON.stringify(measure(reverseHorizontal)) === JSON.stringify(dimensions), 'Reversed endpoints preserve visually ordered dimensions');
const vertical = measure(sceneFor(wall('host', [2, 1], [2, 9], [opening()])));
assert(vertical.before.label === 'Top' && vertical.after.label === 'Bottom', 'Vertical gaps use top and bottom labels');
point(vertical.before.start, [2, 1], 'Top boundary'); point(vertical.opening.end, [2, 4.5], 'Vertical opening end');
point(vertical.direction, [0, 1], 'Canonical vertical tangent');
const reverseVertical = measure(sceneFor(wall('host', [2, 9], [2, 1], [opening({ offset: 4.5 })])));
assert(JSON.stringify(reverseVertical) === JSON.stringify(vertical), 'Vertical reversal preserves measurements');
const diagonal = measure(sceneFor(wall('host', [0, 0], [6, 8], [opening()])));
near(diagonal.before.length, 2, 'Diagonal gap uses metres along wall');
near(diagonal.after.length, 6.5, 'Diagonal remaining gap uses wall length');
point(diagonal.opening.start, [1.2, 1.6], 'Diagonal opening start');
point(diagonal.opening.end, [2.1, 2.8], 'Diagonal opening end');
point(diagonal.direction, [0.6, 0.8], 'Diagonal tangent');
assert(diagonal.before.label === 'Top', 'Steep diagonal uses top/bottom labels');

const blocked = sceneFor(undefined, wall('left', [1, -2], [1, 2]), wall('right', [6, -2], [6, 2]));
blocked.project!.metadata.left = { name: 'Hall partition' };
const betweenWalls = measure(blocked);
near(betweenWalls.before.length, 0.9, 'Gap starts at left wall face');
near(betweenWalls.after.length, 2.4, 'Gap stops at right wall face');
point(betweenWalls.before.start, [1.1, 0], 'Left wall face point');
point(betweenWalls.after.end, [5.9, 0], 'Right wall face point');
assert(betweenWalls.before.boundaryId === 'left' && betweenWalls.before.boundaryKind === 'wall', 'Boundary identifies intersecting wall');
assert(betweenWalls.before.boundaryLabel === 'Hall partition', 'Named wall is available for accessible context');
const angled = measure(sceneFor(undefined, wall('diagonal', [4, -2], [8, 2])));
near(angled.after.length, 2.5 - 0.1 - Math.SQRT2 * 0.1, 'Angled partition clearance accounts for both wall footprints');

const neighbors = structuredClone(blocked);
neighbors.walls[0]!.openings.push(opening({ id: 'previous', offset: 1.5, width: 0.25 }), opening({ id: 'next', kind: 'door', offset: 5, width: 0.8, sill: 0, height: 2.1 }));
let neighborMeasurements = measure(neighbors);
near(neighborMeasurements.before.length, 0.25, 'Nearest previous opening beats farther wall');
near(neighborMeasurements.after.length, 1.5, 'Nearest next opening beats farther wall');
assert(neighborMeasurements.after.boundaryKind === 'opening' && neighborMeasurements.after.boundaryId === 'next', 'Neighbor boundary is identified');
neighbors.project!.metadata.previous = { phase: 'remove' };
neighbors.project!.metadata.next = { phase: 'remove' };
neighborMeasurements = measure(neighbors);
near(neighborMeasurements.before.length, 0.9, 'Removed previous opening does not shorten current gap');
near(neighborMeasurements.after.length, 2.4, 'Removed next opening does not shorten current gap');
const touching = sceneFor(wall('host', [0, 0], [8, 0], [opening({ offset: 0 }), opening({ id: 'next', offset: 1.5 })]));
near(measure(touching).before.length, 0, 'Wall-end contact has zero gap');
near(measure(touching).after.length, 0, 'Neighbor contact has zero gap');
touching.walls[0]!.openings.splice(1, 1);
touching.walls.push(wall('right', [1.6, -2], [1.6, 2]));
near(measure(touching).after.length, 0, 'Wall-face contact has zero gap');

const phases = structuredClone(blocked);
phases.project!.metadata.left = { phase: 'remove' };
phases.project!.metadata.right = { elevation: 2.1 };
near(measure(phases).before.length, 2, 'Removed wall is not a boundary');
near(measure(phases).after.length, 4.5, 'Wall above opening is not a boundary');
phases.project!.metadata.right = { elevation: 2 };
near(measure(phases).after.length, 2.4, 'Vertically overlapping elevated wall is a boundary');
phases.project!.metadata.host = { elevation: 6 };
near(measure(phases).after.length, 4.5, 'Host elevation is included in clearance');
const low = sceneFor(undefined, { ...wall('low', [6, -2], [6, 2]), height: 0.9 });
near(measure(low).after.length, 4.5, 'Wall below sill is not a boundary');

const move = createPlanMove(horizontal, 'window');
assert(move, 'Opening has a move gesture');
const preview = previewPlanMove(move, [0.4, 0], false, []);
assert(preview.scene && !preview.error, 'Opening movement produces a valid preview');
near(measure(preview.scene).before.length, 2.4, 'Left dimensions follow preview geometry');
near(measure(preview.scene).after.length, 4.1, 'Right dimensions follow preview geometry');
assert(JSON.stringify(horizontal) === untouched, 'Preview measurement preserves original scene');
const degenerate = wall('zero', [1, 1], [1, 1], [opening()]);
assert(measurePlanOpening(sceneFor(degenerate), degenerate, degenerate.openings[0]!) === undefined, 'Degenerate wall yields no invalid coordinates');
console.log(`Plan selection measurements: ${checks} assertions passed.`);
