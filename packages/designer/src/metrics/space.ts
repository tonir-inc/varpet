import { applyOps, wallOutward } from '../adapter.js';
import type { Item, Op, Opening, Room, Scene, Vec2 } from '../scene.js';

export const SPACE_RESOLUTION_M = 0.05;
const EPS = 1e-8;
const rounded = (value: number) => Math.round(value * 1e10) / 1e10;
const cross = (a: Vec2, b: Vec2, p: Vec2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

export function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!, b = polygon[i]!;
    if (Math.abs(cross(a, b, point)) < EPS && point[0] >= Math.min(a[0], b[0]) - EPS && point[0] <= Math.max(a[0], b[0]) + EPS && point[1] >= Math.min(a[1], b[1]) - EPS && point[1] <= Math.max(a[1], b[1]) + EPS) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function itemPolygon(item: Item): Vec2[] {
  const angle = item.rot * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as Vec2[]).map(([x, y]) => [
    item.pos[0] + x * item.size[0] / 2 * c - y * item.size[1] / 2 * s,
    item.pos[1] + x * item.size[0] / 2 * s + y * item.size[1] / 2 * c,
  ]);
}

/** The centre of the physical front edge; local front is -y. */
export function itemFront(item: Item): Vec2 {
  const angle = item.rot * Math.PI / 180;
  return [item.pos[0] + Math.sin(angle) * item.size[1] / 2, item.pos[1] - Math.cos(angle) * item.size[1] / 2];
}

/** Positive-area overlap of convex footprints. Merely touching is not overlap. */
export function polygonsOverlap(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!, q = polygon[(i + 1) % polygon.length]!;
    const axis: Vec2 = [q[1] - p[1], p[0] - q[0]];
    if (Math.hypot(...axis) < EPS) continue;
    const project = (points: readonly Vec2[]) => points.map(v => v[0] * axis[0] + v[1] * axis[1]);
    const ap = project(a), bp = project(b);
    if (Math.min(Math.max(...ap), Math.max(...bp)) - Math.max(Math.min(...ap), Math.min(...bp)) <= EPS) return false;
  }
  return true;
}

function rectangle(x: number, y: number, width: number, depth: number): Vec2[] {
  return [[x, y], [x + width, y], [x + width, y + depth], [x, y + depth]];
}

/** A concave room edge cannot enter the open cell, even if all its corners are inside. */
function containedCell(cell: Vec2[], polygon: Vec2[]): boolean {
  if (!cell.every(p => pointInPolygon(p, polygon))) return false;
  const [x, y] = cell[0]!, [right, top] = cell[2]!;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    // Clip the boundary segment against the cell's open interior.
    let low = 0, high = 1;
    for (const [origin, delta, min, max] of [[a[0], b[0] - a[0], x + EPS, right - EPS], [a[1], b[1] - a[1], y + EPS, top - EPS]]) {
      if (Math.abs(delta!) < EPS) { if (origin! < min! || origin! > max!) high = -1; }
      else { const t1 = (min! - origin!) / delta!, t2 = (max! - origin!) / delta!; low = Math.max(low, Math.min(t1, t2)); high = Math.min(high, Math.max(t1, t2)); }
    }
    if (low <= high && high >= 0 && low <= 1) return false;
  }
  return true;
}

interface Obstacle { polygon: Vec2[]; opening_id?: string }
function doorGeometry(scene: Scene, opening: Opening) {
  const wall = scene.walls.find(w => w.id === opening.wall_id)!;
  const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  const along: Vec2 = [(wall.b[0] - wall.a[0]) / length, (wall.b[1] - wall.a[1]) / length];
  const outward = wallOutward(scene, wall), inward: Vec2 = [-outward[0], -outward[1]];
  const point: Vec2 = [wall.a[0] + along[0] * (opening.offset + opening.width / 2), wall.a[1] + along[1] * (opening.offset + opening.width / 2)];
  return { wall, along, inward, point };
}

