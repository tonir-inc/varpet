import { z } from 'zod';
import { applyOps, wallCompass, wallOutward } from './adapter.js';
import { checkLocalLayout, compareLayoutErrors, localGeometryErrors } from './local-checks.js';
import { itemPolygon, isFloorRug, polygonsOverlap } from './metrics/space.js';
import type { Item, Op, Room, Scene, Vec2, Wall } from './scene.js';

const EPS = 1e-7, STEP = 0.05, RAD = Math.PI / 180;
const id = z.string().min(1), positive = z.number().finite().positive(), distance = z.number().finite().nonnegative();
const compass = z.enum(['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']);
const relationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('against_wall'), wall_id: id.optional(), compass: compass.optional() }).strict(),
  z.object({ type: z.literal('beside'), anchor_id: id, side: z.enum(['left', 'right', 'front', 'back']), gap_m: distance.optional() }).strict(),
  z.object({ type: z.literal('facing'), anchor_id: id }).strict(),
  z.object({ type: z.literal('in_corner'), wall_ids: z.tuple([id, id]).optional() }).strict(),
  z.object({ type: z.literal('centered') }).strict(),
  z.object({ type: z.literal('near_window'), window_id: id.optional(), max_distance_m: distance.optional() }).strict(),
  z.object({ type: z.literal('away_from'), anchor_id: id, min_distance_m: distance.optional() }).strict(),
]);

/** No pose fields are accepted: relation geometry, not callers, supplies coordinates. */
export const placeInputSchema = z.object({
  room_id: id,
  item_id: id.optional(),
  item: z.object({ id, kind: id, name: z.string().optional(), size: z.tuple([positive, positive, positive]), sku: id.optional(), price: z.number().int().nonnegative().optional(), vendor: z.string().optional() }).strict().optional(),
  relations: z.array(relationSchema).min(1),
  exclusions: z.object({ wall_ids: z.array(id).optional(), door_walls: z.boolean().optional(), in_front_of_windows: z.boolean().optional(), in_front_of_doors: z.boolean().optional() }).strict().optional(),
}).strict();
export type PlaceRequest = z.infer<typeof placeInputSchema>;
export type PlacementRelation = PlaceRequest['relations'][number];
export interface PlacementCandidate {
  item: Item;
  op: Op;
  clearances: { front_m: number; left_m: number; right_m: number; back_m: number; walkway_m: number | null };
}
export interface PlaceResult {
  candidates: PlacementCandidate[];
  reason?: string;
  resolution_m: number;
  rejections: Record<string, number>;
  assumptions: string[];
}

const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Vec2, n: number): Vec2 => [a[0] * n, a[1] * n];
const length = (a: Vec2) => Math.hypot(...a);
const rounded = (value: number) => Math.round(value * 1e10) / 1e10;
const normalize = (angle: number) => ((angle % 360) + 360) % 360;
const front = (rotation: number): Vec2 => [Math.sin(rotation * RAD), -Math.cos(rotation * RAD)];
const right = (rotation: number): Vec2 => [Math.cos(rotation * RAD), Math.sin(rotation * RAD)];
const facing = (direction: Vec2) => normalize(Math.atan2(direction[0], -direction[1]) / RAD);

function pointSegmentDistance(point: Vec2, a: Vec2, b: Vec2): number {
  const edge = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(point, a), edge) / dot(edge, edge)));
  return length(sub(point, add(a, scale(edge, t))));
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const cross = (u: Vec2, v: Vec2) => u[0] * v[1] - u[1] * v[0];
  const ab = sub(b, a), cd = sub(d, c), determinant = cross(ab, cd);
  if (Math.abs(determinant) < EPS) return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b)) < EPS;
  const t = cross(sub(c, a), cd) / determinant, u = cross(sub(c, a), ab) / determinant;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS;
}

function polygonDistance(a: Vec2[], b: Vec2[]): number {
  if (a.length > 2 && b.length > 2 && polygonsOverlap(a, b)) return 0;
  let result = Infinity;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const p = a[i]!, q = a[(i + 1) % a.length]!, r = b[j]!, s = b[(j + 1) % b.length]!;
    if (segmentsIntersect(p, q, r, s)) return 0;
    result = Math.min(result, pointSegmentDistance(p, r, s), pointSegmentDistance(r, p, q));
  }
  return result;
}

