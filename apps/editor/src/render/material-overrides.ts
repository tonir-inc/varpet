import * as THREE from 'three';
import type { CatalogAsset, SceneObject } from '../contracts';
import { materialSlotRole } from '../core/material-slots';

const BASE = 'varpetSlotBase';

/**
 * Tint a loaded model's slot materials with an object's per-role colours (textures stay; the colour multiplies them).
 * Colour only, so no program recompiles; the first override stores the model's own colour, which an absent role restores.
 * Returns whether any material changed.
 */
export function applyMaterialOverrides(model: THREE.Object3D, asset: CatalogAsset | undefined, materials: SceneObject['materials']): boolean {
  const slots = asset?.materialSlots;
  if (!slots) return false;
  let changed = false;
  model.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      const color = (material as THREE.MeshStandardMaterial).color;
      if (!(color instanceof THREE.Color)) continue;
      const role = materialSlotRole(slots, material.name);
      if (!role) continue;
      const override = materials?.[role];
      const base = material.userData[BASE] as THREE.Color | undefined;
      if (override) {
        if (!base) material.userData[BASE] = color.clone();
        const before = color.getHex();
        color.set(override);
        changed ||= color.getHex() !== before;
      } else if (base) {
        color.copy(base);
        delete material.userData[BASE];
        changed = true;
      }
    }
  });
  return changed;
}
