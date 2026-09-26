import type { CatalogAsset, SceneDocument, SceneObject, ValidationResult, Vec2, Wall, RenovationProject, RenovationSnapshot } from '../contracts';

import { componentPosition } from './geometry';
import { openingWallObstacles, OPENING_COLLISION_EPS } from './opening-collision';
import { ceilingDesignError, layoutCeilingDesign } from './ceiling-design';
import { hasRoomCeiling } from './heights';

const EPS = 1e-5;
const COORD_LIMIT = 100;
const COLOR = /^#[0-9a-f]{6}$/i;
const KINDS = new Set(['sofa', 'chair', 'table', 'desk', 'bed', 'cabinet', 'wardrobe', 'dresser', 'lamp', 'plant', 'rug', 'shelf', 'toilet', 'sink', 'bathtub', 'shower', 'fridge', 'stove', 'oven', 'washing_machine', 'dryer', 'dishwasher', 'microwave', 'tv', 'monitor', 'computer', 'laptop', 'speaker', 'printer', 'game_console', 'kitchen_cabinet', 'kitchen_counter', 'kitchen_island', 'radiator', 'fan', 'coat_rack', 'shoe_rack']);
type RecordValue = Record<string, unknown>;
type Segment = [Vec2, Vec2];

export function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function text(value: unknown, limit = 120): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}

function vector(value: unknown, size: number, min: number, max: number): value is number[] {
  return Array.isArray(value) && value.length === size && value.every(v => finite(v, min, max));
}

function keys(value: RecordValue, allowed: string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function cross(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(p: Vec2, a: Vec2, b: Vec2): boolean {
  return Math.abs(cross(a, b, p)) <= EPS && p[0] >= Math.min(a[0], b[0]) - EPS
    && p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS
    && p[1] <= Math.max(a[1], b[1]) + EPS;
}

function segmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1];
  const denominator = rx * sz - rz * sx;
  if (Math.abs(denominator) < EPS) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / denominator;
  const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / denominator;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS
    ? [a[0] + t * rx, a[1] + t * rz] : null;
}

function edges(polygon: Vec2[]): Segment[] {
  return polygon.map((point, i) => [point, polygon[(i + 1) % polygon.length]!] as Segment);
}

function simplePolygon(polygon: Vec2[]): boolean {
  let area = 0;
  const sides = edges(polygon);
  for (let i = 0; i < sides.length; i++) {
    const [a, b] = sides[i]!;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) return false;
    area += a[0] * b[1] - b[0] * a[1];
    for (let j = i + 1; j < sides.length; j++) {
      if (j === i + 1 || (i === 0 && j === sides.length - 1)) continue;
      const [c, d] = sides[j]!;
      if (segmentIntersection(a, b, c, d) || onSegment(a, c, d) || onSegment(c, a, b)) return false;
    }
  }
  return Math.abs(area) > 0.02;
}

/** Exact vertical decomposition checks the entire rectangular footprint against a union of simple floor polygons. */
export function floorSupported(object: SceneObject, asset: CatalogAsset, scene: SceneDocument): boolean {
  const halfX = asset.dimensions[0] * object.scale[0] / 2;
  const halfZ = asset.dimensions[2] * object.scale[2] / 2;
  const cosine = Math.cos(object.rotation), sine = Math.sin(object.rotation);
  const polygons = scene.rooms.filter(room => scene.project?.metadata[room.id]?.phase !== 'remove' && (scene.version === 1 || Math.abs((scene.project?.metadata[room.id]?.elevation ?? 0) - object.position[1]) < EPS)).map(room => room.polygon.map(([x, z]): Vec2 => {
    const dx = x - object.position[0], dz = z - object.position[2];
    return [cosine * dx - sine * dz, sine * dx + cosine * dz];
  })).filter(p => Math.min(...p.map(v => v[0])) <= halfX + EPS && Math.max(...p.map(v => v[0])) >= -halfX - EPS
    && Math.min(...p.map(v => v[1])) <= halfZ + EPS && Math.max(...p.map(v => v[1])) >= -halfZ - EPS);
  const segments = polygons.flatMap(edges);
  const critical = [-halfX, halfX];
  const addX = (x: number) => { if (x > -halfX + EPS && x < halfX - EPS) critical.push(x); };
  for (const [a, b] of segments) {
    addX(a[0]);
    if (Math.abs(b[1] - a[1]) > EPS) for (const z of [-halfZ, halfZ]) {
      const t = (z - a[1]) / (b[1] - a[1]);
      if (t > 0 && t < 1) addX(a[0] + t * (b[0] - a[0]));
    }
  }
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const hit = segmentIntersection(...segments[i]!, ...segments[j]!);
    if (hit && hit[1] >= -halfZ - EPS && hit[1] <= halfZ + EPS) addX(hit[0]);
  }
  critical.sort((a, b) => a - b);
  for (let i = 0; i < critical.length - 1; i++) {
    if (critical[i + 1]! - critical[i]! < EPS) continue;
    const x = (critical[i + 1]! + critical[i]!) / 2;
    const intervals: Vec2[] = [];
    for (const polygon of polygons) {
      const crossings: number[] = [];
      for (const [a, b] of edges(polygon)) if ((a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x)) {
        crossings.push(a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0]));
      }
      crossings.sort((a, b) => a - b);
      for (let j = 0; j + 1 < crossings.length; j += 2) intervals.push([crossings[j]!, crossings[j + 1]!]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let covered = -halfZ;
    for (const [low, high] of intervals) {
      if (high < covered - EPS) continue;
      if (low > covered + EPS) break;
      covered = Math.max(covered, high);
    }
    if (covered < halfZ - EPS) return false;
  }
  return true;
}

