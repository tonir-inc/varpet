/** Every furnished piece of a traced flat, checked against what the plan drew. Exits 1 on any fault.
 *
 *     cd packages/designer && npx tsx ../../apartments/_svg/audit.ts ../../apartments/<flat> [...more flats]
 *
 * Two layers. The designer's own layout check (containment, collisions, door swings, walkways, function
 * clearances) on the scene converted through the editor bridge. Then what that check cannot know because it
 * comes from the plan: the piece's role (its trace data-name) wants a type and height ("Dining chair" is not a bar
 * stool, a "Sofa" has a back, a "Wardrobe" is closed); the model's footprint matches the traced one (roles.json:
 * width within 0.10 m, depth from 0.15 m shallower to 0.20 m deeper because plans draw sofas and TV units shallow); the front faces
 * into the room, wall pieces have their back to a wall, seats face their table, desk or coffee table, and a bedside
 * table stands at the bed's head turned the same way. roles.json is shared with build.py, which picks within it. Editor plan axes: x right, z down the image; a rotation r turns the
 * model's front (+z) to (sin r, cos r).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { editorToDesigner } from '../../packages/designer/src/editor-bridge.ts';
import { checkLayout } from '../../packages/designer/src/layout.ts';

type V = [number, number];
interface Asset { id: string; name: string; kind: string; dimensions: [number, number, number] }
interface Obj { id: string; name: string; assetId: string; position: [number, number, number]; rotation: number }
interface Pick { id: string; footprint_m: [number, number] }

interface Role { name: string; height?: [number, number]; not?: string; min_width?: number; wall?: boolean; faces?: [string, number]; beside?: string }
const ROLES: { width_tolerance: number; depth_under: number; depth_over: number; roles: Role[] } =
  JSON.parse(readFileSync(new URL('./roles.json', import.meta.url), 'utf8'));
/** The narrowest route allowed between two doors (the designer's 5 cm grid reads a 0.60 m gap as 0.55). */
const ROUTE_M = 0.55;
const role = (name: string) => ROLES.roles.find(r => new RegExp(r.name, 'i').test(name));

const inside = (p: V, poly: V[]) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!, [xj, zj] = poly[j]!;
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
};

