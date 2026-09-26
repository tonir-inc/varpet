import type { SceneDocument, Vec2 } from '../contracts';
import { buildCeilingDesignOperations, defaultCeilingDesign, layoutCeilingDesign } from './ceiling-design';
import { decorateGeneratedCeilings, buildCeilingSwitchOperations } from './generated-ceilings';
import { componentPosition } from './geometry';
import { createApartmentStore } from './apartment-store';
import { migrateScene } from './renovation';
import { parseScene, serializeScene } from './persistence';
import { validateScene } from './validation';
import { createReconstructionProposal } from './reconstruction-proposal';
import { measuredShell, mergeReconstruction, tracedShell } from '../features/reconstruction';

let assertions = 0;
function assert(condition: unknown, message: string): asserts condition { assertions++; if (!condition) throw new Error(message); }
function shell(width = 4, depth = 4): SceneDocument {
  const polygon: Vec2[] = [[0, 0], [width, 0], [width, depth], [0, depth]];
  return migrateScene({ format: 'varpet.editor', version: 1, id: 'generated', name: 'Generated', units: 'm', upAxis: 'Y', objects: [],
    rooms: [{ id: 'room', name: 'Living room', polygon, color: '#dddddd' }],
    walls: polygon.map((start, i) => ({ id: `wall-${i}`, start, end: polygon[(i + 1) % polygon.length]!, height: 2.7, thickness: .12, color: '#ffffff', openings: [] })) });
}
function validate(scene: SceneDocument, label: string): void { const result = validateScene(scene, []); assert(result.ok, `${label}: ${result.errors.join(' ')}`); }
const source = shell();
source.walls[0]!.openings.push({ id: 'door', kind: 'door', offset: 1, width: .9, sill: 0, height: 2.1 });
source.project!.sources.push({ id: 'plan', name: 'Supplied plan', kind: 'plan' });
const original = JSON.stringify(source), generated = decorateGeneratedCeilings(source);
validate(generated, 'Generated room and switch pass authoritative validation');
assert(JSON.stringify(source) === original, 'Generation never changes its source scene');
assert(generated.project!.metadata.room?.ceilingDesign?.style === 'quiet', 'Generated interior has an editable recessed ceiling');
assert(layoutCeilingDesign(generated, generated.rooms[0]!)!.elements.length > 0, 'Default creates actual ceiling geometry');
assert(generated.project!.components.length === 1, 'A room gets one room switch');
const control = generated.project!.components[0]!;
assert(control.phase === 'new' && control.kind === 'switch' && control.control?.targets[0] === 'room', 'Generated switch controls the room and remains a proposed addition');
assert(control.host?.wallId === 'wall-0' && control.host.side === 1, 'Switch sits on the inward-facing entry wall');
const host = control.host!;
assert(host.offset + control.dimensions[0] / 2 <= .85 || host.offset - control.dimensions[0] / 2 >= 2.05, 'Switch body has clearance from the door opening');
assert(control.position[2] > .06 && control.position[0] > 0 && control.position[0] < 4, 'Switch projects into the correct room');
assert(generated.project!.routes.length === 0, 'Logical switch controls do not invent electrical routes');
assert(generated.project!.assumptions.length === 2 && generated.project!.assumptions.every(a => a.sourceKind === 'design' && a.status === 'unresolved' && a.sourceIds.length === 0), 'Lighting and switch are explicitly unresolved design choices without false source evidence');
assert(generated.project!.sources[0]!.id === 'plan', 'Original source evidence remains intact');
assert(JSON.stringify(decorateGeneratedCeilings(generated)) === JSON.stringify(generated), 'Repeating generation decoration preserves designs, controls and assumption identities');
assert(JSON.stringify(parseScene(serializeScene(generated), [])) === JSON.stringify(generated), 'Save and reopen preserve ceiling, room control and provenance');

