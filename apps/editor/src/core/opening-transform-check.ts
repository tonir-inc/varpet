import type { EntityMetadata, Opening, SceneDocument, Vec2, Wall } from '../contracts';
import { constrainOpeningTransform, findOpeningTransform, type OpeningDimensions, type OpeningTransformContext, type OpeningTransformMode } from './opening-transform';
import { migrateScene } from './renovation';
import { EditorStore } from './store';
import { validateScene } from './validation';

let assertions = 0, scenarios = 0;
const failures: string[] = [];
function assert(value: unknown, message: string): asserts value { assertions++; if (!value) throw new Error(message); }
function near(actual: number, expected: number, message: string): void { assert(Math.abs(actual - expected) < 1e-8, `${message}: expected ${expected}, got ${actual}`); }
function equal(actual: unknown, expected: unknown, message: string): void { assert(JSON.stringify(actual) === JSON.stringify(expected), message); }
function check(name: string, run: () => void): void { scenarios++; try { run(); } catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); } }
const modes: OpeningTransformMode[] = ['move', 'move-x', 'move-y', 'left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
const aperture = (patch: Partial<Opening> = {}): Opening => ({ id: 'window', kind: 'window', offset: 2.1234, width: 1.2345, height: 1.4567, sill: 0.7123, ...patch });
const wall = (id: string, start: Vec2, end: Vec2, openings: Opening[] = []): Wall => ({ id, start, end, openings, height: 3.8, thickness: 0.2, color: '#eeeeee' });
function scene(opening = aperture(), others: Wall[] = []): SceneDocument {
  return migrateScene({ format: 'varpet.editor', version: 1, id: 'window-transforms', name: 'Window transforms', units: 'm', upAxis: 'Y',
    rooms: [{ id: 'room', name: 'Room', polygon: [[-10, -10], [10, -10], [10, 10], [-10, 10]], color: '#eeeeee' }],
    walls: [wall('host', [0, 0], [8, 0], [opening]), ...others], objects: [] });
}
function context(value: SceneDocument): OpeningTransformContext {
  const validation = validateScene(value, []);
  assert(validation.ok, `Test input is a valid scene: ${validation.errors.join(' ')}`);
  const found = findOpeningTransform(value, 'window');
  assert(found, 'Window has an editable context'); return found;
}
const shape = (value: OpeningDimensions): OpeningDimensions => ({ offset: value.offset, sill: value.sill, width: value.width, height: value.height });
function validResult(input: SceneDocument, result: OpeningDimensions, label: string): void {
  const store = new EditorStore(input, []);
  const before = JSON.stringify(store.scene);
  const applied = store.execute({ id: crypto.randomUUID(), source: 'human', baseRevision: store.revision, label,
    operations: [{ type: 'update-opening', id: 'window', patch: result }] }, true);
  assert(applied.ok, `${label} satisfies real scene validation: ${applied.errors.join(' ')}`);
  const after = JSON.stringify(store.scene);
  assert(store.undo().ok && JSON.stringify(store.scene) === before && !store.canUndo, 'Single undo restores every dimension');
  assert(store.redo().ok && JSON.stringify(store.scene) === after, 'Single redo restores transform');
}

check('Every handle transforms only its intended edges and axes', () => {
  const input = scene(), source = input.walls[0]!.openings[0]!, ctx = context(input), dx = 0.37, dy = 0.42;
  for (const mode of modes) {
    const result = constrainOpeningTransform(ctx, mode, dx, dy, false);
    const left = mode.includes('left'), right = mode.includes('right'), top = mode.includes('top'), bottom = mode.includes('bottom');
    const moveX = mode === 'move' || mode === 'move-x', moveY = mode === 'move' || mode === 'move-y';
    near(result.offset, source.offset + (left || moveX ? dx : 0), `${mode} offset`);
    near(result.width, source.width + (right ? dx : left ? -dx : 0), `${mode} width`);
    near(result.sill, source.sill + (bottom || moveY ? dy : 0), `${mode} sill`);
    near(result.height, source.height + (top ? dy : bottom ? -dy : 0), `${mode} height`);
    if (!left && !right) assert(result.width === source.width, `${mode} preserves width exactly`);
    if (!top && !bottom) assert(result.height === source.height, `${mode} preserves height exactly`);
    if (!left && !right && !moveX) assert(result.offset === source.offset, `${mode} preserves horizontal origin exactly`);
    if (!top && !bottom && !moveY) assert(result.sill === source.sill, `${mode} preserves vertical origin exactly`);
    if (left) near(result.offset + result.width, source.offset + source.width, 'Left resize anchors the opposite edge');
    if (bottom) near(result.sill + result.height, source.sill + source.height, 'Bottom resize anchors the opposite edge');
    validResult(input, result, mode);
  }
});

check('Fractional origins do not jump with snapping or unused pointer axes', () => {
  const input = scene(), ctx = context(input), original = shape(ctx.opening);
  for (const mode of modes) {
    equal(constrainOpeningTransform(ctx, mode, 0, 0, true), original, `${mode} zero delta leaves fractional values intact`);
    equal(constrainOpeningTransform(ctx, mode, 0.012, -0.012, true), original, `${mode} sub-step movement stays at the origin`);
  }
  const snapped = constrainOpeningTransform(ctx, 'move', 0.127, -0.074, true);
  near(snapped.offset, original.offset + 0.15, 'Horizontal delta snaps to five centimetres');
  near(snapped.sill, original.sill - 0.05, 'Vertical delta snaps to five centimetres');
  equal(constrainOpeningTransform(ctx, 'top', 30, 0, true), original, 'Horizontal pointer travel does not move a top handle');
  equal(constrainOpeningTransform(ctx, 'right', 0, 30, true), original, 'Vertical pointer travel does not move a right handle');
  for (const bad of [NaN, Infinity, -Infinity]) {
    equal(constrainOpeningTransform(ctx, 'move', bad, 1, false), original, 'Invalid horizontal delta is ignored safely');
    equal(constrainOpeningTransform(ctx, 'move', 1, bad, true), original, 'Invalid vertical delta is ignored safely');
  }
  equal(shape(ctx.opening), original, 'Preview constraints never mutate the original opening');
});

check('Minimum dimensions and all host boundaries clamp every handle', () => {
  const input = scene(), ctx = context(input), before = shape(ctx.opening);
  near(constrainOpeningTransform(ctx, 'left', 100, 0, false).width, 0.2, 'Left handle has minimum width');
  near(constrainOpeningTransform(ctx, 'right', -100, 0, false).width, 0.2, 'Right handle has minimum width');
  near(constrainOpeningTransform(ctx, 'top', 0, -100, false).height, 0.2, 'Top handle has minimum height');
  near(constrainOpeningTransform(ctx, 'bottom', 0, 100, false).height, 0.2, 'Bottom handle has minimum height');
  near(constrainOpeningTransform(ctx, 'left', -100, 0, false).offset, 0, 'Left edge stops at host start');
  near(constrainOpeningTransform(ctx, 'right', 100, 0, false).width, 8 - before.offset, 'Right edge stops at host end');
  near(constrainOpeningTransform(ctx, 'top', 0, 100, false).height, 3.8 - before.sill, 'Top edge stops at wall top');
  near(constrainOpeningTransform(ctx, 'bottom', 0, -100, false).sill, 0, 'Bottom edge stops at wall bottom');
  for (const mode of modes) for (const dx of [-100, 100]) for (const dy of [-100, 100]) {
    validResult(input, constrainOpeningTransform(ctx, mode, dx, dy, true), `Clamped ${mode} ${dx}/${dy}`);
  }
});

check('Same-wall windows and doors are impassable at all sill heights', () => {
  const input = scene();
  input.walls[0]!.openings.push(aperture({ id: 'left', offset: 0.3, width: 1, height: 0.3, sill: 3 }), aperture({ id: 'right', kind: 'door', offset: 5.3, width: 0.8, height: 2, sill: 0 }));
  input.project!.metadata.left = { phase: 'remove' };
  const ctx = context(input);
  near(ctx.minAlong, 1.3, 'Left bound follows neighbouring far edge');
  near(ctx.maxAlong, 5.3, 'Right bound follows neighbouring near edge');
  near(constrainOpeningTransform(ctx, 'move-x', -100, 0, true).offset, 1.3, 'Move cannot cross left neighbour');
  near(constrainOpeningTransform(ctx, 'move-x', 100, 0, true).offset, 5.3 - ctx.opening.width, 'Move cannot cross right neighbour');
  near(constrainOpeningTransform(ctx, 'left', -100, 0, true).offset, 1.3, 'Left resize respects neighbour');
  const right = constrainOpeningTransform(ctx, 'right', 100, 0, true);
  near(right.offset + right.width, 5.3, 'Right resize respects neighbour');
  validResult(input, right, 'Touch neighbour');
});

check('Diagonal wall coordinates and raised hosts use local dimensions', () => {
  const input = scene();
  input.walls[0]!.start = [-2, -2]; input.walls[0]!.end = [2.8, 4.4];
  input.project!.metadata.host = { elevation: 4 };
  const result = constrainOpeningTransform(context(input), 'move', 0.4, 0.3, false);
  near(result.offset, aperture().offset + 0.4, 'Diagonal along-wall movement is in metres');
  near(result.sill, aperture().sill + 0.3, 'Host world elevation never leaks into sill');
  validResult(input, result, 'Raised diagonal movement');
});

check('Locks, removal, doors and invalid placements cannot start window transforms', () => {
  for (const id of ['window', 'host']) for (const metadata of [{ locked: true }, { phase: 'remove' }] as EntityMetadata[]) {
    const input = scene(); input.project!.metadata[id] = metadata;
    assert(!findOpeningTransform(input, 'window'), 'Locked or removed window and host refuse drag context');
  }
  assert(!findOpeningTransform(scene(aperture({ kind: 'door', sill: 0 })), 'window'), 'Doors remain on their existing move-only path');
  assert(!findOpeningTransform(scene(), 'absent'), 'Missing window has no context');
  const intersecting = scene(aperture({ offset: 3.5 }), [wall('blocker', [4, -3], [4, 3])]);
  assert(!findOpeningTransform(intersecting, 'window'), 'Invalid intersection cannot begin a drag');
});

check('Horizontal sweeps cannot tunnel through intersecting wall thickness', () => {
  const input = scene(aperture({ offset: 1, width: 1, sill: 1, height: 1 }), [wall('blocker', [4, -3], [4, 3])]);
  const ctx = context(input);
  const moved = constrainOpeningTransform(ctx, 'move-x', 100, 0, true);
  near(moved.offset, 2.9, 'Large translation stops at the partition face');
  const resized = constrainOpeningTransform(ctx, 'right', 100, 0, true);
  near(resized.offset + resized.width, 3.9, 'Large right resize stops at the partition face');
  validResult(input, moved, 'Move touches partition'); validResult(input, resized, 'Resize touches partition');
  const reverse = scene(aperture({ offset: 5, width: 1, sill: 1, height: 1 }), [wall('blocker', [4, -3], [4, 3])]);
  near(constrainOpeningTransform(context(reverse), 'move-x', -100, 0, false).offset, 4.1, 'Reverse movement stops at the far partition face');
});

check('Changing vertical extent observes low walls and elevated barriers', () => {
  const low = scene(aperture({ offset: 3.5, width: 1, sill: 1, height: 1 }), [{ ...wall('low', [4, -3], [4, 3]), height: 0.8 }]);
  const ctx = context(low);
  near(constrainOpeningTransform(ctx, 'move-x', 100, 0, false).offset, 7, 'Window can pass above a low wall');
  const down = constrainOpeningTransform(ctx, 'move-y', 0, -100, false);
  near(down.sill, 0.8, 'Vertical movement stops above a low wall');
  const bottom = constrainOpeningTransform(ctx, 'bottom', 0, -100, false);
  near(bottom.sill, 0.8, 'Bottom resize stops at low wall top');
  near(bottom.height, 1.2, 'Bottom resize retains original upper edge');
  validResult(low, down, 'Lower to partition'); validResult(low, bottom, 'Extend to partition');
  const beam = scene(aperture({ offset: 3.5, width: 1, sill: 0.3, height: 0.5 }), [{ ...wall('beam', [4, -3], [4, 3]), height: 0.4 }]);
  beam.project!.metadata.beam = { elevation: 1.8 };
  const beamContext = context(beam);
  const raised = constrainOpeningTransform(beamContext, 'move-y', 0, 100, false);
  near(raised.sill + raised.height, 1.8, 'Large vertical move cannot tunnel through an elevated wall');
  near(constrainOpeningTransform(beamContext, 'top', 0, 100, false).height, 1.5, 'Top resize stops under an elevated wall');
  validResult(beam, raised, 'Raise under beam');
});

check('Openings through crossing walls preserve their vertical clearance', () => {
  const cross = wall('cross', [4, -3], [4, 3], [aperture({ id: 'cross-window', offset: 2.5, width: 1, sill: 0.5, height: 2.5 })]);
  const input = scene(aperture({ offset: 3, width: 2, sill: 0.5, height: 2.5 }), [cross]);
  const ctx = context(input);
  const up = constrainOpeningTransform(ctx, 'top', 0, 100, false), down = constrainOpeningTransform(ctx, 'bottom', 0, -100, false);
  near(up.sill + up.height, 3, 'Other aperture lintel limits top resize');
  near(down.sill, 0.5, 'Other aperture sill limits bottom resize');
  validResult(input, up, 'Top touches crossing lintel'); validResult(input, down, 'Bottom touches crossing sill');
  for (const mode of modes) for (const delta of [-100, 100]) {
    validResult(input, constrainOpeningTransform(ctx, mode, delta, delta, false), `Preserve crossing aperture ${mode} ${delta}`);
  }
});

check('Diagonal paths sweep the complete rectangle and can clear a low obstacle', () => {
  const input = scene(aperture({ offset: 1, width: 1, sill: 0.3, height: 0.5 }), [wall('blocker', [4, -3], [4, 3])]);
  const result = constrainOpeningTransform(context(input), 'move', 100, 100, false);
  near(result.offset, 2.9, 'Diagonal move stops at first horizontal contact');
  assert(result.sill < input.walls[0]!.height - result.height, 'Diagonal drag stops both axes at one contact time');
  validResult(input, result, 'Diagonal constrained move');
  const low = scene(aperture({ offset: 3.5, width: 1, sill: 1, height: 1 }), [{ ...wall('low', [4, -3], [4, 3]), height: 0.8 }]);
  const clear = constrainOpeningTransform(context(low), 'move', 3.5, -1, false);
  near(clear.offset, 7, 'A diagonal path can move beyond a wall before descending');
  near(clear.sill, 0, 'Clear diagonal path reaches its lower target');
  validResult(low, clear, 'Move around low partition');
});

check('Rotation and common floor elevation do not change collision distances', () => {
  const original = scene(aperture({ offset: 1, width: 1, sill: 1, height: 1 }), [wall('blocker', [4, -3], [4, 3])]);
  const transformed = structuredClone(original), angle = Math.PI / 5;
  for (const entry of transformed.walls) {
    for (const key of ['start', 'end'] as const) {
      const [x, z] = entry[key]; entry[key] = [x * Math.cos(angle) - z * Math.sin(angle), x * Math.sin(angle) + z * Math.cos(angle)];
    }
    transformed.project!.metadata[entry.id] = { elevation: 2.7 };
  }
  const before = context(original), after = context(transformed);
  for (const mode of modes) {
    const expected = constrainOpeningTransform(before, mode, 100, 100, true), actual = constrainOpeningTransform(after, mode, 100, 100, true);
    for (const key of ['offset', 'sill', 'width', 'height'] as const) near(actual[key], expected[key], `Rotated elevated ${mode} ${key}`);
    validResult(transformed, actual, `Rotated elevated ${mode}`);
  }
});

check('Legacy windows use the same preview and migrate only when committed', () => {
  const input = scene(); input.version = 1; delete input.project;
  const before = JSON.stringify(input), ctx = context(input);
  const result = constrainOpeningTransform(ctx, 'top-right', 0.2, 0.1, true);
  assert(input.version === 1 && JSON.stringify(input) === before, 'Legacy preview never mutates or migrates its source');
  validResult(input, result, 'Legacy direct resize');
});

if (failures.length) throw new Error(`Opening transform checks failed (${failures.length}):\n${failures.join('\n')}`);
console.log(`Opening transform checks passed: ${assertions} assertions across ${scenarios} scenarios.`);
