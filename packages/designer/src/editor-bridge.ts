import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AgentProposal, AssetKind, CatalogAsset, Operation, SceneDocument, SceneObject, Wall as EditorWall } from '../../../apps/editor/src/contracts.js';
import { componentPosition, componentRotation } from '../../../apps/editor/src/core/geometry.js';
import { catalogProduct } from '../../../apps/editor/src/adapters/database-catalog.js';
import { localCatalog } from '../../../apps/editor/src/core/demo.js';
import { buildFinishOperations, type FinishPreset } from '../../../apps/editor/src/core/finish-presets.js';
import { applyRenovationOperation, isRenovationOperation } from '../../../apps/editor/src/core/renovation.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { isRecord, objectFootprint, placementIssues, validateScene } from '../../../apps/editor/src/core/validation.js';
import { parseOps, parseScene, sceneDigest, wallOutward } from './adapter.js';
import { catalogItems } from './catalog.js';
import { outsidePoint } from './local-checks.js';
import type { Opening, Scene, Vec2 } from './scene.js';
import { snapRoomFaces, reconciledWall } from './reconcile-geometry.js';
import { DesignerSession } from './session.js';
import { catalogFunction } from './catalog-function.js';

export interface EditorBridgeOptions {
  customerRequests?: readonly string[];
  /** V2 editor snapshots reconcile by default; legacy v1 callers retain strict conversion. */
  geometryPolicy?: 'strict' | 'reconcile';
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
/** Legacy catalog subtypes may share editor render kinds; native kinds retain exact semantics. */
export const editorKindOf: Record<string, AssetKind> = { desk: 'table', dresser: 'cabinet', wardrobe: 'cabinet', nightstand: 'cabinet', stool: 'chair', ottoman: 'chair', bench: 'chair',
  vase: 'decor', candle: 'decor', sculpture: 'decor', books: 'decor', cushion: 'decor',
  throw_blanket: 'decor', basket: 'decor', tray: 'decor', bowl: 'decor', lantern: 'decor',
  picture_frame: 'decor', toy: 'decor', planter: 'decor', mattress: 'decor', clock: 'wall_art', wall_hanging: 'wall_art',
  crib: 'bed', changing_table: 'dresser', pet_bed: 'decor', blind: 'curtain', towel_rack: 'shelf' };
const swings = { 'in-left': 'inward-left', 'in-right': 'inward-right', 'out-left': 'outward-left', 'out-right': 'outward-right' } as const;
const plan = ([x, z]: Vec2): Vec2 => [x, -z];
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Kind the designer gives an object whose catalog asset it cannot resolve; the model reads it as a fixed obstacle. */
export const UNRECOGNISED_KIND = 'unrecognised';
/** Editor order (width, height, depth) for a stand-in with no usable catalog dimensions. */
const STAND_IN_DIMENSIONS: [number, number, number] = [0.6, 0.9, 0.6];
const assetProbe = { format: 'varpet.editor', version: 1, id: 'asset-probe', name: 'Asset probe', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'probe', name: 'Probe', polygon: [[0, 0], [1, 0], [1, 1], [0, 1]], color: '#ffffff' }], walls: [], objects: [] };
const validAsset = (asset: unknown) => validateScene(assetProbe, [asset as CatalogAsset]).ok;

export interface BridgeCatalog {
  /** Valid supplied assets plus a stand-in for every asset the scene references but the catalog cannot supply. */
  catalog: CatalogAsset[];
  /** Valid supplied assets only: purchases resolve against these, never against a stand-in. */
  known: CatalogAsset[];
  /** Objects converted as fixed obstacles: unknown assets and anything resting on them. */
  unrecognised: Set<string>;
}

/** One object with an unknown or invalid catalog asset must not make the whole flat unreadable. Its asset gets
 * a stand-in (the supplied record's dimensions when they are usable) so the editor checks still run, and the
 * designer keeps the object where it is as a fixed obstacle. Invalid, unreferenced catalog records are dropped. */