for (const metadata of [{ ceilingDesign: null }, { locked: true }, { phase: 'remove' as const }, { zone: 'balcony' as const }, { zone: 'terrace' as const }]) {
  const scene = shell(); scene.project!.metadata.room = { ...scene.project!.metadata.room, ...metadata };
  const expected = JSON.stringify(scene.project!.metadata.room), decorated = decorateGeneratedCeilings(scene);
  assert(JSON.stringify(decorated.project!.metadata.room) === expected && decorated.project!.components.length === 0, `Preserve room restriction ${JSON.stringify(metadata)}`);
}
const authored = shell();
const chosen = { ...defaultCeilingDesign('architectural'), brightness: 39, enabled: false };
authored.project!.metadata.room!.ceilingDesign = chosen;
const preserved = decorateGeneratedCeilings(authored);
assert(JSON.stringify(preserved.project!.metadata.room!.ceilingDesign) === JSON.stringify(chosen), 'Authored ceiling settings and off-state survive defaults');
assert(preserved.project!.components.length === 1 && preserved.project!.assumptions.every(a => a.entityId !== 'room'), 'Existing authored design gains only a proposed control, without reclassifying design evidence');
for (const withRoomId of [true, false]) {
  const scene = shell();
  scene.project!.components.push({ id: 'observed-light', name: 'Photographed pendant', kind: 'light', position: [2, 2.3, 2], dimensions: [.2, .2, .2], rotation: 0, phase: 'existing', color: '#ffffff', ...(withRoomId ? { roomId: 'room' } : {}), light: { brightness: 500, temperature: 2700, enabled: false } });
  const decorated = decorateGeneratedCeilings(scene);
  assert(decorated.project!.metadata.room!.ceilingDesign === undefined && decorated.project!.components.length === 1, 'An active authored fixture suppresses duplicate starter lighting, even when switched off');
}
const narrow = decorateGeneratedCeilings(shell(.6, 3));
validate(narrow, 'Narrow room fallback validates');
assert(narrow.project!.metadata.room!.ceilingDesign!.inset === .15, 'Small room receives a fitting compact layout');
for (const scene of [shell(.35, 2), shell(4, 4)]) {
  if (scene.rooms[0]!.polygon[1]![0] === 4) scene.project!.metadata.room!.ceilingHeight = 1.8;
  const decorated = decorateGeneratedCeilings(scene);
  assert(!decorated.project!.metadata.room!.ceilingDesign && decorated.project!.components.length === 0, 'Unsupported room geometry or headroom keeps a plain ceiling');
  assert(decorated.project!.assumptions.some(a => a.property === 'ceilingDesign' && a.sourceKind === 'design'), 'Skipped layout records the need for individual design');
  assert(JSON.stringify(decorateGeneratedCeilings(decorated)) === JSON.stringify(decorated), 'Unsupported geometry does not accumulate duplicate review entries');
}
const unhosted = shell(); unhosted.walls = []; unhosted.project!.metadata = { room: {} };
const withoutSwitch = decorateGeneratedCeilings(unhosted);
assert(withoutSwitch.project!.metadata.room!.ceilingDesign && withoutSwitch.project!.components.length === 0, 'Room without walls gets a ceiling without a free-floating switch');
const glazing = shell();
glazing.walls.forEach(wall => wall.openings.push({ id: `window-${wall.id}`, kind: 'window', offset: 0, width: 4, height: 2.6, sill: 0 }));
assert(decorateGeneratedCeilings(glazing).project!.components.length === 0, 'Fully glazed walls cannot host a proposed switch');
const reversed = shell(); reversed.rooms[0]!.polygon.reverse(); reversed.walls.forEach(wall => { [wall.start, wall.end] = [wall.end, wall.start]; });
const reversedControl = decorateGeneratedCeilings(reversed).project!.components[0]!;
const position = componentPosition(reversed, reversedControl);
assert(position[0] > 0 && position[0] < 4 && position[2] > 0 && position[2] < 4 && reversedControl.host!.side === -1, 'Room and wall winding do not change the inward control placement');
const elevated = shell(); Object.values(elevated.project!.metadata).forEach(metadata => { metadata.elevation = .6; });
const raised = decorateGeneratedCeilings(elevated);
validate(raised, 'Raised room control validates');
assert(Math.abs(raised.project!.components[0]!.host!.elevation - 1.7) < 1e-6, 'Switch elevation follows its room floor');
const highest = shell(); Object.values(highest.project!.metadata).forEach(metadata => { metadata.elevation = 20; });
const highDecorated = decorateGeneratedCeilings(highest);
validate(highDecorated, 'Supported high room remains valid when a switch would exceed mount limits');
assert(highDecorated.project!.metadata.room!.ceilingDesign && highDecorated.project!.components.length === 0, 'Out-of-range mount skips the optional switch without losing the ceiling');
const longName = shell(); longName.rooms[0]!.name = 'L'.repeat(120);
validate(decorateGeneratedCeilings(longName), 'Generated control name stays within the contract length limit');
const longWall = shell(100, 4);
longWall.rooms[0]!.polygon = longWall.rooms[0]!.polygon.map(([x, z]) => [x - 50, z]);
longWall.walls.forEach(wall => { wall.start = [wall.start[0] - 50, wall.start[1]]; wall.end = [wall.end[0] - 50, wall.end[1]]; });
longWall.walls[0]!.openings.push({ id: 'far-door', kind: 'door', offset: 98.9, width: .9, height: 2.1, sill: 0 });
const longDecorated = decorateGeneratedCeilings(longWall);
validate(longDecorated, 'Maximum-length walls retain valid switch placement');
assert(longDecorated.project!.components[0]!.host!.offset <= 100, 'Generated control respects the host offset contract');

