/** Surfaces and light: the draft's `finishes` and `lighting`, limited to what the product editor renders.
 * Materials are the editor's finish presets (apps/editor/src/core/finish-presets.ts); oak, walnut, limestone and
 * porcelain use the scanned catalog/materials textures, the rest are procedural patterns or matte paint.
 * Ceiling designs are the editor's three CeilingDesign styles; fixtures are editor `light` components. */
import { FINISH_PRESETS, type FinishPreset } from '../../../../apps/editor/src/core/finish-presets.js';
import type { Item, Scene, Vec2 } from '../../src/scene.js';

export type FinishSurface = 'floor' | 'walls' | 'wall' | 'ceiling';
/** floor: a floor material; walls: every wall face of the room; wall: one wall (wall_id) face toward the room;
 * ceiling: colour only (the editor paints ceilings flat). material and/or color; color tints a material. */
export interface Finish { room_id: string; surface: FinishSurface; wall_id?: string; material?: string; color?: string }
export type CeilingStyle = 'quiet' | 'soft-glow' | 'architectural';
/** One per room. quiet = recessed spots, soft-glow = floating panel with concealed cove light,
 * architectural = two linear track lights. brightness 0..100 (%), temperature_k 2200..6500. */
export interface CeilingLight { room_id: string; type: 'ceiling'; style: CeilingStyle; brightness?: number; temperature_k?: number }
/** A light fixture (the editor draws a simple glowing box plus a point light).
 * pendant hangs with its bottom at height_m (default 0.75 m above a table under it, else 2.1 m);
 * ceiling sits flush; wall is a sconce, bottom at height_m (default 1.7). brightness in lumens 100..5000. */
export interface FixtureLight {
  room_id: string; type: 'fixture'; id: string; name?: string; mount: 'pendant' | 'ceiling' | 'wall'; pos: Vec2;
  height_m?: number; size?: [number, number, number]; brightness?: number; temperature_k?: number; color?: string;
}
export type Light = CeilingLight | FixtureLight;
/** A draft item. Wall-hung (art, mirrors, clocks, curtains; the editor hangs nothing else): `wall_id` + `height_m` (centre height above the
 * floor), pos flush on that wall's face. Resting on another item (vase on a sideboard, cushion on a sofa): `on`
 * = the support's id, pos inside its footprint. Neither takes floor space. */
export interface DraftItem extends Item { wall_id?: string; height_m?: number; on?: string }
/** A made-to-measure piece of the flat (scene item with material_slots) restyled by role: role -> '#rrggbb', or null for
 * the model's own finish. Only finishes change; the piece keeps its place and layout. */
export interface Restyle { id: string; room_id: string; materials: Record<string, string | null> }
export interface Draft { items: DraftItem[]; finishes?: Finish[]; lighting?: Light[]; restyle?: Restyle[] }
/** The scene item's per-role colours with the draft's restyle over them (null roles dropped). */
export function styledMaterials(item: Pick<Item, 'id' | 'materials'>, draft: Pick<Draft, 'restyle'>): Record<string, string> | undefined {
  const out: Record<string, string> = { ...(item.materials ?? {}) };
  for (const entry of draft.restyle ?? []) if (entry.id === item.id) for (const [role, color] of Object.entries(entry.materials ?? {})) {
    if (color === null) delete out[role]; else out[role] = color.toLowerCase();
  }
  return Object.keys(out).length ? out : undefined;
}
/** Hard problems in draft.restyle, one line each (prefix `restyle:`). */
export function checkRestyle(scene: Scene, draft: Draft): string[] {
  const problems: string[] = [], seen = new Set<string>();
  (draft.restyle ?? []).forEach((entry, index) => {
    const at = `restyle: restyle[${index}] ${entry?.id ?? '?'}`;
    const keys = Object.keys(entry ?? {}).filter(key => !['id', 'room_id', 'materials'].includes(key));
    if (keys.length) problems.push(`${at}: unknown keys ${keys.join(', ')}`);
    const item = scene.items.find(candidate => candidate.id === entry?.id);
    if (!item?.material_slots?.length) { problems.push(`${at}: not a made-to-measure piece of the flat (restylable: ${restylable(scene).map(i => i.id).join(', ') || 'none'})`); return; }
    if (entry.room_id !== item.room_id) problems.push(`${at}: room_id must be ${item.room_id}`);
    if (seen.has(item.id)) problems.push(`${at}: one restyle entry per piece`);
    seen.add(item.id);
    if (!entry.materials || typeof entry.materials !== 'object' || Array.isArray(entry.materials) || !Object.keys(entry.materials).length) { problems.push(`${at}: materials must be {role: "#rrggbb" | null}`); return; }
    for (const [role, color] of Object.entries(entry.materials)) {
      if (!item.material_slots.includes(role)) problems.push(`${at}: unknown role ${role} (roles: ${item.material_slots.join(', ')})`);
      if (color !== null && (typeof color !== 'string' || !HEX.test(color))) problems.push(`${at}: ${role} must be #RRGGBB or null`);
    }
  });
  return problems;
}
/** The flat's made-to-measure pieces (restylable by role, fixed in place). */
export const restylable = (scene: Scene): Item[] => scene.items.filter(item => item.material_slots?.length);
/** One line per restylable piece: roles with their colour (restyled or current), or the model's own finish. */
export function describeRestylable(scene: Scene, draft: Pick<Draft, 'restyle'>, roomId?: string): string[] {
  return restylable(scene).filter(item => !roomId || item.room_id === roomId).map(item => {
    const colours = styledMaterials(item, draft) ?? {};
    return `${item.id} (${item.name}) [${item.room_id}] restylable: ${item.material_slots!.map(role => `${role} ${colours[role] ?? 'own finish'}`).join(', ')}`;
  });
}
/** Items that stand on the floor (not wall-hung, not resting on another item). */
export const onFloor = (item: DraftItem) => item.wall_id === undefined && item.on === undefined;
/** The item without the draft-only placement keys, as src/ schema expects. */
export function plainItem(item: DraftItem): Item {
  const { wall_id: _w, height_m: _h, on: _o, ...rest } = item;
  return rest;
}