export function objectFootprint(object: SceneObject, asset: CatalogAsset): Vec2[] {
  const x = asset.dimensions[0] * object.scale[0] / 2, z = asset.dimensions[2] * object.scale[2] / 2;
  const cosine = Math.cos(object.rotation), sine = Math.sin(object.rotation);
  return ([[-x, -z], [x, -z], [x, z], [-x, z]] as Vec2[]).map(([dx, dz]) =>
    [object.position[0] + cosine * dx + sine * dz, object.position[2] - sine * dx + cosine * dz]);
}

export function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const [start, end] of [...edges(a), ...edges(b)]) {
    const axis: Vec2 = [start[1] - end[1], end[0] - start[0]];
    const projectionA = a.map(p => p[0] * axis[0] + p[1] * axis[1]);
    const projectionB = b.map(p => p[0] * axis[0] + p[1] * axis[1]);
    if (Math.max(...projectionA) <= Math.min(...projectionB) + EPS || Math.max(...projectionB) <= Math.min(...projectionA) + EPS) return false;
  }
  return true;
}

export function wallFootprint(wall: Wall, from: number, to: number): Vec2[] {
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const dx = (wall.end[0] - wall.start[0]) / length, dz = (wall.end[1] - wall.start[1]) / length;
  const h = wall.thickness / 2;
  return [[from, -h], [to, -h], [to, h], [from, h]].map(([along, across]) =>
    [wall.start[0] + dx * along! - dz * across!, wall.start[1] + dz * along! + dx * across!]);
}

export function wallCollision(object: SceneObject, asset: CatalogAsset, wall: Wall, footprint: Vec2[], elevation = 0): boolean {
  if (object.position[1] + asset.dimensions[1] * object.scale[1] <= elevation + EPS || object.position[1] >= elevation + wall.height - EPS) return false;
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  if (!polygonsOverlap(footprint, wallFootprint(wall, 0, length))) return false;
  const objectHeight = asset.dimensions[1] * object.scale[1];
  const passages = wall.openings.filter(o => o.kind === 'door' && elevation + o.sill <= object.position[1] + EPS && elevation + o.sill + o.height >= object.position[1] + objectHeight - EPS)
    .sort((a, b) => a.offset - b.offset);
  let cursor = 0;
  for (const passage of passages) {
    if (passage.offset > cursor + EPS && polygonsOverlap(footprint, wallFootprint(wall, cursor, passage.offset))) return true;
    cursor = passage.offset + passage.width;
  }
  return cursor < length - EPS && polygonsOverlap(footprint, wallFootprint(wall, cursor, length));
}

