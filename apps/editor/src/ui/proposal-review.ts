import type { CatalogAsset, SceneDocument, SceneObject, Vec2 } from '../contracts';

/** Pure helpers for a previewed designer proposal and for things the customer attaches to a message. No DOM. */

export type EntityKind = 'furniture' | 'wall' | 'room' | 'opening' | 'component';
/** Something in the flat attached to a message to the designer, e.g. a sofa or a wall. */
export interface DesignerEntity { id: string; kind: EntityKind; label: string; room?: string }

const inside = ([x, z]: Vec2, polygon: Vec2[]) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!, [xj, zj] = polygon[j]!;
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
};
const roomAt = (scene: SceneDocument, point: Vec2) => scene.rooms.find(room => inside(point, room.polygon));

/** The room a wall belongs to: the first room found just off its midpoint, on either side. */
function wallRoom(scene: SceneDocument, wallId: string) {
  const wall = scene.walls.find(item => item.id === wallId);
  if (!wall) return undefined;
  const mx = (wall.start[0] + wall.end[0]) / 2, mz = (wall.start[1] + wall.end[1]) / 2;
  const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz) || 1;
  const nx = -dz / length, nz = dx / length, off = wall.thickness / 2 + 0.2;
  return roomAt(scene, [mx + nx * off, mz + nz * off]) ?? roomAt(scene, [mx - nx * off, mz - nz * off]);
}

const clip = (text: string, length: number) => text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
/** "Sofa Kivik": a short piece name with its product; a name that already is the product stays as it is. */
function pieceLabel(object: SceneObject, catalog: CatalogAsset[]) {
  const name = object.name.trim(), product = catalog.find(asset => asset.id === object.assetId)?.name?.trim();
  const same = !product || name.length > 20 && product.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(product.toLowerCase());
  return same || name.length > 24 ? clip(name, 56) : `${name} ${clip(product!, 36)}`;
}

/** Anything the customer can point at, by id, with the room it is in. */
export function describeEntity(scene: SceneDocument, id: string, catalog: CatalogAsset[] = []): DesignerEntity | undefined {
  const named = (entity: DesignerEntity, room?: { name: string }) => room && room.name !== entity.label ? { ...entity, room: room.name } : entity;
  const object = scene.objects.find(item => item.id === id);
  if (object) return named({ id, kind: 'furniture', label: pieceLabel(object, catalog) }, roomAt(scene, [object.position[0], object.position[2]]));
  const room = scene.rooms.find(item => item.id === id);
  if (room) return { id, kind: 'room', label: room.name };
  const wallIndex = scene.walls.findIndex(item => item.id === id);
  if (wallIndex >= 0) return named({ id, kind: 'wall', label: scene.project?.metadata[id]?.name ?? `Wall ${wallIndex + 1}` }, wallRoom(scene, id));
  const host = scene.walls.find(wall => wall.openings.some(item => item.id === id));
  const opening = host?.openings.find(item => item.id === id);
  if (host && opening) return named({ id, kind: 'opening', label: scene.project?.metadata[id]?.name ?? (opening.kind === 'door' ? 'Door' : 'Window') }, wallRoom(scene, host.id));
  const component = scene.project?.components.find(item => item.id === id);
  if (component) return named({ id, kind: 'component', label: component.name }, component.roomId ? scene.rooms.find(item => item.id === component.roomId) : undefined);
  return undefined;
}

/** The block a message carries for the designer: ids first, so it can act on them. Empty without entities. */
export function entityBlock(entities: DesignerEntity[]): string {
  if (!entities.length) return '';
  return `\n\nAttached: ${entities.map(entity => `${entity.id} (${[entity.kind, entity.label, entity.room].filter(Boolean).join(', ')})`).join('; ')}`;
}

export interface ProposalArrival { roomId: string | null; ids: string[]; elsewhere: string[]; added: string[] }

/**
 * How a previewed proposal arrives: the room it changes most (pieces added, swapped, moved or removed, finishes),
 * the new pieces there, and the new pieces elsewhere. `shown` are pieces an earlier preview of the same turn
 * already brought (partial rooms, a revision): they do not arrive again, and the room with the most new pieces wins.
 */
export function proposalArrival(before: SceneDocument, after: SceneDocument, shown: ReadonlySet<string> = new Set()): ProposalArrival {
  const was = new Map(before.objects.map(object => [object.id, object]));
  const now = new Set(after.objects.map(object => object.id));
  const changes = new Map<string | null, number>(), fresh = new Map<string | null, string[]>();
  const count = (room: string | null) => changes.set(room, (changes.get(room) ?? 0) + 1);
  const added: string[] = [];
  for (const object of after.objects) {
    const old = was.get(object.id), room = roomAt(after, [object.position[0], object.position[2]])?.id ?? null;
    if (!old || old.assetId !== object.assetId) {
      added.push(object.id); count(room);
      if (!shown.has(object.id)) fresh.set(room, [...(fresh.get(room) ?? []), object.id]);
    } else if (old.position.some((value, axis) => Math.abs(value - object.position[axis]!) > 0.01) || Math.abs(old.rotation - object.rotation) > 0.02) count(room);
  }
  for (const object of before.objects) if (!now.has(object.id)) count(roomAt(before, [object.position[0], object.position[2]])?.id ?? null);
  const finishes = new Map((before.project?.finishes ?? []).map(finish => [`${finish.entityId}|${finish.surface}`, finish.materialId]));
  for (const finish of after.project?.finishes ?? []) {
    if (finishes.get(`${finish.entityId}|${finish.surface}`) === finish.materialId) continue;
    count(after.rooms.some(room => room.id === finish.entityId) ? finish.entityId : wallRoom(after, finish.entityId)?.id ?? null);
  }
  const rank = shown.size ? (room: string | null) => fresh.get(room)?.length ?? 0 : (room: string | null) => changes.get(room) ?? 0;
  const rooms = [...changes.keys()].filter(room => room !== null && rank(room) > 0).sort((a, b) => rank(b) - rank(a));
  const roomId = rooms[0] ?? ([...changes.keys()].filter(room => room !== null).sort((a, b) => (changes.get(b) ?? 0) - (changes.get(a) ?? 0))[0] ?? null);
  const ids = fresh.get(roomId) ?? [];
  const elsewhere = [...fresh].filter(([room]) => room !== roomId).flatMap(([, list]) => list);
  return { roomId, ids, elsewhere, added };
}
