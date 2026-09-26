import { demoScene } from './demo';
import { migrateScene } from './renovation';

/** Keep the editable shell; furnishing now comes exclusively from the database. */
export function createInitialScene() {
  const scene = migrateScene({ ...structuredClone(demoScene), objects: [] });
  scene.project!.currency = 'AMD';
  return scene;
}