export function validateScene(input: unknown, catalog: CatalogAsset[]): ValidationResult {
  const errors: string[] = [], warnings: string[] = [];
  const fail = (message: string) => { if (errors.length < 40) errors.push(message); };
  const result = (): ValidationResult => ({ ok: errors.length === 0, errors, warnings });
  if (!isRecord(input)) { fail('Scene must be a JSON object.'); return result(); }
  if (!keys(input, ['format', 'version', 'id', 'name', 'units', 'upAxis', 'rooms', 'walls', 'objects', 'project'])) fail('Scene contains unsupported fields.');
  if (input.format !== 'varpet.editor' || (input.version !== 1 && input.version !== 2)) fail('Unsupported scene format or version. Expected varpet.editor version 1 or 2.');
  if (input.version === 1 && input.project !== undefined) fail('Version 1 scenes cannot contain renovation project data.');
  if (input.version === 2 && !isRecord(input.project)) fail('Version 2 scenes require renovation project data.');
  if (input.units !== 'm' || input.upAxis !== 'Y') fail('Scene must use metres and the Y-up axis.');
  if (!text(input.id, 100) || !text(input.name)) fail('Scene needs a valid ID and name.');
  if (!Array.isArray(input.rooms) || input.rooms.length < 1 || input.rooms.length > 32) fail('Scene needs between 1 and 32 floor rooms.');
  if (!Array.isArray(input.walls) || input.walls.length > 160) fail('Walls must be an array of at most 160 segments.');
  if (!Array.isArray(input.objects) || input.objects.length > 400) fail('Objects must be an array of at most 400 furnishings.');
  if (errors.length) return result();
  const assets = new Map<string, CatalogAsset>();
  if (!Array.isArray(catalog) || catalog.length > 1000) { fail('Catalog is unavailable or too large.'); return result(); }
  for (const asset of catalog) {
    if (!isRecord(asset) || !text(asset.id, 100) || !text(asset.name) || !text(asset.category, 80) || !KINDS.has(asset.kind)
      || !vector(asset.dimensions, 3, 0.01, 20) || typeof asset.color !== 'string' || !COLOR.test(asset.color) || !finite(asset.price, 0, 1e7)
      || !isRecord(asset.source) || (asset.source.type !== 'procedural' && asset.source.type !== 'gltf')
      || (asset.source.type === 'gltf' && (!text(asset.source.url, 2048) || !/^(https?:\/\/|\/[^/]|\.\.?\/)/.test(asset.source.url)))) {
      fail('Catalog contains an invalid asset.'); continue;
    }
    if (assets.has(asset.id)) fail(`Catalog asset ID “${asset.id}” is duplicated.`);
    assets.set(asset.id, asset);
  }
  const ids = new Set<string>();
  const unique = (id: unknown, what: string) => {
    if (!text(id, 100)) fail(`${what} needs a valid ID.`);
    else if (ids.has(id)) fail(`ID “${id}” is duplicated.`);
    else ids.add(id);
  };
  for (const [i, room] of (input.rooms as unknown[]).entries()) {
    if (!isRecord(room)) { fail(`Room ${i + 1} must be an object.`); continue; }
    unique(room.id, `Room ${i + 1}`);
    if (!keys(room, ['id', 'name', 'polygon', 'color']) || !text(room.name) || typeof room.color !== 'string' || !COLOR.test(room.color)) fail(`Room ${i + 1} has invalid fields, name, or color.`);
    if (!Array.isArray(room.polygon) || room.polygon.length < 3 || room.polygon.length > 32 || !room.polygon.every(v => vector(v, 2, -COORD_LIMIT, COORD_LIMIT))) fail(`Room ${i + 1} needs 3–32 finite polygon points within ±100 m.`);
    else if (!simplePolygon(room.polygon as Vec2[])) fail(`Room ${i + 1} has a degenerate or self-intersecting floor polygon.`);
  }
  for (const [i, wall] of (input.walls as unknown[]).entries()) {
    if (!isRecord(wall)) { fail(`Wall ${i + 1} must be an object.`); continue; }
    unique(wall.id, `Wall ${i + 1}`);
    if (!keys(wall, ['id', 'start', 'end', 'height', 'thickness', 'color', 'openings']) || !vector(wall.start, 2, -COORD_LIMIT, COORD_LIMIT) || !vector(wall.end, 2, -COORD_LIMIT, COORD_LIMIT)
      || !finite(wall.height, 0.2, 6) || !finite(wall.thickness, 0.02, 1) || typeof wall.color !== 'string' || !COLOR.test(wall.color)
      || !Array.isArray(wall.openings) || wall.openings.length > 16) { fail(`Wall ${i + 1} has invalid geometry, color, or openings.`); continue; }
    const length = Math.hypot(wall.end[0]! - wall.start[0]!, wall.end[1]! - wall.start[1]!);
    if (length < 0.05 || length > 100) fail(`Wall ${i + 1} must be between 0.05 and 100 m long.`);
    const openingIntervals: Vec2[] = [];
    for (const opening of wall.openings) {
      if (!isRecord(opening)) { fail(`Wall ${i + 1} contains an invalid opening.`); continue; }
      unique(opening.id, `Wall ${i + 1} opening`);
      if (!keys(opening, ['id', 'kind', 'offset', 'width', 'height', 'sill']) || typeof opening.kind !== 'string' || !['door', 'window'].includes(opening.kind)
        || !finite(opening.offset, 0, length) || !finite(opening.width, 0.2, length) || !finite(opening.height, 0.2, wall.height)
        || !finite(opening.sill, 0, wall.height) || opening.offset + opening.width > length + EPS || opening.sill + opening.height > wall.height + EPS
        || (input.version === 1 && opening.kind === 'door' && opening.sill > EPS)) { fail(`Wall ${i + 1} has an opening outside its bounds or an unsupported raised door.`); continue; }
      openingIntervals.push([opening.offset, opening.offset + opening.width]);
    }
    openingIntervals.sort((a, b) => a[0] - b[0]);
    if (openingIntervals.some((interval, index) => index > 0 && interval[0] < openingIntervals[index - 1]![1] - EPS)) fail(`Wall ${i + 1} has overlapping openings.`);
  }
  const groupCounts = new Map<string, number>();
  for (const [i, object] of (input.objects as unknown[]).entries()) {
    if (!isRecord(object)) { fail(`Object ${i + 1} must be an object.`); continue; }
    unique(object.id, `Object ${i + 1}`);
    if (!keys(object, ['id', 'name', 'assetId', 'position', 'rotation', 'scale', 'color', 'groupId']) || !text(object.name) || !text(object.assetId, 100)
      || !vector(object.position, 3, -COORD_LIMIT, COORD_LIMIT) || !finite(object.rotation, -Math.PI * 100, Math.PI * 100)
      || !vector(object.scale, 3, 0.1, 4) || (object.color !== undefined && (typeof object.color !== 'string' || !COLOR.test(object.color)))) { fail(`Object ${i + 1} has invalid fields or a non-finite/out-of-range transform.`); continue; }
    if (object.groupId !== undefined) {
      if (input.version !== 2 || !text(object.groupId, 100) || ['__proto__', 'prototype', 'constructor'].includes(object.groupId)) fail(`Object ${i + 1} needs a valid v2 furniture group ID.`);
      else groupCounts.set(object.groupId, (groupCounts.get(object.groupId) ?? 0) + 1);
    }
    const asset = assets.get(object.assetId);
    if (!asset) fail(`“${object.name}” references unknown catalog asset “${object.assetId}”.`);
    if (input.version === 1 && Math.abs(object.position[1]!) > EPS) fail(`“${object.name}” must be supported on the floor at y = 0.`);
    const scale = object.scale;
    if (asset && asset.dimensions.some((size, index) => size * scale[index]! > 20)) fail(`“${object.name}” is larger than the 20 m object limit.`);
  }
  if (errors.length) return result();
  for (const [id, count] of groupCounts) if (count < 2) fail(`Furniture group “${id}” needs at least two objects.`);
  if (errors.length) return result();
  const scene = input as unknown as SceneDocument;
  if (scene.version === 2) {
    try { validateProject(scene, catalog).forEach(fail); }
    catch { fail('Project contains malformed nested data. Check its entities and evidence references.'); }
    if (errors.length) return result();
  }
  for (const wall of scene.walls) for (const opening of wall.openings) {
    const obstacle = openingWallObstacles(scene, wall, opening).find(span =>
      opening.offset < span.end - OPENING_COLLISION_EPS && opening.offset + opening.width > span.start + OPENING_COLLISION_EPS);
    if (obstacle) fail(`${opening.kind === 'door' ? 'Door' : 'Window'} “${opening.id}” intersects wall “${obstacle.wallId}”. Move or resize the opening to keep it clear of that wall.`);
  }
  if (errors.length) return result();
  const floorVertices = scene.rooms.reduce((total, room) => total + room.polygon.length, 0);
  if (floorVertices > 192 || scene.objects.length * floorVertices * floorVertices > 1_500_000) {
    fail('This floor plan is too complex to validate interactively. Simplify room polygons or split the scene into smaller apartments.');
    return result();
  }
  for (const issue of placementIssues(scene, catalog)) {
    if (issue.blocking && scene.version === 1) fail(issue.message); else warnings.push(issue.message);
  }
  return result();
}