function obstaclesForRoom(scene: Scene, room: Room): Obstacle[] {
  const obstacles: Obstacle[] = [...scene.items, ...scene.fixed].filter(i => i.room_id === room.id).map(item => ({ polygon: itemPolygon(item) }));
  for (const opening of scene.openings) {
    if (opening.kind !== 'door' || !opening.swing?.startsWith('inward')) continue;
    const { wall, along, inward } = doorGeometry(scene, opening);
    if (wall.room_id !== room.id) continue;
    const right = opening.swing.endsWith('right');
    const hinge: Vec2 = [wall.a[0] + along[0] * (opening.offset + (right ? opening.width : 0)), wall.a[1] + along[1] * (opening.offset + (right ? opening.width : 0))];
    const direction = right ? -1 : 1;
    // Circumscribed 5-degree arc: never underestimates a swept quarter circle.
    const segments = 18, step = Math.PI / 2 / segments, radius = opening.width / Math.cos(step / 2);
    const polygon: Vec2[] = [hinge];
    for (let i = 0; i <= segments; i++) {
      const theta = i * step;
      polygon.push([hinge[0] + radius * (direction * along[0] * Math.cos(theta) + inward[0] * Math.sin(theta)), hinge[1] + radius * (direction * along[1] * Math.cos(theta) + inward[1] * Math.sin(theta))]);
    }
    obstacles.push({ polygon, opening_id: opening.id });
  }
  return obstacles;
}

export interface RoomRaster {
  room_id: string; origin: Vec2; width: number; height: number; resolution: number;
  /** Row-major cells, 1 occupied (including any partially occupied cell), 0 free. */
  occupied: Uint8Array;
}

export function rasterizeRoom(scene: Scene, room: Room, resolution = SPACE_RESOLUTION_M): RoomRaster {
  if (!Number.isFinite(resolution) || resolution <= 0) throw new Error('Raster resolution must be positive');
  const x = Math.min(...room.polygon.map(p => p[0])), y = Math.min(...room.polygon.map(p => p[1]));
  const width = Math.ceil((Math.max(...room.polygon.map(p => p[0])) - x) / resolution - EPS);
  const height = Math.ceil((Math.max(...room.polygon.map(p => p[1])) - y) / resolution - EPS);
  if (width * height > 1_000_000) throw new Error(`Room ${room.id}: raster exceeds one million cells; split the room`);
  const occupied = new Uint8Array(width * height), obstacles = obstaclesForRoom(scene, room);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const cell = rectangle(x + col * resolution, y + row * resolution, resolution, resolution);
    if (!containedCell(cell, room.polygon) || obstacles.some(o => polygonsOverlap(cell, o.polygon))) occupied[row * width + col] = 1;
  }
  return { room_id: room.id, origin: [x, y], width, height, resolution, occupied };
}

export interface FreeRectangle { x: number; y: number; width: number; depth: number; area_m2: number }
function largestRectangle(grid: RoomRaster): FreeRectangle | null {
  const heights = new Int32Array(grid.width);
  let best: FreeRectangle | null = null, bestCells = 0;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) heights[x] = grid.occupied[y * grid.width + x] ? 0 : heights[x]! + 1;
    const stack: { x: number; height: number }[] = [];
    for (let x = 0; x <= grid.width; x++) {
      const height = x === grid.width ? 0 : heights[x]!;
      let start = x;
      while (stack.length && stack[stack.length - 1]!.height > height) {
        const previous = stack.pop()!, cells = previous.height * (x - previous.x);
        if (cells > bestCells) {
          bestCells = cells;
          best = { x: rounded(grid.origin[0] + previous.x * grid.resolution), y: rounded(grid.origin[1] + (y + 1 - previous.height) * grid.resolution), width: rounded((x - previous.x) * grid.resolution), depth: rounded(previous.height * grid.resolution), area_m2: rounded(cells * grid.resolution ** 2) };
        }
        start = previous.x;
      }
      if (height > 0 && (!stack.length || stack[stack.length - 1]!.height < height)) stack.push({ x: start, height });
    }
  }
  return best;
}

/** Exact squared Euclidean distance transform, lower envelope of parabolas. */
function distanceTransform1D(input: Float64Array): Float64Array {
  const n = input.length, positions = new Int32Array(n), boundaries = new Float64Array(n + 1), result = new Float64Array(n);
  let last = 0;
  positions[0] = 0; boundaries[0] = -Infinity; boundaries[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let p = positions[last]!, split = ((input[q]! + q * q) - (input[p]! + p * p)) / (2 * (q - p));
    while (split <= boundaries[last]!) { last--; p = positions[last]!; split = ((input[q]! + q * q) - (input[p]! + p * p)) / (2 * (q - p)); }
    last++; positions[last] = q; boundaries[last] = split; boundaries[last + 1] = Infinity;
  }
  last = 0;
  for (let q = 0; q < n; q++) { while (boundaries[last + 1]! < q) last++; const p = positions[last]!; result[q] = (q - p) ** 2 + input[p]!; }
  return result;
}

