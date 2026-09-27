import { footprintRoomArea } from './room-ownership.js';
import {requestPolicy,canonicalKind} from './request-policy.js';
import { z } from 'zod';
import { colorTargetSchema, wallCompass, wallOutward } from './adapter.js';
import { itemPolygon, polygonsOverlap } from './metrics/space.js';
import { innerWallFace } from './wall-geometry.js';
import type { Item, Op, Scene, Vec2 } from './scene.js';

const id = z.string().trim().min(1), distance = z.number().finite().nonnegative();
const demand = z.object({ kinds: z.array(id).min(1), count: z.number().int().positive().safe() }).strict();
const preferenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('near_window'), item_id: id, window_id: id.optional(), max_distance_m: distance.optional() }).strict(),
  z.object({ type: z.literal('away_from'), item_id: id, anchor_id: id, min_distance_m: distance.optional() }).strict(),
  z.object({ type: z.literal('against_wall'), item_id: id, wall_id: id.optional(), compass: z.enum(['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']).optional() }).strict(),
  z.object({ type: z.literal('facing'), item_id: id, anchor_id: id, tolerance_deg: z.number().finite().min(0).max(90).optional() }).strict(),
]);

export const intentSchema = z.object({
  room_id: id.optional(), add: z.array(demand).optional(), remove: z.array(demand).optional(), move: z.array(demand).optional(),
  keeps: z.array(id).optional(), budget_dram: z.number().int().nonnegative().safe().optional(), preferences: z.array(preferenceSchema).optional(),
  colors: z.array(colorTargetSchema).max(200).optional(),
}).strict();
export type Intent = z.infer<typeof intentSchema>;
export type GeometricPreference = NonNullable<Intent['preferences']>[number];
export interface RequestError {
  check: string; message: string; item_ids?: string[]; at?: Vec2; deficit_m?: number; missing_kinds?: string[];
}
export interface RequestCheck {
  ok: boolean;
  errors: RequestError[];
  budget: { status: 'pass' | 'fail' | 'skipped'; cost_dram: number | null; limit_dram?: number };
}
const EPS = 1e-7, RAD = Math.PI / 180;
const kind = (value: string) => value.trim().toLowerCase();
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const subtract = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const normalize = (angle: number) => ((angle % 360) + 360) % 360;

function samePose(a: Item, b: Item): boolean {
  return a.room_id === b.room_id && Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]) < EPS
    && Math.abs(normalize(a.rot - b.rot + 180) - 180) < EPS;
}
function identity(item: Item): string {
  return JSON.stringify([item.id, item.kind, item.name, item.size, item.keep, item.sku ?? null, item.price ?? null, item.vendor ?? null]);
}
function unchanged(a: Item, b: Item | undefined): boolean { return b !== undefined && samePose(a, b) && identity(a) === identity(b) && a.color === b.color && a.group_id === b.group_id; }

/** Augmenting paths find a maximum one-item-per-slot matching. Per-demand slots are
 * capped by the actual item count: huge missing counts never allocate huge arrays. */
function matchDemands(actual: Item[], demands: NonNullable<Intent['add']>, action: string, exact: boolean): RequestError[] {
  const slots: number[] = [];
  for (let group = 0; group < demands.length; group++) for (let i = 0; i < Math.min(demands[group]!.count, actual.length); i++) slots.push(group);
  const itemSlot = new Int32Array(actual.length).fill(-1);
  const augment = (slot: number, seen: Set<number>): boolean => {
    const allowed = demands[slots[slot]!]!.kinds.map(kind);
    for (let itemIndex = 0; itemIndex < actual.length; itemIndex++) {
      if (seen.has(itemIndex) || !allowed.includes(kind(actual[itemIndex]!.kind))) continue;
      seen.add(itemIndex);
      if (itemSlot[itemIndex] === -1 || augment(itemSlot[itemIndex]!, seen)) { itemSlot[itemIndex] = slot; return true; }
    }
    return false;
  };
  for (let slot = 0; slot < slots.length; slot++) augment(slot, new Set());
  const matched = new Int32Array(demands.length);
  for (const slot of itemSlot) if (slot >= 0) matched[slots[slot]!]!++;
  const errors: RequestError[] = [];
  demands.forEach((entry, group) => {
    const missing = entry.count - matched[group]!;
    if (missing > 0) errors.push({ check: `request_${action}`, message: `Missing requested ${action}: ${missing} × ${entry.kinds.join(' or ')}`, missing_kinds: entry.kinds.map(kind) });
  });
  if (exact) {
    const extra = actual.filter((_, index) => itemSlot[index] === -1);
    if (extra.length) errors.push({ check: `unrequested_${action}`, message: `Unrequested ${action}: ${extra.map(item => `${item.id} (${item.kind})`).join(', ')}`, item_ids: extra.map(item => item.id), at: [...extra[0]!.pos] });
  }
  return errors;
}