export interface PlacementIssue { entityId: string; kind: 'support' | 'wall' | 'overlap'; message: string; blocking: boolean }
/** For validated documents: shared deterministic checks for commands and persistent review issues. */
export function placementIssues(scene: SceneDocument, catalog: CatalogAsset[]): PlacementIssue[] {
  const result: PlacementIssue[] = [], footprints = new Map<string, Vec2[]>();
  const assets = new Map(catalog.map(asset => [asset.id, asset]));
  const objects = scene.objects.filter(object => scene.project?.metadata[object.id]?.phase !== 'remove');
  for (const object of objects) {
    const asset = assets.get(object.assetId); if (!asset) continue;
    const footprint = objectFootprint(object, asset); footprints.set(object.id, footprint);
    if (!floorSupported(object, asset, scene)) result.push({entityId:object.id,kind:'support',blocking:true,message:`“${object.name}” must fit completely inside the floor plan${scene.version === 2 ? ' at the room’s floor elevation' : ''}.`});
    const collision = scene.walls.find(wall => scene.project?.metadata[wall.id]?.phase !== 'remove' && wallCollision(object, asset, wall, footprint, scene.project?.metadata[wall.id]?.elevation ?? 0));
    if (collision) result.push({entityId:object.id,kind:'wall',blocking:true,message:`“${object.name}” intersects wall “${collision.id}”. Move it clear of the wall or into a door opening.`});
  }
  let overlapCount = 0;
  for (let i = 0; i < objects.length; i++) for (let j = i + 1; j < objects.length; j++) {
    const a = objects[i]!, b = objects[j]!, assetA = assets.get(a.assetId), assetB = assets.get(b.assetId);
    if (!assetA || !assetB || assetA.kind === 'rug' || assetB.kind === 'rug' || overlapCount >= 8) continue;
    if (a.position[1] >= b.position[1] + assetB.dimensions[1] * b.scale[1] || b.position[1] >= a.position[1] + assetA.dimensions[1] * a.scale[1]) continue;
    if (polygonsOverlap(footprints.get(a.id)!, footprints.get(b.id)!)) { result.push({entityId:a.id,kind:'overlap',blocking:false,message:`“${a.name}” and “${b.name}” overlap; check their placement.`}); overlapCount++; }
  }
  return result;
}

const PHASES = ['existing', 'retain', 'remove', 'new', 'replace'];
const COMPONENT_KINDS = ['column', 'beam', 'shaft', 'railing', 'step', 'ceiling', 'light', 'switch', 'outlet', 'panel', 'junction', 'sink', 'toilet', 'shower', 'bath', 'drain', 'valve', 'riser', 'radiator', 'ac', 'vent', 'thermostat', 'cabinet', 'worktop', 'appliance', 'smoke-detector', 'security', 'network', 'gas-point', 'access-panel'];
const SYSTEMS = ['electrical', 'water-hot', 'water-cold', 'waste', 'ventilation', 'heating', 'gas', 'data'];
const METADATA_KEYS = ['name', 'structuralRole', 'boundary', 'phase', 'locked', 'review', 'material', 'zone', 'elevation', 'ceilingHeight', 'ceilingDesign', 'role', 'mechanism', 'hinge', 'swing', 'leafThickness', 'frameWidth', 'threshold', 'notes'];
const inEnum = (value: unknown, values: string[]) => typeof value === 'string' && values.includes(value);
const strings = (value: unknown, max = 100): value is string[] => Array.isArray(value) && value.length <= max && value.every(v => text(v, 100));
const optionalText = (value: unknown, max = 2000) => value === undefined || (typeof value === 'string' && value.length <= max);
const optionalEnum = (value: unknown, values: string[]) => value === undefined || inEnum(value, values);