interface RoutingGrid { width: number; height: number; step: number; origin: Vec2; clearance: Float64Array }
function routingGrid(raster: RoomRaster): RoutingGrid {
  const width = raster.width * 2 + 1, height = raster.height * 2 + 1, distance = new Float64Array(width * height).fill(1e12);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (x === 0 || y === 0 || x === width - 1 || y === height - 1) distance[y * width + x] = 0;
  for (let y = 0; y < raster.height; y++) for (let x = 0; x < raster.width; x++) if (raster.occupied[y * raster.width + x]) {
    for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) distance[(y * 2 + dy) * width + x * 2 + dx] = 0;
  }
  for (let y = 0; y < height; y++) distance.set(distanceTransform1D(distance.slice(y * width, (y + 1) * width)), y * width);
  for (let x = 0; x < width; x++) {
    const column = new Float64Array(height);
    for (let y = 0; y < height; y++) column[y] = distance[y * width + x]!;
    const transformed = distanceTransform1D(column);
    for (let y = 0; y < height; y++) distance[y * width + x] = Math.sqrt(transformed[y]!) * raster.resolution;
  }
  // clearance is the diameter; half-cell lattice permits both odd/even cell corridor widths.
  return { width, height, step: raster.resolution / 2, origin: raster.origin, clearance: distance };
}

interface Endpoint { id: string; point: Vec2; node: number; aperture: number; narrowest: Vec2 }
function nodePoint(grid: RoutingGrid, node: number): Vec2 { return [rounded(grid.origin[0] + (node % grid.width) * grid.step), rounded(grid.origin[1] + Math.floor(node / grid.width) * grid.step)]; }
function nodeAt(grid: RoutingGrid, point: Vec2): number {
  const x = Math.round((point[0] - grid.origin[0]) / grid.step), y = Math.round((point[1] - grid.origin[1]) / grid.step);
  return x < 0 || y < 0 || x >= grid.width || y >= grid.height ? -1 : y * grid.width + x;
}

/** First positive ray intersection with a convex footprint, including sub-cell obstacles. */
function obstacleDistance(point: Vec2, direction: Vec2, polygon: Vec2[]): number {
  let entry = -Infinity, exit = Infinity;
  const winding = Math.sign(polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]!; return sum + p[0] * q[1] - p[1] * q[0]; }, 0));
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    const origin = cross(a, b, point) * winding;
    const slope = ((b[0] - a[0]) * direction[1] - (b[1] - a[1]) * direction[0]) * winding;
    if (Math.abs(slope) < EPS) { if (origin < -EPS) return Infinity; }
    else if (slope > 0) entry = Math.max(entry, -origin / slope);
    else exit = Math.min(exit, -origin / slope);
  }
  return exit > EPS && entry < exit - EPS ? Math.max(0, entry) : Infinity;
}

function roomExitDistance(point: Vec2, direction: Vec2, room: Room): number {
  let distance = Infinity;
  for (let i = 0; i < room.polygon.length; i++) {
    const a = room.polygon[i]!, b = room.polygon[(i + 1) % room.polygon.length]!;
    const edge: Vec2 = [b[0] - a[0], b[1] - a[1]], delta: Vec2 = [a[0] - point[0], a[1] - point[1]];
    const denominator = direction[0] * edge[1] - direction[1] * edge[0];
    if (Math.abs(denominator) < EPS) continue;
    const alongRay = (delta[0] * edge[1] - delta[1] * edge[0]) / denominator;
    const alongEdge = (delta[0] * direction[1] - delta[1] * direction[0]) / denominator;
    if (alongRay > EPS && alongEdge >= -EPS && alongEdge <= 1 + EPS) distance = Math.min(distance, alongRay);
  }
  return distance;
}

function rayFreeLength(point: Vec2, direction: Vec2, room: Room, obstacles: Obstacle[]): number {
  return Math.min(roomExitDistance(point, direction, room), ...obstacles.map(o => obstacleDistance(point, direction, o.polygon)));
}

/** Validate the entire straight ingress, then route from its interior approach point.
 * The door's own swing is traversable only for this ingress; its reserved sweep stays
 * occupied everywhere else. Entry width is checked separately from radial clearance
 * so the wall immediately behind a doorway cannot falsely reduce it to zero. */