function pointSegmentDistance(point: Vec2, a: Vec2, b: Vec2): number {
  const edge = subtract(b, a), denominator = dot(edge, edge);
  if (denominator < EPS * EPS) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.max(0, Math.min(1, dot(subtract(point, a), edge) / denominator));
  return Math.hypot(point[0] - a[0] - edge[0] * t, point[1] - a[1] - edge[1] * t);
}
function intersects(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const cross = (u: Vec2, v: Vec2) => u[0] * v[1] - u[1] * v[0], ab = subtract(b, a), cd = subtract(d, c), denominator = cross(ab, cd);
  if (Math.abs(denominator) < EPS) return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b)) < EPS;
  const t = cross(subtract(c, a), cd) / denominator, u = cross(subtract(c, a), ab) / denominator;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS;
}
function footprintDistance(a: Vec2[], b: Vec2[]): number {
  if (a.length > 2 && b.length > 2 && polygonsOverlap(a, b)) return 0;
  let distance = Infinity;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const p = a[i]!, q = a[(i + 1) % a.length]!, r = b[j]!, s = b[(j + 1) % b.length]!;
    if (intersects(p, q, r, s)) return 0;
    distance = Math.min(distance, pointSegmentDistance(p, r, s), pointSegmentDistance(r, p, q));
  }
  return distance;
}

