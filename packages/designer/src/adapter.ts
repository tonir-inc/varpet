import { z } from 'zod';
import type { Scene, Wall } from './scene.js';

const num = z.number().finite();
const point = z.tuple([num, num]);
const id = z.string().min(1);
const item = z.object({
  id, room_id: id, kind: id, name: z.string(), pos: point, rot: num,
  size: z.tuple([num.positive(), num.positive(), num.positive()]), keep: z.boolean(),
  sku: id.optional(), price: num.int().nonnegative().optional(), vendor: z.string().optional(),
});
const sceneInput = z.object({
  north_deg: num.optional(),
  rooms: z.array(z.object({ id, name: z.string().optional(), polygon: z.array(point).min(3) })),
  walls: z.array(z.object({ id, room_id: id, a: point, b: point, open: z.boolean().optional() })),
  openings: z.array(z.object({
    id, wall_id: id, kind: z.enum(['door', 'window', 'passage']), offset: num.nonnegative(),
    width: num.positive(), height: num.positive(), sill: num.nonnegative(),
    swing: z.enum(['inward-left','inward-right','outward-left','outward-right','none']).optional(),
  })),
  items: z.array(item), fixed: z.array(item),
});

/** All external scene input and future engine calls cross this adapter. */
export function parseScene(input: unknown): Scene {
  const scene = sceneInput.parse(input);
  const ids = new Set<string>();
  for (const entity of [...scene.rooms, ...scene.walls, ...scene.openings, ...scene.items, ...scene.fixed]) {
    if (ids.has(entity.id)) throw new Error(`Duplicate id: ${entity.id}`);
    ids.add(entity.id);
  }
  for (const room of scene.rooms) {
    const area = room.polygon.reduce((sum, p, i) => { const q = room.polygon[(i+1)%room.polygon.length]!; return sum + p[0]*q[1]-q[0]*p[1]; }, 0);
    if (Math.abs(area) < 1e-8) throw new Error(`Room ${room.id} has zero area`);
  }
  for (const entity of [...scene.walls, ...scene.items, ...scene.fixed]) {
    if (!scene.rooms.some(r => r.id === entity.room_id)) throw new Error(`${entity.id}: unknown room ${entity.room_id}`);
  }
  for (const wall of scene.walls) if (Math.hypot(wall.b[0]-wall.a[0], wall.b[1]-wall.a[1]) < 1e-8) throw new Error(`${wall.id}: zero-length wall`);
  for (const opening of scene.openings) {
    const wall = scene.walls.find(w => w.id === opening.wall_id);
    if (!wall) throw new Error(`${opening.id}: unknown wall ${opening.wall_id}`);
    if (opening.offset + opening.width > Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]) + 1e-8) throw new Error(`${opening.id}: opening exceeds wall span`);
  }
  return scene;
}

export function wallCompass(scene: Scene, wall: Wall): string {
  if (scene.north_deg === undefined) return 'unknown';
  const polygon = scene.rooms.find(r => r.id === wall.room_id)!.polygon;
  const center = polygon.reduce((p,q) => [p[0]!+q[0]/polygon.length,p[1]!+q[1]/polygon.length], [0,0]);
  let dx = wall.b[1]-wall.a[1], dy = wall.a[0]-wall.b[0];
  if (dx*(center[0]!-(wall.a[0]+wall.b[0])/2)+dy*(center[1]!-(wall.a[1]+wall.b[1])/2)>0) { dx = -dx; dy = -dy; }
  const angle = ((Math.atan2(dx,dy)*180/Math.PI-scene.north_deg)%360+360)%360;
  return ['north','northeast','east','southeast','south','southwest','west','northwest'][Math.round(angle/45)%8]!;
}

export function sceneSummary(scene: Scene, roomIds?: string[]) {
  if (roomIds) for (const id of roomIds) if (!scene.rooms.some(r=>r.id===id)) throw new Error(`Unknown room: ${id}`);
  const selected = (id: string) => roomIds === undefined || roomIds.includes(id);
  const walls = scene.walls.filter(w => selected(w.room_id));
  return structuredClone({
    north_deg: scene.north_deg ?? null,
    coordinate_convention: 'metres; x right, y plan-up; rot counterclockwise; front local -y; north_deg clockwise from plan-up',
    rooms: scene.rooms.filter(r=>selected(r.id)),
    walls: walls.map(w=>({ ...w, compass: wallCompass(scene,w) })),
    openings: scene.openings.filter(o=>walls.some(w=>w.id===o.wall_id)),
    items: scene.items.filter(i=>selected(i.room_id)), fixed: scene.fixed.filter(i=>selected(i.room_id)),
    metrics: { status: 'not implemented yet' },
  });
}
