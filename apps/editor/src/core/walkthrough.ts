import { hasRoomCeiling, roomCeilingHeight } from './heights';
import type { CatalogAsset, Room, SceneDocument, SceneObject, Vec2, Vec3 } from '../contracts';
import { componentPosition, componentRotation, polygonArea } from './geometry';
import { floorSupported, objectFootprint, polygonsOverlap, wallCollision } from './validation';

export const WALK_EYE_HEIGHT = 1.65;
const BODY_WIDTH = 0.4, BODY_HEIGHT = 1.8, MAX_STEP = 0.25, EPS = 1e-5;
const bodyAsset: CatalogAsset = { id: 'walk-body', name: 'Walking clearance', category: 'view', kind: 'cabinet', dimensions: [BODY_WIDTH, BODY_HEIGHT, BODY_WIDTH], color: '#ffffff', price: 0, source: { type: 'procedural' } };
const bodyAt = (point: Vec2, floor: number): SceneObject => ({ id: 'walk-body', assetId: bodyAsset.id, name: 'Walking clearance', position: [point[0], floor, point[1]], rotation: 0, scale: [1, 1, 1] });

function contains(polygon: Vec2[], [x, z]: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Positive distances where a horizontal sight ray crosses polygon edges. */
function rayCrossings(origin: Vec2, direction: Vec2, polygon: Vec2[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    const ex = b[0] - a[0], ez = b[1] - a[1], denominator = direction[0] * ez - direction[1] * ex;
    if (Math.abs(denominator) < EPS) continue;
    const ax = a[0] - origin[0], az = a[1] - origin[1];
    const distance = (ax * ez - az * ex) / denominator, along = (ax * direction[1] - az * direction[0]) / denominator;
    if (distance >= 0 && along >= -EPS && along <= 1 + EPS) result.push(distance);
  }
  return result;
}

/** All geometry comes from the document; collision never writes camera state into it. */
function walkContext(scene: SceneDocument, catalog: CatalogAsset[]) {
  const metadata = scene.project?.metadata ?? {};
  const headroom = new Map(scene.rooms.map(room => [room.id, hasRoomCeiling(scene, room) ? roomCeilingHeight(scene, room) : Infinity]));
  const rooms = scene.rooms.filter(room => metadata[room.id]?.phase !== 'remove' && headroom.get(room.id)! >= BODY_HEIGHT);
  const elevation = (room: Room) => metadata[room.id]?.elevation ?? 0;
  const floors = new Map<number, SceneDocument>();
  for (const room of rooms) if (!floors.has(elevation(room))) {
    // A small step can support the body at a room seam. Larger rises and drops cannot.
    floors.set(elevation(room), { ...scene, version: 1, rooms: rooms.filter(other => Math.abs(elevation(other) - elevation(room)) <= MAX_STEP + EPS
      && elevation(other) + headroom.get(other.id)! >= elevation(room) + BODY_HEIGHT - EPS) });
  }
  const walls = scene.walls.filter(wall => metadata[wall.id]?.phase !== 'remove').map(wall => ({ ...wall,
    openings: wall.openings.filter(opening => metadata[opening.id]?.mechanism !== 'fixed'),
  }));
  const obstacles = scene.objects.filter(object => metadata[object.id]?.phase !== 'remove').flatMap(object => {
    const asset = catalog.find(item => item.id === object.assetId);
    return asset ? [{ polygon: objectFootprint(object, asset), bottom: object.position[1], top: object.position[1] + asset.dimensions[1] * object.scale[1] }] : [];
  });
  for (const component of scene.project?.components ?? []) {
    if (component.phase === 'remove') continue;
    const position = componentPosition(scene, component);
    obstacles.push({ polygon: objectFootprint({ ...bodyAt([position[0], position[2]], position[1]), rotation: componentRotation(scene, component) }, { ...bodyAsset, dimensions: component.dimensions }), bottom: position[1], top: position[1] + component.dimensions[1] });
  }
  function safe(point: Vec2, floor: number): boolean {
    const body = bodyAt(point, floor), footprint = objectFootprint(body, bodyAsset), floorScene = floors.get(floor);
    if (!floorScene || !floorSupported(body, bodyAsset, floorScene)) return false;
    if (walls.some(wall => {
      const wallFloor = metadata[wall.id]?.elevation ?? 0;
      // Feet can step over a low doorway sill before the body centre reaches the next floor.
      const openings = wall.openings.map(opening => {
        const rise = wallFloor + opening.sill - floor;
        return opening.kind === 'door' && rise > 0 && rise <= MAX_STEP + EPS
          ? { ...opening, sill: opening.sill - rise, height: opening.height + rise }
          : opening;
      });
      return wallCollision(body, bodyAsset, { ...wall, openings }, footprint, wallFloor);
    })) return false;
    // Thin rugs and floor plates are walkable; furniture and overhead obstacles are solid.
    return !obstacles.some(obstacle => obstacle.top > floor + 0.08 && obstacle.bottom < floor + BODY_HEIGHT - EPS && polygonsOverlap(footprint, obstacle.polygon));
  }
  function floorAt(point: Vec2, previousFloor: number): number | null {
    const candidates = rooms.filter(room => contains(room.polygon, point) && Math.abs(elevation(room) - previousFloor) <= MAX_STEP + EPS)
      .sort((a, b) => Math.abs(elevation(a) - previousFloor) - Math.abs(elevation(b) - previousFloor));
    for (const room of candidates) if (safe(point, elevation(room))) return elevation(room);
    return null;
  }
  function viewDirection(point: Vec2, floor: number): Vec2 {
    const eye = floor + WALK_EYE_HEIGHT, range = 8;
    const opaque = obstacles.filter(obstacle => obstacle.bottom <= eye && obstacle.top >= eye).map(obstacle => obstacle.polygon);
    const glazing: Vec2[][] = [];
    for (const wall of scene.walls) {
      const base = metadata[wall.id]?.elevation ?? 0;
      if (metadata[wall.id]?.phase === 'remove' || eye < base || eye > base + wall.height) continue;
      const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
      if (length < EPS) continue;
      const rectangle = (start: number, end: number): Vec2[] => {
        const half = wall.thickness / 2;
        return [[start, -half], [end, -half], [end, half], [start, half]].map(([along, across]) =>
          [wall.start[0] + (along! * dx - across! * dz) / length, wall.start[1] + (along! * dz + across! * dx) / length]);
      };
      let cursor = 0;
      for (const opening of [...wall.openings].sort((a, b) => a.offset - b.offset)) {
        const meta = metadata[opening.id] ?? {}, removed = meta.phase === 'remove';
        const frame = removed ? 0 : Math.min(meta.frameWidth ?? 0.045, opening.width / 5, opening.height / 5);
        const bottom = opening.kind === 'window' ? frame : Math.min(meta.threshold ?? 0, opening.height / 4);
        if ((!removed && opening.kind === 'door' && meta.mechanism === 'fixed')
          || eye < base + opening.sill + bottom || eye > base + opening.sill + opening.height - frame) continue;
        const left = Math.max(cursor, Math.max(0, opening.offset + frame)), right = Math.min(length, opening.offset + opening.width - frame);
        if (right <= left) continue;
        if (left > cursor) opaque.push(rectangle(cursor, left));
        if (opening.kind === 'window' && !removed) glazing.push(rectangle(left, right));
        cursor = right;
      }
      if (cursor < length) opaque.push(rectangle(cursor, length));
    }
    const visibleRooms = scene.rooms.filter(room => metadata[room.id]?.phase !== 'remove' && elevation(room) <= eye
      && (!hasRoomCeiling(scene, room) || elevation(room) + roomCeilingHeight(scene, room) >= eye));
    const samples = Array.from({ length: 32 }, (_, index) => {
      const angle = index * Math.PI / 16, direction: Vec2 = [Math.sin(angle), -Math.cos(angle)];
      let distance = range;
      for (const polygon of opaque) distance = Math.min(distance, ...rayCrossings(point, direction, polygon));
      // Cap empty space at the contiguous room envelope; outside sky must not
      // pretend to add another eight metres to the apartment's apparent depth.
      const crossings = [0, distance, ...visibleRooms.flatMap(room => rayCrossings(point, direction, room.polygon))]
        .filter(value => value >= 0 && value <= distance).sort((a, b) => a - b);
      for (let i = 1; i < crossings.length; i++) {
        const start = crossings[i - 1]!, end = crossings[i]!;
        if (end - start < EPS) continue;
        const midpoint: Vec2 = [point[0] + direction[0] * (start + end) / 2, point[1] + direction[1] * (start + end) / 2];
        if (!visibleRooms.some(room => contains(room.polygon, midpoint))) { distance = start; break; }
      }
      const window = glazing.some(polygon => rayCrossings(point, direction, polygon).some(hit => hit <= distance + EPS));
      return { direction, value: Math.min(distance, 4) + (window ? 2 : 0) };
    });
    let best = -Infinity, direction: Vec2 = [0, -1];
    // Prefer a broad view across the room, with daylight as a modest visual
    // anchor. Eye-level occlusion differs from where a 1.8m body can walk.
    for (let index = 0; index < samples.length; index++) {
      let score = 0;
      for (let offset = -3; offset <= 3; offset++) score += samples[(index + offset + samples.length) % samples.length]!.value * (offset === 0 ? 2 : 1);
      if (score > best + EPS) { best = score; direction = samples[index]!.direction; }
    }
    return direction;
  }
  /** Metres from a standing point to the nearest furniture a person could bump into. */
  function clearance(point: Vec2, floor: number): number {
    let nearest = Infinity;
    for (const obstacle of obstacles) {
      if (obstacle.top <= floor + 0.08 || obstacle.bottom >= floor + BODY_HEIGHT) continue;
      nearest = Math.min(nearest, polygonDistance(point, obstacle.polygon));
    }
    return nearest;
  }
  /** Footprint centre of the furniture standing in a room, if any. */
  function furnitureCentre(room: Room, floor: number): Vec2 | null {
    let x = 0, z = 0, count = 0;
    for (const obstacle of obstacles) {
      if (obstacle.top <= floor + 0.08) continue;
      const cx = obstacle.polygon.reduce((sum, p) => sum + p[0], 0) / obstacle.polygon.length;
      const cz = obstacle.polygon.reduce((sum, p) => sum + p[1], 0) / obstacle.polygon.length;
      if (!contains(room.polygon, [cx, cz])) continue;
      x += cx; z += cz; count++;
    }
    return count ? [x / count, z / count] : null;
  }
  /** Furniture within arm's length across the middle of the view (a chair back filling the frame). */
  function viewBlocked(point: Vec2, direction: Vec2, floor: number): boolean {
    for (const angle of [-0.45, -0.2, 0, 0.2, 0.45]) {
      const c = Math.cos(angle), s = Math.sin(angle), dx = direction[0] * c - direction[1] * s, dz = direction[0] * s + direction[1] * c;
      for (const distance of [0.3, 0.55, 0.8]) {
        const sample: Vec2 = [point[0] + dx * distance, point[1] + dz * distance];
        if (obstacles.some(obstacle => obstacle.top > floor + 0.08 && obstacle.bottom < floor + BODY_HEIGHT && contains(obstacle.polygon, sample))) return true;
      }
    }
    return false;
  }
  return { rooms, elevation, safe, floorAt, viewDirection, clearance, furnitureCentre, viewBlocked };
}

function polygonDistance(point: Vec2, polygon: Vec2[]): number {
  return contains(polygon, point) ? 0 : edgeDistance(point, polygon);
}
function edgeDistance(point: Vec2, polygon: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    const ex = b[0] - a[0], ez = b[1] - a[1], length = ex * ex + ez * ez;
    const t = length < EPS ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * ex + (point[1] - a[1]) * ez) / length));
    best = Math.min(best, Math.hypot(point[0] - a[0] - ex * t, point[1] - a[1] - ez * t));
  }
  return best;
}