export function bridgeCatalog(input: unknown, catalog: CatalogAsset[]): BridgeCatalog {
  const known: CatalogAsset[] = [], ids = new Set<string>();
  for (const asset of Array.isArray(catalog) ? catalog : []) if (isRecord(asset) && typeof asset.id === 'string' && !ids.has(asset.id) && validAsset(asset)) { known.push(asset); ids.add(asset.id); }
  const objects = isRecord(input) && Array.isArray(input.objects) ? input.objects.filter(isRecord) : [];
  const standIns = new Map<string, CatalogAsset>(), unrecognised = new Set<string>();
  for (const object of objects) {
    if (typeof object.assetId !== 'string' || ids.has(object.assetId) || typeof object.id !== 'string') continue;
    unrecognised.add(object.id);
    if (standIns.has(object.assetId)) continue;
    const raw = (Array.isArray(catalog) ? catalog : []).find(asset => isRecord(asset) && asset.id === object.assetId) as Record<string, unknown> | undefined;
    const dimensions = Array.isArray(raw?.dimensions) && raw.dimensions.length === 3 && raw.dimensions.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0.01 && value <= 20)
      ? raw.dimensions as [number, number, number] : STAND_IN_DIMENSIONS;
    // The stand-in's kind only has to satisfy the editor's mount rules for how this object is placed.
    const [kind, name] = object.hangsFrom === 'ceiling' ? ['plant', 'Unrecognised hanging plant'] as const
      : object.host !== undefined ? ['wall_art', 'Unrecognised wall item'] as const : ['decor', 'Unrecognised item'] as const;
    standIns.set(object.assetId, { id: object.assetId, name, category: UNRECOGNISED_KIND, kind, dimensions: [...dimensions], color: '#9a9a9a', price: 0, source: { type: 'procedural' } });
  }
  // With no usable catalog at all nothing can be identified: that is a missing catalog, not one odd object.
  if (unrecognised.size && !known.length) throw new Error('Invalid editor scene: no usable catalog was supplied for its furniture assets');
  // Furniture standing on an unrecognised piece stays with it.
  for (let grew = true; grew;) {
    grew = false;
    for (const object of objects) if (typeof object.id === 'string' && typeof object.restsOn === 'string' && unrecognised.has(object.restsOn) && !unrecognised.has(object.id)) { unrecognised.add(object.id); grew = true; }
  }
  return { catalog: [...known, ...standIns.values()], known, unrecognised };
}

function validatedEditor(input: unknown, catalog: CatalogAsset[]): SceneDocument {
  const validation = validateScene(input, catalog);
  if (!validation.ok) throw new Error(`Invalid editor scene: ${validation.errors.join(' ')}`);
  return structuredClone(input as SceneDocument);
}

