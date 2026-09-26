import type { CeilingDesign, CeilingStyle, Operation, Room, SceneDocument, Vec2, Vec3 } from '../contracts';
import { hasRoomCeiling, roomCeilingHeight } from './heights';

export const CEILING_PRESETS: ReadonlyArray<{ id: CeilingStyle; name: string; description: string; design: CeilingDesign }> = [
  { id: 'quiet', name: 'Recessed spots', description: 'Small, flush downlights arranged across a simple ceiling.', design: { style: 'quiet', drop: 0, inset: .55, brightness: 70, temperature: 3000, enabled: true } },
  { id: 'soft-glow', name: 'LED cove', description: 'A dropped plaster panel with concealed LED strips and a soft edge glow.', design: { style: 'soft-glow', drop: .16, inset: .35, brightness: 65, temperature: 2700, enabled: true } },
  { id: 'architectural', name: 'Track lights', description: 'Two slim black ceiling rails with continuous linear LED lights.', design: { style: 'architectural', drop: .06, inset: .6, brightness: 80, temperature: 3000, enabled: true } },
];

export function defaultCeilingDesign(style: CeilingStyle): CeilingDesign {
  const preset = CEILING_PRESETS.find(candidate => candidate.id === style);
  if (!preset) throw new Error('Choose a known ceiling design.');
  return { ...preset.design };
}

export interface CeilingElement {
  kind: 'spot' | 'strip' | 'panel' | 'track';
  /** Physical bottom centre in world coordinates, matching building components. */
  position: Vec3;
  dimensions: Vec3;
  rotation: number;
}
export interface CeilingLayout {
  roomId: string;
  style: CeilingStyle;
  design: CeilingDesign;
  /** Structural ceiling underside, before decorative drop. */
  ceilingY: number;
  elements: CeilingElement[];
}

export function ceilingDesignError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return 'Ceiling design must be a plain object.';
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !['style', 'drop', 'inset', 'brightness', 'temperature', 'enabled'].includes(key))) return 'Ceiling design contains unsupported fields.';
  if (typeof data.style !== 'string' || !['quiet', 'soft-glow', 'architectural'].includes(data.style) || typeof data.enabled !== 'boolean') return 'Ceiling design needs a known style and light state.';
  for (const [key, low, high] of [['drop', 0, .6], ['inset', .15, 2], ['brightness', 0, 100], ['temperature', 2200, 6500]] as const) {
    const number = data[key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < low || number > high) return `Ceiling ${key} must be between ${low} and ${high}.`;
  }
  if (data.style === 'soft-glow' && (data.drop as number) < .1) return 'Soft Glow needs a drop of at least 0.10 m for its panel and concealed lights.';
  return null;
}

export function buildCeilingDesignOperations(scene: SceneDocument, roomId: string, design: CeilingDesign | null): Operation[] {
  const room = scene.rooms.find(candidate => candidate.id === roomId);
  if (!room) throw new Error('Select an existing room for its ceiling design.');
  const metadata = scene.project?.metadata[roomId];
  if (metadata?.locked) throw new Error('Unlock this room before changing its ceiling design.');
  if (design !== null) {
    if (metadata?.phase === 'remove') throw new Error('Restore this room before changing its ceiling design.');
    if (!hasRoomCeiling(scene, room)) throw new Error('This outdoor room has no ceiling.');
    const error = ceilingDesignError(design); if (error) throw new Error(error);
    createLayout(scene, room, design);
  }
  if (design === null ? metadata?.ceilingDesign == null : metadata?.ceilingDesign && Object.entries(design).every(([key, value]) => metadata.ceilingDesign![key as keyof CeilingDesign] === value)) return [];
  const operations: Operation[] = [{ type: 'set-metadata', id: roomId, patch: { ceilingDesign: design === null ? null : { ...design } } }];
  return scene.project ? operations : [{ type: 'migrate-project' }, ...operations];
}

