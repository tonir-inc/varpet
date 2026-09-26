import { demoScene, localCatalog } from './demo';
import { createReconstructionProposal } from './reconstruction-proposal';
import * as reconstruction from './reconstruction-proposal';
import { createApartmentStore } from './apartment-store';
import { migrateScene, projectSnapshot } from './renovation';
import type { EntityMetadata, StructureAdapter } from '../contracts';

let assertions = 0;
function assert(value: unknown, message: string): asserts value { assertions++; if (!value) throw new Error(message); }
const previous = migrateScene(structuredClone(demoScene));
previous.project!.sources.push({ id:'old-plan', name:'Original plan', kind:'plan', roomId:previous.rooms[0]!.id });
previous.project!.baseline = projectSnapshot(previous);
previous.project!.options.push({ id:'old-option', name:'Furnished option', snapshot:projectSnapshot(previous) });
const source = JSON.stringify(previous);
const result = { rooms:[{id:'new-room',name:'New room',polygon:[[20,20],[24,20],[24,24],[20,24]] as [number,number][],color:'#eeeeee'}],walls:[],notes:['Window positions need review.'] };
const store = createApartmentStore(previous, localCatalog);
const original = JSON.stringify(store.scene);
const proposal = createReconstructionProposal(store.scene, store.revision, result, true, 'live-import');
assert(proposal.command.operations.length === 1 && proposal.command.operations[0]?.type === 'replace-scene', 'A live reconstruction proposes one complete apartment replacement');
const operation = proposal.command.operations[0];
assert(operation.type === 'replace-scene', 'Preview consumes the same replacement scene as Apply');
assert(operation.scene.objects.length === 0, 'Live reconstruction previews contain no previous furniture');
assert(!operation.scene.project?.baseline && !operation.scene.project?.options.length, 'Previous apartment baseline and furnished options cannot return in the new shell');
assert(operation.scene.project?.sources[0]?.id === 'old-plan' && !operation.scene.project.sources[0]?.roomId, 'Original evidence remains available without old room attachments');
assert(proposal.description.includes('empty') && proposal.description.includes(result.notes[0]!), 'Review explains clearing furnishings and preserves architect notes');
assert(JSON.stringify(store.scene) === original && JSON.stringify(previous) === source, 'Generating or dismissing the proposal does not change either scene');
assert(!store.execute(proposal.command, false).ok, 'Reconstruction requires Apply approval');
const applied = store.execute(proposal.command, true);
assert(applied.ok, `A real footprint imports despite furniture lying outside it: ${applied.errors.join(' ')}`);
assert(store.scene.objects.length === 0 && store.scene.rooms[0]?.id === 'new-room', 'Apply commits an empty reconstructed apartment');
assert(store.undo().ok && JSON.stringify(store.scene) === original, 'One undo restores the complete previous furnished apartment');
assert(store.redo().ok && store.scene.objects.length === 0, 'Redo restores the same empty shell');

const metadataResult: Awaited<ReturnType<StructureAdapter['reconstruct']>> = {
  ...result,
  walls: [{ id: 'new-wall', start: [20, 20], end: [24, 20], height: 2.75, thickness: 0.2, color: '#eeeeee',
    openings: [{ id: 'new-entrance', kind: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 }] }],
  metadata: {
    'new-room': { elevation: 0.3, ceilingHeight: 2.75, zone: 'balcony', notes: 'Measured from plan A.' },
    'new-wall': { elevation: 0.3, notes: 'Height checked against photo 2.' },
    'new-entrance': { role: 'entrance', notes: 'Entrance location observed on plan A.' },
  },
};
const metadataStore = createApartmentStore(previous, localCatalog);
const metadataBefore = JSON.stringify(metadataStore.scene);
const metadataProposal = createReconstructionProposal(metadataStore.scene, metadataStore.revision, metadataResult, true, 'metadata-import');
const metadataOperation = metadataProposal.command.operations[0]!;
assert(metadataProposal.command.operations.length === 1 && metadataOperation.type === 'replace-scene', 'Live metadata shares the same complete replacement operation as its shell');
assert(metadataOperation.scene.project?.metadata['new-room']?.elevation === 0.3 && metadataOperation.scene.project.metadata['new-room']?.ceilingHeight === 2.75 && metadataOperation.scene.project.metadata['new-room']?.zone === 'balcony', 'Preview has the split level, measured ceiling and balcony zone');
assert(metadataOperation.scene.project?.metadata['new-wall']?.elevation === 0.3 && metadataOperation.scene.project.metadata['new-wall']?.structuralRole === 'unknown', 'Wall elevations preserve unprovided migration defaults');
assert(metadataOperation.scene.project?.metadata['new-entrance']?.role === 'entrance' && metadataOperation.scene.project.metadata['new-entrance']?.notes === metadataResult.metadata!['new-entrance']!.notes, 'Preview has the entrance role and provenance notes');
assert(metadataOperation.scene.project?.metadata['new-room'] !== metadataResult.metadata!['new-room'], 'Review owns a snapshot of the supplied metadata');
assert(!metadataStore.execute(metadataProposal.command, false).ok && JSON.stringify(metadataStore.scene) === metadataBefore && metadataStore.revision === 0 && !metadataStore.canUndo, 'Rejecting a metadata proposal changes neither the apartment nor its history');
const metadataApplied = metadataStore.execute(metadataProposal.command, true);
assert(metadataApplied.ok, `A valid split-level shell applies: ${metadataApplied.errors.join(' ')}`);
assert(JSON.stringify(metadataStore.scene.project?.metadata) === JSON.stringify(metadataOperation.scene.project?.metadata), 'Apply commits the metadata shown in preview');
assert(metadataStore.undo().ok && JSON.stringify(metadataStore.scene) === metadataBefore, 'One undo restores the prior shell, furniture, metadata and project');
assert(metadataStore.redo().ok && metadataStore.scene.project?.metadata['new-room']?.elevation === 0.3, 'Redo restores the split-level metadata');