/** Operation shape validation is separate from final-document validation so ignored patches cannot sneak through. */
export function renovationOperationError(op: Record<string, unknown>): string | null {
  const allowed: Record<string, string[]> = {
    'migrate-project': [], 'update-wall': ['id', 'patch'], 'add-wall': ['wall'], 'delete-wall': ['id'],
    'split-wall': ['id', 'offset', 'newId'], 'join-walls': ['id', 'otherId'],
    'add-opening': ['wallId', 'opening'], 'update-opening': ['id', 'patch'], 'delete-opening': ['id'],
    'add-room': ['room'], 'update-room': ['id', 'patch'], 'delete-room': ['id'], 'set-metadata': ['id', 'patch'],
    'set-project': ['patch'], 'capture-baseline': [], 'restore-baseline': [], 'create-option': ['id', 'name'], 'switch-option': ['id'], 'delete-option': ['id'],
  };
  for (const entity of ['component', 'route', 'source', 'assumption', 'material', 'finish', 'task']) { allowed[`upsert-${entity}`] = [entity]; allowed[`delete-${entity}`] = ['id']; }
  if (typeof op.type !== 'string' || !Object.hasOwn(allowed, op.type)) return 'Command contains an unsupported operation.';
  const fields = allowed[op.type]!;
  if (!keys(op, ['type', ...fields]) || fields.some(field => op[field] === undefined)) return 'Operation contains missing or unsupported fields.';
  for (const field of ['id', 'wallId', 'newId', 'otherId']) if (op[field] !== undefined && (!text(op[field], 100) || ['__proto__', 'prototype', 'constructor'].includes(op[field] as string))) return 'Operation requires a valid entity ID.';
  if (op.name !== undefined && !text(op.name, 120)) return 'Option requires a valid name.';
  if (op.offset !== undefined && !finite(op.offset, 0.05, 100)) return 'Split offset must be a finite distance.';
  if (op.patch !== undefined) {
    if (!isRecord(op.patch) || !Object.keys(op.patch).length) return 'Operation requires a non-empty property patch.';
    const patches: Record<string, string[]> = { 'update-wall': ['start', 'end', 'height', 'thickness', 'color'], 'update-opening': ['kind', 'offset', 'width', 'height', 'sill'], 'update-room': ['name', 'polygon', 'color'], 'set-metadata': METADATA_KEYS, 'set-project': ['mode', 'currency'] };
    if (!keys(op.patch, patches[op.type] ?? [])) return 'Operation patch contains unsupported fields.';
  }
  for (const field of ['wall', 'opening', 'room', 'component', 'route', 'source', 'assumption', 'material', 'finish', 'task']) if (op[field] !== undefined && !isRecord(op[field])) return `Operation requires a ${field} object.`;
  return null;
}