const EPS = 1e-7;
type Rectangle = { minX: number; maxX: number; minZ: number; maxZ: number };
function inside(point: Vec2, polygon: Vec2[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!, b = polygon[i]!;
    const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    if (Math.abs(cross) < EPS && point[0] >= Math.min(a[0], b[0]) - EPS && point[0] <= Math.max(a[0], b[0]) + EPS && point[1] >= Math.min(a[1], b[1]) - EPS && point[1] <= Math.max(a[1], b[1]) + EPS) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < a[0] + (point[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) hit = !hit;
  }
  return hit;
}

/** A boundary segment inside the rectangle reveals a concave notch even if every corner is inside. */
function boundaryEnters(a: Vec2, b: Vec2, rectangle: Rectangle): boolean {
  let low = 0, high = 1;
  for (const [axis, min, max] of [[0, rectangle.minX + EPS, rectangle.maxX - EPS], [1, rectangle.minZ + EPS, rectangle.maxZ - EPS]] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < EPS) { if (a[axis] < min || a[axis] > max) return false; }
    else {
      const t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta;
      low = Math.max(low, Math.min(t1, t2)); high = Math.min(high, Math.max(t1, t2));
      if (low > high) return false;
    }
  }
  return low <= high;
}
function rectangleInside(rectangle: Rectangle, polygon: Vec2[]): boolean {
  return ([[rectangle.minX, rectangle.minZ], [rectangle.maxX, rectangle.minZ], [rectangle.maxX, rectangle.maxZ], [rectangle.minX, rectangle.maxZ]] as Vec2[]).every(point => inside(point, polygon))
    && !polygon.some((point, i) => boundaryEnters(point, polygon[(i + 1) % polygon.length]!, rectangle));
}

/** First-version designs occupy one safe axis-aligned rectangle, including in irregular rooms. */
function innerRectangle(polygon: Vec2[]): Rectangle | null {
  const minX = Math.min(...polygon.map(point => point[0])), maxX = Math.max(...polygon.map(point => point[0]));
  const minZ = Math.min(...polygon.map(point => point[1])), maxZ = Math.max(...polygon.map(point => point[1]));
  const bounds = { minX, maxX, minZ, maxZ };
  if (rectangleInside(bounds, polygon)) return bounds;
  const coordinates = (axis: 0 | 1, min: number, max: number) => {
    const values = [...polygon.map(point => point[axis]), ...Array.from({ length: 9 }, (_, i) => min + (max - min) * i / 8)].sort((a, b) => a - b).filter((value, i, values) => i === 0 || value - values[i - 1]! > EPS);
    // At most 16×16 cells regardless of vertex count. Every chosen cell still gets an exact boundary test.
    return values.length <= 17 ? values : Array.from({ length: 17 }, (_, i) => values[Math.floor(i * (values.length - 1) / 16)]!);
  };
  const xs = coordinates(0, minX, maxX), zs = coordinates(1, minZ, maxZ);
  const cells = zs.slice(1).map((z, row) => xs.slice(1).map((x, column) => rectangleInside({ minX: xs[column]!, maxX: x, minZ: zs[row]!, maxZ: z }, polygon)));
  let best: Rectangle | null = null, bestArea = 0;
  for (let start = 0; start < cells.length; start++) {
    const columns = Array<boolean>(xs.length - 1).fill(true);
    for (let end = start; end < cells.length; end++) {
      let run = -1;
      for (let column = 0; column <= columns.length; column++) {
        if (column < columns.length) columns[column] = columns[column]! && cells[end]![column]!;
        if (column < columns.length && columns[column]) { if (run < 0) run = column; }
        else if (run >= 0) {
          const area = (xs[column]! - xs[run]!) * (zs[end + 1]! - zs[start]!);
          if (area > bestArea + EPS) { bestArea = area; best = { minX: xs[run]!, maxX: xs[column]!, minZ: zs[start]!, maxZ: zs[end + 1]! }; }
          run = -1;
        }
      }
    }
  }
  return best;
}