/** Within an open door leaf's swing (Inside opens every door). */
function nearDoor(scene: SceneDocument, point: Vec2): boolean {
  return scene.walls.some(wall => {
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    if (length < EPS) return false;
    return wall.openings.some(opening => {
      if (opening.kind !== 'door') return false;
      const along = opening.offset + opening.width / 2;
      const cx = wall.start[0] + dx / length * along, cz = wall.start[1] + dz / length * along;
      return Math.hypot(point[0] - cx, point[1] - cz) < opening.width + 0.3;
    });
  });
}

/** Room enough to stand without a chair back filling the view; closer than the trigger, the start moves. */
const PRESENTATION_CLEARANCE = 0.7, CRAMPED = 0.45;

/** Deterministic standing position, favouring the selected room and a usable requested point. */
export function findWalkSpawn(scene: SceneDocument, catalog: CatalogAsset[], preferred?: { roomId?: string; point?: Vec2 }): { position: Vec3; target: Vec3 } | null {
  const context = walkContext(scene, catalog);
  const preference = (room: Room) => room.id === preferred?.roomId ? 2 : preferred?.point && contains(room.polygon, preferred.point) ? 1 : 0;
  const rooms = [...context.rooms].sort((a, b) => preference(b) - preference(a) || polygonArea(b.polygon) - polygonArea(a.polygon));
  /** Open floor with a view over the room's furniture: clearance first, then enough distance to see it all. */
  function presentationSpot(room: Room, floor: number, candidates: Vec2[], preferredPoint: Vec2): Vec2 | null {
    const centre = context.furnitureCentre(room, floor);
    let best: Vec2 | null = null, bestScore = -Infinity;
    // Every other grid point is plenty for a start pose and keeps entering Inside under a frame.
    for (let index = 2; index < candidates.length; index += 2) {
      const point = candidates[index]!;
      if (!contains(room.polygon, point)) continue;
      const room_ = Math.min(context.clearance(point, floor), edgeDistance(point, room.polygon) + 0.2);
      if (room_ < PRESENTATION_CLEARANCE || nearDoor(scene, point)) continue;
      const toCentre = centre ? Math.hypot(centre[0] - point[0], centre[1] - point[1]) : 0;
      if (centre && toCentre > 0.3) {
        // The furniture must be in open view: no piece at arm's length, no wall before the room's middle.
        const direction: Vec2 = [(centre[0] - point[0]) / toCentre, (centre[1] - point[1]) / toCentre];
        const wall = Math.min(Infinity, ...rayCrossings(point, direction, room.polygon));
        if (context.viewBlocked(point, direction, floor) || wall < Math.min(2.5, toCentre)) continue;
      }
      const view = Math.min(4.5, toCentre);
      const score = Math.min(room_, 1.4) * 2 + view * 0.8 - Math.hypot(point[0] - preferredPoint[0], point[1] - preferredPoint[1]) * 0.1;
      if (score > bestScore && context.safe(point, floor)) { bestScore = score; best = point; }
    }
    return best;
  }
  for (const room of rooms) {
    const floor = context.elevation(room), xs = room.polygon.map(point => point[0]), zs = room.polygon.map(point => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const centre: Vec2 = [(minX + maxX) / 2, (minZ + maxZ) / 2];
    const preferredPoint = preferred?.point?.every(Number.isFinite) ? preferred.point : centre;
    const candidates: Vec2[] = [preferredPoint, centre];
    // A bounded interior search also works for concave rooms whose centroid lies outside.
    const nx = Math.min(80, Math.max(1, Math.ceil((maxX - minX) / 0.25))), nz = Math.min(80, Math.max(1, Math.ceil((maxZ - minZ) / 0.25)));
    for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) candidates.push([minX + (x + 0.5) * (maxX - minX) / nx, minZ + (z + 0.5) * (maxZ - minZ) / nz]);
    candidates.sort((a, b) => Math.hypot(a[0] - preferredPoint[0], a[1] - preferredPoint[1]) - Math.hypot(b[0] - preferredPoint[0], b[1] - preferredPoint[1]));
    for (const point of candidates) {
      if (!contains(room.polygon, point) || !context.safe(point, floor)) continue;
      const broad = context.viewDirection(point, floor);
      const presented = ((context.clearance(point, floor) < CRAMPED && context.viewBlocked(point, broad, floor)) || edgeDistance(point, room.polygon) < 0.5 || nearDoor(scene, point)) ? presentationSpot(room, floor, candidates, preferredPoint) : null;
      const chosen = presented ?? point;
      const centre = presented ? context.furnitureCentre(room, floor) : null;
      const length = centre ? Math.hypot(centre[0] - chosen[0], centre[1] - chosen[1]) : 0;
      // A cramped start moves to open floor and faces the furniture; an open one keeps its broad view.
      const direction: Vec2 = centre && length > 0.3 ? [(centre[0] - chosen[0]) / length, (centre[1] - chosen[1]) / length] : presented ? context.viewDirection(chosen, floor) : broad;
      const position: Vec3 = [chosen[0], floor + WALK_EYE_HEIGHT, chosen[1]];
      return { position, target: [position[0] + direction[0], position[1], position[2] + direction[1]] };
    }
  }
  return null;
}

