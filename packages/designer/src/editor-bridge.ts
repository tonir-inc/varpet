import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AgentProposal, AssetKind, CatalogAsset, Operation, SceneDocument, Wall as EditorWall } from '../../../apps/editor/src/contracts.js';
import { localCatalog } from '../../../apps/editor/src/core/demo.js';
import { buildFinishOperations, type FinishPreset } from '../../../apps/editor/src/core/finish-presets.js';
import { applyRenovationOperation, isRenovationOperation } from '../../../apps/editor/src/core/renovation.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { isRecord, objectFootprint, placementIssues, validateScene } from '../../../apps/editor/src/core/validation.js';
import { parseOps, parseScene } from './adapter.js';
import { outsidePoint } from './local-checks.js';
import type { Opening, Scene, Vec2 } from './scene.js';
import { DesignerSession } from './session.js';

export interface EditorBridgeOptions {
  catalog?: CatalogAsset[];
  keep?: string[];
  northDeg?: number;
  doorSwings?: Record<string, 'in-left' | 'in-right' | 'out-left' | 'out-right'>;
  /** Catalog prices have no intrinsic currency. Purchases require explicit AMD provenance. */
  catalogCurrency?: 'AMD';
  /** Legacy callers preserve groups; the service CLI opts into rigid group movement. */
  groupPolicy?: 'preserve' | 'move-together';
}

const EPS = 1e-7;
const kinds: Record<AssetKind, string> = { sofa: 'sofa', chair: 'chair', table: 'table', bed: 'bed', cabinet: 'cabinet', lamp: 'lamp', plant: 'plant', rug: 'rug', shelf: 'shelf' };
/** Purchased catalog subtypes share editor render kinds; identity, dimensions and price remain exact. */
const editorKindOf: Record<string, AssetKind> = { desk: 'table', dresser: 'cabinet', wardrobe: 'cabinet', nightstand: 'cabinet', stool: 'chair', ottoman: 'chair', bench: 'chair' };
const swings = { 'in-left': 'inward-left', 'in-right': 'inward-right', 'out-left': 'outward-left', 'out-right': 'outward-right' } as const;
const plan = ([x, z]: Vec2): Vec2 => [x, -z];
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function validatedEditor(input: unknown, catalog: CatalogAsset[]): SceneDocument {
  const validation = validateScene(input, catalog);
  if (!validation.ok) throw new Error(`Invalid editor scene: ${validation.errors.join(' ')}`);
  return structuredClone(input as SceneDocument);
}

function checkSupported(scene: SceneDocument, options: EditorBridgeOptions): void {
  if (options.groupPolicy !== undefined && !['preserve', 'move-together'].includes(options.groupPolicy)) throw new Error('Unsupported groupPolicy; use preserve or move-together');
  if (options.northDeg !== undefined && !Number.isFinite(options.northDeg)) throw new Error('northDeg must be finite');
  if (options.catalogCurrency !== undefined && options.catalogCurrency !== 'AMD') throw new Error('Only explicitly identified AMD catalog prices are supported');
  for (const id of options.keep ?? []) if (!scene.objects.some(object => object.id === id)) throw new Error(`Unknown keep object: ${id}`);
  const openings = scene.walls.flatMap(wall => wall.openings);
  for (const [id, swing] of Object.entries(options.doorSwings ?? {})) {
    if (!openings.some(opening => opening.id === id && opening.kind === 'door')) throw new Error(`Unknown door swing ID: ${id}`);
    if (!Object.hasOwn(swings, swing)) throw new Error(`Unsupported door swing: ${swing}`);
  }
  for (const object of scene.objects) if (Math.abs(object.position[1]) > EPS) throw new Error(`Unsupported elevated object: ${object.id}`);
  for (const opening of openings) if (opening.kind === 'door' && opening.sill > EPS) throw new Error(`Unsupported elevated door: ${opening.id}`);
  const project = scene.project;
  if (!project) return;
  if (project.components.length || project.routes.length) throw new Error('Building components and service-route obstacles are not represented by the designer bridge');
  for (const [id, metadata] of Object.entries(project.metadata)) {
    if (metadata.elevation !== undefined && Math.abs(metadata.elevation) > EPS) throw new Error(`Unsupported elevation on ${id}`);
    if (metadata.phase === 'remove' || metadata.phase === 'replace') throw new Error(`Unsupported renovation phase ${metadata.phase} on ${id}`);
    if ((metadata.threshold ?? 0) > EPS) throw new Error(`Unsupported raised threshold on ${id}`);
    const opening = openings.find(candidate => candidate.id === id);
    if (opening?.kind === 'door' && (metadata.mechanism !== undefined || metadata.hinge !== undefined || metadata.swing !== undefined)
      && options.doorSwings?.[id] === undefined) throw new Error(`Door ${id} has renovation mechanism metadata; provide an explicit supported door swing`);
    if (opening?.kind === 'door' && metadata.mechanism !== undefined && metadata.mechanism !== 'hinged') throw new Error(`Unsupported door mechanism on ${id}: ${metadata.mechanism}`);
  }
}