function audit(flat: string): string[] {
  const scene = JSON.parse(readFileSync(join(flat, 'scene.furnished.json'), 'utf8'));
  const catalog: Asset[] = JSON.parse(readFileSync(join(flat, 'startup.json'), 'utf8')).catalog;
  const picks: Pick[] = JSON.parse(readFileSync(join(flat, 'report.json'), 'utf8')).furniture;
  const assets = new Map(catalog.map(a => [a.id, a]));
  const rooms: V[][] = scene.rooms.map((r: { polygon: V[] }) => r.polygon);
  const inRoom = (p: V) => rooms.some(poly => inside(p, poly));
  const objects: Obj[] = scene.objects;
  const faults: string[] = [], notes: string[] = [], unruled = new Set<string>();

  const layout = checkLayout(editorToDesigner(scene, { catalog: catalog as never, catalogCurrency: 'AMD' }), [], { compareBaseline: false });
  // Gate on what makes a flat wrong to walk through: a piece outside its room or in another, a door that cannot open,
  // and a route between two doors (every room to every room) under ROUTE_M. Reaching one piece's own side and the
  // designer's comfort clearances (chair pull-out, sofa to coffee table) are printed as notes: the plans draw small
  // flats tight, and the hand-reviewed flats fail them too.
  for (const e of layout.errors) {
    const w = (e as { walkway?: { from: string; to: string; reachable: boolean } }).walkway;
    const route = e.check === 'walkway' && w?.from.startsWith('door:') && w.to.startsWith('door:');
    const width = /no accessible path/.test(e.message) ? 0 : Number(/([\d.]+) m path/.exec(e.message)?.[1] ?? Infinity);
    const narrow = route && width < ROUTE_M - 1e-6;
    if (['containment', 'collision', 'door_swing'].includes(e.check) && e.severity === 'hard' || narrow) faults.push(`layout ${e.check}: ${e.message}`);
    else notes.push(`${e.check}: ${e.message}`);
  }

  const footprintOf = (o: Obj): V[] => {
    const [w, , d] = assets.get(o.assetId)!.dimensions, r = o.rotation, [x, z] = at(o);
    return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as V[]).map(([sx, sz]) =>
      [x + Math.cos(r) * sx * w / 2 + Math.sin(r) * sz * d / 2, z - Math.sin(r) * sx * w / 2 + Math.cos(r) * sz * d / 2]);
  };
  const front = (o: Obj): V => [Math.sin(o.rotation), Math.cos(o.rotation)];
  const at = (o: Obj): V => [o.position[0], o.position[2]];
  for (const o of objects) {
    const a = assets.get(o.assetId);
    if (!a) { faults.push(`${o.id}: model ${o.assetId} missing from startup.json`); continue; }
    const [w, h, d] = a.dimensions, label = `${o.id} (${o.name}, ${a.name.slice(0, 50)})`;
    const rule = role(o.name);
    if (!rule) unruled.add(o.name);
    else {
      if (rule.height && (h < rule.height[0] || h > rule.height[1])) faults.push(`${label}: height ${h.toFixed(2)} m outside ${rule.height[0]}-${rule.height[1]}`);
      if (rule.not && new RegExp(rule.not, 'i').test(a.name)) faults.push(`${label}: model is the wrong type for a ${o.name.toLowerCase()}`);
      if (rule.min_width && w < rule.min_width) faults.push(`${label}: width ${w.toFixed(2)} m under ${rule.min_width}`);
    }
    const pick = picks.find(p => p.id === o.id);
    if (pick) {
      const [tw, td] = pick.footprint_m;
      if (Math.abs(w - tw) > ROLES.width_tolerance + 1e-6 || d - td < -ROLES.depth_under - 1e-6 || d - td > ROLES.depth_over + 1e-6)
        faults.push(`${label}: model ${w.toFixed(2)} x ${d.toFixed(2)} m vs traced ${tw} x ${td} (width ±${ROLES.width_tolerance}, depth -${ROLES.depth_under}/+${ROLES.depth_over})`);
    }
    const [fx, fz] = front(o), [x, z] = at(o);
    if (!inRoom([x + fx * (d / 2 + 0.05), z + fz * (d / 2 + 0.05)])) faults.push(`${label}: front faces into a wall`);
    // A wall within 0.15 m behind: some point of that strip is in no room (walls between rooms can be thinner than 0.15 m).
    if (rule?.wall && [0.01, 0.03, 0.06, 0.09, 0.12, 0.15].every(t => inRoom([x - fx * (d / 2 + t), z - fz * (d / 2 + t)])))
      faults.push(`${label}: back is not against a wall (more than 0.15 m clear behind it)`);
    const roomOf = (p: V) => rooms.findIndex(poly => inside(p, poly));
    const nearest = (re: RegExp) => objects.filter(t => t !== o && re.test(t.name) && roomOf(at(t)) === roomOf(at(o)))
      .sort((p, q) => Math.hypot(...sub(at(p), at(o))) - Math.hypot(...sub(at(q), at(o))))[0];
    if (rule?.faces) {
      const target = nearest(new RegExp(rule.faces[0], 'i'));
      if (!target) faults.push(`${label}: nothing to face (${rule.faces[0]})`);
      else {
        // Facing means the line straight out of its front meets the target within 1.5 m (a corner chair at a long
        // table faces the table edge, not its centre); failing that, the angle to the target's centre decides.
        const box = footprintOf(target);
        const hits = Array.from({ length: 30 }, (_, i) => (i + 1) * 0.05).some(t => inside([x + fx * t, z + fz * t], box));
        const [dx, dz] = sub(at(target), at(o)), cos = (fx * dx + fz * dz) / (Math.hypot(dx, dz) || 1);
        if (!hits && cos < rule.faces[1]) faults.push(`${label}: faces ${(Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI).toFixed(0)}° away from ${target.id}`);
      }
    }
    if (rule?.beside) {
      const bed = nearest(new RegExp(`\\b${rule.beside}$`, 'i'));
      if (!bed) faults.push(`${label}: no ${rule.beside} to stand beside`);
      else {
        const [bx, bz] = front(bed), aligned = fx * bx + fz * bz;
        const head = sub(at(bed), [bx * ((assets.get(bed.assetId)?.dimensions[2] ?? 0) / 2), bz * ((assets.get(bed.assetId)?.dimensions[2] ?? 0) / 2)]);
        const along = Math.abs((x - head[0]) * bx + (z - head[1]) * bz);
        if (aligned < 0.95) faults.push(`${label}: not turned the same way as ${bed.id}`);
        if (along > d / 2 + 0.15) faults.push(`${label}: ${along.toFixed(2)} m from the head of ${bed.id}, not beside it`);
      }
    }
  }
  for (const n of notes) console.log(`  note ${n}`);
  if (unruled.size) console.log(`  (no role rule, not checked for type or facing: ${[...unruled].join(', ')})`);
  return faults;
}
const sub = (p: V, q: V): V => [p[0] - q[0], p[1] - q[1]];

let failed = false;
for (const flat of process.argv.slice(2)) {
  const faults = audit(flat);
  failed ||= faults.length > 0;
  console.log(`${flat}: ${faults.length} fault(s)`);
  for (const f of faults) console.log(`  FAULT ${f}`);
}
process.exit(failed ? 1 : 0);