const manual = createApartmentStore(shell(), []);
assert(manual.execute({ id: 'ceiling', label: 'Add ceiling', source: 'human', baseRevision: manual.revision, operations: buildCeilingDesignOperations(manual.scene, 'room', defaultCeilingDesign('soft-glow')) }, true).ok, 'Manual ceiling design applies');
const beforeControl = serializeScene(manual.scene), switchOps = buildCeilingSwitchOperations(manual.scene, 'room');
assert(switchOps.length === 2, 'Manual switch helper supplies connected component and evidence operations');
assert(manual.execute({ id: 'switch', label: 'Add room switch', source: 'human', baseRevision: manual.revision, operations: switchOps }, true).ok, 'Manual switch applies atomically through checked commands');
assert(buildCeilingSwitchOperations(manual.scene, 'room').length === 0, 'Existing active control prevents duplicates');
assert(manual.undo().ok && serializeScene(manual.scene) === beforeControl, 'Undo removes the new control and its design assumption together');
assert(manual.redo().ok && manual.scene.project!.components[0]!.control!.targets[0] === 'room', 'Redo restores the same room control');
assert(manual.execute({ id: 'plain', label: 'Restore plain ceiling', source: 'human', baseRevision: manual.revision, operations: buildCeilingDesignOperations(manual.scene, 'room', null) }, true).ok, 'Restoring a plain ceiling does not strand an invalid control reference');

const current = shell(), store = createApartmentStore(current, []), beforeGeneration = serializeScene(store.scene);
const proposal = createReconstructionProposal(store.scene, store.revision, { rooms: current.rooms, walls: current.walls, notes: [] }, true, 'new-generated');
assert(proposal.description.includes('design choices'), 'Generation review identifies starter lighting as design choices');
assert(store.execute(proposal.command, true).ok && !!store.scene.project!.metadata.room!.ceilingDesign, 'Live reconstruction applies decorated ceiling and control');
assert(store.undo().ok && serializeScene(store.scene) === beforeGeneration, 'One reconstruction undo restores the full previous document');
const measured = measuredShell('Measured', [{ name: 'Room', x: 0, z: 0, width: 4, depth: 4, elevation: 0, ceilingHeight: 2.7, zone: 'interior' }], .12, true);
assert(measured.project!.components.some(c => c.control?.targets.includes(measured.rooms[0]!.id)), 'Measured shell includes a room ceiling control');
const traced = tracedShell({ name: 'Traced', outline: [[0, 0], [400, 0], [400, 400], [0, 400]], partitions: [], pixelsPerMetre: 100, origin: [0, 0], height: 2.7, thickness: .12, source: { id: 'trace', name: 'Plan', kind: 'plan' } });
assert(traced.project!.components.some(c => c.control?.targets.includes(traced.rooms[0]!.id)), 'Traced shell includes a room ceiling control');
const humanChoice = shell(); humanChoice.project!.metadata.room!.ceilingDesign = null;
const corrected = structuredClone(generated); corrected.rooms[0]!.name = 'Corrected room';
const merged = mergeReconstruction(humanChoice, corrected, new Set(['room']));
assert(merged.project!.metadata.room!.ceilingDesign === null && !merged.project!.assumptions.some(a => a.property === 'ceilingDesign'), 'Geometry-only correction preserves explicit plain ceiling without importing a claim about the skipped lighting design');
assert(merged.project!.components.length === 0, 'Geometry-only correction does not silently import proposed control components');
assert(!migrateScene(shell()).project!.metadata.room!.ceilingDesign, 'General migration leaves existing plain ceilings alone');
console.log(`Generated ceiling and room switch checks passed (${assertions} assertions).`);