export interface MaterialInfo { id: string; category: 'floor' | 'wall'; family: string; color: string; look: string; texture?: string; preset: FinishPreset }
const TEXTURE_DIR: Record<string, string> = { oak: 'oak', walnut: 'walnut', travertine: 'travertine', marble: 'marble-white-alt' };
const FAMILY: Record<FinishPreset['pattern'], string> = { wood: 'wood', tile: 'tile/stone', terrazzo: 'terrazzo', solid: 'paint' };

export const MATERIALS: MaterialInfo[] = FINISH_PRESETS.map(preset => ({
  id: preset.id, category: preset.category, family: preset.texture === 'travertine' || preset.texture === 'marble' ? 'stone' : FAMILY[preset.pattern],
  color: preset.color, look: `${preset.name}: ${preset.description}${preset.texture ? ' (scanned texture)' : ''}`,
  ...(preset.texture ? { texture: TEXTURE_DIR[preset.texture] } : {}), preset,
}));
export const material = (id: string | undefined) => MATERIALS.find(candidate => candidate.id === id);

export const HEX = /^#[0-9a-f]{6}$/i;
export const CEILING_STYLES: CeilingStyle[] = ['quiet', 'soft-glow', 'architectural'];
export const FIXTURE_DEFAULTS = {
  pendant: { size: [0.45, 0.45, 0.3] as [number, number, number], brightness: 800 },
  ceiling: { size: [0.4, 0.4, 0.1] as [number, number, number], brightness: 1000 },
  wall: { size: [0.2, 0.12, 0.25] as [number, number, number], brightness: 400 },
};

/** Surface colour a finish shows (material colour unless tinted). */
export function finishColor(finish: Finish): string | undefined {
  return finish.color ?? material(finish.material)?.color;
}
export const physicalWall = (scene: Scene, wallId: string) => { const wall = scene.walls.find(w => w.id === wallId); return wall ? wall.source_id ?? wall.id : undefined; };
/** Designer walls bounding a room (its own aliases). */
export const roomWalls = (scene: Scene, roomId: string) => scene.walls.filter(wall => wall.room_id === roomId);