/** Strict, bounded validation of the deliberate v2 extension, including inactive option snapshots. */
function validateProject(scene: SceneDocument, catalog: CatalogAsset[]): string[] {
  const errors: string[] = [];
  const fail = (message: string) => { if (errors.length < 40) errors.push(message); };
  const project = scene.project as unknown;
  if (!isRecord(project) || !keys(project, ['mode', 'currency', 'metadata', 'components', 'routes', 'sources', 'assumptions', 'materials', 'finishes', 'tasks', 'baseline', 'options', 'activeOptionId'])) return ['Project contains unsupported fields.'];
  if (!inEnum(project.mode, ['correct', 'renovate']) || typeof project.currency !== 'string' || !/^[A-Z]{3}$/.test(project.currency)) fail('Project needs a correction/renovation mode and three-letter currency.');
  if (!isRecord(project.metadata) || Object.keys(project.metadata).length > 2000) fail('Project metadata must be a bounded entity map.');
  const bounds: Record<string, number> = { components: 500, routes: 500, sources: 32, assumptions: 2000, materials: 100, finishes: 1000, tasks: 300, options: 12 };
  for (const [key, max] of Object.entries(bounds)) if (!Array.isArray(project[key]) || (project[key] as unknown[]).length > max) fail(`Project ${key} must be an array with at most ${max} entries.`);
  if (errors.length) return errors;
  const p = project as unknown as RenovationProject;
  const entities = new Set([...scene.rooms, ...scene.walls, ...scene.walls.flatMap(w => w.openings), ...scene.objects].map(x => x.id));
  const allIds = new Set(entities);
  const unique = (value: RecordValue, label: string) => { if (!text(value.id, 100) || ['__proto__', 'prototype', 'constructor'].includes(value.id)) fail(`${label} needs a valid non-reserved ID.`); else if (allIds.has(value.id)) fail(`Project ID “${value.id}” is duplicated.`); else allIds.add(value.id); };
  const checkRecords = (values: unknown[], label: string, fields: string[], check: (value: RecordValue) => void) => {
    for (const value of values) { if (!isRecord(value) || !keys(value, fields)) { fail(`${label} contains invalid or unsupported fields.`); continue; } unique(value, label); check(value); }
  };
  const roomIds = new Set(scene.rooms.map(r => r.id));
  checkRecords(p.components, 'Component', ['id', 'name', 'kind', 'position', 'dimensions', 'rotation', 'color', 'phase', 'host', 'roomId', 'price', 'notes', 'light', 'control', 'clearance'], c => {
    if (!text(c.name) || !inEnum(c.kind, COMPONENT_KINDS) || !vector(c.position, 3, -100, 100) || !vector(c.dimensions, 3, 0.01, 30) || !finite(c.rotation, -Math.PI * 100, Math.PI * 100) || typeof c.color !== 'string' || !COLOR.test(c.color) || !inEnum(c.phase, PHASES) || !optionalText(c.notes) || (c.price !== undefined && !finite(c.price, 0, 1e9)) || (c.clearance !== undefined && !vector(c.clearance, 3, 0, 30))) fail(`Component “${String(c.id)}” has invalid geometry or properties.`);
    if (c.roomId !== undefined && (typeof c.roomId !== 'string' || !roomIds.has(c.roomId))) fail(`Component “${String(c.id)}” references a missing room.`);
    if (c.host !== undefined) {
      if (!isRecord(c.host) || !keys(c.host, ['wallId', 'offset', 'elevation', 'side']) || !text(c.host.wallId, 100) || !finite(c.host.offset, 0, 100) || !finite(c.host.elevation, -10, 20) || ![1, -1].includes(c.host.side as number)) fail(`Component “${String(c.id)}” has an invalid wall mount.`);
      else { const hostWallId = c.host.wallId; const wall = scene.walls.find(w => w.id === hostWallId); if (!wall) fail(`Component “${String(c.id)}” references a missing host wall.`); else if (vector(c.dimensions, 3, 0.01, 30)) { const len = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]); if (c.host.offset < c.dimensions[0]! / 2 - EPS || c.host.offset + c.dimensions[0]! / 2 > len + EPS || c.host.elevation < (p.metadata[wall.id]?.elevation ?? 0) - EPS || c.host.elevation + c.dimensions[1]! > (p.metadata[wall.id]?.elevation ?? 0) + wall.height + EPS) fail(`Component “${String(c.id)}” extends beyond its host wall. Move it or resize the host.`); } }
    }
    if (c.light !== undefined && (c.kind !== 'light' || !isRecord(c.light) || !keys(c.light, ['brightness', 'temperature', 'enabled', 'group']) || !finite(c.light.brightness, 0, 10000) || !finite(c.light.temperature, 1000, 15000) || typeof c.light.enabled !== 'boolean' || !optionalText(c.light.group, 100))) fail(`Component “${String(c.id)}” has invalid light settings.`);
    if (c.control !== undefined && (c.kind !== 'switch' || !isRecord(c.control) || !keys(c.control, ['type', 'targets', 'gangs']) || !inEnum(c.control.type, ['single', 'two-way', 'dimmer', 'multi-gang']) || !strings(c.control.targets, 100) || !Number.isInteger(c.control.gangs) || !finite(c.control.gangs, 1, 12))) fail(`Component “${String(c.id)}” has invalid switch control settings.`);
    if (typeof c.id === 'string') entities.add(c.id);
  });
  checkRecords(p.routes, 'Route', ['id', 'name', 'system', 'points', 'diameter', 'phase', 'from', 'to', 'circuit', 'pricePerMetre', 'notes'], r => {
    if (!text(r.name) || !inEnum(r.system, SYSTEMS) || !Array.isArray(r.points) || r.points.length < 2 || r.points.length > 128 || !r.points.every(point => vector(point, 3, -100, 100)) || !finite(r.diameter, 0.001, 2) || !inEnum(r.phase, PHASES) || !optionalText(r.circuit, 100) || !optionalText(r.notes) || (r.pricePerMetre !== undefined && !finite(r.pricePerMetre, 0, 1e7))) fail(`Route “${String(r.id)}” has invalid geometry or properties.`);
    for (const end of ['from', 'to']) if (r[end] !== undefined && (typeof r[end] !== 'string' || !p.components.some(c => c?.id === r[end]))) fail(`Route “${String(r.id)}” references a missing ${end} component. Disconnect it explicitly before deleting that component.`);
    if (r.from !== undefined && r.from === r.to) fail(`Route “${String(r.id)}” must connect different endpoints.`);
    if (typeof r.id === 'string') entities.add(r.id);
  });
  if (errors.length) return errors;
  if (p.routes.reduce((sum, route) => sum + route.points.length, 0) > 6000) fail('Service routing exceeds the 6000-point interactive project limit.');
  for (const c of p.components) if (c.control && new Set(c.control.targets).size !== c.control.targets.length) fail(`Switch “${c.name}” contains a duplicated light target.`);
  for (const c of p.components) if (c.control) for (const id of c.control.targets) if (!p.components.some(target => target.id === id && target.kind === 'light')) fail(`Switch “${c.name}” references a missing light. Disconnect it explicitly before deleting that light.`);
  const compatible: Record<string, string[]> = {
    electrical: ['panel', 'junction', 'switch', 'outlet', 'light', 'appliance', 'ac', 'vent', 'thermostat', 'smoke-detector', 'security', 'network', 'radiator'],
    'water-hot': ['sink', 'shower', 'bath', 'valve', 'riser', 'appliance'],
    'water-cold': ['sink', 'toilet', 'shower', 'bath', 'valve', 'riser', 'appliance'],
    waste: ['sink', 'toilet', 'shower', 'bath', 'drain', 'riser', 'appliance', 'ac'],
    ventilation: ['vent', 'ac', 'riser', 'appliance'], heating: ['radiator', 'valve', 'riser', 'appliance'],
    gas: ['gas-point', 'valve', 'riser', 'appliance'], data: ['network', 'outlet', 'security', 'thermostat', 'appliance', 'panel'],
  };
  for (const route of p.routes) if (!route.points.slice(1).some((point, i) => Math.hypot(point[0] - route.points[i]![0], point[1] - route.points[i]![1], point[2] - route.points[i]![2]) >= 0.001)) fail(`Route “${route.name}” needs nonzero length.`);
  for (const route of p.routes) for (const [endpoint, pointIndex] of [[route.from, 0], [route.to, route.points.length - 1]] as const) {
    if (!endpoint) continue;
    const component = p.components.find(c => c.id === endpoint)!;
    if (!compatible[route.system]!.includes(component.kind)) fail(`Route “${route.name}” cannot connect ${route.system} to a ${component.kind}.`);
    const position = componentPosition(scene, component), point = route.points[pointIndex]!;
    if (Math.hypot(position[0] - point[0], position[1] - point[1], position[2] - point[2]) > 0.001) fail(`Route “${route.name}” endpoint must coincide with its connected component.`);
  }
  for (const [id, value] of Object.entries(p.metadata)) {
    if (!entities.has(id) || ['__proto__', 'prototype', 'constructor'].includes(id)) fail(`Metadata references a missing or reserved entity “${id}”.`);
    if (!isRecord(value) || !keys(value, METADATA_KEYS)) { fail(`Metadata for “${id}” contains unsupported fields.`); continue; }
    if (!optionalText(value.name, 120) || !optionalText(value.material, 200) || !optionalText(value.notes) || !optionalEnum(value.structuralRole, ['structural', 'partition', 'unknown']) || !optionalEnum(value.boundary, ['interior', 'exterior', 'shared']) || !optionalEnum(value.phase, PHASES) || !optionalEnum(value.review, ['unreviewed', 'required', 'reviewed']) || !optionalEnum(value.zone, ['interior', 'balcony', 'loggia', 'terrace']) || !optionalEnum(value.role, ['entrance', 'interior', 'balcony', 'access']) || !optionalEnum(value.mechanism, ['hinged', 'sliding', 'pocket', 'fixed', 'casement', 'tilt', 'double']) || !optionalEnum(value.hinge, ['left', 'right']) || (value.locked !== undefined && typeof value.locked !== 'boolean') || (value.swing !== undefined && value.swing !== 1 && value.swing !== -1)) fail(`Metadata for “${id}” has invalid properties.`);
    for (const [field, min, max] of [['elevation', -10, 20], ['ceilingHeight', 0.2, 10], ['leafThickness', 0.01, 0.5], ['frameWidth', 0, 0.3], ['threshold', 0, 0.5]] as const) if (value[field] !== undefined && !finite(value[field], min, max)) fail(`Metadata ${id}.${field} is out of range.`);
    if (value.ceilingDesign !== undefined) {
      const room = scene.rooms.find(candidate => candidate.id === id);
      if (!room) fail(`Ceiling design belongs to a room; “${id}” is not a room.`);
      else if (value.ceilingDesign !== null) {
        const error = ceilingDesignError(value.ceilingDesign);
        if (error) fail(`Ceiling design for “${id}”: ${error}`);
        else if (!hasRoomCeiling(scene, room)) fail(`Open-air room “${id}” cannot have a ceiling design. Clear its design first.`);
        else if (value.phase !== 'remove') {
          try { layoutCeilingDesign(scene, room); }
          catch (error) { fail(`Ceiling design for “${id}”: ${error instanceof Error ? error.message : 'Design does not fit this room.'}`); }
        }
      }
    }
  }
  let evidenceSize = 0;
  checkRecords(p.sources, 'Source', ['id', 'name', 'kind', 'notes', 'roomId', 'dataUrl', 'url', 'calibration'], source => {
    if (!text(source.name) || !inEnum(source.kind, ['photo', 'plan', 'measurement', 'document']) || !optionalText(source.notes)) fail(`Source “${String(source.id)}” has invalid properties.`);
    if (source.dataUrl !== undefined) { if (typeof source.dataUrl !== 'string' || source.dataUrl.length > 3_000_000 || !/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/]*={0,2}$/.test(source.dataUrl)) fail(`Source “${String(source.id)}” must contain a PNG/JPEG/WebP/PDF attachment below 3 MB encoded.`); else evidenceSize += source.dataUrl.length; }
    if (source.url !== undefined && (typeof source.url !== 'string' || !/^https?:\/\//.test(source.url) || source.url.length > 2048)) fail(`Source “${String(source.id)}” has an invalid source URL.`);
    if (source.roomId !== undefined && !text(source.roomId, 100)) fail(`Source “${String(source.id)}” has an invalid room reference.`);
    if (source.calibration !== undefined && (!isRecord(source.calibration) || !keys(source.calibration, ['metres', 'pixels', 'origin', 'rotation']) || !finite(source.calibration.metres, 0.001, 1000) || !finite(source.calibration.pixels, 1, 100000) || !vector(source.calibration.origin, 2, -100000, 100000) || !finite(source.calibration.rotation, -Math.PI * 100, Math.PI * 100))) fail(`Source “${String(source.id)}” has invalid calibration.`);
  });
  if (evidenceSize > 18_000_000) fail('Attached evidence exceeds the 18 MB project limit. Keep remaining source files as linked evidence.');
  checkRecords(p.materials, 'Material', ['id', 'name', 'color', 'unit', 'unitCost', 'thickness', 'wastePercent', 'notes'], m => { if (!text(m.name) || typeof m.color !== 'string' || !COLOR.test(m.color) || !inEnum(m.unit, ['m2', 'm', 'each']) || !finite(m.unitCost, 0, 1e7) || !finite(m.thickness, 0, 1) || !finite(m.wastePercent, 0, 100) || !optionalText(m.notes)) fail(`Material “${String(m.id)}” has invalid properties.`); });
  checkRecords(p.finishes, 'Finish', ['id', 'entityId', 'surface', 'materialId'], f => {
    if (!text(f.entityId, 100) || !entities.has(f.entityId) || !inEnum(f.surface, ['floor', 'ceiling', 'wall-front', 'wall-back', 'skirting', 'component']) || !p.materials.some(m => m?.id === f.materialId)) fail(`Finish “${String(f.id)}” references an invalid entity, surface or material.`);
    const material = p.materials.find(m => m?.id === f.materialId);
    const expectedUnit = f.surface === 'skirting' ? 'm' : f.surface === 'component' ? 'each' : 'm2';
    if (material && material.unit !== expectedUnit) fail(`Finish “${String(f.id)}” needs a material priced per ${expectedUnit}.`);
    const room = scene.rooms.some(r => r.id === f.entityId), wall = scene.walls.some(w => w.id === f.entityId), component = p.components.some(c => c.id === f.entityId);
    if ((['floor', 'ceiling'].includes(String(f.surface)) && !room) || (['wall-front', 'wall-back'].includes(String(f.surface)) && !wall) || (f.surface === 'skirting' && !room && !wall) || (f.surface === 'component' && !component)) fail(`Finish “${String(f.id)}” surface does not match its entity.`);
  });
  // Evidence is shared across options. Entity references may target a baseline or an inactive option.
  const evidenceEntities = new Set(entities);
  const snapshots: { name: string; value: unknown }[] = [];
  if (p.baseline !== undefined) snapshots.push({ name: 'Baseline', value: p.baseline });
  checkRecords(p.options, 'Option', ['id', 'name', 'snapshot'], option => { if (!text(option.name)) fail('Option needs a valid name.'); snapshots.push({ name: `Option ${String(option.name)}`, value: option.snapshot }); });
  if (p.activeOptionId !== undefined && !p.options.some(o => o?.id === p.activeOptionId)) fail('Active option does not exist.');
  for (const { name, value } of snapshots) {
    if (!isRecord(value) || !keys(value, ['rooms', 'walls', 'objects', 'metadata', 'components', 'routes', 'finishes']) || !['rooms', 'walls', 'objects', 'components', 'routes', 'finishes'].every(key => Array.isArray(value[key])) || !isRecord(value.metadata)) { fail(`${name} contains an invalid snapshot.`); continue; }
    const snapshot = value as unknown as RenovationSnapshot;
    const candidate: SceneDocument = { ...scene, rooms: snapshot.rooms, walls: snapshot.walls, objects: snapshot.objects, project: { mode: 'correct', currency: p.currency, metadata: snapshot.metadata, components: snapshot.components, routes: snapshot.routes, finishes: snapshot.finishes, materials: p.materials, sources: [], assumptions: [], tasks: [], options: [] } };
    const validation = validateScene(candidate, catalog);
    if (!validation.ok) fail(`${name} is invalid: ${validation.errors.join(' ')}`);
    else for (const entity of [...snapshot.rooms, ...snapshot.walls, ...snapshot.walls.flatMap(w => w.openings), ...snapshot.objects, ...snapshot.components, ...snapshot.routes]) evidenceEntities.add(entity.id);
  }
  checkRecords(p.assumptions, 'Assumption', ['id', 'entityId', 'property', 'value', 'status', 'sourceKind', 'sourceIds', 'rationale', 'alternatives', 'question', 'dependsOn', 'sourceRegion'], a => {
    if (!text(a.entityId, 100) || !evidenceEntities.has(a.entityId) || !text(a.property, 100) || !optionalText(a.value, 2000) || a.value === undefined || !inEnum(a.status, ['unresolved', 'accepted', 'measured', 'verified', 'stale']) || !inEnum(a.sourceKind, ['unknown', 'inferred', 'measured', 'observed', 'design']) || !strings(a.sourceIds, 32) || !optionalText(a.rationale) || a.rationale === undefined || !Array.isArray(a.alternatives) || a.alternatives.length > 32 || !a.alternatives.every(v => text(v, 500)) || !optionalText(a.question) || (a.dependsOn !== undefined && !strings(a.dependsOn, 100))) fail(`Assumption “${String(a.id)}” has invalid properties or a missing entity.`);
    if (strings(a.sourceIds, 32) && a.sourceIds.some(id => !p.sources.some(source => source?.id === id))) fail(`Assumption “${String(a.id)}” references missing evidence. Relink it before deleting the source.`);
    if (strings(a.dependsOn, 100) && a.dependsOn.some(id => !evidenceEntities.has(id) && !p.sources.some(source => source?.id === id) && !p.assumptions.some(other => other?.id === id))) fail(`Assumption “${String(a.id)}” has a missing dependency.`);
    if (a.sourceRegion !== undefined) { const r = a.sourceRegion; if (!isRecord(r) || !keys(r, ['sourceId', 'x', 'y', 'width', 'height']) || !p.sources.some(source => source?.id === r.sourceId) || !finite(r.x, 0, 1) || !finite(r.y, 0, 1) || !finite(r.width, 0.001, 1) || !finite(r.height, 0.001, 1) || r.x + r.width > 1 + EPS || r.y + r.height > 1 + EPS) fail(`Assumption “${String(a.id)}” has an invalid normalized source region.`); }
    if (['measured', 'verified'].includes(String(a.status)) && (!Array.isArray(a.sourceIds) || !a.sourceIds.length)) fail(`Assumption “${String(a.id)}” requires an evidence reference before it can be recorded as measured or verified.`);
  });
  for (const source of p.sources) if (source && source.roomId && !evidenceEntities.has(source.roomId)) fail(`Source “${source.name}” references a missing room.`);
  checkRecords(p.tasks, 'Task', ['id', 'title', 'trade', 'status', 'entityIds', 'dependsOn', 'allowance', 'notes'], task => {
    if (!text(task.title, 200) || !text(task.trade, 100) || !inEnum(task.status, ['todo', 'doing', 'done']) || !strings(task.entityIds, 200) || !strings(task.dependsOn, 100) || !finite(task.allowance, 0, 1e9) || !optionalText(task.notes)) fail(`Task “${String(task.id)}” has invalid properties.`);
    if (strings(task.entityIds, 200) && task.entityIds.some(id => !evidenceEntities.has(id))) fail(`Task “${String(task.id)}” references a missing entity.`);
    if (strings(task.dependsOn, 100) && task.dependsOn.some(id => !p.tasks.some(other => other?.id === id))) fail(`Task “${String(task.id)}” references a missing prerequisite.`);
  });
  if (errors.length) return errors;
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string): boolean { if (visiting.has(id)) return false; if (visited.has(id)) return true; visiting.add(id); const task = p.tasks.find(t => t.id === id)!; for (const dependency of task.dependsOn) if (!visit(dependency)) return false; visiting.delete(id); visited.add(id); return true; }
  if (p.tasks.some(task => !visit(task.id))) fail('Work package dependencies contain a cycle.');
  visiting.clear(); visited.clear();
  function visitAssumption(id: string): boolean { if (visiting.has(id)) return false; if (visited.has(id)) return true; const assumption = p.assumptions.find(a => a.id === id); if (!assumption) return true; visiting.add(id); for (const dependency of assumption.dependsOn ?? []) if (!visitAssumption(dependency)) return false; visiting.delete(id); visited.add(id); return true; }
  if (p.assumptions.some(assumption => !visitAssumption(assumption.id))) fail('Property assumption dependencies contain a cycle.');
  return errors;
}