function approach(grid: RoutingGrid, room: Room, obstacles: Obstacle[], point: Vec2, direction: Vec2, length: number, ignoredSwing?: string): Pick<Endpoint, 'node' | 'aperture' | 'narrowest'> {
  const blocking = obstacles.filter(o => !ignoredSwing || o.opening_id !== ignoredSwing);
  const limit = Math.min(length, rayFreeLength(point, direction, room, blocking));
  let best = -1, width = 0, bestDistance = 0;
  for (let d = grid.step / 2; d <= limit + EPS; d += grid.step / 2) {
    const position: Vec2 = [point[0] + direction[0] * d, point[1] + direction[1] * d];
    if (!pointInPolygon(position, room.polygon)) break;
    const node = nodeAt(grid, position);
    if (node >= 0 && grid.clearance[node]! > width + EPS) { best = node; width = grid.clearance[node]!; bestDistance = d; }
  }
  if (best < 0) return { node: -1, aperture: 0, narrowest: point };
  const perpendicular: Vec2 = [-direction[1], direction[0]], reverse: Vec2 = [direction[1], -direction[0]];
  let aperture = Infinity, narrowest = point;
  // Cross-sections change slope at projected polygon vertices. Check both sides of
  // every such event as well as regular samples, including arbitrarily thin throats.
  const distances = [1e-6, bestDistance];
  for (let d = grid.step / 2; d < bestDistance; d += grid.step / 2) distances.push(d);
  for (const polygon of [room.polygon, ...blocking.map(o => o.polygon)]) for (const vertex of polygon) {
    const d = (vertex[0] - point[0]) * direction[0] + (vertex[1] - point[1]) * direction[1];
    if (d > 1e-6 && d < bestDistance) distances.push(Math.max(1e-6, d - 1e-6), Math.min(bestDistance, d + 1e-6));
  }
  for (const d of distances) {
    const position: Vec2 = [point[0] + direction[0] * d, point[1] + direction[1] * d];
    const span = 2 * Math.min(rayFreeLength(position, perpendicular, room, blocking), rayFreeLength(position, reverse, room, blocking));
    if (span < aperture) { aperture = span; narrowest = position; }
  }
  return { node: best, aperture, narrowest: [rounded(narrowest[0]), rounded(narrowest[1])] };
}

function endpoints(scene: Scene, room: Room, grid: RoutingGrid): { doors: Endpoint[]; items: Endpoint[] } {
  const obstacles = obstaclesForRoom(scene, room), doors: Endpoint[] = [], items: Endpoint[] = [];
  for (const opening of scene.openings) {
    if (opening.kind === 'window') continue;
    const { wall, point, inward } = doorGeometry(scene, opening);
    if (wall.room_id !== room.id) continue;
    const swing = opening.kind === 'door' && opening.swing?.startsWith('inward') ? opening.id : undefined;
    const entry = approach(grid, room, obstacles, point, inward, 0.45 + (swing ? opening.width : 0), swing);
    doors.push({ id: `door:${opening.id}`, point, ...entry, aperture: Math.min(opening.width, entry.aperture), narrowest: opening.width <= entry.aperture ? point : entry.narrowest });
  }
  for (const item of scene.items.filter(i => i.room_id === room.id)) {
    const point = itemFront(item), radians = item.rot * Math.PI / 180;
    items.push({ id: `item:${item.id}`, point, ...approach(grid, room, obstacles, point, [Math.sin(radians), -Math.cos(radians)], 0.45) });
  }
  return { doors, items };
}

interface QueueEntry { node: number; width: number; steps: number }
class MaxQueue {
  private heap: QueueEntry[] = [];
  private better(a: QueueEntry, b: QueueEntry) { return a.width > b.width + EPS || (Math.abs(a.width - b.width) < EPS && a.steps < b.steps); }
  push(entry: QueueEntry) {
    let i = this.heap.length; this.heap.push(entry);
    while (i > 0) { const p = (i - 1) >> 1; if (!this.better(entry, this.heap[p]!)) break; this.heap[i] = this.heap[p]!; i = p; }
    this.heap[i] = entry;
  }
  pop(): QueueEntry | undefined {
    const first = this.heap[0], last = this.heap.pop();
    if (this.heap.length && last) {
      let i = 0;
      while (i * 2 + 1 < this.heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.heap.length && this.better(this.heap[child + 1]!, this.heap[child]!)) child++;
        if (!this.better(this.heap[child]!, last)) break;
        this.heap[i] = this.heap[child]!; i = child;
      }
      this.heap[i] = last;
    }
    return first;
  }
}