function createLayout(scene: SceneDocument, room: Room, design: CeilingDesign): CeilingLayout {
  const rectangle = innerRectangle(room.polygon);
  const width = rectangle ? rectangle.maxX - rectangle.minX - design.inset * 2 : 0;
  const depth = rectangle ? rectangle.maxZ - rectangle.minZ - design.inset * 2 : 0;
  const minimum = design.style === 'quiet' ? .16 : .4;
  if (!rectangle || width < minimum || depth < minimum) throw new Error('This design needs a larger rectangular area inside the room. Reduce the inset or choose another room.');
  const height = roomCeilingHeight(scene, room);
  if (height - design.drop < 2) throw new Error('This ceiling design needs at least 2 m below its drop. Reduce the drop or increase the room height.');
  const ceilingY = (scene.project?.metadata[room.id]?.elevation ?? 0) + height;
  const x = (rectangle.minX + rectangle.maxX) / 2, z = (rectangle.minZ + rectangle.maxZ) / 2;
  const elements: CeilingElement[] = [];
  const add = (kind: CeilingElement['kind'], position: Vec3, dimensions: Vec3) => elements.push({ kind, position, dimensions, rotation: 0 });
  if (design.style === 'quiet') {
    const countX = width >= 2 ? 2 : 1, countZ = depth >= 3 ? 3 : depth >= 1.4 ? 2 : 1;
    for (let i = 0; i < countX; i++) for (let j = 0; j < countZ; j++) add('spot', [x + (i - (countX - 1) / 2) * (width - .12) / Math.max(1, countX - 1), ceilingY - design.drop - .035, z + (j - (countZ - 1) / 2) * (depth - .12) / Math.max(1, countZ - 1)], [.12, .035, .12]);
  } else if (design.style === 'soft-glow') {
    const bottom = ceilingY - design.drop;
    add('panel', [x, bottom, z], [width, .06, depth]);
    for (const side of [-1, 1]) {
      add('strip', [x + side * (width / 2 - .045), bottom + .065, z], [.018, .015, depth - .09]);
      add('strip', [x, bottom + .065, z + side * (depth / 2 - .045)], [width - .09, .015, .018]);
    }
  } else {
    const alongZ = depth >= width;
    for (const side of [-1, 1]) {
      const px = x + (alongZ ? side * width / 3 : 0), pz = z + (alongZ ? 0 : side * depth / 3);
      add('track', [px, ceilingY - design.drop - .04, pz], alongZ ? [.065, .04, depth] : [width, .04, .065]);
      add('strip', [px, ceilingY - design.drop - .055, pz], alongZ ? [.025, .015, depth - .04] : [width - .04, .015, .025]);
    }
  }
  return { roomId: room.id, style: design.style, design: { ...design }, ceilingY, elements };
}

export function layoutCeilingDesign(scene: SceneDocument, room: Room): CeilingLayout | null {
  const metadata = scene.project?.metadata[room.id], design = metadata?.ceilingDesign;
  if (!design || metadata?.phase === 'remove' || !hasRoomCeiling(scene, room)) return null;
  const error = ceilingDesignError(design); if (error) throw new Error(error);
  return createLayout(scene, room, design);
}

/** Follow the occupied room as a camera moves; overlapping floors prefer the nearest floor below it. */
export function ceilingDesignRoomAt(scene: SceneDocument, position: Vec3): string | undefined {
  if (!position.every(Number.isFinite)) return undefined;
  let roomId: string | undefined, closestFloor = -Infinity;
  for (const room of scene.rooms) {
    const metadata = scene.project?.metadata[room.id];
    if (metadata?.phase === 'remove' || !hasRoomCeiling(scene, room)) continue;
    const floor = metadata?.elevation ?? 0;
    if (floor <= closestFloor || position[1] < floor - EPS || !inside([position[0], position[2]], room.polygon)) continue;
    if (position[1] > floor + roomCeilingHeight(scene, room) + EPS) continue;
    roomId = room.id; closestFloor = floor;
  }
  return roomId;
}