type Span = { roomId: string; from: number; to: number; id?: string };
function mergeIntervals(intervals: Vec2[]): Vec2[] {
  const merged: Vec2[] = [];
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1] + EPS) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** Assign every metre of shell to its adjacent rooms, keeping shared boundaries in both. */
function wallSpans(wall: EditorWall, scene: SceneDocument): Span[] {
  const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
  const projection = (p: Vec2) => ((p[0] - wall.start[0]) * dx + (p[1] - wall.start[1]) * dz) / length;
  const distance = (p: Vec2) => ((p[0] - wall.start[0]) * dz - (p[1] - wall.start[1]) * dx) / length;
  const spans: Span[] = [];
  for (const room of scene.rooms) {
    const intervals: Vec2[] = [];
    for (const [index, a] of room.polygon.entries()) {
      const b = room.polygon[(index + 1) % room.polygon.length]!;
      const da = distance(a), db = distance(b), half = wall.thickness / 2;
      // Architect polygons trace inner faces; demo polygons trace centrelines.
      // Only parallel edges within the physical wall qualify. Retain their geometry.
      if (Math.abs(da - db) > EPS || Math.abs(da) > half + EPS) continue;
      // Face polygons stop at inside corners. Include the wall's corner cap,
      // but do not broaden existing centreline ownership or erase open gaps.
      const cap = Math.abs(da) > EPS ? half : 0;
      const from = Math.max(0, Math.min(projection(a), projection(b)) - cap), to = Math.min(length, Math.max(projection(a), projection(b)) + cap);
      if (to - from > EPS) intervals.push([from, to]);
    }
    for (const [from, to] of mergeIntervals(intervals)) spans.push({ roomId: room.id, from, to });
  }
  const covered = mergeIntervals(spans.map(span => [span.from, span.to]));
  if (covered.length !== 1 || covered[0]![0] > EPS || covered[0]![1] < length - EPS) throw new Error(`Wall ${wall.id} is not entirely a room boundary; interior obstacles require an explicit supported representation`);
  for (const [index, span] of spans.entries()) span.id = spans.length === 1 ? wall.id : `${wall.id}::${span.roomId}::${index}`;
  return spans;
}

/** Convert a validated editor snapshot without inferring orientation, currency, or furniture function. */
export function editorToDesigner(input: unknown, options: EditorBridgeOptions = {}): Scene {
  const catalog = options.catalog ?? localCatalog, editor = validatedEditor(input, catalog);
  checkSupported(editor, options);
  const blocking = placementIssues(editor, catalog).filter(issue => issue.blocking);
  if (blocking.length) throw new Error(`Unsupported editor placement: ${blocking.map(issue => issue.message).join(' ')}`);
  const scene: Scene = { rooms: editor.rooms.map(room => ({ id: room.id, name: room.name, polygon: room.polygon.map(plan) })), walls: [], openings: [], items: [], fixed: [] };
  if (options.northDeg !== undefined) scene.north_deg = options.northDeg;
  for (const wall of editor.walls) {
    const spans = wallSpans(wall, editor), length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const point = (offset: number): Vec2 => plan([wall.start[0] + (wall.end[0] - wall.start[0]) * offset / length, wall.start[1] + (wall.end[1] - wall.start[1]) * offset / length]);
    const faceColors = ['wall-front', 'wall-back'].map(surface => {
      const finish = editor.project?.finishes.find(finish => finish.entityId === wall.id && finish.surface === surface);
      return (editor.project?.materials.find(material => material.id === finish?.materialId)?.color ?? wall.color).toLowerCase();
    });
    const metadata = editor.project?.metadata[wall.id];
    for (const span of spans) scene.walls.push({ id: span.id!, room_id: span.roomId, a: point(span.from), b: point(span.to), source_id: wall.id, thickness: wall.thickness, height: wall.height,
      keep: metadata?.locked === true || metadata?.phase === 'retain', ...(faceColors[0] === faceColors[1] ? { color: faceColors[0] } : {}) });
    for (const opening of wall.openings) {
      const span = spans.find(candidate => opening.offset >= candidate.from - EPS && opening.offset + opening.width <= candidate.to + EPS);
      if (!span) throw new Error(`Opening ${opening.id} crosses room boundaries and cannot be represented faithfully`);
      const converted: Opening = { id: opening.id, wall_id: span.id!, kind: opening.kind, offset: Math.max(0, opening.offset - span.from), width: opening.width, height: opening.height, sill: opening.sill };
      const swing = options.doorSwings?.[opening.id];
      if (swing !== undefined) converted.swing = swings[swing];
      scene.openings.push(converted);
    }
  }
  for (const object of editor.objects) {
    const asset = catalog.find(candidate => candidate.id === object.assetId)!;
    const footprint = objectFootprint(object, asset).map(plan);
    const rooms = scene.rooms.filter(room => outsidePoint(footprint, room.polygon) === undefined);
    if (rooms.length !== 1) throw new Error(`Object ${object.id} must fit in exactly one room; spanning or overlapping room ownership is unsupported`);
    const metadata = editor.project?.metadata[object.id];
    scene.items.push({ id: object.id, name: object.name, room_id: rooms[0]!.id, kind: kinds[asset.kind], pos: [object.position[0], -object.position[2]], rot: object.rotation * 180 / Math.PI,
      size: [asset.dimensions[0] * object.scale[0], asset.dimensions[2] * object.scale[2], asset.dimensions[1] * object.scale[1]],
      keep: (options.keep ?? []).includes(object.id) || (object.groupId !== undefined && options.groupPolicy !== 'move-together') || metadata?.locked === true || metadata?.phase === 'retain', sku: asset.id,
      color: object.color ?? asset.color, ...(object.groupId !== undefined && options.groupPolicy === 'move-together' ? { group_id: object.groupId } : {}) });
  }
  return parseScene(scene);
}

