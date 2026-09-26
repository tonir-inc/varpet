import type { CatalogAsset, SceneDocument, Vec2 } from '../contracts';
import type { BuildingComponent } from '../renovation-contracts';
import { createApartmentStore } from '../core/apartment-store';
import { migrateScene } from '../core/renovation';

function inside([x, z]: Vec2, polygon: Vec2[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!, [xj, zj] = polygon[j]!;
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * A finished architect run as the project the editor opens (Import project JSON / Load saved scene):
 * the v1 export migrated like a live reconstruction, fixtures as existing building components, then
 * opened in the same apartment store the editor uses, which throws the editor's own validation errors.
 */
export function architectProject(v1: SceneDocument, components: BuildingComponent[], assets: CatalogAsset[]): SceneDocument {
  const scene = migrateScene(v1);
  scene.project!.currency = 'AMD';
  scene.project!.components = components.map(input => {
    const component: BuildingComponent = { ...structuredClone(input), phase: 'existing' };
    if (!component.host) {
      const room = scene.rooms.find(r => inside([component.position[0], component.position[2]], r.polygon));
      if (!room) throw new Error(`Cannot open scene: Component “${component.id}” lies outside every room.`);
      component.roomId ??= room.id;
    }
    return component;
  });
  createApartmentStore(scene, assets);
  return scene;
}
