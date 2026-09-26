import { z } from 'zod';
import type { Scene, Wall, Op, Vec2 } from './scene.js';

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

/** Preview only. Kept and fixed items are immutable; all callers receive a fresh scene. */
export function applyOps(scene: Scene, ops: readonly Op[] = []): Scene {
  const copy = parseScene(scene);
  for (const op of ops) {
    if (op.type === 'add') {
      if ([...copy.items,...copy.fixed,...copy.rooms,...copy.walls,...copy.openings].some(i=>i.id===op.item.id)) throw new Error(`Duplicate id: ${op.item.id}`);
      copy.items.push(structuredClone(op.item));
      continue;
    }
    const index = copy.items.findIndex(i=>i.id===op.id);
    if (index < 0) throw new Error(`Unknown or fixed item: ${op.id}`);
    const target = copy.items[index]!;
    if (target.keep) throw new Error(`Kept item cannot change: ${op.id}`);
    if (op.type === 'remove') copy.items.splice(index,1);
    else if (op.type === 'move') {
      target.pos = [...op.pos];
      if (op.rot !== undefined) target.rot = op.rot;
      if (op.room_id !== undefined) target.room_id = op.room_id;
    } else throw new Error('Unknown operation');
  }
  return parseScene(copy);
}

export function wallOutward(scene: Scene, wall: Wall): Vec2 {
  const polygon = scene.rooms.find(r => r.id === wall.room_id)!.polygon;
  const inside = (point: Vec2) => {
    let hit = false;
    for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const a=polygon[i]!,b=polygon[j]!;
      if ((a[1]>point[1]) !== (b[1]>point[1]) && point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) hit=!hit;
    }
    return hit;
  };
  const length = Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
  const dx=(wall.b[1]-wall.a[1])/length,dy=(wall.a[0]-wall.b[0])/length;
  const middle: Vec2=[(wall.a[0]+wall.b[0])/2,(wall.a[1]+wall.b[1])/2];
  const positive=inside([middle[0]+dx*1e-5,middle[1]+dy*1e-5]);
  const negative=inside([middle[0]-dx*1e-5,middle[1]-dy*1e-5]);
  if (positive === negative) throw new Error(`Wall ${wall.id} is not on the boundary of room ${wall.room_id}`);
  return positive ? [-dx,-dy] : [dx,dy];
}

export function wallCompass(scene: Scene, wall: Wall): string {
  if (scene.north_deg === undefined) return 'unknown';
  const [dx,dy]=wallOutward(scene,wall);
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
