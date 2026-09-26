import { furnitureDimensions } from './furniture-bounds';
import type { CatalogAsset, SceneDocument, SceneObject } from '../contracts';
import { pointInPolygon } from './validation';
import { hasRoomCeiling, roomCeilingHeight } from './heights';

/** A curtain's top (its rod) sits this far below the ceiling. */
export const CURTAIN_ROD_GAP = 0.03;

export function wallDecoration(asset: CatalogAsset): boolean {
  return asset.kind === 'wall_art' || asset.kind === 'mirror' || asset.kind === 'curtain' || (asset.kind === 'decor' && /\b(clock|wall hanging)\b/i.test(asset.name));
}

/** Hanging planters hang from the ceiling; wall, deck and railing planters do not. */
export function hangsFromCeiling(asset: CatalogAsset): boolean {
  return (asset.kind === 'plant' || asset.kind === 'decor')
    && (/\bhanging\b/i.test(asset.name) || /(^|:)hanging-/i.test(asset.id))
    && /\b(plant|planter|pot|basket)s?\b/i.test(asset.name)
    && !/\b(wall|deck|rail|railing|balcony|print|art)\b/i.test(asset.name);
}

const activeRoomAt = (scene: SceneDocument, x: number, z: number) =>
  scene.rooms.find(room => scene.project?.metadata[room.id]?.phase !== 'remove' && pointInPolygon([x, z], room.polygon));

/** Top of the item touches the room's ceiling; the footprint centre stays where it was asked. */
export function hangFromCeiling(scene: SceneDocument, object: SceneObject, asset: CatalogAsset): SceneObject {
  const room = activeRoomAt(scene, object.position[0], object.position[2]);
  if (!room) throw new Error('Hang this plant inside a room.');
  if (!hasRoomCeiling(scene, room)) throw new Error('This outdoor space has no ceiling to hang a plant from.');
  const floor = scene.project?.metadata[room.id]?.elevation ?? 0;
  const y = floor + roomCeilingHeight(scene, room) - furnitureDimensions(object, asset)[1];
  if (!(y >= floor)) throw new Error('This hanging plant is taller than the room.');
  const next: SceneObject = { ...object, position: [object.position[0], y, object.position[2]], hangsFrom: 'ceiling' };
  delete next.host; delete next.restsOn;
  return next;
}

/** Wall tangent and inward normal use the same XZ convention as component hosts. */
export function mountDecoration(scene: SceneDocument, object: SceneObject, asset: CatalogAsset): SceneObject {
  if (!asset || !wallDecoration(asset)) return object;
  const curtain = asset.kind === 'curtain';
  const [width, height, depth] = furnitureDimensions({ ...object, host: { wallId: '', offset: 0, elevation: 0, side: 1 } }, asset);
  let best: SceneObject | undefined, distance = Infinity;
  for (const wall of scene.walls) {
    if (scene.project?.metadata[wall.id]?.phase === 'remove') continue;
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    if (length < width!) continue;
    const tx = dx / length, tz = dz / length;
    const along = (object.position[0] - wall.start[0]) * tx + (object.position[2] - wall.start[1]) * tz;
    // A curtain near a window centres on it.
    const window = curtain ? wall.openings.filter(o => o.kind === 'window' && along >= o.offset - width! / 2 && along <= o.offset + o.width + width! / 2)
      .sort((a, b) => Math.abs(a.offset + a.width / 2 - along) - Math.abs(b.offset + b.width / 2 - along))[0] : undefined;
    const offset = Math.max(width! / 2, Math.min(length - width! / 2, window ? window.offset + window.width / 2 : along));
    const x = wall.start[0] + tx * offset, z = wall.start[1] + tz * offset;
    const wallTop = (scene.project?.metadata[wall.id]?.elevation ?? 0) + wall.height;
    for (const side of [1, -1] as const) {
      const nx = -tz * side, nz = tx * side, gap = wall.thickness / 2 + depth! / 2;
      const px = x + nx * gap, pz = z + nz * gap;
      const room = activeRoomAt(scene, x + nx * (gap + .01), z + nz * (gap + .01));
      if (!room) continue;
      const floor = scene.project?.metadata[room.id]?.elevation ?? 0;
      let elevation: number, scale = object.scale;
      if (curtain) {
        // The rod sits just under the ceiling; a curtain longer than the drop is hemmed to reach the floor.
        const ceiling = hasRoomCeiling(scene, room) ? Math.min(wallTop, floor + roomCeilingHeight(scene, room)) : wallTop;
        const rod = ceiling - CURTAIN_ROD_GAP, drop = rod - floor;
        if (drop < .5) continue;
        if (asset.dimensions[1] * scale[1] > drop + 1e-6) scale = [scale[0], drop / asset.dimensions[1], scale[2]];
        if (scale[1] < .1) continue;
        elevation = rod - asset.dimensions[1] * scale[1];
      } else {
        elevation = floor + (asset.kind === 'mirror' && asset.dimensions[1] * object.scale[1] > 1.4 ? 0 : Math.max(.9, 1.5 - height! / 2));
        if (elevation + height! > wallTop + 1e-5) continue;
      }
      const dist = Math.hypot(px - object.position[0], pz - object.position[2]);
      if (dist >= distance) continue;
      distance = dist;
      best = { ...object, position: [px, elevation, pz], rotation: Math.atan2(nx, nz) || 0, scale, host: { wallId: wall.id, offset, elevation, side } };
    }
  }
  if (!best) throw new Error(curtain ? 'No wall with enough space is available for this curtain.' : 'No wall with enough space is available for this decoration.');
  delete best.hangsFrom;
  return best;
}
