import type { CatalogAsset, SceneObject, Vec3 } from '../contracts';

/** Tall mirrors lean in local space; yaw remains the scene's only stored rotation. */
export function wallMirrorLean(object: SceneObject, asset: CatalogAsset): number {
  return object.host && asset.kind === 'mirror' && asset.dimensions[1] * object.scale[1] > 1.4 ? .06 : 0;
}
export function furnitureDimensions(object: SceneObject, asset: CatalogAsset): Vec3 {
  const angle = wallMirrorLean(object, asset), c = Math.cos(angle), s = Math.sin(angle);
  const [w, h, d] = asset.dimensions;
  return [w * object.scale[0], (h * c + d * s) * object.scale[1], (d * c + h * s) * object.scale[2]];
}