function checkSupported(scene: SceneDocument, options: EditorBridgeOptions, unrecognised: ReadonlySet<string> = new Set()): void {
  if(options.geometryPolicy!==undefined&&!['strict','reconcile'].includes(options.geometryPolicy))throw new Error("Unsupported geometryPolicy");
  if (options.groupPolicy !== undefined && !['preserve', 'move-together'].includes(options.groupPolicy)) throw new Error('Unsupported groupPolicy; use preserve or move-together');
  if (options.northDeg !== undefined && !Number.isFinite(options.northDeg)) throw new Error('northDeg must be finite');
  if (options.catalogCurrency !== undefined && options.catalogCurrency !== 'AMD') throw new Error('Only explicitly identified AMD catalog prices are supported');
  for (const id of options.keep ?? []) if (!scene.objects.some(object => object.id === id)) throw new Error(`Unknown keep object: ${id}`);
  const openings = scene.walls.flatMap(wall => wall.openings);
  for (const [id, swing] of Object.entries(options.doorSwings ?? {})) {
    if (!openings.some(opening => opening.id === id && opening.kind === 'door')) throw new Error(`Unknown door swing ID: ${id}`);
    if (!Object.hasOwn(swings, swing)) throw new Error(`Unsupported door swing: ${swing}`);
  }
  // Furniture resting on furniture (restsOn), wall-hung (host) and ceiling-hung items are elevated by contract.
  for (const object of scene.objects) if (!unrecognised.has(object.id) && Math.abs(object.position[1]) > EPS && object.restsOn === undefined && object.host === undefined && object.hangsFrom !== 'ceiling') throw new Error(`Unsupported elevated object: ${object.id}`);
  for (const opening of openings) if (opening.kind === 'door' && opening.sill > EPS) throw new Error(`Unsupported elevated door: ${opening.id}`);
  const project = scene.project;
  if (!project) return;
  for (const [id, metadata] of Object.entries(project.metadata)) {
    if (metadata.elevation !== undefined && Math.abs(metadata.elevation) > EPS) throw new Error(`Unsupported elevation on ${id}`);
    if (metadata.phase === 'remove' || metadata.phase === 'replace') throw new Error(`Unsupported renovation phase ${metadata.phase} on ${id}`);
    if ((metadata.threshold ?? 0) > EPS) throw new Error(`Unsupported raised threshold on ${id}`);
    const opening = openings.find(candidate => candidate.id === id);
    if (opening?.kind === 'door' && (metadata.mechanism !== undefined || metadata.hinge !== undefined || metadata.swing !== undefined)
      && options.doorSwings?.[id] === undefined
      && !(metadata.mechanism==='hinged'&&metadata.hinge!==undefined&&metadata.swing!==undefined)) throw new Error(`Door ${id} has renovation mechanism metadata; provide an explicit supported door swing`);
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

/** Use the existing global structural-solid path for fixtures and conservative route prisms.
 * Height is retained, so overhead equipment does not consume floor-level furniture space.
 * Even planned removals stay fixed until the editor actually removes them from the snapshot. */
function addServiceObstacles(editor: SceneDocument, scene: Scene): void {
  if (!editor.project) return;
  const ids = new Set([...scene.rooms, ...scene.walls, ...scene.openings, ...scene.fixed, ...editor.objects].map(value => value.id));
  const add = (source: string, name: string, pos: Vec2, rot: number, size: [number, number, number], bottom: number) => {
    const top = bottom + size[2];
    if (top <= 0) return; // Entirely below the supported floor plane.
    const owner = scene.rooms.find(room => outsidePoint([pos], room.polygon) === undefined) ?? scene.rooms[0];
    if (!owner) return;
    let id = `structure:${source}`;
    while (ids.has(id)) id += ':';
    ids.add(id);
    scene.fixed.push({ id, name, kind: 'structural_obstacle', room_id: owner.id, pos, rot,
      size: [size[0], size[1], top - Math.max(0, bottom)], keep: true,
      structure: { wall_id: source, bottom_m: Math.max(0, bottom) } });
  };
  for (const component of editor.project.components) {
    const [x, y, z] = componentPosition(editor, component), [width, height, depth] = component.dimensions;
    add(component.id, component.name, [x, -z], componentRotation(editor, component) * 180 / Math.PI,
      [width, depth, height], y);
  }
  for (const route of editor.project.routes) {
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1]!, b = route.points[i]!, diameter = route.diameter;
      const dx = b[0] - a[0], dz = b[2] - a[2];
      // Includes end caps and vertical risers, and conservatively encloses sloping runs.
      add(`${route.id}:${i - 1}`, route.name, [(a[0] + b[0]) / 2, -(a[2] + b[2]) / 2],
        Math.atan2(-dz, dx) * 180 / Math.PI,
        [Math.hypot(dx, dz) + diameter, diameter, Math.abs(b[1] - a[1]) + diameter],
        Math.min(a[1], b[1]) - diameter / 2);
    }
  }
}

/** A floor-standing object the bridge cannot identify stays where it is as a fixed obstacle of its known footprint.
 * Hung pieces and pieces standing on it take no floor and are left out; the designer cannot move or buy them. */
function addUnrecognised(scene: Scene, object: SceneDocument['objects'][number], asset: CatalogAsset, footprint: Vec2[], options: EditorBridgeOptions): void {
  if (object.host !== undefined || object.hangsFrom !== undefined || object.restsOn !== undefined || !Array.isArray(object.position)) return;
  const pos: Vec2 = [object.position[0], -object.position[2]];
  const room = scene.rooms.find(candidate => outsidePoint(footprint, candidate.polygon) === undefined) ?? scene.rooms.find(candidate => outsidePoint([pos], candidate.polygon) === undefined);
  if (!room) return;
  scene.fixed.push({ id: object.id, name: `${object.name} (unrecognised catalog item ${object.assetId}: fixed in place, approximate size)`.slice(0, 300), kind: UNRECOGNISED_KIND,
    room_id: room.id, pos, rot: object.rotation * 180 / Math.PI, size: [asset.dimensions[0] * object.scale[0], asset.dimensions[2] * object.scale[2], asset.dimensions[1] * object.scale[1]], keep: true,
    ...(object.groupId !== undefined && options.groupPolicy === 'move-together' ? { group_id: object.groupId } : {}) });
}