function preferenceError(scene: Scene, preference: GeometricPreference): RequestError | undefined {
  const item = [...scene.items, ...scene.fixed].find(candidate => candidate.id === preference.item_id);
  const fail = (message: string, deficit_m?: number): RequestError => ({ check: 'preference', message, item_ids: [preference.item_id], ...(item ? { at: [...item.pos] as Vec2 } : {}), ...(deficit_m === undefined ? {} : { deficit_m: Math.max(0, deficit_m) }) });
  if (!item) return fail(`Preference ${preference.type}: item ${preference.item_id} is missing`);
  const polygon = itemPolygon(item);
  const windowSpan = (windowId: string): Vec2[] | undefined => {
    const opening = scene.openings.find(candidate => candidate.id === windowId && candidate.kind === 'window');
    if (!opening) return undefined;
    const wall = scene.walls.find(candidate => candidate.id === opening.wall_id && (candidate.room_id === item.room_id || opening.room_ids?.includes(item.room_id)));
    if (!wall) return undefined;
    const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
    if (length < EPS) return undefined;
    const along = (distance: number): Vec2 => [wall.a[0] + (wall.b[0] - wall.a[0]) * distance / length, wall.a[1] + (wall.b[1] - wall.a[1]) * distance / length];
    return [along(opening.offset), along(opening.offset + opening.width)];
  };
  if (preference.type === 'near_window') {
    const spans = preference.window_id ? [windowSpan(preference.window_id)].filter((span): span is Vec2[] => span !== undefined)
      : scene.openings.filter(opening => opening.kind === 'window').map(opening => windowSpan(opening.id)).filter((span): span is Vec2[] => span !== undefined);
    if (!spans.length) return fail(`Preference near_window: no matching window ${preference.window_id ?? ''} in room ${item.room_id}`);
    const distance = Math.min(...spans.map(span => footprintDistance(polygon, span))), maximum = preference.max_distance_m ?? 1.5;
    return distance <= maximum + EPS ? undefined : fail(`${item.id} is ${distance.toFixed(2)} m from the window span; maximum ${maximum.toFixed(2)} m`, distance - maximum);
  }
  if (preference.type === 'away_from') {
    if (preference.anchor_id === item.id) return fail(`Preference away_from: ${item.id} cannot be its own anchor`);
    const anchor = [...scene.items, ...scene.fixed].find(candidate => candidate.id === preference.anchor_id && (candidate.room_id === item.room_id || footprintRoomArea(itemPolygon(candidate), scene.rooms.find(r => r.id === item.room_id)!.polygon) > EPS));
    const target = anchor ? itemPolygon(anchor) : windowSpan(preference.anchor_id);
    if (!target) return fail(`Preference away_from: unknown anchor ${preference.anchor_id} in room ${item.room_id}`);
    const distance = footprintDistance(polygon, target), minimum = preference.min_distance_m ?? 1;
    return distance >= minimum - EPS ? undefined : fail(`${item.id} is ${distance.toFixed(2)} m from ${preference.anchor_id}; minimum ${minimum.toFixed(2)} m`, minimum - distance);
  }
  if (preference.type === 'against_wall') {
    if (preference.compass && scene.north_deg === undefined) return fail(`Preference against_wall: north_deg is required for compass ${preference.compass}`);
    const walls = scene.walls.filter(wall => wall.room_id === item.room_id && !wall.open && (!preference.wall_id || wall.id === preference.wall_id) && (!preference.compass || wallCompass(scene, wall) === preference.compass));
    if (!walls.length) return fail(`Preference against_wall: no matching wall ${preference.wall_id ?? preference.compass ?? ''} in room ${item.room_id}`);
    const front: Vec2 = [Math.sin(item.rot * RAD), -Math.cos(item.rot * RAD)];
    const distances = walls.map(wall => footprintDistance(polygon, innerWallFace(scene,wall)));
    const passed = walls.some((wall, index) => { const outward = wallOutward(scene, wall); return distances[index]! < EPS && -dot(front, outward) >= 1 - EPS; });
    return passed ? undefined : fail(`${item.id} must have its back against wall ${preference.wall_id ?? preference.compass ?? 'in this room'} and face inward`, Math.min(...distances));
  }
  const anchor = [...scene.items, ...scene.fixed].find(candidate => candidate.id === preference.anchor_id && (candidate.room_id === item.room_id || footprintRoomArea(itemPolygon(candidate), scene.rooms.find(r => r.id === item.room_id)!.polygon) > EPS));
  if (!anchor || anchor.id === item.id) return fail(`Preference facing: unknown or self anchor ${preference.anchor_id}`);
  const delta = subtract(anchor.pos, item.pos), length = Math.hypot(...delta);
  if (length < EPS) return fail(`${item.id} cannot face a coincident anchor ${anchor.id}`);
  const front: Vec2 = [Math.sin(item.rot * RAD), -Math.cos(item.rot * RAD)];
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(front, delta) / length))) / RAD;
  return angle <= (preference.tolerance_deg ?? 5) + EPS ? undefined : fail(`${item.id} faces ${angle.toFixed(1)} degrees away from ${anchor.id}; allowed ${preference.tolerance_deg ?? 5} degrees`);
}

/** Pure request gate. Actions use actual scene deltas, with operations audited separately
 * to prevent temporary purchases/replacements and touch-then-restore changes to keeps. */
