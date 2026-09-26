import type { CatalogAsset, SceneDocument, SceneObject, Vec2, Vec3 } from '../contracts';
import { floorSupported, objectFootprint, polygonsOverlap, wallCollision } from './validation';

/** Click-add suggestions are derived from this apartment, including translated and concave rooms. */
export function suggestFurniturePosition(scene: SceneDocument, catalog: CatalogAsset[], object: SceneObject, preferredRoomId?: string, preferred?: Vec2): Vec3 | null {
  const asset = catalog.find(item => item.id === object.assetId);
  if (!asset) return null;
  const rooms = scene.rooms.filter(room => scene.project?.metadata[room.id]?.phase !== 'remove'
    && (scene.version === 1 || Math.abs(scene.project?.metadata[room.id]?.elevation ?? 0) < 1e-5));
  rooms.sort((a, b) => Number(b.id === preferredRoomId) - Number(a.id === preferredRoomId));
  const points: Vec2[] = preferred ? [preferred] : [];
  for (const room of rooms) {
    const xs = room.polygon.map(point => point[0]), zs = room.polygon.map(point => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const center: Vec2 = [(minX + maxX) / 2, (minZ + maxZ) / 2];
    points.push(center);
    // Sample the actual bounds, near the centre first. A concave room's centre
    // can lie outside its floor, so it must never be the only candidate.
    const samples: Vec2[] = [];
    for (let x = 1; x < 10; x++) for (let z = 1; z < 10; z++) samples.push([minX + (maxX - minX) * x / 10, minZ + (maxZ - minZ) * z / 10]);
    samples.sort((a, b) => Math.hypot(a[0] - center[0], a[1] - center[1]) - Math.hypot(b[0] - center[0], b[1] - center[1]));
    points.push(...samples);
  }
  const byId = new Map(catalog.map(item => [item.id, item]));
  const obstacles = scene.objects.filter(other => scene.project?.metadata[other.id]?.phase !== 'remove')
    .flatMap(other => { const otherAsset = byId.get(other.assetId); return otherAsset && otherAsset.kind !== 'rug' ? [{ other, asset: otherAsset, footprint: objectFootprint(other, otherAsset) }] : []; });
  const seen = new Set<string>();
  let fallback: Vec3 | null = null;
  for (const point of points) {
    // Try the editor grid, then the exact room sample so narrow imported floors
    // between grid lines can still receive correctly sized furniture.
    for (const [x, z] of [[Math.round(point[0] * 4) / 4, Math.round(point[1] * 4) / 4], point]) {
      const key = `${x},${z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const position: Vec3 = [x!, 0, z!], candidate = { ...object, position };
      if (!floorSupported(candidate, asset, scene)) continue;
      const footprint = objectFootprint(candidate, asset);
      const wall = scene.walls.some(item => scene.project?.metadata[item.id]?.phase !== 'remove'
        && wallCollision(candidate, asset, item, footprint, scene.project?.metadata[item.id]?.elevation ?? 0));
      if (wall && scene.version === 1) continue;
      fallback ??= position;
      const overlap = asset.kind !== 'rug' && obstacles.some(other => other.other.position[1] < asset.dimensions[1] * object.scale[1]
        && other.other.position[1] + other.asset.dimensions[1] * other.other.scale[1] > 0 && polygonsOverlap(footprint, other.footprint));
      if (!wall && !overlap) return position;
    }
  }
  // Renovation free editing preserves wall/overlap warnings, but an add always
  // needs a supported floor. The host still commits through validateScene.
  return fallback;
}