/** Convert a validated snapshot; functional subtypes require catalog evidence,
 * while orientation and currency must be supplied explicitly. */
export function editorToDesigner(input: unknown, options: EditorBridgeOptions = {}): Scene {
  const { catalog, unrecognised } = bridgeCatalog(input, options.catalog ?? localCatalog);
  let editor = validatedEditor(input, catalog);
  const reconciliation = (options.geometryPolicy ?? (editor.version === 2 ? "reconcile" : "strict")) === "reconcile" ? snapRoomFaces(editor) : undefined;
  if(reconciliation)editor=reconciliation.editor;
  checkSupported(editor, options, unrecognised);
  const blocking = placementIssues(editor, catalog).filter(issue => issue.blocking && !unrecognised.has(issue.entityId));
  if (blocking.length) throw new Error(`Unsupported editor placement: ${blocking.map(issue => issue.message).join(' ')}`);
  const zone = (id: string) => { const value = editor.project?.metadata[id]?.zone; return value && value !== 'interior' ? { zone: value } : {}; };
  const scene: Scene = { rooms: editor.rooms.map(room => ({ id: room.id, name: room.name, polygon: room.polygon.map(plan), ...zone(room.id) })), walls: [], openings: [], items: [], fixed: [] };
  if (options.northDeg !== undefined) scene.north_deg = options.northDeg;
  if(reconciliation)scene.geometry_audit=reconciliation.audit;
  for (const wall of editor.walls) {
    const spans = reconciliation ? reconciledWall(wall,editor,scene,reconciliation.audit) : wallSpans(wall, editor), length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
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
      if(reconciliation?.audit.opening_room_ids[opening.id])converted.room_ids=reconciliation.audit.opening_room_ids[opening.id];
      const swing = options.doorSwings?.[opening.id];
      if (swing !== undefined) converted.swing = swings[swing];
      else if(opening.kind==='door'){
        const metadata=editor.project?.metadata[opening.id];
        if(metadata?.mechanism==='hinged'&&metadata.hinge!==undefined&&metadata.swing!==undefined){
          const ownedWall=scene.walls.find(w=>w.id===span.id)!;
          const out=wallOutward(scene,ownedWall),dx=(wall.end[0]-wall.start[0])/length,dz=(wall.end[1]-wall.start[1])/length;
          // Editor across = [-dz,+dx]; designer reflects Z to -Y. Hinge endpoints retain wall order.
          const inward=metadata.swing*(dz*out[0]+dx*out[1])>0;
          converted.swing=`${inward?'inward':'outward'}-${metadata.hinge}`;
        }
      }
      scene.openings.push(converted);
    }
  }
  addServiceObstacles(editor, scene);
  for (const object of editor.objects) {
    const asset = catalog.find(candidate => candidate.id === object.assetId)!;
    const footprint = objectFootprint(object, asset).map(plan);
    if (unrecognised.has(object.id)) { addUnrecognised(scene, object, asset, footprint, options); continue; }
    const rooms = scene.rooms.filter(room => outsidePoint(footprint, room.polygon) === undefined);
    if (rooms.length !== 1) throw new Error(`Object ${object.id} must fit in exactly one room; spanning or overlapping room ownership is unsupported`);
    const metadata = editor.project?.metadata[object.id];
    scene.items.push({ id: object.id, name: object.name, room_id: rooms[0]!.id, kind: catalogFunction(asset), pos: [object.position[0], -object.position[2]], rot: object.rotation * 180 / Math.PI,
      size: [asset.dimensions[0] * object.scale[0], asset.dimensions[2] * object.scale[2], asset.dimensions[1] * object.scale[1]],
      keep: (options.keep ?? []).includes(object.id) || (object.groupId !== undefined && options.groupPolicy !== 'move-together') || metadata?.locked === true || metadata?.phase === 'retain', sku: asset.id,
      color: object.color ?? asset.color, ...(object.groupId !== undefined && options.groupPolicy === 'move-together' ? { group_id: object.groupId } : {}), ...(object.restsOn === undefined ? {} : { on: object.restsOn }),
      // A floor-leaning mirror keeps its host at y = 0 and still stands on the floor.
      ...(object.hangsFrom === 'ceiling' ? { mount: 'ceiling' as const } : object.host !== undefined && object.position[1] > EPS ? { mount: 'wall' as const } : {}) });
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
  const { catalog, known, unrecognised } = bridgeCatalog(editorInput, options.catalog ?? localCatalog), editor = validatedEditor(editorInput, catalog), scene = editorToDesigner(editor, options);
  if (candidate.base_scene_fingerprint !== sceneDigest(scene)) throw new Error('Stale proposal: source snapshot fingerprint does not match');
  const ops = parseOps(candidate.ops);
  if (ops.length < 1 || ops.length > 100) throw new Error('Editor proposals require 1–100 operations');
  // Resolve purchase provenance before expensive geometry and before constructing an editor command.
  for (const op of ops) if (op.type === 'add') {
    const asset = known.find(candidate => candidate.id === op.item.sku);
    if (!asset) throw new Error(`Addition ${op.item.id} needs a real catalog asset ID in sku`);
    if (options.catalogCurrency !== 'AMD') throw new Error('Purchases require explicit catalogCurrency AMD; catalog currency is otherwise unknown');
    if (!Number.isSafeInteger(asset.price) || op.item.price !== asset.price) throw new Error(`Addition ${op.item.id} must carry the exact catalog price in AMD`);
    if ((op.item.kind !== asset.kind && op.item.kind !== catalogFunction(asset) && editorKindOf[op.item.kind] !== asset.kind) || op.item.size.some((size, index) => Math.abs(size - [asset.dimensions[0], asset.dimensions[2], asset.dimensions[1]][index]!) > EPS)) throw new Error(`Addition ${op.item.id} does not match catalog asset kind and dimensions`);
  }
  const session = new DesignerSession(scene,options.customerRequests);
  session.setIntent(candidate.intent);
  const rechecked = session.propose(ops, candidate.rationale);
  if (!rechecked.ok) throw new Error(`Proposal no longer passes request/layout checks: ${JSON.stringify(rechecked.errors)}`);
  const operations: Operation[] = [], paintedWalls = new Map<string, string>();
  // Current support per item as the ops run; a plain move keeps an item on its support.
  const moved = new Map<string, string | undefined>(scene.items.flatMap(item => item.on === undefined ? [] : [[item.id, item.on] as [string, string]]));
  let finishDraft = structuredClone(editor);
  for (const op of ops) {
    if (op.type === 'remove') operations.push({ type: 'delete', id: op.id });
    else if (op.type === 'move') {
      // y = 0 asks the editor to find the support's top under the footprint centre.
      const support = op.on !== undefined ? op.on : moved.get(op.id);
      operations.push({ type: 'update', id: op.id, ...(support === undefined ? {} : { on: support }), patch: { position: [op.pos[0], 0, -op.pos[1]], ...(op.rot === undefined ? {} : { rotation: op.rot * Math.PI / 180 }) } });
      if (op.on !== undefined) moved.set(op.id, op.on ?? undefined);
    }
    else if (op.type === 'add') {
      if (op.item.group_id !== undefined) throw new Error('Adding furniture to a group is not supported by this bridge');
      operations.push({ type: 'add', ...(op.item.on === undefined ? {} : { on: op.item.on }), object: { id: op.item.id, name: op.item.name, assetId: op.item.sku!, position: [op.item.pos[0], 0, -op.item.pos[1]], rotation: op.item.rot * Math.PI / 180, scale: [1, 1, 1], ...(op.item.color === undefined ? {} : { color: op.item.color }) } });
      if (op.item.on !== undefined) moved.set(op.item.id, op.item.on);
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
  const blocking = placementIssues(preview.scene, catalog).filter(issue => issue.blocking && !unrecognised.has(issue.entityId));
  if (blocking.length) throw new Error(`Translated proposal has unsupported placement: ${blocking.map(issue => issue.message).join(' ')}`);
  return proposal;
}

/** Designer-owned finish and material records carry these id prefixes; the editor adapter accepts floor/ceiling
 * finishes and preset materials only under them. */
export const DESIGN_FINISH_PREFIX = 'spike:', DESIGN_MATERIAL_PREFIX = 'spike-finish:';
export interface DocumentCommandOptions { catalog: CatalogAsset[]; title?: string; description?: string }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, index) => Math.abs(value - b[index]!) < 1e-6);