export function inPolygon([x, y]: Vec2, polygon: Vec2[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

/** Item under a point (for pendant default height). */
export function itemUnder(items: Item[], [x, y]: Vec2): Item | undefined {
  return items.find(item => onFloor(item) && item.kind !== 'rug' && (() => {
    const a = -item.rot * Math.PI / 180, dx = x - item.pos[0], dy = y - item.pos[1];
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(lx) <= item.size[0] / 2 && Math.abs(ly) <= item.size[1] / 2;
  })());
}
export function fixtureBottom(light: FixtureLight, items: Item[], ceiling: number): number {
  const size = light.size ?? FIXTURE_DEFAULTS[light.mount].size;
  if (light.height_m !== undefined) return light.height_m;
  if (light.mount === 'ceiling') return ceiling - size[2];
  if (light.mount === 'wall') return 1.7;
  const under = itemUnder(items, light.pos);
  return under && under.size[2] < 1.2 ? Math.min(ceiling - size[2] - 0.2, under.size[2] + 0.75) : Math.min(2.1, ceiling - size[2] - 0.1);
}

const allowed = { finish: ['room_id', 'surface', 'wall_id', 'material', 'color'], ceiling: ['room_id', 'type', 'style', 'brightness', 'temperature_k'],
  fixture: ['room_id', 'type', 'id', 'name', 'mount', 'pos', 'height_m', 'size', 'brightness', 'temperature_k', 'color'] };
const extra = (value: object, keys: string[]) => Object.keys(value).filter(key => !keys.includes(key));
const num = (value: unknown, low: number, high: number) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
/** Ceiling height from the room's walls (designer scenes carry wall heights, not ceilings). */
export const roomHeight = (scene: Scene, roomId: string) => Math.max(0, ...roomWalls(scene, roomId).map(w => w.height ?? 0)) || 2.7;

/** Hard problems in finishes/lighting, one line each. */
export function checkSurfaces(scene: Scene, draft: Draft): string[] {
  const problems: string[] = [], rooms = new Set(scene.rooms.map(room => room.id)), seen = new Set<string>();
  const items = [...scene.items, ...draft.items];
  (draft.finishes ?? []).forEach((finish, index) => {
    const at = `finishes[${index}] ${finish.room_id ?? '?'} ${finish.surface ?? '?'}`;
    const keys = extra(finish, allowed.finish);
    if (keys.length) problems.push(`${at}: unknown keys ${keys.join(', ')}`);
    if (!rooms.has(finish.room_id)) problems.push(`${at}: unknown room`);
    if (!['floor', 'walls', 'wall', 'ceiling'].includes(finish.surface)) { problems.push(`${at}: surface must be floor, walls, wall or ceiling`); return; }
    if (finish.surface === 'wall') {
      const wall = scene.walls.find(w => w.id === finish.wall_id);
      const physical = wall && (wall.source_id ?? wall.id);
      if (!wall || !roomWalls(scene, finish.room_id).some(w => (w.source_id ?? w.id) === physical)) problems.push(`${at}: wall_id ${finish.wall_id ?? '(missing)'} does not bound ${finish.room_id}`);
    } else if (finish.wall_id !== undefined) problems.push(`${at}: wall_id only with surface "wall"`);
    if (finish.material === undefined && finish.color === undefined) problems.push(`${at}: needs material or color`);
    if (finish.color !== undefined && !HEX.test(finish.color)) problems.push(`${at}: color must be #RRGGBB`);
    if (finish.material !== undefined) {
      const info = material(finish.material);
      if (!info) problems.push(`${at}: unknown material ${finish.material} (see ./varpet materials)`);
      else if (finish.surface === 'floor' ? info.category !== 'floor' : info.category !== 'wall') problems.push(`${at}: ${info.id} is a ${info.category} material`);
    }
    const key = `${finish.room_id}|${finish.surface}|${finish.surface === 'wall' ? physicalWall(scene, finish.wall_id ?? '') : ''}`;
    if (seen.has(key)) problems.push(`${at}: duplicate finish for the same surface`);
    seen.add(key);
  });
  const ceilings = new Set<string>(), ids = new Set(items.map(item => item.id));
  (draft.lighting ?? []).forEach((light, index) => {
    const at = `lighting[${index}] ${light.room_id ?? '?'} ${(light as FixtureLight).id ?? light.type ?? '?'}`;
    const room = scene.rooms.find(candidate => candidate.id === light.room_id);
    if (!room) problems.push(`${at}: unknown room`);
    if (light.type === 'ceiling') {
      const keys = extra(light, allowed.ceiling);
      if (keys.length) problems.push(`${at}: unknown keys ${keys.join(', ')}`);
      if (!CEILING_STYLES.includes(light.style)) problems.push(`${at}: style must be ${CEILING_STYLES.join(', ')}`);
      if (ceilings.has(light.room_id)) problems.push(`${at}: one ceiling design per room`);
      ceilings.add(light.room_id);
      if (light.brightness !== undefined && !num(light.brightness, 0, 100)) problems.push(`${at}: brightness is 0..100 %`);
      if (light.temperature_k !== undefined && !num(light.temperature_k, 2200, 6500)) problems.push(`${at}: temperature_k is 2200..6500`);
    } else if (light.type === 'fixture') {
      const keys = extra(light, allowed.fixture);
      if (keys.length) problems.push(`${at}: unknown keys ${keys.join(', ')}`);
      if (typeof light.id !== 'string' || !light.id) problems.push(`${at}: needs an id`);
      else if (ids.has(light.id)) problems.push(`${at}: id already used`);
      ids.add(light.id);
      if (!['pendant', 'ceiling', 'wall'].includes(light.mount)) { problems.push(`${at}: mount must be pendant, ceiling or wall`); return; }
      if (!Array.isArray(light.pos) || light.pos.length !== 2 || !light.pos.every(v => Number.isFinite(v))) { problems.push(`${at}: pos must be [x, y]`); return; }
      if (room && !inPolygon(light.pos, room.polygon)) problems.push(`${at}: pos (${light.pos.join(', ')}) is outside the room`);
      if (light.size !== undefined && !(Array.isArray(light.size) && light.size.length === 3 && light.size.every(v => num(v, 0.02, 2)))) problems.push(`${at}: size is [w, d, h] metres`);
      if (light.brightness !== undefined && !num(light.brightness, 100, 5000)) problems.push(`${at}: brightness is 100..5000 lumens`);
      if (light.temperature_k !== undefined && !num(light.temperature_k, 2200, 6500)) problems.push(`${at}: temperature_k is 2200..6500`);
      if (light.color !== undefined && !HEX.test(light.color)) problems.push(`${at}: color must be #RRGGBB`);
      const ceiling = roomHeight(scene, light.room_id), size = light.size ?? FIXTURE_DEFAULTS[light.mount].size, bottom = fixtureBottom(light, items, ceiling);
      if (bottom + size[2] > ceiling + 1e-6 || bottom < 0.3) problems.push(`${at}: height ${bottom.toFixed(2)} m does not fit under the ${ceiling} m ceiling`);
      const under = itemUnder(items, light.pos);
      if (light.mount === 'pendant' && bottom < 1.95 && !(under && under.size[2] < 1.2)) problems.push(`${at}: pendant bottom ${bottom.toFixed(2)} m is below head height and not over a table or bed`);
    } else problems.push(`${at}: type must be ceiling or fixture`);
  });
  return problems;
}

const polygonArea = (polygon: Vec2[]) => Math.abs(polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]!; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
/** Quantities for finish work. The editor presets carry no supplier price, so this is unquoted. */
export function surfaceQuantities(scene: Scene, draft: Draft): string[] {
  const lines: string[] = [];
  for (const finish of draft.finishes ?? []) {
    const room = scene.rooms.find(candidate => candidate.id === finish.room_id);
    if (!room) continue;
    const walls = finish.surface === 'walls' ? roomWalls(scene, room.id) : finish.surface === 'wall' ? roomWalls(scene, room.id).filter(w => (w.source_id ?? w.id) === physicalWall(scene, finish.wall_id ?? '')) : [];
    const openings = scene.openings.filter(o => walls.some(w => w.id === o.wall_id)).reduce((sum, o) => sum + o.width * o.height, 0);
    const area = finish.surface === 'floor' || finish.surface === 'ceiling' ? polygonArea(room.polygon)
      : walls.reduce((sum, w) => sum + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) * (w.height ?? 2.7), 0) - openings;
    lines.push(`${room.id} ${finish.surface}${finish.wall_id ? ' ' + finish.wall_id : ''}: ${area.toFixed(1)} m2 ${finish.material ?? 'paint'}${finish.color ? ' ' + finish.color : ''}`);
  }
  for (const light of draft.lighting ?? []) lines.push(light.type === 'ceiling' ? `${light.room_id} ceiling design ${light.style}` : `${light.room_id} ${light.mount} light ${light.id}`);
  return lines;
}

/** One line per finish/light for the brief. */
export function describeSurfaces(scene: Scene, draft: Draft): string[] {
  const lines: string[] = [];
  for (const finish of draft.finishes ?? []) {
    const info = material(finish.material);
    lines.push(`  ${finish.room_id} ${finish.surface}${finish.wall_id ? ` ${finish.wall_id}` : ''}: ${info ? info.look : 'paint'}${finish.color ? ` tinted ${finish.color}` : ''}`);
  }
  for (const light of draft.lighting ?? []) {
    if (light.type === 'ceiling') lines.push(`  ${light.room_id} ceiling design ${light.style}, ${light.brightness ?? 'default'} %, ${light.temperature_k ?? 'default'} K`);
    else {
      const bottom = fixtureBottom(light, [...scene.items, ...draft.items], roomHeight(scene, light.room_id));
      lines.push(`  ${light.room_id} ${light.mount} ${light.id} at (${light.pos.map(v => v.toFixed(2)).join(', ')}) bottom ${bottom.toFixed(2)} m, ${light.brightness ?? FIXTURE_DEFAULTS[light.mount].brightness} lm, ${light.temperature_k ?? 2700} K`);
    }
  }
  return lines;
}