/** Recheck persisted accepted proposals against the exact snapshot, then produce an unapplied command. */
export function proposalToEditor(input: unknown, editorInput: unknown, revision: number, options: EditorBridgeOptions = {}): AgentProposal {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Revision must be a nonnegative safe integer');
  const candidate = isRecord(input) && input.ok === true ? input.proposal : input;
  if (!isRecord(candidate) || typeof candidate.id !== 'string' || !candidate.id || typeof candidate.rationale !== 'string'
    || candidate.requires_user_acceptance !== true || candidate.application_status !== 'not_applied' || candidate.validation_scope !== 'temporary_designer_scene'
    || !isRecord(candidate.checks) || candidate.checks.ok !== true || !isRecord(candidate.request_check) || candidate.request_check.ok !== true) throw new Error('Only accepted, request-checked, unapplied designer proposals can be translated');
  const catalog = options.catalog ?? localCatalog, editor = validatedEditor(editorInput, catalog), scene = editorToDesigner(editor, options);
  if (candidate.base_scene_fingerprint !== digest(scene)) throw new Error('Stale proposal: source snapshot fingerprint does not match');
  const ops = parseOps(candidate.ops);
  if (ops.length < 1 || ops.length > 100) throw new Error('Editor proposals require 1–100 operations');
  // Resolve purchase provenance before expensive geometry and before constructing an editor command.
  for (const op of ops) if (op.type === 'add') {
    const asset = catalog.find(candidate => candidate.id === op.item.sku);
    if (!asset) throw new Error(`Addition ${op.item.id} needs a real catalog asset ID in sku`);
    if (options.catalogCurrency !== 'AMD') throw new Error('Purchases require explicit catalogCurrency AMD; catalog currency is otherwise unknown');
    if (!Number.isSafeInteger(asset.price) || op.item.price !== asset.price) throw new Error(`Addition ${op.item.id} must carry the exact catalog price in AMD`);
    if ((editorKindOf[op.item.kind] ?? op.item.kind) !== asset.kind || op.item.size.some((size, index) => Math.abs(size - [asset.dimensions[0], asset.dimensions[2], asset.dimensions[1]][index]!) > EPS)) throw new Error(`Addition ${op.item.id} does not match catalog asset kind and dimensions`);
  }
  const session = new DesignerSession(scene);
  session.setIntent(candidate.intent);
  const rechecked = session.propose(ops, candidate.rationale);
  if (!rechecked.ok) throw new Error(`Proposal no longer passes request/layout checks: ${JSON.stringify(rechecked.errors)}`);
  const operations: Operation[] = [], paintedWalls = new Map<string, string>();
  let finishDraft = structuredClone(editor);
  for (const op of ops) {
    if (op.type === 'remove') operations.push({ type: 'delete', id: op.id });
    else if (op.type === 'move') operations.push({ type: 'update', id: op.id, patch: { position: [op.pos[0], 0, -op.pos[1]], ...(op.rot === undefined ? {} : { rotation: op.rot * Math.PI / 180 }) } });
    else if (op.type === 'add') {
      if (op.item.group_id !== undefined) throw new Error('Adding furniture to a group is not supported by this bridge');
      operations.push({ type: 'add', object: { id: op.item.id, name: op.item.name, assetId: op.item.sku!, position: [op.item.pos[0], 0, -op.item.pos[1]], rotation: op.item.rot * Math.PI / 180, scale: [1, 1, 1], ...(op.item.color === undefined ? {} : { color: op.item.color }) } });
    } else if (op.target === 'item') operations.push({ type: 'update', id: op.id, patch: { color: op.color } });
    else {
      const sourceId = scene.walls.find(wall => wall.id === op.id)!.source_id!;
      if (paintedWalls.get(sourceId) === op.color) continue;
      paintedWalls.set(sourceId, op.color);
      const assigned = finishDraft.project?.finishes.some(finish => finish.entityId === sourceId && ['wall-front', 'wall-back'].includes(finish.surface));
      if (!assigned && finishDraft.project?.mode !== 'renovate') operations.push({ type: 'update-wall', id: sourceId, patch: { color: op.color } });
      else {
        const preset: FinishPreset = { id: `designer-paint-${op.color.slice(1)}`, name: `Paint ${op.color}`, category: 'wall', color: op.color, accent: op.color, pattern: 'solid', size: [1, 1], roughness: .94, description: 'Conceptual wall colour; supplier and installation costs are unknown.' };
        for (const surface of ['wall-front', 'wall-back'] as const) {
          const finishOps = buildFinishOperations(finishDraft, preset, sourceId, surface);
          operations.push(...finishOps);
          // Plan the next face against the preceding material/assignment IDs without touching the source.
          for (const operation of finishOps) if (isRenovationOperation(operation)) finishDraft = applyRenovationOperation(finishDraft, operation);
        }
      }
    }
  }
  const id = `designer-${digest({ snapshot: editor, revision, proposal: candidate })}`;
  const proposal: AgentProposal = { id, title: 'Designer layout proposal', description: candidate.rationale, command: { id, label: 'Apply designer layout', source: 'designer', baseRevision: revision, operations } };
  // This store is private and disposable; the caller's snapshot is never modified or approved.
  const preview = new EditorStore(editor, catalog), checked = preview.execute({ ...proposal.command, baseRevision: 0 }, true);
  if (!checked.ok) throw new Error(`Editor rejected translated proposal: ${checked.errors.join(' ')}`);
  const blocking = placementIssues(preview.scene, catalog).filter(issue => issue.blocking);
  if (blocking.length) throw new Error(`Translated proposal has unsupported placement: ${blocking.map(issue => issue.message).join(' ')}`);
  return proposal;
}