/** A finished design as a checked, unapplied editor command. `target` is the complete document the design wants;
 * only `owned` objects and light components (the designer's own pieces), `spike:` finishes, room ceiling designs and
 * the materials they use change. Works whether or not an earlier proposal of the same design was applied. */
export function documentCommand(current: SceneDocument, target: SceneDocument, owned: readonly string[], revision: number, options: DocumentCommandOptions): AgentProposal {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Revision must be a nonnegative safe integer');
  const mine = new Set(owned), operations: Operation[] = [];
  if (!current.project && target.project) operations.push({ type: 'migrate-project' });
  const was = new Map(current.objects.filter(object => mine.has(object.id)).map(object => [object.id, object]));
  const wanted = target.objects.filter(object => mine.has(object.id));
  const simple = (object: SceneObject) => object.restsOn === undefined && object.host === undefined && object.hangsFrom === undefined;
  // Re-placed (removed, then added again): anything no longer wanted, anything whose support or wall changed, and,
  // transitively, whatever rests on a re-placed piece (so it lands on the support's new top, not the floor).
  const replaced = new Set<string>(), updates: { id: string; patch: Partial<SceneObject> }[] = [];
  for (const [id, before] of was) {
    const after = wanted.find(object => object.id === id);
    if (!after || !simple(before) || !simple(after) || before.assetId !== after.assetId) { if (!after || !same(before, after)) replaced.add(id); continue; }
    const patch: Partial<SceneObject> = {};
    if (!near(before.position, after.position)) patch.position = after.position;
    if (Math.abs(before.rotation - after.rotation) > 1e-6) patch.rotation = after.rotation;
    if (!near(before.scale, after.scale)) patch.scale = after.scale;
    if (before.color !== after.color && after.color !== undefined) patch.color = after.color;
    if (before.name !== after.name) patch.name = after.name;
    if (Object.keys(patch).length) updates.push({ id, patch });
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const object of [...current.objects, ...wanted]) if (object.restsOn && replaced.has(object.restsOn) && was.has(object.id) && !replaced.has(object.id)) { replaced.add(object.id); grew = true; }
  }
  // Resting pieces leave before their supports; supports arrive before what rests on them (target order).
  const leaving = [...replaced].sort((a, b) => Number(was.get(b)?.restsOn !== undefined) - Number(was.get(a)?.restsOn !== undefined));
  for (const id of leaving) operations.push({ type: 'delete', id });
  for (const { id, patch } of updates) if (!replaced.has(id)) operations.push({ type: 'update', id, patch });
  for (const object of wanted) if (!was.has(object.id) || replaced.has(object.id)) operations.push({ type: 'add', object: structuredClone(object) });

  const before = current.project, after = target.project;
  if (after) {
    const finishes = before?.finishes ?? [], materials = before?.materials ?? [];
    for (const finish of finishes) if (!after.finishes.some(entry => entry.id === finish.id)) operations.push({ type: 'delete-finish', id: finish.id });
    const designed = after.finishes.filter(finish => finish.id.startsWith(DESIGN_FINISH_PREFIX) && !finishes.some(entry => same(entry, finish)));
    for (const id of new Set(designed.map(finish => finish.materialId))) {
      const material = after.materials.find(entry => entry.id === id);
      if (material && !materials.some(entry => same(entry, material))) operations.push({ type: 'upsert-material', material: structuredClone(material) });
    }
    for (const finish of designed) operations.push({ type: 'upsert-finish', finish: structuredClone(finish) });
    for (const room of target.rooms) {
      const design = after.metadata[room.id]?.ceilingDesign;
      if (design !== undefined && !same(design, before?.metadata[room.id]?.ceilingDesign)) operations.push({ type: 'set-metadata', id: room.id, patch: { ceilingDesign: design } });
    }
    for (const component of after.components) if (mine.has(component.id) && !same(component, before?.components.find(entry => entry.id === component.id))) operations.push({ type: 'upsert-component', component: structuredClone(component) });
    for (const component of before?.components ?? []) if (mine.has(component.id) && !after.components.some(entry => entry.id === component.id)) operations.push({ type: 'delete-component', id: component.id });
  }
  if (!operations.length) throw new Error('The design matches the editor already; nothing to apply');
  if (operations.length > 100) throw new Error(`The design needs ${operations.length} editor operations; the limit is 100`);
  const id = `designer-${digest({ current, target, revision })}`;
  const proposal: AgentProposal = { id, title: (options.title ?? 'Designer proposal').slice(0, 160), description: (options.description ?? 'A designed room.').slice(0, 4000),
    command: { id, label: 'Apply the design', source: 'designer', baseRevision: revision, operations } };
  // Private, disposable store: the caller's snapshot is never modified or approved.
  const preview = new EditorStore(current, options.catalog), checked = preview.execute({ ...proposal.command, baseRevision: 0 }, true);
  if (!checked.ok) throw new Error(`Editor rejected the design: ${checked.errors.join(' ')}`);
  return proposal;
}