/** Grounded X/Z movement; short swept steps prevent tunnelling and permit wall sliding. */
export function moveWalkPosition(scene: SceneDocument, catalog: CatalogAsset[], position: Vec3, delta: Vec2): Vec3 {
  if (![...position, ...delta].every(Number.isFinite)) return [...position];
  const distance = Math.hypot(...delta);
  if (distance < EPS) return [...position];
  const context = walkContext(scene, catalog), result: Vec3 = [...position];
  // The supported document spans at most 200m; cap pathological input without large loops.
  const scale = Math.min(1, 200 / distance), steps = Math.ceil(distance * scale / 0.05);
  const dx = delta[0] * scale / steps, dz = delta[1] * scale / steps;
  for (let step = 0; step < steps; step++) {
    const floor = result[1] - WALK_EYE_HEIGHT;
    const candidates: Vec2[] = [[result[0] + dx, result[2] + dz]];
    if (Math.abs(dx) > EPS && Math.abs(dz) > EPS) candidates.push([result[0] + dx, result[2]], [result[0], result[2] + dz]);
    let moved = false;
    for (const point of candidates) {
      const nextFloor = context.floorAt(point, floor);
      if (nextFloor === null) continue;
      result[0] = point[0]; result[1] = nextFloor + WALK_EYE_HEIGHT; result[2] = point[1]; moved = true; break;
    }
    if (!moved) break;
  }
  return result;
}
