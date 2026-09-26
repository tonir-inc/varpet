import { createHash } from 'node:crypto';
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
  structure: z.object({wall_id:id,bottom_m:num.nonnegative()}).optional(),
  sku: id.optional(), price: num.int().nonnegative().optional(), vendor: z.string().optional(), color: colorSchema.optional(), group_id: id.optional(),
  on: id.optional(), mount: z.enum(['wall','ceiling']).optional(),
});
const sceneInput = z.object({
  north_deg: num.optional(),
  geometry_audit: z.object({tolerance_m:num.nonnegative(),adjustments:z.array(z.object({room_id:id,vertex:num.int().nonnegative(),before:point,after:point,distance_m:num.nonnegative()})),warnings:z.array(z.string()),obstacle_wall_ids:z.array(id),opening_room_ids:z.record(z.string(),z.array(id))}).optional(),
  rooms: z.array(z.object({ id, name: z.string().optional(), polygon: z.array(point).min(3), zone: z.enum(['balcony','loggia','terrace']).optional() })),
  walls: z.array(z.object({ id, room_id: id, a: point, b: point, open: z.boolean().optional(), color: colorSchema.optional(), source_id: id.optional(), keep: z.boolean().optional(), thickness: num.nonnegative().optional(), height: num.positive().optional() })),
  openings: z.array(z.object({
    id, wall_id: id, kind: z.enum(['door', 'window', 'passage']), offset: num.nonnegative(),
    width: num.positive(), height: num.positive(), sill: num.nonnegative(),
    room_ids: z.array(id).optional(),
    swing: z.enum(['inward-left','inward-right','outward-left','outward-right','none']).optional(),
  })),
  items: z.array(item), fixed: z.array(item),
});

export const opsSchema = z.array(z.discriminatedUnion('type', [
  z.object({type:z.literal('move'),id,pos:point,rot:num.optional(),room_id:id.optional(),on:id.nullable().optional()}).strict(),
  z.object({type:z.literal('add'),item:item.strict()}).strict(),
  z.object({type:z.literal('remove'),id}).strict(),
  colorTargetSchema.extend({type:z.literal('color')}).strict(),
])).max(200);

export function parseOps(input:unknown):Op[] { return opsSchema.parse(input); }

/** Proposal base fingerprint. Room zone only selects a program, so it is left out and proposals saved
 * before zones crossed the bridge stay valid. */