/** Requests carry only the products their scene uses. Purchases the designer found in the catalog are fetched
 * by id and converted exactly as the editor converts them, so proposalToEditor's checks compare like with like. */
export async function withProposalAssets(input: unknown, catalog: CatalogAsset[], fetchItems: (ids: string[]) => Promise<unknown[]> = catalogItems): Promise<CatalogAsset[]> {
  const candidate = isRecord(input) && input.ok === true ? input.proposal : input;
  const ops: unknown[] = isRecord(candidate) && Array.isArray(candidate.ops) ? candidate.ops : [];
  const known = new Set(catalog.map(asset => asset.id));
  const missing = [...new Set(ops.flatMap(op => isRecord(op) && op.type === 'add' && isRecord(op.item) && typeof op.item.sku === 'string'
    && !known.has(op.item.sku) ? [op.item.sku] : []))];
  if (!missing.length) return catalog;
  let records: unknown[];
  try { records = await fetchItems(missing); }
  catch { throw new Error('Catalog unavailable: the proposed products could not be fetched'); }
  const fetched = records.map(catalogProduct).flatMap(product => product && missing.includes(product.asset.id) ? [product.asset] : []);
  return [...catalog, ...fetched];
}

async function jsonFile(path: string): Promise<unknown> { return JSON.parse(await readFile(path, 'utf8')); }
async function main(args: string[]): Promise<void> {
  const mode = args.shift(), count = mode === 'to-designer' ? 2 : mode === 'to-command' ? 4 : 0;
  if (!count || args.length < count) throw new Error('Usage: editor-bridge.ts to-designer <scene> <out> | to-command <proposal> <scene> <revision> <out> [--catalog file] [--keep id,id] [--north degrees] [--swings file] [--currency AMD]');
  const paths = args.splice(0, count), options: EditorBridgeOptions = { groupPolicy: 'move-together' };
  let customAssets:CatalogAsset[]=[];
  while (args.length) {
    const flag = args.shift(), value = args.shift();
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (flag === '--catalog') options.catalog = await jsonFile(value) as CatalogAsset[];
    else if (flag === '--custom-assets') { const valueParsed=await jsonFile(value); if(!Array.isArray(valueParsed)||valueParsed.some(asset=>!isRecord(asset)||typeof asset.id!=='string'||!/^custom-[a-zA-Z0-9-]+-\d+$/.test(asset.id)))throw new Error('Custom assets must be conversation slot assets'); customAssets=valueParsed as CatalogAsset[]; }
    else if (flag === '--customer-requests') { const valueParsed=await jsonFile(value); if(!Array.isArray(valueParsed)||!valueParsed.every(v=>typeof v==='string'))throw new Error('Customer requests must be strings'); options.customerRequests=valueParsed; }
    else if (flag === '--keep') options.keep = value.split(',').filter(Boolean);
    else if (flag === '--north') options.northDeg = Number(value);
    else if (flag === '--swings') { const parsed = await jsonFile(value); if (!isRecord(parsed)) throw new Error('Door swings must be an object keyed by door ID'); options.doorSwings = parsed as EditorBridgeOptions['doorSwings']; }
    else if (flag === '--currency') { if (value !== 'AMD') throw new Error('Only explicit AMD catalog currency is supported'); options.catalogCurrency = value; }
    else throw new Error(`Unknown option ${flag}`);
  }
  if(customAssets.length){const catalog=options.catalog??localCatalog;if(customAssets.some(asset=>catalog.some(existing=>existing.id===asset.id)))throw new Error('A custom slot cannot replace an existing catalog asset');options.catalog=[...catalog,...customAssets];}
  if (mode === 'to-command') options.catalog = await withProposalAssets(await jsonFile(paths[0]!), options.catalog ?? localCatalog);
  const output = mode === 'to-designer' ? editorToDesigner(await jsonFile(paths[0]!), options) : proposalToEditor(await jsonFile(paths[0]!), await jsonFile(paths[1]!), Number(paths[2]), options);
  await writeFile(paths.at(-1)!, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
