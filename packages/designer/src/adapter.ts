import { z } from 'zod';
import type { Scene, Wall, Op, Vec2 } from './scene.js';

const num = z.number().finite();
const point = z.tuple([num, num]);
const id = z.string().min(1);
export const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use six-digit hex colour #RRGGBB').transform(value => value.toLowerCase());
export const colorTargetSchema = z.object({ target: z.enum(['item','wall']), id, color: colorSchema }).strict();
const item = z.object({
  id, room_id: id, kind: id, name: z.string(), pos: point, rot: num,
  size: z.tuple([num.positive(), num.positive(), num.positive()]), keep: z.boolean(),
  sku: id.optional(), price: num.int().nonnegative().optional(), vendor: z.string().optional(), color: colorSchema.optional(), group_id: id.optional(),
});
const sceneInput = z.object({
  north_deg: num.optional(),
  rooms: z.array(z.object({ id, name: z.string().optional(), polygon: z.array(point).min(3) })),
  walls: z.array(z.object({ id, room_id: id, a: point, b: point, open: z.boolean().optional(), color: colorSchema.optional(), source_id: id.optional(), keep: z.boolean().optional(), thickness: num.nonnegative().optional(), height: num.positive().optional() })),
  openings: z.array(z.object({
    id, wall_id: id, kind: z.enum(['door', 'window', 'passage']), offset: num.nonnegative(),
    width: num.positive(), height: num.positive(), sill: num.nonnegative(),
    swing: z.enum(['inward-left','inward-right','outward-left','outward-right','none']).optional(),
  })),
  items: z.array(item), fixed: z.array(item),
});

export const opsSchema = z.array(z.discriminatedUnion('type', [
  z.object({type:z.literal('move'),id,pos:point,rot:num.optional(),room_id:id.optional()}).strict(),
  z.object({type:z.literal('add'),item:item.strict()}).strict(),
  z.object({type:z.literal('remove'),id}).strict(),
  colorTargetSchema.extend({type:z.literal('color')}).strict(),
])).max(200);

export function parseOps(input:unknown):Op[] { return opsSchema.parse(input); }

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
  for (const op of parseOps(ops)) {
    if (op.type === 'add') {
      if ([...copy.items,...copy.fixed,...copy.rooms,...copy.walls,...copy.openings].some(i=>i.id===op.item.id)) throw new Error(`Duplicate id: ${op.item.id}`);
      copy.items.push(structuredClone(op.item));
      continue;
    }
    if (op.type === 'color' && op.target === 'wall') {
      const wall = copy.walls.find(wall => wall.id === op.id);
      if (!wall || wall.open) throw new Error(`Unknown or open wall: ${op.id}`);
      const segments = copy.walls.filter(other => other.id === wall.id || (wall.source_id !== undefined && other.source_id === wall.source_id));
      if (segments.some(segment => segment.keep)) throw new Error(`Kept or locked wall cannot change: ${op.id}`);
      for (const segment of segments) segment.color = op.color;
      continue;
    }
    const index = copy.items.findIndex(i=>i.id===op.id);
    if (index < 0) throw new Error(`Unknown or fixed item: ${op.id}`);
    const target = copy.items[index]!;
    if (target.keep) throw new Error(`Kept item cannot change: ${op.id}`);
    if (op.type === 'color') target.color = op.color;
    else if (op.type === 'remove') {
      copy.items.splice(index,1);
      if (target.group_id) {
        const remaining = copy.items.filter(item => item.group_id === target.group_id);
        if (remaining.length === 1) delete remaining[0]!.group_id;
      }
    }
    else if (op.type === 'move') {
      const members = target.group_id ? [...copy.items,...copy.fixed].filter(item => item.group_id === target.group_id) : [target];
      if (members.some(item => item.keep || copy.fixed.includes(item))) throw new Error(`Kept or fixed group member cannot move: ${op.id}`);
      const delta = (op.rot ?? target.rot) - target.rot, radians = delta * Math.PI / 180;
      const cosine = Math.cos(radians), sine = Math.sin(radians), [x,y] = target.pos;
      for (const member of members) if (member !== target) {
        const dx = member.pos[0] - x, dy = member.pos[1] - y;
        member.pos = [op.pos[0] + cosine * dx - sine * dy, op.pos[1] + sine * dx + cosine * dy];
        member.rot += delta;
        if (op.room_id !== undefined && op.room_id !== target.room_id) member.room_id = op.room_id;
      }
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
  // Probe beyond the physical face: architect room polygons may stop there,
  // while editor demo polygons include the centreline. Neither is moved.
  const probe = (wall.thickness ?? 0) / 2 + 1e-5;
  const positive=inside([middle[0]+dx*probe,middle[1]+dy*probe]);
  const negative=inside([middle[0]-dx*probe,middle[1]-dy*probe]);
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
    appearance: 'color ops accept #RRGGBB for item or wall. A wall color paints both faces and all segments sharing source_id. Missing wall color can mean mixed face finishes. Paint and labour are not quoted.',
    groups: 'Moving one item with group_id rigidly moves and rotates every member; place and propose validate all members. Colour changes affect only the selected item.',
    rooms: scene.rooms.filter(r=>selected(r.id)),
    walls: walls.map(w=>({ ...w, compass: wallCompass(scene,w) })),
    openings: scene.openings.filter(o=>walls.some(w=>w.id===o.wall_id)),
    items: scene.items.filter(i=>selected(i.room_id)), fixed: scene.fixed.filter(i=>selected(i.room_id)),
    metrics: { status: 'not implemented yet' },
  });
}
