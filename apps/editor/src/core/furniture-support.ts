import type { CatalogAsset, SceneDocument, SceneObject } from '../contracts';
import { mountDecoration, wallDecoration } from './decoration-placement';
import { objectFootprint, pointInPolygon } from './validation';

export interface SurfaceHit { id: string; y: number }
/** undefined means geometry unavailable; null means geometry exists but there is no surface. */
export type FurnitureSurfaceResolver = (scene: SceneDocument, catalog: CatalogAsset[], object: SceneObject, supportId?: string, ceiling?: number) => SurfaceHit | null | undefined;

export function canRestOnFurniture(asset: CatalogAsset): boolean {
  if (wallDecoration(asset)) return false;
  if (['decor', 'plant', 'lamp'].includes(asset.kind)) return true;
  return ['microwave', 'monitor', 'computer', 'laptop', 'speaker', 'printer', 'game_console', 'fan'].includes(asset.kind)
    && asset.dimensions.every(size => size <= 1);
}
export function floorHeight(scene: SceneDocument, object: SceneObject): number {
  const room = scene.rooms.find(r => scene.project?.metadata[r.id]?.phase !== 'remove' && pointInPolygon([object.position[0], object.position[2]], r.polygon));
  return scene.project?.metadata[room?.id ?? '']?.elevation ?? 0;
}
export function supportContains(support: SceneObject, asset: CatalogAsset, object: SceneObject): boolean {
  return pointInPolygon([object.position[0], object.position[2]], objectFootprint(support, asset));
}
export function isDescendant(scene: SceneDocument, id: string, ancestor: string): boolean {
  const seen = new Set<string>();
  let current = scene.objects.find(o => o.id === id);
  while (current?.restsOn) {
    if (current.restsOn === ancestor || seen.has(current.restsOn)) return true;
    seen.add(current.restsOn); current = scene.objects.find(o => o.id === current!.restsOn);
  }
  return false;
}
export const headlessSurface: FurnitureSurfaceResolver = (scene, catalog, object, supportId, ceiling = Infinity) => {
  let hit: SurfaceHit | null = null;
  for (const support of scene.objects) {
    if (support.id === object.id || (supportId && support.id !== supportId) || isDescendant(scene, support.id, object.id) || scene.project?.metadata[support.id]?.phase === 'remove') continue;
    const asset = catalog.find(a => a.id === support.assetId);
    if (!asset || wallDecoration(asset) || asset.kind === 'rug' || !supportContains(support, asset, object)) continue;
    const height = asset.kind === 'sofa' || asset.kind === 'chair' ? Math.min(.45, asset.dimensions[1]) : asset.kind === 'bed' ? Math.min(.55, asset.dimensions[1]) : asset.dimensions[1];
    const y = support.position[1] + height * support.scale[1];
    if (y <= ceiling + .001 && (!hit || y > hit.y)) hit = { id: support.id, y };
  }
  return hit;
};

export function placeFurniture(scene: SceneDocument, catalog: CatalogAsset[], object: SceneObject, on?: string | null, resolver?: FurnitureSurfaceResolver, ceiling?: number): SceneObject {
  if (!Array.isArray(object.position) || object.position.length !== 3 || !object.position.every(v => Number.isFinite(v) && Math.abs(v) <= 100)
    || !Array.isArray(object.scale) || object.scale.length !== 3 || !object.scale.every(v => Number.isFinite(v) && v >= .1 && v <= 4)
    || !Number.isFinite(object.rotation) || Math.abs(object.rotation) > Math.PI * 100) throw new Error('Furniture needs a finite, in-range transform.');
  const asset = catalog.find(a => a.id === object.assetId);
  if (!asset) return object; // Standard validation reports the unknown asset.
  if (wallDecoration(asset)) {
    if (on) throw new Error('Wall decorations cannot rest on furniture.');
    const mounted = mountDecoration(scene, object, asset); delete mounted.restsOn; return mounted;
  }
  if (on && !canRestOnFurniture(asset)) throw new Error('Large furniture cannot rest on other furniture.');
  if (!canRestOnFurniture(asset)) return object;
  const next = { ...object, position: [...object.position] as SceneObject['position'] };
  delete next.host; delete next.restsOn;
  if (on === null) { next.position[1] = floorHeight(scene, next); return next; }
  if (on && (!scene.objects.some(o => o.id === on) || on === object.id || isDescendant(scene, on, object.id))) throw new Error(`Invalid furniture support “${on}”.`);
  const resolved = resolver?.(scene, catalog, next, on, ceiling);
  const hit = resolved === undefined ? headlessSurface(scene, catalog, next, on, ceiling) : resolved;
  if (hit) {
    const support = scene.objects.find(o => o.id === hit.id), supportAsset = catalog.find(a => a.id === support?.assetId);
    if (!support || !supportAsset || !supportContains(support, supportAsset, next) || !Number.isFinite(hit.y)) throw new Error('No supporting surface under the requested footprint centre.');
    next.restsOn = hit.id; next.position[1] = hit.y;
  } else {
    if (on) throw new Error(`No supporting surface on “${on}” under the requested footprint centre.`);
    next.position[1] = floorHeight(scene, next);
  }
  return next;
}

/** Apply the support's rigid delta recursively; explicit children in this edit are not moved twice. */
export function followSupports(before: SceneDocument, after: SceneDocument, explicit: Set<string>, catalog: CatalogAsset[]): void {
  const done = new Set(explicit);
  function follow(object: SceneObject): void {
    if (done.has(object.id)) return;
    done.add(object.id);
    if (!object.restsOn) return;
    const oldParent = before.objects.find(o => o.id === object.restsOn);
    const parent = after.objects.find(o => o.id === object.restsOn);
    if (!parent) { delete object.restsOn; object.position[1] = floorHeight(after, object); return; }
    follow(parent);
    if (!oldParent) return;
    const delta = parent.rotation - oldParent.rotation, c = Math.cos(delta), s = Math.sin(delta);
    const dx = object.position[0] - oldParent.position[0], dz = object.position[2] - oldParent.position[2];
    object.position = [parent.position[0] + c * dx + s * dz, object.position[1] + parent.position[1] - oldParent.position[1], parent.position[2] - s * dx + c * dz];
    object.rotation += delta;
    if (parent.scale.some((v, i) => v !== oldParent.scale[i])) {
      const hit = headlessSurface(after, catalog, object, parent.id);
      if (hit) object.position[1] = hit.y;
    }
  }
  after.objects.forEach(follow);
}