export function checkRequest(before: Scene, after: Scene, ops: readonly Op[], input: Intent, cost_dram: number | null, customerRequests: readonly string[] = []): RequestCheck {
  const intent = intentSchema.parse(input), errors: RequestError[] = [];
  const beforeById = new Map(before.items.map(item => [item.id, item])), afterById = new Map(after.items.map(item => [item.id, item]));
  const blocked=new Set(requestPolicy(customerRequests).blocked_kinds);
  for(const op of ops)if(op.type==='add'&&blocked.has(canonicalKind(op.item.kind)))errors.push({check:'removed_kind',message:`The customer removed ${op.item.kind}; only a new explicit customer request may add that kind again.`,item_ids:[op.item.id]});
  const additions = after.items.filter(item => !beforeById.has(item.id));
  const removals = before.items.filter(item => !afterById.has(item.id));
  const moves = after.items.filter(item => { const original = beforeById.get(item.id); return original !== undefined && !samePose(original, item); });
  const recolored = after.items.filter(item => { const original = beforeById.get(item.id); return original !== undefined && original.color !== item.color; });
  const inScope = (items: Item[]) => intent.room_id === undefined ? items : items.filter(item => item.room_id === intent.room_id);
  if (intent.room_id !== undefined) {
    if (!before.rooms.some(room => room.id === intent.room_id)) errors.push({ check: 'request_room', message: `Unknown requested room: ${intent.room_id}` });
    const outOfScope = [...additions, ...removals, ...moves, ...recolored].filter(item => item.room_id !== intent.room_id || (moves.includes(item) && beforeById.get(item.id)?.room_id !== intent.room_id));
    if (outOfScope.length) errors.push({ check: 'request_room', message: `Changes outside requested room ${intent.room_id}: ${outOfScope.map(item => item.id).join(', ')}`, item_ids: outOfScope.map(item => item.id), at: [...outOfScope[0]!.pos] });
  }
  errors.push(...matchDemands(inScope(additions), intent.add ?? [], 'add', true), ...matchDemands(inScope(removals), intent.remove ?? [], 'remove', true));
  errors.push(...matchDemands(inScope(moves), intent.move ?? [], 'move', false));
  if (intent.colors?.length && !intent.move?.length && moves.length) errors.push({ check: 'unrequested_move', message: 'A colour-only request must not move furniture', item_ids: moves.map(item => item.id) });

  // Split wall segments refer to one physical editor wall: paint changes both faces.
  const appearanceKey = (target: 'item'|'wall', id: string) => `${target}:${target === 'wall' ? before.walls.find(wall => wall.id === id)?.source_id ?? id : id}`;
  const wanted = new Map<string,string>();
  for (const color of intent.colors ?? []) {
    const original = color.target === 'wall' ? before.walls.find(wall => wall.id === color.id) : beforeById.get(color.id);
    const final = color.target === 'wall' ? after.walls.find(wall => wall.id === color.id) : afterById.get(color.id);
    const key = appearanceKey(color.target,color.id);
    if (wanted.has(key) && wanted.get(key) !== color.color) errors.push({ check: 'request_color', message: `Conflicting requested colours for ${color.id}` });
    wanted.set(key,color.color);
    if (!original || !final || final.color?.toLowerCase() !== color.color) errors.push({ check: 'request_color', message: `Requested ${color.color} on ${color.target} ${color.id} is missing` });
    if (original && intent.room_id && original.room_id !== intent.room_id) errors.push({ check: 'request_room', message: `Colour target ${color.id} is outside requested room ${intent.room_id}` });
  }
  const auditColor = (target:'item'|'wall',id:string,color:string|undefined) => {
    if (wanted.get(appearanceKey(target,id)) !== color?.toLowerCase() || color === undefined) errors.push({ check: 'unrequested_color', message: `Unrequested colour on ${target} ${id}` });
  };
  for (const item of recolored) auditColor('item',item.id,item.color);
  for (const wall of after.walls) if (before.walls.find(original => original.id === wall.id)?.color !== wall.color) auditColor('wall',wall.id,wall.color);
  for (const op of ops) if (op.type === 'color') auditColor(op.target,op.id,op.color);

  const originalItems = [...before.items, ...before.fixed], finalItems = [...after.items, ...after.fixed];
  const protectedIds = new Set([...(intent.keeps ?? []), ...before.items.filter(item => item.keep).map(item => item.id), ...before.fixed.map(item => item.id)]);
  for (const protectedId of protectedIds) {
    const original = originalItems.find(item => item.id === protectedId), final = finalItems.find(item => item.id === protectedId);
    const touched = ops.some(op => op.type === 'add' ? op.item.id === protectedId : op.id === protectedId || (op.type === 'move' && original?.group_id !== undefined && originalItems.find(item => item.id === op.id)?.group_id === original.group_id));
    if (!original || !unchanged(original, final) || touched) errors.push({ check: 'keep', message: original ? `Kept or fixed item ${protectedId} must remain untouched` : `Unknown kept item: ${protectedId}`, item_ids: [protectedId], ...(original ? { at: [...original.pos] as Vec2 } : {}) });
  }
  for (const item of before.items) {
    const final = afterById.get(item.id);
    if (final && identity(item) !== identity(final) && !protectedIds.has(item.id)) errors.push({ check: 'item_identity', message: `Existing item ${item.id} changed identity, dimensions or metadata; only its pose may change`, item_ids: [item.id], at: [...item.pos] });
    const dissolved = item.group_id && final?.group_id === undefined && after.items.filter(other => beforeById.get(other.id)?.group_id === item.group_id).length === 1;
    if (final && final.group_id !== item.group_id && !dissolved) errors.push({ check: 'item_identity', message: `Group membership of ${item.id} cannot be changed by the designer`, item_ids: [item.id] });
  }
  if (additions.some(item => item.group_id)) errors.push({ check: 'item_identity', message: 'New purchases cannot silently join furniture groups' });
  for (const item of after.fixed) if (!before.fixed.some(original => original.id === item.id)) errors.push({ check: 'fixed', message: `Unrequested fixed item ${item.id} cannot be added by a furniture layout`, item_ids: [item.id], at: [...item.pos] });
  for (const original of before.fixed) if (!after.fixed.some(item => item.id === original.id)) errors.push({ check: 'fixed', message: `Fixed item ${original.id} cannot become movable or disappear`, item_ids: [original.id], at: [...original.pos] });
  for (const op of ops) if (op.type === 'add' && (originalItems.some(item => item.id === op.item.id) || !afterById.has(op.item.id))) {
    errors.push({ check: 'unrequested_add', message: `Temporary purchase or same-id replacement ${op.item.id} is not a rearrange or a final requested addition`, item_ids: [op.item.id], at: [...op.item.pos] });
  }

  const priceValid = cost_dram !== null && Number.isSafeInteger(cost_dram) && cost_dram >= 0;
  if (cost_dram !== null && !priceValid) errors.push({ check: 'price', message: 'Price must be a known nonnegative whole dram amount' });
  if (cost_dram === null && (additions.length > 0 || ops.some(op => op.type === 'add'))) errors.push({ check: 'price_unknown', message: 'The price of an added item is unknown; resolve its price before proposing' });
  let budget: RequestCheck['budget'] = { status: 'skipped', cost_dram };
  if (intent.budget_dram !== undefined) {
    if (intent.colors?.length) errors.push({ check: 'price_unknown', message: 'Paint, refinishing and labour are unquoted; cannot verify a colour-work budget' });
    const passes = priceValid && cost_dram <= intent.budget_dram;
    budget = { status: passes ? 'pass' : 'fail', cost_dram, limit_dram: intent.budget_dram };
    if (!passes) errors.push({ check: 'budget', message: priceValid ? `Price ${cost_dram} dram exceeds budget ${intent.budget_dram} dram by ${cost_dram - intent.budget_dram} dram` : `Cannot verify budget ${intent.budget_dram} dram while price is unknown or invalid` });
  }
  for (const preference of intent.preferences ?? []) {
    try { const error = preferenceError(after, preference); if (error) errors.push(error); }
    catch (error) { errors.push({ check: 'preference', message: `Cannot verify ${preference.type} for ${preference.item_id}: ${error instanceof Error ? error.message : String(error)}`, item_ids: [preference.item_id] }); }
  }
  return { ok: errors.length === 0, errors, budget };
}