export function sceneDigest(scene: Scene): string {
  return createHash('sha256').update(JSON.stringify({ ...scene, rooms: scene.rooms.map(({ zone: _zone, ...room }) => room) })).digest('hex');
}

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
  if(scene.items.some(i=>i.structure))throw new Error('Structural obstacles must be fixed');
  if(scene.fixed.some(i=>i.on!==undefined||i.mount!==undefined))throw new Error('Fixed items cannot rest on furniture or hang');
  if(scene.items.some(i=>i.on!==undefined&&i.mount!==undefined))throw new Error('An item either rests on furniture or hangs, not both');
  // Supports are movable furniture. Fit (surface kind, footprint) is a layout check, not a parse error.
  for (const item of scene.items) {
    const seen = new Set<string>([item.id]);
    for (let current: typeof item | undefined = item; current?.on !== undefined; current = scene.items.find(i => i.id === current!.on)) {
      if (!scene.items.some(i => i.id === current!.on)) throw new Error(`${current.id}: unknown support ${current.on}`);
      if (seen.has(current.on)) throw new Error(`${item.id}: cyclic furniture support`);
      seen.add(current.on);
    }
  }
  if(scene.fixed.some(i=>i.structure&&!i.keep))throw new Error('Structural obstacles must be kept');
  for (const wall of scene.walls) if (Math.hypot(wall.b[0]-wall.a[0], wall.b[1]-wall.a[1]) < 1e-8) throw new Error(`${wall.id}: zero-length wall`);
  for (const opening of scene.openings) {
    if(opening.room_ids?.some(id=>!scene.rooms.some(r=>r.id===id)))throw new Error(`${opening.id}: unknown adjacent room`);
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
      if (op.item.on !== undefined && !copy.items.some(i => i.id === op.item.on)) throw new Error(`Unknown support: ${op.item.on}`);
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
      const resting = copy.items.find(item => item.on === target.id);
      if (resting) throw new Error(`Remove or move ${resting.id} before removing its support ${target.id}`);
      copy.items.splice(index,1);
      if (target.group_id) {
        const remaining = copy.items.filter(item => item.group_id === target.group_id);
        if (remaining.length === 1) delete remaining[0]!.group_id;
      }
    }
    else if (op.type === 'move') {
      const members = target.group_id ? [...copy.items,...copy.fixed].filter(item => item.group_id === target.group_id) : [target];
      // Items resting on a moved piece travel with it rigidly (editor followSupports).
      for (let i = 0; i < members.length; i++) for (const child of copy.items) if (child.on === members[i]!.id && !members.includes(child)) members.push(child);
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
      if (op.on === null) delete target.on;
      else if (op.on !== undefined) {
        if (!copy.items.some(i => i.id === op.on) || members.some(m => m.id === op.on)) throw new Error(`Invalid support for ${op.id}: ${op.on}`);
        target.on = op.on;
      }
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
  const probe = (wall.thickness ?? 0) / 2;
  // Test actual boundary-edge spans, rather than assuming the wall midpoint is beside floor.
  // A column/corner cap can put that midpoint outside the room even for a valid face segment.
  const candidates:{t:number;distance:number}[]=[{t:.5,distance:probe+1e-5}];
  const tolerance=scene.geometry_audit?.tolerance_m??.0005;
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!;
    const project=(p:Vec2)=>((p[0]-wall.a[0])*(wall.b[0]-wall.a[0])+(p[1]-wall.a[1])*(wall.b[1]-wall.a[1]))/(length*length);
    const side=(p:Vec2)=>(p[0]-wall.a[0])*dx+(p[1]-wall.a[1])*dy;
    const low=Math.max(0,Math.min(project(a),project(b))),high=Math.min(1,Math.max(project(a),project(b)));
    if(high-low<1e-6||Math.abs(side(a)-side(b))>2*tolerance+1e-7)continue;
    if(Math.max(Math.abs(side(a)),Math.abs(side(b)))>probe+tolerance+1e-7)continue;
    candidates.push({t:(low+high)/2,distance:Math.max(probe,Math.abs(side(a)),Math.abs(side(b)))+1e-5});
  }
  let sign:number|undefined;
  for(const {t,distance} of candidates) {
    const middle:Vec2=[wall.a[0]+(wall.b[0]-wall.a[0])*t,wall.a[1]+(wall.b[1]-wall.a[1])*t];
    const positive=inside([middle[0]+dx*distance,middle[1]+dy*distance]);
    const negative=inside([middle[0]-dx*distance,middle[1]-dy*distance]);
    if(positive===negative)continue;
    const current=positive?-1:1;
    if(sign!==undefined&&sign!==current)throw new Error(`Wall ${wall.id} has ambiguous sides in room ${wall.room_id}`);
    sign=current;
  }
  if(sign===undefined)throw new Error(`Wall ${wall.id} is not on the boundary of room ${wall.room_id}`);
  return [dx*sign,dy*sign];
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
  const sharedWallIds = new Set(scene.openings.filter(o=>o.room_ids?.some(selected)).map(o=>o.wall_id));
  const walls = scene.walls.filter(w => selected(w.room_id) || sharedWallIds.has(w.id));
  return structuredClone({
    north_deg: scene.north_deg ?? null,
    ...(scene.geometry_audit?{geometry_audit:scene.geometry_audit}:{}),
    coordinate_convention: 'metres; x right, y plan-up; rot counterclockwise; front local -y; north_deg clockwise from plan-up',
    appearance: 'color ops accept #RRGGBB for item or wall. A wall color paints both faces and all segments sharing source_id. Missing wall color can mean mixed face finishes. Paint and labour are not quoted.',
    groups: 'Moving one item with group_id rigidly moves and rotates every member; place and propose validate all members. Colour changes affect only the selected item.',
    rooms: scene.rooms.filter(r=>selected(r.id)),
    walls: walls.map(w=>({ ...w, compass: wallCompass(scene,w) })),
    openings: scene.openings.filter(o=>walls.some(w=>w.id===o.wall_id)||o.room_ids?.some(selected)),
    items: scene.items.filter(i=>selected(i.room_id)), fixed: scene.fixed.filter(i=>(i.structure !== undefined && roomIds?.length !== 0) || selected(i.room_id)),
    metrics: { status: 'not implemented yet' },
  });
}
