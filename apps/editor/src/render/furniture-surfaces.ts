import * as THREE from 'three';
import type { SceneObject } from '../contracts';
import { headlessSurface, isDescendant, supportContains, type FurnitureSurfaceResolver } from '../core/furniture-support';
import { wallDecoration } from '../core/decoration-placement';

/** Raycast only model meshes, excluding previews, helpers, the moving item and its dependants. */
export function createFurnitureSurfaceResolver(model: (id: string) => THREE.Object3D | undefined): FurnitureSurfaceResolver {
  const ray = new THREE.Raycaster(), normal = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  return (scene, catalog, object, supportId, ceiling = 1000) => {
    let best: { id: string; y: number } | null = null;
    for (const support of scene.objects) {
      if (support.id === object.id || (supportId && support.id !== supportId) || isDescendant(scene, support.id, object.id) || scene.project?.metadata[support.id]?.phase === 'remove') continue;
      const asset = catalog.find(a => a.id === support.assetId);
      if (!asset || wallDecoration(asset) || support.hangsFrom || asset.kind === 'rug' || !supportContains(support, asset, object)) continue;
      const root = model(support.id);
      if (!root) {
        const fallback = headlessSurface(scene, catalog, object, support.id, ceiling);
        if (fallback && (!best || fallback.y > best.y)) best = fallback;
        continue;
      }
      // Model geometry is base-centred. Use the command snapshot's transform, not an animation pose.
      const savedParent = root.parent, savedPosition = root.position.clone(), savedQuaternion = root.quaternion.clone(), savedScale = root.scale.clone();
      root.removeFromParent(); root.position.fromArray(support.position); root.rotation.set(0, support.rotation, 0); root.scale.fromArray(support.scale); root.updateMatrixWorld(true);
      try {
        ray.set(new THREE.Vector3(object.position[0], ceiling, object.position[2]), new THREE.Vector3(0, -1, 0));
        for (const hit of ray.intersectObject(root, true)) {
          if (!(hit.object instanceof THREE.Mesh) || !hit.face) continue;
          normal.copy(hit.face.normal).applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld));
          if (normal.y < .35 || hit.point.y <= support.position[1] + 1e-5) continue;
          if (!best || hit.point.y > best.y) best = { id: support.id, y: hit.point.y };
          break;
        }
      } finally {
        root.position.copy(savedPosition); root.quaternion.copy(savedQuaternion); root.scale.copy(savedScale); savedParent?.add(root); root.updateMatrixWorld(true);
      }
    }
    return best;
  };
}

/** Pick the visible furniture surface first, then cast vertically from just above it. */
export function furniturePointerSurface(ray: THREE.Raycaster, roots: THREE.Object3D[]): THREE.Vector3 | undefined {
  for (const root of roots) root.updateWorldMatrix(true, true);
  const hit = ray.intersectObjects(roots, true).find(hit => hit.object instanceof THREE.Mesh);
  return hit?.point.clone();
}