function roomCenter(room: Room): Vec2 {
  let area = 0, x = 0, y = 0;
  for (let i = 0; i < room.polygon.length; i++) {
    const a = room.polygon[i]!, b = room.polygon[(i + 1) % room.polygon.length]!, cross = a[0] * b[1] - b[0] * a[1];
    area += cross; x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross;
  }
  return [x / (3 * area), y / (3 * area)];
}

function rayDistance(origin: Vec2, direction: Vec2, polygon: Vec2[]): number {
  let result = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!, edge = sub(b, a), delta = sub(a, origin);
    const denominator = direction[0] * edge[1] - direction[1] * edge[0];
    if (Math.abs(denominator) < EPS) continue;
    const t = (delta[0] * edge[1] - delta[1] * edge[0]) / denominator;
    const u = (delta[0] * direction[1] - delta[1] * direction[0]) / denominator;
    if (t >= -EPS && u >= -EPS && u <= 1 + EPS) result = Math.min(result, Math.max(0, t));
  }
  return result;
}

function clearances(scene: Scene, item: Item, room: Room, walkway_m: number | null): PlacementCandidate['clearances'] {
  const polygons = [room.polygon, ...[...scene.items, ...scene.fixed].filter(other => other.id !== item.id && other.room_id === room.id && !isFloorRug(other)).map(itemPolygon)];
  const measure = (direction: Vec2, halfSize: number) => {
    const origin = add(item.pos, scale(direction, halfSize));
    return rounded(Math.min(...polygons.map(polygon => rayDistance(origin, direction, polygon))));
  };
  const f = front(item.rot), r = right(item.rot);
  return { front_m: measure(f, item.size[1] / 2), back_m: measure(scale(f, -1), item.size[1] / 2), right_m: measure(r, item.size[0] / 2), left_m: measure(scale(r, -1), item.size[0] / 2), walkway_m };
}