for (const [label, invalidMetadata] of [
  ['out-of-range elevation', { 'new-room': { elevation: 21 } }],
  ['missing reference', { 'missing-room': { notes: 'No matching entity.' } }],
] as const) {
  const invalidStore = createApartmentStore(previous, localCatalog);
  const before = JSON.stringify(invalidStore.scene);
  const invalidProposal = createReconstructionProposal(invalidStore.scene, invalidStore.revision, { ...metadataResult, metadata: invalidMetadata }, true, `invalid-${label}`);
  assert(!invalidStore.execute(invalidProposal.command, true).ok && JSON.stringify(invalidStore.scene) === before && invalidStore.revision === 0 && !invalidStore.canUndo, `Invalid ${label} rejects the entire shell and metadata atomically`);
}

const localMetadataStore = createApartmentStore({ ...structuredClone(demoScene), objects: [] }, localCatalog);
const localBefore = JSON.stringify(localMetadataStore.scene);
const localRoomId = localMetadataStore.scene.rooms[0]!.id;
const localMetadata: Record<string, EntityMetadata> = { [localRoomId]: { elevation: 0.3, ceilingHeight: 2.75, notes: 'Measured split level.' } };
const localResult = { rooms: localMetadataStore.scene.rooms, walls: localMetadataStore.scene.walls, notes: ['Local'], metadata: localMetadata };
const localProposal = createReconstructionProposal(localMetadataStore.scene, localMetadataStore.revision, localResult, false, 'local-metadata');
assert(localProposal.command.operations.length === 2 && localProposal.command.operations[0]?.type === 'replace-structure' && localProposal.command.operations[1]?.type === 'set-metadata', 'Local metadata is appended after its structure operation');
assert(localMetadataStore.execute(localProposal.command, true).ok && localMetadataStore.scene.project?.metadata[localRoomId]?.elevation === 0.3, 'Local reconstruction applies its metadata in the shared command');
assert(localMetadataStore.undo().ok && JSON.stringify(localMetadataStore.scene) === localBefore, 'Local shell and metadata undo as one action');
const invalidLocal = createReconstructionProposal(localMetadataStore.scene, localMetadataStore.revision, { ...localResult, metadata: { [localRoomId]: { elevation: 21 } } }, false, 'invalid-local-metadata');
assert(!localMetadataStore.execute(invalidLocal.command, true).ok && JSON.stringify(localMetadataStore.scene) === localBefore, 'Invalid local metadata rejects the shell operation atomically');
const emptyMetadata = createReconstructionProposal(localMetadataStore.scene, localMetadataStore.revision, { ...localResult, metadata: { [localRoomId]: {} } }, false, 'empty-local-metadata');
assert(emptyMetadata.command.operations.length === 1 && localMetadataStore.execute(emptyMetadata.command, true).ok, 'An empty entity metadata object remains a valid no-op');

