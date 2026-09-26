import type { CatalogAsset, SceneDocument, SceneObject, ValidationResult, Vec2, Wall } from '../contracts';

const EPS = 1e-5;
const COORD_LIMIT = 100;
const COLOR = /^#[0-9a-f]{6}$/i;
const KINDS = new Set(['sofa', 'chair', 'table', 'bed', 'cabinet', 'lamp', 'plant', 'rug', 'shelf']);
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
function floorSupported(object: SceneObject, asset: CatalogAsset, scene: SceneDocument): boolean {
  const halfX = asset.dimensions[0] * object.scale[0] / 2;
  const halfZ = asset.dimensions[2] * object.scale[2] / 2;
  const cosine = Math.cos(object.rotation), sine = Math.sin(object.rotation);
  const polygons = scene.rooms.map(room => room.polygon.map(([x, z]): Vec2 => {
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

function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const [start, end] of [...edges(a), ...edges(b)]) {
    const axis: Vec2 = [start[1] - end[1], end[0] - start[0]];
    const projectionA = a.map(p => p[0] * axis[0] + p[1] * axis[1]);
    const projectionB = b.map(p => p[0] * axis[0] + p[1] * axis[1]);
    if (Math.max(...projectionA) <= Math.min(...projectionB) + EPS || Math.max(...projectionB) <= Math.min(...projectionA) + EPS) return false;
  }
  return true;
}

function wallFootprint(wall: Wall, from: number, to: number): Vec2[] {
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const dx = (wall.end[0] - wall.start[0]) / length, dz = (wall.end[1] - wall.start[1]) / length;
  const h = wall.thickness / 2;
  return [[from, -h], [to, -h], [to, h], [from, h]].map(([along, across]) =>
    [wall.start[0] + dx * along! - dz * across!, wall.start[1] + dz * along! + dx * across!]);
}

function wallCollision(object: SceneObject, asset: CatalogAsset, wall: Wall, footprint: Vec2[]): boolean {
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  if (!polygonsOverlap(footprint, wallFootprint(wall, 0, length))) return false;
  const objectHeight = asset.dimensions[1] * object.scale[1];
  const passages = wall.openings.filter(o => o.kind === 'door' && o.sill <= EPS && o.height >= objectHeight - EPS)
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
  if (!keys(input, ['format', 'version', 'id', 'name', 'units', 'upAxis', 'rooms', 'walls', 'objects'])) fail('Scene contains unsupported fields.');
  if (input.format !== 'varpet.editor' || input.version !== 1) fail('Unsupported scene format or version. Expected varpet.editor version 1.');
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
        || (opening.kind === 'door' && opening.sill > EPS)) { fail(`Wall ${i + 1} has an opening outside its bounds or an unsupported raised door.`); continue; }
      openingIntervals.push([opening.offset, opening.offset + opening.width]);
    }
    openingIntervals.sort((a, b) => a[0] - b[0]);
    if (openingIntervals.some((interval, index) => index > 0 && interval[0] < openingIntervals[index - 1]![1] - EPS)) fail(`Wall ${i + 1} has overlapping openings.`);
  }
  for (const [i, object] of (input.objects as unknown[]).entries()) {
    if (!isRecord(object)) { fail(`Object ${i + 1} must be an object.`); continue; }
    unique(object.id, `Object ${i + 1}`);
    if (!keys(object, ['id', 'name', 'assetId', 'position', 'rotation', 'scale', 'color']) || !text(object.name) || !text(object.assetId, 100)
      || !vector(object.position, 3, -COORD_LIMIT, COORD_LIMIT) || !finite(object.rotation, -Math.PI * 100, Math.PI * 100)
      || !vector(object.scale, 3, 0.1, 4) || (object.color !== undefined && (typeof object.color !== 'string' || !COLOR.test(object.color)))) { fail(`Object ${i + 1} has invalid fields or a non-finite/out-of-range transform.`); continue; }
    const asset = assets.get(object.assetId);
    if (!asset) fail(`“${object.name}” references unknown catalog asset “${object.assetId}”.`);
    if (Math.abs(object.position[1]!) > EPS) fail(`“${object.name}” must be supported on the floor at y = 0.`);
    const scale = object.scale;
    if (asset && asset.dimensions.some((size, index) => size * scale[index]! > 20)) fail(`“${object.name}” is larger than the 20 m object limit.`);
  }
  if (errors.length) return result();
  const scene = input as unknown as SceneDocument;
  const floorVertices = scene.rooms.reduce((total, room) => total + room.polygon.length, 0);
  if (floorVertices > 192 || scene.objects.length * floorVertices * floorVertices > 1_500_000) {
    fail('This floor plan is too complex to validate interactively. Simplify room polygons or split the scene into smaller apartments.');
    return result();
  }
  const footprints = new Map<string, Vec2[]>();
  for (const object of scene.objects) {
    const asset = assets.get(object.assetId)!;
    const footprint = objectFootprint(object, asset);
    footprints.set(object.id, footprint);
    if (!floorSupported(object, asset, scene)) fail(`“${object.name}” must fit completely inside the floor plan.`);
    const collision = scene.walls.find(wall => wallCollision(object, asset, wall, footprint));
    if (collision) fail(`“${object.name}” intersects wall “${collision.id}”. Move it clear of the wall or into a door opening.`);
  }
  for (let i = 0; i < scene.objects.length; i++) for (let j = i + 1; j < scene.objects.length; j++) {
    const a = scene.objects[i]!, b = scene.objects[j]!;
    const assetA = assets.get(a.assetId)!, assetB = assets.get(b.assetId)!;
    if (assetA.kind === 'rug' || assetB.kind === 'rug' || warnings.length >= 8) continue;
    if (polygonsOverlap(footprints.get(a.id)!, footprints.get(b.id)!)) warnings.push(`“${a.name}” and “${b.name}” overlap; check their placement.`);
  }
  return result();
}
