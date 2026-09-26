import { furnitureDimensions } from './furniture-bounds';
import type { CatalogAsset, SceneDocument, SceneObject } from '../contracts';
import { pointInPolygon } from './validation';

export function wallDecoration(asset: CatalogAsset): boolean {
  return asset.kind === 'wall_art' || asset.kind === 'mirror' || (asset.kind === 'decor' && /\b(clock|wall hanging)\b/i.test(asset.name));
}

/** Wall tangent and inward normal use the same XZ convention as component hosts. */
export function mountDecoration(scene: SceneDocument, object: SceneObject, asset: CatalogAsset): SceneObject {
  if (!asset || !wallDecoration(asset)) return object;
  const [width, height, depth] = furnitureDimensions({ ...object, host: { wallId: '', offset: 0, elevation: 0, side: 1 } }, asset);
  let best: SceneObject | undefined, distance = Infinity;
  for (const wall of scene.walls) {
    if (scene.project?.metadata[wall.id]?.phase === 'remove') continue;
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    if (length < width!) continue;
    const tx = dx / length, tz = dz / length;
    const offset = Math.max(width! / 2, Math.min(length - width! / 2, (object.position[0] - wall.start[0]) * tx + (object.position[2] - wall.start[1]) * tz));
    const x = wall.start[0] + tx * offset, z = wall.start[1] + tz * offset;
    for (const side of [1, -1] as const) {
      const nx = -tz * side, nz = tx * side, gap = wall.thickness / 2 + depth! / 2;
      const px = x + nx * gap, pz = z + nz * gap;
      const room = scene.rooms.find(room => scene.project?.metadata[room.id]?.phase !== 'remove' && pointInPolygon([x + nx * (gap + .01), z + nz * (gap + .01)], room.polygon));
      if (!room) continue;
      const floor = scene.project?.metadata[room.id]?.elevation ?? 0;
      const elevation = floor + (asset.kind === 'mirror' && asset.dimensions[1] * object.scale[1] > 1.4 ? 0 : Math.max(.9, 1.5 - height! / 2));
      if (elevation + height! > (scene.project?.metadata[wall.id]?.elevation ?? 0) + wall.height + 1e-5) continue;
      const dist = Math.hypot(px - object.position[0], pz - object.position[2]);
      if (dist >= distance) continue;
      distance = dist;
      best = { ...object, position: [px, elevation, pz], rotation: Math.atan2(nx, nz) || 0, host: { wallId: wall.id, offset, elevation, side } };
    }
  }
  if (!best) throw new Error('No wall with enough space is available for this decoration.');
  return best;
}