const mockStore = createApartmentStore(demoScene, localCatalog);
const mockProposal = createReconstructionProposal(mockStore.scene, mockStore.revision, {rooms:mockStore.scene.rooms,walls:mockStore.scene.walls,notes:['Mock']}, false, 'mock-import');
assert(mockProposal.command.operations[0]?.type === 'replace-structure', 'No-URL mock keeps the structure-only operation');
assert(mockStore.execute(mockProposal.command,true).ok && mockStore.scene.objects.length === demoScene.objects.length, 'Mock still preserves existing furniture');
const stale = createReconstructionProposal(mockStore.scene,mockStore.revision,result,true,'stale-import');
assert(mockStore.undo().ok, 'An intervening edit advances the revision');
const beforeStale=JSON.stringify(mockStore.scene);
assert(!mockStore.execute(stale.command,true).ok && JSON.stringify(mockStore.scene)===beforeStale, 'A stale live reconstruction rejects without clearing anything');

assert('previewReconstructionProposal' in reconstruction, 'Reconstruction inspection must execute every proposed operation in a disposable apartment store');
const { previewReconstructionProposal } = reconstruction;
const previewStore = createApartmentStore({ ...structuredClone(demoScene), rooms: result.rooms, walls: [], objects: [] }, localCatalog);
assert(previewStore.execute({ id: 'prepare-preview', label: 'Record previous notes', source: 'human', baseRevision: 0,
  operations: [{ type: 'set-metadata', id: 'new-room', patch: { notes: 'Previous room notes.' } }] }, true).ok, 'Preview exercises a nonzero authoritative revision');
const previewResult: Awaited<ReturnType<StructureAdapter['reconstruct']>> = { ...result, walls: [
  { id: 'cross-horizontal', start: [20, 22], end: [24, 22], height: 2.75, thickness: 0.2, color: '#eeeeee', openings: [] },
  { id: 'cross-vertical', start: [22, 20], end: [22, 24], height: 2.75, thickness: 0.2, color: '#eeeeee', openings: [] },
], metadata: {
  'new-room': { elevation: 0.3, ceilingHeight: 2.75, notes: 'Measured preview notes.' },
  'cross-horizontal': { elevation: 0.3, notes: 'Horizontal wall provenance.' },
  'cross-vertical': { elevation: 0.3 },
} };
const inspectProposal = createReconstructionProposal(previewStore.scene, previewStore.revision, previewResult, false, 'inspect-local');
const beforeInspect = JSON.stringify(previewStore.scene), beforeInspectProposal = JSON.stringify(inspectProposal), beforeInspectRevision = previewStore.revision;
const inspected = previewReconstructionProposal(previewStore.scene, previewStore.revision, inspectProposal, localCatalog);
assert(inspected.project?.metadata['new-room']?.elevation === 0.3 && inspected.project.metadata['new-room']?.notes === 'Measured preview notes.', 'Inspection includes the local set-metadata operations');
assert(inspected.walls.length === 4 && inspected.walls.every(wall => inspected.project?.metadata[wall.id]?.elevation === 0.3), 'Inspection uses apartment normalization and retains metadata on the split wall sections');
assert(JSON.stringify(previewStore.scene) === beforeInspect && previewStore.revision === beforeInspectRevision && JSON.stringify(inspectProposal) === beforeInspectProposal, 'Inspection changes neither the authoritative scene, revision nor proposal command');
assert(previewStore.execute(inspectProposal.command, true).ok && JSON.stringify(previewStore.scene) === JSON.stringify(inspected), 'The entire inspected scene equals the normalized scene subsequently applied');
let stalePreviewError = '';
try { previewReconstructionProposal(previewStore.scene, previewStore.revision, inspectProposal, localCatalog); } catch (error) { stalePreviewError = String(error); }
assert(stalePreviewError.includes('stale'), 'Inspection rejects a proposal from a previous revision');
const invalidInspect = createReconstructionProposal(localMetadataStore.scene, localMetadataStore.revision, { ...localResult, metadata: { [localRoomId]: { elevation: 21 } } }, false, 'invalid-inspect');
const beforeInvalidInspect = JSON.stringify(localMetadataStore.scene), beforeInvalidRevision = localMetadataStore.revision;
let invalidPreviewError = '';
try { previewReconstructionProposal(localMetadataStore.scene, localMetadataStore.revision, invalidInspect, localCatalog); } catch (error) { invalidPreviewError = String(error); }
assert(invalidPreviewError.includes('out of range') && JSON.stringify(localMetadataStore.scene) === beforeInvalidInspect && localMetadataStore.revision === beforeInvalidRevision, 'Inspection rejects invalid metadata without mutating the source scene');
console.log(`Reconstruction proposal checks passed (${assertions} assertions).`);