export function place(scene: Scene, input: PlaceRequest, baseline: Scene = scene): PlaceResult {
  const request = placeInputSchema.parse(input);
  if ((request.item_id === undefined) === (request.item === undefined)) throw new Error('Supply exactly one existing item_id or sized item description');
  const room = scene.rooms.find(candidate => candidate.id === request.room_id);
  if (!room) throw new Error(`Unknown room: ${request.room_id}`);
  const roomXs = room.polygon.map(point => point[0]), roomYs = room.polygon.map(point => point[1]);
  const gridWidth = Math.ceil((Math.max(...roomXs) - Math.min(...roomXs)) / STEP - EPS);
  const gridHeight = Math.ceil((Math.max(...roomYs) - Math.min(...roomYs)) / STEP - EPS);
  if (gridWidth * gridHeight > 1_000_000) throw new Error(`Room ${room.id} exceeds one million 5 cm cells; split the room before placement`);
  let base: Item;
  if (request.item_id !== undefined) {
    if (scene.fixed.some(item => item.id === request.item_id)) throw new Error(`Fixed item ${request.item_id} cannot move`);
    const existing = scene.items.find(item => item.id === request.item_id);
    if (!existing) throw new Error(`Unknown item: ${request.item_id}`);
    if (existing.keep) throw new Error(`Kept item ${request.item_id} cannot move`);
    base = { ...structuredClone(existing), room_id: room.id };
  } else {
    const item = request.item!;
    if ([...scene.items, ...scene.fixed, ...scene.rooms, ...scene.walls, ...scene.openings].some(entity => entity.id === item.id)) throw new Error(`Duplicate item id: ${item.id}`);
    base = { ...item, name: item.name ?? item.kind, room_id: room.id, pos: [0, 0], rot: 0, keep: false };
  }
  const walls = scene.walls.filter(wall => wall.room_id === room.id && !wall.open);
  const getWall = (wallId: string) => {
    const wall = walls.find(candidate => candidate.id === wallId);
    if (!wall) throw new Error(`Unknown wall ${wallId} in room ${room.id}`);
    return wall;
  };
  const getAnchor = (anchorId: string) => {
    const anchor = [...scene.items, ...scene.fixed].find(candidate => candidate.id === anchorId && candidate.room_id === room.id);
    if (!anchor || anchor.id === base.id) throw new Error(`Unknown or self anchor ${anchorId} in room ${room.id}`);
    return anchor;
  };
  const windows = scene.openings.filter(opening => opening.kind === 'window' && walls.some(wall => wall.id === opening.wall_id));
  const windowSpan = (windowId: string): Vec2[] => {
    const opening = windows.find(candidate => candidate.id === windowId);
    if (!opening) throw new Error(`Unknown window ${windowId} in room ${room.id}`);
    const wall = getWall(opening.wall_id), along = scale(sub(wall.b, wall.a), 1 / length(sub(wall.b, wall.a)));
    return [add(wall.a, scale(along, opening.offset)), add(wall.a, scale(along, opening.offset + opening.width))];
  };
  for (const relation of request.relations) {
    if ('anchor_id' in relation) getAnchor(relation.anchor_id);
    if (relation.type === 'against_wall') {
      if (relation.wall_id) getWall(relation.wall_id);
      if (relation.compass && scene.north_deg === undefined) throw new Error('north_deg is required to select a compass wall');
    }
    if (relation.type === 'in_corner') relation.wall_ids?.forEach(getWall);
    if (relation.type === 'near_window' && relation.window_id) windowSpan(relation.window_id);
  }
  request.exclusions?.wall_ids?.forEach(getWall);
  const excluded = new Set(request.exclusions?.wall_ids ?? []);
  if (request.exclusions?.door_walls) scene.openings.filter(opening => opening.kind !== 'window').forEach(opening => excluded.add(opening.wall_id));
  const allowedWalls = (relation: Extract<PlacementRelation, { type: 'against_wall' }>) => walls.filter(wall => !excluded.has(wall.id) && (!relation.wall_id || wall.id === relation.wall_id) && (!relation.compass || wallCompass(scene, wall) === relation.compass));
  const center = roomCenter(room), candidates: Item[] = [];
  const seen = new Set<string>();
  let searchLimited = false, searchAttempts = 0;
  const facingRelation = request.relations.find(relation => relation.type === 'facing');
  const addPose = (position: Vec2, rotation: number) => {
    // Count attempted poses, including duplicates: a floating-point step can be
    // smaller than the ULP of extreme input coordinates and revisit the same pose.
    if (searchAttempts++ >= 200_000) { searchLimited = true; return; }
    if (facingRelation) {
      const delta = sub(getAnchor(facingRelation.anchor_id).pos, position);
      if (length(delta) < EPS) return;
      rotation = facing(delta);
    }
    const pos = position.map(rounded) as Vec2, rot = rounded(normalize(rotation)), key = `${pos[0]},${pos[1]},${rot}`;
    if (seen.has(key)) return;
    seen.add(key); candidates.push({ ...base, pos, rot });
  };
  const wallPoses = (wall: Wall) => {
    const delta = sub(wall.b, wall.a), span = length(delta), along = scale(delta, 1 / span), inward = scale(wallOutward(scene, wall), -1), rotation = facing(inward);
    for (let offset = base.size[0] / 2; offset <= span - base.size[0] / 2 + EPS && !searchLimited; offset += STEP) addPose(add(add(wall.a, scale(along, offset)), scale(inward, base.size[1] / 2)), rotation);
  };
  const against = request.relations.find(relation => relation.type === 'against_wall');
  const beside = request.relations.find(relation => relation.type === 'beside');
  const corner = request.relations.find(relation => relation.type === 'in_corner');
  const centered = request.relations.some(relation => relation.type === 'centered');
  const near = request.relations.find(relation => relation.type === 'near_window');
  if (centered) [0, 90, 180, 270].forEach(rotation => addPose(center, rotation));
  else if (against) allowedWalls(against).forEach(wallPoses);
  else if (corner) {
    const selected = corner.wall_ids ? corner.wall_ids.map(getWall) : walls;
    for (let i = 0; i < selected.length && !searchLimited; i++) for (let j = i + 1; j < selected.length && !searchLimited; j++) {
      const a = selected[i]!, b = selected[j]!;
      if (excluded.has(a.id) || excluded.has(b.id)) continue;
      const vertex = [a.a, a.b].find(point => [b.a, b.b].some(other => length(sub(point, other)) < EPS));
      if (!vertex) continue;
      const n1 = scale(wallOutward(scene, a), -1), n2 = scale(wallOutward(scene, b), -1), determinant = n1[0] * n2[1] - n1[1] * n2[0];
      if (Math.abs(determinant) < EPS) continue;
      for (const rotation of [facing(n1), facing(n2)]) {
        const extent = (normal: Vec2) => Math.abs(dot(right(rotation), normal)) * base.size[0] / 2 + Math.abs(dot(front(rotation), normal)) * base.size[1] / 2;
        const d1 = dot(n1, vertex) + extent(n1), d2 = dot(n2, vertex) + extent(n2);
        addPose([(d1 * n2[1] - n1[1] * d2) / determinant, (n1[0] * d2 - d1 * n2[0]) / determinant], rotation);
      }
    }
  } else if (beside) {
    const anchor = getAnchor(beside.anchor_id), r = right(anchor.rot), f = front(anchor.rot);
    const direction = beside.side === 'left' ? scale(r, -1) : beside.side === 'right' ? r : beside.side === 'front' ? f : scale(f, -1);
    const lateral = beside.side === 'left' || beside.side === 'right', tangent = lateral ? f : r;
    const extent = lateral ? (anchor.size[0] + base.size[0]) / 2 : (anchor.size[1] + base.size[1]) / 2;
    const halfSpan = (lateral ? anchor.size[1] : anchor.size[0]) / 2;
    for (let offset = -halfSpan; offset <= halfSpan + EPS && !searchLimited; offset += STEP) {
      const poseAt = (normalDistance: number) => add(add(anchor.pos, scale(direction, normalDistance)), scale(tangent, offset));
      let normalDistance = extent + (beside.gap_m ?? 0.1);
      if (facingRelation) {
        // Facing changes the footprint's extent toward the anchor. Solve the edge gap
        // after rotation, rather than moving a pre-rotation rectangle and then turning it.
        const minimum = (lateral ? anchor.size[0] : anchor.size[1]) / 2 + (beside.gap_m ?? 0.1);
        let low = minimum, high = minimum + Math.hypot(base.size[0], base.size[1]) / 2;
        for (let iteration = 0; iteration < 50; iteration++) {
          const middle = (low + high) / 2;
          const rotation = facing(sub(getAnchor(facingRelation.anchor_id).pos, poseAt(middle)));
          const footprintExtent = Math.abs(dot(right(rotation), direction)) * base.size[0] / 2 + Math.abs(dot(front(rotation), direction)) * base.size[1] / 2;
          if (middle - footprintExtent < minimum) low = middle;
          else high = middle;
        }
        normalDistance = (low + high) / 2;
      }
      addPose(poseAt(normalDistance), anchor.rot);
    }
  } else {
    if (near) windows.filter(window => !near.window_id || window.id === near.window_id).map(window => getWall(window.wall_id)).filter(wall => !excluded.has(wall.id)).forEach(wallPoses);
    const xs = room.polygon.map(point => point[0]), ys = room.polygon.map(point => point[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
    for (let x = minX; x <= maxX + EPS && !searchLimited; x += STEP) for (let y = minY; y <= maxY + EPS && !searchLimited; y += STEP) for (const rotation of facingRelation ? [0] : [0, 90, 180, 270]) addPose([x, y], rotation);
  }
  const touches = (item: Item, wall: Wall) => polygonDistance(itemPolygon(item), [wall.a, wall.b]) < EPS;
  function relationFits(item: Item, relation: PlacementRelation): boolean {
    const polygon = itemPolygon(item);
    switch (relation.type) {
      case 'against_wall': return allowedWalls(relation).some(wall => touches(item, wall) && dot(front(item.rot), scale(wallOutward(scene, wall), -1)) > 1 - EPS);
      case 'centered': return length(sub(item.pos, center)) < EPS;
      case 'near_window': return windows.some(window => (!relation.window_id || window.id === relation.window_id) && polygonDistance(polygon, windowSpan(window.id)) <= (relation.max_distance_m ?? 1.5) + EPS);
      case 'away_from': return polygonDistance(polygon, itemPolygon(getAnchor(relation.anchor_id))) >= (relation.min_distance_m ?? 1) - EPS;
      case 'facing': { const delta = sub(getAnchor(relation.anchor_id).pos, item.pos); return length(delta) > EPS && dot(front(item.rot), scale(delta, 1 / length(delta))) > 1 - EPS; }
      case 'in_corner': {
        const selected = relation.wall_ids ? relation.wall_ids.map(getWall) : walls;
        const touched = selected.filter(wall => !excluded.has(wall.id) && touches(item, wall));
        return touched.some((a, i) => touched.slice(i + 1).some(b => [a.a, a.b].some(p => [b.a, b.b].some(q => length(sub(p, q)) < EPS))));
      }
      case 'beside': {
        const anchor = getAnchor(relation.anchor_id), r = right(anchor.rot), f = front(anchor.rot), lateral = relation.side === 'left' || relation.side === 'right';
        const direction = relation.side === 'left' ? scale(r, -1) : relation.side === 'right' ? r : relation.side === 'front' ? f : scale(f, -1);
        const tangent = lateral ? f : r, a = itemPolygon(anchor).map(point => dot(point, direction)), b = polygon.map(point => dot(point, direction));
        const gap = Math.min(...b) - Math.max(...a), ta = itemPolygon(anchor).map(point => dot(point, tangent)), tb = polygon.map(point => dot(point, tangent));
        return Math.abs(gap - (relation.gap_m ?? 0.1)) < EPS && Math.min(Math.max(...ta), Math.max(...tb)) > Math.max(Math.min(...ta), Math.min(...tb)) + EPS;
      }
    }
  }
  const openingExclusion = (item: Item) => scene.openings.some(opening => {
    if (opening.kind === 'window' ? !request.exclusions?.in_front_of_windows : !request.exclusions?.in_front_of_doors) return false;
    const wall = walls.find(candidate => candidate.id === opening.wall_id);
    if (!wall) return false;
    const along = scale(sub(wall.b, wall.a), 1 / length(sub(wall.b, wall.a))), projections = itemPolygon(item).map(point => dot(sub(point, wall.a), along));
    return Math.min(Math.max(...projections), opening.offset + opening.width) > Math.max(Math.min(...projections), opening.offset) + EPS;
  });
  const rank = (item: Item) => {
    let score = length(sub(item.pos, center));
    for (const relation of request.relations) {
      if (relation.type === 'near_window') score += 10 * Math.min(...windows.filter(window => !relation.window_id || window.id === relation.window_id).map(window => polygonDistance(itemPolygon(item), windowSpan(window.id))));
      if (relation.type === 'away_from') score -= 10 * polygonDistance(itemPolygon(item), itemPolygon(getAnchor(relation.anchor_id)));
    }
    return score;
  };
  const baselineCheck = checkLocalLayout(baseline);
  const rejections: Record<string, number> = {}, reject = (reason: string) => { rejections[reason] = (rejections[reason] ?? 0) + 1; };
  const survivors = candidates.filter(item => {
    if (!request.relations.every(relation => relationFits(item, relation))) { reject('relation constraint'); return false; }
    if (walls.some(wall => excluded.has(wall.id) && touches(item, wall)) || openingExclusion(item)) { reject('excluded wall or opening'); return false; }
    const preview = { ...scene, items: [...scene.items.filter(other => other.id !== base.id), item] };
    const { errors } = compareLayoutErrors(baselineCheck.errors, localGeometryErrors(preview));
    if (errors.length) { errors.forEach(error => reject(error.check)); return false; }
    return true;
  }).map(item => ({ item, score: rank(item) })).sort((a, b) => a.score - b.score || a.item.pos[0] - b.item.pos[0] || a.item.pos[1] - b.item.pos[1] || a.item.rot - b.item.rot);
  const result: PlacementCandidate[] = [];
  for (const { item } of survivors) {
    const op: Op = request.item_id ? { type: 'move', id: item.id, pos: item.pos, rot: item.rot, room_id: item.room_id } : { type: 'add', item };
    const preview = applyOps(scene, [op]), checked = checkLocalLayout(preview);
    const { errors } = compareLayoutErrors(baselineCheck.errors, checked.errors);
    if (errors.length) { errors.forEach(error => reject(error.check)); continue; }
    const walkways = checked.metrics.rooms.find(metrics => metrics.room_id === room.id)!.walkways;
    result.push({ item: structuredClone(item), op: structuredClone(op), clearances: clearances(preview, item, room, walkways.length ? Math.min(...walkways.map(walkway => walkway.width_m)) : null) });
    if (result.length === 3) break;
  }
  return {
    candidates: result, resolution_m: STEP, rejections,
    ...(result.length ? {} : { reason: `No checked pose fits ${base.kind} ${base.size[0]} × ${base.size[1]} m in room ${room.id}: ${Object.keys(rejections).join(', ') || 'wall spans, corner geometry or exclusions leave no candidate'}.${searchLimited ? ' Search stopped at the 200000-pose bound; infeasibility is not proven.' : ''}` }),
    assumptions: ['Distances are metres; beside sides are relative to the anchor; front is local -y.', 'Near-window and away-from distances use full footprint edges, not centres.', 'Opening exclusions reserve the full inward strip across each opening span.', 'Clearances are measured from the midpoint of each furniture side; walkway_m is the narrowest checked door route, or null when there are no door routes.', 'New products require caller-supplied dimensions; catalog SKU lookup is not part of placement.', ...(searchLimited ? ['Search reached its deterministic 200000-pose bound.'] : [])],
  };
}