async function jsonFile(path: string): Promise<unknown> { return JSON.parse(await readFile(path, 'utf8')); }
async function main(args: string[]): Promise<void> {
  const mode = args.shift(), count = mode === 'to-designer' ? 2 : mode === 'to-command' ? 4 : 0;
  if (!count || args.length < count) throw new Error('Usage: editor-bridge.ts to-designer <scene> <out> | to-command <proposal> <scene> <revision> <out> [--catalog file] [--keep id,id] [--north degrees] [--swings file] [--currency AMD]');
  const paths = args.splice(0, count), options: EditorBridgeOptions = { groupPolicy: 'move-together' };
  while (args.length) {
    const flag = args.shift(), value = args.shift();
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (flag === '--catalog') options.catalog = await jsonFile(value) as CatalogAsset[];
    else if (flag === '--keep') options.keep = value.split(',').filter(Boolean);
    else if (flag === '--north') options.northDeg = Number(value);
    else if (flag === '--swings') { const parsed = await jsonFile(value); if (!isRecord(parsed)) throw new Error('Door swings must be an object keyed by door ID'); options.doorSwings = parsed as EditorBridgeOptions['doorSwings']; }
    else if (flag === '--currency') { if (value !== 'AMD') throw new Error('Only explicit AMD catalog currency is supported'); options.catalogCurrency = value; }
    else throw new Error(`Unknown option ${flag}`);
  }
  const output = mode === 'to-designer' ? editorToDesigner(await jsonFile(paths[0]!), options) : proposalToEditor(await jsonFile(paths[0]!), await jsonFile(paths[1]!), Number(paths[2]), options);
  await writeFile(paths.at(-1)!, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