export interface Walkway {
  from: string; to: string; reachable: boolean; width_m: number;
  status: 'fail' | 'warn' | 'adequate' | 'good'; narrowest: Vec2; path: Vec2[];
}
function status(width: number): Walkway['status'] { return width < 0.6 - EPS ? 'fail' : width < 0.75 - EPS ? 'warn' : width < 0.9 - EPS ? 'adequate' : 'good'; }
function neighbors(grid: RoutingGrid, node: number): number[] {
  const x = node % grid.width, y = Math.floor(node / grid.width), result: number[] = [];
  if (x > 0) result.push(node - 1); if (x < grid.width - 1) result.push(node + 1);
  if (y > 0) result.push(node - grid.width); if (y < grid.height - 1) result.push(node + grid.width);
  return result;
}

function walkway(grid: RoutingGrid, from: Endpoint, to: Endpoint): Walkway {
  const failure = (point: Vec2): Walkway => ({ from: from.id, to: to.id, reachable: false, width_m: 0, status: 'fail', narrowest: point, path: [] });
  if (from.node < 0 || to.node < 0) return failure(from.node < 0 ? from.point : to.point);
  const count = grid.width * grid.height, widths = new Float64Array(count).fill(-1), steps = new Int32Array(count).fill(2 ** 30), previous = new Int32Array(count).fill(-1), queue = new MaxQueue();
  widths[from.node] = Math.min(grid.clearance[from.node]!, from.aperture, to.aperture); steps[from.node] = 0;
  queue.push({ node: from.node, width: widths[from.node]!, steps: 0 });
  let current: QueueEntry | undefined, nearestBlock = from.point, nearestDistance = Infinity;
  const destination = nodePoint(grid, to.node);
  while ((current = queue.pop())) {
    if (current.width < widths[current.node]! - EPS || current.steps > steps[current.node]!) continue;
    if (current.node === to.node) break;
    for (const next of neighbors(grid, current.node)) {
      const width = Math.min(current.width, grid.clearance[next]!);
      if (width <= EPS) {
        const point = nodePoint(grid, next), distance = Math.hypot(point[0] - destination[0], point[1] - destination[1]);
        if (distance < nearestDistance) { nearestBlock = point; nearestDistance = distance; }
        continue;
      }
      const nextSteps = current.steps + 1;
      if (width > widths[next]! + EPS || (Math.abs(width - widths[next]!) <= EPS && nextSteps < steps[next]!)) {
        widths[next] = width; steps[next] = nextSteps; previous[next] = current.node; queue.push({ node: next, width, steps: nextSteps });
      }
    }
  }
  if (widths[to.node]! < 0) return failure(nearestBlock);
  const nodes: number[] = [];
  for (let node = to.node; node !== -1; node = previous[node]!) nodes.push(node);
  nodes.reverse();
  const width = rounded(widths[to.node]!);
  const narrowNode = nodes.find(node => grid.clearance[node]! <= width + EPS);
  const narrowest = narrowNode === undefined ? (from.aperture <= to.aperture ? from.narrowest : to.narrowest) : nodePoint(grid, narrowNode);
  // Collinear samples add no information to the returned path.
  const path = [from.point, ...nodes.filter((node, i) => i === 0 || i === nodes.length - 1 || node - nodes[i - 1]! !== nodes[i + 1]! - node).map(node => nodePoint(grid, node)), to.point];
  return { from: from.id, to: to.id, reachable: true, width_m: width, status: status(width), narrowest, path };
}

export interface RoomSpaceMetrics { room_id: string; free_area_m2: number; largest_free_rectangle: FreeRectangle | null; walkways: Walkway[] }
export interface SpaceMetrics { rooms: RoomSpaceMetrics[]; free_area_m2: number }

/** Pure conservative raster metrics; dimensions and returned coordinates are metres. */
export function spaceMetrics(scene: Scene, ops: readonly Op[] = []): SpaceMetrics {
  const copy = applyOps(scene, ops);
  const rooms = copy.rooms.map(room => {
    const raster = rasterizeRoom(copy, room), grid = routingGrid(raster), ends = endpoints(copy, room, grid), walkways: Walkway[] = [];
    for (let i = 0; i < ends.doors.length; i++) {
      const door = ends.doors[i]!;
      for (let j = i + 1; j < ends.doors.length; j++) walkways.push(walkway(grid, door, ends.doors[j]!));
      for (const item of ends.items) walkways.push(walkway(grid, door, item));
    }
    const freeCells = raster.occupied.reduce((count, value) => count + (value === 0 ? 1 : 0), 0);
    return { room_id: room.id, free_area_m2: rounded(freeCells * raster.resolution ** 2), largest_free_rectangle: largestRectangle(raster), walkways };
  });
  return { rooms, free_area_m2: rounded(rooms.reduce((sum, room) => sum + room.free_area_m2, 0)) };
}
